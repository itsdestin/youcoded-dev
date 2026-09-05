# Wrap-up ledger

What each session's `/wrap-up` found, and where it landed. **Newest at the bottom** — read
it with `tail -n 80 docs/wrap-ups.md`, append your entry with `>>`.

It exists because a wrap-up with no memory cannot see recurrence, and recurrence is the
strongest signal in the whole process: a finding that shows up twice means the first fix
was prose that nobody honored. `/audit` has had a paper trail in `docs/audits/` since
2026-04; this is the same thing for the half of the job only a live session can do.

One entry per session, kept to a handful of lines:

```
## YYYY-MM-DD — what the session was doing (branch, or "no branch")
- <finding, one line> → applied: <file> | roadmap: <area file> | dropped: <reason>  [cost, if measured]
- deleted/merged: <what got smaller>, or "none found"
```

Do not edit past entries. A finding that recurs gets a NEW line saying so, on the day it
recurred — the repetition is the data.

---

## 2026-09-05 — reviewed the wrap-up skill itself (chore/wrap-up-retrospective-first)
- Wrap-up had no memory of itself: could not see whether past findings landed, or recurred → applied: `docs/wrap-ups.md` (this file), read at Step 1
- Replay questions only asked about Claude's friction, never about product intent Destin voiced mid-session → applied: fifth replay question in `SKILL.md`
- Findings were ranked by feel because nothing was ever counted → applied: "quantify or qualify where you honestly can" in `SKILL.md`
- "Prefer subtracting" was a preference with no mechanism; instruction files kept growing → applied: each wrap-up must name one deletion or say it found none
- Push/close-out ran first and ate the attention the retrospective needed → applied: retrospective is now Steps 1–5, push/close-out is Step 6
- Retrospective edits had no stated home, so they risked a separate branch → applied: Step 5 lands them on the session's own branch
- Cross-repo sweep pushed other sessions' branches to public repos without a secrets scan → applied: scan now explicitly covers swept branches
- Goals were implicit; the two that matter (fewer tokens next session, more automation + preferences captured once) were never stated → applied: "What better means here" section
- Roadmap entries filed by wrap-up are not tagged, so the next wrap-up cannot check whether they moved → dropped: Destin deferred; revisit once the ledger has run a few sessions
- deleted/merged: `SKILL.md` narrative trimmed hard enough to absorb a new section, a new step and a fifth question and still come out smaller — 1504 → 1492 words
- `close-out.sh` reported the just-merged branch as "never pushed" — it cannot see a fast-forward merge → roadmap: `dev-workspace.md` (tests-adjacent, filed under rigs' neighbour section)  [3rd instance of this misleading-message class in the same script, 2026-09-03/04/05]
