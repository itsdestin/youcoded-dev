---
id: 106
title: Terminal: rough edges and lag with many sessions open
stage: planning
priority: P3
tags: perf, terminal, desktop, performance, bug
report: docs/archive/investigations/2026-10-04-performance-gap-review.md
branch: 106-terminal-flow-control-held-back
roadmap: perf: Terminal flow control (held-back program output), long-chat
created: 2026-10-15
summary: Very fast terminal output can leave stale lines or lose a program's last lines, and the app lags with 17 or more Claude Code chats open.
area: Chat
side: behind
platform: Desktop only
vision: chat.converse.multi
---
Progress
Done: 2026-10-08: the screen-update cap and most of the flow control shipped (youcoded#616; the cap is at transcript-batch.ts:155). 2026-10-14: a program's last lines are kept more reliably (youcoded#619). 2026-10-21: a rare test failure was made easier to diagnose (youcoded#670). Still open: stale screen parts under very heavy output; typing and lag with 17 or more chats open (partly fixed 2026-09-17: a chat's terminal now loads only when first viewed); program end lines possibly lost. 2026-11-11 (chat-engine batch, app branch session/chat-engine-batch, not merged): all three faults retested on today's code. (1) Stale lines under very heavy output: STILL HAPPENS (1 of 3 runs, 2 leftover lines; only with the window hidden and about 3 MB/s of redraws). (2) 17+ Claude Code chats: STILL HAPPENED exactly as in October (12 graphics losses at opening, 4 terminals without graphics, 64 over a run at 20 chats); the September fix only covered chats on YouCoded's own engine. FIXED on the branch: a per-window pool of 16 terminal graphics layers; past 16 chats a terminal being shown takes the layer of the hidden one shown longest ago. Measured 0 losses at 20 and at 30 chats; nothing changes at 16 or fewer. (3) Last lines lost: does not happen on this computer (33 of 33 tests pass); unproven on Mac and older Linux. The measuring kit was repaired so it runs from a worktree again (socket path too long since 2026-10-22; debugging switch off in packaged builds since 2026-10-30).
Next: Destin to look on a real screen with 20+ Claude Code chats: switching into terminals untouched for a while (no blank or wrong-size frame, colours match the theme), scrollback, selection, typing, resize, wallpaper themes, a second window. Unverified: Android may allow fewer than 16 layers (then 9 to 16 chats there behave as before); switching to a chat whose layer was given away costs an estimated 30 to 50 ms, not measured on a real graphics card. Not built, Destin to decide: fault (1) fix (clear and repaint after cutting a hidden window's backlog; could flash briefly when the window is reopened). Still true: no terminal-width resize log exists.
Blocked: nothing recorded.

Chats

From the old roadmap (perf, status needs-verify, seen on desktop, last checked 2026-10-08)
Terminal flow control (held-back program output), long-chat and other perf work from the 2026-10-04 review shipped 2026-10-08 (youcoded#616, youcoded-dev#250); the entry stays for what is still open. Decided by Destin 2026-10-04: streamed text redraws at most about every 17 ms (`STREAM_REDRAW_TARGET_HZ` = 60 in `transcript-batch.ts`); an unwatched terminal is fed at most ~0.5 MB/s after a 1 MB burst. Still open: stale partial frames above a program redrawing at ~3 MB/s (2 of 3 rig runs; normal use is ~20 KB/s); typing under a flood on a real card; opening a big Excel file still freezes ~0.23-0.29 s (the reading library); a program that FINISHES while the brake is holding its output back can lose its last lines inside the operating system (found 2026-10-14 on CI: Linux 6.17 kept only ~5 KB of the unread output, macOS dropped the final write whatever its size; Linux 7.2 here kept all of it) — the app reads everything the system keeps (the node-pty close race is fixed, youcoded `pty-worker.js` guardExitDrain), but a fix for the rest would mean not braking near a program's end, which the worker cannot foresee

Merged in #108 "Lag with 17 or more Claude Code sessions open"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (perf, status confirmed, seen on desktop, last checked 2026-10-04)
With 17 or more Claude Code sessions open, terminals fight over graphics. Every session builds a graphics-accelerated terminal at start even if you never leave chat view, and the system allows only 16. At 20 sessions (software-drawn rig, one run) 4 terminals ended with no working graphics and chat switching showed 12 freezes (worst 173 ms). Fine up to 16. Options: build the terminal only when first shown, or share one

From the 2026-10-16 document sweep
- Hidden terminals keep their graphics layer; detach it when a terminal is hidden. Source: docs/active/handoffs/2026-07-10-review-followups.md
- Prove or disprove the terminal-width theory with a resize log. Source: docs/active/investigations/2026-09-01-terminal-pty-column-count.md
