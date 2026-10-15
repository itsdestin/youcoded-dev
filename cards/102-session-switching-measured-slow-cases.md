---
id: 102
title: Session switching: measured slow cases and decisions (6 things)
stage: planning
priority: P3
tags: perf, chat, desktop, performance
report: docs/archive/investigations/2026-10-05-lab-realism.md
branch: 102-session-switching-measured-slow-cases
roadmap: perf: Session switching: measured slow cases and decisions (6 thin
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

See also #94: 94's chat-switch pauses (item c) are the same slow session-switch clicks that 102 measures in detail.

Chats

From the old roadmap (perf, status needs-verify, seen on desktop, last checked 2026-10-08)
Session switching: measured slow cases and decisions (6 things). (a) The hitch recorder writes a `switch` line per real session switch (time until shown and until settled, cause, chat or terminal, first visit or revisit; counts only) and `hitch-report.mjs` has a "Switching sessions" section; it cannot see paint/GPU time after the first frame. Read a few days of real use before choosing fixes; (b) clicking a chat that is still streaming, then clicking away, can freeze the window ~0.5 s (505 ms in 16 tries; lab-only, native chats); (c) with 16 open sessions every switch costs about a third more and skips a screen refresh, and each terminal-view switch clears the shared letter cache; (d) the owner's slow clicks (up to 720 ms, a 575 ms freeze inside the click) reproduce in the lab only with a development build plus a saturated machine (clicks 2-3x slower; a dev build adds 65-140 ms per click vs 15-35 ms shipped; installed-style build stays under 0.1 s). UNEXPLAINED: the delay between the click handler finishing and the screen changing (lab worst 136 ms; his 260-608 ms, pointerup/click queuing is the suspect) - not reproduced. Also unexplained: why a plain theme was slower than a glass theme in a development build. Next evidence: `switch` lines from Destin's INSTALLED app now that this has shipped (the startup line's `packaged` flag says installed vs developer build; `node scripts/perf-lab/hitch-report.mjs` warns when it cannot tell), then 12+ sessions; (e) shipped 2026-10-08 (youcoded#616): the closed-surface memo (`memoWhileClosed`) and message-box focus after a pointer switch cut the click about 15-20% in the lab's dev-build setup; the session-pill growth and chat-arrival fade still dominate (~80 animation-driven style recalcs per switch) and are governed by `.claude/rules/session-strip-motion.md`, so any change is Destin's call; (f) the app-repo branch `session/perf-reload-repaint-20261005` (send waits for a painted screen) was superseded by master's session-screens and intentionally not merged; its 3 dropped commits are kept as the git tag `archive/perf-reload-repaint-send-gate` (app repo, commit 38860825354ffee25f13b3f9e91a53b6c0e59d4c). Details: docs/archive/investigations/2026-10-05-session-switch-measurement.md, 2026-10-05-session-switch-fix.md, 2026-10-05-lab-realism.md

Merged in #103 "Session-strip motion cost (owner decision): the session pill resizing and the chat-arrival fade run style and…" (Destin, roadmap-move deck, 2026-10-15)
From the old roadmap (perf, status decision, seen on desktop, last checked 2026-10-08)
Session-strip motion cost (owner decision): the session pill resizing and the chat-arrival fade run style and layout work every frame of a switch (about 27 style recalcs, 20 layouts, ~80 "Animation"-reason recalcs). A transform-based version is not pixel-identical, so nothing changed. Decide whether a cheaper look is acceptable; the rules in `.claude/rules/session-strip-motion.md` forbid changing the motion otherwise
