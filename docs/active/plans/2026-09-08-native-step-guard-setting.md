# Native Step-Guard Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person disable the normal native-session continuation guard by default or choose one positive step count for regular desktop native sessions.

**Architecture:** Add a small native-runtime settings module backed by the locked `~/.youcoded/config.json` writer. Expose its validated `number | null` preference through a parity-complete bridge, render it as a typeable dropdown in Assistant Settings → General, and snapshot it into each newly created root native session. The harness no longer invents a model-tier fallback for ordinary sessions; specialist and evaluation manifests retain their explicit limits.

**Tech Stack:** Electron main/preload, React/TypeScript, existing `NativeHome` JSON storage, Electron/remote/Android bridge protocol, Vitest + Testing Library.

## Global Constraints

- The default is **None**: an absent, invalid, zero, or negative persisted value must produce no ordinary native-session step guard.
- The menu presents **None** plus 10 through 100 in increments of ten; typed input accepts any positive whole number, including values above 100.
- One setting applies identically to ordinary local and cloud native sessions.
- A setting change applies only to subsequently created root native sessions; an in-flight session's limit is stable.
- Specialist `stepCap` and harness-evaluation limits remain explicit overrides and must not inherit the ordinary-session default.
- Preserve the existing `max_steps` synthetic permission-card/event path; do not introduce a transcript event.
- All shared `window.claude` bridge additions must remain identical across preload, remote shim, remote server, and Android `SessionService`; Android may return its standard not-implemented result because it has no native runtime.
- Do not touch Destin's running app. Runtime inspection, if needed, uses only the isolated worktree dev build.

## File structure

| File | Responsibility |
| --- | --- |
| `youcoded/desktop/src/main/harness/step-guard-settings.ts` | Validate, read, and atomically update the persisted ordinary root-session limit. |
| `youcoded/desktop/src/main/harness/native-session-host.ts` | Accept and snapshot an optional root-session `maxSteps`; continue passing a specialist definition's `stepCap` for children. |
| `youcoded/desktop/src/main/harness/harness-session.ts` | Treat an absent ordinary/root limit as disabled instead of falling back to `stepBudgetFor`; retain explicit manifest caps. |
| `youcoded/desktop/src/main/ipc-handlers.ts` | Construct the settings store once and register read/write handlers plus remote-server dependencies. |
| `youcoded/desktop/src/main/preload.ts` | Expose the typed native step-guard read/write methods. |
| `youcoded/desktop/src/main/remote-server.ts` | Route the matching WebSocket requests to the same settings store. |
| `youcoded/desktop/src/renderer/remote-shim.ts` | Mirror the native step-guard bridge methods for remote/Android renderer parity. |
| `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` | Add same-name no-native-runtime bridge cases. |
| `youcoded/desktop/src/renderer/components/ui/TypeableSelect.tsx` | Accessible themed text field plus portaled app-style option menu, reusable without a native browser select. |
| `youcoded/desktop/src/renderer/components/ui/index.ts` | Export the new primitive. |
| `youcoded/desktop/src/renderer/components/assistant-settings/pages.tsx` | Load/save the preference and place the Step guard field in General only when native runtime is available. |
| `youcoded/desktop/tests/step-guard-settings.test.ts` | Pin persistence and strict positive-integer validation. |
| `youcoded/desktop/tests/harness-session-loop.test.ts` | Pin root no-limit behavior and configured root continuation behavior. |
| `youcoded/desktop/tests/native-session-host.test.ts` | Pin root-limit snapshot/precedence and unchanged specialist `stepCap`. |
| `youcoded/desktop/tests/TypeableSelect.test.tsx` | Pin keyboard, option selection, typed input, validation, and themed listbox semantics. |
| `youcoded/desktop/tests/assistant-settings-step-guard.test.tsx` | Pin General page rendering, load/save, None, menu values, and typed >100 value. |
| `youcoded/desktop/tests/ipc-channels.test.ts` | Extend bridge parity assertions for the two new channel names and all required surfaces. |

---

### Task 1: Persist and validate the ordinary step-guard preference

**Files:**
- Create: `youcoded/desktop/src/main/harness/step-guard-settings.ts`
- Create: `youcoded/desktop/tests/step-guard-settings.test.ts`

