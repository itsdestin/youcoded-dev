#!/usr/bin/env node
// scripts/perf-lab/run.mjs — the perf lab's one command. Builds the packaged app,
// boots it repeatedly against a throwaway fixture HOME under Xvfb, and writes ONE
// JSON report (plus a Markdown summary) that compare.mjs can later judge a code
// change against. Read scripts/perf-lab/README.md first — it has the CLI, the port
// table, what each metric means, and the troubleshooting notes.
//
// ── The two things this file is structured around ────────────────────────────
//
// 1. THE COMPARE CONTRACT. compare.mjs's PRIMARY list is a set of dotted paths into
//    this report. If one of them silently fails to resolve, the keep/reject gate
//    goes BLIND on that metric and reports a change as "fine" because it could not
//    see it — the worst failure a measure/optimize loop can have, because it is
//    indistinguishable from success. So every finished report is checked against
//    PRIMARY (validateReport) and the run exits non-zero when a requested phase did
//    not produce the numbers compare.mjs needs. tests/run-report.test.mjs pins the
//    same contract offline, against reports built by the very same code paths.
//
// 2. NOTHING IS LEFT RUNNING. Every boot happens inside withBoot(), whose `finally`
//    always tears down. launchApp().kill() THROWS when something survived SIGKILL —
//    that is deliberate, because a survivor holds the CDP port and the fixture's
//    profile lock and the next boot would silently measure the wrong app. So a kill
//    failure is always PRINTED, and re-thrown only when the body did not already
//    fail (otherwise the teardown noise would bury the real cause).
//
// LIVE-APP SAFETY: this file never signals a process directly. All killing goes
// through launch.mjs, which only ever signals pids it re-read from /proc and proved
// match rig-owned absolute paths. Writes are confined to perf-reports/,
// scratch/perf-lab/ and the fixture HOME.
//
// Node built-ins only: the workspace root has no package.json and must not gain one.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, release, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApp, treeFingerprint } from './build.mjs';
import { waitFor } from './cdp.mjs';
import { PRIMARY, get, runsFor } from './compare.mjs';
import { buildFixture } from './fixture.mjs';
import { launchApp, resolveXvfbBin, startXvfb } from './launch.mjs';
import { collectStartup } from './metrics-startup.mjs';
import { cpuPercent, cpuSnapshot, loadAvg1, machineBusyPct, pssMb } from './procs.mjs';
import { MEASURES as HISTORY_MEASURES, MESSAGE_COUNT_EXPR, runHistoryScenario } from './scenario-history.mjs';
import { SCREEN_NAMES, capture } from './screenshots.mjs';

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SCRATCH = join(ROOT, 'scratch', 'perf-lab');
const CDP_PORT = 9555;

/**
 * The phases `--only` can select, in execution order.
 *
 * `history`, `workload` and `shots` share ONE boot (they are cheap to run back to back
 * and the screenshot pass deliberately reuses the workload's six sessions). `stall` and
 * `artifacts` each get their OWN boot — see the WHY at each phase block, but in short:
 * both measure app-wide freezes, and a boot that already has six ChatViews mounted or a
 * resumed 50,000-message transcript in it would charge that leftover state to whatever
 * ran last.
 */
export const PHASES = ['startup', 'history', 'workload', 'shots', 'stall', 'artifacts'];

/**
 * The transcript sizes the `stall` phase measures. Duplicated from
 * `scenario-replay-stall.mjs`'s own `SIZES` rather than imported, for the same reason
 * SETTINGS_OPEN_EXPR is duplicated: the scenario modules load lazily, and
 * `validateReport` is a pure function the unit tests call with no app present.
 * `run.test.mjs` pins the two lists equal so the duplication cannot drift.
 */
export const STALL_SIZES = ['small', 'medium', 'huge'];

/**
 * Report paths whose value is dominated by a NETWORK round trip, so they move with
 * the internet rather than with the code. The findings doc marks these `network`
 * instead of ranking them.
 * These are real dotted report paths (not bare labels) so a consumer can resolve
 * them with compare.mjs's `get()`. `postWindowDone` is listed because the release
 * check happens inside that window — the plan's "releaseCheck" is not a field of
 * its own, it is time hidden in this one.
 */
export const NETWORK_PATHS = ['startup.median.chores.announcements', 'startup.median.postWindowDone'];

// Exit codes. 0 = clean; anything else is meaningful to a script wrapping this.
export const EXIT = { OK: 0, ERROR: 2, TIMEOUT: 3, INCOMPLETE: 4, INTERRUPTED: 130 };

// Cold-start loop timings. Settle first (let the boot's own work drain), THEN sample,
// so the idle numbers are idle and not the tail of startup.
const SETTLE_MS = 10_000;
const CPU_SAMPLE_MS = 15_000;
const BETWEEN_RUNS_MS = 1_500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round1 = (n) => Math.round(n * 10) / 10;

// build.mjs's `dirty` is sha1(status + diff + untracked contents), so a CLEAN tree
// hashes the empty string and still yields a fingerprint. Without this constant every
// report header would announce "dirty <hash>" on a pristine checkout — a lie that
// would make a reader distrust an otherwise reproducible measurement.
const CLEAN_TREE_HASH = createHash('sha1').update('').digest('hex').slice(0, 12);
export const dirtyNote = (dirty) => (dirty && dirty !== CLEAN_TREE_HASH ? `, dirty ${dirty}` : '');
const log = (...a) => console.error(`[perf-lab ${new Date().toISOString().slice(11, 19)}]`, ...a);

// ── Pure helpers (exported so tests can exercise the REAL report shape) ───────

