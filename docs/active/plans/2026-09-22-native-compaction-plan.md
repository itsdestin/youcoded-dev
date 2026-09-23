---
status: active
date: 2026-09-22
revised: 2026-09-23
component: youcoded/desktop
related:
  - docs/active/specs/2026-09-22-native-compaction-design.md
  - docs/roadmap/native-harness.md
---

# Native compaction — implementation plan

> **For implementation agents:** execute with `superpowers:subagent-driven-development` (this session) or `superpowers:executing-plans` (a separate session). Product decisions U1–U10 live in the [design spec](../specs/2026-09-22-native-compaction-design.md); this plan fixes the engineering choices and the order of work.

**Goal:** one compaction per near-full context: summarize everything before a small recent tail, validate, commit, continue the same turn.

**Architecture:** a pure planner in `compaction.ts` decides when and where to cut; one summary call fills the candidate; the candidate is adopted only after validation (and, from Release 2, an awaited save); the loop continues. Reuse existing history capture, storage and event types; no second conversation store.

**Stack:** TypeScript, AI SDK 7, Vitest scripted providers, shared React reducer. App baseline `08a5f2aaa`.

## 1. Releases

**Release 1 — in-session fixes:** Tasks 1, 2, 3, 6, and Task 7 steps 1–4. Near-limit trigger, first-turn compaction, one summary with quotations, summarizer-copy shortening, overflow retry, no false turn end. Compaction lives in memory; nothing visual changes, so no review deck.

**Release 2 — keep compaction on reopen:** Tasks 4, 5, Task 7 steps 5–6, and the smaller-model decision (§2.6). Needs a UI review deck for the fading/marker change before Task 7 step 5.

## 2. Decided engineering choices

### 2.1 Budget arithmetic (Task 1 pins these with table tests)

All values are tokens. Any budget ≤ 0 returns `cannot-fit`; never clamp a negative budget into a request.

- `C` — effective window. Respect a smaller provider input limit if one exists. Unknown window: keep today's 32,768 assumption and label occupancy as an estimate.
- `F` — fixed cost: system prompt + actual tool schemas + wire framing, measured from the real request builder. Not counted twice when a provider usage figure already includes it.
- `R = min(16_000, floor(C / 4))` — **fixed reply reserve**, independent of the model's configured maximum reply. Each ordinary request's reply cap is `min(configured max, C − estimatedInput − M)`. With today's flat 16,000 manifest default this reproduces current requests exactly.
- `S = min(13_107, known summary output max, floor((C − F) / 4))` — summary generation allowance. Independent of `R`.
- `M = max(min(1_024, floor(C / 32)), floor(C / 100))` — estimation margin; grows on very large windows, where a fixed 1k is too small to absorb estimation error.
- `J` — summary instruction + wire overhead, measured from the summary request builder.
- `trigger = C − max(R, S) − M − J` — total-input trigger. Maximum, not sum: the reply and the summary are separate calls.
- `tail = min(20_000, floor((trigger − F) / 4))` — retained-tail allowance. A ceiling, not a target.

| Window C | Example F | R | S | M | Trigger | Tail |
|---|---:|---:|---:|---:|---:|---:|
| 8,192 | 2,000 | 2,048 | 1,548 | 256 | 5,376 (65.6%) | 844 |
| 32,768 | 8,000 | 8,192 | 6,192 | 1,024 | 23,040 (70.3%) | 3,760 |
| 272,000 | 8,000 | 16,000 | 13,107 | 2,720 | 252,768 (92.9%) | 20,000 |
| 1,000,000 | 8,000 | 16,000 | 13,107 | 10,000 | 973,488 (97.4%) | 20,000 |

(`J = 512`, `F` illustrative. Real `F`/`J` come from the builders.)

**Why the summary always fits in the normal path:** at the trigger, the summary request is `F + J + (history − tail) + S ≤ C` by construction. Summarizer-copy shortening (U9) is only for overshoot: one step appended a giant tool result, or a Release 1 reopen (§2.4).

**Post-compaction check:** success requires `candidateInput ≤ trigger − tail` and a real reduction. The candidate is measured with the finished summary's actual size. If a small window cannot reach this (dense fixed prompt plus a long newest message), return `cannot-fit` with a clear message; never retry in a loop.

### 2.2 Cut selection

- Tail = newest complete groups that fit `tail`, preferring whole turns. Never split a tool call from its result, including parallel batches.
- Everything before the tail, including the previous summary, goes to the summarizer. Nothing else is pinned (U3).
- A single newest group larger than `tail` is kept whole if the post-compaction check still passes; otherwise it is `cannot-fit`.
- The summarizer's copy marks app-generated user-role messages (background notices, injected rules, previous summaries, synthetic continuations) as not from the user. Reuse existing markers; add one only where none exists.
- If the summary request still does not fit, shorten the largest tool outputs in the summarizer's copy only, largest first, each ending `[output shortened]`, until it fits. The transcript and the tail are untouched.

