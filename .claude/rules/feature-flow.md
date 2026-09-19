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
last_verified: 2026-09-04
verify:
  - path: scripts/ui-review/deck/contract.py
    contains: "def check_contract"
  - path: scripts/ui-review/contract-agent.md
  - test: scripts/ui-review/tests/test_contract.py
  - test: scripts/ui-review/tests/test_words.py
---

# Feature flow — the deck is the one surface

Stages and depth: `docs/active/specs/2026-09-01-feature-flow-design.md`. It ends, always, at his
merge call.

## Short route, and never a deck he is already looking at
**Invariant:** small work with clear direction may skip every stage but the deck — ask first. **A
live dev instance outranks a deck:** while one runs, or work is in a build → look → change loop,
ASK first and skip what he can already see. A deck still earns its place showing what the app
cannot: a Before, an unreachable state, an unbuilt option.
**Why:** "just show them to me. this is a simple feature" (2026-09-10); "if a deck is just going to
show me the same thing i'm looking at in the dev instance, we should skip it. this is just wasting
tokens atp" (2026-09-18) — nor a final Before/After "when the work obviously isnt final". "Wait on
the deck" = keep building, no captures. **Guard:** none.

## Questions before drawing
**Invariant:** step-2 questions are a words-only deck (`<feature>.questions.json`), submitted
before any UI is drawn, with the fields `review-deck.md` requires. **Why:** a row must resolve to
an answered step. **Guard:** `test_words.py`.

## The UX tester runs before the first deck and after the build
**Invariant:** a fresh subagent given ONLY `ux-tester.md` + `tester-kit.md` drives the mockups
before the first deck and the built branch after the code review; findings are triaged `accepted` /
`rejected` / `already handled`. **Why:** a tester who read the design doc is not a beta tester.
**Guard:** none — candidate.

## Sources are answered steps or accepted findings
**Invariant:** `<feature>.contract.json` is a one-step `rows` deck; a row's `source` is
`<deck key>#<step id>` of a submitted, non-skipped answer, or `review:<file>#<id>` naming an
`accepted` line. A FRESH agent writes it from `contract-agent.md`, never from spec or transcript.
**Why:** provenance — rows are his decisions, or promises he can veto.
**Guard:** `review-cards.py contract-check`; `test_contract.py` (`ReviewSourcedRowTests`).

## Answers files are committed
**Invariant:** `docs/**/*.answers.json` (and stamped rotations) are tracked; only `scratch/` is
ignored — the only record of decisions. **Guard:** none — candidate.

## Reopen only through a deck
**Invariant:** when implementation contradicts approved UI, serve a one-step QUESTION deck and
wait; the answer amends the row's `source`. **Why:** a chat answer is not a source. **Guard:** none.

## The gate is three facts, one command reports them
**Invariant:** `review-cards.py contract-check` is the only reader: every source resolves, every
`mechanical` guard exists on disk or on the contract's `branch` (exit 1 otherwise), the contract is
signed (`.contract.answers.json`, step `yes`), the acceptance deck is submitted.
**Why:** a branch's guard is absent from the main checkout until merge; unsigned is not done.
**Guard:** `test_contract.py` (ContractCheckTests), `close-out-contract.test.sh`.

## The build stage is reviewed, capped, recorded
**Invariant:** technical design → reviewer rounds writing
`docs/active/reviews/<date>-<feature>-design-review-<n>.md` (triaged; stop on a round accepting
nothing, cap three) → task breakdown → subagent build, a reviewer per task.
**Why:** whether rounds improve or churn a design is unmeasured. **Guard:** none — candidate.

## Two reviewers, a stranger grades, then the deck
**Invariant:** after the build, a code reviewer and the UX tester's second run report in parallel
to `docs/active/reviews/<date>-<feature>-{code-review,ux-review-<run>}.md`, each under a budget; the
implementing session triages, and accepted findings become `review:` rows. A fresh grader writes
`<feature>.contract.verdicts.json`, failing a `mechanical` row whose test tests something else. The
acceptance deck shows every verdict, tags `review:` rows **found in review**, asks one yes/no per
`human` row. He opens no review session.
**Why:** the builder is the worst reviewer of its branch; a guard is not a checked criterion.
**Guard:** `review-cards.py acceptance` refuses ungraded rows; `test_contract.py` (AcceptanceTests).
