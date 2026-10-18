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
Done: Gemini text transport retry passed within original USD10 cap using refreshed endpoint-specific pricing and USD0.47 reservation; no old hold reclaimed. Actual native Qwen two-turn client check failed upstream before any tool/verifier result, retained USD0.50. Fixed gateway budget denials to non-retryable402 and now retain upstream HTTP status. 21 focused tests pass. All five text canaries validated; actual OpenRouter usage USD0.000041446.
Next: Obtain sufficient approved reservation headroom, then diagnose native tool/continuity request failure with improved diagnostics and validate Pi/OpenCode conversations before full suite.
Blocked: Conservative ledger USD9.734296196, remaining USD0.265703804 under unchanged USD10 cap; this is not actual spending. Unknown failure holds retained. Gateway/container network stopped. Comprehensive readiness false; no full evaluation.

Chats
- 2026-10-18 session/148-harness-performance-lab: chat started
- 2026-10-18 session/148-harness-performance-lab: chat started
- 2026-10-18 session/148-harness-performance-lab: chat started
- 2026-10-18 session/148-harness-performance-lab: chat started
- 2026-10-18 session/148-harness-performance-lab: chat started
- 2026-10-18 session/148-harness-performance-lab: chat started
- 2026-10-18 session/148-harness-performance-lab: chat started
- 2026-10-18 session/148-harness-performance-lab: chat started
- 2026-10-18 session/148-harness-performance-lab: chat started
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
