# Claude queues Implementation Plan

status: shipped

Implemented and merged in app PR #657 (`a00cb691604c4013d50f1b15f96011bb1d37a27c`) after explicit merge authorization. The steps below are the historical implementation plan, not outstanding work or runnable instructions. Original no-commit/no-publication constraints applied during planning and were superseded by explicit merge authorization. Probes and scratch paths refer to the preserved private evidence archive, not the current repository. Final behavior and verification: `docs/archive/investigations/2026-10-19-claude-queue-timing/FINAL.md`.

**Goal:** Reuse the existing native queue strip and its Edit/Remove/Interrupt-and-send-now controls for a durable, host-owned Claude queue, producing an isolated testable Linux build.

**Architecture:** Retain pending messages in a bounded host service, publish the existing `session:live` queue snapshot, and use provider-neutral queue operations from the existing UI. For busy Claude sessions, hand one head to the proven native composer path while an authenticated, main-thread PostToolBatch fence is held; acknowledge native acceptance before release. Preserve direct idle text/commands where safe, native Escape Stop, and file-authoritative history. Persist unsent items and restore paused; never silently replay a potentially delivered item.

**Tech Stack:** Existing Electron/headless TypeScript backend, React shared renderer, CLI hook modules, authenticated loopback bridge, existing PTY worker, Vitest and isolated scripted-API CLI tests.

## Final amendments to the original plan

- Direct Dismiss was added after real rapid-send failures: retire the old attempt and delivery authority without resending, restore conversation/new queue cycles, and retain older paused intent. No danger popup or permanently blocked-composer proposal shipped.
- A global paused flag does not prohibit new deliberate work after recovery: fresh intent receives persisted eligibility while older paused items stay paused; FIFO is preserved among eligible messages. Restart removes transient eligibility.
- Idle-ready sends remain internally tracked but are not projected as transient queue rows. Genuine waiting and unknown delivery remain visible.
- Unknown enqueue retries retain the original identity; separate active intentional sends do not share a send ID. Edit transfer is durable before host acknowledgement.
- Original-attempt native receipts plus exact original transcript UUIDs support restart reconciliation; missing proof is never inferred from equal historical text.
- Final integrated verification and platform limitations are in FINAL.md above; the original verification wish list below is not a claim that every proposed manual scenario ran.

## Original approved contract and constraints

- Sources: `docs/archive/design/2026-10-19-claude-queues/claude-queues.questions.answers.json` Q1=batch, Q2=current-only, Q3=restore-paused, Q4=keep-paused; user explicitly says reuse native UI and proceed to a testable state.
- No separate Claude queue UI. Reuse `QueuedMessagesStrip`, composer, existing context controls and notices. Paused state may need a truthful label/action text in the same component, not a new panel. Existing Send now can deliberately resume a paused queue; preserve selected-head priority.
- Stop uses one raw Escape and does not clear or pause submitted user messages. Clear pauses dispatch before its identity/context transition and retains waiting messages paused. Close/app exit saves waiting items; application restart restores paused.
- Preserve text, original attachment paths and prepared display content through enqueue/edit/remove/restore. Do not reproduce #62's path-as-text/attachment-loss problem for Claude; avoid unrelated native redesign.
- Native queue behavior remains unchanged. Generic operations delegate to its existing host implementation.
- Q5 Other replaces queued file mentions/attachments with explicit quoted file-read instructions. Preserve original text and attachment metadata; tool reading is not automatic preload and can require permission or hit file limits. Existing non-queue @/attachment delivery remains unchanged. No artificial transcript rows or system-context substitute; genuine human queued_command records remain valid user timeline evidence.
- All mutable queue operations and dispatch claims serialize per conversation. Reject/disclose obsolete edits once delivery is claimed. All screens receive the host snapshot; no renderer-only queue copy.
- Never dispatch an offline queued transport request after reconnect by accident. New request/response action channels are explicitly classified as user actions in the remote shim.
- Do not let direct commands overtake queue/PTY delivery. Commands are ordered at the same host boundary; Clear freezes queue claim before command dispatch.
- The bounded fence is NOT a permanent lock: turn/session/incarnation/token/deadline must match at claim and before submit. Expired, cancelled, replaced or disconnected fences cannot authorize late Enter. Release quickly with no pending message. Exclude `agent_id` subagent batches.
- Queue staging uses supported prompt.fill, exact readback and native admission with guarded worker Enter; legacy sends retain their existing echo/input gates. Neither path may write through a prompt/permission card or use a blind delayed CR. A timeout after possible handoff is uncertain, never an automatic resend.
- Keep durable waiting versus potentially delivered states distinct. A crash after a durable dispatch claim restores the item as uncertain/paused until transcript/receipt reconciliation; never treat it as a fresh waiting item.
- No production app attachment/state changes, SDK or paid calls. Test runtime via run-dev with private HOME/account bus and fake API; final user build is separate from both production and edited source.

