---
status: shipped
---

# Accounts Phase 2 — Worker (friends, blocks, presence DO, export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `social/` module (friendships, friend requests, blocks, exact handle lookup), a `PresenceRoom` Durable Object with friends-only fan-out, `GET /auth/export`, and cron/robustness follow-ups to the wecoded-marketplace platform Worker.

**Architecture:** New D1 migration `0004_social.sql` (three tables + `users.last_seen_at`); a walled `src/social/` module that talks to identity only through `requireAuth` + user ids; a single global `PresenceRoom` Durable Object (hibernation WebSocket API) that authenticates via the same session tokens and reads the friend graph from D1; friend-mutation routes poke the DO so visibility updates live. Design spec: `docs/superpowers/specs/2026-07-03-youcoded-accounts-friendship-consolidated-design.md` §2, §3, §5.

**Tech Stack:** Cloudflare Workers (Hono), D1, Durable Objects (SQLite-backed, WebSocket hibernation API), `@cloudflare/vitest-pool-workers`.

**Repo:** `wecoded-marketplace` (worktree). **Ship path:** PR → merge to master → CI (test → D1 migrate → deploy → secrets). **NEVER run `wrangler deploy` manually.**

---

## Standing context (read before Task 1)

- **The merged worker code on master is the source of truth, not older plan docs.** Phase 1 plan code blocks are pre-hardening (see `docs/knowledge-debt.md` → "Accounts Phase 1 plan docs show pre-hardening code"). Always read the current file before editing it.
- **Hard rule: no code ever parses a user id.** Provider linkage questions go to the `identities` table.
- Session auth: `requireAuth` middleware (`src/auth/middleware.ts`) sets `c.get("userId")`. Reuse it — do not write a second auth path.
- Errors: `badRequest/unauthorized/forbidden/notFound/tooMany` from `src/lib/errors.ts` (HTTPException-based). 409 has no shared helper — `src/auth/account.ts` defines a local `conflict()`; Task 3 promotes it to `src/lib/errors.ts`.
- Rate limiting: `checkRateLimit(key, limit, windowSec)` from `src/lib/rate-limit.ts`, key convention `"<scope>:<id>"`.
- IDs: `randomToken` from `src/lib/crypto.ts` (`randomToken(16)` = 32 hex chars).
- Tests: `import { env, SELF } from "cloudflare:test"`; fixtures `createTestAccount` / `issueTestSession` from `test/helpers.ts`; migrations auto-applied by `test/setup.ts`. Run with `npm test` from `worker/`.
- CORS: `/social/*` writes ride the existing `strictCors` (already allows GET/POST/PATCH/PUT/DELETE). Do NOT add social paths to `isPublicReadPath` — every social route is session-gated by design (no unauthenticated handle probing).
- **Coordination:** the cross-device-sync session also plans Worker changes. This plan claims migration number **0004** and adds the first `[durable_objects]` section to `wrangler.toml`. If a sync branch appears mid-execution, rebase early; migrations land as separate numbered files.

