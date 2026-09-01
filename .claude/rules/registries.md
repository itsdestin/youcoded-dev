---
paths:
  - "wecoded-themes/**"
  - "wecoded-marketplace/**"
  - "**/desktop/src/main/claude-code-registry.ts"
  - "**/desktop/src/main/local-theme-synthesizer.ts"
  - "**/desktop/src/main/theme-marketplace-provider.ts"
  - "**/desktop/src/main/announcement-service.ts"
  - "**/desktop/src/shared/announcement.ts"
  - "**/desktop/src/shared/bundled-plugins.ts"
last_verified: 2026-07-15
verify:
  - path: youcoded/desktop/src/main/claude-code-registry.ts
  - path: youcoded/desktop/src/main/local-theme-synthesizer.ts
  - path: youcoded/desktop/src/shared/bundled-plugins.ts
  - path: youcoded/desktop/src/main/announcement-service.ts
  - path: youcoded/desktop/src/shared/announcement.ts
    contains: "isExpired"
  - test: youcoded/desktop/tests/local-theme-synthesizer.test.ts
---

# Registries: themes, marketplace, plugin install, announcements

Both registries are GitHub repos fetched at runtime via `raw.githubusercontent.com` — no *scheduled* rebuild, but both rebuild **on merge** (`validate-plugin-pr.yml` → `rebuild`; themes CI regenerates registry + previews). **Registry-repo depth: workspace `docs/registries.md`. MCP-authoring depth: `wecoded-marketplace/docs/mcp-authoring.md`.**

## Theme & skill registries
- **`wecoded-themes/registry/theme-registry.json` is auto-generated on CI merge** — don't hand-edit. Each theme: `themes/{slug}/manifest.json` + assets. **15 required CSS tokens** and four CSS-safety bans, both CI-enforced and both listed in `docs/registries.md`. Manifest >10MB or duplicate slug fails CI.
- **Any content change to a published theme MUST bump the manifest `version`** — no bump → installed users see a no-op "Installed" forever (depth: `docs/registries.md`). Guard: none — candidate.
- **Apps read the Worker's `/catalog` FIRST** (1h TTL, `If-None-Match`/304 **mandatory** — MBs, hourly, mobile data, `*.workers.dev` has no edge cache); `index.json` is the fallback, then stale cache. **`CATALOG_ENABLED="0"` → 503 → silent fallback.** Depth: `wecoded-marketplace/docs/catalog.md`.
- **`wecoded-marketplace`:** root `index.json` (bare array — **the fallback both apps fetch**) + `skills/index.json` (same entries wrapped, written first by `sync.js`) + `marketplace.json` (YouCoded-only). Entries with `sourceMarketplace: "youcoded"` are never overwritten by upstream sync. App caches 24h at `~/.claude/youcoded-marketplace-cache/` — **`youcoded-`**, not `wecoded-` (7 code sites).

## Theme marketplace entries (`local-theme-synthesizer.ts`) — guard: `local-theme-synthesizer.test.ts`
- **`isLocal` is distinct from `installed`.** `installed` = a `manifest.json` exists at `~/.claude/wecoded-themes/<slug>/`; `isLocal` = synthesized because no registry entry exists (user-built, unpublished). Code branching on "deletable forever vs reinstallable" reads `isLocal`, NOT `installed`.
- **Slug collisions: marketplace entry wins**; merge order `[...marketplace, ...synthesized]` is locked by the test. **Synthesizer is PURE** (no `fs`/`path`/`os`) — all I/O in `theme-marketplace-provider.ts::listThemes()`. Android does NOT synthesize local themes (parity gap).

## Plugin install & CC registries (`claude-code-registry.ts`)
- **Claude Code v2.1+ does NOT filesystem-scan `~/.claude/plugins/`** — its loader iterates `enabledPlugins` in `settings.json`. Dropping files in without writing the registries leaves the plugin invisible.
- **FOUR registries must be written atomically** (`registerPluginInstall()`/`unregisterPluginInstall()` — never by hand): (1) `settings.json` → `enabledPlugins["id@youcoded"]:true`, (2) `~/.claude/plugins/installed_plugins.json` (v2 entry, absolute `installPath`), (3) `~/.claude/plugins/known_marketplaces.json`, (4) `~/.claude/plugins/marketplaces/youcoded/.claude-plugin/marketplace.json`.
- **Install location is `~/.claude/plugins/marketplaces/youcoded/plugins/<id>/`** (under the plugin cache dir). Two exceptions OUTSIDE it: bundled `youcoded-core` at `~/.claude/plugins/youcoded-core/`, and legacy top-level installs. **`listInstalledPluginDirs()` must scan BOTH roots** (top-level children for the youcoded-core clone AND `YOUCODED_PLUGINS_DIR`) — scanning one misses half.
- **`BUNDLED_PLUGIN_IDS` is two-way duplicated** — `desktop/src/shared/bundled-plugins.ts` + Kotlin `BundledPlugins.kt` must stay in sync. Intentionally hardcoded (offline-first + no remote force-install authority); changing it requires an app release.

## MCP plugin authoring (marketplace plugins) — **read `wecoded-marketplace/docs/mcp-authoring.md` before shipping a stdio MCP server**
- **`bash` is NOT on the Windows system PATH** — don't write `command:"bash"` in `mcp-manifest.json`; use a real on-PATH binary (`node`/`uvx`/`python`) or bash's 8.3 short name (`C:\PROGRA~1\Git\usr\bin\bash.exe` — spaces break the spawn). MSYS `/c/...` paths work only as ARGS, never `command`.
- **`${PACKAGE_DIR}` is expanded by YouCoded's `reconcileMcp()`, NOT Claude Code** — non-YouCoded CLI users get a literal placeholder. **Pin `mcp>=1.0.0,<2.0.0`** (0.x→1.x is dict→Pydantic breaking). **`claude mcp list` is a liar** (verifies only `initialize`) — verify with in-session `/mcp` (full `tools/list`). Spawn-probe the handshake before submission. Ten more footguns are in that doc.

## Announcements (`announcement-service.ts`, `shared/announcement.ts`)
- **Source of truth is `youcoded/announcements.txt`** (app repo), NOT youcoded-core. `/announce` writes there; public URL `raw.githubusercontent.com/itsdestin/youcoded/master/announcements.txt`.
- **Single fetcher per platform** (desktop `announcement-service.ts` 1h; Android `AnnouncementService.kt` 1h) → each writes `~/.claude/.announcement-cache.json` in its own home. Never reintroduce a parallel fetcher to the same file.
- **Two expiry filters, both required** — fetch-time (parser drops past-date lines) + render-time (`isExpired()` in `StatusBar.tsx`). **Clear propagation is an explicit null-write** — empty/all-expired remote → write `{message:null, fetched_at}`, don't skip the write (else clears linger a full interval). Cache shape: `{message:string|null, fetched_at, expires?}`.
