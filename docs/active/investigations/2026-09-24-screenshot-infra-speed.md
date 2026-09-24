---
date: 2026-09-24
status: active
type: investigation
topic: How to make YouCoded's screenshot and UI-review tools near-instant and easy to aim at any set of screens — measured causes, a working prototype, ranked proposals and the decisions Destin must make
---

# Screenshot and UI-review tools: why they are slow and how to fix them

Report only. No tool was changed. All measurements used a practice copy of the app (the
workbench) served from this session's worktree. None touched Destin's running app. The
prototype driver used for the "after" numbers is saved next to this file as
`2026-09-24-fastshot-prototype.mjs`. It is evidence, not a tool.

Machine: Z13, 16 cores / 32 threads, 121 GB memory. Screens measured: the `main` plan
(51 screens) unless stated. "6 themes" means midnight, light, halftone-dimension,
meadow-mist, creme, dark.

## The short version

| | Today | Prototype | What changed |
|---|---|---|---|
| 51 screens × 6 themes (306 pictures) | **242 s** | **65 s** | packaged app, waits that end when the screen is ready, one shared queue |
| Same, colors swapped in place | — | **28 s** | open each screen once, repaint it in each theme |
| All 11 Settings screens × 6 themes | ~4 min (only the whole plan can be picked) | **9 s** (swap) / **15 s** (full reloads) | pick screens by name |
| Every plan × 3 themes (~1,330 pictures) | **866 s** (14.4 min, 2026-09-23 sweep) | **365 s** (6.1 min) | the same three changes |
| Pictures that came out right (306) | 252 | 262–264 | waiting for buttons instead of guessing |
| Computer left free during the run | **0% at worst**, 57% on average | 15–55% at worst, 47–80% on average | fewer browsers, less waste |
| Extra memory | 16 GB | 7.5–9.7 GB | — |

With the plan clean-up below, a full sweep should drop to about **1 minute**, and any named
set of screens to **a few seconds**. That estimate is not measured yet.

## What is slow, and why (measured)

### 1. Every picture reloads the unpackaged app, 1,267 files at a time

The workbench runs the app's development server, which hands each file over separately.
One page load fetched **704–1,267 files**. When many browsers load at once, they queue
behind that one server.

| Tabs loading at once | Development server (today) | Packaged copy |
|---|---|---|
| 1 | 1.3 s until text shows | **0.25 s** (22 files) |
| 8 | 5.0 s | **0.5 s** |
| 24 | **13.4 s** | **1.4 s** |

The packaged copy already exists: `VITE_WORKBENCH=1 vite build` is what builds the landing
page's live demo. It built in **1.5 seconds**. This is the biggest single speed-up, and
also the cause of the "load-flaky" misses: at 24 jobs a page can take 13 s just to appear.

### 2. Most of each picture's time is spent in fixed waits

Every screenshot waits a fixed **3.5–4.5 s after the page shows text** (`shot.mjs` "boot"),
plus a fixed pause after every click (400–900 ms). Added up, the 80 plans hold **47 minutes
of fixed waiting per theme**, 6.4 s per picture. The page is actually ready in about **1 s**,
and a menu is open about **0.03–0.3 s** after the click (measured by watching animations
and network calls finish). Another 31 s per theme is hand-written `wait` steps.

### 3. 24 browsers overload the computer

At the default of 24 jobs the current tool starts ~113 browser processes. The processor
sat at **0% free** at its worst moments, and its whole-run average was only 57% free.
Speed barely improves past about 8 browsers, because the development server is the real
bottleneck (see 1).

**About the two "crashes" on 9/23:** the system log shows no crash. Both ended with a normal
power-off chosen from the desktop's shutdown menu (`plasma-shutdown`, at 10:18 and 21:50).
Of the last seven restarts, only one (9/21, 02:08) ended abruptly. Most likely the desktop
became unresponsive under a 100%-busy processor and was powered off by hand. That is
unproven; Destin can confirm what he saw (question 1).

### 4. Broken plans waste time, then look like "misses"

