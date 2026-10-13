#!/usr/bin/env node
// Finds worktrees under worktrees/ (this workspace's own, plus each component
// repo's nested ones) that are safe to delete, and — only when told exactly
// which ones by name — deletes them.
//
// WHY THIS EXISTS: ~60 worktrees had piled up under worktrees/ because
// checking any one of them by hand takes several commands (is it merged? is
// it dirty? is anything still using it?) repeated per repo it touches. This
// script does that check automatically. `--apply` deletes only worktrees you
// name. `--sweep` (run at every session start since 2026-10-08, after ~100 GB
// piled up again) deletes on its own, but only the narrowest class: merged,
// clean, unused, idle 3+ days, with no leftover file that could be someone's
// only copy. Anything short of that is reported, never deleted, because a
// false "safe" verdict here would destroy someone's unpushed work.
//
// Usage:
//   node scripts/prune-worktrees.mjs                     # dry run — reports only, changes nothing
//   node scripts/prune-worktrees.mjs --exclude <key>      # also treat <key> as in-use (e.g. this session)
//   node scripts/prune-worktrees.mjs --skip-process-check # only meaningful off Linux — see below
//   node scripts/prune-worktrees.mjs --apply <key> [<key-or-path>...]   # deletes ONLY the named ones
//   node scripts/prune-worktrees.mjs --sweep              # automatic: merged + clean + unused + idle 3+ days only
//                                                        # (run by workspace-start; see sweep() below)
//
// A "candidate" is a session directory (worktrees/sessions/<key>/, which can
// hold this workspace's own worktree plus one nested worktree per component
// repo) or an older standalone worktree (worktrees/<name>/). A candidate is
// SAFE only when every worktree inside it is safe on its own.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function gitOk(cwd, ...args) {
  try { execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' }); return true; } catch { return false; }
}
function exists(p) { try { fs.lstatSync(p); return true; } catch { return false; } }
function safeRealpath(p) { try { return fs.realpathSync(p); } catch { return null; } }
export function repoDirFor(root, name) { return name === 'workspace' ? root : path.join(root, name); }

// `git worktree list --porcelain` prints one blank-line-separated block per
// worktree: `worktree <path>`, `HEAD <sha>`, then `branch <ref>` OR `detached`,
// plus optional `bare`/`locked`/`prunable <reason>` lines.
export function parseWorktreeList(output) {
  return output.split(/\n\n+/).filter(Boolean).map(block => {
    const entry = { path: null, head: null, branch: null, bare: false, detached: false, prunableReason: null };
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) entry.path = line.slice('worktree '.length);
      else if (line.startsWith('HEAD ')) entry.head = line.slice('HEAD '.length);
      else if (line.startsWith('branch ')) entry.branch = line.slice('branch '.length);
      else if (line === 'bare') entry.bare = true;
      else if (line === 'detached') entry.detached = true;
      else if (line.startsWith('prunable')) entry.prunableReason = line.slice('prunable'.length).trim();
    }
    return entry;
  });
}

function fetchOrigin(dir) { try { git(dir, 'fetch', '-q', 'origin'); return true; } catch { return false; } }

