// T4 schedule fuzzer. node fuzz.mjs --n 1000 --devices 3 --jobs 4 [--seed0 1] [--cfg dominance=false,det=false,...]
//   one schedule, verbose: node fuzz.mjs --seed 17 --devices 3 -v
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { World, rng } from './carrier.mjs';
import { run, Repo, stats } from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => { if (x.startsWith('--')) a.push([x.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]); else if (x === '-v') a.push(['v', true]); return a; }, []));
const cfgFrom = (s) => Object.fromEntries(String(s === true || !s ? '' : s).split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k, v === 'true' ? true : v === 'false' ? false : v]; }));
const POOL = ['a.txt', 'b.txt', 'c.md', 'd', 'docs/e.txt', 'docs/f.txt', 'd/g.txt', 'x/y/z.txt', 'notes'];

function listFiles(root) {
  const out = [];
  const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (rel === '' && e.name === '.youcoded') continue; const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else out.push(r); } };
  walk(root, ''); return out.sort();
}

/** One random user action on one device. Every line is a unique token so loss can be detected. */
function userOp(w, d, r, ctr) {
  const root = d.work; const files = listFiles(root);
  const tok = () => `${d.name}${ctr.n++}`;
  const L = w.log;
  const write = (f, lines) => { const p = path.join(root, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, lines.map((l) => l + '\n').join('')); d.dirty = true; L.ops++; };
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').split('\n').filter((x) => x !== '');
  const x = r();
  if (x < 0.22 || !files.length) { // create (or add to) a file
    const f = r.pick(POOL); const block = [tok(), tok(), tok(), tok()];
    try {
      if (files.includes(f)) { const ls = read(f); ls.splice(r.int(ls.length + 1), 0, block[0]); write(f, ls); L.written.add(block[0]); }
      else { write(f, block); block.forEach((t) => L.written.add(t)); }
    } catch { /* path blocked by a folder or file here: skip */ }
  } else if (x < 0.45) { const f = r.pick(files); const ls = read(f); const t = tok(); L.written.add(t); ls.splice(r.int(ls.length + 1), 0, t); write(f, ls); } // insert
  else if (x < 0.75) { const f = r.pick(files); const ls = read(f); if (!ls.length) return; const i = r.int(ls.length); L.removed.add(ls[i]); const t = tok(); L.written.add(t); ls[i] = t; write(f, ls); } // replace a line
  else if (x < 0.82) { const f = r.pick(files); const ls = read(f); if (!ls.length) return; const i = r.int(ls.length); L.removed.add(ls[i]); ls.splice(i, 1); write(f, ls); } // delete a line
  else if (x < 0.90) { const f = r.pick(files); read(f).forEach((t) => L.removed.add(t)); fs.rmSync(path.join(root, f)); d.dirty = true; L.ops++; // delete file (and empty parent dirs)
    let dir = path.dirname(path.join(root, f)); while (dir !== root && fs.readdirSync(dir).length === 0) { fs.rmdirSync(dir); dir = path.dirname(dir); } }
  else { const f = r.pick(files); const t = r.pick(POOL.filter((p) => !files.includes(p))); if (!t) return; // rename
    try { const full = path.join(root, t); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.renameSync(path.join(root, f), full); d.dirty = true; L.ops++;
      let dir = path.dirname(path.join(root, f)); while (dir !== root && fs.readdirSync(dir).length === 0) { fs.rmdirSync(dir); dir = path.dirname(dir); } } catch { /* blocked */ } }
}

function snapshotTree(d) { // path -> sha1 of disk bytes
  const m = new Map(); for (const f of listFiles(d.work)) m.set(f, crypto.createHash('sha1').update(fs.readFileSync(path.join(d.work, f))).digest('hex')); return m;
}

