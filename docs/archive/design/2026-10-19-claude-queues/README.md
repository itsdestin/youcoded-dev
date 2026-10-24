# Claude message queues — approved decisions

status: shipped

Work item #169 was completed in [app PR #657](https://github.com/itsdestin/youcoded/pull/657). The direct-control foundation from the earlier #11 session was deliberately integrated; its original worktree was preserved. The completed #169 worktree has since been removed. [Final implementation and verification](../../investigations/2026-10-19-claude-queue-timing/FINAL.md) records the delivered behavior, evidence locations and limits.

## Approved behavior

Original submissions remain unchanged in `claude-queues.questions.answers.json` and `claude-queues.input-scope.answers.json`.

- **Q1 — Batch delivery:** deliver at a supported action-batch boundary, not only after the entire reply. The native PostToolBatch/composer capability was subsequently proven and implemented.
- **Q2 — Stop current work:** use native Escape; submitted waiting messages remain eligible. Background notices are not queued user intent.
- **Q3 — Restore paused:** persist waiting messages and attachment metadata; restore paused after restart. Potentially delivered messages are not silently replayed.
- **Q4 — Clear retains intent:** pause dispatch and keep waiting messages for deliberate continuation in the cleared context.
- **Q5 — Explicit file reading:** replace queued file mentions with ordinary paths and instructions to read the entire file. Text/image probes exercised real Read results. This is not automatic preloading or a guarantee of arbitrary model obedience.
- **Reuse:** use the existing native queue strip, composer and controls, not a second Claude queue interface.
- **Later recovery refinement:** direct Dismiss without a confirmation popup; retire the old attempt and restore new conversation/queue operation without resending dismissed intent or automatically flushing older paused messages. See [final queue-fix decisions](queue-fixes/README.md).
- **Later visibility refinement:** idle-ready sends do not flash a queue row; genuinely waiting or unconfirmed messages remain visible.

## Capability evidence

The archived timing reports establish why the implementation uses an owned native-composer transaction under a bounded PostToolBatch fence: direct plugin submit waited for idle/new turn, whereas the native composer path could deliver into the running turn. Early ASCII/Unicode/file limitations and later successful follow-up probes are chronological evidence, not unresolved current blockers. Actual final-app burst, recovery and verification results are in the final result record.

## Implementation references

- `youcoded/desktop/src/main/claude-queue-runtime.ts`: lifecycle, deliberate actions and immediate-send projection.
- `youcoded/desktop/src/main/claude-queue-transport.ts`: delivery ownership, evidence and dismissal.
- `youcoded/desktop/src/main/claude-queue-plugin.ts`: native boundaries, admission and receipts.
- `youcoded/desktop/src/renderer/components/QueuedMessagesStrip.tsx`: reused queue surface.
- `youcoded/docs/cc-dependencies.md`: supported CLI coupling and upstream watch points.

Broader direct-control follow-ups remain under #11/#12; unrelated native queue defects retain their own #62 scope. #169 is not a claim that every earlier audit finding or every platform has been completed.
