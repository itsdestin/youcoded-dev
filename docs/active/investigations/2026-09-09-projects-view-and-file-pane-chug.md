---
date: 2026-09-09
status: draft
type: investigation
topic: The Projects view and the session-file pane chug — measured outside the app and in the perf rig at Destin's data scale (fast on an idle app, no freeze over 136 ms), so the chug points at the per-card wallpaper blur, concurrent agent load, or machine state; ranked proposal revised
---

# Projects view and session-file pane chug — where the time goes

**Symptom (Destin, 2026-09-09).** "Our app currently CHUGS sometimes when opening projects
view or trying to open/view session files in the session file pane."

**Short answer (final, after §1c).** Found and reproduced. Destin narrowed it: "especially
laggy if I just quickly click back-and-forth between files/conversations in project view",
on a solid theme. Every return to the Files tab remounts it, and the remount restarts
the **project file watcher** over the whole project root — and the watcher, unlike file
discovery, does NOT stop at nested repositories or worktrees. Under `~/youcoded-dev` that
is 9,583 directories / 108,730 entries (72,000 of the files inside `worktrees/`); a fresh
watch measured **4.0–4.3 s to ready with 310–372 ms event-loop freezes**, versus 80 ms
for the app checkout alone, and the IPC reply waits for it. In the perf rig with a
worktree-shaped tree, eight rapid Files/Conversations clicks blocked the main process for
**8.4 s in total, worst single freeze 857 ms** — the whole app stutters while each click
itself paints in 50–380 ms. Opening Projects rose from 0.9 s to 2.2 s and a project switch
to 1.0–1.6 s for the same reason. Everything else measured (cards, search, previews,
conversations rows, the 10 MB history record) is small. The session-file pane's cost is a
different set: a 0.7–1.1 s frozen Markdown render on open (measured by the perf rig
2026-08-28), three `git` processes per file open *and* three more on every file change
anywhere in the project, a per-byte decode loop for every image/PDF, and the whole pane
re-drawing on every streamed token.

## 1. What was measured (read-only, outside the app, Destin's real data)

Runner: the real main-process functions bundled under vitest with Electron stubbed,
against `$HOME` as-is. Script kept in the session scratchpad
(`measure-projects-open.test.ts`); it writes nothing.

| Main-process step | Total | Longest freeze |
|---|---|---|
| `JSON.parse` of the 10.6 MB youcoded-dev `artifacts.json` | 9 ms | 0 |
| `readSidecarShared(youcoded-dev)` cold / warm | 16 ms / 0 ms | 0 |
| `listPastSessions()` cold / warm (931 sessions) | 323 ms / 231 ms | 66 / 80 ms |
| `projectAllFiles(youcoded-dev)` cold / warm (3,279 files, truncated) | 77 ms / 49 ms | 26 / 28 ms |
| `listProjectsIndex()` fast path (open step 1) | 13 ms | 10 ms |
| `listProjectsIndex({withCounts})` (open step 2; 2 projects) | 301 ms | 85 ms |
| `listProjectConversations(youcoded-dev)` (746 conversations) | 283 ms | 83 ms |

Reading: the sidecar parse everyone feared is 9 ms on this machine. The global session
scan is the expensive backend piece (~0.3 s) and Projects runs it **twice** per open
(once inside `withCounts`, once inside `list-conversations`), plus again on every project
switch. Its slow part is synchronous file reads on the event loop
(`session-browser.ts:50` `readFileSync`; `transcript-cwd.ts:38-41,68,83` `openSync`/
`readSync`/`readFileSync`/`readdirSync`), which is where the 66–85 ms freezes come from.

Backend total for one Projects open ≈ 13 + 301 + 283 + ~80 (`list-all-files`, called
2–3× but cached 10 s) ≈ **0.65 s**, spread over async steps. Noticeable, not a chug.

## 1b. Measured in the perf rig (packaged app, headless, Destin's data scale)

