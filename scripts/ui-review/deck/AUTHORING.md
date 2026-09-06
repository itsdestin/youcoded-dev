# Authoring a review deck

Every field of every step kind, the page grammar, every refusal the builder makes, the answers
file, the printed summary and every command. Read on demand; the short version — which kind to
pick, and the six rules — is `.claude/rules/review-deck.md`. Design:
`docs/active/specs/2026-09-04-review-deck-consistency-design.md`, on top of
`docs/archive/specs/2026-08-27-review-deck-v2-design.md` and
`docs/active/specs/2026-09-01-feature-flow-design.md`.

Copy a template from `scripts/ui-review/templates/` — one per kind, every field filled and
explained in place. `_comment` keys (at any depth, including `_comment_<field>`) are stripped
when the deck is built, so leave them or delete them as you like.

## Where a deck lives, and what it is called

A feature's decks sit in `docs/active/design/<date>-<feature>/`, named
`<feature>.<round>.json` — `.questions.json`, `.review.json`, `.review-2.json`,
`.contract.json`. The built page, the answers and any rotated older answers land beside the
spec. Answers files are committed (they are the record of Destin's decisions); `preview/`,
`*.serve.json` and `*.workbench.log` are scratch and are ignored.

## Deck-level fields

| Field | Required | What it is |
|---|---|---|
| `title` | yes | what the deck is about, in his words. Heads every page, and titles the first page of a question deck that opens with no marker |
| `key` | yes | short name; his answers are saved under it, so keep it stable across rounds |
| `out` | yes | the HTML file `build` writes, beside the spec |
| `steps` | yes | the steps, in the order he reads them |
| `images` | pictures only | folder the cut crops land in, relative to the spec. Must contain the spec's own name, or two decks overwrite each other |
| `runs` | pictures only | one entry (`{"today": …}` — a brief) or two (`{"before": …, "after": …}`), each a `run-review.sh` output folder |
| `labels` | no | renames the run captions, e.g. `{"before": "Round 1", "after": "Round 2"}` |
| `themes` | no | which palettes the deck offers; defaults to all six. The first one is what it opens on (see Themes below) |
| `theme` | no | only `"fixed"`, which keeps the deck on its own theme order |
| `crops` | no | extra crop regions this deck needs: `{"name": ["<plan>", "<shot>", "WxH+X+Y"]}` on the 1440x900 shots. Shared names come from `scripts/ui-review/crops.json` |
| `live` | live only | `{"worktree": "<name>", "paneWidth": 460}` — the build every pane comes from |
| `branch` | contract | the branch the contract will be built on |
| `sources` | contract | `{deck key: spec file}` for every deck a row may point back at |

Fields on every step: `id` (unique, never reused), `surface` (the part of the app, in his
words), `path` (how he would get there), `headline` (one sentence, 25 words max, no code
words). A step may carry its own `themes` when its picture exists in one palette only.

## The step kinds

### Approve — a change he can see (`approve.json`)

Two runs; the rig boxes the pixels that differ.

| Field | Required | What it is |
|---|---|---|
| `crop` | yes | which region of the screenshots to show |
| `changed` | yes | the *What changed* card — the real difference, one or two sentences |
| `notice` | yes | the *You'll notice* card — what is different for him while using it |
| `risk` | no | the *Risk* card. Keep it to one sentence |
| `measured` | no | a number that proves it (must contain a digit) |
| `highlight` | no | `"auto"` (the default on two runs), `{"text": "…"}`, `{"selector": "…"}` or `{"box": [x, y, w, h]}` |

He answers **Yes keep it / No revert it / Other**.

### Brief — something not built yet (`brief.json`)

The same fields with ONE run (`runs: {"today": …}`), so the buttons read **Yes build it / No
leave it / Other**. `highlight` is required: with one picture there is nothing to diff.

### Choice — several pictures of one thing (`choice.json`)

`variants[]` instead of `crop`/`changed`/`notice`; at least two. Pictures come from the deck's
last run.

| Variant field | Required | What it is |
|---|---|---|
| `id` | yes | what his answer records |
| `label` | yes | the design's name, two or three words |
| `crop` | yes | this design's own picture |
| `summary` | no | one or two sentences on what it is and what it costs |
| `measured` / `risk` / `highlight` | no | a number, this design's own risk, a box inside its picture |

He **picks one**, or *None of these* / Other.

### Decide — written options over one picture (`decide.json`)

`crop` + `highlight` (required — one picture, nothing to diff) + `options[]` (at least two on a
picture deck). Option fields are the question option fields below, plus `cost` (what taking it
costs). He **picks one**, or Other.

### Clip — motion, hover, a transition (`clip.json`)

`clip` is a scene name (files at `<images>/clips/<name>--<run>.webm` with a `.webp` poster
beside each, made by `scripts/ui-review/record-pair.sh`) or `{"before": "…", "after": "…"}`
paths. Make the recordings first; `build` refuses a step whose files are missing. For anything
he should DRIVE, use Live instead.

### Live — panes of the running app (`live.json`)

Deck-level `live.worktree` names the build; a step's `live` is `{"surface", "round",
"candidate"}` — `round` is required, because candidate names repeat across rounds. `variants[]`
(each with its own `candidate`) makes it a pick-one; without them it is yes/no. Four panes is
the cap. `serve` boots that worktree's workbench; `--no-live` leaves a workbench you already
started alone.

### Question — words only (`questions.json`)

`"words": true` and no picture of any kind.

| Field | Required | What it is |
|---|---|---|
| `headline` | yes | the question itself, 25 words max |
| `today` | yes | what exists now — which part of the app, what it does for him |
| `problem` | yes | what goes wrong or is missing, as he experiences it |
| `proposal` | yes | what would change, as he would notice it. With no options, say what Yes / No / Don't know each lead to |
| `options[]` | no | the written answers (see below); one is enough, three is usually the most he can hold |
| `risk` | no | the *Risk* card |

| Option field | Required | What it is |
|---|---|---|
| `id` | yes | what his answer records |
| `label` | yes | two or three words. Never write "(recommended)" into it |
| `pros[]` / `cons[]` | one of these, or `summary` | short lines about HIS experience, never the code |
| `summary` | no | a sentence beside (or instead of) the lists |
| `measured` | no | a number (must contain a digit) |
| `recommended` | no | `true` on at most ONE option; the page badges it |

With options he **picks one**, or Other. Without them: **Yes / No / Don't know**.

### Statement — something you assert (also `"words": true`)

A words step with `changed` + `notice` and no `today`. `yes` / `no` relabel the buttons (under
five words each). Exempt from the three-part rule; this is what acceptance rows are.

### Contract — the definition of done (`contract.json`)

One step carrying `rows[]`. Each row: `id`, `statement` (25 words max — it becomes the
acceptance deck's headline word for word), `checkedBy` (`mechanical` | `deck` | `live-app` |
`human`), `threshold`, `source` (`<deck key>#<step id>`, or `review:<file>#<finding id>` for an
accepted review finding), `guard` (required on a mechanical row), optional `note`. He answers
**Yes that is done / No something is missing**.

