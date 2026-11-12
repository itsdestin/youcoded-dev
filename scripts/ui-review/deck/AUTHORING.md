# Authoring a review deck

Every field of every step kind, the page grammar, every refusal the builder makes, the answers
file, the printed summary and every command. Read on demand; the short version — which kind to
pick, and the six rules — is `.claude/rules/review-deck.md`. Design:
`docs/archive/specs/2026-09-04-review-deck-consistency-design.md`, on top of
`docs/archive/specs/2026-08-27-review-deck-v2-design.md` and
`docs/archive/specs/2026-09-01-feature-flow-design.md`.

Copy a template from `scripts/ui-review/templates/` — one per kind, every field filled and
explained in place. `_comment` keys (at any depth, including `_comment_<field>`) are stripped
when the deck is built, so leave them or delete them as you like.

## Start here

| Want to… | Read |
|---|---|
| Build and serve any deck, start to finish | "Order of work" (bottom of this file) |
| Ask Destin 4+ questions at once | "Question — words only", "Page markers" |
| Pick which step kind fits | `.claude/rules/review-deck.md`'s table, then "The step kinds" |
| Get a field or refusal exactly right | "Deck-level fields", "What the builder refuses" |
| Know what a submission writes | "The answers file", "What he sees when he submits" |
| Run `build`/`preview`/`serve`/etc. | "Commands" |

## Where a deck lives, and what it is called

A feature's decks sit in `docs/active/design/<date>-<feature>/` **of the session's workspace
worktree** (the path `workspace-start` returned — never the shared `youcoded-dev` checkout, whose
files a session cannot commit; one session built four decks there before noticing, 2026-09-10), named
`<feature>.<round>.json` — `.questions.json`, `.review.json`, `.review-2.json`,
`.contract.json`. The built page, the answers and any rotated older answers land beside the
spec. Answers files are committed (they are the record of Destin's decisions); `preview/` (one folder per deck),
`*.serve.json` and `*.workbench.log` are scratch and are ignored.

## Deck-level fields

| Field | Required | What it is |
|---|---|---|
| `title` | yes | what the deck is about, in his words. Heads every page, and titles the first page of a question deck that opens with no marker |
| `key` | yes | short name; his answers are saved under it, so keep it stable across rounds |
| `out` | yes | the HTML file `build` writes, beside the spec |
| `steps` | yes | the steps, in the order he reads them |
| `images` | pictures only | folder the cut crops land in, relative to the spec. Must contain the spec's own name, or two decks overwrite each other |
| `runs` | pictures only | every capture this deck can show: `today`, `before` and/or `after`, each a `shoot` output folder (`node scripts/shoot/shoot.mjs <screens> --before <branch> --after <worktree> --out runs` writes `runs/before` and `runs/after`), or an old sweep's folder. **Paths resolve from the spec's own folder** — write `runs/after` beside the spec; a workspace-root path such as `docs/active/design/<feature>/runs/after` is looked up UNDER the spec's folder and fails (measured 2026-09-10; a 2026-09-09 note said the opposite and cost one build). A slide shows all of them unless it names its own (below) |
| `labels` | no | renames the run captions, e.g. `{"before": "Round 1", "after": "Round 2"}`; a slide may override its own |
| (run names) | — | `today`, `before`, `after`, or any short lowercase name (`round3`) — a slide comparing with an older round names that run in its own `runs`. `before` always shows left of `after` |
| `themes` | no | which palettes the deck offers; defaults to all six. The first one is what it opens on (see Themes below) |
| `theme` | no | only `"fixed"`, which keeps the deck on its own theme order |
| `crops` | no | extra crop regions this deck needs: `{"name": ["<plan>", "<shot>", "WxH+X+Y"]}` on the 1440x900 shots. Shared names come from `scripts/ui-review/crops.json`. **A `shoot` screen name (`settings/sound`, from `shoot --list`) needs no entry here** — the whole picture is the screen. A name with `/` or `#` is taken as one on sight; a one-word screen (`projects`) is recognised because a run's own `manifest.json` lists it, so shoot it before you validate |
| `live` | live only | `{"worktree": "<name>", "paneWidth": 460}` — the build every pane comes from |
| `branch` | contract | the branch the contract will be built on |
| `stage` | no | `ask`, `design`, `contract`, `review` or `accept` — the tool then checks this deck carries that stage's slide. It never says which OTHER slides are allowed |
| `sources` | contract | `{deck key: spec file}` for every deck a row may point back at |

Fields on every step: `id` (unique, never reused), `surface` (the part of the app, in his
words), `path` (how he would get there), `headline` (one sentence, 25 words max, no code
words). A step may carry its own `themes` when its picture exists in one palette only.

**Two tall pictures stay side by side** (2026-10-08): a before/after of a tall popup is shrunk to fit
the screen beside each other rather than stacked full size — Destin can zoom with + for detail.
The same holds for every **choice**: its designs are never stacked (composite designs too), and three
or more tall designs open at the width that fills the row, the stage scrolling for the rest (2026-10-12).

**`"crop": "<screen>@panel"`** cuts a close-up around that screen's panel in EVERY run and theme, plus
16px — a popup that changed size gets one box covering both without measuring manifests. With no
`highlight` written, a close-up whose change covers most of it boxes each run's own panel (no warning).

**`"alsoChanges": ["Session details", "Resume → Organize"]`** on any slide lists the other screens a
shared change reaches, in an "Also changes" card beside You'll notice — a yes is a yes to all of them.

**A crop's SHAPE decides the page layout, and a tall one hides your Risk card.** The page
tries every arrangement and keeps whichever shows the pictures largest: a wide crop puts
What changed / You'll notice / Risk in a row UNDER the pictures, all three readable; a tall
one puts them in a side column that is only about two cards deep, so the third is cut off
mid-sentence and looks like a rendering fault. Crop to the part that carries your point —
the greyed rows, the one card that changed — not the whole dialog around it. Measured
2026-09-09: a 420x580 crop of a dialog clipped the Risk card at every viewport width and
survived four rounds of shortening the words; recropping to 420x275 fixed it in one.
Cropping the whole window instead is the opposite failure — the pane grows until the
cards fall off the bottom of the screen entirely.

### A slide names the pictures it shows

`runs` on a SLIDE — a list of names the deck captures — says which pictures that slide puts on
screen; without one it shows all of them. `labels` on a slide renames its own captions.

    {"id": "B-1", "crop": "themes", "runs": ["after"], "labels": {"after": "Today"}, …}

One picture is a BRIEF wherever it appears: the buttons read *Yes build it / No leave it* and
`highlight` is required, because there is nothing to diff. Two are an APPROVE: *Yes keep it /
No revert it*, `highlight` defaults to `"auto"`. So one deck now holds a "should we build
this?" slide, a "keep it or revert it?" slide, a written question and the contract — the ask
decides where a deck ends, not the screenshot rule.

**A NEW state that is already built** (offline, incognito, a menu opened — something with no
"before") is still one picture, but it is not a brief: add `"new": true` and the buttons read
*Yes, keep it / No, remove it*. Refused on a two-picture slide (that already reads keep / revert)
and on choice and decide slides. A `"review"` deck counts it as its review slide. WHY (games-social
friction, proposal 5): every new practice state of the Games round reached Destin as "Yes build it"
over something already in the app.

WHY it moved (Destin, 2026-09-06): the capture set is a property of the picture, not of the
deck. While it sat on the deck, a brief slide and an approve slide could never share a page and
he was handed two links for one ask.

## The step kinds

### Approve — a change he can see (`approve.json`)

Two runs; the rig boxes the pixels that differ.

| Field | Required | What it is |
|---|---|---|
| `crop` | yes | which region of the screenshots to show — a `crops` name, a `shoot` screen name, or a close-up of one: `"<screen>@WxH+X+Y"` in the screen's own CSS pixels (the 1440×900 coordinates, whatever density it was shot at) — or a LIST of these laid side by side as one picture (below, "Several screens in one picture") |
| `changed` | yes | the *What changed* card — the real difference, one or two sentences |
| `notice` | yes | the *You'll notice* card — what is different for him while using it |
| `risk` | no | the *Risk* card. Keep it to one sentence |
| `measured` | no | a number that proves it (must contain a digit) |
| `highlight` | no | on a `shoot` screen with one run: the screen's own panel, measured by `shoot` (write none). `"auto"` (the default on two runs), `"panel"` (the screen's own panel in every run — for a whole-page change, where `"auto"` would warn "whole-surface"; on a close-up `screen@WxH+X+Y` it boxes the part of the panel inside the close-up), `{"text": "…"}`, `{"selector": "…"}` or `{"box": [left, top, width, height]}` — **percent of the crop (0–100), not pixels**; the build refuses a box that leaves the picture |

