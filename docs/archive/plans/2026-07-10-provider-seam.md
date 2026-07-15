---
status: shipped
---

# Provider Seam (Phase 0) Implementation Plan

> **STATUS: EXECUTED & MERGED 2026-07-10** — youcoded PR #115 (`29ca27a0` on master). All 9 tasks completed via subagent-driven development with per-task spec + quality reviews and a final whole-branch review (approve, merge-ready). `feat/opencode-mvp` archived in place with `OPENCODE-MVP-ARCHIVED.md`. Phase 1 follow-ups are recorded in the PR body (ungated Shift+Tab, chat-view PTY send paths needing harness routing, subagent reasoning routing, copy-blocks reasoning decision).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Per workspace memory, implementer subagents should run on **Opus or better**.

**Goal:** Land the dormant multi-model provider seam on youcoded master — `SessionProvider = 'claude' | 'native'`, Gemini removed entirely, a two-way `Claude Code | YouCoded` runtime selector gated by the `native.supported` capability flag, runtime-aware UI gating, the collapsible reasoning UI salvaged from `feat/opencode-mvp`, and coupling-registry skeletons — with zero user-visible behavior change except Gemini's removal.

**Architecture:** No new runtime code executes in Phase 0. The seam is types + dormant renderer affordances gated on `window.claude.native.supported`, which is hard-false everywhere except dev builds launched with `YOUCODED_NATIVE=1`. Salvage is re-applied as fresh commits from the `feat/opencode-mvp` branch diff (adapted `'local'` → `'native'`), never cherry-picked blindly — master drifted ~2 months past the branch point.

**Tech Stack:** TypeScript, React 18, Electron, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-10-phase0-foundations-design.md` (in youcoded-dev). ADRs 006–010 in `docs/decisions/`.

**Repo:** All code changes go to the `youcoded` sub-repo via PR. Reference branch: `origin/feat/opencode-mvp` (commits cited per task).

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `desktop/src/shared/types.ts` | Modify | `SessionProvider` union; `NATIVE_SUPPORTED` IPC constant; delete `LOCAL_*` never existed on master (nothing to remove) |
| `desktop/src/main/session-manager.ts` | Modify | Remove gemini command branch |
| `desktop/src/main/ipc-handlers.ts` | Modify | Remove `geminiEnabled` from session defaults |
| `desktop/src/main/preload.ts` | Modify | `window.claude.native.supported`; provider union in `session.create` |
| `desktop/src/renderer/remote-shim.ts` | Modify | `native: { supported: false }` stub |
| `desktop/src/renderer/App.tsx` | Modify | Gemini removal; provider plumbing to ChatView/ModelPicker; permission-badge gating; reasoning dispatch |
| `desktop/src/renderer/components/SessionStrip.tsx` | Modify | Remove `isGemini`; add two-way runtime selector |
| `desktop/src/renderer/components/HeaderBar.tsx` | Modify | Remove `geminiEnabled` plumbing; hide view toggle for native |
| `desktop/src/renderer/components/SettingsPanel.tsx` | Modify | Remove Gemini CLI section |
| `desktop/src/renderer/components/ChatView.tsx` | Modify | `provider` prop → classifier |
| `desktop/src/renderer/hooks/useAttentionClassifier.ts` | Modify | `provider` option short-circuit |
| `desktop/src/renderer/components/ModelPickerPopup.tsx` | Modify | `provider` prop; native guard (minimal) |
| `desktop/src/renderer/state/chat-types.ts` | Modify | `reasoning` segment + `TRANSCRIPT_ASSISTANT_REASONING` action |
| `desktop/src/renderer/state/chat-reducer.ts` | Modify | Reasoning reducer case |
| `desktop/src/renderer/components/AssistantTurnBubble.tsx` | Modify | Collapsible ReasoningSection (from branch) |
| `desktop/src/renderer/components/buddy/BubbleFeed.tsx` | Modify | Reasoning dispatch parity (from branch) |
| `desktop/tests/chat-reducer.test.ts` | Modify | Port reasoning tests from branch |
| `desktop/tests/ipc-channels.test.ts` | Modify | `native` capability parity describe |
| `docs/engine-dependencies.md` | Create | llama.cpp coupling registry skeleton |
| `docs/provider-dependencies.md` | Create | Provider-API coupling registry skeleton |
| `docs/cc-dependencies.md` | Modify | One-line pointer to the seam |

---

## Setup (one-time)

- [ ] **Setup Step 1: Sync and create the worktree**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin && git pull origin master
git worktree add ../youcoded.wt/provider-seam -b feat/provider-seam origin/master
```

Expected: worktree at `C:\Users\desti\youcoded-dev\youcoded.wt\provider-seam` on `feat/provider-seam`.

- [ ] **Setup Step 2: Junction `node_modules`**

```bash
cd /c/Users/desti/youcoded-dev/youcoded.wt/provider-seam/desktop
cmd //c "mklink /J node_modules ..\\..\\..\\youcoded\\desktop\\node_modules"
ls node_modules | head -3
```

**CRITICAL (PITFALLS.md):** before `git worktree remove` later, run `cmd //c "rmdir node_modules"` FIRST — worktree removal follows junctions on Windows and would wipe the main checkout's `node_modules`.

