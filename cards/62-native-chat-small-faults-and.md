---
id: 62
title: Chat on YouCoded's own engine: eight small faults
stage: planning
priority: P3
tags: native-harness, sessions, desktop, needs-repro, bug
branch: 62-native-chat-small-faults-and
roadmap: native-harness: Native chat: small faults and polish — 8 things.
created: 2026-10-15
summary: Queued-message edits lose attachments, failed replies lack Try again, the thinking bubble flickers, and other small glitches.
area: Chat
side: both
platform: Desktop only
vision: chat.converse.native, chat.converse.queue
work: session/fix-anthropic-many-image-brick
---
Progress
Done: The 'Try again' button on a failed reply shipped on 2026-10-21 (app PR #670, dev PR #293), along with stuck-conversation fixes, per-provider length caps and recovery for cut-off replies. RETESTED 2026-11-10 in a dev copy (release-safety session): (c) queued-message editing is fixed for Claude Code chats only. On YouCoded's own engine it STILL FAILS, for every way of attaching (paperclip, drag, paste): pressing Edit on a queued message that has a file puts the raw file path plus the words in the box and the file chip is gone. The docked queue strip does survive a reload (passed). 2026-11-11 (chat-engine batch, app branch session/chat-engine-batch, not merged): fault (c) FIXED on YouCoded's own engine and confirmed in a dev copy (paperclip, paste, two files, files-only, words-only, phone view; re-send carries the file). Also fixed: a chat created with no name crashed the window, now shows New Session.
Next: DECIDED by Destin on the wave-2 deck 2026-11-12 (docs/active/design/2026-11-12-wave-2): the queued strip shows a file-name chip, not the full path; show him a review page before it lands. Other open faults (a)(b)(d)(f)(g)(h) unchanged.
Blocked: nothing recorded.

Chats
- 2026-10-21 session/fix-anthropic-many-image-brick: Stuck conversations after provider errors, cut-off replies, the new error card

From the old roadmap (native-harness › sessions, status confirmed, seen on desktop, last checked 2026-08-10)
Native chat: small faults and polish — 8 things. (a) The ChatGPT card in Assistant settings has no refresh; after a plan upgrade the new models only appeared after signing out and back in. (b) The main-chat thinking bubble flickers on and off during a very slow stream (seen at ~6 tokens/s on OpenRouter; needs a slow provider to reproduce). (c) Editing a queued message that had files attached puts the raw file paths in the box and drops the attachments; the docked queue strip also vanishes on reload (report: docs/active/investigations/2026-09-01-queued-message-attachments-lost-on-edit.md). (d) Editing a queued message silently replaces text already in the box; decided: show Replace or Append only when the box is not empty. (e) A failed reply's red card says to send again but has no Try again button, and Stop is gone too; needs a decision (try again means re-sending). (f) Moving a conversation to another device mid-summary does not wait for it, and the cut-off summary reads "interrupted" as if you pressed Stop. (g) The exact request sent to the model each step is never kept, so a resumed session cannot reproduce a turn; checkpoints hold only a fingerprint. (h) Pasting a path like `/README.md` or `/My Files/notes.md` is still eaten as a slash command and the text vanishes (deprioritized by Destin 2026-08-10).
