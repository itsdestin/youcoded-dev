// Unit tests for scenario-idle.mjs — everything checkable without launching the app.
//
// WHY these exist, in three parts:
//  1. The cadence maths (stallFloor / clusterStarts / detectPeriodicity /
//     summarizeCadence) IS the scenario's finding. "The app stalls every 10 seconds"
//     is a claim about arithmetic on timestamps, and arithmetic can be pinned here in
//     milliseconds instead of being inferred from a 4-minute app run.
//  2. The honesty rules are the reason the scenario is trustworthy at all: null rather
//     than a fabricated period, null rather than a per-session tax drawn from one
//     point, null rather than a zero that reads as "responsive". Each of those has a
//     test whose failure mode is the rig quietly reporting good news.
//  3. The riskiest remaining content is JavaScript SOURCE embedded in template literals
//     and shipped to the renderer. A typo there fails at run time inside CDP with a
//     useless message, so the fake cdp below PARSES every expression the module emits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  NUMERIC_KEYS, TAX_KEYS, SESSION_COUNTS,
  medianRun, stallFloor, medianAbsoluteDeviation, clusterStarts, detectPeriodicity,
  summarizeCadence, perSessionTax, perSessionTaxTable, pickTranscript, runIdleScenario,
  cloneSessionId, materializeClones, removeClones,
} from '../scenario-idle.mjs';

// ---------------------------------------------------------------------------
// stallFloor — the sensitivity of the whole instrument
// ---------------------------------------------------------------------------

test('stallFloor is derived from the run\'s own baseline, never a fixed perceptual threshold', () => {
  // A quiet main thread answers in ~1ms. The floor must land far below the 100ms
  // "a click feels laggy" threshold, or a 40ms block — the actual suspect — is invisible.
  assert.equal(stallFloor([1, 1, 2, 1, 1]), 15);
  assert.ok(stallFloor([1, 1, 2, 1, 1]) < 40, 'a 40ms block must be above the floor');
  // A slow machine raises its own floor rather than reporting every ping as a stall.
  assert.equal(stallFloor([100, 100, 100]), 400);
  // The "headroom above baseline" guard wins in the middle band.
  assert.equal(stallFloor([10, 10, 10]), 40);
});

test('stallFloor is null when nothing was pinged — not a number pulled from nowhere', () => {
  assert.equal(stallFloor([]), null);
  assert.equal(stallFloor(null), null);
});

// ---------------------------------------------------------------------------
// clusterStarts — one block is one event, however often it was sampled
// ---------------------------------------------------------------------------

test('clusterStarts collapses the several pings that one block elongates', () => {
  // A 40ms block at a 25ms ping interval elongates two consecutive pings.
  assert.deepEqual(clusterStarts([0, 25, 10000, 10025, 20000], { clusterMs: 500 }), [0, 10000, 20000]);
});

test('clusterStarts chains from the previous SAMPLE, so continuous stalling stays one event', () => {
  // 25ms apart for a full second: the app was stalling the whole time. That is one
  // stretch, not 40 evenly-spaced events — which would otherwise be reported as a
  // beautifully regular 25ms cadence.
  const dense = Array.from({ length: 40 }, (_, i) => i * 25);
  assert.deepEqual(clusterStarts(dense, { clusterMs: 500 }), [0]);
});

test('clusterStarts sorts and drops garbage rather than emitting NaN gaps', () => {
  assert.deepEqual(clusterStarts([10000, 0, NaN, null, undefined, 25], { clusterMs: 500 }), [0, 10000]);
  assert.deepEqual(clusterStarts([], { clusterMs: 500 }), []);
  assert.deepEqual(clusterStarts(null, { clusterMs: 500 }), []);
});

// ---------------------------------------------------------------------------
// detectPeriodicity — the finding
// ---------------------------------------------------------------------------

/** Stall start times for a block firing every `periodMs`, sampled twice per block. */
function cadenceStarts({ periodMs = 10000, count = 12, samplesPerBlock = 2, everyMs = 25 } = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    for (let s = 0; s < samplesPerBlock; s++) out.push(i * periodMs + s * everyMs);
  }
  return out;
}

test('a clean 10-second cadence is reported as exactly that, with zero dispersion', () => {
  const p = detectPeriodicity(cadenceStarts());
  assert.equal(p.periodMs, 10000);
  assert.equal(p.eventCount, 12);          // 24 samples, clustered into 12 blocks
  assert.equal(p.sampleCount, 24);
  assert.equal(p.gapMadMs, 0);
  assert.equal(p.dispersionRatio, 0);
  assert.equal(p.regular, true);
  assert.equal(p.reason, null);
});

test('clustering is what stops a 40ms block being reported as a 25ms cadence', () => {
  // Without clustering the gaps would be [25, 9975, 25, 9975, …] whose median is 25 —
  // a confident report of a cadence that does not exist.
  const starts = cadenceStarts();
  assert.equal(detectPeriodicity(starts, { clusterMs: 500 }).periodMs, 10000);
  assert.equal(detectPeriodicity(starts, { clusterMs: 0 }).periodMs, 25);
});

