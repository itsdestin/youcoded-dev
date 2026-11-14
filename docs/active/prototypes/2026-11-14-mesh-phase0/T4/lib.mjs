// T4 prototype: git plumbing + the deterministic merge rule from design 5.7.
// Throwaway code. Plain Node ESM, real `git`, no dependencies.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const GITBIN = process.env.T4_GIT || 'git';
export const stats = { spawns: 0 };
const ENV0 = { PATH: process.env.PATH, HOME: '/nonexistent', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', LC_ALL: 'C', TZ: 'UTC', GIT_TERMINAL_PROMPT: '0' };
const ZERO = '0000000000000000000000000000000000000000';

export function run(args, { cwd, env, input, gitDir, workTree, ok = false, buf = false } = {}) {
  const e = { ...ENV0, ...(env || {}) };
  if (gitDir) e.GIT_DIR = gitDir;
  if (workTree) e.GIT_WORK_TREE = workTree;
  const a = ['-c', 'core.autocrlf=false', '-c', 'gc.auto=0', '-c', 'core.hooksPath=/nonexistent', '-c', 'core.fsync=none', ...args];
  const t0 = Date.now();
  const r = spawnSync(GITBIN, a, { cwd, env: e, input, maxBuffer: 1 << 28 });
  stats.spawns++; const sub = args.find((x) => !x.startsWith('-') && !x.includes('=')) ; (stats.by ||= {})[sub] = (stats.by[sub] || 0) + 1; (stats.ms ||= {})[sub] = (stats.ms[sub] || 0) + (Date.now() - t0);
  if (r.status !== 0 && !ok) throw new Error(`git ${args.join(' ')} -> ${r.status}: ${r.stderr}`);
  return { code: r.status, out: buf ? r.stdout : r.stdout.toString('utf8'), err: r.stderr.toString() };
}

// guards.ts conflictCopyName, copied verbatim in behaviour.
export function conflictCopyName(relPath, deviceName, whenSec) {
  const date = new Date(whenSec * 1000).toISOString().slice(0, 10);
  const dot = relPath.lastIndexOf('.');
  const slash = Math.max(relPath.lastIndexOf('/'), relPath.lastIndexOf('\\'));
  const suffix = ` (from ${deviceName}, ${date})`;
  if (dot > slash + 1) return `${relPath.slice(0, dot)}${suffix}${relPath.slice(dot)}`;
  return `${relPath}${suffix}`;
}

export class Repo {
  constructor(gitDir, workTree = null) { this.gitDir = gitDir; this.workTree = workTree; this.mc = new Map(); this.meta = new Map(); this.originCache = new Map(); this.mergesMade = 0; this.haveSet = new Set(); this.cnt = new Map(); this.ancCache = new Map(); }
  g(args, o = {}) { return run(args, { gitDir: this.gitDir, workTree: this.workTree, ...o }); }
  out(args, o = {}) { return this.g(args, o).out.trim(); }
  // Commits never change, so "is there" (once true) and ancestry answers are memoised.
  has(id) { if (this.haveSet.has(id)) return true; const ok = /^[0-9a-f]{40}$/.test(id) && this.g(['cat-file', '-e', `${id}^{commit}`], { ok: true }).code === 0; if (ok) this.haveSet.add(id); return ok; }
  isAnc(a, b) { if (a === b) return true; const k = a + b; let v = this.ancCache.get(k); if (v === undefined) { v = this.g(['merge-base', '--is-ancestor', a, b], { ok: true }).code === 0; this.ancCache.set(k, v); } return v; }
  commitMeta(id) {
    let m = this.meta.get(id);
    if (!m) { const [tree, at] = this.out(['log', '-1', '--format=%T %at', id]).split(' '); m = { tree, at: +at }; this.meta.set(id, m); }
    return m;
  }
}

// ---- "the commit that made it": device and UTC date for a conflict copy's name ----
// Latest non-merge commit that touched `file` among the side's ancestors (by commit date);
// if none touched it (the file was itself created by a merge), the latest non-merge commit
// among the side's ancestors. All inputs are commit data, so every device computes the same.
function origin(repo, side, file) {
  const k = side + '\0' + file;
  let v = repo.originCache.get(k);
  if (v) return v;
  const fmt = ['log', '-1', '--no-merges', '--format=%an%x1f%at', side];
  let r = repo.out(['log', '-1', '--full-history', '--no-merges', '--format=%an%x1f%at', side, '--', file]);
  if (!r) r = repo.out(fmt);
  const [dev, at] = r.split('\x1f');
  v = { dev, at: +at };
  repo.originCache.set(k, v);
  return v;
}

function parseRaw(out) { // diff-tree -r --raw -z --no-renames
  const parts = out.split('\0'); const m = new Map();
  for (let i = 0; i + 1 < parts.length; i += 2) {
    if (!parts[i]) break;
    const f = parts[i].slice(1).split(' '); // oldmode newmode oldoid newoid status
    m.set(parts[i + 1], { status: f[4], base: f[2] === ZERO ? null : f[2], next: f[3] === ZERO ? null : f[3] });
  }
  return m;
}

const COPY_RE = / \(from [^()]*\)(?=(\.[^./]*)?$)/;
const ROOT_RE = /( \(from [^()]*\))+(?=(\.[^./]*)?$)/;   // every layer of copy suffix
/** Conflict copies whose bytes equal their original (or an earlier-named sibling copy). Pure function of the
 *  file list. These stay in the stored history but are not shown or written on disk (nothing is deleted, so a
 *  later three-way merge can never read their absence as "a user deleted it"). */
export function hiddenCopies(entries) { // Map path -> oid
  const hidden = new Set(); const kept = new Map();
  for (const f of [...entries.keys()].filter((f) => COPY_RE.test(f)).sort()) {
    const root = f.replace(ROOT_RE, '');
    if (!kept.has(root)) kept.set(root, new Set(entries.has(root) ? [entries.get(root)] : []));
    const seen = kept.get(root);
    if (seen.has(entries.get(f))) hidden.add(f); else seen.add(entries.get(f));
  }
  return hidden;
}

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbd9fa94';

/** Three-way merge of trees. Pure function of (baseTree, p1, p2) and the commit data behind
 *  p1/p2. No rename detection (rename = delete + add), so nothing here is heuristic. */
function mergeTrees(repo, baseTree, p1, p2, cfg, forBase = false) {
  const t1 = repo.commitMeta(p1).tree, t2 = repo.commitMeta(p2).tree;
  const d1 = parseRaw(repo.g(['diff-tree', '-r', '--raw', '-z', '--no-renames', baseTree, t1], { buf: false }).out);
  const d2 = parseRaw(repo.g(['diff-tree', '-r', '--raw', '-z', '--no-renames', baseTree, t2], { buf: false }).out);
  const upd = new Map();      // path -> oid | null, applied on top of p1's tree
  const copies = [];          // {path, oid, side}
  const events = [];
  const paths = [...new Set([...d1.keys(), ...d2.keys()])].sort();
  for (const p of paths) {
    const x = d1.get(p), y = d2.get(p);
    if (!x) { upd.set(p, y.next); continue; }
    if (!y) continue;
    if (x.next === y.next) continue;
    // forBase: this merge only builds the shared ancestor of a criss-cross. Anything the bases disagree on is
    // left OUT of it (reads as "not there"), so a side that merely equals a made-up winner is never mistaken for
    // "unchanged" and silently loses its version.
    if (forBase && (x.next === null || y.next === null)) { upd.set(p, null); continue; }
    if (x.next === null) { upd.set(p, y.next); events.push(['edit-beats-delete', p]); continue; } // x deleted, y edited
    if (y.next === null) { events.push(['edit-beats-delete', p]); continue; }
    // both present and different
    let merged = null;
    if (x.base !== null && cfg.lineMerge !== false) merged = lineMerge(repo, x.base, x.next, y.next, cfg.diffAlgo);
    if (merged) { upd.set(p, merged); continue; }
    if (forBase) { upd.set(p, null); continue; }
    // clash: lower blob id keeps the name
    events.push(['clash', p]);
    const xWins = x.next < y.next;
    if (xWins) copies.push({ path: p, oid: y.next, side: p2 }); else { upd.set(p, y.next); copies.push({ path: p, oid: x.next, side: p1 }); }
  }
  // current entries of p1 with updates applied
  const ls = repo.g(['ls-tree', '-r', '-z', t1]).out.split('\0').filter(Boolean);
  const final = new Map();
  for (const l of ls) { const [meta, f] = l.split('\t'); final.set(f, meta.split(' ')[2]); }
  for (const [p, o] of upd) { if (o === null) final.delete(p); else final.set(p, o); }
  if (forBase) { // no copies, no collision handling: just drop what collides
    const idx0 = path.join(repo.gitDir, `idx-base-${process.pid}`); const env0 = { GIT_INDEX_FILE: idx0 };
    repo.g(['read-tree', t1], { env: env0 });
    const ls0 = []; for (const [p, o] of upd) if (o === null) ls0.push(`0 ${ZERO}\t${p}`); for (const [p, o] of upd) if (o !== null) ls0.push(`100644 ${o}\t${p}`);
    // a file and a folder of the same name in one tree cannot exist: remove the file side first
    const names = new Set([...final.keys()]); const fl = [...names].filter((n) => [...names].some((m) => m.startsWith(n + '/')));
    for (const n of fl) ls0.unshift(`0 ${ZERO}\t${n}`);
    if (ls0.length) repo.g(['update-index', '--index-info'], { env: env0, input: ls0.join('\n') + '\n' });
    const tree0 = repo.out(['write-tree'], { env: env0 }); fs.rmSync(idx0, { force: true });
    return { tree: tree0, events };
  }
  // file/folder collisions: the folder wins, the file becomes a copy
  const dirs = new Set();
  for (const p of final.keys()) { let i = p.indexOf('/'); while (i >= 0) { dirs.add(p.slice(0, i)); i = p.indexOf('/', i + 1); } }
  const sideOf = (p, oid) => (repo.out(['rev-parse', '-q', '--verify', `${t1}:${p}`], { ok: true }) === oid ? p1 : p2);
  for (const p of [...final.keys()].sort()) if (dirs.has(p)) {
    const oid = final.get(p); final.delete(p); upd.set(p, null);
    copies.push({ path: p, oid, side: sideOf(p, oid) }); events.push(['file-vs-folder', p]);
  }
  copies.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.oid < b.oid ? -1 : a.oid > b.oid ? 1 : 0));
  const copyAdds = [];
  for (const c of copies) {
    const o = origin(repo, c.side, c.path);
    let name = conflictCopyName(c.path, o.dev, o.at), i = 2;
    // same name and same content already there: this version is already kept, nothing to add
    // naming='blobid': on a name clash use the version's own id instead of a counter, so one version gets
    // the same name no matter which order merges happened in
    if (cfg.naming === 'blobid' && final.has(name) && final.get(name) !== c.oid) name = conflictCopyName(c.path, `${o.dev} ${c.oid.slice(0, 6)}`, o.at);
    while (final.has(name) && final.get(name) !== c.oid) name = conflictCopyName(c.path, `${o.dev} ${i++}`, o.at);
    if (final.get(name) === c.oid) { events.push(['copy-already-there', name]); continue; }
    final.set(name, c.oid); upd.set(name, c.oid); copyAdds.push(name);
    events.push(['copy', name]);
  }
  if (cfg.dedupe === true) { // OFF by default: deleting a duplicate copy is unsafe under three-way merge (found by the fuzzer)
    // WHY: two versions by the same device on the same day get the same copy name, and which one keeps the
    // plain name depends on merge order, so one version can end up under two names. A copy whose bytes equal
    // its original (or an earlier-named sibling copy) adds nothing; dropping it is a pure function of the tree.
    const COPY = / \(from [^()]*\)(?=(\.[^./]*)?$)/;
    const ROOT = /( \(from [^()]*\))+(?=(\.[^./]*)?$)/;   // every layer of copy suffix
    const copyNames = [...final.keys()].filter((f) => COPY.test(f)).sort();
    const kept = new Map(); // root name -> oids already present (the root file itself, then earlier-named copies)
    for (const f of copyNames) {
      const root = f.replace(ROOT, '');
      if (!kept.has(root)) kept.set(root, new Set(final.has(root) ? [final.get(root)] : []));
      const seen = kept.get(root);
      if (seen.has(final.get(f))) { final.delete(f); upd.set(f, null); events.push(['drop-identical-copy', f]); } else seen.add(final.get(f));
    }
  }
  // build the tree: p1's tree + upd, via a throwaway index
  const idx = path.join(repo.gitDir, `idx-merge-${process.pid}`);
  const env = { GIT_INDEX_FILE: idx };
  repo.g(['read-tree', t1], { env });
  const lines = [];
  for (const [p, o] of upd) if (o === null) lines.push(`0 ${ZERO}\t${p}`);
  for (const [p, o] of upd) if (o !== null) lines.push(`100644 ${o}\t${p}`);
  if (lines.length) repo.g(['update-index', '--index-info'], { env, input: lines.join('\n') + '\n' });
  const tree = repo.out(['write-tree'], { env });
  fs.rmSync(idx, { force: true });
  return { tree, events };
}

