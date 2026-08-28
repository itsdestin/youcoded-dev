---
status: shipped
created: 2026-08-27
kind: design
implements: docs/active/specs/2026-08-05-chat-search-design.md §"Writes" (phase 2)
roadmap: ROADMAP.md lines 67–72 (phase 2 writes; bundled plugins never upgrade; 24h index TTL), 189 (`CLAUDE_PLUGIN_ROOT`)
---

# Chat Search phase 2 — writes from the tool, and bundled skills that actually upgrade

Two pieces, one branch. The first lets the chatsearch skill mark conversations
complete and manage tags and notes, in bulk. The second fixes the reason the
first would otherwise never reach an installed copy: bundled skills are frozen
at whatever bytes landed on first install.

Decisions taken with Destin on 2026-08-27, in order: fold the upgrade fix into
this work; "newer" = the skill's own `plugin.json` version (not a file
fingerprint, not the app version); notes get both `set` and `append`; unknown
tag labels are refused unless the call opts into creating them.

---

## Part A — the write path

### A1. What the tool can do

Four new commands in `chatsearch.js`, same invocation convention as the shipped
`find` / `show` (one JSON request object, argv or stdin). `ids` is always a list
of index short-ids or full ids; a single id is a one-element list.

| Command | Request | Effect |
|---|---|---|
| `flag` | `{"cmd":"flag","ids":[…],"flag":"complete"\|"priority","value":true\|false}` | set or clear a flag |
| `tag` | `{"cmd":"tag","ids":[…],"add":["label"…],"remove":["label"…],"create":false}` | add/remove tag labels; either list may be empty |
| `note` | `{"cmd":"note","ids":[…],"mode":"set"\|"append","text":"…"}` | `set` replaces; `append` adds `\n\n<YYYY-MM-DD>: <text>` (no leading newlines when the note was empty) |
| `close` | `{"cmd":"close","ids":[…],"reason":"…"}` | `flag complete=true` **and** `note append reason`, as one request |

Rules:
- Labels match case-insensitively against the registry's non-deleted,
  non-archived tags. An unknown label is **refused** for the whole request
  (`refused: unknown tag "perms" — existing tags: …`) unless `"create": true`,
  which creates it with the app's default colour before applying.
- Note text is capped at the app's existing 8,000-character limit; `append`
  that would exceed it is refused for that id, not truncated.
- An id that does not resolve is reported `not found` and does not abort the
  batch. An ambiguous short-id prefix is refused up front, listing candidates
  (same behaviour `show` has today).
- Nothing is applied by the tool itself. It only writes a request file
  (A2) and reports the app's receipt.

### A2. The outbox

```
~/.youcoded/chatsearch/outbox/
  <uuid>.json            ← request, written by the tool (temp name → rename)
  processing/<uuid>.json ← claimed by exactly one app instance (rename)
  done/<uuid>.ack.json   ← receipt, written by the app (temp name → rename)
```

**Request** (format `v: 1`):
```json
{
  "v": 1,
  "id": "<uuid>",
  "createdAt": "2026-08-27T21:40:00.000Z",
  "storeRoot": "/home/destin/YouCoded/Personal/Conversations",
  "ops": [
    { "op": "flag", "targets": [{"provider":"claude","id":"…"}], "flag": "complete", "value": true },
    { "op": "note", "targets": [...], "mode": "append", "text": "superseded by PR #339" },
    { "op": "tag",  "targets": [...], "add": ["superseded"], "remove": [], "create": false }
  ]
}
```
`close` is expanded by the tool into a `flag` op followed by a `note` op in one
request, so the two land together. `targets` carry the provider because the
store is keyed `(provider, id)`; the tool reads both from the index entry.

**Receipt**:
```json
{
  "v": 1, "id": "<uuid>", "appliedAt": "…", "appVersion": "1.3.0",
  "results": [
    { "provider":"claude", "id":"…", "op":"flag", "status":"applied" },
    { "provider":"claude", "id":"…", "op":"tag",  "status":"already" },
    { "provider":"claude", "id":"…", "op":"note", "status":"not-found" },
    { "provider":"claude", "id":"…", "op":"tag",  "status":"refused", "error":"unknown tag \"perms\" — existing tags: sync, perm, ui" }
  ],
  "createdTags": [{"id":"tag_…","label":"superseded"}]
}
```
`status` ∈ `applied | already | not-found | refused | error`. A request the
app cannot parse gets a receipt with a single top-level `error` and no
`results`.

**The tool's side of the protocol**: write the request, then poll
`done/<uuid>.ack.json` for **2 s** (50 ms interval). On receipt: print one line
per target, then a summary (`applied 21 · already 1 · not found 0 · refused 0`).
On timeout: print exactly
`Queued: YouCoded is not running, or is busy. The change applies the next time it opens (request <uuid>).`
and exit 0 — the request file stays in `outbox/`. A later
`{"cmd":"receipt","id":"<uuid>"}` prints the receipt once it exists.

