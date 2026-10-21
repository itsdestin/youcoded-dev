// Optional lab-only observation of the existing transcript bridge. No app hooks.
export const STREAM_DRAIN_DESCRIPTOR = Object.freeze({ revision: 2, lane: 'native-stream-completion-diagnostic', standardAcceptance: false,
  maxEvents: 10000, maxBytes: 1024 * 1024, plannedStreamMaxMs: 30000, drainMs: 10000, pollMs: 100,
  fixture: 'plain alphanumeric tokens at the existing planned delta count/rate; not the legacy Markdown workload',
  receipt: 'native live assistant-text events APPEND by partId with unique uuid; coalesced/replayed/cumulative/replacement evidence is not accepted as live delta conservation',
  clocks: 'Producer Date.now timestamps, renderer performance.now receipt timestamps, controller monotonic drain duration are retained separately; no cross-clock subtraction.',
  visibility: 'Boundary snapshots prove hidden session wrapper with a different active session, not continuous visibility; real OS-hidden/minimized-window activity unsupported.',
  reducerQueue: { available: false, reason: 'Reducer/batcher queue is closure-local and not exposed by existing bridge; bridge receipt is not reducer drain.' },
  limits: ['Observer overhead is uncalibrated; opt-in only, not a comparable standard baseline.', 'Exact post-reveal visible output is not hidden reducer completion or physical presentation.', 'No persistence substitute, CPU/energy attribution or internal queue conservation claim.'] });

export function buildDrainFixture(leg, count) {
  const code = { visible: 'v', switching: 's', hidden: 'h' }[leg];
  if (!code || !Number.isInteger(count) || count < 3 || count > 10000) throw Error('Drain fixture requires known leg and 3..10000 deltas');
  // splitDeltas includes leading space in its six-character token cap.
  const marker = `Z${code.toUpperCase()}END`;
  const text = Array.from({ length: count }, (_, i) => i === 0 ? `${code.toUpperCase()}BEG` : i === count - 1 ? marker : `${code}${String(i).padStart(4, '0')}`).join(' ');
  return { text, marker, leg, deltas: count, shape: 'plain-one-paragraph' };
}

/** WHY append only: harness-session consumeStep emits t (delta.text), not growing
 * text. chat-reducer appends same-partId text and dedups uuid. Persisted coalesced
 * deltaReferences are a different contract. Refuse retries/replays/duplicates here
 * instead of guessing cumulative/replacement semantics from a matching tail marker. */
