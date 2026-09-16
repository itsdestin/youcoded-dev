# Source-grep sweep ledger (Plan B)

Baseline 2026-09-16: Test Files 888 (886 passed, 1 skipped, 1 failed), Tests 11613 total (11569–11570 passed, 43–47 skipped across two runs), `it(`/`test(` sites 9958, EXPECTED_VIOLATIONS=11.

The one failing file is load-sensitive and outside this plan: `tests/chatgpt-request-diagnostics.test.ts` › "evicts inactive fingerprints within 8 MiB and drops an oversized observation" took 46.6s under the full run and passes alone in 5.3s. The budget to reconcile against is the **total** (11613), since skip counts wobble between runs.

Packaging (Destin, 2026-09-16): one PR per repo for the whole sweep, one "ready to merge?" at the end — Task 7's wording governs over the per-group line in Global Constraints.

| file | cases before | cases after | deleted case titles | rule / tool added |
|---|---|---|---|---|
| Group 5 (20 files — the table under `## Group 5` lists 20 rows though its heading says "19 files"; all 20 processed) + guard-scope-reader.test.ts | 279 | 280 | none | readSource (tests/helpers/guard-scope.ts) |
| `tests/installer-artifact-names.test.ts` | 4 | 4 | none | yaml parse |
| `tests/app-icons.test.ts` | 12 | 11 | `every theme without its own appIcon falls back to the bundled icon, not a synthesized one` | yaml parse |
| `tests/android-manifest-voice.test.ts` | 2 | 2 | none | DOMParser |
