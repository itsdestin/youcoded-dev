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

## 2026-09-05 — built and shipped Sign in with ChatGPT (feat/chatgpt-signin-backend + build/chatgpt-signin, both merged)
- RECURRED (3rd time, first two in memory `feedback-pkill-by-pid.md`): killed my own shell with `for pid in $(pgrep -f X); do kill $pid; done`. Guard 2 blocks `pkill -f`; this is the same bug in two steps, and CLAUDE.md RECOMMENDED it ("use `pgrep -af` then `kill <pid>`") → applied: guard 6 in `.claude/hooks/glob-guard.py` + 4 tests, and the CLAUDE.md advice corrected  [2 self-kills in one command, exit 144, 2 follow-up turns]
- `roadmap-check.mjs` silently checked the SHARED checkout from a worktree — reported errors in files I had not touched, passed over mine → applied: defaults to the caller's worktree when it has `docs/roadmap/`, and prints the root it used  [4 wasted runs before the mismatch was visible]
- `audit-anchors.mjs --root <worktree>` reports every `youcoded/...` anchor as missing, because a worktree has no sub-repo clones → applied: usage header now says DO NOT pass a worktree, and why  [12 false failures, all files that existed]
- A verdicts file's `verdict` must literally be `pass`/`fail`; only `spec.py`'s validator knew, and it fails at serve time, after the deck is built and committed → applied: stated in `acceptance_spec`'s docstring and `review-cards.py`'s usage  [1 rebuild + a correcting commit; the grading subagent made the same guess I did]
- Contract row R16 was satisfied by what a chip OPENS, not by the chip's own text; the grader said so instead of silently passing it → dropped: the honesty worked, nothing to change
- `cdp-eval.mjs` needs `ws`, absent where I ran it → dropped: its own header already says to run it from a directory whose node_modules has ws; I did not read the header  [2 calls]
- deleted/merged: `formatDayShort` + `DAY_NAMES_SHORT` in `shared/time-format.ts` — Destin chose the long day name, leaving one day formatter where there were two
- Lost track of cwd mid-wrap-up and edited `docs/MAP.md` in the SHARED checkout, which held another session's uncommitted line. The pre-commit hook blocks COMMITS there; nothing blocks edits → applied: nothing mechanical (a hook blocking edits would break `setup.sh` and legitimate fixes); recorded here because the near-miss is the data — the other session's line survived only because the edit was an insert, and `git diff` was checked before touching it
