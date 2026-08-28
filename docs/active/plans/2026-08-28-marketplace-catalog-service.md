---
status: active
created: 2026-08-28
spec: docs/active/specs/2026-08-28-marketplace-overhaul-ui-design.md
part: 2 of 3 (catalog service) — 2026-08-28-marketplace-feedback-worker.md is independent; 2026-08-28-marketplace-app-wiring.md consumes this plan's `/catalog`
---

# Marketplace Catalog Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A catalog the app can read that carries, for every listing, the block the approved UI renders — kind, who published it, whether this version was checked, what it can do, licence, pinned commit — built hourly from four sources and served by the WeCoded Worker.

**Architecture:** Two halves. **Serve:** the Worker stores one row per listing in D1 (`catalog_items`, full entry as JSON + a few indexed columns) and answers `GET /catalog` (everything the app shows, with an `ETag`) and `GET /catalog/:id`; an ingest token guards `POST /admin/catalog/*`. **Ingest:** a dependency-free Node 20 script tree in `wecoded-marketplace/scripts/catalog/` runs in GitHub Actions every hour, pulls each source (our own `index.json`, Docker's MCP catalog, `github/awesome-copilot`, `PatrickJS/awesome-cursorrules`), normalises to `SkillEntry + catalog`, computes capabilities and a rule-based scan from the files **at the repo's current HEAD**, and upserts in batches. A per-source "finish" call retires rows the run did not see — but refuses to retire more than a fifth of a source at once, because a scraper that collected 12 of 257 rows is broken, not authoritative.

Two rules make the whole thing safe to run unattended, and they are the difference between a
background job and a liability:

1. **Never downgrade (Task 3).** An upsert that arrives without a field the stored row already
   has — `stars`, `license`, `sourceCommit` — keeps the stored value; an incoming
   `scan.status: "unchecked"` never overwrites a stored `checked`/`caution`. A rate-limited,
   half-finished or otherwise degraded run therefore *fails to improve* the catalog instead of
   visibly damaging it. Without this, one bad hour flips "Likely safe" to "Not checked" across
   the grid and back again.
2. **Only re-read what changed (Task 8).** The ingest asks the Worker for the commit it has on
   file for each id, and re-downloads a plugin's files only when HEAD differs. That is ~95% of
   the run's GitHub traffic removed, and it is nearly free to implement *because* of rule 1 —
   an unchanged entry is upserted without `capabilities`/`scan`, and the merge keeps what is
   already stored.

**Deliberately not here:** the official MCP Registry (25,291 servers). See **Deferred** at the
end of this plan for the measured reasons and where it goes instead.

**Tech Stack:** Hono + D1 + vitest-pool-workers (Worker); Node 20 `fetch` + `node:test` (ingest, zero npm deps, like `scripts/sync.js`); GitHub Actions cron.

## Global Constraints

- Contract with Plan 3 (must not drift): `GET /catalog` → `200 { generated_at: number, entries: SkillEntry[] }`; each entry has the `index.json` fields plus `catalog: CatalogMeta`; deprecated rows omitted; `Cache-Control: public, max-age=300`; **`ETag: "<generated_at>"`, and `304 Not Modified` with an empty body when the client sends a matching `If-None-Match`**; any origin. The 304 is not a nicety: the response is a few megabytes, both platforms refresh hourly, phones do it on mobile data, and Cloudflare's edge cache does not apply to `*.workers.dev` — so without it every device pays full price 24 times a day and every request re-reads every row out of D1.
- **Size discipline.** ~2,600 rows come from our own registry alone (302 live bundles + 2,084 skills + 103 specialists + 125 connections, measured against `index.json`), and today's rows average 1.1 KB. Expect roughly 5,000 rows / 4–6 MB. Any change that materially grows that needs a paging story first; D1's free tier allows 5 M row-reads/day, i.e. about 1,000 uncached catalog fetches.
- `CatalogMeta` is `desktop/src/shared/catalog-types.ts` on the app branch. This plan adds two optional fields there (Task 5): `upstreamId?: string`, `stars?: number`. Nothing else in the shape changes.
- Ids must satisfy the installer's `^[a-zA-Z0-9_-]+$` (`plugin-installer.ts:41`) **except** member rows, which use `<bundle>/<name>` and are never installed directly (Plan 3 routes them to the bundle). Mirrored ids are prefixed by source: `mcp-…`, `docker-…`, `copilot-…`, `cursorrules-…`.
- Worker conventions: errors are plain-text lowercase messages (`src/lib/errors.ts`); `parseJsonBody` for JSON; public GETs go in `isPublicReadPath`; migrations `NNNN_snake_case.sql`, this plan is **0006**, unconditionally — Plan 1's `0005_feedback.sql` merged 2026-08-28 (wecoded-marketplace#71), so 0006 is now simply the next number. Do **not** swap them: D1 records applied migrations by filename and applies in order, so a 0005 added after 0006 has run is applied out of order. `[env.test]` mirrors any new var; tests `DELETE FROM` their tables in `beforeEach`.
- **Ids may contain a slash.** Bundle members are `<bundle>/<name>`; `validateId` is length-only, but Hono's `:param` never crosses a slash, so every id-taking route needs a two-segment form (Task 4). Same trap Plan 1 hits with `/comments`.
- Ingest never writes to the repo; it POSTs. The token is `CATALOG_INGEST_TOKEN` (Worker secret, CI secret `MARKETPLACE_CATALOG_INGEST_TOKEN`), compared with `crypto.subtle.timingSafeEqual`-equivalent constant-time logic.
- **There must be a kill switch.** `CATALOG_ENABLED` (a `wrangler.toml` `[vars]` value, Task 2) — set it to `"0"`, commit, and `GET /catalog` answers 503, which both clients already handle by falling back to `index.json`. Without it, one bad ingest run reaches every device within the hour and the only remedy is writing and deploying code under pressure.
- **GitHub budget is the binding constraint.** `secrets.GITHUB_TOKEN` inside Actions is limited to **1,000 API requests per hour per repository** (not 5,000 — that is a personal access token), and `http.mjs` stops at 200 remaining, so a run has ~800 calls. The "only re-read what changed" rule keeps a steady-state hourly run at roughly **~160** calls (one `/repos/{o}/{r}` per distinct repo, cached per run; 153 distinct repos across the 237 live `url`/`git-subdir` entries) plus a handful for the other sources. If a run ever hits `RateLimited`, that is the signal the skip logic has stopped working — do not "fix" it by raising the threshold. If the budget genuinely needs to grow later, a fine-grained PAT in a repo secret gets 5,000/hr; do not reach for that first.
- Raw file downloads (`raw.githubusercontent.com`) do not count against the API limit but have their own throttle, and they are the run's wall clock: at up to 20 files per plugin, re-reading everything is ~6,000 sequential fetches. Steady state must be dozens, not thousands.
- Capabilities and scan findings are **computed from files**, never taken from an author's description. Wording is plain: "Runs commands on your computer", "Connects to the internet · api.notion.com", "Needs a Notion key · NOTION_TOKEN", "Runs automatically after every file edit", "Adds 3 skills and 1 command".
- Scan status: `caution` when any finding; `checked` when the files were fetched and scanned with no finding; `unchecked` when files could not be fetched (rate limit, no repo). Never `checked` without having read the files.
- Worker work on `wecoded-marketplace` branch `feat/catalog-service` from `master`; `cd worker && npm test && npm run typecheck` before each commit; the ingest scripts run `node --test scripts/catalog/test`.

---

## File structure

**Worker (`wecoded-marketplace/worker`)**
- `migrations/0006_catalog.sql` — `catalog_items`, `catalog_runs`, `catalog_meta`.
- `src/catalog/auth.ts` — `requireIngestToken`.
- `src/catalog/routes.ts` — `catalogRoutes`: `GET /catalog`, `GET /catalog/:id` (+ two-segment member form), `POST /admin/catalog/upsert`, `POST /admin/catalog/finish`, `GET /admin/catalog/shas`, `GET /admin/catalog/health`.
- `src/types.ts` — `CATALOG_INGEST_TOKEN`, `CATALOG_ENABLED`; `wrangler.toml` `[vars]` + `[env.test.vars]`; `test/env.d.ts`; `.github/workflows/worker-deploy.yml` secret push.
- `test/catalog.test.ts`, `test/catalog-auth.test.ts`, `test/schema.test.ts`, `test/cors.test.ts`.

**Ingest (`wecoded-marketplace/scripts/catalog/`)**
- `lib/http.mjs` — `getJson`, `getText`, `github` (auth + rate-limit aware), `postJson`.
- `lib/entry.mjs` — `slug`, `makeEntry`, `licenseToSpdx`, `CATALOG_SOURCES`.
- `lib/capabilities.mjs` — `scanFiles(files) → { capabilities, findings }`, `addsLine(components)`.
- `lib/worker.mjs` — `shas`, `upsert` (batched), `finish`.
- `sources/wecoded.mjs`, `sources/docker.mjs`, `sources/awesome-copilot.mjs`, `sources/cursorrules.mjs` — each exports `async function collect(ctx) → { entries, … }`.
- `build.mjs` — orchestrator (`--source <name>`, `--dry-run`, `--force-rescan`).
- `test/*.test.mjs` + `test/fixtures/*.json` (the samples captured on 2026-08-28).
- `.github/workflows/catalog-ingest.yml`.
- `docs/catalog.md` (repo-local reference), workspace `docs/registries.md` (Plan 3 edits it).

---

### Task 1: Migration — `catalog_items`, `catalog_runs`, `catalog_meta`

**Files:**
- Create: `worker/migrations/0006_catalog.sql`
- Test: `worker/test/schema.test.ts`

- [ ] **Step 1: Failing schema test** — add to the existing `it`:

```ts
    expect(names).toContain("catalog_items");
    expect(names).toContain("catalog_runs");
    expect(names).toContain("catalog_meta");
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
  source TEXT NOT NULL,                -- wecoded | anthropic | docker | awesome-copilot | cursorrules
  item_type TEXT NOT NULL,             -- plugin | skill | specialist | tool | prompt
  part_of_id TEXT,                     -- bundle id for member rows
  deprecated INTEGER NOT NULL DEFAULT 0,
  source_commit TEXT,                  -- the commit whose FILES were scanned; drives the
                                       -- "only re-read what changed" skip in the ingest
  scan_rules TEXT,                     -- version of the rule set behind the stored verdict.
                                       -- The skip key is (commit, scan_rules), so bumping
                                       -- SCAN_RULES_VERSION re-scans the whole catalog by
                                       -- itself instead of waiting for a manual --force-rescan
                                       -- that nobody remembers to run.
  run_id TEXT NOT NULL,                -- the ingest run that last touched the row
  updated_at INTEGER NOT NULL,
  entry_json TEXT NOT NULL
);
-- (deprecated, id), not (deprecated) alone: GET /catalog walks the served rows in id order
-- by keyset (`WHERE deprecated = 0 AND id > ?`), and D1 bills rows SCANNED, not returned.
CREATE INDEX idx_catalog_served ON catalog_items(deprecated, id);
CREATE INDEX idx_catalog_source_run ON catalog_items(source, run_id);
CREATE INDEX idx_catalog_part_of ON catalog_items(part_of_id);

-- One row per (source, run). finished_at NULL = still running / crashed. Kept purely
-- for "did the ingest run, and what did it do" — nothing reads it to make a decision.
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

-- Exactly one row (id = 'v'). Every write to catalog_items bumps `version`, and that
-- number IS the ETag of GET /catalog.
--
-- This table is the difference between the catalog working and the catalog running out
-- of database quota in its first week. Without it, answering "nothing has changed" means
-- reading every catalog row to compute the ETag first — so the cheap reply costs exactly
-- as much as sending the whole 5,000-row payload. D1's free tier allows 5 M row-reads a
-- day; at one full read per client refresh that is a few hundred refreshes a day for the
-- entire user base. With it, an unchanged reply reads ONE row.
CREATE TABLE catalog_meta (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO catalog_meta (id, version, updated_at) VALUES ('v', 1, 0);
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `git add migrations/0006_catalog.sql test/schema.test.ts && git commit -m "feat(worker): catalog_items + catalog_runs + catalog_meta tables"`.

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
`worker/src/types.ts` — also add the kill switch:
```ts
  // Kill switch for GET /catalog. "0" → 503, which both clients already handle by
  // falling back to index.json. A bad ingest run reaches every device within the
  // hour; this is the way to stop it with a commit instead of a code change.
  CATALOG_ENABLED?: string;
```
`worker/wrangler.toml` — add `CATALOG_ENABLED = "1"` to the top-level `[vars]` block (next to `CUTOVER_TIMESTAMP`) **and** `CATALOG_INGEST_TOKEN = "test-ingest-token"` + `CATALOG_ENABLED = "1"` to `[env.test.vars]`. `worker/test/env.d.ts` — add `CATALOG_INGEST_TOKEN?: string;` and `CATALOG_ENABLED?: string;`.

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

### Task 3: Admin ingest routes — upsert (merging), finish (guarded), shas, health

**Files:**
- Modify: `worker/src/catalog/routes.ts`
- Test: `worker/test/catalog.test.ts`

**Interfaces:**
- `POST /admin/catalog/upsert` body `{ source, run_id, entries: Array<SkillEntry & { catalog: CatalogMeta }> }` (≤ 500 entries) → `{ ok: true, upserted: number }`. Creates the `catalog_runs` row on first sight of `(run_id, source)`. Each entry's `id`, `catalog.itemType`, `catalog.partOf?.id`, `catalog.sourceCommit`, `deprecated` are read into columns. **Merges, never clobbers** — see below.
- `POST /admin/catalog/finish` body `{ source, run_id, note?, allow_mass_retire? }` → `{ ok: true, retired: number, refused?: { wouldRetire: number, live: number } }`: rows of that source with `run_id != this run` become `deprecated = 1`; run row gets `finished_at`. **Refuses a mass retirement** — see below.
- `GET /admin/catalog/shas?source=…` → `{ shas: Record<id, string> }` — the ingest's skip key per id, `"<sourceCommit>:<scanRulesVersion>"`. Not a bare commit: the scan rules are half of "is what we have still current".
- `GET /admin/catalog/health` (`requireAuth` + `requireAdminAccount` — the same admin gate `DELETE /admin/ratings/:user_id/:plugin_id` already uses, `src/reports/routes.ts:38`) → `{ version, sources: Array<{ source, live, lastFinishedAt, lastRetired, lastNote }> }`. Read-only. **This is how a human answers "is the catalog still being fed?"** — a stalled ingest produces no error anywhere, just an unchanging catalog, and GitHub silently disables a repository's `schedule:` triggers after 60 days of inactivity. A source whose `lastFinishedAt` is hours old is the tell.

**The retire guard (the other important part).** A `finish` that would delist more than
`MAX_RETIRE_FRACTION` (20%) of a source's live rows refuses, retires nothing, records the
refusal in `catalog_runs.note`, and returns `refused`. The ingest turns that into a failed
workflow run.

Why: the four upstream sources are projects we do not control. The day `awesome-cursorrules`
renames `rules/` we collect 12 prompts instead of 257, and today's `finish` would delist the
other 245 — visibly, in everyone's app, until someone noticed. A partial scrape is not
evidence that 245 listings were deleted. `skipFinish` (Task 6) already covers the source that
collects *nothing*; this covers the one that collects *some*. Sources below
`RETIRE_GUARD_FLOOR` (10 live rows) are exempt — a ratio means nothing at that size — and
`allow_mass_retire: true` is the deliberate override for a real bulk removal.

**The merge rule (the important part of this task).** The incoming entry is merged onto the
stored one before it is written:

| Situation | Result |
|---|---|
| incoming `catalog.stars` / `license` / `sourceCommit` is absent, stored has one | keep the stored value |
| incoming `catalog.scan.status === "unchecked"`, stored is `checked` or `caution` | keep the stored `scan` **including its `checkedAt`**, so the badge shows its real age |
| incoming `catalog.capabilities` is absent or empty, stored has some | keep the stored list |
| anything the incoming entry *does* state | wins |

Why: a run that could not read a repo's files is not evidence that the repo became unsafe, and
a run that ran out of GitHub budget is not evidence that a licence disappeared. Without this
rule the badges and licences flap hour to hour and listings drop out of the grid for no reason
a user could ever explain. With it, a degraded run simply changes nothing.

- [ ] **Step 1: Failing tests** — `worker/test/catalog.test.ts`:

```ts
import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { createTestAccount, issueTestSession } from "./helpers";

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
    const row = await env.DB.prepare("SELECT item_type, part_of_id, run_id FROM catalog_items WHERE id = ?").bind("bundle/skill-a").first();
    expect(row).toEqual({ item_type: "skill", part_of_id: "bundle", run_id: "r1" });
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
    const run = await env.DB.prepare("SELECT upserted, retired, finished_at FROM catalog_runs WHERE id = 'r2' AND source = 'docker'")
      .first<{ upserted: number; retired: number; finished_at: number }>();
    expect(run).toMatchObject({ upserted: 1, retired: 1 });
    expect(run!.finished_at).toBeGreaterThan(0);
  });

  it("finish REFUSES to retire most of a source in one run", async () => {
    // A scraper whose upstream moved a folder: 20 rows last hour, 2 this hour.
    const many = Array.from({ length: 20 }, (_, i) => entry(`c${String(i).padStart(2, "0")}`));
    await post("/admin/catalog/upsert", { source: "cursorrules", run_id: "r1", entries: many });
    await post("/admin/catalog/finish", { source: "cursorrules", run_id: "r1" });
    await post("/admin/catalog/upsert", { source: "cursorrules", run_id: "r2", entries: many.slice(0, 2) });
    const res = await post("/admin/catalog/finish", { source: "cursorrules", run_id: "r2" });
    expect(await res.json()).toEqual({ ok: true, retired: 0, refused: { wouldRetire: 18, live: 20 } });
    // Nothing was delisted, and the refusal is on the run record.
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM catalog_items WHERE deprecated = 1").first<{ n: number }>())!.n).toBe(0);
    expect((await env.DB.prepare("SELECT note FROM catalog_runs WHERE id = 'r2' AND source = 'cursorrules'").first<{ note: string }>())!.note)
      .toMatch(/refused/);
    // …and the override goes through.
    const forced = await post("/admin/catalog/finish", { source: "cursorrules", run_id: "r2", allow_mass_retire: true });
    expect((await forced.json<{ retired: number }>()).retired).toBe(18);
  });

  it("health reports live counts and when each source last finished", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("h1"), entry("h2")] });
    await post("/admin/catalog/finish", { source: "docker", run_id: "r1" });
    // Admin identity, not the ingest token — this one is for a person, not the robot.
    // Same helper pair the reports tests use (test/helpers.ts); githubId 424242 is the
    // id configured in [env.test.vars] ADMIN_USER_IDS.
    const token = await issueTestSession(await createTestAccount({ githubId: "424242", login: "admin" }));
    const res = await SELF.fetch("https://test.local/admin/catalog/health", { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json<{ sources: Array<{ source: string; live: number; lastFinishedAt: number }> }>();
    expect(body.sources).toEqual([expect.objectContaining({ source: "docker", live: 2 })]);
    expect(body.sources[0]!.lastFinishedAt).toBeGreaterThan(0);
    // …and the ingest token alone does not open it — a robot credential is not a person.
    expect((await SELF.fetch("https://test.local/admin/catalog/health", { headers: { "X-Catalog-Token": "test-ingest-token" } })).status).toBe(401);
  });

  it("a small source is exempt from the retire guard", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("s1"), entry("s2"), entry("s3")] });
    await post("/admin/catalog/finish", { source: "docker", run_id: "r1" });
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r2", entries: [entry("s1")] });
    expect((await (await post("/admin/catalog/finish", { source: "docker", run_id: "r2" })).json<{ retired: number }>()).retired).toBe(2);
  });

  it("every write bumps the catalog version, and shas carry the scan rule set", async () => {
    const v = async () => (await env.DB.prepare("SELECT version FROM catalog_meta WHERE id = 'v'").first<{ version: number }>())!.version;
    const before = await v();
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [
      entry("vv", { catalog: { itemType: "tool", origin: { tier: "community" }, capabilities: [],
        sourceCommit: "abc1234", scan: { status: "checked", checkedAt: "2026-08-28T00:00:00Z", rules: "3" } } }),
    ] });
    expect(await v()).toBeGreaterThan(before);
    const after = await v();
    await post("/admin/catalog/finish", { source: "docker", run_id: "r1" });
    expect(await v()).toBeGreaterThan(after);
    const res = await SELF.fetch("https://test.local/admin/catalog/shas?source=docker", { headers: { "X-Catalog-Token": "test-ingest-token" } });
    expect((await res.json<{ shas: Record<string, string> }>()).shas).toEqual({ vv: "abc1234:3" });
  });

  it("rejects batches over 500 or without a source", async () => {
    const big = Array.from({ length: 501 }, (_, i) => entry(`e${i}`));
    expect((await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: big })).status).toBe(400);
    expect((await post("/admin/catalog/upsert", { run_id: "r1", entries: [entry("q")] })).status).toBe(400);
  });

  it("NEVER downgrades: a degraded run keeps the stored scan, licence, stars and commit", async () => {
    const good = entry("keeper", { catalog: { itemType: "plugin", origin: { tier: "youcoded" },
      scan: { status: "checked", checkedAt: "2026-08-28T00:00:00Z" },
      capabilities: [{ kind: "shell", label: "Runs commands on your computer" }],
      license: "MIT", sourceCommit: "abc1234", stars: 91 } });
    await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r1", entries: [good] });

    // r2 is what a rate-limited run emits: it could not read the files or the repo.
    const degraded = entry("keeper", { catalog: { itemType: "plugin", origin: { tier: "youcoded" },
      scan: { status: "unchecked" }, capabilities: [] } });
    await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r2", entries: [degraded] });

    const row = await env.DB.prepare("SELECT entry_json, source_commit, run_id FROM catalog_items WHERE id = 'keeper'")
      .first<{ entry_json: string; source_commit: string; run_id: string }>();
    const cat = JSON.parse(row!.entry_json).catalog;
    expect(cat.scan).toEqual({ status: "checked", checkedAt: "2026-08-28T00:00:00Z" });
    expect(cat.license).toBe("MIT");
    expect(cat.stars).toBe(91);
    expect(cat.sourceCommit).toBe("abc1234");
    expect(cat.capabilities).toHaveLength(1);
    expect(row!.source_commit).toBe("abc1234");
    // …but the row was still touched, so `finish` will not retire it.
    expect(row!.run_id).toBe("r2");
  });

  it("an UPGRADE still wins — a real scan replaces an unchecked one", async () => {
    await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r1", entries: [entry("up")] });
    const better = entry("up", { catalog: { itemType: "plugin", origin: { tier: "youcoded" },
      scan: { status: "caution", checkedAt: "2026-08-28T01:00:00Z", findings: ["Downloads and runs code from the internet (install.sh)"] },
      capabilities: [], license: "MIT", sourceCommit: "def5678" } });
    await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r2", entries: [better] });
    const cat = JSON.parse((await env.DB.prepare("SELECT entry_json FROM catalog_items WHERE id = 'up'").first<{ entry_json: string }>())!.entry_json).catalog;
    expect(cat.scan.status).toBe("caution");
    expect(cat.scan.findings).toHaveLength(1);
  });

  it("reports the commits it has on file so the ingest can skip unchanged entries", async () => {
    await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r1", entries: [
      entry("a", { catalog: { itemType: "plugin", origin: { tier: "youcoded" }, scan: { status: "checked" }, capabilities: [], sourceCommit: "aaa1111" } }),
      entry("b"),
    ] });
    const { shas } = await (await SELF.fetch("https://test.local/admin/catalog/shas?source=wecoded", { headers: TOKEN })).json<{ shas: Record<string, string> }>();
    expect(shas).toEqual({ a: "aaa1111" });
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

