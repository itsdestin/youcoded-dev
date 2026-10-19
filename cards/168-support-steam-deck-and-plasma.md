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
Done: OWNER SCOPE AMENDMENT: Steam Deck v1 Desktop Mode ONLY; Gamescope/Gaming explicitly deferred beyond v1, not a release blocker or current execution task. Canonical plan/ledger/todos updated and current worker notified. Preserve earlier research, no Gaming support claims.
Next: Finish minimal Desktop sensitive-field flags diagnostic/fix and exact-artifact retest; remaining bounded Desktop checks/review, then supported OS-update survival with same per-user installation and root protection enabled. Release wording Desktop Mode only; Gaming Mode not supported.
Blocked: Desktop sensitive-field issue still under causal investigation; no new fix/acceptance claim. OS-update survival unverified. Gaming deliberately out of v1 scope. No publishing/source commits/push/host activation authorized.

Chats
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
