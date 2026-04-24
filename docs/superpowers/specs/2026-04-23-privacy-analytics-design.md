# Privacy-Preserving Install & Usage Analytics

**Date:** 2026-04-23
**Status:** Design
**Owner:** Destin
**Related:** `docs/superpowers/specs/2026-04-23-analytics-privacy-copy-draft.md` (user-facing copy)

## Goals

- Know how many people have installed YouCoded, in aggregate.
- Know daily and monthly active users (DAU / MAU) as rolling trends.
- Know version adoption — "is 1.2.1 being picked up, are users stuck on 1.1.x?"
- Know platform (desktop vs android) and OS split.
- Know country-level geographic distribution.
- Do all of the above **without collecting any data that can be traced to an individual user**, without IP logging, and without promises we can't enforce in code.

## Non-goals

- Per-user behavior tracking, funnels, session-level analytics.
- Crash/error telemetry (separate feature — not in this spec).
- Long-term (>90 day) history. Cloudflare Analytics Engine's free-tier 90-day retention is enough to answer "is the app growing?" Adding durable history is a later optimization.
- A polished dashboard. Functional first-pass admin UI only; the admin skill in `youcoded-admin` is the other read surface.

## Architecture

Three pieces, all in existing repos:

1. **Client-side telemetry.** Desktop (`youcoded/desktop/src/main/`) and Android (`youcoded/app/.../runtime/`) each grow a small service that generates a random UUID on first launch, stores it locally, fires `/app/install` once when the UUID is new, and fires `/app/heartbeat` once per day (gated by a `lastPingedDate` check). Both calls are opt-outable via a toggle in the existing Privacy section of the About popup.

2. **Server-side routes + Analytics Engine binding.** `wecoded-marketplace/worker/` gains two public POST routes (`/app/install`, `/app/heartbeat`), admin-gated routes under `/admin/analytics/*` that run canned SQL queries against Analytics Engine, and a new `[[analytics_engine_datasets]]` binding in `wrangler.toml`.

3. **Admin dashboard.** Single `dashboard.html` served by the Worker at `/admin/dashboard`, gated by the existing `ADMIN_USER_IDS` GitHub-OAuth middleware. Plain HTML + Chart.js from CDN, rendering DAU / MAU / install trends from the admin JSON routes.

Plus:

- Rewrite the Privacy section copy in `AboutPopup.tsx` (the current "does not collect, transmit, or store any telemetry or personal data" claim becomes inaccurate). Add the opt-out toggle at the end of the existing Privacy section, styled like the skip-permissions toggle (minus the destructive red).
- Update the privacy/data-collection section of the `itsdestin.github.io` landing page (repo path confirmed at plan time).
- Add an `/analytics` skill to `youcoded-admin` for pulling live numbers from inside a Claude Code conversation.

## Data model

**Dataset:** `youcoded_app_events` (new Analytics Engine binding `APP_ANALYTICS`).

Each event written with this shape:

```ts
env.APP_ANALYTICS.writeDataPoint({
  blobs:   [event_type, install_id, app_version, platform, os, country],
  //        blob1       blob2       blob3        blob4     blob5 blob6
  doubles: [],
  indexes: [event_type], // enables fast WHERE filters
});
```

| Field | Type | Example | Notes |
|---|---|---|---|
| `event_type` | blob1 + index | `"install"` or `"heartbeat"` | Indexed for WHERE filters |
| `install_id` | blob2 | UUIDv4 | Only used inside `COUNT_DISTINCT()`; never displayed |
| `app_version` | blob3 | `"1.2.1"` | From `app/build.gradle.kts` / desktop `package.json` |
| `platform` | blob4 | `"desktop"` \| `"android"` | |
| `os` | blob5 | `"win"` \| `"mac"` \| `"linux"` \| `""` | Empty string on Android |
| `country` | blob6 | `"US"` | Read from `CF-IPCountry` header server-side; never sent from client |

**Canned queries** (admin dashboard + admin skill both call these):

