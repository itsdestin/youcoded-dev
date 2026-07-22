---
status: draft
date: 2026-07-20
amended: 2026-07-20 (consequence review — §12 added; §4, §5.3, §8.2, §8.5 CORRECTED in place)
owner: Destin (decisions) / Claude (spec)
roadmap: "ROADMAP.md → Features → Artifact pane → credible code editor (Tier 1 workstream)"
blocked_on: "D5 (§3) — deny-list scope for editable paths. Do not implement §4 until decided."
---

# Artifact pane → credible code editor (Tier 1)

> **Read §2 and §12 before implementing.**
>
> **§2** — four pre-existing defects the current 3-extension allowlist has been
> masking: the conflict banner is unreachable dead code, there is no dirty
> tracking at all, `artifacts:get` has no size cap, and save is unconditional
> last-write-wins. Unlocking code editing on that substrate ships a data-loss
> bug, not a feature. The fixes are **inside** this workstream's scope.
>
> **§12** — a consequence review on 2026-07-20 found that **D4 as originally
> specced removes the only barrier standing in front of arbitrary file writes**
> (§12.1), and that `artifacts:save` bypasses write-guard in both directions
> (§12.2). §4 is **blocked on D5** until the deny-list scope is decided.
>
> **Four sections of the first draft were WRONG and are corrected in place** —
> §4 (the predicate belongs in main, not the renderer), §5.3 (the pinning test
> stays *green* while the feature silently breaks — the opposite of what the
> draft claimed), §8.2 (a watcher cannot emit `by: 'agent'`; that label would be
> a fabricated cause), and §8.5 (watcher topology). Each carries a
> **`CORRECTED 2026-07-20`** marker. Do not implement from an earlier copy.

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
| D4 | Editable file scope | **Any text file, denylist binaries** | Matches `project-file-discovery.ts:18-22`, which already deliberately avoids an extension allowlist. Also fixes the 9-extension `CodeView` gap in the same change rather than adding extensions forever. **Constrained by D5 — see §12.1.** |
| D5 | Deny-list scope for editable paths | **Resolved 2026-07-22 — tiered deny/confirm/free** | `.git/`, `.youcoded/`, and the read-binary sensitive set (minus dotenv) are **never editable** (main-enforced boundary, applied to the resolved absolute path so tracked externals are covered); `.claude/` and `.env*`/`.envrc` are **editable behind a confirm** (dialog on entering edit mode, save carries `confirmed: true`, main requires it); `CLAUDE.md` is **free**. Full table + refusal UX: `docs/active/plans/2026-07-22-artifact-pane-code-editor-implementation.md` §1. |

## 4. Item 1 — Unlock code editing

> **CORRECTED 2026-07-20.** The first draft said to replace the allowlist at
> `ActiveArtifactView.tsx:46-48` with a text-file predicate, and called that
> predicate "the security-relevant boundary." **That was wrong in an important
> way: a renderer-side predicate is not a boundary at all.** The main process
> enforces nothing but path traversal (§12.1), so the renderer allowlist is
> load-bearing security by accident. The predicate must live in **main**, and it
> needs a path deny-list, not just a binary sniff. **Blocked on D5.**

**Change:** replace the renderer allowlist at `ActiveArtifactView.tsx:46-48`

```tsx
const ext = artifact.path.split('.').pop()?.toLowerCase() ?? '';
// Only plaintext formats support inline editing in v1.
const isEditable = ext === 'md' || ext === 'markdown' || ext === 'txt';
```

with a predicate that is **enforced in main and mirrored in the renderer** — main
for the boundary, renderer only so the UI can hide the Edit affordance instead of
offering an action that will be refused. Per D4 a file is editable unless it (a)
hits the D5 deny-list, (b) sniffs as binary, or (c) exceeds the §4.2 size cap.

