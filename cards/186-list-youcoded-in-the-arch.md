---
id: 186
title: List YouCoded in the Arch package collection (AUR)
stage: explore
tags: feature, linux, packaging, desktop
vision: everywhere.added.linux, everywhere.added.update
branch: 186-list-youcoded-in-the-arch
created: 2026-10-22
why: lets do ... arch packages (2026-10-22). Tested PKGBUILD for youcoded-bin (repackages the official .pacman) is on branch session/seo-discovery at youcoded/packaging/aur/. Before publishing: app fix so an install owned by youcoded-bin says 'update with your package manager' instead of running pacman -U on the official package, which conflicts and fails (linux-install-kind.ts reads only which manager owns the binary, not the package name). Blocked 2026-10-22: AUR new-account registration closed for everyone.
---
Progress
Done: the Arch package recipe for YouCoded (packaging/aur/PKGBUILD and .SRCINFO) is already in the code on master, merged 2026-10-22 through the site-discovery update (youcoded PR #683).
Next: (1) change the app so an install made from the Arch package says "update with your package manager" instead of trying to replace itself; (2) bump the package to the current release (v1.3.3); (3) publish it to the Arch User Repository (AUR) once new accounts can be made again.
Blocked: AUR account sign-up was closed on 2026-10-22; not checked today.

Chats
