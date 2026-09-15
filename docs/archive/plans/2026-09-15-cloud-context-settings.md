---
status: shipped
date: 2026-09-15
---

# Cloud Context Settings Implementation Plan

**Goal:** Save the approved provider-specific 250k / 1M choices and resolve honest operating budgets for OpenRouter/ChatGPT, without changing local models.

**Architecture:** `ContextPreferences` is shared renderer/main data. `ContextSettingsStore` persists `native.context` through NativeHome's locked mutation. ModelCatalog retains raw source metadata; only `contextLengthFor` applies the preference, supplying the existing single context path used by native sessions, profiles, trimming, compaction and usage events. Existing sessions keep their current budget until reopened or their model is switched; new/resumed roots and specialists read the current defaults. No active histories are silently trimmed on a settings write.

**Tech stack:** TypeScript, React, Electron IPC/WebSocket bridge, NativeHome JSON store, Vitest; Android explicitly refuses unsupported native settings.

## Approved decisions

- Round 1 C-2: explanation approved. Round 2 C-3: compact card approved.
- Choices remain independent. Preserve the exact approved layout and wording.
- UI labels are approximate. Standard caps at 272,000 (preserves ChatGPT's existing default). Long caps at 1,200,000 (upper edge of the approved approximate 800k–1.2M explanation). Both are clamped by advertised capability; no increase when metadata is missing. ChatGPT uses `max_context_window` only when long is selected, falls back to `context_window`, and respects a smaller valid maximum even in standard mode. OpenRouter uses its advertised `context_length`. Other provider types bypass the policy.
- Saving uses partial per-provider patches under the lock, preserving sibling preferences and unrelated config, including concurrent writers.
- Changes take effect at existing context resolution points: create, reopen/resume, model switch and specialist creation. No new model request parameter is invented; verified Codex source uses the field for local operating/compaction budgeting.
- Original implementation-stage boundary: no paid/authenticated model probes, commits, pushes or live-app configuration changes. Destin subsequently authorized merge and close-out; the no-paid-probes and live-app safety boundaries remain unchanged.

## Completion record — 2026-09-15

Shipped to app master in merge `4c5a0729` (implementation `340263fc`), ancestry-verified after Destin authorized merge and close-out. Design and approval records: `docs/archive/design/2026-09-15-cloud-context/README.md`.

The verification record below was written before merge, when implementation was complete in the isolated session branch but not yet committed or shipped.

- Final combined targeted run: 15 suites, 583 tests passed. Full desktop verification passed types (source and tests), related tests/guards, knip, lint and ast-grep; `git diff --check` passed.
- Lifecycle regression mutation: replacing the live preference getter with standard defaults made the focused native-session test fail (272,000 instead of 872,000). Restoring the getter returned it to green.
- Policy reviewer: no material findings; optional malformed-single-field coverage added and native lifecycle tests provided.
- Persistence reviewer found a delayed-save/unmount/remount stale-selection race. Added a reproducing regression (red), then a module-scoped save-completion barrier (green). Reviewer rechecked and closed the finding with no new concrete race.
- Workbench: all 16 routes mounted after mock API changes. Final default/save/reopen capture verified 6/6 screenshots across midnight/light/halftone-dimension; read coverage and screenshots. Final barrier fix changes only load ordering, not the approved markup.
- Android build not run: `$HOME/.android-sdk/platform-tools` absent. Native refusal and desktop/remote parity are tested; no claim of Android runtime verification.
- No paid API requests or changes to the running app. Isolated workbench stopped after captures. At that pre-merge checkpoint, no commits, pushes or merge had occurred.

Post-merge verification: `verify.sh --base 1e839c70` passed on the exact merged app tree. GitHub Android CI [34954907010](https://github.com/itsdestin/youcoded/actions/runs/34954907010) passed. Desktop CI [34954906962](https://github.com/itsdestin/youcoded/actions/runs/34954906962) failed, but every failing test name was also present in the immediately preceding master run [34938031354](https://github.com/itsdestin/youcoded/actions/runs/34938031354); no new failing test names were found. This is not an all-green Desktop CI claim.

The checklist below is the executed plan. The local Android command remains conditional and was explicitly skipped as recorded above; GitHub's Android CI subsequently passed.

## Task 1 — Shared preferences and storage

Files: create `youcoded/desktop/src/shared/context-preferences.ts`, `src/main/harness/context-settings-store.ts`, `tests/context-settings-store.test.ts`.

- [x] Define `ContextMode = 'standard' | 'long'`, `ContextPreferences = {openrouter: ContextMode; chatgpt: ContextMode}`, and lower defaults.
- [x] Red tests: missing/malformed fields normalize independently to standard; valid long survives a new store instance; update({chatgpt:'long'}) preserves OpenRouter, stepGuard and unrelated JSON; parallel distinct-provider patches compose; invalid patch rejects before mutation; locked write errors propagate.
- [x] Implement store `read(): ContextPreferences`, `update(patch: unknown): Promise<ContextPreferences>` following StepGuardSettings but rejecting arrays, unknown keys and invalid mode values. Use `home.mutateJson('config.json', current => ({...config,native:{...native,context:{...normalizedCurrent,...patch}}}))` and return committed normalized state.
- [x] Run `npx vitest run tests/context-settings-store.test.ts` red/green.

## Task 2 — Model metadata and pure context policy

Files: modify `src/shared/provider-types.ts`, `src/main/providers/chatgpt-oauth.ts`, `src/main/providers/model-catalog.ts`; create `src/main/providers/cloud-context.ts`, `tests/cloud-context.test.ts`; extend `tests/chatgpt-oauth.test.ts`, `tests/model-catalog.test.ts`.

- [x] Red tests for parsing valid `max_context_window` separately, without replacing default `contextLength`; ignore missing/invalid/nonpositive/nonfinite values.
- [x] Pure function `cloudContextLength(providerType, model, preferences): number | null` implements the numeric policy above. Tests: 128k small model unchanged in both modes; OpenRouter 1,048,576 → standard 272k / long full; 2M → long 1.2M; ChatGPT 272k default / 872k max → 272k / 872k; max absent → 272k; malformed values never invent a window; other provider types unchanged; provider-specific toggles independent.
- [x] Add optional `contextPreferences?: () => ContextPreferences` to ModelCatalog's options. `get()` remains raw; `contextLengthFor()` finds provider TYPE, model row, then calls the pure resolver with current preferences (or lower defaults).
- [x] Integration tests prove raw catalog display metadata is not rewritten, custom provider IDs resolve by type, and toggling the injected getter changes the next resolved budget without invalidating/refetching the catalog.
- [x] Run the three targeted suites red/green.

## Task 3 — IPC and persistent UI

Files: modify `src/shared/types.ts`, `src/main/preload.ts`, `src/main/ipc-handlers.ts`, `src/main/remote-server.ts`, `src/renderer/remote-shim.ts`, `src/renderer/dev/workbench/mock-shim.ts`, `src/renderer/components/assistant-settings/pages.tsx`, `ContextSettings.tsx`; create adjacent `SavedContextSettings.tsx`; Android `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`; tests for saved UI and IPC parity.

- [x] Add `native:get-context-preferences` / `native:set-context-preferences` with `getContextPreferences()` and `setContextPreferences(patch)` on `window.claude.native`. Return the full committed preference object from writes.
- [x] Instantiate ONE ContextSettingsStore in ipc-handlers, inject `contextPreferences: () => contextSettings.read()` into ModelCatalog, and expose that same store through native runtime to WebSocket handlers. Unsupported transports reject, never report a successful save. Android uses its existing native-not-supported branch and remote shim rejection set.
- [x] Move shared types/defaults out of the presentation component, keeping compatibility exports if needed. Replace preview-local state in General with SavedContextSettings. Keep native-supported gating and the approved card unmodified visually.
- [x] SavedContextSettings loads once per mount, optimistic per-provider choices, serialized/merged pending patches; failed writes do not discard later user input. Loading/read failures cannot show a fake saved default. Use existing LoadingState/ErrorState and Retry for recoverable settings read/write failures.
- [x] Tests: reopen restores saved choices; separate provider writes preserve siblings; rapid clicks serialize; a failed superseded write cannot roll back the latest choice; unsuperseded failure is visible and retry saves intended choice; load failure retries; accepted queued writes finish after unmount without stale React updates (closing the panel must not lose an already-chosen setting).
- [x] Mock shim implements both methods with persistent-in-workbench state and refused-write behavior. Run workbench boot check after modification.

## Task 4 — Verification and fresh review

- [x] Run `bash scripts/verify.sh <absolute app worktree>` and inspect all results.
- [x] Check Android SDK/JDK availability; if available run appropriate Android tests excluding bundleWebUi. Otherwise explicitly state Android unverified. Never install SDKs or touch hardlinked dependencies for this task.
- [x] Fresh code reviewer checks resolver, persistence races, IPC failure semantics, local-model isolation, and approved UI preservation. Address findings within scope and rerun relevant checks.
- [x] Capture final shared renderer settings in the isolated workbench; read coverage before judging, and compare to the approved compact screenshot. Persistence interaction tests prove the non-visual save path. Do not run a paid harness evaluation; no prompt/tool definition change is planned.
- [x] Update plan/progress and living provider documentation with exact numeric policy and lifecycle. Report results and verification limits. The original implementation-stage instruction was not to merge or suggest merging; later explicit authorization superseded that boundary.
