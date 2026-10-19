---
status: shipped
work_item: 87
---
# Browser Tool Robustness Implementation Plan

> **For agentic workers:** Execute task-by-task with red/green tests and a final fresh review. No commits unless requested.

**Goal:** Make Browser tool calls unambiguous, descriptions usable, and recovery safe.

**Architecture:** Shared browser specs and preflight validation feed the existing worker runners. Session-local lifecycle state preserves serialization and completed handoffs; thin adapters remain unchanged in behavior.

**Tech Stack:** TypeScript, Zod 4, Vitest, Playwright fixture browser.

## Global Constraints

- Canonical spec: `docs/archive/specs/2026-10-18-browser-tool-robustness.md`.
- Preserve browser-owned permission checks and untrusted result framing.
- No paid evaluation or live-app changes. Commits and merge/push were subsequently authorized by Destin for close-out.
- Keep provider policy changes out unless captured requests establish a need.

## Task 1 — Explicit contracts and descriptions

Files: `youcoded/desktop/src/main/assistant-browser/browser-tool-specs.ts`, a browser-local validation helper, `browser-tool-runners.ts` dispatch/preflight and navigation methods; `desktop/src/shared/{browser-types,harness-manifest,permission-types}.ts`; `desktop/src/renderer/components/browser/browser-tool-display.ts`; existing `assistant-browser.test.ts`, `BrowserPanel.test.tsx`, relay tests; `youcoded/docs/cc-dependencies.md`.

- [x] Add failing tests for canonical navigation/history/zoom schemas and complete native/MCP schema parity. Reject URL+history before any service method is touched. Exercise invalid wait/act/tab combinations and preserve empty type, zero seconds, empty wait default.
- [x] Run focused tests, confirming assertion failures rather than missing dependencies.
- [x] Add BrowserHistory `{direction:'back'|'forward'}` and BrowserZoom `{zoom:25..100|'auto'}`; BrowserNavigate requires URL. Implement shared preflight validation returning normalized operation or corrective error. Permit documented unambiguous legacy calls only at runner boundary; validate URL before zoom mutation.
- [x] Rewrite all tool/parameter descriptions and short descriptions. Explain prerequisites, defaults, invalid combinations and next steps without long duplicated operational prose. Update all name registries/permissions/labels and CC dependency inventory.
- [x] Run focused browser/relay tests and types. Keep tests with the existing feature files.

## Task 2 — Cancellation, serialization and handoffs

Files: `desktop/src/main/assistant-browser/{browser-client,browser-service}.ts`; lifecycle cases in `desktop/tests/assistant-browser.test.ts`.

- [x] Add regression tests using deferred promises/fake timers: already-aborted dispatch sends no call; queued abort/expiry returns promptly and never invokes callback; timed-out in-flight callback retains lock until it settles; another session still runs.
- [x] Run the new tests red.
- [x] Implement abort listener cleanup in client and abort-aware admission/result delivery in `withSession`, retaining the underlying barrier. Keep existing two-argument callers supported with optional lifecycle options.
- [x] Add red tests for late done/cant handoff answer consumption keyed by message, changed pending messages and close/reset clearing receipt.
- [x] Keep one terminal handoff result in session memory, consume once, and clear with session lifecycle. Do not queue human answers.
- [x] Run lifecycle and existing browser tests green.

## Task 3 — Honest results, waits and continuation

Files: `desktop/src/main/assistant-browser/browser-tool-runners.ts`, optional browser-local result/cache helper, `browser-service.ts` only as needed; existing unit/live-browser tests.

- [x] Add failing deterministic tests for cancellation during fill, fill success + Enter failure, navigation failure retaining current page context, condition-specific waits, and invalid/changed outline continuation.
- [x] Check cancellation/deadline before every mutating stage and after asynchronous policy/setup. Report known completed stages and uncertain dispatched actions; do not blind-retry.
- [x] Correlate AskUser repeat calls with stored terminal result. Reject changed message while a handoff is pending. Preserve read/close escape paths.
- [x] Define waits over any visible text match, reject blank conditions and retain default sleep. Use condition-specific timeout results, remove abort listeners on settled sleeps.
- [x] Cache bounded snapshots for continuation keyed by active page/document, reject absent/out-of-range continuation, invalidate on browser mutations. Keep current refs usable and page text framed.
- [x] Run deterministic tests and isolated fixture browser tests green, including select labels as documented by installed Playwright.

## Task 4 — Review and full verification

- [x] Inspect captured outgoing tool definitions using existing mocked provider tests if feasible, pin Browser schemas without speculative global strictness changes.
- [x] Run a fresh code reviewer over the whole diff and address supported findings.
- [x] Run `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/87-browser-tool-robustness/youcoded` and fix failures within scope.
- [x] Record exact passed/failed/skipped checks and actual coverage limitations. Initially leave changes uncommitted; Destin subsequently authorized commit/merge/push and close-out. Offer capped real-model evaluation separately.

## Baseline

Restored only this worktree's dependencies after removing its hardlink farm. Four browser/adapter suites: 53 passed. Isolated fixture browser suite: 22 passed. No application source edits at baseline.

## Verification and review outcome

- Final focused browser/native/MCP/host/live/Panel/provider suites: **233 passed**, no skipped cases. Real Chromium used isolated temporary fixture profiles, not the running app.
- Independent proposal and task reviews caught and resolved relay falsy-input coercion, explicit-Stop restoration restart, and no-waiter handoff-close restoration. Red/green regressions cover each; the final narrow safety re-review passed with no blockers.
- Current-master integration: `bash scripts/verify.sh <app-worktree>` passed in the ordinary environment, **6,318 tests passed / 36 skipped**, types, knip, both lints, invariants, screen-opening checks and journeys. An earlier native-shell askpass test failure no longer reproduces after integrating master's test-isolation correction; no browser source workaround was added.
- Captured actual SDK request bodies with mocked fetch for ChatGPT Codex and official, direct OpenAI Responses, and OpenAI-compatible Chat Completions. These prove schema transport, not live-provider acceptance.
- Redacted Gitleaks scanned unpublished app commits and scoped workspace changes with no leaks. Documentation anchor audit passed; unrelated pre-existing warning inventory was not expanded into this task.
- No paid model evaluation, native Android browser support, macOS/Windows browser hand-test, app release, installed-app restart or live configuration change. Browser remains desktop-only. Existing uploads/phone/tab follow-ups on #87 remain open.
- App merged to remote master: [youcoded#643](https://github.com/itsdestin/youcoded/pull/643), `bf695cfbdd72f1db44b5742b5d4d4f13b541bf95`. Required Linux desktop build and Android build passed; Windows/macOS were skipped by PR policy. No release tag or installed-app change.
