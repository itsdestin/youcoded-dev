// A release tag as the "before" side of a what-changed run: a detached git worktree of the app
// repo at the tag, kept under the workspace's gitignored scratch/ and reused on later runs.
//
// WHY node_modules is a hardlink copy (`cp -al`) of the after checkout's, never a link to it and
// never a fresh install: workspace rule (docs/PITFALLS.md -> Worktrees). Both sides therefore use
// TODAY's packages. When the lockfiles differ the run goes ahead and names the changed packages
// (run.json `packagesDiffer`, and the summary), because a look change that comes only from a
// package update cannot show (see the WHY at the lockfile check below).
//
// Remove it later:  git -C youcoded worktree remove --force scratch/release-<tag>
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const git = (repo, ...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });

/** Names of the packages whose version differs between the tag's lockfile and the checkout's. */
function changedPackages(checkout, tag, lock) {
  try {
    const old = JSON.parse(git(checkout, 'show', `${tag}:${lock}`).stdout).packages ?? {};
    const now = JSON.parse(readFileSync(join(checkout, lock), 'utf8')).packages ?? {};
    return [...new Set([...Object.keys(old), ...Object.keys(now)])].filter((k) => k && old[k]?.version !== now[k]?.version)
      .map((k) => k.replace(/^.*node_modules\//, '')).filter((v, i, all) => all.indexOf(v) === i).sort();
  } catch { return ['(could not read the lockfiles)']; }
}

/** The newest `v*` tag of the app repo, or null. */
export function latestReleaseTag(appRepo) {
  const r = git(appRepo, 'tag', '--list', 'v*', '--sort=-v:refname');
  return r.status === 0 ? (r.stdout.split('\n').map((x) => x.trim()).filter(Boolean)[0] ?? null) : null;
}

/**
 * Returns the folder of a checkout of `tag` (it holds desktop/), making it if needed.
 * appRepo: the app's git folder (<workspace>/youcoded). afterCheckout: the code being compared
 * (its desktop/node_modules is copied, its package-lock.json must match the tag's).
 * Throws an Error with a plain message on every refusal.
 */
export function prepareReleaseCheckout({ appRepo, tag, afterCheckout, scratchRoot }) {
  const commit = git(appRepo, 'rev-parse', '--verify', '--quiet', `${tag}^{commit}`);
  if (commit.status !== 0) {
    const have = git(appRepo, 'tag', '--list', 'v*', '--sort=-v:refname').stdout.split('\n').filter(Boolean).slice(0, 5).join(', ');
    throw new Error(`there is no release tag "${tag}" in ${appRepo} (newest tags: ${have || 'none'})`);
  }
  const sha = commit.stdout.trim();
  // Lockfile: tag vs the after checkout's file on disk (so an uncommitted change counts too).
  const lock = 'desktop/package-lock.json';
  const diff = git(afterCheckout, 'diff', '--quiet', tag, '--', lock);
  if (diff.status !== 0 && diff.status !== 1) throw new Error(`could not compare ${lock} with ${tag}: ${(diff.stderr || '').trim()}`);
  // WHY a recorded limit, not a refusal (2026-11-07: master moved to Electron 44 and updated 66 packages
  // since v1.3.3, so every later release comparison was refused): both sides are photographed with the SAME
  // installed packages, so the comparison shows what the app's own code changed. What it cannot show is a
  // look change that comes only from a package update; run.json and the summary say so.
  const packagesDiffer = diff.status === 1 ? changedPackages(afterCheckout, tag, lock) : [];
  const nm = join(afterCheckout, 'desktop', 'node_modules');
  if (!existsSync(nm)) throw new Error(`${nm} is missing — run workspace-start for the after checkout first (its packages are copied for the old release)`);

  const dest = join(scratchRoot, `release-${tag}`);
  if (existsSync(dest)) {
    const have = git(dest, 'rev-parse', 'HEAD');
    if (have.status !== 0 || have.stdout.trim() !== sha) throw new Error(`${dest} exists but is not ${tag} (${sha.slice(0, 9)}). Remove it: git -C ${appRepo} worktree remove --force ${dest}`);
  } else {
    mkdirSync(scratchRoot, { recursive: true });
    const add = git(appRepo, 'worktree', 'add', '--detach', dest, tag);
    if (add.status !== 0) throw new Error(`git worktree add failed: ${(add.stderr || '').trim()}`);
  }
  const target = join(dest, 'desktop', 'node_modules');
  if (!existsSync(target)) {
    const cp = spawnSync('cp', ['-al', nm, target], { encoding: 'utf8' });
    if (cp.status !== 0) throw new Error(`linking node_modules into ${dest} failed: ${cp.stderr}`);
  }
  return { dir: dest, commit: sha, packagesDiffer };
}
