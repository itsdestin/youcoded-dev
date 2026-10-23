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
Done: Steam Deck Gaming Mode swipe + next-word support merged to swipe-keyboard main (PR #5, c940c16): opt-in installer with separate outside-access block, switch watcher, failsafe, review fixes, faster CI; VM-verified M4-M9. Not released yet.
Next: Real Steam Deck pass (M11: Steam+X chord, Steam text garbling); throwaway Steam account for the weekly canary; hosted update repo (GPG key, secrets, Pages); version bump + README link at first release; daemon /tmp fallback; Plasma Mobile half.
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
