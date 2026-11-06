# 06 - Worker backend security review (server side)
Scope: wecoded-marketplace/worker/src (all routes, 2 Durable Objects), wrangler.toml, worker-deploy.yml; app-side token store spot-check.
All paths relative to /home/destin/youcoded-dev/worktrees/sessions/security-audit-2026-10-30/wecoded-marketplace/worker/ unless noted.
Method: static read only; no requests sent; worker tests NOT run (no node_modules). No PartyKit server exists in this repo (only docs/old specs); the old PartyKit game-room deployment (card 55 says "still deployed") was NOT reviewable here.

## Findings

### F1 - HIGH - Sign-in link phishing lets an attacker take over a victim's YouCoded account (already known: card #55)
- Precondition: attacker only needs the internet and a victim who clicks a link and approves GitHub sign-in.
- Steps: (1) attacker POSTs /auth/github/start, receives device_code (secret, kept by attacker) and auth_url. (2) sends auth_url to victim ("sign in to YouCoded to claim..."). (3) victim opens it; start-redirect sets the CSRF cookie in the VICTIM's browser, so the callback's CSRF check passes; victim signs in at GitHub; page says "Signed in as <victim>". (4) attacker polls /auth/github/poll with device_code and receives a real session token for the victim.
- Evidence: src/auth/routes.ts:71-86 (start returns device_code to whoever asked), :88-114 (cookie minted for any visitor), :116-168 (callback binds victim to the attacker's device_code), :170-205 (poll hands the token to the device_code holder). The CSRF cookie only proves "same browser as start-redirect", not "same person as the device that asked".
- Impact: attacker acts as victim in friends, comments/ratings, game records, sync-hub signalling, can DELETE the account (account.ts:172) and read /auth/export. If the victim is the owner (ADMIN_USER_IDS), attacker gets admin analytics + comment/rating hiding.
- Mitigations: none in code; GitHub's own consent page shows app name only. Does not expose GitHub account or local files.
- Confidence: Confirmed (code path). Fix: bind device flow to a loopback/PKCE proof the real app holds (the card's design); at minimum show the user_code on the callback page and require the user to type/confirm it in the app before poll succeeds.

### F2 - HIGH (availability/cost) - Unauthenticated endpoints with no working rate limit can exhaust the D1 write/read quota
- /auth/github/start does a D1 INSERT per anonymous call with NO rate limit (src/auth/routes.ts:71-82). A loop of curl calls fills device_codes and burns daily D1 write allowance; when exhausted, every write in the product (ratings, installs, presence last_seen, sign-in) fails. Rows are only pruned by the daily cron (maintenance.ts:260).
- GET /stats has no rate limit and runs four full-table GROUP BY scans per request (src/stats/routes.ts:304-325); `Cache-Control` on the response does not make a Worker cache it. Cost grows with table size (see F4).
- The limiter itself: lib/rate-limit.ts uses the Cache API, per-colo and read-then-write (not atomic). wrangler.toml:25 keeps `workers_dev = true`, and the owner's own comment (wrangler.toml:7-10) and rule file measured that the limiter is INERT on *.workers.dev. So every "rate-limited" route is bypassable by calling the workers.dev hostname.
- Confidence: Confirmed for missing limit on /auth/github/start and /stats; Likely that quota exhaustion is reachable (depends on Cloudflare plan: free = hard stop, paid = overage bill). Fix: Cloudflare WAF/rate-limiting rules at the zone for api.youcoded.ai (the SITE_ANALYTICS comment says an edge rule already exists for that - extend it to /auth/*, /stats, /app/heartbeat); retire workers.dev once old builds are gone; cache /stats in KV/Cache with a short TTL.

### F3 - MEDIUM - Stored XSS (latent) in the admin dashboard from unauthenticated heartbeat input
- POST /app/heartbeat is unauthenticated; appVersion (<=32 chars) and os (<=16) are accepted as any string (src/app/routes.ts:423-425,441-462) and stored in Analytics Engine blob3/blob5. /admin/analytics/versions returns blob3, and the dashboard renders it with innerHTML unescaped (src/admin/dashboard-html.ts:68-71, 105-107). e.g. version `<img src=x onerror=...>` fits in 32 chars.
- Why only latent: GET /admin/dashboard requires a Bearer header (admin-middleware.ts:12-20) and the page fetches with cookies only (dashboard-html.ts:62), but the server never reads cookies, so the dashboard cannot load in a browser today. If someone "fixes" it with cookie auth, it becomes real XSS against the owner's admin session.
- Also: chart.js loaded from jsdelivr without SRI (dashboard-html.ts:49).
- Confidence: Confirmed code flaw; exploit currently blocked by the dashboard being non-functional. Fix: validate appVersion against /^[0-9A-Za-z.+-]{1,32}$/ and os against an allowlist at ingest; escape in renderTable.

### F4 - MEDIUM - Unbounded junk rows / count inflation (cheap sybil abuse)
- POST /themes/:id/like: no rate limit, no check the theme exists (src/themes/routes.ts:2-23). One account can create unlimited theme_likes rows with invented ids; /stats then returns all of them (stats/routes.ts:361-365), growing the public payload and D1 scan cost forever. Any GitHub account (free) can do this.
- requireCatalogId waves through ANY id starting with "theme:" (lib/validate.ts:296), so /installs, /ratings, /thumbs, /comments accept unlimited fake theme ids (installs 100/hr, comments 20/hr per user - limiter weak per F2). The comment in feedback/routes.ts:50-56 admits install-gating is not a real gate.
- Install counts / thumbs / theme likes are inflatable by script with multiple GitHub accounts; ratings use a Bayesian average (stats/bayesian.ts) which dampens but does not stop it.
- Fix: rate limit + validate theme ids against the theme registry; cap rows per user; consider account-age or verification gating for rankings.

### F5 - MEDIUM - Unauthenticated telemetry endpoint can be forged (analytics integrity)
- POST /app/heartbeat accepts any 64-hex "deviceIdHash" (app/routes.ts:407-433). Anyone can mint thousands of fake "users" to inflate DAU/MAU/installs or poison version/country charts the owner uses for growth decisions. Limit is 30/hr/IP via the weak limiter (F2). Falls back to X-Forwarded-For if CF-Connecting-IP absent (app/routes.ts:436) - not an issue behind Cloudflare.
- Fix: edge rate limits; treat DAU as approximate; optional signed-app attestation is probably overkill.

### F6 - LOW - Admin identity accepts any valid GitHub token (confused deputy)
- requireAdminAuth's X-GitHub-PAT path trades ANY token GitHub's /user accepts for the account (auth/pat.ts:454-472). A third-party GitHub OAuth app (or leaked token with even minimal scope) belonging to the owner's GitHub account can therefore call admin analytics/moderation routes. Blast radius: read analytics, hide ratings/comments (not catalog publish, which is a separate secret). Fix: require a fine-grained PAT with a recognizable marker, or drop PAT auth and use session tokens only.

### F7 - LOW - Relayed free-form fields over presence socket
- Challenge frames forward `gameType` and `code` unvalidated to a friend (social/presence-room.ts:259). Recipient must be an accepted friend; app-side handling not reviewed here (another specialist). No per-socket message rate limit, so a friend can spam status/challenge to all their friends (fan-out bounded by friend count). Fix: validate gameType against VERSUS_GAMES, code length/charset, add per-socket throttle.

### F8 - LOW - Game results/scores are forgeable by design
- Solo scores accept any integer to 1e9 (games/registry.ts:49-51; comment says not anti-cheat). Versus records: two friends can collude (presence-room.ts:415-486). Friends-only boards, so only reputational. Cooldown-free friend-request cap can be reset by cancelling pending requests (social/routes.ts:117-120).

### F9 - LOW - Sync hub per-account storage unbounded
- Authenticated user can create unlimited `lease:<sessionId>` keys (sync/room.ts handleLease, ids<=100 chars, no cap) and X-Sync-Device label (query param) is stored unbounded-ish (sync/routes.ts:352). Only affects the attacker's own DO, but costs owner storage. Fix: cap leases per room; truncate device label.

### F10 - LOW/INFO - Error and hardening hygiene
- app.onError returns raw `err.message` on 500 for all routes (index.ts:135-137); D1/SQLite errors could reveal table/column names. No stack traces. Fix: generic message for non-admin routes.
- Sessions: 90-day sliding idle expiry, no absolute lifetime, no "sign out everywhere" (auth/sessions.ts:5). Logout revokes only the presented token.
- No CSP/X-Frame-Options on the HTML responses (callback page); login names are GitHub-safe charset so no injection.
- CORS allows http://localhost:5173/5223/9901 origins (index.ts:29-35): any local web page on those ports can call authenticated routes only if it has a token, so low risk.
- Reports accept arbitrary rating_user_id/plugin_id without existence check (reports/routes.ts:296-305), 20/hr: admin queue spam only.

## Checked and OK (with evidence)
- SQL injection in D1: every query uses prepare().bind() including IN lists built from "?" placeholders (catalog/routes.ts:167,235; lib/validate.ts:324). No string-concatenated user input found in src/ outside Analytics Engine.
- Analytics Engine SQL (no bind API): all interpolated values are sanitized to hex64, ISO date, 1-4 digit bounded ints, closed allowlists or [0-9A-Za-z.+-] (lib/admin-filter.ts:18-123, admin/analytics.ts clampInt:35-39).
- Token quality: 32 random bytes from crypto.getRandomValues (lib/crypto.ts:1-9); only SHA-256 hash stored (auth/sessions.ts:11-18); session issued at poll time and device_code claimed with atomic DELETE...RETURNING so replays get nothing (auth/routes.ts:192-200).
- OAuth state is a random 256-bit value bound to an HttpOnly Secure SameSite=Lax cookie with constant-time compare; redirect_uri is built server-side from the request origin, not user input - no open redirect (auth/routes.ts:102-113,127; auth/github.ts:34-44). Device codes expire in 15 min and are pruned (routes.ts:66, maintenance.ts:260).
- IDOR: all user-data routes scope by session userId, never a client-supplied owner id: ratings delete (ratings/routes.ts:223-230), thumbs, installs, export (account.ts:196-221 pinned columns, excludes token hashes and who-blocked-me), friend request accept/decline/cancel filter by to_user/from_user (social/routes.ts:153-189), friends/blocks lists keyed to me. Blocked users look identical to missing users (routes.ts:67-69,86).
- Admin gate: every admin route calls requireAdminAccount (identity in ADMIN_USER_IDS via identities table), fails closed if the secret is missing (auth/admin.ts:9-24); admin analytics, catalog health, reports, comments, website analytics all gated (grep of "/admin/").
- Catalog ingest endpoints gated by constant-time shared secret, 503 if unset (catalog/auth.ts); mass-retire guard 20% (catalog/routes.ts:24-28,222); batch size caps 500 (:18).
- Secrets: wrangler.toml contains no secrets (only IDs, public config, test dummies under [env.test]); production secrets pushed by CI after deploy (worker-deploy.yml:37-59). D1/KV ids are not secret.
- CORS: authenticated routes use strict origin allowlist, credentials false; wildcard only for GET public reads (index.ts:49-71,99-122). Auth is Bearer header, so CSRF via browser cookies is not applicable except the intentional OAuth cookie.
- WebSocket auth: presence and sync connect only via requireAuth; identity header set by worker overrides any client header, hidden flag cleared from client headers (social/routes.ts:36-48, sync/routes.ts:344-358). DO endpoints are not publicly routable (internal URLs via binding). Sync room is one DO per account id so device relay never crosses accounts (sync/routes.ts:350). Presence is friends-only: snapshots/broadcasts iterate the friend set from D1 (presence-room.ts:577-603); blocks sever friendships; cannot spy on non-friends.
- Presence privacy: only users.last_seen_at persisted (presence-room.ts:9-13); hidden sockets never announced.
- Game results: both players attest over their own authenticated sockets, must be friends, outcomes must agree, forfeits only when the room independently sees opponent gone (presence-room.ts:376-527). Match id length bounded; game ids allowlisted.
- Input validation: length caps on ids (validate.ts:282), review (500) and comment (2000, max 2 links) text, display_name 60, handle regex + reserved + 30-day cooldown with atomic claim (account.ts:15-157); body JSON parse errors -> 400.
- Content moderation: llama-guard classification on reviews/comments, flagged text stored hidden (ratings/moderation.ts); user text returned as JSON; app UI uses React text rendering (only dangerouslySetInnerHTML uses in renderer are mascot SVG and DocxView, not marketplace text).
- Telemetry privacy: only HMAC device hash, version, platform, os, country/region from CF headers; no IP stored (lib/analytics.ts, app/routes.ts:453-462); dashboard queries aggregate with count(DISTINCT); country/region never cross-tabulated (admin/analytics.ts header).
- Site analytics (website): exact-origin check, no cookies/auth headers accepted, 4KB streamed body cap, strict field validation, HMAC capability, hash of nonce stored, per-day budgets and DB triggers (site-analytics/routes.ts:28-35,60-95; validation.ts).
- No GitHub webhook endpoint exists in the worker, so no signature verification to check. Remote content push to all apps: only via the catalog (gated by ingest secret) - announcements/featured live in GitHub repos outside this worker.
- Client token storage: auth store file written mode 0600 (youcoded/desktop/src/main/marketplace-auth-store.ts:89); presence socket uses wss (presence-socket.ts:15). Not deeply reviewed.

## Not covered / caveats
- Worker unit tests not run (no node_modules). Migrations/indexes not reviewed. PartyKit game rooms (referenced by card 55 as still deployed) are not in this repo. Catalog contents scraped from third-party repos (descriptions) are rendered by the app - rendering safety belongs to the renderer specialist. Cloudflare account settings (plan, WAF rules, token scopes) cannot be verified from code.
