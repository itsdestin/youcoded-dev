# perf — app responsiveness and honest performance measurement
Filing test: is the primary question app responsiveness, resource cost, or whether a measurement reliably detects either? Yes — including platform-specific decisions and release blockers whose primary symptom is performance. Keep feature semantics and independent test-suite hygiene with their owning areas; link those rather than opening duplicate performance entries.

- [ ] **v1.3.1 blocker, blocked on simplification phase 5:** leftover whole-file reads and memory waste.
      Two small reads still take whole files; catalog fetches can repeat; per-session file tracking
      outlives its session; an unused whole-history parser can turn a 112 MB file into a 224 MB
      string. The Resume caches already shipped (open time 1.7 s down to 0.3 s). Replayed-turn type
      ambiguity (D11) stays in chat-data.
      `chat` `desktop` `blocked` `P1` `checked 2026-09-26` `performance` `v1.3.1` → docs/active/plans/2026-09-16-simplification-phases.md

- [ ] The app still feels sluggish: chat-switch pauses and typing interruptions (4 things, work in progress).
      (a) Sluggish across sessions and over time; earlier fixes cut specific measured costs, not
      overall smoothness (report: docs/active/investigations/2026-09-01-ui-sluggishness-render-cost.md);
      (b) opening a long conversation in the background can interrupt typing in the chat you are
      using: cause reproduced, candidate fixes paused, not accepted; (c) switching chats or resizing
      sometimes pauses much longer than usual (208 ms, one 422 ms gap), cause not pinned down; (d) the
      first Find in a long loaded chat can take about a second. Keep complete-page publication and
      instant switch-to-content intact while fixing.
      `all` `confirmed` `P1` `checked 2026-09-29` `performance` → docs/active/investigations/2026-09-29-performance-status.md

- [ ] Main process: freezes and resource growth that can hit every window (5 things).
      (a) Remaining blocking work in session/home, locked conversation writes, chat search indexing,
      git/sync transport, catalog reads, the project watcher and theme glass slider writes can
      interrupt every window (see docs/active/investigations/2026-09-24-main-blocking-calls-triage.md);
      (b) starring, tagging or renaming a chat triggers a later full search rebuild that may stall
      the app; (c) after 73 minutes with ~15 helpers changing files a dev instance reached ~2.8 GB
      and ran out of memory, not rechecked; (d) a file's git refresh can start up to three git
      processes per change; (e) the old ~250,000 file-watch count ran out of watches when a second
      instance opened, so remeasure on a fresh install. Update 2026-10-04 (read from code, not measured): with phone access on, memory kept for a phone that may not be connected is capped by count, not size; terminal text is ~4-8 MB per session and hook events (capped at 10,000, whole tool results) are roughly 10-150 MB for realistic long sessions. A plausible contributor for phone-access users only.
      `desktop` `confirmed` `P3` `checked 2026-09-01` `needs-repro` `performance`

- [ ] Measuring rig: scenarios not yet measured (5 things).
      (a) Terminal session switching on a real graphics card, and a busy six-terminal feel check;
      (b) sustained terminal output together with typing; (c) file-pane edits to another file while
      streaming; (d) long-history chats as a recurring lane, plus the ~137 vs ~580 ms terminal-switch
      comparison; (e) long soak and memory slopes, giant bodies, tool churn, sync interference,
      effects-heavy and drag/resize cases. These are coverage gaps, not proven bugs. Update 2026-10-04: on the software-drawn rig terminal-view switching was near 0.55 s with 8 sessions open (chat view ~31 ms), a software-drawing figure, not a prediction for a real card; every open terminal re-draws its letters on a switch. A 200 MB flood lost output after ~50 MB and delayed Ctrl+C 5 s or more; flow control is built on the perf branch (200 MB shows whole in 6-7 s, Ctrl+C 0.1 s); typing under a flood on a real card is still unmeasured. The 2026-10-05 session-switch lab and recorder are in the session-switching entry below.
      `all` `needs-verify` `P3` `checked 2026-09-10` `performance` → docs/active/investigations/2026-09-29-performance-status.md

- [ ] Measuring rig: instruments that can mislead (8 things).
      (a) The blank-on-switch detector never failed on a known blank case; (b) scrollblank sampling
      slows the renderer it judges (millions of layout reads); (c) native-chat screenshots differ
      run to run because a real model replies (report: docs/active/investigations/2026-09-01-perf-rig-native-chat-nondeterministic.md);
      (d) the artifacts rig sometimes shows an empty files drawer, about one run in nine;
      (e) comparisons do not measure interference during a run, so old 16-20% "regressions" stay
      inconclusive (report: docs/archive/investigations/2026-09-26-performance-history-audit.md);
      (f) software-rendered runs cannot stand for a real high-refresh screen (report:
      docs/active/investigations/2026-09-26-startup-resume-real-scale.md); (g) no recurring startup
      and idle-CPU trend (report: docs/active/investigations/2026-09-16-simplification-audit.md);
      (h) fresh perf worktrees re-download ~490 MB of fixture files. Update 2026-10-04/05: the standard artifacts scenario cannot open the drawer on current master (it waits for a button title and `data-artifact-viewer` the app no longer has), so its selectors need updating before it yields numbers; the review ranks a nightly trend run plus an automatic size limit on the app bundle (none exists; the main script is 3.19 MB). The hitch recorder and `scripts/perf-lab/` (README, `realism.mjs` presets) now give real-use evidence; see the entries below.
      `all` `confirmed` `P3` `checked 2026-08-28` `performance`

