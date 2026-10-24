# Quiet-desktop performance tests, 2026-10-23

Plain-language findings. All numbers come from Destin's desktop, which was nearly idle (other programs used about 0.7 of 16 cores; every measuring window was judged "clean" by the lab). Desktop numbers are only comparable with other desktop numbers. The desktop shows the app in software drawing (no graphics card), same as the laptop runs.

- A = master `d0a7211` (the app as it is today).
- B = `session/93-freeze-combined` at `6183168e6` (the freeze fixes combined).
- "A/A control" = the same build A measured against itself. Whatever differences it shows are pure noise, so a B-vs-A difference only counts if it is clearly bigger than that.

## Did the right builds get tested?

- Both were built on the desktop from exactly those two commits (`git rev-parse HEAD` matches). Their dependencies were installed fresh from the project's lockfile (the desktop's old copy was out of date).
- Build A's app file is byte-identical to the laptop's build (same hash `5042a421117a`).
- Build B's app file hash differs from the laptop's (`63c3e45d159f` vs `0c76a0f51c2a`). Comparing the file lists shows why: the laptop's copy also carries 129 stale, leftover files from older builds. The desktop's list is a clean subset with nothing extra, so the desktop copy is the cleaner build of the same code.
- The lab's "fingerprint" (`3c937cd909bc`) is the same for any clean checkout, so it does not prove a commit by itself; the commit check above does.

## What I had to fix in the lab first (otherwise nothing could be measured)

The artifacts / files-viewer test has apparently never produced numbers on current builds, because the test was written against an older screen:
1. It looked for a button called "Session Files"; the app now says "Session files". Fixed (matches ignoring capitals).
2. It read file names from the file list using an old layout; the list now shows a small thumbnail whose label ("TS") was being read instead of the name. Fixed.
3. Two of the nine small "document" checks (the ones that show an HTML page) crash the test copy of the app on this machine when the lab attaches its browser tool. I could not fix that, so those two were left out (`--document-cases`, which I added to the A/B command). The other seven ran.

These edits are in `scripts/perf-lab/scenario-artifacts.mjs` and `ab.mjs`. The failed first attempts are kept in `artifacts-failed-attempts/`.

## 1. Files viewer / big documents (`artifacts-viewer/`)

Run A, B, then A again (3 repeats each), strict quiet-machine mode.

| What a person feels | A (today) | B (fixes) | Noise (A vs A) | Verdict |
|---|---|---|---|---|
| Opening a large markdown file | 807 ms | 104 ms | about 15 ms | B much faster (-87%), far outside noise |
| Typing in a big code file (slowest 5%) | 33.4 ms | 32.7 ms | about 2 ms | same |
| Switching an HTML preview | 82 ms | 83 ms | about 1 ms | same |
| Longest app-wide freeze while opening files | 0 | 0 in two of three repeats, 30 ms once | - | one 30 ms blip in B repeat 1; too small to matter, noted |
| Seven small document checks (spreadsheet, CSV, Word) | | | | all inside noise. The lab's "regressed" flags on single worst repeats also appear in the A-vs-A table, so they are noise |

Not measured: the two HTML document checks (see above).

## 2. The two possible small regressions (`laneF/`)

The long run of file-size tests ("lane F"), A and B alternated (A,B,B,A,A,B), three rounds, plus a full A/A control of three rounds. Every window clean.

- **Large diff (500 lines) opening**: A 60.6 ms, B 63.1 ms; typing meanwhile 4.7 vs 4.0 ms. No difference. The earlier laptop result (91 vs 128 ms) did not reproduce, so it was most likely laptop noise.
- **Long code blocks, scrolling** (from the big-code-block test, below): scrolling through a finished 2,000-line block is the same (slowest frame 17.6 vs 17.8 ms). Through a finished 20,000-line block the frames are the same too (22.4 vs 23.1 ms), but typing while scrolling got slower in B: slowest key 8.8 ms (A) vs 77.9 ms (B). The A/A control for that same measurement was 9.7 vs 9.0 ms, so this is a real difference, not noise. It is the one confirmed regression I could not explain. Through a finished 700 KB data block B is much better (slowest frame 353 vs 57.5 ms).
- **Noise level**: with the same build on both sides, 15 of 195 measured numbers still got flagged "slower/faster" by chance. With A vs B, 43 of 215 measured were flagged (29 slower, 14 faster). The slower ones are mostly peak memory (B uses roughly 12 to 55 MB more, 2 to 8%) and small CSV/spreadsheet timings of about 5%. Faster: reply with a 20,000-path list 3.4 s to 2.1 s (-38%), 10,000-path list 1.16 s to 1.10 s.
- Everything else: no clear difference.

## 3. New standalone tests

### Huge code block streaming in (`bigfence/`; A vs B, 3 rounds; A/A control 2 rounds)

| Test | What a person feels | A | B | Noise (A/A) |
|---|---|---|---|---|
| 2,000 lines | Typing delay while it streams in (slowest key) | 11.6 ms | 61.3 ms | 12.0 vs 11.7: **B is slower, real** |
| 2,000 lines | Total time the page was frozen in 100+ ms pieces during the stream | about 0 | 13.5 s | - |
| 2,000 lines | Done to fully drawn | 1.6 s | 1.07 s | 1.59 vs 1.61 s |
| 20,000 lines | Typing delay while it streams in | 164 ms | 173 ms | 204 vs 162: same |
| 20,000 lines | Page frozen after the stream ends | **123 s** | 0.4 s | A 123 s in both A/A runs |
| 20,000 lines | Peak memory | 2.26 GB | 1.48 GB | - |
| 700 KB data block | Typing delay while it streams in | 3.6 s | 0.44 s | the A/A control: A's run failed or timed out in 3 of its 4 runs |
| 700 KB data block | Peak memory | 2.9 GB | 1.16 GB | - |

