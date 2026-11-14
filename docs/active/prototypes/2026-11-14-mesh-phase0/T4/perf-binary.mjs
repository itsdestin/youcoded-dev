// Bundle size for a small edit to one 5 MB binary file. node perf-binary.mjs
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { World } from './carrier.mjs';
const dir = `/dev/shm/t4-perfbin-${process.pid}`; fs.rmSync(dir, { recursive: true, force: true });
const w = new World({ dir, names: ['A', 'B'], topo: 'full', seed: 1 }); const A = w.devices.get('A'), B = w.devices.get('B');
const f = path.join(A.work, 'doc.bin'); const buf = crypto.randomBytes(5 * 1024 * 1024); fs.writeFileSync(f, buf); A.dirty = true; A.commitLocal('init'); w.seedFrom('A');
A.peerHead.set('B', A.head()); B.peerHead.set('A', A.head()); A.publishLocal();
const size = () => { A.sendRound(w.tick + 10); const it = w.net.items.filter((i) => i.type === 'bundle').pop(); return fs.statSync(it.file).size; };
const b2 = Buffer.from(buf); crypto.randomBytes(100).copy(b2, 2_000_000); fs.writeFileSync(f, b2); A.dirty = true; A.snapshot();
console.log('5 MB file, 100 bytes changed in place: bundle', size(), 'bytes');
A.peerHead.set('B', A.head()); A.publishLocal();
fs.writeFileSync(f, crypto.randomBytes(5 * 1024 * 1024)); A.dirty = true; A.snapshot();
console.log('5 MB file fully rewritten (like a re-zipped Office file): bundle', size(), 'bytes');
fs.rmSync(dir, { recursive: true, force: true });
