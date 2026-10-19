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
Done: Focused real protected SteamOS D2 native checks now observed: alternatives, word/character deletion, Shift/taps, verified password-length1→3, held focus/selection/cursor cancellation, hide/reopen, genuinely overlapping125% scale recovery, GTK qhelp. Exact artifact unchanged; original NONE/hash restored, app removed, clean stopped/disk healthy. XWayland no-context unsupported; no fullacceptance.
Next: Kai b1acb1c6-68ec-477b-bcfd-46ab41890d1b tests continuous sensitive-drag/focus/samefield-purpose behavior with actual frames/timestamps, then bounded independentFlatpak/browser coverage. Parent saw old trail in held-focus image: diagnostic lead, not confirmed defect or waived pass. Read steamos-d2-finalchecks-report.md. Actual OSupdate survival follows, then separate Gaming.
Blocked: FullD2/finalreview/update/Gaming unfinished. Browser/independentclient unrun, XWayland no input context. Features170/171 handed to another session; thissession staysDeckpriority. No physicalDeck/sourcecommits/publish/hostactivation;20GiBfloor.

Chats
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