const SOURCES = new Set(["wecoded", "anthropic", "docker", "awesome-copilot", "cursorrules"]);
const MAX_BATCH = 500;
/** A `finish` may never delist more than this share of a source's live rows in one run —
 *  a partial scrape is a broken scrape, not a bulk deletion. Sources with fewer than
 *  RETIRE_GUARD_FLOOR live rows are exempt (a ratio is meaningless at that size). */
export const MAX_RETIRE_FRACTION = 0.2;
export const RETIRE_GUARD_FLOOR = 10;

interface IngestCatalog {
  itemType?: string;
  partOf?: { id?: string };
  scan?: { status?: string; checkedAt?: string; findings?: string[] };
  capabilities?: unknown[];
  license?: string;
  sourceCommit?: string;
  stars?: number;
  [k: string]: unknown;
}
interface IngestEntry {
  id?: string;
  deprecated?: boolean;
  catalog?: IngestCatalog;
  [k: string]: unknown;
}

// THE MERGE RULE. An ingest run that could not read a repo's files is not evidence
// that the repo became unsafe, and a run that ran out of GitHub budget is not
// evidence that a licence vanished — so a field the incoming row does not state
// keeps whatever is already on file, and an "unchecked" scan never overwrites a
// real one. Consequence: a degraded run changes nothing instead of flipping badges
// and dropping listings out of the grid for reasons no user could explain.
const SCAN_RANK: Record<string, number> = { unchecked: 0, checked: 1, caution: 1 };
function mergeOntoStored(incoming: IngestEntry, storedJson: string | null): IngestEntry {
  if (!storedJson) return incoming;
  let stored: IngestEntry;
  try { stored = JSON.parse(storedJson) as IngestEntry; } catch { return incoming; }
  const a = incoming.catalog ?? {};
  const b = stored.catalog ?? {};
  const merged: IngestCatalog = { ...b, ...a };
  for (const k of ["license", "sourceCommit", "stars", "upstreamId"] as const) {
    if (a[k] === undefined && b[k] !== undefined) merged[k] = b[k];
  }
  if ((SCAN_RANK[a.scan?.status ?? "unchecked"] ?? 0) < (SCAN_RANK[b.scan?.status ?? "unchecked"] ?? 0)) {
    merged.scan = b.scan;                                    // keep the real verdict AND its age
    if (!a.capabilities?.length && b.capabilities?.length) merged.capabilities = b.capabilities;
  }
  return { ...stored, ...incoming, catalog: merged };
}

