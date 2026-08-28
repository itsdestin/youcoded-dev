---
status: active
created: 2026-08-28
spec: docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md
part: 1 of 3 (feedback routes) — see also 2026-08-28-marketplace-catalog-service.md, 2026-08-28-marketplace-app-wiring.md
---

# Marketplace Feedback (thumbs + comments) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the approved Feedback section real — one-tap Helpful / Not for me votes and an open comment thread per plugin — by adding three Worker routes, extending `/stats`, and wiring the app to them through the main process (where the sign-in token lives).

**Architecture:** Two new D1 tables (`thumbs`, `comments`) in the WeCoded Worker (Hono on Cloudflare, D1, vitest-pool-workers). `POST /thumbs` and `POST /comments` are authed writes that follow the existing `POST /ratings` shape (install gate, rate limit, llama-guard moderation → `hidden`); `GET /comments/:plugin_id` is a public read like `GET /ratings/:plugin_id`. The app reaches the authed routes through two new IPC channels (`marketplace:thumb`, `marketplace:comment`) registered exactly like `marketplace:rate`, on desktop main + preload + remote-shim + Android `SessionService.kt`; the public read stays a direct `fetch` from the renderer like `listRatings`. The workbench keeps its fake Worker (it must never hit production).

**Tech Stack:** TypeScript, Hono, Cloudflare Workers + D1, vitest 2.1 + `@cloudflare/vitest-pool-workers` 0.5 (Worker); Electron main/preload + React renderer + Kotlin/OkHttp (app).

## Global Constraints

- Worker error bodies are **plain-text lowercase messages, no trailing period** (`src/lib/errors.ts`), e.g. `must install plugin before rating`. Writes return `{ ok: true, ... }`; list reads return one named array (`{ comments: [...] }`).
- New Worker routes parse JSON with `parseJsonBody` (`src/lib/parse-json.ts`), never `c.req.json()` directly.
- Any public `GET` must be added to `isPublicReadPath()` in `worker/src/index.ts` (lines 64–71) or Android's `Origin: null` WebView is blocked by CORS.
- `[env.test]` in `wrangler.toml` does not inherit bindings; this plan adds none.
- Migrations are `worker/migrations/NNNN_snake_case.sql`; this plan is **0005**, unconditionally — it merges before the catalog plan, which is 0006. Do **not** renumber either: D1 records applied migrations by filename and applies them in order, so inserting a lower number after a higher one has already run applies it out of order. CI applies them (`worker-deploy.yml`) — never run `wrangler deploy` by hand.
- **Plugin ids may contain a slash.** A bundle member is `<bundle>/<name>` (spec §1.4) and has its own page with its own Feedback section. `validateId` is length-only (1–128 chars) so the id passes, but a Hono `:param` does not cross a slash and `isPublicReadPath` rejects a second segment — every id-taking route added here must accept one **or two** segments (Task 4).
- Worker tests share one D1 (`singleWorker: true`): every `describe` that writes must `DELETE FROM` its tables in `beforeEach`.
- App IPC channels for marketplace writes are string literals in `desktop/src/main/marketplace-api-handlers.ts` (`CHANNELS` array + `ipcMain.handle("…")`), inlined constants in `desktop/src/main/preload.ts` `IPC` block, `invoke('…')` in `desktop/src/renderer/remote-shim.ts`, and a `"…" -> { }` arm in `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`. (`remote-server.ts` has no `marketplace:rate` case today — the remote browser cannot rate either; this plan matches that, it does not fix it.)
- Copy: "Helpful" / "Not for me" / "Post comment" as approved; comment limit **2000** characters; comments need sign-in only, votes need sign-in **and** a prior install.
- **No Report button on comments in v1** (spec §5): the `reports` table is keyed to a rating (`rating_user_id`, `rating_plugin_id`) and cannot take a comment id without a schema change. Ship no affordance rather than a dead one.
- App work happens on `youcoded` branch `feat/marketplace-overhaul-ui` (worktree `worktrees/marketplace-ui`); Worker work on a new `wecoded-marketplace` branch `feat/feedback-routes` (from `master`). Run `bash scripts/verify.sh marketplace-ui` (workspace root) before calling any app task done; `cd worker && npm test && npm run typecheck` for Worker tasks.

---

## File structure

**Worker (`/home/destin/youcoded-dev/wecoded-marketplace/worker`)**
- Create `migrations/0005_feedback.sql` — `thumbs` + `comments` tables.
- Create `src/feedback/routes.ts` — `feedbackRoutes` (POST /thumbs, GET /comments/:plugin_id, POST /comments).
- Create `src/feedback/validate.ts` — `MAX_COMMENT_LEN`, `validateCommentText`, `parseVote`.
- Modify `src/index.ts` — mount `feedbackRoutes`; extend `isPublicReadPath` for `/comments/<id>`.
- Modify `src/stats/routes.ts` — add `thumbs_up` / `thumbs_down` per plugin.
- Create `test/feedback.test.ts`, `test/feedback-validate.test.ts`; modify `test/schema.test.ts`, `test/stats.test.ts`, `test/cors.test.ts`.
- Modify `README.md` (moderation section), `../docs/worker-backend.md` (route list).

**App (`/home/destin/youcoded-dev/worktrees/marketplace-ui`)**
- Modify `desktop/src/renderer/state/marketplace-api-client.ts` — return types match the Worker (`{ ok, vote }`, `{ ok, hidden, id }`).
- Modify `desktop/src/main/marketplace-api-handlers.ts` — `marketplace:thumb`, `marketplace:comment` handlers.
- Modify `desktop/src/main/preload.ts`, `desktop/src/renderer/remote-shim.ts`, `desktop/src/shared/types.ts` (window typing) — expose `marketplaceApi.thumb` / `.comment`.
- Modify `app/src/main/kotlin/com/youcoded/app/marketplace/MarketplaceApiClient.kt` + `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` — Android parity.
- Modify `desktop/src/renderer/components/marketplace/FeedbackSection.tsx` — call the channels, not a token-less client.
- Modify `desktop/tests/ipc-channels.test.ts` — parity block for the two channels.
- Modify `desktop/src/renderer/dev/workbench/mock-shim.ts` — fake `marketplaceApi.thumb/comment` (the fake Worker in `fixtures/marketplace/worker-api-mock.ts` already answers the HTTP side).

---

### Task 0: Prove the rate limiter actually limits (blocks everything else)

`checkRateLimit` (`worker/src/lib/rate-limit.ts`) keeps its counters **only** in the
Cloudflare Cache API. Cloudflare documents the Cache API as having **no effect on
`*.workers.dev` deployments**, and the Worker is served from
`wecoded-marketplace-api.destinj101.workers.dev`. If that holds, every call returns
"allowed" and this plan's 20-comments-per-hour brake does not exist. That mattered less for
ratings (install-gated, one row per plugin); an **open comment box needs sign-in only**, so
one account could post without limit.

- [ ] **Step 1: Measure it against production**

Sign in, then post the same report 70 times in a loop against
`POST /reports` (limit 20/hr) and record the status codes. Expected if the limiter works:
20× 200 then 429s. Expected if it does not: 70× 200.

- [ ] **Step 2: If it does not limit, move the counter to D1 before Task 1**

