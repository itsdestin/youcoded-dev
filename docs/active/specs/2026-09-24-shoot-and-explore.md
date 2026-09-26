---
date: 2026-09-24
status: draft
type: spec
topic: Replace the screenshot/UI-review tooling with two simple tools on one engine — `shoot` (open named screens directly and photograph them, no clicking) and `explore` (a live click-through for AI reviewers) — plus a small set of saved journeys
origin: Destin, 2026-09-24 — "the simplest possible version of the system that works as fast as possible, that has the fewest possible error cases, that requires the least thinking … from the model"; keep click paths for AI reviewers as a separate path
revision: 2 — independent review folded in (see "What changed from revision 1")
related: docs/active/investigations/2026-09-24-screenshot-infra-speed.md
---

# `shoot` and `explore`: one engine, two jobs

Evidence for every measured number here is in `docs/active/investigations/2026-09-24-screenshot-infra-speed.md`.
Anything marked *estimate* is measured in phase 1 before anyone relies on it.

## The two jobs

| | `shoot`: "just show me" | `explore`: "actually use it" |
|---|---|---|
| Who uses it | Destin's review decks, before/after, theme checks | AI UX testers, graders, anyone checking menus, stacking, drag |
| How screens open | By name, directly. **No clicks.** | Step by step, like a person: click, hover, type, drag |
| What is saved | Nothing but the pictures | Nothing, unless a journey is saved on purpose |
| Can it go stale? | No: each screen marks itself, and the list is checked when screen code changes | No: nothing is stored, the model looks at the screen each step |

Both run on one engine that the model never configures.

## The engine (shared, invisible)

1. **It builds a photo-only copy of the practice app** from the worktree it is given.
   This is a third build, next to the real app and the landing page's demo, switched on by
   its own flag (`VITE_SHOOT=1`, which also implies `VITE_WORKBENCH=1`). Takes ~1.5 s.
   - **Why a third build:** today some screens only fill in under the development server,
     because they check `isWorkbenchMode()`, which is off in any packaged build. Those are:
     - the terminal's sample screen (`TerminalView.tsx`, `fixtures/terminal-screen.ts`)
     - voice input (`hooks/useVoiceInput.ts`)
     - page connections (`components/pages/page-connections.tsx`)
     
     The photo-only build turns those on, and the "open me" hooks (below). The landing
     page's build does **not**, so strangers on the website can never reach them. The real
     app turns on none of it.
   - **The guard (new, built in phase 1 — none exists today):** a test builds the real app
     and the landing-page demo, then fails if either contains the workbench's fake backend,
     any "open me" hook, or the `VITE_SHOOT` code. Today only code comments promise this. The
     only related check (`ast-grep` rule `workbench-document-checks-vite-workbench`) is about
     the microphone gate.
2. **It serves that copy on a port the computer picks.** There are no offsets, no fixed ports
   and no "wrong worktree" refusal, because it can only serve what it just built. Measured:
   0.25 s per page alone, 1.4 s with 24 loading at once (13.4 s on today's development
   server).
3. **It never waits a fixed time.** It waits for the thing it needs (the screen's own
   marker, a quiet network, finished animations), capped by a time limit. **Every browser
   command has a time limit.** A stuck screen fails alone with a reason and never hangs
   the run. The prototype had three screens hang forever without this; today's tool lost
   16 of 303 jobs the same way.
4. **One shared queue feeds a few browsers with a few tabs each.** The count comes from the
   core count and backs off when the computer is busy. It is not a setting.
5. **Every tab is its own private session.** Each tab gets its own browser context, like a
   separate private window (`Target.createBrowserContext`), so saved settings, including
   the theme, can never leak from one tab to another. The prototype already works this way.
   A pinned test runs two tabs with different themes on one address and checks each
   picture's theme.
6. **Rebuild check:** if the source changed since the last build, it rebuilds first. A
   picture is never taken of stale code.
7. **It cleans up after itself.** Every browser it starts is recorded in a small file with
   its process id. The next run stops any leftover from a crashed run. `explore` sessions
   also shut down on their own after **10 minutes idle**.

Deliberately left out, to keep it simple:
- **Repaint in place** (swap themes without reloading). About 2× faster for theme sweeps,
  but measured to differ from a fresh load on 16 of 263 pictures.
