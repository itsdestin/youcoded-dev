---
status: active
date: 2026-09-09
---
# ChatGPT cache diagnostics — Stage 1 implementation report

## Status and boundaries

Stage 1 implementation is integrated and desktop verification passes. Independent
review/spec acceptance is still required; this report does not approve later stages.
No commits, production app/config access, paid evaluations, or real model calls were
made. No status snapshot, continuation, transcript, IPC or renderer behavior was
intentionally changed. Dependencies report ai 7.0.89 and @ai-sdk/openai 4.0.55.

## Implementation

- `chatgpt-request-diagnostics.ts` owns async-local request context, per-process HMAC,
  exact serialized ordered item comparison, dispatch sequence/baseline references,
  newer-dispatch-only successful reference advancement, bounded fingerprint state,
  unfinished observations, expiry, sanitized queue, private rotating writer and loss
  counters. Fingerprints never leave memory. New processes start new baselines.
- Auth observes each actual `realFetch` send, not token refresh/model/usage polls.
  It passes only serialized body/context to the observer, never headers. A 401 retry
  has a new attempt ID and parent reference within the same logical step. Bytes stay
  identical. HTTP failure and network/abort outcomes are recorded without errors.
- Middleware enables the SDK's raw chunks, reduces completed raw usage before
  normalized cache defaults obscure absence, and strips raw chunks from the outward
  stream. No HTTP clone/tee or diagnostic response queue. The diagnostic wrapper
  uses consumer-driven pulls with a zero high-water mark.
- Harness logical steps are allocated OUTSIDE `withRetry`; specialists have their
  own session/purpose lanes, summaries have separate purpose lanes. Title feeder
  scopes its whole generation; unscoped generate middleware also defaults to title.
- Registry lazily owns diagnostics in `<userData>/private-diagnostics/chatgpt-cache`.
  Path lookup/storage failures are nonfatal. Session cache-key strategy is unchanged.
- CLI reads explicit diagnostic files only (maximum 5 MiB each), rejects extra
  top-level fields, validates grouping fields/enums, and reconstructs output from
  known aggregates. It never reads transcripts or echoes rejected input/errors.
  Weighted reuse and fresh input use only successful valid-cache requests. Overall
  tokens, known-input/request coverage, changes, outcomes and durations are separate.

## Changed files

App-relative:

- `desktop/src/main/providers/chatgpt-request-diagnostics.ts` (new)
- `desktop/src/main/providers/chatgpt-auth.ts`
- `desktop/src/main/providers/chatgpt-model.ts`
- `desktop/src/main/providers/provider-registry.ts`
- `desktop/src/main/harness/harness-session.ts`
- `desktop/src/main/native-title-feeder.ts`
- `desktop/scripts/chatgpt-cache-summary.mjs` (new)
- `desktop/tests/chatgpt-request-diagnostics.test.ts` (new)
- `desktop/tests/chatgpt-cache-summary.test.ts` (new)
- `desktop/tests/chatgpt-auth.test.ts`
- `desktop/tests/chatgpt-model.test.ts`
- `docs/native-runtime.md`
- `docs/provider-dependencies.md`

Workspace: this report. Existing plan/spec were not marked complete.

## Red-first evidence

From `youcoded/desktop`:

```text
./node_modules/.bin/vitest run tests/chatgpt-request-diagnostics.test.ts
exit=1
FAIL tests/chatgpt-request-diagnostics.test.ts
Error: Cannot find module '../src/main/providers/chatgpt-request-diagnostics'
Test Files 1 failed (1)
Tests no tests
```

Full captured output: `/tmp/cache-stage1-red.txt`. This was run before creating the
implementation module. The CLI was also tested before implementation:

```text
./node_modules/.bin/vitest run tests/chatgpt-cache-summary.test.ts
exit=1
Error: Cannot find module '.../desktop/scripts/chatgpt-cache-summary.mjs'
tests/chatgpt-cache-summary.test.ts (1 test | 1 failed)
```

Full output: `/tmp/cache-summary-red.txt`. Later integration/edge tests were added
against the implementation; there was not a separate mutation-red run for every
individual edge test. Initial typecheck caught PromiseLike vs Promise in the SDK
middleware signature; it was corrected to the SDK's typed PromiseLike result.
First combined verify caught `no-return-assign` in registry initialization; fixed
by moving lazy initialization outside the return expression.

