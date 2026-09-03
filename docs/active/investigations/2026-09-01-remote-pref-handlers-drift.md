---
date: 2026-09-01
status: active
type: investigation
topic: the remote server hand-rolls ~16 preference handlers that duplicate ipc-handlers.ts and have drifted
---

# Remote server's hand-rolled preference handlers have drifted from the desktop's

**Symptom.** Settings read over remote access can disagree with what the desktop shows
for the same file — defaults, folders, permission overrides.

**Mechanism.** `youcoded/desktop/src/main/remote-server.ts` reimplements the
`defaults:*`, `favorites:*`, `modes:*`, `folders:*`, `settings:*` and `model:*`
preference channels inline (16 `case` arms, counted 2026-09-01) instead of calling the
same functions `ipc-handlers.ts` uses. They have already diverged: the desktop's
`defaults:get` merges `permissionOverrides` over `PERMISSION_OVERRIDES_DEFAULT` and runs
`syncPermissionOverrides`; the remote copy re-declares its own `DEFAULTS_INITIAL`
(`{ skipPermissions, model, projectFolder }`) and does neither.
<!-- claim: {"path": "youcoded/desktop/src/main/remote-server.ts", "contains": "case 'defaults:get': \\{\\n\\s*const defaultsPrefPath"} -->

The 2026-08-26 re-verification of the review handoff rated this "OPEN, and now WORSE"
(three live drift bugs across defaults/folders at that time).

**Fix shape.** Lift each preference handler's body into a shared function in main, call
it from both `ipcMain.handle` and the WS `switch`. The `ipc-channels.test.ts` parity
suite pins that the channel EXISTS on every surface, not that it does the same thing —
a behaviour-parity test for these channels is the guard to add.

**History.** 2026-07-10 remote-access review Finding 3 (item 3 of the 2026-07-15 rework
umbrella). Re-checked against `master` 2026-09-01: still duplicated, still drifted.
