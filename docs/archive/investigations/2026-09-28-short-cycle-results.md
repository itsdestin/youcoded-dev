---
title: Short-cycle performance — lifecycle and interaction evidence
status: superseded
date: 2026-09-28
---

# Short-cycle results

User scope: streaming/input, memory/lifecycle, terminal/watcher/sync bursts and GPU smoothness. Short cycles first; long45–60minute soak explicitly deferred. These results are not whole-app acceptance.

## Native presentation-feedback follow-up

The first native-Wayland hardware-qualified compositor-feedback capture is documented in `docs/archive/investigations/2026-09-29-native-presentation-feedback.md`. It adds actual presented/discarded surface-commit evidence, not rAF-as-FPS, with explicit conditional surface attribution and input-pacing limits. This does not retroactively validate older Xwayland presentation metrics or resolve the intermittent 1Hz callback issue.

## Hardware GPU/theme diagnostic — initial Midnight run

`scratch/perf-lab/gpu-midnight-runtime-1.json` and its `.trace.json` / `.png` completed in the private real-display app. Screenshot inspected: actual resumed fixture transcript, Midnight theme, no wizard/blank screen. Browser SystemInfo reported AMD Radeon 8060S through ANGLE/Mesa, GPU compositing and rasterization enabled. XRandR reported 2560×1600 at 179.89 Hz; test viewport was 1400×900 with approximately DPR 1. This confirms hardware conditions, not displayed-frame delivery.

The traced single-step diagnostic recorded no ≥50 ms renderer task during idle or the 350-pixel scroll; viewport resize recorded a 386 ms task, session switch a 699 ms maximum task (three tasks totaling 1,018 ms). Resize is a CDP layout override, not a native window drag. These are instrumented first-run leads, NOT unprofiled baselines or GPU-cause attribution. Resumed history preparation and tracing overhead remain potential confounds.

Raw trace includes one Renderer process, PipelineReporter, FrameSequenceTrackerV3 and AnimationFrame::Presentation events. A Layout span was 263,578 µs wall time but only 21,654 µs thread duration; UpdateLayoutTree reached 209,574 µs wall / 91,347 µs thread. These differences preclude equating wall spans with CPU work. Frame-sequence samples contain overlapping RAF/JSAnimation counters and PipelineReporter includes NO_UPDATE_DESIRED states: no naïve event-count/drop percentage is valid. Presented/dropped frame metrics remain unsupported pending version-specific parsing and app/leg attribution.

The initial Devil's Garden attempt stopped before workload: effective wallpaper URL, 14px panel blur, 10px bubble blur and a particle canvas were present, but ResourceTiming did not confirm the custom-scheme image. The corrected probe independently decodes the actual CSS URL (resource-readability evidence only), with screenshot review for visible wallpaper. A later attempt stopped at session-pill readiness. Subsequent runs captured actual strip IDs and succeeded; the historical pill timeout's exact cause remains unproven.

### Settled, trace-off resize/switch reproduction

Reports: `scratch/perf-lab/resize-switch-midnight-off-1.json` and `resize-switch-devils-garden-off-1.json`; detailed procedure in `scratch/resize-switch-reproduction.md`. Both sessions were first selected and their visible content counts stabilized. Four alternating viewport resizes and four alternating session switches were then measured. Both screenshots were reviewed by the implementer; the controller also inspected the heavy final screenshot, confirming real transcript, two pills, wallpaper and themed chrome.

- Midnight resize elapsed: 25, 21, 22, 19 ms; heavy: 25, 24, 25, 21 ms. Neither recorded a ≥50 ms task in those resize windows.
- Midnight switch elapsed: 93, 33, 94, 32 ms, with long-task maxima 58, 0, 56, 0 ms. Heavy: 107, 41, 105, 37 ms, maxima 71, 0, 71, 0 ms.
- Slower direction is medium→small in this fixture. Visible small/medium contain 60 entries and 131/136 Markdown-bearing elements. Hidden medium drops to 10 Markdown-bearing elements through folding; first-page settling does not eliminate activation/unfold work.
- These are NOT matched comparisons against the earlier traced/unsettled 386/699 ms peaks: setup and tracing differ. No inference that tracing alone caused the difference.
- Heavy workload legs measured, but overall heavy report is incomplete because particle drawing remains unsupported. Screenshots prove appearance, not animation/presentation. XRandR warned the display uses Xwayland; no native OS resize or displayed-frame rate has been measured.

