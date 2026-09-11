#!/usr/bin/env node
// Session startup provisions new worktrees; maintenance of shared checkouts stays in setup.sh.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { formatBriefing, syncWorkspace, verifyWorkspaceIdentity } from './workspace-sync.mjs';

const inventory = JSON.parse(fs.readFileSync(new URL('./workspace-repos.json', import.meta.url), 'utf8'));
function git(root, ...args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    throw new Error(`git ${args.join(' ')} (${root}): ${String(error.stderr || error.message).trim()}`);
  }
}
function exists(p) { try { fs.lstatSync(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
function realDirectory(p) {
  if (!exists(p) || !fs.lstatSync(p).isDirectory() || fs.realpathSync(p) !== p) {
    throw new Error(`Expected a real directory, not a symlink or missing path: ${p}`);
  }
}
function ensureDirectory(p) {
  if (!exists(p)) fs.mkdirSync(p);
  realDirectory(p);
}
function commonDir(root) { return fs.realpathSync(git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir')); }
function primaryRoot(root) {
  const common = commonDir(root);
  // Git's worktree registry is the authority; do not infer a checkout from a .git suffix.
  const primary = git(root, 'worktree', 'list', '--porcelain').split('\n')[0].replace(/^worktree /, '');
  const resolved = fs.realpathSync(primary);
  if (commonDir(resolved) !== common) throw new Error(`Cannot resolve primary checkout for ${root}`);
  return resolved;
}
function verifyRepo(root) {
  if (!exists(root)) throw new Error(`Missing repository: ${root}. Run setup.sh explicitly to install it first.`);
  realDirectory(root);
  if (!exists(path.join(root, '.git')) || fs.realpathSync(git(root, 'rev-parse', '--show-toplevel')) !== root) {
    throw new Error(`Not a repository root: ${root}`);
  }
}
function save(file, state) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temp, file);
}

/**
 * node_modules directories a freshly created component worktree inherits from
 * its source checkout, as hardlink farms (`cp -al`).
 *
 * WHY this exists (2026-09-07): a new session worktree has no dependencies, so
 * the first `npx vitest` / `tsc` dies with `Cannot find module` until the model
 * discovers — out of band, from PITFALLS.md — that it must hand-copy them. That
 * is a guaranteed dead-end on every fresh JS session. Copying here turns "read
 * the docs, then run a command" into "it just works."
 *
 * WHY hardlinks (`cp -al`) and never a symlink: a symlinked node_modules lets
 * `npm ci` / Gradle's bundleWebUi follow the link and empty the SHARED copy for
 * every worktree at once (verify.sh prints the same warning). Hardlinks share
 * inodes with the source, which the patcher rule already handles by replacing
 * files rather than writing in place. Cross-filesystem sources fall back to a
 * plain recursive copy — slower but correct.
 *
 * Best-effort by design: a source without that directory (most repos have no
 * installed deps at all) contributes nothing, and a copy failure warns rather
 * than aborting the whole startup over a cache that can be rebuilt with npm ci.
 */
const NODE_MODULES_PROVISIONS = {
  youcoded: ['desktop'],
};

function copyTree(src, dest) {
  try {
    execFileSync('cp', ['-al', src, dest], { stdio: ['ignore', 'pipe', 'pipe'] });
    return 'hardlinked';
  } catch {
    // EXDEV (source on another filesystem) or an older cp: hard links are an
    // optimization, not a requirement — fall back to a real copy.
    execFileSync('cp', ['-a', src, dest], { stdio: ['ignore', 'pipe', 'pipe'] });
    return 'copied';
  }
}

/**
 * Fetches the packages a component's package-lock.json requires but its
 * hardlink farm lacks, each into a directory that did not exist before.
 *
 * WHY (2026-09-11): the farm is a copy of whatever was last installed in the
 * shared checkout — 213 commits behind master that day — so a dependency added
 * to master since then is simply absent, and the first test run dies at import
 * (`Failed to resolve import "dompurify"`; 85 suites in one session). Three
 * sessions hit it that day, and each found the manual recipe only after the
 * failure. `npm install` cannot be the fix: it rewrites
 * node_modules/.package-lock.json IN PLACE through the shared inode
 * (PITFALLS.md → Worktrees). `npm pack` + `tar` into a fresh directory creates
 * inodes only this worktree sees.
 *
 * Only MISSING, required, this-platform packages. The 25 missing that day were
 * otherwise all optional other-platform binaries, and the 31 a patch version
 * behind loaded fine — refetching those is a network round trip each for a
 * failure nobody has hit. Best-effort like the copy: a failed fetch is a note.
 */
const MAX_FILLED_PACKAGES = 15;
function platformAllows(list, value) {
  if (!Array.isArray(list)) return true;
  if (list.includes(`!${value}`)) return false;
  const allowed = list.filter(item => !item.startsWith('!'));
  return allowed.length === 0 || allowed.includes(value);
}
export function fillMissingPackages(componentDir, label = path.basename(componentDir)) {
  let lock;
  try { lock = JSON.parse(fs.readFileSync(path.join(componentDir, 'package-lock.json'), 'utf8')); } catch { return []; }
  const missing = [];
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    // inBundle packages arrive inside their parent's tarball; link entries are workspaces.
    if (!key.startsWith('node_modules/') || !entry?.version || entry.link || entry.inBundle || entry.optional) continue;
    if (!platformAllows(entry.os, process.platform) || !platformAllows(entry.cpu, process.arch)) continue;
    if (exists(path.join(componentDir, key))) continue;
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    missing.push({ key, spec: `${name}@${entry.version}` });
  }
  if (missing.length === 0) return [];
  if (missing.length > MAX_FILLED_PACKAGES) {
    // Deleting a hardlink farm only drops link counts, so a real install is safe from here.
    return [`${label}/node_modules is missing ${missing.length} packages, too many to fetch one by one — delete it and run npm ci in ${componentDir}`];
  }
  const filled = [], failed = [];
  let scratch;
  try {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-deps-'));
    for (const { key, spec } of missing) {
      const dest = path.join(componentDir, key);
      try {
        // shell on Windows only: npm is npm.cmd there, which Node will not spawn without one.
        const file = execFileSync('npm', ['pack', spec, '--pack-destination', scratch, '--silent'],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, shell: process.platform === 'win32' })
          .trim().split('\n').pop().trim();
        fs.mkdirSync(dest, { recursive: true });
        execFileSync('tar', ['-xzf', path.join(scratch, file), '-C', dest, '--strip-components=1'], { stdio: ['ignore', 'pipe', 'pipe'] });
        filled.push(spec);
      } catch {
        // Never leave an empty directory behind: the next check would read it as installed.
        fs.rmSync(dest, { recursive: true, force: true });
        failed.push(spec);
      }
    }
  } catch (error) {
    return [`${label}/node_modules: could not check for missing packages (${String(error.message).trim()})`];
  } finally {
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
  }
  const notes = [];
  if (filled.length) notes.push(`${label}/node_modules: fetched ${filled.length} package(s) the shared install lacks (${filled.join(', ')})`);
  if (failed.length) notes.push(`${label}/node_modules: could not fetch ${failed.join(', ')} — node scripts/fill-missing-deps.mjs ${componentDir}`);
  return notes;
}

function provisionNodeModules(name, source, destination) {
  const notes = [];
  for (const sub of NODE_MODULES_PROVISIONS[name] ?? []) {
    const srcModules = path.join(source, sub, 'node_modules');
    if (!exists(srcModules) || !fs.lstatSync(srcModules).isDirectory() || fs.lstatSync(srcModules).isSymbolicLink()) continue;
    const destModules = path.join(destination, sub, 'node_modules');
    if (exists(destModules)) continue; // resume, or a prior partial run — leave it alone
    try {
      // The sub-dir (e.g. desktop/) may not exist as a real directory yet — a
      // worktree's .gitignore can exclude the whole component, so git creates
      // only the tracked files' parents. cp cannot create node_modules into a
      // missing parent, so make it first.
      fs.mkdirSync(path.dirname(destModules), { recursive: true });
      notes.push(`${sub}/node_modules (${copyTree(srcModules, destModules)})`);
    } catch (error) {
      notes.push(`${sub}/node_modules (FAILED: ${String(error.message).trim()} — run 'cd ${path.join(destination, sub)} && npm ci')`);
      continue;
    }
    notes.push(...fillMissingPackages(path.join(destination, sub), sub));
  }
  return notes;
}
function validateDestinationAncestors(root, destination) {
  const relative = path.relative(root, destination);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Session destination escapes the workspace: ${destination}`);
  }
  let current = root;
  for (const part of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') return; // Missing descendants will be created only after sync succeeds.
      throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(current) !== current) {
      throw new Error(`Expected a real directory, not a symlink or unsafe session ancestor: ${current}`);
    }
  }
}

function validateWorktree(entry, source, destination, branch) {
  if (entry.path !== destination || entry.branch !== branch || entry.commonDir !== commonDir(source)) {
    throw new Error(`Session ownership mismatch for ${destination}; nothing was replaced.`);
  }
  if (!exists(destination)) throw new Error(`Missing recorded worktree: ${destination}. Restore it or use a new session key; it will not be recreated automatically.`);
  realDirectory(destination);
  if (fs.realpathSync(git(destination, 'rev-parse', '--show-toplevel')) !== destination ||
      commonDir(destination) !== entry.commonDir || git(destination, 'symbolic-ref', '--short', 'HEAD') !== branch) {
    throw new Error(`Worktree branch or ownership changed: ${destination}; nothing was replaced.`);
  }
}

export function startWorkspace({ root, session, repos = [] }) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(session || '')) throw new Error('Session key must be 1–64 lowercase letters, digits or hyphens, starting with a letter or digit.');
  for (const name of repos) if (!Object.hasOwn(inventory, name)) throw new Error(`Unknown repository: ${name}`);
  // WHY: establish the configured workspace identity before creating lock/state
  // directories or allowing any Git command that can fetch or update refs.
  const identity = verifyWorkspaceIdentity(path.resolve(root), 'master', { requirePrimary: false });
  root = identity.primary;
  verifyWorkspaceIdentity(root, 'master');
  const common = commonDir(root), stateRoot = path.join(common, 'youcoded-sessions');
  ensureDirectory(stateRoot);
  const lock = path.join(stateRoot, `${session}.lock`), manifest = path.join(stateRoot, `${session}.json`);
  try { fs.mkdirSync(lock); } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Session ${session} is locked: ${lock}. Another startup may be running; do not remove the lock without checking.`);
    throw error;
  }
  try {
    const workspace = path.join(root, 'worktrees', 'sessions', session), branch = `session/${session}`;
    let state = { version: 1, session, workspace, repositories: {} };
    if (exists(manifest)) {
      if (!fs.lstatSync(manifest).isFile() || fs.lstatSync(manifest).isSymbolicLink()) throw new Error(`Invalid session manifest: ${manifest}`);
      state = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (state.version !== 1 || state.session !== session || state.workspace !== workspace || !state.repositories || Array.isArray(state.repositories)) {
        throw new Error(`Invalid session ownership in ${manifest}`);
      }
    }
    const names = [...new Set(['workspace', ...Object.keys(state.repositories), ...repos])];
    // WHY: ownership and collision checks for every requested repository must finish
    // before workspace sync is allowed to move the shared checkout.
    for (const name of names) {
      if (!Object.hasOwn(inventory, name)) throw new Error(`Unknown repository in manifest: ${name}`);
      const source = name === 'workspace' ? root : path.join(root, name);
      const destination = name === 'workspace' ? workspace : path.join(workspace, name);
      verifyRepo(source); // A missing component must not resolve upward to the workspace repository.
      validateDestinationAncestors(root, destination);
      const entry = state.repositories[name];
      if (entry) validateWorktree(entry, source, destination, branch);
      else {
        if (exists(destination)) throw new Error(`Worktree path already exists: ${destination}. Nothing was overwritten; choose another session key.`);
        if (git(source, 'branch', '--list', branch)) throw new Error(`Session branch already exists: ${branch} in ${source}. Nothing was overwritten; inspect it before choosing another key.`);
      }
    }

    const result = { session, workspace, repositories: {} };
    const synced = syncWorkspace({ root, sessionPath: state.repositories.workspace?.path ?? null });
    result.reorientation = { reportPath: synced.reportPath, report: synced.report };
    if (!state.repositories.workspace && synced.report.freshness.status !== 'fetched') {
      throw new Error(`Cannot start a fresh workspace without fetched guidance. Report: ${synced.reportPath}`);
    }

    try {
      ensureDirectory(path.join(root, 'worktrees'));
      ensureDirectory(path.join(root, 'worktrees', 'sessions'));
      for (const name of names) {
        const source = name === 'workspace' ? root : path.join(root, name);
        const destination = name === 'workspace' ? workspace : path.join(workspace, name);
        const entry = state.repositories[name];
        if (entry) {
          result.repositories[name] = { path: destination, branch, status: 'resumed' };
          continue;
        }
        let base;
        if (name === 'workspace') {
          // WHY: this immutable fetched OID is the authority already reported by sync;
          // fetching again would let session creation silently use a different commit.
          base = synced.report.freshness.fetchedOid;
        } else {
          const remoteRef = `refs/remotes/origin/${inventory[name].branch}`;
          // WHY: component fetch updates refs too, so reuse the private hook isolation
          // created by workspace sync instead of invoking repository-configured hooks.
          const hooks = path.join(synced.report.evidence.directory, 'disabled-hooks');
          git(source, '-c', `core.hooksPath=${hooks}`, 'fetch', '--no-tags', 'origin', `+refs/heads/${inventory[name].branch}:${remoteRef}`);
          base = git(source, 'rev-parse', remoteRef);
        }
        // WHY: branch/ref creation during worktree add is part of the same isolated
        // startup transaction and must not run repository-owned hooks either.
        const hooks = path.join(synced.report.evidence.directory, 'disabled-hooks');
        git(source, '-c', `core.hooksPath=${hooks}`, 'worktree', 'add', '-b', branch, destination, base);
        state.repositories[name] = { path: destination, branch, commonDir: commonDir(source), base };
        // Record each successful component immediately: later failures preserve work and
        // a retry resumes what succeeded. A crash before this save fails closed on collision.
        save(manifest, state);
        // After the manifest is saved: dependency provisioning is a convenience on
        // top of a committed worktree, so its failures must not roll the worktree back.
        const provisioned = provisionNodeModules(name, source, destination);
        result.repositories[name] = { path: destination, branch, status: 'created', ...(provisioned.length ? { provisioned } : {}) };
      }
      return result;
    } catch (error) {
      // Preserve successful workspace evidence when later component provisioning fails.
      throw new Error(`${error.message}\nWorkspace reorientation report: ${synced.reportPath}`);
    }
  } finally { fs.rmdirSync(lock); }
}

