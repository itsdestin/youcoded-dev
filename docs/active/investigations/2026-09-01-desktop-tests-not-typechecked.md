---
date: 2026-09-01
status: active
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

**History.** Filed 2026-08-06; re-verified 2026-09-01 (still a single tsconfig).
