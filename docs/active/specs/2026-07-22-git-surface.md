---
status: draft
date: 2026-07-22
owner: Destin (decisions) / Claude (execution)
subject: In-app git surface — per-file review view in the SessionDrawer
roadmap: "ROADMAP.md — 'Git surface in-app — diff vs HEAD, stage, commit, branch' (#git, added 2026-07-20)"
supersedes: docs/active/handoffs/2026-07-22-handoff-git-surface-and-version-tracking.md (open decisions — all resolved 2026-07-22)
mockup: https://claude.ai/code/artifact/522efb25-d56a-4483-9a7c-e5e1a431f262
---

# Spec — In-app git surface (per-file review view)

Brainstormed and locked with Destin 2026-07-22. UI outline approved on the mockup artifact
above (ledger numbers cited throughout; 1 and 8 are recorded rejections).

## 1. Framing (binding)

- **Audience: developers embracing fully agentic coding.** Not the non-developer framing the
  handoff inherited, and still not IDE parity — the job is *"I can trust and steer what the
  agent did to my code"* without leaving the app.
- **Mirror, not gate.** The surface is a live viewport onto the same working tree and index
  the agent's shell and the user's terminals mutate. It holds **no state of its own** (staging
  state IS the git index), it never gates agent activity, and no UI copy or docs may use
  "approve / reject / accept" language. An actual pre-commit gate would be a hooks/permissions
  feature — explicitly not this.
- **"Version tracking" = git.** The artifact sidecar `versions[]` system is untouched; its two
  open bugs (ROADMAP `#artifacts`) stay a separate work item and are NOT prerequisites.

## 2. UI (locked 2026-07-22 — mockup is the reference render)

All markup recipes exist in the mockup with verbatim app class strings; copy from there when
implementing. Numbers = mockup ledger.

