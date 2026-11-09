---
status: active
work_item: 148
---
# Approved safe-boundary delivery implementation

## Approved policy

Helper reports and background shell completions enter model history at the next safe completed-response/tool-batch boundary, without interrupting an active provider stream or splitting tool-call/result groups. Idle completions promptly wake the parent. Stop holds automatic delivery; before the next already-queued or new human-directed dispatch, splice held results as app-generated context without a separate synthetic turn. Synthetic context never grants user authorization. Preserve compaction/budgeting, single-owner delivery, dedupe and restart recovery. Fix final-drain wake/hint loss and provably pre-injection marker loss, not ambiguous post-injection failures. No live app, paid calls, dependency installs, commits or merges.

## Plan (test-driven; skill files unavailable)

- [x] Pin approved boundaries red in real-host/scripted-provider tests; remove opt-in characterization switch while preserving historical baseline report/logs. Cover busy/FIFO, tool-batch history pairing, shell/helper coexistence, Stop during drain, idle wake, lost wake/hint, dedupe/restart and bounded retry.
- [x] Add a narrow session safe-boundary callback to splice context between complete tool batches and the next request, never reenter send. Keep normal host response-boundary ownership and FIFO dispatch serialized.
- [x] Drain both pending lanes fairly; check Stop/quiesce/liveness after awaits; version queue hints and recheck final-drain arrivals without infinite retries. Bound transient failures per pass.
- [x] Format before stamping; release markers only where absence of injection is positively established. Preserve ambiguous post-injection dedupe and verify restart controls.
- [x] Focused tests, useful-work followup if practical, then workspace verify --base HEAD; inspect diff, update progress and fix evidence document. Parent performs independent review and owns canonical current-state.

## Implementation / verification progress

Implemented the narrow driver callback at completed responses (including the first empty-response retry), complete tool batches and completed superseded batches. Both lanes splice before human dispatch; idle wake remains serialized by the host. Shell batches are claimed before their await, enabling nested history-only delivery of other results while a notice turn owns the outer drain; current items cannot consume themselves. Arrival versions protect stale-null claims and final return boundaries. Persistent storage failures get one attempt per boundary, retain their hint and do not schedule a self-sustaining retry. Stop after any awaited marker/claim parks remaining results.

Formatting precedes marker persistence. Live correlated injection receipts protect compound marker/confirmation failures. Resume reconciles successfully read durable transcript identity before clearing an uninjected marker or confirming an already injected report; live foreign leases remain protected. Resumed child runs now update the ledger's parent tool-call identity rather than inheriting the prior run's ID.

Baseline-to-desired red: `/tmp/148-safe-boundary-red.log` (6 failed, 4 passed before production edits). Additional red pins cover active collector mode, storage-failure hint retention, compound-write dedupe, nested shell/human dispatch and first-empty response. Final three repeats: 19/19 each; collector/scorer 30/30. Final `verify.sh --base HEAD`: 143 files passed, 1 skipped; 3831 tests passed, 36 skipped; all gates passed. Full results and exact commands: `docs/active/investigations/148-safe-boundary-delivery-fix.md`.

No line-budget increase or broad extraction: superseded multi-paragraph delivery comments were replaced with concise current invariants/WHY comments in the edited functions. Existing report-budget and compaction machinery remains in place. Independent parent review remains pending; implementation is not committed or merged.

## Evidence constraints

Baseline: docs/active/investigations/148-native-delivery-offline-reproduction.md and /tmp/148-delivery-repeat-{1,2,3}.log. Controlled fault injection is not live incident attribution. Report exact commands/counts; do not convert mock text/request-start into useful-work success.
