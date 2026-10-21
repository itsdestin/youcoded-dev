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
Done: (e) fixed on branch session/fix-anthropic-many-image-brick (youcoded 112686021): a failed reply's card now offers Try again (re-runs without a new message) and the right fix per error kind. Same branch also fixed conversations that could never send again after a provider error (oversized/too many pictures, unanswered tool calls), per-provider output caps (Anthropic up to 128k, OpenRouter 32k), cut-off replies recovering in-turn, and sorted provider errors with smarter retries.
Next: Faults (a)–(d), (f)–(h) remain.
Blocked: nothing recorded.

Chats
- 2026-10-21 session/fix-anthropic-many-image-brick: Stuck conversations after provider errors, cut-off replies, the new error card

From the old roadmap (native-harness › sessions, status confirmed, seen on desktop, last checked 2026-08-10)
Native chat: small faults and polish — 8 things. (a) The ChatGPT card in Assistant settings has no refresh; after a plan upgrade the new models only appeared after signing out and back in. (b) The main-chat thinking bubble flickers on and off during a very slow stream (seen at ~6 tokens/s on OpenRouter; needs a slow provider to reproduce). (c) Editing a queued message that had files attached puts the raw file paths in the box and drops the attachments; the docked queue strip also vanishes on reload (report: docs/active/investigations/2026-09-01-queued-message-attachments-lost-on-edit.md). (d) Editing a queued message silently replaces text already in the box; decided: show Replace or Append only when the box is not empty. (e) A failed reply's red card says to send again but has no Try again button, and Stop is gone too; needs a decision (try again means re-sending). (f) Moving a conversation to another device mid-summary does not wait for it, and the cut-off summary reads "interrupted" as if you pressed Stop. (g) The exact request sent to the model each step is never kept, so a resumed session cannot reproduce a turn; checkpoints hold only a fingerprint. (h) Pasting a path like `/README.md` or `/My Files/notes.md` is still eaten as a slash command and the text vanishes (deprioritized by Destin 2026-08-10).
