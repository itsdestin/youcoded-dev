---
id: 208
title: Move Destin's 5 roundup comments to the outside-file store after the #207 update
stage: planning
tags: doc-comments, housekeeping
related: 207
branch: 208-move-destin-s-5-roundup
created: 2026-10-30
why: 5 comments on roundup-base-2026-10-27.md (a file outside youcoded-dev) were filed in ~/youcoded-dev/.youcoded/comments/roundup-base-2026-10-27.md.json. Once the installed app has card #207 (youcoded#707), comments on that file are read from ~/.youcoded/loose-file-comments/<sha256 of its real path>.json, so these 5 will not show. Move them there, ONLY after Destin's installed app has the update or while it is closed (the running app watches the old file). Confirm with him first: it overwrites/creates a file in his comment storage.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