- **(9) Footer entry.** The SessionDrawer metadata strip (`SessionDrawer.tsx:685-691`) gains,
  right-aligned: the open file's `+N` / `−N` line counts vs HEAD (green/red, `font-mono`) and a
  **Review Changes →** ghost button. When the file has no uncommitted changes AND no history
  (or the project isn't a git repo), both are absent — the strip renders exactly as today.
- **(10) Pushed review view.** Clicking Review Changes pushes a full-width view **beneath the
  standard drawer header, which stays intact** (list toggle, filename, open-external,
  copy-path, reveal, expand, close). A `bg-well` sub-header row carries: back-arrow IconBtn ·
  `Reviewing changes for "<file>"` (`text-xs font-medium text-fg-2`) · spacer · read-only
  branch chip (`font-mono text-[11px]`, git-branch icon). Back returns to the file view
  unchanged; ESC integrates into the drawer's existing back cascade (`SessionDrawer.tsx:365`)
  ahead of `listOpen`.
- **(11) Card timeline.** Review body = vertical stack of expandable cards
  (`rounded-lg border border-edge bg-well`, 8px gap, `p-3` scroll pane):
  1. **Uncommitted changes** card pinned first, `border-accent`, expanded by default.
  2. One card per commit that touched this file (`git log --follow`), newest first, capped at
     20 with a "Show more" tail row.
- **(12) Card anatomy.** Header row (`px-3 py-2`, hover `bg-inset`): chevron · title
  ("Uncommitted changes" / `sha` + subject) · `+N −N` counts · relative time. **No
  attribution chips** (ledger 8 — rejected 2026-07-22: trailer-parsing complexity not worth a
  flaky signal). Expanded body: `UnifiedDiff` verbatim (`UnifiedDiff.tsx:128-181`) with its
  15-line preview cap + Expand button; clicking a line number (or the uncommitted card's
  "Open file ↗") jumps the editor to that line via `ActiveArtifactHandle.revealLine`
  (`ActiveArtifactView.tsx:318`). Uncommitted card additionally carries: hover-reveal discard
  (destructive-tinted, `text-destructive-fg hover:bg-destructive/10`) and a
  **Staged for commit** checkbox row (CheckboxGlyph, `SessionDrawer.tsx:703`) that mirrors the
  git index.
- **(13) Commit composer.** Fixed under the timeline (`border-t border-edge bg-inset`):
  shared-field Textarea (`field.ts`, sm) + primary Button (`Button.tsx`, md, full-width).
  Label counts staged files **repo-wide** — "Commit 2 staged files" — and the button is
  disabled until ≥1 file is staged and the message is non-empty. Repo-wide count is the
  mirror-honesty rule: the agent may stage other files mid-review, and a commit always
  commits the index.
- **Rejected:** (1) `[Files | Changes]` SegmentedTabs mode toggle — replaced by the footer
  entry. (8) attribution chips. Mockup keeps both renders/rows marked as rejected; numbers are
  never reused.

## 3. Architecture

### New main-process module: `desktop/src/main/git/`

Shells out to the system `git` binary — **no isomorphic-git**. Pattern follows
`sync-spaces/git-transport.ts` (`execFile`, timeout, maxBuffer, `{code, stdout, stderr}`
result shape) but is a **new module**: the transport class deliberately targets a hidden
`GIT_DIR` (`<root>/.youcoded/sync.git`) and must not be reused for the user's real repo.
<!-- verify: {"path": "youcoded/desktop/src/main/sync-spaces/git-transport.ts", "contains": "GIT_DIR"} -->
Here: plain `git`, `cwd` = repo root, **no** `GIT_DIR`/`GIT_WORK_TREE` overrides.

- **Repo resolution:** `git rev-parse --show-toplevel` from the session's cwd (the drawer
  host's `projectRoot`), cached per root, invalidated on `git:changed`. Not-a-repo is a normal
  state (footer entry hidden), not an error. `git` binary missing ⇒ same hidden state plus one
  debug-level log; MVP ships no "install git" CTA.
- **Operations (MVP):**
  - `status(root)` — `git status --porcelain=v2 --branch` → branch name + per-file
    staged/unstaged/untracked state.
  - `fileCounts(root, path)` — `git diff --numstat HEAD -- <path>` (+ line count for
    untracked) → the footer's `+N −N`.
  - `fileDiff(root, path)` — diff vs HEAD as unified hunks, parsed to `StructuredPatchHunk[]`
    so `UnifiedDiff` renders with absolute line numbers.
  - `fileLog(root, path, {skip, limit=20})` — `git log --follow -z --pretty=…` → sha, subject,
    author date (relative time rendered client-side).
  - `commitFileDiff(root, sha, path)` — `git show <sha> -- <path>` hunks.
  - `stage / unstage(root, path)` — `git add -- <path>` / `git restore --staged -- <path>`.
  - `commit(root, message)` — `git commit -m <message>` committing the index as-is.
  - `discard(root, path)` — tracked: `git checkout HEAD -- <path>`; untracked: move the file
    to the OS trash via Electron `shell.trashItem` (recoverable; first use of trashItem in
    main — there is no existing deletion path to reuse), never `git clean`.
- **Renames in `--follow` output:** the log follows the path across renames; commit cards for
  pre-rename history show the sha/subject as normal (no special UI).

### IPC surface

New `git:*` channels (constants inlined in preload per the sandboxed-preload rule), exposed as
`window.claude.git.*`, mirrored in `remote-shim.ts`, stubbed in `SessionService.kt` with
`{ok:false, error:'not-implemented-on-mobile'}` — parity pinned by extending
`ipc-channels.test.ts`. Handlers validate that `root` is a known project root (same gate
family as `artifacts:*`); all execution stays in main.
<!-- verify: {"path": "youcoded/desktop/tests/ipc-channels.test.ts"} -->

Events: `git:changed` (see refresh) broadcast to subscribed webContents, refcounted per root
like `project-watcher.ts`.

## 4. Refresh model (the mirror mechanics)

Three triggers, all converging on "re-run status/counts for what's visible":

1. **Working-tree edits** — the existing chokidar `artifacts:changed` broadcast
   (`project-watcher.ts`). Already ignores `.git/` and the app's own writes.
2. **Git-state changes** (commit, checkout, rebase, stage from a terminal) — a new
   lightweight `fs.watch` on `.git/HEAD`, `.git/index`, and `.git/refs/heads/`, debounced
   ~300ms, emitting `git:changed`. Refcounted alongside the project watcher; watching starts
   when a drawer subscribes and stops on release.
3. **Own operations** — every mutating `git:*` handler emits `git:changed` on completion.

Consequences (by design): the agent committing mid-review collapses the uncommitted card and
prepends a commit card; a file staged in the drawer and committed by the agent is simply in
that commit. Nothing warns, because nothing is owned.

## 5. Safety & policy

- **D5 boundary unchanged:** `.git/` stays never-editable in the editor
  (`read-binary-access.ts` / `editable-path-policy.ts`). Git *operations* on the repo are a
  distinct, allowed capability — decided 2026-07-22.
- **Destructive verbs:** discard (tracked) and delete (untracked) only. Both require an L3
  confirm dialog (`layer-scrim data-layer=3` + `layer-surface[data-destructive]`) whose copy
  states exactly what happens ("Restore chat-reducer.ts to its last committed state? Your
  uncommitted edits to this file will be lost."). No bulk discard in MVP.
- **Write-guard:** user-initiated git operations from the drawer are the user acting, not the
  agent — they do not route through hooks, consistent with `artifacts:save`. The existing
  write-guard bypass bug (ROADMAP `#hooks`) is noted as context, not expanded: this feature
  adds no *agent*-reachable write path.
- **Errors** follow `docs/error-message-standards.md`: failed git commands surface trimmed
  real stderr (path/exit code included). Never a guessed cause.

## 6. Platform story

Desktop-only MVP (matches the #205 content-search precedent):

- **Remote web:** the shim answers `git:*` with `{ok:false, unsupported:true}`; the footer
  then renders without counts/button — silent graceful degradation, no toast on load.
- **Android:** Kotlin stubs; same hidden-footer result. Real Android support (git via the
  Termux runtime) is a phase-2+ investigation.

## 7. Testing

- **Unit (vitest, desktop):**
  - porcelain-v2 / numstat / log / unified-hunk parsers (pure functions, fixture strings —
    including rename and untracked cases);
  - footer visibility logic (changes? history? repo? → strip contents);
  - timeline assembly (uncommitted pinned, 20-cap + Show more, merge-commit "no direct
    changes" body);
  - composer disabled-state matrix (staged × message);
  - commit action fires `git:commit` with the message — DOM-level pin per the
    `build-menu.test.tsx` precedent.
- **IPC parity:** `git:*` channels present in preload + shim + Kotlin stub table.
- **Integration (main):** git module against a throwaway fixture repo created in a temp dir
  (init → write → stage → commit → assert porcelain transitions), skipped when `git` absent.
- **Final interactive pass:** Destin eyeballs the review flow in a dev instance
  (`bash scripts/run-dev.sh`) — not a scripted CDP rig (live-app-safety rule).

## 8. Explicitly out of MVP (phase 2 candidates — ROADMAP entries, not this spec)

- Branch create/switch; push / PR (rides `github-client`); pull.
- Repo-wide "Review all changes" entry (natural home: a matching row under the artifact
  list column).
- Hunk-level staging; bulk discard; commit-message generation.
- Any attribution/authorship signal on commits (rejected once — needs a better mechanism
  than trailer parsing to come back).
- Android/remote real support.

## 9. Decision log

| Date | Decision |
|---|---|
| 2026-07-22 | Audience corrected: developers doing agentic coding (not non-developer framing) |
| 2026-07-22 | UI home: SessionDrawer, session-centric (ProjectView tab rejected for MVP) |
| 2026-07-22 | Scope: read core + per-file history + stage/commit/discard; branch/push deferred |
| 2026-07-22 | "Mirror, not gate" framing; no approval language anywhere |
| 2026-07-22 | Version tracking = git; artifact sidecar untouched |
| 2026-07-22 | git-shell (system binary), new main module; isomorphic-git rejected |
| 2026-07-22 | Tabs toggle rejected → footer entry + pushed review view (sub-header beneath the standard header) — **UI outline locked** |
| 2026-07-22 | Attribution chips dropped (complexity > value for a flaky signal) |
