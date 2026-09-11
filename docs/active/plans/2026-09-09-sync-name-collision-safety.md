---
status: draft
---
# Sync project-name collision safety — small non-UI batch

## Contract

Prevent **new create/import destinations** whose names equal an existing sibling project or a different registry identity after JavaScript `toLowerCase()`. Check before mkdir, move/copy, remaps, registry writes, engine attachment or remote provisioning. Preserve spelling, existing files, move semantics, sync features, registry schema/folding and `repoNameForSpace`'s slug + lowercased SHA-1 suffix. Do not merge, delete or rename existing collisions. No new UI, IPC shape, dependency or migration.

This is a local-known-name gate, not a distributed uniqueness transaction: offline peers and external processes can still introduce collisions. Do not claim cross-process atomicity from a preflight/recheck.

## Verified starting points

Paths below are relative to `youcoded/desktop/`.

- `src/main/sync-spaces/managed-roots.ts`: `createProject` validates, checks only `existsSync(exactPath)`, then mkdir; `listProjects` lists directories but suppresses read errors.
- `import-project.ts`: `checkImport` checks the exact destination; `importProjectFolder` calls it before moving and remapping four stores. `moveFolder` has an additional exact-destination check before EXDEV copy. Preserve that guard and its cleanup boundary.
- `service.ts`: `syncSpacesCreateProject` and `syncSpacesImportProject` register after local mutation, then attach/provision. Electron `ipc-handlers.ts` and `remote-server.ts` both call these functions. No bridge edits needed.
- `project-registry.ts`: `readProjectRegistry` folds copies in memory by **case-sensitive canonical filename**; `ensureProjectEntry` is exact-file create-if-absent. Never change its folding key to lowercase: that would silently merge existing identities. `guards.ts` already has pure `validateSyncName` and `findCaseCollisions`.
- `space-manager.ts:repoNameForSpace` and `tests/sync-spaces-space-manager.test.ts` explicitly require `Foo` and `foo` to share a remote; `My App` and `My-App` must remain distinct.
- Existing error plumbing: `components/project-view/AddProjectModal.tsx` and `components/ImportProjectModal.tsx` show returned `error` inline. Use that surface, not a new control.

## Implementation sequence

1. **Pure comparison in `guards.ts`:** add `findSyncNameCollision(name, existingNames, { allowExact }) -> string | null` (returns the conflicting original spelling). Compare only `toLowerCase()`, never slug, locale collation, displayName, trim or Unicode normalization. With `allowExact`, ignore identical strings but continue scanning for differently-cased matches. Add a WHY comment linking comparison to the unchanged remote identity. Leave `validateSyncName`'s syntax contract unchanged.
2. **Small shared I/O gate:** add `src/main/sync-spaces/project-name-availability.ts` exporting `checkProjectNameAvailable({ name, projectsRoot, personalRoot }) -> string | null`. Run syntax validation first; retain exact destination existence rejection (including files); enumerate sibling directory names, reject equivalent names with `allowExact: false`; read folded registry entries and reject equivalent **different spellings**, active or stopped, with `allowExact: true`. Do not use `displayName` or compare slugs. Return existing duplicate error for exact local names; case conflict: `A project named "Foo" already uses this name for sync. Choose a different name.` Do not create directories while checking. For sibling enumeration, missing Projects means empty; other read failures must fail closed with an accurate inability-to-check message, not `listProjects()`'s empty-on-error behavior. Keep the registry reader's existing corrupt/unknown-schema fail-soft behavior explicit; this batch does not repair malformed registry files or promise detection of unreadable records.
3. **Gate actual operations, not just UI preflight:**
   - `ManagedRoots.createProject`: call the shared gate with its existing roots before mkdir. This protects service creation and direct callers. Keep `spaces()` and `listProjects()` behavior unchanged.
   - `checkImport`: replace the exact-destination-only check with the shared gate, deriving Personal from `path.join(youcodedRoot, 'Personal')` (the existing ManagedRoots layout); preserve source/containment/live-session/count checks and result shape.
   - `importProjectFolder`/`moveFolder`: refresh availability immediately before rename, after the potentially lengthy file count; refresh again in the EXDEV branch before cpSync. Pass the roots/name check context into the private move helper rather than adding registry state to IPC. Preserve the exact-path check, error handling, source deletion-on-success and remap warnings. All collision refusals return before source/store mutation.
   - Service create/import remain the same orchestrators; do not add a second registry writer or normalize the supplied name. Tests must prove their lower-level refusal prevents registration, addSpace, transport init/setRemote and ensureRemote.
4. **Narrow discovery consequence:** `service.ts:materializeProject` currently calls `ensureRemote` BEFORE `roots.createProject`. Since createProject gains a gate, call the same availability gate before ensureRemote as well and throw its error into `runDiscovery`'s existing per-project error event. Keep remote-before-mkdir ordering for permitted projects. Recheck after the await via createProject as today. If creation is refused at that point, surface its actual error instead of the current silent return. An exact registry entry is permitted, so ordinary discovery still works. This prevents provisioning a destination already known to collide; it is not a full existing-collision attachment fix.

### Exact stopped-name policy — explicitly not reactivation