Destin identified this hitch family as his primary concern and explicitly approved test/fix/test. Causal profile recorded in `scratch/session-switch-causal-profile.md`: repeated scroll reads and header sizing are suspects, with significant style recalculation; sampled run-wide slowdown and truncated trace limit attribution. The first candidate, deduplicating ChatView's post-return scroll, was tested and REJECTED: matched primary switches 112/87 ms baseline versus 114/89 ms candidate, long-task totals 74/51 versus 75/52 ms. Its product/test edits were reverted while preserving Find. Post-reversion `bash scripts/verify.sh` passed all gates (`scratch/after-switch-scroll-rejection-verify.log`). Candidate package remains stale; never reuse it as current source.

Second bounded experiment (stable SessionStrip wrapper ResizeObserver) was also REJECTED and reverted; evidence and reversible patch are in `scratch/switch-header-observer-candidate.md` / `.patch`. Mounted tests proved fewer observer subscriptions while preserving active/width repacking, but two measured pairs were confounded by slow baseline runs (pre-switch resize 106–436 ms versus earlier 20–24 ms) and differing first-frame Markdown counts. Normal-baseline primary switches 112/87 ms versus candidate 101/83 then 189/102 ms do not establish repeatable benefit. Do not claim the apparent slow-baseline/fast-candidate ratio as a win. Full post-second-reversion verification passed (`scratch/after-header-rejection-verify.log`); the official package still contains the rejected candidate and must not be treated as reverted source.

Baseline package remains `scratch/perf-lab/switch-before-app`, asar SHA-256 `a5bf43277da4affb580e17efa04d719ba04aed9fa568805de6734f3d3117d8fc`. Baseline-validity work (`scratch/switch-baseline-validity.md`) directly observed active-pane natural folding from 131 to 7 Markdown elements (small) and 136 to 10 (medium). It exposed a rig settle window shorter than the 800 ms active-fold delay; earlier claims that the change necessarily occurred while hidden were unsupported. Two explicitly folded runs gave 27–36 ms switches and 16–22 ms resizes, but their focus differed, so they are not focus-matched baselines.

A later focused same-window full-versus-folded control (`scratch/switch-full-folded-control.md`, raw run 2) recorded full-small switch 61 ms / 58 ms renderer long task versus naturally folded 24 ms / none. RecalcStyleDuration was 0.068470 s versus 0.021682 s. Target content and sampled visible-row hashes matched. The original report's overall full-control verdict is erroneously uncontrolled due to an omitted expected `folded:0`; saved evidence was audited, gate fixed and 17 tests passed, but no post-fix timed rerun is claimed. One valid full action is a content-dependent style-work lead, not a repeated performance fix. The bounded invalidation trace identified `useChromeMeasurements` removing three inherited root CSS variables on session-ID effect cleanup and rewriting them on attachment (`scratch/switch-style-cause.md`). Traced timings are not a valid full/folded comparison because folding happened during the invasive trace, but the complete trace identifies the mutation stacks and forced style-flush sites.

Third candidate retained UNCOMMITTED for review: preserve observers/variables when measured chrome DOM nodes are unchanged; still update genuine geometry and replacement nodes, reject stale callbacks, and clean on unmount. Evidence: `scratch/chrome-measurements-candidate.md`. Valid focused full-content baseline switches 56/55/55 ms (54/53/53 ms long tasks) versus candidate 17/15 ms (none). High-pressure and unfocused attempts remain saved and excluded. This is private-fixture evidence, not whole-user-issue acceptance.

Parent verification: desktop `scripts/verify.sh` passed (`scratch/chrome-measurements-full-verify.log`). Android `JAVA_HOME=/usr/lib/jvm/java-21-openjdk ANDROID_HOME=$HOME/.android-sdk ./gradlew test -x bundleWebUi` exited 0; XML reports contain 338 tests each for debug, release and releaseTest, no failures/errors/skips. This does not exercise Android renderer motion. Real-display Find acceptance on current stamped candidate (`scratch/perf-lab/chrome-measurements-find-acceptance.json`) passed with 1,020 loaded entries, exact Turn 3250 result visible/stable/uncovered; screenshot inspected. Find opened in 25 ms and initial query result in 673 ms, no sampled long tasks; one correctness run, not a paired Find performance improvement. Independent review found a position-only theme-change gap: an unchanged-size header can move 6px without a ResizeObserver notification. The candidate now observes only the same two body appearance attributes already used by HeaderBar and updates offsets on those changes; a mounted test reproduces and guards float↔framed movement without firing the size observer. Corrected build dirty `1200c5733182` had one valid full-content switch at 14 ms/no long task with matching content/hash and 0.666px bottom gap; another attempt missed the full window and is excluded. Parent reran desktop verification successfully (`scratch/chrome-measurements-final-verify.log`) and real-renderer Find successfully (`scratch/perf-lab/chrome-measurements-final-find.json`, 1,020 loaded entries, exact result stable/visible/uncovered, screenshot inspected). Fresh scoped re-review resolved the prior must-fix and found no new blocking issue. Parent reran the chrome-measurement and SessionStrip regression suites plus `git diff --check` successfully (`scratch/chrome-measurements-review-confirmation.log`). The fix is retained uncommitted for the measured switching case. Displayed-frame completeness and broader theme/activity coverage remain unproven; do not call these DOM/scroll checks a presentation test. Concurrent-background-stream/tool switching now has an initial sustained run; see the mixed-activity section below.