test('scheduler jitter still reads as a cadence; genuinely scattered stalls do not', () => {
  // setInterval on a busy main thread drifts by tens of ms. That must not hide a timer.
  const jittery = [0, 10120, 19880, 30090, 39940, 50210, 59900];
  const j = detectPeriodicity(jittery);
  assert.equal(j.periodMs, 10120);
  assert.equal(j.regular, true);
  assert.ok(j.dispersionRatio <= 0.25, `dispersionRatio ${j.dispersionRatio} should be small`);

  // Human-ish, unpatterned stalls: a median gap still exists, but it is not a cadence
  // and the result says so instead of naming a period as though it were one.
  const scattered = [0, 500, 9000, 9200, 40000, 41000, 95000];
  const s = detectPeriodicity(scattered);
  assert.equal(typeof s.periodMs, 'number');
  assert.equal(s.regular, false, 'scattered stalls must not be called regular');
  assert.ok(s.dispersionRatio > 0.25);
});

test('two stalls NEVER produce a period — one gap corroborates nothing', () => {
  const p = detectPeriodicity([0, 10000]);
  assert.equal(p.periodMs, null);
  assert.equal(p.eventCount, 2);
  assert.equal(p.gapsMs.length, 1);
  assert.equal(p.regular, null);
  assert.match(p.reason, /only 2 stall event\(s\)/);
});

test('three stalls are still too few by default, and the reason says how many are needed', () => {
  const p = detectPeriodicity([0, 10000, 20000]);
  assert.equal(p.periodMs, null);
  assert.match(p.reason, /4 are needed/);
  // …and the threshold is a parameter, not a hidden constant.
  assert.equal(detectPeriodicity([0, 10000, 20000], { minGaps: 2 }).periodMs, 10000);
});

test('a single stall is an event count of one and no period', () => {
  const p = detectPeriodicity([4200]);
  assert.equal(p.periodMs, null);
  assert.equal(p.eventCount, 1);
  assert.deepEqual(p.gapsMs, []);
  assert.deepEqual(p.eventStartsMs, [4200]);
  assert.match(p.reason, /only 1 stall event/);
});

test('no stalls at all is a stated result, not a period of zero', () => {
  const p = detectPeriodicity([]);
  assert.equal(p.periodMs, null);
  assert.equal(p.eventCount, 0);
  assert.equal(p.sampleCount, 0);
  assert.equal(p.regular, null);
  assert.match(p.reason, /no stalls above the floor/);
});

test('detectPeriodicity caps the arrays it reports so a noisy run cannot bloat the report', () => {
  const many = Array.from({ length: 200 }, (_, i) => i * 1000);
  const p = detectPeriodicity(many, { maxReported: 10 });
  assert.equal(p.eventCount, 200);            // the COUNT is never truncated
  assert.equal(p.eventStartsMs.length, 10);
  assert.equal(p.gapsMs.length, 10);
  assert.equal(p.truncated, true);
});

test('medianAbsoluteDeviation is null on an empty set and 0 on identical values', () => {
  assert.equal(medianAbsoluteDeviation([]), null);
  assert.equal(medianAbsoluteDeviation([7, 7, 7]), 0);
  assert.equal(medianAbsoluteDeviation([10, 10, 10, 100]), 0);  // one outlier cannot dominate
});

// ---------------------------------------------------------------------------
// summarizeCadence
// ---------------------------------------------------------------------------

test('summarizeCadence needs a majority, and stays null when no repeat could say', () => {
  const yes = { periodMs: 10000, regular: true };
  const no = { periodMs: 8000, regular: false };
  const undecided = { periodMs: null, regular: null };
  assert.equal(summarizeCadence([yes, yes]), 'periodic');
  assert.equal(summarizeCadence([no, no]), 'irregular');
  assert.equal(summarizeCadence([yes, no]), 'mixed');       // a tie is its own answer
  assert.equal(summarizeCadence([yes, yes, no]), 'periodic');
  assert.equal(summarizeCadence([undecided, undecided]), null);
  assert.equal(summarizeCadence([]), null);
  // An undecided repeat is ignored rather than counted as evidence either way.
  assert.equal(summarizeCadence([yes, undecided]), 'periodic');
});

// ---------------------------------------------------------------------------
// perSessionTax — "why does it get worse with more sessions open?"
// ---------------------------------------------------------------------------

test('perSessionTax is the slope between the lowest and highest measured session count', () => {
  const t = perSessionTax({ 1: { ipcTotalStallMs: 200 }, 6: { ipcTotalStallMs: 1200 } }, 'ipcTotalStallMs');
  assert.equal(t.perSession, 200);        // (1200 - 200) / (6 - 1)
  assert.equal(t.lowN, 1);
  assert.equal(t.highN, 6);
  assert.equal(t.spanN, 5);
  assert.equal(t.lowValue, 200);
  assert.equal(t.highValue, 1200);
  assert.equal(t.key, 'ipcTotalStallMs');
});

