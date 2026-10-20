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
Done: Sizing/toggle session shipped and closed: app PR648 https://github.com/itsdestin/youcoded/pull/648 (bbcadbe9054fde689c1a2fceeb3cdd9cc481f071); workspace PR278 https://github.com/itsdestin/youcoded-dev/pull/278 (cc3ac6b19406add1ca3f68d342fbc8c2ac11020a). Required app Linux/Android and full three-platform CI passed. Merged app full verification:20,612passed/47skipped. Workspace content CI39278995092 passed; final empty CI-refresh commit has identical checked tree. Scoped native Linux/Windows/macOS placement/toggle tests passed; measured evidence and approved VM readiness repairs are archived/preserved.
Next: This session is complete. Original three unrelated buddy requests remain open and unchanged; do not close the entire card. Shipped record: docs/archive/investigations/2026-10-19-buddy-native-sizing.md. New release/installer and replacing either running app are separate actions.
Blocked: No blocker for the shipped sizing/toggle correction. Native fixture coverage is narrower than fullrenderer/pointer/mixedDPI/multimonitor/arm64Mac acceptance; liveKWin fullgroup and unattendedMac picker timeout remain uncertified.

Chats
- 2026-10-19 session/85-buddy-floater-regression: chat started
- 2026-10-19 session/85-buddy-floater-regression: chat started
- 2026-10-19 session/85-buddy-floater-regression: chat started
- 2026-10-18 session/85-windows-131-regressions: chat started
- 2026-10-18 session/85-windows-131-regressions: Windows buddy and send failures fixed and VM-verified; watcher blocking probes replaced; local app commit 6df630783.
- 2026-10-18 session/85-windows-131-regressions: chat started

From the old roadmap (other-features › buddy, status confirmed, seen on desktop, last checked 2026-09-01)
Buddy window: 3 open items. (a) Typing in the buddy window while Claude Code shows a permission, question or plan menu sends it straight into the menu and confirms the highlighted option; the main chat refuses and offers "Send anyway" (report: docs/active/investigations/2026-09-01-buddy-chat-input-bar-pty-gate.md). (b) The buddy's Allow button for multiple-choice questions may do nothing, as it did for plans; questions are unchecked. (c) The buddy never does anything of his own between reactions: wanted are small spontaneous moments (a glance, a stretch, dozing off after a few quiet minutes, waking when anything happens), always quieter than the "a session needs you" animation and stopping the instant a session turns red, amber or blue. The asleep pose is built and signed off; nothing drives it yet.