## Passing targeted evidence

```text
./node_modules/.bin/vitest run tests/chatgpt-request-diagnostics.test.ts tests/chatgpt-cache-summary.test.ts tests/chatgpt-auth.test.ts tests/chatgpt-model.test.ts tests/provider-registry.test.ts tests/native-title-feeder.test.ts
exit=0
✓ tests/chatgpt-model.test.ts (7 tests)
✓ tests/chatgpt-cache-summary.test.ts (1 test)
✓ tests/native-title-feeder.test.ts (7 tests)
✓ tests/provider-registry.test.ts (39 tests)
✓ tests/chatgpt-auth.test.ts (44 tests)
✓ tests/chatgpt-request-diagnostics.test.ts (7 tests)
Test Files 6 passed (6)
Tests 105 passed (105)
```

Full output: `/tmp/cache-stage1-final-targeted.txt`. This preceded the final explicit
unscoped-title fallback; the final combined verification below includes that edit.
Targeted tests cover ordered appends/edits/removals, serialized whitespace changes,
component changes, lane isolation, out-of-order success, fresh-process baselines,
missing versus zero usage, invalid counts, privacy sentinels, queue saturation with
a deferred writer, writer rejection, fingerprint pressure/oversize drop, unfinished
capacity/expiry, actual file rotation/permissions, 401 parentage and unchanged bytes,
fake SSE through the installed SDK/auth boundary, demand-driven observation and
consumer cancellation, and valid-subset weighted CLI arithmetic.

```text
./node_modules/.bin/tsc --noEmit
exit=0
(no output)
```

Captured in `/tmp/cache-stage1-types3.txt` (and independently in final verify).

## Final combined verification

From workspace root:

```text
bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/chatgpt-cache-efficiency/youcoded
verify=0
verify: /home/destin/youcoded-dev/worktrees/sessions/chatgpt-cache-efficiency/youcoded (base origin/master)
  tests: related to 11 changed file(s) + 44 source-scanning guards
PASS types (tsc --noEmit)
PASS types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS tests (related)
PASS dead code (knip)
PASS lint (eslint)
PASS invariants (ast-grep)
OK — all checks passed.
Not covered: Android (./gradlew test), marketplace worker.
```

Captured `/tmp/cache-stage1-verify-final.txt`. `git -C youcoded diff --check`
returned 0 with no output. Source integration diff was read back from
`/tmp/cache-stage1-diff.txt`; final title fallback was subsequently verified.
Vite reports the existing CommonJS/ESM configLoader compatibility warning.

Version command:

```text
node -p "JSON.stringify({ai:require('ai/package.json').version,openai:require('@ai-sdk/openai/package.json').version})"
{"ai":"7.0.89","openai":"4.0.55"}
```

## Actual CPU measurement

The diagnostics test uses `process.cpuUsage`, 20 dispatch+finish iterations for
identical synthetic bodies. No wall-clock assertion or live quota call:

| Body | Bytes | User CPU µs total | System CPU µs total | CPU ms/request |
|---|---:|---:|---:|---:|
| 1,000 items, roughly 100k-token-like text | 433,018 | 469,053 | 0 | 23.45265 |
| Same plus 4 MiB encrypted part | 4,627,366 | 997,056 | 2,991 | 50.00235 |

The text fixture is token-like, not tokenizer-measured. This includes parsing,
exact-value scanning, hashing and bookkeeping, not file flushing. Async writes do
not remove this synchronous CPU cost. These numbers are not a budget or cache
savings claim. A preceding run measured 18.02/49.63 ms respectively, so do not
interpret one run as a stable latency guarantee.

## Review concerns / remaining acceptance work

1. Obtain independent read-only review before accepting Stage 1. No reviewer tool
   was available to this specialist; parent should arrange it. Pay particular
   attention to exact-value scanner, loss-counter persistence and stream lifecycle.
2. CLI currently rejects unknown top-level fields and validates fields used in its
   summary, rather than fully validating every unused nested diagnostic field.
   It never forwards those nested fields. Review against the requested *strict*
   allowlisted-reader wording; strengthen if complete schema validation is required.
3. In-memory `fingerprintBytes` counts exact item Buffer storage plus a conservative
   per-lane 1,024-byte component/metadata allowance; it is not a measured total JS
   heap bound. Raw request parsing has transient allocations outside retained state.
