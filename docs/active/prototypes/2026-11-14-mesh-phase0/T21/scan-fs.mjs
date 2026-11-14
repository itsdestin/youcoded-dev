// T21 part 1: live runtime files vs synced mirror vs conflict copies (all on this machine's disk).
// Usage: node scan-fs.mjs <outDir>      (writes fs-results.jsonl + fs-summary.json; read-only on user data)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chainStream, fileStream, relate, diagnose } from './lib.mjs';

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const HOME = os.homedir();
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const CONFLICT = /^(.*?) \(from (.+), (\d{4}-\d{2}-\d{2})\)\.jsonl$/;
const WORKERS = 4;

const groups = new Map(); // key -> copies[]
const add = (key, copy) => { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(copy); };
const ls = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };

// live Claude Code: ~/.claude/projects/<slug>/<id>.jsonl (top level only; <id>/subagents/* are extras, not chats)
for (const s of ls(path.join(HOME, '.claude/projects'))) if (s.isDirectory())
  for (const f of ls(path.join(HOME, '.claude/projects', s.name))) {
    const m = f.isFile() && f.name.match(/^(.+)\.jsonl$/);
    if (m && ID.test(m[1])) add('claude:' + m[1], { kind: 'live-cc', path: path.join(HOME, '.claude/projects', s.name, f.name) });
  }
// live native: ~/.youcoded/sessions/<slug>/<id>.jsonl
for (const s of ls(path.join(HOME, '.youcoded/sessions'))) if (s.isDirectory())
  for (const f of ls(path.join(HOME, '.youcoded/sessions', s.name))) {
    const m = f.isFile() && f.name.match(/^(.+)\.jsonl$/);
    if (m && ID.test(m[1])) add('native:' + m[1], { kind: 'live-native', path: path.join(HOME, '.youcoded/sessions', s.name, f.name) });
  }
// mirror + conflict copies
const MROOT = path.join(HOME, 'YouCoded/Personal/Conversations');
for (const prov of ['claude', 'native']) {
  const base = path.join(MROOT, prov, 'transcripts');
  for (const proj of ls(base)) if (proj.isDirectory())
    for (const f of ls(path.join(base, proj.name))) {
      if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
      const c = f.name.match(CONFLICT);
      const idpart = c ? c[1] : f.name.slice(0, -6);
      if (!ID.test(idpart)) continue;
      add(prov + ':' + idpart, { kind: c ? 'conflict' : 'mirror', dev: c ? c[2] : undefined, date: c ? c[3] : undefined, proj: proj.name, path: path.join(base, proj.name, f.name) });
    }
}

const keys = [...groups.keys()];
const summary = { totalIds: keys.length, byCombo: {}, pairs: {}, cats: {}, errors: 0 };
const combo = (cs) => cs.map((c) => c.kind).sort().join('+');
for (const k of keys) { const c = combo(groups.get(k)); summary.byCombo[c] = (summary.byCombo[c] || 0) + 1; }

const work = keys.filter((k) => groups.get(k).length >= 2);
summary.multiCopyIds = work.length;
const resFile = fs.createWriteStream(path.join(out, 'fs-results.jsonl'));
const perCopyFile = fs.createWriteStream(path.join(out, 'fs-copies.jsonl'));
let done = 0, next = 0;

async function doGroup(key) {
  const cs = groups.get(key);
  const res = [];
  for (const c of cs) {
    try { c.r = await chainStream(fileStream(c.path)); } catch (e) { c.err = String(e.code || e.message); summary.errors++; }
    // second stat after reading: a live file may have grown while we hashed it (flag it)
    if (c.r) { try { c.sizeAfter = fs.statSync(c.path).size; } catch { /* gone */ } c.grewWhileReading = c.sizeAfter !== undefined && c.sizeAfter !== c.r.bytes; }
    perCopyFile.write(JSON.stringify({ id: key, kind: c.kind, dev: c.dev, proj: c.proj, lines: c.r?.lines, bytes: c.r?.bytes, final: c.r?.final, endsNL: c.r?.endsNL, bom: c.r?.bom, crlf: c.r?.crlf, grew: c.grewWhileReading, err: c.err }) + '\n');
  }
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j];
    if (!a.r || !b.r) continue;
    const rel = relate(a.r, b.r);
    const pk = [a.kind, b.kind].sort().join(' vs ');
    const rec = { id: key, a: a.kind + (a.dev ? ':' + a.dev : ''), b: b.kind + (b.dev ? ':' + b.dev : ''), aLines: a.r.lines, bLines: b.r.lines, aBytes: a.r.bytes, bBytes: b.r.bytes, rel: rel.rel, N: rel.N, aGrew: a.grewWhileReading, bGrew: b.grewWhileReading };
    if (rel.rel === 'diverged') {
      try { Object.assign(rec, await diagnose(() => fileStream(a.path), () => fileStream(b.path), a.r, b.r, rel.N)); } catch (e) { rec.cat = 'other:diagnose-error ' + (e.code || e.message); }
    }
    rec.torn = rel.tornTail; const rk = rel.rel === 'b-prefix-of-a' ? 'prefix' : rel.rel;
    const tag = rel.rel === 'diverged' ? 'diverged:' + rec.cat : rk;
    summary.pairs[pk] ??= {}; summary.pairs[pk][tag] = (summary.pairs[pk][tag] || 0) + 1;
    summary.cats[tag] = (summary.cats[tag] || 0) + 1;
    resFile.write(JSON.stringify(rec) + '\n');
  }
  for (const c of cs) delete c.r; // free chain buffers
  done++;
  if (done % 100 === 0) console.error(`${done}/${work.length}`);
}
await Promise.all(Array.from({ length: WORKERS }, async () => { for (;;) { const i = next++; if (i >= work.length) return; await doGroup(work[i]); } }));
resFile.end(); perCopyFile.end();
fs.writeFileSync(path.join(out, 'fs-summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
