---
status: active
date: 2026-09-09
---
# ChatGPT Cache Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. No commits are authorized.

**Goal:** Preserve ChatGPT request history and expose private, bounded evidence about individual cache observations, including faithful local reopen.

**Architecture:** Observe serialized sends inside the credential wrapper, using request-scoped bookkeeping rather than wire headers. Keep specialist snapshots append-only. Accept allowlisted completed SDK assistant messages into model history, then persist a private manifest referencing the actual persisted transcript rather than rebuilding array positions.

**Tech Stack:** TypeScript, Node crypto/fs/async_hooks, Vitest, ai 7.0.89, @ai-sdk/openai 4.0.55.

## Global Constraints

- Authority: `../specs/2026-09-08-chatgpt-cache-efficiency-design.md`, including all six review dispositions. Design is approved; do not reopen it.
- Workspace `/home/destin/youcoded-dev/worktrees/sessions/chatgpt-cache-efficiency`; app is its `youcoded/` child. Base app HEAD verified as `7b49e01442b712275996055224ab2cf72ceb2926`.
- No production access/configuration changes, paid evaluations, synthetic quota calls, commits, pushes, merges or releases.
- No IPC, renderer, status-chip or unrelated cache-backlog additions. Frozen transcript event surface.
- Diagnostic limits: two files of at most 5 MiB; 1,000 queued sanitized records; 8 MiB fingerprint memory; 256 unfinished observations; 10-minute expiry. Sidecars: 16 MiB.
- Never persist diagnostic prompts, tools/content, images, reasoning, credentials, account IDs, raw errors, raw cache keys or fingerprints. Use per-process random HMAC.
- Each stage requires an observed failing test before implementation and passing targeted tests after. Use injected directories/clocks and deferred promises, not sleeps.
- Dependencies installed from this branch's lockfile into an initially absent, private `desktop/node_modules` using `npm ci --ignore-scripts --no-audit --no-fund`; both SDK versions verified. Do not patch shared dependencies.
- Every nontrivial edit needs a WHY comment. Tests are offline; no cache percentage improvement claim.

## File responsibilities and interfaces

Paths below are relative to `youcoded/desktop/` unless explicitly workspace paths.

- `src/main/providers/chatgpt-request-diagnostics.ts`: allowlisted observation records, HMAC comparisons, bounded lanes/unfinished requests, loss counters and rotating writer. Expose a request context runner and transport observer; no credential ownership.
- `src/main/providers/chatgpt-auth.ts`: actual-send observer placement around `realFetch`, including internal 401 resend parentage. Never hand headers to observer.
- `src/main/providers/chatgpt-model.ts`: preserve existing payload middleware; attach logical-request context without changing JSON. SDK response raw chunks feed only sanitized usage.
- `src/main/providers/provider-registry.ts`: profile-local diagnostics ownership/binding and model construction. Preserve existing session cache key.
- `src/main/harness/harness-session.ts`: lane/step scopes at normal and summary calls, structured status snapshot memory, successful SDK assistant acceptance, history mutation boundaries and accepted-history publication.
- `src/main/harness/specialists/status-snapshot.ts`: pure structured comparison/formatting keyed by task ID; elapsed time is presentation only.
- `src/main/harness/native-session-host.ts`: supply structured reportable ledger state; connect persistence after append-chain success, restoration, clear/binding/deletion fencing.
- `src/main/harness/openai-continuation.ts`: typed allowlist for SDK assistant response messages, compatibility isolation and reasoning-size bookkeeping.
- `src/main/harness/accepted-history.ts`: versioned ordered message/part descriptors, transcript references, image/config digests, transformation descriptors and exact reconstruction.
- `src/main/harness/continuation-store.ts`: profile-private sidecar atomic publication, generation fences, size limits, eligibility/invalidation, load validation.
- `src/main/harness/session-store.ts`: persisted transcript barrier and accepted reference resolution. Ordinary transcript remains unchanged and visible on fallback.
- `src/main/harness/message-size.ts`, `compaction.ts`, `wire-adapter.ts`: retain grouping and distinguish reasoning token estimates from ciphertext byte sizes.
- `scripts/chatgpt-cache-summary.mjs`: strict allowlisted diagnostic reader, grouped coverage/reuse/change/timing summary, never transcript reads.