**Design decision recorded here (deviation from spec's table sketch):** `friend_requests` holds **pending rows only** — accept/decline/cancel DELETE the row (accept also inserts the friendship in the same `db.batch`). No `resolved` column: resolution history is data we don't need (declines are silent per spec §2, and less stored social data is the privacy default). The 90-day stale-request prune then simply deletes old pending rows.

**Wire conventions:** all social JSON is snake_case, matching `/auth/me` (`display_name`, `avatar_url`). The "minimal card" shape everywhere is `{ id, display_name, handle, avatar_url }`.

---

### Task 0: Worktree setup

- [ ] **Step 1: Sync and create the worktree**

```bash
cd /c/Users/desti/youcoded-dev/wecoded-marketplace
git fetch origin && git pull origin master
mkdir -p ../wecoded-marketplace.wt
git worktree add ../wecoded-marketplace.wt/accounts-phase2-worker -b feat/social-phase2
cd ../wecoded-marketplace.wt/accounts-phase2-worker/worker
npm ci
npm test   # green baseline before any change
```

Expected: full suite passes (same as master).

---

### Task 1: Migration 0004 — social tables + `users.last_seen_at`

**Files:**
- Create: `worker/migrations/0004_social.sql`
- Test: `worker/test/social-schema.test.ts`

- [ ] **Step 1: Write the failing schema test**

```ts
// worker/test/social-schema.test.ts
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { createTestAccount } from "./helpers";

describe("0004_social schema", () => {
  it("friendships enforces user_low < user_high", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const [low, high] = a.userId < b.userId ? [a.userId, b.userId] : [b.userId, a.userId];
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("INSERT INTO friendships (user_low, user_high, created_at) VALUES (?, ?, ?)")
      .bind(low, high, now).run();
    // Reversed order violates the CHECK constraint
    await expect(
      env.DB.prepare("INSERT INTO friendships (user_low, user_high, created_at) VALUES (?, ?, ?)")
        .bind(high, low, now).run()
    ).rejects.toThrow();
  });

  it("deleting a user cascades friendships, requests, and blocks", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const now = Math.floor(Date.now() / 1000);
    const [low, high] = a.userId < b.userId ? [a.userId, b.userId] : [b.userId, a.userId];
    await env.DB.batch([
      env.DB.prepare("INSERT INTO friendships (user_low, user_high, created_at) VALUES (?, ?, ?)").bind(low, high, now),
      env.DB.prepare("INSERT INTO friend_requests (id, from_user, to_user, created_at) VALUES ('freq_t1', ?, ?, ?)").bind(a.userId, b.userId, now),
      env.DB.prepare("INSERT INTO blocks (blocker, blocked, created_at) VALUES (?, ?, ?)").bind(a.userId, b.userId, now),
    ]);
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(a.userId).run();
    for (const [table, col] of [["friendships", "user_low"], ["friendships", "user_high"], ["friend_requests", "from_user"], ["blocks", "blocker"]] as const) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = ?`).bind(a.userId).first<{ n: number }>();
      expect(row!.n).toBe(0);
    }
  });

  it("users has a nullable last_seen_at column", async () => {
    const a = await createTestAccount();
    await env.DB.prepare("UPDATE users SET last_seen_at = 123 WHERE id = ?").bind(a.userId).run();
    const row = await env.DB.prepare("SELECT last_seen_at FROM users WHERE id = ?").bind(a.userId).first<{ last_seen_at: number }>();
    expect(row!.last_seen_at).toBe(123);
  });

  it("handle_releases has a nullable released_by that clears when the user is deleted", async () => {
    const a = await createTestAccount();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("INSERT INTO handle_releases (handle, released_at, released_by) VALUES ('oldname', ?, ?)")
      .bind(now, a.userId).run();
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(a.userId).run();
    const row = await env.DB.prepare("SELECT released_by FROM handle_releases WHERE handle = 'oldname'").first<{ released_by: string | null }>();
    expect(row!.released_by).toBeNull(); // ON DELETE SET NULL
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- social-schema`
Expected: FAIL — `no such table: friendships` etc.

- [ ] **Step 3: Write the migration**

```sql
-- worker/migrations/0004_social.sql
-- Accounts Phase 2 (spec §2): friend graph, pending friend requests, blocks,
-- and the single persisted presence fact (users.last_seen_at — spec §5 invariant:
-- NO presence history, only the most recent timestamp).

-- One canonical row per friend pair; symmetric by definition.
CREATE TABLE friendships (
  user_low TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,             -- unix seconds
  PRIMARY KEY (user_low, user_high),
  CHECK (user_low < user_high)
);
CREATE INDEX idx_friendships_high ON friendships(user_high);

-- Pending requests ONLY: accept/decline/cancel delete the row (accept also
-- creates the friendship in the same batch). No resolution history stored.
CREATE TABLE friend_requests (
  id TEXT PRIMARY KEY,                     -- 'freq_' + 32 hex; opaque
  from_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE (from_user, to_user)              -- one pending request per direction per pair
);
CREATE INDEX idx_friend_requests_to ON friend_requests(to_user);

-- Block list visible only to its owner. Block beats friend everywhere.
CREATE TABLE blocks (
  blocker TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker, blocked)
);
CREATE INDEX idx_blocks_blocked ON blocks(blocked);

-- Friends-visible "last seen" — written by the PresenceRoom DO on disconnect
-- and on a coarse ~5-minute refresh. Nullable: never-connected users have none.
ALTER TABLE users ADD COLUMN last_seen_at INTEGER;

-- Who released a handle: lets the PREVIOUS OWNER re-claim their own handle
-- during the 30-day cooldown (Destin, 2026-07-08: renames shouldn't lock you
-- out of your old handle). NULL = nobody can reclaim early. ON DELETE SET NULL
-- so a deleted account's handles follow the normal cooldown for everyone.
ALTER TABLE handle_releases ADD COLUMN released_by TEXT REFERENCES users(id) ON DELETE SET NULL;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- social-schema`
Expected: PASS (setup.ts auto-applies new migrations).

- [ ] **Step 5: Commit**

```bash
git add migrations/0004_social.sql test/social-schema.test.ts
git commit -m "feat(social): migration 0004 — friendships, friend_requests, blocks, users.last_seen_at"
```

---

### Task 2: `parseJsonBody` helper (knowledge-debt #1)

Malformed JSON bodies currently reach `c.req.json()` raw and become 500s. Fix once, use everywhere new code needs it, retrofit the account endpoints.

**Files:**
- Create: `worker/src/lib/parse-json.ts`
- Modify: `worker/src/auth/account.ts` (all `c.req.json()` callsites)
- Test: `worker/test/parse-json.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// worker/test/parse-json.test.ts
import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { createTestAccount, issueTestSession } from "./helpers";

describe("malformed JSON bodies", () => {
  it("returns 400 (not 500) for a broken body on PATCH /auth/profile", async () => {
    const acct = await createTestAccount();
    const token = await issueTestSession(acct);
    const res = await SELF.fetch("https://test.local/auth/profile", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm test -- parse-json` → currently 500.

- [ ] **Step 3: Implement the helper and retrofit account.ts**

```ts
// worker/src/lib/parse-json.ts
import type { Context } from "hono";
import { badRequest } from "./errors";

/** Parse a JSON request body, turning malformed JSON into a 400 instead of a 500. */
export async function parseJsonBody<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw badRequest("request body must be valid JSON");
  }
}
```

In `worker/src/auth/account.ts`, replace every `await c.req.json<...>()` with `await parseJsonBody<...>(c)` (import at top). Do NOT change validation logic. Leave other modules' callsites alone unless a later task touches the file anyway — new social code (Tasks 3–6) uses `parseJsonBody` from the start.

- [ ] **Step 4: Run** `npm test` — full suite green (existing account tests unaffected).

- [ ] **Step 5: Commit** — `git commit -am "fix(worker): malformed JSON bodies return 400 via shared parseJsonBody (knowledge-debt)"`

---

### Task 3: Social module skeleton + exact handle lookup

**Files:**
- Create: `worker/src/social/graph.ts` (pure-ish graph helpers)
- Create: `worker/src/social/routes.ts`
- Modify: `worker/src/lib/errors.ts` (add `conflict`)
- Modify: `worker/src/auth/account.ts` (import `conflict` from lib instead of local def)
- Modify: `worker/src/index.ts` (mount routes)
- Test: `worker/test/social-lookup.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// worker/test/social-lookup.test.ts
import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { createTestAccount, issueTestSession } from "./helpers";

function authed(path: string, token: string, init: RequestInit = {}) {
  return SELF.fetch(`https://test.local${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}

describe("GET /social/users/:handle", () => {
  it("requires a session", async () => {
    const res = await SELF.fetch("https://test.local/social/users/somebody");
    expect(res.status).toBe(401);
  });

  it("returns a minimal card for an exact handle match", async () => {
    const me = await createTestAccount();
    const them = await createTestAccount({ handle: "findme" });
    const token = await issueTestSession(me);
    const res = await authed("/social/users/findme", token);
    expect(res.status).toBe(200);
    const card = await res.json() as any;
    expect(card).toEqual({
      id: them.userId, display_name: them.login, handle: "findme", avatar_url: null,
    });
  });

  it("matches case-insensitively (handles are stored lowercase)", async () => {
    await createTestAccount({ handle: "mixedcase" });
    const me = await createTestAccount();
    const token = await issueTestSession(me);
    const res = await authed("/social/users/MixedCase", token);
    expect(res.status).toBe(200);
  });

  it("404s for unknown handles", async () => {
    const me = await createTestAccount();
    const token = await issueTestSession(me);
    const res = await authed("/social/users/nobody-here", token);
    expect(res.status).toBe(404);
  });

  it("404s (indistinguishably) when a block exists in either direction", async () => {
    const me = await createTestAccount();
    const them = await createTestAccount({ handle: "blocked-me" });
    const token = await issueTestSession(me);
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("INSERT INTO blocks (blocker, blocked, created_at) VALUES (?, ?, ?)")
      .bind(them.userId, me.userId, now).run();
    const res = await authed("/social/users/blocked-me", token);
    expect(res.status).toBe(404);
    const missing = await authed("/social/users/nobody-here", token);
    expect(await res.text()).toBe(await missing.text()); // same body — no block-probing oracle
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- social-lookup` → 404 route-not-found on everything (Hono returns 404 for unmounted paths, so the "requires a session" test failing on 404-vs-401 is the signal).

- [ ] **Step 3: Implement graph helpers, routes, mounting**

```ts
// worker/src/social/graph.ts
// Friend-graph primitives shared by routes and the PresenceRoom DO.
// All helpers take D1Database explicitly (same convention as src/db.ts).
import type { D1Database } from "@cloudflare/workers-types";

export interface UserCard {
  id: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
}

/** Canonical (user_low, user_high) ordering for the friendships table. */
export function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function areFriends(db: D1Database, a: string, b: string): Promise<boolean> {
  const [low, high] = pairKey(a, b);
  const row = await db
    .prepare("SELECT 1 AS one FROM friendships WHERE user_low = ? AND user_high = ?")
    .bind(low, high).first();
  return row !== null;
}

/** Block beats friend everywhere — most checks care about either direction. */
export async function isBlockedEitherWay(db: D1Database, a: string, b: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS one FROM blocks WHERE (blocker = ? AND blocked = ?) OR (blocker = ? AND blocked = ?)")
    .bind(a, b, b, a).first();
  return row !== null;
}

export async function loadFriendIds(db: D1Database, userId: string): Promise<string[]> {
  const rows = await db
    .prepare("SELECT user_high AS fid FROM friendships WHERE user_low = ? UNION ALL SELECT user_low AS fid FROM friendships WHERE user_high = ?")
    .bind(userId, userId).all<{ fid: string }>();
  return (rows.results ?? []).map((r) => r.fid);
}

export async function getUserCard(db: D1Database, userId: string): Promise<UserCard | null> {
  return db
    .prepare("SELECT id, display_name, handle, avatar_url FROM users WHERE id = ?")
    .bind(userId).first<UserCard>();
}
```

```ts
// worker/src/social/routes.ts
// Walled social module (spec §2): talks to identity ONLY through requireAuth
// and user ids. Every route is session-gated — there is deliberately no
// unauthenticated handle-probing surface.
import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { requireAuth } from "../auth/middleware";
import { notFound, tooMany } from "../lib/errors";
import { checkRateLimit } from "../lib/rate-limit";
import { isBlockedEitherWay } from "./graph";
import type { UserCard } from "./graph";

export const socialRoutes = new Hono<HonoEnv>();

// Exact-match handle lookup → one minimal card. Prefix/fuzzy search is
// deliberately excluded (user-enumeration surface — spec §2).
socialRoutes.get("/social/users/:handle", requireAuth, async (c) => {
  const me = c.get("userId");
  if (!(await checkRateLimit(`social-lookup:${me}`, 30, 3600))) {
    throw tooMany("too many lookups");
  }
  const handle = c.req.param("handle").toLowerCase();
  const card = await c.env.DB
    .prepare("SELECT id, display_name, handle, avatar_url FROM users WHERE handle = ?")
    .bind(handle).first<UserCard>();
  // A blocked pair looks exactly like a missing handle — no probing oracle.
  if (!card || (await isBlockedEitherWay(c.env.DB, me, card.id))) {
    throw notFound("no user with that handle");
  }
  return c.json(card);
});
```

In `worker/src/lib/errors.ts` add:

```ts
export const conflict = (msg: string) => new HTTPException(409, { message: msg });
```

In `worker/src/auth/account.ts`, delete the local `conflict()` definition and import it from `../lib/errors` instead (behavior identical).

In `worker/src/index.ts`, add alongside the existing imports and route mounts:

```ts
import { socialRoutes } from "./social/routes";
// ...
app.route("/", socialRoutes);
```

- [ ] **Step 4: Run** `npm test -- social-lookup` → PASS; then `npm test` full suite → green.

- [ ] **Step 5: Commit** — `git commit -am "feat(social): module skeleton + session-gated exact handle lookup with block invisibility"`

---

### Task 4: Friend requests (send / list / accept / decline / cancel)

**Files:**
- Modify: `worker/src/social/routes.ts`
- Test: `worker/test/social-requests.test.ts`

Behavior contract (spec §2):
- `POST /social/requests` body `{handle}`: resolve handle → refuse self, refuse blocked-either-way (as 404, same invisibility), no-op if already friends (`{status:"friends"}`), **auto-accept if the target already has a pending request to me** (create friendship + delete both rows atomically → `{status:"friends"}`), no-op if my request is already pending (`{status:"pending"}`), else insert (`{status:"pending"}`). Daily cap 20 (D1 count of my pending requests created in the last 24h — resolved requests vanish from the count; accepted looseness at this scale) plus `checkRateLimit("social-request:<me>", 30, 3600)` for bursts.
- `GET /social/requests` → `{incoming: [{id, from: card, created_at}], outgoing: [{id, to: card, created_at}]}`.
- `POST /social/requests/:id/accept` — recipient only; batch: insert friendship (`INSERT OR IGNORE`) + delete this row + delete any inverse row.
- `POST /social/requests/:id/decline` — recipient only; delete row. Silent (no notification concept exists server-side).
- `DELETE /social/requests/:id` — sender only; delete row.
- Accept/decline/cancel on a nonexistent-or-not-yours id → 404.

- [ ] **Step 1: Write the failing tests**

```ts
// worker/test/social-requests.test.ts
import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { createTestAccount, issueTestSession, type TestAccount } from "./helpers";

function authed(path: string, token: string, init: RequestInit = {}) {
  return SELF.fetch(`https://test.local${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}
async function pair(): Promise<{ a: TestAccount; aTok: string; b: TestAccount; bTok: string }> {
  const a = await createTestAccount({ handle: undefined });
  const b = await createTestAccount({ handle: `bee${Date.now() % 100000}${Math.floor(Math.random() * 1000)}` });
  return { a, aTok: await issueTestSession(a), b, bTok: await issueTestSession(b) };
}
async function handleOf(acct: TestAccount): Promise<string> {
  const row = await env.DB.prepare("SELECT handle FROM users WHERE id = ?").bind(acct.userId).first<{ handle: string }>();
  return row!.handle;
}

describe("friend requests", () => {
  it("send → pending; recipient sees it incoming; sender sees it outgoing", async () => {
    const { a, aTok, b, bTok } = await pair();
    const send = await authed("/social/requests", aTok, { method: "POST", body: JSON.stringify({ handle: await handleOf(b) }) });
    expect(send.status).toBe(200);
    expect(((await send.json()) as any).status).toBe("pending");

    const inc = (await (await authed("/social/requests", bTok)).json()) as any;
    expect(inc.incoming).toHaveLength(1);
    expect(inc.incoming[0].from.id).toBe(a.userId);

    const out = (await (await authed("/social/requests", aTok)).json()) as any;
    expect(out.outgoing).toHaveLength(1);
    expect(out.outgoing[0].to.id).toBe(b.userId);
  });

  it("accept creates the friendship and removes the request", async () => {
    const { a, aTok, b, bTok } = await pair();
    await authed("/social/requests", aTok, { method: "POST", body: JSON.stringify({ handle: await handleOf(b) }) });
    const inc = (await (await authed("/social/requests", bTok)).json()) as any;
    const res = await authed(`/social/requests/${inc.incoming[0].id}/accept`, bTok, { method: "POST" });
    expect(res.status).toBe(200);
    const n = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM friendships WHERE (user_low = ? AND user_high = ?) OR (user_low = ? AND user_high = ?)"
    ).bind(a.userId, b.userId, b.userId, a.userId).first<{ n: number }>();
    expect(n!.n).toBe(1);
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM friend_requests WHERE from_user = ?").bind(a.userId).first<{ n: number }>();
    expect(left!.n).toBe(0);
  });

  it("sending to someone whose request to me is pending auto-accepts", async () => {
    const { a, aTok, b, bTok } = await pair();
    // give A a handle so B can address them
    await env.DB.prepare("UPDATE users SET handle = ? WHERE id = ?").bind(`aye${Date.now() % 100000}`, a.userId).run();
    await authed("/social/requests", aTok, { method: "POST", body: JSON.stringify({ handle: await handleOf(b) }) });
    const res = await authed("/social/requests", bTok, { method: "POST", body: JSON.stringify({ handle: await handleOf(a) }) });
    expect(((await res.json()) as any).status).toBe("friends");
  });

  it("decline (recipient) and cancel (sender) delete the row; wrong party gets 404", async () => {
    const { a, aTok, b, bTok } = await pair();
    await authed("/social/requests", aTok, { method: "POST", body: JSON.stringify({ handle: await handleOf(b) }) });
    const inc = (await (await authed("/social/requests", bTok)).json()) as any;
    const id = inc.incoming[0].id;
    expect((await authed(`/social/requests/${id}/decline`, aTok, { method: "POST" })).status).toBe(404); // sender can't decline
    expect((await authed(`/social/requests/${id}`, bTok, { method: "DELETE" })).status).toBe(404);       // recipient can't cancel
    expect((await authed(`/social/requests/${id}/decline`, bTok, { method: "POST" })).status).toBe(200);
  });

  it("refuses self-requests and duplicates are idempotent", async () => {
    const { a, aTok } = await pair();
    await env.DB.prepare("UPDATE users SET handle = ? WHERE id = ?").bind(`self${Date.now() % 100000}`, a.userId).run();
    const self = await authed("/social/requests", aTok, { method: "POST", body: JSON.stringify({ handle: await handleOf(a) }) });
    expect(self.status).toBe(400);
  });

  it("a block in either direction makes the target look nonexistent", async () => {
    const { a, aTok, b } = await pair();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("INSERT INTO blocks (blocker, blocked, created_at) VALUES (?, ?, ?)").bind(b.userId, a.userId, now).run();
    const res = await authed("/social/requests", aTok, { method: "POST", body: JSON.stringify({ handle: await handleOf(b) }) });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- social-requests`.

- [ ] **Step 3: Implement in `worker/src/social/routes.ts`**

Add imports: `parseJsonBody` from `../lib/parse-json`, `badRequest` from `../lib/errors`, `randomToken` from `../lib/crypto`, `areFriends`, `pairKey`, `getUserCard` from `./graph`.

```ts
const DAILY_REQUEST_CAP = 20; // spec §2: per-user daily cap, D1-count authoritative

socialRoutes.post("/social/requests", requireAuth, async (c) => {
  const me = c.get("userId");
  if (!(await checkRateLimit(`social-request:${me}`, 30, 3600))) throw tooMany("too many friend requests");
  const body = await parseJsonBody<{ handle?: string }>(c);
  const handle = body.handle?.trim().toLowerCase();
  if (!handle) throw badRequest("handle is required");

  const target = await c.env.DB
    .prepare("SELECT id FROM users WHERE handle = ?").bind(handle).first<{ id: string }>();
  // Blocked pairs are indistinguishable from missing handles — same as lookup.
  if (!target || (await isBlockedEitherWay(c.env.DB, me, target.id))) throw notFound("no user with that handle");
  if (target.id === me) throw badRequest("that's you");
  if (await areFriends(c.env.DB, me, target.id)) return c.json({ status: "friends" });

  const now = Math.floor(Date.now() / 1000);

  // Mutual intent: their pending request to me == acceptance (spec §2).
  const inverse = await c.env.DB
    .prepare("SELECT id FROM friend_requests WHERE from_user = ? AND to_user = ?")
    .bind(target.id, me).first<{ id: string }>();
  if (inverse) {
    const [low, high] = pairKey(me, target.id);
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT OR IGNORE INTO friendships (user_low, user_high, created_at) VALUES (?, ?, ?)").bind(low, high, now),
      c.env.DB.prepare("DELETE FROM friend_requests WHERE id = ?").bind(inverse.id),
    ]);
    await pokeAfter(c, [me, target.id]); // defined in Task 7; until then omit this line
    return c.json({ status: "friends" });
  }

  const dup = await c.env.DB
    .prepare("SELECT id FROM friend_requests WHERE from_user = ? AND to_user = ?")
    .bind(me, target.id).first<{ id: string }>();
  if (dup) return c.json({ status: "pending" });

  // Daily cap on pending-request creation. Resolved requests vanish from this
  // count — accepted looseness at current scale (spec §2: "simple D1 counts").
  const sentToday = await c.env.DB
    .prepare("SELECT COUNT(*) AS n FROM friend_requests WHERE from_user = ? AND created_at > ?")
    .bind(me, now - 86400).first<{ n: number }>();
  if ((sentToday?.n ?? 0) >= DAILY_REQUEST_CAP) throw tooMany("daily friend-request limit reached");

  await c.env.DB
    .prepare("INSERT INTO friend_requests (id, from_user, to_user, created_at) VALUES (?, ?, ?, ?)")
    .bind("freq_" + randomToken(16), me, target.id, now).run();
  return c.json({ status: "pending" });
});

socialRoutes.get("/social/requests", requireAuth, async (c) => {
  const me = c.get("userId");
  const incoming = await c.env.DB.prepare(
    `SELECT r.id, r.created_at, u.id AS uid, u.display_name, u.handle, u.avatar_url
     FROM friend_requests r JOIN users u ON u.id = r.from_user
     WHERE r.to_user = ? ORDER BY r.created_at DESC`
  ).bind(me).all<{ id: string; created_at: number; uid: string; display_name: string; handle: string | null; avatar_url: string | null }>();
  const outgoing = await c.env.DB.prepare(
    `SELECT r.id, r.created_at, u.id AS uid, u.display_name, u.handle, u.avatar_url
     FROM friend_requests r JOIN users u ON u.id = r.to_user
     WHERE r.from_user = ? ORDER BY r.created_at DESC`
  ).bind(me).all<{ id: string; created_at: number; uid: string; display_name: string; handle: string | null; avatar_url: string | null }>();
  const card = (r: any) => ({ id: r.uid, display_name: r.display_name, handle: r.handle, avatar_url: r.avatar_url });
  return c.json({
    incoming: (incoming.results ?? []).map((r) => ({ id: r.id, from: card(r), created_at: r.created_at })),
    outgoing: (outgoing.results ?? []).map((r) => ({ id: r.id, to: card(r), created_at: r.created_at })),
  });
});

socialRoutes.post("/social/requests/:id/accept", requireAuth, async (c) => {
  const me = c.get("userId");
  const req = await c.env.DB
    .prepare("SELECT id, from_user, to_user FROM friend_requests WHERE id = ? AND to_user = ?")
    .bind(c.req.param("id"), me).first<{ id: string; from_user: string; to_user: string }>();
  if (!req) throw notFound("no such request");
  const now = Math.floor(Date.now() / 1000);
  const [low, high] = pairKey(req.from_user, req.to_user);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR IGNORE INTO friendships (user_low, user_high, created_at) VALUES (?, ?, ?)").bind(low, high, now),
    c.env.DB.prepare("DELETE FROM friend_requests WHERE id = ?").bind(req.id),
    // Clear any inverse pending row so the pair is fully settled.
    c.env.DB.prepare("DELETE FROM friend_requests WHERE from_user = ? AND to_user = ?").bind(req.to_user, req.from_user),
  ]);
  await pokeAfter(c, [req.from_user, req.to_user]); // Task 7; omit until then
  return c.json({ ok: true });
});

socialRoutes.post("/social/requests/:id/decline", requireAuth, async (c) => {
  const me = c.get("userId");
  const res = await c.env.DB
    .prepare("DELETE FROM friend_requests WHERE id = ? AND to_user = ?")
    .bind(c.req.param("id"), me).run();
  if (res.meta.changes === 0) throw notFound("no such request");
  return c.json({ ok: true }); // silent — sender is never notified (spec §2)
});

socialRoutes.delete("/social/requests/:id", requireAuth, async (c) => {
  const me = c.get("userId");
  const res = await c.env.DB
    .prepare("DELETE FROM friend_requests WHERE id = ? AND from_user = ?")
    .bind(c.req.param("id"), me).run();
  if (res.meta.changes === 0) throw notFound("no such request");
  return c.json({ ok: true });
});
```

**Note:** the two `pokeAfter(...)` calls belong to Task 7 (presence invalidation). In this task, omit those lines — Task 7 adds them. They're shown here so the final shape is unambiguous.

- [ ] **Step 4: Run** `npm test -- social-requests` → PASS; full suite green.

- [ ] **Step 5: Commit** — `git commit -am "feat(social): friend requests — send/list/accept/decline/cancel with auto-accept and caps"`

---

### Task 5: Friends list + unfriend

**Files:**
- Modify: `worker/src/social/routes.ts`
- Test: `worker/test/social-friends.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// worker/test/social-friends.test.ts
import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { createTestAccount, issueTestSession } from "./helpers";

function authed(path: string, token: string, init: RequestInit = {}) {
  return SELF.fetch(`https://test.local${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}
async function befriend(aId: string, bId: string) {
  const [low, high] = aId < bId ? [aId, bId] : [bId, aId];
  await env.DB.prepare("INSERT INTO friendships (user_low, user_high, created_at) VALUES (?, ?, ?)")
    .bind(low, high, Math.floor(Date.now() / 1000)).run();
}

describe("friends list + unfriend", () => {
  it("lists friends with cards and last_seen_at", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount({ handle: `pal${Date.now() % 100000}` });
    await befriend(a.userId, b.userId);
    await env.DB.prepare("UPDATE users SET last_seen_at = 1751900000 WHERE id = ?").bind(b.userId).run();
    const token = await issueTestSession(a);
    const res = await authed("/social/friends", token);
    expect(res.status).toBe(200);
    const list = (await res.json()) as any[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: b.userId, display_name: b.login, last_seen_at: 1751900000 });
  });

  it("unfriend removes the row regardless of pair order and is silent", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await befriend(a.userId, b.userId);
    const token = await issueTestSession(a);
    const res = await authed(`/social/friends/${b.userId}`, token, { method: "DELETE" });
    expect(res.status).toBe(200);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM friendships").first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it("unfriending a non-friend 404s", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const token = await issueTestSession(a);
    const res = await authed(`/social/friends/${b.userId}`, token, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- social-friends`.

- [ ] **Step 3: Implement in `worker/src/social/routes.ts`**

```ts
socialRoutes.get("/social/friends", requireAuth, async (c) => {
  const me = c.get("userId");
  // Both directions of the canonical pair, joined to cards + last_seen_at
  // (the ONLY persisted presence fact — spec §5).
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.display_name, u.handle, u.avatar_url, u.last_seen_at, f.created_at
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.user_low = ?1 THEN f.user_high ELSE f.user_low END
     WHERE f.user_low = ?1 OR f.user_high = ?1
     ORDER BY u.display_name COLLATE NOCASE`
  ).bind(me).all();
  return c.json(rows.results ?? []);
});

socialRoutes.delete("/social/friends/:userId", requireAuth, async (c) => {
  const me = c.get("userId");
  const other = c.req.param("userId");
  const [low, high] = pairKey(me, other);
  const res = await c.env.DB
    .prepare("DELETE FROM friendships WHERE user_low = ? AND user_high = ?")
    .bind(low, high).run();
  if (res.meta.changes === 0) throw notFound("not friends");
  await pokeAfter(c, [me, other]); // Task 7; omit until then
  return c.json({ ok: true }); // silent (spec §2)
});
```

(D1 supports `?1` numbered placeholders; the single `.bind(me)` covers all three uses. If the toolchain rejects it, fall back to three `?` + `.bind(me, me, me)`.)

- [ ] **Step 4: Run** `npm test -- social-friends` → PASS; full suite green.

- [ ] **Step 5: Commit** — `git commit -am "feat(social): friends list with last_seen_at + silent unfriend"`

---

### Task 6: Blocks (block / unblock / list) with severing

**Files:**
- Modify: `worker/src/social/routes.ts`
- Test: `worker/test/social-blocks.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// worker/test/social-blocks.test.ts
import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { createTestAccount, issueTestSession } from "./helpers";

function authed(path: string, token: string, init: RequestInit = {}) {
  return SELF.fetch(`https://test.local${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}

describe("blocks", () => {
  it("blocking severs the friendship and pending requests both ways", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const now = Math.floor(Date.now() / 1000);
    const [low, high] = a.userId < b.userId ? [a.userId, b.userId] : [b.userId, a.userId];
    await env.DB.batch([
      env.DB.prepare("INSERT INTO friendships (user_low, user_high, created_at) VALUES (?, ?, ?)").bind(low, high, now),
      env.DB.prepare("INSERT INTO friend_requests (id, from_user, to_user, created_at) VALUES ('freq_x1', ?, ?, ?)").bind(b.userId, a.userId, now),
    ]);
    const token = await issueTestSession(a);
    const res = await authed("/social/blocks", token, { method: "POST", body: JSON.stringify({ user_id: b.userId }) });
    expect(res.status).toBe(200);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM friendships").first<{ n: number }>())!.n).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM friend_requests").first<{ n: number }>())!.n).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM blocks WHERE blocker = ?").bind(a.userId).first<{ n: number }>())!.n).toBe(1);
  });

  it("list shows only my own blocks, as cards; unblock removes", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount({ handle: `bad${Date.now() % 100000}` });
    const token = await issueTestSession(a);
    await authed("/social/blocks", token, { method: "POST", body: JSON.stringify({ user_id: b.userId }) });
    const list = (await (await authed("/social/blocks", token)).json()) as any[];
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(b.userId);
    const un = await authed(`/social/blocks/${b.userId}`, token, { method: "DELETE" });
    expect(un.status).toBe(200);
    expect((await (await authed("/social/blocks", token)).json()) as any[]).toHaveLength(0);
  });

  it("blocking yourself or a nonexistent user 400s/404s; double-block is idempotent", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const token = await issueTestSession(a);
    expect((await authed("/social/blocks", token, { method: "POST", body: JSON.stringify({ user_id: a.userId }) })).status).toBe(400);
    expect((await authed("/social/blocks", token, { method: "POST", body: JSON.stringify({ user_id: "acct_nope" }) })).status).toBe(404);
    await authed("/social/blocks", token, { method: "POST", body: JSON.stringify({ user_id: b.userId }) });
    expect((await authed("/social/blocks", token, { method: "POST", body: JSON.stringify({ user_id: b.userId }) })).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -- social-blocks`.

- [ ] **Step 3: Implement in `worker/src/social/routes.ts`**

```ts
socialRoutes.post("/social/blocks", requireAuth, async (c) => {
  const me = c.get("userId");
  const body = await parseJsonBody<{ user_id?: string }>(c);
  const target = body.user_id;
  if (!target) throw badRequest("user_id is required");
  if (target === me) throw badRequest("you can't block yourself");
  const exists = await c.env.DB.prepare("SELECT 1 AS one FROM users WHERE id = ?").bind(target).first();
  if (!exists) throw notFound("no such user");
  const now = Math.floor(Date.now() / 1000);
  const [low, high] = pairKey(me, target);
  // Block beats friend everywhere (spec §2): one atomic batch severs the
  // friendship, clears pending requests both ways, and records the block.
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR IGNORE INTO blocks (blocker, blocked, created_at) VALUES (?, ?, ?)").bind(me, target, now),
    c.env.DB.prepare("DELETE FROM friendships WHERE user_low = ? AND user_high = ?").bind(low, high),
    c.env.DB.prepare("DELETE FROM friend_requests WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)")
      .bind(me, target, target, me),
  ]);
  await pokeAfter(c, [me, target]); // Task 7; omit until then
  return c.json({ ok: true });
});

socialRoutes.delete("/social/blocks/:userId", requireAuth, async (c) => {
  const me = c.get("userId");
  const res = await c.env.DB
    .prepare("DELETE FROM blocks WHERE blocker = ? AND blocked = ?")
    .bind(me, c.req.param("userId")).run();
  if (res.meta.changes === 0) throw notFound("not blocked");
  return c.json({ ok: true });
});

socialRoutes.get("/social/blocks", requireAuth, async (c) => {
  const me = c.get("userId");
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.display_name, u.handle, u.avatar_url, b.created_at
     FROM blocks b JOIN users u ON u.id = b.blocked
     WHERE b.blocker = ? ORDER BY b.created_at DESC`
  ).bind(me).all();
  return c.json(rows.results ?? []); // visible only to its owner (spec §2)
});
```

- [ ] **Step 4: Run** `npm test -- social-blocks` → PASS; full suite green.

- [ ] **Step 5: Commit** — `git commit -am "feat(social): blocks — severing block/unblock/list, owner-visible only"`

---

### Task 7: `PresenceRoom` Durable Object + `/social/presence` upgrade route + pokes

The heart of Phase 2. Friends-only presence fan-out, challenge relay, `last_seen_at` writes. Spec §3.

**Files:**
- Create: `worker/src/social/presence-room.ts`
- Modify: `worker/src/social/routes.ts` (upgrade route + `pokeAfter` helper + wire the pokes left out of Tasks 4–6)
- Modify: `worker/src/types.ts` (add `PRESENCE` binding)
- Modify: `worker/src/index.ts` (export the DO class)
- Modify: `worker/wrangler.toml` (DO binding + migrations, mirrored under `[env.test]`)
- Test: `worker/test/presence.test.ts`

**Protocol (client ↔ DO), all JSON text frames.** Server→client:

| type | payload |
|---|---|
| `presence` | `{ users: [{id, display_name, handle, status}] }` — full snapshot of ONLINE FRIENDS (sent on connect and after any visibility-changing poke) |
| `user-joined` | `{ user: {id, display_name, handle, status} }` — a friend came online (their first connection) |
| `user-left` | `{ id }` — a friend's last connection closed |
| `user-status` | `{ id, status }` |
| `challenge` | `{ from: {id, display_name, handle}, gameType, code }` |
| `challenge-response` | `{ from: {id, display_name, handle}, accept }` (`from` = the responder) |
| `challenge-failed` | `{ target }` (target account id; sent when target offline or not a friend) |
| `pong` | `{}` |

Client→server: `ping` · `status {status: 'idle'|'in-game'}` · `challenge {target, gameType, code}` · `challenge-response {to, accept}` (`to` = the original challenger's id).

- [ ] **Step 1: Config + types first (the DO must exist for tests to run at all)**

`worker/wrangler.toml` — add after the `[[analytics_engine_datasets]]` block:

```toml
[durable_objects]
bindings = [{ name = "PRESENCE", class_name = "PresenceRoom" }]

# DO class registration — required once per new class. SQLite-backed
# (new_sqlite_classes) works on both free and paid plans.
[[migrations]]
tag = "v1"
new_sqlite_classes = ["PresenceRoom"]
```

And under the `[env.test]` section (env config is NOT inherited — mirror it):

```toml
[env.test.durable_objects]
bindings = [{ name = "PRESENCE", class_name = "PresenceRoom" }]
```

`worker/src/types.ts` — add to `Env`:

```ts
  PRESENCE: DurableObjectNamespace;
```

`worker/src/index.ts` — add near the top-level exports:

```ts
export { PresenceRoom } from "./social/presence-room";
```

`worker/test/env.d.ts` — add `PRESENCE: DurableObjectNamespace;` to `ProvidedEnv` if the file lists bindings individually.

- [ ] **Step 2: Write the failing tests**

vitest-pool-workers supports WebSocket upgrades through `SELF.fetch` — the response carries `res.webSocket`, which the test `accept()`s.

```ts
// worker/test/presence.test.ts
import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { createTestAccount, issueTestSession, type TestAccount } from "./helpers";

async function connect(token: string): Promise<WebSocket> {
  const res = await SELF.fetch("https://test.local/social/presence", {
    headers: { Upgrade: "websocket", Authorization: `Bearer ${token}` },
  });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  return ws;
}
function nextMessage(ws: WebSocket, type: string, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), timeoutMs);
    const handler = (ev: MessageEvent) => {
      const data = JSON.parse(ev.data as string);
      if (data.type === type) { clearTimeout(timer); ws.removeEventListener("message", handler); resolve(data); }
    };
    ws.addEventListener("message", handler);
  });
}
async function befriend(aId: string, bId: string) {
  const [low, high] = aId < bId ? [aId, bId] : [bId, aId];
  await env.DB.prepare("INSERT INTO friendships (user_low, user_high, created_at) VALUES (?, ?, ?)")
    .bind(low, high, Math.floor(Date.now() / 1000)).run();
}