```sql
-- DAU last 30 days
SELECT toDate(timestamp) AS day, COUNT_DISTINCT(blob2) AS dau
FROM youcoded_app_events
WHERE blob1 = 'heartbeat' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY day ORDER BY day;

-- MAU (rolling 30-day)
SELECT COUNT_DISTINCT(blob2) AS mau
FROM youcoded_app_events
WHERE blob1 = 'heartbeat' AND timestamp > NOW() - INTERVAL '30' DAY;

-- Installs per day (last 90d)
SELECT toDate(timestamp) AS day, COUNT() AS installs
FROM youcoded_app_events
WHERE blob1 = 'install' AND timestamp > NOW() - INTERVAL '90' DAY
GROUP BY day ORDER BY day;

-- Version distribution among today's active users
SELECT blob3 AS version, COUNT_DISTINCT(blob2) AS users
FROM youcoded_app_events
WHERE blob1 = 'heartbeat' AND timestamp > NOW() - INTERVAL '1' DAY
GROUP BY version ORDER BY users DESC;

-- Platform / OS / country splits — variants of the above
```

Retention is 90 days (Cloudflare default, free tier). Sufficient for all rolling-window queries above.

## Client flow

State persisted at:
- **Desktop:** `~/.claude/youcoded-analytics.json`
- **Android:** `$HOME/.claude/youcoded-analytics.json` (inside the Termux env)

```json
{
  "installId": "c4b2a8f0-...",
  "optIn": true,
  "lastPingedDate": "2026-04-23",
  "installReported": true
}
```

**On app launch:**

```
1. Load analytics.json (create with defaults if missing).
2. If optIn === false → return.
3. If installId is missing: generate UUIDv4, set installReported = false.
4. If installReported === false:
     POST /app/install { installId, appVersion, platform, os }
     On success: installReported = true, save.
5. If lastPingedDate !== todayUTC:
     POST /app/heartbeat { installId, appVersion, platform, os }
     On success: lastPingedDate = todayUTC, save.
6. Any network error: swallow silently, do not mutate state, retry next launch.
```

**Key invariants:**
- Day boundary is UTC: `new Date().toISOString().slice(0, 10)`.
- `install_id` is generated once, never rotated, never sent anywhere except the two endpoints above, never logged server-side outside of `COUNT_DISTINCT()`.
- Reinstall = new UUID = counted as a new install. Intentional.
- Opt-out flip writes `optIn: false` and nothing else. No server call — there's nothing to delete (data isn't keyed by install_id in a lookup-able way, and rolls off at 90 days).
- Country is never sent from the client. Worker reads it from `CF-IPCountry` header.

**File locations:**
- Desktop: new `youcoded/desktop/src/main/analytics-service.ts`, invoked once from main-process startup (after app ready). Uses Node's `fetch` — no new deps.
- Android: new `youcoded/app/.../analytics/AnalyticsService.kt`, launched from `SessionService.onCreate` alongside the existing `AnnouncementService`. Uses OkHttp (already a dependency).
- Renderer access: new IPC channels `analytics:get-opt-in` and `analytics:set-opt-in` (plus any response/broadcast variants needed per the parity rules). Updates to `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, and `SessionService.kt` required. `window.claude.analytics.getOptIn()` / `setOptIn(bool)` exposed to React.

**What the server does NOT receive from the client (by construction):**
- IP address (CF edge uses it for routing and rate-limiting but never writes it to the dataset).
- User agent, referrer — never written.
- Session ID, message content, file paths, or anything else not listed in the table above.

## Server flow (Worker)

**New files in `wecoded-marketplace/worker/src/`:**

- `app/routes.ts` — public app endpoints (`/app/install`, `/app/heartbeat`)
- `admin/analytics.ts` — admin-gated query endpoints
- `admin/dashboard.html` — single-page dashboard, imported as a raw string and served at `/admin/dashboard`
- `lib/analytics.ts` — thin wrapper around `env.APP_ANALYTICS?.writeDataPoint()` that no-ops when the binding is missing (same pattern as the existing `[ai]` binding workaround)

**`wrangler.toml` addition:**

```toml
[[analytics_engine_datasets]]
binding = "APP_ANALYTICS"
dataset = "youcoded_app_events"
```

Test env (`[env.test]`) deliberately omits the binding so `vitest-pool-workers` / miniflare doesn't need to resolve it. `lib/analytics.ts` guards with `?.` so the no-op is safe.

**Public routes:**

```
POST /app/install
  body: { installId, appVersion, platform, os }
  1. Validate shape (zod: installId is v4 UUID, platform in ['desktop','android'], etc.)
  2. Rate-limit by IP: checkRateLimit('app-install', 10, '1h')
  3. country = c.req.header('CF-IPCountry') || ''
  4. writeDataPoint('install', installId, appVersion, platform, os, country)
  5. Return { ok: true }