- [ ] **Setup Step 3: Baseline**

```bash
cd /c/Users/desti/youcoded-dev/youcoded.wt/provider-seam/desktop
npx tsc --noEmit && npx vitest run 2>&1 | tail -5
```

Expected: clean typecheck, all tests pass. If the baseline is red, STOP and report — don't build on a broken master.

All subsequent tasks run inside the worktree unless stated otherwise.

---

## Task 1: `SessionProvider` seam in types.ts

**Files:**
- Modify: `desktop/src/shared/types.ts:28-40` (union + SessionInfo comment), IPC block end (~line 823)

Reference: branch commit `88ad7f43` (adapted — we do NOT port the 11 `LOCAL_*` Ollama/OpenCode channels; YAGNI, Phase 1 defines engine channels when they exist).

- [ ] **Step 1: Replace the provider union**

In `desktop/src/shared/types.ts`, replace:

```ts
// Which CLI backend powers a session — defaults to 'claude' for backwards compat
export type SessionProvider = 'claude' | 'gemini';
```

with:

```ts
// Which runtime backend powers a session — defaults to 'claude'.
// 'claude'  = Claude Code CLI over PTY (the original path).
// 'native'  = YouCoded's first-party harness (Phase 1+ of the platform
//             roadmap; dormant until window.claude.native.supported is true).
// 'gemini' was removed 2026-07-10 — Google discontinued the Gemini CLI
// (June 2026); Gemini models are reachable through the native runtime via
// OpenRouter or a direct Google key instead.
export type SessionProvider = 'claude' | 'native';
```

And update the `SessionInfo.provider` doc comment (line ~39):

```ts
  /** Which runtime backend this session runs — 'claude' (default) or 'native' */
  provider: SessionProvider;
```

- [ ] **Step 2: Reserve the capability IPC constant**

At the end of the `IPC` const (after `SYSTEM_BACK: 'system:back',`), add:

```ts
  // ---- Native runtime (YouCoded first-party harness — platform roadmap Phase 1+) ----
  // Capability probe: false everywhere until Phase 1 ships the engine.
  NATIVE_SUPPORTED: 'native:supported',
```

- [ ] **Step 3: Typecheck to find every `'gemini'` compile break**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors in `session-manager.ts`, `App.tsx`, `preload.ts`, `SessionStrip.tsx`, `HeaderBar.tsx` — the exact files Task 2 fixes. Record the list; Task 2 must clear all of them.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/shared/types.ts
git commit -m "types(seam): SessionProvider 'claude' | 'native'; reserve native:supported channel

'gemini' removed from the union (Gemini CLI discontinued June 2026 — see
docs/decisions in youcoded-dev). 'native' is the dormant first-party
harness provider from the platform roadmap Phase 0."
```

(Compile is intentionally broken until Task 2 lands — Tasks 1+2 form one atomic push; do not push between them.)

---

## Task 2: Remove Gemini everywhere

**Files:**
- Modify: `desktop/src/main/session-manager.ts:50-64,148-165`
- Modify: `desktop/src/main/ipc-handlers.ts:714-721`
- Modify: `desktop/src/main/preload.ts:282`
- Modify: `desktop/src/renderer/App.tsx:320,683,694,1310,1772,1776,2258`
- Modify: `desktop/src/renderer/components/SessionStrip.tsx` (props + `isGemini` state + form UI)
- Modify: `desktop/src/renderer/components/HeaderBar.tsx:164,185,294,623`
- Modify: `desktop/src/renderer/components/SettingsPanel.tsx:1288-1289,1321,~1410-1425`

Line numbers verified against master `4f02dacd` (2026-07-10); re-locate by the quoted code if drifted.

- [ ] **Step 1: session-manager.ts — collapse the provider branches**

Replace the args-build block:

```ts
    // Build CLI args — Gemini CLI has no equivalent for Claude's flags
    const args: string[] = [];
    if (provider === 'claude') {
      if (opts.skipPermissions) {
        args.push('--dangerously-skip-permissions');
      }
      if (opts.resumeSessionId) {
        args.push('--resume', opts.resumeSessionId);
      }
      if (opts.model) {
        args.push('--model', opts.model);
      }
    }
    // Gemini CLI launches with no special args for now
```

with:

```ts
    // Build Claude CLI args. The 'native' provider (platform roadmap Phase 1+)
    // never reaches this PTY path — SessionManager will branch before the
    // worker spawn once the native harness exists. Guarded here so a stray
    // native create fails loudly instead of spawning a broken PTY.
    if (provider !== 'claude') {
      throw new Error(`SessionManager: provider '${provider}' has no runtime yet (Phase 1)`);
    }
    const args: string[] = [];
    if (opts.skipPermissions) {
      args.push('--dangerously-skip-permissions');
    }
    if (opts.resumeSessionId) {
      args.push('--resume', opts.resumeSessionId);
    }
    if (opts.model) {
      args.push('--model', opts.model);
    }
```

In the `worker.send({ type: 'spawn', ... })` call, replace:

```ts
        command: provider === 'gemini' ? 'gemini' : 'claude',
```
with:
```ts
        command: 'claude',
```
and replace:
```ts
        sessionId: provider === 'claude' ? id : '',
        pipeName: provider === 'claude' ? this.pipeName : '',
