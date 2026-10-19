---
id: 28
title: Sign the Mac app so it opens without warnings
stage: planning
priority: P1
summary: Mac downloads aren't signed by Apple, so they can open as "broken"; Apple refused the company account and signing waits on that.
area: Leaving & updating
side: behind
platform: Mac only
paused: Deferred to 1.3.2 by Destin; not a 1.3.1 release blocker.
tags: dev-workspace, release, regression, bug
work: session/auto-update-roadmap-20261014, session/release-1-3-2, session/28-apple-signing
vision: everywhere.added.macsign
release: 1.3.2
report: docs/active/investigations/2026-09-03-formalization-costs-and-risks.md
branch: 28-mac-installers-nothing-is-signed
roadmap: dev-workspace: Mac installers: nothing is signed or notarized, and a Mac do
created: 2026-10-15
---
Progress
Done: Signing candidate committed and pushed with owner approval. Production-path commit20216243e; trial SHA c9353848a; cleanup b28067ead restores master-only signing and is tree-identical to20216243e. All3 candidate commits passed Gitleaks. Required verification passed again after cleanup. Temporary GitHub branch policy63592571 removed; only master/v* remain.
Next: Observe actual verdict/artifacts from signed trial run39275523189, then investigate any real failure and verify Apple acceptance plus both final DMGs/Office checks. Current run remains in progress according to check-runs API and public Actions page.
Blocked: No merge/public release authorized. Initial gh watcher exited on jobs API HTTP502, not CI failure; corrected status and switched to independent checks monitoring. No actual signed installer/notarization acceptance observed yet. Signing branch access has not been re-enabled.

Chats
- 2026-10-19 session/28-apple-signing: chat started
- 2026-10-19 session/28-apple-signing: chat started
- 2026-10-18 session/release-1-3-2: Destin completed paid enrollment; payment processing up to 24h. Wants 1.3.1 to be the first Developer ID-signed/notarized Mac release. No Apple secrets or signing config changed yet.

From the old roadmap (dev-workspace › release, status blocked, seen on n/a, last checked 2026-09-04)
Mac installers: nothing is signed or notarized, and a Mac download may open as "broken". Since 2026-07-23 a dependency update stopped the Mac build being stamped, so macOS rejects it and the "Open Anyway" button vanished (terminal command only; in-app updates hit it too). Fix merged 2026-09-04 (build checks its own seal, fails if it cannot sign); still open: a Mac confirming "Open Anyway" is back on a build cut after it (test run 33921417200). Signing is blocked: Apple refused the LLC's account on 2026-10-01; retry from an Apple device or via Apple Support, then it is CI wiring. Windows is done (signed "Destin Moss"). (report: docs/active/investigations/2026-09-03-macos-beta72-unopenable-postmortem.md)

From the 2026-10-16 document sweep
- The announcement banner is downloaded unsigned and with no size limit. Source: docs/active/investigations/2026-09-03-macos-beta72-unopenable-postmortem.md
- The updater should check the download's SHA-256 the way the engine download does. Source: docs/active/investigations/2026-09-03-macos-beta72-unopenable-postmortem.md
