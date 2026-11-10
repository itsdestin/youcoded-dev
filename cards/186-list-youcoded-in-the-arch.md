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
Done: On branch session/workspace-tools-batch (not merged) (app): an install that came from another Arch package (youcoded-bin) no longer downloads 206 MB and fails; the update popup says 'This copy of YouCoded was installed from another package, so it can't update itself. Update it with your package manager.' and the version pill's tip matches. Official-package users see no change. Package recipe bumped to 1.3.3 with checksums checked against the GitHub release.
Next: Publish to the AUR once an account can be made (sign-up was closed 2026-10-22; not re-checked).
Blocked: AUR account.

Chats