```
with:
```ts
        sessionId: id,
        pipeName: this.pipeName,
```

- [ ] **Step 2: ipc-handlers.ts — drop the default**

In `DEFAULTS_INITIAL` (line ~720), delete the line:

```ts
    geminiEnabled: false, // Opt-in: show Gemini CLI option in new session form
```

(Persisted settings JSON that still contains `geminiEnabled` merges in harmlessly and is ignored by the now-narrower types — no migration needed.)

- [ ] **Step 3: preload.ts — widen the create union**

Line ~282, change `provider?: 'claude' | 'gemini'` to `provider?: 'claude' | 'native'`.

- [ ] **Step 4: App.tsx — six edits**

1. Line 320: remove `geminiEnabled: false` from the `sessionDefaults` useState initializer (and the two lines below if the object is multi-line — keep `skipPermissions`, `model`, `projectFolder`).
2. Line 683 (and the identical line 1310):

```ts
      const defaultView = (info.provider && info.provider !== 'claude') ? 'terminal' : 'chat';
```
→
```ts
      // Native harness sessions (roadmap Phase 1+) are chat-first — they have
      // no PTY, so 'terminal' would be an empty pane. Claude sessions also
      // default to chat. (Gemini, the old terminal-only provider, is gone.)
      const defaultView = 'chat';
