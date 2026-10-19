---
id: 168
title: Support Steam Deck and Plasma Mobile in Swipe Keyboard
stage: build
tags: operations, feature
related: 82, 165
branch: 168-support-steam-deck-and-plasma
created: 2026-10-19
why: Reddit feedback identifies Steam Deck and Plasma Mobile as priority targets. Destin requests planning only before context compaction: think through Steam Deck Desktop and Gaming Mode plus Plasma Mobile, with local build/test/iterate gates on this device until each implementation is working in its tested environment. No implementation, image downloads, VM launches, publication, or changes to the installed keyboard in this planning session. Scope includes stock SteamOS compatibility, update-safe packaging, Mobile configuration ownership, ARM64/glibc and separately musl, safety/lifecycle acceptance, honest physical-device evidence boundaries and compact-ready handoff.
work: session/168-swipe-platform-support
---
Progress
Done: Fedora-native C1 RPM built/installed/reinstalled exact SHA1368b6a30349b6f16c893caec56152b7f10a4b0fdc9e8e75a9431b4944eb80cf. Native18/integration57/packaging39 (Arch-only skip)/session6 plus actual post-reboot Mobile typing, alternatives, Backspace, password/focus, portrait input and raw-absence restoration exercised. Parent confirmed explicit Shift yields The world. Acceptance caught real immediate live-switch failure.
Next: C2 source worker2241b3fe-881f-44a8-ac39-284f9e427baf fixes verified missing logical KConfig notification with real private-D-Bus watcher regression. Read source-root live-switch-report.md, fresh-review then rebuild/test distinct Fedora C2 artifact. Guest currently stock/disabled after diagnostic cleanup; no concurrent guest owner.
Blocked: C1 not accepted: absolute-file kwriteconfig suppresses notifications, confirmed by source and guest PID/mapping changes when proper logical notification is emitted. No reboot/manual-notify workaround counts as fixed. SteamOS/Gaming/ARM/musl remain incomplete; no physical Deck. Host r3 untouched; no release/source commits/push.

Chats
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
