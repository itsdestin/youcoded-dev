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

Design: `docs/active/specs/2026-09-01-feature-flow-design.md`. Order: questions → mockups →
UX tester 1 → review deck(s) → contract → design + capped review → build → code reviewer +
UX tester 2 → triage → grader → acceptance deck → Destin's merge call.

## Questions before drawing
**Invariant:** step-2 questions are a words-only deck (`<feature>.questions.json`), submitted
before any UI is drawn: each question carries `today`, `problem`, `proposal` and 1–3 `options`
with `pros`, `cons`, at most one `recommended`. **Why:** a chat answer is not a source; a row
must resolve to an answered step. **Guard:** `test_words.py`; how to write one:
`.claude/rules/review-deck.md`.

## The UX tester runs before Destin sees a deck, and once more at the end
**Invariant:** a fresh subagent given ONLY `scripts/ui-review/ux-tester.md`'s briefing and
`scripts/ui-review/tester-kit.md` — no CLAUDE.md, rules, spec or plan — drives the mockups before
the first review deck, and the built branch after the code review. It reports errors,
expected-vs-actual, over-long copy (with shorter wording) and visual inconsistencies; each
finding line is triaged `accepted` / `rejected` / `already handled`.
**Why:** a tester who read the design doc is not a beta tester (decided 2026-09-04).
**Guard:** none — candidate (design §8e: measure after three features).

## Sources are answered steps or accepted findings
**Invariant:** `<feature>.contract.json` is a one-step `rows` deck. A row's `source` is
`<deck key>#<step id>` of a submitted, non-skipped answer, or `review:<file>#<id>` naming a line
marked `accepted` in a review file. A FRESH agent writes it from
`scripts/ui-review/contract-agent.md`, never from the spec, plan or transcript.
**Why:** provenance — rows are Destin's decisions, or promises he can veto.
**Guard:** `review-cards.py contract-check`; `test_contract.py` (`ReviewSourcedRowTests`).

## Answers files are committed
**Invariant:** `docs/**/*.answers.json` (and stamped rotations) are tracked; only `scratch/` is
ignored.
**Why:** the only record of decisions; ignored, they lived on one disk.
**Guard:** none — candidate.

## Reopen only through a deck
**Invariant:** when implementation contradicts approved UI, serve a one-step QUESTION deck (see
`review-deck.md`) and wait; the answer amends the row's `source`.
**Why:** a chat answer is not a source.
**Guard:** none — candidate.

## The gate is three facts, one command reports them
**Invariant:** `review-cards.py contract-check` is the only reader: every source resolves and every
`mechanical` guard exists on disk or on the contract's `branch` (exit 1 otherwise); the contract
was signed (`.contract.answers.json`, step `yes`); the acceptance deck was submitted.
`close-out.sh` relays its lines.
**Why:** a branch's guard is absent from the main checkout until merge; unsigned is not done.
**Guard:** `test_contract.py` (ContractCheckTests); `close-out-contract.test.sh`.

## The build stage is reviewed, capped, recorded
**Invariant:** technical design → reviewer rounds writing
`docs/active/reviews/<date>-<feature>-design-review-<n>.md` (findings `R<n>-<k>` marked
accepted / rejected / already handled, reversals `reverses:`; stop on a round accepting nothing,
cap three) → task breakdown → subagent build, a reviewer per task.
**Why:** whether rounds improve or churn a design is unmeasured.
**Guard:** none — candidate.

## Two reviewers, a stranger grades, then the deck
**Invariant:** after the build, a code reviewer (`scripts/ui-review/code-reviewer.md`: branch,
contract rows, file rules — nothing else) and the UX tester's second run report in parallel to
`docs/active/reviews/<date>-<feature>-code-review.md` / `-ux-review-<run>.md`, each under a budget. The implementing
session triages; accepted findings become `review:` rows. A fresh grader
(`scripts/ui-review/grader.md`) writes `<feature>.contract.verdicts.json`, failing a `mechanical`
row whose test exists but tests something else. The acceptance deck shows every verdict, tags
`review:` rows **found in review**, and asks one yes/no per `human` row. Destin opens no review
session; nothing merges without his word.
**Why:** the builder is the worst reviewer of its branch; an existing guard is not a checked
criterion.
**Guard:** `review-cards.py acceptance` refuses ungraded rows; `test_contract.py` (AcceptanceTests).
