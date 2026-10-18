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
Done: Ran Anthropic Haiku 5.5 only: three task types verified successfully; one earlier coding run hit four-request cap; one zero-request adapter setup failure fixed. 14 model requests; rate-card estimate USD 0.00632507, pessimistic token estimate USD 0.21916345 (not provider billing). Fixed direct-provider registration and preserved worker errors. 32 Node tests, 4 adapter tests, desktop verify pass.
Next: Add common Haiku-only and cumulative-budget enforcement for competitor clients, then run matched-model comparisons. First measured optimization candidates: fixed schema overhead and Read-before-Edit recovery waste.
Blocked: No credential blocker. Approved pilot ceiling remains USD 10 total, despite supplied key account limit of USD 200. Comparator spending must use the same bounded envelope; no competitor inference performed yet.

Chats
- 2026-10-18 session/148-harness-performance-lab: chat started
- 2026-10-18 session/148-harness-performance-lab: chat started
- 2026-10-18 session/148-harness-performance-lab: chat started
- 2026-10-18 session/148-harness-performance-lab: chat started
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