Added the same day: `scripts/perf-lab/scenario-projects.mjs` (phase `projects`), which
seeds a 1,600-file project carrying a 10 MB file-history record (8,000 records / 28,000
versions, most under worktrees that do not exist) and 700 conversations, then drives the
real Projects view through the debugging protocol with both probes per step. Report:
`perf-reports/2026-09-09-2230-6ccb817-projects-scale.md` (3 passes, stock theme,
llvmpipe software rendering, zero app errors logged).

| Step | Pass 1 (cold) | Median of 3 |
|---|---|---|
| Open Projects → first cards painted | 882 ms | 156 ms |
| Same click → counts landed | 882 ms | 156 ms |
| First search keystroke (flat-mode flip, 116 cards) | 58 ms | 77 ms |
| Keystroke → painted, p95 | 39 ms | 32 ms |
| Type filter → flat grid of 831 cards (4,277 DOM nodes) | 100 ms | 98 ms |
| Scroll that grid to the bottom, 40 screens | 0 long tasks | 0 long tasks |
| Conversations tab, 700 rows (6,367 nodes) | 108 ms | 108 ms |
| Switch small → big project | 200 ms | 233 ms |
| Reopen Projects | 164 ms | 164 ms |
| Worst main-process freeze (IPC round trip), whole run | 92 ms | 136 ms max |
| Renderer long tasks, whole run | 118 ms total, max 64 ms | max 88 ms |

Without the file-history record and the conversations the cold open was 376 ms, so the
backend data is roughly half a second of the cold open — and the cold open's step probe
shows IPC stall 43 ms with zero renderer long tasks, i.e. that half second is the
backend fan-out of §1, not drawing.

**What this changes.** At Destin's data scale, on an idle app, the Projects view is
not slow in this rig: under 0.9 s the first time, under 0.2 s after, no freeze above
136 ms, and mounting 831 cards at once costs 100 ms. The renderer suspects in §3
(unvirtualized grid, per-keystroke re-filter, text previews) are real costs but small
ones. The chug Destin feels therefore comes from something the rig cannot reproduce:

1. **The per-card glass blur on wallpaper themes** — `theme-engine.ts:705` gives every
   `.layer-surface` a `backdrop-filter`, every file card is `.layer-surface`, and the flat
   grid mounts up to 831 of them. `globals.css:1413-1425` records this exact failure
   shipping twice before (drawer tiles: "20–40 live blur regions, each its own
   compositing layer … cards blink in and out"), fixed there by opting the tiles out.
   The rig boots the stock theme under software rendering and cannot see this.
2. **Concurrent live-app load.** The rig opens Projects on an idle app. On Destin's
   machine an agent is usually streaming: the session-file list refetches every 250 ms
   burst, every file change spawns three git processes for the open file, the
   transcript tailer runs, and the main process serves all of it while Projects fans
   out its own calls. The 66–85 ms synchronous reads inside the session scan (§1) land
   on top of that.
3. **Machine state.** This laptop's known post-suspend power wedge slows the whole
   desktop, not just YouCoded ("sometimes" fits an intermittent machine state as well as
   an app cost).

Not reproduced, still unmeasured: a wallpaper theme on a real GPU (needs a dev window on
Destin's display, not the rig), and the session-file pane itself (its rig scenario
exists and its 2026-08-28 numbers are in §4).

## 1c. The tab thrash — reproduced (later on 2026-09-09)

Destin: "it becomes especially laggy/prominent if I just quickly click back-and-forth
between files/conversations in project view. I'm on a basic theme with no blur."

**Mechanism.** `ProjectView.tsx:907-912` mounts only the active tab, so each switch
unmounts it. A Files remount runs `artifacts:list-all-files` again (`FilesTab.tsx:262`)
and `useProjectWatch` (`:321`): unmount → `unwatchProject` drops the last ref and closes
the chokidar watcher (`project-watcher.ts:209-234`); mount → `watchProject` starts a
**new** watcher over the project root, depth 6, and awaits its `ready` before replying
(`:150-175`). Its ignore rule (`isWatchIgnoredPath`, `:60-79`) skips only dot-directories
and `WATCH_SKIP_DIRS`; unlike discovery (`project-file-discovery.ts`, stops at a nested
`.git`) it descends into every nested repo and worktree.

**Measured on Destin's folder** (`scratchpad/time-watcher.mjs`, the app's own chokidar
with identical options, read-only):

