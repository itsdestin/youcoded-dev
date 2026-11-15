// merge.mjs <file...>: sums the JSON result objects the simulators print (numbers add, objects recurse, failSeeds/examples/env concatenate, other values keep the first).
import fs from 'node:fs';
const sum = (a, b) => { if (a === undefined) return b; if (typeof a === 'number' && typeof b === 'number') return a + b; if (Array.isArray(a) && Array.isArray(b)) return a.concat(b).slice(0, 40); if (a && b && typeof a === 'object' && typeof b === 'object') { const o = { ...a }; for (const k of Object.keys(b)) o[k] = k in a ? sum(a[k], b[k]) : b[k]; return o; } return a; };
let M;
for (const f of process.argv.slice(2)) {
  const t = fs.readFileSync(f, 'utf8');
  const i = t.indexOf('\n}\n'); const j = i >= 0 ? JSON.parse(t.slice(0, i + 2)) : JSON.parse(t.split('\n')[0]);   // sim-own prints indented JSON then "first seeds" lines
  const first = {}; for (const l of t.split('\n')) { const m = l.match(/^(\S+) first seeds: (\[.*\])/); if (m) first[m[1]] = JSON.parse(m[2]); }
  if (Object.keys(first).length) j.firstSeeds = first;
  for (const k of ["secs", "seed0", "n"]) delete j[k];
  M = sum(M, j);
}
console.log(JSON.stringify(M, null, 1));
