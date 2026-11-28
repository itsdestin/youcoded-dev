---
id: 4
title: Conversation names: four loose ends
stage: explore
priority: P3
tags: chat-data, session-drawer, desktop, needs-repro, bug
branch: 4-session-naming-four-loose-ends
roadmap: chat-data: Session naming: four loose ends.
created: 2026-10-15
summary: Names can't go back to automatic once typed by hand, all reset to "New Session" after a crash, and may briefly disagree.
area: Chat
side: both
platform: Desktop only
vision: chat.converse.tags
---
Progress
Done: The naming feature shipped 2026-09-09 (youcoded merge 9d445011), with three modes (Off, Basic, AI) and hand-typed names kept safe. The counter-undercount bug was fixed in c019d71d9. 2026-11-11 (chat-engine batch, app branch session/chat-engine-batch, not merged): (c) retested in a dev copy: names survive a window reload AND a forced crash for chats on YouCoded's own engine (auto-named, hand-named, named at creation). Claude Code chats not testable in the throwaway copy; code keeps names in the app's live session list, so the same is expected. (b) can no longer happen as described: /clear now starts a new history file, so the counter starts fresh.
Next: (a) is a permanent product choice: Destin to confirm and close. (c) one look at a Claude Code chat after a reload on a real build would close it. (d) still needs a fresh sighting; the terminal status line can show the old automatic name after a hand rename because the topic file is never updated. Card says Desktop only, but Android runs the same code.
Blocked: needs a live test of crash reload.

Chats

From the old roadmap (chat-data, status needs-verify, seen on desktop, last checked 2026-07-17)
Session naming: four loose ends. (a) A conversation renamed by hand cannot go back to automatic naming; Destin removed the reset button ("get rid of that button. it's dumb"), so the only way out is typing another name (spec: docs/archive/specs/2026-09-08-session-naming-design.md). (b) The reply counter may double-count after a `/clear` in a very long session; worst case an early extra AI review (report: docs/archive/reviews/2026-09-09-session-naming-code-review.md). (c) After the window crashes and reloads, every session comes back named "New Session". (d) A name once disagreed between the store and Claude Code's topic file (2026-07-26), then agreed again; needs a fresh sighting.
