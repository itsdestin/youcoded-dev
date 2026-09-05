---
status: active
date: 2026-09-04
supersedes: scripts/questions/serve.py (the plain questions page)
extends: docs/archive/specs/2026-08-27-review-deck-v2-design.md, docs/active/specs/2026-09-01-feature-flow-design.md
---

# Review deck consistency — design

Decided with Destin on 2026-09-04. One deck tool, one look, a question format that lives in
the tool rather than in a session's memory, a chooser so a session picks the right step kind,
the live app's theme by default, and a way to review changes to the deck on the deck.

## 1. Why

A sweep of every deck served since 2026-08-25 (61 specs, 15 screenshotted) found:

- **Two tools, two looks.** `review-cards.py` renders the approved framed page (amber tag,
  app font, one step per screen). `scripts/questions/serve.py` renders a scrolling list in a
  generic font with blue buttons. Used three times (phase A/B, promo, mascots 2026-09-04) and
  it is the only place the Today / The problem / Proposal / pros-and-cons structure exists.
- **Content drifts because the structure is not in the tool.** A review-deck words step has
  one free paragraph per option. Three decks in two days put "Today: … Proposal: … Pro: …
  Con: …" inside that paragraph for 28 of 28 options; four other decks did it for 0 of 25.
  "(recommended)" is typed into option titles by hand. Nothing checks either.
- **Visual defects in today's decks.** A long subtitle runs under the progress bar and the
  Next button (2 of 8 decks served 2026-09-04, at 1440 px). The Risk card and the third
  option are sliced off in the side column (roadmap `dev-workspace.md`, needs-verify). A
  picture-free question leaves most of the screen empty under one row of cards.
- **Every deck opens on Midnight**, because specs list it first; Destin's live theme was
  Golden Sunbreak.
- **Nothing lets a session look at a deck before serving it**, and nothing lets a change to
  the deck be reviewed the way an app change is.
- **The step kinds are documented in four places** (the CLI docstring, one 700-word README
  table cell, an archived spec, a skill paragraph) with a template for one of eight kinds.
- **Note tags** (Fix now / Fix later / Just noting) ask Destin to classify his own remark.
  His words are self-contained; the assistant follows up if a note is unclear.

## 2. Decisions (Destin, 2026-09-04)

1. One tool. The plain questions page is retired; its four-part content becomes the review
   deck's question step.
2. Question decks are **pages**: default is every question on one scrolling page; a page
   break only where the thinking genuinely shifts. "My mindset should stay in the same place
   for each set of questions, and only shift when moving to a new set."
3. The framed review-deck look is the only look.
4. The note tags go. A note is a note.
5. A session must be able to pick the right step kind from one table.
6. The deck opens on the live app's theme.
7. Deck changes are reviewed on a deck of the deck.
8. (2026-09-05) **A deck never opens the browser itself.** `serve` prints the address; the
   session puts that link in chat at the end of its turn, and Destin opens it when he is
   ready. Sessions run inside the app, which opens a pasted link; an unasked-for browser
   window on his desktop is the wrong surface.

## 3. The page

### 3.1 Question pages

A words-only deck (every step picture-free) renders as pages, not one step per screen.

- With no page markers, all question steps share **one** scrolling page.
- A **page marker** in `steps` — `{"id": "P-scope", "page": "What gets redrawn", "intro":
  "one line"}` — starts a new page. Every question step after it, until the next marker,
  sits on that page. A marker before a picture step is a spec error.
- The header's progress bar counts pages. Prev / Next move between pages. `step n of m`
  reads `page n of m · k of q answered`.
- Each question keeps its own answer row (buttons + note) and its own `id`; the answers
  file, the summary, and contract `source` links (`<deck>#<step id>`) are unchanged.
- The page is a centred reading column (max ~760 px), the theme's font, body 14 px, an
  eyebrow per page title and the page intro under it. Question cards stack; an answered card
  gets the same accent edge the mock-up used for `done`.
- A deck that mixes pictures and words (a review round with one written question) keeps
  today's one-step-per-screen behaviour for every step; the question step just uses the new
  card. Pages are for question decks.

### 3.2 The question step

Fields of a words step that asks a question (the questions round, a reopen deck, a decide
without a picture):

| Field | Required | What it is |
|---|---|---|
| `headline` | yes | the question, ≤25 words |
| `today` | yes | what exists now — which part of the app, what it does for the user |
| `problem` | yes | what goes wrong or is missing, as the user experiences it |
| `proposal` | yes | what would change, as the user would notice it; with no `options`, what Yes / No / Don't know each lead to |
| `options[]` | no | `{id, label, pros[], cons[], summary?, cost?, recommended?}` — pros and cons about the user's experience; one option at most may be `recommended: true` and gets a badge |
| `yes` / `no` | no | relabels for a statement step (an acceptance row) — unchanged |

