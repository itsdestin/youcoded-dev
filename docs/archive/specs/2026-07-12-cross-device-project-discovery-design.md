---
status: shipped
---

# Cross-Device Project Sync — Discovery, Rename & Stop — Design

> **✅ SHIPPED 2026-07-13** — merged to `youcoded` master (`1f397c87`), hardened by post-merge review fixes (`0b599bf5`). Cross-device project discovery, rename (display-name), and stop-syncing are implemented + tested. Post-merge review + resolutions: `docs/superpowers/2026-07-13-sync-project-discovery-review-findings.md`. **Live status tracker: `docs/superpowers/2026-07-10-sync-completion-handoff.md`.** The `Status:` line below is historical.

- **Date:** 2026-07-12
- **Status:** Approved design, pending implementation plan
- **Parent spec:** `docs/superpowers/specs/2026-07-03-cross-device-sync-design.md` (§3 "enable Sync and everything appears", §8 materialization, §10a device-registry pattern)
- **Fills:** the release-gating gap recorded in `docs/superpowers/2026-07-10-sync-completion-handoff.md` §2 item **A00**, plus most of **A01** (project lifecycle — rename + un-sync are now in scope), and `docs/knowledge-debt.md`
- **Precedes:** Plan 2b (leases + `devices.json` device registry), Plan 2c (legacy demolition)

## 1. Motivation

The cross-device sync pitch (parent spec §3) is *"turn on Sync and your projects, files, and conversations are on every device."* Conversations deliver on that — they ride the **Personal** space, which exists and syncs on every device unconditionally. **Projects do not.** A device's synced spaces are derived purely from the filesystem: `ManagedRoots.spaces()` returns the Personal space plus one space per folder physically present under `~/YouCoded/Projects/`. There is no notion of "a project that exists in the sync group but isn't on this device," so a project synced on device A never appears on device B, and a `space-updated` SyncHub signal for an unknown project is silently dropped (`service.ts`: `spaceForKey` returns null → no-op).

Beyond first appearance, two lifecycle operations are part of "sync is complete" and are designed in from the start here (they are painful to bolt on later — see §12):

- **Rename** — a project should show the *same visible name* on every device, so a user can always tell two projects are the same thing.
- **Stop syncing** — a user must be able to detach a project from sync while **keeping the local copy on every device**, and it must never silently respawn afterward.

Under the standing release gate ("no release until sync is entirely complete"), a two-device user whose projects don't appear, can't be renamed consistently, or can't be un-synced is a broken core feature. This design closes all three.

## 2. Goals & non-goals

**Goals**
- A project synced on any device **silently appears** (folder created, repo adopted, live-syncing) on every other device, no user action.
- **Rename propagates.** Renaming a project on one device relabels it on every device.
- **Stop syncing propagates and is safe.** Pressing "Stop syncing" on any device detaches that project's live sync on *every* device, **keeps each device's local copy**, and the project never re-materializes afterward.
- Everything is **convergent and offline-tolerant**: two devices acting while apart still end up in agreement, regardless of pull order.
- The visible record lives in the existing Sync panel / Project View — nothing is truly invisible.

