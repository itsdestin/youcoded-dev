---
id: 218
title: Dev instances share the real youcoded-defaults.json
stage: planning
priority: P2
tags: dev-workspace, bug
branch: 218-dev-instances-share-the-real
finish: A dev instance reads and can write ~/.claude/youcoded-defaults.json under the real home folder whatever its --profile, so a test run can change Destin's own new-session defaults (e.g. the skip-permissions box). Point dev instances at their own copy.
created: 2026-11-05
---
Progress
Done: nothing yet.
Next: decide with Destin whether this folds into card 17 (the dev-copy isolation card). If kept separate, plan how a test copy gets its own settings file.
Blocked: nothing.

Chats
