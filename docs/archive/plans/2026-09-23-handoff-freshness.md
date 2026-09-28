---
status: shipped
date: 2026-09-23
---
# Handoff freshness implementation plan

> Execution: use test-driven, bounded tasks with fresh code review between safety-critical stages. No commits, pushes or deployments are authorized.

**Goal:** Resume an explicitly handed-off conversation only after matching the previous writer's final messages, or after an explicit saved-copy choice that still passes ownership admission.

**Architecture:** Keep the existing lease service for ownership and Personal Git sync for transcript bytes. Forward a unique handoff nonce through the existing takeover message. After proven writer shutdown, publish a nonce-bound fingerprint receipt beside the synced conversation data. Main verifies the exact provider-local history consumed by startup; a renderer tab may show saved history and accept a draft before that startup exists.

**Tech stack:** TypeScript/Node main process, React shared renderer, existing Git transport, Cloudflare Worker takeover relay, Vitest and temporary filesystem/Git fixtures.

## Approved contract and constraints

- UI authority: `docs/archive/design/2026-09-23-handoff-freshness/inline-direction.md`; F-10/F-11/F-12 all approved 2026-09-23 10:20. Do not redesign the notices.
- Wait text: **Still syncing recent messages, this may take a moment.** Recovery text: **This conversation may have newer messages on your other computer.**
- Full-width floating chat notice; **Continue with these messages** immediately left of **Try again**. Draft survives retry; Send, Enter and form submission stay blocked until a real session is admitted. Never automatically send the draft.
- Ordinary offline opening is unchanged. Freshness applies only to explicit handoff. Older/unreachable peers yield incomplete confirmation, not false success.
- Closing a pending tab cancels its backend attempt and prevents late startup. It cannot undo a stop already requested on another computer.
- Final snapshot means writer stopped and appends drained, not a free lease, a stopped-looking renderer, two equal file sizes or a space-wide synced event.
- Preserve divergent copies. Do not change ordinary grow-only mirror policy or promise conflict merging.
- No live-app or user-data testing. Temporary two-root Git tests are allowed. Ask before any interactive/repeated-relaunch test rig. Worker deployment is a separate decision. Android-local handoff remains unsupported; desktop remote parity is required.

## Source evidence

The concrete gaps and current functions are documented in `docs/active/investigations/2026-09-23-handoff-message-freshness.md`, independently rechecked after visual approval. In particular `createResumeAdmission.open/handoff`, holder/requester factories in `conversations/takeover.ts`, service materialization, `SessionManager.destroySession`, `NativeSessionHost.destroy`, and `App.tsx`'s resume handler are existing integration points rather than replacements.

## Interfaces to preserve across stages

```ts
type TransferContext = {
  transferNonce: string;       // random UUID, stable across retries
  sessionId: string;
  provider: 'claude' | 'native';
  requesterDeviceId: string;  // per-install lease identity
  senderDeviceId: string;     // expected holder, never its display label
};
type HandoffReceipt = TransferContext & {
  v: 1;
  byteLength: number;
  sha256: string;
};
type FreshnessCheck =
  | { status: 'confirmed'; receipt: HandoffReceipt }
  | { status: 'incomplete'; reason: string };
```

No receipt-supplied filesystem path. At the sender, capture the actual writer's provider, mapped conversation ID and authoritative runtime transcript path before teardown (CC watcher/page source, or native host path). Cross-check against the store record and provider lane; a valid record alone does not identify the stopped writer's bytes. At the receiver, derive the intended runtime destination from validated local project/record resolution. Enforce containment on both sides. `reason` is internal diagnostic data, not guessed user-facing copy. Confirmation checks all context fields, not just the hash. Do not accept empty, oversized, invalid, unknown-version or conflict-copy receipts. SHA-256 describes bytes; it is not a new signature/authentication service.

## Task 1 — Receipt schema and correlated takeover relay

**Files:** create `youcoded/desktop/src/main/conversations/handoff-receipt.ts` and `desktop/tests/handoff-receipt.test.ts`; modify `desktop/src/main/{sync-hub-socket.ts,main.ts,conversations/lease-client.ts,sync-spaces/service.ts,ipc-handlers.ts}`, `wecoded-marketplace/worker/src/sync/room.ts`, and their existing socket/lease/room tests. Shared wire declarations belong with the existing request/event types.

