# perf — app responsiveness and honest performance measurement
Filing test: is the primary question app responsiveness, resource cost, or whether a measurement reliably detects either? Yes — including platform-specific decisions and release blockers whose primary symptom is performance. Keep feature semantics and independent test-suite hygiene with their owning areas; link those rather than opening duplicate performance entries.

- [ ] Opening a long conversation in the background can still interrupt typing in the chat you are using. Hidden first-page Markdown work was reproduced; experimental shared-highlighter, parser, physical-scroll and preparse candidates are paused, not accepted fixes. Preserve complete-page publication and immediate switch-to-content when investigating. On 2026-10-04 one run on current master showed no freeze over 50 ms (September's runs showed 122–145 ms); that is one run, so this stays open until repeats say whether it is gone
      `chat` `desktop` `confirmed` `checked 2026-10-04` `performance` → docs/active/investigations/2026-09-29-performance-status.md

- [ ] Switching chats or resizing the window sometimes pauses much longer than an ordinary switch. Some observed switches reached 208 ms and a callback gap reached 422 ms, without universal cause attribution; matched short switches did not establish that every stall was fixed
      `chat` `desktop` `confirmed` `checked 2026-09-29` `performance` → docs/active/investigations/2026-09-29-performance-status.md

- [ ] The first Find query in a long loaded chat can still take about a second; opening the Find bar got faster, but cold indexing and never-loaded pages remain different problems. Measure first query, streaming refresh and reopened-search retention separately
      `chat` `desktop` `confirmed` `checked 2026-09-29` `performance` → docs/active/investigations/2026-09-29-performance-status.md

- [ ] The app still feels sluggish across sessions and over time. Historical paging, folding, list and hidden-tab work reduced specific measured costs, not a sustained all-surfaces smoothness guarantee; the loaded Find, chrome-measurement and bottom-shrink corrections shipped in youcoded#591 (`eebcdea314c5d6b42444d991789a2541c405dbb8`), while paused experiments did not ship
      `all` `confirmed` `checked 2026-09-29` `performance` → docs/active/investigations/2026-09-01-ui-sluggishness-render-cost.md

- [ ] Session switching in terminal view may redraw more than necessary on a real graphics card. The software-rendered baseline saw ~137 ms terminal versus ~124 ms chat switching, inside its spread; actual hardware cost and a busy six-terminal feel check remain unmeasured. On 2026-10-04 the same software-drawn rig put terminal-view switching near 0.55 s even with 8 sessions open (chat view ~31 ms); that is a software-drawing figure, not a prediction for a real card. Code reading says every open terminal re-draws its letters on a switch, not only the one shown
      `terminal` `desktop` `needs-verify` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] Sustained terminal output and typing remain unmeasured together. Private 200- and 2,000-line bursts verified exact raw output and visible suffix and found one 67 ms hardware task with unassigned cause; the older terminal-switch rig still measures switching after filling the terminal, not sustained burst drawing under typed input. Measured 2026-10-04: a 200 MB flood lost output after about 50 MB, froze the whole app 0.15–0.9 s and delayed Ctrl+C 5 s or more; typing delay was fine (about 14 ms to the terminal). Flow control (the program is held back until the screen has drawn what it printed) is built on branch session/perf-zero-hitch-20261004, not merged; there a 200 MB flood shows whole in 6–7 s with no stalls and Ctrl+C takes 0.1 s. Destin tried the combined build by hand in a dev window on 2026-10-04 (Linux, 180 Hz) and everything felt fine. Still open here: typing under a flood on a real graphics card, and the Windows/macOS behaviour (see the entries below)
      `terminal` `desktop` `needs-verify` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] File-pane content changing while a different file is open remains unmeasured under streaming. Recent mixed runs exercised six long histories with Files open on selected sessions and verified their restoration; those did not also edit another file. The older separate drawer/editor phases missed that cross-file git-footer cost, so measure it directly
      `files-panel` `desktop` `needs-verify` `checked 2026-09-29` `performance` → docs/active/investigations/2026-09-29-performance-status.md

- [ ] Standard native-stream runs use a fresh chat and cannot represent every accumulated-history cost. Six seeded long-history chats were subsequently exercised with three concurrent streams and actual private tools, but those diagnostics are not a recurring standard gate; preserve the fresh and long-history lanes separately and investigate the historical ~137-to-~580 ms terminal-switch comparison before using it as a regression verdict
      `chat` `desktop` `needs-verify` `checked 2026-09-29` `performance` → docs/active/investigations/2026-09-29-performance-status.md

