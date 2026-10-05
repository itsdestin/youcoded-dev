// scripts/perf-lab/switch-table.mjs — print the headline tables from switch-pingpong.mjs result files.
//   node scripts/perf-lab/switch-table.mjs scratch/perf-lab/switch/*.json
// One row per (configuration x sequence): show p50/p95/max, settle p50/p95/max (ms), frame-gap and dropped counts.
import { readFileSync } from 'node:fs';
import { summarise } from './switch-analysis.mjs';

const f = n => (n === null || n === undefined ? '-' : String(n));
const trip = s => `${f(s.p50)}/${f(s.p95)}/${f(s.max)}`;

export function rows(report) {
  const out = [];
  const add = (seq, sub, samples) => {
    const ok = samples.filter(s => s.ok && s.status === 'ok');
    out.push({
      cfg: `${report.pair} x${report.sessions}`, load: Object.fromEntries(Object.entries(report.sequences ?? {}).map(([k, v]) => [k, v?.loadAvg?.split(' ')[0]])), seq: sub ? `${seq}${sub}` : seq, n: ok.length, dropped: samples.length - ok.length,
      show: summarise(ok.map(s => s.showMs)), settle: summarise(ok.map(s => s.settleMs)),
      cold: ok.filter(s => s.cold).length, gaps: ok.filter(s => s.gaps?.length).length, gapMax: Math.max(0, ...ok.map(s => s.gapMaxMs ?? 0)),
      loaf: ok.reduce((a, s) => a + (s.longAnimationFrames?.length ?? 0), 0),
    });
  };
  for (const [seq, r] of Object.entries(report.sequences ?? {})) {
    if (r?.samples) add(seq, '', r.samples);
    else if (r?.reps && r.reps[0]?.samples) add(seq, '', r.reps.flatMap(x => x.samples));
  }
  return out;
}

export function print(files) {
  console.log('config | seq | n (dropped) | show p50/p95/max | settle p50/p95/max | cold | switches with gaps | worst gap | LoAF');
  for (const file of files) {
    const rep = JSON.parse(readFileSync(file, 'utf8'));
    for (const r of rows(rep)) console.log(`${r.cfg}${rep.unusable ? ' (UNUSABLE load)' : ''}${Number(r.load[r.seq.replace(/#.*/, '')]) > 8 ? ' [LOAD ' + r.load[r.seq.replace(/#.*/, '')] + ']' : ''} | ${r.seq} | ${r.n} (${r.dropped}) | ${trip(r.show)} | ${trip(r.settle)} | ${r.cold} | ${r.gaps} | ${r.gapMax} | ${r.loaf}`);
  }
}
if (process.argv[1]?.endsWith('switch-table.mjs')) print(process.argv.slice(2));
