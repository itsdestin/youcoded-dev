#!/usr/bin/env node
// derive-edges.mjs — builds scratch/command-center/edges.json: file-to-file connections of the
// desktop app, each tagged with the KIND of evidence (import, channel, event, cochange, test, doc).
// WHY: plain imports miss most real coupling (screens talk to the backend through named channels,
// files that always change together, docs that cite code). Run from the workspace root:
//   node scripts/command-center/derive-edges.mjs
// No dependencies. Paths in the output are relative to youcoded/ (docs: relative to workspace root).
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';

const ROOT = process.cwd();
const APP = path.join(ROOT, 'youcoded');
const DESK = 'desktop';
const edges = new Map();           // key -> edge
const SEP = '\u0000';
function add(from, to, type, weight, evidence) {
  if (from === to) return;
  const k = [from, to, type, evidence].join(SEP);
  const e = edges.get(k);
  if (e) e.weight += weight; else edges.set(k, { from, to, type, weight, evidence });
}

// ---------- file universe ----------
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(path.join(APP, d), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(e.name)) continue;
    const p = d + '/' + e.name;
    if (e.isDirectory()) walk(p); else if (CODE.test(e.name) && !e.name.endsWith('.d.ts')) files.push(p);
  }
})(DESK);
const fset = new Set(files);
const text = {}; for (const f of files) text[f] = fs.readFileSync(path.join(APP, f), 'utf8');
const isTest = f => /\.(test|spec)\.[tj]sx?$/.test(f) || f.startsWith(DESK + '/tests/');
const isSrc = f => f.startsWith(DESK + '/src/') && !isTest(f);

function resolve(from, spec) {
  if (!spec.startsWith('.')) return null;
  const b = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  const stripped = b.replace(/\.(js|jsx|mjs|cjs)$/, '');
  for (const c of [b, b + '.ts', b + '.tsx', b + '.js', b + '.mjs', b + '/index.ts', b + '/index.tsx', b + '/index.js',
                   stripped + '.ts', stripped + '.tsx']) if (fset.has(c)) return c;
  return null;
}
const IMPORT_RE = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
const importsOf = {};
for (const f of files) {
  const out = []; // one entry per import statement
  for (const m of text[f].matchAll(IMPORT_RE)) { const t = resolve(f, m[1]); if (t) out.push(t); }
  importsOf[f] = out;
}
const importPair = new Set(); // for hidden-coupling checks (either direction)
// 1 + 5. import / test
for (const f of files) for (const t of importsOf[f]) {
  importPair.add(f + SEP + t); importPair.add(t + SEP + f);
  if (isTest(f)) add(f, t, 'test', 1, path.posix.basename(f)); else add(f, t, 'import', 1, 'import');
}

