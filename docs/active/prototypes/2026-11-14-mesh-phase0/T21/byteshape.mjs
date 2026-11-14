// T21: raw byte shape (CRLF lines, BOM, missing final newline) of history blobs written by NON-Linux-desktop devices.
// Usage: node byteshape.mjs sel.json   (reads blobs through git cat-file, read-only)
import fs from 'node:fs'; import os from 'node:os';
import { chainStream, gitBlobStream } from './lib.mjs';
const GD = os.homedir() + '/YouCoded/Personal/.youcoded/sync.git';
const sel = JSON.parse(fs.readFileSync(process.argv[2]));
const devs = new Set(['GalaxyBook', 'dm-windows-PC', 'Destins-iMac-Pro.local', 'localhost']);
const blobs = new Map(); for (const s of sel) for (const v of s.versions) if (devs.has(v.dev)) blobs.set(v.blob, v);
const list = [...blobs.values()]; const byDev = {}; let i = 0;
console.error('blobs', list.length, 'GiB', (list.reduce((a, v) => a + v.size, 0) / 2 ** 30).toFixed(1));
await Promise.all(Array.from({ length: 4 }, async () => { for (;;) { const v = list[i++]; if (!v) return; const r = await chainStream(gitBlobStream(GD, v.blob)); const d = (byDev[v.dev] ??= { blobs: 0, crlfBlobs: 0, bomBlobs: 0, noFinalNl: 0 }); d.blobs++; if (r.crlf) d.crlfBlobs++; if (r.bom) d.bomBlobs++; if (!r.endsNL) d.noFinalNl++; } }));
console.log(byDev);
