---
date: 2026-09-18
status: draft
type: spec
topic: Project View Files — every folder just works at any size. Direct folder browsing from disk, backed by a shared, recoverable background index for search and counts. No "large folder" gate, no "first batch" note, no silently missing files.
origin: Destin, 2026-09-18 — "i just want everything to work, even if it requires a smidge more backend work"
revision: 2 — rewritten after an independent review of revision 1 (corrections folded in; see "What changed from revision 1")
related: docs/active/plans/2026-09-18-render-cost-consolidation.md, docs/active/investigations/2026-09-18-list-render-cost-sweep.md, .claude/rules/renderer-lists.md
---

# Project Files at any size — revised design (build brief)

**For the building session.** This is the agreed direction, not a finished contract. Before
building: (1) read "Process" and ask Destin the route question; (2) run "Stage 0 —
measure first", because several numbers below are deliberately left open; (3) re-verify every
code citation — they were taken from `session/convo-tab-lag` on 2026-09-18 and that branch may
since have merged and moved things.

## The goal

Destin: "how could we manage/optimize/organize loading so the user doesn't see any weird extra
warnings or have to click extra buttons? i just want everything to work, even if it requires a
smidge more backend work."

**Governing principle: the filesystem is the truth. The index makes things faster; it never
decides whether you are allowed to see a file.** Browsing works even when the index is
unfinished, rebuilding, unavailable or broken.

## What the user sees today (and why)

- **"This folder is very large… Browse anyway"** — shown when the saved folder is the home
  folder or a whole drive (`isGatedRoot`, `src/main/artifacts/projects-index.ts:~95`). No scan
  runs until the button is pressed (`FilesTab.tsx`, gated block ~:714).
- **"This folder is large — showing the first batch of files. Some documents deeper in the
  folder aren't listed."** (`FilesTab.tsx` ~:935) and counts shown as "2,000+" — when a walk hits
  a cap. Caps: `src/main/artifacts/project-file-discovery.ts:~46` — 2,000 files, 4,000 folders,
  6 levels deep, 1.5 s, 10 s result cache. The whole tree is walked per open and the whole list
  is sent to the screen.
- **Silent gaps:** anything deeper than 6 levels, inside a dot-folder, a build/dependency
  folder (`SKIP_DIRS`) or a nested git repo never appears, with no message.

Why the caps existed: drawing every file as a card at once (solved for flat results by the
render-cost branch — but see §4, not for folder view), and walking/transferring a huge tree
on every open (still real).

## What the user will see (the promises)

| Action | Behaviour |
|---|---|
| Open a project or a folder | That folder is listed straight from disk, without waiting for any recursive scan. More entries load automatically as you scroll. |
| Search, or filter by type | Searches the whole project. Matches already known appear immediately; discovery continues if unfinished, and results fill in. |
| Create, rename, delete a file (in YouCoded or outside it) | The visible folder and search update promptly. |
| Come back after restarting | Cached results appear quickly while changes are checked in the background. |
| Open a huge home folder or drive | The same interface. No gate, no button. Background work is scheduled more conservatively. |

**Promised:** the interface stays responsive; results appear progressively; no depth or
total-file cutoff; counts become final when discovery completes (and look provisional until
then); an unfinished search never says "no results" — it says it is still looking; permission
failures and unavailable drives show as real errors (`<ErrorState>`), never as empty folders.

**Not promised** (revision 1 overclaimed these): "instant at any size", "a few seconds",
"exact counts immediately".

**Removed:** the "very large / Browse anyway" screen and the "first batch" note.
**Added:** a quiet progress line while search is still discovering (wording TBD with Destin),
and provisional counts while the first index runs.

## Architecture

### 1. Direct browsing (never depends on the index)

- Opening a folder lists its direct children from disk (`readdir` + stat), paged by the
  backend: the renderer asks for page N of folder X in the current sort, gets entries plus
  "more to come". A folder with 100,000 direct children is still a large folder — paging is
  what keeps it usable; unlimited loading is not the goal.
