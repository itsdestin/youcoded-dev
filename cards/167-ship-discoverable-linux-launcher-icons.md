---
id: 167
title: Ship discoverable Linux launcher icons
stage: build
tags: desktop, linux, packaging, bug
branch: 167-ship-discoverable-linux-launcher-icons
finish: Linux installers carry standard discoverable launcher icon sizes; Windows, macOS, Android and user icon overrides remain unchanged.
created: 2026-10-19
why: youcoded app icon on this device seems to be the much older version
work: session/linux-launcher-icons
---
Progress
Done: Implemented Linux-only standard icon set while retaining legacy 1024px path; all four package formats built and archive contents match source; 2,283 related/guard tests, types, lint, knip and invariants pass. App PR #639.
Next: Wait for fresh review and required/cross-platform CI, then merge as authorized, archive plan and close item.
Blocked: No user decision needed; automated review/CI still running.

Chats
- 2026-10-19 session/linux-launcher-icons: chat started
