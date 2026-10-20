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
Done: Owner reactivated narrow release/merge automation after v0.2.0 omitted Arch. Read actual YouCoded CI/release code and live merge protections; approved lean required-target/one-publish gate design. Isolated source branch ci/165-swipe-release-pipeline. Native KWin valid empty-subgroup regression fixed test-first: 3 failing cases before correction, full integration73PASS, fresh read-only actual host helper probe PASS, narrow review PASS. Host safely rolled back to0.1.0-3; no new live activation.
Next: Implement required Arch/Fedora/Deck package manifest, version/source/hash validator and automatic read-only PR/main checks plus one trusted publication job. Run actual candidate CI; enable verified required completion check including admins. Complete corrected native user update and corrective release only with real evidence.
Blocked: Pipeline worker12943089-e5a2-4237-97e5-cc3717eb9d2a active; no remote candidate CI yet. Broad scheduled maintenance, signing, AUR/COPR, ARM and Gaming are not added to this scope. Existing v0.2.0 source/public downloads preserved.

Chats
- 2026-10-20 session/165-swipe-release-pipeline: chat started
- 2026-10-20 session/165-swipe-release-pipeline: chat started
- 2026-10-20 session/165-swipe-release-pipeline: chat started
