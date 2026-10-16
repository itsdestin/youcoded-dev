---
id: 63
title: Ideas for the assistant, its helpers and its tools
stage: explore
priority: P3
tags: native-harness, sessions, security, tools, feature
branch: 63-parked-ideas-native-sessions-and
roadmap: native-harness: Parked ideas: native sessions and helpers — 13 things.
created: 2026-10-15
summary: Saved ideas for the assistant, its helpers and its tools: memory across chats, goals, custom builds, other AI engines, and safety controls.
area: Chat
side: both
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #52: 52(a)'s installable packs that replace the assistant's prompt and tools are close to 63(i)'s custom harness builder with a shareable manifest.

Chats

From the old roadmap (native-harness › sessions, status parked, seen on all, last checked 2026-08-16)
Parked ideas: native sessions and helpers — 13 things. (a) Cutting skills and rules down for small models is still tail-cut; the redesign has seven decisions and a deck, nothing answered (report: docs/active/investigations/2026-09-09-small-model-context-truncation.md). (b) Project startup reminders and before/after-action checks should work in native chats, with approval before scripts run and clear failure reports. (c) A file's instructions arrive only after the first edit has happened; the assistant should see them and reconsider first. (d) The assistant should know which tools, instructions and checks are active in this chat (b–d report: docs/active/investigations/2026-09-05-native-guidance-followups.md). (e) OpenRouter's remaining credit is not shown, and a refused key gives no warning dot on the Settings gear. (f) Goal layer: checkable goals and a goal queue; deliberately last in the super-agent program. (g) Context and knowledge as product surfaces: a richer context popup, one-tap "remember this?", work state as an object, shareable knowledge packs, provenance and revocation. (h) Third-party agent CLIs (Codex first) as session providers; a deliberate what-if. (i) Custom harness builder: pick a preset, edit prompt, toggle tools, save a shareable manifest; no design yet. (j) The native agent has no memory of past chats; wanted: chat search as a tool. (k) Cloud models all get frontier-strength treatment, so small hosted models choke; capability and context budget should be separate. (l) "Assistants made of Duties": the unit of organisation for Agents & Automations; captured, not designed. (m) Six helper ideas: promote a helper to background mid-run, view a helper's transcript, a project-level helpers folder, per-helper cost on its card, a strict approval toggle, a live roster in Settings.

Merged in #67 "Ideas for assistant tools and safety (nine)"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (native-harness › tools, status parked, seen on all, last checked 2026-09-01)
Parked ideas: tools, secrets and sandboxing — 9 things. (a) The assistant cannot explain the app it lives in (Destin, 2026-09-10): it guesses where settings are; wanted a maintained description or info-desk tool. (b) Background Bash follow-ups: typing into a running command, a "Running commands" list, "tell me when the log says ready". (c) Bash shows the model only ~4,000 characters of output, so long results cost a second call; the "prefer Read/Grep" wording should switch off in full-auto; decide by measuring. (d) WebFetch's "page too thin" thresholds were never measured against real pages. (e) Glob refuses nested braces like `{a,{b,c}}`; revisit only if a real use shows up. (f) After Edit/Write in the Coder preset, append syntax/type errors to the result. (g) The assistant should ask for an API key or `.env` value in a secure box, not saved in chat or shown to it (Destin, 2026-09-25). (h) Commands that ask for a GitHub or SSH password mid-run fail from chat; deferred because a command could trick you into typing the wrong password. (i) Sandbox or "scratch workspace" (run risky sessions on a copy, show a diff): some delete and secret-read shapes still run with no card and only a sandbox closes them (report: docs/active/investigations/2026-08-09-native-skip-permissions.md).