With no local destination, an **exact** registry name is currently allowed by create/import; `ensureProjectEntry` preserves its canonical stopped record. Keep that local-creation permission, and reject a case variant even when the existing registry entry is stopped. Exact active registry names likewise remain allowed (existing same-project materialization semantics).

**Flag, do not silently fix:** create/import currently attach directly when the engine is running, without the stopped gate used at boot by `activeManagedSpaces`. Thus exact stopped-name local creation can transiently attach despite retaining its tombstone. That is a separate stopped/reactivation policy bug, not permission to reject all stopped names, resume them, or change attachment semantics in this collision batch. Add a characterization test and report this boundary. A folded stopped conflict copy must not be removed or rewritten by this work.

## Tests / acceptance

Extend actual suites, not source-text-only assertions:

- `tests/sync-spaces-guards.test.ts`: mocked name lists for Foo/foo, exact-match allow/deny, exact plus variant (must not stop at exact), unrelated names, non-ASCII lowercase pairs, and slug-equivalent but case-distinct names allowed. These run on Windows without requiring case-sensitive directories.
- New `tests/sync-spaces-project-name-availability.test.ts`: temp Projects/Personal; folder-only collision, registry-only active/stopped variants, exact registry active/stopped allowed, malformed record behavior unchanged, unreadable sibling list refused. Mock directory/registry lists to represent existing Foo+foo portably; assert both remain present and no writes occur.
- `tests/sync-spaces-managed-roots.test.ts`: create Foo, reject foo without mkdir or registration; exact duplicate remains rejected; an unrelated project still succeeds. On a case-sensitive temp filesystem explicitly assert `existsSync(foo) === false` before the attempted creation so Linux coverage cannot pass solely through the old exact-path guard. Use a capability probe/conditional case-sensitive assertion, not a Windows failure. Retrying temp-dir teardown.
- `tests/sync-spaces-import.test.ts`: use its existing full fake-home fixture (source content, saved folders, central index, sidecar, transcript dir). Reject sibling and registry variants through both checkImport and actual import; compare source/store bytes and destination listing unchanged. Introduce a conflict after preflight via mocked list results, plus an EXDEV injection with a newly conflicting sibling; assert no cpSync/rmSync/remaps on refusal. Keep successful move/remap and warning tests.
- `tests/sync-spaces-service.test.ts`: its ManagedRoots mock currently rejects exact matches only, and its repoName stub is case-sensitive. Do not mistake these mocks for production coverage. Add a partial-real availability/lower-level path or a separate isolated service fixture; use mocked lists for Windows portability and spies on writes/provisioning. Exercise create AND import, sync enabled AND disabled, registry-only variants, ordinary success, and characterize exact stopped local creation. Clear boot/backfill calls before operation assertions. Test discovery collision produces an existing error event and no provisioning, while ordinary materialization survives.
- `tests/project-registry.test.ts` (the store-I/O suite, not just `sync-spaces-project-registry.test.ts`): retain exact ensure idempotence, renamed/stopped bytes, conflict-copy folding and parenthesized names. No schema/merge/writer policy change is required for this batch; the gate must precede these writers in new create/import flows.
- Keep `tests/sync-spaces-space-manager.test.ts` identity assertions unchanged. Run discovery/planner regressions too. In an isolated verifier checkout, remove each new guard and demonstrate its regression fails; never mutate another writer's worktree.

Implementation verification, from the workspace root (not performed as implementation in this planning task):

```bash
(cd youcoded/desktop && npx vitest run tests/sync-spaces-guards.test.ts tests/sync-spaces-project-name-availability.test.ts tests/sync-spaces-managed-roots.test.ts tests/sync-spaces-import.test.ts tests/sync-spaces-service.test.ts tests/project-registry.test.ts tests/sync-spaces-project-registry.test.ts tests/sync-spaces-space-manager.test.ts tests/sync-spaces-project-discovery.test.ts tests/materialization-planner.test.ts)
bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/sync-safety-audit-20260908/youcoded
```

No live app, network provisioning or interactive verification needed. Remote browser calls share the desktop service; no Android implementation/parity change is claimed by this desktop-only batch.

## Separate batch: existing ambiguous attachment

Defer full discovery/startup safety rather than suggesting the new-name gate repairs existing collisions. `planReconcile` and `activeManagedSpaces` use exact-case sets; startup can attach existing Foo/foo before discovery. A focused follow-up can compute ambiguous groups from the union of local and registry names, skip **all** members before attachment/backfill/provisioning, and emit truthful existing error events (no winner selection or content changes). It must also cover already-live spaces and hub routing (`spaceForKey` currently selects the first matching remote). A guard only in discovery is insufficient. Do not implement automatic detach/repair here.

## Planning verification performed

Read the named implementation and test fixtures. Ran the existing baseline only:

```bash
cd youcoded/desktop && npx vitest run tests/sync-spaces-managed-roots.test.ts tests/sync-spaces-import.test.ts tests/project-registry.test.ts tests/sync-spaces-space-manager.test.ts tests/sync-spaces-service.test.ts
```

Actual result: `Test Files 5 passed (5)`; `Tests 83 passed (83)`; duration `692ms`. Full output: `/tmp/sync-name-plan-baseline.log`. This verifies the starting baseline, not the proposed fix. No app edits, commits or live-app actions in this planning task.