- **A warm engine** (browsers kept open between runs). One more background process to
  manage.

Either can be added later if speed is not enough.

## Tool 1: `shoot`

```
shoot settings/*                                   every Settings screen, meadow-mist + halftone-dimension
shoot settings/* marketplace/detail --themes all   any mix of names, all themes
shoot settings/* --before master --after my-branch side-by-side before/after
shoot --tag error-state --width 390                every error state, phone width
shoot --list                                       every screen name with its tags
shoot --all                                        everything (the old "full sweep")
```

- **Default themes: meadow-mist and halftone-dimension** (Destin, 2026-09-24). They are the
  hardest themes (wallpaper, glass, heavy effects) and 2–4× slower to draw than flat themes,
  so the estimates below assume them. `--themes all` or a named list for
  more. The contrast scan runs only with `--contrast`.
- **Output:** one folder, `<name>/<theme>.png`, plus a contact sheet. Review decks read from
  it directly (the same crop, measure and highlight data decks use today).
- **Before/after** builds each side from its own worktree or branch.
  - A screen missing on one side shows a clear **"not on the before side"** card, never a
    blank or a wrong picture.
  - Until phase 1 is merged, `master` has no screen list at all. Before/after against
    `master` keeps using today's tool (`record-pair.sh`, `montage-ab.sh`) until then.
- **Expected speed** (*estimates*, to be measured in phase 1; they assume a cold start and
  no repaint-in-place):
  - a small named set in the two default themes: 5–15 s
  - every screen in the two default themes: 1–2 minutes
  - every screen in every theme: 2–3 minutes
  
  For comparison, today's tool measured 14.4 minutes for three themes of every plan.

### How a screen proves it is showing

- **Each screen marks itself.** When a screen (or one state of it) is on screen, its root
  element carries `data-screen="<name>"`, for example `settings/assistant/cloud` or
  `marketplace/detail#load-failed`.
  - A **state** (error, empty, loading) sets its own marker on the part that differs, such
    as the error message. That way two states of one screen can't pass as each other.
  - Markers are not words, so changing a button's text never fails a check.
  - Markers exist only in the photo-only build (engine step 1).
- **The picture fails** if its marker is missing, hidden, or covered by another layer.
- **Look-alike flag:** two different screen names that produce the same picture are both
  flagged. Today 26 such pairs pass silently. A pair that is *meant* to look the same is
  listed once, with a reason, in the screen list (`sameAs: "<other name>", why: "..."`).
  Anything not listed is a real warning.
- A failed screen is never shown as a picture. The summary lists it with the reason.

### The screen list (why it can't drift)

- **Where it lives:** in the app repo (`desktop/src/renderer/dev/workbench/screens/`), one
  file per area (settings, marketplace, projects, chat, games…). Each entry has:
  - a name
  - tags (`settings`, `dialog`, `error-state`, `narrow`…)
  - the practice-app scenario it needs (`default`, `empty`, `stress`, a fail switch…)
  - how it opens
  - any expected look-alike
- **How a screen opens without clicking:**
  - Screens driven by shared app state open by setting that state.
  - Screens that keep "am I open" inside the component get a small "open me" hook,
    registered by the component itself. It moves with the component and exists only in the
    photo-only build.
  - How many components need a hook is **counted in phase 1**, not assumed. It is at most
    one per distinct screen, and the investigation found ~200–250 distinct pictures across
    all plans.
  - Opening by label-clicks inside an entry is allowed only while hooks are being added,
    and those entries are marked `temporary` so they stay visible.
- **The drift check:** `shoot --check` opens every screen once, in one theme, and fails on
  any that doesn't open or whose marker is missing.
  - It runs from `scripts/verify.sh` **only when the change touches renderer code**
    (`desktop/src/renderer/**`), and says "skipped: no browser" when Chrome is missing.
  - It compares no pictures, only "did it open and show its marker". So the
    run-to-run image differences (5 of 263, the marketplace theme cards) can't fail it.
  - *Estimate:* 15–30 s. If it runs slower than that, it narrows to the screens whose
    files changed.
