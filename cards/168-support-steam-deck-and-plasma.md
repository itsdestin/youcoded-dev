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
Done: Continuous Deck privacy test caught confirmed launch blocker on current bundle: password already focused withclienthints67 >2s before gesture, actual screenshot shows trail; release length0→4 then2taps→6. Synthetic only, no realpassword/plaintext logged. Earlier core typing/root/reboot/restoration evidence retained, but privacy notaccepted. Host package recheckedr3 unchanged.
Next: Kai onlyverifies safe cleanup/finalreport. Readonlyinvestigator15324bb2-25fb-48d3-ad59-904634cad3f5 traces pinned backend rawpurpose→Qt hints and plugin guards; thenTDDminimalfix/review/newhash/controlledcontinuousretest. RechecksamecaseonMobilebefore extrapolation.
Blocked: RELEASEBLOCKING sensitive-field trail/multichar output in SteamOS Flatpak. Cause notyetconfirmed; no permission/root/guard weakening. OSupdate/client/Gaming acceptance paused. MobileC2 boundedFedorax86 audited, ARM rebuild/session pending. No publish/activation/sourcecommit.

Chats
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
