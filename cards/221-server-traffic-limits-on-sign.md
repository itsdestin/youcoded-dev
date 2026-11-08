---
id: 221
title: Server: traffic limits on sign-in, stats and usage-count addresses
stage: explore
tags: security, backend, marketplace
branch: 221-server-traffic-limits-on-sign
created: 2026-11-05
why: Security audit 2026-10-30 F2: /auth/github/start, /stats and /app/heartbeat have no working limit (checkRateLimit is a no-op; workers.dev bypasses the zone). On the Cloudflare free plan a flood stops sign-in, marketplace and friends for everyone until the daily reset. Free plan includes one rate-limiting rule; needs Destin in the Cloudflare dashboard (~10 min guided). Destin 2026-11-05 deck Q-14: "don't know".
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
