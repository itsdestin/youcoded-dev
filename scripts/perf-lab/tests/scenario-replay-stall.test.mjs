// Unit tests for scenario-replay-stall.mjs — everything that can be checked without
// launching the app.
//
// WHY these exist, in two parts:
//  1. The attribution arithmetic (attributeStalls / mergeIntervals / overlapMs /
//     summarizeBlame) is the whole point of the scenario, and it is pure — so it can
//     and must be pinned here rather than inferred from a 5-minute app run.
//  2. The riskiest remaining content is JavaScript SOURCE embedded in template
//     literals and shipped to the renderer. A typo there fails at run time inside CDP
//     with a useless message. The fake cdp below PARSES every expression the module
//     emits (new Function, never executed), so a broken in-page script fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attributeStalls, mergeIntervals, overlapMs, summarizeBlame, medianRun,
  NUMERIC_KEYS, SIZES, runReplayStallScenario,
} from '../scenario-replay-stall.mjs';

// ---------------------------------------------------------------------------
// mergeIntervals / overlapMs
// ---------------------------------------------------------------------------

test('mergeIntervals sorts, merges overlaps, and joins touching intervals', () => {
  assert.deepEqual(mergeIntervals([[10, 20], [15, 25]]), [[10, 25]]);
  assert.deepEqual(mergeIntervals([[30, 40], [0, 10]]), [[0, 10], [30, 40]]);
  // Touching counts as continuous: two back-to-back long tasks are one blocked stretch.
  assert.deepEqual(mergeIntervals([[0, 10], [10, 20]]), [[0, 20]]);
  assert.deepEqual(mergeIntervals([[0, 100], [10, 20]]), [[0, 100]]);
});

test('mergeIntervals drops garbage rather than producing NaN spans', () => {
  assert.deepEqual(mergeIntervals([[5, 5], [10, 9], [NaN, 3], null, [1, 2]]), [[1, 2]]);
  assert.deepEqual(mergeIntervals([]), []);
  assert.deepEqual(mergeIntervals(null), []);
});

test('overlapMs measures only the covered part of the window', () => {
  const m = mergeIntervals([[100, 200], [400, 500]]);
  assert.equal(overlapMs(0, 100, m), 0);      // ends exactly where coverage starts
  assert.equal(overlapMs(150, 250, m), 50);   // partial
  assert.equal(overlapMs(0, 1000, m), 200);   // both
  assert.equal(overlapMs(600, 700, m), 0);    // after everything
  assert.equal(overlapMs(100, 200, m), 100);  // exact
});

// ---------------------------------------------------------------------------
// attributeStalls — the rule this scenario exists to apply
// ---------------------------------------------------------------------------

test('a stall sitting under a long task is charged to the renderer', () => {
  // One ping starting at 1000ms that took 900ms, with a long task covering all of it.
  const a = attributeStalls({
    samples: [[1000, 900]],
    everyMs: 100,
    longtasks: [[1000, 900]],
  });
  assert.equal(a.ipcTotalStallMs, 800);        // 900 round trip - 100ms interval
  assert.equal(a.rendererStallMs, 800);
  assert.equal(a.mainProcessStallMs, 0);
  assert.equal(a.worst[0].blame, 'renderer');
});

test('a stall with the renderer idle is charged to the main process — the app-wide freeze', () => {
  const a = attributeStalls({
    samples: [[1000, 3353]],                  // the measured 5,000-message number
    everyMs: 100,
    longtasks: [[20000, 120]],                // a long task, but nowhere near this stall
  });
  assert.equal(a.mainProcessStallMs, 3253);
  assert.equal(a.rendererStallMs, 0);
  assert.equal(a.mainProcessStallMaxMs, 3253);
  assert.equal(a.worst[0].blame, 'main-process');
});

