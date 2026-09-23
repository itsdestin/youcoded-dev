---
status: draft
date: 2026-09-22
component: youcoded/desktop
related:
  - docs/active/specs/2026-09-22-native-compaction-design.md
  - docs/roadmap/native-harness.md
---

# Native compaction — engineering decisions and implementation sequence

> **For implementation agents:** use `superpowers:subagent-driven-development` when executing approved independent tasks in this session, or `superpowers:executing-plans` in a separate execution session. This is a planning draft, not authorization to begin implementation. Read the decision gates before executing tasks.

**Goal:** implement the user-approved [single-operation, near-limit compaction design](../specs/2026-09-22-native-compaction-design.md) without preserving the current two-whole-turn limitation, weakening continuation/privacy fences, or ending an ongoing native turn in the renderer.

**Architecture:** a pure budget/cut planner produces an immutable candidate; one summary call fills that candidate; an awaited persistence boundary accepts it; the existing loop continues from the accepted checkpoint. Portable transcript-derived restoration is distinct from exact provider-bound continuation. Reuse existing history capture/storage and event types; avoid a second conversation store or general harness rewrite.

**Stack:** TypeScript, AI SDK 7, existing native session transcript/accepted-history machinery, Vitest scripted providers, shared React reducer. Baseline app commit `08a5f2aaa674578e6a8d0a5101953a24198ccaae`.

## 1. Approval boundaries and remaining gates

The spec's U1–U10 are user decisions; everything else here is an engineering proposal. This plan does not authorize app edits, paid evaluations, deployment, or a UI-flow shortcut.

### Two releases (U10)

- **Release 1 — in-session fixes:** Tasks 1, 2, 3, 6 and the renderer part of Task 7. Near-limit trigger, first-turn compaction, one summary with quotations, summarizer-copy shortening, no false turn end. Compaction still lives in memory only.
- **Release 2 — keep compaction on reopen:** Tasks 4 and 5, using the simple saved record in §2.3.
- **Release 1 must not break reopening.** Until Release 2, a reopened compacted chat rebuilds the full transcript, which can exceed the window. Keep today's reopen path and last-resort fit guard working for that case, or run one compaction before the first request after reopening. Do not remove the fit guard in Release 1 in a way that turns reopening a long chat into a cannot-fit error.

### Gate G1 — request and summary budget feasibility

A near-full main request must not generate a summary request that overflows. The ~13k summary allowance can exceed the main model's configured reply cap; it cannot simply reuse the ordinary request's reserve. Resolve the exact arithmetic in one pure planner, including fixed prompt/schema costs, output capabilities, and reasoning accounting. Validate representative windows and pathological fixed-prompt sizes before enabling the late trigger.

**Recommendation:** distinguish `mainOutputAllowance`, `summaryGenerationAllowance`, `safetyMargin`, `summaryInstructionOverhead`, and the provider's input/combined-window limits. The trigger must leave room for the applicable request type, not reserve a fixed fraction of every large window. No model-name branches in the planner.

### Gate G2 — bounded tail

**Recommendation:** use Pi's 20,000-token tail as the large-window starting allowance, reduced to available conversation capacity on small windows. A tail is a maximum, not a target to fill. It must leave room for summary, fixed instructions/tools, and useful new work. Do not enlarge the allowance indefinitely to preserve an oversized tool group. Nothing outside the tail is pinned (U3).

The exact small-window formula, headroom requirement, oversized-newest-group policy and the small-window "cannot reach headroom" outcome must be pinned by table-driven tests before this gate closes.

### Gate G3 — durable commit and legacy restoration (Release 2)

**Recommendation:** the saved record is the summary plus one resume point (§2.3). The tail precedes the summary event in the transcript, so the resume point must be stored explicitly, not inferred from event position. Preserve strict exact-history binding checks; do not turn off `assemblyDigest` validation to make resume appear fixed.

Specify an awaited acceptance callback, revision fencing, crash behavior, and legacy checkpoint behavior before changing loop mutations. A historical summary lacking a resume point is not a valid new-format checkpoint.

### Gate G4 — visible semantics

