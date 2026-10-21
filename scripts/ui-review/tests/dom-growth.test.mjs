import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { runDomGrowth, makeGrowthBound, GROWTH_DESCRIPTOR, GROWTH_INSPECT, makeDomGrowthDriver, growthSourceIdentity } from '../dom-growth.mjs';

function rig({ virtual = false, cap = false, wrong = false, noMove = false, missing = false, settleFail = false, restoreFail = false, sourceChange = false } = {}) {
  let step = 0, closed = false, calls = 0, now = 0;
  const source = { checkout: '/isolated', build: '/cache/dist-hash', sha256: 'a'.repeat(64) };
  const driver = {
    source: async () => ({ ...source, sha256: sourceChange && calls++ ? 'b'.repeat(64) : source.sha256 }),
    settle: async () => ({ status: settleFail ? 'incomplete' : 'measured', nodes: step && !virtual ? 12000 : 1000, reason: settleFail ? 'timeout' : null }),
    inspect: async () => ({ shown: !closed && !missing, screen: wrong ? 'projects/files' : 'projects/conversations', markCount: 1, scrollerCount: 1,
      epoch: 'document-1', project: '/fixture/project', rows: 2000, scenario: 'stress', effectiveRows: 2000, width: 1440,
      scrollTop: noMove ? 0 : step * 100, clientHeight: 500, scrollHeight: (step * 100) + 500 + ((cap || !step) ? 100 : 0),
      renderedRows: !step || virtual ? 50 : 2000, firstIndex: step && virtual ? 1950 : 0, lastIndex: step && !cap ? 1999 : 49 + step * 50,
      hasMore: !step || cap, targetKey: closed ? null : 'scroller' }),
    counters: async () => ({ status: 'measured', values: { LayoutCount: step + 1, RecalcStyleCount: step + 1, LayoutDuration: step / 100, RecalcStyleDuration: step / 100, TaskDuration: step / 10 } }),
    scroll: async () => { step++; return { applied: true }; },
    close: async () => { closed = true; return { ok: true }; },
    closedProof: async () => ({ absent: closed, unmounted: closed, filesShown: closed, settle: { status: 'measured', nodes: 900 } }),
    reopen: async () => { closed = false; if (!restoreFail) step = 0; return { ok: true }; },
  };
  return { driver, options: { now: () => now++, maxCheckpoints: 3, bound: async operation => operation() } };
}

test('source-realistic 50-row chunks exhaust exactly ten checkpoints but retain close/reopen reset evidence', async () => {
  const { driver, options } = rig();
  let revealed = 50, top = 0, closed = false, actions = 0;
  const inspect = driver.inspect;
  driver.inspect = async () => ({ ...await inspect(), shown: !closed, renderedRows: revealed, firstIndex: 0, lastIndex: revealed - 1,
    hasMore: revealed < 2000, scrollTop: top, scrollHeight: revealed * 100, clientHeight: 500 });
  driver.settle = async () => ({ status: 'measured', nodes: 200 + revealed * 20 });
  driver.scroll = async () => { actions++; top = revealed * 100 - 500; revealed += 50; return { applied: true }; };
  driver.close = async () => { closed = true; return { ok: true }; };
  driver.closedProof = async () => ({ absent: closed, unmounted: closed, filesShown: closed, settle: { status: 'measured', nodes: 900 } });
  driver.reopen = async () => { closed = false; revealed = 50; top = 0; return { ok: true }; };
  const report = await runDomGrowth(driver, { ...options, maxCheckpoints: 10 });
  assert.equal(report.initial.snapshot.renderedRows, 50);
  assert.deepEqual(report.checkpoints.map(row => row.snapshot.renderedRows), [100,150,200,250,300,350,400,450,500,550]);
  assert.equal(actions, 10);
  assert.equal(report.status, 'incomplete');
  assert.match(report.reason, /checkpoint cap/);
  assert.equal(report.reachedEnd, false);
  assert.equal(report.growth.documentNodes, 10000);
  assert.equal(report.closed.unmounted, true);
  assert.equal(report.reopened.snapshot.renderedRows, 50);
  assert.equal(report.reset.proven, true);
});

test('chunk reveal growth above initial budget is retained evidence, not a universal cumulative failure', async () => {
  const { driver, options } = rig();
  const report = await runDomGrowth(driver, options);
  assert.equal(report.status, 'measured');
  assert.equal(report.growth.documentNodes, 11000);
  assert.equal(report.initialBudget.pass, true);
  assert.equal(report.reachedEnd, true);
  assert.equal(report.reopened.snapshot.renderedRows, 50);
  assert.equal(report.reopened.snapshot.scrollTop, 0);
  assert.equal(report.descriptor.standardAcceptanceCoverage, false);
  assert.equal(report.reset.counterDelta.status, 'unmeasured');
  assert.equal(report.reset.counterDelta.values.LayoutCount, null);
});

test('windowed-shaped stable DOM with range progress differs from cumulative retained-row growth', async () => {
  const { driver, options } = rig({ virtual: true });
  const report = await runDomGrowth(driver, options);
  assert.equal(report.status, 'measured');
  assert.equal(report.growth.documentNodes, 0);
  assert.equal(report.observedShape, 'stable-node-count-with-range-progress');
  assert.equal(report.descriptor.declaredMechanism, 'chunked-reveal-retains-rows-not-virtualized');
});

