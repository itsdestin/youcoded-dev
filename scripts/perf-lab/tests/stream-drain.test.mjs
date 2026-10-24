import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { missingAppDeps } from './app-deps.mjs';
// Existing desktop test dependency; no browser, app launch or new install. Skipped, with the reason, where the app's
// dependencies are not installed (tests/app-deps.mjs).
const skip = missingAppDeps(['jsdom']);
const test = (name, fn) => nodeTest(name, { skip }, fn);
const { JSDOM } = skip ? {} : createRequire(new URL('../../../youcoded/desktop/package.json', import.meta.url))('jsdom');
import { splitDeltas } from '../fake-provider.mjs';
import { receiptSource, readReceiptSource, stopReceiptSource, assessStreamDrain, buildDrainFixture, visibleDrainSource, waitForStreamDrain, waitForVisibleDrain, sessionVisibilitySource, finishStreamDiagnostic, beginStreamDiagnostic, revealStreamOutput, revealSelectionSource } from '../stream-drain.mjs';

function bridge(expected = 'alpha beta SDVEND', limits = {}) {
  let callback, removed = 0, now = 0;
  const context = vm.createContext({ TextEncoder, performance: { now: () => ++now }, document: { visibilityState: 'visible', querySelectorAll: () => [] },
    window: { claude: { on: { transcriptEvent: cb => { callback = cb; return cb; } }, off: (channel, handler) => { assert.equal(channel, 'transcript:event'); assert.equal(handler, callback); removed++; } } } });
  vm.runInContext(receiptSource({ sessionId: 'owned', expected, ...limits }), context);
  const event = (type, text, uuid, extra = {}) => callback({ sessionId: 'owned', uuid, type, data: { text, partId: 'text-0', ...extra } });
  return { context, event, emit: e => callback(e), read: () => JSON.parse(JSON.stringify(vm.runInContext(readReceiptSource(), context))), stop: () => vm.runInContext(stopReceiptSource(), context), removed: () => removed };
}
const producer = expected => ({ index: 0, stream: true, plannedDeltas: 3, deltasSent: 3, chars: expected.length, plannedText: expected, writtenTextChars: expected.length,
  contentWrites: 3, finishWritten: true, doneWritten: true, completed: true, aborted: false, backpressureWaits: 0, startedAt: 1, endedAt: 2, writeCompletedAt: 2, endRequested: true, endRequestedAt: 2, writeError: null, prematureClose: false });

test('diagnostic plan caps refuse before listener registration and real planned-text mismatch cannot be credited', async () => {
  const cdp = { evaluate: async () => { throw Error('should not register'); } };
  for (const perSec of [0, NaN, 1001, 1]) {
    await assert.rejects(beginStreamDiagnostic(cdp, {}, { leg: 'visible', sessionId: 'owned', deltas: 3000, perSec }), /bounded/);
  }
  await assert.rejects(beginStreamDiagnostic(cdp, { requests: [], plan() {}, plannedText: () => 'truncated' },
    { leg: 'visible', sessionId: 'owned', deltas: 3000, perSec: 150 }), /truncation/);
  assert.throws(() => receiptSource({ sessionId: 'owned', expected: 'x', maxEvents: 10001 }), /bounded/);
  assert.throws(() => receiptSource({ sessionId: 'owned', expected: 'x'.repeat(1048577) }), /bounded/);
});

test('emitted collector appends actual native part deltas and requires exact text plus terminal event', () => {
  const b = bridge();
  b.event('assistant-text', 'alpha', '1'); b.event('assistant-text', ' beta', '2'); b.event('assistant-text', ' SDVEND', '3');
  assert.equal(b.read().complete, false);
  b.event('turn-complete', undefined, '4', { stopReason: 'stop' });
  const r = b.read(); assert.equal(r.complete, true); assert.equal(r.text, 'alpha beta SDVEND');
  assert.equal(assessStreamDrain({ expected: r.text, producer: producer(r.text), receipt: r }).status, 'measured');
  b.stop(); assert.equal(b.removed(), 1); assert.equal(b.context.window.__perfStreamDrain, undefined);
});

