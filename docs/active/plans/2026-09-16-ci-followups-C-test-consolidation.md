---
status: active
---
# CI follow-ups C — file tests by feature, then consolidate the suite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New tests go into the file named for the thing they test, test names state behaviour, and the existing one-file-per-task sprawl (826 files, 62% in name clusters, 24 files for one 36-line module) is merged into one file per module or surface — without losing a single test (Destin's deck answer Q-5, 2026-09-16: "adopt the rule and consolidate now").

**Architecture:** First the rule and its mechanical guard (an ast-grep rule that fails a ticket-shaped test name), then the existing names are fixed. Then consolidation runs cluster by cluster in the order `docs/active/plans/2026-09-16-test-inventory.md` lists them (largest first), each cluster's files grouped by the module they exercise, moved whole, deduplicated on setup only. The test count is checked after every cluster. Anything that names a moved file (MAP, rules, docs) is updated in the same commit so the doc audit stays green.

**Tech Stack:** vitest 4, ast-grep (`scripts/ast-grep/` in the workspace repo), `node scripts/test-inventory.mjs` (workspace repo) for the data, `node scripts/audit-anchors.mjs --no-diff` for the doc anchors.

## Global Constraints

- **Start with** `node scripts/workspace-start.mjs --session ci-followups-c youcoded` from `/home/destin/youcoded-dev`. Workspace repo = the worktree root; app repo = `<worktree>/youcoded`.
- **Prerequisite (not parallelisable with B):** Plan B merged in both repos (`git -C <worktree> log --oneline origin/master | grep -c 'sweep ledger'` prints `1`). Plan B removed or converted most source-grep files; consolidating before it would move files that are about to be deleted. Also confirm `bash scripts/ast-grep/check.sh <worktree>/youcoded/desktop/src` prints OK under both headings on the merged master before Task 1 changes the count.
- **Regenerate the inventory first** (`node scripts/test-inventory.mjs <worktree>/youcoded/desktop > docs/active/plans/2026-09-16-test-inventory.md`) and work from THAT; the committed one is a snapshot from before Plan B.
- **Moves change no assertion.** A consolidation commit contains only: whole `describe`/`it` blocks moved, imports merged, duplicated `beforeEach`/helper setup collapsed into one, and comment lines deleted. If a test needs a behaviour change to survive the move, that is a separate commit with its own message, before or after the move.
- **The count is the contract.** Before each cluster: `npx vitest run <the cluster's files> 2>&1 | grep 'Tests  '`. After: the same command on the target file(s). The passed count must be equal. Write both numbers into the commit message.
- **Anything that names a moved file follows it.** After every move: `rg -n '<old basename without extension>' <worktree> --glob '!docs/archive/**' --glob '!node_modules'` — hits in `docs/MAP.md`, `.claude/rules/*.md` (`verify:` blocks and prose), `youcoded/docs/**`, `scripts/**` are updated in the same commit; hits in `docs/roadmap/**`, `docs/wrap-ups.md`, `docs/active/investigations/**` are history and stay. `node scripts/audit-anchors.mjs --no-diff` must not report `anchors` failures for the moved file (a `missing: youcoded/desktop/tests/<old>` line means you missed one).
- **Stage by explicit path**, never `git add -A`. `// WHY` on any non-trivial edit. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (or the model in use).
- **Verify** `bash scripts/verify.sh <worktree>/youcoded` after every cluster; `--full` plus `gh workflow run desktop-ci.yml --ref <branch>` before every PR. Master is protected: read a red check, never re-run it blind.
- Opening PRs is authorised (Destin, 2026-09-16); merging is not — each PR ends with a chat report and **ready to merge?**. The clusters are independent: while one PR waits, start the next cluster on a fresh branch off `origin/master`.

## Coordination with other in-flight work (added 2026-09-17)