| Root | To `ready` | Longest event-loop freeze | Watched | `close()` |
|---|---|---|---|---|
| `~/youcoded-dev` (43 worktrees) | 4,096 / 4,308 / 4,002 ms | 372 / 311 / 358 ms | 9,583 dirs / 108,730 entries | 254–292 ms |
| `~/youcoded-dev/youcoded` alone | 110 / 79 / 78 ms | 10 / 4 / 4 ms | 179 dirs / 2,341 entries | 5–7 ms |

Process RSS also grew ~100 MB per start/close round in that probe (833 → 935 → 1,008 MB);
not confirmed as a leak in the app, noted for the fix's review.

**Reproduced in the rig** (fixture: 1,600 files + the 10 MB record + 700 conversations +
12,052 nested directories under `worktrees/wt-N/`, each a nested repo; shakedown pass):

| Step | Result |
|---|---|
| Open Projects → first cards | 2,197 ms (was 882 ms without the nested tree) |
| Switch big → small / small → big | 983 ms / 1,569 ms (was 67 / 200 ms) |
| Thrash, 8 rounds: each click → painted | to Files 50–64 ms; to Conversations 122–381 ms |
| Thrash, 8 rounds: main-process (IPC) stall | **8,364 ms total, 14 stalls over 250 ms, worst 857 ms, 190 missed pings** |
| Thrash, 8 rounds: renderer | 1,178 ms of long tasks, worst frame gap 328 ms |

The clicks paint fast because the tab swap is cheap; the app then stalls because the
main process is walking 12,000 directories for a watcher that is thrown away on the
next click. Official three-pass numbers: `perf-reports/*-projects-thrash.md`.

**Fix shape (proposed).**
1. Make the watcher stop where discovery stops: skip any directory holding a `.git`
   (dir or file), plus `worktrees/` by the same rule. Users see: the Files tab still
   updates live for the files it actually lists; nothing inside a nested repo was ever
   listed anyway. Cost on youcoded-dev drops from ~4 s to ~0.1 s per start.
2. Do not throw the watcher away between clicks: hold the watch for the whole time
   Project View is open (or a short grace after the last unsubscribe), so a tab switch
   never restarts it. Users see: instant tab switches. Risk: a watcher stays alive up
   to the grace period after leaving the view; bounded and harmless.
3. Reply to `artifacts:watch-project` without awaiting `ready`. The renderer does nothing
   with that reply beyond `ok`.
4. Keep both tabs mounted and toggle visibility, so a return to Files does not refetch
   the list and every visible preview. Users see: the Files tab comes back exactly as
   left (scroll position, previews). Risk: a hidden tab keeps its DOM — small for these
   two tabs.

## 2. Destin's data today

| Thing | Size |
|---|---|
| `~/youcoded-dev/.youcoded/artifacts.json` | 10.6 MB, 8,301 artifacts, 28,431 versions (was 6.4 MB / 21,311 on 2026-08-27: +58 % in 13 days) |
| `~/.youcoded/artifacts.json` | 0.57 MB, 418 artifacts, 1,616 versions (one file has 399) |
| `~/.claude/projects` | 4.4 GB, 936 transcripts in 15 dirs; largest 112 MB |
| `~/.claude/youcoded-projects-index.json` | 65 projects, every `artifactCount` 0 (so counts are recomputed live) |
| Projects shown in the view | 2 (saved folders: youcoded-dev, Home) |
| youcoded-dev Files tab | 3,279 files (discovery cap 2,000 hit, `truncated=true`) |
| One busy session's file list (`list-session`) | 212 records, ~700 KB per call |