- **A source test** pins that every hook has a screen-list entry and every entry points at a
  real hook. A deleted component can't leave a dead entry behind.

## Tool 2: `explore`

A live session the model drives one step at a time. The app stays loaded between steps.

```
explore start [--scenario empty] [--width 390] [--theme meadow-mist] [--worktree X]
explore look                  screenshot + numbered list of what can be clicked
explore click 7 | right-click 3 | hover 2 | type "hello" | key Escape
explore drag 4 to 9           real drag, with hover states on the way
explore back                  undo the last step (reopens and replays the steps)
explore stack                 what is layered right now: "menu › over Settings drawer › over chat"
explore errors                page errors since the last step
explore save <journey-name>   keep this session's steps as a journey (see below)
explore stop
```

- **Every step answers with the same three things:**
  1. a screenshot path
  2. the numbered controls, each with its label, role and position
  3. the stack of open layers
  
  The model never writes selectors or plans. It reads the list and picks a number, like a
  person looking at the screen.
- **Stacking and sub-menus** come from `stack`: which dialogs, drawers, menus and popovers
  are open, in order, and which one has focus.
- **Real input:** mouse, keys and drag go through the browser's real input events, with
  hover and fine-pointer enabled (the lesson in today's `cdp-helpers.mjs` carries over).
- **Clean-up:** one session per worktree. It shuts down after 10 minutes idle, and a new
  `start` stops any leftover (engine step 7).
- **Attaching to an isolated dev app** (the few checks that need the real app process):
  - `run-dev.sh` gets a real marker. It writes a small file in its own profile folder
    naming its debugging port and process id.
  - `explore` attaches only when that file exists and matches a live process.
  - Destin's running app never has that file, so it can never be attached to. Today
    `run-dev.sh` only sets a window title, which is not safe to trust.

Replaces: plan-writing in `tester-kit.md`, `ui-probe.mjs`, `drag-probe.mjs`,
`drag-fuzz.mjs`.

## Saved journeys (small, optional)

- A journey is a saved `explore` session. Controls are identified by **their spoken label
  and role** ("button: Settings"), never by page position or style classes.
- `explore replay <journey>` re-runs one. When a step fails, it reports the step, the label
  it looked for, and the controls that *were* on screen.
- **Keep about 10**, for core flows: first run, send a message, permission ask, open
  Settings, marketplace install, project open.
- **Journeys are not part of `verify.sh`.** Changed wording would fail them for unrelated
  work. They run on request, and before a release.

## Review decks: the two lost-answer fixes (added in revision 2)

1. **Every click shows "saved ✓" or "NOT saved — retrying".** A refused save (the server's
   409) or a dead server counts as NOT saved, never as silently fine.
2. **Each deck keeps one address for its whole life.**
   - The port comes from the deck's name. If that port is busy, the next free one is used
     and remembered next to the answers file.
   - Restarting a deck reopens the same address, so the page's backup copy of the answers
     (already kept in the browser) is found again.
   - On load, the page merges that backup with the answers file, so a crash between click
     and save loses nothing.
3. **Live panes come from the deck's own server.** The deck serves the photo-only practice
   app under its own address (`/app/`) instead of pointing at fixed port 5513. Live panes
   then survive restarts along with the deck.
   - Old decks' pictures keep working.
   - Old decks' **live panes** still point at 5513, so they are rebuilt once when reopened
     (the deck says so rather than showing an empty pane).

## What happens to what exists today

| Today | Becomes |
|---|---|
| `shot.mjs` + 80 `plans/*.json` | screen-list entries (still-wanted screens), journeys (real flows), or archived (one-offs — approved by Destin 2026-09-24; archived plans stay runnable by name) |
| `run-review.sh` | `shoot --all`, plus the existing contrast, coverage and gallery reports |
| `coverage.mjs`, `contrast-report.mjs`, montage scripts, `make-gallery.py` | kept, fed by `shoot`'s output |
| `dom-size-sweep.mjs` | kept; opens its screens through the screen list (`stress` scenario) |
| `ui-probe.mjs`, `drag-probe.mjs`, `drag-fuzz.mjs` | `explore` |
| `record.mjs`, `record-pair.sh` | kept for demo clips, moved onto the engine; `record-pair.sh` stays the before/after tool until `master` has the screen list |
| `cdp-ports.sh`, `probe-ports.sh`, `UI_REVIEW_JOBS`, offsets 300/340 | removed |
| Review decks | read `shoot` output; the lost-answer fixes above; live panes served by the deck itself |
| `tester-kit.md`, `ux-tester.md`, `grader.md`, README | rewritten for `explore`/`shoot` |

## Progress (2026-09-26)

- **Phase 1 done** — engine, `shoot`, photo-only build + guard, Settings; Destin kept all 7
  slides of the old-vs-new review (`docs/active/design/2026-09-24-shoot/`).
- **Phase 2 done** — deck save status, stable address, merge on 409 and on reload; selfie
  review kept (3/3).
- **Phase 3 done** — 162 screens across settings, chat, marketplace, projects, pages, games,
  first run, sign-in, handoff, sync and error states; 33 one-off plans archived. Left for
  `explore` (not screens): pointer/drag moments (magnifier lens, drag hover), a game played out
  (Flappy crash, Connect 4 result), results after a click (sync retry, uninstall failed…), the
  per-row local-model states. Measured: `--check` ~13 s; two default themes ~77 s; six themes
  ~2.5 min.
- Phases 4–6 not started.

## Order of work

1. **Engine + `shoot` for the Settings area only.**
   - The photo-only build and its guard test (no practice code in the real app or the
     landing page).
   - Free port, ready-waits, time limits, private tab sessions and their theme test,
     leftover clean-up.
   - Settings entries, their markers and hooks. Count the hooks the whole app will need.
   - `shoot --check` wired into `verify.sh` (renderer changes only).
   - Measure speed against today's numbers.
   - Destin sees a before/after deck: the old tool's Settings pictures next to the new
     tool's.
2. **Deck lost-answer fixes.** Small and independent, so they can ship alongside phase 1.
3. **The rest of the screen list**, area by area. Retire each plan as its screens move
   over, and archive the one-offs.
4. **`explore`**, plus the `run-dev.sh` marker file. Rewrite `tester-kit.md` and try it with
   the context-free UX tester on one real task.
5. **Journeys**, about 10.
6. **Move decks' live panes, `record` and the DOM-size sweep onto the engine.** Delete the
   port scripts and the retired tools.

Each phase ends with the tools working and nothing half-moved.

## Risks

- **A screen looks different opened directly than clicked to.** Phase 1's deck compares
  old click-path pictures with direct-open pictures for every Settings screen. Any
  difference is explained before continuing.
- **Photo-only code leaking into the real app or the website.** The phase 1 guard test
  builds both and fails on any trace of it.
- **The photo-only build behaving differently from the development server.** The known
  cases (terminal, voice input, page connections) are switched on by the new flag. The
  phase 1 comparison deck catches any others.
- **Size of the job:** phase 3 touches many components, so it is spread over areas and
  never done in one sweep.

## What changed from revision 1

An independent review found these gaps. Each was checked against the code before being
folded in:
- A third, photo-only build instead of the landing-page build. Three screens depend on
  development-only code, and hooks must never reach the website.
- The guard test is new work, not an existing check.
- Private sessions per tab are named and tested.
- Before/after against `master` falls back to today's tool until phase 1 merges.
- `explore` cleans up after itself.
- `shoot --check` runs only on renderer changes, compares no pictures, and journeys stay
  out of `verify.sh`.
- The speed estimates are corrected: revision 1's "30 s for everything" assumed
  repaint-in-place, which this plan does not use.
- Per-state markers replace "the one thing only it has".
- Expected look-alikes are listed with a reason.
- The deck lost-answer fixes are added, and live panes move to the deck's own server.
- Repaint-in-place and the warm engine are left out on purpose.
- The unsourced "108 components" figure is replaced by a real count in phase 1.
- `explore` attaches only to a dev app that wrote a marker file.

## Decisions

1. Default themes: **meadow-mist + halftone-dimension** (Destin, 2026-09-24).
2. One-off and duplicate plans: **clean up and archive** (Destin, 2026-09-24).
3. Photographing the real installed app at release time: **skipped for now** (Destin,
   2026-09-24). `explore` can attach to an isolated dev copy when a specific check needs it.
