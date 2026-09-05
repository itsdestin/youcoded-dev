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

## Why it can be trusted (the 2026-08-25 lessons)

**The server is checked before the shots are.** `run-review.sh` starts its own workbench on
a dedicated port (offset 300 → Vite 5473) and refuses to run unless the process on that
port has the worktree under review as its working directory. Later on 2026-08-25 a run
"reused" another session's workbench on the default port and produced 40 minutes of
perfectly *verified* screenshots of the wrong branch — every shot proved it opened, none
was of the code being reviewed. Verification of the picture cannot catch a wrong server;
only checking the server can. Plans still say `127.0.0.1:5233`; `shot.mjs` rewrites that
to `WB_PORT`. The boot check likewise gets a debugging port derived from the Vite port
(two sessions sharing 9977 hung one of them) and a 4-minute watchdog.


The first run of this rig filed 40 screenshots of the plain chat window under labels like
"context menu" because a click missed and nothing noticed; the findings written from them
had to be retracted. `shot.mjs` therefore verifies every shot three ways before it counts:

1. every action's target must exist (a `MISSING` selector fails the shot);
2. the shot's `expect` selector/JS must be truthy afterwards (e.g. `[role=dialog]`);
3. the result must differ from the post-boot baseline (ImageMagick RMSE), unless the plan
   says `sameAsBaseline: true` on purpose.

Before the fixed boot wait, `shot.mjs` polls until the page has painted real text (a plan
may set `ready` to a stricter expression — `marketplace.json` waits for its cards), so a
slow boot under a 24-Chrome sweep does not turn into a miss.

Failed shots go to `_unverified/` (never into a sheet) and `coverage.md` lists them with
the reason. **A review must quote `coverage.md` and call unverified surfaces "unreviewed"
— silence is not a pass.**

## Pieces

