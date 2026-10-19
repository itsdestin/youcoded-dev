---
id: 85
title: Buddy window: three open items
stage: planning
priority: P3
tags: other-features, buddy, buddy-window, desktop, bug
branch: 85-buddy-window-3-open-items
roadmap: other-features: Buddy window: 3 open items.
created: 2026-10-15
summary: Typing in the buddy can accidentally confirm a menu choice, its Allow button may not work for questions, and it never idles on its own.
area: Chat
side: both
platform: Desktop only
vision: yours.look.buddy
work: session/85-windows-131-regressions, session/85-buddy-floater-regression
---
Progress
Done: Sizing/toggle subtask shipped via https://github.com/itsdestin/youcoded/pull/648 (bbcadbe9054fde689c1a2fceeb3cdd9cc481f071). Required Linux desktop/Android PR checks passed; explicit full Linux/Windows/macOS CI39272273978 passed on the exact published head, whose tree matches the merge. Local full verification20,612passed/47skipped; fresh related verification2,261passed/36skipped; independent review clean. Native Linux/Windows/macOS measurements and three red→green manager regressions verify the scoped correction.
Next: This sizing/toggle session is closing; shipped investigation: docs/archive/investigations/2026-10-19-buddy-native-sizing.md. The three original unrelated buddy requests remain open and unchanged; do not close the entire card for PR648. A new installer/release and replacing the running DirectControls test build are separate actions.
Blocked: No blocker for the shipped sizing/toggle subtask. Native fixture runs are not exhaustive fullrenderer/pointer/mixedDPI/multimonitor/arm64Mac certification; liveKWin fullgroup and unattendedMac picker timeout were not certified.

Chats
- 2026-10-19 session/85-buddy-floater-regression: chat started
- 2026-10-19 session/85-buddy-floater-regression: chat started
- 2026-10-19 session/85-buddy-floater-regression: chat started
- 2026-10-18 session/85-windows-131-regressions: chat started
- 2026-10-18 session/85-windows-131-regressions: Windows buddy and send failures fixed and VM-verified; watcher blocking probes replaced; local app commit 6df630783.
- 2026-10-18 session/85-windows-131-regressions: chat started

From the old roadmap (other-features › buddy, status confirmed, seen on desktop, last checked 2026-09-01)
Buddy window: 3 open items. (a) Typing in the buddy window while Claude Code shows a permission, question or plan menu sends it straight into the menu and confirms the highlighted option; the main chat refuses and offers "Send anyway" (report: docs/active/investigations/2026-09-01-buddy-chat-input-bar-pty-gate.md). (b) The buddy's Allow button for multiple-choice questions may do nothing, as it did for plans; questions are unchecked. (c) The buddy never does anything of his own between reactions: wanted are small spontaneous moments (a glance, a stretch, dozing off after a few quiet minutes, waking when anything happens), always quieter than the "a session needs you" animation and stopping the instant a session turns red, amber or blue. The asleep pose is built and signed off; nothing drives it yet.