**Non-goals (this design)**
- **Per-device selective sync** (a project on only *some* devices). Not a goal — silent materialization means every *active* synced project lands on every device.
- **True on-disk folder rename.** "Rename" here changes the **display name only**; the folder name on disk (which is the immutable sync identity) never changes. Renaming the physical folder — a coordinated multi-device folder move + transcript-slug/artifact-sidecar remap on every device — is deliberately out of scope (§12, §15).
- **"Resume syncing" a stopped project.** There is a Stop button but no Resume button (per product decision). `stopped` is a permanent tombstone in this design; re-enabling would need a small future addition (§15).
- **Deleting the GitHub remote on stop.** Stop detaches locally and tombstones the registry; the provisioned GitHub repo is left in place (deleting a remote repo is a destructive cross-account action we don't automate). Documented, not fixed here.
- **Android.** Desktop-first, consistent with the rest of sync (Android is Phase 3). The registry format and IPC are platform-neutral so the Android engine can consume them unchanged later; Android handlers are `not-implemented-on-mobile` stubs for now (the established parity pattern).

**Accepted behavior (not a bug):** *raw-deleting* a still-active synced folder in the OS file manager makes sync **restore it** (its files re-arrive like a re-downloaded cloud file) — standard sync semantics. The *sanctioned* way to remove a project is "Stop syncing," which tombstones it so it stays gone.

## 3. Why a registry, not `gh repo list`

`repoNameForSpace` slugifies and then appends a SHA-1 hash of the **lowercased** project id: `youcoded-sync-project-<slug>-<sha8>`. This is deliberately lossy and one-way (parent §7 / `space-manager.ts` comment) so distinct folder names always get distinct repos and weird names still get a valid repo. **The transform cannot be reversed** — from a repo name you cannot recover the folder name, and there is nowhere in it to carry a *display* name at all. Enumerating the account's repos by prefix would tell a device *that* projects exist but not what to **name** or **label** their folders, nor whether a project has been **stopped**.

So the source of truth is an explicit **registry** carrying the folder name, its repo name, its synced display name, and its lifecycle state — synced through the channel that already works on every device: the Personal space.

## 4. The registry — one convergent record per project

Location: `~/YouCoded/Personal/ProjectSync/<name>.json` (`<name>` = the folder name = the immutable identity).

```json
{
  "schemaVersion": 1,
  "name": "cookingonlowheat",
  "repoName": "youcoded-sync-project-cookingonlowheat-3f9a1c2b",
  "displayName": "Cooking On Low Heat",
  "state": "active",
  "updatedAt": 1752345678901
}
```

- **Visible `ProjectSync/` folder, mirroring the Conversation Store** (`~/YouCoded/Personal/Conversations/<provider>/<id>.json`). That per-file-under-Personal layout is the established pattern for a record set synced in Personal, and it sidesteps the reserved `.youcoded/` basename — that name is BOTH the git transport's hidden git dir (`<root>/.youcoded/sync.git`) AND a `DEFAULT_IGNORES` entry, so anything under it silently never syncs. (Location resolved 2026-07-12 after an initial `.youcoded/projects/` sketch would have been git-ignored.)
- **Fields:**
  - `name` — folder name under `Projects/`. **Immutable** (rename touches only `displayName`), so it stays the sync identity and `repoName = repoNameForSpace(name)` never breaks. This is why no separate ULID is needed.
  - `repoName` — deterministic `repoNameForSpace(name)`; identical on every device.
  - `displayName` — the synced, user-visible label. Defaults to `name`. **Mutable.**
  - `state` — `"active" | "stopped"`. **Mutable, monotonic:** `stopped` is a tombstone.
  - `updatedAt` — ms epoch, drives last-writer-wins on `displayName`.

### 4a. Why this is now a *convergent record* (and why it mirrors the Conversation Store)

The earlier immutable `{name, repoName}` sketch was conflict-free by construction, so it needed none of Phase-2a's merge machinery. **Adding synced `displayName` + a `stopped` tombstone reintroduces mutation, and mutation across offline devices means conflicts** — so the store now genuinely mirrors the Conversation Store's convergent pattern (per-file, fold-on-read via conflict-copy folding **done in memory only**, locked read-modify-write, fail-soft parse, `schemaVersion`). The **merge function** is small and project-specific:

Merging two records for the same `name` (the canonical file + any folded conflict copies):
- `name`, `repoName`: identical by construction — take either.
- `state`: **`stopped` wins if either side is `stopped`**, else `active`. This is a *monotonic join*, deliberately **not** last-writer-wins. LWW would let a stale "active + renamed" write from a device that hasn't yet pulled the stop **silently un-stop** the project; a monotonic tombstone cannot. The cost is that `stopped` is permanent (no Resume — matches §2; §15 has the clean upgrade path).
- `displayName`: the value from the record with the larger `updatedAt` (tie broken by the lexicographically larger string, a deterministic total order).
- `updatedAt`: `max` of the two.

This merge is commutative, associative, and idempotent (a lattice join over `state × (updatedAt, displayName)`), so **all devices converge regardless of pull order**.

**Fold-on-read is load-bearing, not hygiene — provable against the transport.** The git transport's conflict policy is *remote-wins-canonical*. Concrete failure without folding: device B has local `stopped`, pulls a peer's older `active` → the transport keeps the peer's `active` as the canonical `<name>.json` and shoves B's `stopped` into a conflict-copy file. If B reads only the canonical file it sees `active` and **re-syncs a project the user stopped**. The fold reads the canonical + every conflict copy, applies "`stopped` dominates," and returns the merged record **in memory** — the copy file is left on disk (rare + inert; a future cleanup can prune it). So the in-memory fold is exactly what makes stop correct under the transport we have; no writeback is needed for correctness.

- **Writers:**
  - `createProject` / `importProject` / **backfill** — *create-if-absent* an `active` record with `displayName = name`. Create-if-absent (never rewrite an existing record) is what keeps backfill from (a) churning the Personal watcher every boot and (b) clobbering a peer's synced rename/stop with the bare folder name.
  - **Rename** — upsert `displayName` + bump `updatedAt`, **preserve `state`**.
  - **Stop** — upsert `state = "stopped"` + bump `updatedAt`, **preserve `displayName`**.
- **No single combined `projects.json`** — concurrent adds would textually conflict; per-file keeps unrelated projects independent.

## 5. Registry store module

`sync-spaces/project-registry.ts` owns registry I/O over `Personal/ProjectSync/`, modeled on the Conversation Store's `store-core` (reuse the shared lock/atomic-write/fold helpers where they're generic; supply the project-specific merge above):

