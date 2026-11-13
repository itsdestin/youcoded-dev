---
id: 259
title: Website: speed pass, in-between widths, FAQ and bottom-of-page polish
stage: polish
tags: website, polish, performance
branch: 259-website-speed-pass-in-between
finish: Intro no longer re-styles the page each frame; demo starts on pointer; in-between widths are the desktop page scaled down with the narrow download bar; FAQ, gallery and footer polished.
created: 2026-11-13
why: Destin: FAQ cards 'i can literally almost count the frames'; the site 'still lags ... especially the intro animation'; zoomed in, desktop 'becomes an entirely different page'; Halftone background 'looks VERY sad/flat'; gallery fade 'jellowy', visible scrollbar, footer buttons 'weird spacing/stacking on narrow screens'.
work: session/faq-open-smoothness
---
Progress
Done: Merged as youcoded PR #751. Measured with the processor slowed 4x: desktop intro stalls over 30ms 32 -> 7, stalls after the intro 9 -> 0; desktop (1440) and phone (390) layouts unchanged apart from intended changes.
Next: Open questions for Destin: (1) is the 'stale theme' demo he saw the drawn 'Personalize and control your desktop' card, which starts light and turns dark on scroll-in? (2) should search/share descriptions gain 'free' like the new subheader? (3) keep the gallery arrow buttons? (4) add Halftone's drifting particles? Not checked: real phones/tablets, reduced-motion, slow real connections. If phones still stutter, next suspect is the frosted blur on glass panels. Features section is still single-column under 1000px.
Blocked: nothing.

Chats
- 2026-11-13 session/faq-open-smoothness: Built and merged (youcoded PR #751)
