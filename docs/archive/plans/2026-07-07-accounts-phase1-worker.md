---
status: shipped
---

# Accounts Phase 1 — Worker Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the marketplace Worker's identity layer into the YouCoded account substrate — opaque account ids + provider identities table — and add the account-lifecycle endpoints (profile, handle, logout, delete, session expiry, prune cron).

**Architecture:** Clean D1 rebuild (user base ≈ 4, no compat shims): a new `users` table with opaque `acct_<hex>` PKs and NO provider columns; an `identities` table `(provider, provider_user_id) → user_id`; all FK tables remapped in one migration; sessions dropped (everyone signs in again once). Sign-in resolution, `/auth/me`, the ratings join, and admin auth all switch to the identities model. Spec: `docs/superpowers/specs/2026-07-03-youcoded-accounts-friendship-consolidated-design.md` §1, §5, §7.

**Tech Stack:** Cloudflare Worker (Hono), D1/SQLite migrations, vitest-pool-workers (miniflare), CI deploy via `.github/workflows/worker-deploy.yml` (test → migrate → deploy → secrets).

**Working rules:**
- Repo: `wecoded-marketplace`. Work in a worktree: from `C:\Users\desti\youcoded-dev\wecoded-marketplace` run `git fetch origin && git pull origin master && git worktree add ../wecoded-marketplace.wt/accounts-phase1 -b feat/accounts-phase1 origin/master`. All paths below are relative to `wecoded-marketplace.wt/accounts-phase1/worker/`. Run `npm ci` there once.
- Run tests with `npx vitest run` (miniflare applies `migrations/` automatically; the new migration is exercised by every test).
- NEVER run `wrangler deploy` manually — ship by PR → merge; CI deploys.
- **The invariant this plan installs: no code ever parses a user id.** The ONE exception is the migration itself (backfilling `identities` from legacy `github:<id>` strings). If you find yourself writing `substr(id, ...)` or `id.split(":")` anywhere in `src/`, stop — query `identities` instead.

---

### Task 1: The rebuild — migration 0003, new row types, identity-based sign-in

This task is atomic by necessity: the migration changes the schema out from under the existing code and tests, so schema + code + test fixtures land together. The suite must be green at the end of this task.

**Files:**
- Create: `migrations/0003_accounts_identity.sql`
- Create: `test/helpers.ts`
- Modify: `src/types.ts` (UserRow; add IdentityRow)
- Modify: `src/db.ts` (replace `upsertUser` with `resolveProviderSignIn`)
- Modify: `src/auth/routes.ts` (callback resolution, `fetchMe`)
- Modify: `src/ratings/routes.ts:93-116` (join columns)
- Modify: every test file that does `INSERT INTO users` (grep-driven sweep)

- [ ] **Step 1: Write the migration**

Create `migrations/0003_accounts_identity.sql`:

