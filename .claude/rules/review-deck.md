---
paths:
  # Workspace-root paths, written plainly (see feature-flow.md): a worktree session's project
  # root IS the worktree, so the plain form fires there too.
  # docs/active/reviews/ holds review FILES (.md), never deck specs, so it is not listed:
  # audit-anchors.mjs fails a glob that matches nothing tracked.
  - "docs/active/design/**/*.json"
  - "scripts/ui-review/deck/**"
  - "scripts/ui-review/templates/**"
last_verified: 2026-09-06
verify:
  - path: scripts/ui-review/templates/questions.json
  - path: scripts/ui-review/deck/AUTHORING.md
  - path: scripts/ui-review/deck/preview.py
  - path: scripts/ui-review/deck/selfie.py
  - test: scripts/ui-review/tests/test_words.py
---

# Review deck — the one surface Destin answers on

`python3 scripts/ui-review/review-cards.py <command> <spec.json>`. Every question, choice and
sign-off is a slide.

## Pick the kind, copy `scripts/ui-review/templates/<kind>.json`

| You want Destin to… | Kind | He answers |
|---|---|---|
| approve a change he can see | **Approve** | Yes keep it / No revert it |
| approve something not built yet | **Brief** | Yes build it / No leave it |
| pick between pictures of ONE thing | **Choice** | pick one / None of these |
| pick between written options over a picture | **Decide** | pick one |
| judge motion or a transition | **Clip** | Yes / No |
| operate a design, or a real screen | **Live** | Yes / No, or pick one |
| say whether it WORKS, in a dev window | **Try-it** | Yes it works / No |
| ask anything answered in words — unbuilt, or already built | **Question** | Yes / No / Don't know, or pick one |
| sign off the definition of done | **Contract** | Yes that is done / No |
| accept the graded contract | **Acceptance** | Yes accept / No |

Other + a note is on every slide. Several designs of one thing are ONE Choice slide, never a
yes/no each. A slide shot in one theme carries `themes`.

**A trade-off is a Question, even when the thing already works.** Hung off an Approve slide
it reaches him as a picture he has seen and three ideas in one paragraph — on 2026-09-09 that
came back as "confused". If "should it" fits your headline, it is a Question.

## A slide decides, not the deck
**Invariant:** `runs`/`labels` (which pictures), `"pick": "several"` and `"answer": "words"` sit
on the SLIDE, so one deck holds a "build it?" picture, a before/after pair and a typed answer.
`"stage"` — ask/design/contract/review/accept — checks that stage's slide is there, and forbids
nothing. **Why:** deck-level shapes split one ask across decks (2026-09-06).
**Guard:** `test_spec.py`, `test_words.py`.

## A question deck is pages he scrolls
**Invariant:** questions share one page until a marker (`{"id", "page", "intro"}`) starts the
next; add one only where the thinking shifts. A contract deck is never paged. **Why:** "my mindset
should stay in the same place for each set of questions" (2026-09-04). **Guard:** `test_words.py`.

## A question carries its four parts as fields
**Invariant:** `today`, `problem`, `proposal`, and `options[]` with `pros`, `cons`, at most one
`recommended: true`. Inline "Today: … Pro: …" or "(recommended)" in a label is refused.
**Why:** 28 of 28 options drifted in two days. **Guard:** `test_words.py`.

## Look at it before he does
**Invariant:** `preview <spec>`, READ `preview/contact.png`, then `serve`; re-serve an answered
deck with `--no-build`. **Why:** four defective decks in a day; rebuilding "fixes" a past
decision. **Guard:** candidate.

## A change under `deck/` is reviewed on a deck
**Invariant:** an edit to `page.css`, `page.js`, `page.html.tmpl` or `deck/fixture/` ships only
after `selfie` has shown him before and after it. **Why:** five generated steps read as "no idea
what i'm looking at". **Guard:** `test_cli.py`. Depth for every field: `deck/AUTHORING.md`.

## The deck opens on the theme his app is on
**Invariant:** never hand-order `themes` — `build`/`serve` read the app's; `--theme` overrides,
`"theme": "fixed"` pins. **Why:** every deck opened on Midnight. **Guard:** `test_spec.py`.

## The link goes in chat as the last line of the turn
**Invariant:** `serve` prints `[deck] http://…` and opens nothing; paste it last, stop.
**Why:** he opens it when ready. **Guard:** candidate.
