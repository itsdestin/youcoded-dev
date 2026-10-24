# Claude queue design review — round 1

status: shipped

Historical design-review findings; requirements were implemented and verified before app PR #657 merged. See `docs/archive/investigations/2026-10-19-claude-queue-timing/FINAL.md` for the final verdict.

Original read-only reviewer: Vega / b018ee40-8b22-48e6-afa3-15c8e90aa1de. This review preceded production implementation. The requirements below were incorporated before merge; their dispositions now reflect closure, not pending assignments.

| ID | Disposition | Required refinement |
|---|---|---|
| C1 | Resolved | The early worker-only Unicode echo failure was not a general Unicode failure. Exact composer verification succeeded; the user chose explicit file-read instructions in Q5, and later text/image Read probes passed. See `../investigations/2026-10-19-claude-queue-timing/FILE-INSTRUCTION-AND-ADMISSION.md`. File preloading or arbitrary model obedience is not claimed. |
| C2 | Implemented and tested | Cancellable worker transaction carries attempt/incarnation/deadline; revoke bypasses normal write queue and is checked before each body write/final Enter. Native admission guard and explicit quarantine prevent expired/partial attempts becoming a fresh automatic retry. |
| C3 | Implemented and tested | Durable enqueue, claim, native acceptance and transcript confirmation are separate states. Single-flight receipt correlation must be explicit; preserve send-ID dedup tombstones after removal. Missing evidence never proves non-delivery. |
| I1 | Implemented and tested | One scheduler handles batch boundaries AND authoritative idle readiness; text-only/final replies and Send now cannot starve waiting messages. |
| I2 | Implemented and tested | Stable queue identity plus conversation aliases and live incarnation; Clear journals pause/settle/execute/remap/stay-paused. Accepted/uncertain items keep original delivery association. |
| I3 | Implemented and tested | Serialize short state/store transitions, not the entire delivery wait. Cancellation/receipts must not wait behind the operation they need to settle. |
| I4 | Implemented and tested | Edit is idempotent checkout plus draft-revision/session-checked transfer acknowledgement; retain a recoverable host copy until the draft accepts it. Preserve attachments and newer drafts. |
| I5 | Implemented and tested | Entire attachment/body/Enter operation is host-owned and non-interleaving, with positive input-safety checks. Persist original text separately from wire/display content and retain/validate attachment availability. |

The shipped UI reuses the existing native queue strip; the user rejected a separate Claude-specific layout. Foundation integration, dependency/test repair and backend implementation were completed. No additional design round or implementation task remains assigned by this review.