**Interfaces:**
- Produces: `normalizeStepGuard(value: unknown): number | null`
- Produces: `StepGuardSettings.read(): number | null`
- Produces: `StepGuardSettings.update(value: unknown): Promise<number | null>`
- Depends on: `NativeHome.readJson('config.json')` and `NativeHome.mutateJson('config.json', ...)`

- [ ] **Step 1: Write the failing storage and validation tests**

```ts
import { describe, expect, it } from 'vitest';
import { NativeHome } from '../src/main/native-home';
import { StepGuardSettings, normalizeStepGuard } from '../src/main/harness/step-guard-settings';

it('defaults missing and malformed values to None', () => {
  expect(normalizeStepGuard(undefined)).toBeNull();
  expect(normalizeStepGuard('20')).toBeNull();
  expect(normalizeStepGuard(0)).toBeNull();
  expect(normalizeStepGuard(-1)).toBeNull();
  expect(normalizeStepGuard(3.5)).toBeNull();
});

it('keeps a positive whole-number preference and preserves config siblings', async () => {
  const home = new NativeHome(root);
  await home.writeJson('config.json', { v: 1, engine: { backend: 'cpu' } });
  const settings = new StepGuardSettings(home);
  await expect(settings.update(125)).resolves.toBe(125);
  expect(settings.read()).toBe(125);
  expect(home.readJson('config.json')).toMatchObject({ engine: { backend: 'cpu' }, native: { stepGuard: 125 } });
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the module does not exist**

Run: `cd youcoded/desktop && npx vitest run tests/step-guard-settings.test.ts`

Expected: FAIL with an unresolved import for `step-guard-settings`.

- [ ] **Step 3: Implement the isolated settings module**

```ts
const FILE = 'config.json';

export function normalizeStepGuard(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0
    ? value
    : null;
}

export class StepGuardSettings {
  constructor(private readonly home: NativeHome) {}

  read(): number | null {
    const file = this.home.readJson(FILE);
    const native = file && typeof file === 'object' ? (file as { native?: unknown }).native : null;
    const raw = native && typeof native === 'object' ? (native as { stepGuard?: unknown }).stepGuard : null;
    return normalizeStepGuard(raw);
  }

  async update(value: unknown): Promise<number | null> {
    const stepGuard = normalizeStepGuard(value);
    await this.home.mutateJson(FILE, (current) => {
      const file = current && typeof current === 'object' ? { ...(current as Record<string, unknown>) } : { v: 1 };
      const native = file.native && typeof file.native === 'object' ? { ...(file.native as Record<string, unknown>) } : {};
      if (stepGuard === null) delete native.stepGuard;
      else native.stepGuard = stepGuard;
      file.native = native;
      return file;
    });
    return stepGuard;
  }
}
```

Add a WHY comment explaining that malformed config is disabled rather than coerced, because a hand-edited or stale setting must never unexpectedly stop a run.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/step-guard-settings.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the self-contained storage contract**

```bash
cd youcoded
git add desktop/src/main/harness/step-guard-settings.ts desktop/tests/step-guard-settings.test.ts
git diff --staged --check
git commit -m "feat: persist native step guard preference" -m "Submitted via YouCoded Assistant"
```

### Task 2: Apply the snapshot only to ordinary root native sessions

**Files:**
- Modify: `youcoded/desktop/src/main/harness/native-session-host.ts:63-68,2806-2861`
- Modify: `youcoded/desktop/src/main/harness/harness-session.ts:1872-1878,2148-2157`
- Modify: `youcoded/desktop/tests/harness-session-loop.test.ts:302-329`
- Modify: `youcoded/desktop/tests/native-session-host.test.ts` (root creation and existing specialist `stepCap` coverage)
- Delete: `youcoded/desktop/src/main/harness/model-step-budget.ts`
- Delete: `youcoded/desktop/tests/model-step-budget.test.ts`
- Modify: `youcoded/desktop/src/shared/harness-manifest.ts:76-101` (remove comments promising model-tier fallback)

**Interfaces:**
- Consumes: `CreateNativeSessionOpts.stepGuard?: number | null`
- Produces: `HarnessSession` root `harness.limits.maxSteps` only when `stepGuard` is positive.
- Preserves: specialist child construction `limits: { ...preset.manifest.limits, maxSteps: specialist.stepCap }`.
- Preserves: evaluation-provided `harness.limits.maxSteps` as an explicit cap.

- [ ] **Step 1: Add failing root-session tests**

Add a host test which creates a root session with `stepGuard: 2`, drives a repeating tool-call model, and asserts two tool calls followed by the existing `max_steps` ask/stop path. Add a second root test without `stepGuard` that drives more than 50 completed tool steps and asserts no `max_steps` ask occurred before an ordinary `end_turn` response.

```ts
expect(events.filter((e) => e.type === 'tool-use')).toHaveLength(2);
expect(asks.find((e) => e.payload.tool_name === 'max_steps')).toBeDefined();

