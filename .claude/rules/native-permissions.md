---
paths:
  - "youcoded/desktop/src/main/harness/permission-store.ts"
  - "youcoded/desktop/src/main/harness/native-session-host.ts"
  - "youcoded/desktop/src/shared/permission-types.ts"
  - "youcoded/desktop/src/renderer/components/PermissionsSection.tsx"
  - "youcoded/desktop/src/renderer/components/permissions/**"
last_verified: 2026-08-12
verify:
  - path: youcoded/desktop/src/main/harness/permission-store.ts
    contains: "removeProject"
  - path: youcoded/desktop/src/main/harness/native-session-host.ts
    contains: "revokeRule"
  - path: youcoded/desktop/src/main/harness/native-session-host.ts
    contains: "cwdToProjectSlug"
  - path: youcoded/desktop/src/shared/permission-types.ts
    contains: "StoredProject"
  - path: youcoded/desktop/src/renderer/components/PermissionsSection.tsx
    contains: "NOT A CONTROL"
  - path: youcoded/desktop/src/renderer/components/permissions/describe-rule.ts
    contains: "describeRule"
  - path: youcoded/desktop/src/shared/types.ts
    contains: "PERMISSIONS_REMOVE_PROJECT"
  - test: youcoded/desktop/tests/permission-store.test.ts
  - test: youcoded/desktop/tests/native-session-host.test.ts
  - test: youcoded/desktop/tests/permissions-section.test.tsx
  - test: youcoded/desktop/tests/describe-rule.test.ts
  - test: youcoded/desktop/tests/ipc-channels.test.ts
---
# Remembered "Always allow" rules + the management screen (M5 2a)

Native sessions persist Always-allow grants to `~/.youcoded/permissions.json`; Settings →
Permissions lists and revokes them. Split out of `native-runtime.md` (the host + the
two-tier engine), which is at its word cap. Parity: `ipc-bridge.md`.

## Revocation must reach live sessions, not just disk
**Invariant:** `NativeSessionHost.revokeRule` / `revokeProject` are the ONLY revocation
entry points. `PermissionStore.remove` / `removeProject` are disk-only and must never be
called from an IPC handler or a WS case — the naming difference is deliberate, so
"fixing the inconsistency" reintroduces the bug.
**Why:** `buildDecide` unions the on-disk rules with the per-session in-memory
`rememberedFor` map on EVERY decision (it exists so a failed disk write can't un-stick a
grant), so a disk-only delete leaves a running session granting exactly what the user
just revoked — the failure this feature exists to prevent.
**Guard:** `native-session-host.test.ts` → the `revokeRule / revokeProject` describe.

## Key by project SLUG, never by cwd
**Invariant:** removal takes a slug. Live sessions are matched with
`cwdToProjectSlug(entry.cwd) === slug`, never path equality.
**Why:** `cwdToProjectSlug` collapses `:`, `\`, `/` **and spaces** all to `-`, and only
the slug was ever persisted, so the original path is unrecoverable and two
differently-spelled cwds (`/home/d/my project`, `/home/d/my-project`) genuinely share one
disk entry — both must clear. `cwd` and `grantedAt` are provenance the engine never
reads, absent on every pre-UI rule; the UI shows no path/date rather than inventing one.
Corollary: `ctx.cwd` is never canonicalized.
**Guard:** `permission-store.test.ts` → "lists and removes a legacy entry with no cwd";
`native-session-host.test.ts` → "clears sessions whose cwd differs in spelling but shares
the slug".

## `remember()` spreads the existing entry
**Invariant:** `remember()` writes `{ ...existingEntry, cwd, rules }`, never `{ rules }`.
Rule identity everywhere — dedupe, disk removal, in-memory filter — is the
`(tool, pattern, action)` triple, never whole-object equality.
**Why:** rebuilding as `{ rules }` silently dropped the recorded `cwd` on the SECOND
write to a project. Whole-object equality breaks because a rule read back off disk
carries `grantedAt` and the in-memory copy does not. Dedupe deliberately ignores
`grantedAt` so re-approving doesn't look like a fresh grant.
**Guard:** `permission-store.test.ts` → "preserves the recorded cwd across a later
remember", "does not refresh grantedAt".

## `false` means nothing matched — say so
**Invariant:** `remove`/`revoke` returning `false` means the caller's list was stale. The
renderer KEEPS the row and tells the user it couldn't be found.
**Why:** reporting success against a list that lied teaches the user to trust it. Applies
to the per-rule AND per-folder controls, and to the remote WS route (`false` is also the
honest answer when the native runtime isn't wired).
**Guard:** `permissions-section.test.tsx` → "keeps the row when the backend reports
nothing matched", "keeps the folder when the bulk removal reports nothing matched".

## The screen's mode block is reference content, not a control
**Invariant:** the three mode definitions render as prose — zero focusable elements.
**Why:** mode is per-conversation state owned by `NativeSessionHost` and set from the
status-bar chip; there is no app-wide default for this screen to write. Three selector
shapes were tried and each read as a live setting — a control that sets nothing is a lie
in the shape of a control.
**Guard:** `permissions-section.test.tsx` → "contains no interactive element at all".

## Surfaces
`permissions:list` / `:remove` / `:remove-project` ride FIVE surfaces (ipc-handlers,
preload, remote-shim, remote-server WS case, SessionService.kt not-implemented). The
screen is deliberately NOT gated on `native.supported` — `remote-shim` hardcodes it
`false`, which would kill the one transport where revoking from a phone happens.
**Guard:** `ipc-channels.test.ts` → "permissions:* channel parity".

Depth: `docs/active/specs/2026-08-11-native-permissions-management-ui.md`.
