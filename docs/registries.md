# Registries (Marketplace & Themes)

Both registries are GitHub repos fetched at runtime by apps via `raw.githubusercontent.com`. Neither is rebuilt on a *schedule*, but **both rebuild on merge** — `validate-plugin-pr.yml`'s `rebuild` job regenerates `marketplace.json`, `skills/index.json` and the root `index.json` on a push to master, and `wecoded-themes` regenerates its registry and preview PNGs the same way. (Corrected 2026-08-28: this line used to say "No CI rebuild on either", which was wrong in both repos.)

## Skill Marketplace (`wecoded-marketplace/`)

Recent restructure (unified-marketplace merge) split the registry into `/skills/` and `/themes/` subdirectories. The `sync.js` rewrite added diffing, version tracking, and deprecation logic.

- **The apps read the Worker's `/catalog` FIRST; `index.json` is the fallback.** Since the
  catalog service (2026-08-31) both `skill-provider.ts` and `MarketplaceFetcher.kt` try
  `https://api.youcoded.ai/catalog` (the old `wecoded-marketplace-api.destinj101.workers.dev` still answers for pre-1.3 installs) on a **1-hour** TTL, then
  raw `index.json` on the old 24-hour TTL, then any stale cache. The catalog carries the block
  the store renders (kind, origin, scan verdict, capabilities, licence, pinned commit) which
  `index.json` does not; it is rebuilt hourly by `catalog-ingest.yml` in `wecoded-marketplace`.
  Requests are conditional (`If-None-Match` → `304` → keep the cached body), which is
  load-bearing rather than an optimisation: the response is several MB, both platforms refresh
  hourly, Android over mobile data, and until 2026-09-03 the Worker lived only on `*.workers.dev`, which gets no Cloudflare edge cache.
- **Kill switch: `CATALOG_ENABLED`.** A `[vars]` value in `worker/wrangler.toml`. Set it to
  `"0"`, commit, merge → `GET /catalog` answers **503**, and both clients treat that exactly
  like any other failure and fall back to `index.json`. No user sees an error. This is the way
  to stop a bad ingest run without writing and deploying code under pressure — a bad run
  otherwise reaches every device within the hour. Depth: `wecoded-marketplace/docs/catalog.md`.
- **Two index files, and the apps read the ROOT one.** `index.json` at the repo root is a bare JSON array (339 entries) and is what `skill-provider.ts` / `MarketplaceFetcher.kt` fetch. `skills/index.json` is the same entries wrapped in `{ version, generatedBy, entries }` — `sync.js` writes that one first and regenerates the root file after it for backward compatibility. Read the root file unless you specifically want the wrapper.
- `marketplace.json` — YouCoded-only entries
- Synced from upstream via `scripts/sync.js`. Entries with `sourceMarketplace: "youcoded"` are never overwritten by upstream sync
- Apps cache for 24 hours at `~/.claude/youcoded-marketplace-cache/` — **`youcoded-`, not `wecoded-`** (7 code sites across desktop and Android; verified 2026-08-28, this line had it wrong)
- CI: `.github/workflows/validate-plugin-pr.yml` validates community plugin PRs

## Theme Registry (`wecoded-themes/`)

- `registry/theme-registry.json` — auto-generated from `themes/{slug}/manifest.json` files
- Each theme directory under `/themes/` holds its manifest and assets
- CI validates PRs (required tokens, CSS safety, size <10MB, slug uniqueness)
- CI auto-rebuilds registry + generates preview PNGs (Playwright) on merge to main
- `previewTokens` in registry power CSS-based card previews in the app (no image load needed)
- **Version bumps gate the Update button** (migrated 2026-08-12 from the path-scoped rule): the registry pins version from the manifest (default `1.0.0`), and the app only offers Update when registry version > recorded install version (`marketplace-context.tsx` `isNewerVersion`). No bump → installed users see a no-op "Installed" button forever — hit on the 2026-07-16 mascot update, fixed in wecoded-themes PR #16.

### Required CSS tokens (15)

`canvas`, `panel`, `inset`, `well`, `accent`, `on-accent`, `fg`, `fg-2`, `fg-dim`, `fg-muted`, `fg-faint`, `edge`, `edge-dim`, `scrollbar-thumb`, `scrollbar-hover`

### CSS safety rules (CI enforced)

- No `@import`
- No external URLs
- No `expression()`
- No `javascript:` URIs

Violations fail CI. Community theme PRs are auto-rejected.
