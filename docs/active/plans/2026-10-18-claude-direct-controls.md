# Claude direct controls — implementation and verification plan

status: active

## Authorized deliverable

Destin requested a completed testable branch/app build using the proven integrations, without further routine approval pauses. This slice replaces **chat text submission, Stop, /model, /clear and /compact** with a guarded mod control path when available. It retains image/file sends, plan/question/permission handling, raw terminal operation, history files and all other commands on their existing paths. No SDK, merge, push, release or additional paid model tests. No new interface or settings screen is proposed; existing controls and error/unsent-message surfaces are reused.

Implementation workspace: `worktrees/sessions/11-claude-direct-controls`, app branch `session/11-claude-direct-controls`, linked to existing work item #11. Cross-engine history #164 remains separate. Investigation evidence lives in this conversation's earlier `cc-reliability-options` workspace; particularly `FINAL.md`, `SUBSCRIPTION-CREDITS.md` and generated 2.1.300/302 contracts.

Baseline: fresh independent desktop dependencies installed after moving this worktree's incomplete hardlink farm into ignored scratch. Relevant baseline: 156 tests passed across session-manager, session-live-facts and transcript-watcher. The other supplied name filters matched no files; this is not six-suite coverage.

## Design

### Explicit control boundary

Leave `session.sendInput` as raw terminal traffic. Add `session:claude-control` / `window.claude.session.control` as a request-response channel served by the shared channel table. Only explicit chat callers use it; never infer intent from arbitrary raw bytes.

Shared request union in `desktop/src/shared/claude-control-types.ts`:

- `{ kind: 'send-text'; text: string; sendId: string }`
- `{ kind: 'stop' }`
- `{ kind: 'command'; command: 'model' | 'clear' | 'compact'; args?: string; notice?: 'model-switch' }`

Channel payload `{ sessionId, request }`. Reply union:

- `{ status: 'accepted'; requestId: string; model?: string; claudeSessionId?: string }` after the mod method resolves without refusal.
- `{ status: 'unavailable' }` ONLY when the bridge was not usable before any operation was queued/dispatched. This is the sole permission for legacy fallback.
- `{ status: 'rejected'; message: string }` for definite refusal; no automatic legacy fallback.
- `{ status: 'unknown'; message: string }` when it may have executed; never fall back/retry automatically.

Validate remote input at runtime and bound text/args. Only the three named commands are allowed. Normal permission policy is untouched.

### Small in-session mod and host service

New Electron-free `ClaudeControlBridge` owns one lazy loopback HTTP listener and one random bearer secret per app-owned Claude session. Its constructor takes a deployment root; all filesystem writes are asynchronous. Deploy an immutable, content-hashed plugin directory under the instance's userData. The module is compiled into a TypeScript string constant and written as a standalone JS plugin at runtime, so desktop asar and Android do not need an extra raw asset-copy system.

Public service contract:

- `prepare(sessionId: string): Promise<{args: string[]; env: Record<string,string>} | null>` stages the plugin and allocates the session secret. `args` contains only the session-scoped plugin directory. Version detection/gating is supplied by the integration; null means no attachment.
- `execute(sessionId: string, request: ClaudeControlRequest): Promise<ClaudeControlResult>`.
- `isReady(sessionId: string): boolean`.
- `closeSession(sessionId: string): void` and `close(): Promise<void>`.
- Event `settled(sessionId, request, result)` for late/normal completion bookkeeping.
- Event `state(sessionId, state)` with bounded `{claudeSessionId, model, turnId}` observations, main-agent only.

Protocol v1 uses authenticated hello, long-poll and result/state routes. Secret is sent only through child environment and HTTP authorization, never renderer/session info/logs/query strings. Reject browser Origin, non-loopback/invalid Host and unauthenticated requests. Cap body sizes, pending operations and retained IDs. Polls are held below the mods HTTP ceiling; no high-frequency idle timer. Validate protocol/capabilities and track module incarnation/lease. A new incarnation never replays already handed-off operations; stale result posts cannot settle a newer operation. Session teardown revokes the secret and resolves outstanding requests conservatively.

