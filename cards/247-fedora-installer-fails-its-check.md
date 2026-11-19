---
id: 247
title: Fedora installer fails its check on GitHub's new Linux build machines; release build still uses them
stage: merged
tags: release, ci, linux, bug
branch: 247-fedora-installer-fails-its-check
finish: Linux installers build, unpack and install when built on the new system, and neither the checks nor the release build are pinned to the old one.
created: 2026-11-11
why: 2026-11-10: GitHub moved ubuntu-latest from 24.04 to 26.04 and the rpm package check began failing on master and every pull request (it cannot unpack the rpm it just built). Two sessions pinned the four Linux package checks to 24.04 and switched the unpack step to rpm2cpio (app PRs #726, #727). The RELEASE build still uses ubuntu-latest and was not changed. Destin, 2026-11-11: 'it seems like we should also be verifying that the new version works?' Agreed plan: pin the release build to 24.04 now (needs his yes to land), then find the real cause on 26.04, fix it, and unpin both.
work: session/247-linux-release-build
---
Progress
Done: On branch session/247-linux-release-build (app repo), not merged: (1) own commit pinning the release build to 24.04; (2) a later commit taking both pins off. Cause measured on GitHub's machines (run 43126293184): 26.04 ships rpm 6, which builds the new v6 rpm; the check's bsdtar cannot read it, rpm2cpio can. The 26.04 rpm installed with dnf/zypper on Fedora latest/42/41, Rocky 9, Alma 8, openSUSE Leap 15.6 and Tumbleweed. All four package checks pass on 26.04 unpinned (run 43136403568). Not proven: that the installed app starts on Fedora (install only), and the release workflow itself was not run.
Next: DECIDED by Destin 2026-11-11: 'fine with the new machine' — land the branch as it stands (both pins off, checks and release build on ubuntu-latest). Landing itself still waits for his word. Unproven: app opening on Fedora after install; a full release build.
Blocked: nothing.

Chats
- 2026-11-12 session/247-linux-release-build: chat started
