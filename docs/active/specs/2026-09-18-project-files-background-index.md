---
date: 2026-09-18
status: draft
type: spec
topic: Project View Files — every folder just works, whatever its size (no "large folder" gate, no "first batch" note)
origin: Destin, 2026-09-18, after the render-cost consolidation — "i just want everything to work, even if it requires a smidge more backend work"
related: docs/active/plans/2026-09-18-render-cost-consolidation.md, docs/active/investigations/2026-09-18-list-render-cost-sweep.md
---

# Project Files: a background index instead of caps and warnings — proposal

**For the reviewing session:** this is a proposal, not an approved design. Destin asked for it
to be written down for review. Nothing here is decided except the goal. Check every code claim
below against the tree before relying on it (it was written from `session/convo-tab-lag`).

## The goal, in Destin's words

"how could we manage/optimize/organize loading so the user doesn't see any weird extra warnings
or have to click extra buttons? i just want everything to work, even if it requires a smidge
more backend work."

## What the user sees today

Two different messages in Projects → Files:

1. **"This folder is very large… Browse anyway"** — only when the saved folder IS the home
   folder or a whole drive (`isGatedRoot`, `src/main/artifacts/projects-index.ts:~95`). No scan
   runs until the button is pressed (`FilesTab.tsx` gated block, ~:714).
2. **"This folder is large — showing the first batch of files. Some documents deeper in the
   folder aren't listed."** — when a normal folder's scan hits a cap (`FilesTab.tsx` ~:935).
   The hero and project switcher show the count as "2,000+".

The caps live in `src/main/artifacts/project-file-discovery.ts:~46`: 2,000 files, 4,000
folders, 6 levels deep, 1.5 s, results cached 10 s. The whole tree is walked on every open
(after the 10 s cache), and the full list is sent to the screen.

## Why the caps exist

- **Drawing.** Every file used to become a card at once. **Solved by the render-cost branch**
  (Files draws 50 at a time via `useChunkedReveal`; tested at 2,000 results).
- **Walking the disk.** Still real. A home folder or drive holds hundreds of thousands of
  files; walking them all on every open is slow, keeps the disk busy, and the full list then
  travels to the screen (and over remote access), where search and type filters sort it on
  every keystroke.
- **Depth 6** hides deep files regardless of how few there are — a separate, silent gap.

## Proposed experience

- **Opening a project is instant at any size.** The folder you are in is listed immediately,
  complete, no depth limit.
- **Search always covers everything.** First-ever open of a huge folder: results fill in over
  a few seconds with a quiet "Still looking…" line (a progress sign, not a warning). Every
  open after that: immediate.
- **Counts are exact** ("12,408 files", never "2,000+"); the first time, the number may climb
  for a moment.
- **Home folder / whole drive behave the same** — just slower in the background the first time.
- **Removed:** the "very large / Browse anyway" screen and the "first batch" note.

## Proposed mechanism

1. **Folder view reads one level.** Opening a folder lists only its direct children (one
   `readdir`). Cheap at any size; makes browsing complete on its own.
2. **A background indexer per project** builds the full file list once:
   - runs off the main process's event loop (a worker thread or utility process), so the app
     never stalls — the watcher comment in `project-watcher.ts` already notes a full tree walk
     on the main thread is costly;
   - keeps today's skip rules (`SKIP_DIRS`, dot-directories, nested git repos, noise files);
   - streams results in batches, so search and counts fill in while it works;
   - saves the index to disk per project, so the next launch starts from it and only
     re-checks folders whose modification time changed;
   - low priority; pauses while the app is in the background (battery / fan).
3. **Kept current by the existing watcher** (`src/main/artifacts/project-watcher.ts`, already
   refcounted per project) for normal projects. For home/drive roots, watching everything is
   too costly (and Linux caps watches) — re-check changed folders on open instead.
4. **Search asks the indexer, not the screen.** Name search and type filters run where the
   index lives and return the top matches plus a total, more on scroll (fits the existing
   `useChunkedReveal` window). The screen never holds the full list. Content search already
   works this way (`content-search.ts`, bundled ripgrep). Worth evaluating: `rg --files` as the
   walker itself (ripgrep is already bundled and honours ignore rules) vs. a Node walk.

## Trade-offs and risks (tell Destin)

- First open of a huge folder: sustained background disk/CPU for a while — fan, battery.
- Memory: an index of a few hundred thousand paths is modest but real; measure it.
- The saved index can be stale for changes made while the app was closed until the re-check
  finishes (seconds).
- Android: no ripgrep, and Project View has no file data on Android today
  (`SessionService.kt` stub) — nothing gets worse, nothing gains either.
- Remote access: fine — the desktop does the work, only what is on screen is sent.
- Hero/switcher counts change from "2,000+" to exact numbers — a visible change.

## Options for the reviewing session to weigh

- **A — full design above (recommended).** The only option where no note or button remains.
  Largest build (a new background indexer).
- **B — one-level folder view + higher search cap.** Browsing always complete; search and
  counts in very large folders still partial, so a note survives for search.
- **C — just raise the caps.** Quickest; home/drive roots still hit them and the warning returns.

## Process (open question for Destin)

This removes a screen and a note and adds a "Still looking…" line, so it is a UI change under
`.claude/rules/feature-flow.md`. Destin skipped decks for the render-cost branch; ask whether
this one gets the same light route (a Before/After deck of the Files tab + a final code review)
or the full flow. Build it on its own branch, after `session/convo-tab-lag` merges.

## Measure before choosing numbers

- Time and memory of a full walk (Node walk and `rg --files`) on: a large real project, the
  home folder, a whole drive.
- How long the first index takes vs. a warm re-check.
- perf-lab's Projects phase already seeds a ~1,600-file project; it would need a
  home-folder-sized fixture to judge this.