## Follow-up: long histories and session Files

Long-history mixed activity and Files-open/closed switching are now exercised separately in `docs/archive/investigations/2026-09-29-long-history-mixed-files.md`. That follow-up also records a retained correctness fix for bottom-stick after content shrinks, passing desktop verification and post-fix Find acceptance. Earlier low-rAF-cadence diagnostics remain unattributed and excluded from performance comparisons; bounded-body history coverage does not include the oversized million-character seeds.

## Six-session mixed-activity coverage

Implemented `mixed-provider.mjs` and `mixed-activity.mjs` with independent tests and scoped review. Three native sessions stream separately at 50 deltas/sec, two execute actual fixture-owned Bash/Node workers for 40 seconds, and one stays idle. Private permissions grant only the two exact fixture commands. A nonvisual `data-chat-session-id` on ChatView supplies direct pane identity instead of assuming strip overflow indices equal chat indices.

Initial shakedowns exposed rig assertions (collapsed card stdout and nonexistent IPC field), too-short switch coverage, a mislabelled control, and waiting for persisted partial text until after a short stream ended. These were corrected with tests; incomplete reports remain saved. The first confirmation clustered switches in ~1.3 seconds and is not sustained-load evidence.

`scratch/perf-lab/mixed-sustained-2.json`: measured, no validity reasons. Twelve focused switches span 16,712 ms, all within all five producers' activity intervals. Each stream advanced 137→972 deltas during the phase and completed exactly 1,500 deltas; both tools progressed from beat 1→7 and later completed exact stdout/result/acknowledgement checks. Session/app cleanup confirmed. Click→rAF proxies by two rounds: stream-1 11/23 ms, stream-2 11/14, stream-3 11/14, tool-1 10/16, tool-2 7/15, idle 6/6. No ≥50 ms renderer tasks in the 16.7-second measured window. IPC: 167 successful pings, no rejected/outstanding ping, max round trip 10 ms. These are not presented frames or a demonstrated before/after improvement.

Parent inspected final stream and both tool-card screenshots: role-marked content, success acknowledgements and completed cards present; snapshots catch transition dimming and are not settled-appearance/first-frame proof. Final Node tests and full desktop verification passed (`scratch/mixed-final-unit-tests.log`, `scratch/mixed-final-desktop-verify.log`). Fresh scoped review found no remaining blocker. Single-stream control is a short warmup/engagement control, not a matched performance ratio against the later five-producer phase.

Limits: fresh native chats, simple deterministic text, two paced tool calls (not continuous expensive tool-call churn), Midnight theme, one sustained run, no high-refresh presentation evidence. Long existing histories plus simultaneous activity, richer Markdown/tool-result bursts and heavy-theme coverage remain follow-up stress cases. No additional product optimization justified by this run; retained chrome-sizing fix remains uncommitted/unshipped.

## File-watcher steady-burst shakedown

`scratch/perf-lab/watcher-burst-prewarmed.json` completed both private gamma-project legs: 200 additions/edits/removals, then 1,000 of each. Both verified exact notification identities, all final disk hashes, an untruncated 1,600-file path/ID listing, and subscribed Files-view convergence. The final screenshot was inspected: gamma, 1,600 Files, and the added TypeScript cards are visible.

The marked windows lasted 2,535 / 2,825 ms. Neither recorded a renderer task of 50 ms or longer. End-to-end IPC pings numbered 50 / 56, with maximum round trips of 22 / 40 ms and no rejected pings. These are one-run observations, not whole-app acceptance or evidence of a product optimization.

Setup repairs were confined to the rig: await the React Projects control, then own one awaited watcher subscription before opening Files. Previously, a second subscription could return `{ok:false}` while the UI's first watcher was still starting. The successful run therefore excludes watcher startup. Elapsed timings include producer writes, notification/UI waits, test searches and probe overhead; they are not pure watcher throughput. Size and warming are confounded. Composer typing, sync and presented frames remain unmeasured.

