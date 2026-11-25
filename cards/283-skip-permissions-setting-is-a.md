---
id: 283
title: Skip permissions setting is a real unlock
stage: build
tags: permissions, settings
branch: 283-skip-permissions-setting-is-a
finish: The per-chat Skip permissions switch appears only when the Settings unlock is on (desktop, phone, buddy, resume), with tests.
created: 2026-11-20
why: Destin, 2026-11-19: the Skip permissions switch shows in the new-chat and resume panels even when 'Enable skip permissions mode?' is off in Settings. Today the setting only makes new chats start with it on, while its description says it allows the switch. Picked option A: hide the per-chat switch until the setting is on; once on, the switch appears and new chats start with it off. Still to ask him: a separate 'start new chats with it on' row. Same in 1.3.3, not a regression; after 1.3.4.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
