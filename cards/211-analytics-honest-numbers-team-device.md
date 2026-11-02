---
id: 211
title: Analytics: honest numbers, team-device exclusion and a clearer dashboard
stage: build
tags: analytics, backend, dashboard, website
branch: 211-analytics-honest-numbers-team-device
finish: Phones counted as Android with stable IDs; team devices and test runs excluded automatically; setup staircase, stopped-coming-back and Overview on the dashboard; website visits deduped on reload and rate-limited
created: 2026-11-01
why: Audit 2026-10-31 found phones counted as Desktop, own/test devices leaking into counts, and two dashboard tabs that don't tell one story; Destin approved 17 proposals in docs/active/design/2026-10-31-analytics-improvements/analytics.questions.answers.json
work: session/analytics-proposals
---
Progress
Done: Independent review: 8 findings, 7 fixed (switch-off race, damaged file, prompt answers, reload counts, expired visits, weekly time zone, contributor gh call, double load); history note made honest
Next: Destin's review; after deploy, confirm old check-ins still show (blob8 on pre-change rows); Android build unverified here
Blocked: nothing.

Chats
- 2026-11-01 session/analytics-proposals: Building all approved analytics proposals across app, worker and dashboard
