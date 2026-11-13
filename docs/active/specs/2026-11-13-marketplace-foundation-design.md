---
status: draft
date: 2026-11-13
topic: Marketplace foundation — one app-owned home, one install record, one install engine
related-cards: 244, 51, 245, 75, 77, 248, 52
sources: docs/active/design/2026-11-13-marketplace-overhaul/marketplace-overhaul.questions.answers.json
---

# Marketplace foundation — technical design (draft for review rounds)

Destin, Q-9 (2026-11-13): design "the best, most correct" long-term marketplace, not one-off
patches; the marketplace is to become a comprehensive one-click install surface for anything a
personal assistant or coding agent uses (Q-4). Faults this replaces: handoff
`docs/active/handoffs/2026-11-12-marketplace-update-faults-START-HERE.md` (F1–F6) plus the
2026-11-13 sweep (uninstall lies, interrupted installs, no locks, drift, delisted plugins).

## The five rules

1. **The app owns its home.** `~/.youcoded/marketplace/`: `plugins/<id>/`, `held/<id>/` (turned
   off), `staging/`, `journal/`, `installed.json`, and a generated `.claude-plugin/marketplace.json`.
   Nothing the app installs lives under a folder another program manages.
2. **One record is the truth; everything else is an export.** `installed.json` (single writer,
   `NativeHome.mutateJson`) says what should be installed. A reconciler derives every consumer's
   view from it and repairs differences at launch and after each change. Exports: Claude Code's
   four registry files, hook entries in `~/.claude/settings.json`, tool servers in
   `~/.claude.json`, and the native engine's own views. Favourites, chips and overrides stay in
   `youcoded-skills.json`; its `packages` section migrates out.