Add to migration 0005: `CREATE TABLE rate_counters (key TEXT PRIMARY KEY, count INTEGER NOT
NULL, window_start INTEGER NOT NULL);` and rewrite `checkRateLimit` as a single
`INSERT … ON CONFLICT DO UPDATE` that resets `count` when `window_start` is older than the
window. Add `DELETE FROM rate_counters WHERE window_start < ?` to the existing daily cron
(`wrangler.toml` `crons = ["17 6 * * *"]`). Every existing caller keeps the same signature,
so nothing else changes — and ratings/reports/installs gain the limit they were supposed to
have all along. Note the finding in `ROADMAP.md` either way.

---

### Task 1: Migration — `thumbs` and `comments` tables

**Files:**
- Create: `worker/migrations/0005_feedback.sql`
- Test: `worker/test/schema.test.ts`

**Interfaces:**
- Produces: tables `thumbs(user_id, plugin_id, vote, created_at, updated_at)` PK `(user_id, plugin_id)`, `vote` ∈ {1, −1}; `comments(id, user_id, plugin_id, text, created_at, hidden)` PK `id`.

- [ ] **Step 1: Write the failing schema test**

Edit `worker/test/schema.test.ts` — add two expectations to the existing `it`:

```ts
    expect(names).toContain("thumbs");
    expect(names).toContain("comments");
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /home/destin/youcoded-dev/wecoded-marketplace && git checkout -b feat/feedback-routes master && cd worker && npx vitest run test/schema.test.ts`
Expected: FAIL — `expected [ …tables… ] to include 'thumbs'`

- [ ] **Step 3: Write the migration**

Create `worker/migrations/0005_feedback.sql`:

```sql
-- Marketplace overhaul (spec docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md §1.7):
-- one-tap Helpful / Not for me votes and an open comment thread replace star
-- reviews. Ratings stay in place (rows are orphaned, not migrated — there are
-- almost none; ROADMAP carries the cleanup).
--
-- thumbs: one row per (user, plugin); vote is +1 (helpful) or -1 (not for me).
-- Clearing a vote DELETEs the row. Same install gate as ratings (enforced in
-- the route, not the schema) so strangers can't move the number.
CREATE TABLE thumbs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL,
  vote INTEGER NOT NULL CHECK(vote IN (1, -1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, plugin_id)
);
CREATE INDEX idx_thumbs_plugin ON thumbs(plugin_id);

-- comments: many per user per plugin (a thread, not a review). `hidden` is set
-- by the llama-guard classifier exactly like ratings.hidden; hidden rows are
-- stored but never listed. Partial index mirrors idx_ratings_plugin_visible.
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_comments_plugin_visible ON comments(plugin_id, created_at) WHERE hidden = 0;
```

- [ ] **Step 4: Run the test to see it pass**

Run: `npx vitest run test/schema.test.ts`
Expected: PASS (1 test). `readD1Migrations("./migrations")` in `vitest.config.ts` picks the new file up automatically.

- [ ] **Step 5: Commit**

```bash
git add migrations/0005_feedback.sql test/schema.test.ts
git commit -m "feat(worker): thumbs + comments tables (marketplace feedback)"
```

---

### Task 2: Validation helpers — `parseVote`, `validateCommentText`

**Files:**
- Create: `worker/src/feedback/validate.ts`
- Test: `worker/test/feedback-validate.test.ts`

**Interfaces:**
- Produces: `MAX_COMMENT_LEN = 2000`, `MAX_COMMENT_LINKS = 2`; `parseVote(raw: unknown): 1 | -1 | null` (throws `Error("value must be up, down or null")`); `validateCommentText(raw: unknown): string` (throws `Error` with the reason: empty / too long / too many links / spam).

- [ ] **Step 1: Write the failing tests**

Create `worker/test/feedback-validate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseVote, validateCommentText, MAX_COMMENT_LEN } from "../src/feedback/validate";

describe("parseVote", () => {
  it("maps up/down/null and rejects anything else", () => {
    expect(parseVote("up")).toBe(1);
    expect(parseVote("down")).toBe(-1);
    expect(parseVote(null)).toBeNull();
    expect(parseVote(undefined)).toBeNull();
    expect(() => parseVote("yes")).toThrow("value must be up, down or null");
    expect(() => parseVote(1)).toThrow("value must be up, down or null");
  });
});

describe("validateCommentText", () => {
  it("trims and returns the text", () => {
    expect(validateCommentText("  works great  ")).toBe("works great");
  });
  it("rejects empty, overlong, URL and repeated-character spam", () => {
    expect(() => validateCommentText("   ")).toThrow("comment is empty");
    expect(() => validateCommentText("x".repeat(MAX_COMMENT_LEN + 1))).toThrow("comment too long");
    expect(() => validateCommentText("aaaaaaaaaaaaaaaaaaaaaaaaa")).toThrow("comment appears to be spam");
    expect(() => validateCommentText(42)).toThrow("comment is empty");
  });
  it("allows a link — the most useful comment on a plugin is often one", () => {
    expect(validateCommentText("known issue, see https://github.com/x/y/issues/3")).toContain("issues/3");
  });
  it("rejects a comment that is mostly links", () => {
    expect(() => validateCommentText("https://a.example https://b.example https://c.example https://d.example")).toThrow("too many links");
  });
  it("allows exactly MAX_COMMENT_LEN characters", () => {
    expect(validateCommentText("y".repeat(MAX_COMMENT_LEN)).length).toBe(MAX_COMMENT_LEN);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run test/feedback-validate.test.ts`
Expected: FAIL — `Cannot find module '../src/feedback/validate'`

- [ ] **Step 3: Implement**

Create `worker/src/feedback/validate.ts`:

```ts
// Input rules for the feedback routes. Pure functions (no bindings) so they
// test without the worker runtime. They throw plain Error — the route wraps
// the message in badRequest(), the same split ratings/moderation.ts uses.

export const MAX_COMMENT_LEN = 2000;
/** Links per comment. A link or two is a citation; five is an advert. */
export const MAX_COMMENT_LINKS = 2;

/** Body `value` for POST /thumbs → the stored vote. null clears the vote. */
export function parseVote(raw: unknown): 1 | -1 | null {
  if (raw === null || raw === undefined) return null;
  if (raw === "up") return 1;
  if (raw === "down") return -1;
  throw new Error("value must be up, down or null");
}

/** Comment text before persisting: trimmed, bounded, at most a couple of links,
 *  no long repeated-character runs — the review rules relaxed for a conversation
 *  (2000 chars, not the review cap of 500).
 *
 *  Reviews banned URLs outright. Comments must NOT: on a plugin thread "known
 *  issue, see github.com/x/y/issues/3" is the single most useful thing anyone
 *  can leave, and banning it would train people not to bother. Link SPAM is the
 *  actual worry, so cap the count instead; the llama-guard classifier in the
 *  route is the second line. The repeated-character run is 20+, not 10+, so an
 *  ASCII rule (`----------`) or an ellipsis is not "spam". */
export function validateCommentText(raw: unknown): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed.length === 0) throw new Error("comment is empty");
  if (trimmed.length > MAX_COMMENT_LEN) {
    throw new Error(`comment too long (${trimmed.length} > ${MAX_COMMENT_LEN})`);
  }
  if ((trimmed.match(/https?:\/\//gi) ?? []).length > MAX_COMMENT_LINKS) {
    throw new Error(`too many links (at most ${MAX_COMMENT_LINKS})`);
  }
  if (/(.)\1{19,}/.test(trimmed)) throw new Error("comment appears to be spam");
  return trimmed;
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run test/feedback-validate.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/feedback/validate.ts test/feedback-validate.test.ts
git commit -m "feat(worker): feedback input rules — parseVote, validateCommentText"
```

