---
status: active
date: 2026-09-09
---
# Stage 4 implementer brief: private accepted-history restoration

This stage is required, not optional. Authority: approved `../specs/2026-09-08-chatgpt-cache-efficiency-design.md` sections 3 durability/transformation and verification; umbrella `2026-09-09-chatgpt-cache-efficiency.md`. Read `../investigations/2026-09-09-cache-integration-seams.md`. Preserve completed stages. No design reapproval, commits, real model calls, production access, UI/IPC/public-event additions.

## Manifest architecture

Store-owned, profile-private, versioned accepted-history manifest (16 MiB max), NOT a duplicate conversation and NOT metadata over rebuildHistory indexes. Ordered accepted message descriptors and assistant step/part descriptors refer to exact persisted transcript text/tool content. Private continuation metadata remains allowlisted. Small history-only injections may be literal private entries. Include retained-history/compaction boundaries, reconstructible pruning transforms and accepted ranges excluding abandoned attempts. Image descriptors reference disk paths plus digest of actual accepted/re-read contents; never duplicate image bytes. Restore requires exact prompt/instructions/tools/configuration identity and provider/model/non-secret account binding.

Extend internal emit/reference ownership as needed; public TranscriptEvent schema stays unchanged. SessionStore coalesces same partId/type deltas using FIRST event UUID, so references must resolve the actual persisted coalesced anchor and range, not later delta UUIDs. Stream part IDs need attempt scope. SDK response messages, not event adjacency, own assistant order. Tool results remain owned by local loop. Unknown/ambiguous part mapping safely invalidates faithful checkpoint while leaving visible transcript intact.

## Persistence and fencing

Root host wire and child wireChildLive append chains swallow failures: waiting on them alone does not prove successful persistence. Track success and explicitly flush every referenced open part before manifest publication. Publish immutable proposal under serialized writes and recheck generation before rename. Include raw transcript high-water/integrity, not filtered readEvents length; reject old manifests when transcript advanced after publication.

History-only mutations (prune, binding/account change, invalidation) require a durable eligibility revision/generation fence even with no new transcript row. Invalidate old eligibility BEFORE replacing manifest. Oversized/failed replacement must not leave older checkpoint eligible. Failed unlink cannot make it eligible. Late writes after clear/delete/binding/invalidation must be fenced synchronously. Use fixed safe fallback reason codes, no sensitive exceptions in ordinary logs. SessionStore visibility/reopen must never fail because continuation did.

Host destroy closes a tab/session, not transcript deletion: retain compatible checkpoint across ordinary close. Find actual deletion seams rather than treating destroy as deletion. SessionStore currently lacks a native deletion API; private store deletion/invalidation must be testable and orphaned/missing-transcript sidecars rejected and removed safely. Do not invent user-facing deletion UI.

## Planning review clarifications

- Inject continuation root explicitly from Electron `app.getPath('userData')` into SessionStore construction (currently in ipc-handlers.ts). Never derive private state from shared NativeHome, transcript/project or sync roots. No IPC API addition is needed.
- Every accepted-history mutation includes rule/status/steer injections and clearing snapshots, not just pruning. Increment revision at the common history mutation boundary. Summary publication must use an explicit post-mutation immutable proposal and the exact persisted compact-summary receipt; the existing event fires before history replacement.
- Account-generation ownership belongs to ChatGptAuth: persist a non-secret credential generation with durable sign-in/sign-out transitions, and check it at both request dispatch and response acceptance. Same-account reauthentication is still a generation change. Notify/fence live root and child continuation; frozen model headers must not send old account headers with a new credential.
- Crash consistency is relative to successfully persisted state. A successfully written invalidation fence makes an old manifest ineligible even if replacement/unlink fails. Under total storage failure, keep conversation running, mark mutations non-durable, disable publication for that activation and retain in-memory invalidation; no process can recover mutations never written anywhere. A later durable transcript advance independently rejects the old manifest via high-water. Never claim durability for failed writes.
- Existing source searches found no native transcript deletion API; ConversationStore.remove currently serves only phantom Claude-record cleanup, and host destroy is ordinary close. Do not add a fake UI deletion owner. Provide real private-state deletion/orphan cleanup at the store lifecycle boundary, validate missing transcript before restore, and explicitly document current absence of native transcript deletion UI. Tests must exercise that cleanup with actual removed transcript files and pending publication, not only a test-only method.

## Transformations/restoration

Request-only fitToContext creates temporary request projection; never publish it as accepted durable history. Persistent prune updates transformation descriptors/revision. Successful summary references persisted compact-summary with exact retained suffix. Any unrepresentable transformation invalidates faithfully instead of approximating. /clear resets context generation and remembered status.

Restore root and specialist histories only after actual prompt/tool/binding assembly. Cross-device/no-sidecar sessions use existing ordinary reconstruction. Malformed/mismatched/stale/oversized sidecars safely fall back, preserving visible content. Provider/model/account swaps remove incompatible continuation before another send. Persistent reasoning sizing must survive restore with correct per-step count/incomplete flag.

## Required test-first matrix

Create accepted-history and continuation-store tests plus host/harness SDK reopen integration. Observe failures before implementation. Test:
- completed multi-part assistant + parallel calls/results close/reopen next-wire identity;
- abandoned retry text already flushed, accepted success, then reopen excludes abandoned parts;
- crash before transcript flush, after flush before publish, after publish;
- late publication after clear, deletion, account/model/provider rebinding;
- oversized replacement with older sidecar, failed write and failed unlink, transcript advance without new sidecar;
- missing/malformed/stale/orphaned/mismatched state;
- changed/missing images invalidate faithful restore;
- persistent pruning and summary/retained suffix, history-only injections/steers/statuses;
- request-only fit does not silently mutate durable accepted history;
- ciphertext with small measured reasoning count and unknown reasoning counts on reopen;
- private sentinel absent from renderer events, transcript JSONL, portable export, sync, chatsearch and ordinary bug reports. Inspect real storage boundaries/readers, not a detached serializer only.

All file tests use injected temp dirs and clocks/failure hooks. Use deferred promises for race windows, never sleeps. Restrict private file/directory permissions. If claiming power-loss persistence (rather than process-crash consistency), filesystem sync ordering must support it.

Run relevant tests after each cohesive change and tsc. Report exact test evidence and changed files in `../investigations/2026-09-09-cache-stage4-report.md`. Do not call a simple-history-only solution complete.
