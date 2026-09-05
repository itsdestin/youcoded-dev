---
status: active
date: 2026-09-04
spec: docs/active/specs/2026-09-04-review-deck-consistency-design.md
branch: feat/deck-consistency (youcoded-dev)
---

# Review deck consistency — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One deck tool with one look: question pages with the four-part question built into the spec, no note tags, a step-kind chooser a session can copy from, the live app's theme by default, and `preview` / `selfie` commands so a change to the deck is looked at and reviewed on a deck.

**Architecture:** Everything lives in `scripts/ui-review/` of the workspace repo (`youcoded-dev`). `deck/spec.py` validates and shapes the JSON spec; `deck/build.py` turns it into `DECK` data and inlines `page.html.tmpl` + `page.css` + `page.js`; `deck/serve.py` serves and collects answers; `review-cards.py` is the CLI. The Chrome driver in `tests/deck-render.test.mjs` is lifted into `deck/render.mjs` so a `preview` command and the tests share it. No sub-repo code changes.

**Tech Stack:** Python 3 (stdlib only, `unittest`), vanilla JS + CSS in one page, Node 22 (`node --test`, raw CDP over WebSocket, `google-chrome-stable`), ImageMagick `magick` for crops and contact sheets.

## Global constraints

- Workspace rules: commit from the worktree `worktrees/deck-consistency`, stage by explicit path, push after every commit. Search with `rg`, never `grep`. WHY comment at every non-trivial edit.
- Tests: the five binary-free suites must stay green in CI — `cd scripts/ui-review/tests && python3 -m unittest test_spec test_tokens test_live test_words test_contract`. Everything else runs locally: `python3 -m unittest discover -s scripts/ui-review/tests -t scripts/ui-review/tests -p 'test_*.py'` and `node --test scripts/ui-review/tests/deck-render.test.mjs`.
- New deck coverage is picture-free where possible (`test_words.py`, `test_spec.py`) so it runs in CI.
- Copy rules: the deck's banned words (`spec.py` `BANNED`) apply to every user-facing string a task adds. No "AI hype" copy.
- The approved look (`docs/active/prototypes/2026-08-27-deck-mockup-g.html`) is the only look: amber `--mark`, the theme's font, the framed `.deck`.
- Old answers files (with `note_kind`, with `sections`) must still load; nothing is rewritten on disk except the one mascot spec in Task 9.
- Reading `~/.claude/youcoded-appearance.json` is allowed (plain file, not held open). Never touch anything under `~/.config/youcoded/`.

## File map

| File | Responsibility after this plan |
|---|---|
| `scripts/ui-review/deck/spec.py` | load, validate, `is_question`, `pages`, page markers, question refusal rules, live theme |
| `scripts/ui-review/deck/build.py` | `deck_data` emits `pages` and question fields; strips `_comment` |
| `scripts/ui-review/deck/serve.py` | answers/summary without `note_kind` |
| `scripts/ui-review/deck/page.js` | pages rendering, question card, no tags |
| `scripts/ui-review/deck/page.css` | reading column, question card, pros/cons, badge, header and side-column fixes |
| `scripts/ui-review/deck/page.html.tmpl` | no tag row |
| `scripts/ui-review/deck/render.mjs` (new) | Chrome/CDP driver + page renderer used by tests and `preview` |
| `scripts/ui-review/deck/preview.py` (new) | `preview` command: build → render → contact sheet |
| `scripts/ui-review/deck/selfie.py` (new) | `selfie` command: fixture deck rendered at two code versions → an Approve deck |
| `scripts/ui-review/deck/fixture/selfie.json` (new) | the fixture deck with every kind |
| `scripts/ui-review/templates/*.json` | one template per kind |
| `scripts/ui-review/deck/AUTHORING.md` (new) | every field of every kind |
| `.claude/rules/review-deck.md` (new) | the chooser and the rules |
| `scripts/ui-review/tests/test_words.py`, `test_spec.py`, `test_cli.py`, `test_build.py`, `deck-render.test.mjs`, `fixture.py` | tests |

Task order: 1, 2, 4, 5, 8 are independent of each other; 3 needs 2; 6 needs nothing; 7 needs 6 and 8; 9 needs everything; 10 closes.

---

### Task 1: Remove the note tags