---

### Task 3: `POST /thumbs`

**Files:**
- Create: `worker/src/feedback/routes.ts`
- Modify: `worker/src/index.ts` (imports at lines 5–16; mounts at lines 97–108)
- Test: `worker/test/feedback.test.ts`

**Interfaces:**
- Consumes: `requireAuth` (`src/auth/middleware.ts`), `hasInstall(db, userId, pluginId)` (`src/db.ts:58`), `checkRateLimit(key, limit, windowSec)` (`src/lib/rate-limit.ts`), `validateId` (`src/lib/validate.ts`), `parseJsonBody` (`src/lib/parse-json.ts`), `badRequest/forbidden/tooMany` (`src/lib/errors.ts`), `parseVote` (Task 2).
- Produces: `POST /thumbs` body `{ plugin_id: string; value: "up" | "down" | null }` → `200 { ok: true, vote: "up" | "down" | null }`; `403 must install plugin before voting`; `400 invalid plugin_id` / `value must be up, down or null`; `429 too many votes per hour`; `401` without a token.

- [ ] **Step 1: Write the failing tests**

Create `worker/test/feedback.test.ts`:

```ts
import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createTestAccount, issueTestSession, type TestAccount } from "./helpers";

async function seed(login = "testy"): Promise<{ token: string; account: TestAccount }> {
  const account = await createTestAccount({ login });
  const token = await issueTestSession(account);
  return { token, account };
}

async function seedInstall(userId: string, pluginId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT INTO installs (user_id, plugin_id, installed_at) VALUES (?, ?, ?)")
    .bind(userId, pluginId, now).run();
}

const TABLES = ["sessions", "identities", "users", "installs", "thumbs", "comments"];

function post(path: string, token: string | null, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return SELF.fetch(`https://test.local${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

