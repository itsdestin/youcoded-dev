// scripts/perf-lab/compare.mjs — the keep/reject rule from the spec, as code.
//
// WHY this module exists: perf numbers are noisy across runs, so a naive
// "candidate median < baseline median" comparison would flip-flop on pure
// jitter. Every decision here is spread-aware: we pull the raw per-run
// samples back out of the report (runsFor) and require any claimed win or
// regression to clear the baseline's own run-to-run spread before it counts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The metrics every experiment is judged against. All are lower-is-better,
// and every one has a `runs` array behind its median so spreadPct can be computed.
export const PRIMARY = [
  'startup.median.sessionsListed',
  'startup.median.firstContentfulPaint',
  'startup.median.blankWindowMs',
  'idle.pssMb.median',
  'idle.cpuPct.median',
  'history.medium.median.resumeStableMs',
  'history.huge.median.ipcLast10Ms',
  'history.huge.median.resumeStableMs',
  'workload.median.switchP95Ms',
  'workload.median.probe.longtaskTotalMs',
  'workload.median.pssAfterMb',
  'workload.median.cpuDuringPct',

  // ── The app-wide freeze (stall phase) ──────────────────────────────────────
  // `medium` is the headline: 5,000 messages is ORDINARY usage and it stalls the
  // whole app ~3.3 s. mainProcessStallMaxMs is the single worst moment — what a user
  // actually feels as "I can't click anything" — and ipcTotalStallMs is how much of
  // the replay was spent unresponsive in total.
  'replayStall.medium.median.mainProcessStallMaxMs',
  'replayStall.medium.median.ipcTotalStallMs',
  // Deliberately a HUGE-size RENDERER metric, and the reason it is in PRIMARY at all:
  // the obvious fix for a blocked main process is to move the work off it. If that
  // work lands in the renderer instead, every main-process metric above improves while
  // the app freezes exactly as much as before. This path is what makes that trade
  // register as the regression it is rather than a win.
  'replayStall.huge.median.rendererLongtaskMaxMs',

  // ── The artifact panel (artifacts phase) ───────────────────────────────────
  // Destin's reported spikes: opening a big document, typing in the editor, and
  // navigating HTML previews.
  'artifacts.median.open.mdLarge.openMs',
  // p95, not median: typing jank is a TAIL problem. A median can look healthy while
  // every tenth keystroke visibly hitches, which is what "jumpy" means to a user.
  'artifacts.median.typing.codeLarge.keystroke.p95Ms',
  'artifacts.median.htmlNav.swap.medianMs',
  'artifacts.median.ipcSumOfSteps.totalStallMs',
];

// Dotted-path getter used everywhere below — keeps report shape out of the decision logic.
export const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

/**
 * The per-run samples behind any `…median…` path. The report always stores a
 * `runs` array as a sibling of `median` at the point where the two diverge:
 *   startup.median.X            -> startup.runs[].X
 *   history.<size>.median.X     -> history.<size>.runs[].X
 *   workload.median.a.b         -> workload.runs[].a.b
 *   idle.<k>.median             -> idle.<k>.runs        (runs is already flat numbers)
 * We find the FIRST ".median" segment boundary — everything before it is the
 * prefix whose "runs" sibling we want; everything after it (minus the leading
 * dot) is the sub-path to project out of each run object, empty if median IS
 * the leaf (the idle.<k> shape).
 */
export function runsFor(report, path) {
  const i = path.indexOf('.median');
  if (i < 0) return [];
  const prefix = path.slice(0, i);
  const rest = path.slice(i + '.median'.length + 1); // '' when median was the last segment
  const runs = get(report, `${prefix}.runs`) ?? [];
  return (rest ? runs.map((r) => get(r, rest)) : runs).filter((x) => typeof x === 'number');
}

// Run-to-run noise band, as a percent of the median. Fewer than 2 samples means
// we have no evidence of spread, so treat it as zero rather than throwing.
export function spreadPct(report, path) {
  const runs = runsFor(report, path);
  if (runs.length < 2) return 0;
  const med = get(report, path);
  return med ? ((Math.max(...runs) - Math.min(...runs)) / med) * 100 : 0;
}

// Percent change from baseline to candidate, one decimal place. Null when either
// side is missing/non-numeric or baseline is 0 (division by zero would be meaningless).
const delta = (b, c) =>
  typeof b === 'number' && typeof c === 'number' && b !== 0 ? Math.round(((c - b) / b) * 1000) / 10 : null;

