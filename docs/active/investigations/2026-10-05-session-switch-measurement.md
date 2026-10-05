---
status: active
date: 2026-10-05
---

# Session switching, measured the way a person does it (2026-10-05)

Tool: `scripts/perf-lab/switch-pingpong.mjs` (README section "switch-pingpong.mjs"). Build measured: the **packaged** five-fixes line, app commit b050cd00d (frozen), six sessions open (16 for some runs), software drawing on a virtual screen. Raw results: `scratch/perf-lab/switch/*.json` (not tracked).

## In plain words

**What flipping between sessions costs in the lab.** Clicking another session's tab with a real mouse click, the new conversation is on screen in about **25-35 ms** (two screen refreshes) and has stopped changing about as fast. That holds for small and huge conversations alike, spaced out (1 s), or flipped back and forth every 400, 250 or 150 ms, in bursts of 10 clicks 40 ms apart, and when a second click interrupts the first. Nothing froze the whole app (the main process answered every health ping within 2 ms), and the only skipped screen refreshes were single-refresh misses of 25-50 ms.

**Where it was not fine.**
- **A destination that is still receiving a streamed reply** (the native chat with the fake model at 150 words-pieces a second) skips refreshes in most switches (10 to 20 of every 20 switches had a gap of 30-50 ms) and, when you click it and then click away 60 ms later, the slowest of 16 took **505 ms** (a 586 ms stretch where the window could not draw; 644 ms in an earlier run). Those two runs were on a busy machine (load 15 and 35), so the size is inflated, but it reappeared both times and no other situation showed anything like it. Claude Code chats do not stream text in this app, so this applies to native chats only.
- **16 open sessions** cost about a third more per switch than 6 (chat 33-35 ms vs 22-30 ms; terminal 38-40 ms vs 25-30 ms), and every switch skipped a refresh.
- **Terminal view** takes about 25-30 ms to show and **40-48 ms to stop changing** (the shared letter cache is cleared on every switch to a terminal: exactly 1 clear per switch). A terminal with 20 MB of earlier output hidden behind another session was slower in one run (47 ms to show, 64 ms to settle, a frame gap in every switch) but not when repeated (21-25 / 40), and its control check failed twice (below), so treat that case as unproven.

**What lands after you arrive.** A switch itself costs about 17 ms of work. In the following 3.4 s the window does another 70-100 ms of work in chat (about 17-20 layouts), ~120-250 ms in a terminal-view session, ~180 ms (one run 1.1 s) when the destination streams. Nothing blocked.

**Typing and scrolling in the first half second.** After a pill click the keyboard focus sits on the pill button, not the message box (16 of 16 chat tries): a person must click the box first or typed letters go nowhere. With focus forced into the box, a typed character was on screen in 4-14 ms at +50, +150, +300 and +600 ms after the click (terminal: 10-25 ms, worst 38 ms), and the key reached the page within 0.3-5 ms. A wheel tick waited 17-40 ms for the page, but the same tick with no switch near it waited ~30 ms (19-31), so that is the baseline, not switch-caused.

**Rapid flipping vs spaced.** No different in this lab: 150 ms flipping shows the pane in ~29 ms like 1 s spacing does. In a 10-click burst the final pane is up ~380 ms after the first click (the click cadence), 18-31 ms after the last; the panes in between each paint for 4-8 frames and still run their mutation work (8-9 DOM-change batches per intermediate pane) for nothing. When a second click interrupts, the first pane shows for a frame or more and the second is up ~80-90 ms after the first click.

**The owner's hand test did not reproduce.** His build (a Vite dev build, so React runs in slow development mode) showed pointer events up to 720 ms and a 575 ms freeze inside the click. The packaged build on this fixture never exceeded ~60 ms except the streaming case above. So either dev mode is a large part of what he felt (a dev-vs-packaged run was NOT done: not cheap), or his real histories (tool cards, long Markdown, folded messages) or a real graphics card matter. The lab cannot say which.

## The worst situations, ranked