function main(args) {
  const opts = { root: fileURLToPath(new URL('..', import.meta.url)), repos: [] };
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help') {
      console.log('Usage: node scripts/workspace-start.mjs --session <stable-key> [workspace|youcoded|youcoded-core|youcoded-admin|wecoded-themes|wecoded-marketplace] [--root <workspace>] [--json]\nRe-use the same key to resume; add repository names as work expands. Startup fetches workspace guidance, and a guarded fast-forward may update the shared workspace when preservation is proven. No manual pull, stash, clean, commit, push or publish is performed.');
      return;
    }
    if (arg === '--session' || arg === '--root') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
      opts[arg.slice(2)] = args[++i];
    } else if (arg === '--json') json = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else opts.repos.push(arg);
  }
  const result = startWorkspace(opts);
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(formatBriefing(result.reorientation.report));
    console.log(`Report: ${result.reorientation.reportPath}\n`);
    console.log(`Session: ${result.session}`);
    for (const [name, repo] of Object.entries(result.repositories)) {
      console.log(`${name} (${repo.status}): ${repo.path}`);
      for (const note of repo.provisioned ?? []) console.log(`  deps: ${note}`);
    }
    console.log(`\nRead instructions and run scripts from ${result.workspace}.\nUse these absolute paths for file tools; this command cannot change their root or your shell's directory.\nUnfinished work is preserved. No worktrees are automatically removed. This is not a sandbox.`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(`workspace-start: ${error.message}\nAny worktrees already created were preserved; retry the same session key after resolving the error.`);
    process.exitCode = 1;
  }
}
