---
id: 74
title: Helper plans: approve a multi-step job up front
stage: explore
priority: P2
tags: native-harness, specialists, desktop, feature
branch: 74-specialists-stage-two-plans-the
roadmap: native-harness: Specialists stage two — plans: the model proposes a multi-st
created: 2026-10-15
summary: The assistant would propose a plan of several helpers, you approve it on a card, and it resumes if interrupted.
area: Chat
side: both
platform: Desktop only
work: feat/specialists-plans-ui, feat/specialists-plans-5b, docs/specialists-plans-decisions, session/74-specialists-plans
vision: chat.steer.plans, agents.added.budget
---
Progress
Done: Stage two (plans) is BUILT on unmerged youcoded branch feat/specialists-plans-ui (~140 commits, 40 decisions, last work 2026-09-26); final review deck shown 2026-09-26, never answered. Consolidated 2026-10-24 into docs/active/handoffs/2026-10-24-specialists-and-plans-START-HERE.md, the one remaining-work list (A–D).
Next: A1: bring the branch up to today's master (~1,430 commits behind, 40 conflicting files), verify, then rebuild the review deck for Destin.
Blocked: nothing

Chats
- 2026-10-24 session/74-specialists-plans: chat started

From the old roadmap (native-harness › specialists, status decision, seen on desktop, last checked 2026-09-04)
Specialists stage two — plans: the model proposes a multi-step fan-out as data, the user approves a card, the executor journals and resumes it. Approved in the 2026-08-11 spec. The three required probes ran 2026-09-04 (four helpers at once is the ceiling; the first fan-out repays most of its prompt cost; plan authoring works from the 9B model class up). Gated on Destin's stage-two decisions. The Claude Code bridge (`youcoded agent run`) is unbuilt