function lineMerge(repo, base, a, b, algo = 'myers') {
  const dir = path.join(repo.gitDir, `tmp-mf-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  const w = (n, oid) => { const f = path.join(dir, n); fs.writeFileSync(f, repo.g(['cat-file', 'blob', oid], { buf: true }).out); return f; };
  const fa = w('a', a), fb = w('b', base), fc = w('c', b);
  const r = run(['merge-file', '-p', `--diff-algorithm=${algo}`, '-L', 'x', '-L', 'base', '-L', 'y', fa, fb, fc], { ok: true, buf: true });
  fs.rmSync(dir, { recursive: true, force: true });
  if (r.code !== 0) return null; // conflicts (>0) or error/binary (<0): treat as a clash
  return repo.out(['hash-object', '-w', '--stdin'], { input: r.out });
}

export const MESH_AUTHOR = { GIT_AUTHOR_NAME: 'YouCoded Mesh', GIT_AUTHOR_EMAIL: 'mesh@youcoded.invalid', GIT_COMMITTER_NAME: 'YouCoded Mesh', GIT_COMMITTER_EMAIL: 'mesh@youcoded.invalid' };

/** The merge commit of two commits. cfg.det=true is the design's rule: fixed author and
 *  message, later parent's date, parents sorted by id. cfg.baseMode picks how several merge
 *  bases are handled ('recursive' = merge them into a virtual base with this same function). */
export function mergeCommit(repo, x, y, cfg, ctx = {}) {
  if (x === y) return x;
  if (repo.isAnc(x, y)) return y;
  if (repo.isAnc(y, x)) return x;
  const det = cfg.det !== false;
  const [p1, p2] = det ? [x, y].sort() : [x, y];
  const key = det ? `${p1}:${p2}` : `${p1}:${p2}:${ctx.dev}`;
  const hit = repo.mc.get(key); if (hit) return hit;
  const bases = repo.out(['merge-base', '--all', p1, p2], { ok: true }).split('\n').filter(Boolean).sort();
  let baseTree;
  if (bases.length === 0) baseTree = EMPTY_TREE;
  else if (bases.length === 1 || cfg.baseMode === 'lowest') baseTree = repo.commitMeta(bases[0]).tree;
  else if (cfg.baseMode === 'empty') baseTree = EMPTY_TREE;
  else if (cfg.baseMode === 'recursive') { let v = bases[0]; for (const b of bases.slice(1)) v = mergeCommit(repo, v, b, cfg, ctx); baseTree = repo.commitMeta(v).tree; }
  else if (cfg.baseMode === undefined || cfg.baseMode === 'cons') baseTree = repo.commitMeta(virtualBase(repo, bases, cfg)).tree;
  else throw new Error('unknown baseMode ' + cfg.baseMode);
  const { tree, events } = mergeTrees(repo, baseTree, p1, p2, cfg);
  let env;
  if (det) {
    const at = Math.max(repo.commitMeta(p1).at, repo.commitMeta(p2).at);
    env = { ...MESH_AUTHOR, GIT_AUTHOR_DATE: `${at} +0000`, GIT_COMMITTER_DATE: `${at} +0000` };
  } else { // ablation: what a normal `git merge` on each device would do
    const at = `${ctx.now ?? 0} +0000`;
    env = { GIT_AUTHOR_NAME: ctx.dev, GIT_AUTHOR_EMAIL: 'd@x', GIT_COMMITTER_NAME: ctx.dev, GIT_COMMITTER_EMAIL: 'd@x', GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at };
  }
  const id = repo.out(['commit-tree', tree, '-p', p1, '-p', p2, '-m', 'mesh merge'], { env });
  repo.mc.set(key, id); repo.mergesMade++;
  (repo.events ||= []).push(...events.map((e) => [id.slice(0, 6), p1.slice(0, 6), p2.slice(0, 6), ...e]));
  return id;
}

/** Shared ancestor for a criss-cross: the merge bases merged pairwise, leaving out whatever they disagree on. */
export function virtualBase(repo, bases, cfg) {
  let v = bases[0];
  for (const b of bases.slice(1)) {
    const key = `vb:${v}:${b}`; const hit = repo.mc.get(key);
    if (hit) { v = hit; continue; }
    const sub = repo.out(['merge-base', '--all', v, b], { ok: true }).split('\n').filter(Boolean).sort();
    const bt = sub.length === 0 ? EMPTY_TREE : sub.length === 1 ? repo.commitMeta(sub[0]).tree : repo.commitMeta(virtualBase(repo, sub, cfg)).tree;
    const { tree } = mergeTrees(repo, bt, v, b, cfg, true);
    const at = Math.max(repo.commitMeta(v).at, repo.commitMeta(b).at);
    const env = { ...MESH_AUTHOR, GIT_AUTHOR_DATE: `${at} +0000`, GIT_COMMITTER_DATE: `${at} +0000` };
    const id = repo.out(['commit-tree', tree, '-p', v, '-p', b, '-m', 'mesh virtual base'], { env });
    repo.mc.set(key, id); v = id;
  }
  return v;
}