No new panel is planned. Nonetheless, native automatic completion, archive fading, restored markers, and estimated savings are user-visible behavior. Prepare the required UI review before implementing these changes; do not assume the earlier prose conversation waived that gate. Existing local-draft toast/fading proposals are not inherited as approvals.

### Gate G5 — model-quality evidence

Offline fake providers prove orchestration, not whether a real model preserves user approval provenance or handoff quality. Offer the existing harness evaluator with explicit cost approval after prompt implementation. If declined, report semantic fidelity and real cache savings as unverified; do not substitute heading snapshots for those claims.

## 2. Code-backed detail proposals (not yet implementation-approved)

### 2.1 Verified integration findings

Parent rechecked these in the actual returned app worktree; a budget specialist's initial report had ambiguous root wording, so it is not being used as branch evidence without these checks.

- `compaction.ts:35–40`: one existing budget uses quarter-window reply scaling, a 1,024 margin and `min(75% window, 90% trimBudget)` trigger. Replace the trigger, not every unrelated provider policy.
- `harness-session.ts:2077–2113`: summary request preserves original system/tools/prefix but front-trims the oldest span until an estimate fits; it does not set an output cap.
- `harness-session.ts:2115–2163`: a 30-second absolute race can return partial text. A ~13k allowance makes a progress-aware, bounded summary timeout policy important; simply rejecting partial text while keeping an overly short fixed timer could make local compaction unusable.
- `providers/chatgpt-model.ts:138–146`: this endpoint rejects `max_output_tokens`, so the adapter removes it. Keep that behavior. For this provider, an allowance is a planning estimate/prompt instruction, **not an enforced server cap**. Always validate complete output and actual retained fit; unsupported-cap overflow remains a bounded recovery case.
- `accepted-history-store.ts:500–535,539–555`: publication is serialized/fenced; exact restore requires binding, assembly, and an exact whole-transcript byte/digest match. It cannot be reused unchanged as a portable prefix checkpoint that survives later appends.
- `session-store.ts:256–268`: `flushReferences` gives persisted source refs and rejects failed/unknown refs.
- `native-session-host.ts:2936–2959,3022–3037`: exact-history publication is fire-and-forget behind the append chain; ordinary events are forwarded before persistence. Compaction needs a narrow awaited path, not a global streaming persistence gate.
- `native-session-host.ts:2971–3006`: resume tries exact restore and otherwise reconstructs the transcript. The portable checkpoint belongs in that fallback, without weakening strict continuation checks.
- `renderer/state/chat-reducer.ts:2881–2901`: completion currently spreads `endTurn(session)`. `transcript-page-actions.ts:167–182` replays usage but no marker; `archive-boundary.ts:20–30` treats everything before a marker as archived. All three need explicit compatibility tests.
- `shared/types.ts:494` already exposes `autoCompaction`; extend optional data fields rather than add transcript event types. `specialist-run.test.ts` also counts auto-compactions for child steering, so shared-runtime adoption must test that side effect.

### 2.2 Candidate arithmetic to take into Task 1

**Recommendation for a first tested default**, not a claim of optimality or a user-approved set of constants. All quantities are tokens; negative/zero usable budgets return cannot-fit, not a clamp that pretends success.

- `C`: verified effective combined window. Respect any smaller provider input ceiling separately.
- `F`: estimated fixed system + actual tools + wire framing; avoid counting it again if provider-measured total input already includes it.
- `R`: requested main output allowance, limited by a verified provider maximum and the existing quarter-window safety bound for small contexts. If no request cap is available, distinguish the planning allowance from an enforceable cap.
- `S = min(13_107, verified summary output maximum when known, floor((C − F) / 4))`: summary generation allowance. It is independent of a smaller main reply cap. Shared reasoning/output budgets and unsupported caps are explicit provider capabilities, not guessed by model name.
- `M = min(1_024, floor(C / 32))`: initial estimation margin. This is a tuning proposal; a 1k margin is not a guarantee against tokenizer/provider error on a 1M request.
- `J`: estimated additional summary instruction/wire overhead, computed from the actual request builder.
- `trigger = C − max(R, S) − M − J`: conservative total-input trigger leaving room for either request type. Use maximum, not `R + S`, because they are separate calls.
- `B = trigger − F`: available history at the trigger.
- `tailAllowance = min(20_000, floor(B / 4))`: candidate initial tail allowance. Protected user input is additional but deduplicated; actual candidate fit wins over the allowance.

