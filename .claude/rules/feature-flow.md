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
  - path: scripts/ui-review/deck/gate.py
    contains: "def check_gate"
  - test: scripts/ui-review/tests/test_gate.py
---
# Feature flow — the deck is the one surface

No signed contract: the walkthroughs replace it. Depth: `scripts/ui-review/deck/AUTHORING.md`.

## The order
1. **Explore first:** screens, code, his earlier decisions.
2. **First deck.** "Here is how I understand this" (Holds / Fails), then scope and hard-rule questions, and one skippable box for how he pictures the screens.
3. **Design.** Two to four drawn designs per screen. Steps 2-7 are ONE growing deck per feature (`"grows": true`), AT one `"stage"` you advance; never a new deck per step.
4. **Before-build walkthrough**, ending in the checks menu.
5. **Build**; the checks he switched on run, then the grader, then a list "What changed while building": each row built as planned, or adjusted and why.
6. **After-build walkthrough**, the main steering round. Finished when `review-cards.py walkthrough-check <before.json>` passes: every request is a row (`"from"`, or `"dropped"` with why), every check left on has a result, both lists are there and answered, and he changes nothing. No merge without his word.
7. **Wording pass** on the real screens (`screen` steps), last.

Small clear work may start at step 6; ask first. **Guard:** `test_gate.py`, `test_rethink.py` (an after-build deck without the two lists is refused).

## What is asked, shown, listed, never shown
**Invariant:**
- **Asked in words, early:** scope and hard rules (money, privacy, anything that removes or changes a control, where understandings differ).
- **Decided on drawings, early, never in words:** layout, placement, the path between screens, how parts interact.
- **Listed as rows:** defaults and phone layout first, then failure states, sizes, order, speed. Unsure: list it.
- **Wording:** last, on real screens (early only if he asks, on a mockup).
- **Never shown:** code organisation, libraries, a reviewer's raw report (each finding is a "found in review" row). Tests added or removed ARE shown, plainly.

**Why:** 784 decks analysed. **Guard:** none — candidate.

## Reuse the app's own parts
**Invariant:** per screen, adopt every existing part that could do the job and record what is reused and new behind each design's (i), never in chat.
**Why:** "match the rest of the app": 196 of his notes. **Guard:** none — candidate.

## The walkthrough, before and after
**Invariant:** one deck (`templates/walkthrough.json`), same pages both times: what you asked for (his words) · every changed screen · behind the scenes · choices I made · checks, then what is left for him. After the build add each hard rule he stated as a checked row, and mark anything in no approved picture "new, not shown before".
**Why:** his surprises were unapproved elements. **Guard:** `test_build.py`, `test_rethink.py`.

## The checks menu
**Invariant:** before the build the Checks page lists every check and reviewer (`scripts/ui-review/{code-reviewer,ux-tester}.md`) with Will run / Skip and why for THIS build. **On unless he switches them off:** code review, tracing rows to answers, the fresh grader (`grader.md`), the done gate; the UX tester is off unless asked. A comment on a check goes to that checker. After the build each chosen check is a row with status and proof; the code review's row carries `"check": "code-review"`, each finding is a "found in review" row. Never report a check not run.
**Why:** rounds 6, 9. **Guard:** `test_gate.py`.

## Records
**Invariant:** `docs/**/*.answers.json` are tracked; older separate decks of a feature live in its `earlier-rounds/`. **Guard:** `test_grows.py`.

## The build stage
**Invariant:** design → reviewer rounds in `docs/active/reviews/<date>-<feature>-design-review-<n>.md` (cap three) → tasks → build (`.claude/rules/performance.md`). **Guard:** none — candidate.

## Older work with a contract
**Invariant:** a feature with a signed `<feature>.contract.json` finishes under it (`contract-check`, `close-out.sh`). Write no new contract.
**Guard:** `test_contract.py`, `close-out-contract.test.sh`.
