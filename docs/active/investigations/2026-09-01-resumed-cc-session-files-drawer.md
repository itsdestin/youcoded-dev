---
date: 2026-09-01
status: active
type: investigation
topic: A resumed Claude Code conversation's files list is keyed by a desktop session id that changes on every resume
---

# Resumed Claude Code conversation: files from before the resume are missing from its files list

**Symptom (current shape).** Resume a Claude Code conversation and open its files list: nothing
from before the resume is there; only files the new turns touch appear. Native (app-agent)
conversations are unaffected.

**Earlier shape, now gone.** When filed on 2026-08-15 the same defect showed as the opposite:
every resume re-recorded all of the conversation's files (~1,000 versions, ~300 KB per resume
of a long chat) because the transcript tailer replayed the file from byte 0 under the new id.
That replay was removed on 2026-08-27 (`8c641296` — the tailer starts at EOF on resume; history
comes from the page reader), so the re-recording stopped. The identity problem underneath it
did not.

**Mechanism (verified against master 2026-09-01).**
- `youcoded/desktop/src/main/session-manager.ts` gives every Claude Code session a fresh
  `randomUUID()` even when it is a `--resume` (native sessions reuse `resumeSessionId`).
<!-- claim: {"path": "youcoded/desktop/src/main/session-manager.ts", "contains": "const id = randomUUID\\(\\);"} -->
- Every version in the sidecar is stamped with that desktop id, and `LIST_SESSION`
  (`youcoded/desktop/src/main/ipc-handlers.ts`) returns only records with a version whose
  `sessionId` equals the id asked for; `SessionDrawer.tsx` `lastModifiedInSession` filters the
  same way.
- The only feed into the artifact tracker is the live `transcriptEvent` stream (`App.tsx`,
  `artifactTracker.handle(event)`); paged history does not pass through it. So with no replay,
  nothing is recorded under the new id until a new turn writes a file.

**Not reproduced in a dev instance** — the diagnosis is from the code; the old entry predicted
exactly this outcome for any fix that removed the replay without adding a second identity.

**Design shape.** Record a conversation-stable id on each version (the Claude Code session id,
which main already holds in `sessionIdMap`; native = same as the desktop id), dedupe on
`(conversationId, toolUseId)`, and let `LIST_SESSION` plus the drawer helpers match either id
(the renderer does not know the CC id, so `LIST_SESSION` resolves it, or returns an
"effective session ids" set). Decide what `/clear` (rotates the CC id) and resume-from-summary
mean for the list.

**History.** Filed 2026-08-15 (adversarial review of PR #318). Reshaped 2026-09-01 after
`8c641296`.
