# Model Selector Session Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the status bar model selector to be scoped to the active session (like the permissions toggle), and update the Opus label from "4.6" to "4.7".

**Architecture:** Replace the global `model` / `setModel` useState with a `sessionModels: Map<string, ModelAlias>` keyed by session ID — identical to how `permissionModes` already works. Add `model` to `SessionInfo` so the renderer knows which model each session was started with.

**Tech Stack:** TypeScript, React, Electron IPC, Vitest

---

## Files

| Action | File | Change |
|--------|------|--------|
| Modify | `desktop/src/renderer/components/StatusBar.tsx:48` | `'Opus 4.6'` → `'Opus 4.7'` |
| Modify | `desktop/src/shared/types.ts:26` | Add `model?: string` to `SessionInfo` |
| Modify | `desktop/src/main/session-manager.ts:86` | Set `model: opts.model` in the constructed `info` object |
| Modify | `desktop/tests/session-manager.test.ts` | Add test: model is reflected in returned SessionInfo |
| Modify | `desktop/src/renderer/App.tsx` | Replace global model state with per-session Map; all consumers |

---

### Task 1: Update Opus label in StatusBar

**Files:**
- Modify: `desktop/src/renderer/components/StatusBar.tsx:48`

- [ ] **Step 1: Edit the label**

In `StatusBar.tsx`, change line 48:
```typescript
// Before
'opus[1m]':  { label: 'Opus 4.6',   color: '#818CF8', bg: 'rgba(129,140,248,0.15)', border: 'rgba(129,140,248,0.25)' },

// After
'opus[1m]':  { label: 'Opus 4.7',   color: '#818CF8', bg: 'rgba(129,140,248,0.15)', border: 'rgba(129,140,248,0.25)' },
```

- [ ] **Step 2: Run tests**

```bash
cd youcoded/desktop && npm test -- --run 2>&1 | tail -20
```
Expected: all tests pass (no tests cover this label string).

- [ ] **Step 3: Commit**

```bash
cd youcoded/desktop
git add src/renderer/components/StatusBar.tsx
git commit -m "fix(ui): update Opus label from 4.6 to 4.7"
```

---

### Task 2: Add `model` to SessionInfo

**Files:**
- Modify: `desktop/src/shared/types.ts:26`
- Modify: `desktop/src/main/session-manager.ts:86`
- Test: `desktop/tests/session-manager.test.ts`

- [ ] **Step 1: Write the failing test**

In `desktop/tests/session-manager.test.ts`, add after the existing `'creates a session and returns session info'` test:

```typescript
it('includes model in session info when provided', () => {
  const info = manager.createSession({
    name: 'model-test',
    cwd: tmpDir,
    skipPermissions: false,
    model: 'claude-sonnet-4-6',
  });
  expect(info.model).toBe('claude-sonnet-4-6');
});

it('has undefined model in session info when not provided', () => {
  const info = manager.createSession({
    name: 'no-model-test',
    cwd: tmpDir,
    skipPermissions: false,
  });
  expect(info.model).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd youcoded/desktop && npm test -- --run tests/session-manager.test.ts 2>&1 | tail -20
```
Expected: FAIL — `info.model` is undefined even when `model` is provided.

- [ ] **Step 3: Add `model` to `SessionInfo` in types.ts**

In `desktop/src/shared/types.ts`, add `model` to `SessionInfo` after `provider`:

```typescript
export interface SessionInfo {
  id: string;
  name: string;
  cwd: string;
  permissionMode: PermissionMode;
  skipPermissions: boolean;
  status: 'active' | 'idle' | 'destroyed';
  createdAt: number;
  /** Which CLI backend this session runs — 'claude' (default) or 'gemini' */
  provider: SessionProvider;
  /** Model alias the session was started with (e.g. 'sonnet', 'opus[1m]') */
  model?: string;
}
```

- [ ] **Step 4: Store model in session-manager.ts**

In `desktop/src/main/session-manager.ts`, the `info` object is built at line 86. Add `model: opts.model`:

```typescript
const info: SessionInfo = {
  id,
  name: opts.name,
  cwd: resolvedCwd,
  permissionMode: opts.skipPermissions ? 'bypass' : 'normal',
  skipPermissions: opts.skipPermissions,
  status: 'active',
  createdAt: Date.now(),
  provider,
  // Store the model alias so the renderer can seed per-session state
  model: opts.model,
};
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd youcoded/desktop && npm test -- --run tests/session-manager.test.ts 2>&1 | tail -20
```
Expected: PASS — both new tests green.

- [ ] **Step 6: Run full test suite**

