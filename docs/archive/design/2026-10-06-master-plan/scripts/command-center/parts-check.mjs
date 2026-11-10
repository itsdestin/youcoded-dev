#!/usr/bin/env node
// parts-check.mjs — assigns every desktop source file (and Android Kotlin file) to a PART using
// parts.rules.json, and fails if any desktop file is left without one.
// WHY: the owner's "command center" map needs every file to belong to exactly one part, system and
// layer, decided by written rules instead of by hand, so the map can be regenerated and trusted.
//
// Usage: node scripts/command-center/parts-check.mjs [--json] [--summary]
//   (default) prints problems only; exit 1 if any desktop file matches no rule.
//   --json     prints { files:[{path,part,system,layer,rule}], unmatched:[], multi:[] }
//   --summary  prints file/line counts per part, system and layer
// Rules: first match wins. A rule marked "broad": true is a catch-all and does not count toward
// "matched more than one rule" warnings. Test files (`*.test.ts(x)`, `__tests__/`) are placed with the
// file they test (their own path is tried second).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const app = path.join(root, 'youcoded');
const cfg = JSON.parse(fs.readFileSync(path.join(here, 'parts.rules.json'), 'utf8'));
// WHY: a part's extra homes ("also") must name systems that exist and differ from its own,
// or the map would draw a box in a column nobody defined.
{
  const systems = new Set(Object.values(cfg.parts).map((p) => p.system));
  for (const [name, p] of Object.entries(cfg.parts)) {
    for (const s of p.also || []) {
      if (!systems.has(s) || s === p.system) { console.error(`parts.rules.json: ${name} "also" names ${s}, which is ${systems.has(s) ? 'its own system' : 'not a system'}`); process.exit(2); }
    }
  }
}
const argv = new Set(process.argv.slice(2));

// Glob -> RegExp: ** = anything incl. slashes, * = anything but slash, ? = one non-slash char, {a,b} = alternatives.
function globToRe(g) {
  let re = '', i = 0, brace = 0;
  while (i < g.length) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { i += 2; if (g[i] === '/') { i++; re += '(?:.*/)?'; } else re += '.*'; continue; }
      re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') { re += '(?:'; brace++; }
    else if (c === '}' && brace) { re += ')'; brace--; }
    else if (c === ',' && brace) re += '|';
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
    i++;
  }
  return new RegExp('^' + re + '$');
}
const rules = cfg.rules.map((r) => ({ ...r, re: globToRe(r.match) }));

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

// Candidate paths a file is matched under: for tests, the file under test first.
function candidates(rel) {
  const base = path.posix.basename(rel);
  const isTest = /\.test\.tsx?$/.test(base) || rel.includes('/__tests__/');
  if (!isTest) return [rel];
  const dir = path.posix.dirname(rel).replace(/\/__tests__$/, '');
  const stem = base.replace(/\.test\.tsx?$/, '').replace(/\.tsx?$/, '');
  return [`${dir}/${stem}.ts`, `${dir}/${stem}.tsx`, rel];
}

function place(rel) {
  // For each candidate path collect the rules that match; prefer a specific (non-broad) winner over a catch-all,
  // so a test file lands with the file it tests even when that file's name only matches a catch-all folder rule.
  let fallback = null;
  for (const c of candidates(rel)) {
    const hits = rules.filter((r) => r.re.test(c));
    if (!hits.length) continue;
    const win = hits[0];
    const others = hits.slice(1).filter((r) => !r.broad && !win.broad && r.part !== win.part);
    if (!win.broad) return { win, others };
    fallback ??= { win, others };
  }
  return fallback;
}

const groups = [
  { dir: path.join(app, 'desktop/src'), exts: ['.ts', '.tsx'], android: false },
  { dir: path.join(app, 'app/src/main/kotlin'), exts: ['.kt'], android: true },
];
const files = [], unmatched = [], multi = [], androidUnmatched = [];
for (const g of groups) {
  for (const abs of walk(g.dir, g.exts).sort()) {
    const rel = path.relative(app, abs).split(path.sep).join('/');
    if (rel.endsWith('.d.ts') && !g.android) { /* still a source file: placed like any other */ }
    const lines = fs.readFileSync(abs, 'utf8').split('\n').length;
    const hit = place(rel);
    if (!hit) { (g.android ? androidUnmatched : unmatched).push(rel); continue; }
    const { win, others } = hit;
    files.push({ path: rel, part: win.part, system: win.system, layer: win.layer, rule: win.match, lines });
    if (others.length) multi.push({ path: rel, won: win.match, also: others.map((o) => `${o.match} (${o.part})`) });
  }
}

if (argv.has('--json')) {
  console.log(JSON.stringify({ files, unmatched, androidUnmatched, multi }, null, 1));
} else if (argv.has('--summary')) {
  for (const key of ['system', 'layer', 'part']) {
    const m = {};
    for (const f of files) { const k = f[key]; (m[k] ??= { files: 0, lines: 0 }); m[k].files++; m[k].lines += f.lines; }
    console.log(`\n== by ${key} ==`);
    for (const [k, v] of Object.entries(m).sort((a, b) => b[1].files - a[1].files)) console.log(`${String(v.files).padStart(5)} files ${String(v.lines).padStart(7)} lines  ${k}`);
  }
  console.log(`\ndesktop unmatched: ${unmatched.length}; android unmatched: ${androidUnmatched.length}; multi-rule warnings: ${multi.length}`);
} else {
  for (const m of multi) console.error(`warn: ${m.path} won by ${m.won}; also matches ${m.also.join(', ')}`);
  if (androidUnmatched.length) console.error(`note: ${androidUnmatched.length} Android file(s) unassigned`);
  console.log(`${files.length} files placed, ${unmatched.length} desktop unmatched, ${multi.length} multi-rule warnings`);
}
if (unmatched.length) {
  if (!argv.has('--json')) { console.error('UNMATCHED (no rule):'); for (const u of unmatched) console.error('  ' + u); }
  process.exit(1);
}
