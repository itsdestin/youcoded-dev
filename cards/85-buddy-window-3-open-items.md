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
Done: Local/unshipped floater fixes: fixed-role native bounds stop XWayland fractional-scale chat growth; intent-based toggles and a cancelled/owned hide timer fix rapid reopen races. All three new manager regressions observed red→green (41 manager tests). Real final-source XWayland full group stable321.33×480 for20cycles;21.1ms reopen remained visible past old deadline. Native-Wayland chat-only stable320×480. Final full verify passed20,612tests47skips plus all gates; independent review found no actionable findings. Separate Office test assertion now awaits RPC signal.
Next: Needs decision on repairing Windows/macOS test guests before native cross-platform certification; current source remains local/uncommitted. The three original buddy items remain open and unchanged. Existing Direct Controls .4 binary/launcher and live app were not replaced.
Blocked: Windows guest stayed in updates without interactive desktop; macOS booted Recovery/noSSH. Zero native cycles executed on either. Both disposable guests stopped; no baseline/live-app edits. LiveKWin full-group integration and mixedDPI transitions are not runtime-certified.

Chats
- 2026-10-19 session/85-buddy-floater-regression: chat started
- 2026-10-19 session/85-buddy-floater-regression: chat started
- 2026-10-18 session/85-windows-131-regressions: chat started
- 2026-10-18 session/85-windows-131-regressions: Windows buddy and send failures fixed and VM-verified; watcher blocking probes replaced; local app commit 6df630783.
- 2026-10-18 session/85-windows-131-regressions: chat started

From the old roadmap (other-features › buddy, status confirmed, seen on desktop, last checked 2026-09-01)
Buddy window: 3 open items. (a) Typing in the buddy window while Claude Code shows a permission, question or plan menu sends it straight into the menu and confirms the highlighted option; the main chat refuses and offers "Send anyway" (report: docs/active/investigations/2026-09-01-buddy-chat-input-bar-pty-gate.md). (b) The buddy's Allow button for multiple-choice questions may do nothing, as it did for plans; questions are unchecked. (c) The buddy never does anything of his own between reactions: wanted are small spontaneous moments (a glance, a stretch, dozing off after a few quiet minutes, waking when anything happens), always quieter than the "a session needs you" animation and stopping the instant a session turns red, amber or blue. The asleep pose is built and signed off; nothing drives it yet.
