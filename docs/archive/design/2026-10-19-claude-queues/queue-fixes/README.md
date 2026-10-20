# Queue fixes — final decisions

status: shipped

Merged in [app PR #657](https://github.com/itsdestin/youcoded/pull/657). [Final implementation and verification](../../../investigations/2026-10-19-claude-queue-timing/FINAL.md) is the result record. This directory also retains an earlier review proposal; it is not the specification for current dismissal behavior.

## Authoritative user decision

After submitting the deck, Destin explicitly requested direct dismissal without a danger confirmation, allowing the conversation to continue and ensuring the queue works afterward. This overrides the confirmation and permanently blocked composer shown in the historical deck. No approval or implementation work remains pending for these changes.

| Original review number | Final disposition |
|---|---|
| 1 | Implemented: immediate idle-ready sends retain internal delivery tracking without a transient Sending row. Genuine waiting/unknown messages remain visible; no visibility timer. |
| 2 | Implemented with the later simplification: direct **Dismiss**, alongside Check Delivery. No popup and no automatic resend. |
| 2a | Superseded: the proposed danger confirmation was removed at the user's request. |
| 2b | Superseded: the permanent blocked-composer replacement was removed. Dismissal retires the old authority and permits fresh conversation and queue cycles. |

Dismiss revokes the exact worker token, invalidates native stage/admission authority, cleans only owned staging, and durably tombstones the discarded attempt. It preserves human drafts, does not alter existing transcript history, and does not automatically flush older paused messages. Late evidence cannot resurrect the dismissed item or revoke newer delivery. Dismissal abandons ambiguous intent; it does not claim the message was never delivered.

## Historical review material

- `queue-fixes.review.json`, its original submitted answers, and the referenced image crops are preserved unchanged as decision evidence. Their confirmation/blocked-state images are explicitly superseded by the table above.
- The original real-renderer references were the shared queue strip, Rename session dialog, and existing error/confirmation primitives. Only the shared strip and simple actions remain relevant to the shipped interaction.
- Preview servers have stopped. The old localhost URL, deleted worktree, scratch normalization command and removed confirmation/blocked screens are not reusable instructions.
- Full raw runs and contact sheets are retained in the private evidence archive described in the final result record, not in this published directory. The cropped images here document the reviewed proposal; they are not screenshots of the final direct-dismiss behavior.

## Verification boundary

The preliminary preview's combined verification had a page-menu Escape failure; a later whole-screen recheck passed. That preliminary failure was not retrospectively called a pass or diagnosed as fixed. Subsequent final implementation and integrated verification passed all required desktop gates; exact final counts, actual dismissal/restart/30-message acceptance, Android CI results and remaining platform limits are in the linked final result record.

Screenshot tooling now supplies the explicit workbench theme route so captured themes are not mislabeled. This change did not claim to repair general community-theme startup timing.
