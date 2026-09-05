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

## 2026-09-05 — competitive review of the native prompt, then shipped it (feat/prompt-doctrine, feat/prompt-capability, feat/prompt-plain-language)
- Paid for an 8-cell before/after eval at one run per arm, reported the gap as a finding, retracted it when a re-run of the SAME builds swung 2-3 points on the same judged items → applied: `harness-eval.mjs` warns at the estimate when a ≥2-arm plan has `repeats: 1`, guard `harness-eval-comparison-noise.test.ts`  [$1.90 spent, one wrong conclusion Destin acted on]
- `builds` (the code-version axis) had no worked example and no key-file guidance; learned it from `matrix.ts` source and searched five places for a key that does not exist → applied: `prompt-doctrine.json` committed as the example, three bullets in `.claude/rules/harness-evaluator.md`  [~10 tool calls + one blocked turn]
- Built two review surfaces Destin rejected (a card matrix, then an 11k-word reading page — "a fuck ton of poorly formatted text") before the workbench landed. `feedback-review-page-format` already recorded that a prose page and a card board were rejected for UI reviews; nobody had generalised it beyond UI → applied: `~/system/me/README.md`  [2 build/screenshot/commit cycles, 2 rounds of his time]
- Rebuilt the question deck's loopback answer server because its spec has no diff card → roadmap: `docs/roadmap/dev-workspace.md` (rigs)
- Edited the roadmap in the shared stale checkout first, hit another session's already-fixed error, spent ~6 calls diagnosing it. RECURRENCE: `CLAUDE.md` warns about this explicitly → dropped: a hook blocking edits (not commits) in the shared checkout would break legitimate work by other sessions; the pre-commit hook already catches the commit
- His "a closing offer to act is good behaviour" contradicted the eval rubric that scored it as padding → applied: `prose-rubric.ts` carve-out, so the case stops arguing against a shipped intention
- Clickable URLs in chat: he asked for a handoff mid-session, a fresh session built and merged `markdown-linkify.ts` before this one ended → nothing to file; the handoff worked
- deleted/merged: `.claude/rules/harness-evaluator.md` went 778 → 547 words — three invariants about *changing* the evaluator moved into the depth doc it already points at, leaving the rule to cover *running* one
- Ran `audit-anchors.mjs` in the shared checkout and got two failures that were both already FIXED upstream (a doc reported as living in active AND archive; a word-budget violation) — spent calls on each before checking against `origin/master`. RECURRENCE of the stale-checkout trap, twice in one session → applied: the auditor now prints how many commits behind the checkout is, before its findings
