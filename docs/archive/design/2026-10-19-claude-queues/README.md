# Claude message queues — behavior planning

status: shipped

Historical planning record. Implemented in app PR #657; later direct-dismiss decisions supersede the initial recovery proposal. Final result: `docs/archive/investigations/2026-10-19-claude-queue-timing/FINAL.md`. Statements below describe their original planning checkpoint.

Work item #169; session/169-claude-message-queues. User wants real Claude queues on par with native sessions. This worktree is a fresh master-based planning workspace; the uncommitted mods integration stays in session/11-claude-direct-controls and has NOT been silently copied or integrated.

## Source-checked references

- `youcoded/desktop/src/renderer/components/QueuedMessagesStrip.tsx`: docked waiting-message strip, Edit/Cancel/Interrupt and send now; entries enter history when actually delivered, not at enqueue.
- `youcoded/desktop/src/renderer/components/InputBar.tsx`: shared composer; disconnected submissions remain drafts; native sends have host acknowledgement and queue outcomes. Attachment-preserving editing intersects existing #62, not a duplicate standalone fix here.
- `youcoded/desktop/src/renderer/components/ContextPopup.tsx`: current Compact/Clear entry points.
- `youcoded/desktop/src/main/harness/native-session-host.ts`: host-owned queue, removal, send-now priority plus interrupt, in-memory lifetime, subsequent user messages still drain after Stop.
- `youcoded/desktop/src/main/harness/harness-session.ts`: native busy messages can enter after the entire current tool batch, before replanning. Do not incorrectly describe native queuing as always waiting for a complete answer.

## Approved behavior decisions

Submitted `claude-queues.questions.answers.json` at 2026-10-19T06:48:31Z:

- Q-1 `batch`: deliver after the current batch of actions, not only after the entire reply. Target behavior remains conditional on a real CLI capability check; do not silently substitute end-of-turn queuing.
- Q-2 `current-only`: Stop interrupts current work; already queued user messages remain eligible to run. Background notices are not interchangeable with queued user intent. Claude Stop remains native Escape.
- Q-3 `restore-paused`: persist waiting messages and attachments, restoring them paused after restart; do not replay uncertain deliveries.
- Q-4 `keep-paused`: Clear pauses dispatch and retains waiting messages for deliberate review/continue in the new context.

The user subsequently authorized a testable implementation and explicitly required reusing the native queue UI rather than designing a second surface. Q5 Other (submitted 2026-10-19T14:30:20Z) proposes replacing file mentions with ordinary paths plus a read-the-file instruction, not accepting idle-only attachment timing. Controlled instruction-path probes now pass for text and an image: instruction arrives in the same turn, and genuine Read results carry the content afterward. This is tool-based reading, not guaranteed automatic preloading or proof of arbitrary model compliance. Backend implementation is proceeding against the existing strip and the approved four behaviors. Source: deck key `169-claude-queues-questions`, steps Q-1 through Q-4.

## Capability evidence so far

`docs/archive/investigations/2026-10-19-claude-queue-timing/REPORT.md` and its independently rerun checker show: direct plugin submit waits for idle/new turn; native PTY enqueue while busy is absorbed after the tool batch within the same turn. Native persistence uses a genuine human `queued_command` attachment that the existing watcher already projects into a user message. The user did not require a literal `type:user` JSONL row, so that storage detail is not itself a product blocker.

However, handing a message to Claude early would weaken the app's ability to edit/remove it while it waits. A bounded follow-up probe therefore tests holding a PostToolBatch boundary, sending the retained head through PTY, observing native acceptance, then releasing the boundary. This is an unproven feasibility experiment, not an approved implementation or a reason to claim parity yet. Hook context and fabricated history are not substitutes for real user-message delivery.

## Scope boundaries

- Retain established user choice: Claude Stop uses Escape, not the unsafe mods abort.
- Do not silently replay messages whose delivery is uncertain.
- The user deferred the previous audit's offline-action classification and mixed-transport ordering findings rather than asking for patches now. They remain relevant design constraints for a queue, not completed fixes.
- Existing #11 integration follow-ups and #62 native queue defects retain their own scope; #169 coordinates with them.
- New component dependencies were provisioned with 19 missing/outdated packages. This does not block the words-only deck; no dependency install, code edit, app launch or model call was needed for this planning turn.