expect(asks.some((e) => e.payload.tool_name === 'max_steps')).toBe(false);
expect(done.data.stopReason).toBe('end_turn');
```

Keep the existing specialist test's `CAPPED = { ...EXPLORER, stepCap: 2 }` assertion unchanged, so it proves the child cap is still definition-owned.

- [ ] **Step 2: Run the focused harness tests and verify the old fallback causes failure**

Run: `cd youcoded/desktop && npx vitest run tests/harness-session-loop.test.ts tests/native-session-host.test.ts`

Expected: FAIL: the no-setting root test receives the old 25/50-step continuation ask or the host does not accept `stepGuard`.

- [ ] **Step 3: Add an optional root limit and remove model-tier fallback**

Extend the root creation options:

```ts
export interface CreateNativeSessionOpts {
  sessionId: string;
  cwd: string;
  binding: ModelBinding;
  presetId?: string;
  /** Snapshot at creation: root sessions must not change behavior mid-turn. */
  stepGuard?: number | null;
}
```

At root session construction, merge only a valid configured root limit into the preset manifest:

```ts
const rootMaxSteps = typeof opts.stepGuard === 'number' && Number.isInteger(opts.stepGuard) && opts.stepGuard > 0
  ? opts.stepGuard
  : undefined;
const harness = rootMaxSteps === undefined
  ? preset.manifest
  : { ...preset.manifest, limits: { ...preset.manifest.limits, maxSteps: rootMaxSteps } };