```sql
-- Accounts substrate rebuild (spec 2026-07-03 §1). Clean rebuild, not additive:
-- user base is ~4, so we take the best long-term schema with zero compat shims.
-- Every existing user gets a fresh opaque account id; provider data moves to
-- `identities`; sessions are dropped (each client signs in again once).
-- THIS FILE is the only place the legacy 'github:<id>' format is ever parsed.

-- 1) Old-id → new-id mapping for the FK remaps below.
CREATE TABLE id_map (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO id_map (old_id, new_id)
  SELECT id, 'acct_' || lower(hex(randomblob(16))) FROM users;

-- 2) Account table: opaque PK, no provider columns, tier-C stubs.
CREATE TABLE users_v2 (
  id TEXT PRIMARY KEY,                      -- 'acct_' + 32 hex; opaque, never parsed
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  handle TEXT,                              -- nullable; unique via index below
  status TEXT NOT NULL DEFAULT 'active',    -- tier-C stub: 'active' | 'suspended'
  created_at INTEGER NOT NULL,              -- unix seconds
  deleted_at INTEGER                        -- tier-C stub; user deletion is hard delete
);
INSERT INTO users_v2 (id, display_name, avatar_url, created_at)
  SELECT m.new_id, u.github_login, u.github_avatar_url, u.created_at
  FROM users u JOIN id_map m ON m.old_id = u.id;

-- 3) Provider identities: one account, N providers.
CREATE TABLE identities (
  provider TEXT NOT NULL,                   -- 'github' (later 'google')
  provider_user_id TEXT NOT NULL,           -- GitHub numeric id as text / Google sub
  user_id TEXT NOT NULL REFERENCES users_v2(id) ON DELETE CASCADE,
  provider_login TEXT,
  linked_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_user_id)
);
-- Backfill: legacy ids are 'github:<numeric>'; substr(id, 8) strips 'github:'.
INSERT INTO identities (provider, provider_user_id, user_id, provider_login, linked_at)
  SELECT 'github', substr(u.id, 8), m.new_id, u.github_login, u.created_at
  FROM users u JOIN id_map m ON m.old_id = u.id;

-- 4) Handle cooldown ledger (30 days; spec §2) — written on rename + deletion.
CREATE TABLE handle_releases (
  handle TEXT PRIMARY KEY,
  released_at INTEGER NOT NULL
);

-- 5) Rebuild FK tables against users_v2 with remapped ids.
--    Sessions are intentionally NOT migrated (drop-all: users re-sign-in once).
CREATE TABLE sessions_v2 (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users_v2(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);

CREATE TABLE installs_v2 (
  user_id TEXT NOT NULL REFERENCES users_v2(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL,
  installed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, plugin_id)
);
INSERT INTO installs_v2
  SELECT m.new_id, i.plugin_id, i.installed_at
  FROM installs i JOIN id_map m ON m.old_id = i.user_id;

CREATE TABLE ratings_v2 (
  user_id TEXT NOT NULL REFERENCES users_v2(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL,
  stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
  review_text TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, plugin_id)
);
INSERT INTO ratings_v2
  SELECT m.new_id, r.plugin_id, r.stars, r.review_text, r.created_at, r.updated_at, r.hidden
  FROM ratings r JOIN id_map m ON m.old_id = r.user_id;

CREATE TABLE theme_likes_v2 (
  user_id TEXT NOT NULL REFERENCES users_v2(id) ON DELETE CASCADE,
  theme_id TEXT NOT NULL,
  liked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, theme_id)
);
INSERT INTO theme_likes_v2
  SELECT m.new_id, t.theme_id, t.liked_at
  FROM theme_likes t JOIN id_map m ON m.old_id = t.user_id;

CREATE TABLE reports_v2 (
  id TEXT PRIMARY KEY,
  rating_user_id TEXT NOT NULL,             -- loose ref (no FK), matches v1
  rating_plugin_id TEXT NOT NULL,
  reporter_user_id TEXT NOT NULL REFERENCES users_v2(id) ON DELETE CASCADE,
  reason TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolution TEXT
);
INSERT INTO reports_v2
  SELECT r.id, coalesce(m1.new_id, r.rating_user_id), r.rating_plugin_id,
         m2.new_id, r.reason, r.created_at, r.resolved_at, r.resolution
  FROM reports r
  LEFT JOIN id_map m1 ON m1.old_id = r.rating_user_id
  JOIN id_map m2 ON m2.old_id = r.reporter_user_id;

-- 6) device_codes: drop in-flight rows (15-min TTL anyway) and the dead
--    session_token_hash column (unwritten since the poll-time-issuance change).
DROP TABLE device_codes;
CREATE TABLE device_codes (
  device_code TEXT PRIMARY KEY,
  user_code TEXT NOT NULL,
  csrf_state TEXT,
  authorized_user_id TEXT,                  -- account id once callback completes
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- 7) Swap: drop old tables first (frees the index names), then rename and index.
DROP TABLE sessions;
DROP TABLE installs;
DROP TABLE ratings;
DROP TABLE theme_likes;
DROP TABLE reports;
DROP TABLE users;
DROP TABLE id_map;

ALTER TABLE users_v2 RENAME TO users;
ALTER TABLE sessions_v2 RENAME TO sessions;
ALTER TABLE installs_v2 RENAME TO installs;
ALTER TABLE ratings_v2 RENAME TO ratings;
ALTER TABLE theme_likes_v2 RENAME TO theme_likes;
ALTER TABLE reports_v2 RENAME TO reports;

CREATE UNIQUE INDEX idx_users_handle ON users(handle);
CREATE INDEX idx_identities_user ON identities(user_id);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_installs_plugin ON installs(plugin_id);
CREATE INDEX idx_ratings_plugin_visible ON ratings(plugin_id) WHERE hidden = 0;
CREATE INDEX idx_reports_open ON reports(created_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_device_codes_user_code ON device_codes(user_code);
```

- [ ] **Step 2: Update the row types**

In `src/types.ts`, replace the `UserRow` interface (lines 24–29) and add `IdentityRow`:

```ts
export interface UserRow {
  id: string;               // opaque 'acct_<hex>' (legacy rows migrated) — never parse
  display_name: string;
  avatar_url: string | null;
  handle: string | null;
  status: string;           // 'active' | 'suspended' (tier-C stub)
  created_at: number;
  deleted_at: number | null;
}

export interface IdentityRow {
  provider: string;         // 'github' (later 'google')
  provider_user_id: string;
  user_id: string;
  provider_login: string | null;
  linked_at: number;
}
```

- [ ] **Step 3: Replace `upsertUser` with identity-based sign-in resolution**

In `src/db.ts`, delete the `upsertUser` function (lines 4–18) and add:

```ts
// Resolve a provider sign-in to an account id, creating account + identity on
// first sign-in (spec §1). The provider profile refreshes avatar_url and
// provider_login on EVERY sign-in; display_name is seeded once at creation and
// then owned by the user (PATCH /auth/profile) — never clobbered here.
export async function resolveProviderSignIn(
  db: D1Database,
  provider: string,
  providerUserId: string,
  profile: { login: string; avatar_url: string | null }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const existing = await db
    .prepare("SELECT user_id FROM identities WHERE provider = ? AND provider_user_id = ?")
    .bind(provider, providerUserId)
    .first<{ user_id: string }>();
  if (existing) {
    await db.prepare("UPDATE identities SET provider_login = ? WHERE provider = ? AND provider_user_id = ?")
      .bind(profile.login, provider, providerUserId).run();
    await db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?")
      .bind(profile.avatar_url, existing.user_id).run();
    return existing.user_id;
  }
  const id = "acct_" + randomToken(16); // 32 hex chars, opaque
  await db.prepare("INSERT INTO users (id, display_name, avatar_url, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, profile.login, profile.avatar_url, now).run();
  await db.prepare("INSERT INTO identities (provider, provider_user_id, user_id, provider_login, linked_at) VALUES (?, ?, ?, ?, ?)")
    .bind(provider, providerUserId, id, profile.login, now).run();
  return id;
}
```