for (const [name, flags, reason] of [
  ['wrong target', { wrong: true }, /target/], ['no scroll movement', { noMove: true }, /progress/],
  ['missing mark', { missing: true }, /target/], ['settle timeout', { settleFail: true }, /settle.*timeout/],
  ['checkpoint cap', { cap: true }, /checkpoint cap/], ['reopen not reset', { restoreFail: true }, /reopen.*reset/],
  ['source identity changed', { sourceChange: true }, /source identity/],
]) test(`${name} stays incomplete with explicit evidence`, async () => {
  const { driver, options } = rig(flags);
  const report = await runDomGrowth(driver, options);
  assert.equal(report.status, 'incomplete');
  assert.match(report.reason, reason);
});

test('reopen records changed node cost without requiring equal whole-document counts', async () => {
  const { driver, options } = rig();
  let reopened = false;
  const reopen = driver.reopen;
  driver.reopen = async () => { reopened = true; return reopen(); };
  const settle = driver.settle;
  driver.settle = async () => reopened ? { status: 'measured', nodes: 1003 } : settle();
  const report = await runDomGrowth(driver, options);
  assert.equal(report.status, 'measured');
  assert.equal(report.reset.nodeChangeFromInitial, 3);
  assert.equal(report.reset.proven, true);
});

test('optional missing counters and counter decreases stay unavailable rather than healthy zero work', async () => {
  const { driver, options } = rig();
  driver.counters = async () => ({ status: 'unmeasured', values: {}, reason: 'unsupported' });
  const report = await runDomGrowth(driver, options);
  assert.equal(report.status, 'measured');
  assert.equal(report.counterCoverage.status, 'unavailable-or-partial');
  assert.equal(report.checkpoints[0].delta.status, 'unmeasured');
  assert.equal(report.checkpoints[0].delta.values.LayoutCount, null);
});

test('missing closed/unmounted proof prevents a reset claim', async () => {
  const { driver, options } = rig();
  driver.closedProof = async () => ({ absent: true, unmounted: false, filesShown: true, settle: { status: 'measured' } });
  const report = await runDomGrowth(driver, options);
  assert.equal(report.status, 'incomplete');
  assert.equal(report.reset, undefined);
});

test('source-shaped boundary expression verifies registered mark, direct cards, scroller and effective fixture rows offline', () => {
  const cards = Array.from({ length: 50 }, (_, i) => ({ tagName: 'BUTTON', getAttribute: () => i % 3 ? `session ${i}` : `refactor the transcript watcher byte-offset reader and its eight downstream consumers (${i})` }));
  const scroller = { children: cards, getBoundingClientRect: () => ({ width: 900, height: 500, top: 200, bottom: 700 }),
    closest: () => null, querySelector: () => ({}), scrollTop: 0, scrollHeight: 5000, clientHeight: 500 };
  const panel = { querySelectorAll: selector => selector === 'h2' ? [{ textContent: 'Recent conversations' }] : [scroller] };
  const view = { querySelector: selector => selector.includes('aria-label') ? { lastElementChild: { textContent: '2000' } } : { textContent: '/fixture/youcoded' } };
  const mark = { parentElement: panel, closest: () => view };
  const snapshot = runInNewContext(GROWTH_INSPECT, { document: { querySelectorAll: () => [mark] }, URLSearchParams, location: { search: '?scenario=stress&stressRows=2000' }, performance: { timeOrigin: 123 }, innerWidth: 1440, innerHeight: 900 });
  assert.equal(snapshot.shown, true); assert.equal(snapshot.renderedRows, 50);
  assert.equal(snapshot.firstIndex, 0); assert.equal(snapshot.lastIndex, 49);
  assert.equal(snapshot.project, '/fixture/youcoded'); assert.equal(snapshot.rows, 2000);
  assert.equal(snapshot.hasMore, true);
});

test('adapter reuses one CDP metric response and named tab routing, never launch APIs', async () => {
  const calls = [];
  const tab = { send: async method => { calls.push(method); return { metrics: ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'].map(name => ({ name, value: 2 })) }; },
    evaluate: async expression => { calls.push(expression); return { ok: true }; } };
  const driver = makeDomGrowthDriver(tab, { checkout: '/unused', build: '/unused', markCheck: () => 'proof' });
  const counters = await driver.counters();
  assert.equal(counters.layout.layoutDurationMs, 2000);
  assert.equal(calls.filter(c => c === 'Performance.getMetrics').length, 1);
  await driver.close(); await driver.reopen();
  assert.match(calls[1], /open\('projects\/files'\)/);
  assert.match(calls[2], /open\('projects\/conversations'\)/);
});

test('source identity is reproducible for inspected files and binds checkout and build paths', () => {
  // WHY: URL pathnames retain escaping and are not filesystem paths on Windows.
  const checkout = fileURLToPath(new URL('../../../youcoded/', import.meta.url));
  const a = growthSourceIdentity(checkout, '/cache/dist-a');
  const b = growthSourceIdentity(checkout, '/cache/dist-b');
  assert.match(a.sha256, /^[a-f0-9]{64}$/);
  assert.equal(a.sha256, b.sha256);
  assert.notEqual(a.build, b.build);
});

test('growth caps and external operation deadlines are bounded with fake clock/timer', async () => {
  let now = 0, callback, cleared = 0;
  const bound = makeGrowthBound({ maxMs: 1000, now: () => now, setTimer: fn => { callback = fn; return 1; }, clearTimer: () => cleared++ });
  const pending = bound(() => new Promise(() => {}), 'stuck'); callback();
  await assert.rejects(pending, /timeout/); assert.equal(cleared, 1);
  now = 1000;
  let started = false;
  await assert.rejects(bound(() => { started = true; }, 'expired'), /deadline/);
  assert.equal(started, false);
  const { driver, options } = rig();
  await assert.rejects(runDomGrowth(driver, { ...options, maxCheckpoints: 11 }), /1..10/);
  assert.equal(GROWTH_DESCRIPTOR.maxScrollCheckpoints, 10);
});
