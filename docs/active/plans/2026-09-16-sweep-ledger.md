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
| `tests/landing-demo-fade.test.ts` | 2 | 0 (file deleted) | `clears and centers the demo exactly once on wide-screen activation`; `finishes the passive reveal before the demo top leaves the viewport` | — |
| `tests/remote-preview-gate.test.ts` | 1 | 0 (file deleted) | `keeps remote Info available in the preview, and gates its body on a rendered view` | — |
| `tests/remote-place-app-wiring.test.ts` | 14 | 0 (file deleted) | `the session list on mount selects only when allowed`; `a newly created session is focused only when allowed`; `switching to a remote host selects only when allowed`; `no ungated "first session" select is left behind`; `the hydrate handler chooses the place, marks it decided and reports what was kept`; `the destroyed handler uses the desktop's focus in remote mode`; `the first page asks only when the rule allows it`; `the place is remembered on every selection change once decided`; `every setSessionId call site is accounted for — a new one must be looked at`; `the hydrate decides the place, wakes waiting first pages, and selects the choice — remote only`; `the place on screen wins over storage, in the hydrate and when a restore ends without one`; `a restore starting resets the decision; one ending without a hydrate decides with what exists`; `the place is written only once decided, and first pages re-run when a hydrate lands`; `back on the device's own runtime the strip is cleared, and the welcome screen waits while catching up` | — (Task 4/global.md: deleted, not replaced — App still cannot be mounted in a unit test) |
| `tests/remote-tailnet-bind.test.ts` | 3 | 3 | none (all three rewritten as behaviour tests) | real `start()`/`stop()` against a real socket on 127.0.0.1, mocked `RemoteConfig.detectTailscale` |
| `tests/html-view-sealed.test.ts` | 1 | 0 (file deleted) | `the sandbox attribute never gains allow-same-origin` | ast-grep rule `iframe-sandbox-no-allow-same-origin` |