**Reply reserve:** `R` is a fixed planning reserve, not the model's configured maximum reply. When the request is near the limit, lower that one request's reply cap to what fits. Otherwise a model configured for 64k replies drags the trigger back toward 75%. Today `R` is `min(maxTokens, window/4)` with a flat 16,000 manifest maximum, so current models are unaffected.

Worked examples computed with **illustrative** fixed overhead and `J = 512`, a requested main cap of 16,000, and no smaller provider output maximum. These are arithmetic examples, not measured prompt sizes or supported-cap promises:

| Window C | Illustrative fixed F | Main R | Summary S | Margin M | Total-input trigger | Tail allowance |
|---|---:|---:|---:|---:|---:|---:|
| 8,192 | 2,000 | 2,048 | 1,548 | 256 | 5,376 (65.62%) | 844 |
| 32,768 | 8,000 | 8,192 | 6,192 | 1,024 | 23,040 (70.31%) | 3,760 |
| 272,000 | 8,000 | 16,000 | 13,107 | 1,024 | 254,464 (93.55%) | 20,000 |
| 1,000,000 | 8,000 | 16,000 | 13,107 | 1,024 | 982,464 (98.25%) | 20,000 |

These small-window rows are **feasibility examples, not proposed universal occupancy percentages**. They retain a quarter-window output bound as an engineering starting point; a different actual reply allowance changes the trigger. Small windows necessarily spend a larger share on fixed prompts/replies; the large-model decision is not a promise that every model can run at 94% occupancy. Validate providers' actual input/output conventions before implementing this arithmetic. A measured anchor rebases `F/history`, not total billing.

**Post-compaction recommendation:** require `candidateInput <= trigger − tailAllowance` as an initial headroom floor, plus positive reduction; retained content need not grow to that ceiling. Candidate output uses the actual finished summary size, not the generation allowance. Fixed input cannot be dropped to satisfy it. If a small window cannot reach this headroom, the result is a clear cannot-fit message, never a repeated retry. Task 1 must exercise this with dense instructions and an oversized tool batch before adopting it.

**Summary fit (U9):** in the normal path, retire a prefix that fits with `S + M + J`, retaining a bounded tail; never silently omit messages. When the summary input still does not fit (a huge tool result), shorten the largest tool outputs in the summarizer's copy only, largest first, each with an "[output shortened]" marker, until it fits. The transcript and the retained tail are untouched. No multi-pass summary. **Open:** a much-smaller-model switch may still not fit; the recommendation (compact on the previous model before switching) awaits Destin.

**Still unresolved engineering evidence:** reliable provider-specific context-overflow codes; exact reasoning/output accounting; bounded idle-vs-total summary timeout values; handling unknown windows without displaying guessed capacity as measured. These are implementation investigation tasks, not questions that require the user to know provider internals.

### 2.3 Saved compaction record (Release 2)

Pi-like: a versioned field on the existing durable `compact-summary` record holding the summary text plus **one resume point**, the first retained message. Proposed fields: `v`, `generation`, `sourceRevision`, `resumeFrom` (a `PersistedEventReference`, which handles coalesced parts; bare event UUIDs do not), and `coveredThrough` (the last transcript position before this record). The outer event UUID is the checkpoint ID. No copied messages, no per-message descriptors, no origin taxonomy, no size envelope beyond the summary itself.

**Reopen rule:** model history = summary, then every valid event from `resumeFrom` onward, skipping the checkpoint record itself and applying later clear/retry barriers. Nothing before `resumeFrom` is replayed. The tail is contiguous, so there is nothing to piece together.

**Admission rule:** while a candidate is being built or committed, new user input, steers and background notices stay in the existing pending queue. At commit, require the same source revision/generation; otherwise reject the candidate. Append queued input once, after adopting or rejecting. Clear/interrupt/model-switch invalidate the candidate.

Commit sequence:
1. Build the candidate without mutating accepted state; capture revision/generation.
2. Through a narrow awaited host callback, join the existing append chain and flush referenced parts.
3. Append one complete summary record. This is the commit point; an incomplete trailing line is not accepted.
4. Adopt the candidate and forward the completion marker once, after persistence is acknowledged.
5. Publish the optional exact-continuation snapshot separately; its failure does not undo step 3.