1. **Interrupting a switch into a streaming chat**: 505 ms (p95 of 16, load 15), 644 ms (earlier run, load 35); one 586 ms block with 532 ms blocking; nine of 16 slow clicks were over 60 ms. Cause not named: the profile of that switch (3 re-runs, 420-550 ms sampled) is ~75% "(program)" (the browser's own drawing/layout, not script) plus ~10 ms in one minified app function `SUe` and `getBoundingClientRect`; no single app function dominates.
2. **Switching with a streaming destination, any cadence**: show 23-30 ms p50 but p95 29-43 ms and 10-20 of 20 switches skip a refresh; 52 ms worst gap in bursts.
3. **16 sessions**: +30% on every switch (see above).
4. **Terminal switch**: always ~40-48 ms to settle plus the glyph-cache clear; the 20 MB case unreproduced.
5. **A switch's follow-on work**: 70-100 ms of window work in chat after each arrival (script 8 ms, 17-20 layouts, style recalcs), not harmful alone.

Top functions in the worst switch (CPU profile, sampling slows the page): `(program)` 227-441 ms of 420-550, `(garbage collector)` 45, `SUe` (index-*.js:356) 7-15, `getBoundingClientRect` 4-8 (this one is the recorder's own pill read), `kUe` 3.

## What was checked about the instrument

- **Positive control** (a known 200 ms block injected right after each click): moved first paint by **+185, +189, +165 (streaming), +199, +195, +200 ms** in small-huge, huge-huge, idle-streaming, idle-caughtup, term-term, term-flood2 (rerun). **It FAILED for term-flood20 twice** (-18 ms, -7 ms): the instrument could not see a block in that configuration, so no flood20 number is trusted. Cause unknown.
- **No-op control** (click the already-active session, 6 times in every configuration): reported "no switch" every time, never 0 ms.
- Every switch is checked against the intended pane. First version dropped 31 of 40 clicks at 150 ms because the tab row moves while it animates; fixed by aiming at the live position, and the final runs had 0 dropped (a few single drops in bursts, counted in the files).
- Keyboard switcher: hold Shift 350 ms, Arrow Down repeats, release Shift. 59 key repeats were seen with 0.4 ms median queue delay; the list shows 12 rows; the switch lands on the last session (the list stops at the end, it does not wrap). In chat the final switch showed in 17-135 ms. In terminal view the last session is a native chat with no terminal, so those runs report "never shown" (a setup artefact, not a finding). The shortcut works only while no text box has focus.

## Technical record

Matrix (6 sessions unless noted; p50/p95/max of show, ms; settle equals show in chat for idle destinations because the pane was already rendered):

| situation | a 1 s | b400 | b250 | b150 | burst c | interrupted d |
|---|---|---|---|---|---|---|
| small <-> huge | 17.8/33.4/34.2 | 30.1/31.2/31.3 | 29.5/30.1/30.4 | 29.2/29.8/30.2 | 25.9/31.5/32.6 | 23.5/32.4/32.4 |
| huge <-> huge | 22.1/25.4/26.2 | 30.2/30.9/32 | 29.7/30.7/30.7 | 29.7/30.3/30.4 | 26.1/32.4/32.7 | 26/33.5/33.5 |
| idle <-> streaming | 24.9/29.1/32.8 | 30.1/35/35.9 | 24.1/29/30.7 | 23.2/29.2/36.7 | 29/40.4/47.3 | 40.6/505.4/505.4 (load 15) |
| idle <-> reply landed while hidden | 24.2/27.2/28.8 | 25.3/27.1/27.1 | 29.7/30.8/31.6 | 29.4/30.5/30.5 | 25.9/33/33.3 | 25.9/33.2/33.2 |
| terminal <-> terminal (show / settle) | 25.1/29.1/29.2 / 42.3/46.8/46.9 | 24.7/27.7/32.4 / 43.2/45.5/45.9 | 30/30.8/31 / 48.1/48.7/48.7 | 29.7/30.5/30.5 / 48.1 | 26.2/33.1/33.3 / 52.8/56.5 | 27/34.3/34.3 / 42.6/50.1 |
| terminal <-> terminal that made 2 MB hidden (rerun, low load) | 29.3/32.6/33.9 / 46.9/48.3/48.4 | 23.1/24.2/25.3 / 40.8/41.9/42.1 | 21.7/22.4/23.1 / 39.9/40.6/41.1 | 21.2/32.9/33.7 / 36.1 | (first run, load 25) 34.6/42.1/45.5 | 26.8/34.2/34.2 |
| terminal <-> 20 MB hidden (first run, low load; control failed) | 47.1/49.9/52.3 / 63.8/66.4/67.6 | 42.2/51/54.9 / 64.2/67.3/71.3 | 47/51.8/51.9 / 67.4/71.5/73.3 | 43.1/48.2/48.4 / 61.8 | 49.9/69.9/80.5 / 48/58/58 | 47.9/66/66 / 58.2/72.7/72.7 |
| 16 sessions: small <-> huge | 33.1/36.6/38.2 | 33.4/37.4/38.3 | 31.2/32.9/36.4 | 29.3/33.8/34.3 | - | - |
| 16 sessions: huge <-> huge | 34.5/38.4/42.5 | 34.9/37.4/38.2 | 35.3/37.1/37.8 | 29/32.1/32.5 | - | - |
| 16 sessions: terminal | 38.1/41.6/42.7 / 45.5/50.7/62.4 | 40.2/53.3/54.3 / 53.7/70.3/71.1 | 38.9/40.1/40.7 / 48.9/51.8/54.4 | 38.6/40.1/40.2 / 57.8 | - | - |

Sequences were 20 switches each (burst: 3 reps of 10; interrupted: 8 reps). The settle for b150 is mostly unconfirmed (the next click arrives before 150 ms of quiet), so the table shows the one confirmed value. Streaming rows have no settle (a streaming pane never goes quiet). Rows marked load in the files (`loadHigh`) were run above load 8: term-flood2 a-d first run (23-35), term-term late/probe first run (33-190), idle-streaming d/ctrl/profile; term-flood2 and term-term late/probe were repeated at low load. Catch-up (f): a reply that landed while hidden showed in 20-32 ms (4 reps); a hidden 2 MB flood: 26-30 ms to show, 41-48 ms to settle; a hidden 20 MB flood: the buffer already held the end marker before the first switch (the hidden terminal digests the backlog while hidden), so arrival was 31-46 ms with 29-43 ms gaps. The 2 MB first run's "marker on screen when leaving" check read false (unverified, so that run does not prove content arrived).

Late work (CDP deltas from first frame to ~3.4 s, p50/max task ms): small-huge 74/95, huge-huge 69/87, idle-caughtup 100/141, idle-streaming 180/1118, term-term (rerun) 123/198, term-flood2 171/200.

Terminal switches cleared the shared glyph cache once each (term-term: 1 per switch). The terminal drew with the DOM fallback (renderer 'dom'), not WebGL, in this rig, so the real-card upload cost is unmeasured.

## Limits

Software drawing on a virtual screen; frames are not the physical panel; fake Claude Code program and fake model; fixture histories (50/2,500/3,500 turns, plain generated text) are far lighter than the owner's real ones; one boot per configuration (term-flood20 differed between boots); the packaged build, not the dev build the owner used; the optional real-graphics-card lane and the dev-vs-packaged comparison were not run; the strip pill rectangle read just before each click is a layout flush outside the timed window; the recorder itself (frame loop, observers) adds small cost, the controls show it can still see a 200 ms block.

## Recommendation

The packaged build's chat switching in the lab is not where the owner's pain is. Next measurements, in order: (1) the same sequences on a copy of real history at real scale (reflink copy as in `real-scale-startup.mjs`) to see whether real content makes a click take hundreds of ms; (2) the same leg against a Vite dev instance on the virtual screen to size dev-mode inflation; (3) fix the interrupted-click-into-streaming-chat case (505-644 ms).
