---
date: 2026-09-09
status: active
type: plan
topic: Fix the Projects-view tab-thrash chug (watcher restart over nested repos) and the session-file pane's spawn/redraw costs, each branch proven before/after with the perf rig
---

# Projects view + session-file pane performance — implementation plan

Evidence and numbers: `docs/active/investigations/2026-09-09-projects-view-and-file-pane-chug.md`.
Destin (2026-09-09): "I will give you leeway/freedom as to what/how we implement. Check your
own changes for unintended consequences or omissions."

Session key: `2026-09-09-projects-perf` (`node scripts/workspace-start.mjs --session
2026-09-09-projects-perf youcoded`). Workspace branch `session/2026-09-09-projects-perf`
holds the rig phase, the investigation and this plan; app work goes on a branch in the
`youcoded` worktree under the same session.

**Baseline to beat** (`perf-reports/2026-09-09-2326-6ccb817-projects-thrash.md`): eight rapid
Files/Conversations clicks = 7.2–8.0 s main-process stall, worst 285–338 ms; cold open
2.1 s; project switch to the big project 233–268 ms. Re-run after each branch with
`bash scripts/perf-lab/bg-run.sh --only projects --projects-repeats 3 --checkout <youcoded worktree> --label <name>`
and gate with `node scripts/perf-lab/compare.mjs <baseline>.json <new>.json --target projects.median.thrash.ipcStallMs`
(after step 1.6 adds it to PRIMARY). Do no other work while a run is in flight; it refuses a busy machine.

## Branch 1 — Projects view: the watcher restart (`youcoded`, `fix/projects-watcher-thrash`)

