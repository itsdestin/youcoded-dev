---
status: draft
date: 2026-07-20
owner: Destin (decisions) / Claude (spec)
roadmap: "ROADMAP.md → Features → Artifact pane → credible code editor (Tier 1 workstream)"
---

# Artifact pane → credible code editor (Tier 1)

> **Read §2 before implementing.** Four pre-existing defects were found while
> speccing this, and three of them are load-bearing: the conflict banner is
> unreachable dead code, there is no dirty tracking at all, and `artifacts:get`
> has no size cap. Unlocking code editing on top of that substrate ships a
> data-loss bug, not a feature. The defect fixes are **inside** this workstream's
> scope, not follow-ups.

## 1. Goal and framing

Make the artifact pane good enough that a developer can review, navigate, and make
surgical edits to real code without leaving the app.

**The framing is deliberately not IDE parity.** `docs/active/specs/2026-07-09-platform-vision-roadmap.md:139`
positions YouCoded as "the open, personal Cowork" with non-developer accessibility
as core identity, and its competitive matrix (L112–139) contains no row for an
editor, file tree, or diff view. This workstream is a considered departure from
that, justified under a narrower claim: **"I can trust and steer what the agent did
to my code."** Review, diff, navigate, small edits. Not: build a Cursor competitor.

That claim is the scope test. Anything that only serves IDE parity — LSP, debugger,
tabs, a file tree — is filed separately on the roadmap and is out of scope here.

**Non-goals for this workstream:** editor tabs; a persistent file tree; git UI;
symbol navigation; LSP; multi-cursor/macro-tier editor features; a project-wide
"replace all"; changing the chat tool-card diff's visual design (§6 swaps its
engine only).

## 2. What the substrate actually looks like (verified 2026-07-20)

The five changes in §4–§8 are cheap *because* the plumbing exists. But the same
investigation found four defects that the current 3-extension allowlist has been
masking. Each is a real bug today; each becomes a data-loss bug the moment code
files are editable.

### 2.1 The conflict banner is unreachable dead code

`ActiveArtifactView.tsx:76-88` subscribes to `artifacts:changed` and raises the
"Claude also edited this file" banner only when:

```tsx
if (evt.projectRoot === projectRoot && evt.artifactId === artifact.id && evt.by === 'agent') {
```

**Nothing in the codebase ever emits `by: 'agent'`.** Every emitter in
`ipc-handlers.ts` (`:2879`, `:2899`, `:2915`, `:3125`, `:3142`, `:3201`, `:3225`)
hardcodes `by: 'user'`. Worse, there is no filesystem watcher on project files at
all, so when Claude writes a file through the CLI **no event is emitted in the
first place**. The banner at `:155-179`, its three resolve actions (`:116-128`),
and the side-by-side `<pre>` view (`:181-192`) have never fired in production.

The subscription is also gated on `if (!editing) return` (`:77`), so even a
correct event would be ignored unless the user happens to be in edit mode.

Consequence: the safety net this workstream depends on does not exist. §8 (the
watcher) is what makes it real, and is therefore **not optional** — it is the
prerequisite for §4, not an independent nice-to-have.

### 2.2 There is no dirty tracking

No `dirty` / `isDirty` / `unsaved` state exists anywhere (`artifact-views/`,
`SessionDrawer.tsx`, `FilesTab.tsx` — zero hits). No `beforeunload` handler.
Switching artifacts force-exits edit mode:

```tsx
// ActiveArtifactView.tsx:71-73
useEffect(() => { setEditing(false); }, [artifact.id]);
```

and the draft resets on `content` identity change (`:60-64`). So switching files,
closing the drawer, or quitting **silently discards the draft with no prompt.**
Tolerable when the only editable things are `.md`/`.txt` notes. Not tolerable for
source files.

There is a subtle related hazard the code already documents at `:66-70`: both hosts
`setContent(null)` before the fetch resolves (`SessionDrawer.tsx:150`,
`FilesTab.tsx:537-545`), which transiently sets `draft` to `''`. The `:71-73`
effect exists precisely to close the window where a save during that gap would
truncate a file to empty. **Any change to the draft/content lifecycle must preserve
that guarantee** — this is the single highest-risk regression in the workstream.

