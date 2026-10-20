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
Done: Merged Swipe Keyboard 0.2.0 into origin/main at 471d454; tag pushed. Protected SteamOS Desktop combined production input/predictions/languages/privacy passed. Actual supported update 3.8.14 to 3.8.28 retained app/settings and passed post-update input/privacy. Fedora 44 x86_64 Plasma Mobile real RPM input and exact restoration passed. Final source and download hashes verified; upload to draft release in progress.
Next: Publish and verify v0.2.0 downloads, then retain this card for unfinished ARM64/glibc and musl build/session acceptance. Gaming Mode remains deferred beyond Desktop v1.
Blocked: ARM-phone packages, physical Deck/phone performance and musl remain unverified. Do not describe x86 VM Mobile acceptance as ARM phone support. Host keyboard unchanged.

Chats
- 2026-10-20 session/168-swipe-release-integration: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
