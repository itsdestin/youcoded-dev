---
id: 87
title: Assistant's web browser: eight follow-ups
stage: planning
priority: P3
tags: other-features, misc, feature
branch: 87-browser-follow-ups-the-assistant
roadmap: other-features: Browser follow-ups (the assistant's own browser, shipped 202
created: 2026-10-15
summary: The new built-in browser lacks phone support, file uploads, tab extras and hand-testing on Mac and Windows.
area: Chat
side: both
vision: chat.steer.websearch
work: session/google-connections-planning, session/87-browser-tool-robustness
---
Progress
Done: Browser tools: separate navigation/history/zoom, clearer descriptions, shared validation, honest outcomes, cancellation/handoff/wait/continuation hardening; 233 focused tests passed; local uncommitted implementation.
Next: Finish final review and desktop verification; retain uncommitted work pending Destin's decision. Other browser follow-ups remain outside this change.
Blocked: No product decision blocking implementation; no commit, push or paid model evaluation authorized.

Chats
- 2026-10-18 session/87-browser-tool-robustness: chat started
- 2026-10-18 session/google-connections-planning: Reconciled September integrations research: its proposed browser build is historical, because the built-in browser subsequently shipped October 14. Remaining browser work stays here; do not restart the old CLI-first proposal. Desktop/computer control is a distinct exploration, not delivered by this browser feature. Source: 9470bbe1:docs/active/investigations/2026-09-26-integrations-rebuild/research/05-browser-computer-use.md. Preservation only.

From the old roadmap (other-features › misc, status confirmed, seen on all, last checked 2026-10-14)
Browser follow-ups (the assistant's own browser, shipped 2026-10-14): 8 items left out. (a) Phones and the Android app get no Browser controls or live picture; a phone watching a computer chat cannot answer a Browser card (the call gives up after 90 seconds). (b) Attaching a local file to a website (upload) was cut for safety; needs its own design. (c) Panel tabs: no drag to reorder, no reopening a closed tab (Ctrl+Shift+T), no site icons (showing them means the app contacts each site). (d) My Chrome is Experimental: never run against Destin's own Chrome's remote-debugging switch; no Chrome tab group marks the assistant's tabs. (e) Sign-ins are shared by all chats; per-chat storage was deferred. (f) Specialists (helper agents) don't get the Browser. (g) The Browser download (when no Chrome/Edge/Chromium/ Brave is installed) is verified on Linux only. (h) Never tried by hand: macOS and Windows; a Google password step; middle-click or Ctrl+click on a link; the pointer shape over links (not passed to the panel).
