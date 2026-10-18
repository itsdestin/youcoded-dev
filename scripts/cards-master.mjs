// cards-master.mjs — every change to the work items is saved straight to master, from one dedicated copy.
//
// WHY (Destin, work-cards-next deck Q-5, 2026-10-16: "Straight to master"): while chats edited items on their
// own branches, each saw a different list until it merged, and the shared checkout refuses every commit by
// design, so the management page's bulk edit had nowhere to save after merge. Now one copy of master,
// `worktrees/cards-master`, takes each item change, checks the whole set, commits it and pushes it to master
// at once — no pull request. The page and every chat see the same list within seconds.
//
// The copy holds nothing but item changes, so it is reset to origin/master before every edit; a push that
// loses a race to another chat is retried from the new master, so neither change is lost.
//
// Tests: node --test scripts/cards-master.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadCards, check, CARDS_DIR, SHIPPED } from './cards.mjs';

export const MASTER_COPY = path.join('worktrees', 'cards-master');

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** The main workspace folder (the one holding worktrees/), from any checkout inside it. */
export function workspaceOf(dir) {
  return path.dirname(git(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
}

/** Does master already carry the items? Before the work-items branch merges it does not, and edits stay local. */
export function masterHasCards(workspace, { remote = 'origin', branch = 'master' } = {}) {
  try { git(workspace, ['cat-file', '-e', `${remote}/${branch}:${CARDS_DIR}`]); return true; } catch { return false; }
}

/** The dedicated copy, created on first use, detached at the remote's master (master itself is checked out
 *  in the shared folder, and git allows a branch in one place only). */
export function masterCopy(workspace, { remote = 'origin', branch = 'master' } = {}) {
  const dir = path.join(workspace, MASTER_COPY);
  if (!fs.existsSync(path.join(dir, '.git'))) {
    git(workspace, ['fetch', '-q', remote, branch]);
    git(workspace, ['worktree', 'add', '-q', '--detach', dir, `${remote}/${branch}`]);
  }
  return dir;
}

/**
 * Apply `edit(copyDir)` to the newest master, check every item, commit and push. Returns
 * { result, commit, pushed } where result is whatever edit returned. Throws (changing nothing on master)
 * when the edit throws or breaks a rule. `message` is the commit's subject.
 */
export function onMaster(workspace, message, edit, { remote = 'origin', branch = 'master', tries = 3 } = {}) {
  const dir = masterCopy(workspace, { remote, branch });
  let lastError = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    git(dir, ['fetch', '-q', remote, branch]);
    // WHY reset, not merge: this copy exists only to carry item changes, so anything in it beyond master is a
    // half-finished earlier attempt — starting clean from master is what makes a retry safe.
    git(dir, ['reset', '-q', '--hard', `${remote}/${branch}`]);
    git(dir, ['clean', '-q', '-fd', '--', CARDS_DIR]);
    const result = edit(dir);
    const errs = check(loadCards(dir));
    if (errs.length) { git(dir, ['reset', '-q', '--hard', `${remote}/${branch}`]); throw new Error(errs.join('\n')); }
    const paths = [CARDS_DIR, SHIPPED].filter((p) => fs.existsSync(path.join(dir, p)));
    git(dir, ['add', '-A', '--', ...paths]);
    if (!git(dir, ['status', '--porcelain', '--', ...paths])) return { result, commit: null, pushed: false };
    // WHY: automatic card saves must keep the same required footer as manual assistant commits.
    git(dir, ['commit', '-q', '-m', `${message}\n\nCo-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>\n\nSubmitted via YouCoded Assistant`, '--', ...paths]);
    try {
      git(dir, ['push', '-q', remote, `HEAD:${branch}`]);
      return { result, commit: git(dir, ['rev-parse', '--short', 'HEAD']), pushed: true };
    } catch (e) {
      // Another chat saved first: start again from its master.
      lastError = e;
    }
  }
  throw new Error(`Could not save to ${branch} after ${tries} tries: ${String(lastError?.stderr || lastError?.message || '').split('\n')[0]}`);
}
