---
id: 168
title: Support Steam Deck and Plasma Mobile in Swipe Keyboard
stage: planning
tags: operations, feature
related: 82, 165
branch: 168-support-steam-deck-and-plasma
created: 2026-10-19
why: Reddit feedback identifies Steam Deck and Plasma Mobile as priority targets. Destin requests planning only before context compaction: think through Steam Deck Desktop and Gaming Mode plus Plasma Mobile, with local build/test/iterate gates on this device until each implementation is working in its tested environment. No implementation, image downloads, VM launches, publication, or changes to the installed keyboard in this planning session. Scope includes stock SteamOS compatibility, update-safe packaging, Mobile configuration ownership, ARM64/glibc and separately musl, safety/lifecycle acceptance, honest physical-device evidence boundaries and compact-ready handoff.
work: session/168-swipe-platform-support
---
Progress
Done: Reviewed planning document saved; final Gaming protocol research incorporated. Gamescope exposes an explicitly private IME with no field/selection/password context; source-only overlay/libei leads are listed as feasibility probes, not working support. Plan requires actual-session routing/focus/privacy proof and explicit upstream/owner decision for any experimental private-protocol shipping scope. No builds or live-system changes.
Next: After compaction, review/read the saved plan and start isolated target provisioning plus early Gaming feasibility only when owner says to begin. Card remains intentionally paused.
Blocked: Planning-only pause requested by owner. Gaming supportability is a discovery gate, not a promised completed implementation.

Chats
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
