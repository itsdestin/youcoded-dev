// T21: choose which historical blobs to hash. Usage: node select.mjs rows-with-sizes.json out.json
// Rule (printed in report): per chat id, all versions (any path: main or "(from ..)" copy) ordered by commit time.
//  FULL set (every version hashed): ids touched by >=2 devices; ids with any size decrease along one path; ids with a conflict path in history.
//  SAMPLE set (all other ids with >=2 versions): first 2, last 2, and 3 evenly spaced versions between.
import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync(process.argv[2]));
const ID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;
const by = new Map();
for (const x of rows) { const k = x.path.split('/')[1] + ':' + x.path.match(ID)[1]; if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
const sel = []; const stats = { ids: by.size, full: 0, sampled: 0, single: 0, blobsFull: 0, blobsSample: 0 };
for (const [k, v] of by) {
  v.sort((a, b) => a.t - b.t);
  const devs = new Set(v.map((x) => x.dev));
  let dec = false; const lastSize = {};
  for (const x of v) { if (lastSize[x.path] != null && x.size < lastSize[x.path]) dec = true; lastSize[x.path] = x.size; }
  const conflict = v.some((x) => /\(from /.test(x.path));
  let chosen, mode;
  if (devs.size > 1 || dec || conflict) { chosen = v; mode = 'full'; stats.full++; stats.blobsFull += v.length; }
  else if (v.length >= 2) {
    const idx = new Set([0, 1, v.length - 2, v.length - 1]);
    for (let i = 1; i <= 3; i++) idx.add(Math.round((v.length - 1) * i / 4));
    chosen = [...idx].filter((i) => i >= 0 && i < v.length).sort((a, b) => a - b).map((i) => v[i]); mode = 'sample'; stats.sampled++; stats.blobsSample += chosen.length;
  } else { stats.single++; continue; }
  sel.push({ id: k, mode, why: { multiDevice: devs.size > 1, sizeDecrease: dec, conflictPath: conflict }, versions: chosen, totalVersions: v.length });
}
stats.bytesGiB = +(sel.reduce((a, s) => a + s.versions.reduce((b, x) => b + x.size, 0), 0) / 2 ** 30).toFixed(1);
fs.writeFileSync(process.argv[3], JSON.stringify(sel));
console.log(stats);
