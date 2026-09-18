---
status: shipped
---
# CI follow-ups B — the source-grep test sweep

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every test that reads app source as text and asserts a substring is either replaced by a real rule (ast-grep, eslint, a parser) or deleted, so the suite stops breaking on whitespace, renames and Windows line endings (Destin's deck answer Q-4, 2026-09-16: "convert or delete them all in one session").

**Architecture:** The 114 files are already classified in `docs/active/plans/2026-09-16-source-grep-classification.md` (groups 0–5). Work goes group by group, one commit per file, one pull request per group. A whole-file rule becomes an ast-grep rule with a violation fixture; a mixed file keeps its behaviour cases and loses or converts its text-reading cases; the 19 keepers get a `\r`-safe reader. The test count printed at the start is the budget nothing may silently drop below except by a counted, named deletion.

**Tech Stack:** vitest 4, ast-grep (`scripts/ast-grep/` in the workspace repo — rules in `rules/`, violation fixtures in `fixtures/`, `check.sh` runs both), eslint 9 flat config (`youcoded/desktop/eslint.config.mjs`), the `yaml` package (already in `node_modules`).

## Global Constraints

- **Start with** `node scripts/workspace-start.mjs --session ci-followups-b youcoded` from `/home/destin/youcoded-dev`. Paths are relative to the returned worktree; the workspace repo (`scripts/ast-grep/…`) is the worktree root, the app repo is `<worktree>/youcoded`.
- **Prerequisite:** `session/ci-test-health` merged in both repos (`git -C <worktree>/youcoded log --oneline origin/master | grep -c 'make master green'` prints `1`). Plan A may run at the same time as this plan — the two touch disjoint files (A: `shell-registry`, `engine-model-settings`, `lease-client` and their sources; none are in the classification). Once Plan A's Task 1 has landed, master is protected: a red Linux check blocks your PR, so read failures, never re-run and hope.
- **The classification file is the work list.** Do not re-classify. If a file turns out to be misclassified when you open it (say, a "split" whose "behaviour cases" also read source), note the correction in the file's row (edit the classification doc in the same commit) and apply the nearest disposition.
- **Every ast-grep rule needs a fixture line that FIRES**, and `EXPECTED_VIOLATIONS` in `scripts/ast-grep/check.sh` goes up by exactly the number of new fixture matches, with a dated comment line beside the others. `bash scripts/ast-grep/check.sh <worktree>/youcoded/desktop/src` must print `OK` under both headings after every rule.
- **Prove each converted guard the way the hygiene rule says:** invert the invariant in the real source (one edit), watch the new rule fire on the real tree, restore the source. The commit message names what you inverted.
- **Never delete a test case without naming it.** The commit message lists every deleted `it(…)` title. A file's behaviour cases keep their names and bodies unchanged.
- **Stage by explicit path**, never `git add -A`. `// WHY` on every non-trivial edit. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (or the model in use).
- **Verify** with `bash scripts/verify.sh <worktree>/youcoded` after every file and `--full` before each PR. Prove Windows with `gh workflow run desktop-ci.yml --ref <branch>` before opening each PR; read the failed log if any leg is red.
- Opening the pull requests named here is authorised (Destin, 2026-09-16). Merging is not: each group's PR ends with a chat report and the single question **ready to merge?**; continue with the next group on a fresh branch off origin/master only after that merge (the groups are independent, so waiting is not blocking — do the next group's local work while waiting).

---

### Task 1: Baseline — record the counts nothing may silently fall below

**Files:**
- Create: `docs/active/plans/2026-09-16-sweep-ledger.md` (workspace repo)

**Interfaces:**
- Produces: the ledger every later task appends to: file, cases before, cases after, deleted case titles, rule ids added.

- [ ] **Step 1: Count**

Run, from `<worktree>/youcoded/desktop`:
```bash
npx vitest run 2>&1 | grep -E 'Test Files|Tests  '
rg -c '^\s*(it|test)(\.skipIf\([^)]*\)|\.skip|\.only|\.each\([^)]*\))?\(' tests --glob '*.test.ts' --glob '*.test.tsx' | awk -F: '{s+=$2} END {print "cases:", s}'
grep -c '^EXPECTED_VIOLATIONS=' ../../scripts/ast-grep/check.sh; grep '^EXPECTED_VIOLATIONS=' ../../scripts/ast-grep/check.sh
```
Expected: three numbers. Write them into the ledger:

