// Unit tests for scenario-native-stream.mjs — everything checkable without an app.
// Run: node --test scripts/perf-lab/tests/scenario-native-stream.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { splitDeltas } from '../fake-provider.mjs';
import {
  FIRST_SWITCH_AT_MS, LEG_GRACE_MS, MEASURES, NUMERIC_PATHS, STOP_BUTTON, STREAM_DELTAS, STREAM_PER_SEC,
  SWITCHES_DURING_STREAM, SWITCH_EVERY_MS, installStreamHelpers, mainThreadDelta, medianRun, summariseLeg, summariseStreamSwitches, streamLeg,
} from '../scenario-native-stream.mjs';

// Same guard as scenario-native-resume.test: an apostrophe inside the injected
// page code is unescaped by the template literal and the helper fails to parse.
test('the injected page helper parses as JavaScript', async () => {
  const sources = [];
  await installStreamHelpers({ evaluate: async (src) => { sources.push(src); return true; } });
  assert.equal(sources.length, 1);
  assert.doesNotThrow(() => new Function(sources[0]));
});
import { PRIMARY } from '../compare.mjs';

test('defaults: the switching leg fits inside one stream, with a grace window for the turn to end', () => {
  const streamMs = STREAM_DELTAS / STREAM_PER_SEC * 1000;
  assert.equal(streamMs, 20_000);
  assert.ok(FIRST_SWITCH_AT_MS + (SWITCHES_DURING_STREAM - 1) * SWITCH_EVERY_MS < streamMs, 'every switch must land while deltas are still arriving');
  assert.ok(LEG_GRACE_MS >= 10_000);
  assert.equal(STOP_BUTTON, 'button[aria-label="Stop generating"]');
});

test('summariseLeg carries every reading through and reports null, never 0, for what was not measured', () => {
  const rec = { deltasSent: 3000, achievedPerSec: 149.7, streamMs: 20030, backpressureWaits: 0, aborted: false, chars: 13500 };
  const layout = { commits: 1200, layouts: 1210, layoutsPerFrame: 1.0, commitsPerFrame: 0.99, frames: 1195, elapsedMs: 20100 };
  const probe = { longtaskTotalMs: 800, longtaskMaxMs: 120, longtaskCount: 9, frameGapMaxMs: 150, windowMs: 20500, longtaskSupported: true };
  const ipcRead = { tickSamples: 200, observedMs: 20500, maxTickDelayMs: 2, sawHidden: false, pings: 200, totalStallMs: 10, maxMs: 130, over250ms: 0, over1000ms: 0, openStallMs: null, rejectedPings: 0, missedTicks: 0 };
  const mainThread = mainThreadDelta({ taskMs: 1000, scriptMs: 500 }, { taskMs: 7100.26, scriptMs: 4400 }, probe.windowMs);
  assert.equal(mainThread.taskMs, 6100.3);
  assert.equal(mainThread.scriptMs, 3900);
  assert.equal(mainThread.taskPct, 29.8);
  assert.equal(mainThreadDelta({ taskMs: null }, { taskMs: 5 }, 100).taskMs, null, 'a missing counter is null, never a 5 ms cost');
  const leg = summariseLeg({ rec, planned: 3000, perSec: 150, firstResponseMs: 110, turnMs: 20400, turnEndSignal: 'stop-button', charsShown: 12900, layout, probe, ipcRead, pingMs: 100, mainThread });
  assert.equal(leg.taskMs, 6100.3);
  assert.equal(leg.taskPct, 29.8);
  assert.equal(leg.deltasSent, 3000);
  assert.equal(leg.perSecAchieved, 149.7);
  assert.equal(leg.framesPerSec, 59.5);
  assert.equal(leg.longtaskTotalMs, 800);
  assert.equal(leg.ipc.pings, 200);
  assert.equal(leg.ipc.everyMs, 100);
  assert.equal(leg.stall.verdict, 'none');

  const empty = summariseLeg({ rec: null, planned: 3000, perSec: 150, firstResponseMs: null, turnMs: null, turnEndSignal: null, charsShown: null, layout: null, probe: null, ipcRead: { error: 'x' }, pingMs: 100 });
  for (const k of ['deltasSent', 'perSecAchieved', 'framesPerSec', 'longtaskTotalMs', 'commits', 'charsShown']) assert.equal(empty[k], null, `${k} should be null`);
  assert.equal(empty.ipc.error, 'x');
  assert.equal(empty.stall.verdict, 'unknown');
});