// Which commit counts as "merged" for a worktree. Prefers the ref origin/HEAD
// actually points at (usually master); falls back to origin/master by name so
// an old clone missing that symbolic ref still gets a real answer.
function defaultBranchTarget(dir) {
  let ref = 'refs/remotes/origin/master';
  try { ref = git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD'); } catch { /* use the fallback name above */ }
  for (const candidate of [ref, 'refs/remotes/origin/master']) {
    try { return { ref: candidate, sha: git(dir, 'rev-parse', candidate) }; } catch { /* try the next one */ }
  }
  return null; // WHY fail closed: with no known default branch, "unmerged" is the honest answer, not "safe".
}

// WHY patch content, not only ancestry (2026-10-08): eight merged sessions sat on disk
// because their commits reached master rebased or cherry-picked — same changes, new
// commit ids — so the ancestry test called them "unmerged" forever. `git cherry` compares
// each commit's actual changes; no "+" line means every change is already in master.
export function isMergedInto(dir, head, targetSha) {
  if (gitOk(dir, 'merge-base', '--is-ancestor', head, targetSha)) return true;
  try { return !git(dir, 'cherry', targetSha, head).split('\n').some(line => line.startsWith('+')); } catch { return false; }
}

// Latest sign anyone worked in this worktree: its newest commit, or the newest entry in its
// own HEAD history (creation, checkout, commit, reset). WHY not file times: our own
// `git status` can rewrite the index, which would make every worktree look touched today.
export function lastActivityMs(worktreePath) {
  let latest = 0;
  for (const args of [['log', '-1', '--format=%ct', 'HEAD'], ['log', '-g', '-1', '--format=%ct', 'HEAD']]) {
    try { latest = Math.max(latest, Number(git(worktreePath, ...args)) * 1000 || 0); } catch { /* no reflog yet — the commit time stands */ }
  }
  return latest;
}

// Leftovers the automatic sweep may delete along with a merged worktree: verify.sh logs,
// journey/shoot screenshots, dev-instance state and build output — all regenerated by
// rerunning the tool that made them. Anything else (notes, a .env, plans) makes the sweep
// skip the worktree and name it instead, because those may be someone's only copy.
const DISPOSABLE_SCRATCH_CHILD = /^(verify-|journeys$|shoot$)/;
const DISPOSABLE_PATHS = [/(^|\/)\.dev-instances\/$/, /(^|\/)\.gradle\/$/, /(^|\/)desktop\/release\/$/];
export function nonDisposableLeftovers(worktreePath, ignored) {
  return ignored.filter(rel => {
    if (DISPOSABLE_PATHS.some(re => re.test(rel))) return false;
    if (rel === 'scratch/') {
      let children = [];
      try { children = fs.readdirSync(path.join(worktreePath, 'scratch')); } catch { return true; }
      return !children.every(name => DISPOSABLE_SCRATCH_CHILD.test(name));
    }
    if (rel.startsWith('scratch/')) return !DISPOSABLE_SCRATCH_CHILD.test(rel.slice('scratch/'.length).split('/')[0]);
    return true;
  });
}

const REGENERABLE_DIRS = new Set(['node_modules', '.vite', 'dist', 'out', 'build', 'coverage', '__pycache__']);
// Ignored files a `git worktree remove` would silently destroy — a scratch/
// folder, a local .env — with the directories that npm/vite/tsc regenerate on
// their own filtered out, so the report stays about things a human actually
// created. WHY worth listing at all: `git worktree remove` deletes ignored
// files along with everything else; a candidate can be "safe" by git's rules
// (clean, merged) and still hold something nobody meant to throw away.
function ignoredFiles(worktreePath) {
  let out;
  try { out = git(worktreePath, 'status', '--porcelain', '--ignored=matching', '--untracked-files=all'); } catch { return []; }
  const seen = new Set();
  for (const line of out.split('\n')) {
    if (!line.startsWith('!! ')) continue;
    const p = line.slice(3);
    // WHY every segment, and the full path (2026-09-23, first real run): checking only the
    // first segment reported `scripts/ui-review/deck/__pycache__/` as all of "scripts/",
    // which reads like the whole folder would be lost.
    if (p.split('/').some(seg => REGENERABLE_DIRS.has(seg)) || p.endsWith('.tsbuildinfo')) continue;
    // A nested component worktree (youcoded/, youcoded-admin/ inside a session dir) is
    // ignored by the workspace repo but is its own worktree, checked and removed as its own
    // entry — not a stray file this removal would destroy.
    if (fs.existsSync(path.join(worktreePath, p, '.git'))) continue;
    seen.add(p);
  }
  return [...seen].sort();
}

// Reads every /proc/<pid>/cwd symlink to see whether any running process is
// sitting inside this worktree right now. Linux-only: there is no equivalent
// filesystem on macOS/Windows, and guessing wrong here (saying "nobody's
// using it" when something is) is exactly the kind of mistake this tool
// exists to prevent, so an unavailable check blocks by default.
function processCwdInside(realDir, { skipProcessCheck }) {
  if (process.platform !== 'linux') {
    return skipProcessCheck ? { blocked: false } : { blocked: true, reason: 'process check unavailable on this OS' };
  }
  let pids;
  try { pids = fs.readdirSync('/proc'); } catch {
    return skipProcessCheck ? { blocked: false } : { blocked: true, reason: 'process check unavailable (/proc unreadable)' };
  }
  for (const pid of pids) {
    if (!/^\d+$/.test(pid)) continue;
    let cwd;
    try { cwd = fs.readlinkSync(`/proc/${pid}/cwd`); } catch { continue; } // gone, or not ours to read — skip, don't fail closed on a race
    cwd = safeRealpath(cwd) ?? cwd;
    if (cwd === realDir || cwd.startsWith(realDir + path.sep)) return { blocked: true, reason: `process ${pid} has its working directory here` };
  }
  return { blocked: false };
}

// A session's worktrees can be spread across repos (the workspace's own at
// worktrees/sessions/<key>/, plus one nested worktree per component at
// worktrees/sessions/<key>/<repo>/), so they must rise or fall together — a
// dirty component worktree makes the whole session NOT safe, not just its
// own line. A worktree outside worktrees/sessions/ is an older standalone one
// and is its own group of one.
export function groupKeyFor(root, entryPath) {
  const sessionsRoot = path.join(root, 'worktrees', 'sessions');
  const rel = path.relative(sessionsRoot, entryPath);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    return { dir: path.join(sessionsRoot, rel.split(path.sep)[0]), kind: 'session' };
  }
  return { dir: entryPath, kind: 'standalone' };
}

