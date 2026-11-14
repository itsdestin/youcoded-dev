// Time poll() on an UNCHANGED big file (target < 50 ms). usage: node bench-unchanged.mjs <file> [--make-mb N]
import fs from 'node:fs';
import { poll, initState } from './adapter.mjs';
const [file, flag, mb] = process.argv.slice(2);
if (flag === '--make-mb') { // synthetic file of ~N MB (written only at the path given: a scratch path)
  const l = JSON.stringify({ pad: 'y'.repeat(1000) }) + '\n'; const fd = fs.openSync(file, 'w');
  for (let b = 0; b < Number(mb) * 1024; b++) fs.writeSync(fd, l.repeat(1)); fs.closeSync(fd);
}
const opts = { seed: 'bench|0' };
let t = process.hrtime.bigint();
const first = poll(file, initState(opts.seed), opts);
const ms = (a) => Number(process.hrtime.bigint() - a) / 1e6;
console.log(`file ${(fs.statSync(file).size / 1e6).toFixed(0)} MB, first ingest ${ms(t).toFixed(0)} ms, ${first.lines.length} lines`);
const times = [];
let st = first.state;
for (let i = 0; i < 200; i++) { t = process.hrtime.bigint(); const r = poll(file, st, opts); times.push(ms(t)); if (r.rewritten || r.lines.length) throw new Error('unexpected'); st = r.state; }
times.sort((a, b) => a - b);
console.log(`unchanged poll x200: median ${times[100].toFixed(3)} ms, p99 ${times[197].toFixed(3)} ms, max ${times[199].toFixed(3)} ms`);