describe("PresenceRoom", () => {
  it("rejects unauthenticated upgrades", async () => {
    const res = await SELF.fetch("https://test.local/social/presence", { headers: { Upgrade: "websocket" } });
    expect(res.status).toBe(401);
  });

  it("friends see each other; strangers are mutually invisible", async () => {
    const a = await createTestAccount({ handle: `pa${Date.now() % 100000}` });
    const b = await createTestAccount({ handle: `pb${Date.now() % 100000}` });
    const s = await createTestAccount(); // stranger
    await befriend(a.userId, b.userId);
    const wsA = await connect(await issueTestSession(a));
    const snapA = await nextMessage(wsA, "presence");
    expect(snapA.users).toEqual([]); // nobody online yet

    const joinedPromise = nextMessage(wsA, "user-joined");
    const wsB = await connect(await issueTestSession(b));
    const snapB = await nextMessage(wsB, "presence");
    expect(snapB.users.map((u: any) => u.id)).toEqual([a.userId]); // B sees online friend A
    expect((await joinedPromise).user.id).toBe(b.userId);          // A is told B joined

    const wsS = await connect(await issueTestSession(s));
    const snapS = await nextMessage(wsS, "presence");
    expect(snapS.users).toEqual([]); // stranger sees no one
    wsA.close(); wsB.close(); wsS.close();
  });

  it("relays challenges between friends only", async () => {
    const a = await createTestAccount({ handle: `ca${Date.now() % 100000}` });
    const b = await createTestAccount({ handle: `cb${Date.now() % 100000}` });
    const s = await createTestAccount();
    await befriend(a.userId, b.userId);
    const wsA = await connect(await issueTestSession(a));
    await nextMessage(wsA, "presence");
    const wsB = await connect(await issueTestSession(b));
    await nextMessage(wsB, "presence");

    const challengeAtB = nextMessage(wsB, "challenge");
    wsA.send(JSON.stringify({ type: "challenge", target: b.userId, gameType: "connect-four", code: "ABC123" }));
    const ch = await challengeAtB;
    expect(ch.from.id).toBe(a.userId);
    expect(ch.code).toBe("ABC123");

    // Non-friend target → challenge-failed back to sender
    const failed = nextMessage(wsA, "challenge-failed");
    wsA.send(JSON.stringify({ type: "challenge", target: s.userId, gameType: "connect-four", code: "XYZ789" }));
    expect((await failed).target).toBe(s.userId);
    wsA.close(); wsB.close();
  });

  it("last disconnect writes last_seen_at and notifies online friends", async () => {
    const a = await createTestAccount({ handle: `la${Date.now() % 100000}` });
    const b = await createTestAccount({ handle: `lb${Date.now() % 100000}` });
    await befriend(a.userId, b.userId);
    const wsA = await connect(await issueTestSession(a));
    await nextMessage(wsA, "presence");
    const wsB = await connect(await issueTestSession(b));
    await nextMessage(wsB, "presence");
    const leftPromise = nextMessage(wsA, "user-left");
    wsB.close(1000, "bye");
    expect((await leftPromise).id).toBe(b.userId);
    // last_seen_at written (eventually consistent within the close handler)
    const row = await env.DB.prepare("SELECT last_seen_at FROM users WHERE id = ?").bind(b.userId).first<{ last_seen_at: number | null }>();
    expect(row!.last_seen_at).not.toBeNull();
    wsA.close();
  });

  it("a block poke makes both sides disappear from each other's presence", async () => {
    const a = await createTestAccount({ handle: `ba${Date.now() % 100000}` });
    const b = await createTestAccount({ handle: `bb${Date.now() % 100000}` });
    await befriend(a.userId, b.userId);
    const tokenA = await issueTestSession(a);
    const wsA = await connect(tokenA);
    await nextMessage(wsA, "presence");
    const wsB = await connect(await issueTestSession(b));
    await nextMessage(wsB, "presence");

    const refreshedA = nextMessage(wsA, "presence"); // poke → fresh snapshot
    const res = await SELF.fetch("https://test.local/social/blocks", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: b.userId }),
    });
    expect(res.status).toBe(200);
    expect((await refreshedA).users).toEqual([]); // B gone from A's view
    wsA.close(); wsB.close();
  });
});
```

- [ ] **Step 3: Run, expect FAIL** — `npm test -- presence` (route missing → 404s; class missing → config errors surface here too).

- [ ] **Step 4: Implement the DO**

```ts
// worker/src/social/presence-room.ts
// Friends-only presence + challenge relay (spec §3). Single global instance
// (idFromName("global")) — same scale class as the PartyKit room it replaces.
//
// Uses the WebSocket HIBERNATION API: per-connection identity lives in the
// socket attachment ({userId, card, status}) and connections are tagged with
// the userId, so both survive DO hibernation. The friend cache is an in-memory
// optimization only — it is reloaded from D1 on demand after a wake-up.
//
// PRIVACY INVARIANT (spec §5): the ONLY thing this class ever persists is
// users.last_seen_at (one timestamp). No presence history, logs, or durations.
import type { Env } from "../types";
import { loadFriendIds, getUserCard, type UserCard } from "./graph";

