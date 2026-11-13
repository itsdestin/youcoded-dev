---
id: 261
title: Website: first demo shows the old look for a moment; end of intro hitches
stage: polish
tags: website, polish, performance
related: 259
branch: 261-website-first-demo-shows-the
finish: The first demo's still is in the page's own look; the last intro word and the page rising in do not stall.
created: 2026-11-13
why: Destin: 'i see the theme a demo for just a split split second as i scroll down'; 'the very end of the header cycle animation and subsequent fade-up of the robot buttons and other page content still lags/hitches just a bit'.
work: session/landing-theme-flicker
---
Progress
Done: Flicker: the 'yours' clip ends in another theme on purpose and its still was its last frame; the four stills are now the frame before the swap (recorder gained posterBefore). Hitch, traced at 4x slowdown: removed a body-wide '*' rule, moved click-blocking off the hidden sections to a click guard, and the intro's words now colour only the top bar and headline. Desktop last-word stall 66->30ms, reveal 77->44ms; phone intro stalls over 30ms 5->0. Colours of every visible element at each word unchanged at 1440/900/390.
Next: Destin to check the preview and say merge. Left: ~8ms real of first-time drawing at the reveal.
Blocked: nothing

Chats
- 2026-11-13 session/landing-theme-flicker: Built both fixes; pushed, not merged
