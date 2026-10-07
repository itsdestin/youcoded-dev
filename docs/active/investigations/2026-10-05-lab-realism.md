---
title: Making the perf lab feel like Destin's real use (calibration by ablation)
status: active
date: 2026-10-07
---

# Making the perf lab feel like Destin's real use

## Plain-language summary (read this first)

**The question.** Destin feels slow, hitchy session switching. The lab said switching takes 20-35 ms and never hitches. So the lab was
measuring something other than what he uses. He asked us to measure "the closest possible thing to a real user using the real app".

**What we built.** `scripts/perf-lab/realism.mjs`: one command that drives the app with real mouse presses at human speed (150-600 ms between
flips, a press that is held ~100 ms, occasional scrolling, typing and the Shift switcher) and records exactly what his own hitch recorder records
for a click: how long the page was too busy to even start (input delay), how long the click handler ran, and how long the screen took to show the
result (presentation). Every way the lab differs from his computer is a switch you can flip one at a time: packaged vs development build, fake
vs his real conversations (copied safely, never opened for writing, text never read), plain vs his glass-and-particles theme, software drawing vs
the real graphics chip at his screen size and scale, 4 to 20 sessions, a busy machine, a freshly started vs well-used app.
About 110 app launches were measured.

**What explains his slow clicks (largest first).**
1. **A busy machine.** When every processor core is busy with other work (machine load about 35, like a build plus virtual machines), the same clicks
   get 2-3 times slower: packaged build 24 ms -> 64 ms typical; development build 72 ms -> 150-200 ms typical. His recorded burst coincided with other heavy work. This is the only thing that moved the worst cases, and the lab can now create it on purpose.
