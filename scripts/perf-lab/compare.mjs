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
  // The switch metric that includes the CONTENT. switchP95Ms above stops when the
  // pane container swaps; this one stops when the messages are on screen. Both are
  // judged: if a change improves the container swap while the messages arrive just
  // as late, that is not a win a user would feel, and only this path shows it.
  //
  // WHY the huge bucket's MEDIAN and not switchPaintedP95Ms (swapped 2026-08-27):
  // the p95 pooled every size — it was the maximum of ~18 samples, a third of them
  // the empty control and, on the post-rebase baseline, two buckets sitting at the
  // 20 s cap because the streamer was writing into them. The huge bucket is the
  // case Destin lives in, no stream touches it, and its median moved 4% run to run
  // (11.2 / 11.1 / 10.8 s) — the steadiest switching number the rig produces.
  'workload.median.switchPaintedBySize.huge.medianMs',
  'workload.median.probe.longtaskTotalMs',
  'workload.median.pssAfterMb',
  // CPU-SECONDS, not the percentage. cpuDuringPct is a RATE: a change that makes
  // the workload phase finish faster raises it while doing strictly less work.
  // That fired for real on 2026-08-28 (window 195s -> 40s for the same 40
  // switches; rate +66%, total work -66%) and read as a regression. Derived from
  // the old fields for reports that predate it — see get().
  'workload.median.cpuTotalSeconds',

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
const rawGet = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

/**
 * Read a metric path, deriving the ones a report may predate.
 *
 * `workload.median.cpuTotalSeconds` replaced `cpuDuringPct` in PRIMARY on
 * 2026-08-28 (a rate cannot be compared across runs of different duration).
 * Reports written before that carry the rate and the window instead, and a
 * missing PRIMARY path fails the gate CLOSED — which would have made every
 * existing baseline unusable. Deriving it keeps them comparable, and the
 * derivation is exact: the new field is computed the same way at write time.
 */
export const get = (o, path) => {
  const direct = rawGet(o, path);
  if (direct !== undefined) return direct;
  if (path === 'workload.median.cpuTotalSeconds') {
    const pct = rawGet(o, 'workload.median.cpuDuringPct');
    const secs = rawGet(o, 'workload.median.cpuWindowSeconds');
    if (typeof pct === 'number' && typeof secs === 'number') return Math.round(pct * secs / 100 * 10) / 10;
  }
  return undefined;
};

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
  // Split into SEGMENTS and look for a segment that is exactly `median`, rather than
  // searching for the text ".median" anywhere in the string.
  //
  // WHY that distinction is worth the extra two lines: the substring search also
  // matches the start of a longer segment. A path like `x.medianMs.median.y` splits at
  // the wrong dot, looks for a `runs` array under the wrong prefix, finds nothing, and
  // returns an empty sample list. Nothing about that failure is loud — an empty sample
  // list is not an error here, it is spreadPct() answering "this metric has 0% run-to-run
  // noise", which tells the gate that the tiniest wobble on that metric is a proven
  // result. So a path that quietly mis-parses is a path whose noise floor silently drops
  // to zero, which is the single most permissive value it could take.
  const parts = path.split('.');
  const i = parts.indexOf('median');
  // `i < 1`, not `i < 0`: a path that STARTS with `median` has no prefix to hang a
  // sibling `runs` array off, so there is nothing to look up.
  if (i < 1) return [];
  const prefix = parts.slice(0, i).join('.');
  const rest = parts.slice(i + 1).join('.'); // '' when median was the last segment
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