## Task 0 — carry the existing direct-control foundation forward safely

**Files:** own session11 tracked app diff (except any fix already present in master); new `claude-control-{bridge,plugin,receipts}.ts`, shared/control types, renderer helpers and their tests. Preserve newer master changes in session169.

- Snapshot source SHA/dirty manifest; prove session169 app is clean before integration.
- Apply only this conversation's tested foundation. `git apply --check` currently fails only for `desktop/tests/bash-env.test.ts`; inspect and preserve master's equivalent newer test instead of overwriting it. All other tracked hunks must pass a dry check before applying. Copy only allowlisted own new source/test files, not generated output, private state or unrelated untracked files.
- Preserve source session11 unchanged. Do not commit or reset either checkout.
- Resolve dependencies independently: package-lock hashes in session11 and169 match. Replace session169's incomplete hardlink farm with an independent copied dependency tree or install into an independent directory; never patch shared inodes.
- Run types and the direct-control/renderer/session-channel regressions before queue code.

## Reviewed protocol refinements (round 1 accepted)

- **Input scope:** Q5 Other proposes explicit file-read instructions instead of native @ expansion. Controlled `worker-fence-instruction` cases now prove a quoted absolute file path prefixed with `Read this entire file:` reaches the same turn at the held batch, followed by genuine Read results (text and image). The scripted model chooses Read; do not claim arbitrary models are forced to obey. Preserve original user text/attachments as queue data; the actual delivered text may include these explicit instructions. Do not rewrite emails or arbitrary @ prose as file references; resolve real file mentions conservatively against the session cwd.
- **Stable durable identity:** each queue has its own UUID, current provider/conversation alias, known aliases and a separate live incarnation. Pending/uncertain attempts retain their original alias. Per-queue journal bounds and async atomic writes; alias mapping must be recoverable from records after an interrupted update. Restore before publishing queue snapshots. Duplicate active bindings refuse rather than create two writers.
- **Journal transitions:** waiting -> durable claim(attemptId, expected wire hash, live incarnation, alias) -> native accepted(receipt) -> transcript confirmed(uuid). Keep bounded dedup tombstones after removal. A claimed/accepted item without definitive matching evidence after restart is uncertain and paused, never fresh waiting work.
- **Concurrency:** serialize only short in-memory/durable transitions. Release the state lock while delivery waits, and recheck version/incarnation when applying its result. Cancellation and receipts bypass the normal send queue. Batch and authoritative idle readiness feed the same scheduler; Send now prioritizes one head, resumes a paused queue, and requests native Escape only if work is active.
- **Clear:** durably freeze dispatch first; revoke any active delivery without holding the state lock. If native revocation wins before admission, the attempt may be returned to waiting. If admission won, await successful next(e) acceptance or quarantine as uncertain. NEVER execute Clear while admission/handoff remains unresolved or composer quarantine remains active. Only after safe resolution run Clear, bind the observed replacement identity and retain waiting items paused. Failed/uncertain Clear remains paused; accepted/uncertain attempts keep their original association rather than migrating as unsent work.
- **Editing:** idempotent checkout reserves a waiting item against dispatch. Return original text/attachments and checkout ID. Refill only if the originating session and draft revision still match, then acknowledge transfer; until acknowledgement keep a recoverable host copy. On conflict/disconnect do not overwrite a new draft or destroy queued data. Native behavior remains delegated unless the existing generic data transfer can safely improve both.
- **Composer quarantine:** unresolved partial staging/admission blocks ALL subsequent automated body writes and Enter, including direct commands/Clear. Clear only the exact still-owned staged text after fresh comparison; never erase a changed user draft. Preserve original queue content and expose uncertainty through existing notice/queue state until reconciled or deliberately resolved.
- **Delivery transaction:** one attempt owns the entire body/attachments/Enter operation. Carry cancellation ID/incarnation/deadline into the worker; test revocation before every write and final Enter. Partial body or ambiguous submission becomes uncertain and must not auto-replay. Native admission observes matching composer input, turn/session identity and a still-valid attempt; exceptions in that armed admission path fail closed. Do not pretend a host timer alone proves the native fence remains held.
- **Long input:** existing echo-safe worker can suppress Enter on collapsed paste. A fresh exact supported composer read plus live input ownership is the demonstrated non-blind recovery; prompt.fill plus exact readback is another tested staging primitive for explicit file-instruction cases. Neither getter alone proves focus. Require empty/owned composer, positive input gate, revocable worker final-Enter transaction and native admission confirmation. No blind timeout CR.