- No depth limit. Dot-folders, build/dependency folders and nested git repos **are browsable**
  — you can open them like any folder. They are only excluded from background search (§3).
- Keep the existing union with tracked internal files (`projectAllFiles`,
  `projects-index.ts:~64`): a tracked file must never vanish because discovery changed.
- Security and path restrictions stay enforced where they are today (canonical paths,
  `write-authorization.ts`, read access), independent of the index.

### 2. One shared index service, off the main thread

- **One** backend service (not a worker per project) owns per-project indexes and a bounded
  work queue. Expensive scanning and querying run outside Electron's main thread — a
  `utilityProcess` has precedent in `src/main/voice/voice-service.ts`; `worker_threads` is the
  alternative. Stage 0 picks one.
- **Priority order:** (1) the folder the user is viewing, (2) their active search, (3)
  background indexing and maintenance. Cancel superseded work (a new query cancels the old one).
- **Do not pause because the desktop window is unfocused** — a remote user may be driving it.
  Throttle by priority and load instead.
- Reuse the existing canonical-path, subscription (refcount per `webContents`, as in
  `project-watcher.ts`), file-opening and permission machinery.
- The index is **local, disposable and separate** from tracked-file history (sidecars) and from
  synced project data. Deleting it only costs a rebuild. Never sync it.
- Persist it to disk per project so a restart starts warm; schema-versioned so a format change
  rebuilds instead of misreading.

### 3. What "everything" means

- **Browsing:** every entry the OS lets you list.
- **Background search index:** everything except explicit exclusions — today's
  `SKIP_DIRS` / dot-folders / noise files / nested repos stay excluded **from indexing only**.
  A search result list should say, where relevant, that excluded folders were not searched
  (wording TBD) — never pretend they don't exist.
- Open question for Destin: should a user be able to include an excluded folder in search
  (e.g. a nested repo they work in)?

### 4. Rendering (the render-cost branch did not finish this)

- Flat search results use `useChunkedReveal` (50 at a time) — but it keeps every revealed item
  mounted, so scrolling far down a huge result list grows the page without bound.