```bash
cd youcoded/desktop && npm test -- --run 2>&1 | tail -20
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
cd youcoded/desktop
git add src/shared/types.ts src/main/session-manager.ts tests/session-manager.test.ts
git commit -m "feat(session): include model in SessionInfo"
```

---

### Task 3: Per-session model state in App.tsx

**Files:**
- Modify: `desktop/src/renderer/App.tsx` (multiple locations)

This task replaces the global `model` / `setModel` state with a `Map<string, ModelAlias>` keyed by `sessionId`, exactly mirroring the `permissionModes` pattern.

- [ ] **Step 1: Replace global model state with a Map**

Find lines 179–180 in `App.tsx`:
```typescript
const [model, setModel] = useState<ModelAlias>('sonnet');
const [pendingModel, setPendingModel] = useState<ModelAlias | null>(null);
```

Replace with:
```typescript
// Per-session model state — keyed by sessionId, same pattern as permissionModes
const [sessionModels, setSessionModels] = useState<Map<string, ModelAlias>>(new Map());
const [pendingModel, setPendingModel] = useState<ModelAlias | null>(null);
```

- [ ] **Step 2: Derive currentModel from the active session**

Find line 1186 in `App.tsx` where `currentPermissionMode` is derived:
```typescript
const currentPermissionMode = sessionId ? (permissionModes.get(sessionId) || 'normal') : 'normal';
```

Add the model equivalent immediately after it:
```typescript
const currentModel: ModelAlias = sessionId ? (sessionModels.get(sessionId) ?? 'sonnet') : 'sonnet';
```

- [ ] **Step 3: Initialize model in session:created handler**

Find line 375 in `App.tsx` where `permissionModes` is initialized on `session:created`:
```typescript
setPermissionModes((prev) => prev.has(info.id) ? prev : new Map(prev).set(info.id, info.permissionMode || 'normal'));
```

Add the model initialization directly after it:
```typescript
setSessionModels((prev) => {
  if (prev.has(info.id)) return prev;
  // Seed from the model the session was launched with, fall back to sonnet
  const alias = MODELS.find((m) => info.model?.includes(m.replace(/\[.*\]/, ''))) ?? 'sonnet';
  return new Map(prev).set(info.id, alias);
});
```

- [ ] **Step 4: Clean up model on session:destroyed**

Find lines 407–411 in `App.tsx` where `permissionModes` is cleaned up on `session:destroyed`:
```typescript
setPermissionModes((prev) => {
  const next = new Map(prev);
  next.delete(id);
  return next;
});
```

Add the equivalent cleanup directly after it:
```typescript
setSessionModels((prev) => {
  const next = new Map(prev);
  next.delete(id);
  return next;
});
```

- [ ] **Step 5: Fix cycleModel to update per-session Map**

Find `cycleModel` at lines 928–943:
```typescript
const cycleModel = useCallback(() => {
  const idx = MODELS.indexOf(model);
  const next = MODELS[(idx + 1) % MODELS.length];
  setModel(next);
  setPendingModel(next);
  postSwitchTurnReady.current = false;
  (window.claude as any).model?.setPreference(next);
  if (sessionId) {
    window.claude.session.sendInput(sessionId, `/model ${next}\r`);
  }
}, [model, sessionId]);
```

Replace with:
```typescript
const cycleModel = useCallback(() => {
  if (!sessionId) return;
  const idx = MODELS.indexOf(currentModel);
  const next = MODELS[(idx + 1) % MODELS.length];
  setSessionModels((prev) => new Map(prev).set(sessionId, next));
  setPendingModel(next);
  postSwitchTurnReady.current = false;
  (window.claude as any).model?.setPreference(next);
  window.claude.session.sendInput(sessionId, `/model ${next}\r`);
}, [currentModel, sessionId]);
```

**Note:** `currentModel` must be declared before this `useCallback` — it's declared in Step 2 near line 1186, which is AFTER line 928 in the file. You need to move the `currentModel` derivation (from Step 2) up to be near line 1184 (right after `canBypass`), or hoist it. The simplest fix: move the derivation line to just before the `cycleModel` callback. Find the `currentSession` / `canBypass` lines (~1184) and place the `currentModel` derivation right after `canBypass`:

```typescript
const currentSession = sessions.find((s) => s.id === sessionId);
const canBypass = currentSession?.skipPermissions ?? false;
const currentPermissionMode = sessionId ? (permissionModes.get(sessionId) || 'normal') : 'normal';
const currentModel: ModelAlias = sessionId ? (sessionModels.get(sessionId) ?? 'sonnet') : 'sonnet';
```

