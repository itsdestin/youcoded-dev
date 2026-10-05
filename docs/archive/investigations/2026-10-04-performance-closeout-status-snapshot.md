---
title: Performance closeout — superseded status and diagnostic snapshot
status: superseded
date: 2026-09-29
---

# Historical status snapshot — not current instructions

Archived on 2026-10-04 to preserve the interim diagnostic wording and measurement inventory without mixing them into the current restart page. Present-tense statements below, including open PRs and merge blockers, describe earlier checkpoints and must not be treated as current state. The authoritative current page is `docs/active/investigations/2026-09-29-performance-status.md`; both app #591 and workspace #235 subsequently completed their closeout.

This is the current status map. Earlier dated reports are historical evidence, not a list of changes all accepted for shipping. Destin authorized documentation consolidation, cleanup and merge of the real fixes on 2026-09-29. The accepted app fixes merged in youcoded#591 (`eebcdea314c5d6b42444d991789a2541c405dbb8`, 2026-10-04T07:21:06Z). This is an app merge reference, not a claim of whole-app smoothness or workspace PR closure.

## Closeout resumed 2026-10-03 — final verification

Latest acceptance evidence: `docs/archive/investigations/2026-10-03-find-expiry-closeout.md`. The expiry repair passed a package-attributed delayed-frame check and an uninstrumented real-display check, with inspected screenshots and a stable uncovered match in each. Integrated Android unit XML contains 594 tests in each of debug/release/releaseTest with zero failures/errors/skips; Gradle executed all three app unit-test tasks, excluding `bundleWebUi`. The final eight-worker desktop full verification passed every gate, explicitly including screen-open checks and journeys. A prior superficially green rerun exposed a pipefail bug that omitted the screen gate; the gate is now fixed with an actual-planner red/green regression and CI coverage. Workspace script/hook tests passed 431/431, and the full CI-equivalent perf-tool suite passed 594/594 (fixture-download test excluded). App PR `youcoded#591` merged at `eebcdea314c5d6b42444d991789a2541c405dbb8` on 2026-10-04; its prior branch tip `6e355a828` is an ancestor. The workspace PR remains separate.

### Preserved diagnostic history (pre-merge snapshot; superseded by final acceptance above)

App PR `youcoded#591` remains open at `7855bc6ce`; its recorded Android and Linux desktop CI checks passed. The full desktop verification and Android unit runs from the previous closeout are historical results, not verification against the newer master. Startup preserved this session and reported 100 incoming workspace commits; the app has 170 incoming commits relative to its fetched master. Neither has been silently integrated.

**Runtime blocker:** `scratch/perf-lab/closeout-find-final.json` and `closeout-find-final-repeat.json` selected the correct `Turn 3250:` result and `1/1` count but left its Range under bottom controls. Both coincided with roughly 1 Hz animation callbacks. The ResizeObserver correction schedules an animation callback but expires after 800 ms. Whether expiry cancels already-delivered work or layout itself arrives too late remains under investigation; no repair or final runtime acceptance is claimed. The earlier successful `closeout-find-accepted.json` does not override these failures.

**Controlled diagnosis on 2026-10-03:** `scratch/perf-lab/find-lifecycle-delayed.json` used the unchanged `7855bc6ce` package with diagnostic API wrappers and a deliberate 1,000 ms delay on frames requested by newly wrapped ResizeObservers. RO id 1 delivered at 5643.6 ms after the selected Range moved from approximately y=531 to y=908.7 (bottom chrome starts at y=905.7), queued frame -1, then the 800 ms expiry cancelled that frame and disconnected at 6438 ms without a correction. The final hit test returned BUTTON; the screenshot was inspected and confirms the target is hidden below the controls. This records a pending-frame cancellation coinciding with the failed navigation. Review identified that the wrapper affects every newly constructed RO, not a uniquely identified Find observer; a new capture must include callsite/target attribution before treating the intervention as Find-specific. Three instrumented runs without artificial delay succeeded. Wrapper geometry reads perturb timing: these are causal diagnostics, not performance comparisons, and do not establish the exact callback sequence in the earlier natural failures or rule out layout arriving after expiry. The minimal expiry-flush repair is now implemented locally and independently reviewed for the pending-frame case. The parent reproduced the regression on the original expiry (`expected 3 scroll calls, got 2`) and restored the repair; all 12 focused Find tests passed. The app integrated the fetched newer master without conflicts with its merge commit held pending verification. The first integrated full desktop verification failed in three groups: tests (bash-env startup hook, two MCP startup tests and an exhaustive Markdown test timed out), source invariants, and screen-open checks. All 108 tests in the three affected unit files passed in the focused rerun. Newer workspace master contains updates to the failing buddy/iframe rules and Office screenshot tooling, so workspace integration is required before treating those old-tool failures as product defects. No final runtime acceptance or merge is claimed.

