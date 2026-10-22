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
Done: Published Swipe Keyboard v0.3.0-1 (https://github.com/itsdestin/swipe-keyboard/releases/tag/v0.3.0-1, main d571a63): native ARM64 Fedora 44 Plasma Mobile package plus Deck/Arch/Fedora x86. Tag-run bytes accepted in an emulated ARM Plasma Mobile session and SteamOS 3.8/3.9 Desktop guests: completion tap, next-word, correction, whole-word Backspace, password field, deselect closes keyboard.
Next: musl/postmarketOS builds; physical phone and Deck checks; Gaming Mode still deferred.
Blocked: 

Chats
- 2026-10-20 session/168-swipe-release-integration: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
