# Registries (Marketplace & Themes)

Both registries are GitHub repos fetched at runtime by apps via `raw.githubusercontent.com`. Neither is rebuilt on a *schedule*, but **both rebuild on merge** — `validate-plugin-pr.yml`'s `rebuild` job regenerates `marketplace.json`, `skills/index.json` and the root `index.json` on a push to master, and `wecoded-themes` regenerates its registry and preview PNGs the same way. (Corrected 2026-08-28: this line used to say "No CI rebuild on either", which was wrong in both repos.)

## Skill Marketplace (`wecoded-marketplace/`)

Recent restructure (unified-marketplace merge) split the registry into `/skills/` and `/themes/` subdirectories. The `sync.js` rewrite added diffing, version tracking, and deprecation logic.

- **Two index files, and the apps read the ROOT one.** `index.json` at the repo root is a bare JSON array (339 entries) and is what `skill-provider.ts` / `MarketplaceFetcher.kt` fetch. `skills/index.json` is the same entries wrapped in `{ version, generatedBy, entries }` — `sync.js` writes that one first and regenerates the root file after it for backward compatibility. Read the root file unless you specifically want the wrapper.
- `marketplace.json` — YouCoded-only entries
- Synced from upstream via `scripts/sync.js`. Entries with `sourceMarketplace: "youcoded-core"` are never overwritten by upstream sync
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
