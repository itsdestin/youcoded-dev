---
date: 2026-09-01
status: active
type: investigation
topic: Android ManagedSession bare-phrase screen scans can false-fire prompt cards
---

# Android bare-phrase screen scans false-fire prompt cards

**Symptom.** On Android, Claude's ordinary reply text can pop a phantom prompt card — the
paste-your-sign-in-code card, or the Continue / "Ready" card — when the reply merely contains
phrases like "press Enter to continue" or "paste the code".

**Cause (present in today's code).** The non-menu prompt heuristics in
`youcoded/app/src/main/kotlin/com/youcoded/app/runtime/ManagedSession.kt` (~:544–570)
match bare phrases against the whole lowercased screen:

- the browser-auth / paste-code card fires on
  (`"paste code"` | `"paste the code"` | `"browser"`) + (`"sign"` | `"code"` | `"authorize"`);
  <!-- claim: {"path": "youcoded/app/src/main/kotlin/com/youcoded/app/runtime/ManagedSession.kt", "contains": "\"paste code\" in lower \\|\\| \"paste the code\" in lower"} -->
- the Continue card fires on `"press enter to continue"`.

Same class as the fixed "trust" substring collision (2026-07-16 sweep). Not fixed then
because these gate the Android sign-in flow and need on-device verification.

**Fix shape.** Anchor on option shape / distinctive Ink chrome (the way the folder-trust
dialog was re-anchored in `5c5275c3`) rather than conversation-plausible phrases.

**History.** Added 2026-07-16. Re-checked 2026-09-01: both heuristics unchanged.
