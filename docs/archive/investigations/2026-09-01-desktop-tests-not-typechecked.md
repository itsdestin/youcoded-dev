---
date: 2026-09-01
status: shipped
type: investigation
topic: desktop/tests/ is neither type-checked nor linted — tsconfig's include stops at src/
---

# `desktop/tests/` (~350 files) is neither type-checked nor linted

**Mechanism.** `youcoded/desktop/tsconfig.json`'s `include` is `src/**/*` only, and there is no
second tsconfig for the test tree, so `tsc --noEmit` never sees it — vitest executes those files with
esbuild stripping types without checking them. The ESLint config is scoped to `src/**` for the same
reason: type-aware rules need the files in a TS project.
<!-- claim: {"path": "youcoded/desktop/tsconfig.json", "contains": "\"include\": \\[\"src/\\*\\*/\\*\"\\]"} -->

**Fix.** One tests tsconfig unlocks both at once. `scripts/verify.sh` states this limitation in its
header; this is the fix for it. Expect a first run to surface a backlog of type errors in tests —
land the config and the fixes together so the gate never ships red.

**FIXED 2026-09-02.** `desktop/tsconfig.tests.json` extends the base and changes exactly three
things, each measured rather than guessed: `moduleResolution: "bundler"` (vitest resolves through
Vite, and classic node resolution alone produced 12 phantom "cannot find module" errors for `vite`
and `@vitejs/plugin-react`), `allowJs` + `checkJs: false` (several suites import the untyped
`test-engine/*.mjs` orchestrator — 57 implicit-any errors without it), and `DOM.Iterable` in `lib`
(iterating a `querySelectorAll` result, 5 errors). After those three the tree still held **201 real
type errors in 57 files**; those files are listed one per line in the config's `exclude` so the gate
ships green, and `scripts/verify.sh` prints the remaining count on every run. 514 of 571 files are
type-checked today. One error was fixed rather than excluded — `tests/helpers/chat-store-harness.ts`
is imported by three suites, and `exclude` does not apply to a file another included file imports.

The lint half landed in the same change: a `tests/**` block in `eslint.config.mjs` carrying the
syntactic (project-free) half of the src rule set. It found 5 errors across 4 files, all false
positives on deliberate code, each now carrying a named `eslint-disable` with its reason. The
type-aware rules are deliberately absent until the exclude list is empty — pointing them at the
tests project would fail all 57 excluded files with "not found in project", a config error dressed
up as a lint finding.

**History.** Filed 2026-08-06; re-verified 2026-09-01 (still a single tsconfig); fixed 2026-09-02.