2. **He was running a development build.** The development build (React's slow checking mode) spends 65-140 ms in the click handler; the shipped build spends 15-35 ms. His handler times (median 80 ms) match development, not the shipped app. This alone moves the lab from "never hitches" to "right at his threshold".
3. **How many sessions are open.** Packaged, quiet: 4 sessions 24 ms, 12 sessions 68 ms, 20 sessions 64 ms typical. With 12 sessions and a busy machine the packaged build reaches 208 ms typical (70% of clicks slow). He had 4 open. More sessions is a real, independent cost.
4. **Content depth.** Scrolling each conversation back through its older history (as a person who has read back does) adds handler time only in the development build under load (worst 248 -> 520 ms).

**What does NOT matter much (on the real graphics chip).** His real conversations vs fake ones (the fake ones are actually heavier), the glass+particle theme vs the plain theme (packaged: no difference; in the development build the plain theme was oddly slower, see open items), a fresh vs a well-used app, a 10-minute soak, a light background load.

**A trap in the old lab.** Software drawing (the old Xvfb display) with the glass+particle theme is 2-10x WORSE than reality (typical 72-312 ms, worst 1.3 s) because the processor draws the glass. Never use it to judge themes.

**Does the lab now reproduce his numbers?** Partly. The best configuration (development build, his most recent conversations scrolled back, real graphics chip, saturated machine) gives worst click-to-paint **520 ms** (his 1,056 ms), typical-of-slow 376 ms (his 536 ms) and worst handler **427 ms** (his 462 ms): within 2x on 3 of 5 measures. It does NOT reproduce his *presentation delay* (after the handler, before the screen changes): lab worst 136 ms vs his 608 ms, and it does not reproduce his 4:1 pointer-up/click delays. The one lab setup that did reach his presentation numbers is software drawing (430-1,300 ms) which his computer does not use. What is left is the physical screen at 180 Hz (not reproducible here) and, possibly, his desktop's own graphics load.

**Does the shipped build hitch for him?** The lab says: a packaged build on a quiet machine stays under 100 ms with 4 sessions (worst 40 ms), and under a saturated machine it is 64 ms typical. The development build is where the 100-500 ms handlers live. The switching fix (app commit b414a1270) cuts the development-build handler by about 25-30% (storm typical 200 -> 168 ms; with deep history 304 -> 272 ms, worst 520 -> 448 ms) and leaves the packaged build unchanged (it was already fast).

**Recommended standard configuration.** The one-line preset (packaged, his conversations, his theme, real GPU at his screen size, 4 sessions, machine saturated):

```
node scripts/perf-lab/realism.mjs --preset real-use-storm --checkout <worktree>/youcoded --boots 3 --seqs fresh,warm,busy
```
and for the closest match to his hand test add `--build dev --pick newest --deep on`. Judge a change by the `busy` run (contended) and the quiet runs together.

## Target: his recorded data

Source: `~/.config/youcoded-perfzero/perf/hitches.jsonl` (the dev profile; 153 minutes, one launch, 4 sessions open, dpr 1.5). The file only holds inputs of 104 ms or more, so we compare the slow tail. 129 slow inputs: pointerdown 93, pointerup 18, click 18. All with 4 sessions open, view = chat.

| | n | click->paint p50 / p95 / max | input delay p50 / max | handler p50 / p95 / max | presentation p50 / p95 / max |
|---|---|---|---|---|---|
| all slow inputs | 129 | 128 / 536 / 1,056 | 1 / 449 | 74 / 256 / 462 | 41 / 213 / 608 |
| pointerdown | 93 | 120 / 448 / 720 | 1 / 120 | 80 / 281 / 462 | 36 / 113 / 345 |
| pointerup + click | 36 | 232-256 / 1,056 / 1,056 | 166-183 / 449 | 0-13 / 35-90 | 52-55 / 608 / 608 |
| quiet minutes only (10 inputs, 5 minutes) | 10 | 112 / 136 / 136 | 1 / 29 | 80 / 92 / 92 | 34 / 66 / 66 |
| burst minutes (119 inputs, 6 minutes) | 119 | 128 / 552 / 1,056 | 2 / 449 | 73 / 279 / 462 | 43 / 260 / 608 |

Reading it: pointerdown is where the work happens (handler 80 ms median); pointerup and click are slow only because they queued behind it (input delay 166-449 ms). Document element count at the time: 797-1,512 (lab: 1,214-1,449 with 4 sessions, so content scale matches).

## What changed in the lab (`scripts/perf-lab/`)

| File | Role |
|---|---|
| `realism.mjs` | the orchestrator; every factor a flag; presets `real-use`, `real-use-storm`, `cheap` |
| `realism-stats.mjs` | pure maths: Event Timing three-way split, percentiles, his-target extraction, 2x calibration test, seeded human flip plan, size-ladder picker |
| `realism-page.mjs` | in-page recorder (Event Timing, long animation frames, long tasks, pane check, content census counts) |
| `realism-load.mjs` | busy desktop: CPU hogs + a browser-like page, on the lab's own display only, killed by pid |
| `realism-table.mjs` | one table from result files |
| `tests/realism*.test.mjs` | 11 unit tests |

Measurement matches the recorder by construction: `delay = processingStart - startTime`, `handler = processingEnd - processingStart`, `presentation = duration - (processingEnd - startTime)`, slow = duration >= 104 ms, for pointerdown/pointerup/click. Real mouse input over CDP (pointer arrives over the pill, 25-90 ms aim, 60-140 ms hold), pill rectangle read fresh before every click.

## Ablation results

All numbers are click-to-paint in ms over pointerdown + pointerup + click, 60 s of human flipping per run (about 130 clicks), the **median of the p95 across boots** and the **worst single input**, on the packaged build unless stated. "Quiet" = fresh and warm runs that started at machine load < 8 (runs polluted by other work on the machine are excluded; the lab shares this computer with other sessions). "Storm" = the `busy heavy` run (every core saturated, machine load ~35). Handler/presentation are the worst seen. Source JSON: `scratch/perf-lab/realism/out/grid..grid6` (gitignored). n = 2-6 runs per cell (a cell is 2-3 boots, each giving a fresh and a warm run).

Reference points (4 sessions, real conversations, glass theme, real GPU):

| Cell | quiet p95 / worst | quiet handler / present | storm p95 / worst | storm handler / present |
|---|---|---|---|---|
| packaged (baseline) | 24 / 40 | 17 / 31 | 64-72 / 96 | 33 / 70-94 |
| packaged, with fix b414a1270 | 40 / 72 | 36 / 39 | 72 / 288 (one polluted boot) | 160 / 152 |
| dev | 72-92 / 96-168 | 66-142 / 32-37 | 152-200 / 184-248 | 138-190 / 72-84 |
| dev, with fix b414a1270 | 64-88 / 80-136 | 52-103 / 31-43 | 128-168 / 160-208 | 114-140 / 68-84 |
| dev, newest conversations + deep scroll | 80-120 / 120-200 | 102-167 / 36-44 | 212-304 / 296-520 | 244-427 / 73-136 |
| dev, newest + deep, with fix | 112 / 216 | 175 / 57 | 272 / 448 | 372 / 119 |

Factor table (one factor changed at a time from the cell named):

| Factor (from -> to) | Effect on typical (p95) and worst | Effect on presentation delay | Confidence |
|---|---|---|---|
| **Machine load**: quiet -> storm (packaged) | 24 -> 64-72 (x2.7-3); worst 40 -> 96 | 31 -> 70-94 | high (3 cells x 3 boots, repeated 4x) |
| **Machine load**: quiet -> storm (dev) | 72-92 -> 152-200; worst 96-168 -> 184-248 | 32 -> 72-84 | high |
| **Build**: packaged -> dev (quiet) | 24 -> 72-92; handler 17 -> 66-142 | none | high (6 boots x 2 runs) |
| **Build**: packaged -> dev (storm) | 64-72 -> 152-200 | none | high |
| **Sessions** 4 -> 6 / 12 / 20 (packaged, quiet) | 24 -> 44 / 68 / 64; worst 40 -> 64 / 128 / 136 | 31 -> 39 / 64 / 57 | medium-high (12: 2 boots, 20: 1 boot) |
| **Sessions** 4 -> 12 / 20 (packaged, storm) | 64-72 -> 208 / 216; worst 96 -> 288 | 70 -> 167 / 171 | medium (12: 2 boots, 20: 1) |
| **Sessions** 4 -> 12 (dev, quiet / storm) | 72-92 -> 100 / 72-92 stays ~200 | none | medium |
| **Display**: real GPU -> software (Xvfb), packaged, glass theme | quiet 24 -> 72 (one boot 144-232); storm 64 -> 312-552, worst 1,536 | 31 -> 190 quiet; 430-1,531 storm | high (software drawing is the lab's own artifact) |
| **Display**: real GPU -> software, dev, storm | 152 -> 968; worst 1,328 | 1,307 | medium (1-2 boots) |
| **Theme**: glass+particles -> plain (packaged) | 24 -> 24 quiet; storm 64 -> 56 | none | high (2-3 boots) |
| **Theme**: glass+particles -> plain (dev) | 72-92 -> 112-116 (worse!); slow share 0-3% -> 22-24% | none | medium: reproduced in 3 cells but cause unknown (see open items) |
| **History**: real -> fixture (packaged, quiet) | 24 -> 36-56 (fixture is heavier) | 31 -> 66 | medium |
| **History**: real -> fixture (dev, quiet) | 72-92 -> 156; handler 66 -> 258 | none | medium |
| **Content depth**: scroll back through history + newest conversations (dev, storm) | 152-200 -> 212-304; handler 138-190 -> 244-427 | 72-84 -> 73-136 | medium-high (3 boots + 2 boots) |
| **Content depth** (packaged) | no change (24; storm 72) | none | medium (2 boots) |
| **Uptime**: fresh vs warm (quiet) | within 2 ms of each other (24 vs 24; dev 72 vs 72) | none | high |
| **Uptime**: 10-minute soak of continuous flipping | 24 -> 24-40 (packaged), dev 88 -> 88 | none | medium (soak only 5 boots; first boot polluted by load) |
| **Light background load** (`busy on`): quiet -> on | 24 -> 32 | 31 -> 31-85 | medium |
| **Graphics-chip load** (browser page filling the GPU) | packaged 24 -> 28-48 (no effect); dev 84 -> 136 | 31 -> 39-92 | low-medium (2 boots each) |
| **Both** CPU storm + GPU load (dev) | storm 152 -> 200; worst 184 -> 248 | 72-84 -> 95 | low-medium |

Factors that were only run once or twice are marked; none of them changes the ranking: **machine load and the development build explain almost all of the gap; the number of sessions comes next; theme, history, uptime and a light background load explain nothing on the real graphics chip.**

How much of the gap each explains (worst click-to-paint, his 1,056 ms): packaged quiet 40 ms -> storm 96 (the load factor alone is +56 ms, x2.4); -> dev storm 184-248 (+90-150 ms); -> dev storm, deep newest history 296-520 (+110-270 ms). Sessions at 12 add ~+190 ms in the packaged storm. Remaining unexplained: 1,056 vs 520 worst, and presentation delay 608 vs 136.

## Calibration against the target (within 2x)

Best configuration: `--preset real-use-storm --build dev --pick newest --deep on` (3 boots, `busy` run, load ~35-53):

| Measure | Lab | His | Ratio |
|---|---|---|---|
| worst click->paint | 520 ms | 1,056 ms | 0.5 (within 2x) |
| p95 of the slow ones | 376 ms | 536 ms | 0.7 (within) |
| worst handler | 427 ms | 462 ms | 0.9 (within) |
| worst presentation delay | 136 ms | 608 ms | 0.2 (NOT within) |
| slow inputs per minute | 85-100 | 11.7 per active minute | not comparable (his file has no count of how many clicks he made) |

The same config without deep/newest history: 2 of 5. The packaged build in the same storm: 0 of 5 (its worst is 96-112 ms, ~10x below his tail), which is consistent with his data being from a development build.

## With fix (app commit b414a1270)

Built from a detached scratch worktree (`git worktree add --detach`, since removed) so the live tree was never touched; the dev rows built b414a1270 from `git archive`. Same storm, same sequence, 3 boots each:

| | typical (p95) before -> after | worst before -> after | handler before -> after |
|---|---|---|---|
| dev, 4 sessions | 200 -> 168 | 248 -> 208 | 190 -> 140 |
| dev, newest + deep scroll | 304 -> 272 | 520 -> 448 | 427 -> 372 |
| packaged | 72 -> 72 | 96 -> 288* | 34 -> 160* |

*One packaged-with-fix storm boot caught another session's burst of work (machine load went to 98 while it ran); the other two boots read 56-64 ms, worst 80. The baseline packaged run in the same grid shows the same typical value (72). The earlier fix build (482414ae4) in a quieter grid: packaged storm p95 56, worst 80 (baseline 64 / 96); dev storm p95 128 vs 152, handler 114 vs 138. Conclusion: the fix lowers the development-build handler by about a quarter and does not change the packaged build, which was not slow here.

## Controls and checks

- Positive control (a 200 ms handler injected on every pill press): the worst click-to-paint read 224-352 ms on all 8 boots that ran it after the control was fixed (3 packaged, 3 dev, 2 trial/smoke), so the numbers do move by the injected amount. The first version (a block sent over the debugger after the press) was invalid on the 180 Hz display (the frame was already presented, so it read 24 ms) and was replaced by an in-page capture listener. Only the first boots ran the controls; later grids skipped them (`--seqs fresh,warm,busy`).
- No-op control (clicking the active session): no pane change, no measured input, on every boot.
- Identity: each press is checked 450 ms later (when the next press is at least 500 ms away): 5 mismatches in 9,881 judged presses, all in runs started at machine load > 43 (the switch arrived later than 450 ms, no evidence of a wrong or blank pane staying). 28 of ~14,000 planned clicks missed because the pill was not in the strip (12 sessions on a 1,600-px window: the strip scrolls).
- GL_RENDERER proof for every real-GPU cell (saved in each JSON): `ANGLE (AMD, AMD Radeon 8060S Graphics (radeonsi strix_halo ACO), OpenGL ES 3.2 Mesa 26.2.0-devel)`, GPU compositing and rasterization enabled, compositor refresh 179.7-179.9 Hz, viewport 1707x1067 at devicePixelRatio 1.5 (= 2560x1600 at scale 1.5). Xvfb cells report llvmpipe, 1600x1000, ratio 1, 60 Hz.
- Per-process GPU engine time (drm fdinfo): packaged glass-theme chat 14-22% of the chip in these runs; GPU clock varied 600-2,100 MHz and is recorded per run (`resources.sclkMHz`).
- Content census (counts only): the app draws only a tail of each conversation: 3-28 timeline entries, 0-24 folded, 0-4 tool cards, 0-1 tables, 0 code blocks and 0 images in these samples, regardless of file size (0.3-107 MB). Document element count 1,214-1,449. See the privacy note: this is the whole of what was read from the copies.

## What is still unexplained (and next step)

1. **Presentation delay of 260-608 ms.** Lab worst 136 ms on the real chip. Software drawing reproduces the size (430-1,500 ms) but his computer does not use it (we cannot check; chrome://gpu on the live app is off limits). Candidates: contention for his real graphics chip with his desktop and virtual machines (our browser-page load did not reproduce it: <=95 ms), the physical panel / display pipeline (not reproducible: the private compositor has no scanout), or his dev build's GPU process settings.
2. **Pointer-up/click queuing 166-449 ms and 1.0 s worst.** Needs a main-thread task of 400+ ms around a press; the lab's longest was 427 ms handler. His burst ran with engine stalls up to 3.7 s (whole computer busy), a heavier storm than ours.
3. **Dev + plain theme is slower than dev + glass theme** (handler 107-163 vs 66-142, 22% slow vs 0-3%), reproduced in 3 cells with GPU clocks around 900 MHz vs 1,800+; looks like a power-state (processor/graphics wake-up) effect, not the theme's code. Not investigated further here.
4. **The decisive next step** is ground truth from his own installed app: the hitch recorder's `switch` lines (switch-marks) from a packaged build during real use, with the app version and `perf/hitches.jsonl` read from outside. If his packaged app does not log slow clicks, the whole gap is the development build plus machine load.

## Privacy and safety record

- Real conversations were used ONLY as reflink copies in `scratch/perf-lab/realism/realism-fixture-*` (HOME of the app under test), created per boot and deleted per boot (`fixtureDeleted: true` in all 110 result files). Sizes and modification times of the originals were read to choose by size; originals never opened for writing; no conversation text was read, printed, committed or written into any note: only counts of DOM elements and entries. Result files hold sizes and counts only.
- Verified at the end: no `.claude/projects` directory and no `realism-fixture-*` directory remains under `scratch/`.
- The live app, `~/.config/youcoded`, `~/.claude/settings.json` were not touched. The theme used is the registry copy of `devils-garden` plus the look settings from the appearance file (settings only). Hog processes and the browser-like page ran on the lab's private display and were killed by pid.

## Technical record

- Machine: ASUS Z13, Ryzen AI Max+ 395 (32 threads), Radeon 8060S, KDE 6.7.3 Wayland; app packaged Electron 41 (b050cd00d frozen line, b414a1270 with fix). Dev tree: `git archive` of the commit + reflink copy of node_modules, private Vite on port 5273.
- One boot = ~5-9 minutes: sessions opened through the fake `claude` (the on-screen history is the copied/fixture transcript), `fresh` run, warm-up + census, `warm`, optional `soak`/`busy`, controls.
- Load discipline: each boot waits for no other rig run and load < 8 (up to 45 minutes, then runs flagged). Many cells ran while other sessions loaded the machine; quiet columns exclude runs that started above load 8.
- Limits: the invisible compositor has no scanout/vblank/PSR; a single machine; 60-second runs; the fake CLI as session producer; 4-session count taken from his file; his actual conversation set at the time was not known (we picked by size/recency); GPU clock was not controlled.