Files: `desktop/src/main/artifacts/project-watcher.ts`, `desktop/src/main/ipc-handlers.ts`
(`artifacts:watch-project` handler), `desktop/src/renderer/components/project-view/ProjectView.tsx`,
`desktop/src/renderer/components/project-view/tabs/FilesTab.tsx`, tests under `desktop/tests/`
(find the watcher's existing test with `rg -l "isWatchIgnoredPath|watchProject" desktop/tests`).

1.1 **Grace period in main.** `unwatchProject` → when refs reach zero, do NOT close; start a
    60 s timer and keep the entry. `watchProject` on an entry in grace cancels the timer and
    reuses the watcher. `dropSubscriber` (renderer died) keeps the same grace. Guard: a
    unit test — watch, unwatch, watch again within the grace → one chokidar instance, no
    second walk. WHY: tab thrash and close/reopen must never restart the walk.
1.2 **Reply before `ready` — DROPPED 2026-09-09, not implemented.** The renderer never
    awaits `watchProject` for anything it renders (`useProjectWatch` fires and forgets),
    and the freeze being measured is the fs walk itself hogging main's event loop, which
    an early reply does not move. It would have bought nothing visible while making the
    existing watcher tests race the `ignoreInitial` window. 1.1 removes the restarts and
    1.3 makes the remaining walk small, which is where the time actually was.
1.3 **Stop at nested repositories.** chokidar `ignored: (p, stats)` — when `stats?.isDirectory()`
    and `p !== root` and `join(p, '.git')` exists (dir OR file, worktrees use a file), ignore.
    Cache the answer per directory path for the watcher's lifetime. Keep the existing
    dot-dir/`WATCH_SKIP_DIRS`/`.tmp` rules. Guard: unit test with a nested repo whose file
    change must NOT emit, and a sibling that must.
    **Precondition CONFIRMED 2026-09-09 → adopted.** `ipc-handlers.ts` APPEND_VERSION
    broadcasts `ARTIFACT_IPC.CHANGED` with the real artifact id and `by: args.author`
    ('agent' for Claude's edits), and `ActiveArtifactView` deliberately ignores `by` and
    refetches on any changed event for its id. Agent edits inside a nested repo still
    live-refresh the open file; only an OUTSIDE editor's change to a tracked file inside a
    nested repo loses live refresh, which is the accepted trade.
    **Original verification note (kept for the record):**
    Claude Code sessions run in youcoded-dev and edit files inside the nested `youcoded/`
    repo; the open viewer's live reload on an external change and the git-status refresh both
    listen to `artifacts:changed`. Before adopting 1.3, confirm that an agent edit recorded
    through the tracker (`artifacts:append-version`) also broadcasts a `changed` event the
    viewer refetches on (look for `by: 'agent'` in `ipc-handlers.ts` near the append handler
    and in `ActiveArtifactView.tsx:246-273`). If it does, 1.3 loses nothing visible for
    agent edits; a change made by an outside editor inside a nested repo would no longer
    live-reload the viewer, and that is acceptable because the Files tab never lists those
    files. If it does NOT, keep 1.1/1.2/1.4 and leave 1.3 out with a note in the roadmap.
1.4 **Keep the Files tab mounted while Project view is open.** In `ProjectView.tsx:907-912`
    render `FilesTab` with `hidden` (the `[hidden]` reset exists) instead of unmounting when
    another tab is active; Conversations/Context stay conditional. Check: the thumbnails'
    IntersectionObserver reports hidden cards as not intersecting (no fetch storm on
    return); `useEscClose` and the filter popover behave the same; `onCurrentDirChange`
    still fires; no duplicate `artifacts:changed` subscriptions. Guard: extend
    `project-view-default-selection.test.ts` or add a small tsx test: switching tabs does
    not call `listAllFiles` again.
1.5 **Self-review for omissions.** Android parity: `artifacts:watch-project` is desktop-only
    (confirm in `ipc-channels.test.ts`); no channel shape changes. Remote web: the same
    renderer code runs there; `hidden` and the grace are transparent. Memory: the earlier
    probe saw RSS grow ~100 MB per start/close round — with 1.1 there are no rounds; note
    the observation in the PR. Run `bash scripts/verify.sh <youcoded worktree>`.
1.6 **Rig gate.** Add `projects.median.thrash.ipcStallMs` and `projects.median.open.openMs` to
    `PRIMARY` in `scripts/perf-lab/compare.mjs` (PRIMARY count 23 → 25; update
    `tests/run-report.test.mjs`). Re-run the phase; expect thrash stall from ~7.5 s to well
    under 0.5 s and cold open from 2.1 s to under 1 s.
1.7 Fresh-eyes code review (`superpowers:requesting-code-review` or a context-free reviewer
    agent) before showing Destin; the rig's before/after numbers are the acceptance.

## Branch 2 — session-file pane (`youcoded`, `fix/file-pane-spawns-and-redraw`)

2.1 **Git status only for the open file, on its own changes.** `useGitFileStatus.ts:33-35`:
    filter `artifacts:changed` to `evt.path`/id matching the open file; debounce 300 ms.
    Baseline the artifacts phase first (`--only artifacts`).
2.2 **Stop the per-token redraw.** `React.memo(SessionDrawer)` with stable callbacks from
    `ChatView.tsx:1310`; memoize the `ArtifactProvider` value in `App.tsx:3077`. Check with
    the rig's workload phase (`--only workload`) that streaming cost does not move up.
2.3 **Markdown open — DROPPED as written, 2026-09-09; the premise was wrong.** Timed against
    the rig's own 392 KB / 699-fence fixture through the app's own plugin chain: parse
    292 ms, mdast→hast 217 ms, rehype-highlight 377 ms, `hastText` **7 ms** — 0.8% of the
    work, so memoizing it could not have moved anything. Moved to `docs/roadmap/files.md`
    with those numbers and three untried candidates (first-screen render, lazy highlighting,
    parse off the main thread). It is a real freeze — 1,455 ms large, 570 ms for a 3.5 KB
    file against 117 ms for a 400 KB code file — and now the largest one left in the pane.
2.4 Self-review, `verify.sh`, artifacts + workload phases before/after, fresh-eyes review.

## State — 2026-09-10

**Branch 1 `fix/projects-watcher-thrash` — built, measured twice, reviewed. Awaiting Destin's
merge call.** Two commits (`c73e0920` the fix, `69cde4e8` the review follow-ups).
Eight rapid tab clicks: main process unresponsive 7,101 ms → **0 ms**; worst single freeze
305 ms → 6 ms; cold open 2,087 → 776-855 ms. `VERDICT: KEEP` on both runs
(`perf-reports/2026-09-10-0008-c73e092-watcher-thrash-fix.*`, `…-0206-69cde4e-…-2.*`).
A fresh reviewer found two user-visible faults the change itself introduced — the hidden
tab holding the Escape key / Android back button, and the hidden tab's refresh re-running
the uncached tree walk — both fixed in `69cde4e8` with guards.

**Branch 2 `fix/file-pane-spawns-and-redraw` — built, verified, reviewed. Awaiting Destin's
merge call.** Three commits (`068c4de7` the fix, `d8fd8414` the guard, `3db9b793` the
review follow-ups).
The rig measured **flat** before and after, and that is a coverage gap rather than a null
result: no phase opens the file pane while a reply streams, and none changes one file while
a different one is open. Both filed (`docs/roadmap/dev-workspace.md` → tests). The claims
are counts and are pinned as counts: 40 streamed tokens caused 40 full drawer re-renders
before and 0 after; a change to any other file no longer costs three git subprocesses.
A fresh reviewer (2026-09-10) confirmed the memo holds at both call sites and cleared the
debounce of stale-closure and leak faults, and found three things fixed in `3db9b793`:
the debounce had been applied to `git:changed` too, which desynced the footer from the
review list directly above it on every Stage/Commit; the per-file filter dropped
`.gitignore` edits, which decide whether the open file is untracked at all; and the
context-memo guard read only that `useMemo` was called, never its dependencies, so an
empty dependency list — a frozen context, app-wide — would have passed. One finding was
deliberately left open and filed to `docs/roadmap/files.md`: the footer cannot follow a
file whose id changes under it, which is entangled with the wholesale-reload bug that
currently masks it.

**Not done:** Branch 3 in full; the Markdown open (2.3, re-scoped above and filed).

## Branch 3 — smaller, after 1 and 2 (any order, each a small PR)

3.1 Cache `listPastSessions()` in main for a few seconds, invalidated by the transcript
    watcher; move `transcript-cwd.ts` sync reads to async.
3.2 Search transition + precomputed lowercase paths in `FilesTab.tsx:298-307`.
3.3 One glass layer behind the file grid (wallpaper themes only; `globals.css:1413` pattern).
3.4 Virtualize the flat grid/list; `ArrayBuffer` for `artifacts:read-binary` (desktop path;
    keep base64 for the remote transport).

## Not in scope without Destin's call
- Trimming `artifacts.json` (three cuts listed in the investigation §5 D).

## Close-out per branch
Commit by explicit path, push the branch, run `bash scripts/close-out.sh <branch> youcoded`
findings within scope, then stop and ask "ready to merge?". Never merge unasked.
