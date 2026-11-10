---
paths:
  # Workspace-root paths, written plainly (see feature-flow.md): a worktree session's project
  # root IS the worktree, so the plain form fires there too.
  # docs/active/reviews/ holds review FILES (.md), never deck specs, so it is not listed:
  # audit-anchors.mjs fails a glob that matches nothing tracked.
  - "docs/active/design/**/*.json"
  - "scripts/ui-review/deck/**"
  - "scripts/ui-review/templates/**"
last_verified: 2026-11-10
verify:
  - path: scripts/ui-review/templates/questions.json
  - path: scripts/ui-review/deck/AUTHORING.md
  - path: scripts/ui-review/deck/preview.py
  - path: scripts/ui-review/deck/selfie.py
  - test: scripts/ui-review/tests/test_words.py
---

# Review deck — the one surface Destin answers on

`python3 scripts/ui-review/review-cards.py <command> <spec.json>`; copy
`scripts/ui-review/templates/<kind>.json`. Every field: `deck/AUTHORING.md`.

## Pick the kind

| You want Destin to… | Kind |
|---|---|
| approve a change he can see (Yes keep / No revert) | **Approve** |
| approve something unbuilt (`"new": true` once built) | **Brief** |
| pick between pictures of ONE thing | **Choice** |
| pick between written options over a picture | **Decide** |
| judge motion or a transition | **Clip** |
| operate a design or a real screen | **Live** |
| say whether it WORKS, in a dev window | **Try-it** |
| answer anything in words (Yes / No / Other, or pick) | **Question** |
| see a whole piece of work, before and after building | **Walkthrough** |
| retype on-screen wording AFTER the build | a **screen** step |

Contract and Acceptance decks are retired for new work (`feature-flow.md`); they still build for
a feature with a signed contract. Several designs of one thing are ONE Choice slide. A trade-off is a Question even when the thing works.

## Lists: rows that stand unless he changes them
**Invariant:** a words step with `calls` is a list: one pencil per row, no answer button (a list
left alone is accepted when he moves on), `wording` rows refused. A row's `picture` / `before`
(image or short video) sit in an Attachments card, never thumbnails. A list shows a state pill only
once it has something to say. `context: true` is never answered, counted, accepted or listed on the
finish screen. A pencil pressed again keeps a saved comment; the small x removes it. Any comment box
takes pasted pictures and paths as pills. Question decks end every page with a comment box; only
picture-style decks have the header Notes button. Rows may carry `state`, `trail`, `more`, `reuse`; a
run/skip check must carry `more`. **Why:** "simplify down to a single pencil"; "rows with images
should have an attachements card". **Guard:** `test_rethink.py`, `deck-render.test.mjs`.

## Wording is edited on the real screen, after the build
**Invariant:** no text box per label. A `screen` step edits `shoot --page`'s still copy, scrubbed of
anything that runs and framed without scripts; `liveScreen` adds Use it / Edit words. **Why:** boxes
were "terrible" (2026-11-10). **Guard:** `deck-render.test.mjs`, `freeze.test.mjs`.

## A slide decides, not the deck
**Invariant:** `runs`/`labels`, `"pick": "several"`, `"answer": "words"` sit on the SLIDE;
`"stage"` checks that stage's slide exists and forbids nothing. **Why:** deck-level shapes split
one ask across decks. **Guard:** `test_spec.py`, `test_words.py`.

## Question decks are pages; a question has four fields
**Invariant:** questions share one page until a marker (`{"id", "page", "intro"}`); a contract
deck is never paged. Each carries `today`, `problem`, `proposal`, `options[]` with `pros`, `cons`,
at most one `recommended: true`; inline "Today: …" is refused. Every Today says, behind its (i),
how and when it was checked (`checked`). **Why:** stale Todays were the worst fault. **Guard:** `test_words.py`.

## Look at it before he does
**Invariant:** `preview <spec>`, READ `preview/<spec name>/contact.png`, then `serve` (re-serve
answered decks with `--no-build`); paste the printed `[deck] http://…` as the last line of the
turn and stop. An edit under `deck/` ships only after `selfie` has shown him before and after.
**Why:** four defective decks in a day. **Guard:** `test_cli.py`.

## Themes and pictures
**Invariant:** never hand-order `themes` (the deck opens on his app's theme; `--theme` overrides,
`"theme": "fixed"` pins). A picture step shows ONE full-window shot, live page as an extra, never
instead. **Guard:** `test_spec.py`.