An operation is marked dispatched before sending it in a poll response. Deduplicate sends by sendId; differing content under a reused ID is rejected. Timeout/disconnect after dispatch is unknown, not permission to type the same message. A known unclaimed queued operation may be rejected on timeout, but does not automatically select legacy transport. Retain late-result bookkeeping within bounded history. The service is not an OS sandbox against other code running as the same user.

The mod uses only the exact supported API surface: `$.prompt.submit({text,asUser:true})`, `$.command.run`, `$.turn.abort({turnId})`, `$.session.id/model`, and main-loop turn events. Run commands from a deferred background poll, not inside a hook the engine is waiting on. Execute dequeued operations independently of the poll so a queued send cannot block Stop. Errors are returned explicitly; no synthesized tool results, plan approval, permission overrides or account API calls. No conversation rows are rewritten.

### Lifecycle and attachment

SessionManager owns the bridge (optional constructor dependency/config), and desktop/headless creation enables it with their own userData path. CLI version discovery is asynchronous/cached; tested baseline is 2.1.300+, with no attachment below the floor or when explicitly disabled. Session creation remains synchronous for ownership: asynchronous staging/version detection precedes the worker's spawn message, with cancellation if the session ended meanwhile. Existing worker tests without an enabled bridge retain synchronous baseline behavior.

Pass bridge environment additions through the worker spawn message, limited to the specific app bridge variables. Preserve existing nested-Claude environment scrubbing, shell isolation, MCP args and all startup dialogs. A missing/refused mod yields unavailable; the normal CLI remains usable. No user-wide plugin registry or settings mutation is needed.

### State and sending

The new IPC handler marks send IDs pending before awaiting a direct request. SessionRecords gains bounded uncertain-send tracking: pending/ambiguous IDs answer unknown, not not-received; actual acceptance promotes to received, definite pre-effect refusal clears uncertainty. Raw PTY noteSend behavior remains unchanged.

The renderer initially marks text-only sends as direct pending and calls the new channel. Only unavailable switches the same bubble to PTY and follows the existing write path. Attachments and non-target slash commands never attempt direct message submission. Store transport on the optimistic timeline entry so useSubmitConfirmation **never injects CR for direct/in-flight/unknown sends**. Legacy image/PTy sends retain their guarded CR recovery. Existing send notes handle rejected/unknown outcomes without silently losing text or adding a new UI.

A reusable renderer helper routes supported command strings and explicit Stop. Unknown replies do not cause raw fallback. Raw terminal input, plan/menu drivers and the popup-close Escape remain unchanged. Desktop keyboard Stop and phone Stop share the helper.

SessionLiveFacts receives explicit direct-command started/finished events instead of fake terminal writes. Confirm model from the mod getter; clear keeps existing classic SessionStart identity-remapping; compaction completion remains transcript-driven with explicit rejection ending the spinner. Late receipts do not resurrect closed sessions.

Parser normalization is narrowly scoped: recognize explicit command envelopes independently of promptId; suppress or classify the app bridge's extra command-origin compact row without hiding ordinary user text. The app bridge's plugin origin must identify these records; unrelated plugins/user rows retain existing treatment. Keep file-derived timeline/history authoritative.

## Accepted safety-design review refinements

All five findings from the fresh design review are accepted:

