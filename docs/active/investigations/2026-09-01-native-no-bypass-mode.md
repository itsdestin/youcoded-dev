---
date: 2026-09-01
status: active
type: investigation
topic: Native sessions have no bypass permission mode — the Skip Permissions toggle is hidden and hardcoded off
---

# Native sessions cannot skip permissions

**Symptom.** Starting or resuming a session on a local/OpenRouter model, the "Skip
Permissions" toggle a Claude Code session offers is not there; the permission chip cycles
Ask → Auto-edit → Full Auto and nothing further. Full Auto still stops on the deny-list and
on paths outside the project.

**Mechanism.** The native mode type has three members and no `'bypass'`:
<!-- claim: {"path": "youcoded/desktop/src/shared/permission-types.ts", "contains": "export type NativePermissionMode = 'ask' \\| 'auto-edit' \\| 'full-auto';"} -->
`App.tsx` hardcodes `skipPermissions: false` on native creates (comment: "native sessions
have no PTY permission flow"), and the toggle is hidden for native in the create/resume
surfaces. Never wired, not broken.

**Shape.** Add `'bypass'` to `NativePermissionMode`; seed it from the create/resume toggle;
un-hide the toggle for native; extend the status-bar chip cycle and display map; keep the
secret-path hard-deny (tool-layer, not a rule — `tools/guards.ts`); drop the
`external_directory` ask under bypass. `native:*` four-surface IPC parity applies
(`ipc-channels.test.ts`). Distinct from the full-auto external-read work
(`2026-09-01-full-auto-external-read-ask.md`), which only lifts the external ask for three
read tools inside `full-auto`.

**Verified 2026-09-01.** `rg "'bypass'" desktop/src/shared/permission-types.ts
desktop/src/main/harness` → nothing; `App.tsx:2507` still `skipPermissions: false`.

History: filed 2026-08-26.
