---
status: active
date: 2026-09-23
---
# Handoff message freshness — investigation

## Authorized direction

Destin selected F-1 `wait-with-escape` in `docs/active/design/2026-09-23-handoff-freshness/freshness.questions.answers.json`: explicit handoffs wait for confirmed recent messages before starting a writer. The original dialog and three-action presentation was superseded by feedback F-4/F-5 in `freshness-simple.review.answers.json` and subsequent chat approval (2026-09-23: “okay, this is fine”). Open the conversation tab with saved history first; show status above the input, allow drafting, but block sending until the handoff is safe. Incomplete confirmation offers **Try again / Continue with these messages** in the same strip, with no Leave it button or extra preview. Closing the tab cancels pending local startup. Ordinary offline opening remains unchanged. The full-width floating chat notices and matching model-loading width are visually approved: F-10/F-11/F-12 all yes in `docs/active/design/2026-09-23-handoff-freshness/freshness-wide.review.answers.json` (2026-09-23 10:20). The exact UI contract is `inline-direction.md` in that folder. Production integration is not yet implemented; technical planning now follows the approved UI.

## Verified boundaries on the repair branch

- `youcoded/desktop/src/main/conversations/takeover.ts:227-233`: requester treats a free/self lease as ready after best-effort sync/materialization, swallowing failures. Release is not transcript delivery evidence.
- `youcoded/desktop/src/main/conversations/service.ts:861-878`: holder flush discards the quiescence verdict and mirror result, suppresses failures, and awaits a bounded sync attempt rather than a per-transcript receipt.
- `conversations/service.ts:759-834`: targeted materialization returns void both on successful import and on missing record/project, held fork, lane refusal, active writer, quiescence timeout, or failed copy.
- `sync-spaces/service.ts:590-618` and `sync-spaces/engine.ts:147-269`: sync completion is space-wide; timeout and transport errors do not establish target-byte delivery. A `synced` timestamp cannot clear the handoff status.
- `conversations/transcript-mirror.ts:64-84,112-157`: ordinary grow-only mirrors compare sizes; equal sizes do not establish equal bytes. The targeted handoff needs explicit byte verification without weakening ordinary shrink/live-session protection.
- `wecoded-marketplace/worker/src/sync/room.ts:224-258`: release and takeover frames contain no correlated final-transcript receipt. Expiry/release/no holder can all produce a free lease. The hub's takeover reply acknowledges its request handling, not holder completion.
- `sync-hub-socket.ts:140-149,169-177`: current request IDs correlate socket replies only; they are not passed to the holder or returned as handoff evidence. IDs are connection-local counters, not durable transfer identifiers.
- Runtime history comes from the provider-local transcript, not the Personal-space copy: native `ipc-handlers.ts:850-900` / `native-session-host.ts:3688-3700`; Claude Code `session-manager.ts:243-245`. Remote browsers use this same desktop host.

## Additional sender-stop limitation found during this investigation

`session-manager.ts:418-432` removes the session and emits `session-exit` before sending kill to the PTY worker, then disconnects it. `pty-worker.js:310-313,378-387` has a PTY exit event, but disconnect kills and exits the worker immediately. The synchronous `destroySession` boolean is therefore not proof that the underlying Claude Code writer has exited. A final-byte receipt must not be minted merely because that method returned true. Current holder ordering also flushes before teardown (`takeover.ts:108-136`). Native append-chain drain and actual CC writer termination need explicit treatment before calling any snapshot final. This qualifies earlier lifecycle-verification wording; its tests do not prove OS-level process termination.

## Smallest candidate to evaluate after UI approval (not yet a contract)

Reuse Git transport for transcript bytes; add a handoff-specific fingerprint (provider, validated conversation ID, size, hash) correlated to a unique request nonce. A receiving machine confirms only after matching the nonce and verifying the actual runtime-local bytes, immediately before startup under backend admission. A stale receipt from a prior handoff must never pass.

