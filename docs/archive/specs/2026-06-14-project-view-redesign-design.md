---
status: shipped
---

# Project View Redesign — Design Spec

**Date:** 2026-06-14
**Status:** Spec (direction approved via interactive prototype; awaiting user review of this doc before plan-writing)
**Stream / branch:** Implement on **`feat/artifact-viewer`** in the `youcoded` repo — same stream as the artifact viewer. Ships *with* that branch; do **not** merge `feat/artifact-viewer` to `master` ahead of this work. (Workspace artifacts — prototype, notes, this spec — live in `youcoded-dev`; code lands in `youcoded`.)

**Prototype:** [`../prototypes/2026-06-14-project-view-redesign.html`](../prototypes/2026-06-14-project-view-redesign.html) (clickable mock, real design language)
**Notes:** [`../prototypes/2026-06-14-project-view-redesign.md`](../prototypes/2026-06-14-project-view-redesign.md)

---

## 1. Goal

Make Project View live up to its name: a comprehensive project hub that surfaces, for any project YouCoded knows about, three things in a clean, non-developer-friendly UI —

1. **Artifacts** — the files Claude produced (existing capability, restyled).
2. **Conversations** — the sessions that happened in the project, with a read-only transcript preview that does **not** launch Claude.
3. **Context** — the agent-influencing files (CLAUDE.md, AGENTS.md, rules, memory) that shape how Claude behaves there, with a plain-language teaching layer and in-place editing.

The redesign also replaces the cramped rail+grid+side-pane layout with the cleaner surfaces introduced in the recent artifact-window work.

## 2. Non-goals (deferred to v2)

- **Advanced context tier:** `settings.json` (hooks / enabled plugins / permissions) and output-styles / installed skills / slash commands. Recognized as real context, intentionally out of v1.
- **Android parity for the new surfaces.** The React renderer is shared, but the new `project:*` IPC handlers are desktop-only in v1; Android keeps returning the existing Project-View stubs (`{ok:false, error:'not-implemented-on-mobile'}`) and the renderer degrades to an "available on desktop" state. A Kotlin parity pass is a tracked follow-up, not part of this spec.
- **Bash `mv`/`rm` artifact tracking, comments, tags, version-history dropdown** — unchanged from artifact-viewer v1 scope.
- **Conversation editing / deletion.** Conversations are read-only here.

## 3. Information architecture (approved)

Full-screen overlay (`fixed inset-0 bg-canvas z-[8000]`, unchanged mount/z from today).