- [ ] Sync: growth and duplication decisions (3 things; the history-size decision moved to sync).
      (a) Large synced projects use more file watches than needed; one watch per project risks missed
      edits and needs Linux, Mac and Windows tests; (b) synced code projects that keep Git history
      get a second hidden history; (c) a far-behind device on a slow connection may keep timing out
      its upload, not reproduced.
      `settings/sync` `all` `needs-verify` `P3` `checked 2026-09-16` `performance`

- [ ] Phone and remote: wasted work and slow starts (6 things).
      (a) A phone receives events for every open computer session though it shows one; (b) first
      remote connect can show white before sign-in (report: docs/active/investigations/2026-09-01-remote-first-connect-dead-time.md);
      (c) reconnect re-sends and redraws full conversations; (d) Android reads an entire long
      conversation on open instead of the latest page; (e) marketplace refresh sends the whole ~1 MB
      catalog (report: docs/active/investigations/2026-09-01-marketplace-catalog-payload-size.md);
      (f) animation frame budgets are unchecked on real phones and remote browsers.
      `all` `confirmed` `P3` `checked 2026-08-07` `performance`

- [ ] Theme and animation costs on screen (3 things).
      (a) Theme mascot companions may animate at full display refresh rate, unmeasured (report:
      docs/active/investigations/2026-09-26-startup-resume-real-scale.md); (b) community CSS may keep an
      always-visible animation running at full rate when Reduced Effects is off (report:
      docs/active/investigations/2026-09-01-theme-css-animation-unsanitized.md); (c) other card grids may
      repeat the per-tile blur cost found in the command drawer. Update 2026-10-05: `scripts/perf-lab/gpu-cost.mjs` measures per-process GPU time with no visible window (companion theme and card-grid scenes not yet built). Findings are in the theme-GPU entry below.
      `all` `confirmed` `P3` `checked 2026-07-31` `performance`

- [ ] Files and Office editors: slow and memory-hungry cases (6 things).
      (a) A very large Markdown file pauses ~939 ms on open; plain code versus lazy colouring is a
      product call; (b) editing a file, copying code or navigating an HTML preview can stutter,
      unmeasured (report: docs/active/investigations/2026-09-01-artifact-viewer-spikes.md); (c) restoring
      a kept Office version copies all pictures needlessly; (d) one hung project file list can block
      the next project's list; (e) on a 20 MB Excel sheet typing freezes ~2 s at each autosave;
      (f) every open Office document keeps its editor loaded, so memory grows per tab.
      `files-panel` `desktop` `confirmed` `P3` `checked 2026-09-01` `performance`

- [ ] Session switching: measured slow cases and decisions (6 things).
      (a) The hitch recorder writes a `switch` line per real session switch (time until shown and until settled, cause, chat or terminal, first visit or revisit; counts only) and `hitch-report.mjs` has a "Switching sessions" section; it cannot see paint/GPU time after the first frame. Read a few days of real use before choosing fixes; (b) clicking a chat that is still streaming, then clicking away, can freeze the window ~0.5 s (505 ms in 16 tries; lab-only, native chats); (c) with 16 open sessions every switch costs about a third more and skips a screen refresh, and each terminal-view switch clears the shared letter cache; (d) the owner's slow clicks (up to 720 ms, a 575 ms freeze inside the click) reproduce in the lab only with a development build plus a saturated machine (clicks 2-3x slower; a dev build adds 65-140 ms per click vs 15-35 ms shipped; installed-style build stays under 0.1 s). Not reproduced: the delay between the click handler finishing and the screen changing (lab worst 136 ms, his 608 ms) - an unexplained presentation delay. Next evidence: the recorder in an installed-style test build, then 12+ sessions; (e) shipped on branch session/perf-switch-marks-20261005, not merged: the closed-surface memo (`memoWhileClosed`) and message-box focus after a pointer switch cut the click about 15-20% in the lab's dev-build setup; the session-pill growth and chat-arrival fade still dominate (~80 animation-driven style recalcs per switch) and are governed by `.claude/rules/session-strip-motion.md`, so any change is Destin's call; (f) the app-repo branch `session/perf-reload-repaint-20261005` (send waits for a painted screen) is superseded by master's session-screens and was intentionally not merged. Details: docs/active/investigations/2026-10-05-session-switch-measurement.md, 2026-10-05-session-switch-fix.md, 2026-10-05-lab-realism.md
      `chat` `desktop` `needs-verify` `P3` `checked 2026-10-07` `performance` → docs/active/investigations/2026-10-05-lab-realism.md