/**
 * How far above a ZERO baseline a metric has to land before we call it a regression,
 * in whatever unit that metric is reported in (milliseconds, megabytes, or percentage
 * points — every PRIMARY metric is lower-is-better and reported in one of those).
 *
 * WHY a floor at all: a metric that was 0 and is now 0.4 is almost certainly the median
 * of a couple of runs wobbling around nothing, and a gate that rejected every change on
 * that basis would be ignored within a week.
 *
 * WHY 1 specifically: 1 is the smallest unit any of these metrics is meaningfully
 * reported in — the report rounds milliseconds and megabytes to whole numbers and
 * percentages to one decimal — so anything at or below 1 is inside the report's own
 * rounding and cannot be told apart from noise. Anything ABOVE 1 is a real quantity that
 * was measured and that simply did not exist before. The number is deliberately small:
 * this gate's whole failure mode is being too willing to accept, so when in doubt it
 * should stop the change and make a human look, not wave it through.
 */
export const ZERO_BASELINE_FLOOR = 1;

/**
 * The regression `delta()` structurally cannot see: baseline 0, candidate above zero.
 *
 * WHY this exists as its own test. delta() returns null when the baseline is 0, because
 * dividing by zero would produce a meaningless percentage — and verdict()'s regression
 * loop skips every null. The consequence was that "there was no freeze here before, and
 * there is a three-second freeze here now" — the worst regression this whole rig was
 * built to catch — registered as *no regression at all* and the change was kept. Any
 * metric that legitimately sits at 0 in a healthy build (a stall total, a long-task
 * total, an idle CPU reading) had a free pass to become arbitrarily bad.
 */
const roseFromZero = (b, c) =>
  b === 0 && typeof c === 'number' && Number.isFinite(c) && c > ZERO_BASELINE_FLOOR;

/** True when a PRIMARY path resolved to a usable number in this report. */
const present = (report, path) => {
  const v = get(report, path);
  return typeof v === 'number' && Number.isFinite(v);
};

// Total ERROR-line count for a report — a boot that logs new errors is not a clean win
// even if every timing metric improved, so this is checked independently of PRIMARY.
const errorTotal = (r) =>
  (r.errors?.coldStarts ?? []).reduce((a, b) => a + b, 0)
  + (r.errors?.scenarioBoot ?? 0)
  // The stall and artifacts phases each get their own boot (run.mjs), so their error
  // lines live in their own counters. Omitting them here would let a change that
  // starts throwing during transcript replay or in the editor still read as a clean KEEP.
  + (r.errors?.stallBoot ?? 0)
  + (r.errors?.artifactsBoot ?? 0)
  // Each workload repeat is its own boot since 2026-08-27 (see run.mjs).
  + (r.errors?.workloadBoots ?? []).reduce((a, b) => a + b, 0);