### 2.3 `artifacts:get` has no size cap

`ipc-handlers.ts:3032` is a naked read:

```ts
content = await fs.promises.readFile(fullPath, 'utf8');
```

No `stat`, no byte cap, no binary sniff, no line cap, no truncation flag. Contrast
`READ_BINARY` (`:3053-3092`), which enforces `READ_BINARY_MAX_BYTES = 50MB` plus a
path allowlist — none of which applies to `GET`.

A 5MB file today is read whole, decoded as UTF-8 (binary yields U+FFFD, not an
error), shipped over IPC — and over the WebSocket verbatim as a JSON string in
remote mode — then `CodeView` builds a *second* 5MB string
(`'```' + lang + '\n' + content + '\n```'`) and hands it to highlight.js
synchronously. Multi-second main-thread block. The gate belongs in the `GET`
handler, not the viewer.

### 2.4 Save is unconditional last-write-wins

`artifacts:save` (`:3094-3145`) takes `(projectRoot, projectId, projectName,
artifactId, newContent, sessionId)` — **no version, mtime, hash, or base-content
parameter**, and no read-before-write comparison. `artifacts:get` returns
`{ ok, artifact, content, orphan }` with no mtime or size either, so there is no
token that could be round-tripped for optimistic concurrency even if save wanted one.

The error path is also silent — `ActiveArtifactView.tsx:105-106` logs to console
with no UI feedback, so a failed save currently looks identical to a successful one
except that edit mode stays open.

### 2.5 Two smaller facts that shape the work

- **`.tmp` sibling writes.** Save writes `fullPath + '.tmp'` then renames
  (`:3113-3114`). For code files this means a transient `foo.ts.tmp` appears in the
  project directory — visible to the §8 watcher, and to the user's own linters and
  git status. The watcher must ignore `*.tmp`.
- **Content never refetches.** The only consumer of `artifacts:changed` in the whole
  renderer is `ActiveArtifactView.tsx:79` (confirmed by the comment at
  `artifact-actions.ts:19-20`). Content reloads solely on *selection* change. So the
  pane silently shows stale content after any external edit.

## 3. Decisions (Destin, 2026-07-20)

| # | Decision | Chosen | Rationale |
|---|---|---|---|
| D1 | Syntax colors | **Derive from existing tokens** | Every existing community theme gets coherent code colors for free; no `wecoded-themes` authoring story, no back-fill, no theme-builder changes. `theme-engine.ts:239-245` already derives `--code` this way — extend the same technique. |
| D2 | Cross-file search on Android/remote | **Desktop-only + unsupported notice** | The `remote-unsupported.ts` mechanism already maps `artifacts:` → "Project files". Kotlin gets a ~3-line stub branch to satisfy the parity test. Keeps §7 in Tier 1 cheaply rather than paying for a divergent Kotlin reimplementation. |
| D3 | Unsaved changes | **Prompt on discard** (Save / Discard / Cancel) | Conventional and predictable. Rejected auto-save because it writes to real source files with no explicit user action and races the agent on the same file. |
| D4 | Editable file scope | **Any text file, denylist binaries** | Matches `project-file-discovery.ts:18-22`, which already deliberately avoids an extension allowlist. Also fixes the 9-extension `CodeView` gap in the same change rather than adding extensions forever. |

## 4. Item 1 — Unlock code editing

**Change:** replace the allowlist at `ActiveArtifactView.tsx:46-48`

```tsx
const ext = artifact.path.split('.').pop()?.toLowerCase() ?? '';
// Only plaintext formats support inline editing in v1.
const isEditable = ext === 'md' || ext === 'markdown' || ext === 'txt';
```

with a text-file predicate per **D4**: editable unless the content sniffs as binary
or the file exceeds the §4.2 size cap. Put the predicate in a shared module with
unit tests — it is the security-relevant boundary of the whole feature.

