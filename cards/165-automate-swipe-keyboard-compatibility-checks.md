---
id: 165
title: Automate Swipe Keyboard compatibility checks and updates
stage: explore
tags: operations, release, housekeeping
related: 82
branch: 165-automate-swipe-keyboard-compatibility-checks
created: 2026-10-18
why: Destin: "fully automate the maintenance burden ... automatically works with future arch/fedora releases when possible." Explicitly a follow-up, not a blocker for getting the first version on Reddit today. Proposed scope: scheduled released-package and native-build matrices for current Arch, supported Fedora and Rawhide canaries; older build baselines; genuine ABI/capability checks rather than arbitrary minor-version upgrade blocks; repeatable real KDE acceptance; signed native update channels (Arch repository/COPR); safe update activation and rollback; gated publication of unchanged-code rebuilds, with review for functional/privacy/security/model/license changes. One-time accounts/signing setup and automation policy remain implementation decisions; no automation is enabled by filing this item.
work: session/165-swipe-release-pipeline
---
Progress
Done: Native prediction source363fd2a frozen/pushed; required parallel platform CI39526485965 active. Actual stock-native tap/swipe→Space→three centered-best suggestions and each-slot insertion demonstrated; privacy stale-touch demo passed. Native docs corrected. Focused reviewer found no actionable bugs; ARM evidence investigation completed without speculative source changes.
Next: ARM worker135 resumes one precise authorized-replacement forwarding probe while four-platform CI builds363fd2a; parent coordinates final artifacts/Flatpak stable+beta checks/owner update. No redundant full review rounds or intermediate CI reruns.
Blocked: ARM correction/word deletion/i18n/privacy runtime acceptance remains REQUIRED. Final363fd2a four-platform packages not yet built/accepted; owner native package not updated; PR3 unmerged and no corrective release published.

Chats
- 2026-10-21 session/165-swipe-release-pipeline: chat started
- 2026-10-21 session/165-swipe-release-pipeline: chat started
- 2026-10-21 session/165-swipe-release-pipeline: chat started
- 2026-10-21 session/165-swipe-release-pipeline: chat started
- 2026-10-20 session/165-swipe-release-pipeline: chat started
- 2026-10-20 session/165-swipe-release-pipeline: chat started
- 2026-10-20 session/165-swipe-release-pipeline: chat started
- 2026-10-20 session/165-swipe-release-pipeline: chat started
- 2026-10-20 session/165-swipe-release-pipeline: chat started
- 2026-10-20 session/165-swipe-release-pipeline: chat started
