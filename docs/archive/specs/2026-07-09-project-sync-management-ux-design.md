---
status: shipped
---

# Project & Sync Management UX — Design

> **✅ SHIPPED — youcoded#112 + #113 (2026-07-09).** Live status: `docs/superpowers/2026-07-10-sync-completion-handoff.md`.

**Date:** 2026-07-09
**Status:** Approved by Destin (chat + mockup review; preview artifact: `project-sync-ux-preview`)
**Builds on:** `2026-07-03-cross-device-sync-design.md` (spec §3 import flows, shipped in youcoded#107 + #109)
**Problem:** The session picker grew three add-a-thing actions ("Browse for folder", "New project name…/Create", "or move an existing folder into sync…") that differ on two invisible axes at once — where the folder lives and whether it syncs. A user who doesn't already know the project-vs-folder and synced-vs-unsynced distinctions can't tell them apart. Per-project sync management doesn't exist anywhere, and Project View (the natural home for it) is undiscoverable from the picker.

## 1. Decisions (locked with Destin, 2026-07-09)

1. **One noun: "project."** "Folder" appears only when describing the mechanical consequence on disk ("its folder moves to ~/YouCoded/Projects/").
2. **Two sync states, always the same phrases:** "Syncs across your devices" / "Only on this computer". Where there's room (Project View hero) the words appear in full; in the compact picker they compress to a **colored dot with a hover tooltip** carrying the full phrase (green = syncing, red = sync problem, gray = not in sync). Dots match the existing SessionDot visual language — status colors are the one sanctioned raw-color use. (This is Destin's explicit choice for the picker; it does not reopen the no-●◐○-glyphs rule, which is about glyph *text* in labels.)
3. **The picker just picks.** Its footer is a single **"Manage projects…"** entry that opens Project View (dispatches the existing `PROJECT_VIEW_OPENED`, closes the session menu). No add/create/import entries in the picker at all.
4. **Project View is the management hub.** Adding projects, turning on sync, rename, remove, sync-now all live there.
5. **One "Add a project" flow** (Project View only): Step 1 — "Start something new" (inline name field; creates a synced project) or "Use a folder already on this computer" (native picker). Step 2, existing-folder only — "Keep it where it is" (only on this computer) vs "Move it into YouCoded so it syncs" (consequence line about the folder moving).
6. **Global-Sync-off honesty rule (decision A):** creating/moving into `~/YouCoded/Projects/` is allowed while Sync is off; all sync promises become "This project will start syncing once you turn on Sync in Settings" (amber note in the Add flow, tooltip wording on gray dots for managed projects).
7. **Deferred (decision A on scope):** "move a project out of sync" (reverse import: folder move-out, watcher stop, remote-repo disposition, second-device semantics) and folder-rename for synced projects (a folder rename changes the sync identity — `repoNameForSpace` derives from the folder name). Both are designed-out here as named follow-ups, not built.

## 2. Surface 1 — Session picker (FolderSwitcher)

- **Rows:** nickname + path as today, plus a sync dot at the row's right edge:
  - **Green** — managed project (under `~/YouCoded/Projects/`), global Sync on, no outstanding error for its space. Tooltip: "Syncs across your devices".
  - **Red** — managed project whose space's most recent sync event is an `error` (from `syncSpaces.status().recentEvents`, matched by space root == project path). Tooltip: "Sync isn't working — open Manage projects".
  - **Gray** — not managed. Tooltip: "Only on this computer". Also gray for managed projects while global Sync is off, tooltip: "Sync is turned off — will sync once you turn on Sync in Settings".
- **Footer:** single "Manage projects…" row → `PROJECT_VIEW_OPENED` + close the session menu.
- **Removed from the picker:** "Browse for folder", the inline "New project name…/Create" field, "or move an existing folder into sync…", the "synced project" text badge, **and the per-row "Sync this project" hover icon** (its function moves to the Project View hero; the picker keeps only rename/remove hover actions for list housekeeping). If review disagrees on dropping the row action, it can stay without affecting the rest.
- **Data:** one `syncSpaces.status()` call when the dropdown opens (enabled flag + spaces + recentEvents) merged with the `folders.list()` result. On rejection (Android has no syncspaces handlers), no dots render and the footer entry still works — Project View's own tabs already degrade on mobile.

## 3. Surface 2 — "Add a project" flow (Project View)