- In the full prototype run, **315 of 1,326 pictures** failed because a button in the
  plan no longer exists. Each failure takes about 6.5 s, so they used **39% of the whole
  run's time**.
- On `master` today, 7 of the 51 `main` screens fail for this reason (the stale Settings
  paths). They were repaired on the `session/ui-consistency-audit` branch, which is not
  merged yet.
- The same few steps are copied into dozens of plans: "click Settings" appears in **58
  shots**, "Open Pages" in 40, "Browse skills" in 38. One renamed button breaks dozens of
  files at once. That is why ~15 Settings plans went stale together.

### 5. Wrong pictures pass as right ones ("stale but verified")

A picture counts as good if an expected element is present. Some expectations are so
general that they are almost always true, for example `[role=dialog], [aria-label='Close
settings'] ~ *`. Nothing notices when two different screens produce the same picture.

Measured on the 2026-09-23 sweep (light theme, 326 good pictures):

- **26 pairs inside the same plan are pixel-identical but have different names.** All six
  `pages-floating` layouts are the same picture. So are the five `openrouter-trust` card
  states, `cloud-context-after/general` and `/stress`, and three `artifact-zoom-lens`
  states. Each should show something different, so each group is almost certainly a
  broken plan.
- Only **249 of 326** good pictures are distinct. Another 77 (24%) are exact copies of a
  picture another plan already took, such as `main/marketplace` and
  `site-gallery/marketplace`. That is wasted time, and it hides which plan really owns a
  screen.
- A looser look-alike check (thumbnails within 0.5%) groups 78 in-plan pairs and leaves
  204 distinct. Some of those are real small differences, such as status-bar variants.
  They need a person to judge, not an automatic fail.

### 6. Why meadow-mist fails more often

On the 9/23 sweep, pictures failed in **20% (light), 21% (midnight) and 34% (meadow-mist)**
of cases. Measured cause: meadow-mist (and halftone-dimension) take **2–4× longer to
draw**. With nothing else running, one Settings shot took 4.3 s in meadow-mist against
1.9 s in light. With all six themes running in parallel, the meadow-mist share took 134 s,
halftone 88 s, and the others 44 s each. Fixed waits expire before these themes finish
drawing. Waiting for the page to be actually ready removes the problem: the prototype
verified the same screens in every theme.

A second kind of flakiness is real content differences between runs. Two identical
prototype runs differed on **5 of 263** pictures, all in the marketplace/library theme
cards, whose images load in a different order each time.

### 7. Hangs with no time limit

Neither tool puts a time limit on each browser command. In the 9/23 sweep, **16 of 303
jobs left no results file at all**. In the prototype, 3 screens (`error-batch1`
update-download-failed, tag-picker-load-failed) hung forever. The fix: a time limit on
every step, and a stuck screen fails only itself.

### 8. Ports

- Five tools pick fixed ports: offset 60 (5233), 300 (5473) and 340 (5513), plus fixed
  CDP ports 9978, 10000+, 10320, 10330 and 10390.
- `run-review` refuses a server from another worktree, which is correct, but it never
  looks for a free port.
- A packaged copy can be served on **any free port the computer hands out**, served
  straight from the worktree's own build folder. Both problems disappear: no collisions,
  and no chance of photographing the wrong worktree.

## Review decks: what is true (checked in code)

- **Answers are saved on every click, not only on Submit** (`deck/page.js:313-339`, written
  to disk by `deck/serve.py:177`). The 9/23 loss has three real holes:
  1. When the server refuses a save (409, "would erase a saved answer"), the page does not
     notice and still looks saved.
  2. The backup copy in the browser is never read back while the deck is served.
  3. Every `serve` picks a new random port, which counts as a new website, so the backup
     copy from before a crash can't be reached.
- **`preview` does not need a workbench** (`deck/preview.py:71-81`). Live panes just render
  empty, which is why the preview looked like it needed one.
- **Pane width:** the deck guesses 360 px, or `live.paneWidth` (`deck/live.py:22,59-64`).
  The real width is in the app's `compare/registry.tsx` (11 entries), which the deck never
  reads. That is why a step's `paneWidth` can only warn (`deck/spec.py:930-937`).
