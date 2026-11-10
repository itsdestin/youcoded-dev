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
Done: On branch session/workspace-tools-batch (not merged): the release script now makes the four idea pictures itself (shoots the four pages, refuses if any failed, replaces all four or none) and no longer requires the 48 unused pictures. Sample output was made in a scratch folder only; the live website pictures were not touched.
Next: Destin: look at the four regenerated pictures before they replace the site's (same layout and theme; the paint page has no brush strokes, the hand-made one had some). Decide whether to delete the 48 unused pictures in the app's docs/gallery.
Blocked: nothing.

Chats
