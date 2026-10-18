---
id: 59
title: YouCoded's own engine matches Claude Code, with a tool-connections screen
stage: planning
priority: P1
tags: native-harness, sessions, release-blocker, skills-mcp, settings, desktop, feature
report: docs/active/specs/2026-09-01-agent-platform-vision-and-state.md
branch: 59-native-runtime-parity-program-everything
roadmap: native-harness: **v1.3.1 release blocker.** Native Runtime Parity Program —
created: 2026-10-15
summary: Close what still separates chats on YouCoded's own engine from Claude Code, including a settings screen to add and remove tool connections.
area: Chat
side: both
vision: chat.harness.parity, projects.controls.mcp, agents.added.mcp
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #76: The native parity program in 59 includes 'MCP phase 2', which is likely the same unbuilt MCP settings screen and Claude Code server sharing that 76 describes.

Chats

From the old roadmap (native-harness › sessions, status in-flight, seen on all, last checked 2026-09-01)
**v1.3.1 release blocker.** Native Runtime Parity Program — everything that still separates a native session from a Claude Code one (context truncation notice, M6 onward, cwd contract, MCP phase 2, M7–M9). The single doc is §5.1 of the linked vision doc

Merged in #76 "A settings screen for tool connections"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #59: The native parity program in 59 includes 'MCP phase 2', which is likely the same unbuilt MCP settings screen and Claude Code server sharing that 76 describes.

Chats

From the old roadmap (native-harness › skills-mcp, status confirmed, seen on desktop, last checked 2026-09-01)
MCP servers can only be set up by hand-editing a config file — no settings screen to add, edit or remove one, and servers Claude Code already knows stay invisible to the app's own agent (deferred from phase 1, 2026-08-05; still unbuilt 2026-09-01) Destin 2026-10-05 triage (roadmap-triage-2026-10-05#10): postponed until after 1.3.1

From the 2026-10-16 document sweep
- Native Bash tool: a working-directory parameter, one standard block of folder rules, and a loud error for relative paths. Source: docs/active/plans/2026-07-18-multi-model-cwd-contract.md
- Before the MCP settings screen ships, fix `upsert()` / `fromStored` deleting hand-edited entries. Source: docs/active/investigations/2026-09-01-native-mcp-phase-2.md

2026-10-18 release scope decision — deferred from 1.3.1 by Destin; see #29 for the current-build release scope and requirements that remain mandatory. This item stays open and is not marked fixed or shipped.