async function ensureRun(db: D1Database, runId: string, source: string, now: number): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO catalog_runs (id, source, started_at) VALUES (?, ?, ?)")
    .bind(runId, source, now).run();
}

catalogRoutes.post("/admin/catalog/upsert", requireIngestToken, async (c) => {
  const body = await parseJsonBody<{ source?: string; run_id?: string; entries?: IngestEntry[] }>(c);
  if (!body.source || !SOURCES.has(body.source)) throw badRequest("unknown source");
  if (!body.run_id || body.run_id.length > 64) throw badRequest("invalid run_id");
  if (!Array.isArray(body.entries) || body.entries.length === 0) throw badRequest("entries must be a non-empty array");
  if (body.entries.length > MAX_BATCH) throw badRequest(`at most ${MAX_BATCH} entries per request`);
  const now = Math.floor(Date.now() / 1000);
  await ensureRun(c.env.DB, body.run_id, body.source, now);

  // Read the stored JSON for this batch's ids in ONE query, so the merge costs a
  // single extra round trip per 500 rows rather than one per row.
  const ids = body.entries.map((e) => e.id).filter((x): x is string => typeof x === "string" && x.length > 0);
  const placeholders = ids.map(() => "?").join(",");
  const { results: existing } = ids.length
    ? await c.env.DB.prepare(`SELECT id, entry_json FROM catalog_items WHERE id IN (${placeholders})`)
        .bind(...ids).all<{ id: string; entry_json: string }>()
    : { results: [] as Array<{ id: string; entry_json: string }> };
  const stored = new Map(existing.map((r) => [r.id, r.entry_json]));

  const stmt = c.env.DB.prepare(
    `INSERT INTO catalog_items (id, source, item_type, part_of_id, deprecated, source_commit, scan_rules, run_id, updated_at, entry_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET source = excluded.source, item_type = excluded.item_type,
       part_of_id = excluded.part_of_id, deprecated = excluded.deprecated,
       source_commit = excluded.source_commit, scan_rules = excluded.scan_rules,
       run_id = excluded.run_id, updated_at = excluded.updated_at, entry_json = excluded.entry_json`
  );
  const batch = body.entries.map((raw) => {
    if (typeof raw.id !== "string" || !raw.id || raw.id.length > 200) throw badRequest("entry without a valid id");
    if (!raw.catalog || typeof raw.catalog.itemType !== "string") throw badRequest(`entry ${raw.id} has no catalog.itemType`);
    const e = mergeOntoStored(raw, stored.get(raw.id) ?? null);
    // scan_rules comes off the MERGED entry, so a run that kept a stored verdict also
    // keeps the rule version that produced it.
    return stmt.bind(e.id, body.source, e.catalog!.itemType, e.catalog!.partOf?.id ?? null, e.deprecated ? 1 : 0,
      e.catalog!.sourceCommit ?? null, (e.catalog!.scan as { rules?: string } | undefined)?.rules ?? null,
      body.run_id, now, JSON.stringify(e));
  });
  await c.env.DB.batch(batch);
  await c.env.DB.prepare("UPDATE catalog_runs SET upserted = upserted + ? WHERE id = ? AND source = ?")
    .bind(batch.length, body.run_id, body.source).run();
  await bumpCatalogVersion(c.env.DB, now);
  return c.json({ ok: true, upserted: batch.length });
});

/** The ETag of GET /catalog is this number. Bumped by every write, so a client can never
 *  be told "nothing changed" about a catalog that changed mid-run — at worst it refetches
 *  once more than it needed to. */
async function bumpCatalogVersion(db: D1Database, now: number): Promise<void> {
  await db.prepare("UPDATE catalog_meta SET version = version + 1, updated_at = ? WHERE id = 'v'").bind(now).run();
}

catalogRoutes.post("/admin/catalog/finish", requireIngestToken, async (c) => {
  const body = await parseJsonBody<{ source?: string; run_id?: string; note?: string; allow_mass_retire?: boolean }>(c);
  if (!body.source || !SOURCES.has(body.source)) throw badRequest("unknown source");
  if (!body.run_id) throw badRequest("invalid run_id");
  const now = Math.floor(Date.now() / 1000);
  await ensureRun(c.env.DB, body.run_id, body.source, now);

  // The retire guard. Count first, delist second: a scrape that collected a fraction of a
  // source is a broken scrape, not 245 deletions. See the Interfaces note above.
  const counts = await c.env.DB
    .prepare(`SELECT COUNT(*) AS live, SUM(CASE WHEN run_id != ? THEN 1 ELSE 0 END) AS stale
              FROM catalog_items WHERE source = ? AND deprecated = 0`)
    .bind(body.run_id, body.source).first<{ live: number; stale: number }>();
  const live = counts?.live ?? 0;
  const wouldRetire = counts?.stale ?? 0;
  if (!body.allow_mass_retire && live >= RETIRE_GUARD_FLOOR && wouldRetire > live * MAX_RETIRE_FRACTION) {
    const note = `refused: would retire ${wouldRetire} of ${live} live rows`;
    await c.env.DB.prepare("UPDATE catalog_runs SET finished_at = ?, retired = 0, note = ? WHERE id = ? AND source = ?")
      .bind(now, note, body.run_id, body.source).run();
    return c.json({ ok: true, retired: 0, refused: { wouldRetire, live } });
  }

  // Retire what this run did not see. Rows keep their JSON so a listing that
  // vanished upstream can be revived by a later run (deprecated flips back to 0
  // on the next upsert).
  const r = await c.env.DB
    .prepare("UPDATE catalog_items SET deprecated = 1, updated_at = ? WHERE source = ? AND run_id != ? AND deprecated = 0")
    .bind(now, body.source, body.run_id).run();
  const retired = r.meta.changes ?? 0;
  await c.env.DB.prepare("UPDATE catalog_runs SET finished_at = ?, retired = ?, note = ? WHERE id = ? AND source = ?")
    .bind(now, retired, body.note ?? null, body.run_id, body.source).run();
  if (retired) await bumpCatalogVersion(c.env.DB, now);
  return c.json({ ok: true, retired });
});

