// T21: for pairs where the bookkeeping-skipping chain still diverges but the user/assistant chain does not, list the line TYPES (never contents) that differ.
import fs from 'node:fs'; import os from 'node:os';
import { gitBlobStream, structure, BOOKKEEPING } from './lib.mjs';
const [selFile, gitRes] = process.argv.slice(2);
const GD = os.homedir() + '/YouCoded/Personal/.youcoded/sync.git';
const sel = new Map(JSON.parse(fs.readFileSync(selFile)).map((s) => [s.id, s]));
const rows = fs.readFileSync(gitRes, 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.rel === 'diverged' && r.cat !== 'real-split' && r.bDev !== 'current-mirror');
const find = (s, t, dev, pk) => s.versions.find((v) => v.t === t && v.dev === dev && (/\(from /.test(v.path) ? 'conflict' : 'main') === pk);
const seen = {};
for (const r of rows) {
  const s = sel.get(r.id); const a = find(s, r.aT, r.aDev, r.aPath), b = find(s, r.bT, r.bDev, r.bPath);
  const [x, y] = await Promise.all([structure(gitBlobStream(GD, a.blob)), structure(gitBlobStream(GD, b.blob))]);
  const hist = (t) => { const h = {}; for (const k of t.types.slice(r.N - 1)) if (!BOOKKEEPING.has(k)) h[k] = (h[k] || 0) + 1; return h; };
  const k = JSON.stringify([hist(x), hist(y)]); seen[k] = (seen[k] || 0) + 1;
}
console.log(seen);