3. **An installed thing is identified by its exact content, not a version number.** Record:
   `{id, kind, source, contentId, displayVersion, installedAt, channel, scanStatusAtInstall}` —
   `contentId` is a git commit, or a file-fingerprint for themes. No absolute path is stored;
   the path is derived from the id (so the record can later sync between devices, #248).
   Update available ⇔ the listing answered AND its `contentId` differs. Version numbers are for
   display only. Old installs with no `contentId` get it read from disk (git HEAD, or a content
   hash) on first reconcile.
4. **One transaction engine for install, update, remove, turn off — plugins and themes alike.**
   Per-id lock → journal entry → fetch into `staging/` → verify (manifest, pin, platform,
   requirements) → swap → export → record → clear journal. Launch recovery reads the journal and
   rolls each unfinished operation forward or back. A failed step reports its real cause.
5. **Sources are adapters.** Each adapter answers: can this run on this device, what does it
   need (a key, a sign-in, another program), fetch at a pin, verify. First set: `git` (whole repo
   or subfolder), `registry` (our own repo — pinned to the catalog commit like everything else,
   never "whatever master holds"), `theme`, `connection`. Later adapters (Docker, npm/uvx tool
   servers, the official MCP registry) add a file, not a rewrite.

## Decisions carried from the deck

- **Target (Q-1):** install and update deliver the author's newest commit that passed our hourly
  scan (`catalog.sourceCommit`). Anthropic's pin is not consulted. Never an unscanned commit.
- **Policy (Q-2):** `channel: builtin` follows the app release's pins, as today. Every other
  item, including optional YouCoded plugins, is `channel: ask`.
- **Checking (Q-3):** refetch the listing on window focus, at most hourly; count shown on the
  Marketplace button; Updates tab always present; Update all.
- **Trust (Q-7, Q-8):** the reconciler compares each installed `contentId`'s scan status now with
  `scanStatusAtInstall`; a change to Caution surfaces on the Library card. Only a live catalog
  answer counts, never the fallback list or a stale cache. The detail page gains "What we
  checked" from the scan facts already in the catalog.
- **Delisted:** catalog answered and the id is absent → "No longer in the marketplace".

## Claude Code export

Register marketplace `youcoded` as a **`directory`** source at `~/.youcoded/marketplace`, plugin
sources relative (`./plugins/<id>`). Claude Code's docs: a directory marketplace is used in place
and never copied or re-cloned (code.claude.com/docs/en/plugins/loading.md, "Find plugins on
disk"). The name stays `youcoded`, so existing `id@youcoded` enablement keys keep working.
**To verify before building on it:** load a plugin this way with a real `claude` binary under a
throwaway HOME; the docs do not say whether `installPath` or the cache copy is read.

Hook commands in plugin manifests hard-code the old folder. The reconciler rewrites the old
prefix to the new root when exporting (manifests stay as they are, so app versions before this
change keep working), and also accepts `{{plugin_root}}`.

## Native engine export

Today the native engine finds marketplace plugins only through Claude Code's
`installed_plugins.json` (`skill-scanner.ts:116-161`), reads no plugin tool servers and runs no
plugin hooks. New: skills and commands are read from `installed.json` directly (a first step of
#77); plugin tool servers are exported to `~/.youcoded/mcp.json`; plugin agents to the
specialist catalog. **Plugin hooks under the native engine need a hook runner that does not
exist — out of scope, its own card; the detail page must say so honestly.**

## Marketplace repo and Worker

Catalog rows gain `displayVersion` (the plugin's own version at `sourceCommit`), `changesUrl`,
`platforms`, `requirements`. Each is a function of the commit, so the "no field may move on its
own" ingest rule holds. The invented counter stops being compared; whether the fallback list's
`version` switches to the real number (which would also light up correct Update buttons in apps
up to 1.3.3) is decided in review round 1 after testing both directions against 1.3.3's code.

## Migration

First launch of the new version: a journaled move of each plugin folder into the new home,
record conversion, exports rewritten, marketplace re-registered. The old Claude Code clone
folder is left alone apart from removing our payloads. Forward-only: an older app run afterwards
would reinstall built-ins into the old folder; the reconciler removes those duplicates on the
next new-version launch.

**Safety:** dev instances share `~/.claude` and `~/.youcoded` with Destin's live app. The
migration and every new write path must be exercised only under a throwaway HOME until merge;
`run-dev.sh` gets a guard that refuses to migrate a home it does not own.

## Build order (one branch per repo)

1. Marketplace repo: catalog fields, hide the 77 source-less Docker rows, Todoist and Messaging
   listings, featured list (after its deck).
2. Record + transaction engine + adapters behind today's screens — closes F1–F6 and the sweep.
3. New home, exports, migration.
4. Screens: update count, versions and "what changed", Update all, success and failure states,
   Library warnings, delisted and can't-run states, confirm dialogs, badge wording, "What we
   checked".
5. Key entry and safe storage (makes Todoist real) — if Destin confirms.
6. Comments: delete your own, report another's, admin queue.

Tests: crash injection at every transaction step; reconciler convergence from arbitrary
disk/record states; migration fixtures shaped like real homes; Claude Code load check under a
throwaway HOME; existing pins in `desktop/tests/` updated, not deleted.

## Amendments from the prior-decisions check (2026-11-13)

Four sweeps (cards, 766 answered decks + workspace docs, 11,819 of Destin's past chat messages,
the three repos) compared this draft with what he has already said. Core confirmed: ADR 008
(`docs/decisions/008-conventions-inversion-native-home.md`, 2026-07-09) already made
`~/.youcoded/` the truth and Claude Code an export. Gaps found, now part of the design:

- **The reconciler touches only what it wrote.** Every exported entry carries an ownership mark.
  Hand-added tool servers (#59's `upsert()` fault) and plugins a user installed through Claude
  Code itself (`skill-provider.ts:465-469`) are never repaired, moved or removed.
- **Origin is recorded.** `origin: catalog | builtin | local`. A `local` item (a theme the user
  built, his own unpublished plugin) is never called "No longer in the marketplace" and keeps its
  "local only" badge (Destin, 2026-04-24/25). A `builtin` cannot be removed and says why
  (2026-04-21) and is shown in Marketplace and Library (2026-10-22).
- **Kinds and exports are open lists.** Kinds now: plugin, theme, connection. Named later kinds:
  page (#90, #202), personality/knowledge pack (#52, #63), specialist, prompt snippet, one item
  out of a bundle. Exports now: Claude Code, native engine. Named later export: other agents'
  folders such as Codex / AGENTS.md conventions (Destin 2026-07-09, 2026-08-31; strategy Layer E).
- **Per-project choices are an export filter, not a second install state.** `installed.json`
  says what is on the device; which projects load it stays with #75, whose UI he has not signed
  off. "Turned off" in this design means off everywhere.
- **The off-switch (shipped 2026-11-05) moves into the engine.** `held/` replaces
  `~/.claude/youcoded-turned-off-plugins/` (migrated). Its approved behaviour is kept: red
  "Turned off" tag, Remove with no extra confirm, settings kept, one-time chat message. Rule:
  an action that RESTRICTS (turn off) may use the last list seen while offline; a claim that
  INFORMS or loosens (Caution, delisted, update available) needs a live answer.
- **Install reports are an export.** Ratings need an install on record
  (`worker/src/ratings/routes.ts:24-52`); the engine reports install/remove and the full list at
  sign-in as today.
- **`requirements` includes a minimum app version** (commits `cde0d2f`, `2242804`, `c4795ab`).
- **Phone and remote callers.** Every engine operation is callable under the 2026-10-01 phone
  rules (install, remove, update, rate, comment, report); Update all and journal recovery get
  explicit access rules.
- **Tool servers and the synced file.** `~/.youcoded/mcp.json` is synced between devices
  (`mcp-registry.ts:2`). Plugin tool servers are therefore derived from `installed.json` at load
  or kept in a per-device file, never written into the synced one; keys never enter the record or
  `mcp.json` (#124).

To settle in review round 1 (technical):

- Our own plugins have no `sourceCommit` in the catalog (`scripts/catalog/sources/wecoded.mjs:250`);
  the `registry` adapter needs one.
- The catalog keeps one scan verdict per listing, for the current commit only. Comparing the
  status of an *installed older* commit needs per-commit verdicts kept by the Worker.
- Four skill/command files hard-code the old folder in their text (apple-services ×2,
  chatsearch, theme-builder), beyond hook commands.
- Themes live at `~/.claude/wecoded-themes/`, named by the live-app safety exception and
  hard-coded in theme-builder: move with the plugins, or leave and record why.
- Rule 3 supersedes the 2026-08-27 decision that "newer" means the `plugin.json` version.
  Publisher docs (marketplace `README.md:52-54`, `CONTRIBUTING.md:26-35`), the CI version-bump
  check and `registries.md:32` change with it; `TERMS.md:78` and the publisher's
  `inventory.js:54` need the same pass.

Marketplace wishes on record that stay their own cards (structure leaves room, not built here):
assistant searches the marketplace first (#52), AI review behind the badge (#245), phone-shaped
layout and can't-run items last (#225), connected-services screen (#59), connection health and
several accounts (#155–#159), tip jar and public registry (#52), previews (#51, #130).

## Open

- Android: where keys are stored (the desktop backend runs headless there).
- Overlap: app PR #748 rewrites 13 marketplace screen files; `test-suite-rethink` rewrites
  `marketplace-context.test.tsx`. Step 4 builds on both once landed.
