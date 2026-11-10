---
paths:
  # Workspace-root paths, written plainly like landing-page.md's `scripts/ui-review/**`:
  # the audit's glob check requires a slash before a `**/` prefix, so `**/scripts/…`
  # matches nothing at the root. A worktree session's project root IS the worktree, so
  # the plain form fires there too.
  - "scripts/ui-review/deck/**"
  - "scripts/ui-review/review-cards.py"
  - "scripts/ui-review/contract-agent.md"
  - "scripts/ui-review/code-reviewer.md"
  - "scripts/ui-review/ux-tester.md"
  - "scripts/ui-review/grader.md"
  - "scripts/ui-review/tester-kit.md"
  - "docs/active/design/**"
  - "scripts/close-out.sh"
last_verified: 2026-11-10
verify:
  - path: scripts/ui-review/deck/contract.py
    contains: "def check_contract"
  - path: scripts/ui-review/contract-agent.md
  - test: scripts/ui-review/tests/test_contract.py
  - test: scripts/ui-review/tests/test_words.py
  - path: scripts/ui-review/templates/walkthrough.json
  - test: scripts/ui-review/tests/test_rethink.py
---
# Feature flow — the deck is the one surface

From Destin's answers, rounds 1–6, `docs/active/design/2026-11-09-review-deck-rethink/`.
No contract or acceptance deck. He may ask for another order on any build.

## The order
1. **Explore first:** the screens, their code, his earlier decisions on the subject.
2. **First deck.** Page 1, "Here is how I understand this": statements about what exists and
   what he wants, each marked Holds / Fails. Then scope and hard-rule questions, and one
   large skippable box for how he pictures the screens and the path.
3. **Design decks.** Two to four drawn designs per screen; he picks or combines. Repeat.
4. **Walkthrough before the build**, ending in the checks menu.
5. **Build**; the checks he switched on run.
6. **Walkthrough after the build** — the main steering round. Finished when every request he
   made is a row in the before-walkthrough AND he goes through the after one changing nothing
   (rounds 1–2, R-9). Nothing merges without his word.
7. **Wording pass** on the real screens (`screen` steps), last.

Small work with clear direction may start at step 6; ask first.
**Why:** round 6, S-1. **Guard:** none — candidate.

## What is asked, shown, listed, never shown
**Invariant:**
- **Asked in words, early:** scope and hard rules — in for now, later, must not change,
  money, privacy, anything that removes or changes an existing control, and where his
  understanding and yours may differ.
- **His to decide, early, on drawings (never as a words-only question):** layout, placement,
  the path between screens, how parts and functions affect each other (round 2, R-4).
- **Listed as rows:** **defaults and phone layout first** (he cares), then failure and empty
  states, sizes, order, speed.
- **Wording:** never before the build.
- **Unsure which group → list it** (round 2, R-5); never decide silently.
- **Never shown:** code organisation, libraries, a reviewer's raw report (one status row
  instead). Tests added or removed ARE shown, in plain words.

**Why:** 784 answered decks analysed (round 5, F-1). **Guard:** none — candidate.

## Reuse the app's own parts
**Invariant:** for each screen, list the kinds of parts it needs, review every existing
YouCoded part that could do the job, adopt them, and record on each design what is reused
and what is new, behind its (i) — not as chat or questions.
**Why:** "match the rest of the app": 196 of his notes. **Guard:** none — candidate.

## The walkthrough, before and after the build
**Invariant:** one deck (`scripts/ui-review/templates/walkthrough.json`), same pages both times:
what you asked for (his words quoted) · every changed screen · behind the scenes · choices I
made · checks, then what is left for him to try. After the build add: each hard rule he
stated, as a check with its result; anything on screen in no approved picture, marked "new,
not shown before". Each page's first line says what he is judging. Rows stand unless
changed; a background-only list is `context: true`.
**Why:** his surprises were unapproved elements and broken early rules.
**Guard:** `test_build.py`, `test_rethink.py`.

## The checks menu
**Invariant:** before the build the Checks page lists every suggested check and reviewer
(`scripts/ui-review/{code-reviewer,ux-tester}.md`) with a Will run / Skip switch; each row
says what it does, what comes back, and why it is or is not suggested for THIS build.
Preparation (reading the design guide) is not a check. Suggest the code reviewer on for
security, his data, background work or several devices. After the build each chosen check
is a row with its status — his to change — and proof. Never report a check not run.
**Why:** round 6, Q-1; the code reviewer has the strong record. **Guard:** none — candidate.

## Records
**Invariant:** `docs/**/*.answers.json` are tracked; a contradiction with something approved
goes on a deck; each round names its `earlier` rounds. **Guard:** none — candidate.

## The build stage
**Invariant:** technical design → reviewer rounds in
`docs/active/reviews/<date>-<feature>-design-review-<n>.md` (cap three) → tasks → build,
checking `.claude/rules/performance.md` and past speed lessons (round 6). Reviewers get the
answered before-walkthrough.
**Guard:** none — candidate.

## Older work with a contract
**Invariant:** a feature with a signed `<feature>.contract.json` finishes under it
(`review-cards.py contract-check`, `close-out.sh`). Write no new contract.
**Guard:** `test_contract.py`, `close-out-contract.test.sh`.