## Task 1 — host-owned queue state and persistence

**Create:** `desktop/src/main/claude-queue.ts`, `claude-queue-store.ts`; `desktop/src/shared/conversation-queue-types.ts`; corresponding `tests/claude-queue*.test.ts`.

**State contract:** Each item carries stable `queueId`/`sendId`, exact text, attachments, display content, timestamp, and status `waiting | delivering | uncertain`. A queue carries conversation identity, session generation and `paused`. Persist only in the test/actual instance's own userData; injected storage root for tests. Use existing async atomic-write/locking primitives, bounds on item count/text/attachments, and strict data validation. A malformed store must not silently run anything.

**Operations:** enqueue returns accepted queue identity or an explicit refusal before delivery; remove returns the original full item only if still waiting; prioritize/resume selects a waiting head and lifts pause; pause-for-clear fences all new claims; bind/rebind reconnects live app session to durable conversation; record-admission distinguishes native CAS claim from successful next(e) acceptance; record-acceptance persists that receipt independently of a later transcript UUID; record-transcript confirms only an unambiguous attempt association. Missing/ambiguous association stays uncertain and never auto-replays. Edit uses checkout/ack/cancel, not remove-and-refill. Snapshot returns shared strip rows. Serialize state/store transitions; persistence failure leaves items recoverable and never sends an unrecorded claim.

- RED tests: FIFO; duplicate send-ID same/different payload; queue cap; edit/remove before and after claim; original attachments returned intact; one claim per boundary; paused queue never drains; restart restores paused; crash mid-claim restores uncertain; corrupt/failed storage; generation replacement; clear pause and identity rotation; close preserves unsent entries.
- GREEN minimal service and store, with injected delivery callbacks and publish function. Do not couple tests to Electron or model APIs.
- Tests show Stop does not erase/pause waiting user items and unrelated background tasks do not become queue entries.

## Task 2 — bounded native delivery adapter and hook fences

**Modify:** `claude-control-bridge.ts`, `claude-control-plugin.ts`, `session-manager.ts`, `pty-worker.js` as needed; add focused `claude-queue-transport.ts` instead of growing large manager files. Add tests alongside bridge/plugin/worker coverage.

**Protocol:** Use ONE supported hooks module per plugin. A later actual-CLI `admission-probe.mjs --single` proved same-module fence/poll/admission reentrancy and native `$.state` compare-and-set acceptance/revocation; two entries in hooks.json.modules are rejected by the CLI. Keep observer/fence functions logically separate, not separate entries in the manifest. Authenticate all endpoints using the existing per-session secret/Host/Origin/body guards. Carry main conversation/turn/incarnation and a unique fence ID/deadline. A fence reports arrival, holds only while there is eligible app-owned work, and releases after exact native prompt acceptance or bounded safe failure. Correlation uses the claimed item and actual observed prompt/queue UUID, not just 'some user message arrived'. Detect ambiguity, never overwrite another composer draft.

**Native admission transaction:** after durable host claim, arm a native lease `{attemptId, incarnation, conversationId, turnId, wireHash, expiresAt, state:'armed'}` in the plugin's own versioned `$.state`. Keep the fence's live `next.signal` locally. Require matching live fence/idle generation, positive input gate and empty/owned composer before staging. Supported `prompt.fill` plus exact fresh `prompt.read` stages plain instruction text without paste/echo ambiguity; preserve normal path for unowned user input. Worker writes only the guarded final Enter with attempt/deadline revocation checks. The native `prompt.submit` hook checks owned attempt, matching actual input/turn/alias, unexpired/non-aborted fence and CAS version before `next(e)`; revoked/expired/mismatched attempts drop before model delivery. A deliberately armed attempt's exceptions fail closed. Once `next` has run, failure to report the receipt is UNKNOWN, never a fabricated drop/refusal; catch returns the already-produced result. Persist native accepted and transcript UUID evidence in either arrival order; single-flight claims and expected content/identity discriminate duplicates, and unresolved mapping stays uncertain rather than guessed. Release the fence only after acceptance/refusal classification or bounded failure. Plugin crash/unload cannot be treated as permission to replay a body/Enter. Command/Clear/Stop paths revoke the attempt and bypass worker waiting; Clear pauses claims before waiting for its definitive/uncertain result, without locking out receipt handling.