POST /app/heartbeat
  body: same
  Same flow; event_type='heartbeat'; rate-limit key 'app-heartbeat' at 30/hour
  (generous — legit clients ping once/day; dev-machine bouncing can otherwise trip it)
```

Validation failures return 400; rate-limit violations return 429. Responses avoid leaking schema details: `{ ok: false, error: 'invalid request' }`.

**Admin routes** (all gated by existing `adminAuth` middleware — GitHub OAuth + `ADMIN_USER_IDS` allowlist):

```
GET /admin/dashboard                 → serves dashboard.html
GET /admin/analytics/dau?days=30     → [{ day, dau }, ...]
GET /admin/analytics/mau             → { mau }
GET /admin/analytics/installs?days=90 → [{ day, installs }, ...]
GET /admin/analytics/versions        → [{ version, users }, ...]
GET /admin/analytics/platforms       → [{ platform, users }, ...]
GET /admin/analytics/countries       → [{ country, users }, ...]
```

Each handler hits Cloudflare's Analytics Engine **SQL API** via authenticated `fetch` to `https://api.cloudflare.com/client/v4/accounts/{account_id}/analytics_engine/sql`, passing `CF_ACCOUNT_ID` and `CF_API_TOKEN` as new CI-injected secrets. Token is scoped to Analytics Engine **read only**.

**CI secret order.** Remember the wrangler secret footgun: `deploy` must run BEFORE `wrangler secret put` calls for the two new secrets. Add them to the existing `.github/workflows/worker-deploy.yml` sequence after the deploy step.

**CORS unchanged.** `/app/*` is called fire-and-forget from main-process / Kotlin, not React. `/admin/*` is hit from the dashboard HTML served by the same origin. Neither needs CORS changes.

**Observability.** Existing `[observability]` binding captures Worker request logs — nothing to add.

## Privacy / opt-out UX

The opt-out lives at the end of the existing Privacy section of `AboutPopup.tsx`, styled like the skip-permissions toggle (label row + short description row, default ON, benign color not destructive red). No confirmation dialog — single-click flip.

### Final copy — desktop variant

> **Privacy**
>
> Your Claude Pro/Max sign-in is stored locally on your device. It is never transmitted to or collected by YouCoded. All Claude Code interactions happen directly between the on-device CLI and Anthropic's servers. YouCoded does not collect any personal data or message content.
>
> By default, your device may send anonymous analytics data to YouCoded, including:
>
> - A random install ID generated by the app
> - Installed app version (e.g. `1.2.1`)
> - Platform and OS (e.g. `desktop / mac`)
> - Country (from the connection)
>
> The collection of this information helps improve YouCoded for yourself and future users. You may disable this below at any time.
>
> **[ Toggle: Share anonymous usage stats — default ON ]**
>
> **Remote access.** (existing copy — unchanged)
>
> **Multiplayer games.** (existing copy — unchanged)

### Final copy — Android variant

> **Privacy**
>
> Your Claude Pro/Max sign-in is stored locally on your device. It is never transmitted to or collected by YouCoded. All Claude Code interactions happen directly between the on-device CLI and Anthropic's servers. YouCoded does not collect any personal data or message content.
>
> By default, your device may send anonymous analytics data to YouCoded, including:
>
> - A random install ID generated by the app
> - Installed app version (e.g. `1.2.1`)
> - Platform (`android`)
> - Country (from the connection)
>
> The collection of this information helps improve YouCoded for yourself and future users. You may disable this below at any time.
>
> **[ Toggle: Share anonymous usage stats — default ON ]**
>
> **Termux packages.** (existing copy — unchanged)

### Final copy — landing page

> **What data does YouCoded collect?**
>
> Your Claude Pro/Max sign-in is stored locally on your device. It is never transmitted to or collected by YouCoded. All Claude Code interactions happen directly between the on-device CLI and Anthropic's servers. YouCoded does not collect any personal data or message content.
>
> By default, your device may send anonymous analytics data to YouCoded, including:
>
> - A random install ID generated by the app
> - Installed app version (e.g. `1.2.1`)
> - Platform and OS (e.g. `desktop / mac`, `android`)
> - Country (from the connection)
>
> The collection of this information helps improve YouCoded for yourself and future users. You may disable this at any time in **Settings → About → Privacy**.

