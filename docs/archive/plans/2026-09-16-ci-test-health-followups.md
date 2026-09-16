---
status: superseded
---
> **Superseded 2026-09-16** by three executable plans in this folder: `2026-09-16-ci-followups-A-protect-and-races.md`, `…-B-source-grep-sweep.md`, `…-C-test-consolidation.md`, with their data in `2026-09-16-test-inventory.md` (regenerate with `node scripts/test-inventory.mjs`) and `2026-09-16-source-grep-classification.md`. A and B can run in parallel (disjoint files); C only after B has merged (it moves the files B converts or deletes). This outline stays only as the record of what Destin approved.

# CI/test health — the work Destin approved on 2026-09-16, and how to do it

Source: the answered deck `docs/active/design/2026-09-16-ci-test-health/` (answers file
`…answers.202609161115.json`) and the findings in
`docs/active/investigations/2026-09-16-ci-test-health.md`. Branch `session/ci-test-health`
(both repos) carries the fixes that make master green and the two workflow changes; this plan
is everything that comes after it merges. Do them in this order — each one makes the next
cheaper.

## 0. Right after `session/ci-test-health` merges (youcoded first, then youcoded-dev)

**Q-1 — protect master.** The required check is `build (ubuntu-latest)`; it now exists on
every PR, and a docs-only PR reports it as *skipped* (counts as passing). Apply with the API,
not the web UI, so the setting is recorded:

```
gh api -X PUT repos/itsdestin/youcoded/branches/master/protection \
  --input - <<'JSON'
{"required_status_checks":{"strict":false,"contexts":["build (ubuntu-latest)"]},
 "enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null}
JSON
```
`enforce_admins: false` keeps a way through for Destin if a runner outage blocks everything.
Verify with one docs-only PR (check shows skipped, merge button enabled) and one code PR.
Then delete `scripts/ci-red-vs-master.sh` and its mentions — its job was to excuse red.

**Confirm the nightly ran** the next morning: `gh run list --workflow desktop-ci.yml
--event schedule`. A red nightly is a Windows/macOS regression that landed that day; the
session that sees it fixes it, it is not "someone else's test".

## 1. Q-6 — the two product races (one session, small)

Both are filed with their mechanism; the flaky tests are the proof.
- `native-harness.md → tools`: `shell-registry.ts` settles a run on the child's `exit`; stdout
  can still deliver after that. Settle on `close`, with a short grace (100–200 ms) after `exit`
  so a grandchild holding the pipe cannot hang the Bash tool. Re-enable the strict progress-bar
  assertion in `shell-registry.test.ts` as the guard.
- `local-models.md`: `EngineManager.stopAll()` resolves while a preset write is in flight.
  Track the in-flight write promise and await it in stopAll. Guard: drop the `maxRetries`
  band-aid in `engine-model-settings.test.ts` teardown and watch it stay green.
- While there: `lease-client.test.ts` — the lease file is present after every observed
  `rm()` resolved (dev-workspace.md → tests has the runs). Instrument the file-op queue
  (log op order + timestamps under `DEBUG_LEASE=1`), run the file 20× under `stress`, find the
  writer, then put the on-disk assertion back.

## 2. Q-4 — the 112 source-grep test files, in one session

Inventory and classes are in the findings doc §"Source-grep tests" and the sweep report
(classes A–H). Rules of the sweep:
- **Replace, don't just delete.** A = ast-grep rules (JSX shape; the repo has 7 already,
  `scripts/ast-grep/rules/`, fixture per rule, `EXPECTED_VIOLATIONS` bump). C = eslint
  `no-restricted-imports`. D = ast-grep with `inside:`. F (the two YAML parsers) = parse the
  YAML with the `yaml` package already in node_modules, or delete: electron-builder validates
  its own config at build time and Desktop CI builds it.
- **Keep** E (Kotlin ↔ TS parity, no type bridge exists), G (CSS ↔ TSX coupling) and H
  (non-vacuity guards) — but move any `split('\n')` behind one shared `readSourceLines()` in
  `tests/helpers/guard-scope.ts` that strips `\r`.
- **Delete** B where the pinned line is an implementation detail (`shell-session-renderer`,
  `landing-demo-fade`), replacing each with a behaviour test only if the behaviour has none.
- Every conversion: invert the invariant, watch the new rule fire, restore (the hygiene rule's
  "a guard you did not break…"). Run `bash scripts/ast-grep/check.sh <worktree>/desktop/src`
  and `verify.sh --full`; then one Desktop CI dispatch on the branch for Windows.
- Budget: this is a 112-file change. Split the PR by class (A, then C+D, then B+F) so each is
  reviewable, and land them the same day.

## 3. Q-5 — file tests by feature, then consolidate (the biggest job; plan it as its own build)

**The rule first** (a session's worth, ship before any moving):
- Add to `.claude/rules/test-suite-hygiene.md`: a new test goes in the file named for the
  module or feature it tests (`<module>.test.ts` beside its siblings), never a new file per
  task; a test name states the behaviour and carries no date, ticket, review-round, `§` or
  `(T<n>)`; comments say WHY, not the incident. Guard: an ast-grep rule on `it()`/`describe()`
  string literals matching `20\d\d-\d\d-\d\d|§|\(T\d+|R\d-\d` (fixture + `files: **/tests/**`).
  The rule will fire on the 134 existing names — fix them in the same PR (names only).
- `verify.sh` already runs `vitest related`; nothing else changes.

**Then the consolidation**, one prefix cluster per PR, largest first (`remote-` 54 files,
`session-` 39, `harness-` 32, `sync-` 26, `buddy-` 20 …; the full table is in the sweep):
- Target shape: one file per source module for unit tests (`tests/<module>.test.ts`), one per
  renderer surface for `.tsx` (`tests/<Surface>.test.tsx`), shared fixtures in
  `tests/helpers/`. `native-session-host.test.ts` (5,655 lines) splits by its 22 second-level
  describes into ~4 files (specialists, permissions/MCP, send-queue/quiesce, restart/replay).
- Mechanical moves only: `describe` blocks move whole, imports are merged, duplicated setup
  becomes one helper. No assertion changes in a move PR — a behaviour change is a separate
  commit so the diff stays reviewable.
- After each cluster: `verify.sh --full`, and the test count must not drop (print
  `Tests N passed` before and after; a lost test is a lost guard).
- Comment lines: 19% of the tree. In each moved file, keep the WHY at the top of the
  describe, drop the incident narrative (it lives in git history and the roadmap).

## 4. What this branch already changed that the above builds on
- `vitest.config.ts` exports the realpath temp dir; `.gitattributes` `eol=lf`; the
  `test-file-url-to-path` ast-grep rule; `check.sh` scans `desktop/tests`; the hygiene rule's
  "Windows runs this suite too" section.
- Desktop CI: `changes` job, PR = Linux only, master + nightly = all three. Android CI bundles
  the web files only (`npm run build:web`).