### Acceptance — the graded contract

Not hand-written: `review-cards.py acceptance <contract>` merges
`<feature>.contract.verdicts.json` into a deck of statement steps, one per row.

## Page markers — how a question deck is split

A deck whose every step is words-only renders as scrolling PAGES rather than one step per
screen. Every question shares one page until a marker starts the next:

    {"id": "P-2", "page": "Where saved searches live", "intro": "one line"}

- `page` is the page's title and must say something; `intro` is optional; **no other field is
  allowed** — a marker that carries anything else was meant to be a step.
- With no marker before the first question, the first page is titled with the deck's `title`.
- A marker's page runs to the next marker, so two markers in a row is an empty page and is
  refused.
- Markers belong only in a deck with no pictures.
- The progress bar counts pages; Prev / Next move between pages. A marker gets no answer row,
  no summary line and cannot be a contract `source`.
- Err on MORE questions per page: a page is one set he can hold in his head at once.

## What the builder refuses

`build` writes no page at all when any of these hold; it names the step and the field to use.

Every step: a missing `id`, `surface`, `path` or `headline`; a duplicate `id`; a headline over
25 words; a code word (`token`, `selector`, `component`, `reducer`, `handler`, `prop`, `ipc`,
`react`, `dom`, `css class`, `tailwind`, `primitive`, `z-index`) in any text he reads; `themes`
that is not a non-empty list.

Questions:

- `… missing today (a question says what exists, what goes wrong, and what would change — today / problem / proposal)`
- `… today contains "Proposal:" — put it in the step's proposal field` — the inline labels
  `Today:`, `Problem:`, `Proposal:`, `Pro:`, `Pros:`, `Con:`, `Cons:`, `Upside:`, `Downside:`
  are refused inside `today`, `problem`, `proposal` and `summary`, by field name.
- `… "(recommended)" in a label — set "recommended": true on the option instead`
- `… two options are recommended — at most one`
- `… an option needs pros, cons or a summary`
- `… a words step has no crop — there is no picture` (also `clip`, `highlight`, `variants`, `live`)

Page markers: `a page marker carries only page and intro`; `a page marker needs a title in
"page"`; `pages are for question decks — this deck has pictures`; `an empty page`.