test('perSessionTax uses the extreme counts, not adjacent ones', () => {
  const t = perSessionTax({ 1: { m: 0 }, 3: { m: 999 }, 11: { m: 100 } }, 'm');
  assert.equal(t.lowN, 1);
  assert.equal(t.highN, 11);
  assert.equal(t.perSession, 10);
});

test('perSessionTax returns null — never 0 — with fewer than two measured counts', () => {
  assert.equal(perSessionTax({ 1: { m: 5 } }, 'm'), null);
  assert.equal(perSessionTax({}, 'm'), null);
  assert.equal(perSessionTax(null, 'm'), null);
  // A null at one count leaves one point, which is not a slope.
  assert.equal(perSessionTax({ 1: { m: 5 }, 6: { m: null } }, 'm'), null);
  // A key that was never measured at all.
  assert.equal(perSessionTax({ 1: { m: 5 }, 6: { m: 9 } }, 'somethingElse'), null);
});

test('perSessionTaxTable covers every TAX_KEY and nulls the ones it cannot answer', () => {
  const table = perSessionTaxTable({
    1: { ipcTotalStallMs: 100, cpuPct: 1, pssMb: null },
    6: { ipcTotalStallMs: 600, cpuPct: 2, pssMb: null },
  });
  assert.deepEqual(Object.keys(table).sort(), [...TAX_KEYS].sort());
  assert.equal(table.ipcTotalStallMs.perSession, 100);
  assert.equal(table.cpuPct.perSession, 0.2);
  assert.equal(table.pssMb, null);
  assert.equal(table.ipcMaxMs, null);
});

// ---------------------------------------------------------------------------
// medianRun / pickTranscript
// ---------------------------------------------------------------------------

test('medianRun projects only NUMERIC_KEYS and keeps an always-null metric null', () => {
  const runs = [
    { ipcMaxMs: 10, periodicStallMs: null, blame: 'main-process', warnings: ['a'], periodicity: {} },
    { ipcMaxMs: 30, periodicStallMs: null, blame: 'main-process', warnings: [], periodicity: {} },
    { ipcMaxMs: 20, periodicStallMs: null, blame: null, warnings: [], periodicity: {} },
  ];
  const m = medianRun(runs);
  assert.equal(m.ipcMaxMs, 20);
  assert.equal(m.periodicStallMs, null);          // absent, never 0
  assert.equal('blame' in m, false);
  assert.equal('periodicity' in m, false);
  assert.equal('warnings' in m, false);
  assert.deepEqual(Object.keys(m).sort(), [...NUMERIC_KEYS].sort());
});

test('pickTranscript prefers medium, and NAMES any fallback because size changes the answer', () => {
  const full = { transcripts: { small: { turns: 50 }, medium: { turns: 2500 } } };
  assert.equal(pickTranscript(full).size, 'medium');
  assert.equal(pickTranscript(full).warning, null);

  const only = { transcripts: { small: { turns: 50 } } };
  const p = pickTranscript(only);
  assert.equal(p.size, 'small');
  assert.match(p.warning, /no 'medium' transcript/);
  assert.match(p.warning, /fell back to 'small' \(50 turns\)/);
  assert.match(p.warning, /NOT comparable/);
});

test('pickTranscript refuses to measure fresh sessions when the fixture has no transcripts', () => {
  // Fresh sessions are empty, and an empty session puts the per-session term back at
  // zero — the exact blindness this scenario exists to remove.
  assert.throws(() => pickTranscript({ transcripts: {} }), /no pre-built transcripts/);
  assert.throws(() => pickTranscript({}), /refusing to report idle numbers/);
});

// ---------------------------------------------------------------------------
// The scenario, against a fake CDP that parses every expression it is handed
// ---------------------------------------------------------------------------

// A REAL (tiny) fixture on disk. The scenario writes one transcript per session so no
// two sessions resume the same stored id, and that write path must be exercised by the
// tests rather than stubbed — it is the part that touches the filesystem.
const TMP = mkdtempSync(join(tmpdir(), 'perf-idle-test-'));
process.on('exit', () => { try { rmSync(TMP, { recursive: true, force: true }); } catch { /* already gone */ } });

/** Two JSONL lines that embed their own sessionId, exactly as fixture.mjs writes them. */
function writeTranscript(sessionId) {
  const path = join(TMP, `${sessionId}.jsonl`);
  writeFileSync(path, [
    JSON.stringify({ type: 'user', sessionId, cwd: '/tmp/perf/alpha', message: { role: 'user', content: 'hi' } }),
    JSON.stringify({ type: 'assistant', sessionId, cwd: '/tmp/perf/alpha', message: { role: 'assistant', content: 'yo' } }),
  ].join('\n') + '\n');
  return path;
}

