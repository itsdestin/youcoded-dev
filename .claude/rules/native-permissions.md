---
paths:
  - "youcoded/desktop/src/main/harness/permission-store.ts"
  - "youcoded/desktop/src/main/harness/native-session-host.ts"
  - "youcoded/desktop/src/shared/permission-types.ts"
  - "youcoded/desktop/src/renderer/components/PermissionsSection.tsx"
  - "youcoded/desktop/src/renderer/components/permissions/**"
last_verified: 2026-08-16
verify:
  - path: youcoded/desktop/src/main/harness/permission-store.ts
    contains: "removeProject"
  - path: youcoded/desktop/src/main/harness/native-session-host.ts
    contains: "revokeRule"
  - path: youcoded/desktop/src/main/harness/native-session-host.ts
    contains: "nativeStoreSlug"
  - path: youcoded/desktop/src/shared/permission-types.ts
    contains: "StoredProject"
  - path: youcoded/desktop/src/renderer/components/PermissionsSection.tsx
    contains: "NOT A CONTROL"
  - path: youcoded/desktop/src/renderer/components/permissions/describe-rule.ts
    contains: "describeRule"
  - path: youcoded/desktop/src/shared/types.ts
    contains: "PERMISSIONS_REMOVE_PROJECT"
  - path: youcoded/desktop/src/shared/permission-types.ts
    contains: "specialist[?]: string"
  - path: youcoded/desktop/src/shared/permission-types.ts
    contains: "match[?]: 'exact' [|] 'glob'"
  - path: youcoded/desktop/src/shared/permission-types.ts
    contains: "export function sameRule"
  - path: youcoded/desktop/src/main/harness/permission-store.ts
    contains: "sameRule[(]r, rule[)]"
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

Grants persist to `~/.youcoded/permissions.json`; Settings → Permissions lists and revokes
them. Parity: `ipc-bridge.md`.

## Revocation must reach live sessions, not just disk
**Invariant:** `NativeSessionHost.revokeRule` / `revokeProject` are the ONLY revocation
entry points. `PermissionStore.remove` / `removeProject` are disk-only — never call from
an IPC handler or WS case.
**Why:** `buildDecide` unions disk with per-session `rememberedFor` on EVERY decision, so a
disk-only delete leaves a session granting what was just revoked.
**Guard:** `native-session-host.test.ts` → `revokeRule / revokeProject` describe.

## Key by project SLUG, never by cwd; `remember()` spreads the existing entry
**Invariant:** removal takes a slug — live sessions match via `nativeStoreSlug(entry.cwd)
=== slug`, never path equality. `remember()` writes `{ ...existingEntry, cwd, rules }`,
never `{ rules }`.
**Why:** the slug collapses `:`, `\`, `/` **and spaces** to `-`, so differently-spelled cwds
share one entry and both must clear. `{ rules }` dropped the recorded `cwd` on the SECOND
write; dedupe ignores `grantedAt` so re-approving isn't new.
**Guard:** `permission-store.test.ts` → "legacy entry with no cwd", "preserves the recorded
cwd", "does not refresh grantedAt"; `native-session-host.test.ts` → "differs in spelling but
shares the slug".

## Rule identity is the QUINT `(tool, pattern, action, match, specialist)`; store is v2
**Invariant:** every comparison site — store dedupe/`remove()`, host `revokeRule`/
`rememberRule`, renderer `ruleKey`/`toPermissionRule` — routes through the exported
`sameRule()` (`shared/permission-types.ts`), which normalizes an absent `match` to `'exact'`.
`match` (`'exact' | 'glob'`, M5 2c) tells an exact command from a scoped wildcard;
`specialist` (Task 11) is the agentType a rule is scoped to, absent for the root session.
Differing in EITHER axis is a different grant. `permissions.json` is `v: 1 | 2`; every
write stamps v2.
**Why:** without `specialist`, a specialist grant leaks into a same-tuple root grant; without
`match`, an exact and a wide grant on one pattern make Settings revoke the wrong one.
**Guard:** `permission-store.test.ts` (specialist/match dedupe cases),
`native-session-host.test.ts` ("revokes only the matching QUAD from a live session").

## `false` means nothing matched — say so
**Invariant:** `remove`/`revoke` returning `false` means the caller's list was stale — the
renderer KEEPS the row, saying so.
**Why:** claiming success against a stale list teaches the user to trust it.
**Guard:** `permissions-section.test.tsx` → the two "reports nothing matched" cases.

## The screen's mode block is reference content, not a control
**Invariant:** the three mode definitions render as prose — zero focusable elements.
**Why:** mode is per-conversation state set from the status-bar chip; a control here would
set nothing.
**Guard:** `permissions-section.test.tsx` → "contains no interactive element at all".

## One shared bucket for "every project" grants (D2)
**Invariant:** `CROSS_PROJECT_SLUG` (`shared/permission-types.ts`) is the only non-project key
in `permissions.json`; `isCrossProjectRule` (Task + `^charter:file:`) alone routes into it.
`rulesFor(cwd)` always unions it; `revokeRule`/`revokeProject` on it clear EVERY live session.
**Why:** a user's own specialist grant must fire in every project; the key holds a space,
which `nativeStoreSlug` never emits.
**Guard:** `permission-store.test.ts`, `native-session-host.test.ts` (cross-project cases).

## Surfaces
`permissions:list` / `:remove` / `:remove-project` ride FIVE surfaces (ipc-handlers,
preload, remote-shim, remote-server WS, SessionService.kt). NOT gated on `native.supported`
(`remote-shim` hardcodes `false`, which would kill revoke from a phone).
**Guard:** `ipc-channels.test.ts` → "permissions:* channel parity".

## What a rule covers, and what may be offered (M5 2c)
**Invariant:** `ruleMatches` (`shared/subject-glob.ts`) is the only decision-path matcher.
Two narrowings hit wildcard Bash GRANTS only: never cross a shell operator, never admit
`BOUNDED_RUNG_VETO` with text after the wildcard. `bashGrantOptions` offers only options
that cover the command in hand and, if wide, admit nothing in `HOSTILE_CORPUS`.
**Why:** a deny-list narrowing must NOT apply (`* rm *` must still catch `cd x && rm -rf y`).
**Guard:** `subject-glob.test.ts`, `bash-grant-shapes.test.ts`.

Depth: `docs/archive/specs/2026-08-11-native-permissions-management-ui.md`,
`docs/archive/specs/2026-08-13-bash-always-allow-rule-shape.md`.
