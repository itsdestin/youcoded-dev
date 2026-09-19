# Code review — project-files-any-size (commits df3ed4072, b90d23e55)

Reviewer: fresh agent, brief `scripts/ui-review/code-reviewer.md`. No contract file; judged
against the eight branch promises given in the brief. Diffed `df3ed4072~1..HEAD` in
`youcoded/` (the ref `origin/session/convo-tab-lag` is not present in this clone, so the
parent of the first commit under review was used as the base — same two commits).

## verify.sh

```
verify: .../project-files-any-size/youcoded (base origin/master)
  tests: related to 17 changed file(s) + 51 source-scanning guards
PASS  types (tsgo --noEmit)
PASS  types in tests/ (tsgo --noEmit, 47 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (oxlint)
PASS  design lint (oxlint --max-warnings ratchet)
PASS  invariants (ast-grep)
OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```

Note: verify diffed against origin/master, so its "related tests" set also covers the
stacked convo-tab-lag changes. Android was not built or tested here.

## Findings

- F1 — desktop/src/renderer/components/project-view/tabs/FilesTab.tsx:265,391,423,926 — one `loadError` state is now shared by two independent requests (the whole-project list for search, and the folder listing), so each one clears or shows the other's failure: (a) if the search list fails (for example the remote host refuses it, or the index read throws) and the user then changes sort, the folder effect's `setLoadError(null)` (l.423) wipes the error, and since the search list is not refetched on a sort change, the user sees "No files match '…'" (a false empty state) instead of the error; (b) if the search list fails and the user clears the search, `loading` becomes `folderLoading` (false) and the stale "Couldn't load your files: …" error stays above a fully loaded folder grid (the grid at l.969 does not check `loadError`), because nothing re-runs the folder effect on leaving search — confirmed by reading the state flow (effects at l.323-330 and l.422-429, render gates l.926/938/953); no test covers either path.
- F2 — desktop/src/renderer/components/project-view/tabs/FilesTab.tsx:408,412 — a failure while fetching a LATER page (folder deleted or made unreadable mid-scroll, IPC rejection, remote disconnect) silently sets `folderHasMore(false)` and swallows the error, so a partly loaded folder reads as complete with no message and no Retry — contrary to promise 4 ("never an empty folder") in spirit and the file's own rule that "a partial list never silently reads as complete" — confirmed by reading `loadMoreFolder`.
- F3 — desktop/src/main/artifacts/folder-listing.ts:51-53,168-169 — the paging snapshot is keyed only by (root, folder, sort) and shared by every caller, and page 0 always replaces it; so a second reader of the same folder (the "+ Add file" collision check in ProjectView.tsx:630, a remote phone, or a watcher-triggered refresh) swaps the snapshot under a first reader mid-paging, and a reader that scrolls past the 60 s TTL re-reads the disk at a raw offset — in both cases, if the folder changed (which is exactly when refreshes happen), later pages can repeat or skip entries; a repeated file gives duplicate React keys (`key={a.id}`) in FilesTab — confirmed by reading the key/TTL logic; not reproduced [PLAUSIBLE as user-visible].
- F4 — desktop/src/renderer/components/project-view/ProjectView.tsx:625-633 — the collision check pages the whole destination folder at 1,000 per call, and every page also stats up to 1,000 files and runs `summarize` (one readdir per subfolder) for up to 1,000 subfolders — work the check throws away (it only reads `res.files` names); and since the listing sends files before folders, every page after the first folder-bearing one can contain no files at all yet the loop continues — before the import dialog can appear — confirmed by reading `listFolderPage` (folder-listing.ts:208-213) and the loop; cost unmeasured [PLAUSIBLE as noticeable delay; only on folders with many subfolders].
- F5 — promise 8 has no guard: nothing in `tests/` exercises `computeImportCollisions` reading `artifacts:list-folder` (rg for `computeImportCollisions|disclosedCollisions` in tests finds only `tests/artifacts/import-file.test.ts`, which is main-side) — a regression back to the whole-project list, or a paging bug that misses collisions past page 1, would pass verify.
- F6 — desktop/src/renderer/components/project-view/tabs/FilesTab.tsx:113-114 with folder-listing.ts:119 and remote-server.ts:3872 — two answers fall through to wording that is not the real reason: `unavailable` shows the raw errno code to the person ("Couldn't open this folder: ELOOP" / "EIO" / "EBUSY"), and over remote a `not-allowed` refusal from `refuseUnknownProject` shows the bare "Couldn't open this folder." — the error-message standard asks for specific accurate detail or the non-committal form with Report bug / Diagnose — confirmed by reading `folderErrorMessage`'s default branch.
- F7 — desktop/src/renderer/components/project-view/tabs/FilesTab.tsx:373-374 — a same-folder refresh (every watcher add/remove event, every sort change, every import) re-reads the loaded count 200 entries per round trip, sequentially; a reader 2,000 entries deep costs 10 serial IPC calls per refresh (10 WebSocket round trips over remote), each re-running `summarize` for that page's subfolders, although the listing accepts up to 1,000 per call — confirmed by reading; cost unmeasured.
- F8 — desktop/src/main/artifacts/read-service.ts:115-116 — the `listAllFiles` doc comment still says "the tab renders a 'Browse anyway?' gate", and the neighbouring comment at 125-126 promises a gated root's sidecar is "never read and rewritten on a listing the user never confirmed"; the branch removed the gate and FilesTab now always passes `force: true` on any search (FilesTab.tsx:304), so a search in a home-folder project runs `repairSidecar` on the home folder with no confirmation — the comment no longer describes the behaviour (the Session Drawer already repairs unconditionally, so the risk is small) — confirmed by reading.
- F9 — desktop/src/renderer/components/project-view/ProjectView.tsx:421-425 — the hero-count comment says it "shares main's discovery cache with the Files tab's Project Files section, so this and the tab don't double-scan"; browsing no longer calls discovery, so the hero count's `listAllFiles(id)` is now the ONLY thing that runs the whole-project walk on every project open (promise 1 holds — the Files tab does not wait on it — but the main process still pays the walk on open) — WHY comment no longer matches the code; confirmed by reading.
- F10 — desktop/src/main/artifacts/folder-listing.ts:39 — the comment on `MAX_PAGE_SIZE` ("Entries per page when the caller names none (shared), and the most one call returns") describes `FOLDER_PAGE_SIZE` in its first half; and FilesTab.tsx:83 `FOLDER_PREVIEW_FILES` is a pure alias of `FOLDER_SAMPLE_FILES` whose `.slice` at l.779 re-trims what the listing already trimmed — minor naming/duplication; confirmed by reading.

