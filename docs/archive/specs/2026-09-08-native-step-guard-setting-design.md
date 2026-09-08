---
status: shipped
date: 2026-09-08
type: design
tags: [native-runtime, settings, safety]
---

# Native step-guard setting

## Summary

Assistant Settings → General gains an optional **Step guard** for ordinary root sessions that use YouCoded's native runtime. **None** is the default. A positive count pauses the tool loop and shows the existing **Continue?** card after that many completed tool-loop rounds. Other safety checks still apply when this preference is None.

A step is one model/tool-loop round, not each individual tool call in a parallel batch.

## Preference and validation

`StepGuardSettings` is the single owner of this preference. It reads and mutates `~/.youcoded/config.json` through `NativeHome`, including `NativeHome`'s locked mutation path, and preserves unrelated configuration.

The persisted value is `native.stepGuard`. `normalizeStepGuard` accepts only positive JavaScript safe integers. Missing, `null`, strings, non-finite numbers, fractions, zero, negatives, and unsafe integers all read as no setting. Explicit **None** removes the key. No migration is needed.

## Session snapshot contract

The preference is a creation-time snapshot, not live configuration:

1. `NativeSessionHost` receives one injected preference reader.
2. Creating a fresh ordinary root reads it once, normalizes it, writes the resulting optional `stepGuard` into `NativeSessionHeader`, and constructs the session from that same value.
3. Resuming an ordinary root reads only the header snapshot. It never consults the current preference. Old headers with no `stepGuard` resume with no guard.
4. Changing the preference cannot alter any existing or resumed session.

Specialist children do not inherit the preference. Their definition-owned `stepCap` remains the explicit `maxSteps`. Harness evaluator cases continue supplying explicit `maxSteps: 100`.

## Harness behavior

`HarnessSession` gates `max_steps` only when `harness.limits.maxSteps` is explicitly present. There is no model-name or model-tier fallback. The obsolete 25/50 `model-step-budget` module is removed, together with active imports, comments, tests, and documentation that describe that fallback. Historical archives may retain their original record.

The existing synthetic `max_steps` permission ask, allow/reset behavior, denial stop reason, and transcript-event surface remain unchanged.

## Bridge contract

The request-response methods are:

- `window.claude.native.getStepGuard(): Promise<number | null>`
- `window.claude.native.setStepGuard(value: number | null): Promise<number | null>`

Channels are `native:get-step-guard` and `native:set-step-guard`. They are declared in `shared/types.ts` and implemented with matching names and response semantics in preload, Electron handlers, remote-server runtime dependencies and cases, remote shim, Android `SessionService`, and the workbench mock shim. Android returns its standard not-implemented response because it has no native runtime. Parity tests explicitly check every surface and that both remote cases send responses.

## Settings experience

The control is shown only when `window.claude.native.supported === true`. It is a small accessible typeable select that reuses the established themed `Select` menu behavior where practical.

- Menu options: **None**, then 10 through 100 by tens.
- Typed values: any positive whole safe integer, including values above 100.
- Explicit **None** clears the preference.
- Invalid text is never converted to None. It shows inline validation and retains or reverts to the last saved value.
- Initial loading is represented without an editable stale value.
- Read failures show an accurate `FieldError` with Retry.
- Write failures show an accurate `FieldError`, roll back to the last saved value, and provide Retry; promises are handled.

Copy: “Pause after this many tool-loop steps (rounds), not each parallel tool call. Other safety checks still apply. Choose None to run without this guard.”

## Verification

Strict TDD applies: tests are added or changed first and observed failing before production edits. Coverage pins persistence validation, fresh/resumed header snapshots, old-header behavior, specialist and evaluator explicit limits, harness no-fallback behavior, all bridge surfaces and remote responses, workbench support, typeable-select interaction, settings loading/error/retry/rollback behavior, and native-only visibility. Run the existing Select test at `desktop/src/renderer/components/ui/Select.test.tsx`, the harness-review-runner regression, workbench boot check, affected suites, IPC parity, and `bash scripts/verify.sh youcoded`.

Android cannot be built on this machine because the SDK is unavailable; source/parity checks are the available Android verification.
