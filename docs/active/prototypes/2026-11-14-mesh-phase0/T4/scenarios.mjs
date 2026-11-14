// Hand-built scenarios, one per rule in design 5.7. node scenarios.mjs
import fs from 'node:fs'; import path from 'node:path';
import { World } from './carrier.mjs';

function scenario(name, { names = ['A', 'B', 'C'], topo = 'full', cfg = {}, init, edits, deliver }) {
  const dir = `/dev/shm/t4-scn-${process.pid}`; fs.rmSync(dir, { recursive: true, force: true });
  const w = new World({ dir, names, topo, cfg, seed: 7 });
  const wr = (d, f, t) => { const p = path.join(w.devices.get(d).work, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); w.devices.get(d).dirty = true; };
  const rm = (d, f) => { fs.rmSync(path.join(w.devices.get(d).work, f)); w.devices.get(d).dirty = true; };
  const mv = (d, a, b) => { const r = w.devices.get(d).work; fs.mkdirSync(path.dirname(path.join(r, b)), { recursive: true }); fs.renameSync(path.join(r, a), path.join(r, b)); w.devices.get(d).dirty = true; };
  const h = { wr, rm, mv, w };
  init(h); w.devices.get('A').dirty = true; w.seedFrom('A');
  edits(h);
  const ticks = w.quiesce({ cap: 120 });
  const heads = w.heads(); const same = heads.every((x) => x === heads[0]);
  const d = w.devices.get('A');
  const files = d.repo.out(['ls-tree', '-r', '--name-only', 'HEAD']).split('\n');
  console.log(`\n== ${name}\n   settled in ${ticks} ticks, same head everywhere: ${same}, commits ${d.repo.out(['rev-list', '--count', 'HEAD'])}, merges ${d.repo.out(['rev-list', '--merges', '--count', 'HEAD'])}, merge commits built (A,B,C): ${[...w.devices.values()].map((x) => x.repo.mergesMade)}`);
  for (const f of files) console.log(`   ${f}  ->  ${JSON.stringify(d.repo.out(['show', `HEAD:${f}`]))}`);
  fs.rmSync(dir, { recursive: true, force: true });
  return { same, ticks };
}
const base = (h) => { h.wr('A', 'f.txt', 'one\ntwo\nthree\n'); h.wr('A', 'g.txt', 'g1\ng2\n'); };

scenario('same lines edited on 2 devices', { init: base, edits: (h) => { h.wr('A', 'f.txt', 'one\nA\nthree\n'); h.wr('B', 'f.txt', 'one\nB\nthree\n'); } });
scenario('same lines edited on 3 devices (3-way clash)', { init: base, edits: (h) => { h.wr('A', 'f.txt', 'one\nA\nthree\n'); h.wr('B', 'f.txt', 'one\nB\nthree\n'); h.wr('C', 'f.txt', 'one\nC\nthree\n'); } });
scenario('different lines of the same file', { init: base, edits: (h) => { h.wr('A', 'f.txt', 'ONE\ntwo\nthree\n'); h.wr('B', 'f.txt', 'one\ntwo\nTHREE\n'); } });
scenario('edit vs delete', { init: base, edits: (h) => { h.wr('A', 'f.txt', 'one\nA\nthree\n'); h.rm('B', 'f.txt'); } });
scenario('renamed two ways', { init: base, edits: (h) => { h.mv('A', 'f.txt', 'fa.txt'); h.mv('B', 'f.txt', 'fb.txt'); } });
scenario('renamed on one device, edited on another (no rename detection)', { init: base, edits: (h) => { h.mv('A', 'f.txt', 'fa.txt'); h.wr('B', 'f.txt', 'one\nB\nthree\n'); } });
scenario('file here, folder there', { init: base, edits: (h) => { h.wr('A', 'd', 'a file\n'); h.wr('B', 'd/x.txt', 'in a folder\n'); } });
scenario('both create the same new file', { init: base, edits: (h) => { h.wr('A', 'n.txt', 'A made it\n'); h.wr('B', 'n.txt', 'B made it\n'); } });
scenario('chain A-B-C, ends edit the same lines', { topo: 'chain', init: base, edits: (h) => { h.wr('A', 'f.txt', 'one\nA\nthree\n'); h.wr('C', 'f.txt', 'one\nC\nthree\n'); } });
scenario('ablation: stock-git-like merge commits + naive fold + no dominance rule (3 devices, 3 clashes)', { cfg: { det: false, dominance: false, fold: 'naive' }, init: base, edits: (h) => { h.wr('A', 'f.txt', 'one\nA\nthree\n'); h.wr('B', 'f.txt', 'one\nB\nthree\n'); h.wr('C', 'f.txt', 'one\nC\nthree\n'); } });
scenario('ablation: deterministic merge commits but no dominance rule', { cfg: { dominance: false }, init: base, edits: (h) => { h.wr('A', 'f.txt', 'one\nA\nthree\n'); h.wr('B', 'f.txt', 'one\nB\nthree\n'); h.wr('C', 'f.txt', 'one\nC\nthree\n'); } });
scenario('ablation: dominance rule but ordinary (non-deterministic) merge commits', { cfg: { det: false }, init: base, edits: (h) => { h.wr('A', 'f.txt', 'one\nA\nthree\n'); h.wr('B', 'f.txt', 'one\nB\nthree\n'); h.wr('C', 'f.txt', 'one\nC\nthree\n'); } });
