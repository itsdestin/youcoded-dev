---
id: 16
title: First-time setup untested on Linux, Windows, Mac
stage: planning
priority: P3
tags: dev-workspace, tests, housekeeping
branch: 16-cross-platform-first-run-testing
roadmap: dev-workspace: Cross-platform first-run testing: 5 open pieces.
created: 2026-10-15
summary: First-run setup and sign-in haven't been fully tested on Linux installers or some Windows PCs, and the Mac test machine is slow.
area: Getting started
side: behind
vision: everywhere.firstrun.setup
---
Progress
Done: Fedora44 KDE is now available as a reusable disk-only test guest at ~/vms/fedora-44-kde, alongside Windows/Ubuntu/macOS. Real boot, dedicated SSH/sudo, Spectacle screenshot, clean session reset, HTTP native RPM delivery/origin metadata and trim passed; idle watcher integration installed and reviewed. Workspace helper/docs merged and pushed in youcoded-dev PR #270 (ae99dd33), with the canonical shared helper and automatic VM safety CI checks. Private machine references are integrated into system-brain main (a36ce4b). Availability does not certify YouCoded first-run/setup/sign-in flows or resolve the historical roadmap items.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (dev-workspace › tests, status confirmed, seen on n/a, last checked 2026-10-01)
Cross-platform first-run testing: 5 open pieces. (a) the full first-run, setup and sign-in pass is untested on the Ubuntu guest, its deb/rpm/pacman installers, and the winget-only flows (Tailscale, rclone, `gh`) on Windows without App Installer; (b) Linux AppImage needs libfuse2 (stock Ubuntu 22.04+ lacks it) and taskbars may not tie the window to YouCoded's icon; (c) the Linux app catalog page (request #8053) needs a `/retest` and a reply in Destin's name after the next release; ask him first; (d) the VM helper's Mac `load` answers "nothing matched" for some builds and fails on file names with spaces; (e) the macOS 26 VM has no saved "ready" state, so every start is a ~5 minute cold boot

From the 2026-10-16 document sweep
- First real push from a fresh machine with no `gh` installed, on build 647bd242 or later (it also checks the in-app GitHub sign-in). Source: docs/active/handoffs/2026-07-10-sync-completion-handoff.md
