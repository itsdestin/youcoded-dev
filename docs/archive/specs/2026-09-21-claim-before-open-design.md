---
date: 2026-09-21
updated: 2026-09-23
status: shipped
type: spec
topic: Backend-owned conversation admission
source-deck: docs/active/design/2026-09-21-lease-handoff/lease-handoff.questions.json
audit: docs/active/investigations/2026-09-21-conversation-lease-handoff-audit.md
---

# Claim-before-open: backend-owned conversation admission

The independent audit rejected the branch's renderer-owned claim/release lifecycle. Destin authorized a bounded repair and asked for the smallest robust implementation that fits the existing code. This revision supersedes the original implementation description; the original deck decisions remain authoritative.

Implementation plan: `docs/active/plans/2026-09-23-conversation-admission-repair.md`.
Visual review: `docs/active/design/2026-09-23-conversation-admission/admission-repair.json`.

## Decisions preserved

- **Q-1:** claim before starting a resumed writer; keep offline access when the hub cannot confirm. Actual click-to-ready / claim latency still requires measurement on isolated devices. `c1b5e8f4` added elapsed-ms logging; instrumentation is NOT completion of that measurement.
- **Q-2, revised by Destin 2026-09-23:** a lost admission race shows a message and Try again / Leave it. Try again repeats admission once; another denial opens the existing explicit takeover confirmation for the latest denying device. Only confirming Take over requests handoff; retry alone is never takeover consent. Destin approved the small-change route in chat; visual follow-up: `docs/active/design/2026-09-23-conversation-admission/escalation-review.json`.
- **Q-3:** the waking device yields by default. Its existing MovedGate action starts the normal resume flow, which directly asks for handoff when the other computer holds it. There is no automatic take-back.
- **Q-4:** no new offline warning.
- **Q-5/Q-7/Q-9:** short explanation, “couldn't confirm” rather than invented delivery/response certainty, and an honest desktop-only handoff disclosure.
- **Q-6 decided 2026-09-23:** keep the ordinary confirmation short (`admission-repair` Q-6: `keep-short`). Conflict preservation is not guaranteed automatic combination of competing chats; keep the warning in the unconfirmed-handoff question and sync explanation. Destin's requested split-conversation resolution UI is recorded in the existing sync roadmap item.
- **Q-8 remains incomplete:** a dynamic “Still syncing recent messages…” state needs reliable freshness/completion evidence. Static explanatory copy is not that implementation.

## Opening flow

1. Choose the native model before querying, requesting handoff, or acquiring. Cancelling the picker touches no lease.
2. The shared renderer helper queries the known holder. A different holder gets the existing confirm / unconfirmed-handoff journey directly, not a fabricated claim-race message first.
3. The helper calls the existing `session:create` operation. Both Electron and RemoteServer route through the same full backend operation, including native initialization.
4. Backend admission reuses an existing live local writer or coalesces an opening already in progress. An existing writer stays owned by its original window, which is asked to focus it; no second creation event or reassignment occurs.
5. Otherwise the backend acquires immediately before creation. Confirmed denial returns `{status:'lease-denied', device?}` without creating a session. The renderer asks Try again / Leave it.
6. Null or unavailable hub response preserves optimistic offline opening. `LeaseClient.acquire` retains null rather than fabricating a hub confirmation; its local renew loop remains responsible for reconciliation.
7. Creation registers the resumed transcript identity synchronously, before native awaits or the first CC hook. Failed startup tears down the failed session and releases the opening's claim. Closing the requesting desktop window during admission cancels startup rather than creating an orphan.

There is no separate `lease-claim`/`lease-release` renderer API, `createClaim` factory, or renderer-owned reservation token. Removing those paths is smaller than fixing their ownership with another distributed token protocol.

## Handoff and lifecycle

- Requester takeover only prepares the transcript after observing release; it returns `ready`, not `acquired`. Actual session creation checks admission again. Explicit force checks the hub result rather than reporting success on null or denial.
- Pending acquisitions receive takeover events too. A cancelled/released acquisition cannot report a successful late grant.
- The admission coordinator invalidates a pending open when handoff begins, waits for any already-starting session, and prevents another local open from overtaking teardown.
- The holder stops its old session before releasing. A failed stop/quiesce is not treated as a completed handoff.
- Old async releases are drained before reacquiring the same ID; session exit avoids releasing a successor's claim.
- Already-admitted resumes do not reacquire at their first CC hook or after native initialization. Fresh and rotated CC identities still need the existing hook path because their transcript identity is learned there.

## Evidence and honest limits

Behavioral tests cover admission refusal before creation, coalescing, late acquisition cancellation, startup cleanup, requester/holder ordering, actual IPC and remote creation routing, retry behavior, and the buddy caller. Source guards alone are not proof of these behaviors.

The regular free-conversation UI path currently pays **query then acquire**, not the original document's claimed single round trip. Do not describe latency as flat without measurement.

This is not a rewrite of Git sync or a new distributed fencing protocol. Offline computers can both continue. Lease acquisition alone does not prove delivery of the old computer's final messages; timeout/failed final upload and TTL/reconnect ordering still require isolated two-device acceptance. The repair must not be described as lossless merge, strict global single-writer fencing, or completed Q-8 freshness handling.