/** Median of the finite numbers in `xs`; null (never NaN) when there are none. */
export const median = (xs) => {
  const s = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Median of every numeric leaf across `runs`, recursing into nested plain objects
 * (so `workload.median.probe.longtaskTotalMs` exists, which compare.mjs requires).
 *
 * WHY the explicit plain-object test rather than `typeof v === 'object'`: an ARRAY is
 * also typeof 'object', and recursing into one would produce a nonsense object keyed
 * 0,1,2… A per-run array (pssBreakdown, sessionIds) has no meaningful median, so it is
 * dropped from the median tree entirely — the raw `runs` still carry it for diagnostics.
 * A key that was null in every run stays null, so it reads as ABSENT downstream instead
 * of as a suspiciously fast 0.
 */
export function medianTree(runs) {
  const rows = runs.filter(isPlainObject);
  const out = {};
  for (const k of new Set(rows.flatMap((r) => Object.keys(r)))) {
    const vals = rows.map((r) => r[k]);
    if (vals.some(Array.isArray)) continue;
    else if (vals.some(isPlainObject)) out[k] = medianTree(vals);
    else out[k] = median(vals);
  }
  return out;
}

// ── Report section builders ──────────────────────────────────────────────────
// These are the ONLY place the report's shape is decided, and main() calls nothing
// else to assemble it. Exported so tests/run-report.test.mjs can build a report from
// synthetic runs through the exact same code the real rig uses — a contract test that
// copied the shape by hand would pass while the real writer drifted away from it.

/** `startup` section: raw cold-start runs plus the median of every numeric leaf. */
export function buildStartupSection(runs) {
  // `breakdown` is a per-pid PSS array with no meaningful median. medianTree drops
  // arrays anyway; stripping it here keeps the intent explicit.
  return { runs, median: medianTree(runs.map(({ breakdown, ...rest }) => rest)) };
}

/** `idle` section, projected out of the same cold-start runs. */
export function buildIdleSection(runs) {
  const pssRuns = runs.map((r) => r.idlePssMb);
  const cpuRuns = runs.map((r) => r.idleCpuPct);
  const medPss = median(pssRuns);
  return {
    pssMb: { median: medPss, runs: pssRuns },
    cpuPct: { median: median(cpuRuns), runs: cpuRuns },
    // The per-process split of the run that actually IS the median, not of whatever
    // sits at the middle INDEX — those are different runs whenever order != size.
    breakdownMedianRun: (runs.find((r) => r.idlePssMb === medPss) ?? runs[0])?.breakdown ?? [],
  };
}

/**
 * `workload` section. `probe` MUST survive into `runs[]` — compare.mjs's runsFor()
 * reads the raw samples for `workload.median.probe.longtaskTotalMs` out of it. Only
 * the two per-run arrays (pssBreakdown, sessionIds) are stripped.
 */
export function buildWorkloadSection(wruns) {
  const forMedian = wruns.map(({ pssBreakdown, sessionIds, ...rest }) => rest);
  return { runs: forMedian, median: medianTree(forMedian), pssBreakdownFirstRun: wruns[0]?.pssBreakdown ?? [] };
}

/**
 * `artifacts` section. Everything numeric comes from the scenario's own `medianRun`,
 * plus ONE field that function does not carry: `ipcSumOfSteps.pings`.
 *
 * WHY the ping count has to reach the report. `ipcSumOfSteps.totalStallMs` is a running
 * SUM that starts at 0, and scenario-artifacts.mjs skips any step whose IPC probe
 * errored. So if every single probe failed, the total is still 0 — a report that says
 * "the app never stalled once" when the truth is that nobody ever asked it. compare.mjs
 * reads that 0 as the best possible score and would KEEP a change that made the app
 * unresponsive. `pings` counts the probe replies actually received, so it is the only
 * number that can tell "nothing stalled" apart from "nothing was measured", and
 * validateReport now refuses a report where it is zero.
 *
 * WHY `medianRun` is passed in rather than imported: the scenario modules are big and
 * load LAZILY (see loadArtifacts below), while this builder has to stay importable by
 * the unit tests with no app present. Handing the function in keeps both true, and keeps
 * the tests building their fixtures through this exact code instead of a hand-copied
 * imitation of it that could drift.
 */
export function buildArtifactsSection(aruns, medianRun) {
  const med = medianRun(aruns);
  return {
    runs: aruns,
    median: { ...med, ipcSumOfSteps: { ...med.ipcSumOfSteps, pings: median(aruns.map((r) => r.ipcSumOfSteps?.pings)) } },
    warnings: [...new Set(aruns.flatMap((r) => r.warnings ?? []))],
  };
}

/** The report skeleton, before any phase has filled anything in. */
export function emptyReport({ label = '', timestamp = new Date().toISOString() } = {}) {
  return {
    schemaVersion: 1,
    label,
    sha: null, branch: null, dirty: null,
    timestamp,
    machine: { cpu: cpus()[0]?.model ?? '', ramGb: Math.round(totalmem() / 2 ** 30), kernel: release(), node: process.version },
    noise: { loadAvgBefore: null, machineBusyPctBefore: null, maxLoadAvgAccepted: null, maxBusyPctAccepted: null, discardedRuns: 0 },
    startup: null, idle: null, history: null, workload: null, replayStall: null, artifacts: null,
    // Per-phase "what was actually measured" descriptors, harvested from each
    // scenario's MEASURES export. See scenario-workload.mjs MEASURES for why:
    // three wrong conclusions in this project came from numbers measured in a
    // configuration where the defect could not appear, and none of them failed
    // loudly. The report now carries its own configuration next to its numbers.
    measures: {},
    network: NETWORK_PATHS,
    errors: { coldStarts: [], scenarioBoot: null, stallBoot: null, artifactsBoot: null },
    screens: null,
    aborted: null,
    incomplete: [],
  };
}

/**
 * Which `--only` phase produces a given PRIMARY path. `idle.*` belongs to `startup`
 * because the idle PSS/CPU samples are taken inside the cold-start loop, not in a
 * phase of their own. Returns null for a path this file does not know how to
 * produce — which validateReport reports as a drift between run.mjs and compare.mjs
 * rather than silently skipping.
 */
export function phaseOfPath(path) {
  if (path.startsWith('startup.') || path.startsWith('idle.')) return 'startup';
  if (path.startsWith('history.')) return 'history';
  if (path.startsWith('workload.')) return 'workload';
  if (path.startsWith('replayStall.')) return 'stall';
  if (path.startsWith('artifacts.')) return 'artifacts';
  return null;
}

/** The PRIMARY paths a given `--only` selection is responsible for producing. */
export function primaryPathsFor(only) {
  return PRIMARY.filter((p) => only.has(phaseOfPath(p)));
}

/**
 * Everything wrong with a finished report, as human sentences. Empty array = clean.
 *
 * The second half is THE CONTRACT (see the file header): for every PRIMARY path whose
 * phase was requested, the median must be a finite number AND `runsFor` must find at
 * least TWO raw samples behind it. Both halves matter, and the sample count is not a
 * quality preference: `spreadPct()` returns 0% for anything under two samples, and 0%
 * noise is what tells the gate that every wobble is a proven win. One run does not make
 * the verdict weaker, it switches the noise check off entirely.
 */
export function validateReport(report, only) {
  const problems = [];
  const need = (ok, msg) => { if (!ok) problems.push(msg); };

  if (only.has('startup')) {
    need(report.startup?.runs?.length > 0, 'startup: no cold-start runs were recorded');
    need(report.idle?.pssMb?.runs?.length > 0, 'idle: no PSS samples were recorded (idle numbers come out of the cold-start loop)');
    need(report.idle?.cpuPct?.runs?.length > 0, 'idle: no CPU samples were recorded');
  }
  if (only.has('history')) {
    for (const size of ['small', 'medium', 'huge']) {
      need(report.history?.[size]?.runs?.length > 0, `history.${size}: no runs were recorded`);
    }
  }
  if (only.has('workload')) need(report.workload?.runs?.length > 0, 'workload: no runs were recorded');
  if (only.has('stall')) {
    for (const size of STALL_SIZES) {
      need(report.replayStall?.[size]?.runs?.length > 0, `replayStall.${size}: no runs were recorded`);
    }
    // Attribution is the entire point of this phase. `blame` null means the renderer
    // long-task observer never attached, so every stall was charged to the main process
    // by default — a fabricated indictment, and exactly the shape of finding that would
    // send the next session optimizing the wrong thread.
    for (const size of STALL_SIZES) {
      const s = report.replayStall?.[size];
      if (!s?.runs?.length) continue;
      need(s.blame != null, `replayStall.${size}: no thread attribution — the renderer long-task observer never attached, so main-vs-renderer blame is unknown, NOT "main process"`);
    }
  }
  if (only.has('artifacts')) {
    need(report.artifacts?.runs?.length > 0, 'artifacts: no runs were recorded');
    // The typing leg is the one that silently degrades to nothing: if `beforeinput`
    // never fires the scenario still returns, with keystroke timings null. That is an
    // instrumentation gap, not a fast editor (scenario-artifacts.mjs pushes the same
    // warning), so it must not read as a clean run.
    const typed = report.artifacts?.median?.typing?.codeLarge?.keystroke?.medianMs;
    need(typeof typed === 'number' && Number.isFinite(typed),
      'artifacts: keystroke-to-paint was never measured on the large file — the meter did not arm, so typing cost is UNKNOWN, not zero');

    // The sneakiest of the artifacts numbers, and the reason buildArtifactsSection carries
    // `pings` at all. `ipcSumOfSteps.totalStallMs` is a SUM seeded at zero, and every step
    // whose IPC probe errored is skipped rather than recorded. Fail every probe and the
    // total is 0 — which is not "the app stayed responsive", it is "responsiveness was
    // never measured", and the two are written identically in the report. compare.mjs
    // would score that 0 as the largest possible improvement over any baseline and keep a
    // change that froze the app solid. `pings` is the count of probe replies actually
    // received, so zero pings is the tell. Only checked when the phase produced runs —
    // otherwise the "no runs were recorded" line above already says it.
    if (report.artifacts?.runs?.length > 0) {
      const pings = report.artifacts?.median?.ipcSumOfSteps?.pings;
      need(typeof pings === 'number' && Number.isFinite(pings) && pings > 0,
        'artifacts: the IPC responsiveness probe never got a single reply, so artifacts.median.ipcSumOfSteps.totalStallMs is 0 because the stall total is UNMEASURED, not because the app stayed responsive — the keep/reject gate would read that zero as a perfect score');
    }
  }
  if (only.has('shots')) {
    const got = new Set(report.screens?.names ?? []);
    const missing = SCREEN_NAMES.filter((n) => !got.has(n));
    need(missing.length === 0, `shots: never captured ${missing.join(', ')} — a screen that was not shot is UNREVIEWED, not "unchanged"`);
  }

  for (const path of PRIMARY) {
    const phase = phaseOfPath(path);
    if (phase === null) {
      problems.push(`compare.mjs PRIMARY path "${path}" belongs to no phase run.mjs knows how to produce — the two files have drifted apart`);
      continue;
    }
    if (!only.has(phase)) continue;   // phase deliberately skipped via --only
    const v = get(report, path);
    // Reported as EITHER/OR, not both: a missing median already implies missing samples,
    // and saying so twice per path buries the genuinely sneaky case below — a median that
    // looks perfectly healthy with no evidence underneath it.
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      problems.push(`compare.mjs PRIMARY path "${path}" is ${JSON.stringify(v) ?? 'undefined'} — the keep/reject gate would be BLIND to this metric`);
      continue;
    }
    const samples = runsFor(report, path);
    if (samples.length === 0) {
      problems.push(`compare.mjs PRIMARY path "${path}" has a median (${v}) but NO per-run samples behind it — spreadPct() would report 0% noise and let jitter pass as a proven win`);
    } else if (samples.length < 2) {
      // ONE sample is not "a thin measurement", it is NO measurement of noise at all —
      // and the gate treats the two identically, in the dangerous direction.
      //
      // spreadPct() needs at least two runs to see how far a number moves between
      // identical runs; with one it returns 0. The comparison then reads "this metric has
      // zero run-to-run noise", so ANY movement at all — a machine that was slightly
      // busier, a boot that got unlucky — clears the noise check and is certified as a
      // real, proven win. A single-run report therefore does not merely produce a weaker
      // verdict, it disarms the one mechanism that separates a result from a coincidence.
      // Two repeats is the bare minimum that can produce a spread; the real runs use 3-5.
      problems.push(`compare.mjs PRIMARY path "${path}" has only ${samples.length} sample behind its median (${v}) — one run cannot show run-to-run spread, so spreadPct() reports 0% noise and the gate's noise check is DISARMED, not merely thin: any jitter would pass as a proven win. At least 2 repeats are required.`);
    }
  }
  return problems;
}

