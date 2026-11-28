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
Done: Sign-in starts are capped per internet address (wecoded-marketplace PR #114, merged 2026-11-05). Stats answer is cached for two minutes so repeated requests cannot run the heavy database work (PR #114). Heartbeat and website-visit counts are limited per address, 20 a minute, plus a daily cap (PR #113, merged 2026-11-02).
Next: Destin adds one rate-limit rule for api.youcoded.ai in the Cloudflare dashboard (about 10 minutes, guided), then we check the rule is live.
Blocked: waiting on Destin for the dashboard step.

Chats