test('a partly-covered stall splits, and the two halves always sum to ipcTotalStallMs', () => {
  const a = attributeStalls({
    samples: [[0, 1000], [2000, 600], [5000, 105]],
    everyMs: 100,
    longtasks: [[0, 400], [2000, 550]],
  });
  assert.equal(a.rendererStallMs + a.mainProcessStallMs, a.ipcTotalStallMs);
  // First ping: 1000ms round trip, 400ms of it under a long task -> 400 renderer / 500 main.
  assert.equal(a.worst[0].roundTripMs, 1000);
  assert.equal(a.worst[0].longtaskOverlapMs, 400);
  assert.equal(a.worst[0].blame, 'mixed');    // 40% covered: neither >=50% nor <=10%
});

test('the two probes are put on ONE timeline via their separate t0 values', () => {
  // The IPC probe was installed 500ms before the renderer probe. A long task recorded
  // at 0ms on the renderer probe's clock is 500ms on the IPC probe's clock, and must
  // line up with a ping that started at 500ms.
  const covered = attributeStalls({
    samples: [[500, 300]], everyMs: 100, longtasks: [[0, 300]], ipcT0: 0, probeT0: 500,
  });
  assert.equal(covered.rendererStallMs, 200);
  assert.equal(covered.mainProcessStallMs, 0);
  // Without the offset the same data would be misattributed — proving the offset is load-bearing.
  const naive = attributeStalls({
    samples: [[500, 300]], everyMs: 100, longtasks: [[0, 300]], ipcT0: 0, probeT0: 0,
  });
  assert.equal(naive.mainProcessStallMs, 200);
});

test('no long-task data means NO attribution — never a fabricated main-process verdict', () => {
  const a = attributeStalls({ samples: [[0, 2000]], everyMs: 100, longtasks: null });
  assert.equal(a.attributable, false);
  assert.equal(a.mainProcessStallMs, null);
  assert.equal(a.rendererStallMs, null);
  assert.equal(a.ipcTotalStallMs, 1900);   // the end-to-end number is still real
  assert.equal(a.worst[0].blame, 'unknown');
  assert.equal(a.worst[0].longtaskOverlapMs, null);
});

test('zero pings reports null, not a suspiciously perfect zero', () => {
  const a = attributeStalls({ samples: [], everyMs: 100, longtasks: [] });
  assert.equal(a.ipcPings, 0);
  assert.equal(a.ipcTotalStallMs, null);
  assert.equal(a.mainProcessStallMs, null);
  assert.equal(a.mainProcessStallMaxMs, null);
  assert.equal(a.ipcMaxPingGapMs, null);
  assert.deepEqual(a.worst, []);
});

test('round trips at or below the ping interval are not stalls', () => {
  const a = attributeStalls({ samples: [[0, 100], [100, 40], [200, 3]], everyMs: 100, longtasks: [] });
  assert.equal(a.ipcTotalStallMs, 0);
  assert.equal(a.mainProcessStallMs, 0);
});

test('ipcMaxPingGapMs catches the block that produced no slow sample at all', () => {
  // A renderer frozen so hard that setInterval never fired: the samples themselves are
  // all fast, but 9 seconds elapsed between two of them.
  const a = attributeStalls({ samples: [[0, 5], [100, 5], [9100, 5]], everyMs: 100, longtasks: [] });
  assert.equal(a.ipcMaxPingGapMs, 9000);
  assert.equal(a.ipcTotalStallMs, 0);
});

test('worst is ordered by round trip and capped', () => {
  const samples = [[0, 100], [100, 900], [200, 400], [300, 2000], [400, 150], [500, 700]];
  const a = attributeStalls({ samples, everyMs: 100, longtasks: [], worstCount: 3 });
  assert.deepEqual(a.worst.map((w) => w.roundTripMs), [2000, 900, 700]);
  assert.equal(a.worst[0].atMs, 300);   // atMs stays relative to the IPC probe's t0
});

test('attributeStalls refuses a non-array rather than silently measuring nothing', () => {
  assert.throws(() => attributeStalls({ samples: undefined, everyMs: 100, longtasks: [] }), /must be an array/);
});

// ---------------------------------------------------------------------------
// summarizeBlame / medianRun
// ---------------------------------------------------------------------------