test('cumulative replacement is not append semantics; duplicates, retry/drop, abort and missing session fail closed', () => {
  for (const mutate of [
    b => { b.event('assistant-text', 'alpha', '1'); b.event('assistant-text', 'alpha beta SDVEND', '2'); },
    b => { b.event('assistant-text', 'alpha beta SDVEND', '1'); b.event('assistant-text', 'alpha beta SDVEND', '1'); },
    b => { b.event('assistant-thinking', undefined, '1', { dropPart: { partIds: ['text-0'] } }); },
    b => { b.event('assistant-text', 'alpha', '1'); b.event('assistant-text', ' beta SDVEND', '2', { partId: 'replacement' }); },
    b => { b.event('user-interrupt', undefined, '1'); },
    b => { b.emit({ type: 'assistant-text', uuid: '1', data: { text: 'alpha beta SDVEND' } }); },
    b => { b.event('assistant-text', 'alpha beta SDVEND', '1', { deltaReferences: [{ eventUuid: 'x', start: 0, end: 1 }] }); },
  ]) {
    const b = bridge(); mutate(b); b.event('turn-complete', undefined, '9');
    assert.equal(b.read().complete, false); b.stop(); assert.equal(b.removed(), 1);
  }
});

test('wrong owned-session events are ignored and cannot satisfy receipt; corrupt middle with final marker fails exact equality', () => {
  const b = bridge(); b.emit({ sessionId: 'other', type: 'assistant-text', uuid: 'a', data: { text: 'alpha beta SDVEND' } });
  b.event('turn-complete', undefined, 'z'); assert.equal(b.read().complete, false);
  b.stop();
  const c = bridge(); c.event('assistant-text', 'alpha CORRUPTED SDVEND', '1'); c.event('turn-complete', undefined, '2');
  assert.equal(c.read().complete, false); c.stop();
});

test('event/text caps never silently truncate into a completed stream; stop is idempotent', () => {
  const b = bridge('abc', { maxEvents: 2 });
  b.event('assistant-text', 'a', '1'); b.event('assistant-text', 'b', '2'); b.event('assistant-text', 'c', '3'); b.event('turn-complete', undefined, '4');
  assert.equal(b.read().complete, false); assert.match(b.read().error, /cap/); b.stop(); b.stop(); assert.equal(b.removed(), 1);
  const c = bridge('abc', { maxBytes: 2 }); c.event('assistant-text', 'abc', '1'); assert.match(c.read().error, /cap/); c.stop();
});

test('producer abort/write incompleteness cannot pass even with complete receipt', () => {
  const b = bridge(); b.event('assistant-text', 'alpha beta SDVEND', '1'); b.event('turn-complete', undefined, '2');
  for (const change of [{ aborted: true }, { completed: false }, { writeError: 'write failed' }, { prematureClose: true }, { endRequested: false }, { doneWritten: false }, { contentWrites: 2 }, { index: null }]) {
    assert.equal(assessStreamDrain({ expected: 'alpha beta SDVEND', producer: { ...producer('alpha beta SDVEND'), ...change }, receipt: b.read() }).status, 'incomplete');
  }
  b.stop();
});

test('fixture has full plain normalized output and final marker; visible source scopes exact owned active assistant body', () => {
  const f = buildDrainFixture('hidden', 3000);
  assert.equal(f.text.split(' ').length, 3000); assert.ok(f.text.endsWith(f.marker));
  for (const leg of ['visible', 'switching', 'hidden']) {
    const plan = buildDrainFixture(leg, 3000);
    assert.equal(splitDeltas(plan.text, 3000).join(''), plan.text, 'real producer split must preserve full fixture and marker');
  }
  const src = visibleDrainSource('owned', f.text, f.marker);
  assert.ok(!/innerText|getBoundingClientRect/.test(src)); new Function(`return (${src})`);
  const body = { textContent: f.text }, pane = { getAttribute: () => 'owned', closest: () => null, querySelectorAll: () => [body] };
  const context = vm.createContext({ document: { visibilityState: 'visible', querySelectorAll: () => [pane] } });
  assert.equal(vm.runInContext(src, context).exact, true);
  body.textContent = f.text.replace('h0001', 'broken');
  assert.equal(vm.runInContext(src, context).exact, false);
});

