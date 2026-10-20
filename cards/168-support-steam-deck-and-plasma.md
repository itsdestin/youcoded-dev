---
id: 168
title: Support Steam Deck and Plasma Mobile in Swipe Keyboard
stage: build
tags: operations, feature
related: 82, 165
branch: 168-support-steam-deck-and-plasma
created: 2026-10-19
why: Reddit feedback identifies Steam Deck and Plasma Mobile as priority targets. Destin requests planning only before context compaction: think through Steam Deck Desktop and Gaming Mode plus Plasma Mobile, with local build/test/iterate gates on this device until each implementation is working in its tested environment. No implementation, image downloads, VM launches, publication, or changes to the installed keyboard in this planning session. Scope includes stock SteamOS compatibility, update-safe packaging, Mobile configuration ownership, ARM64/glibc and separately musl, safety/lifecycle acceptance, honest physical-device evidence boundaries and compact-ready handoff.
work: session/168-swipe-platform-support, session/168-swipe-release-integration
---
Progress
Done: Published Swipe Keyboard v0.2.0: https://github.com/itsdestin/swipe-keyboard/releases/tag/v0.2.0 . Source merged/pushed to main at 471d4546be5af8f14772df6f2c7196c88c64d064. Final Flatpak, Fedora RPM, complete source and checksums published; all four public download URLs returned HTTP 200 and GitHub upload digests matched local files. Protected SteamOS input/prediction/language/privacy and actual supported 3.8.14 to 3.8.28 update survival passed. Fedora 44 x86_64 Plasma Mobile minimum real-input/restoration passed. Install/update/removal/language settings instructions published.
Next: Remaining platform work is ARM64/glibc and musl build/load/session acceptance; physical device and broader application coverage remain unverified. Gaming Mode deferred beyond Desktop v1. Preserve original feature/platform worktrees and VM evidence.
Blocked: No ARM-phone package or ARM/physical-phone certification. Do not imply x86 Mobile results finish ARM support. Host keyboard and running YouCoded unchanged.

Chats
- 2026-10-20 session/168-swipe-release-integration: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
