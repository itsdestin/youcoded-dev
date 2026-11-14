// T21: for the native in-place edits, say WHICH FIELDS differ in the first differing line (field names + lengths only, never values).
import fs from 'node:fs'; import os from 'node:os';
import { gitBlobStream, readLineN } from './lib.mjs';
const GD = os.homedir() + '/YouCoded/Personal/.youcoded/sync.git';
const [selFile, gitRes] = process.argv.slice(2);
const sel = new Map(JSON.parse(fs.readFileSync(selFile)).map((s) => [s.id, s]));
const rows = fs.readFileSync(gitRes, 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.rel === 'diverged' && r.id.startsWith('native:'));
const find = (s, t, dev, pk) => s.versions.find((v) => v.t === t && v.dev === dev && (/\(from /.test(v.path) ? 'conflict' : 'main') === pk);
for (const r of rows) {
  const s = sel.get(r.id); const a = find(s, r.aT, r.aDev, r.aPath), b = find(s, r.bT, r.bDev, r.bPath);
  const [la, lb] = await Promise.all([readLineN(gitBlobStream(GD, a.blob), r.N), readLineN(gitBlobStream(GD, b.blob), r.N)]);
  const ja = JSON.parse(la.toString()), jb = JSON.parse(lb.toString());
  const diff = [];
  const walk = (x, y, p) => { if (typeof x === 'object' && x && typeof y === 'object' && y) { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], p + '.' + k); } else if (JSON.stringify(x) !== JSON.stringify(y)) diff.push({ path: p, lenA: JSON.stringify(x)?.length, lenB: JSON.stringify(y)?.length, typeA: typeof x, typeB: typeof y }); };
  walk(ja, jb, '');
  console.log(r.id.slice(7, 15), 'N', r.N, 'bytes', la.length, lb.length, JSON.stringify(diff));
}
