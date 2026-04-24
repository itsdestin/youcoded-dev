# Codebase Audit — 2026-04-23

Full-sweep re-audit against the 2026-04-11 baseline. Methodology: five parallel verification agents (IPC, chat reducer, Android runtime, `youcoded-core` plugin, release), plus direct verification of key counts and file paths. HEAD commits at time of audit:

| Repo | HEAD |
|------|------|
| youcoded | `6020d40` (release v1.2.1) |
| youcoded-core | `ac72dc3` (release v1.2.1) |
| youcoded-admin | `14436ed` |
| wecoded-themes | `c25718d` |
| wecoded-marketplace | `620facc` |

## Summary

- **Items verified:** ~60 claims across 7 docs and 6 rules
- **Drift detected and FIXED this session:** 8 (D1–D8 — all resolved)
- **Conceptual reframe applied this session:** "the toolkit" retired across canonical docs; `youcoded-core` now described as one of a handful of bundled plugins (and being deprecated per `docs/superpowers/plans/2026-04-21-deprecate-youcoded-core.md`)
- **New features undocumented:** ~9 Android runtime files (deferred — low-severity table freshness)
- **ADRs superseded:** 002 (three-layer toolkit), 004 (hook reconciliation ownership moved to app)

---

## Applied fixes (this session)

### D1 — Toolkit flatten + conceptual reframe ✅

**Was:** `docs/toolkit-structure.md` and `.claude/rules/youcoded-toolkit.md` described a root plugin.json v2.3.2 plus three layer manifests at `core/plugin.json`, `life/plugin.json`, `productivity/plugin.json`. Post-Phase 3 (`d54bbf9` / `0d5ca0a`), those subdirectories no longer exist.

**Fixed in:**
- `docs/toolkit-structure.md` — rewrote as "youcoded-core Plugin" doc: flat structure, v1.2.1 manifest, only `setup-wizard` + `remote-setup` skills, deprecation callout
- `.claude/rules/youcoded-toolkit.md` — matching rewrite, `last_verified` bumped to 2026-04-23
- `.claude/skills/context-toolkit/SKILL.md` — rewrote three-layer context to reflect flat plugin and deprecation
- `docs/decisions/002-three-layer-toolkit.md` — marked Superseded with pointer to Phase 3 commits and the deprecation plan
- `docs/decisions/004-hooks-manifest-reconciliation.md` — path corrected from `core/hooks/hooks-manifest.json` to `hooks/hooks-manifest.json`; reconciliation owner updated to app's `HookReconciler`
- `CLAUDE.md` (workspace root) — workspace layout table, "About This Project" core pillars, Cross-Repo Relationships
- `GEMINI.md` — workspace layout, "Toolkit" subsystem section
- `docs/PITFALLS.md` — renamed "Toolkit & Hooks" → "Bundled Plugins & Hooks (`youcoded-core`)"; added Phase 3 flatten note; release section no longer references layer plugin.json files

### D2 — Android versionCode/versionName ✅

**Was:** `docs/build-and-release.md:18` — `versionCode = 7`, `versionName = "2.3.2"`.
**Fixed to:** `versionCode = 17`, `versionName = "1.2.1"`.

### D3 — `handleBridgeMessage` message-type count ✅

**Was:** 92 types in three places.
**Fixed to:** ~136 types in:
- `docs/shared-ui-architecture.md`
- `docs/android-runtime.md` Key Files table
- `.claude/rules/ipc-bridge.md` (+ `last_verified` 2026-04-23)
- `docs/decisions/001-shared-react-ui.md` Consequences

### D4 — `Bootstrap.deployWrapperJs()` does not exist ✅

**Was:** Three files referenced a non-existent `Bootstrap.deployWrapperJs()`.
**Fixed to:** "Deployed inline in `PtyBridge.start()` (`PtyBridge.kt:119-123`)" in:
- `docs/android-runtime.md`
- `.claude/rules/android-runtime.md` (+ `last_verified` 2026-04-23)
- `youcoded/.claude/rules/android-runtime.md` (+ `last_verified` 2026-04-23) — **⚠️ lives in the youcoded repo, needs commit + push there**

### D5 — `endTurn()` line range ✅

**Was:** `docs/chat-reducer.md` — `chat-reducer.ts:52-69`.
**Fixed to:** `chat-reducer.ts:145-167`.

### D6 — Chat reducer rule claimed content-based dedup ✅

**Was:** `.claude/rules/chat-reducer.md` invariant #4 said "Dedup is content-based, NOT flag-based".
**Fixed to:** Correct flag-based description via `pending` on user timeline entries. `last_verified` bumped to 2026-04-23.

### D7 — Announcement cadence phrasing ✅

**Was:** PITFALLS mentioned a "new 24h TS service".
**Fixed to:** "Both platforms now share a single 1h cadence owned by the app's main process."

### D8 — Toolkit rule listed layer skill paths ✅

