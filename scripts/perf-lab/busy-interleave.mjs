// scripts/perf-lab/busy-interleave.mjs — the BUSY-MACHINE, INTERLEAVED old-vs-new comparison (owner decision Q-7, 2026-10-22).
//
// WHY this is a separate path and not a loosening of compare.mjs/comparability.mjs: those REFUSE exploratory (--busy-machine)
// and disturbed reports, and that refusal is the strict, quiet-machine contract. The owner chose to measure NOW instead of
// waiting for a quiet machine, so reliability has to come from the DESIGN of the experiment:
//   1. interleave A and B (A,B then B,A then A,B ...) so background load and slow drift hit both sides alike;
//   2. repeat (>= 5 rounds) and judge medians + ranges, never one run;
//   3. an A/A run under the same conditions says how big "no real change" looks on this busy machine;
//   4. keep every window's interference verdict and say who was using the machine.
// Everything here is pure (no I/O, no clocks) so it is unit-tested with fake reports. Nothing here is a "clean" result: the
// document is always labelled "busy machine, exploratory — interleaved design".
import { WORKLOAD_METRICS } from './workload-lane.mjs';

export const BUSY_TITLE = 'busy machine, exploratory — interleaved design';
// Lane F metrics judged per rung. The three WORKLOAD_METRICS are the lane's own paths; typing delay and peak memory live in the
// same per-run rung rows, so they are judged the same way (all lower-is-better).
export const BUSY_METRICS = Object.freeze([...WORKLOAD_METRICS, 'inputLatencyMs', 'peakPssMb']);
// WHY 3: with fewer than three measured runs on a side a range says nothing about spread.
export const MIN_RUNS_PER_SIDE = 3;

/**
 * The run order. Each round runs both sides once; the order flips every round (A,B / B,A / A,B ...) so a steady drift in
 * background load cancels instead of always favouring the side that runs first. With `aa` the two slots are both the SAME
 * candidate (keys a and a2), which measures the noise itself.
 */