Everything downstream already works: `preload.ts:1234` → `ipc-handlers.ts:3094`,
atomic `.tmp`+rename, sidecar version event via `appendVersion`, `artifacts:changed`
broadcast, path-traversal guard at `:3135-3138`. The discovered-file branch
(`:3130-3144`) correctly skips `appendVersion` so editing a stray file never creates
a `.youcoded/` dir.

**4.1 Dirty tracking (D3).** Add `dirty` state derived from `draft !== content`.
Then:
- Gate the `:71-73` artifact-switch effect and both hosts' selection handlers behind
  a confirm when dirty.
- Add a `beforeunload` handler for app quit (desktop) — note this does nothing on
  Android; the hardware-back path goes through the `useEscClose` LIFO stack instead
  (precedent: the tranche-0 AnchorTip finding in the UI spec).
- **Preserve the §2.2 empty-file guarantee.** The `content === null` transient must
  never be treated as "user deleted everything". Suggested: hold `dirty` false while
  `content === null`, and never allow a save when `content` has not resolved.

**4.2 Size cap.** Add a `stat` + byte cap in the `artifacts:get` handler
(`ipc-handlers.ts:3007`) returning a `truncated`/`tooLarge` flag in the existing
response shape — `project-file-discovery.ts:45-48` already has the
`{ ..., truncated: boolean }` precedent and the UI already surfaces it. Above the cap,
render a read-only notice with "Open in default app" (`window.claude.shell.openPath`,
`preload.ts:681`) rather than a broken editor. Suggested cap: 2MB, tunable — pick the
number by testing a real large file, not by guessing.

**4.3 Save feedback.** Surface save failures in the UI (§2.4). Per the
never-write-misleading-errors rule in `CLAUDE.md` and `docs/error-message-standards.md`:
surface the real `res.error` when there is one, never a hardcoded guess at the cause.

## 5. Item 2 — CodeMirror 6 replaces CodeView

`CodeView.tsx` is 21 lines that don't render code — they wrap the file in a markdown
fence and hand it to the chat renderer (`:9-11`), so every render is a full
react-markdown + rehype-highlight parse. No line numbers, no gutter, no folding, no
selection model. It also covers only 9 extensions (`RendererRegistry.ts:23-54`) —
`rs`, `go`, `java`, `sh`, `kt`, `sql`, `toml`, `c`/`cpp`/`h` all fall through to
`BinaryFallback` today. D4 fixes that in this change.

**CM6 over Monaco, non-negotiable:** Android runs this exact React bundle in a
WebView (`WebViewHost.kt:160`). Monaco is heavy, worker-dependent, and touch-hostile.
CM6 is ~150KB tree-shaken and works on touch. The hard constraint for anything that
ships here: it must load from the `file://` asset origin and reach data only through
`window.claude.artifacts.*` — anything Node-only or `file://`-fetch-dependent breaks
Android (see `useArtifactBytes.ts:20-23`).

**5.1 Lazy-load it.** Follow the existing pattern exactly —
`RendererRegistry.ts:15-21`:

```ts
const PdfView = lazy(() => import('./PdfView').then((m) => ({ default: m.PdfView })));
```

and note `ViewerErrorBoundary` is **required, not optional**: `React.lazy` *throws*
chunk-load rejections and `Suspense` only handles the pending case
(`ViewerErrorBoundary.tsx:6-8`). An unhandled chunk-load failure is a real offline
failure mode in the Android WebView. There is no bundle-size budget or `manualChunks`
config in the repo (`vite.config.ts` is 37 lines, no `rollupOptions`) — splitting is
whatever Rollup does off dynamic `import()`.

**5.2 Theming (D1).** There are **no syntax tokens to map to today.** `--code` is the
only code-adjacent token and it is derived, not authored (`theme-engine.ts:239-245`,
emitted at `:280`). highlight.js is a binary light/dark stylesheet swap
(`theme-context.tsx:132-137`), so Crème and Hello Kitty both get GitHub Light.