// ---------- 2. channels ----------
const contract = text[DESK + '/src/shared/backend-contract.ts'];
const ipcBlock = contract.slice(contract.indexOf('export const IPC = {'));
const ipcEnd = ipcBlock.indexOf('\n} as const');
const keyToName = {};
for (const m of ipcBlock.slice(0, ipcEnd > 0 ? ipcEnd : undefined).matchAll(/^\s+([A-Z][A-Z0-9_]*):\s*'([^']+)'/gm)) keyToName[m[1]] = m[2];
const channels = Object.values(keyToName);
// preload: bridge path (e.g. tags.list) -> channel(s)
const preload = text[DESK + '/src/main/preload.ts'].split('\n');
const bridgeToChannel = {}; // "tags.list" -> Set(channel)
{
  const stack = []; // {indent, name}
  for (const line of preload) {
    const ind = line.match(/^ */)[0].length;
    const open = line.match(/^\s*([A-Za-z_]\w*):\s*(?:\{|\([^)]*\)\s*=>\s*\{)\s*$/) || line.match(/^\s*([A-Za-z_]\w*):\s*\{\s*$/);
    while (stack.length && stack[stack.length - 1].indent >= ind && !open) { /* keep until dedent below */ break; }
    if (/^\s*[}\)]/.test(line)) while (stack.length && stack[stack.length - 1].indent >= ind) stack.pop();
    const mem = line.match(/^\s*([A-Za-z_]\w*)\s*[:(=]/);
    const chs = [];
    for (const m of line.matchAll(/ipcRenderer\.\w+\(\s*(?:IPC\.([A-Z0-9_]+)|'([^']+)')/g)) chs.push(m[1] ? keyToName[m[1]] : m[2]);
    for (const m of line.matchAll(/\bofficePush\(\s*(?:IPC\.([A-Z0-9_]+)|'([^']+)')/g)) chs.push(m[1] ? keyToName[m[1]] : m[2]);
    if (chs.length && mem) {
      const p = [...stack.map(s => s.name), mem[1]].join('.');
      for (const c of chs) if (c) (bridgeToChannel[p] ??= new Set()).add(c);
    }
    if (open) stack.push({ indent: ind, name: open[1] });
  }
}
// main handlers: files that register / answer / push a channel
const handlerRe = (k, n) => new RegExp(`(?:\\b(?:handle|handleOnce|on|once|defineChannel|send|broadcast|emit|case|invoke)\\b|name:)[^\\n]{0,60}(?:IPC\\.${k}\\b|'${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}')`);
const mainFiles = files.filter(f => f.startsWith(DESK + '/src/main/') && !isTest(f) && !f.endsWith('/preload.ts'));
const rendFiles = files.filter(f => f.startsWith(DESK + '/src/renderer/') && !isTest(f));
const nameToKeys = {}; for (const [k, n] of Object.entries(keyToName)) (nameToKeys[n] ??= []).push(k);
const stats = { channels: 0, both: 0, handlerOnly: 0, callerOnly: 0, neither: 0, unresolved: [], androidChannels: 0 };
// bridge path -> renderer files, via `claude.a.b` / `claude?.a?.b` / `api.a.b` style (prefix-agnostic: ".a.b" after claude)
const rendClean = {}; for (const f of rendFiles) rendClean[f] = text[f].replace(/\?\./g, '.');
const kotlin = [];
(function walk(d) { const abs = path.join(APP, d); if (!fs.existsSync(abs)) return;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) { const p = d + '/' + e.name;
    if (e.isDirectory()) walk(p); else if (e.name.endsWith('.kt')) kotlin.push(p); } })('app/src/main/kotlin');
const ktText = {}; for (const f of kotlin) ktText[f] = fs.readFileSync(path.join(APP, f), 'utf8');
const bridgeByChannel = {}; for (const [p, set] of Object.entries(bridgeToChannel)) for (const c of set) (bridgeByChannel[c] ??= []).push(p);
for (const name of new Set(channels)) {
  stats.channels++;
  const keys = nameToKeys[name];
  const handlers = mainFiles.filter(f => keys.some(k => handlerRe(k, name).test(text[f])) || handlerRe('__none__', name).test(text[f]));
  const callers = new Set();
  const lit = `'${name}'`;
  for (const f of rendFiles) {
    const t = text[f];
    if (keys.some(k => new RegExp(`IPC\\.${k}\\b`).test(t)) || t.includes(lit)) { callers.add(f); continue; }
    for (const bp of bridgeByChannel[name] || []) {
      if (new RegExp(`\\bclaude\\.${bp.replace(/\./g, '\\.')}\\b`).test(rendClean[f])) { callers.add(f); break; }
    }
  }
  const callersArr = [...callers].filter(c => !handlers.includes(c));
  for (const c of callersArr) for (const h of handlers) add(c, h, 'channel', 1, name);
  for (const f of kotlin) if (ktText[f].includes(`"${name}"`)) { stats.androidChannels++; for (const h of handlers) add(f, h, 'android-channel', 1, name); for (const c of callersArr) add(c, f, 'android-channel', 1, name); }
  if (handlers.length && callersArr.length) stats.both++;
  else if (handlers.length) stats.handlerOnly++; else if (callersArr.length) stats.callerOnly++; else stats.neither++;
  if (!(handlers.length && callersArr.length)) stats.unresolved.push({ name, handlers: handlers.length, callers: callersArr.length });
}

// ---------- 3. events ----------
const evStats = { emitter: 0, customEvent: 0, reducer: 0, keys: {} };
const proc = f => f.split('/')[2] === 'main' ? 'main' : f.split('/')[2] === 'renderer' ? 'renderer' : 'other';
// constants holding event strings
const constStr = {};
for (const f of files) for (const m of text[f].matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*(?::\s*\w+\s*)?=\s*'([^']+)'/g)) (constStr[m[1]] ??= new Set()).add(m[2]);
const resolveArg = (lit, id) => lit ?? ((constStr[id] && constStr[id].size === 1) ? [...constStr[id]][0] : null);
const em = {}, li = {};
const push = (m, k, f) => { (m[k] ??= new Set()).add(f); };
const GENERIC = new Set(['data', 'error', 'close', 'exit', 'end', 'open', 'message', 'change', 'changed', 'line', 'ready', 'connect', 'disconnect', 'drain', 'finish', 'readable', 'resize', 'click', 'keydown', 'SIGINT', 'SIGTERM', 'before-quit', 'activate', 'will-quit', 'window-all-closed', 'second-instance', 'uncaughtException', 'unhandledRejection']);
for (const f of files) {
  if (isTest(f)) continue;
  const t = text[f];
  for (const m of t.matchAll(/\.emit\(\s*'([^']+)'/g)) if (!GENERIC.has(m[1])) push(em, 'emitter:' + proc(f) + ':' + m[1], f);
  for (const m of t.matchAll(/\.(?:on|once)\(\s*'([^']+)'/g)) if (!GENERIC.has(m[1])) push(li, 'emitter:' + proc(f) + ':' + m[1], f);
  for (const m of t.matchAll(/dispatchEvent\(\s*new\s+(?:Custom)?Event\(\s*(?:'([^']+)'|([A-Z][A-Z0-9_]*))/g)) { const k = resolveArg(m[1], m[2]); if (k) push(em, 'dom:' + k, f); }
  for (const m of t.matchAll(/addEventListener\(\s*(?:'([^']+)'|([A-Z][A-Z0-9_]*))/g)) { const k = resolveArg(m[1], m[2]); if (k) push(li, 'dom:' + k, f); }
  if (f.startsWith(DESK + '/src/renderer/')) {
    for (const m of t.matchAll(/dispatch\(\s*\{\s*type:\s*'([A-Z][A-Z0-9_]+)'/g)) push(em, 'action:' + m[1], f);
    if (/reducer/i.test(path.posix.basename(f)) || f.includes('/state/'))
      for (const m of t.matchAll(/\bcase\s+'([A-Z][A-Z0-9_]+)'\s*:/g)) push(li, 'action:' + m[1], f);
  }
}
const FANOUT_CAP = 40;
for (const k of Object.keys(em)) {
  if (!li[k]) continue;
  const name = k.replace(/^(emitter:(main|renderer|other):|dom:|action:)/, '');
  const kind = k.startsWith('emitter') ? 'emitter' : k.startsWith('dom') ? 'customEvent' : 'reducer';
  if (em[k].size * li[k].size > FANOUT_CAP) { (evStats.skipped ??= []).push(k); continue; }
  evStats.keys[kind] = (evStats.keys[kind] || 0) + 1;
  for (const a of em[k]) for (const b of li[k]) add(a, b, 'event', 1, name);
}

// ---------- 4. cochange ----------
const SINCE = '2026-06-01', MAXF = 30;
let commit = ''; try { commit = execFileSync('git', ['-C', APP, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
const coStats = { commits: 0, used: 0, skippedBig: 0, skippedSmall: 0, ref: 'origin/master' };
const pairCount = new Map(), pairSubj = new Map();
try {
  const log = execFileSync('git', ['-C', APP, 'log', `--since=${SINCE}`, '--name-only', '--format=@@%H %s', 'origin/master'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  for (const chunk of log.split('@@').slice(1)) {
    const lines = chunk.split('\n'); const subj = lines[0].slice(41);
    const fl = [...new Set(lines.slice(1).filter(Boolean).filter(f => f.startsWith(DESK + '/src/') && CODE.test(f) && !isTest(f) && fset.has(f)))].sort();
    coStats.commits++;
    if (fl.length < 2) { coStats.skippedSmall++; continue; }
    if (fl.length > MAXF) { coStats.skippedBig++; continue; }
    coStats.used++;
    for (let i = 0; i < fl.length; i++) for (let j = i + 1; j < fl.length; j++) {
      const k = fl[i] + SEP + fl[j]; pairCount.set(k, (pairCount.get(k) || 0) + 1);
      const s = pairSubj.get(k) || []; if (s.length < 2) s.push(subj); pairSubj.set(k, s);
    }
  }
} catch (e) { coStats.error = String(e.message).slice(0, 200); }
const coPairs = [];
for (const [k, n] of pairCount) if (n >= 3) {
  const [a, b] = k.split(SEP); const subs = pairSubj.get(k);
  const a2 = a.replace(DESK + '/', DESK + '/'), hasImport = importPair.has(a + SEP + b);
  coPairs.push({ a, b, n, subs, hasImport });
  add(a, b, 'cochange', n, `${n} commits together; latest: ${subs.join(' | ')}`);
}

// ---------- 6. docs ----------
const docFiles = [];
const walkMd = d => { const abs = path.join(ROOT, d); if (!fs.existsSync(abs)) return;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) { const p = d + '/' + e.name;
    if (e.isDirectory()) walkMd(p); else if (e.name.endsWith('.md')) docFiles.push(p); } };
walkMd('docs/active'); walkMd('.claude/rules');
for (const f of fs.existsSync(path.join(ROOT, 'docs/roadmap')) ? fs.readdirSync(path.join(ROOT, 'docs/roadmap')) : []) if (f.endsWith('.md')) docFiles.push('docs/roadmap/' + f);
if (fs.existsSync(path.join(ROOT, 'docs/MAP.md'))) docFiles.push('docs/MAP.md');
const docStats = { scanned: docFiles.length, citing: 0, citations: 0, stale: 0, staleList: [], dirCites: 0 };
const CITE = /(?:youcoded\/)?desktop\/src\/[A-Za-z0-9_./@()\[\]-]*[A-Za-z0-9_)\]/]/g;
for (const d of docFiles) {
  const t = fs.readFileSync(path.join(ROOT, d), 'utf8'); const seen = new Set(); let any = false;
  for (const m of t.matchAll(CITE)) {
    let p = m[0].replace(/^youcoded\//, '').replace(/[.,;:]+$/, '');
    if (/[*<>{]/.test(p) || seen.has(p)) continue; seen.add(p); any = true; docStats.citations++;
    const abs = path.join(APP, p);
    if (!fs.existsSync(abs)) { docStats.stale++; docStats.staleList.push({ doc: d, path: p }); continue; }
    if (fs.statSync(abs).isDirectory()) { docStats.dirCites++; continue; }
    add(d, p, 'doc', 1, d);
  }
  if (any) docStats.citing++;
}

// ---------- write ----------
const outDir = path.join(ROOT, 'scratch/command-center'); fs.mkdirSync(outDir, { recursive: true });
const list = [...edges.values()];
fs.writeFileSync(path.join(outDir, 'edges.json'), JSON.stringify({ generatedAt: new Date().toISOString(), commit, edges: list }));
const counts = {}; for (const e of list) counts[e.type] = (counts[e.type] || 0) + 1;
const hidden = coPairs.filter(p => !p.hasImport).sort((a, b) => b.n - a.n);
fs.writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify({ counts, stats, evStats, coStats, docStats, hidden: hidden.slice(0, 40), coPairsTotal: coPairs.length, files: files.length }, null, 1));
console.log(JSON.stringify({ counts, channels: { ...stats, unresolved: stats.unresolved.length }, evStats: { keys: evStats.keys, skipped: (evStats.skipped || []).length }, coStats, doc: { ...docStats, staleList: docStats.staleList.length } }, null, 1));