test('summarizeBlame needs a clear 2x margin, and stays quiet below the floor', () => {
  assert.equal(summarizeBlame(3000, 100), 'main-process');
  assert.equal(summarizeBlame(100, 3000), 'renderer');
  assert.equal(summarizeBlame(1000, 800), 'mixed');
  assert.equal(summarizeBlame(3, 4), 'none');          // jitter is not a verdict
  assert.equal(summarizeBlame(null, 100), null);       // unattributable stays unattributed
  assert.equal(summarizeBlame(0, 0), 'none');
});

test('medianRun projects only NUMERIC_KEYS and keeps an always-null metric null', () => {
  const runs = [
    { ipcMaxMs: 10, elapsedMs: null, blame: 'none', warnings: ['a'] },
    { ipcMaxMs: 30, elapsedMs: null, blame: 'none', warnings: ['b'] },
    { ipcMaxMs: 20, elapsedMs: null, blame: 'none', warnings: [] },
  ];
  const m = medianRun(runs);
  assert.equal(m.ipcMaxMs, 20);
  assert.equal(m.elapsedMs, null);                     // absent, not 0
  assert.equal('blame' in m, false);
  assert.equal('warnings' in m, false);
  assert.deepEqual(Object.keys(m).sort(), [...NUMERIC_KEYS].sort());
});

// ---------------------------------------------------------------------------
// The scenario itself, against a fake CDP that parses every emitted expression
// ---------------------------------------------------------------------------

const fixture = {
  projects: { alpha: '/tmp/perf/alpha' },
  transcripts: {
    small: { sessionId: 'aaa', slug: '-tmp-perf-alpha', turns: 50 },
    medium: { sessionId: 'bbb', slug: '-tmp-perf-alpha', turns: 2500 },
    huge: { sessionId: 'ccc', slug: '-tmp-perf-alpha', turns: 25000 },
  },
};

/** The counts the timeline reports after a resume: grows, then holds steady. */
const GROWTH = [5, 40, 40, 40, 40, 40, 40, 40];

function fakeApp({
  ipc = {},
  probe = {},
  raw = {},
  createFails = null,
  destroyFails = null,
  rawThrows = false,
} = {}) {
  const calls = [];
  let phase = 'idle';
  let queue = [];
  const app = {
    calls,
    cdp: {
      async evaluate(expr) {
        // Parse-only check — proves the generated in-page source is valid JS. It is
        // never executed, so `window` never has to exist.
        new Function(`return (${expr});`);

        if (expr.includes('perf-lab: replay-stall raw probe read')) {
          calls.push('raw');
          if (rawThrows) throw new Error('boom: the page reloaded');
          return {
            ipcT0: 0, everyMs: 100, probeT0: 0, longtaskSupported: true,
            samples: [[0, 5], [1000, 3353], [5000, 8]],
            longtasks: [[20000, 117]],
            ...raw,
          };
        }
        if (expr.includes('readIpcStallProbe:')) {
          calls.push('read-ipc');
          return {
            pings: 3, missedTicks: 0, medianMs: 8, p95Ms: 3353, maxMs: 3353,
            over100ms: 1, over250ms: 1, over1000ms: 1, totalStallMs: 3253,
            worst: [{ atMs: 1000, roundTripMs: 3353 }],
            ...ipc,
          };
        }
        if (expr.includes('readProbe:')) {
          calls.push('read-probe');
          return {
            longtaskCount: 1, longtaskTotalMs: 117, longtaskMaxMs: 117,
            frameGapCount: 0, frameGapMaxMs: 0, longtaskSupported: true,
            observedMs: 30000, frames: 900, framesPerSec: 30, marks: [], errors: [],
            ...probe,
          };
        }
        if (expr.includes('setInterval(ping')) { calls.push('install-ipc'); return true; }
        if (expr.includes('requestAnimationFrame(tick)')) {
          calls.push('install-probe');
          return { longtaskSupported: probe.longtaskSupported !== false };
        }
        if (expr.includes('if (!window.__ipcStall) return false')) { calls.push('stop-ipc'); return true; }
        if (expr.includes('if (!window.__perfProbe) return false')) { calls.push('stop-probe'); return true; }
        if (expr.includes('session.create(')) {
          calls.push('create');
          if (createFails) return { ok: false, error: createFails };
          phase = 'resumed';
          queue = [...GROWTH];
          return { ok: true, id: 'sess-1' };
        }
        if (expr.includes('session.destroy(')) {
          calls.push('destroy');
          phase = 'idle';
          return destroyFails ? { ok: false, error: destroyFails } : { ok: true };
        }
        if (expr.includes('.chat-scroll .timeline-entry')) {
          calls.push('count');
          return phase === 'idle' ? 0 : (queue.length ? queue.shift() : 40);
        }
        throw new Error(`fake cdp: unrecognised expression: ${expr.slice(0, 120)}`);
      },
    },
  };
  return app;
}

