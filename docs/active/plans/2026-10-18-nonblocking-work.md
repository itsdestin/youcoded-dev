---
status: active
---
# Nonblocking comparisons and search indexing

User authorization: after the measured comparison block and indexing audit, Destin asked to proceed as we see fit to prevent freezes. Keep the reviewed viewer lifecycle patch intact. These fixes prevent confirmed blocking classes; they do not establish the cause of the original JPEG incident.

## Design decisions

Use separate workers for CPU-heavy/file-heavy jobs. Merely adding `async` or a timer does not remove blocking work. Truncating comparisons would sacrifice information; returning a coarse delete-all/add-all comparison would change the result. Preserve exact existing output instead.

Two independent units:

1. Renderer comparisons: keep tiny, bounded comparisons synchronous; run large fallback comparisons in a browser worker. Existing structured patches still bypass comparison. While a large comparison is pending, use the existing LoadingState primitive in the diff area, never hold up the rest of chat. A failed computation uses existing ErrorState with retry. No new controls or changes to completed diff layout.
2. Search indexing: run the complete production refresh cycle in a Node worker, including transcript path checks, parsing, metadata building and writes. The main process sends roots and small configuration, not transcript bytes. Preserve the existing index format, lane/path gates, atomic writes, cross-process build lock, debounce, single-flight scheduling and pending-rerun behavior. No new UI or IPC channel.

Workers must be bounded and owned: no worker per visible card/conversation; no stale replies delivered to replaced consumers; stop cancels queued work and prevents reruns. Never fall back to the blocking implementation on the UI/main thread after a worker failure.

## Search-index task

Primary files: `youcoded/desktop/src/main/chatsearch-index/index-service.ts`, a dedicated worker/runner under the same directory, and existing `chatsearch-index-*` tests. Use existing conversation-store IO APIs to load records off-thread rather than reimplementing record parsing. Main reads only existing store/tag-root references; it must not enumerate records or tags, resolve transcripts, or clone full collections. Worker takes explicit `homeRoot` and `storeRoot`; tests use temporary directories exclusively.

- [x] Synthetic legacy full-cycle probe: 1600 histories / 96000 turns, 436.6 ms cycle and 421.7 ms max heartbeat gap (4 heartbeats during work).
- [x] Production worker scheduling regressions were red before implementation (no worker spawned); 12 lifecycle cases now cover coalescing, pending rerun, success-before-exit, stop, stale messages, restart, timeout, construction/error paths and unresolved termination. 210 related tests passed across 8 files.
- [x] Core/output parity checked for both lanes, malformed refs, missing/unchanged/growing/shrunk histories, removed transcripts, interrupted append repair, shared-lock refusal and empty-store protection. Symlink exclusion exercised on Linux.
- [x] Dedicated Node worker loads records using existing store IO, resolves paths, indexes and writes metadata. Main sends only home/store/tag-registry roots; tag enumeration and conflict folding also run in the worker. 120s ceiling, stop settles caller immediately, no replacement until actual exit, no synchronous fallback. Abandoned locks are not deleted by runner; existing stale-lock recovery retained.
- [x] Final real probes include folded/conflicting/corrupt tag files, absent/unreadable registry behavior, and nonempty originalPath local-first/synced-fallback cases in BOTH lanes. System Node: legacy 440.2 ms total / 426.0 ms max heartbeat gap; worker 472.0 ms / 5.4 ms. Electron 41.10.7 / Node 24.18.0 with worker inside fresh ASAR: legacy 566.0 ms / 435.1 ms gap; worker 540.4 ms / 29.8 ms gap. All parity checks and clean exits passed. Temporary HOME/userData, no user indexes; the isolation wrapper reported a nonfatal inaccessible /proc environment during cleanup. `build:main`, types, lint and knip passed.

## Comparison task

Primary files: `youcoded/desktop/src/renderer/components/diff/UnifiedDiff.tsx`, extracted pure row computation, browser worker plus a bounded runner/hook, and existing unified-diff tests.

- [x] Preserved pure row/EOF-newline/line-number/hunk tests. New render regression failed before implementation because `diffLines` was called during render; stale-job case also failed before workers existed.
- [x] Small fast path bounded by 32768 combined UTF-16 code units and 200 combined lines. Large one-line text uses worker too.
- [x] Shared exact row calculation in `diff-rows.ts`; one active browser worker per window through `diff-jobs.ts`, with cancellation, queue removal, stale-message guard and 60s resource-policy ceiling. No synchronous failure fallback.
- [x] Queue/cancellation/unmount/retry/error/timeout/constructor tests pass. Hidden-chat regression was first red (worker not terminated), then green; pending work stops on hide via existing OnScreenContext and completed results are retained. 22 diff tests passed, including a red/green EOF-newline gutter-width preservation case; 110 tool-body/context-popup/ActiveArtifactView consumer tests also passed.
- [x] Preview slicing, expand-all and fill tests preserved; precomputed structured patches bypass worker.
- [x] Isolated Electron before/after with identical 10000 unrelated lines: legacy renderer computation 11685.5 ms, typing round trip 11693 ms, max frame gap 11682.2 ms. Worker result completed in 11149.6 ms, typing 47 ms while work was still pending, button click succeeded before completion, max frame gap 22.2 ms and max recorded input delay 0.5 ms. All 20000 result rows retained, 15 preview rows shown, Show 19985 more lines. The long-task observer reported zero even for the baseline block, so its negative is not evidence; frame/input measurements establish the difference. Pictures were taken outside measured windows and inspected. Test app stopped.
- [x] Production `build:web` emitted an 8.67 KB `diff.worker-*.js` asset; executed that built asset in the isolated browser and verified exact ctx/del/add rows. Build passed with CSS-optimizer and bundle-size warnings; no claim of Android-device runtime verification.

## Acceptance

- [x] Fresh independent review: comparison pipeline approved with no blocking findings. Minor EOF line-count boundary was reproduced red and corrected; 22 diff tests remain green. Indexing review found tag-registry.list still doing synchronous reads on main; fixed with roots-only dispatch and actual tag-file/parity fixtures (red/green production regression). Indexing re-review approved the correction with no remaining concrete findings.
- [x] `bash scripts/verify.sh` passed all gates: source/test types, 5306 tests passed (36 skipped, 248 files passed/1 skipped), knip, lint/design lint, ast-grep, screen openings and journeys. Log directory `scratch/verify-20261018-134611-2976936`. This is the required related-test verification, not a claim that every repository test was run.
- [x] Complete real worker build/runtime checks, including Electron/ASAR. Browser production worker asset execution passed over HTTP and as a file URL inside a fresh ASAR in sandboxed Electron (no Node integration); exact rows verified, private fixture removed. Node indexing worker also passed its fresh-ASAR proof. Android backend build succeeded and generated backend.tgz contains index-worker.js and index-worker-runner.js. Full Gradle test task stopped before tests at the runtime redistribution gate because apk version comparison tooling is unavailable. Separately `:app:testDebugUnitTest -x bundleWebUi -x buildBackend -x buildRuntimeDebug` passed: 36 tests in 2 XML suites, no failures/errors/skips. This does not verify APK packaging or execution on a phone.
- [x] Investigation and existing work cards #93/#110 updated with measurements and limits. Original JPEG incident remains unconfirmed; hardware-probe and large-path-list audit leads are not fixed by this work. All test windows stopped; disposable reproduction checkout and private copied history removed, evidence retained. Implementation remains local and uncommitted; only work-card notes used their normal master-saving workflow. Other sessions' local-only branches/worktrees were left untouched. The close-out script's unchanged-base false-landed verdict was recorded on existing #22, not followed.