// What the catalog already has on file, so the ingest can skip re-downloading a
// plugin's files when nothing about the verdict would change. This one route is what
// turns a ~6,000-request hourly job into a ~160-request one.
//
// The value is `<commit>:<scanRulesVersion>`, not a bare commit. A repo that has not
// moved but was scanned by an OLDER rule set is NOT up to date, and the ingest must
// re-read it. That is what makes "improve the scanner" a one-line version bump instead
// of a manual full rescan someone has to remember.
//
// Keyset, not OFFSET — the same reason as GET /catalog: OFFSET re-scans everything it
// skips, so paging 5,000 rows in blocks of 1,000 bills ~15,000 row-reads, not 5,000.
catalogRoutes.get("/admin/catalog/shas", requireIngestToken, async (c) => {
  const source = c.req.query("source") ?? "";
  if (!SOURCES.has(source)) throw badRequest("unknown source");
  const shas: Record<string, string> = {};
  let after = "";
  for (;;) {
    const { results } = await c.env.DB
      .prepare("SELECT id, source_commit, scan_rules FROM catalog_items WHERE source = ? AND source_commit IS NOT NULL AND id > ? ORDER BY id LIMIT 1000")
      .bind(source, after)
      .all<{ id: string; source_commit: string; scan_rules: string | null }>();
    for (const r of results) shas[r.id] = `${r.source_commit}:${r.scan_rules ?? ""}`;
    if (results.length < 1000) break;
    after = results[results.length - 1].id;
  }
  return c.json({ shas });
});

// "Is the catalog still being fed?" — the one question no error message ever answers,
// because a stalled ingest fails silently: the rows just stop changing. Admin-gated
// (same identity check as /admin/analytics/*), read-only, cheap.
catalogRoutes.get("/admin/catalog/health", requireAuth, async (c) => {
  await requireAdminAccount(c);
  const meta = await c.env.DB.prepare("SELECT version, updated_at FROM catalog_meta WHERE id = 'v'")
    .first<{ version: number; updated_at: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT i.source AS source,
            COUNT(*) AS live,
            (SELECT MAX(finished_at) FROM catalog_runs r WHERE r.source = i.source) AS lastFinishedAt,
            (SELECT r.retired FROM catalog_runs r WHERE r.source = i.source ORDER BY r.finished_at DESC LIMIT 1) AS lastRetired,
            (SELECT r.note FROM catalog_runs r WHERE r.source = i.source ORDER BY r.finished_at DESC LIMIT 1) AS lastNote
     FROM catalog_items i WHERE i.deprecated = 0 GROUP BY i.source ORDER BY i.source`
  ).all();
  return c.json({ version: meta?.version ?? 0, updatedAt: meta?.updated_at ?? 0, sources: results });
});
```
(also import `requireAuth` from `../auth/middleware` and `requireAdminAccount` from
`../auth/admin` — the same two the reports routes import — and add `/admin/catalog/health`
to the route list in `worker/README.md`.)

- [ ] **Step 4: Run** `npx vitest run test/catalog.test.ts test/catalog-auth.test.ts && npm run typecheck` → PASS. **Step 5: Commit** `git add src/catalog/routes.ts test/catalog.test.ts && git commit -m "feat(worker): catalog ingest — merging upsert, finish, shas"`.

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

  it("returns live rows only, with a 5-minute cache header and an ETag", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("shown"), entry("gone")] });
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r2", entries: [entry("shown")] });
    await post("/admin/catalog/finish", { source: "docker", run_id: "r2" });
    const res = await SELF.fetch("https://test.local/catalog");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(res.headers.get("etag")).toBeTruthy();
    const body = await res.json<{ generated_at: number; entries: Array<{ id: string; catalog: unknown }> }>();
    expect(body.entries.map((e) => e.id)).toEqual(["shown"]);
    expect(body.entries[0].catalog).toBeTruthy();
    expect(typeof body.generated_at).toBe("number");
  });

  it("answers 304 with an empty body when the client already has this version", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("a")] });
    const first = await SELF.fetch("https://test.local/catalog");
    const etag = first.headers.get("etag")!;
    const again = await SELF.fetch("https://test.local/catalog", { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    // A new upsert moves the ETag, so the client fetches for real again.
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r2", entries: [entry("b")] });
    const third = await SELF.fetch("https://test.local/catalog", { headers: { "If-None-Match": etag } });
    expect(third.status).toBe(200);
  });

  it("the kill switch turns the catalog off without a code change", async () => {
    // env is snapshotted at worker start, so drive the branch directly.
    expect(catalogDisabled({ CATALOG_ENABLED: "0" })).toBe(true);
    expect(catalogDisabled({ CATALOG_ENABLED: "1" })).toBe(false);
    expect(catalogDisabled({})).toBe(false);
  });

  it("a bundle MEMBER id (with a slash) resolves", async () => {
    await post("/admin/catalog/upsert", { source: "wecoded", run_id: "r1", entries: [
      entry("superpowers/brainstorming", { catalog: { itemType: "skill", partOf: { id: "superpowers", displayName: "Superpowers" }, origin: { tier: "verified" }, scan: { status: "unchecked" }, capabilities: [] } }),
    ] });
    const res = await SELF.fetch("https://test.local/catalog/superpowers/brainstorming");
    expect(res.status).toBe(200);
    expect((await res.json<{ entry: { id: string } }>()).entry.id).toBe("superpowers/brainstorming");
  });

  it("answers 304 from the version row, without reading the catalog", async () => {
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r1", entries: [entry("a1")] });
    const first = await SELF.fetch("https://test.local/catalog");
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^"cat-\d+"$/);
    const again = await SELF.fetch("https://test.local/catalog", { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    // A write moves the version, so the same conditional request now gets the payload.
    await post("/admin/catalog/upsert", { source: "docker", run_id: "r2", entries: [entry("a2")] });
    const third = await SELF.fetch("https://test.local/catalog", { headers: { "If-None-Match": etag } });
    expect(third.status).toBe(200);
    expect(third.headers.get("etag")).not.toBe(etag);
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

Import `catalogDisabled` at the top of `test/catalog.test.ts`:
```ts
import { catalogDisabled } from "../src/catalog/routes";
```

Append to `test/cors.test.ts` (same shape as the ratings origin test):
```ts
  it("GET /catalog and GET /catalog/:id accept any origin", async () => {
    for (const p of ["/catalog", "/catalog/some-id", "/catalog/some-bundle/some-member"]) {
      const res = await SELF.fetch(`https://test.local${p}`, { headers: { Origin: "https://nowhere.example" } });
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    }
  });
```

- [ ] **Step 2: Run** → FAIL (404 / wrong header).

- [ ] **Step 3: Implement** — append to `routes.ts`:

```ts
/** Kill switch — see wrangler.toml [vars] CATALOG_ENABLED. Exported so a test can
 *  drive the branch: cloudflare:test snapshots env at worker start. */
export function catalogDisabled(env: { CATALOG_ENABLED?: string }): boolean {
  return env.CATALOG_ENABLED === "0";
}

// GET /catalog — everything the app shows.
//
// Two things in here are load-bearing, and both are about cost, not speed:
//
// 1. THE ETAG COMES FROM ONE ROW, AND THE 304 IS ANSWERED BEFORE ANY CATALOG ROW IS
//    READ. The obvious version — read the rows, derive an ETag from them, then maybe
//    reply 304 — makes the "nothing changed" answer cost exactly as much database work
//    as sending the whole several-MB payload, which defeats the entire point. D1's free
//    tier allows 5 M row-reads/day; a full catalog read is ~5,000 of them. That is a few
//    hundred client refreshes a day for the whole user base if every refresh pays full
//    price, and both clients refresh hourly. With the version row, an unchanged refresh
//    costs ONE row-read and the budget stops being the binding constraint.
// 2. KEYSET PAGING (`id > last`), NEVER OFFSET. D1 bills rows SCANNED, and OFFSET
//    re-scans everything it skips: 5,000 rows in pages of 500 costs ~27,500 row-reads
//    with OFFSET and 5,000 with a keyset. Same answer, five times the bill.
//
// The stored JSON is also CONCATENATED, not parsed and re-serialised: at a few thousand
// rows the naive JSON.parse-then-c.json costs megabytes of pointless work per request.
//
// (All of this exists because *.workers.dev is not served from Cloudflare's edge cache.
// On a custom domain the cache would absorb these repeats before they ever reach us —
// see the ROADMAP entry. Until then the Worker is the cache.)
catalogRoutes.get("/catalog", async (c) => {
  if (catalogDisabled(c.env)) {
    return c.text("catalog temporarily unavailable", 503);
  }
  const meta = await c.env.DB.prepare("SELECT version, updated_at FROM catalog_meta WHERE id = 'v'")
    .first<{ version: number; updated_at: number }>();
  const etag = `"cat-${meta?.version ?? 0}"`;
  c.header("Cache-Control", "public, max-age=300");
  c.header("ETag", etag);
  if (c.req.header("If-None-Match") === etag) return c.body(null, 304);

  const parts: string[] = [];
  let after = "";
  for (;;) {
    const { results } = await c.env.DB
      .prepare("SELECT id, entry_json FROM catalog_items WHERE deprecated = 0 AND id > ? ORDER BY id LIMIT 500")
      .bind(after)
      .all<{ id: string; entry_json: string }>();
    for (const r of results) parts.push(r.entry_json);
    if (results.length < 500) break;
    after = results[results.length - 1]!.id;
  }
  c.header("Content-Type", "application/json");
  return c.body(`{"generated_at":${meta?.updated_at ?? 0},"entries":[${parts.join(",")}]}`);
});

