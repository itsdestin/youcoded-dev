# Native Live Status and Early Names — Implementation Plan

**Archived 2026-09-22:** Implemented in youcoded#548; checkboxes below record the original task sequence, not outstanding work. The final review added measured-then-silent cost and short absolute-path regression tests.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox syntax.

**Goal:** Show native usage after each measured request, name new sessions promptly, and shorten file paths in automatic titles.

**Architecture:** Reuse display-only `assistant-thinking` with a cumulative `usageProgress` field; no new transcript event, persistence filter, or IPC channel. Keep progress transient per session, select it ahead of completed-turn usage, and deliver current progress after replay to an attaching desktop window. An atomic conditional sidecar write protects stored ownership; pre/post-write legacy-title checks and a queued, revalidated local projection cover the separate conversation-store path. Later AI review still replaces an automatic placeholder; cross-process writes to two stores are not one transaction. One browser-safe path helper serves Basic names and the Resume Browser excerpt without changing the latter's title policy.

**Tech Stack:** TypeScript, Electron transcript events, React external chat store, Vitest.

## Global constraints

- No estimates before real provider usage; measured context occupancy only in progress. Do not publish incomplete provider-cost sums. Keep final and abandoned usage accounting unchanged except fixing final `free` to the turn-start snapshot.
- Progress is cumulative, replaces prior progress, and never enters transcript, paged history, serialized chat state, or durable totals. Clear on completion, interruption, error, confirmed idle and destroyed host.
- Keep App and Buddy event handlers in parity; use existing event type `assistant-thinking` and its display-only store path. Desktop late attach replays progress after history; remote reconnect intentionally shows completed usage until a new live event.
- One selector chooses in-progress usage before latest completed usage for context/status and `/usage`; return store-owned references for `useSyncExternalStore` stability. Session token/cache/cost figures show durable totals plus the current cumulative progress (never two progress events added), reverting to durable totals alone on terminal events.
- Initial sidecar title is a conditional set-if-unnamed (manual and auto ownership protected) under the naming-store lock; legacy titles in the separate conversation store are checked before/after and a lost placeholder is rolled back with a newer timestamp so sync merges cannot resurrect it. AI review can replace automatic names using monotonic timestamps. Keep reply count and AI schedule intact.
- Preserve URLs, bare filenames and punctuation; keep Resume Browser's raw-excerpt policy and length. No Node `path` in shared/browser code.
- Read `.claude/rules/{native-runtime,chat-reducer,status-bar-relevance,conversations,test-suite-hygiene}.md` before editing. Add WHY comments for nontrivial production changes. Each focused test must actually execute; invert new guards at the real code site and restore. Never commit without explicit user authorization.

## File map

| Files | Responsibility |
|---|---|
| `youcoded/desktop/src/shared/types.ts`, `src/main/harness/harness-session.ts` | Optional heartbeat progress payload and measured turn snapshot; final free flag. |
| `src/main/harness/native-session-host.ts`, `src/main/ipc-handlers.ts` | Current in-memory progress and post-replay attach delivery. |
| `src/renderer/state/chat-types.ts`, `chat-reducer.ts` | Transient per-session progress and terminal cleanup; serialization excludes it. |
| `src/renderer/App.tsx`, `components/buddy/BubbleFeed.tsx` | Dispatch optional heartbeat progress in both event consumers. |
| `src/renderer/state/usage-snapshot.ts`, `hooks/useNativeSessionUsage.ts` | Shared usage precedence; `/usage` and status bar agree. |
| `src/main/conversations/naming-core.ts`, `src/main/harness/session-store.ts` | Pure basename reduction; Basic names and existing raw Resume Browser fallback. |
| `src/main/session-namer.ts`, `src/main/conversations/naming-store.ts` | Conditional initial name and publication, while AI reviews remain replaceable. |
| Corresponding `youcoded/desktop/tests/{harness-session-loop,session-store,chat-reducer,usage-snapshot,session-namer,naming-core,native-session-host}.test.ts*` | Behavioral regressions; add tests to existing feature files. |

### Task 1: Request progress without new event types

- [ ] Add a failing named test in `tests/harness-session-loop.test.ts`: a root turn with two completed requests separated by a tool emits `assistant-thinking` with `data.usageProgress` after each request; the second is cumulative; cost/free/context use turn-start snapshots across a binding change. A specialist child never emits root progress. Assert absent provider usage does not emit a fabricated zero, and interrupted requests clear via terminal event.
- [ ] Run the exact named test with `npx vitest run tests/harness-session-loop.test.ts -t "emits cumulative measured usage during a root turn"` from `youcoded/desktop`, inspect that one test failed for the missing field.
- [ ] Add `usageProgress?: StepUsage-shaped TurnUsage` to `TranscriptEvent.data` in `src/shared/types.ts`. At the accounting site in `harness-session.ts` after `stepsCounted++`, emit `assistant-thinking` with no `text`/`partId` and a cumulative usage object only when real step usage exists. Calculate `costUsd` using `turnPricing/turnFree`, `contextUsedTokens` from the latest measured prompt (omit if absent), `contextLength` from `turnContextLength`, and include `providerCostUsd` only if `stepsWithProviderCost === stepsCounted`. Reuse this snapshot for an in-memory accessor, reset it on turn entry and every terminal path. Final `free` reads `turnFree`.
- [ ] Test `SessionStore.append` drops this payload-less heartbeat without flushing an open text part, and verify no JSONL progress line. Run exact tests then entire `harness-session-loop.test.ts` and `session-store.test.ts`; invert store drop guard and restore.

