---
date: 2026-09-24
status: draft
type: spec
topic: Replace the screenshot/UI-review tooling with two simple tools on one engine — `shoot` (open named screens directly and photograph them, no clicking) and `explore` (a live click-through for AI reviewers) — plus a small set of saved journeys
origin: Destin, 2026-09-24 — "the simplest possible version of the system that works as fast as possible, that has the fewest possible error cases, that requires the least thinking … from the model"; keep click paths for AI reviewers as a separate path
related: docs/active/investigations/2026-09-24-screenshot-infra-speed.md
---

# `shoot` and `explore`: one engine, two jobs

Evidence for every number here is in `docs/active/investigations/2026-09-24-screenshot-infra-speed.md`.

## The two jobs

| | `shoot`: "just show me" | `explore`: "actually use it" |
|---|---|---|
| Who uses it | Destin's review decks, before/after, theme checks | AI UX testers, graders, anyone checking menus, stacking, drag |
| How screens open | By name, directly. **No clicks.** | Step by step, like a person: click, hover, type, drag |
| What is saved | Nothing but the pictures | Nothing, unless a journey is saved on purpose |
| Can it go stale? | No: the screen list is part of the app and checked on every verify run | No: nothing is stored, the model looks at the screen each step |

Both run on one engine that the model never configures.

## The engine (shared, invisible)