const fixture = {
  projects: { alpha: '/tmp/perf/alpha' },
  transcripts: {
    small: { sessionId: 'aaa', slug: '-tmp-perf-alpha', turns: 50, path: writeTranscript('aaa') },
    medium: { sessionId: 'bbb', slug: '-tmp-perf-alpha', turns: 2500, path: writeTranscript('bbb') },
    huge: { sessionId: 'ccc', slug: '-tmp-perf-alpha', turns: 3500, path: writeTranscript('ccc') },
  },
};

/** The .jsonl files sitting in the fixture dir right now. */
const transcriptFiles = () => readdirSync(TMP).filter((f) => f.endsWith('.jsonl')).sort();

/**
 * `[startMs, roundTripMs]` pairs for a still app whose main process blocks for
 * `blockMs` every `periodMs` — i.e. the suspected defect, in the probe's own format.
 */
function idleSamples({ periodMs = 10000, blockMs = 40, windowMs = 120000, everyMs = 25, baseMs = 1 } = {}) {
  const out = [];
  for (let t = 0; t < windowMs; t += everyMs) {
    const phase = t % periodMs;
    // A ping issued inside the block waits out the rest of it.
    out.push([t, phase < blockMs ? blockMs - phase + baseMs : baseMs]);
  }
  return out;
}

/** probe-ipc's own summary arithmetic, so the fake's totals agree with its samples. */
function summarize(samples, everyMs) {
  const rt = samples.map((s) => s[1]).sort((a, b) => a - b);
  const at = (q) => (rt.length ? rt[Math.min(rt.length - 1, Math.floor(rt.length * q))] : null);
  const over = (n) => samples.filter((s) => s[1] > n).length;
  return {
    pings: samples.length,
    missedTicks: 0,
    medianMs: at(0.5), p95Ms: at(0.95), maxMs: rt.length ? rt[rt.length - 1] : null,
    over100ms: over(100), over250ms: over(250), over1000ms: over(1000),
    totalStallMs: Math.round(samples.reduce((a, s) => a + Math.max(0, s[1] - everyMs), 0)),
    worst: [...samples].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, ms]) => ({ atMs: t, roundTripMs: ms })),
  };
}

function fakeApp({
  samples = idleSamples(),
  everyMs = 25,
  longtasks = [],
  longtaskSupported = true,
  ipc = {},
  probe = {},
  family,
  createFails = null,
  destroyFails = null,
  rawThrows = false,
  notReady = false,
} = {}) {
  const calls = [];
  const app = {
    calls,
    ...(family ? { family } : {}),
    cdp: {
      async evaluate(expr) {
        // Parse-only check — proves the generated in-page source is valid JS. It is
        // never executed, so `window` never has to exist.
        new Function(`return (${expr});`);

        if (expr.includes('perf-lab: idle raw probe read')) {
          calls.push('raw');
          if (rawThrows) throw new Error('boom: the page reloaded');
          return { ipcT0: 0, everyMs, samples, probeT0: 0, longtaskSupported, longtasks };
        }
        if (expr.includes('readIpcStallProbe:')) {
          calls.push('read-ipc');
          return { ...summarize(samples, everyMs), ...ipc };
        }
        if (expr.includes('readProbe:')) {
          calls.push('read-probe');
          return {
            longtaskCount: longtasks.length,
            longtaskTotalMs: longtasks.reduce((a, l) => a + l[1], 0),
            longtaskMaxMs: Math.max(0, ...longtasks.map((l) => l[1])),
            frameGapCount: 0, frameGapMaxMs: 0, longtaskSupported,
            observedMs: 120000, frames: 3600, framesPerSec: 30, marks: [], errors: [],
            ...probe,
          };
        }
        if (expr.includes('setInterval(ping')) { calls.push('install-ipc'); return true; }
        if (expr.includes('requestAnimationFrame(tick)')) { calls.push('install-probe'); return { longtaskSupported }; }
        if (expr.includes('if (!window.__ipcStall) return false')) { calls.push('stop-ipc'); return true; }
        if (expr.includes('if (!window.__perfProbe) return false')) { calls.push('stop-probe'); return true; }
        if (expr.includes('session.create(')) {
          calls.push('create');
          return createFails ? { ok: false, error: createFails } : { ok: true, id: `sess-${calls.filter((c) => c === 'create').length}` };
        }
        if (expr.includes('session.destroy(')) {
          calls.push('destroy');
          return destroyFails ? { ok: false, error: destroyFails } : { ok: true };
        }
        if (expr.includes('Initializing session')) { calls.push('ready'); return !notReady; }
        throw new Error(`fake cdp: unrecognised expression: ${expr.slice(0, 140)}`);
      },
    },
  };
  return app;
}

// Timings shrunk so the tests never sleep meaningfully. Everything that is part of the
// MEASUREMENT (everyMs, clusterMs, minGaps) is left at its real value.
const FAST = { windowMs: 5, settleMs: 0, appearMs: 0, teardownSettleMs: 0, repeats: 1, readyMs: 200 };