test('actual hidden wrapper proof is session-scoped, document-visible, and not OS window hiding', async () => {
  const b = bridge();
  const owned = { getAttribute: () => 'owned', closest: () => ({}) }, other = { getAttribute: () => 'other', closest: () => null };
  b.context.document.querySelectorAll = () => [owned, other];
  const before = JSON.parse(JSON.stringify(vm.runInContext(sessionVisibilitySource('owned'), b.context)));
  assert.equal(before.hidden, true); assert.equal(before.activeSessionId, 'other');
  b.event('assistant-text', 'alpha beta SDVEND', '1'); b.event('turn-complete', undefined, '2');
  const cdp = { evaluate: async src => vm.runInContext(src, b.context) };
  const f = { text: 'alpha beta SDVEND', marker: 'SDVEND' };
  const p = producer(f.text), rec = { ...p, completionDiagnostic: { ...p } };
  const good = await finishStreamDiagnostic(cdp, { sessionId: 'owned', fixture: f, leg: 'hidden', requestIndex: 0, visibilityStart: before }, rec);
  assert.equal(good.status, 'measured', JSON.stringify(good));
  assert.equal(good.reducerQueue.available, false); assert.equal(good.osHiddenWindow, 'unsupported');
  assert.equal(good.producer.clock, 'producer-Date-now'); assert.equal(good.receipt.clock, 'renderer-performance-now');
});

test('request index mismatch and absent/visible owned-session hidden proof remain incomplete', async () => {
  for (const bad of ['request', 'missing', 'visible', 'document-hidden']) {
    const b = bridge();
    const owned = { getAttribute: () => 'owned', closest: () => bad === 'visible' ? null : ({}) }, other = { getAttribute: () => 'other', closest: () => null };
    b.context.document.querySelectorAll = () => bad === 'missing' ? [other] : [owned, other];
    if (bad === 'document-hidden') b.context.document.visibilityState = 'hidden';
    const proof = JSON.parse(JSON.stringify(vm.runInContext(sessionVisibilitySource('owned'), b.context)));
    b.event('assistant-text', 'alpha beta SDVEND', '1'); b.event('turn-complete', undefined, '2');
    const p = producer('alpha beta SDVEND');
    const result = await finishStreamDiagnostic({ evaluate: async src => vm.runInContext(src, b.context) },
      { sessionId: 'owned', fixture: { text: 'alpha beta SDVEND', marker: 'SDVEND' }, leg: 'hidden', requestIndex: bad === 'request' ? 1 : 0, visibilityStart: proof }, { ...p, completionDiagnostic: { ...p } });
    assert.equal(result.status, 'incomplete', bad);
    assert.equal(b.removed(), 1, bad);
  }
});

test('post-reveal full output polling times out on corrupt output; marker is insufficient', async () => {
  let time = 0, polls = 0;
  const cdp = { evaluate: async src => { assert.ok(!/\\.innerText|\\.getBoundingClientRect/.test(src)); polls++; return { exact: false, marker: true, documentVisibility: 'visible' }; } };
  const r = await waitForVisibleDrain(cdp, 'owned', { text: 'correct END', marker: 'END' }, { now: () => time, sleep: async ms => { time += ms; } });
  assert.equal(r.status, 'incomplete'); assert.equal(time, 10000); assert.ok(polls <= 101);
  assert.match(r.label, /NOT hidden reducer/);
});

