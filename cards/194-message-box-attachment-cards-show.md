---
id: 194
title: Message-box attachment cards show no image preview in the dev window, on phones and on Android
stage: merged
tags: files, renderer, bug
branch: 194-message-box-attachment-cards-show
created: 2026-10-23
why: Destin, 2026-10-22: 'why are images not showing previews?' AttachmentChip loads images by file:// which only a packaged desktop (file:// page) can follow; ArtifactThumbnail already reads bytes over artifacts:read-binary. The read roots may not include the clipboard paste folder.
---
Progress
Done: 2026-11-12 overnight: phone-browser previews built from the browser's own copy (commit 7296d4c31); full previews filed as #254.
Next: Try on a real phone browser.
Blocked: nothing.

Chats