## 3. Where the rest of the cost lives — the renderer (unmeasured, traced)

Paths under `youcoded/desktop/src/renderer/`.

**Files tab (`components/project-view/tabs/FilesTab.tsx`)** — opens by default
(`ProjectView.tsx:165`).
- No virtualization anywhere in Project View; folder view maps every entry of the current
  level (`:759-760`), flat mode (any search text or type filter) maps the whole filtered
  set (`:693`), list view maps every row (`:751-752`). Only ChatView uses
  `content-visibility`.
- Every card is `.layer-surface` (`:445`); under a wallpaper theme the theme engine puts
  `backdrop-filter: blur() saturate()` on each `.layer-surface`, and the only cancel is
  scoped to `.command-drawer`. A grid of N cards = N backdrop blurs — the repeated-glass
  paint bug `.claude/rules/react-renderer.md` warns about; its guard
  (`drawer-card-glass.test.ts`) does not cover Project View. Cards also carry
  `hover-lift` transforms.
- Each visible card (`components/ArtifactThumbnail.tsx`, IntersectionObserver-gated with
  100 px margin, `:88-105`) does a real content read: images via `artifacts:read-binary`
  then a per-byte `atob` loop (`:122-126`); Markdown/text/HTML via `artifacts:get`, which
  returns up to 3 MB and is sliced to 2,000 chars only *after* crossing IPC (`:148`);
  Markdown then runs a live `MarkdownHeadPreview` (`:203`); HTML mounts a sandboxed
  `<iframe srcDoc>` per card (`:221`). Roughly 20–30 cards on screen at once, each a full
  IPC read plus parse plus render.
- Per keystroke in search (search box lives in `ProjectView`): `filtered` re-filters all
  records calling `toLowerCase()` and `path.split('/')` per record (`:298-307`);
  `flatResults` sorts the whole set with `localeCompare` (`:410-413`); `contentRows`
  rebuilds a `Set` of every path (`:417-420`); `groupContentHits`/`capGroups` run inline
  in JSX (`:697-698`); `renderFileCard`/`renderFileRow` are plain functions so all N
  elements are re-created; list rows call `relTime()` per row per render (`:528`). The
  `useMemo`s are honest but their inputs change every keystroke, so they never hit.
  Content search also spawns ripgrep per debounced keystroke (300 ms).
- Rebuilt every render in `ProjectView.tsx`: `SEGMENTS` (`:671`), three `findSpaceFor`
  scans (`:685-700`); in `FilesTab.tsx` the `matchesFilters` closure and
  `refreshArtifacts` (`:298`, `:308`).

**Conversations tab** (`tabs/ConversationsTab.tsx:47`): 746 rows, unvirtualized, with
previews from a bounded 64 KB head read per session (fine). Full transcript parse only on
click.

**Duplicated backend calls per open** (`ProjectView.tsx:303,317,368,378,398,410,449` and
`FilesTab.tsx:262`): `list-projects-index` twice (fast then `withCounts`),
`list-all-files` two to three times for the same project in the same tick, the global
session scan twice, `syncspaces:status` twice, plus a 500 ms-debounced re-run of status
and counts on every sync event.

**Watcher** (`main/artifacts/project-watcher.ts:150-175`): chokidar on the project root,
depth 6; the `artifacts:watch-project` IPC awaits chokidar's initial recursive scan before
replying. Every non-edit event invalidates the discovery cache and forces a re-walk
(`ipc-handlers.ts:4840`).

## 4. The session-file pane (files drawer in ChatView)

