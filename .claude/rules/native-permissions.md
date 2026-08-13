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
  - path: youcoded/desktop/src/main/harness/permission-store.ts
    contains: "r.specialist === rule.specialist"
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

Always-allow grants persist to `~/.youcoded/permissions.json`; Settings → Permissions
lists and revokes them. Parity: `ipc-bridge.md`.

## Revocation must reach live sessions, not just disk
**Invariant:** `NativeSessionHost.revokeRule` / `revokeProject` are the ONLY revocation
entry points. `PermissionStore.remove` / `removeProject` are disk-only — never call them
from an IPC handler or a WS case.
**Why:** `buildDecide` unions disk rules with the per-session `rememberedFor` map on EVERY
decision, so a disk-only delete leaves a running session granting exactly what was just revoked.
**Guard:** `native-session-host.test.ts` → the `revokeRule / revokeProject` describe.

## Key by project SLUG, never by cwd; `remember()` spreads the existing entry
**Invariant:** removal takes a slug — live sessions match via `cwdToProjectSlug(entry.cwd)
=== slug`, never path equality. `remember()` writes `{ ...existingEntry, cwd, rules }`,
never `{ rules }`.
**Why:** the slug collapses `:`, `\`, `/` **and spaces** to `-` and is all that was ever
persisted, so two differently-spelled cwds share one disk entry and both must clear.
Rebuilding as `{ rules }` dropped the recorded `cwd` on the SECOND write; dedupe ignores
`grantedAt` so re-approving isn't a new grant.
**Guard:** `permission-store.test.ts` → "lists and removes a legacy entry with no cwd",
"preserves the recorded cwd", "does not refresh grantedAt"; `native-session-host.test.ts`
→ "clears sessions whose cwd differs in spelling but shares the slug".

## Rule identity is the quad `(tool, pattern, action, specialist)`; store is v2
**Invariant:** every comparison site — dedupe, `remove()`, `rememberedFor`, `ruleKey` —
compares all four fields inline (no shared `sameRule` helper). `specialist` (plan 1b Task
11) is the agentType a rule is scoped to; absent means the root session's own grant.
`permissions.json` carries `v: 1 | 2`; a v1 file is valid v2 as-is (no `specialist` key),
and every write stamps `v: 2` — no migration, no downgrade.
**Why:** a specialist-keyed grant can share `(tool, pattern, action)` with the root
session's own grant — without the fourth axis, approving one leaks consent across a
boundary the user never agreed to cross.
**Guard:** `permission-store.test.ts` → the specialist-scoped dedupe/remove cases and the
v1-round-trip/every-write-stamps-v2 cases.

## `false` means nothing matched — say so
**Invariant:** `remove`/`revoke` returning `false` means the caller's list was stale — the
renderer KEEPS the row and says it couldn't be found.
**Why:** reporting success against a list that lied teaches the user to trust it.
**Guard:** `permissions-section.test.tsx` → the "keeps the row/folder when the backend
reports nothing matched" cases.

## The screen's mode block is reference content, not a control
**Invariant:** the three mode definitions render as prose — zero focusable elements.
**Why:** mode is per-conversation state set from the status-bar chip; a control here would
set nothing, and that is a lie in the shape of a control.
**Guard:** `permissions-section.test.tsx` → "contains no interactive element at all".

## Surfaces
`permissions:list` / `:remove` / `:remove-project` ride FIVE surfaces (ipc-handlers,
preload, remote-shim, remote-server WS case, SessionService.kt not-implemented). NOT gated
on `native.supported`: `remote-shim` hardcodes it `false`, killing revoking from a phone.
**Guard:** `ipc-channels.test.ts` → "permissions:* channel parity".

## What a rule covers, and what may be offered (M5 2c)
**Invariant:** `ruleMatches` (`shared/subject-glob.ts`) is the only decision-path matcher.
Two narrowings hit wildcard Bash GRANTS only: never cross a shell operator, never admit a
`BOUNDED_RUNG_VETO` flag when the pattern has text after its wildcard. `bashGrantOptions`
offers an option only if it covers the command in hand and, if wide, admits nothing in
`HOSTILE_CORPUS`.
**Why:** on the deny-list a narrowing must NOT apply (`* rm *` must still catch
`cd x && rm -rf y`).
**Guard:** `subject-glob.test.ts`, `bash-grant-shapes.test.ts`.

Depth: `docs/archive/specs/2026-08-11-native-permissions-management-ui.md`
and `docs/archive/specs/2026-08-13-bash-always-allow-rule-shape.md`.
