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

`python3 scripts/ui-review/review-cards.py <command> <spec.json>`; copy `scripts/ui-review/templates/<kind>.json`. Every field and refusal: `deck/AUTHORING.md`.

## Pick the kind

| You want Destin to… | Kind |
|---|---|
| approve a change he can see | **Approve** |
| approve something unbuilt (`"new": true` once built) | **Brief** |
| pick between pictures of ONE thing | **Choice** |
| pick between written options over a picture | **Decide** |
| judge motion | **Clip** |
| operate a design or real screen / say it WORKS in a dev window | **Live** / **Try-it** |
| answer in words | **Question** |
| see a whole piece of work, before and after | **Walkthrough** |
| retype on-screen wording AFTER the build | a **screen** step |

Contract and Acceptance decks are retired. Several designs of one thing are ONE Choice slide.

## One growing deck per feature
**Invariant:** `"grows": true`: one spec re-built each round, AT one `"stage"`; a change he asked for needs `reopened` or `resolved`; answered topics fold into "Previously answered"; every current-stage page has a bar (finished green first). A page is a heading + one line; a title, row or page line citing a round or step id is refused (use `more`). An open row's `more` is today/problem/change; `"visual": true` needs a `picture`. Saved state carries its build stamp and other builds' state is refused. A page comment, general note or note on an unanswered step is never dropped: the next build is refused until `notes_handled` says what was done. After the build the deck needs the lists "What changed while building" and, once the code review ran, "Found in review". A hands-off deck (`"hands_off": "<his words>"`, stage `after` only) adds "What you asked for" and "Choices I made for you".
**Why:** "sticky note" (round 8); "not editing prior sections" (round 11). **Guard:** `test_grows.py`, `test_rethink.py`, `test_hands_off.py`, `deck-render.test.mjs`.

## Lists: one kind of row per card
**Invariant:** a words step with `calls` is ONE kind: facts (`context: true`), his to change (a tick and a pencil per row; a row neither ticked nor changed is "not looked at", never approved), or results (every row a `result`; run/skip checks carry `more`). Mixed lists are refused. `trail`, `more`, `reuse`, `picture`/`before` follow AUTHORING.md; no "Details" fold. Each page ends with a comment box.
**Why:** "why is it the only row in this card that has the… chip?" (round 8). **Guard:** `test_rethink.py`, `test_serve.py`, `deck-render.test.mjs`.

## Wording is edited on the real screen, after the build
**Invariant:** no text box per label. A `screen` step edits `shoot --page`'s scrubbed still copy; `liveScreen` adds Use it / Edit words. Only if he asks earlier: a frozen mockup (`mock/<name>.html`).
**Why:** boxes were "terrible". **Guard:** `deck-render.test.mjs`, `freeze.test.mjs`.

## A slide decides, not the deck
**Invariant:** `runs`/`labels`, `"pick": "several"`, `"answer": "words"` sit on the SLIDE. **Guard:** `test_spec.py`, `test_words.py`.

## Questions have four fields
**Invariant:** questions share a page until a marker (`{"id", "page", "intro"}`). Each carries `today`, `problem`, `proposal`, `options[]` (`pros`, `cons`, at most one `recommended`); inline "Today: …" is refused. Every Today says how it was checked (`checked`).
**Guard:** `test_words.py`.

## Look at it before he does
**Invariant:** `preview <spec>`, READ `preview/<spec name>/contact.png`, then `serve` (answered decks: `--no-build`); paste the printed link as the turn's last line. A change under `deck/` ships only after `selfie` shows him before and after.
**Guard:** `test_cli.py`.

## Themes and pictures
**Invariant:** never hand-order `themes` (the deck opens on his app's theme; `--theme` overrides, `"theme": "fixed"` pins). A picture step shows ONE full-window shot. **Guard:** `test_spec.py`.
