// T21 proposal test: do alternative chain inputs turn the "bytes differ, same conversation" pairs into clean prefixes,
// without turning real splits into prefixes and without breaking identical/prefix pairs?
//   conv = chain over user+assistant lines only;  nobk = chain over every line except BOOKKEEPING types.
// Usage: node refine.mjs <fs-results.jsonl> <git-results.jsonl> <sel.json> <out.json>
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { chainFiltered, relate, fileStream, gitBlobStream, BOOKKEEPING } from './lib.mjs';
const [fsRes, gitRes, selFile, outFile] = process.argv.slice(2);
const HOME = os.homedir(), GD = HOME + '/YouCoded/Personal/.youcoded/sync.git';
const keepers = { raw: () => true, conv: (t) => t === 'user' || t === 'assistant', nobk: (t) => !BOOKKEEPING.has(t) };
const cache = new Map();
async function ch(name, spec) { const k = name + '|' + spec.key; if (!cache.has(k)) cache.set(k, await chainFiltered(spec.open(), keepers[name])); return cache.get(k); }
const fsSpec = (p) => ({ key: p, open: () => fileStream(p) });
const gitSpec = (b) => ({ key: b, open: () => gitBlobStream(GD, b) });
const tally = { fs: {}, git: {} }; const detail = [];
const T = (w, name, rel) => { const k = name + ':' + (rel === 'b-prefix-of-a' ? 'prefix' : rel); tally[w][k] = (tally[w][k] || 0) + 1; return k; };
async function test(w, id, label, A, B, rawRel) {
  const row = { w, id: id.slice(0, 15), label, rawGiven: rawRel };
  for (const name of Object.keys(keepers)) { const [x, y] = await Promise.all([ch(name, A), ch(name, B)]); row[name] = T(w, name, relate(x, y).rel); }
  detail.push(row);
}
// ---- fs: re-inventory ids that have any diverged pair, test ALL their pairs
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const fsRows = fs.readFileSync(fsRes, 'utf8').trim().split('\n').map(JSON.parse);
const divIds = new Set(fsRows.filter((r) => r.rel === 'diverged').map((r) => r.id));
const inv = new Map(); const add = (k, c) => { if (divIds.has(k)) { if (!inv.has(k)) inv.set(k, []); inv.get(k).push(c); } };
const ls = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };
for (const s of ls(HOME + '/.claude/projects')) for (const f of ls(`${HOME}/.claude/projects/${s.name}`)) if (f.name.endsWith('.jsonl') && ID.test(f.name)) add('claude:' + f.name.slice(0, -6), { label: 'live-cc#' + s.name.slice(-12), p: `${HOME}/.claude/projects/${s.name}/${f.name}` });
for (const s of ls(HOME + '/.youcoded/sessions')) for (const f of ls(`${HOME}/.youcoded/sessions/${s.name}`)) if (f.name.endsWith('.jsonl') && ID.test(f.name)) add('native:' + f.name.slice(0, -6), { label: 'live-native', p: `${HOME}/.youcoded/sessions/${s.name}/${f.name}` });
for (const prov of ['claude', 'native']) { const b = `${HOME}/YouCoded/Personal/Conversations/${prov}/transcripts`; for (const d of ls(b)) for (const f of ls(`${b}/${d.name}`)) { const m = f.name.match(/^(.*?)( \(from (.+), \d{4}-\d{2}-\d{2}\))?\.jsonl$/); if (m && ID.test(m[1])) add(prov + ':' + m[1], { label: m[2] ? 'conflict:' + m[3] + '#' + (m[2].match(/\d{4}-\d{2}-\d{2}/) || [''])[0] + (m[2].match(/ (\d) ?,/) || ['', ''])[1] : 'mirror', p: `${b}/${d.name}/${f.name}` }); } }
for (const [id, cs] of inv) for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
  await test('fs', id, cs[i].label + ' vs ' + cs[j].label, fsSpec(cs[i].p), fsSpec(cs[j].p));
}
// ---- git: re-test every diverged pair from the git scan, found again by (id, time, device, path kind)
const sel = new Map(JSON.parse(fs.readFileSync(selFile)).map((s) => [s.id, s]));
const gitRows = fs.readFileSync(gitRes, 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.rel === 'diverged');
const find = (s, t, dev, pk) => s.versions.find((v) => v.t === t && v.dev === dev && (/\(from /.test(v.path) ? 'conflict' : 'main') === pk);
for (const r of gitRows) {
  const s = sel.get(r.id); const a = find(s, r.aT, r.aDev, r.aPath);
  let B; if (r.bDev === 'current-mirror') { const main = s.versions.find((v) => !/\(from /.test(v.path)); B = fsSpec(path.join(HOME, 'YouCoded/Personal', main.path)); } else { const b = find(s, r.bT, r.bDev, r.bPath); B = gitSpec(b.blob); }
  await test('git', r.id, r.kind + ' ' + r.aDev + '->' + r.bDev, gitSpec(a.blob), B, 'diverged:' + r.cat);
}
fs.writeFileSync(outFile, JSON.stringify({ tally, detail }, null, 1));
console.log(JSON.stringify(tally, null, 1));