- [ ] The blank-on-switch detector has not demonstrated sensitivity: a fixed build yielded zero of forty blank arrivals but the matching pre-fix control never ran. Show the instrument fails on a known blank case before treating zero as a pass
      `chat` `desktop` `needs-verify` `checked 2026-09-18` `performance`

- [ ] Scrollblank sampling itself can slow the renderer it is judging: the huge fixture led to ~7,000 geometry reads per sample and ~2.4 million per pass. Replace per-frame forced layout with a lower-overhead visibility set and calibrate on/off overhead before gating
      `chat` `desktop` `confirmed` `checked 2026-09-10` `performance`

- [ ] Identical-code native-chat screenshots can differ more than the comparator's threshold because a real model generates different replies (14.79% in one control). The rig names this screen nondeterministic but still scores it; require same-build noise controls and review the actual image
      `chat` `desktop` `confirmed` `checked 2026-09-03` `performance` → docs/active/investigations/2026-09-01-perf-rig-native-chat-nondeterministic.md

- [ ] The artifacts rig sometimes shows an empty session-files drawer (roughly one run in nine in the historical sample), once delaying and once returning missing numbers. Investigate engagement and reject missing samples rather than swallowing them into a median. On 2026-10-04 the standard artifacts scenario could not open the drawer at all on current master: it waits for a button title and for `data-artifact-viewer`, and the app no longer has either, so it needs its selectors updated before it can produce any number
      `files-panel` `desktop` `needs-verify` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] Comparison controls are only partial: `compare.mjs` now rejects missing/changed machine identity, GPU lane, scenario descriptors and excessive pre-boot noise, but its own comparability check warns that it has not measured interference during a run. Quiet/busy repeats previously produced apparent 16–20% regressions on unchanged code. Keep those older reports inconclusive where mid-run load differed; measure external contention before claiming a candidate regression or win
      `n/a` `confirmed` `checked 2026-09-29` `performance` → docs/archive/investigations/2026-09-26-performance-history-audit.md

- [ ] Software-rendered runs do not establish what happens on a real high-refresh screen: a controlled native-GPU welcome probe reversed the software-only blur attribution. Keep software and authorized hardware/compositor lanes distinct, and never call rAF callbacks presented frames
      `n/a` `confirmed` `checked 2026-09-26` `performance` → docs/active/investigations/2026-09-26-startup-resume-real-scale.md

- [ ] The rig has no recurring same-machine startup-mark and idle-CPU trend, despite having diagnostic probes and manual real-history captures. Any future scheduled lane needs engaged scenarios, machine/noise identity and a sanity floor; frequency and host remain an operational decision. The 2026-10-04 review ranks a nightly run with a trend chart, plus an automatic size limit on the app bundle (none exists; the main script is 3.19 MB), as part of the same gap
      `n/a` `confirmed` `checked 2026-10-04` `performance` → docs/active/investigations/2026-09-16-simplification-audit.md

- [ ] The repeatable performance suite does not yet cover long soak and retained-memory slopes, giant bodies, expensive repeated tool churn, private sync interference, effects-heavy native presentation or native drag/resize. Prior paging/folding cycles shipped; watcher bursts and mixed-history diagnostics have been measured, not these remaining combined/soak cases. Preserve raw samples, engagement checks and truthful bounds before treating a clean report as general smoothness. These are coverage gaps, not proven product bugs; terminal typing, Files under streaming, history-bearing streams, Find lifecycle and Android/remote motion have their own primary entries above/below
      `all` `needs-verify` `checked 2026-09-29` `performance` → docs/active/investigations/2026-09-29-performance-status.md

- [ ] A very large Markdown file still pauses visibly when opened: a measured 394 KB / 699-fence fixture took ~939 ms after an earlier ~1,487 ms, with syntax highlighting building 108,576 elements. Changing colouring is a product decision: plain code for huge files versus lazy highlighting that preserves path chips; the earlier 570 ms claim for a small file was a probe artifact, not a baseline
      `files-panel` `desktop` `confirmed` `checked 2026-09-10` `performance`

- [ ] Editing a file, copying code or navigating an HTML preview can stutter; Destin saw it, but the scenario has not been run against master, so no cost or cause has been measured for these three actions
      `files-panel` `desktop` `needs-verify` `checked 2026-09-01` `performance` → docs/active/investigations/2026-09-01-artifact-viewer-spikes.md

- [ ] Starring, tagging or renaming a chat triggers a later full search-index rebuild that may stall the app; the unrelated conversation-record read/heal path shipped async in youcoded#573, but did not remove this index rebuild
      `chat` `desktop` `confirmed` `checked 2026-09-26` `performance`

