---
status: active
date: 2026-07-22
pr: https://github.com/itsdestin/youcoded/pull/200
spec: docs/active/specs/2026-07-20-artifact-pane-code-editor.md
repo: youcoded (one PR, branch feat/artifact-code-editor)
---

# Implementation plan: Artifact pane → credible code editor (Tier 1)

Executes the 2026-07-20 spec. The spec (all `CORRECTED 2026-07-20` sections included)
is the authority on *what* and *why*; this plan adds the D5 resolution, concrete
module/channel names, test strategy, and the step-by-step order with done-when
criteria. Every spec claim cited here was re-verified against code on 2026-07-22
(session: D5 decision prep) — implement from the current spec copy only.

**Amended same-day (2026-07-22 second-pass review).** Six gaps found and folded
into the steps below, the largest being that **Android is a second, live
implementation of `artifacts:save`** (`SessionService.kt:3377`) — not a stub — so
a desktop-main-only boundary would leave the same React UI calling an unguarded
Kotlin write path. Each addendum is marked `ADDED 2026-07-22` inline.

## 0. Ground rules

- All code changes go to the **youcoded** sub-repo, in a worktree
  (`worktrees/artifact-code-editor`, branch `feat/artifact-code-editor`), one PR.
- Sync first (`bash setup.sh`), and run `cd youcoded/desktop && npm ci && npm test`
  for a green baseline before touching anything.
- Dev verification via `bash scripts/run-dev.sh` only — never the live app
  (`.claude/rules/live-app-safety.md`).
- Commit per step below so the PR reviews as six coherent chunks.

## 1. D5 — resolved 2026-07-22

Adopted per the recommendation Destin approved in-session (2026-07-22). If any tier
feels wrong, the cheapest moment to change it is before step 4 lands — it is one
table in one pure module.