- [ ] Session-strip motion cost (owner decision): the session pill resizing and the chat-arrival fade run style and layout work every frame of a switch (about 27 style recalcs, 20 layouts, ~80 "Animation"-reason recalcs). A transform-based version is not pixel-identical, so nothing changed. Decide whether a cheaper look is acceptable; the rules in `.claude/rules/session-strip-motion.md` forbid changing the motion otherwise
      `chat` `desktop` `decision` `P3` `checked 2026-10-07` `performance` → docs/active/investigations/2026-10-05-session-switch-fix.md

- [ ] Hitch recorder, owner decisions: (a) the recorder is always on (`YOUCODED_HITCH_LOG=0` is the only off switch) - decide whether people get a Settings on/off; (b) whether a redacted summary may be attached to bug reports (owner's privacy decision); (c) the same recorder for Android and remote browsers does not exist; (d) it now needs to say whether a build is installed or a developer build (`packaged` on the startup line) so dev-window data is not read as installed-app data. Recorder built on branch session/perf-switch-marks-20261005 (with the hitch-recorder branches), not merged. Reader: `scripts/perf-lab/hitch-report.mjs`; file `<userData>/perf/hitches.jsonl`
      `n/a` `decision` `P3` `checked 2026-10-07` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] Themes may cost more graphics work than they should; all found by reading except the first real-GPU readings of 2026-10-05, and all need a real graphics card: particle themes make every glass chat bubble re-blur 30 times a second (6 of 8 registry themes); two registry wallpapers are 8K (~132 MB each decoded); theme fonts download after the app shows; Reduce Visual Effects does not touch wallpaper size, custom blur or the buddy breathing loop. Readings: particle plus glass themes ~4% of the chip idle, glass themes 11-15% while streaming vs 2.4% plain; Reduce Visual Effects returns both to plain cost. Owner decision: the default for particle/glass effects on weaker hardware
      `themes-screen` `all` `decision` `P3` `checked 2026-10-05` `performance` → docs/active/investigations/2026-10-05-theme-gpu-measurement.md

- [ ] Terminal flow control (held-back program output), long-chat and other perf work from the 2026-10-04 review is built and unmerged on branch session/perf-switch-marks-20261005 (it contains the perf-zero-hitch, recorder and switch-marks work). Decided by Destin 2026-10-04: streamed text redraws at most about every 17 ms (`STREAM_REDRAW_TARGET_HZ` = 60 in `transcript-batch.ts`); an unwatched terminal is fed at most ~0.5 MB/s after a 1 MB burst. Open after merge: stale partial frames above a program redrawing at ~3 MB/s (2 of 3 rig runs; normal use is ~20 KB/s); typing under a flood on a real card; opening a big Excel file still freezes ~0.23-0.29 s (the reading library)
      `terminal` `desktop` `in-flight` `P3` `checked 2026-10-07` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] Windows, macOS and phone verification before release: the terminal speed brake was checked by reading only on Windows (ConPTY) and macOS and a real minimise there was never measured (Chromium may slow a minimised window's timers to ~1 per second); trackpad pinch must zoom the app, not the page, on Windows and macOS; the hitch recorder and switch marks were checked on Linux only; Destin's hand trial was Linux only; phones and remote browsers have no recorder
      `all` `needs-verify` `P3` `checked 2026-10-07` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] With 17 or more Claude Code sessions open, terminals fight over graphics. Every session builds a graphics-accelerated terminal at start even if you never leave chat view, and the system allows only 16. At 20 sessions (software-drawn rig, one run) 4 terminals ended with no working graphics and chat switching showed 12 freezes (worst 173 ms). Fine up to 16. Options: build the terminal only when first shown, or share one
      `terminal` `desktop` `confirmed` `P3` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] Launch takes about 1.3 s and the single 3.19 MB main script costs roughly 0.31 s of it to evaluate. Settings, Marketplace, chess and the QR code are still inside it rather than loaded on first use, and the window sits blank about 0.45 s. Splitting means a brief first-open pause for those screens
      `window-chrome` `desktop` `confirmed` `P3` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] Comparing two large, unrelated files in an edit card freezes the app: 0.65 s at 2,000 lines, 4.3 s at 5,000, 19 s at 10,000 (similar files: 0.09 s), no time limit, even for collapsed cards. Rare, because both engines normally supply a ready-made comparison
      `tool-cards` `desktop` `confirmed` `P3` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md

- [ ] On Android the phone app may be slow while a reply streams, and phones get full glass blur by default with nothing turning it down. Both found by reading code, not measured: each session runs two terminals and rebuilds the whole 2,000-line scrollback as text on every screen update on the touch thread, plus a once-a-second scan per session; output can be dropped when the screen falls behind; the phone is kept awake whenever a session exists and four polling loops per session never pause in the background; blur is the costliest effect on phone chips. Feel: hitches, a terminal that looks frozen then jumps, battery drain
      `android` `needs-verify` `P3` `checked 2026-10-04` `performance` → docs/active/investigations/2026-10-04-performance-gap-review.md
