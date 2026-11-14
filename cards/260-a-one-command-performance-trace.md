---
id: 260
title: A one-command performance trace for any web page (slowed processor, stalls, re-style causes)
stage: explore
tags: dev-workspace, performance
branch: 260-a-one-command-performance-trace
finish: One script records load plus a marked window with the processor slowed N times and prints: stalls over 30ms, per-phase main-thread time, which script lines forced re-measurement, and slow frames. Starting point saved at ~/Documents/youcoded-site-perf-tools/ (trace.mjs, analyze.py, forced.py, recalc.py, geo.sh).
created: 2026-11-13
why: scripts/ui-probe.mjs runs Chrome with the graphics chip off and cannot slow the processor or record a trace, so the 2026-11-13 website speed pass hand-built a recorder and four analysers (~15 calls) before it could measure anything. They found the causes in minutes once they existed.
---
Progress
Done: More starter scripts saved in ~/Documents/youcoded-site-perf-tools/: endwin.py (zoom on the end of the intro), inv.py/inv2.py + trace-inv.mjs (why elements were re-styled), styledump.mjs (colours of every visible element per intro word), toggle.mjs (time a class toggle), flick.mjs (frame recording across a theme switch), clicks.mjs (real mouse clicks mid-intro).
Next: Build the one-command trace tool from these.
Blocked: nothing

Chats