He answers **Yes keep it / No revert it / Other**.

### Brief — something not built yet (`brief.json`)

The same fields over ONE picture — the deck captures one run, or the slide names one of the
deck's with `runs` — so the buttons read **Yes build it / No leave it / Other** (or, with
`"new": true`, **Yes keep it / No remove it**). With one picture there is nothing to diff, so a
legacy crop needs a `highlight`; a `shoot` screen boxes its own panel, and a close-up
(`screen@WxH+X+Y`) or a list of screens is already the focus and gets no box.

### Several screens in one picture

`"crop"` may be a list: each entry is a crop name (a screen, a close-up, a legacy name) or
`{"crop": "<name>", "label": "<four words at most>"}`. The pieces are cut from the same run and
laid side by side, top-aligned, 16 CSS px apart; with any label, a strip over every piece carries
it in the theme's text colour (gaps and strips are see-through, so the deck page shows between).

    "crop": [{"crop": "chat/games#offline@420x200+1010+70", "label": "No internet"},
             {"crop": "chat/games#incognito@420x200+1010+70", "label": "Incognito"}]

Works on approve / brief / decide steps and on a choice variant (each concept a folded + opened
pair). `"auto"` still boxes the change across two runs; `"panel"` and `{"text"}` / `{"selector"}`
are refused (there is no one panel, nothing measured); a hand `box` is percent of the whole
composite. A missing piece is reported by number and the picture is not made. WHY (games-social
friction, proposal 4): three rounds running hand-cut composites into fake `shots-<plan>` folders.

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

Pictures `shoot` can take come from `shoot`. Pictures it cannot (a Remotion still, a frame of a
film, a montage) go in a run folder by hand: `<run>/shots-<plan>/<theme>/<shot>.png`, with the spec's `crops` naming
`["<plan>", "<shot>", "WxH+0+0"]` at the picture's own size. Every run's picture must be the
same size, or the before/after diff cannot box the change.

### Decide — written options over one picture (`decide.json`)

`crop` + `highlight` (required — one picture, nothing to diff) + `options[]` (at least two on a
picture deck). Option fields are the question option fields below, plus `cost` (what taking it
costs). Optional `today` / `problem` / `proposal` draw the question's three cards above the
options, as on a words-only question (before 2026-10-08 a picture decide dropped them silently).
He **picks one**, or Other.

### Clip — motion, hover, a transition (`clip.json`)

`clip` is a scene name (files at `<images>/clips/<name>--<run>.webm` with a `.webp` poster
beside each, made by `scripts/ui-review/record-pair.sh`) or `{"before": "…", "after": "…"}`
paths. Make the recordings first; `build` refuses a step whose files are missing. For anything
he should DRIVE, use Live instead.

### Live — panes of the running app (`live.json`)

Deck-level `live.worktree` names the build — a checkout holding `desktop/`, so for a session
worktree it is `sessions/<key>/youcoded`, not `sessions/<key>` (that fails serve with "not a
checkout with a desktop/ folder"). A pane shows one of two things:

| A pane's `live` (or a variant's) | What it shows |
|---|---|
| `{"surface", "round", "candidate"}` | ONE authored design out of `compare/registry.tsx`. `round` is required, because candidate names repeat across rounds |
| `{"app": "<scenario>"}` | a real screen of the app: `default`, `empty`, `no-providers`, `refused`, `stress`, `site`. Add `"stalled": true` for the parked-turn state |
| `{"view": "<name>"}` | one of the standalone surfaces: `tools`, `compare`, `assistant-final`, `attachments`, `session-pills` |
| `"params": {"key": "value"}` (on an app pane) | extra workbench switches, text to text, e.g. `{"openPage": "page-home", "pagesHome": "connected"}` opens a Pages screen. A step-level `params` and a variant's add up (the variant wins a clash). Keys the pane already sets (`mode`, `child`, `theme`, `latency`, `scenario`, `view`, `stalled`) are refused at build time |

