---
id: 28
title: Mac installers: nothing is signed or notarized, and a Mac download may open as "broken"
stage: planning
priority: P1
tags: dev-workspace, release, regression
release: v1.3.1
report: docs/active/investigations/2026-09-03-formalization-costs-and-risks.md
branch: 28-mac-installers-nothing-is-signed
roadmap: dev-workspace: Mac installers: nothing is signed or notarized, and a Mac do
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: yes — the old roadmap marked it blocked; see below.

Chats

From the old roadmap (dev-workspace › release, status blocked, seen on n/a, last checked 2026-09-04)
Mac installers: nothing is signed or notarized, and a Mac download may open as "broken". Since 2026-07-23 a dependency update stopped the Mac build being stamped, so macOS rejects it and the "Open Anyway" button vanished (terminal command only; in-app updates hit it too). Fix merged 2026-09-04 (build checks its own seal, fails if it cannot sign); still open: a Mac confirming "Open Anyway" is back on a build cut after it (test run 33921417200). Signing is blocked: Apple refused the LLC's account on 2026-10-01; retry from an Apple device or via Apple Support, then it is CI wiring. Windows is done (signed "Destin Moss"). (report: docs/active/investigations/2026-09-03-macos-beta72-unopenable-postmortem.md)
