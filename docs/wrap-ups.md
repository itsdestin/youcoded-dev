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

## 2026-09-05 — guidance cleanup (session/guidance-serena-cleanup)
- Native path-rule support was initially uncertain from static guidance; source inspection confirmed it, but delivery follows the tool step → applied: accurate wording in CLAUDE/MAP; roadmap: first-write timing, hook compatibility and runtime capability facts in native-harness.
- Retired checkout-pinned search setup competed with the isolated-worktree rule → applied on branch: empty workspace MCP registry, removed app index config, branch-local search guidance and CI regression test; live/shared registration deliberately untouched.
- Always-loaded recipes and incident narratives crowded out core guidance → applied: CLAUDE.md 6,186 → 1,985 whitespace-delimited words; detailed recipes moved to docs/workspace-workflows.md. Existing approval/verification gates retained.
- Instruction provenance overlaps an existing context-and-knowledge idea → roadmap: expanded that item rather than creating a second project. Full workflow/skill routing consolidation deferred in dev-workspace.
- A helper stopped on provider credit limits; work continued directly. Runtime also refused simultaneous write-capable helpers → applied: qualify parallelism by available runtime support rather than assuming it.
- Roadmap validator downgraded stale workbench-sync and file-chip claims to needs-verify; no product fix claimed. Full anchor audit is blocked by absent sibling component repos; desktop verify and focused workspace tests passed.
- Close-out mistook the untouched branch tip's ancestry for completed work despite uncommitted edits → roadmap: dev-workspace. Its deletion suggestions were not followed; these worktrees hold the actual changes.
- deleted/merged: retired setup instructions and active handoff removed from current guidance; historical handoff archived with its unresolved ideas preserved in the roadmap. No global cache deletion, live-app changes or runtime implementation.
