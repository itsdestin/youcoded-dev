---
paths:
  - "youcoded/desktop/src/main/conversations/**"
  - "youcoded/desktop/src/main/session-browser.ts"
  - "youcoded/desktop/src/main/device-identity.ts"
last_verified: 2026-07-23
verify:
  - path: youcoded/desktop/src/main/conversations/transcript-mirror.ts
    contains: "shrunk"
  - path: youcoded/desktop/src/main/conversations/store-core.ts
    contains: "mergeRecords"
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

Records at `~/YouCoded/Personal/Conversations/<provider>/<id>.json` (`claude/` and `native/`) + transcript mirroring on the personal sync space. **Depth + invariants not listed here: `youcoded/docs/conversations.md`.**

## Native provider participation (M2, `conversations/service.ts`) — guard: `session-meta-parity.test.ts`, `takeover-dialog-copy.test.ts`, `holder-takeover.test.ts` (native-runtime rule owns `native-title-feeder.test.ts`)
- **`sessionProvider` is a REQUIRED param on every store-facing service call** — no default to `'claude'`, so a native caller can never silently write into the CC bucket. `materializeOne`/`materializeSweep` assert `transcriptRef.startsWith(`${sessionProvider}/`)` FIRST, before path-traversal containment — a lane-mismatched record is refused, not materialized (both guards mutation-covered).
- **`lastUsedModel` is a `PortableModelRef` (`{modelId, providerType, providerLabel}`) — NEVER the device-local provider ULID.** Whitelist-parsed at all 4 read/parse sites; drops the WHOLE field on any partial match. `noteModelUsed` never seeds a record (no-op if none exists) — avoids recreating the phantom-record shape `pruneNativePhantomRecords` cleans up.
- **Meta writes buffer until `storePhase` leaves `'starting'`, answering HONESTLY either way** (`pendingMetaWrites`, arrival-order flush). Every IPC call site `await`s the write BEFORE broadcasting `SESSION_META_CHANGED` — broadcast-after-persist, never optimistic (replaces the 2026-07-19 silent-loss incident).
- **Read-side fully unlocked, desktop IPC + remote WS** — the 2026-07-19 native meta refusal is retired; its sentinel string survives renamed `META_UNSUPPORTED_FALLBACK` (Android still uses it).
- **Takeover requester's hub-down-with-no-holder outcome is `'undeliverable'`, distinct from `'timeout'`** — skips the 25s poll. Three-state dialog copy (`confirm`/`undeliverable`/`force`) pinned verbatim.
- Depth: `.claude/rules/native-runtime.md` → "M2 — conversations & sync participation" (quiesce, resume picker, auto-titles); `.claude/rules/sync-spaces.md` (sync-lane treatment).

## Conversation store (Phase 2a) — guard: `transcript-mirror.test.ts`, `conversation-store-core.test.ts`, `conversation-reconciler.test.ts`, `conversations-service.test.ts`
- **Mirror-in is add/update-only AND shrink-guarded** — CC `cleanupPeriodDays` deletion + `/clear` rewrites must NEVER shrink the durable space copy (local smaller → skip; never deletes).
- **`lastActive` = transcript CONTENT timestamp, NEVER file mtime** (a corrupt >500B transcript is SKIPPED, not EPOCH-dated — the 627-file rebump incident).
- **Merges are convergent (lattice join), not positional.** `mergeRecords` breaks ties by total-order content compare; `foldConflictCopies` picks each field group over the ORIGINAL input set (a mutated accumulator ping-ponged two devices).
- **The record id/provider is a path-traversal boundary** (charset allowlist + `path.resolve`-contain; reachable over remote WS). **Fire-and-forget store writes MUST `.catch()`.**
- **The materialize sweep + Resume Browser union both SKIP live sessions** — a rename over a transcript CC is appending to detaches its inode (POSIX) → lost turns.
- **The reconciler recovers the EXACT projectKey from known folders** (`ccProjectSlug(folder)→basename`; last-segment truncation is a fallback). **It MUST skip symlinks (`lstatSync` + `isSymbolicLink`)** — the legacy sync system symlinks conversations into the home slug; following them mis-keyed 921/921 records; keep it after Plan 2c deletes the symlink creators.

## Session leases & takeover (Plan 2b — DORMANT behind `native.supported` except materialize-on-release, Bug-1 browse filter, SessionStart-acquire) — guard: `holder-takeover.test.ts`, `requester-takeover.test.ts`, `lease-client.test.ts`
- **Lease ops are DO-AUTHORITATIVE request/response, NOT client-relayed signals** (→ the DO, 300s expiry). `lease-event` broadcasts NEVER enter the replay ring (re-query via `op:get`).
- **Leases key on the per-INSTALL `deviceId`** (`device-identity.ts` → `getDeviceIdentity(userData)`, a UUID in Electron `userData`), NEVER the client `device` label (dev + built app share `~/.claude`, split `userData`) and **NEVER `getMachineIdentity()`** (per-MACHINE = the registry's; would make dev + built app indistinguishable).
- **`noteSessionEnded`'s materialize-on-end MUST skip on timeout** — `session-exit` fires before the PTY worker dies; a space→local `renameSync` over CC's still-open inode is data loss.
- **Holder-takeover ordering: interrupt → flush(local→space) → release → pushMoved → destroySession** (mirror-before-release; push-moved-before-destroy). Every step try/caught + outer backstop.
- **Never-block: any lease/takeover failure proceeds with the resume (+ warning), never a hard block.** **Bug-1 browse filter: filter `sessionIdMap.entries()` to LIVE sessions** (the map isn't reliably pruned on close).
- **MovedGate (App.tsx):** the holder KEEPS the moved pill + destroys the CC session; `destroyedHandler` MUST read `movedSessionsRef.current`, not the `movedSessions` STATE (the once-registered handler closes over the empty initial Map).

## Resume Browser & identity (`session-browser.ts`) — guard: `session-browser.test.ts`
- **Topic-file mtime IS the index's `lastActive`** — topic rewrites MUST preserve the original mtime (`fs.utimesSync`; `regenerateTopicCache()` does), else a feedback loop bumps every session and breaks the 30-day prune.
- **`sessionIdMap` remaps ONLY on `SessionStart`** (CC rotates its id on `/clear`; subagent events carry child ids that poison the map).
- **Name precedence: topic file > index topic > derived-from-first-user-message > "Untitled"** — the derived title + content-timestamp ordering exist because auto-title is PostToolUse-gated + mtimes lie after restore.
- **Index keys are CC UUIDs — `SESSION_UUID_RE` gates topic-scan creation** (flagged malformed entries are KEPT). **`cleanupPeriodDays` seeded 365 when absent, never overwritten** (CC's 30-day default deletes transcripts).

## Slug→path resolution (`session-browser.ts`, `conversations/resolve-local-project.ts`) — guard: `slug-path-resolution.test.ts`, `resolve-local-project.test.ts`
- **`walkSlugParts` MUST try the LONGEST leading segment first** — shortest-first descends into a shorter sibling (`youcoded` before `youcoded-dev`) → resume silently launched in `$HOME`.
- **Store-backed rows override the slug-walk with `resolveLocalProject`'s exact-basename resolution** (only when the folder holds the transcript). `session-manager.ts`'s `existsSync(cwd)?cwd:homedir()` mask now WARNS.
- **ANDROID still has the pre-fix bug** (`SessionBrowser.kt` shortest-first; `session:create` drops `resumeSessionId`) — deferred, Phase 3.