- **Open a file:** `artifacts:get` (sidecar read is cached; full file read up to 3 MB,
  crosses IPC as one string — fine) → `git:file-status` spawns **three** git processes
  (`main/git/git-service.ts:101,110,122`) → `check-existence` → in edit mode a second
  `artifacts:get` for the mtime token.
- **Every file change anywhere in the project** (`artifacts:changed`, chokidar with a
  500 ms write-settle, no further debounce, fanned to every window): the open file is
  re-fetched (`ActiveArtifactView.tsx:246-273`) and `useGitFileStatus.ts:33-35` spawns
  three more git processes — no path filter, no debounce. During an agent run that edits
  files this is a continuous spawn storm behind the pane Destin is looking at.
- **Markdown open is frozen for 0.7–1.1 s** (perf-lab `scenario-artifacts.mjs`, run
  2026-08-28: markdown small/large 709 / 1,114 ms; code small/large 34 / 44 ms; HTML
  swap 85 ms; keystroke 29 ms). react-markdown + remark-gfm + rehype-highlight are all
  synchronous on the render thread; the known unmemoized `hastText()` per code block is at
  `MarkdownContent.tsx:337` (already filed in
  `2026-09-01-artifact-viewer-spikes.md`, whose "run the scenario" step happened but was
  never written back — those numbers are above).
- **Images / PDF / XLSX / DOCX:** `artifacts:read-binary` enumerates every saved folder
  and the whole central index on every call (`ipc-handlers.ts:4451`), base64-encodes in
  main, then the renderer runs a per-byte `atob` loop (`useArtifactBytes.ts:11-16`), then
  pdf.js copies the bytes again. HTML previews can issue up to 40 of these for inline
  assets, decode, then re-encode each with another per-character loop
  (`html-inline-assets.ts:64-68`), then parse the whole page into an iframe.
- **CodeMirror** builds two full editor states per open (empty doc, then content;
  `CodeEditorView.tsx`) and `doc.toString()` on every render where content changed.
- **Everything re-draws per streamed token:** `SessionDrawer` sits inline in `ChatView`
  (`ChatView.tsx:1310`) with no `React.memo`, and ChatView re-renders per token; the
  `ArtifactProvider` value is a fresh object every App render (`App.tsx:3077`), so every
  artifact consumer re-renders on any App-level change; `ActiveArtifactView` holds the
  draft, so every keystroke re-renders the whole viewer subtree.
- **The session file list** (`artifacts:list-session`, 212 records / ~700 KB for the busy
  session) is re-fetched by the tracker on a 250 ms trailing debounce during agent
  activity and dropped into App state → App-wide re-render each time.

## 5. Proposal, ranked by expected effect on what Destin feels

**Final ranking (2026-09-09, after §1c).** The measured chug is the watcher restart on
every Files-tab remount over a tree the watcher should never walk. That fix (§1c, items
1–4) is first and on its own removes what Destin described. The rig's `projects` phase
now gates it: `thrash.ipcMaxMs` and `thrash.longtaskTotalMs` must fall, `open.openMs`
and `switch.bigMs` with them. Everything below stays as measured-small improvements,
in this order: C1 (git spawns), C4 (per-token redraw), C2 (Markdown open), B1 (session
scan cache), A4 (search transition), A1 (virtualization), A3 (previews), C3 (binary
transfer). A2 (per-card blur) applies only to wallpaper themes, which Destin does not
use; keep it filed for those users.

**Step 0 — none needed.** The theme question is answered (solid) and the symptom is
reproduced in the rig; no dev-window check is required before fixing.

**A. Files tab drawing (likely the biggest win for "opening Projects").**
1. Virtualize the grid and list (draw only the cards on screen plus a margin). Users see:
   the tab appears at once regardless of file count; scrolling stays smooth. Risk:
   browser find-in-page will not find off-screen cards; scrollbar length is estimated
   until cards measure. Mitigation: fixed card height (cards are already `h-44`), so
   the estimate is exact.
