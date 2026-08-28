---
status: active
created: 2026-08-28
spec: docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md
part: 2 of 3 (catalog service) — 2026-08-28-marketplace-feedback-worker.md is independent; 2026-08-28-marketplace-app-wiring.md consumes this plan's `/catalog`
---

# Marketplace Catalog Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A catalog the app can read that carries, for every listing, the block the approved UI renders — kind, who published it, whether this version was checked, what it can do, licence, pinned commit — built hourly from five sources and served by the WeCoded Worker.

**Architecture:** Two halves. **Serve:** the Worker stores one row per listing in D1 (`catalog_items`, full entry as JSON + a few indexed columns) and answers `GET /catalog` (everything the app shows) and `GET /catalog/:id`; an ingest token guards `POST /admin/catalog/*`. **Ingest:** a dependency-free Node 20 script tree in `wecoded-marketplace/scripts/catalog/` runs in GitHub Actions every hour, pulls each source (our own `index.json`, the official MCP Registry, Docker's MCP catalog, `github/awesome-copilot`, `PatrickJS/awesome-cursorrules`), normalises to `SkillEntry + catalog`, computes capabilities and a rule-based scan from the files at the pinned commit, and upserts in batches. A per-source "finish" call retires rows the run did not see. The MCP Registry is ingested in full but only its quality slice (GitHub stars ≥ 25 or also in Docker's catalog) is served — enrichment catches up 400 repos per run.

**Tech Stack:** Hono + D1 + vitest-pool-workers (Worker); Node 20 `fetch` + `node:test` (ingest, zero npm deps, like `scripts/sync.js`); GitHub Actions cron.

## Global Constraints