1. Consult per-session send history **before readiness checks**. Keep exact bounded send-ID/fingerprint/outcome tombstones (10,000 max), without evicting their identities. Full result/payload history can be smaller. At the cap, reject new IDs without dispatch; never forget an old ID and call it fresh/unavailable. A session restart has a new app session ID/secret. Duplicates after disconnect/reload return recorded outcome or unknown, never fallback. Commands are not automatically retried.
2. Only explicit pre-effect validation/drop/refusal is rejected. An unclassified exception after a mod API invocation begins is unknown, including “effect then throw.” Preserve uncertainty; never invite automatic resend.
3. Serialize send/model/clear/compact execution in the mod. Keep polling independent; Stop bypasses that queue but is bound to the main-turn ID and incarnation observed at request creation. If idle, Stop is a no-op and does not cancel unstarted messages. A stale turn target cannot stop a newer turn.
4. Operations carry incarnation and require an authenticated claim immediately before invocation. Old polls/results/state are fenced. A different incarnation is **not activated while old claimed work remains unresolved**; mark that work unknown and require reopening rather than risk two control writers. A failed lease after a previously ready bridge does not silently revert new operations to PTY. “Unavailable” fallback is only for sessions that never established the structured bridge; UI can still deliberately use terminal view.
5. Gate pre-spawn controls and raw sends until the worker's existing `spawned` acknowledgment. Refuse rather than report receipt for input that cannot reach a PTY; keep optimistic text with an existing not-sent note. Retain the latest resize for application after spawn. Close/spawn failure cancels asynchronous preparation and all queued bookkeeping. Tests without bridge configuration preserve their established synchronous spawn path.

## Tasks and tests

### 1. Transport/plugin service (tests first)

Create `src/shared/claude-control-types.ts`, `src/main/claude-control-bridge.ts`, `src/main/claude-control-plugin.ts`, and `tests/claude-control-bridge.test.ts` / `claude-control-plugin.test.ts`.

First tests fail for missing service; cover authenticated hello, protocol mismatch, Origin/Host rejection, no effect before availability, poll delivery, acceptance/refusal, duplicate send IDs, unknown timeout, late/stale replies, interruption addressing, bounded queues, reload incarnation, teardown, deployment failure and immutable async staging. Test the actual generated plugin source with a controlled API stub and validate it with the real CLI separately. Record red/green commands.

### 2. Host lifecycle, IPC and send outcomes (tests first)

Modify `session-manager.ts`, `pty-worker.js`, `main.ts`, `headless/headless-boot.ts`, shared contract/types, preload, remote-shim, `ipc/session.ts`, `ipc-handlers.ts`, `session-record.ts`. Extend session-manager/session-channels/session-record tests and worker environment tests. Add interface/channel parity and phone-open fixture entry. Generate preload channels through the existing script. Confirm shell/native sessions get no mod attachment or bridge secrets.

### 3. Existing chat controls, retry safety and live facts (tests first)

Modify submit-outgoing, chat action/entry types and reducer only for transport metadata, useSubmitConfirmation, phone-actions, targeted App/InputBar command call sites, and session-live. Add a focused renderer control helper with tests. Extend existing send reconciliation, popup/instant-button and model/live-fact tests. Add exact mod transcript fixtures for command normalization. Red tests must show no CR for a direct send and preserved legacy image behavior.

### 4. Integration proof and testable build

Run a no-account isolated actual-CLI fake-API smoke through the **production bridge**, not the old standalone fixture. Cover text, three commands, Stop, legacy fallback, dropped response/no duplicate and close. Use a private HOME and `run-dev.sh --label "Claude Direct Controls"` for the actual app runtime; do not touch the installed app or personal auth. Run a fresh code review, fix findings, then `bash scripts/verify.sh <app-worktree>` (full where practical). Verify Android packaging/shared protocol separately; report untested platforms honestly.

Build the desktop application locally without release/tag/push. Deliver a testable isolated dev launch and/or packaged directory with a launcher that fixes a private profile, rather than overwriting the production installation. Inspect the dev window via sanctioned tools and stop temporary verification instances before handing off the chosen test build. No additional paid quota is available from the completed three-attempt allowance.

## Completion conditions

A real production-code path uses the mod for the selected actions; unknown delivery cannot auto-repeat through PTY; image and plan paths still work as before; disabled/old/missing mods degrade safely; session cleanup is bounded; types/tests/lint/knip/guards and build output are observed; independent review has no unaddressed accepted findings. No UI redesign, broad plugin-manager migration, history rewrite, SDK, merge or release belongs to this slice.
