---
status: shipped
work-item: 7
---
# Stable conversation boundaries — implementation plan

> **For agentic workers:** Use test-driven execution task by task, with an independent review before completion. Implementation was initially local-only; Destin explicitly authorized merge/publication and session cleanup on 2026-10-20.

**Goal:** Keep compaction and related dividers at their recorded position through continued streaming, replay, and history loading, without changing the actual model conversation or interrupting tools.

**Architecture:** Separate the position of a visible boundary from the lifetime of a logical assistant turn. Successful transcript summaries are authoritative, replayable boundaries; temporary pending/failure notices are not context resets. Use stable event identity and source time, and correlate transient outcomes to the operation that started them.

**Tech Stack:** TypeScript, React shared renderer, existing session record and transcript pipeline, Vitest.

## Global constraints

- Existing divider appearance and expandable summaries stay unchanged.
- Do not call endTurn merely to place a divider or report a refused compaction.
- Preserve tool IDs/groups, permission state, retry semantics, turn billing, context-gauge bookkeeping, message search/copy, and timeline folding.
- Preserve pending user bubbles at the tail; all confirmed events precede them.
- Do not infer successful compaction from refusal, cancellation, watchdog expiry, or an unrelated transcript shrink.
- Native summary records retain their existing durable format; additive optional metadata must remain compatible with older records and transports.
- No paid model evaluations, live-app inspection, releases, or installation changes. Commit/merge/publication was separately authorized at close-out.

## Task 1: Boundary positioning and failed outcomes

**Files:** `youcoded/desktop/src/renderer/state/chat-reducer.ts`, `chat-types.ts`, boundary-related renderer helpers/components; tests in existing `chat-reducer.test.ts`, `archive-boundary.test.ts`, and surface suites.

- [x] Add regression sequences for text → automatic compact → more text/tools, repeated compactions in one logical turn, and model-switch during streaming. Assert visible order, preserved logical turn/tools, and exactly one final turn footer/bill.
- [x] Add a pending-send sequence where compact/model/clear notices arrive before confirmation; assert the same final confirmed order on sender and receiver.
- [x] Add refusal and cancellation sequences during a running turn; assert running/awaiting tools remain unchanged and findArchiveBoundary does not treat failure as summarization.
- [x] Run the new cases with the local Vitest binary and observe the intended assertion failures before implementation.
- [x] Implement stable presentation boundaries without ending the logical turn. Keep rendering shared between chat, buddy, and previews; preserve stable keys and folding/search/copy semantics.
- [x] Make duplicate pending starts idempotent and ensure terminal failure cleanup removes only its own spinner, not unrelated active work.
- [x] Run reducer, boundary, render, retry, ordering, and serialization tests.

## Task 2: Replayable successful summaries and source time

**Files:** `youcoded/desktop/src/renderer/state/transcript-event-actions.ts`, `transcript-page-actions.ts`, `transcript-batch.ts`, `chat-reducer.ts`; `youcoded/desktop/src/main/transcript-watcher.ts` if source-time preservation is needed; existing translator/page/fill tests.

- [x] Add history and fresh-screen sequences containing manual and automatic compact-summary records, including a page/live overlap. Assert one marker at the recorded location with original time and summary.
- [x] Add a late successful summary following a provisional timeout/refusal notice. Assert success is not suppressed merely because no spinner remains, and no duplicate context boundary is drawn.
- [x] Observe the intended failures, then make authoritative summary translation independent of screen-local pending state.
- [x] Preserve both bookkeeping and visible marker actions during page replay. Update deliberate golden-test departures explicitly rather than silently regenerating historical expectations.
- [x] Keep stable summary IDs across live/page paths; preserve native context gauge and billing deduplication.
- [x] Run translator, routing, page, fill, usage, and serialization suites.

## Task 3: Operation-safe host lifecycle

**Files:** `youcoded/desktop/src/main/harness/native-session-host.ts`, `youcoded/desktop/src/main/session-live.ts`, `session-record.ts`, `create-runtime.ts` as required; shared live event types; renderer transient-action translation and native slash outcome handling; existing host/live tests.

- [x] Test a second manual request refused while the first is running, stale end/cancel after a newer start, and a newly joined screen during compaction.
- [x] Observe intended failures before changing host behavior.
- [x] Refuse busy native requests without publishing a fake compaction lifecycle; keep request refusal copy on the requesting screen.
- [x] Carry operation identity on start/end/cancel and match terminal transient actions against the current operation. Preserve the original start time on duplicate starts and fresh-screen fill.
- [x] Ensure success remains file-authoritative; do not make it depend on a transient operation ID that older transcripts never recorded.
- [x] Run host, session-live, record, two-screen, protocol parity, and native compact suites.

## Task 4: Verification and before/after review

- [x] Run `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/7-compaction-boundaries/youcoded` and address failures within the authorized scope.
- [x] Check Android SDK/JDK availability and report Android verification accurately; shared TypeScript logic is checked by desktop suites, not a substitute for an Android build.
- [x] Run a fresh read-only code review for behavior regressions and address accepted findings, adding failing regression tests first.
- [x] Exercise reproducible practice events through the real renderer; inspect compact success, continued streaming, retained-tail fading, pending sends, and failed compaction. Capture before/after at desktop and narrow width using isolated tools.
- [x] Build a before/after review deck, preview it, inspect its contact sheet, then serve it without opening anything for the user.
- [x] Report exact verification outcomes, known limits, and uncommitted worktree location. Leave shipping decisions to Destin.

## Review notes

The user approved the combined behavioral scope and the shorter bug-fix route (regression tests, implementation, independent code review, before/after UI review). Technical design and independent reviews completed; accepted findings were reproduced and fixed. Logical turns remain intact, with source-positioned presentation references and exact page-source witnesses. Final review found no remaining concrete issues. Destin approved the outcome in chat on 2026-10-20, then explicitly authorized merge and close-out. Installation and release remain outside this authorization.

## Final evidence and remaining boundary

- Required `verify.sh` passed every desktop gate: 7,730 tests passed, 36 skipped; 340 test files passed, one skipped. Logs: `scratch/verify-20261020-062315-951834/`.
- Real-renderer assertions passed ordering, summary expansion, and control fit in Light, Midnight, Halftone Dimension, and at 390px width; no console errors. Before/after review was previewed and inspected; spec: `docs/archive/design/2026-10-19-compaction-boundaries/compaction-review.json`.
- Android backend compiled; 36 debug JVM tests passed, with XML results under the app worktree's `app/build/test-results/testDebugUnitTest/`. Full packaging attempt failed at the existing runtime redistribution gate requiring an apk-version command. JVM tests were subsequently run with `-x buildRuntimeDebug`; no APK/device-runtime claim.
- App PR #661 merged and pushed as `2cbea256388667b304b8704b8bf47fe09b5ae48c` on 2026-10-20. Its tree exactly matches the verified published head `b91daa04952ff2a2c9793d5f8a2f4cbdd4078e35`. GitHub run 39437693807 passed all four Linux test shards, the protected build/evidence gate, AppImage/deb/rpm/pacman packages, Android JVM, and debug/releaseTest APKs. Fresh local verification also passed every gate immediately before publication.
- Original referenced review pictures and chat approval are retained under `docs/archive/design/2026-10-19-compaction-boundaries/`; private verification logs are preserved at `~/.cache/youcoded-compaction-boundaries-closeout/` before worktree cleanup. The broader #7 card remains open for its unrelated requests; this repair is complete.
- Windows/macOS execution, device-runtime validation, a release tag, and installed-app changes were not performed.