**Produces:** `parseHandoffReceipt(value: unknown): HandoffReceipt | null`, `matchesHandoffReceipt(receipt: HandoffReceipt, expected: TransferContext): boolean`, and a bounded optional `transferNonce` on takeover requests/events. Keep lease identities per-install: requester comes from the validated lease frame's `deviceId`, and expected sender comes from the current stored lease holder, not separately supplied identity fields. The socket attachment's existing `deviceId` is a per-machine sync-recency identity (or empty), NOT the lease identity; never substitute it. Preserve the existing account-authenticated lease trust boundary rather than claiming new per-device authentication. Holder processing must match its own install identity to the expected sender; receiver processing must match its own install identity to the intended requester.

- [x] Write parser/matcher tests: accepted exact context; wrong version/provider/nonce/receiver/sender/session; unsafe IDs; malformed hash; fractional/negative/oversize length; extra keys cannot inject a path.
- [x] Add relay tests: valid nonce forwarded exactly; absent nonce keeps old protocol behavior; malformed or oversized nonce rejected; unrelated identity fields cannot override the validated lease-frame requester or stored holder. Cover two per-install IDs sharing a machine ID, and an absent machine ID. Socket `reqId` is not a transfer nonce.
- [x] Run targeted tests red, implement strict parsing and additive relay, run green. No receipt publication or fresh startup is enabled in this task.
- [x] Validate Worker with `npm test` and `npm run typecheck` from its isolated `worker/` folder; desktop with existing related tests. Do not deploy.

Example required matcher test:
```ts
expect(matchesHandoffReceipt(receipt, context)).toBe(true);
expect(matchesHandoffReceipt(receipt, { ...context, transferNonce: otherNonce })).toBe(false);
expect(matchesHandoffReceipt(receipt, { ...context, requesterDeviceId: otherDevice })).toBe(false);
```

## Task 2 — Exact transcript evidence and safe prefix import

**Files:** extend receipt module or create `conversations/handoff-transcript.ts`; modify `conversations/{transcript-mirror.ts,service.ts}` with narrow handoff-only methods; create focused filesystem tests.

**Consumes:** validated `TransferContext`, the stopped writer's captured authoritative transcript identity/path (Task 3), and contained mirror/receiver destinations consistent with the store record. **Produces:** bounded async fingerprinting, atomic stable receipt publication under `Personal/Handoffs/<provider>/<id>.json`, and typed exact-import/verification results. Keep receipts out of the ephemeral lease directory.

- [ ] Test a temporary source, mirror, receipt and runtime-local destination. Exact bytes confirm; same-size changed content does not; absent receipt or different nonce stays incomplete.
- [ ] Validate size against the existing Git transport cap before hashing/copying. Refuse unreadable, missing, symlink/escaped, oversized or changing sources.
- [ ] Snapshot source bytes only under the sender stop/pin supplied by Task 3, using the captured actual-writer path rather than reconstructing it from a stale synced record. Verify captured writer provider/ID, current mapping, record and mirror lane agree; remap, /clear rotation, unknown source, or disagreeing live writers prevents publication. Verify source and mirror fingerprints match before atomically publishing the receipt; a failed mirror cannot mint evidence. Tests include stale record/cwd, a watcher-supplied path different from a cwd guess, and identity rotation while stopping.
- [ ] Destination import accepts a missing file or a byte-prefix predecessor only. A shorter divergent destination is still divergent. Preserve equal-size/different, longer, rewritten and conflicting copies. Stage import to a temp file and recheck the live/pending guard and source/destination identity before commit.
- [ ] Serialize with the existing destination copy chain, not a disconnected mutex. Return confirmed only after hashing the actual runtime-local destination against the matching receipt. Late ordinary imports must respect the same pending-start pin.
- [ ] Tests verify bytes on disk remain unchanged for every refusal, not merely a returned error code. Generic mirroring behavior and its existing tests remain unchanged.

## Task 3 — Proven holder stop and pinned final snapshot