// Total ERROR-line count for a report — a boot that logs new errors is not a clean win
// even if every timing metric improved, so this is checked independently of PRIMARY.
const errorTotal = (r) =>
  (r.errors?.coldStarts ?? []).reduce((a, b) => a + b, 0)
  + (r.errors?.scenarioBoot ?? 0)
  // The stall and artifacts phases each get their own boot (run.mjs), so their error
  // lines live in their own counters. Omitting them here would let a change that
  // starts throwing during transcript replay or in the editor still read as a clean KEEP.
  + (r.errors?.stallBoot ?? 0)
  + (r.errors?.artifactsBoot ?? 0);

/**
 * Decide KEEP or REJECT for one experiment.
 * Keep iff ALL of:
 *  - target improved by at least improveMinPct, AND that delta clears the
 *    baseline's own spread on that path (otherwise it's noise, not a win)
 *  - no other PRIMARY metric regressed beyond regressMaxPct + its own spread
 *  - every screenshot comparison passed (or the change is flagged as a UX bugfix,
 *    where a visual diff is the point, not a regression)
 *  - the candidate didn't log more ERROR lines than the baseline
 */
export function verdict(baseline, candidate, { target, improveMinPct = 5, regressMaxPct = 3, screens = {}, uxBugfix = false }) {
  const reasons = [];

  const errors = { base: errorTotal(baseline), cand: errorTotal(candidate) };
  if (errors.cand > errors.base) reasons.push(`candidate logged ${errors.cand} ERROR lines (baseline ${errors.base})`);

  const tb = get(baseline, target);
  const tc = get(candidate, target);
  const td = delta(tb, tc);
  const ts = spreadPct(baseline, target);
  const beyondSpread = td !== null && Math.abs(td) > ts;
  if (td === null) reasons.push(`target ${target} missing in a report`);
  else if (td > -improveMinPct) reasons.push(`target improved only ${-td}% (< ${improveMinPct}%)`);
  else if (!beyondSpread) reasons.push(`target delta ${td}% is inside baseline spread ${ts.toFixed(1)}%`);

  const regressions = [];
  for (const p of PRIMARY) {
    if (p === target) continue; // the target's own movement is judged above, not as a regression
    const d = delta(get(baseline, p), get(candidate, p));
    if (d !== null && d > regressMaxPct + spreadPct(baseline, p)) {
      regressions.push({ path: p, base: get(baseline, p), cand: get(candidate, p), deltaPct: d });
    }
  }
  if (regressions.length) reasons.push(`regressions: ${regressions.map((r) => `${r.path} +${r.deltaPct}%`).join(', ')}`);

  const failedScreens = Object.entries(screens).filter(([, s]) => s && s.pass === false);
  if (failedScreens.length && !uxBugfix) {
    reasons.push(`screens differ: ${failedScreens.map(([n, s]) => `${n} ${s.pct}%`).join(', ')}`);
  }

  return {
    keep: reasons.length === 0,
    target: { path: target, base: tb, cand: tc, deltaPct: td, beyondSpread },
    regressions,
    screens,
    errors,
    reasons,
  };
}

// CLI entry point — only runs when this file is executed directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [b, c] = process.argv.slice(2, 4).map((p) => JSON.parse(readFileSync(p, 'utf8')));
  const i = process.argv.indexOf('--target');
  const target = i > 0 ? process.argv[i + 1] : PRIMARY[0];
  let screens = {};
  // Only pull in the screenshot comparator (written by a sibling task) when both
  // reports actually recorded a screenshot dir — keeps this file runnable standalone.
  if (b.screens?.dir && c.screens?.dir) {
    const { compareScreens } = await import('./screenshots.mjs');
    screens = await compareScreens(b.screens.dir, c.screens.dir, c.screens.names);
  }
  const v = verdict(b, c, { target, screens, uxBugfix: process.argv.includes('--ux-bugfix') });
  console.log(`target ${target}: ${v.target.base} → ${v.target.cand} (${v.target.deltaPct}%)`);
  for (const p of PRIMARY) {
    console.log(`  ${p.padEnd(40)} ${String(get(b, p)).padStart(9)} → ${String(get(c, p)).padStart(9)}  ${delta(get(b, p), get(c, p)) ?? '—'}%`);
  }
  for (const [n, s] of Object.entries(screens)) console.log(`  screen ${n}: ${s.pct}% ${s.pass ? 'ok' : 'DIFF'}`);
  console.log(v.keep ? 'VERDICT: KEEP' : `VERDICT: REJECT — ${v.reasons.join('; ')}`);
  process.exit(v.keep ? 0 : 1);
}
