# Brief: pinning tests for the D1/D2 review fixes

Worktree: /home/destin/youcoded-dev/worktrees/specialists-1c (branch feat/specialists-1c-ui).
The source changes are ALREADY MADE and uncommitted — see review-fix-diff.patch beside
this file. Your job is ONLY to add tests that pin each fix, run them, and commit
source + tests together. Do not change the source unless a test proves it wrong
(then report it, don't silently redesign).

## The four fixes (what to pin)

### 1. Resume refuses a helper whose definition file changed since hire
Files: `src/main/harness/native-session-host.ts` (`resumeSpecialist`),
`src/main/harness/specialists/delegation-ledger.ts` (`DelegationRecord.definitionFingerprint`),
`src/main/harness/tools/task.ts` (both resume branches handle `status: 'definition-changed'`),
`src/main/harness/tools/types.ts` (`SpecialistResumeOutcome` union).
Pin in `tests/native-session-host.test.ts` (follow its existing resumeSpecialist tests):
  a. record.definitionFingerprint = 'aaaa', current specialist.fingerprint = 'bbbb'
     → `{ status: 'definition-changed', agentType }`; the specialist is NOT resumed.
  b. record has no fingerprint (legacy record) but specialist has one → NOT refused.
  c. record has one, specialist has none (builtin) → NOT refused.
  d. equal fingerprints → NOT refused.
Also pin in `tests/task-tool.test.ts`: a resume call (task_id set) whose services
return `{status:'definition-changed', agentType:'docs-writer'}` yields `isError: true`
and text mentioning "has changed" and "Hire it again". Cover the foreground branch;
also the background branch if the file's existing fixtures make that cheap, and
assert `release` is called on the reservation there.

### 2. One roster lookup per Task tool instance (memoised resolve)
File: `src/main/harness/tools/task.ts` — `createTaskTool(rawRoster, sessionCwd?)` wraps
the roster; `resolve(id)` calls the raw roster ONCE per id and returns the same object
for `permissionSubject` and `execute`.
Pin in `tests/task-tool.test.ts`: a raw roster whose `resolve` is a vi.fn returning a
FRESH object each call. Call `tool.permissionSubject(args)` then `tool.execute(args, …)`
→ raw `resolve` called exactly once for that id, and the definition handed to
`services.spawn`/`hire` is the same object identity (or same fingerprint) that shaped
the subject.

### 3. Settings describes file-defined grants in words
File: `src/renderer/components/permissions/describe-rule.ts` — the `filed` regex branch.
Pin in `tests/describe-rule.test.ts` (follow existing Task cases):
  - `read-write:file:docs-writer@aaaaaaaaaaaa` → verb "Let the docs-writer specialist
    edit files in every project", no subject, width 'exact'.
  - `read-only:/work/proj:file:repo-reviewer@bbbbbbbbbbbb` → verb "Let the repo-reviewer
    specialist work in", subject "/work/proj", width 'exact'.
  - A builtin subject (`read-write:/work/proj`) is unchanged by the new branch.

### 4. work_dir resolves against the SESSION cwd, not process.cwd()
File: `src/main/harness/tools/task.ts` — `resolveP(a.work_dir, sessionCwd ?? process.cwd())`;
`src/main/harness/harness-session.ts:886` passes `this.opts.cwd`.
Pin in `tests/task-tool.test.ts`: `createTaskTool(roster, '/sess/root')` with
`work_dir: 'sub'` → subject uses `/sess/root/sub`, and with no sessionCwd it falls back
to process.cwd() (existing behaviour).
Also pin the renderer helper `grantFolderName` in `src/renderer/components/ToolCard.tsx`
if it is exported; if it is NOT exported, pin via `tests/specialist-envelope.test.tsx`:
a project-scoped hire card with `work_dir: '.'` and session cwd `/work/proj` shows
"in proj only"; with `work_dir: '/other/place/'` shows "in place only".

## Rules
- TDD discipline: write each test, watch it fail against a deliberately broken
  condition only if cheap; otherwise just confirm it passes and that it would fail
  without the fix (reason it out, one line in the report).
- Follow the existing style of each test file. No new test files unless unavoidable.
- WHY comments on any non-obvious test setup.
- Run: `cd desktop && npx vitest run tests/task-tool.test.ts tests/permission-engine.test.ts tests/specialist-envelope.test.tsx tests/describe-rule.test.ts tests/native-session-host.test.ts tests/specialist-run.test.ts tests/harness-session-loop.test.ts` and `npx tsc --noEmit`.
- Commit source + tests as ONE commit on this branch. Message style: see `git log -3`.
  Suggested subject: `fix(specialists): a changed helper file cannot be resumed past the consent card` with a body naming the four fixes.
- Do NOT touch ../../youcoded (the main checkout), do NOT run anything against a live app,
  do NOT start dev servers.
- Write your report to .superpowers/sdd/review-fix-report.md: tests added (file + name),
  exact commands + output tail, commit sha, anything that surprised you. Return only:
  status (DONE / DONE_WITH_CONCERNS / BLOCKED), commit sha, one-line test summary, concerns.
