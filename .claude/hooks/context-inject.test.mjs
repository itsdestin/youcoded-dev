// Guard for the guard. Run: node --test .claude/hooks/context-inject.test.mjs
//
// WHY this exists: context-inject.sh reported active worktrees with a
// `find -maxdepth 1` for directories named *-worktree* / *-phase* / *-decoupling.
// Real worktrees live at worktrees/<name> (depth 2, names like plan-c), so the
// find matched nothing — and because the section header only printed when
// something was found, the block silently produced no output at all. Six live
// worktrees were invisible at every session start, and the absence was
// indistinguishable from "there are no worktrees".
//
// That is the failure shape this workspace keeps hitting: a check that stops
// checking goes quiet, not red (see also: the theme contrast audit dropping two
// rules while printing "All 11 themes pass"). A hook is code. Code that reports
// on state needs a test that gives it known state and asserts it says so.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const HOOK = path.resolve(import.meta.dirname, 'context-inject.sh');

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Build a throwaway workspace containing a `youcoded` sub-repo with one commit. */
function makeWorkspace() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-inject-'));
  const repo = path.join(ws, 'youcoded');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'master');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(repo, 'README.md'), '# test\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'init');
  return { ws, repo };
}

const runHook = (ws) =>
  execFileSync('bash', [HOOK], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: ws },
    encoding: 'utf8',
  });

test('worktree section is always present, and says "(none)" when there are none', () => {
  const { ws } = makeWorkspace();
  const out = runHook(ws);
  // The original bug was an ABSENT section reading as "no worktrees". These must differ.
  assert.match(out, /### Active worktrees/, 'section header must always print');
  assert.match(out, /\(none\)/, 'an empty list must say so explicitly');
  fs.rmSync(ws, { recursive: true, force: true });
});

test('a real worktree at worktrees/<name> is reported with its branch', () => {
  const { ws, repo } = makeWorkspace();
  const wtPath = path.join(ws, 'worktrees', 'plan-c');
  git(repo, 'worktree', 'add', '-q', '-b', 'feat/native-local-reliability', wtPath);

  const out = runHook(ws);
  assert.match(out, /### Active worktrees/);
  // This is the exact case the old `find` missed: depth 2, name matches no pattern.
  assert.match(out, /plan-c/, 'worktree at worktrees/<name> must be listed');
  assert.match(out, /feat\/native-local-reliability/, 'its branch must be shown');
  assert.doesNotMatch(out, /\(none\)/, 'must not claim there are none');
  fs.rmSync(ws, { recursive: true, force: true });
});

test('the main checkout is not listed as a worktree', () => {
  const { ws, repo } = makeWorkspace();
  git(repo, 'worktree', 'add', '-q', '-b', 'feat/x', path.join(ws, 'worktrees', 'x'));
  const out = runHook(ws);
  const section = out.slice(out.indexOf('### Active worktrees'));
  assert.doesNotMatch(section, /- youcoded \[/, 'the main checkout must be skipped');
  fs.rmSync(ws, { recursive: true, force: true });
});

test('an unregistered leftover directory under worktrees/ is flagged', () => {
  const { ws } = makeWorkspace();
  // Reproduces the real `worktrees/narrow-ui` husk: a directory git no longer knows about.
  fs.mkdirSync(path.join(ws, 'worktrees', 'narrow-ui', 'desktop'), { recursive: true });
  const out = runHook(ws);
  assert.match(out, /narrow-ui/, 'stale husk must be surfaced');
  assert.match(out, /unregistered leftover/, 'and named as such');
  fs.rmSync(ws, { recursive: true, force: true });
});

test('per-repo state still reports branch and recent commits', () => {
  const { ws } = makeWorkspace();
  const out = runHook(ws);
  assert.match(out, /### youcoded \(on `master`\)/);
  assert.match(out, /Recent commits:/);
  fs.rmSync(ws, { recursive: true, force: true });
});
