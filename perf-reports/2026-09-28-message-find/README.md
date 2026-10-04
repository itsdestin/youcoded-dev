# Message-only Find: hardware measurements

Status: measured improvement for the specified desktop workload; uncommitted, not shipped. This is not completion of the broader performance program.

## Latest revision — on-demand search lifecycle

**This section supersedes the earlier candidate numbers below as the current implementation's status.** A cross-workload check subsequently found a candidate-only~140–165ms first-response stall with Find CLOSED. Removing the always-mounted search hook removed that pattern in two controlled variants. Narrowing its dependencies did not fix it and that experiment was reverted. The accepted architectural correction is `ChatFindBar`: its controller/index/effects exist only while the bar is open. A behavioral test recorded42 hook invocations during closed streaming before the correction and zero afterward; opening activates it and closing unmounts it.

Final app build fingerprint: `942374d2923c` on original app HEAD. Latest full desktop verification `scratch/find-on-demand-verify-final.log` passed all gates; new workspace tool tests `scratch/final-workspace-tool-tests.log` passed. Narrow independent review found no lifecycle/ref/query-reset issue.

Three matched streaming pairs (the third reverses run order), preserved in `on-demand/stream-pair-*.json`:

| Pair | Baseline first response / max long task | On-demand candidate first response / max long task |
|---|---|---|
|1, baseline first|58ms /70ms|26ms /96ms|
|2, baseline first|36ms /85ms|27ms /57ms|
|3, candidate first|43ms /57ms|38ms /93ms|

The distinctive candidate first-response delay no longer reproduced. **These samples do not prove zero stutter or an overall streaming-speed win:** shorter long tasks remain in both builds, and candidate maxima are higher in two pairs. External load was not continuously controlled; report those residuals rather than rounding them into a clean bill of health.

Three fresh hardware Find runs on this final lifecycle, preserved in `on-demand/find-{1,2,3}.json`: open29/46/41ms (median41), first query1024/944/988ms (median988), sum1053/990/1029ms (median1029). Selected `Turn3250:` remained visible AND uncovered in all3, with1000 of1020 rows still folded. Largest long tasks52/58/56ms, largest sampled rAF gaps61/83/67ms. The controller inspected run2's screenshot and confirmed the selected message was centered/readable with neighboring content present. **The earlier 'no >=50ms tasks' observation below is historical, not true of every final run.** The query still has cold-index latency and this is not the user's eventual no-hiccup target.

The on-demand change also encountered an intermittent Resume journey miss. A deterministic driver test reproduced stale coordinates after hover movement (100 vs200). The already-committed upstream driver fix `d0cd18b9` was applied to this workspace's `scripts/shoot/driver.mjs` only, with a red/green behavioral guard. App source/history was not rebased or merged, and no shipping actions occurred. A targeted Resume rerun and the final full verify passed; this establishes the corrected driver mechanism, not a retrospective proof that every earlier timeout had that cause.

## Configuration and provenance

Three interleaved baseline/candidate pairs on the same Radeon 8060S hardware-accelerated Chromium renderer, 1707×1016 viewport, device scale1.5, stock Midnight appearance. Each isolated packaged app starts with private synthetic data and1020 loaded timeline entries,1015 folded. Query `Turn 3250:` is a unique user-message prefix in the loaded offscreen history. No paid provider calls or live-app state.

App HEAD `bb939f917e3e64437825b24f3b86b02f14843825` on both sides. Preserved baseline build fingerprint `6ba3d8bf4a1a` includes the disconnected source-index prototype (not imported into the UI); original timestamp experiment was removed. Candidate fingerprint `834247109fe7`. Exact build metadata and GPU descriptors are in each JSON. Filenames `before-1.json` through `after-3.json` retain all runs, including failed baseline navigation. `summary.json` contains raw selected metrics and computed medians.

The focused diagnostic does not continuously sample external interference or apply the full perf-lab comparator. These are interleaved same-machine observations, not a full-suite automated KEEP or a statistical claim from many samples.

