---
status: draft
created: 2026-08-27
owner: Destin (decisions) / Claude (draft)
related:
  - docs/active/handoffs/2026-08-27-review-deck-tooling-handoff.md (the brief and the known gaps)
  - docs/active/prototypes/2026-08-27-deck-mockup-g.html (the approved page — "this is perfect", 2026-08-27)
  - docs/active/prototypes/2026-08-27-deck-mockup-g.py (regenerates the mockup)
  - scripts/ui-review/README.md, .claude/skills/ui-review/SKILL.md (the tooling this replaces parts of)
---

# Review deck v2 — design

## 1. What this is

The **review deck** is the page Destin looks at to approve or reject UI changes, one
point per step. This spec replaces the v1 deck (`scripts/ui-review/review-cards.py`, the
generic-looking page with one pulsing ring, Y/N/M hotkeys and a copy-paste feedback
block) with a page that wears the app's own look, shows Before and After side by side
with the changed region measured by the screenshot rig, saves every answer to a file
as it is given, and tells Claude when Destin is done — no copying, no pasting, no
clicking a file to open it.

Three parts change:

| Part | Today | After this spec |
|---|---|---|
| The page | `review-cards.py build` → static HTML, generic styling, ring at a guessed % | Same command, new page (§3): app tokens, adaptive layout, loupe + zoom, three cards, coloured progress, submit dialog |
| Getting it to Destin and answers back | He opens the file; Copy feedback → paste into chat | `review-cards.py serve` starts a tiny local server, opens the browser tab itself, writes `<spec>.answers.json` on every click, exits when he submits — Claude is waiting on that exit |
| Highlight boxes | Hand-estimated `[x%, y%]` in the spec | The rig measures a named element per shot, or the deck computes the changed region from the Before/After pixels; the spec never carries coordinates |

Out of scope, deliberately: the workbench toolbar (Destin: deck controls first), the
in-app artifact viewer bridge (rejected in favour of the answers file), theme-folder
serving in the workbench (gap 2 — ROADMAP).

## 2. Decisions taken in the design session (2026-08-27)

All of these were reached by looking at rendered mockups, not descriptions; the
approved mockup is the visual reference for §3 and wins over any prose here if they
disagree.

- **Where reviews happen:** a browser tab the tool opens itself. Answers go to a file
  next to the spec; Claude watches for the submit. (Rejected: in-app viewer bridge —
  needs app code and lets any HTML fill the composer; copy/paste — the ritual we are
  removing.)
- **Theme:** the page follows the theme of the crop being viewed (Midnight page around a
  Midnight crop, Light around Light). Built-in tokens are inlined; a community theme's
  tokens come from its `manifest.json`.
- **Boundary:** the deck is a distinct surface — inset on `well`, framed in the deck's
  amber, with a `REVIEW DECK | <title>` chip sitting on the frame — because inside the
  app's file panel a same-theme deck was mistaken for the app.
- **Amber (`#FFB020`) is the tool's one identity colour**: frame, chip, highlight box,
  loupe crosshair, Risk card edge, current progress segment. No built-in theme uses it
  for chrome, so it reads as "the review tool" in every theme.
- **Both pictures always.** Before | After side by side (or stacked), no flip toggle, no
  separate "zoomed on the change" strip — the loupe and zoom do that.
- **Highlight = a box, not a circle**, with a soft halo; nothing outside it is dimmed
  (a spotlight dim greyed the Light theme out).
- **Answers:** Yes · No · Other. No hotkeys, no auto-advance; **Save & Next** commits.
  Note placeholder is "Add a note (optional)" after Yes/No and "Explain what you'd like
  instead…" after Other. Header **Next ›** moves on without an answer = skipped.
- **Progress bar** segments: green yes · red no · amber other · grey skipped · faint
  untouched · outlined current. Clickable to revisit. No ledger ids (P-3, P-21…) anywhere
  a reviewer reads — those live in the spec and the answers file only.
