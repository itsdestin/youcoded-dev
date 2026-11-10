---
id: 75
title: Choose skills and tools per project
stage: polish
priority: P1
tags: native-harness, skills-mcp, projects, desktop
branch: 75-per-project-skills-and-tools
roadmap: native-harness: Per-project skills and tools: each project chooses which ski
created: 2026-10-15
summary: Each project picks which skills, plugins and tool connections the assistant may use, with a warning before outside services.
area: Projects
side: both
work: session/plugin-project-controls
vision: projects.controls.skills, agents.added.project-skills
---
Progress
Done: Built 2026-09-23/24 on session/plugin-project-controls (about 8,400 lines: a Skills and tools tab in Projects, a Marketplace flow, drawer chips, per-session enforcement for the native engine). Destin's last word 2026-09-24: 'I still want to review this UI further before we finalize.' His recorded complaints were about the look, copy and flows ('doesn't match existing app UI', 'what does ask assistant to set it up actually do?'), not the backend. Draft PRs youcoded#571 and youcoded-dev#203 are the record.
Next: Rebuild inside the Projects, skills and Claude Code workstream with #57 and #77: port the backend files nearly as-is, redo the UI on today's app (master's UI and plugin install were rebuilt since; a trial merge conflicts in 20+ files). First deck asks Destin which part he was unhappy with: tab grouping and copy, the 'ask assistant to set it up' meaning, or the Marketplace starts-off flow.
Blocked: Waits for that workstream; the old branch and PRs stay as the reference until the port starts.

See also #77: Both decide where a project's skills live and which ones the assistant uses; Destin wants them done together.

Chats

From the old roadmap (native-harness › skills-mcp, status in-flight, seen on desktop, last checked 2026-10-05)
Per-project skills and tools: each project chooses which skills, plugins and tool connections the assistant uses there, with a risk warning before anything that reaches an outside service. Built and passing its checks as draft youcoded#571 since 2026-09-24; waiting on Destin's review of every new screen, and it must be brought up to date with the 2026-10-04 one-core merge first. Two behaviour changes to say in release notes: new Marketplace downloads start switched off until projects are chosen, and conversations outside any project get no automatic skills or tools. Destin 2026-10-05 triage (roadmap-triage-2026-10-05#15): do next
