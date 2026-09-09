---
status: active
stage: 3
updated: 2026-09-09
---
# Cache Stage 3 implementation report

## Review fixes active

Implemented SDK-native, in-memory OpenAI Responses continuation through `HarnessSession`. Stage 3 review fixes now cover credential-generation/account fencing, measured/incomplete sizing pressure, and expanded parallel-tool metadata. This stage does not persist continuation; Stage 4 durability remains next.

## Implementation

- `youcoded/desktop/src/main/harness/openai-continuation.ts`
  - Typed allowlisted adapter accepts completed SDK assistant messages only.
  - Retains ordered reasoning, text and tool-call parts plus only converter-supported OpenAI fields: item IDs, text phase, encrypted reasoning, and validated parallel-call metadata.
  - Rejects SDK tool messages and unknown provider fields.
  - Associates compatible models with provider/model/non-secret-account identity through a private `WeakMap`.
  - Associates accepted reasoning with private, non-enumerable per-step sizing data, excluding ciphertext/provider metadata from chars/4 sizing and distinguishing unknown reasoning usage from zero.
- `youcoded/desktop/src/main/harness/harness-session.ts`
  - Reads `response.messages` only after full iteration and the interrupt guard.
  - Adds completed allowlisted assistant messages to internal `StepResult` and commits them only on an accepted nonempty step.
  - Preserves existing reasoning-only/whitespace empty retry behavior.
  - Interrupted attempts retain visible partial text only; no incomplete reasoning or dangling calls are committed.
  - Existing locally-owned tool-result insertion remains the sole tool-result source.
  - Strips incompatible continuation on explicit model changes and on factory-observed account identity changes before the next request.
- `youcoded/desktop/src/main/providers/provider-registry.ts`
  - Stamps ChatGPT model handles with provider/model and SHA-256 account fingerprint; no account identifier enters public bindings, diagnostics or transcript events.
- `youcoded/desktop/src/main/harness/message-size.ts`
  - Uses private per-step reasoning sizing when present, rather than recursively counting encrypted payload bytes/IDs/provider metadata.
- `youcoded/desktop/tests/openai-continuation.test.ts`
  - Drives `HarnessSession` through actual `ai@7` + `@ai-sdk/openai` Responses conversion and middleware using injected fake SSE fetch; captures and asserts the next serialized wire body.

No UI, IPC, transcript-event, production/config, persistence, quota, model-call or commit changes were made for Stage 3. Existing Stage 1 diagnostics and Stage 2 status edits were preserved.

## SDK evidence

Branch-local command:

```text
cd youcoded/desktop && node -e "console.log(require('./node_modules/ai/package.json').version, require('./node_modules/@ai-sdk/openai/package.json').version)"
```

Actual output:

```text
7.0.89 4.0.55
```

Fixtures use concrete pinned-SDK event names from `node_modules/@ai-sdk/openai/src/responses/openai-responses-api.ts`: `response.output_item.added`, `response.reasoning_summary_part.added`, `response.reasoning_summary_text.delta`, `response.reasoning_summary_part.done`, `response.output_text.delta`, `response.output_item.done`, and `response.completed`. The test uses `commentary` / `final_answer` phases.

## Test-first red evidence

Command run before implementation:

```text
cd youcoded/desktop && npx vitest run tests/openai-continuation.test.ts
```

Actual result:

```text
FAIL tests/openai-continuation.test.ts
Error: Cannot find module '../src/main/harness/openai-continuation'
Test Files 1 failed (1)
Tests no tests
exit 1
```

This observed red proved the required implementation seam did not yet exist.

## Passing evidence

Focused Stage 3 contract after implementation:

```text
cd youcoded/desktop && npx vitest run tests/openai-continuation.test.ts
```

Actual result after the complete contract was added:

```text
PASS tests/openai-continuation.test.ts (6 tests)
Test Files 1 passed (1)
Tests 6 passed (6)
exit 0
```

The six contracts pin:

1. actual SDK fake-stream next-wire encrypted reasoning, commentary/final phases, provider item IDs, ordered parts, two local tool calls and exactly two local results;
2. reasoning-only completed empty-step retry and non-commit semantics;
3. interrupt semantics: visible partial retained, incomplete reasoning/ciphertext excluded;
4. account refresh/switch isolation without `setBinding`, while ordinary visible text survives;
5. typed unknown-field exclusion and ciphertext-aware reported-token sizing feeding compaction;
6. explicit incomplete unknown-reasoning estimate with visible-summary fallback.

