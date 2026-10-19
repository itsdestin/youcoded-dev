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
Done: All four Linux package archives verified; 35 icon tests and final 2,345 related/guard tests pass. First full CI passed Linux/macOS and Windows icon tests; unrelated 300ms sync recovery test assumption reproduced and fixed in test only, reviewed with no blockers.
Next: Await final cross-platform CI on 7a1c2b8ef, merge app PR #639 and docs PR #274, archive plan and close item.
Blocked: Automated final CI only; no user decision needed.

Chats
- 2026-10-19 session/linux-launcher-icons: chat started
