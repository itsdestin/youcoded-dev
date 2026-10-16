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
Done: nothing recorded.
Next: check it still happens.
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
