---
id: 82
title: Share Destin's Z13 tablet setup as a free kit
stage: explore
priority: P3
tags: operations, feature
branch: 82-free-z13-tablet-kit-as
roadmap: operations: Free "Z13 tablet kit" as a marketing post: package Destin's
created: 2026-10-15
summary: Package Destin's tablet setup and swipe keyboard as a free download for other Z13 owners, as a post that points to YouCoded.
area: Release & business
work: session/82-z13-keyboard-release
---
Progress
Done: Native Arch/Fedora package gates passed. Approved full Fedora44 KDE VM built on separate40GiB disk, normalkeyboardtestuser Plasma6.7.5/Qt6.11.2. Real taps/swipes 'the world', candidates, symbols, password nonrecording, recordingpermissions, exactdisable restoration, sameversionnative reinstall, actualreboot and subsequenttyping passed; alsoFirefox158Wayland and150pctscale withcorrectkeycenters. Realtests found launcher.setup.lock race: bounded launch-onlywait implemented,27integrationtests and3realrapidactivationcyclespass. Source alsohasselection-awarecontexthelper/8regressionrows but NOTa fixforFirefoxphysicalfieldclear. Latest15native,27integration,24packaging,6VMfixturetestspass. VM andtask-onlyHTTPserversstopped; originalguestkeyboardsettingsrestored; hostdesktopandYouCodeduntouched. Source stageduncommitted; candidatebinariespredatelockfix andrequire rebuild. Fullsetupagentguiderepo remainsdeferred.
Next: Ask Destin whether to keep investigating the browser/context integration or accept a clearly documented Firefox editing limitation. Do not claim this case fixed from unit tests. Evidence and exactVMpaths/logs in swipe-keyboard/docs/standalone-verification.md and verificationcache. After decision: finalfixreview, rebuildnativepackageswithlauncherfix, finishremaininglocale/newversionupgradeacceptance, then separatepublichistory/licenseaudit andpublishapproval.
Blocked: Needs a scope decision: physical Ctrl+A/delete in Firefox can leave surroundingtext/cursor stale or absent in the inputmethod; nextswipeaddsleading space. Reproduced realcase; purehelperunitfixdoesnotresolve. Plugin cannot reliably infer an unreportededit without breaking hiddenbuffersequentialspacing. Furtherbrowser/KWin/Qtboundaryinvestigation vsdocumentedcompatibilitylimitation requires agreement. No publicrelease/commit/pushapproved.

Chats
- 2026-10-17 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started

From the old roadmap (operations, status decision, seen on n/a, last checked 2026-10-14)
Free "Z13 tablet kit" as a marketing post: package Destin's ROG Flow Z13 setup so any Z13 owner on CachyOS/KDE can download and set it up, post it free on the Z13 subreddit, then a comment on how it was built with YouCoded, linking out. In it: touch-profile (tablet/laptop mode switch, status bar, Quick Settings drawer, dock and launcher, edge gestures, iPad-style keyboard), swipe-keyboard (Gboard-style swipe typing, ~97% first-guess on real sentences), and the CachyOS tweaks worth sharing (from the brain: machines/z13). Open before building: (a) one-command, fully reversible installer; strip Destin-only paths and settings; which Z13 models and distros to support. (b) swipe-keyboard's 20-minute FUTO/ExecuTorch build needs prebuilt packages, and the "Powered by FUTO Swipe" notice and GPL source must ship. (c) test on a fresh install before posting. (d) who answers support questions afterwards.
