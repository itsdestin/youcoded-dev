---
status: shipped
date: 2026-09-09
---
# Cache Stage 4 architecture: durable accepted history

Binding interface contract for the Stage 4 implementation tasks. Authority above this file: `../specs/2026-09-08-chatgpt-cache-efficiency-design.md` §3 and `2026-09-09-cache-stage4-brief.md`. This file resolves the design choices those leave open so every task shares one shape. Paths are relative to `youcoded/desktop/`.

## Pieces and owners

| Piece | File | Owner task |
|---|---|---|
| Durable credential epoch + model-free continuation identity | `src/main/providers/chatgpt-auth.ts`, `src/main/providers/provider-registry.ts` | Task 1 |
| Private manifest store (exists; extended) | `src/main/harness/accepted-history-store.ts` | Task 2 |
| Pure prune text helpers | `src/main/harness/compaction.ts` | Task 2 |
| Accepted-history capture (new) + harness hooks | `src/main/harness/accepted-history-capture.ts`, `src/main/harness/harness-session.ts` | Task 3 |
| Transcript path + flush barrier (exists) | `src/main/native-home.ts`, `src/main/harness/session-store.ts` | Task 4 |
| Host publication, restore, fencing, wiring | `src/main/harness/native-session-host.ts`, `src/main/ipc-handlers.ts` | Task 4 |
| Privacy sentinels, docs, verify | tests + `youcoded/docs/native-runtime.md` | Task 5 |

## Identity strings

**Continuation identity** (`string`): `${providerId}\0${modelId}` for every provider except ChatGPT, and `${providerId}\0${modelId}\0${sha256hex(accountId)}\0${credentialEpoch}` for ChatGPT. Built by ONE registry method, `ProviderRegistry.continuationIdentity(binding)`, which throws the existing sign-in-required error when ChatGPT is signed out. The model's owner closure (`bindOpenAIContinuationModel`) calls that same method, so the harness's `continuationBinding` and the host's restore-time lookup can never disagree. The in-memory `authGeneration` counter stays for the request-race checks inside `ChatGptAuth.fetch()`; it is NOT part of the durable identity because it restarts at 0 in every process.

**Credential epoch**: `credentialEpoch: string` (16 random bytes, hex) stored in `chatgpt-account.json`, minted whenever a sign-in writes a fresh account row. Sign-out deletes the row with it. A legacy row without the field reports `'legacy'` until the next sign-in mints a real one. `signedInAccount()` returns it alongside the existing fields.

**Assembly digest** (`string`): `HarnessSession.assemblyDigest()` = sha256hex of `JSON.stringify({ system: systemText, tools: sorted static tool names from opts.tools, mcp: sorted mcp server ids or [], maxTokens: opts.harness.limits?.maxTokens ?? null, promptVariant: profile.promptVariant, providerId, modelId })`. Pure over constructor options, so it is identical before the first turn of a resumed session and at publish time. Per-turn synced tool descriptions are deliberately excluded: a changed skill catalog changes the request prefix but not the validity of the accepted history.

## Capture (Task 3)

`AcceptedHistoryCapture` is pure in-memory bookkeeping owned by `HarnessSession`; it never touches disk and never sees message content.

```ts
type AttemptId = number;
class AcceptedHistoryCapture {
  readonly revision: number;                 // monotonic; starts at the seeded value or 0
  recordEvent(uuid: string): void;           // user-message, skill-invoked, tool-use, tool-result, compact-summary
  beginAttempt(): AttemptId;
  recordAttemptEvent(attempt: AttemptId, uuid: string, kind: 'text' | 'reasoning'): void;
  abandonAttempt(attempt: AttemptId): void;  // uuids never enter the accepted list
  acceptAttempt(attempt: AttemptId): void;   // all uuids enter, in emit order
  acceptAttemptText(attempt: AttemptId): void; // interrupted partial: 'text' uuids only, reasoning never
  mutated(): void;                           // revision++ (injection, steer, status, strip, prune)
  markSummary(summaryUuid: string): void;    // revision++, transformation = { kind: 'summary', summaryEventUuid }
  markPruned(): void;                        // revision++; transformation = { kind: 'pruned' } unless a summary is already recorded (the summary uuid cannot be recomputed; pruned parts are detected per part by the store)
  reset(seed?: { eventUuids: string[]; revision?: number; transformation?: Transformation }): void;
  snapshot(): { revision: number; eventUuids: string[]; transformation: Transformation | undefined };
}
```