```

Pass `harness` to `new HarnessSession`. Do not route this value through `createChild`.

In `HarnessSession`, change the loop to read only an explicit cap:

```ts
const maxSteps = this.opts.harness.limits?.maxSteps;
...
if (maxSteps !== undefined && stepsSinceApproval >= maxSteps) {
  // existing ask/allow/reset/cancel behavior unchanged
}
```

Remove the `stepBudgetFor` import/use and delete the obsolete model-tier module/test. Update comments so they describe an explicit cap, not a model name or tier.

- [ ] **Step 4: Run the focused tests and mutation-check the new no-limit guard**

Run: `cd youcoded/desktop && npx vitest run tests/harness-session-loop.test.ts tests/native-session-host.test.ts`

Expected: PASS.

Then temporarily change `if (maxSteps !== undefined && ...` to `if (true && ...`, run the no-setting test, and verify it FAILS due to a `max_steps` ask. Restore the expression immediately.

- [ ] **Step 5: Commit the root-only runtime behavior**

```bash
cd youcoded
git add desktop/src/main/harness/native-session-host.ts desktop/src/main/harness/harness-session.ts desktop/src/shared/harness-manifest.ts desktop/tests/harness-session-loop.test.ts desktop/tests/native-session-host.test.ts
git rm desktop/src/main/harness/model-step-budget.ts desktop/tests/model-step-budget.test.ts
git diff --staged --check
git commit -m "feat: make native step guard opt-in" -m "Submitted via YouCoded Assistant"
```

### Task 3: Add a parity-complete settings bridge and inject the snapshot at creation

**Files:**
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts:2477-2570,850-897`
- Modify: `youcoded/desktop/src/main/preload.ts` (IPC constants and `window.claude.native` methods)
- Modify: `youcoded/desktop/src/renderer/remote-shim.ts` (matching `window.claude.native` methods)
- Modify: `youcoded/desktop/src/main/remote-server.ts` (matching WebSocket request cases)
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (same message types, no-native-runtime replies)
- Modify: `youcoded/desktop/tests/ipc-channels.test.ts`
- Modify: `youcoded/desktop/tests/native-session-host.test.ts` (or an IPC handler test already constructing the host)

**Interfaces:**
- Produces: `window.claude.native.getStepGuard(): Promise<number | null>`.
- Produces: `window.claude.native.setStepGuard(value: unknown): Promise<number | null>`.
- Consumes: `StepGuardSettings.read()` at new root native-session creation.
- Uses channel names: `native:get-step-guard` and `native:set-step-guard`.

- [ ] **Step 1: Write failing IPC and handler tests**

Add exact channel assertions for both names in the parity test. Add a main-handler test that saves `30`, reads `30`, creates a native root session, and verifies the `CreateNativeSessionOpts` passed to the host contains `stepGuard: 30`. Repeat with a cleared/invalid value and expect `stepGuard: null`.

```ts
expect(await invoke('native:set-step-guard', 30)).toBe(30);
expect(await invoke('native:get-step-guard')).toBe(30);
expect(nativeHost.create).toHaveBeenCalledWith(expect.objectContaining({ stepGuard: 30 }));
```

- [ ] **Step 2: Run targeted bridge tests and verify they fail**

Run: `cd youcoded/desktop && npx vitest run tests/ipc-channels.test.ts tests/native-session-host.test.ts`

Expected: FAIL because the two channels and host creation option are absent.

- [ ] **Step 3: Wire the single store through each bridge surface**

In `ipc-handlers.ts`, construct one `StepGuardSettings(nativeHome)` beside `PermissionStore`, register Electron handlers, and read the saved value when calling `nativeHost.create` for a fresh root native session:

```ts
ipcMain.handle(IPC.NATIVE_GET_STEP_GUARD, () => stepGuardSettings.read());
ipcMain.handle(IPC.NATIVE_SET_STEP_GUARD, async (_event, value: unknown) => stepGuardSettings.update(value));

await nativeHost.create({
  sessionId: info.id,
  cwd: info.cwd,
  binding: opts.binding,
  presetId: opts.preset,
  stepGuard: stepGuardSettings.read(),
});
```

Mirror the channel constants and methods in preload and remote shim. Add remote-server cases that call the same store, not a second `NativeHome` reader. In Android, add matching `when` cases returning the existing not-implemented native-runtime response shape. Keep the methods exposed on all renderer bridges even though the control is hidden where `native.supported !== true`.

- [ ] **Step 4: Run parity and targeted tests**

Run: `cd youcoded/desktop && npx vitest run tests/ipc-channels.test.ts tests/native-session-host.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the bridge and creation snapshot**

```bash
cd youcoded
git add desktop/src/main/ipc-handlers.ts desktop/src/main/preload.ts desktop/src/renderer/remote-shim.ts desktop/src/main/remote-server.ts app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt desktop/tests/ipc-channels.test.ts desktop/tests/native-session-host.test.ts
git diff --staged --check
git commit -m "feat: expose native step guard setting" -m "Submitted via YouCoded Assistant"
```

### Task 4: Build the typeable themed dropdown primitive

**Files:**
- Create: `youcoded/desktop/src/renderer/components/ui/TypeableSelect.tsx`
- Modify: `youcoded/desktop/src/renderer/components/ui/index.ts:25-39`
- Create: `youcoded/desktop/tests/TypeableSelect.test.tsx`

**Interfaces:**
- Produces: `TypeableSelect({ value, options, onCommit, placeholder, 'aria-label' })`.
- `value` is `string`; `onCommit` receives the raw typed/selected string after Enter, blur, or option click.
- Uses: `fieldClasses`, `OverlayPanel`, `createPortal`, and `useEscClose` from the existing UI system.

- [ ] **Step 1: Write failing UI tests**

```tsx
render(<TypeableSelect value="" options={[{ value: '', label: 'None' }, { value: '10', label: '10 steps' }]} onCommit={onCommit} aria-label="Step guard" />);
await user.click(screen.getByRole('combobox', { name: 'Step guard' }));
expect(screen.getByRole('listbox', { name: 'Step guard' })).toBeInTheDocument();
await user.click(screen.getByRole('option', { name: '10 steps' }));
expect(onCommit).toHaveBeenCalledWith('10');

await user.clear(screen.getByRole('combobox', { name: 'Step guard' }));
await user.type(screen.getByRole('combobox', { name: 'Step guard' }), '125{Enter}');
expect(onCommit).toHaveBeenLastCalledWith('125');
```

Also assert Escape closes the menu, ArrowDown/ArrowUp move the active option, and clicking outside closes it without committing a partial edit.

- [ ] **Step 2: Run the focused UI test and verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/TypeableSelect.test.tsx`

Expected: FAIL with an unresolved `TypeableSelect` import.

- [ ] **Step 3: Implement the primitive with app-standard menu treatment**

Use `<input role="combobox">` with `aria-expanded`, `aria-controls`, and `aria-autocomplete="list"`; do not use a browser `<select>` or `<datalist>`. Base its measured, portaled, scroll-aware listbox on `Select.tsx`:

```tsx
<input
  ref={inputRef}
  role="combobox"
  aria-expanded={open}
  aria-controls={listboxId}
  aria-autocomplete="list"
  value={draft}
  onFocus={() => setOpen(true)}
  onChange={(event) => { setDraft(event.target.value); setOpen(true); }}
  onKeyDown={onKeyDown}
  onBlur={commitIfFocusLeavesBothInputAndMenu}
  className={fieldClasses('md', 'w-full pr-8')}
/>
```

Portal an `OverlayPanel layer={4}` at the input's measured width/position. Render options as `role="option"` rows with the same active/selected visual states and keyboard rules used by `Select.tsx`. Commit selected options by their raw `value`; commit typed text only on Enter or a true focus exit. Add a WHY comment that the menu is custom because native select option menus cannot follow YouCoded themes.

- [ ] **Step 4: Run primitive tests and the existing Select regression test**

Run: `cd youcoded/desktop && npx vitest run tests/TypeableSelect.test.tsx tests/ui/Select.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the reusable control**

```bash
cd youcoded
git add desktop/src/renderer/components/ui/TypeableSelect.tsx desktop/src/renderer/components/ui/index.ts desktop/tests/TypeableSelect.test.tsx
git diff --staged --check
git commit -m "feat: add typeable select control" -m "Submitted via YouCoded Assistant"
```

### Task 5: Put Step guard in Assistant Settings → General

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/assistant-settings/pages.tsx:1-16,111-220`
- Create: `youcoded/desktop/tests/assistant-settings-step-guard.test.tsx`
- Modify: `youcoded/desktop/tests/assistant-settings-attention.test.tsx` only if the shared bridge stub needs the new native methods for the page to render safely.

**Interfaces:**
- Consumes: `window.claude.native.getStepGuard(): Promise<number | null>` and `setStepGuard(value: unknown): Promise<number | null>`.
- Consumes: `TypeableSelect`.
- Produces: a General-page **Step guard** field that saves `null` for None/invalid input and saves a positive integer for valid input.

- [ ] **Step 1: Write failing General-page tests**

Stub `native.supported: true`, `getStepGuard: async () => null`, and a spy for `setStepGuard`. Render the settings row, open it, and assert:

```tsx
expect(screen.getByRole('combobox', { name: 'Step guard' })).toHaveValue('');
expect(screen.getByText('None')).toBeInTheDocument();
expect(screen.getByText('100 steps')).toBeInTheDocument();

await user.type(screen.getByRole('combobox', { name: 'Step guard' }), '125{Enter}');
expect(setStepGuard).toHaveBeenCalledWith(125);

await user.clear(screen.getByRole('combobox', { name: 'Step guard' }));
await user.type(screen.getByRole('combobox', { name: 'Step guard' }), '0{Enter}');
expect(setStepGuard).toHaveBeenLastCalledWith(null);
```

Add an Android/no-native test that confirms the Step guard field is absent and neither bridge method is called.

- [ ] **Step 2: Run the focused page test and verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/assistant-settings-step-guard.test.tsx`

Expected: FAIL because the General page has no Step guard field.

- [ ] **Step 3: Implement loading, validation, and saving in General**

Add these constants/helpers near `FieldRow`:

```ts
const STEP_GUARD_OPTIONS = [
  { value: '', label: 'None' },
  ...Array.from({ length: 10 }, (_, index) => {
    const steps = (index + 1) * 10;
    return { value: String(steps), label: `${steps} steps` };
  }),
];

function parseStepGuard(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
```

Create `StepGuardRow` within `pages.tsx`. On mount, only when `native.supported === true`, read `getStepGuard()` into local state. Its `onCommit` calls `setStepGuard(parseStepGuard(raw))`, then renders the returned value (`''` for `null`) so an invalid typed value visibly resolves to **None**. Render it after Default project folder, with this user-facing copy:

- Title: `Step guard`
- Hint: `Pause after this many tool steps so you can choose whether the assistant keeps going. Choose None to let it continue until it finishes.`

Do not call either API where native runtime is unavailable.

- [ ] **Step 4: Run page and primitive tests**

Run: `cd youcoded/desktop && npx vitest run tests/assistant-settings-step-guard.test.tsx tests/assistant-settings-attention.test.tsx tests/TypeableSelect.test.tsx`

Expected: PASS.

- [ ] **Step 5: Inspect the completed UI in an isolated renderer**

Run: `cd /home/destin/youcoded-dev/worktrees/sessions/native-step-guard-setting && bash scripts/run-workbench.sh --label "Native step guard"`

Open only the workbench/dev surface, navigate to Assistant settings → General, and verify the field uses the app-style portaled menu, menu options run None/10–100, `125` remains selectable after typing, and invalid input returns to None. Stop the workbench after inspection.

- [ ] **Step 6: Commit the Settings surface**

```bash
cd youcoded
git add desktop/src/renderer/components/assistant-settings/pages.tsx desktop/tests/assistant-settings-step-guard.test.tsx desktop/tests/assistant-settings-attention.test.tsx
git diff --staged --check
git commit -m "feat: configure native step guard in settings" -m "Submitted via YouCoded Assistant"
```

### Task 6: Complete integration verification and documentation

**Files:**
- Modify: `youcoded/docs/native-runtime.md:43-53` (replace model-tier default description with the default-off Assistant Settings behavior and exceptions)
- Modify: `docs/active/specs/2026-09-08-native-step-guard-setting-design.md` status only if the workspace lifecycle policy changes it at completion.

**Interfaces:**
- Verifies: the exact preference contract, bridge parity, root behavior, specialist/evaluation exceptions, UI behavior, and desktop static checks.

- [ ] **Step 1: Update the runtime reference documentation**

Replace the old claim that ordinary runs use a 25/50 model-tier default with: ordinary desktop native sessions have no guard unless Assistant Settings → General has a positive Step guard; that number is stable for sessions created while it is set; specialist definitions and evaluation manifests keep explicit independent caps.

- [ ] **Step 2: Run all directly affected tests**

Run:

```bash
cd youcoded/desktop
npx vitest run \
  tests/step-guard-settings.test.ts \
  tests/harness-session-loop.test.ts \
  tests/native-session-host.test.ts \
  tests/ipc-channels.test.ts \
  tests/TypeableSelect.test.tsx \
  tests/assistant-settings-step-guard.test.tsx \
  tests/assistant-settings-attention.test.tsx
```

Expected: PASS with zero failures.

- [ ] **Step 3: Run desktop repository verification**

Run: `cd /home/destin/youcoded-dev/worktrees/sessions/native-step-guard-setting && bash scripts/verify.sh youcoded`

Expected: exit 0. Read the entire output and distinguish warnings or pre-existing environmental failures from regressions; do not claim success without this result.

- [ ] **Step 4: Commit the reference update after verification**

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/native-step-guard-setting
git add youcoded/docs/native-runtime.md docs/active/specs/2026-09-08-native-step-guard-setting-design.md
git diff --staged --check
git commit -m "docs: describe native step guard setting" -m "Submitted via YouCoded Assistant"
```

## Plan self-review

- **Spec coverage:** Task 1 covers default-off persistence and validation; Task 2 removes model-tier defaults and preserves explicit specialist/eval limits; Task 3 covers stable creation-time snapshot and bridge parity; Tasks 4–5 cover the typeable app-style dropdown, None, 10–100 options, typed >100, and native-only visibility; Task 6 covers documentation and full verification.
- **Placeholder scan:** No TBD/TODO/“appropriate handling” placeholders remain. Each implementation task names concrete files, interfaces, commands, and behavioral assertions.
- **Type consistency:** `number | null` is the persisted/bridge value, the root option is `stepGuard?: number | null`, and `HarnessManifest.limits.maxSteps?: number` is present only when the root setting or an explicit specialist/evaluation cap is valid.