- `readProjectRegistry(personalRoot): ProjectRegistryEntry[]` — read every `*.json`, group by canonical name, and **fold conflict copies into their canonical through the merge, in memory only** (no writeback/prune — copy files are left on disk; they're rare, inert, and re-fold identically, so a subsequent read stays correct without a heal step). **Canonical-name disambiguation (review #1):** a file is its OWN canonical whenever its filename equals `${content-name}.json` — this takes precedence over the conflict-copy regex, because a real folder name may itself contain `" (from …)"` (which the Conversation Store's UUID-oriented `CONFLICT_RE` would misread as a copy). **Fail-soft:** a corrupt/partial file or one with an unknown `schemaVersion` is skipped, never thrown (the dev instance and built app share the tree; a half-written peer file must not crash discovery). `lstat`/skip anything that isn't a real regular file.
- `ensureProjectEntry(personalRoot, { name, repoName })` — create-if-absent (`active`, `displayName = name`, `updatedAt = now`). No-op when the file exists (idempotent; no watcher churn; no clobber).
- `setProjectDisplayName(personalRoot, name, displayName)` — locked read-modify-write: set `displayName`, bump `updatedAt`, preserve `state`. Skips the write if `displayName` is unchanged.
- `setProjectStopped(personalRoot, name)` — locked read-modify-write: set `state = "stopped"`, bump `updatedAt`, preserve `displayName`. Skips if already stopped.

The lock (`mutateFileUnderLock`, reused from `store-core`) matters because the dev instance and built app can upsert the same file concurrently. All names are re-checked with the store's safe-segment guard (defense-in-depth; already `validateSyncName`-checked upstream).

## 6. Pure decision core (planner + active-space gate)

`sync-spaces/materialization-planner.ts` — no I/O, unit-tested in isolation (same pattern as `resolveLocalProject`, `buildSavedFolderProjects`, `discoverContext`):

