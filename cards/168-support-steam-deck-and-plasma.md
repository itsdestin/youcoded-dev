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
Done: Planning-only design/build/test/iterate outline saved at swipe-keyboard/docs/superpowers/plans/2026-10-18-steam-deck-plasma-mobile.md in isolated standalone branch platform-support-planning, baseline 0f458bb. Includes Steam Deck Desktop and mandatory Gaming feasibility/implementation track, actual Fedora Mobile session, ARM64/glibc and separate musl lane, guest-only input, ownership/privacy gates, complete local acceptance loop and physical-proof limits. Fresh read-only plan review completed; update-survival ambiguity corrected. No builds, image downloads, VM launches, installations or host keyboard changes.
Next: After owner compacts and approves starting, resume session 168-swipe-platform-support; read saved plan first. Provision isolated target baselines and run Gaming feasibility early, alongside Mobile baseline tests. Read supplemental Gaming protocol report if available; do not assume APIs exist or a windowed Big Picture demo proves Gaming support.
Blocked: Intentional owner-requested pause before implementation. No physical Deck/phone access established; local VM correctness work can begin without pretending hardware verification.

Chats
- 2026-10-19 session/168-swipe-platform-support: chat started
