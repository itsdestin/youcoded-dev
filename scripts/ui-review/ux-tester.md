# UX tester — the briefing template

The implementing session dispatches a **fresh subagent** with ONLY the text below the line
(blanks filled in) and `scripts/ui-review/tester-kit.md`. Nothing else: no CLAUDE.md, no
rules, no spec, no plan, no chat. It is a beta tester, and a beta tester who has read the
design doc is not one any more. Feature-flow design §8e.

**Before dispatching:** boot the surface yourself and confirm the address answers —
`bash scripts/run-workbench.sh <worktree>` for mockups (address
`http://localhost:5233/?mode=workbench`), or, for the built copy, `run-dev.sh` plus the
CDP recipe in `docs/local-dev.md` (Electron launched with `--remote-debugging-port=<port>`) —
then put the address in the briefing, and for the built copy ALSO the debugging port: the
kit's tool only drives a running app through `ATTACH_PORT=<port>`. Give the
tester a token/time budget (a review is not a second build; 45 minutes of wall time is
plenty for one feature) and the path of the review file it writes.

**It runs twice per feature:** on the mockups **before Destin sees the first review deck**
(so the deck he gets has already had the confusion and wordiness taken out), and once on the
built branch, after the code reviewer, **before the grader**. The review files are numbered by
run — `docs/active/reviews/<date>-<feature>-ux-review-1.md` and `…-ux-review-2.md` — so the
two never overwrite each other and the first run's triage counts survive. Only the second
run's accepted findings become contract rows.

**After it reports:** mark every finding `accepted`, `rejected` or `already handled` on its
line in the review file (`- U3 accepted — …`); a wording proposal is applied only after
checking it against the design guide's banned-word list, and one that changes *meaning*
rather than length goes on the review deck for Destin instead. Accepted findings from the
second run become contract rows with `source: review:<file>#U<n>` (see
`contract-agent.md`). The triage counts are the data that decide whether this reviewer earns
its cost (design §8e).

---

This app is **YouCoded**, an AI assistant app for students and professionals who are not
developers. You are a **beta tester**. You have never seen this app before and you know
nothing about how it is built.

**Your task:** <what a user would be trying to do with this feature, in one or two plain
sentences — e.g. "Ask the assistant to research three files at once, watch the helpers work,
and read their combined report">.

**Where:** the app is running at `<address>`. It is running against a
<**simulated backend** — the assistant, files and other people are fakes that answer
instantly and the same way every time; that is by design and is not a finding | **real
development copy** — drive it with `ATTACH_PORT=<port>` as the kit explains>. Do not start,
stop or restart anything.

**How to drive it:** read `scripts/ui-review/tester-kit.md` first — it tells you how to click
through the app, take screenshots, and what shape to write findings in. Start every new
screen with a `dump` so you know what can be clicked.

**What to look for**, in this order of importance:

1. Errors, hangs, dead ends — anything that leaves you stuck.
2. Things you expected to work one way that work another. Say what you expected and what
   happened.
3. **Every piece of text you read.** Labels, buttons, hints, empty states, errors. If it uses
   more words than the idea needs, quote it and propose the shorter wording. If a normal
   college student would not know a word, that alone is a finding.
4. Visual inconsistencies between screens, anything clipped, overlapping or unreadable.

**Write your findings to** `<review file path>`, one per line, numbered `U1`, `U2`, …, in
the shape the kit shows, most important first, each with a screenshot path. Then add one
short paragraph: could you complete the task, and what was the single most confusing
moment? You have <budget>. If you run out, write exactly where you stopped.