```ts
export function planReconcile(
  registry: ProjectRegistryEntry[],
  localProjectNames: string[],   // folders under ~/YouCoded/Projects/
  liveSpaceNames: string[],      // project spaces the engine currently has live
): { toMaterialize: ProjectRegistryEntry[]; toStop: string[] };

// Spec §7: which spaces the engine should actually run — spaces() minus any
// project whose registry record is `stopped`. Personal is always included.
export function activeManagedSpaces(
  registry: ProjectRegistryEntry[],
  spaces: SyncSpace[],
): SyncSpace[];
```

Rules:
- `toMaterialize` = registry records with `state === 'active'` whose `name` is **not** local (deduped by name). A same-named local project is skipped — it already converges to the same repo via existing `ensureRemote` provisioning + the transport's unrelated-histories merge, so re-materializing would clobber a live folder.
- `toStop` = registry records with `state === 'stopped'` whose `name` currently has a **live** space (the mid-session case: a stop tombstone arriving while the project is running here). A stopped project with no live space needs no action.
- `activeManagedSpaces` = the single place the "don't run a stopped project" rule lives (see §7). Pure, so the whole matrix (missing / already-local / stopped-live / stopped-idle / empty) is tested without touching the filesystem, `gh`, or the engine.

## 7. Reconcile — the IO shell (`service.ts`)

**Materialize** each `toMaterialize` entry by **reusing the empty-folder + first-sync-pull path** — the exact sequence `createProject`/`importProject` already exercise, no `git clone`, no temp dir:

1. **Resolve the remote** — `manager.ensureRemote({ id: 'project:<name>', ... })`. Reuses the already-exists recovery (`gh repo view`), so a peer's repo resolves. Runs FIRST so a `gh`-auth failure creates nothing.
2. **`createProject(name)`** — an empty managed folder (folder name = identity `name`).
3. **`engine.addSpace(space)`** — inits the hidden repo and starts watching, BEFORE the first pull, so a failed pull leaves a live, poll-retriable space rather than an orphan.
4. **`transport.setRemote(space, url)`** then **`engine.syncSpace(space)`** — `pull` adopts the peer's content because a fresh space has an unborn local `main` (`checkout -B main origin/main`, the parent spec's first-sync fix). The engine's `synced` event drives the Sync-panel record.

Seed the local visible label from the registry `displayName` at materialize time is **not** a separate write — see §8's read-time overlay (single source of truth).

**Stop** each `toStop` entry: `engine.removeSpace('project:<name>')` — detach the live space (close watcher, await in-flight sync, drop from the state map) **and keep the folder on disk**. The folder stays under `Projects/`, still listed as a project, still openable; it simply stops syncing.

**The `activeManagedSpaces()` gate is the single enforcement point for "stopped stays stopped."** Every site that iterates `roots.spaces()` to add/sync/back up — `startEngine`'s add loop (`service.ts:127`), the SyncHub `connected` re-sync loop (`:170`), the daily-backup loop (`:233`) — routes through `activeManagedSpaces(readProjectRegistry(personalRoot), roots.spaces())` instead of raw `spaces()`. This is why a stopped project is never re-added on the next boot even though its folder is still physically present. `ManagedRoots.spaces()` stays pure filesystem and unchanged; the policy lives in one helper in the layer that already reads the registry. (Rejected alternatives: filtering at each of the three sites independently — fragile; redefining a "space" by hidden-repo presence — changes core `spaces()` semantics and breaks auto-adoption of manually-dropped folders.)

**`engine.removeSpace(id)` is a new engine method** — the engine currently has only `stop()` (all spaces) and single-flight `syncSpace`. It mirrors the per-space teardown inside `stop()`: clear debounce, `await watcher.close()`, await any in-flight `current` sync (Windows file-handle safety), delete from `states`.

**Failure at any materialize step** (`gh` not authed, disk full, name taken between plan and now): emit an `error` sync event with a plain-language message and stop that entry — an already-created empty space is fine (it retries); nothing half-built is left. Reconcile re-runs on the next boot / enable / SyncHub `connected`.

