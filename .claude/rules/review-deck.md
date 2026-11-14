---
paths:
  # Workspace-root paths, written plainly (see feature-flow.md): a worktree session's project
  # root IS the worktree, so the plain form fires there too.
  # docs/active/reviews/ holds review FILES (.md), never deck specs, so it is not listed:
  # audit-anchors.mjs fails a glob that matches nothing tracked.
  - "docs/active/design/**/*.json"
  - "scripts/ui-review/deck/**"
  - "scripts/ui-review/templates/**"
last_verified: 2026-11-12
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

Contract and Acceptance decks are retired (`feature-flow.md`). Several designs of one thing are ONE Choice slide.

## One growing deck per feature
**Invariant:** `"grows": true` (`templates/growing.json`): one spec per feature, re-built each round; answered topics sit in one "Previously answered" card, each drawn as its original card, locked, with every round's answer (`answered` may be a list of `{round, given}`); a change he asked for needs `reopened` or `resolved`. The deck is AT one `"stage"`; a finished stage is opened from its name in the stage line (marked Finished, no Reopen); an open topic there is refused. A page is a heading and ONE line (max 160 characters); no question numbers or "page N of M". A title, row line or page line citing a round or step id is refused: say it plainly, put the source in `more`. **Why:** "sticky note" (8); "not editing prior sections" (11); "wouldn't know off the top of my head" (12). **Guard:** `test_grows.py`, `deck-render.test.mjs`.

## Lists: one kind of row per card
**Invariant:** a words step with `calls` is a list of ONE kind, named at its head: facts
(`context: true`: no pencils, never answered or counted), his to change (a tick and a pencil per row,
no status words; a row he neither ticked nor changed is "not looked at", never approved), or results (every row a `result`; run/skip checks carry
`more`). Mixed lists are refused. No "Details" fold: a row's `trail` is plain lines above its
words, `more` behind a small More (growing decks) or labelled lines below, `reuse` behind an (i).
`picture`/`before` are Attachments tiles.
`state` is a group heading. A pencil pressed again keeps the comment; the bin removes it. Each page
ends with a comment box. A re-served deck of the same build reopens with his answers.
**Why:** "why is it the only row in this card that has the… chip?" (round 8); round 9, K-1, V-1,
Q-3, Q-4. **Guard:** `test_rethink.py`, `test_serve.py`, `deck-render.test.mjs`.

## Wording is edited on the real screen, after the build
**Invariant:** no text box per label. A `screen` step edits `shoot --page`'s still copy, scrubbed of
anything that runs and framed without scripts; `liveScreen` adds Use it / Edit words. **Why:** boxes
were "terrible" (2026-11-10). **Guard:** `deck-render.test.mjs`, `freeze.test.mjs`.

## A slide decides, not the deck
**Invariant:** `runs`/`labels`, `"pick": "several"`, `"answer": "words"` sit on the SLIDE. **Why:** deck-level shapes split one ask across decks. **Guard:** `test_spec.py`, `test_words.py`.

## Question decks are pages; a question has four fields
**Invariant:** questions share one page until a marker (`{"id", "page", "intro"}`). Each carries `today`, `problem`, `proposal`, `options[]` (`pros`, `cons`, at most one `recommended`); inline "Today: …" is refused. Every Today says behind its (i) how it was checked (`checked`). **Why:** stale Todays were the worst fault. **Guard:** `test_words.py`.

## Look at it before he does
**Invariant:** `preview <spec>`, READ `preview/<spec name>/contact.png`, then `serve` (answered decks: `--no-build`); paste the printed link as the turn's last line. An edit under `deck/` ships only after `selfie` shows him before and after. **Why:** four bad decks in a day. **Guard:** `test_cli.py`.

## Themes and pictures
**Invariant:** never hand-order `themes` (the deck opens on his app's theme; `--theme` overrides,
`"theme": "fixed"` pins). A picture step shows ONE full-window shot. **Guard:** `test_spec.py`.
