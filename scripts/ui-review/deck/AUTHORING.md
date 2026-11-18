# Authoring a review deck

How to write a deck for Destin: every step kind and field, the growing deck, lists he ticks or
changes, pictures and marks, the checks menu and done gate, every refusal the builder makes, the
answers file and every command. This is the one current description; how it got here is in
`docs/active/design/2026-11-09-review-deck-rethink/HISTORY.md`. The short version (which kind to
pick) is `.claude/rules/review-deck.md`; the order of a feature is `.claude/rules/feature-flow.md`.

Copy a template from `scripts/ui-review/templates/` (`approve`, `brief`, `choice`, `decide`, `clip`,
`live`, `tryit`, `questions`, `walkthrough`, `growing`, `contract`): every field is filled and
explained in place. `_comment` keys (any depth, including `_comment_<field>`) are stripped at build.

## Start here

| Want to… | Read |
|---|---|
| Build and serve any deck | "Order of work" |
| Ask Destin 4+ questions | "Question", "Page markers" |
| Run a whole feature across rounds | "A deck that grows" |
| Show a whole piece of work before and after building | "Walkthroughs" |
| Get a field or refusal exactly right | "Deck-level fields", "What the builder refuses" |
| Know what a submission writes | "The answers file" |
| Run `build` / `preview` / `serve` | "Commands" |

## Where a deck lives

A feature's decks sit in `docs/active/design/<date>-<feature>/` **of the session's workspace
worktree** (never the shared checkout, whose files a session cannot commit), named
`<feature>.<round>.json` (`.questions.json`, `.walkthrough.json`, `.walkthrough.after.json`; a
growing deck is just `<feature>.json`). The built page, the answers and rotated older answers land
beside the spec. Answers files are committed (the record of his decisions). `preview/`,
`*.serve.json`, `*.serve-port` and `*.workbench.log` are scratch. `*.unsent.*.json` (what an older build left unsent) and `*.as-built.*.json` (the spec as he saw it) are records, tracked like answers.
Older, separate decks of a feature that now has a growing deck go in an `earlier-rounds/` folder
beside it, with the pictures they use (the builder refuses `..` in picture paths, so each folder
keeps its own `pictures/`). The growing deck reads earlier rounds only from dated answers files
right beside its spec, never from that folder (pinned by `test_grows.py`).

## Deck-level fields