## Stage 1 — Per-request diagnostics

- [ ] Add `tests/chatgpt-request-diagnostics.test.ts`: identical/appended/edited/removed ordered inputs, component changes, lane isolation, missing cache detail versus zero, invalid count exclusion, out-of-order completion, fresh process baseline, failures/aborts, bounded state/expiry/loss counts, log failure isolation and privacy sentinels.
- [ ] Run `./node_modules/.bin/vitest run tests/chatgpt-request-diagnostics.test.ts`; observe failure at missing implementation.
- [ ] Implement a synchronous boundary observer that immediately reduces input to HMAC fingerprints and sanitized differences. Record `laneId`, `logicalStepId`, `attemptId`, resend parent, dispatch sequence and baseline reference. Dispatch advances lane baseline; only a newer successful dispatch advances last-successful reference.
- [ ] Keep queue records sanitized; drain asynchronously into private rotating files. Expire unfinished observations and evict inactive LRU lanes within exact spec bounds. Emit cumulative counters even when a record is dropped. Catch observer failures without exposing sensitive exceptions.
- [ ] Add auth fake-fetch tests to `tests/chatgpt-auth.test.ts`, proving first 401 and refreshed resend are distinct attempts of the same logical step and outgoing bytes remain identical. Responses are observed without consuming ahead of SDK demand or retaining a raw response queue.
- [ ] Thread scopes through normal, specialist, title and summary requests; summaries must not replace chat baselines. Use a per-request context wrapper around SDK work, not a mutable shared global lane.
- [ ] Add summary tests using fabricated sanitized records: valid subset reuse = sum(cache)/sum(input); fresh uses same subset; show overall totals and both count/token coverage. Unknown reporting is never zero.
- [ ] Run targeted diagnostic/auth/model/provider tests. Measure CPU cost (`process.cpuUsage`) for representative 100k-token-like request bodies and large encrypted parts; record actual numbers in reference docs, not a guessed budget.

## Stage 2 — Append-only specialist state

- [ ] Add `tests/specialist-status-snapshot.test.ts` and harness integration regressions. Pin byte-identical old history, unchanged suppression, lifecycle/report/failure/delivery/stale changes, one clearing update, pending completed reports, callback failure, clear/reset and resume/compaction reinjection.
- [ ] Observe failures against the old splice-and-replace implementation.
- [ ] Define `SpecialistStatusSnapshot` as an ordered set of stable task records (ID, description, status, delivery/stale state, report/failure identity/content). Compare normalized structured snapshots before formatting; omit elapsed time from equality.
- [ ] Change host status callback to structured snapshot data from reportable ledger records. Existing running/undelivered filtering and report delivery remain authoritative.
- [ ] Replace only the ordinary-turn status splice with changed-snapshot append. Format snapshots with an explicit supersedes statement; null/empty known state clears once; thrown reads preserve remembered state. Reset memory on seed/clear/compaction so the next read can reintroduce authoritative state without rewriting retained messages.
- [ ] Run specialist snapshot, native host, harness session/loop and delegation ledger tests. Ensure completion notice delivery and call/result pairing remain intact.

## Stage 3 — SDK-native in-memory continuation

- [ ] Add `tests/openai-continuation.test.ts` with fake SSE through this branch's actual `createOpenAI().responses` plus `chatGptMiddleware`, then inspect the next serialized request. Cover reasoning/encrypted content, text phase and IDs, interleaving, two parallel local tool calls/results, unknown metadata rejection.
- [ ] Observe missing-continuation failures through HarnessSession, not only adapter fixtures. SDK support itself is a prerequisite; do not silently omit an unsupported field.
- [ ] Adapt completed `result.response.messages` assistant entries using an explicit OpenAI allowlist (`itemId`, `phase`, `reasoningEncryptedContent` and only SDK-required supported continuation fields). Keep content order. Do not introduce a stream assembler or import tool-result messages from SDK response history.
- [ ] Extend internal StepResult with completed assistant messages and reasoning usage. Commit them only at the existing successful nonempty acceptance gate. Abandoned retries/interrupts retain current partial-text behavior; reasoning-only empty recovery remains unchanged.
- [ ] Strip incompatible continuation on provider/model/account changes. Binding identity must be non-secret and checked before subsequent sends, including account changes under an existing model instance.
- [ ] Add sizing tests: large ciphertext + small measured reasoning count, missing reasoning estimates, retained-step accounting once, no double-count with summary text. Exclude provider metadata strings from chars/4. Keep incomplete estimates explicit and favor measured pressure where available.
- [ ] Run SDK contract, harness retries/empty response/interrupt/compaction/wire adapter and message-size tests.

