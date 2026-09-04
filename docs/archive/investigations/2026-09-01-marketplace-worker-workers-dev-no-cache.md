---
date: 2026-09-01
status: shipped
type: investigation
topic: on a *.workers.dev address the Cache API is inert, so checkRateLimit is a no-op in production
---

# `checkRateLimit` is a no-op in production — the Worker needs a custom domain

**Closed 2026-09-03.** `api.youcoded.ai` attached to the Worker; measured on the new host: 70
sequential `GET /ratings/:id` → 23×200 then 47×429. Same probe on workers.dev: 70×200.
wecoded-marketplace#84, #85; app host swap youcoded#406.

`wecoded-marketplace/worker/src/lib/rate-limit.ts` keeps its fixed-window counters only in
the Cloudflare Cache API.
<!-- claim: {"path": "wecoded-marketplace/worker/src/lib/rate-limit.ts", "contains": "caches\\.open\\(\"rl\"\\)"} -->

The Cache API — like the whole edge cache — does nothing on a `*.workers.dev` address, and
the Worker is served from `wecoded-marketplace-api.destinj101.workers.dev`; `wrangler.toml`
has no `routes` entry.

**Measured, not hypothesised** (2026-08-28, Task 0 of the feedback plan): 160 requests to
`GET /ratings/:id` — limit 60 per 60 s — inside ~2 s, the last 10 issued strictly one at a
time so no read-before-write race could explain it. All 160 returned 200, zero 429s. So
ratings, reports, installs, exports and the public list reads have never had a rate limit,
on any route.

**The fix is the custom domain:** DNS + a `routes` entry in `wrangler.toml`; the deploy
workflow already handles the rest. Gated only on picking a domain — the same decision the
landing-page rebuild needs. (The catalog read path no longer depends on it: plan Task 7b
moved that onto KV, which caches on `workers.dev`. So the limiter is the *whole* remaining
reason the domain is urgent rather than merely worthwhile.)

The D1-counter workaround was deliberately NOT built: `checkRateLimit` also guards the public
reads, so a database-backed counter charges a write for every anonymous page view — a
standing bill on the hottest path to work around a free DNS record. If the domain slips, that
workaround is its own PR.

**Exposed meanwhile:** the comment box is sign-in-gated and llama-guard-moderated, and
`GET /admin/comments` + `DELETE /admin/comments/:id` give a takedown path — the v1 answer,
chosen knowing the brake does not exist.

History: custom-domain item added 2026-08-28, scope sharpened 2026-08-31 (old ROADMAP L909);
rate-limit item added and measured 2026-08-28 (old ROADMAP L948). Re-checked 2026-09-01:
`rate-limit.ts` untouched since 2026-04-12; still no `routes` in `wrangler.toml`.
