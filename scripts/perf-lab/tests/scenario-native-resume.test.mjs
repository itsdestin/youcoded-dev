// Unit tests for scenario-native-resume.mjs — everything checkable without an app.
// Run: node --test scripts/perf-lab/tests/scenario-native-resume.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  IPC_PING_MS, MEASURES, NUMERIC_PATHS, RESUME_EVENT, STEP_KEYS, STOP_BUTTON, TURN_DELTAS, TURN_PER_SEC,
  installResumeHelpers, ipcSumOfSteps, medianRun,
} from '../scenario-native-resume.mjs';

// The page helper is a template literal evaluated in the renderer: an apostrophe
// inside one of its strings is unescaped by the template and the injected code
// then fails to PARSE — which is what aborted shakedown 3 on 2026-09-16, hours
// after every unit test here was green. Parsing it under Node catches that class.
test('the injected page helper parses as JavaScript', async () => {
  const sources = [];
  await installResumeHelpers({ evaluate: async (src) => { sources.push(src); return true; } });
  assert.equal(sources.length, 1);
  assert.doesNotThrow(() => new Function(sources[0]));
});
import { PRIMARY } from '../compare.mjs';

test('defaults: short replies, ~20 pings a second, the app\'s own resume event and stop control', () => {
  assert.ok(TURN_DELTAS / TURN_PER_SEC <= 5, 'a reply here is a few seconds — the reply is not what is measured');
  assert.equal(IPC_PING_MS, 50);
  assert.equal(RESUME_EVENT, 'youcoded:resume-session');
  assert.equal(STOP_BUTTON, 'button[aria-label="Stop generating"]');
  assert.deepEqual(STEP_KEYS, ['createCc', 'browse', 'reveal', 'resume', 'pageUp', 'turn', 'tearoff', 'detachedTurn']);
});

test('ipcSumOfSteps sums over steps that reported, counts the ones that did not, and keeps pings beside the total', () => {
  const steps = [
    { ipc: { pings: 20, totalStallMs: 5, over250ms: 0, over1000ms: 0, maxMs: 90, rejectedPings: 0 } },
    { ipc: { pings: 30, totalStallMs: 400, over250ms: 1, over1000ms: 0, maxMs: 450, rejectedPings: 1 } },
    { ipc: { error: 'probe not installed' } },
    { ipc: null },
  ];
  const s = ipcSumOfSteps(steps);
  assert.equal(s.steps, 2);
  assert.equal(s.readErrors, 2);
  assert.equal(s.pings, 50);
  assert.equal(s.totalStallMs, 405);
  assert.equal(s.over250ms, 1);
  assert.equal(s.maxMs, 450);
  assert.equal(s.rejectedPings, 1);
  // Nothing reported: pings 0 and maxMs null — never a healthy-looking zero max.
  const none = ipcSumOfSteps([{ ipc: null }]);
  assert.equal(none.pings, 0);
  assert.equal(none.maxMs, null);
});

test('medianRun medians every NUMERIC_PATH and rolls each step\'s stall verdict up by WORST', () => {
  const run = (i, browseVerdict) => ({
    nativeSessionsOnDisk: 100,
    browse: { openMs: 300 + i, rowsFirst: 50, ipc: { maxMs: 100 + i, totalStallMs: i, pings: 20 }, probe: { longtaskMaxMs: 50 }, stall: { verdict: browseVerdict } },
    resume: { paintedMs: 900 + i, entries: 60, ipc: { maxMs: 200 + i }, stall: { verdict: 'none' } },
    tearoff: { ms: 700 + i, windows: 2, ipc: {}, stall: { verdict: 'renderer' } },
    ipcSumOfSteps: { totalStallMs: 50 + i, maxMs: 200 + i, pings: 1000 },
    probe: { longtaskTotalMs: 800 + i },
  });
  const m = medianRun([run(0, 'none'), run(1, 'main'), run(2, 'none')]);
  assert.equal(m.browse.openMs, 301);
  assert.equal(m.browse.ipc.maxMs, 101);
  assert.equal(m.resume.paintedMs, 901);
  assert.equal(m.ipcSumOfSteps.totalStallMs, 51);
  assert.equal(m.pageUp.ms, null, 'a step no run measured stays null');
  assert.equal(m.browse.stallVerdict, 'main');
  assert.equal(m.tearoff.stallVerdict, 'renderer');
  assert.equal(m.pageUp.stallVerdict, null);
});

test('every nativeResume PRIMARY path is a NUMERIC_PATH of this scenario', () => {
  const mine = PRIMARY.filter((p) => p.startsWith('nativeResume.median.')).map((p) => p.slice('nativeResume.median.'.length));
  assert.equal(mine.length, 3);
  for (const p of mine) assert.ok(NUMERIC_PATHS.includes(p), `${p} is gated but not produced by medianRun`);
});

test('MEASURES describes the seeded scale, the resume route, and the blind spots', () => {
  assert.equal(MEASURES.scenario, 'native-resume');
  assert.ok(MEASURES.configuration.some((c) => /100 native session files/.test(c)));
  assert.ok(MEASURES.configuration.some((c) => /youcoded:resume-session/.test(c)));
  assert.ok(MEASURES.blindTo.some((b) => /detached window/.test(b)));
});