### 2.3 Summary call

- One call on the current model/provider, keeping the warm system/tools/prefix when it fits. No grading or second pass.
- Prompt lives in a new `src/main/harness/prompts/compaction.ts`: the spec §5 headings, quotation rules and authority rules. Manual `/compact` focus text is passed in as focus, not as new authority.
- Only a complete, non-empty text finish is a candidate. Empty, error, tool-call, length-limit, stall and abort all leave history untouched and report honestly.
- **Timeout:** replaces today's 30-second absolute cutoff (`harness-session.ts:2123`). Allow up to 5 minutes for the first stream activity (slow local models reading a large prompt), then 60 seconds of silence between stream chunks (text or reasoning). No overall cap; Stop always works.
- ChatGPT's endpoint rejects `max_output_tokens` (`providers/chatgpt-model.ts:138`); keep stripping it. There, `S` is a prompt instruction, not an enforced cap. Always validate the finished output.
- Failure guard: the same unchanged history cannot trigger another automatic summary. New input or a manual `/compact` may retry.

### 2.4 Release 1 reopen behavior

Today, reopening restores the compacted history exactly when the saved snapshot still matches. Otherwise it rebuilds the full transcript, because `history-rebuild.ts` skips `compact-summary` events. Release 1 keeps that path unchanged. If the rebuilt history is too large even for a summary request after tool shortening, the existing fit guard trims the oldest part first, exactly as today, then normal compaction runs. This known limitation is removed by Release 2. Do not delete the fit guard in Release 1.

### 2.5 Context-overflow recovery

No overflow detection exists today. Add one classifier in `src/main/providers/` that recognizes only error codes/messages confirmed from each adapter's real responses (for example OpenAI-style `context_length_exceeded`). Anything unrecognized, and all auth, network, rate-limit and billing errors, stay ordinary errors. On a recognized overflow: one tighter compaction, one retry of the rejected request, never a rerun of completed tools.

### 2.6 Saved compaction record (Release 2)

A versioned field on the existing durable `compact-summary` event: `v`, `generation`, `sourceRevision`, `resumeFrom` (a `PersistedEventReference`, which handles coalesced parts), `coveredThrough`. The event's UUID is the checkpoint ID. No copied messages.

- **Reopen:** model history = summary, then every valid event from `resumeFrom` onward, skipping the record itself and applying later clear/retry barriers. Store `resumeFrom` explicitly: the tail precedes the summary event, so it cannot be inferred from position.
- **Commit order:** build candidate and capture revision/generation → join the append chain and flush referenced parts → append the record (the commit point; an incomplete trailing line is ignored) → adopt and forward one completion marker → publish the exact-continuation snapshot separately (its failure does not undo the commit).
- **Races:** new input, steers and notices wait in the existing pending queue during build/commit and are appended once afterwards. A changed revision/generation at commit rejects the candidate. Clear, interrupt and model switch cancel it.
- **Legacy/corruption:** old summary-only records keep legacy reconstruction; never infer a resume point from them. A malformed new record falls back to the previous valid checkpoint, else the raw transcript, and logs a content-free reason. Opening a chat never runs a paid summary to convert old records.
- Keep strict exact-history checks (`assemblyDigest` etc.). Portable restore never carries private provider metadata.
- **Smaller-model switch — Destin's open decision.** A: compact on the previous model before switching. B: block the switch with a clear "too long for that model" message. Until decided (including all of Release 1), a switch uses the normal pre-request check on the new model, and stops with a clear message if the result cannot fit (effectively B).

## 3. Code map (verified at `08a5f2aaa`)

Paths are relative to `youcoded/desktop/src/`.