export function interleaveSchedule(rounds, { aa = false } = {}) {
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error('rounds must be a whole number >= 1');
  const second = aa ? 'a2' : 'b';
  const slots = [];
  for (let round = 1; round <= rounds; round++) {
    const order = round % 2 === 1 ? ['a', second] : [second, 'a'];
    order.forEach((key, i) => slots.push({ round, position: i + 1, key, label: `r${round}-${key}` }));
  }
  return slots;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const median = (xs) => { const s = [...xs].sort((p, q) => p - q); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10);
const MEASURED = new Set(['measured', 'slow']);

/**
 * Pull every rung's per-run row out of lane-F reports. `reports` is a list of { round, key, report|null, error? }.
 * Returns Map<rungId, Map<side, samples[]>>, where a sample is { round, status, reason, values:{metric:number|null}, interference }.
 * WHY a missing/failed row is kept as a sample WITHOUT values: it must count as "not measured", never as zero.
 */
export function collectSamples(runs, sideOf) {
  const out = new Map();
  for (const run of runs) {
    const side = sideOf(run.key);
    const section = run.report?.workloads;
    if (!section || !Array.isArray(section.runs)) continue;
    for (const pass of section.runs) {
      for (const [id, row] of Object.entries(pass.rungs ?? {})) {
        if (!out.has(id)) out.set(id, { a: [], b: [] });
        const measured = MEASURED.has(row?.status);
        out.get(id)[side].push({
          round: run.round, status: row?.status ?? 'no row', reason: row?.reason ?? null, detail: row?.detail ?? null,
          interference: row?.interference ?? 'unknown',
          values: Object.fromEntries(BUSY_METRICS.map((m) => [m, measured ? num(row?.[m]) : null])),
        });
      }
    }
  }
  return out;
}

const spread = (xs) => (xs.length ? { min: Math.min(...xs), max: Math.max(...xs) } : null);

/**
 * The conservative verdict. B counts as faster/slower ONLY when ALL hold:
 *   - at least MIN_RUNS_PER_SIDE measured runs on each side;
 *   - the two sides' [min, max] ranges do NOT overlap (every B run is beyond every A run);
 *   - |median B - median A| is larger than the A/A noise for this metric (when an A/A run exists).
 * Zero measured runs on a side is `not measured (reason)`; anything else is `no clear difference`. Lower is better.
 */
export function busyVerdict(aSamples, bSamples, metric, { noise = null, minRuns = MIN_RUNS_PER_SIDE } = {}) {
  const pick = (samples) => samples.map((s) => s.values[metric]).filter((v) => v !== null);
  const reasonFor = (samples) => {
    if (!samples.length) return 'no run produced this rung';
    const counts = new Map();
    for (const s of samples) if (s.values[metric] === null) counts.set(s.reason ?? s.status, (counts.get(s.reason ?? s.status) ?? 0) + 1);
    return [...counts].map(([k, n]) => `${k} ×${n}`).join(', ') || 'no finite value';
  };
  const a = pick(aSamples), b = pick(bSamples);
  const base = { nA: a.length, nB: b.length, rangeA: spread(a), rangeB: spread(b), medianA: round1(median(a)), medianB: round1(median(b)) };
  if (!a.length || !b.length) {
    const why = [!a.length ? `A: ${reasonFor(aSamples)}` : null, !b.length ? `B: ${reasonFor(bSamples)}` : null].filter(Boolean).join('; ');
    return { ...base, delta: null, deltaPct: null, verdict: `not measured (${why})` };
  }
  const delta = round1(base.medianB - base.medianA);
  const deltaPct = base.medianA === 0 ? null : round1((delta / base.medianA) * 100);
  const out = { ...base, delta, deltaPct };
  if (a.length < minRuns || b.length < minRuns) return { ...out, verdict: 'no clear difference', note: `too few measured runs (A ${a.length}, B ${b.length}; need ${minRuns} each)` };
  const rA = base.rangeA, rB = base.rangeB;
  const separated = rB.max < rA.min ? 'faster' : rB.min > rA.max ? 'slower' : null;
  if (!separated) return { ...out, verdict: 'no clear difference', note: 'ranges overlap' };
  if (noise !== null && !(Math.abs(base.medianB - base.medianA) > noise)) return { ...out, verdict: 'no clear difference', note: `separated, but within A/A noise (${round1(noise)})` };
  return { ...out, verdict: `B ${separated}`, note: noise === null ? 'ranges separate; no A/A noise available' : `ranges separate and beyond A/A noise (${round1(noise)})` };
}

/** Build every rung × metric row. `noiseByKey` maps "<rung>.<metric>" to the A/A |median difference|. */
export function buildBusyRows(samplesByRung, { noiseByKey = null, order = null } = {}) {
  const ids = order ? [...order, ...[...samplesByRung.keys()].filter((i) => !order.includes(i))] : [...samplesByRung.keys()];
  const rows = [];
  for (const id of ids) {
    const s = samplesByRung.get(id) ?? { a: [], b: [] };
    for (const metric of BUSY_METRICS) {
      const key = `${id}.${metric}`;
      const noise = noiseByKey && Object.hasOwn(noiseByKey, key) ? noiseByKey[key] : null;
      const v = busyVerdict(s.a, s.b, metric, { noise });
      const clean = (xs) => xs.filter((x) => x.values[metric] !== null && x.interference === 'clean').length;
      rows.push({ rung: id, metric, ...v, nCleanA: clean(s.a), nCleanB: clean(s.b), nDisturbedA: v.nA - clean(s.a), nDisturbedB: v.nB - clean(s.b), noise });
    }
  }
  return rows;
}

/** Summarise the foreign load recorded by every window of every run, per side. */
export function summariseLoad(runs, sideOf) {
  const wins = { a: [], b: [] };
  const verdicts = { clean: 0, disturbed: 0, unknown: 0 };
  const offenders = new Map();
  for (const run of runs) {
    const side = sideOf(run.key);
    for (const w of run.report?.interference?.windows ?? []) {
      const cores = num(w.foreignAvgCores);
      if (cores !== null) wins[side].push(cores);
      const v = w.verdict in verdicts ? w.verdict : 'unknown';
      verdicts[v]++;
      for (const o of w.offenders ?? []) {
        const cur = offenders.get(o.name) ?? { name: o.name, windows: 0, sumCores: 0, maxCores: 0 };
        cur.windows++; cur.sumCores += num(o.cores) ?? 0; cur.maxCores = Math.max(cur.maxCores, num(o.cores) ?? 0);
        offenders.set(o.name, cur);
      }
    }
  }
  const all = [...wins.a, ...wins.b];
  const side = (xs) => ({ windows: xs.length, medianCores: round1(median(xs)), maxCores: xs.length ? round1(Math.max(...xs)) : null });
  return {
    windows: all.length, verdicts, medianCores: round1(median(all)), maxCores: all.length ? round1(Math.max(...all)) : null,
    bySide: { a: side(wins.a), b: side(wins.b) },
    // Ranked by total cores used across windows (a program that is present often and busy ranks first).
    topOffenders: [...offenders.values()].sort((p, q) => q.sumCores - p.sumCores).slice(0, 6)
      .map((o) => ({ name: o.name, windows: o.windows, meanCores: round1(o.sumCores / o.windows), maxCores: round1(o.maxCores) })),
  };
}

const f = (v) => (v === null || v === undefined ? '—' : String(v));
const rng = (r) => (r ? `${round1(r.min)}–${round1(r.max)}` : '—');
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The whole summary as a data object (written to JSON, and the input to the Markdown renderer). */
export function buildBusySummary({ runs, plan, noiseByKey = null, noiseSource = null, rungOrder = null }) {
  const sideOf = (key) => (key === 'a' ? 'a' : 'b');
  const samples = collectSamples(runs, sideOf);
  const rows = buildBusyRows(samples, { noiseByKey, order: rungOrder });
  const counts = {};
  for (const r of rows) { const k = r.verdict.startsWith('not measured') ? 'not measured' : r.verdict; counts[k] = (counts[k] ?? 0) + 1; }
  return {
    title: BUSY_TITLE, aa: plan.aa === true, rounds: plan.rounds, minRunsPerSide: MIN_RUNS_PER_SIDE,
    candidates: { a: plan.a, b: plan.aa ? plan.a : plan.b },
    noiseSource, runs: runs.map((r) => ({ round: r.round, position: r.position, key: r.key, label: r.label, exit: r.exit ?? null, report: r.jsonPath ?? null, error: r.error ?? null, incomplete: r.report ? (r.report.incomplete ?? []).length : null })),
    load: summariseLoad(runs, sideOf), counts, rows,
  };
}

export function renderBusySummaryMarkdown(summary, { title = null } = {}) {
  const L = [];
  const aaMode = summary.aa;
  L.push(`# ${title ?? (aaMode ? 'A/A noise check' : 'Old vs new')} — ${summary.title}`, '',
    '> **Busy machine, exploratory.** Measured without waiting for a quiet machine; other programs were using the CPU the whole time (see Foreign load). This is NOT a clean/strict comparison (the strict path in `compare.mjs` still refuses such reports). Reliability comes from the design: runs alternate order every round so background load hits both sides alike, each side is judged on its median and range over several runs, and an A/A run shows what "no change" looks like here.', '',
    `- Side A (${aaMode ? 'first slot' : 'old'}): \`${summary.candidates.a}\``,
    `- Side B (${aaMode ? 'second slot — the SAME candidate' : 'new'}): \`${summary.candidates.b}\``,
    `- Rounds: ${summary.rounds}, order alternates every round: ${summary.runs.slice(0, 4).map((r) => r.key.toUpperCase()).join(',')}…`,
    `- A/A noise used: ${summary.noiseSource ?? 'none — verdicts use the range rule only'}`, '',
    '## Verdict rule (conservative)', '',
    `B is called **faster/slower** only when ALL hold: (1) at least ${summary.minRunsPerSide} measured runs on each side; (2) the two sides' min–max ranges do not overlap; (3) |median B − median A| exceeds the A/A noise for that metric (when an A/A run exists). Otherwise **no clear difference**. A side with no measured run is **not measured (reason)** — a failed or missing row is never counted as zero. Lower is better for every metric.`, '');
  const c = summary.counts;
  L.push('## Counts', '', Object.entries(c).map(([k, v]) => `- ${k}: ${v}`).join('\n'), '');
  const ld = summary.load;
  L.push('## Foreign load observed (other programs, from the per-window interference watch)', '',
    `- Windows watched: ${ld.windows}; verdicts: ${ld.verdicts.clean} clean, ${ld.verdicts.disturbed} disturbed, ${ld.verdicts.unknown} unknown`,
    `- Foreign cores in use: median ${f(ld.medianCores)}, max ${f(ld.maxCores)} (window averages)`,
    `- Side A windows: ${ld.bySide.a.windows}, median ${f(ld.bySide.a.medianCores)} cores, max ${f(ld.bySide.a.maxCores)} · Side B windows: ${ld.bySide.b.windows}, median ${f(ld.bySide.b.medianCores)} cores, max ${f(ld.bySide.b.maxCores)} (similar numbers mean the interleaving spread the load evenly)`,
    `- Top offenders (mean cores while present / max): ${ld.topOffenders.map((o) => `${o.name} ${o.meanCores}/${o.maxCores} (${o.windows} windows)`).join('; ') || '—'}`, '');
  L.push('## Runs', '', '| round | slot | side | exit | incomplete notes | report | problem |', '|---|---|---|---|---|---|---|');
  for (const r of summary.runs) L.push(`| ${r.round} | ${r.position} | ${r.key.toUpperCase()} | ${f(r.exit)} | ${f(r.incomplete)} | ${r.report ? `\`${r.report}\`` : '—'} | ${esc(r.error ?? '')} |`);
  L.push('');
  const flagged = summary.rows.filter((r) => r.verdict === 'B faster' || r.verdict === 'B slower');
  L.push(`## ${aaMode ? 'False alarms (A/A should show none)' : 'Differences found'}`, '');
  if (!flagged.length) L.push('None.', '');
  else {
    L.push('| rung | metric | A median | B median | Δ | Δ% | A range | B range | n A | n B | verdict |', '|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of flagged) L.push(`| ${r.rung} | ${r.metric} | ${f(r.medianA)} | ${f(r.medianB)} | ${f(r.delta)} | ${f(r.deltaPct)}% | ${rng(r.rangeA)} | ${rng(r.rangeB)} | ${r.nA} | ${r.nB} | ${r.verdict} |`);
    L.push('');
  }
  L.push('## Every rung and metric', '', 'n = measured runs (clean/disturbed windows). Times in ms, memory in MiB.', '',
    '| rung | metric | A median | B median | Δ | Δ% | A range | B range | n A (clean/dist) | n B (clean/dist) | verdict | note |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of summary.rows) {
    L.push(`| ${r.rung} | ${r.metric} | ${f(r.medianA)} | ${f(r.medianB)} | ${f(r.delta)} | ${r.deltaPct === null ? '—' : `${r.deltaPct}%`} | ${rng(r.rangeA)} | ${rng(r.rangeB)} | ${r.nA} (${r.nCleanA}/${r.nDisturbedA}) | ${r.nB} (${r.nCleanB}/${r.nDisturbedB}) | ${esc(r.verdict)} | ${esc(r.note ?? '')} |`);
  }
  L.push('');
  return L.join('\n');
}

/** The per-metric A/A noise map ("<rung>.<metric>" -> |median difference|) from an A/A summary object, for --noise-from. */
export function noiseFromAaSummary(summary) {
  if (!summary || summary.aa !== true || !Array.isArray(summary.rows)) throw new Error('not an A/A busy-machine summary (expected aa: true)');
  const out = {};
  for (const r of summary.rows) if (r.delta !== null && r.delta !== undefined && r.nA >= 1 && r.nB >= 1) out[`${r.rung}.${r.metric}`] = Math.abs(r.delta);
  return out;
}