test('summariseStreamSwitches counts only switches made during the stream, split by target', () => {
  const sw = [
    { duringStream: true, ok: true, paintedMs: 300, intoStreaming: false, mode: 'pill' },
    { duringStream: true, ok: true, paintedMs: 80, intoStreaming: true, mode: 'pill' },
    { duringStream: true, ok: false, paintedMs: null, intoStreaming: false, mode: 'none', reason: 'no pill' },
    { duringStream: false, ok: true, paintedMs: 5000, intoStreaming: false, mode: 'pill' },   // after the stream ended: excluded
    { duringStream: true, ok: true, paintedMs: 400, intoStreaming: false, mode: 'menu' },
    { duringStream: true, ok: true, paintedMs: 350, intoStreaming: false, mode: 'pill' },
  ];
  const s = summariseStreamSwitches(sw);
  assert.equal(s.switchCount, 6);
  assert.equal(s.duringStream, 5);
  assert.equal(s.verifiedSwitches, 4);
  assert.equal(s.failedSwitches, 1);
  assert.equal(s.menuSwitches, 1);
  assert.equal(s.intoHugeMedianMs, 350);
  assert.equal(s.intoStreamingMedianMs, 80);
  assert.equal(summariseStreamSwitches([]).switchPaintedMedianMs, null);
});

test('medianRun medians every NUMERIC_PATH, keeps nulls null, and rolls stall verdicts up by WORST', () => {
  const run = (i, verdict) => ({
    deltas: { planned: 3000, perSecTarget: 150 },
    visible: { deltasSent: 3000, longtaskTotalMs: 100 + i, ipc: { pings: 10 + i, totalStallMs: i }, stall: { verdict } },
    switching: { switchPaintedMedianMs: 200 + i, stall: { verdict: 'none' } },
    hidden: { longtaskTotalMs: null, stall: { verdict: 'none' } },
    probe: { longtaskTotalMs: 500 + i },
  });
  const m = medianRun([run(0, 'none'), run(1, 'main'), run(2, 'none')]);
  assert.equal(m.visible.longtaskTotalMs, 101);
  assert.equal(m.visible.ipc.pings, 11);
  assert.equal(m.switching.switchPaintedMedianMs, 201);
  assert.equal(m.hidden.longtaskTotalMs, null);
  assert.equal(m.visible.stallVerdict, 'main', 'one main-process verdict must not be averaged away');
  assert.equal(m.hidden.stallVerdict, 'none');
  for (const p of NUMERIC_PATHS) assert.ok(typeof p === 'string' && p.length > 0);
});

test('every nativeStream PRIMARY path is a NUMERIC_PATH of this scenario', () => {
  const mine = PRIMARY.filter((p) => p.startsWith('nativeStream.median.')).map((p) => p.slice('nativeStream.median.'.length));
  assert.equal(mine.length, 2);
  for (const p of mine) assert.ok(NUMERIC_PATHS.includes(p), `${p} is gated but not produced by medianRun`);
});

function diagnosticLegHarness({ failSend = false, failInstallReply = false } = {}) {
  let callback = null, off = 0, done, current = {}, clock = 0;
  const requests = [], plans = [], calls = [];
  const root = { getAttribute: () => 'owned', closest: () => null };
  const page = vm.createContext({ TextEncoder, performance: { now: () => ++clock },
    document: { visibilityState: 'visible', querySelectorAll: () => [root] },
    window: { claude: { on: { transcriptEvent: cb => { calls.push('register'); callback = cb; return cb; } },
      off: (channel, handle) => { assert.equal(channel, 'transcript:event'); assert.equal(handle, callback); callback = null; off++; } } } });
  const fake = { requests, plan: value => { current = value; plans.push(value); }, plannedText: () => splitDeltas(current.text, current.deltas).join(''),
    expectCompletion: () => new Promise(resolve => { done = resolve; }) };
  const cdp = { send: async () => ({ metrics: ['TaskDuration', 'ScriptDuration', 'LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration'].map(name => ({ name, value: 1 })) }),
    evaluate: async source => {
      calls.push(source);
      if (source.includes('window.claude.native.send')) {
        calls.push('send'); if (failSend) throw Error('injected send failure');
        const text = current.text ?? 'legacy markdown';
        if (callback) {
          const chunks = splitDeltas(text, current.deltas);
          chunks.forEach((text, i) => callback({ sessionId: 'owned', uuid: `text-${i}`, type: 'assistant-text', data: { text, partId: 'text-0' } }));
          callback({ sessionId: 'owned', uuid: 'terminal', type: 'turn-complete', data: { stopReason: 'stop' } });
        }
        const rec = { index: requests.length, stream: true, plannedDeltas: current.deltas, deltasSent: current.deltas, chars: text.length,
          aborted: false, backpressureWaits: 0, streamMs: 10, startedAt: 1, endedAt: 2,
          ...(current.completionDiagnostic ? { completionDiagnostic: { plannedText: text, contentWrites: current.deltas, writtenTextChars: text.length,
            finishWritten: true, doneWritten: true, completed: true, writeCompletedAt: 2, endRequested: true, endRequestedAt: 2, writeError: null, prematureClose: false } } : {}) };
        requests.push(rec); done(rec); return { status: 'sent' };
      }
      if (source.includes('__perfStreamDrain') || source.includes('const roots =')) {
        const result = vm.runInContext(source, page);
        if (failInstallReply && source.includes('collector already active')) throw Error('injected install reply failure');
        return result;
      }
      if (source.includes('legacy IPC boundary')) return { ready: true };
      if (source.includes('readIpcStallProbe:')) return { pings: 2, totalStallMs: 0, maxMs: 2, openStallMs: null, rejectedPings: 0,
        tickSamples: 2, observedMs: 100, maxTickDelayMs: 0, sawHidden: false };
      if (source.includes('const inWin =')) return { windowMs: 100, longtaskMaxMs: 0, longtaskTotalMs: 0, longtaskCount: 0, frameGapMaxMs: 0 };
      if (source.includes('window.__layoutCost.read')) return { attached: true, frames: 2, commits: 1, elapsedMs: 100 };
      if (source.includes('new MutationObserver')) return { attached: true };
      if (source.includes('chatLen()')) return 20;
      return true;
    } };
  return { cdp, fake, calls, plans, off: () => off, page };
}

