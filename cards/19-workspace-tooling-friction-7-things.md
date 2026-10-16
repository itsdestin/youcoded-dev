---
id: 19
title: Workspace tools: annoyances, docs upkeep and ideas
stage: planning
priority: P3
tags: dev-workspace, rigs, knowledge, housekeeping
branch: 19-workspace-tooling-friction-7-things
roadmap: dev-workspace: Workspace tooling friction: 7 things.
created: 2026-10-15
summary: Workspace tools: seven annoyances, docs upkeep, and ten improvement ideas for how chats work on YouCoded.
area: Workspace
work: chore/conversation-triage-script
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (dev-workspace › rigs, status confirmed, seen on n/a, last checked 2026-10-07)
Workspace tooling friction: 7 things. (a) wanted: one-off scans with Fallow and React Doctor before anything is added; Destin: "optimize tf out of our workspace"; (b) the CI-red-vs-master script lists Windows-only failures as "NEW" on a Linux job; (c) a 526-line conversation-triage script sits on `chore/conversation-triage-script`: merge it or delete the branch; (d) committing a workspace doc takes six manual steps and leaves residue in the shared checkout; (e) the app's log is in Claude Code's folder, nobody finds it, and it keeps only 500 lines; (f) the harness evaluator has no CI gate and hand-written eval cases; (g) nothing refuses a commit that still holds merge-conflict markers: one landed in docs/wrap-ups.md on 2026-10-07 (abdcb153) after a failed resolve script; the commit hooks could refuse `<<<<<<<` lines

Merged in #23 "Roadmap and docs upkeep: nine items"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (dev-workspace › knowledge, status confirmed, seen on n/a, last checked 2026-09-02)
Roadmap and docs drift: 9 upkeep items. (a) nine roadmap items point at reports whose proof no longer matches the code; re-check each; (b) a Worker setting can exist only as a test value; wanted: an anchors check on the Worker's optional fields; (c) the design guide has two G-22 rules (renumbered on `session/convo-tab-lag`; close when it merges); (d) recheck the old cleanup handoff's remaining unused-code ideas; (e) the roadmap checker reads whatever sub-repo copy is on disk, so stale checkouts keep fixed bugs "confirmed"; (f) every branch filing a roadmap item conflicts on the ROADMAP.md table; (g) two 2026-07-28 guardrails unshipped: spec counts undated, and `run-dev.sh --list` shows worktrees not running instances; (h) no "review the attached document" command, longer plans, worktrees in five places; (i) the archived youcoded-core status line still references a deleted script

Merged in #26 "Ideas: ten workspace improvements"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (dev-workspace › knowledge, status parked, seen on n/a, last checked 2026-07-15)
Parked ideas: 10 dev-workspace ideas. (a) run the new-user path (download, install, setup, sign-in, first chat) on real Windows, Mac and Linux machines in CI; Destin: "could be interesting to set up"; (b) a baseline-and-diff check for the renderer's chrome invariants; (c) measure whether the feature flow's two reviewers earn their cost after three features; (d) workbench serves community theme folders so decks show real previews; (e) attach your own screenshot to a review-deck step; (f) merge the conflicting planning, design, review and wrap-up routes (report: docs/active/investigations/2026-09-05-native-guidance-followups.md); (g) check the one-word state on plans, specs and investigations (15 archived ones are off-list); (h) measure whether a third adversarial design-review round helps or churns; (i) move the two leftover specs out of `youcoded/desktop/docs/` and fix two pointers; (j) the 2026-07-10 review's unpicked clean-ups: xterm WebGL detach, folder-list canonicalising, big-file splits (report: docs/active/handoffs/2026-07-10-review-followups.md)

Updated on the old roadmap after the move (master, merged in 2026-10-16)
Workspace tooling friction: 8 things.
(a) wanted: one-off scans with Fallow and React Doctor before anything is added; Destin: "optimize
tf out of our workspace"; (b) the CI-red-vs-master script lists Windows-only failures as "NEW" on a
Linux job; (c) a 526-line conversation-triage script sits on `chore/conversation-triage-script`:
merge it or delete the branch; (d) committing a workspace doc takes six manual steps and leaves
residue in the shared checkout; (e) the app's log is in Claude Code's folder, nobody finds it, and
it keeps only 500 lines; (f) the harness evaluator has no CI gate and hand-written eval cases;
(g) nothing refuses a commit that still holds merge-conflict markers: one landed in docs/wrap-ups.md
on 2026-10-07 (abdcb153) after a failed resolve script; the commit hooks could refuse `<<<<<<<` lines;
(h) workspace-start says "delete it and run npm ci" for a far-behind `node_modules`, but glob-guard
guard 8 refuses `npm ci` for any session whose cwd is under /worktrees/ — even after the hardlinks are
deleted, and even in a scratch folder; the working path (npm ci in a scratch copy of package*.json with
the shell outside /worktrees/, move node_modules in, run the postinstall patch scripts) took 6 calls on
2026-10-14; the guard also matches the words in a commit MESSAGE that mentions the command (2026-10-15).
Wanted: a `fill-missing-deps.mjs --fresh` that does it, named in the message; the guard to match commands only
`n/a` `confirmed` `P3` `checked 2026-10-15`


Roadmap and docs drift: 9 upkeep items.
(a) nine roadmap items point at reports whose proof no longer matches the code; re-check each;
(b) a Worker setting can exist only as a test value; wanted: an anchors check on the Worker's
optional fields; (c) closed: the old guide's second G-22 is now G-29 (`session/convo-tab-lag`
merged, PR #155); (d) recheck the old cleanup handoff's remaining unused-code ideas;
(e) the roadmap checker reads whatever sub-repo copy is on disk, so stale checkouts keep fixed
bugs "confirmed"; (f) every branch filing a roadmap item conflicts on the ROADMAP.md table;
(g) two 2026-07-28 guardrails unshipped: spec counts undated, and `run-dev.sh --list` shows
worktrees not running instances; (h) no "review the attached document" command, longer plans,
worktrees in five places; (i) the archived youcoded-core status line still references a deleted
script
`n/a` `confirmed` `P3` `checked 2026-09-02`

