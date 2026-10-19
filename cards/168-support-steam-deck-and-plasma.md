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
Done: Installed stock SteamOS Desktop Wayland baseline established, visually inspected and reproduced on cold boot, stopped cleanly and snapshotted. Root enabled/ro=true; no rootfs unlock/system-library replacement. Exact host Qt6.9.1/glibc2.41/KWin6.4.3/Flatpak1.16.6 now observed. Owner explicitly reinforced immutable-system compatibility and approved continuing.
Next: TaskD1 worker719a2791-e653-499f-9665-bb745653b027 builds pinned per-user Flatpak backend+Swipe with app-scoped data/env and minimal inherited IME socket permissions. No native package forcing, rootfs/system changes, broad host permissions or global Qt tweaks. Exclusive owned Fedora builder. Review steamos-flatpak-build-report.md before installed-target D2 tests including actual update survival.
Blocked: Desktop environment prerequisite done, bundle build/runtime acceptance still pending. Update-survival not proven by fresh image. Gaming remains separate/unverified; ARM tooling/rebuild/session and musl unfinished. Physical Deck absent; host r3 unchanged, no release/source commits/push/activation authorized.

Chats
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