**Files:** `desktop/src/main/{session-manager.ts,pty-worker.js,ipc-handlers.ts}`, `conversations/{takeover.ts,service.ts,resume-admission.ts}`, existing holder/session-manager/native-host tests.

**Produces:** an awaitable PTY shutdown confirmation and a provider-specific snapshot barrier. Preserve existing ordinary destroy semantics for unrelated callers; add a handoff-specific stop path rather than globally changing exit timing.

- [ ] Write CC tests where a kill request and manager removal happen before PTY exit. No final receipt or authority release is allowed until the actual PTY exit acknowledgment. Worker error/disconnect/timeout is not success.
- [ ] Make the worker wait for its PTY exit before acknowledging handoff stop. Bound the wait; unknown stop retains unsafe protection and does not mint a receipt.
- [ ] Native tests require quiescence followed by successful `NativeSessionHost.destroy`/stream disposal and append-chain completion; quiescence alone is insufficient. `wire()` currently catches/logs store append failures and keeps `appendChain` resolved (`native-session-host.ts:3026–3034`), so awaiting that promise is not evidence that every message reached disk. Latch persistence failure per captured writer generation and refuse fresh evidence on any append/dispose failure; preserve ordinary chain progress. Test an earlier swallowed append failure followed by a successful destroy, not only a rejecting destroy.
- [ ] Capture each live writer's authoritative provider/ID/transcript path before teardown destroys watcher/host state. For CC use the watcher's remembered page source, respecting post-realpath paths and /clear remaps; for native use the host's actual transcript source. Refuse inconsistent mappings rather than hashing an alternate existing file. Pin the conversation against `noteSessionEnded` and ordinary materialization before interrupting. Retain the pin across asynchronous exit handlers, final local snapshot, mirror verification and receipt publication. Release it only when no sender-side snapshot read remains.
- [ ] Interrupt and stop every live writer for that conversation under existing `resumeAdmission.handoff`. Notify moved before renderer teardown as required by existing behavior. Then snapshot and publish. Release ownership only after proven writer stop; sync transport failure can leave the receipt unreceived but cannot be called fresh.
- [ ] A receipt for an already completed transfer is reusable only for its original context. A new request when there is no writer must not invent a fresh final snapshot from imported peer bytes.
- [ ] Test sender teardown, mirror failure, competing opens and asynchronous exit cleanup together. Review stop/pin ordering before integrating requester startup.

## Task 4 — Backend pending attempts, retry and final startup fence

**Files:** create `conversations/handoff-attempt.ts` with unit tests; integrate `conversations/{takeover.ts,resume-admission.ts,service.ts}` and `ipc-handlers.ts`.

**Produces:** backend-owned attempt IDs and transitions `waiting → incomplete → waiting`, or `confirmed/saved-copy → admitted`, with terminal `cancelled/failed`. Attempt ownership includes requesting window/remote connection and conversation. Nonce and expected sender are fixed for the attempt.

- [ ] Test cancellation before pull, during acquire, during import, immediately before startup, and during asynchronous native startup. A canceled attempt never leaves a writer or held lease behind. Cleanup only the resources owned by that attempt.
- [ ] Poll existing Personal sync and matching receipt with a bounded wait. Do not equate `syncNowAwaited` completion with target success. Capture expected sender from the actual lease identity, not its label, before requesting transfer; never swap expected sender on a later poll. A null takeover response may be a lost acknowledgment after delivery, not proof the old computer was never asked. Preserve the original nonce/context and accept only its later matching receipt. Retry polls the original transfer, even after sender stop; it does not send a fictitious second takeover.
- [ ] Keep admission coalescing explicit: a generic opener cannot coalesce into or bypass a waiting fresh attempt. Return the existing live writer only if doing so does not pretend a new transfer occurred.
- [ ] Under backend admission, acquire ownership and pin target materialization; import/verify exact runtime bytes and begin runtime startup while the fence remains held. Recheck cancellation around awaits. Missing project, held fork or path/provider mismatch remain incomplete or a specific existing startup error.
- [ ] Saved-copy continuation is an explicit choice on the attempt, not `confirmed`; still run admission and any existing separate force confirmation. It must not silently import late peer history after local startup.
- [ ] Tests cover receipt replacement by a competing nonce, legacy sender/Worker, failed/slow Git pull, offline ordinary resume unchanged, lease denial after freshness, duplicate opens and stale action tokens.

