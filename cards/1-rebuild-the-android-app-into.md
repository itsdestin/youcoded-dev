---
id: 1
title: Rebuild the Android app to match desktop
stage: build
priority: P2
tags: android-only, android, perf, performance, feature
release: v1.3.2
report: docs/active/plans/2026-10-14-android-clean-rebuild-plan.md
branch: 1-rebuild-the-android-app-into
roadmap: android-only: Rebuild the Android app into a premium, complete mobile equi
created: 2026-10-15
summary: The phone app would get the same built-in assistant, real file access, working updates and a Google Play listing, not a manual install.
area: Devices & sync
side: both
platform: Android only
work: session/android-setup-20261014, session/android-setup-closeout, session/android-setup-wrapup
vision: everywhere.platforms.android, everywhere.added.play
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #31: The Android rebuild in 1 aims at a Google Play listing; 31 is the Play account and store paperwork that listing needs.

See also #112: 112's remaining item (a), Android joining the shared phone protocol, is phases A2 to A4 of the Android rebuild in 1.

Chats

From the old roadmap (android-only, status in-flight, seen on android, last checked 2026-10-04)
Rebuild the Android app into a premium, complete mobile equivalent of desktop: the same built-in assistant, local models marked "not available on this device", updates and notifications that arrive, sharing into the app, real file access, touch-first input, and a Google Play listing instead of sideloading. Design-first: a rethought phone default (quick dispatch and search) with the full desktop-narrow UI still reachable. Runs as phases A0–A6 since 2026-09-24: the phone runs the computer's own assistant core and every program ships inside the app (Google Play refuses downloads after install). Unblocked now: A0 (phone experiments) and A1 (Play packaging); A2 (the assistant on the phone) follows once the finished remote-access refactor, feat/one-core, lands. Start at the clean-rebuild plan (docs/active/plans/2026-10-14-android-clean-rebuild-plan.md); the one-core START-HERE is history. Destin 2026-10-05 triage (roadmap-triage-2026-10-05#3): postponed — "1.3.2+. rebuild will be tied to google play/iphone listings."

Merged in #111 "Android may lag while a reply streams and drain battery"
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (perf, status needs-verify, seen on android, last checked 2026-10-04)
On Android the phone app may be slow while a reply streams, and phones get full glass blur by default with nothing turning it down. Both found by reading code, not measured: each session runs two terminals and rebuilds the whole 2,000-line scrollback as text on every screen update on the touch thread, plus a once-a-second scan per session; output can be dropped when the screen falls behind; the phone is kept awake whenever a session exists and four polling loops per session never pause in the background; blur is the costliest effect on phone chips. Feel: hitches, a terminal that looks frozen then jumps, battery drain

Updated on the old roadmap after the move (master, merged in 2026-10-16)
Rebuild the Android app into a premium, complete mobile equivalent of desktop: the same
built-in assistant, local models marked "not available on this device", updates and
notifications that arrive, sharing into the app, real file access, touch-first input, and a
Google Play listing instead of sideloading. Design-first: a rethought phone default (quick
dispatch and search) with the full desktop-narrow UI still reachable. Since 2026-10-14 a
clean rebuild (P1–P6): the phone runs the desktop's own backend headless inside the app,
the old Kotlin app is deleted rather than migrated, and the newest Claude Code replaces the
frozen 2.1.112. A0 phone experiments passed inside a real app sandbox on 2026-10-14.
Destin 2026-10-14: "nobody is using the app rn … i don't want to build any intermediate
fixes that we know we will rebuild later." P1–P3 merged 2026-10-15 (the backend runs on the
phone, the Kotlin shell, the bundled programs). Next: P4, "not on this device" for desktop-only
features (the sign-in screen still offers local models and says "this computer"), then P5
phone-native features and the P6 Play listing. Before giving the app to anyone: Destin's company
must have accepted Anthropic's Commercial Terms (shipping Claude Code inside a product requires it;
code.claude.com/docs/en/legal-and-compliance), and the binary stays unmodified.
`android` `in-flight` `P2` `checked 2026-10-15` → docs/active/plans/2026-10-14-android-clean-rebuild-plan.md

