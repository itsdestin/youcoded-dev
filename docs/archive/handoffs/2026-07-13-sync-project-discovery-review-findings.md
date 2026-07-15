---
status: shipped
---

# Cross-Device Project Discovery — Post-Merge Review Findings (2026-07-13)

**Status:** **RESOLVED (2026-07-13)** on `youcoded` branch `fix/sync-project-discovery-followups` (off master `1f397c87`). #1–#5, #7, #8 fixed + regression-tested; #6 reconciled in the spec; #9 deferred (see below). Full desktop suite green (1630 passed; the one "failure" is the real-git convergence test hitting the 30s budget under full-parallel load — passes in 13s isolated), `tsc` clean. Branch pending PR/merge.
**Feature:** cross-device project discovery / rename / stop.
**Merged to `youcoded` master as `1f397c87`** ("Merge feat/sync-project-discovery…"). **Not yet released** (a release needs a tag; sync gates the release).

## Resolution (2026-07-13) — `fix/sync-project-discovery-followups`

| # | Outcome | Commit / where |
|---|---------|----------------|
| #1 paren-named projects skipped | **Fixed** — `canonicalBaseFor()`: a file is its own canonical when filename `=== ${content-name}.json`, taking precedence over `CONFLICT_RE`; genuine copies (incl. of paren-named projects) still fold. Empirically confirmed the bug first, then 4 regression tests. | `b5d29f34` (`project-registry.ts`) |
| #2 one bad folder name kills discovery+SyncHub | **Fixed** — per-item try/catch in `backfillRegistry` + log; create/import stay strict. | `67740781` (`service.ts`) |
| #3 watcher leak on disable-during-add | **Fixed** — engine `stopped` latch set in `stop()`; `addSpace` closes its watcher + bails after the ready await. Defends all callers. Test exercises the latch. | `a5197bbb` (`engine.ts`) |
| #4 stopped project shows Stop + false "off" copy | **Fixed** — `stopped` threaded through `HeroSync`; distinct "Sync stopped" copy + static label instead of the button. | `e810f264` (`ProjectHero.tsx`/`ProjectView.tsx`) |
| #5 no-op writes churn the watcher | **Fixed** — setters return `null` from the lock callback to skip an unchanged write; mtime-pinned tests. | `b5d29f34` |
| #6 fold-on-read never heals/prunes (doc drift) | **Reconciled in the spec** (§4a/§5/§10/§13) to "fold in memory only, copies left in place" — matches the code + the already-correct PITFALLS bullet. No code change (the in-memory fold is correct + intentional). | spec commit (youcoded-dev) |
| #7 `isSafeName` weaker than `validateSyncName` | **Fixed** — `isSafeName = validateSyncName(s) === null` (adds Windows-reserved + length; strict superset). Reserved-name + over-long tests. | `b5d29f34` |
| #8 non-unique `.tmp` in `ensureProjectEntry` | **Fixed** — unique per-process tmp (`<file>.<pid>.<seq>.tmp`); no-leftover test. | `b5d29f34` |
| #9 rename/stop during boot silently no-op | **Deferred (intentional).** Window is `roots === null`, which only exists between app-start and `startSyncSpaces()` — before the ProjectView UI can render, so it's effectively unreachable in practice. Surfacing it means reopening the just-closed rename field / adding an error toast to the hero — UI-flow risk that outweighs the near-zero benefit. Revisit only if a real repro appears. |

Original findings (as written pre-fix) follow.

**Source of truth for intent:**
- Spec: `docs/superpowers/specs/2026-07-12-cross-device-project-discovery-design.md`
- Plan: `docs/superpowers/plans/2026-07-12-cross-device-project-discovery.md`
- Invariants: `docs/PITFALLS.md → Sync Spaces → Cross-device project discovery / rename / stop`

## How the review was done

The plan executed correctly on the mechanical checks — all 10 tasks committed, ~161 relevant tests pass, `tsc` + `vite build` clean. That proves *completeness*, not *correctness*. A follow-up **adversarial** pass (three parallel Opus reviewers over registry/planner/engine, the `service.ts` wiring, and renderer/IPC, plus an inline read) found the defects below. **The shipped tests do not cover any of them** — fixtures use benign names like `app` / `Cool App`, and the service test mocks the registry with spies that never throw.

## Findings (priority order)

### #1 — Stop/Rename/Discovery silently fail for any project whose folder name contains `" (from …)"` — BLOCKING
**Severity:** correctness bug; defeats the feature's central "stop is safe and permanent" guarantee.
**File:** `desktop/src/main/sync-spaces/project-registry.ts:100-115` (`readProjectRegistry`), hinging on `desktop/src/main/conversations/store-core.ts:168` (`CONFLICT_RE = /^(.+) \(from .+\)\.json$/`).