Per D1, derive a CM6 `HighlightStyle` for ~6 roles (keyword, string, comment, number,
function, type) from `--accent` / `--fg-2` / `--fg-dim` / `--link` / `--code`, using
the same distance-based technique `theme-engine.ts` uses for `--code`. Read them the
way `TerminalView.tsx:18-26` reads xterm's theme — `getComputedStyle(document.documentElement)`
with hardcoded fallbacks — and re-apply from a `useEffect` keyed on `activeTheme`
inside a `requestAnimationFrame`, mirroring `TerminalView.tsx:68-84`.

**Open sub-decision:** whether derived syntax colors need
`scripts/audit-theme-contrast.mjs` coverage. Recommend yes — the tranche-0 Crème
contrast bug (a real shipping bug found by that audit) is the precedent for deriving
colors and *then* discovering they fail contrast on some theme. Cheap to add now,
annoying to retrofit.

**5.3 Keep the right-click contract.** `build-menu.ts` keys the artifact-viewer branch
off `data-artifact-viewer` / `data-doc-path` / `data-artifact-source`, and computes
line numbers only for `data-artifact-source="raw"` using first-occurrence `indexOf`
over `textContent` (NOT `innerText` — layout-dependent, not implemented by jsdom).
The editable branch keys off the `.artifact-edit-textarea` class, because Electron
ships no default context menu. **A CM6 editor is neither a `<pre>` nor a `<textarea>`**,
so both branches break unless deliberately re-pointed. Pinned by
`build-menu.test.tsx` (6 tests) — expect those to go red, and treat that as the
feature working as designed, not as noise to silence.

## 6. Item 3 — jsdiff replaces the hand-rolled diffs

`diff@^9.0.0` + `@types/diff` are already dependencies (`package.json:33`) and already
used in main (`harness/tools/edit.ts:3` → `structuredPatch()` → `toHunks()`), so this
adds no dependency — only renderer bundle cost.

Two call sites:

**6.1 `ToolBody.tsx`.** Keep `rowsFromHunk` (`:296-316`) and the whole render path
(`:370-425`) — the `structuredPatch` path is correct and produces absolute file line
numbers. Replace only the **fallback**: `diffLines()` at `:260-289`, a full
`(m+1)×(n+1)` DP LCS table used when the tool hasn't produced a structured result
yet. Its line numbers are relative to the `old_string`/`new_string` blocks, not the
file.

Preserve deliberately: the `DiffRow` union (`:252-255`), `DIFF_PREVIEW_LINES = 15` /
`DIFF_ROW_PX = 20` capping (`:245-246`, `:355-358`), the `hunkBoundaries` `⋯`
separator, the `calc(${gutterWidth}ch + 0.75rem)` gutter (Tailwind's global
`border-box` eats `px-1.5`), and the **hardcoded** red/green row colors — those are
intentionally theme-independent per the comment at `:236-244`, because pastel
`text-red-200` washed out on high-chroma theme canvases. Do not "fix" them to tokens.

**6.2 `ActiveArtifactView.tsx:181-192`.** The conflict "View diff" is not a diff — it
is two raw `<pre>` columns side by side, and the comment at `:154` already flags that
a real diff library was deferred. Point it at the same component §6.1 produces. This
is the change that makes §2.1's now-reachable conflict banner actually useful.

## 7. Item 4 — Cross-file content search

`@vscode/ripgrep@^1.18.0` is already a dependency, wired only to the agent's Grep
tool (`harness/tools/grep.ts:3,35`) with no renderer caller. The UI can only filter by
*filename* today: `FilesTab.tsx:226-227` (names, explicitly not folder names),
`SessionDrawer.tsx:360-370` (name search), `ContentFindBar.tsx` (within the open
document only).

**7.1 Reuse the invocation, add parsing.** `grep.ts:22-27` has the arg recipe
(`--no-config --hidden --glob '!.git' --max-count 500`, `--` terminator before
pattern and path). **`grep.ts` does no output parsing at all** — it returns raw
stdout verbatim (`:65`). A renderer-facing channel needs structured results, so use
rg's `--json` mode rather than splitting `file:line:text` by hand.

