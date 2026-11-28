---
id: 219
title: Rebuild the Android app once Alpine patches its Node.js
stage: build
priority: P2
tags: android, security, release
branch: 219-rebuild-the-android-app-once
finish: The phone app's bundled Node.js comes from Alpine's package; the security audit found it carries a known flaw that Alpine had not yet patched. When Alpine ships the fix, refresh the runtime pins and rebuild the Android app.
created: 2026-11-05
work: session/219-musl-patches
---
Progress
Done: Alpine shipped the fixed Node.js (24.22.1-r1 on v3.24); the phone build takes Alpine's current Node package at build time, so the next phone release gets it with no change (checked 2026-11-10). The phone's C library (musl) now carries Alpine's own security patches too: youcoded PR #723 (merged 2026-11-10) vendors Alpine's musl 1.2.6-r3 patch set in app/runtime/alpine-musl-patches/ with checksums, applies it before our resolver patch at build time, and the daily security watch reports when Alpine publishes a newer set ('android-musl' check). Both Android CI builds passed with it. Before, the phone silently lacked CVE-2026-6042, CVE-2026-40200 and CVE-2026-107891 fixes.
Next: Ship with 1.4 (Destin 2026-11-10: no separate security release). At the 1.4 release gate: install the releaseTest build on a real phone and confirm the backend starts and chats work; if Alpine has published musl 1.2.6-r4 or newer by then, run 'python3 app/runtime/alpine-musl-patches.py refresh' first and re-run the runtime tests.
Blocked: The 1.4 release date is Destin's; the real-phone test waits for it.

Chats
- 2026-11-10 session/219-musl-patches: chat started
