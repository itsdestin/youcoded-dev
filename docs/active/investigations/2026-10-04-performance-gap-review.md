---
title: Performance review — what we fixed, what we missed, and the plan to zero hitches
status: active
date: 2026-10-04
---

# Performance review, 2026-10-04

Written for Destin. Plain language throughout. Current restart point for the *older* work
stays `2026-09-29-performance-status.md`; this page adds the wider review he asked for.

**How this was produced.** Five independent read-only reviews on 2026-10-04: one of the
commit history, three of the app's code (the screen-drawing side, the background side, and
phone/remote/themes), one of our measuring tools. **Nothing was run.** Every "new suspect"
below was found by reading code and is **not yet measured** — each is a lead, not a
confirmed bug. Six of the top leads were spot-checked against the code afterwards and hold.

---

## 1. The kinds of problems we have hit, and how we fixed them

Scope: 3,619 app changes since May; 105 are labelled as performance work. Almost all of
that happened July–September (73 in September alone), so "months of performance work" is
really about ten weeks.

| Kind of problem | What you felt | How we fixed it | Is there an automatic check now? |
|---|---|---|---|
| **The background half of the app stops to do one slow thing** (reading a big file, waiting on git) | Whole app freezes — once for 6+ minutes | Made the slow thing happen "on the side" so the app keeps answering | Yes, but weak: a list that may only shrink. It still excuses **644** unreviewed spots |
| **One small change redraws everything** | Clicks land late while a reply streams; the whole window redrew ~60×/second | Each part of the screen now listens only for its own changes | Yes — three tests |
| **Work per word grows as the chat gets longer** | Replies lurch at the end; slower after hours | Stop re-copying the whole history for each new word | One test |
| **Drawing things you cannot see** (long lists, old messages) | Resume list 0.8 s → 0.1 s; a huge chat 21 s → 0.6 s | Lists appear 50 at a time; far-away messages become blank spacers | A test per screen — but only for the screens we remembered |
| **Hidden tabs keep working** | Fans, battery; ten background chats caused ~40 redraws/second | Hidden tabs pause | Partly — two of four pauses have a check |
| **Expensive animation and layout** | One pulsing dot used 29% of a processor core on your 180 Hz screen | Animations step instead of gliding; cheaper properties | Yes |
| **Things that only hurt at your real data size** | Slow first Resume, slow relaunch | Remember results between launches | No (hand-run only) |
| **Our own measurements were wrong** | We believed wins that were not real | Stricter comparison rules | Partly |

## 2. Were we consistent? No — five patterns

1. **Most fixes shipped on belief, not on a stopwatch.** Of the 105 performance changes,
   **9** recorded a before → after time. Most relied on a test that counts redraws — useful,
   but a redraw count is not a felt speed. Honest measuring as a gate only began in late
   September, after roughly 70 of the 105 had landed.
2. **We fixed the screen that was complained about, not its siblings.** The "hidden means
   paused" idea reached particles in May, the mascot in August, terminals in late September —
   one report at a time. The "per word" cost was fixed in **five** separate rounds over five
   months. Lists are bounded only where someone remembered to.
3. **Fixes moved the cost instead of removing it.** Blanking old messages made scrolling
   cheap but pushed the cost into tab switching and Find — which then needed four more repair
   rounds (the latest on 2026-10-03).
4. **Several measurements were later found invalid**: a "background stall" number that was
   really the screen; a win measured in a window that was not actually drawing; a probe that
   slowed the thing it measured; "quiet vs busy machine" producing fake 16–20% regressions.
5. **Hand-built replacements for things the system already does were themselves the
   stutter.** The custom scroll-wheel engine (added April and July) was deleted on
   2026-09-29 because it ran 4× ahead of your fingers. No rule guards against this class.

**The root gap behind all five: nothing measures the app while *you* use it.** Every hitch
you feel today leaves no trace. We can only chase it by trying to recreate it in a
laboratory window on a fake screen with no real graphics card. That is why work has been
reactive.

## 3. Still outstanding and known to be biting (already on the backlog)

Full list: `docs/roadmap/perf.md` (40 open items). The ones that matter most:

- **Typing stalls when a long chat loads in a background tab** (measured: 0.10–0.15 s
  freezes). Four experimental fixes exist, all paused unfinished.
- **Switching chats or resizing sometimes pauses far longer than normal** (seen: 0.2 s and
  0.4 s). Cause unknown.
- **First Find in a long chat takes about a second.**
- **"Sluggish over hours"** — never measured over hours. No long-running test exists.
- **Six groups of "stop and wait" work remain in the background half** (session files,
  conversation saves, search indexing, git/sync, catalog reads, project watching).
- **Starring/tagging/renaming a chat rebuilds the whole search index.**
- **Big Markdown file opens in ~0.9 s; big Excel autosave freezes typing ~2 s; every open
  Office document stays loaded in memory.**
- **Phone:** reads a whole long conversation on open; gets events for every desktop
  session; reconnect resends everything; first connect downloads ~2.4 MB before showing
  anything.

## 4. New suspects — things nobody had looked for

Ordered by how likely you are to feel them. "Sure it exists" = confirmed in code.
"Sure it hurts" = needs a measurement.

### On the computer

| # | Suspect | What you would feel | Exists? | Hurts? |
|---|---|---|---|---|
| D1 | **Terminal output has no brake.** Every scrap of output is passed along one at a time through three hand-offs, with nothing to slow a flood | A noisy command (big build log) makes the whole app laggy, every window, and a connected phone | Yes ✔ checked | Likely |
| D2 | **The scroll wheel waits for the app.** A pinch-to-zoom listener forces every scroll to ask the app's permission first, so any busy moment delays scrolling | Scroll hesitates while a reply streams or just after switching chats | Yes ✔ checked | Likely |
| D3 | **Opening a long chat on a non-Claude model replays its entire history, one message at a time.** Claude chats got paging; these did not | Long pause opening, moving or re-docking such a chat. The same pattern once cost 22 s | Yes ✔ checked | Likely |
| D4 | **The whole app is one 2.4 MB bundle.** Settings, Marketplace, games, chess, QR codes all load at launch even if never opened | Slower launch; slow phone first-connect | Yes ✔ checked | Medium |
| D5 | **Launch runs ~8 housekeeping chores before the window even exists**, and the window has no starting background colour | Slower launch; possible blank flash | Yes ✔ checked | Unknown |
| D6 | **The message box re-measures itself twice on every key** | Typing feels slightly behind, worst on glass themes with a long chat | Yes | Medium |
| D7 | **A long code block being written is re-coloured from the top on every frame** | Streaming slows down the longer the block gets (a 600-line file) | Yes | Medium |
| D8 | **Memory kept "for the phone" when no phone is connected**: up to 10,000 tool events and 4 MB of terminal text per session | Memory climbs over hours with many sessions — a candidate for the unexplained 2.8 GB crash | Yes ✔ checked | Unknown |
| D9 | **Every Claude session builds a graphics-accelerated terminal at start, even if you never leave chat view.** The system allows about 16; past that they evict each other | With many sessions: flicker and hitches on switching | Yes | Needs 16+ sessions |
| D10 | **Switching to a terminal re-draws every open terminal's letters**, not just the one shown | Terminal-view switching is heavier than chat-view switching | Yes | Unmeasured on a real graphics card |
| D11 | **Search indexing reads up to 8 MB per conversation in one go, with no pause between** | A freeze after a fresh install or a large sync | Yes | Medium |
| D12 | **Big tool results are passed along whole** (a 5 MB file read) | Occasional short stall at the end of a step | Yes | Low–medium |
| D13 | **Comparing two large files has no time limit** and runs even for collapsed cards | A multi-second freeze on a huge edit (non-Claude models mainly) | Yes | Rare |
| D14 | **Spreadsheet preview draws up to 200,000 cells at once** | Freeze opening a big CSV/Excel in view mode | Yes | Rare |
| D15 | Small ones: images in chat have no reserved space (chat jumps when they load); the "working" spinner ticks 25×/second even for hidden chats; six spots animate "everything" instead of one property; theme files are re-read from disk every time | Minor | Yes | Low |

### Themes and effects (every device)

