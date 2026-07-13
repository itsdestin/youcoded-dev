# Cross-Device Project Auto-Discovery — Design

- **Date:** 2026-07-12
- **Status:** Approved design, pending implementation plan
- **Parent spec:** `docs/superpowers/specs/2026-07-03-cross-device-sync-design.md` (§3 "enable Sync and everything appears", §8 materialization, §10a device-registry pattern)
- **Fills:** the release-gating gap recorded in `docs/superpowers/2026-07-10-sync-completion-handoff.md` §2 item **A00** and `docs/knowledge-debt.md`
- **Precedes:** Plan 2b (leases + `devices.json` device registry), Plan 2c (legacy demolition)

## 1. Motivation

The cross-device sync pitch (parent spec §3) is *"turn on Sync and your projects, files, and conversations are on every device."* Conversations deliver on that — they ride the **Personal** space, which exists and syncs on every device unconditionally. **Projects do not.** A device's synced spaces are derived purely from the filesystem: `ManagedRoots.spaces()` returns the Personal space plus one space per folder physically present under `~/YouCoded/Projects/`. There is no notion of "a project that exists in the sync group but isn't on this device," so a project synced on device A never appears on device B, and a `space-updated` SyncHub signal for an unknown project is silently dropped (`service.ts`: `spaceForKey` returns null → no-op).

This was specced as vision (parent §3) but never decomposed into a plan — it fell through the crack between the vision and the phased plans. Under the standing release gate ("no release until sync is entirely complete"), a two-device user whose projects don't appear is a broken core feature. This design closes the gap.

## 2. Goals & non-goals

**Goals**
- A project synced on any device **silently appears** (folder created, repo cloned, live-syncing) on every other device in the sync group, with no user action.
- Discovery is **convergent and offline-tolerant**: two devices that each create projects while apart both end up with the union.
- The visible record of "what happened" lives in the existing Sync panel — nothing is truly invisible.

**Non-goals (this design)**
- **Per-device selective sync** (choosing that a given project lands on only some devices). Silent materialization means every synced project lands on every device. Deferred; would be a later feature if wanted.
- **Un-sync / removal propagation** (removing a project from the sync group on all devices). No un-sync flow exists yet; the registry is add/update-only.
- **Rename propagation.** Folder rename changes the sync identity (`repoNameForSpace` derives from the name) and is already deferred in the picker UX. Out of scope here.
- **Android.** Desktop-first, consistent with the rest of sync (Android is Phase 3). The registry format is platform-neutral so the Android engine can consume it unchanged later.

## 3. Why a registry, not `gh repo list`

`repoNameForSpace` slugifies and then appends a SHA-1 hash of the **lowercased** project id: `youcoded-sync-project-<slug>-<sha8>`. This is deliberately lossy and one-way (parent §7 / `space-manager.ts` comment) so distinct folder names always get distinct repos and weird names still get a valid repo. **The transform cannot be reversed** — from a repo name you cannot recover the real folder name (`My App` and `my-app` both slug to `my-app`; the hash disambiguates the repo but not the display name). Enumerating the account's repos by prefix would tell a device *that* projects exist but not what to **name their folders**.

So the source of truth is an explicit **registry that stores the real folder name alongside its repo name**, synced through a channel that already works on every device: the Personal space.

## 4. The registry — one file per project

Location: `~/YouCoded/Personal/ProjectSync/<name>.json`

```json
{
  "schemaVersion": 1,
  "name": "cookingonlowheat",
  "repoName": "youcoded-sync-project-cookingonlowheat-3f9a1c2b"
}
```

- **Visible `ProjectSync/` folder, mirroring the Conversation Store** (`~/YouCoded/Personal/Conversations/<provider>/<id>.json`). That per-file-under-Personal layout is the established pattern for a record set synced in Personal, so the registry follows it instead of inventing a hidden control dir. Crucially, this sidesteps the reserved `.youcoded/` basename — that name is BOTH the git transport's hidden git dir (`<root>/.youcoded/sync.git`) AND a `DEFAULT_IGNORES` entry, so anything under it silently never syncs. (Location resolved 2026-07-12 after the initial `.youcoded/projects/` sketch would have been git-ignored.)
- **Entries are immutable + deterministic — `{ schemaVersion, name, repoName }`, no provenance.** `repoName` is a pure function of `name` (`repoNameForSpace`), so two devices adding the *same* project write **byte-identical** files → git never conflicts; two devices adding *different* projects touch *different* files → clean union. This is what makes the registry conflict-free. It is ALSO why the registry deliberately reuses **none** of the Phase-2a Conversation Store's merge/heal engine (`mergeRecords`, `foldConflictCopies`, `mutateFileUnderLock`, the `laterOf` tiebreak): that machinery exists to converge MUTABLE records whose fields both devices update; project entries never mutate. The registry borrows only the store's *hygiene* — visible per-file layout, fail-soft parse, a `schemaVersion` for forward-compat, atomic temp+rename writes. Earlier drafts carried `addedBy`/`addedAt`; they were dropped because nothing consumed them AND they were the only fields that could differ between devices and cause a file conflict. Adding provenance back later is a one-field schema bump. A single combined `projects.json` is likewise rejected — concurrent adds would textually conflict.
- **Writers** (add/update only):
  1. `createProject(name)` — new managed project.
  2. `importProject(...)` — a folder moved into management.
  3. **Backfill on enable** — a one-time pass that writes a registry file for every project already present under `Projects/` on this device, so pre-existing projects (created before this feature, or created while sync was off) enter the registry the first time sync runs.
