# Custom Session Tags & Notes — Design

**Date:** 2026-07-13
**Status:** Approved design, pre-implementation
**Scope:** Desktop (Electron + React renderer); data layer syncs to Android, mobile UI deferred

## Summary

Replace the closed three-flag session tagging system (`priority`, `helpful`, `complete`) with:

- **Two retained reserved flags** — `priority` (pins a session to the top of its project group in the Resume Browser) and `complete` (hides a session from the Resume Browser unless "Show Complete" is on). These stay because they drive real behavior.
- **`helpful` removed** — it was purely informational and is superseded by custom tags.
- **First-class custom tags** — user-created labels with a stable id, a themed color, a display label, and an archived state. Reusable across sessions via a shared Tag Picker. A session can carry many tags; a tag can be on many sessions.
- **One-time session notes** — a freeform plain-text field per session for extended context ("what was this session, why would I resume it").

Tags are **first-class objects** (not lightweight strings) specifically so we can rename, recolor, and archive them later without re-tagging every session — the tag's stable id decouples identity from its label.

## Goals

- Let a user organize sessions with arbitrary reusable labels (e.g. "Auth rewrite", "Review After 6/10") and per-session freeform notes.
- Rename / recolor / archive tags without breaking existing applications.
- Converge cleanly across a user's devices using the sync machinery already in place.
- Keep the app's semantic-token theming intact (no unreadable tag colors on any theme).

## Non-goals (v1)

- A dedicated "Manage tags" management screen (inline management only; see Future Extensions).
- Free-hex color picker (fixed themed palette only).
- Mobile (Android) tagging UI — the data layer syncs, the touch UI is deferred.
- Hard cleanup of orphaned `tag:<id>` applications after a tag delete (they render nothing; lazy cleanup is a later task).
- Migrating old `helpful` marks into anything — they are dropped (ignored).

## Current system (as built)

- `SessionFlagName = 'complete' | 'priority' | 'helpful'` and `SESSION_FLAG_NAMES` — `youcoded/desktop/src/shared/types.ts`. The `session:set-flag` IPC handler rejects any name not in this union (`ipc-handlers.ts` ~line 1903).
- Flags persist as `flags: Record<string, FlagState>` where `FlagState = { value: boolean, updatedAt: string }` on the Conversation Store record — `youcoded/desktop/src/main/conversations/store-core.ts`. Per-key `updatedAt` drives independent, convergent, newest-write-wins merge in `mergeRecords`. **The merge already handles arbitrary string keys** — only the surrounding validation is closed.
- Legacy dual-write into `conversation-index.json` continues until Plan 2c; `session-browser.ts` joins flag metadata and filters to known names (`k === 'complete' || 'priority' || 'helpful'`).
- Five UI surfaces reference flags: Resume Browser expanded row (toggle pills), Resume Browser collapsed row (badges `▲ ● ✓` before the name), Resume Browser filter bar ("Tags" pill + "Show Complete" toggle), `CloseSessionPrompt`, and the Android mirror (`SessionService.kt` / `SessionBrowser.kt`, resume deferred).

## Data model

Three distinct pieces of data.

### 1. Tag registry (the catalog)

One JSON file per tag in the Personal sync space, mirroring how one conversation = one file. Each editable field carries its own `*UpdatedAt` timestamp so field-level newest-wins merge converges across devices (same pattern as `FlagState`).

```jsonc
{
  "schema": 1,
  "id": "tag_01J...",          // stable identity — never changes; enables rename
  "label": "Auth rewrite",
  "labelUpdatedAt": "2026-07-13T18:22:04.100Z",
  "color": "tag-blue",          // palette slot key, NOT raw hex
  "colorUpdatedAt": "2026-07-13T18:22:04.100Z",
  "archived": false,
  "archivedUpdatedAt": "2026-07-13T18:22:04.100Z",
  "deleted": false,             // tombstone — a delete must propagate, not resurrect
  "deletedUpdatedAt": "2026-07-13T18:22:04.100Z",
  "createdAt": "2026-07-13T18:22:04.100Z"
}
```

- **id** — a ULID/UUID generated at creation. Charset-allowlisted and path-traversal-guarded on read/write exactly like conversation ids (`[A-Za-z0-9._-]`, reject `.`/`..`/separators/NUL/Windows-reserved), then `path.resolve`-contained under the tags dir. Reachable over the remote WS, so this guard is a security boundary.
- **Merge:** each field independently takes the value with the newest `*UpdatedAt`; exact-timestamp ties break on a stable content comparison (reuse the `laterOf` total-order tiebreak from `store-core.ts`) so `merge(a,b) === merge(b,a)`. `createdAt` keeps the earliest claim (`earliestOf`).
- **Delete = tombstone:** `deleted: true` with a timestamp, never a bare file removal. An older copy on another device merges to `deleted: true` rather than resurrecting the tag. Deleted tags never render and are filtered out of `tags:list`.

