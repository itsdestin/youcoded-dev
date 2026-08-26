---
status: active
---

# Per-project description — design

> **Status — 2026-08-26 (review pass).** Implementation is **complete and unmerged**
> on `feat/project-description` (worktree `worktrees/project-description`), 13 commits,
> last commit `95af1cb3` on 2026-08-06. The branch has **never been pushed** — `git
> ls-remote --heads origin | grep -i project-desc` returns nothing — and no PR exists.
> All nine plan tasks landed; `bash scripts/verify.sh project-description --full` passed
> at the time (recorded in the branch's untracked `.superpowers/sdd/pd-final-fixes-report.md`).
> Work stopped mid-review: the last session asked Destin to reload the workbench and look
> at two unapproved layout tweaks, and he never answered. **What is stale below:**
> - §6 ledger row **13** ("Status glyph replaces the bare dot") was **reverted** on
>   2026-08-06 (`337341db`, Task 6). `grep -c "icon:" ProjectHero.tsx` → `0`; the pill
>   renders `w-2 h-2 rounded-full` at lines 513 and 618. Ledger rows **19–20** are missing:
>   `95af1cb3` moved New Conversation to the bottom-right and swapped the description
>   editor from a single-line input to an auto-sized Textarea. **Neither is approved.**
> - §7 "Still needed when the backend lands" — all three now exist:
>   `desktop/tests/sync-spaces-project-registry.test.ts` (merge convergence + tolerant
>   `parseEntry`) and the `syncspaces:set-project-description` / `folders:set-description`
>   parity blocks in `desktop/tests/ipc-channels.test.ts`.
> - §8 open questions **1, 3, 4 are settled**: (1) card reverted to the dot (Task 6);
>   (3) cog sync entries stripped (Task 7, `33029857`); (4) a cap **is** enforced —
>   `PROJECT_DESCRIPTION_MAX = 200`, used at `project-registry.ts:80,273`,
>   `ipc-handlers.ts:1174`, `remote-server.ts:1635`, and as a keystroke cap in
>   `ProjectHero.tsx:400`. Question 2 (truncate vs wrap) is still unconfirmed.
> - §9 rollout is **not done**. The mixed-version hazard is unchanged and still gates release.

Each project gets a short, user-written description that syncs between devices
and appears on the project card and in the project list. It is a **label for the
user**, not context for the agent: nothing here ever enters a session's prompt.

The synced half rides machinery that already exists. The project registry
(`~/YouCoded/Personal/ProjectSync/<name>.json`) already carries a synced,
user-editable `displayName` with a last-writer-wins merge, and the UI already
overlays that onto the project list at read time. A description is the same
shape of thing, so the work is mostly repetition of a shipped pattern — with two
exceptions called out in §3, both of which are easy to get silently wrong.

---

## 1. Scope

**Every project gets the field**, and storage mirrors the split that already
exists for names:

| Project kind | Name today | Description | Syncs? |
|---|---|---|---|
| Synced (`~/YouCoded/Projects/<name>`) | `displayName` in the project registry | `description` in the project registry | Yes, all devices |
| Plain saved folder | `nickname` in `youcoded-folders.json` | `description` in the same record | No — local only |

A plain folder's description staying local is not a compromise; it is the same
honesty the sync dot already communicates for that folder's contents. The
alternative — a unified synced metadata store for both kinds — is a storage
migration well beyond this feature and was rejected for that reason.

**Not in scope:** feeding the description to the agent, sharing it with other
people, templating, or per-project instructions. Those are separate features and
would change the storage decision.

---

## 2. Where it appears

Two surfaces, both inside Project View (`ProjectView.tsx`):

- **The project card** (`ProjectHero.tsx`) — under the path/GitHub row, italic
  inside curly quotes, wrapping within a max width. Click to edit inline.
- **The project list** (`ProjectSwitcher.tsx`) — a third line on each row, below
  the path, italic in quotes, truncated to one line.

Rows without a description keep their current height, so the list grows only
where a description is earning the space. The description is additive on both
surfaces: the path stays visible, because the path is what disambiguates two
folders with the same name.

---

## 3. Storage and merge

### 3.1 Registry entry (synced projects)

`ProjectRegistryEntry` (`sync-spaces/project-registry.ts`) gains two fields:

```ts
description?: string | null;      // user-written, synced
descriptionUpdatedAt?: number;    // ms epoch — its OWN last-writer-wins clock
```

**Do not bump `PROJECT_REGISTRY_SCHEMA`.** `parseEntry` rejects on strict
inequality (`raw.schemaVersion !== PROJECT_REGISTRY_SCHEMA`) and reads are
fail-soft-skip, so bumping it makes every older device drop *every* record:
projects vanish from discovery, rename, and stop on that device until it
updates. Add `description` as a tolerantly-parsed optional field at schema 1,
exactly as `displayName` already falls back when absent.

**Give the description its own timestamp.** `mergeProjectEntries` picks the
`newer` entry wholesale, so reusing `updatedAt` would put `displayName` and
`description` on one shared clock — writing a description on the laptop would
silently revert a rename made on the desktop. Merge the two independently:

```
state:       stopped-dominates monotonic join   (unchanged)
displayName: LWW by updatedAt                   (unchanged)
description: LWW by descriptionUpdatedAt        (new, independent)
```

The merge stays commutative and associative — it is still a lattice join, now
over `state × (updatedAt, displayName) × (descriptionUpdatedAt, description)` —
so a plain reduce over any conflict-copy order still converges, and fold-on-read
needs no new machinery. **This holds only under one constraint, and it is easy
to violate:** `laterOf` breaks an equal-clock tie on `JSON.stringify(x) >=
JSON.stringify(y)`, so whatever is handed to it *becomes* the tiebreak key. Each
dimension must be passed a wrapper carrying **only that dimension's own value +
clock** — `laterOf({ v: a.description, at: a.descriptionUpdatedAt }, …)`, the
shape `notePick` already uses in `conversations/store-core.ts`. Passing the
whole entry makes the tiebreak read `displayName`/`state`/`updatedAt` first;
those are chosen by *different* rules, so the key mutates as the fold
accumulates and the result starts depending on `fs.readdirSync` order. Measured
on the first implementation, which passed whole entries: **2,116 of 32,768
triples failed associativity** (commutativity and idempotence were unaffected).
Guard: `sync-spaces-project-registry.test.ts` → "converges on the same record
for every fold order".

### 3.2 Known hazard: old clients drop the field

`setProjectDisplayName` and `setProjectStopped` rebuild the entry from explicit
fields rather than spreading `cur`. A device on the older version that renames
or stops a project will therefore **write back an entry with no `description`**,
destroying it for every device. This is inherent to the mixed-version window and
cannot be designed away from the new side.

Mitigation, worth doing while in there: change both existing setters and the new
one to spread `cur` and override, so the *next* field added survives this same
window. This does not help `description` itself during the current rollout.

### 3.3 Setter

`setProjectDescription(personalRoot, name, repoName, description)` mirrors
`setProjectDisplayName`: locked read-modify-write on the canonical file,
preserve `state` and `displayName`, bump `descriptionUpdatedAt` only, and skip
the write when the value is unchanged (no watcher churn, no redundant push).
Empty/whitespace input normalises to `null`, not `""`.

### 3.4 Local folders

The saved-folders record gains `description` alongside `nickname`, and
`buildSavedFolderProjects` overlays it onto `CentralIndexProject.description`
the same way it already overlays `nickname` onto `name`.

---

## 4. Read path

Two overlays, and the renderer prefers the synced one:

- `syncSpacesStatus()` already overlays `displayName`/`state` from the registry
  onto each space; it gains `description` in the same place.
- `buildSavedFolderProjects` overlays the local description onto the index entry.

Both `ProjectHero` and `ProjectSwitcher` resolve with the same precedence used
for the name today: `space.description ?? project.description ?? null`.

`CentralIndexProject` gains `description?: string | null`. It is an overlay-time
field, never persisted to the central index — the index is a derived local cache
and is not a sync surface.

---

## 5. IPC

Two new channels, because a project has two metadata homes:

| Channel | Writes | Notes |
|---|---|---|
| `syncspaces:set-project-description` | project registry | synced projects |
| `folders:set-description` | `youcoded-folders.json` | plain local folders |

Both follow the 4-surface parity the existing rename already does — main service
+ `ipc-handlers.ts` + `preload.ts` + `remote-shim.ts`/`remote-server.ts` — and
are pinned by `ipc-channels.test.ts`.

**Android needs work, and the two channels need different work.** Verified
against `SessionService.kt`:

- `syncspaces:rename-project` is an explicit **fast-reject stub** there
  (`SessionService.kt:3738`, returning `not-implemented-on-mobile`) so the shared
  React UI degrades immediately instead of 30s-timing-out. Cross-device project
  rename is Phase 3 on Android. `syncspaces:set-project-description` must join
  that same stub list, or the description editor will hang on a phone.
- `folders:rename` is a **real Kotlin implementation**
  (`SessionService.kt:1315`), not a stub. So `folders:set-description` needs a
  real Android implementation to match, or plain-folder descriptions will be
  editable on desktop and silently broken on Android.

An earlier draft of this spec claimed no Kotlin work was implied. That was wrong
on both counts and is recorded here so the next reader doesn't re-derive it.

Both channels are already registered in the workbench's `MOCK_ONLY` registry.
That registry is the backend to-do list: implementing these means deleting those
two entries.

---

## 6. UI change ledger (approved 2026-08-05)

Built and reviewed in the UI Workbench against the real renderer.

| # | Change |
|---|---|
| 1 | Description on the card, under the path row, italic in curly quotes |
| 2 | "Add a description" affordance when empty |
| 3 | Inline edit mirroring Rename — Enter commits, Escape reverts, blur commits |
| 4 | Sync status strip → a pill at the bottom of the card |
| 5 | *(superseded by 12)* Pill expanded inline to full copy + action |
| 6 | Description as a third line on switcher rows, truncated |
| 7 | Workbench mock runs sync enabled across four states |
| 8 | *(superseded by 12)* Refresh icon on the pill instead of an expander |
| 9 | Pill sits in the actions row, left of Rename |
| 10 | Actions row renders at every width; only management buttons stay behind the narrow cog |
| 11 | Duplicate "Sync stopped" text removed from the actions row |
| 12 | Pill opens its own anchored popover carrying the state's full copy and action |
| 13 | Status glyph replaces the bare dot (check / warning / slash / monitor) |
| 14 | `RefreshIcon` deleted — superseded by 12 |
| 15 | Popover renders at every width (only home for the error message and "Turn on sync") |
| 16 | "Stop syncing" moved into the popover |
| 17 | It still arms the on-card confirm rather than acting |
| 18 | It disappears once the project is already stopped |

### Why the popover, and not the cog

Compressing the sync readout costs nothing until you notice that two of its five
states carry long copy the 2026-07-09 spec pins verbatim, plus a real error
message, plus an action. The obvious home for those is the narrow cog menu —
but `narrow-viewport.md` records that applying the hero cog at all widths was
tried and reverted. The popover keeps every state's copy and action on the card
at every width, and collapses only the verbosity.

---

## 7. Testing

New guards in `ProjectHero.test.tsx` (all passing on the mockup branch):

- The sync action is reachable one click into the pill's popover, at desktop
  width, never only from the narrow cog.
- "Turn on sync for this project" is offered for an unsynced project — the state
  whose action had no desktop home in an earlier iteration.
- The red state surfaces the engine's real error message, not a hardcoded guess.
- "Stop syncing" is absent from the actions row, present in the popover, arms
  the confirm rather than acting, and is absent once stopped.

Still needed when the backend lands:

- `mergeProjectEntries` convergence with an independent description clock:
  concurrent rename-on-A / describe-on-B must keep **both**. This is the test
  that would have caught the shared-clock bug.
- `parseEntry` tolerates a missing `description` and does not reject the record.
- `ipc-channels.test.ts` parity for both new channels, including the Android
  surface — the stub for the syncspaces one, the real handler for the folders one.

One coverage gap to note: the existing narrow tests default to `sync: null`, so
they never render the pill. Narrow behaviour of the pill and popover is
currently unpinned.

---

## 8. Open questions

1. **Dots vs glyphs.** The card now uses status glyphs; switcher rows still use
   plain colored dots, and `sync-spaces.md` pins the dots as the one sanctioned
   status-color use. Either the rows get glyphs too or the card goes back to a
   dot — two visual languages for one status is the wrong answer.
2. **Truncate vs wrap.** The card description wraps within a max width; the
   switcher line truncates. Deliberate, but unconfirmed.
3. **Cog redundancy.** The popover now offers every sync action at every width,
   so the narrow cog's sync entries duplicate it. Stripping them would leave the
   cog as Rename + Remove. Nothing is stranded either way.
4. **Length limit.** No cap is enforced. A cap belongs at the setter if one is
   wanted; the UI truncates rather than rejects today.

---

## 9. Rollout

The mixed-version hazard in §3.2 means a description can be destroyed by an
older device performing a rename or stop. Nothing catastrophic — the user
retypes it — but the window should be short, and the field is best shipped in a
release where sync clients update together.