async function oneEntry(c: Context<HonoEnv>, id: string) {
  if (catalogDisabled(c.env)) return c.text("catalog temporarily unavailable", 503);
  const row = await c.env.DB.prepare("SELECT entry_json FROM catalog_items WHERE id = ? AND deprecated = 0")
    .bind(validateId(id, "catalog id")).first<{ entry_json: string }>();
  if (!row) throw notFound("not found");
  c.header("Cache-Control", "public, max-age=300");
  c.header("Content-Type", "application/json");
  return c.body(`{"entry":${row.entry_json}}`);
}

// Two-segment form FIRST — a bundle member's id is `<bundle>/<name>` and Hono's
// `:id` never matches across a slash.
catalogRoutes.get("/catalog/:bundle/:name", (c) => oneEntry(c, `${c.req.param("bundle")}/${c.req.param("name")}`));
catalogRoutes.get("/catalog/:id", (c) => oneEntry(c, c.req.param("id")));
```
(add `import type { Context } from "hono";` and `import { validateId } from "../lib/validate";` to the file's imports.)

`src/index.ts` `isPublicReadPath` — add:
```ts
  if (path === "/catalog") return true;
  if (path.startsWith("/catalog/")) {
    const parts = path.slice("/catalog/".length).split("/");
    return parts.length <= 2 && parts.every((p) => p.length > 0);
  }
