---
id: 219
title: Rebuild the Android app once Alpine patches its Node.js
stage: planning
priority: P2
tags: android, security, release
branch: 219-rebuild-the-android-app-once
finish: The phone app's bundled Node.js comes from Alpine's package; the security audit found it carries a known flaw that Alpine had not yet patched. When Alpine ships the fix, refresh the runtime pins and rebuild the Android app.
created: 2026-11-05
---
Progress
Done: Alpine has since shipped the fixed Node.js (24.22.1), checked 2026-11-09. The phone app's last release (v1.3.3, 2026-10-23) still has the older one. The daily security watch has an open issue for this (youcoded issue 720).
Next: when Destin says go, rebuild and release the phone app with the new Node.js. No code change expected. Decide what goes into that release (the phone-finish work in cards 213 and 1 is not merged yet).
Blocked: Nothing from Alpine any more. The release waits on Destin's go and on the phone-finish decision.

Chats