describe("POST /thumbs", () => {
  beforeEach(async () => {
    for (const t of TABLES) await env.DB.prepare(`DELETE FROM ${t}`).run();
  });

  it("401s without a token", async () => {
    const res = await post("/thumbs", null, { plugin_id: "foo:bar", value: "up" });
    expect(res.status).toBe(401);
  });

  it("403s when the user has not installed the plugin", async () => {
    const { token } = await seed();
    const res = await post("/thumbs", token, { plugin_id: "foo:bar", value: "up" });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("must install plugin before voting");
  });

  it("records an up vote, flips it to down, then clears it", async () => {
    const { token, account } = await seed();
    await seedInstall(account.userId, "foo:bar");

    let res = await post("/thumbs", token, { plugin_id: "foo:bar", value: "up" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, vote: "up" });
    let row = await env.DB.prepare("SELECT vote FROM thumbs WHERE user_id = ? AND plugin_id = ?")
      .bind(account.userId, "foo:bar").first<{ vote: number }>();
    expect(row).toEqual({ vote: 1 });

    res = await post("/thumbs", token, { plugin_id: "foo:bar", value: "down" });
    expect(await res.json()).toEqual({ ok: true, vote: "down" });
    row = await env.DB.prepare("SELECT vote FROM thumbs WHERE user_id = ? AND plugin_id = ?")
      .bind(account.userId, "foo:bar").first<{ vote: number }>();
    expect(row).toEqual({ vote: -1 });

    res = await post("/thumbs", token, { plugin_id: "foo:bar", value: null });
    expect(await res.json()).toEqual({ ok: true, vote: null });
    row = await env.DB.prepare("SELECT vote FROM thumbs WHERE user_id = ? AND plugin_id = ?")
      .bind(account.userId, "foo:bar").first<{ vote: number }>();
    expect(row).toBeNull();
  });

  it("400s on a bad value and on a bad plugin_id", async () => {
    const { token, account } = await seed();
    await seedInstall(account.userId, "foo:bar");
    let res = await post("/thumbs", token, { plugin_id: "foo:bar", value: "meh" });
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("value must be up, down or null");
    res = await post("/thumbs", token, { plugin_id: "", value: "up" });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run test/feedback.test.ts`
Expected: FAIL — the 401 case may pass (unknown route → 404 ≠ 401 → actually FAIL), the rest FAIL with status 404.

- [ ] **Step 3: Implement the route module and mount it**

Create `worker/src/feedback/routes.ts`:

```ts
// Marketplace feedback — thumbs + comments (spec §1.7). Shapes follow
// ratings/routes.ts: authed writes gate on a prior install (thumbs) and run
// the llama-guard classifier (comments); the public read mirrors
// GET /ratings/:plugin_id (IP rate limit, LIMIT 50, hidden rows excluded).
import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { requireAuth } from "../auth/middleware";
import { badRequest, forbidden, tooMany } from "../lib/errors";
import { validateId } from "../lib/validate";
import { parseJsonBody } from "../lib/parse-json";
import { checkRateLimit } from "../lib/rate-limit";
import { hasInstall } from "../db";
import { parseVote } from "./validate";

export const feedbackRoutes = new Hono<HonoEnv>();

// POST /thumbs { plugin_id, value: "up" | "down" | null } → { ok, vote }
// One vote per (user, plugin); null clears it. Install-gated like ratings so
// the percentage on the card can't be moved by accounts that never used it.
feedbackRoutes.post("/thumbs", requireAuth, async (c) => {
  const userId = c.get("userId");
  if (!(await checkRateLimit(`thumbs:${userId}`, 60, 3600))) {
    throw tooMany("too many votes per hour");
  }
  const body = await parseJsonBody<{ plugin_id?: string; value?: unknown }>(c);
  const pluginId = validateId(body.plugin_id);
  let vote: 1 | -1 | null;
  try { vote = parseVote(body.value); }
  catch (e) { throw badRequest((e as Error).message); }

  if (!(await hasInstall(c.env.DB, userId, pluginId))) {
    throw forbidden("must install plugin before voting");
  }

  const now = Math.floor(Date.now() / 1000);
  if (vote === null) {
    await c.env.DB.prepare("DELETE FROM thumbs WHERE user_id = ? AND plugin_id = ?")
      .bind(userId, pluginId).run();
    return c.json({ ok: true, vote: null });
  }
  await c.env.DB
    .prepare(
      `INSERT INTO thumbs (user_id, plugin_id, vote, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, plugin_id) DO UPDATE SET vote = excluded.vote, updated_at = excluded.updated_at`
    )
    .bind(userId, pluginId, vote, now, now)
    .run();
  return c.json({ ok: true, vote: vote === 1 ? "up" : "down" });
});
```

Edit `worker/src/index.ts`: add the import next to the other route imports (lines 5–16):

```ts
import { feedbackRoutes } from "./feedback/routes";
```

and one mount line after `app.route("/", reportRoutes);` (line ~104):

```ts
app.route("/", feedbackRoutes);
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run test/feedback.test.ts && npm run typecheck`
Expected: PASS (4 tests); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/feedback/routes.ts src/index.ts test/feedback.test.ts
git commit -m "feat(worker): POST /thumbs — one install-gated vote per user per plugin"
```

---

### Task 4: `POST /comments` and `GET /comments/:plugin_id`

**Files:**
- Modify: `worker/src/feedback/routes.ts`
- Modify: `worker/src/index.ts` `isPublicReadPath` (lines 64–71)
- Test: `worker/test/feedback.test.ts`, `worker/test/cors.test.ts`

**Interfaces:**
- Consumes: `classifyReview(ai, text)` (`src/ratings/moderation.ts:31` — reused as-is; it is a generic text classifier), `randomToken(16)` (`src/lib/crypto.ts:3`), `validateCommentText` (Task 2).
- Produces: `POST /comments` body `{ plugin_id, text }` → `200 { ok: true, id: string, hidden: boolean }`; `GET /comments/:plugin_id` **and** `GET /comments/:bundle/:name` → `200 { comments: Array<{ id, user_id, user_login, user_avatar_url, text, created_at }> }` newest first, max 50, hidden excluded, any origin allowed. The two-segment form is how a bundle **member** page reads its thread (`superpowers/brainstorming`, spec §1.4 and §2).

- [ ] **Step 1: Write the failing tests**

Append to `worker/test/feedback.test.ts`:

```ts
describe("POST /comments + GET /comments/:plugin_id", () => {
  beforeEach(async () => {
    for (const t of TABLES) await env.DB.prepare(`DELETE FROM ${t}`).run();
  });

  it("401s without a token", async () => {
    const res = await post("/comments", null, { plugin_id: "foo:bar", text: "hi" });
    expect(res.status).toBe(401);
  });

  it("does NOT require an install (questions before installing are the point)", async () => {
    const { token } = await seed();
    const res = await post("/comments", token, { plugin_id: "foo:bar", text: "Does this work offline?" });
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; id: string; hidden: boolean }>();
    expect(body.ok).toBe(true);
    expect(body.hidden).toBe(false);
    expect(body.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("400s on empty text, link spam and overlong text", async () => {
    const { token } = await seed();
    expect((await post("/comments", token, { plugin_id: "foo:bar", text: "   " })).status).toBe(400);
    const r = await post("/comments", token, { plugin_id: "foo:bar", text: "a https://a.x b https://b.x c https://c.x" });
    expect(r.status).toBe(400);
    expect(await r.text()).toBe("too many links (at most 2)");
    expect((await post("/comments", token, { plugin_id: "foo:bar", text: "z".repeat(2001) })).status).toBe(400);
  });

  it("lists visible comments newest first with the author's login and avatar", async () => {
    const { token, account } = await seed("alice");
    await post("/comments", token, { plugin_id: "foo:bar", text: "first" });
    // Force a later created_at for the second row so ordering is deterministic.
    await env.DB.prepare("UPDATE comments SET created_at = created_at - 100").run();
    await post("/comments", token, { plugin_id: "foo:bar", text: "second" });
    // A hidden row must never be listed.
    await env.DB.prepare(
      "INSERT INTO comments (id, user_id, plugin_id, text, created_at, hidden) VALUES ('h1', ?, 'foo:bar', 'nope', 9999999999, 1)"
    ).bind(account.userId).run();

    const res = await SELF.fetch("https://test.local/comments/foo%3Abar");
    expect(res.status).toBe(200);
    const { comments } = await res.json<{ comments: Array<{ id: string; user_id: string; user_login: string; user_avatar_url: string | null; text: string; created_at: number }> }>();
    expect(comments.map((c) => c.text)).toEqual(["second", "first"]);
    expect(comments[0].user_id).toBe(account.userId);
    expect(comments[0].user_login).toBe("alice");
    expect(typeof comments[0].created_at).toBe("number");
  });

  it("returns an empty list for an unknown plugin", async () => {
    const res = await SELF.fetch("https://test.local/comments/nothing-here");
    expect(await res.json()).toEqual({ comments: [] });
  });

  it("reads a bundle MEMBER's thread — the id has a slash", async () => {
    const { token } = await seed("bob");
    const memberId = "superpowers/brainstorming";
    expect((await post("/comments", token, { plugin_id: memberId, text: "does this need a key?" })).status).toBe(200);
    // Unencoded: this is how the renderer builds the URL for a member page.
    const res = await SELF.fetch("https://test.local/comments/superpowers/brainstorming");
    expect(res.status).toBe(200);
    const { comments } = await res.json<{ comments: Array<{ text: string }> }>();
    expect(comments.map((c) => c.text)).toEqual(["does this need a key?"]);
  });
});
```

Append to `worker/test/cors.test.ts` (copy the shape of the existing `GET /ratings/:plugin_id accepts any origin` test at lines 37–44 and change the path):

```ts
  it("GET /comments accepts any origin, for a plugin id and a member id", async () => {
    for (const p of ["/comments/some-plugin", "/comments/some-plugin/some-member"]) {
      const res = await SELF.fetch(`https://test.local${p}`, {
        headers: { Origin: "https://nowhere.example" },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    }
  });
```

(If the existing ratings test asserts a different header value, mirror that value exactly — the two must agree.)

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run test/feedback.test.ts test/cors.test.ts`
Expected: FAIL — comments tests 404; the CORS test fails on status/header.

- [ ] **Step 3: Implement**

Append to `worker/src/feedback/routes.ts` (add `classifyReview`, `randomToken`, `validateCommentText` to the imports):

```ts
import type { Context } from "hono";
import { classifyReview } from "../ratings/moderation";
import { randomToken } from "../lib/crypto";
import { parseVote, validateCommentText } from "./validate";   // replaces the parseVote-only import
```

```ts
// POST /comments { plugin_id, text } → { ok, id, hidden }
// Sign-in only — no install gate: asking "does this work offline?" BEFORE
// installing is the point. Same classifier as reviews; flagged text is stored
// hidden so the admin queue can look at it.
feedbackRoutes.post("/comments", requireAuth, async (c) => {
  const userId = c.get("userId");
  if (!(await checkRateLimit(`comments:${userId}`, 20, 3600))) {
    throw tooMany("too many comments per hour");
  }
  const body = await parseJsonBody<{ plugin_id?: string; text?: unknown }>(c);
  const pluginId = validateId(body.plugin_id);
  let text: string;
  try { text = validateCommentText(body.text); }
  catch (e) { throw badRequest((e as Error).message); }

  const verdict = await classifyReview(c.env.AI, text);
  const hidden = verdict.safe ? 0 : 1;
  const id = randomToken(16);
  await c.env.DB
    .prepare("INSERT INTO comments (id, user_id, plugin_id, text, created_at, hidden) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, userId, pluginId, text, Math.floor(Date.now() / 1000), hidden)
    .run();
  return c.json({ ok: true, id, hidden: hidden === 1 });
});

// GET /comments/<id> → { comments } — public, newest first, LIMIT 50, hidden
// excluded. Wire names match GET /ratings (user_login / user_avatar_url) because
// the app's CommentList already reads them.
//
// TWO routes, one handler: a bundle member's id is `<bundle>/<name>` (spec §1.4),
// and Hono's `:param` never matches across a slash — a single-segment route would
// 404 every member page's comment thread. Register the two-segment form FIRST so
// it wins the match.
async function listComments(c: Context<HonoEnv>, pluginId: string) {
  const ip = c.req.raw.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!(await checkRateLimit(`comments-list:${ip}`, 60, 60))) {
    throw tooMany("too many requests");
  }
  const { results } = await c.env.DB
    .prepare(
      `SELECT m.id, m.user_id, u.display_name, u.avatar_url, m.text, m.created_at
       FROM comments m
       JOIN users u ON u.id = m.user_id
       WHERE m.plugin_id = ? AND m.hidden = 0
       ORDER BY m.created_at DESC
       LIMIT 50`
    )
    .bind(pluginId)
    .all<{ id: string; user_id: string; display_name: string; avatar_url: string | null; text: string; created_at: number }>();
  const comments = results.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    user_login: row.display_name,
    user_avatar_url: row.avatar_url,
    text: row.text,
    created_at: row.created_at,
  }));
  return c.json({ comments });
}

feedbackRoutes.get("/comments/:bundle/:name", (c) =>
  listComments(c, validateId(`${c.req.param("bundle")}/${c.req.param("name")}`))
);
feedbackRoutes.get("/comments/:plugin_id", (c) => listComments(c, validateId(c.req.param("plugin_id"))));
```

Edit `worker/src/index.ts` `isPublicReadPath` (lines 64–71) so it reads:

```ts
// Path matcher for public-read endpoints. Tight: GET /stats exact, GET
// /ratings/<single-segment plugin_id>, GET /comments/<single-segment plugin_id>.
// Anything else falls through to strict.
function isPublicReadPath(path: string): boolean {
  if (path === "/stats") return true;
  if (path.startsWith("/ratings/")) {
    const rest = path.slice("/ratings/".length);
    return rest.length > 0 && !rest.includes("/");
  }
  // /comments/<plugin_id> OR /comments/<bundle>/<member> — a bundle member's id
  // carries a slash (spec §1.4). Two segments max; Android's WebView sends
  // `Origin: null`, so a miss here is a CORS block, not just a 404.
  if (path.startsWith("/comments/")) {
    const parts = path.slice("/comments/".length).split("/");
    return parts.length <= 2 && parts.every((p) => p.length > 0);
  }
  return false;
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run test/feedback.test.ts test/cors.test.ts && npm run typecheck`
Expected: PASS (feedback 10 tests, cors all tests); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/feedback/routes.ts src/index.ts test/feedback.test.ts test/cors.test.ts
git commit -m "feat(worker): comments — POST /comments (sign-in, moderated) + public GET /comments/:plugin_id"
```

---

### Task 5: `GET /stats` gains `thumbs_up` / `thumbs_down`

**Files:**
- Modify: `worker/src/stats/routes.ts` (whole file is 44 lines)
- Test: `worker/test/stats.test.ts`

**Interfaces:**
- Produces: every `plugins[id]` in `/stats` has `thumbs_up: number` and `thumbs_down: number` (0 when none). The app's `StatsResponse` already types them optional; nothing else changes.

- [ ] **Step 1: Write the failing test**

Append inside `describe("GET /stats", …)` in `worker/test/stats.test.ts` (reuse that file's existing seeding helpers for a user; if it has none, insert a user row the way `test/helpers.ts createTestAccount` does):

```ts
  it("counts thumbs up and down per plugin, and defaults both to 0", async () => {
    const a = await createTestAccount({ login: "a" });
    const b = await createTestAccount({ login: "b" });
    const now = Math.floor(Date.now() / 1000);
    for (const [uid, vote] of [[a.userId, 1], [b.userId, -1]] as const) {
      await env.DB.prepare("INSERT INTO thumbs (user_id, plugin_id, vote, created_at, updated_at) VALUES (?, 'voted', ?, ?, ?)")
        .bind(uid, vote, now, now).run();
    }
    await env.DB.prepare("INSERT INTO installs (user_id, plugin_id, installed_at) VALUES (?, 'installed-only', ?)")
      .bind(a.userId, now).run();

    const res = await SELF.fetch("https://test.local/stats");
    const body = await res.json<{ plugins: Record<string, { installs: number; thumbs_up: number; thumbs_down: number }> }>();
    expect(body.plugins["voted"]).toMatchObject({ thumbs_up: 1, thumbs_down: 1 });
    expect(body.plugins["installed-only"]).toMatchObject({ installs: 1, thumbs_up: 0, thumbs_down: 0 });
  });
```

Add `"thumbs"` to that file's `beforeEach` table-clearing list and `import { createTestAccount } from "./helpers";` if missing.

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run test/stats.test.ts`
Expected: FAIL — `thumbs_up` undefined.

- [ ] **Step 3: Implement**

In `worker/src/stats/routes.ts`:

Change line 7 to:
```ts
interface PluginAgg { installs: number; review_count: number; rating: number; thumbs_up: number; thumbs_down: number }
```

Add a fourth query after `likeRows` (after line 22):
```ts
  // Marketplace overhaul: one-tap votes. SUM over CASE keeps it one GROUP BY.
  const thumbRows = await c.env.DB
    .prepare(
      `SELECT plugin_id,
              SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS up,
              SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS down
       FROM thumbs GROUP BY plugin_id`
    )
    .all<{ plugin_id: string; up: number; down: number }>();
```

Replace the two object literals that seed/merge `plugins` so every entry carries the new fields:
```ts
  const EMPTY: PluginAgg = { installs: 0, review_count: 0, rating: 0, thumbs_up: 0, thumbs_down: 0 };
  const plugins: Record<string, PluginAgg> = {};
  for (const r of installRows.results) {
    plugins[r.plugin_id] = { ...EMPTY, installs: r.n };
  }
  for (const r of ratingRows.results) {
    const entry = plugins[r.plugin_id] ?? { ...EMPTY };
    entry.review_count = r.n;
    entry.rating = Math.round(bayesianAverage(r.avg_stars, r.n) * 100) / 100;
    plugins[r.plugin_id] = entry;
  }
  for (const r of thumbRows.results) {
    const entry = plugins[r.plugin_id] ?? { ...EMPTY };
    entry.thumbs_up = r.up;
    entry.thumbs_down = r.down;
    plugins[r.plugin_id] = entry;
  }
```

- [ ] **Step 4: Run to see it pass, then the whole suite**

Run: `npx vitest run test/stats.test.ts && npm test && npm run typecheck`
Expected: stats PASS; full suite PASS (189 + the new tests); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/stats/routes.ts test/stats.test.ts
git commit -m "feat(worker): /stats carries thumbs_up / thumbs_down per plugin"
```

---

### Task 6: Worker docs + PR

**Files:**
- Modify: `worker/README.md` (the Moderation workflow section, lines ~50–59, and the one-line summary at line 3)
- Modify: `/home/destin/youcoded-dev/wecoded-marketplace/docs/worker-backend.md` (route list)

- [ ] **Step 1: Update the docs**

In `worker/README.md` line 3, change the summary to name the feature: "install tracking, ratings, **thumbs + comments**, and theme likes". In the Moderation workflow section add:

```markdown
Comments (`POST /comments`) go through the same `llama-guard-3-8b` classifier as
reviews; a flagged comment is stored with `hidden = 1` and never listed by
`GET /comments/:plugin_id`. Thumbs (`POST /thumbs`) carry no text and are not
classified; they are install-gated instead (one vote per account per plugin).
```

In `docs/worker-backend.md`, add to the route list:

```markdown
| `POST /thumbs` | auth + prior install | `{ plugin_id, value: "up" \| "down" \| null }` → `{ ok, vote }` |
| `POST /comments` | auth | `{ plugin_id, text ≤ 2000 }` → `{ ok, id, hidden }` |
| `GET /comments/:plugin_id` | public (any origin) | `{ comments: [...] }` newest first, 50 max |
| `GET /stats` | public | now includes `thumbs_up` / `thumbs_down` per plugin |
```

- [ ] **Step 2: Commit, push, open the PR**

```bash
git add worker/README.md docs/worker-backend.md
git commit -m "docs(worker): feedback routes"
git push -u origin feat/feedback-routes
gh pr create --repo itsdestin/wecoded-marketplace --title "feat(worker): marketplace feedback — thumbs + comments" --body "$(cat <<'EOF'
Adds the backend for the approved Feedback section (youcoded-dev docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md §1.7).

- migration 0005: `thumbs`, `comments`
- `POST /thumbs` (auth + prior install, one vote per user per plugin, null clears)
- `POST /comments` (auth, ≤2000 chars, llama-guard → hidden) + public `GET /comments/:plugin_id`
- `/stats` gains `thumbs_up` / `thumbs_down`
- CORS: `/comments/<id>` is a public read like `/ratings/<id>`

Merging deploys via worker-deploy.yml (tests → migrations → deploy).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01HcBwbvXqiaWA7M46NP3h7L
EOF
)"
```

Expected: PR opens; `Worker CI` must be green before merge. **Merge it before starting Task 8** — the app's real calls need the routes live.

---

### Task 7: App — client return types match the Worker

**Files:**
- Modify: `desktop/src/renderer/state/marketplace-api-client.ts` (the three `listComments` / `postComment` / `setThumb` members added on the branch)

**Interfaces:**
- Produces: `postComment(input): Promise<{ ok: true; id: string; hidden: boolean }>`; `setThumb(input): Promise<{ ok: true; vote: "up" | "down" | null }>`; `listComments` unchanged **except** that it must NOT `encodeURIComponent` the id — a member id is `<bundle>/<name>` and the slash has to stay a path separator (`/comments/${pluginId}`), matching the two-segment route from Task 4. Check what it does today and fix it if it encodes.

- [ ] **Step 1: Edit the interface and the implementation**

In the interface block (added on the branch under `listRatings`), replace the two signatures:

```ts
  postComment(input: { plugin_id: string; text: string }): Promise<{ ok: true; id: string; hidden: boolean }>;
  /** `null` clears the user's vote. Requires a prior install (403 otherwise). */
  setThumb(input: { plugin_id: string; value: 'up' | 'down' | null }): Promise<{ ok: true; vote: 'up' | 'down' | null }>;