// SessionStrip 2091: real button carries id/index; Tooltip supplies data-hint
// and aria-label, NOT title. Overflow 2399 is a drag div; ONLY its nested
// role=button/tabIndex=0/aria-label selection control owns the click (2485).
function stripDom({ pills = [], rows = [], menuDelay = 0 } = {}) {
  let time = 0, openedAt = null;
  const clicks = { pills: [], selections: [], wrappers: 0, triggers: 0 };
  const dom = new JSDOM('<div class="session-strip" data-session-strip></div><div id="portal"></div>');
  const document = dom.window.document, strip = document.querySelector('[data-session-strip]'), portal = document.querySelector('#portal');
  const node = (tag, attrs) => { const el = document.createElement(tag); for (const [key, value] of Object.entries(attrs)) if (value !== undefined) el.setAttribute(key, String(value)); return el; };
  const pillNodes = pills.map(({ id, idx, name = 'same name' }) => {
    const pill = node('button', { 'data-session-id': id, 'data-session-idx': idx, 'data-hint': name, 'aria-label': name });
    pill.addEventListener('click', () => clicks.pills.push(id)); strip.append(pill); return pill;
  });
  const rowNodes = rows.map(({ id, idx, name = 'same name', control = true }) => {
    const row = node('div', { 'data-session-id': id, 'data-session-idx': idx });
    // Actual outer row has drag/pointer behavior, not selection. This counter
    // catches an attempted direct wrapper click, not a bubbled child click.
    row.addEventListener('click', event => { if (event.target === row) clicks.wrappers++; });
    row.append(node('span', { 'data-menu-drag-grip': '', draggable: 'true' }));
    if (control) {
      const select = node('div', { role: 'button', tabindex: 0, 'aria-label': name });
      select.textContent = name;
      const rename = node('button', { 'aria-label': 'Rename session' }); select.append(rename);
      select.addEventListener('click', event => { if (event.target !== rename) clicks.selections.push(id); }); row.append(select);
    }
    return row;
  });
  const mountMenu = () => { if (openedAt !== null && time - openedAt >= menuDelay && !portal.children.length) portal.append(...rowNodes); };
  const trigger = node('button', { 'data-hint': 'All sessions', 'aria-label': 'All sessions' });
  trigger.addEventListener('click', () => { clicks.triggers++; openedAt = time; mountMenu(); }); strip.append(trigger);
  const context = vm.createContext({ performance: { now: () => time }, document, window: {} });
  return { context, clicks, now: () => time, advance: ms => { time += ms; mountMenu(); }, pillNodes };
}

test('actual pill id/index selects exact owned session despite colliding accessible names', () => {
  const dom = stripDom({ pills: [{ id: 'wrong', idx: 0 }, { id: 'owned', idx: 1 }] });
  const result = vm.runInContext(revealSelectionSource({ sessionId: 'owned', name: 'same name', idx: 1, sessionCount: 2, expiresAt: 100, action: 'select' }), dom.context);
  assert.equal(result.clicked, true); assert.deepEqual(dom.clicks.pills, ['owned']);
  assert.equal(dom.clicks.triggers, 0);
});

test('actual overflow waits for delayed menu and clicks inner selection control, never drag wrapper', async () => {
  const dom = stripDom({ pills: [{ id: 'wrong', idx: 0 }], rows: [{ id: 'wrong', idx: 0 }, { id: 'owned', idx: 1 }], menuDelay: 200 });
  const cdp = { evaluate: async src => src === 'performance.now()' ? dom.now() : src.includes('legacy stream reveal selection')
    ? vm.runInContext(src, dom.context) : { exact: true, marker: true, documentVisibility: 'visible' } };
  const result = await revealStreamOutput(cdp, 'owned', { text: 'correct END', marker: 'END' }, { idx: 1, name: 'same name', sessionCount: 2 },
    { now: dom.now, sleep: async ms => dom.advance(ms) });
  assert.equal(result.status, 'measured', JSON.stringify(result));
  assert.equal(dom.clicks.triggers, 1); assert.deepEqual(dom.clicks.selections, ['owned']);
  assert.equal(dom.clicks.wrappers, 0); assert.deepEqual(dom.clicks.pills, []);
});