### What the copy promises vs what the code enforces

Every claim above is enforced by construction, not policy:

- **No IP logging.** `writeDataPoint` is never called with an IP blob. CF edge sees IPs for routing / rate-limit, but they never enter the dataset.
- **Install ID is not looked up.** `blob2` is only queried inside `COUNT_DISTINCT()`. No admin endpoint exposes raw blob values.
- **Country-level only.** `CF-IPCountry` is ISO 2-letter. No lat/long anywhere in the pipeline.
- **Turning the toggle off stops pings.** The ping path is the only caller of `writeDataPoint`, gated by a single `optIn` boolean read at launch.

### Wiring

- Toggle state lives in the same `analytics.json`.
- Component fetches current state via `window.claude.analytics.getOptIn()` on mount.
- On flip, calls `window.claude.analytics.setOptIn(bool)`. Main-process / Kotlin writes the file atomically.
- "Cancel any scheduled ping" is a no-op because pings are launch-time only; next launch reads the new value.
- No server call on flip.

## Admin analytics skill (`youcoded-admin/skills/analytics/`)

New skill matching the shape of `announce` / `feature` / `release`.

**`SKILL.md` frontmatter description:**

> Pull live analytics for YouCoded — DAU, MAU, installs, version/platform/country breakdowns. Use when the user says "analytics", "how many users", "show DAU", "installs this week", or similar.

**Authentication.** Skill shells out to `gh auth token` to obtain Destin's GitHub PAT, passes it as `Authorization: Bearer <token>` to the admin routes. The Worker's `adminAuth` middleware grows an alternate branch: if `Authorization: Bearer` is present, call GitHub's `/user` endpoint to resolve the user ID, check against `ADMIN_USER_IDS` (the same allowlist used by the cookie flow). Cache the token → user ID mapping in Worker memory for ~60s to avoid re-hitting GitHub on every query.

**Canned flows:**

- `/analytics` (bare) → one-screen summary: DAU today, MAU rolling 30-day, new installs last 7 days, top versions, platform split, top countries.
- "show DAU trend" → 30-day ASCII sparkline.
- "installs this week" → 7-day install count + day-over-day trend.
- "who's on old versions?" → version distribution sorted ascending by users.
- Anything else → skill explains the available canned queries.

**Implementation shape (~150 lines):**

- `SKILL.md` — intent detection, output templates
- `scripts/fetch-analytics.sh` — wraps `curl` with `gh auth token`, routes to the admin endpoint, returns JSON
- Output formatting inline in the SKILL flow using plain text

**Release.** `youcoded-admin` is cloned locally by Destin; new skills picked up on next `git pull`. Commit + push is the release. No version bump needed.

**Dependency.** Ships after the Worker admin routes (including the Bearer-token auth branch) are deployed.

## Testing

### Worker — `test/app-analytics.test.ts`, `test/admin-analytics.test.ts`

- Public route validation: non-UUID `installId` → 400; missing `platform` → 400; valid payload → 200.
- Rate limiting: > threshold from same IP → 429.
- Analytics Engine binding missing in test env: `lib/analytics.ts` no-ops without throwing.
- Admin route auth:
  - Unauthenticated → 401.
  - Authenticated non-admin (cookie) → 403.
  - Authenticated admin (cookie) → 200 with a mocked CF SQL API response.
  - Bearer token for admin user → 200.
  - Bearer token for non-admin user → 403.
  - Invalid Bearer token → 401.

### Desktop — `youcoded/desktop/src/main/analytics-service.test.ts` (vitest)

- First launch (no file): generates UUID, posts install, posts heartbeat, writes `installReported: true` and `lastPingedDate: today`.
- Second launch same day: reads file, skips both posts.
- Second launch different day: skips install, posts heartbeat, updates `lastPingedDate`.
- `optIn: false`: loads file, returns immediately, zero network calls.
- Network failure: no throw, no state mutation, retry next launch.
- Mock `fetch` via `vi.spyOn(global, 'fetch')`.

### Android — `youcoded/app/src/test/kotlin/.../AnalyticsServiceTest.kt`

- Same matrix as desktop, using MockWebServer (already in test deps).