**Files:**
- Modify: `scripts/ui-review/deck/page.html.tmpl` (the `<span class="tags">` row)
- Modify: `scripts/ui-review/deck/page.js` (`NOTE_KIND`, `paintState` tag lines, the `#note` input handler's `note_kind` lines, the `#tags` click handler, `summary()`'s `tag`, `lockSubmitted`'s `.tag`, `renderResponses`'s `.kind` span)
- Modify: `scripts/ui-review/deck/page.css` (`.tags`, `.tag`, `.compact .controls .tags`, `.responses .kind`)
- Modify: `scripts/ui-review/deck/serve.py` (`NOTE_KIND`, `summary()`)
- Modify: `scripts/ui-review/contract-agent.md` (§ "How an answer becomes a row")
- Modify: `.claude/rules/feature-flow.md` (the untagged-note sentence and its guard line)
- Modify: `.claude/skills/ui-mockup/SKILL.md` ("After approval" step 4)
- Test: `scripts/ui-review/tests/test_words.py` (`test_summary_names_the_note_tag` → `test_summary_prints_the_note_plainly`), `scripts/ui-review/tests/deck-render.test.mjs` (the words test's tag block, the finish-screen test's `[just noting]` match)

**Interfaces:**
- Produces: `serve.summary(spec, state)` prints `Q-1 pick a — "but smaller"` with no bracketed tag; an answers entry is `{v, pick?, note?, seconds, theme, zoom}`. A stored `note_kind` is ignored everywhere.

