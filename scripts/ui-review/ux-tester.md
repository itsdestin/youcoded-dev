# UX tester — the briefing template

The implementing session dispatches a **fresh subagent** with ONLY the text below the line
(blanks filled in) and `scripts/ui-review/tester-kit.md`. Nothing else: no CLAUDE.md, no
rules, no spec, no plan, no chat. It is a beta tester, and a beta tester who has read the
design doc is not one any more. Feature-flow design §8e.

**Before dispatching:** nothing to boot for mockups — the tester's tool (`explore`, in the kit)
builds and opens the practice app itself from this worktree. Put in the briefing the
**scenario** the task needs (`default`, `empty`, a named fail switch…) and any extra switches
as `--params` (e.g. `gpus=2&sync=auth-error`). For the **built copy**, start
`bash scripts/run-dev.sh <branch> --label "<feature>"` yourself and confirm the window is up;
the tester then uses `explore start --dev`, which attaches only to a window run-dev.sh started.
Give the tester a token/time budget (a review is not a second build; 45 minutes of wall time
is plenty for one feature) and the path of the review file it writes. Testers share one
`explore` session per worktree: dispatch them one at a time.

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

**Where:** <**the practice app** — open it with `node scripts/shoot/explore.mjs start
--scenario <scenario>` (add `--params <switches>` if given). The assistant, files and other
people are fakes that answer instantly and the same way every time; that is by design and is
not a finding | **a development copy of the real app**, already running — connect with
`node scripts/shoot/explore.mjs start --dev`. Do not start, stop or restart the app itself>.

**How to drive it:** read `scripts/ui-review/tester-kit.md` first — it tells you how to click
through the app, read its pictures, and what shape to write findings in. Every step gives you
a numbered list of what can be clicked; pick from it.

**What to look for**, in this order of importance:

1. Errors, hangs, dead ends — anything that leaves you stuck.
2. Things you expected to work one way that work another. Say what you expected and what
   happened.
3. **Every piece of text you read.** Labels, buttons, hints, empty states, errors. If it uses
   more words than the idea needs, quote it and propose the shorter wording. If a normal
   college student would not know a word, that alone is a finding.
4. Visual inconsistencies between screens, anything clipped, overlapping or unreadable.
5. **Slowness with a lot of data.** When you have finished the task, start again with
   `explore start --scenario stress --params stressRows=2000` — the same app filled with far
   more items than a new user has. Open each screen your task touches there and report any
   visible pause, stutter or blank moment — say which click caused it.

**Write your findings to** `<review file path>`, one per line, numbered `U1`, `U2`, …, in
the shape the kit shows, most important first, each with a screenshot path. Then add one
short paragraph: could you complete the task, and what was the single most confusing
moment? You have <budget>. If you run out, write exactly where you stopped.
