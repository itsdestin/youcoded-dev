---
status: active
date: 2026-11-12
cards: [163]
---
# Code review: leftover change `e4d98a84f` (card #163)

Read-only review. Commit `e4d98a84f` on app branch `session/163-crash-resume-repair` (pushed, `origin/session/163-crash-resume-repair`). Nothing landed. I tried it on a scratch copy of today's master (`56167222b`) inside my own worktree and then undid it.

## What it does for a user
When the app is cut off mid-work (crash, power cut), a native chat has tool calls whose results were never saved. On reopening, the app patches the chat memory so the model is not confused. The change does five things:
1. Missing result text now says "no saved result; completion unknown; this call may have run; inspect current state before retrying" instead of "Canceled: this call never completed". A tool that edited a file before the cut really did run, so "canceled" could make the assistant redo a change (double edit, double send).
2. Stray results with no matching call (left by a failed save) are dropped from what the model sees, instead of being kept, which makes some providers reject the whole chat.
3. A valid summary stays in use even if the recent messages after it needed that repair. Before, the whole summary was rejected and the full old history came back. This is the real incident the plan documents: one unfinished command blew a chat up to an estimated 1,086,056 tokens (`docs/active/plans/2026-10-18-crash-resume-repair.md` in the worktree).
4. Skill instructions count as a boundary, so a result is never paired across them.
5. The emergency "trim only this request" mode (`legacyReopenFit`) is now switched by an explicit `restoreMode` (exact vs. reconstructed) instead of "was there any saved data". Summaries and /clear turn it off.
The readable transcript file is never changed; only what is sent to the model.

## Is it correct
- Reasoning is sound and each change has a WHY comment. I read the full diff (6 files, +235/-40).
- Tests (mine, on a copy of master with the change applied): the four directly related test files, 367 passed; the wider `tests/harness*` and `tests/native*` group, 56 files, 1708 passed, 4 skipped; `tsc --noEmit` clean.
- Tests prove the fix: with the new tests but master's source, 13 tests fail (all the new ones plus two old crash-recovery expectations that the change deliberately rewrites); with the change they pass.
- Not run: `bash scripts/verify.sh` (types/knip/lint/ast-grep), Android. Line budget: master's `harness-session.ts` sits exactly at its 4403 limit (`desktop/line-budgets.json`); the commit's net change to that file is zero (4288 lines before and after on its own base), so it should fit, but verify must confirm.

## Is it already on master?
No. `git merge-base --is-ancestor` says not an ancestor. Master still has the "Canceled: this call never completed" text, and no `restoreMode`. Master's 2026-10-21 fix `14c28c93a` ("provider rejections no longer brick conversations") touched the same file but a different problem. Card #163's merged work (#662, a6c47f79a) is the speed-of-restore part, not this.

## What would conflict today
Nothing mechanically: `git merge-tree` against master reports a clean merge. The branch is 747 commits behind master. Files changed on master since its base: `harness-session.ts` (35 commits), `native-session-host.ts` (24), `docs/native-runtime.md` (16), `history-rebuild.ts` (1, `14c28c93a`), `harness-history-rebuild.test.ts` (1). The auto-merge succeeded and the tests above pass on the merged result.

## Risks
- The commit message is "wip: save unsaved files ... backup". It should be rewritten as a proper message when landed.
- Behaviour change for the model only: after a crash, assistants may re-check state before retrying a command (slightly more reading, fewer repeated side effects). No visible screen, wording or layout change for Destin; he only notices if the assistant mentions it.
- `restoreMode` defaults: a seed without a mode counts as "exact". Any new caller that seeds from a rebuild must pass `reconstructed` or emergency trimming is off for it. The two existing callers are updated; a short pinning test for the default would help.
- Merged real-world proof: none on a live crash. The plan's evidence came from repairing three real histories offline.

## Tests present or missing
Present: 6 new rebuild tests (missing result, orphan output, mixed parallel group, user/clear/skill barriers, kept summary with repair, origins stay null), 3 new compaction tests (raw and portable reconstructed fit; manual summary ends eligibility). Missing: a test that `/clear` and an automatic summary also clear the flag; a test of the `'exact'` default.

## Recommendation: land after named changes
1. Rebase or merge onto current master (clean), rewrite the commit message.
2. Run `bash scripts/verify.sh` on the result, confirm the `harness-session.ts` line budget holds.
3. Add the two small tests above.
4. Land in its own commit with the card #163 note. No design decision is needed; it changes only what the model reads after a crash.
Why not as-is: it is an unreviewed backup commit, 747 behind, never run through verify. Why not drop: it fixes a real data-safety bug (a command that did run being reported as canceled) and the chat-size blow-up, and master has no equivalent.
