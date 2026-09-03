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

// --- worktree annotations (2026-08-28) ---------------------------------------
// 22 of 55 sessions in the 2026-08-26→28 audit re-derived dirty/ahead per worktree
// with their own git calls. The branch name alone never answered the question they
// were actually asking, which is "is there work in here, and has it landed yet".

test('a worktree reports its uncommitted file count', () => {
  const { ws, repo } = makeWorkspace();
  const wtPath = path.join(ws, 'worktrees', 'plan-c');
  git(repo, 'worktree', 'add', '-q', '-b', 'feat/x', wtPath);
  fs.writeFileSync(path.join(wtPath, 'scratch.txt'), 'in progress\n');
  const out = runHook(ws);
  assert.match(out, /plan-c .*1 uncommitted file\(s\)/, 'dirty count must be reported');
  fs.rmSync(ws, { recursive: true, force: true });
});

test('a worktree with no upstream says so instead of printing a bare comma', () => {
  // The throwaway repo has no `origin`, so the ahead-count cannot be computed.
  // An unknown must read as unknown — the earlier draft emitted "— , 1 file(s)".
  const { ws, repo } = makeWorkspace();
  const wtPath = path.join(ws, 'worktrees', 'plan-c');
  git(repo, 'worktree', 'add', '-q', '-b', 'feat/x', wtPath);
  const out = runHook(ws);
  assert.match(out, /plan-c .*no upstream to compare against/);
  assert.doesNotMatch(out, /— ,/, 'never emit an empty leading clause');
  fs.rmSync(ws, { recursive: true, force: true });
});

// --- orientation block (2026-08-28) ------------------------------------------
// MAP.md was consulted in 39 of 55 sessions but at MEDIAN tool call #20. The block
// is GENERATED from MAP.md so it cannot drift; these tests pin that it is generated
// and not, say, a copy that silently stops matching the map.

const MAP_FIXTURE = `# Workspace Map

| Subsystem | Entry points | Rule | Depth doc | Guard tests |
|---|---|---|---|---|
| Chat & transcript | \`youcoded/desktop/src/renderer/state/chat-reducer.ts\`<br>\`youcoded/desktop/src/main/transcript-watcher.ts\` | chat-reducer | \`youcoded/docs/chat-reducer.md\` | manual |
| Build & release | \`youcoded/app/build.gradle.kts\` (with a note) | — | \`docs/build-and-release.md\` | manual |

## Hot paths — the exact file, without a search

Prose that explains why this table exists and must NOT be injected.

| You'd call it | File |
|---|---|
| quick chips | \`youcoded/desktop/src/renderer/components/QuickChips.tsx\` |

**Four files are too big to read whole** — query symbols.

## On-disk state — what the app writes on this machine

More prose that must not be injected.

| Path | What's in it | Defined in |
|---|---|---|
| \`~/.youcoded/config.json\` | settings | \`youcoded/desktop/src/main/native-home.ts\` |
`;

test('the orientation block is generated from MAP.md, first entry point only', () => {
  const { ws } = makeWorkspace();
  fs.mkdirSync(path.join(ws, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'docs', 'MAP.md'), MAP_FIXTURE);
  const out = runHook(ws);

  assert.match(out, /### Subsystems — open this file first/);
  assert.match(
    out,
    /Chat & transcript -> youcoded\/desktop\/src\/renderer\/state\/chat-reducer\.ts {2}\[chat-reducer\]/,
    'subsystem row collapses to its FIRST entry point plus the rule',
  );
  assert.doesNotMatch(out, /transcript-watcher/, 'later entry points are not injected');
  assert.match(out, /Build & release -> youcoded\/app\/build\.gradle\.kts {2}\[no rule\]/,
    'a trailing parenthetical is dropped and an em-dash rule reads as "no rule"');

  // Both lookup tables, rows and bold callouts only.
  assert.match(out, /quick chips \| `youcoded\/desktop\/src\/renderer\/components\/QuickChips\.tsx`/);
  assert.match(out, /`~\/\.youcoded\/config\.json`/);
  assert.match(out, /\*\*Four files are too big to read whole\*\*/);
  assert.doesNotMatch(out, /must NOT be injected|must not be injected/, 'MAP prose stays in MAP');
  assert.doesNotMatch(out, /^\|---/m, 'table separator rows are stripped');

  fs.rmSync(ws, { recursive: true, force: true });
});

test('a missing MAP.md prints no orientation heading at all', () => {
  // Half a block is worse than none: a header with nothing under it reads as
  // "there is nothing to know here", the same failure shape as the vanished
  // worktree section this file was written for.
  const { ws } = makeWorkspace();
  const out = runHook(ws);
  assert.doesNotMatch(out, /Where things are/);
  fs.rmSync(ws, { recursive: true, force: true });
});

// --- audit staleness (2026-09-01) --------------------------------------------
// ROADMAP L184: the selector took the newest audit BY FILENAME, which was the July
// mechanical baseline (`scope: baseline`, `residue: 0`). It shadowed the real,
// 125-day-old report, so neither warning fired for six weeks — the same "a check
// that stops checking goes quiet" shape as the worktree section above.

/** A workspace with a real report and a baseline whose NAME sorts newer. */
function makeAudits(ws, realResidue) {
  const dir = path.join(ws, 'docs', 'audits');
  fs.mkdirSync(dir, { recursive: true });
  const real = path.join(dir, '2026-04-23.md');
  fs.writeFileSync(real, `---\ndate: 2026-04-23\nscope: full\nresidue: ${realResidue}\n---\n# Audit\n`);
  // Dated AFTER the real report, so a plain `sort | tail -1` picks it.
  const baseline = path.join(dir, '2026-09-01-phase9-baseline.md');
  fs.writeFileSync(baseline, '---\ndate: 2026-09-01\nscope: baseline (mechanical only)\nresidue: 0\n---\n# Baseline\n');
  // No git history in the throwaway workspace, so the hook falls back to mtime.
  const hundredDaysAgo = (Date.now() - 100 * 86400 * 1000) / 1000;
  fs.utimesSync(real, hundredDaysAgo, hundredDaysAgo);
  const now = Date.now() / 1000;
  fs.utimesSync(baseline, now, now);
  return { real, baseline };
}

test('a newer-named baseline does not shadow the real report: staleness fires on the real one', () => {
  const { ws } = makeWorkspace();
  makeAudits(ws, 0);
  const out = runHook(ws);
  assert.match(out, /### ⚠️ Audit staleness/, 'a 100-day-old real report must warn');
  assert.match(out, /Latest audit \(2026-04-23\.md\) is 100 days old/, 'and name the REAL report');
  assert.doesNotMatch(out, /phase9-baseline/, 'the baseline is never the "latest audit"');
  fs.rmSync(ws, { recursive: true, force: true });
});

test('residue is read from the real report, not the baseline\'s residue: 0', () => {
  const { ws } = makeWorkspace();
  makeAudits(ws, 3);
  const out = runHook(ws);
  assert.match(out, /### ⚠️ Unapplied audit findings/);
  assert.match(out, /3 open item\(s\) in 2026-04-23\.md/);
  fs.rmSync(ws, { recursive: true, force: true });
});

test('a fresh real report with residue: 0 stays silent', () => {
  // The other half of the guard: the fix must not turn every session start into a warning.
  const { ws } = makeWorkspace();
  const { real } = makeAudits(ws, 0);
  const now = Date.now() / 1000;
  fs.utimesSync(real, now, now);
  const out = runHook(ws);
  assert.doesNotMatch(out, /Audit staleness|Unapplied audit findings/);
  fs.rmSync(ws, { recursive: true, force: true });
});