`eventUuids` are DELTA-level UUIDs exactly as emitted (the store's `flushReferences` maps them to persisted anchors). Order = emit order. `HarnessSession.emitEvent` returns the uuid it generated so callers can record it.

`HarnessSession.acceptedHistory()` returns `{ revision, eventUuids, transformation, messages: [...this.history], binding, assemblyDigest }` where `binding = this.continuationBinding ?? this.seededContinuationBinding ?? `${providerId}\0${modelId}``. `seedHistory(messages, seed?)` accepts `{ eventUuids, revision?, transformation?, continuationBinding? }`; with a seed the capture starts from those values and `continuationBinding` is set so the first dispatch strips incompatible ciphertext on mismatch; without a seed the capture resets to empty.

Every site that mutates `this.history` calls the capture (grep `this.history.push`, `this.history =`). Request-only `fitToContext` output is never recorded.

## Store proposal and restore (Task 2)

```ts
interface AcceptedHistoryProposal {
  sessionId: string; transcriptPath: string; binding: string; assemblyDigest: string; revision: number;
  references: PersistedEventReference[];   // from SessionStore.flushReferences, delta-level, emit order
  messages: ModelMessage[];
  transformation?: { kind: 'pruned' } | { kind: 'summary'; summaryEventUuid: string };
}
restore(input): { ok: true; messages; eventUuids: string[]; revision: number; transformation? } | { ok: false; reason: FailureReason }
```

Anchors: group `references` by `anchorUuid`; for coalesced types the ranges must tile `[0, persistedText.length)` contiguously, else `unreferenced-history`. The accepted anchor set is what descriptors may cite; `restore` returns the anchor uuids so the harness can re-seed.

Descriptors reference content, never copy it. Per part kind:
- `text` / `reasoning`: `{ kind: 'event' | 'concat', uuid(s), field, providerOptions? }`. `concat` = the part text equals the concatenation of N consecutive unclaimed accepted anchors of that field (handles merged text parts and interrupted partial strings). Metadata allowlist is `providerOptions` only.
- `tool-call`: `{ kind: 'event', uuid, field: 'tool-call', providerOptions? }` (id/name/input come from the event).
- `tool-result`: `{ kind: 'event', uuid, field: 'tool-result', providerOptions?, images?: [{ path, mediaType, digest, filename? }], pruned?: { keepChars } | { imageCollapsed: true } }`. Text comes from `event.data.toolResult`; images are re-read from `event.data.images` paths and digest-checked; pruned text is recomputed with `prunedToolResultText(value, keepChars)` / `imageCollapsedToolResultText(text, toolName)` exported from `compaction.ts` (extracted from `pruneToolOutputs`, which must call them).
- `file` (user attachment): `{ kind: 'image', path, mediaType, digest }` — the path must be listed in an accepted `user-message` event's `attachments`.
- User string content: `user-message` / `skill-invoked` event, `compact-summary` event when the content is `[Earlier conversation summary]\n` + `data.summary`, else `{ kind: 'literal' }` bounded to 64 KiB (rules, steers, status snapshots). Assistant string content: `concat` of accepted `assistant-text` anchors only; never literal.
- Anything else fails the publish with `unreferenced-history`. Exact reconstruction or explicit fallback; no approximation.

**One documented exemption to "never copy tool input":** `providerOptions.openai.parallelToolCall.input` is the raw argument string of OpenAI's parallel-call wrapper. The pinned converter (`@ai-sdk/openai` 4.0.55, `convert-to-openai-responses-input`) re-emits that string verbatim as the wrapper `function_call.arguments`; the transcript stores only each child call's parsed `toolInput`, so the wrapper string cannot be re-derived byte-exactly. Dropping it would make every turn containing parallel tool calls non-restorable. It is therefore kept as allowlisted continuation metadata, inside the same private 0600 sidecar as the reasoning ciphertext, and nowhere else. Per-call `input`, tool output, text and image bytes are still never copied, and the privacy test must place its sentinel in a per-call input to prove that.

Existing behaviours stay: revision fence, 16 MiB bound, atomic replace, invalidate-before-replace, failed unlink, orphan cleanup, transcript bytes+digest high-water, restricted modes, fixed reason codes.

## Host flow (Task 4)

Construction: `NativeSessionHost` gains a trailing optional options object `{ acceptedHistory?: AcceptedHistoryStore; continuationIdentityFor?: (binding: ModelBinding) => string }`. `ipc-handlers.ts` passes `new AcceptedHistoryStore(app.getPath('userData'))` and `(b) => providerRegistry.continuationIdentity(b)`, and calls `cleanupOrphans()` once at startup (fire-and-forget, errors swallowed). Nothing is derived from NativeHome, transcript or sync roots. No IPC surface.

Publication runs on the session's append chain so it is serialized with appends. Trigger: when the harness emits a boundary event (`turn-complete`, `user-interrupt`, `session-error`) the host synchronously takes `session.acceptedHistory()` AND synchronously starts the fence, `revisionPromise = acceptedHistory.invalidate(sessionId, 'mutation')` (the store bumps its in-memory revision before its first await, so a later mutation's fence always outranks an earlier publication). Then, on `entry.appendChain`: `revision = await revisionPromise` → `refs = await store.flushReferences(sessionId, eventUuids)` → on failure stop (checkpoint stays ineligible) → `publish({ ...snapshot, revision, references })`. Starting the fence inside the chain instead was proven wrong by a mutation test: a `/clear` would queue its fence behind the very publication it must cancel and the stale write would win. Host-driven idle mutations (`compactNow`, `clearHistory`, `setBinding` wrappers) publish the same way after the harness call returns. `destroy()` publishes nothing and retains the checkpoint. All failures log one fixed reason code, never content.

Restore (root `resumeInner` and `resumeSpecialist`), after the session object exists and before `seedHistory`: `identity = continuationIdentityFor(binding)` (throw → fallback), `restored = acceptedHistory.restore({ sessionId, transcriptPath: store.transcriptPath(sessionId, cwd), binding: identity, assemblyDigest: session.assemblyDigest() })`. Success → `seedHistory(restored.messages, { eventUuids, revision, transformation, continuationBinding: identity })`. Failure → existing `rebuildHistory` path with `seedHistory(rebuilt, { eventUuids: uuids of every persisted event after the last context-clear })` so an old session becomes durable at its next publish, and one log line with the reason code. A missing store dependency (tests, remote) means plain rebuild.

Deletion: there is no native transcript deletion UI today; `cleanupOrphans()` at startup and `restore`'s missing-transcript removal are the lifecycle boundaries. Document this rather than invent an owner.