## Results

| Metric | Before, runs1/2/3 | After, runs1/2/3 | Median comparison |
|---|---|---|---|
| Find open, ms |1760 /1784 /1660|27 /26 /25|1760→26 (98.5% lower)|
| First query to exact Range, ms |121 /66 /122|647 /648 /655|121→648 (slower as a separate phase)|
| Sum of open + query phases, ms |1881 /1850 /1782|674 /674 /680|1850→674 (63.6% lower)|
| Worst JavaScript long task, ms |1403 /1408 /1366|none /none /none|No task meeting the50ms API threshold in candidate windows|
| Largest sampled rAF gap over32ms, ms |1745 /1744 /1702|39 /39 /44|1744→39; NOT displayed-frame/drop-rate evidence|
| Folded entries after search |0 /0 /0|1000 /1000 /1000|Avoids rebuilding the full loaded history|
| Exact selected text |Turn3250 in registry in all|Turn3250 in registry in all|Same exact query target|
| Selected text stays visible and uncovered |FAIL /FAIL /FAIL|PASS /PASS /PASS|Actual element hit test +300ms stable visibility|

**The baseline cannot be described as a successful end-to-end search.** It registered the right Range but returned the viewport to the conversation tail. Its reports correctly say `find-result-unconfirmed`, and the baseline diagnostic exited2. Opening/query-phase timings remain recorded, but `open + query` is a sum of phase clocks, not time to a successfully visible baseline result. Candidate reports say `measured`, exited0, and passed occlusion-aware navigation.

**The first query now takes longer on its own:** index construction yields across browser tasks rather than paying all render cost before Find opens. The combined phase time is lower and the long freeze is absent in this workload; do not omit the per-phase tradeoff. No guarantee of zero stutter: candidate rAF gaps39–44ms remain, and there is no compositor/presentation trace.

## Correctness and visual verification

Search covers loaded authored user messages and assistant text replies only; no reasoning, tool inputs/results, injected tool/specialist cards, timestamps or chrome. Older unloaded history is not searched. Artifact document Find is unchanged. Source text caching is per body; query/source cancellation and fixed-throttle refresh prevent continuous streaming starvation. Selected folded rows are pinned; nearby viewport rows unfold without global expansion.

An earlier candidate opened quickly but blocked~900ms on first-query parsing. Async sliced preparation replaced that uninterrupted work. Another candidate had the right Range but invisible navigation: late content expansion and browser scroll anchoring shifted it behind bottom chrome. The final fix releases bottom-stick before search navigation and uses a bounded post-layout correction (up to4 corrections/800ms, stopped on user intent/close). See workspace `scratch/find-navigation-runtime.md` for the causal trace.

Controller inspected final `scratch/perf-lab/find-accepted-after-2.png`: Turn3250 is centered and readable, with neighboring messages present. The diagnostic additionally checks the selected Range text, viewport intersection and `elementFromPoint` hitting its own row, continuously across300ms. Screenshot acquisition/geometry proof happen outside phase clocks to avoid charging measurement layout to the app.

## Verification and remaining limits

Focused suite:83 tests passed before the final listener-cleanup refinement; the targeted late-layout test and types passed afterward. Latest full desktop verification `/tmp/find-navigation-private-verify-final.log`: types, test types, related tests, knip, lint/design lint, ast-grep, shoot screen checks and journeys all passed. Independent reviews checked source/count/highlight/cancellation/folding/navigation changes and the final bounded correction. No Android build/device performance result is claimed.

Not yet measured for acceptance: larger loaded histories, retained index memory, repeat-query and close/reopen costs, pathological giant single Markdown bodies, all themes, remote/Android, sustained real streaming with Find open, and whole-app cross-workload regressions. A single unusually large Markdown body is still an indivisible parse. Source-to-rendered-text correspondence is guarded for tested Markdown constructs; future custom renderer extensions need equivalent fixtures. Benchmarks are local manual tools, not scheduled CI.
