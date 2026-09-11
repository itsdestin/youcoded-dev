# perf-lab 2026-09-10-0206-69cde4e-watcher-thrash-fix-2

sha 69cde4e8dfa448b4db64d297b9ab4342354d1b0e (fix/projects-watcher-thrash) — 2026-09-10T02:06:13.427Z
machine: AMD RYZEN AI MAX+ 395 w/ Radeon 8060S · 121 GB · kernel 7.1.3-2-cachyos · node v26.4.0
  renderer: ANGLE (Mesa, llvmpipe (LLVM 22.1.6 256 bits), OpenGL 4.6 (Core Profile) Mesa 26.2.0-devel (git-a982deee39)) — SOFTWARE, gpu_compositing=disabled_software (via SystemInfo)

| metric | median |
|---|---|
| startup.whenReady | — |
| startup.createWindowAt | — |
| startup.blankWindowMs | — |
| startup.didFinishLoad | — |
| startup.firstContentfulPaint | — |
| startup.appMounted | — |
| startup.sessionsListed | — |
| startup.postWindowDone (network) | — |
| idle PSS | — |
| idle CPU | — |
| projects.open to first cards / to counts (median of 3; 1600 files in 40 folders) | 163.5 ms / 163.7 ms |
| projects.search first key (flat flip) / keystroke median / p95 | 62 ms / 22.7 ms / 36 ms |
| projects.filter "Code & configs" -> flat grid | 99.4 ms for 831 cards, 4277 DOM nodes |
| projects.scroll flat grid | 40 screens, long tasks 0 ms total / max 0 ms, worst frame gap 0 ms, previews 0 img + 0 iframe |
| projects.list view | 98.6 ms |
| projects.switch big -> small / small -> big | 66.5 ms / 366.2 ms |
| projects.conversations tab | 107.3 ms |
| projects.tab thrash (Files <-> Conversations, rapid): to Files median / p95 / max | 64.2 ms / 65.3 ms / 65.3 ms; to Conversations median / max 115.7 ms / 117 ms; long tasks 537 ms, worst frame gap 83 ms, main process unresponsive 0 ms in total, worst IPC 6 ms |
| projects.reopen to first cards | 164.6 ms |
| projects long tasks | 711 ms total, max 69 ms |
| projects IPC stall (sum over steps) | 47 ms, max 82 ms, from 186 probe replies |

noise: load 3.38, busy 2.9%, worst accepted load 3.38 / busy 2.9%, discarded 0
errors (desktop.log "level":"ERROR" lines): cold starts [], scenario boot —, workload boots [], stall boot —, artifacts boot —, projects boot 0, scrollback boot —
A boot that logged errors is not a clean measurement — do not rank a phase from one. Full logs: scratch/perf-lab/logs/.

## What was actually measured

Every number above was produced in a specific configuration. Three wrong conclusions
in this project came from a number measured where the defect could not appear, and none
of them failed loudly — they returned clean numbers. Read the configuration with the number.

### projects

**Question:** What does the Projects view cost to open, search, filter, scroll and switch over a ~1,600-file project?

**Configuration:**
- two saved projects: gamma (~1,600 generated files in 40 folders: 45% code, 25% markdown, 12% html, 10% png, 8% json) and alpha (the transcript fixture, 2 files)
- gamma carries a file-history record at Destin's 2026-09-09 scale — ~8,000 records / ~28,000 versions, ~80% of them under worktrees that do not exist — and 700 one-turn conversations under its Claude Code slug
- gamma also holds ~6,000 nested directories under worktrees/wt-N/ (each a nested repo, so discovery skips them and only the project watcher walks them) — the shape of Destin's youcoded-dev, where a watcher restart measured 4 s
- stock theme, no wallpaper — the per-card backdrop blur is NOT applied here
- seven letters typed into the file search at ~45 ms spacing; the type filter "Code & configs" flattens the grid

**Where each clock starts and stops:**
- `open.openMs` — click the header Projects button -> the first file/folder cards painted
- `open.countsMs` — the same click -> the Files segment shows a count (the withCounts pass landed)
- `search.keystroke` — keydown -> painted, measured in-page via beforeinput; firstKeyMs is the flat-mode flip
- `filter.codeMs` — click the type chip -> the flat grid painted
- `switch.*` — click the palette row -> the other project's hero name and a settled Files tab

**Blind to:**
- GPU cost: every file card is .layer-surface, which wallpaper themes give a backdrop-filter blur; under Xvfb/llvmpipe that is software-rasterised or skipped, so its real cost on a display is not measured
- the stock theme has no wallpaper, so the per-card blur is not applied at all in this configuration
- a project over the 2,000-file discovery cap (Destin's youcoded-dev is 3,279): the fixture sits under it so counts are exact
- the small project (alpha) has three conversations; the conversation-heavy leg is measured on gamma only