test('runIdleScenario reports every session count with runs, a median, a cadence and coverage', async () => {
  const out = await runIdleScenario(fakeApp(), fixture, FAST);
  assert.deepEqual(Object.keys(out.byCount), ['1', '6']);
  assert.deepEqual(out.sessionCounts, SESSION_COUNTS);
  assert.equal(out.transcriptSize, 'medium');
  assert.equal(out.pingEveryMs, 25);

  for (const n of ['1', '6']) {
    const g = out.byCount[n];
    assert.equal(g.sessionCount, Number(n));
    assert.equal(g.runs.length, 1);
    // The canned data is a 40ms block every 10s: the finding the scenario exists for.
    assert.equal(g.cadence, 'periodic');
    assert.equal(g.median.periodicStallMs, 10000);
    assert.equal(g.median.periodicGapMadMs, 0);
    assert.equal(g.median.stallEventCount, 12);
    assert.equal(g.median.stallFloorMs, 15);
    // Latency, not averages: the 40ms hitch is plainly there in the maximum…
    assert.equal(g.median.ipcMaxMs, 41);
    // …and completely absent from the perceptual thresholds, which is exactly why
    // those cannot be the headline for this defect.
    assert.equal(g.median.ipcOver100ms, 0);
    assert.equal(g.median.sessionCount, Number(n));
    // Every key compare.mjs may take a median of is present on the median object.
    assert.deepEqual(Object.keys(g.median).sort(), [...NUMERIC_KEYS].sort());
  }
  // The window's reach travels WITH the numbers.
  assert.equal(out.cadencesCoveredMs, 5);
  assert.match(out.coverageNote, /nothing periodic faster than 5ms/);
  assert.match(out.coverageNote, /NOT a statement that the app is idle-clean/);
});

test('the sessions are RESUMED, N of them, each from its OWN transcript, and all destroyed', async () => {
  const app = fakeApp();
  const seen = [];
  const inner = app.cdp.evaluate;
  app.cdp.evaluate = async (expr) => { seen.push(expr); return inner(expr); };
  await runIdleScenario(app, fixture, { ...FAST, sessionCounts: [3] });

  const creates = seen.filter((e) => e.includes('session.create('));
  assert.equal(creates.length, 3, 'three sessions must be held open for N=3');
  const resumed = creates.map((e) => /resumeSessionId: "([^"]+)"/.exec(e)[1]);
  // Resumed, not fresh — a fresh session is empty and the per-session cost being
  // hunted scales with real session state.
  for (const e of creates) assert.match(e, /cwd: "\/tmp\/perf\/alpha"/);
  // DISTINCT ids. The app does not dedupe a repeated resumeSessionId; it runs a second
  // writer against the same transcript, which is a state its own takeover code calls a
  // bug. Three sessions must therefore be three stored sessions.
  assert.equal(new Set(resumed).size, 3, `expected three distinct resume ids, got ${resumed.join(', ')}`);
  assert.deepEqual(resumed, [0, 1, 2].map((i) => cloneSessionId('bbb', i)));
  assert.ok(!resumed.includes('bbb'), 'the fixture\'s own transcript is never resumed directly');
  assert.equal(app.calls.filter((c) => c === 'destroy').length, 3);
  assert.equal(app.calls[app.calls.length - 1], 'destroy');
});

test('the clones carry identical content, and the fixture is left exactly as found', async () => {
  const before = transcriptFiles();
  const app = fakeApp();
  const seen = [];
  const inner = app.cdp.evaluate;
  // Snapshot the directory mid-run, while the sessions are open.
  let during = null;
  app.cdp.evaluate = async (expr) => {
    if (expr.includes('setInterval(ping') && during === null) during = transcriptFiles();
    seen.push(expr);
    return inner(expr);
  };
  await runIdleScenario(app, fixture, { ...FAST, sessionCounts: [4] });
  assert.equal(during.length, before.length + 4, 'one transcript per open session must exist during the window');
  // Cleaned up: no 25 MB orphans, and no extra sessions in the app's session list.
  assert.deepEqual(transcriptFiles(), before);
});

test('probes are armed after the resumes and settle, and frozen before they are read', async () => {
  const app = fakeApp();
  await runIdleScenario(app, fixture, { ...FAST, sessionCounts: [2] });
  const c = app.calls;
  assert.ok(c.lastIndexOf('create') < c.indexOf('install-ipc'), 'probes must be armed after every resume');
  assert.ok(c.indexOf('install-ipc') < c.indexOf('stop-ipc'));
  assert.ok(c.indexOf('stop-ipc') < c.indexOf('read-ipc'), 'the probe must be frozen before it is read');
  assert.ok(c.indexOf('stop-probe') < c.indexOf('read-probe'), 'the probe must be frozen before it is read');
  assert.ok(c.indexOf('raw') < c.indexOf('destroy'), 'both probes are read before the sessions die');
});