- [ ] Theme mascot companions may animate at the full display refresh rate even after the mascot body was capped; this companion cost has not been measured with a companion theme. The observed welcome-screen GPU change applied to the body, not the companions
      `all` `needs-verify` `checked 2026-09-26` `performance` → docs/active/investigations/2026-09-26-startup-resume-real-scale.md

- [ ] Large synced projects still consume more file watches than necessary even after the 2026-09-29 correction; choose whether one watch per folder/project with platform-specific detection is worth the risk of missed edits, and test on Linux, Mac and Windows before changing it
      `settings/sync` `desktop` `decision` `checked 2026-09-29` `performance`

- [ ] Synced code projects that already keep Git history receive a second hidden sync history over those files. Whether to avoid duplicating that work is a sync product decision, not proof it currently halves throughput
      `settings/sync` `desktop` `decision` `checked 2026-09-29` `performance`

- [ ] Personal sync history keeps growing: 1.7 GB on GitHub and 2.5 GB on the Z13 in September, with saves every few seconds during conversations. Earlier local/GitHub readings of 841/652 MB raised the same storage question. Decide how to prune/locate transcript bytes without losing any device's copy; no automatic history rewrite is authorized
      `settings/sync` `all` `decision` `checked 2026-09-16` `performance` → docs/active/investigations/2026-09-01-transcript-storage-long-term.md

- [ ] A device far behind on a slow connection may repeatedly time out its 5-minute upload step and restart instead of catching up. This is not reproduced: a 280 MB repair finished in 44 s in the recorded case
      `settings/sync` `desktop` `needs-verify` `checked 2026-09-16` `performance`

- [ ] A phone receives output and chat events for every open computer session, even when it shows only one; the extra work on both devices was identified in review, not yet measured on a slow phone
      `remote` `needs-verify` `checked 2026-09-23` `performance`

- [ ] First remote connect can leave a phone showing white before sign-in. A dev test loaded the whole 2,444 KB app script (607 KB compressed) before the 34 KB connection code, but no release build was timed on the phone; the former 2.5 s scripted post-sign-in wait shipped fixed in 2026, so measure first paint rather than reopening that resolved cause
      `remote` `needs-verify` `checked 2026-09-23` `performance` → docs/active/investigations/2026-09-01-remote-first-connect-dead-time.md

- [ ] Phone reconnect still transfers a full copy of conversations and buffered tool events, then redraws them, even after duplicate skills/commands requests were removed in youcoded#562. A sequence-based catch-up with full snapshot fallback could reduce this work and answer requests cut off mid-flight; preserve message ordering and recovery across restart
      `remote` `confirmed` `checked 2026-09-23` `performance`

- [ ] Android still reads an entire long conversation on open instead of the most recent page. The desktop paged this in cycle 2, while the Kotlin tail reader and on-device paging were explicitly deferred; do not assume desktop's improvement applies to the phone
      `chat` `android` `confirmed` `checked 2026-09-10` `performance`

- [ ] Marketplace refresh sends the whole ~1 MB catalog (~5,000 rows) and details that a grid card does not use, even if one listing changed. First slim the list and fetch details on opening a card; consider delta refresh before ~20,000 rows. Savings and UX on Android/desktop remain unmeasured
      `marketplace-screen` `all` `needs-verify` `checked 2026-09-01` `performance` → docs/active/investigations/2026-09-01-marketplace-catalog-payload-size.md

- [ ] Community CSS may keep an always-visible theme animation running at full rate for people who never enable Reduced Effects. Limiting author-defined motion is a product decision; Reduced Effects already stops ordinary cases, while nested/layer-important selectors and visibility of fill-forwards fades require separate safety checks
      `all` `confirmed` `checked 2026-09-10` `performance` → docs/active/investigations/2026-09-01-theme-css-animation-unsanitized.md

- [ ] After 73 minutes and ~15 helpers changing files, a dev instance's main process reached ~2.8 GB and ran out of memory; a later core-dump repair in youcoded#335 may already cover it, but this workload was not rechecked. Reproduce before treating it as a current leak. Added 2026-10-04 (read from code, not measured on the app): with phone access on, memory kept for a phone that may not be connected is capped by count, not size. Terminal text is ~4–8 MB per session; hook events are capped at 10,000 each holding whole tool results, roughly 80 MB per session for 8 KB results (order of magnitude only) and 10–150 MB for realistic long sessions. A plausible contributor for phone-access users, not a cause for everyone
      `desktop` `needs-verify` `checked 2026-10-04` `needs-repro` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] Git refresh for a file can start up to three git processes per file/git change; profile under a changing project before expanding the Git surface to Android/multi-window. The five duplicate repo-containment checks remain parked feature maintenance in files, not this runtime-cost investigation
      `files-panel` `desktop` `parked` `checked 2026-09-01` `performance`

