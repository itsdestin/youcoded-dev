import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { linesOf } from './lines.mjs';
const mains = []; (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'subagents') w(p); } else if (e.name.endsWith('.jsonl')) mains.push(p); } })(path.join(os.homedir(), '.claude/projects'));
const v = {}; let minT = Infinity, maxT = 0, bnd = {};
for (const p of mains) { let n = 0, ver = null, first = null, nb = 0;
  for await (const l of linesOf(p)) { n++; const m = /"version":"([0-9.]+)"/.exec(l); if (m) { ver ??= m[1]; first ??= (/"timestamp":"([^"]+)"/.exec(l) || [])[1]; if (/"subtype":"compact_boundary"/.test(l)) nb++; if (n > 40 && nb === 0 && ver) { /* keep scanning for boundaries */ } } }
  if (ver) { v[ver] = (v[ver] || 0) + 1; if (nb) bnd[ver] = (bnd[ver] || 0) + nb; if (first) { const t = Date.parse(first); minT = Math.min(minT, t); maxT = Math.max(maxT, t); } } }
const vs = Object.keys(v).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
console.log('first-seen version per file: oldest', vs[0], 'newest', vs.at(-1), 'distinct', vs.length, '; first timestamps', new Date(minT).toISOString().slice(0, 10), '..', new Date(maxT).toISOString().slice(0, 10));
console.log('compact boundaries by file-start version', JSON.stringify(bnd));
