# shoot — pictures of any screen, by name

```
node scripts/shoot/shoot.mjs 'settings/*'                every Settings screen, default themes (quote globs)
node scripts/shoot/shoot.mjs 'chat/menu/*' --themes all   any names, every theme
node scripts/shoot/shoot.mjs --tag error-state            by tag
node scripts/shoot/shoot.mjs 'settings/*' --before <base> --after .   side by side
node scripts/shoot/shoot.mjs --list                       every screen name and its tags
node scripts/shoot/shoot.mjs --all                        everything
node scripts/shoot/shoot.mjs --check                      open every screen once (light); exit 1 on a miss
```

**Which code:** `--worktree`, `--before` and `--after` take a worktree name (`ui-review-infra`),
a branch that has a worktree, or a folder — a checkout, or a workspace worktree (`.` from its
root). `master` means the shared checkout exactly as it sits on disk (it may be behind, or not
build); for a clean base, make a worktree of it first (`workspace-start`). Each side is built
on its own; `--before` also needs the base to have the screen list (merged 2026-09).

Options: `--worktree <name|branch|path>` (default: the checkout next to this script) ·
`--themes a,b | all` (default meadow-mist,halftone-dimension — Destin, 2026-09-24) ·
`--width N [--height N]` · `--contrast` · `--out <dir>` (default `scratch/shoot/<time>`).

Output: `<out>/<screen name>/<theme>.png`, `manifest.json` (per picture: ok, reason, the
screen's panel box, page errors), and a contact sheet per theme.

## How it works

- **Nothing clicks.** Each screen registers how to open it in the component that owns it
  (`useScreenOpen`) and marks its own panel (`<Dialog screen=…>` / `<ScreenMark>`), in a
  photo-only build the app and the website never contain (`desktop/src/renderer/shoot-mode.tsx`,
  guarded by `desktop/tests/shoot-build-guard.test.ts`). The list of names is the app's own:
  `desktop/src/renderer/dev/workbench/screens/*.ts`, one file per area.
- **A picture counts only when its screen is showing** — the mark is on screen and not covered.
  Two different screens that come out identical are flagged (`LOOK-ALIKE`) unless the list says
  `sameAs` with a reason; the check caught three stale states while the list was built.
- **A `#state` name** (`settings/sync#oversize`) is the same screen under other practice data:
  the entry's `scenario`, `params` (mock-shim switches) or `session` (a practice session to
  select first).
- **The engine** (`engine.mjs`) builds the photo-only copy (cached until source changes), serves
  it on a free port, and runs a few headless Chromes with private tabs sized from the core
  count. It waits for the screen to be still — no fetch in flight, animations done, images
  loaded — never a fixed time; every browser call has a time limit; a crashed run's browsers are
  cleaned up by the next.

## Adding a screen

1. In the component that owns the open state: `useScreenOpen('area/name', () => setOpen(true))`.
2. On its panel: `<Dialog screen="area/name" …>`, or `<ScreenMark name="area/name" />` inside a
   custom panel. Mark only once the content has loaded (a spinner must never pass).
3. Add the entry to the area file in `screens/`. `tests/shoot-screens.test.ts` fails until the
   list and the registrations agree, and on any `<Dialog>` with neither `screen=` nor
   `noScreen="<why it cannot open directly>"` — so a new dialog cannot be missed; `shoot --check` (run by `scripts/verify.sh` on renderer
   changes) fails until it opens.

Moments that need a pointer, a drag, typing or a game played out (the magnifier lens, a Flappy
crash, a result after a click) are not screens — they belong to `explore`, below.

Measured 2026-09-26: 162 screens (186 after every dialog was named); `--check` ~13 s; every screen in the two default themes
~77 s; all six themes (972 pictures) ~2.5 min. The old click-plan sweep took 14.4 min for three.

# explore — click through the app one step at a time

```
node scripts/shoot/explore.mjs start [--scenario empty] [--screen settings] [--width 390] [--dev]
node scripts/shoot/explore.mjs click 7 | right-click 7 | hover 7 | type 7 "hi" | key Escape
node scripts/shoot/explore.mjs drag 4 to 9 | scroll down | back | stack | errors | stop
node scripts/shoot/explore.mjs save <name>  ·  explore replay <name>
```

Every step answers with a picture (and a copy with a number on every control), the numbered
controls — the top layer's first — and the open layers, top first. The model picks a number;
it never writes a selector or a plan. `explore --help` has every command; the AI reviewers'
guide is `scripts/ui-review/tester-kit.md`.

- **What the page is asked** lives in `explore-page.mjs`: what counts as a control (roles,
  real controls, pointer-cursor elements), what counts as a layer (layer roles, the overlay
  system's `data-layer`, anything fixed to the window at z-index 30+), and the check that a
  click lands on its control. Before any click the page must stop moving (two equal readings),
  and the point is re-checked: a late row once pushed the message box under a quick chip.
- **A background helper** holds the app between steps (one per workspace worktree; `start`
  replaces it; it stops after 10 minutes idle). `back` starts a fresh private tab and replays
  the other steps by label and role — the same way a saved journey (`journeys/`) replays.
- **`--dev`** attaches to a window `bash scripts/run-dev.sh` started, and only through the
  marker it writes (`desktop/.dev-instances/<offset>.json`, naming its own live pid). The
  installed app never runs run-dev.sh, so it can never be attached to. `back` and `save` are
  refused there (a real app cannot be reset).

# journeys — the core paths, replayed on every renderer change

```
node scripts/shoot/journeys.mjs                 all of them (~8 s; scripts/verify.sh runs it)
node scripts/shoot/journeys.mjs switch-model    one
```

A journey is a saved `explore` session: clicks and keys found by role and label, then
`expect` checks on the result (`explore expect "Got it."`, `--not`, `--screen <name>`,
`--control N`). They live in the app repo, `desktop/tests/journeys/*.json`, so a change that
renames a button fixes the journey in the same commit. A failure names the step, what it looked
for, what WAS on screen, and a picture.

**Why these seven** (2026-09-26): the paths that would make the app useless if broken, each
ending in a check a user would make — first conversation (create, send, the reply lands under
the message), a permission ask approved twice, theme change, model switch (status bar AND All
Sessions), resume a past conversation, marketplace install, open a project. `shoot` opens
screens directly, so only these notice when the path TO a screen breaks.

**Why in `verify.sh`, not on request:** a check nobody runs goes stale. Adding one: record it
with `explore` (start where a user starts, not with `--screen`), end with `expect`, `save`,
then run `journeys.mjs <name>` three times.

`shoot --check` also presses Escape once on every screen with something open and fails unless
exactly the top layer closed.

Spec: `docs/active/specs/2026-09-24-shoot-and-explore.md`. Tests: `node --test scripts/shoot/tests/*.test.mjs`.