Final type + related suite command:

```text
cd youcoded/desktop && npx tsc --noEmit && npx vitest run tests/openai-continuation.test.ts tests/message-size.test.ts tests/compaction.test.ts tests/harness-compaction.test.ts tests/harness-session-loop.test.ts tests/harness-session.test.ts tests/harness-sdk-toolcall-contract.test.ts tests/provider-registry.test.ts tests/wire-adapter.test.ts
```

Actual result:

```text
tsc --noEmit: exit 0
Test Files 9 passed (9)
Tests 206 passed (206)
exit 0
```

Expected stderr from existing failure-path fixtures remained visible: the compaction fail-safe summary exception, two harness provider-error fixtures, and transient retry fixture. Those suites passed.

Required desktop verifier:

```text
cd /home/destin/youcoded-dev/worktrees/sessions/chatgpt-cache-efficiency && bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/chatgpt-cache-efficiency/youcoded
```

Actual output:

```text
PASS types (tsc --noEmit)
PASS types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS tests (related)
PASS dead code (knip)
PASS lint (eslint)
PASS invariants (ast-grep)
OK — all checks passed.
Not covered: Android (./gradlew test), marketplace worker.
```

Android and worker were outside this desktop-only Stage 3 scope.

## Stage 4 durability coordination

Stage 4 must not serialize the private symbol/WeakMap association used here. It needs an explicit durable sidecar/manifest representation for:

- provider ID, model ID and non-secret account fingerprint binding;
- each accepted step's allowlisted assistant continuation parts;
- per-step reported reasoning token count or explicit `incomplete: true` when unavailable;
- provenance/origin references mapping completed SDK item IDs/tool-call IDs to persisted transcript anchors and validated ranges, as specified in `2026-09-09-cache-integration-seams.md`.

The in-memory adapter deliberately exposes no public transcript or IPC metadata. A durable implementation should add internal SessionStore-side origin/metadata APIs rather than broadening transcript event shapes. It must preserve non-enumerable sizing semantics across reconstruction and invalidate ambiguous/mismatched origin mappings instead of guessing.

No SDK-required continuation field was found blocked in this stage. Parallel-call provider metadata is validated and retained. The actual expanded-wrapper fixture proves the pinned SDK's `store:false`, no-`previousResponseId` wire behavior: validated child calls and their locally owned results remain exactly paired rather than being misrepresented as two ordinary independent calls.

## Review findings disposition (2026-09-09)

1. **Credential/account isolation — fixed.** Binding identity includes provider, model, hashed account and auth generation. Harness checks it at model creation, every dispatch and response acceptance. The registry also binds each model fetch closure to the exact account/generation present at construction. After SDK serialization and token resolution, `ChatGptAuth` compares that expected owner immediately before every real send and 401 resend; mismatch refuses before network rather than rewriting the request for a new account. Thus the check-to-fetch async gap cannot send account A continuation using account B credentials or headers.
2. **Incomplete reasoning sizing — fixed.** Unknown reasoning remains explicitly incomplete; first-step compaction uses retained measured context occupancy when available and otherwise conservatively sizes visible reasoning. Tests assert actual none/summarize decisions and large-ciphertext behavior.
3. **Expanded parallel tools — fixed.** The adapter preserves only validated SDK wrapper metadata across completed assistant calls and local results. The fake Responses wrapper test pins the actual next-wire child call/result round trip.

Focused final command:

```text
cd youcoded/desktop && npx vitest run tests/chatgpt-auth.test.ts tests/provider-registry.test.ts tests/openai-continuation.test.ts && npx tsc --noEmit
```

Actual result:

```text
PASS tests/provider-registry.test.ts (39 tests)
PASS tests/openai-continuation.test.ts (8 tests)
PASS tests/chatgpt-auth.test.ts (45 tests)
Test Files 3 passed (3)
Tests 92 passed (92)
tsc --noEmit: exit 0
```

The final race test was first observed red: a stale expected owner reached the fake network and resolved 200 instead of rejecting (`1 failed`, exit 1). After binding the fetch closure, the final command above passed. The direct auth test proves stale expected identity causes zero Responses network calls; registry coverage proves normal bound requests still carry the intended account/token; the continuation suite retains dispatch and acceptance fencing. An earlier focused review-fix run also passed 52/52 auth/continuation tests followed by `tsc --noEmit` exit 0. No live app, production settings, IPC, model calls, Stage 4 manifest, or commit was touched.