```
(At line 1310 the variable reads `sessionInfo.provider` — same replacement.)
3. Line 694: keep the `if (info.provider && info.provider !== 'claude')` initialized-immediately block, but update its comment to say "native sessions have no hook relay — mark initialized immediately".
4. Line 1772: change the signature `provider?: 'claude' | 'gemini'` to `provider?: 'claude' | 'native'`.
5. Line 1776: `name: provider === 'gemini' ? 'Gemini Session' : 'New Session',` → `name: 'New Session',`
6. Line 2258: delete the `geminiEnabled={sessionDefaults.geminiEnabled}` prop.

- [ ] **Step 5: HeaderBar.tsx — remove the pass-through**

- Line 164: `onCreateSession` prop type: `provider?: 'claude' | 'gemini'` → `provider?: 'claude' | 'native'`.
- Delete line 185 (`geminiEnabled?: boolean;`), line 294 (destructure), and line 623 (`geminiEnabled={geminiEnabled}` pass-through to SessionStrip).

- [ ] **Step 6: SessionStrip.tsx — remove `isGemini` (selector arrives in Task 4)**

- Line 31: `onCreateSession` prop type union → `'claude' | 'native'`.
- Delete lines 41 + 156 (`geminiEnabled` prop + destructure).
- Delete line 172 (`const [isGemini, setIsGemini] = useState(false);`).
- Line 349: `onCreateSession(newCwd, dangerous, newModel, isGemini ? 'gemini' : 'claude', launchInNewWindow);` → `onCreateSession(newCwd, dangerous, newModel, 'claude', launchInNewWindow);` and remove `isGemini` from the dep array on line 356; remove the `setIsGemini(false)` reset if present in the same callback.
- Lines ~968 + ~988: remove the `style={{ opacity: isGemini ? ... }}` wrappers (keep the inner content unwrapped — plain `<div>`).
- Line ~1000: `{dangerous && !isGemini && (` → `{dangerous && (`.
- Lines ~1016-1044: delete the entire `{geminiEnabled && (...)}` toggle block, and simplify the Create button: className ternary keeps only the `dangerous` variants, delete the gradient `style={isGemini ? ... }`, label becomes `{dangerous ? 'Create (Dangerous)' : 'Create Session'}`.

- [ ] **Step 7: SettingsPanel.tsx — remove the section**

- Lines 1288-1289: remove `geminiEnabled?: boolean;` / `geminiEnabled: boolean;` from the two prop-type signatures.
- Line 1321: delete `if (defaults.geminiEnabled) summaryParts.push('Gemini');`
- Lines ~1410-1425: delete the whole `{/* Gemini CLI — opt-in toggle ... */}` `<section>`.

- [ ] **Step 8: Sweep for stragglers**

```bash
grep -rni "gemini" desktop/src desktop/tests --include="*.ts" --include="*.tsx" | grep -v "\.test\.ts.*legacy" | head
```

Expected: zero functional hits (comments referencing the removal are fine). Fix any remainder the same way.

- [ ] **Step 9: Typecheck + full test run**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -5
```

Expected: clean. If a test asserts on gemini behavior, delete that test case with a comment pointing at this plan.

- [ ] **Step 10: Commit**

```bash
git add -A desktop docs 2>/dev/null; git add -A desktop
git commit -m "feat(seam): remove the Gemini provider

Google discontinued the Gemini CLI (June 2026). Gemini models remain
reachable through the native runtime via OpenRouter or a direct Google
key (roadmap Phase 1). Removes the Settings opt-in, the isGemini
new-session toggle, and the gemini PTY command branch."
```

---

## Task 3: `window.claude.native.supported` capability flag

**Files:**
- Modify: `desktop/src/main/preload.ts` (new namespace, near the `app:` block at the end of the exposed object)
- Modify: `desktop/src/renderer/remote-shim.ts` (same position — after the `app:` block, where the branch put `local:`)
- Test: `desktop/tests/ipc-channels.test.ts`

Reference: branch commit `65d72637` for placement; the surface shrinks to one flag (no Ollama/OpenCode methods).

- [ ] **Step 1: Write the failing parity test**

Append to `desktop/tests/ipc-channels.test.ts` (follow the file's existing describe style — it reads source files as strings; reuse its `read()` helper or the pattern used by the `pty:raw-bytes` describe):

```ts
// Native runtime capability flag (platform roadmap Phase 0 seam).
// preload and remote-shim must both expose window.claude.native.supported —
// the renderer gates the runtime selector on it without platform branching.
// It is a plain boolean (no IPC round-trip), so there is no ipc-handlers or
// SessionService.kt row — this describe pins shape parity only.
describe('native runtime capability parity', () => {
  it('preload.ts exposes native.supported', () => {
    const src = fs.readFileSync(path.join(SRC, 'main/preload.ts'), 'utf8');
    expect(src).toMatch(/native:\s*\{/);
    expect(src).toMatch(/supported:/);
  });
  it('remote-shim.ts exposes native.supported: false', () => {
    const src = fs.readFileSync(path.join(SRC, 'renderer/remote-shim.ts'), 'utf8');
    expect(src).toMatch(/native:\s*\{/);
    expect(src).toMatch(/supported:\s*false/);
  });
});
```

(Adjust `fs`/`path`/`SRC` to whatever helpers the file already uses — read the top of the file first and match it exactly.)

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/ipc-channels.test.ts 2>&1 | tail -8
```

Expected: the two new `it`s FAIL (namespace not found).

- [ ] **Step 3: Implement the preload namespace**

In `preload.ts`, inside the exposed `window.claude` object (immediately after the `app:` block), add:

```ts
    // Native runtime (YouCoded first-party harness — platform roadmap Phase 1+).
    // Hard-false until Phase 1 ships the local engine + harness. Dev builds can
    // force the dormant UI with YOUCODED_NATIVE=1 (run-dev.sh environment).
    native: {
      supported: process.env.YOUCODED_NATIVE === '1',
    },
```

- [ ] **Step 4: Implement the remote-shim stub**

In `remote-shim.ts`, at the same position in the shim object (after `app:`), add:

```ts
    // Native runtime — desktop Electron only. false on Android/remote-browser
    // so the renderer gates the runtime selector without platform branching.
    native: {
      supported: false,
    },
```

- [ ] **Step 5: Run tests, verify pass, commit**

```bash
npx vitest run tests/ipc-channels.test.ts 2>&1 | tail -5
git add desktop/src/main/preload.ts desktop/src/renderer/remote-shim.ts desktop/tests/ipc-channels.test.ts
git commit -m "feat(seam): window.claude.native.supported capability flag

Hard-false until Phase 1; YOUCODED_NATIVE=1 forces it in dev builds.
Parity pinned in ipc-channels.test.ts (boolean shape — no IPC channel)."
```

---

## Task 4: Two-way runtime selector (`Claude Code | YouCoded`)

**Files:**
- Modify: `desktop/src/renderer/components/SessionStrip.tsx` (new-session form, where Task 2 removed the toggle)

Reference: branch commit `fe98709b`, reduced: two runtimes, YouCoded disabled, no Ollama model fetch.

- [ ] **Step 1: Add the capability check and runtime state**

Near the other `useState` calls in the new-session form region (where `isGemini` used to be):

```ts
  // Runtime selector (platform roadmap Phase 0 seam). Renders only when the
  // native runtime capability is on — with a single runtime there is nothing
  // to select. The YouCoded option is visible-but-disabled until Phase 1
  // ships the engine + harness.
  type Runtime = 'claude' | 'native';
  const [runtime, setRuntime] = useState<Runtime>('claude');
  const nativeSupported = !isAndroid() && !isRemoteMode()
    && (window as any).claude?.native?.supported === true;
```

Ensure `isRemoteMode` is imported: `import { isAndroid, isRemoteMode } from '../platform';`

- [ ] **Step 2: Render the selector above the Model block**

Insert immediately before the Model selector `<div>` in the form (the one Task 2 unwrapped):

```tsx
              {/* Runtime selector — Claude Code vs the YouCoded native harness.
                  Hidden when native.supported is false (the common case until
                  Phase 1): one runtime = no selector. */}
              {nativeSupported && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-fg-muted mb-1 block">Runtime</label>
                  <div className="inline-flex rounded border border-edge overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setRuntime('claude')}
                      className={`px-3 py-1 text-xs ${runtime === 'claude' ? 'bg-accent text-on-accent' : 'bg-panel text-fg hover:bg-inset'}`}
                    >
                      Claude Code
                    </button>
                    <button
                      type="button"
                      disabled
                      title="The YouCoded runtime arrives in a future update"
                      className="px-3 py-1 text-xs bg-panel text-fg-faint cursor-not-allowed"
                    >
                      YouCoded
                    </button>
                  </div>
                  <p className="text-[10px] text-fg-faint mt-1">YouCoded runtime — coming soon</p>
                </div>
              )}
```

(`runtime` is always `'claude'` in Phase 0 — the disabled button never sets it. `handleCreate` keeps passing `'claude'` from Task 2; do NOT wire `runtime` into it yet, that's Phase 1's job when the option becomes enabled.)

- [ ] **Step 3: Typecheck + tests**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -4
```

- [ ] **Step 4: Manual verify in the dev instance (from the WORKTREE, never the live app)**

```bash
cd /c/Users/desti/youcoded-dev/youcoded.wt/provider-seam
bash ../../scripts/run-dev.sh
```

Check: new-session form shows NO Runtime row. Quit, relaunch with `YOUCODED_NATIVE=1 bash ../../scripts/run-dev.sh` — Runtime row shows `Claude Code` (active) and `YouCoded` (disabled, tooltip). Close the dev instance when done.

(If `run-dev.sh` doesn't pass arbitrary env through, prefix the command with the var as shown — it's a bash script; `YOUCODED_NATIVE=1 bash ...` propagates into Electron and its preload.)

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/components/SessionStrip.tsx
git commit -m "feat(seam): two-way runtime selector (Claude Code | YouCoded), capability-gated

Renders only when native.supported; YouCoded option disabled until the
Phase 1 engine + harness exist. Selector state never leaves 'claude' in
Phase 0."
```

---

## Task 5: Runtime-aware UI gating

**Files:**
- Modify: `desktop/src/renderer/hooks/useAttentionClassifier.ts` (HookArgs + active gate)
- Modify: `desktop/src/renderer/components/ChatView.tsx` (provider prop)
- Modify: `desktop/src/renderer/components/HeaderBar.tsx` (SessionEntry.provider + showToggle)
- Modify: `desktop/src/renderer/App.tsx` (pass provider; permission-badge gating)
- Modify: `desktop/src/renderer/components/ModelPickerPopup.tsx` (provider prop, native guard)

Reference: branch commit `338e6189`, adapted `'local'` → `'native'`. Skip the branch's `sessionModels` string-widening and Ollama model list — those return in Phase 1 with the real catalog.

- [ ] **Step 1: useAttentionClassifier — provider option**

In `HookArgs` add:

```ts
  /** Which runtime backend this session uses. The classifier reads the xterm
   *  PTY buffer — only meaningful for PTY sessions ('claude'). Native harness
   *  sessions have no buffer; the hook short-circuits for them. */
  provider?: 'claude' | 'native';
```

Destructure `provider` with the other args, then change the `active` line:

```ts
  // Classifier reads the xterm PTY buffer — only PTY sessions have one.
  const hasBuffer = provider === undefined || provider === 'claude';
  const active = hasBuffer && isThinking && !hasRunningTools && !hasAwaitingApproval && visible;
```

- [ ] **Step 2: ChatView — accept and forward provider**

In `Props` add:

```ts
  /** Runtime backend — forwarded to useAttentionClassifier so it
   *  short-circuits for sessions without a PTY (native harness). */
  provider?: 'claude' | 'native';
```

Destructure it in the component signature and add `provider,` to the `useAttentionClassifier(...)` args object (after `currentAttentionState`).

- [ ] **Step 3: HeaderBar — provider on SessionEntry + hide the view toggle**

In the `SessionEntry` interface (line ~143) add:

```ts
  /** Runtime backend — mirrors SessionInfo.provider. */
  provider?: 'claude' | 'native';
```

Below the existing `showToggleLabels` state (line ~210), add:

```ts
  // Native harness sessions have no PTY — the chat/terminal toggle would show
  // an empty terminal pane. Hide it for them.
  const activeSessionProvider = sessions.find(s => s.id === activeSessionId)?.provider;
  const showToggle = activeSessionProvider !== 'native';
```

Then gate both render sites: `{toggleOnLeft && toggleElement}` → `{toggleOnLeft && showToggle && toggleElement}` and `{!toggleOnLeft && toggleElement}` → `{!toggleOnLeft && showToggle && toggleElement}`.

(Check what App passes as `sessions` — it's SessionInfo-derived and already carries `provider`; if the mapping strips fields, add `provider: s.provider` to the mapped object.)

- [ ] **Step 4: App.tsx — permission badge + ChatView/ModelPicker plumbing**

Next to `const canBypass = currentSession?.skipPermissions ?? false;` (line ~1714 on the branch; locate by `canBypass`), add:

```ts
  // Native sessions: permission modes are a harness policy (Phase 2), not a
  // PTY shift+tab cycle — hide the badge + cycle affordance for them.
  const isNativeSession = currentSession?.provider === 'native';
```

Where StatusBar (or the header component) receives `permissionMode={currentPermissionMode}` and `onCyclePermission={cyclePermission}`, change to:

```ts
                  permissionMode={isNativeSession ? undefined : currentPermissionMode}
                  onCyclePermission={isNativeSession ? undefined : cyclePermission}
```

Where `<ChatView ... resumeInfo={resumeInfo} />` is rendered (inside the sessions map, line ~2014 region), add `provider={s.provider}`.

Where `<ModelPickerPopup ... />` is rendered (line ~2291 region), add `provider={currentSession?.provider}`.

- [ ] **Step 5: ModelPickerPopup — minimal native guard**

In `Props` add:

```ts
  /** Runtime backend — Phase 1 replaces this guard with a provider-scoped
   *  model catalog; in Phase 0 native sessions cannot exist, so this only
   *  pins the seam. */
  provider?: 'claude' | 'native';
```

Destructure `provider`, and immediately after the existing `if (!open) return null;` add:

```ts
  // Native sessions get a provider-scoped picker in Phase 1. Until then
  // (and they can't be created yet), render nothing rather than a Claude
  // alias list that would send /model down a nonexistent PTY.
  if (provider === 'native') return null;
```

- [ ] **Step 6: Typecheck, tests, commit**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -4
git add desktop/src/renderer
git commit -m "feat(seam): runtime-aware UI gating for native sessions

Attention classifier short-circuits (no PTY buffer), HeaderBar hides the
chat/terminal toggle, permission badge + cycle hidden, ModelPicker
guarded. All dormant until native sessions can exist (Phase 1)."
```

---

## Task 6: Collapsible reasoning UI salvage

**Files:**
- Modify: `desktop/src/renderer/state/chat-types.ts`, `chat-reducer.ts`, `App.tsx`, `components/AssistantTurnBubble.tsx`, `components/buddy/BubbleFeed.tsx`
- Test: `desktop/tests/chat-reducer.test.ts`

Reference: branch commit `eb3ac2ea` — port ONLY the renderer/reducer halves (the SSE-adapter half is OpenCode-specific and stays behind). Master's chat-types/chat-reducer drifted just 2 commits since the branch point, so the diffs apply nearly clean.

- [ ] **Step 1: chat-types.ts — segment + action**

Add to `AssistantTurnSegment` (after the `text` variant):

```ts
  // Reasoning / extended-thinking content with a text payload. The native
  // harness (Phase 2) streams these for thinking models; CC's transcript
  // path may also carry thinking text in future. Rendered as a collapsible
  // disclosure attached to the next text bubble. partId merges streaming
  // chunks into one segment, mirroring the text streaming path.
  | { type: 'reasoning'; content: string; messageId: string; partId?: string }
```

Update the `TRANSCRIPT_THINKING_HEARTBEAT` comment and add the new action after it:

```ts
  | {
      // Heartbeat fired when the transcript watcher sees an assistant
      // thinking block WITHOUT text payload — a lifecycle marker only.
      // No UI; bumps lastActivityAt and clears attentionState to 'ok'.
      type: 'TRANSCRIPT_THINKING_HEARTBEAT';
      sessionId: string;
    }
  | {
      // Streaming reasoning chunk WITH text payload. Merged into a single
      // reasoning segment by partId, rendered as a collapsible disclosure
      // in AssistantTurnBubble. Bumps lastActivityAt + clears attentionState.
      type: 'TRANSCRIPT_ASSISTANT_REASONING';
      sessionId: string;
      uuid: string;
      text: string;
      timestamp: number;
      partId?: string;
    }
```

- [ ] **Step 2: chat-reducer.ts — the reasoning case**

Insert before `case 'TRANSCRIPT_TOOL_USE':`

```ts
    // Streaming reasoning chunk with text payload. Mirrors the
    // TRANSCRIPT_ASSISTANT_TEXT streaming path: same partId merges chunks
    // into one segment instead of creating a new bubble per token.
    case 'TRANSCRIPT_ASSISTANT_REASONING': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      const { assistantTurns, timeline, currentTurnId } = getOrCreateTurn(session);
      const turn = assistantTurns.get(currentTurnId)!;
      let segments = turn.segments;
      const lastIdx = segments.length - 1;
      const last = lastIdx >= 0 ? segments[lastIdx] : null;
      if (
        action.partId
        && last
        && last.type === 'reasoning'
        && last.partId === action.partId
      ) {
        const merged = { ...last, content: last.content + action.text };
        segments = [...segments.slice(0, lastIdx), merged];
      } else {
        segments = [
          ...segments,
          { type: 'reasoning', content: action.text, messageId: nextMessageId(), partId: action.partId },
        ];
      }
      assistantTurns.set(currentTurnId, { ...turn, segments });

      next.set(action.sessionId, {
        ...session, assistantTurns, timeline, currentTurnId,
        currentGroupId: null,
        lastActivityAt: Date.now(),
        attentionState: 'ok',
      });
      return next;
    }
```

(If `getOrCreateTurn` / `nextMessageId` have been renamed on master, mirror whatever `TRANSCRIPT_ASSISTANT_TEXT` uses — the two cases must stay structurally parallel.)

- [ ] **Step 3: App.tsx dispatch split**

Find the `assistant-thinking` case in the transcript-event switch (~line 841). Replace its body:

```ts
        case 'assistant-thinking': {
          // Text payload → real reasoning content (collapsible in chat).
          // No payload → lifecycle heartbeat only (existing behavior).
          if (event.data?.text) {
            dispatch({
              type: 'TRANSCRIPT_ASSISTANT_REASONING',
              sessionId: event.sessionId,
              uuid: event.uuid,
              text: event.data.text,
              timestamp: event.timestamp,
              partId: (event.data as any).partId,
            });
          } else {
            dispatch({ type: 'TRANSCRIPT_THINKING_HEARTBEAT', sessionId: event.sessionId });
          }
          break;
        }
```

(Keep whatever additional statements the current case carries — e.g. attention bookkeeping — by preserving them around the dispatch split. Diff the current case body first.)

- [ ] **Step 4: AssistantTurnBubble + BubbleFeed — apply the branch diff**

```bash
git show eb3ac2ea -- desktop/src/renderer/components/AssistantTurnBubble.tsx desktop/src/renderer/components/buddy/BubbleFeed.tsx > /tmp/reasoning-ui.patch
git apply -3 /tmp/reasoning-ui.patch || git apply --reject /tmp/reasoning-ui.patch
```

If hunks reject (master drift), apply by hand from the `.rej` files. The shape to preserve: `splitIntoBubbles` attaches a preceding `reasoning` segment to the next `text` bubble; a `ReasoningSection` component renders it collapsed by default ("Show reasoning" disclosure). In BubbleFeed, mirror the App.tsx dispatch split from Step 3. Remove any `'local'`/OpenCode wording from ported comments — say "native harness / thinking models".

```bash
rm -f desktop/src/renderer/components/*.rej desktop/src/renderer/components/buddy/*.rej /tmp/reasoning-ui.patch
```

- [ ] **Step 5: Port the reducer tests**

```bash
git show eb3ac2ea -- desktop/tests/chat-reducer.test.ts > /tmp/reasoning-tests.patch
git apply -3 /tmp/reasoning-tests.patch || git apply --reject /tmp/reasoning-tests.patch
```

Same drill: the tests cover (a) partId chunk merging into one segment, (b) a new partId starting a new segment, (c) attentionState reset. Fix rejects by hand; the assertions port unchanged.

- [ ] **Step 6: Run tests + typecheck, commit**

```bash
npx tsc --noEmit && npx vitest run tests/chat-reducer.test.ts 2>&1 | tail -5 && npx vitest run 2>&1 | tail -4
git add desktop/src desktop/tests
git commit -m "feat(chat): collapsible reasoning segments (salvaged from feat/opencode-mvp)

assistant-thinking events with a text payload become merged 'reasoning'
segments rendered as a collapsed disclosure on the next answer bubble;
payload-less events stay heartbeats. Benefits CC extended thinking and
the Phase 2 native harness alike."
```

---

## Task 7: Coupling-registry skeletons

**Files:**
- Create: `docs/engine-dependencies.md`
- Create: `docs/provider-dependencies.md`
- Modify: `docs/cc-dependencies.md` (one pointer line near the top)

- [ ] **Step 1: Create `docs/engine-dependencies.md`**

```markdown
# Engine Coupling Registry (llama.cpp)

Tracks every YouCoded touchpoint to the bundled llama.cpp engine
(`llama-server`), mirroring the `cc-dependencies.md` discipline. Populated
starting Phase 1 of the platform roadmap (see youcoded-dev
`docs/superpowers/specs/2026-07-09-platform-vision-roadmap.md` and ADR 007).

## Pinned version

_None yet — Phase 1 pins the first engine build here. Bump together with a
full coupling re-check + smoke probes._

## Touchpoints (to be filled as built)

- **`llama-server` CLI flags** — router mode, `--host/--port/--no-webui/--jinja`. (engine-supervisor)
- **Health/readiness endpoint** — poll target for spawn supervision. (engine-supervisor)
- **`/models`, `/models/load`, `/models/unload`** — router-mode model management. (model-catalog, engine-supervisor)
- **`/v1/chat/completions`** — OpenAI-compat surface incl. `tools`, `json_schema`. (provider layer via @ai-sdk/openai-compatible)
- **GGUF cache directory layout** — router auto-discovery contract. (model manager)
- **`-hf user/repo:QUANT` download semantics.** (model manager)

## Verification

_Phase 1 adds smoke probes analogous to `test-conpty/` (spawn real engine,
assert health + tool-call round-trip). Re-run on every engine bump._
```

- [ ] **Step 2: Create `docs/provider-dependencies.md`**

```markdown
# Provider Coupling Registry (cloud APIs + AI SDK)

Tracks YouCoded's couplings to external model-provider APIs and the Vercel
AI SDK, mirroring `cc-dependencies.md`. Populated starting Phase 1 (ADR 006).

## Pinned versions

_None yet — Phase 1 pins the AI SDK major/minor here._

## Touchpoints (to be filled as built)

- **Vercel AI SDK surface** — `streamText` stream-part shapes, tool-approval
  mechanism (`needsApproval` vs `toolApproval` — version-sensitive), provider
  factory signatures. (harness, provider-registry)
- **models.dev `api.json` schema** — model/provider metadata. (model-catalog)
- **OpenRouter** — `/api/v1/models` shape, attribution headers
  (`HTTP-Referer`, `X-OpenRouter-Title`), BYOK behavior. (provider-registry)
- **Per-vendor quirks** — reasoning blocks, prompt caching, rate-limit
  headers; one entry per adopted `@ai-sdk/*` provider. (provider-registry)
```

- [ ] **Step 3: Pointer in `docs/cc-dependencies.md`**

After the intro paragraph at the top of the file, add:

```markdown
> **Sibling registries:** `engine-dependencies.md` (bundled llama.cpp) and
> `provider-dependencies.md` (cloud provider APIs + AI SDK) track the
> non-Claude backends introduced by the platform roadmap (Phase 0 seam:
> `SessionProvider = 'claude' | 'native'`).
```

- [ ] **Step 4: Commit**

```bash
git add docs/engine-dependencies.md docs/provider-dependencies.md docs/cc-dependencies.md
git commit -m "docs(seam): engine + provider coupling-registry skeletons"
```

---

## Task 8: Full verification

- [ ] **Step 1: Typecheck, full test suite, production build (sequentially — never concurrent with any Gradle build per build-and-release.md)**

```bash
cd /c/Users/desti/youcoded-dev/youcoded.wt/provider-seam/desktop
npx tsc --noEmit && npx vitest run 2>&1 | tail -6 && npm run build 2>&1 | tail -4
```

Expected: all green.

- [ ] **Step 2: Dev-instance behavioral pass (worktree dev instance only — NEVER the live app)**

1. `bash ../../scripts/run-dev.sh` (no env var): create a Claude session; verify chat + terminal views, permission badge, model picker, attention behavior all unchanged; new-session form has NO Runtime row and NO Gemini toggle; Settings no longer shows the Gemini CLI section.
2. Relaunch with `YOUCODED_NATIVE=1`: Runtime row appears (`Claude Code` active, `YouCoded` disabled).
3. Shut the dev instance down.

- [ ] **Step 3: Reasoning UI spot-check (fixture route)**

If a `.jsonl` fixture with a thinking block exists in `desktop/src/renderer/dev/fixtures/`, run `bash ../../scripts/run-sandbox.sh` and confirm ToolCards render unchanged. Otherwise verify via the ported reducer tests only (already green) — a live CC extended-thinking turn in the dev instance is a bonus check, not a gate.

---

## Task 9: PR + branch archival

- [ ] **Step 1: Push and open the PR**

```bash
cd /c/Users/desti/youcoded-dev/youcoded.wt/provider-seam
git push -u origin feat/provider-seam
gh pr create --title "Provider seam (platform Phase 0): native runtime seam + Gemini removal" --body "$(cat <<'EOF'
Lands the dormant multi-model provider seam from the platform roadmap
(youcoded-dev docs/superpowers/specs/2026-07-09-platform-vision-roadmap.md,
Phase 0 spec 2026-07-10-phase0-foundations-design.md, ADRs 006-010):

- SessionProvider = 'claude' | 'native'; native:supported IPC constant reserved
- Gemini provider removed entirely (CLI discontinued June 2026; Gemini models
  return via the native runtime in Phase 1 through OpenRouter/direct key)
- Two-way runtime selector (Claude Code | YouCoded), rendered only when
  window.claude.native.supported (hard-false until Phase 1; YOUCODED_NATIVE=1
  dev override); YouCoded option disabled
- Runtime-aware gating: attention classifier, header view toggle, permission
  badge, model picker
- Collapsible reasoning segments salvaged from feat/opencode-mvp (benefits CC
  extended thinking too)
- engine-dependencies.md + provider-dependencies.md registry skeletons

User-visible change with default flags: Gemini removal only.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Archive `feat/opencode-mvp` in place**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git worktree list   # confirm ../youcoded.wt/opencode-mvp still holds the branch
cd ../youcoded.wt/opencode-mvp
cat > OPENCODE-MVP-ARCHIVED.md <<'EOF'
# ARCHIVED — do not merge

This branch is the complete OpenCode-as-provider MVP (May 2026). It was
superseded by the platform roadmap (youcoded-dev
`docs/superpowers/specs/2026-07-09-platform-vision-roadmap.md`): the native
harness replaces the OpenCode daemon, and llama.cpp-direct replaces Ollama
(ADRs 006/007). Kept as REFERENCE MATERIAL:

- `desktop/src/main/opencode-session-adapter.ts` — event-translation patterns
  (streaming deltas, tool state machine, resume hydration, uuid dedup) that
  inform the Phase 2 native harness
- `desktop/src/main/opencode-service.ts` + tests — subprocess supervision
  pattern reused by the Phase 1 EngineSupervisor
- `desktop/src/main/ollama-detector.ts` — basis for the Phase 1 optional
  Ollama endpoint detector
- `desktop/test-ollama/probe-model.mjs` — capability-probe harness idea

The salvageable UI/seam work was re-applied to master via feat/provider-seam.
EOF
git add OPENCODE-MVP-ARCHIVED.md
git commit -m "docs: archive branch — superseded by the platform roadmap; reference only"
git push origin feat/opencode-mvp
```

- [ ] **Step 3: Report back for review**

Post the PR link. Merging, worktree cleanup (junction first! `cmd //c "rmdir node_modules"` before `git worktree remove`), and branch deletion happen after review + approval per the workspace's finishing-a-development-branch flow.

---

## Self-review notes (spec coverage)

- Spec §2 provider seam → Tasks 1, 3, 4, 5. Gemini removal (§2, §4) → Task 2. Reasoning salvage (§4 table) → Task 6. Registry skeletons (§5) → Task 7. Exit criteria (§7) → Tasks 3 (parity test), 8 (verification). Branch archival (§4) → Task 9.
- Native home (§1), interfaces (§2 code), session store (§3) ship **no code in Phase 0** — they're Phase 1 build targets; nothing to implement here by design.
- Out of scope confirmed: no Kotlin changes (remote-shim `supported: false` covers Android via the shared bridge shim), no engine binary, no `~/.youcoded/` writer.
