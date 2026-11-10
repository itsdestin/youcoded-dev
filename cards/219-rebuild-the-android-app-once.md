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
Done: Alpine shipped the fixed Node.js (24.22.1, now 24.22.1-r1 on v3.24); the phone build takes Alpine's current Node package at build time, so the next phone release gets it with no change. Checked 2026-11-10.
Next: Before cutting 1.4: the phone build compiles musl (the C library under everything) from the upstream 1.2.6 download and applies only our own resolver patch, so it is MISSING the three security patches Alpine adds on top (CVE-2026-6042, CVE-2026-40200, CVE-2026-107891 — Alpine musl 1.2.6-r3). Make build-runtime.sh fetch and apply Alpine's musl patch set from aports for the pinned branch (or take musl from Alpine's package), run the runtime tests, and try it on a real phone. Also teach the security watch that musl is built from source, so it compares against Alpine's patch list rather than only the package version. Release with 1.4 (Destin 2026-11-10: no separate security release).
Blocked: A real-phone test of the musl change; the 1.4 release date is Destin's.

Chats
