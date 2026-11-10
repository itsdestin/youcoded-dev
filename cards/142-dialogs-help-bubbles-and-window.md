---
id: 142
title: Dialogs, help bubbles and window drag: three fixes
stage: planning
priority: P3
tags: user-interface, desktop, bug
branch: 142-dialogs-help-bubbles-and-window
created: 2026-10-15
summary: Closing some dialogs closes the menu too, help bubbles cover what they explain, and dragging a chat between windows shows nothing.
area: Chat
side: screens
platform: Desktop only
---
Progress
Done: Part (c), the chat drag between windows, shipped 2026-09-04 (youcoded#419; a labelled 'Move here' drop area now appears in the other window). The Development menu this card names was folded into Help & feedback on 2026-09-28 (commit 8b5540403, in v1.3.1); its Known issues row still closes the Help popup and opens a web page with no in-app message.
Next: (a) decide whether that closing-and-opening behaviour is still wanted, and (b) check the info hints on a live dev window to see whether they cover their rows.
Blocked: nothing recorded.

Chats

From the old roadmap (user-interface, status confirmed, seen on desktop, last checked 2026-09-04)
Dialogs, help bubbles and window drag (3 things). (a) Closing a dialog from the Development menu closes the menu behind it, and "Known issues" closes everything with nothing acknowledging it; (b) the (i) help bubbles cover the rows and buttons they describe; (c) while a session pill is dragged into a second window, nothing follows the cursor there until the drop.
