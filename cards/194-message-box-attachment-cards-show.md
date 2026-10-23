---
id: 194
title: Message-box attachment cards show no image preview in the dev window, on phones and on Android
stage: explore
tags: files, renderer, bug
branch: 194-message-box-attachment-cards-show
created: 2026-10-23
why: Destin, 2026-10-22: 'why are images not showing previews?' AttachmentChip loads images by file:// which only a packaged desktop (file:// page) can follow; ArtifactThumbnail already reads bytes over artifacts:read-binary. The read roots may not include the clipboard paste folder.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
