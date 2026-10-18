#!/usr/bin/env node
// Session startup provisions new worktrees; maintenance of shared checkouts stays in setup.sh.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { formatBriefing, syncWorkspace, verifyWorkspaceIdentity } from './workspace-sync.mjs';
import { sweep, formatSweep } from './prune-worktrees.mjs';
import { provisionDependencies } from './workspace-dependencies.mjs';

const inventory = JSON.parse(fs.readFileSync(new URL('./workspace-repos.json', import.meta.url), 'utf8'));
function git(root, ...args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    throw new Error(`git ${args.join(' ')} (${root}): ${String(error.stderr || error.message).trim()}`);
  }
}
function exists(p) { try { fs.lstatSync(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
function gitOk(root, ...args) {
  try { execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' }); return true; } catch { return false; }
}
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

// Only configured npm projects are provisioned; other components have no dependency step.
const NODE_MODULES_PROVISIONS = { youcoded: ['desktop'] };

// Compatibility entry point for scripts/fill-missing-deps.mjs: exact provisioning, not
// selective npm-pack repairs. Failures deliberately propagate to the command's exit code.
export function fillMissingPackages(componentDir) {
  return provisionDependencies(componentDir, path.join(commonDir(componentDir), 'youcoded-dependencies'));
}

function provisionNodeModules(name, source, destination) {
  const notes = [];
  for (const sub of NODE_MODULES_PROVISIONS[name] ?? []) {
    // WHY use the destination's inputs: a resumed branch can require older dependencies
    // than today's shared master. Immutable generations serve both without changing either.
    notes.push(...provisionDependencies(path.join(destination, sub), path.join(commonDir(source), 'youcoded-dependencies')));
  }
  return notes;
}
function topUpNodeModules(name, destination) {
  return provisionNodeModules(name, destination, destination);
}
// WHY (2026-09-20): a shared component checkout is not only a git object source.
// Analytics reads built-in themes and the analytics salt straight off its WORKING TREE,
// and it is the hardlink source for every new node_modules. Nothing ever moved its
// branch, so on 2026-09-20 the shared app checkout was found 511 commits behind with
// those readers quietly consuming stale files.
//
// A strict fast-forward of a clean, on-branch, strictly-behind checkout is the one
// update that cannot lose work: it writes no merge commit, replays nothing, and refuses
// the instant a local commit exists. Every other shape -- diverged, dirty, mid-rebase,
// detached, or parked on another branch -- is a human decision and is only reported.
// Linked worktrees are untouched either way: they sit on their own session branches.
export function refreshComponentCheckout(source, branchName, hooks) {
  const fetchRef = `+refs/heads/${branchName}:refs/remotes/origin/${branchName}`;
  // WHY core.hooksPath: ref updates here must not run repository-configured hooks,
  // matching the isolation the rest of startup already uses.
  const iso = ['-c', `core.hooksPath=${hooks}`];
  try { git(source, ...iso, 'fetch', '--no-tags', 'origin', fetchRef); }
  catch (error) { return { status: 'skipped', detail: `fetch failed: ${error.message}` }; }

  const target = git(source, 'rev-parse', `refs/remotes/origin/${branchName}`);

  let head;
  try { head = git(source, 'rev-parse', '--abbrev-ref', 'HEAD'); }
  catch { return { status: 'skipped', detail: 'HEAD is unreadable' }; }
  if (head === 'HEAD') return { status: 'skipped', detail: 'detached HEAD' };
  if (head !== branchName) return { status: 'skipped', detail: `on ${head}, not ${branchName}` };

  // An interrupted git operation owns the index and the branch; never move it underneath.
  const gitDir = git(source, 'rev-parse', '--absolute-git-dir');
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'BISECT_LOG', 'rebase-merge', 'rebase-apply']) {
    if (exists(path.join(gitDir, marker))) return { status: 'skipped', detail: `git operation in progress (${marker})` };
  }

  const current = git(source, 'rev-parse', 'HEAD');
  if (current === target) return { status: 'current' };

  // Strictly behind, or nothing doing. This is what refuses the 2026-09-14 stranded
  // commit rather than discarding it: patch-equivalence is not authority to rewrite.
  if (!gitOk(source, 'merge-base', '--is-ancestor', current, target)) {
    const [local, remote] = git(source, 'rev-list', '--left-right', '--count', `${current}...${target}`).split(/\s+/);
    return { status: 'diverged', detail: `${local} local-only, ${remote} incoming — reconcile by hand`, local: Number(local), incoming: Number(remote) };
  }

  // Dirty is checked LAST so a behind-and-dirty checkout still reports the real reason.
  if (git(source, 'status', '--porcelain')) return { status: 'skipped', detail: 'working tree has uncommitted changes' };

  try { git(source, ...iso, 'merge', '--ff-only', target); }
  catch (error) { return { status: 'skipped', detail: `fast-forward refused: ${error.message}` }; }
  return { status: 'fast-forwarded', from: current.slice(0, 8), to: target.slice(0, 8) };
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
        // Refresh the SHARED checkout before create-or-resume: a resumed session's
        // readers depend on it being current just as much as a new one's do.
        let refreshed = null;
        if (name !== 'workspace') {
          refreshed = refreshComponentCheckout(source, inventory[name].branch, path.join(synced.report.evidence.directory, 'disabled-hooks'));
        }
        const entry = state.repositories[name];
        if (entry) {
          // Recompute from this preserved branch's inputs, not the shared master's.
          // Unmanaged or locally patched dependencies are preserved and reported, never replaced.
          const toppedUp = topUpNodeModules(name, destination);
          result.repositories[name] = { path: destination, branch, status: 'resumed', ...(toppedUp.length ? { provisioned: toppedUp } : {}), ...(refreshed ? { shared: refreshed } : {}) };
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
        // Save ownership first: dependency failure exits nonzero but leaves a resumable
        // worktree, rather than rolling back source files or claiming a ready environment.
        const provisioned = provisionNodeModules(name, source, destination);
        result.repositories[name] = { path: destination, branch, status: 'created', ...(provisioned.length ? { provisioned } : {}), ...(refreshed ? { shared: refreshed } : {}) };
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
      console.log('Usage: node scripts/workspace-start.mjs --session <stable-key> [workspace|youcoded|youcoded-core|youcoded-admin|wecoded-themes|wecoded-marketplace] [--item <id>] [--root <workspace>] [--json]\n--item records this chat on that work item (its branch, and a line under Chats); name the session after the item, e.g. --session 75-project-skills.\nRe-use the same key to resume; add repository names as work expands. Startup fetches workspace guidance, and a guarded fast-forward may update the shared workspace when preservation is proven. No manual pull, stash, clean, commit, push or publish is performed.');
      return;
    }
    if (arg === '--session' || arg === '--root' || arg === '--item') {
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
      const shared = repo.shared;
      if (shared && shared.status === 'fast-forwarded') console.log(`  shared checkout: fast-forwarded ${shared.from} -> ${shared.to}`);
      else if (shared && shared.status === 'diverged') console.log(`  shared checkout: DIVERGED — ${shared.detail}`);
      else if (shared && shared.status === 'skipped') console.log(`  shared checkout: left alone — ${shared.detail}`);
    }
    console.log(`\nRead instructions and run scripts from ${result.workspace}.\nUse these absolute paths for file tools; this command cannot change their root or your shell's directory.\nUnfinished work is preserved. Only merged, clean, unused worktrees idle 3+ days are removed automatically. This is not a sandbox.`);
  }
  runWorktreeSweep(opts.root, result.session, json);
  if (opts.item) linkItem(result.workspace, opts.item, result.session, json);
}

// WHY (Destin, plan deck Q-4, 2026-10-16: "several chats on one item" must be tracked): a chat that starts
// work on an item records itself there — its branch under `work:` and a dated line under Chats — so the
// management page can show every chat on the item and its live markers. It goes through cards.mjs, which
// saves straight to master once master carries the items. A failure only prints: starting work matters more.
function linkItem(workspace, item, session, json) {
  try {
    const out = execFileSync(process.execPath, [path.join(workspace, 'scripts', 'cards.mjs'), 'link', String(item).replace(/^#/, ''), '--branch', `session/${session}`, '--line', 'chat started'],
      { cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    (json ? console.error : console.log)(`\nwork item: ${out}`);
  } catch (error) {
    console.error(`\nwork item: not recorded — ${String(error.stderr || error.message).trim().split('\n')[0]}`);
  }
}

// WHY at session start (2026-10-08): cleanup used to happen only when a branch merged, so
// sessions that never merge themselves piled up to ~100 GB and filled the disk. Every
// development session starts here, so this is the one place that reliably runs. The sweep
// deletes only merged, clean, unused worktrees idle 3+ days (prune-worktrees.mjs → sweep)
// and never this session's own. A failure here must never block starting work, so it only
// prints. YOUCODED_NO_WORKTREE_SWEEP=1 turns it off.
function runWorktreeSweep(root, session, json) {
  if (process.env.YOUCODED_NO_WORKTREE_SWEEP === '1') return;
  try {
    const out = formatSweep(sweep({ root, inventory, excludeKeys: [session] }));
    if (out) (json ? console.error : console.log)(`\n${out}`); // WHY stderr under --json: stdout must stay parseable JSON
  } catch (error) {
    console.error(`worktree sweep skipped: ${error.message}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(`workspace-start: ${error.message}\nAny worktrees already created were preserved; retry the same session key after resolving the error.`);
    process.exitCode = 1;
  }
}
