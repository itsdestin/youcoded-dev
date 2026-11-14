// T21 part 2: versions of each chat found in the Personal space's hidden git history (read-only cat-file).
// Usage: node scan-git.mjs sel.json <outDir>
// Pairs checked per chat id (versions ordered by oldest introducing commit time):
//   consecutive      - each version vs the next version in the hashed set
//   cross-device     - the latest version written by each device, all pairs of devices (only when >=2 devices wrote it)
//   vs-current       - the latest hashed version vs today's mirror file (if it exists)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chainStream, fileStream, gitBlobStream, relate, diagnose } from './lib.mjs';

const [selFile, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const GD = path.join(os.homedir(), 'YouCoded/Personal/.youcoded/sync.git');
const ROOT = path.join(os.homedir(), 'YouCoded/Personal');
const sel = JSON.parse(fs.readFileSync(selFile));
const WORKERS = 4;
const resF = fs.createWriteStream(path.join(out, 'git-results.jsonl'));
const summary = { ids: sel.length, versionsHashed: 0, pairs: {}, cats: {}, errors: 0 };
let next = 0, done = 0;

async function doId(s) {
  const chains = new Map(); // blob -> chain
  const open = new Map();   // blob -> () => readable
  const rowsByBlob = new Map();
  for (const v of s.versions) { rowsByBlob.set(v.blob, v); open.set(v.blob, () => gitBlobStream(GD, v.blob)); }
  for (const blob of rowsByBlob.keys()) {
    try { chains.set(blob, await chainStream(open.get(blob)())); summary.versionsHashed++; } catch (e) { summary.errors++; }
  }
  // current mirror file for this id (main path = the path without conflict suffix)
  const mainRow = s.versions.find((v) => !/\(from /.test(v.path));
  let cur = null;
  if (mainRow) { const p = path.join(ROOT, mainRow.path); if (fs.existsSync(p)) { try { cur = { chain: await chainStream(fileStream(p)), open: () => fileStream(p) }; } catch { /* ignore */ } } }
  const pairs = [];
  const vs = s.versions.filter((v) => chains.has(v.blob));
  const seen = new Set();
  const addPair = (kind, a, b) => { const k = a.blob + '|' + b.blob; if (a.blob === b.blob && kind !== 'consecutive') return; if (seen.has(kind + k)) return; seen.add(kind + k); pairs.push({ kind, a, b }); };
  for (let i = 0; i + 1 < vs.length; i++) addPair('consecutive', vs[i], vs[i + 1]);
  const latestBy = new Map(); for (const v of vs) latestBy.set(v.dev, v); // vs is time ordered
  const lat = [...latestBy.values()];
  for (let i = 0; i < lat.length; i++) for (let j = i + 1; j < lat.length; j++) addPair('cross-device', lat[i], lat[j]);
  for (const r of pairs) {
    const ca = chains.get(r.a.blob), cb = chains.get(r.b.blob);
    await emit(s, r.kind, r.a, r.b, ca, cb, open.get(r.a.blob), open.get(r.b.blob));
  }
  if (cur && vs.length) {
    const last = vs[vs.length - 1];
    await emit(s, 'vs-current', last, { dev: 'current-mirror', t: 0, size: cur.chain.bytes, path: mainRow.path, blob: 'cur' }, chains.get(last.blob), cur.chain, open.get(last.blob), cur.open);
  }
  chains.clear();
  done++; if (done % 50 === 0) console.error(`${done}/${sel.length}`);
}
async function emit(s, kind, a, b, ca, cb, oa, ob) {
  const rel = relate(ca, cb);
  const rec = { id: s.id, mode: s.mode, kind, aDev: a.dev, bDev: b.dev, aT: a.t, bT: b.t, aPath: /\(from /.test(a.path) ? 'conflict' : 'main', bPath: /\(from /.test(b.path) ? 'conflict' : 'main', aLines: ca.lines, bLines: cb.lines, aBytes: ca.bytes, bBytes: cb.bytes, rel: rel.rel, N: rel.N, torn: rel.tornTail };
  if (rel.rel === 'diverged') { try { Object.assign(rec, await diagnose(oa, ob, ca, cb, rel.N)); } catch (e) { rec.cat = 'other:diagnose-error ' + (e.code || e.message); } }
  const tag = rel.rel === 'diverged' ? 'diverged:' + rec.cat : rel.rel === 'b-prefix-of-a' ? 'prefix' : rel.rel;
  summary.pairs[kind] ??= {}; summary.pairs[kind][tag] = (summary.pairs[kind][tag] || 0) + 1;
  summary.cats[tag] = (summary.cats[tag] || 0) + 1;
  resF.write(JSON.stringify(rec) + '\n');
}
await Promise.all(Array.from({ length: WORKERS }, async () => { for (;;) { const i = next++; if (i >= sel.length) return; try { await doId(sel[i]); } catch (e) { summary.errors++; console.error('id error', String(e.message).slice(0, 80)); } } }));
resF.end();
fs.writeFileSync(path.join(out, 'git-summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