- Contract with Plan 3 (must not drift): `GET /catalog` → `200 { generated_at: number, entries: SkillEntry[] }`; each entry has the `index.json` fields plus `catalog: CatalogMeta`; deprecated rows omitted; `Cache-Control: public, max-age=300`; any origin.
- `CatalogMeta` is `desktop/src/shared/catalog-types.ts` on the app branch. This plan adds two optional fields there (Task 5): `upstreamId?: string`, `stars?: number`. Nothing else in the shape changes.
- Ids must satisfy the installer's `^[a-zA-Z0-9_-]+$` (`plugin-installer.ts:41`) **except** member rows, which use `<bundle>/<name>` and are never installed directly (Plan 3 routes them to the bundle). Mirrored ids are prefixed by source: `mcp-…`, `docker-…`, `copilot-…`, `cursorrules-…`.
- Worker conventions: errors are plain-text lowercase messages (`src/lib/errors.ts`); `parseJsonBody` for JSON; public GETs go in `isPublicReadPath`; migrations `NNNN_snake_case.sql`, next is **0006** (0005 is Plan 1's — if Plan 1 has not merged, this plan's migration is 0005 and Plan 1's becomes 0006; whoever merges second renumbers); `[env.test]` mirrors any new var; tests `DELETE FROM` their tables in `beforeEach`.
- Ingest never writes to the repo; it POSTs. The token is `CATALOG_INGEST_TOKEN` (Worker secret, CI secret `MARKETPLACE_CATALOG_INGEST_TOKEN`), compared with `crypto.subtle.timingSafeEqual`-equivalent constant-time logic.
- GitHub calls from ingest always send `Authorization: Bearer ${GITHUB_TOKEN}` (60/hr unauthenticated is not survivable); respect `x-ratelimit-remaining` — stop enriching when < 200.
- Capabilities and scan findings are **computed from files**, never taken from an author's description. Wording is plain: "Runs commands on your computer", "Connects to the internet · api.notion.com", "Needs a Notion key · NOTION_TOKEN", "Runs automatically after every file edit", "Adds 3 skills and 1 command".
- Scan status: `caution` when any finding; `checked` when the files were fetched and scanned with no finding; `unchecked` when files could not be fetched (rate limit, no repo). Never `checked` without having read the files.
- Worker work on `wecoded-marketplace` branch `feat/catalog-service` from `master`; `cd worker && npm test && npm run typecheck` before each commit; the ingest scripts run `node --test scripts/catalog/test`.

---

## File structure

**Worker (`wecoded-marketplace/worker`)**
- `migrations/0006_catalog.sql` — `catalog_items`, `catalog_runs`.
- `src/catalog/auth.ts` — `requireIngestToken`.
- `src/catalog/routes.ts` — `catalogRoutes`: `GET /catalog`, `GET /catalog/:id`, `POST /admin/catalog/upsert`, `POST /admin/catalog/finish`, `GET /admin/catalog/last-run`.
- `src/types.ts` — `CATALOG_INGEST_TOKEN`; `wrangler.toml` `[env.test.vars]`; `test/env.d.ts`; `.github/workflows/worker-deploy.yml` secret push.
- `test/catalog.test.ts`, `test/catalog-auth.test.ts`, `test/schema.test.ts`, `test/cors.test.ts`.

**Ingest (`wecoded-marketplace/scripts/catalog/`)**
- `lib/http.mjs` — `getJson`, `getText`, `github` (auth + rate-limit aware), `postJson`.
- `lib/entry.mjs` — `slug`, `makeEntry`, `licenseToSpdx`, `CATALOG_SOURCES`.
- `lib/capabilities.mjs` — `scanFiles(files) → { capabilities, findings }`, `addsLine(components)`.
- `lib/worker.mjs` — `startRun`, `upsertBatch`, `finishRun`, `lastRun`.
- `sources/wecoded.mjs`, `sources/docker.mjs`, `sources/awesome-copilot.mjs`, `sources/cursorrules.mjs`, `sources/mcp-registry.mjs` — each exports `async function collect(ctx) → SkillEntry[]`.
- `enrich.mjs` — GitHub stars / licence / HEAD sha for rows that lack them.
- `build.mjs` — orchestrator (`--source <name>`, `--dry-run`, `--full`).
- `test/*.test.mjs` + `test/fixtures/*.json` (the samples captured on 2026-08-28).
- `.github/workflows/catalog-ingest.yml`.
- `docs/catalog.md` (repo-local reference), workspace `docs/registries.md` (Plan 3 edits it).

---

### Task 1: Migration — `catalog_items`, `catalog_runs`

**Files:**
- Create: `worker/migrations/0006_catalog.sql`
- Test: `worker/test/schema.test.ts`

- [ ] **Step 1: Failing schema test** — add to the existing `it`:

```ts
    expect(names).toContain("catalog_items");
    expect(names).toContain("catalog_runs");
```

- [ ] **Step 2: Run** `cd /home/destin/youcoded-dev/wecoded-marketplace && git checkout -b feat/catalog-service master && cd worker && npx vitest run test/schema.test.ts` → FAIL.

- [ ] **Step 3: Migration**

```sql
-- Marketplace overhaul, Layer A (docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md §2):
-- the catalog the app reads. One row per listing; the full entry (index.json
-- fields + the `catalog` block) lives in entry_json so the schema never has to
-- chase the app's SkillEntry shape. The indexed columns are the ones the read
-- and retire queries filter on.
CREATE TABLE catalog_items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,                -- wecoded | anthropic | mcp-registry | docker | awesome-copilot | cursorrules
  item_type TEXT NOT NULL,             -- plugin | skill | specialist | tool | prompt
  part_of_id TEXT,                     -- bundle id for member rows
  slice INTEGER NOT NULL DEFAULT 1,    -- 1 = served by GET /catalog; 0 = stored, not shown (quality filter)
  deprecated INTEGER NOT NULL DEFAULT 0,
  run_id TEXT NOT NULL,                -- the ingest run that last touched the row
  updated_at INTEGER NOT NULL,
  entry_json TEXT NOT NULL
);
CREATE INDEX idx_catalog_served ON catalog_items(deprecated, slice);
CREATE INDEX idx_catalog_source_run ON catalog_items(source, run_id);
CREATE INDEX idx_catalog_part_of ON catalog_items(part_of_id);

-- One row per (source, run). finished_at NULL = still running / crashed.
CREATE TABLE catalog_runs (
  id TEXT NOT NULL,
  source TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  upserted INTEGER NOT NULL DEFAULT 0,
  retired INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  PRIMARY KEY (id, source)
);
CREATE INDEX idx_catalog_runs_source ON catalog_runs(source, finished_at);
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `git add migrations/0006_catalog.sql test/schema.test.ts && git commit -m "feat(worker): catalog_items + catalog_runs tables"`.

---

### Task 2: Ingest token — binding, middleware, CI secret

**Files:**
- Create: `worker/src/catalog/auth.ts`
- Modify: `worker/src/types.ts` (Env), `worker/wrangler.toml` (`[env.test.vars]`), `worker/test/env.d.ts`, `.github/workflows/worker-deploy.yml` (Push secrets step)
- Test: `worker/test/catalog-auth.test.ts`

**Interfaces:**
- Produces: `requireIngestToken: MiddlewareHandler<HonoEnv>` — 401 `missing ingest token` / `invalid ingest token`; 503 `ingest token not configured` when the secret is empty.

- [ ] **Step 1: Failing test** — `worker/test/catalog-auth.test.ts`:

```ts
import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("ingest token", () => {
  it("401s without the header, 401s with a wrong token, 200s with the test token", async () => {
    const body = JSON.stringify({ source: "docker", run_id: "r1" });
    const headers = { "Content-Type": "application/json" };
    expect((await SELF.fetch("https://test.local/admin/catalog/finish", { method: "POST", headers, body })).status).toBe(401);
    expect((await SELF.fetch("https://test.local/admin/catalog/finish", { method: "POST", headers: { ...headers, "X-Catalog-Token": "nope" }, body })).status).toBe(401);
    expect((await SELF.fetch("https://test.local/admin/catalog/finish", { method: "POST", headers: { ...headers, "X-Catalog-Token": "test-ingest-token" }, body })).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/catalog-auth.test.ts` → FAIL (404s).

- [ ] **Step 3: Implement**

`worker/src/types.ts` — add to `Env`:
```ts
  // Shared secret the catalog-ingest GitHub Action presents on
  // POST /admin/catalog/*. Set by CI (wrangler secret put); [env.test.vars]
  // carries a fixed test value. Empty/absent → those routes answer 503.
  CATALOG_INGEST_TOKEN?: string;
```
`worker/wrangler.toml` `[env.test.vars]` — add `CATALOG_INGEST_TOKEN = "test-ingest-token"`. `worker/test/env.d.ts` — add `CATALOG_INGEST_TOKEN?: string;`.

`worker/src/catalog/auth.ts`:
```ts
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { HonoEnv } from "../types";
import { unauthorized } from "../lib/errors";

// Constant-time string compare — a plain === leaks the mismatch position.
function sameSecret(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Gate for POST /admin/catalog/* — the ingest job, not a user. */
export const requireIngestToken: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const expected = c.env.CATALOG_INGEST_TOKEN ?? "";
  if (!expected) throw new HTTPException(503, { message: "ingest token not configured" });
  const given = c.req.header("X-Catalog-Token") ?? "";
  if (!given) throw unauthorized("missing ingest token");
  if (!sameSecret(given, expected)) throw unauthorized("invalid ingest token");
  return next();
};
```

`.github/workflows/worker-deploy.yml` — in the Push secrets step, add:
```yaml
          echo "${{ secrets.MARKETPLACE_CATALOG_INGEST_TOKEN }}" | npx wrangler secret put CATALOG_INGEST_TOKEN
```
and tell Destin (in the PR body) to add the repo secret `MARKETPLACE_CATALOG_INGEST_TOKEN` (any 32+ random chars: `openssl rand -hex 32`) **before** merging — the deploy step fails on an empty secret.

The route the test hits is created in Task 3; for now register a stub in a new `worker/src/catalog/routes.ts`:
```ts
import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { requireIngestToken } from "./auth";
export const catalogRoutes = new Hono<HonoEnv>();
catalogRoutes.post("/admin/catalog/finish", requireIngestToken, (c) => c.json({ ok: true }));
```
and mount it in `src/index.ts` (`import { catalogRoutes } from "./catalog/routes";` + `app.route("/", catalogRoutes);`).

- [ ] **Step 4: Run** → PASS. `npm run typecheck` clean. **Step 5: Commit** `git add src/catalog src/types.ts src/index.ts wrangler.toml test/env.d.ts test/catalog-auth.test.ts ../.github/workflows/worker-deploy.yml && git commit -m "feat(worker): CATALOG_INGEST_TOKEN + requireIngestToken"`.

---

### Task 3: Admin ingest routes — upsert, finish, last-run

**Files:**
- Modify: `worker/src/catalog/routes.ts`
- Test: `worker/test/catalog.test.ts`

**Interfaces:**
- `POST /admin/catalog/upsert` body `{ source, run_id, entries: Array<SkillEntry & { catalog: CatalogMeta }>, slice?: Record<string, 0|1> }` (≤ 500 entries) → `{ ok: true, upserted: number }`. Creates the `catalog_runs` row on first sight of `(run_id, source)`. Each entry's `id`, `catalog.itemType`, `catalog.partOf?.id`, `deprecated` are read into columns; `slice` defaults to 1 unless `slice[id] === 0`.
- `POST /admin/catalog/finish` body `{ source, run_id, note? }` → `{ ok: true, retired: number }`: rows of that source with `run_id != this run` become `deprecated = 1`; run row gets `finished_at`.
- `GET /admin/catalog/last-run?source=…` → `{ run: { id, started_at, finished_at, upserted, retired } | null }` (last **finished** run).

- [ ] **Step 1: Failing tests** — `worker/test/catalog.test.ts`:

```ts
import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

const TOKEN = { "Content-Type": "application/json", "X-Catalog-Token": "test-ingest-token" };
const entry = (id: string, extra: Record<string, unknown> = {}) => ({
  id, type: "plugin", displayName: id, description: "d", category: "development", author: "a", tags: [],
  version: "1.0.0", publishedAt: "2026-08-28T00:00:00Z", sourceMarketplace: "youcoded",
  sourceType: "url", sourceRef: "https://github.com/x/y.git",
  catalog: { itemType: "plugin", origin: { tier: "community" }, scan: { status: "unchecked" }, capabilities: [] },
  ...extra,
});
const post = (path: string, body: unknown) => SELF.fetch(`https://test.local${path}`, { method: "POST", headers: TOKEN, body: JSON.stringify(body) });

describe("catalog ingest routes", () => {
  beforeEach(async () => {
    for (const t of ["catalog_items", "catalog_runs"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  });

  it("upserts rows, indexes type / part_of, and reports the count", async () => {
    const res = await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r1", entries: [
      entry("bundle"),
      entry("bundle/skill-a", { catalog: { itemType: "skill", partOf: { id: "bundle", displayName: "Bundle" }, origin: { tier: "community" }, scan: { status: "unchecked" }, capabilities: [] } }),
    ] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, upserted: 2 });
    const row = await env.DB.prepare("SELECT item_type, part_of_id, slice, run_id FROM catalog_items WHERE id = ?").bind("bundle/skill-a").first();
    expect(row).toEqual({ item_type: "skill", part_of_id: "bundle", slice: 1, run_id: "r1" });
  });

  it("a second upsert of the same id replaces the row", async () => {
    await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r1", entries: [entry("x", { description: "old" })] });
    await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r2", entries: [entry("x", { description: "new" })] });
    const row = await env.DB.prepare("SELECT entry_json, run_id FROM catalog_items WHERE id = 'x'").first<{ entry_json: string; run_id: string }>();
    expect(JSON.parse(row!.entry_json).description).toBe("new");
    expect(row!.run_id).toBe("r2");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM catalog_items").first<{ n: number }>())!.n).toBe(1);
  });

  it("finish retires rows of that source the run did not touch, and records the run", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("docker-a"), entry("docker-b")] });
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r2", entries: [entry("docker-a")] });
    const res = await post("/admin/catalog/finish", { source: "docker", run_id: "r2" });
    expect(await res.json()).toEqual({ ok: true, retired: 1 });
    const b = await env.DB.prepare("SELECT deprecated FROM catalog_items WHERE id = 'docker-b'").first<{ deprecated: number }>();
    expect(b!.deprecated).toBe(1);
    const last = await (await SELF.fetch("https://test.local/admin/catalog/last-run?source=docker", { headers: TOKEN })).json<{ run: { id: string; upserted: number; retired: number } | null }>();
    expect(last.run).toMatchObject({ id: "r2", upserted: 1, retired: 1 });
  });

  it("honours slice=0 and rejects batches over 500 or without a source", async () => {
    await post("/admin/catalog/upsert", { source: "mcp-registry", run_id: "r1", entries: [entry("mcp-z")], slice: { "mcp-z": 0 } });
    const row = await env.DB.prepare("SELECT slice FROM catalog_items WHERE id = 'mcp-z'").first<{ slice: number }>();
    expect(row!.slice).toBe(0);
    const big = Array.from({ length: 501 }, (_, i) => entry(`e${i}`));
    expect((await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: big })).status).toBe(400);
    expect((await post("/admin/catalog/upsert", { run_id: "r1", entries: [entry("q")] })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/catalog.test.ts` → FAIL.

- [ ] **Step 3: Implement** — replace `worker/src/catalog/routes.ts`:

```ts
// Catalog — Layer A of the marketplace overhaul (spec §2). Serve side of the
// ingest job in scripts/catalog/. Rows are whole SkillEntry objects; the app
// renders entry.catalog untouched.
import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { requireIngestToken } from "./auth";
import { badRequest, notFound } from "../lib/errors";
import { parseJsonBody } from "../lib/parse-json";

export const catalogRoutes = new Hono<HonoEnv>();

const SOURCES = new Set(["wecoded", "anthropic", "mcp-registry", "docker", "awesome-copilot", "cursorrules"]);
const MAX_BATCH = 500;

interface IngestEntry {
  id?: string;
  deprecated?: boolean;
  catalog?: { itemType?: string; partOf?: { id?: string } };
  [k: string]: unknown;
}

async function ensureRun(db: D1Database, runId: string, source: string, now: number): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO catalog_runs (id, source, started_at) VALUES (?, ?, ?)")
    .bind(runId, source, now).run();
}

catalogRoutes.post("/admin/catalog/upsert", requireIngestToken, async (c) => {
  const body = await parseJsonBody<{ source?: string; run_id?: string; entries?: IngestEntry[]; slice?: Record<string, number> }>(c);
  if (!body.source || !SOURCES.has(body.source)) throw badRequest("unknown source");
  if (!body.run_id || body.run_id.length > 64) throw badRequest("invalid run_id");
  if (!Array.isArray(body.entries) || body.entries.length === 0) throw badRequest("entries must be a non-empty array");
  if (body.entries.length > MAX_BATCH) throw badRequest(`at most ${MAX_BATCH} entries per request`);
  const now = Math.floor(Date.now() / 1000);
  await ensureRun(c.env.DB, body.run_id, body.source, now);

  const stmt = c.env.DB.prepare(
    `INSERT INTO catalog_items (id, source, item_type, part_of_id, slice, deprecated, run_id, updated_at, entry_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET source = excluded.source, item_type = excluded.item_type,
       part_of_id = excluded.part_of_id, slice = excluded.slice, deprecated = excluded.deprecated,
       run_id = excluded.run_id, updated_at = excluded.updated_at, entry_json = excluded.entry_json`
  );
  const batch = body.entries.map((e) => {
    if (typeof e.id !== "string" || !e.id || e.id.length > 200) throw badRequest("entry without a valid id");
    if (!e.catalog || typeof e.catalog.itemType !== "string") throw badRequest(`entry ${e.id} has no catalog.itemType`);
    const slice = body.slice?.[e.id] === 0 ? 0 : 1;
    return stmt.bind(e.id, body.source, e.catalog.itemType, e.catalog.partOf?.id ?? null, slice, e.deprecated ? 1 : 0, body.run_id, now, JSON.stringify(e));
  });
  await c.env.DB.batch(batch);
  await c.env.DB.prepare("UPDATE catalog_runs SET upserted = upserted + ? WHERE id = ? AND source = ?")
    .bind(batch.length, body.run_id, body.source).run();
  return c.json({ ok: true, upserted: batch.length });
});

catalogRoutes.post("/admin/catalog/finish", requireIngestToken, async (c) => {
  const body = await parseJsonBody<{ source?: string; run_id?: string; note?: string }>(c);
  if (!body.source || !SOURCES.has(body.source)) throw badRequest("unknown source");
  if (!body.run_id) throw badRequest("invalid run_id");
  const now = Math.floor(Date.now() / 1000);
  await ensureRun(c.env.DB, body.run_id, body.source, now);
  // Retire what this run did not see. Rows keep their JSON so a listing that
  // vanished upstream can be revived by a later run (deprecated flips back to 0
  // on the next upsert).
  const r = await c.env.DB
    .prepare("UPDATE catalog_items SET deprecated = 1, updated_at = ? WHERE source = ? AND run_id != ? AND deprecated = 0")
    .bind(now, body.source, body.run_id).run();
  const retired = r.meta.changes ?? 0;
  await c.env.DB.prepare("UPDATE catalog_runs SET finished_at = ?, retired = ?, note = ? WHERE id = ? AND source = ?")
    .bind(now, retired, body.note ?? null, body.run_id, body.source).run();
  return c.json({ ok: true, retired });
});

catalogRoutes.get("/admin/catalog/last-run", requireIngestToken, async (c) => {
  const source = c.req.query("source") ?? "";
  if (!SOURCES.has(source)) throw badRequest("unknown source");
  const run = await c.env.DB
    .prepare("SELECT id, started_at, finished_at, upserted, retired FROM catalog_runs WHERE source = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1")
    .bind(source)
    .first<{ id: string; started_at: number; finished_at: number; upserted: number; retired: number }>();
  return c.json({ run: run ?? null });
});
```

- [ ] **Step 4: Run** `npx vitest run test/catalog.test.ts test/catalog-auth.test.ts && npm run typecheck` → PASS. **Step 5: Commit** `git add src/catalog/routes.ts test/catalog.test.ts && git commit -m "feat(worker): catalog ingest — upsert / finish / last-run"`.

---

### Task 4: Public reads — `GET /catalog`, `GET /catalog/:id`

**Files:**
- Modify: `worker/src/catalog/routes.ts`, `worker/src/index.ts` (`isPublicReadPath`)
- Test: `worker/test/catalog.test.ts`, `worker/test/cors.test.ts`

**Interfaces:** the contract in Global Constraints. `GET /catalog/:id` → `{ entry }` or 404 `not found`.

- [ ] **Step 1: Failing tests** — append to `test/catalog.test.ts`:

```ts
describe("GET /catalog", () => {
  beforeEach(async () => {
    for (const t of ["catalog_items", "catalog_runs"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  });

  it("returns served rows only — not deprecated, not slice 0 — with a 5-minute cache header", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("shown"), entry("hidden-slice"), entry("gone")], slice: { "hidden-slice": 0 } });
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r2", entries: [entry("shown")] });
    await post("/admin/catalog/finish", { source: "docker", run_id: "r2" });
    const res = await SELF.fetch("https://test.local/catalog");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    const body = await res.json<{ generated_at: number; entries: Array<{ id: string; catalog: unknown }> }>();
    expect(body.entries.map((e) => e.id)).toEqual(["shown"]);
    expect(body.entries[0].catalog).toBeTruthy();
    expect(typeof body.generated_at).toBe("number");
  });

  it("returns more than one internal page", async () => {
    const many = Array.from({ length: 500 }, (_, i) => entry(`e${String(i).padStart(3, "0")}`));
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: many });
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("e500"), entry("e501")] });
    const body = await (await SELF.fetch("https://test.local/catalog")).json<{ entries: unknown[] }>();
    expect(body.entries.length).toBe(502);
  });

  it("GET /catalog/:id returns one entry or 404", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("one")] });
    expect((await (await SELF.fetch("https://test.local/catalog/one")).json<{ entry: { id: string } }>()).entry.id).toBe("one");
    expect((await SELF.fetch("https://test.local/catalog/none")).status).toBe(404);
  });
});
```

Append to `test/cors.test.ts` (same shape as the ratings origin test):
```ts
  it("GET /catalog and GET /catalog/:id accept any origin", async () => {
    for (const p of ["/catalog", "/catalog/some-id"]) {
      const res = await SELF.fetch(`https://test.local${p}`, { headers: { Origin: "https://nowhere.example" } });
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    }
  });
