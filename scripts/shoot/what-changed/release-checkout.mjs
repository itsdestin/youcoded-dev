// A release tag as the "before" side of a what-changed run: a detached git worktree of the app
// repo at the tag, kept under the workspace's gitignored scratch/ and reused on later runs.
//
// WHY node_modules is a hardlink copy (`cp -al`) of the after checkout's, never a link to it and
// never a fresh install: workspace rule (docs/PITFALLS.md -> Worktrees). That is only valid when
// the two lockfiles are identical, so a differing lockfile is refused with a clear message
// instead of building the old app against the wrong packages.
//
// Remove it later:  git -C youcoded worktree remove --force scratch/release-<tag>
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const git = (repo, ...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });

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
  if (diff.status === 1) throw new Error(`${lock} differs between ${tag} and ${afterCheckout}: the old app would be built with the wrong packages. Install the old release's packages by hand or compare a closer release.`);
  if (diff.status !== 0) throw new Error(`could not compare ${lock} with ${tag}: ${(diff.stderr || '').trim()}`);
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
  return { dir: dest, commit: sha };
}
