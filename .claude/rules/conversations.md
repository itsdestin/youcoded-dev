---
paths:
  - "**/desktop/src/main/conversations/**"
  - "**/desktop/src/main/session-browser.ts"
  - "**/desktop/src/main/device-identity.ts"
  # Owns the desktop→claude id map this rule's invariants depend on. Was absent
  # until 2026-07-26, so editing it injected NO rule — exactly the file where
  # the wrong-transcript bug landed.
  - "**/desktop/src/main/session-id-mapping.ts"
last_verified: 2026-08-26
verify:
  - path: youcoded/desktop/src/main/conversations/transcript-mirror.ts
    contains: "shrunk"
  - path: youcoded/desktop/src/main/conversations/store-core.ts
    contains: "mergeRecords"
  - path: youcoded/desktop/src/main/session-id-mapping.ts
    contains: "startup"
  - test: youcoded/desktop/tests/session-id-mapping.test.ts
  - test: youcoded/desktop/tests/session-browser.test.ts
  - path: youcoded/desktop/src/main/conversations/takeover.ts
  - path: youcoded/desktop/src/main/conversations/service.ts
    contains: "containedTranscriptPath"
  - path: youcoded/desktop/src/main/conversations/portable-model.ts
  - path: youcoded/desktop/src/main/session-browser.ts
    contains: "walkSlugParts"
  - path: youcoded/desktop/src/main/device-identity.ts
  - test: youcoded/desktop/tests/transcript-mirror.test.ts
  - test: youcoded/desktop/tests/conversation-store-core.test.ts
  - test: youcoded/desktop/tests/conversation-reconciler.test.ts
  - test: youcoded/desktop/tests/slug-path-resolution.test.ts
  - test: youcoded/desktop/tests/holder-takeover.test.ts
  - test: youcoded/desktop/tests/session-meta-parity.test.ts
  - test: youcoded/desktop/tests/takeover-dialog-copy.test.ts
---
# Conversation store, leases & Resume Browser identity

Records at `~/YouCoded/Personal/Conversations/<provider>/<id>.json` + transcript mirroring on the personal sync space. **Depth + why per bullet: `youcoded/docs/conversations.md`.**

## Native provider participation (M2, `conversations/service.ts`)
- **`sessionProvider` is a REQUIRED param on every store-facing service call** — no default to `'claude'`. Materialize asserts the `${sessionProvider}/` lane prefix FIRST; a lane-mismatched record is refused, not materialized.
- **`lastUsedModel` is a `PortableModelRef` (`{modelId, providerType, providerLabel}`) — NEVER the device-local provider ULID.** Whitelist-parsed at all 4 sites; a partial match drops the WHOLE field. `noteModelUsed` never seeds a record. **TWO writers — the store overlay beats the transcript scan, so `isPlaceholderModelId` must gate BOTH** (`readSessionTranscriptMeta`, `sanitizeModelRef`). Guard: `session-browser.test.ts`.
- **Meta writes buffer until `storePhase` leaves `'starting'`, answering HONESTLY either way**; every IPC call site `await`s the write BEFORE broadcasting `SESSION_META_CHANGED` — never optimistic.
- **Read-side fully unlocked** (desktop IPC + remote WS); refusal sentinel survives as `META_UNSUPPORTED_FALLBACK` (Android-only).
- **Requester's hub-down-with-no-holder outcome is `'undeliverable'`, not `'timeout'`** (skips the 25s poll); dialog copy pinned verbatim.

## Conversation store (Phase 2a)
- **Mirror-in is add/update-only AND shrink-guarded** — CC deletion + `/clear` rewrites must NEVER shrink the durable copy.
- **`lastActive` = transcript CONTENT timestamp, NEVER file mtime** (a corrupt >500B transcript is SKIPPED, not EPOCH-dated).
- **Merges are convergent (lattice join), not positional** — `mergeRecords` tie-breaks by total-order content compare; `foldConflictCopies` picks each field group over the ORIGINAL inputs.
- **The record id/provider is a path-traversal boundary** (charset allowlist + `path.resolve`-contain; reachable over remote WS). **Fire-and-forget store writes MUST `.catch()`.**
- **Materialize sweep + Resume Browser union both SKIP live sessions** — renaming a transcript CC is appending to detaches its inode → lost turns.
- **The reconciler recovers the EXACT projectKey from known folders** (`ccProjectSlug(folder)→basename`) **and MUST skip symlinks** (`lstatSync`+`isSymbolicLink`) — keep the skip after Plan 2c deletes the symlink creators.

## Session leases & takeover (Plan 2b — DORMANT behind `native.supported` except materialize-on-release, Bug-1 filter, SessionStart-acquire)
- **Lease ops are DO-AUTHORITATIVE request/response, NOT client-relayed signals** (300s expiry). `lease-event` broadcasts NEVER enter the replay ring (re-query via `op:get`).
- **Leases key on the per-INSTALL `deviceId`** (`getDeviceIdentity(userData)`), NEVER the client `device` label and **NEVER `getMachineIdentity()`**.
- **`noteSessionEnded`'s materialize-on-end MUST skip on timeout** — a space→local rename over CC's still-open inode is data loss.
- **Holder-takeover ordering: interrupt → flush(local→space) → release → pushMoved → destroySession** (mirror-before-release; push-moved-before-destroy); every step try/caught + outer backstop.
- **Never-block: any lease/takeover failure proceeds with the resume (+ warning), never a hard block.** **Bug-1 browse filter: filter `sessionIdMap.entries()` to LIVE sessions.**
- **MovedGate (App.tsx):** the holder KEEPS the moved pill + destroys the CC session; `destroyedHandler` MUST read `movedSessionsRef.current`, never the STATE (stale closure).

## Resume Browser & identity (`session-browser.ts`)
- **Topic-file mtime IS the index's `lastActive`** — rewrites MUST preserve it (`fs.utimesSync`), else a feedback loop bumps every session.
- **`sessionIdMap` remaps ONLY on a `SessionStart` whose `source` is not `startup`** — a `startup` on an already-mapped session is a FOREIGN nested `claude`. Fail-open on a missing `source`; first sighting never gated. Guard: `session-id-mapping.test.ts`.
- **Name precedence: topic file > index topic > first-user-message > "Untitled".**
- **Index keys are CC UUIDs — `SESSION_UUID_RE` gates topic-scan creation** (malformed entries are KEPT). **`cleanupPeriodDays` seeded 365 when absent, never overwritten.**

## Slug→path resolution (`session-browser.ts`, `conversations/resolve-local-project.ts`)
- **`walkSlugParts` MUST try the LONGEST leading segment first** — shortest-first descends into a shorter sibling → resume silently launched in `$HOME`.
- **Store-backed rows override the slug-walk with `resolveLocalProject`'s exact-basename resolution** (only when that folder holds the transcript); `session-manager.ts`'s missing-cwd mask WARNS.
- **ANDROID still has the pre-fix bug** (`SessionBrowser.kt` shortest-first; `session:create` drops `resumeSessionId`) — deferred, Phase 3.
