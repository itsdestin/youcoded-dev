---
id: 148
title: Native sessions stop before the job is done, and say it is still going
stage: planning
tags: native-harness, bug
vision: chat.converse.native
branch: 148-native-sessions-stop-before-the
created: 2026-10-16
why: Destin, 2026-10-16: "are you sure its being fixed? i dont see any agents running"
summary: A chat on YouCoded's own engine can stop before the job is done while saying work is still running.
area: Chat
side: behind
work: session/148-harness-performance-lab
---
Progress
Done: Nothing is recorded as fixed for the main problem (an assistant turn that stops early while saying work is still running). Separately, a fix landed on 2026-11-05 so background commands no longer show as Running forever (youcoded #716). Earlier fixes covered helper status (#570, #681). 2026-11-11 chat-engine batch: checked only, skipped (needs a paid run). The lab's unsaved work WAS backed up on 2026-11-09 (both checkouts clean and pushed). PR #716 fixed Claude Code background tasks, not native ones. Nothing since 2026-10-16 changes when a native turn ends.
Next: Unchanged: needs Destin's OK on spending for a real native-engine run.
Blocked: Needs Destin's decision on spending (the lab's spending-limit test is paused near its 10 USD cap; ledger not re-checked). The lab's work is backed up as of 2026-11-09.

Chats
- 2026-10-21 session/148-harness-performance-lab: chat started
- 2026-10-20 session/148-harness-performance-lab: chat started
- 2026-10-18 session/148-harness-performance-lab: chat started

From the old roadmap (moved 2026-10-16)
Native sessions stop working before the job is done, and say it is still going. Destin,
2026-10-16, "Improving ASTRA Architectural 3D Models" (GPT 6 Astra, Full Auto, v1.3.1-beta.89):
the assistant told him a fix was "still underway" and "being fixed"; when he asked "are you
sure its being fixed? i dont see any agents running", nothing was running. Before that it
posted repeated "still running; no new result yet" messages that it later called "noise from
background jobs finishing". The turn had ended while the work was still owed. Investigate:
(a) does the turn end while helper agents or background jobs are still pending, and does a
finishing job's notice wrongly count as a new turn; (b) does the assistant claim work is
running that it never started, or one that was cancelled or failed without a visible error;
(c) does it happen on other models or only GPT 6 Astra. Start from this session's saved
chat and turn log, not from the live app. Wanted: a turn either keeps working until done or
says plainly that it stopped and why
`chat` `all` `needs-verify` `P1` `checked 2026-10-16` `needs-repro`

## tools