```
The `ETag` / `If-None-Match` pair also has to survive CORS: add `"If-None-Match"` to
`allowHeaders` and `"ETag"` to `exposeHeaders` on the public-read CORS config, or Android's
WebView will never see the header and will re-download the whole catalog every hour.

- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS. **Step 5: Commit** `git add src/catalog/routes.ts src/index.ts test/catalog.test.ts test/cors.test.ts && git commit -m "feat(worker): GET /catalog + GET /catalog/:id (public, ETag/304, kill switch)"`.

Then push and open the PR (`feat(worker): catalog service — storage, ingest routes, public reads`) with the secret instruction from Task 2; **merge it before Task 10's first real run.** Body ends with the standard Claude Code footer.

---

### Task 4b: Votes, comments and installs must name a listing that exists

**Files:**
- Modify: `worker/src/lib/validate.ts` (add `requireCatalogId`), `worker/src/feedback/routes.ts`, `worker/src/installs/routes.ts`, `worker/src/ratings/routes.ts`
- Test: `worker/test/feedback.test.ts`, `worker/test/installs.test.ts`

**Why this belongs to this plan and not Plan 1.** `validateId` only checks the length (1–128
chars), so today anyone signed in can record an install, a vote or a comment against an id
that does not exist — unbounded junk rows in D1, and a spam vector with **no ceiling at all** — Plan 1's Task 0
measured `checkRateLimit` in production on 2026-08-28 and it blocked 0 of 160 requests
against a 60/minute cap, so this is the standing state until the Worker moves to a custom
domain, not a hypothetical. The Worker has never had a way to know
which ids are real. **`catalog_items` is that list**, so the check becomes possible for the
first time exactly here.

**Interfaces:**
- Produces: `requireCatalogId(db, id, label?) → Promise<string>` — validates the shape, then `SELECT 1 FROM catalog_items WHERE id = ?`; throws `badRequest("unknown plugin_id")` on a miss. Applied to `POST /thumbs`, `POST /comments`, `POST /installs`, `POST /ratings`, and the `GET` reads that take an id.
- **Two escape hatches, both deliberate:** theme ids (`theme:<slug>`) are not in `catalog_items` — they live in the themes registry, so `theme:`-prefixed ids skip the lookup. And if `catalog_items` is **empty** (a fresh database, or the ingest has never run) the check passes everything: an unpopulated catalog must not lock users out of installing.

- [ ] **Step 1: Failing test** — append to `worker/test/feedback.test.ts`:

```ts
describe("ids must name a real listing", () => {
  beforeEach(async () => {
    for (const t of [...TABLES, "catalog_items"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  });

  it("400s a vote or comment for an id that is not in the catalog", async () => {
    const { token, account } = await seed();
    // A populated catalog is what turns the check on.
    await env.DB.prepare("INSERT INTO catalog_items (id, source, item_type, deprecated, run_id, updated_at, entry_json) VALUES ('real', 'wecoded', 'plugin', 0, 'r1', 1, '{}')").run();
    await seedInstall(account.userId, "made-up");
    expect((await post("/thumbs", token, { plugin_id: "made-up", value: "up" })).status).toBe(400);
    expect((await post("/comments", token, { plugin_id: "made-up", text: "hi" })).status).toBe(400);
    await seedInstall(account.userId, "real");
    expect((await post("/thumbs", token, { plugin_id: "real", value: "up" })).status).toBe(200);
  });

  it("lets everything through while the catalog is empty, and always allows theme ids", async () => {
    const { token, account } = await seed();
    await seedInstall(account.userId, "anything");
    expect((await post("/thumbs", token, { plugin_id: "anything", value: "up" })).status).toBe(200);
    await env.DB.prepare("INSERT INTO catalog_items (id, source, item_type, deprecated, run_id, updated_at, entry_json) VALUES ('real', 'wecoded', 'plugin', 0, 'r1', 1, '{}')").run();
    expect((await post("/installs", token, { plugin_id: "theme:golden-sunbreak" })).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run** → FAIL (400 expected, 200 received).

- [ ] **Step 3: Implement** — append to `worker/src/lib/validate.ts`:

```ts
// An id that names something we actually list. `validateId` only bounds the
// length, which let a signed-in account write installs/votes/comments against
// invented ids — junk rows with no ceiling. catalog_items is the list of real
// ones, so this is only possible once the catalog exists (Plan 2, Task 1).
//
// Two deliberate escapes: theme ids live in the themes registry, not the
// catalog; and an EMPTY catalog (fresh DB, ingest never ran) passes everything,
// because an unpopulated catalog must never lock a user out of installing.
export async function requireCatalogId(db: D1Database, raw: string | undefined | null, label = "plugin_id"): Promise<string> {
  const id = validateId(raw, label);
  if (id.startsWith("theme:")) return id;
  const hit = await db.prepare("SELECT 1 AS ok FROM catalog_items WHERE id = ? LIMIT 1").bind(id).first<{ ok: number }>();
  if (hit) return id;
  const any = await db.prepare("SELECT 1 AS ok FROM catalog_items LIMIT 1").first<{ ok: number }>();
  if (!any) return id;                       // catalog not populated yet — allow
  throw badRequest(`unknown ${label}`);
}
```

Swap `validateId(body.plugin_id)` for `await requireCatalogId(c.env.DB, body.plugin_id)` in
`POST /thumbs`, `POST /comments`, `POST /installs` and `POST /ratings`. Leave the public
**read** routes (`GET /comments/<id>`, `GET /catalog/<id>`) on plain `validateId` — a read of
an unknown id already answers empty or 404 and costs one indexed lookup either way.

While in `installs/routes.ts`: it parses with `c.req.json<…>()` directly. Every other route
uses `parseJsonBody` (`src/lib/parse-json.ts`), which returns a clean 400 on malformed input
instead of an unhandled throw. Switch it.

- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS. **Step 5: Commit** `git add src/lib/validate.ts src/feedback/routes.ts src/installs/routes.ts src/ratings/routes.ts test/ && git commit -m "feat(worker): installs, votes and comments must name a listing that exists"`.

> **Sequencing:** this task edits files Plan 1 created. Plan 1's Worker half merged
> 2026-08-28 (wecoded-marketplace#71/#72/#73), so those files are on master and this runs in
> its normal place — rebase onto master first, since `feedback/routes.ts` moved after #73.

---

### Task 5: Shared type additions (app branch)

**Files:**
- Modify: `/home/destin/youcoded-dev/worktrees/marketplace-ui/desktop/src/shared/catalog-types.ts`

- [ ] **Step 1: Add the two optional fields** to `CatalogMeta` after `sourceCommit`, and one to `scan`:

```ts
  /** The listing's id in its upstream registry (reverse-DNS MCP name, Docker
   *  slug, …) — shown in the detail footer, used by the ingest to dedupe. */
  upstreamId?: string;
  /** GitHub stars at ingest time, where the source reports them (Docker's
   *  `metadata.githubStars`, our own repo lookups). Display and future ranking
   *  only — nothing hides a listing based on it. */
  stars?: number;
```

and widen `scan` (line 69) by one optional field:

```ts
  /** `rules` is the version of the scan rule set that produced this verdict
   *  (`SCAN_RULES_VERSION`, Task 7). Never rendered — the ingest reads it back through
   *  `/admin/catalog/shas` so that improving the scanner re-scans the catalog on the
   *  next hourly run instead of waiting for someone to remember `--force-rescan`. */
  scan: { status: ScanStatus; checkedAt?: string; findings?: string[]; rules?: string };
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
- `worker.mjs`: `createWorkerClient({ host, token }) → { shas(source), upsert(source, runId, entries), finish(source, runId, note?) }`; `upsert` splits into batches of 500 and returns the total.
- `build.mjs`: `node scripts/catalog/build.mjs --source docker [--dry-run] [--force-rescan] [--allow-mass-retire]`; without `--source` runs all; `--dry-run` writes `catalog-dry-run-<source>.json` and never POSTs; `--force-rescan` ignores the stored keys and re-reads every file (an emergency lever — a routine rule change should bump `SCAN_RULES_VERSION`, which does the same thing automatically); `--allow-mass-retire` overrides the Worker's retire guard for a genuine bulk removal. **The script exits non-zero when any source errors, gets refused, or produces zero rows** — a broken scraper must never leave a green run behind it.

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
    source: "docker",
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
// authenticated (60/hr unauthenticated is not survivable) and rate-limit aware:
// below 200 remaining we stop rather than get banned. The budget is 1,000/hr per
// repository for Actions' GITHUB_TOKEN, so hitting this is a signal that the
// "only re-read what changed" skip has stopped working — not a reason to raise it.
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
export const CATALOG_SOURCES = ["wecoded", "anthropic", "docker", "awesome-copilot", "cursorrules"];

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

const SOURCE_MARKETPLACE = { wecoded: "youcoded", anthropic: "anthropic", docker: "docker", "awesome-copilot": "awesome-copilot", cursorrules: "cursorrules" };

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
(`source` is the ingest source and every `makeEntry` caller passes it as `o.source` — the test above does too.)

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
    // Commits the catalog already has on file, keyed by id — the input to the
    // "only re-read what changed" skip in every source.
    shas: (source) => call("GET", `/admin/catalog/shas?source=${encodeURIComponent(source)}`).then((r) => r.shas ?? {}),
    async upsert(source, runId, entries) {
      let total = 0;
      for (let i = 0; i < entries.length; i += 500) {
        const r = await call("POST", "/admin/catalog/upsert", { source, run_id: runId, entries: entries.slice(i, i + 500) });
        total += r.upserted;
      }
      return total;
    },
    finish: (source, runId, note, allowMassRetire) =>
      call("POST", "/admin/catalog/finish", { source, run_id: runId, ...(note ? { note } : {}), ...(allowMassRetire ? { allow_mass_retire: true } : {}) }),
  };
}
```

`scripts/catalog/build.mjs`:
```js
#!/usr/bin/env node
// Catalog ingest — pulls every source, normalises, upserts to the Worker.
//   node scripts/catalog/build.mjs [--source <name>] [--dry-run] [--force-rescan] [--allow-mass-retire]
// Env: CATALOG_INGEST_TOKEN (required unless --dry-run), GITHUB_TOKEN (required),
//      CATALOG_HOST (default https://wecoded-marketplace-api.destinj101.workers.dev)
import fs from "node:fs";
import { createWorkerClient } from "./lib/worker.mjs";
import { CATALOG_SOURCES } from "./lib/entry.mjs";

const args = new Set(process.argv.slice(2));
const pick = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const only = pick("--source");
const dryRun = args.has("--dry-run");
const forceRescan = args.has("--force-rescan");
// Deliberate override for a real bulk removal upstream. Without it the Worker refuses to
// delist more than a fifth of a source in one run — see Task 3, "the retire guard".
const allowMassRetire = args.has("--allow-mass-retire");
const host = process.env.CATALOG_HOST ?? "https://wecoded-marketplace-api.destinj101.workers.dev";

const SOURCES = {
  wecoded: () => import("./sources/wecoded.mjs"),
  docker: () => import("./sources/docker.mjs"),
  "awesome-copilot": () => import("./sources/awesome-copilot.mjs"),
  cursorrules: () => import("./sources/cursorrules.mjs"),
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
    // What the catalog already knows, so the source can skip re-reading files
    // whose commit has not moved. A source that emits under several Worker
    // sources (wecoded → "wecoded" + "anthropic") gets both maps merged.
    let known = {};
    if (client && !forceRescan) {
      for (const src of name === "wecoded" ? ["wecoded", "anthropic"] : [name]) {
        Object.assign(known, await client.shas(src));
      }
    }
    // skipFinish: the source is byte-identical to last run and emitted nothing.
    // It must NOT reach `finish`, which would retire every one of its rows.
    const { entries, sources: subSources, skipFinish } = await collect({ known, log: (m) => console.log(`[${name}] ${m}`) });
    const groups = subSources ?? { [name]: entries };
    for (const [src, rows] of Object.entries(groups)) {
      if (dryRun) { fs.writeFileSync(`catalog-dry-run-${src}.json`, JSON.stringify(rows, null, 2)); console.log(`[${src}] dry-run: ${rows.length} rows`); continue; }
      if (!rows.length && skipFinish) { console.log(`[${src}] unchanged — nothing to do`); continue; }
      const upserted = await client.upsert(src, runId, rows);
      const { retired, refused } = await client.finish(src, runId, undefined, allowMassRetire);
      report.sources[src] = { upserted, retired, ...(refused ? { refused } : {}), ms: Date.now() - started };
      console.log(`[${src}] upserted ${upserted}, retired ${retired}`);
      // A refusal means this source collected a fraction of what the catalog holds — a
      // broken scraper, an upstream rename, a rate limit. Nothing was delisted (that is
      // the guard working), but the run is NOT healthy and must not look green.
      if (refused) {
        console.error(`[${src}] REFUSED: collected only ${collected(refused)} — retiring ${refused.wouldRetire} of ${refused.live} was blocked. ` +
          `Fix the source, or re-run with force_rescan / allow_mass_retire if the removal is real.`);
        process.exitCode = 1;
      }
    }
  } catch (err) {
    report.sources[name] = { error: String(err && err.message || err) };
    console.error(`[${name}] FAILED: ${err && err.stack || err}`);
    process.exitCode = 1;
  }
}
// Declared as a function, not a const: it is called from the loop above, which runs before
// this line is reached.
function collected(r) { return `${r.live - r.wouldRetire} of ${r.live} rows`; }

// A source that ran, threw nothing, and produced nothing is the silent failure this whole
// job is exposed to: the catalog would simply freeze at yesterday's data while the workflow
// stayed green. `skipFinish` (genuinely unchanged) reports no counts at all, so it does not
// trip this.
for (const [src, r] of Object.entries(report.sources)) {
  if (!r.error && !r.refused && r.upserted === 0) {
    console.error(`[${src}] produced 0 rows — the source is broken or its upstream moved.`);
    process.exitCode = 1;
  }
}
fs.writeFileSync("catalog-report.json", JSON.stringify(report, null, 2));
if (process.exitCode) console.error(`\ncatalog ingest finished WITH ERRORS — see catalog-report.json`);
```

- [ ] **Step 4: Run** `node --test scripts/catalog/test/` → PASS (4). **Step 5: Commit** `git add scripts/catalog && git commit -m "feat(catalog): ingest scaffold — http, entry, worker client, build"`.

---

### Task 7: Capabilities + rule-based scan

**Files:**
- Create: `scripts/catalog/lib/capabilities.mjs`
- Test: `scripts/catalog/test/capabilities.test.mjs`

**Interfaces:**
- `SCAN_RULES_VERSION: string` and `skipKey(sha) → string` — **bump the version in the same
  commit as any change to the rules below.** The ingest skips re-reading a repo whose commit
  has not moved; without the rule version in that key, making the scanner smarter would
  re-check nothing, and every existing verdict would keep its old answer forever until a
  human remembered to run `--force-rescan`. With it, the bump *is* the rescan: the next
  hourly run finds every stored key stale and re-reads the corpus once.
- `scanFiles(files: Array<{ path: string; text: string }>, { title }) → { capabilities: Capability[], findings: string[], hosts: string[] }` — pure.
- `addsLine(components) → Capability | null` — e.g. `Adds 3 skills, 1 command and 2 specialists`.
- `mcpCapabilities(mcpJsonText, { title }) → Capability[]` — from `.mcp.json` servers: `command` → shell, `env` keys → secret, `url` → network.
- `hooksCapability(hooksJsonText) → Capability | null` — `Runs automatically <when>` from event names (`PreToolUse` → "before every tool call", `PostToolUse` → "after every tool call", `SessionStart` → "when a conversation starts", `Stop` → "every time the assistant stops", `UserPromptSubmit` → "every time you send a message").

- [ ] **Step 1: Failing tests** — `scripts/catalog/test/capabilities.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanFiles, addsLine, mcpCapabilities, hooksCapability, skipKey, SCAN_RULES_VERSION } from "../lib/capabilities.mjs";

test("the skip key carries the rule version, so a bump invalidates every stored verdict", () => {
  assert.equal(skipKey("abc1234"), `abc1234:${SCAN_RULES_VERSION}`);
});

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
//
// Bump SCAN_RULES_VERSION on ANY change to the rules in this file — it is half the
// ingest's skip key (`<commit>:<version>`), so bumping it re-scans the whole catalog on
// the next hourly run. Leaving it alone after tightening a rule means the tightening
// never actually runs against anything already listed.
export const SCAN_RULES_VERSION = "1";
export const skipKey = (sha) => `${sha}:${SCAN_RULES_VERSION}`;

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
- **Version resolution — read this before writing the code.** `sourceCommit` must be the repo's **current HEAD**, resolved this run, and *never* the `sourceSha` already sitting in `index.json`. 236 of the 302 live entries carry a `sourceSha` that `sync.js` stamped whenever it last ran; re-using it would pin the catalog — and therefore every install (Plan 3 Task 2) — to a months-old commit that never moves again, so the Update button would re-fetch the same frozen version forever and report success. HEAD comes from the same cached `/repos/{o}/{r}` call that supplies stars and licence (`default_branch` → `/commits/{branch}`, or just `/commits/HEAD`), one per distinct repo per run. `sourceSha` is only a last-resort display value if the lookup fails.
- **Only re-read what changed.** `collect` receives `known` — `{ id: "<sourceCommit>:<scanRulesVersion>" }` from the Worker. When `skipKey(resolvedHead)` equals `known[id]`, the entry is emitted **without** `capabilities` and with `scan` omitted, and no files are downloaded; the Worker's merge rule (Task 3) keeps the stored verdict and its `checkedAt`. This is the difference between ~6,000 raw fetches an hour and a few dozen. The rule version is in the key on purpose: a scanner improvement must invalidate every stored verdict, so `--force-rescan` is for emergencies, not for routine rule changes.
- File fetch for scanning (only for entries whose HEAD moved): `local` → read from the repo checkout (`<sourceRef>/`), `url`/`git-subdir` → GitHub Tree at the resolved sha then raw fetch of: `.mcp.json`, `hooks/hooks.json`, `.claude-plugin/plugin.json`, and up to 20 files under `scripts/`, `hooks/`, `bin/` with `SCRIPT_EXT`, each ≤ 64 KB. `scan.status`: `caution`/`checked` when fetched; `unchecked` when the fetch failed (log why) — and the merge rule makes that harmless for an entry that was previously checked.
- Licence: `local` → the repo's LICENSE (MIT — hard-code `MIT` for `sourceMarketplace === 'youcoded'`); GitHub → `/repos/{o}/{r}` `license.spdx_id` (guard null / `NOASSERTION`), cached per repo within the run. Stars from the same call.

- [ ] **Step 1: Failing test** — `scripts/catalog/test/wecoded.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalise } from "../sources/wecoded.mjs";
import sample from "./fixtures/index-sample.json" with { type: "json" };

test("normalise emits a bundle row + member rows with partOf", () => {
  const fake = { files: async () => ({ ok: true, files: [{ path: "SKILL.md", text: "hi" }] }), repo: async () => ({ stars: 12, license: "MIT", head: "abc1234" }) };
  const rows = normalise(sample, fake.files, fake.repo);
  return rows.then((out) => {
    const bundles = out.filter((r) => r.catalog.itemType === "plugin");
    assert.equal(bundles.length, 3);
    const yc = bundles.find((b) => b.sourceMarketplace === "youcoded");
    assert.equal(yc.catalog.origin.tier, "youcoded");
    const an = bundles.find((b) => b.sourceMarketplace === "anthropic");
    assert.equal(an.catalog.origin.tier, "verified");
    assert.equal(an.catalog.origin.mirroredFrom, "anthropics/claude-plugins-official");
    assert.equal(an.catalog.sourceCommit, "abc1234");   // today's HEAD, not the frozen sourceSha
    const members = out.filter((r) => r.catalog.partOf);
    assert.ok(members.length >= 3);
    const skill = members.find((m) => m.catalog.itemType === "skill");
    assert.match(skill.id, /^[^/]+\/[^/]+$/);
    // A member's description must NOT repeat its bundle's name — that is what
    // makes a search for the bundle also return every one of its members.
    assert.equal(skill.description, "");
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

test("pins to today's HEAD, never to the stale sourceSha in index.json", async () => {
  const repo = async () => ({ stars: 1, license: "MIT", head: "newhead1" });
  const rows = await normalise(sample, async () => ({ ok: true, files: [] }), repo);
  const external = rows.filter((r) => !r.catalog.partOf && r.sourceMarketplace === "anthropic");
  assert.ok(external.length > 0);
  for (const b of external) {
    assert.equal(b.catalog.sourceCommit, "newhead1");
    assert.notEqual(b.catalog.sourceCommit, b.sourceSha);   // the frozen value must NOT win
  }
});

test("an unchanged entry downloads nothing and states no scan (the merge rule keeps it)", async () => {
  let fetches = 0;
  const repo = async () => ({ stars: 1, license: "MIT", head: "samehead" });
  const known = Object.fromEntries(sample.filter((e) => !e.deprecated).map((e) => [e.id, "samehead"]));
  const rows = await normalise(sample, async () => { fetches++; return { ok: true, files: [] }; }, repo, known);
  assert.equal(fetches, 0);
  const bundles = rows.filter((r) => !r.catalog.partOf);
  assert.ok(bundles.every((b) => b.catalog.scan === undefined));
  assert.ok(bundles.every((b) => (b.catalog.capabilities ?? []).length === 0));
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
import { scanFiles, addsLine, mcpCapabilities, hooksCapability, skipKey, SCAN_RULES_VERSION } from "../lib/capabilities.mjs";

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
export async function fetchFiles(entry, sha) {
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
  if (!gh || !sha) return { ok: false, files: [] };
  try {
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
      // One call per distinct repo per run — 153 across the 237 live url/git-subdir
      // entries. `head` is the CURRENT tip: the catalog pins to what the author
      // publishes today, never to the stale sourceSha in index.json (see Interfaces).
      cache.set(key, github(`/repos/${key}`)
        .then(async (r) => r ? {
          stars: r.stargazers_count,
          license: r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : undefined,
          pushedAt: r.pushed_at,
          head: (await github(`/repos/${key}/commits/${r.default_branch}`))?.sha,
        } : null)
        .catch(() => null));
    }
    return cache.get(key);
  };
}

export async function normalise(index, files = fetchFiles, repo = repoFacts(), known = {}) {
  const out = [];
  let skipped = 0;
  for (const e of index) {
    if (e.deprecated || e.type === "prompt") continue;
    const isOurs = e.sourceMarketplace === "youcoded";
    const facts = isOurs ? { license: "MIT" } : (await repo(e.repoUrl ?? e.sourceRef)) ?? {};
    // The version we are listing: today's HEAD. NEVER e.sourceSha — see Interfaces.
    const sourceCommit = facts.head ?? (isOurs ? undefined : e.sourceSha);
    // Unchanged since the catalog last looked → emit the row with no scan and no
    // capabilities and download nothing; the Worker's merge rule keeps what it has.
    // skipKey, not the bare commit: an unmoved repo scanned by an older rule set is not
    // up to date. See Interfaces, "Only re-read what changed".
    const unchanged = !!sourceCommit && known[e.id] === skipKey(sourceCommit);
    if (unchanged) skipped++;
    const fetched = unchanged ? { ok: false, files: [], skipped: true } : await files(e, sourceCommit);
    const scanned = fetched.ok ? scanFiles(fetched.files, { title: e.displayName }) : null;
    const caps = [];
    if (scanned) {
      caps.push(...scanned.capabilities);
      const mcp = fetched.files.find((f) => f.path === ".mcp.json"); if (mcp) caps.push(...mcpCapabilities(mcp.text, { title: e.displayName }));
      const hooks = fetched.files.find((f) => f.path === "hooks/hooks.json"); const h = hooks && hooksCapability(hooks.text); if (h) caps.push(h);
    }
    const adds = addsLine(e.components); if (adds) caps.push(adds);
    const scan = scanned
      ? (scanned.findings.length
          ? { status: "caution", checkedAt: new Date().toISOString(), findings: scanned.findings, rules: SCAN_RULES_VERSION }
          : { status: "checked", checkedAt: new Date().toISOString(), rules: SCAN_RULES_VERSION })
      : { status: "unchecked" };
    const base = {
      source: isOurs ? "wecoded" : "anthropic",
      origin: isOurs ? "youcoded" : "verified",
      mirroredFrom: isOurs ? undefined : OFFICIAL,
      license: facts.license, stars: facts.stars, sourceCommit,
      author: e.author, repoUrl: e.repoUrl, tags: e.tags, category: e.category, lifeArea: e.lifeArea, audience: e.audience,
      version: e.version, publishedAt: e.publishedAt,
    };
    out.push(makeEntry({ ...base, id: e.id, itemType: "plugin", displayName: e.displayName, description: e.description, tagline: e.tagline, longDescription: e.longDescription,
      sourceType: e.sourceType, sourceRef: e.sourceRef, sourceSubdir: e.sourceSubdir, sourceSha: e.sourceSha, components: e.components,
      // A skipped entry states nothing about its files; the Worker keeps the stored
      // scan and capabilities rather than downgrading them to "Not checked".
      capabilities: unchanged ? undefined : caps, scan: unchanged ? undefined : scan }));
    const member = (itemType, name, displayName, description) => out.push(makeEntry({ ...base, id: `${e.id}/${name}`, itemType, displayName, description,
      sourceType: e.sourceType, sourceRef: e.sourceRef, sourceSubdir: e.sourceSubdir, pluginName: e.id, partOf: { id: e.id, displayName: e.displayName }, capabilities: [], scan }));
    // Member descriptions are left EMPTY, not filled with "Part of <bundle>."
    // The card already shows a `Part of X` chip, and putting the bundle's name
    // into every member's description makes searching that bundle's name match
    // all of its members: type "superpowers" and you get the bundle plus 14
    // near-identical cards. A blank description is honest and does not pollute
    // the search corpus. Real descriptions come from each SKILL.md's frontmatter
    // in the follow-up below.
    const c = e.components ?? {};
    for (const s of c.skills ?? []) member("skill", s, titleCase(s), "");
    for (const a of c.agents ?? []) member("specialist", a, titleCase(a), "");
    if ((c.mcpServers ?? []).length || c.hasMcpConfig) member("tool", "connection", `${e.displayName} (connection)`, "");
  }
  return out;
}

const titleCase = (s) => s.replace(/[-_]/g, " ").replace(/^./, (ch) => ch.toUpperCase());

export async function collect({ log, known = {} }) {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, "index.json"), "utf8"));
  log(`index.json: ${index.length} rows`);
  const rows = await normalise(index, fetchFiles, repoFacts(), known);
  const sources = { wecoded: rows.filter((r) => r.sourceMarketplace === "youcoded"), anthropic: rows.filter((r) => r.sourceMarketplace === "anthropic") };
  log(`wecoded ${sources.wecoded.length}, anthropic ${sources.anthropic.length}`);
  return { entries: rows, sources };
}
```

Member descriptions are **empty** here, deliberately — see the comment in the code. The
ingest reads each `SKILL.md`'s frontmatter `description` in a follow-up (one raw fetch per
skill — ~2,000 calls, out of the hourly budget; ROADMAP). Until then a member card shows its
name, its kind, and its `Part of X` chip, which is enough to pick it out of a list.

- [ ] **Step 4: Run** `node --test scripts/catalog/test/` → PASS. Then a real dry run: `GITHUB_TOKEN=$(gh auth token) node scripts/catalog/build.mjs --source wecoded --dry-run` → writes `catalog-dry-run-wecoded.json` and `catalog-dry-run-anthropic.json`; open one bundle and eyeball `catalog.capabilities` against its repo, **and check that `catalog.sourceCommit` matches that repo's current branch tip on GitHub, not the entry's `sourceSha`.** Add `catalog-dry-run-*.json` and `catalog-report.json` to `.gitignore`.

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
import { skipKey, SCAN_RULES_VERSION } from "../lib/capabilities.mjs";
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
      capabilities: [], scan: { status: "checked", checkedAt: new Date().toISOString(), rules: SCAN_RULES_VERSION },   // plain text, no code — read in full above
    });
  });
}

export async function collect({ log, known = {} }) {
  const head = await github(`/repos/${REPO}/commits/HEAD`);
  // 257 files that change roughly never. If the repo tip has not moved since the
  // catalog last read it, download nothing — re-emitting them would be ~257
  // pointless raw fetches an hour. One sample id is enough to tell.
  const sampled = Object.keys(known).find((k) => k.startsWith("cursorrules-"));
  if (sampled && known[sampled] === skipKey(head.sha)) {
    log(`unchanged at ${head.sha.slice(0, 7)} — skipping`);
    return { entries: [], skipFinish: true };
  }
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

### Task 10: The workflow, docs, first real run

**Files:**
- Create: `.github/workflows/catalog-ingest.yml`
- Create: `docs/catalog.md` (repo-local)
- Modify: `.github/workflows/validate-plugin-pr.yml` — make the secret **content** scan blocking
- Delete: `themes/index.json`; prune `overrides/`
- Modify: `curated-defaults.json`
- Modify: `README.md` (root; fix the stale counts while there — **compute every number from `index.json` at edit time; do not copy one from a doc.** As of 2026-08-28 it is 339 entries / 302 live / 13 live YouCoded / 289 live Anthropic, and those move on every plugin merge. Also delete the claim that `stats.json` is "rebuilt daily by CI" — no such CI exists), `CONTRIBUTING.md` (remove "edit index.json"; plugins live at the top level, not `plugins/`)

- [ ] **Step 1: Workflow**

```yaml
name: Catalog ingest

on:
  # Hourly is the only trigger. There is deliberately NO `push` trigger on
  # index.json: the job that rebuilds it (validate-plugin-pr.yml → rebuild)
  # commits with `[skip ci]` in the message, and GitHub skips every workflow for
  # such a commit — so a push trigger would look right and never once fire.
  # A merged plugin PR therefore appears within the hour, which is the promise.
  schedule:
    - cron: "13 * * * *"
  workflow_dispatch:
    inputs:
      source: { description: "one source (blank = all)", required: false, default: "" }
      force_rescan: { description: "re-read every file, ignoring stored commits", type: boolean, default: false }
      allow_mass_retire: { description: "let a run delist >20% of a source (a REAL bulk removal upstream)", type: boolean, default: false }

concurrency: { group: catalog-ingest, cancel-in-progress: false }

# WHO NOTICES WHEN THIS BREAKS.
# `build.mjs` exits non-zero when any source errors, is refused by the retire guard, or
# produces zero rows — so a broken scraper turns this run red and GitHub emails the repo
# owner about a failed scheduled workflow. That is the alarm; there is no other one, which
# is why the script must never swallow a bad source into a green run.
# The hole it does not cover: **GitHub disables `schedule:` triggers on a repository with
# 60 days of no activity**, silently. A dead cron produces no failures at all, just a
# catalog frozen at its last good hour. `GET /admin/catalog/health` (Task 3) is how a human
# checks; it is also the thing to wire into the admin dashboard if this repo ever goes
# quiet for a season.

jobs:
  ingest:
    runs-on: ubuntu-latest
    # A steady-state run is minutes: ~160 GitHub API calls and a few dozen raw
    # file downloads, because unchanged entries are skipped. 30 minutes is the
    # ceiling for a --force-rescan; if a NORMAL run approaches it, the skip logic
    # has broken — investigate, do not raise this.
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: "20" }
      - run: node --test scripts/catalog/test/
      - name: Ingest
        env:
          CATALOG_INGEST_TOKEN: ${{ secrets.MARKETPLACE_CATALOG_INGEST_TOKEN }}
          # 1,000 API requests/hour per repository. http.mjs stops at 200 left.
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          RESCAN=""; if [ "${{ inputs.force_rescan }}" = "true" ]; then RESCAN="--force-rescan"; fi
          MASS=""; if [ "${{ inputs.allow_mass_retire }}" = "true" ]; then MASS="--allow-mass-retire"; fi
          SRC=""; if [ -n "${{ inputs.source }}" ]; then SRC="--source ${{ inputs.source }}"; fi
          node scripts/catalog/build.mjs $SRC $RESCAN $MASS
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: catalog-report, path: catalog-report.json, retention-days: 14 }
```

- [ ] **Step 1b: Close the marketplace-repo cruft while we are in here**

Four one-liners that would otherwise each need their own PR, and one that matters:

1. **The secret-content scan must block, not warn.** `.github/workflows/validate-plugin-pr.yml`
   (~line 161) prints `::warning::` and does not set `FOUND_SECRETS=1`, so a live token in a
   file passes CI — while secret-looking *filenames* correctly fail. This plan's scanner
   (Task 7, `HARDCODED_KEY_RE`) already treats the same patterns as a **Caution** finding on
   the listing, so after this ships the identical rule exists in two places at two strengths.
   Make the content scan set `FOUND_SECRETS=1` like the filename checks do, and widen its
   patterns to match `capabilities.mjs` (`sk-`, `ghp_`, `gho_`, `AKIA`, `xox[baprs]-`).
   **Say so in the PR body:** this can fail a submission that passed yesterday, which is the
   intent, but it should not be a surprise.
2. **Delete `themes/index.json`.** It is a 2-of-7 subset of the themes registry, generated
   `2026-04-07`, superseded by `wecoded-themes/registry/theme-registry.json` (7 themes,
   regenerated continuously). Nothing reads it. Leaving a stale second registry in the tree
   is how a future session ships against the wrong file.
3. **Prune `overrides/`.** 24 files: **13 target ids that are deprecated**, and one
   (`youcoded-drive`) targets an id that does not exist — the registry's is `google-drive`.
   Delete the 13, fix or delete the one. Verify with a script over `index.json`, do not
   eyeball it.
4. **`curated-defaults.json` names `theme-builder`, which is not a registry id.** The plugin
   is `wecoded-themes-plugin`; `theme-builder` is a skill inside it. This is not a silent
   no-op — the bare string is already written into users' `~/.claude/youcoded-skills.json`
   → `favorites[]`, where it resolves to nothing. Point it at `wecoded-themes-plugin`.
   (Cleaning the dead entry out of existing profiles is app-side; ROADMAP it.)

- [ ] **Step 2: Docs** — `docs/catalog.md`: what the catalog is, the four sources with their licences and the mirror/link decision (Docker repo MIT but served JSON unlicensed — we store metadata only; awesome-copilot MIT; cursorrules CC0; Anthropic official Apache-2.0 for the 53 local, the rest are pointers), **the merge rule and why a degraded run must never downgrade a row**, **the retire guard and when to use `allow_mass_retire`**, **`SCAN_RULES_VERSION` — bump it to re-scan the whole catalog, do not reach for `--force-rescan`**, the "only re-read what changed" skip, what "Likely safe" means in v1 (rule-based; SkillSpector is the next step), the `CATALOG_ENABLED` kill switch and how to use it, how to run locally (`--dry-run`), the retire semantics, and the env vars. README/CONTRIBUTING corrections as listed.

- [ ] **Step 3: Commit, push, PR** — `git add .github/workflows/catalog-ingest.yml docs/catalog.md README.md CONTRIBUTING.md && git commit -m "feat(catalog): hourly ingest workflow + docs"`; push; `gh pr create` titled `feat(catalog): ingest pipeline — four sources → Worker catalog` with the standard footer. Before merging: the Worker PR from Task 4 is merged and deployed, and Destin has added `MARKETPLACE_CATALOG_INGEST_TOKEN` (tell him in the PR: `openssl rand -hex 32`, paste into repo Settings → Secrets; the Worker deploy pushes the same value to the Worker).

- [ ] **Step 4: First real run** — `gh workflow run catalog-ingest.yml --repo itsdestin/wecoded-marketplace -f force_rescan=true`, then `gh run watch`. Expected: **a green run** (the script exits non-zero on any error, refusal or empty source) and a report artifact with `upserted` per source and no `error` / `refused`. Then:

```bash
curl -s https://wecoded-marketplace-api.destinj101.workers.dev/catalog | python3 -c "
import json,sys,collections; d=json.load(sys.stdin); e=d['entries']
print(len(e), collections.Counter(x['sourceMarketplace'] for x in e))
print(collections.Counter(x['catalog']['itemType'] for x in e))
print(collections.Counter(x['catalog']['scan']['status'] for x in e))"
```
Expected: roughly 5,000 rows; every row has `catalog`; scan statuses are a mix of `checked`, `caution` and `unchecked` (never all `checked`). Paste the numbers into the PR.

- [ ] **Step 4b: Prove the two rules that make this safe to leave running**

```bash
API=https://wecoded-marketplace-api.destinj101.workers.dev
# Response size, and that a repeat fetch is free.
curl -s -o /dev/null -w 'bytes=%{size_download}\n' $API/catalog
ETAG=$(curl -sI $API/catalog | grep -i '^etag:' | cut -d' ' -f2- | tr -d '\r')
curl -s -o /dev/null -w 'repeat=%{http_code} bytes=%{size_download}\n' -H "If-None-Match: $ETAG" $API/catalog
```
Expected: a few MB the first time, **`repeat=304 bytes=0`** the second. If the repeat is 200,
the ETag path is broken and every device will re-download the whole catalog hourly — stop and
fix it before Plan 3 ships.

Then let the **second** hourly run happen and compare: the `catalog-report.json` artifact
should show far fewer than the first run's numbers touched, the run should finish in minutes,
and no row's `scan.status` should have moved from `checked` to `unchecked`. That is the merge
rule and the skip rule both working. Re-run this check the first time a run *does* hit the
GitHub limit — that is the failure the merge rule exists for.

- [ ] **Step 5: ROADMAP** (workspace) — under the overhaul entry note "catalog service live <date>"; add follow-ups: **the official MCP Registry source (see Deferred below)**; SkillSpector / Cisco skill-scanner as a second scan stage; member descriptions from SKILL.md frontmatter; Docker `toolsUrl` fetch for tool descriptions; Layer E (sub-registry API) now has its data.

---

## Deferred: the official MCP Registry

Cut from this plan on 2026-08-28 after the review in
`docs/active/investigations/2026-08-28-marketplace-overhaul-plan-review.md`. It belongs with
**Layer E** (the sub-registry API), where the full 25,291-server corpus is the point rather
than a cost. The reasons, all measured rather than felt:

- **Nothing could be done with the rows.** They are not installable (the installer has no
  `mcp-registry` source type — Plan 3 Task 6 correctly shows "Open source" instead of
  Install), not rateable (a vote requires a prior install), and never scanned. So they would
  arrive as thousands of grey "Not checked" cards diluting the grid the curation exists to
  protect.
- **The quality filter could not get its inputs.** Which servers to show was decided by GitHub
  stars, looked up at ≤400 repos per run — against 25,291 servers, and only on the *weekly*
  full pass, because the hourly delta run only walks the servers that changed. That is roughly
  **62 weeks** before the filter knows what to filter.
- **It flipped listings on and off.** A popular server updated mid-week came back through a
  delta run with no star count in hand, fell under the bar and vanished from the marketplace
  until some later run happened to look it up. (The merge rule in Task 3 now prevents that
  class of bug generally — but the star mechanism would still have needed rethinking.)
- **It was most of the cost.** ~400 GitHub calls per run out of a ~800-call budget, most of
  the response bytes, and the `slice` column / delta runs / `noRetire` branch /
  `catalog_runs` watermark that existed only to serve it. Removing it took roughly 400 lines,
  one column, one route and one cron schedule out of this plan.
- **The approved UI does not need it.** Docker's ~320 servers fill the **Connections** tab
  with *better* data — declared secrets with their env var names, allowed hosts, volumes,
  OAuth, tool counts — and real provenance, at about 1% of the cost.

When it comes back, it needs: a persistent star store (enrich once, keep the value — the
merge rule already supports this), a real `updated_since` watermark that a delta run updates
(the old design never set `finished_at` on a delta run, so every hourly run re-fetched
everything since the last *weekly* pass), an install path for MCP servers, and a paging story
for `/catalog`. Strategy doc §6 decision 3 is updated to match.