```markdown
# Source-grep sweep ledger (Plan B)

Baseline <date>: Test Files <n>, Tests <n> passed, `it(`/`test(` sites <n>, EXPECTED_VIOLATIONS=<n>.

| file | cases before | cases after | deleted case titles | rule / tool added |
|---|---|---|---|---|
```

- [ ] **Step 2: Commit the ledger**

```bash
git add docs/active/plans/2026-09-16-sweep-ledger.md
git commit -q -m "plan B: sweep ledger with the baseline counts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -q -u origin session/ci-followups-b
```

---

### Task 2: One `\r`-safe reader for the 19 keepers (Group 5)

**Files:**
- Modify: `youcoded/desktop/tests/helpers/guard-scope.ts` (add `readSource`, make `readStripped` use it)
- Modify: every Group 5 file that calls `readFileSync(` on a source or CSS path directly (find them: `rg -l 'readFileSync\(' $(sed -n '/## Group 5/,$p' ../../docs/active/plans/2026-09-16-source-grep-classification.md | grep -o 'tests/[^`]*')`)

**Interfaces:**
- Produces: `export function readSource(path: string): string` — reads a file as UTF-8 with every `\r\n` and lone `\r` turned into `\n`. `readStripped(path)` = `stripComments(readSource(path))`.

- [ ] **Step 1: Write the failing test**

Create `youcoded/desktop/tests/guard-scope-reader.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSource, readStripped } from './helpers/guard-scope';

describe('guard-scope readers', () => {
  it('readSource and readStripped never hand back a carriage return', () => {
    // WHY: a Windows checkout is CRLF; every text guard that split on '\n' then
    // saw "nsis:\r" and matched nothing (Windows CI, 2026-09-10 to 09-16).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-reader-'));
    const file = path.join(dir, 'crlf.ts');
    fs.writeFileSync(file, 'a: 1\r\n// comment\r\nb: 2\r\n');
    expect(readSource(file)).toBe('a: 1\n// comment\nb: 2\n');
    expect(readStripped(file).split('\n')).toHaveLength(4);
    expect(readStripped(file)).not.toContain('\r');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npx vitest run tests/guard-scope-reader.test.ts`
Expected: FAIL — `readSource` is not exported.

- [ ] **Step 3: Implement**

In `tests/helpers/guard-scope.ts`, replace
```ts
export function readStripped(path: string): string {
  return stripComments(readFileSync(path, 'utf8'));
}
```
with
```ts
/** Read a source or config file as text, line endings normalised. WHY: a Windows
 *  checkout is CRLF, and every guard that split on '\n' saw a trailing \r on each
 *  line — two YAML guards returned null for every key (Windows CI, 2026-09-10 to
 *  09-16). Every text read in the test tree goes through here. */
export function readSource(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
}

/** Read a file with its comments blanked — what every guard actually matches on. */
export function readStripped(path: string): string {
  return stripComments(readSource(path));
}
```

- [ ] **Step 4: Route the keepers through it**

For each Group 5 file that calls `readFileSync(…, 'utf8')` on a `src/`, `styles/`, `app/`, `scripts/` or `.yml`/`.css` path: add `readSource` to its `./helpers/guard-scope` import (or add the import) and replace that call with `readSource(<same path>)`. Leave reads of fixtures and of files the test itself wrote alone. Run each file after editing: `npx vitest run tests/<file>`. Expected: same count of passes as before.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/guard-scope-reader.test.ts tests/ipc-channels.test.ts tests/theme-builtin-sources.test.ts` (plus every file touched). Expected: all pass.
```bash
git add desktop/tests/helpers/guard-scope.ts desktop/tests/guard-scope-reader.test.ts desktop/tests/<each touched file>
git commit -q -m "test: one CRLF-safe reader for every source-text guard

readSource() normalises line endings; readStripped() uses it; the 19 guards that
stay as text reads (Plan B group 5) go through it. Guarded by
guard-scope-reader.test.ts.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Group 1 — parse the config instead of scraping it (3 files)

**Files:**
- Modify: `youcoded/desktop/tests/installer-artifact-names.test.ts` (lines 15–29: `CONFIG` and `sectionValue`), `youcoded/desktop/tests/app-icons.test.ts` (same shape, lines 15–29), `youcoded/desktop/tests/android-manifest-voice.test.ts`

**Worked example — `installer-artifact-names.test.ts`:**

- [ ] **Step 1: Replace the hand parser**

Delete the `CONFIG` constant and the whole `sectionValue` function. In their place:
```ts
import { parse as parseYaml } from 'yaml';
import { readSource } from './helpers/guard-scope';

// WHY a real parser: the hand-rolled line scanner returned null for every key on a
// CRLF checkout and made two "must be absent" cases pass for the wrong reason
// (Windows CI, 2026-09-16 review). electron-builder reads this file with a YAML
// parser; so does this test now.
const CONFIG: Record<string, any> = parseYaml(readSource(path.join(__dirname, '..', 'electron-builder.yml')));
function sectionValue(section: string, key: string): string | null {
  const v = CONFIG?.[section]?.[key];
  return v === undefined || v === null ? null : String(v);
}
```
The six call sites (lines 60, 75, 101, 105, 106 and the `it.each` in `app-icons`) keep working unchanged: same name, same contract.

- [ ] **Step 2: Prove the null cases are honest now**

Temporarily add `artifactName: probe` under the `appImage:` section of `desktop/electron-builder.yml`, run `npx vitest run tests/installer-artifact-names.test.ts -t 'appImage'` — expected: the case that asserts `toBeNull()` now FAILS (it saw `probe`). Revert the YAML. Run the file: expected all pass.

- [ ] **Step 3: Same for `app-icons.test.ts`**, identical replacement; the one case pinning a theme-icon fallback line (class B, row says "theme icon fallback line pinned") is deleted — name it in the commit. `android-manifest-voice.test.ts`: replace the two substring checks with a parse of `app/src/main/AndroidManifest.xml` using the DOM the test environment has (`// @vitest-environment jsdom` on line 1, `new DOMParser().parseFromString(readSource(manifest), 'text/xml')`) and assert `doc.querySelector('uses-permission[android\\:name="android.permission.RECORD_AUDIO"]')` is not null and the `<service>` whose `android:name` ends with `RecognitionService` exists. Run each file.

- [ ] **Step 4: Ledger, commit**

Append three rows to the ledger. Commit the three test files (and the ledger) with a message naming the deleted case.

---

### Task 4: Group 2 — delete the four pure pins, replace one with a real test (4 files)

**Files:**
- Delete: `youcoded/desktop/tests/landing-demo-fade.test.ts`, `youcoded/desktop/tests/remote-preview-gate.test.ts`, `youcoded/desktop/tests/remote-place-app-wiring.test.ts`
- Replace: `youcoded/desktop/tests/remote-tailnet-bind.test.ts`

- [ ] **Step 1: Delete three**

```bash
git rm -q desktop/tests/landing-demo-fade.test.ts desktop/tests/remote-preview-gate.test.ts desktop/tests/remote-place-app-wiring.test.ts
```
Before committing, check nothing names them: `rg -n 'landing-demo-fade|remote-preview-gate|remote-place-app-wiring' --glob '!docs/archive/**' <worktree> <worktree>/youcoded` — a hit in `docs/MAP.md` or a `.claude/rules/*.md` `verify:` block must be removed in the same commit (otherwise `audit-anchors` goes red); a hit in the roadmap or an investigation is history, leave it.

- [ ] **Step 2: Replace the tailnet-bind pin with behaviour**

Read `rg -n 'listen\(' youcoded/desktop/src/main/remote-server.ts` and the options type of `RemoteServer` (`rg -n 'bindHost|host\?:' youcoded/desktop/src/main/remote-server.ts`). Rewrite `remote-tailnet-bind.test.ts` so it constructs the server the way `tests/remote-server.test.ts` does (copy its `makeServer`/`start` helper verbatim), starts it with the bind option the pin was about, and asserts `server.address()` (or the server's own `address()` accessor) reports that host and a non-zero port; then stops it. Keep the two error-message cases only if they can be produced by calling the real function (an invalid host → the returned/thrown message); otherwise delete them and name them in the commit.

- [ ] **Step 3: Run, ledger, commit**

`npx vitest run tests/remote-tailnet-bind.test.ts tests/remote-server.test.ts` — expected pass. Ledger rows for all four. Commit with every deleted case title listed.

---

### Task 5: Group 3 — nineteen whole-file rules (one commit each)

**Files:**
- Create (workspace): `scripts/ast-grep/rules/<rule-id>.yml` and `scripts/ast-grep/fixtures/<rule-id>.tsx|ts` per row
- Modify (workspace): `scripts/ast-grep/check.sh` (`EXPECTED_VIOLATIONS`)
- Delete (app): the row's test file

**Worked example — `html-view-sealed.test.ts` → rule `iframe-sandbox-no-allow-same-origin`:**

- [ ] **Step 1: Write the rule**

`scripts/ast-grep/rules/iframe-sandbox-no-allow-same-origin.yml`:
```yaml
id: iframe-sandbox-no-allow-same-origin
language: tsx
severity: error
message: >-
  An <iframe sandbox> must never carry allow-same-origin: the preview runs in a
  sealed box with an opaque origin, so nothing a file contains can reach the
  app's storage, cookies or bridge (remote access batch 3, contract R20).
note: |
  Invariant source: tests/html-view-sealed.test.ts (retired by Plan B, 2026-09).
  Guard: this rule + its fixture. SCOPING: every renderer .tsx and the fixture.
files:
  - "**/src/renderer/**/*.tsx"
  - "**/fixtures/iframe-sandbox.tsx"
rule:
  kind: jsx_attribute
  has:
    kind: property_identifier
    regex: "^sandbox$"
  # the attribute's string value mentions the forbidden token
  regex: "allow-same-origin"
```

- [ ] **Step 2: Write the fixture that fires**

`scripts/ast-grep/fixtures/iframe-sandbox.tsx`:
```tsx
// Violation fixture for iframe-sandbox-no-allow-same-origin.
export const Bad = () => <iframe sandbox="allow-scripts allow-same-origin" />;
```

- [ ] **Step 3: Bump the count and run the checker**

In `scripts/ast-grep/check.sh`, below the last `# 2026-09-16: +1 …` line add `# <today's date>: +1 for iframe-sandbox-no-allow-same-origin (Plan B).` and change `EXPECTED_VIOLATIONS=11` to `12`. Run `bash scripts/ast-grep/check.sh <worktree>/youcoded/desktop/src`. Expected:
```
== fixtures (every rule must fire) ==
  OK — 12/12 rules fired on the violation fixtures
== real source (no rule may fire) ==
  OK — no invariant violations in …
```
If the fixture count is 12 but the rule is listed under "fired on NO fixture", the `files:` glob does not reach `fixtures/`; fix the glob.

- [ ] **Step 4: Invert the invariant in the real source, watch it fire, restore**

Edit `youcoded/desktop/src/renderer/components/artifact-views/HtmlView.tsx:42` to `sandbox="allow-scripts allow-popups allow-forms allow-same-origin"`. Run the checker: expected `FAIL — 1 invariant violation(s)` naming `HtmlView.tsx:42`. Restore the line (`git -C youcoded checkout desktop/src/renderer/components/artifact-views/HtmlView.tsx`). Run the checker: `OK`.

- [ ] **Step 5: Delete the test, run verify, commit both repos**

```bash
git -C <worktree>/youcoded rm -q desktop/tests/html-view-sealed.test.ts
bash scripts/verify.sh <worktree>/youcoded
```
Expected: `OK — all checks passed.` (verify runs the ast-grep checker against this worktree). Then in the workspace repo commit the rule + fixture + check.sh, and in the app repo commit the deletion; both messages: `test: html-view-sealed → ast-grep rule iframe-sandbox-no-allow-same-origin (inverted HtmlView.tsx:42, fired, restored)`. Ledger row.

- [ ] **Step 6: The other eighteen, same six steps each**

Use the rule id in the classification row. Shapes you will need beyond the example:
- **Forbidden call inside a named function (class D — `no-sync-fs-in-main-hot-path`, `no-sync-fs-in-main-read-path`, `buddy-window-move-only-in-place` and similar):**
  ```yaml
  rule:
    pattern: fs.$METHOD($$$)
    constraints:
      METHOD: { regex: "Sync$" }
    inside:
      kind: function_declaration
      stopBy: end
      has:
        field: name
        regex: "^(createLeaseClient|readTranscriptPage|…)$"   # copy the function names from the test file
  ```
- **A className that must not contain a hand-rolled recipe (class A — `no-hand-rolled-field-error`, `no-hand-rolled-dialog-header`, `no-two-bare-bg-utilities`, `no-arbitrary-text-size`, `section-label-canonical-classes` …):** match `jsx_attribute` whose name is `className` with `regex:` copied from the test's regex; exemptions the test kept in an `EXEMPT` table become the rule's `ignores:` list of file globs, or a `not: { regex: … }` on the same attribute.
- **Presence, not absence (`main-registers-all-quit-routes`, `app-no-switch-view-broadcast`, `perf-mark-sessions-listed-inside-session-list`):** ast-grep reports matches, so a "must exist" check is written as its negation over the enclosing file: `kind: program`, `not: { has: { pattern: app.on('window-all-closed', $$$), stopBy: end } }` with `files:` naming only that file. One fixture file that lacks the call.
- **`tooltip-wraps-forwarding-element`, `no-bare-glyph-item-action`:** `jsx_element` with `has:` the opening element name and `not: has:` the required child shape.
For each rule, the test file's own regex and its `EXEMPT`/known-positive lists are the spec; copy them into `note:` so the rule explains itself. A rule that cannot express the test's check (say, "at least 100 files were scanned" — class H) is dropped, not approximated: the non-vacuity check is what `check.sh`'s fixture pass now provides.

Commit after each file. Push after every three.

---

### Task 6: Group 4 — the 55 mixed files

**Files:** each row of Group 4 in the classification file; rules and fixtures under `scripts/ast-grep/` as in Task 5; `youcoded/desktop/eslint.config.mjs` for the rows marked `eslint`.

**Worked example A — delete the pin (`prompt-assembly.test.ts`, row says `—`):**

- [ ] **Step 1:** Open the file; the case at line ~228 is `it('the prompt is assembled FROM the parts, never beside them', …)` and reads `prompt-assembly.ts` as text. Delete the whole `it(…)` block and the five-line comment above it that begins `// The join test below is TAUTOLOGICAL`. Remove the `fs`/`path` imports only if nothing else in the file uses them (`rg -n 'fs\.|path\.' tests/prompt-assembly.test.ts`).
- [ ] **Step 2:** `npx vitest run tests/prompt-assembly.test.ts` — expected `27 passed`. Ledger row: `28 → 27, deleted "the prompt is assembled FROM the parts, never beside them"`. Commit.

**Worked example B — the pin becomes a rule (`session-drawer-skips-parent-rerenders.test.tsx` → `artifact-provider-value-memoized`):**

- [ ] **Step 1:** The case at lines ~85–100 reads `App.tsx` and asserts `<ArtifactProvider value={artifactContextValue}>` with `useMemo`. Rule:
```yaml
id: artifact-provider-value-memoized
language: tsx
severity: error
message: <ArtifactProvider value=…> must be a memoised identifier, never an inline object — an inline value re-renders every context consumer on every parent render.
files: ["**/src/renderer/App.tsx", "**/fixtures/artifact-provider.tsx"]
rule:
  kind: jsx_attribute
  regex: "^value=\\{\\{"
  inside:
    kind: jsx_opening_element
    has: { kind: identifier, regex: "^ArtifactProvider$" }
```
Fixture `scripts/ast-grep/fixtures/artifact-provider.tsx`: `export const Bad = () => <ArtifactProvider value={{ a: 1 }}>x</ArtifactProvider>;` (declare `const ArtifactProvider = (p: any) => p.children;` above it so the file parses). Bump `EXPECTED_VIOLATIONS`, run the checker, invert `App.tsx` (`value={{...artifactContextValue}}`), see it fire, restore.
- [ ] **Step 2:** Delete the source-reading case from the test; keep the render-count case. Run the file. Ledger. Commit both repos.

**Worked example C — eslint carries it (`voice-assets.test.ts`, "never reaches for child_process"):**

- [ ] **Step 1:** In `youcoded/desktop/eslint.config.mjs`, after the `files: ['src/main/**/*.ts']` block (line ~99–111) add:
```js
  {
    // WHY: voice-assets must stay pure I/O — it used to be guarded by a test that
    // grepped its source for the import (Plan B, 2026-09). Lint sees the import.
    files: ['src/main/voice/voice-assets.ts'],
    rules: { 'no-restricted-imports': ['error', { paths: ['child_process', 'node:child_process'] }] },
  },
```
- [ ] **Step 2:** Invert: add `import { execFileSync } from 'child_process';` to `voice-assets.ts`, run `npm run lint` in `desktop/` — expected one error naming that line. Restore. Delete the two grep cases from the test (name them). Run the file. Commit.
The other eslint rows (`useVoiceInput` and `voice-rehear`: `no-restricted-syntax` with a selector on the identifier or the `import.meta.env.VITE_WORKBENCH` member expression; `chatgpt-oauth`: `no-restricted-properties` for `toLocaleString` scoped to `src/main/providers/chatgpt-types.ts`) follow the same shape. `tsc` rows (`dev-load-recovery`, `shim-parity`): the "import must exist" half is already enforced by the import itself compiling; delete the case and, for `shim-parity`, add the shared interface the row names (`export interface SessionBridge { … }` in `src/shared/types.ts`, implemented by both `preload.ts` and `remote-shim.ts` — the type checker then refuses a drifted method list).

- [ ] **Step 3: Every other Group 4 row**, in table order, one commit per file: keep the cases the row says to keep untouched; for each source-reading case, either write the named rule (Task 5's shapes) or delete it (`—`); ledger row with the before/after counts and the deleted titles. `animation-frame-budget.test.ts` (45/45, CSS half kept): move its CSS cases to a new `tests/animation-css-budget.test.ts` using `readSource`, and convert the TSX sweeps to `no-unstepped-infinite-animation`. Push after every three files.

---

### Task 7: Close the group out

- [ ] **Step 1: Regenerate the inventory and compare**

Run `node scripts/test-inventory.mjs <worktree>/youcoded/desktop > docs/active/plans/2026-09-16-test-inventory.md` and read section 3. Expected: only Group 5's 19 files, the CSS file from Task 6, and Group 0's 14 false positives remain. Any other file listed is unfinished work — go back to its row.

- [ ] **Step 2: Reconcile the ledger against the suite**

Run `npx vitest run 2>&1 | grep -E 'Tests  '`. Expected: `baseline passed − (sum of "deleted case titles" rows) == Tests passed`, give or take cases you ADDED (the reader test, the tailnet test). Write the arithmetic into the ledger's last line. A shortfall is a test lost without a name; find it (`git log --stat` per commit) before going on.

- [ ] **Step 3: Full verification and the three-OS proof**

`bash scripts/verify.sh <worktree>/youcoded --full` — `OK`. `gh workflow run desktop-ci.yml --ref session/ci-followups-b`; read the result; all three legs green.

- [ ] **Step 4: Rule and doc updates (workspace repo)**

In `.claude/rules/test-suite-hygiene.md`, the sentence "**Prefer an ast-grep rule to a new source-text guard** — 112 files already grep source as text" becomes "**A new source-text guard needs a reason a rule cannot express** (parity across languages, CSS↔TSX coupling). The 2026-09 sweep converted or deleted the rest; the list that remains is `node scripts/test-inventory.mjs` section 3." Keep the body ≤ 600 words (`node scripts/audit-anchors.mjs --no-diff` must not report a budget violation). Add `- path: scripts/ast-grep/rules/iframe-sandbox-no-allow-same-origin.yml` under `verify:` in that rule. Update `docs/code-intelligence.md` if it lists the ast-grep rules by name.

- [ ] **Step 5: PRs and stop**

One PR per repo for the whole sweep (the commits are per file, so the diff reads per file). Body: the ledger's baseline line and final arithmetic, the count of rules added, the list of deleted files. Report to Destin in plain words — how many tests were replaced by rules, how many deleted and why, what stays — and end with **ready to merge?**