`runDiscovery` (the reconcile driver) is **single-flight with one coalesced rerun** (mirrors the engine's `syncSpace` guard) so overlapping triggers can't race two `createProject` calls for one name, and it reads the registry **on disk** (the triggers guarantee freshness) rather than syncing Personal itself (which would recurse through the broadcast trigger). Supersession safety: it respects the same `engine !== e` guard the start loop uses, so a disable mid-reconcile bails cleanly.

## 8. Writers, IPC, and the read-time name overlay

**Create / import** (existing handlers `syncSpacesCreateProject` / `syncSpacesImportProject`): after success, `ensureProjectEntry(personalRoot, { name, repoName })`.

**Rename** — new `syncSpacesRenameProject(name, displayName)`: `setProjectDisplayName(...)` then push Personal so peers learn. The Project-View "Rename" flow calls this for a *synced* (managed) project; for a plain local folder it keeps using the existing local `folders.rename` nickname. (Rename is display-only; the folder is never moved.)

**Stop** — new `syncSpacesStopProject(name)`: `setProjectStopped(...)`, push Personal, then locally `engine.removeSpace('project:<name>')`. The folder and its saved-folder entry remain; the project is now a plain local folder.

**IPC parity** — `syncSpacesStopProject` and `syncSpacesRenameProject` ride the four-surface parity (`preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, `SessionService.kt`) + `remote-server.ts`, with the Android handler a `{ ok: false, error: 'not-implemented-on-mobile' }` stub (the sync-spaces-1a pattern). Pinned by `ipc-channels.test.ts`.

**Read-time name overlay — one source of truth, no writeback.** The synced `displayName` is **not** copied into the local `youcoded-folders.json`. Instead the sync-spaces status/spaces payload gains per-project `displayName` + `state`, and the Project View / ProjectSwitcher / FolderSwitcher rows **overlay** that onto the folder row at read time (the same way `buildSavedFolderProjects` already overlays central-index data). Precedence: a synced project shows its registry `displayName`; a plain local folder shows its existing nickname/folder name. This deletes a whole class of two-store name-drift bugs (the Resume Browser precedent) and removes any "relabel" reconcile action — the label is simply read from the authoritative registry.

## 9. Where discovery / reconcile runs

Reconcile hooks the points that already exist in `service.ts`, always **after** the Personal space has synced (its pull brings the latest registry):

- **`startEngine`** (boot when enabled, and enable-toggle): add loop uses `activeManagedSpaces()`; then **await** a fresh Personal `syncSpace` (registry current), run **backfill** (`ensureProjectEntry` for each local project), then `runDiscovery`.
- **SyncHub `connected` handler**: the reconcile-on-connect re-sync loop uses `activeManagedSpaces()`; also call `runDiscovery` (retries a project a prior materialize missed, and applies any stop tombstone pulled while disconnected).
- **`broadcast` on Personal `synced` + `updated:true`**: a Personal pull that APPLIED changes may have added/renamed/stopped registry records — `runDiscovery`. This is what makes a project created/renamed/stopped on device A reflect on device B within seconds during a live session (A pushes → SyncHub signal → B pulls Personal → `updated:true` → reconcile), without waiting for reconnect or the poll.
- **Daily-backup loop**: uses `activeManagedSpaces()` (a stopped project is no longer a managed sync space).

## 10. UI

- **Project View hero gains a "Stop syncing" button** for synced projects, behind a plain-language consequence confirm: *"Stop syncing '<name>'? The folder stays on all your devices, but changes will no longer sync between them. This can't be undone from here."* (Consequence-gated, per the destructive-UI convention.) On confirm → `syncSpacesStopProject`.
- **Hero "Rename"** is wired to `syncSpacesRenameProject` for synced projects (propagates); unchanged for local folders.
- **Sync status surfaces `stopped`.** `sync-dot-state.ts` gains a "stopped / not syncing" presentation (gray dot, "Sync stopped" label) so a stopped project reads as detached, not errored. ProjectSwitcher hides the sync affordances for stopped rows. **This status dot is the minimum in-scope UI** — it's what makes Stop legible and distinguishes a synced project from a stopped one at a glance.
- Rows everywhere render the overlaid `displayName` (§8).

**Deferred to a UI follow-up (see §15) — not blocking the core feature:** Project View should explicitly distinguish, in plain end-user language, the three kinds of row a user will see — **YouCoded project, syncing** · **YouCoded project, not syncing** · **external folder** (a folder outside `~/YouCoded/Projects/`). Likely a small grouping/label treatment plus an `(i)` explainer so a non-technical user understands why a project sits in `Projects/` but isn't syncing (location ≠ status; the dot is the truth). Do this once the underlying discover/rename/stop plumbing is working and dogfooded — the status dot covers legibility until then.

## 11. Failure modes & transparency

| Situation | Behavior |
|-----------|----------|
| First materialize pull fails (offline) | `error` event in Sync panel; empty space stays live, re-syncs on 120s poll / next connect |
| `gh` not authenticated | Plain-language `error` (reuses `provisionGithubRemote` message shape); nothing created (ensureRemote first) |
| Same name already local | Skipped by the planner (converges via existing provisioning) |
| Registry file corrupt/partial/unknown-schema | Skipped by fail-soft read; other records still processed |
| Conflict copies exist for a record | Folded on read via the field-wise merge; canonical healed |
| Stop tombstone arrives while project live here | `toStop` → `engine.removeSpace`; folder kept |
| Stop pulled while this device was offline | Applied on next boot (`activeManagedSpaces` gate) or connect (`runDiscovery`); never re-added |
| Concurrent rename on two devices | LWW by `updatedAt` (tie → deterministic); converges |
| Rename on a device that hasn't pulled a stop | Merge keeps `stopped` (dominates) + the newer label; never un-stops |
| Raw OS-delete of an active synced folder | Sync restores it (documented; "Stop syncing" is the sanctioned detach) |

## 12. Why rename & stop are designed in now, not bolted on later

The immutable-add-only design bought its simplicity entirely by disallowing mutation. Retrofitting rename/stop afterward would mean re-deriving identity (so a rename doesn't orphan the repo — solved here by making the folder name a permanent identity and renaming only a display field), swapping the storage model from immutable to convergent, and adding a tombstone + fold pass — i.e. touching every part of the store at once. Building the convergent record from the start is strictly less churn and avoids a data-format migration on already-synced registries.

## 13. Testing strategy

- **Pure core** (`materialization-planner.ts`): `toMaterialize` (missing/active), skip already-local, `toStop` (stopped + live only, not stopped-idle), dedup, empty; `activeManagedSpaces` excludes stopped project spaces and always keeps Personal.
- **Registry store** (`project-registry.ts`): create-if-absent no-op on existing (no churn, no clobber); `setProjectDisplayName`/`setProjectStopped` bump `updatedAt` only on change and preserve the other field; field-wise merge — `stopped` dominates regardless of `updatedAt`, `displayName` LWW with deterministic tie; **fold** collapses conflict copies to the merged canonical **in memory** (copies left in place); a paren-named project (`"X (from Y)"`) is not misread as a conflict copy; fail-soft on corrupt/unknown-schema.
- **Engine** (`engine.ts`): `removeSpace` closes the watcher, stops syncing that space, awaits in-flight, and leaves other spaces untouched.
- **Service integration** (fake transport + engine, stateful `ManagedRoots` mock + `project-registry` mock): create/import writes a record; rename writes `displayName` + pushes; stop writes the tombstone + pushes + removes the space; discovery materializes a missing active project and skips existing; the `activeManagedSpaces` gate keeps a stopped project out at boot; a materialize failure emits an `error` and adds no space; supersession (disable mid-run) adds nothing to a dead engine.
- **Convergence** (two managed roots on real bare remotes, mirroring `sync-spaces-two-device.test.ts`): A creates + renames + pushes → B pulls the registry (proving `ProjectSync/` actually syncs), materializes with the **synced display name**; A stops → B drops the live space but keeps the folder + files, and a follow-up boot does **not** respawn it.

## 14. File plan (informs the implementation plan)

- **New:** `desktop/src/main/sync-spaces/project-registry.ts` — convergent store (§4a/§5), `ProjectRegistryEntry` type, `PROJECT_REGISTRY_SCHEMA`, field-wise merge, fold/heal.
- **New:** `desktop/src/main/sync-spaces/materialization-planner.ts` — pure `planReconcile` + `activeManagedSpaces` (§6).
- **Modify:** `desktop/src/main/sync-spaces/engine.ts` — add `removeSpace(id)`.
- **Modify:** `desktop/src/main/sync-spaces/service.ts` — writers (create/import/rename/stop), `backfillRegistry`, `runDiscovery`, `materializeProject`, route the three `spaces()` sites through `activeManagedSpaces`, three triggers, `displayName`/`state` in the spaces payload.
- **Modify (IPC parity):** `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, `remote-server.ts`, `SessionService.kt` (stub) — `syncSpacesStopProject`, `syncSpacesRenameProject`.
- **Modify (renderer):** Project View hero ("Stop syncing" + rename wiring), `sync-dot-state.ts` (stopped state), row overlays for `displayName`.
- **New tests:** `materialization-planner.test.ts`, `project-registry.test.ts`, `sync-spaces-project-discovery.test.ts`; additions to `sync-spaces-service.test.ts`, `engine` tests, `ipc-channels.test.ts`.
- **Docs:** `docs/PITFALLS.md` Sync Spaces entry; update handoff A00/A01; clear the knowledge-debt entry.

## 15. Deliberate future work (out of scope, clean upgrade paths)

- **Resume syncing a stopped project.** `stopped` is a permanent tombstone here (monotonic, so a stale rename can't un-stop it). Safe reactivation needs to distinguish an intentional resume from a stale `active` write — the clean way is a **per-field timestamp on `state`** (or a monotonic generation counter): resume bumps it above the stop's, a stale rename never writes `state` at all. A contained one-field schema bump when/if Resume is wanted.
- **True on-disk folder rename.** Renaming the physical folder is a coordinated multi-device folder move + transcript-slug/artifact-sidecar/central-index remap (the `import-project` remap machinery, times N devices, with live-session hazards). Display-name rename covers the "same name everywhere" requirement without it.
- **Remote GitHub repo cleanup on stop.** The provisioned repo is orphaned, not deleted (destructive cross-account action). A future "delete remote too" opt-in could clean it up.
- **Project View three-category UI** (§10 "Deferred"): plain-language grouping of *YouCoded project, syncing* / *YouCoded project, not syncing* / *external folder*, with an `(i)` explainer. Deferred until the discover/rename/stop feature works and is dogfooded; the status dot is the interim legibility. Design decision 2026-07-13: fine to keep synced + unsynced projects together in `Projects/` as long as the dot and (eventually) this labeling make the distinction obvious.

## 16. Resolved during design

1. **Materialize via `createProject` + first-sync `pull`, NOT `git clone`** (§7) — verified against `git-transport.ts` (`checkout -B main origin/main` on unborn `main`).
2. **Registry at `Personal/ProjectSync/`** (§4) — Conversation-Store layout, sidesteps git-ignored `.youcoded/`.
3. **Synced display name (not per-device nickname)** — a user must always see the same name on every device (product decision 2026-07-12). This is what turns the registry into a convergent record and justifies mirroring `store-core`.
4. **Stop = detach + keep local everywhere; `stopped` dominates the merge; no Resume in scope** — a monotonic tombstone is the only rule that survives a concurrent stale rename (§4a). No folder move (gate-in-place via `activeManagedSpaces`).
5. **Single source of truth for the display name via read-time overlay, not writeback** (§8) — avoids two-store name drift.
6. **`engine.removeSpace` + one `activeManagedSpaces` gate** rather than per-site filters or a `spaces()` semantics change (§7) — grounded in the actual three `spaces()` call sites and the absence of a per-space remove.