test('NOTHING touches the app during the measurement window', async () => {
  // The scenario's entire claim is "the user did nothing". A rig that polled the
  // renderer during the window would be measuring its own instrument, so the window is
  // pinned as literally zero CDP traffic: arming the renderer probe is the last call
  // before it, and freezing the IPC probe is the first call after it.
  const app = fakeApp();
  await runIdleScenario(app, fixture, { ...FAST, sessionCounts: [1] });
  const armed = app.calls.indexOf('install-probe');
  const frozen = app.calls.indexOf('stop-ipc');
  assert.ok(armed >= 0 && frozen > armed);
  assert.equal(frozen, armed + 1, `expected no calls inside the window, saw ${app.calls.slice(armed + 1, frozen).join(', ')}`);
});

test('the per-session tax is the headline slope across session counts', async () => {
  // N=6 stalls five times as much as N=1 — the shape of a 5 + 3N cost.
  const app = fakeApp();
  const inner = app.cdp.evaluate;
  let n = 0;
  app.cdp.evaluate = async (expr) => {
    if (expr.includes('session.create(')) n++;
    if (expr.includes('perf-lab: idle raw probe read')) {
      // Six open sessions block for 200ms per tick instead of 40ms.
      return { ipcT0: 0, everyMs: 25, probeT0: 0, longtaskSupported: true, longtasks: [],
        samples: idleSamples({ blockMs: n >= 6 ? 200 : 40 }) };
    }
    if (expr.includes('readIpcStallProbe:')) return summarize(idleSamples({ blockMs: n >= 6 ? 200 : 40 }), 25);
    return inner(expr);
  };
  const out = await runIdleScenario(app, fixture, FAST);
  const tax = out.perSessionTax.ipcTotalStallMs;
  assert.ok(tax, 'a tax must be computable from two session counts');
  assert.equal(tax.lowN, 1);
  assert.equal(tax.highN, 6);
  assert.ok(tax.perSession > 0, `expected a positive per-session cost, got ${tax.perSession}`);
  assert.equal(tax.perSession, Math.round(((tax.highValue - tax.lowValue) / 5) * 100) / 100);
});

test('one session count means the per-session question is UNANSWERED, and says so', async () => {
  const out = await runIdleScenario(fakeApp(), fixture, { ...FAST, sessionCounts: [1] });
  assert.deepEqual(Object.values(out.perSessionTax).filter((t) => t !== null), []);
  assert.match(out.warnings.join(' '), /UNANSWERED, not answered with zero/);
});

test('zero pings nulls every derived number instead of reporting a suspiciously quiet app', async () => {
  const out = await runIdleScenario(fakeApp({ samples: [] }), fixture, { ...FAST, sessionCounts: [1] });
  const run = out.byCount['1'].runs[0];
  assert.equal(run.ipcPings, 0);                 // the honest count survives
  assert.equal(run.ipcMaxMs, null);
  assert.equal(run.ipcTotalStallMs, null);       // NOT 0
  assert.equal(run.ipcOver100ms, null);          // NOT 0
  assert.equal(run.stallEventCount, null);
  assert.equal(run.stallFloorMs, null);
  assert.equal(run.periodicStallMs, null);
  assert.match(out.warnings.join(' '), /completed 0 pings/);
  assert.match(out.warnings.join(' '), /rig failure, not a quiet app/);
});

test('zero stalls is reported as a result with a stated reach, not as a pass', async () => {
  // A perfectly flat 1ms main process for the whole window.
  const flat = Array.from({ length: 400 }, (_, i) => [i * 25, 1]);
  const out = await runIdleScenario(fakeApp({ samples: flat }), fixture, { ...FAST, sessionCounts: [1] });
  const run = out.byCount['1'].runs[0];
  assert.equal(run.stallEventCount, 0);
  assert.equal(run.periodicStallMs, null);
  assert.equal(out.byCount['1'].cadence, null);   // no verdict, not "clean"
  const w = out.warnings.join(' ');
  assert.match(w, /zero stalls above the 15ms floor/);
  assert.match(w, /rules out ONLY blocks larger than 15ms/);
  assert.match(w, /smaller blocks and slower cadences were not measured/);
});

test('too few stalls names its reason rather than inventing a period', async () => {
  const sparse = Array.from({ length: 400 }, (_, i) => [i * 25, i === 10 || i === 200 ? 90 : 1]);
  const out = await runIdleScenario(fakeApp({ samples: sparse }), fixture, { ...FAST, sessionCounts: [1] });
  const run = out.byCount['1'].runs[0];
  assert.equal(run.stallEventCount, 2);
  assert.equal(run.periodicStallMs, null);
  assert.match(out.warnings.join(' '), /periodicStallMs is null — only 2 stall event\(s\)/);
});