## Task 5 — Electron/remote API and pending renderer tab

**Files:** shared types, preload, `remote-shim.ts`, `remote-server.ts`, `ipc-handlers.ts`, `App.tsx`, a focused pending-resume renderer hook/module, existing `HandoffFreshnessInline`/`InputBar`, IPC and remote parity tests. Android bridge explicitly refuses unsupported local handoff operations.

**Consumes:** backend attempt controller. **Produces:** start/status/retry/saved-copy/cancel operation routes with owner validation, plus a pending read/draft tab that becomes the admitted session without losing its draft.

- [ ] Test that explicit handoff consent creates the pending tab before a writer exists; ordinary resume follows its existing path. Use provider-local saved preview data, never start a harness merely to populate the tab.
- [ ] Wire progress/status to approved floating notice. Send, Enter and form submit stay blocked while pending. Retry preserves tab, preview and draft.
- [ ] When backend startup succeeds, replace/rebind the pending tab to the real session atomically, transfer its draft, and remove the notice. Never automatically submit.
- [ ] Close synchronously invalidates the local pending generation and calls backend cancellation. Closing one window must not cancel an unrelated admitted writer. Remote disconnect cancels its pending attempts; status replay/requery does not reconstruct a new nonce.
- [ ] Exercise Electron and remote through the same backend owner. Preserve existing deny/retry/escalation and force-consent flow. Android-local path remains an honest unsupported result.
- [ ] Remove workbench-only freshness gating from production status decisions; retain fake fixtures only for visual review. Do not change approved layout/copy.

## Task 6 — Real temporary transfer test, review and verification

**Files:** add `desktop/tests/handoff-freshness-integration.test.ts` with isolated temporary bare Git remote and two independent Personal/provider-local roots; extend relevant integration tests and current investigation/plan status.

- [ ] Use the actual Git transport plus receipt and materialization code. Append a final source message, prove sender stop, publish, push/pull, import, admit and assert the destination runtime opens the exact final bytes.
- [ ] Cover stale receipt, same-size mutation, shorter divergence, larger local history, conflicting receipt, missing project, >50 MiB file, failed/slow push, canceled transfer and retry after sender stop. Assert preserved files and no competing startup.
- [ ] Use temporary HOME/user-data/Personal roots; no real credentials, live app, account or production Worker. These are deterministic integration tests, not claims of physical-device latency.
- [ ] Fresh review of receipt trust boundaries, shutdown evidence, cancellation and import/start race; fix findings and rerun tests.
- [ ] Run `bash scripts/verify.sh ./youcoded --base 436ec10e8`; Worker `npm test` and `npm run typecheck`; check Android build prerequisites before claiming platform verification.
- [ ] Update proven-stale conversation guidance on holder ordering and denial semantics, with pinning tests taking precedence over prose. Keep deployment and interactive multi-device rig authorization separate.

## Plan status

Technical direction is based on independent source inspection. Fresh plan review raised two Important findings, both corrected and re-reviewed as resolved: distinguish machine-recency socket identity from per-install lease identity; bind sender fingerprint to the stopped writer's captured authoritative transcript, not merely a valid store record. This is plan review, not implementation verification.

Task 1 complete, fresh spec/code review clean. Evidence: `scratch/lease-handoff/freshness-task-1-report.md` and task-only `.diff`; desktop verification passed, Worker 379 tests and typecheck passed. No receipt production or freshness-gated startup is enabled yet.

Task 2 complete, fresh spec/code re-review approved. Fixed the destination last-await race, bounded staging I/O, final guard rechecks and staged-file mutation window; regressions preserve destination bytes and clean temporary files. Conflict detection is pinned to actual Git `conflictCopyName`. Evidence: `scratch/lease-handoff/freshness-task-2-report.md` and task-only `.diff`; 90 focused tests and desktop verification passed.