export function runSchedule(seed, nDev, cfg, verbose = false) {
  const r = rng(seed);
  const names = 'ABCDE'.slice(0, nDev).split('');
  const topo = r.pick(['full', 'full', 'chain', 'chain', 'star']);
  const dir = `/dev/shm/t4-${process.pid}-${seed}`;
  fs.rmSync(dir, { recursive: true, force: true });
  const w = new World({ dir, names, topo, cfg, seed });
  const skews = [0, 0, 3600, -3600, 86400, -86400, 30 * 86400, -30 * 86400];
  for (const d of w.devices.values()) d.skew = r.pick(skews);
  const ctr = { n: 0 };
  // initial project
  const a = w.devices.get('A');
  for (const [f, n] of [['a.txt', 3], ['docs/e.txt', 3], ['b.txt', 2]]) { const p = path.join(a.work, f); fs.mkdirSync(path.dirname(p), { recursive: true }); const ls = Array.from({ length: n }, () => `${'A'}${ctr.n++}`); ls.forEach((t) => w.log.written.add(t)); fs.writeFileSync(p, ls.map((l) => l + '\n').join('')); }
  a.dirty = true; w.seedFrom('A');
  // rogue device with an unrelated root
  const hasRogue = r.chance(0.3);
  let rogue = null; const rogueToks = new Set();
  if (hasRogue) {
    const rd = path.join(dir, 'R', 'work'); fs.mkdirSync(path.join(rd, '.youcoded'), { recursive: true });
    const rg = new Repo(path.join(rd, '.youcoded', 'sync.git'), rd);
    run(['init', '-q', '-b', 'main', '--bare', rg.gitDir]); rg.g(['config', 'core.bare', 'false']); rg.g(['config', 'core.worktree', rd]);
    fs.mkdirSync(path.join(rg.gitDir, 'info'), { recursive: true }); fs.writeFileSync(path.join(rg.gitDir, 'info', 'exclude'), '.youcoded/\n');
    fs.writeFileSync(path.join(rd, 'a.txt'), 'ROGUE1\nROGUE2\n'); rogueToks.add('ROGUE1'); rogueToks.add('ROGUE2');
    rg.g(['add', '-A']); rg.g(['commit', '-q', '-m', 'r'], { env: { GIT_AUTHOR_NAME: 'R', GIT_AUTHOR_EMAIL: 'r@x', GIT_COMMITTER_NAME: 'R', GIT_COMMITTER_EMAIL: 'r@x' } });
    rogue = { rg, tip: rg.out(['rev-parse', 'HEAD']) };
  }
  const writeTicks = cfg.writeTicks ? +cfg.writeTicks : 6 + r.int(16);
  const pOp = cfg.pOp ? +cfg.pOp : r.pick([0.4, 0.7, 1.0]);
  const lossy = { pDeliver: r.pick([0.4, 0.7]), pDrop: r.pick([0, 0.15, 0.3]), pDup: r.pick([0, 0.1, 0.3]) };
  const injected = { fake: 0, rogue: 0, rogueTo: new Set() };
  for (let t = 0; t < writeTicks; t++) {
    w.step({
      net: lossy,
      ops: () => {
        for (const d of w.devices.values()) if (r.chance(pOp)) userOp(w, d, r, ctr);
        if (r.chance(0.12)) { // a tip pointing at a bundle that never arrives
          const to = r.pick(names); const fake = crypto.randomBytes(20).toString('hex');
          w.net.send({ type: 'tip', to, sender: 'X', id: fake }, w.tick); injected.fake++;
        }
        if (rogue && r.chance(0.25)) { // a tip (with bundle) from a project with no shared history
          const to = r.pick(names); const file = path.join(dir, `rogue-${w.seq++}.bundle`);
          rogue.rg.g(['update-ref', 'refs/tips/R', rogue.tip]); rogue.rg.g(['bundle', 'create', '-q', file, 'refs/tips/R']);
          w.net.send({ type: 'bundle', to, sender: 'R', file }, w.tick); w.net.send({ type: 'tip', to, sender: 'R', id: rogue.tip }, w.tick); injected.rogue++; injected.rogueTo.add(to);
        }
      },
    });
  }
  const settled = w.quiesce({ cap: cfg.cap ? +cfg.cap : 250 });
  const res = { seed, nDev, topo, writeTicks, pOp, settled, fails: [], edits: w.log.ops, injected: { fake: injected.fake, rogue: injected.rogue } };
  const devs = [...w.devices.values()];
  const heads = devs.map((d) => d.head());
  const userCommits = devs.reduce((n, d) => n + d.localCommits.length, 0);
  res.userCommits = userCommits;
  const h0 = devs[0].repo;
  res.commits = +h0.out(['rev-list', '--count', 'HEAD']);
  res.merges = +h0.out(['rev-list', '--count', '--merges', 'HEAD']);
  res.mergeWork = devs.map((d) => d.repo.mergesMade).reduce((a, b) => a + b, 0);
  res.bundleBytes = devs.reduce((n, d) => n + d.stat.bundleBytes, 0); res.bundles = devs.reduce((n, d) => n + d.stat.bundles, 0);
  const fail = (m) => res.fails.push(m);
  if (settled === null) fail('never settled within cap');
  res.ticks = settled;
  if (!heads.every((h) => h === heads[0])) fail(`heads differ: ${heads.map((h) => h?.slice(0, 7)).join(',')}`);
  const trees = devs.map(snapshotTree);
  const key = (m) => JSON.stringify([...m]);
  if (!trees.every((t) => key(t) === key(trees[0]))) fail('work trees differ on disk');
  // disk equals committed tree and nothing left uncommitted
  for (const d of devs) { d.stageAll(); if (d.repo.g(['diff', '--cached', '--quiet', 'HEAD'], { ok: true }).code !== 0) fail(`${d.name}: work tree differs from HEAD`); }
  // commit-count bound: report ratio; hard bound = merges <= userCommits
  if (res.merges > nDev * userCommits) fail(`merge commits ${res.merges} > ${nDev} x user commits ${userCommits}`);
  // every device's own commits are in the final history
  for (const d of devs) for (const c of d.localCommits) if (!h0.has(c) || !h0.isAnc(c, heads[0])) { fail(`${d.name}'s commit ${c.slice(0, 7)} not in final history`); break; }
  // tokens: nothing written may vanish unless a user removed it
  const final = trees[0]; const present = new Set();
  for (const f of final.keys()) for (const t of fs.readFileSync(path.join(devs[0].work, f), 'utf8').split('\n')) if (t) present.add(t);
  const lost = [...w.log.written].filter((t) => !present.has(t) && !w.log.removed.has(t));
  if (lost.length) fail(`lost ${lost.length} lines never removed by a user: ${lost.slice(0, 4).join(',')}`);
  // no clash repeats: a "(from ..)" copy must not duplicate another file's bytes
  const COPYRE = / \(from [^()]*\)(?=(\.[^./]*)?$)/;
  const byKey = new Map(); for (const [f, h] of final) { const k = f.replace(/( \(from [^()]*\))+(?=(\.[^./]*)?$)/, '') + '#' + h; (byKey.get(k) ?? byKey.set(k, []).get(k)).push(f); }
  for (const [, names_] of byKey) if (names_.length > 1) fail(`same version kept under two names: ${names_.join(' | ')}`);
  // names: a copy name must not stack a second copy of the same version, count copies
  res.copies = [...final.keys()].filter((f) => / \(from /.test(f)).length; res.files = final.size;
  // bad tips
  const roguePresent = [...rogueToks].some((t) => present.has(t));
  if (roguePresent) fail('rogue content was merged');
  if (rogue) for (const d of devs) { if (h0.has(rogue.tip) && d.repo.has(rogue.tip) && d.repo.isAnc(rogue.tip, d.head())) fail(`${d.name} merged the unrelated history`); }
  for (const to of injected.rogueTo) if (w.devices.get(to).tipFrom?.has('R') && w.devices.get(to).bundleFrom?.has('R') && !w.devices.get(to).diverged.has('R')) fail(`${to} got an unrelated tip but did not flag diverged`);
  res.divergedFlags = devs.filter((d) => d.diverged.has('R')).length;
  const pendingFake = devs.reduce((n, d) => n + [...d.pendingTips.values()].filter((s) => s === 'X').length, 0);
  res.pendingFake = pendingFake;
  if (verbose && res.fails.length) for (const d of devs) console.log(d.name, 'head', d.head()?.slice(0,7), 'pending', [...d.pendingTips].map(([i,s])=>i.slice(0,7)+':'+s), 'parked', d.parked.length, 'peer', [...d.peerHead].map(([k,v])=>k+':'+v.slice(0,7)), JSON.stringify(d.stat), 'inflight', w.net.items.length);
  if (args.loss && res.fails.some((f) => f.startsWith('lost'))) { // first merge where a never-removed token vanishes
    const toks = (c) => new Set(h0.out(['grep', '-h', '-I', '-e', '', c], { ok: true }).split('\n').filter(Boolean));
    for (const c of h0.out(['rev-list', '--merges', '--topo-order', '--reverse', heads[0]]).split('\n')) {
      const ps = h0.out(['rev-list', '--parents', '-n1', c]).split(' ').slice(1); const t = toks(c);
      for (const p of ps) for (const tk of toks(p)) if (!t.has(tk) && !w.log.removed.has(tk)) { console.log('LOSS at merge', c.slice(0, 7), 'parents', ps.map((x) => x.slice(0, 7)).join(','), 'token', tk, 'bases', h0.out(['merge-base', '--all', ...ps]).split('\n').map((x) => x.slice(0, 7)).join(',')); for (const e of devs.flatMap((d) => d.repo.events ?? [])) if (e[0] === c.slice(0, 6)) console.log('   ', e.slice(3).join(' ')); throw new Error('stop'); }
    }
  }
  if (verbose && args.events) { const seen = new Set(); for (const d of devs) for (const e of d.repo.events ?? []) { const k = e.join('|'); if (!seen.has(k)) { seen.add(k); console.log('EV', ...e); } } console.log(h0.out(['log', '--format=%h %p %an %s', '--topo-order', 'HEAD']).split('\n').map((l) => l.replace(/\b[0-9a-f]{7}\b/g, (x) => x.slice(0, 6))).join('\n')); }
  if (verbose) { console.log(JSON.stringify(res, null, 1)); console.log(h0.out(['log', '--graph', '--format=%h %an %s', 'HEAD'])); console.log([...final.keys()]); }
  if (!args.keep) fs.rmSync(dir, { recursive: true, force: true });
  return res;
}

// ---- driver ----
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const nDev = +(args.devices ?? 3); const cfg = cfgFrom(args.cfg);
  if (args.seed !== undefined) { const res = runSchedule(+args.seed, nDev, cfg, true); console.log(res.fails.length ? 'FAIL ' + res.fails.join('; ') : 'ok'); if (args.prof) console.log(JSON.stringify({ by: stats.by, ms: stats.ms })); process.exit(0); }
  if (args.worker) {
    const [lo, hi] = String(args.worker).split(':').map(Number);
    for (let s = lo; s < hi; s++) { let res; try { res = runSchedule(s, nDev, cfg); } catch (e) { res = { seed: s, fails: ['crash: ' + String(e.message).slice(0, 300)] }; } process.stdout.write(JSON.stringify(res) + '\n'); }
    process.exit(0);
  }
  const n = +(args.n ?? 100), jobs = +(args.jobs ?? 4), seed0 = +(args.seed0 ?? 1);
  const per = Math.ceil(n / jobs); const results = []; let done = 0; const t0 = Date.now();
  const procs = [];
  for (let j = 0; j < jobs; j++) {
    const lo = seed0 + j * per, hi = Math.min(seed0 + n, lo + per); if (lo >= hi) continue;
    const p = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', `${lo}:${hi}`, '--devices', String(nDev), '--cfg', args.cfg ?? ''], { stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = ''; p.stdout.on('data', (c) => { buf += c; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) { results.push(JSON.parse(line)); if (++done % 50 === 0) console.error(`  ${done}/${n} ${(Date.now() - t0) / 1000 | 0}s`); } } });
    procs.push(new Promise((res) => p.on('exit', res)));
  }
  await Promise.all(procs);
  const bad = results.filter((x) => x.fails.length);
  const sum = (k) => results.reduce((a, x) => a + (x[k] ?? 0), 0);
  const ok = results.filter((x) => !x.fails.length && x.userCommits);
  const ratios = ok.map((x) => x.merges / x.userCommits).sort((a, b) => a - b);
  const out = { schedules: results.length, devices: nDev, cfg, failed: bad.length, seconds: (Date.now() - t0) / 1000 | 0,
    avgUserCommits: sum('userCommits') / results.length, avgMerges: sum('merges') / results.length, maxMerges: Math.max(...results.map((x) => x.merges ?? 0)), mergeWorkPerUserCommit: sum('mergeWork') / Math.max(1, sum('userCommits')),
    ratioMergesPerUserCommit: { median: ratios[ratios.length >> 1], p95: ratios[Math.floor(ratios.length * 0.95)], max: ratios[ratios.length - 1] },
    copiesTotal: sum('copies'), schedulesWithClash: results.filter((x) => x.copies > 0).length, divergedFlagsTotal: sum('divergedFlags'), fakeTipsPending: sum('pendingFake'),
    settleTicks: { avg: sum('ticks') / results.length, max: Math.max(...results.map((x) => x.ticks ?? 0)) }, avgBundleBytes: sum('bundleBytes') / Math.max(1, sum('bundles')) };
  console.log(JSON.stringify(out, null, 1));
  const kinds = {}; for (const b of bad) for (const f of b.fails) { const k = f.replace(/[0-9a-f]{7}/g, 'H').replace(/\d+/g, 'N').slice(0, 70); (kinds[k] ??= []).push(b.seed); }
  for (const [k, seeds] of Object.entries(kinds)) console.log(`FAIL x${seeds.length}: ${k}  seeds ${seeds.slice(0, 6).join(',')}`);
  fs.writeFileSync(`/dev/shm/t4-results-${nDev}-${(args.cfg ?? 'default').replace(/\W/g, '_')}.json`, JSON.stringify(results));
}
if (args.prof) console.log(JSON.stringify({ by: stats.by, ms: stats.ms }));