type Status = "idle" | "in-game";
interface Attachment { userId: string; card: UserCard; status: Status; }

const LAST_SEEN_REFRESH_MS = 5 * 60 * 1000; // coarse refresh so a crashed client doesn't freeze last_seen

export class PresenceRoom {
  private friendCache = new Map<string, Set<string>>();

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal poke from friend-mutation routes: refresh caches + re-snapshot.
    if (url.pathname === "/invalidate" && request.method === "POST") {
      const { user_ids } = await request.json<{ user_ids: string[] }>();
      for (const id of user_ids) {
        this.friendCache.delete(id);
        if (this.socketsFor(id).length > 0) {
          await this.sendSnapshot(id);
        }
      }
      return new Response(null, { status: 204 });
    }

    // WebSocket connect — the worker route has already authenticated the
    // session and passes the account id via internal header.
    const userId = request.headers.get("X-Presence-User");
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket" || !userId) {
      return new Response("bad request", { status: 400 });
    }
    const card = await getUserCard(this.env.DB, userId);
    if (!card) return new Response("no such user", { status: 404 });

    const wasOnline = this.socketsFor(userId).length > 0;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.state.acceptWebSocket(server, [userId]); // tag = account id (multi-device: N sockets, one tag)
    server.serializeAttachment({ userId, card, status: "idle" } satisfies Attachment);

    await this.sendSnapshot(userId, server);
    if (!wasOnline) {
      // First connection for this account → tell online friends (spec §3 multi-device rule)
      await this.broadcastToFriends(userId, { type: "user-joined", user: { ...card, status: "idle" } });
    }
    // Keep a coarse last_seen alarm running while anyone is connected.
    if ((await this.state.storage.getAlarm()) === null) {
      await this.state.storage.setAlarm(Date.now() + LAST_SEEN_REFRESH_MS);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    let data: any;
    try { data = JSON.parse(message); } catch { return; }
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;

    switch (data.type) {
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      case "status": {
        const status: Status = data.status === "in-game" ? "in-game" : "idle";
        // Status is per-account: stamp every connection's attachment so any
        // socket's view is current after hibernation.
        for (const sock of this.socketsFor(att.userId)) {
          const a = sock.deserializeAttachment() as Attachment;
          sock.serializeAttachment({ ...a, status });
        }
        await this.broadcastToFriends(att.userId, { type: "user-status", id: att.userId, status });
        break;
      }
      case "challenge": {
        const target = String(data.target ?? "");
        // Friends-only relay (spec §3). Blocks always sever friendships, so
        // the friendship check also covers blocks (pokes keep the cache fresh).
        if (!(await this.isFriend(att.userId, target))) {
          ws.send(JSON.stringify({ type: "challenge-failed", target }));
          break;
        }
        const conns = this.socketsFor(target);
        if (conns.length === 0) {
          ws.send(JSON.stringify({ type: "challenge-failed", target }));
          break;
        }
        const msg = JSON.stringify({ type: "challenge", from: att.card, gameType: data.gameType, code: data.code });
        for (const conn of conns) conn.send(msg);
        break;
      }
      case "challenge-response": {
        const to = String(data.to ?? "");
        if (!(await this.isFriend(att.userId, to))) break;
        const msg = JSON.stringify({ type: "challenge-response", from: att.card, accept: Boolean(data.accept) });
        for (const conn of this.socketsFor(to)) conn.send(msg);
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;
    // getWebSockets still includes the closing socket in some runtimes — count others.
    const remaining = this.socketsFor(att.userId).filter((s) => s !== ws);
    if (remaining.length === 0) {
      await this.writeLastSeen([att.userId]);
      await this.broadcastToFriends(att.userId, { type: "user-left", id: att.userId });
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  async alarm(): Promise<void> {
    // Coarse ~5-minute last_seen refresh for everyone connected (spec §3).
    const online = new Set<string>();
    for (const sock of this.state.getWebSockets()) {
      const att = sock.deserializeAttachment() as Attachment | null;
      if (att) online.add(att.userId);
    }
    if (online.size > 0) {
      await this.writeLastSeen([...online]);
      await this.state.storage.setAlarm(Date.now() + LAST_SEEN_REFRESH_MS);
    }
    // No sockets → no reschedule; the next connect re-arms it.
  }

  // ---- internals ----

  private socketsFor(userId: string): WebSocket[] {
    return this.state.getWebSockets(userId);
  }

  private async friendsOf(userId: string): Promise<Set<string>> {
    let cached = this.friendCache.get(userId);
    if (!cached) {
      cached = new Set(await loadFriendIds(this.env.DB, userId));
      this.friendCache.set(userId, cached);
    }
    return cached;
  }

  private async isFriend(a: string, b: string): Promise<boolean> {
    return (await this.friendsOf(a)).has(b);
  }

  /** Full online-friends snapshot to one user (all their sockets, or one specific socket). */
  private async sendSnapshot(userId: string, only?: WebSocket): Promise<void> {
    const friends = await this.friendsOf(userId);
    const users: Array<UserCard & { status: Status }> = [];
    const seen = new Set<string>();
    for (const fid of friends) {
      const conns = this.socketsFor(fid);
      if (conns.length === 0 || seen.has(fid)) continue;
      seen.add(fid);
      const att = conns[0].deserializeAttachment() as Attachment;
      users.push({ ...att.card, status: att.status });
    }
    const msg = JSON.stringify({ type: "presence", users });
    for (const sock of only ? [only] : this.socketsFor(userId)) sock.send(msg);
  }

  /** Send an event to every ONLINE friend of userId (never to strangers). */
  private async broadcastToFriends(userId: string, event: Record<string, unknown>): Promise<void> {
    const friends = await this.friendsOf(userId);
    const msg = JSON.stringify(event);
    for (const fid of friends) {
      for (const sock of this.socketsFor(fid)) sock.send(msg);
    }
  }

  private async writeLastSeen(userIds: string[]): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.env.DB.batch(
      userIds.map((id) => this.env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").bind(now, id))
    );
  }
}
```

- [ ] **Step 5: Implement the upgrade route + `pokeAfter`, and wire the pokes into Tasks 4–6's routes**

In `worker/src/social/routes.ts` add:

```ts
import type { Context } from "hono";

// Fire-and-forget presence-cache invalidation. waitUntil so a DO hiccup can
// never fail the HTTP mutation that triggered it.
async function pokePresence(env: HonoEnv["Bindings"], userIds: string[]): Promise<void> {
  const stub = env.PRESENCE.get(env.PRESENCE.idFromName("global"));
  await stub.fetch("https://presence.internal/invalidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_ids: userIds }),
  });
}
function pokeAfter(c: Context<HonoEnv>, userIds: string[]): Promise<void> {
  c.executionCtx.waitUntil(pokePresence(c.env, userIds).catch(() => {}));
  return Promise.resolve();
}

// Authenticated WebSocket upgrade → forward to the single global PresenceRoom.
// No ?username= trust (spec §3) — identity comes from the session token; the
// DO receives the resolved account id via an internal header.
socialRoutes.get("/social/presence", requireAuth, async (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    throw badRequest("expected a websocket upgrade");
  }
  const stub = c.env.PRESENCE.get(c.env.PRESENCE.idFromName("global"));
  const fwd = new Request("https://presence.internal/connect", c.req.raw);
  fwd.headers.set("X-Presence-User", c.get("userId"));
  return stub.fetch(fwd);
});
```

Then add the `await pokeAfter(c, [...])` calls exactly where Tasks 4–6's code listings show them (accept, auto-accept, unfriend, block). NOTE for the block test: the poke must complete before the route responds in the test environment — `waitUntil` promises are flushed by vitest-pool-workers before assertions on subsequent awaits; if the "block poke" test proves flaky on timing, change `pokeAfter` to `await pokePresence(...)` directly inside the block/accept routes (small latency cost, deterministic ordering) and keep `waitUntil` off. Prefer the awaited form if in doubt — correctness over micro-latency.

- [ ] **Step 6: Run** `npm test -- presence` → PASS. Then the FULL suite → green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(social): PresenceRoom DO — friends-only presence, challenge relay, last_seen_at, mutation pokes"
```

---

### Task 8: `GET /auth/export` (data export, spec §5)

**Files:**
- Modify: `worker/src/auth/account.ts`
- Test: `worker/test/export.test.ts`

**Privacy rule baked into the shape:** the export includes blocks the user MADE, never rows where the user IS blocked (that would reveal who blocked them). Sessions are exported as timestamps only (never token hashes).

- [ ] **Step 1: Write the failing test**

```ts
// worker/test/export.test.ts
import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { createTestAccount, issueTestSession } from "./helpers";

describe("GET /auth/export", () => {
  it("returns every owner-visible row and nothing else", async () => {
    const me = await createTestAccount({ handle: `ex${Date.now() % 100000}` });
    const friend = await createTestAccount();
    const blockedByMe = await createTestAccount();
    const blockerOfMe = await createTestAccount();
    const now = Math.floor(Date.now() / 1000);
    const [low, high] = me.userId < friend.userId ? [me.userId, friend.userId] : [friend.userId, me.userId];
    await env.DB.batch([
      env.DB.prepare("INSERT INTO friendships (user_low, user_high, created_at) VALUES (?, ?, ?)").bind(low, high, now),
      env.DB.prepare("INSERT INTO blocks (blocker, blocked, created_at) VALUES (?, ?, ?)").bind(me.userId, blockedByMe.userId, now),
      env.DB.prepare("INSERT INTO blocks (blocker, blocked, created_at) VALUES (?, ?, ?)").bind(blockerOfMe.userId, me.userId, now),
      env.DB.prepare("INSERT INTO installs (user_id, plugin_id, created_at) VALUES (?, 'test-plugin', ?)").bind(me.userId, now),
    ]);
    const token = await issueTestSession(me);
    const res = await SELF.fetch("https://test.local/auth/export", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.account.id).toBe(me.userId);
    expect(data.identities).toHaveLength(1);
    expect(data.friendships).toHaveLength(1);
    expect(data.blocks).toHaveLength(1);
    expect(data.blocks[0].blocked).toBe(blockedByMe.userId);
    // NEVER exposes who blocked me
    expect(JSON.stringify(data)).not.toContain(blockerOfMe.userId);
    expect(data.installs).toHaveLength(1);
    // sessions carry timestamps only, no token material
    expect(JSON.stringify(data.sessions)).not.toContain("token");
  });
});
```

**Note:** verify the `installs` INSERT column list against migration 0003 before running (columns may include more than `(user_id, plugin_id, created_at)` — read `0003_accounts_identity.sql` and adjust the test fixture to the real shape).

- [ ] **Step 2: Run, expect FAIL** — `npm test -- export` → 404.

- [ ] **Step 3: Implement in `worker/src/auth/account.ts`**

```ts
// Data export (spec §5): one JSON of every row referencing the account that
// the OWNER is allowed to see. Deliberate exclusions: rows where this user is
// the BLOCKED party (would reveal who blocked them) and session token hashes.
accountRoutes.get("/auth/export", requireAuth, async (c) => {
  const userId = c.get("userId");
  if (!(await checkRateLimit(`export:${userId}`, 5, 3600))) throw tooMany("too many export requests");
  const db = c.env.DB;
  const all = <T>(r: { results?: T[] }) => r.results ?? [];
  const [account, identities, sessions, installs, ratings, themeLikes, reports, friendships, requestsIn, requestsOut, blocks] = await Promise.all([
    db.prepare("SELECT id, display_name, avatar_url, handle, status, created_at, last_seen_at FROM users WHERE id = ?").bind(userId).first(),
    db.prepare("SELECT provider, provider_user_id, provider_login, linked_at FROM identities WHERE user_id = ?").bind(userId).all(),
    db.prepare("SELECT created_at, last_used_at FROM sessions WHERE user_id = ?").bind(userId).all(),
    db.prepare("SELECT * FROM installs WHERE user_id = ?").bind(userId).all(),
    db.prepare("SELECT * FROM ratings WHERE user_id = ?").bind(userId).all(),
    db.prepare("SELECT * FROM theme_likes WHERE user_id = ?").bind(userId).all(),
    db.prepare("SELECT * FROM reports WHERE reporter_user_id = ?").bind(userId).all(),
    db.prepare("SELECT user_low, user_high, created_at FROM friendships WHERE user_low = ? OR user_high = ?").bind(userId, userId).all(),
    db.prepare("SELECT id, from_user, created_at FROM friend_requests WHERE to_user = ?").bind(userId).all(),
    db.prepare("SELECT id, to_user, created_at FROM friend_requests WHERE from_user = ?").bind(userId).all(),
    db.prepare("SELECT blocked, created_at FROM blocks WHERE blocker = ?").bind(userId).all(),
  ]);
  return c.json({
    exported_at: Math.floor(Date.now() / 1000),
    account,
    identities: all(identities),
    sessions: all(sessions),
    installs: all(installs),
    ratings: all(ratings),
    theme_likes: all(themeLikes),
    reports: all(reports),
    friendships: all(friendships),
    friend_requests: { incoming: all(requestsIn), outgoing: all(requestsOut) },
    blocks: all(blocks),
  });
});
```

(Import `checkRateLimit` and `tooMany` at the top of the file if not already present.)

- [ ] **Step 4: Run** `npm test -- export` → PASS; full suite green.

- [ ] **Step 5: Commit** — `git commit -am "feat(auth): GET /auth/export — owner-visible data export"`

---

### Task 9: Maintenance batch + stale-request prune + atomic handle claim with self-reclaim (knowledge-debt #2, #3 + Destin 2026-07-08)

**Files:**
- Modify: `worker/src/maintenance.ts`
- Modify: `worker/src/auth/account.ts` (PUT /auth/handle)
- Test: extend `worker/test/maintenance.test.ts` (or create if the current pruning tests live elsewhere — grep `pruneExpired` in `test/` first and extend the existing file)

- [ ] **Step 1: Write the failing tests**

```ts
// append to the existing pruneExpired test file (grep test/ for it)
it("prunes friend requests older than 90 days", async () => {
  const a = await createTestAccount();
  const b = await createTestAccount();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO friend_requests (id, from_user, to_user, created_at) VALUES ('freq_old', ?, ?, ?)").bind(a.userId, b.userId, now - 91 * 24 * 3600),
    env.DB.prepare("INSERT INTO friend_requests (id, from_user, to_user, created_at) VALUES ('freq_new', ?, ?, ?)").bind(b.userId, a.userId, now - 1000),
  ]);
  await pruneExpired(env.DB, now);
  const rows = await env.DB.prepare("SELECT id FROM friend_requests").all<{ id: string }>();
  expect((rows.results ?? []).map((r) => r.id)).toEqual(["freq_new"]);
});
```

And for the atomic handle claim (in `test/account.test.ts` or a new block):

```ts
it("a handle inserted into cooldown between check and claim still cannot be taken (atomic claim)", async () => {
  // Direct simulation: cooldown row exists at claim time → the conditional
  // UPDATE writes nothing and the route 409s.
  const me = await createTestAccount();
  const token = await issueTestSession(me);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT INTO handle_releases (handle, released_at) VALUES ('sniped', ?)").bind(now).run();
  const res = await SELF.fetch("https://test.local/auth/handle", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ handle: "sniped" }),
  });
  expect(res.status).toBe(409);
  const row = await env.DB.prepare("SELECT handle FROM users WHERE id = ?").bind(me.userId).first<{ handle: string | null }>();
  expect(row!.handle).toBeNull();
});

it("the previous owner CAN re-claim their own handle during cooldown; others still cannot", async () => {
  const me = await createTestAccount({ handle: "original" });
  const other = await createTestAccount();
  const meTok = await issueTestSession(me);
  const otherTok = await issueTestSession(other);
  const put = (token: string, handle: string) => SELF.fetch("https://test.local/auth/handle", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ handle }),
  });
  // Rename away → 'original' enters cooldown with released_by = me
  expect((await put(meTok, "newname")).status).toBe(200);
  const rel = await env.DB.prepare("SELECT released_by FROM handle_releases WHERE handle = 'original'").first<{ released_by: string }>();
  expect(rel!.released_by).toBe(me.userId);
  // Someone else can't snipe it during cooldown
  expect((await put(otherTok, "original")).status).toBe(409);
  // But the previous owner can take it back immediately
  expect((await put(meTok, "original")).status).toBe(200);
  const row = await env.DB.prepare("SELECT handle FROM users WHERE id = ?").bind(me.userId).first<{ handle: string }>();
  expect(row!.handle).toBe("original");
});
```

- [ ] **Step 2: Run, expect the prune test to FAIL** (the cooldown test may already pass via the pre-check — that's fine; it pins the atomic behavior).

- [ ] **Step 3: Implement**

`worker/src/maintenance.ts` — batch all deletes (a throw no longer skips later statements) and add the stale-request prune:

```ts
export const FRIEND_REQUEST_MAX_AGE_SEC = 90 * 24 * 3600; // spec §5 cron hygiene

export async function pruneExpired(db: D1Database, now: number): Promise<void> {
  // One batch: partial failure can't strand later deletes until tomorrow's run.
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE last_used_at < ?").bind(now - SESSION_MAX_IDLE_SEC),
    db.prepare("DELETE FROM handle_releases WHERE released_at < ?").bind(now - HANDLE_COOLDOWN_SEC),
    db.prepare("DELETE FROM device_codes WHERE expires_at < ?").bind(now),
    db.prepare("DELETE FROM friend_requests WHERE created_at < ?").bind(now - FRIEND_REQUEST_MAX_AGE_SEC),
  ]);
}
```

`worker/src/auth/account.ts` PUT /auth/handle — **read the current merged implementation first** (it batches rename+release). Three coordinated changes:

1. **Self-reclaim (Destin 2026-07-08):** the cooldown only applies to OTHER users — the previous owner can take their old handle back immediately. Both the friendly pre-check SELECT and the atomic claim below get the extra condition `AND (released_by IS NULL OR released_by != <me>)`.
2. **Atomic claim (knowledge-debt #2):** make the claim UPDATE itself conditional so the check→claim gap can't be sniped:

```sql
UPDATE users SET handle = ?1
WHERE id = ?2
  AND NOT EXISTS (
    SELECT 1 FROM handle_releases
    WHERE handle = ?1 AND released_at >= ?3
      AND (released_by IS NULL OR released_by != ?2)
  )
```

Bind `(handle, userId, now - HANDLE_COOLDOWN_SEC)`. After the batch, inspect the UPDATE statement's result: `results[i].meta.changes === 0` → `throw conflict("that handle was recently released and is in cooldown")`. The UNIQUE-violation → 409 catch stays as-is.

3. **Stamp the releaser:** the rename path's release insert becomes `INSERT OR REPLACE INTO handle_releases (handle, released_at, released_by) VALUES (?, ?, ?)` with the current user id. The DELETE /auth/account release (`INSERT ... SELECT` in the delete batch) stays `(handle, released_at)`-only — `released_by` defaults NULL there, and the FK would null it anyway when the users row cascades; deleted accounts' handles are never early-reclaimable. Also consume the cooldown row on self-reclaim: add `DELETE FROM handle_releases WHERE handle = ? AND released_by = ?` (bound to the claimed handle + current user) to the same batch. The `released_by = me` condition makes it safe — when a DIFFERENT user's claim is rejected by the conditional UPDATE, this DELETE matches nothing, so the cooldown row survives; when the previous owner reclaims, their own release row is cleaned up (otherwise a later rename would leave a stale row with the OLD released_at).

- [ ] **Step 4: Run** full suite → green.

- [ ] **Step 5: Commit** — `git commit -am "fix(worker): batched pruneExpired + stale-request prune + atomic handle claim (knowledge-debt)"`

---

### Task 10: Ship

- [ ] **Step 1:** `npm test` — entire suite green. `npx tsc --noEmit` if the project has a typecheck script (check `package.json`).
- [ ] **Step 2:** Push branch, open PR to `master` on `itsdestin/wecoded-marketplace` titled "Accounts Phase 2: social module (friends/blocks/handle lookup), PresenceRoom DO, data export". PR body lists endpoints + the knowledge-debt items closed (#1, #2, #3). End body with the standard generated-with footer.
- [ ] **Step 3:** Merge (controller/Destin approval). CI: test → migrate 0004 → deploy → secrets. **Expect the known seconds-long migrate-vs-deploy error window** — don't merge mid-demo.
- [ ] **Step 4:** Post-deploy smoke test against the live Worker (use Destin's PAT path or a real session token via the app):
  - `GET /health` → ok
  - `GET /social/users/<known-handle>` with a valid token → card
  - `GET /auth/export` with a valid token → JSON
  - WebSocket connect to `wss://wecoded-marketplace-api.destinj101.workers.dev/social/presence` with `Authorization` header → 101 + `presence` snapshot (a Node one-liner with `ws` works: `new WebSocket(url, { headers: { Authorization: 'Bearer …' } })`).
- [ ] **Step 5:** Update `docs/knowledge-debt.md` in `youcoded-dev`: mark items (1), (2), (3) of the "Accounts Phase 1: dispositioned follow-ups" entry as resolved with the PR number. Commit to youcoded-dev master.
- [ ] **Step 6:** Clean up the worktree after merge:

```bash
cd /c/Users/desti/youcoded-dev/wecoded-marketplace
git worktree remove ../wecoded-marketplace.wt/accounts-phase2-worker
git branch -D feat/social-phase2
```

---

## Self-review checklist (run before handing off)

- Spec §2 coverage: friendships ✓ (T1/T4/T5), requests incl. auto-accept ✓ (T4), blocks + severing + owner-only visibility ✓ (T6), exact-match session-gated lookup ✓ (T3), caps ✓ (T4), 90-day request prune ✓ (T9).
- Spec §3 coverage: PresenceRoom DO ✓ (T7), token auth / no ?username= ✓, friends-only fan-out ✓, single global instance ✓, last_seen_at on disconnect + 5-min refresh ✓, no presence history ✓, friends-only challenge relay ✓, message shapes reducer-compatible ✓, multi-device join/leave dedup ✓.
- Spec §5 coverage: export ✓ (T8) with blocked-by exclusion; cron hygiene ✓ (T9).
- Knowledge-debt: #1 ✓ (T2), #2 ✓ (T9), #3 ✓ (T9). (#4–#8 are client-plan scope.)
- Destin 2026-07-08 addition: handle self-reclaim during cooldown ✓ (T1 `released_by` column, T9 conditional claim + row consumption; deleted accounts excluded by ON DELETE SET NULL).