Enforce it inside the `artifacts:save` handler (`ipc-handlers.ts:3094`), on **both**
branches — the tracked branch at `:3108-3128` and the discovered branch at
`:3130-3144`. Note the tracked branch writes `artifact.absolutePath!` with no
traversal check at all (§12.1), so a deny-list that only guards the discovered
branch is trivially bypassable. Seed the deny-list from the one that already exists:
`read-binary-access.ts:62-71`.

**Order of operations matters** (they interact — see §4.2): `stat` → size gate →
read a head slice → binary sniff → deny-list check → decide. Do not read the whole
file to decide whether it is too large to read.

Put the predicate in a shared module with unit tests — it is the feature's real
security boundary, so it is the one piece here that must be pinned.

Everything else downstream already works: `preload.ts:1234` → `ipc-handlers.ts:3094`,
atomic `.tmp`+rename, sidecar version event via `appendVersion`, `artifacts:changed`
broadcast. The discovered-file branch correctly skips `appendVersion` so editing a
stray file never creates a `.youcoded/` dir.

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

**5.3 Keep the right-click contract.**

> **CORRECTED 2026-07-20.** The first draft said "expect `build-menu.test.tsx` to go
> red, and treat that as the feature working." **The opposite is true and it is the
> dangerous direction.** The test hand-builds a synthetic `<pre>`
> (`build-menu.test.tsx:10-19`) and never mounts CodeView, so it stays **green**
> against a DOM shape that no longer exists in production. The regression ships
> silently.

`build-menu.ts` keys the artifact-viewer branch off `data-artifact-viewer` /
`data-doc-path` / `data-artifact-source`, and computes line numbers only for
`data-artifact-source="raw"` via first-occurrence `indexOf` over the `<pre>`'s
`textContent` (`build-menu.ts:170-181`). The editable branch keys off the
`.artifact-edit-textarea` class, because Electron ships no default context menu.
**A CM6 editor is neither a `<pre>` nor a `<textarea>`**, so both branches break.

The line-number technique doesn't merely break — it can produce **plausible wrong
output**, which is the worse failure:

- CM6 renders `.cm-line` divs inside `.cm-content`, no `<pre>`. So
  `container.querySelector('pre')` returns `null`, `idx === -1`, and every artifact
  selection silently degrades to the `"quote"` fallback. The feature just dies.
- If someone "fixes" that by pointing at `.cm-content.textContent`, **CM6
  virtualizes**: only viewport-resident lines are in the DOM. A selection at document
  line 800 with 40 lines rendered above it reports "line 41" — no error, no `-1`, no
  fallback. A fabricated file citation gets injected into the prompt scaffold. That
  violates the never-write-misleading-output rule in `CLAUDE.md`, and it is strictly
  worse than the acknowledged first-occurrence collision, which at least stays
  bounded to real earlier occurrences in the file.
- Separately, `.cm-line` divs are block elements — newlines are structural, not
  textual — so concatenated `textContent` contains no `\n` at all and the count
  returns "line 1" for everything even in-viewport.

**Correct replacement:** `view.state.doc.lineAt(view.state.selection.main.from).number`
off the `EditorView`, which is virtualization-immune. Consequence:
`describeArtifactSelection` can no longer be pure-DOM, which is exactly the property
the current test pins — so **the test must be rewritten to mount the real component**,
not adjusted to a new synthetic shape. Budget for this; §5 is meaningfully larger than
"swap the viewer."

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

**8.2 Emit a *truthful* provenance and fix the dead filter.**

> **CORRECTED 2026-07-20.** The first draft said "the watcher is the first correct
> source of `by: 'agent'`." **It is not.** A filesystem watcher cannot tell who wrote
> a file. A `git checkout`, `npm install`, a build step, a formatter, or the user's
> own editor in another window would all be labeled **"Claude also edited this file"**
> — a guessed, unverified cause in a user-facing message, which is exactly what
> `CLAUDE.md` and `docs/error-message-standards.md` prohibit.

