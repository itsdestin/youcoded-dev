#!/usr/bin/env node
// scripts/perf-lab/lane-report.mjs — baseline build vs candidate build, per scenario, with run-to-run noise.
//   node scripts/perf-lab/lane-report.mjs <lane-results.json> [--json]
// Plain-language table in hitch-report.mjs's style (SHOUTING headings, two-space indents, no jargon) plus a JSON form.
//
// THE RULE (the whole point): a metric is called BETTER or WORSE only when the two builds' middle values differ by MORE than
// the run-to-run spread seen on either side (k = 1 spread; exceedsNoise from gpu-cost-parse.mjs) AND by more than a small
// absolute floor (so 0 vs 1 freeze is not a headline). Anything else is SAME. With fewer than two good runs on a side the
// answer is "not enough runs", never a guess. Lower is better for every metric here.
//
// Input shape: { meta: {...}, legs: [{ scenario, side: 'baseline'|'candidate', repeat, status: 'ok'|'invalid'|'failed',
//   metrics: { name: number }, reason? }] }
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { exceedsNoise, median } from './gpu-cost-parse.mjs';
import { METRICS, SCENARIO_METRICS, SCENARIO_TITLES } from './lane-measure.mjs';

export const MIN_RUNS = 2;
const r1 = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);
const rangeOf = (v) => (v.length < 2 ? null : Math.max(...v) - Math.min(...v));

/** One metric, both builds. `a` = baseline readings, `b` = candidate readings (numbers, one per good run). */
export function compareMetric(name, a, b) {
  const spec = METRICS[name] ?? { label: name, unit: '', absFloor: 0 };
  const row = { metric: name, label: spec.label, unit: spec.unit, nBaseline: a.length, nCandidate: b.length };
  if (a.length === 0 && b.length === 0) return { ...row, verdict: 'not measured' };
  const med = (v) => (v.length ? r1(median(v)) : null);
  Object.assign(row, { baseline: med(a), candidate: med(b), baselineSpread: rangeOf(a), candidateSpread: rangeOf(b), baselineValues: a, candidateValues: b });
  if (a.length < MIN_RUNS || b.length < MIN_RUNS) return { ...row, verdict: 'not enough runs' };
  const real = exceedsNoise(median(a), rangeOf(a), median(b), rangeOf(b), { k: 1, absFloor: spec.absFloor });
  const delta = median(b) - median(a);
  return { ...row, change: r1(delta), verdict: !real ? 'same' : delta < 0 ? 'better' : 'worse' };
}

/** Everything for the report: per scenario, per metric, plus how many runs were usable. */
export function compareLegs(results) {
  const legs = results.legs ?? [];
  const scenarios = [...new Set(legs.map((l) => l.scenario))].filter((s) => SCENARIO_METRICS[s]);
  const out = scenarios.map((scenario) => {
    const mine = legs.filter((l) => l.scenario === scenario);
    const good = (side) => mine.filter((l) => l.side === side && l.status === 'ok');
    const bad = mine.filter((l) => l.status !== 'ok').map((l) => ({ side: l.side, repeat: l.repeat, status: l.status, reason: l.reason ?? null }));
    const pull = (side, m) => good(side).map((l) => l.metrics?.[m]).filter((v) => Number.isFinite(v));
    const rows = SCENARIO_METRICS[scenario].map((m) => compareMetric(m, pull('baseline', m), pull('candidate', m)));
    const tally = { better: 0, worse: 0, same: 0, other: 0 };
    for (const r of rows) tally[['better', 'worse', 'same'].includes(r.verdict) ? r.verdict : 'other']++;
    return { scenario, title: SCENARIO_TITLES[scenario], runsBaseline: good('baseline').length, runsCandidate: good('candidate').length, unusable: bad, rows, tally };
  });
  return { meta: results.meta ?? {}, scenarios: out };
}

const cell = (v, unit) => (v == null ? '-' : `${v}${unit === '%' ? '%' : unit === 'ms' ? ' ms' : ''}`);
const spreadText = (s) => (s == null ? 'n/a' : `+/-${r1(s / 2)}`);
const VERDICT_WORDS = { better: 'BETTER', worse: 'WORSE', same: 'same', 'not enough runs': 'not enough runs', 'not measured': 'not measured' };

export function render(cmp) {
  const o = [];
  const m = cmp.meta ?? {};
  o.push('REALISTIC PERFORMANCE TEST');
  o.push(`  Baseline:  ${m.baseline ?? '?'}   Candidate: ${m.candidate ?? '?'}   Machine: ${m.machine ?? '?'}${m.gpu ? ` (${m.gpu})` : ''}`);
  if (m.history) o.push(`  Chat history: ${m.history}`);
  o.push(`  Runs per build per test: ${m.repeats ?? '?'}   Builds alternate baseline, candidate, baseline, candidate...`);
  o.push('');
  const HEAD_END = o.length;
  o.push('HOW TO READ THIS');
  o.push('  BETTER or WORSE is said only when the two builds differ by MORE than the ups and downs between repeat runs of the same build.');
  o.push('  Anything else says "same". A lower number is always better. "n/a" spread means only one good run.');
  o.push('');
  const headline = [];
  for (const s of cmp.scenarios) {
    o.push(s.title.toUpperCase());
    o.push(`  Good runs: baseline ${s.runsBaseline}, candidate ${s.runsCandidate}.  ${s.tally.better} better, ${s.tally.worse} worse, ${s.tally.same} same${s.tally.other ? `, ${s.tally.other} not judged` : ''}.`);
    for (const r of s.rows) {
      const line = r.verdict === 'not measured'
        ? `  ${r.label.padEnd(48)} not measured on either build`
        : `  ${r.label.padEnd(48)} ${cell(r.baseline, r.unit).padStart(10)} (${spreadText(r.baselineSpread)})  ->  ${cell(r.candidate, r.unit).padStart(10)} (${spreadText(r.candidateSpread)})   ${VERDICT_WORDS[r.verdict]}`;
      o.push(line);
      if (r.verdict === 'worse') headline.push(`${s.title}: ${r.label.toLowerCase()} got worse (${cell(r.baseline, r.unit)} -> ${cell(r.candidate, r.unit)})`);
      if (r.verdict === 'better') headline.push(`${s.title}: ${r.label.toLowerCase()} got better (${cell(r.baseline, r.unit)} -> ${cell(r.candidate, r.unit)})`);
    }
    for (const u of s.unusable) o.push(`  Run not counted: ${u.side} #${u.repeat} ${u.status}${u.reason ? ` - ${u.reason}` : ''}`);
    o.push('');
  }
  o.splice(HEAD_END, 0, ...['THE SHORT VERSION', ...(headline.length ? headline.map((h) => `  ${h}.`) : ['  No difference beyond run-to-run noise was found, or there were not enough good runs to say.']), '']);
  return `${o.join('\n')}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) { console.error('usage: lane-report.mjs <lane-results.json> [--json]'); process.exit(2); }
  const cmp = compareLegs(JSON.parse(readFileSync(resolve(file), 'utf8')));
  process.stdout.write(rest.includes('--json') ? `${JSON.stringify(cmp, null, 2)}\n` : render(cmp));
}