- [ ] The old ~250,000 file-watch count exhausted available watches when a second instance opened. Home-project depth was fixed in youcoded#501 and the second sync watcher cause in youcoded#590; remeasure a fresh installation after both before closing the resource-pressure question, not as a new unimplemented watch fix
      `projects` `desktop` `needs-verify` `checked 2026-09-29` `performance`

- [ ] Remaining main-process blocking work can still interrupt every window: B2 session/native-home, B4 locked conversation writes/removes, B5 chat search indexing, B7 git/sync transport, B10 catalog reads and B12 project watcher. Six batches and conversation record reads/heal shipped, but the remaining runtime paths and theme glass slider writes are not solved by reclassifying the blocking-call test allowlist
      `desktop` `confirmed` `checked 2026-09-24` `performance` → docs/active/investigations/2026-09-24-main-blocking-calls-triage.md

- [ ] **v1.3.1 blocker, blocked on simplification phase 5:** two small reads still take whole files, catalog fetches can repeat, per-session file tracking outlives its session and an unused whole-history parser can turn a 112 MB file into a 224 MB string. W1/W6 Resume caches shipped in youcoded#573 (settled open 1.7 → 0.3 s); D11 replayed-turn type ambiguity stays as a cross-reference in chat-data
      `chat` `desktop` `blocked` `checked 2026-09-26` `performance` `v1.3.1` → docs/active/plans/2026-09-16-simplification-phases.md

- [ ] Fresh perf worktrees re-download ~490 MB of fixture assets when a shared copy is already present, costing the run before quiet-machine measurement begins. Reuse a copy or hardlink without mutating shared dependencies; the unrelated dev-stop child-process labeling remains in dev-workspace
      `n/a` `confirmed` `checked 2026-09-27` `performance`

- [ ] Restoring a kept version of an open Office document copies all its pictures even when nobody kept typing in the old version, slowing picture-heavy restores. This is the cost question; missing-picture and concurrent-save correctness remain in files
      `files-panel` `desktop` `confirmed` `checked 2026-10-02` `performance`

- [ ] If one project's file list hangs on the Office page, pressing New can occupy both file-list slots, blocking the next project's list until the first finishes
      `files-panel` `desktop` `needs-verify` `checked 2026-10-02` `performance`

- [ ] On a big Excel workbook (a 20 MB test sheet), typing freezes for about 2 seconds at each automatic save. Big documents delay autosave 3–20 seconds to reduce typing stutter while showing Edited; the existing recovery journal is intended to replay changes after a crash. Recheck the remaining freeze without trading away recovery
      `files-panel` `desktop` `needs-verify` `checked 2026-10-02` `performance`

- [ ] Every open Office document keeps its editor loaded, so memory grows with each tab left open. The designed 20-minute sleeping policy (R8) was deferred and never built; the asleep flag is currently only set by screenshots
      `files-panel` `desktop` `confirmed` `checked 2026-10-02` `performance`

- [ ] Other card grids may repeat the per-tile blur cost previously found in the command drawer; the files grid's backdrop has not been checked, so this is a measurement question, not a confirmed GPU defect
      `all` `needs-verify` `checked 2026-07-31` `performance`

- [ ] Animation frame budgets have not been checked on actual phones or remote browsers, where refresh rate and Reduced Effects differ. Measure those devices before applying desktop cost assumptions
      `all` `needs-verify` `checked 2026-08-07` `performance`