- **Words-only decks take the app's current theme** because `build`/`preview`/`serve` always
  apply the live theme first (`review-cards.py:173-175`, `deck/spec.py:229-260`).
- **Color in combined images:** no script converts to gray. One untested risk: the older
  `montage` command in `montage.sh:20` / `montage-ab.sh:25` can inherit the color mode of
  the first image in a row. When that is a blank placeholder, the row may come out gray.
  Needs a one-picture test.
- **The `?proposal=` style switch exists only on the unmerged `session/ui-consistency-audit`
  branch** (23 CSS files). No shot plan uses it yet.
- **The deck-tool changes committed as WIP without the required selfie review:** commit
  `b174bab4` on `session/ui-consistency-audit` (`page.js`, `page.css`, `build.py`,
  `render.mjs`). Still unreviewed.

## Blind spots (not photographed at all)

- **The real built app:** the `electron-*` plans need a separately launched dev app. The
  review tool skips them, and none has ever produced a picture.
- **Buddy windows:** now reachable through a dev route on the audit branch.
- **Special states:** the guided tour, drag-and-hover moments, and failed downloads.
  `error-batch1` covers some failures, but its download shot is one of the ones that hangs.

## Proposals, ranked by value for effort

**1. Serve a packaged copy on a free port.** Build the workbench (1.5 s), serve that folder
on a port the computer picks, point every tool at it.
- Pros: page loads 5–10× faster under load. No port collisions. Can't photograph another
  worktree's code. Most load-flakiness goes away.
- Cons: after each code edit it must rebuild (1.5 s) before re-shooting. Any feature that
  only works in the development build would need checking; the `main` plan verified *more*
  screens this way, not fewer.
- Risk to what Destin sees: none. His app is not involved.

**2. Wait for "ready", never for a fixed time.** Wait until the button exists, the network is
quiet and animations have finished. Keep fixed waits only in the slow-connection plans,
whose point is the wait.
- Pros: the biggest cut in wasted time. Fixes meadow-mist flakiness.
- Cons: a screen that is "done" while something keeps changing (a clock, a spinner) needs
  an upper time limit. The prototype uses the old wait as that limit.

**3. One shared queue, a few browsers with several tabs each, and a load limit.** The
default would be about 8 browsers × 2 tabs, easing off when the computer is busy.
- Pros: 3–4× faster than today on the same screens. Leaves roughly half the computer free,
  so the desktop stays responsive and the "crash" pattern should stop.
- Cons: none found. The right number differs on a smaller computer, so it should adapt
  rather than be fixed.

**4. A screen catalog: name every screen once, then shoot any set by name.** Example:
`shoot "settings/*" --themes all`, or `shoot marketplace/detail light`.
- Steps like "open Settings" or "open Assistant settings → Cloud providers page" are
  defined **once**. When the app moves a button, one line is fixed, not 58 files.
- Each screen can carry tags (settings, dialog, menu, narrow, error-state) so "all error
  states" or "everything with a dialog" is one command.
- Pros: this is the "easy to aim" half of Destin's ask, and it removes the main cause of
  stale plans.
- Cons: the biggest job on this list. The 80 plan files must be merged into the catalog,
  and old plans stay readable until they are. Past decks keep working, because they point
  at picture files, not plans.

**5. Catch wrong pictures automatically.**
- (a) Flag two differently-named screens whose pictures are identical.
- (b) Require each screen to name something only that screen has, such as its heading,
  and reject vague checks like "a dialog exists".
- (c) Fail fast (3 s) when a button is missing, instead of waiting out the whole
  schedule.
- Pros: the 26 silent look-alike pairs above would be flagged on the next run. Coverage
  numbers become trustworthy.
- Cons: the first run will flag many existing plans, which must be fixed or archived
  once.