**Was:** Rule listed `core/skills/`, `life/skills/`, `productivity/skills/` contents.
**Fixed to:** Lists only the two remaining in-plugin skills (`setup-wizard`, `remote-setup`) and points at the marketplace for everything else. Bundled into the D1 rewrite.

---

## Confirmed (no action needed)

### IPC / Cross-platform
- ✅ Platform detection `location.protocol === 'file:'` → `remote-shim.ts:66`
- ✅ Android WebSocket on port 9901 → `LocalBridgeServer.kt:27` (via `BuildConfig.BRIDGE_PORT`)
- ✅ Protocol format (request/response/push) → `remote-shim.ts:74-224`
- ✅ `preload.ts` vs `remote-shim.ts` parity with intentional exceptions
- ✅ Overlay Layer System (L1 40/50, L2 60/61, L3 70/71, L4 100) → `components/overlays/Overlay.tsx:15-16`
- ✅ SessionStrip dropdown z-[9000] load-bearing → `components/SessionStrip.tsx:786`
- ✅ HeaderBar left cluster no `min-w-0`, platform-conditional toggle placement

### Chat reducer
- ✅ `toolCalls` Map never cleared; `activeTurnToolIds` Set drives current-turn status checks
- ✅ `endTurn()` marks orphaned tools `failed` and resets turn state
- ✅ SESSION_PROCESS_EXITED spreads endTurn() then overrides attentionState
- ✅ Classifier-driven attention (no `thinkingTimedOut` timer)
- ✅ TRANSCRIPT_THINKING_HEARTBEAT / PERMISSION_REQUEST / transcript events reset to `'ok'`
- ✅ Flag-based dedup via `pending` (rule now matches)
- ✅ Per-turn metadata (stopReason/model/usage/anthropicRequestId) → `chat-types.ts:31-44`
- ✅ `transcript-watcher.ts:625-638` per-emit try/catch intact
- ✅ Remotes hydrate via `chat:hydrate`; no sidecar replay buffer
- ✅ `RemoteSnapshotExporter` is Electron-only; `chat:export-snapshot` 2s timeout
- ✅ Interrupt markers end turn via `TRANSCRIPT_INTERRUPT`

### Android runtime
- ✅ `Bootstrap.buildRuntimeEnv()` sets LD_LIBRARY_PATH → `Bootstrap.kt:1595`
- ✅ Linker64 routing, LD_PRELOAD linker variant, TMPDIR `$HOME/.cache/tmpdir`
- ✅ PtyBridge + DirectShellBridge share env helpers; `sessionFinished` StateFlow drives reactivity
- ✅ Native UI Bridge Pattern in use for dialogs + QR
- ✅ PtyBridge 600ms Enter split (no ConPTY chunking on Android)

### Bundled plugins & hooks
- ✅ `hooks-manifest.json` = 5 hooks across 3 types
- ✅ Sync hooks removed from the plugin
- ✅ `session-start.sh` handles encyclopedia context + version migration only
- ✅ Guards (`write-guard.sh`, `worktree-guard.sh`) present and behaving as documented
- ✅ Commands `/update`, `/health`, `/diagnose` exist
- ✅ Restore handled by `RestoreWizard.tsx`

### Build & release
- ✅ `build-web-ui.sh`, desktop-from-tag, single `v*` trigger, auto-tag.yml
- ✅ `scripts/run-dev.sh` with YOUCODED_PORT_OFFSET=50 / YOUCODED_PROFILE=dev
- ✅ Announcements: single 1h fetcher per platform, source of truth in youcoded repo, `isExpired()` helper, legacy fetch-script removed
- ✅ `BUNDLED_PLUGIN_IDS` parity between `bundled-plugins.ts` and `BundledPlugins.kt`
- ✅ `ClaudeCodeRegistry` writes all four registries
- ✅ `sync-service.ts` uses `extractStderr()`, `cleanupStaleBackendErrorFiles()`, typed warnings
- ✅ wecoded-marketplace worker `[env.test]` structure intact; production secret untouched

---

## Undocumented Features (deferred)

### Android runtime files not in `docs/android-runtime.md` "Key Files" table

`AnnouncementService.kt`, `CommandProvider.kt`, `DevTools.kt`, `HookReconciler.kt`, `RestoreService.kt`, `RestoreTypes.kt`, `SessionBrowser.kt`, `SyncService.kt`, `bridge/MessageRouter.kt`. Low-severity freshness — table is merely incomplete, not wrong.

---

## Remaining follow-ups

1. **Commit + push `youcoded/.claude/rules/android-runtime.md`** — the D4 fix landed in the youcoded repo and needs a PR/push there.
2. **Android `Key Files` table expansion** — add the nine undocumented runtime files when convenient. Not blocking.
3. **Open knowledge-debt items (unrelated to this audit):** Onboarding.tsx, SkillDetail rating, Icon override system, announcement signing, CC-drift items. See `docs/knowledge-debt.md`.