2. One glass layer behind the grid instead of a blur per card (the same fix the drawer
   cards got). Users see: identical look at rest, smoother scroll on wallpaper themes.
   Risk: a card over a busy wallpaper region loses its own local blur; the shared layer
   behind the grid covers the same area, so this should be invisible.
3. Thumbnails: return only the first 2 KB from `artifacts:get` for previews (a `head`
   option), cache rendered previews per (path, mtime) in memory, and render HTML cards as
   a static snapshot or skip the live iframe. Users see: previews appear faster and do
   not re-fetch when the tab re-opens. Risk: HTML previews lose animation/scripts in the
   thumbnail (they are `pointer-events: none` already, so nothing interactive is lost).
4. Search: precompute a lowercase path index once per file list; wrap search updates in
   `startTransition` so typing never waits on the re-filter; memoize card components.
   Users see: keystrokes land instantly, results follow a beat later.

**B. Projects open (backend; small but cheap).**
1. Cache the global session scan in main for a few seconds and invalidate it from the
   transcript watcher; move its synchronous reads to async. Removes one of the two 0.3 s
   scans and the 66–85 ms freezes. Users see: nothing changes visually; other things
   (chat streaming, terminal) stop hitching while Projects loads. Risk: a conversation
   created by the Claude Code CLI outside the app shows up on the next refresh instead of
   instantly — mitigated by watcher invalidation.
2. Drop the duplicate `list-all-files` and `syncspaces:status` calls per open; share one
   promise.
3. Keep showing the project list immediately and let counts fill in (the code already
   splits the two calls; make the Conversations tab render its list before counts
   arrive).

**C. Session-file pane.**
1. Git status: filter `artifacts:changed` to the open file's own path, debounce, and
   collapse the three git calls into one `status --porcelain=v2` where possible. Users
   see: the pane stops hitching while an agent edits other files. Risk: none visible.
2. Markdown open: memoize `hastText`, and render long documents progressively (first
   screen immediately, rest on idle). Users see: a 1 s freeze becomes an instant first
   screen. Risk: a brief moment where the scrollbar grows as the rest fills in.
3. Binary path: send bytes as an `ArrayBuffer` over IPC instead of base64 + per-byte loop;
   stop enumerating every root on each call (resolve the artifact's own root first).
   Users see: images and PDFs open faster; HTML with many assets no longer stalls.
   Risk: the remote web client's transport (WebSocket) needs the base64 form kept there —
   desktop and remote must be checked separately.
4. Stop the per-token re-draw: `React.memo` on `SessionDrawer`, a stable
   `ArtifactProvider` value, and keep the draft state inside the editor. Users see:
   editing a file while an answer streams stays smooth.
5. CodeMirror: build one state per open, not two.

**D. Data hygiene (Destin's call, not a side effect).** `artifacts.json` is 10.6 MB and
grew 58 % in 13 days; parse is 9 ms here, so it is not today's chug, but every
`list-session` reply is ~700 KB and the file has no cap. Options, each a data decision:
stop recording `read` events (17 % of versions; they only make Read tool cards clickable
in the drawer), cap versions per file, prune records for worktrees that no longer exist
(44 % of artifacts on 2026-08-27). PR #318 deliberately declined to trim; that stance is
unchanged until Destin says otherwise.

## 6. UX to add while in there (cheap, same code)
- Projects page: show the list at once and let counts tick in, with a subtle "counting…"
  state instead of a blank number.
- Files tab: remember the last project's file list in memory so re-opening Projects is
  instant, refreshed by the watcher.
- Session-file pane: progressive Markdown so big docs feel instant; a small "checking git"
  shimmer replaces silent stalls.

## 7. Open questions for Destin
- Go ahead with the watcher fix (§1c items 1–4) as one branch, gated by the rig's
  `projects` phase before/after?
- Then the session-file pane set (C1, C4, C2) as a second branch?
- Any appetite for D (data trimming), and if so which of the three cuts?