A pure `tag-registry-core.ts` (no fs/path/os — same pure-core/IO-shell split as `store-core.ts` / `local-theme-synthesizer.ts`) owns parse/sanitize/merge and is unit-tested with plain objects. The IO shell (`tag-registry.ts`) does disk work under the same CAS/lock primitives conversations use (`cas-write.ts` / `mutateFileUnderLock`) because the dev instance and built app share `~/YouCoded`.

### 2. Tag application (which sessions carry which tags)

Stored on the conversation record's **existing** `flags` map under namespaced keys, alongside the reserved keys:

```jsonc
"flags": {
  "priority": { "value": true, "updatedAt": "..." },
  "complete": { "value": false, "updatedAt": "..." },
  "tag:tag_01J...": { "value": true, "updatedAt": "..." }
}
```

- Reuses the proven per-key convergent merge unchanged — applying a tag on one device and removing it on another converges for free. **No new sync code for application.**
- Backend changes are limited to two spots: a **new `session:set-tag` channel** that writes `tag:<id>` keys into the flag map (so `session:set-flag` stays closed to `priority`/`complete` and its validation is untouched), and updating `session-browser.ts`'s known-name filter to pass `priority`, `complete`, and any `tag:*` key through (dropping `helpful`).

### 3. Session note (freeform text)

A new field on `ConversationRecord`:

```jsonc
"note": "Left off mid-refactor; the OAuth callback still 500s on Windows.",
"noteUpdatedAt": "2026-07-13T18:40:00.000Z"
```

- Independent field-level merge: newest `noteUpdatedAt` wins. **Not** activity-coupled (unlike `title`, which rides `lastActive`) — a note edit on an idle device must not lose to a busier device's newer turn.
- Plain text, one note per session, hard cap of **8,000 characters** (≈8 KB for ordinary text; comfortably ≤8 KB even with multi-byte characters) to keep sync light. The editor enforces the limit and shows a remaining-characters count as it's approached. Empty string is a valid value (clearing a note).
- `parseRecord` defaults `note` to `''` and `noteUpdatedAt` to `createdAt` when absent, so older records upgrade transparently.

## Storage & sync layout

- Registry: `~/YouCoded/Personal/Tags/<id>.json` (one file per tag), riding the Personal sync space — the same space conversations use.
- Application: inside each conversation record (`~/YouCoded/Personal/Conversations/claude/<id>.json`), no new file.
- Note: inside each conversation record.
- **Works with sync OFF:** registry and notes write locally regardless of the sync-enabled flag (same as conversations today); they travel once sync is enabled.

## Reserved flag behavior (unchanged, restated)

- `priority` — pins the session to the top of its project group / list in the Resume Browser (`sortSessions` in `resume-browser-filters.ts`).
- `complete` — hides the session unless "Show Complete" is on (`applyFilters`), with the existing sticky-visible-until-reopen behavior.
- These render as **dedicated toggles** (not tags) wherever tagging happens, and as distinct indicators (not colored chips) on the collapsed row.

## IPC surface

New channels, added to all bridge surfaces for parity (`remote-shim.ts`, `preload.ts`, `ipc-handlers.ts`, `SessionService.kt`), message-type strings identical across them:

| Channel | Shape | Notes |
|---|---|---|
| `tags:list` | `() → TagRecord[]` | Non-deleted tags; archived included (caller filters). |
| `tags:create` | `(label, color) → TagRecord` | Reuses an existing non-archived case-insensitive label match instead of duplicating; rejects blank labels. |
| `tags:update` | `(id, { label?, color?, archived? }) → TagRecord` | Field-level; stamps the matching `*UpdatedAt`. |
| `tags:delete` | `(id) → { ok }` | Writes the tombstone. |
| `session:set-tag` | `(sessionId, tagId, value) → { ok }` | Writes `tag:<id>` into the record's flag map; broadcasts `session:meta-changed`. |
| `session:set-note` | `(sessionId, note) → { ok }` | Writes `note` + `noteUpdatedAt`; broadcasts `session:meta-changed`. |

Existing `session:set-flag` stays for `priority`/`complete`; drop `helpful` from `SESSION_FLAG_NAMES`. A `tags:changed` broadcast (analogous to `session:meta-changed`) notifies open windows/remotes when the registry mutates, so every Tag Picker refreshes live.

The `session:set-tag` handler keeps the same phantom-record gate as `session:set-flag` (only write the store record when the id is a known CLAUDE id or a non-live session), so tagging a live session before its SessionStart hook establishes the id map cannot seed a phantom record.

## UI surfaces

### Shared Tag Picker component

One component used in every tagging spot so behavior is identical:

- Search box filters existing tags as you type. If no tag matches, a **"+ Create '&lt;typed text&gt;'"** row appears — create-and-apply in one motion.
- Each row: colored dot + label; click toggles application on the current session. A small edit affordance per row opens inline **rename / recolor (swatch row) / archive**.
- Archived tags are hidden by default behind a "Show archived" toggle.
- Applied tags render as small **colored chips with plain-word labels** — no status glyphs (per user preference).

### Session note field

A simple expandable "Add a note…" text field sitting next to the Tag Picker in each surface; shows the note when present, edit-in-place, saves via `session:set-note`.

### Surface-by-surface