The paused-source archive remains byte-identical (SHA-256 `96be2238455ca155b954192c453c813f07d7f2716919419046770291c3b5bcad`); an archive-content scan on resume found no matches for the private-key, OpenRouter-key or GitHub-token patterns checked. This limited scan is not a comprehensive privacy clearance.

Private raw evidence is preserved outside this worktree. The original resume snapshot at `/home/destin/youcoded-perf-evidence/performance-history-audit-2026-10-03/scratch/` has 109,485 verified regular files. The newer `final-scratch/` sibling holds **116,217 verified regular files and 430 matching symlink targets, zero mismatches**, including final Find captures and the repaired package; see `final-sha256-manifest.json`. These are private local recovery copies, not publication material. Later shipping logs live under the same evidence root's `shipping-receipts/`. See the evidence index for recovery details.

## Established app fixes shipped in youcoded#591

| Change | Evidence | Remaining boundary |
|---|---|---|
| Loaded-message Find, on-demand lifecycle and reliable reveal | `perf-reports/2026-09-28-message-find/README.md`: repeated 1,020-entry runs, open median41ms, first query988ms, exact visible/uncovered navigation. Controller unmounted while closed. | Does not search never-loaded pages; cold indexing remains slow. |
| Preserve unchanged inherited chrome measurements on session switch | `docs/archive/investigations/2026-09-28-short-cycle-results.md`: matched full-content55–56ms switches /53–54ms tasks versus15–17ms/no long task; theme-position correction and regression. | Not a fix for every intermittent switch/resize stall. |
| Re-pin stuck chat after content shrink as well as growth | `docs/archive/investigations/2026-09-29-long-history-mixed-files.md`: reproduced~289px gap, latest tool acknowledgment/card delivered visibly after repair. | Preserve user unstick/Find and existing tab-return policy. |

These three passed integration verification and the loaded Find expiry repair passed delayed attributed and ordinary packaged acceptance before the app merge (`eebcdea314c5d6b42444d991789a2541c405dbb8`). This does not certify other Find cases or smoothness over hours. Measurement tooling is separate: private fixtures, exact output/history checks, immutable finalized protocol receipts and fail-closed validity gates are infrastructure, not extra app speedups.

## Paused experiments — NOT accepted app fixes

The interrupted renderer experiments were removed from the integration source and preserved as restart material in `docs/active/prototypes/2026-09-29-paused-rendering/source-snapshot.tar.gz`. All 27 snapshot checksums were verified before removal. The archive also contains established changes: never apply it wholesale over master. None of these experiments ships with the three established changes.

- **Shared highlighter registry:** source review and139 focused tests/types passed. A first unprofiled comparison had122/145ms hidden tasks before and98/106ms after; later variability/residual parsing prevents a completed-stall claim.
- **Literal paragraph parser:** direct JSX bypass was rejected because it changed streaming DOM identity. Revised parser-level shortcut preserves ReactMarkdown and has143 focused tests/types reported. One sampled mixed comparison had23→0 long tasks; exact-package stack analysis found3,540 of12,650 phase samples under remark-parse before and none after. Sample counts are not pure CPU time or a controlled speed ratio. Narrow whitelist excludes common punctuation; ordinary-language benefit is unaccepted.
- **Hidden physical scroll gate:** one combined candidate retained91/91ms hidden tasks. Review repaired a redundant new activation pin and a committed-hide/observer delivery race;37 focused tests passed. Legacy tab-return bottom policy was not changed. Final runtime activation/Find acceptance missing.
- **Cooperative first-page preparse:** caches mdast only, not the entire rendering pipeline. Initial175 focused tests/types were reported before further corrections. Work was interrupted while fixing actual rendered-group coverage, global cache budgets/serialized scheduling and test-only API cleanup. No final review, fresh final verification, first-content latency result or runtime win exists. Existing complete-page loading and immediate activation must not get worse.

