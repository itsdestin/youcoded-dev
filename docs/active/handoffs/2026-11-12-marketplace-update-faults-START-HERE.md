---
status: active
date: 2026-11-12
topic: Marketplace plugin updates that are missed, stuck or do nothing — investigation and state of the marketplace
related-cards: 244, 51, 245, 75, 77, 52, 225, 248
---

# Marketplace update faults — investigation handoff

A read-only investigation on 2026-11-12. Nothing was changed in the app, the marketplace
or on Destin's computer. No card has been filed for the new faults yet, and no fix was
chosen. Everything here was read from code and from files on Destin's laptop (z13); none
of it was reproduced by pressing buttons in a running app.

## How this started (Destin's reports)

1. He asked which version of the superpowers skill set is installed and which is the
   latest on GitHub. Answer: **6.1.1 installed** (released 2026-07-02, installed
   2026-07-22), **7.0.2 latest** on `obra/superpowers` (2026-11-03; 7.0.0 was 2026-10-10).
2. His report: "I thought I downloaded it from the YouCoded marketplace... the marketplace
   I think says it's installed. I don't see like an update noted or anything, which makes
   it seem like there may be a bug in our marketplace somewhere."
3. He then asked for a full picture before any work: all known marketplace issues, all
   in-progress marketplace work, and how the listing, install and update flows work.

He was right on both counts: it was installed from the YouCoded marketplace, and the
missing Update button is our bug.

## The superpowers case, measured

| Where | Value |
|---|---|
| Plugin's own version file on disk | 6.1.1 (a git clone at `d884ae0`, the v6.1.1 release) |
| App's install record (`~/.claude/youcoded-skills.json`) | version `6.1.1`, **no `commit`** |
| Backup listing (`index.json`, `superpowers`) | version `1.0.4`, `sourceSha` `bb92a777` (= upstream v7.0.0) |
| Server listing (`/catalog`), cached 2026-11-09 | version `1.0.4`, `catalog.sourceCommit` `22f0b463` (= tip of upstream `main`, v7.0.2) |
| Anthropic's official list | pins `bb92a777` (v7.0.0), no version field |
| Claude Code's bookkeeping (`installed_plugins.json`, local `marketplace.json`) | `1.0.0` |

The app shows Update when `isNewerVersion(installed, listed)` or when the recorded commit
differs from the listed one. `1.0.4` is not newer than `6.1.1`, and there is no recorded
commit, so neither check fires.

Not our bug: the backup listing pointing at 7.0.0 rather than 7.0.2. It copies Anthropic's
pin, and Anthropic has not moved it.

## Faults found (none on a card yet)

Labelled CONFIRMED when the code path was read end to end, SUSPECTED otherwise.

**F1. CONFIRMED — version numbers compared across two scales.** For `url` and
`git-subdir` entries (286 of the 369 index entries: 184 + 102) the listing's `version` is
a counter `sync.js` invents (starts 1.0.0, patch bump whenever the entry's metadata or sha
changes). Only in-repo `local` plugins copy their real `plugin.json` version. The app
stores the listed number at install, then `repairPackageVersions()` at the next launch,
and `update()`, overwrite it with the `plugin.json` number.
- Real version higher than the counter → Update never appears (superpowers).
- Real version lower than the counter → Update appears and can never clear, because
  updating re-records the disk number. This direction is deduced from the code; no live
  example was looked for.
- Code: `wecoded-marketplace/scripts/sync.js` (`bumpPatch`, the `manifestVersion` branch
  ~340-354, the bump ~462); `youcoded/desktop/src/renderer/state/marketplace-context.tsx`
  ~587-612; `desktop/src/main/skill-provider.ts` `install()` ~365, `update()` ~506-517,
  `repairPackageVersions()` ~1318; `desktop/src/shared/version-compare.ts`.
- A test pins the disk-number behaviour: `desktop/tests/skill-provider-bundled.test.ts`
  "records the version read off disk, not the marketplace index version". No test compares
  a synthetic listed version against a disk version.

**F2. CONFIRMED — installs from before 2026-08-30 have no recorded commit, and nothing
backfills it.** The commit check was added in app commit `cce8451fb` ("Task 17"). The
renderer comment says old installs are left silent on purpose so a library does not light
up all at once. An installed `url` plugin is a git clone, so its commit could be read from
disk; nothing does. On z13 every package record has no commit.

**F3. CONFIRMED — Update on our own non-built-in plugins copies stale files.** Applies to
`local` entries from our repo that are not built in (Encyclopedia, Civic Report, Inbox and
similar). `update()` calls `installPlugin`, which returns `already_installed` before any
fetch; `upgradePluginFromLocal` then copies whatever the cache clone
(`~/.claude/youcoded-marketplace-cache/wecoded-marketplace`) holds. Only pinned sources
are fetched. `refreshLocalMarketplaceCache` (`plugin-installer.ts:494`) has no caller in
`src/`. Result: Update reports success, old files stay, the button stays. The cache clone
only moves when some other own-repo plugin is freshly installed and the cache is over an
hour old.

