---
date: 2026-09-01
status: active
type: investigation
topic: Editing a queued message that had attachments refills the composer with raw file paths and drops the attachments
---

# Queued-message edit loses attachments

**Symptom.** Queue a message with attached files while a turn is running, then click to edit it: the composer refills with the raw space-joined file paths as text and the files are not re-attached. Narrow but visibly wrong. Accepted-for-now limit from M1's queue work (PR #204).

## Mechanism (re-checked against master 2026-09-01)

The renderer stores a queued message as a single joined string — `queueId`, `content`, `timestamp` — with no separate attachment list, so the edit refill has nothing to re-attach and can only put the joined text back:
<!-- claim: {"path": "youcoded/desktop/src/renderer/state/chat-types.ts", "contains": "queuedMessages: Array<\\{ queueId: string; content: string; timestamp: number \\}>;"} -->

Related nicety in the same code: the docked strip is renderer-local by design, so an app reload loses the strip display while the host queue still drains correctly. Rehydrating the strip from the host queue on reload closes it.

## Fix shape

Store the display split (text + attachment list) in `queuedMessages` instead of the joined string; re-attach on edit.

## History

Added 2026-07-22. Re-verified 2026-09-01: the type is unchanged.