Independent read-only architecture review favors option 2 below: no new hub receipt service or generic sync-result protocol is needed. The receiver's correlated local-byte check is the completion evidence. Options evaluated:
1. Add the expected fingerprint to an explicit, queryable hub handoff receipt. This requires Worker state, expiry, reconnect behavior, and new protocol semantics.
2. Add a small stable-path receipt file in Personal, written only on handoff, with the request nonce forwarded by the existing takeover message. The receiver verifies both receipt correlation and local bytes, so a marker arriving ahead of its transcript remains unconfirmed. No heartbeat records or per-poll writes in Git. Conflict/stale marker or legacy sender means unconfirmed, not success.

Do not grow this into a sync rewrite. A target byte match at the destination is stronger than plumbing every generic sync result into a success claim. Conversely, a byte match to a stale/unbound snapshot is not final-message evidence.

## Deferred helper-history verification — 2026-09-23

<!-- claim: helper-history-handoff-unverified -->
Native visible history is assembled from the parent transcript and separate child transcripts/delegation records (`native-session-host.ts` → `historyPlan`, `getHistory`, `getHistoryAsync`). The v1 handoff receipt in `conversations/handoff-transcript.ts` fingerprints only the parent JSONL. Source review therefore does not establish that matching the parent receipt proves delivery of the full helper-card history. This is not a reproduced cross-device loss or a failing test.

Destin: “lets just skip these for now. add to roadmap that we need to verify this issue.” Filed under `docs/roadmap/sync.md` as `needs-verify`. Defer helper/ledger bundle verification and any helper-specific new warning policy. Continue the current handoff work with parent-transcript evidence only; do not describe it as verification of all subsidiary files. Follow-up should exercise two isolated devices with completed and active helpers, verify both the displayed cards and saved histories, and distinguish parent model-continuation messages from child-only history.

## Acceptance requirements for the technical design

- Source snapshot is taken only after the writer is demonstrably stopped and durable appends have drained; missing/unknown stop evidence cannot produce `fresh`.
- Independent review flagged `conversations/service.ts:739-745` and `ipc-handlers.ts:3980-4012`: ordinary session-exit cleanup drops the live materialization guard and starts a peer import. The handoff needs to preserve that guard through the post-stop sender snapshot so it cannot accidentally certify imported peer bytes.
- Native `quiesce()` drains appends but is not permanent closure; buffered streaming disposal happens in teardown (`native-session-host.ts:4425-4439,4673-4720`). Snapshot follows successful teardown/dispose, not just quiescence.
- A competing request can replace a stable receipt. Exact nonce/requester matching must reject ambiguity; do not treat the most recent file as evidence for every waiter. Retry retains its original nonce and expected sender.
- Correlate session/provider/request and the intended receiver; no device-label identity or client-clock freshness test.
- Preserve failed/oversize/missing/conflicting copies; no overwrite of a live or divergent local transcript to make a receipt pass.
- Check the exact runtime path startup will consume, and close the import-to-start race through existing backend admission, not independent renderer lease ownership.
- Every known incomplete state offers the inline **Try again / Continue with these messages** choice. The conversation tab is a read/draft surface until backend admission permits writing; opening the tab is not starting a writer. Closing the tab must prevent late startup and settle pending work. It cannot promise to undo an already-requested stop on the old computer.
- Retry after an old holder has already stopped still needs the original transfer evidence rather than requesting a fictitious new final snapshot.
- Legacy peers/Worker and unreachable devices degrade to honest unconfirmed status; explicit fallback never claims freshness. Force ownership consent remains separate from saved-history consent.
- Once the user starts from the saved copy, later arrival does not silently replace that live runtime's history.
- Tests: real temporary two-root Git push/pull + provider-local import; same-size changed content, divergent/longer local copy, missing project, >50 MiB transcript, slow/failed upload, stale receipt, disconnect/reconnect, cancellation, competing opens, native append drain, and CC exit ordering. Simulated tests do not count as real-device latency measurements.

Android-local handoff and split-copy resolution remain outside this stage. Worker deployment, any interactive verification rig, and testing against real user data are not authorized by this investigation.
