import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, listTargets } from '../cdp.mjs';
import {
  COMMITS_OUTRUN_FRAMES,
  FORCED_LAYOUT_PER_FRAME,
  PER_DELTA_LAYOUT_RATIO,
  enablePerformanceDomain,
  formatLayoutCostLine,
  installCommitProbe,
  readCommitProbe,
  readCounters,
  stopCommitProbe,
  summariseLayoutCost,
} from '../layout-cost.mjs';

// ── The arithmetic and the verdict ──────────────────────────────────────────
// Fixtures are shaped like the REAL readings recorded by the live test below, so
// these stay honest about what the counters actually produce.

const summariseLateOrLayout = summariseLayoutCost;

const counters = (layout, recalc, layoutMs = 0, recalcMs = 0) =>
  ({ layoutCount: layout, recalcStyleCount: recalc, layoutDurationMs: layoutMs, recalcStyleDurationMs: recalcMs, error: null });

test('the healthy shape: layouts track FRAMES, not commits', () => {
  // Measured in Chrome 2026-09-03: 400 deltas, 98 layouts, 98 frames.
  const m = summariseLayoutCost(counters(0, 0), counters(98, 400), { frames: 98, commits: 400, records: 400, attached: true, elapsedMs: 1600 });
  assert.equal(m.verdict, 'coalesced');
  assert.equal(m.layoutsPerFrame, 1);
  assert.equal(m.layoutsPerCommit, 0.245);
});

test('the cycle-1 defect shape: one layout per commit, commits outrunning frames', () => {
  // Measured in Chrome 2026-09-03 with `pane.scrollTop = pane.scrollHeight` per delta:
  // 400 deltas, 400 layouts, 110 frames.
  const m = summariseLayoutCost(counters(0, 0), counters(400, 400), { frames: 110, commits: 400, records: 400, attached: true, elapsedMs: 1700 });
  assert.equal(m.verdict, 'per-delta-forced-layout');
  assert.equal(m.layoutsPerCommit, 1);
  assert.ok(m.layoutsPerFrame > FORCED_LAYOUT_PER_FRAME);
});

test('a stream slower than the frame rate is INCONCLUSIVE, not a pass', () => {
  // The REAL reading from the app on 2026-09-03: the local model produced 35 deltas
  // in 3 s against 181 frames. layoutsPerCommit was exactly 1.0 — which is the defect's
  // signature AND what a healthy renderer does when each commit gets its own frame.
  // The first version of this file called that 'coalesced'; it was a pass the data
  // could not support.
  const m = summariseLateOrLayout(counters(0, 0), counters(35, 181), { frames: 181, commits: 35, records: 35, attached: true, elapsedMs: 3007 });
  assert.equal(m.verdict, 'stream-too-slow');
  assert.equal(m.layoutsPerCommit, 1, 'the 1:1 ratio is real — it just cannot be interpreted here');
  assert.match(m.reason, /cannot distinguish the defect/);
  assert.match(formatLayoutCostLine(m), /INCONCLUSIVE/);
});

test('forced but not per-delta is its own verdict, not lumped in with the clean case', () => {
  // Layouts far outrun frames, but nowhere near one per commit — something forces
  // layout, just not on every delta. Calling this 'coalesced' would hide a real defect.
  const m = summariseLayoutCost(counters(0, 0), counters(300, 900), { frames: 60, commits: 900, records: 900, attached: true, elapsedMs: 1000 });
  assert.equal(m.verdict, 'forced-layout');
});

test('zero commits reports no-stream, never a clean bill of health', () => {
  // This is the guard against cycle 3's failure mode: a window that measured
  // nothing must not read as a pass.
  const m = summariseLayoutCost(counters(0, 0), counters(50, 50), { frames: 60, commits: 0, records: 0, attached: true, elapsedMs: 1000 });
  assert.equal(m.verdict, 'no-stream');
  assert.equal(m.layoutsPerCommit, null);
  assert.match(formatLayoutCostLine(m), /NOTHING STREAMED/);
});