function matchesExclude(groupDir, excludeKeys, root) {
  if (!excludeKeys.length) return false;
  const base = path.basename(groupDir);
  const real = safeRealpath(groupDir);
  return excludeKeys.some(key => key === base || path.resolve(root, 'worktrees', 'sessions', key) === groupDir
    || (safeRealpath(path.resolve(root, key)) && safeRealpath(path.resolve(root, key)) === real));
}

function findUnregistered(root, registeredPaths) {
  const results = [];
  const worktreesDir = path.join(root, 'worktrees');
  if (!exists(worktreesDir)) return results;
  for (const item of fs.readdirSync(worktreesDir, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const full = path.join(worktreesDir, item.name);
    if (item.name === 'sessions') {
      for (const sess of fs.readdirSync(full, { withFileTypes: true })) {
        if (!sess.isDirectory()) continue;
        const sessDir = path.join(full, sess.name);
        const real = safeRealpath(sessDir);
        const covered = real && [...registeredPaths].some(p => p === real || p.startsWith(real + path.sep));
        if (!covered) results.push(sessDir);
      }
      continue;
    }
    const real = safeRealpath(full);
    if (!real || !registeredPaths.has(real)) results.push(full);
  }
  return results;
}

/**
 * Scans every repo in `inventory` that exists on disk under `root` and
 * classifies each of its registered worktrees (except the main checkout).
 * Read-only: `fetch: true` (the default) only runs `git fetch`, nothing else
 * touches disk. Returns { root, notes, candidates, notSafe, missing, unregistered }.
 */
// WHY (2026-09-23, found on the first real run): run from inside a session worktree, the
// default root was that WORKTREE, whose component folders are themselves worktrees rather
// than the component repos. Only the workspace repo got scanned, so a session whose app
// worktree held unmerged work was grouped from its workspace half alone and reported SAFE,
// and --apply would then have removed it. Always scan from the MAIN checkout: the parent of
// git's common dir is the same no matter which worktree the tool is started from.
export function mainCheckoutOf(dir) {
  try { return path.dirname(git(dir, 'rev-parse', '--path-format=absolute', '--git-common-dir')); } catch { return dir; }
}

export function scan({ root: givenRoot, inventory, excludeKeys = [], skipProcessCheck = false, invokingCwd = process.cwd(), fetch = true }) {
  const root = mainCheckoutOf(givenRoot);
  const notes = [];
  const invokingReal = safeRealpath(invokingCwd);
  const registeredPaths = new Set();
  const allEntries = [];
  const missing = [];
  for (const name of Object.keys(inventory)) {
    const dir = repoDirFor(root, name);
    if (!exists(path.join(dir, '.git'))) continue; // component not checked out here — nothing of its to scan
    if (fetch && !fetchOrigin(dir)) notes.push(`${name}: git fetch origin failed — classification is using last-known refs, not live ones`);
    const target = defaultBranchTarget(dir);
    if (!target) notes.push(`${name}: could not resolve origin's default branch — its worktrees fail closed as NOT SAFE`);
    let list;
    try { list = parseWorktreeList(git(dir, 'worktree', 'list', '--porcelain')); } catch (error) {
      notes.push(`${name}: git worktree list failed — ${error.message}`); continue;
    }
    if (!list.length) continue;
    const mainReal = safeRealpath(list[0].path);
    if (mainReal) registeredPaths.add(mainReal);
    for (const entry of list.slice(1)) {
      if (entry.bare) continue;
      const resolvedPath = path.resolve(entry.path);
      if (!exists(resolvedPath)) { missing.push({ repo: name, path: resolvedPath, reason: entry.prunableReason || 'directory missing' }); continue; }
      const realPath = fs.realpathSync(resolvedPath);
      registeredPaths.add(realPath);
      const branch = entry.branch ? entry.branch.replace(/^refs\/heads\//, '') : null;
      const reasons = [];
      let statusOut = '';
      try { statusOut = git(resolvedPath, 'status', '--porcelain'); } catch (error) { reasons.push(`could not read git status (${error.message})`); }
      if (statusOut) reasons.push('dirty');
      const head = entry.head || (() => { try { return git(resolvedPath, 'rev-parse', 'HEAD'); } catch { return null; } })();
      if (!target) reasons.push('cannot resolve default branch');
      else if (!head || !isMergedInto(dir, head, target.sha)) reasons.push('unmerged');
      const proc = processCwdInside(realPath, { skipProcessCheck });
      if (proc.blocked) reasons.push(proc.reason.includes('unavailable') ? 'process-check-unavailable' : 'in-use');
      const group = groupKeyFor(root, resolvedPath);
      const groupReal = safeRealpath(group.dir) ?? group.dir;
      if (invokingReal && (groupReal === invokingReal || invokingReal.startsWith(groupReal + path.sep))) reasons.push('current-session');
      if (matchesExclude(group.dir, excludeKeys, root)) reasons.push('excluded');
      const ignored = ignoredFiles(resolvedPath);
      allEntries.push({ repo: name, path: resolvedPath, branch, reasons, ignored, leftovers: nonDisposableLeftovers(resolvedPath, ignored),
        lastActive: lastActivityMs(resolvedPath), groupDir: group.dir, groupKind: group.kind });
    }
  }
  const groups = new Map();
  for (const e of allEntries) {
    if (!groups.has(e.groupDir)) groups.set(e.groupDir, { dir: e.groupDir, kind: e.groupKind, entries: [] });
    groups.get(e.groupDir).entries.push(e);
  }
  const candidates = [], notSafe = [];
  for (const g of groups.values()) {
    const reasons = [...new Set(g.entries.flatMap(e => e.reasons))];
    // Second guard for the same failure: any checkout directly inside this group that the
    // scan did not classify (a component repo missing from the inventory, or not checked
    // out at root) makes the whole group NOT SAFE — removing the outer worktree would
    // delete it along with its ignored contents.
    const classified = new Set(g.entries.map(e => safeRealpath(e.path) ?? e.path));
    let children = [];
    try { children = fs.readdirSync(g.dir, { withFileTypes: true }).filter(d => d.isDirectory()); } catch {}
    for (const child of children) {
      const childPath = path.join(g.dir, child.name);
      if (exists(path.join(childPath, '.git')) && !classified.has(safeRealpath(childPath) ?? childPath)) {
        reasons.push(`unscanned checkout inside: ${child.name}/`);
      }
    }
    const ignored = [...new Set(g.entries.flatMap(e => e.ignored.map(i => e.repo === 'workspace' ? i : `${e.repo}/${i}`)))].sort();
    const leftovers = [...new Set(g.entries.flatMap(e => e.leftovers.map(i => e.repo === 'workspace' ? i : `${e.repo}/${i}`)))].sort();
    const lastActive = Math.max(0, ...g.entries.map(e => e.lastActive));
    const entries = g.entries.map(({ groupDir: _g, groupKind: _k, ...rest }) => rest);
    (reasons.length ? notSafe : candidates).push({ dir: g.dir, kind: g.kind, safe: reasons.length === 0, reasons, entries, ignored, leftovers, lastActive });
  }
  return { root, notes, candidates, notSafe, missing, unregistered: findUnregistered(root, registeredPaths) };
}

function resolveTargetDir(root, target) {
  if (path.isAbsolute(target)) return target;
  const asSession = path.join(root, 'worktrees', 'sessions', target);
  if (exists(asSession)) return asSession;
  const asStandalone = path.join(root, 'worktrees', target);
  if (exists(asStandalone)) return asStandalone;
  return asSession; // not found on disk — resolveTargetDir still returns a dir so the caller reports "not found", not a crash
}

/**
 * Removes ONLY the named candidates, after re-checking each is still safe
 * right before touching it (state can change between the dry run and this
 * call — someone could start editing a worktree in between). Never accepts
 * "apply everything"; the caller must name each target. Nested component
 * worktrees are removed before the workspace's own, matching what a human
 * doing this by hand has to do in that order (removing the parent first
 * would try to delete directories git still has other worktrees registered
 * inside). `git worktree remove` is never passed `--force`: every candidate
 * already passed the clean-working-tree check, so plain remove is enough,
 * and `--force` is exactly what would let a race slip through.
 */
export function applyPrune({ root: givenRoot, inventory, targets, excludeKeys = [], skipProcessCheck = false, invokingCwd = process.cwd(), fetch = true }) {
  const root = mainCheckoutOf(givenRoot); // same reason as scan(): never classify from a worktree
  if (!targets || !targets.length) throw new Error('Refusing to apply with no targets named — there is no "apply all". Name each session key or worktree path to remove.');
  fetch && scan({ root, inventory, excludeKeys, skipProcessCheck, invokingCwd, fetch: true }); // one fetch pass for the whole call, not one per target
  const results = [];
  for (const target of targets) {
    const groupDir = resolveTargetDir(root, target);
    const report = scan({ root, inventory, excludeKeys, skipProcessCheck, invokingCwd, fetch: false }); // re-verify fresh, right before removing
    const candidate = report.candidates.find(c => c.dir === groupDir);
    const unsafe = report.notSafe.find(c => c.dir === groupDir);
    if (!candidate) {
      results.push({ target, groupDir, status: 'refused', reasons: unsafe ? unsafe.reasons : ['not found as a currently-registered worktree group'] });
      continue;
    }
    const ordered = [...candidate.entries].sort((a, b) => (a.repo === 'workspace') - (b.repo === 'workspace')); // nested components first, workspace last
    const removed = [], notes = [];
    let error = null;
    for (const entry of ordered) {
      const dir = repoDirFor(root, entry.repo);
      try { git(dir, 'worktree', 'remove', entry.path); } catch (err) { error = `git worktree remove ${entry.path} failed: ${err.message}`; break; }
      if (entry.branch) {
        if (!gitOk(dir, 'branch', '-D', entry.branch)) notes.push(`local branch ${entry.branch} in ${entry.repo} was already gone`);
        if (gitOk(dir, 'ls-remote', '--exit-code', '--heads', 'origin', entry.branch)) {
          try { git(dir, 'push', 'origin', '--delete', entry.branch); } catch (err) { notes.push(`could not delete origin branch ${entry.branch} in ${entry.repo}: ${err.message}`); }
        }
      }
      removed.push(entry.path);
    }
    if (error) { results.push({ target, groupDir, status: 'error', removed, notes, error }); continue; }
    try { if (exists(groupDir) && fs.readdirSync(groupDir).length === 0) fs.rmdirSync(groupDir); } catch { /* not empty, or already gone — fine either way */ }
    results.push({ target, groupDir, status: 'removed', removed, notes });
  }
  return results;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The automatic half, run by workspace-start at every session start (2026-10-08, Destin
 * approved). WHY it exists: cleanup only ever ran when a branch was merged, so sessions that
 * never merge THEMSELVES — before/after snapshots, helper sessions whose work landed through
 * another branch, research — piled up to ~100 GB. This removes only worktrees that are
 * already SAFE by scan()'s rules (clean, merged, unused), untouched for `minAgeDays`, and
 * holding no leftover file beyond regenerable logs/screenshots. Each is re-checked by
 * applyPrune right before removal. Everything else is only reported: `stale` lists
 * not-safe groups untouched for `staleDays`, for a human to decide on.
 */
export function sweep({ root, inventory, excludeKeys = [], minAgeDays = 3, staleDays = 14, now = Date.now(), fetch = true, invokingCwd = process.cwd() }) {
  const report = scan({ root, inventory, excludeKeys, invokingCwd, fetch });
  const old = c => c.lastActive && now - c.lastActive >= minAgeDays * DAY_MS;
  const due = report.candidates.filter(c => old(c) && !c.leftovers.length);
  const keptForLeftovers = report.candidates.filter(c => old(c) && c.leftovers.length);
  const results = due.length ? applyPrune({ root: report.root, inventory, targets: due.map(c => c.dir), excludeKeys, invokingCwd, fetch: false }) : [];
  // WHY not in-use/current/excluded: those are live sessions, not forgotten ones.
  const live = new Set(['in-use', 'current-session', 'excluded']);
  const stale = report.notSafe.filter(c => !c.reasons.some(r => live.has(r)) && c.lastActive && now - c.lastActive >= staleDays * DAY_MS);
  return { root: report.root, results, keptForLeftovers, stale, notes: report.notes };
}

export function formatSweep(s) {
  const rel = dir => path.relative(s.root, dir) || dir;
  const lines = [];
  const removed = s.results.filter(r => r.status === 'removed');
  if (removed.length) lines.push(`worktree sweep: removed ${removed.length} merged, unused worktree folder(s): ${removed.map(r => rel(r.groupDir)).join(', ')}`);
  for (const r of s.results.filter(r => r.status !== 'removed')) lines.push(`worktree sweep: left ${rel(r.groupDir)} — ${r.status === 'refused' ? r.reasons.join(', ') : r.error}`);
  for (const c of s.keptForLeftovers) lines.push(`worktree sweep: kept merged ${rel(c.dir)} — it holds files that may be someone's only copy: ${c.leftovers.slice(0, 4).join(', ')}${c.leftovers.length > 4 ? ', …' : ''}`);
  if (s.stale.length) {
    lines.push(`worktree sweep: ${s.stale.length} folder(s) untouched for 2+ weeks are NOT merged or have unsaved changes — tell Destin and ask whether to keep them (details: node scripts/prune-worktrees.mjs):`);
    for (const c of s.stale) lines.push(`  ${rel(c.dir)} (${c.reasons.join(', ')}; last active ${new Date(c.lastActive).toISOString().slice(0, 10)})`);
  }
  for (const n of s.notes) lines.push(`worktree sweep note: ${n}`);
  return lines.join('\n');
}

export function formatReport(report) {
  const lines = [];
  for (const c of report.candidates) {
    const repos = c.entries.map(e => `${e.repo}@${e.branch ?? '(detached)'}`).join(', ');
    let size = '?';
    try { size = execFileSync('du', ['-sh', c.dir], { encoding: 'utf8' }).split('\t')[0].trim(); } catch { /* du not available — size stays "?" */ }
    const ignored = c.ignored.length ? `  ignored: ${c.ignored.slice(0, 5).join(', ')}${c.ignored.length > 5 ? ', …' : ''}` : '';
    lines.push(`SAFE  ${path.relative(report.root, c.dir) || c.dir}  ${size}  [${repos}]${ignored}`);
  }
  if (report.notSafe.length) {
    const reasonCounts = new Map();
    for (const c of report.notSafe) for (const r of c.reasons) reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
    const parts = [...reasonCounts.entries()].map(([r, n]) => `${n} ${r}`).join(', ');
    lines.push(`NOT SAFE: ${report.notSafe.length} worktree group(s) — ${parts}`);
  }
  if (report.missing.length) {
    lines.push('MISSING (registered but the directory is gone — run `git worktree prune` in the named repo):');
    for (const m of report.missing) lines.push(`  ${m.repo}: ${m.path} (${m.reason})`);
  }
  if (report.unregistered.length) {
    lines.push('UNREGISTERED leftover dirs under worktrees/ (not a worktree of any repo — inspect by hand):');
    for (const u of report.unregistered) lines.push(`  ${u}`);
  }
  for (const n of report.notes) lines.push(`note: ${n}`);
  if (report.candidates.some(c => c.entries.some(e => e.repo !== 'workspace'))) {
    lines.push('note: disk freed can be smaller than `du` suggests — component node_modules are hardlinked with the shared checkout (observed once: du said 13.7 GB, disk freed 5 GB).');
  }
  if (!report.candidates.length && !report.notSafe.length && !report.missing.length && !report.unregistered.length) {
    lines.push('Nothing registered under worktrees/ needs attention.');
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const opts = { root: fileURLToPath(new URL('..', import.meta.url)), apply: null, exclude: [], skipProcessCheck: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help') opts.help = true;
    else if (arg === '--root') opts.root = argv[++i];
    else if (arg === '--exclude') opts.exclude.push(argv[++i]);
    else if (arg === '--skip-process-check') opts.skipProcessCheck = true;
    else if (arg === '--sweep') opts.sweep = true;
    else if (arg === '--apply') {
      opts.apply = [];
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) opts.apply.push(argv[++i]);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log('Usage: node scripts/prune-worktrees.mjs [--root <workspace>] [--exclude <key>]... [--skip-process-check]\n' +
      '       node scripts/prune-worktrees.mjs --apply <session-key-or-path> [<session-key-or-path>...]\n' +
      '       node scripts/prune-worktrees.mjs --sweep [--exclude <key>]   # what session start runs: removes merged, clean, unused worktrees idle 3+ days\n' +
      'Dry run by default (reports only, changes nothing). --apply removes ONLY the exact names given, after re-checking each is still safe.');
    return;
  }
  const inventory = JSON.parse(fs.readFileSync(new URL('./workspace-repos.json', import.meta.url), 'utf8'));
  if (opts.sweep) {
    const out = formatSweep(sweep({ root: opts.root, inventory, excludeKeys: opts.exclude }));
    console.log(out || 'worktree sweep: nothing to remove.');
    return;
  }
  if (opts.apply) {
    if (!opts.apply.length) throw new Error('--apply needs at least one session key or path — there is no "apply all".');
    const results = applyPrune({ root: opts.root, inventory, targets: opts.apply, excludeKeys: opts.exclude, skipProcessCheck: opts.skipProcessCheck });
    for (const r of results) {
      if (r.status === 'removed') console.log(`removed: ${r.groupDir}\n  ${r.removed.join('\n  ')}${r.notes.length ? `\n  ${r.notes.join('\n  ')}` : ''}`);
      else if (r.status === 'refused') console.log(`REFUSED (not safe): ${r.groupDir} — ${r.reasons.join(', ')}`);
      else console.log(`ERROR: ${r.groupDir} — ${r.error}\n  partially removed: ${r.removed.join(', ') || '(none)'}`);
    }
    if (results.some(r => r.status !== 'removed')) process.exitCode = 1;
    return;
  }
  const report = scan({ root: opts.root, inventory, excludeKeys: opts.exclude, skipProcessCheck: opts.skipProcessCheck });
  console.log(formatReport(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(`prune-worktrees: ${error.message}`);
    process.exitCode = 1;
  }
}