```
┌ Projects ───────────────────────────── [global search]   Esc · Close ┐
│                                                                        │
│  ┌ HERO (.layer-surface) ─────────────────────────────────────────┐  │
│  │  PROJECT                                                         │  │
│  │  <Project Name ▾>                      [Open repo ↗] [New Conv] │  │
│  │  ~/path/to/project · owner/name (git)                           │  │
│  │  N artifacts · N conversations · N context files · active <when>│  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  [ Artifacts ] [ Conversations ] [ Context ]        ← segmented        │
│                                                                        │
│  ┌ active tab body (toolbar + content) ───────────────────────────┐  │
│  └─────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

- **No left project rail.** Project switching happens via the **project name in the hero**, which opens a **centered command-palette switcher** (Palette variant): search field ("Jump to project…"), a "Recent" list (avatar + name + repo glyph + path + `files · chats` + active check), and an "Add a project" footer. Fuzzy-filters on name + path; arrow keys move selection, Enter selects, Esc closes. Project name in the hero is **never truncated**.
- **Hero:** large project name (switcher trigger, with `▾`); filesystem path; when the project has a git repo, the `owner/name` slug inline **plus an "Open repo ↗" outlink**; a stat row; primary action **New Conversation**.
- **Segmented control** order: **Artifacts → Conversations → Context** (defaults to Artifacts). Each tab owns its toolbar.
- **Detail opens in a big centered overlay** (`<Scrim>` + `<OverlayPanel>` at `fixed inset-2 sm:inset-8 md:inset-16`), not a 360px side pane — used by artifacts, conversation previews, and context-file editing alike.

## 4. The three tabs

### 4.1 Artifacts tab

The existing grid, restyled to `.layer-surface` cards. Carries over current behavior: thumbnail + filename + a **word** status label (no glyph), the "Hide code & configs" / "Show deleted" toggles, search, orphan detection via `checkExistence`. Clicking a card opens the artifact in the **big centered overlay** (reusing `ActiveArtifactView`) instead of the side pane.

- **Card status signal (decision):** a small word label in the card meta line — `created` / `edited` / `read` / `deleted` — derived from the latest version's `type`. **No `●◐○`.** (See §7.1 for the matching `SessionDrawer` migration.)

### 4.2 Conversations tab

Lists the project's past sessions (most-recent first). Each row: name (topic, with the Resume-Browser fallback chain already implemented), relative time, message-ish size hint. Clicking opens a **read-only transcript preview** in the big overlay — rendered from the JSONL via the existing `loadHistory`, **no Claude launch** — with two actions:

- **Resume in Claude** — reuses the existing Resume-Browser resume path (start a session with `--resume <sessionId>` in the project cwd).
- **Open full transcript** — reloads the preview with `all = true`.

**Preview depth (decision):** default load = last **20** conversational messages (`loadHistory(id, slug, 20)`); "Open full transcript" calls `loadHistory(id, slug, 0, true)`.

### 4.3 Context tab — the teaching layer

The novel surface. Surfaces the files that influence the agent, grouped by scope, education-first.

**Groups & descriptions** (no trailing periods):
- **This project** — "May be loaded for conversations in this project"
- **Global** — "Loaded before every conversation on this device"
- **Memory** — "Recalled when relevant to a conversation"

**Per-file load-timing badge** — plain text, **no `●◐○`**:
- `Always` — project CLAUDE.md/AGENTS.md and rules with no glob conditions
- `Always · everywhere` — global CLAUDE.md/AGENTS.md
- `When editing <glob>` — a rule whose frontmatter scopes it (e.g. `globs: app/**`)
- `On recall` — an individual memory note
- `Index` — `MEMORY.md`

**Dismiss-forever intro banner** — one-time, persisted (`localStorage` `pv-context-intro-dismissed`), no re-show affordance.

**(i) on each group line** opens a single shared **"How context works"** popup (L2 overlay) with a left nav:
- **Overview** — a visual stack of the four sources broad→specific (Global → This project → Rules → Memory), each with its path + load timing, plus a "the more specific one wins" precedence callout.
- **CLAUDE.md / AGENTS.md / Rules / Memory** — each an icon header + at-a-glance facts strip (Scope · When it loads · Lives at) + short What/When sections + a concrete example of the file (the Rules page shows the `globs:` frontmatter that makes a rule conditional).

**Memory copy (verified behavior, baked in):** project-scoped (`~/.claude/projects/<slug>/memory/`, a `MEMORY.md` index + one file per fact; there is **no** global `~/.claude/memory`); storage is agent-decided (durable, non-obvious facts); recall is automatic surfacing, not a user search (`MEMORY.md` loads each conversation, relevant notes inject into context).

**Editing context files** reuses the centered editor overlay, with a **blast-radius treatment**:
- **Global** files (`~/.claude/CLAUDE.md`, `~/.claude/AGENTS.md`, global rules): a persistent **amber** banner ("affects every project on this device") AND a **confirm-on-save modal** ("This affects every project on this device. Save anyway?").
- **Project** files: a persistent **neutral** banner ("changes how Claude behaves across every session in this project"), **no** save modal.
- Memory files are editable as project-scoped (neutral banner).

## 5. Data layer — what exists vs. greenfield

### 5.1 Reuse (already wired)
- **Artifacts:** central index `~/.claude/youcoded-projects-index.json` (`listProjectsIndex`), per-project sidecar `<root>/.youcoded/artifacts.json` (`listProject`), `artifacts:*` IPC, `ActiveArtifactView`, `checkExistence`, categorization/thumbnails.
- **Conversations:** `desktop/src/main/session-browser.ts` — `listPastSessions(activeIds?)` and `loadHistory(sessionId, projectSlug, count, all)` (reads JSONL, extracts user + `end_turn` assistant text, **no launch**). `transcript-watcher.ts#cwdToProjectSlug(cwd)` maps a project path to its `~/.claude/projects/<slug>` directory.
- **Resume:** the existing Resume-Browser resume flow (session start with `--resume`).
- **Open-external:** existing `window.claude` external-URL open used elsewhere (e.g. marketplace outlinks).

### 5.2 Greenfield — new main-process modules + IPC

All new channels live under a **`project:`** namespace, mirroring the `artifacts:*` convention: a `PROJECT_IPC` map in `desktop/src/main/project/ipc-channels.ts`, wired through `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, and stubbed in `SessionService.kt`. The `tests/ipc-channels.test.ts` parity describe must include them.

**(a) Project-filtered conversations** — `desktop/src/main/project-conversations.ts`
- `project:list-conversations` `(projectPath) → { ok, conversations: PastSession[] }` — wraps `listPastSessions()` filtered to `cwdToProjectSlug(projectPath)` (and the home-slug dedup already in `listPastSessions`). Sorted most-recent-first.
- `project:conversation-history` `(projectPath, sessionId, count, all) → { ok, messages: HistoryMessage[] }` — thin wrapper over `loadHistory(sessionId, cwdToProjectSlug(projectPath), count, all)`.

**(b) Repo info** — `desktop/src/main/project-repo.ts`
- `project:repo-info` `(projectPath) → { ok, hasRepo, remoteUrl?, owner?, name?, webUrl? }` — reads `<root>/.git/config`, parses the `origin` remote, normalizes `git@github.com:owner/name.git` and `https://…/owner/name(.git)` to a canonical `https://github.com/owner/name` `webUrl`. Non-GitHub or remote-less repos return `hasRepo` accordingly (outlink only shown for a resolvable `webUrl`).

**(c) Agent-context discovery + read/write** — `desktop/src/main/project-context.ts` + pure helpers + `desktop/src/shared/project-context-types.ts`

Types:
```ts
export type ContextScope = 'project' | 'global' | 'memory';
export type LoadTiming =
  | 'always' | 'always-everywhere' | 'conditional' | 'on-recall' | 'index';

export interface ContextFile {
  id: string;            // stable: scope + absolutePath
  scope: ContextScope;
  kind: 'claude-md' | 'agents-md' | 'rule' | 'memory-index' | 'memory-note';
  label: string;         // display name, e.g. "CLAUDE.md" or the rule/memory slug
  absolutePath: string;
  timing: LoadTiming;
  glob?: string;         // present when timing === 'conditional'
  editable: boolean;     // false only if we choose to lock a file; true in v1
  blastRadius: 'global' | 'project';
}
export interface ContextGroup { scope: ContextScope; files: ContextFile[]; }
```

Discovery (`project:list-context` `(projectPath) → { ok, groups: ContextGroup[] }`):
- **This project:** `<root>/CLAUDE.md`, `<root>/.claude/CLAUDE.md`, `<root>/AGENTS.md` and recognized variants (from a `RECOGNIZED_INSTRUCTION_FILES` constant — format-agnostic: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, …); `<root>/.claude/rules/*.md`. Each rule's frontmatter is parsed for a `globs:`/`glob:` field → `timing: 'conditional'` + `glob`; absent → `'always'`.
- **Global:** `~/.claude/CLAUDE.md`, `~/.claude/AGENTS.md` (+ variants), `~/.claude/rules/*.md`. CLAUDE/AGENTS → `'always-everywhere'`; rules same glob logic.
- **Memory:** `~/.claude/projects/<slug>/memory/MEMORY.md` (`'index'`) + each other file in that dir (`'on-recall'`).
- Only files that exist on disk are returned. The discovery helper that maps a directory + filename-list → `ContextFile[]` is **pure** (no I/O) and unit-tested against fixtures; the module does the `fs` reads (same pure-core / IO-shell split as the local-theme synthesizer).

Read/write:
- `project:read-context-file` `(absolutePath) → { ok, content }` — bounded read, restricted to paths that appear in the discovered set for that project (no arbitrary-path read).
- `project:write-context-file` `(absolutePath, content) → { ok }` — same allow-list guard. The blast-radius confirm is enforced in the **renderer** before this is called; the handler just writes. (Global-file edits are still gated by the allow-list, so only real discovered context files are writable.)

### 5.3 Hero stats
- `N artifacts` — `listProject(id).artifacts` filtered like the grid (live count, as today's badge already does — do **not** trust `stats.artifactCount`, which is stale).
- `N conversations` — `project:list-conversations` length.
- `N context files` — sum of `project:list-context` group sizes.
- `active <when>` — most-recent conversation `lastModified` (fallback to index `lastSession`).

## 6. Renderer decomposition

Replace the single `ProjectView.tsx` with a composed set under `desktop/src/renderer/components/project-view/`:

| File | Responsibility |
|------|----------------|
| `ProjectView.tsx` (rewritten) | Overlay shell, header, hero mount, segmented control, tab routing, active-project state, big-overlay host |
| `ProjectHero.tsx` | Name (switcher trigger, no-truncate) + path + repo slug + Open-repo outlink + stat row + New Conversation |
| `ProjectSwitcher.tsx` | Centered command-palette (search, recent list, keyboard nav, Add-a-project) |
| `tabs/ArtifactsTab.tsx` | Extracted grid + toolbar (existing logic, restyled, word-label status) |
| `tabs/ConversationsTab.tsx` | Conversation list; opens preview overlay |
| `ConversationPreview.tsx` | Read-only transcript render (loadHistory) + Resume / Open-full |
| `tabs/ContextTab.tsx` | Grouped context list, badges, intro banner, (i) triggers |
| `ContextIntroBanner.tsx` | One-time dismiss-forever banner |
| `HowContextWorksPopup.tsx` | Shared L2 teaching popup with left-nav tabs |
| `ContextEditorOverlay.tsx` | Centered editor for a context file + blast-radius banner + save-confirm |
| `ProjectDetailOverlay.tsx` | Shared big centered overlay host wrapping `ActiveArtifactView` / preview / editor |

State: keep `PV_SESSION = 'project-view'` reserved key for artifact selection. Tab + switcher-open + active-project are local `useState` in `ProjectView`. Per the existing pitfall, `activeArtifactBySession['project-view']` stays the artifact-selection store.

## 7. Cross-cutting cleanups folded in

### 7.1 Glyph migration (SessionDrawer)
`SessionDrawer.statusInfo()` returns `{ glyph: '●◐○✕', word }`. Migrate the drawer and artifact cards to render the **word** form and drop the glyph (consistent with the no-glyph decision and the `dislikes-status-glyphs` memory). This touches `SessionDrawer.tsx` and any card that renders the glyph. Pure word labels: `created` / `edited` / `read` / `deleted`.

### 7.2 PITFALLS / docs
- Update `docs/PITFALLS.md → Artifact Viewer` to note the Project-View detail moved from side-pane to centered overlay and that `project:*` IPC are desktop-only stubs on Android in v1.
- Add a `docs/cc-dependencies.md` entry: context discovery reads CC's project-slug directory layout (`~/.claude/projects/<slug>/`), `CLAUDE.md`/rules conventions, and `memory/MEMORY.md` — all CC-coupled.

## 8. Open decisions — resolved in this spec

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Conversation preview depth | last 20; full via `all=true` |
| 2 | Resume wiring | reuse Resume-Browser `--resume` path |
| 3 | Artifact-card status signal | word label, no glyph |
| 4 | SessionDrawer glyphs | migrate to word labels (§7.1) |
| 5 | Global CLAUDE.md edit flow | persistent amber banner + save-confirm modal; project files = banner only |
| 6 | Context read/write safety | allow-list to the discovered set; no arbitrary-path I/O |
| 7 | Advanced tier (settings/skills) | deferred to v2 |
| 8 | Android parity | desktop-only v1; existing stubs; renderer degrades |
| 9 | Repo outlink scope | only when `.git/config` origin resolves to a GitHub `webUrl` |

## 9. Testing strategy

- **Pure-core unit tests:** context-discovery mapper (directory + filename-list + rule-frontmatter → `ContextFile[]` with correct `timing`/`glob`/`blastRadius`) against fixtures; repo-URL normalizer (git@ / https / .git / non-GitHub).
- **IPC parity:** extend `tests/ipc-channels.test.ts` to assert the new `project:*` channels appear in `preload.ts`, `remote-shim.ts`, and `SessionService.kt`.
- **Conversation filter:** test `project:list-conversations` slugs correctly and dedups home-slug vs project-slug (reuse the `listPastSessions` dedup).
- **Manual / dev:** verify in `bash scripts/run-dev.sh` against a real project with CLAUDE.md + rules + memory + a git remote; never against the live app.

## 10. Provenance

Brainstormed and prototyped interactively (2026-06-13/14). Design language extracted from Marketplace / Resume Browser / Settings / Theme screens. Supersedes the rail+grid+side-pane `ProjectView.tsx`. Implements on `feat/artifact-viewer`; ships with the artifact viewer.