4. Lane/retry placement is integrated and covered by existing harness related suites,
   but new specialized end-to-end tests do not yet explicitly force concurrent
   title/summary/specialist harness invocations or a harness retry and inspect every
   resulting logical ID. The auth retry and installed SDK path are directly pinned.
5. File failures cannot guarantee durable loss reporting while storage remains
   unwritable. Counters remain in memory; subsequent records expose cumulative loss.
   The injected writer test exercises drop behavior, not loss-only disk records.
6. Android was not compiled/run; no Android SDK is available per workspace guidance.
   Changed app paths are desktop main-process/tests/scripts/reference docs, with no
   shared UI or IPC edits. No Android parity feature is being claimed. Workspace
   verify explicitly excludes Android/Worker. No real cache-savings measurement.

No paid evaluator was run. The existing harness evaluator remains an optional
parent/user-approved follow-up, especially when later instruction/continuation
stages land; offline correctness does not establish real-world cache reuse gains.

## Independent-review fix pass (2026-09-09)

All three reported findings were confirmed against source before implementation.
The previous shallow-reader concern (item 2 above) is superseded by this fix.
No later-stage changes, commits, production access or real model calls occurred.

1. **Rejected SDK reader cleanup:** the catch previously errored the outward stream
   without releasing its underlying reader. Added a real rejected ReadableStream
   test that checks original error identity and `underlying.locked === false`.
   The catch now attempts cancellation, ignores the already-errored stream's
   cancellation rejection, and releases the lock before propagating the original
   error. Explicit consumer cancellation also releases the reader in finally.
2. **Drain ownership gap:** confirmed `schedule()` returns while `draining` remains
   set between coroutine completion and the awaiting finally. A deterministic test
   starts an empty flush, enqueues synchronously before the await continuation, then
   observes the next setImmediate turn (no timed sleep). Previously the row stayed
   queued. Finally now clears ownership and reschedules pending rows or unreported
   disk counters. The existing deferred blocked-writer saturation test still passes.
3. **Complete CLI schema:** every request field is now required and typed, with
   exact nested boolean component keys, opaque ID/UUID formats, nullable safe
   counts, count/cache consistency and prefix/category consistency. Loss records
   retain their separate strict schema. The fixture now supplies complete valid
   records and deletes each required field in turn, plus malformed sentinel IDs,
   nested flags, negative/string counts and impossible cache/prefix counts. Invalid
   rows are rejected without echoing sentinel contents.

### Red-first evidence (before source fixes)

```text
./node_modules/.bin/vitest run tests/chatgpt-model.test.ts tests/chatgpt-request-diagnostics.test.ts tests/chatgpt-cache-summary.test.ts
exit=1
FAIL summary: expected 6 to be 35
FAIL rejected reader: expected true to be false
FAIL drain gap: expected [] to have a length of 1 but got +0
Test Files 3 failed (3)
Tests 3 failed | 14 passed (17)
```

Full output: `/tmp/cache-review-red.txt`.

### Passing evidence after fixes

```text
./node_modules/.bin/vitest run tests/chatgpt-model.test.ts tests/chatgpt-request-diagnostics.test.ts tests/chatgpt-cache-summary.test.ts tests/chatgpt-auth.test.ts tests/provider-registry.test.ts
exit=0
Test Files 5 passed (5)
Tests 100 passed (100)

./node_modules/.bin/tsc --noEmit
exit=0
(no output)

bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/chatgpt-cache-efficiency/youcoded
verify=0
PASS types (tsc --noEmit)
PASS types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS tests (related)
PASS dead code (knip)
PASS lint (eslint)
PASS invariants (ast-grep)
OK — all checks passed.
Not covered: Android (./gradlew test), marketplace worker.

git -C youcoded diff --check
exit=0
(no output)
```

Full logs: `/tmp/cache-review-green.txt`, `/tmp/cache-review-types.txt`,
`/tmp/cache-review-verify.txt`. Source changes were read back after verification.
Changed in this fix pass: `chatgpt-model.ts`, `chatgpt-request-diagnostics.ts`,
`chatgpt-cache-summary.mjs`, their three test files, and this report.
The test counts are evidence of executed tests, not acceptance of the full spec.
**STOPPED/DONE: edits finished for this review pass; code is stable for review.**
