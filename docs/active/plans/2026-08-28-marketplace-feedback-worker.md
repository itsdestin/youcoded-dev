---
status: shipped
created: 2026-08-28
shipped: 2026-08-28
spec: docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md
part: 1 of 3 (feedback routes) — see also 2026-08-28-marketplace-catalog-service.md, 2026-08-28-marketplace-app-wiring.md
---

# Marketplace Feedback (thumbs + comments) Implementation Plan

> **SHIPPED 2026-08-28.** Worker: `wecoded-marketplace` PRs #71, #72, #73 — all merged and
> deployed green, routes hand-verified against production. App: committed on `youcoded`
> branch `feat/marketplace-overhaul-ui`, unmerged pending Plans 2–3.
>
> **What hand-verification found that this plan did not predict.** Every item below was
> invisible to 229 Worker tests and a green desktop gate; each was caught by voting in a dev
> build, and the last three by attaching a debugger to the live renderer rather than
> reasoning about the code.
>
> 1. **The install gate refused votes on plugins the user demonstrably had.** `installs` only
>    ever recorded installs made *while signed in*. Bundled plugins are auto-installed at
>    launch by `skill-provider.installMany()` and were never reported at all — so nobody
>    could vote on the three plugins every user has. Same for anything installed while signed
>    out or on another device. Fixed by an install reconcile (`desktop/src/main/install-reconcile.ts`,
>    on sign-in and at launch) plus a batch `POST /installs` (#72) so it costs one request and
>    one rate-limit tick instead of N.
> 2. **…and reconciling plugin DIRECTORIES was not enough.** The provider surfaces each
>    scanned skill as its own marketplace item with its own Feedback section
>    (`superpowers:brainstorming` — 22 on one profile). Votes are cast in that id space, so
>    the reconcile must report it too. Missing this moved the same failure one level down.
> 3. **`GET /thumbs/:id` had to return the plugin's totals, not just the caller's vote** (#73).
>    Seeding only the vote produced a **lit thumb beside "No votes yet"** on reopen: the vote
>    was fresh from the server while the count fell back to the `/stats` snapshot taken at app
>    start. `/stats` is `max-age=300`, so it can never be refreshed into agreeing.
> 4. **The card is a third consumer, and it was stale AND wrong.** Cards read
>    `plugins[id]` from the stats context, which nothing updated after a vote — the detail
>    page said 0% while its own card said 100%. Fixed with `applyThumbs()` on the stats
>    context. Separately, `ThumbsSummary` (what every card renders) had no low-count guard, so
>    one like showed **"100%"**; below `MIN_VOTES_FOR_PCT` it now shows the raw count.
> 5. **A main-process handler silently dropped two fields** and nothing caught it: `tsc` was
>    happy, and every component test mocks that layer, so `verify.sh` went green with the bug
>    in place. Guard added in `ipc-channels.test.ts` (mutation-tested).
>
> **The through-line: three of the five are the same mistake — the app and the Worker
> disagreeing about an id, or a number living in more than one place.** Plans 2 and 3 touch
> both again; check any new count against every surface that renders it, and any new id
> against the space the UI actually uses.
>
> **Also corrected here:** `checkRateLimit` was measured **dead in production** (160 requests
> against a 60/min limit, zero 429s — the Cache API is a no-op on `*.workers.dev`), and
> `test/setup.ts`'s Workers AI stub was found never to have worked, so the classifier's
> flagged path is unreachable under vitest. Both documented at their source.
>
> **Not verified:** the Android code has never been compiled — no Android SDK on this
> machine. It is Kotlin-consistent with its neighbours, nothing more.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the approved Feedback section real — one-tap Helpful / Not for me votes and an open comment thread per plugin — by adding **seven** Worker routes (two of them the two-segment twins that bundle-member ids need, two of them the admin takedown pair), extending `/stats` and `/auth/export`, and wiring the app to them through the main process (where the sign-in token lives).

**Architecture:** Two new D1 tables (`thumbs`, `comments`) in the WeCoded Worker (Hono on Cloudflare, D1, vitest-pool-workers). `POST /thumbs` and `POST /comments` are authed writes that follow the existing `POST /ratings` shape (install gate, rate limit, llama-guard moderation → `hidden`); `GET /comments/:plugin_id` is a public read like `GET /ratings/:plugin_id`. The app reaches the authed routes through **three** new IPC channels (`marketplace:thumb`, `marketplace:thumb:get`, `marketplace:comment`) registered exactly like `marketplace:rate`, on desktop main + preload + remote-shim + Android `SessionService.kt`; the public read stays a direct `fetch` from the renderer like `listRatings`. The workbench keeps its fake Worker (it must never hit production).

**Tech Stack:** TypeScript, Hono, Cloudflare Workers + D1, vitest 2.1 + `@cloudflare/vitest-pool-workers` 0.5 (Worker); Electron main/preload + React renderer + Kotlin/OkHttp (app).

## Global Constraints

- Worker error bodies are **plain-text lowercase messages, no trailing period** (`src/lib/errors.ts`), e.g. `must install plugin before rating`. Writes return `{ ok: true, ... }`; list reads return one named array (`{ comments: [...] }`).
- New Worker routes parse JSON with `parseJsonBody` (`src/lib/parse-json.ts`), never `c.req.json()` directly. (Existing `POST /ratings` and `POST /reports` still call `c.req.json()`, so malformed input there returns a 500 with a parser message instead of a 400 — a two-line drive-by fix if you want it, but in its own commit, not this feature's.)
- Any public `GET` must be added to `isPublicReadPath()` in `worker/src/index.ts` (lines 64–71) or Android's `Origin: null` WebView is blocked by CORS.
- `[env.test]` in `wrangler.toml` does not inherit bindings; this plan adds none.
- Migrations are `worker/migrations/NNNN_snake_case.sql`; this plan is **0005**, unconditionally — it merges before the catalog plan, which is 0006. Do **not** renumber either: D1 records applied migrations by filename and applies them in order, so inserting a lower number after a higher one has already run applies it out of order. CI applies them (`worker-deploy.yml`) — never run `wrangler deploy` by hand.
- **Plugin ids may contain a slash.** A bundle member is `<bundle>/<name>` (spec §1.4) and has its own page with its own Feedback section. `validateId` is length-only (1–128 chars) so the id passes, but a Hono `:param` does not cross a slash and `isPublicReadPath` rejects a second segment — every id-taking route added here must accept one **or two** segments (Task 4).
- Worker tests share one D1 (`singleWorker: true`): every `describe` that writes must `DELETE FROM` its tables in `beforeEach`.
- **Any new user-owned table must opt in to `GET /auth/export`.** That endpoint pins its column list per table and says so in a comment at `src/auth/account.ts:201` — a table added without editing it is silently missing from "export my data". Both new tables qualify (Task 4d). Deletion needs nothing: `DELETE /auth/account` deletes the `users` row and both tables carry `ON DELETE CASCADE`.
- App IPC channels for marketplace writes are string literals in `desktop/src/main/marketplace-api-handlers.ts` (`CHANNELS` array + `ipcMain.handle("…")`), inlined constants in `desktop/src/main/preload.ts` `IPC` block, `invoke('…')` in `desktop/src/renderer/remote-shim.ts`, and a `"…" -> { }` arm in `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`. (`remote-server.ts` has no `marketplace:rate` case today — the remote browser cannot rate either; this plan matches that, it does not fix it.)
- Copy: "Helpful" / "Not for me" / "Post comment" as approved; comment limit **2000** characters; comments need sign-in only, votes need sign-in **and** a prior install.
- **A vote that fails must not look like it worked.** The mockup's `castVote` swallows every error (`.catch(() => undefined)`) while leaving the thumb lit — and today it fails *every time*, because the component builds its API client with `getToken: () => null` and the route needs a token. Task 9 fixes the token; it must also stop the swallowing. Optimistic UI is fine; optimistic UI that never reconciles is a lie.
- **`plugin_id` is not checked against anything.** `validateId` only bounds the length, so votes, comments and installs can be recorded for ids that do not exist. The Worker has no way to know what is real until Plan 2 creates `catalog_items` — so the existence check lands in **Plan 2** (its Task 5), not here. Do not try to add it in this plan.
- **No Report button on comments in v1** (spec §5). Not because `reports` cannot hold one — its PK is a plain random id and `rating_user_id` / `rating_plugin_id` are loose columns with no FK — but because pointing it at a comment needs a real migration (a nullable `comment_id`, plus relaxing two `NOT NULL`s, i.e. a SQLite table rebuild) *and* the reporting UI, admin queue and resolution flow to go with it. Out of scope, not impossible. Meanwhile ship no affordance rather than a mis-aimed one — see the CommentList note in Task 9.
- App work happens on `youcoded` branch `feat/marketplace-overhaul-ui` (worktree `worktrees/marketplace-ui`); Worker work on a new `wecoded-marketplace` branch `feat/feedback-routes` (from `master`). Run `bash scripts/verify.sh marketplace-ui` (workspace root) before calling any app task done; `cd worker && npm test && npm run typecheck` for Worker tasks.

---

## File structure

**Worker (`/home/destin/youcoded-dev/wecoded-marketplace/worker`)**
- Create `migrations/0005_feedback.sql` — `thumbs` + `comments` tables.
- Create `src/feedback/routes.ts` — `feedbackRoutes` (POST /thumbs, GET /thumbs/:id, GET /comments/:plugin_id, POST /comments, the two `/admin/comments` routes).
- Create `src/feedback/validate.ts` — `MAX_COMMENT_LEN`, `validateCommentText`, `parseVote`.
- Modify `src/index.ts` — mount `feedbackRoutes`; extend `isPublicReadPath` for `/comments/<id>`.
- Modify `src/stats/routes.ts` — add `thumbs_up` / `thumbs_down` per plugin.
- Modify `src/auth/account.ts` — `GET /auth/export` gains the caller's `thumbs` and `comments` rows (that endpoint's own comment makes opting in mandatory for any new user-owned table).
- Create `test/feedback.test.ts`, `test/feedback-validate.test.ts`; modify `test/schema.test.ts`, `test/stats.test.ts`, `test/cors.test.ts`, `test/account.test.ts`.
- Modify `README.md` (moderation section), `../docs/worker-backend.md` (route list).

**Every Worker file in this plan is `src/feedback/*` and `test/feedback*.ts`** — one router,
`feedbackRoutes`, carrying all six routes. Do not split the comment routes into a
`src/comments/routes.ts` / `commentRoutes` of their own: a second router is easy to write and
easy to forget to `app.route()`, and the failure is silent — every test green, both routes
404 in production.

**App (`/home/destin/youcoded-dev/worktrees/marketplace-ui`)**
- Modify `desktop/src/renderer/state/marketplace-api-client.ts` — return types match the Worker (`{ ok, vote }`, `{ ok, hidden, id }`).
- Modify `desktop/src/main/marketplace-api-handlers.ts` — `marketplace:thumb`, `marketplace:comment` handlers.
- Modify `desktop/src/main/preload.ts`, `desktop/src/renderer/remote-shim.ts`, `desktop/src/renderer/hooks/useIpc.ts` (window typing) — expose `marketplaceApi.thumb` / `.myThumb` / `.comment`.
- Modify `app/src/main/kotlin/com/youcoded/app/marketplace/MarketplaceApiClient.kt` + `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` — Android parity.
- Modify `desktop/src/renderer/components/marketplace/FeedbackSection.tsx` — call the channels, not a token-less client.
- Modify `desktop/tests/ipc-channels.test.ts` — parity block for the two channels.
- Modify `desktop/src/renderer/dev/workbench/mock-shim.ts` — fake `marketplaceApi.thumb/myThumb/comment`.
- Modify `desktop/src/renderer/dev/workbench/fixtures/marketplace/worker-api-mock.ts` — it already answers `POST /thumbs`, `POST /comments` and `GET /comments/…` (lines 44–60) but has **no `GET /thumbs/<id>` arm**, so the new "remember my vote" read falls through to the real network in the workbench. Add it.

---

### Task 0: Prove the rate limiter actually limits (measure, then move on)

`checkRateLimit` (`worker/src/lib/rate-limit.ts`) keeps its counters **only** in the
Cloudflare Cache API. Cloudflare documents the Cache API as having **no effect on
`*.workers.dev` deployments**, and the Worker is served from
`wecoded-marketplace-api.destinj101.workers.dev`. If that holds, every call returns
"allowed" and this plan's 20-comments-per-hour brake does not exist. That mattered less for
ratings (install-gated, one row per plugin); an **open comment box needs sign-in only**, so
one account could post without limit.

> **The actual cure is a custom domain, and it is not in this plan.** The Cache API — and
> therefore Cloudflare's edge cache in general — is a no-op on `*.workers.dev`. On a real
> domain the limiter works as originally written *and* `GET /catalog` stops being re-served
> from D1 on every refresh (Plan 2, Task 4). One DNS change fixes both. Until it happens the
> Worker cannot brake abuse at all, which is why comments are sign-in-gated and moderated
> and why Task 4c exists.
> ROADMAP: "Put the Worker on a custom domain".

- [ ] **Step 1: Measure it against production — with a READ, never a write**

```bash
time (for i in $(seq 1 70); do
  curl -s -o /dev/null -w "%{http_code} " \
    https://wecoded-marketplace-api.destinj101.workers.dev/ratings/does-not-exist &
done; wait); echo
```

`GET /ratings/:plugin_id` runs the same `checkRateLimit` (60 requests / 60 seconds, keyed by
IP, counters held in a named cache — `caches.open("rl")`, `src/lib/rate-limit.ts:5`).
Expected if the limiter works: ~60× `200` then `429`s. Expected if it does not: 70× `200`.

**Fire them in parallel and watch the clock.** Serial `curl`s against a cold Worker can
easily take longer than the 60-second window, in which case the counter resets mid-run and
you see 70 successes whether the limiter works or not — a false all-clear on the one question
this task exists to answer. If the run takes anywhere near 60s, re-run it.

**Do not measure this with `POST /reports`.** That route never checks that the reported
rating exists (`src/reports/routes.ts:23` only checks the fields are present), so 70 calls
would permanently insert 70 junk rows into the production database that you would then have
to hand-delete. The read above answers the identical question, needs no sign-in, and writes
nothing.

- [ ] **Step 2: Record the answer. Do not fix it here.**

Write what you measured into `ROADMAP.md` under "Put the Worker on a custom domain" — that
one DNS change fixes the limiter, the edge cache, and Plan 2's `GET /catalog` re-serve
together, and it is the fix.

**The database-backed counter is deliberately not in this plan.** It is the obvious
workaround and it is the wrong shape for a feature branch: it rewrites a shared function nine
other routes depend on, and because `checkRateLimit` also guards the *public* reads
(`GET /ratings/:id`, `GET /comments/:id`), it charges a database write for every anonymous
page view — a standing bill and added latency on the hottest path in the Worker, to fix a
problem a DNS record fixes for free. If the measurement comes back bad and the domain cannot
happen soon, that is its own PR with its own review, not a step buried in Task 0.

What this plan does about it meanwhile: nothing, knowingly. Comments are sign-in-gated and
moderated, and Task 4c gives you a takedown path. That is the v1 answer.

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
    expect(() => validateCommentText(42)).toThrow("comment must be text");
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
  // Two different failures, two different messages: a number is not an empty
  // comment, and saying so would be a wrong cause in a user-facing string
  // (CLAUDE.md → "Never write misleading error messages").
  if (typeof raw !== "string") throw new Error("comment must be text");
  const trimmed = raw.trim();
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
Expected: PASS (6 tests)

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
- Produces: `POST /thumbs` body `{ plugin_id: string; value: "up" | "down" | null }` → `200 { ok: true, vote: "up" | "down" | null, thumbs_up: number, thumbs_down: number }`; `403 must install plugin before voting`; `400 invalid plugin_id` / `value must be up, down or null`; `429 too many votes per hour`; `401` without a token.

> **Why the write hands back the totals.** One extra `SELECT` in a route already doing a
> write, and the button can update the number on the spot. Without it the app has to
> re-fetch `/stats` after every click, and that path is broken three ways: `/stats` is served
> `Cache-Control: public, max-age=300` (`stats/routes.ts:38`) while `refresh()` only bypasses
> the app's *own* in-memory cache (`marketplace-stats-context.tsx:126`) and issues an
> ordinary GET the HTTP layer is free to answer from its cached copy — so the count would sit
> unchanged for up to five minutes right after you voted, which is the exact "did that save?"
> doubt Task 4b exists to remove. It also flips a global `loading` flag (line 89) that every
> card on screen reads, and re-downloads install/vote totals for the whole marketplace on
> every single click, phone included. Returning the totals deletes all three problems and the
> last-response-wins race along with them.

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
    expect(await res.json()).toEqual({ ok: true, vote: "up", thumbs_up: 1, thumbs_down: 0 });
    let row = await env.DB.prepare("SELECT vote FROM thumbs WHERE user_id = ? AND plugin_id = ?")
      .bind(account.userId, "foo:bar").first<{ vote: number }>();
    expect(row).toEqual({ vote: 1 });

    res = await post("/thumbs", token, { plugin_id: "foo:bar", value: "down" });
    expect(await res.json()).toEqual({ ok: true, vote: "down", thumbs_up: 0, thumbs_down: 1 });
    row = await env.DB.prepare("SELECT vote FROM thumbs WHERE user_id = ? AND plugin_id = ?")
      .bind(account.userId, "foo:bar").first<{ vote: number }>();
    expect(row).toEqual({ vote: -1 });

    res = await post("/thumbs", token, { plugin_id: "foo:bar", value: null });
    // SUM over an empty table is NULL — the route must normalize it to 0.
    expect(await res.json()).toEqual({ ok: true, vote: null, thumbs_up: 0, thumbs_down: 0 });
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
// One vote per (user, plugin); null clears it. Install-gated like ratings.
// Honest about what that buys: it stops a drive-by, not a determined actor —
// POST /installs takes any string as a plugin_id with no existence or provenance
// check, so anyone can record a fake install and then vote. Plan 2's
// catalog_items existence check is what turns this into a real gate.
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
  } else {
    await c.env.DB
      .prepare(
        `INSERT INTO thumbs (user_id, plugin_id, vote, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, plugin_id) DO UPDATE SET vote = excluded.vote, updated_at = excluded.updated_at`
      )
      .bind(userId, pluginId, vote, now, now)
      .run();
  }

  // Hand the fresh totals back with the write. One indexed read (idx_thumbs_plugin),
  // and it is the difference between the number moving when you click and the app
  // re-downloading the whole marketplace's stats to find out — see the note above.
  const totals = await c.env.DB
    .prepare(
      `SELECT SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS up,
              SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS down
       FROM thumbs WHERE plugin_id = ?`
    )
    .bind(pluginId)
    .first<{ up: number | null; down: number | null }>();
  return c.json({
    ok: true,
    vote: vote === null ? null : vote === 1 ? "up" : "down",
    // SUM over zero rows is NULL, not 0.
    thumbs_up: totals?.up ?? 0,
    thumbs_down: totals?.down ?? 0,
  });
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
- Consumes: `classifyReview(ai, text)` (`src/ratings/moderation.ts:31` — reused as-is; it is a generic text classifier), `randomToken(16)` (`src/lib/crypto.ts:3` — 16 bytes → 32 hex chars, matching the test's `/^[0-9a-f]{32}$/`), `validateCommentText` (Task 2).

**The flagged path IS testable — test it.** `[env.test]` omits the AI binding, but
`test/setup.ts:9` installs a stand-in (`(env as any).AI = { run: async () => ({ response:
"safe" }) }`) precisely so `classifyReview` runs its real code in tests. Swap what it answers
for one case and the whole moderate → store hidden → never list it path is proved before it
ships. No existing test does this — `ratings.test.ts` only ever inserts `hidden = 1` rows by
hand — so this is new coverage on a path that otherwise first executes in production:

```ts
  it("stores a flagged comment hidden, and never lists it", async () => {
    const { token } = await seed();
    const ai = (env as any).AI;
    const original = ai.run;
    ai.run = async () => ({ response: "unsafe\nS1" });   // llama-guard's own wire format
    try {
      const res = await post("/comments", token, { plugin_id: "foo:bar", text: "nasty" });
      expect(await res.json<{ hidden: boolean }>()).toMatchObject({ hidden: true });
    } finally {
      ai.run = original;   // restore, or every later test in the shared worker is moderated
    }
    const { comments } = await (await SELF.fetch("https://test.local/comments/foo%3Abar"))
      .json<{ comments: unknown[] }>();
    expect(comments).toEqual([]);
  });
```
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
// 404 every member page's comment thread. The two patterns have different segment
// counts, so they can never both match one URL and registration order is
// irrelevant; they are written two-then-one only to read in the same order as the
// comment above.
//
// If you would rather have one: Hono 4 supports a regex param (`/comments/:plugin_id{.+}`)
// that matches across slashes, which would collapse these two — and the two /thumbs
// routes — into one each. PROVE IT FIRST with a throwaway test on both a one- and a
// two-segment id: RegExpRouter rejects some patterns outright and quietly falls back to
// TrieRouter, and a wrong guess here 404s every bundle-member page.
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

### Task 4b: `GET /thumbs/:plugin_id` — what did *I* vote?

**Files:**
- Modify: `worker/src/feedback/routes.ts`, `worker/test/feedback.test.ts`

**Why this exists:** without it the buttons forget you. `/stats` carries the totals but not
*your* row, and the component seeds its state from nothing — so you vote 👍, close the page,
reopen it, and neither thumb is lit. The user reads that as "my vote didn't save" and votes
again. One authed read fixes it.

**Interfaces:**
- Produces: `GET /thumbs/:plugin_id` and `GET /thumbs/:bundle/:name`, `requireAuth` → `200 { vote: "up" | "down" | null }`. Authed, so it is **not** a public read path — the renderer calls it only when signed in.

- [ ] **Step 1: Failing test** — append to `worker/test/feedback.test.ts`:

```ts
describe("GET /thumbs/:plugin_id", () => {
  beforeEach(async () => {
    for (const t of TABLES) await env.DB.prepare(`DELETE FROM ${t}`).run();
  });

  it("401s without a token", async () => {
    expect((await SELF.fetch("https://test.local/thumbs/foo:bar")).status).toBe(401);
  });

  it("returns null before voting, then the vote, for plugin and member ids", async () => {
    const { token, account } = await seed();
    const get = (id: string) => SELF.fetch(`https://test.local/thumbs/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(await (await get("foo:bar")).json()).toEqual({ vote: null });
    await seedInstall(account.userId, "foo:bar");
    await post("/thumbs", token, { plugin_id: "foo:bar", value: "down" });
    expect(await (await get("foo:bar")).json()).toEqual({ vote: "down" });

    await seedInstall(account.userId, "superpowers/brainstorming");
    await post("/thumbs", token, { plugin_id: "superpowers/brainstorming", value: "up" });
    expect(await (await get("superpowers/brainstorming")).json()).toEqual({ vote: "up" });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/feedback.test.ts` → FAIL (404s).

- [ ] **Step 3: Implement** — append to `worker/src/feedback/routes.ts`:

```ts
// GET /thumbs/<id> → { vote } — the CALLER's own vote, so the buttons can show
// what you already chose instead of resetting every time the page opens.
// Authed and per-user, therefore deliberately NOT in isPublicReadPath.
async function myVote(c: Context<HonoEnv>, pluginId: string) {
  // Same per-user brake as its neighbours — this was the one route without one.
  if (!(await checkRateLimit(`thumbs-get:${c.get("userId")}`, 120, 60))) {
    throw tooMany("too many requests");
  }
  const row = await c.env.DB
    .prepare("SELECT vote FROM thumbs WHERE user_id = ? AND plugin_id = ?")
    .bind(c.get("userId"), validateId(pluginId))
    .first<{ vote: number }>();
  return c.json({ vote: row ? (row.vote === 1 ? "up" : "down") : null });
}
feedbackRoutes.get("/thumbs/:bundle/:name", requireAuth, (c) => myVote(c, `${c.req.param("bundle")}/${c.req.param("name")}`));
feedbackRoutes.get("/thumbs/:plugin_id", requireAuth, (c) => myVote(c, c.req.param("plugin_id")));
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `git add src/feedback/routes.ts test/feedback.test.ts && git commit -m "feat(worker): GET /thumbs/:id — the caller's own vote"`.

---

### Task 4c: A comment can be taken down

v1 ships **no** Report button and **no** delete-your-own (both deferred, spec §5).

Be accurate about why, because the reason is repeated in the spec and will outlive this plan:
`reports` is *not* structurally welded to ratings. Its primary key is a plain random id
(`migrations/0001:68`); `rating_user_id` / `rating_plugin_id` are ordinary `TEXT NOT NULL`
columns with **no** foreign key to `ratings`. Pointing a report at a comment needs a nullable
`comment_id` column plus relaxing those two `NOT NULL`s — in SQLite that is a table rebuild,
which this repo already does routinely (migration 0003 rebuilds five tables). So: a real
migration and a real afternoon, **not** a redesign. Deferring it is still the right call for
v1 — it just costs less than "cannot without a schema change" implies, and the reporting UI,
admin queue and resolution flow are the actual work.
That is fine for the reader; it is not fine for us. As written, the only remedy for a
comment the classifier let through is hand-editing the production database. A public
comment box with no takedown path is not something to ship and fix later.

Two routes, mirroring `DELETE /admin/ratings/:user_id/:plugin_id` (`src/reports/routes.ts:38`)
exactly — same gate, same `hidden = 1` mechanism the classifier already uses, so a hidden
comment disappears from `GET /comments/:id` with no further work.

**Files:**
- Modify: `worker/src/feedback/routes.ts` — the same module Tasks 3/4/4b built (see File structure)
- Test: `worker/test/feedback.test.ts`

**Interfaces:**
- `GET /admin/comments?hidden=0|1&limit=100` (`requireAuth` + `requireAdminAccount`) →
  `{ comments: Array<{ id, plugin_id, user_id, text, created_at, hidden }> }`, newest first.
  There is no report queue to work from, so this is the queue: the recent comments, readable.
- `DELETE /admin/comments/:id` (same gate) → `{ ok: true }`; `404` when the id is unknown,
  which is the same "your list was stale" honesty the permissions screen uses. Sets
  `hidden = 1` — never deletes the row, so a mistaken takedown is reversible by hand and the
  author's other comments are untouched.

- [ ] **Step 1: Failing tests** — append to `test/feedback.test.ts`, inside a new
`describe("admin comment takedown")` with the same `beforeEach` table-clearing loop as the
other blocks (`424242` is the admin github id in `[env.test.vars] ADMIN_USER_IDS`):

```ts
  it("an admin can hide a comment, and a non-admin cannot", async () => {
    const author = await createTestAccount({ githubId: "1", login: "u" });
    const authorToken = await issueTestSession(author);
    await SELF.fetch("https://test.local/comments", { method: "POST",
      headers: { Authorization: `Bearer ${authorToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ plugin_id: "foo", text: "something awful" }) });
    const { comments } = await (await SELF.fetch("https://test.local/comments/foo")).json<{ comments: Array<{ id: string }> }>();
    const id = comments[0]!.id;

    // A signed-in non-admin is refused (403, not 401 — they ARE authenticated).
    expect((await SELF.fetch(`https://test.local/admin/comments/${id}`, { method: "DELETE",
      headers: { Authorization: `Bearer ${authorToken}` } })).status).toBe(403);

    const adminToken = await issueTestSession(await createTestAccount({ githubId: "424242", login: "admin" }));
    const admin = { Authorization: `Bearer ${adminToken}` };
    expect((await SELF.fetch(`https://test.local/admin/comments/${id}`, { method: "DELETE", headers: admin })).status).toBe(200);

    // Gone from the public read, still in the table, and visible in the admin queue.
    expect((await (await SELF.fetch("https://test.local/comments/foo")).json<{ comments: unknown[] }>()).comments).toEqual([]);
    const q = await (await SELF.fetch("https://test.local/admin/comments?hidden=1", { headers: admin })).json<{ comments: Array<{ id: string }> }>();
    expect(q.comments.map((c) => c.id)).toEqual([id]);
  });

  it("hiding an id that is not there reports it, rather than claiming success", async () => {
    const adminToken = await issueTestSession(await createTestAccount({ githubId: "424242", login: "admin" }));
    expect((await SELF.fetch("https://test.local/admin/comments/nope", { method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` } })).status).toBe(404);
  });
```

- [ ] **Step 2: Run** → FAIL (404 on both admin paths).

- [ ] **Step 3: Implement** — append to `src/feedback/routes.ts`:

```ts
// Moderation. There is no Report button in v1 and no report queue behind it, so the
// queue IS the recent-comments list: an admin reads it and hides what does not belong.
// Same gate and same `hidden` flag as DELETE /admin/ratings/:user_id/:plugin_id.
// No UI: these are curl-from-a-terminal routes, called with an admin session token
// (`Authorization: Bearer …`). Not a public read path, so no CORS entry is needed.
feedbackRoutes.get("/admin/comments", requireAuth, async (c) => {
  await requireAdminAccount(c);
  const hidden = c.req.query("hidden") === "1" ? 1 : 0;
  const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
  const { results } = await c.env.DB
    .prepare("SELECT id, plugin_id, user_id, text, created_at, hidden FROM comments WHERE hidden = ? ORDER BY created_at DESC LIMIT ?")
    .bind(hidden, limit).all();
  return c.json({ comments: results });
});

// Hides, never deletes: a takedown must be reversible, and the row is the only record
// that the comment existed at all.
feedbackRoutes.delete("/admin/comments/:id", requireAuth, async (c) => {
  await requireAdminAccount(c);
  const res = await c.env.DB.prepare("UPDATE comments SET hidden = 1 WHERE id = ?").bind(c.req.param("id")).run();
  if (res.meta.changes === 0) throw notFound("comment not found");
  return c.json({ ok: true });
});
```
(import `requireAdminAccount` from `../auth/admin` and `notFound` from the errors module the
file already uses for `badRequest`.)

- [ ] **Step 4: Run** `npx vitest run test/feedback.test.ts && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `git add src/feedback/routes.ts test/feedback.test.ts && git commit -m "feat(worker): admin can hide a comment"`.

---

### Task 4d: `thumbs` and `comments` join the data export

`GET /auth/export` (`src/auth/account.ts:191`) hands a user every row of their own data. It
enumerates eleven tables by explicit column list, and carries this instruction in the file:

> *"Every export query pins its column list — never SELECT \* here. A future migration adding
> a column to these tables must OPT IN to the export by editing this endpoint, not leak
> silently through a wildcard."*

This plan adds two user-owned tables, one of which holds free text the user wrote. Skipping
this step means "export my data" quietly omits every comment they ever posted. Account
*deletion* already works — both tables carry `ON DELETE CASCADE` on `user_id`, and
`DELETE /auth/account` deletes the `users` row — so this task is the export half only.

**Files:**
- Modify: `worker/src/auth/account.ts`
- Test: `worker/test/account.test.ts` (whichever file covers `/auth/export` — find it with
  `rg -l "auth/export" test/`)

- [ ] **Step 1: Failing test** — seed one thumb and one comment for the exporting account,
  then assert `body.thumbs` and `body.comments` carry them. Expected: FAIL (both undefined).

- [ ] **Step 2: Implement** — add two entries to the `Promise.all([...])` destructuring and
  array, pinned columns like every neighbour:

```ts
    db.prepare("SELECT user_id, plugin_id, vote, created_at, updated_at FROM thumbs WHERE user_id = ?").bind(userId).all(),
    // The user's own comments INCLUDING hidden ones: a comment they wrote is
    // theirs to export whether or not the classifier let it through, and seeing
    // `hidden: 1` is how they learn it was held.
    db.prepare("SELECT id, plugin_id, text, created_at, hidden FROM comments WHERE user_id = ?").bind(userId).all(),
```

…and the two matching keys in the returned JSON (`thumbs: all(thumbs)`, `comments: all(comments)`).

- [ ] **Step 3: Run** `npx vitest run test/account.test.ts && npm run typecheck` → PASS.
- [ ] **Step 4: Commit** `git commit -m "feat(worker): data export carries thumbs + comments"`.

---

### Task 5: `GET /stats` gains `thumbs_up` / `thumbs_down`

**Files:**
- Modify: `worker/src/stats/routes.ts` (whole file is 44 lines)
- Test: `worker/test/stats.test.ts`

**Interfaces:**
- Produces: every `plugins[id]` in `/stats` has `thumbs_up: number` and `thumbs_down: number` (0 when none). `themes` is unchanged.

> **Do not add `themes[slug].installs` here**, however obvious it looks. It rests on the
> assumption that a theme install is recorded like a plugin install, and it is not:
> `installTheme()` (`marketplace-context.tsx:285`) installs to disk and never calls
> `marketplaceApi.install()` — the sole caller is the skill path at line 253, confirmed by
> `rg "postInstall|/installs" desktop/src app/src/main/kotlin`. The `installs` table holds
> **zero** theme rows, so the field would read `0` on every theme card forever. Making it
> real is a one-line app change (`installTheme` also calling
> `marketplaceApi.install('theme:' + slug)`) and belongs with the card work in **Plan 3**,
> with the `/stats` half following it. ROADMAP item in Task 10; Plan 3 and spec §2 updated.

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

Change line 7 to (line 8, `ThemeAgg`, is unchanged):
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

The `themes` block (line 35–36) is **not** touched — see the cut note above.

- [ ] **Step 4: Run to see it pass, then the whole suite**

Run: `npx vitest run test/stats.test.ts && npm test && npm run typecheck`
Expected: stats PASS; full suite PASS; typecheck clean.

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
`GET /admin/comments` lists recent comments (add `?hidden=1` to see what has already been
taken down) and `DELETE /admin/comments/:id` hides one. Both need an admin GitHub identity,
the same gate as `DELETE /admin/ratings/:user_id/:plugin_id`. Hiding never deletes the row.
**This is the only takedown path in v1** — there is no user-facing Report button on comments
(pointing `reports` at a comment needs a migration plus a whole reporting flow; see the
spec's deferred list).

Comments (`POST /comments`) go through the same `llama-guard-3-8b` classifier as
reviews; a flagged comment is stored with `hidden = 1` and never listed by
`GET /comments/:plugin_id`. Thumbs (`POST /thumbs`) carry no text and are not
classified; they are install-gated instead (one vote per account per plugin).
```

In `docs/worker-backend.md`, add to the route list:

```markdown
| `POST /thumbs` | auth + prior install | `{ plugin_id, value: "up" \| "down" \| null }` → `{ ok, vote, thumbs_up, thumbs_down }` — the write returns the new totals so clients never re-fetch `/stats` |
| `POST /comments` | auth | `{ plugin_id, text ≤ 2000 }` → `{ ok, id, hidden }` |
| `GET /comments/:plugin_id` | public (any origin) | `{ comments: [...] }` newest first, 50 max |
| `GET /thumbs/:plugin_id` | auth | `{ vote: "up" \| "down" \| null }` — the caller's own vote |
| `GET /admin/comments` | auth + admin | `?hidden=0\|1&limit=100` → `{ comments: [...] }` — the takedown queue |
| `DELETE /admin/comments/:id` | auth + admin | sets `hidden = 1`; `404` when the id is unknown |
| `GET /stats` | public | now includes `thumbs_up` / `thumbs_down` per plugin |
| `GET /auth/export` | auth | now includes the caller's `thumbs` and `comments` |
```

**Separately, in its own commit (do not fold into the feature PR):** the README claims three
route groups and the Worker serves **eleven** (12 route modules) — `/social`, `/sync`, `/app`,
`/stats` and `/reports` go undocumented. Worth fixing, but it is unrelated churn inside a PR
someone has to review for correctness, so give it its own commit (or its own PR) rather than
burying it here.

- [ ] **Step 2: Commit, push, open the PR**

```bash
git add worker/README.md docs/worker-backend.md
git commit -m "docs(worker): feedback routes"
git push -u origin feat/feedback-routes
gh pr create --repo itsdestin/wecoded-marketplace --title "feat(worker): marketplace feedback — thumbs + comments" --body "$(cat <<'EOF'
Adds the backend for the approved Feedback section (youcoded-dev docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md §1.7).

- migration 0005: `thumbs`, `comments`
- `POST /thumbs` (auth + prior install, one vote per user per plugin, null clears; returns the new totals) + `GET /thumbs/:id` (the caller's own vote)
- `POST /comments` (auth, ≤2000 chars, llama-guard → hidden) + public `GET /comments/:plugin_id`
- `GET /admin/comments` + `DELETE /admin/comments/:id` — the only takedown path in v1
- `/stats` gains `thumbs_up` / `thumbs_down`; `/auth/export` gains both new tables
- CORS: `/comments/<id>` is a public read like `/ratings/<id>`, and accepts a two-segment bundle-member id

Merging deploys via worker-deploy.yml (tests → migrations → deploy).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(No session link is baked in here on purpose — a hard-coded one points at whichever session
wrote the plan, not the one that did the work. Add the executing session's link if you want
one.)

Expected: PR opens; `Worker CI` must be green before merge. **Merge it before starting Task 8** — the app's real calls need the routes live.

---

### Task 7: App — client return types match the Worker

**Files:**
- Modify: `desktop/src/renderer/state/marketplace-api-client.ts` (the three `listComments` / `postComment` / `setThumb` members added on the branch)

**Interfaces:**
- Produces: `postComment(input): Promise<{ ok: true; id: string; hidden: boolean }>`; `setThumb(input): Promise<{ ok: true; vote: "up" | "down" | null }>`; `getThumb(pluginId: string): Promise<{ vote: "up" | "down" | null }>` (GET `/thumbs/${pluginId}`, auth, id NOT url-encoded); `listComments` unchanged **except** that it must NOT `encodeURIComponent` the id — a member id is `<bundle>/<name>` and the slash has to stay a path separator (`/comments/${pluginId}`), matching the two-segment route from Task 4. Check what it does today and fix it if it encodes.

- [ ] **Step 1: Edit the interface and the implementation**

In the interface block (added on the branch under `listRatings`), replace the two signatures:

```ts
  postComment(input: { plugin_id: string; text: string }): Promise<{ ok: true; id: string; hidden: boolean }>;
  /** `null` clears the user's vote. Requires a prior install (403 otherwise).
   *  Returns the plugin's NEW totals so the caller never re-fetches /stats. */
  setThumb(input: { plugin_id: string; value: 'up' | 'down' | null }): Promise<{ ok: true; vote: 'up' | 'down' | null; thumbs_up: number; thumbs_down: number }>;
  /** The caller's own vote, so the buttons don't forget it between visits. */
  getThumb(pluginId: string): Promise<{ vote: 'up' | 'down' | null }>;
```

and the implementations:

```ts
    postComment: (input) =>
      request<{ ok: true; id: string; hidden: boolean }>("/comments", { method: "POST", body: JSON.stringify(input), auth: true }),
    setThumb: (input) =>
      request<{ ok: true; vote: 'up' | 'down' | null; thumbs_up: number; thumbs_down: number }>("/thumbs", { method: "POST", body: JSON.stringify(input), auth: true }),
    // No encodeURIComponent: a bundle member id is `<bundle>/<name>` and the slash
    // must stay a path separator (the Worker registers a two-segment route for it).
    getThumb: (pluginId) =>
      request<{ vote: 'up' | 'down' | null }>(`/thumbs/${pluginId}`, { auth: true }),
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
- Modify: `desktop/src/renderer/hooks/useIpc.ts` (the `window.claude.marketplaceApi` type, lines 198–212). **Not `shared/types.ts`** — `rg -c marketplaceApi desktop/src/shared/types.ts` returns `0`; the `Window['claude']` augmentation for this namespace lives in `useIpc.ts` alone.
- Modify: `app/src/main/kotlin/com/youcoded/app/marketplace/MarketplaceApiClient.kt` (after `toggleThemeLike`, line ~210)
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (after the `"marketplace:theme:like"` arm, line ~2779)
- Test: `desktop/tests/ipc-channels.test.ts`

**Interfaces:**
- Produces: `window.claude.marketplaceApi.thumb({ plugin_id, value }): Promise<ApiResult<{ vote: 'up'|'down'|null; thumbs_up: number; thumbs_down: number }>>`, `.myThumb(pluginId): Promise<ApiResult<{ vote: 'up'|'down'|null }>>` and `.comment({ plugin_id, text }): Promise<ApiResult<{ id: string; hidden: boolean }>>` — identical on Electron, remote browser (shim) and Android.

- [ ] **Step 1: Write the failing parity test**

Append to `desktop/tests/ipc-channels.test.ts` (copy the shape of the `permissions:* channel parity` block at lines 1092–1123; marketplace write channels have no `remote-server.ts` case — `marketplace:rate` has none either — so this block pins four surfaces):

```ts
describe('marketplace feedback channel parity', () => {
  // Three, not two: reading your OWN vote is an authed GET, so it cannot be a
  // direct renderer fetch the way the public comment list is — the token lives
  // in main.
  const NEW_TYPES = ['marketplace:thumb', 'marketplace:thumb:get', 'marketplace:comment'];
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
  "marketplace:thumb:get",
  "marketplace:comment",
```
and after the `marketplace:rate:delete` handler:
```ts
  // Marketplace overhaul (spec §1.7): one-tap vote and comment. Both go through
  // main because the token lives here; the renderer's client has none.
  // `Thumbs` = { vote: 'up' | 'down' | null; thumbs_up: number; thumbs_down: number } —
  // declare it once near the top of the file and reuse it on all four surfaces.
  ipcMain.handle("marketplace:thumb", (_e, input: { plugin_id: string; value: 'up' | 'down' | null }): Promise<ApiResult<Thumbs>> =>
    wrap(async () => { const r = await client.setThumb(input); return { vote: r.vote, thumbs_up: r.thumbs_up, thumbs_down: r.thumbs_down }; })
  );
  ipcMain.handle("marketplace:thumb:get", (_e, pluginId: string): Promise<ApiResult<{ vote: 'up' | 'down' | null }>> =>
    wrap(async () => ({ vote: (await client.getThumb(pluginId)).vote }))
  );
  ipcMain.handle("marketplace:comment", (_e, input: { plugin_id: string; text: string }): Promise<ApiResult<{ id: string; hidden: boolean }>> =>
    wrap(async () => { const r = await client.postComment(input); return { id: r.id, hidden: r.hidden }; })
  );
```
(Checked: `marketplace:rate` and friends use a bare `wrap(...)` with no `makeClearSessionOn401` — match that.)

`desktop/src/main/preload.ts` — in the `IPC` block next to `MARKETPLACE_THEME_LIKE`:
```ts
  MARKETPLACE_THUMB: 'marketplace:thumb',
  MARKETPLACE_THUMB_GET: 'marketplace:thumb:get',
  MARKETPLACE_COMMENT: 'marketplace:comment',
```
and in `marketplaceApi` after `likeTheme`:
```ts
    thumb: (input: { plugin_id: string; value: 'up' | 'down' | null }): Promise<ApiResult<{ vote: 'up' | 'down' | null; thumbs_up: number; thumbs_down: number }>> =>
      ipcRenderer.invoke(IPC.MARKETPLACE_THUMB, input),
    myThumb: (pluginId: string): Promise<ApiResult<{ vote: 'up' | 'down' | null }>> =>
      ipcRenderer.invoke(IPC.MARKETPLACE_THUMB_GET, pluginId),
    comment: (input: { plugin_id: string; text: string }): Promise<ApiResult<{ id: string; hidden: boolean }>> =>
      ipcRenderer.invoke(IPC.MARKETPLACE_COMMENT, input),
```

`desktop/src/renderer/remote-shim.ts` — after `likeTheme` (line ~1000), passing the input flat like `rate`:
```ts
      thumb: (input: { plugin_id: string; value: 'up' | 'down' | null }): Promise<ApiResult<{ vote: 'up' | 'down' | null; thumbs_up: number; thumbs_down: number }>> =>
        invoke('marketplace:thumb', input),
      // WHY the object wrapper: every shim call sends an OBJECT payload, and the
      // Android arm below reads `msg.payload.optString("plugin_id")`. Sending the
      // bare string makes `payload` not a JSON object, so Android reads an empty
      // id and the thumb never lights up on a phone.
      myThumb: (pluginId: string): Promise<ApiResult<{ vote: 'up' | 'down' | null }>> =>
        invoke('marketplace:thumb:get', { plugin_id: pluginId }),
      comment: (input: { plugin_id: string; text: string }): Promise<ApiResult<{ id: string; hidden: boolean }>> =>
        invoke('marketplace:comment', input),
```

`desktop/src/renderer/hooks/useIpc.ts` — add `thumb`, `myThumb` and `comment` to the `marketplaceApi` object type at lines 198–212, next to `likeTheme`. If `ipc-channels.test.ts`'s "preload channel names match shared/types.ts" case then fails, `IPC` in `shared/types.ts` also needs the three new constants — run it to know rather than guessing.

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

    /** GET /thumbs/{id} — the caller's own vote, or null. */
    suspend fun getThumb(pluginId: String): ApiResult<JSONObject> {
        val (code, body) = request("/thumbs/$pluginId", method = "GET", auth = true)
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
                    // value shape: { vote: "up" | "down" | null, thumbs_up, thumbs_down }
                    bridgeServer.respond(ws, msg.type, it, result.toJson { v ->
                        JSONObject()
                            .put("vote", v.opt("vote") ?: JSONObject.NULL)
                            .put("thumbs_up", v.optInt("thumbs_up"))
                            .put("thumbs_down", v.optInt("thumbs_down"))
                    })
                }
            }

            "marketplace:thumb:get" -> {
                val pluginId = msg.payload.optString("plugin_id", "")
                val result = marketplaceApiClient.getThumb(pluginId)
                msg.id?.let {
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
git add desktop/src/main/marketplace-api-handlers.ts desktop/src/main/preload.ts desktop/src/renderer/remote-shim.ts desktop/src/renderer/hooks/useIpc.ts desktop/tests/ipc-channels.test.ts app/src/main/kotlin/com/youcoded/app/marketplace/MarketplaceApiClient.kt app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(marketplace): marketplace:thumb + marketplace:comment on desktop, remote shim and Android"
```

---

### Task 9: App — FeedbackSection uses the channels, and stops lying

**Files:**
- Modify: `desktop/src/renderer/components/marketplace/FeedbackSection.tsx`
- Modify: `desktop/src/renderer/components/marketplace/CommentList.tsx` — remove the per-comment **Report** affordance. **This is a correctness fix, not tidying.** Line 50 renders `<ReportReviewButton ratingUserId={c.user_id} pluginId={pluginId} …>`, and `POST /reports` keys a report to `(rating_user_id, rating_plugin_id)`. So "report this comment" today files a complaint against that person's **star rating** — and an admin resolving it (`DELETE /admin/ratings/:user_id/:plugin_id`) would hide their rating while the comment stays up. It is a mis-aimed button, not a dead one. Remove it; Task 4c's admin route is the takedown path in v1.
- Modify: `desktop/src/renderer/dev/workbench/mock-shim.ts` (hand-written `marketplaceApi` members — search `handWritten(` and the existing `likeTheme` fake if any; otherwise add a `marketplaceApi` object next to the other hand-written namespaces)
- Test: `desktop/tests/feedback-section.test.tsx` (new)

**Interfaces:**
- Consumes: `window.claude.marketplaceApi.thumb` / `.myThumb` / `.comment` (Task 8); `useMarketplaceStats()` for the **initial** totals only — never `.refresh()`, see defect 8; `CommentList` (unchanged component, but it must now be handed a moving `refreshKey`).

**Nine defects to fix in one pass.** The mockup was built against invented data, so none of
these showed up; all nine are visible the first time a real person uses it.

| # | Today | Fix |
|---|---|---|
| 1 | Votes **always fail** — the component builds its client with `getToken: () => null` and `setThumb` needs a token, so `request()` throws 401 locally, `.catch(() => undefined)` eats it, and the thumb stays lit. | Go through `window.claude.marketplaceApi` (the token lives in main). |
| 2 | A failure still renders as success. | On `ok: false`, put the thumb back and say so. Never swallow. |
| 3 | Your own vote is never loaded — reopen the page and neither thumb is lit, so you vote again. | Seed from `myThumb` on mount when signed in. |
| 4 | No in-flight guard: rapid clicks fire overlapping writes and a full `/stats` refetch each, and the *last response* wins rather than the last click. | Disable both buttons while a vote is in flight. |
| 5 | One up-vote renders "Helpful 100%" — and cards show the percentage with **no** count at all. Also literally "1 votes". | Below `MIN_VOTES_FOR_PCT` (5) show the count, not a percentage. Pluralise. |
| 6 | The reason a disabled button is disabled is a `title` tooltip — invisible on touch (Android runs this same bundle), and suppressed on disabled buttons by several engines. | Render the reason as visible muted text under the buttons. |
| 8 | Voting re-fetches `/stats`, which is served `max-age=300` while `refresh()` only skips the app's own cache — so the count doesn't move for up to five minutes after you vote, every card on screen can flash a placeholder (global `loading` flag), and the whole marketplace's totals re-download on every click. | Read the totals off the write's response (Task 3). Delete the `stats.refresh()` call. |
| 9 | Post a comment and it doesn't appear: `CommentList` re-reads only when its `refreshKey` prop changes, and nothing changes it. | Bump `refreshKey` on a successful post, and pass it down. |
| 7 | `ThumbsSummary` (line 41) carries its own hover-only `title` — "X% of N people who installed this found it helpful" — and that component is what renders on **every card**, where hover is the only way to learn what the percentage means. Same defect as #6, one line above it. | Low-count case: `thumbsLabel` puts it in visible text ("2 of 3 people found this helpful"). ≥5 case: the count is already visible on the detail page (G-19), so the `title` is a bonus there — but on the card, where only "92%" shows, it is the only explanation and stays hover-only. Accept that for v1 and file it; do not "fix" it by cramming the count onto the card, which G-19 explicitly rejected. |

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/feedback-section.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

const myThumb = vi.fn().mockResolvedValue({ ok: true, value: { vote: null } });
const thumb = vi.fn().mockResolvedValue({ ok: true, value: { vote: 'up', thumbs_up: 10, thumbs_down: 1 } });
const comment = vi.fn().mockResolvedValue({ ok: true, value: { id: 'c1', hidden: false } });
const refresh = vi.fn();

vi.mock('../src/renderer/state/account-context', () => ({ useAccount: () => ({ signedIn: true }) }));
vi.mock('../src/renderer/state/marketplace-stats-context', () => ({
  useMarketplaceStats: () => ({ plugins: { p1: { installs: 3, review_count: 0, rating: 0, thumbs_up: 9, thumbs_down: 1 } }, themes: {}, refresh, loading: false }),
}));
// NOT a blank stub: a stub can never catch the refreshKey bug (a posted comment
// never appearing). Record the prop instead so the test below can assert it moved.
const commentListProps: Array<{ refreshKey?: number }> = [];
vi.mock('../src/renderer/components/marketplace/CommentList', () => ({
  default: (p: { refreshKey?: number }) => { commentListProps.push(p); return <div data-testid="comments" />; },
}));
vi.mock('../src/renderer/components/marketplace/SignInPromptModal', () => ({ default: () => null }));

import FeedbackSection, { thumbsLabel } from '../src/renderer/components/marketplace/FeedbackSection';

afterEach(cleanup);

describe('FeedbackSection', () => {
  it('votes through window.claude.marketplaceApi.thumb and refreshes stats', async () => {
    (window as any).claude = { marketplaceApi: { thumb, myThumb, comment } };
    render(<FeedbackSection pluginId="p1" installed />);
    // Substring matcher: the rendered label is "Helpful 90%", and getByText
    // compares the WHOLE normalized text of a node — getByText('90%') fails.
    expect(screen.getByText(/90%/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /helpful/i }));
    await waitFor(() => expect(thumb).toHaveBeenCalledWith({ plugin_id: 'p1', value: 'up' }));
  });

  it('shows the vote you already cast, instead of forgetting it', async () => {
    myThumb.mockResolvedValueOnce({ ok: true, value: { vote: 'down' } });
    (window as any).claude = { marketplaceApi: { thumb, myThumb, comment } };
    render(<FeedbackSection pluginId="p1" installed />);
    await waitFor(() => expect((screen.getByRole('button', { name: /not for me/i }) as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true'));
  });

  it('puts the thumb back and says so when the vote fails', async () => {
    thumb.mockResolvedValueOnce({ ok: false, status: 403, message: 'must install plugin before voting' });
    (window as any).claude = { marketplaceApi: { thumb, myThumb, comment } };
    render(<FeedbackSection pluginId="p1" installed />);
    const btn = screen.getByRole('button', { name: /helpful/i });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText(/couldn.t save your vote/i)).toBeTruthy());
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('ignores a second click while the first is still saving', async () => {
    let release!: (v: unknown) => void;
    thumb.mockReturnValueOnce(new Promise((r) => { release = r; }));
    (window as any).claude = { marketplaceApi: { thumb, myThumb, comment } };
    render(<FeedbackSection pluginId="p1" installed />);
    const up = screen.getByRole('button', { name: /helpful/i }) as HTMLButtonElement;
    fireEvent.click(up);
    await waitFor(() => expect(up.disabled).toBe(true));
    fireEvent.click(up);
    fireEvent.click(screen.getByRole('button', { name: /not for me/i }));
    expect(thumb).toHaveBeenCalledTimes(1);
    release({ ok: true, value: { vote: 'up', thumbs_up: 10, thumbs_down: 1 } });
  });

  it('shows a count, not a percentage, until there are enough votes', () => {
    expect(thumbsLabel(1, 0)).toBe('1 person found this helpful');
    expect(thumbsLabel(2, 1)).toBe('2 of 3 people found this helpful');
    // At or above the threshold the approved G-19 markup renders instead — the
    // helper deliberately says nothing rather than competing with it.
    expect(thumbsLabel(9, 1)).toBeNull();
    expect(thumbsLabel(0, 0)).toBeNull();
  });

  it('moves the count from the write, without re-fetching /stats', async () => {
    thumb.mockResolvedValueOnce({ ok: true, value: { vote: 'up', thumbs_up: 10, thumbs_down: 1 } });
    (window as any).claude = { marketplaceApi: { thumb, myThumb, comment } };
    render(<FeedbackSection pluginId="p1" installed />);
    fireEvent.click(screen.getByRole('button', { name: /helpful/i }));
    // 9→10 on the spot. And never a /stats round-trip: that response is
    // max-age=300, so the number would not move for five minutes.
    await waitFor(() => expect(screen.getByText(/11 votes/)).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
  });

  it('posts a comment through window.claude.marketplaceApi.comment', async () => {
    (window as any).claude = { marketplaceApi: { thumb, myThumb, comment } };
    render(<FeedbackSection pluginId="p1" installed />);
    fireEvent.change(screen.getByLabelText('Write a comment'), { target: { value: 'Does it work offline?' } });
    fireEvent.click(screen.getByRole('button', { name: /post comment/i }));
    await waitFor(() => expect(comment).toHaveBeenCalledWith({ plugin_id: 'p1', text: 'Does it work offline?' }));
    // …and the thread re-reads, or the comment you just wrote never shows up.
    const keys = commentListProps.map((p) => p.refreshKey);
    await waitFor(() => expect(keys.at(-1)).not.toBe(keys[0]));
  });

  it('renders no Report control on a comment (no backend for it in v1)', () => {
    (window as any).claude = { marketplaceApi: { thumb, myThumb, comment } };
    render(<FeedbackSection pluginId="p1" installed />);
    expect(screen.queryByRole('button', { name: /report/i })).toBeNull();
  });

  it('disables voting until installed, and says why in VISIBLE text (no touch hover)', () => {
    (window as any).claude = { marketplaceApi: { thumb, myThumb, comment } };
    render(<FeedbackSection pluginId="p1" installed={false} />);
    const btn = screen.getByRole('button', { name: /helpful/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    // Rendered text, not a title attribute — Android runs this same bundle and
    // has no hover, and disabled buttons suppress title in several engines.
    expect(screen.getByText(/install it first/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd /home/destin/youcoded-dev/worktrees/marketplace-ui/desktop && npx vitest run tests/feedback-section.test.tsx`
Expected: FAIL — `thumb` never called (the component calls a token-less HTTP client today).

- [ ] **Step 3: Rewire the component**

In `FeedbackSection.tsx` remove the `createMarketplaceApiClient` / `MARKETPLACE_API_HOST`
import and the `const client = …` line (that client had `getToken: () => null`, which is why
every vote 401s today), then:

**1. The summary label — a count until a percentage means something.**
```ts
/** Below this many votes a percentage is theatre: one up-vote is not "100%". */
export const MIN_VOTES_FOR_PCT = 5;
const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/** The LOW-COUNT summary only — under MIN_VOTES_FOR_PCT, where a percentage lies
 *  and "1 votes" is not English. At or above it, the approved copy stands
 *  unchanged (G-19, and the spec's detail mockup): "Helpful 92%" with a muted
 *  "402 votes" beside it on the detail page, bare "92%" on the card, which is
 *  exactly what ThumbsSummary's `showTotal` prop already does. null = say nothing. */
export function thumbsLabel(up?: number, down?: number): string | null {
  const u = up ?? 0, d = down ?? 0, total = u + d;
  if (total === 0) return null;
  if (total >= MIN_VOTES_FOR_PCT) return null;   // caller renders the existing pct + count
  return d === 0 ? `${people(u)} found this helpful` : `${u} of ${people(total)} found this helpful`;
}
```

**Do not replace the ≥5 rendering.** `FeedbackSection.tsx:89` already renders `Helpful
<pct>%` + muted `<N> votes`, and `ThumbsSummary` already splits card (percentage only) from
detail page (`showTotal`) — that split is deliberate copy rule **G-19**, documented in the
file at lines 34–35, and the spec's detail mockup shows `Helpful 93% · 127 votes`. The only
defect is the *low-count* case, where the same code says "Helpful 100%" off one vote and
"1 votes". So `thumbsLabel` returns a string only below the threshold; at or above it the
caller keeps the existing markup verbatim, count and all.

**2. Load the vote the user already cast.**
```ts
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  const [saving, setSaving] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  // Without this the buttons forget you: vote, leave, come back, and neither
  // thumb is lit — which reads as "it didn't save" and gets you voting twice.
  useEffect(() => {
    if (!auth.signedIn) { setVote(null); return; }
    let live = true;
    void window.claude.marketplaceApi.myThumb(pluginId).then((r) => {
      if (live && r.ok) setVote(r.value.vote);
    });
    return () => { live = false; };
  }, [pluginId, auth.signedIn]);
```

**3. Voting — one at a time, and honest about failure.**
```ts
  // Through window.claude.marketplaceApi because the sign-in token lives in the
  // main process (same path as theme likes), never a renderer-side HTTP client.
  // `saving` is a real guard, not politeness: without it rapid clicks fire
  // overlapping writes plus a full /stats refetch each, and the last RESPONSE
  // wins rather than the last click.
  // The route returns the new totals, so the number moves the instant the write
  // lands. Do NOT call stats.refresh() here: /stats is served max-age=300 and
  // refresh() only skips the app's own cache, so the count would sit unchanged
  // for up to five minutes after a successful vote — plus it raises a global
  // `loading` flag every card reads and re-downloads the whole marketplace's
  // totals on every click.
  const [localTotals, setLocalTotals] = useState<{ up: number; down: number } | null>(null);

  const castVote = (v: 'up' | 'down') => {
    if (saving) return;
    if (!auth.signedIn) { setSignIn('vote'); return; }
    const previous = vote;
    const next = vote === v ? null : v;
    setVote(next); setSaving(true); setVoteError(null);
    window.claude.marketplaceApi.thumb({ plugin_id: pluginId, value: next })
      .then((r) => {
        if (r.ok) { setLocalTotals({ up: r.value.thumbs_up, down: r.value.thumbs_down }); return; }
        // Never swallow: a vote that did not save must not look like it did.
        setVote(previous);
        setVoteError(r.status === 403 ? "Install it first — only people who have used it can vote." : "Couldn't save your vote. Try again.");
      })
      .catch(() => { setVote(previous); setVoteError("Couldn't save your vote. Try again."); })
      .finally(() => setSaving(false));
  };

  // Read totals from the last write if there was one, else from /stats.
  const up = localTotals?.up ?? stats.plugins[pluginId]?.thumbs_up ?? 0;
  const down = localTotals?.down ?? stats.plugins[pluginId]?.thumbs_down ?? 0;
```

**4. Comments — same honesty, and make the comment actually appear.** Keep the existing
shape, but replace `.catch(() => undefined)` with a `setCommentError("Couldn't post your
comment. Try again.")` and handle `r.ok === false` the same way.

`CommentList` only re-reads the thread when its `refreshKey` prop changes
(`CommentList.tsx:60`, `:86` — "Bump to re-fetch (e.g. after the user posts)"). Nothing bumps
it today, so posting clears the box and the comment does not appear until you leave the page
and come back. On a successful post: `setRefreshKey((k) => k + 1)`, and pass it down —
`<CommentList pluginId={pluginId} refreshKey={refreshKey} />`.

A comment the classifier hid (`r.value.hidden === true`) will *not* come back in that
re-fetch, so say so plainly — "Posted. It's held for review." — rather than letting it
silently vanish from a list the user just posted to.

**5. The disabled reason becomes visible text, not a tooltip.**
```tsx
  const voteReason = !installed
    ? 'Install it first — only people who have used it can vote'
    : !auth.signedIn ? 'Sign in to vote' : null;
```
```tsx
  <Button … disabled={!installed || saving} aria-pressed={vote === 'up'}>…</Button>
  …
  {/* Visible, not a `title`: Android runs this same bundle and has no hover, and
      several engines suppress title on a disabled button entirely. */}
  {(voteReason || voteError) && (
    <p className={`text-xs mt-1 ${voteError ? 'text-danger' : 'text-fg-muted'}`} role={voteError ? 'status' : undefined}>
      {voteError ?? voteReason}
    </p>
  )}
```

If `window.claude` is typed without `marketplaceApi.thumb` / `.myThumb`, Task 8's `types.ts`
edit provides it; `tsc` tells you.

- [ ] **Step 4: Fake the three channels in the workbench**

First, `desktop/src/renderer/dev/workbench/fixtures/marketplace/worker-api-mock.ts`. It
already answers `POST /thumbs` (line 54), `POST /comments` (48) and `GET /comments/…` (44),
but there is **no `GET /thumbs/<id>` arm**, so `myThumb` falls through to the real network in
the workbench and the new "remember my vote" behaviour can't be seen there. Add it next to
line 43's `/ratings/` arm, and keep it stateful enough to be worth looking at — return
whatever the last `POST /thumbs` for that id set:

```ts
    // In-memory so the workbench can demonstrate the actual point of this route:
    // vote, navigate away, come back, and the thumb is still lit.
    if (path.startsWith('/thumbs/') && method === 'GET') {
      return json({ vote: votes.get(decodeURIComponent(path.slice('/thumbs/'.length))) ?? null });
    }
```
(declare `const votes = new Map<string, 'up' | 'down' | null>()` at module scope and have the
existing `POST /thumbs` arm write into it.)

**Do not hand-write a `marketplaceApi` object in `mock-shim.ts`.** `marketplaceApi` is in
the `NAMESPACES` list (`mock-shim.ts:243–250`), which means an auto-forwarding proxy already
answers *every* method on it. A hand-written object with three methods **shadows that
proxy**, so `install`, `rate`, `deleteRating`, `likeTheme` and `report` — five things that
work in the workbench today — silently stop working. Nothing in the suite would catch it;
`workbench-boot-check.mjs` only proves the routes mount.

The auto-forwarder plus the `worker-api-mock` arms above is all this needs: the mock `fetch`
answers the HTTP calls, and the proxy answers the channel calls. Verify by clicking, not by
adding code:

```bash
bash /home/destin/youcoded-dev/scripts/run-workbench.sh marketplace-ui   # announce before it opens a window
node /home/destin/youcoded-dev/scripts/workbench-boot-check.mjs
```

Vote, navigate away, come back — the thumb stays lit. Then confirm the five older actions
above still respond. Do **not** register the new channels in `mock-only.ts`: after Task 8
they have a real backend.

- [ ] **Step 5: Run the test, the gate, and commit**

Run: `npx vitest run tests/feedback-section.test.tsx` → PASS (9).
Run: `cd /home/destin/youcoded-dev && bash scripts/verify.sh marketplace-ui` → OK.

```bash
git add desktop/src/renderer/components/marketplace/FeedbackSection.tsx desktop/src/renderer/components/marketplace/CommentList.tsx desktop/src/renderer/dev/workbench/mock-shim.ts desktop/src/renderer/dev/workbench/fixtures/marketplace/worker-api-mock.ts desktop/tests/feedback-section.test.tsx
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
Run (needs an admin session token in `$TOK`): `curl -s -H "Authorization: Bearer $TOK" https://wecoded-marketplace-api.destinj101.workers.dev/admin/comments`
Expected: `{"comments":[]}` — **not** `403`. This is the only takedown path in v1; find out
now, not the day you need it.

- [ ] **Step 2: Flag the interactive check for Destin — do not script it**

Tell Destin: launch `bash scripts/run-dev.sh marketplace-ui --label "Marketplace feedback"` (say so before it opens a window), then on a plugin's page, signed in: **vote, close the page, reopen it — the thumb you chose must still be lit.** Then post a comment and reload. Also worth one deliberate misuse: click Helpful ten times fast; it should register once, not ten times, and nothing should flicker. That is his 30-second pass.

- [ ] **Step 3: ROADMAP + docs**

In `ROADMAP.md`'s overhaul entry, note "feedback routes shipped <date>"; the deferred items in the spec §5 stay. Nothing to archive yet — the branch is not merged until Plan 3 lands (the cards still need the catalog for their badges).

Add these ROADMAP items in the same session:
- **Delete your own comment** — reviews had it (`marketplace:rate:delete`), comments do not, on any platform.
- **Report a comment** — needs a `reports` schema that can key to a comment id, not just a rating; the button is deliberately absent until then (spec §5). Note in the item that the button that *was* there reported the author's star rating instead (`CommentList.tsx:50`), so this is a re-add, not a first build.
- **Theme installs are never reported to the Worker** — `installTheme()` (`marketplace-context.tsx:285`) installs to disk and never calls `marketplaceApi.install()`, so the `installs` table has zero theme rows and theme cards can never show a download count. One line in `installTheme` plus a `themes[slug].installs` field in `/stats`. Belongs with Plan 3's card work; see the cut note in Task 5.
- **Comments truncate silently at 50** — `GET /comments/:id` is `LIMIT 50` with no pagination and no total, so a busy thread just stops with no indication there is more. Cheapest first step: return a `total` alongside `comments` and say "showing the 50 most recent of N".
- **A comment the classifier hid is invisible to its author in the app** — they see "held for review" once, and never again. `/auth/export` now carries `hidden` (Task 4d), which is the fallback, but the plugin page should say it too.
- Whatever Task 0 measured about `checkRateLimit` — either "confirmed dead on workers.dev; the custom domain is the fix; a D1-backed counter is the fallback and costs one write per anonymous page view" or "verified working, no change".
