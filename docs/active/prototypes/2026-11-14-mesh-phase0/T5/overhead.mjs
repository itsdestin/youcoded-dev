// Per-frame cost of the construction: bytes of overhead and sign+seal / open+verify time. Run: node overhead.mjs
import { performance } from 'node:perf_hooks'; import { randomBytes } from 'node:crypto';
import { newIdentity, newSetSecret, setIdFor, sealFrame, FrameReceiver } from './mesh-crypto.mjs';
const A = newIdentity('A'); const setId = setIdFor(A.signKey), S = newSetSecret(); const session = randomBytes(16);
const roster = new Map([[A.devId.toString('hex'), A]]);
for (const size of [0, 1024, 65536, 1048576]) {
  const body = { lines: [randomBytes(size)] };
  const wire = sealFrame({ S, setId, gen: 1, id: A, session, counter: 0, group: 'chat:0123456789abcdef', kind: 'lines', body });
  const n = size < 100000 ? 2000 : 100; let t = performance.now();
  const frames = []; for (let i = 0; i < n; i++) frames.push(sealFrame({ S, setId, gen: 1, id: A, session: randomBytes(16), counter: i, group: 'chat:0123456789abcdef', kind: 'lines', body }));
  const seal = (performance.now() - t) / n; t = performance.now();
  const rx = new FrameReceiver({ setId, secrets: new Map([[1, S]]), roster }); for (const f of frames) rx.open(f);
  const open = (performance.now() - t) / n;
  console.log(`body ${String(size).padStart(8)} B: wire ${wire.length} B (overhead ${wire.length - size - 7} B incl. 7 B of body framing) | seal+sign ${seal.toFixed(3)} ms | open+verify ${open.toFixed(3)} ms`);
}
