// Workstream E: reducer-queue conservation, real OS-hidden phase and background-cost wiring (all offline, fake CDP/proc).
import test from 'node:test';
import assert from 'node:assert/strict';
import { assessReducerQueue, readBatcherCounters, BATCHER_ABSENT_REASON } from '../stream-drain.mjs';
import { minimizeWindow, restoreWindow } from '../os-hidden.mjs';
import { runOsHiddenPhase } from '../scenario-native-stream.mjs';
import { beginBackgroundWindow, endBackgroundWindow } from '../background-window.mjs';

const producer = { deltasSent: 10 }, receipt = { textEvents: 10 };
const counters = (over = {}) => ({ available: true, unaccounted: 0, pendingDepth: 0, pushed: 12, enqueued: 12, applied: 12, droppedOnDispose: 0, droppedAfterDispose: 0, droppedOnDispatchError: 0,
  flushes: 4, maxPendingDepth: 7, oldestPendingAgeMs: 0, maxOldestPendingAgeMs: 21.5, byType: { TRANSCRIPT_ASSISTANT_TEXT: { enqueued: 10, applied: 10, dropped: 0 }, X: { enqueued: 2, applied: 2, dropped: 0 } }, ...over });

test('absent counters are unavailable with the exact reason, never zero', async () => {
  const cdp = { evaluate: async () => ({ present: false }) };
  assert.deepEqual(await readBatcherCounters(cdp), { available: false, reason: 'candidate lacks counters' });
  assert.equal(BATCHER_ABSENT_REASON, 'candidate lacks counters');
  assert.deepEqual(assessReducerQueue({ producer, receipt, counters: await readBatcherCounters(cdp) }), { available: false, reason: 'candidate lacks counters' });
});

test('conservation holds only when sent = received = enqueued = applied + dropped and the queue is empty', () => {
  const ok = assessReducerQueue({ producer, receipt, counters: counters() });
  assert.equal(ok.conservation.holds, true); assert.equal(ok.queue.maxPendingDepth, 7); assert.equal(ok.queue.maxOldestPendingAgeMs, 21.5);
  // Only text actions are compared: the extra non-text action does not break it.
  const lost = assessReducerQueue({ producer, receipt, counters: counters({ byType: { TRANSCRIPT_ASSISTANT_TEXT: { enqueued: 10, applied: 9, dropped: 0 } } }) });
  assert.equal(lost.conservation.holds, false); assert.match(lost.conservation.failures.join(), /enqueued 10 != applied 9/);
  assert.equal(assessReducerQueue({ producer, receipt: { textEvents: 9 }, counters: counters() }).conservation.holds, false);
  assert.equal(assessReducerQueue({ producer, receipt, counters: counters({ pendingDepth: 2 }) }).conservation.holds, false);
  assert.equal(assessReducerQueue({ producer, receipt, counters: counters({ unaccounted: 1 }) }).conservation.holds, false);
  const dropped = assessReducerQueue({ producer, receipt, counters: counters({ byType: { TRANSCRIPT_ASSISTANT_TEXT: { enqueued: 10, applied: 8, dropped: 2 } } }) });
  assert.equal(dropped.conservation.holds, true); assert.equal(dropped.conservation.dropped, 2);
});

test('minimize is achieved only when the page itself reports hidden; a silent no-op is hidden-not-achieved', async () => {
  const calls = [];
  const noWm = { send: async m => { calls.push(m); return { windowId: 1 }; }, evaluate: async e => (e === 'document.visibilityState' ? 'visible' : true) };
  const r = await minimizeWindow(noWm, { timeoutMs: 150 });
  assert.equal(r.achieved, false); assert.equal(r.status, 'hidden-not-achieved');
  assert.equal(r.attempts.length, 2); assert.ok(r.attempts.every(a => a.visibilityAfter === 'visible'));
  let hidden = false;
  const wm = { send: async (m, p) => { if (p?.bounds) hidden = p.bounds.windowState === 'minimized'; return { windowId: 1 }; }, evaluate: async () => (hidden ? 'hidden' : 'visible') };
  const ok = await minimizeWindow(wm, { timeoutMs: 500 });
  assert.equal(ok.achieved, true); assert.equal(ok.route, 'cdp-Browser.setWindowBounds-minimized');
  assert.equal((await restoreWindow({ ...wm, send: async (m, p) => { if (p?.bounds) hidden = false; return { windowId: 1 }; } })).restored, true);
});