If you already added `currentModel` in Step 2 at line 1186, just remove the duplicate and keep it here.

- [ ] **Step 6: Fix model-switch verification to revert per-session**

Find line 994 in the `pendingModel` verification effect where a failed model switch reverts:
```typescript
if (actual) {
  setModel(actual);
  (window.claude as any).model?.setPreference(actual);
}
```

Replace with:
```typescript
if (actual) {
  // Revert this session's model to what Claude is actually using
  if (sessionId) setSessionModels((prev) => new Map(prev).set(sessionId, actual));
  (window.claude as any).model?.setPreference(actual);
}
```

- [ ] **Step 7: Fix createSession callback — remove global setModel call**

Find lines 1098–1116, the `createSession` useCallback. Remove the `setModel` line:
```typescript
// Remove these two lines:
if (sessionModel && MODELS.includes(sessionModel as any)) {
  setModel(sessionModel as ModelAlias);
}
```

The `session:created` handler (Step 3) now seeds the per-session Map from `info.model`, so no global update is needed here.

- [ ] **Step 8: Fix handleResumeSession — remove global setModel call**

Find lines 1118–1140, the `handleResumeSession` useCallback. Remove:
```typescript
// Remove these two lines:
if (resumeModel && MODELS.includes(resumeModel as any)) {
  setModel(resumeModel as ModelAlias);
}
```

Same reason — `session:created` handles initialization.

- [ ] **Step 9: Fix line 1099 — `model` fallback in createSession**

Line 1099 reads: `const m = sessionModel || model;`

`model` no longer exists. Replace with:
```typescript
const m = sessionModel || currentModel;
```

Similarly at line 1120 in `handleResumeSession`: `const m = resumeModel || model;`
Replace with:
```typescript
const m = resumeModel || currentModel;
```

- [ ] **Step 10: Pass currentModel to StatusBar**

Find line 1536:
```typescript
model={model}
```

Change to:
```typescript
model={currentModel}
```

- [ ] **Step 11: Pass currentModel to ModelPickerPopup and fix onSelectModel**

Find lines 1702–1712:
```typescript
currentModel={model}
onSelectModel={(m) => {
  // Reuse the existing cycle plumbing but with an explicit target.
  // pendingModel + setModel + PTY send matches the cycleModel flow.
  setModel(m);
  setPendingModel(m);
  (window.claude as any).model?.setPreference(m);
  if (sessionId) {
    window.claude.session.sendInput(sessionId, `/model ${m}\r`);
  }
}}
```

Replace with:
```typescript
currentModel={currentModel}
onSelectModel={(m) => {
  if (!sessionId) return;
  setSessionModels((prev) => new Map(prev).set(sessionId, m));
  setPendingModel(m);
  postSwitchTurnReady.current = false;
  (window.claude as any).model?.setPreference(m);
  window.claude.session.sendInput(sessionId, `/model ${m}\r`);
}}
```

- [ ] **Step 12: Check for any remaining `model` / `setModel` references**

Run a search to catch anything missed:
```bash
cd youcoded/desktop && grep -n '\bsetModel\b\|\bmodel,\b\|model}\|model =' src/renderer/App.tsx | grep -v 'sessionModel\|currentModel\|sessionModels\|pendingModel\|welcomeModel\|resumeModel\|setSessionModels\|MODEL\|getModel\|onSelectModel\|cycleModel\|opts\.model\|info\.model\|\.model\?' | head -20
```

Review each hit. Any remaining `setModel` calls are bugs — convert them to `setSessionModels((prev) => new Map(prev).set(sessionId, ...))`.

- [ ] **Step 13: Build to verify no TypeScript errors**

```bash
cd youcoded/desktop && npm run build 2>&1 | tail -30
```
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 14: Run full test suite**

```bash
cd youcoded/desktop && npm test -- --run 2>&1 | tail -20
```
Expected: all tests pass.

- [ ] **Step 15: Commit**

```bash
cd youcoded/desktop
git add src/renderer/App.tsx
git commit -m "fix(ui): scope model selector to active session"
```

---

## Manual Verification

After all tasks complete, test with `bash scripts/run-dev.sh` from `youcoded-dev/`:

1. Open two sessions — start session A with Sonnet, session B with Opus
2. Confirm status bar shows "Sonnet 4.6" for session A and "Opus 4.7" for session B
3. Switch models in session A via status bar — confirm session B's label doesn't change
4. Switch to session B — confirm it still shows its model
5. Cycle model with Shift+Space in session A — confirm only session A's label changes
6. Close session A — confirm session B still shows correctly
