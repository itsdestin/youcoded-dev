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

Rewritten 2026-11-10 from Destin's answers in `docs/active/design/2026-11-09-review-deck-rethink/`.
Order: questions → drawings → **walkthrough (before)** → build → checks he chose →
**walkthrough (after)** → his merge call. No contract deck, no acceptance deck.

## Who decides what
**Invariant:** three groups, sorted by what Destin could notice.
- **Asked** (a question, in the first design rounds): the main paths a person takes, a screen's
  big-picture layout, how parts and functions affect each other, anything removed, money, privacy.
- **Listed** (a row he can change, in the walkthrough): everything else he could notice by using
  the app — wording, what happens when something fails, defaults, sizes, order.
- **Never shown:** only what cannot be detected by using the app.

Unsure → Listed. Never decide an Asked item silently; never ask a Listed one as a question.
**Why:** "i mostly want involvement in core/optimal user flows, big-picture interface design,
how functions/elements interact" (round 2, R-4). **Guard:** none — candidate.

## Short route for small work
**Invariant:** small work with clear direction may skip the questions and the
before-walkthrough; the after-walkthrough (or one review deck) is the first thing he sees. Ask
first. "Wait on the deck" = keep building, no deck until he asks.
**Why:** "just show them to me. this is a simple feature" (2026-09-10). **Guard:** none — candidate.

## Questions before drawing
**Invariant:** opening questions are a words-only deck (`<feature>.questions.json`) holding only
Asked items, with the fields `.claude/rules/review-deck.md` requires; a question about looks
carries a picture. **Why:** a chat answer is not a record. **Guard:** `test_words.py`.

## The walkthrough, before and after the build
**Invariant:** one deck (`scripts/ui-review/templates/walkthrough.json`), shown before building
(drawings, suggested checks) and again after (screenshots, results), same pages both times:
1. What you asked for and what you got — one row per request, his own words quoted.
2. Every screen that changed — all pictures together, before beside after.
3. Behind the scenes — numbered plain steps for logic that has no screen.
4. Choices I made — every Listed item; on-screen wording as editable boxes.
5. Checks — suggested before, results after; then what is left for him to try.

Drop an empty page. Every row stands unless he changes it.
**Why:** "full end-to-end context of a build… every design decision, every screenshot, backend
logic in layman's terms" (2026-11-09); he hated the contract deck.
**Guard:** `test_build.py` (the template validates), `test_rethink.py`.

## The finish line
**Invariant:** work is finished when Destin has gone through the after-walkthrough and changed
nothing. A change he makes is built and the walkthrough shown again. Nothing merges without
his word. **Why:** round 2, R-9. **Guard:** none — candidate.

## Checks are his to steer
**Invariant:** the context-free UX tester, the code reviewer and any other fresh-eyes check
(`scripts/ui-review/{ux-tester,code-reviewer}.md`) are tools, not fixed steps. Before the build
the Checks page suggests which to run and why; he edits the list. After, each one he chose is a
row with pass / fail / unclear and a picture or clip as proof. Never report a check that was not
run. **Why:** round 2, R-8: he directs the checks and wants proof. **Guard:** none — candidate.

## Answers files are committed
**Invariant:** `docs/**/*.answers.json` are tracked; only `scratch/` is ignored.
**Why:** the only record of decisions. **Guard:** none — candidate.

## Reopen only through a deck
**Invariant:** when building contradicts something he approved, show it on a deck (one question,
or the walkthrough again) and wait. **Why:** a chat answer is not a record. **Guard:** none — candidate.

## The build stage is reviewed, capped, recorded
**Invariant:** technical design → reviewer rounds writing
`docs/active/reviews/<date>-<feature>-design-review-<n>.md` (findings accepted / rejected /
already handled; stop on a round accepting nothing, cap three) → task breakdown → subagent
build with a per-task reviewer, both checking `.claude/rules/performance.md`. Every design
reviewer gets the answered before-walkthrough and names any row the design does not deliver.
**Why:** #183's design rounds never saw what he approved and missed a row. **Guard:** none — candidate.

## Older work with a contract
**Invariant:** a feature that already has a signed `<feature>.contract.json` finishes under it
(`review-cards.py contract-check`, `close-out.sh` still read it). Write no new contract.
**Guard:** `test_contract.py`, `close-out-contract.test.sh`.