Fourteen focused tests passed in the implementation verification; independent final review found no blocking validity/safety issues. No product edits were made for this scenario. Next measurement priority: the dedicated hardware GPU/theme lane, with presentation metrics accepted only if actual Chromium trace evidence supports them; private sync remains pending.

## Chat lifecycle instrument

`scripts/perf-lab/short-lifecycle.mjs` uses one isolated packaged app for all cycles, two fresh fake-provider native sessions per cycle, verified replies and actual pill selection. Each cycle destroys only its own IDs and waits for session-list and mounted-chat counts to return to their starting state. One anchor keeps the app window open. Reports include renderer counters, process-family PSS and persisted-file context. No terminal/files/previews engaged.

Validity checks:
- Output deltas/characters checked against provider, coalesced native transcript and visible reply fragment.
- Missing counters, incomplete work or failed cleanup produce `incomplete`, not0/healthy.
- Late `session.create` completion retains owned-ID cleanup after external timeout.
- GC-assisted observations are labelled `gcPolicy: intervened`; they cannot be read as an untouched natural-GC trajectory.
- Startup repair/copy completion is awaited before measurement so fixture import is not misattributed to lifecycle growth.
- Saved-file counting tolerates only vanished-directory ENOENT races; other I/O errors still fail. Incomplete cycles are excluded from trend summaries.

Initial shakedown `scratch/perf-lab/short-lifecycle-shakedown.json` completed4 cycles but the fifth raced a removed mkdir-lock directory. It is incomplete and not a baseline. It also overlapped fixture startup repair; that motivated the startup mark gate. Instrument bugs were reproduced and fixed, not counted as product defects.

## Natural-GC five-cycle run

`scratch/perf-lab/short-lifecycle-confirmed.json`: status measured, all5 valid, startup waited8494ms. Two chats created and closed each cycle; mounted chat count returned to1 each time. No forcedGC. First-cycle PSS544.1MB, last666.5MB; renderer heap21.8→25.8MB, counters varied. These samples include unswept garbage and allocator/cache behavior, so the rise is NOT a leak verdict.

## Separate GC-assisted runs

Five-cycle diagnostic `scratch/perf-lab/short-lifecycle-retention.json`: post-GC DOM408→412, listeners274→275; PSS580.5→564.1MB; heap12646388→13650348bytes. This weakened the natural-run suspicion of a large DOM/listener retention problem, but does not rule out smaller retention or other surfaces.

Twenty-cycle diagnostic `scratch/perf-lab/short-lifecycle-retention-20.json`: all20 valid (40 chats created/closed), first cycle excluded from trend interpretation as warmup. Selected post-GC readings:

| Cycle | JS heap MB (binary units) | PSS MB | DOM nodes | JS listeners | Saved JSONL files |
|---|---:|---:|---:|---:|---:|
|1|11.98|590.1|408|274|608|
|5|12.20|591.3|408|274|624|
|10|12.82|577.5|412|275|644|
|15|13.66|585.7|412|275|664|
|20|14.33|599.6|412|275|684|

Heap rose modestly with intervening drops/plateaus; it did not establish an indefinitely growing retained object graph. Persisted conversations legitimately accumulate. PSS had a transient664.4MB reading at cycle16 and returned589.1MB next cycle. **No large chat-view/node/listener cleanup leak demonstrated by this workload.** The smaller retained-heap trend remains unattributed: possible cache/metadata/instrumentation effects require retainers or a calibrated control before any product fix.

## Input-during-streaming: first hidden-page mount hitch

New `scripts/perf-lab/input-stream.mjs` verifies exact draft and visible mirror, actual stream engagement, usable IPC responses and input timing proxies. Two unprofiled shakedowns completed. The no-stream control's second character suffered415–460ms dispatch/capture delay, with two renderer tasks~236–255ms; the later streaming leg had no long tasks in those two input windows. Do not infer streaming causes the early hitch.

Early-start CPU profile identified ReactMarkdown parse/rehype/highlighting in both tasks. A fresh-six-chat control removed the hitch; waiting2.2s before typing merely moved parsing earlier. A bounded app trace established actual trigger: first history pages arrive while resumed medium and small chats are hidden; one second later each paused subscription catches up and mounts~42–43 Markdown blocks (~80–105k source characters) synchronously. These are first mounts, not redundant parsing of already-mounted content.

