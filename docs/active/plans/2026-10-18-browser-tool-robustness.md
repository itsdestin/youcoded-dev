---
status: active
work_item: 87
---
# Browser Tool Robustness Implementation Plan

> **For agentic workers:** Execute task-by-task with red/green tests and a final fresh review. No commits unless requested.

**Goal:** Make Browser tool calls unambiguous, descriptions usable, and recovery safe.

**Architecture:** Shared browser specs and preflight validation feed the existing worker runners. Session-local lifecycle state preserves serialization and completed handoffs; thin adapters remain unchanged in behavior.

**Tech Stack:** TypeScript, Zod 4, Vitest, Playwright fixture browser.

## Global Constraints

- Canonical spec: `docs/active/specs/2026-10-18-browser-tool-robustness.md`.
- Preserve browser-owned permission checks and untrusted result framing.
- No paid evaluation or live-app changes. Commits and merge/push were subsequently authorized by Destin for close-out.
- Keep provider policy changes out unless captured requests establish a need.

## Task 1 — Explicit contracts and descriptions

Files: `youcoded/desktop/src/main/assistant-browser/browser-tool-specs.ts`, a browser-local validation helper, `browser-tool-runners.ts` dispatch/preflight and navigation methods; `desktop/src/shared/{browser-types,harness-manifest,permission-types}.ts`; `desktop/src/renderer/components/browser/browser-tool-display.ts`; existing `assistant-browser.test.ts`, `BrowserPanel.test.tsx`, relay tests; `youcoded/docs/cc-dependencies.md`.

- [ ] Add failing tests for canonical navigation/history/zoom schemas and complete native/MCP schema parity. Reject URL+history before any service method is touched. Exercise invalid wait/act/tab combinations and preserve empty type, zero seconds, empty wait default.
- [ ] Run focused tests, confirming assertion failures rather than missing dependencies.
- [ ] Add BrowserHistory `{direction:'back'|'forward'}` and BrowserZoom `{zoom:25..100|'auto'}`; BrowserNavigate requires URL. Implement shared preflight validation returning normalized operation or corrective error. Permit documented unambiguous legacy calls only at runner boundary; validate URL before zoom mutation.
- [ ] Rewrite all tool/parameter descriptions and short descriptions. Explain prerequisites, defaults, invalid combinations and next steps without long duplicated operational prose. Update all name registries/permissions/labels and CC dependency inventory.
- [ ] Run focused browser/relay tests and types. Keep tests with the existing feature files.

## Task 2 — Cancellation, serialization and handoffs

Files: `desktop/src/main/assistant-browser/{browser-client,browser-service}.ts`; lifecycle cases in `desktop/tests/assistant-browser.test.ts`.

- [ ] Add regression tests using deferred promises/fake timers: already-aborted dispatch sends no call; queued abort/expiry returns promptly and never invokes callback; timed-out in-flight callback retains lock until it settles; another session still runs.
- [ ] Run the new tests red.
- [ ] Implement abort listener cleanup in client and abort-aware admission/result delivery in `withSession`, retaining the underlying barrier. Keep existing two-argument callers supported with optional lifecycle options.
- [ ] Add red tests for late done/cant handoff answer consumption keyed by message, changed pending messages and close/reset clearing receipt.
- [ ] Keep one terminal handoff result in session memory, consume once, and clear with session lifecycle. Do not queue human answers.
- [ ] Run lifecycle and existing browser tests green.

## Task 3 — Honest results, waits and continuation

Files: `desktop/src/main/assistant-browser/browser-tool-runners.ts`, optional browser-local result/cache helper, `browser-service.ts` only as needed; existing unit/live-browser tests.

- [ ] Add failing deterministic tests for cancellation during fill, fill success + Enter failure, navigation failure retaining current page context, condition-specific waits, and invalid/changed outline continuation.
- [ ] Check cancellation/deadline before every mutating stage and after asynchronous policy/setup. Report known completed stages and uncertain dispatched actions; do not blind-retry.
- [ ] Correlate AskUser repeat calls with stored terminal result. Reject changed message while a handoff is pending. Preserve read/close escape paths.
- [ ] Define waits over any visible text match, reject blank conditions and retain default sleep. Use condition-specific timeout results, remove abort listeners on settled sleeps.
- [ ] Cache bounded snapshots for continuation keyed by active page/document, reject absent/out-of-range continuation, invalidate on browser mutations. Keep current refs usable and page text framed.
- [ ] Run deterministic tests and isolated fixture browser tests green, including select labels as documented by installed Playwright.

## Task 4 — Review and full verification

- [ ] Inspect captured outgoing tool definitions using existing mocked provider tests if feasible, pin Browser schemas without speculative global strictness changes.
- [ ] Run a fresh code reviewer over the whole diff and address supported findings.
- [ ] Run `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/87-browser-tool-robustness/youcoded` and fix failures within scope.
- [ ] Record exact passed/failed/skipped checks, actual coverage limitations, and leave changes uncommitted. Offer capped real-model evaluation separately.

## Baseline

Restored only this worktree's dependencies after removing its hardlink farm. Four browser/adapter suites: 53 passed. Isolated fixture browser suite: 22 passed. No application source edits at baseline.
