---
id: 118
title: Phone browser: missing theme pictures and blank loads
stage: planning
priority: P3
tags: remote-access, standalone, remote, bug
branch: 118-phone-browser-two-display-and
roadmap: remote-access: Phone browser: two display and loading faults.
created: 2026-10-15
summary: Phones get theme colours but not wallpaper or mascot pictures, and the conversation list sometimes loads blank the first time.
area: Devices & sync
side: screens
platform: Phone and web
vision: everywhere.platforms.web, yours.look.themes
---
Progress
Done: The phone's conversation list no longer goes blank silently; it now shows "Couldn't load your conversations" with a Try again button (youcoded commit 933e43faa, Sept 10). A phone no longer shows a broken picture where the theme mascot belongs; it shows the default mascot instead (desktop/src/renderer/components/Icons.tsx).
Next: Destin decides whether phones should get the theme's wallpaper and glass pictures. Right now they get the colours only, on purpose, per his Sept 10 request. If yes, the work is to serve those picture files over the connection (not yet built).
Blocked: Waiting on Destin's decision above. Nothing else.

Chats

From the old roadmap (remote-access › standalone, status confirmed, seen on remote, last checked 2026-09-10)
Phone browser: two display and loading faults. (a) A phone gets the theme's colours but not its wallpaper, glass or mascot pictures (Destin, 2026-09-11: broken image where Meadow Mist's mascot belongs; the phone now shows the default mascot). Fix: serve those assets over the connection. (b) The conversation browser over remote sometimes shows nothing and works the second try (Destin, 2026-09-10); the screen now says the load failed with Retry, and he later said "mostly fixed"; cause unidentified.