**Cause:** `readProjectRegistry` decides whether a file is a conflict copy *purely from its filename*. That detector was written for the Conversation Store, whose base names are UUIDs (can never contain `" (from "`). Here the base name **is the user's folder name**, and `validateSyncName`/`isSafeName` both allow spaces and parentheses. So for a real project `Recipes (from Grandma)`:
- file `Recipes (from Grandma).json` → `isConflictCopyName` true → `extractConflictBase` → `Recipes.json`
- content `e.name = "Recipes (from Grandma)"` → guard `` `${e.name}.json` !== base `` → **record skipped entirely, every read.**

**Impact:**
- **Stop (worst):** `setProjectStopped` writes `state:"stopped"`, but the reader skips it → `activeManagedSpaces` never learns it's stopped → **the engine keeps syncing a project the user explicitly stopped.**
- **Rename:** the display-name overlay never sees the record.
- **Discovery:** the project never materializes on other devices.

**Reachable via:** `createProject`, `importProject`, or auto-adoption of a manually-dropped folder — all gate only on `validateSyncName`, which permits `(from …)`.

**Proposed fix** — parse first, then decide the group; a file is its OWN canonical when the filename equals `${content-name}.json`, which takes precedence over the regex:
```ts
if (!e) continue;
let base: string | null = null;
if (`${e.name}.json` === n) base = n;              // canonical for its own content name
else if (isConflictCopyName(n)) {                  // else maybe a genuine transport copy
  const cb = extractConflictBase(n);
  if (cb && `${e.name}.json` === cb) base = cb;     // copy content carries the canonical name
}
if (!base) continue;                               // hand-mangled — matches neither
```
Genuine copies of `Foo` (content name `Foo`) still fold; `Foo (from Bar)` now groups under itself.
**Test to add:** a project named `Recipes (from Grandma)` survives `readProjectRegistry`, and `setProjectStopped` on it is visible to `activeManagedSpaces`.

---

### #2 — One oddly-named folder kills discovery + SyncHub for the whole session (macOS/Linux)
**Severity:** medium — silent, feature-killing; needs a folder name Windows can't create but macOS/Linux can.
**File:** `desktop/src/main/sync-spaces/service.ts` (`backfillRegistry`, called unguarded at `startEngine` right before `runDiscovery` and the SyncHub setup).

**Cause:** `backfillRegistry` loops `roots.listProjects()` (any directory on disk) and calls `ensureProjectEntry`, which **throws** when `isSafeName` rejects the name (`notes:2026`, `draft?`, trailing space — all legal folders on macOS/Linux). The throw propagates out of `startEngine`, so discovery never runs and SyncHub never connects for the session. Basic space sync already started, so it *looks* fine.

**Proposed fix** — isolate each registration:
```ts
function backfillRegistry(): void {
  if (!roots) return;
  for (const p of roots.listProjects()) {
    try { registerProject(p.name, p.path); }
    catch (err: any) { logFn?.(`sync-spaces: skipped registering "${p.name}": ${String(err?.message ?? err)}`); }
  }
}
```
Keep `ensureProjectEntry` strict at the create/import sites (a throw there is a real signal — `validateSyncName` already gates them).

---

### #3 — `materializeProject` can leak a watcher onto a disabled engine
**Severity:** low–medium — narrow race window.
**File:** `desktop/src/main/sync-spaces/service.ts:151-163` (`materializeProject`); `desktop/src/main/sync-spaces/engine.ts` (`addSpace`/`stop`).

**Cause:** `materializeProject` rechecks `engine !== e` *before* `await e.addSpace(space)` but not after. If `syncSpacesEnable(false)` lands while `addSpace` is suspended on its `await ready`, disable runs `engine=null` + `stop()` (which snapshots the states map *before* `addSpace`'s final `states.set`). `addSpace` then inserts the space into the now-cleared map with a chokidar watcher nothing will ever close → the project keeps syncing after the user turned sync off, until restart. (The `startEngine` add loop has a per-iteration recheck; this standalone path doesn't.)

**Proposed fix (engine-level, defends all callers)** — a stop latch in `engine.ts`: add `private stopped = false;`, set `this.stopped = true;` at the top of `stop()`, and in `addSpace` after the `ready` await, before `this.states.set`:
```ts
if (this.stopped) { await watcher.close(); return; } // stopped mid-add — don't leak a watcher
```
Optionally also add `if (engine !== e) { await e.stop(); return; }` after `addSpace` in `materializeProject` for clarity.