Introduce a provenance value that states only what is actually known — e.g.
`by: 'external'`, meaning *changed on disk by something other than this app*. Update
the banner copy to match ("This file changed on disk", not "Claude also edited this
file"), and update the three resolve actions' labels accordingly ("Use Claude's" is
equally a guess — "Use the version on disk" is true).

Then fix the §2.1 gate: `ActiveArtifactView.tsx:77` returns early unless `editing`, so
even a correct event is ignored in read mode. The subscription must run regardless — a
non-editing viewer should refresh (§8.3), an editing one should raise the banner.

Do **not** repurpose the existing `by: 'agent'` string for this. Nothing emits it
today, so it is free to keep for a future genuine agent-attributed signal (the harness
does know when *it* wrote a file); spending it on "we don't know" forecloses that.

**8.3 Refresh content, not just the banner.** Wire `artifacts:changed` to refetch when
the changed artifact is the open one — today nothing does this (`artifact-actions.ts:19-20`).
Invalidate the discovery cache too (`invalidateDiscoveryCache`, TTL
`CACHE_TTL_MS = 10_000`) so the file list reflects created/deleted files.

**8.4 Guard the save→watch→reload loop.** A save writes the file, which the watcher
sees, which broadcasts `changed`, which (per 8.3) refetches and resets `draft` via the
`:60-64` effect. Debounce and/or suppress the echo for the app's own writes — the save
handler knows it just wrote. Get this wrong and the editor fights the user mid-typing.

**8.5 Ownership and cost.**

> **CORRECTED 2026-07-20.** The first draft said to "scope the watcher to one active
> project at a time." That assumes a per-window active project, and **no such concept
> exists.** `projectRoot` derives per-session from `session.cwd` (`App.tsx:1328`);
> sessions detach freely between windows (`createAppWindow` has five call sites in
> `main.ts` — detach-start, detach-live, open-detached, primary, buddy — and no cap);
> and a single window can display two sessions with different cwds simultaneously.
> N windows × M projects is the normal state, not an edge case.

Put the watcher in **main, in a `Map` keyed by `projectRoot`, refcounted** by the
number of interested renderers. Not per-window and not leader-owned:

- *Not per-window* — two windows on the same project would open two watch handles on
  the same tree and each broadcast, so every renderer receives duplicate events; and
  one window closing would tear down a watcher another window still needs.
- *Not leader-owned* — `window-registry.ts:161-167` elects the oldest window as leader
  for "global concerns that should happen exactly once," but the leader has no
  visibility into a non-leader's project. It would watch the wrong tree, or watch all
  of them (a main-process registry with extra steps), and leadership migrates on close
  so the watcher would have to migrate with it.

The shape to copy is `topicWatchers` (`ipc-handlers.ts:2253`) — a `Map` in main keyed
by session, torn down at `:3311-3315`. Heed its documented bug class at `:2314-2315`:
"startWatching OVERWRITES the topicWatchers entry, so without closing the old watcher
[it leaks]." Refcount on subscribe/unsubscribe and close at zero.

Keep the existing broadcast contract — `getAllWebContents()` global send, filtered in
the renderer on `projectRoot` (`ActiveArtifactView.tsx:79-82`). That is the established
pattern and it already works across windows. Note `getAllWebContents()` includes
**buddy windows**, which have no artifact UI; harmless, but don't be surprised by it.

**Cost.** Watching a large repo is not free. Respect the existing discovery caps
(`MAX_FILES = 2000`, `MAX_DIRS = 4000`, `MAX_DEPTH = 6`, `TIME_BUDGET_MS = 1500`) and
only watch project roots that some renderer is actually looking at — not every project
in the index.

## 9. Sequencing

The five items are one PR because they land in the same three files and splitting them
means three rounds of the same regression testing. Within the PR:

0. **D5 decided** (§3 / §12.1). Blocks step 4; nothing else.
1. **§8 watcher + §2.1 dead-filter fix + §8.2 truthful provenance.** The prerequisite.
   Verifiable on its own: edit a file externally, watch the pane refresh.
