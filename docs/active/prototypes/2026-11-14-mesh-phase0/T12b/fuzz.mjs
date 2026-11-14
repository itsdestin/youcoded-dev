// usage: node fuzz.mjs [--runs N] [--seed S] [--fixed] [--noRemove] [--len L] [--n N] [--quiet]
import { ablate as profile } from './profiles.mjs';
import { gen, runCase, check, fmtEvent, view, C, readdAll, settle } from './sim.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? Number(process.argv[i + 1]) : true); };
const runs = arg('runs', 300), seed0 = arg('seed', 1);
const fixed = !process.argv.includes('--literal');
const rules = profile(process.argv);
if (process.argv.includes('--mutate')) rules.mutateClock = true;
if (process.argv.includes('--mutateOrder')) rules.mutateOrder = true;
const opts = { rules, noRemove: process.argv.includes('--noRemove'), wide: process.argv.includes('--wide'), len: arg('len', 0) || undefined, n: arg('n', 0) || undefined };
const cov = { runs: 0, withPendingMidRun: 0, withParkedMidRun: 0, withRemoval: 0, withTakeover: 0, withSplitVersions: 0, withTailVersion: 0, withDeleted: 0, withConcurrentRemovals: 0, withLoserTail: 0 };
const tally = {}; const first = {}; let exc = 0; let parkedRuns = 0; let rounds0 = 0;
for (let s = seed0; s < seed0 + runs; s++) {
  const { cfg, events } = gen(s, opts);
  let res;
  try { res = runCase(cfg, events); } catch (e) { exc++; (first.EXC ||= []).push([s, e.stack.split('\n').slice(0, 3).join(' | ')]); continue; }
  if (res.rounds < 0) { tally['settle-no-quiesce'] = (tally['settle-no-quiesce'] || 0) + 1; (first['settle-no-quiesce'] ||= []).push(s); }
  if (res.w.stat.parkedMoments) parkedRuns++;
  if (process.argv.includes('--readd')) { readdAll(res.w); const r2 = settle(res.w); if (r2 < 0) { tally['settle-no-quiesce'] = (tally['settle-no-quiesce'] || 0) + 1; (first['settle-no-quiesce'] ||= []).push(s); } }
  const f = check(res.w);
  { const v = view(res.w, res.w.devs[0]); const V = v.chats[C]; cov.runs++; if (res.w.stat.pendingMoments) cov.withPendingMidRun++; if (res.w.stat.parkedMoments) cov.withParkedMidRun++; if (Object.values(v.members).includes('removed')) cov.withRemoval++; if ([...res.w.devs[0].pool.values()].some((e) => e.kind === 'takeover')) cov.withTakeover++; if (V && Object.values(V.versions).filter((x) => !x.tail).length > 1) cov.withSplitVersions++; if (V && Object.values(V.versions).some((x) => x.tail)) cov.withTailVersion++; if (V && V.versions[V.main].deleted) cov.withDeleted++; if (res.w.stat.concurrentRemovalsBothStand) cov.withConcurrentRemovals++; if (V && V.tails.some((t) => t.loser)) cov.withLoserTail++; }
  const seen = new Set();
  for (const x of f) if (!seen.has(x.prop)) { seen.add(x.prop); tally[x.prop] = (tally[x.prop] || 0) + 1; (first[x.prop] ||= []).push(s); }
}
console.log('coverage', JSON.stringify(cov));
console.log(JSON.stringify({ runs, fixed, opts: { ...opts, rules: undefined }, exceptions: exc, runsWithParkedEntries: parkedRuns, failuresByProperty: tally }, null, 1));
for (const [k, v] of Object.entries(first)) console.log(k, 'first seeds:', JSON.stringify(v.slice(0, 60)));