1. **Resume Browser — expanded row.** Replace the three flag pills with: `Priority` / `Complete` toggles + the Tag Picker + the note field.
2. **Resume Browser — collapsed row.** Colored tag chips + priority/complete indicators render **after the name** (not before). A present note shows as a subtle "has note" affordance (hover/expand).
3. **Resume Browser — filter bar.** The "Tags" pill becomes a **multi-select filter over custom tags** (default "match any"); "Show Complete" stays. The search box also matches **note text and tag labels**, in addition to title/path (extend `applyFilters` in `resume-browser-filters.ts`; the pure filter functions get tag/note inputs threaded through and gain unit tests).
4. **In-session — new fixed StatusBar element.** A single status-bar button beside the model/permission pills showing **colored tag icons + a notebook (paper/pencil) icon** side by side, reflecting the session's current tags and note-presence at a glance. With **no tags and no note**, it renders as a plain **"Add tags"** button in that spot. Clicking opens a popup with the shared Tag Picker + note field. It is a **core control, not a toggleable widget** — it appears in the `WidgetConfigPopup` management menu but **disabled/locked** so it can't be turned off.
5. **Close-session prompt.** `Priority` / `Complete` toggles + Tag Picker + note, so a session can be labeled as it's wrapped up. (`CloseSessionPrompt.tsx` currently sets flags only; extend to also apply tags and set a note on confirm.)

## Color palette

A fixed set of ~8–10 tag color slots defined in theme terms in `theme-engine.ts` (e.g. `tag-blue`, `tag-green`, `tag-amber`, …), each resolving to a theme-legible color so a tag stays readable on Light, Dark, Midnight, Crème, and community themes, and in both light/dark. The registry stores the **slot key**, never a raw hex, so a theme swap re-tints every tag automatically. No free color picker in v1.

## Migration

- **No active data migration.** Stop reading/writing `helpful`; remove it from the `SessionFlagName` union and `SESSION_FLAG_NAMES`. Existing `helpful` entries in stored records become inert — the known-name filter no longer passes them through, so they never render. They remain harmlessly in the flag map and sync as-is (no cleanup needed for v1).
- `priority` / `complete` marks are untouched.
- Records without `note` / `noteUpdatedAt` upgrade transparently via `parseRecord` defaults.

## Cross-platform parity & Android

- All new IPC channels are added to `remote-shim.ts`, `preload.ts`, `ipc-handlers.ts`, and `SessionService.kt` so `window.claude` stays in shape parity (pinned by `ipc-channels.test.ts`).
- **Data layer syncs on Android** — the registry files and note fields ride the Personal sync space and merge the same way.
- **Android UI is deferred (v1):** the in-session StatusBar tag element and Resume Browser tagging are **hidden on touch**, consistent with the already-deferred mobile Resume Browser. Android handlers for `tags:*` / `session:set-tag` / `session:set-note` are stubbed returning `{ ok: false, error: 'not-implemented-on-mobile' }` (the artifact-viewer stub pattern) so the shared UI degrades instead of crashing, and the invoke rejects fast rather than timing out. Mobile UI lights up in a later phase with the data already present.
- Remote browser clients get full parity — the registry is served over the WS and the Tag Picker works remotely.

## Edge cases

- **Duplicate labels:** `tags:create` reuses an existing non-archived tag whose label matches case-insensitively rather than creating a duplicate; blank/whitespace labels rejected.
- **Orphaned applications:** a `tag:<id>` on a session whose registry tag was deleted renders nothing (registry lookup misses) and is ignored; lazy cleanup deferred.
- **Archived tag on a session:** the chip still renders (optionally muted); the tag is only hidden from the picker's default list.
- **Note size:** plain text, hard-capped at 8,000 characters (editor-enforced with a remaining-count near the limit); empty is valid (clear).
- **Concurrent registry writes:** dev + built app share `~/YouCoded`; registry writes go through the same CAS/lock primitives as conversations to avoid lost updates.
- **Live-session tagging before id map:** the phantom-record gate prevents seeding a store record keyed by the desktop UUID.

## Testing

- `tag-registry-core.test.ts` — parse/sanitize/merge (field-level newest-wins, tombstone convergence, `merge(a,b) === merge(b,a)`, createdAt earliest-claim, duplicate-label reuse).
- Extend `store-core` tests for `note` / `noteUpdatedAt` merge (newest-wins, independent of activity).
- `resume-browser-filters` tests for the custom-tag multi-select filter + note/label search.
- `ipc-channels.test.ts` parity assertions for the new channels across all four surfaces.
- Manual: create/apply/rename/recolor/archive/delete a tag; set/clear a note; verify Resume Browser chips (after the name), filter, and search; verify the StatusBar element states ("Add tags" vs populated) and its locked entry in the widget config menu.

## Future extensions (explicitly out of v1)

- Dedicated "Manage tags" view (usage counts, bulk archive, reorder) reached from a "Manage tags…" link in the picker.
- Free color picker / custom palette.
- Android tagging UI.
- Orphaned-application cleanup sweep after tag deletion.
- Tag colors influencing anything beyond chips (e.g. session-row accents).
