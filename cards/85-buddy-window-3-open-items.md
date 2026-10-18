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
work: session/85-windows-131-regressions
---
Progress
Done: App commit 6df630783: buddy painted-body hits, Windows terminal input/initial-size fixes, async bounded watcher probes. Full desktop verify: 20,402 passed; real Windows click/drag, normal send, popup retry and watcher events passed.
Next: Review the single local app branch session/85-windows-131-regressions. Nothing merged or released; other card items are unchanged.
Blocked: Authenticated OneDrive hydration is not reproduced; valid signing does not guarantee SmartScreen reputation.

Chats
- 2026-10-18 session/85-windows-131-regressions: Windows buddy and send failures fixed and VM-verified; watcher blocking probes replaced; local app commit 6df630783.
- 2026-10-18 session/85-windows-131-regressions: chat started

From the old roadmap (other-features › buddy, status confirmed, seen on desktop, last checked 2026-09-01)
Buddy window: 3 open items. (a) Typing in the buddy window while Claude Code shows a permission, question or plan menu sends it straight into the menu and confirms the highlighted option; the main chat refuses and offers "Send anyway" (report: docs/active/investigations/2026-09-01-buddy-chat-input-bar-pty-gate.md). (b) The buddy's Allow button for multiple-choice questions may do nothing, as it did for plans; questions are unchecked. (c) The buddy never does anything of his own between reactions: wanted are small spontaneous moments (a glance, a stretch, dozing off after a few quiet minutes, waking when anything happens), always quieter than the "a session needs you" animation and stopping the instant a session turns red, amber or blue. The asleep pose is built and signed off; nothing drives it yet.