// pollMs/settleMs 0 so the tests do not sleep; timeoutMs small so a hang fails fast.
const FAST = { pollMs: 0, settleMs: 0, repeats: 1, timeoutMs: 5000 };

test('runReplayStallScenario reports every size with runs, median, blame and warnings', async () => {
  const app = fakeApp();
  const out = await runReplayStallScenario(app, fixture, FAST);
  assert.deepEqual(Object.keys(out), SIZES);
  for (const size of SIZES) {
    const s = out[size];
    assert.equal(s.runs.length, 1);
    assert.equal(s.stabilizedRuns, 1);
    assert.deepEqual(s.warnings, []);
    // The canned data is a 3.25s stall with the renderer idle — the app-wide freeze.
    assert.equal(s.blame, 'main-process');
    assert.equal(s.median.mainProcessStallMs, 3253);
    assert.equal(s.median.rendererStallMs, 0);
    assert.equal(s.median.ipcMaxMs, 3353);
    assert.equal(s.median.rendererLongtaskMaxMs, 117);
    assert.equal(s.median.renderedEntries, 40);
    assert.equal(typeof s.median.elapsedMs, 'number');
    // Every key compare.mjs may take a median of must be present on the median object.
    assert.deepEqual(Object.keys(s.median).sort(), [...NUMERIC_KEYS].sort());
  }
});

test('the run carries the diagnostics that are NOT medianable', async () => {
  const out = await runReplayStallScenario(fakeApp(), fixture, { ...FAST, sizes: ['medium'] });
  const run = out.medium.runs[0];
  assert.equal(run.stability, 'stable');
  assert.equal(run.blame, 'main-process');
  assert.equal(run.expectedEntries, 5000);        // 2 lines per turn, 2500 turns
  assert.equal(run.timedOutAfterMs, null);
  assert.equal(run.worstStalls[0].blame, 'main-process');
  assert.equal(run.longtaskSupported, true);
});

test('probes are armed before the resume and disarmed before the read', async () => {
  const app = fakeApp();
  await runReplayStallScenario(app, fixture, { ...FAST, sizes: ['small'] });
  const order = app.calls;
  assert.ok(order.indexOf('install-ipc') < order.indexOf('create'), 'IPC probe must be armed before the resume');
  assert.ok(order.indexOf('install-probe') < order.indexOf('create'), 'renderer probe must be armed before the resume');
  assert.ok(order.indexOf('stop-ipc') < order.indexOf('read-ipc'), 'probe must be frozen before it is read');
  assert.ok(order.indexOf('stop-probe') < order.indexOf('read-probe'), 'probe must be frozen before it is read');
  assert.ok(order.indexOf('read-probe') < order.indexOf('destroy'), 'both probes are read before the session dies');
  assert.equal(order[order.length - 1], 'destroy');
});

test('a failed read still disarms both probes and destroys the session', async () => {
  const app = fakeApp({ rawThrows: true });
  await assert.rejects(
    runReplayStallScenario(app, fixture, { ...FAST, sizes: ['small'] }),
    /boom: the page reloaded/,
  );
  // Stopped twice (once on the happy path, once in `finally`) — stop is idempotent —
  // and the 50,000-message session must not be left alive for the next repeat.
  assert.ok(app.calls.filter((c) => c === 'stop-ipc').length >= 1);
  assert.ok(app.calls.includes('destroy'), 'the session must be destroyed even when the read throws');
});

