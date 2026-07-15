---
status: shipped
---

# Artifact Viewer Design

**Date:** 2026-05-21
**Status:** Spec — awaiting implementation plan
**Related:** [`2026-05-21-agent-harness-landscape.md`](../investigations/2026-05-21-agent-harness-landscape.md) (origin investigation)

## Context

YouCoded users (non-developers, students, professionals) work with an AI agent that creates and edits documents — plans, walkthroughs, notes, journals, drafts. Today those documents exist only as files on disk and as references in chat scrollback. There is no in-app surface that surfaces "what the agent made" — neither in the current session nor across sessions of the same project.

This design adds an artifact viewer system to YouCoded with three surfaces sharing one backend. The system is the second-highest-ROI item in the [agent harness landscape investigation](../investigations/2026-05-21-agent-harness-landscape.md#feature-roi-ranking-for-stealing-into-youcoded), behind only long-running missions.

## Goals

1. Make files the agent has created, edited, or deleted **discoverable** without users needing to navigate the filesystem
2. Make them **readable in-place** for common formats (markdown, txt, code, images, PDF, docx, xlsx)
3. Make them **editable in-place** for the lowest-friction formats (markdown, txt)
4. Provide **cross-session memory** — find the plan the agent wrote yesterday
5. Make file references in chat **clickable** rather than plain text
6. Stay aligned with the non-developer audience — no file trees, no jargon

## Non-goals (v1)

- Native editing of binary document formats (docx, xlsx, pdf)
- Project-View parity on mobile
- Antigravity-style commenting on artifacts
- Live update of artifact content as Claude iterates in chat (vs reload)
- Three-way merge of concurrent user + agent edits
- Filesystem-wide project discovery (scanning for `.youcoded/` directories)
- Rename detection
- Multi-user collaboration / sharing
- Cross-device sync conflict resolution

All of the above are in the [v2 Affordances](#v2-affordances) table; v1's schema and architecture are designed to accommodate them without rework.

---

## Decisions made during brainstorming

For reference and audit:

- **Three surfaces, not one.** Session Drawer + Project View + Inline Filepath Detection. Each has different scope, lifecycle, and complexity.
- **Pattern B placement** (drawer for session + separate full-screen Project View). Considered A (one tabbed drawer) and C (top-level Workspace mode); rejected both. Inspired by hybrid of Claude.ai Artifacts (companion panel) and Antigravity (browseable collection).
- **Standard MVP scope** (~4-6 weeks). All three surfaces ship together. Considered minimal (Surface 3 only) and full-vision (with commenting, live update, mobile parity); rejected both.
- **Hybrid filesystem-of-truth storage.** Per-project sidecar `.youcoded/artifacts.json` is the source of truth; `~/.claude/youcoded-projects-index.json` is a rebuildable cache. Considered centralized-only (A) and sidecar-only (B); chose hybrid for portability + query performance.
- **Filled-chrome frame** for the Session Drawer in framed themes. Header/status fill extends down the sides and through the chat/drawer divider as a continuous frame. Floating themes fall back to side-by-side floating cards.
- **Project = working directory** (auto-derived). Manual add/exclude supports external files and intentional curation.
- **Lazy sidecar creation.** No `.youcoded/` directory exists until the first artifact is tracked.
- **Internal-only auto-tracking.** Files inside the working directory auto-become artifacts; files outside require explicit user inclusion.
- **Library → Project View rename** (canonical going forward). Eventually expands to include conversations and other project-scoped content.
- **Versioning in the sidecar; v1 reads current content from disk only.** Every Write/Edit/Delete appends a version event. Earlier draft pointed versions at Claude Code's JSONL via `transcriptRef`; dropped because CC's transcript format is version-coupled and CC compacts/rotates transcripts (PITFALLS). Historical content via per-version snapshots is a v2 feature, stored under our control.

### Updates from spec review (2026-05-21)

The following clarifications were applied after a code-review pass surfaced ambiguities and risks:

- **Artifact Tracker location clarified.** State slice lives in the renderer (alongside the chat reducer's subscriber pattern); a separate Artifact Store in main / SessionService handles file I/O via IPC. Same architecture as the existing chat-reducer.
- **`transcriptRef` dropped from v1.** Reliability liability against CC version drift. v2 will snapshot content into `.youcoded/content/<versionId>` at write time.
- **Bash side-effects (mv, rm, cp, sed -i) NOT tracked in v1.** Only Write/Edit/Delete tool calls produce artifact events. Documented explicitly because the original draft incorrectly claimed `bash mv` produced delete+create events.
- **No implicit tracking on inline filepath click.** The unrecognized-path modal is view-only. Adding externals to projects requires the explicit Project View gesture. Consistent with the no-auto-externals tracking rule.
- **Sidecar writes use a CAS lock.** Atomic write-then-rename plus a compare-and-set check on `updatedAt`. Protects against the two-concurrent-sessions-in-same-project case.
- **`.youcoded/` auto-gitignored.** On first sidecar materialization, Artifact Store appends `.youcoded/` to the project's `.gitignore` if the project is a git repo. Defaults local-only; sharing opt-in via Settings → Privacy. Prevents accidental commit of file-touch history.
- **Path canonicalization defined.** Single `canonicalize()` function used by Tracker and Store. All paths in sidecar stored canonical; all comparisons go through it.
- **Redundant fields dropped from artifact record.** `createdAt` and `createdInSession` derived from `versions[0]`. `lastModified` and `status` kept as cache (advisory).
- **Android no-op stubs for desktop-only IPC channels.** Preserves parity-test sanity; ~50 lines of Kotlin; swap to real impls when Project View ships on mobile in v2.

---

## Architecture overview

### Three surfaces, one shared backend

```
┌─────────────────────────────────────────────────────────────┐
│  ChatView (renderer)                                         │
│  ┌──────────────────────────┐  ┌───────────────────────────┐ │
│  │  Chat messages           │  │  Session Drawer            │ │
│  │  ─ inline filepath tokens│◄─┤  ─ artifact list           │ │
│  │  ─ ToolCards             │  │  ─ active artifact view    │ │
│  │                          │  │    + diff + edit (md/txt)  │ │
│  └──────────────────────────┘  └───────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
              ▲                                ▲
              │                                │
    ┌─────────┴─────────────┐    ┌─────────────┴──────────────┐
    │  Inline Filepath      │    │  Project View              │
    │  Detector (renderer)  │    │  (full-screen, desktop)    │
    │  ─ regex over text    │    │  ─ projects, search,       │
    │  ─ whitelist of exts  │    │    filter, includes        │
    └───────────────────────┘    └────────────────────────────┘
              ▲                                ▲
              │                                │
    ┌─────────┴────────────────────────────────┴──────────────┐
    │  Artifact Tracker                                        │
    │  - Renderer-side state slice (TS) subscribes to          │
    │    TranscriptWatcher events alongside the chat reducer   │
    │  - Calls IPC into main / SessionService for file I/O     │
    │  - IPC: artifacts:list / :get / :save / :exclude / ...   │
    │                                                          │
    │  Artifact Store (main process / SessionService)          │
    │  - File I/O only (read/write sidecars + central index)   │
    │  - Broadcasts artifacts:changed push events to renderer  │
    └──────────────────────────────────────────────────────────┘
              ▲                                ▲
              │                                │
    ┌─────────┴─────────────┐    ┌─────────────┴──────────────┐
    │  <project>/.youcoded/ │    │  ~/.claude/                │
    │  artifacts.json       │    │  youcoded-projects-        │
    │  ─ truth ─            │    │  index.json                │
    │                       │    │  ─ cache ─                 │
    └───────────────────────┘    └────────────────────────────┘
```

### Components

- **Session Drawer** — layout-level split pane (not an overlay). Right side of the chat region when open. Shows artifacts in the current session.
- **Project View** — full-screen view (same pattern as `ThemeScreen`). Cross-session, cross-project. Desktop-only in v1.
- **Inline Filepath Detector** — renderer-side post-processor on chat text. Whitelisted extensions become clickable tokens.
- **Artifact Tracker** — renderer-side state slice. Subscribes to TranscriptWatcher events the same way the chat reducer does. Holds the canonical artifact state in memory. Issues IPC calls for file I/O.
- **Artifact Store** — main-process (Electron) and SessionService (Android) side. Handles all file I/O for sidecars and the central index. Broadcasts `artifacts:changed` push events back to listening renderers. No state of its own beyond what's on disk.
- **Renderer Registry** — extension → viewer component lookup.
- **Project Manager** — main-process / SessionService side. Manages project creation, deletion, path-change recovery, index rebuilds, sidecar locking. Called via IPC from the Tracker.

### Data flow — "Claude edits a markdown file"

1. Claude invokes Edit tool via Claude Code
2. Claude Code writes the JSONL transcript entry
3. TranscriptWatcher (renderer) parses it and dispatches `TRANSCRIPT_TOOL_USE`
4. Artifact Tracker (renderer state slice) detects a tracked-extension Edit; updates its in-memory state; issues `artifacts:append-version` IPC to the Artifact Store
5. Artifact Store reads the current sidecar (with a CAS lock — see "Concurrent access"), appends the version event, updates the central index entry, writes atomically
6. Artifact Store broadcasts `artifacts:changed` to all renderers (in case multiple sessions are open in the same project)
7. Session Drawer state updates via the push event; otherwise the drawer trigger badge increments
8. Inline filepath detector picks up the path on the next message render → renders as clickable token

### Fit with existing YouCoded architecture

- **Chat reducer stays harness-agnostic.** Artifact state lives in its own renderer-side slice, not in the chat reducer.
- **TranscriptWatcher unchanged.** Artifact Tracker subscribes alongside the existing reducer subscribers in the renderer event-flow.
- **Overlay system unchanged.** Session Drawer does NOT use `<OverlayPanel>` — it's a layout sibling, not a floating overlay.
- **ThemeScreen pattern is the template for Project View.**
- **File I/O follows the existing chat-reducer pattern.** State in renderer, I/O via IPC. Mirror on Android via the existing WebSocket bridge protocol.

---

## Data model

### Project sidecar — `<project>/.youcoded/artifacts.json`

Source of truth. One file per project.

```json
{
  "$schema": 1,
  "projectId": "01HXAB...",
  "name": "youcoded-dev",
  "createdAt": "2026-05-21T14:00:00Z",
  "updatedAt": "2026-05-21T14:30:00Z",

  "artifacts": [
    {
      "id": "art_01HXAB...",
      "path": "docs/plans/feature.md",
      "kind": "internal",
      "absolutePath": null,
      "lastModified": "2026-05-21T14:30:00Z",
      "status": "active",
      "versions": [
        {
          "id": "ver_01HXAC...",
          "ts": "2026-05-21T14:05:00Z",
          "sessionId": "session-uuid",
          "type": "create",
          "author": "agent"
        }
      ],
      "comments": [],
      "tags": []
    }
  ],

  "manualExcludes": ["docs/private/note.md"],
  "manualIncludes": [
    {
      "path": "C:/external/path/file.md",
      "addedAt": "2026-05-21T14:00:00Z",
      "addedBy": "user"
    }
  ]
}
```

**Field notes:**

- `id` — ULID (sortable timestamp prefix + random tail). Invisible to users.
- `path` — stored in canonical form (see [Path canonicalization](#path-canonicalization)). Mutable; renames update it (rename detection is v2).
- `kind: "internal"` — file lives inside the working directory; `path` is relative.
- `kind: "external"` — file lives elsewhere; `absolutePath` is set (canonical); `path` is the display basename.
- `lastModified` — cached for sort performance. Derived from `versions[len-1].ts` but persisted to avoid recomputing on every Project View open. Recomputed lazily when reading; treated as advisory.
- `status` — `"active"` or `"deleted"`. Cached from latest version (`type: "delete"` ⇒ `status: "deleted"`). Same advisory semantics as `lastModified`.
- `versions[]` — append-only. Every Write/Edit/Delete from agent or user adds one entry. `versions[0]` carries creation time and session; no separate top-level `createdAt`/`createdInSession` fields (they were redundant).
- **No `transcriptRef` in v1.** Earlier drafts pointed versions at Claude Code's JSONL lines for historical content. Dropped: CC's transcript format is version-coupled (per PITFALLS) and CC compacts/rotates transcripts, so anchoring our data to it is a reliability liability. v1 reads current content from disk only. v2's version-history dropdown will snapshot content into `<project>/.youcoded/content/<versionId>` at write time — under our control, not CC's.
- `comments[]`, `tags[]` — empty in v1. Structure ready for v2.

### Central index — `~/.claude/youcoded-projects-index.json`

Cache. Rebuildable from sidecars. Tracks projects, not artifacts.

```json
{
  "$schema": 1,
  "projects": [
    {
      "id": "01HXAB...",
      "name": "youcoded-dev",
      "path": "C:/Users/desti/youcoded-dev",
      "lastIndexed": "2026-05-21T14:30:00Z",
      "lastSession": "session-uuid",
      "contentTypes": ["artifacts"],
      "stats": { "artifactCount": 42 }
    }
  ]
}
```

**Why no flat artifact list in the index:** at v1 scale (handful of projects, hundreds of artifacts each), reading per-project sidecars on Project View open is fast enough (<100ms for 10 projects). Skipping the flat index keeps the cache simple and avoids drift. Add it later if performance becomes a problem.

### Path canonicalization

All paths in the sidecar are stored in a canonical form. All comparisons (orphan detection, exclude matching, dedup, inline-click routing) go through the same canonicalizer. Without this, `C:\foo\bar.md`, `C:/foo/bar.md`, `c:/foo/bar.md`, `\\?\C:\foo\bar.md`, and `./foo/bar.md` all refer to the same file but compare as different strings.

**Canonical form rules:**

1. Normalize all separators to forward slash (`/`)
2. Lowercase the drive letter on Windows (`C:` → `c:`)
3. Strip the `\\?\` extended-length-path prefix on Windows
4. Resolve `.` and `..` segments
5. Internal paths: resolve relative to project root, store as relative POSIX-style (`docs/plans/feature.md`)
6. External paths: resolve to absolute, store in canonical absolute form
7. Trailing slashes stripped
8. Unicode NFC normalization for filename comparison (handles macOS HFS+ NFD quirks if a synced folder originated there)

Implemented as a single pure function `canonicalize(rawPath, projectRoot)` shared between the renderer Tracker and the main-process Store. The same function powers the inline-click match against the artifact list.

### Identity and rename handling

- Artifact identity is the `id` (ULID). Path is mutable.
- **Bash side-effects are NOT tracked in v1.** Only Write/Edit/Delete tool calls produce artifact events. A `bash mv old.md new.md` produces **zero** artifact events — the Bash tool surfaces stdout/stderr to the transcript but doesn't emit a delete-of-A + create-of-B that we can subscribe to. The new path appears as an artifact only if Claude subsequently uses Edit/Write on it. Same applies to `bash rm`, `bash cp`, `bash sed -i`, etc.
- Rename detection (and Bash-side-effect parsing) is a v2 polish item.

---

## Surface 1 — Session Drawer

### Placement

**Layout-level split pane, not an overlay.** When open, the chat region shrinks horizontally and the drawer occupies the freed space. The chat lives in a flex/grid container alongside the drawer; both are siblings of HeaderBar and StatusBar.

In framed themes, the drawer's edges visually continue HeaderBar's bottom edge and StatusBar's top edge, forming a continuous filled chrome frame around two inset panels (chat on the left, drawer on the right). In floating themes, both panels render as theme-appropriate floating cards without a continuous frame.

Trigger: a button in `HeaderBar` (next to existing drawer triggers). Also auto-opens when the user clicks an inline filepath token for a session-current file.

### Framed-theme visual treatment

```
████████████████████████████████████████████████████████████  ← HeaderBar
██                                  ██                      ██
██                                  ██                      ██
██   Chat                           ██   Drawer             ██
██   (inset)                        ██   (inset)            ██
██                                  ██                      ██
██   ┌────────────────────────┐     ██                      ██
██   │  InputBar              │     ██                      ██
██   └────────────────────────┘     ██                      ██
██                                  ██                      ██
████████████████████████████████████████████████████████████  ← StatusBar
       ↑                            ↑                       ↑
   Left edge fill              Divider fill            Right edge fill
   (same color as              (same color)            (same color)
    header / status)
```

Implementation:

- Outer layout container is filled with `--panel-bg` (the header / status panel color)
- HeaderBar at top, StatusBar at bottom (inherit container fill)
- Middle row is a horizontal flex container:
  - Left padding region (`--frame-edge` thickness)
  - Chat panel (own `--canvas-bg`, occupies the punched-out space)
  - Divider region (`--frame-edge` thickness)
  - Drawer panel (own `--panel-bg` or `--inset-bg`)
  - Right padding region (`--frame-edge` thickness)
- New CSS variable `--frame-edge` controls chrome thickness. Default ~8-12px. Themes can tune.

### Floating-theme treatment

Frame model doesn't apply. Chat and drawer each render as theme-appropriate floating panels positioned side-by-side. The chat still shrinks to make room when the drawer opens, but no continuous frame is drawn.

Optional user preference (v2): "Always frame when drawer is open" — overrides the theme's `layout` capability.

### Responsive collapse

Below a width threshold (~700px combined), the layout collapses to drawer-takes-full-width. The chat is hidden; a back gesture (or button) returns to chat. This is the default Android (mobile) behavior.

### Two-pane content (wide-screen)

```
┌── Session Artifacts (4) ───────────────────────────── × ──┐
│ ┌─────────────────┐  ┌────────────────────────────────┐ │
│ │ ● feature.md    │  │ docs/plans/feature.md          │ │
│ │   created · 2m  │  │ ─────────────────────────────  │ │
│ │                 │  │ [View] [Edit] [Open Ext] [Copy]│ │
│ │ ◐ config.json   │  │                                │ │
│ │   edited · 5m   │  │ # Feature Plan                 │ │
│ │                 │  │                                │ │
│ │ ☓ old-notes.md  │  │ ## Goals                       │ │
│ │   deleted · 8m  │  │ - Ship the artifact viewer     │ │
│ └─────────────────┘  └────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Artifact list item:** type icon + filename + change-type glyph (● created, ◐ edited, ☓ deleted) + relative timestamp + version count badge if >1. Sort: most recent first.

**Active artifact view:** header with filename and action buttons; body delegates to the Renderer Registry based on file extension; deleted artifacts render with strikethrough and a tombstone message above the last-version content.

### Edit flow (markdown / txt only in v1)

1. User clicks Edit → viewer swaps to textarea pre-filled with current file contents
2. User edits → Save / Cancel buttons appear
3. Save → write to disk + append version event with `author: "user"` + show "Saved" toast
4. Cancel → discard textarea state, return to view mode

### Conflict handling (user + agent concurrent edit)

If Claude touches a file while the user is editing it in place:

1. Artifact Tracker observes the version event (Claude's write already landed on disk)
2. The drawer's edit view shows a conflict banner: "Claude also edited this file"
3. Three options:
   - **Keep mine** — write the user's textarea content to disk, overwriting Claude's just-applied edit. Appends a version event with `author: "user"`.
   - **Use Claude's** — discard the user's textarea state, reload the viewer from disk (now showing Claude's edit). No new version event.
   - **View diff** — side-by-side view of the user's textarea content (left) vs. disk content (right, Claude's edit). User decides whether to merge manually, then picks Keep mine or Use Claude's.
4. v1 ships the banner with two-way disk-vs-textarea diff. Real three-way merge (preserving both edits intelligently) is v2.

---

## Surface 2 — Project View

### Placement

Full-screen view replacing the chat area. Same pattern as `ThemeScreen`. Triggered from a new "Projects" button in HeaderBar. Returns to chat via the existing back/close affordance.

**Desktop-only in v1.** Mobile is deferred to v2.

### Layout

Three-column: project switcher (left) + main grid (center) + detail pane (right, collapsible).

```
┌── Projects ──────────────────────────────────────── × ──┐
│ ┌─────────────┐ ┌──────────────────────────┐ ┌────────┐ │
│ │ ▸ youcoded  │ │ [Search...]    [Filters] │ │ Detail │ │
│ │   42 items  │ │ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐│ │ pane   │ │
│ │             │ │ │md│ │md│ │png│ │pdf│ │xls││ │ ...    │ │
│ │   askthe... │ │ └──┘ └──┘ └──┘ └──┘ └──┘│ │        │ │
│ │   18 items  │ │ feature  notes  shot  ...│ │        │ │
│ │             │ │                          │ │        │ │
│ │   cookin... │ │ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐│ │        │ │
│ │   7 items   │ │ │md│ │md│ │md│ │md│ │txt││ │        │ │
│ │             │ │ └──┘ └──┘ └──┘ └──┘ └──┘│ │        │ │
│ │ + Add ext.. │ │                          │ │        │ │
│ └─────────────┘ └──────────────────────────┘ └────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Project switcher

- Lists projects from central index
- Each item: name, last-touched timestamp, artifact count
- Current project highlighted
- "+ Add external folder" button opens the existing `dialog:open-folder` picker

### Main area

- Search bar (filename + path substring match, in-memory)
- Filter chips: extension type, status (active/deleted), source (agent/user)
- Sort dropdown: last modified / created / name / type
- Grid display by default (image thumbnails, type icons otherwise); list mode toggle for metadata-dense view

### Detail pane

Same viewer system as Session Drawer, plus:

- **Exclude from this project** button (adds to `manualExcludes`)
- **Move to another project** (changes project membership)
- **Show in chat** — pivots back to chat and inserts the file path so the agent has it in context

### Add external file

Drag-drop into the main area, or "Add file..." button. Adds to `manualIncludes` in the current project's sidecar.

---

## Surface 3 — Inline Filepath Detection

### Detection rules

A post-processor on chat message text content (assistant text blocks + user messages). Runs in the renderer.

- Match absolute paths: `/foo/bar/baz.md`, `C:\foo\bar.md`, `C:/foo/bar.md`
- Match relative paths: `./foo/bar.md`, `foo/bar.md`
- Match tilde paths: `~/foo/bar.md`
- Word-boundary anchored (no mid-word matches)
- Extension whitelist (see Format Support table)
- **Skip matches inside code blocks** — uses `MarkdownContent`'s AST traversal to identify code spans and exclude them

### Rendering

Matched paths replaced by a `<FilepathToken>` component:

```
Claude says: "I created the plan at  [📄 docs/plans/feature.md]  for you."
                                     └─────────────────────────┘
                                          clickable token
```

Visual: subtle pill background (theme `--inset` token), file-type icon, monospace path text. Hover shows the full absolute path as a tooltip.

### Click behavior

- File is session-current (in active session's artifact list) → open Session Drawer focused on it
- File is in any known project's sidecar (cross-session) → open Project View focused on it
- Path not recognized → open a one-off **view-only** modal ("File not tracked — view contents"). **Does NOT auto-track.** Adding to a project requires the explicit "Add file..." gesture in Project View (preserves the [Tracking boundary](#tracking-boundary) rule that external files are never auto-tracked).

### Performance

The detector runs per-message-render, not per-keystroke. Memoize results per `messageId` to avoid re-running on every reducer tick.

---

## Format support

| Format | View | Edit in-place | Open Externally |
|--------|------|---------------|-----------------|
| md, txt | Rendered preview | Yes (textarea) | — |
| Code (.ts, .py, .css, .json, etc.) | Syntax-highlighted | No (read-only) | — |
| png, jpg, gif, webp | Inline image | No | — |
| pdf | Inline viewer (PDF.js) | No | Yes |
| docx | Read-only HTML conversion (mammoth.js) | No | Yes |
| xlsx | Read-only table preview (SheetJS) | No | Yes |
| Unknown / binary | "Cannot preview" placeholder | No | Yes |

Library budget: PDF.js (~1MB) + mammoth.js (~500KB) + SheetJS (~1MB) ≈ 2.5MB. **Lazy-load each on first use** (dynamic `import()`) to keep cold-start size reasonable.

Mobile performance guard: files over 10MB render as metadata-only stubs ("Large file — tap to open externally") rather than loading the format library, to avoid OOM on lower-end Android devices.

---

## Project lifecycle

### Creation

1. SessionManager fires "session-created" with `workingDirectory`
2. ProjectManager checks central index for an entry matching that path
3. If matched → update `lastSession`, done
4. If no match → check filesystem: does `<path>/.youcoded/artifacts.json` exist?
   - **Yes** → read `projectId`, register in the central index under the current path (project-moved auto-recovery)
   - **No** → create in-memory project entry in the index; **don't write the sidecar yet**

**Lazy sidecar creation.** The sidecar materializes on the first artifact event, not on session creation. Users launching one-off sessions in random folders don't get `.youcoded/` directories polluting their filesystem.

**Git auto-ignore at materialization time.** When the sidecar materializes, the Artifact Store also runs the git-treatment check ([see below](#git-and-cloud-sync-treatment)) — appending `.youcoded/` to the project's `.gitignore` if the project is a git repo. Defaults to local-only.

### Deletion

Confirmation modal in Project View with two options:

- ☐ Also delete the sidecar file (`.youcoded/artifacts.json`) — off by default
- Never offered: deleting the project folder or its files

Default behavior (sidecar checkbox off): removes the project from the central index; sidecar stays. The next session in that folder re-discovers the project. Effectively reversible.

Explicit sidecar deletion: removes the central index entry AND deletes `.youcoded/artifacts.json`. Files untouched. Re-discovery means starting fresh.

### Tracking boundary

- **Internal files** (inside working directory) → auto-tracked on Write/Edit/Delete tool events
- **External files** (outside working directory) → NOT auto-tracked. Even if Claude edits them in this session, they don't auto-become artifacts. The user must explicitly add via:
  - "Add file..." in Project View → file picker → `manualIncludes`
  - Drag-drop into Project View
  - (v2) Right-click an inline filepath token → "Add to project as external artifact"

Once added, external files become first-class artifacts and are tracked on subsequent events.

### Orphan handling

**Definition:** artifact in sidecar whose file is no longer on disk (vanished externally, not via tracked delete).

**Detection:** lazy. When a viewer requests an artifact's content and the file doesn't exist, mark orphan in memory. Optionally batch-rescan on Project View open.

**UI:** orphan artifacts render with "⚠ file not on disk" label, muted style. Two user actions:

- **Forget** → remove from sidecar permanently
- **Relocate...** → file picker; user points to new location, path updates

Never auto-cleanup. Data loss risk.

### Index rebuild

**When:**
- App start, if `~/.claude/youcoded-projects-index.json` is missing or schema version mismatch
- User-triggered "Rescan projects" in Settings (debug tool)
- (v2) When a file watcher detects external sidecar changes

**How:**
1. Read existing index (if any) for known project paths
2. For each: read `<path>/.youcoded/artifacts.json`
3. Sidecar exists → re-aggregate stats, refresh index entry
4. Sidecar missing → drop entry from index
5. Write new index atomically (temp + rename)

v1 does NOT scan the filesystem for stray `.youcoded/` directories. Projects only become known via session-creation or explicit add.

### Atomic writes

Both sidecar and index use write-then-rename:

1. Write content to `<file>.tmp` in same directory
2. fsync the temp file
3. Rename `<file>.tmp` → `<file>` (atomic on POSIX and NTFS)

Prevents half-written-JSON corruption under sync layers, OS crashes, or app kills.

### Concurrent access (sidecar locking)

Atomic writes prevent torn writes but not lost updates. Two concurrent sessions in the same project (a real case — the workspace explicitly supports it; `write-guard.sh` exists for the analogous `~/.claude/` case) could each read the same sidecar, append a different version, and one overwrites the other on rename.

**v1 uses a CAS (compare-and-set) check:**

1. On read, capture the file's `updatedAt` field
2. Mutate in memory
3. Bump `updatedAt` to a new timestamp
4. Before rename, re-read the on-disk file's `updatedAt`
5. If the on-disk `updatedAt` differs from what was captured at read time → another writer landed in between. Retry the mutation against the new on-disk state (up to N retries, then surface a warning).
6. Otherwise commit the rename.

Simpler than a file-system lock, no platform variance (Windows / POSIX flock differences), no orphan-lock-on-crash failure mode. Trade-off: under extreme contention (very rare for sidecars — they're touched on tool calls, not per keystroke) retries could starve. Acceptable at v1 scale.

The CAS check applies to both sidecar and central index writes.

### Git and cloud-sync treatment

The `.youcoded/` directory holds file paths Claude has touched, timestamps, and (in v2) potentially comment text. Three risks if untreated:

- **Accidental commit** — privacy leak. Every file the agent touched + when becomes part of the repo history.
- **User gitignores it** — agent memory wiped on clean clone.
- **Cloud-sync conflicts** — last-writer-wins data loss across devices (already in [Risk register](#risk-register)).

**v1 default: local-only, opt-in for sharing.**

On first sidecar creation, the Artifact Store checks whether the project root is a git repo (`<root>/.git` exists). If yes:

1. Read `<root>/.gitignore` (or create empty if absent)
2. If `.youcoded/` is not already present, append `.youcoded/`
3. Write back atomically (write-then-rename)
4. Surface a non-blocking toast: "Added `.youcoded/` to .gitignore so artifact history stays local. You can change this in Settings → Privacy."

User can flip a setting "Include `.youcoded/` in git" later, which removes the `.youcoded/` line from `.gitignore`. The setting defaults off. Visible in Settings → Privacy for transparency.

For non-git projects, no special handling. Cloud-sync risk is still present but addressed by the warning on OneDrive/Drive-detected roots already in the [Risk register](#risk-register).

### Sidecar corruption recovery

On JSON parse failure:

1. Back up the corrupted file to `.youcoded/artifacts.json.bak.<timestamp>`
2. Show non-blocking notification: "Couldn't read artifact history for `<project>`. Corrupted file backed up; fresh sidecar started."
3. Initialize a new sidecar with empty artifacts; preserve `projectId` if extractable from lenient parse, otherwise generate new

Loss is bounded to one project's metadata. Files untouched.

### Multi-device sync (deferred)

Sidecars live under `<project>/.youcoded/`, NOT in `~/.claude/`. YouCoded's existing sync layer does not touch them. If the user syncs the project folder via Dropbox / Drive / git / iCloud, sidecar sync rides along.

v1 doesn't merge conflicts. Last writer wins (rclone) or conflict files (Dropbox-style). Documented limitation.

v2 affordance: append-only `versions[]` array means 3-way merge is "union sort by ULID, dedupe by id."

---

## Mobile (Android) parity

### What ships v1

- Surface 1 (Session Drawer) — full parity, adapted to narrow screen
- Surface 3 (Inline Filepath Detection) — full parity with touch-friendly hit targets
- Surface 2 (Project View) — **deferred to v2**

### Android Session Drawer

Full-width over chat area (no split frame on narrow screens).

```
┌─────────────────────────────────────┐
│  HeaderBar  · Artifacts · gear · ⊕  │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │ ● feature.md   created · 2m │    │
│  ├─────────────────────────────┤    │
│  │ ◐ config.json  edited · 5m  │    │
│  ├─────────────────────────────┤    │
│  │ ☓ old.md       deleted · 8m │    │
│  └─────────────────────────────┘    │
│                                     │
│  (tap an artifact → detail view)    │
├─────────────────────────────────────┤
│  StatusBar                          │
└─────────────────────────────────────┘
```

### Navigation model

List → detail with Android back-stack semantics:

- Tap artifact → detail view (slide-in from right)
- Hardware back button or swipe-from-left → return to list
- Hardware back from list → close drawer (return to chat)
- WebView back-button handling matches existing YouCoded overlay pattern

### Trigger

New button in HeaderBar with count badge when artifacts exist. Hidden when session has zero artifacts.

### Inline filepath taps on mobile

Open into mobile drawer at the artifact's detail view. If the file is in a different project (and Project View doesn't exist on mobile in v1), fall back to a **view-only** modal scoped to that single file. **Does NOT auto-track** — consistent with the desktop click-behavior rule above.

### Format viewers

All pure-JS libraries running in the WebView. No native Android code needed.

- Markdown/txt: same `MarkdownContent.tsx`; soft-keyboard-compatible edit
- Code: same syntax highlighter
- Images: `<img>` with pinch-zoom
- PDF: PDF.js with pinch-zoom + paginated scroll
- DocX: mammoth.js → HTML, scrollable
- XLSX: SheetJS table, horizontally scrollable
- Unknown: "Open in another app" via existing `platform:open-file` IPC

Files >10MB render metadata-only stub.

### Cross-platform technical considerations

**IPC parity (PITFALLS-driven).** New types must be added in lockstep across `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts` (Electron), and `SessionService.kt` (Android). Existing `ipc-channels.test.ts` parity test catches drift.

New IPC types:
- `artifacts:list-session` (request-response — both platforms)
- `artifacts:list-project` (request-response — desktop-only consumer in v1)
- `artifacts:get` (request-response — content + metadata for one artifact, both platforms)
- `artifacts:save` (request-response — user in-place edit, both platforms)
- `artifacts:include-external` (request-response — desktop-only consumer in v1)
- `artifacts:exclude` (request-response — desktop-only consumer in v1)
- `artifacts:changed` (push event — broadcast on artifact add/update/remove, both platforms)

**Desktop-only handlers still need Android implementations** to satisfy the parity test. Android grows **no-op stubs** that return `{ ok: false, error: "not-implemented-on-mobile" }` for the three desktop-only channels (`list-project`, `include-external`, `exclude`). Cost: ~30-50 lines of Kotlin. Benefit: parity-test sanity, no per-channel opt-out logic in the test harness, and a clean migration path when Project View ships on mobile in v2 — the stubs swap to real implementations without touching the parity infrastructure.

**File path handling.** Android lives in Termux filesystem (`$HOME = /data/data/com.youcoded.app/files/home`). `manualIncludes` paths added on desktop don't resolve on Android, and vice versa. v1 behavior: cross-platform path mismatch → treat as orphan. Document the limitation. v2 may add a platform-specific includes sub-shape or a path-portability helper.

**Artifact Tracker placement.** State lives in the renderer (TypeScript), shared across desktop + Android. I/O goes through IPC: Electron main-process handlers on desktop, Kotlin SessionService handlers on Android. Same pattern as chat reducer.

**Sidecar reads/writes from Kotlin.** Standard JSON parsing on the Kotlin side. Schema version on every read; treat unknown schemas as "needs upgrade" with warning surfaced. Atomic write-then-rename pattern same as desktop.

### `$HOME`-as-cwd on Android

Many Android sessions launch with `cwd = $HOME` because users don't pick a specific project folder. v1 treats it as any other project. If the user finds the "home" project noisy in Project View later, they can remove it. v2 may add a "Loose Artifacts" pseudo-project for ad-hoc work.

---

## Testing strategy

### Unit tests (Vitest, TypeScript)

- `inline-filepath-detector.test.ts` — regex matching, extension whitelist, code-block exclusion, word-boundary anchoring
- `artifact-tracker.test.ts` — given sequences of TranscriptEvent, assert resulting artifact records, version arrays, orphan flags. Asserts Bash tool calls produce zero artifact events.
- `path-canonicalize.test.ts` — Windows/POSIX separators, drive-letter casing, `\\?\` prefix, `.` / `..` resolution, relative-vs-absolute, NFC normalization. The same canonicalizer ships in TS for renderer and a parallel Kotlin port for SessionService — fixture-based parity test catches drift.
- `sidecar-schema.test.ts` — schema validation; stub v1→v2 migration path
- `project-manager.test.ts` — project lookup, lazy sidecar creation, path-change auto-recovery, atomic write semantics, corruption recovery, **CAS-retry under simulated concurrent writes**, **auto-gitignore append on first sidecar materialization in a git repo**
- `renderer-registry.test.ts` — extension → component mapping, fallback to BinaryFallback

### Integration tests (Vitest with real filesystem in tmpdir)

- `artifact-flow.integration.test.ts` — empty project → simulated transcript events → assert sidecar contents on disk
- `project-rediscovery.integration.test.ts` — create project at path A, move folder to path B, launch session at B, assert central index updates
- `orphan-detection.integration.test.ts` — create artifact, delete file from disk, assert next read flags orphan
- `concurrent-edit.integration.test.ts` — user edit in progress + Claude Edit event → assert conflict banner triggers, Keep mine / Use Claude's / View diff actions all produce coherent disk + version-array state
- `concurrent-sidecar-writes.integration.test.ts` — two writers append versions to the same sidecar concurrently; assert CAS retries succeed and no version events are lost
- `gitignore-on-materialize.integration.test.ts` — create a tmpdir git repo, materialize a sidecar, assert `.gitignore` contains `.youcoded/`; same test with a non-git tmpdir asserts no gitignore is created

### Parity tests

- Add `artifacts:*` channels to `desktop/tests/ipc-channels.test.ts` — asserts presence in `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, `SessionService.kt`
- Sidecar fixture parity: hand-curated JSONs at `youcoded/shared-fixtures/artifacts/` that must parse identically on desktop and Android. Mirrors existing transcript-parity pattern.

### Component tests

- Smoke test per format viewer (MarkdownView, ImageView, PdfView, DocxView, XlsxView, CodeView, BinaryFallback) using fixtures at `shared-fixtures/artifacts/format-samples/`
- Edit-mode toggle tests for MarkdownView and TxtView

### Manual verification

Per CLAUDE.md convention: dev server + real session that produces artifacts.

- Click through Session Drawer, verify diff rendering, edit a markdown file, verify save round-trip
- Cycle through three representative themes (framed default, floating, custom edge thickness) and verify the frame integrity
- Android verification on a real device for full-width drawer, back-button navigation, inline filepath touch targets — uses `releaseTest` build per PITFALLS to catch R8-reflection issues

### Sandbox extension

Extend `youcoded/desktop/src/renderer/dev/fixtures/` with artifact fixtures so the existing ToolCard sandbox can also render Session Drawer states. Same `?mode=` URL flag pattern.

---

## v2 Affordances

What's deferred and pre-wired in v1's schema/architecture so v2 builds without rework:

| v2 item | What v1 sets up | Effort estimate |
|---|---|---|
| Commenting on artifacts | `comments: []` field on artifact record | 1-2 weeks |
| Live update from chat | TranscriptWatcher events already push; UI subscribes | 1 week |
| Version-history dropdown | `versions[]` already populated; v2 adds content snapshots into `<project>/.youcoded/content/<versionId>` at write time (under our control, not CC's transcript) | 1-2 weeks |
| Native docx / xlsx editing | Renderer Registry slot ready; needs real editor library | 1-2 months |
| Screenshot capture as agent tool | Image artifact rendering already works; YC harness gains `screenshot` tool | depends on YC harness timing |
| Mobile parity for Project View | Three-level navigation (folder list → artifact list → artifact view) | 2-3 weeks |
| Cross-device sync of metadata | Sidecars portable; append-only versions enable 3-way merge | 1-2 weeks |
| Project View unified content browser | `contentTypes` field on index; `.youcoded/` is a directory ready for siblings | 2-4 weeks |
| Rename detection | Detect via Bash `mv` patterns or future MoveFile tool | 1 week |
| Filesystem-wide project discovery | Scan for `.youcoded/` directories | 1-2 weeks |
| Force-framed mode preference | User-pref toggle overrides theme `layout` flag | a few days |
| Three-way merge for concurrent edits | Conflict-banner UI already there | 1-2 weeks |
| Loose Artifacts pseudo-project | Sidecar lives in `~/.claude/` | 1 week |
| Project sharing / collaboration | Sidecar portability already enables | 1-2 months |

Total v2 surface area: ~4-6 months sequential, less if parallelized. None requires schema migration.

---

## Risk register

- **Sync conflict on a single sidecar across two devices.** Mitigations: write atomicity (v1), append-only version arrays (v2 merge), documentation. Severity: low for solo users, medium for multi-device.
- **Library bundle size.** PDF.js + mammoth.js + SheetJS ≈ 2.5MB. Mitigation: lazy-load via dynamic `import()`. Severity: low.
- **Renderer regex performance.** Inline detector runs per-message-render. Mitigation: memoize per `messageId`, skip code spans via AST. Severity: low.
- **Sidecar external edits not surfaced.** v1 doesn't watch sidecars; user edits via text editor won't appear until next read. Mitigation: documented; v2 adds watcher. Severity: low.
- **OneDrive / cloud-folder write atomicity.** Per existing PITFALLS, cloud-synced folders can interfere with write-then-rename. Mitigation: same defensive patterns YouCoded uses for `~/.claude/`; warn when project root is detected as a OneDrive / Drive folder. Severity: medium.
- **R8 reflection on Android.** Per PITFALLS Bootstrap precedent. Mitigation: direct calls only in the Kotlin Artifact Tracker; verify with `assembleReleaseTest`. Severity: low if pattern followed.

---

## Open questions

To be resolved during planning or implementation:

1. **Exact value for `--frame-edge` default.** ~8-12px range; needs visual testing across themes.
2. **HeaderBar button placement** for Session Drawer trigger and Projects trigger — needs to coexist with existing buttons (gear, gamepad pill, caption buttons on Win/Linux).
3. **Whether Projects view replaces chat fully** (like ThemeScreen) or splits screen — current design says replaces; revisit if user testing suggests otherwise.
4. **Detail pane in Project View — fixed width or resizable.** Current design assumes fixed; resize is v2 polish.
5. **Should `dialog:open-folder` IPC handle drag-drop of folders into Project View** or do we need a separate handler?
6. **Soft-keyboard interaction on Android in-place markdown edit** — does the existing InputBar pattern translate cleanly?
7. **CAS retry limit and backoff.** How many retries before surfacing a warning? Linear or exponential backoff? Default to N=5 retries with linear ~10ms backoff; revisit if observed contention warrants tuning.
8. **Sidecar growth bound.** A heavily-iterated artifact's `versions[]` array grows linearly. At v1 scale (versions are ~80 bytes each without `transcriptRef`) this is not a problem (1000 iterations = ~80KB per artifact). v2 may add a compaction policy (e.g., keep first version, last N versions, all type-change events; drop the rest). Tracking as a v2 polish item rather than blocking v1.

None block writing the implementation plan. Each gets a concrete answer during implementation or the dev-loop verification step.

---

## Post-implementation amendments (2026-05-22)

These are material design decisions that changed during execution and dev-loop verification. They override the original spec text above.

### Amendment 1: Session Drawer auto-tracks EXTERNAL files too

**Spec said:** "External files (outside working directory) → NOT auto-tracked. Even if Claude edits them in this session, they don't auto-become artifacts." (Tracking boundary section.)

**Actual behavior:** The Session Drawer auto-tracks **every** file Claude writes/edits/deletes in the session, regardless of whether it's inside the working directory. Internal vs external is determined by path comparison and stored as `kind: 'internal' | 'external'` + `absolutePath`. The session drawer shows all of them.

**Why:** The original rule conflated session-scope tracking with project-scope tracking. The session drawer is by definition a *session activity log* — if Claude touched a file in the session, it belongs there regardless of location. The "doesn't pollute project history" concern only applies to the Project View.

**Project View filter:** internal artifacts always shown; external artifacts only shown if explicitly added via `manualIncludes`. External auto-captures live in the sidecar (so the Session Drawer can read them) but don't appear in Project View. Filter implemented in `ipc-handlers.ts` LIST_PROJECT handler.

Fix commit: `447b7c3e`.

### Amendment 2: Added `artifacts:append-version` IPC

**Spec said (data flow):** "Artifact Tracker (renderer state slice) detects a tracked-extension Edit; updates its in-memory state; issues `artifacts:append-version` IPC to the Artifact Store."

**Original plan/Phase 2:** the IPC channels listed were `list-session`, `list-project`, `get`, `save`, `include-external`, `exclude`, `changed` — **`append-version` was missing**. The Tracker called only `list-session`, which reads the sidecar but never populates it. End result: artifacts never materialized from agent activity until a user-initiated `save`.

**Fix:** Added `artifacts:append-version` to `ipc-channels.ts`, ipc-handlers.ts (runs `ensureProject` + `applyGitTreatment` + `appendVersion` + broadcasts `artifacts:changed`), preload.ts, remote-shim.ts, and SessionService.kt. Updated the renderer Tracker to call it before `listSession`.

Fix commit: `74437f92`.

### Amendment 3: Transcript events don't carry `cwd`

**Implementation assumed:** the transcript event payload includes `cwd`.

**Reality:** transcript-watcher.ts emits events of shape `{ type, sessionId, uuid, timestamp, data }` — no cwd field.

**Fix:** the renderer Tracker resolves cwd by looking up the session in the `sessions` state via a `sessionsRef` (so the handler always sees the latest list without re-subscribing).

Fix commits: `aa226cc3`, `7f367b0d`.

### Amendment 4: Inline filepath detector widened to bare relative paths

**Original regex required** paths to start with `/`, `~/`, `./`, `../`, or a drive letter.

**Real Claude output** commonly uses bare relative paths like `docs/foo.md` (no `./` prefix). These weren't matched.

**Fix:** added a fifth prefix alternative `[\w\-.]+[\\/]` so bare relative paths with at least one directory segment + separator are detected. Standalone filenames (`plan.md` with no slash) still correctly excluded.

Fix commit: `d5fb3fc4`.

### Amendment 5: Wallpaper themes broken by opaque framed-shell

**Spec called for** `.framed-shell { background: var(--panel) }` and `.chat-pane { background: var(--canvas) }` to render the chrome.

**Reality:** these opaque backgrounds painted over the WallpaperBackdrop layer, hiding wallpapers / gradients / glassmorphism in themes that rely on them.

**Fix:** `.framed-shell` is now transparent. Only the explicit chrome children (`.frame-edge`, `.frame-divider`, `.drawer-pane`) carry the `--panel` fill. Chat-pane has no explicit background — wallpaper shows through.

Fix commit: `3cb4242f`.

---

## Outstanding issues (deferred from this round)

These were identified during dev-loop verification but not fully resolved.

### Framed-chrome visual doesn't fully form (HIGH)

**Symptom:** Session Drawer's drawer-pane slips behind the absolute-positioned HeaderBar / StatusBar / InputBar chrome. Frame edges (left/right/divider) don't visually connect to the header/status panel fill.

**Root cause:** YouCoded's existing HeaderBar (`.header-bar { position: absolute; top: 0; z-index: 20 }`) and bottom chrome (`.bottom-float`) overlay the chat region rather than being flex siblings. `.chat-scroll` compensates internally with `padding-top: 3rem` and `padding-bottom: calc(...)` — giving the immersive "messages scroll behind frosted chrome" effect. The drawer-pane has no such internal compensation, so its top and bottom slip behind the absolute chrome.

**Attempted fix (Option C, reverted):** Apply chrome-clearance padding to `.framed-shell.drawer-open`, zero the chat-scroll's internal padding when drawer is open. Committed as `03111edc`, reverted as `5f95b36d` because the layout-shift when toggling looked worse than the original problem.

**Recommended next-pass fix (Option B):** Restructure HeaderBar + bottom chrome to be flex siblings of the framed-shell instead of absolute overlays. Frame would form perfectly without z-index trickery. Tradeoff: loses the "chat scrolls behind frosted chrome" effect across all themes (currently a YouCoded design feature). Larger change touching glassmorphism opacity, drag region, mac titlebar inset, multiple themes — better done in a fresh session.

**Alternative if Option B is too aggressive:** Option C-prime — drawer-pane internally pads its top/bottom to avoid chrome (chat keeps current behavior, drawer only is inset). Smaller change. Doesn't form a continuous frame visual but at least makes the drawer visible.

### Lower-priority

- **`setState`-during-render warning** in DevTools throughout the session. Caused by an effect or context update during initial render. Doesn't break functionality.
- **Diagnostic `console.log` statements** still in `App.tsx`'s artifact tracker (added during this round's debugging). Should be stripped before merge.
- **Theme `layout.frame-style` field** is referenced by the `data-theme-layout` attribute but no theme currently has the field — it's always hardcoded to `'framed'`. The floating-theme branch is therefore dead code until a theme opts in.

---

## Not yet verified

These remain as items to check before merging to master:

- Android device verification (Kotlin tests pass but no real-device run of the drawer, inline filepath taps, hardware-back navigation)
- Conflict banner under real concurrent edit (user editing + Claude writing same file at the same time)
- Project View deletion + add-external flows in actual use
- Other themes (only default tested for visual integrity)
- Mac titlebar interactions (`mac-titlebar-inset` overlap with framed-shell)
- Performance with many artifacts (sidecar growth bound concern from Open Questions section 8)
- Multi-window scenarios
