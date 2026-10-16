---
id: 24
title: Project rules don't always reach work sessions
stage: planning
priority: P3
tags: dev-workspace, knowledge, bug
branch: 24-path-scoped-rules-not-reaching
roadmap: dev-workspace: Path-scoped rules not reaching sessions: 2 findings.
created: 2026-10-15
summary: Rules meant to guide the assistant when it edits certain files sometimes never load, and it can't tell they were missed.
area: Workspace
vision: together.workflow
---
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (dev-workspace › knowledge, status needs-verify, seen on n/a, last checked 2026-09-03)
Path-scoped rules not reaching sessions: 2 findings. (a) a whole session edited files a rule covers and the rule never loaded; the Bash-only explanation was wrong or partial; the working directory sitting at the workspace root is the untested suspect; (b) sessions editing through Bash get no rules and cannot tell; wanted: a non-blocking hook or a `rules-for <path>` command, after measuring the noise