---

### #4 — A stopped project still shows "Stop syncing" and a false "Sync is turned off" message
**Severity:** medium UX — no data harm (stop is idempotent), but misleading, and such a project can never be "Removed from YouCoded" (`canRemove` stays false).
**File:** `desktop/src/renderer/components/project-view/ProjectHero.tsx` (gray sync-line branch ~230-233; actions row ~288-309).

**Cause:** the hero branches on `sync.dot.color` + `spaceId`, never on stopped-state. A stopped project's folder is still in `spaces()`, so `syncedFolderName` is truthy → the "Stop syncing" button re-renders, and the gray line shows *"Sync is turned off — this project will sync once you turn it on…"* which is false for a permanent tombstone. `sync-dot-state.ts` already derives the correct gray **"Sync stopped"** dot; the hero just doesn't honor it.

**Proposed fix** — thread the state through: add `stopped: boolean` to `HeroSync`, set `stopped: heroSpace?.state === 'stopped'` in `ProjectView`, then (a) split the gray sync-line into stopped vs. sync-off copy, and (b) gate the Stop-syncing action on `!sync?.stopped`, showing a static "Sync stopped" label instead.

## Lower-severity (fold into the same branch)

| # | File | Issue | Fix |
|---|------|-------|-----|
| 5 | `project-registry.ts:167-186` | `setProjectDisplayName`/`setProjectStopped` don't skip no-op writes → churns the Personal watcher + a redundant push→discovery each call (spec §5/§13 require the skip) | return `cur` unchanged when displayName identical / already stopped |
| 6 | `project-registry.ts:91-119` | fold-on-read never heals/prunes conflict copies (deliberate + safe, but drifts from spec/tests describing a heal step; copies accumulate unbounded) | recommend: update spec/PITFALLS to match the in-memory-only fold, OR add a prune |
| 7 | `project-registry.ts:49-51` | `isSafeName` is weaker than the `validateSyncName` it claims to backstop (misses Windows reserved names + length cap) | reuse `validateSyncName` (`guards.ts`) |
| 8 | `project-registry.ts:121-125` | `ensureProjectEntry`'s `writeAtomic` uses a fixed non-unique `.tmp` outside the lock; dev + built app share `~/YouCoded` and can race | unique-suffix tmp, like `saved-folders.ts` |
| 9 | `ProjectHero.tsx:134,151` | rename/stop before the engine finishes booting silently no-op (roots null → `{ok:false}` discarded by `.catch`, `onRenamed()` fires anyway) | low priority; surface the `{ok:false, error}` to the user or defer the action |

## Sections verified CLEAN (no bug)

- `materialization-planner.ts` — `planReconcile`/`activeManagedSpaces` correct for reachable inputs (dedup, stopped/live/local sets, personal pass-through).
- `engine.ts` `removeSpace`/`liveSpaceIds` — teardown correctly mirrors `stop()` (delete-from-map-first so a queued rerun early-returns; awaits `st.current` for the Windows handle-drain).
- `activeSpaces()` single-gate routing — all three add/sync/backup loops go through it (`startEngine`, hub-connected, backup).
- `syncSpacesSyncNow` raw `spaces()` iteration — **cannot** resurrect a stopped project: `engine.syncSpace` early-returns for any space not in the state map, and a stopped project was `removeSpace`'d out.
- Broadcast→discovery recursion guard (`type==='synced' && updated && spaceId===personal.id`) — tight; no loop.
- `runDiscovery` single-flight + coalesced rerun; per-project failures become error events, never throw out of the loop.
- IPC parity for `syncspaces:rename-project` / `syncspaces:stop-project` across all five surfaces (preload, remote-shim, ipc-handlers, remote-server, SessionService.kt stub); status payload `displayName`/`state` overlay genuinely wired.
- `sync-dot-state.ts` stopped branch (gray "Sync stopped"), branch ordering, and the displayName overlay in `ProjectSwitcher`/`FolderSwitcher`/`ProjectView` (read-only, no writeback to `youcoded-folders.json`).
- The convergent merge (`mergeProjectEntries`/`foldProjectEntries`) — commutative + associative (verified: displayName paired with its own max `updatedAt`, stopped-dominance monotonic).

## Proposed remediation

One follow-up branch off master (`fix/sync-project-discovery-followups`), TDD each fix (failing test first), then full `sync-spaces-*` + `project-registry` + `materialization-planner` + `ipc-channels` suite + `tsc`/`vite build`, then PR. Order: **#1 → #2 → #3 → #4 → #5-9.** #1 is effectively blocking for relying on Stop in the field.