Add the import at the top of `src/db.ts`:

```ts
import { randomToken } from "./lib/crypto";
```

- [ ] **Step 4: Switch the OAuth callback and `fetchMe` to the new model**

In `src/auth/routes.ts`:

(a) Replace the import of `upsertUser`:

```ts
import { resolveProviderSignIn } from "../db";
```

(b) In the callback handler, replace these three lines:

```ts
  const userId = `github:${gh.id}`;
  await upsertUser(c.env.DB, { id: userId, github_login: gh.login, github_avatar_url: gh.avatar_url });
```

with:

```ts
  // Identity-based resolution: same GitHub user → same account across sign-ins.
  const userId = await resolveProviderSignIn(c.env.DB, "github", String(gh.id), {
    login: gh.login,
    avatar_url: gh.avatar_url,
  });
```

(c) Replace the `MeResponse` interface and `fetchMe` function with:

```ts
// "Who am I" shape returned in the poll completion payload and by GET /auth/me.
// `login` stays the GitHub login for player-tag continuity (Phase 0 games use
// it); display_name/handle are the account-native fields Phase 2 switches to.
interface MeResponse {
  id: string;
  login: string;
  display_name: string;
  avatar_url: string | null;
  handle: string | null;
}

async function fetchMe(db: HonoEnv["Bindings"]["DB"], userId: string): Promise<MeResponse | null> {
  const row = await db
    .prepare(
      `SELECT u.id, u.display_name, u.avatar_url, u.handle,
              (SELECT provider_login FROM identities i
                WHERE i.user_id = u.id AND i.provider = 'github') AS github_login
       FROM users u WHERE u.id = ?`
    )
    .bind(userId)
    .first<{ id: string; display_name: string; avatar_url: string | null; handle: string | null; github_login: string | null }>();
  if (!row) return null;
  return {
    id: row.id,
    login: row.github_login ?? row.display_name, // non-GitHub accounts fall back
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    handle: row.handle,
  };
}
```