**Evidence:** `docs/archive/investigations/2026-10-19-claude-queue-timing/FENCED-REPORT.md`; `worker-fence-instruction/{image-path,mention}/result.json`; `admission-single/{accept,revoke}/result.json`. Supported short-text proof is not permission to assume arbitrary media/long writes work. Reuse actual worker submit machinery with acknowledgements of write/echo/native acceptance; do not splice plain CR outside its safeguards.

- RED tests: no queue => immediate release; nested agent batch ignored; one head per fence; stale fence after Stop/Clear/teardown/deadline cannot dispatch; expired-before-claim leaves waiting; lost receipt after handoff becomes uncertain; long/Unicode/attachments use existing safe protocol; composer popup/draft prevents delivery; clear cannot overtake delivery.
- GREEN adapter and one supported reentrant hook module; close revokes listeners/fences and releases awaited hooks. Bound retained sessions and outstanding observer state.
- Run actual CLI + local fake API: short/multiple FIFO, long Unicode, @file, attachment path handling, Stop with waiting items, Clear retaining paused items, hook timeout/disconnect. No account credentials. If any approved behavior is not safe, report the measured limit rather than silently weakening it.

## Task 3 — shared queue channel/UI integration

**Modify:** shared channel/types + contract, `main/ipc/session.ts` or focused `main/ipc/queue.ts`, channel table, preload/remote shim/mock shim; renderer `submit-outgoing.ts`, `App.tsx`, `InputBar.tsx`, `QueuedMessagesStrip.tsx`, chat types/reducer only where necessary; desktop/headless boot and record/open lifecycle wiring.

**Interfaces:** Add provider-neutral session queue remove, send-now and edit checkout/ack/cancel calls backed by existing native operations or Claude queue service. Claude Edit returns a reserved full item and checkout token; acknowledge only after the correct session/draft revision accepts refill, otherwise cancel checkout. Remove is an explicit discard action, never the Edit transfer protocol. Claude send acceptance distinguishes `queued`, actual dispatched receipt and definite pre-dispatch unavailable; only the latter may use the legacy non-queue fallback. Publish `session:live {kind:'queue', queue:[...]}` with attachment/paused/status information needed by the reused strip; fill/reset uses the same host snapshot.

- RED tests: native controls unchanged; Claude queue shown only once and not as premature timeline bubble; desktop/remote snapshot parity; remove/edit target exact ID; editing preserves attachments and does not overwrite another draft; send-now uses Escape then selected item, not mods abort; paused restored/cleared queue resumes only from deliberate action; remote offline operations do not buffer silently; transport metadata prevents legacy CR on uncertain direct sends.
- GREEN reuse native strip/callbacks. Use existing error/unsent notice surfaces; do not introduce a second queue UI. Keep phone protocol parity and explicit capability fallback for older hosts.
- Register any added channel through the shared table, generate preload list, update phone-open fixture; no Kotlin business-logic copy.

## Task 4 — verify, inspect and deliver test build

- Fresh code review of state/delivery/identity and native behavior preservation; address accepted findings within this feature.
- Focused queue/control/worker/native/renderer/IPC tests; `bash scripts/verify.sh <session169 app> --full` before completion; own platform checks with honest limitations.
- Isolated real-app fake-API walkthrough using existing strip: multiple waiting messages, edit/remove, attachments, Send now, Stop, Clear then resume queue, app restart restoring paused. Inspect screenshots and saved transcript; account for each original message once.
- Build Linux package outside edited source; verify package version/code identity and isolated launcher. Do not overwrite the currently open .4 test copy. Preserve ability to transfer its test sign-in only after explicit safe close/update.
- Update #169 progress and evidence, state unverified cases precisely; no merge or publication. Deliver a testable build, not just a plan or unit-test count.

## Self-review

All four answered behaviors map to state/transport/UI tests. Existing native UI and native execution remain the reference, not a redesign. The source-integration step preserves newer master changes. Between-batch delivery, ownership acknowledgment and crash recovery are explicit gates, not hidden timing assumptions. If the narrow fence proof cannot be extended safely to required inputs, stop at that concrete blocker rather than claiming an incomplete queue meets the contract.