**F4. SUSPECTED — an open app never rechecks for updates.** The renderer loads the listing
on first demand and after each install, uninstall or update; no timer was found.

**F5. CONFIRMED — Claude Code's bookkeeping keeps a stale version.**
`upgradePluginFromGit` never calls `registerPluginInstall`, so `installed_plugins.json`
and the local `marketplace.json` keep the install-time number. Installs before app commit
`046b6be88` (2026-08-27) carry a hardcoded `1.0.0`. `gitCommitSha` is never written.
Cosmetic as far as known.

**F6. SUSPECTED — a theme update leaves removed files on disk** (reinstall overwrites, never
deletes).

**Stale comments worth fixing with any of the above:** `skill-provider.ts` ~510 "Known
gap... still do nothing on disk" (fixed by `a1ba9969c`, 2026-08-30);
`marketplace-context.tsx` ~570 "Today this is ONE signal"; `repairPackageVersions` doc
says three bundled ids, there are four; `plugin-installer.ts:16` gives the wrong install
path; references to deleted Kotlin files (`BundledPlugins.kt`, `MarketplaceFetcher`) in
`bundled-plugins.ts`, `app/build.gradle.kts`, `plugin-installer.ts:652`,
`claude-code-registry.ts:84`, and in `docs/registries.md` / `.claude/rules/registries.md`.

## A behaviour to know before fixing F1/F2

When Update works for a third-party plugin it lands on `catalog.sourceCommit`, which the
hourly ingest sets to the **tip of the author's branch** (`facts.head` in
`scripts/catalog/sources/wecoded.mjs:250`), not Anthropic's pinned sha. `install()` and
`update()` deliberately never fall back to `sourceSha`. So once superpowers can update, it
goes to 7.0.2, not 7.0.0, having passed only our rule-based scan. Whether that is wanted
is a product question for Destin.

## How the system works

**Listing**
- Server list: Worker `GET /catalog` at `api.youcoded.ai`, stored in D1 with a pre-built KV
  copy, rebuilt hourly at :13 by `catalog-ingest.yml` → `scripts/catalog/build.mjs` from
  four sources (our registry plus the mirrored Anthropic list, Docker, awesome-copilot,
  cursorrules). 4,663 rows in the 2026-11-09 cache. Kill switch `CATALOG_ENABLED`.
- Backup list: root `index.json` (369 entries), written by `scripts/sync.js` from our
  `marketplace.json` plus Anthropic's `marketplace.json`. Rebuilt by
  `validate-plugin-pr.yml`'s `rebuild` job on push to master, not on a schedule (last
  rebuilds 2026-10-16, 10-19, 11-08, 11-10).
- App: `fetchIndex` in `skill-provider.ts` ~860. Catalog cache 1 h with ETag/304, then
  `index.json` (24 h), then stale copies. `index.json` on z13 is dated 2026-09-14 because
  it is only written when the Worker fails; it has no commit data.

