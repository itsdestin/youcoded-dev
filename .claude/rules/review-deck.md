---
paths:
  # Workspace-root paths, written plainly (see feature-flow.md): a worktree session's project
  # root IS the worktree, so the plain form fires there too.
  # docs/active/reviews/ holds review FILES (.md), never deck specs, so it is not listed:
  # audit-anchors.mjs fails a glob that matches nothing tracked.
  - "docs/active/design/**/*.json"
  - "scripts/ui-review/deck/**"
  - "scripts/ui-review/templates/**"
last_verified: 2026-09-05
verify:
  - path: scripts/ui-review/templates/questions.json
  - path: scripts/ui-review/deck/AUTHORING.md
  - path: scripts/ui-review/deck/preview.py
  - path: scripts/ui-review/deck/selfie.py
  - test: scripts/ui-review/tests/test_words.py
---

# Review deck — the one surface Destin answers on

`python3 scripts/ui-review/review-cards.py <command> <spec.json>`. Every question, choice,
approval and sign-off is a step on it; there is no second page.

## Pick the kind, copy its template (`scripts/ui-review/templates/`)

| You want Destin to… | Kind | Spec shape | He answers | Template |
|---|---|---|---|---|
| approve a change he can see | **Approve** | `crop` + `changed` + `notice`, two runs | Yes keep it / No revert it | `approve.json` |
| approve something not built yet, over a picture of today | **Brief** | same, one run (`runs: {today}`) | Yes build it / No leave it | `brief.json` |
| pick between several pictures of ONE thing | **Choice** | `variants[]`, each with a `crop` | pick one / None of these | `choice.json` |
| pick between written options over one picture | **Decide** | `crop` + `highlight` + `options[]` | pick one | `decide.json` |
| judge motion, hover or a transition | **Clip** | `clip`, from `record-pair.sh` | Yes / No | `clip.json` |
| operate the real thing — drag, hover, resize | **Live** | `live` panes, `variants` for pick-one | Yes / No, or pick one | `live.json` |
| answer questions before anything is drawn, or decide in words | **Question** | `words: true` + the parts below, page markers | Yes / No / Don't know, or pick one | `questions.json` |
| sign off the definition of done | **Contract** | `rows[]` | Yes that is done / No | `contract.json` |
| accept the graded contract | **Acceptance** | written by `review-cards.py acceptance` | Yes accept / No | (generated) |

Other, with a note, is on every step. Several designs of one thing are ONE Choice step, never a
yes/no each. A step whose picture exists in one theme carries its own `themes`.

## A question deck is pages he scrolls
**Invariant:** questions share one page until a page marker (`{"id", "page", "intro"}`) starts
the next; add one only where the thinking shifts. **Why:** "my mindset should stay in the same
place for each set of questions" (Destin, 2026-09-04). **Guard:** `test_words.py`.

## A question carries its four parts as fields
**Invariant:** `today`, `problem`, `proposal`, and `options[]` carrying `pros`, `cons`, at most
one `recommended: true`. "Today: … Pro: …" in a sentence, or "(recommended)" in a label, is
refused by field name. **Why:** structure in the tool, not in a session's memory — 28 of 28
options drifted in two days. **Guard:** `test_words.py`.

## Look at it before he does
**Invariant:** `preview <spec>`, then READ `preview/contact.png`, before `serve`. **Why:** four decks went
out in a day with a visible defect. **Guard:** none — candidate (`test_cli.py` covers `preview`
itself, not the habit).

## A change under `deck/` is reviewed on a deck
**Invariant:** an edit to `page.css`, `page.js`, `page.html.tmpl` or `deck/fixture/` ships only
after `selfie` has shown Destin before and after. **Why:** the deck is a UI, reviewed like any
other surface. **Guard:** none — candidate.

## The deck opens on the theme his app is on
**Invariant:** never hand-order `themes` — `build`/`serve` read the app's theme; `--theme`
overrides, `"theme": "fixed"` pins a one-theme deck. **Why:** every deck opened on
Midnight while his app was on Golden Sunbreak. **Guard:** `test_spec.py`.

## The link goes in chat as the last line of the turn
**Invariant:** `serve` prints `[deck] http://…` and opens nothing; paste that line last, stop.
**Why:** the app opens a pasted link when he is ready (Destin, 2026-09-05). **Guard:** none — candidate.

Depth — fields, page grammar, refusals, the answers file, every command:
`scripts/ui-review/deck/AUTHORING.md`.