### Task 2: Transient per-session view and live attach

- [ ] Add failing reducer tests in `tests/chat-reducer.test.ts`: independent progress for two sessions, cumulative replacement, no durable totals, terminal cleanup (complete/interrupt/error), confirmed-idle replay clear versus active replay preservation. Add a race test for an older attach snapshot arriving after newer live progress.
- [ ] Run each new test by exact `-t` name, verify failure and nonzero test count.
- [ ] Add `inProgressUsage: TurnUsage | null` and a monotonically comparable progress marker to `SessionChatState`, not `SerializedSessionChatState`. Dispatch heartbeat usage through App and BubbleFeed using existing batched paths; reducer replaces only if newer, clears on terminal paths via `endTurn`/existing error exceptions and confirmed idle. Exclude progress in `transcript-page-actions.ts` so a foreign persisted heartbeat cannot resurrect it. Preserve the existing display-only heartbeat's other fields.
- [ ] Expose the host's live root progress for `sendLiveOnlyState` in `ipc-handlers.ts`, emitted after replay and before replay-complete. Use the event timestamp/sequence to reject stale attach data, and test active/idle/destroyed cases. Do not add a new channel or serialize it in `chat:hydrate`.
- [ ] Run `chat-reducer`, `native-session-host`, `transcript-event-surface-parity`, `session-context` and related attach tests; invert cleanup/replacement guards and restore.

### Task 3: One status and `/usage` selection rule

- [ ] Add tests in `tests/usage-snapshot.test.ts` and the existing native-usage hook test: per-session progress wins over completed usage, terminal clear restores completed usage, absence hides values as before, cache/free/unpriced and context-remaining semantics are unchanged.
- [ ] Run exact new tests red, confirming executed counts.
- [ ] Extract pure `selectNativeUsage(session)` from the existing backwards walk, selecting `session.inProgressUsage ?? latestCompletedUsage`; use it from `useNativeSessionUsage` and the native branch of `usage-snapshot`. No constructed object in `getSnapshot`; preserve context override behavior for `/compact` and `/clear`. Add one `nativeDisplayTotals` derivation for both StatusBar and `/usage`: durable totals plus only the latest live cumulative snapshot, with cost/free/unpriced gates and no double count at completion. Assert the first completed request's In/Out/Cached/Cost render before the first turn completes, and increase after a second request.
- [ ] Run focused statusbar, usage-card, hook and snapshot suites; invert selection at the real site and restore.

### Task 4: Shorten paths without changing fallback naming policy

- [ ] Add naming-core tests for POSIX, relative slash, Windows backslash, punctuation-adjacent paths, URLs and bare filenames; add session-store tests for the unchanged 60-character excerpt and header precedence with a path inside first user text.
- [ ] Run each named red test with `npx vitest run tests/naming-core.test.ts -t "<exact title>"` and equivalent session-store command; confirm one test ran and failed for the missing basename.
- [ ] Export a browser-safe `shortenPathTokens(text: string): string` from naming-core. Replace path-like tokens' final segment, leaving URLs and trailing separators intact. Apply before `basicNameFrom`'s phrase logic and before the existing Resume Browser fallback truncation; leave original user text and AI prompt untouched.
- [ ] Run entire naming-core and session-store suites; invert the helper call and restore.

### Task 5: Immediate initial automatic name

- [ ] Add session-namer tests: first opening message publishes Basic in Basic and AI modes before completion; Off does nothing; AI replaces placeholder on scheduled reply; manual/automatic/legacy titles block only the initial write; duplicate events or two namers sharing a store publish once; manual rename and mode-off racing delayed initial persistence cannot be overwritten.
- [ ] Run each exact named test red and confirm nonzero executed counts.
- [ ] On first nonblank user event, start best-effort initial naming without incrementing replies. After identifying store ID and reading preference, conditionally write `auto/autoAt` in `mutateNaming` only when no manual or automatic owner exists; check legacy `hasTitle`, generation and Off mode before/after awaits. Roll back only this placeholder on a post-write lost race, using a later tombstone timestamp so a synced copy cannot restore it. Make the conditional mutation itself the sidecar ownership authority; order local projection writes per conversation and revalidate the sidecar stamp before publishing. Preserve `commit()` for subsequent AI review (automatic-to-automatic replacement with a monotonic stamp) and lock-based manual precedence. Catch failures so a chat turn is unaffected.
- [ ] Run `session-namer.test.ts`, naming-store tests and race tests; invert the initial conditional mutation at its real site and restore.

### Task 6: Integration verification

- [ ] Run all touched tests plus `statusbar-native-usage`, `statusbar-session-relevance`, `usage-card-native`, `transcript-event-surface-parity`; inspect counts.
- [ ] Run `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/native-session-status-multi/youcoded` from the workspace worktree; fix failures, do not dismiss flakes. The seven line-budget ceilings touched by this feature may rise only to the reviewed final sizes: harness measured request accounting, host/IPC live attach plus queued safe naming projection, App event routing, reducer ephemeral state, shared event payload, and StatusBar live totals. A new transcript type or a new persistence path would add more code; splitting these narrowly placed edits into files solely to satisfy the line counter would add indirection. Reevaluate and lower a ceiling if the final review removes lines.
- [ ] Run `git diff --check` and inspect both worktree diffs. Check Android/remote event consumption and that no new IPC channel or persisted progress was added. Request fresh code review and address verified findings. Report runtime behavior only if observed in an isolated dev build.
