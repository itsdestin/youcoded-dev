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
Done: Destin, overnight deck 2026-11-13 L-4: land, but first "can you just explain the timing logic before we merge this. i want to understand what was wrong and how it was fixed." Fix is on app branch session/engine-followups (head d0a230589), reviewed twice; #163 and #69 split out to PR #749.
Next: Explain in chat; land when he says so.
Blocked: Spending ledger numbers disagree (5.20 of 15 USD vs 0.27 headroom under 10 USD); recheck before any paid run

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
