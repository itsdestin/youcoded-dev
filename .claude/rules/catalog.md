---
paths:
  - "**/worker/src/catalog/**"
  - "**/scripts/catalog/**"
  - "**/worker/migrations/**"
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

What the app reads instead of `index.json`. Worker serves it (`worker/src/catalog/`); a Node
job builds it hourly from four sources (`scripts/catalog/`). **Depth for every bullet:
`wecoded-marketplace/docs/catalog.md`.** Client side: `registries.md`.

## No field may change faster than what the user can see
**Invariant:** a row must not carry a value that moves on its own — neither a synthetic
per-run stamp (`new Date()`, a run id, "fetched at") **nor a real upstream fact that drifts**
(star counts, download totals, "last pushed"). The Worker skips writing a row whose merged
JSON equals the stored bytes; anything that moves by itself defeats that.
**Why:** a write bumps `catalog_meta.version`, which **is** the ETag, so **every device
re-downloads the whole multi-MB catalog** — Android over mobile data. Bitten twice:
`scan.checkedAt` (71 rows), then `catalog.stars` (97 — one GitHub star, on a field neither
platform renders). **`stars` is the lesson: legitimate data, which is why it got through.**
Adding a field, ask what moves it; if it can move while nothing a user sees changes, exclude
it from the comparison — keep the stored value, take the incoming one only when the row
differs for another reason. Depth: `docs/catalog.md`.
**Guard:** `catalog.test.ts` → "a re-scan that found nothing new is not a change", "a star
count is not a catalog change".

## Never `checked` without having read the files
**Invariant:** `scan.status` is `checked`/`caution` only when files were actually fetched.
An unreadable GitHub tree must produce `ok: false` → `unchecked`.
**Why:** `http.mjs` turns a 404 into `null` and `(tree?.tree ?? [])` makes that an empty file
list — which scans clean, stamping a clean bill of health on files nobody read. A repo name
containing a dot did this in the first dry run.
**Guard:** `wecoded.test.mjs` → "a failed file fetch leaves the bundle unchecked".

## Retirement is an explicit list, and the Worker refuses a mass delist
**Invariant:** the ingest computes what to retire (`/shas` minus sent minus skipped); the
Worker never infers "not seen". A `finish` retiring >20% of a source (floor 10) refuses,
records it, and the run exits non-zero. `--allow-mass-retire` overrides.
**Why:** nothing must be written to prove a row is alive, and the day an upstream renames a
folder we collect 12 of 257 rows rather than silently delisting 245.
**Guard:** `catalog.test.ts` → "finish REFUSES to retire most of a source in one run".

## Bump `SCAN_RULES_VERSION` with any scan-rule change
**Invariant:** it is half the skip key (`<commit>:<rules>`). Bumping it re-scans everything
next run; leaving it means a tightened rule never runs against anything already listed.
`--force-rescan` is for emergencies, not routine rule changes.
**Guard:** `capabilities.test.mjs` → "the skip key carries the rule version".

## Degraded runs must fail to improve, never damage
**Invariant:** an upsert missing `stars`/`license`/`sourceCommit`/`publishedAt` keeps the stored
value, and an incoming `unchecked` never overwrites a stored `checked`/`caution`.
**Why:** a rate-limited run is not evidence a licence vanished; without it badges flap hourly.
**Guard:** `catalog.test.ts` → "NEVER downgrades".

## Operational
- **`CATALOG_ENABLED="0"`** in `wrangler.toml` → `/catalog` 503s → clients fall back to
  `index.json` silently. Stops a bad run with a commit, not a code change.
- **Migrations apply in filename order** — never insert a lower number after a higher one has
  run. `0006_catalog.sql` is the catalog's.
- **Ids may contain a slash** (`<bundle>/<name>`); Hono's `:param` never crosses one, so every
  id-taking route needs a two-segment form.
- **A stalled ingest raises no alarm but a red workflow run** — `/admin/catalog/health` is the
  manual check; GitHub disables `schedule:` after 60 days of repo inactivity.