test('a create failure surfaces the app\'s own error text, never a guess', async () => {
  const app = fakeApp({ createFails: 'ENOENT: no such transcript' });
  await assert.rejects(
    runReplayStallScenario(app, fixture, { ...FAST, sizes: ['huge'] }),
    /session\.create failed while resuming 'huge'.*resumeSessionId=ccc.*ENOENT: no such transcript/s,
  );
});

test('a failed destroy is a warning, not a thrown-away measurement', async () => {
  const app = fakeApp({ destroyFails: 'session already gone' });
  const out = await runReplayStallScenario(app, fixture, { ...FAST, sizes: ['small'] });
  assert.equal(out.small.runs[0].ipcMaxMs, 3353);   // the measurement survived
  assert.match(out.small.warnings.join(' '), /session already gone/);
});

test('no long-task observer downgrades to unattributed, and says so loudly', async () => {
  const app = fakeApp({ probe: { longtaskSupported: false }, raw: { longtaskSupported: false } });
  const out = await runReplayStallScenario(app, fixture, { ...FAST, sizes: ['small'] });
  const run = out.small.runs[0];
  assert.equal(run.mainProcessStallMs, null);
  assert.equal(run.rendererStallMs, null);
  assert.equal(run.ipcTotalStallMs, 3253);          // end-to-end cost is still reported
  assert.equal(out.small.blame, null);
  assert.match(out.small.warnings.join(' '), /long-task observer failed to attach/);
});

test('zero completed pings is a warning, not a silent clean bill of health', async () => {
  const app = fakeApp({ ipc: { pings: 0, medianMs: null, maxMs: null, totalStallMs: 0 }, raw: { samples: [] } });
  const out = await runReplayStallScenario(app, fixture, { ...FAST, sizes: ['small'] });
  assert.match(out.small.warnings.join(' '), /completed 0 pings/);
  assert.equal(out.small.runs[0].mainProcessStallMs, null);
});

test('an empty timeline is reported as a suspect run, not as a fast one', async () => {
  const app = fakeApp();
  // Force every post-resume count to 0 by never leaving the idle phase.
  const inner = app.cdp.evaluate;
  app.cdp.evaluate = async (expr) => {
    const v = await inner(expr);
    return expr.includes('.chat-scroll .timeline-entry') ? 0 : v;
  };
  const out = await runReplayStallScenario(app, fixture, { ...FAST, sizes: ['small'], timeoutMs: 300 });
  const run = out.small.runs[0];
  assert.equal(run.renderedEntries, 0);
  assert.equal(run.stability, 'timeout');
  assert.equal(run.elapsedMs, null);                     // null, never the timeout value
  assert.equal(typeof run.timedOutAfterMs, 'number');
  assert.match(out.small.warnings.join(' '), /nothing ever rendered/);
  assert.match(out.small.warnings.join(' '), /never stopped growing/);
});

test('repeats produce independent runs and a median over them', async () => {
  let n = 0;
  const app = fakeApp();
  const inner = app.cdp.evaluate;
  app.cdp.evaluate = async (expr) => {
    const v = await inner(expr);
    // Vary the max round trip per repeat: 1000, 2000, 3000.
    if (expr.includes('readIpcStallProbe:')) return { ...v, maxMs: 1000 * (++n) };
    return v;
  };
  const out = await runReplayStallScenario(app, fixture, { ...FAST, sizes: ['small'], repeats: 3 });
  assert.deepEqual(out.small.runs.map((r) => r.ipcMaxMs), [1000, 2000, 3000]);
  assert.equal(out.small.median.ipcMaxMs, 2000);
});

test('a missing fixture size names what the fixture actually has', async () => {
  await assert.rejects(
    runReplayStallScenario(fakeApp(), fixture, { ...FAST, sizes: ['gigantic'] }),
    /fixture has no 'gigantic' transcript \(has: small, medium, huge\)/,
  );
});
