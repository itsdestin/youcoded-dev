# Comment Journey Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

status: active

**Goal:** Make the existing comment-popup-reading journey synchronize with startup chat scrolling without changing production behavior or losing assertions.

**Architecture:** Add a bounded, explicit test-runner readiness operation scoped to the visible chat scroller. Observe scroll activity and relevant geometry, resetting the stability window when that scroller changes; do not substitute a fixed sleep or page-wide quiet period. Keep the journey's right-click, Add comment lookup and New comment textbox assertions unchanged.

**Tech Stack:** Node test runner, existing isolated photo-renderer/CDP helpers, browser DOM events.

## Global Constraints

- Destin approved the test-only direction through the Fix scope question on 2026-10-19. Production menu dismissal changes are outside this approval.
- No interaction with the built app; use only the existing photo-only renderer and saved journey tooling.
- Preserve all fixtures, assertions, platform selection, CPU budgets and existing timeout limits. No paid runs or merges.
- A quiet observation interval is an event-reset stability condition, not an unconditional delay; bound the entire wait and report why readiness failed.
- Scope to the relevant visible chat scroller; unrelated/background scrollers must not extend the wait or satisfy it.
- Clean up listeners, observers and timers on success, timeout and error; a missing scroller must fail rather than silently succeed.

## Task 1: Explicit scoped scroll readiness

**Files:**
- Modify: `scripts/shoot/driver.mjs` (operation dispatch and readable step description).
- Modify: `scripts/shoot/tests/driver.test.mjs` (existing driver regression home).
- Modify: `youcoded/desktop/tests/journeys/comment-popup-reading.json` (insert readiness before right-click).
- Modify: `scripts/shoot/README.md` only if needed to document the new operation.
- A focused helper/test under `scripts/shoot/` is allowed if browser observation cannot remain small in driver.mjs.

**Interface:** The saved journey gains an explicit readiness step such as:

```json
{ "do": "wait-scroll-idle", "area": "chat" }
```

The worker must validate the supported area rather than evaluating arbitrary journey code. Use existing bounded timing constants where applicable and explain any observation-window value with the trace. No production readiness API or settings changes.

- [ ] Add deterministic tests that fail before implementation: delayed relevant scrolling postpones readiness; irrelevant/hidden scrolling does not; activity/geometry changes reset stability; missing target and never-stable target fail boundedly; observation resources are cleaned up.
- [ ] Run `node --test scripts/shoot/tests/driver.test.mjs` and any focused helper tests; record the actual intended red failures.
- [ ] Implement the smallest bounded condition-based readiness operation. Add a WHY comment citing startup chat scrolling dismissing a correctly opened file menu.
- [ ] Add the explicit readiness step before the existing right-click. Keep the existing start scenario, latency, file fixture and all four existing steps unchanged.
- [ ] Run all existing `scripts/shoot/tests/*.test.mjs` and the targeted real journey. Mutation-test the real synchronization site: removing the observation/reset must fail its focused regression; restore it and rerun green.
- [ ] Run the existing saved journeys, inspect the targeted final screenshot as a person would, and obtain a fresh read-only review. Do not infer visual correctness from text alone.
- [ ] Parent runs `bash scripts/verify.sh` for the combined main candidate after all writers stop. Fix encountered failures within authorized scope; never call red verification complete.
- [ ] Commit only explicit reviewed paths with the required Submitted via YouCoded Assistant trailer. App journey changes belong in the app repo; runner changes belong in the workspace repo. No merge.

## Evidence and acceptance

Original isolated failure: `/tmp/full-ci-comment-journey-repro.log`.
One-shot lifecycle trace: `/tmp/full-ci-comment-journey-trace.log`.
The trace proves menu creation followed by an unrelated `.chat-scroll` event and menu dismissal with either reduced-effects setting. It does not identify a particular ChatView pinning path; do not invent that attribution.

Acceptance requires positive real-journey execution and restored mutation coverage, no fixture/assertion reduction, resource cleanup and combined verification. A finite observation window cannot guarantee that no future asynchronous scroll will ever happen; do not claim that stronger property.