`variants[]` (each naming its own candidate or screen) makes it a pick-one; without them it is
yes/no. Four panes is the cap. An app pane needs no `changed` — nothing changed, it is the app
as it is. ONE app pane with no `paneWidth` and no `height` **fills the stage**, so the whole
screen is usable without scrolling; give it either and it takes that size instead, and a ROW of
panes is a comparison and always keeps its declared size. An optional step-level `hint`
appears **above** the panes in the scrolling comparison area; put operating directions there
when they must be seen before the first interaction. The header's `path` is hidden at laptop
widths and the question cards sit below the panes, so neither can carry those directions.

WHY the app rows exist (Destin, 2026-09-06): a candidate is a SKETCH somebody wrote for one
comparison. Asking him to operate a real screen had no shape at all, so a live slide could only
ever offer drafts of things.

`serve` boots that worktree's workbench; `--no-live` leaves a workbench you already started
alone. Every pane is the renderer against a FAKE backend: real to look at and touch, but no
model answering and nothing saved. For "does it actually work", use a Try-it slide.

### Try it in the real app (`tryit.json`)

A words slide carrying `dev`. Served, it renders an **Open the dev window** button that starts
the instance for you, plus the exact `run-dev.sh` line and a copy button; opened as a plain file
the button is hidden, because there is no server to ask. The page posts the STEP id, never a
command — `serve` rebuilds the line from the spec on disk, so a page cannot ask the server to run
something else. The window it opens is a dev instance on shifted ports with its own profile, and
outlives the deck's server, so submitting does not close what you are still looking at.

| Field | Required | What it is |
|---|---|---|
| `dev.worktree` | yes | the checkout the dev window runs — a worktree name or a branch |
| `dev.label` | no | the window title, so concurrent dev windows are tellable apart. Defaults to the worktree |
| `dev.offset` / `dev.profile` | no | a second instance alongside one already running; pass both or neither |
| `changed` / `notice` | yes | what the dev window runs, and what to watch for |
| `yes` / `no` | no | default to *Yes, it works* / *No, it does not* |

WHY (Destin, 2026-09-06): a live pane cannot show that something WORKS, only how it looks and
feels. The contract's `live-app` rows were therefore answered in chat and written down by hand
— the loose prose the deck exists to replace. This slide puts that verdict in the answers file
with everything else. It is also the slide a `review` stage accepts.

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

With options he **picks one**, or Other. Without them: **Yes / No / Other**.

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

## How he answers: several at once, or words he types

Two fields that are about the ANSWER rather than the picture, so they sit on any slide that
can carry them.

| Field | On | What it does |
|---|---|---|
| `"pick": "several"` | any slide with `options` or `variants` | he may choose more than one; clicking a chosen one again unpicks it. One line above the cards says so. Unpicking the last leaves the slide unanswered |
| `"answer": "words"` | a words slide with nothing to pick | the answer is a line he types. `prompt` is the placeholder |

They land in the answers file as `{"v": "picks", "picks": ["a", "c"]}` and
`{"v": "wrote", "text": "…"}`, and print in the summary as `picks a, c` and `wrote "…"`.

WHY (Destin, 2026-09-06): every slide ended in pick-exactly-one or yes/no, so "A and C, drop B"
and "call it *this*" had nowhere to go but the free note — a paragraph a session has to
interpret, not an answer the tool records as a decision.

## What stage the deck is at

`"stage"` names where in a feature this deck sits, and the build refuses one that is missing
the slide its stage exists for: **ask** needs a question, **design** something to look at and
choose between, **contract** the definition-of-done table, **review** a before/after or a
recording or live panes, **accept** a statement to accept or reject. Nothing else is forbidden —
an ask deck may carry the contract it leads to. Leave `stage` out and nothing is checked.

## Page markers — how a question deck is split

A QUESTION deck — every step words-only, and no contract step — renders as scrolling PAGES
rather than one step per screen. Every question shares one page until a marker starts the next.
A deck that defines or grades done (a `rows` step) is picture-free too but is NOT paged: it
keeps one step per screen, so its table gets the full width and its first question is on the
first screen rather than under a 3,600px table.

    {"id": "P-2", "page": "Where saved searches live", "intro": "one line"}

- `page` is the page's title and must say something; `intro` is optional; **no other field is
  allowed** — a marker that carries anything else was meant to be a step.
- With no marker before the first question, the first page is titled with the deck's `title`.
- A marker's page runs to the next marker, so two markers in a row is an empty page and is
  refused.
- Markers belong only in a question deck — not in one with pictures, not in one with a contract.
- The progress bar counts pages; Prev / Next move between pages. A marker gets no answer row,
  no summary line and cannot be a contract `source`.
- Err on MORE questions per page: a page is one set he can hold in his head at once.

## What the builder refuses

`build` writes no page at all when any of these hold; it names the step and the field to use.

Every step: a missing `id`, `surface`, `path` or `headline`; a duplicate `id`; a headline over
25 words; a code word (`token`, `selector`, `component`, `reducer`, `handler`, `prop`, `props`,
`ipc`, `react`, `dom`, `css class`, `tailwind`, `primitive`, `z-index`) in any text he reads; `themes`
that is not a non-empty list.

Questions:

- `… missing today (a question says what exists, what goes wrong, and what would change — today / problem / proposal)`
- `… today contains "Proposal:" — put it in the step's proposal field` — the inline labels
  `Today:`, `Problem:`, `Proposal:`, `Pro:`, `Pros:`, `Con:`, `Cons:`, `Upside:`, `Downside:`
  are refused inside `today`, `problem`, `proposal` and `summary`, by field name.
