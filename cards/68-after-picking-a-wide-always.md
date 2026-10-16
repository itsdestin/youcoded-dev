---
id: 68
title: Explain why an "Always allow" didn't cover a command
stage: planning
priority: P1
tags: native-harness, permissions, tool-cards, desktop, release-blocker
release: v1.3.1
report: docs/active/investigations/2026-09-01-permission-near-miss-silent.md
branch: 68-after-picking-a-wide-always
roadmap: native-harness: **v1.3.1 release blocker.** After picking a wide "Always all
created: 2026-10-15
summary: After a broad "Always allow", a similar command still asks permission with no reason, so the app seems to forget approvals.
area: Chat
side: screens
platform: Desktop only
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (native-harness › permissions, status confirmed, seen on desktop, last checked 2026-09-23)
**v1.3.1 release blocker.** After picking a wide "Always allow" (any `npm run`, pushing to one branch), a later command that looks covered still raises the permission card with no reason — it reads as the app forgetting the approval. Re-checked 2026-09-23: the menu now states its limits up front, but the card raised later still gives no reason