/** Filename stem shared by the .json, the .md and the screenshot dir. */
export function stemFor({ timestamp, sha, label }) {
  const slug = String(label ?? '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return `${timestamp.slice(0, 10)}-${timestamp.slice(11, 16).replace(':', '')}-${String(sha ?? 'nosha').slice(0, 7)}${slug ? `-${slug}` : ''}`;
}

/**
 * The Markdown summary that sits beside the JSON. Every row is `—` when its number is
 * missing, which is exactly the state validateReport refuses to exit 0 on — so an
 * operator seeing a `—` also has a stderr sentence naming it.
 */
export function renderMarkdown(report, stem) {
  const m = report.startup?.median ?? {};
  const n = (v, unit) => (typeof v === 'number' && Number.isFinite(v) ? `${v} ${unit}` : '—');
  const STARTUP_KEYS = ['whenReady', 'createWindowAt', 'blankWindowMs', 'didFinishLoad', 'firstContentfulPaint', 'appMounted', 'sessionsListed', 'postWindowDone'];
  const isNetwork = (path) => NETWORK_PATHS.includes(path);

  const lines = [
    `# perf-lab ${stem}`,
    '',
    `sha ${report.sha ?? '—'} (${report.branch ?? '—'}${dirtyNote(report.dirty)}) — ${report.timestamp}`,
    `machine: ${report.machine?.cpu ?? '?'} · ${report.machine?.ramGb ?? '?'} GB · kernel ${report.machine?.kernel ?? '?'} · node ${report.machine?.node ?? '?'}`,
    '',
  ];
  if (report.aborted) lines.push(`> **ABORTED:** ${report.aborted}`, '> The rows below are whatever had been measured when the run stopped.', '');

  lines.push('| metric | median |', '|---|---|');
  for (const k of STARTUP_KEYS) {
    lines.push(`| startup.${k}${isNetwork(`startup.median.${k}`) ? ' (network)' : ''} | ${n(m[k], 'ms')} |`);
  }
  for (const [k, v] of Object.entries(m.chores ?? {})) {
    lines.push(`| chore.${k}${isNetwork(`startup.median.chores.${k}`) ? ' (network)' : ''} | ${n(v, 'ms')} |`);
  }
  lines.push(`| idle PSS | ${n(report.idle?.pssMb?.median, 'MB')} |`);
  lines.push(`| idle CPU | ${n(report.idle?.cpuPct?.median, '%')} |`);

  for (const [size, h] of Object.entries(report.history ?? {})) {
    const hm = h?.median ?? {};
    lines.push(
      `| history.${size} (median of ${h?.runs?.length ?? 0}, ${h?.stabilizedRuns ?? 0} stabilized) | ` +
      `last10 ${n(hm.ipcLast10Ms, 'ms')} · all ${n(hm.ipcAllMs, 'ms')} · ` +
      `resume first ${n(hm.resumeFirstMessageMs, 'ms')} · stable ${n(hm.resumeStableMs, 'ms')} |`,
    );
  }

  if (report.workload) {
    const w = report.workload.median ?? {};
    const p = w.probe ?? {};
    lines.push(
      `| switch, pane swapped (median of ${report.workload.runs?.length ?? 0}) | ${n(w.switchMedianMs, 'ms')} / ${n(w.switchP95Ms, 'ms')} p95 |`,
      // The row that matters: the container swapping is not the switch a user sees.
      `| **switch, messages on screen** | **${n(w.switchPaintedMedianMs, 'ms')} / ${n(w.switchPaintedP95Ms, 'ms')} p95** |`,
      // A bucket with unsettled switches is showing the 20s CAP, not a measurement.
      // Saying so on the row is the difference between "slow" and "we gave up".
      ...Object.entries(w.switchPaintedBySize ?? {}).map(([size, v]) =>
        `| switch into a '${size}' conversation (n=${v?.n ?? 0}, ${n(v?.medianEntries, 'entries')}` +
        // "of N expected" is how a reader checks the label against what rendered.
        `${typeof v?.expectedEntries === 'number' ? ` of ${v.expectedEntries} expected` : ''}) | ` +
        `${n(v?.medianMs, 'ms')} / ${n(v?.p95Ms, 'ms')} p95` +
        `${v?.unsettled ? ` — ⚠ ${v.unsettled} hit the 20s CAP, so this is a FLOOR` : ''}` +
        `${v?.short ? ` — ⚠ ${v.short} never showed the whole conversation, so this label is NOT verified` : ''} |`),
      // Arrays do not survive medianTree, so the streamed-into list comes from run 1.
      `| streamed into, during the switches | ${(report.workload.runs?.[0]?.streamedInto ?? []).join(', ') || '—'} |`,
      ...(w.unsettledSwitches ? [`| ⚠ switches that never settled | ${w.unsettledSwitches} — those timings are a 20s FLOOR, not a measurement |`] : []),
      `| long tasks | ${n(p.longtaskCount, 'tasks')} (${n(p.longtaskTotalMs, 'ms')} total, max ${n(p.longtaskMaxMs, 'ms')}) |`,
      `| frame gaps > 40ms | ${n(p.frameGapCount, 'gaps')} (max ${n(p.frameGapMaxMs, 'ms')}) |`,
      `| native first token | ${n(w.nativeFirstTokenMs, 'ms')} |`,
      `| CPU during workload | ${n(w.cpuDuringPct, '%')} |`,
      `| PSS after workload | ${n(w.pssAfterMb, 'MB')} |`,
    );
  }

  for (const [size, s] of Object.entries(report.replayStall ?? {})) {
    const sm = s?.median ?? {};
    lines.push(
      `| stall.${size} (median of ${s?.runs?.length ?? 0}, ${s?.stabilizedRuns ?? 0} stabilized) | ` +
      `worst freeze ${n(sm.ipcMaxMs, 'ms')} · total ${n(sm.ipcTotalStallMs, 'ms')} · ` +
      // The blame string, never a silent default: null attribution is printed as
      // "attribution unavailable" so it can never be read as "main process".
      `main ${n(sm.mainProcessStallMs, 'ms')} / renderer ${n(sm.rendererStallMs, 'ms')} — ${s?.blame ?? '**attribution unavailable**'} |`,
    );
  }

  if (report.artifacts) {
    const a = report.artifacts.median ?? {};
    const runN = report.artifacts.runs?.length ?? 0;
    lines.push(
      `| artifacts.open code small / large (median of ${runN}) | ${n(a.open?.codeSmall?.openMs, 'ms')} / ${n(a.open?.codeLarge?.openMs, 'ms')} |`,
      `| artifacts.open markdown small / large | ${n(a.open?.mdSmall?.openMs, 'ms')} / ${n(a.open?.mdLarge?.openMs, 'ms')} |`,
      `| artifacts.html swap median / p95 | ${n(a.htmlNav?.swap?.medianMs, 'ms')} / ${n(a.htmlNav?.swap?.p95Ms, 'ms')} |`,
      `| artifacts.keystroke small median / p95 | ${n(a.typing?.codeSmall?.keystroke?.medianMs, 'ms')} / ${n(a.typing?.codeSmall?.keystroke?.p95Ms, 'ms')} |`,
      `| artifacts.keystroke large median / p95 | ${n(a.typing?.codeLarge?.keystroke?.medianMs, 'ms')} / ${n(a.typing?.codeLarge?.keystroke?.p95Ms, 'ms')} |`,
      `| artifacts.copy click -> "Copied!" | ${n(a.copy?.clickToCopiedMs, 'ms')} |`,
      `| artifacts long tasks | ${n(a.probe?.longtaskTotalMs, 'ms')} total, max ${n(a.probe?.longtaskMaxMs, 'ms')} |`,
      // The ping count is printed BESIDE the stall total on purpose: the total is a sum
      // seeded at zero over probes that are skipped when they error, so "0 ms" with no
      // pings behind it means nobody measured, not that nothing stalled. Showing the two
      // together is what lets a human tell those apart at a glance.
      `| artifacts IPC stall (sum over steps) | ${n(a.ipcSumOfSteps?.totalStallMs, 'ms')}, max ${n(a.ipcSumOfSteps?.maxMs, 'ms')}, from ${n(a.ipcSumOfSteps?.pings, 'probe replies')} |`,
    );
  }

  lines.push('');
  lines.push(
    `noise: load ${report.noise?.loadAvgBefore ?? '—'}, busy ${report.noise?.machineBusyPctBefore ?? '—'}%, ` +
    `worst accepted load ${report.noise?.maxLoadAvgAccepted ?? '—'} / busy ${report.noise?.maxBusyPctAccepted ?? '—'}%, ` +
    `discarded ${report.noise?.discardedRuns ?? 0}`,
  );
  lines.push(
    `errors (desktop.log "level":"ERROR" lines): cold starts ${JSON.stringify(report.errors?.coldStarts ?? [])}, ` +
    `scenario boot ${report.errors?.scenarioBoot ?? '—'}, ` +
    `stall boot ${report.errors?.stallBoot ?? '—'}, artifacts boot ${report.errors?.artifactsBoot ?? '—'}`,
  );
  lines.push('A boot that logged errors is not a clean measurement — do not rank a phase from one. Full logs: scratch/perf-lab/logs/.');

  // Correction 6: a size that never stabilized has resumeStableMs null. Surfacing the
  // warnings here is what stops a reader treating "—" as "instant".
  const warnings = Object.entries(report.history ?? {}).flatMap(([size, h]) => (h?.warnings ?? []).map((w) => `${size}: ${w}`));
  if (warnings.length) lines.push('', '## History warnings', '', ...warnings.map((w) => `- ${w}`));
  // Same reasoning as the history warnings above: a stall size that never stabilized,
  // or an artifacts leg whose meter never armed, reports `—` for its timings. Without
  // the warning beside it that `—` reads as "instant" instead of "not measured".
  const stallWarnings = Object.entries(report.replayStall ?? {}).flatMap(([size, s]) => (s?.warnings ?? []).map((w) => `${size}: ${w}`));
  if (stallWarnings.length) lines.push('', '## Stall warnings', '', ...stallWarnings.map((w) => `- ${w}`));
  if (report.artifacts?.warnings?.length) lines.push('', '## Artifact warnings', '', ...report.artifacts.warnings.map((w) => `- ${w}`));
  if (report.screens?.failures?.length) lines.push('', '## Screenshot failures', '', ...report.screens.failures.map((f) => `- ${f}`));
  // Configuration beside the numbers. A reader must never have to guess whether
  // "switching: 118ms" meant switching between loaded conversations or empty ones.
  const measures = Object.values(report.measures ?? {});
  if (measures.length) {
    lines.push('', '## What was actually measured', '',
      'Every number above was produced in a specific configuration. Three wrong conclusions',
      'in this project came from a number measured where the defect could not appear, and none',
      'of them failed loudly — they returned clean numbers. Read the configuration with the number.', '');
    for (const m of measures) {
      lines.push(`### ${m.scenario}`, '', `**Question:** ${m.question}`, '', '**Configuration:**');
      for (const c of m.configuration ?? []) lines.push(`- ${c}`);
      if (m.clocks) {
        lines.push('', '**Where each clock starts and stops:**');
        for (const [k, v] of Object.entries(m.clocks)) lines.push(`- \`${k}\` — ${v}`);
      }
      if (m.blindTo?.length) {
        lines.push('', '**Blind to:**');
        for (const b of m.blindTo) lines.push(`- ${b}`);
      }
      lines.push('');
    }
  }
  if (report.incomplete?.length) lines.push('', '## Incomplete — do NOT rank anything from this report', '', ...report.incomplete.map((p) => `- ${p}`));

  lines.push('');
  return lines.join('\n');
}

// ── CLI parsing ──────────────────────────────────────────────────────────────

const VALUE_FLAGS = ['checkout', 'runs', 'history-repeats', 'workload-repeats', 'stall-repeats', 'artifact-repeats', 'only', 'label', 'out', 'max-minutes'];
const BOOL_FLAGS = ['force-build', 'dry-run', 'help'];

export const USAGE = `perf-lab — build the app, measure it, write one report.

  node scripts/perf-lab/run.mjs [options]

  --checkout <dir>          youcoded checkout to build   (default worktrees/perf-lab)
  --runs <n>                cold-start runs              (default 5)
  --history-repeats <n>     resume measurements per size (default 5)
  --workload-repeats <n>    workload passes              (default 3)
  --stall-repeats <n>       replay-stall passes per size (default 3)
  --artifact-repeats <n>    artifact-panel passes        (default 3)
  --only a,b,c              phases: ${PHASES.join(', ')}  (default all)
  --force-build             rebuild even if the tree fingerprint is unchanged
  --label <text>            appended to the output filename stem
  --out <dir>               report directory             (default perf-reports/)
  --max-minutes <n>         abort (exit ${EXIT.TIMEOUT}) past this budget  (default 90)
  --dry-run                 print the resolved plan and exit 0, launching nothing
  --help                    this text

Exit codes: 0 clean · ${EXIT.ERROR} error · ${EXIT.TIMEOUT} over --max-minutes · ${EXIT.INCOMPLETE} report missing numbers a requested phase owed · ${EXIT.INTERRUPTED} interrupted`;

/**
 * Parse argv into a fully-resolved plan. Throws on anything ambiguous rather than
 * guessing — a typo'd flag that is silently ignored costs a 45-minute run.
 */
export function parseArgs(argv, { root = ROOT } = {}) {
  const raw = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) throw new Error(`perf-lab: unexpected argument ${JSON.stringify(tok)} — every option is a --flag. See --help.`);
    const name = tok.slice(2);
    if (BOOL_FLAGS.includes(name)) { raw[name] = true; continue; }
    if (!VALUE_FLAGS.includes(name)) {
      throw new Error(`perf-lab: unknown option --${name}. Known: ${[...VALUE_FLAGS, ...BOOL_FLAGS].map((f) => `--${f}`).join(' ')}`);
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`perf-lab: --${name} needs a value.`);
    raw[name] = value;
  }

  const posInt = (name, def) => {
    if (raw[name] === undefined) return def;
    const v = Number(raw[name]);
    if (!Number.isInteger(v) || v < 1) throw new Error(`perf-lab: --${name} must be a whole number >= 1, got ${JSON.stringify(raw[name])}.`);
    return v;
  };

  const onlyTokens = (raw.only ?? PHASES.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = onlyTokens.filter((p) => !PHASES.includes(p));
  if (unknown.length) throw new Error(`perf-lab: --only got unknown phase(s) ${unknown.join(', ')}. Valid: ${PHASES.join(', ')}`);
  if (!onlyTokens.length) throw new Error('perf-lab: --only selected no phases.');

  return {
    checkout: resolve(raw.checkout ?? join(root, 'worktrees', 'perf-lab')),
    out: resolve(raw.out ?? join(root, 'perf-reports')),
    runs: posInt('runs', 5),
    historyRepeats: posInt('history-repeats', 5),
    workloadRepeats: posInt('workload-repeats', 3),
    stallRepeats: posInt('stall-repeats', 3),
    artifactRepeats: posInt('artifact-repeats', 3),
    // 45 -> 90 on 2026-08-27: the default selection went from 6 boots to 8 (stall and
    // artifacts each take one of their own), and the stall phase alone is 9 transcript
    // resumes. A deadline that fires mid-phase throws away every minute already spent,
    // so the default is deliberately generous — narrow it with --only, not with this.
    maxMinutes: posInt('max-minutes', 90),
    only: new Set(onlyTokens),
    label: raw.label ?? '',
    forceBuild: raw['force-build'] === true,
    dryRun: raw['dry-run'] === true,
    help: raw.help === true,
  };
}