Pictures: a missing crop file, an unknown crop name, an unresolved highlight box, `a one-run
deck needs a highlight`, `"auto" highlight needs a before and an after run`.

Warnings (printed, but the page is still written): more than three options; a hand-placed
`box`; a `measured` with no digit; a `risk` over 40 words; an `images` folder that does not
contain the spec's name.

## The answers file

`<spec stem>.answers.json`, written on every click and again on Submit:

    {"deck": "<key>",
     "started": "<iso>", "submitted": "<iso>",
     "answers": {"<step id>": {"v": "yes|no|other|pick",
                               "pick": "<option or variant id>",   // when v is "pick"
                               "dk": true,                          // "Don't know" (Other with a flag)
                               "note": "…"}}}

A note carries no tag: a note is a note (Destin, 2026-09-04). Old files carrying `note_kind`
still load; the field is ignored. Serving a deck whose answers were already submitted moves the
old file aside as `<stem>.answers.<stamp>.json` and starts a fresh review.

## The printed summary

`serve` prints this when he submits (`wait` and `record` print the same), and its exit is the
signal that the review is over:

    saved-searches-questions · submitted 2026-09-05 04:58 · 2 yes · 0 no · 1 other · 2 picked · 0 skipped
    Q-1 yes
    Q-2 pick under-box — "keep it to three"
    Q-3 don't know

One line per step, in spec order, page markers skipped. `pick <id>` is the option he chose,
`none` is *None of these* on a pick-one, `other` is Other and `don't know` is the third button
on a yes/no question.

## Commands

    python3 scripts/ui-review/review-cards.py <command> …

| Command | What it is for |
|---|---|
| `build <spec> [--theme SLUG]` | cut the crops, resolve every highlight, write the page. Refuses (no page) on any rule above |
| `preview <spec> [--sizes 1440x900,1280x800,1024x768] [--themes …] [--out DIR]` | the built deck as pictures: one PNG per page × size × theme plus `contact.png`, in `<spec dir>/preview/`. **Look at the contact sheet before you serve.** Needs `google-chrome-stable`; exit 2 without it, exit 1 if the page logged an error |
| `serve <spec> [--port N] [--timeout MIN] [--no-build] [--no-live]` | build, serve on 127.0.0.1, save answers as they arrive, exit when he submits. Prints `[deck] http://…` and **opens nothing** — put that line in chat as the last line of your turn. Run it in the background |
| `wait <spec> [--timeout MIN]` | block on the answers file alone, for a session that no longer holds the `serve` process |
| `record <spec> '<pasted summary>'` | write the submitted answers file from the page's copy box, for a deck he answered as a plain file |
| `selfie [--before <ref>] [--out DIR] [--dry-run]` | the deck reviewed on a deck: renders a fixture carrying every kind with the deck code at `--before` (default `origin/master`) and with this worktree's, then serves an approve deck of the two, boxed by pixel difference. Run it for any change to `page.css`, `page.js`, `page.html.tmpl` or `deck/fixture/` |
| `contract-check <feature>.contract.json` | every row's source resolves to an answered step and every mechanical guard exists (exit 1 lists what does not); then `ok:` / `todo:` lines for the sign-off and the acceptance deck |
| `acceptance <feature>.contract.json` | merge the grader's verdicts into `<feature>.contract.acceptance.json`, ready to serve |

## Themes

A deck opens on whatever theme Destin's app is on, read from
`~/.claude/youcoded-appearance.json` (the app rewrites it on every appearance change; it is a
plain file, never held open, so reading it is inside the live-app safety rule). That theme is
moved to the front of `themes`, or added there when the deck has no pictures or its crops for
that theme already exist. When nothing was shot in it, `build` says so and opens on the spec's
first theme. `--theme <slug>` overrides; `"theme": "fixed"` keeps the spec's own order, for a
deck whose point IS one theme.

## Order of work

1. Copy the template for the kind you need; write the steps.
2. `build` — fix every refusal it names.
3. `preview` — read `preview/contact.png`. A defect you can see there is one he would see.
4. `serve` in the background; put the printed `[deck] http://…` line in chat as the last line
   of your turn, and stop.
5. Its exit is the notification; read the summary it prints.

## Tests

`cd scripts/ui-review/tests && python3 -m unittest test_spec test_words test_contract test_live
test_tokens` (no binaries; also in CI). The renderer and the picture commands need Chrome and
`magick`: `python3 -m unittest discover -s scripts/ui-review/tests -t scripts/ui-review/tests
-p 'test_*.py'` and `node --test scripts/ui-review/tests/deck-render.test.mjs`.
