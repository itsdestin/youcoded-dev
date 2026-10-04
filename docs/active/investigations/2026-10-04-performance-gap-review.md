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
