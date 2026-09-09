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
1.2 **Reply before `ready`.** `watchProject` registers the entry and returns `{ ok: true }`
    once chokidar is constructed; the `ready`/`error` wait continues in the background
    (keep the `stopped` teardown check after ready). The renderer only reads `ok`.
1.3 **Stop at nested repositories.** chokidar `ignored: (p, stats)` — when `stats?.isDirectory()`
    and `p !== root` and `join(p, '.git')` exists (dir OR file, worktrees use a file), ignore.
    Cache the answer per directory path for the watcher's lifetime. Keep the existing
    dot-dir/`WATCH_SKIP_DIRS`/`.tmp` rules. Guard: unit test with a nested repo whose file
    change must NOT emit, and a sibling that must. **Verify first (unintended consequence):**
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
2.3 **Markdown open.** Memoize `hastText` in `MarkdownContent.tsx:337` (same component the
    chat uses — verify chat rendering unchanged with the workload/scrollback phases). The
    progressive first-screen render is a separate, larger change; do it only if the
    artifacts phase still shows >500 ms on the large Markdown open after 2.3.
2.4 Self-review, `verify.sh`, artifacts + workload phases before/after, fresh-eyes review.

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
