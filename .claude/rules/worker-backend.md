---
paths:
  - "wecoded-marketplace/worker/**"
last_verified: 2026-07-15
verify:
  - path: wecoded-marketplace/worker/src/lib/analytics.ts
    contains: "writeAppEvent"
  - path: wecoded-marketplace/worker/src/lib/admin-filter.ts
    contains: "adminFilterClause"
  - test: wecoded-marketplace/worker/test/analytics-lib.test.ts
  - test: wecoded-marketplace/worker/test/admin-filter.test.ts
  - test: wecoded-marketplace/worker/test/admin-analytics.test.ts
  - path: wecoded-marketplace/.github/workflows/worker-ci.yml
    contains: "typecheck"
---

# Marketplace Worker backend (Cloudflare)

`wecoded-marketplace/worker/` — Cloudflare Worker: install counts, ratings, accounts/social, sync-hub, privacy analytics. Auto-deploys on push to master (`worker-deploy.yml`); **never tell Destin to run `wrangler deploy` manually.** `worker-ci.yml` typechecks + tests `worker/**` PRs pre-merge. Backend + analytics depth: `wecoded-marketplace/docs/worker-backend.md`; deploy flow: workspace `docs/build-and-release.md → Worker`.

## Deploy / config invariants
- **Never put a key in both `[vars]` and `wrangler secret put` with the same name.** On every deploy the wrangler.toml var wins and silently clobbers the secret (symptom: OAuth breaks because `GH_CLIENT_ID` = the placeholder). Define shared secrets ONLY as secrets — the missing-var pattern is load-bearing; don't add a placeholder.
- **In CI, `wrangler deploy` must run BEFORE `wrangler secret put`.** Deploy reconciles bindings to wrangler.toml, removing stale vars; a stale same-named var makes `secret put` error "Binding name already in use" (10053). Order: `migrations apply --remote` → `deploy` → `secret put`.
- **`[env.test]` is required for `@cloudflare/vitest-pool-workers`** and must OMIT wrapped bindings it can't resolve (`[ai]`, `APP_ANALYTICS`). **Mutating `env` in a test body does NOT propagate to `c.env` inside a request** — set test values via `[env.test.vars]` in wrangler.toml, not `(env as any).X`. Any new DO binding must be mirrored under `[env.test.durable_objects]` (env.test doesn't inherit).
- **Rate limits via the Cache API are per-colo, not global** (`checkRateLimit()` = `caches.open("rl")`). Fine for casual abuse; true global throttling needs a DO or D1 counter.
- **Worker JSON 500 via `app.onError`** — non-`HTTPException` errors return `{ok:false, error}` at 500 (not Hono plain-text), so AE SQL failures carry the CF error in the body. `HTTPException` responses pass through unchanged.

## Analytics (device-hash telemetry) — guard: `analytics-lib.test.ts`, `admin-filter.test.ts`
Opt-outable anonymous device-hash + DAU/MAU. Current design: `docs/archive/specs/2026-05-01-device-id-analytics-design.md` (device-hash redesign — read this, not the older install_id spec).
- **`blob2` is `device_id_hash`, not `install_id`.** Clients compute `HMAC_SHA256(SALT, machine_id || platform)` locally and send ONLY the 64-char hex hash (raw machine_id never reaches the Worker). SALT is baked into `analytics-salt.ts` (desktop) + `Salt.kt` (Android), kept in sync.
- **Only `lib/analytics.ts#writeAppEvent` may call `env.APP_ANALYTICS.writeDataPoint`.** Blob order is the contract — `["heartbeat"(vestigial), deviceIdHash, appVersion, platform, os, country, region]`; changing it silently breaks every admin query. The `?.` in `env.APP_ANALYTICS?.writeDataPoint()` is load-bearing (test env omits the binding). `writeDataPoint` is fire-and-forget, silent on failure (use D1 for durable data).
- **NEVER log raw `device_id_hash` server-side outside `count(DISTINCT)`** — the privacy-by-construction promise (`AboutPopup.tsx`) is that `blob2` appears only inside cardinality aggregates. One event type only; the retired `install` event returns 410 ("new installs/day" = `MIN(timestamp) GROUP BY blob2`).
- **Country + region are read SERVER-side** (`CF-IPCountry`, `CF-IPRegionCode`, ISO 3166-2), never sent from the client. NO cross-tabulation of region with other dimensions (fingerprint risk at low cell counts) — single-dimension GROUP BY only.
- **`adminFilterClause` + `cutoverClause` (`lib/admin-filter.ts`) are the SQL safety boundary** — hex/ISO-only sanitization is mandatory (AE has no parameter binding; we string-interpolate). `KNOWN_DEV_DEVICES` filters Destin's own hashes out by default (`?include_admins=1` bypasses).
- **CF Analytics Engine SQL is a narrow subset, NOT full ClickHouse.** 422 gotchas: cardinality is `count(DISTINCT col)` (NOT `uniq()`/`COUNT_DISTINCT()`); `INTERVAL '30' DAY` needs a QUOTED string literal; the AE query token (`CF_ANALYTICS_TOKEN`) is distinct from `CF_API_TOKEN`. Validate `FROM`-subquery support via a deploy smoke test. AE free-tier retention is 90 days (`CUTOVER_TIMESTAMP` excludes pre-cutover rows until they age out).
- **Admin auth via `requireAdminAuth`** — cookie session `Bearer` OR the `youcoded-admin` skill's `X-GitHub-PAT` (traded for a platform account id via `identities`, cached 60s in `auth/pat.ts`). The `isAdminAccount()` allowlist (`auth/admin.ts`) stays inline per-route so 401 (not auth'd) vs 403 (not admin) stay distinct. `ADMIN_USER_IDS` = bare GitHub numeric ids (secret `MARKETPLACE_ADMIN_USER_IDS`), NOT `github:<id>`.

Note: SyncHub (`SyncGroupRoom` DO) worker invariants live in `.claude/rules/sync-spaces.md`.