Carry over its hard-won limits and traps: `caps: { maxChars: 30_000, maxLines: 250 }`
(`:18`), the 200KB stdout accumulation gate (`:39`), `ctx.signal` → `SIGKILL`
cancellation with aborted-signal handling (`:44-45`, `:53-61`, SIGKILL yields exit
code `null` not `2`), and exit-code semantics (`1` = no matches, not an error).

**Always pass an explicit `cwd`.** `grep.ts:29-34` documents the packaging bug: Grep
was the only tool spawning without `cwd`, so in the packaged app rg inherited a
non-directory ambient cwd and failed *every* search with `spawn ENOTDIR`. Packaging
needs nothing new — `@vscode/ripgrep` resolves per-platform via npm
`optionalDependencies` (12 platform packages in `package-lock.json:2703-2714`) and
ships inside the asar via `files: node_modules/**/*`; it is **not** in `asarUnpack`
and does not need to be.

**7.2 The 3-surface parity checklist** (from `ipc-channels.test.ts:417-495`, which
auto-generates its cases by regexing `ipc-channels.ts` — so no new test cases are
written by hand):

1. Add the key to `ARTIFACT_IPC` in `main/artifacts/ipc-channels.ts`. **The comment
   must contain no apostrophes** — the parity test scans for any single-quoted string,
   so `folder's` becomes a phantom channel and fails the suite. The file warns about
   this twice (`:4-6`, `:31-33`).
2. `ipcMain.handle(ARTIFACT_IPC.X, ...)` in `ipc-handlers.ts`.
3. Positional-arg wrapper in `preload.ts` — written as a **literal string**, not
   `ARTIFACT_IPC.X`, because preload cannot import from `src/main/` under the sandbox
   (`ipc-channels.test.ts:5-7`).
