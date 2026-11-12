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
Done: On branch session/247-linux-release-build, not merged: new idea-paint.webp on the site (app repo); idea-picture step and its SITE_IDEA_STILLS switch removed from site-assets.sh, site-idea-stills.sh kept as a hand-run tool (workspace repo). Before/after deck: docs/active/design/2026-11-11-paint-picture/.
Next: Destin approved the new paint picture on the review deck 2026-11-11 (answer saved on session/247-linux-release-build). Landing waits for his word. The 48 unused stills: still unanswered.
Blocked: nothing.

Chats