(d) Also remove `getUser` from `src/db.ts` **only if** `grep -rn "getUser" src/` shows no remaining callers; otherwise update its `UserRow` usage compiles as-is (it's `SELECT *`, so it keeps working with the new row shape).

- [ ] **Step 5: Update the ratings display join**

In `src/ratings/routes.ts` (the block at lines 93–116), change the SQL and mapping. The wire field names (`user_login`, `user_avatar_url`) are kept — clients already consume them — but they now carry the account's display name/avatar:

```ts
      `SELECT r.user_id, u.display_name, u.avatar_url,
```
(rest of the SQL unchanged) — and update the row type + mapping:

```ts
      display_name: string;
      avatar_url: string | null;
```
```ts
    user_login: row.display_name,
    user_avatar_url: row.avatar_url,
```

- [ ] **Step 6: Create the shared test helper**

Create `test/helpers.ts`:

```ts
// Shared fixtures for the accounts schema. Tests must not hand-roll INSERTs
// into users/identities — schema drift then breaks every file at once.
import { env, SELF } from "cloudflare:test";

let seq = 0;

export interface TestAccount {
  userId: string;
  githubId: string;
  login: string;
}

/** Insert an account + github identity directly. */
export async function createTestAccount(opts?: { login?: string; githubId?: string; handle?: string }): Promise<TestAccount> {
  seq += 1;
  const login = opts?.login ?? `user${seq}`;
  const githubId = opts?.githubId ?? String(1000 + seq);
  const userId = `acct_test${String(seq).padStart(4, "0")}${"0".repeat(20)}`;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT INTO users (id, display_name, avatar_url, handle, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(userId, login, null, opts?.handle ?? null, now).run();
  await env.DB.prepare("INSERT INTO identities (provider, provider_user_id, user_id, provider_login, linked_at) VALUES ('github', ?, ?, ?, ?)")
    .bind(githubId, userId, login, now).run();
  return { userId, githubId, login };
}

/** Complete a device-code flow for an existing account; returns the session token. */
export async function issueTestSession(account: TestAccount): Promise<string> {
  const start = await SELF.fetch("https://test.local/auth/github/start", { method: "POST" });
  const { device_code, user_code } = await start.json() as { device_code: string; user_code: string };
  await env.DB.prepare("UPDATE device_codes SET authorized_user_id = ? WHERE user_code = ?")
    .bind(account.userId, user_code).run();
  const poll = await SELF.fetch("https://test.local/auth/github/poll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_code }),
  });
  const { token } = await poll.json() as { token: string };
  return token;
}
```

- [ ] **Step 7: Sweep every test fixture onto the new schema**

Run: `grep -rln "INSERT INTO users\|github:123\|github_login" test/`

For each hit, replace hand-rolled user INSERTs with `createTestAccount()` / `issueTestSession()` from `test/helpers.ts`, and update assertions that expected `github:<id>` user ids to instead use the `userId` returned by the helper. Known hot spots (verify with the grep — do not trust this list blindly):
- `test/auth.test.ts` — the poll-complete test and the `/auth/me` describe (assert `login`, `display_name`, `handle: null` per the new `MeResponse`).
- `test/installs.test.ts`, `test/ratings.test.ts`, `test/reports.test.ts`, `test/admin-*.test.ts` — session/user setup.
- Ratings tests asserting `user_login`: value is now the account display name (identical string for GitHub sign-ups, so most assertions survive unchanged).

- [ ] **Step 8: Run the full suite until green**

Run: `npx vitest run`
Expected: all test files pass (baseline was 93 tests; count grows with the helper-based rewrites). Fix compile errors and stragglers the grep missed — TypeScript will flag every `github_login` reference.

- [ ] **Step 9: Commit**

```bash
git add migrations/0003_accounts_identity.sql src/types.ts src/db.ts src/auth/routes.ts src/ratings/routes.ts test/
git commit -m "feat(accounts): identity rebuild — opaque account ids + identities table

Clean D1 rebuild per spec 2026-07-03 §1: users gets an opaque acct_ PK with
no provider columns; provider data lives in identities; FK tables remapped;
sessions dropped (clients re-sign-in once). Sign-in resolves via identities.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Logout endpoint + session expiry

**Files:**
- Modify: `src/auth/sessions.ts`
- Modify: `src/auth/routes.ts`
- Test: `test/auth.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `test/auth.test.ts` (inside a new describe; reuse the Task 1 helpers):

```ts
import { createTestAccount, issueTestSession } from "./helpers";

describe("POST /auth/logout & session expiry", () => {
  it("revokes the presented session server-side", async () => {
    const acct = await createTestAccount();
    const token = await issueTestSession(acct);

    const out = await SELF.fetch("https://test.local/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(out.status).toBe(204);

    // Token no longer resolves
    const me = await SELF.fetch("https://test.local/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(401);
  });

  it("rejects sessions idle for more than 90 days", async () => {
    const acct = await createTestAccount();
    const token = await issueTestSession(acct);
    // Age the session past the idle limit by editing last_used_at directly.
    const staleTs = Math.floor(Date.now() / 1000) - 91 * 24 * 3600;
    await env.DB.prepare("UPDATE sessions SET last_used_at = ? WHERE user_id = ?")
      .bind(staleTs, acct.userId).run();

    const me = await SELF.fetch("https://test.local/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/auth.test.ts`
Expected: FAIL — `/auth/logout` returns 404; stale session still resolves (200).

- [ ] **Step 3: Implement**

In `src/auth/sessions.ts`, add the constant and enforce it in `resolveSession`:

```ts
// Sessions idle longer than this are invalid (and pruned by the daily cron).
export const SESSION_MAX_IDLE_SEC = 90 * 24 * 3600;
```

and change `resolveSession`'s SELECT to:

```ts
  const row = await db
    .prepare("SELECT user_id, last_used_at FROM sessions WHERE token_hash = ?")
    .bind(hash)
    .first<{ user_id: string; last_used_at: number }>();
  if (!row) return null;
  const now = Math.floor(Date.now() / 1000);
  if (row.last_used_at < now - SESSION_MAX_IDLE_SEC) {
    // Stale — delete eagerly and treat as signed out.
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(hash).run();
    return null;
  }
  await db
    .prepare("UPDATE sessions SET last_used_at = ? WHERE token_hash = ?")
    .bind(now, hash)
    .run();
  return row.user_id;
```

In `src/auth/routes.ts`, add (near `/auth/me`):

```ts
import { issueSession, revokeSession } from "./sessions";
```

```ts
// POST /auth/logout — server-side revocation of the presented session. The
// client also clears its local token; this closes the "sign out only deleted
// the local copy, D1 row lived forever" gap.
authRoutes.post("/auth/logout", async (c) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) throw unauthorized();
  await revokeSession(c.env.DB, header.slice(7));
  return c.body(null, 204);
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/sessions.ts src/auth/routes.ts test/auth.test.ts
git commit -m "feat(auth): POST /auth/logout + 90-day session idle expiry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Maintenance cron (prune sessions, handle releases, device codes)

**Files:**
- Create: `src/maintenance.ts`
- Create: `test/maintenance.test.ts`
- Modify: `src/index.ts` (scheduled handler)
- Modify: `wrangler.toml` (cron trigger)

- [ ] **Step 1: Write the failing test**

Create `test/maintenance.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { pruneExpired } from "../src/maintenance";
import { createTestAccount, issueTestSession } from "./helpers";

describe("pruneExpired", () => {
  it("removes stale sessions, expired handle releases, and dead device codes", async () => {
    const now = Math.floor(Date.now() / 1000);
    const acct = await createTestAccount();
    await issueTestSession(acct); // fresh session — must survive
    // Stale session (aged 91 days)
    await env.DB.prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, last_used_at) VALUES ('stalehash', ?, ?, ?)"
    ).bind(acct.userId, now - 100 * 86400, now - 91 * 86400).run();
    // Expired + live handle releases
    await env.DB.prepare("INSERT INTO handle_releases (handle, released_at) VALUES ('oldname', ?)").bind(now - 31 * 86400).run();
    await env.DB.prepare("INSERT INTO handle_releases (handle, released_at) VALUES ('newname', ?)").bind(now - 1 * 86400).run();
    // Expired device code
    await env.DB.prepare(
      "INSERT INTO device_codes (device_code, user_code, expires_at, created_at) VALUES ('dead', 'XXXX-XXXX', ?, ?)"
    ).bind(now - 3600, now - 4500).run();

    await pruneExpired(env.DB, now);

    const sessions = await env.DB.prepare("SELECT count(*) AS n FROM sessions WHERE user_id = ?").bind(acct.userId).first<{ n: number }>();
    expect(sessions!.n).toBe(1); // fresh survives, stale gone
    const releases = await env.DB.prepare("SELECT handle FROM handle_releases").all();
    expect(releases.results.map((r: any) => r.handle)).toEqual(["newname"]);
    const codes = await env.DB.prepare("SELECT count(*) AS n FROM device_codes WHERE device_code = 'dead'").first<{ n: number }>();
    expect(codes!.n).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/maintenance.test.ts`
Expected: FAIL — `src/maintenance` doesn't exist.

- [ ] **Step 3: Implement**

Create `src/maintenance.ts`:

```ts
// Daily hygiene (spec §5): one job prunes everything with a TTL. Pure function
// of (db, now) so tests don't depend on SELF.scheduled() plumbing.
import type { D1Database } from "@cloudflare/workers-types";
import { SESSION_MAX_IDLE_SEC } from "./auth/sessions";

export const HANDLE_COOLDOWN_SEC = 30 * 24 * 3600; // spec §2: 30-day handle cooldown

export async function pruneExpired(db: D1Database, now: number): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE last_used_at < ?").bind(now - SESSION_MAX_IDLE_SEC).run();
  await db.prepare("DELETE FROM handle_releases WHERE released_at < ?").bind(now - HANDLE_COOLDOWN_SEC).run();
  await db.prepare("DELETE FROM device_codes WHERE expires_at < ?").bind(now).run();
}
```

In `src/index.ts`, replace the default export (line 100) with:

```ts
import { pruneExpired } from "./maintenance";

export default {
  fetch: app.fetch,
  // Daily maintenance — trigger declared in wrangler.toml [triggers].
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await pruneExpired(env.DB, Math.floor(Date.now() / 1000));
  },
};
export type { Env };
```

In `wrangler.toml`, add after the `compatibility_flags` line:

```toml
[triggers]
crons = ["17 6 * * *"]   # daily maintenance: prune sessions/handles/device codes
```

- [ ] **Step 4: Run tests (new file + full suite)**

Run: `npx vitest run`
Expected: PASS (the export-shape change from `app` to `{fetch, scheduled}` must not break other tests — `SELF.fetch` works with either shape).

- [ ] **Step 5: Commit**

```bash
git add src/maintenance.ts src/index.ts wrangler.toml test/maintenance.test.ts
git commit -m "feat(worker): daily maintenance cron — prune sessions, handle releases, device codes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Profile + handle endpoints

**Files:**
- Create: `src/auth/account.ts`
- Create: `test/account.test.ts`
- Modify: `src/index.ts` (mount routes)

- [ ] **Step 1: Write failing tests**

Create `test/account.test.ts`:

```ts
import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { createTestAccount, issueTestSession } from "./helpers";

async function authed(path: string, token: string, init?: RequestInit) {
  return SELF.fetch(`https://test.local${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
}

describe("PATCH /auth/profile", () => {
  it("updates display_name", async () => {
    const acct = await createTestAccount({ login: "octo" });
    const token = await issueTestSession(acct);
    const res = await authed("/auth/profile", token, { method: "PATCH", body: JSON.stringify({ display_name: "Octo Prime" }) });
    expect(res.status).toBe(200);
    const me = await (await authed("/auth/me", token)).json() as { display_name: string };
    expect(me.display_name).toBe("Octo Prime");
  });

  it("rejects empty and over-long names", async () => {
    const acct = await createTestAccount();
    const token = await issueTestSession(acct);
    for (const bad of ["", "   ", "x".repeat(61)]) {
      const res = await authed("/auth/profile", token, { method: "PATCH", body: JSON.stringify({ display_name: bad }) });
      expect(res.status).toBe(400);
    }
  });
});

describe("PUT /auth/handle", () => {
  it("sets a handle (lowercased) and returns it from /auth/me", async () => {
    const acct = await createTestAccount();
    const token = await issueTestSession(acct);
    const res = await authed("/auth/handle", token, { method: "PUT", body: JSON.stringify({ handle: "Dest-In1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ handle: "dest-in1" });
    const me = await (await authed("/auth/me", token)).json() as { handle: string };
    expect(me.handle).toBe("dest-in1");
  });

  it("rejects invalid formats and reserved names", async () => {
    const acct = await createTestAccount();
    const token = await issueTestSession(acct);
    for (const bad of ["ab", "-lead", "sp ace", "ünïcode", "x".repeat(31), "youcoded", "admin"]) {
      const res = await authed("/auth/handle", token, { method: "PUT", body: JSON.stringify({ handle: bad }) });
      expect(res.status, `handle ${JSON.stringify(bad)}`).toBe(400);
    }
  });

  it("refuses a handle already taken (409)", async () => {
    const a = await createTestAccount({ handle: "taken" });
    void a;
    const b = await createTestAccount();
    const token = await issueTestSession(b);
    const res = await authed("/auth/handle", token, { method: "PUT", body: JSON.stringify({ handle: "taken" }) });
    expect(res.status).toBe(409);
  });

  it("puts the old handle into a 30-day cooldown on rename, and refuses cooldown handles", async () => {
    const a = await createTestAccount();
    const tokenA = await issueTestSession(a);
    await authed("/auth/handle", tokenA, { method: "PUT", body: JSON.stringify({ handle: "first" }) });
    await authed("/auth/handle", tokenA, { method: "PUT", body: JSON.stringify({ handle: "second" }) });

    const rel = await env.DB.prepare("SELECT handle FROM handle_releases WHERE handle = 'first'").first();
    expect(rel).not.toBeNull();

    const b = await createTestAccount();
    const tokenB = await issueTestSession(b);
    const res = await authed("/auth/handle", tokenB, { method: "PUT", body: JSON.stringify({ handle: "first" }) });
    expect(res.status).toBe(409); // cooldown
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/account.test.ts`
Expected: FAIL — 404s (routes don't exist).

- [ ] **Step 3: Implement**

Create `src/auth/account.ts`:

```ts
// Account profile endpoints (spec §1 "Profile endpoints"). Handle SETTING
// lives here (it's account profile); handle DISCOVERY is Phase 2 social/.
import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { badRequest, notFound } from "../lib/errors";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "./middleware";
import { HANDLE_COOLDOWN_SEC } from "../maintenance";

// spec §2: 3–30 chars of a-z 0-9 hyphen, starting alphanumeric.
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;
const RESERVED_HANDLES = new Set([
  "youcoded", "wecoded", "admin", "administrator", "support", "help",
  "mod", "moderator", "official", "staff", "system", "root", "destin", "itsdestin",
]);

function conflict(message: string): HTTPException {
  return new HTTPException(409, { message });
}

export const accountRoutes = new Hono<HonoEnv>();

accountRoutes.patch("/auth/profile", requireAuth, async (c) => {
  const body = await c.req.json<{ display_name?: string }>();
  const name = body.display_name?.trim();
  if (!name || name.length > 60) throw badRequest("display_name must be 1-60 characters");
  await c.env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?")
    .bind(name, c.get("userId")).run();
  return c.json({ display_name: name });
});

accountRoutes.put("/auth/handle", requireAuth, async (c) => {
  const body = await c.req.json<{ handle?: string }>();
  const handle = body.handle?.trim().toLowerCase();
  if (!handle || !HANDLE_RE.test(handle)) throw badRequest("handle must be 3-30 chars: a-z 0-9 -");
  if (RESERVED_HANDLES.has(handle)) throw badRequest("that handle is reserved");
  const userId = c.get("userId");
  const now = Math.floor(Date.now() / 1000);

  // Cooldown check (anti-sniping, spec §2): a freed handle stays locked 30 days.
  const cooling = await c.env.DB
    .prepare("SELECT 1 AS one FROM handle_releases WHERE handle = ? AND released_at >= ?")
    .bind(handle, now - HANDLE_COOLDOWN_SEC).first();
  if (cooling) throw conflict("that handle was recently released and is in cooldown");

  const current = await c.env.DB.prepare("SELECT handle FROM users WHERE id = ?")
    .bind(userId).first<{ handle: string | null }>();
  if (!current) throw notFound("unknown user");
  if (current.handle === handle) return c.json({ handle }); // no-op rename

  try {
    await c.env.DB.prepare("UPDATE users SET handle = ? WHERE id = ?").bind(handle, userId).run();
  } catch (e) {
    // Unique index violation → taken. D1 surfaces it as a generic error;
    // match on message to keep other failures loud.
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE/i.test(msg)) throw conflict("that handle is taken");
    throw e;
  }

  // Release the previous handle into cooldown AFTER the rename succeeds.
  if (current.handle) {
    await c.env.DB
      .prepare("INSERT OR REPLACE INTO handle_releases (handle, released_at) VALUES (?, ?)")
      .bind(current.handle, now).run();
  }
  return c.json({ handle });
});
```

In `src/index.ts`, add the import and mount (next to `authRoutes`):

```ts
import { accountRoutes } from "./auth/account";
```
```ts
app.route("/", accountRoutes);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/account.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/account.ts src/index.ts test/account.test.ts
git commit -m "feat(account): PATCH /auth/profile + PUT /auth/handle (validation, reserved list, 30d cooldown)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Delete account

**Files:**
- Modify: `src/auth/account.ts`
- Test: `test/account.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `test/account.test.ts`:

```ts
describe("DELETE /auth/account", () => {
  it("hard-deletes the account and cascades everything", async () => {
    const acct = await createTestAccount({ handle: "goodbye" });
    const token = await issueTestSession(acct);
    const now = Math.floor(Date.now() / 1000);
    // Seed rows in every cascading table
    await env.DB.prepare("INSERT INTO installs (user_id, plugin_id, installed_at) VALUES (?, 'p1', ?)").bind(acct.userId, now).run();
    await env.DB.prepare("INSERT INTO ratings (user_id, plugin_id, stars, created_at, updated_at) VALUES (?, 'p1', 5, ?, ?)").bind(acct.userId, now, now).run();
    await env.DB.prepare("INSERT INTO theme_likes (user_id, theme_id, liked_at) VALUES (?, 't1', ?)").bind(acct.userId, now).run();

    const res = await authed("/auth/account", token, { method: "DELETE" });
    expect(res.status).toBe(204);

    for (const [table, col] of [["users", "id"], ["identities", "user_id"], ["sessions", "user_id"], ["installs", "user_id"], ["ratings", "user_id"], ["theme_likes", "user_id"]] as const) {
      const row = await env.DB.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${col} = ?`).bind(acct.userId).first<{ n: number }>();
      expect(row!.n, table).toBe(0);
    }
    // The freed handle enters cooldown
    const rel = await env.DB.prepare("SELECT 1 AS one FROM handle_releases WHERE handle = 'goodbye'").first();
    expect(rel).not.toBeNull();
    // The presented token is dead (its session row cascaded)
    const me = await authed("/auth/me", token);
    expect(me.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/account.test.ts`
Expected: FAIL — DELETE /auth/account 404.

- [ ] **Step 3: Implement**

Append to `src/auth/account.ts`:

```ts
// Hard delete (spec §5): the FK ON DELETE CASCADE design removes identities,
// sessions, installs, ratings, theme likes, reports-as-reporter — everything.
// No soft delete for users; status/deleted_at are tier-C *suspension* stubs.
accountRoutes.delete("/auth/account", requireAuth, async (c) => {
  const userId = c.get("userId");
  const now = Math.floor(Date.now() / 1000);
  const row = await c.env.DB.prepare("SELECT handle FROM users WHERE id = ?")
    .bind(userId).first<{ handle: string | null }>();
  if (row?.handle) {
    await c.env.DB.prepare("INSERT OR REPLACE INTO handle_releases (handle, released_at) VALUES (?, ?)")
      .bind(row.handle, now).run();
  }
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
  return c.body(null, 204);
});
```

- [ ] **Step 4: Run tests — if the cascade assertions fail, enable FK enforcement**

Run: `npx vitest run test/account.test.ts`
Expected: PASS. **If the `installs`/`ratings` counts are non-zero**, D1's FK enforcement isn't active in this toolchain; replace the single DELETE with explicit deletes in the same handler (children first, users last):

```ts
  for (const sql of [
    "DELETE FROM identities WHERE user_id = ?",
    "DELETE FROM sessions WHERE user_id = ?",
    "DELETE FROM installs WHERE user_id = ?",
    "DELETE FROM ratings WHERE user_id = ?",
    "DELETE FROM theme_likes WHERE user_id = ?",
    "DELETE FROM reports WHERE reporter_user_id = ?",
    "DELETE FROM users WHERE id = ?",
  ]) {
    await c.env.DB.prepare(sql).bind(userId).run();
  }
```
Keep whichever variant the test proves correct (and leave a comment saying which behavior was observed).

- [ ] **Step 5: Commit**

```bash
git add src/auth/account.ts test/account.test.ts
git commit -m "feat(account): DELETE /auth/account — hard delete with full cascade + handle cooldown

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Admin auth via identities

**Files:**
- Create: `src/auth/admin.ts`
- Modify: `src/auth/pat.ts` (resolve to account id)
- Modify: `src/auth/admin-middleware.ts` (pass DB to resolvePat)
- Modify: `src/admin/analytics.ts` (7 `isAdmin` callsites), `src/reports/routes.ts` (2 callsites)
- Modify: `wrangler.toml` (`[env.test.vars] ADMIN_USER_IDS`)
- Test: `test/auth-pat.test.ts`, `test/admin-middleware.test.ts`, `test/admin-analytics.test.ts`, `test/reports.test.ts`

- [ ] **Step 1: Understand the semantics change**

`ADMIN_USER_IDS` stops holding `github:<id>` user-id strings and starts holding **bare GitHub numeric ids** (e.g. `"1234567"`). Admin-ness is decided by looking up the caller's GitHub identity in `identities` — id-format-independent, survives any future account-id change (spec §1).

- [ ] **Step 2: Write the failing test for the new helper**

Create the describe in `test/admin-middleware.test.ts` (or a new `test/admin-identity.test.ts` if that file's structure resists):

```ts
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { isAdminAccount } from "../src/auth/admin";
import { createTestAccount } from "./helpers";

describe("isAdminAccount", () => {
  it("admits an account whose github identity is allowlisted", async () => {
    const acct = await createTestAccount({ githubId: "777001" });
    expect(await isAdminAccount(env.DB, { ADMIN_USER_IDS: "777001, 888002" }, acct.userId)).toBe(true);
  });
  it("rejects non-allowlisted, empty allowlist, and unknown accounts", async () => {
    const acct = await createTestAccount({ githubId: "777003" });
    expect(await isAdminAccount(env.DB, { ADMIN_USER_IDS: "999999" }, acct.userId)).toBe(false);
    expect(await isAdminAccount(env.DB, { ADMIN_USER_IDS: "" }, acct.userId)).toBe(false);
    expect(await isAdminAccount(env.DB, { ADMIN_USER_IDS: "777003" }, "acct_nonexistent")).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure, then implement**

Run: `npx vitest run test/admin-middleware.test.ts` → FAIL (module missing).

Create `src/auth/admin.ts`:

```ts
// Admin allowlist, keyed on the GitHub identity (numeric id) via `identities`
// — NOT on account ids, so it survives id-format changes (spec §1).
// ADMIN_USER_IDS: comma-separated GitHub numeric ids.
import type { D1Database } from "@cloudflare/workers-types";

export async function isAdminAccount(
  db: D1Database,
  env: { ADMIN_USER_IDS: string },
  userId: string
): Promise<boolean> {
  const admins = env.ADMIN_USER_IDS.split(",").map((s) => s.trim()).filter(Boolean);
  if (admins.length === 0) return false;
  const row = await db
    .prepare("SELECT provider_user_id FROM identities WHERE user_id = ? AND provider = 'github'")
    .bind(userId)
    .first<{ provider_user_id: string }>();
  return !!row && admins.includes(row.provider_user_id);
}
```

- [ ] **Step 4: Switch resolvePat to return an account id**

In `src/auth/pat.ts`, change `resolvePat` to take the DB and resolve through identities (cache the *account id*):

```ts
export async function resolvePat(db: D1Database, token: string): Promise<string | null> {
  if (!token) return null;
  const key = await hashToken(token);
  const cached = patCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.userId;

  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "wecoded-marketplace-worker",
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) return null;  // do NOT cache failures — a rotated PAT can start working
  const user = (await res.json()) as { id: number };
  if (typeof user.id !== "number") return null;
  // Resolve to the platform account. Requires the admin to have signed into
  // the marketplace at least once (their github identity row must exist).
  const row = await db
    .prepare("SELECT user_id FROM identities WHERE provider = 'github' AND provider_user_id = ?")
    .bind(String(user.id))
    .first<{ user_id: string }>();
  if (!row) return null;
  patCache.set(key, { userId: row.user_id, expiresAt: Date.now() + TTL_MS });
  return row.user_id;
}
```

Add the D1Database import at the top: `import type { D1Database } from "@cloudflare/workers-types";`

In `src/auth/admin-middleware.ts`, update the call (line 26): `const userId = await resolvePat(c.env.DB, pat);`

- [ ] **Step 5: Replace the two local `isAdmin` helpers**

In `src/admin/analytics.ts`: delete the local `isAdmin` (lines 19–21), import `isAdminAccount` from `../auth/admin`, and change all 7 guard lines from
`if (!isAdmin(c.env, c.get("userId"))) throw forbidden("admin only");` to
`if (!(await isAdminAccount(c.env.DB, c.env, c.get("userId")))) throw forbidden("admin only");`

Same change in `src/reports/routes.ts` (local helper at lines 12–14, 2 guard callsites).

- [ ] **Step 6: Update test env + affected tests**

In `wrangler.toml` `[env.test.vars]`, change `ADMIN_USER_IDS = "github:admin"` to `ADMIN_USER_IDS = "424242"`.

Update `test/auth-pat.test.ts`, `test/admin-middleware.test.ts`, `test/admin-analytics.test.ts`, `test/admin-dashboard.test.ts`, `test/reports.test.ts`: wherever an admin caller is set up, create the account with `createTestAccount({ githubId: "424242" })` and (for PAT-path tests) point their GitHub `/user` mock at `{ id: 424242 }`. Non-admin callers use any other githubId.

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/auth/admin.ts src/auth/pat.ts src/auth/admin-middleware.ts src/admin/analytics.ts src/reports/routes.ts wrangler.toml test/
git commit -m "feat(admin): allowlist keyed on GitHub identity via identities table

ADMIN_USER_IDS now holds bare GitHub numeric ids; resolvePat returns the
platform account id. Id-format-independent — survives future id changes.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Ship it

- [ ] **Step 1: Final greps for the invariant**

Run: `grep -rn "github:" src/ | grep -v "provider = 'github'" | grep -v "// "` — expected: no code constructs or parses `github:<id>` strings (comments/docs ok).
Run: `grep -rn "github_login\|github_avatar_url\|upsertUser" src/` — expected: no hits.

- [ ] **Step 2: Full suite once more**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 3: Push branch + PR**

```bash
git push -u origin feat/accounts-phase1
gh pr create --repo itsdestin/wecoded-marketplace --title "Accounts Phase 1: identity substrate (users/identities rebuild, profile/handle/logout/delete, prune cron, identity-keyed admin)" --body "Implements Phase 1 of youcoded-dev docs/superpowers/specs/2026-07-03-youcoded-accounts-friendship-consolidated-design.md. Clean D1 rebuild: opaque account ids + identities table; sessions dropped (all ~4 users re-sign-in once). Deploy note: brief error window between CI's migration step and the code deploy — do not merge mid-demo.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 4: BEFORE merging — update the ADMIN_USER_IDS repo secret**

Manual step for Destin (or via gh with admin rights): the repo secret `ADMIN_USER_IDS` must change from `github:<id>` format to the bare numeric id. Find it with `gh api user --jq .id`. Then: repo Settings → Secrets → Actions → `ADMIN_USER_IDS` → set to that number. CI pushes secrets on every deploy, so the new value lands with the merge.

- [ ] **Step 5: Merge + verify deploy**

Merge the PR. Watch `gh run list --repo itsdestin/wecoded-marketplace --workflow worker-deploy.yml --limit 1` until success. Remember the known deploy-window blip (spec §1): the old code errors against the new schema for the seconds between the migration and deploy steps.

- [ ] **Step 6: Live smoke test**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://wecoded-marketplace-api.destinj101.workers.dev/health          # 200
curl -s -o /dev/null -w "%{http_code}\n" https://wecoded-marketplace-api.destinj101.workers.dev/auth/me        # 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://wecoded-marketplace-api.destinj101.workers.dev/auth/github/start  # 200
```
Then a real end-to-end: sign in from the dev app (all pre-rebuild sessions are dead by design — every client re-authenticates), confirm `/auth/me` via the app works, and confirm the marketplace admin analytics skill still authenticates (PAT path).

- [ ] **Step 7: Clean up worktree**

```bash
cd C:\Users\desti\youcoded-dev\wecoded-marketplace
git worktree remove --force ../wecoded-marketplace.wt/accounts-phase1
git branch -D feat/accounts-phase1
git fetch origin && git pull origin master
```

---

## Post-plan notes

- **What this plan deliberately does NOT do:** client-side changes (IPC rename, Settings → Account UI, handle prompt) — that's the companion plan `2026-07-07-accounts-phase1-client.md`. Old clients keep working against the rebuilt Worker: `/auth/me` keeps `login`, poll keeps `user`, ratings keep `user_login`.
- **Sequencing with cross-device sync:** this plan must land before SyncHub work per `docs/superpowers/investigations/2026-07-03-sync-accounts-coordination.md` — both touch `worker/auth/` and `wrangler.toml`.