2. **§4.2 size cap + §4.3 save feedback + §12.9 concurrency token.** Small, independent,
   reduce blast radius. The concurrency token (an mtime/hash round-tripped through
   `artifacts:get` → `artifacts:save`) is what stops the §4.1 prompt from sitting on
   top of a still-clobbering save; it touches the IPC contract, so it wants to land
   before consumers multiply.
3. **§6 jsdiff.** Self-contained; makes the conflict UI useful before it can be reached.
4. **§4 unlock + §4.1 dirty tracking + main-side predicate.** The behavior change and
   the security boundary. Lands only after the safety net above is real, and only
   after D5.
5. **§5 CM6 + §12.6 keyboard guards + §12.7 Android keyboard + the `build-menu.test.tsx`
   rewrite.** The largest and most visible. §5.3 is bigger than a viewer swap — budget
   for the line-number rewrite and the test being rebuilt to mount the real component.
6. **§7 search.** Genuinely independent — cut it to a follow-up PR if the diff gets
   unwieldy, per D2's framing that it is arguably a separate feature. Note §12.10: it
   has nowhere to land until there is a jump-to-line concept.

§12.2 (write-guard bypass) and §12.8 (sidecar growth) are **not** scheduled here — see
their entries for why, and file them as their own roadmap items.

## 10. Risks

| Risk | Mitigation |
|---|---|
| **Arbitrary file writes** (§12.1) — D4 removes the only barrier; main enforces path traversal only, and the tracked save branch writes `artifact.absolutePath!` unchecked | Blocking. Main-side predicate + deny-list on both save branches (§4), decided via D5. |
| **Empty-file truncation** (§2.2) — the `content === null` transient during fetch, guarded today only by the `:71-73` force-exit which §4.1 modifies | Highest-risk *data-loss* item. Never save while `content` is unresolved; pin with a test that simulates the null-then-resolve sequence. |
| **Silent wrong line citations** (§5.3 / §12.3) — CM6 virtualization defeats the `textContent` indexOf technique, and the existing test cannot catch it | Move to `view.state.doc.lineAt()`; rewrite `build-menu.test.tsx` to mount the real component. |
| **Fabricated change attribution** (§8.2) — a watcher labeling every external write as Claude's | Emit `by: 'external'`; reword the banner and its three actions. |
| **Save↔watch feedback loop** (§8.4) | Suppress the app's own write echo; debounce. |
| **`build-menu.test.tsx` stays GREEN while the feature breaks** (§5.3) | The test never mounts CodeView. Rebuild it around the real component — do not trust a passing run here. |
| **Editor-hostile capture-phase key handlers** (§12.6) — Shift+Space cycles the model, Shift+Tab reaches the PTY | Extend the `tagName` guards to `isContentEditable` / `.closest('.cm-editor')`. |
| **Android: cursor hidden behind the soft keyboard** (§12.7) | Feed `--vvp-offset` into CM6's scroll margin. Do NOT reintroduce a root-container shrink. |
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

## 12. Consequence review (2026-07-20)

A review pass after the first draft, asking what this workstream breaks that it
doesn't intend to. Findings ordered by severity. §12.1–§12.5 corrected sections of the
spec above; §12.6–§12.10 are things the first draft simply missed.

### 12.1 D4 removes the only barrier in front of arbitrary file writes — BLOCKING

The renderer allowlist at `ActiveArtifactView.tsx:48` is not merely a UI convenience.
**It is load-bearing security by accident**, because the main process enforces nothing
else.

| Channel | Guard |
|---|---|
| `artifacts:get` (`ipc-handlers.ts:3019-3027`) | path traversal only |
| `artifacts:save` (`:3134-3139`) | path traversal only (byte-identical logic) |
| `artifacts:read-binary` (`:3053`) | roots allowlist **+ sensitive deny-list** |