### IPC parity — existing `youcoded/desktop/tests/ipc-channels.test.ts`

- Add `analytics:get-opt-in`, `analytics:set-opt-in`, and any response variants to the expected-channels list. CI catches drift across `preload.ts` / `remote-shim.ts` / `ipc-handlers.ts` / `SessionService.kt`.

### Dashboard + admin skill

- Manual verification. Log in with an admin GitHub account on the dashboard, confirm each chart loads and matches a `curl` to the JSON endpoint. Run the `/analytics` skill locally and confirm output shape.

## Rollout

1. **Worker first.** Deploy public + admin routes. With no clients pinging yet, it's a safe no-op. Verify `/health`, `/admin/dashboard` (empty charts), and a test `curl` to `/app/install`.
2. **One-time Cloudflare setup.** Confirm `youcoded_app_events` dataset appears after first `writeDataPoint`. Add CI secrets `CF_ACCOUNT_ID` and `CF_API_TOKEN` (Analytics Engine read-only scope).
3. **Desktop + Android clients.** Ship in the next `vX.Y.Z` tag. Pings start on launch for updated users. Android `versionCode` bump required per release rules (see `docs/build-and-release.md`).
4. **Landing page copy update.** Merge alongside the app release so the website promise matches app behavior. Add to the release checklist.
5. **Admin skill.** Commit + push to `youcoded-admin`. Works as soon as the Worker Bearer-token branch is live.
6. **Post-release verification.** 24h after rollout, hit `/admin/dashboard` — expect DAU > 0 and install count climbing. If either is zero, debug client-side.

**No feature flag.** The opt-out toggle IS the off-switch. A separate flag would be over-engineering for ~50 lines of client-side logic.

## Documentation updates (after implementation)

- **`docs/PITFALLS.md`** — new "Analytics" section covering:
  - Never log raw `install_id` server-side outside of `COUNT_DISTINCT` — breaks the privacy promise.
  - `writeDataPoint` is fire-and-forget and silent on failure; use D1 if you need durability.
  - `[env.test]` no-op pattern applies (same footgun as the `[ai]` binding — keep the `?.` guard in `lib/analytics.ts`).
  - 90-day retention is default on free tier. Any copy promise of longer retention needs an AE plan upgrade first.
  - Two-writer pitfall (existing pattern): do not add a second caller of `writeDataPoint` outside `lib/analytics.ts`.
- **`wecoded-marketplace/worker/` inline comments** on `app/routes.ts` + `admin/analytics.ts` documenting the privacy-by-construction guarantees so future maintainers don't accidentally add an IP-logging or install_id-lookup endpoint.
- **`youcoded/docs/cc-dependencies.md`** — no entry needed (no Claude Code coupling).
- **`AUDIT.md` / `knowledge-debt.md`** — add an entry reminding future sessions to re-verify the privacy copy matches current `writeDataPoint` fields whenever this code changes.

## Edge cases / known-acceptable gaps

- **Clock skew.** A client with a misconfigured clock may ping 0 or 2 times on a given UTC day. Acceptable — `COUNT_DISTINCT(install_id)` counts a duplicate ping as one user, so DAU is unaffected. A missed day just becomes next-launch retry.
- **Reinstall = new install.** Deleting the app or resetting `~/.claude` generates a new UUID. Intentional — matches how installs are typically counted.
- **Multi-machine users.** Running YouCoded on laptop + desktop = 2 MAU. Correct per the definition.
- **Remote browser users.** Remote access connects to a running host; no separate ping path. The host machine's ping covers it.
- **Dev machines.** `scripts/run-dev.sh` splits Electron `userData` but shares `~/.claude/`. Dev instance shares `analytics.json` and install_id with the built app — one ping per day total, which is correct.
- **Air-gapped / offline users.** Pings fail silently, state doesn't advance, next-launch retry. They effectively don't count toward MAU until a network is available — also correct.

## Open items (resolve at plan time)

- Confirm the `itsdestin.github.io` landing-page repo path and file for the copy update.
- Confirm Cloudflare Analytics Engine 90-day retention is actually the default on the current free tier (verify before shipping the copy so we don't over-promise).
- Confirm the exact GitHub API endpoint and rate limit for the Bearer-token → user ID resolution (`/user` is correct, but the 5000/hr limit applies per token — cache duration should be tuned accordingly).
