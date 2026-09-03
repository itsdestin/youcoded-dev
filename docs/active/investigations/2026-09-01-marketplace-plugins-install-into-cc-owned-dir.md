---
date: 2026-09-01
status: active
type: investigation
topic: the app installs plugins into the directory Claude Code owns and re-clones
---

# Plugins are installed into a directory Claude Code will re-clone

`youcoded/desktop/src/main/claude-code-registry.ts` points `YOUCODED_MARKETPLACE_ROOT` at
`~/.claude/plugins/marketplaces/youcoded/`, and `plugin-installer.ts` installs payloads into
its `plugins/` subdir.
<!-- claim: {"path": "youcoded/desktop/src/main/claude-code-registry.ts", "contains": "const YOUCODED_MARKETPLACE_ROOT = path\\.join\\(PLUGIN_CACHE_DIR, 'marketplaces'"} -->

That path is Claude Code's own marketplace install location. When CC updates the
marketplace it does a fresh `git clone` of `itsdestin/wecoded-marketplace` over it, deleting
both the app-written `.claude-plugin/marketplace.json` and every installed plugin payload.
Observed on Destin's machine 2026-07-18: both bundled plugins registered + enabled with an
`installPath` that no longer existed, stamped `.orphaned_at` by CC's in-use sweep.

wecoded-marketplace#46 made the clone *loadable* (the repo now ships the manifest) but does
NOT stop it wiping `plugins/` — the app silently reinstalls bundled plugins on next launch via
`ensureBundledPluginsInstalled()` (`skill-provider.ts`), and any non-bundled plugin stays
dead until manually reinstalled.

Related: the two sides disagree on directory naming — CC uses
`itsdestin-wecoded-marketplace`, the app rewrites `installLocation` back to `youcoded`
(`ensureMarketplaceRegistered`, only when it detects drift), so they can ping-pong.

Likely fix: stop colonising CC's directory — install to an app-owned root and register that
as the `installLocation`. Needs a design pass: the four-registry contract in
`.claude/rules/registries.md` assumes the current layout.

History: added 2026-07-18 (old ROADMAP L762, found diagnosing the broken marketplace).
Re-checked 2026-09-01: the root constant is unchanged.