- [ ] With 17 or more Claude Code sessions open, terminals fight over graphics. Every session builds a graphics-accelerated terminal at start even if you never leave chat view, and the system allows only 16. At 20 sessions (software-drawn rig, one run) 4 terminals ended with no working graphics, chat switching showed 12 freezes (worst 173 ms) and the churn kept going on every switch. Fine up to 16. Options: build the terminal only when first shown, or share one
      `terminal` `desktop` `confirmed` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] Launch takes about 1.3 s and the single 3.19 MB main script costs roughly 0.31 s of it to evaluate. Settings, Marketplace, chess and the QR code are still inside it rather than loaded on first use, and the window sits blank about 0.45 s. The housekeeping before the window (~80 ms) is not the problem. Splitting means a brief first-open pause for those screens
      `window-chrome` `desktop` `confirmed` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] Comparing two large, unrelated files in an edit card freezes the app: 0.65 s at 2,000 lines, 4.3 s at 5,000, 19 s at 10,000 (similar files: 0.09 s), with no time limit and even for collapsed cards. Rare, because both engines normally supply a ready-made comparison; mostly a pending or refused edit
      `tool-cards` `desktop` `confirmed` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] Ordinary reply streaming still keeps the window about 40–45% busy on the software-drawn rig, down from 44–48%; about two thirds of what remains is the browser's own drawing, so it needs a real graphics card to judge. Decided by Destin 2026-10-04: streamed text redraws at most about every 17 ms (`STREAM_REDRAW_TARGET_HZ` = 60 in `transcript-batch.ts`), "yes, this is ideal"; raising it to 120 (smoother, more work) stays an option. Tried by hand on his 180 Hz Linux screen 2026-10-04: felt fine. Fix built on branch session/perf-zero-hitch-20261004, not merged; closes when it merges
      `chat` `desktop` `in-flight` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] Decided by Destin 2026-10-04 (leave as built): a terminal you are not looking at (window visible, another view shown) is fed at most ~0.5 MB/s after a 1 MB burst. A command printing a lot there is slowed hard (a 60 MB log takes about 2 minutes) in exchange for ~20% instead of 80–99% of the window; showing the terminal draws the backlog at once. Raising the rate costs the window more. Tried by hand 2026-10-04 (combined build, Linux): felt fine. Built on branch session/perf-zero-hitch-20261004, not merged; closes when it merges
      `terminal` `desktop` `in-flight` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] After a hidden window's un-drawn terminal text is trimmed, stale partial frames can remain above a program that redraws very fast: 2 of 3 rig runs at ~3 MB/s showed 2- and 4-line leftovers above the final frame. Claude Code's own animation is ~20 KB/s, far below the limit, so normal use does not reach it. Branch session/perf-zero-hitch-20261004, not merged
      `terminal` `desktop` `needs-verify` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] The terminal speed brake has been checked by reading only on Windows (ConPTY) and macOS, and a real minimise on those systems was never measured (Chromium may slow a minimised window's timers to ~1 per second, which could starve the drawing that confirms output). The change that lets scrolling happen without waiting for the app was verified on Linux only; a trackpad pinch on Windows and macOS must be checked before release to confirm it zooms the app and not the page. Destin's 2026-10-04 hand trial was Linux only. Branch session/perf-zero-hitch-20261004, not merged
      `terminal` `all` `needs-verify` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] Opening a big Excel file still freezes the app about 0.23–0.29 s (target 0.1 s): that time is the Excel reading library, not the app's drawing, which was fixed on branch session/perf-zero-hitch-20261004 (not merged; Destin approved the before/after deck for it on 2026-10-04). Options are reading it in the background or accepting it
      `files-panel` `desktop` `needs-verify` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] On Android the phone app may be slow while a reply streams. Found by reading code, not measured: each session runs two terminals and rebuilds the whole 2,000-line scrollback as text on every screen update on the thread that handles touches, plus a once-a-second scan per session; output can be dropped silently when the screen falls behind and the last piece may sit unsent until more arrives; the phone is kept awake whenever any session exists and four polling loops per session never pause in the background. Feel: hitches, a terminal that looks frozen then jumps, battery drain, worse with each session
      `android` `needs-verify` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] Phones get full glass blur by default and nothing turns it down; blur is the costliest effect on phone graphics chips, so mid-range phones may scroll choppily and themes would look flatter if reduced. Found by reading code, not measured
      `themes-screen` `android` `needs-verify` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] Themes may cost more graphics work than they should; all found by reading, none measured, and all need a real graphics card (not the software-drawn rig): particle themes make every glass chat bubble re-blur 30 times a second (6 of 8 registry themes have blurred bubbles); two registry wallpapers are 8K (about 132 MB each decoded) with no smaller copy made; theme fonts download from Google after the app is already showing, so text re-flows and offline gets the wrong font; and Reduce Visual Effects does not touch wallpaper size, blur written in a theme's own custom styling, or the buddy's breathing loop
      `themes-screen` `all` `needs-verify` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] The hitch recorder (the single most valuable missing instrument) is built on branch session/perf-hitch-recorder-20261005, not merged. One local file per profile, never message text, noting each long screen freeze, slow keypress or click, main-process stall, per-minute memory and launch timings, so real stutters become a ranked list without poking at the live app; `scripts/perf-lab/hitch-report.mjs` reads it. Still open: attaching a redacted summary to bug reports (owner's privacy decision), and the same recorder for Android and remote browsers
      `n/a` `confirmed` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md
