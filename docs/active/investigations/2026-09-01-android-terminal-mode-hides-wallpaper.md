---
date: 2026-09-01
status: active
type: investigation
topic: Android terminal mode hides the wallpaper for a native terminal that no longer exists
---

# Android terminal mode hides the wallpaper to reveal a native terminal that no longer exists

**History:** added 2026-08-12 (found while investigating desktop resize repaint). Re-checked
2026-09-01 — the rule is still in place, unchanged.

## Mechanism

`youcoded/desktop/src/renderer/styles/globals.css` carries a rule that, on Android in
terminal view mode, hides both the wallpaper layer and the pattern layer. Its own comment
says why: "so the native TerminalView (rendered below the transparent WebView in
ChatScreen.kt) shows through."
<!-- claim: {"path": "youcoded/desktop/src/renderer/styles/globals.css", "contains": "html\\[data-platform=\"android\"\\]\\[data-view-mode=\"terminal\"\\] #theme-bg"} -->

That native TerminalView is gone. `youcoded/app/src/main/kotlin/com/youcoded/app/ui/ChatScreen.kt`
lines 12–15 document removing the TerminalView Compose block, `applyTerminalColors`, and the
BaseTerminalViewClient / TerminalSession imports; xterm.js inside the WebView has been the
only Android terminal renderer since Tier 2.

So the rule now hides the wallpaper to reveal whatever Compose paints behind the transparent
WebView: a hardcoded `Color(0xFF111111)` (`ChatScreen.kt:30`; `WebViewHost.kt:44` sets the
WebView itself to `Color.TRANSPARENT`). Since `html { background-color: var(--canvas) }`
landed (`globals.css:402`, the resize-paint-race fix), the exposed area is the theme canvas
rather than `#111111` — less jarring — but the wallpaper is still being hidden for no
remaining reason.

## Fix shape

Split the selector rather than delete the rule: the same rule's other half —
`body[data-mode="buddy-mascot"] #theme-bg, body[data-mode="buddy-chat"] #theme-bg` — is
still correct and load-bearing for buddy-window transparency. Wants an `assembleDebug`
eyeball on a light theme in terminal mode to confirm the symptom before changing anything.
