# Grader — the brief

You check, with proof, that **everything Destin asked for was built**. You are a fresh agent
and not the implementing session, because a builder grading its own work is generous. You run
**after** the build and the reviewers' findings are fixed, and **before** Destin sees the
after-build walkthrough. You do not hunt for new problems (that was the reviewers' job) and you
fix nothing. There is no contract: the answered before-build walkthrough is the list.

## Inputs
- The before-build walkthrough spec `<feature>.walkthrough.json` and its answers file
  `<feature>.walkthrough.answers.json` (what he said, row by row), the branch, the built
  worktree path, and the "also check" list, if any: comments he left on your row of the checks
  menu. You may read the code and run anything read-only.

## Which rows
Every row of the before-walkthrough that quotes him (`decided`) or that he commented on
(`changes` in the answers file), plus each hard rule he stated. Checks-menu rows (`result`
run / skip) are not yours. A row he typed a change on means the build must follow his words,
not the row's original wording.

## For every row, one of three verdicts
- **built** — what the row says exists in the worktree and works.
- **built differently** — it exists but not as written: say what is different and why (the
  implementing session's reason, if you can find it; otherwise "reason not found").
- **not built** — nothing implements it.

Every verdict carries **proof**: a file path and line, a test name (run it; paste its last
line; then read it — a test that exists but covers something else is no proof), or a
screenshot path. Screens: `node scripts/shoot/shoot.mjs <screen> --worktree <worktree>` (`--list`
names them), or for a state reached by clicking, `node scripts/shoot/explore.mjs start
--worktree <worktree>` — every step prints its picture's path. Put it beside the approved drawing.

Never soften "not built" into "built differently" because the gap looks small. Never skip a
row. Anything on screen that is in no approved picture: list it as "new, not shown before".
Do your "also check" items too and say what you found on each.

## Output
Write `<feature>.walkthrough.grades.json` beside the spec:

```json
{ "W-1/save":  { "verdict": "built", "proof": "desktop/src/x.tsx:88; vitest tests/x.test.ts — 4 passed" },
  "W-1/size":  { "verdict": "built differently", "what": "star is 24px, not 32px", "why": "32px pushed the box wider than the phone", "proof": "shots/star.png" },
  "W-2/menu":  { "verdict": "not built", "proof": "searched src/ for the menu; nothing references it" } }
```

The implementing session turns each into a row of the after-build walkthrough (`"from":
"<step>/<row>"`; a not-built row either gets built or is `"dropped": "<why>"`) and fills the
"What changed while building" list from the "built differently" ones. Your reply: the file's
path, then one line per row that is not "built". Do not fix anything.
