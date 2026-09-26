# ui-review — review decks, demo clips, the landing page's pictures

**Screenshots and click-throughs moved to `scripts/shoot/` (2026-09-26):** `shoot` photographs
named screens (proving each is showing), `explore` clicks through the app one step at a time,
`journeys.mjs` replays the core paths. Start at `scripts/shoot/README.md`. The old sweep
(`run-review.sh` + 80 click plans) is retired; its plans are in `plans/archive/`.

What stays here is everything built ON those pictures and on the running renderer:

## Start here

| Want to… | Read |
|---|---|
| Pictures of screens, a theme sweep, before/after | `scripts/shoot/README.md` (`shoot`) |
| Act like a user: menus, hover, drag, results | `scripts/shoot/README.md` (`explore`), `tester-kit.md` |
| Serve a review or questions deck | `review-cards.py` below; `.claude/rules/review-deck.md` |
| Record a demo loop | "Recording a loop" |
| Edit landing-site copy | "Editing copy on the site" |
| Regenerate mascots/hero art | "Hero mascots, the tab icon, and the share image" |
| Add/use a workbench `?switch=` | "Workbench switches" |
| Check a change in the real app | `explore start --dev` ("Real-app pass") |
| Measure a drag frame by frame | "Drag probe and drag sweep" |

## Pieces

| File | Job |
|---|---|
| `review-cards.py` + `deck/` + `crops.json` | **the review surface** — the one page Destin answers on, in nine step kinds (approve, brief, choice, decide, clip, live, question, contract, acceptance) and eight commands (`build`, `preview`, `serve`, `wait`, `record`, `selfie`, `contract-check`, `acceptance`). `serve` builds, serves on 127.0.0.1, saves `<spec>.answers.json` on every click and **exits when Destin submits** — run it in the background; it opens no browser, so put its printed `[deck] http://…` line in chat as the last line of your turn. Live panes come from the deck's own server (`/app/`, the photo-only build). **Which kind to pick: `.claude/rules/review-deck.md`. Every field, command and refusal: `deck/AUTHORING.md`. One worked template per kind: `templates/`.** |
| `record.mjs` + `scenes/*.json` | a scripted scene filmed as a WebM loop + WebP poster (below). |
| `record-pair.sh` + `montage-ab.sh` | before/after clips and sheets for a deck's CLIP steps. |
| `site-assets.sh` | regenerates the landing page's loops, gallery (`shot.mjs` + `plans/site-gallery.json`, the one plan still in use) and embed. |
| `shot.mjs` | the old self-verifying plan driver, kept for `site-gallery.json`; on the engine (free ports). New pictures: `shoot`. |
| `contrast-report.mjs` | painted-pixel contrast (fg vs *actual* bg) from a `shoot --contrast` run (`contrast.md`), or an old sweep's manifests. Over-reports on glass themes; read it, don't paste it. |
| `coverage.mjs` | covered / MISSED per surface for an old sweep's run folders (decks still read them). |
| `dom-size-sweep.mjs` | every screen of the shoot list, opened by name in the `stress` scenario, under 8,000 elements (below). |
| `drag-probe.mjs`, `drag-fuzz.mjs` | per-frame positions during a session-pill drag (below). |
| `design-check/` | lint:design warnings boxed on the real screen (`shoot --collect`). |
| `tester-kit.md`, `ux-tester.md`, `code-reviewer.md`, `grader.md`, `contract-agent.md` | the feature flow's reviewer briefs. |

**The DOM-size sweep** (`dom-size-sweep.mjs`) opens every default-scenario screen of the shoot
list in the `stress` scenario (2,000 rows) and counts the elements each builds. Any screen over
`NODE_BUDGET` (8,000), or not proven open, prints `FAIL` and exits 1. A red row means a list is
drawing every item instead of the ones near the screen: fix that list; do not raise the budget.
Before the render-cost fixes (2026-09-18) Conversations was 17,546, Marketplace 58,706 and model
search 24,679; on 2026-09-26 the largest of 176 screens was 3,577. Needs a browser, so it runs
on request, not in `verify.sh`:
`node scripts/ui-review/dom-size-sweep.mjs [--only settings/*,projects/conversations]`.

## Recording a loop (animated demo)

