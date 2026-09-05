#!/usr/bin/env node
// Session startup provisions new worktrees; maintenance of shared checkouts stays in setup.sh.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  root = primaryRoot(path.resolve(root));
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
    // Preflight ALL requested sources before creating any worktree. A missing component
    // must not resolve upward to the containing workspace's Git repository.
    for (const name of names) {
      if (!Object.hasOwn(inventory, name)) throw new Error(`Unknown repository in manifest: ${name}`);
      verifyRepo(name === 'workspace' ? root : path.join(root, name));
    }
    ensureDirectory(path.join(root, 'worktrees'));
    ensureDirectory(path.join(root, 'worktrees', 'sessions'));
    const result = { session, workspace, repositories: {} };
    for (const name of names) {
      const source = name === 'workspace' ? root : path.join(root, name);
      const destination = name === 'workspace' ? workspace : path.join(workspace, name);
      const entry = state.repositories[name];
      if (entry) {
        validateWorktree(entry, source, destination, branch);
        result.repositories[name] = { path: destination, branch, status: 'resumed' };
        continue;
      }
      if (exists(destination)) throw new Error(`Worktree path already exists: ${destination}. Nothing was overwritten; choose another session key.`);
      if (git(source, 'branch', '--list', branch)) throw new Error(`Session branch already exists: ${branch} in ${source}. Nothing was overwritten; inspect it before choosing another key.`);
      const remoteRef = `refs/remotes/origin/${inventory[name].branch}`;
      // Fetch only: never pull/reset/stash the shared checkout. Existing sessions skip
      // this entirely so resuming unfinished work also works without a network.
      git(source, 'fetch', '--no-tags', 'origin', `+refs/heads/${inventory[name].branch}:${remoteRef}`);
      const base = git(source, 'rev-parse', remoteRef);
      git(source, 'worktree', 'add', '-b', branch, destination, base);
      state.repositories[name] = { path: destination, branch, commonDir: commonDir(source), base };
      // Record each successful component immediately: later failures preserve work and
      // a retry resumes what succeeded. A crash before this save fails closed on collision.
      save(manifest, state);
      result.repositories[name] = { path: destination, branch, status: 'created' };
    }
    return result;
  } finally { fs.rmdirSync(lock); }
}

function main(args) {
  const opts = { root: fileURLToPath(new URL('..', import.meta.url)), repos: [] };
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help') {
      console.log('Usage: node scripts/workspace-start.mjs --session <stable-key> [workspace|youcoded|youcoded-core|youcoded-admin|wecoded-themes|wecoded-marketplace] [--root <workspace>] [--json]\nRe-use the same key to resume; add repository names as work expands. No shared checkout is pulled or cleaned.');
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
    console.log(`Session: ${result.session}`);
    for (const [name, repo] of Object.entries(result.repositories)) console.log(`${name} (${repo.status}): ${repo.path}`);
    console.log(`\nRead instructions and run scripts from ${result.workspace}.\nUse these absolute paths for file tools; this command cannot change their root or your shell's directory.\nUnfinished work is preserved. No worktrees are automatically removed. This is not a sandbox.`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(`workspace-start: ${error.message}\nAny worktrees already created were preserved; retry the same session key after resolving the error.`);
    process.exitCode = 1;
  }
}