test('OS-hidden phase streams nothing and reports hidden-not-achieved when the window cannot be hidden', async () => {
  const warnings = [];
  let began = false;
  const out = await runOsHiddenPhase({}, {}, {}, { sessionId: 's', deltas: 5, perSec: 5, warnings, deps: {
    minimizeWindow: async () => ({ achieved: false, status: 'hidden-not-achieved', reason: 'no wm', attempts: [] }),
    beginStreamDiagnostic: async () => { began = true; }, restoreWindow: async () => ({ restored: true, attempts: [] }) } });
  assert.equal(out.status, 'hidden-not-achieved'); assert.equal(began, false); assert.match(warnings[0], /NOT achieved/);
});

test('OS-hidden phase: all-hidden samples + conserved queue + exact output = measured; a visible sample or lost word = incomplete', async () => {
  const run = async ({ vis, finishStatus = 'measured' }) => {
    let rec = { deltasSent: 5 };
    const fake = { expectCompletion: () => Promise.resolve(rec) };
    const cdp = { evaluate: async () => ({ status: 'started' }) };
    const order = [];
    return runOsHiddenPhase({}, cdp, fake, { sessionId: 's', deltas: 5, perSec: 5000, warnings: [], deps: {
      sleep: async () => {}, minimizeWindow: async () => ({ achieved: true, route: 'x', attempts: [] }),
      restoreWindow: async () => { order.push('restore'); return { restored: true, attempts: [] }; },
      readVisibility: async () => vis, readBatcherCounters: async () => ({ available: true, pendingDepth: 3, oldestPendingAgeMs: 12 }),
      beginStreamDiagnostic: async () => ({ fixture: { text: 't', marker: 'm' } }), beginBackgroundWindow: async () => ({}), endBackgroundWindow: async () => ({ status: 'supported' }),
      finishStreamDiagnostic: async () => { order.push('finish'); return { status: finishStatus, reducerQueue: { available: true } }; },
      waitForVisibleDrain: async () => ({ status: 'measured' }) } }).then(o => ({ o, order }));
  };
  const good = await run({ vis: 'hidden' });
  assert.equal(good.o.status, 'measured'); assert.deepEqual(good.order, ['restore', 'finish']); assert.equal(good.o.sampledQueue.maxDepthSeen, 3);
  assert.equal((await run({ vis: 'visible' })).o.status, 'incomplete');
  assert.equal((await run({ vis: 'hidden', finishStatus: 'incomplete' })).o.status, 'incomplete');
});

test('background window prices work over the owned family, survivors only, and says who vanished', async () => {
  const mk = (pids, cpu) => ({ status: 'supported', source: 'linux-proc-stat/status', epoch: 'e', hz: 100, startMs: 0, atMs: 1000, processes: pids.map(pid => ({ pid, startTicks: String(pid), cpuTicks: String(cpu), voluntary: '1', involuntary: '1' })), errors: [] });
  let calls = 0;
  const snap = async (pids) => {
    calls++;
    if (calls === 1) return { ...mk(pids, 0) };
    const alive = pids.filter(p => p !== 3);
    const s = { ...mk(alive, 100), startMs: 2000, atMs: 3000 };
    return alive.length < pids.length ? { ...s, status: 'incomplete', errors: [{ pid: 3 }] } : s;
  };
  const fam = [[1, 2, 3], [1, 2, 3], [1, 2]]; let i = 0;
  const deps = { pids: () => fam[Math.min(i++, 2)], clock: async () => ({ status: 'supported', hz: 100 }), snapshot: snap, epoch: () => 'e' };
  const h = await beginBackgroundWindow({}, 'w', deps);
  const r = await endBackgroundWindow({}, h, deps);
  assert.equal(r.status, 'supported', r.reason); assert.deepEqual(r.membership.vanished, [3]); assert.equal(r.membership.wholeFamily, false);
  assert.equal(r.delta.cpuSeconds, 2); assert.equal(r.powerAttribution, false); assert.match(r.workLabel, /not energy/);
});
