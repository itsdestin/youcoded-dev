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
Done: Chat-only plans were fully built in Sep 2026 on feat/specialists-plans-ui (140 commits; its 40 decisions live only on docs/specialists-plans-decisions). On 2026-10-24 Destin decided to fold plans into a workflow builder (saved rows of steps with a Run button) instead; that chat ended with four phases proposed and no reply. Nothing of it is on master. The rev-3 spec and START-HERE handoff landed on master 2026-11-10 (docs/active/design/2026-10-24-workflow-builder/).
Next: Destin approves or changes the rev-3 four-phase plan when the Helpers and automations workstream starts; rebuild on today's app, reusing the old engine parts. Keep feat/specialists-plans-ui and docs/specialists-plans-decisions until their reusable parts are copied (duplicates 5b and plans-r12-* were deleted 2026-11-10).
Blocked: Destin's answer on the rev-3 plan. Pages automations (card #61, running) ships single jobs first; chains of jobs wait on this.

Chats
- 2026-10-24 session/74-specialists-plans: chat started

From the old roadmap (native-harness › specialists, status decision, seen on desktop, last checked 2026-09-04)
Specialists stage two — plans: the model proposes a multi-step fan-out as data, the user approves a card, the executor journals and resumes it. Approved in the 2026-08-11 spec. The three required probes ran 2026-09-04 (four helpers at once is the ceiling; the first fan-out repays most of its prompt cost; plan authoring works from the 9B model class up). Gated on Destin's stage-two decisions. The Claude Code bridge (`youcoded agent run`) is unbuilt
