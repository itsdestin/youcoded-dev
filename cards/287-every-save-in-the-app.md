---
id: 287
title: Every save in the app goes through the one crash-safe saving method
stage: planning
tags: dev-workspace, backend
branch: 287-every-save-in-the-app
finish: All saves use the safe writer, a check refuses new homemade saves, the downsides above are each handled or accepted by Destin.
created: 2026-11-28
why: Destin said yes (round 4) but wants the downsides fully understood first: show him them before building. Known downsides: a symlinked file becomes a real file; file watchers see replace instead of change; Windows can refuse the swap while antivirus holds the file (needs retry); synced folders (OneDrive) see extra events. About 40 places skip main/atomic-write.ts. decks: docs/archive/design/2026-11-18-code-review/ (review files in ~/Documents/youcoded-review-2026-11-18/)
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