| Path (checked against the **resolved, canonicalized final path**) | Tier |
|---|---|
| `.git` as any path segment (directory *or* file — the worktree case) | **denied** |
| `.youcoded` as any path segment | **denied** |
| The read-binary sensitive set minus dotenv: `.ssh` `.gnupg` `.aws` `.azure` `.kube` segments; `.netrc` `_netrc` `.credentials.json` basenames; `/.config/gh/` | **denied** |
| `.claude` as any path segment (covers project `.claude/` and `~/.claude/` via tracked externals) | **needs-confirm** |
| Dotenv basenames (`.env`, `.env.*`, `.envrc`) | **needs-confirm** (deliberate divergence from read-binary, which hard-denies reads: the agent's tools are denied, the pane is the *human* escape hatch; `.envrc` gets distinct confirm wording — direnv executes it as shell) |
| Everything else, incl. `CLAUDE.md` / `CLAUDE.local.md` | **free** (subject to binary sniff + size cap) |

Two tiers, two purposes: **denied** is the security boundary (main-enforced, no
bypass); **needs-confirm** is mistake-prevention (renderer dialog on *entering edit
mode*, save carries `confirmed: true`, main refuses confirm-tier saves without it —
the flag records intent, it does not need to be attacker-proof). Precedence is
denied > needs-confirm > free — e.g. `~/.claude/CLAUDE.md` is confirm-tier (the
`.claude` segment wins over the CLAUDE.md free rule), which is coherent: that file
is global agent memory, not a project doc.

**ADDED 2026-07-22 — the boundary is main AND Kotlin, not main alone.**
`SessionService.kt` implements `artifacts:get`/`save`/`read-binary` for real
(`:3324`, `:3377`, `:3357`), and its save writes `artifact.absolutePath!!` with no
checks — the same escalation hole as desktop's tracked branch. Since Android ships
the identical React UI, step 4's unlock would offer editing on Android and Kotlin
would execute it unguarded. The policy must therefore be mirrored as
`EditablePathPolicy.kt` beside `PathCanonicalize.kt`, driven by a **shared JSON
fixture** so the TS and Kotlin implementations cannot drift (the canonicalize
precedent). Android's save is tracked-artifacts-only (no discovered branch), which
narrows its exposure but does not remove it. While in that file: Kotlin
`read-binary` has **no deny-list at all** — desktop's `read-binary-access` guard
was never mirrored (pre-existing gap, `.ssh`/`.env` readable by absolute path).
Porting `isSensitivePath` is the same module we are adding, so it is in scope here
rather than a separate roadmap item.

Refusal UX (per `docs/error-message-standards.md` — specific and accurate):
- Denied: renderer hides the Edit affordance (tooltip: protected file). If a save
  reaches main anyway → `{ok:false, error:'protected-path'}` and an inline pane
  banner naming the actual path and real reason (e.g. ".git controls what runs on
  your machine"). Never console-only.
- Needs-confirm without flag: `{ok:false, error:'needs-confirm'}` — renderer treats
  it as "show the dialog", not as failure.

## 2. Steps

Order follows spec §9 with **one deviation**: the D5 boundary is enforced in main in
step 2, *before* the renderer gate lifts in step 4. Enforcement-before-unlock is
strictly safer and costs nothing (today's renderer only ever saves `md/markdown/txt`,
all free-tier).

### Step 1 — Project watcher + truthful provenance (spec §8, fixes §2.1)

The prerequisite for everything: makes the conflict banner reachable and the pane
non-stale.

- **New `desktop/src/main/artifacts/project-watcher.ts`**: chokidar per the
  `sync-spaces/engine.ts:83-97` template (regex-array `ignored`, `awaitWriteFinish`,
  `ready`+`error` both resolving, `stopped` latch, try/catch degrade). One `Map`
  keyed by canonical `projectRoot`, **refcounted per subscriber `webContents.id`**,
  closed at zero — the `topicWatchers` shape (`ipc-handlers.ts:2253`) including its
  documented overwrite-leak trap. Also drop refs on `webContents` `destroyed` so a
  crashed renderer cannot pin a watcher forever.
- **Ignore list**: `SKIP_DIRS` from `project-file-discovery.ts:32-37` + the dot-dir
  rule + `*.tmp` (the save handler's own temp siblings, §2.5) + `.youcoded`.
- **Echo suppression (§8.4)**: save handler records `(path, mtime)` in a
  recently-written map; the watcher drops events matching a recent own-write (~2s
  TTL). Get this wrong and the editor resets `draft` mid-typing.
- **New IPC** `artifacts:watch-project` / `artifacts:unwatch-project` — full §7.2
  parity checklist (no apostrophes in the `ipc-channels.ts` comment; preload uses
  literal strings; Kotlin stub branches; **add to `CHANNEL_TO_CONST` and fix the
  stale missing `REMOVE_RECORD` entry while there**).
- **Events**: broadcast `ARTIFACT_IPC.CHANGED` with `by: 'external'`,
  `kind: 'edit' | 'add' | 'remove'`. Do NOT emit or repurpose `by: 'agent'` (§8.2).
  Also `invalidateDiscoveryCache(projectRoot)` so file lists refresh (§8.3).
- **ADDED 2026-07-22 — path→artifactId resolution.** The renderer filters events on
  `evt.artifactId === artifact.id`, and **tracked artifact ids are sidecar ids, not
  paths** — but the watcher only sees paths. Without resolving each watched path
  against the sidecar (canonical compare; fall back to the relative path for
  discovered files), the conflict banner stays dead for exactly the tracked files,
  reincarnating the §2.1 bug this step exists to fix. Cache the path→id map and
  invalidate it on sidecar writes.
- **ADDED 2026-07-22 — depth cap.** The seeded "Home" folder can make most of the
  home directory a project root, and a session cwd of `~` would point chokidar at
  the entire home tree. Set chokidar `depth` to match discovery `MAX_DEPTH = 6` so
  the watcher and the file list agree on the visible universe and the walk stays
  bounded.
- **Renderer**: subscribe/unsubscribe from the two hosts on the visible
  `projectRoot`; in `ActiveArtifactView` delete the `by === 'agent'` filter and the
  `if (!editing) return` gate — not-editing (or clean) → refetch content; dirty →
  conflict banner. Reword banner + actions: "This file changed on disk" / "Use the
  version on disk" (never "Claude also edited...").
- **Tests**: extract the ignore predicate + refcount bookkeeping as pure functions
  and unit-test those (chokidar itself is not unit-tested — the sync-spaces
  precedent).
- **Done when**: with the dev instance open on a file, `echo >> file` from a shell
  refreshes the pane within ~1s; two windows on one project produce one watcher and
  no duplicate events; closing both closes it.

### Step 2 — Contract hardening: policy boundary, size cap, mtime token, save feedback (spec §4.2, §4.3, §12.9, §12.1)

- **New `desktop/src/shared/artifacts/editable-path-policy.ts`** (pure, like
  `read-binary-access.ts`; lives in `shared/` so main enforces and the renderer
  mirrors from the same source): `editTier(canonicalAbsPath): 'free' |
  'needs-confirm' | 'denied'` per the §1 table, plus a head-slice binary sniff
  helper. Refactor `read-binary-access.ts` to import the shared sensitive-set
  definitions **without behavior change** (`read-binary-access.test.ts` must stay
  green untouched).
- **`artifacts:get`** (`ipc-handlers.ts:3007`): `stat` first → 2MB cap (tunable;
  return `tooLarge: true` + artifact meta, never the content) → return `mtimeMs`.
  Apply the **denied-tier non-dotenv** sensitive set to reads too (closes the
  read-asymmetry for `.ssh` etc.; dotenv stays readable by design — it is
  confirm-editable). Renderer renders `tooLarge` as a read-only notice with "Open in
  default app" (`shell.openPath`).
- **`artifacts:save`**: on **both branches**, resolve the final path (tracked branch
  included — it currently writes `artifact.absolutePath!` unchecked, §12.1),
  `canonicalize()`, then: policy check (denied → `protected-path`; confirm-tier
  without `confirmed` → `needs-confirm`) → optional `baseMtimeMs` conflict check
  (mismatch → `conflict`) → binary sniff → existing atomic `.tmp`+rename → record
  echo-suppression entry. New save params (`baseMtimeMs?`, `confirmed?`) thread
  through preload (positional) and remote-shim (object) per parity.
- **Renderer**: `ActiveArtifactView` round-trips the mtime token; `conflict` error
  raises the conflict banner (this is what stops D3's prompt from sitting on a
  still-clobbering save); all save failures surface the **real** `res.error` in an
  inline banner — replaces the console-only path (§2.4). The conflict banner's
  "Keep mine" is a deliberate force-save: it omits the token but must still carry
  `confirmed` for confirm-tier files.
- **ADDED 2026-07-22 — resolve symlinks before checking.** `canonicalize()` is pure
  string manipulation and `path.resolve` does not follow symlinks — but `writeFile`
  does, so a symlink inside the root defeats both the traversal guard and the
  deny-list (a link named `notes.md` → `~/.ssh/config` passes every string check).
  Pre-existing hole, but it matters far more post-unlock: `fs.realpath` the parent
  directory of the target before the traversal + policy checks, on get and save.
- **ADDED 2026-07-22 — `binary` flag on get.** `RendererRegistry.getViewer` is a
  hard extension map with `BinaryFallback` for unknowns, so D4's "any text file"
  has no routing path: `rs`/`go`/`toml`/extensionless files would still fall to
  BinaryFallback. The get handler's new head-slice sniff must be returned as
  `binary: boolean`, and `getViewer` grows a content-aware fallback: unknown
  extension + `binary: false` → the code editor view; `binary: true` →
  BinaryFallback (which today would render U+FFFD garbage instead).
- **ADDED 2026-07-22 — Kotlin enforcement (see §1).** Port the policy to
  `EditablePathPolicy.kt` with the shared JSON fixture, enforce it in the Kotlin
  save handler (deny tier + `confirmed` flag; add the `baseMtimeMs` token check for
  parity), and port `isSensitivePath` into the Kotlin `read-binary` handler while
  there. Kotlin-side tests against the same fixture file.
- **Tests** (the §11 must-pins): `editable-path-policy.test.ts` — every tier row,
  segment-vs-basename cases, `.git`-as-file, tracked-external absolute paths,
  `CLAUDE.md` free; sniff cases. Conflict-token accept/reject logic.
- **Done when**: policy tests green; saving with a stale token returns `conflict`;
  `read-binary-access.test.ts` untouched and green.

### Step 3 — jsdiff (spec §6)

- One shared diff component producing the existing `DiffRow` union from jsdiff
  (`structuredPatch` path kept as-is in `ToolBody.tsx`; only the hand-rolled LCS
  fallback at `:260-289` is replaced), consumed by both `ToolBody` and the conflict
  view (`ActiveArtifactView.tsx:181-192`, currently two raw `<pre>` columns).
- Preserve exactly (per §6.1): `DIFF_PREVIEW_LINES`/`DIFF_ROW_PX` capping, `⋯` hunk
  separators, the `calc(ch + rem)` gutter, and the **hardcoded** red/green row
  colors (deliberately theme-independent — do not tokenize).
- **Tests**: jsdiff output → `DiffRow[]` shape against fixtures.
- **Done when**: conflict "View diff" shows a real unified diff; ToolBody snapshots
  unchanged for the structuredPatch path.

### Step 4 — Unlock editing + dirty tracking (spec §4, §4.1, D3, D4, D5)

Lands only now: watcher live, boundary enforced, conflict UI real.

- Replace `ActiveArtifactView.tsx:47-48` (`md|markdown|txt`) with the shared
  `editTier` mirror: denied → no Edit affordance + tooltip; needs-confirm → dialog
  on entering edit mode (tier-specific wording: `.claude` = "hooks run commands",
  dotenv = "usually contains secrets", `.envrc` = "direnv executes this as shell"),
  then save sends `confirmed: true`; free → straight to edit. Binary/`tooLarge`
  files stay non-editable.
- **Dirty tracking**: `dirty = content !== null && draft !== content`. Gate the
  `:71-73` artifact-switch effect and both hosts' selection handlers behind
  Save/Discard/Cancel when dirty; `beforeunload` on desktop.
- **The §2.2 empty-file guarantee is the highest-risk regression**: `dirty` is
  hard-false and save is hard-blocked while `content === null`. Pin with a test
  simulating the null-then-resolve fetch transient.
- **ADDED 2026-07-22 — editing-surface split, decided.** The edit textarea lives
  inside `MarkdownView` (which also serves `txt`); `CodeView` has no edit mode at
  all. For this PR: **md/txt keep the existing textarea; CM6 is the editing surface
  for code files only.** This keeps the `.artifact-edit-textarea` context-menu
  branch live, halves the step-5 blast radius, and defers "one unified editor" to a
  follow-up if CM6 proves itself. Dirty tracking, confirm flow, and the save token
  live in `ActiveArtifactView` and are shared by both surfaces.
- **Done when**: a `.ts` typo is fixable in the dev instance; `.env` edit prompts a
  confirm; `.git/hooks/pre-commit` shows no Edit affordance and a forced save via
  the console returns `protected-path`; switching files while dirty prompts.

### Step 5 — CodeMirror 6 (spec §5, §12.6, §12.7, §12.11)

The largest step — §5.3 makes it more than a viewer swap.

- **New lazy `CodeEditorView`** replacing `CodeView` for text files (lazy-import per
  `RendererRegistry.ts:15-21`; `ViewerErrorBoundary` is required — chunk-load
  rejections throw past Suspense, a real Android-offline mode). Deps:
  `@codemirror/state|view|language|commands` + `@codemirror/language-data` for
  on-demand language chunks. Hard constraint: asset-origin load, data only via
  `window.claude.artifacts.*` (Android WebView). Read-only mode when not editing;
  editing drives the step-4 draft state.
- **Theming (D1)**: derive ~6 highlight roles from `--accent`/`--fg-2`/`--fg-dim`/
  `--link`/`--code` (the `theme-engine.ts:239-245` technique), read via
  `getComputedStyle` with fallbacks, re-applied on `activeTheme` in a rAF (the
  `TerminalView.tsx:68-84` pattern). **Add the derived colors to
  `scripts/audit-theme-contrast.mjs`** — the spec's open sub-decision, resolved
  yes; the Crème precedent says derive-then-discover-contrast-failure is real.
- **Keyboard guards (§12.6)**: extend the Shift+Space guard (`App.tsx:1806-1817`)
  and add one to Shift+Tab (`App.tsx:2419-2429`) using `isContentEditable ||
  target.closest('.cm-editor')`. Leave Escape alone — its bubble-phase composition
  is deliberate and already correct with a CM6 keymap.
- **Right-click contract (§5.3)**: line numbers come from
  `view.state.doc.lineAt(selection.main.from).number` — never DOM `textContent`
  (CM6 virtualizes; indexOf yields *plausible wrong* citations). `build-menu.ts`
  needs a way to reach the live `EditorView`: register the active view in a small
  module registry keyed by the container element (set/cleared by
  `CodeEditorView`), keep the `<pre>` path for MarkdownView/txt.
  **Rewrite `build-menu.test.tsx` to mount the real component** — the current
  synthetic-`<pre>` test stays green while the feature breaks, which is the
  dangerous direction. CM6 under jsdom needs the usual shims
  (`Range.getClientRects` etc.); if it truly will not mount, test through an
  exported selection-info hook on the component, not a rebuilt synthetic DOM.
- **Android (§12.7)**: feed `--vvp-offset` into `EditorView.scrollMargins` so the
  cursor clears the soft keyboard (`adjustNothing` + `overlays-content` breaks
  CM6's assumptions). Do NOT shrink the root container — previously reverted as
  jitter (`globals.css:241-244`).
- **§12.11**: clear CM6 history on conflict resolution so undo cannot cross into a
  document state that no longer corresponds to disk.
- **ADDED 2026-07-22 — Ctrl+F.** `ContentFindBar` finds matches by TreeWalker over
  the rendered DOM (CSS Custom Highlight API) — over CM6's virtualized DOM it
  silently finds only viewport-resident text, the same failure class as the §5.3
  line numbers. Code files must route Ctrl+F to `@codemirror/search` instead;
  ContentFindBar stays for MarkdownView and the other viewers. Pin with a test that
  a match beyond the rendered viewport is findable.
- **Done when**: line numbers/gutter render, editing round-trips through step-4
  save, "Ask about this" cites correct line numbers on a long scrolled file, model
  does not cycle when typing Shift+Space in the editor, rewritten test mounts the
  real component and pins `lineAt`.

### Step 6 — Cross-file search (spec §7, §12.10) — CUT LINE

**CUT 2026-07-22:** steps 1–5 shipped as youcoded PR #200; this step goes to a
follow-up PR per the cut line below (the diff was already five substantial
commits). Everything below remains the follow-up's spec.

Explicitly cuttable to a follow-up PR if the diff is unwieldy (D2 framing). If cut,
everything above still ships whole.

- **New IPC `artifacts:search-content`** (desktop-only per D2; Kotlin stub +
  existing `remote-unsupported` mapping): spawn `@vscode/ripgrep` with the
  `grep.ts:22-27` arg recipe **plus `--json`** for structured results; carry over
  its caps, 200KB stdout gate, SIGKILL/abort semantics, exit-code-1-is-no-match,
  and **always an explicit `cwd`** (the packaged-app `spawn ENOTDIR` trap).
- **UI**: filename/content mode toggle on the existing FilesTab search; results
  jump via a new imperative `revealLine(n)` on `ActiveArtifactView` (§12.10 —
  consume-once by design, not state); path→id resolution reused by extracting
  `FilepathToken.tsx:84-130`'s three-tier upsert into a shared helper.
- **Done when**: searching a term opens the file scrolled to the hit line; Android
  shows the unsupported notice.

## 3. Verification and handoff

- Full suite + build per step; final: `npm ci && npm test && npm run build`, then
  Android `./scripts/build-web-ui.sh && ./gradlew assembleDebug && ./gradlew test`.
- **Device pass (debug APK)**: CM6 touch editing, soft-keyboard cursor visibility,
  offline chunk-load failure mode. Long-press menu status is a pre-existing unknown
  (ROADMAP) — do not let this PR get blamed for it.
- **Destin's eyeball (do not script — ask first per the 2026-07-16 rule)**: editor
  feel, syntax colors on Crème + one high-chroma wallpaper theme, diff
  readability, the confirm-dialog wording.
- Shut the dev server down once merged to master.

## 4. Out of scope (already filed separately)

- §12.2 write-guard bypass (own roadmap item; mid-deprecation dual-landing rule).
- §12.8 sidecar `versions[]` growth (own roadmap item; on-disk contract change).
- Editor tabs, file tree, git surface (Tier 2+ roadmap items).
- Aligning `artifacts:get` dotenv reads with read-binary: **deliberately not done**
  — dotenv must stay readable for the confirm-tier edit flow to exist.