- **Ratchets exist now** (merged 2026-09-16, youcoded#499): `desktop/knip-baseline.json` (unused exports/types ceiling), `desktop/line-budgets.json` (src files only; tests are not budgeted), design lint `--max-warnings`, `tests/visible-intervals.test.ts`, `tests/infinite-animation-allowlist.test.ts`. Deleting or merging tests can orphan a source export used only by that test; the knip ratchet then goes red. Delete the orphaned export in the same commit; never raise the baseline. `npm run knip` prints the offenders.
- **`EXPECTED_VIOLATIONS` is never a literal.** Read the current value in `scripts/ast-grep/check.sh` (Plan B moves it far past the 14 on master today) and add exactly the number of new fixture matches.
- **Tree-wide guard tests are the intended exception to "one file per module".** They test the whole tree, not a module: `guard-scope-reader`, `visible-intervals`, `infinite-animation-allowlist`, `line-budgets`, `harness-eval-not-shipped`, `hook-scripts-android-parity`, `ipc-channels`, plus any Plan B keeper whose row says `keep`. Leave them in place; in Task 5 list them as accepted, not as an unfinished merge.
- **Ordering against the simplification phases** (`docs/active/plans/2026-09-16-simplification-phases.md`, phases 1a/1b/T shipped; 2–5 pending): the `remote-` cluster (Task 4) lands BEFORE simplification phase 4, which rewrites `remote-server.ts` and its tests; Task 2 (the native-session-host test split) lands BEFORE simplification phase 5, which splits the source along the same seams; simplification phase 2 (timers: sync, engine, transcript, subagent, chatsearch, social, remote polls) runs between Task 1's merge and the `sync-`/`engine-` clusters, or after them. Rule: no simplification phase runs concurrently with a Plan C cluster that shares its prefix; whoever starts second checks the other's open PR first.
- **`feat/specialists-plans-ui` is unmerged and overlaps (added 2026-09-18, Destin: "account for the specialist branch work … i want this and the other branch to combine into master well").** Measured at its tip `4fba3584`: it adds ~50 ticket-shaped titles Task 1's guard rejects, +1,061 lines to `native-session-host.test.ts` (Task 2), edits `specialist-*`, `harness-*`, `remote-shim-plans`, `ipc-channels`, `native-home`, and adds a new `plan-`/`plan-card-` cluster of ~27 files (several task-named: `-review-r7`, `-r9`, `-5b`). That branch belongs to another session — never commit to it. Rules: (1) Task 1's renames change only the title text on its line, so its three overlapping files merge line-by-line. (2) Clusters the branch does not touch go first. (3) For each overlapping target, re-check whether the branch has merged: if yes, do it on master and fold the `plan-` cluster in; if not, build an **integration branch** `session/specialists-plans-ui-plan-c` off the branch tip that merges current master and resolves forward — renames its new titles, ports its test additions into the split/merged files byte-for-byte, consolidates its `plan-` cluster — with the count contract (branch tip's passed count = integration count). Push it and hand its owner one step: merge it into `feat/specialists-plans-ui`. Refresh it whenever either side moves.
- **The committed inventory predates 2026-09-16's merges** (four overlay buddy tests deleted, five guards and `SessionDrawer`-unrelated files added, Plan B's conversions): the regenerate-first constraint above is load-bearing, not optional.

## Progress and what waits on what (2026-09-18)

Open PR pairs (app / workspace; every app PR after #509 is stacked on it and retargets to master when it merges; each workspace PR merges AFTER its app PR because the workspace CI reads app master):
#509/#134 naming rule · #510/#135 SessionDrawer · #511 theme · #512/#136 buddy · #513/#137 sync · #514/#138 session · #515 chatsearch · #516 use+skill · #517 marketplace · #518/#139 engine · #519/#140 model+project · #520/#141 mcp+transcript · #521/#142 chat+resume+terminal · #522/#143 context/local/mascot/search/slug · #523/#144 artifact/claude/dev/git/permission · #524/#145 update/prompt/voice/attention/chatview · #525 subagent/tag/arcade/conversation(s) · #526/#146 github/keychain/shell/slash/zoom · #527/#147 remote · #528/#148 status/first/chatgpt/workbench/tool.
Workspace PRs #135 and #140 both edit `.claude/rules/artifacts.md` (different lines); several app PRs each delete one line of `tsconfig.tests.json` — expect trivial merge conflicts, resolve by keeping both sides' deletions.

**Waits on a merge (do these next, each on a fresh branch off master):**
- After `feat/specialists-plans-ui` merges: Task 2 (split `native-session-host.test.ts`, now with its +1,061 lines), the `harness-`, `native-`, `specialist-` clusters, its new `plan-`/`plan-card-` cluster, and the files it touches in otherwise-done clusters (`status-strip-authority`, `first-page-live-replay`, `chatgpt-auth`, `workbench-fixture-actions`, `tool-effects`, `remote-shim-plans` → `remote-shim*.test.ts`, `native-home`, `known-models`). Its ~50 ticket-shaped titles fail the naming guard the first time it merges master after #509/#134 — its owner renames them then (the checker prints the list).
- After #523 (creates `ToolCard.test.tsx`): `tool-body-shell`, `tool-card-answered-elsewhere`, `-external-ask`, `-full-auto-stop`, `-grant-width`, `-preparing`, `-budget-gate`, `tool-body-malformed-input` join it.
- After #514 (merges into `chat-reducer.test.ts`, `ipc-handlers.test.ts`): `chat-reducer-shell`, `chat-reducer-specialists`, `chat-order-sender-matches-receiver`, `attention-reducer`, `transcript-reducer`, `permission-expired-wording`, `permission-resolved-elsewhere` → `chat-reducer.test.ts` (check each for file-wide mocks); `mcp-startup-wiring`, `transcript-page-locator` → `ipc-handlers*.test.ts`.
- After #521 and #524: `chatview-empty-response-gate`, `chatview-history-sentinel`, `chatview-prepend-scroll-anchor` → `ChatView-<facet>.test.tsx` (each has a conflicting file-wide mock, so renames, not merges).
- After #518: the EngineCard remnant left in `local-engine-fields-rendered.test.tsx` (16 cases) → `EngineCard.test.tsx`.
- Small: `tests/ipc-channels.test.ts` keeps one comment naming the retired `remote-shim-voice-gate.test.ts`; `theme-marketplace-provider.test.ts` tests a copy of the provider's logic pasted into the test, not the provider (rewrite against the real module — a behaviour change, own commit).

---

### Task 1: The naming rule, with a guard that fails the old shape

**Files:**
- Create (workspace): `scripts/ast-grep/rules/test-name-describes-behaviour.yml`, `scripts/ast-grep/rules/test-name-describes-behaviour-tsx.yml`, `scripts/ast-grep/fixtures/test-names.ts`, `scripts/ast-grep/fixtures/test-names.tsx`
- Modify (workspace): `scripts/ast-grep/check.sh` (`EXPECTED_VIOLATIONS` +2), `.claude/rules/test-suite-hygiene.md`
- Modify (app): every test whose `it(`/`describe(`/`test(` title matches the rule (213 titles as of 2026-09-16 — 170 in .ts files, 43 in .tsx — measured with these exact rules; the checker prints the list)

**Interfaces:**
- **Done 2026-09-18 (branch `session/ci-followups-c`).** 213 titles in 77 files renamed as measured. The regex was then widened — `[Ff]inding [0-9]`, `\bTask [0-9]+[a-z]?\b` (bare `Task 3:`), `review fix`, `fix pass [0-9]`, `\bplan 1[a-z]\b` — which caught 37 more real ticket titles on master (9 more files); all renamed. Every change is the title text on its own line. Full suite green; inverted with `(T99)` (.ts) and a date (.tsx), both fired.
- Produces: two ast-grep rules that fire on a test title containing a date (`2026-09-10`), a section sign (`§`), a task or review reference (`(T18)`, `R3-5`, `review round 8`, `re-review`, `finding 4`). Task 3 onward relies on the checker being green, so every rename is done here.

- [x] **Step 1: Write the rules and fixtures**

`scripts/ast-grep/rules/test-name-describes-behaviour.yml`:
```yaml
id: test-name-describes-behaviour
language: typescript
severity: error
message: >-
  A test title states the behaviour it pins, in words a reader of the failure can
  act on — never a date, a section sign, a task id or a review round. Those live
  in git history and the roadmap; in a title they tell the next session nothing.
note: |
  Invariant source: the 2026-09-16 CI/test health review (213 titles
  carried dates, §, (T<n>) or R<n>-<n>). Guard: this rule + fixtures/test-names.ts.
  The tsx twin covers .tsx files (tree-sitter needs the tsx grammar there).
files:
  - "**/tests/**/*.ts"
  - "**/fixtures/test-names.ts"
rule:
  any:
    - pattern: it($NAME, $$$)
    - pattern: test($NAME, $$$)
    - pattern: describe($NAME, $$$)
    - pattern: it.skipIf($$$C)($NAME, $$$)
    - pattern: describe.skipIf($$$C)($NAME, $$$)
    - pattern: it.each($$$E)($NAME, $$$)
    - pattern: describe.each($$$E)($NAME, $$$)
constraints:
  NAME:
    regex: "20[0-9]{2}-[0-9]{2}-[0-9]{2}|§|\\(T[0-9]+\\)|\\bR[0-9]+-[0-9]+\\b|review round|re-review|finding [0-9]|\\(Task [0-9]"
```
`…-tsx.yml`: identical, `id: test-name-describes-behaviour-tsx`, `language: tsx`, `files: ["**/tests/**/*.tsx", "**/fixtures/test-names.tsx"]`.

`scripts/ast-grep/fixtures/test-names.ts`:
```ts
// Violation fixture for test-name-describes-behaviour: one ticket-shaped title.
declare function it(name: string, fn: () => void): void;
it('the poll starts after the callback (2026-09-05 review round 3)', () => {});
```
`fixtures/test-names.tsx`: the same three lines (a `.tsx` file may contain no JSX).

- [x] **Step 2: Bump the count, run the checker, read the offender list**

In `check.sh`: `# <today's date>: +2 for test-name-describes-behaviour (+ its tsx twin), Plan C.` and `EXPECTED_VIOLATIONS` += 2. Run `bash scripts/ast-grep/check.sh <worktree>/youcoded/desktop/src`. Expected: fixtures `OK — N/N`, real source `FAIL — <about 247> invariant violation(s)` followed by the list. Save it: `npx --yes --package @ast-grep/cli ast-grep scan -c scripts/ast-grep/sgconfig.yml --json youcoded/desktop/tests | jq -r '.[] | "\(.file):\(.range.start.line)  \(.text)"' > /tmp/test-names-todo.txt`.

- [x] **Step 3: Rename every offender**

For each line in `/tmp/test-names-todo.txt`: open the file at that line and rewrite the title so it says what the test proves, in the present tense, no dates or references. The reference moves into a `// WHY` comment on the line above ONLY if the incident is not already told by the test body. Examples of the transformation:

| before | after |
|---|---|
| `it('verify-failed: offers a retry but NOT the raw-binary browser fallback (2026-09-10 #7 review)'` | `it('a failed verification offers Retry and never the raw-binary browser fallback'` |
| `describe('the read gate explains itself (2026-08-11 review round 8)'` | `describe('the read gate explains itself'` |
| `describe('engine:set-config — a speed switch waits for the reply to finish (§B, R3-5)'` | `describe('engine:set-config — a speed switch waits for the reply to finish'` |
| `it('… reaches the profile of a LOCAL-ENGINE binding too (T18)'` | `it('… reaches the profile of a local-engine binding too'` |

Work file by file; after each file run `npx vitest run tests/<file>` (a title is also a `-t` filter some scripts use — `rg -n "\-t '" scripts docs .claude` in the workspace must be checked for the old title and updated). Commit every ten files: `test: behaviour-stated titles in <n> files (Plan C task 1)`.

- [x] **Step 4: Prove the guard, write the rule**

Run the checker: expected `OK` under both headings. Invert: put `(T99)` into one real title, run, see it fire, restore. Then in `.claude/rules/test-suite-hygiene.md` add a section (trim elsewhere to keep the body ≤ 600 words — `node scripts/audit-anchors.mjs --no-diff` reports the count; overflow moves to `docs/testing-under-load.md`):

```markdown
## A test lives with its feature and is named for its behaviour
**Invariant:** a new test goes in `tests/<module>.test.ts` (or `tests/<Surface>.test.tsx`),
the file named for what it renders or calls — never a new file per task. Its title states the
behaviour; no dates, `§`, task ids or review rounds (those go in git history and the roadmap).
Shared setup lives in `tests/helpers/`. **Why:** 826 files, 62% in name clusters, 24 files for
one 36-line module (2026-09-16). **Guard:** `scripts/ast-grep/rules/test-name-describes-behaviour.yml`.
```
Add `- path: scripts/ast-grep/rules/test-name-describes-behaviour.yml` to the rule's `verify:` list.

- [ ] **Step 5: Verify, commit, push, PR**

`bash scripts/verify.sh <worktree>/youcoded --full` → `OK`. Commit the workspace changes (`ci: test titles state behaviour — ast-grep guard + hygiene rule`) and push both repos; dispatch Desktop CI on the app branch; open the two PRs (title: `test: every title states its behaviour; guard against dates and ticket ids in titles`). Report and ask **ready to merge?**. Continue with Task 2 on a fresh branch.

---

### Task 2: Split the one file too big to reason about

**Files:**
- Split: `youcoded/desktop/tests/native-session-host.test.ts` (5,655 lines, 189 cases, 3 top-level describes) into four files
- Modify (workspace): `docs/MAP.md` and any rule/doc naming `native-session-host.test.ts` (find with the rg in Global Constraints)

**Interfaces:**
- Produces: `tests/native-session-host.test.ts` (kept: everything not moved), `tests/native-session-host-specialists.test.ts`, `tests/native-session-host-permissions.test.ts`, `tests/native-session-host-send-queue.test.ts`. The shared fixture block at the top of the original (imports, `makeHost`-style helpers, `beforeEach`) moves to `tests/helpers/native-session-host-fixture.ts` and is imported by all four.

- [ ] **Step 1: Record the count**

`npx vitest run tests/native-session-host.test.ts 2>&1 | grep 'Tests  '` → write the number down (it was `189 passed` on 2026-09-16; use what it prints now).

- [ ] **Step 2: Extract the shared fixture**

Everything between the imports and the first `describe(` that is a `let`, `const`, `function` or `beforeEach`/`afterEach` used by more than one describe moves to `tests/helpers/native-session-host-fixture.ts` as named exports (`export function makeHost…`, `export let …` becomes a getter or the describes call a `setup()` that returns the objects). Run the original file after the extraction: same count.

- [ ] **Step 3: Move describes by subject**

Inside the top-level `describe('NativeSessionHost')` the second-level describes are the seams (line numbers from 2026-09-16; use `rg -n "^  describe\(" tests/native-session-host.test.ts` for today's):
- to `…-specialists.test.ts`: `specialist slot + writer-lock bookkeeping`, `specialist concurrency cap follows the profile`, `specialist children`, `task_id management`, `user-facing steer/stop + specialists-event feed`, `specialist report spill scoping`, `specialist status text`, `getDelegatedModels / setDelegatedModel`, `specialistRunsFor`, `mergeChildEvents (pure function)`, `specialist catalog wiring`, plus the top-level `NativeSessionHost per-turn pricing` if it is about specialist cost (read it; if not, it stays)
- to `…-permissions.test.ts`: `permission mode + remembered rules`, `revokeRule / revokeProject`, `capability profile threading`, `preset wiring`, `MCP teardown`, `MCP session wiring`
- to `…-send-queue.test.ts`: `send queue (M1)`, `quiesce (Task 9 — takeover/teardown)`, `restart recovery + subagent-card replay`, and the top-level `G-1 background Bash — registry lifetime and finished notices`
- stays: `model ref-count`, `a real catalog reaches services.models.catalog()`, anything else
Each moved describe keeps its body byte-for-byte; the new file wraps them in one top-level `describe('NativeSessionHost — specialists', …)` and imports the fixture.

- [ ] **Step 4: Count, anchors, commit**

`npx vitest run tests/native-session-host*.test.ts 2>&1 | grep 'Tests  '` — the same number as Step 1. Update `docs/MAP.md` (the "Native runtime (harness)" row's guards) and any rule `verify:` naming the file; `node scripts/audit-anchors.mjs --no-diff` shows no `missing:` for it. Commit: `test: split native-session-host.test.ts by subject (189 → 189 across four files)`.

---

### Task 3: Consolidate one cluster — the worked example (`session-drawer-*`)

**Files:**
- Merge: the eight `youcoded/desktop/tests/session-drawer-*.test.tsx` files listed under `### \`session-\`` in the inventory into `youcoded/desktop/tests/SessionDrawer.test.tsx`
- Modify (workspace): `docs/MAP.md` row for the session drawer; any rule naming one of the eight

**Interfaces:**
- **Done 2026-09-18 (branch `session/plan-c-session-drawer`): eight files → TWO, 31 → 31.** Three lessons every later cluster applies:
  1. **A file-wide `vi.mock` splits the target.** Files that mock a module and files that use the real one cannot share a file — `SessionDrawer.test.tsx` (real ArtifactContext) + `SessionDrawer-scripted-state.test.tsx` (mocked). Several different fakes of the SAME module may merge into one fake only if it is a superset of each; re-prove any guard whose fake changed by inverting it.
  2. **Module-level state no longer resets between old files.** Each old file got a fresh module graph; in one file, caches and singletons carry across sections. Reset them in a shared `afterEach` (here `__resetMissingArtifactsCache`). Colliding top-level names (`SESSION`, `ROOT`, `baseState`) move inside their describe, or the section is wrapped in one.
  3. **`tsconfig.tests.json` excludes some old files from type-checking.** A merged file is checked whole, so an excluded source file's type errors surface; fix them (behaviour-neutral: e.g. `cwd=""` where the component only tests truthiness) and delete its exclude line — never add the merged file to the exclude list, which would un-check its other sections.
  **Search for old names with `rg --hidden --no-ignore`** — plain `rg` skips `.claude/` (hidden) and `youcoded/` (gitignored in the workspace), and missed seven references here that the anchor audit then caught. Also compare leaf titles, not only the count: `--reporter=json` before and after, `diff` of sorted `status title` lines.
- Produces: the procedure every later cluster repeats. The target file is named for **what the tests render or call** — read each file's `render(<X` or the function it invokes; the inventory's module column lists the contexts a test wraps itself in first, and a context is not the subject.

- [ ] **Step 1: Read the eight, decide the subject of each**

`rg -n "render\(<|renderHook\(" tests/session-drawer-*.test.tsx`. Expected on 2026-09-16: seven render `<SessionDrawer …>` (subject: SessionDrawer); `session-drawer-preview-header` renders the drawer's preview header (subject: SessionDrawer too — it is a region of the same component); `session-drawer-deleted-toggle` has no src import at all — open it: if it tests a pure function copied into the test, delete it and name it in the commit; if it renders something, it has a subject.

- [ ] **Step 2: Count before**

`npx vitest run tests/session-drawer-*.test.tsx 2>&1 | grep 'Tests  '` → note the number (33 on 2026-09-16).

- [ ] **Step 3: Create the target with the merged setup**

`tests/SessionDrawer.test.tsx` starts with `// @vitest-environment jsdom`, the UNION of the eight files' imports (deduplicated), and ONE `beforeEach`/`afterEach` if theirs are identical — if they differ, keep each describe's own setup inside that describe. Then, for each source file in inventory order, append its top-level `describe(` blocks unchanged (a file with bare `it(` at top level gets a `describe('<old file name without prefix, as words>', …)` wrapper). Comment lines that narrate an incident or restate the test title are deleted while pasting; a `// WHY` that explains a non-obvious assertion stays.

- [ ] **Step 4: Delete the eight, count after, fix names**

`git rm -q tests/session-drawer-*.test.tsx`; `npx vitest run tests/SessionDrawer.test.tsx 2>&1 | grep 'Tests  '` — the same number as Step 2 (minus any deletion named in Step 1). `rg -n 'session-drawer-(deleted-toggle|delivered-label|lists-on-open|pill-pending|preview-header|session-scoped-labels|settle-hold|skips-parent-rerenders)' <worktree> --glob '!docs/archive/**' --glob '!docs/roadmap/**' --glob '!docs/wrap-ups.md'` — update every hit (MAP guard lists, rule `verify:` blocks, docs). `node scripts/audit-anchors.mjs --no-diff` → no `missing:` for those names.

- [ ] **Step 5: Verify and commit**

`bash scripts/verify.sh <worktree>/youcoded` → `OK`. Commit (app): `test: SessionDrawer — eight task files become one (33 → 33 cases)`; commit (workspace): the MAP/rule updates. Push both.

---

### Task 4: Every other cluster, in inventory order

**Files:** each `### \`<prefix>-\`` section of the regenerated inventory, largest first; `docs/MAP.md`; the rules.

- [ ] **Step 1: Group the cluster's files by subject**

For the cluster, list each file with its subject (Task 3 Step 1's method). A cluster like `remote-` (54 files) has several subjects — `remote-server` (main), `remote-shim` (renderer), `remote-download`, `remote-devices`, … — so it yields several targets: `tests/remote-server.test.ts`, `tests/remote-shim.test.ts`, and so on. A file whose subject already has a same-named file (e.g. `remote-server.test.ts` exists, 1,670 lines) is merged INTO it. A target that would exceed ~2,000 lines is split by second-level subject the way Task 2 did (e.g. `remote-server-download.test.ts`), named `<subject>-<facet>`, never `<subject>-<task>`.

- [ ] **Step 2: Merge, count, rename references, verify, commit — per target**

Exactly Task 3 Steps 2–5 for each target. One commit per target; the message carries `(<before> → <after> cases)` and lists any deleted case by title.

- [ ] **Step 3: Pull request per cluster of eight files or more; smaller clusters batched five per PR**

Before each PR: `bash scripts/verify.sh <worktree>/youcoded --full` → `OK`; `gh workflow run desktop-ci.yml --ref <branch>` → three green legs; `node scripts/audit-anchors.mjs --no-diff` → `MECHANICAL PASS: OK`. PR body: the cluster, the targets created, the before/after case totals, the deleted titles, and the comment-line count before and after (`rg -c '^\s*//' <files>` summed). Report in chat, ask **ready to merge?**, start the next cluster on a fresh branch.

Order (from the 2026-09-16 inventory; re-read the regenerated one): `remote-` 54 · `session-` 39 · `harness-` 32 · `sync-` 26 · `buddy-` 20 · `native-` 18 · `theme-` 18 · `specialist-` 15 · `chatsearch-` 14 · `marketplace-` 14 · `engine-` 13 · `skill-` 12 · `use-` 12 · `workbench-` 12 · `model-` 11 · then every remaining cluster of four or more.

---

### Task 5: Done means the inventory says so

- [ ] **Step 1: Regenerate and read**

`node scripts/test-inventory.mjs <worktree>/youcoded/desktop > docs/active/plans/2026-09-16-test-inventory.md`. Expected:
- Section 1 lists no cluster whose files share a SUBJECT (two files for one module). Clusters that remain are different subjects sharing a word (`remote-server`, `remote-shim`, `remote-download`) — that is the intended shape.
- Section 2 (modules tested by two or more files) lists only shared contexts and type modules: `src/shared/types`, `src/renderer/state/chat-context`, `src/renderer/state/chat-types`, `src/renderer/state/ArtifactContext`, `src/renderer/state/theme-context`, `src/main/native-home`, `src/shared/artifacts/types`, `src/shared/permission-types`. Anything else listed is an unfinished merge.

- [ ] **Step 2: Reconcile the count**

Total cases at the start of Plan C (Task 1 Step 5's full run) minus every deleted title named in the commit messages (`git log --grep 'deleted' --format=%B origin/master..HEAD | rg -c '^- deleted'` after you have listed them that way) equals today's `Tests N passed`. Write the arithmetic into the final PR body.

- [ ] **Step 3: Close the roadmap and the plan**

In `docs/roadmap/dev-workspace.md` → tests, delete the entries this plan resolved (search the file for `one file per task`, `826`, `consolidat`); append one closure line to `docs/roadmap/shipped.md`. Set this plan's `status:` to `shipped` and move it to `docs/archive/plans/`; the inventory script stays (it is now the suite's own health check — add a line to `docs/workspace-workflows.md` → Local build & test: "`node scripts/test-inventory.mjs` shows which test files share a subject; a new cluster is a rule violation, not a style choice").

- [ ] **Step 4: Final PR and stop**

Push both repos, dispatch Desktop CI, open the two PRs, report the arithmetic and the before/after file count in plain words, and end with **ready to merge?**.
