---
status: active
work_item: 148
---
# Activity-report measurement review corrections

Independent review identified five bugs in the first integrated report pipeline. Parent verified each with failing-first tests in `scripts/harness-lab/activity-review-regressions.test.mjs` before correcting source.

## Corrections

- Orphan tool results retain explicitly observed errors and invalidate complete outcome/error totals. They no longer disappear into a complete zero-error count.
- Censored or invalid intervals make unclassified outside-request time unknown rather than treating an unfinished request as absent. Known closed-span unions remain observed subtotals, not complete wall-time accounting.
- Evaluation scorecards use the shared per-record importer. Malformed activity is marked unsupported while independent outcome rows and other valid records survive.
- Explicit complete-request coverage is forwarded to work-pattern analysis and per-input counts rather than discarded. Missing request arrays remain incomplete.
- Event object/type/data and tool identity/name structure are checked before a matching capture count can establish event completeness.

## Verification

Initial test authoring omitted required outcome evidence/coverage fields in two fixtures; those were corrected before accepting the red run. `/tmp/148-activity-review-red-valid-fixtures.log` records all five intended failures. The first broader test command inadvertently matched the concurrently developed `evaluation-modes.test.mjs`; that in-progress test was excluded from subsequent scoped verification, not modified. The historical open-interval test was updated to expect unknown outside time.

Executed from workspace root:

```sh
node --test scripts/harness-lab/activity-review-regressions.test.mjs scripts/harness-lab/activity-normalize.test.mjs scripts/harness-lab/evaluation-import.test.mjs scripts/harness-lab/evaluation-report.test.mjs scripts/harness-lab/evaluation-audit.test.mjs scripts/harness-lab/work-patterns.test.mjs
```

Result: **34 passed, 0 failed**. Log: `/tmp/148-activity-review-green-scoped.log`.

Regenerated the historical A/A report offline through `targeted_workflow.py report`, using the original `targeted-live-aa-v2/execution-manifest.json` and a fresh output directory:

`scratch/harness-lab/targeted-live-aa-v2-enriched-evidence-v4/`

JSON Schema validation passed for both emitted activity records. All referenced raw-source and analyzer SHA-256 values matched current bytes. Initial hash-verification command resolved analyzer basenames from the wrong directory; the corrected command resolved them from `scripts/harness-lab` and passed. `git diff --check` passed. Original evidence and previous derived reports remain unchanged.

Independent re-review requested. These corrections do not complete missing continuous collectors, validated semantic/recovery evidence, the new modes/task suite or the overall evaluation-product contract. No paid calls or production-app changes.
