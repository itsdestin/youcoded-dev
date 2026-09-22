# Native Live Status and Early Names — Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox syntax.

**Goal:** Show accurate native status after each completed model request, name sessions immediately, and shorten file paths in Basic-derived titles.

**Architecture:** A live-only native `turn-usage-progress` event reports cumulative usage after each completed root-model request. The renderer keeps it as ephemeral per-session state, selecting it ahead of completed-turn usage while active. It is never persisted or serialized. Windows attaching during a turn receive the host's current in-memory snapshot through live-only state transfer. Turn-start pricing/model/context snapshots keep progress accurate across model changes. The existing namer publishes the Basic title immediately in Basic and AI modes; the AI review may later replace it.

**Tech:** TypeScript, Electron IPC/transcript events, React `useSyncExternalStore`, Vitest/Testing Library.

## Constraints

- No estimated/streaming values before a model request completes.
- Progress is cumulative and replaces earlier progress; never add snapshots together.
- **Live-only:** never persist, page, serialize, or restore usage progress. Clear it on completion, interrupt, error, and confirmed-idle replay completion.
- Use `turnPricing`, `turnFree`, `turnModelId`, `turnContextLength` captured at turn start, never live `this.opts` values.
- Keep status bar and `/usage` on the same stable selection rule; preserve current missing/free/unpriced/context semantics.
- Keep App and BubbleFeed transcript switches in parity; extend their hand-maintained guard list.
- Preserve manual names and the existing reply-count/AI-review schedule. Basic placeholder names must not block later automatic AI naming.
- Path normalization affects Basic-derived names and the Resume Browser's first-message fallback only; never alter transcript text, AI prompt input, manual/AI names, or bare filenames.
- Read applicable rules before edits: `.claude/rules/native-runtime.md`, `chat-reducer.md`, `status-bar-relevance.md`, `conversations.md`, `test-suite-hygiene.md`.
- Annotate non-trivial production edits with WHY comments.
- For each red test, run an exact test name and confirm one test actually executed. Do not accept a zero-match green run. For tests that pin invariants, perform the test-suite-hygiene inversion against the real site and retain the red-run output.

## File map

| File | Responsibility |
|---|---|
| `youcoded/desktop/src/shared/types.ts` | Declare live-only event. |
| `youcoded/desktop/src/main/harness/harness-session.ts` | Emit cumulative, correctly turn-priced progress and expose current in-memory snapshot. |
| `youcoded/desktop/src/main/harness/session-store.ts` | Filter progress before default durable append. |
| `youcoded/desktop/src/main/harness/native-session-host.ts` | Provide current root-turn progress to live attach/handoff callers; clear on terminal paths/destroy. |
| `youcoded/desktop/src/renderer/state/chat-types.ts` | Ephemeral session state/action (not serialized). |
| `youcoded/desktop/src/renderer/state/chat-reducer.ts` | Apply snapshots and clear on terminal paths/confirmed idle. |
| `youcoded/desktop/src/renderer/App.tsx`, `components/buddy/BubbleFeed.tsx` | Consume live event and live-only attach snapshot. |
| `youcoded/desktop/src/renderer/state/transcript-page-actions.ts` | Explicitly ignore transient history event. |
| `youcoded/desktop/src/renderer/hooks/useNativeSessionUsage.ts`, `state/usage-snapshot.ts` | Shared active-vs-completed usage selection. |
| `youcoded/desktop/tests/transcript-event-surface-parity.test.ts` | Keep event list and App/Buddy branches pinned. |
| `youcoded/desktop/src/main/conversations/naming-core.ts` | Browser-safe filepath-to-basename normalization in Basic derivation. |
| `youcoded/desktop/src/main/session-namer.ts` | Immediate automatic Basic title in Basic/AI modes. |
| `youcoded/desktop/src/main/harness/session-store.ts` | Use Basic derivation for Resume Browser fallback titles too. |

## Task 1 — Emit cumulative live-only usage safely

**Files:** shared/types.ts; harness-session.ts; session-store.ts; tests/harness-session-loop.test.ts; tests/session-store.test.ts; tests/transcript-event-surface-parity.test.ts.

