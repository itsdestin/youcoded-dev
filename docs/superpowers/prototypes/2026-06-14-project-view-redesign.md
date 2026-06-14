# Project View Redesign — Design Notes & Prototype

**Status:** Direction approved via interactive prototype (2026-06-14). Formal spec + implementation plan still pending — this captures the agreed UX, the infrastructure to build on, and the open items so the build can pick up cleanly.

**Prototype:** [`2026-06-14-project-view-redesign.html`](./2026-06-14-project-view-redesign.html) — a self-contained, clickable HTML mock. Open it in a browser. (It loads Tailwind via CDN for fidelity, so it needs internet; the real implementation uses the app's own Tailwind + theme tokens.) It is built strictly to YouCoded's design language — `.layer-surface`, monochrome palette, accent used once per view, uppercase `tracking-wider` micro-labels, outline-not-fill selection — mirrored from the marketplace / resume-browser / settings surfaces.

## Goal

Make Project View live up to its name: a comprehensive project hub that surfaces (a) the **artifacts** Claude produced, (b) the **conversations** that happened in the project, and (c) the **agent context** that shapes how Claude behaves there — in a clean, navigable, non-developer-friendly UI that reuses the recent artifact-window improvements.

## Agreed UX / information architecture

- **Full-screen overlay.** Top header: "Projects" title + global search + Esc·Close. (Header kept "for now" — revisit later.)
- **No left project rail.** Project switching happens by clicking the **project name** in the hero, which opens a **centered command-palette switcher** (⌘K style): search field, a "Recent" list of projects (name + path + `files · chats` + repo glyph + active check), and an "Add a project" footer.
- **Hero project card:**
  - Large project **name** (the switcher trigger, with a `▾`) — **not truncated**.
  - Filesystem path, and when the project has a git repo: the repo slug (`owner/name`) inline **plus an "Open repo" GitHub outlink** button. Repo-less projects show neither.
  - Stat row: `N artifacts · N conversations · N context files · active <when>`.
  - Primary action: **New Conversation**.
- **Segmented control** picks the active category — order **Artifacts → Conversations → Context** (defaults to Artifacts) — each with its own toolbar/chips.
- **Detail opens in a big centered overlay** (not a cramped side pane), so content gets real room. Reuses the existing `ActiveArtifactView` for artifacts.

### Artifacts tab
`.layer-surface` card grid (thumbnail + filename + kind), Hide-code-&-configs / Show-deleted toggles, sort. (Carries over the existing ProjectView artifact behavior.)

### Conversations tab
List of past sessions in this project. Clicking one opens a **read-only transcript preview** in the overlay (no Claude launch) with **Resume in Claude** / **Open full transcript**.

### Context tab — the teaching layer
The most novel part. Surfaces the files that influence the agent, grouped by scope with plain-language, education-first framing:

- **Groups & descriptions:**
  - *This project* — "May be loaded for conversations in this project"
  - *Global* — "Loaded before every conversation on this device"
  - *Memory* — "Recalled when relevant to a conversation"
- **Per-file load-timing badge** (plain text — e.g. `Always`, `Always · everywhere`, `When editing app/**`, `On recall`, `Index`) so users see *when* each file actually affects Claude. **No `●◐○` status-glyph language anywhere** (the user dislikes it — see workspace memory `dislikes-status-glyphs`; the real artifact drawer still uses it in `SessionDrawer.statusInfo()` and should be migrated to word labels when touched).
- **Dismiss-forever intro banner** explaining what context is (persisted; no re-show affordance).
- **(i) on each group line** opens a single shared **"How context works"** popup with a left nav:
  - **Overview** — a visual stack of the four sources broad→specific (Global → This project → Rules → Memory) with each one's path + load timing, plus a "the more specific one wins" precedence callout.
  - **CLAUDE.md / AGENTS.md / Rules / Memory** — each an icon header + at-a-glance facts strip (Scope · When it loads · Lives at) + short What/When sections + a concrete **example** of the file (e.g. the Rules page shows the `globs: app/**` frontmatter that makes it conditional).
- **Format-agnostic discovery:** recognize `CLAUDE.md`, `AGENTS.md`, and similar instruction-file conventions (for future custom harnesses / opencode), not just `CLAUDE.md`.
- **Editing** context files reuses the artifact editor, with a **blast-radius warning** — strong (amber) for global `~/.claude/CLAUDE.md` (affects every project), milder for project files.

### Memory — verified behavior (baked into the popup copy)
- **Project-scoped.** Stored under `~/.claude/projects/<project-slug>/memory/` (a `MEMORY.md` index + one file per fact). There is **no** global `~/.claude/memory`. What Claude learns in a project stays with that project.
- **Storage is agent-decided**, not automatic per message: Claude saves durable, non-obvious facts it couldn't just re-read from code/git/docs.
- **Recall is automatic surfacing, not a user-triggered search:** `MEMORY.md` (one line per memory) loads at the start of every conversation, and the relevant full notes are injected into context as background when they apply.

## Infrastructure to build on (vs. greenfield)

- **Artifacts** — already wired: artifact central index (`youcoded-projects-index.json`) + per-project sidecars (`.youcoded/artifacts.json`), `ARTIFACT_IPC.*` handlers, and the existing `ProjectView.tsx`. The redesign restructures the renderer; the data layer largely exists.
- **Conversations** — `desktop/src/main/session-browser.ts` already has `listPastSessions()` and `loadHistory(sessionId, projectSlug, count)` (reads the JSONL transcript, extracts user + assistant messages, **no Claude launch**). `cwdToProjectSlug()` maps a project path to its transcript slug. **Need:** a project-filtered variant + IPC (e.g. `project:list-conversations`); `listPastSessions()` is currently global.
- **Agent context — greenfield.** Nothing reads `CLAUDE.md` / `.claude/rules/` / memory for *display* today. **Need:** discovery of the effective context set (project + global `CLAUDE.md`/`AGENTS.md`, `.claude/rules/*`, memory index + files) and a read IPC (e.g. `project:read-context`). Discovery should take a *list* of recognized filenames (format-agnostic).
- **Cross-platform:** the React renderer is shared, so most of this lands on both platforms. Android Project View handlers are currently v2 stubs (see `docs/PITFALLS.md → Artifact Viewer`); a parity pass is its own task.

## Open items / decisions for the spec

- Replace the `●◐○` status glyphs in the real artifact drawer/cards (`SessionDrawer.statusInfo()`) with word labels — consistent with the no-glyph decision here.
- Artifact-card status signal: decide between a word label ("created"/"edited") or none (glyphs were removed).
- Conversation preview: depth (last-N vs full), and the resume wiring.
- Blast-radius confirm flow for editing global `~/.claude/CLAUDE.md`.
- "Advanced" context tier (future): `settings.json` (hooks/enabled plugins/permissions) and output styles / installed skills + slash commands — deferred from v1.
- Real switcher: search + keyboard navigation.
- Android parity plan for the new conversation + context surfaces.

## Provenance

Brainstormed and prototyped interactively (this session). Design language extracted from `MarketplaceScreen`/`MarketplaceCard`/`MarketplaceRail`, `ResumeBrowser`, `SettingsPanel`, `ThemeScreen`. Supersedes the cramped grid+side-pane layout in the current `ProjectView.tsx`.