```

- [ ] **Step 2: Run** → FAIL (404 / wrong header).

- [ ] **Step 3: Implement** — append to `routes.ts`:

```ts
// GET /catalog — everything the app shows. Read in pages of 500 so a large
// catalog never trips D1's single-statement result cap; generated_at is the
// newest updated_at so clients can tell whether anything changed.
catalogRoutes.get("/catalog", async (c) => {
  const entries: unknown[] = [];
  let newest = 0;
  for (let offset = 0; ; offset += 500) {
    const { results } = await c.env.DB
      .prepare("SELECT entry_json, updated_at FROM catalog_items WHERE deprecated = 0 AND slice = 1 ORDER BY id LIMIT 500 OFFSET ?")
      .bind(offset)
      .all<{ entry_json: string; updated_at: number }>();
    for (const r of results) { entries.push(JSON.parse(r.entry_json)); if (r.updated_at > newest) newest = r.updated_at; }
    if (results.length < 500) break;
  }
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ generated_at: newest, entries });
});

catalogRoutes.get("/catalog/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT entry_json FROM catalog_items WHERE id = ? AND deprecated = 0")
    .bind(id).first<{ entry_json: string }>();
  if (!row) throw notFound("not found");
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ entry: JSON.parse(row.entry_json) });
});
```

`src/index.ts` `isPublicReadPath` — add `if (path === "/catalog") return true;` and `"/catalog/"` to the prefix list (member ids contain `/`, so for the catalog prefix allow one **or two** segments: `rest.split("/").length <= 2`). Because Hono's `:id` does not match a slash, register the member route explicitly: `catalogRoutes.get("/catalog/:bundle/:name", …)` that joins the two params with `/` and reuses the single-id handler (extract the body into `async function one(c, id)`).

- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS. **Step 5: Commit** `git add src/catalog/routes.ts src/index.ts test/catalog.test.ts test/cors.test.ts && git commit -m "feat(worker): GET /catalog + GET /catalog/:id (public, 5-min cache)"`.

Then push and open the PR (`feat(worker): catalog service — storage, ingest routes, public reads`) with the secret instruction from Task 2; **merge it before Task 11's first real run.** Body ends with the standard Claude Code footer.

---

### Task 5: Shared type additions (app branch)

**Files:**
- Modify: `/home/destin/youcoded-dev/worktrees/marketplace-ui/desktop/src/shared/catalog-types.ts`

- [ ] **Step 1: Add the two optional fields** to `CatalogMeta` after `sourceCommit`:

```ts
  /** The listing's id in its upstream registry (reverse-DNS MCP name, Docker
   *  slug, …) — shown in the detail footer, used by the ingest to dedupe. */
  upstreamId?: string;
  /** GitHub stars at ingest time — the quality slice for mirrored sources. */
  stars?: number;
```

- [ ] **Step 2:** `cd /home/destin/youcoded-dev && bash scripts/verify.sh marketplace-ui` → OK. Commit on the app branch: `git commit -am "feat(catalog-types): upstreamId + stars"`.

---

### Task 6: Ingest scaffold — http, entry helpers, worker client, test harness

**Files:**
- Create: `scripts/catalog/lib/http.mjs`, `scripts/catalog/lib/entry.mjs`, `scripts/catalog/lib/worker.mjs`, `scripts/catalog/build.mjs`
- Create: `scripts/catalog/test/entry.test.mjs`, `scripts/catalog/test/worker.test.mjs`

**Interfaces:**
- `http.mjs`: `getJson(url, {headers?}) → any` (throws `Error("GET <url> → <status>")`), `getText(url)`, `postJson(url, body, {headers?})`, `github(pathOrUrl) → any` (adds `Authorization: Bearer ${process.env.GITHUB_TOKEN}` + `Accept: application/vnd.github+json`, tracks `x-ratelimit-remaining` in `github.remaining`, throws `RateLimited` when < 200), `githubRaw(owner, repo, sha, path) → string`.
- `entry.mjs`: `slug(s) → string` (lowercase, `[^a-z0-9_-]` → `-`, collapse, trim); `licenseToSpdx(name) → string | undefined`; `makeEntry({ id, itemType, displayName, description, author, repoUrl, sourceType, sourceRef, sourceSubdir?, sourceCommit?, origin, mirroredFrom?, license?, upstreamId?, stars?, capabilities, scan, partOf?, tags?, category?, tagline?, prompt?, components? }) → SkillEntry` filling `type`, `version`, `publishedAt`, `sourceMarketplace`, `visibility`… exactly the fields `index.json` rows carry today plus `catalog`.
- `worker.mjs`: `createWorkerClient({ host, token }) → { lastRun(source), upsert(source, runId, entries, slice?), finish(source, runId, note?) }`; `upsert` splits into batches of 500 and returns the total.
- `build.mjs`: `node scripts/catalog/build.mjs --source docker [--dry-run] [--full]`; without `--source` runs all; `--dry-run` writes `catalog-dry-run.json` and never POSTs.

- [ ] **Step 1: Failing tests**

`scripts/catalog/test/entry.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { slug, licenseToSpdx, makeEntry } from "../lib/entry.mjs";

test("slug is installer-safe", () => {
  assert.equal(slug("ai.agenttrust/mcp-server"), "ai-agenttrust-mcp-server");
  assert.equal(slug("  Brave Search!! "), "brave-search");
});

test("licenseToSpdx maps Docker's free-text names and passes SPDX through", () => {
  assert.equal(licenseToSpdx("MIT License"), "MIT");
  assert.equal(licenseToSpdx("Apache License 2.0"), "Apache-2.0");
  assert.equal(licenseToSpdx("MIT"), "MIT");
  assert.equal(licenseToSpdx("NOASSERTION"), undefined);
  assert.equal(licenseToSpdx(null), undefined);
});

test("makeEntry emits the index.json shape plus catalog", () => {
  const e = makeEntry({
    id: "docker-brave", itemType: "tool", displayName: "Brave Search", description: "d", author: "brave",
    repoUrl: "https://github.com/brave/brave-search-mcp-server", sourceType: "mcp-registry", sourceRef: "docker:mcp/brave-search",
    origin: "verified", mirroredFrom: "Docker MCP Catalog", license: "MIT", upstreamId: "brave", capabilities: [], scan: { status: "unchecked" },
  });
  assert.equal(e.type, "plugin");
  assert.equal(e.sourceMarketplace, "docker");
  assert.equal(e.catalog.itemType, "tool");
  assert.equal(e.catalog.origin.tier, "verified");
  assert.equal(e.catalog.license, "MIT");
  assert.match(e.publishedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(e.category, "development");
});
```

`scripts/catalog/test/worker.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorkerClient } from "../lib/worker.mjs";

test("upsert batches at 500 and sums the counts", async () => {
  const calls = [];
  const client = createWorkerClient({ host: "https://w.test", token: "t", fetchImpl: async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return new Response(JSON.stringify({ ok: true, upserted: JSON.parse(init.body).entries.length }), { status: 200 });
  }});
  const entries = Array.from({ length: 1201 }, (_, i) => ({ id: `e${i}`, catalog: { itemType: "plugin" } }));
  const n = await client.upsert("docker", "run-1", entries);
  assert.equal(n, 1201);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].body.entries.length, 500);
  assert.equal(calls[2].body.entries.length, 201);
  assert.equal(calls[0].headers["X-Catalog-Token"], "t");
  assert.equal(calls[0].url, "https://w.test/admin/catalog/upsert");
});

test("a non-2xx from the Worker throws with the body", async () => {
  const client = createWorkerClient({ host: "https://w.test", token: "t", fetchImpl: async () => new Response("unknown source", { status: 400 }) });
  await assert.rejects(() => client.finish("docker", "r"), /400.*unknown source/);
});
```

- [ ] **Step 2: Run** `cd /home/destin/youcoded-dev/wecoded-marketplace && node --test scripts/catalog/test/` → FAIL (modules missing).

- [ ] **Step 3: Implement**

`scripts/catalog/lib/http.mjs`:
```js
// Tiny fetch helpers — no deps, like scripts/sync.js. GitHub calls are
// authenticated (60/hr unauthenticated does not survive an enrichment pass)
// and rate-limit aware: below 200 remaining we stop rather than get banned.
export class RateLimited extends Error {}

async function check(res, url) {
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res;
}

export async function getJson(url, { headers = {} } = {}) {
  return (await check(await fetch(url, { headers }), url)).json();
}
export async function getText(url, { headers = {} } = {}) {
  return (await check(await fetch(url, { headers }), url)).text();
}
export async function postJson(url, body, { headers = {} } = {}) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${url} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

const GH_API = "https://api.github.com";
export const github = Object.assign(async function github(pathOrUrl) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required for GitHub API calls");
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${GH_API}${pathOrUrl}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "wecoded-catalog" } });
  const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? "1000");
  github.remaining = remaining;
  if (res.status === 403 && remaining === 0) throw new RateLimited(`GitHub rate limit hit (resets ${res.headers.get("x-ratelimit-reset")})`);
  if (remaining < 200) throw new RateLimited(`GitHub rate limit nearly exhausted (${remaining} left)`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}, { remaining: Infinity });

export function githubRaw(owner, repo, sha, path) {
  return getText(`https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${path}`);
}
```

`scripts/catalog/lib/entry.mjs`:
```js
// The shape the app reads: today's index.json row + `catalog`. Keep in step
// with desktop/src/shared/types.ts SkillEntry and catalog-types.ts CatalogMeta.
export const CATALOG_SOURCES = ["wecoded", "anthropic", "mcp-registry", "docker", "awesome-copilot", "cursorrules"];

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

const SPDX = new Map([
  ["mit license", "MIT"], ["mit", "MIT"],
  ["apache license 2.0", "Apache-2.0"], ["apache-2.0", "Apache-2.0"], ["apache 2.0", "Apache-2.0"],
  ["bsd 3-clause \"new\" or \"revised\" license", "BSD-3-Clause"], ["bsd-3-clause", "BSD-3-Clause"],
  ["bsd 2-clause \"simplified\" license", "BSD-2-Clause"], ["bsd-2-clause", "BSD-2-Clause"],
  ["gnu general public license v3.0", "GPL-3.0"], ["gpl-3.0", "GPL-3.0"],
  ["mozilla public license 2.0", "MPL-2.0"], ["mpl-2.0", "MPL-2.0"],
  ["isc license", "ISC"], ["isc", "ISC"], ["the unlicense", "Unlicense"], ["unlicense", "Unlicense"],
  ["creative commons zero v1.0 universal", "CC0-1.0"], ["cc0-1.0", "CC0-1.0"],
]);
export function licenseToSpdx(name) {
  if (!name || typeof name !== "string") return undefined;
  const k = name.trim().toLowerCase();
  if (k === "noassertion" || k === "other") return undefined;
  return SPDX.get(k) ?? (/^[A-Za-z0-9.+-]+$/.test(name.trim()) ? name.trim() : undefined);
}