Rendering: the question as the headline; Today / The problem / Proposal as labelled blocks
(eyebrow + paragraph, the plain page's layout); options as lettered cards with a green pro
list and a red con list; the recommended card carries a `Recommended` badge on its letter.
Without options: Yes / No / Don't know. With options: the cards are the answer, plus
`Other`. A note box under every question, no tags.

The builder **refuses** (naming the step and the field to use instead) when:

- a question step is missing `today`, `problem` or `proposal`;
- any option `label` contains `(recommended)` or `recommended` → use `"recommended": true`;
- any `summary`, `proposal`, `today` or `problem` contains an inline label `Today:`,
  `Proposal:`, `Problem:`, `Pro:`, `Pros:`, `Con:`, `Cons:`, `Downside:`, `Upside:` →
  use the field;
- more than one option is `recommended`;
- an option has neither `pros` nor `cons` nor `summary`.

Existing rules stay: banned code words, headline length, the ≤3-options warning, one
option is enough.

A **statement** step (`"words": true` with `yes`/`no` relabels and no `today`) — the
acceptance rows — is unchanged and exempt from the three-part requirement.

### 3.3 Notes without tags

The `Fix now / Fix later / Just noting` buttons are removed from the page, the answers
schema (`note_kind`), the summary (`[tag]` suffix), the contract agent's routing, and the
feature-flow rule. The contract agent treats every note as a remark to read; a note that
states a requirement becomes a row, a note that asks for a change is `## Not covered` for
the next round. Old answers files with `note_kind` still load; the field is ignored.

### 3.4 Fixes in the shared page

- **Header overflow.** `.where` gets a hard `max-width` (40% of the bar) and the eyebrow
  truncates inside it at every width; below 1400 px it hides as today. Pinned by a render
  test that measures the nav's left edge against the title's right edge at 1440 and 1280.
- **Side-column slicing.** The `.decide` column scrolls internally and the controls row is
  sticky at its bottom, so the third option and the Risk card are reachable and the answer
  buttons never leave the screen. Closes the `needs-verify` roadmap item.
- **Empty stage on a words step** — replaced by the reading column (§3.1).

## 4. Step kinds — the chooser

The rule file (§7) carries this table; a session copies the template.

| You want Destin to… | Kind | Spec shape | He answers | Template |
|---|---|---|---|---|
| approve a change he can see | **Approve** | `crop` + `changed` + `notice` (+ `risk`, `measured`), two runs | Yes keep it / No revert it / Other | `approve.json` |
| approve something before it is built, from one picture of today | **Brief** | same, one run (`runs: {today}`) | Yes build it / No leave it / Other | `brief.json` |
| pick between several pictures of ONE thing | **Choice** | `variants[]` each with a `crop` | pick one / None of these / Other | `choice.json` |
| pick between written options with one picture for context | **Decide** | `crop` + `highlight` + `options[]` | pick one / Other | `decide.json` |
| judge motion, hover or a transition | **Clip** | `clip` (files from `record-pair.sh`) | Yes / No / Other | `clip.json` |
| operate the real thing — drag, hover, resize | **Live** | `live` panes of the workbench, `variants` for pick-one | Yes / No or pick one | `live.json` |
| answer questions before anything is drawn, or decide a point in words | **Question** | `words: true` + today/problem/proposal (+ options), page markers | Yes / No / Don't know, or pick one / Other | `questions.json` |
| sign off the definition of done | **Contract** | `rows[]` | Yes that is done / No something is missing | `contract.json` |
| accept the graded contract | **Acceptance** | generated by `review-cards.py acceptance` | Yes accept / No | (generated) |

Rules of thumb the table carries as footnotes: several designs of one thing are ONE
Choice step, never a yes/no each; a step with pictures in one theme only lists its own
`themes`; a question deck errs on more questions per page; a reopen after the contract is a
one-question deck.

## 5. Theme by default

`build` and `serve` read `~/.claude/youcoded-appearance.json` (written by the live app on
every theme change; `ipc-handlers.ts` `appearance:set`; a plain file, not held open, so
reading it is inside the live-app safety rule) and take its `theme`.

- Words-only, live and contract decks: that theme is the page's first theme, always.
- Picture decks: it is moved to the front of `themes` if the spec lists it; if not listed
  but captured in the runs, it is added at the front; if not captured, the deck opens on
  the spec's first theme and `build` prints
  `live theme golden-sunbreak is not captured in these runs — opening on midnight`.
- `--theme <slug>` on `build`/`serve` overrides; `"theme": "fixed"` in a spec pins the
  spec's own order (a deck whose point is a specific theme).
- Community themes load their tokens from `wecoded-themes/themes/<slug>/manifest.json` as
  today; a live theme with no manifest anywhere falls back with the same printed line.
- The mascot review deck's theme pills already exist; nothing new on the page.

## 6. Machinery

### 6.1 Spec changes (`deck/spec.py`)

- Page markers (§3.1): `page` + `intro` on a step with no other fields; validation rules
  above.
- Question fields and the refusal rules (§3.2).
- `is_question(step)`: words step with `today`. `pages(spec)`: the list of pages, each
  the marker (or an implicit first page) and its steps. `deck_data` emits `pages` for a
  words-only deck.
- `note_kind` dropped from validation and the summary.

### 6.2 Page (`page.js`, `page.css`, `page.html.tmpl`)

- A `pages` deck renders the reading column with all cards of the current page; per-card
  answer rows; the progress bar over pages.
- The question card (§3.2). The badge. Pros/cons lists.
- Tags removed. Header fix. Side-column scroll.

### 6.3 `preview` — look before you serve

`review-cards.py preview <spec> [--sizes 1440x900,1280x800,1024x768] [--themes …] [--out DIR]`
builds the deck (no server), opens it headless in Chrome over CDP (the driver in
`tests/deck-render.test.mjs`, lifted into `deck/render.mjs` so both use one), and writes one
PNG per page × size × theme to `<spec dir>/preview/` plus a `contact.png` sheet (`magick
montage`). Exit 1 on a console error. A session reads the sheet before `serve`.

### 6.4 `selfie` — the deck reviewed on the deck

`review-cards.py selfie [--before <git ref>=origin/master] [--out DIR]`:

1. Builds the **fixture deck** (`scripts/ui-review/deck/fixture/selfie.json` + the synthetic
   run from `tests/fixture.py`, extended so every kind in §4 appears at least once, the
   question deck with two pages).
2. Renders it with the deck code at `--before` (a `git worktree` of that ref in a temp dir)
   and with the working tree, at 1440×900 and 1024×768, in `midnight` and `light`.
3. Writes a review-deck spec whose steps are one **Approve** step per fixture page, with
   `runs: {before, after}` pointing at the two render folders and `highlight: "auto"`, so
   the changed region is boxed by pixel diff; then `serve`s it.

Any change to `page.css`, `page.js`, the template or the fixture is shown to Destin this
way. The rule (§7) says so.

### 6.4b `serve` does not open a browser

`serve` no longer opens anything: the `--no-open` flag goes, `open_url` goes, and the
address is printed as `[deck] http://…` for the session to relay. `selfie` follows the same
rule. The rule file (§7) says: the link goes in chat, at the end of the turn, as the last
line — never mid-turn, never auto-launched.

### 6.5 Templates

`scripts/ui-review/templates/` gets one JSON per kind in §4 (contract.json exists). Each is
a two-step example with every field filled and a `_comment` per field in plain words. `build`
strips `_comment` keys.

### 6.6 Retirement

`scripts/questions/serve.py` is deleted. `docs/active/design/2026-09-04-mascot-restyle/
mascot-restyle.questions.json` is converted to the new shape (its answers file is kept and
still resolves: same ids). The two older `sections` specs (phase A/B, promo) are archived
records and are not converted.

## 7. Instructions

- **`.claude/rules/review-deck.md`** (new; paths `docs/active/design/**/*.json`,
  `docs/active/reviews/**/*.json`, `scripts/ui-review/deck/**`, `scripts/ui-review/templates/**`):
  the chooser table (§4), the question-page rule, "preview before serve", "selfie before
  merging a deck change", the theme default, ≤600 words, `verify:` anchors on the templates
  and the tests.
- **`scripts/ui-review/deck/AUTHORING.md`** (new lazy doc): every field of every kind, the
  page-marker grammar, the refusal rules, the answers file, the commands.
- **`scripts/ui-review/README.md`**: the review-cards table cell shrinks to three lines and
  a pointer.
- **`CLAUDE.md`** "Asking Destin many questions at once" and "New Features & UI/UX Changes":
  point at `review-cards.py` and the rule; the four-part description stays.
- **`.claude/skills/ui-mockup/SKILL.md`** "Before drawing anything": pages, the fields, the
  template; step 4 of "After approval" (fix-later notes) goes.
- **`.claude/rules/feature-flow.md`**: the untagged-note sentence goes; the words-deck
  invariant names the question fields.
- **`scripts/ui-review/contract-agent.md`**: §3.3.
- **`docs/MAP.md`**: the rig row names the rule, AUTHORING.md, `preview` and `selfie`.
- **`docs/roadmap/dev-workspace.md`**: close the side-column item; file nothing new.
- Auto-memory `feedback-review-page-format`: add the page rule and the no-tags decision.

## 8. Testing

- `test_words.py`: page markers (grouping, marker-before-picture error), question fields,
  the refusal rules, `recommended` uniqueness, `note_kind` ignored.
- `test_spec.py`: theme default (file present / absent / not captured / `--theme` /
  `"theme": "fixed"`), reading the file through a path override for tests.
- `test_cli.py`: `preview` writes the PNGs and the sheet (skipped without Chrome); `selfie`
  builds a spec whose steps match the fixture pages (the render is skipped without Chrome).
- `deck-render.test.mjs`: a pages deck renders the reading column, answers two cards on one
  page, the bar counts pages; the header measurement at 1440 and 1280; the side column
  scrolls and the controls stay visible; no `#tags`.
- `test_build.py`: `_comment` keys are stripped; every template builds.
- CI's five binary-free suites stay green; the render suite runs locally and in the selfie.

## 9. Non-goals

- Rendering community themes in the workbench (roadmap, parked) — the theme default degrades
  with a printed line instead.
- Rebuilding the deck inside the app's renderer.
- A grouped layout for picture decks.
- Converting old `sections` specs.