1. **It builds a packaged copy of the practice app** from the worktree it is given
   (`VITE_WORKBENCH=1 vite build`, about 1.5 s) and **serves it on a port the computer picks**.
   There are no offsets, no fixed ports and no "wrong worktree" refusal, because it can
   only serve what it just built. Measured: pages load in 0.25 s alone and 1.4 s with 24
   loading at once (13.4 s on today's development server).
2. **It never waits a fixed time.** It waits for the thing it needs (the element exists,
   the network is quiet, animations have finished), capped by a time limit. **Every step
   has a time limit**, so a stuck screen fails alone with a reason and never hangs the run.
3. **One shared queue feeds a few browsers with a few tabs each.** The count comes from the
   computer's core count and backs off when it is busy. It is not a setting. Measured: 3–4×
   faster than today, with about half the computer left free (today: 0% free at worst).
4. **Each tab is a clean, separate profile**, so no screen inherits another's saved state.
5. **Rebuild check:** if the source changed since the last build, it rebuilds first (1.5 s).
   A picture is never taken of stale code.

The engine replaces: the workbench launch inside `run-review.sh`, `cdp-ports.sh`,
`probe-ports.sh`, the sharding and `UI_REVIEW_JOBS` settings, and the fixed boot waits in
`shot.mjs`.

## Tool 1: `shoot`

```
shoot settings/*                                   every Settings screen, light + dark
shoot settings/* marketplace/detail --themes all   any mix of names, all themes
shoot settings/* --before master --after my-branch side-by-side before/after
shoot --tag error-state --width 390                every error state, phone width
shoot --list                                       every screen name with its tags
shoot --all                                        everything (the old "full sweep")
```

- **Default themes: light and dark.** `--themes all` or a named list for more. Contrast
  scanning runs only with `--contrast`.
- **Output:** one folder, `<name>/<theme>.png`, plus a contact sheet. Review decks read
  from it directly (the same crop, measure and highlight data decks use today).
- **Before/after** builds each side from its own worktree/branch. The same screen names mean
  the same screens on both sides.
- **Proof a picture is right**, checked automatically:
  - Every screen names one thing only it has (its title or heading). The picture fails if
    that thing is missing.
  - Two different screen names that produce the same picture are both flagged. Today 26 such
    pairs pass silently.
  - A failed screen is never shown as a picture. The summary lists it with the reason.

### The screen list (why it can't drift)

- **Where it lives:** in the app repo (`desktop/src/renderer/dev/workbench/screens/`), one
  file per area (settings, marketplace, projects, chat, games…). Each entry has:
  - a name (`settings/assistant/cloud`)
  - tags (`settings`, `dialog`, `error-state`, `narrow`…)
  - the practice-app scenario it needs (`default`, `empty`, `stress`, a fail switch…)
  - how it opens
  - the thing only it shows
- **How a screen opens without clicking:**
  - Screens driven by shared app state open by setting that state.
  - About 108 components keep "am I open" inside themselves. Each of those gets a
    one-line, dev-only "open me" hook, registered by the component itself. It moves with
    the component and is stripped from the real app, like the existing workbench code.
  - Opening by label-clicks inside an entry is allowed only as a temporary step while
    hooks are being added, and those entries are marked `temporary` so they stay visible.
- **The drift check:** `shoot --check` opens every screen once, in one theme, and fails on
  any that doesn't open or doesn't show its own thing. It runs inside `scripts/verify.sh`
  when Chrome is installed (estimate 10–20 s), and says "skipped: no browser" otherwise.
  A change that breaks a screen fails in that same change, not weeks later.
- **A source test** pins that every "open me" hook has a screen-list entry and every entry
  points at a real hook. A deleted component can't leave a dead entry behind.

**Expected speed** (estimate, verify in phase 1):
- A small named set: 2–3 s.
- Every screen × light and dark: about 15 s.
- Every screen × every theme: about 30 s.

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
  are open, in order, and which one has focus. That is the thing reviewers need for "menu
  inside a dialog inside a drawer" problems.
- **Real input:** mouse, keys and drag go through the browser's real input events, with
  hover and fine-pointer enabled (today's lesson in `cdp-helpers.mjs` carries over).
- **It can also attach to an isolated dev app** started by `run-dev.sh`, for the few checks
  that need the real app process. It never attaches to Destin's running app. The tool
  refuses any target it did not start or that `run-dev.sh` did not label.

Replaces: plan-writing in `tester-kit.md`, `ui-probe.mjs`, `drag-probe.mjs`,
`drag-fuzz.mjs`.

## Saved journeys (small, optional)

- A journey is a saved `explore` session. Controls are identified by **their spoken label
  and role** ("button: Settings"), never by page position or style classes. A layout change
  doesn't break them; only a renamed or removed control does.
- `explore replay <journey>` re-runs one. When a step fails, it reports the step, the label
  it looked for, and the controls that *were* on screen, so the fix is obvious.
- **Keep about 10**, for core flows: first run, send a message, permission ask, open
  Settings, marketplace install, project open. They run with `shoot --check`.

## What happens to what exists today

| Today | Becomes |
|---|---|
| `shot.mjs` + 80 `plans/*.json` | screen-list entries (still-wanted screens), journeys (real flows), or archived (one-offs: `assistant-settings-r2…r6`, `*-before`, design-variant plans) |
| `run-review.sh` | `shoot --all`, plus the existing contrast, coverage and gallery reports |
| `coverage.mjs`, `contrast-report.mjs`, montage scripts, `make-gallery.py` | kept, fed by `shoot`'s output |
| `dom-size-sweep.mjs` | kept; opens its screens through the screen list (`--scenario stress`) |
| `ui-probe.mjs`, `drag-probe.mjs`, `drag-fuzz.mjs` | `explore` |
| `record.mjs`, `record-pair.sh` | kept for demo clips, moved onto the engine (free port, no fixed waits) |
| `cdp-ports.sh`, `probe-ports.sh`, `UI_REVIEW_JOBS`, offsets 300/340 | removed |
| Review decks (`review-cards.py`, `deck/`) | unchanged, except they read `shoot` output; live panes use the engine's server instead of fixed port 5513 |
| `tester-kit.md`, `ux-tester.md`, `grader.md`, README | rewritten for `explore`/`shoot` |

Old decks keep working: they point at picture files, not plans.

## Order of work

1. **Engine + `shoot` for the Settings area only.**
   - Packaged build, free port, ready-waits, time limits, shared queue.
   - Settings entries and their open hooks.
   - `shoot --check` wired into `verify.sh`.
   - Measure it against today's numbers. Destin sees a before/after deck of Settings
     pictures, taken by the old tool and the new one.
2. **The rest of the screen list**, area by area. Retire each plan as its screens move over.
   Archive the one-offs.
3. **`explore`.** Rewrite `tester-kit.md` and try it with the context-free UX tester on
   one real task.
4. **Journeys**, about 10.
5. **Move decks, `record`, the DOM-size sweep and the reports onto the engine.** Delete the
   port scripts and the retired tools.

Each phase ends with the tools working and nothing half-moved. Phases 2–5 each ship
separately.

## Risks

- **A screen that looks different when opened directly than when clicked to.** Mitigation:
  phase 1's before/after deck compares old click-path pictures with direct-open pictures for
  every Settings screen, and any difference is explained before continuing.
- **Dev-only hooks leaking into the real app.** Mitigation: they sit behind the same flag as
  the rest of the workbench code, and the existing check that workbench code never ships
  covers them.
- **The packaged build behaving differently from the development server.** Measured on the
  `main` plan: it verified more screens, not fewer. Anything that only works in
  development mode gets found in phase 1.
- **Size of the job:** phase 2 touches many components (one line each), so it is spread over
  areas and never done in one sweep.

## Decisions still open (for Destin)

1. Default themes for `shoot`: **light + dark** (proposed), or all themes every time?
2. May the one-off and duplicate plans be archived (still runnable by name)?
3. Should the real installed app be photographed at release time (through an isolated dev
   copy)? That is not proposed here.