Only `read-binary` has a deny-list — `read-binary-access.ts:62-71` blocks `.ssh`,
`.gnupg`, `.aws`, `.azure`, `.kube`, `.netrc`, `_netrc`, `.credentials.json`,
`/.config/gh/`, and all `.env*`. GET and SAVE block none of it. That asymmetry is
already a bug worth fixing on its own: **one channel refuses to read `.env`, another
will happily overwrite it.**

`artifactId` is used as a raw relative path (`path.resolve(projectRoot, artifactId)`)
with the only constraint being that it stays under root. The dot-directory skip in
`project-file-discovery.ts:94` is a **listing** filter the IPC never consults. So
lifting the renderer gate exposes, through normal UI flow:

- `.git/hooks/pre-commit` → arbitrary code execution on the user's next commit.
- `.claude/settings.json`, `.claude/hooks/*` → hook config *is* command execution.
- `.env`, `.envrc` → secrets, in direct contradiction of `read-binary`'s policy.
- `CLAUDE.md` → not a dotfile, so it isn't even filtered from the file list today.
- `.youcoded/artifacts.json` → the sidecar itself, which escalates out of the root:
  the **tracked** save branch writes `artifact.absolutePath!` (`:3110-3112`) with
  **no traversal check at all** — it trusts the sidecar completely. A crafted save to
  the sidecar converts an in-root write into an arbitrary out-of-root write.

Note this is not a *regression* introduced by the workstream — main was never
enforcing anything, and the same paths are reachable today by any renderer code that
calls `artifacts.save`. What D4 changes is that it hands the **UI** a live path to all
of them. Fixing it in main (§4) closes the pre-existing hole too.

**D5 is the open decision:** for each of `.git/`, `.claude/`, `.youcoded/`, `.env*`,
and `CLAUDE.md` — not editable at all, editable behind a confirm, or editable freely?
Recommendation: `.git/` and `.youcoded/` never (no legitimate in-pane use, and both
are escalation vectors); `.env*` and `.claude/` behind an explicit confirm;
`CLAUDE.md` freely, since editing it is a normal and expected user action.

> **RESOLVED 2026-07-22.** Decision taken per the recommendation above, with one
> addition surfaced during verification: the deny tier also includes the read-binary
> sensitive set (minus dotenv), checked against the **resolved absolute path** so the
> tracked-external `absolutePath` branch cannot bypass it. Decision table, tier
> semantics (denied = security boundary, confirm = mistake-prevention), and refusal
> UX live in `docs/active/plans/2026-07-22-artifact-pane-code-editor-implementation.md` §1.

### 12.2 `artifacts:save` bypasses write-guard in both directions

`hook-scripts/write-guard.sh` is registered as a Claude Code `PreToolUse` hook on
`Write|Edit` (`install-hooks.js:200`). It is a same-machine concurrency lock, not a
permission guard: it reads `~/.claude/.write-registry.json` and blocks (exit 2) only
when a *different, still-alive* Claude PID last wrote the file. Its whitelist
specifically covers `CLAUDE.md`, `settings.json`, and `mcp.json`
(`write-guard.sh:31-33`) — precisely the files §12.1 is about.

`artifacts:save` calls `fs.promises.writeFile` directly in main
(`ipc-handlers.ts:3113-3114`, `:3140-3141`). No hook dispatch, no registry read —
**and no registry write**. So the break is symmetric: a user editing in the pane isn't
subject to the guard, *and* the agent's next write to that file sees no ownership
conflict because nothing recorded the pane's write.

