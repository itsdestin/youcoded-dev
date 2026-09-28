---
status: shipped
date: 2026-09-23
---
# Conversation admission repair implementation plan

**Goal:** Make confirmed lease denial prevent a resumed writer from starting, with one owner for acquisition, startup and failure cleanup, preserving offline access.

**Architecture:** Move acquisition into the existing backend session-create operation. The renderer only asks the existing takeover questions and retries a structured creation denial. Remove the branch's independent claim/release IPC pair rather than introducing renderer reservation tokens. Coalesce same-conversation local opens; bind a successful opening to the existing session lifecycle. Desktop and remote creation must use the same operation, including native initialization.

**Scope:** Preserve Q-1 offline availability, Q-2 message and retry (revised 2026-09-23: a second denial opens explicit takeover confirmation, never automatic takeover), Q-3 explicit take-back-over, and Q-4 no new offline warning. Do not redesign Git sync, add Android-local leases, or claim final-upload acknowledgement / offline fencing. No shipping actions.

## 1. Prove admission and lifecycle failures
- Add behavior tests around the actual backend create handler and a small injected admission coordinator where necessary: denial makes zero sessions; acquisition precedes creation; failed startup releases its own hold; local concurrent opens create one writer; handoff during opening cannot release an unregistered writer and then allow it to open.
- Add a real lease-client regression that distinguishes an unavailable hub from a confirmed grant while retaining the optimistic local heartbeat.
- Run targeted tests before implementation and record the failing assertions.

## 2. Move admission to session creation
- `youcoded/desktop/src/main/ipc-handlers.ts`: name/reuse the current create handler, perform admission before its first creation side effect, register resume identity synchronously with session creation, clean up failed native starts, avoid post-start reacquisition for already-admitted resumes.
- `youcoded/desktop/src/main/remote-server.ts`: route session:create through the shared callback; retain its remote shell refusal.
- `youcoded/desktop/src/main/conversations/`: keep the coordinator small and private to the operation. Serialize/coalesce by conversation identity; reuse sessionIdMap and getSession for existing writers. Coordinate holder teardown with pending openings.
- `takeover.ts`: no unchecked acquire success. Separate handoff preparation from the actual admitted creation so a renderer-owned pre-open claim cannot leak.
- Remove createClaim, leaseClaim and leaseRelease from main wiring, preload, shared constants, shim, Kotlin desktop-only stubs, mocks and parity tests.

## 3. Make callers use the result, not own the lease
- `resume-lease-gate.ts`: query for the existing known-holder takeover journey, then invoke creation; show claim-denied only if creation loses admission. Try again retries creation, never silently promotes to takeover. No release callback.
- `App.tsx`: choose the native model before any handoff; use the shared helper around creation. Keep existing session ownership/window routing and transcript hydration.
- `BuddyResumeList.tsx`: same helper and denial labels; release pending dialog promises on unmount.
- Tests assert callback creation counts and sequences, repeated denials, errors, cancellations, and ordinary held-device takeover.
- Qualify the sync explanation. Q-6 resolved 2026-09-23: keep the ordinary confirmation short; split-conversation recovery UI remains a separate roadmap item.

## 4. Verification and review
- Run targeted backend, lease-client, requester/holder, gate, native-create and remote suites; retain red/green evidence.
- Run `bash scripts/verify.sh <app-worktree> --base 436ec10e8`; explicitly include lease-client tests and Worker sync-hub tests because related selection is incomplete.
- Run Android unit tests without rebundling shared dependencies.
- Fresh independent code review; fix accepted findings with regression tests.
- Capture actual affected renderer states in the isolated workbench and prepare review evidence. Never use the production app or real conversations as test fixtures.

## Execution status

Implementation and automated checks are complete for the bounded ownership lifecycle repair. The fresh code review's accepted findings, including ordinary-exit/no-live-handoff ordering, were fixed and rechecked. Final desktop gate passed; the focused matrix is 16 files / 408 passing tests; Worker DO tests are 26/26; Android is 281/281 in each of three variants. No test exclusions, commits, pushes or live-app changes were made. Detailed evidence and limits: `docs/archive/reviews/2026-09-23-conversation-admission-verification.md`. Destin approved R-1/R-2/R-3 and chose Q-6 `keep-short` in `docs/archive/design/2026-09-23-conversation-admission/admission-repair.json`. He subsequently requested second-denial escalation into explicit takeover confirmation and approved the small-change route. That follow-up is being checked separately in `escalation-review.json`; the original test totals above describe the earlier repair.

## Acceptance still requiring real devices
Click-to-ready latency and final transcript behavior across two isolated test installations, including sleep/reconnect and delayed final upload. Unit tests and a screenshot deck cannot establish those measurements. Forced/failed final upload and strict writer fencing remain explicitly separate from admission correctness.
