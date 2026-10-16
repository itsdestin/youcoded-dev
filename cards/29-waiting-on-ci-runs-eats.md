---
id: 29
title: Make waiting on automatic test runs faster
stage: planning
priority: P1
tags: dev-workspace, release
release: v1.3.1
branch: 29-waiting-on-ci-runs-eats
roadmap: dev-workspace: Waiting on CI runs eats whole sessions. Destin, 2026-09-20:
created: 2026-10-15
summary: Small fixes take an hour of waiting on full online test runs; ideas are a nightly practice build and running just one test on one system.
area: Behind the scenes
side: behind
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (dev-workspace › release, status confirmed, seen on n/a, last checked 2026-09-20)
Waiting on CI runs eats whole sessions. Destin, 2026-09-20: "just fixing a few minor test issues and such has seemingly eaten over an hour of our time today just waiting around on runs. is there any way we could improve this in the future for better/faster iteration and fixes?" Two answers he liked, neither built: (1) a NIGHTLY rehearsal build from master that publishes nothing and notifies on failure (the launch check runs in no other workflow and sat broken from 2026-09-16); (2) a way to run ONE test file on ONE OS instead of a ~15-minute three-OS matrix
