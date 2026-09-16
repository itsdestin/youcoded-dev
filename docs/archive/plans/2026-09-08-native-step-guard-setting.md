---
status: shipped
date: 2026-09-08
type: implementation-plan
spec: docs/archive/specs/2026-09-08-native-step-guard-setting-design.md
owner: session/native-step-guard-setting
---

# Native Step-Guard Setting Implementation Plan

**Goal:** Add an optional, per-root-session native tool-loop guard without changing specialists or evaluator caps.

**Architecture:** `StepGuardSettings` exclusively owns the locked `~/.youcoded/config.json` preference. A reader is injected once into `NativeSessionHost`; fresh ordinary roots persist one normalized snapshot in `NativeSessionHeader`, while root resume restores only that header value. `HarnessSession` honors only explicit `maxSteps`. Two request-response channels span all bridge surfaces. A native-only typeable themed control handles loading, validation, rollback, and retry.

## Constraints

- `normalizeStepGuard` accepts only positive safe integers; every other persisted value means no setting.
- Fresh ordinary roots read once and save the snapshot. Existing/resumed roots never re-read the preference. Old headers have no guard.
- Specialist children keep definition `stepCap`. Harness evaluator keeps explicit `maxSteps: 100`.
- Delete active 25/50 fallback code and references; archives stay historical.
- Channels `native:get-step-guard` and `native:set-step-guard` are request-response on `shared/types.ts`, preload, `useIpc.ts`, Electron handlers, remote server dependencies/cases, remote shim, Android `SessionService`, and workbench mock.
- UI is visible only for `native.supported === true`. Invalid input shows `FieldError` and never clears the setting. Failed reads/writes are handled with retry/rollback.
- No interactive app/workbench launch. Static workbench boot check is allowed.
- Strict TDD: observe focused red before production work, then focused green. Do not commit.

## Task 1 — Pin the contract red

- [x] Add `desktop/tests/step-guard-settings.test.ts` for safe-integer normalization, locked mutation, clearing, malformed config, and sibling preservation.
- [x] Extend host/store tests for fresh snapshots, resume from saved snapshot after preference changes, and old headers.
- [x] Extend harness loop tests to prove absent `maxSteps` never gates and explicit values do.
- [x] Update `harness-review-runner.test.ts` to pin evaluator `maxSteps: 100` without importing model-tier constants.
- [x] Extend `ipc-channels.test.ts` for every bridge surface and both remote response cases; extend workbench contract tests.
- [x] Add `desktop/src/renderer/components/ui/TypeableSelect.test.tsx` (the existing Select regression is `desktop/src/renderer/components/ui/Select.test.tsx`) and Assistant Settings tests for presets, >100, invalid text, loading, read retry, write rollback/retry, None, and native-only visibility.
- [x] Run focused tests and record the expected failures.

## Task 2 — Storage and runtime

- [x] Implement `desktop/src/main/harness/step-guard-settings.ts` using `NativeHome.readJson` and `mutateJson` only.
- [x] Add optional `stepGuard` to `NativeSessionHeader`, validated on read.
- [x] Inject a `readStepGuard` callback once into `NativeSessionHost`.
- [x] Fresh root creation reads once, writes the header snapshot, and constructs from that same snapshot. Root resume constructs from `header.stepGuard` only.
- [x] Leave specialist construction on `specialist.stepCap`.
- [x] Change `HarnessSession` to gate only when explicit `maxSteps` exists.
- [x] Delete `model-step-budget.ts` and its test; remove all active 25/50 imports/comments from runtime, tests, evaluator rule, native depth doc, and active agent-platform vision.

## Task 3 — Parity-complete bridge

- [x] Add constants to `desktop/src/shared/types.ts` and preload's inlined map.
- [x] Add methods to preload and `desktop/src/renderer/hooks/useIpc.ts` types.
- [x] Construct one `StepGuardSettings` beside `NativeHome`, inject its reader into the host, and register Electron handlers.
- [x] Add it to `RemoteServer.setNativeRuntime` and add responding get/set cases.
- [x] Add remote-shim request-response methods and rejection handling where required.
- [x] Add Android not-implemented cases.
- [x] Add get/set behavior to `desktop/src/renderer/dev/workbench/mock-shim.ts`.

## Task 4 — Typeable control and General settings row

- [x] Implement a focused `TypeableSelect` by sharing/reusing `Select` positioning and themed option behavior where clean; preserve combobox/listbox keyboard semantics.
- [x] Export it from the UI index.
- [x] Add a native-only Step guard row after Default project folder.
- [x] Menu: None and 10–100 by tens. Typed input: positive whole safe integers including >100.
- [x] Explicit None saves `null`. Invalid text shows inline error and reverts/retains the last saved value without calling `setStepGuard(null)`.
- [x] Handle initial loading, read failure + Retry, write failure + rollback + Retry without floating promises.
- [x] Use copy clarifying rounds versus individual parallel calls and that other safety checks remain.

## Task 5 — Documentation and verification

- [x] Update `youcoded/docs/native-runtime.md`, `.claude/rules/harness-evaluator.md`, and `docs/active/specs/2026-09-01-agent-platform-vision-and-state.md` to remove active 25/50 fallback claims and describe explicit limits/snapshots.
- [x] Run focused storage/runtime/host tests.
- [x] Run `harness-review-runner.test.ts`.
- [x] Run `ipc-channels.test.ts` and workbench mock contract tests.
- [x] Run TypeableSelect, existing Select, and Assistant Settings tests.
- [x] Run `node scripts/workbench-boot-check.mjs` because mock-shim changes.
- [x] Run all directly affected tests together.
- [x] From workspace root run `bash scripts/verify.sh youcoded` and inspect full output.
- [x] Inspect `git diff --check`, final diff, and status. Leave all work uncommitted.
- [x] Report Android SDK limitation and offer (do not run) the paid harness evaluator.