**Two sweeps at once:** each run takes its own block of CDP ports (`cdp-ports.sh`: a 400-port block starting at `30000 + offset`, chosen by the run's pid, every port probed by `probe-ports.sh`, the next block tried if one is busy, a loud refusal naming the busy ports after six). Two sessions sweeping at the default offset no longer touch each other's Chromes — the old "keep offsets ≥ 100 apart" advice was wrong anyway once a full six-theme sweep grew to 312 jobs. `YOUCODED_PORT_OFFSET` still matters for the **workbench**: two sweeps of *different* worktrees need different offsets or the second hits the wrong-worktree refusal above. `bash scripts/ui-review/run-review.sh --dry-run <worktree>` prints the workbench port, the job list and the exact CDP ports a run would take, without launching anything.

| File | Job |
|---|---|
| `shot.mjs` | raw-CDP driver: boots the page per shot, runs actions, verifies, screenshots, runs the contrast probe. `ATTACH_PORT=<port>` drives a running Electron instance instead of headless Chrome. |
| `plans/*.json` | what to open. `main` (screens + settings + overlays), `overlays` (context menus, prompts, wizard, stalled card, project overlays…), `narrow` (390 px), `tall` (full tool gallery), `latency` (2 s fake IPC → loading states), `marketplace` (registry data: hero, cards, detail, Library with content), `empty-marketplace` (`?marketplace=empty` — a brand-new install: nothing installed, registry unreachable; the Library/“Nothing matches” empty states), `electron-welcome` + `electron-live-session` (real app; see below). |
| `montage.sh` | one sheet per surface, themes side by side, verified shots only. |
| `montage-ab.sh` | before/after sheets for a UI PR: `montage-ab.sh <out> <plan/name,…> <themes> before=<runA> after=<runB> [more=<runC>]` — one sheet per surface, a row per theme, a column per run. |
| `contrast-report.mjs` | aggregates the painted-pixel probe (fg vs *actual* bg) — catches hardcoded colours and translucent surfaces the token audit can't. Over-reports on glass themes; read it, don't paste it. |
| `coverage.mjs` | covered / partial / MISSED per surface × theme, with reasons. |
| `make-gallery.py` | the HTML gallery. |
| `review-cards.py` + `deck/` + `crops.json` | **the review surface** (v2, 2026-08-27). `build <spec>` cuts 1:1 crops from the run dirs, resolves every highlight box — from the rig's `measure` of a named element, or from the pixel difference between Before and After (the spec never carries coordinates; an optional `labels` map renames the run captions (`{"before": "Round 1", "after": "Round 2"}`)) — and writes the page; it refuses (no page) on a missing picture, an unresolved box, or a broken writing rule. A one-run deck (`runs: {"today": …}`) is a **brief** — its buttons read *build it / leave it* instead of *keep it / revert it*. A **choice step** (`variants: [{id, label, crop, summary, measured?, risk?, highlight?}, …]` instead of `crop/changed/notice`) puts several pictures of ONE question on one page with a pick-one answer (`P-19 pick B`; "None of these" reports `none`) — Destin's rule (2026-08-27): variants of the same thing are one question, never a yes/no each. Its pictures come from the deck's last run. A step may carry its own `themes` list when its picture exists in one theme only (a real-app capture — the terminal, a live session); that step shows just those pills and the deck does not demand the other themes for it (`phase-d-brief.json`, P-20). `serve <spec>` builds, serves on 127.0.0.1 (the root redirects to the deck; folders never list; the exact URL is printed as `[deck] http://…` and kept in `<spec>.serve.json`), opens the browser, saves `<spec>.answers.json` on every click and **exits when Destin submits** — the page then replaces the step with a **finish screen** ("Feedback submitted / The Assistant should receive your responses in just a moment.") that reads every answer back in a table, since the server is gone by then; `‹ Back to the deck` and the header's `Submitted ✓` toggle between the two, and the deck itself stays read-only — run it in the background and its exit is the notification, with the feedback summary on stdout; `wait <spec>` blocks on the answers file alone for a session that no longer holds that process. Spec template: `docs/active/design/2026-08-25-ui-audit/phase-c-review-v2.json`. The feature flow (`docs/active/specs/2026-09-01-feature-flow-design.md`) adds two step shapes and two commands on top of this same deck: `"words": true` steps (no picture, `deck/*.py` `test_words.py`) for the pre-build questions round, and a one-step `rows` contract step, gated by `review-cards.py contract-check` (source provenance, guard existence, signoff) and `review-cards.py acceptance` (every mechanical/deck row graded) — see `.claude/rules/feature-flow.md`. |
| `review-page.py` | the earlier prose-first review page (Phase A/B pages). Rejected as a review surface on 2026-08-26 — do not use for new phases. |

## Writing a shot

A context-free tester (the UX tester of the feature flow) learns this tool from
`tester-kit.md` alone — keep that file, not this section, as the beginner's copy, and keep the
two in agreement. The reviewer briefs beside it: `ux-tester.md`, `code-reviewer.md`,
`grader.md`, `contract-agent.md`.

`"measure": ["#send", {"text": "Send"}]` on a shot records those elements' window rectangles in
the manifest (`measures`), which is how a review deck gets an exact highlight box. A missing
element fails the shot. **Plan the `measure` lines before the Before run** — a measurement can
only come from a capture, and the Before code is usually gone by the time the deck is written
(the Phase C rebuild had to be pixel-diff only for exactly this reason). Prefer `aria-label` /
role / `data-testid` selectors over visible text — one copy change broke three plans' `expect`s
in a day (hand-off gap 5).

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

## Recording a loop (animated demo)

`record.mjs` films the workbench through CDP and writes one WebM loop + a WebP poster —
the landing page's row demos, and any future "show me the feature" clip. One JSON per
scene, same vocabulary as a shot plus typing and waiting:

```
scripts/ui-review/scenes/row2-does-things.json
{ "base": "http://127.0.0.1:5473/?mode=workbench&child=1&scenario=site&latency=150&reply=inbox",
  "theme": "creme", "boot": 3000,
  "actions": [
    {"click": "[placeholder^='Message']", "settle": 200},
    {"typeSlow": "go through this morning's email and handle what you can", "cps": 30},
    {"key": "Enter"},
    {"waitForText": "Yes", "tag": "button"}, {"clickText": "Yes", "tag": "button", "settle": 1500},
    {"hold": 1800}
  ] }
```

| action | does |
|---|---|
| `click` / `clickText` (+`tag`) | move the cursor there (interpolated, visible) and click; `js:` selectors work as in shots |
| `typeSlow` (+`cps`) | per-key typing at N chars/second |
| `key` (+`modifiers`) | one key — `Enter`, `Escape`, … |
| `waitFor` / `waitForText` (+`tag`, `timeout`) | poll until the element is on screen (contains-match for text; default 20 s). **Use this before clicking anything a scripted reply produces** — a fixed `settle` is a race |
| `hold` | keep recording for N ms; `settle` on any action is the pause after it |
| `autopilot` (`ms`, `when`, `key`, `every`, `minGap`) | poll `when` (a JS expression evaluated in the page) every `every` ms for `ms` ms and press `key` when it is true — the recorder "plays" a game by reading the DOM. (Not `autoplay`: that is the workbench's own `?autoplay=<ms>` URL switch, which auto-sends the first message.) |
| `mark` (on any action) | a label for this action in `<out>.marks.json`, which lists every action's start/end in video seconds — a timeline trims to a label, never to a hand-measured frame |
| `evalFile` | like `eval`, but the JavaScript is read from a file next to the scene — for a page-side script too long to live in one JSON string (the Flappy pilot, `scenes/flappy-pilot.js`) |

Scene-level `fps` (default 24) sets the encode frame rate — the promo films at 30 so no
frame is doubled in a 30 fps edit.

```
WB_PORT=5473 CDP_PORT=10330 node scripts/ui-review/record.mjs scripts/ui-review/scenes/<scene>.json <out-base>
# → <out-base>.webm + <out-base>.webp (VP9 crf 33, 24 fps, 1440×900)
```

What the model "says" is a fixture, not a model: `?reply=<name>` picks
`desktop/src/renderer/dev/workbench/fixtures/replies/<name>.jsonl` — assistant text,
tool cards, permission asks (the loop answers them with a real click), one
`turn_complete` per turn; the Nth message sent plays the Nth turn. `?signedIn=1` gives
a signed-in account with a scripted friend for the games. The workbench serves with
`VITE_NO_WATCH=1`, so **restart it after editing a fixture or the mock shim** — the
recorder otherwise films the previous code and every frame still "verifies".

### Clips in a review deck (motion, hover, transitions, visual bugs)

A deck step can show a recording per run instead of a still — the reviewer sees Before and
After playing side by side, with native controls (pause, scrub) and ↻ to restart both together:

```
bash scripts/ui-review/record-pair.sh scripts/ui-review/scenes/<scene>.json <before> <after> <deck-dir>/images/<deck>/clips
# <before>/<after>: a worktree name (its workbench is booted, one at a time) or a URL (a page served at two commits)
```
then in the deck spec: `{ "id": "…", "surface": "…", "path": "…", "clip": "<scene>", "headline": "…",
"changed": "…", "notice": "…", "risk": "…" }` — no `crop`, no `highlight`. `review-cards.py build`
refuses the deck if a run's recording is missing. First real use: the hero-cycler overlap,
`docs/archive/design/2026-08-27-landing-page/clip-deck/`.

### Live panes in a review deck (motion, drag, hover — judged by doing)

A recording is the wrong tool for a 200 ms animation: Destin's verdict on the 2026-08-31
session-strip review was *"the videos are just rough to compare."* A **live** step embeds the
RUNNING app instead — one authored candidate per pane, at its real size, that he can hover,
click and drag himself.

The candidates are the ones `youcoded`'s comparison view already uses
(`desktop/src/renderer/dev/workbench/compare/registry.tsx`), so authoring one is authoring a
compare candidate. **Pick-one is the default** for open-ended animation work; a try-this
yes/no is for verifying something built to an agreed spec.

**Fitting panes to the page — two rules, enforced by `page.js` (`fitPanes`):**

1. **A pane is never wider than the stage, and the row never scrolls sideways.** The deck
   tries every count of panes per row and keeps the one that gives the widest panes; fixed
   panes (a dialog, a popover) sit as many abreast as fit at their real size, then wrap.
2. **A wide, short surface declares a width RANGE and stacks.** `paneWidth: { min, max }` in
   the registry makes a pane fluid: the deck hands it the widest width its row allows (told
   by message, never by reloading) — the session strip is judged full-width, three strips one
   above the other, not three abreast at a third of their size with both ends cut off
   (Destin, 2026-09-01). The workbench's compare tab shows fluid panes at `min`.

```json
{ "live": { "worktree": "session-motion" },            // deck level: one build per review
  "steps": [
    { "id": "expand", "surface": "Session strip", "path": "Header",
      "headline": "Which pill expand feels right?",
      "live": { "surface": "session-strip-expand", "round": 1 },
      "variants": [                                     // 2-4 → pick one
        { "id": "a", "label": "As built",  "candidate": "as-built", "summary": "200ms, gentle overshoot." },
        { "id": "b", "label": "Snappier",  "candidate": "snappy",   "summary": "140ms, stops dead." }
      ] },
    { "id": "drag", "surface": "Session strip", "path": "Header",
      "headline": "Does the drag feel right?",
      "live": { "surface": "session-strip-drag", "round": 2, "candidate": "as-built" },
      "changed": "The pill lifts and follows your cursor.",   // no variants → yes/no
      "notice": "No jump when you let go.", "risk": "Widths freeze while you drag." }
  ] }
```

Then the usual one command — `serve` boots that worktree's workbench on **:5513** and stops
it again on exit:

```bash
python3 scripts/ui-review/review-cards.py serve <spec>       # --no-live: leave my workbench alone
```

Things worth knowing before you author one:

- **`round` is not optional.** Candidate ids are unique only *within* a round and the registry
  keeps every round forever (`close-prompt-body` reuses `labelled` and `one-line` across its
  ten), so an address without a round silently shows the wrong design.
- **A live-only deck names no `images` and no `runs`** — there are no screenshots. Mix live and
  picture steps freely under one Submit; then it needs both.
- **A click inside a pane is an interaction, not an answer.** You pick on the lettered card;
  the row beneath carries only what a card cannot say ("None of these", "Other"). And once
  focus is in a pane the page stops seeing key presses — the deck says so under the row.
- **Each pane carries an "Open in New Window" button** — the same design alone, centred, in a
  fresh tab. Room and quiet, not a wider design: the width is the registry's either way.
- **One theme at a time**, switched with the usual theme row (rendered as labels). The swap is
  sent to the panes as a message, so an animation mid-play survives it. Four candidates × six
  themes would be 24 running copies of the app on one page.
- **File watching stays on**, so a candidate edited while the deck is open updates the pane in
  front of him. Close the deck when you are done rather than leaving the watcher running.
- **It does not replay.** Reopen the review later and the cards and answers are all there, but
  each pane says the app server is not running. A review worth looking back at should carry a
  still or a clip beside its live steps.

Spec: `docs/archive/specs/2026-08-31-live-review-panes-design.md`.

Rebuild every landing-page asset at once (loops, gallery stills, live embed):
`bash scripts/ui-review/site-assets.sh <worktree>` — refuses a workbench serving a
different tree, and refuses to overwrite a gallery when any shot failed verification.

**`"zoom": 1.25`** (scene field, default 1) films the page zoomed in the way Ctrl+= does in the
app: the layout runs at width/zoom × height/zoom CSS px and Chrome paints it at `zoom` device
pixels per CSS px, so the clip keeps its size and everything in it is `zoom` times bigger, in
real pixels. Actions address elements by selector, so nothing else in the scene changes. The
fourteen desktop `promo-*` scenes carry 1.25 (Destin, 2026-09-04: "hit the + a bit so it's easier
for viewers to track what's happening"); the phone scenes stay at 1.

## Hero mascots, the tab icon, and the share image (2026-09-04)

The last three hand-made assets on `youcoded/docs/index.html` are generated now. All three
tools live in `youcoded/docs/tools/` and are run by hand — `index.html` is the live page and
is hand-edited, so these are not a build step.

| Tool | What it makes |
|---|---|
| `gen-hero-mascots.py` | the picker's four `<button class="mascot">` blocks — paste over the two `.mrow` divs |
| `gen-og-image.mjs` | `og-image.png`, photographed from the live page (needs a static server on `docs/`) |
| — | `docs/favicon.svg` is the nav mark; `applyTheme()` re-tints it per theme as a data URL |

**Bump `?v=` on `og:image` and `twitter:image` whenever the image is regenerated.** Slack,
iMessage, Discord, Facebook and X all cache a preview image BY URL for days; replacing the
file alone leaves an already-shared link showing the old picture.

### The art is each theme's own rig
Vendored to `youcoded/docs/mascots/<slug>.rig.svg` from
`wecoded-themes/themes/<slug>/assets/mascot-rig.svg`. Only four themes ship one
(golden-sunbreak, halftone-dimension, kuromi-dreamer, strawberry-kitty); anything else falls
back to the app's `DEFAULT_BUDDY_RIG` and is tinted.

**Do not strip `slot-hat` / `slot-eyewear` as empty scaffolding.** Each theme's SIGNATURE
lives there — Halftone's visor is eyewear, Kuromi's horns and Strawberry Kitty's ears-and-bow
are hats. Stripping them turned Halftone into a featureless blob and left both cats bald.

### Faces and ink come from the promo film
`worktrees/promo` (branch `feat/promo-video`), `scripts/promo/src/`:

- **`themes.ts → inkFor`** — the tinted rig's eyes and mouth are a deep shade of the BODY
  colour, `accent × 0.32`. NEVER the theme's on-accent: that is white on three of the
  picker's four themes, and white eyes on a coloured body are "terrifying" (Destin).
- **`host/faces.ts → WARM`** — every expression keeps the welcome face's big sparkled eyes;
  brows, lids and the mouth carry the expression. Nothing is ever a hollow black disc, which
  is what made the old surprised face scary.
- **`host/Host.tsx → DEFAULT_RIG_SLUGS`** — which rigs take the warm set. Halftone keeps its
  visor faces and the two cats keep their cat faces; those ARE those characters.
- **`host/engine.ts`** — the pose library and its angles: wave −150 with a waggle, cheer
  ±150 with a jump, shrug ±75, tada ±115, think −165, startle ±160.

`happy` is deliberately unused on the site: its eyes are two thin closed arcs and at 45px
they read as "the eyes have gone missing". And never ask a rig for a face it lacks — an
unmatched `data-face` shows no face group at all, i.e. a blank head.

### An arm only reads if it grows
Measured 2026-09-04: at the picker's 45px a raised arm is a ~5px shape floating off a 25px
body, and it reads as a stray dot at **every** hold angle from −60 to −170. Angle was never
the problem. Scale the arm ~1.7–2× while it is up (from the shoulder — `transform-box:
fill-box; transform-origin: 50% 0%`, which IS the rig contract's pivot). Hold arms near
vertical or near horizontal; a rounded rect stopped at 45° is a diamond, not an arm.

Two layers of motion, because one element can run one animation per property: the long idle
rides on a wrapping `.rig-idle` group and never stops, the poses ride on `.rig-root`. A pose
ends when EVERY animation it started has finished — not the first `animationend`, which cuts
off any pose that staggers its limbs.

**`transform-box: view-box` with the rig's `data-pivot` values in px does NOT work** — Chrome
reads those lengths as rendered CSS pixels, so the shoulder lands in the middle of the head
and the waving arm detaches and flies off the body.

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

## Tests

They are `unittest` and `node --test`, not pytest, and they live outside a package — so the
start directory has to be the top level too. `-t .` fails with *"Start directory is not
importable"*, which is why nothing ran them for months:

The five binary-free suites, which is what CI runs:

<!-- runnable -->
```bash
cd scripts/ui-review/tests && python3 -m unittest test_spec test_tokens test_live test_words test_contract
```

Everything (132 tests, ~20s) — needs `magick`, `ffmpeg` and Chrome, all present on this machine:

<!-- runnable: local -->
```bash
python3 -m unittest discover -s scripts/ui-review/tests -t scripts/ui-review/tests -p 'test_*.py'
node --test scripts/ui-review/tests/deck-render.test.mjs
bash scripts/ui-review/tests/probe-ports.test.sh && bash scripts/ui-review/tests/cdp-ports.test.sh
bash scripts/ui-review/tests/close-out-contract.test.sh
```

Both blocks are marked `<!-- runnable -->`, so `scripts/check-doc-commands.mjs` actually runs
them — the first on every CI run, the second only locally. That marker exists because the
command printed here used to be `-t .`, which cannot start at all, and nothing noticed for
months.

| Suite | Needs |
|---|---|
| `test_spec`, `test_tokens`, `test_live`, `test_words`, `test_contract` | nothing — **these five run in `workspace-ci.yml`** |
| `probe-ports.test.sh`, `cdp-ports.test.sh` | `python3` and `ss` (they hold real ports) |
| `test_boxes`, `test_build`, `test_crops`, `test_cli`, `test_serve` | `magick` (they cut real crops) |
| `deck-render.test.mjs`, `coverage.test.mjs`, `shot-measure.test.mjs` | Chrome; the clip fixture also needs `ffmpeg` |

Keep new deck coverage picture-free and put it in `test_live.py` where you can — that is what
decides whether it runs on every push or only when someone remembers.

## Extending

New surface → add a shot with an `expect` → run the one plan → check `coverage.md` shows
it `covered` in every theme → only then write about it. New workbench switch → also add a
route to `scripts/workbench-boot-check.mjs`.

## Drag probe and drag sweep (session-pill motion)

`node scripts/ui-review/drag-probe.mjs <url> <fromIdx> <toIdx> [dragMs]` drives ONE
session-pill drag over CDP and prints every pill's left edge per frame around the drop —
the microscope. Envs make it move like a hand: `PRESS_FIRST=<idx>`, `GRAB=0..1`,
`PROBE_W=460` (the deck pane's width), `WOBBLE=<px>`, `AFTER=hand`, `OVERSHOOT_PX`.

`node scripts/ui-review/drag-fuzz.mjs <url> [count] [seed]` is the sweep: many drags in
a row on one page, mouse AND touch (`POINTER=mouse|touch|mix`), `DPR=1.5`, `UNLIMITED=1`
(frame-rate cap lifted), randomised grab/path/wobble/release/after, five checks per
release (contact, continuity, reversal, others, blink). **A release is not "clean" until
three seeds × mouse and touch come back all-zero** — on 2026-09-03 ten rounds of single
drags each fixed a real fault and each left the next one standing; the sweep found the
one that mattered (the drag visuals hung on a ref pointerup flips before the drop lands)
in its first 60 drags. Frames of any scenario are in `drag-fuzz.json`.