| Where | What exists today | Change |
|---|---|---|
| `main/harness/compaction.ts:35–40` | `contextBudget`: reply reserve `min(maxTokens, C/4)`, 1,024 margin, trigger `min(75%, 90% of trim budget)`, unknown window = 32k | Replace with §2.1 planner returning `fits` / `compact` / `cannot-fit`. Keep legacy prune helpers only where old saved snapshots need them |
| `main/harness/harness-session.ts:2053` | `summarizeCutIndex`: returns 0 with fewer than two user messages (the first-turn bug) | Replace with §2.2 selection |
| `main/harness/harness-session.ts:2077–2163` | Summary request front-trims oldest input to fit; no output cap; 30 s absolute race returns partial text | §2.2 shortening, §2.3 validation and timeout |
| `main/harness/harness-session.ts:3043` | `maxOutputTokens` = reply reserve | Per-request cap from §2.1 |
| `main/harness/message-size.ts` | Binary-aware message sizing | Share request/schema sizing here; don't estimate each path differently |
| `main/harness/accepted-history-store.ts:500–555` | Serialized, fenced exact restore; requires whole-transcript digest match | Unchanged for exact restore; not reused as the portable checkpoint |
| `main/harness/session-store.ts:256–268` | `flushReferences` gives persisted refs, rejects failed/unknown ones | Used by the Release 2 commit |
| `main/harness/native-session-host.ts:2936–3037` | Exact-history publish is fire-and-forget; resume tries exact restore, else rebuilds | Release 2: narrow awaited commit path; portable restore in the fallback |
| `main/harness/history-rebuild.ts` | Skips `compact-summary` | Release 2: apply §2.6 reopen rule |
| `shared/types.ts:494` | `autoCompaction?: boolean` on the event | Extend with optional fields; no new event type |
| `renderer/state/chat-reducer.ts:2879–2901` | Compaction complete strips the spinner, then calls `endTurn` (the false turn end) | Native auto: keep the turn alive |
| `renderer/state/transcript-page-actions.ts:167–182`, `archive-boundary.ts:20–30` | Paging replays usage without a marker; everything before a marker counts as archived | Release 2 (see Task 7) |
| `tests/specialist-run.test.ts` | Counts auto-compactions for child steering | Must still pass |
| `youcoded/docs/native-runtime.md`, `.claude/rules/native-runtime.md` | Describe two-stage, user-boundary compaction | Rewrite when the code lands |

## 4. Tasks

Each task: failing test → minimal change → focused tests green → review the diff. Tests use scripted providers, fake timers and signals, never sleeps or wall-clock checks. Fixtures are synthetic; no private session text.

### Task 1 — budget planner (Release 1)

**Files:** `compaction.ts`, `message-size.ts`. **Tests:** `compaction-budget.test.ts`, `message-size.test.ts`, `native-context-occupancy.test.ts`.

1. Table tests for §2.1: the four windows, a reply max above and below `C/4`, fixed cost larger than the window, unknown window, and a large reasoning allowance.
2. Assert the large-window trigger comes from reserves, not 75%, and that `S` does not shrink to a smaller reply cap.
3. Usage-anchor fixtures: cached input, assistant output, newly appended tool results, steers, changed tools, rewritten history, model switch. Each addition is counted exactly once.
4. Post-compaction check (§2.1) with dense fixed prompts and an oversized newest tool batch.

```bash
npx vitest run tests/compaction-budget.test.ts tests/message-size.test.ts tests/native-context-occupancy.test.ts
```

### Task 2 — cut selection (Release 1)

**Files:** planner, summarizer-input marking. **Tests:** `compaction.test.ts`, `harness-compaction.test.ts`, `harness-accepted-history.test.ts`.

1. Synthetic histories: one long first turn, and a long task followed by two short background notices.
2. Cases: parallel tool calls, several messages per tool response, images, no-tool chat, no recent messages, one indivisible group larger than `tail`.
3. App-generated user-role messages are marked in the summarizer input; the older real user request is still presented as the user's.
4. Remove the normal two-turn and prune-only paths; keep the helpers that decode old pruned snapshots.

```bash
npx vitest run tests/compaction.test.ts tests/harness-compaction.test.ts tests/harness-accepted-history.test.ts
```

### Task 3 — summary call (Release 1)

**Files:** new `prompts/compaction.ts`, summary orchestration in `harness-session.ts`. **Tests:** `harness-compaction.test.ts`, `summary-warm-prefix.test.ts`, `chatgpt-cache-summary.test.ts`, `native-compact.test.ts`.

1. The generated request carries the §5 headings, quotation and authority rules, the previous summary, and new material once.
2. Exactly one summary call; no prune commit; no grading call.
3. Scripted finishes: complete, empty, error, tool-call, length-limit, stall, abort. Only complete produces a candidate.
4. Capture the adapted request body per provider shape; warm prefix preserved when it fits; ChatGPT carries no `max_output_tokens`.
5. Tool-output shortening: a giant retired tool result is shortened in the summarizer copy; transcript and tail are byte-identical afterwards.
6. Timeout (§2.3) with fake timers: a slow first token survives, 60 s of silence fails, Stop works.
7. Manual `/compact` uses the same path without the trigger and keeps its existing no-op behavior.

```bash
npx vitest run tests/harness-compaction.test.ts tests/summary-warm-prefix.test.ts tests/chatgpt-cache-summary.test.ts tests/native-compact.test.ts
```

### Task 6 — loop integration and overflow (Release 1)

