---
id: 115
title: Build the approved secure phone connection option
stage: planning
priority: P2
tags: remote-access, standalone, remote
report: docs/archive/design/2026-09-09-remote-access/remote-access.review-4.json
branch: 115-browser-encryption-the-optional-second
roadmap: remote-access: Browser encryption (the optional second level) is an approve
created: 2026-10-15
summary: The optional encrypted phone connection was designed but never built, so phones show "Not secure" and lack the microphone.
area: Devices & sync
side: both
platform: Phone and web
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #117: 115's encrypted browser connection is exactly what would give a phone browser the microphone that 117(a) is missing.

Chats

From the old roadmap (remote-access › standalone, status confirmed, seen on remote, last checked 2026-09-10)
Browser encryption (the optional second level) is an approved design with nothing behind it. Destin looked for it on 2026-09-10 and found no trace: the Advanced section exists only in the workbench mockup, with no certificates, HTTPS server or stored setting. It would give a phone the microphone, copy buttons and font picker, and stop "Not secure". Cost: enabling HTTPS for the tailnet on Tailscale's site, the computer's name on a public list, a changed address for paired devices, ~90-day renewals. Start at the technical design, not questions.
