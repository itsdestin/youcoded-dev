---
id: 247
title: Fedora installer fails its check on GitHub's new Linux build machines; release build still uses them
stage: planning
tags: release, ci, linux, bug
branch: 247-fedora-installer-fails-its-check
finish: Linux installers build, unpack and install when built on the new system, and neither the checks nor the release build are pinned to the old one.
created: 2026-11-11
why: 2026-11-10: GitHub moved ubuntu-latest from 24.04 to 26.04 and the rpm package check began failing on master and every pull request (it cannot unpack the rpm it just built). Two sessions pinned the four Linux package checks to 24.04 and switched the unpack step to rpm2cpio (app PRs #726, #727). The RELEASE build still uses ubuntu-latest and was not changed. Destin, 2026-11-11: 'it seems like we should also be verifying that the new version works?' Agreed plan: pin the release build to 24.04 now (needs his yes to land), then find the real cause on 26.04, fix it, and unpin both.
work: session/247-linux-release-build
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
- 2026-11-12 session/247-linux-release-build: chat started