test('a missing counter reports unmeasured, never zero layouts', () => {
  const m = summariseLayoutCost(counters(null, null), counters(null, null), { frames: 60, commits: 400, attached: true });
  assert.equal(m.verdict, 'unmeasured');
  assert.equal(m.layouts, null, 'a missing counter must not read as 0 layouts — that is a fake win');
  assert.match(formatLayoutCostLine(m), /UNMEASURED/);
});

test('a missing page probe reports unmeasured', () => {
  assert.equal(summariseLayoutCost(counters(0, 0), counters(100, 100), null).verdict, 'unmeasured');
});

test('durations are converted from the protocol seconds to milliseconds', () => {
  const m = summariseLayoutCost(counters(0, 0, 0, 0), counters(10, 10, 4.626, 0.321), { frames: 10, commits: 10, attached: true });
  assert.equal(m.layoutDurationMs, 4.626);
  assert.equal(m.recalcStyleDurationMs, 0.321);
});

test('the thresholds are exported, so a report can say what gate it was judged against', () => {
  assert.ok(FORCED_LAYOUT_PER_FRAME > 1, 'must allow one layout per frame as healthy');
  assert.ok(PER_DELTA_LAYOUT_RATIO <= 1);
  assert.ok(COMMITS_OUTRUN_FRAMES > 1);
});

// ── The live proof ──────────────────────────────────────────────────────────
// WHY THIS IS HERE AND NOT ONLY THE UNIT TESTS ABOVE: an instrument that only ever
// meets fixtures its own author wrote proves nothing about whether it can see the
// defect. This drives a real Chromium through both shapes and asserts the two
// verdicts differ. It is the whole reason to trust the fixtures above.
const CHROME = process.env.CHROME_BIN || 'google-chrome-stable';
const haveChrome = spawnSync('sh', ['-c', `command -v ${CHROME}`], { encoding: 'utf8' }).status === 0;

test('LIVE: a forced layout per delta is detected, and a coalesced stream is not', { skip: haveChrome ? false : `${CHROME} not on PATH` }, async () => {
  const port = 9783;
  const profile = mkdtempSync(join(tmpdir(), 'perf-lab-layout-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' });
  let cdp = null;
  try {
    let targets = null;
    for (let i = 0; i < 60 && !targets; i++) {
      try { targets = await listTargets(port); } catch { await new Promise((r) => setTimeout(r, 200)); }
    }
    assert.ok(targets, 'Chrome never opened its debugging port');
    cdp = await connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    assert.equal(await enablePerformanceDomain(cdp), true);

    // A pane shaped like the app's: `.chat-scroll` is the selector the probe uses.
    await cdp.evaluate(`(() => {
      document.body.innerHTML = '<div class="chat-scroll" style="height:300px;overflow:auto"><div id="feed"></div></div>';
      window.__stream = (n, forced) => new Promise((done) => {
        const feed = document.getElementById('feed');
        const pane = document.querySelector('.chat-scroll');
        let i = 0;
        const step = () => {
          feed.appendChild(document.createTextNode('tok' + i + ' '));
          // The defect, reproduced exactly: read geometry right after the commit.
          if (forced) { pane.scrollTop = pane.scrollHeight; }
          if (++i < n) setTimeout(step, 2); else done(i);
        };
        step();
      });
      return true;
    })()`);

    const measure = async (forced) => {
      const attach = await installCommitProbe(cdp, { selector: '.chat-scroll' });
      assert.equal(attach.attached, true, 'the probe must find the visible pane');
      const before = await readCounters(cdp);
      await cdp.evaluate(`window.__stream(400, ${forced})`);
      const probe = await readCommitProbe(cdp);
      const after = await readCounters(cdp);
      await stopCommitProbe(cdp);
      return summariseLayoutCost(before, after, probe);
    };

    const clean = await measure(false);
    const dirty = await measure(true);

    assert.equal(clean.verdict, 'coalesced', `a stream with no geometry read must be clean, got: ${formatLayoutCostLine(clean)}`);
    assert.equal(dirty.verdict, 'per-delta-forced-layout', `a geometry read per delta must be caught, got: ${formatLayoutCostLine(dirty)}`);
    // The point of counting WORK rather than TIME: the defect is a whole number.
    assert.ok(dirty.layouts >= clean.layouts * 2, `forced layouts (${dirty.layouts}) must dwarf coalesced ones (${clean.layouts})`);
    assert.ok(dirty.layoutsPerCommit >= PER_DELTA_LAYOUT_RATIO, `expected ~1 layout per commit, got ${dirty.layoutsPerCommit}`);
  } finally {
    try { cdp?.close(); } catch { /* already closed */ }
    // WHY THE WAIT AND THE try/catch: `kill()` only SIGNALS. Chrome keeps writing its
    // profile for a moment after, so removing the directory immediately raced it and
    // threw `ENOTEMPTY: ... /Default` — which failed this test in CI on 2026-09-06
    // AFTER every assertion above had passed. A leftover directory in the OS temp dir
    // is not a test failure; reporting one as though the instrument were broken is.
    await new Promise((done) => {
      if (chrome.exitCode !== null || chrome.signalCode !== null) return done();
      const t = setTimeout(done, 5000);
      chrome.once('exit', () => { clearTimeout(t); done(); });
      chrome.kill();
    });
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* the OS will reap it */ }
  }
});