**6. Quick theme mode: open once, repaint in each theme.**
- Pros: 6 themes cost about 1.5× one theme instead of 6×. Measured at 28 s against 65 s.
- Cons, measured: 162 of 263 pictures came out pixel-identical to full reloads, 85
  differed slightly (a spinner's position, text smoothing), and 16 differed visibly.
  - A chat that had scrolled lands in a different place.
  - The theme editor shows its own theme, so swapping colors under it is meaningless.
  - Marketplace theme cards differ between runs anyway.
- So: good for "how does this look in every theme", not for exact before/after
  comparisons. Those keep full reloads.

**7. Archive one-off and duplicate plans from the default sweep.** Candidates:
`assistant-settings-r2`…`r6`, the `*-before` plans, and design-variant plans such as
`games-board-*` and `games-chess-*`. These are exactly the plans behind many identical
pictures. They stay on disk and can still be run by name.
- Pros: fewer pictures per sweep, less clutter in coverage.
- Cons: a past deck that re-shoots one of them must name it explicitly.

**8. Keep the capture engine warm.** A background helper keeps the browsers and packaged
copy running, so a named set re-shoots in about **2–5 s** instead of paying start-up each
time.
- Pros: this is what makes "near-instant" true for small sets.
- Cons: one more background process to stop at the end of a session.

**9. Time limits on every step.** A stuck screen fails alone, with a reason.
- Pros: no more silent missing jobs (16 of 303 on 9/23).
- Cons: none.

**10. Deck fixes.**
- (a) Show "saved ✓" or "NOT saved" after every click, and treat a refused save as an
  error.
- (b) Give each deck a stable port and read the browser backup on load, so a crash
  loses nothing.
- (c) A neutral, fixed look for words-only decks.
- (d) The deck reads pane widths from the app's registry, so `paneWidth` works for real.
- (e) Test and, if needed, fix gray rows in combined images.
- (f) Selfie-review the WIP deck commit `b174bab4`.
- Pros: directly addresses lost answers and the deck friction.
- Cons: (b) changes the deck's link from run to run less, which is the point. Old links
  still work as long as that deck is being served.

**11. Close the blind spots.**
- Capture the built app through an isolated dev launch (never Destin's app).
- Add workbench switches for the guided tour and failed downloads.
- Drive drag-and-hover through the browser's own drag events.
- Pros: screens nobody has ever seen get reviewed.
- Cons: the built-app capture is slow and fiddly. It is worth doing for a release check,
  not every sweep.

**Suggested order:** 1 + 2 + 3 + 9 together (one change to the capture engine, biggest win,
small risk), then 5, then 4 + 7 (catalog and clean-up), then 6 and 8, then 10 and 11. Deck
fixes 10a/10b are small and could go first if lost answers hurt more than speed.

## Decisions for Destin

1. **The two shutdowns on 9/23:** did the screen freeze, so you turned it off from the
   menu? Or did something else happen? The log shows a menu power-off both times, not a
   crash.
2. **Quick theme mode:** should theme sweeps use repaint-in-place by default? Pros: about
   2× faster again. Cons: a few pictures (scrolled chats, the theme editor) differ from a
   fresh load. Exact before/after decks would still use fresh loads either way.
3. **Order of work:** speed first (proposals 1–3, 9), or lost-answer protection in decks
   first (10a/10b)?
4. **Archiving old plans:** may the one-off and duplicate plans (`assistant-settings-r2…r6`,
   `*-before`, design-variant plans) leave the default sweep? They stay runnable by name.
5. **The screen catalog (proposal 4):** is it worth the one-time effort of merging 80 plans?
   It is the part that makes "shoot any set of screens" easy and stops plans from going
   stale when buttons move.
6. **Built-app pictures:** worth adding as a release-time check, or leave the real app
   unphotographed?

## Evidence kept

- Prototype driver: `2026-09-24-fastshot-prototype.mjs` (this folder).
- Raw run folders and logs were in this session's scratch space and are not committed.
  Numbers above are copied from them: `sweep-j24.log`, `fast8.log`, `c*t*.log`,
  `cyc.log`, `fullfast.log`, `fidelity.txt`, `noise.txt`.
- 9/23 sweep used for staleness and flake rates:
  `worktrees/sessions/ui-consistency-audit/scratch/element-sweep/` (git-ignored).