- `… "(recommended)" in a label — set "recommended": true on the option instead`
- `… two options are recommended — at most one`
- `… an option needs pros, cons or a summary`
- `… pick must be "one" or "several"`, `… pick "several" needs options or variants to pick between`
- `… a written answer and a list to pick from are two different questions — drop one`
- `… prompt is the placeholder in a written answer — add "answer": "words"`
- `… a words step has no crop — there is no picture` (also `clip`, `highlight`, `variants`, `live`)

Page markers: `a page marker carries only page and intro`; `a page marker needs a title in
"page"`; `pages are for question decks — this deck has pictures`; `pages are for question decks
— this deck defines done (it has a contract step)`; `an empty page`.

Stages: `stage "<x>" is not one of ask, design, contract, review, accept`, `a "<stage>" deck
needs <the slide it exists for>`.

Placeholders: `… headline is still a placeholder — replace the "TODO: …" line with what actually
changed on this page and what Destin will notice`. Any field of any step whose text starts
`TODO:` blocks the build. `selfie` writes them on purpose — see below.

Pictures: a missing crop file, an unknown crop name, an unresolved highlight box, `one picture
and nothing to compare it with — this slide needs a highlight`, `"auto" highlight needs a before
and an after run`, `runs names <x>, which the deck does not capture`.

A list crop: `a list crop lays several pictures side by side — give at least two`, `piece N of the
crop list needs a crop name (a list inside a list is not allowed)`, `piece N of the crop list
carries only "crop" and "label"`, `unknown crop "<x>" in the crop list`, a label over four words or
with a banned word, `"panel" highlight needs ONE shoot screen crop`, and (at crop time) `a picture
made of several screens has no element to measure`.

`"new"`: `"new" is true or absent`, `"new" is for ONE picture with no before — a before/after slide
already reads keep / revert`, `"new" is for a one-picture keep-or-remove slide, not a choice` (or a
decide step).

Warnings (printed, but the page is still written): more than three options; a hand-placed
`box`; a `measured` with no digit; a `risk` over 40 words; an `images` folder that does not
contain the spec's name; **a choice whose pictures are different widths, with a later one wider
than the first** — the page sizes the whole row by the first picture, so the row overflows and the
outer pictures are cut off (`… the row is about N% too wide …`). Crop every design to one size, or
put the widest first. WHY (games-social friction, proposal 6): 340 / 420 / 420 crops cut two
drafts in round 4 and nothing said so.

## The answers file

`<spec stem>.answers.json`, written on every click and again on Submit:

    {"deck": "<key>",
     "started": "<iso>", "submitted": "<iso>",
     "answers": {"<step id>": {"v": "yes|no|other|pick",
                               "pick": "<option or variant id>",   // when v is "pick"
                               "dk": true,                          // only in files from before round 2 ("Don't know"); never written now
                               "note": "…"}}}

A note carries no tag: a note is a note (Destin, 2026-09-04). Old files carrying `note_kind`
still load; the field is ignored. Serving a deck whose answers were already submitted moves the
old file aside as `<stem>.answers.<stamp>.json` and starts a fresh review.

## What he sees when he submits

The step is replaced by a **finish screen**: a tick, "Feedback submitted", and every answer read
back in a table. It exists because the server exits on submit — after that there is nowhere else
to read the answers, and the old behaviour (a greyed-out button on the last step) was
indistinguishable from a click that did nothing. `‹ Back to the deck` and the header's
`Submitted ✓` toggle between the two; the deck itself is read-only from then on. Re-opening a
submitted deck lands on the finish screen, not on a step full of dead buttons.

While a deck is being served, `<spec stem>.serve.json` beside it holds the pid and the URL — a
second `serve` of the same spec refuses rather than rebuilding the page under the running one.
The server's root redirects to the deck and folders never list.

## The printed summary

`serve` prints this when he submits (`wait` and `record` print the same), and its exit is the
signal that the review is over:

    saved-searches-questions · submitted 2026-09-05 04:58 · 2 yes · 0 no · 1 other · 2 picked · 0 skipped
    Q-1 yes
    Q-2 pick under-box — "keep it to three"
    Q-3 other

One line per step, in spec order, page markers skipped. `pick <id>` is the option he chose,
`none` is *None of these* on a pick-one and `other` is Other. (`don't know` appears only when
reading an answers file saved before round 2.)

## Commands

    python3 scripts/ui-review/review-cards.py <command> …