// ── Runtime pieces ───────────────────────────────────────────────────────────

let liveApp = null;   // whatever boot is running right now, for the teardown paths

/**
 * Tear down the live app. NEVER lets a teardown failure mask the real error.
 *
 * launchApp().kill() throws when a process survived SIGKILL — deliberately, because a
 * survivor holds the CDP port and the fixture profile lock, so the next boot would
 * attach to the WRONG app. That is worth failing a clean run over. But when the body
 * already failed, the body's error is the one that explains the run, so the kill error
 * is printed loudly and not re-thrown. Either way it is never silently swallowed.
 */
async function teardown({ rethrow }) {
  const app = liveApp;
  liveApp = null;
  if (!app) return;
  try {
    await app.kill();
  } catch (e) {
    console.error(`[perf-lab] TEARDOWN FAILED — processes survived and may still hold CDP port ${CDP_PORT} and the fixture profile:\n${e.message}`);
    if (rethrow) throw e;
  }
}

/** Boot, run `fn`, and always tear down — with the error-masking rule above. */
async function withBoot(build, fixture, fn) {
  const app = await launchApp({ binary: build.binary, appDir: build.appDir, fixture, cdpPort: CDP_PORT });
  liveApp = app;
  let bodyFailed = false;
  try {
    // The app is up when the renderer has listed sessions — that is the first moment
    // every startup mark this report reads has actually fired.
    await waitFor(app.cdp, `performance.getEntriesByType('mark').some(m => m.name === 'yc:sessions-listed')`, { timeoutMs: 90_000 });
    return await fn(app);
  } catch (e) {
    bodyFailed = true;
    throw e;
  } finally {
    await teardown({ rethrow: !bodyFailed });
  }
}

