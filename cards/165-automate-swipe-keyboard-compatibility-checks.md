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
Done: Implemented required-target/source/version/hash CI and protected final publication approval. Real Fedora and Flatpak producers have passed; Arch now compiles and passes native35 but exposed post-build fixture normalization failures. Parent reproduced those exact failures after production patching inside nested archives, fixed the two test fixtures, targeted4+6 tests PASS. Corrective guides now include Arch and ARM64; not published.
Next: ARM64 is REQUIRED by explicit owner correction. Worker a087919a-b2e4-4715-8006-9bdd1782e329 implements native ARM profiles, required aarch64 package/job/validator and owned ARM Plasma Mobile acceptance. Resume API interruptions from checkpoints. Freeze one coherent four-platform candidate, run actual CI, enforce merge protection, then install corrected host package and publish only complete verified release.
Blocked: ARM64 package/build/load/input acceptance still unfinished and blocks Mobile completion/release. Host remains safely0.1.0-3. No optional ARM canary or x86 substitute; no signature/ABI/privacy bypass. Gaming remains deferred; musl/other phone distributions cannot be claimed without evidence.

Chats
- 2026-10-20 session/165-swipe-release-pipeline: chat started
- 2026-10-20 session/165-swipe-release-pipeline: chat started
- 2026-10-20 session/165-swipe-release-pipeline: chat started
- 2026-10-20 session/165-swipe-release-pipeline: chat started
- 2026-10-20 session/165-swipe-release-pipeline: chat started