| Command | What it is for |
|---|---|
| `build <spec> [--theme SLUG]` | cut the crops, resolve every highlight, write the page. Refuses (no page) on any rule above |
| `preview <spec> [--sizes 1440x900,1280x800,1024x768] [--themes …] [--out DIR]` | the built deck as pictures: one PNG per page × size × theme (every theme the deck carries, unless `--themes`) plus `contact.png`, in `<spec dir>/preview/<spec name>/` (emptied first, so no other deck's pages sit beside them), plus `contact-<theme>.png` per theme when the deck has several — far easier to read. **Look at the contact sheet before you serve.** Needs `google-chrome-stable`; exit 2 without it, exit 1 if the page logged an error |
| `serve <spec> [--port N] [--timeout MIN] [--no-build] [--no-live]` | build, serve on 127.0.0.1, save answers as they arrive, exit when he submits. Prints `[deck] http://…` and **opens nothing** — put that line in chat as the last line of your turn. Run it in the background |
| `wait <spec> [--timeout MIN]` | block on the answers file alone, for a session that no longer holds the `serve` process |
| `record <spec> '<pasted summary>'` | write the submitted answers file from the page's copy box, for a deck he answered as a plain file |
| `selfie [--before <ref>] [--out DIR] [--dry-run]` | the deck reviewed on a deck: renders a fixture carrying every kind with the deck code at `--before` (default `origin/master`) and with this worktree's, then writes an approve deck of the two, boxed by pixel difference. Run it for any change to `page.css`, `page.js`, `page.html.tmpl` or `deck/fixture/`. **It does not serve.** Every step's `headline` and `changed` come out as `TODO:` placeholders the build refuses: you write, per step, what moved and what he will notice — the commit subjects since `--before` are seeded in each step's `_comment` to start from, and the run ends by listing the steps still to write plus the `serve` command that follows |
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
3. `preview` — read `preview/<spec name>/contact.png` (and single pages when the sheet is too tall to
   read). A defect you can see there is one he would see.
4. `serve` in the background; put the printed `[deck] http://…` line in chat as the last line
   of your turn, and stop.
5. Its exit is the notification; read the summary it prints.

To change a picture on a deck he is looking at, `build` it again and tell him to reload — the
server keeps serving the file it was started on; only a second `serve` of the same spec is refused
(2026-09-09).

A deck he has ALREADY answered is re-served with `serve --no-build` — never rebuilt. Rebuilding
a historical deck means "fixing" the record of a past decision, and ten committed specs
(seven archived, three still under `docs/active/`) no longer build against today's field names.
That they fail loudly is correct; leave them as the record they are.

## Tests

`cd scripts/ui-review/tests && python3 -m unittest test_spec test_words test_contract test_live
test_tokens` (no binaries; also in CI). The renderer and the picture commands need Chrome and
`magick`: `python3 -m unittest discover -s scripts/ui-review/tests -t scripts/ui-review/tests
-p 'test_*.py'` and `node --test scripts/ui-review/tests/deck-render.test.mjs`.

## Added in the 2026-11-09 rethink

Source: Destin's answers in `docs/active/design/2026-11-09-review-deck-rethink/`.

- **One text box per answer.** A question answered by typing (`"answer": "words"`) has no
  separate note box. A calls list has none either.
- **`checked`** (on any question with `today`): one plain sentence saying how and when the
  Today claim was confirmed. Shown behind the small (i) beside "Today". State it for every
  Today you assert; a stale Today was the worst fault in past decks.
- **`picture` + `caption`** (on a written question and on each option): a file beside the
  spec. A question about how something looks carries one. This is an instruction, not a
  refusal.
- **Areas.** He can drag a rectangle on any picture (a written question's picture or a
  screenshot step) and comment on it. The answers file holds them as
  `answers[step].marks[] = {pic, x, y, w, h, text}`, with the rectangle in percent of the
  picture; `pic` is the run name on a screenshot step, `the picture` or `option <id>` on a
  written one. An area with no button pressed is stored as `v: "other"`.
- **Calls list**: a words step with `"calls": [{"id", "call", "why"}]` and no `today`. Small
  choices you made yourself, one line and its reason each (40 words at most). Each stands
  unless he opens its pencil (round 3; before that a "Change this" button); his words arrive as
  `answers[step].changes[<call id>]`.
- **Word caps**: `today`, `problem`, `proposal` are 60 words each at most; each pro or con 25.
- **Build stamp**: the chip shows when the deck was built and the short version it was built
  from; the same goes into the answers file as `built`. Each answer already carries `t`, the
  time he gave it, now shown beside "answered" and on the finish screen.
- **Voice**: every text box has a microphone while the deck is served (`voice-helper.mjs`).
- The printed summary lists changed calls and areas under their step's line.

## Added in round 3 (2026-11-10)

Source: `review-deck-rethink.round3.answers.json`. Where this contradicts the section above,
this wins.

- **One pencil per list row.** "Change this" and "More context" are gone; the pencil opens one
  comment box and his words arrive as `answers[step].changes[<row id>]` — a change, a question
  or a stray thought, his to say. (`asks` appears only in answers from round-2 decks.)
- **No "All fine".** A list has no answer button. When he moves to another page or presses
  Done, every list on the page he is leaving that he did not touch is saved as `v: "yes"`. A
  list on a page he never opened stays unanswered.
- **Row pictures** are thumbnails at the row's right edge. `before` beside `picture` makes a
  before/after pair. A click opens the picture large inside the deck (never a browser tab);
  dragging on the large view marks an area exactly as on the small one.
- **`wording` rows are retired** (round 4): the builder refuses them. See "Editing the words
  on the real screen" below.
- **`gallery: true`** on a list lays the rows out as tiles, pictures first — the "every screen
  that changed" page of a walkthrough. A before/after tile is two columns wide.
- **Notes about anything else**: a Notes button in the header, on picture-style decks only (a
  deck with no page markers, one step per screen). Those decks have no page foot, so the button
  and the "Notes about anything else" row of the finish table are their only place for a general
  comment — both stay. Saved as the top-level `notes` string in the answers file and printed first
  in the summary (`general notes — "…"`). A question deck (paged) has no header Notes button: it
  has the comment box at the foot of every page instead (round 4, below).
- **Question decks**: the page title is said once, in the header; Back sits directly left of
  the one Next button at the foot; a list carries no "Question n of m" label.
- **Voice** follows the app's method (`voice-helper.mjs`): a sentence is closed off at a pause
  and not heard again, passes are chained a fifth of a second apart, and two seconds of quiet
  after speech stop the microphone. While listening the microphone shows four level bars and
  a clock inside the box. Still no custom vocabulary.

### Editing the words on the real screen (round 4, 2026-11-10)

Wording is never asked before the build, and never as a text box per label ("this system is
terrible… directly edit text on the real ui surface so i can see it in context"). After the
build:

1. `node scripts/shoot/shoot.mjs <screen name> --page --themes <one> --out <folder>` saves
   `<theme>.html` beside each picture: the screen's own elements and styling with all code
   removed (`scripts/shoot/freeze.mjs`). Copy it beside the spec.
2. Add a step `{"id", "words": true, "surface", "path", "headline", "screen": "<file>.html"}`.
   No `calls`, `options`, `today` or `answer`.

The deck shows the file in a frame, opened zoomed on the screen's panel (the popup or menu,
up to 1.5×); "Whole screen" shows all of it. Every run of text, and the grey hint in an empty
box, can be clicked and retyped; the layout re-wraps as the app's would. Nothing on it can be
pressed. Each change is listed under the frame with "Put back" and saved as
`answers[step].edits[<key>] = {from, to, state}`; the summary prints `reword "old" → "new" —
seen with: <state>`. A screen he leaves alone is accepted when he moves on, like a list. Text
drawn by code at run time (a terminal, a chart) is a picture in the file and cannot be edited.

**`"liveScreen": "settings/about"`** (round 7b, 2026-11-10: "the dropdown menus in that about
popup should probably still work?") — the screen's name as `shoot --list` prints it. `screen`
may be left out (a live-only step) or kept as the picture shown when the app cannot run. The deck
needs `"live": {"worktree": "<name>"}`. When the deck is **served** and the practice app builds,
the card gets a switch, **Use it / Edit words**: Use it is the practice app running in the frame,
opened on that screen (menus, fold rows, tabs all work); Edit words freezes it as it stands with
the same `freeze.mjs` function `shoot --page` uses and arms the editing above. Switching back
returns to the same running app. A step with a saved file opens on Edit words; a live-only step
on Use it. Opened as a plain file, served `--no-live`, or with an app that fails to build, there
is no switch and the saved file shows as before (a live-only step says it needs the served deck).
No deck without such a step builds or starts the app any differently.
- **Edits are keyed by the original words** (a second identical text is `words #2`; text over 80
  characters is its first 60 plus its length), not by position, so a change made in one state
  reappears wherever the same words are found. Edits made in a state he has left stay listed
  (dimmed) under the frame, with Put back. `state` is a short line read off the frozen screen:
  the dialog's title, the selected tabs, and each opened control (`About, Your account
  (optional) open`) — a session re-opens the screen like that to see the words in place. Old
  answers with `edits[<n>] = {from, to}` (a position) still read and print.
- **What can be edited:** only text inside the screen's panel (the top-most dialog, found the way
  `shoot` finds it, plus any menu opened over it) that is really visible there, and never text
  inside `[data-entry-key]` (chat messages — the running app only; the saved file drops it),
  `.quick-chip`, `.status-bar`, `[data-model-chip]`, `.input-bar-container` or
  `[data-session-strip]`: one person's own state, not copy everyone sees. Changes show only in
  Edit words, not in the running app.
- The practice app is built the way live panes build it (`serve.py` `_ensure_app`; the freeze
  function ships in `DECK.live.freeze` only when a step names `liveScreen`). A screen that needs
  other practice data (`scenario`, `params` in the screen list) reloads once under it; the
  screen list's own `open` click steps and `viewport` are not replayed (the frame is 1440x900).

### Also added in round 4

- **Status pills are his to change.** A row's `result` (`pass`, `fail`, `unclear`, or `todo` for
  "left for him to try") is a pill at the row's right; pressing it opens the four statuses.
  His choice arrives as `answers[step].results[<row id>]`.
- **A comment box at the foot of every page** replaces the header Notes button on question
  decks only (paged decks): `pageNotes[<page marker id>]`, printed first in the summary. WHY:
  "nah i wanted like an extra more visible input region at the bottom of each page". Picture-style
  decks keep the header button (see "Notes about anything else" above).
- **The picture viewer.** Any picture opens over the whole window with its comments beside it
  and every picture of the page in a strip; it stays open while he drags areas and types.
  Shoot pictures narrow (`--width 1000`) or cropped to the changed part so words stay readable.
- **History.** `"earlier": ["<older round>.json", …]` (spec files beside this one, newest
  first) and `"related": [{"title", "path"}]` put a History button in the header: every
  earlier round's questions with his own answers and comments, read-only. One topic, one
  folder; each new round names the rounds before it.
- **Each card's state** is a pill at its top right (Not answered / Answered 12:47 / Accepted /
  2 changes); a list's pill shows only once it has something to say.

### Review fixes (2026-11-10)

From a code review of the server, one of the page and a fresh-eyes tester. Where this contradicts
an older section, this wins.

- **A pencil pressed again keeps a saved comment**; it only returns to the box. A small x beside
  the comment takes it away. An empty box still closes on the second press.
- **`"context": true` lists** are never counted as answered, never accepted by moving on, and are
  not in the summaries or the finish table. An untouched list that was accepted reads **Left as
  listed** (not "Yes, build it") on the finish screen. The "Accepted" pill shows only once he has
  moved on from the page (`accepted: true` beside `v: "yes"` in the answers) or changed a row.
- **A status he changes** (any of them) counts as a change on the box and in the header, shows
  "changed from: <what it was>" and an outline; the pill is a 32px-tall control with a chevron, and
  its menu marks the starting value "Suggested" (run/skip) or "my result".
- **The finish screen** names things as the page does ("Page 2, Question 3 of 3") and shows option
  labels, never their ids; the submitted page says "Sent. You can close this tab."
- **One summary:** the page's `summaryOf(state)` and `serve.py` `summary()` print the same text for
  the same state (a test feeds one state to both). Page notes print in page order.
- **A drag under 3% of the picture** makes no area; taking the last area away withdraws the answer.
- **Saved screens** are scrubbed when `shoot --page` / Edit words freezes them (event handlers,
  `javascript:` addresses, meta refresh, forms' targets, objects, remote pictures and `@import` are
  removed), shown in a frame that may not run scripts, and refused by the builder if they still
  carry any of those (`spec.live_code_in`). Re-save an old screen if the builder refuses it.
- **A screen opened zoomed** fits the window's height too; a count of his edits sits above the frame.
  Opened as a plain file, the page says words cannot be edited there.
- **Serving:** saves are locked and use their own temp file; a saved `submitted` is never removed by
  a later autosave; bodies that are not objects get 400; at most 200 attached pictures; the deck
  folder's symlinks pointing outside it are not served; a recording is cancelled when the page stops
  polling (or closes); the archive of a submitted review is never overwritten.
- A page flushes a pending save when its tab is hidden or closed. A re-served deck that was already
  submitted still starts a fresh review (the earlier answers are kept beside it) — by design.

### Which starting point for a question about looks

| He needs to judge… | Copy | Note |
|---|---|---|
| one change, before and after | `approve.json` | one full-window picture per step |
| several designs of one thing | `choice.json` | three or four side by side; never a yes/no each |
| one new screen with nothing before it | `brief.json` | `"new": true` once it is built |
| a path through several screens | `walkthrough.json`, page 2 | tiles in the order a person meets them |
| on-screen wording, after the build | a `screen` step | he types on a still copy of the real screen |
| a whole piece of work | `walkthrough.json` | before the build and again after |

## Added in round 7 (2026-11-10)

Source: Destin's round-6 remarks on the deck itself. Where this contradicts a section above, this
wins.

- **Pictures in a row are an Attachments card of tiles.** A row's `picture` / `before` never draw
  thumbnails at its right. Under the row's words sits a true copy of the app's Deliverables card
  (`DeliverablesCard.tsx`): closed, one line (document glyph | "Attachments", the count, chevron at
  the right); opened, a sideways strip of fixed-width tiles, ONE per picture or clip: the preview on
  top, then its name ("Before" / "After", or the file name) and a small outlined open-arrow. The
  whole tile is the button: it opens the full-window picture viewer with that row's words as the
  title and its comments beside it; he drags a rectangle THERE, never inside the card. A tile
  shows "n comments" on its corner once he has written on its picture. Cards on a `gallery: true`
  list start open; others start closed; which he opened is remembered across page changes. The
  viewer shows one picture, no arrows and no strip of other pictures. Areas keep the shape
  `marks[] = {pic, x, y, w, h, text}`; for a row `pic` is `row <id>` (after / single) or
  `row <id> before`. Nothing can be dragged on in a `context` list. (Destin, round 7: "a single
  card for each image. clicking that should open our popup image screen/comment menu".)
- **Pictures and file paths in any comment box become pills.** Paste (or drop) an image into a row
  comment, an area comment, a question's note, a typed answer, the page-foot box or the general
  notes box: the deck server keeps it in `<spec stem>.attachments/` under a name it makes itself
  (`POST /attach?name=…`, raw image bytes; images only, judged by their bytes; 10 MB cap; same
  Host/Origin check as every POST) and a pill with a small thumbnail, the name and an x appears under
  the box. Paste text that is one line starting `/` or `~/` and it becomes a pill with the file's
  name, the full path as its tooltip. Opened as a plain file, an image paste says it needs the served
  deck. Saved shapes (a pill is `{kind: "image", name, path, url}` or `{kind: "path", name, path}`):
  `answers[step].attach["note" | "text" | "change:<row id>"] = [pill…]`,
  `answers[step].marks[i].attach = [pill…]`, `pageAttach[<page id>] = [pill…]`,
  `notesAttach = [pill…]`. Printed in both summaries as `attached to <box> — picture "…" saved at
  <path>` / `file <path>`; shown read-only after submit. The `.attachments` folder is not
  committed by itself: stage it only if the pictures should outlive the scratch round.
- **Buttons follow the design guide.** One filled button per view (the foot's Next / Done); answer
  buttons and everything else are outlined in the full-strength outline (`--edge-strong`, not the
  faint divider), never a green or red outline; on a question the note box is at the left and Yes /
  No / Other at the right of the same line; the chosen answer is an accent outline with a tick, not a
  second filled button. Written options no longer show their id as a chip (ids stay in the answers
  file and summaries).
- **The card state pill is a status, not a control.** A tinted pill with a dot, no outline, cannot be
  pressed. A question says "Not answered" / "Answered 12:47". A list has NO pill until it has
  something to say ("2 changes", or "Accepted" once he moves on); a `context: true` list never has one.
  On a `context` list every row is dashed (the first used to be drawn solid) and nothing on it has a
  pointer or a pencil.

### Also added in round 7 (the history woven in; More; Built from; video proof)

Source: Destin's round-6 remarks. Where this contradicts a section above, this wins.

- **State is a group, never a badge.** A list row or a written question may carry `"state": "new"
  | "changed" | "settled"`. A list with any stated row draws small plain headings with a count —
  **New**, **Changed**, **Already settled**, in that order — and each row sits under its heading
  in the order written; rows with no state come first under no heading. No row carries a state
  pill: the only coloured pills on a page are real statuses (Passed, Unclear, …) and a card's
  answered state. `"fold_settled": true` makes the settled group one closed fold row. (Destin,
  round 7: the badges "don't really make much sense, not to mention the colors make them visually
  confusing next to the unclear/pass/fail chips".)
- **One "Details" fold per row.** `trail`, `more` and `reuse` on a list row (or `trail` / `reuse`
  on a written question) all open from ONE fold row drawn like the app's `FoldRow`: a boxed line,
  "Details" at the left, plain chips for what is inside ("2 rounds", "What it does", "Built
  from"), the chevron at the right. There are no bare ">" openers and no underlined links
  anywhere on a deck. `"trail": [{"round": "Round 3", "asked": "his words", "built": "what was
  built", "said": "his reaction"}, …]` (each part optional, at least one of asked / built / said;
  60 words each; his words quoted as written) draws one small block per round, then **Now**. Put
  `state` and `trail` on every item from the second round on; leave them off in the first.
- **Since last round.** When any row or question has a `state`, the first page of a paged deck
  opens with one plain sentence: "Since last round: 3 new, 2 changed, 11 settled." Nothing in it
  is pressable; the group headings do the navigating.
- **Related decks at the top.** Each `related` entry may carry `"how"` (one line, 40 words at most)
  saying how it relates; `related` entries are listed at the top of the first page as small outlined buttons, each with that
  line, and also behind the header's History button. **History stays** as the full record.
- **`more` on a list row.** `"more": {"does", "returns", "why"}` (any of them, 120 words each) or one
  plain string: inside the row's Details fold, as labelled parts — *What it does*, *What comes
  back*, *Why, for this build*. A row whose `result` is `run` or `skip` (a check
  he switches on or off before the build) MUST carry `more` with at least `does` and `why`; the
  builder refuses it otherwise ("a switch he cannot understand was his complaint").
- **`reuse`: what a design is built from.** `"reuse": {"from": ["Settings → About popup", …],
  "new": ["the star button", …], "note": "one sentence"}` on a written option, a list row, a
  written question or a picture step. On a row or question it is a "Built from" part inside
  Details; on an option card or a picture step's headline (where a fold would fight the click) it
  is a small (i) hover tip. Either lists *Reused from the app* and *New in this design*. The assistant works
  this out itself — which kinds of parts the screen needs, every existing app part that could do the
  job, adopt it, say what is new — and records it here; it is never a chat question.
- **Proof can be a video.** A row's `picture` / `before` may be a `.webm` or `.mp4` file beside the
  spec. It is a tile like any picture (its first frame as the preview); the viewer plays it with native
  controls, never by itself. No
  area can be dragged on a video. (The deck server answers whole files only, so seeking inside a
  long clip may be limited; keep proof clips short.)
- **Invariants stated once, here.** Every `Today` carries `checked` (how it was confirmed), shown
  behind the (i).

## Changed in round 9 (2026-11-12)

Source: Destin's round-8 remarks and round-9 answers. Where this contradicts a section above, this
wins.

- **One kind of row per card.** A list is one of three kinds and says so on a line at its head:
  **For your information** (`"context": true`; no pencils, no result chips), **Yours to change**
  (a pencil per row, nothing else), or **Results** (every row carries `result`; before a build,
  run / skip checks, headed **Checks**). The builder refuses a list where some rows have a `result`
  and some do not, and a `context` list with any `result`: split it. A question he must answer is
  never a row; it is its own card. (Destin, round 8: "why is it the only row in this card that has
  the unclear/etc dropdown chip?"; round 9, K-1.)
- **There is no "Details" fold.** (Round 8: "what even is the point of this?… poorly styled text
  dropped into a dropdown".) `trail` is drawn as plain lines ABOVE the row's (or question's) words:
  "Round 3 · you" with his words quoted, "Round 3 · built" with what was built. `more` is labelled
  lines UNDER the row's words (*What it does*, *What comes back*, *Why, for this build*), always
  visible. `reuse` is a small (i) beside the words, everywhere. The fields and their limits are
  unchanged. `fold_settled` still folds the settled group.
- **The picture popup shows the picture at its true size.** It is no longer shrunk to fit the
  window: the picture area scrolls, comments sit in a strip at the right (round 9, V-1), the header
  has a True size / Fit switch, a Before / After switch when the row has both, and an ×. So shoot
  narrow and close (`--width 1000`, or cropped to the changed part): a 2560-wide picture means
  sideways scrolling.
- **Touch screens:** a drag on a picture scrolls. He taps **Comment on an area** in the popup, then
  drags one area (round 9, Q-4). With a mouse any drag draws, as before. `?touch=1` on the deck's
  address makes a desktop browser behave as touch, for checking.
- **Pictures on questions and options use the card's full width** (no height cap).
- **Reopening an answered deck.** `serve` on a deck he already submitted, when the page on disk is
  the same build he answered: the submitted copy is kept as `<stem>.answers.<when>.json`, and the
  deck opens with his answers, editable, under a line saying when he sent them (`sent_before` in the
  answers file); a second Submit replaces the first (round 9, Q-3). Until he submits again the live
  answers file has no `submitted`; the dated copy is the record. A deck REBUILT since he answered
  still starts empty, so keep using `serve --no-build` for an answered deck.

## Changed after round 10 (2026-11-12)

Source: the areas Destin marked on round 10's pictures. Where this contradicts a section above, this wins.

- **No coloured bar at the left edge of anything.** He calls it "fingernail styling" and marked every
  one: beside a quote of his words, beside a row's story, on an "unread" row. His words are quoted and
  italic, nothing more. Drawings for him follow the same rule. A test fails the page if any element has one.
- **A list's kind is one small label above its title** ("Yours to change", "Results", "Checks", "For
  your information"), with no sentence after it. Never restate in words what the layout shows (design
  guide, principle 3).
- **A page's opening line sits in a card.** ("bare text with no card gets ignored easily as ai clutter".)
- **The popup's title is the picture's short name**; the row or question it belongs to is said once, in a
  box at the head of the comments strip.
- **The theme's typeface.** A theme whose manifest names a font family is drawn in it; a Google Fonts
  address in the manifest is loaded when the deck opens (round 10, L-3).
- **In drawings for him:** keep what is the deck's own (the yellow header chip); do not dress a deck as an
  app screen ("Esc · Back to chat" is not a deck part); no status words beside the controls that already
  show the status ("i definitely dont like the weird new… change asked/fine/not looked at indicator things").

## Tick or change (round 10)

Source: Destin's round-10 answers, R-1 "Tick or change" and R-2 "Warn, list them, let me send anyway". Where
this contradicts a section above, this wins.

- **A "Yours to change" list** (`calls`, not `context`, no row with a `result`; `tickable` in spec.py and
  page.js) gives each row two buttons at its right: a tick ("This is fine") and the pencil. The buttons
  are real `<button>`s with `aria-pressed`, at least 32px; a lit one wears the answer buttons' accent
  outline. No status words, dots or edge bars beside a row. Nothing counts as fine until he ticks it.
- **One state per row.** Writing a comment takes that row's tick off. Pressing the tick on a row that has
  a comment does nothing (the bin beside the comment is how a comment goes). A lit tick pressed again
  takes it off.
- **Moving on accepts nothing** for these lists (`acceptLists` skips them). Lists of facts, results,
  checks and screens behave as before.
- **The card's pill** is silent until he acts, then "3 of 5 looked at", then "All looked at". The header
  count and the page segments count such a list as answered only when every row is ticked or changed.
- **At Done**, a warning counts the rows he neither ticked nor changed and names them under their page and
  list; he can still send. The finish table says "No changes · 2 not looked at".
- **Saved shape:** `answers[step].ok = { "<row id>": true }` beside `changes`. The page always writes `ok`
  (empty when nothing is ticked) once he touches a list, and never writes `accepted` for these lists.
  `v` is `other` if any row changed, `yes` only when every row is ticked and none changed, otherwise unset.
- **Both summaries** (`summaryOf` in page.js, `tick_lines` in serve.py) print `ticked as fine — N rows`
  and, per row, `not looked at — "<the row's words>"`.
- **The done gate** (`gate.py`): in the after-build walkthrough a row not looked at means NOT finished,
  and the problem names the row.
- **Old answers keep their meaning** (`row_states`): `accepted: true`, or a list with `changes` and no
  `ok`, reads as "untouched rows were fine". Reopened, the first press writes those rows as real ticks.