The most recent packaged candidate stamp was `4d7b0adf86f9`; it predates the interrupted preparse source and later scroll review repairs. NEVER benchmark it as the current source.

## What has been measured

- Historical audit screened8,658 commits and inspected189 app patches including110 perf-prefixed commits; not an exhaustive audit of every diff or proof of every historical speedup.
- Chat lifecycle:20 GC-assisted cycles/40 closed chats, heap11.98→14.33MiB; no large DOM/listener leak demonstrated. Small retained trend unassigned; not a long soak.
- Input during history loading: reproduced synchronous hidden first-page Markdown construction (42–43 blocks,~80–105k source characters) in long renderer tasks. Fresh-only control and profiles establish the mechanism; scheduling-only batching was rejected for moving work into activation.
- Fresh mixed activity: three50-delta/sec streams, two40-second actual private tools and one idle chat; exact1,500-delta outputs and tool results, twelve sustained switches and background progress verified.
- Long mixed histories: six200-turn/400-message seeds,≥240 authored rows loaded per chat, many folded; Files open on selected sessions, correct per-session restoration and exact histories/results checked. Not giant-body coverage.
- Terminal200/2,000-line bursts: exact raw output and visible suffix; one hardware67ms task, cause unassigned. Watcher200/1,000 create/edit/delete legs: exact events/disk/list/UI; prewarmed watcher, not sync.
- Native presentation: actual Wayland compositor feedback on180Hz output. Valid paced scroll captures commonly5.556ms intervals; actual input6.2–6.5ms, not achieved180Hz. Valid Files-open mixed capture8–81ms click→rAF and four tasks(max75ms); later foreground Files-closed8–28ms/no≥50ms tasks. Not repeated/interleaved causal A/B, certified FPS, per-switch presentation latency or photons.
- External read-only live memory snapshot: short PSS decline rather than current pressure, no leak verdict. Watch-scope issue was deferred here; upstream subsequently merged `youcoded#590`, so do not refile it as an unimplemented fix.

## Open problems and unmeasured coverage

Primary open bugs: hidden-history typing stalls; intermittent switch/viewport-resize stalls (up to208ms switching proxies and422ms callback gap observed, not universally attributable); first Find query cost; older~1Hz callback episodes. More successful runs do not resolve failed or slow originals. Raw log lifetime gaps remain possible and fail validity checks.

Coverage still needed: long soak; other-surface lifecycle; giant messages/history bodies; sustained/multiple terminals with typing; expensive repeated tool churn; private sync interference; effects-heavy native mixed presentation; native OS drag/resize; Android/remote device motion; Find streaming/reopen/index-retention; independent connection attribution and input-to-photon measurement. These are coverage gaps, not proven defects. Long soak was explicitly deferred.

## Resume safely without redoing completed work

1. Start from the merged accepted source and the consolidated `docs/roadmap/perf.md` priority list, not a stale candidate package.
2. Read the preserved experiment inventory before restoring anything. Restore only the selected experiment onto a fresh isolated branch, adapt to current source (first-page loading moved upstream), and run its focused tests. Do not blindly apply a full old-tree patch.
3. Reprofile if assumptions changed. Measure both responsiveness and resume→complete visible content; exercise an immediate switch while loading, source/content equivalence, Find/scroll intent and cleanup/memory. Accept no missing content or relocated hitch.
4. Keep timing runs serial and separate sampled diagnostics from clean baselines. Failed originals remain retained, with subsequent corrections in new reports.

Evidence map: `docs/archive/investigations/2026-09-28-short-cycle-results.md`, `docs/archive/investigations/2026-09-29-long-history-mixed-files.md`, `docs/archive/investigations/2026-09-29-native-presentation-feedback.md`, `docs/archive/investigations/2026-09-29-presentation-followup-results.md`, plan `docs/active/plans/2026-09-29-history-rendering-and-stalls.md`. Older rejected experiments and their reports must not be resurrected as accepted wins.
