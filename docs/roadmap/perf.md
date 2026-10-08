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
      instance opened, so remeasure on a fresh install.
      `desktop` `confirmed` `P3` `checked 2026-09-01` `needs-repro` `performance`

- [ ] Measuring rig: scenarios not yet measured (5 things).
      (a) Terminal session switching on a real graphics card, and a busy six-terminal feel check;
      (b) sustained terminal output together with typing; (c) file-pane edits to another file while
      streaming; (d) long-history chats as a recurring lane, plus the ~137 vs ~580 ms terminal-switch
      comparison; (e) long soak and memory slopes, giant bodies, tool churn, sync interference,
      effects-heavy and drag/resize cases. These are coverage gaps, not proven bugs.
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
      (h) fresh perf worktrees re-download ~490 MB of fixture files.
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
      repeat the per-tile blur cost found in the command drawer.
      `all` `confirmed` `P3` `checked 2026-07-31` `performance`

- [ ] Files and Office editors: slow and memory-hungry cases (6 things).
      (a) A very large Markdown file pauses ~939 ms on open; plain code versus lazy colouring is a
      product call; (b) editing a file, copying code or navigating an HTML preview can stutter,
      unmeasured (report: docs/active/investigations/2026-09-01-artifact-viewer-spikes.md); (c) restoring
      a kept Office version copies all pictures needlessly; (d) one hung project file list can block
      the next project's list; (e) on a 20 MB Excel sheet typing freezes ~2 s at each autosave;
      (f) every open Office document keeps its editor loaded, so memory grows per tab.
      `files-panel` `desktop` `confirmed` `P3` `checked 2026-09-01` `performance`
