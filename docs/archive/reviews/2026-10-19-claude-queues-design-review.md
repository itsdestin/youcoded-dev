# Claude queue design review — round 1

status: shipped

Historical design-review findings; requirements were implemented and verified before app PR #657 merged. See `docs/archive/investigations/2026-10-19-claude-queue-timing/FINAL.md` for the final verdict.

Fresh read-only reviewer: Vega / b018ee40-8b22-48e6-afa3-15c8e90aa1de. No queue production code has been implemented. All findings below are accepted as requirements for revising the technical plan, not completed fixes.

| ID | Disposition | Required refinement |
|---|---|---|
| C1 | accepted; evidence corrected | Actual worker-only long Unicode failed echo; fresh exact composer verification later succeeded. File/mention batch delivery remains unproven/failed in the tested cases. See GENERAL-INPUT-REPORT.md; Q5 scope decision pending. Do not misreport aggregate exit1 as failure of the successful Unicode subcase. |
| C2 | accepted | Cancellable worker transaction carries attempt/incarnation/deadline; revoke bypasses normal write queue and is checked before each body write/final Enter. Native admission guard and explicit quarantine prevent expired/partial attempts becoming a fresh automatic retry. |
| C3 | accepted | Durable enqueue, claim, native acceptance and transcript confirmation are separate states. Single-flight receipt correlation must be explicit; preserve send-ID dedup tombstones after removal. Missing evidence never proves non-delivery. |
| I1 | accepted | One scheduler handles batch boundaries AND authoritative idle readiness; text-only/final replies and Send now cannot starve waiting messages. |
| I2 | accepted | Stable queue identity plus conversation aliases and live incarnation; Clear journals pause/settle/execute/remap/stay-paused. Accepted/uncertain items keep original delivery association. |
| I3 | accepted | Serialize short state/store transitions, not the entire delivery wait. Cancellation/receipts must not wait behind the operation they need to settle. |
| I4 | accepted | Edit is idempotent checkout plus draft-revision/session-checked transfer acknowledgement; retain a recoverable host copy until the draft accepts it. Preserve attachments and newer drafts. |
| I5 | accepted | Entire attachment/body/Enter operation is host-owned and non-interleaving, with positive input-safety checks. Persist original text separately from wire/display content and retain/validate attachment availability. |

The UI remains the existing native queue strip. The user explicitly rejected a new Claude-specific layout. No reviewer finding requires changing that direction. Plan round2 must incorporate the above before the backend service/transport is built; source11 foundation integration and isolated dependency/test repair are independent preparatory work.