- **No removal semantics.** Un-sync and rename are deferred (see §2), so nothing deletes or renames registry files. A project, once registered, stays discoverable.

## 5. Registry store module

A small store (`sync-spaces/project-registry.ts`, ~40 lines) owns registry I/O over `Personal/ProjectSync/`:

- `readProjectRegistry(personalRoot): ProjectRegistryEntry[]` — read every `*.json` under `ProjectSync/`. **Fail-soft:** a corrupt/partial file, or one written by an unknown `schemaVersion`, is skipped — never thrown (the dev instance and built app share the tree; a half-written peer file must not crash discovery). `lstat`/skip on anything that isn't a real regular file.
- `writeProjectRegistry(personalRoot, { name, repoName })` — stamps `schemaVersion`, then atomic temp-file + rename write of one entry. Idempotent: an identical rewrite (byte-compared) is skipped so a boot-time backfill doesn't churn the Personal watcher every launch. Refuses an unsafe `name` (defense-in-depth; names are already `validateSyncName`-checked upstream).

Writes are atomic (temp + rename) for the same shared-tree reason the existing `SpaceManager.write` and `saved-folders.writeFolders` are. No read-modify-write lock (`mutateFileUnderLock`) is needed — entries are write-once and whole-file, not incrementally mutated.

## 6. The materialization planner (pure)

The decision of *what to do* is a pure function with no I/O, unit-tested in isolation (same pattern as `resolveLocalProject`, `buildSavedFolderProjects`, `discoverContext`):

```ts
// input: registry entries (from the synced Personal space) + names of projects
//        already present locally under ~/YouCoded/Projects/
// output: the projects this device must materialize (missing locally)
export function planMaterialization(
  registry: ProjectRegistryEntry[],
  localProjectNames: string[],
): ProjectRegistryEntry[]
```

