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

`python3 scripts/ui-review/review-cards.py <command> <spec.json>`. Every question, choice and
sign-off is a slide.

## Pick the kind, copy `scripts/ui-review/templates/<kind>.json`

| You want Destin to… | Kind | He answers |
|---|---|---|
| approve a change he can see | **Approve** | Yes keep it / No revert it |
| approve something unbuilt (`"new": true`: built, no before) | **Brief** | Yes build it / No leave it (`new`: keep/remove) |
| pick between pictures of ONE thing | **Choice** | pick one / None of these |
| pick between written options over a picture | **Decide** | pick one |
| judge motion or a transition | **Clip** | Yes / No |
| operate a design, or a real screen | **Live** | Yes / No, or pick one |
| say whether it WORKS, in a dev window | **Try-it** | Yes it works / No |
| ask anything answered in words — unbuilt, or already built | **Question** | Yes / No / Other, or pick one |
| show a whole piece of work end to end, before and after building | **Walkthrough** (`walkthrough.json`) | rows stand; a pencil per row to comment or change |
| let him retype on-screen wording, AFTER the build | a **screen** step: `"screen": "<file>.html"` from `shoot <name> --page` | types on a still copy of the real screen |

Contract and Acceptance decks are retired for new work (`.claude/rules/feature-flow.md` → The
finish line); the kinds still build for a feature that already has a signed contract.

Other + a note is on every slide. Several designs of one thing are ONE Choice slide, never a
yes/no each. A slide shot in one theme carries `themes`.

**A trade-off is a Question, even when the thing already works.** Hung off an Approve slide
it reaches him as a picture he has seen and three ideas in one paragraph — on 2026-09-09 that
came back as "confused". If "should it" fits your headline, it is a Question.

## Lists: rows that stand unless he changes them
**Invariant:** a words step with `calls` is a list: one pencil per row, no "All fine" (a list he leaves
alone is accepted when he moves on), `wording` rows refused. A row's `picture` / `before` are an
**Attachments card** at its foot (closed: counts; open: large, comments under each picture; a
`gallery: true` list opens them) — never thumbnails. A list shows a state pill only once it has
something to say; a `context: true` list never does. Any comment box takes pasted pictures and paths as pills.
**Why:** "simplify down to a single pencil"; "rows with images should have an attachements card" (round 7).
**Guard:** `test_rethink.py`, `deck-render.test.mjs`.

## Wording is edited on the real screen, after the build
**Invariant:** never a text box per label. `node scripts/shoot/shoot.mjs <screen> --page` saves a
still copy of the screen; a words step with `screen` shows it zoomed on its popup, every piece
of text editable, changes saved as `edits{n: {from, to}}`. Not before the build.
**Why:** wording boxes were "terrible" (2026-11-10). **Guard:** `deck-render.test.mjs`, `test_rethink.py`.

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
**Invariant:** `preview <spec>`, READ `preview/<spec name>/contact.png`, then `serve`; re-serve an answered
deck with `--no-build`. **Why:** four defective decks in a day; rebuilding "fixes" a past
decision. **Guard:** candidate.

## A change under `deck/` is reviewed on a deck
**Invariant:** an edit to `page.css`, `page.js`, `page.html.tmpl` or `deck/fixture/` ships only
after `selfie` has shown him before and after it. **Why:** five generated steps read as "no idea
what i'm looking at". **Guard:** `test_cli.py`. Depth for every field: `deck/AUTHORING.md`.

## The deck opens on the theme his app is on
**Invariant:** never hand-order `themes` — `build`/`serve` read the app's; `--theme` overrides,
`"theme": "fixed"` pins. **Why:** every deck opened on Midnight. **Guard:** `test_spec.py`.

## One picture per step, live alongside
**Invariant:** a picture step shows ONE full-window shot (several states = several steps), so it
reads at full width; offer the matching live page as optional extra, never instead.
**Why:** "this deck is hard to review cuz the images are small"; then "go back to screenshots…
i also want to be able to test live alongside" (Destin, 2026-10-15). **Guard:** candidate.

## The link goes in chat as the last line of the turn
**Invariant:** `serve` prints `[deck] http://…` and opens nothing; paste it last, stop.
**Why:** he opens it when ready. **Guard:** candidate.