A single L2 modal (`AddProjectModal`), replacing ProjectView's current bare `dialog.openFolder → folders.add` "Add a project" button behavior. It is a thin **router over existing machinery** — no new main-process flows:

- **Step 1:**
  - **"Start something new"** — "Creates an empty project in YouCoded that syncs across your devices." Inline name field + Create → existing `syncSpaces.createProject(name)`. Inline error on invalid/taken names (existing `validateSyncName` messages).
  - **"Use a folder already on this computer"** — "Pick any folder — you'll choose whether it syncs next." → `dialog.openFolder`.
- **Step 2 (existing folder only):** "How should "<basename>" work?"
  - **"Keep it where it is"** — "Only on this computer. The folder doesn't move and nothing changes." → existing `folders.add(path)`.
  - **"Move it into YouCoded so it syncs"** — "The folder moves to ~/YouCoded/Projects/ and syncs across your devices. Anything pointing at the old location (shortcuts, open terminals) will need the new path." → opens the existing `ImportProjectModal` (name confirm + consent + warnings), i.e. `syncSpaces.importProject`.
- **Sync-off variant:** when `status().enabled === false`, an amber note in both steps: "Sync is currently turned off. This project will start syncing once you turn on Sync in Settings."
- After any successful path: refresh the project list and select/open the new project.

## 4. Surface 3 — Project View management hub

- **ProjectHero sync line** (an inset strip under the name/path):
  - Unsynced: "**Only on this computer**" + primary button "Turn on sync for this project" → existing `ImportProjectModal` for this project's path.
  - Synced: "**Syncs across your devices**" (green-tinted words) + "Last synced X ago" + "Sync now" button.
  - Synced with an error: the words become "Sync isn't working" with the latest error message from `recentEvents` shown inline (reuses SyncPanel's friendly-error contract — gh not installed / not signed in, etc.).
  - Global Sync off: "Sync is turned off — this project will sync once you turn it on in Settings" with a link that opens Settings → Sync.
- **Hero management actions:** Rename (nickname via `folders.rename` — never the folder on disk), Open in File Explorer (`shell:open-path` on the project root; Electron-gated like the artifact viewer's button), Remove from YouCoded (**unsynced projects only** — routes through ProjectView's existing remove/delete-confirm; for synced projects the slot notes "managed by sync" and removal waits for the deferred move-out flow).
- **ProjectSwitcher rows:** add the same sync dot as the picker (compact rows), keeping "N files · M chats".
- **Small backend addition (the only one):** per-project "Sync now" needs `syncspaces:sync-now` to accept an optional space id (today it syncs all spaces). Same handler, optional param, full parity surfaces as usual. "Last synced" derives read-time from the latest `synced` event per space in `recentEvents` — no new persistence.

## 5. Explicitly out of scope

- Move a project out of sync (reverse import) — named follow-up.
- Folder rename for synced projects (sync-identity change).
- Any engine/transport changes; the global Sync toggle stays in Settings → Sync.
- Android: no new Kotlin handlers (consistent with all `syncspaces:*` — the UI degrades; dots simply don't render when status() rejects).

## 6. Component/file map (for the plan)

| Piece | Where |
|---|---|
| Picker rows + dot + footer | `desktop/src/renderer/components/FolderSwitcher.tsx` (remove create/import/browse footer; add status merge) |
| Add-a-project modal | new `desktop/src/renderer/components/project-view/AddProjectModal.tsx`, mounted from `ProjectView.tsx` (replaces `handleAddProject`'s direct picker call) |
| Hero sync line + actions | `desktop/src/renderer/components/project-view/ProjectHero.tsx` (+ `ProjectView.tsx` wiring for status data) |
| Switcher dots | `desktop/src/renderer/components/project-view/ProjectSwitcher.tsx` |
| Per-space sync-now | `sync-spaces/service.ts` `syncSpacesSyncNow(spaceId?)` + the four parity surfaces + parity test row |
| Reused as-is | `ImportProjectModal.tsx`, `syncSpaces.createProject/importProject/status`, `folders.*`, `PROJECT_VIEW_OPENED` |

## 7. Success criteria

1. A first-run user opening the session picker sees only folders + "Manage projects…" — no sync vocabulary to decode.
2. From the picker they can reach Project View, add a new or existing project, and understand at the moment of choice whether it will sync and what moving means.
3. Sync state is visible at a glance in the picker (dot) and in full words in Project View, and a failing project is discoverable from both.
4. Nothing lies when Sync is globally off.
