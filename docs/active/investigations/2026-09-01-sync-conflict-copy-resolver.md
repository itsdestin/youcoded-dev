---
date: 2026-09-01
status: active
type: investigation
topic: No in-app way to find or resolve a sync conflict copy
---

# No in-app way to resolve a sync conflict copy

Feature, milestone TBD (Destin's call, from the beta.9 dogfood). This report holds the current behaviour and the requirements any resolver must meet.

**Today.** The entire conflict story is one transient amber line in the Backup & Sync panel — "Some files had conflicting edits — the other device's copy was kept alongside yours (look for "(from …)" files)" — in `youcoded/desktop/src/renderer/components/SyncPanel.tsx`. It is keyed off a per-boot sync event, so it vanishes on restart whether or not anything was resolved; it names no file, offers no action, and sends the user to a file manager to hunt for `notes (from Laptop, 2026-07-03).md` — the copy `git-transport.ts` writes via `conflictCopyName` (`sync-spaces/guards.ts`) when both devices edited one file.

The notice is still gated on a live per-boot event:
<!-- claim: {"path": "youcoded/desktop/src/renderer/components/SyncPanel.tsx", "contains": "e\\.type === 'conflict'"} -->

**Scope.** Conversation *records* do NOT need this — `foldConflictCopies` (`conversations/store-core.ts`) heals them automatically and prunes the copies. What needs a resolver is user-visible FILES: synced project folders and Personal files.

**Requirements.** (a) find copies by disk scan, not a live event, so state survives restarts and shows a real count; (b) per-file keep-mine / keep-theirs / keep-both with a text preview; (c) route the resolution back through the sync engine as an ordinary synced change (delete/replace propagates) — never a silent local edit; (d) stay honest about binary and large files where a preview isn't possible.

**History.** Added 2026-07-24. Re-checked 2026-09-01: notice still transient and event-keyed, no resolver exists.