export function receiptSource({ sessionId, expected, maxEvents = 10000, maxBytes = 1024 * 1024 }) {
  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 256 || typeof expected !== 'string'
    || Buffer.byteLength(expected) > 1024 * 1024 || !Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 10000
    || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 1024 * 1024) throw Error('Invalid bounded stream receipt plan');
  return `(() => {
    if (window.__perfStreamDrain) throw Error('Stream receipt collector already active');
    if (typeof window.claude?.on?.transcriptEvent !== 'function' || typeof window.claude.off !== 'function') throw Error('Existing transcript subscription/cleanup bridge unavailable');
    const owned = ${JSON.stringify(sessionId)}, expected = ${JSON.stringify(expected)};
    const seen = new Set(), chunks = [], encoder = new TextEncoder();
    let events = 0, textEvents = 0, bytes = 0, textChars = 0, part = null, terminalCount = 0, firstAt = null, terminalAt = null, error = null, ignoredSessions = 0, stopped = false;
    const fail = why => { error ||= why; };
    const startedAt = performance.now();
    const handler = window.claude.on.transcriptEvent(event => {
      if (stopped || error) return;
      if (!event || typeof event.sessionId !== 'string' || !event.sessionId) { fail('Missing session identity'); return; }
      if (event.sessionId !== owned) { ignoredSessions = Math.min(10000, ignoredSessions + 1); return; }
      if (++events > ${maxEvents}) { fail('Receipt event cap exceeded'); return; }
      if (typeof event.uuid !== 'string' || !event.uuid || event.uuid.length > 256) { fail('Missing/oversize event uuid'); return; }
      if (seen.has(event.uuid)) { fail('Duplicate receipt uuid'); return; }
      bytes += encoder.encode(event.uuid).length;
      if (bytes > ${maxBytes}) { fail('Receipt byte cap exceeded'); return; }
      seen.add(event.uuid);
      const d = event.data || {};
      if (d.parentAgentToolUseId || d.agentId) { fail('Unexpected subagent receipt'); return; }
      if (['user-interrupt', 'session-error', 'context-clear'].includes(event.type) || d.dropPart) { fail('Aborted/replaced stream receipt'); return; }
      if (event.type === 'assistant-text') {
        if (terminalCount) { fail('Text received after terminal event'); return; }
        if (typeof d.text !== 'string' || typeof d.partId !== 'string' || !d.partId || d.partId.length > 256 || d.deltaReferences) { fail('Invalid/coalesced text receipt'); return; }
        if (part !== null && part !== d.partId) { fail('Unexpected replacement/additional text part'); return; }
        part = d.partId;
        if (d.text.length > ${maxBytes} - bytes) { fail('Receipt byte cap exceeded'); return; }
        const n = encoder.encode(d.text).length;
        if (bytes + n > ${maxBytes}) { fail('Receipt byte cap exceeded'); return; }
        bytes += n; textChars += d.text.length; textEvents++; chunks.push(d.text);
        firstAt ??= performance.now();
      } else if (event.type === 'turn-complete') {
        terminalCount++; terminalAt = performance.now();
        if (terminalCount !== 1 || ['error', 'abort', 'cancelled'].includes(d.stopReason)) fail('Invalid terminal turn event');
      }
    });
    window.__perfStreamDrain = {
      read: () => {
        const text = chunks.join('');
        return { revision: 1, sessionId: owned, events, textEvents, bytes, textChars, text, exact: text === expected,
          terminalCount, firstAt, terminalAt, startedAt, readAt: performance.now(), ignoredSessions, error,
          complete: !error && text === expected && terminalCount === 1,
          clock: 'renderer-performance-now', reducerQueue: { available: false, reason: 'closure-local; bridge receipt only' } };
      },
      stop: () => {
        try { if (!stopped) { stopped = true; window.claude.off('transcript:event', handler); } }
        finally { chunks.length = 0; seen.clear(); part = null; }
      }
    };
    return { installed: true, sessionId: owned, startedAt, clock: 'renderer-performance-now' };
  })()`;
}
export const readReceiptSource = () => '(() => { if (!window.__perfStreamDrain) throw Error("Stream receipt collector missing"); return window.__perfStreamDrain.read(); })()';
export const stopReceiptSource = () => '(() => { const p = window.__perfStreamDrain; try { if (p) p.stop(); } finally { delete window.__perfStreamDrain; } return true; })()';

const bounded = (promise, ms) => {
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Stream drain controller deadline')), ms); });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
};

export function assessStreamDrain({ expected, producer, receipt }) {
  const reasons = [];
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  if (!producer || !Number.isInteger(producer.index) || producer.index < 0 || producer.stream !== true || producer.plannedText !== expected
    || !Number.isInteger(producer.plannedDeltas) || producer.plannedDeltas < 1 || producer.plannedDeltas > 10000
    || producer.aborted !== false || producer.completed !== true || producer.finishWritten !== true || producer.doneWritten !== true
    || producer.endRequested !== true || producer.writeError !== null || producer.prematureClose !== false
    || !finite(producer.endRequestedAt) || producer.endRequestedAt < producer.startedAt
    || producer.contentWrites !== producer.plannedDeltas || producer.deltasSent !== producer.plannedDeltas
    || producer.chars !== expected?.length || producer.writtenTextChars !== expected?.length
    || !Number.isInteger(producer.backpressureWaits) || producer.backpressureWaits < 0
    || !finite(producer.startedAt) || !finite(producer.endedAt) || producer.endedAt < producer.startedAt
    || !finite(producer.writeCompletedAt) || producer.writeCompletedAt < producer.startedAt) reasons.push('Producer request/write completion not established');
  if (!receipt?.complete || receipt.revision !== 1 || receipt.error || receipt.text !== expected || receipt.textChars !== expected?.length
    || !Number.isInteger(receipt.textEvents) || receipt.textEvents < 1 || receipt.terminalCount !== 1
    || !finite(receipt.firstAt) || !finite(receipt.terminalAt) || receipt.terminalAt < receipt.firstAt) reasons.push(receipt?.error ?? 'Exact renderer receipt and terminal turn event not established');
  return { status: reasons.length ? 'incomplete' : 'measured', reasons, producer, receipt, standardAcceptance: false,
    scope: 'producer write record versus bridge receipt; no cross-clock latency or reducer queue inference' };
}

export async function stopStreamDrain(cdp) {
  return bounded(cdp.evaluate(stopReceiptSource()), 1000);
}

/** Bounded low-frequency bridge snapshots after legacy phase counters are closed.
 * Always remove only our listener and clear buffers, including on timeout/error. */