- [ ] **1. Add red harness behavior test.** In `harness-session-loop.test.ts`, set up a root turn with at least two model requests separated by a tool. Assert progress emits after request one and before tool execution, reports its token/cache/context values and turn-start-priced cost, then emits an updated cumulative snapshot after request two. Include a binding/pricing swap between requests; assert both progress events and final completion use the turn-start model/pricing/free/context values. Assert specialist child sessions do not emit root progress. Name the test `emits cumulative usage progress using the turn-start pricing snapshot`.
- [ ] **2. Run the exact red test.** Run `npx vitest run tests/harness-session-loop.test.ts -t "emits cumulative usage progress using the turn-start pricing snapshot"`; confirm one test executed and failed because no progress event exists.
- [ ] **3. Declare the event.** Add `turn-usage-progress` next to `turn-complete` in `TranscriptEventType`; document native root-only, cumulative, live-only semantics and reuse the existing usage payload shape.
- [ ] **4. Emit after accounting each successful step.** After `turnUsage` and provider-cost counters are updated, emit before tool execution/natural-stop handling. Include cumulative tokens/cache, context length/occupancy, and calculated cost. Use the turn-start snapshots (`turnFree`, `turnPricing`, `turnModelId`, `turnContextLength`). Do not expose provider cost unless the same-step accounting is complete; keep final authoritative event logic intact. WHY comment: snapshots prevent binding changes repricing already completed requests.
- [ ] **5. Make event display-only.** `SessionStore.append()` must return for `turn-usage-progress` without flushing buffered assistant text (unlike `session-error`, this is not a turn boundary). Add a test named `does not persist usage progress` that checks durable session history has no progress line. Existing host live event delivery remains responsible for IPC/remote broadcasts.
- [ ] **6. Extend parity guard.** Add the event to `TRANSCRIPT_TYPES` in `transcript-event-surface-parity.test.ts`; App and BubbleFeed handling is required in Task 2, with no known-gap waiver.
- [ ] **7. Run exact red tests individually**, then the two touched test files; verify reported test counts. Invert the session-store persistence assertion against the real append site and retain the red output, then restore.
- [ ] **8. Commit Task 1** with explicit paths and commit trailer `Submitted via YouCoded Assistant`.

## Task 2 — Consume progress per session, attach live, clear on every exit

**Files:** chat-types.ts, chat-reducer.ts, transcript-page-actions.ts, App.tsx, BubbleFeed.tsx, native-session-host.ts (as needed), useNativeSessionUsage.ts, usage-snapshot.ts; tests/chat-reducer.test.ts, tests/use-native-session-usage.test.tsx, tests/usage-snapshot.test.ts, tests/transcript-event-surface-parity.test.ts.

- [ ] **1. Add failing reducer tests.** In the existing `chat-reducer.test.ts`, dispatch independent progress to `s1` and `s2`, then a newer cumulative value for `s1`. Assert stored values remain session-specific and the newer snapshot replaces the earlier one (not summed). Test final `TRANSCRIPT_TURN_COMPLETE`, `TRANSCRIPT_INTERRUPT`, and `NATIVE_SESSION_ERROR` each clear that session's progress. Completion retains final-only totals; interrupt/error preserve their existing usage accounting. Test `TRANSCRIPT_REPLAY_COMPLETE(sessionIdle:true)` clears ephemeral progress, while `sessionIdle:false` preserves it for a still-live ownership transfer.
- [ ] **2. Add failing hook and `/usage` tests.** Create `use-native-session-usage.test.tsx` following the shared chat-store harness: progress for two sessions, select `s1`, rerender for `s2`, verify each own value and that completing one leaves the other intact. Also verify idle/no-progress selects the latest completed usage. In `usage-snapshot.test.ts`, assert in-progress usage wins and completed usage is fallback.
- [ ] **3. Run each exact named red test alone**, verify one test ran per command, and retain the output. Do not use combined regex `-t` filters that can match zero tests.
- [ ] **4. Add ephemeral state.** Add `inProgressUsage: TurnUsage | null` to `SessionChatState`, initialized null, and `TRANSCRIPT_TURN_USAGE_PROGRESS {sessionId, uuid, usage}` action. Do not add the field to `SerializedSessionChatState`, serialize/deserialize functions, remote snapshots, or any durable state.
- [ ] **5. Implement reducer behavior.** Progress replaces the session-owned snapshot, dedupes with existing transcript UUID machinery, and does not modify completed-turn usage or session totals. Clear explicitly in `TRANSCRIPT_TURN_COMPLETE`, `TRANSCRIPT_INTERRUPT`, and `NATIVE_SESSION_ERROR`. In replay-complete, clear only when host says idle; preserve while running. WHY comment: temporary usage is a view of current work, while totals are counted from final/interrupt/error events only.
- [ ] **6. Route live event on both renderer surfaces.** Add `turn-usage-progress` cases to App.tsx and BubbleFeed.tsx using their respective existing batched dispatch paths. Add the case label to parity guard's `TRANSCRIPT_TYPES`. Add explicit `case 'turn-usage-progress': return null` in `transcript-page-actions.ts` so transient state cannot be revived by old/foreign stored records.
- [ ] **7. Support late attach without persistence.** Trace current `sendLiveOnlyState`, replay completion, and native ownership transfer. Add a native-host API returning the current in-memory root-turn cumulative snapshot. Include it only in the existing live-only state transfer/attach response. Apply it to the renderer reducer without durable transcript UUID dedupe (use a dedicated transient action if needed). Clear host snapshot on completion, interrupt, error, and destroy. Test: active attach receives current usage, idle attach receives none, ended/destroyed host cannot resend stale data. Ensure both App and Buddy attach paths that need the chat state receive it.
- [ ] **8. Unify readers.** `useNativeSessionUsage(sessionId)` returns the store-owned in-progress usage reference, else walks backward to latest completed usage. Add the optional field to `UsageSnapshotSession` and make the `/usage` native branch call the same precedence helper. Never synthesize a new object from `useSyncExternalStore` snapshots.
- [ ] **9. Run affected tests**: `chat-reducer.test.ts`, `use-native-session-usage.test.tsx`, `usage-snapshot.test.ts`, `transcript-event-surface-parity.test.ts`, `native-session-host.test.ts`, plus statusbar/native-card tests. Verify the added tests execute. Perform real-site guard inversion for replacement/cleanup and parity if applicable; capture failing output and restore.
- [ ] **10. Commit Task 2** using explicit paths and required trailer.

