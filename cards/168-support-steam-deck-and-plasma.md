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
Done: CorrectSDK6.10.3 diagnosticsOFFproduction rebuild completed buildtree19/profile15/ELFassets/minpermission/preflightchecks, but installed/appInputPanel stationary sensitivecancel fixtureFAILED twice(trackedId7not-1). Candidate0c8ac...preservedFAILED-LOADER, NOTdeployed. SteamOSoriginalNONE/appabsent/rootprotected/cleanstopped/diskhealthy.
Next: Worker4faf4217-2535-423e-a4b1-16f6b61db893 reproducesinstalledprefixvsbuildtreediscrepancy inownedbuilder, identifiescausebeforeminimalTDDsource/fixturefix. Read deck-installed-cancellation-report.md; noSteamOSboot/exportuntestedcandidate. AftercleanreviewnewproductionbundleandrealprivacyA/B/C, thenOSupdatesurvival.
Blocked: Installedprefixstationarycanceltestfailsdespitenativebuildtreegreen; rootcauseunknown. No testwaiver/timerdeadline/permission/rootworkaround. Deckv1DesktopONLY, Gamingdeferred. No release/commits/push/hostactivation.

Chats
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
- 2026-10-19 session/168-swipe-platform-support: chat started
