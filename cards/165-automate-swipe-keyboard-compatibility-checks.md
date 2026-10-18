---
id: 165
title: Automate Swipe Keyboard compatibility checks and updates
stage: explore
tags: operations, release, housekeeping
related: 82
branch: 165-automate-swipe-keyboard-compatibility-checks
created: 2026-10-18
why: Destin: "fully automate the maintenance burden ... automatically works with future arch/fedora releases when possible." Explicitly a follow-up, not a blocker for getting the first version on Reddit today. Proposed scope: scheduled released-package and native-build matrices for current Arch, supported Fedora and Rawhide canaries; older build baselines; genuine ABI/capability checks rather than arbitrary minor-version upgrade blocks; repeatable real KDE acceptance; signed native update channels (Arch repository/COPR); safe update activation and rollback; gated publication of unchanged-code rebuilds, with review for functional/privacy/security/model/license changes. One-time accounts/signing setup and automation policy remain implementation decisions; no automation is enabled by filing this item.
---
Progress
Done: Follow-up scope recorded only; no scheduled publication, signing infrastructure, native update channel or maintenance automation enabled for the first release.
Next: After the Reddit launch, design the gated routine-rebuild policy and signed Arch/COPR channels. Include --init/process reaping and ephemeral pacman-key initialization/normal keyring refresh for reusable test containers: a long-lived container exhausted its PID budget with unreaped GPG children during repeated distro switches.
Blocked: Explicitly deferred by Destin so it does not delay the first Reddit release.

Chats
