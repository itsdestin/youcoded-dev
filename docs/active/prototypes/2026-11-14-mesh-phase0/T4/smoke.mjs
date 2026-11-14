import fs from 'node:fs'; import path from 'node:path';
import { World } from './carrier.mjs';
const dir = '/dev/shm/t4-smoke'; fs.rmSync(dir, { recursive: true, force: true });
const w = new World({ dir, names: ['A', 'B', 'C'], topo: 'chain', seed: 3 });
const wr = (d, f, t) => { const p = path.join(w.devices.get(d).work, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); w.devices.get(d).dirty = true; };
wr('A', 'f.txt', 'one\ntwo\nthree\n'); w.seedFrom('A');
w.step({ ops: () => { wr('A', 'f.txt', 'one\nA2\nthree\n'); wr('B', 'f.txt', 'one\nB2\nthree\n'); wr('C', 'g.txt', 'c\n'); } });
console.log('quiesce ticks', w.quiesce({cap:30}));
console.log(w.heads());
for (const d of w.devices.values()) console.log(d.name, fs.readdirSync(d.work).join(','), d.repo.out(['rev-list', '--count', 'HEAD']), d.repo.mergesMade);
console.log(w.devices.get('A').repo.events);
for (const d of w.devices.values()) console.log(d.name, 'pending', [...d.pendingTips], 'parked', d.parked.length, 'div', [...d.diverged], 'peer', [...d.peerHead].map(([k,v])=>k+':'+v.slice(0,6)), d.stat);
console.log(w.net.items.length);
const B = w.devices.get('B').repo;
console.log(B.out(['log','--format=%h %p | %an %s | %T','--topo-order','main']).split('\n').map(l=>l.replace(/[0-9a-f]{40}/g,x=>x.slice(0,6))).join('\n'));
console.log('spawns', (await import('./lib.mjs')).stats.spawns)