test('current All sessions trigger works from Tooltip data-hint or accessible label without title', () => {
  for (const removed of ['data-hint', 'aria-label']) {
    const dom = stripDom();
    const trigger = dom.context.document.querySelector('button'); trigger.removeAttribute(removed);
    assert.equal(trigger.getAttribute('title'), null);
    const r = vm.runInContext(revealSelectionSource({ sessionId: 'owned', name: 'native', idx: 0, sessionCount: 1, expiresAt: 100, action: 'select' }), dom.context);
    assert.equal(r.menuOpened, true); assert.equal(dom.clicks.triggers, 1);
  }
});

test('wrong/missing/duplicate index and session identities never click unrelated pill or overflow control', () => {
  for (const rows of [[{ id: 'wrong', idx: 1 }], [{ id: 'owned', idx: 0 }], [{ id: 'owned', idx: undefined }],
    [{ id: 'owned', idx: 1 }, { id: 'wrong', idx: 1 }], [{ id: 'owned', idx: 1 }, { id: 'owned', idx: 0 }],
    [{ id: 'owned', idx: 1, control: false }], []]) {
    const dom = stripDom({ pills: [{ id: 'wrong', idx: 0 }], rows });
    vm.runInContext(revealSelectionSource({ sessionId: 'owned', name: 'same name', idx: 1, sessionCount: 2, expiresAt: 100, action: 'select' }), dom.context);
    const r = vm.runInContext(revealSelectionSource({ sessionId: 'owned', name: 'same name', idx: 1, sessionCount: 2, expiresAt: 100, action: 'menu-row' }), dom.context);
    assert.ok(r.error || r.pendingMenu); assert.deepEqual(dom.clicks.selections, []); assert.deepEqual(dom.clicks.pills, []);
    assert.equal(dom.clicks.wrappers, 0);
  }
  const wrongIndex = stripDom({ pills: [{ id: 'owned', idx: 0 }] });
  const r = vm.runInContext(revealSelectionSource({ sessionId: 'owned', name: 'same name', idx: 1, sessionCount: 2, expiresAt: 100, action: 'select' }), wrongIndex.context);
  assert.ok(r.error); assert.deepEqual(wrongIndex.clicks.pills, []);
});

test('new reveal uses synchronous deadline-checked selection, not existing async RAF/observer switch helper', async () => {
  const dom = stripDom({ pills: [{ id: 'owned', idx: 0, name: 'native' }] });
  const src = revealSelectionSource({ sessionId: 'owned', name: 'native', idx: 0, sessionCount: 1, expiresAt: 10, action: 'select' });
  assert.ok(!/requestAnimationFrame|MutationObserver|setTimeout|async|switchTo/.test(src));
  assert.equal(vm.runInContext(src, dom.context).clicked, true); assert.equal(dom.clicks.pills.length, 1);
  dom.advance(11);
  assert.equal(vm.runInContext(src, dom.context).expired, true); assert.equal(dom.clicks.pills.length, 1, 'late command must not click');
  const crossing = stripDom({ pills: [{ id: 'owned', idx: 0 }] });
  const query = crossing.context.document.querySelectorAll.bind(crossing.context.document);
  crossing.context.document.querySelectorAll = selector => {
    if (selector.includes('button[data-session-id]')) crossing.advance(11);
    return query(selector);
  };
  assert.equal(vm.runInContext(src, crossing.context).expired, true); assert.equal(crossing.clicks.pills.length, 0, 'lookup crossing deadline must not click');
});