Rules:
- A registry entry whose `name` is **not** in `localProjectNames` → materialize.
- A registry entry whose `name` **is** already local → skip. (A same-named local project already converges to the same repo through existing `ensureRemote` provisioning + the transport's unrelated-histories merge — materializing again would clobber a live folder.)
- Dedup by `name` (defensive; per-file storage already guarantees uniqueness).

Keeping this pure means the tricky cases (missing, already-local, empty registry, duplicate) are tested without touching the filesystem, `gh`, or the engine.

## 7. Materialization (the IO shell)

For each planned entry, in `service.ts` (it owns the engine singletons), materialize by **reusing the empty-folder + first-sync-pull path** — the exact sequence `createProject` and `importProject` already exercise, no `git clone`, no temp dir:

1. **Resolve the remote** — `manager.ensureRemote({ id: 'project:<name>', ... })`. Reuses the existing already-exists recovery, so a peer's repo (or one this device provisioned before losing its state file) resolves via `gh repo view`. Runs FIRST so a `gh`-auth failure creates nothing.
2. **`createProject(name)`** — an empty managed folder.
3. **`engine.addSpace(space)`** — inits the hidden repo (`<root>/.youcoded/sync.git`) and starts watching. Done BEFORE the first pull so that even if the pull fails, the folder is a live, poll-retriable space rather than an orphan.
4. **`transport.setRemote(space, url)`** then **`engine.syncSpace(space)`** — the transport's `pull` adopts the peer's content because a fresh space has an unborn local `main`, and `pull` checks out `origin/main` wholesale in that case (`checkout -B main origin/main`, the parent spec's first-sync convergence fix). The engine's own `synced` event then fires for the new space, driving the Sync-panel record (+ optional toast).

**Why no temp `.materializing` dir / complete-then-register:** that guard only mattered for the `git clone` approach, whose failure mode is a partial-clone directory. This approach has no such artifact — a failed initial pull leaves an *empty but valid* space that the 120s poll / next connect re-syncs. Ordering (ensureRemote → createProject → addSpace → pull) is the safety, not a temp dir.

**Failure at any step** (`gh` not authed, disk full, name taken between plan and now): emit an `error` sync event with a plain-language message and **stop** — an already-created empty space is fine (it retries); nothing half-built is left. Discovery re-runs on the next boot / enable / SyncHub `connected`. Matches the engine's existing "errors surface as events, the poll/reconnect is the retry" contract.

*(Resolved 2026-07-12: the initial sketch's `git clone` + temp-dir approach was dropped in favor of this — it reuses fully contract-tested code and needs no clone-then-adopt logic. See §12.)*

## 8. Where discovery runs

Discovery hooks the points that already exist in `service.ts`, always **after** the Personal space has been synced (its pull is what brings the latest registry):

- **`startEngine`** (app boot when enabled, and enable-toggle): after the per-space loop, **await** a fresh Personal-space `syncSpace` (so the registry on disk is current), run **backfill**, then `runDiscovery`. New projects get added to the same engine instance.
- **SyncHub `connected` handler**: the existing reconcile-on-connect already re-syncs every space; also call `runDiscovery` (retries any project a prior materialize missed).
- **`broadcast` on Personal `synced` + `updated:true`**: a Personal-space pull that APPLIED changes may have added registry entries — reconcile. This is what makes a project created on device A appear on device B within seconds during a live session (A pushes → SyncHub signal → B pulls Personal → `updated:true` → `runDiscovery`), without waiting for a reconnect or the poll.
- **Backfill** runs once inside `startEngine` before discovery: register every local project (idempotent — identical rewrites are skipped) so this device's projects enter the registry.

`runDiscovery` is **single-flight with one coalesced rerun** (mirrors the engine's `syncSpace` guard) so overlapping triggers can't race two `createProject` calls for one name, and reads the registry **on disk** (the triggers guarantee freshness) rather than syncing Personal itself (which would recurse through the broadcast trigger). Supersession safety: discovery respects the same `engine !== e` guard the start loop uses, so a disable mid-materialization bails cleanly (no `addSpace` onto a dead engine).

## 9. Failure modes & transparency

| Situation | Behavior |
|-----------|----------|
| First pull fails (network/offline) | `error` event in Sync panel; the empty space stays live and re-syncs on the 120s poll / next connect |
| `gh` not authenticated | Plain-language `error` (reuses `provisionGithubRemote`'s "Not signed in to GitHub" message shape); nothing created (ensureRemote runs first) |
| Same name already exists locally | Skipped by the planner (converges via existing provisioning) |
| Registry file corrupt/partial/unknown-schema | Skipped by the store's fail-soft read; other entries still processed |
| Name taken between plan and createProject (TOCTOU) | `createProject` returns not-ok; treated as already-present (idempotent no-op) |
| Two devices create same-named project | Byte-identical registry file + deterministic repo → converge; no conflict |
| Two devices create different projects offline | Per-file registry unions cleanly; each device materializes the other's |

## 10. Testing strategy

- **Pure planner** (`planMaterialization`): missing → materialize; already-local → skip; empty registry → []; duplicate names deduped; backfill set correct. No I/O.
- **Registry store**: per-file write→read round-trip; corrupt-file tolerance (one bad file doesn't sink the read); atomic write leaves no partial file visible.
- **Service integration** (fake transport + fake/real engine): discovery calls the materialize path for missing projects and skips existing ones; a materialize failure (e.g. `ensureRemote` rejects) emits an `error` event and adds no space; supersession (disable mid-run) adds nothing to the dead engine.
- **Convergence** (two managed roots pointed at real bare remotes, mirroring `sync-spaces-two-device.test.ts`): device A registers + pushes a project → device B pulls the registry (proving `ProjectSync/` actually syncs), plans, and materializes it → both `roots.listProjects()` agree and the peer's file is on B.

## 11. File plan (informs the implementation plan)

- **New:** `desktop/src/main/sync-spaces/project-registry.ts` — registry store (§5) + `ProjectRegistryEntry` type + `PROJECT_REGISTRY_SCHEMA`.
- **New:** `desktop/src/main/sync-spaces/materialization-planner.ts` — pure `planMaterialization` (§6).
- **Modify:** `desktop/src/main/sync-spaces/service.ts` — `backfillRegistry` + `runDiscovery` + `materializeProject` wiring in `startEngine`, the SyncHub `connected` handler, and `broadcast` (§7, §8); registry writes in `syncSpacesCreateProject` / `syncSpacesImportProject`.
- **New tests:** `desktop/tests/materialization-planner.test.ts`, `desktop/tests/project-registry.test.ts`, `desktop/tests/sync-spaces-project-discovery.test.ts`, and additions to `desktop/tests/sync-spaces-service.test.ts`.
- **Docs:** a `docs/PITFALLS.md` entry under Sync Spaces (registry at `ProjectSync/` not `.youcoded/`; immutable entries → no `store-core` reuse; materialize via first-sync-pull; discovery runs after Personal sync); update the handoff A00 status and clear the knowledge-debt entry when shipped.

## 12. Resolved during planning

1. **Materialize via `createProject` + first-sync `pull`, NOT `git clone`** (§7). Verified against `git-transport.ts`: `pull` checks out `origin/main` on an unborn local `main`, so the empty-folder path fully adopts a peer's content with no clone-then-adopt logic and no temp dir.
2. **Registry at `Personal/ProjectSync/`, immutable `{schemaVersion,name,repoName}` entries, no `store-core` reuse** (§4/§5). Follows the Conversation Store's layout convention (sidestepping the git-ignored `.youcoded/`); deterministic entries make conflicts structurally impossible, so the merge/heal engine is unnecessary.

## 13. Open question (non-blocking)

- **Toast vs Sync-panel-only** for a newly materialized project. Design assumes both (a `synced` event already drives the panel; a toast is a small addition). If toasts feel noisy on a first-run device that materializes ten projects, batch into one "Added N projects from your other devices" — decide during implementation.