```

and the implementations:

```ts
    postComment: (input) =>
      request<{ ok: true; id: string; hidden: boolean }>("/comments", { method: "POST", body: JSON.stringify(input), auth: true }),
    setThumb: (input) =>
      request<{ ok: true; vote: 'up' | 'down' | null }>("/thumbs", { method: "POST", body: JSON.stringify(input), auth: true }),
```

- [ ] **Step 2: Type-check and commit**

Run: `cd /home/destin/youcoded-dev/worktrees/marketplace-ui/desktop && npx tsc --noEmit -p .`
Expected: clean (FeedbackSection ignores the resolved values today).

```bash
git add src/renderer/state/marketplace-api-client.ts
git commit -m "feat(marketplace): api client — thumbs/comments return the Worker's shapes"
```

---

### Task 8: App — `marketplace:thumb` and `marketplace:comment` on every surface

**Files:**
- Modify: `desktop/src/main/marketplace-api-handlers.ts` (`CHANNELS` at lines ~45–53; handlers after `marketplace:rate` at line 239)
- Modify: `desktop/src/main/preload.ts` (`IPC` block near line 265; `marketplaceApi` surface at lines 688–702)
- Modify: `desktop/src/renderer/remote-shim.ts` (`marketplaceApi` block near lines 994–1004)
- Modify: `desktop/src/shared/types.ts` (the `window.claude.marketplaceApi` type — find it with `rg -n "likeTheme" desktop/src/shared/types.ts`)
- Modify: `app/src/main/kotlin/com/youcoded/app/marketplace/MarketplaceApiClient.kt` (after `toggleThemeLike`, line ~210)
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (after the `"marketplace:theme:like"` arm, line ~2779)
- Test: `desktop/tests/ipc-channels.test.ts`

**Interfaces:**
- Produces: `window.claude.marketplaceApi.thumb({ plugin_id, value }): Promise<ApiResult<{ vote: 'up'|'down'|null }>>` and `window.claude.marketplaceApi.comment({ plugin_id, text }): Promise<ApiResult<{ id: string; hidden: boolean }>>` — identical on Electron, remote browser (shim) and Android.

- [ ] **Step 1: Write the failing parity test**

Append to `desktop/tests/ipc-channels.test.ts` (copy the shape of the `permissions:* channel parity` block at lines 1092–1123; marketplace write channels have no `remote-server.ts` case — `marketplace:rate` has none either — so this block pins four surfaces):

```ts
describe('marketplace feedback channel parity', () => {
  const NEW_TYPES = ['marketplace:thumb', 'marketplace:comment'];
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

  it('exposed in preload.ts', () => {
    const src = read('src', 'main', 'preload.ts');
    for (const t of NEW_TYPES) expect(src).toContain(`'${t}'`);
  });
  it('exposed in remote-shim.ts', () => {
    const src = read('src', 'renderer', 'remote-shim.ts');
    for (const t of NEW_TYPES) expect(src).toContain(`'${t}'`);
  });
  it('registered in marketplace-api-handlers.ts', () => {
    const src = read('src', 'main', 'marketplace-api-handlers.ts');
    for (const t of NEW_TYPES) expect(src).toContain(`"${t}"`);
  });
  it('handled by SessionService.kt (Android)', () => {
    const src = read('..', 'app', 'src', 'main', 'kotlin', 'com', 'youcoded', 'app', 'runtime', 'SessionService.kt');
    for (const t of NEW_TYPES) expect(src).toContain(`"${t}"`);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/ipc-channels.test.ts`
Expected: FAIL — 4 new tests fail (strings absent).

- [ ] **Step 3: Desktop main + preload + shim + types**

`desktop/src/main/marketplace-api-handlers.ts` — add to `CHANNELS`:
```ts
  "marketplace:thumb",
  "marketplace:comment",
```
and after the `marketplace:rate:delete` handler:
```ts
  // Marketplace overhaul (spec §1.7): one-tap vote and comment. Both go through
  // main because the token lives here; the renderer's client has none.
  ipcMain.handle("marketplace:thumb", (_e, input: { plugin_id: string; value: 'up' | 'down' | null }): Promise<ApiResult<{ vote: 'up' | 'down' | null }>> =>
    wrap(async () => { const r = await client.setThumb(input); return { vote: r.vote }; })
  );
  ipcMain.handle("marketplace:comment", (_e, input: { plugin_id: string; text: string }): Promise<ApiResult<{ id: string; hidden: boolean }>> =>
    wrap(async () => { const r = await client.postComment(input); return { id: r.id, hidden: r.hidden }; })
  );
```
(If the file wraps `marketplace:rate` in `makeClearSessionOn401(store)` — check line 239 — wrap these the same way.)

`desktop/src/main/preload.ts` — in the `IPC` block next to `MARKETPLACE_THEME_LIKE`:
```ts
  MARKETPLACE_THUMB: 'marketplace:thumb',
  MARKETPLACE_COMMENT: 'marketplace:comment',
```
and in `marketplaceApi` after `likeTheme`:
```ts
    thumb: (input: { plugin_id: string; value: 'up' | 'down' | null }): Promise<ApiResult<{ vote: 'up' | 'down' | null }>> =>
      ipcRenderer.invoke(IPC.MARKETPLACE_THUMB, input),
    comment: (input: { plugin_id: string; text: string }): Promise<ApiResult<{ id: string; hidden: boolean }>> =>
      ipcRenderer.invoke(IPC.MARKETPLACE_COMMENT, input),
```

`desktop/src/renderer/remote-shim.ts` — after `likeTheme` (line ~1000), passing the input flat like `rate`:
```ts
      thumb: (input: { plugin_id: string; value: 'up' | 'down' | null }): Promise<ApiResult<{ vote: 'up' | 'down' | null }>> =>
        invoke('marketplace:thumb', input),
      comment: (input: { plugin_id: string; text: string }): Promise<ApiResult<{ id: string; hidden: boolean }>> =>
        invoke('marketplace:comment', input),
```

`desktop/src/shared/types.ts` — add the same two members to the `marketplaceApi` object type (next to `likeTheme`); if `IPC` in types.ts carries `MARKETPLACE_THEME_LIKE`, add `MARKETPLACE_THUMB` / `MARKETPLACE_COMMENT` there too (the `preload channel names match shared/types.ts` test at the top of `ipc-channels.test.ts` fails otherwise — run it to know).

- [ ] **Step 4: Android**

`MarketplaceApiClient.kt`, after `toggleThemeLike`:
```kotlin
    /** POST /thumbs — up / down / null (clear). Requires token; 403 without a prior install. */
    suspend fun setThumb(pluginId: String, value: String?): ApiResult<JSONObject> {
        val payload = JSONObject().apply {
            put("plugin_id", pluginId)
            if (value == null) put("value", JSONObject.NULL) else put("value", value)
        }
        val (code, body) = request("/thumbs", method = "POST", body = payload, auth = true)
        return if (code in 200..299) ApiResult.Ok(body) else errFromResponse(code, body)
    }

    /** POST /comments — requires token, no install needed. */
    suspend fun postComment(pluginId: String, text: String): ApiResult<JSONObject> {
        val payload = JSONObject().apply {
            put("plugin_id", pluginId)
            put("text", text)
        }
        val (code, body) = request("/comments", method = "POST", body = payload, auth = true)
        return if (code in 200..299) ApiResult.Ok(body) else errFromResponse(code, body)
    }
```

`SessionService.kt`, after the `"marketplace:theme:like"` arm:
```kotlin
            "marketplace:thumb" -> {
                // payload passed flat: { plugin_id, value: "up" | "down" | null }
                val pluginId = msg.payload.optString("plugin_id", "")
                val value = if (msg.payload.isNull("value")) null else msg.payload.optString("value", "")
                val result = marketplaceApiClient.setThumb(pluginId, value)
                msg.id?.let {
                    // value shape: { vote: "up" | "down" | null }
                    bridgeServer.respond(ws, msg.type, it, result.toJson { v -> JSONObject().put("vote", v.opt("vote") ?: JSONObject.NULL) })
                }
            }

            "marketplace:comment" -> {
                // payload passed flat: { plugin_id, text }
                val pluginId = msg.payload.optString("plugin_id", "")
                val text = msg.payload.optString("text", "")
                val result = marketplaceApiClient.postComment(pluginId, text)
                msg.id?.let {
                    // value shape: { id, hidden }
                    bridgeServer.respond(ws, msg.type, it, result.toJson { v -> JSONObject().put("id", v.optString("id")).put("hidden", v.optBoolean("hidden")) })
                }
            }
```

- [ ] **Step 5: Run the parity test, then the desktop gate, then Android's unit tests**

Run: `npx vitest run tests/ipc-channels.test.ts` → PASS.
Run: `cd /home/destin/youcoded-dev && bash scripts/verify.sh marketplace-ui` → `OK — all checks passed.`
Run: `cd /home/destin/youcoded-dev/worktrees/marketplace-ui && ./gradlew test -x bundleWebUi` → BUILD SUCCESSFUL (the `-x bundleWebUi` matters: this worktree's `node_modules` is hardlinked, and `bundleWebUi` runs `npm ci` — see CLAUDE.md).

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/marketplace-api-handlers.ts desktop/src/main/preload.ts desktop/src/renderer/remote-shim.ts desktop/src/shared/types.ts desktop/tests/ipc-channels.test.ts app/src/main/kotlin/com/youcoded/app/marketplace/MarketplaceApiClient.kt app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(marketplace): marketplace:thumb + marketplace:comment on desktop, remote shim and Android"
```

---

### Task 9: App — FeedbackSection uses the channels; workbench fakes them

**Files:**
- Modify: `desktop/src/renderer/components/marketplace/FeedbackSection.tsx`
- Modify: `desktop/src/renderer/components/marketplace/CommentList.tsx` — remove the per-comment **Report** affordance (spec §5: the `reports` table is keyed to a rating and cannot take a comment id; ship nothing rather than a dead button)
- Modify: `desktop/src/renderer/dev/workbench/mock-shim.ts` (hand-written `marketplaceApi` members — search `handWritten(` and the existing `likeTheme` fake if any; otherwise add a `marketplaceApi` object next to the other hand-written namespaces)
- Test: `desktop/tests/feedback-section.test.tsx` (new)

**Interfaces:**
- Consumes: `window.claude.marketplaceApi.thumb` / `.comment` (Task 8); `useMarketplaceStats().refresh()`; `CommentList` (unchanged, still reads the public route directly).

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/feedback-section.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

const thumb = vi.fn().mockResolvedValue({ ok: true, value: { vote: 'up' } });
const comment = vi.fn().mockResolvedValue({ ok: true, value: { id: 'c1', hidden: false } });
const refresh = vi.fn();

vi.mock('../src/renderer/state/account-context', () => ({ useAccount: () => ({ signedIn: true }) }));
vi.mock('../src/renderer/state/marketplace-stats-context', () => ({
  useMarketplaceStats: () => ({ plugins: { p1: { installs: 3, review_count: 0, rating: 0, thumbs_up: 9, thumbs_down: 1 } }, themes: {}, refresh, loading: false }),
}));
vi.mock('../src/renderer/components/marketplace/CommentList', () => ({ default: () => <div data-testid="comments" /> }));
vi.mock('../src/renderer/components/marketplace/SignInPromptModal', () => ({ default: () => null }));

import FeedbackSection from '../src/renderer/components/marketplace/FeedbackSection';

afterEach(cleanup);

describe('FeedbackSection', () => {
  it('votes through window.claude.marketplaceApi.thumb and refreshes stats', async () => {
    (window as any).claude = { marketplaceApi: { thumb, comment } };
    render(<FeedbackSection pluginId="p1" installed />);
    expect(screen.getByText('90%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /helpful/i }));
    await waitFor(() => expect(thumb).toHaveBeenCalledWith({ plugin_id: 'p1', value: 'up' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('posts a comment through window.claude.marketplaceApi.comment', async () => {
    (window as any).claude = { marketplaceApi: { thumb, comment } };
    render(<FeedbackSection pluginId="p1" installed />);
    fireEvent.change(screen.getByLabelText('Write a comment'), { target: { value: 'Does it work offline?' } });
    fireEvent.click(screen.getByRole('button', { name: /post comment/i }));
    await waitFor(() => expect(comment).toHaveBeenCalledWith({ plugin_id: 'p1', text: 'Does it work offline?' }));
  });

  it('renders no Report control on a comment (no backend for it in v1)', () => {
    (window as any).claude = { marketplaceApi: { thumb, comment } };
    render(<FeedbackSection pluginId="p1" installed />);
    expect(screen.queryByRole('button', { name: /report/i })).toBeNull();
  });

  it('disables voting until installed, with the reason', () => {
    (window as any).claude = { marketplaceApi: { thumb, comment } };
    render(<FeedbackSection pluginId="p1" installed={false} />);
    const btn = screen.getByRole('button', { name: /helpful/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toMatch(/install it first/i);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd /home/destin/youcoded-dev/worktrees/marketplace-ui/desktop && npx vitest run tests/feedback-section.test.tsx`
Expected: FAIL — `thumb` never called (the component calls a token-less HTTP client today).

- [ ] **Step 3: Rewire the component**

In `FeedbackSection.tsx` remove the `createMarketplaceApiClient` / `MARKETPLACE_API_HOST` import and the `const client = …` line, and replace `castVote` and `post`:

```ts
  // Votes and comments need the sign-in token, which lives in the main process —
  // so they go through window.claude.marketplaceApi (same path as theme likes),
  // never a renderer-side HTTP client. ApiResult: ok:false carries status+message.
  const castVote = (v: 'up' | 'down') => {
    if (!auth.signedIn) { setSignIn('vote'); return; }
    const next = vote === v ? null : v;
    setVote(next);
    window.claude.marketplaceApi.thumb({ plugin_id: pluginId, value: next })
      .then((r) => { if (r.ok) void stats.refresh(); else setVote(vote); })
      .catch(() => setVote(vote));
  };

  const post = () => {
    const text = draft.trim();
    if (!text) return;
    if (!auth.signedIn) { setSignIn('comment'); return; }
    setPosting(true);
    window.claude.marketplaceApi.comment({ plugin_id: pluginId, text })
      .then((r) => { if (r.ok) { setDraft(''); setRefresh((n) => n + 1); } })
      .catch(() => undefined)
      .finally(() => setPosting(false));
  };
```

If `window.claude` is typed without `marketplaceApi.thumb`, Task 8's `types.ts` edit provides it; `tsc` tells you.

- [ ] **Step 4: Fake the two channels in the workbench**

In `desktop/src/renderer/dev/workbench/mock-shim.ts`, inside the hand-written implementations, add (next to whatever `marketplaceApi` members exist; if none, add the object):

```ts
    marketplaceApi: {
      // Marketplace overhaul: the design's feedback actions. The HTTP side is
      // answered by fixtures/marketplace/worker-api-mock.ts; these mirror what
      // main would return so FeedbackSection's ApiResult handling runs for real.
      thumb: async (input: { plugin_id: string; value: 'up' | 'down' | null }) => {
        await fetch(`${MARKETPLACE_API_HOST}/thumbs`, { method: 'POST', body: JSON.stringify(input) });
        return { ok: true as const, value: { vote: input.value } };
      },
      comment: async (input: { plugin_id: string; text: string }) => {
        const r = await fetch(`${MARKETPLACE_API_HOST}/comments`, { method: 'POST', body: JSON.stringify(input) });
        const { id } = await r.json() as { id: string };
        return { ok: true as const, value: { id, hidden: false } };
      },
    },
```
(import `MARKETPLACE_API_HOST` from `../../state/marketplace-api-client` if not already imported.) Then run `node /home/destin/youcoded-dev/scripts/workbench-boot-check.mjs` against a running `bash scripts/run-workbench.sh marketplace-ui` — all routes must still mount. Do **not** register these in `mock-only.ts`: after Task 8 they have a real backend.

- [ ] **Step 5: Run the test, the gate, and commit**

Run: `npx vitest run tests/feedback-section.test.tsx` → PASS (4).
Run: `cd /home/destin/youcoded-dev && bash scripts/verify.sh marketplace-ui` → OK.

```bash
git add desktop/src/renderer/components/marketplace/FeedbackSection.tsx desktop/src/renderer/dev/workbench/mock-shim.ts desktop/tests/feedback-section.test.tsx
git commit -m "feat(marketplace): FeedbackSection votes and comments through the main-process channels"
```

---

### Task 10: Hand-check against the deployed Worker, then close out

- [ ] **Step 1: Prove the routes are live** (after the Task 6 PR merged and `worker-deploy.yml` ran green)

Run: `curl -s https://wecoded-marketplace-api.destinj101.workers.dev/comments/civic-report`
Expected: `{"comments":[]}` (or real rows).
Run: `curl -s https://wecoded-marketplace-api.destinj101.workers.dev/comments/superpowers/brainstorming`
Expected: `{"comments":[]}` — **not** a 404. This is the member-page path; a 404 here means
the two-segment route from Task 4 did not register.
Run: `curl -s https://wecoded-marketplace-api.destinj101.workers.dev/stats | python3 -c "import json,sys; d=json.load(sys.stdin); p=next(iter(d['plugins'].values())); print(sorted(p))"`
Expected: `['installs', 'rating', 'review_count', 'thumbs_down', 'thumbs_up']`

- [ ] **Step 2: Flag the interactive check for Destin — do not script it**

Tell Destin: launch `bash scripts/run-dev.sh marketplace-ui --label "Marketplace feedback"` (say so before it opens a window), open a plugin's page, sign in, vote, post a comment, reload — the vote and comment persist. That is his 30-second pass.

- [ ] **Step 3: ROADMAP + docs**

In `ROADMAP.md`'s overhaul entry, note "feedback routes shipped <date>"; the deferred items in the spec §5 stay. Nothing to archive yet — the branch is not merged until Plan 3 lands (the cards still need the catalog for their badges).

Add these ROADMAP items in the same session:
- **Delete your own comment** — reviews had it (`marketplace:rate:delete`), comments do not, on any platform.
- **Report a comment** — needs a `reports` schema that can key to a comment id, not just a rating; the button is deliberately absent until then (spec §5).
- Whatever Task 0 found about `checkRateLimit` — either "moved to D1, ratings/reports/installs now genuinely limited" or "verified working on workers.dev, no change".