Crash before step 3 → old state. Crash after → new checkpoint. A later clear supersedes an earlier checkpoint during replay. Test with injected failures; do not claim a multi-file transaction.

**Legacy/corruption:** legacy summary-only records keep legacy reconstruction; do not infer a resume point. A malformed new record: fall back to an earlier valid checkpoint, else the raw transcript with ordinary fit/compaction before sending, and record a content-free reason. Opening a chat never runs a paid summary merely to convert old records.

### 2.4 Quality and scope review disposition

Earlier reviews covered summary-input fit, approval provenance and manual/specialist scope. The 2026-09-23 review with Destin simplified the design: summary only (no pinned copies), quotations in the summary (U8), summarizer-copy shortening instead of stopping (U9), two releases and a one-resume-point saved record (U10). That removed the discontiguous-coverage descriptors, eight-way origin labels and 1 MiB envelope of the previous draft. Still open: the smaller-model-switch policy. No reviewer has established runtime correctness.

## 3. Minimal module boundaries

Paths in this section are relative to `youcoded/desktop/` unless prefixed with `docs/` or `.claude/`.

| File | Responsibility / intended change |
|---|---|
| `src/main/harness/compaction.ts` | Pure budgets, history/cut selection, candidate-fit/no-progress verdict. Replace the normal prune-only decision with one summary plan. Keep legacy prune derivation helpers only where existing checkpoint restoration needs them. |
| `src/main/harness/message-size.ts` | Existing binary-aware message sizing; share schema/request sizing additions here or a focused helper rather than independently estimating different request paths. |
| `src/main/harness/harness-session.ts` | Orchestrate automatic/manual calls, usage anchor, candidate construction, successful commit, abort/overflow state, cache rebuild and read/image dedupe resets. Do not add another large policy implementation inline. |
| `src/main/harness/prompts/compaction.ts` (new, proposed) | One summary instruction builder and format contract, including the quotation rules (spec §5); receives optional manual focus without granting new authority. Test it through the generated request. |
| `src/main/harness/accepted-history-capture.ts` | Preserve source identities through selection/rewrite; make a candidate publishable without first irreversibly accepting it. |
| `src/main/harness/accepted-history-store.ts` | Existing strict exact-history snapshot, transformation/ref validation and private metadata fences. Extend only where necessary; portable restore is not permission to expose opaque data. |
| `src/main/harness/history-rebuild.ts` | Apply validated portable compaction coverage during fallback reconstruction; replay subsequent events once and maintain pairing. |
| `src/main/harness/session-store.ts` | Persist summary/boundary envelope with existing append ordering, lifecycle truncation and crash semantics. |
| `src/main/harness/native-session-host.ts` | Await commit, serialize against append/clear/retry/model changes, restore from the saved record if exact restore is incompatible. |
| `src/main/providers/` | Targeted capability/accounting/error changes only after identifying the actual adapter needs. Do not rewrite all providers or make ChatGPT claims from generic SDK options. |
| `src/shared/types.ts` | Existing `compact-summary` payload, if extended with optional versioned coverage/measurement metadata. Retain old event compatibility. |
| `src/renderer/App.tsx`, `state/chat-types.ts`, `state/chat-reducer.ts` | Native-auto lifecycle discrimination, idempotent marker, estimate labeling, no false endTurn. |
| `src/renderer/state/transcript-page-actions.ts` | Historical checkpoint/marker mapping distinct from live-turn transitions; no gauge rollback from older pages. |
| `src/renderer/state/archive-boundary.ts`, its consumers | Reflect actual retained context rather than declaring every message before the marker absent. Scope UI treatment after G4. |
| `youcoded/docs/native-runtime.md`, workspace `.claude/rules/native-runtime.md` | Update shipped invariants only with implementation. Current rule still says two-stage/user-boundary compaction and must not survive unchanged after this feature. |

Avoid premature extraction of unrelated session methods. New files should represent tested responsibilities, not one file per implementation task.

## 4. Ordered implementation tasks