## Stage 4 — Durable accepted history (required)

- [ ] Add `tests/accepted-history.test.ts` and `tests/continuation-store.test.ts`. Manifest schema contains version, revision/generation, binding/config identity, ordered accepted messages and assistant-step/part descriptors, exact transcript references/ranges, injected history, image digests and transformation/retention boundaries.
- [ ] Observe failures before adding manifest/storage implementation.
- [ ] Track origin references at acceptance, not by rebuilt history index. Persisted text/tool payloads resolve from exact transcript event/part references; private reasoning metadata stays only in private sidecar. Small history-only messages are literal manifest entries; image data is re-read and digest-validated, never duplicated.
- [ ] Extend SessionStore's flush barrier and host append chain to publish only after referenced events persisted successfully. Track accepted parts explicitly so earlier flushed abandoned-attempt text cannot enter restored model history. Do not rewrite or lose the ordinary visible transcript.
- [ ] Atomic replace under serialized session writes, maximum 16 MiB. Before replacement/invalidation, advance generation/eligibility fence; an oversize/write/unlink failure cannot revive the older sidecar. Validate transcript revision/anchors, binding and prompt/tools/config identity on load. Discard malformed/stale/orphaned/incompatible state with only fixed non-sensitive reason codes.
- [ ] Implement local restore before ordinary fallback seeding. Cross-device/absent sidecars use ordinary reconstruction. Clear, deletion and binding changes synchronously fence outstanding publication; deletion cleans up private state.
- [ ] Keep request-only fit projections out of persistent manifests. Persistent prune descriptors reproduce retained tool content; successful summaries reference persisted compact-summary and exact retained suffix. Unsupported transformations explicitly invalidate rather than approximate.
- [ ] Pin crash windows before transcript flush, after flush/before publication, after publication; retry with already-flushed abandoned text then success/reopen; late writes after clear/delete/binding changes; oversized replacement with older sidecar; changed/missing images; compaction/prune/request-only fit; multiple assistant text parts and parallel results.
- [ ] Privacy sentinels: private metadata absent from transcript events, portable export, sync, chatsearch and ordinary bug logs. Inspect actual public readers/storage roots rather than only testing a serializer fixture.
- [ ] Run all affected targeted suites and typecheck. Reopen success is required; no narrowing to simple histories.

## Acceptance and documentation

- [ ] Update `youcoded/docs/native-runtime.md` and provider reference docs with implemented behavior, local summary command, privacy/storage limits, fallback semantics and measured CPU costs.
- [ ] Update existing workspace `docs/roadmap/native-harness.md` entries to reference this active work; do not close broader cloud/local work or mark unshipped changes shipped.
- [ ] Run `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/chatgpt-cache-efficiency/youcoded` from workspace and report all actual failures/warnings. No desktop completion claim before this.
- [ ] Obtain a fresh read-only independent review of the full diff and spec coverage; address findings and re-run affected tests. No concurrent mutation-based reviewer.
- [ ] Search both desktop and Android touched boundaries for cross-platform impact; no new IPC/shared UI is intended. Report checks actually performed.
- [ ] Offer the existing harness evaluator as optional, without running quota-consuming or paid calls. Offline correctness does not establish cache savings.

## Plan self-review

All spec sections map to the four stages above: diagnostics collection/storage/coverage (1), structured append-only statuses (2), SDK acceptance/isolation/sizing (3), accepted references/persistence barriers/generation/transformations/local reopen (4). Privacy, offline tests and independent verification are acceptance gates across all stages. The preserved revised design remains unchanged.
