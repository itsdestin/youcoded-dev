// Size and time of one sync round on a ~5,000-file project. node perf.mjs [files=5000]
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { World } from './carrier.mjs'; import { mergeCommit } from './lib.mjs';
const N = +(process.argv[2] ?? 5000);
const dir = `/dev/shm/t4-perf-${process.pid}`; fs.rmSync(dir, { recursive: true, force: true });
const w = new World({ dir, names: ['A', 'B'], topo: 'full', seed: 1 });
const A = w.devices.get('A'), B = w.devices.get('B');
const T = (label, f) => { const t = process.hrtime.bigint(); const r = f(); console.log(`${label.padEnd(54)} ${(Number(process.hrtime.bigint() - t) / 1e6).toFixed(0).padStart(6)} ms`); return r; };
// files: ~3 KB of text each, 100 folders x 50 files
let total = 0;
for (let i = 0; i < N; i++) { const f = path.join(A.work, `dir${i % 100}`, `file${i}.md`); fs.mkdirSync(path.dirname(f), { recursive: true }); const body = Array.from({ length: 60 }, (_, k) => `line ${k} ${crypto.randomBytes(18).toString('hex')}`).join('\n') + '\n'; fs.writeFileSync(f, body); total += body.length; }
console.log(`project: ${N} files, ${(total / 1e6).toFixed(1)} MB`);
A.dirty = true;
T('A: first commit of all files', () => A.commitLocal('initial'));
T('B: first download (fetch from A, checkout)', () => w.seedFrom('A'));
A.peerHead.set('B', A.head()); B.peerHead.set('A', A.head()); A.publishLocal(); B.publishLocal(); // both know the shared starting point
const edit = (d, i, tag) => { const f = path.join(d.work, `dir${i % 100}`, `file${i}.md`); const s = fs.readFileSync(f, 'utf8').split('\n'); s[5] = tag; fs.writeFileSync(f, s.join('\n')); d.dirty = true; };
const full = (() => { A.repo.g(['update-ref', 'refs/tips/A', A.head()]); const f = path.join(dir, 'full.bundle'); A.repo.g(['bundle', 'create', '-q', f, 'refs/tips/A']); return fs.statSync(f).size; })();
console.log(`full bundle of the whole project (first download by bundle): ${(full / 1e6).toFixed(1)} MB`);
// round 1: one small edit on A, nothing on B
edit(A, 7, 'A edit one');
T('A: snapshot after 1-line edit (git add -A + commit)', () => A.snapshot());
T('A: unchanged snapshot check (add -A, nothing to commit)', () => { A.repo.g(['add', '-A']); A.repo.g(['diff', '--cached', '--quiet'], { ok: true }); });
T('A: publish + cut incremental bundle for B', () => A.sendRound(1));
const item = w.net.items.find((i) => i.type === 'bundle'); console.log(`incremental bundle for the 1-line edit: ${fs.statSync(item.file).size} bytes`);
T('B: import bundle (mesh-remote fetch + history fetch)', () => { for (const it of w.net.items) B.receive(it); w.net.items = []; });
T('B: integrate (fast-forward + checkout)', () => B.integrate());
// round 2: concurrent edits, different files: merge
edit(A, 11, 'A edit two'); edit(B, 4999 % N, 'B edit');
A.snapshot(); B.snapshot();
A.sendRound(5); B.sendRound(5);
const items = w.net.items; w.net.items = [];
for (const it of items) (it.to === 'A' ? A : B).receive(it);
T('A: integrate with a merge (different files)', () => A.integrate());
T('B: integrate with a merge (different files)', () => B.integrate());
console.log('same head after merge:', A.head() === B.head());
// round 3: same-line clash
edit(A, 21, 'A same'); edit(B, 21, 'B same'); A.snapshot(); B.snapshot(); A.sendRound(9); B.sendRound(9);
const it3 = w.net.items; w.net.items = []; for (const it of it3) (it.to === 'A' ? A : B).receive(it);
T('A: integrate with a clash (copy made)', () => A.integrate()); B.integrate();
console.log('same head after clash:', A.head() === B.head());
console.log('hist repo size', A.repo.out(['count-objects', '-vH']).split('\n').filter((l) => /size-pack|size:/.test(l)).join(' | '));
fs.rmSync(dir, { recursive: true, force: true });