/**
 * Decide KEEP or REJECT for one experiment.
 * Keep iff ALL of:
 *  - target improved by at least improveMinPct, AND that delta clears the
 *    baseline's own spread on that path (otherwise it's noise, not a win)
 *  - no other PRIMARY metric regressed beyond regressMaxPct + its own spread, which
 *    INCLUDES a metric that was 0 in the baseline and is above ZERO_BASELINE_FLOOR now
 *  - every PRIMARY metric was actually readable in BOTH reports — a metric the gate
 *    could not see is not a metric the gate has cleared
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
  if (td === null) {
    // Two different situations both make a percentage impossible, and they need
    // different sentences: telling an operator that a number sitting right there in the
    // report is "missing" sends them hunting for a broken report that isn't broken.
    reasons.push(tb === 0
      ? `target ${target} baseline is already 0 — a lower-is-better metric at zero has no room to improve`
      : `target ${target} missing in a report`);
  } else if (td > -improveMinPct) reasons.push(`target improved only ${-td}% (< ${improveMinPct}%)`);
  else if (!beyondSpread) reasons.push(`target delta ${td}% is inside baseline spread ${ts.toFixed(1)}%`);

  const regressions = [];
  for (const p of PRIMARY) {
    if (p === target) continue; // the target's own movement is judged above, not as a regression
    const bv = get(baseline, p);
    const cv = get(candidate, p);
    if (roseFromZero(bv, cv)) {
      // Reported with NO percentage. There is no honest percentage to quote here —
      // "+Infinity%" or a silently omitted number would both read as a glitch, and the
      // fact that actually matters is the one the raw values say: this cost did not
      // exist before. deltaPct stays null so nothing downstream can accidentally do
      // arithmetic on a fabricated figure.
      regressions.push({ path: p, base: bv, cand: cv, deltaPct: null, fromZero: true });
      continue;
    }
    const d = delta(bv, cv);
    if (d !== null && d > regressMaxPct + spreadPct(baseline, p)) {
      regressions.push({ path: p, base: bv, cand: cv, deltaPct: d });
    }
  }
  if (regressions.length) {
    reasons.push(`regressions: ${regressions.map((r) => (r.fromZero
      ? `${r.path} was ZERO, now ${r.cand} — a new cost the baseline did not have`
      : `${r.path} +${r.deltaPct}%`)).join(', ')}`);
  }

  // ── Metrics this gate could not see at all ──────────────────────────────────
  // Until now only the TARGET's absence was reported. Every other PRIMARY path that
  // failed to resolve in either report just produced a null delta, which the regression
  // loop skipped — so it counted as "did not regress".
  //
  // That is exactly backwards, and it happens routinely rather than exceptionally:
  // compare an old baseline against a candidate built after new metrics were added, and
  // every one of the new metrics stops being judged, silently, while the run still
  // prints KEEP. A gate that cannot see a metric has not cleared that metric; it has no
  // opinion about it, and a gate with no opinion must not sign the change off.
  const missing = [];
  for (const p of PRIMARY) {
    if (p === target) continue; // the target's own absence is already named above
    const inBase = present(baseline, p);
    const inCand = present(candidate, p);
    if (!inBase || !inCand) missing.push({ path: p, where: !inBase && !inCand ? 'both' : (inBase ? 'candidate' : 'baseline') });
  }
  if (missing.length) {
    reasons.push(`cannot judge ${missing.length} PRIMARY metric(s) — absent from a report: ${missing.map((m) => `${m.path} (${m.where})`).join(', ')}`);
  }

  const failedScreens = Object.entries(screens).filter(([, s]) => s && s.pass === false);
  if (failedScreens.length && !uxBugfix) {
    reasons.push(`screens differ: ${failedScreens.map(([n, s]) => `${n} ${s.pct}%`).join(', ')}`);
  }

  return {
    keep: reasons.length === 0,
    target: { path: target, base: tb, cand: tc, deltaPct: td, beyondSpread },
    regressions,
    missing,
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
    const bv = get(b, p);
    const cv = get(c, p);
    const d = delta(bv, cv);
    // A bare '—' in this column used to cover two very different things: "no data" and
    // "the baseline was zero". Only the first is a gap in the report, so the second says
    // so in words — otherwise a reader skims past the row where a brand-new cost appeared.
    const change = d !== null ? `${d}%` : (bv === 0 ? 'from ZERO' : 'not comparable');
    console.log(`  ${p.padEnd(40)} ${String(bv).padStart(9)} → ${String(cv).padStart(9)}  ${change}`);
  }
  for (const [n, s] of Object.entries(screens)) {
    // A bare percentage cannot be acted on. Say where the change is, and name a
    // whole-frame vertical shift explicitly — that shape is a layout change
    // ABOVE the content, not a regression in what is being measured.
    const where = s.box ? ` @ ${s.box.w}x${s.box.h}+${s.box.x}+${s.box.y}` : '';
    const shifted = s.shift ? ` — looks like a ${s.shift.dy > 0 ? 'downward' : 'upward'} shift of ${Math.abs(s.shift.dy)}px (${s.shift.residualPct}% left over once aligned)` : '';
    console.log(`  screen ${n}: ${s.pct}% ${s.pass ? 'ok' : 'DIFF'}${s.pass ? '' : where + shifted}`);
  }
  console.log(v.keep ? 'VERDICT: KEEP' : `VERDICT: REJECT — ${v.reasons.join('; ')}`);
  process.exit(v.keep ? 0 : 1);
}
