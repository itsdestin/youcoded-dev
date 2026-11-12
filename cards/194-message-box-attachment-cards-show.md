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
Done: nothing yet. 2026-11-11 chat-engine batch: checked against code, nothing built. Cause confirmed and wider than first thought: attachment cards load pictures by file address, which only the installed desktop app can follow. Pasted pictures (temp folder claude-desktop-attachments), phone uploads (claude-desktop-uploads) and Android picks (files/tmp/attachments, added by app PR #730) are all outside the folders the app allows to be read, so switching to the thumbnail method alone would still fail.
Next: DECIDED by Destin on the wave-2 deck 2026-11-12 (docs/active/design/2026-11-12-wave-2): phone-browser-only previews (preview from the picture the browser already holds; nothing read from the computer). His note: leave a card to come back to full previews (Android app, test copies), which need the security-reviewed read of the temp attachment folders.
Blocked: nothing.

Chats