**Install** (`LocalSkillProvider.install()` → `installPlugin()` in `plugin-installer.ts`)
- `url`: shallow clone into the target, pinned to `catalog.sourceCommit`.
- `git-subdir`: sparse clone to a temp folder, pinned, subfolder copied.
- `local`, third-party (Anthropic's repo): cache clone pinned to `catalog.sourceCommit`.
- `local`, our repo: cache clone at `origin/master`, pulled only when over 1 h old or the
  cached version differs from the listing.
- Built-ins (`wecoded-themes-plugin`, `wecoded-marketplace-publisher`,
  `youcoded-chatsearch`, `wecoded-pages-plugin`): pinned per app release
  (`bundled-plugin-pins.ts`), reconciled at launch, never badged, cannot be updated or
  removed by hand.
- Third-party entries with no commit are refused ("Can't verify this plugin right now"),
  so installs and updates of those fail while the Worker is down.
- Docker, file and other types are not installable; the UI hides Install.
- Target: `~/.claude/plugins/marketplaces/youcoded/plugins/<id>`, a folder Claude Code
  also owns. Four Claude Code files are then written (`registerPluginInstall`), plus the
  app's own record in `~/.claude/youcoded-skills.json`.
- `~/.claude/plugins/cache/youcoded/<id>/<version>` is Claude Code's own copy, not ours.

**Update** (`update()` in `skill-provider.ts` ~403)
- Manual only; no update-all, no automatic update. Every Update button is gated on the
  badge, so with no badge the only refresh is uninstall and reinstall.
- `url` / `git-subdir`: `upgradePluginFromGit`, staged then swapped, with rollback.
- `local`: `upgradePluginFromLocal`, staged then swapped, re-registers with Claude Code.
- Themes: full reinstall from `wecoded-themes`; badge on version or file-fingerprint change.

**Android** runs the same desktop backend (`headless-boot.ts`); there is no Kotlin copy of
any of this.

## Known issues already tracked

- **Card #244** — installs, updates and keeping plugins. Four choices wait on Destin:
  293 Docker listings not installable (77 with a dead button); Todoist Install always
  fails; Messaging says "SMS/iMessage" but is a Windows-only Google Messages program;
  plugins can vanish if Claude Code re-clones its marketplace folder. Also: the theme
  registry needs a rebuild with fingerprints before the theme Update check works.
  The new faults above belong beside this card.
- **Card #51** — listings under-report capabilities, unreliable theme previews,
  featured list needs re-curating.
- **Card #245** — cannot delete or report a comment, admin analytics gaps, "Likely safe"
  badge claims more than the scan checks (choice waiting on Destin).
- **Card #75** — per-project skills and tools; built 2026-09 on
  `session/plugin-project-controls` (youcoded#571, youcoded-dev#203), parked for UI review,
  conflicts with master in 20+ files including the install code. Plan is to rebuild.
- **Cards #77, #52, #225, #248** — skills home outside Claude Code; assistant searching
  the marketplace; phone-sized marketplace; same setup on every device. Nothing built.
- No open branch or PR touches install or update today (2026-11-12) besides dependency bumps.

## Documents

Reference
- `docs/registries.md` and `.claude/rules/registries.md` — registries, the four Claude Code
  files, caching
- `wecoded-marketplace/docs/catalog.md` — the hourly ingest, its four safety rules, kill switch
- `wecoded-marketplace/docs/worker-backend.md` — the Worker
- `docs/MAP.md` rows "Registries & plugins", "Marketplace worker", "Marketplace catalog"

Open investigations (`docs/active/investigations/`)
- `2026-09-01-marketplace-plugins-install-into-cc-owned-dir.md`
- `2026-09-01-marketplace-installed-plugin-turns-unsafe.md`
- `2026-09-01-marketplace-docker-mcp-install.md`
- `2026-09-01-marketplace-catalog-payload-size.md`
- `2026-09-01-marketplace-public-sub-registry-layer-e.md`
- `2026-09-01-marketplace-report-a-comment.md`
- `2026-08-31-marketplace-featuring-recommendations.md`

Other
- `docs/active/design/2026-11-05-plugin-off-switch/` — answered deck for the unsafe-plugin
  off switch (shipped 2026-11-05)
- `docs/archive/investigations/2026-10-30-security-audit/04-supply-chain-app.md` — SC-4
  (our own non-built-in plugins install from master with no pin) and SC-5
- `docs/archive/plans/2026-08-30-marketplace-overhaul-remaining-work.md` — the overhaul
  that introduced the catalog and commit pinning

Tests that pin current behaviour (`youcoded/desktop/tests/`)
- `version-compare.test.ts`, `marketplace-context.test.tsx` ("updateAvailable: version OR
  commit"), `MarketplaceCard.test.tsx`, `skill-provider-bundled.test.ts`,
  `plugin-installer-git-upgrade.test.ts`, `plugin-installer-upgrade.test.ts`,
  `plugin-installer-pin.test.ts`, `skill-provider-catalog.test.ts`,
  `bundled-plugin-pins.test.ts`, `theme-fingerprint.test.ts`

## Where it stands

Options put to Destin for F1/F2, not yet chosen:
1. List each plugin's real version in the marketplace instead of the counter. Fixes the
   cause for every install, old and new. Risk: a wave of Update badges the first time it
   goes live, some on plugins that barely changed. Needs the plugin's `plugin.json` read at
   the pinned commit for 286 entries, and a decision on entries with no version.
2. Backfill the missing commit on old installs by reading it from the installed folder.
   No marketplace change. Leaves the mismatched numbers, so the "stuck Update" direction
   remains.
3. Both, 1 first.

Recommendation given: file one card ("Plugin updates: missed, stuck or do nothing") beside
#244 covering F1-F3, treat F3 as the most urgent because it reports success on our own
plugins while changing nothing, and plan F1 and F2 together. Destin has not answered; he
asked for this document instead.

Open questions for whoever picks this up
- Which version of the app Destin's installed copy is, and whether it contains
  `upgradePluginFromGit` (the code read was `origin/master`).
- Whether any listed plugin actually has a real version below its counter (the stuck-badge
  direction of F1).
- Whether third-party updates should follow the author's branch tip or Anthropic's pin.
- Destin's own superpowers install is still 6.1.1; nothing was done about it.
