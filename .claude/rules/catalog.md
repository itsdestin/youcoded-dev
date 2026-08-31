---
paths:
  - "wecoded-marketplace/worker/src/catalog/**"
  - "wecoded-marketplace/scripts/catalog/**"
  - "wecoded-marketplace/worker/migrations/**"
last_verified: 2026-08-31
verify:
  - path: wecoded-marketplace/worker/src/catalog/routes.ts
    contains: "mergeOntoStored"
  - path: wecoded-marketplace/worker/src/catalog/publish.ts
    contains: "buildCatalogBody"
  - path: wecoded-marketplace/worker/migrations/0006_catalog.sql
    contains: "catalog_meta"
  - path: wecoded-marketplace/scripts/catalog/lib/capabilities.mjs
    contains: "SCAN_RULES_VERSION"
  - path: wecoded-marketplace/scripts/catalog/build.mjs
    contains: "exitCode"
  - test: wecoded-marketplace/worker/test/catalog.test.ts
  - test: wecoded-marketplace/worker/test/catalog-publish.test.ts
---

# The catalog — serve side + hourly ingest (shipped 2026-08-31)

What the app reads instead of `index.json`. Worker serves it (`worker/src/catalog/`), a Node
job builds it hourly from four sources (`scripts/catalog/`). **Depth, and the reason behind
every bullet here: `wecoded-marketplace/docs/catalog.md`.** Client side: `registries.md`.

## Never stamp a per-run value into a row that did not change
**Invariant:** no source may put `new Date()`, a run id or a "fetched at" into an emitted row.
The Worker skips writing a row whose merged JSON equals the stored bytes; a field that moves
every run defeats that.
**Why:** it is not just wasted writes. A write bumps `catalog_meta.version`, which **is** the
ETag, so **every device re-downloads the whole multi-MB catalog every hour** — Android over
mobile data — defeating the 304 the whole design exists for. A fresh `scan.checkedAt` did
exactly this to 71 rows (our `local` plugins have no upstream commit, so the skip never fires
for them); the merge now keeps the stored `checkedAt` when status, findings and rules all match.
**Guard:** `catalog.test.ts` → "a re-scan that found nothing new is not a change".

## Never `checked` without having read the files
**Invariant:** `scan.status` is `checked`/`caution` only when files were actually fetched.
An unreadable GitHub tree must produce `ok: false` → `unchecked`.
**Why:** `http.mjs` turns a 404 into `null`, and `(tree?.tree ?? [])` silently makes that an
empty file list — which scans clean and stamps a clean bill of health on files nobody read.
A repo name containing a dot did this in the first dry run.
**Guard:** `wecoded.test.mjs` → "a failed file fetch leaves the bundle unchecked".

## Retirement is an explicit list, and the Worker refuses a mass delist
**Invariant:** the ingest computes what to retire (`/shas` minus sent minus skipped) and posts
it; the Worker never infers "not seen". A `finish` retiring >20% of a source (floor 10 rows)
refuses, records the refusal, and the run exits non-zero. `--allow-mass-retire` is the override.
**Why:** nothing then has to be written to prove a row is still alive, and the day an upstream
renames a folder we collect 12 of 257 rows instead of silently delisting 245.
**Guard:** `catalog.test.ts` → "finish REFUSES to retire most of a source in one run".

## Bump `SCAN_RULES_VERSION` with any scan-rule change
**Invariant:** it is half the skip key (`<commit>:<rules>`). Bumping it re-scans the whole
catalog on the next run; leaving it means a tightened rule never runs against anything already
listed. Do not reach for `--force-rescan` for a routine rule change.
**Guard:** `capabilities.test.mjs` → "the skip key carries the rule version".

## Degraded runs must fail to improve, never damage
**Invariant:** an upsert missing `stars`/`license`/`sourceCommit`/`publishedAt` keeps the stored
value, and an incoming `unchecked` never overwrites a stored `checked`/`caution`.
**Why:** a rate-limited run is not evidence a licence vanished. Without it, badges and licences
flap hour to hour. **Guard:** `catalog.test.ts` → "NEVER downgrades".

## Operational
- **`CATALOG_ENABLED="0"`** in `wrangler.toml` → `/catalog` 503s → both clients fall back to
  `index.json` silently. The way to stop a bad run with a commit, not a code change.
- **Migrations are `NNNN_snake_case.sql` and D1 applies by filename order** — never insert a
  lower number after a higher one has run. `0006_catalog.sql` is the catalog's.
- **Ids may contain a slash** (bundle members are `<bundle>/<name>`) and Hono's `:param` never
  crosses one — every id-taking route needs a two-segment form.
- **A stalled ingest raises no alarm but a red workflow run.** `GET /admin/catalog/health` is
  how a human checks; GitHub silently disables `schedule:` after 60 days of repo inactivity.
