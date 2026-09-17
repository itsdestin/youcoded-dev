// Unit tests for scenario-native-stream.mjs — everything checkable without an app.
// Run: node --test scripts/perf-lab/tests/scenario-native-stream.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FIRST_SWITCH_AT_MS, LEG_GRACE_MS, MEASURES, NUMERIC_PATHS, STOP_BUTTON, STREAM_DELTAS, STREAM_PER_SEC,
  SWITCHES_DURING_STREAM, SWITCH_EVERY_MS, installStreamHelpers, mainThreadDelta, medianRun, summariseLeg, summariseStreamSwitches,
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
  const ipcRead = { pings: 200, totalStallMs: 10, maxMs: 130, over250ms: 0, over1000ms: 0, openStallMs: null, rejectedPings: 0, missedTicks: 0 };
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
  assert.equal(mine.length, 3);
  for (const p of mine) assert.ok(NUMERIC_PATHS.includes(p), `${p} is gated but not produced by medianRun`);
});

test('MEASURES names the fake endpoint, the rate, and what the scenario is blind to', () => {
  assert.equal(MEASURES.scenario, 'native-stream');
  assert.ok(MEASURES.configuration.some((c) => c.includes(`${STREAM_PER_SEC}/s`)));
  assert.ok(MEASURES.configuration.some((c) => /fake endpoint/.test(c)));
  assert.ok(MEASURES.blindTo.some((b) => /real engine/.test(b)));
  assert.ok(MEASURES.blindTo.some((b) => /buddy window/.test(b)));
});
