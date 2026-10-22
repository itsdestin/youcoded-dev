---
id: 181
title: Rebuild Swipe Keyboard on KDE's new keyboard core (Plasma 6.9) and offer it upstream
stage: explore
tags: swipe-keyboard, feature
needs: 179
related: 170, 165, 180
branch: 181-rebuild-swipe-keyboard-on-kde
created: 2026-10-22
why: Destin: "separately consider fully rebasing all of our work on the new 6.9 and creating the upstream merge request. this would be after we retrain our new futo-less models". KDE MR 109 (merged 2026-10-15, not in 6.8 beta) replaced Qt VKBD, which our plugin depends on, so 6.9 likely breaks the current plugin; if 6.9 ships before the FUTO-free models, port first, upstream after.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: waits on #179.

Chats