const SOURCE_MARKETPLACE = { wecoded: "youcoded", anthropic: "anthropic", "mcp-registry": "mcp-registry", docker: "docker", "awesome-copilot": "awesome-copilot", cursorrules: "cursorrules" };

/** Build one catalog row. `source` is the ingest source name; everything the UI
 *  reads lives under `catalog`. Fields absent from the input are omitted, not
 *  nulled, so JSON stays small. */
export function makeEntry(o) {
  const today = new Date().toISOString().split("T")[0] + "T00:00:00Z";
  const entry = {
    id: o.id,
    type: o.itemType === "prompt" ? "prompt" : "plugin",
    displayName: o.displayName,
    description: o.description ?? "",
    category: o.category ?? "development",
    author: o.author ?? "",
    tags: o.tags ?? [],
    version: o.version ?? "1.0.0",
    publishedAt: o.publishedAt ?? today,
    updatedAt: o.updatedAt ?? today,
    sourceMarketplace: SOURCE_MARKETPLACE[o.source ?? o.mirroredFromKey ?? "wecoded"] ?? o.source ?? "wecoded",
    sourceType: o.sourceType,
    sourceRef: o.sourceRef,
    catalog: {
      itemType: o.itemType,
      origin: { tier: o.origin, ...(o.mirroredFrom ? { mirroredFrom: o.mirroredFrom } : {}) },
      scan: o.scan,
      capabilities: o.capabilities ?? [],
      ...(o.license ? { license: o.license } : {}),
      ...(o.sourceCommit ? { sourceCommit: o.sourceCommit } : {}),
      ...(o.partOf ? { partOf: o.partOf } : {}),
      ...(o.upstreamId ? { upstreamId: o.upstreamId } : {}),
      ...(typeof o.stars === "number" ? { stars: o.stars } : {}),
    },
  };
  for (const k of ["sourceSubdir", "sourceSha", "repoUrl", "tagline", "longDescription", "lifeArea", "audience", "components", "prompt", "pluginName", "deprecated"]) {
    if (o[k] !== undefined) entry[k] = o[k];
  }
  return entry;
}
```
(`source` is the ingest source; `makeEntry` callers pass it as `o.source`. Fix the test's expectation accordingly: pass `source: "docker"` in the `makeEntry` call in `entry.test.mjs`.)

`scripts/catalog/lib/worker.mjs`:
```js
// Client for the Worker's ingest routes (worker/src/catalog/routes.ts).
export function createWorkerClient({ host, token, fetchImpl = fetch }) {
  const headers = { "Content-Type": "application/json", "X-Catalog-Token": token };
  async function call(method, path, body) {
    const res = await fetchImpl(`${host}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : {};
  }
  return {
    lastRun: (source) => call("GET", `/admin/catalog/last-run?source=${encodeURIComponent(source)}`).then((r) => r.run),
    async upsert(source, runId, entries, slice) {
      let total = 0;
      for (let i = 0; i < entries.length; i += 500) {
        const chunk = entries.slice(i, i + 500);
        const sub = slice ? Object.fromEntries(chunk.filter((e) => slice[e.id] === 0).map((e) => [e.id, 0])) : undefined;
        const r = await call("POST", "/admin/catalog/upsert", { source, run_id: runId, entries: chunk, ...(sub && Object.keys(sub).length ? { slice: sub } : {}) });
        total += r.upserted;
      }
      return total;
    },
    finish: (source, runId, note) => call("POST", "/admin/catalog/finish", { source, run_id: runId, ...(note ? { note } : {}) }),
  };
}
```

`scripts/catalog/build.mjs`:
```js
#!/usr/bin/env node
// Catalog ingest — pulls every source, normalises, upserts to the Worker.
//   node scripts/catalog/build.mjs [--source <name>] [--dry-run] [--full]
// Env: CATALOG_INGEST_TOKEN (required unless --dry-run), GITHUB_TOKEN (required),
//      CATALOG_HOST (default https://wecoded-marketplace-api.destinj101.workers.dev)
import fs from "node:fs";
import { createWorkerClient } from "./lib/worker.mjs";
import { CATALOG_SOURCES } from "./lib/entry.mjs";

const args = new Set(process.argv.slice(2));
const pick = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const only = pick("--source");
const dryRun = args.has("--dry-run");
const full = args.has("--full");
const host = process.env.CATALOG_HOST ?? "https://wecoded-marketplace-api.destinj101.workers.dev";

const SOURCES = {
  wecoded: () => import("./sources/wecoded.mjs"),
  docker: () => import("./sources/docker.mjs"),
  "awesome-copilot": () => import("./sources/awesome-copilot.mjs"),
  cursorrules: () => import("./sources/cursorrules.mjs"),
  "mcp-registry": () => import("./sources/mcp-registry.mjs"),
};

const runId = `${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${process.env.GITHUB_RUN_ID ?? "local"}`;
const client = dryRun ? null : createWorkerClient({ host, token: process.env.CATALOG_INGEST_TOKEN ?? (() => { throw new Error("CATALOG_INGEST_TOKEN missing"); })() });
const report = { runId, sources: {} };
const names = only ? [only] : Object.keys(SOURCES);

for (const name of names) {
  if (!SOURCES[name]) throw new Error(`unknown source ${name}; known: ${CATALOG_SOURCES.join(", ")}`);
  const started = Date.now();
  try {
    const { collect } = await SOURCES[name]();
    const lastRun = client ? await client.lastRun(name) : null;
    const { entries, slice = {}, sources: subSources } = await collect({ lastRun, full, log: (m) => console.log(`[${name}] ${m}`) });
    // A source may emit rows under several Worker sources (wecoded emits
    // "wecoded" and "anthropic"); group and upsert per Worker source.
    const groups = subSources ?? { [name]: entries };
    for (const [src, rows] of Object.entries(groups)) {
      if (dryRun) { fs.writeFileSync(`catalog-dry-run-${src}.json`, JSON.stringify(rows, null, 2)); console.log(`[${src}] dry-run: ${rows.length} rows`); continue; }
      const upserted = await client.upsert(src, runId, rows, slice);
      const { retired } = await client.finish(src, runId);
      report.sources[src] = { upserted, retired, ms: Date.now() - started };
      console.log(`[${src}] upserted ${upserted}, retired ${retired}`);
    }
  } catch (err) {
    report.sources[name] = { error: String(err && err.message || err) };
    console.error(`[${name}] FAILED: ${err && err.stack || err}`);
    process.exitCode = 1;
  }
}
fs.writeFileSync("catalog-report.json", JSON.stringify(report, null, 2));
```

- [ ] **Step 4: Run** `node --test scripts/catalog/test/` → PASS (4). **Step 5: Commit** `git add scripts/catalog && git commit -m "feat(catalog): ingest scaffold — http, entry, worker client, build"`.

---

### Task 7: Capabilities + rule-based scan

**Files:**
- Create: `scripts/catalog/lib/capabilities.mjs`
- Test: `scripts/catalog/test/capabilities.test.mjs`

**Interfaces:**
- `scanFiles(files: Array<{ path: string; text: string }>, { title }) → { capabilities: Capability[], findings: string[], hosts: string[] }` — pure.
- `addsLine(components) → Capability | null` — e.g. `Adds 3 skills, 1 command and 2 specialists`.
- `mcpCapabilities(mcpJsonText, { title }) → Capability[]` — from `.mcp.json` servers: `command` → shell, `env` keys → secret, `url` → network.
- `hooksCapability(hooksJsonText) → Capability | null` — `Runs automatically <when>` from event names (`PreToolUse` → "before every tool call", `PostToolUse` → "after every tool call", `SessionStart` → "when a conversation starts", `Stop` → "every time the assistant stops", `UserPromptSubmit` → "every time you send a message").

- [ ] **Step 1: Failing tests** — `scripts/catalog/test/capabilities.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanFiles, addsLine, mcpCapabilities, hooksCapability } from "../lib/capabilities.mjs";

test("a plain SKILL.md yields no capabilities and no findings", () => {
  const r = scanFiles([{ path: "SKILL.md", text: "# Brainstorm\nAsk one question at a time." }], { title: "X" });
  assert.deepEqual(r.capabilities, []);
  assert.deepEqual(r.findings, []);
});

test("scripts reveal shell, network hosts and keys", () => {
  const r = scanFiles([
    { path: "scripts/run.sh", text: "#!/bin/bash\ncurl -s https://api.congress.gov/v3/bill -H \"X-Api-Key: $CONGRESS_API_KEY\"" },
  ], { title: "Civic" });
  assert.ok(r.capabilities.some((c) => c.kind === "shell"));
  assert.ok(r.capabilities.some((c) => c.kind === "network" && c.detail === "api.congress.gov"));
  assert.ok(r.capabilities.some((c) => c.kind === "secret" && c.detail === "CONGRESS_API_KEY"));
  assert.deepEqual(r.findings, []);
});

test("pipe-to-shell, eval of decoded text and hard-coded keys are findings", () => {
  const r = scanFiles([
    { path: "install.sh", text: "curl -fsSL https://example.com/x.sh | bash" },
    { path: "lib.js", text: "eval(Buffer.from(payload, 'base64').toString())\nconst k = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789'" },
  ], { title: "X" });
  assert.ok(r.findings.some((f) => /downloads and runs code from the internet/i.test(f)));
  assert.ok(r.findings.some((f) => /obfuscated/i.test(f)));
  assert.ok(r.findings.some((f) => /hard-coded key/i.test(f)));
});

test("mcp.json → command, env, url", () => {
  const caps = mcpCapabilities(JSON.stringify({ mcpServers: { notion: { command: "npx", args: ["-y", "@notionhq/notion-mcp-server"], env: { NOTION_TOKEN: "" } }, remote: { url: "https://mcp.example.com/sse" } } }), { title: "Notion" });
  assert.ok(caps.some((c) => c.kind === "shell" && /npx/.test(c.label)));
  assert.ok(caps.some((c) => c.kind === "secret" && c.detail === "NOTION_TOKEN"));
  assert.ok(caps.some((c) => c.kind === "network" && c.detail === "mcp.example.com"));
});

test("hooks → runs automatically", () => {
  const c = hooksCapability(JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "x" }] }], PostToolUse: [] } }));
  assert.equal(c.kind, "auto");
  assert.match(c.label, /every time the assistant stops/);
  assert.match(c.label, /after every tool call/);
});

test("addsLine", () => {
  assert.equal(addsLine({ skills: ["a", "b", "c"], commands: ["x"], agents: ["p", "q"], hooks: [], mcpServers: [], hasMcpConfig: true }).label, "Adds 3 skills, 1 command, 2 specialists and 1 connection");
  assert.equal(addsLine({ skills: [], commands: [], agents: [], hooks: [], mcpServers: [], hasMcpConfig: false }), null);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `scripts/catalog/lib/capabilities.mjs`:

```js
// "What this can do" and the automatic check — computed from FILES, never from
// an author's description (spec §1.6/§1.7). Findings are plain sentences a
// non-technical user can act on; each rule names what it saw.
const SCRIPT_EXT = /\.(sh|bash|zsh|py|js|mjs|cjs|ts|rb|ps1)$/i;
const HOST_RE = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?/gi;
const ENV_KEY_RE = /\b([A-Z][A-Z0-9_]{2,}(?:_KEY|_TOKEN|_SECRET|_PASSWORD|API_KEY))\b/g;
const HARDCODED_KEY_RE = /\b(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/;
const PIPE_TO_SHELL_RE = /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/;
const OBFUSCATION_RE = /\beval\s*\(\s*(Buffer\.from|atob|base64|decode)|base64\s+(-d|--decode)[^\n]*\|\s*(ba)?sh|\bexec\s*\(\s*atob/;
const RM_RF_RE = /\brm\s+-rf\s+(\/|~|\$HOME)(?![\w/.-]*tmp)/;

export function scanFiles(files, { title }) {
  const capabilities = [];
  const findings = [];
  const hosts = new Set();
  const keys = new Set();
  let shell = false;
  for (const f of files) {
    const text = f.text ?? "";
    if (SCRIPT_EXT.test(f.path)) shell = true;
    for (const m of text.matchAll(HOST_RE)) hosts.add(m[1].toLowerCase());
    for (const m of text.matchAll(ENV_KEY_RE)) keys.add(m[1]);
    if (HARDCODED_KEY_RE.test(text)) findings.push(`Contains what looks like a hard-coded key in ${f.path}`);
    if (PIPE_TO_SHELL_RE.test(text)) findings.push(`Downloads and runs code from the internet (${f.path})`);
    if (OBFUSCATION_RE.test(text)) findings.push(`Runs obfuscated code — text is decoded and executed at runtime (${f.path})`);
    if (RM_RF_RE.test(text)) findings.push(`Deletes files outside its own folder (${f.path})`);
  }
  hosts.delete("github.com"); hosts.delete("raw.githubusercontent.com"); hosts.delete("docs.anthropic.com");
  if (shell) capabilities.push({ kind: "shell", label: "Runs commands on your computer" });
  const hostList = [...hosts].sort();
  if (hostList.length) capabilities.push({ kind: "network", label: "Connects to the internet", detail: hostList.slice(0, 3).join(", ") + (hostList.length > 3 ? ` +${hostList.length - 3}` : "") });
  for (const k of [...keys].sort()) capabilities.push({ kind: "secret", label: `Needs a ${title} key`, detail: k });
  return { capabilities, findings: [...new Set(findings)], hosts: hostList };
}

const EVENT_WORDS = {
  PreToolUse: "before every tool call", PostToolUse: "after every tool call", SessionStart: "when a conversation starts",
  Stop: "every time the assistant stops", SubagentStop: "every time a specialist finishes", UserPromptSubmit: "every time you send a message",
  Notification: "on every notification", PreCompact: "before the conversation is trimmed",
};
export function hooksCapability(text) {
  let json; try { json = JSON.parse(text); } catch { return null; }
  const events = Object.keys(json.hooks ?? json).filter((k) => EVENT_WORDS[k]);
  if (!events.length) return null;
  return { kind: "auto", label: `Runs automatically ${events.map((e) => EVENT_WORDS[e]).join(" and ")}` };
}

export function mcpCapabilities(text, { title }) {
  let json; try { json = JSON.parse(text); } catch { return []; }
  const servers = json.mcpServers ?? json.servers ?? json;
  const caps = [];
  for (const [name, s] of Object.entries(servers)) {
    if (!s || typeof s !== "object") continue;
    if (s.command) caps.push({ kind: "shell", label: `Runs ${s.command}${Array.isArray(s.args) && s.args.length ? " " + s.args.slice(0, 2).join(" ") : ""} on your computer` });
    for (const k of Object.keys(s.env ?? {})) caps.push({ kind: "secret", label: `Needs a ${title} key`, detail: k });
    if (typeof s.url === "string") { const h = s.url.match(/^https?:\/\/([^/:]+)/); if (h) caps.push({ kind: "network", label: "Connects to the internet", detail: h[1] }); }
    void name;
  }
  return caps;
}

const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
export function addsLine(c) {
  if (!c) return null;
  const parts = [];
  if (c.skills?.length) parts.push(plural(c.skills.length, "skill"));
  if (c.commands?.length) parts.push(plural(c.commands.length, "command"));
  if (c.agents?.length) parts.push(plural(c.agents.length, "specialist"));
  if (c.hooks?.length) parts.push(plural(c.hooks.length, "hook"));
  const conns = (c.mcpServers?.length || 0) || (c.hasMcpConfig ? 1 : 0);
  if (conns) parts.push(plural(conns, "connection"));
  if (!parts.length) return null;
  const label = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  return { kind: "adds", label: `Adds ${label}` };
}
```

- [ ] **Step 4: Run** → PASS (6). **Step 5: Commit** `git add scripts/catalog && git commit -m "feat(catalog): capabilities + rule-based scan"`.

---

### Task 8: Source — `wecoded` (our plugins + Anthropic official) with members

**Files:**
- Create: `scripts/catalog/sources/wecoded.mjs`
- Test: `scripts/catalog/test/wecoded.test.mjs` with fixture `scripts/catalog/test/fixtures/index-sample.json` (copy 3 rows from the repo's `index.json`: one `local` youcoded plugin with skills+commands, one `url` anthropic plugin with `sourceSha`, one `git-subdir` plugin with agents and `hasMcpConfig`).

**Interfaces:**
- `collect({ log }) → { entries, sources: { wecoded: SkillEntry[], anthropic: SkillEntry[] } }` — reads `index.json` at the repo root (the output of `sync.js`), drops `deprecated`, and for every plugin emits: the bundle row (`itemType: 'plugin'`, origin `youcoded` for `sourceMarketplace === 'youcoded'`, else `verified` with `mirroredFrom: 'anthropics/claude-plugins-official'`), plus member rows: `components.skills[]` → `skill`, `components.agents[]` → `specialist`, `hasMcpConfig || mcpServers.length` → one `tool` row named `<displayName> (connection)`. Members: id `<bundle>/<name>`, `partOf`, inherit origin/scan/license/commit, `capabilities: []`.
- File fetch for scanning: `local` → read from the repo checkout (`<sourceRef>/`), `url`/`git-subdir` → GitHub Tree at `sourceSha` (or `/commits/HEAD` → sha) then raw fetch of: `.mcp.json`, `hooks/hooks.json`, `.claude-plugin/plugin.json`, and up to 20 files under `scripts/`, `hooks/`, `bin/` with `SCRIPT_EXT`, each ≤ 64 KB. `scan.status`: `caution`/`checked` when fetched; `unchecked` when the fetch failed (log why).
- Licence: `local` → the repo's LICENSE (MIT — hard-code `MIT` for `sourceMarketplace === 'youcoded'`); GitHub → `/repos/{o}/{r}` `license.spdx_id` (guard null / `NOASSERTION`), cached per repo within the run. Stars from the same call.

- [ ] **Step 1: Failing test** — `scripts/catalog/test/wecoded.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalise } from "../sources/wecoded.mjs";
import sample from "./fixtures/index-sample.json" with { type: "json" };

test("normalise emits a bundle row + member rows with partOf", () => {
  const fake = { files: async () => ({ ok: true, files: [{ path: "SKILL.md", text: "hi" }] }), repo: async () => ({ stars: 12, license: "MIT", sha: "abc1234" }) };
  const rows = normalise(sample, fake.files, fake.repo);
  return rows.then((out) => {
    const bundles = out.filter((r) => r.catalog.itemType === "plugin");
    assert.equal(bundles.length, 3);
    const yc = bundles.find((b) => b.sourceMarketplace === "youcoded");
    assert.equal(yc.catalog.origin.tier, "youcoded");
    const an = bundles.find((b) => b.sourceMarketplace === "anthropic");
    assert.equal(an.catalog.origin.tier, "verified");
    assert.equal(an.catalog.origin.mirroredFrom, "anthropics/claude-plugins-official");
    assert.equal(an.catalog.sourceCommit, an.sourceSha ?? "abc1234");
    const members = out.filter((r) => r.catalog.partOf);
    assert.ok(members.length >= 3);
    const skill = members.find((m) => m.catalog.itemType === "skill");
    assert.match(skill.id, /^[^/]+\/[^/]+$/);
    assert.equal(skill.catalog.partOf.id, skill.pluginName);
    assert.ok(members.some((m) => m.catalog.itemType === "specialist"));
    assert.ok(members.some((m) => m.catalog.itemType === "tool"));
    assert.ok(bundles.every((b) => b.catalog.scan.status === "checked"));
    assert.ok(bundles.some((b) => b.catalog.capabilities.some((c) => c.kind === "adds")));
  });
});

test("a failed file fetch leaves the bundle unchecked, never checked", async () => {
  const rows = await normalise(sample, async () => ({ ok: false, files: [] }), async () => null);
  assert.ok(rows.filter((r) => !r.catalog.partOf).every((b) => b.catalog.scan.status === "unchecked"));
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `scripts/catalog/sources/wecoded.mjs`:

```js
// Our own registry (index.json = sync.js output: 13 YouCoded plugins + the
// Anthropic official list). Emits the bundle rows AND one row per member
// (skill / specialist / connection) so the type tabs and search can show them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { github, githubRaw } from "../lib/http.mjs";
import { makeEntry } from "../lib/entry.mjs";
import { scanFiles, addsLine, mcpCapabilities, hooksCapability } from "../lib/capabilities.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OFFICIAL = "anthropics/claude-plugins-official";
const SCRIPT_EXT = /\.(sh|bash|zsh|py|js|mjs|cjs|ts|rb|ps1)$/i;
const MAX_FILES = 20, MAX_BYTES = 64 * 1024;

function parseRepo(url) {
  const m = String(url ?? "").match(/github\.com\/([^/]+)\/([^/.#]+)/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/** Files worth scanning for one plugin. Returns { ok, files } — ok=false means
 *  "could not read", which must surface as scan.status 'unchecked'. */
export async function fetchFiles(entry) {
  const wanted = (p) => /^(\.mcp\.json|hooks\/hooks\.json|\.claude-plugin\/plugin\.json)$/.test(p) || (/^(scripts|hooks|bin)\//.test(p) && SCRIPT_EXT.test(p));
  if (entry.sourceType === "local") {
    const dir = path.join(ROOT, entry.sourceRef);
    if (!fs.existsSync(dir)) return { ok: false, files: [] };
    const files = [];
    const walk = (d, rel = "") => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n), r = rel ? `${rel}/${n}` : n; if (fs.statSync(p).isDirectory()) { if (n !== "node_modules" && n !== ".git") walk(p, r); } else if (wanted(r) && files.length < MAX_FILES) files.push({ path: r, text: fs.readFileSync(p, "utf8").slice(0, MAX_BYTES) }); } };
    walk(dir);
    return { ok: true, files, sha: undefined };
  }
  const gh = parseRepo(entry.sourceRef);
  if (!gh) return { ok: false, files: [] };
  try {
    const sha = entry.sourceSha ?? (await github(`/repos/${gh.owner}/${gh.repo}/commits/HEAD`))?.sha;
    if (!sha) return { ok: false, files: [] };
    const tree = await github(`/repos/${gh.owner}/${gh.repo}/git/trees/${sha}?recursive=1`);
    const prefix = entry.sourceSubdir ? entry.sourceSubdir.replace(/\/$/, "") + "/" : "";
    const paths = (tree?.tree ?? []).filter((t) => t.type === "blob" && t.path.startsWith(prefix)).map((t) => t.path.slice(prefix.length)).filter(wanted).slice(0, MAX_FILES);
    const files = [];
    for (const p of paths) files.push({ path: p, text: (await githubRaw(gh.owner, gh.repo, sha, prefix + p)).slice(0, MAX_BYTES) });
    return { ok: true, files, sha };
  } catch (e) {
    return { ok: false, files: [], error: String(e.message ?? e) };
  }
}

/** GitHub repo facts, cached per run. */
export function repoFacts() {
  const cache = new Map();
  return async (url) => {
    const gh = parseRepo(url);
    if (!gh) return null;
    const key = `${gh.owner}/${gh.repo}`;
    if (!cache.has(key)) {
      cache.set(key, github(`/repos/${key}`).then((r) => r ? { stars: r.stargazers_count, license: r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : undefined, pushedAt: r.pushed_at } : null).catch(() => null));
    }
    return cache.get(key);
  };
}

export async function normalise(index, files = fetchFiles, repo = repoFacts()) {
  const out = [];
  for (const e of index) {
    if (e.deprecated || e.type === "prompt") continue;
    const isOurs = e.sourceMarketplace === "youcoded";
    const facts = isOurs ? { license: "MIT" } : (await repo(e.repoUrl ?? e.sourceRef)) ?? {};
    const fetched = await files(e);
    const scanned = fetched.ok ? scanFiles(fetched.files, { title: e.displayName }) : null;
    const caps = [];
    if (scanned) {
      caps.push(...scanned.capabilities);
      const mcp = fetched.files.find((f) => f.path === ".mcp.json"); if (mcp) caps.push(...mcpCapabilities(mcp.text, { title: e.displayName }));
      const hooks = fetched.files.find((f) => f.path === "hooks/hooks.json"); const h = hooks && hooksCapability(hooks.text); if (h) caps.push(h);
    }
    const adds = addsLine(e.components); if (adds) caps.push(adds);
    const scan = scanned
      ? (scanned.findings.length ? { status: "caution", checkedAt: new Date().toISOString(), findings: scanned.findings } : { status: "checked", checkedAt: new Date().toISOString() })
      : { status: "unchecked" };
    const sourceCommit = e.sourceSha ?? fetched.sha;
    const base = {
      source: isOurs ? "wecoded" : "anthropic",
      origin: isOurs ? "youcoded" : "verified",
      mirroredFrom: isOurs ? undefined : OFFICIAL,
      license: facts.license, stars: facts.stars, sourceCommit,
      author: e.author, repoUrl: e.repoUrl, tags: e.tags, category: e.category, lifeArea: e.lifeArea, audience: e.audience,
      version: e.version, publishedAt: e.publishedAt,
    };
    out.push(makeEntry({ ...base, id: e.id, itemType: "plugin", displayName: e.displayName, description: e.description, tagline: e.tagline, longDescription: e.longDescription,
      sourceType: e.sourceType, sourceRef: e.sourceRef, sourceSubdir: e.sourceSubdir, sourceSha: e.sourceSha, components: e.components, capabilities: caps, scan }));
    const member = (itemType, name, displayName, description) => out.push(makeEntry({ ...base, id: `${e.id}/${name}`, itemType, displayName, description,
      sourceType: e.sourceType, sourceRef: e.sourceRef, sourceSubdir: e.sourceSubdir, pluginName: e.id, partOf: { id: e.id, displayName: e.displayName }, capabilities: [], scan }));
    const c = e.components ?? {};
    for (const s of c.skills ?? []) member("skill", s, titleCase(s), `Part of ${e.displayName}.`);
    for (const a of c.agents ?? []) member("specialist", a, titleCase(a), `A specialist from ${e.displayName}.`);
    if ((c.mcpServers ?? []).length || c.hasMcpConfig) member("tool", "connection", `${e.displayName} (connection)`, `The connection ${e.displayName} sets up.`);
  }
  return out;
}

const titleCase = (s) => s.replace(/[-_]/g, " ").replace(/^./, (ch) => ch.toUpperCase());

export async function collect({ log }) {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, "index.json"), "utf8"));
  log(`index.json: ${index.length} rows`);
  const rows = await normalise(index);
  const sources = { wecoded: rows.filter((r) => r.sourceMarketplace === "youcoded"), anthropic: rows.filter((r) => r.sourceMarketplace === "anthropic") };
  log(`wecoded ${sources.wecoded.length}, anthropic ${sources.anthropic.length}`);
  return { entries: rows, sources };
}
```

Member descriptions are generic here; the ingest reads each `SKILL.md`'s frontmatter `description` in a follow-up (one raw fetch per skill — 2,000 calls, out of the hourly budget; ROADMAP).

- [ ] **Step 4: Run** `node --test scripts/catalog/test/` → PASS. Then a real dry run: `GITHUB_TOKEN=$(gh auth token) node scripts/catalog/build.mjs --source wecoded --dry-run` → writes `catalog-dry-run-wecoded.json` and `catalog-dry-run-anthropic.json`; open one bundle and eyeball `catalog.capabilities` against its repo. Add `catalog-dry-run-*.json` and `catalog-report.json` to `.gitignore`.

- [ ] **Step 5: Commit** `git add scripts/catalog .gitignore && git commit -m "feat(catalog): wecoded source — bundles, members, scan"`.

---

### Task 9: Sources — Docker, awesome-copilot, cursorrules

**Files:**
- Create: `scripts/catalog/sources/docker.mjs`, `scripts/catalog/sources/awesome-copilot.mjs`, `scripts/catalog/sources/cursorrules.mjs`
- Test: `scripts/catalog/test/sources.test.mjs` with fixtures `docker-sample.json` (the `brave` entry, verbatim from 2026-08-28), `copilot-marketplace-sample.json` (one string-source and one object-source plugin), `cursorrules-sample.mdc`.

**Interfaces (each file):** `normalise(raw, helpers) → SkillEntry[]` (pure, tested) and `collect({ log }) → { entries }`.

Facts the code relies on (verified 2026-08-28): Docker `catalog.json` is `{ registry: { [slug]: {...} } }` — **no `name` key**, `tools[]` are `{name}` stubs, `metadata.license` is free text, `source` is `https://github.com/<o>/<r>/tree/<sha>…`, `image` is `mcp/<x>@sha256:…` for Docker-built, `secrets[]{name,env,description}`, `oauth` `{}` or populated, `allowHosts[]`, `disableNetwork`, `volumes[]`, `longLived`. awesome-copilot `marketplace.json` `plugins[]` has `source` as **string** `plugins/<name>` (in-repo) or **object** `{source:"github", repo, ref}`; no `category`; `skills/<name>/SKILL.md` (415), `agents/*.agent.md` (223), `instructions/*.instructions.md` (193). awesome-cursorrules: flat `rules/<slug>.mdc` (257) with YAML frontmatter `description`, `globs`, `alwaysApply`; LICENSE is CC0-1.0.

- [ ] **Step 1: Failing tests** — `scripts/catalog/test/sources.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import docker from "./fixtures/docker-sample.json" with { type: "json" };
import copilot from "./fixtures/copilot-marketplace-sample.json" with { type: "json" };
import fs from "node:fs";
import { normalise as normaliseDocker } from "../sources/docker.mjs";
import { normalise as normaliseCopilot } from "../sources/awesome-copilot.mjs";
import { normalise as normaliseRules } from "../sources/cursorrules.mjs";

test("docker: slug from the map key, verified when Docker built the image, secrets/oauth/hosts → capabilities", () => {
  const [brave] = normaliseDocker(docker);
  assert.equal(brave.id, "docker-brave");
  assert.equal(brave.displayName, "Brave Search");
  assert.equal(brave.catalog.itemType, "tool");
  assert.equal(brave.catalog.origin.tier, "verified");          // image starts with mcp/
  assert.equal(brave.catalog.origin.mirroredFrom, "Docker MCP Catalog");
  assert.equal(brave.catalog.license, "MIT");                    // "MIT License" → SPDX
  assert.equal(brave.catalog.upstreamId, "brave");
  assert.equal(brave.repoUrl, "https://github.com/brave/brave-search-mcp-server");
  assert.match(brave.catalog.sourceCommit, /^[0-9a-f]{7,40}$/);  // from source .../tree/<sha>
  assert.ok(brave.catalog.capabilities.some((c) => c.kind === "secret" && c.detail === "BRAVE_API_KEY"));
  assert.ok(brave.catalog.capabilities.some((c) => c.kind === "network"));
  assert.ok(brave.catalog.capabilities.some((c) => c.kind === "adds" && /tool/.test(c.label)));
  assert.equal(brave.catalog.scan.status, "unchecked");           // no files read here; Docker's provenance is not our scan
  assert.equal(brave.sourceType, "mcp-registry");
});

test("copilot: in-repo plugins pin to the repo sha as git-subdir; external ones resolve their tag", () => {
  const rows = normaliseCopilot(copilot, { repoSha: "deadbeef", resolveRef: () => "cafe1234" });
  const inRepo = rows.find((r) => r.id === "copilot-accessibility-kanban");
  assert.equal(inRepo.sourceType, "git-subdir");
  assert.equal(inRepo.sourceRef, "https://github.com/github/awesome-copilot.git");
  assert.equal(inRepo.sourceSubdir, "plugins/accessibility-kanban");
  assert.equal(inRepo.catalog.sourceCommit, "deadbeef");
  assert.equal(inRepo.catalog.origin.tier, "verified");
  assert.equal(inRepo.catalog.license, "MIT");
  const ext = rows.find((r) => r.id === "copilot-agent-council");
  assert.equal(ext.sourceType, "url");
  assert.equal(ext.sourceRef, "https://github.com/Avyayalaya/agent-council.git");
  assert.equal(ext.catalog.sourceCommit, "cafe1234");
  assert.equal(ext.catalog.origin.tier, "community");
});

test("cursorrules: one prompt row per .mdc, CC0, text inline", () => {
  const text = fs.readFileSync(new URL("./fixtures/cursorrules-sample.mdc", import.meta.url), "utf8");
  const [row] = normaliseRules([{ path: "rules/android-jetpack-compose-cursorrules-prompt-file.mdc", text }], { sha: "88ab01d" });
  assert.equal(row.id, "cursorrules-android-jetpack-compose");
  assert.equal(row.type, "prompt");
  assert.equal(row.catalog.itemType, "prompt");
  assert.equal(row.catalog.license, "CC0-1.0");
  assert.match(row.description, /Jetpack Compose/);
  assert.ok(row.prompt.includes("Jetpack Compose"));
  assert.equal(row.catalog.scan.status, "checked");
  assert.deepEqual(row.catalog.capabilities, []);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`sources/docker.mjs`:
```js
import { getJson } from "../lib/http.mjs";
import { makeEntry, licenseToSpdx, slug } from "../lib/entry.mjs";
const URL_ = "https://desktop.docker.com/mcp/catalog/v3/catalog.json";

export function normalise(catalog) {
  const out = [];
  for (const [key, s] of Object.entries(catalog.registry ?? {})) {
    if (s.type && s.type !== "server" && s.type !== "remote") continue;
    const title = s.title || key;
    const caps = [];
    for (const sec of s.secrets ?? []) caps.push({ kind: "secret", label: `Needs a ${title} key`, detail: sec.env || sec.name });
    if (s.oauth && Object.keys(s.oauth).length) caps.push({ kind: "secret", label: `Signs in to ${title} with your account` });
    if (s.disableNetwork) { /* no network line */ }
    else if (Array.isArray(s.allowHosts) && s.allowHosts.length) caps.push({ kind: "network", label: "Connects to the internet", detail: s.allowHosts.map((h) => h.replace(/:\d+$/, "")).slice(0, 3).join(", ") });
    else caps.push({ kind: "network", label: "Connects to the internet" });
    if (Array.isArray(s.volumes) && s.volumes.length) caps.push({ kind: "files", label: "Reads and writes folders you choose" });
    if (s.longLived) caps.push({ kind: "auto", label: "Keeps running in the background" });
    const tools = Array.isArray(s.tools) ? s.tools.length : 0;
    if (tools) caps.push({ kind: "adds", label: `Adds ${tools} tool${tools === 1 ? "" : "s"}` });
    const sha = String(s.source ?? "").match(/\/tree\/([0-9a-f]{7,40})/)?.[1];
    out.push(makeEntry({
      source: "docker", id: `docker-${slug(key)}`, itemType: "tool", displayName: title, description: s.description ?? "",
      author: s.metadata?.owner ?? "", repoUrl: s.upstream || undefined, tags: (s.metadata?.tags ?? []).slice(0, 6),
      category: s.metadata?.category === "productivity" ? "productivity" : "development",
      sourceType: "mcp-registry", sourceRef: `docker:${s.image ?? key}`,
      origin: String(s.image ?? "").startsWith("mcp/") ? "verified" : "community", mirroredFrom: "Docker MCP Catalog",
      license: licenseToSpdx(s.metadata?.license), upstreamId: key, stars: s.metadata?.githubStars, sourceCommit: sha,
      capabilities: caps, scan: { status: "unchecked" },
      publishedAt: s.dateAdded,
    }));
  }
  return out;
}

export async function collect({ log }) {
  const catalog = await getJson(URL_);
  const entries = normalise(catalog);
  log(`${Object.keys(catalog.registry ?? {}).length} servers → ${entries.length} rows`);
  return { entries };
}
```

`sources/awesome-copilot.mjs`:
```js
import { getJson, github } from "../lib/http.mjs";
import { makeEntry, slug } from "../lib/entry.mjs";
const REPO = "github/awesome-copilot", CLONE = `https://github.com/${REPO}.git`, RAW = `https://raw.githubusercontent.com/${REPO}/main`;

export function normalise(marketplace, { repoSha, resolveRef, tree = [] }) {
  const out = [];
  const common = { source: "awesome-copilot", mirroredFrom: "github/awesome-copilot", scan: { status: "unchecked" }, capabilities: [] };
  for (const p of marketplace.plugins ?? []) {
    if (typeof p.source === "string") {
      out.push(makeEntry({ ...common, id: `copilot-${slug(p.name)}`, itemType: "plugin", displayName: p.name, description: p.description, author: "GitHub",
        repoUrl: `https://github.com/${REPO}/tree/main/${p.source}`, tags: (p.keywords ?? []).slice(0, 6), version: p.version,
        sourceType: "git-subdir", sourceRef: CLONE, sourceSubdir: p.source, origin: "verified", license: "MIT", sourceCommit: repoSha, upstreamId: p.name }));
    } else if (p.source && p.source.source === "github" && p.source.repo) {
      const ref = p.source.ref;
      out.push(makeEntry({ ...common, id: `copilot-${slug(p.name)}`, itemType: "plugin", displayName: p.name, description: p.description, author: p.author?.name ?? p.source.repo.split("/")[0],
        repoUrl: `https://github.com/${p.source.repo}`, tags: (p.keywords ?? []).slice(0, 6), version: p.version,
        sourceType: "url", sourceRef: `https://github.com/${p.source.repo}.git`, origin: "community", license: p.license, sourceCommit: resolveRef(p.source.repo, ref), upstreamId: `${p.source.repo}@${ref ?? "HEAD"}` }));
    }
  }
  // Standalone items in the repo tree: skills, agents (specialists), instructions (prompts).
  for (const t of tree) {
    const m = t.match(/^skills\/([^/]+)\/SKILL\.md$/); if (m) out.push(makeEntry({ ...common, id: `copilot-skill-${slug(m[1])}`, itemType: "skill", displayName: titleCase(m[1]), description: `Skill from github/awesome-copilot: ${m[1]}.`, author: "GitHub", repoUrl: `https://github.com/${REPO}/tree/main/skills/${m[1]}`, sourceType: "git-subdir", sourceRef: CLONE, sourceSubdir: `skills/${m[1]}`, origin: "verified", license: "MIT", sourceCommit: repoSha, upstreamId: `skills/${m[1]}` }));
    const a = t.match(/^agents\/([^/]+)\.agent\.md$/); if (a) out.push(makeEntry({ ...common, id: `copilot-agent-${slug(a[1])}`, itemType: "specialist", displayName: titleCase(a[1]), description: `Specialist from github/awesome-copilot: ${a[1]}.`, author: "GitHub", repoUrl: `https://github.com/${REPO}/blob/main/${t}`, sourceType: "file", sourceRef: `${RAW}/${t}`, origin: "verified", license: "MIT", sourceCommit: repoSha, upstreamId: t }));
    const i = t.match(/^instructions\/([^/]+)\.instructions\.md$/); if (i) out.push(makeEntry({ ...common, id: `copilot-instructions-${slug(i[1])}`, itemType: "prompt", displayName: titleCase(i[1]), description: `Instructions from github/awesome-copilot: ${i[1]}.`, author: "GitHub", repoUrl: `https://github.com/${REPO}/blob/main/${t}`, sourceType: "file", sourceRef: `${RAW}/${t}`, origin: "verified", license: "MIT", sourceCommit: repoSha, upstreamId: t }));
  }
  return out;
}
const titleCase = (s) => s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export async function collect({ log }) {
  const marketplace = await getJson(`${RAW}/.github/plugin/marketplace.json`);
  const head = await github(`/repos/${REPO}/commits/HEAD`);
  const tree = (await github(`/repos/${REPO}/git/trees/${head.sha}?recursive=1`))?.tree?.map((t) => t.path) ?? [];
  const refCache = new Map();
  const resolveRef = (repo, ref) => refCache.get(`${repo}@${ref}`);
  // Resolve external refs up front (one call each) so normalise stays pure.
  for (const p of marketplace.plugins ?? []) if (p.source && typeof p.source === "object") {
    const k = `${p.source.repo}@${p.source.ref}`; if (!refCache.has(k)) refCache.set(k, (await github(`/repos/${p.source.repo}/commits/${p.source.ref ?? "HEAD"}`))?.sha);
  }
  const entries = normalise(marketplace, { repoSha: head.sha, resolveRef, tree });
  log(`${entries.length} rows (plugins + skills + specialists + instructions)`);
  return { entries };
}
```
`sourceType: "file"` rows (a single markdown file) cannot be installed by the current installer; Plan 3 hides Install for `sourceType` ∉ {local,url,git-subdir} (see its Task 6).

`sources/cursorrules.mjs`:
```js
import { github, githubRaw } from "../lib/http.mjs";
import { makeEntry, slug } from "../lib/entry.mjs";
const REPO = "PatrickJS/awesome-cursorrules";

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {}; for (const line of m[1].split("\n")) { const kv = line.match(/^(\w+):\s*(.*)$/); if (kv) meta[kv[1]] = kv[2].replace(/^"|"$/g, ""); }
  return { meta, body: m[2] };
}

export function normalise(files, { sha }) {
  return files.map(({ path, text }) => {
    const name = path.replace(/^rules\//, "").replace(/\.mdc$/, "").replace(/-cursorrules-prompt-file$/, "");
    const { meta, body } = frontmatter(text);
    return makeEntry({
      source: "cursorrules", id: `cursorrules-${slug(name)}`, itemType: "prompt", displayName: name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      description: meta.description || `Cursor rules: ${name}.`, author: "PatrickJS", repoUrl: `https://github.com/${REPO}/blob/main/${path}`,
      sourceType: "file", sourceRef: `https://raw.githubusercontent.com/${REPO}/${sha}/${path}`, prompt: body.trim().slice(0, 32 * 1024),
      origin: "community", mirroredFrom: "PatrickJS/awesome-cursorrules", license: "CC0-1.0", sourceCommit: sha, upstreamId: path,
      capabilities: [], scan: { status: "checked", checkedAt: new Date().toISOString() },   // plain text, no code — read in full above
    });
  });
}

export async function collect({ log }) {
  const head = await github(`/repos/${REPO}/commits/HEAD`);
  const tree = (await github(`/repos/${REPO}/git/trees/${head.sha}?recursive=1`))?.tree ?? [];
  const paths = tree.filter((t) => t.type === "blob" && /^rules\/[^/]+\.mdc$/.test(t.path)).map((t) => t.path);
  const files = [];
  for (const p of paths) files.push({ path: p, text: await githubRaw("PatrickJS", "awesome-cursorrules", head.sha, p) });
  const entries = normalise(files, { sha: head.sha });
  log(`${entries.length} rules`);
  return { entries };
}
```

- [ ] **Step 4: Run** `node --test scripts/catalog/test/` → PASS; then `GITHUB_TOKEN=$(gh auth token) node scripts/catalog/build.mjs --source docker --dry-run` (and `awesome-copilot`, `cursorrules`) — each writes its dry-run file; spot-check three rows each.

- [ ] **Step 5: Commit** `git add scripts/catalog && git commit -m "feat(catalog): docker, awesome-copilot, cursorrules sources"`.

---

### Task 10: Source — official MCP Registry, with the quality slice + enrichment

**Files:**
- Create: `scripts/catalog/sources/mcp-registry.mjs`, `scripts/catalog/enrich.mjs`
- Test: `scripts/catalog/test/mcp-registry.test.mjs` with fixture `mcp-registry-sample.json` (the two `servers[]` objects from 2026-08-28: one with `packages`, one remote-only).

**Interfaces:**
- `normalise(servers, { dockerRepos: Set<string>, stars: Map<string, number> }) → { entries, slice }` — one `tool` row per `servers[].server` whose `_meta["io.modelcontextprotocol.registry/official"].status === "active"`; id `mcp-<slug(name)>`; `upstreamId: name`; origin `verified` when `repository.source === "github"` (the registry proved namespace ownership) else `community`; capabilities from `packages[].environmentVariables[]` (`isSecret` → secret; others → `adds`-style "Configured with X"), `packages[].registryType/identifier` → `adds` "Runs as npm package @x/y" / "Runs as Python package …" / "Runs as Docker image …", `remotes[].url` host → network, `remotes[].headers[].isSecret` → secret; `scan: unchecked`; `stars` from the map; `slice[id] = 0` unless `stars >= 25` or the repo (owner/name lowercased) is in `dockerRepos`.
- `collect({ lastRun, full, log })` — pages `/v0.1/servers?version=latest&limit=100` with `cursor`; adds `updated_since=<lastRun.finished_at ISO>` unless `full`; **status is filtered client-side** (the query param is ignored by the registry). On a delta run, `finish` must NOT retire the untouched rows — so a delta run returns `{ entries, slice, noRetire: true }` and `build.mjs` skips `finish` when `noRetire` (add that branch: `if (!noRetire) await client.finish(...)`; otherwise log "delta run — no retire").
- `enrich.mjs` — `GET /admin/catalog/…` is not needed: enrichment runs inside `collect` for up to 400 repos per run that have no `stars` yet, in `updated_at` order, via `github('/repos/{o}/{r}')`, stopping on `RateLimited`. Persist by re-upserting those rows (they are in the run anyway).

- [ ] **Step 1: Failing test** — `scripts/catalog/test/mcp-registry.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import sample from "./fixtures/mcp-registry-sample.json" with { type: "json" };
import { normalise } from "../sources/mcp-registry.mjs";

test("normalise: id, verified-by-namespace, package + secret capabilities, slice by stars/docker", () => {
  const { entries, slice } = normalise(sample.servers, { dockerRepos: new Set(), stars: new Map([["agenttrust/mcp-server", 40]]) });
  const a = entries.find((e) => e.catalog.upstreamId === "ai.agenttrust/mcp-server");
  assert.equal(a.id, "mcp-ai-agenttrust-mcp-server");
  assert.equal(a.catalog.itemType, "tool");
  assert.equal(a.catalog.origin.tier, "verified");
  assert.equal(a.catalog.origin.mirroredFrom, "Official MCP Registry");
  assert.equal(a.repoUrl, "https://github.com/agenttrust/mcp-server");
  assert.ok(a.catalog.capabilities.some((c) => c.kind === "secret" && c.detail === "AGENTTRUST_API_KEY"));
  assert.ok(a.catalog.capabilities.some((c) => c.kind === "adds" && /npm package @agenttrust\/mcp-server/.test(c.label)));
  assert.equal(a.catalog.stars, 40);
  assert.equal(slice[a.id], undefined);                       // served
  const remote = entries.find((e) => e.catalog.upstreamId !== "ai.agenttrust/mcp-server");
  assert.ok(remote.catalog.capabilities.some((c) => c.kind === "network"));
  assert.equal(slice[remote.id], 0);                            // no stars, not in docker → stored, not shown
});

test("deprecated / deleted servers are skipped", () => {
  const dep = JSON.parse(JSON.stringify(sample.servers[0]));
  dep._meta["io.modelcontextprotocol.registry/official"].status = "deprecated";
  const { entries } = normalise([dep], { dockerRepos: new Set(), stars: new Map() });
  assert.equal(entries.length, 0);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `sources/mcp-registry.mjs`:

```js
// Official MCP Registry — CC0 data, invites sub-registries (ToS §10–11).
// Ingested in FULL, served only above the quality bar (stars ≥ 25 or also in
// Docker's catalog) so the app's grid is not 25,000 unstarred rows.
import { getJson, github, RateLimited } from "../lib/http.mjs";
import { makeEntry, slug } from "../lib/entry.mjs";
const BASE = "https://registry.modelcontextprotocol.io/v0.1/servers";
const META = "io.modelcontextprotocol.registry/official";
const MIN_STARS = 25, ENRICH_PER_RUN = 400;

const repoKey = (url) => { const m = String(url ?? "").match(/github\.com\/([^/]+)\/([^/.#?]+)/); return m ? `${m[1]}/${m[2]}`.toLowerCase() : null; };

export function normalise(servers, { dockerRepos, stars }) {
  const entries = [], slice = {};
  for (const item of servers) {
    const s = item.server ?? item;
    const meta = item._meta?.[META] ?? {};
    if (meta.status && meta.status !== "active") continue;
    if (meta.isLatest === false) continue;
    const key = repoKey(s.repository?.url);
    const title = s.title || s.name.split("/").pop();
    const caps = [];
    for (const p of s.packages ?? []) {
      const what = { npm: `npm package ${p.identifier}`, pypi: `Python package ${p.identifier}`, oci: `Docker image ${p.identifier}`, nuget: `.NET package ${p.identifier}`, mcpb: `bundle ${p.identifier}` }[p.registryType] ?? `${p.registryType} package ${p.identifier}`;
      caps.push({ kind: "adds", label: `Runs as ${what}` });
      for (const v of p.environmentVariables ?? []) caps.push(v.isSecret ? { kind: "secret", label: `Needs a ${title} key`, detail: v.name } : { kind: "adds", label: `Configured with ${v.name}` });
    }
    for (const r of s.remotes ?? []) {
      const h = String(r.url ?? "").match(/^https?:\/\/([^/:]+)/); if (h) caps.push({ kind: "network", label: "Connects to the internet", detail: h[1] });
      for (const hd of r.headers ?? []) if (hd.isSecret) caps.push({ kind: "secret", label: `Needs a ${title} key`, detail: hd.name });
    }
    if (!caps.some((c) => c.kind === "network") && (s.packages ?? []).length) caps.push({ kind: "network", label: "Connects to the internet" });
    const id = `mcp-${slug(s.name)}`;
    const st = key ? stars.get(key) : undefined;
    entries.push(makeEntry({
      source: "mcp-registry", id, itemType: "tool", displayName: title, description: s.description ?? "", author: s.name.split("/")[0],
      repoUrl: key ? `https://github.com/${key}` : s.websiteUrl, version: s.version, publishedAt: meta.publishedAt, updatedAt: meta.updatedAt,
      sourceType: "mcp-registry", sourceRef: `mcp:${s.name}`, sourceSubdir: s.repository?.subfolder,
      origin: s.repository?.source === "github" ? "verified" : "community", mirroredFrom: "Official MCP Registry",
      upstreamId: s.name, stars: st, capabilities: caps, scan: { status: "unchecked" },
    }));
    if (!((st ?? 0) >= MIN_STARS || (key && dockerRepos.has(key)))) slice[id] = 0;
  }
  return { entries, slice };
}

export async function collect({ lastRun, full, log }) {
  const since = !full && lastRun?.finished_at ? new Date(lastRun.finished_at * 1000).toISOString() : null;
  const servers = [];
  let cursor;
  do {
    const u = new URL(BASE); u.searchParams.set("version", "latest"); u.searchParams.set("limit", "100");
    if (since) u.searchParams.set("updated_since", since); if (cursor) u.searchParams.set("cursor", cursor);
    const page = await getJson(u.toString());
    servers.push(...(page.servers ?? []));
    cursor = page.metadata?.nextCursor || undefined;
  } while (cursor);
  log(`${servers.length} servers (${since ? "since " + since : "full"})`);

  // Docker overlap: a repo Docker ships is served regardless of stars.
  const docker = await getJson("https://desktop.docker.com/mcp/catalog/v3/catalog.json").catch(() => ({ registry: {} }));
  const dockerRepos = new Set(Object.values(docker.registry ?? {}).map((d) => repoKey(d.upstream)).filter(Boolean));

  // Enrich up to ENRICH_PER_RUN repos with stars (5,000 req/hr budget shared with everything else).
  const stars = new Map();
  let enriched = 0;
  for (const item of servers) {
    const key = repoKey((item.server ?? item).repository?.url);
    if (!key || stars.has(key) || enriched >= ENRICH_PER_RUN) continue;
    try { const r = await github(`/repos/${key}`); if (r) stars.set(key, r.stargazers_count ?? 0); enriched++; }
    catch (e) { if (e instanceof RateLimited) { log(`enrichment stopped: ${e.message}`); break; } }
  }
  log(`enriched ${enriched} repos; ${dockerRepos.size} docker repos`);
  const { entries, slice } = normalise(servers, { dockerRepos, stars });
  return { entries, slice, noRetire: !!since };
}
```

Add to `build.mjs` the `noRetire` branch described in Interfaces. Stars for rows enriched in an earlier run but not re-listed by a delta run are preserved because delta runs only touch changed servers (the Worker keeps the old JSON).

- [ ] **Step 4: Run** `node --test scripts/catalog/test/` → PASS. `GITHUB_TOKEN=$(gh auth token) node scripts/catalog/build.mjs --source mcp-registry --dry-run --full` → ~25k rows in ~5 min (253 pages + 400 GitHub calls); check `catalog-dry-run-mcp-registry.json` size (expect 15–30 MB) — that is the stored set; the served slice is what matters for the app.

- [ ] **Step 5: Commit** `git add scripts/catalog && git commit -m "feat(catalog): official MCP Registry source with quality slice + star enrichment"`.

---

### Task 11: The workflow, docs, first real run

**Files:**
- Create: `.github/workflows/catalog-ingest.yml`
- Create: `docs/catalog.md` (repo-local)
- Modify: `README.md` (root; fix the stale counts while there: 174 → the real number from `index.json`, "26/148" → "13 YouCoded / 287 Anthropic"), `CONTRIBUTING.md` (remove "edit index.json"; plugins live at the top level, not `plugins/`)

- [ ] **Step 1: Workflow**

```yaml
name: Catalog ingest

on:
  schedule:
    - cron: "13 * * * *"        # hourly: our index + deltas from the MCP Registry
    - cron: "41 3 * * 1"        # weekly full MCP Registry pass (retires vanished servers)
  workflow_dispatch:
    inputs:
      source: { description: "one source (blank = all)", required: false, default: "" }
      full: { description: "full MCP Registry pass", type: boolean, default: false }
  push:
    branches: [master]
    paths: ["index.json", "scripts/catalog/**", ".github/workflows/catalog-ingest.yml"]

concurrency: { group: catalog-ingest, cancel-in-progress: false }

jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 50
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: "20" }
      - run: node --test scripts/catalog/test/
      - name: Ingest
        env:
          CATALOG_INGEST_TOKEN: ${{ secrets.MARKETPLACE_CATALOG_INGEST_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          FULL=""; if [ "${{ github.event.schedule }}" = "41 3 * * 1" ] || [ "${{ inputs.full }}" = "true" ]; then FULL="--full"; fi
          SRC=""; if [ -n "${{ inputs.source }}" ]; then SRC="--source ${{ inputs.source }}"; fi
          node scripts/catalog/build.mjs $SRC $FULL
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: catalog-report, path: catalog-report.json, retention-days: 14 }
```

- [ ] **Step 2: Docs** — `docs/catalog.md`: what the catalog is, the five sources with their licences and the mirror/link decision (MCP Registry CC0; Docker repo MIT but served JSON unlicensed — we store metadata only; awesome-copilot MIT; cursorrules CC0; Anthropic official Apache-2.0 for the 53 local, the rest are pointers), the quality slice rule, what "Likely safe" means in v1 (rule-based; SkillSpector is the next step), how to run locally (`--dry-run`), the retire semantics, and the two env vars. README/CONTRIBUTING corrections as listed.

- [ ] **Step 3: Commit, push, PR** — `git add .github/workflows/catalog-ingest.yml docs/catalog.md README.md CONTRIBUTING.md && git commit -m "feat(catalog): hourly ingest workflow + docs"`; push; `gh pr create` titled `feat(catalog): ingest pipeline — five sources → Worker catalog` with the standard footer. Before merging: the Worker PR from Task 4 is merged and deployed, and Destin has added `MARKETPLACE_CATALOG_INGEST_TOKEN` (tell him in the PR: `openssl rand -hex 32`, paste into repo Settings → Secrets; the Worker deploy pushes the same value to the Worker).

- [ ] **Step 4: First real run** — `gh workflow run catalog-ingest.yml --repo itsdestin/wecoded-marketplace -f full=true`, then `gh run watch`. Expected: report artifact with `upserted` per source and no `error`. Then:

```bash
curl -s https://wecoded-marketplace-api.destinj101.workers.dev/catalog | python3 -c "
import json,sys,collections; d=json.load(sys.stdin); e=d['entries']
print(len(e), collections.Counter(x['sourceMarketplace'] for x in e))
print(collections.Counter(x['catalog']['itemType'] for x in e))
print(collections.Counter(x['catalog']['scan']['status'] for x in e))"
```
Expected: a few thousand rows; every row has `catalog`; scan statuses are a mix of `checked`, `caution` and `unchecked` (never all `checked`). Paste the numbers into the PR.

- [ ] **Step 5: ROADMAP** (workspace) — under the overhaul entry note "catalog service live <date>"; add follow-ups: SkillSpector / Cisco skill-scanner as a second scan stage; member descriptions from SKILL.md frontmatter; Docker `toolsUrl` fetch for tool descriptions; Layer E (sub-registry API) now has its data.
