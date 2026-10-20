---
id: 28
title: Sign the Mac app so it opens without warnings
stage: merged
priority: P1
summary: Developer ID signing and notarization are merged and verified for both Mac architectures; public 1.3.1 downloads stay unchanged until the next approved release.
area: Leaving & updating
side: behind
platform: Mac only
tags: dev-workspace, release, regression, bug
work: session/auto-update-roadmap-20261014, session/release-1-3-2, session/28-apple-signing, session/28-signing-doc-cleanup
vision: everywhere.added.macsign
release: 1.3.2
report: docs/archive/plans/2026-10-19-apple-signing.md
branch: 28-mac-installers-nothing-is-signed
roadmap: dev-workspace: Mac installers: nothing is signed or notarized, and a Mac do
created: 2026-10-15
---
Progress
Done: Complete: appPR655 signing/copy merged7c0a46e1c; deterministic post-merge Node22CI reporter repairPR656 merged1f7629142 after126semantic cases/realV8regression and native PR/fullplatformchecks passed. WorkspacePR282 merged, plan archived, MAP/build/VM guidance updated. Both architectures notarized/issuesnull; quarantined Intel VM normalOpen/onboarding verified/restored. Approved downloadcopy deployed and matched live modal script. Temporary signing access removed; evidence/installers preserved outside worktrees.
Next: Public installer release intentionally deferred; current public version1.3.1 remains unchanged. Future release tagging/publication requires separate owner instruction. No further work for this implementation card.
Blocked: None for this implementation. No release tag, production install, live-app mutation or paid harness evaluation. The original signing session branches/worktrees were removed after remote ancestry verification.

Chats
- 2026-10-20 session/28-signing-doc-cleanup: chat started
- 2026-10-20 session/28-apple-signing: chat started
- 2026-10-20 session/28-apple-signing: chat started
- 2026-10-19 session/28-apple-signing: chat started
- 2026-10-19 session/28-apple-signing: chat started
- 2026-10-19 session/28-apple-signing: chat started
- 2026-10-19 session/28-apple-signing: chat started
- 2026-10-18 session/release-1-3-2: Destin completed paid enrollment; payment processing up to 24h. Wants 1.3.1 to be the first Developer ID-signed/notarized Mac release. No Apple secrets or signing config changed yet.

Historical roadmap import — state last checked 2026-09-04, superseded by the completion notes above
Mac installers: nothing is signed or notarized, and a Mac download may open as "broken". Since 2026-07-23 a dependency update stopped the Mac build being stamped, so macOS rejects it and the "Open Anyway" button vanished (terminal command only; in-app updates hit it too). Fix merged 2026-09-04 (build checks its own seal, fails if it cannot sign); still open: a Mac confirming "Open Anyway" is back on a build cut after it (test run 33921417200). Signing is blocked: Apple refused the LLC's account on 2026-10-01; retry from an Apple device or via Apple Support, then it is CI wiring. Windows is done (signed "Destin Moss"). (report: docs/archive/investigations/2026-09-03-macos-beta72-unopenable-postmortem.md)

Historical 2026-10-16 sweep notes — announcement work remains in #86(c); updater integrity verification is implemented in update-service.ts/update-manifest-verify.ts. These are not open signing blockers.
- The announcement banner is downloaded unsigned and with no size limit. Source: docs/archive/investigations/2026-09-03-macos-beta72-unopenable-postmortem.md
- The updater should check the download's SHA-256 the way the engine download does. Source: docs/archive/investigations/2026-09-03-macos-beta72-unopenable-postmortem.md
