---
id: 147
title: Management surface: the next round
stage: planning
priority: P2
tags: management-surface, dev-workspace, housekeeping
branch: 147-management-surface-the-next-round
created: 2026-10-16
why: Destin, 2026-10-16: three follow-ups for the management page
summary: Three follow-ups: rebuild priority and version tags, make Screens complete and better sorted, and a full human review of the page.
area: Developer tools
side: screens
vision: together.workflow.surface
work: session/147-work-board-release-view
---
Progress
Done: 2026-11-14 (youcoded-dev PR #378, merged): 'Since the last release' is worked out live; each merged change carries lines for users (cards.mjs notice) shown in one box with a changelog draft; Big picture's Shipped list comes from merged items and the Became real card is gone; dead buttons wired or removed; spacing, focus ring, hover flicker, menu position and phone-width cards fixed. This covered part of follow-up 3 (review of the page), not all of it. The priority and version tags are still not back.
Next: (1) Bring back priority and version tags in a way that works. (2) Make the Screens tab cover every app screen, with better picture history and sorting. (3) Finish the page review: Screens and Big picture in the app theme, hover and press at phone width, and a look inside YouCoded itself.
Blocked: nothing.

Chats
- 2026-11-14 session/147-work-board-release-view: chat started
- 2026-11-11 session/147-work-board-release-view: chat started
- 2026-10-17 session/work-cards-20261014: built the Work board this round builds on (merged 2026-10-16)

What it covers (Destin, 2026-10-16)
1. Rebuild priority and version tagging for the new management surfaces. Both were scrapped from the
   rows on 2026-10-16 because no design round had decided them; the old values stay recorded in each
   card (priority:, release:) as input.
2. Review the Screens tab: make sure it captures EVERY screen in the app, improve the version history
   of each screen's pictures, and improve how screens are categorised.
3. A more comprehensive human review of the whole management surface (Today, Screens, Big picture,
   the item popup, bulk edit) for UX, UI and usefulness improvements, then iterate. Run it in a new
   session.

Seen 2026-10-16 running the Work board in a dev window: Big picture's "What's blocked · Built twice · Shipped this
month" are clickable bare text (Destin dislikes clickable bare text); left as approved Oct 12 for this review.

From the 2026-10-16 document sweep
- Dev dashboard idea (decided 2026-09-05, never built): launch dev copies, run the check suites and show saved/pushed/merged per branch from one screen. The Work board covers the branch part only. Source: docs/archive/design/2026-09-05-dev-dashboard/STATUS.md