Each task is red test → minimal implementation → focused green tests → inspect diff. The tasks below are review-sized units, not permission to commit. Name any future commits explicitly and only make them when requested.

### Task 1 — pin budget and usage arithmetic (G1, G2)

**Modify:** `compaction.ts`, `message-size.ts`; tests `compaction-budget.test.ts`, `message-size.test.ts`, `native-context-occupancy.test.ts`.

1. Write table-driven failing cases for 8k/32k/272k/1M windows; reply limits above/below window constraints; fixed instructions/schema costs larger than available input; unknown windows; large reasoning allowance.
2. Assert the large-window trigger comes from reserves, not 75%; a ~13k summary allowance does not accidentally shrink to the main 4k reply cap.
3. Add measured-anchor fixtures covering cached input, assistant output, newly appended tool results, steers, changed schemas, rewritten history and model switch. Assert additions are counted exactly once.
4. Implement explicit discriminated results (`fits`, `compact`, `cannot-fit`, `unknown-capacity` or equivalent) instead of negative budgets clamped into a supposedly valid request.
5. Calculate both ordinary and summary-request feasibility before approving a cut. Tests must show the summarizer input is not silently front-trimmed.
6. Review defaults against G1/G2; do not bury unapproved user-visible trade-offs in test expectations.

**Run from `youcoded/desktop`:**
```bash
npx vitest run tests/compaction-budget.test.ts tests/message-size.test.ts tests/native-context-occupancy.test.ts
```
**Expected:** new regressions fail before implementation and all listed tests pass after it; no wall-clock assertions.

### Task 2 — safe token-bounded cuts (A3, A4)

**Modify:** pure planner, summarizer-input user/app marking; tests `compaction.test.ts`, `harness-compaction.test.ts`, `harness-accepted-history.test.ts`.

1. Build synthetic histories shaped like the reported long first turn and the long turn followed by two background-completion messages. No private session text in fixtures.
2. Ensure the summarizer's input marks app-generated user-role messages (background notices, injected rules, summaries) as not from the user. Reuse existing markers; add a minimal one only where none exists.
3. Select a bounded suffix at complete group boundaries and include the previous summary in the retired portion.
4. Test parallel tool calls/results, multiple messages per tool response, images, no-tool chat, zero recent messages, and a single indivisible group larger than the allowance.
5. Test that the summarizer input for interrupted tasks and background notices still presents the older user request as the user's, so the summary's Goal can carry it.
6. Retire normal `summarizeCutIndex` two-turn logic and prune-only choice without deleting derivation code needed to decode old saved snapshots.

```bash
npx vitest run tests/compaction.test.ts tests/harness-compaction.test.ts tests/harness-accepted-history.test.ts
```
**Expected:** first-turn compaction is feasible, source refs remain valid, and a short background notice cannot make an oversized user turn disappear from planning.

### Task 3 — one structured summary with validated completion (A5, A6)

**Modify:** proposed `prompts/compaction.ts`, `generateSummary` orchestration; tests `harness-compaction.test.ts`, `summary-warm-prefix.test.ts`, `chatgpt-cache-summary.test.ts`, `native-compact.test.ts`.

1. Assert the prompt follows the spec's headings/style and quotation rules, explicitly forbids AI decisions from appearing as user decisions, handles uncertain legacy approvals, and carries previous summary + new material once.
2. Test one call for normal split-turn summarization; no normal prune commit and no summary-grading pass.
3. Capture actual request options and adapted body for supported provider shapes. Preserve identical warm system/tools/prefix when feasible, but assert no unsupported output-control property is claimed to work.
4. Script complete, empty, error, tool-call, length-limit, stall-timeout, and abort finishes. Only an intentional complete text summary can produce a candidate checkpoint. Use event/deferred signals and fake timers, not sleeps.
5. Assert the main reply cap, summary generation allowance, reasoning use, and visible summary size are not conflated.
6. Manual compact uses the same summary/validation path but skips the automatic trigger; preserve its established no-op behavior where there is nothing useful to compact.
7. Summary-fit shortening (U9): a giant tool result in the retired span is shortened in the summarizer's copy only, with a marker; the transcript and retained tail are byte-identical afterwards.
8. Progress-aware timeout: replace the 30-second absolute cutoff with an idle timeout that keeps going while text is still arriving; Stop still works. Use fake timers.