Promise coverage, briefly: 1, 2, 3, 6 and 7 are implemented and pinned (folder-listing.test.ts,
files-tab-list-view.test.tsx "folder browsing at any size" incl. the 1,200-entry stress pin in
both views with a firing IntersectionObserver, remote-files.test.ts parity + root gate,
SessionService.kt stub). Promise 4 holds for page 0 (pinned) but not for later pages (F2).
Promise 5 holds and is pinned. Promise 8 is implemented but unguarded (F5).

## Not covered

- Android: not built or run (`./gradlew test` not attempted); the Kotlin stub was read only.
- No runtime check in a dev instance or the workbench (`&filesLocked=1` path read, not driven).
- Did not measure `summarize` cost on a page of large subfolders or `recent` sort on a
  100k-file folder under repeated watcher refreshes; relied on the branch's Stage 0 numbers.
- Did not audit the stacked `session/convo-tab-lag` commits.

## Triage (implementing session, 2026-09-18)

- F1 accepted — search and folder errors are separate states (`allError` / `folderError`); pinned by "keeps a failed search's error to search results".
- F2 accepted — a failed later page keeps what was shown and ends the list with an ErrorState ("Some of this folder isn't shown") and Retry; pinned by "says why a huge folder stopped…".
- F3 accepted — page 0 returns a snapshot id; later pages pass it, so readers no longer share one listing; an expired id answers `restarted` and the tab re-reads from the top. Sliding 5-minute expiry. Pinned in `folder-listing.test.ts` ("each reader pages its own listing").
- F4 accepted — the check moved to `folder-file-names.ts`: names only (no stats, no subfolder previews), one snapshot, stops at the first page that reaches folders.
- F5 accepted — `tests/folder-file-names.test.ts` guards it.
- F6 accepted — `unavailable` reads "The system reported: <code>", `not-allowed` names remote sharing, a rejected request keeps "Couldn't load your files: <message>".
- F7 accepted — refreshes ask for up to 1,000 entries per call.
- F8 accepted — `listAllFiles` comments rewritten to what the code does now (the home-folder repair on search is the same one the Session Drawer already ran).
- F9 accepted — hero-count comment rewritten; the capped walk on project open remains until Stage 2 (filed).
- F10 accepted — comment fixed, `FOLDER_PREVIEW_FILES` alias and its re-slice removed.
