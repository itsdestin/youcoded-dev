---
status: shipped
---

# D3 — Read verifies bytes before repeat notices

Scope: Task D3 only in `/home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926`. Preserved all existing uncommitted A/B/C1/C3/D1/D2 work; C2 remains deferred. No commit, push, live app/config access, dependency addition or paid evaluation.

## Red and green evidence

- Before the production edit, `cd youcoded/desktop && node node_modules/vitest/vitest.mjs run tests/native-tools-polish.test.ts tests/harness-tools-core.test.ts tests/harness-tool-guards.test.ts` exited **1**: `native-tools-polish.test.ts` had **3 failures**, 220 passed and 3 skipped across the three suites. The same-size/same-mtime changed-byte case incorrectly returned the previous-content-current notice; the touched-mtime expectation and binary-replacement check also failed. This output was observed in the prior process as `/tmp/d3-red.log`; the PC restart removed that temp file. It cannot be recovered as a log and is not being represented as retained evidence. The original failing command and observed counts are recorded here, not a fabricated rerun against modified source.
- Before interruption, the same three suites exited **0**, 223 passed / 3 skipped (`/tmp/d3-green1.log` then; that temp log also did not survive the PC restart).
- After resume and additional refusal/reset tests: `cd youcoded/desktop && node node_modules/vitest/vitest.mjs run tests/native-tools-polish.test.ts tests/harness-tools-core.test.ts tests/harness-tool-guards.test.ts tests/harness-compaction.test.ts tests/native-clear-barrier.test.ts tests/native-compact.test.ts tests/line-budgets.test.ts` exited **0**: **296 passed, 3 skipped**, 7 suites (`/tmp/d3-final-owning.log`). The earlier resumed run with these same suites also passed 296/3 (`/tmp/d3-resume-expanded.log`). Expected summary-provider failure stderr is exercised by the compaction tests, not a test failure.
- `npm run typecheck` exited **0** (`/tmp/d3-type.log`); `npm run lint` exited **0**, 0 warnings / 0 errors (`/tmp/d3-lint.log`); `bash ../../scripts/ast-grep/check.sh` from desktop exited **0**, with 414/414 violation fixtures firing and no source rule failure (`/tmp/d3-invariants.log`).
- Non-full related `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926/youcoded` exited **0**: `PASS types`, `PASS types in tests/`, `PASS tests (related)`, `PASS dead code`, `PASS lint`, `PASS design lint`, `PASS invariants`, `PASS screens open`, `PASS journeys`, `OK — all checks passed` (`/tmp/d3-verify.log`). No full-suite verification was requested.

## Change and regression boundaries

`youcoded/desktop/src/main/harness/tools/read.ts` now makes the repeat decision *after* one async `readFile` buffer has passed binary sniff and requested-offset validation. `fingerprintOf(buf)` hashes that very buffer once; it controls both the served-slice identity comparison and the read-before-edit registry stamp. A same-size/same-mtime replacement delivers its new bytes; a mere touch can truthfully receive a short unchanged notice. The earlier slice key (`canonical path | offset | limit`) and `servedReads`/`readRegistry` formats remain unchanged. Refusals do not overwrite an old grant: stale Edit **and** Write still reject on their existing content-fingerprint checks. Image/PDF branches were not altered. `tools/types.ts` and the harness session's served-read comment now describe content identity rather than mtime as authority.

`youcoded/desktop/tests/native-tools-polish.test.ts` covers replacement with identical size and preserved mtime, unchanged content with touched mtime, binary and missing replacements, past-EOF refusal without a refreshed grant, stale Edit/Write, distinct offset, served-history clear, and one async read per text call (including repeat). Existing clear/compaction suites and line-budget test ran. After the desired tests passed, the superseded defect-*expecting* untracked `youcoded/desktop/tests/native-boundaries-audit-probe.test.ts` was removed; no other audit observations were removed.

**Limits:** tests prove a single async file read per call and inspect the one explicit `fingerprintOf(buf)` site; they do not benchmark a large file or simulate an adversarial replacement between stat and read. `servedReads.clear()` is exercised directly and existing session clear/compaction suites pass; no new end-to-end model run was made. Per project guidance, a paid harness evaluation may be offered separately but was not run.