```bash
npx vitest run tests/harness-compaction.test.ts tests/summary-warm-prefix.test.ts tests/chatgpt-cache-summary.test.ts tests/native-compact.test.ts
```
**Expected:** failure leaves old accepted history untouched; scripted success proves request shape/control flow only, not semantic fidelity.

### Task 4 — durable checkpoint acceptance before publication (Release 2; G3, A8, A9)

**Modify:** capture/store/session-store/host/session interfaces; tests `accepted-history-capture.test.ts`, `accepted-history-store.test.ts`, `accepted-history-privacy.test.ts`, `native-session-host-continuation.test.ts`, `session-store.test.ts`, `native-clear-barrier.test.ts`.

1. First write failure-injection tests for append, flush, checkpoint publication and concurrent history mutation.
2. Define the versioned `resumeFrom`/`coveredThrough` fields (§2.3), including a tail that precedes the summary event.
3. Await the durable acceptance barrier before publishing the successful marker or sending the next model request.
4. Test interrupt, queued steer, clear, retry/truncate, destroy, model switch and session-epoch change during summarization. Stale candidates cannot overwrite newer history.
5. Inject crashes on both sides of the commit boundary; restoration yields old accepted state or the new complete checkpoint. An incomplete record is never a successful checkpoint.
6. Retain strict binding/account/provider/schema/digest safety for exact snapshots. Prove private metadata cannot enter portable transcript payloads or cross bindings.

```bash
npx vitest run tests/accepted-history-capture.test.ts tests/accepted-history-store.test.ts tests/accepted-history-privacy.test.ts tests/native-session-host-continuation.test.ts tests/session-store.test.ts tests/native-clear-barrier.test.ts
```
**Expected:** exact ordering and fences are observed under injected failure, not inferred from a success-only integration test.

### Task 5 — portable resume and branch/reset semantics (Release 2; A8)

**Modify:** `history-rebuild.ts`, host resume/fork/retry/clear handling; tests `harness-history-rebuild.test.ts`, `native-session-host-continuation.test.ts`, `accepted-history-store.test.ts`.

1. Restore after a changed date/system assembly, changed tools, model/account switch, missing exact checkpoint, and encrypted metadata unavailable.
2. Reconstruct only summary + events from `resumeFrom` onward. No duplicate tails or full-history resurrection for valid new-format checkpoints.
3. Test dangling/missing/corrupted refs, truncated logs, repeated compactions, old events without coverage metadata, clear barriers and retry truncation.
4. Define legacy behavior explicitly: never infer exact retention coverage from summary prose. An invalid new checkpoint must not be silently portrayed as a successful restore.
5. Verify fork/new session identity and transcript revision fences prevent accepting an unrelated checkpoint.

```bash
npx vitest run tests/harness-history-rebuild.test.ts tests/native-session-host-continuation.test.ts tests/accepted-history-store.test.ts
```
**Expected:** model-visible context is correctly reconstructed independently of strict exact-provider metadata compatibility.

### Task 6 — loop integration, overflow and input safety (A1–A4, A7, A10, A11)

**Modify:** session loop, request-fit path, provider error adapter only if needed, window-aware tool-output boundary; tests `harness-session-loop.test.ts`, `harness-compaction.test.ts`, `fit-to-context-empty.test.ts`, `context-gauge-after-rewrite.test.ts`, `cache-rebuild-flag.test.ts`, `prune-gate.test.ts`.

1. Route automatic/manual compaction through tasks 1–5. Normal `fitToContext` becomes a fit guard, not an independent silent moving-front policy.
2. On confirmed overflow only, perform at most one tighter recovery and one retry of the rejected model request. Simulate post-output failures and prove no completed tools are repeated.
3. Add unchanged-content failure/no-progress guard; genuine new large input may trigger another operation. Do not impose a global cooldown that blocks required overflow recovery.
4. In Release 1, keep the last-resort fit guard able to handle a reopened full-length chat (§1). Handle oversized text/image/tool input before model submission; retain full user-visible evidence where existing tools support it, provide honest truncation/recovery information, and never turn tool side-effect reruns into the default way to recover cleared output.
5. Clear/reconcile seen-image and read deduplication when content is retired. Rebase gauges/usage anchors immediately after rewrite/model change.
6. Replace old prune-first expectation tests with the new normal-path invariant; keep tests for decoding legacy pruned outputs where required.