- **Folder view is not windowed at all today** (`FilesTab.tsx` ~:469: "Folder view is left
  whole … tens of items" — an assumption this design breaks).
- Both need backend paging (above) plus a measured strategy for keeping mounted rows bounded.
  File cards and rows are **fixed size**, unlike the variable-height conversation cards for
  which virtualization was rejected (2026-07-31), so true virtualization may fit here —
  measure it against the chunked reveal before choosing (Stage 0). Keep `.claude/rules/
  renderer-lists.md` true: a new list ships with a stress pin.

### 5. Search (names, types and contents — one box, as today)

- Names and types: queried in the index service; returns the top matches plus a running total,
  paged. The renderer never receives the full file list.
- Contents: keep the unified box (name matches ranked above content matches — design decision
  2026-07-22). Today's ripgrep search (`content-search.ts`) is capped: 200 hits, 20 per file,
  5 s, 1 MB of output. Make it **cancellable and progressive** (stream and page hits, continue
  past the first batch on scroll). Do **not** build a full-content index unless measurements
  justify it.
- While either part is still running: a progress line, not an empty state.

### 6. Freshness — correct, not just fast

- **Fast path:** watcher events update the visible folder and the index promptly.
- **Correctness path:** background reconciliation after startup, missed events, remote
  reconnects (`useProjectWatch`'s `onReconnected` already exists for this) and watcher
  failures. **Do not rely on directory modification times** — a folder's time changes only when
  entries are added/removed/renamed directly inside it, not for content edits or changes deeper
  down.
- The existing watcher cannot be reused unchanged: it stops at depth 6, and 2 for the home
  folder (`project-watcher.ts:~49, ~61`), and its skip list mirrors discovery's. Options to
  evaluate in Stage 0: chokidar as today with a deeper scope, or an OS-level recursive watcher
  (`@parcel/watcher`-style). Linux limits the number of watched folders per user
  (`fs.inotify.max_user_watches`) — a huge tree must degrade to reconciliation, not fail.
- Changes made by YouCoded itself already call `invalidateDiscoveryCache`; route those into
  the index too.

### 7. Counts (hero, switcher)

- Provisional while discovery runs (styled as provisional — wording/visual TBD, not "2,000+");
  final when done. Home/drive roots included — no more "—" gate.

### 8. Errors

- A folder the OS refuses → `<ErrorState>` with the real reason and Retry
  (`docs/error-message-standards.md`); an unplugged drive → a genuine "not available" state.
  Never an empty folder. The index being broken → browsing still works; search falls back to a
  direct walk for the visible scope and says it is slower, or rebuilds quietly.

### 9. Platforms

- Desktop: everything above.
- Remote browser: works through the existing bridge — the desktop does the work, only pages
  cross the connection. New IPC must keep `preload.ts` / `remote-shim.ts` / `ipc-handlers.ts`
  parity (IPC parity tests).
- Android: Project View has no file data today (Kotlin stub in `SessionService.kt`) and no
  ripgrep. Nothing gets worse; nothing new is promised there. New channels need their Android
  stub answers so the shim stays consistent.

## Build stages (each shippable and measurable on its own)

**Stage 0 — measure first (no product code).** On a large real project, the home folder and a
whole drive: time and memory of a full walk (Node walk vs `rg --files`); first index vs warm
re-check; watcher cost and inotify headroom at those sizes; chunked reveal vs virtualization for
a 20,000-card grid and a 100,000-entry folder (DOM nodes, memory, scroll frame gaps).
perf-lab's Projects phase seeds ~1,600 files — add a home-folder-scale fixture. Write the
numbers into this doc and pick the open values from them.

**Stage 1 — direct browsing.** Paged `readdir` per folder; no depth limit; excluded folders
browsable; union with tracked files kept; folder view bounded (per Stage 0's choice); the
"Browse anyway" gate removed for browsing; real error states. Search and counts still use
today's discovery for now — so the "first batch" note may still appear for **search only**
until Stage 2 (tell Destin).

**Stage 2 — the index service.** Shared service off the main thread, priority queue,
persisted disposable index, reconciliation + watcher updates, name/type search and counts from
the index, progressive results, provisional counts. Remove the "first batch" note and the
remaining caps.

**Stage 3 — progressive content search.** Cancellable, streamed, paged ripgrep content hits in
the same box; progress line; no silent "no results".

## Stage 0 results (measured 2026-09-18, Destin's Z13, Linux, warm disk cache)

Script: a Node walk (`readdir` with file types, no stats) and `rg --files`, run from a
throwaway script; one-folder figures from synthetic flat folders. Warm cache only — a cold
first walk will be slower, and was not measured (it needs dropping the OS cache as root).

| What | Result |
|---|---|
| Whole walk, `youcoded-dev`, today's skip rules | 142,737 files, 24,931 folders, 14 levels, **0.4 s**, ~85 MB |
| Same, nothing skipped | 813,505 files, 106,693 folders, 23 levels, 1.4 s |
| Whole walk, home folder, skip rules | 258,055 files, 53,089 folders, 15 levels, **1.2 s**, ~140 MB |
| Same, nothing skipped | 2,674,154 files, 319,353 folders, 24 levels, 5.6 s |
| `rg --files --hidden`, home folder | 1,580,562 files, **111 s** — obeys .gitignore, so it is also the wrong list |
| `rg --files --hidden`, `youcoded-dev` | 6,480 files, 17 ms — .gitignore hides the worktrees |
| One folder of 10,000 files: readdir / sort by name / stat all | 8 ms / 8 ms / 128 ms |
| One folder of 100,000 files: readdir / sort by name / stat all | 67 ms / 24 ms / **1.2 s** (and ~500 MB when all stats run at once) |
| Linux watch limit (`fs.inotify.max_user_watches`) | 1,048,576 |

What they decided:
- **Walker for Stage 2: Node, not ripgrep.** ripgrep's file list follows .gitignore (so it
  is not "every file") and was ~90× slower on the home folder.
- **Stage 1 needs no index.** Reading one folder is milliseconds even at 100,000 entries; only
  "newest first" needs every file's time (~1.2 s at 100,000), so stats run 64 at a time.
- **Paging:** 200 entries per page from disk, drawn 50 at a time (the existing chunked
  reveal). The DOM-size sweep's new huge-folder case (2,000 files in one folder) draws
  ~1,230 elements, against the 8,000 budget.
- **Left for Stage 2:** chunked reveal vs true virtualization for very long scrolls (revealed
  rows stay mounted); `utilityProcess` vs `worker_threads`; cold-cache and watcher cost.

## Guards (per `.claude/rules/renderer-lists.md` and test-suite-hygiene)

- Stress pins: a 100,000-entry folder and a 20,000-result search draw a bounded number of rows.
- Behaviour pins: a file deeper than 6 levels is browsable and searchable; a dot-folder is
  browsable and not searched; a tracked file outside discovery still appears; an unfinished
  search never renders the empty state; a permission-denied folder renders `<ErrorState>`.
- Freshness pins: an outside edit/add/remove updates the list; a missed event is recovered by
  reconciliation; a content-only edit (no directory time change) is picked up.
- Extend `scripts/ui-review/dom-size-sweep.mjs`: Files folder view at stress scale.
- perf-lab: judge Projects open and Files first-page time on the home-scale fixture.
- IPC parity tests for every new channel. Break-it run per pin.

## Process (ask Destin first)

This removes a screen and a note and adds progress and provisional-count states — a UI change
under `.claude/rules/feature-flow.md`. For the render-cost branch Destin skipped the decks
("just want a final code review"). Ask which route this one takes: the full flow, or the light
one (a Before/After deck of the Files tab — gate gone, progress line, provisional count, an
error state — plus a fresh code reviewer at the end). Use a worktree off `origin/master` via
`node scripts/workspace-start.mjs`; one commit per task; push after each.

## Open questions for Destin

1. Route: full feature flow or the light route (above)?
2. Can a user choose to include an excluded folder (nested repo, dot-folder) in search?
3. Wording for the progress line and for provisional counts (the deck can show options).
4. Is background indexing of a whole home folder acceptable by default (disk/CPU for a while
   on first open), or should home/drive roots index only what is browsed until searched?

## Risks to name to Destin

- First index of a huge tree: sustained background disk/CPU — fan and battery on a laptop.
- Index memory and disk size (measured in Stage 0).
- Changes made while the app was closed are briefly stale after restart, until reconciliation.
- Hitting the Linux watch limit on very large trees → slower updates (reconciliation), not
  missing files.
- Counts visibly change from "2,000+" to provisional-then-final numbers.

## Out of scope

- A full-text content index (only if Stage 3 measurements demand it).
- Android file browsing (no data source there today).
- Changing tracked-file history, sidecars or sync.

## What changed from revision 1

Revision 1 proposed a per-project worker, freshness by directory modification time, reuse of
the existing watcher, pausing while the window is unfocused, "every file" while keeping skip
rules, and promised "instant / a few seconds / exact counts". An independent review corrected
each: freshness by watcher events plus reconciliation (directory times miss content and deep
changes); the watcher's depth limits (6, and 2 for home) mean it needs rework; one shared
service with a priority queue; never pause for an unfocused window (remote users); exclusions
apply to search, not browsing; folder view and revealed lists are not yet bounded, so backend
paging is required; content search is capped today and belongs in the design; promises
restated as honest ones. This revision also adds the staging, and notes that fixed-size file
cards may suit virtualization where conversation cards did not.
