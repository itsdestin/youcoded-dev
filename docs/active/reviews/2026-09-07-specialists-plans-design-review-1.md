---
date: 2026-09-07
status: active
type: review
topic: specialists plans backend design — adversarial review round 1
reviewed: docs/active/design/2026-09-07-specialists-plans-backend-design.md
---

# Specialists plans backend — design review 1

## Verdict

Eight concrete findings. Seven are accepted directly. Finding 8's durability problem is accepted, but its proposed eighth request channel is rejected because the signed implementation handoff explicitly names seven channels. Hydration will instead project journal state through the existing attach/replay lifecycle and `plans:event` push.

## Findings and disposition

1. **Critical — the generic estimate did not prove a hard ceiling across retries, interrupts, compaction, images, and usage-silent providers. Accepted.** Plan children will use a budget mode with no SDK/harness retry, no compaction or auxiliary model calls, conservative pre-send reservation, bounded output, and full-reservation charging on unknown/error/interrupted usage. Unsupported payloads fail before transmission.
2. **Critical — a crash after effects but before completion could replay work. Accepted.** Attempts gain durable phases. Recovery first rebuilds a terminal result from the child transcript; ambiguous transmitted requests or side effects pause and never auto-replay. Only a proven pre-transmission attempt may launch automatically.
3. **Critical — `{pid,instanceId}` alone was not an execution fence. Accepted.** Lease acquisition becomes atomic CAS with epoch/fencing token and heartbeat/death checks; every launch and commit verifies the fence.
4. **High — Add budget did not enlarge the paused attempt's executable allowance. Accepted.** Added tokens become a persisted authorization tranche assigned to the paused attempt, including the fresh resume prompt.
5. **High — concurrent children could each observe the same remaining balance. Accepted.** A wave reserves all allowances atomically before any launch and accounts against `spent + reserved` plus the local shared context pool.
6. **High — proposal price/model could drift before approval. Accepted.** Proposal creation freezes an execution manifest (binding, pricing snapshot, specialist/permission fingerprints); drift invalidates the proposal and requires a new one.
7. **High — the common schema admitted invalid per-kind shapes and differed from the probed schema. Accepted.** Use the exact probed discriminated recursive schema and validate its semantic cardinalities; do not rerun the already-completed probe.
8. **High — in-memory push buffering alone cannot hydrate a restart. Problem accepted; suggested new IPC request rejected.** On session attach, main reads the journal and emits current plan projections via `plans:event`; remote connect/replay reads journal-backed projections rather than relying on its memory buffer. This keeps the promised seven request channels exactly.