// ── Rolling repeats up ──────────────────────────────────────────────────────

test('worstVerdict never lets a clean repeat hide a defective one', async () => {
  const { worstVerdict } = await import('../layout-cost.mjs');
  assert.equal(worstVerdict(['coalesced', 'per-delta-forced-layout', 'coalesced']), 'per-delta-forced-layout');
  assert.equal(worstVerdict(['coalesced', 'forced-layout']), 'forced-layout');
  assert.equal(worstVerdict(['coalesced', 'coalesced']), 'coalesced');
});

test('worstVerdict treats a repeat that measured nothing as worse than a pass', async () => {
  const { worstVerdict } = await import('../layout-cost.mjs');
  assert.equal(worstVerdict(['coalesced', 'stream-too-slow']), 'stream-too-slow');
  assert.equal(worstVerdict(['coalesced', 'no-stream']), 'no-stream');
  assert.equal(worstVerdict(['coalesced', 'unmeasured']), 'unmeasured');
  assert.equal(worstVerdict([]), 'unmeasured');
  assert.equal(worstVerdict(undefined), 'unmeasured');
});

test('buildWorkloadSection rolls the verdict up instead of medianing the string', async () => {
  // The bug this guards: median() sorts with `x - y`, which is NaN on strings, so
  // the median of three verdicts is whichever one the sort happened to leave in the
  // middle — two clean repeats could bury the one that caught the defect.
  const { buildWorkloadSection } = await import('../run.mjs');
  const runs = [
    { switchMedianMs: 10, nativeLayoutCost: { layouts: 100, frames: 100, commits: 400, verdict: 'coalesced' } },
    { switchMedianMs: 12, nativeLayoutCost: { layouts: 400, frames: 110, commits: 400, verdict: 'per-delta-forced-layout' } },
    { switchMedianMs: 11, nativeLayoutCost: { layouts: 100, frames: 100, commits: 400, verdict: 'coalesced' } },
  ];
  const section = buildWorkloadSection(runs);
  assert.equal(section.median.nativeLayoutCost.verdict, 'per-delta-forced-layout');
  // The numeric leaves still median normally.
  assert.equal(section.median.nativeLayoutCost.layouts, 100);
});

test('buildWorkloadSection does not report a medianed boolean as null', async () => {
  // medianTree medians every leaf and median() sorts with `x - y`; on a boolean that is
  // NaN, and the real report came back `attached: null` — readable as neither yes nor no.
  const { buildWorkloadSection } = await import('../run.mjs');
  const runs = [
    { nativeLayoutCost: { layouts: 10, verdict: 'coalesced', attached: true, reason: null } },
    { nativeLayoutCost: { layouts: 12, verdict: 'stream-too-slow', attached: true, reason: 'only 35 commits' } },
  ];
  const m = buildWorkloadSection(runs).median.nativeLayoutCost;
  assert.equal(m.attached, true);
  assert.equal(m.verdict, 'stream-too-slow');
  assert.equal(m.reason, 'only 35 commits');
});
