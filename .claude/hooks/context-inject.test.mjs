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

test('startup reminder requires report review and distinguishes guidance authority without syncing', () => {
  const { ws } = makeWorkspace();
  fs.mkdirSync(path.join(ws, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'scripts', 'workspace-start.mjs'), '// fixture marker\n');
  const hook = fs.readFileSync(HOOK, 'utf8');
  const out = runHook(ws);

  assert.match(out, /reorientation report and changed guidance/);
  assert.match(out, /Uncommitted guidance is a proposal, not automatically authoritative/);
  assert.match(hook, /as of the last fetch/);
  assert.match(hook, /^export GIT_OPTIONAL_LOCKS=0$/m,
    'every hook Git read must disable optional index locking and refresh');
  assert.doesNotMatch(hook, /\bgit\s+(?:-[^\n ]+\s+)*(?:fetch|pull|update-index)\b|--refresh\b|workspace-sync\.(?:mjs|sh)/,
    'the read-only hook must not fetch, pull, refresh the index, or invoke sync');
  fs.rmSync(ws, { recursive: true, force: true });
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

test('a worktree with nothing to compare against says so instead of printing a bare comma', () => {
  // The throwaway repo has no `origin`, so the ahead-count cannot be computed.
  // An unknown must read as unknown — the earlier draft emitted "— , 1 file(s)".
  //
  // The wording changed 2026-09-10, deliberately: it used to say "no upstream to
  // compare against", and "upstream" is exactly the word that caused the
  // confusion this hook was fixed for. A missing upstream says nothing about
  // whether work is backed up; a missing ORIGIN is what stops the comparison.
  const { ws, repo } = makeWorkspace();
  const wtPath = path.join(ws, 'worktrees', 'plan-c');
  git(repo, 'worktree', 'add', '-q', '-b', 'feat/x', wtPath);
  const out = runHook(ws);
  assert.match(out, /plan-c .*cannot compare against/);
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

// 2026-09-05: `youcoded` still had a worktree registered at a session scratchpad
// under /tmp that a reboot had cleared. Every git call against that path exits
// 128, and under `set -euo pipefail` the `status --porcelain | wc -l` PIPELINE
// took the WHOLE hook down — after the worktree list, before "Where things are".
// So every session started blind to the orientation block while CLAUDE.md and
// MAP.md both stated it had been injected. Silent, again: a hook that stops
// early is indistinguishable from a hook with nothing more to say.
test('a worktree whose directory is gone does not kill the rest of the hook', () => {
  const { ws, repo } = makeWorkspace();
  // The orientation block is generated from docs/MAP.md — it is the part that
  // vanished, so the fixture needs one for the assertion to mean anything.
  fs.mkdirSync(path.join(ws, 'docs'), { recursive: true });
  fs.writeFileSync(
    path.join(ws, 'docs', 'MAP.md'),
    ['| Subsystem | Entry points | Rule | Depth | Guards |',
     '|---|---|---|---|---|',
     '| Chat | `a/b.ts` | chat-reducer | — | — |',
     '',
     '## Hot paths',
     '',
     "| You'd call it | File |",
     '|---|---|',
     '| the thing | `a/b.ts` |',
     ''].join('\n'),
  );
  const gone = path.join(ws, 'worktrees', 'vanished');
  git(repo, 'worktree', 'add', '-q', '-b', 'feat/gone', gone);
  fs.rmSync(gone, { recursive: true, force: true });

  // execFileSync throws on a non-zero exit, so the old hook fails here outright.
  const out = runHook(ws);
  assert.match(out, /vanished.*directory is gone/, 'must name the stale registration, so it gets pruned');
  assert.match(out, /Where things are/, 'the orientation block must still print');
  assert.doesNotMatch(out, /stopped early/, 'the hook must reach its own end');
  fs.rmSync(ws, { recursive: true, force: true });
});

// --- what can actually be LOST ---------------------------------------------
// The worktree list used to report "N commit(s) ahead" and leave the reader to
// infer backup status from it. Ahead of master and absent from the server are
// different facts: `git push origin <branch>` without -u backs the work up and
// sets no upstream, so a fully-pushed branch stays N ahead forever. On
// 2026-09-10, 77 branches across three repos read as local-only and every one
// was already on the server.

/** A workspace whose repo has a real bare origin — "pushed" needs a remote. */
function makeWorkspaceWithRemote() {
  const { ws, repo } = makeWorkspace();
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-inject-remote-'));
  git(remote, 'init', '-q', '--bare', '-b', 'master');
  git(repo, 'remote', 'add', 'origin', remote);
  git(repo, 'push', '-q', '-u', 'origin', 'master');
  git(repo, 'remote', 'set-head', 'origin', 'master');
  return { ws, repo, remote };
}

test('a worktree whose commits are PUSHED (without -u) is not flagged as at risk', () => {
  const { ws, repo, remote } = makeWorkspaceWithRemote();
  const wtPath = path.join(ws, 'worktrees', 'pushed');
  git(repo, 'worktree', 'add', '-q', '-b', 'session/pushed-no-u', wtPath);
  fs.writeFileSync(path.join(wtPath, 'work.txt'), 'done\n');
  git(wtPath, 'add', 'work.txt');
  git(wtPath, 'commit', '-q', '-m', 'work');
  git(wtPath, 'push', '-q', 'origin', 'session/pushed-no-u');   // deliberately no -u
  const out = runHook(ws);
  assert.match(out, /session\/pushed-no-u/, 'the worktree must still be listed');
  assert.doesNotMatch(out, /EXIST ONLY HERE/,
    'the commit is on the server — saying otherwise is the false alarm this fixes');
  assert.match(out, /- pushed \[/, 'a backed-up worktree gets the plain marker, not the warning one');
  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(remote, { recursive: true, force: true });
});

test('a worktree holding a commit NO remote has is flagged loudly', () => {
  const { ws, repo, remote } = makeWorkspaceWithRemote();
  const wtPath = path.join(ws, 'worktrees', 'local-only');
  git(repo, 'worktree', 'add', '-q', '-b', 'session/local-only', wtPath);
  fs.writeFileSync(path.join(wtPath, 'work.txt'), 'never pushed\n');
  git(wtPath, 'add', 'work.txt');
  git(wtPath, 'commit', '-q', '-m', 'local only');
  const out = runHook(ws);
  assert.match(out, /EXIST ONLY HERE/, 'work on one disk only must say so in words');
  assert.match(out, /⚠ local-only \[/, 'and must carry the warning marker');
  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(remote, { recursive: true, force: true });
});

test('uncommitted files carry the warning marker even when everything is pushed', () => {
  // A ref sweep is structurally blind to a working tree; a full day of finished
  // work was lost that way (2026-09-01). Committed is not the same as saved.
  const { ws, repo, remote } = makeWorkspaceWithRemote();
  const wtPath = path.join(ws, 'worktrees', 'dirty');
  git(repo, 'worktree', 'add', '-q', '-b', 'session/dirty', wtPath);
  fs.writeFileSync(path.join(wtPath, 'in-progress.txt'), 'unsaved\n');
  const out = runHook(ws);
  assert.match(out, /⚠ dirty \[/, 'uncommitted work is the case no push rule can reach');
  assert.match(out, /1 uncommitted file\(s\)/);
  // 2026-09-11: a folder with nothing committed but unsaved files was labelled
  // "candidate for cleanup" — the one label that invites deleting the only copy.
  assert.doesNotMatch(out, /dirty \[[^\n]*candidate for cleanup/,
    'a worktree holding unsaved files must never be offered up for cleanup');
  assert.match(out, /dirty \[[^\n]*NOT a cleanup candidate/);
  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(remote, { recursive: true, force: true });
});
