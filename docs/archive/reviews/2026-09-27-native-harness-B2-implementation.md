---
status: shipped
---

# Task B2 — inherited project rules and path matching

Status: implemented in the isolated, uncommitted worktree; previously reviewed A1–A4/B1 left intact. No commit, push, live-app/config change or paid calls.

## Interface / scope

`buildTriggerIndex(cwd)` still returns `TriggerIndex.match(touchedPath): PathTrigger[]`. Internal `OwnedRule` holds its absolute owner separately from the readable source and stable rule id. Async discovery walks cwd upward through the **nearest** `.git` directory or linked-worktree `.git` file, loads each owner's `.claude/rules/*.md` broad-to-narrow, and matches globs against that owner's relative path. Without a Git marker it reads only cwd rules; nothing from personal/global or an outer project is inherited. Existing nested instruction discovery remains below cwd and bounded at depth 4; B1's ancestor instruction files are not indexed as nested triggers. A physical rule reached under more than one name is included once (realpath plus device/inode for hardlinks). This is matching/injection only, not permission policy.

The existing project-rule list grammar now handles quoted YAML scalar entries followed by comments and skips malformed/unsupported values; no new dependency was added. The listed `yaml`, `minimatch`, `picomatch` modules resolve only transitively, **not** as declared runtime dependencies, so the narrow supported frontmatter scanner and segment-aware globstar matcher remain local. `**` consumes whole path segments (including zero folders); `*` and `?` stay in one segment; malformed bracket patterns do not match. No new IPC, event, global discovery, loaded-state reconciliation (B3), or pre-write barrier (B4).

The existing source `path-triggers.ts` contained two literal NUL bytes, so Read rejected it as binary. Inspected positions 4622 and 4807, wrote an inspection-only escaped copy to `/tmp/b2-path-triggers-escaped.txt`, then replaced **only those two bytes** with the equivalent `\0` source spelling and verified the resulting NUL count was zero; the resulting source is readable by the file tools. The old `/tmp/native-audit-path-triggers.txt` was not used to overwrite source.

## Red/green commands and outcomes

- Before production edits: `cd youcoded/desktop && node node_modules/vitest/vitest.mjs run tests/path-triggers.test.ts tests/rule-injection.test.ts` → exit **1**, **4 failed / 30 passed (34 tests; 1 failed, 1 passed file)**. Git directory/file inheritance, narrowed child and quoted YAML/globstar failed.
- Added hardlink physical-identity regression: `node node_modules/vitest/vitest.mjs run tests/path-triggers.test.ts -t 'same physical rule'` → exit **1**, **1 failed / 24 skipped**, duplicate body present twice.
- Green: `node node_modules/vitest/vitest.mjs run tests/path-triggers.test.ts tests/rule-injection.test.ts tests/specialist-run.test.ts` → exit **0**, **76 passed (3 files)**.
- `npm run typecheck` → exit **0**, source and tests tsgo checks.

The matching half of `tests/native-instructions-audit-probe.test.ts` was removed after equivalent desired assertions passed in the owner suite; its remaining clear-history observation is reserved for B3, unchanged.

## Files, verification and limits

Changed `youcoded/desktop/src/main/harness/injection/path-triggers.ts`, `tests/path-triggers.test.ts`, `tests/rule-injection.test.ts`, and only the B2 half of `tests/native-instructions-audit-probe.test.ts`. Test fixtures cover owner-relative match order, ordinary Git and worktree-file boundaries, outside negative, duplicate physical rule, narrowed-session model-visible injected messages, quoted inline comments, globstar segment boundaries, single-star, question mark, malformed/unscoped exclusions. No project-wide recursive rule scan at model-step time. Full workspace desktop verification: `bash /home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926/scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926/youcoded` → exit **0**, `/tmp/b2-verify.log`: `PASS types`, `PASS types in tests/`, `PASS tests (related)`, `PASS dead code (knip)`, `PASS lint (oxlint)`, `PASS design lint`, `PASS invariants (ast-grep)`, `PASS screens open (shoot --check)`, `PASS journeys (click paths)`, `OK — all checks passed.` Android and marketplace Worker are explicitly outside that check; neither was changed.

## B2 review correction — flat paths list only

`readRule` now records the indentation of the first direct `paths:` list item and stops consuming the list on any nested mapping/sequence, non-list content, or inconsistent item indentation. Already valid flat entries remain, but later sibling-shaped entries cannot be smuggled in after an unsupported nested value. Unsupported unquoted mapping-shaped `- nested:` entries are not accepted as path globs. Legitimate quoted paths with dashes and inline comments still work. This is a discovery-only correction; B3's clear-history probe and A1–A4/B1 edits remain untouched.

- Red, before source correction: `cd youcoded/desktop && node node_modules/vitest/vitest.mjs run tests/path-triggers.test.ts tests/rule-injection.test.ts tests/specialist-run.test.ts` → exit **1**, **4 failed / 77 passed (81 tests; 1 failed / 2 passed files)**. The four failures pin nested mapping, nested sequence, nested sibling list, and malformed sibling indentation.
- Green: `node node_modules/vitest/vitest.mjs run tests/path-triggers.test.ts tests/rule-injection.test.ts tests/specialist-run.test.ts` → exit **0**, **81 passed (3 files)**.
- `npm run typecheck` → exit **0** (`tsgo --noEmit` source and tests).
- Updated `youcoded/docs/native-runtime.md:265` from the stale cwd-only rule-discovery claim to nearest Git root→cwd, owner-relative matching, no personal/global inheritance.
- Workspace desktop verification: `bash /home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926/scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926/youcoded` → exit **0** (log `/tmp/b2-review-verify.log`): PASS types, tests/types, related tests, knip, lint, design lint, ast-grep, screens and journeys; `OK — all checks passed.` Android/Worker not covered. The final added `nested:` negative assertion was also rechecked by `node node_modules/vitest/vitest.mjs run tests/path-triggers.test.ts tests/rule-injection.test.ts tests/specialist-run.test.ts` → **81 passed / 3 files**, and `npm run typecheck` → **exit 0**.