- [ ] **Step 1: Change the tests first.** In `test_words.py` replace the tag assertions with `self.assertEqual(lines[1], 'Q-1 pick a — "but smaller"')` and `self.assertEqual(lines[3], 'Q-3 yes — "fine"')`, and add one line that feeds `note_kind: 'later'` in the state and asserts the same plain output (an old file still reads). In `deck-render.test.mjs`: delete the `#tags` assertions and the `.tag[data-kind=later]` click in the words test; assert `document.querySelector('#tags')` is `null`; in the finish-screen test change the regex to `/amber is strong/` and assert no `.kind` element in `#responses`.
- [ ] **Step 2: Run** `cd scripts/ui-review/tests && python3 -m unittest test_words` — expect the two summary assertions to FAIL.
- [ ] **Step 3: Remove the machinery** in the six files listed. In `page.js`'s note input handler keep only: build `a` with the new `note`, store, `paintState()`, debounce `save()`. In the contract agent replace the three tag bullets with: "`yes` with a note → one row; the note is quoted in `note`. A note that asks for a change is not part of the row — list it under `## Not covered` for the next round to ask." In the feature-flow rule delete the "A note with no tag…" sentence and its `(untagged-note rule: …)` guard line. In the skill delete step 4 and renumber.
- [ ] **Step 4: Run** `python3 -m unittest test_words test_spec test_live test_contract` and `node --test scripts/ui-review/tests/deck-render.test.mjs` — expect PASS. Then `rg -n "note_kind|NOTE_KIND|just noting|fix later|fix now" scripts/ui-review .claude CLAUDE.md docs/active/specs/2026-09-01-feature-flow-design.md` — expect no hits outside `docs/active/specs/2026-09-01-feature-flow-design.md` (leave that design doc's history alone) and answers files.
- [ ] **Step 5: Commit** `feat(deck): a note is a note — the fix now / fix later / just noting tags are gone (Destin, 2026-09-04)`.

---

### Task 2: The question step — fields, refusal rules, the card

**Files:**
- Modify: `scripts/ui-review/deck/spec.py` (`_validate_words`, `_validate_options`, new `is_question`, new constants)
- Modify: `scripts/ui-review/deck/build.py` (`_option`, `_words_step`)
- Modify: `scripts/ui-review/deck/page.js` (`render()`'s `optionCard` and the words branch of `#cards`)
- Modify: `scripts/ui-review/deck/page.css`
- Modify: `scripts/ui-review/tests/fixture.py` (`words_spec`: Q-1 and Q-2 gain `today/problem/proposal`, options gain `pros`/`cons`, Q-1's `(recommended)` in the label becomes `"recommended": true`)
- Test: `scripts/ui-review/tests/test_words.py`, `scripts/ui-review/tests/deck-render.test.mjs`

**Interfaces:**
- Produces in `spec.py`: `is_question(step) -> bool` (words step, not a contract, with a `today` key); `INLINE_LABELS = ('today:', 'proposal:', 'problem:', 'pro:', 'pros:', 'con:', 'cons:', 'downside:', 'upside:')`; `QUESTION_FIELDS = ('today', 'problem', 'proposal')`.
- Produces in `build.py`: a question step's deck data carries `today`, `problem`, `proposal`, and each option `{id, label, summary, pros: [], cons: [], recommended: bool, measured, cost}`; `kind` is `'decide'` when options exist, `'question'` when the step asks Yes / No / Don't know (no options, has `today`).
- Produces in `page.js`: with `kind === 'question'` the answer buttons are `Yes` / `No` / `Don't know` (`data-v` = `yes` / `no` / `other`, the third with `data-dk="1"` so the summary prints `don't know` instead of `other`); the info block renders `<section class="card part"><h3>Today</h3><p>…</p></section>` for each of the three parts, then the option cards. An option card shows `<ul class="pros">` / `<ul class="cons">` and, when recommended, `<span class="badge">Recommended</span>` beside the letter.

- [ ] **Step 1: Write the failing tests** in `test_words.py`:
  - `test_question_needs_today_problem_proposal`: a words step with `options` and no `today` → errors contain `Q-1: missing today (a question says what exists, what goes wrong, and what would change — today / problem / proposal)`.
  - `test_recommended_in_a_label_is_refused`: label `"In the friends list (recommended)"` → error `Q-1/a: "(recommended)" in a label — set "recommended": true on the option instead`.
  - `test_inline_labels_are_refused`: `summary: "Today: nothing. Pro: fast."` → two errors naming the field and the label (`Q-1/a: summary contains "Today:" — put it in the step's today field`, `… "Pro:" — put it in pros`).
  - `test_one_recommended_at_most`: two options recommended → error `Q-2: two options are recommended — at most one`.
  - `test_option_needs_pros_cons_or_summary`: an option with only a label → error `Q-2/b: an option needs pros, cons or a summary`.
  - `test_statement_is_exempt`: Q-3 (yes/no relabels, `changed`/`notice`) still validates with no `today`.
  - `test_deck_data_carries_the_parts`: `deck_data(spec, {})['steps'][0]` has `today`, `problem`, `proposal`, `options[0]['pros'] == [...]`, `options[0]['recommended'] is True`; a step with `today` and no options has `kind == 'question'`.
- [ ] **Step 2: Run** `python3 -m unittest test_words` — expect FAIL (the new fields are unknown).
- [ ] **Step 3: Implement in `spec.py`.** `is_question`. In `_validate_words`, after the contract branch: if `is_question(st)` or `st.get('options')` (a words step with options is always a question): require `QUESTION_FIELDS`; run `_validate_options(..., minimum=1)` when options exist; scan `today/problem/proposal` and each option's `summary` for `INLINE_LABELS` (case-insensitive, at a word boundary, a colon after) and emit the field-naming error; refuse `recommended` in any label (regex `\(?recommended\)?` case-insensitive); count `recommended: true` across options. In `_validate_options` relax `summary` to "at least one of pros / cons / summary". Extend `OPTION_TEXT_FIELDS` scanning of banned words to each `pros`/`cons` line. A words step with neither options nor `today` keeps the statement rule (`changed`/`notice`).
- [ ] **Step 4: Implement in `build.py`.** `_option` adds `pros`, `cons`, `recommended`. `_words_step` copies `today/problem/proposal` when present and sets `kind = 'question'` for a question without options.
- [ ] **Step 5: Implement in `page.js` / `page.css`.** Parts as cards with eyebrow headings (`Today`, `The problem`, `Proposal`) — reuse `.card h3`. Option card: letter + optional badge, label, summary if any, pros list (`li::marker` green `--yes`), cons list (red `--no`), then `cost`/`measured` as today. `renderAnswers`: `kind === 'question'` → three buttons. `summary()` and `ANS_LABEL` print `don't know` for `other` with `dk`. Keep the words layout for now (Task 3 replaces it).
- [ ] **Step 6: Update `fixture.py` `words_spec`** to the new shape and extend the render test's words case: `.card.part` count is 3 on Q-1, `.badge` exists on option `a`, `.pros li` count is 2.
- [ ] **Step 7: Run** the CI five + `node --test scripts/ui-review/tests/deck-render.test.mjs` — expect PASS.
- [ ] **Step 8: Commit** `feat(deck): the question step carries today / problem / proposal and options with pros and cons; the builder refuses the inline version`.

---

### Task 3: Question pages

**Files:**
- Modify: `scripts/ui-review/deck/spec.py` (`is_page`, `pages`, validation)
- Modify: `scripts/ui-review/deck/build.py` (`deck_data` emits `pages`)
- Modify: `scripts/ui-review/deck/page.js` (`render`, `paintState`, `go`, `record`, `openDialog`, `renderResponses`, the `#steps` strip)
- Modify: `scripts/ui-review/deck/page.css`, `scripts/ui-review/deck/page.html.tmpl`
- Modify: `scripts/ui-review/tests/fixture.py` (`words_spec` gets a page marker before Q-3: `{'id': 'P-2', 'page': 'What we promise', 'intro': 'Statements, not questions.'}`)
- Test: `scripts/ui-review/tests/test_words.py`, `scripts/ui-review/tests/deck-render.test.mjs`

**Interfaces:**
- Produces in `spec.py`: `is_page(step)` (has `page`); `pages(spec) -> list[{'id', 'title', 'intro', 'steps': [step…]}]` for a words-only deck — an implicit first page (`id: 'P-1'`, `title: spec['title']`, `intro: ''`) when the first step is not a marker; `None` for a deck with pictures. Errors: a marker with any field other than `id/page/intro` (`P-2: a page marker carries only page and intro`); a marker in a deck with picture steps (`P-2: pages are for question decks — this deck has pictures`); a marker with no steps after it (`P-2: an empty page`).
- Produces in `build.py`: `DECK.pages = [{id, title, intro, steps: [step ids]}]` or absent. `DECK.steps` still lists only answerable steps (markers are not steps: they get no answer, no summary line, no contract source).
- Produces in `page.js`: when `DECK.pages` exists the deck is in **pages mode**: `cur` indexes pages; `#steps` has one segment per page (class = `done` when every step on it is answered, `part` when some); `#count` reads `page 2 of 3 · 5 of 9 answered`; `#content` gets class `content pages` and `#cards` holds one `<article class="q" data-id="Q-1">` per step, each with its own parts, options, answer buttons (`.ans` with `data-id`), note input (`.note` with `data-id`) — the shared `.controls` row is hidden and `#save` reads `Next page ›` (`Done` on the last). `answer(v, pick, id)` and the note handler take the step id from the clicked element. `record()` banks seconds on every step of the page. `openDialog`'s skipped list still names steps.

- [ ] **Step 1: Failing tests** in `test_words.py`: `test_pages_default_is_one_page` (no markers → one page with all three steps); `test_marker_splits_pages` (marker before Q-3 → two pages, `['Q-1','Q-2']` and `['Q-3']`); the three error cases above; `test_deck_data_has_pages_and_steps_exclude_markers`.
- [ ] **Step 2: Run** `python3 -m unittest test_words` — expect FAIL.
- [ ] **Step 3: Implement `spec.py` + `build.py`.** `validate()` skips markers in the per-step loop except for the marker rules; `no_pictures` ignores markers; `deck_data` filters markers out of `steps`.
- [ ] **Step 4: Implement the page.** CSS: `.content.pages{display:block;overflow:auto}` with `.pages .cards{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:14px}`; page eyebrow + intro at the top; `article.q` is the `.decide` card idiom (panel bg, edge border, `--radius-lg`); `article.q.done{border-color:color-mix(in srgb,var(--yes) 45%,var(--edge))}`; body text 14px in `.pages` (`.pages .card p{font-size:14px}`); the option grid is one column. JS: branch at the top of `render()` on `DECK.pages`; write a `renderPage()` that builds the articles and delegates per-step pieces to the same `optionCard` / parts helpers Task 2 wrote; `paintState()` paints every article on the page; `layout()` sets `document.body.dataset.layout = 'pages'` and `__deckReady`.
- [ ] **Step 5: Extend the render test**: the words deck now opens in pages mode — `document.body.dataset.layout === 'pages'`, two `#steps span`, `.q` count 2 on page 1; click option `a` on Q-1 and `Yes` on… (Q-2 pick `b`); `#count` contains `2 of 3 answered`; `#save` click → page 2 shows Q-3 with `Holds,Fails,Other`; the answers file has both picks; Prev returns to page 1 with both articles painted `on`.
- [ ] **Step 6: Run** CI five + render suite — PASS.
- [ ] **Step 7: Commit** `feat(deck): question decks are pages — every question on one page unless a marker says the thinking shifts`.

---

### Task 4: Header overflow and side-column slicing

**Files:**
- Modify: `scripts/ui-review/deck/page.css` (`.top .where`, `.decide`, `.info`, `.controls`)
- Test: `scripts/ui-review/tests/deck-render.test.mjs`

**Interfaces:** none new. Pins: at 1440×900 and 1280×800 with a 90-character `path`, `#wsub`'s right edge ≤ `.nav`'s left edge; on a decide step with three long options at 1440×900 in `col-right`, `.controls` is inside the viewport and `.info` scrolls (`scrollHeight > clientHeight` allowed, `getBoundingClientRect().bottom` of `.controls` ≤ `innerHeight`).

- [ ] **Step 1: Failing test.** Add a fixture variant in `fixture.py` `make_fixture(..., long_path=True)` that sets every step's `path` to 90 characters and adds a decide step `S-5` (`crop: 'c'`, `highlight: {selector: '#send'}`, three options with 60-word summaries). Test `header never runs under the nav, and the side column scrolls instead of slicing` with the two measurements above, at 1440×900 and 1280×800.
- [ ] **Step 2: Run** `node --test scripts/ui-review/tests/deck-render.test.mjs` — expect FAIL on the header measurement.
- [ ] **Step 3: Fix.** `.top .where{flex:0 1 auto;max-width:40%;min-width:0}` and `.top .where .eyebrow{flex:1 1 auto;min-width:0}` so the ellipsis applies (a flex child needs `min-width:0` to shrink below its content). Side column: `.col-right .decide{display:grid;grid-template-rows:1fr auto;min-height:0}`; `.col-right .info{overflow:auto;min-height:0}`; `.col-right .controls{position:sticky;bottom:0;background:var(--panel)}`.
- [ ] **Step 4: Run** the render suite — PASS. Also re-run `python3 -m unittest discover -s scripts/ui-review/tests -t scripts/ui-review/tests -p 'test_*.py'`.
- [ ] **Step 5: Commit** `fix(deck): a long subtitle truncates instead of running under the nav; the side column scrolls instead of slicing the third option`. Close the roadmap item "Review-deck decide steps cut off their last option" in `docs/roadmap/dev-workspace.md` (delete it; one line in `docs/roadmap/shipped.md` per `ROADMAP.md` → Filing an item).

---

### Task 5: Open on the live app's theme

**Files:**
- Modify: `scripts/ui-review/deck/spec.py` (`live_theme`, `apply_live_theme`, `load_spec`)
- Modify: `scripts/ui-review/deck/build.py` (`build_page` / `deck_data` use the reordered list; a captured-theme check)
- Modify: `scripts/ui-review/review-cards.py` (`--theme` on `build` and `serve`)
- Test: `scripts/ui-review/tests/test_spec.py`, `scripts/ui-review/tests/test_cli.py`

**Interfaces:**
- Produces in `spec.py`: `APPEARANCE_FILE = os.environ.get('YOUCODED_APPEARANCE_FILE') or os.path.expanduser('~/.claude/youcoded-appearance.json')`; `live_theme() -> str | None` (the file's `theme`, `None` when missing/unreadable); `apply_live_theme(spec, override=None, log=lambda m: None) -> str` — returns the theme the deck opens on and mutates `spec['themes']`: `override` wins; else `spec.get('theme') == 'fixed'` keeps the spec order; else the live theme is moved to the front when present in `spec['themes']`, or **inserted** at the front when the deck has no pictures, or, for a picture deck, inserted when `captured(spec, theme)` (every picture step's crop exists for that theme in every run — reuse `image_name` + `os.path.exists` from `build.py`'s check; put the helper in `spec.py` to avoid a circular import: `captured(spec, theme)` walks `spec['steps']`, skipping words/live/clip, and checks `<base>/<images>/<image_name(crop, theme, run)>`); otherwise logs `live theme {t} is not captured in these runs — opening on {spec['themes'][0]}` and leaves the order. A live theme with no tokens (not in `tokens.json`, no manifest under `wecoded-themes/themes/`) logs `live theme {t} has no colours here — opening on …` and leaves the order (check via `build.theme_tokens` guarded with `try/except SpecError` — import inside the function).
- Produces in `review-cards.py`: `build`/`serve` call `apply_live_theme(spec, a.theme, log=print-to-stderr)` right after `load_spec`.

- [ ] **Step 1: Failing tests** in `test_spec.py` (set `YOUCODED_APPEARANCE_FILE` to a temp file in `setUp`, `monkeypatch`-style via `os.environ` and reload of the constant — simplest: make `live_theme()` read the env var at call time): file absent → order unchanged; file says `light` on the words fixture → `spec['themes'][0] == 'light'`; file says `creme` (not in the fixture's `['midnight','light']`), words deck → inserted first; picture fixture (`make_fixture`) with `creme` not captured → order unchanged and the log line contains `not captured`; picture fixture with `light` captured → `light` first; `override='midnight'` wins over the file; `spec['theme'] = 'fixed'` keeps the order. In `test_cli.py`: `build --theme light` on the fixture writes a page whose `<html data-theme="light">`.
- [ ] **Step 2: Run** `python3 -m unittest test_spec test_cli` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the CI five + `test_cli` + `test_build` — PASS.
- [ ] **Step 5: Commit** `feat(deck): the deck opens on the live app's theme (from ~/.claude/youcoded-appearance.json); --theme overrides, "theme": "fixed" pins`.

---

### Task 6: `render.mjs` and `preview`

**Files:**
- Create: `scripts/ui-review/deck/render.mjs`
- Create: `scripts/ui-review/deck/preview.py`
- Modify: `scripts/ui-review/tests/deck-render.test.mjs` (import `cdp` from `../deck/render.mjs`; delete its local copy)
- Modify: `scripts/ui-review/review-cards.py` (`preview` subcommand)
- Test: `scripts/ui-review/tests/deck-render.test.mjs` (a `preview writes one png per page × size × theme and a contact sheet` case), `scripts/ui-review/tests/test_cli.py` (`preview` on a machine with no Chrome exits 2 with the message `preview needs google-chrome-stable on PATH`)

**Interfaces:**
- Produces in `render.mjs`: `export async function cdp(port, w, h)` (moved verbatim: `{send, evaluate, errors, close}`); `export async function renderDeck({url, out, sizes, themes, pages})` — for every page index in `pages` (1-based; a picture deck's steps count as pages), every size, every theme: navigate to `${url}?step=${n}&theme=${t}`, wait for `window.__deckReady`, screenshot (`Page.captureScreenshot`, png) to `${out}/p${n}-${t}-${w}x${h}.png`; returns `{files: [...], errors: [...]}`. CLI form: `node deck/render.mjs --url U --out DIR --sizes 1440x900,1280x800 --themes midnight,light --pages 3` printing the JSON result.
- Produces in `preview.py`: `preview(spec, sizes, themes, out, log) -> int`: `build()` the deck (import from the CLI module is circular — so `review-cards.py` calls `build(spec)` itself first, then `preview.render(spec, …)`), serve it on a free loopback port **without** opening a browser or taking the lock (`make_server` + a thread; stop after), call `render.mjs`, then `magick montage <files> -tile <len(themes)>x -geometry +6+6 -background '#111' <out>/contact.png`; prints every file and `contact: <path>`; exit 1 if `errors` is non-empty (print them). Default `out` = `<spec dir>/preview/`. Default sizes `1440x900,1280x800,1024x768`; default themes = the deck's first two.
- Produces in `review-cards.py`: `preview <spec> [--sizes] [--themes] [--out]`.

- [ ] **Step 1: Lift `cdp`** into `render.mjs` and make the test import it. Run the render suite — PASS (pure move).
- [ ] **Step 2: Failing test** for `renderDeck` using the words fixture (2 pages after Task 3) at two sizes and two themes: 8 files exist, all non-empty, `errors` empty. And the `test_cli` no-Chrome case (set `PATH` to a temp dir for the call).
- [ ] **Step 3: Implement** `renderDeck`, `preview.py`, the subcommand.
- [ ] **Step 4: Run** the render suite + `test_cli` — PASS. Run `python3 scripts/ui-review/review-cards.py preview docs/active/design/2026-09-04-linux-buddy-helper/linux-buddy-helper.questions.json --out /tmp/claude-1000/-home-destin-youcoded-dev/d3be01a5-97db-4ff2-8e07-3ad6b0b27099/scratchpad/preview-check` and **look at `contact.png`** (Read tool) — the header must not overlap, the question pages must show the parts.
- [ ] **Step 5: Commit** `feat(deck): preview — every page of a deck as pictures, so a session looks before it serves`.

---

### Task 7: The fixture deck and `selfie`

**Files:**
- Create: `scripts/ui-review/deck/fixture/selfie.json` and `scripts/ui-review/deck/fixture/make_runs.py` (moves the synthetic-run half of `tests/fixture.py` `make_fixture` here; `fixture.py` imports it)
- Create: `scripts/ui-review/deck/selfie.py`
- Modify: `scripts/ui-review/review-cards.py` (`selfie` subcommand)
- Test: `scripts/ui-review/tests/test_cli.py` (`selfie --dry-run` writes the spec), `deck-render.test.mjs` (`the selfie deck renders every kind without a console error`)

**Interfaces:**
- The fixture is TWO specs, because one deck has one `runs` map. `selfie.json` has `runs: {before, after}` and covers Approve (S-1, the red block), Choice (two variants: crops `c` and a second crop `d` = `'300x160+100+100'`), Decide, Clip (only when ffmpeg exists — `make_runs.py` records the two 1-second clips as `fixture.py` does today), and Contract (three rows, sources pointing at `selfie-questions#Q-1` etc.). `selfie-questions.json` is words-only with two pages: a Yes / No / Don't know question, a three-option question with a recommended option, a marker, then a statement with relabels. Brief is covered by a third tiny spec `selfie-brief.json` with `runs: {today}` and one step. Live is **not** in the fixture (it needs the workbench; spec §9 non-goal).
- `selfie.py`: `selfie(before_ref, out, log, dry_run=False) -> int`: (1) `make_runs.make(out/'runs')`; (2) copies the two fixture specs into `out/deck/`, pointing `runs` at the synthetic runs; (3) `git worktree add --detach out/before <before_ref>` (of the workspace repo; `git -C <workspace root>`), and for each of `before`/`after` (after = this checkout): `python3 <tree>/scripts/ui-review/review-cards.py build` both specs, then `preview`-style render (`render.mjs` from the **after** tree, so the driver is one version) at `1440x900` and `1024x768`, themes `midnight,light`, into `out/shots/<before|after>/`; (4) writes `out/selfie-review.json`: `runs: {before: out/shots/before, after: out/shots/after}`, `images: 'images'`, one Approve step per rendered page (`crop` names registered in the spec's own `crops` as the whole image, `highlight: 'auto'`, `headline: '<deck> page n at WxH in <theme>'` ≤25 words, `changed: 'The deck code on this branch, against origin/master.'`, `notice: 'Anything boxed is what moved.'`), themes `['midnight','light']` mapped by file naming — the simplest route: name the rendered files so `crops.image_name(crop, theme, run)` (which returns `f'{crop}--{theme}--{run}.png'`) resolves them, i.e. copy `render.mjs` output into `out/images/<crop>--<theme>--<run>.png` where `crop` is `<deck>-p<n>-<w>x<h>` and register each such crop in the selfie spec's own `crops` map as the whole image; (5) `serve` it unless `dry_run`; (6) `git worktree remove --force out/before` in a `finally`.
- `review-cards.py`: `selfie [--before REF] [--out DIR] [--dry-run] [--no-open]`.

- [ ] **Step 1: Failing test** (`test_cli`): `selfie --dry-run --out tmp` exits 0 and writes `selfie-review.json` with ≥ 8 steps whose `runs` folders exist (render skipped when Chrome is absent — the dry run only lays out the spec and the runs; assert on the spec, not on pictures).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Keep `make_runs.py` deterministic (same colours, same rectangles) so the pixel diff between `before` and `after` is only the deck's own change.
- [ ] **Step 4: Run** `test_cli` + the render suite (the new case builds `selfie.json` and `selfie-questions.json` from the fixture folder and opens every page: no console errors) — PASS. Then run the real thing: `python3 scripts/ui-review/review-cards.py selfie --before origin/master --dry-run --out <scratchpad>/selfie` and inspect the spec.
- [ ] **Step 5: Commit** `feat(deck): selfie — the deck reviewed on a deck (fixture of every kind, rendered at origin/master and here, boxed by pixel diff)`.

---

### Task 8: Templates for every kind

**Files:**
- Create: `scripts/ui-review/templates/approve.json`, `brief.json`, `choice.json`, `decide.json`, `clip.json`, `live.json`, `questions.json` (keep `contract.json`)
- Modify: `scripts/ui-review/deck/spec.py` (`load_spec` strips `_comment` keys recursively)
- Test: `scripts/ui-review/tests/test_build.py` (`every template validates`), `test_spec.py` (`_comment keys are stripped`)

**Interfaces:** each template is a complete two-step spec with a `_comment` on the deck and on every field, in plain words ("headline: what he SEES, ≤25 words, no code words"). Picture templates use crop names that exist in `crops.json` and `runs` paths `runs/before` / `runs/after` relative to the spec; `validate()` must pass on each (it does not need the pictures — `build` does). `questions.json` shows one page marker, one Yes / No / Don't know question, one three-option question with `recommended`.

- [ ] **Step 1: Failing test**: for each file in `templates/`, `load_spec` + `validate` → no errors; the `_comment` keys are absent after load.
- [ ] **Step 2: Run** `python3 -m unittest test_build test_spec` — FAIL (no files; `_comment` unknown).
- [ ] **Step 3: Write the templates and the stripping.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `docs(deck): a template per step kind, with every field explained in place`.

---

### Task 9: Instructions, retirement, conversion

**Files:**
- Create: `.claude/rules/review-deck.md`, `scripts/ui-review/deck/AUTHORING.md`
- Modify: `scripts/ui-review/README.md` (the `review-cards.py` table cell → three lines + pointer to AUTHORING.md), `CLAUDE.md` (the two paragraphs named in the spec §7), `.claude/skills/ui-mockup/SKILL.md` ("Before drawing anything"), `.claude/rules/feature-flow.md` (the words-deck invariant names the fields; `paths` unchanged), `docs/MAP.md` (the rig row), `docs/active/design/2026-09-04-mascot-restyle/mascot-restyle.questions.json` (converted), `docs/active/specs/2026-09-01-feature-flow-design.md` (a one-line note at §5 pointing to this spec; do not rewrite history)
- Delete: `scripts/questions/serve.py` (and the empty folder)
- Memory: `/home/destin/.claude/projects/-home-destin-youcoded-dev/memory/feedback-review-page-format.md` (append the page rule and the no-tags decision; `MEMORY.md` hook line updated)

**Interfaces:** the rule's `verify:` block anchors `scripts/ui-review/templates/questions.json`, `scripts/ui-review/deck/AUTHORING.md`, `scripts/ui-review/deck/preview.py`, `scripts/ui-review/deck/selfie.py`, and `test: scripts/ui-review/tests/test_words.py`. `paths`: `docs/active/design/**/*.json`, `docs/active/reviews/**/*.json`, `scripts/ui-review/deck/**`, `scripts/ui-review/templates/**` (plain root form, like feature-flow.md).

- [ ] **Step 1: Write the rule** (≤600 words): the chooser table from the spec §4 verbatim, then five invariants in the rule format (invariant · why · guard): pages (more per page; a marker only where the thinking shifts), the four parts and the refusal rules, preview before serve, selfie before merging a change under `deck/`, the live theme default. End with the pointer to AUTHORING.md.
- [ ] **Step 2: Write AUTHORING.md**: every field of every kind (one table per kind), the page-marker grammar, the answers file shape, the commands (`build`, `serve`, `wait`, `preview`, `selfie`, `contract-check`, `acceptance`), and "what the summary looks like".
- [ ] **Step 3: Convert the mascot spec**: `sections[].questions[]` → `steps` with a marker per section (`page` = section title, `intro` = section intro), each question → `{id, words: true, surface: 'Mascots', path: <area>, headline: <a question ≤25 words written from the proposal>, today, problem, proposal, options: [{id: 'a'…, label, pros, cons}]}`; keep every `id` so `mascot-restyle.questions.answers.json` still matches. `build` it and `preview` it; look at the contact sheet.
- [ ] **Step 4: Edit the other docs**, delete `scripts/questions/`, update memory. Run `node scripts/audit-anchors.mjs` and `node scripts/roadmap-check.mjs` — both clean. `rg -n "scripts/questions" . --glob '!docs/archive/**' --glob '!worktrees/**'` → no hits.
- [ ] **Step 5: Commit** `docs(deck): one rule to pick a step kind, AUTHORING.md, the plain questions page retired, the mascot deck converted`.

---

### Task 10: Verify, then review on the deck

- [ ] **Step 1:** `cd scripts/ui-review/tests && python3 -m unittest test_spec test_tokens test_live test_words test_contract`; `python3 -m unittest discover -s scripts/ui-review/tests -t scripts/ui-review/tests -p 'test_*.py'`; `node --test scripts/ui-review/tests/deck-render.test.mjs`; `bash scripts/ui-review/tests/close-out-contract.test.sh`; `node scripts/check-doc-commands.mjs --local`. All green, outputs pasted into the handoff.
- [ ] **Step 2:** `python3 scripts/ui-review/review-cards.py selfie --before origin/master` in the background — this is the review Destin answers. Also `preview` the converted mascot deck and the linux-buddy questions deck and read both contact sheets yourself first.
- [ ] **Step 3:** Announce the deck URL in chat with the paths of the contact sheets. Do not merge; wait for his answers.
