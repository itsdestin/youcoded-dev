---
id: 16
title: First-time setup untested on Linux, Windows, Mac
stage: planning
priority: P3
tags: dev-workspace, tests
branch: 16-cross-platform-first-run-testing
roadmap: dev-workspace: Cross-platform first-run testing: 5 open pieces.
created: 2026-10-15
summary: First-run setup and sign-in haven't been fully tested on Linux installers or some Windows PCs, and the Mac test machine is slow.
area: Getting started
side: behind
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (dev-workspace › tests, status confirmed, seen on n/a, last checked 2026-10-01)
Cross-platform first-run testing: 5 open pieces. (a) the full first-run, setup and sign-in pass is untested on the Ubuntu guest, its deb/rpm/pacman installers, and the winget-only flows (Tailscale, rclone, `gh`) on Windows without App Installer; (b) Linux AppImage needs libfuse2 (stock Ubuntu 22.04+ lacks it) and taskbars may not tie the window to YouCoded's icon; (c) the Linux app catalog page (request #8053) needs a `/retest` and a reply in Destin's name after the next release; ask him first; (d) the VM helper's Mac `load` answers "nothing matched" for some builds and fails on file names with spaces; (e) the macOS 26 VM has no saved "ready" state, so every start is a ~5 minute cold boot
