// scripts/perf-lab/explain.mjs — "which STEP produced this number?"
//
// WHY this exists. A report's phase totals say a run stalled the main process for
// 1.6 s; they do not say where, and the answer decides whether a change is to
// blame. On 2026-09-09 an after-run showed exactly that, and clearing the change
// meant hand-writing a tree walk to find the stall sitting entirely inside a step
// the branch had not touched. That walk should not be rewritten each time it is
// needed, and it should not be tempting to skip.
//
// Every scenario wraps its steps with the same `step()` shape, so a step is any
// object carrying an `ipc` and/or `probe` sub-object. This walks a run and ranks
// those steps by what they cost, main-process and renderer side by side — the
// distinction that says WHO froze.
//
// Usage:
//   node scripts/perf-lab/explain.mjs <report.json>
//   node scripts/perf-lab/explain.mjs <report.json> --phase artifacts
//   node scripts/perf-lab/explain.mjs <report.json> --phase artifacts --run 2
//   node scripts/perf-lab/explain.mjs <report.json> --by renderer --top 5
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Phase sections that hold `runs` arrays of step trees. `idle` is projected out of
// the startup runs and owns no steps of its own.
export const STEP_PHASES = ['startup', 'history', 'workload', 'replayStall', 'artifacts', 'projects', 'scrollback'];

/**
 * Every step in a run tree, deepest-first path name included.
 *
 * A step is an object with an `ipc` or `probe` child. `ipc`/`probe` themselves are
 * never descended into — they are the measurement, not another step — and neither
 * are arrays of raw samples, which carry no step identity.
 */
export function stepsOf(node, path = '') {
  const out = [];
  if (!node || typeof node !== 'object' || Array.isArray(node)) return out;
  const ipc = node.ipc && typeof node.ipc === 'object' ? node.ipc : null;
  const probe = node.probe && typeof node.probe === 'object' ? node.probe : null;
  if (ipc || probe) {
    out.push({
      path: path || '(whole run)',
      mainStallMs: typeof ipc?.totalStallMs === 'number' ? ipc.totalStallMs : null,
      mainWorstMs: typeof ipc?.maxMs === 'number' ? ipc.maxMs : null,
      rendererMs: typeof probe?.longtaskTotalMs === 'number' ? probe.longtaskTotalMs : null,
      rendererWorstMs: typeof probe?.longtaskMaxMs === 'number' ? probe.longtaskMaxMs : null,
      verdict: node.stall?.verdict ?? null,
    });
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'ipc' || k === 'probe' || k === 'stall') continue;
    out.push(...stepsOf(v, path ? `${path}.${k}` : k));
  }
  return out;
}

/** The runs a phase holds, as [label, runObject] pairs — sizes included (history.huge.runs). */
export function runsOfPhase(report, phase) {
  const sec = report?.[phase];
  if (!sec || typeof sec !== 'object') return [];
  if (Array.isArray(sec.runs)) return sec.runs.map((r, i) => [`${phase}#${i + 1}`, r]);
  // A sized phase (history, replayStall): each size has its own runs array.
  const out = [];
  for (const [size, v] of Object.entries(sec)) {
    if (v && typeof v === 'object' && Array.isArray(v.runs)) {
      out.push(...v.runs.map((r, i) => [`${phase}.${size}#${i + 1}`, r]));
    }
  }
  return out;
}

const num = (v) => (typeof v === 'number' ? String(Math.round(v)) : '—');

export function renderExplain(report, { phase = null, run = null, by = 'main', top = 8 } = {}) {
  const phases = phase ? [phase] : STEP_PHASES;
  const lines = [];
  for (const ph of phases) {
    const runs = runsOfPhase(report, ph);
    if (!runs.length) continue;
    for (const [label, r] of runs) {
      if (run != null && !label.endsWith(`#${run}`)) continue;
      const steps = stepsOf(r).filter((s) => s.mainStallMs != null || s.rendererMs != null);
      if (!steps.length) continue;
      const key = by === 'renderer' ? 'rendererMs' : 'mainStallMs';
      steps.sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1));
      lines.push(`${label} — steps by ${by === 'renderer' ? 'renderer long-task total' : 'main-process stall'}`);
      lines.push(`  ${'step'.padEnd(30)} ${'main stall'.padStart(10)} ${'worst'.padStart(7)} ${'renderer'.padStart(9)} ${'worst'.padStart(7)}  who`);
      for (const s of steps.slice(0, top)) {
        lines.push(`  ${s.path.padEnd(30)} ${num(s.mainStallMs).padStart(10)} ${num(s.mainWorstMs).padStart(7)} ${num(s.rendererMs).padStart(9)} ${num(s.rendererWorstMs).padStart(7)}  ${s.verdict ?? ''}`);
      }
      lines.push('');
    }
  }
  if (!lines.length) return 'no steps found — is this a report from a run that measured anything?';
  // Milliseconds throughout; the "who" column is the scenario's own verdict, which
  // is the whole point of reading main and renderer next to each other.
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: node scripts/perf-lab/explain.mjs <report.json> [--phase P] [--run N] [--by main|renderer] [--top N]');
    process.exit(2);
  }
  const val = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const report = JSON.parse(readFileSync(file, 'utf8'));
  console.log(renderExplain(report, {
    phase: val('--phase') ?? null,
    run: val('--run') != null ? Number(val('--run')) : null,
    by: val('--by') === 'renderer' ? 'renderer' : 'main',
    top: val('--top') != null ? Number(val('--top')) : 8,
  }));
}