| Field | Required | What it is |
|---|---|---|
| `title` | yes | what the deck is about, in his words |
| `key` | yes | short name; his answers are saved under it, keep it stable across rounds |
| `out` | yes | the HTML file `build` writes, beside the spec |
| `steps` | yes | the steps, in the order he reads them |
| `images` | pictures only | folder the cut crops land in, relative to the spec; must contain the spec's own name (warning otherwise: two decks would overwrite each other) |
| `runs` | pictures only | every capture the deck can show: `today`, `before` and/or `after`, or any short lowercase name (`round3`), each a `shoot` output folder (`shoot.mjs <screens> --before <branch> --after <worktree> --out runs`). **Paths resolve from the spec's own folder**: write `runs/after`, not a workspace-root path. `before` always shows left of `after` |
| `labels` | no | renames run captions, e.g. `{"before": "Round 1"}`; a slide may override |
| `themes` | no | palettes offered; default all six. See "Themes" |
| `theme` | no | only `"fixed"`: keep the spec's own theme order |
| `crops` | no | extra crop regions `{"name": ["<plan>", "<shot>", "WxH+X+Y"]}` on 1440x900 shots; shared names are in `scripts/ui-review/crops.json`. A `shoot` screen name (`settings/sound`) needs no entry: a name with `/` or `#` is taken on sight, a one-word screen is recognised from a run's `manifest.json` |
| `live` | live only | `{"worktree": "<name>", "paneWidth": 460}` |
| `stage` | no | on a non-growing deck: `ask`, `design`, `contract`, `review` or `accept` (the build checks the deck carries that stage's slide; nothing else is forbidden). On a growing deck it means something else, see below |
| `build` | no | `"before"` or `"after"`. `"after"` marks the after-build deck (see "After the build: two required lists") |
| `grows`, `rounds_before`, `retired`, `stale_answers`, `notes_handled` | growing only | see "A deck that grows" |
| `earlier`, `related` | non-growing | History button (below); ignored on a growing deck |
| `branch`, `sources` | contract | old contract decks only |

Fields on every step: `id` (unique, never reused), `surface` (part of the app, his words), `path`
(how he gets there), `headline` (one sentence, 25 words max, no code words). A step may carry its
own `themes` when its picture exists in one palette only.

## The step kinds

### Approve — a change he can see (`approve.json`)

Two runs; the rig boxes the pixels that differ. Answers: **Yes keep it / No revert it / Other**.

| Field | Required | What it is |
|---|---|---|
| `crop` | yes | region to show: a `crops` name, a `shoot` screen name, a close-up `"<screen>@WxH+X+Y"` (screen's own CSS pixels at 1440x900), `"<screen>@panel"` (that screen's panel in every run and theme, +16px), or a LIST of these (below) |
| `changed` | yes | the *What changed* card, one or two sentences |
| `notice` | yes | the *You'll notice* card |
| `risk` | no | the *Risk* card; one sentence (warning over 40 words) |
| `measured` | no | a number that proves it (warning with no digit) |
| `highlight` | no | `"auto"` (default on two runs), `"panel"` (the screen's own panel in every run, for whole-page changes), `{"text"}`, `{"selector"}`, or `{"box": [l, t, w, h]}` in **percent of the crop**; a box leaving the picture is refused, a hand box warns. On a one-run `shoot` screen write none |
| `alsoChanges` | no | `["Session details", …]`: other screens a shared change reaches, an "Also changes" card; a yes is a yes to all |

**A crop's SHAPE decides the layout.** A wide crop puts What changed / You'll notice / Risk in a row under the pictures; a tall one puts them in a side column about two cards deep, and the third is cut off mid-sentence. Crop to the part that carries the point (a 420x580 dialog crop clipped Risk at every width; 420x275 fixed it). Cropping the whole window is the opposite failure. Two tall pictures stay side by side (shrunk to fit; he can zoom with +); three or more tall designs open at the width that fills the row and the stage scrolls.

**A slide names its pictures.** `runs` on a slide lists the captures it shows (default: all), `labels` renames its captions. One picture is a BRIEF (*Yes build it / No leave it*, `highlight` required); two are an APPROVE. `"new": true` on a one-picture slide of an already-built new state (offline, a menu opened) reads *Yes, keep it / No, remove it* and counts as a `review` deck's slide.

**Several screens in one picture.** `crop` may be a list of crop names or `{"crop", "label"}` (label four words at most); pieces are cut from one run and laid side by side, top-aligned, 16px apart, labels in a strip over each. Works on approve / brief / decide and each choice variant. `"auto"` still boxes the change across two runs; `"panel"`, `{"text"}` and `{"selector"}` are refused (no one panel); a hand `box` is percent of the composite.

### Brief — something not built yet (`brief.json`)

The same fields over ONE picture: **Yes build it / No leave it / Other**. A legacy crop needs a `highlight`; a `shoot` screen boxes its own panel; a close-up or list is already the focus and gets no box.

### Choice — several pictures of one thing (`choice.json`)

`variants[]` (at least two) instead of `crop`/`changed`/`notice`; pictures come from the deck's last run. Variant fields: `id`, `label` (two or three words), `crop`, optional `summary`, `measured`, `risk`, `highlight`. He picks one, or *None of these* / Other. Pictures `shoot` cannot take (a Remotion still, a montage) go in a run folder by hand: `<run>/shots-<plan>/<theme>/<shot>.png` plus a `crops` entry; every run's picture must be the same size. **A warning**: pictures of different widths with a later one wider than the first overflow the row; crop every design to one size, or put the widest first.

### Decide — written options over one picture (`decide.json`)

`crop` + required `highlight` + `options[]` (at least two). Option fields are the question's, plus `cost`. Optional `today` / `problem` / `proposal` draw the question's three cards above the options. He picks one, or Other.

### Clip — motion, hover, a transition (`clip.json`)

`clip` is a scene name (`<images>/clips/<name>--<run>.webm` with a `.webp` poster, made by `scripts/ui-review/record-pair.sh`) or `{"before", "after"}` paths. Record first; the build refuses missing files. For anything he should DRIVE, use Live.

### Live — panes of the running app (`live.json`)

Deck-level `live.worktree` names a checkout holding `desktop/` (for a session worktree: `sessions/<key>/youcoded`). A pane's `live`:

| `live` | Shows |
|---|---|
| `{"surface", "round", "candidate"}` | one authored design from `compare/registry.tsx`; `round` required |
| `{"app": "<scenario>"}` | a real screen: `default`, `empty`, `no-providers`, `refused`, `stress`, `site`; `"stalled": true` for the parked-turn state |
| `{"view": "<name>"}` | `tools`, `compare`, `assistant-final`, `attachments`, `session-pills` |
| `"params": {...}` on an app pane | extra workbench switches, text to text; keys the pane already sets (`mode`, `child`, `theme`, `latency`, `scenario`, `view`, `stalled`) are refused |

`variants[]` makes it a pick-one, else yes/no; four panes at most. An app pane needs no `changed`. ONE app pane with no `paneWidth`/`height` fills the stage; a row of panes keeps its declared size. A step-level `hint` shows above the panes (operating directions go there: the header `path` is hidden at laptop widths). `serve` boots that worktree's workbench; `--no-live` leaves one you started. Panes are the renderer against a FAKE backend: for "does it work" use Try-it.

### Try it in the real app (`tryit.json`)

A words slide carrying `dev`. Served, it shows an **Open the dev window** button (the page posts the STEP id; `serve` rebuilds the command from the spec) plus the exact `run-dev.sh` line; as a plain file the button is hidden. The window is a dev instance with its own profile and outlives the server.
`dev.worktree` (required), `dev.label`, `dev.offset` / `dev.profile` (both or neither), `changed` / `notice` (required), `yes` / `no` (default *Yes, it works* / *No, it does not*). A `review` stage accepts it.

### Question — words only (`questions.json`)

`"words": true`, no picture of any kind (a `picture` file is the one exception, below).

| Field | Required | What it is |
|---|---|---|
| `headline` | yes | the question, 25 words max |
| `today` / `problem` / `proposal` | yes | what exists now / what goes wrong, as he experiences it / what would change. 60 words each at most. With no options, say what Yes / No / Other lead to |
| `checked` | no | one plain sentence on how and when the Today claim was confirmed, shown behind the (i) beside "Today". State it for every Today you assert: a stale Today was the worst fault in past decks |
| `options[]` | no | written answers; one is enough, three the most he can hold |
| `risk` | no | the *Risk* card |
| `picture`, `caption` | no | a file beside the spec; a question about how something looks carries one |
| `reuse` | no | see "Reuse" |

Option fields: `id`, `label` (two or three words, never "(recommended)"), `pros[]` / `cons[]` (each 25 words max; one of these or `summary` required), `summary`, `measured` (a digit), `recommended` (true on at most ONE), `picture`/`caption`, `reuse`. With options he picks one, or Other; without: **Yes / No / Other**.

**How he answers**: `"pick": "several"` (any slide with `options` or `variants`) lets him choose more than one (`{"v": "picks", "picks": [...]}`); `"answer": "words"` (a words slide with nothing to pick) makes the answer a line he types, `prompt` is the placeholder (`{"v": "wrote", "text"}`). A typed answer has no separate note box: one text box per answer.

### Statement — something you assert

A words step with `changed` + `notice` and no `today`; `yes` / `no` relabel the buttons (under five words each). Exempt from the three-part rule.

### Contract and acceptance (old work only)

A step with `rows[]` (`id`, `statement` 25 words, `checkedBy`, `threshold`, `source`, `guard`, `note`), graded by `review-cards.py acceptance`. Retired: write none for new work; a feature with a signed contract finishes under it (`contract-check`).

## Lists: rows he ticks or changes

A words step with `"calls": [{"id", "call", "why"}]` and no `today` is a LIST. `call` and `why` are one line each, 40 words at most. A list is ONE kind of row, named by a small label above its title:

| Kind | Made by | What he can do |
|---|---|---|
| **For your information** | `"context": true` | nothing; no pencils or chips, never answered or counted, every row dashed |
| **Yours to change** | no `context`, no row with `result` | a tick ("This is fine") and a pencil per row |
| **Results** / **Checks** | every row carries `result` | a status pill per row (see "The checks menu") |

The builder refuses a list with some rows having `result` and some not, and a `context` list with any `result`. A question he must answer is never a row: it is its own card.

**Tick or change** (a "Yours to change" list; `tickable`): two real buttons at each row's right (tick, pencil, at least 32px, `aria-pressed`). One state per row: writing a comment takes the tick off; pressing the tick on a row with a comment does nothing (the bin beside the comment removes it); a lit tick pressed again unlights it. The pencil pressed again keeps a saved comment; a small x removes it. **Nothing counts as fine until he ticks it**; moving on accepts nothing. The card's pill is silent until he acts, then "3 of 5 looked at" / "All looked at". At Done a warning counts and names the rows he neither ticked nor changed; he can still send. The finish table says "No changes · 2 not looked at". Saved: `answers[step].ok = {"<row id>": true}` beside `changes`; `v` is `other` if any row changed, `yes` only when every row is ticked and none changed, else unset. Old files (`accepted: true`, or `changes` with no `ok`) still read as "untouched rows were fine" (`spec.row_states`); `page.js rowState` is its twin. A mark he draws on a row's picture is that row's comment (pencil lit, tick off, counted as looked at); removing the mark undoes it.

Other row fields:

- **`trail`**: `[{"round", "asked", "built", "said"}]` (at least one of asked/built/said; 60 words each; his words quoted as written), plain lines ABOVE the row's words on a non-growing deck. On a growing deck a trail opens only from the topic's past line. Put it on every item from the second round on.
- **`more`**: a string or an object (any part 120 words max). A "Yours to change" row that is open on a growing deck carries `today` / `problem` / `change` (what is different now), optional `pros` / `cons` lists, drawn like a question's cards behind a small More / Less at the end of the plain line; the build refuses an open such row whose `more` has none of today / problem / change. Older `does` / `returns` / `why` and a bare string still draw (answered rows, results lists; on a non-growing deck as labelled lines under the row, always visible). A `run`/`skip` check row MUST carry `more` with at least `does` and `why`.
- **`state`**: `"new" | "changed" | "settled"` on a row or written question (non-growing decks only): small headings New / Changed / Already settled with counts, in that order; no state pill. `"fold_settled": true` on the list folds the settled group into one row. When any item has a state, the first paged page opens with "Since last round: 3 new, 2 changed, 11 settled."
- **`reuse`**: see "Reuse".
- **`picture`** / **`before`**: a file beside the spec (image, or `.webm` / `.mp4` proof), `before` only with a `picture`: a before/after pair. See "Pictures, marks, attachments".
- **`decided`** (walkthrough rows): the words he said that this row came from.
- **`gallery: true`** on a list lays rows out as tiles, pictures first (a before/after tile is two wide), cards starting open; **`numbered: true`**: rows are steps in order.
- **`visual: true`** (growing decks): see below.

No row may carry `wording` (refused): wording is edited on the real screen, see "Wording".

### Reuse

`"reuse": {"from": ["Settings → About popup", …], "new": ["the star button", …], "note": "one sentence"}` on a written option, a row, a question or a picture step: *Reused from the app* and *New in this design*, as a small (i) beside the words. The assistant works this out itself (which kinds of parts the screen needs, every existing app part that could do the job, adopt it) and records it here; it is never a chat question.

## Pictures, marks, attachments

- **Areas.** He drags a rectangle on any picture (a screenshot step's, a written question's, a row's); a drag under 3% makes none; taking the last away withdraws the answer. Saved as `answers[step].marks[] = {pic, x, y, w, h, text}` in percent of the picture; `pic` is the run name on a screenshot step, `the picture` or `option <id>` on a written one, `row <id>` / `row <id> before` on a row. Areas with no button pressed store `v: "other"`. Nothing can be dragged on a video or in a `context` list.
- **Attachments tiles.** A row's pictures draw as ONE Attachments card (closed: a line with count and chevron; opened: a strip of tiles, one per picture or clip, named "Before" / "After" or by `before_name` / `picture_name`). The whole tile opens the picture viewer; a tile shows "n comments" once he wrote on it. Cards on a `gallery` list start open.
- **The picture viewer** opens over the whole window at TRUE size (the area scrolls; True size / Fit and Before / After switches; comments in a strip at the right; the row's words as a box at the head of the strip). Shoot narrow (`--width 1000`) or crop to the changed part, or he scrolls sideways. A picture more than 3 times wider than tall fills its tile cropped from the top-left; over 5 times wider gets a build warning. On touch screens a drag scrolls: he taps **Comment on an area**, then drags one (`?touch=1` makes a desktop browser behave so, for checking). Pictures on questions and options use the card's full width.
- **Video proof** plays with native controls, never by itself; the server answers whole files only, so keep clips short.
- **Pasted pictures and paths.** Pasting or dropping an image into any comment box saves it in `<spec stem>.attachments/` (`POST /attach?name=…`, images only judged by their bytes, 10 MB, at most 200) and shows a pill; one line starting `/` or `~/` pasted becomes a path pill. Saved: `answers[step].attach["note" | "text" | "change:<row id>"]`, `marks[i].attach`, `pageAttach[<page id>]`, `notesAttach`. Stage the folder only if the pictures should outlive the scratch round. Opened as a plain file, an image paste says it needs the served deck.
- **Voice.** Every text box has a microphone while served (`voice-helper.mjs`, the app's method: a sentence is closed at a pause, two seconds of quiet stops it).

## Page markers — question decks are pages

A deck whose every step is words-only with no contract renders as scrolling PAGES; questions share one page until a marker `{"id", "page", "intro"}` starts the next. `page` is a non-empty title, `intro` optional, **no other field** (a marker carrying anything else was meant to be a step). With no marker first, the first page takes the deck's `title`. Two markers in a row (an empty page) are refused; markers belong only in question decks (not with pictures, not with a contract). Progress counts pages; Prev / Next move between them; the page title is said once, in the header; a page opens in a card. Err on MORE questions per page. A deck with pictures keeps one step per screen, with a header **Notes** button (saved as top-level `notes`, printed first as `general notes — "…"`); a paged deck has a comment box at the foot of every page instead (`pageNotes[<marker id>]`, printed first, in page order).

## A deck that grows

One deck per feature (`templates/growing.json`, code `deck/grows.py`). `"grows": true`; you edit the SAME spec every round and re-build it, never a new spec; a deck without `grows` is unaffected. Pictures and a contract are refused on the deck itself, but a question or row may carry a `picture` (a file beside the spec; a row also `before`).

**Stage.** Top-level `"stage"` (required): `understanding`, `design`, `before`, `after`, in that order; the deck is AT one. Every page marker carries a `stage` too, stages in order. Refused: a page of a LATER stage, no page at the deck's stage, an OPEN topic on a page of an EARLIER stage (answer it or move it), a `reopened` topic outside the current stage. Advance `stage` when a stage is done; finished stages become the record.

**What he sees.** The header is one row: stage names at the left (on a phone, the current stage with "2 of 4", press for the others), page bars in the middle, a filled **Submit feedback** at the right; the yellow tag shows `TAG: title` and the date built (round only on hover); no page title or question numbers in it. The stage line is a picture: finished stages carry a check and open their pages read-only ("Finished", no Reopen, never counted); the current stage is highlighted; later ones dimmed. Every page of the current stage has its own bar: pages with no open topic come first (green), then pages needing him (grey until every open topic is dealt with, then green); the deck lands on the first page that needs him. A finished page shows its answered cards with Reopen (current stage only; reopening turns its bar grey). On a phone with so many pages that each bar would be under 12px, the bars become one split bar with "3/11". The last page's foot has only Back: the header button is the one way to submit. A page is a heading + ONE plain line (`intro`, 160 characters max).

**Answered topics.** On a page with open and answered topics, one folded row "Previously answered" (title, count, chevron) opens in place: each answered topic folded to title, round(s), "You answered", his comments in full, `resolved` ("What I did about it"), and Reopen. "Show the full card" opens the original card from the same code as a live one, locked, with his pick, note, ticks, row comments and drawn areas (`given.marks`, read-only). Answered topics are never counted in "x of y", the segments, the finish dialog or either summary unless reopened. Open topics with a past show ONE muted line and a "More" link opening the story (`trail`) and his earlier answers, oldest first. A row on a growing deck is a bold line, one plain line, and `more` behind More / Less. The build refuses a title, row line or page line naming a round or a step id (`round 7`, `R-1`); `trail`, `more`, `past`, `resolved`, `checked` and answered topics may.

**New tags.** A topic is **new** when it is open and its id was not in the deck as he last saw it (the newest earlier round's build). Every build records its topic ids in `built.ids`, which rides into his answers file; an older file without them is read from the spec at its `built.commit` (`git show`). No earlier round, or neither available: nothing is new; a reopened topic never is. A page whose open topics are ALL new and that holds no answered topic gets one big "New" beside its heading and none on its cards; any other page tags only its new cards, small, beside the title. Nothing to write in the spec.

**How rounds are found.** Each submit's answers are moved aside as `<stem>.answers.<stamp>.json` once a rebuilt deck is served; those dated files, in time order, are the earlier rounds, and a submitted live answers file not yet moved counts too (so rebuilding right after he answers already builds the next round). Round number = `rounds_before` (default 0) + earlier rounds + 1. Two files with one build stamp are two rounds unless the later carries `sent_before` (a re-send). `"stale_answers": {"<file's submitted time>": ["<id>", …]}` drops ids a file copied from the browser's old copy of the previous round. `build` of an answered growing deck is allowed.

**What counts as answered.** A step (question or list, never a marker) is answered when the spec says so by hand — `"answered": {"round", "answer", "notes": [...]}` for a topic settled in an older separate deck, or a list of `{"round", "given": <his saved answer>}` oldest first (a topic answered again later is ONE topic listing every round; do not copy the latest round's file by hand, the tool reads it) — or an earlier round holds a real answer for the same id and the step has no `reopened`.

**The routine, every round.**
1. Read his answers. 2. Edit the same spec. For every topic where he asked for something other than a plain yes or pick (no, other, a note, a marked picture, a changed row, a row left not looked at) write ONE of `"reopened": "<one line of its past, 30 words>"` (open again, normally with a revised proposal) or `"resolved": "<what was done about it, 40 words>"` (stays answered). 3. For an open topic with a history but no reopening, `"past": "<one line>"` gives it the same fold. 4. Every page sits under a stage. 5. Add new topics; every Today carries `checked`. 6. Rebuild, `preview`, read the contact sheet, `serve`.

**`visual: true`** on an open question or row: refused without a `picture`. A change he would see is judged from a picture, never from words: any row describing something he would see sets it.

**Words that are not answers.** A page comment, the general note and a note on a step he left unanswered are never carried by a topic card, so a rebuild is REFUSED while any of them from the newest round is not acknowledged: `"notes_handled": {"<page id, step id or general>": "what was done, in plain words"}` (say "Read; not acted on" when true). If the same key held words in an earlier round too, write `{"round": "Round 3", "done": "..."}` so the line cannot stand in for the wrong round. Each acknowledged comment shows on its page, under "Your comments, and what was done", with what he wrote.

**Refused** (each message names the step and quotes him): his latest earlier answer was not a plain acceptance and the step has neither `reopened` nor `resolved`; an answered step gone from the spec and not in `"retired": {"<id>": "why"}`; a `trail` with no `reopened`/`past`/`answered` line to open from; `state` on a step or row; `answered` with `reopened` or `past`, or `reopened` with `resolved` or `past`; a line over its limit; `answered` without text `round` and `answer`; any growing field without `"grows": true`; a page with no, an unknown or out-of-order stage; a missing or unknown top-level stage; his page comment, general note or note on an unanswered step from the newest round with no `notes_handled` line; a title, row or page line naming a round, or a step or page id that exists in this deck or its earlier rounds (a product name like "GPT-4" is fine).

**State and gate.** The saved page state carries its build stamp (`built.at`); a page reads back only state from its own build, and only open (plus reopened) topics are saved or sent. `serve` refuses a save or submit from another build (409, `reason: "old-build"`; the old page says "out of date, reload") and, when the current build first saves over a file an older build left, keeps that file as `<stem>.unsent.<time>.json` when it holds anything of his (answers, notes, reopened topics, pasted pictures; never read as a round; `serve` prints a line when one is made, and it is a record to read, not delete). A file of another build that was SUBMITTED is kept as a dated round file instead, never folded into the new round. `state.reopened = {"<id>": true}` sits beside the answers; "Leave as answered" is remembered in `state.left` (a time), so an older copy cannot reopen it. The summaries and `gate.py` skip topics settled in an earlier round.

## Walkthroughs

`templates/walkthrough.json`: the whole of one piece of work as pages of lists, shown before the build and again after with the same pages: 1 What you asked for and what you got (`decided` quotes him) · 2 Every screen that changed (`gallery`) · 3 Behind the scenes (`numbered`) · 4 Choices I made · 5 Checks, ending with what is left for him. Drop a page that would be empty; never add a sixth. A growing deck's after-build stage plays this role.

**The checks menu.** Before the build the Checks page lists every suggested check and reviewer as a row with `result: "run"` (Will run) or `"skip"`, each with `more` (does / returns / why for THIS build). A comment on a check row is passed to that checker as "also check this". After the build each chosen check is a row with `result` `pass` / `fail` / `unclear` and, where there is one, a picture as proof; never report a check not run. `todo` means "left for him to try". A status is a pill at the row's right; pressing it opens the four statuses and his choice (`answers[step].results[<row id>]`) wins over yours, counts as a change, shows "changed from: …", and its menu marks the starting value "Suggested"/"my result". Add `"check": "code-review"` to the row that reports the code review.

**After the build: two required lists.** An after-build deck (`"build": "after"`, a growing deck at stage `after`, or a file named `<feature>.walkthrough.after.json`) is refused without:
- **What changed while building**: a words list with `"list": "changed-while-building"` and at least one row. Each row says `"built": "as planned"` or `"built": "adjusted"`; an adjusted row says why in `why` (at least 3 words). His words: "what did you have to adjust".
- **Found in review**: `"list": "found-in-review"`, required once a row carrying `"check": "code-review"` has a result of pass / fail / unclear. One row per finding in plain words (never the reviewer's raw report); when it found nothing, ONE row with `"none_found": true` and a plain sentence.
Both are lists he ticks or changes: a `context` list or result chips on them is refused. A deck that is not after-build is unaffected.

**The done gate.** `review-cards.py walkthrough-check <feature>.walkthrough.json [<after.json>]` exits 1 unless: the before-walkthrough was submitted; every request row (one with `decided`, or one he commented on) has an after row `"from": "<before step>/<row>"` or is named by an after row `"dropped": "<why>"`; every check left on has a result row; the after-build deck carries the two lists above; and the after-build deck was submitted with no change asked (a change, edit, marked area, fail/unclear status, a No, or any note) and no "Yours to change" row not looked at (rows settled in an earlier round of a growing deck are skipped). It compares against the before-walkthrough exactly as he saw it: the build stamp records the full `commit`, `spec_sha256` (a fingerprint of the spec as built) and `spec_dirty`; the gate uses the version whose fingerprint matches (the committed one, else the `<stem>.as-built.<fingerprint>.json` copy `build` keeps when the spec was not committed, else the file now) and FAILS when none matches. The after-build spec must still match the fingerprint of the build he answered, or the gate fails (edited after his submit). An answers file with no fingerprint is read the old way and the gate says it could not check.

## Wording

Wording is never asked before the build and never as a text box per label. After the build: `node scripts/shoot/shoot.mjs <screen> --page --themes <one> --out <folder>` saves `<theme>.html` (the screen's own elements and styling, all code removed by `scripts/shoot/freeze.mjs`); copy it beside the spec and add `{"id", "words": true, "surface", "path", "headline", "screen": "<file>.html"}` with no `calls`, `options`, `today` or `answer`. The deck shows it in a frame opened zoomed on the screen's panel (up to 1.5×; "Whole screen" shows all). Every run of text, and the grey hint in an empty box, can be clicked and retyped; nothing can be pressed. Each change is listed under the frame with "Put back" and saved as `answers[step].edits[<key>] = {from, to, state}`; the summary prints `reword "old" → "new" — seen with: <state>`. A screen left alone is accepted when he moves on.

- Edits are keyed by the original words (a second identical text is `words #2`; over 80 characters: first 60 plus the length), so a change reappears wherever the same words are found; edits in a state he left stay listed, dimmed. `state` is a line read off the frozen screen (dialog title, selected tabs, opened controls) so a session can re-open the screen. Old `edits[<n>] = {from, to}` still read.
- Only text inside the screen's panel that is really visible is editable, never `[data-entry-key]`, `.quick-chip`, `.status-bar`, `[data-model-chip]`, `.input-bar-container`, `[data-session-strip]` (one person's own state). Text drawn at run time (terminal, chart) cannot be edited.
- **`"liveScreen": "settings/about"`** (a `shoot --list` name; the deck needs `live.worktree`; `screen` optional) adds a switch **Use it / Edit words** when served and the practice app builds: Use it runs the app in the frame on that screen, Edit words freezes it as it stands (same `freeze.mjs`). Plain file, `--no-live`, or a failed build: no switch, the saved file shows. The practice app is built like live panes (`serve.py _ensure_app`).
- Saved screens are scrubbed (handlers, `javascript:` addresses, meta refresh, form targets, objects, remote pictures, `@import`), framed without scripts, and the builder refuses one still carrying any (`spec.live_code_in`); re-save an old one.
- **Early, on a mockup, only when he asks:** give a `screen` step on any frozen `.html` beside the spec (a subfolder is fine): a saved `shoot --page` file, or a static page at `mock/<name>.html` with `<html data-frozen="WxH" data-frozen-panel="x,y,w,h">`, inline styles, no script, handler or network load.

## What the builder refuses

`build` writes no page when any of these hold; each names the step and the field.

- **Every step:** missing `id`, `surface`, `path`, `headline`; duplicate `id`; headline over 25 words; a code word (`token`, `selector`, `component`, `reducer`, `handler`, `prop`, `props`, `ipc`, `react`, `dom`, `css class`, `tailwind`, `primitive`, `z-index`) in text he reads; `themes` not a non-empty list; any field starting `TODO:` (`selfie` writes them on purpose).
- **Questions:** missing `today`/`problem`/`proposal`; an inline label (`Today:`, `Problem:`, `Proposal:`, `Pro:`, `Pros:`, `Con:`, `Cons:`, `Upside:`, `Downside:`) in those fields or `summary`; "(recommended)" in a label; two recommended options; an option with no pros, cons or summary; `pick` not `"one"`/`"several"`, or `"several"` with nothing to pick; a typed answer with a list to pick from; `prompt` without `"answer": "words"`; a words step carrying `crop`, `clip`, `highlight`, `variants` or `live`; over the word caps (60 per part, 25 per pro/con).
- **Lists:** mixed rows (above); a `run`/`skip` row without `more`; `wording` rows; a `before` with no `picture`; a picture path that is absolute, has `..`, or is missing; `list` / `built` / `check` misuse (above).
- **Page markers:** extra fields, no title, in a deck with pictures or a contract, an empty page.
- **Pictures:** missing or unknown crop, an unresolved highlight, one picture with nothing to compare (needs a highlight), `"auto"` without a before and after, `runs` naming an uncaptured run; list crops (fewer than two pieces, nesting, extra piece fields, unknown piece, label over four words or with a banned word, `"panel"` needing ONE shoot screen); `"new"` must be true or absent and is for ONE picture with no before (not choice or decide).
- **Stages:** unknown `stage`; a `"<stage>"` deck missing its slide; growing refusals above; `build` not `before`/`after`.
- **Warnings** (printed, page still written): more than three options; a hand `box`; `measured` with no digit; `risk` over 40 words; a shared `images` folder; choice pictures of different widths; a picture over 5 times wider than tall.

## The answers file

`<spec stem>.answers.json`, written on every click and again on Submit:

    {"deck": "<key>", "started": "<iso>", "submitted": "<iso>",
     "built": {"at": "<iso>", "commit": "<full hash>", "spec_sha256": "<hash>", "spec_dirty": true, "ids": [...]},
     "answers": {"<step id>": {"v": "yes|no|other|pick|picks|wrote", "t": "<when>",
                               "pick": "<option or variant id>", "note": "…",
                               "changes": {}, "ok": {}, "results": {}, "marks": [], "edits": {}, "attach": {}}},
     "notes": "…", "pageNotes": {}, "reopened": {}}

A note carries no tag; old files with `note_kind`, `dk`, `asks` or `accepted` still load. Each answer's time `t` shows beside "answered" and on the finish screen; `built` (when and from which version the deck was built) rides along. Serving a deck whose answers were submitted: if the page on disk is the SAME build he answered, the submitted copy is kept as `<stem>.answers.<when>.json` and the deck reopens with his answers, editable, under a line saying when he sent them (`sent_before`); a second Submit replaces the first. A REBUILT deck starts empty, so re-serve an answered deck with `serve --no-build`. The archive of a submitted review is never overwritten.

**The finish screen** replaces the step on submit: a tick, "Feedback submitted", every answer read back in a table with labels (never ids) and named as the page does ("Page 2, Question 3 of 3"); `‹ Back to the deck` and the header's `Submitted ✓` toggle; the deck is read-only after. Reopened, it lands on the finish screen. The page says "Sent. You can close this tab." While served, `<stem>.serve.json` holds the pid and URL (a second `serve` of the same spec refuses; the page you are looking at is the file the server started on, so rebuild and ask him to reload). Saves are locked with their own temp file, a saved `submitted` is never removed by a later autosave, non-object bodies get 400, symlinks leaving the deck folder are not served, a recording is cancelled when the page stops polling, and a page flushes a pending save when its tab hides.

**The printed summary** (`serve` prints it on submit; `wait` and `record` print the same; its exit is the signal the review is over):

    saved-searches-questions · submitted 2026-09-05 04:58 · 2 yes · 0 no · 1 other · 2 picked · 0 skipped
    Q-1 yes
    Q-2 pick under-box — "keep it to three"
    Q-3 other

One line per step in spec order, markers skipped; `pick <id>`, `none` is *None of these*, `other` is Other. Changed rows, areas, words, attachments and tick states print under their step: `ticked as fine — N rows`, `not looked at — "<row words>"`, `area N on row <id> ("<row words>")`, `reword …`, `attached to <box> — picture "…" saved at <path>`. `summaryOf(state)` in `page.js` and `summary()` in `serve.py` print the same text for the same state (a test feeds one state to both).

## Themes

A deck opens on the theme Destin's app is on, read from `~/.claude/youcoded-appearance.json` (a plain file, never held open): that theme moves to the front of `themes`, or is added when the deck has no pictures or its crops for it exist. When nothing was shot in it `build` says so and opens on the spec's first theme. `--theme <slug>` overrides; `"theme": "fixed"` keeps the spec's order. A theme whose manifest names a font family is drawn in it (a Google Fonts address is loaded when the deck opens).

## History on a non-growing deck

`"earlier": ["<older round>.json", …]` (spec files beside this one, newest first) and `"related": [{"title", "path", "how"}]` (`how`: one line, 40 words) add a History button to the header listing each earlier round's questions with his answers read-only, and the related decks as small buttons at the top of the first page. One topic, one folder. A growing deck has no History button and ignores both.

## Design rules for what a deck draws

Buttons follow the design guide: one filled button per view (the foot's Next / Done / header Submit), everything else outlined in `--edge-strong`, never a green or red outline; the chosen answer is an accent outline with a tick; the note box is at the left and Yes / No / Other at the right of one line. The card state pill is a status, not a control (a tinted pill with a dot); a list has none until it has something to say. **No coloured bar at the left edge of anything** ("fingernail styling"): his words are quoted and italic, nothing more; a test fails the page if any element has one. Never restate in words what the layout shows. In drawings made for him keep what is the deck's own, do not dress a deck as an app screen, and add no status words beside controls that already show the status. Bare text without a card is ignored as clutter.

## Commands

    python3 scripts/ui-review/review-cards.py <command> …

| Command | What it is for |
|---|---|
| `build <spec> [--theme SLUG]` | cut crops, resolve highlights, write the page; refuses (no page) on any rule above |
| `preview <spec> [--sizes 1440x900,1280x800,1024x768] [--themes …] [--out DIR]` | the built deck as pictures, one per page × size × theme plus `contact.png` (and `contact-<theme>.png`), in `<spec dir>/preview/<spec name>/` (emptied first). **Read the contact sheet before you serve.** Needs `google-chrome-stable` (exit 2 without, 1 if the page logged an error) |
| `serve <spec> [--port N] [--timeout MIN] [--no-build] [--no-live]` | build, serve on 127.0.0.1, save answers as they arrive, exit on submit. Prints `[deck] http://…` and opens nothing: put it in chat as the last line of your turn. Run in the background |
| `wait <spec> [--timeout MIN]` | block on the answers file alone |
| `record <spec> '<pasted summary>'` | write the submitted answers file from the page's copy box, for a deck he answered as a plain file |
| `selfie [--before <ref>] [--out DIR] [--dry-run]` | the deck code reviewed on a deck: renders a fixture of every kind with the code at `--before` (default `origin/master`) and with this worktree's, writing an approve deck of the two. Run it for any change to `page.css`, `page.js`, `page.html.tmpl` or `deck/fixture/`. It does not serve; every `headline` / `changed` comes out `TODO:` for you to write |
| `walkthrough-check <before.json> [<after.json>]` | the done gate (above) |
| `contract-check <feature>.contract.json`, `acceptance <contract>` | old contract work only |

## Order of work

1. Copy the template for the kind you need; write the steps. 2. `build`; fix every refusal. 3. `preview`; read `preview/<spec name>/contact.png` (single pages when the sheet is too tall): a defect you see is one he would see. 4. `serve` in the background; put the printed `[deck] http://…` line last in chat, and stop. 5. Its exit is the notification; read the summary.

A deck he has ALREADY answered is re-served with `serve --no-build`, never rebuilt (rebuilding a historical deck "fixes" the record; ten old specs no longer build against today's fields, which is correct, leave them). A growing deck is the exception: you rebuild it each round.

## Tests

`cd scripts/ui-review && python3 -m unittest discover -s tests -p 'test_*.py'` (specs, words, grows, gate, rethink, serve, build, cli; no browser for most), `node --test tests/deck-render.test.mjs` (renders the page; needs Chrome, about four minutes) and `bash tests/close-out-contract.test.sh`. Tests that pin the rules above: `test_words.py` (questions), `test_rethink.py` (lists, after-build lists, summaries), `test_grows.py` (growing decks and earlier-round isolation), `test_gate.py` (the done gate), `test_spec.py`, `test_serve.py`.

## The header and the kind of work
The yellow header reads `REVIEW DECK | <TAG>: <title> | <date built>`. `"tag"` is required on a growing deck: `"feature"`, `"bug"`, `"optimization"`, or one short word of your own (up to 20 letters, no colon); it is shown in capitals before the title. The date stands alone; the round and the version are only in its hover text and the answers file (Destin, 2026-11-18). A words step's `changed` box is headed by its page's stage: "What this means" (Understanding), "What would change" (Design), "What will change" (Before build), "What changed" (After build and decks without stages).