Plain meaning: B is far better for truly huge blocks, but for a moderately large block (about 2,000 lines) typing is about 50 ms slower while it streams in. The desktop shows only part of the earlier laptop claim (140 to 440 ms vs 15 to 26 ms): the 2,000-line case reproduces (61 vs 12 ms); the 20,000-line case does not (both about 170 ms). Every rung on both builds is still labelled "slow" by the lab's own limits.

### Opening a long saved conversation (`longconv/`; 3 rounds plus 2-round A/A control)

No difference at 40, 200 or 1,000 turns: newest message painted in about 665 to 690 ms on both; page-freeze during open about 156 to 170 ms on both (the same in A/A); typing right after open 2.6 ms; no blank frames while scrolling up. Typing during the scroll-up bounces between runs even for A against A (48 vs 95 ms), so nothing can be concluded from it.

## 4. Typing delay while a big block streams: what the CPU profile shows (`profiles/`)

Profiles are in `profiles/cpuprofiles.tar.xz` (A and B for the 2,000 and 20,000 line cases, B only for the 700 KB case; A's 700 KB run did not finish). Timelines are in `profiles/timeline-*.txt`. Reading tools: `scripts/perf-lab/profile-timeline.mjs` and the three small scripts next to this file. Names like `s`, `u`, `jSe` are the app's shrunk code names; I identified some from the bundled library code, not from the original source.

**2,000-line block (the real regression: typing 61 ms vs 12 ms).**
- The page's own program code is not what is slower: in the first 16 s B spends 3.5 s in JavaScript, A 4.2 s.
- The difference is the browser's own drawing work (working out layout and painting), which the profile shows only as one lump called "(program)". In A it stays flat at 0.5 to 0.7 s per 4 s. In B it climbs steadily, from 1.0 s per 4 s at the start to 3.4 s per 4 s (about 85% of the time) by second 40. At about second 44 it suddenly drops to 0.5 s per 4 s.
- Second 44 to 45 is exactly when the block passes 1,500 lines (three quarters of 2,000 lines of a 60 s stream), the limit above which B stops adding syntax colours and draws plain text. So: while B is still drawing the block in colour and it keeps growing, the browser's drawing work per frame grows with the block; once B switches to plain text it falls to nothing. The profile shows this timing exactly. It does not show which kind of drawing work (layout, painting) it is, or why A's drawing stays flat.
- I tried to get that answer with a browser trace (Layout versus Paint) but the desktop went offline before it finished (see below). Not determined.

**20,000-line block (the 140 to 230 ms typing delay; same on A, so not a regression).**
- The 1,500-line crossing is at about 4.3 s. Before it there are 200 to 315 ms drawing blocks that grow. After it, B is quiet for 30 s (no block over 150 ms from 4 s to 36 s). That confirms the plain-text switch removes the cost.
- From about 36 s, blocks of 150 to 290 ms start again, about every 0.2 to 1.2 s, getting longer as the reply grows. The top function in each is `jSe`, the code that re-reads the whole growing reply every frame to decide what to redraw (30 to 62 ms and growing), along with a tree-walking helper. This is the cause of the remaining typing delay. The delay is the same in A.
- I could not confirm a regular "about 2.5 s" rhythm in this profile. Gaps varied (0.2 to 1.2 s, one 2.5 s gap at 45 to 48 s).
- A after the stream: the page is frozen by JavaScript for about 120 s with 160,000 page elements. B does not.

**700 KB data block (whole-block redraw each frame).** B shows steady load for the whole stream: JavaScript about 1.4 to 1.7 s and drawing work about 3.1 to 3.5 s in every 5 s, plus 300 to 600 ms blocks in the first 9 s led by the same tree-walking helper. That fits "the whole block is redone each frame", but I did not identify the busiest functions (`v`, `g`, `y`, `h` near line 255 of the bundle), because the desktop dropped while I was copying the bundle to read them. Not determined.

**Fix:** none attempted. The 2,000-line cause is not yet pinned to a specific piece of code, so a change would be a guess. Suggested next step: rerun `bigfence-stream-run.mjs` for `code-2000` with `PERF_LAB_BIGFENCE_TRACE_AT=10000,30000,50000` (I added it) to name the drawing work, and look at what B does per frame below the limit that A does not.

## What could not be done

- Browser trace for item 4 (desktop went offline at about 19:00 desktop time while it was queued).
- The two HTML document checks (lab attach step crashes the test app).
- A 700 KB profile for A (A's run did not finish).
- Anything about the real graphics card: these runs use software drawing.

## Lab changes made in this work

`scripts/perf-lab/scenario-artifacts.mjs` (current screen names), `scripts/perf-lab/ab.mjs` (`--document-cases` passed to both sides), `scripts/perf-lab/bigfence-stream-run.mjs` (opt-in `PERF_LAB_BIGFENCE_PROFILE_DIR` / `PERF_LAB_BIGFENCE_TRACE_AT`), new `scripts/perf-lab/profile-timeline.mjs`. The unit tests for these were not re-run.
