---
date: 2026-09-01
status: active
type: investigation
topic: Phone-originated set-tag / set-note never refreshes the open desktop window
---

# Phone-originated set-tag / set-note never refreshes the desktop window

**Symptom.** Tag or note a conversation from a phone (remote client). Other remote clients update, but an open desktop window keeps the old tag/note until some unrelated meta event or a refetch.

**Mechanism.** The ipcMain handlers for `session:set-tag` / `session:set-note` do two things after writing: `broadcast(...)` to remote clients AND `sendForSession(sessionId, IPC.SESSION_META_CHANGED, ...)` to refresh the owning desktop window (`youcoded/desktop/src/main/ipc-handlers.ts` ~line 280). The remote WS twins (`youcoded/desktop/src/main/remote-server.ts` cases `session:set-tag` ~1187 and `session:set-note` ~1225) got the `broadcast({type:'session:meta-changed'})` half in the `fix/roadmap-easy-knockouts` batch — but remote-server has no path to `sendForSession`. The only bridge ipc-handlers hands it is `setSessionMetaWiring`, which injects exactly `resolve` and `canWrite`, nothing that can notify the desktop renderer.

`setSessionMetaWiring` still takes only `resolve` + `canWrite`:
<!-- claim: {"path": "youcoded/desktop/src/main/remote-server.ts", "contains": "setSessionMetaWiring\\(w: \\{"} -->

**Fix shape.** Extend `setSessionMetaWiring` with a `notify(sessionId, payload)` callback that ipc-handlers backs with `sendForSession(..., IPC.SESSION_META_CHANGED, ...)`, and call it from both WS handlers next to the existing broadcast.

**History.** Added 2026-08-22 (found while fixing the remote-broadcast half of the 2026-07-23 SESSION_META_CHANGED entry). Re-checked 2026-09-01: wiring unchanged, still open.
