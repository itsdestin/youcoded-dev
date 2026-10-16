---
id: 19
title: Workspace tool annoyances: seven things
stage: planning
priority: P3
tags: dev-workspace, rigs
branch: 19-workspace-tooling-friction-7-things
roadmap: dev-workspace: Workspace tooling friction: 7 things.
created: 2026-10-15
summary: Saving a doc takes six steps, the app's log is hard to find and short, and nothing blocks saving a half-merged file.
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