/**
 * Count `"level":"ERROR"` lines in this boot's desktop.log and archive the log.
 * The substring is exact: logger.ts writes one `JSON.stringify(entry)` per line, so
 * the level field never carries whitespace (verified against main/logger.ts, 2026-08-26).
 * A missing log is a legitimate zero — the app may simply never have logged.
 */
function readErrorLines(fixture, stem, boot) {
  let text = '';
  try { text = readFileSync(join(fixture.home, '.claude', 'desktop.log'), 'utf8'); } catch { /* never written */ }
  const dir = join(SCRATCH, 'logs');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${stem}-${boot}.log`), text);
  return text.split('\n').filter((l) => l.includes('"level":"ERROR"')).length;
}

/**
 * Refuse to take official numbers while the machine is busy. Retries rather than
 * failing, because "a build finished in another terminal" is the common case and it
 * passes in 30 s. Every discard is counted into the report so a reader can see the
 * run happened on a noisy machine.
 */
async function noiseGate(noise) {
  for (let i = 0; i < 5; i++) {
    const la = loadAvg1();
    const busy = round1(await machineBusyPct(3));
    if (la < 4 && busy < 10) {
      // loadAvgBefore/machineBusyPctBefore are the FIRST accepted reading (the state
      // the report started from); the max fields say how bad it got across all gates.
      if (noise.loadAvgBefore === null) { noise.loadAvgBefore = la; noise.machineBusyPctBefore = busy; }
      noise.maxLoadAvgAccepted = Math.max(noise.maxLoadAvgAccepted ?? 0, la);
      noise.maxBusyPctAccepted = Math.max(noise.maxBusyPctAccepted ?? 0, busy);
      return;
    }
    log(`machine busy (load ${la}, ${busy}% cpu) — waiting 30s`);
    noise.discardedRuns++;
    await sleep(30_000);
  }
  throw new Error('perf-lab: the machine never went idle (load < 4 and CPU < 10% over 3s) across 5 attempts; refusing to take official numbers on a busy machine.');
}

/** Resume a transcript and wait until the timeline has painted — for the screenshots. */
async function resumeAndSettle(app, fixture, size) {
  const t = fixture.transcripts[size];
  const id = await app.cdp.evaluate(
    `window.claude.session.create({ name: 'shot-${size}', cwd: ${JSON.stringify(fixture.projects.alpha)}, skipPermissions: true, resumeSessionId: ${JSON.stringify(t.sessionId)} }).then(s => s.id)`,
  );
  await waitFor(app.cdp, `(${MESSAGE_COUNT_EXPR}) > 0`, { timeoutMs: 60_000 });
  await sleep(1_500);
  return id;
}

/**
 * Click a header button by its `title`. Real synthesized mouse input rather than
 * `el.click()`, because the target here is a screenshot of the resulting UI and we
 * want the same code path a user takes (hover state included).
 * `[title="Settings"]` is HeaderBar.tsx:449, an `onToggleSettings` toggle — clicking
 * it twice opens and closes. It lives in a ternary branch, so a layout that renders
 * the OTHER branch has no such button; that is why this throws by name.
 */
/**
 * Is the Settings drawer actually ON SCREEN?
 *
 * Not "does its close button exist" — SettingsPanel is ALWAYS MOUNTED and merely
 * translated off-screen (`open ? 'translate-x-0' : '-translate-x-full'`,
 * SettingsPanel.tsx:237), so `[aria-label="Close settings"]` is in the DOM either
 * way. Measured: open puts that button at x~289, closed translates the panel
 * -320px so the same button reports a NEGATIVE x. Duplicated here rather than
 * imported so run.mjs keeps working when scenario-workload.mjs is absent (it is
 * loaded lazily on purpose — see loadWorkload).
 */
const SETTINGS_OPEN_EXPR = `(() => {
  const el = document.querySelector('[aria-label="Close settings"]');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.x >= 0;
})()`;

/**
 * Guarantee the Settings drawer is CLOSED before a screenshot.
 *
 * WHY: it covers the left 320px, and it was measured stuck open across the
 * six-sessions AND native-chat shots — three of the five gated screens became
 * variations of "Settings open", so any UI change behind the drawer was invisible
 * to the parity gate. A screen that hides a third of itself is not a screen.
 */
async function ensureSettingsClosed(app, label) {
  for (let i = 0; i < 3; i++) {
    if (!(await app.cdp.evaluate(SETTINGS_OPEN_EXPR))) return;
    await app.cdp.evaluate(`(() => { const x = document.querySelector('[aria-label="Close settings"]'); if (x) x.click(); })()`);
    await sleep(600);
  }
  if (await app.cdp.evaluate(SETTINGS_OPEN_EXPR)) {
    throw new Error(`perf-lab screenshot "${label}": the Settings drawer would not close, and it covers the left 320px. Refusing to save a screen that hides a third of itself.`);
  }
}

async function clickTitle(app, title) {
  const selector = `[title=${JSON.stringify(title)}]`;
  const box = await app.cdp.evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
  );
  if (!box) throw new Error(`no element matching ${selector} is in the DOM`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await app.cdp.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  }
  await sleep(800);
}

/**
 * The workload scenario is a sibling task's deliverable and is imported LAZILY on
 * purpose: a static import would make `--dry-run`, `--only startup` and every unit
 * test fail at module-resolution time just because that one file is not present yet.
 */
async function loadWorkload() {
  try {
    return await import('./scenario-workload.mjs');
  } catch (e) {
    throw new Error(`perf-lab: the workload phase needs scripts/perf-lab/scenario-workload.mjs, which could not be loaded: ${e.message}\nRun with --only startup,history,shots to skip it.`);
  }
}

// Same lazy-load contract as loadWorkload above: both of these transitively import
// scenario-workload.mjs (for the renderer long-task probe), so a static import here
// would make `--dry-run` and every unit test pay for the whole scenario tree.
async function loadReplayStall() {
  try {
    return await import('./scenario-replay-stall.mjs');
  } catch (e) {
    throw new Error(`perf-lab: the stall phase needs scripts/perf-lab/scenario-replay-stall.mjs, which could not be loaded: ${e.message}\nRun with --only startup,history,workload,shots to skip it.`);
  }
}

async function loadArtifacts() {
  try {
    return await import('./scenario-artifacts.mjs');
  } catch (e) {
    throw new Error(`perf-lab: the artifacts phase needs scripts/perf-lab/scenario-artifacts.mjs, which could not be loaded: ${e.message}\nRun with --only startup,history,workload,shots to skip it.`);
  }
}

/** Read the build stamp WITHOUT building — so --dry-run can report freshness honestly. */
async function buildFreshness(checkout) {
  const desktop = join(checkout, 'desktop');
  const binary = join(desktop, 'release', 'linux-unpacked', 'youcoded');
  const stamp = join(desktop, 'release', '.perf-lab-build.json');
  try {
    const fp = await treeFingerprint(checkout);
    let prev = null;
    try { prev = JSON.parse(readFileSync(stamp, 'utf8')); } catch { /* never built here */ }
    const haveBinary = existsSync(binary);
    return { ...fp, binary, haveBinary, builtAt: prev?.builtAt ?? null, fresh: Boolean(haveBinary && prev && prev.sha === fp.sha && prev.dirty === fp.dirty) };
  } catch (e) {
    return { error: e.message, binary, haveBinary: existsSync(binary) };
  }
}

// ── The run ──────────────────────────────────────────────────────────────────

async function main(argv) {
  let cfg;
  try {
    cfg = parseArgs(argv);
  } catch (e) {
    console.error(e.message);
    return EXIT.ERROR;
  }
  if (cfg.help) { console.log(USAGE); return EXIT.OK; }

  const deadline = Date.now() + cfg.maxMinutes * 60_000;
  const checkDeadline = () => {
    if (Date.now() > deadline) throw Object.assign(new Error(`--max-minutes ${cfg.maxMinutes} exceeded`), { exitCode: EXIT.TIMEOUT });
  };

  // ---- --dry-run: resolve everything, launch nothing ------------------------
  if (cfg.dryRun) {
    const fresh = await buildFreshness(cfg.checkout);
    const timestamp = new Date().toISOString();
    const stem = stemFor({ timestamp, sha: fresh.sha, label: cfg.label });
    const scenarioBoot = ['history', 'workload', 'shots'].some((p) => cfg.only.has(p));
    let xvfb;
    try { xvfb = resolveXvfbBin(); } catch (e) { xvfb = `(resolution failed: ${e.message})`; }
    const lines = [
      'perf-lab --dry-run — resolved plan (nothing was launched)',
      '',
      `  checkout          ${cfg.checkout}`,
      `  build             ${fresh.error ? `cannot fingerprint: ${fresh.error}` : `sha ${fresh.sha?.slice(0, 7)} (${fresh.branch}${dirtyNote(fresh.dirty)})`}`,
      `  binary            ${fresh.binary} ${fresh.haveBinary ? '(present)' : '(MISSING — will be built)'}`,
      `  build freshness   ${cfg.forceBuild ? 'FORCED rebuild (--force-build)' : fresh.fresh ? `fresh, reused (built ${fresh.builtAt})` : 'stale or absent — will rebuild (1-3 min)'}`,
      `  Xvfb binary       ${xvfb}`,
      `  workload module   ${existsSync(join(ROOT, 'scripts', 'perf-lab', 'scenario-workload.mjs')) ? 'present' : 'ABSENT — the workload phase would fail'}`,
      `  stall module      ${existsSync(join(ROOT, 'scripts', 'perf-lab', 'scenario-replay-stall.mjs')) ? 'present' : 'ABSENT — the stall phase would fail'}`,
      `  artifacts module  ${existsSync(join(ROOT, 'scripts', 'perf-lab', 'scenario-artifacts.mjs')) ? 'present' : 'ABSENT — the artifacts phase would fail'}`,
      '',
      `  phases            ${PHASES.map((p) => `${p}${cfg.only.has(p) ? '' : ' (skipped)'}`).join(', ')}`,
      `  cold-start boots  ${cfg.only.has('startup') ? cfg.runs : 0}`,
      // Named separately rather than summed: the shared boot covers three phases,
      // while stall and artifacts each take one of their own (see their phase blocks).
      `  scenario boots    ${scenarioBoot ? 1 : 0} shared (history/workload/shots)` +
        `${cfg.only.has('stall') ? ' + 1 stall' : ''}${cfg.only.has('artifacts') ? ' + 1 artifacts' : ''}`,
      `  history repeats   ${cfg.only.has('history') ? `${cfg.historyRepeats} per size (small, medium, huge)` : '—'}`,
      `  workload passes   ${cfg.only.has('workload') ? `${cfg.workloadRepeats}${cfg.only.has('shots') ? ' + 1 screenshot pass (not in the median)' : ''}` : '—'}`,
      `  screenshots       ${cfg.only.has('shots') ? SCREEN_NAMES.join(', ') : '—'}`,
      `  stall passes      ${cfg.only.has('stall') ? `${cfg.stallRepeats} per size (${STALL_SIZES.join(', ')}), own boot` : '—'}`,
      `  artifact passes   ${cfg.only.has('artifacts') ? `${cfg.artifactRepeats}, own boot` : '—'}`,
      '',
      `  out dir           ${cfg.out}`,
      `  report            ${join(cfg.out, `${stem}.json`)}`,
      `  summary           ${join(cfg.out, `${stem}.md`)}`,
      `  screenshots dir   ${join(cfg.out, 'shots', stem)}`,
      `  logs archived to  ${join(SCRATCH, 'logs')}/${stem}-<boot>.log`,
      `  fixture HOME      ${join(SCRATCH, 'home')} (wiped and rebuilt per boot)`,
      '',
      `  deadline          ${cfg.maxMinutes} min — ${new Date(deadline).toISOString()} (exit ${EXIT.TIMEOUT} past it)`,
      '',
      `  compare.mjs PRIMARY paths this selection MUST produce (${primaryPathsFor(cfg.only).length}/${PRIMARY.length}):`,
      ...primaryPathsFor(cfg.only).map((p) => `    ${p}`),
      ...(primaryPathsFor(cfg.only).length < PRIMARY.length
        ? ['', `  not produced by this selection (compare.mjs cannot judge them from this report):`,
           ...PRIMARY.filter((p) => !cfg.only.has(phaseOfPath(p))).map((p) => `    ${p}`)]
        : []),
      '',
    ];
    console.log(lines.join('\n'));
    return EXIT.OK;
  }

  // ---- SIGINT + watchdog ---------------------------------------------------
  // WHY this handler does not kill anything itself: launchApp installs its OWN SIGINT
  // handler (registered AFTER this one, so it runs second) which SIGKILLs the family it
  // proved it owns and then exits 130. Exiting here first would pre-empt it and have the
  // two racing over the same pids. So when a boot is live we stand back and let it work,
  // with an unref'd 5 s backstop in case its handlers were somehow already detached.
  process.on('SIGINT', () => {
    console.error('\n[perf-lab] SIGINT — tearing down.');
    if (!liveApp) process.exit(EXIT.INTERRUPTED);
    setTimeout(() => process.exit(EXIT.INTERRUPTED), 5_000).unref();
  });
  // checkDeadline() only fires at phase boundaries; this catches a boot that HANGS
  // mid-phase. process.exit runs launchApp's own 'exit' handler, which SIGKILLs the
  // family — so "abort after killing the app family" holds on this path too.
  setTimeout(() => {
    console.error(`[perf-lab] --max-minutes ${cfg.maxMinutes} exceeded mid-phase; killing the app family and aborting.`);
    process.exit(EXIT.TIMEOUT);
  }, cfg.maxMinutes * 60_000).unref();

  const report = emptyReport({ label: cfg.label });
  let exitCode = EXIT.OK;
  let stem = stemFor({ timestamp: report.timestamp, sha: 'nosha', label: cfg.label });

  try {
    log('building', cfg.checkout);
    const build = await buildApp(cfg.checkout, { skipIfFresh: !cfg.forceBuild });
    Object.assign(report, { sha: build.sha, branch: build.branch, dirty: build.dirty });
    stem = stemFor({ timestamp: report.timestamp, sha: build.sha, label: cfg.label });
    log(`built ${build.sha.slice(0, 7)} (${build.branch}${dirtyNote(build.dirty)}) → ${build.binary}`);

    // Let startXvfb's own error through untouched — it names the exact install command.
    const x = await startXvfb();
    log(`display ${x.display} ${x.reused ? 'reused' : 'started'}`);

    // ---- Cold starts ------------------------------------------------------
    if (cfg.only.has('startup')) {
      const runs = [];
      for (let i = 0; i < cfg.runs; i++) {
        checkDeadline();
        await noiseGate(report.noise);
        const fixture = buildFixture(SCRATCH, { log });
        const run = await withBoot(build, fixture, async (app) => {
          const startup = await collectStartup(app, fixture);
          await sleep(SETTLE_MS);                       // let the boot's own work drain first
          const pids = app.family();
          const c0 = cpuSnapshot(pids);
          await sleep(CPU_SAMPLE_MS);
          const cpu = cpuPercent(c0, cpuSnapshot(pids), CPU_SAMPLE_MS / 1000);
          const pss = pssMb(app.family());
          return {
            ...startup,
            idlePssMb: pss.totalMb,
            idleCpuPct: round1(cpu.totalPct),
            errorLines: readErrorLines(fixture, stem, `cold-${i + 1}`),
            breakdown: pss.perPid,
          };
        });
        runs.push(run);
        report.errors.coldStarts.push(run.errorLines);
        log(`cold start ${i + 1}/${cfg.runs}: sessionsListed ${run.sessionsListed}ms, blank ${run.blankWindowMs}ms, idle ${run.idlePssMb}MB, ${run.idleCpuPct}% cpu, ${run.errorLines} error lines`);
        await sleep(BETWEEN_RUNS_MS);
      }
      report.startup = buildStartupSection(runs);
      report.idle = buildIdleSection(runs);
    }

    // ---- One scenario boot for history + workload + screenshots ------------
    if (['history', 'workload', 'shots'].some((p) => cfg.only.has(p))) {
      checkDeadline();
      await noiseGate(report.noise);
      const fixture = buildFixture(SCRATCH, { log });
      await withBoot(build, fixture, async (app) => {
        const shotDir = join(cfg.out, 'shots', stem);
        const shotNames = [];
        const shotFailures = [];
        // A screenshot failure must never destroy the numeric phases that already ran —
        // it is recorded, and validateReport turns it into a non-zero exit at the end.
        const shot = async (name) => {
          if (!cfg.only.has('shots')) return;
          try { await capture(app, shotDir, name); shotNames.push(name); }
          catch (e) { shotFailures.push(`${name}: ${e.message}`); log(`screenshot '${name}' FAILED: ${e.message}`); }
        };

        await shot('welcome');

        if (cfg.only.has('history')) {
          report.history = await runHistoryScenario(app, fixture, { repeats: cfg.historyRepeats });
          report.measures.history = HISTORY_MEASURES;
          for (const [size, h] of Object.entries(report.history)) {
            log(`history.${size}: last10 ${h.median.ipcLast10Ms}ms, all ${h.median.ipcAllMs}ms, stable ${h.median.resumeStableMs}ms (${h.stabilizedRuns}/${h.runs.length} stabilized)`);
          }
        }

        if (cfg.only.has('shots')) {
          try {
            const id = await resumeAndSettle(app, fixture, 'medium');
            await shot('chat-medium');
            await clickTitle(app, 'Settings');
            await shot('settings-open');
            await clickTitle(app, 'Settings');
            await ensureSettingsClosed(app, 'post-settings-open');
            await app.cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(id)})`).catch(() => {});
            await sleep(500);
          } catch (e) {
            shotFailures.push(`chat-medium/settings-open: ${e.message}`);
            log(`screenshot navigation FAILED: ${e.message}`);
          }
        }

        if (cfg.only.has('workload')) {
          const { runWorkloadScenario, MEASURES: WORKLOAD_MEASURES } = await loadWorkload();
          report.measures.workload = WORKLOAD_MEASURES;
          const wruns = [];
          for (let i = 0; i < cfg.workloadRepeats; i++) {
            checkDeadline();
            const r = await runWorkloadScenario(app, fixture);
            wruns.push(r);
            log(`workload ${i + 1}/${cfg.workloadRepeats}: switch p95 ${r.switchP95Ms}ms, long tasks ${r.probe?.longtaskTotalMs}ms, ${r.cpuDuringPct}% cpu, ${r.pssAfterMb}MB`);
          }
          report.workload = buildWorkloadSection(wruns);

          if (cfg.only.has('shots')) {
            try {
              // A separate pass whose numbers are deliberately NOT in the median:
              // taking screenshots perturbs the very timings it would contribute.
              checkDeadline();
              const shotPass = await runWorkloadScenario(app, fixture, { keepSessions: true });
              await ensureSettingsClosed(app, 'six-sessions');
              await shot('six-sessions');
              // The keepSessions pass creates ids[0..3] = Claude Code, ids[4..5] = native
              // (scenario-workload.mjs:449-471), so index 4 named 'native-0' is the native chat.
              //
              // WHY NOT window.claude.session.switch(id): on desktop that IPC handler is a
              // parity STUB that returns { ok: true } and switches nothing (ipc-handlers.ts:820-824
              // — "Switch is a client-side concern on desktop"). Using it would leave the
              // previous conversation on screen and save it as `native-chat.png` — a
              // confidently mislabelled screenshot, which is worse than a missing one.
              // scenario-workload's in-page helper drives the real pill/overflow path and
              // reports `ok` only when the VISIBLE PANE actually moved, so we can refuse to
              // shoot a switch that did not happen.
              const ids = shotPass.sessionIds;
              if (!ids?.length) {
                shotFailures.push('native-chat: the keepSessions workload pass returned no sessionIds, so there was no native session to switch to');
              } else {
                const sw = await app.cdp.evaluate(`window.__perfLab.switchTo(4, 'native-0', ${ids.length})`);
                if (sw?.ok) {
                  await sleep(800);
                  await ensureSettingsClosed(app, 'native-chat');
                  await shot('native-chat');
                } else {
                  shotFailures.push(`native-chat: could not switch to the native session (mode ${sw?.mode ?? '?'}, pane ${sw?.paneBefore} -> ${sw?.paneAfter}${sw?.reason ? `, ${sw.reason}` : ''}) — refusing to save a screenshot of the wrong conversation`);
                }
              }
            } catch (e) {
              shotFailures.push(`six-sessions/native-chat: ${e.message}`);
              log(`workload screenshot pass FAILED: ${e.message}`);
            }
          }
        }

        report.screens = cfg.only.has('shots') ? { dir: shotDir, names: shotNames, failures: shotFailures } : null;
        report.errors.scenarioBoot = readErrorLines(fixture, stem, 'scenario');
      });
    }

    // ---- Replay stall: its OWN boot ---------------------------------------
    // WHY not the shared boot above: this phase exists to attribute an app-wide freeze
    // to the main process or the renderer, and it resumes transcripts up to 50,000
    // messages. Running it after `workload` would leave six ChatViews mounted
    // (ChatView.tsx:695-707 keeps one per open session) and after `history` would leave
    // a resumed transcript on screen — either way the renderer is already carrying work
    // this phase did not cause, and the attribution would charge it to whatever ran
    // last. A clean boot is the only state in which the blame means anything.
    if (cfg.only.has('stall')) {
      checkDeadline();
      await noiseGate(report.noise);
      const { runReplayStallScenario, MEASURES: STALL_MEASURES } = await loadReplayStall();
      report.measures.stall = STALL_MEASURES;
      const fixture = buildFixture(SCRATCH, { log });
      await withBoot(build, fixture, async (app) => {
        report.replayStall = await runReplayStallScenario(app, fixture, { repeats: cfg.stallRepeats });
        for (const [size, s] of Object.entries(report.replayStall)) {
          log(`stall.${size}: ipc max ${s.median.ipcMaxMs}ms (main ${s.median.mainProcessStallMs}ms / renderer ${s.median.rendererStallMs}ms) — ${s.blame ?? 'attribution UNAVAILABLE'}, ${s.stabilizedRuns}/${s.runs.length} stabilized`);
          for (const w of s.warnings) log(`stall.${size} warning: ${w}`);
        }
        report.errors.stallBoot = readErrorLines(fixture, stem, 'stall');
      });
    }

    // ---- Artifact panel: its OWN boot --------------------------------------
    // WHY not the shared boot: this phase types into a real CodeMirror editor and
    // swaps HTML documents in an iframe. Both are sensitive to whatever else is
    // mounted, and its own cleanup has to dismiss an unsaved-changes dialog — a
    // failure there would pop that dialog over every later screenshot. Isolating it
    // keeps a failure in this phase from silently corrupting a different one.
    if (cfg.only.has('artifacts')) {
      checkDeadline();
      await noiseGate(report.noise);
      const { runArtifactScenario, medianRun: artifactMedian, MEASURES: ARTIFACT_MEASURES } = await loadArtifacts();
      report.measures.artifacts = ARTIFACT_MEASURES;
      const fixture = buildFixture(SCRATCH, { log });
      await withBoot(build, fixture, async (app) => {
        const runs = [];
        for (let i = 0; i < cfg.artifactRepeats; i++) {
          checkDeadline();
          const r = await runArtifactScenario(app, fixture);
          runs.push(r);
          log(`artifacts ${i + 1}/${cfg.artifactRepeats}: open md large ${r.open?.mdLarge?.openMs}ms, keystroke p95 ${r.typing?.codeLarge?.keystroke?.p95Ms}ms, html swap ${r.htmlNav?.swap?.medianMs}ms, ipc stall ${r.ipcSumOfSteps?.totalStallMs}ms`);
          for (const w of r.warnings ?? []) log(`artifacts warning: ${w}`);
        }
        report.artifacts = buildArtifactsSection(runs, artifactMedian);
        report.errors.artifactsBoot = readErrorLines(fixture, stem, 'artifacts');
      });
    }
  } catch (e) {
    // The numbers already collected cost real minutes, so the report is still written —
    // clearly stamped `aborted` so nobody mistakes a partial run for a clean one.
    report.aborted = e.message;
    exitCode = e.exitCode ?? EXIT.ERROR;
    console.error(`[perf-lab] aborted: ${e.message}`);
  } finally {
    await teardown({ rethrow: false });
  }

  // ---- Write + enforce -----------------------------------------------------
  report.incomplete = validateReport(report, cfg.only);
  mkdirSync(cfg.out, { recursive: true });
  const jsonPath = join(cfg.out, `${stem}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(join(cfg.out, `${stem}.md`), renderMarkdown(report, stem));
  console.log(jsonPath);

  if (report.incomplete.length) {
    console.error(`\n[perf-lab] REPORT IS INCOMPLETE — ${report.incomplete.length} problem(s). Do not rank anything from it:`);
    for (const p of report.incomplete) console.error(`  - ${p}`);
    if (exitCode === EXIT.OK) exitCode = EXIT.INCOMPLETE;
  }
  return exitCode;
}

// Guarded so `import('./run.mjs')` (tests, tooling) loads the pure helpers above
// without building, launching or writing anything.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const code = await main(process.argv.slice(2));
  // process.exitCode (not process.exit) so the final console.log of the report path is
  // never truncated on a piped stdout. The unref'd net below never delays a clean exit;
  // it only fires if a stray handle would otherwise hang the run forever.
  process.exitCode = code;
  setTimeout(() => { console.error('[perf-lab] event loop did not drain; forcing exit.'); process.exit(code); }, 10_000).unref();
}
