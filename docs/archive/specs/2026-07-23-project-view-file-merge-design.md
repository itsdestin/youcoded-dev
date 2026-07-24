---
status: shipped
date: 2026-07-23
amended: 2026-07-23 (External Artifacts section DESCOPED after live review — see banner)
shipped: 2026-07-24 (youcoded PR #247, merge b0f990b9 — External Artifacts section NOT shipped, see banner)
owner: Destin (decisions) / Claude (spec)
scope: youcoded/desktop (renderer + main), youcoded/app (Android parity)
---

# Project View — merge Artifacts into a single Files tab

> **AMENDMENT 2026-07-23 — the `External Artifacts` section was removed and rule 4
> was reverted, after Destin tested the branch in a dev instance.** Measured
> against his real sidecar the section was ~95% incidental noise (163 scratchpad
> temps, 37 other-device Windows paths, 19 `.claude/` internals; ~8 genuinely
> useful) — because "Claude edited a file outside the project folder" happens
> constantly and incidentally, which is exactly why the original rule required a
> manual pin. `manualIncludes` was 0, so the pre-flip rule would have shown an
> empty section and the post-flip rule showed garbage; neither was worth a
> section. **What the branch actually ships:** ONE `Files` tab = the on-disk
> `Project Files` walk only; `+ Add file` Move/Copy import; the data-safety
> fixes. Externals live in the Session Drawer (per session), their correct home.
> `visible-artifacts.ts` rule 4 is back to "externals hidden unless pinned".
> **Everything below about the `External Artifacts` section, the rule-4 flip
> (§3), the section rendering (§5.1), root-only placement, and `Exclude`
> scoping (§5.3) is SUPERSEDED** — read it as the road not taken. §2's "four
> crescent items" argument is what motivated the section; the crescent turned
> out not to be worth surfacing. The rest (tab merge, §6 Move/Copy import,
> §7 Android, §8 testing) stands.

## 1. Problem

Project View's segmented control offers four tabs: `Artifacts | All files |
Conversations | Context` (`ProjectView.tsx:498`). The first two both show files
from the same project, and the overlap between them is large enough that the
split reads as redundant — the UI needs a hover `(i)` explainer just to describe
the difference (`ProjectView.tsx:652`).

The split is not *purely* redundant, which is why it needs a design rather than a
deletion. `Artifacts` (`artifacts:list-project`) lists sidecar-tracked records;
`All files` (`artifacts:list-all-files`) walks the project folder and is
explicitly "independent of the sidecar" (`ipc-handlers.ts:3006`). Four things
live in Artifacts that the disk walk structurally cannot produce:

1. **External pins.** Sidecar records with `kind: 'external'` — files outside
   the project folder, pinned via `+ Add file`. The walk only covers the project
   root.
2. **Version history.** Discovered files are synthesized with `versions: []`
   (`project-file-discovery.ts:122`) and their `id` is the relative path, so
   `artifacts:get` resolves them by path with `artifact: null` — no sidecar
   lookup, no history.
3. **Deleted / orphaned records.** Tracked files no longer on disk, surfaced by
   the "Show deleted" toggle.
4. **Gated roots.** When a project's folder is the home directory or a drive
   root, `LIST_ALL_FILES` returns `{ gated: true }` with no scan
   (`ipc-handlers.ts:3016`); the tab renders a "Browse anyway" gate whose copy
   says *"Conversations and Artifacts work normally either way"*
   (`FilesTab.tsx:445`). Artifacts still lists normally there.

So Artifacts is not a subset of All files — it is an overlap with a real crescent
on the tracked side. This spec resolves that crescent so the merge loses nothing
that matters.

## 2. The model

**One `Files` tab.** The segmented control goes 4 → 3:
`Files | Conversations | Context`.

Inside it, two sections:

| Section | Contents | Source |
|---|---|---|
| **`Project Files`** | Every real file in the project folder, exactly as `All files` renders today — folder tree, breadcrumbs, search, type filter, sort. | `LIST_ALL_FILES` |
| **`External Artifacts`** | *Only* sidecar records whose path resolves **outside** the project folder, and that Claude actually created or edited. | `LIST_PROJECT`, filtered to `kind: 'external'` |

**In-folder artifacts are not differentiated.** A file Claude created or edited
inside the project folder is just a file in `Project Files` — no badge, no
separate section, no special ordering. The disk is the truth for anything inside
the project.

`External Artifacts` renders at the **root level of the tree only**. Drilling
into a subfolder shows `Project Files` content for that folder and hides the
external section — externals have no position in the project's folder hierarchy,
so pinning them under an arbitrary subfolder would be a lie.

### 2.1 Why the four crescent items are safe

1. **External pins → `External Artifacts`**, with the population rule changed
   (§3). This is the section's entire purpose.
2. **Version history →** preserved for external artifacts, which keep their
   sidecar records and ids. For in-folder files it was already only available
   via the Artifacts tab; it now lives in the Session Drawer for the active
   session. See §7 for the deferred-cleanup note.
3. **Deleted records → dropped from Project View** (§4). `VersionEvent` is
   `{ id, ts, sessionId, type, author }` (`shared/artifacts/types.ts:14`) with
   **no content field** — version history is metadata only, so a deleted record
   is a tombstone (name + timestamps), not a recovery path. Nothing restorable
   is lost.
4. **Gated roots →** the gate applies to `Project Files` only.
   `External Artifacts` still renders, because it reads the sidecar and never
   scans. The gate copy must be reworded (§5.4).

## 3. `External Artifacts` — flip rule 4

`visible-artifacts.ts` currently states:

> 4. External files → hidden unless included (rule 1).

and `ProjectView.tsx:489` is the **only** caller of `artifacts.includeExternal`
anywhere in the codebase, desktop or Android. Since `+ Add file` is being
repurposed (§6), nothing would ever write `manualIncludes` again — under the
current rule the new section would be empty forever, holding only legacy pins.

**Change rule 4 to mirror rule 3:** an external record is visible when it has at
least one non-`read` version. Same bar internal files already clear, so a
pill-click `read` (Claude opened the file but did not modify it) does not
populate the section.

```
4. External files → visible with at least one NON-READ version, i.e. Claude
   created or edited a file outside the project folder during one of this
   project's sessions. Same bar as rule 3.
```

Rules 1 and 2 (manual includes win, manual excludes hide) stay — `Exclude` still
needs rule 2 (§5.3), and rule 1 keeps legacy pins visible so no existing user's
pinned file silently disappears on upgrade.

This makes the section self-populating and surfaces information that is currently
**invisible** — today an external file Claude edited is hidden unless the user
happened to pin it by hand.

## 4. Removals

### 4.1 The `Artifacts` segment

Delete the `artifacts` member of `TabId` (`ProjectView.tsx:39`) and its `SEGMENTS`
entry. `FilesTab`'s `mode` prop collapses: the `mode === 'allfiles' | 'artifacts'`
branch disappears and `rootLabel` (`FilesTab.tsx:164`) becomes the constant
`'Project Files'`.

Delete the `(i)` hover explainer at `ProjectView.tsx:652` — with one tab there is
no split to explain.

### 4.2 "Show deleted" — project view only

Remove the project-view consumers:

- `ProjectView.tsx:99` (destructure), `:694` (active-filter count), `:726` (prop)
- `FilesTab.tsx:169`, `:239`, `:246`
- `FileFilterPopover.tsx` — the `showDeleted` / `onShowDeleted` /
  `showDeletedAvailable` props, the chip, and its `clear()` branch

> **Do NOT remove the flag itself.** `showDeletedArtifacts` is shared
> theme-context state (`theme-context.tsx:76`), persisted to `localStorage` **and
> synced cross-device** via `persistAppearance` (`theme-context.tsx:526`).
> `SessionDrawer` consumes it at eleven sites including its own toggle chip with
> a `+N hidden` count (`SessionDrawer.tsx:111`, `:152`, `:826`–`:835`). Deleted
> files remain useful at the session level — seeing everything Claude did during
> a session, deletions included, is the whole point of that view. A naive
> "delete `showDeletedArtifacts`" breaks it and drops a synced preference.

`FileFilterPopover` keeps type filter, sort, and hide-code unchanged.

### 4.3 Orphan handling in the merged tab

`FilesTab`'s orphan check (`artifacts:check-existence`) is no longer needed for
in-folder files — the disk walk only returns files that exist. Keep it for the
`External Artifacts` section: an external record whose file has been deleted or
moved should render as an orphan row rather than a dead card that errors on
click.

## 5. Renderer changes

### 5.1 Section rendering

`FilesTab` fetches both `LIST_ALL_FILES` (as today) and `LIST_PROJECT`, filters
the latter to `kind !== 'internal'`, and renders `External Artifacts` below the
`Project Files` grid when the filtered list is non-empty and `currentDir` is the
root. Empty → the section and its header are omitted entirely (no "no external
artifacts" prose).

Search, type filter, and sort apply to **both** sections, consistent with today's
behavior across the two tabs.

### 5.2 Counts

The `Files` segment badge shows the on-disk file count via the existing
`formatFileCount` (`ProjectHero.tsx`) — `"N"`, `"N+"` when truncated, `"—"` when
gated. The `External Artifacts` section header carries its own count.

`ProjectHero` drops its `artifacts` stat; `HeroStats.artifacts` and
`getArtifactCount` (`ProjectView.tsx:298`) go with it. With no Artifacts tab, a
hero stat labelled "artifacts" has nothing to link to and no longer matches any
visible surface.

Leave `countVisibleArtifacts` in main and `CentralIndexProject.stats.artifactCount`
alone — they feed the persisted central index and `ProjectSwitcher`, which are out
of scope here. Revisiting whether that count still means anything is deferred (§9).

### 5.3 `Exclude`

Scoped to `External Artifacts` rows only. Today it is hidden for discovered files
(`FilesTab.tsx:785`); the new condition is `kind !== 'internal'`. An in-folder
file cannot be excluded from a plain disk walk — hiding a real file the user can
see in their file manager would be a lie.

Retitle: `"Hide this external artifact"`. The old title references `+ Add file`
as the recovery path (`FilesTab.tsx:790`), which no longer pins anything. There
is no in-app recovery for an excluded external once `INCLUDE_EXTERNAL` has no
caller; state that plainly in the confirm rather than implying one exists.

### 5.4 Empty and gated states

- **Gated root.** The gate covers `Project Files` only. Reword
  `FilesTab.tsx:445` — "Conversations and Artifacts work normally either way"
  names a tab that no longer exists. Replace with a reference to conversations
  and external artifacts. `External Artifacts` renders below the gate message as
  normal.
- **Empty project.** `FilesTab.tsx:472`'s artifacts-mode empty string is deleted;
  the all-files string (`"No files found in this project folder."`) is the only
  one left.

## 6. `+ Add file` → Move / Copy

Today `addExternal` (`ProjectView.tsx:484`) opens `dialog.openFile()` and pins
each returned path via `includeExternal`. It becomes a real file operation.

**Flow:** `+ Add file` opens the native picker (unchanged, already multi-select).
On selection, a confirm dialog offers **Move** or **Copy**.

**Destination: the folder currently being browsed**, not the project root.
`FilesTab` is a breadcrumb tree browser — the user may be sitting in
`docs/plans/` when they hit the button, and landing the file at the root would be
surprising. The confirm labels the target explicitly: *"Copy into `docs/plans/`"*.

**Collisions.** Never silently overwrite. Offer **Replace / Keep both / Skip**,
where "Keep both" appends a numeric suffix. For a multi-file batch, ask once with
an "apply to all" checkbox rather than N sequential prompts.

**Move is non-destructive on failure.** A move across filesystems (external drive
→ home) cannot be a rename; it is copy-then-delete and can fail halfway. Copy
first, verify the destination, then unlink the source. Never unlink before the
copy is confirmed.

**New IPC:** `ARTIFACT_IPC.IMPORT_FILE` — `(projectRoot, sourcePath, destDir,
{ mode: 'move' | 'copy', onCollision: 'replace' | 'keep-both' | 'skip' })`.
It must reuse `write-authorization.ts` to confirm `destDir` resolves inside
`projectRoot` (symlink-resolved), rejecting traversal exactly as the existing
write path does. On success it invalidates the discovery cache for that root so
the file appears without waiting for TTL — the same treatment
`ipc-handlers.ts:2887` already applies.

Errors surface the real failure (`EXDEV`, `EACCES`, `ENOSPC`, the failing path)
per `docs/error-message-standards.md`. Do not catch and replace with a guess.

`INCLUDE_EXTERNAL` keeps its handler and channel — removing it would break
existing sidecars' round-trip and the Android schema — but loses its only caller.
Mark it deprecated in `ipc-channels.ts` with a pointer to this spec.

## 7. Android parity

**This feature is desktop-only in practice, and already was.** Every
`artifacts:*` channel on Android is a `not-implemented-on-mobile` stub —
`list-project` and `list-all-files` included (`SessionService.kt:3585-3601`).
Mobile Project View is v2 (ROADMAP: *"Android artifact Project View (mobile
v2)"*). The Files tab renders on Android because the renderer is shared, but it
has no data behind it today.

Consequences:

- **No Kotlin counterpart for `IMPORT_FILE`.** It gets a
  `not-implemented-on-mobile` stub alongside its siblings, matching the
  convention every other artifacts channel follows.
- **Move is still gated off on Android** in the renderer. Cheap, and it prevents
  a wrong affordance from appearing the day mobile Project View ships. Android's
  picker copies the selection into `~/attachments/` before the renderer sees a
  path (`MainActivity.kt:40-73`), so the "source" is a temp copy — moving it
  would delete the temp and leave the user's original untouched, which is a lie
  about what happened.
- **The picker filename fix stands on its own merits.** Android's picker renames
  every selection to `${System.currentTimeMillis()}.${ext}` with the extension
  guessed from MIME. That is invisible for chat attachments today but wrong the
  moment a picked file is filed into a project folder. Fixing it now improves
  attachment names immediately and removes a blocker for mobile Project View. It
  is **not** part of this feature's critical path and ships as its own revertible
  commit.

`SidecarSchema.kt` (`manualIncludes`, `manualExcludes`) is unchanged — the sidecar
format does not move, only the predicate that reads it.

## 8. Testing

- **`visible-artifacts.ts` rule 4.** Unit tests for the flipped predicate: an
  external with a `create`/`edit` version is visible; an external with only
  `read` versions is not; a legacy `manualIncludes` pin is still visible (rule 1);
  a `manualExcludes` entry still hides (rule 2). This file already owns the
  comparison logic and is the correct place to pin the change.
- **Parity tests** — `desktop/tests/ipc-channels.test.ts` and
  `desktop/tests/shim-parity.test.ts` already exist and will catch `IMPORT_FILE`
  wired on one side only. It needs a handler in `ipc-handlers.ts`, a bridge in
  `preload.ts`, **and** a matching entry in `renderer/remote-shim.ts` (the
  remote-access path), the same three places `includeExternal` occupies today
  (`preload.ts:1299`, `remote-shim.ts:1225`). Note the convention in
  `ipc-channels.ts`: **no apostrophes or single quotes in comments** there, since
  the parity test treats any single-quoted string as a channel name.
- **`FilesTab`** — `External Artifacts` renders only at root and only when
  non-empty; the gate covers `Project Files` while externals still list.
- **`IMPORT_FILE`** — collision modes; destination traversal rejection; move
  leaves the source intact when the copy fails.
- **Regression guard:** a test asserting `SessionDrawer` still honors
  `showDeletedArtifacts`, so a future cleanup pass cannot quietly remove it.

## 9. Deferred

- Whether `countVisibleArtifacts` / `stats.artifactCount` still mean anything
  once no tab shows an artifact count. Left alone here to keep the diff scoped.
- Version history for in-folder files, now reachable only through the Session
  Drawer for the active session. If browsing history for an arbitrary in-folder
  file proves useful, it belongs in the file detail pane, not a second tab.
- A "Recently deleted" view. The sidecar records survive untouched, so this
  remains buildable; it is out of scope because the records carry no content.

## 10. Decision log

| # | Decision | Rationale |
|---|---|---|
| 1 | Merge, don't delete | Artifacts held four things the disk walk cannot produce; a bare deletion would lose them silently |
| 2 | In-folder artifacts undifferentiated | The disk is the truth inside the project folder; badging them rebuilds the split the merge removes |
| 3 | `External Artifacts` fed by edit history, not pins | `+ Add file` was the only pin caller; without the flip the section is dead on arrival |
| 4 | Drop deleted records from Project View | `VersionEvent` carries no content — the record is a tombstone, not a recovery path |
| 5 | Keep deleted records in Session Drawer | Seeing everything Claude did in a session, deletions included, is that view's purpose |
| 6 | `Exclude` scoped to externals | An in-folder file cannot be hidden from a disk walk without lying |
| 7 | Move/Copy targets the browsed folder | Breadcrumb navigation makes the root a surprising destination |
