---
id: 77
title: A home for skills when you don't use Claude Code
stage: planning
priority: P1
tags: native-harness, skills-mcp, feature
branch: 77-v1-3-1-release-blocker
created: 2026-10-15
summary: Native personal and project skills still use Claude-named folders; a YouCoded-owned skills home remains future work.
area: Agents & automations
side: behind
vision: chat.steer.skillshome
---
Progress
Done: Nothing built yet. The app still finds skills only in Claude Code's folders (the personal one and each project's). Destin moved this out of the 1.3.1 release, which already shipped in October 2026.
Next: Plan it together with card 75 (per-project skills): decide where YouCoded-owned skills should live for people who do not use Claude Code, and whether they can be copied to or from Claude Code's folders.
Blocked: Not blocking anything. Waiting on Destin's design choices.

See also #75: Both decide where a project's skills live and which ones the assistant uses; Destin wants them done together.

Chats

From the old roadmap (native-harness › skills-mcp, status blocked, seen on all, last checked 2026-09-05)
**v1.3.1 release blocker — native-only users need a YouCoded-owned skills home.** The only project-skill convention today is Claude Code's `.claude/skills/`, so someone using only YouCoded has no obvious place for a personal or project workflow. Make `~/.youcoded/` and a project-owned `.youcoded/` the native source of truth, with `.claude/skills/` as optional import/export. The 2026-08-06 plan covers Claude Code parity only and must be expanded first Destin 2026-10-05 triage (roadmap-triage-2026-10-05#8): do next — "we can do with 15, but this should be a top priority i think" (15 = per-project skills and tools, youcoded#571)
