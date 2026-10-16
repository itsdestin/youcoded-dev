---
id: 77
title: A home for skills when you don't use Claude Code
stage: planning
priority: P1
tags: native-harness, skills-mcp
release: v1.3.1
branch: 77-v1-3-1-release-blocker
roadmap: native-harness: **v1.3.1 release blocker — native-only users need a YouCoded
created: 2026-10-15
summary: People using only YouCoded's own engine have no obvious place to keep personal or project skills; must be fixed before 1.3.1.
area: Agents & automations
side: behind
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: yes — the old roadmap marked it blocked; see below.

See also #75: Both decide where a project's skills live and which ones the assistant uses; Destin wants them done together.

Chats

From the old roadmap (native-harness › skills-mcp, status blocked, seen on all, last checked 2026-09-05)
**v1.3.1 release blocker — native-only users need a YouCoded-owned skills home.** The only project-skill convention today is Claude Code's `.claude/skills/`, so someone using only YouCoded has no obvious place for a personal or project workflow. Make `~/.youcoded/` and a project-owned `.youcoded/` the native source of truth, with `.claude/skills/` as optional import/export. The 2026-08-06 plan covers Claude Code parity only and must be expanded first Destin 2026-10-05 triage (roadmap-triage-2026-10-05#8): do next — "we can do with 15, but this should be a top priority i think" (15 = per-project skills and tools, youcoded#571)
