# ui-review — autonomous screenshot review of every YouCoded surface

One command screenshots every screen, dialog, drawer, popover and menu of the app in every
theme, **proves each screenshot actually shows the surface it claims**, and produces
side-by-side theme sheets, a painted-pixel contrast report, a coverage report and an HTML
gallery. It is the evidence-gathering half of the `/ui-review` skill; the judgement half
(what is ugly, what is inconsistent, what to propose) is written by a session reading the
sheets against `docs/active/design/2026-08-25-ui-design-guide.md`.

```
bash scripts/ui-review/run-review.sh <worktree> [outDir] [themes]
```

Default output: `scratch/ui-review-<date>/` (git-ignored) with `gallery.html`,
`coverage.md`, `contrast.md`, `sheets/` and the raw `shots-<plan>/<theme>/*.png`.
Runs the UI Workbench (real renderer, fake backend, headless Chrome) — **never the live
app**. A full 6-theme sweep runs one Chrome per (plan, theme, shard) through a queue of `UI_REVIEW_JOBS` workers (default 24) — about 5 minutes on this machine; `UI_REVIEW_PLANS=main,overlays` limits a run to the plans a PR touches.

## Why it can be trusted (the 2026-08-25 lesson)

The first run of this rig filed 40 screenshots of the plain chat window under labels like
"context menu" because a click missed and nothing noticed; the findings written from them
had to be retracted. `shot.mjs` therefore verifies every shot three ways before it counts:

1. every action's target must exist (a `MISSING` selector fails the shot);
2. the shot's `expect` selector/JS must be truthy afterwards (e.g. `[role=dialog]`);
3. the result must differ from the post-boot baseline (ImageMagick RMSE), unless the plan
   says `sameAsBaseline: true` on purpose.

Failed shots go to `_unverified/` (never into a sheet) and `coverage.md` lists them with
the reason. **A review must quote `coverage.md` and call unverified surfaces "unreviewed"
— silence is not a pass.**

## Pieces

| File | Job |
|---|---|
| `shot.mjs` | raw-CDP driver: boots the page per shot, runs actions, verifies, screenshots, runs the contrast probe. `ATTACH_PORT=<port>` drives a running Electron instance instead of headless Chrome. |
| `plans/*.json` | what to open. `main` (screens + settings + overlays), `overlays` (context menus, prompts, wizard, stalled card, project overlays…), `narrow` (390 px), `tall` (full tool gallery), `latency` (2 s fake IPC → loading states), `electron-welcome` + `electron-live-session` (real app; see below). |
| `montage.sh` | one sheet per surface, themes side by side, verified shots only. |
| `montage-ab.sh` | before/after sheets for a UI PR: `montage-ab.sh <out> <plan/name,…> <themes> before=<runA> after=<runB> [more=<runC>]` — one sheet per surface, a row per theme, a column per run. |
| `contrast-report.mjs` | aggregates the painted-pixel probe (fg vs *actual* bg) — catches hardcoded colours and translucent surfaces the token audit can't. Over-reports on glass themes; read it, don't paste it. |
| `coverage.mjs` | covered / partial / MISSED per surface × theme, with reasons. |
| `make-gallery.py` | the HTML gallery. |

## Writing a shot

```json
{ "name": "close-session-prompt",
  "actions": [ {"click": "[title='All Sessions']", "settle": 600},
               {"click": "js:document.querySelector('[title=\"Close Session\"]')", "settle": 800} ],
  "expect": "[role=dialog]" }
```

Actions: `click` / `rightClick` / `hover` (CSS selector or `js:` expression returning an
element; real mouse events at its centre), `clickText`, `keyDown`/`keyUp`/`key` (+`modifiers`:
2 = Ctrl, 8 = Shift), `type`, `eval`, `dispatch` (window CustomEvent), `scrollDialog`
(`"bottom"`/`"top"`/px), `wait`, `dump` (lists clickable controls into the manifest — use it
to discover selectors for a new surface). Always give an `expect`; if the surface is the
page itself, say `sameAsBaseline: true` and still give an `expect`.

Selector tips learned the hard way: the composer is `[placeholder^='Message']` (the
`input.flex-1` in the DOM is the hidden skills-drawer search); Settings rows match on
`textContent.includes(...)` because icon glyphs prefix the text ("YCDevelopment…"); the
Development sub-screens are `[title^='Report a Bug']` etc.; project overlays open from
`[title='Switch project']` and the Conversations/Context rows; "Musing"-style thinking
chips have a *random* label — match `[data-testid=thinking-indicator]`; the welcome
screen's *New Session* needs a JS `.click()` (the mouse click lands on the mascot layer).

## Workbench switches the plans rely on

`?scenario=default|empty|no-providers|refused|stress` (resume list / permissions /
providers data — the transcript never changes), `?stalled=1` (parks the native session's
turn → red stalled card), `?firstRun=<STEP>` (onboarding wizard; added 2026-08-25),
`?marketplace=empty` (registry-less Marketplace/Library; the default is a sampled registry
fixture, `dev/workbench/fixtures/marketplace/registry.ts`, added 2026-08-25),
`?view=tools|compare` (tool gallery / permission-card comparison), `?latency=<ms>`.
Fidelity gaps the workbench has: no PTY (Terminal is blank — review it on Electron),
Backup & Sync crashes on mock data, theme `localStorage` key is honoured (Electron ignores
it and uses the profile's theme). Marketplace install counts/ratings come from the live
worker even in the workbench. `expect` checks on marketplace text must be case-insensitive
— the eyebrows are uppercased by CSS, so `textContent` still says "Featured".

If the workbench dies with `ENOSPC` (file watchers), start it with `VITE_NO_WATCH=1`
(run-review.sh already does): the live app plus one dev instance can hold ~495k of the
524k inotify watches on this machine.

## Real-app pass (Electron)

For the terminal, marketplace with data, Backup & Sync, a live session:

```
cd worktrees/<wt>/desktop && npx tsc -p tsconfig.json && cp src/main/pty-worker.js dist/main/ \
 && YOUCODED_PORT_OFFSET=60 YOUCODED_PROFILE=uiaudit YOUCODED_DEV_LABEL="UI Review" \
    xvfb-run -a -s "-screen 0 1440x900x24" npx electron . --remote-debugging-port=9299 --no-sandbox
ATTACH_PORT=9299 node scripts/ui-review/shot.mjs scripts/ui-review/plans/electron-welcome.json <out> app
ATTACH_PORT=9299 node scripts/ui-review/shot.mjs scripts/ui-review/plans/electron-live-session.json <out> app
```

(The workbench Vite server on :5233 must already be up for the same worktree — the dev
main process loads the renderer from it.) The isolated `uiaudit` profile keeps this away
from the live app, but it **shares `~/.claude` and the synced settings**, so the
live-session plan turns *Skip Permissions* off before creating its one empty session and
closes it at the end. Unset the `CLAUDE*` env vars first (see run-dev.sh) or Claude Code
refuses to nest.

## Extending

New surface → add a shot with an `expect` → run the one plan → check `coverage.md` shows
it `covered` in every theme → only then write about it. New workbench switch → also add a
route to `scripts/workbench-boot-check.mjs`.
