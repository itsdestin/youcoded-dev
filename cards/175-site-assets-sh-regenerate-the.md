---
id: 175
title: Make the website's idea pictures refresh themselves on each release
stage: planning
priority: P3
tags: dev-workspace, website
branch: 175-site-assets-sh-regenerate-the
finish: site-assets.sh step 3 writes docs/gallery/idea-*.webp from the demo and workbench pages and no longer insists on 48 unused stills.
created: 2026-10-21
why: The landing page's bottom strip became an ideas wall on 2026-10-21 (card #79); its four stills were captured by hand from the demo's Home and Finance pages and two workbench pages, so a release run of site-assets.sh refreshes 48 stills nobody sees and leaves the four that matter stale.
---
Progress
Done: the 2026-10-23 release (youcoded-dev PR #317, commit 352d799da) stopped the release script from deleting the four idea pictures on the website.
Next: make the release script make fresh idea pictures from the demo and workbench pages, and stop requiring 48 unused pictures (scripts/ui-review/site-assets.sh line 89).
Blocked: nothing.

Chats