export async function waitForStreamDrain(cdp, { now = () => performance.now(), sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const start = now(); let receipt = null, error = null;
  try {
    while (true) {
      receipt = await bounded(cdp.evaluate(readReceiptSource()), Math.max(1, 10000 - (now() - start)));
      if (receipt.complete || receipt.error) break;
      if (now() - start >= 10000) { error = 'Bridge drain timeout after 10000ms'; break; }
      await sleep(Math.min(100, 10000 - (now() - start)));
    }
  } catch (e) { error = e.message; }
  finally {
    try { await bounded(cdp.evaluate(stopReceiptSource()), 1000); }
    catch (e) { error = [error, `Listener cleanup failed: ${e.message}`].filter(Boolean).join('; '); }
  }
  return { status: !error && receipt?.complete ? 'measured' : 'incomplete', receipt, error, controllerDrainMs: now() - start,
    clock: 'controller-monotonic', label: 'post-phase bridge receipt wait, not hidden reducer drain' };
}

export function sessionVisibilitySource(sessionId) {
  return `(() => {
    const roots = [...document.querySelectorAll('[data-chat-session-id]')];
    const owned = roots.filter(e => e.getAttribute('data-chat-session-id') === ${JSON.stringify(sessionId)});
    const active = roots.filter(e => !e.closest('[aria-hidden="true"]'));
    return { sessionId: ${JSON.stringify(sessionId)}, ownedCount: owned.length, hidden: owned.length === 1 && !!owned[0].closest('[aria-hidden="true"]'),
      activeCount: active.length, activeSessionId: active.length === 1 ? active[0].getAttribute('data-chat-session-id') : null,
      documentVisibility: document.visibilityState, clock: 'renderer-performance-now', atMs: performance.now(), osHiddenWindow: 'unsupported' };
  })()`;
}
const normalize = text => text.replace(/\s+/g, ' ').trim();
export function visibleDrainSource(sessionId, expected, marker) {
  return `(() => {
    const active = [...document.querySelectorAll('[data-chat-session-id]')].filter(e => !e.closest('[aria-hidden="true"]'));
    const roots = active.filter(e => e.getAttribute('data-chat-session-id') === ${JSON.stringify(sessionId)});
    if (roots.length !== 1 || active.length !== 1) return { exact: false, reason: 'Owned active session wrapper missing/ambiguous', documentVisibility: document.visibilityState };
    const bodies = [...roots[0].querySelectorAll('.assistant-bubble [data-message-find-body]')];
    const body = bodies.at(-1), text = body?.textContent ?? '';
    if (text.length > 1048576) return { exact: false, reason: 'Visible text cap exceeded' };
    const normalized = text.replace(/\\s+/g, ' ').trim();
    return { exact: normalized === ${JSON.stringify(normalize(expected))}, marker: normalized.endsWith(${JSON.stringify(marker)}),
      chars: normalized.length, documentVisibility: document.visibilityState, bodies: bodies.length,
      scope: 'last owned active assistant message body; plain fixture whitespace normalized; textContent only' };
  })()`;
}

export async function beginStreamDiagnostic(cdp, fake, { leg, sessionId, deltas, perSec }) {
  const fixture = buildDrainFixture(leg, deltas);
  if (!Number.isFinite(perSec) || perSec <= 0 || perSec > 1000 || deltas / perSec * 1000 > 30000) throw Error('Diagnostic stream plan exceeds bounded 30s/1000-deltas-per-second policy');
  fake.plan({ deltas, perSec, seed: leg, text: fixture.text, completionDiagnostic: true });
  const expected = fake.plannedText();
  if (expected !== fixture.text) throw Error('Diagnostic plan truncation/marker mismatch');
  const requestIndex = fake.requests.length;
  const visibilityStart = await bounded(cdp.evaluate(sessionVisibilitySource(sessionId)), 1000);
  await bounded(cdp.evaluate(receiptSource({ sessionId, expected })), 1000);
  return { fixture, requestIndex, visibilityStart, sessionId, leg };
}

export async function finishStreamDiagnostic(cdp, plan, record) {
  const drained = await waitForStreamDrain(cdp);
  const producer = record ? { index: record.index, stream: record.stream, plannedDeltas: record.plannedDeltas,
    deltasSent: record.deltasSent, chars: record.chars, aborted: record.aborted, backpressureWaits: record.backpressureWaits,
    startedAt: record.startedAt, endedAt: record.endedAt, ...record.completionDiagnostic, clock: 'producer-Date-now' } : null;
  const result = assessStreamDrain({ expected: plan.fixture.text, producer, receipt: drained.receipt });
  if (record?.index !== plan.requestIndex) result.reasons.push('Producer request index does not match registered plan');
  if (drained.receipt?.sessionId !== plan.sessionId) result.reasons.push('Receipt session does not match registered plan');
  if (drained.error) result.reasons.push(drained.error);
  let visibilityEnd = null;
  try { visibilityEnd = await bounded(cdp.evaluate(sessionVisibilitySource(plan.sessionId)), 1000); }
  catch (e) { result.reasons.push(`Visibility proof failed: ${e.message}`); }
  for (const view of [plan.visibilityStart, visibilityEnd]) {
    if (view?.ownedCount !== 1 || view.activeCount !== 1 || view.documentVisibility !== 'visible'
      || (plan.leg === 'hidden' && (!view.hidden || !view.activeSessionId || view.activeSessionId === plan.sessionId))) {
      result.reasons.push('Session wrapper/other active session/document visibility proof incomplete');
    }
  }
  return { ...result, status: result.reasons.length ? 'incomplete' : 'measured', fixture: plan.fixture,
    bridgeDrain: drained, visibility: { start: plan.visibilityStart, end: visibilityEnd },
    reducerQueue: STREAM_DRAIN_DESCRIPTOR.reducerQueue, osHiddenWindow: 'unsupported' };
}

/** WHY not __perfLab.switchTo: it starts a page-owned RAF blank watcher and
 * asynchronous frame waits. Racing its CDP promise does NOT cancel those tasks.
 * These actions are synchronous DOM clicks only; deadline checked BEFORE mutation.
 * A command delivered after timeout refuses the click. No page timers, observers,
 * promises or renderer scheduler hooks are created. Controller polls are read-only. */
export function revealSelectionSource({ sessionId, name, idx, sessionCount, expiresAt, action }) {
  if (!Number.isFinite(expiresAt) || !Number.isInteger(idx) || idx < 0 || !Number.isInteger(sessionCount) || sessionCount < 1 || idx >= sessionCount
    || typeof name !== 'string' || typeof sessionId !== 'string' || !sessionId || !['select', 'menu-row'].includes(action)) throw Error('Invalid bounded reveal selection');
  return `(() => {
    // legacy stream reveal selection
    if (performance.now() >= ${expiresAt}) return { expired: true };
    const active = [...document.querySelectorAll('[data-chat-session-id]')].filter(e => !e.closest('[aria-hidden="true"]'));
    if (active.length === 1 && active[0].getAttribute('data-chat-session-id') === ${JSON.stringify(sessionId)}) return { alreadyActive: true };
    const ownedId = ${JSON.stringify(sessionId)}, expectedIndex = ${idx};
    const indexOf = e => {
      const value = e.getAttribute('data-session-idx');
      return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) ? Number(value) : null;
    };
    // WHY identities, not display names/title or visible-position fallback:
    // SessionStrip pills/portal rows carry exact data-session-id + full-list idx.
    // Tooltip replaces title with data-hint/aria-label; names can collide.
    if (${JSON.stringify(action)} === 'select') {
      const pills = [...document.querySelectorAll('[data-session-strip] button[data-session-id], .session-strip button[data-session-id]')];
      const matches = pills.filter(p => p.getAttribute('data-session-id') === ownedId);
      const atIndex = pills.filter(p => indexOf(p) === expectedIndex);
      if (matches.length > 1 || atIndex.length > 1 || matches.length && indexOf(matches[0]) !== expectedIndex
        || atIndex.length && atIndex[0].getAttribute('data-session-id') !== ownedId) return { error: 'Session pill id/index mapping missing or changed' };
      if (matches.length === 1) {
        const pill = matches[0];
        if (pill.disabled) return { error: 'Owned session pill disabled' };
        if (performance.now() >= ${expiresAt}) return { expired: true };
        pill.click(); return { clicked: true, mode: 'pill', sessionId: ownedId, index: expectedIndex };
      }
      const triggers = [...document.querySelectorAll('[data-session-strip] button[data-hint], [data-session-strip] button[aria-label], .session-strip button[data-hint], .session-strip button[aria-label]')]
        .filter(e => e.getAttribute('data-hint') === 'All sessions' || e.getAttribute('aria-label') === 'All sessions');
      if (triggers.length !== 1 || triggers[0].disabled) return { error: 'Owned session menu trigger missing/ambiguous/disabled' };
      if (performance.now() >= ${expiresAt}) return { expired: true };
      triggers[0].click(); return { menuOpened: true };
    }
    const rows = [...document.querySelectorAll('[data-session-idx]')].filter(e => !e.closest('[data-session-strip]') && !e.closest('.session-strip'));
    const matches = rows.filter(e => e.getAttribute('data-session-id') === ownedId);
    const atIndex = rows.filter(e => indexOf(e) === expectedIndex);
    if (!matches.length && !atIndex.length) return { pendingMenu: true };
    if (matches.length !== 1 || atIndex.length !== 1 || matches[0] !== atIndex[0]) return { error: 'Session menu id/index mapping missing or changed' };
    const row = matches[0];
    // The outer div owns drag handlers only (SessionStrip 2399). Selection lives
    // on the nested role=button, tabindex=0; never click the grip/rename button.
    const controls = [...row.querySelectorAll('[role="button"][tabindex="0"][aria-label]')]
      .filter(e => e.closest('[data-session-id]') === row);
    if (controls.length !== 1 || controls[0].getAttribute('aria-disabled') === 'true') return { error: 'Session menu selection control missing/ambiguous/disabled' };
    if (performance.now() >= ${expiresAt}) return { expired: true };
    controls[0].click(); return { clicked: true, mode: 'menu', sessionId: ownedId, index: expectedIndex };
  })()`;
}

export async function revealStreamOutput(cdp, sessionId, fixture, selection, { now = () => performance.now(), sleep = ms => new Promise(r => setTimeout(r, ms)), timeoutMs = 10000 } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10000) throw Error('Invalid reveal deadline');
  const start = now(); let revealSwitchMs = null;
  const cancellation = { policy: 'no-page-tasks; deadline-checked synchronous actions', pageTasksCreated: false,
    limitation: 'A completed click may trigger ordinary app render work; no claim to cancel React. Timed-out CDP transport is not itself cancellation.' };
  try {
    const pageStart = await bounded(cdp.evaluate('performance.now()'), timeoutMs);
    if (!Number.isFinite(pageStart)) throw Error('Renderer reveal clock unavailable');
    const expiresAt = pageStart + Math.max(0, timeoutMs - (now() - start));
    let action = 'select';
    while (true) {
      const remaining = timeoutMs - (now() - start);
      if (remaining <= 0) throw Error('Post-reveal controller deadline exhausted');
      const step = await bounded(cdp.evaluate(revealSelectionSource({ ...selection, sessionId, expiresAt, action })), remaining);
      if (step?.expired) throw Error('Renderer reveal deadline exhausted before mutation');
      if (step?.error) throw Error(step.error);
      if (step?.clicked || step?.alreadyActive) break;
      if (!step?.menuOpened && !step?.pendingMenu) throw Error('Reveal selection proof missing');
      action = 'menu-row';
      await sleep(Math.min(100, Math.max(0, timeoutMs - (now() - start))));
    }
    revealSwitchMs = now() - start;
    const remaining = timeoutMs - revealSwitchMs;
    if (remaining <= 0) throw Error('Post-reveal controller deadline exhausted');
    return { ...await waitForVisibleDrain(cdp, sessionId, fixture, { now, sleep, timeoutMs: remaining }), revealSwitchMs,
      controllerTotalMs: now() - start, cancellation, label: 'post-reveal output observation, NOT hidden reducer completion' };
  } catch (e) {
    return { status: 'incomplete', error: e.message, revealSwitchMs, controllerTotalMs: now() - start, cancellation,
      clock: 'controller-monotonic', label: 'post-reveal output observation, NOT hidden reducer completion' };
  }
}

export async function waitForVisibleDrain(cdp, sessionId, fixture, { now = () => performance.now(), sleep = ms => new Promise(r => setTimeout(r, ms)), timeoutMs = 10000 } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10000) throw Error('Invalid visible drain deadline');
  const start = now(); let visible = null, error = null;
  try {
    while (true) {
      visible = await bounded(cdp.evaluate(visibleDrainSource(sessionId, fixture.text, fixture.marker)), Math.max(1, timeoutMs - (now() - start)));
      if (visible.exact && visible.marker && visible.documentVisibility === 'visible') break;
      if (now() - start >= timeoutMs) { error = `Post-reveal exact visible output timeout after ${timeoutMs}ms`; break; }
      await sleep(Math.min(100, timeoutMs - (now() - start)));
    }
  } catch (e) { error = e.message; }
  return { status: !error && visible?.exact && visible?.marker ? 'measured' : 'incomplete', visible, error,
    postRevealMs: now() - start, clock: 'controller-monotonic', label: 'post-reveal output observation, NOT hidden reducer completion' };
}