**Not scheduled in this workstream.** It is a pre-existing gap in a cross-cutting
subsystem (and per `CLAUDE.md` write-guard fixes must currently land in *both*
youcoded-core and the app's bundled copies until the deprecation release ships).
Broadening editability makes it much more likely to bite, so it should become its own
roadmap item — but bolting registry participation onto the artifact save path inside
this PR would couple two subsystems mid-deprecation.

### 12.3 The pinning test cannot catch the line-number regression

Covered in §5.3. Summary: `build-menu.test.tsx:10-19` constructs a synthetic `<pre>`
and never mounts CodeView, so it stays green against a DOM shape that no longer
exists. The failure it fails to catch produces *plausible wrong* line citations
injected into prompts, not visibly absent ones.

### 12.4 A watcher cannot attribute a change to Claude

Covered in §8.2. Summary: `by: 'agent'` from a filesystem watcher would label every
`git checkout`, `npm install`, build step, and third-party editor write as "Claude
also edited this file" — a guessed cause in a user-facing string.

### 12.5 There is no per-window active project

Covered in §8.5. Summary: the draft's "one active project at a time" watcher scoping
assumes a concept that doesn't exist; N windows × M projects is normal.

### 12.6 Capture-phase key handlers don't recognize a contenteditable

Four `window` keydown listeners are registered with `capture: true` and therefore run
**before** CM6 sees anything, regardless of focus:

| Keys | Site | Guard today |
|---|---|---|
| Shift+Space (cycle model) | `App.tsx:1806-1817` | `tagName === 'INPUT' \|\| 'TEXTAREA'` |
| Ctrl+\` | `App.tsx:2263-2270` | none |
| Ctrl/Cmd+O | `App.tsx:2329-2342` | viewMode only |
| Shift+Tab (sends `\x1b[Z` to PTY) | `App.tsx:2419-2429` | none |
| Ctrl/Cmd +/-/0 (zoom) | `useZoomControls.ts:53,67` | — |

**CM6's editable is a contenteditable `<div>`, not a `TEXTAREA`.** So inside the
editor, Shift+Space would `preventDefault()` and cycle the model instead of typing a
space after a capitalized word, and Shift+Tab would reach the PTY instead of
outdenting. Fix: extend the guard idiom at `App.tsx:1809-1812` to check
`isContentEditable` or `.closest('.cm-editor')`, and add a guard where there is none.

Escape is fine and composes correctly by design — it is registered bubble-phase on
purpose (`App.tsx:2311-2317`) so `shouldForwardEscToPty` can read `defaultPrevented`
after capture-phase handlers run. A CM6 keymap that consumes Escape (closing its
search panel) will correctly suppress the PTY interrupt. Undo is uncontested: there is
no Ctrl+Z handler anywhere in the renderer and no `role: 'undo'` in the Electron menu,
so CM6's history extension gets Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y for free.

### 12.7 Android soft-keyboard support is new work, not preservation

Two things the draft assumed carried over, and neither does.

**The artifact pane is not `--vvp-offset`-aware today.** Grepping the drawer/artifact
components and their styles for `vvp-offset` returns zero hits — only chat chrome
consumes it (`globals.css:501,508,524,533,539,1298`). So the *existing* edit textarea
already sits behind the keyboard on Android. This is a gap being inherited, not a
regression, but it stops being ignorable when the surface is a real editor.

**The platform contract is specifically hostile to CM6.** `AndroidManifest` sets
`windowSoftInputMode="adjustNothing"` and `index.html` declares
`interactive-widget=overlays-content` (documented at `useVisualViewport.ts:8-12`), so
the keyboard overlays the page without resizing it: `window.innerHeight` stays
constant while `visualViewport.height` drops — which is the whole basis of the offset
formula at `:30-36`. CM6's mobile path assumes `scrollIntoView` on the cursor will be
compensated by a shrinking layout viewport. It won't be, so CM6 will compute the
cursor as in-view when it is physically behind the keyboard.

Fix by feeding `--vvp-offset` into CM6's scroll margin, or by taking over its
`scrollIntoView`. **Do not** fix it by shrinking the root container —
`globals.css:241-244` records that as a previously-reverted change that "caused a full
layout cascade on every visualViewport sample, which read as jitter."

### 12.8 Sidecar growth degrades super-linearly under D4

`appendVersion` (`artifact-store.ts:58`) pushes to `versions[]` (`artifact-store.ts:108`)
with **no cap, no eviction, no pruning, and no comment acknowledging it** — unlike
`permission-store.ts:25-26`, which at least documents its unbounded growth as
intentional.

The size is minor (~250–300 bytes per event pretty-printed; 500 edits of one file ≈
125–150KB). **The write pattern is the problem:** `appendVersion` does a full
read-parse-mutate-serialize-CAS-write of the *entire* sidecar on every save, with up
to `MAX_RETRIES = 5` attempts (`artifact-store.ts:46`). Cost per save is O(total
sidecar size) across all artifacts. D4 multiplies both the number of tracked records
and the events per record, so the cost grows on two axes at once.

Mitigating asymmetry: the *discovered*-file save branch deliberately skips the sidecar
(`ipc-handlers.ts:3131-3133`), so growth only hits already-tracked files. But
broadening editability makes tracked-file edits far more common.

**Not scheduled in this workstream** — capping or compacting `versions[]` is a change
to the sidecar's on-disk contract and deserves its own item with a migration story.
Worth filing now, before D4 makes it urgent.

### 12.9 The last-write-wins defect was identified and never fixed

§2.4 documents that save takes no version/mtime/hash and does no read-before-write,
and that `artifacts:get` returns no token that could be round-tripped. **The first
draft then never scheduled a fix** — §4 and §9 both omitted it.

That leaves D3's prompt sitting on top of a still-clobbering save: user has unsaved
edits, agent edits the same file, user hits Save, the agent's work is silently gone.
The conflict banner's "Keep mine" (`ActiveArtifactView.tsx:116-119`) does exactly this
by design — it just calls `handleSave()`.

Fix: return an mtime (or content hash) from `artifacts:get`, accept it as an optional
parameter on `artifacts:save`, and reject the write when it no longer matches, surfacing
the conflict UI instead. Now scheduled at §9 step 2, before the editing surface
multiplies the number of writers. Touching the IPC contract means the §7.2 parity
checklist applies.

### 12.10 Search has nowhere to land

Two gaps that make §7 much less useful than it sounds:

- **No tabs** (Tier 2, out of scope here), so clicking a result replaces the single
  active artifact. Combined with D3's unsaved-changes prompt, walking a result list
  while mid-edit means a prompt per result.
- **No jump-to-line concept exists anywhere.** Grepping `scrollIntoView` / `jumpToLine`
  / `gotoLine` / `initialLine` across `artifact-views/` returns zero hits, and no
  `ArtifactAction` carries a line number (`artifact-actions.ts:31-35`).

Selection is a reducer dispatch keyed by **`artifactId`, not path**
(`ACTIVE_ARTIFACT_SET`), so search results (which are paths) need path→id resolution
including the upsert-if-untracked case. **That logic already exists** —
`FilepathToken.tsx:84-130` does exactly this three-tier resolution via
`SESSION_ARTIFACT_UPSERTED`. Reuse it rather than reimplementing; a search hit on an
untracked on-disk file is the same case an inline filepath pill already handles.

For the line target, prefer the existing `useImperativeHandle` handle on
`ActiveArtifactView` (`ActiveArtifactView.tsx:4`, already used for the edit controls)
over adding `line?: number` to the action. State is keyed `activeArtifactBySession`,
so a line stored in state would need consume-once semantics or re-selecting the same
artifact later would re-jump to a stale line. An imperative `revealLine(n)` sidesteps
that entirely.

### 12.11 Minor: undo across conflict resolution

Resolving a conflict with "use the version on disk" replaces the document wholesale.
CM6's history extension would let the user Ctrl+Z back into their pre-resolution text
— a document state that no longer corresponds to anything on disk, in an editor that
now believes it is clean. Clear CM6's history on conflict resolution rather than
letting undo walk across the boundary.