test('a dead long-task observer nulls the renderer AND the attribution, and says so', async () => {
  const out = await runIdleScenario(
    fakeApp({ longtaskSupported: false }), fixture, { ...FAST, sessionCounts: [1] },
  );
  const run = out.byCount['1'].runs[0];
  assert.equal(run.rendererLongtaskCount, null);
  assert.equal(run.rendererLongtaskTotalMs, null);
  // Critically: NOT "100% main process". Missing renderer data is missing data.
  assert.equal(run.mainProcessStallMs, null);
  assert.equal(run.rendererStallMs, null);
  assert.equal(run.blame, null);
  // The end-to-end cost is still real and still reported.
  assert.ok(run.ipcTotalStallMs > 0);
  const w = out.warnings.join(' ');
  assert.match(w, /long-task observer failed to attach/);
  assert.match(w, /nothing here says the main process was or was not at fault/);
});

test('with the renderer idle, the stall is attributed to the main process', async () => {
  const out = await runIdleScenario(fakeApp(), fixture, { ...FAST, sessionCounts: [1] });
  const run = out.byCount['1'].runs[0];
  assert.equal(run.blame, 'main-process');
  assert.equal(run.rendererStallMs, 0);
  assert.ok(run.mainProcessStallMs > 0);
});

test('cpuPct and pssMb are null with a warning when the process family is unreachable', async () => {
  const out = await runIdleScenario(fakeApp(), fixture, { ...FAST, sessionCounts: [1] });
  const run = out.byCount['1'].runs[0];
  assert.equal(run.cpuPct, null);      // never 0 — 0% CPU reads as "the app did nothing"
  assert.equal(run.pssMb, null);
  assert.match(out.warnings.join(' '), /app\.family\(\) is unavailable.*reported as null, not as 0/);
});

test('cpuPct and pssMb are reported when the family IS reachable', async () => {
  // An empty family is a real (if trivial) measurement: 0% over no processes. What
  // matters is that a present family produces numbers and no "not measured" warning.
  const out = await runIdleScenario(fakeApp({ family: () => [] }), fixture, { ...FAST, sessionCounts: [1] });
  const run = out.byCount['1'].runs[0];
  assert.equal(typeof run.cpuPct, 'number');
  assert.equal(typeof run.pssMb, 'number');
  assert.doesNotMatch(out.warnings.join(' '), /app\.family\(\) is unavailable/);
});

test('a create failure surfaces the app\'s own error text, never a guess', async () => {
  await assert.rejects(
    runIdleScenario(fakeApp({ createFails: 'ENOENT: no such transcript' }), fixture, { ...FAST, sessionCounts: [1] }),
    new RegExp(`session\\.create #0 failed while resuming 'medium'.*resumeSessionId=${cloneSessionId('bbb', 0)}.*ENOENT: no such transcript`, 's'),
  );
});

test('a failed read still disarms both probes and destroys every session', async () => {
  const app = fakeApp({ rawThrows: true });
  await assert.rejects(
    runIdleScenario(app, fixture, { ...FAST, sessionCounts: [2] }),
    /boom: the page reloaded/,
  );
  assert.ok(app.calls.includes('stop-ipc'), 'probes must be disarmed even when the read throws');
  assert.equal(app.calls.filter((c) => c === 'destroy').length, 2, 'both sessions must die');
});

test('a failed destroy is a warning, not a thrown-away measurement', async () => {
  const out = await runIdleScenario(
    fakeApp({ destroyFails: 'session already gone' }), fixture, { ...FAST, sessionCounts: [1] },
  );
  assert.equal(out.byCount['1'].runs[0].ipcMaxMs, 41);   // the measurement survived
  assert.match(out.warnings.join(' '), /session already gone/);
});

test('a session that never reports ready warns that resume work may be inside the window', async () => {
  const out = await runIdleScenario(
    fakeApp({ notReady: true }), fixture, { ...FAST, sessionCounts: [1], readyMs: 1 },
  );
  assert.match(out.warnings.join(' '), /still showed "Initializing session".*inflating every stall number/s);
});

test('repeats produce independent runs and a median over them', async () => {
  const app = fakeApp();
  const inner = app.cdp.evaluate;
  let n = 0;
  app.cdp.evaluate = async (expr) => {
    const v = await inner(expr);
    if (expr.includes('readIpcStallProbe:')) return { ...v, maxMs: 1000 * (++n) };
    return v;
  };
  const out = await runIdleScenario(app, fixture, { ...FAST, sessionCounts: [1], repeats: 3 });
  assert.deepEqual(out.byCount['1'].runs.map((r) => r.ipcMaxMs), [1000, 2000, 3000]);
  assert.equal(out.byCount['1'].median.ipcMaxMs, 2000);
});

test('a fallback transcript is named in the scenario-level warnings', async () => {
  const small = { projects: fixture.projects, transcripts: { small: fixture.transcripts.small } };
  const out = await runIdleScenario(fakeApp(), small, { ...FAST, sessionCounts: [1] });
  assert.equal(out.transcriptSize, 'small');
  assert.match(out.warnings.join(' '), /fell back to 'small'/);
});

// ---------------------------------------------------------------------------
// MEASURES — the configuration that must travel with the numbers
// ---------------------------------------------------------------------------