test('actual streamLeg optional diagnostic registers before send and closes after legacy end mark', async () => {
  const h = diagnosticLegHarness();
  const r = await streamLeg(h.cdp, h.fake, { label: 'native-stream:visible', sessionId: 'owned', deltas: 6, perSec: 150,
    seed: 'visible', pingMs: 100, warnings: [], completionDiagnostics: true });
  assert.equal(r.completionDiagnostic.status, 'measured', JSON.stringify(r.completionDiagnostic));
  assert.ok(h.calls.indexOf('register') < h.calls.indexOf('send'));
  assert.equal(h.off(), 1);
  assert.equal(h.page.window.__perfStreamDrain, undefined);
  assert.equal(r.turnEndSignal, 'stop-button');
  assert.equal(r.completionDiagnostic.producer.index, 0);
  const end = h.calls.findIndex(s => s.includes?.('mark("native-stream:visible:end")'));
  const receipt = h.calls.findIndex(s => s.includes?.('return window.__perfStreamDrain.read'));
  assert.ok(end >= 0 && receipt > end, 'drain snapshots happen after legacy measurement window');
});

test('standard streamLeg leaves fixture and timing fields alone and never registers diagnostic listener', async () => {
  const h = diagnosticLegHarness();
  const r = await streamLeg(h.cdp, h.fake, { label: 'native-stream:visible', sessionId: 'owned', deltas: 6, perSec: 150, seed: 'visible', pingMs: 100, warnings: [] });
  assert.equal(r.completionDiagnostic, undefined);
  assert.equal(h.calls.includes('register'), false);
  assert.deepEqual(h.plans, [{ deltas: 6, perSec: 150, seed: 'visible' }]);
  assert.ok(NUMERIC_PATHS.every(p => !p.includes('completionDiagnostic')));
});

test('streamLeg cleans an installed listener even when the registration reply fails before send', async () => {
  const h = diagnosticLegHarness({ failInstallReply: true });
  await assert.rejects(streamLeg(h.cdp, h.fake, { label: 'native-stream:visible', sessionId: 'owned', deltas: 6, perSec: 150,
    seed: 'visible', pingMs: 100, warnings: [], completionDiagnostics: true }), /injected install reply failure/);
  assert.equal(h.off(), 1); assert.equal(h.page.window.__perfStreamDrain, undefined);
  assert.equal(h.calls.includes('send'), false);
});

test('streamLeg removes receipt listener on send failure without touching other listeners', async () => {
  const h = diagnosticLegHarness({ failSend: true });
  await assert.rejects(streamLeg(h.cdp, h.fake, { label: 'native-stream:visible', sessionId: 'owned', deltas: 6, perSec: 150,
    seed: 'visible', pingMs: 100, warnings: [], completionDiagnostics: true }), /injected send failure/);
  assert.equal(h.off(), 1); assert.equal(h.page.window.__perfStreamDrain, undefined);
});

test('MEASURES names the fake endpoint, the rate, and what the scenario is blind to', () => {
  assert.equal(MEASURES.scenario, 'native-stream');
  assert.ok(MEASURES.configuration.some((c) => c.includes(`${STREAM_PER_SEC}/s`)));
  assert.ok(MEASURES.configuration.some((c) => /fake endpoint/.test(c)));
  assert.ok(MEASURES.blindTo.some((b) => /real engine/.test(b)));
  assert.ok(MEASURES.blindTo.some((b) => /buddy window/.test(b)));
});
