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
Done: Owner explicitly reprioritized Deck. D2 exact bundle proved protected-root per-user install, real inherited-socket external typing, reboot retention and exact manual NONE restoration/removal; full privacy/edit/app/scale matrix still incomplete. Parent inspected legible keyboard screenshots, no confirmed label-renderer bug.
Next: Kai b1acb1c6-68ec-477b-bcfd-46ab41890d1b resumed focused D2 with stable test-client geometry/verified coordinates for remaining edit/privacy/focus/scale/app checks. Exclusive lab VM control; report steamos-d2-followup-report.md. After core acceptance, actual OSupdate survival and separate Gaming gate. Features170/171 handed to another session/isolated source worktrees.
Blocked: Full Deck acceptance not yetdone; no physical Deck. Root/sandbox constraints notwaived. No release/merge/sourcecommit/hostactivation permission. Host27GiBreserve,20floor.

Chats
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
