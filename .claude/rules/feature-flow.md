---
paths:
  - "**/scripts/ui-review/deck/**"
  - "**/scripts/ui-review/review-cards.py"
  - "**/scripts/ui-review/contract-agent.md"
  - "**/docs/active/design/**"
  - "**/scripts/close-out.sh"
last_verified: 2026-09-01
verify:
  - path: scripts/ui-review/deck/contract.py
    contains: "def check_contract"
  - path: scripts/ui-review/contract-agent.md
  - test: scripts/ui-review/tests/test_contract.py
  - test: scripts/ui-review/tests/test_words.py
---

# Feature flow — the deck is the one surface

Design: `docs/active/specs/2026-09-01-feature-flow-design.md`.

## Questions before drawing
**Invariant:** a new feature's step-2 questions are a words-only deck (`<feature>.questions.json`,
`"words": true` decide steps, 1–3 options), served and submitted before any UI is drawn. A note
with no tag (answers files from before 2026-09-01) counts as **just noting**, same as a tagged one.
**Why:** answers in chat are not a source; a contract row must resolve to an answered step.
**Guard:** `test_words.py`; the `ui-mockup` skill's checklist.

## The contract is a deck, and its sources are answered steps
**Invariant:** `<feature>.contract.json` is a one-step `rows` deck; every row's `source` is
`<deck key>#<step id>` of a submitted, non-skipped answer. Not the design spec, not the plan,
not the transcript. Written by a FRESH agent from `scripts/ui-review/contract-agent.md`.
**Why:** provenance — the rows are Destin's decisions, and a generator grading itself is generous.
**Guard:** `review-cards.py contract-check`; `test_contract.py`.

## Answers files are committed
**Invariant:** `docs/**/*.answers.json` (and the stamped rotations) are tracked; only `scratch/`
is ignored. Never add them back to `.gitignore`.
**Why:** they are the only record of decisions; ignored for three months, they lived on one disk.
**Guard:** none — candidate (an anchor test on `.gitignore`).

## Reopen only through a deck
**Invariant:** when implementation contradicts approved UI, the implementing session serves a
one-step words-only `decide` deck and waits; a chat question is not a route back. The answer
amends the contract row's `source`.
**Why:** a chat answer is not a source (see above).
**Guard:** none — candidate.

## The gate is three facts, and one command reports them
**Invariant:** `review-cards.py contract-check <feature>.contract.json` is the only reader of
the gate: (1) every row's source resolves and every `mechanical` guard exists on disk or on
the contract's `branch` (exit 1 otherwise); (2) the contract was signed — `<feature>.contract.answers.json`
submitted with the contract step `yes`; (3) `<feature>.contract.acceptance.answers.json` is
submitted. `close-out.sh` relays its `ok:` / `todo:` lines and reads no answers file itself.
**Why:** a guard the branch adds is not in the main checkout until merge; a contract nobody
signed is not a definition of done; two readers of one file drift.
**Guard:** `test_contract.py` (ContractCheckTests); `close-out-contract.test.sh`.

## Acceptance is graded rows plus human rows
**Invariant:** the grader writes `<feature>.contract.verdicts.json` (beside the contract, same
stem — the CLI reads exactly that name); `review-cards.py acceptance` refuses when a
`mechanical` or `deck` row has no verdict.
**Why:** an ungraded row is not a pass.
**Guard:** `test_contract.py` (AcceptanceTests).
