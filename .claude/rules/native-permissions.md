---
paths:
  - "youcoded/desktop/src/main/harness/permission-store.ts"
  - "youcoded/desktop/src/main/harness/native-session-host.ts"
  - "youcoded/desktop/src/shared/permission-types.ts"
  - "youcoded/desktop/src/renderer/components/PermissionsSection.tsx"
  - "youcoded/desktop/src/renderer/components/permissions/**"
last_verified: 2026-08-13
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
  - path: youcoded/desktop/src/shared/permission-types.ts
    contains: "specialist\\?: string"
  - path: youcoded/desktop/src/shared/permission-types.ts
    contains: "match\\?: 'exact' \\| 'glob'"
  - path: youcoded/desktop/src/shared/permission-types.ts
    contains: "export function sameRule"
  - path: youcoded/desktop/src/main/harness/permission-store.ts
    contains: "sameRule(r, rule)"
  - path: youcoded/desktop/src/shared/subject-glob.ts
    contains: "BOUNDED_RUNG_VETO"
  - path: youcoded/desktop/src/shared/bash-grant-shapes.ts
    contains: "HOSTILE_CORPUS"
  - test: youcoded/desktop/tests/bash-grant-shapes.test.ts
  - test: youcoded/desktop/tests/subject-glob.test.ts
  - test: youcoded/desktop/tests/permission-store.test.ts
  - test: youcoded/desktop/tests/native-session-host.test.ts
  - test: youcoded/desktop/tests/permissions-section.test.tsx
  - test: youcoded/desktop/tests/describe-rule.test.ts
  - test: youcoded/desktop/tests/ipc-channels.test.ts
---
# Remembered "Always allow" rules + the management screen (M5 2a)

Always-allow grants persist to `~/.youcoded/permissions.json`; Settings → Permissions lists
and revokes them. Parity: `ipc-bridge.md`.

## Revocation must reach live sessions, not just disk
**Invariant:** `NativeSessionHost.revokeRule` / `revokeProject` are the ONLY revocation
entry points. `PermissionStore.remove` / `removeProject` are disk-only — never call from
an IPC handler or WS case.
**Why:** `buildDecide` unions disk rules with per-session `rememberedFor` on EVERY decision,
so a disk-only delete leaves a session granting what was just revoked.
**Guard:** `native-session-host.test.ts` → the `revokeRule / revokeProject` describe.

## Key by project SLUG, never by cwd; `remember()` spreads the existing entry
**Invariant:** removal takes a slug — live sessions match via `cwdToProjectSlug(entry.cwd)
=== slug`, never path equality. `remember()` writes `{ ...existingEntry, cwd, rules }`,
never `{ rules }`.
**Why:** the slug collapses `:`, `\`, `/` **and spaces** to `-`, so two differently-spelled
cwds share one disk entry and both must clear. Rebuilding as `{ rules }` dropped the
recorded `cwd` on the SECOND write; dedupe ignores `grantedAt` so re-approving isn't new.
**Guard:** `permission-store.test.ts` → "lists and removes a legacy entry with no cwd",
"preserves the recorded cwd", "does not refresh grantedAt"; `native-session-host.test.ts` → "clears
sessions whose cwd differs in spelling but shares the slug".

## Rule identity is the QUINT `(tool, pattern, action, match, specialist)`; store is v2
**Invariant:** every comparison site — store dedupe/`remove()`, host `revokeRule`/
`rememberRule`, renderer `ruleKey`/`toPermissionRule` — routes through the exported
`sameRule()` helper (`shared/permission-types.ts`), normalizing an absent `match` to
`'exact'` first so a disk row compares equal to the same rule via `PermissionStore`.
`match` (`'exact' | 'glob'`, M5 2c) tells an exact command/path from a scoped wildcard
grant; `specialist` (Task 11) is the agentType a rule is scoped to, absent for the root
session's own grant. Both are independent axes; differing in EITHER is a different grant.
`permissions.json` stays `v: 1 | 2`; every write stamps v2.
**Why:** without `specialist`, a specialist-keyed grant can leak consent into a same-tuple
root grant. Without `match`, an exact and a wide grant sharing one pattern make Settings
revoke the wrong one.
**Guard:** `permission-store.test.ts` (specialist/match dedupe cases),
`native-session-host.test.ts` ("revokes only the matching QUAD from a live session").

## `false` means nothing matched — say so
**Invariant:** `remove`/`revoke` returning `false` means the caller's list was stale — the
renderer KEEPS the row and says it couldn't be found.
**Why:** reporting success against a stale list teaches the user to trust it.
**Guard:** `permissions-section.test.tsx` → "keeps the row when the backend reports nothing
matched", "keeps the folder when the bulk removal reports nothing matched".

## The screen's mode block is reference content, not a control
**Invariant:** the three mode definitions render as prose — zero focusable elements.
**Why:** mode is per-conversation state set from the status-bar chip; a control here would
set nothing, a lie in the shape of a control.
**Guard:** `permissions-section.test.tsx` → "contains no interactive element at all".

## Surfaces
`permissions:list` / `:remove` / `:remove-project` ride FIVE surfaces (ipc-handlers,
preload, remote-shim, remote-server WS, SessionService.kt not-implemented). NOT gated on
`native.supported`: `remote-shim` hardcodes `false`, killing revoke from a phone.
**Guard:** `ipc-channels.test.ts` → "permissions:* channel parity".

## What a rule covers, and what may be offered (M5 2c)
**Invariant:** `ruleMatches` (`shared/subject-glob.ts`) is the only decision-path matcher.
Two narrowings hit wildcard Bash GRANTS only: never cross a shell operator, never admit
`BOUNDED_RUNG_VETO` with text after the wildcard. `bashGrantOptions` offers an option only
if it covers the command in hand and, if wide, admits nothing in `HOSTILE_CORPUS`.
**Why:** a deny-list narrowing must NOT apply (`* rm *` must still catch `cd x && rm -rf y`).
**Guard:** `subject-glob.test.ts`, `bash-grant-shapes.test.ts`.

Depth: `docs/archive/specs/2026-08-11-native-permissions-management-ui.md`
and `docs/archive/specs/2026-08-13-bash-always-allow-rule-shape.md`.
