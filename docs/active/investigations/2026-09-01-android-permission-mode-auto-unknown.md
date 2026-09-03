---
date: 2026-09-01
status: active
type: investigation
topic: Android permission-mode chip drops "auto" and guesses "normal"
---

# Android permission-mode chip drops `auto` and guesses `normal`

**Symptom.** On Android the status-bar permission-mode chip never shows `auto`, and shows
`normal` on any screen it cannot read — where desktop (since `d7e27c72`) shows `unknown`.

**Two defects, both present in today's code.**

1. **Renderer discards `auto`.** The Android-only `session:permission-mode` handler in
   `youcoded/desktop/src/renderer/App.tsx` (~:1550) validates against a local list
   `['normal','auto-accept','plan','bypass']` — no `'auto'` — and returns on anything else.
   The file's own `VALID_PERMISSION_MODES` (~:167) *does* include `'auto'`; the handler just
   doesn't use it. So Android correctly detects `"auto mode on"` and broadcasts it, and the
   renderer throws it away.
   <!-- claim: {"path": "youcoded/desktop/src/renderer/App.tsx", "contains": "const valid: PermissionMode\\[\\] = \\['normal', 'auto-accept', 'plan', 'bypass'\\]"} -->
2. **Android guesses `normal`.** `ManagedSession.detectPermissionMode`
   (`youcoded/app/src/main/kotlin/com/youcoded/app/runtime/ManagedSession.kt` ~:414–426)
   ends `else -> "normal"` — any screen with no mode indicator is declared `normal`, the
   silent default the desktop `unknown` work removed.

**Fix.** Have the handler validate against `VALID_PERMISSION_MODES`, and have Android emit
`"unknown"` in the fallthrough (the Kotlin file already has an `"unknown"` return at :56).
Fix both together so the two platforms agree.

**History.** Added 2026-07-17 (found during the rehydration fix). Re-checked 2026-09-01:
both lines unchanged (ManagedSession.kt commits since then touched prompts/dead code only).
