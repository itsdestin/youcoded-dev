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
Done: Wrapped local floater fix and verification: XWayland growth removed by fixed-role native bounds; rapid reopen/stale-hide races corrected. Three regressions observed red→green; 41 manager tests pass. Final full desktop verify:20,612 passed/47 skipped; fresh related verify:2,261 passed/36 skipped; all gates and fresh review passed. Linux full-renderer XWayland/native-Wayland chat paths stable. Windows11 and macOS26.7.1 native manager checks each passed20cycles at exact role sizes, matching positions and rapid reopen; Windows verified Quickemu Session1, Mac also checked subsequent-close timing. Both test guests recovered nondestructively with backed-up minimal launch repairs; all owned guests/servers stopped, current evidence retained privately.
Next: Fix is ready for review in session/85-buddy-floater-regression, but app source remains local/uncommitted and no merge/release/installed-app replacement was authorized. Scoped verification and evidence: docs/active/investigations/2026-10-19-buddy-native-sizing.md. The three original unrelated buddy requests remain open; do not close this whole card for the sizing subtask.
Blocked: No remaining blocker for the investigated native sizing/toggle correction. Windows/macOS runs use native probe pages, not fullrenderer/pointer acceptance; mixedDPI/multimonitor/arm64Mac and liveKWin fullgroup are not certified. Mac installed boot after Enter is proven; unattended picker timeout is not.

Chats
- 2026-10-19 session/85-buddy-floater-regression: chat started
- 2026-10-19 session/85-buddy-floater-regression: chat started
- 2026-10-19 session/85-buddy-floater-regression: chat started
- 2026-10-18 session/85-windows-131-regressions: chat started
- 2026-10-18 session/85-windows-131-regressions: Windows buddy and send failures fixed and VM-verified; watcher blocking probes replaced; local app commit 6df630783.
- 2026-10-18 session/85-windows-131-regressions: chat started

From the old roadmap (other-features › buddy, status confirmed, seen on desktop, last checked 2026-09-01)
Buddy window: 3 open items. (a) Typing in the buddy window while Claude Code shows a permission, question or plan menu sends it straight into the menu and confirms the highlighted option; the main chat refuses and offers "Send anyway" (report: docs/active/investigations/2026-09-01-buddy-chat-input-bar-pty-gate.md). (b) The buddy's Allow button for multiple-choice questions may do nothing, as it did for plans; questions are unchecked. (c) The buddy never does anything of his own between reactions: wanted are small spontaneous moments (a glance, a stretch, dozing off after a few quiet minutes, waking when anything happens), always quieter than the "a session needs you" animation and stopping the instant a session turns red, amber or blue. The asleep pose is built and signed off; nothing drives it yet.