- **Done — Submit Feedback** opens a dialog that says what happens (saved as you went;
  submitting notifies Claude; nothing to paste; close the tab) and warns about skipped
  steps with *Go to first skipped*.
- **Three peer containers on one grid** — pictures, explanation (headline + What changed
  / You'll notice / Risk cards), answer controls — with outer edges always meeting, on a
  content column that scales with the window (`clamp(900px, 80vw, 1640px)`).
- **Layout is chosen by measurement, not by aspect thresholds** (§3.4).
- **Theme thumbnails** (every theme's After crop) stacked in the right margin; they drop
  into a row above the grid when the margin is under 150px.
- **Text vocabulary is fixed** (§5): headline, What changed (+ measured line), You'll
  notice, Risk. "Why / details" and "Tell me more" are gone — *Other* with a note is how
  Destin asks for more.

Ideas offered and **not** taken (recorded so they are not re-proposed as new):
cover/intro step, "hold Space to peek", multiple labelled boxes per step, attach-your-own-
screenshot (gap 4), "open this screen live in the workbench". The last two go to ROADMAP
as `idea`.

## 3. The page

### 3.1 Anatomy (top to bottom, wide window)

1. **Chip** on the frame, top-left: `REVIEW DECK | <deck title>`. Amber, dark text,
   1px divider. The title is the spec's `title`.
2. **Header** (panel surface, rounded top): left — the step's **surface name** and its
   small uppercase path (`Themes dialog · SETTINGS → APPEARANCE`); centre — `‹ Prev`,
   the progress bar, `Next ›`; right — `step n of N · k answered` and **Done — Submit
   Feedback**. Below 1400px the path drops; below 950px the count drops; below 760px
   Done shortens to "Done".
3. **Content column** (shared width with the header's inner row), a grid of three
   framed containers (panel surface, `edge` border, `radius-lg`):
   - **Pictures**: `BEFORE` and `AFTER` captions, the crops, the amber highlight box on
     each, a `− 100% +` pill sticky at the top-right. Hovering a picture shows a 180px
     round **loupe** at 2.5× with an amber crosshair at the cursor point; the cursor is
     hidden only over the picture. `L` toggles the loupe; `+`/`−`/`0` zoom in 10% steps
     (100–400%); zooming centres on the highlight.
   - **Explanation**: the **headline** (largest text on the page), then the cards
     ✎ **What changed** (with a small "Measured: …" footnote when there is a number),
     👁 **You'll notice**, ⚠ **Risk** (amber-edged; omitted when the step has no risk —
     the others widen to fill).
   - **Answer**: Yes, keep it (green dot) · No, revert it (red) · Other (amber) · note
     field · **Save & Next ›** (primary; disabled until an answer is chosen; hover lifts).
     Buttons scale with the window (`clamp(34px, 4.4vh, 52px)` tall) and share the row in
     fixed proportion (three equal answers, the note takes the rest).
4. **Theme thumbnails** in the right margin, vertical, the current one outlined.
5. **Submit dialog** (veil + panel): the explanation, the skipped-steps warning listing
   step numbers, `Keep reviewing` · `Go to first skipped` · `Submit`.

Keyboard: `←`/`→` prev/next (skip semantics), `+`/`−`/`0` zoom, `L` loupe. Nothing else.

### 3.2 Embedded vs. tab

`window.top !== window` means the page is inside the app's file panel: the deck adds a
62px bottom margin so the panel's floating **Edit** button never covers Save & Next.
In a browser tab there is no margin. The page also works from `file://` with no server
(§4.4) so archived decks in `docs/` stay readable.

### 3.3 Theme following

The `<html data-theme>` attribute follows the selected thumbnail. The page inlines the
four built-in token sets from `globals.css` and, for each community theme in the spec,
the `tokens` block of its `manifest.json` (`wecoded-themes/themes/<slug>/`). Halftone's
larger radii are honoured (`--radius-md/lg`). Only the tokens the page uses are
inlined: `canvas panel inset well accent on-accent fg fg-2 fg-dim fg-muted fg-faint edge
link` plus radii.

### 3.4 Layout algorithm

For the current step the page tries each arrangement **for real** (applies the grid
class, reads the picture container's box) and scores it by the scale the two crops
would get:

| Key | Arrangement |
|---|---|
| A | Before \| After side by side, explanation and answer below |
| B | Before over After on the left, explanation on the right, answer below both |
| C | Before \| After on the left, explanation on the right, answer below both |
| D | Before over After, explanation and answer below |

Rules: B/C are only allowed when the content column is ≥ 820px wide; A wins ties
within 5%; if the best scale is under **50%** the page switches to **compact** — one
scrolling column, pictures at full width, the answer container pinned to the bottom of
the view. Pictures never upscale past 150%. The choice re-runs on every resize and on
every step change (zoom resets to 100% on step change).

The mockup prints the chosen layout in a small badge at the bottom; the real page does
not.

## 4. The machinery

### 4.1 Spec (JSON, v2)

```json
{
  "title": "Phase C review",
  "key": "phase-c-review",
  "out": "phase-c-review.html",
  "images": "images/phase-c-review",
  "runs": { "before": "/abs/scratch/ui-phase-c-baseline", "after": "/abs/scratch/ui-phase-c-after" },
  "themes": ["midnight", "light", "creme", "dark", "halftone-dimension", "meadow-mist"],
  "crops": { "themes-dialog": ["main", "settings-appearance", "440x600+500+150"] },
  "steps": [
    { "id": "P-3.1",
      "surface": "Themes dialog", "path": "Settings → Appearance",
      "crop": "themes-dialog",
      "highlight": { "selector": "[data-testid=theme-card]:first-child" },
      "headline": "Every theme card is now the same height, so the active card no longer grows and stretches its neighbour.",
      "changed": "Picture on top, one text row at the bottom, every card 92 px tall. …",
      "measured": "Dark 65 px vs Crème 34 px before",
      "notice": "The grid stops jumping when you pick a theme, and every card shows a real preview picture.",
      "risk": "In these screenshots Halftone and Meadow show the colour-strip fallback because the rig cannot serve theme folders." }
  ]
}
```

- `runs` has one entry (a "today" deck: the same picture shown once, captioned `TODAY`)
  or two (`before`/`after`). More than two is not supported.
- `crops` merges over `scripts/ui-review/crops.json` as today. Geometry is on the
  full-window shot; the same crop is cut for every theme × run.
- `highlight` is one of: `{"selector": "<css>"}` (measured by the rig, §4.2),
  `{"text": "<visible text>"}` (same, matched by `textContent`), `"auto"` (pixel diff,
  §4.2 — only with two runs), or `{"box": [x%, y%, w%, h%]}` (escape hatch; the build
  warns). Absent = `"auto"` when there are two runs, else an error.
- `id` is Claude's ledger key (`P-3.1`), never rendered on the page.
- Answers, notes and what was looked at are keyed by `id` in the answers file.

### 4.2 Highlight boxes

**Measured (`selector` / `text`).** `shot.mjs` gains a per-shot `measure` list (the
plan's shot, not the deck spec, is what runs in the browser). `review-cards.py crop`
reads the deck spec and, for every step with a `selector`/`text` highlight, checks the
run's manifest for a matching measurement; the rig writes them as
`entry.measures = { "<selector>": {x, y, w, h} }` in **window pixels** — the deck's crop
step converts to percentages of the crop rectangle. If a measurement is missing the
build fails with the exact `measure` line to add to the plan, so the fix is one paste
and one re-run of that plan. (Plans keep their `expect`; `measure` is additive.)

**Auto (pixel diff).** For two-run decks with no selector, `crop` computes the changed
region per theme: `magick before.png after.png -compose difference -composite
-threshold 6% -morphology dilate square:3 -format %@ info:` gives the bounding box of
what changed; it is intersected with the crop rectangle, padded 6px, and used for both
pictures. If the changed region covers more than 60% of the crop the build warns
("whole-surface change — name an element instead") but still builds.

Both paths write the resolved boxes into the built HTML per theme × run; the spec stays
coordinate-free.

### 4.3 Serve, open, answers, submit

```
python3 scripts/ui-review/review-cards.py serve <spec.json> [--no-open] [--port N] [--timeout MIN]
```

- Starts `http.server` on `127.0.0.1` (free port unless `--port`), serving the spec's
  directory. Opens `http://127.0.0.1:<port>/<out>` with `xdg-open` / `open` / `start`
  unless `--no-open`. Prints the URL either way (the chat fallback).
- `GET /answers` → the current answers file (or `{}`); the page loads it on open, so a
  closed tab resumes where it was. `POST /answers` with the full state → written
  atomically (`.tmp` + rename) to `<spec-stem>.answers.json`. `POST /submit` → sets
  `submitted` and the server exits 0 after replying.
- **How Claude finds out:** it runs `serve` in the background (`run_in_background`) and
  is re-invoked when the process exits — i.e. when Destin submits. `serve` prints the
  feedback summary (§4.5) on exit so the notification carries the answers. `--timeout`
  (default 240 min) exits 2 with "no submit" so a forgotten deck does not hold a session
  forever; the answers file is still complete.
- Only one deck is served per process; a second `serve` for the same spec refuses if
  the port file `<spec-stem>.serve.json` names a live pid.

Answers file:

```json
{ "deck": "phase-c-review", "started": "2026-08-27T18:02:11Z", "submitted": null,
  "answers": { "P-3.1": { "v": "yes", "note": "", "theme": "light", "zoom": 1.2, "seconds": 41 },
               "P-3.2": { "v": "skip" } } }
```

`theme`/`zoom`/`seconds` record what Destin was looking at when he answered — invisible
to him, useful to Claude ("No" given on Halftone means Halftone).

### 4.4 No server (file://)

If `GET /answers` fails at load, the page keeps state in `localStorage` and the submit
dialog shows the old textarea + **Copy feedback** instead of the notify text. This is
the archive path; it is never the intended review path.

### 4.5 Feedback summary (what Claude receives)

Plain text, one line per step, ledger id first, in spec order:

```
phase-c-review · submitted 2026-08-27 18:40 · 11 yes · 1 no · 1 other · 0 skipped
P-3.1 yes
P-3.2 no — "keep the pencil"
P-21.1 other — "make the featured card a touch taller instead"
```

## 5. Writing rules (enforced by `build`)

The builder refuses to build, naming the step and the rule, when:

- `headline` is missing or over 25 words; `changed` or `notice` is missing.
- any text field contains a banned word (case-insensitive): token, primitive, selector,
  IPC, prop, props, reducer, handler, component, Tailwind, CSS class, React, DOM,
  z-index. (Measurements like "92 px" are fine.)
- a listed theme has no captured crop for a step (a missing picture is a bug in the
  capture, never a blank in the deck), or a highlight cannot be resolved (§4.2).
- `surface`/`path` are missing (the header would be empty).

It warns (builds anyway) on: `box` highlights, auto-highlights over 60% of the crop,
a `risk` over 40 words, a `measured` value with no digit.

House style, checked by eye not code: the headline says what a user sees, not what
was edited; *What changed* says what was edited in plain words; *You'll notice* is the
sentence Destin's CLAUDE.md asks for — what changes for users, intended and side
effects; *Risk* is what could look wrong or is not shown faithfully in the pictures.

## 6. Rig changes shipped alongside

From the hand-off's known gaps, the ones this work touches:

1. **Two sweeps deadlock (gap 1):** `run-review.sh` probes each CDP port with `ss`
   before writing the job file and refuses loudly, naming the conflicting offset.
3. **Hand-estimated markers (gap 3):** closed by §4.2.
5. **Brittle `expect`s (gap 5):** README gets a "prefer `aria-label`/role/`data-testid`
   over visible text" rule and the `measure` docs.
6. **Stale coverage rows (gap 6):** manifests carry a `run` id (`Date.now()` at
   `run-review.sh` start, passed through `UI_REVIEW_RUN`); `coverage.mjs` only merges
   manifests from the newest run id present.
7. **Sheets rebuilt for every plan (gap 7):** `run-review.sh` rebuilds sheets only for
   the `shots-<plan>` dirs whose manifests carry the current run id.

Gaps 2 and 4 go to ROADMAP.

## 7. Files

| File | Change |
|---|---|
| `scripts/ui-review/review-cards.py` | Rewritten: `crop`, `build` (v2 page + rules), `serve`. v1 spec format is not read; the three built v1 pages stay as static HTML. |
| `scripts/ui-review/deck/` (new) | `page.html.tmpl`, `page.css`, `page.js` — the page split out of the Python so it can be edited as HTML; `build` inlines them. `tokens.json` — the four built-in token sets, checked against `globals.css` by a test. |
| `scripts/ui-review/shot.mjs` | `measure` per shot → `entry.measures`; `UI_REVIEW_RUN` in the manifest. |
| `scripts/ui-review/run-review.sh` | port probe; run id; sheets scoped to the run. |
| `scripts/ui-review/coverage.mjs` | merge by run id. |
| `scripts/ui-review/tests/` (new) | `test_deck.py` (spec validation, rules, box mapping, auto-diff on fixture PNGs, serve round-trip), run with `python3 -m unittest discover scripts/ui-review/tests`. |
| `scripts/ui-review/README.md`, `.claude/skills/ui-review/SKILL.md` §4, `CLAUDE.md` (the one sentence describing the deck), `.claude/skills/ui-mockup/SKILL.md` | Updated to the v2 flow: `crop → build → serve`, answers file, writing rules. |
| `docs/active/design/2026-08-25-ui-audit/` | Untouched; the next phase writes a v2 spec. |
| Memory `feedback-review-page-format` | Updated: the v2 deck is the format; note what was rejected on the way (rail, alternatives, links, toggles). |

## 8. Testing

- **Python unit tests** (`scripts/ui-review/tests/test_deck.py`): spec loading and
  merge with `crops.json`; every §5 refusal and warning; window-px → crop-% mapping
  including a crop that partially contains the element; auto-diff bounding box on two
  synthetic PNGs (a known rectangle differs); `serve` GET/POST/submit round-trip on a
  free port with the file written atomically; token sets equal `globals.css` values.
- **Headless render check** (`scripts/ui-review/tests/deck-render.mjs`, node + Chrome as
  `shot.mjs` uses): builds the fixture deck, loads it at 1920×1080, 1100×900 and
  520×760, asserts no console errors, the chosen layout per size (C / C / compact), the
  answer container visible in all three, and that a click on Yes + Save & Next POSTs
  one answers record.
- **Rig**: `shot.mjs` measure covered by running `main.json`'s `settings-appearance`
  shot with a `measure` entry in the workbench boot check path; `coverage.mjs` run-id
  merge by a unit test over two fixture manifests.
- **Destin's pass** (per the workspace rule, not scripted): open a real deck built
  from the Phase C runs, in a browser tab and inside the file panel; hover, zoom,
  answer, skip, submit; confirm the chat session wakes with the summary.

## 9. Rollout

1. Build the tooling in the `_deck-tooling` worktree of `youcoded-dev` (no sub-repo
   code changes); rig changes are in `scripts/`, so they land with it.
2. Rebuild the Phase C review deck from the existing `scratch/ui-phase-c-*` runs as the
   first real v2 deck (the mockup's content came from it), and review it end to end.
3. Merge, archive this spec to `docs/archive/specs/`, flip the ROADMAP tooling entry,
   update memory.