| # | Suspect | What you would feel | Exists? |
|---|---|---|---|
| T1 | **Particles re-blur every glass bubble 30×/second.** We shielded the header and input bar from this — not the chat bubbles. 6 of 8 registry themes have blurred bubbles | Constant graphics-card load on particle themes, even idle; worst on laptops and phones | Yes |
| T2 | **Wallpapers are enormous.** Two are 8K (7680×4320) — about 132 MB each once unpacked — and every glass surface samples them every frame. No smaller copy is made | Memory pressure, slow first paint, heavier blur | Yes ✔ sizes read from files |
| T3 | **Theme fonts download from Google after the app is already showing** | Text re-flows when the font lands; terminal re-measures; offline = wrong font | Yes |
| T4 | **"Reduce Visual Effects" has holes**: it does not touch wallpaper size, blur written in a theme's own custom styling, or the buddy's breathing loop — and it is never switched on automatically for weak devices | — | Yes |

### Phone app and phone-over-remote

| # | Suspect | What you would feel | Exists? |
|---|---|---|---|
| P1 | **The Android app runs two terminals per session and rebuilds the entire 2,000-line scrollback as text on every screen update, on the same thread that handles your touches.** Plus a once-a-second scan per session, forever | Typing/scrolling hitches while a reply streams; battery drain; worse with each session | Yes |
| P2 | **Phones get full glass by default.** Blur is the single most expensive effect on phone graphics chips; nothing turns it down | Choppy scrolling on mid-range phones | Yes |
| P3 | **The last piece of terminal output can sit unsent until more arrives, and chunks can be silently dropped when the screen falls behind** | Terminal looks frozen then jumps; occasional garbled terminal | Yes |
| P4 | **A slow phone can make the computer hold up to 32 MB for it, uncompressed** | Stale terminal on the phone; memory on the computer | Yes |
| P5 | **The phone is kept awake whenever any session exists**, and four polling loops per session never pause in the background | Battery | Yes |

### Checked and found clean (good news)

Word-by-word streaming into the screen is already batched once per frame; finished parts of
a reply are not re-processed; windows only receive their own sessions' events; no leaked
timers; caches have limits; the phone connection serialises once, not per phone; nothing
turns off graphics acceleration.

## 4b. First measurements (2026-10-04) — suspects ranked by measured cost

Destin's direction: measure first, fix in order of what is actually felt. Tool:
`scripts/perf-lab/suspects.mjs` (new) plus the existing `input-stream.mjs`. Private packaged
build of master `eebcdea`, invisible screen, six sessions open.

