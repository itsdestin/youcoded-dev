---
id: 172
title: Upgrade the desktop engine to prevent selection-layout crashes
stage: explore
tags: desktop, bug, crash, release
branch: 172-upgrade-the-desktop-engine-to
created: 2026-10-19
why: Destin: add to roadmap (October 19 crash deck Q-1). The installed Electron 41.10.7 dump resolves to Blink Document::UpdateStyleAndLayoutTreeForThisDocument, CHECK(StateAllowsTreeMutations), during selection commit in compositing-inputs update. Matching upstream fix: https://github.com/electron/electron/pull/54281 ; verified included in 43.8.0 and 44.9.0. Choose a supported release containing the fix and verify app compatibility; exact app-level trigger remains unknown. This is planned work, not an authorized live upgrade.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