4. Object-payload wrapper in `remote-shim.ts` (note: different convention from
   preload's positional args).
5. Stub branch in `SessionService.kt` per **D2** — precedent at
   `ipc-channels.test.ts:501-506`, where `project:*` carries stub cases returning
   not-implemented-on-mobile so the type strings stay in parity.
6. **Add the entry to `CHANNEL_TO_CONST`** in `ipc-channels.test.ts:430-452`. This map
   is a hand-maintained duplicate and is **currently stale** — it lacks
   `REMOVE_RECORD`, which passes only via its literal form. A channel registered by
   constant and missing from this map will fail.
7. No `remote-unsupported.ts` change needed — `artifacts:` → "Project files" already
   exists in `FEATURE_NAMES`.

## 8. Item 5 — Project-directory watcher

Per §2.1 this is the **prerequisite** for §4, not an independent item: it is what
makes the conflict banner reachable and the pane non-stale.

**8.1 Watcher.** `chokidar@^4.0.3` is already a dependency with two precedents. Follow
`sync-spaces/engine.ts:83-88` (the closer analogue — it watches a project root, not a
themes dir):

```ts
const watcher = chokidar.watch(space.root, {
  ignored: WATCH_IGNORED,
  ignoreInitial: true,
  followSymlinks: false,
  awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
});
```

Copy its structure wholesale: the regex-array `ignored` (chokidar v4 dropped
glob-string `ignored`), awaiting `ready` before returning with **both `ready` and
`error` resolving** so a watch failure cannot hang startup (`:94-97`), the `stopped`
latch so teardown racing an in-flight add closes the watcher instead of stranding it
(`:101`), and the try/catch that degrades to "no live refresh" rather than crashing
(`theme-watcher.ts:52`, `:70-72`).

`WATCH_IGNORED` must cover `.youcoded`, `node_modules`, `.git`, **and `*.tmp`** per
§2.5 — otherwise every save triggers a watcher event for its own temp file. Reuse
`project-file-discovery.ts`'s `SKIP_DIRS` (`:32-37`) and dot-directory rule (`:94`)
so the watcher and the discovery pass agree on what exists; a mismatch produces
events for files the UI will never list.

**8.2 Emit `by: 'agent'` and fix the dead filter.** The watcher is the first correct
source of `by: 'agent'`. Fix the §2.1 gate: the subscription must run whether or not
`editing` is true (a non-editing viewer should refresh; an editing one should raise
the banner).

**8.3 Refresh content, not just the banner.** Wire `artifacts:changed` to refetch when
the changed artifact is the open one — today nothing does this (`artifact-actions.ts:19-20`).
Invalidate the discovery cache too (`invalidateDiscoveryCache`, TTL
`CACHE_TTL_MS = 10_000`) so the file list reflects created/deleted files.

**8.4 Guard the save→watch→reload loop.** A save writes the file, which the watcher
sees, which broadcasts `changed`, which (per 8.3) refetches and resets `draft` via the
`:60-64` effect. Debounce and/or suppress the echo for the app's own writes — the save
handler knows it just wrote. Get this wrong and the editor fights the user mid-typing.

**8.5 Cost.** Watching a large repo is not free. Respect the existing discovery caps
(`MAX_FILES = 2000`, `MAX_DIRS = 4000`, `MAX_DEPTH = 6`, `TIME_BUDGET_MS = 1500`) and
scope the watcher to one active project at a time, not every project in the index.

## 9. Sequencing

The five items are one PR because they land in the same three files and splitting them
means three rounds of the same regression testing. Within the PR:

1. **§8 watcher + §2.1 dead-filter fix.** The prerequisite. Verifiable on its own: edit
   a file externally, watch the pane refresh.
2. **§4.2 size cap + §4.3 save feedback.** Small, independent, reduce blast radius.
3. **§6 jsdiff.** Self-contained; makes the conflict UI useful before it can be reached.
4. **§4 unlock + §4.1 dirty tracking.** The behavior change. Lands only after the
   safety net above is real.
5. **§5 CM6.** The largest and most visible; the `build-menu.test.tsx` breakage lands here.
6. **§7 search.** Genuinely independent — cut it to a follow-up PR if the diff gets
   unwieldy, per D2's framing that it is arguably a separate feature.

## 10. Risks

| Risk | Mitigation |
|---|---|
| **Empty-file truncation** (§2.2) — the `content === null` transient during fetch, guarded today only by the `:71-73` force-exit which §4.1 modifies | Highest-risk item in the workstream. Never save while `content` is unresolved; pin with a test that simulates the null-then-resolve sequence. |
| **Save↔watch feedback loop** (§8.4) | Suppress the app's own write echo; debounce. |
| **`build-menu.test.tsx` goes red** (§5.3) | Expected and correct — re-point both branches at the CM6 DOM, don't weaken the tests. |
| **Derived syntax colors fail contrast on some themes** (§5.2) | Add `audit-theme-contrast.mjs` coverage in the same PR — precedent is the tranche-0 Crème bug. |
| **Android bundle/offline regression** from the CM6 chunk (§5.1) | `ViewerErrorBoundary` around the lazy import; verify on a debug APK, not just desktop. |
| **Parity test fails on a stale `CHANNEL_TO_CONST`** (§7.2 step 6) | Explicit checklist step. |
| **Perf on large repos** (§8.5) | Watcher scoped to the active project; reuse discovery caps. |

## 11. Verification

Per `.claude/rules/live-app-safety.md` this is dev-instance work — `bash scripts/run-dev.sh`,
never the built app. Per the 2026-07-16 lesson in `CLAUDE.md`, the final "does the editor
feel right" pass is **Destin's eyeball, not a scripted CDP rig** — ask before building
verification tooling for interactive behavior.

Unit-pinnable and therefore required:
- The text-file/binary predicate (§4) — it is the feature's security boundary.
- The null-content save guard (§10, row 1).
- jsdiff row output against the existing `DiffRow` shape (§6).
- `build-menu.test.tsx` re-pointed at the CM6 DOM (§5.3).
- IPC parity — automatic, provided §7.2's checklist is followed.

Needs a device, not a test: Android CM6 touch behavior, offline chunk load, and the
long-press context menu (which per `ROADMAP.md:174` has never been dogfooded at all —
do not assume it works today, and do not let this workstream be the thing that gets
blamed for it).

Needs Destin's eye: editor feel, syntax color derivation across several themes
(check at least one high-chroma wallpaper theme and Crème), and diff readability.
