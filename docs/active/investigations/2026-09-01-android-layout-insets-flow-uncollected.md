---
date: 2026-09-01
status: active
type: investigation
topic: Android SessionService emits layoutInsets on every React layout report, but nothing collects it — delete or wire up?
---

# Android `layoutInsets` flow is emitted into but never collected

**Symptom.** None visible to a user today — this is a decision for Destin, not a bug report.
Every layout report from React lands in a Kotlin flow that nobody reads.

## Mechanism

`youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:111-113` declares
`LayoutInsets(headerPx, bottomPx)`, a `MutableSharedFlow(replay = 1)` and its public
`layoutInsets`. The `ui:action` → `layout-update` branch (line 1631) emits into it on every
report from the WebView.
<!-- claim: {"path": "youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt", "contains": "_layoutInsets\\.tryEmit\\(LayoutInsets\\(headerPx, bottomPx\\)\\)"} -->

`rg layoutInsets app/src/main/kotlin` (2026-09-01) finds exactly three sites: the
declaration, the emit, and a comment in `youcoded/app/src/main/kotlin/com/youcoded/app/ui/ChatScreen.kt:14`
saying the "layoutInsets / screenMode plumbing they fed" was removed along with the native
Termux `TerminalView` Compose block. The consumer was deleted; the producer was left behind.
Same vestigial shape as the `viewModeRequest` flow, which was removed in youcoded#207
(`82552cee`, `a26d8284`).

## The decision
- **Delete as dead** — ~5 lines plus the now-empty `layout-update` branch. The `"ui:action"`
  case itself must survive: falling through to the unknown-message branch logs a warning and
  returns an error to the WebView on every layout report.
- **Keep and wire up** — if the planned Android soft-keyboard / inset work (see the packaged
  keyboard-fix verification item in `docs/roadmap/android-only.md`) wants a native reading of
  header/bottom chrome heights, this is exactly the plumbing it would start from.

## History
- added 2026-07-22 (old ROADMAP L663) during the dead-code sweep; never observed at runtime.
  Re-checked 2026-09-01: still declared, still emitted, still uncollected.
