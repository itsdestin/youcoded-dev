---
id: 237
title: Analytics page: click a day for detail, one range for every card, deeper breakdowns
stage: merged
tags: analytics, dashboard, backend
related: 211
branch: 237-analytics-page-click-a-day
finish: Clicking a day shows that day's website and app detail; the 7/30/90 range drives every card; download clicks split by platform
created: 2026-11-10
why: Destin, 2026-11-08/09: 'for a specific day I want to see which versions were online, which regions or countries those versions were from'; 'the day/month/3month toggles at the top seem like they should apply to most submenus'; 'i want to see a breakdown of download clicks by clicked platform in day view. these kind of quality-of-life and expanded detail metrics are vital'.
work: session/analytics-day-detail
---
Progress
Done: Shipped 2026-11-09. Page: click any bar for a day panel (website first on the Website tab: download clicks by platform, sources per installer; app: versions, systems, places, who was online). The range drives every card; long-term cards are grouped apart. Chart splits by version, by system and by download platform. Server: new one-day answer, and counts that follow the range. Live server checked after deploy.
Next: Nothing.
Blocked: nothing.

Chats
- 2026-11-10 session/analytics-day-detail: Built the day view, the one-range page and the deeper breakdowns; server side merged and live
