# Report: pinning tests for the D1/D2 review fixes

Branch: `feat/specialists-1c-ui` · worktree `/home/destin/youcoded-dev/worktrees/specialists-1c`
No source file was changed — the four fixes were already applied and are committed here
unmodified, together with the tests below.

## Tests added

### Fix 1 — a changed definition file cannot be resumed

`desktop/tests/native-session-host.test.ts`, new block inside `task_id management (Task 6)`:
`describe('resume refuses a definition file that changed since the hire (D2)')`.
Each test boots a host with a REAL `SpecialistCatalog` over a real
`<projectDir>/.claude/agents/doc-helper.md`, so the fingerprint compared is the loader's
real content hash, never a hand-written string that could agree with a broken loader.
"Not resumed" is proved from the child's OWN transcript (the resumed brief text never
appears), not from the status code alone.

- `the hire records WHICH version of the definition file was consented to` — drives
  `spawnSpecialist` and reads the ledger row back: `definitionFingerprint === helper.fingerprint`.
  Added beyond the brief because without this write every record's fingerprint is absent,
  the comparison correctly reads that as "no claim to check", and the four cases below
  would all pass vacuously.
- `refuses when the recorded fingerprint and the file's current one differ — and never resumes`
  (brief case a) — record `'aaaaaaaaaaaa'` vs the file's real hash → `{ status:
  'definition-changed', agentType }`, `live.has(childId) === false`, brief never delivered.
- `a legacy row with no recorded fingerprint is NOT refused` (case b).
- `a built-in (nothing on disk to change) is NOT refused, even against a recorded fingerprint` (case c).
- `an unchanged file resumes normally` (case d).

`desktop/tests/task-tool.test.ts`, new block inside `task_id management surface (Task 6)`:
`describe('a resume whose definition file changed since the hire (D2)')`.

- `foreground: refuses, says what changed, and points at the path that re-asks the user` —
  `isError: true`; text contains `"docs-writer"`, `has changed since this specialist was
  hired`, `never approved`, `Hire it again`, `no task_id`. Also asserts the reservation was
  taken with `{ writer: true }` (docs-writer is read-write) and handed back via `release`.
- `background: refuses identically AND releases the reservation it took` — same wording
  assertions, `release` called with the exact token, and the text is NOT the launch ack.

### Fix 2 — one roster lookup per Task tool instance

`desktop/tests/task-tool.test.ts`, new top-level
`describe('Task tool — one roster lookup per id, per tool instance (D2)')`. The fake roster's
`resolve` is a `vi.fn` returning a FRESH object every call (what the catalog does after a
reload — the only way a second lookup is observable at all).

- `permissionSubject then execute() look the id up ONCE, and spawn gets the very object the
  subject was built from` — `resolve` called exactly once, exactly one object handed out,
  and `spawn.mock.calls[0][1].specialist` is that same object by identity (`toBe`).
- `memoises per id, not per tool — a second id still costs its own single lookup`.
- `a NEW tool instance looks the id up again — the memo is per-turn, never a permanent cache`.

### Fix 3 — Settings describes file-defined grants in words

`desktop/tests/describe-rule.test.ts`, new `describe('file-defined helper grants (D2)')`:

- `read-write:file:docs-writer@aaaaaaaaaaaa` → `{ verb: 'Let the docs-writer specialist edit
  files in every project', subject: undefined, width: 'exact' }`.
- `read-only:/work/proj:file:repo-reviewer@bbbbbbbbbbbb` → `{ verb: 'Let the repo-reviewer
  specialist work in', subject: '/work/proj', width: 'exact' }`.
- `a built-in grant is untouched by the new branch` — both charter shapes at `/work/proj`.
- `never leaks the hash or the file: marker into what the screen shows`.

### Fix 4 — work_dir resolves against the SESSION cwd

`desktop/tests/task-tool.test.ts`, new top-level
`describe('Task tool — work_dir resolves against the SESSION folder (D2)')`:

- relative `work_dir` resolves against the passed session folder (`sub`, `.`);
- an absolute `work_dir` is unaffected;
- `the same work_dir "." in two projects mints two DIFFERENT keys — a grant cannot travel`,
  driven through the REAL `ruleMatches`, not a string comparison;
- with no session cwd it still falls back to `process.cwd()`.

`desktop/tests/native-session-host.test.ts`, added to `specialist catalog wiring (Task 4,
plan 1c)`: `the Task tool's permission subject resolves work_dir against the SESSION's
folder, never process.cwd()` — drives a real session through a real turn and reads the real
Task tool's `permissionSubject`, so a dropped `this.opts.cwd` argument in
`harness-session.ts` fails here rather than silently in production.

`desktop/tests/specialist-envelope.test.tsx`, added to `Always-allow on a Task hire`
(`grantFolderName` is not exported, so pinned through the rendered card):

- `names the session folder when the hire did not narrow (work_dir ".")` → "in proj only".
- `names the work_dir folder when the hire narrowed to one — trailing slash and all` →
  `work_dir: '/other/place/'` shows "in place only", and NOT "in proj only".

## TDD evidence — every test was watched fail without its fix

Each fix was temporarily reverted in place, the suite run, then the file restored from a
backup and re-verified with `rg`/`git diff --stat`.

- `describe-rule.ts` `filed` branch disabled → `Tests 3 failed | 24 passed (27)`
  (the three new file-defined cases; the built-in regression test correctly stayed green).
- `task.ts` all three fixes reverted (memo → direct `rawRoster.resolve`, `sessionCwd ??` →
  `process.cwd()`, both `definition-changed` branches deleted) →
  `Tests 6 failed | 48 passed (54)`: the two memo tests, two of the four session-cwd tests
  (the absolute-path and `process.cwd()`-fallback cases are unchanged-behaviour guards), and
  both resume-refusal tests.
- `ToolCard.tsx` `grantFolderName(...)` → old `basename(sessionCwd)` →
  `Tests 1 failed | 8 passed (9)` (the narrowed-work_dir case; the `work_dir: '.'` case is by
  design unchanged and stayed green — it pins that the fix did not regress it).
- `native-session-host.ts` fingerprint check + `definitionFingerprint` recordStart removed,
  and `harness-session.ts` reverted to `createTaskTool(roster)` →
  `Tests 2 failed | 154 passed (156)`: the mismatch-refusal test and the session-folder
  wiring test.

The three "NOT refused" host cases (legacy row, built-in, equal fingerprints) pass with or
without the fix by design — their job is to pin that the comparison stays narrow and never
starts over-refusing, so they are the guard against a future tightening, not against the
current absence.

## Commands run

```
cd desktop && npx vitest run tests/task-tool.test.ts tests/permission-engine.test.ts \
  tests/specialist-envelope.test.tsx tests/describe-rule.test.ts \
  tests/native-session-host.test.ts tests/specialist-run.test.ts tests/harness-session-loop.test.ts
```
```
 Test Files  7 passed (7)
      Tests  393 passed (393)
   Duration  4.51s
```

```
cd desktop && npx tsc --noEmit
```
```
tsc exit: 0   (no output)
```

`npx eslint` on the four test files reports "File ignored because no matching configuration
was supplied" — tests are outside the lint config in this repo, 0 errors.

## Anything that surprised me

- `permissionSubject` omits the work dir entirely for a `grantScope: 'user'` helper (that is
  what makes one grant cover every project), so the session-cwd tests deliberately use a
  built-in / project-scoped subject — a user-scoped one would have proved nothing about
  path resolution.
- The `work_dir: '.'` half of `grantFolderName` is behaviourally identical to the old code;
  only the narrowed-`work_dir` case changes. Worth knowing if that test ever looks redundant.