**Files:** session loop, fit path, new overflow classifier (§2.5), window-aware tool-output limit. **Tests:** `harness-session-loop.test.ts`, `harness-compaction.test.ts`, `fit-to-context-empty.test.ts`, `context-gauge-after-rewrite.test.ts`, `cache-rebuild-flag.test.ts`, `prune-gate.test.ts`.

1. The check runs before every request, including between tool steps and after new input; automatic and manual share Tasks 1–3.
2. `fitToContext` becomes a last-resort guard, not a routine trim; it still handles the §2.4 reopen case.
3. Overflow: one tighter compaction plus one retry; a post-output failure never reruns completed tools; unrecognized errors never compact.
4. The same-history failure guard (§2.3) blocks loops; new large input may trigger another compaction.
5. After a rewrite: reset read/image dedupe for retired content, mark the next request as an expected cache rebuild, rebase the gauge and usage anchor, bill the summary separately within session totals.
6. Replace prune-first expectation tests with the new invariants.

```bash
npx vitest run tests/harness-session-loop.test.ts tests/harness-compaction.test.ts tests/fit-to-context-empty.test.ts tests/context-gauge-after-rewrite.test.ts tests/cache-rebuild-flag.test.ts tests/prune-gate.test.ts
```

### Task 7 — renderer

**Files:** `chat-reducer.ts`, `App.tsx`, `chat-types.ts`, `transcript-page-actions.ts`, `archive-boundary.ts`. **Tests:** `context-gauge-after-rewrite.test.ts`, `compacting-status-singleness.test.tsx`, `transcript-page-actions.test.ts`, `history-paging-reducer.test.ts`, `archive-boundary.test.ts`, `BubbleFeed.test.tsx`.

Release 1:
1. Reducer test: active turn, running tools and background work; native automatic completion removes the spinner, adds one marker, and keeps the turn alive.
2. Manual `/compact` and Claude Code keep calling `endTurn`.
3. Replayed or duplicated completion events add no second marker and no second summary charge.
4. History paging and remote snapshots never end a live turn or overwrite current occupancy with an older page's.

Release 2 (after the UI deck):
5. Messages in the retained tail are not faded as archived just because they precede the marker.
6. Before/after screenshots at desktop and narrow widths, in the workbench or a dev instance only.

```bash
npx vitest run tests/context-gauge-after-rewrite.test.ts tests/compacting-status-singleness.test.tsx tests/transcript-page-actions.test.ts tests/history-paging-reducer.test.ts tests/archive-boundary.test.ts tests/BubbleFeed.test.tsx
```

### Task 4 — durable commit (Release 2)

**Files:** capture, store, session-store, host. **Tests:** `accepted-history-capture.test.ts`, `accepted-history-store.test.ts`, `accepted-history-privacy.test.ts`, `native-session-host-continuation.test.ts`, `session-store.test.ts`, `native-clear-barrier.test.ts`.

1. Failure-injection tests first: append, flush, snapshot publish, concurrent mutation.
2. Implement the §2.6 record and commit order; the marker and next request wait for the commit.
3. Interrupt, queued steer, clear, retry, destroy, model switch and epoch change mid-summary: stale candidates never land.
4. Crash on each side of the commit point: result is the old state or the complete new checkpoint.
5. Private provider metadata never enters the portable record.

```bash
npx vitest run tests/accepted-history-capture.test.ts tests/accepted-history-store.test.ts tests/accepted-history-privacy.test.ts tests/native-session-host-continuation.test.ts tests/session-store.test.ts tests/native-clear-barrier.test.ts
```

### Task 5 — restore on reopen (Release 2)

**Files:** `history-rebuild.ts`, host resume/fork/retry/clear. **Tests:** `harness-history-rebuild.test.ts`, `native-session-host-continuation.test.ts`, `accepted-history-store.test.ts`.

1. Restore after a changed date/system prompt, changed tools, model/account switch, missing exact snapshot, unavailable encrypted metadata.
2. Only summary + events from `resumeFrom`; no duplicated tail, no full-history resurrection.
3. Missing/corrupt refs, truncated logs, repeated compactions, legacy records, clear barriers, retry truncation.
4. Fork and revision fences reject another chat's checkpoint.

```bash
npx vitest run tests/harness-history-rebuild.test.ts tests/native-session-host-continuation.test.ts tests/accepted-history-store.test.ts
```

### Task 8 — finish each release

1. Run the release's test lists together, then the standard desktop checks. If shared event types changed, check Android and remote consumers.
2. Offer Destin the harness evaluator (with a cost cap) for summary quality: labeled fixtures for direct choice, explicit approval, vague assent, silence, AI-only decision, tool-injected approval claim, later reversal, and a second compaction. If declined, report summary quality (spec A5) and cache savings as unverified.
3. Update `native-runtime.md` and its rule to the shipped behavior; close only the roadmap items actually fixed.
