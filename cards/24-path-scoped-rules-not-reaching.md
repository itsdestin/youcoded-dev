---
id: 24
title: Project rules don't always reach work sessions
stage: explore
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
Done: Partly handled 2026-09-05 (commit 87096f789, on master): the workspace guidance now says that Claude's file-edit tools load the rules, that command-line edits do not, and that the session should open the relevant rules by hand. A log that records which rules loaded has existed since 2026-08-31.
Next: Destin decides whether to accept this workaround and close the card, or build an automatic reminder for command-line edits.
Blocked: waiting on that decision. The "does it still happen from the workspace root" re-test has not been run.

Chats

From the old roadmap (dev-workspace › knowledge, status needs-verify, seen on n/a, last checked 2026-09-03)
Path-scoped rules not reaching sessions: 2 findings. (a) a whole session edited files a rule covers and the rule never loaded; the Bash-only explanation was wrong or partial; the working directory sitting at the workspace root is the untested suspect; (b) sessions editing through Bash get no rules and cannot tell; wanted: a non-blocking hook or a `rules-for <path>` command, after measuring the noise
