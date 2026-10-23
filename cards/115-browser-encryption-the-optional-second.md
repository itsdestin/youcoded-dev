---
id: 115
title: Build the approved secure phone connection option
stage: planning
priority: P2
tags: remote-access, standalone, remote, feature
report: docs/archive/design/2026-09-09-remote-access/remote-access.review-4.json
branch: 115-browser-encryption-the-optional-second
roadmap: remote-access: Browser encryption (the optional second level) is an approve
created: 2026-10-15
summary: The optional encrypted phone connection was designed but never built, so phones show "Not secure" and lack the microphone.
area: Devices & sync
side: both
platform: Phone and web
vision: everywhere.added.remoteenc, chat.converse.voice
---
Progress
Done: nothing recorded.
Next: Start at the technical design. 2026-10-22 (session/remote-access-audit, Destin: record it, decide later): not worth it for speed alone — after the buddy-picture fix the phone downloads ~1.0 MB over gzip vs ~0.8 MB with brotli (~0.3 s, first open after an update only), while the extra encryption handshake adds ~0.5 s to every new connection and every resume on a slow link. Worth it as its own feature for: voice typing in the phone browser (#117), an installable home-screen app that opens instantly and could show the last conversation offline, and phone notifications ('Claude finished' / 'needs your OK'). Keep the plain address as a fallback; update remote-origin checks and the Android app's address.
Blocked: nothing recorded.

See also #117: 115's encrypted browser connection is exactly what would give a phone browser the microphone that 117(a) is missing.

Chats

From the old roadmap (remote-access › standalone, status confirmed, seen on remote, last checked 2026-09-10)
Browser encryption (the optional second level) is an approved design with nothing behind it. Destin looked for it on 2026-09-10 and found no trace: the Advanced section exists only in the workbench mockup, with no certificates, HTTPS server or stored setting. It would give a phone the microphone, copy buttons and font picker, and stop "Not secure". Cost: enabling HTTPS for the tailnet on Tailscale's site, the computer's name on a public list, a changed address for paired devices, ~90-day renewals. Start at the technical design, not questions.