**Read these with three cautions.** The machine was busy the whole time (load 4–7: the live
app plus two other sessions' leftover test copies), so treat times as rough and comparisons
between legs of the same run as the solid part. The invisible screen has no graphics card.
One or two runs each — a first reading, not a baseline. Raw files:
`scratch/perf-lab/suspects/` (local only).

| Rank | Suspect | Measured | Verdict |
|---|---|---|---|
| 1 | **D7 — a long code block being written** (500 lines, 150 words/s) | The app's drawing thread was **100% busy** for the whole 33 s; **198–214 frames arrived more than 40 ms late**; 18–55 freezes over 50 ms (worst 92 ms). The same amount of ordinary prose: 50–55% busy, 1–10 late frames. Repeated twice, same result | **Confirmed, worst found.** Continuous stutter whenever a model writes a long file |
| 2 | **D1 — sustained terminal flood** (200 MB) | The whole app stopped answering for **0.9 s and 1.6 s** (seven stalls over 0.1 s; 5 s total in one leg). Scroll delay rose to 180 ms. A short 40 MB burst passed in half a second with only a 73 ms hiccup | **Confirmed for long floods**, fine for short bursts. Open question: output stopped arriving at ~48 MB of 200 — not yet known whether the app or the test tool stopped; needs a producer-side log before fixing |
| 3 | **D2 — scroll waits for the app** | Wait before a scroll can begin: idle 14 ms → reply streaming in a hidden chat 32 ms → reply streaming in the chat being scrolled **47 ms typical, 91 ms worst** → hidden terminal flooding up to 180 ms | **Confirmed.** Every busy moment becomes scroll lag: 3–5 frames typical on a 60 Hz screen, more on 180 Hz |
| 4 | **Ordinary streaming is itself expensive** (new) | Plain prose at 150 words/s keeps the drawing thread 50–55% busy | **New finding.** Explains why everything else feels heavier during a reply; the fix for rank 1 likely helps here too |
| 5 | **D13 — comparing two large files** | Two unrelated files of 2,000 lines: **0.65 s** freeze; 5,000 lines: **4.3 s**; 10,000: **19 s**. Similar files (10% changed): 0.09 s | **Real but rare** — both app engines normally supply a ready-made comparison, so this path is mostly reached by a pending or refused edit |
| — | **D6 — message box re-measuring per key** | Key to visible text: 2–3 ms, with or without a reply streaming. No freezes | **Not felt.** Demoted |
| — | **Typing stalls from background long chats** (the known backlog item) | Zero freezes over 50 ms in this run; September's runs showed 122–145 ms | **Did not reproduce on current master** in one run. Needs repeats before closing |

**Not yet measured (updated after 4c):** terminal switching on a real graphics card (D10) and
memory over hours with a phone-sync turned on (D8 — see 4c: it only exists then, and the test
copy cannot turn that on). Everything else that was listed here is now in 4c. **Cannot be
measured on the invisible screen:** particles, blur, wallpapers (T1–T3) — these need a real
window on the real graphics card. **Cannot be measured here at all:** the phone items — no
phone is attached to this computer.

## 4c. Second measurement round (2026-10-04)

Same tool family (`scripts/perf-lab/suspects.mjs`, new `suspects-b.mjs`, `hops.mjs`), private
packaged build, invisible screen, no graphics card. **Build:** app commit `ac478d5de` for
everything below except the first 40 MB flood (`63ada079b`); neither commit touches terminals,
spreadsheets or chat history. **Load on the machine** was 3–6 for most runs, and spiked to 20–80
while another session worked, which made the standard launch test refuse to run its history
half (see D3). Times are rough; counts and same-run comparisons are the solid part. Raw files:
`scratch/perf-lab/suspects/r2-*` (local only). Each flood number is one run unless said.

### D1 — terminal flood: settled. The app drops output after about 50 million letters

What a person would feel: a command that prints a huge amount very fast (cat of a giant file,
a runaway log) shows part of the output, then stops. The last lines — including the prompt
telling you it finished — never appear. The session itself is fine afterwards.

How we know where it stops (we counted at every hand-off, without touching app code):

| Hand-off | 200 MB flood |
|---|---|
| The test program wrote | all 200 MB, in 1.5–1.8 s, no errors, never blocked |
| The terminal helper process read | all of it |
| The main process passed on to the window | all of it (211.6 M letters in 51,134 messages, counted inside the private app) |
| The window's terminal widget accepted | only **48–54 M letters**, then threw **42,380 "write data discarded" errors** (one run, counted) |

The cause is a built-in safety limit in the terminal widget (xterm): once about 50 million
letters are waiting to be drawn it throws the rest away, and the app has no "slow down" signal
to the producer. 40 MB (42 M letters) fits under the limit and arrives whole; 100 MB lost ~55%;
200 MB lost ~75% (three runs: 51.0, 51.9, 48.5 M accepted). Right after, a short command
worked normally in all runs (arrived in under 130 ms), so the terminal recovers.

**Slower producers.** Even a *paced* flood of 200 MB at 20 MB/s still lost output (27,667
errors) because the window cannot draw 20 MB/s. At 10 MB/s (60 MB total) and 5 MB/s nothing
was lost. What it costs the window's main thread to draw terminal output (this is the
renderer's share of time, software drawing, load ~5): **1 MB/s ≈ 27% busy; 5 MB/s ≈ 80–92%;
10 MB/s and up ≈ 99% (saturated).** A terminal hidden behind chat costs almost the same as a
visible one (26% vs 28% at 1 MB/s; 78% vs 92% at 5 MB/s). So a noisy build you are not even
looking at still takes a quarter of the window's thinking time per MB/s.

**Whole-app stalls.** During the unpaced 200 MB flood the main process stopped answering for
**150–580 ms, four times in the first two seconds** (worst 578 ms; three runs). That is
smaller than the 0.9–1.6 s in 4b, which was measured under heavier load (4–7), so the
honest range is "0.3–1.6 s depending on how busy the machine is". Paced floods produced no
stall over 150 ms.

**Memory.** The helper process behind the terminal grew from 78 MB to ~160 MB after one 200 MB
flood and **did not give it back** (a second flood took it to ~217 MB). The main process rose
25–50 MB while flooding and came back. Nothing crashed, the session did not die.

Verdict: **confirmed, with a sharper cause than guessed.** Confidence high for the loss and its
cause (three runs, error counts). The ~27%-per-MB/s drawing cost is one run per rate.

### D9 — many sessions: fine to 16, then churn (software drawing only — say so)

We turned on software WebGL for this run only (the normal rig has none, so the problem could
never appear). 24 session-switches per stage, chat view and terminal view.

| Open sessions | Terminals with accelerated drawing at the end | Lost-context events | Chat switch (median) | Terminal-view switch (median) |
|---|---|---|---|---|
| 8 | 8 of 8 | 0 | 31 ms | 547 ms |
| 16 | 16 of 16 | 0 | 33 ms | 581 ms |
| 20 | **16 of 20 — 4 left with a lost context** | **12 right after creating the 17th–20th, 64 by the end of the run** | 33 ms (12 long freezes, worst 173 ms, 0.9 s total) | 614 ms (4 freezes, worst 94 ms) |

So the cap is real and exactly at 16. Past it, each new session knocks out an old terminal, the
app rebuilds that one, which knocks out another, and the churn keeps going on every switch
(24 more losses while just clicking between chats; 28 more in terminal view). Four terminals
ended with no working drawing. Not captured: renderer/graphics-process memory (the rig's
process finder returned nothing for the window process; main stayed ~174 MB). A real graphics
card may differ in speed, but Chromium's 16-context limit is the same code. Confidence: one
run; the 8 → 16 → 20 step is clear. Relevant only to people with 17+ Claude sessions open.
Terminal-view switching costing ~0.55 s even at 8 sessions is a software-drawing figure and is
**not** a real-card prediction (D10 stays unmeasured).

### D3 — long non-Claude chat replay: demoted, the path is not used

Code search (whole app, tests excluded) found **no caller** of the "replay the whole history
one message at a time" request: `requestTranscriptReplay` is only a no-op stub on the phone
side and a comment in `transcript-watcher.ts` already says no window sends it. Opening,
resuming and moving a native chat all load one page of history. Measured directly (resume
event to messages on screen, same page of 60 entries each time): **400 turns (2.2 MB file):
0.75 s; 2,000 turns (11.8 MB file): 0.86 s**, with **0** history messages streamed to the
window in both. The longest freeze while resuming was 123–243 ms. So size barely matters. (The
first of three resumes in that boot timed out waiting for a tab — a rig start-up race, not an
app finding; the 400-turn figure is from the third.) The standard `native-resume` phase could not
run: the machine never got quiet in 20 minutes (load 6–88) and the tool refuses numbers then.

### D4, D5 — launch and bundle: real but modest

Standard launch phase, 3 boots (load ~3, commit `ac478d5de`): window created at **906–914 ms**
after process start (Electron's own start-up is ~830 ms of that, before any YouCoded code);
the ~16 chores before the window add up to **~70–85 ms** (largest: hook install 15, remote
server 20, log rotate 6, prelude 12–21); window blank for **445–461 ms**; first drawing
~1.08 s; app code loading finished at ~1.26 s, i.e. **~310 ms spent just evaluating the
bundle**; sessions listed at ~1.29 s; first useful paint ~1.36 s. Memory at idle ~506 MB.
Bundle (built renderer, current `index.html`): main script **3.19 MB (950 KB compressed)** plus
185 KB (29 KB) of styles. Already split off and loaded only on use: spreadsheet 941 KB, Word
494 KB, PDF 430 KB, code editor 121 KB, two games, language packs. Settings, Marketplace,
chess and QR code are still inside the main script (code search; the build keeps no map).
Verdict: the chores (D5) are **not** the problem (~80 ms); bundle size (D4) costs ~310 ms of a
~1.3 s launch — a quarter, worth trimming but not a freeze. Note: `dist/renderer/assets` keeps
five old copies of every file (~16 MB of leftovers) — harmless, only `index.html`'s are loaded.

### D14 — big spreadsheet: confirmed, the biggest single freeze found so far

CSV 2,000 rows × 100 columns (1.6 MB) against a 200 × 10 control (15 KB), one run:

| | Control | Big |
|---|---|---|
| Time to open | 0.28 s | **10.1 s** (one 7.3 s freeze, 10 s of freezing in all) |
| Page elements afterwards | 6,480 | **205,030** |
| One click on a cell | 27 ms | **547 ms** (every click redraws all 200,000 cells) |
| Closing it (opening a small file next) | — | **6.8 s** freeze |

During the 10 s open the window was frozen but the main process stayed responsive (worst
484 ms), so it is the window's drawing, not the app as a whole. Excel files use the same
2,000 × 100 limit and structure (code read); not separately measured. Confidence: one run;
the 20× gap to the control is far outside noise.

### D8 — memory kept for a phone that is not connected: bounded, and off by default

Found while reading: both buffers only fill when **phone access is switched on and Tailscale is
connected** (`remote-server.ts` subscribes to terminal output only inside `start()`, which
refuses to run otherwise). The test copy cannot turn that on, so this is read, not measured on
the app. Terminal text: capped at 4 million letters per session = **about 4–8 MB per session**,
so six sessions ≤ ~50 MB — the 200 MB flood above did not move the main process's resident
size beyond normal swings. Tool events: capped by *count* (10,000), **not by size**, and each
stores the whole tool input and result Claude Code sends (not a summary), so the cost is
(number of events) × (size of results). A rough check of that retention logic outside the app
(8 KB results × 10,000 events ≈ 80 MB per session; my smaller sizes did not produce reliable
readings — treat as an order of magnitude, not a measurement). With 5,000 results of 2–30 KB
that is roughly 10–150 MB per long session, only with phone access on. The code comment saying
"~10 MB max" assumes tiny events and is wrong for real results. Verdict: **a plausible
contributor for phone-sync users with long sessions, not a cause for everyone's 2.8 GB.**

### What the tooling itself turned up (new)

- The standard **artifacts** test is stale: the Session Files button no longer has a `title`
  (it uses a tooltip and `aria-label`) and the viewer lost `data-artifact-viewer`, so
  `scenario-artifacts.mjs` cannot open the drawer on current master. My leg works around it.
- The flood test's helper (`fake-claude.cjs`) now logs bytes written and any error; the
  earlier "stops at 48 MB" was never the producer.
- The xterm discard happens inside the app's own listener, so any *other* listener registered
  after it on the same terminal channel is skipped for those messages (my byte counter counted
  what the terminal accepted, not what arrived; the main-process counter is the arrival count).

## 5. What we cannot see today — and what to build

Ordered by value. This is the "catch it in future" half.

| # | Instrument | What it gives you | Size |
|---|---|---|---|
| M1 | **A hitch recorder inside the real app.** Every time the screen freezes for more than a blink, or a click/keypress takes too long to show, write one line to a local file: how long, which code caused it, which screen, how many sessions, how long the chat. Stays on your computer; attached to bug reports only when you send one | Your real-world stutters become a list we can rank and fix — no laboratory needed, and no poking at your live app | Small–medium |
| M2 | **The same for the background half**: record whenever it stops answering for more than a moment | Direct proof of which of the 644 excused spots actually bite | Small |
| M3 | **Memory, launch time and message-traffic counters** in the same file (per minute) | Proves or kills "worse over hours"; finds floods | Small |
| M4 | **A size limit on the app bundle, checked automatically** | The bundle cannot quietly grow | Small |
| M5 | **New automatic code checks** for the classes found here: scroll listeners that block, timers that never pause, "animate everything", blur on repeated items, caches with no limit | A class fixed once stays fixed everywhere | Small each |
| M6 | **A nightly run on this machine with a trend chart** | A regression is caught the next morning, not weeks later | Medium |
| M7 | **A long-running (hours) test** for memory growth | Covers "worse over time" | Medium |
| M8 | **Real-graphics-card frame counting** | The only honest answer to "did a frame drop" on your 180 Hz screen. Needs a real window on your screen while it runs | Large |
| M9 | **Phone measurements** | Nothing on Android or remote is measured at all today | Large |

## 6. Proposed order of work

Rule for every fix from now on: **number before → change → number after**, on the same quiet
machine, three runs each, and the result recorded. No number, no merge.

- **Stage 0 — instruments (M1–M4).** Build the recorder first. Without it we are still
  guessing. You then use the app normally for a day or two and we read what it caught.
- **Stage 1 — high-confidence desktop fixes**, each with its own before/after:
  D2 scroll wheel, D1 terminal flood brake, D3 paged history for non-Claude chats,
  D6 message box, D7 long code blocks, D8 phone memory only when a phone is connected.
- **Stage 2 — the known three** (typing stalls from background chats, switch/resize pauses,
  first Find) — re-measured with the new recorder, which should finally name the cause.
- **Stage 3 — launch and size** (D4 split the bundle, D5 launch order).
- **Stage 4 — themes** (T1–T4). Involves look-and-feel choices → needs your decisions.
- **Stage 5 — phone** (P1–P5, plus the four phone items already on the backlog).
- **Stage 6 — guards and trend** (M5–M7), then M8/M9.

### Side effects you should expect

- **M1–M3** add a small always-on cost (designed to be far below anything you could feel)
  and a new local file that grows and rotates. It records timings and screen names, never
  message text.
- **D1** (terminal brake): during a flood the terminal will visibly draw in larger steps
  rather than a continuous blur of text. Nothing is lost.
- **D4** (split the bundle): the *first* time you open Settings, Marketplace or a game in a
  session, there may be a very brief pause that does not exist today.
- **D9** (build terminals only when shown): the first switch to terminal view for a session
  would do the work that today happens at session start.
- **T2** (smaller wallpapers): on a very large or zoomed screen an 8K wallpaper would look
  marginally softer.
- **P2** (less glass on phones): themes look flatter on phones.

## 4d. Fixes 2 and 3 — before/after (2026-10-04)

Same private packaged build, invisible screen, no graphics card. Both fixes are on branch
`session/perf-zero-hitch-20261004` of the app repo. Raw files: `scratch/perf-lab/suspects/fix2-*`
(sheets) and `fix3-*` (scrolling), local only. **Load** on the machine is recorded per run; the
"before" sheet runs were at load 14–54 and the "after" ones at 8–10 — the "before" runs were the more loaded, but a 50–100× effect is far larger than
any load noise.

### Fix 2 — big spreadsheets (CSV and XLSX)

**What you felt:** opening a 2,000-row × 100-column sheet froze the whole app for 6–11 seconds
(opening took 10–15 s), every click on a cell hung for half a second, scrolling jumped by whole
seconds, and closing the sheet froze it again for ~6 s. **Now:** it opens in a fifth of a second
(CSV) or two thirds of a second (Excel), clicks and scrolling are immediate, closing is immediate.

**Cause:** both viewers drew every cell (200,000 of them, 205,000 page elements) even though a
screen shows about 450. **Fix:** the page now holds only what is on screen plus a margin of about 20
rows and 4 columns each side; blank space of the exact size stands in for the rest, so the scrollbar,
the sticky column letters and row numbers, merged cells and every position are what they were.
Excel cells are also built only when first drawn.

| 2,000 × 100 sheet | Before (2 runs) | After (2 runs, final code) |
|---|---|---|
| CSV: time to open | 15.4 s, 10.0 s | 0.20 s, 0.17 s |
| CSV: longest freeze while opening | 10.7 s, 6.7 s | 0.10 s, 0.07 s |
| Excel: time to open | 11.1 s, 12.2 s | 0.66 s, 0.65 s |
| Excel: longest freeze while opening | 6.0 s, 6.0 s | 0.29 s, 0.26 s (Excel's own file reader) |
| Page elements | 205,051 | 1,512 |
| One click on a cell | 0.48 s, 0.54 s (CSV); 0.70 s, 0.81 s (Excel) | 0.02–0.03 s |
| Scrolling test (12 jumps, end, back): slowest jump | 2.2 s, 1.7 s (CSV); 2.4 s, 3.2 s (Excel) | 0.11–0.13 s (CSV); 0.11–0.15 s (Excel) |
| Closing it (freeze) | ~6.3 s, 7.2 s (landed in the next open) | none (0.03 s) |

The small 200 × 10 control sheets also got quicker (CSV 0.3–0.6 s → 0.1 s). Three more "after" runs
of slightly earlier versions of the same code agree (CSV open 0.18–0.21 s; Excel 0.57–0.69 s).
The 0.1 s freeze figures include the invisible screen's slow drawing; the Excel 0.26–0.29 s is
mostly the file reader (ExcelJS) and is the one place the 100 ms goal is not met — it is not our
code (a small Excel file already costs ~0.09 s there).

**How sure:** high. Same-run comparisons, effect sizes of 50–100×, five "after" runs agree, and a
picture taken mid-sheet shows sticky letters/numbers and no blank holes.

**Could look or feel different (final list, after the independent review fixes below):**
- Columns are sized up front from the text each cell SHOWS (dates, "1,234.50", "50%", formula results),
  measured with the page's font, wide and capital letters counted heavier. Widths come out within a few
  pixels of the old look (the fixture's columns: 103 px before, ~108 px now). Text longer than 300 px (CSV)
  or 400 px (Excel) still ends in "…" but carries its full text on hover, and Excel's formula bar now wraps
  and shows the whole value. A right-aligned number is never cut. Old Excel columns grew without limit.
- Every row is exactly 24 px (the old table alternated 24/25). A wrapped Excel row starts at an estimate and
  is corrected to its real drawn height the moment it appears, so a wrapped row near the top can nudge the
  scroll position once.
- A selected block is now shown with a green wash (the old view showed the browser's blue text selection),
  and drag-select, shift-click and Ctrl+A work on whole cells; selecting part of the text inside ONE cell
  still works as before. Ctrl+C copies from the sheet's data: shown text, tab between cells, newline between
  rows, no trailing newline (as the old table gave), only the cells that hold data (the blank padding is not
  copied). Differences from the old copy: a cell hidden under a merged cell is an empty field so columns line
  up when pasted (old: one field fewer in that row); text containing a tab or newline is not quoted (same as
  old); with a single cell clicked, Ctrl+C now copies it (old: nothing). Ctrl+A inside the grid selects the
  sheet, not the whole page.
- A very fast flick can show blank paper for an instant before cells fill in.
- Ctrl+F counts every matching cell in the data (true total; tested at 22,220) and Next/Previous reaches each
  one in reading order by scrolling there; the count is per cell (a cell with the text twice counts once).
  Results do not depend on scrolling. A search is answered from text lower-cased during the open.
- A merged cell whose top-left corner is far off screen but whose lower part is drawn shows its pieces as
  plain bordered blank cells (only for a sheet-sized merge, or a comment/search cell far from the window).
- Cells with comments stay drawn wherever you scroll (the comment highlights depend on it).
- Excel files now show "Loading spreadsheet…" about 0.5 s longer on a 2,000 × 100 sheet while the shown text is
  prepared in 20 ms slices (this is what keeps the app from freezing); each other tab is prepared the first
  time it is opened.
- There was no keyboard navigation, edit mode, or scroll restoration in either viewer; none added.

**Independent-review fixes and final numbers (2026-10-04, same day).** Two independent reviews found the first
versions could show a wrong value next to a merged cell, copy ~1% of a selection, give an incomplete Find, cut
formatted text short, lose a merge's text when its corner was scrolled away, and leave Find marks stale while
scrolling. All were fixed with tests seen failing first (`sheet-window-layout`, `sheet-grid-review`,
`sheet-grid-round2`, `sheet-measure`). **Final measurement, app commit `06f094e47`, 2 runs, load 9–18**
(`fix2f-final-1/2`):

| 2000 × 100 | CSV | Excel |
|---|---|---|
| Open | 0.23–0.25 s | 0.73–0.84 s |
| Longest freeze while opening | 0.11–0.15 s | 0.23 s (ExcelJS reading the file) |
| One cell click | 0.03 s | 0.02–0.03 s |
| Slowest scroll jump (12 jumps + end + back) | 0.10–0.12 s | 0.13–0.15 s |
| Same, with a Find query active (marks redrawn) | 0.09–0.10 s | 0.09 s |
| Close | 0.05 s, no freeze | 0.06 s, no freeze |
| Page elements | 1,521 | 1,522 |
| Select all + copy (2,000 lines × 100 fields) | 17–20 ms | 19–23 ms |
| First Find ("item-1", 22,220 matches) | 12–32 ms | 12 ms |

Against the first "after" table nothing regressed; Excel opens 0.15–0.25 s slower than the first version (0.65 s)
because the shown text is now prepared for every cell (that is what makes column widths, Find and copy right); it
no longer freezes. Scrolling with a Find query active costs no more than without. **Real-font check (same boot):**
across 1,280 drawn cells of the Excel sheet, 0 numeric cells and 0 text cells were clipped, and every column was
1.04× the width of its widest drawn text plus padding (no column over- or under-sized).

**Pictures for approval:** `docs/active/design/2026-10-04-sheet-viewer-windowing/` (before = old viewer at
`eebcdea31`, after = current; Midnight and Light), built from rig screenshots because no named screen opens the file
viewer. The old viewer shows the same "Loading spreadsheet…" text, so the Loading state is not a new difference
(only ~0.5 s longer on a very big Excel file).

### Fix 3 — scrolling no longer waits for the app

**What you felt:** while the app was busy (a reply streaming, a terminal flood), every scroll
stalled for as long as the busy moment lasted. **Cause:** the pinch-to-zoom listener was registered
in a mode that makes the browser ask the page before scrolling *anything*. **Fix:** on the desktop
app it is now registered in the mode that lets the browser scroll on its own; zoom still reads every
pinch / Ctrl+wheel and zooms exactly as before. Remote browsers and the phone app keep the old
mode on purpose (there, the browser's own page zoom must be cancelled, and the code cannot do that
without it); they are unchanged.

**How it was measured:** the page's main thread is blocked for 400 ms; a real mouse-wheel click is
sent through the virtual display's input (not the debugging pipe: that held the wheel back in every
case, so it cannot tell the cases apart — kept as `fix3-before-sameconnection-*`); the browser's own
event log says when the scrolling engine moved the box. Instrument proof, after the fix: with an
extra listener of the *old* kind added, the scroll waits until the block ends (401–411 ms, 0 of 8
scrolled during the block); with none, it scrolls 1–3 ms after the wheel click (~216 ms, 8 of 8).

| 8 trials per row, wheel at ~215 ms into a 400 ms block | Scroll applied at | Scrolled during the block |
|---|---|---|
| Before: app as shipped | 401–412 ms (the block's end) | 0 of 8 |
| After: app as fixed | 216–218 ms (2 ms after the wheel) | 8 of 8 |
| After + a listener of the old kind added (proof) | 401–411 ms | 0 of 8 |

Zoom check, both builds: Ctrl+wheel up 100% → 110%, Ctrl+wheel down back to 100%, the box under the
pointer did not move, a plain wheel click scrolled it 120 px. Load: before 9–10, after 26–42 (busy
machine; the result is a yes/no, not a timing).

**How sure:** high for Linux/Electron 41 on this display. **Not verified:** Windows and macOS (no
machine here) — the claim that Electron has nothing to do with Ctrl+wheel besides firing an event
nobody listens to, and that pinch zoom is already off (`setVisualZoomLevelLimits(1, 1)`), comes from
Electron's documentation and one platform's behaviour. If a trackpad pinch there ever zoomed the page
*and* the app, the fix is one line (set the listener back to cancelable). The unchanged live
measure "wheel waits ~14–180 ms in the listener queue" stays what it was; this is a different thing.
A guard now fails the build if any renderer file adds a wheel/touch listener that can make a scroll
wait (touch events included), outside a two-entry allowlist (the zoom hook; the terminal's
touch-drag, which only exists on touch devices).

## 4e. Fix 1 — long code blocks, before/after (2026-10-04)

**What you would feel.** Before: while a model wrote one long file (500 lines), the app's drawing
thread was 100% busy for the whole reply — about 570–640 frames arrived more than 40 ms late and
there were ~380–390 freezes over 50 ms (worst ~110 ms). Scrolling, typing and clicking all waited
behind it. After: on a calm machine, 1–4 late frames and 1–2 freezes in the whole reply, and the
thread sits at roughly 55–65% (ordinary prose of the same length: ~40–45%).

**What was wrong.** Every streamed word re-read, re-coloured and re-built the *entire* code block
from its first line, so each word cost more than the last. Two smaller costs rode along: a new
colouring engine was built for every redraw (also in plain prose), and once that was gone the
page's own layout work still grew with the block.

**What changed.** Finished lines of a still-open code block are now drawn once, in 20-line pieces;
only the newest 20–39 lines are redrawn per word. One colouring engine is shared. Finished pieces
are walled off so laying out a new line cannot disturb them. This applies only while the model is
still writing, only to a block at the top level of the reply, and also to a chat opened or
un-hidden mid-reply (including blocks with no blank line in them).

**Numbers** (full 500-line series, 9,008 words at 150/s, private build on an invisible screen —
main-thread measures, not presented frames; absolute times are rough, the machine was busy):

| | runs | machine load at start | thread busy, last third | late frames | freezes >50 ms |
|---|---|---|---|---|---|
| Before (master `eebcdea`) | 2 | 14, 9 | 100%, 100% | 644, 571 | 393, 383 |
| After (final build) | 2 clean | 10, 33 | 59%, 65% | 1, 4 | 2, 2 |

Three other after-runs are kept but excluded: two started at load 24–37 (one ran on a build
before the no-blank-line fix) and showed the old pattern; they are noise/an older build, but
the honest summary is "clean on a calm machine, can still stutter when the machine is saturated".
Prose control stayed 37–46% in every clean run. Raw files: `scratch/perf-lab/suspects/` (`new-before-*`, `final-*`).
Page layout per 2 s stays flat (~100 ms; it grew 70 → 520 ms without the wall).

**How sure.** The cause is shown by a CPU profile (colouring ~26%, re-reading ~9%, other passes ~10%,
engine rebuild ~5% of the whole stream) and the effect repeats in every run on a calm machine. The
phone was not measured.

**What could look or feel different.**
- While a long block is still being written, a multi-line comment or string that crosses a 20-line
  edge can be coloured as if it started there; it corrects the moment the block closes or the
  reply ends (a stopped or cut-off reply is drawn as one piece).
- Selecting text across the finished part works the same; a long line in the finished part still scrolls sideways.
- The right-click "Copy code block" returns exactly the code (fixed after review).

**Guards added.** Tests pin: per-word work does not grow with block length (counts, not
milliseconds); the code block is never rebuilt at the 40-line mark, at close, or at reply end;
finishing a reply redraws only the block still open; blank lines at piece edges; every fence shape;
chats mounted mid-reply (with and without blank lines); Find across pieces; Copy and right-click
copy; one shared colouring engine; the wall's CSS (it must keep sideways scrolling).

## 4f. Fix 4 — terminal flow control, before/after (2026-10-04)

**What a person felt before.** A command that prints a huge amount very fast (a `cat` of a giant
file, a runaway log) showed the first part, then silently dropped most of the rest — including the
last lines and the prompt that says it finished. For a second or two the whole app also froze
(150–900 ms), and a hidden terminal running such a command kept the window busy as if you were
watching it. Ctrl+C in that terminal did nothing visible for 5 seconds or more (once, not within 90 s),
because the screen was still chewing through everything the program had already printed.

**Cause (confirmed again, this time by the fix).** Nothing ever told the program to slow down. The
terminal helper passed on every read instantly (10–35 thousand messages a second), the window handed
all of it to the terminal widget, and the widget throws input away once ~50 million letters are
waiting. Fix: the program is now held back until the window has actually drawn what it already
printed — the same thing a slow real terminal does. Pieces: the helper process batches reads (the
first bit after a quiet moment goes out at once, the rest merge for up to 4 ms) and stops reading
the program's output once ~1 million letters are un-drawn (the operating system then blocks the
program); the window tells main "drawn N letters" after the widget finishes each write; main passes
that to the helper (only from the window that owns the session — never a phone or a buddy window);
the helper lets the program continue below ~256 thousand. A terminal that is hidden behind a chat is
fed at most ~512 thousand letters a second (after a 1 million burst); everything it was not yet fed is
written the moment you show it.

**Numbers.** Private packaged build on an invisible screen (software drawing). Before = `17a270d8`
(clean checkout), after = `1604bf10` (+ one unrelated sheet-viewer review commit). Machine load 5–7
at every run start (rig runs were serial). "Discarded" = the widget's "write data discarded" errors;
"tail" = the terminal screen shows the final marker and prompt (waited up to 60 s).

| | Before | After |
|---|---|---|
| 200 MB, terminal on screen (2 runs each) | received counter stopped at 48–49 MB; **22,202 / 32,196 discarded; tail never appears**; 7–9 k messages; main hiccups 227–291 ms (total 0.5–0.8 s) | **all 201.8 MB, 0 discarded, exact tail**; 1,001 / 1,060 messages (~72/s); worst main hiccup 37–38 ms, total 0; takes 13.6–15 s instead of "1.7 s then lost" |
| 200 MB, terminal hidden (2 runs) | 55–61 k discarded; worst main hiccup 481–897 ms (total 1.9–2.4 s); scroll delay p95 161–190 ms | 0 discarded; worst hiccup 14–23 ms; scroll delay p95 33–35 ms (idle is ~14 ms); window busy **20–21%** vs 28–31% (but see below) |
| 100 MB visible | 12 k discarded, tail missing | 0 discarded, exact tail, 7–8 s (2 runs) |
| 40 MB visible | whole, 0.58 s, 94% busy, 18 k msgs/s | whole, 3.0–3.4 s, 95–99% busy, ~65 msgs/s. **2 of 4 runs showed a ~250 ms hiccup at the very start** (a 230 ms long task in the window, present in every after-run); 100–200 MB runs did not show it in the ping. Not explained; a 64 K batch cap did not remove it (still 1 long task of ~240 ms) |
| Paced 20 MB/s, 200 MB | 148 k discarded, incomplete | 0 discarded, exact tail, 14.6 s (limited by drawing speed, not the program) |
| Paced 10 MB/s, 60 MB, visible / hidden | complete; busy 99% / 98% | complete; busy 93% / **20%** (hidden takes 118 s instead of 7 s) |
| Paced 5 MB/s, 60 MB, visible / hidden | complete; busy 90% / 83% | complete; busy 74% / **20%** (hidden 117 s) |
| Ctrl+C in a flooding terminal | **5.7 s, never (>90 s), 4.9 s** (3 runs) until "interrupted" is on screen | **0.43 s, 0.46 s** (2 runs); program had printed only 4–5 MB before it stopped |
| Typing: key → character reaches window / in terminal buffer | 2.4–2.5 ms / 14.0–14.1 ms (2 runs) | 2.4–2.5 ms / 13.8–14.1 ms (2 runs) — unchanged |
| Typing in another chat while a hidden terminal floods | key delay median 0.5–2.6 ms | 0.5–1.1 ms |
| Terminal helper memory after a 200 MB flood | +97 / +100 MB, not returned | +68 / +70 MB, not returned (smaller, **not** flat: it is the memory the engine keeps after handling large text, not a growing pile) |

**What could look or feel different.**
- **A flooding command now takes as long as the screen needs to draw it.** 200 MB visible: ~14 s
  instead of ending in 1.7 s (with most of it lost). Short bursts (a few MB) feel identical; 40 MB is ~3 s
  instead of 0.6 s. The window is as busy as before while a flood is on screen (99%) — the gain is that
  it is one steady busy period with no freezes and no loss.
- **A command printing a lot in a terminal you are NOT looking at is slowed hard:** ~0.5 MB/s sustained
  (a 60 MB log takes ~2 minutes; 200 MB would take ~6 minutes), in exchange for ~20% instead of 80–99% of
  the window. Anything ordinary (a Claude reply, a build log under ~0.5 MB/s, a redraw) is unaffected, as the
  first 1 MB passes instantly. Show the terminal and the backlog (up to ~1.3 MB) is drawn at once.
- A phone or remote browser sees the live stream at the speed the desktop window can draw; a slow phone never
  slows the desktop. Phones' own terminals are not slowed when hidden.
- Not changed: Android's own terminal runtime (see risks), keystroke echo, Claude Code redraws.

**Risks and what was checked by reading only.** Windows ConPTY and macOS were not run: the brake uses
node-pty's `pause()`/`resume()` on the output socket (ConPTY reads through a worker thread and a local
pipe; backpressure there is by reading the code, not by running it). A paused terminal helper is let go
when the program exits (Unix node-pty drops unread bytes 200 ms after exit — pinned by a fake-PTY test; the
real-PTY version of that race never reproduced, so it is a regression guard, not proof), on kill/hand-off,
and after 15 s with no acknowledgement at all, so a lost message degrades to a slow trickle, never a frozen
session. If the owner window is reloaded the new terminal's "ready" signal resets the books. Android:
`SessionService.kt` still drops output silently on `tryEmit` overflow and `PtyBridge` may leave a tail
unflushed — not touched, not part of this fix.

**How sure.** The loss and its fix are certain (error counts, exact tail, two runs each at 200 MB, plus 100,
40 and paced). The main-process hiccup improvement at 100–200 MB is large (≥ 6x) in every run; the 40 MB start
hiccup is an open question. Ctrl+C and typing figures are 2–3 runs each.

**Guards added.** `tests/pty-worker-flow.test.ts` (fake PTY: batching, brake, resume, stalled/lost ack, reset,
exit flush, kill; real node-pty: complete byte-exact 11 MB flood, program truly blocked without acks), 
`tests/terminal-feeder.test.ts` (hidden allowance, order, surrogate pairs, dispose, no brake where none exists),
`tests/session-manager.test.ts` (ack relay). The rig gained `--only ctrlc` / `--only echo` legs, a wait-for-the-
terminal-to-show-the-tail check, and a Ctrl+C-aware fake producer. Raw files: `scratch/perf-lab/suspects/fb-*`
(before), `fa-*` (after), `fx-*` (64 K batch experiment), summaries via `scratch/perf-lab/flow-summary.mjs`.

### 4f, review round (2026-10-04, later) — what the independent review found, and what changed

A reviewer found four edge cases in the first version; the work below fixes them (app commits `63301e815`,
`1faff3097` and the follow-up that carries the final budgets/knip fixes). Same rig, same build method; "prior" =
`06f094e47` (the first version), "now" = `1faff3097` or later. Load 5–7 at every run start.

| # | Finding | Real? | Red test | Fix |
|---|---|---|---|---|
| 1 | A session with no desktop terminal that can answer (phone-driven, windows closed/reloading, ownership moved) was braked | **Yes, large.** Prior build, window blanked mid-flood: 13.7 MB written in 165 s, never finished (a 200 MB flood). | `terminal-flow-wiring.test.ts` (8 of 10 red on the old code) | Main now keeps a per-window "consumer" list (terminals that said ready); no consumer, window gone/reloading, ownership moved ⇒ credit released at once, output buffers (newest 4 M chars, was unbounded) until a terminal mounts. **Now: same blanked-window flood finishes in 1.7–2.2 s (3 runs), exact tail on the new terminal 2.1–2.3 s after the page returns.** Memory: main +80 MB, helper +54 MB high-water, flat afterwards. |
| 2 | Hidden/minimised window: timers throttled to ~1 s would starve xterm's parse loop and with it the acks | **Not reproduced here.** Window hidden 12 s+ (page `hidden`), 100 MB: prior build 7.8–9.8 s (normal drawing speed, no collapse). Chromium's 1 Hz throttle may need a real minimise on Windows/macOS; unmeasurable on this rig. Kept as a cheap guard. | `terminal-feeder.test.ts` (4 new) | A hidden/minimised window confirms on receipt (program at full speed), keeps the newest 4 M un-drawn, writes the rest when shown. Now: 100 MB with the window hidden = **1.4–1.6 s** (3 runs), exact tail 0.2–0.5 s after show, 0 discards. |
| 3 | A buddy/subscriber window mounting mid-flood zeroed the owner's in-flight count | Yes (read + test) | wiring test | Books are per window; a second window's ready only registers itself. |
| 4 | Ack rule (`mainWindow` only) disagreed with the routing rule when a session has no owner | Yes (read + test) | wiring test | Acks are believed from any window that mounted a terminal for the session and receives its output. |
| 5 | Can a subscriber's own xterm overrun? | Reasoned + tested: only windows that mounted a terminal count, and the program follows the slowest of them; one that goes quiet >5 s is dropped, so it cannot hold the owner hostage. A subscriber with no terminal has no xterm to overrun. | wiring tests | as above |
| 6 | Hidden session: how late can the prompt reach buffer-only readers? | Buffer-only readers: prompt detector, plan-menu, startup/initialising cover, attention classifier. Permission cards, notifications and turn-complete come from hook/transcript events and do not touch the buffer. The un-drawn backlog is bounded (~1.3 M chars) so buffer readers are at most **~2.6 s** behind what the program wrote. The program itself is slowed by the hidden-terminal allowance (that is the cost, see above). | — | No change (a higher rate would raise the hidden-flood cost; reporting instead). |
| 8 | The ~230 ms long task at the start of every flood | **Found by a CPU profile of the first 1.5 s of a 40 MB flood: 668 of 1,700 ms was the terminal's overlay scroll-bar updater**, run on every scrolled line, writing a style then reading layout each time. | `TerminalView-flow-and-thumb.test.tsx` (red without it) | One update per frame; a hidden terminal does none. **40 MB visible: 3.4 s → 1.75 s; 100 MB 8.3 s → 3.8 s; 200 MB 14.9–15.3 s → 6.4–7.2 s; long tasks 1–2 → 0; worst main hiccup 19–28 ms (was 30–260 ms).** Window busy 89–98% (was 95–99%). |

Other rows re-measured on the final build (visible, 2 runs unless noted): 200 MB complete, 0 discarded, exact tail,
~1,010 messages; hidden 200 MB 77 MB in 150 s at ~18% busy (as before); 10 MB/s visible busy 64% (was 90–93%);
Ctrl+C **0.12 s** (was 0.43–0.46 s, before the brake 4.9 s–never); typing 2.8 ms to window / 13.9 ms to buffer (unchanged).
Raw files: `scratch/perf-lab/suspects/fp-*` (prior commit), `fr-*` (first review build), `ft-*` (final), `ft-prof-40.json.cpuprofile`.
New rig legs: `--only noterm` (blank the window mid-flood, producer time to done, tail after return) and
`--only minimized` (needs `--main-inspect 1`; hides the window from main, waits 12 s, floods); `SUSPECTS_PROFILE=1` writes a renderer profile of a flood's first 1.5 s.

**What a user could feel differently (final list).** A flooding command on screen takes as long as the screen needs
(200 MB ≈ 6–7 s now; 40 MB ≈ 1.8 s) instead of ending early with most of it lost; a command in a terminal you are
not looking at (but the window is visible) is slowed to ~0.5 MB/s in exchange for ~18% of the window; a window that is
hidden, minimised or in the tray, or a session driven only from the phone, runs at full speed with the newest ~4 M
characters kept for when you look; a window reload no longer loses what the session printed meanwhile (up to the newest 4 M);
the scroll bar on the terminal updates once per frame (visually identical).
**Left:** hidden-window throttling not measurable on this rig (Windows/macOS minimise); ConPTY/macOS brake by reading only;
Android findings unchanged; the hidden-terminal rate (512 K/s) is still a judgement call.

## 4g. Fix 5 — ordinary streaming cost, before/after (2026-10-04)

**What you would feel.** Three things, in order of size.
1. **A long code block was still stuttering (found while profiling prose).** Fix 1 (4e) only worked for *some* ways the
   words happened to line up; at the rig's 150 words a second it did not work at all and the app sat at 85-100% busy,
   325-355 freezes over 50 ms and ~540 late frames per reply. A first fix closed one alignment; review found the same
   miss when a fence follows a paragraph line with no blank line. Now closed for every shape tested. Result: 55-64% busy,
   1-2 freezes, 1-3 late frames, in every run.
2. **A fast screen (120/144/180 Hz) no longer redraws the chat ~150 times a second.** The app learns the screen's refresh
   rate from the frames it sees and redraws streamed text every k-th frame so the step is never above one 60 Hz frame:

   | Screen | 50 | 60 | 72 | 75 | 90 | 100 | 120 | 144 | 165 | 180 | 240 | 360 Hz |
   |---|---|---|---|---|---|---|---|---|---|---|---|---|
   | Step between redraws (ms) | 20 | 16.7 | 13.9 | 13.3 | 11.1 | 10 | 16.7 | 13.9 | 12.1 | 16.7 | 16.7 | 16.7 |
   | Redraws per second | 50 | 60 | 72 | 75 | 90 | 100 | 61 | 73 | 83 | 61 | 61 | 61 |

   (From the unit test, 150 words/s; also holds with +-1.5 ms timestamp jitter and across a 60 -> 180 -> 60 rate change.)
   If the app cannot trust its estimate (variable refresh, a stalled frame) it redraws every frame, as before.
   **The owner-tunable setting is `STREAM_REDRAW_TARGET_HZ` (currently 60) in `transcript-batch.ts`:** raise to 120 for
   smoother text on fast screens at proportionally more work, or `Infinity` for one redraw per frame.
3. **Small:** the time under a message used one new formatter per redraw; now one is reused (and rebuilt if the
   computer's time zone changes).

**Verdict on the goal.** The goal was prose <= 25% busy. **Not reached, and the evidence says it cannot be by trimming the
app's own code on this rig:** prose is ~43% busy before and ~39-45% after. About two thirds of the remaining time is the
browser's own drawing (layout, paint, hit-testing, compositing), which this software-drawn virtual screen makes slow and
a real graphics card judges differently. Stopped there rather than force changes that could alter what you see.

**Where the time goes (prose, 60 Hz, CPU profile + browser trace).** Per redraw ~7.4 ms: reading/building the live
paragraph ~1.0, time label ~0.25 (now ~0), the rest of React ~1.1, layout + style ~1.0, everything else the browser
does per frame ~4 (native). Redraws really are one per frame: 59.9/s measured at 150 words/s; layouts 0.40 per word.

**Numbers** (private build on the invisible screen; main-thread measures; "busy" = last third of the stream; 2 runs each;
raw files `scratch/perf-lab/suspects/f5-*`). Before = `703ce3f51` (load 5.4 at both starts); final = app HEAD `e9ba76e38`
(load 5.9 and 6.1 at start; the first lifted-limit run started at load 16.9 and is marked noisy).

| | Before | Final build |
|---|---|---|
| 500-line code block (blank line before), busy | 97%, 97% | 61%, 62% |
| ... freezes over 50 ms / late frames | 325, 355 / 551, 542 | 1, 1 / 1, 1 |
| Fence directly after a paragraph line, no blank line | not measured before the fix | 63%, 64%; 2 freezes, 3 late frames |
| Fence with no language and no blank line | not measured | 36%, 37%; 1 freeze, 1-2 late frames |
| **Code-block pieces on screen mid-stream (loud check)** | 0 in every unprofiled run | **23 at the peak in all 6 fence runs** (the leg now fails if it is 0) |
| Prose, busy | 48%, 47% | 44%, 45% (first third 43, 42 -> 38, 39) |
| Mixed reply, busy | 52%, 51% | 47%, 47% (first third 43, 43 -> 39, 39) |
| Redraws per second, 60 Hz | 59.9 | 59.9 (unchanged by design) |
| Wheel waits, 60 Hz rig, visible stream (median; idle 31 ms) | 49.7, 49.9 ms | 49.9, 49.9 ms |
| Typing while a reply streams, to-screen p95 (2 runs) | 3.5 ms (1 run) | 3.7, 4.0 ms |

**Lifted-limit check (stand-in for a fast screen) — did NOT confirm the new rule.** With the frame limit lifted the rig
renders 460-720 frames a second at wildly uneven spacing, so the new rule (correctly) sees no steady refresh rate and
redraws every frame: 134-137 redraws/s, busy 85-92%, same as before any fix. The earlier fixed 12 ms gap showed 82/s there
only because it ignored the display. The cadence rule is therefore verified by the unit test (13 refresh rates, jitter, rate
change) and not by the rig; a real 180 Hz screen is the open check. Extrapolating the 60 Hz cost per redraw (~7.5 ms), 150
redraws/s would cost >100% of a core and 61/s ~45%: a reading, not a measurement.

**What could look or feel different.**
- 60 Hz and slower screens: nothing intended. Faster screens: text can arrive in steps up to ~17 ms instead of ~5-8 ms,
  never coarser than a 60 Hz screen shows. The first word after a pause appears on the very next frame.
- While a long code block is being written it is drawn in 20-line pieces (as designed in 4e), now actually in effect:
  colouring of a comment or string crossing a piece edge can be off until the block closes.
- Nothing else visible: same final text, no remounts, auto-scroll and Find/copy untouched, hidden chats catch up as before.

**Rejected.** Reusing react-markdown's processor between redraws (needs three transitive packages as direct imports;
~0.25 ms of 7.4); splitting the live paragraph at sentences (changes the page's element structure); flushing every second
frame at 60 Hz (visible chunking); `contain: paint` / `content-visibility` on the streaming message (clips theme glows).

**Guards added.** `markdown-blocks.test.ts` (open fence recorded for 6 preludes x 4 fence shapes x 12 update sizes, split
openers, a second fence, bounded parsing for 300 lines), `transcript-batch-frame-gap.test.ts` (13 refresh rates, jitter, rate
change, slow words, nothing lost or reordered, hand-fired frames unthrottled), `format-bubble-time.test.ts` (one formatter,
same text, follows a time-zone change). Rig: `suspects.mjs --only prose|mixed|fence-noblank|fence-bare` (redraws, layouts,
frames and code-block pieces per window; fence legs fail loudly if no pieces appear), `SUSPECTS_TRACE=1` + `trace-main.mjs`,
`SUSPECTS_APP_ARGS`.

## 5a. Where things stand (morning of 2026-10-04)

All five fixes are on branch `session/perf-zero-hitch-20261004` (app HEAD `e9ba76e38`), nothing merged. `verify.sh` on the
combined tree: all 9 checks passed. Everything below was measured on one private build on an invisible, software-drawn
screen (no graphics card), machine load 5-7 unless noted. "Before" figures are from earlier builds (4d-4g).

| Fix | Before -> after (headline) | How sure | What you might notice |
|---|---|---|---|
| 1. Long code blocks | 97% busy, ~550 late frames -> 61%, 1; pieces confirmed on screen in 6 of 6 runs | Very (counted; 6 runs on the final build) | Colour of a comment crossing a 20-line edge may be off until the block closes |
| 2. Big spreadsheets | opened in 10-15 s, 6-11 s freeze -> 0.27 s (CSV), 1.0 s (Excel); clicks 0.5 s -> 20-30 ms; scroll steps <= 124 ms | Very (1 run on the final build, 50-100x effect) | Only visible rows/columns exist in the page: Find across the sheet and copy behave as designed in 4d |
| 3. Scrolling during busy moments | scroll waited for the whole busy spell -> compositor scrolled in 8 of 8 trials (a deliberately blocking control: 0 of 8) | Very (8 trials, instrument tells the two apart) | Pinch-zoom still works (110 -> 100 round trip) |
| 4. Terminal floods | 200 MB: output dropped after ~50 MB, Ctrl+C 5 s -> all 201.8 MB shown, 0 stalls, 7.3 s, Ctrl+C 0.09 s, echo 7.6 ms | Very (1 run on the final build; earlier builds 2 runs) | A flooding command takes as long as the screen needs; a hidden terminal is fed more slowly |
| 5. Ordinary streaming | prose ~44-48% -> ~39-45% busy; fence rows above; 60 Hz redraws unchanged | Prose gain small (~3 points, 2 runs); fence gain sure | Faster screens redraw text up to every ~17 ms (never coarser than 60 Hz) |

**Still needs your eye or other hardware.**
- A real graphics card: the remaining prose cost (~40% here) is mostly the browser's own drawing; a real card may differ either way.
- A 120/144/180 Hz screen: the redraw cadence is proven by tests, not by this rig; check text still looks smooth. The one
  setting to tune is `STREAM_REDRAW_TARGET_HZ` (60) in `transcript-batch.ts`.
- Windows and macOS: terminal brake and the hidden-window behaviour were reasoned/read there, not run (4f).
- A phone: nothing here was measured on Android; the shared page code changed (fixes 1, 2, 5), the phone paths did not.
- Prose busy time did not reach the 25% goal; see 4g for why it cannot on this rig.

### 4f, round 4 (2026-10-04, after the third re-review) — app commit `d350ba371`

**The blocking defect, and how it hid.** The pre-mount repaint nudge added in round 3 was never delivered: the router called
`sessionManager.bounceSize?.()`, the real `SessionManager` had no such method (my edit to add it matched nothing and was not
checked), the optional call did nothing silently, and the test double supplied the method. Fixed: the method exists, the router's
dependency is required (a missing method now fails type-check), `terminal-flow-wiring.test.ts` pins the real class's surface, and
`session-manager.test.ts` goes through the real class to the worker. **Audit of the series for the same pattern:** every other edit
of mine was re-checked by text (23 anchors, all present); the only other optional calls on dependencies are `window.claude.session.ackOutput?.`
and `requestRepaint?.` (the preload and the shim both define them, pinned by `ipc-channels.test.ts`) and the feeder's
`onRepaintNeeded`/`isAlive` options (the real `TerminalView` supplies both, pinned by a source test). One dead method found and removed
(`resetOutputCredit`: main now keeps per-window books, so nothing called it, yet a test asserted it was "not called").

| # | Finding | Fix (red seen on the old code) |
|---|---|---|
| 2 | Overlapping nudges could leave the PTY one column narrow | The worker owns the nudge: a request during the 120 ms window is ignored; the restore returns to the ORIGINAL size unless a real resize arrived (flagged, not guessed from the size). |
| 3 | The renderer's own two resizes could override a phone's size | The renderer no longer resizes: it asks main (`session:terminal-repaint`, desktop window only; shim no-op, host ignores it, Android has no branch — pinned) and the worker arbitrates. Test: a resize from another device between the halves keeps its size. |
| 4 | Plain shells and line floods would be nudged needlessly | A nudge is requested only when the cut text repainted with relative cursor moves / line erases (`CSI nA`, `CSI nF`, `CSI 2K`) or the alternate screen was on. Plain line-oriented floods never get one (tested at the trim, feeder and router levels). |
| 5 | Scroll-region replay homes the cursor | Replayed only when the alternate screen is on. |

Rig, final build (producer frames shortened to 51 characters: the first version's 81-character lines wrapped in an 80-column
terminal and produced stale copies that were the rig's, not the app's). **Pre-mount cut (page blanked, 200 MB ending in ~7 MB of
Ink-style frames, page returns; `--only notermcut`): final frame exactly once, no stale fragments, no stray escape fragments, bracketed paste ON and
cursor hidden in 3 of 3 runs** (the frame sits at the top: the cut kept only frames, as a terminal that only ever saw them would show).
**Hidden-window cut (`--only cut`), 3 runs: final frame exactly once in 3 of 3, modes right, no stray fragments; stale partial frames
(2 lines, 4 lines) above it in 2 of 3** — fragments from cuts made WHILE the window was still hidden and the animation running at ~3 MB/s,
which the repaint nudge cannot clean (it repaints the frame, not the rows above). Claude Code's own animation is ~20 KB/s, far below the
0.5 MB/s allowance, so this does not queue or cut in normal use.
