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
Done: v0.2.0 Deck Desktop and x86 Mobile evidence remains recorded, but owner explicitly rejects treating x86 Mobile as completion. ARM64 is a REQUIRED part of the current work and corrective release, not a later follow-up. Existing owned ARM guest/image is preserved for package installation and real-input acceptance.
Next: Complete native aarch64 build/package and ARM64 Plasma Mobile load/input/restoration acceptance with required release gate, coordinated under165. Keep physical hardware claims separate from ARM guest proof.
Blocked: Do not declare Plasma Mobile done or publish the corrective release without ARM64 acceptance. Gaming Mode remains intentionally deferred.

Chats
- 2026-10-20 session/168-swipe-release-integration: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