test('MEASURES states the configuration and, above all, what the window cannot see', async () => {
  const { MEASURES } = await import('../scenario-idle.mjs');
  assert.equal(MEASURES.scenario, 'idle-sessions');
  assert.match(MEASURES.question, /doing NOTHING/);
  const config = MEASURES.configuration.join(' ');
  // The two blind spots this scenario was built to remove must be visibly closed.
  assert.match(config, /RESUMED/, 'the configuration must say the sessions are resumed, not fresh');
  assert.match(config, /1 and 6 sessions held open/, 'the configuration must say more than one session count is measured');
  // Latency clocks are described; the two throughput metrics are marked as context.
  assert.match(MEASURES.clocks.ipcMaxMs, /worst single IPC round trip/);
  assert.match(MEASURES.clocks.cpuPct, /CONTEXT ONLY/);
  assert.match(MEASURES.clocks.pssMb, /CONTEXT ONLY/);
  // The honesty requirement: a finite window cannot see a slow cadence, and the
  // report must say so beside the numbers rather than in a comment nobody reads.
  const blind = MEASURES.blindTo.join(' ');
  assert.match(blind, /periodic SLOWER than the window/);
  assert.match(blind, /blocks smaller than the per-run stallFloorMs/);
});

// ---------------------------------------------------------------------------
// Distinct transcripts — the clone machinery
// ---------------------------------------------------------------------------

test('materializeClones rewrites the session id INSIDE the file, not just its name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'perf-idle-clone-'));
  try {
    const src = join(dir, 'src.jsonl');
    writeFileSync(src, '{"sessionId":"SRC","n":1}\n{"sessionId":"SRC","n":2}\n');
    const clones = materializeClones(src, 'SRC', 3);
    assert.equal(clones.length, 3);
    assert.equal(new Set(clones.map((c) => c.sessionId)).size, 3, 'clone ids must be distinct');
    for (const c of clones) {
      const body = readFileSync(c.path, 'utf8');
      // A byte copy under a new filename would leave the file disagreeing with itself:
      // fixture.mjs embeds the session id on EVERY line.
      assert.ok(!body.includes('"SRC"'), 'the source id must not survive inside the clone');
      assert.equal(body.split(`"${c.sessionId}"`).length - 1, 2, 'every line carries the new id');
      assert.equal(c.created, true);
    }
    // Deterministic: a second call reuses the same files rather than piling up orphans.
    const again = materializeClones(src, 'SRC', 3);
    assert.deepEqual(again.map((c) => c.sessionId), clones.map((c) => c.sessionId));
    assert.deepEqual(again.map((c) => c.created), [false, false, false]);

    removeClones(clones, src);
    for (const c of clones) assert.equal(existsSync(c.path), false);
    assert.equal(existsSync(src), true, 'the source transcript must never be deleted');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('removeClones refuses to delete the source even if it is listed as a clone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'perf-idle-clone-'));
  try {
    const src = join(dir, 'src.jsonl');
    writeFileSync(src, 'x\n');
    removeClones([{ sessionId: 'SRC', path: src }, null, {}], src);
    assert.equal(existsSync(src), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cloneSessionId is deterministic and uuid-shaped, so the app accepts it as a session id', () => {
  const id = cloneSessionId('bbb', 0);
  assert.equal(id, cloneSessionId('bbb', 0));
  assert.notEqual(id, cloneSessionId('bbb', 1));
  assert.notEqual(id, cloneSessionId('ccc', 0));
  // session-browser.ts's SAFE_ID_RE shape: a v4-looking uuid.
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('a fixture transcript with no path cannot be cloned, and the consequence is stated', async () => {
  const pathless = {
    projects: fixture.projects,
    transcripts: { medium: { sessionId: 'bbb', slug: 's', turns: 10 } },   // no `path`
  };
  const out = await runIdleScenario(fakeApp(), pathless, { ...FAST, sessionCounts: [2] });
  const w = out.warnings.join(' ');
  assert.match(w, /could not build one transcript per session/);
  assert.match(w, /has no `path`/);
  // The consequence, in the app's own terms — not a silent downgrade.
  assert.match(w, /second writer against the same transcript/);
  assert.match(w, /a configuration the app treats as broken/);
});

test('turning per-session transcripts off is allowed, and says what it costs', async () => {
  const out = await runIdleScenario(fakeApp(), fixture, { ...FAST, sessionCounts: [3], cloneTranscripts: false });
  assert.match(out.warnings.join(' '), /all 3 sessions resume one id — two writers on one transcript/);
  assert.match(out.warnings.join(' '), /measured in an unsupported configuration/);
  // …and with one session there is nothing to collide with, so no warning.
  const solo = await runIdleScenario(fakeApp(), fixture, { ...FAST, sessionCounts: [1], cloneTranscripts: false });
  assert.doesNotMatch(solo.warnings.join(' '), /two writers on one transcript/);
});