test('cooperative menu reveal has no background page continuation and deadline prevents late row click', async () => {
  let calls = 0;
  const dom = stripDom({ rows: [{ id: 'owned', idx: 0, name: 'native' }] });
  const cdp = { evaluate: async src => {
    calls++;
    if (src === 'performance.now()') return dom.now();
    if (src.includes('legacy stream reveal selection')) return vm.runInContext(src, dom.context);
    return { exact: true, marker: true, documentVisibility: 'visible' };
  } };
  const result = await revealStreamOutput(cdp, 'owned', { text: 'correct END', marker: 'END' }, { idx: 0, name: 'native', sessionCount: 1 },
    { now: dom.now, sleep: async ms => dom.advance(ms) });
  assert.equal(result.status, 'measured'); assert.equal(dom.clicks.triggers, 1); assert.deepEqual(dom.clicks.selections, ['owned']); assert.ok(calls <= 4);
  const late = revealSelectionSource({ sessionId: 'owned', name: 'native', idx: 0, sessionCount: 1, expiresAt: dom.now(), action: 'menu-row' });
  assert.equal(vm.runInContext(late, dom.context).expired, true); assert.equal(dom.clicks.selections.length, 1); assert.equal(dom.clicks.wrappers, 0);
});

test('never-resolving reveal transport is bounded and delayed queued selection cannot mutate after deadline', async () => {
  let queued = null;
  const dom = stripDom({ pills: [{ id: 'owned', idx: 0, name: 'native' }] });
  const cdp = { evaluate: src => {
    if (src === 'performance.now()') return Promise.resolve(dom.now());
    queued = src; return new Promise(() => {}); // real wall timer must bound this
  } };
  const result = await revealStreamOutput(cdp, 'owned', { text: 'correct END', marker: 'END' }, { idx: 0, name: 'native', sessionCount: 1 }, { timeoutMs: 25 });
  assert.equal(result.status, 'incomplete'); assert.match(result.error, /deadline/);
  assert.ok(queued); dom.advance(100);
  const late = vm.runInContext(queued, dom.context);
  assert.equal(late.expired, true); assert.equal(dom.clicks.pills.length, 0); assert.equal(dom.clicks.triggers, 0);
  assert.equal(result.cancellation.policy, 'no-page-tasks; deadline-checked synchronous actions');
});

test('post-reveal selection and exact-output polling share one controller budget', async () => {
  let time = 0, polls = 0;
  const cdp = { evaluate: async src => {
    if (src === 'performance.now()') return 0;
    if (src.includes('legacy stream reveal selection')) { time += 4000; return { clicked: true }; }
    polls++; return { exact: false, marker: true, documentVisibility: 'visible' };
  } };
  const result = await revealStreamOutput(cdp, 'owned', { text: 'correct END', marker: 'END' }, { idx: 0, name: 'native', sessionCount: 1 },
    { now: () => time, sleep: async ms => { time += ms; } });
  assert.equal(result.status, 'incomplete'); assert.equal(result.controllerTotalMs, 10000); assert.ok(polls <= 61);
});

test('listener cleanup failure is reported, buffers cleared and late events stay inert', async () => {
  const b = bridge(); b.event('assistant-text', 'alpha beta SDVEND', '1'); b.event('turn-complete', undefined, '2');
  const retained = b.context.window.__perfStreamDrain;
  b.context.window.claude.off = () => { throw Error('unsubscribe failed'); };
  const r = await waitForStreamDrain({ evaluate: async src => vm.runInContext(src, b.context) });
  assert.equal(r.status, 'incomplete'); assert.match(r.error, /cleanup failed/);
  assert.equal(b.context.window.__perfStreamDrain, undefined); assert.equal(retained.read().text, '');
  b.event('assistant-text', 'late', '3'); assert.equal(retained.read().text, '');
});

test('bounded controller drain times out and cleans listener without geometry polling', async () => {
  let now = 0, cleaned = 0, polls = 0;
  const cdp = { evaluate: async source => {
    if (source === stopReceiptSource()) { cleaned++; return true; }
    polls++; return { complete: false, text: '', error: null };
  } };
  const r = await waitForStreamDrain(cdp, { now: () => now, sleep: async ms => { now += ms; } });
  assert.equal(r.status, 'incomplete'); assert.equal(now, 10000); assert.ok(polls <= 101); assert.equal(cleaned, 1);
});