Task 3 is split into 3a (awaitable proven PTY exit) and 3b (holder snapshot wiring, native drain/provenance and sender pin). Task 3a complete; fresh spec/code re-review approved after fixing the acknowledgment-ordering race with a bounded parent receipt handshake. `SessionManager.stopSessionForHandoff(id)` returns stopped/unknown based only on captured PTY exit, fences input, coalesces callers and bounds the wait. Evidence: `scratch/lease-handoff/freshness-task-3a-report.md` and task-only `.diff`; 64 focused tests and desktop verification passed.

Task 3b original Important findings fixed and re-reviewed as resolved: child append/disposal failures and deregistered-child drain ordering are tied to the captured parent generation; source cwd/provider folder and record project agree, allowing a legitimate realpath alias. Implementation includes authoritative writer capture, native persistence/stop evidence, pinned final source snapshot and actual holder receipt publication.

Scope decision 2026-09-23: Destin deferred helper-history verification and asked for a roadmap item. Filed in `docs/roadmap/sync.md` as `needs-verify`, with evidence/limits in the investigation's `helper-history-handoff-unverified` claim. Continue requester integration for parent-transcript evidence only; no helper-history bundle or helper-specific warning policy in this task. Native replay may include separate child histories/ledger, so do not describe v1 parent-byte matching as proof of all subsidiary files. This is an unverified cross-device issue, not a deferred failing test. Evidence: `scratch/lease-handoff/freshness-task-3b-report.md` and task-only `.diff`; targeted tests and final desktop verification passed. Current registered IPC integration still uses fake PTY/watcher and inactive store; a complete two-root transfer with real file/store and late-import fences remains required before final acceptance. Scoped line-budget changes are explicitly part of review. Task 4 complete after post-restart review and repairs: retry rediscovers an unsent transfer's sender, the response deadline bounds stalled sync/query while retaining protection until drain, and the shared exit gate holds lease and destination pin until both PTY proof and successful teardown in either event order. Fresh read-only re-review approved; 130 focused tests and desktop verifier passed (report addenda in `scratch/lease-handoff/freshness-task-4-report.md`; `/tmp/task4-proof-before-exit-verify.log`). Task 5a transport and explicit conditional-force extension are implemented and reviewed: sender-derived attempt ownership, disconnect cancellation, Android-local refusal, and a separate expected-holder atomic Worker force operation (older Workers fail closed; no deployment authorized). Task 5b renderer is implemented but review found terminal-failure recovery, new-window intent, pending title and drawer-preservation gaps; repairs are in progress. Task 6 has five passing real two-root bare-Git/file tests, but review correctly withheld acceptance: production captured-holder stop/publication, actual native resume, service-sweep pin wiring, and Git-generated conflict/delayed delivery need integration coverage. Reports: `scratch/lease-handoff/freshness-task-5a-report.md`, `freshness-task-5-force.md`, `freshness-task-5b-report.md`, and `freshness-task-6-report.md` in that same folder. Do not treat injected stop/start callbacks as runtime verification. Task 1's implementation follows the corrected identity rule. The approved UI and prior admission repair remain uncommitted. No production service or device has been exercised. Keep incomplete stages explicit rather than calling the handoff feature done after a schema-only or UI-only subset.

## Status — resumed session, 2026-09-23 evening

Implementation complete on `session/conversation-sync-investigation` (youcoded and wecoded-marketplace), committed and pushed; not merged. Fixed in this pass: a lost begin reply now re-adopts the same owner's attempt; the destroy handler fences the conversation id (not the desktop id) and treats a proven handoff stop as a clean close; a deliberate handoff stop reports exit 0; no duplicate tab while admission is in flight; the pending view has its own error boundary; its status bar hides the unknown model/permission chips; a refused forced takeover shows a message. The workbench's demo-only notice layer was removed; `session.handoff` is now faked in the mock shim, so `?lease=held:<device>` drives the real pending tab (waiting → incomplete → Try again/Continue → admitted, draft kept). Merged with origin/master. Checks: desktop verify `--full` green, Android 843/843, Worker 381/381 and typecheck.

Still unverified: two real computers, and forced takeover until the Worker's `force-acquire-if-holder` is deployed (merging the marketplace branch deploys it via CI). Helper-history remains the deferred `needs-verify` roadmap item.