One report-identity bug was corrected before attributing sessions: `ids.reverse()` during cleanup mutated `report.sessions.ids`, but names stayed in creation order. This incorrectly labelled resumed history as native/fresh tabs. Raw trace IDs were intact; reconstructing original order maps the129/126-event pages to cc-1 medium and cc-2 small. Fresh cc-3/native tabs got0events. `closeInputSessions` now reverses a copy, with a failing-then-passing behavior test. No history-routing bug established.

Temporary app instrumentation was removed byte-for-byte against pre-trace snapshots; chat-context.ts has no remaining diff. **No retained product fix for the hidden-mount hitch yet.**

### Hidden-page batching experiment — rejected and removed

A small hook constructed hidden first pages newest-first,2Markdown-bearing rows per macrotask, retaining full firstvisibleframe through synchronous completion. Review corrected concurrent-render/page-generation cases; full desktop verification passed. Unprofiled input pair `hidden-page-input-{before,after}.json` showed baseline182/159ms tasks versus candidate0tasks>=50ms, with settled switches93→77.7ms. This was a promising typing result, not sufficient acceptance.

The deliberate mid-queue activation probe then hit candidate pages at2/60builtrows twice: longtasks156/186ms spanned the click, click→secondrAF188/218ms. Baseline had alreadybuilt60rows and measured94/97ms; arrival stages differ, so these are NOT an exact matched-stage speed ratio. They nonetheless establish candidate relocates substantial pendingconstruction to the immediate switch. Settledswitches candidate68/77ms vsbaseline74/79ms. All first-rAF DOMcounts60, Findhardwarepassed exactuncoveredhit. Verdict **REJECT under explicit no-relocated-hitch gate**. No visible tail-only/loading behavior was approved.

The hook and its experiment-only integration/test were removed from product source; full snapshots retained under `scratch/rejected-hidden-page/`. Existing Find improvements preserved. Evidence `scratch/hidden-page-activation-results.md`, `scratch/perf-lab/activation-{candidate-3,candidate-4,baseline-1,baseline-2}.json*`. A deeper shared Markdown preparation/worker or viewport-aware architecture needs its own design; do not silently ship a tail-only visible page. The symptom remains open and will be ranked alongside burst/GPU findings rather than repeatedly trying timer changes.

Evidence: `scratch/input-stall-investigation.md`, `scratch/perf-lab/input-render-trace-run.json{,.render-trace.json,.cpuprofile}`, `input-stream-{shakedown,repeat}.json`. Profiled/trace times are diagnostics, not comparative baselines.

## Terminal burst shakedowns

New `scripts/perf-lab/terminal-burst.mjs` verifies complete raw numbered/ANSI payload independent of xterm's write path plus its bounded final20-line logical suffix/sentinel. It uses unique fixture roots, refuses existing package processes, canonicalizes only PTY CRCRLF expansion, records actual clock ticks, and labels IPC without overlapping burst samples unmeasured. The readiness clock polls at100ms; it is parsed-buffer readiness, NOT displayed pixels. Small200lines thenlarge2000lines changes size and warming together, so do not infer a cold/warm speedup.

- `scratch/perf-lab/terminal-burst-shakedown.json`: DOM renderer, bothsizes rawExact/tailSuffix true. Readiness101/110ms, first raw1/1ms; no>=50msrendererlongtasks. Overlapping IPC samples2/1,max5/22ms. Final screenshot inspected, numbered tail andmarker present.
- `scratch/perf-lab/terminal-burst-hardware.json`: WebGL renderer, bothsizes rawExact/tailSuffix true. First200-lineburst readiness142ms and67msrendererlongtask/69msrAFgap; subsequent2000-lineburst readiness104ms,no>=50mslongtask. IPCoverlap1/2samples,max68/17ms. One hardware run only; first-useglyph/GPU setup is a hypothesis, not attributed cause. Runtime geometry differed(screenWidth640vs1562), so software/hardware timings are NOT a matched renderer comparison.

No terminal product optimization made. Still unmeasured: sustainedbursts,multipleterminals,simultaneoustyping,fullscrollbackretention,actualpresentedframes. File-watcher burst instrument under construction; sync and dedicatedGPUthemejourneys pending.

## Limits and next work

These cycles ran in tens of seconds and are intentionally NOT an hours-long soak. Native text replies were short; other providers, many history pages, editors, documents, terminals, Pages and remote clients remain outside this lifecycle result. No measured product change has been made from this data.

Next: input-during-streaming scenario, followed by dedicated burst workloads and real-GPU interaction traces. Add lifecycle cases for other resource-heavy surfaces as those workloads are exercised. If the small heap trend persists in a longer short cycle, compare heap retainers/control instrumentation rather than guessing a leak.