`record.mjs` films the practice app (the photo-only build, served on a free port) and writes one WebM loop + a WebP poster —
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
| `typeSlow` (+`cps`) | per-key typing at N chars/second, kept to the CLOCK: each letter has a due time, so a busy page (a theme's moving background) no longer drags a loop to a third of its setting (2026-09-11). The landing page's ten loops all type at 32 |
| `key` (+`modifiers`) | one key — `Enter`, `Escape`, … |
| `waitFor` / `waitForText` (+`tag`, `timeout`) | poll until the element is on screen (contains-match for text; default 20 s). **Use this before clicking anything a scripted reply produces** — a fixed `settle` is a race |
| `hold` | keep recording for N ms; `settle` on any action is the pause after it |
| `autopilot` (`ms`, `when`, `key`, `every`, `minGap`) | poll `when` (a JS expression evaluated in the page) every `every` ms for `ms` ms and press `key` when it is true — the recorder "plays" a game by reading the DOM. (Not `autoplay`: that is the workbench's own `?autoplay=<ms>` URL switch, which auto-sends the first message.) |
| `mark` (on any action) | a label for this action in `<out>.marks.json`, which lists every action's start/end in video seconds — a timeline trims to a label, never to a hand-measured frame |
| `evalFile` | like `eval`, but the JavaScript is read from a file next to the scene — for a page-side script too long to live in one JSON string (the Flappy pilot, `scenes/flappy-pilot.js`) |

Scene-level `fps` (default 24) sets the encode frame rate — the promo films at 30 so no
frame is doubled in a 30 fps edit.

```
node scripts/ui-review/record.mjs scripts/ui-review/scenes/<scene>.json <out-base>   # WORKTREE=<name> for another checkout
# → <out-base>.webm + <out-base>.webp (VP9 crf 33, 24 fps, 1440×900)
# A scene's `127.0.0.1:5473` origin means "the practice app": it is replaced by the served build.
```

What the model "says" is a fixture, not a model: `?reply=<name>` picks
`desktop/src/renderer/dev/workbench/fixtures/replies/<name>.jsonl` — assistant text,
tool cards, permission asks (the loop answers them with a real click), one
`turn_complete` per turn; the Nth message sent plays the Nth turn. `?signedIn=1` gives
a signed-in account with a scripted friend for the games. The build is rebuilt whenever the
source changed since the last one, so an edited fixture or mock shim is always what gets filmed.

**The landing loops' standard (Destin, 2026-09-11 — keep it when re-recording).** About 15 s,
never more than 20, with nothing real cut. Desktop takes `"zoom": 1.15` (the phone take stays at
1, or it reflows). Replies at `&replySpeed=2` (the inbox loop 2.5, its reply is three times
longer), and every wait is for the reply itself (`waitForText` its last words), never a fixed
settle. The same rhythm everywhere: a 0.3 s opening hold, typing at 32 a second, short settles
after clicks, a 1.5 s closing hold. A theme loop swaps through `window.__workbenchAppearanceSync(
{theme})` the moment the reply finishes — no marketplace trip. Demo jokes are goofy, never
actually offensive. Quote a loop's length from the file (`ffprobe`), which is what the player
shows.

### The theme a deck opens on

`build` and `serve` open the deck on the theme **Destin's app is on right now** — the app
writes its slug to `~/.claude/youcoded-appearance.json` on every theme change, and the deck
moves that theme to the front of the spec's `themes` (adding it when the deck has no pictures,
or when its crops already exist for that theme). Every theme pill still works; only the first
paint changes. A picture deck with nothing shot in that theme keeps its own order and says so:
`live theme golden-sunbreak is not captured in these runs — opening on midnight`. Override with
`--theme <slug>`; pin a deck to its own order — a deck whose point IS a theme — with
`"theme": "fixed"` at the top of the spec.

### Clips in a review deck (motion, hover, transitions, visual bugs)

A deck step can show a recording per run instead of a still — the reviewer sees Before and
After playing side by side, with native controls (pause, scrub) and ↻ to restart both together:

```
bash scripts/ui-review/record-pair.sh scripts/ui-review/scenes/<scene>.json <before> <after> <deck-dir>/images/<deck>/clips
# <before>/<after>: a worktree name (each built and served on its own free port) or a URL (a page served at two commits)
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

Then the usual one command — `serve` builds that worktree's practice app and serves it from the
deck's own address under `/app/`, so the panes come back whenever the deck does:

```bash
python3 scripts/ui-review/review-cards.py serve <spec>       # --no-live: the spec's live.base names a server of its own
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
- **An edited candidate shows on the pane's next reload** — the deck rebuilds the practice app
  when `/app/index.html` is asked for and the source changed (it is not a hot-reloading server).
- **It replays.** Reopen the review later and the panes come back with the deck (from that
  worktree's current code). A deck built before 2026-09-26 pointed its panes at a fixed port;
  serving it rewrites them onto `/app/` once and says so.

Spec: `docs/archive/specs/2026-08-31-live-review-panes-design.md`.

Rebuild every landing-page asset at once (loops, gallery stills, live embed):
`bash scripts/ui-review/site-assets.sh <worktree> [--out <dir>]` — refuses to overwrite a gallery
when any shot failed verification; `--out` writes everything to a scratch folder instead.

**`"zoom": 1.25`** (scene field, default 1) films the page zoomed in the way Ctrl+= does in the
app: the layout runs at width/zoom × height/zoom CSS px and Chrome paints it at `zoom` device
pixels per CSS px, so the clip keeps its size and everything in it is `zoom` times bigger, in
real pixels. Actions address elements by selector, so nothing else in the scene changes. The
fourteen desktop `promo-*` scenes carry 1.35 (Destin, 2026-09-04: "hit the + a bit so it's easier
for viewers to track what's happening"); the phone scenes stay at 1.

## Editing copy on the site (youcoded.ai)

Destin's "let me edit the website" request. `site-copy-editor.py` serves the **real
`youcoded/docs/index.html`** — its own CSS, wallpaper, mascots, feature loops, gallery and the
live embed iframe — with every text block editable in place. It writes the edits to disk so a
session can apply them.

```bash
# background it and put the printed URL in chat as the last line of the turn.
# --out-dir defaults to scratch/site-copy-edit (git-ignored) — the answers live
# there, so use a path you will NOT delete when restarting the server.
python3 scripts/ui-review/site-copy-editor.py serve youcoded/docs/index.html
```

| | |
|---|---|
| **Edit** | click any text and type; the block outlines orange. Autosaves ~800ms after each keystroke. |
| **Show editable** | outlines every editable block. |
| **Submit edits** | writes `<out-dir>/edits.json` **and** `<out-dir>/edits.md` (old → new per block). Tell the session to read the `.md` and apply it. |
| `build` instead of `serve` | writes `<out-dir>/index.html` without starting a server (for inspecting what gets marked). |

**How it works, and the traps already paid for:**

- It mirrors the site's sibling folders (`media/`, `gallery/`, `icons/`, `site/`, …) into
  `--out-dir` by symlink so relative asset paths resolve. A lone HTML file served from `/tmp`
  renders a page with no pictures — the first version did exactly that (2026-09-10).
- Marking walks **opening tags only**. The earlier whole-element regex let a matched ancestor
  (`<div class="origin-story">`) consume its nested blocks — that is what left the first FAQ
  answer permanently uneditable — so nested prose is now all reachable.
- Class matching is **substring by default, exact for `{"a"}`** — the FAQ answers use
  `class="a"`, and as a substring that captures nearly every div on the page.
- Markup inside `<script>`/`<style>`/comments is skipped, so the install-modal HTML that lives in
  a JS string never becomes a phantom block.
- The server is **threaded** (`ThreadingHTTPServer`): the first version was single-threaded and one
  stalled connection froze the whole page mid-edit.
- The toolbar sits **bottom-right** with `z-index: 2147483647` — the site's own centred docked
  pill (`.dlfloat`, bottom:34px) collides with a centred toolbar.
- All `<details>` panes are **forced open** in the editor only, so collapsed prose is visible and
  clickable; the editor-only force-open is undone before text comparison so it is never recorded
  as an edit.
- Whitespace-only container blocks are **dropped on the page**, so no bare gap is clickable.
- **An empty autosave can never overwrite a real submission.** Every open page posts its state ~800ms
  after a keystroke; a tab left open across a server restart posts its own empty state. On 2026-09-10
  that erased a finished set of Destin's edits, and the tool now refuses it
  (`write_edits` → the "REFUSED to overwrite" line). Keep `--out-dir` out of `/tmp` for the same
  reason: deleting it is how the restart lost the work in the first place.

Guarded by `tests/test_site_copy_editor.py` (marking, the exact-`a` rule, nesting, script
skipping, the save output, and the empty-autosave refusal). **Not** the review deck and **not**
`copy-preview.py` below: this is the whole real page for free-form copy editing, not a per-step
approve/deny review.

**Applying a submission (the session's half).** Read `<out-dir>/edits.md`, then map each block to the
file and assert every `was` string lands **exactly once** before writing — the same character can
appear in two places, and three edits need markup-aware matching: a block whose text carries inline
markup keeps it (`<strong>NOTE:</strong>`, `<strong>someone who has never written code</strong>`), the
origin-story paragraph is stored with `&ldquo;`/`<em>`/`&hellip;` while the editor captured rendered
characters, and a block whose `now` reads like an instruction ("delete this demo slide") is not copy.
Removing a **demo slide** is structural: delete the `.step` block AND its `#stage` `<video>` together,
because the deck aligns `steps` with `#stage` children by index (the `.deck-phone` overlay is excluded
by class), so removing one alone shifts every later card's clip.

### Copy-preview and copy-review (earlier tools)

`copy-preview.py` builds a page-shaped preview of **proposed** copy (old text on a toggle, per-row
loop verdicts) — for reviewing a rewrite before it lands. `copy-review.py` was the older
old/new table, rejected 2026-08-28 as "chunked up and displayed all kinds of weird"; archived to
`docs/archive/ui-review-tools/` 2026-09-23 (nothing live referenced it). Neither
serves the live page; reach for `site-copy-editor.py` when Destin wants to edit the site himself.

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
`wecoded-themes/themes/<slug>/assets/mascot-rig.svg` — copy them fresh before regenerating.
Since 2026-09-05 seven themes ship one (Cotton Candy Sky, Meadow Mist and Devil's Garden joined
the first four), so all four picker buttons wear their theme's own character; a theme without
a rig would still fall back to the app's `DEFAULT_BUDDY_RIG`, tinted.

**Do not strip `slot-hat` / `slot-eyewear` as empty scaffolding.** Each theme's SIGNATURE
lives there — Halftone's visor is eyewear, Kuromi's horns and Strawberry Kitty's ears-and-bow
are hats. Stripping them turned Halftone into a featureless blob and left both cats bald.

### Faces come from the rigs; poses from the promo film
The warm face set the film introduced (every expression keeps the welcome face's big sparkled
eyes; brows, lids and the mouth carry it — nothing is a hollow black disc, which is what made
the old surprised face scary) now lives IN every theme rig and the app's default rig
(wecoded-themes 817e6b6, youcoded b8eef02f). So since 2026-09-10 `gen-hero-mascots.py` passes
`WARM = False` on every row: overwriting a rig's faces would paint older copies over the
characters' current ones. Its own ink rule (`accent × 0.32`, never a white on-accent) matters
only to a tinted default rig, which the picker no longer shows.

- **`scripts/promo/src/host/engine.ts`** — the pose library and its angles: wave −150 with a
  waggle, cheer ±150 with a jump, shrug ±75, tada ±115, think −165, startle ±160.

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

## Workbench switches

The practice app's `?switch=` URL options — a `shoot` screen-list entry names them in `params`,
a journey or `explore start --params` passes them, a scene puts them in its `base`.

`?scenario=default|empty|no-providers|refused|stress` (resume list / permissions /
providers data — the transcript never changes), `?stalled=1` (parks the native session's
turn → red stalled card), `?firstRun=<STEP>` (onboarding wizard; added 2026-08-25),
`?marketplace=empty` (registry-less Marketplace/Library; the default is a sampled registry
fixture, `dev/workbench/fixtures/marketplace/registry.ts`, added 2026-08-25),
`?view=tools|compare` (tool gallery / permission-card comparison), `?latency=<ms>`.

Provider and account state — **a shot of Settings → Cloud providers that omits these gets
a card drawn in its EMPTY state, which reads as a missing feature rather than a missing
flag.** On 2026-09-09 a review deck shipped a Claude Code card with no usage bars for
exactly this reason, and Destin filed a request for something that had shipped four days
earlier: `?planUsage=1` (the Claude plan's 5-hour/7-day windows on `status:data` — without
it the Claude card has no bars while ChatGPT's has two),
`?chatgpt=signed-out|waiting|signed-in|free|blocked` (the ChatGPT account card; default
signed-in on Plus), `?claudeCode=signed-in|signed-out|apikey|not-installed|unknown`
(Claude Code's own sign-in; default signed-in on Max),
`?openrouter=verified|rejected|expired|wrong-type|none` (pins the OpenRouter card's key
health verdict; with no pin the card falls back to unsaved), `?openrouterSignIn=waiting|failed`
(pins the OpenRouter sign-in card mid-round-trip instead of its default instant success),
`?authMode=oauth|chatgpt|apikey`
(pins the first-run sign-in screen mid-round-trip), `?signedIn=1` (a YouCoded account and
a fake friend).

The rest: `?arcade=<game>` (open a game the scenario cannot reach),
`?remote=setup|connected` (Remote Access popup state),
`?remotePreview=setup|consent|checking|checked|ready|conflict|error|disabled|not-installed|sign-in-required|checked-failed|checked-silent`
(the mock-only setup-flow stages the remote-access decks were shot from; `checked-*` are the
end-of-setup check's three answers), `?lease=held:<device>` (a resume
raises the takeover dialog), `?conversation=reconnecting|restoring|incomplete|complete`
(needs `&connection=remote`; puts the phone's copy-of-conversation strip in that phase),
`?remoteFiles=refused` (same; every file channel refused, reproducing what a phone gets
today), `?filesLocked=1` (Project Files gets one folder that refuses to open),
`?reason=<code>` (why a setting is switched off),
`?student=1` (the student persona's files, project and history),
`?projects=none` (the project index answers with no projects, so Projects' empty-state
explainer is reachable; composes with any scenario),
`?voice=<phrase>` (dictation without a microphone), `?reply=<name>` (which fixture the
"model" speaks), `?replySpeed=<k>` (plays that reply k× faster, text and pauses alike),
`?seed=none` (empties the chat in `scenario=site` ONLY — elsewhere it is ignored), `?title=`, `?model=`, `?platform=android`,
`?autoplay=<n>`, `?buddyHelper=installed|missing|stale` (the Linux buddy helper controls),
`?guide=tour|tips|tip:<id>` (arms the first-run tour/tips this profile owes, or fires one
named tip after boot; a leftover `tour` from an earlier load can bleed into a later shot —
clear it with a fresh profile or no flag), `?localApps=found` (first-run Local Models: two
model apps already detected running, vs. the default empty),
`?screenFrame=cards|sheet|rail|bleed` (how the page view's panel and frame sit on a wallpaper
in floating chrome — the Pages floating-theme round, 2026-09-17; `cards` is what ships).

Failure switches, for review shots of error states (added 2026-09-11):
`?fail=<ns.method>[,<ns.method>…]` makes those channels REJECT from the very first call —
`?fail=skills.list`, `?fail=tags.list`, nested `?fail=theme.marketplace.list`. Use it for any
read that runs when the app starts (the skills drawer, the Library, the tag registry): a
shot's `eval` only runs after boot, too late to fail a startup read. `skills.list` also feeds
Marketplace and Library, so failing it fails all three — as in the real app.
`?stall=<ns.method>[,…]` is its twin for long waits: those channels NEVER answer, so a
spinner's slow state can be photographed (`?stall=session.browse` shows Resume's "Still
loading" line after 6 s; added 2026-09-26).
`?update=available` puts an available update (1.2.4 → 1.3.0) on `status:data`, which shows
the status-bar version pill and lets its Update panel open; `update.download` answers a
fake file and `update.getCachedDownload` answers nothing.

Fidelity gaps the workbench has: no PTY (Terminal is blank — review it on Electron),
theme `localStorage` key is honoured (Electron ignores
it and uses the profile's theme). Marketplace install counts/ratings come from the live
worker even in the workbench. **`window.claude` is a Proxy: an `{"eval": …}` step that
overrides ONE method (`window.claude.firstRun.getState = …`) is silently dropped and the
shot captures the unchanged fixture — replace the whole namespace
(`window.claude.firstRun = { getState: … }`), which does stick.** Found 2026-09-09 after a
"before" shot came back identical to the "after" one and looked like a passing comparison. `expect` checks on marketplace text must be case-insensitive
— the eyebrows are uppercased by CSS, so `textContent` still says "Featured".

If `run-workbench.sh` (the hot-reloading server, for building UI by hand) dies with `ENOSPC`
(file watchers), start it with `VITE_NO_WATCH=1`: the live app plus one dev instance can hold
~495k of the 524k inotify watches on this machine. The review tools use a static build and
watch nothing.

## Real-app pass (Electron)

For the terminal, Backup & Sync, a live session — anything the practice app fakes — start an
isolated dev window and click through it with `explore`:

```
bash scripts/run-dev.sh <branch> --label "<what you check>"
node scripts/shoot/explore.mjs start --dev          # attaches only to a window run-dev.sh started
```

`explore --dev` refuses any window without run-dev.sh's marker (`desktop/.dev-instances/`),
so the installed app can never be driven. (The old `ATTACH_PORT=… shot.mjs plans/electron-*.json`
recipe is retired with its plans.)

**A screenshot of a dev window that is BEHIND other windows is stale.** Chromium stops
painting an occluded window, so `Page.captureScreenshot` over CDP returns the last frame it
drew and DOM reads lag the clicks that caused them. Measured 2026-09-17: six probes of a
theme tint in Destin's dev window measured "dark, no tint" while he was looking at the tint,
because the window sat under the terminal. Computed styles are still trustworthy; pixels and
"what is on screen now" are not. Bring the window to the front (or use the headless
workbench) before trusting a pixel.

The dev profile keeps this away from the live app, but it **shares `~/.claude` and the synced
settings** — a session created there is a real conversation in the synced archive
(`docs/local-dev.md`). Create sessions only when the check needs one, and say so.

## Tests

**From a worktree outside the workspace folder** (a scratchpad checkout of `youcoded-dev`),
set `YOUCODED_WORKSPACE=/home/destin/youcoded-dev` first: the deck code finds the theme
registry by walking up to a folder that holds `wecoded-themes/themes`, and a temp worktree has
no sub-repos beside it. Without it 16 tests error with "no workspace root above …" and the
contract close-out test fails the same way (measured 2026-09-04).

They are `unittest` and `node --test`, not pytest, and they live outside a package — so the
start directory has to be the top level too. `-t .` fails with *"Start directory is not
importable"*, which is why nothing ran them for months:

The six binary-free suites, which is what CI runs:

<!-- runnable -->
```bash
cd scripts/ui-review/tests && python3 -m unittest test_spec test_tokens test_live test_words test_contract test_site_copy_editor
```

Everything (~280 tests) — needs `magick`, `ffmpeg` and Chrome, all present on this machine:

<!-- runnable: local -->
```bash
python3 -m unittest discover -s scripts/ui-review/tests -t scripts/ui-review/tests -p 'test_*.py'
node --test scripts/ui-review/tests/deck-render.test.mjs
bash scripts/ui-review/tests/close-out-contract.test.sh
```

Both blocks are marked `<!-- runnable -->`, so `scripts/check-doc-commands.mjs` actually runs
them — the first on every CI run, the second only locally. That marker exists because the
command printed here used to be `-t .`, which cannot start at all, and nothing noticed for
months.

| Suite | Needs |
|---|---|
| `test_spec`, `test_tokens`, `test_live`, `test_words`, `test_contract`, `test_site_copy_editor` | nothing — **these six run in `workspace-ci.yml`** |
| `test_boxes`, `test_build`, `test_crops`, `test_cli`, `test_serve` | `magick` (they cut real crops) |
| `deck-render.test.mjs`, `coverage.test.mjs`, `shot-measure.test.mjs` | Chrome; the clip fixture also needs `ffmpeg` |

Keep new deck coverage picture-free and put it in `test_live.py` where you can — that is what
decides whether it runs on every push or only when someone remembers.

## Extending

New surface → a screen-list entry and a mark (`scripts/shoot/README.md` → "Adding a screen");
`shoot --check` must open it. New workbench switch → also add a route to
`scripts/workbench-boot-check.mjs`.

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
in its first 60 drags.

**Point it at the workbench's CHILD frame and widen it**, or it measures nothing:
`?mode=workbench` alone renders the toolbar around an iframe, and at the default 460px the
strip packs to ONE pill while a scenario needs three. Both together —
`'…/?mode=workbench&child=1&view=app&scenario=stress&latency=0'` with `FUZZ_W=1400
FUZZ_H=900`. **A `worst:` line of all dashes, with no numbered scenario rows above it, is a
run that drove zero drags, not a clean sweep** (it printed exactly that six times on
2026-09-07 before anyone noticed); the sweep now exits 1 rather than saying it. Frames of
any scenario are in `drag-fuzz.json` — but the write of that file throws on a 60-drag run
(`docs/roadmap/dev-workspace.md`), so read the scores off stdout until that is fixed.