**`storeRoot`**: the tool copies it from a new `storeRoot` field the index
writer adds to `<provider>-meta.json` (additive; format version stays 1 — the
CLI already tolerates unknown fields). An app instance whose own store root
differs leaves the request untouched. This is the guard against a dev instance
applying a triage to its throwaway data.

### A3. The app's side

New module `desktop/src/main/chatsearch-index/outbox-drain.ts`, started and
stopped alongside `startChatsearchIndex()` (`main.ts`).

- **Watch**: `fs.watch` on `outbox/` plus a 5 s poll (the subagent-watcher
  pattern — Windows drops notifications). Also one drain at start.
- **Claim**: `rename(outbox/x.json → processing/x.json)`; `ENOENT` means
  another instance won — skip. This is the same atomic-rename claim the index
  build lock uses, for the same reason: the live app and every `run-dev.sh`
  instance share `~/.youcoded/`.
- **Guards, in order**: parse → `v === 1` → `storeRoot` equals this instance's
  store root (else move back to `outbox/` untouched and log) → **dev instances
  never drain** (`YOUCODED_PROFILE` set, the existing dev-instance signal in
  `remote-config.ts`) unless `YOUCODED_CHATSEARCH_OUTBOX=1`, which is how the
  feature is developed and tested.
- **Apply**, per target, through the existing functions and nothing else:
  `noteFlagChanged(id, key, value, isNative)` for flags and tags
  (`key = tagFlagKey(tagId)`), `noteSessionNote(id, text, isNative)` for
  notes, `getTagRegistry().create(label, DEFAULT_COLOR)` for `create: true`.
  The same **phantom-record gate** (`canWriteStoreRecord`) the IPC handlers
  use applies — a target that is a live session with no established mapping is
  reported `error: session is still starting — retry in a moment`. `append`
  reads the current note via the store first. `already` is reported when the
  value is unchanged, so re-running a batch is safe.
- **Broadcast**: after each request, exactly what `SESSION_SET_FLAG` does —
  `SESSION_META_CHANGED` to the renderer for each touched session, the remote
  broadcast, and `emitConversationMetaChanged()` (which is what triggers the
  3 s index rebuild, so `find` reflects the change).
- **Receipt**: temp → rename into `done/`. Then `processing/x.json` is deleted.
- **Sweep**: at start and every hour, delete `done/*.ack.json` older than 24 h.
  `processing/` entries older than 10 min (a crash mid-apply) are moved back to
  `outbox/`.
- **Never**: write the store files directly, bypass the registry, or apply a
  request with a different `storeRoot`.

Android: out of scope. Tags and notes are not on mobile (`SessionService.kt`
answers `not-implemented-on-mobile`), so there is nothing for an Android
drainer to call. The request format is device-neutral so that can change later.

### A4. Skill instructions (SKILL.md)

Add a "Changing things" section: the four commands; **show the user the list
before any change touching more than five conversations**; prefer `close` with
a reason over a bare `flag complete` so the note carries the why; treat
`Queued` as success-pending, never as failure; never `create: true` a tag
without saying so. Replace `${CLAUDE_PLUGIN_ROOT}` in the invocation examples
with a note that the harness fills it in (see B4) — keep the variable.

---

## Part B — bundled skills that upgrade

### B1. The bug, precisely

`ensureBundledPluginsInstalled` → `installMany` → `installPlugin`, which skips
when the target directory and a manifest exist (`plugin-installer.ts:360-365`).
No version is compared; the private cache clone
(`~/.claude/youcoded-marketplace-cache/wecoded-marketplace/`) is only refreshed
inside the install path that the skip prevents; the marketplace `index.json`'s
`version` is bumped by `sync.js` only for metadata changes, never for file
edits; `installed_plugins.json` records a hardcoded `1.0.0`. Failures from
`installMany` are discarded. Android (`PluginInstaller.kt:109-112`) has the
same shape.

### B2. The fix — desktop

New function `reconcileBundledPlugins()` replaces the body of
`ensureBundledPluginsInstalled()`; called from the same place at launch.

1. **Skip entirely on dev instances** (`YOUCODED_PROFILE` set) unless
   `YOUCODED_BUNDLED_UPGRADE=1`. `~/.claude/` is the live app's, and a dev
   instance must not rewrite the real install.
2. **Index freshness, bounded**: if any `BUNDLED_PLUGIN_IDS` entry is absent
   from the cached index, `invalidateCache()` and `fetchIndex()` once. No
   change to the 24 h TTL for anything else.
