---
id: 74
title: Helper plans: approve a multi-step job up front
stage: planning
priority: P2
tags: native-harness, specialists, desktop, feature
branch: 74-specialists-stage-two-plans-the
created: 2026-10-15
summary: The assistant would propose a plan of several helpers, you approve it on a card, and it resumes if interrupted.
area: Chat
side: both
platform: Desktop only
work: feat/specialists-plans-ui, feat/specialists-plans-5b, docs/specialists-plans-decisions, session/74-specialists-plans
vision: chat.steer.plans, agents.added.budget
---
Progress
Done: The helper "plans" feature is fully built on a separate, unmerged branch (about 140 changes; last real work 2026-09-26). It lets the assistant propose several helper jobs as one plan, you approve it on a card, and it resumes if interrupted. None of it is in the app yet.
Next: bring that branch up to today's app code (it is about 1,705 changes behind, with 40-odd clashing files), re-test it, then rebuild the review screens for Destin.
Blocked: no hard blocker, but the catch-up step is large and untested.

Chats
- 2026-10-24 session/74-specialists-plans: chat started

From the old roadmap (native-harness › specialists, status decision, seen on desktop, last checked 2026-09-04)
Specialists stage two — plans: the model proposes a multi-step fan-out as data, the user approves a card, the executor journals and resumes it. Approved in the 2026-08-11 spec. The three required probes ran 2026-09-04 (four helpers at once is the ceiling; the first fan-out repays most of its prompt cost; plan authoring works from the 9B model class up). Gated on Destin's stage-two decisions. The Claude Code bridge (`youcoded agent run`) is unbuilt
