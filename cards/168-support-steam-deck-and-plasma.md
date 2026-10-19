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
Done: Fresh native baseline plus strict metadata-validator fix now passes: CTest18, setup32, packaging36, input-safety6; two optional developer-model assertions remain unrun. Fix under fresh review. Actual Mobile touch delivered The world into independent app; alternative The would and whole-word then character Backspace passed. Password stock-drag/taps and focus-to-password mid-swipe safeguards passed, recording off. USB virtual keyboard fixed recovery management; official installer wrote private NVMe and shut down.
Next: Finish metadata review, then repair reproduced Mobile raw-vs-effective setting restoration with red→green tests. Diagnose installed SteamOS first boot (currently only UEFI splash seen), establish actual Desktop/Gaming sessions and capability gate. Continue Mobile portrait/lifecycle/app matrix; ARM/musl remain pending.
Blocked: Overall support not accepted. Mobile restoration bug remains; installed SteamOS boot/session not yet demonstrated, Gaming/ARM/musl unverified. No publishing/host activation.

Chats
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