## Task 3 — Normalize paths in Basic names and Resume Browser fallback

**Files:** `conversations/naming-core.ts`, `harness/session-store.ts` listEntry; tests/naming-core.test.ts and tests/session-store.test.ts.

- [ ] **1. Add red naming-core tests** for POSIX absolute path, relative slash path, Windows backslash path, and bare filename. Exact examples: `fix /home/destin/youcoded-dev/CLAUDE.md instructions` → `Fix CLAUDE.md instructions`; `explain desktop/src/renderer/App.tsx` → `Explain App.tsx`; Windows `Thing.kt` basename; `explain package.json` retains filename. Add a URL case ensuring `https://...` remains intact. Test names describe behavior.
- [ ] **2. Add red Resume Browser fallback test** in `session-store.test.ts`: no header title + first user message containing filepath/request yields concise Basic-style basename title; existing header title remains higher priority.
- [ ] **3. Run each named test alone**, confirm one test executed and failure is from the missing normalization.
- [ ] **4. Implement pure browser-safe path reduction** in naming-core (no Node `path` import): rewrite path-like tokens containing slash/backslash to final non-empty segment, preserve URL tokens and bare filenames; apply only inside `basicNameFrom` before existing cleanup. In `SessionStore.listEntry`, use `basicNameFrom` rather than truncating raw user text. Preserve graceful fallback for empty Basic result.
- [ ] **5. Run naming-core and session-store suites.** Verify all tests pass; invert the path reduction test at the actual helper and retain red output.
- [ ] **6. Commit Task 3** using explicit paths and required trailer.

## Task 4 — Publish immediate Basic title for Basic and AI modes

**Files:** `session-namer.ts`, `tests/session-namer.test.ts`.

- [ ] **1. Add red tests** to existing flat describe sections in `session-namer.test.ts` (do not invent a nesting convention): Basic mode publishes after first `user-message` without waiting for `turn-complete`; AI mode publishes Basic immediately and can replace it with generated title on first completed reply; off mode does not write; manual title is protected; duplicate/replayed first-user events do not publish repeatedly; pre-existing auto title semantics are preserved.
- [ ] **2. Run exact named red tests individually**, confirm test counts.
- [ ] **3. Implement idempotent initial Basic write.** On first user text only, consult current preference; skip off mode, derive `basicNameFrom`, and use existing ownership/naming mutation service. In Basic and AI mode, persist/publish only if no manual/automatic title already owns the record. Protect asynchronous completion with the existing generation/invalidation mechanism so a late write cannot overwrite a rename or preference change. Do not increment completed-reply count or alter review cadence. A Basic automatic placeholder is not a manual owner; later AI automatic naming must remain able to replace it.
- [ ] **4. Run full `session-namer.test.ts`**, verify existing cadence and manual-protection coverage. Invert the immediate publish path test at the real namer branch and retain the red output.
- [ ] **5. Commit Task 4** using explicit paths and required trailer.

## Task 5 — Verify integration and review

- [ ] **1. Run focused regression set:** harness-session-loop, session-store, chat-reducer, native-session-host, transcript-event-surface-parity, use-native-session-usage, usage-snapshot, naming-core, session-namer, statusbar-native-usage, statusbar-session-relevance, usage-card-native. Confirm no filtered test count is zero.
- [ ] **2. Run `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/native-session-status-multi/youcoded`** and address failures; this is the required desktop check.
- [ ] **3. Review behavior edges:** binding changes during a long turn; local/remote attach mid-turn; multiple simultaneously active sessions; app/host crash; interrupt/error/completion; context rebase; provider with absent usage/cost; specialist child; old transcript containing a foreign progress event; manual rename during async naming; Windows/POSIX filepath parsing.
- [ ] **4. Inspect diff and status** (`git diff --check`, scoped status, complete diff); request fresh reviewer if implementation is substantial, address verified findings with tests.

## Plan review/self-check

This is five tasks, with four implementation slices plus integration verification. No persisted progress/page replay/hydration work remains. The known turn-start pricing invariant is explicit. Terminal cleanup paths are enumerated. Multi-session assertions live with the renderer/reducer work rather than a no-production standalone task. App/BubbleFeed parity is pinned. Resume Browser fallback shares the Basic naming rule. Every filtered red run must prove its test count.