3. **Refresh the cache clone** (`git fetch` + `reset --hard origin/master`,
   the code that already exists at `plugin-installer.ts:273-280`), at most once
   per launch, network failure tolerated (log, continue with what's there).
4. **Per bundled id**:
   - not installed → `installPlugin` as today; a failure is **logged** with
     the real error, never swallowed.
   - installed → compare `plugin.json` `version` of the cache-clone copy with
     the installed copy (semver compare; the renderer's `isNewerVersion` moves
     to `shared/` so both use one function). Not newer → nothing.
   - newer → copy the cache-clone tree over the install via a temp
     directory + rename (never `rmSync` the live directory first), re-register
     with the real `plugin.json` version, keep
     `~/.claude/youcoded-config/<id>.json` untouched. Bundled plugins are
     app-owned: there is no local-modification check. (One would leave a
     hand-edited copy silently on an old version forever, with only a log line
     to say so; edits to a bundled skill belong in the marketplace repo.)
5. `registerPluginInstall` records the real `plugin.json` version everywhere
   it previously wrote `'1.0.0'`.
6. **One version number per plugin.** The marketplace `index.json` lists an
   in-repo plugin under its `plugin.json` version (`sync.js` copies it; the
   synthetic bump-on-metadata-change stays only for plugins without a manifest
   version). The renderer's "Update available" badge compares the installed
   package record against the index, so the two must share one number space —
   otherwise every bundled plugin shows a badge its disabled Update button
   can never clear.

### B3. The fix — Android

Port 2–5 into `LocalSkillProvider.kt` / `PluginInstaller.kt` (Android has no
dev-instance concept, so 1 does not apply; `assembleReleaseTest` installs
side-by-side with its own data). `bundled-plugins-parity.test.ts` grows a
second assertion: the Kotlin installer source contains the version-compare
entry point by name, so the two cannot drift silently.

### B4. `${CLAUDE_PLUGIN_ROOT}` in the local-model harness

When the native harness renders a plugin's SKILL.md into the model's context,
it substitutes `${CLAUDE_PLUGIN_ROOT}` with the plugin's install directory —
the same thing Claude Code does at render time. One place, every plugin,
no republishing required. Guarded by a test that renders the chatsearch
SKILL.md and asserts no `${` remains.

### B5. Marketplace CI guard

`wecoded-marketplace/.github/workflows/`: a job that fails a PR when any file
under a bundled plugin's directory (`youcoded-chatsearch/`,
`wecoded-themes-plugin/`, `wecoded-marketplace-publisher/`) changes without
its `plugin.json` `version` changing in the same diff. Bumping is the release
act; forgetting becomes impossible.

### B6. Shipping order

The tool change (Part A, CLI side) ships in `wecoded-marketplace` with
`youcoded-chatsearch` bumped `0.1.0 → 0.2.0`. The app change (Parts A3 and B)
ships in the next `youcoded` release. Until an app with B is running, an
existing install will not pick up 0.2.0 on its own — the one-time manual path
is Settings → Skills → Update, which already works.

---

## Tests

Desktop (`desktop/tests/`):
- `chatsearch-outbox.test.ts` — round trip (request → store functions called
  with exact args → receipt); malformed → error receipt; `already` on repeat;
  `not-found`; unknown tag refused with the existing-label list; `create: true`
  creates once and applies; `append` formatting on empty and non-empty notes;
  8,000-char cap; wrong `storeRoot` left in place; dev instance without the
  override never drains; launch drain; stale `processing/` recovery; sweep;
  a file another instance already claimed is skipped; `append` of a line
  already in the note → `already`; store unavailable → `error`, never
  `not-found`.
- `plugin-installer-upgrade.test.ts` + `skill-provider-bundled.test.ts` —
  fake `PLUGINS_DIR`, fake cache clone, no network, no real `~/.claude`: fresh
  install; newer → upgraded and re-registered with real version; same version
  → untouched; cache refresh inside the 1 h gate skips the network; refresh
  failure still compares against the last copy; dev instance → no-op; bundled
  id missing from index → one refetch; install failure → logged.
- `bundled-plugins-parity.test.ts` — extended per B3.
- harness skill-render test per B4.
- `skill-provider-bundled.test.ts` — rewritten for `reconcileBundledPlugins`.

Marketplace (`wecoded-marketplace/youcoded-chatsearch/tests/`):
- `chatsearch.test.js` — golden tests for `flag`/`tag`/`note`/`close` request
  files, the `Queued` path (no receipt within the window, using a shortened
  test-only timeout), the receipt render, ambiguous/unknown ids, `receipt` cmd.

Android: `PluginInstallerTest.kt` mirrors the reconcile cases.

## Out of scope

Phase 3 digests and the `○ open` marker; an undo command (the dated note trail
is the audit aid); mobile writes; any change to the app's UI; shortening the
24 h index TTL generally; refreshing Claude Code's own marketplace clone at
`~/.claude/plugins/marketplaces/youcoded/` (app-owned destination, never pulled).

## Risks Destin will notice

- A bulk `close` with the wrong ids marks real work complete. Mitigation is
  procedural (SKILL.md: show the list first) plus the note trail; there is no
  undo.
- First launch after B ships upgrades every bundled skill whose version moved
  since first install — a one-time burst of file copies at startup, logged.
- A skill Destin edited by hand will silently stay old (logged, not surfaced
  in UI). Acceptable for now; a Settings notice is a follow-up if it bites.