```bash
npx vitest run tests/harness-session-loop.test.ts tests/harness-compaction.test.ts tests/fit-to-context-empty.test.ts tests/context-gauge-after-rewrite.test.ts tests/cache-rebuild-flag.test.ts tests/prune-gate.test.ts
```
**Expected:** synthetic incident has one effective reduction, first-turn request survives, and failures neither loop nor silently forget input.

### Task 7 — renderer lifecycle and replay (G4, A9, A12)

**Modify:** shared event types/App/reducer/page-actions/archive-boundary and actual consumers; tests `context-gauge-after-rewrite.test.ts`, `compacting-status-singleness.test.tsx`, `transcript-page-actions.test.ts`, `history-paging-reducer.test.ts`, `archive-boundary.test.ts`, `BubbleFeed.test.tsx`.

1. The false turn-end fix (steps 2–3) ships in Release 1 without a deck: it restores existing behavior and adds no new UI. Changes to markers, fading, estimate copy or the slow-summary progress display go through the UI workflow first. No new settings surface.
2. Write a reducer regression with an active turn, active tools and background work; native-auto completion preserves those fields and adds one marker, including replay/dedup.
3. Keep real turn-ending paths on `endTurn`; do not globally remove the helper from manual/Claude Code handling.
4. Test history paging and remote snapshot rehydration do not end a live turn, double-bill a summary, duplicate markers or overwrite current occupancy with an older page.
5. Test retained entries are not mislabeled archived merely because they precede the marker. Preserve existing clear semantics.
6. Verify mounted status/scroll behavior at desktop and explicit narrow widths; compare before/after images only in isolated workbench/dev surfaces.

```bash
npx vitest run tests/context-gauge-after-rewrite.test.ts tests/compacting-status-singleness.test.tsx tests/transcript-page-actions.test.ts tests/history-paging-reducer.test.ts tests/archive-boundary.test.ts tests/BubbleFeed.test.tsx
```
**Expected:** native automatic compaction is not a turn completion; manual/Claude Code and shared renderer compatibility remain pinned.

### Task 8 — verification, semantic evaluation and documentation

1. Run all focused suites together, then `bash scripts/verify.sh <app-worktree>` from the workspace. Do not call desktop changes done based only on targeted tests.
2. If shared event/bridge types changed, run IPC parity tests and inspect desktop/Android/remote consumers. Do not claim an Android runtime implementation or build without running its checks.
3. Offer an evaluator experiment comparing baseline vs new implementation on long coding, research and everyday-task fixtures. Include unapproved AI decisions, later user reversals, repeated compaction, summary completion, active constraints, and recovery of key references.
4. With approval, measure repeated runs, total summary + continuation cost, provider-measured cache reuse, latency and task outcome. Do not run paid evaluations or use live sessions as fixtures without authorization.
5. Update `youcoded/docs/native-runtime.md`, matching workspace rules and tests to describe shipped behavior. Remove the obsolete two-stage/user-boundary rule only when implementation exists. Reconcile the older local-cut draft and close only the roadmap subitems actually addressed.
6. Obtain fresh code review and required UI acceptance. Finalize this plan/spec status only from observed verification; merge/release remains a separate user decision.

## 5. Current verification and limitations

This planning session edits workspace Markdown only. App worktree is unchanged; none of the future test commands above have been run as evidence of implementation.

`roadmap-check --fix` reports clean structure and a matching index, but also existing unrelated broken claim anchors and missing marketplace checkout checks. Those are documentation audit findings, not newly observed failing app tests or evidence this feature is implemented. Keep scope limited to compaction documents and report the remaining audit limitations.

## 6. Next planning checkpoint

Review the spec's product fidelity, settle G1–G3 with concrete code-backed formulas and schemas, and present only genuine product trade-offs to Destin. The current sequence is intentionally not an executable claim that those gates are resolved. Implementation begins only after the planning handoff is accepted and the required UI path is agreed.
