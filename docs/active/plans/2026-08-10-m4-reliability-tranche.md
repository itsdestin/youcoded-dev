---
status: draft
milestone: M4
program: docs/active/plans/2026-07-22-native-runtime-parity-program.md
---

# M4 Reliability Tranche — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the native-session defects where information the app already has fails to reach the place that needs it — cache stats, engine load state, and images.

**Architecture:** No new subsystems. Every task in this tranche is a wiring fix: a selector that drops fields it was handed, an IPC channel with no renderer subscriber, and a tool that refuses content the model was told to fetch. Two further items get verification tasks rather than fixes, because their July descriptions did not survive contact with the code.

**Tech Stack:** TypeScript, React 19, Electron, Vitest, `@ai-sdk` v7.

## Global Constraints

- **Read `docs/active/plans/2026-07-22-native-runtime-parity-program.md` §5 before starting.** Its item list is stale — see "Verified state" below. This plan supersedes §5's descriptions where they conflict.
- **Every user-facing string follows `docs/error-message-standards.md`** — specific and accurate, or general and non-committal. Never a guessed cause.
- **Desktop only.** Android has no native runtime (M8). No Kotlin changes in this tranche.
- **`bash scripts/verify.sh <worktree>` must pass before every commit** — tsc, related tests, knip, eslint, ast-grep.
- **Non-trivial edits carry a WHY comment** at the edit site.
- **Work in a worktree**, not the main checkout. Serena resolves against master and cannot see your branch.

---

## Verified state (2026-08-10) — read this before trusting §5

Every item below was checked against the code. Four of seven were wrong. The pattern is not incidental: §5 was written in July and #268 landed a large amount of work across exactly this surface without rewriting the list.

| §5 item | July description | Verified state |
|---|---|---|
| 1 Usage chips | "usage bridge" needed | **Prescription already known wrong** (§5 says so). Remaining: `StatusBar.tsx:1086-1107` Cached/Hit chips read `sessionStats` alone. `NativeUsageInput` already carries `cacheReadTokens`/`cacheCreationTokens`; `NativeStatusChips` drops them. → **Task 1** |
| 2 Cost chip | running cost estimate | Blocked on M6 item 2 pricing sourcing, which does not exist. **Out of tranche.** |
| 3 PTY-less stuck detection | "native sessions have no stuck detection" | **STALE.** `harness-session.ts:1271-1277` runs a two-stage watchdog — `STALL_WARNING_MS` 60s emits a warning heartbeat driving a UI countdown, `STALL_RETRY_COUNTDOWN_MS` 15s then retries or throws `StreamStallError`. Prefill-aware (`prefillBudgetMs`). The renderer classifier's `hasBuffer` gate is correct, not an oversight. → **Task 4 (verify only)** |
| 4 Stall observability | local stall messaging | Largely shipped in #268. Remaining: no UI for "which model is loaded / is it loading". `engine:status` + `engine:status-changed` exist in `shared/types.ts:1208-1213`; the only renderer file referencing them is `remote-shim.ts`, which is transport, not UI. → **Task 3** |
| 5 Switcher races | pill vanishes mid-resume; `/model` wedges | **Unverified.** Both are timing bugs that cannot be confirmed statically. → **Task 5 (diagnose)** |
| 6 Multimodal | 6a "InputBar builds text parts only"; 6b Read refuses images | **WRONG, and 6a/6b are ONE bug.** Attachments are never image parts: `InputBar.handlePaste` calls `saveClipboardImage()` → a **file path**, `addFiles([path])`, and `buildOutgoingMessage` prepends the path to the message text. The model then *reads* it. CC's Read returns images; the native Read refuses binaries (`tools/read.ts:40-42` NUL sniff). So an attached image fails in native sessions **at the Read tool**, and fixing 6b fixes 6a. → **Task 2** |
| 7 Folderless sessions | "forms require a folder so the heuristic never fires" | **Half wrong.** The heuristic exists and works — `RuntimeBinding.tsx`, `cwd.trim() ? 'coder' : 'assistant'`. Only the form gate remains. Low priority per Destin. **Out of tranche.** |

**Blocking gap for Task 2:** there is **no vision/multimodal capability flag** anywhere — `grep` for `vision|supportsImages|multimodal` across `capability-profile.ts` and `known-models.ts` returns nothing. Task 2 adds a minimal one; the full sourcing is M6 item 2.

---

### Task 1: Cache chips read native usage

The In/Out and Speed chips got a `?? nativeChips` fallback on 2026-07-28. The two cache chips beside them did not, so they render `--` forever in native sessions while the data sits in the same payload.

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/StatusBar.tsx:154-163` (`NativeStatusChips`), `:187-193` (selector return), `:1082-1109` (both chips)
- Test: `youcoded/desktop/tests/statusbar-native-usage.test.ts`

**Interfaces:**
- Consumes: `NativeUsageInput` (already has `cacheReadTokens?`, `cacheCreationTokens?`)
- Produces: `NativeStatusChips.cacheReadTokens: number | null`, `NativeStatusChips.cacheCreationTokens: number | null`

- [ ] **Step 1: Write the failing test**

```ts
// youcoded/desktop/tests/statusbar-native-usage.test.ts
import { describe, it, expect } from 'vitest';
import { selectNativeStatusChips } from '../src/renderer/components/StatusBar';

describe('selectNativeStatusChips — cache fields', () => {
  it('passes cache tokens through so the Cached/Hit chips can use them', () => {
    const chips = selectNativeStatusChips(
      { inputTokens: 100, outputTokens: 20, cacheReadTokens: 900, cacheCreationTokens: 100 },
      8_000,
    );
    expect(chips?.cacheReadTokens).toBe(900);
    expect(chips?.cacheCreationTokens).toBe(100);
  });

  it('reports null rather than 0 when the provider sent no cache data', () => {
    // 0 and "absent" are different facts: 0 reads is a real 0% hit rate, absent
    // must stay '--'. Collapsing them would invent a statistic.
    const chips = selectNativeStatusChips({ inputTokens: 100, outputTokens: 20 }, 8_000);
    expect(chips?.cacheReadTokens).toBeNull();
    expect(chips?.cacheCreationTokens).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/statusbar-native-usage.test.ts -t 'cache fields'`
Expected: FAIL — `expected undefined to be 900`

- [ ] **Step 3: Extend the chips interface and the selector**

In `StatusBar.tsx`, add to `NativeStatusChips` (after `tokensPerSecond: number;`):

```ts
  /** Cache tokens for the Cached/Hit chips. null (not 0) when the provider sent
   *  none — 0 reads is a real 0% hit rate, absent must stay '--'. */
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
```

And in the `selectNativeStatusChips` return object, after `tokensPerSecond,`:

```ts
    cacheReadTokens: usage.cacheReadTokens ?? null,
    cacheCreationTokens: usage.cacheCreationTokens ?? null,
```

- [ ] **Step 4: Wire both chips to the fallback**

Replace `StatusBar.tsx:1082-1109` with (note `cr`/`cc`: the fallback is resolved once so the title, the value, and the hit-rate math cannot disagree):

```tsx
      {/* Cache efficiency. WHY the ?? nativeChips fallback: sessionStats is written
          by Claude Code's statusline, which native sessions never run — these two
          chips sat at '--' forever while the harness shipped the numbers on every
          turn-complete. Same fix the In/Out and Speed chips got on 2026-07-28. */}
      {show('cache-stats') && (() => {
        const cr = ss?.cacheReadTokens ?? nativeChips?.cacheReadTokens ?? null;
        const cc = ss?.cacheCreationTokens ?? nativeChips?.cacheCreationTokens ?? null;
        return (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-panel border border-edge-dim"
            title={cr != null ? `Cache read: ${cr.toLocaleString()} | Cache created: ${(cc ?? 0).toLocaleString()}` : 'Cache efficiency'}
          >
            <span className="text-fg-muted">Cached:</span>
            <span className="text-[#4CAF50]">{cr != null ? formatTokens(cr) : '--'}</span>
          </span>
        );
      })()}

      {/* Cache hit rate — derived: cacheRead / (cacheRead + cacheCreation) */}
      {show('cache-hit-rate') && (() => {
        const cr = ss?.cacheReadTokens ?? nativeChips?.cacheReadTokens ?? null;
        const cc = ss?.cacheCreationTokens ?? nativeChips?.cacheCreationTokens ?? null;
        const total = (cr ?? 0) + (cc ?? 0);
        const pct = cr != null && total > 0 ? Math.round((cr / total) * 100) : null;
        return (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-panel border border-edge-dim"
            title={cr != null ? `${cr.toLocaleString()} reads / ${total.toLocaleString()} total cached tokens` : 'Cache hit rate'}
          >
            <span className="text-fg-muted">Hit:</span>
            {cr == null ? <span className="text-fg-2">--</span>
              : pct == null ? <span className="text-fg-muted">N/A</span>
              : <span className={pct >= 80 ? 'text-[#4CAF50]' : pct >= 50 ? 'text-[#FF9800]' : 'text-[#DD4444]'}>{pct}%</span>}
          </span>
        );
      })()}
```

- [ ] **Step 5: Run the suite and verify**

Run: `cd youcoded/desktop && npx vitest run tests/statusbar-native-usage.test.ts`
Expected: PASS, all cases.

Then: `bash scripts/verify.sh <worktree>` — expected all five checks PASS.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/renderer/components/StatusBar.tsx desktop/tests/statusbar-native-usage.test.ts
git commit -m "fix(native): Cached/Hit chips read native usage instead of showing --"
```

---

### Task 2: Native Read returns images (this is §5 item 6, both halves)

An attached image is a **file path in the message text**, not an image part. Claude Code's Read returns the image; the native Read refuses it on the NUL-byte binary sniff. That single refusal is why attachments appear to "not work" in native sessions — there is nothing to fix in `InputBar`.

**Files:**
- Modify: `youcoded/desktop/src/main/harness/tools/read.ts:45-60` (description + image branch)
- Modify: `youcoded/desktop/src/main/harness/capability-profile.ts` (add `supportsVision`)
- Modify: `youcoded/desktop/src/main/harness/known-models.ts` (registry flag)
- Test: `youcoded/desktop/tests/read-tool-images.test.ts`, `youcoded/desktop/tests/capability-profile.test.ts`

**Interfaces:**
- Produces: `CapabilityProfile.supportsVision: boolean` — consumed by nothing else in this tranche; M6 item 2 will source it properly.

**Design decisions, settled before implementation:**
- **Non-vision models keep the refusal.** Handing an image to a text-only local model is either a provider error or silent nonsense. The refusal message must name the reason (model can't see images) rather than the old one (file is binary) — they are different facts.
- **`supportsVision` defaults to `false`** everywhere except where the registry says otherwise. Conservative: a wrong `true` breaks the session, a wrong `false` degrades to today's behaviour.
- **Respect the existing sensitive-path denylist** (`read-binary-access.ts`). Image reads get no privilege the text path lacks.

- [ ] **Step 1: Write the failing capability test**

```ts
// append to youcoded/desktop/tests/capability-profile.test.ts
describe('supportsVision', () => {
  it('defaults to false for an unknown local model', () => {
    // Conservative default: a wrong `true` breaks the turn with a provider
    // error; a wrong `false` just keeps today's refusal.
    const p = resolveProfile({ providerType: 'local', modelId: 'some-unknown-gguf', contextWindow: 8_000 });
    expect(p.supportsVision).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd youcoded/desktop && npx vitest run tests/capability-profile.test.ts -t supportsVision`
Expected: FAIL — `expected undefined to be false`

- [ ] **Step 3: Add the flag**

In `capability-profile.ts`, add to `CapabilityProfile`:

```ts
  /** Whether this model can accept image content. Defaults false — a wrong true
   *  breaks the turn with a provider error, a wrong false only keeps the existing
   *  refusal. Properly sourced by M6 item 2; this is the minimum Task 2 needs. */
  supportsVision: boolean;
```

Add `supportsVision: false` to `CLOUD_DEFAULT` and to `localFallback`'s returned object, and `supportsVision: true` to the frontier entries in `known-models.ts` that are known-vision. Flag each with `// UNVERIFIED` per the registry's existing convention.

- [ ] **Step 4: Write the failing Read test**

```ts
// youcoded/desktop/tests/read-tool-images.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ReadTool } from '../src/main/harness/tools/read';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Read tool — images', () => {
  it('returns image content to a vision-capable model', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-img-'));
    const p = path.join(dir, 'pixel.png');
    fs.writeFileSync(p, PNG);
    const r = await ReadTool.execute({ file_path: p }, { cwd: dir, profile: { supportsVision: true } } as any);
    expect(r.images?.[0]?.mediaType).toBe('image/png');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('refuses for a model that cannot see images, naming THAT reason', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-img-'));
    const p = path.join(dir, 'pixel.png');
    fs.writeFileSync(p, PNG);
    const r = await ReadTool.execute({ file_path: p }, { cwd: dir, profile: { supportsVision: false } } as any);
    // The old message said "it is a binary file", which is a different fact and
    // sends the model looking for a text workaround that does not exist.
    expect(r.text).toContain('cannot view images');
    expect(r.text).not.toContain('binary file');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('still refuses a genuinely non-image binary, as before', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-img-'));
    const p = path.join(dir, 'blob.bin');
    fs.writeFileSync(p, Buffer.from([0, 1, 2, 0, 3]));
    const r = await ReadTool.execute({ file_path: p }, { cwd: dir, profile: { supportsVision: true } } as any);
    expect(r.text).toContain('binary file');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 5: Run it and confirm it fails**

Run: `cd youcoded/desktop && npx vitest run tests/read-tool-images.test.ts`
Expected: FAIL on all three — no image branch exists.

- [ ] **Step 6: Implement the image branch**

In `read.ts`, before the NUL-sniff refusal, detect image extensions (`.png .jpg .jpeg .gif .webp`) and branch. Update the schema description first — it currently claims only "Read a file from the filesystem", which is why models try images and eat a refusal:

```ts
  description:
    'Read a file from the filesystem. Returns numbered lines for text files, and '
    + 'image content for .png/.jpg/.jpeg/.gif/.webp when the model can view images. '
    + 'Use offset and limit for large files — output is capped at 2000 lines.',
```

Then the branch: on an image extension, if `ctx.profile.supportsVision` return the bytes as an image part with the mapped `mediaType`; otherwise return the honest refusal `Cannot read ${name}: this model cannot view images.` Non-image binaries fall through to the existing NUL sniff unchanged.

- [ ] **Step 7: Run tests and verify**

Run: `cd youcoded/desktop && npx vitest run tests/read-tool-images.test.ts tests/capability-profile.test.ts tests/harness-tool-conformance.test.ts`
Expected: PASS.

Then `bash scripts/verify.sh <worktree>`.

- [ ] **Step 8: Commit**

```bash
git add desktop/src/main/harness/tools/read.ts desktop/src/main/harness/capability-profile.ts desktop/src/main/harness/known-models.ts desktop/tests/read-tool-images.test.ts desktop/tests/capability-profile.test.ts
git commit -m "feat(native): Read returns images to vision-capable models"
```

---

### Task 3: Surface which model is loaded, and when it is loading

`EngineManager.status()` tracks it and emits `status-changed`; `engine:status` and `engine:status-changed` are declared channels. No renderer component subscribes — only `remote-shim.ts`, which is transport. So the state exists and is visible to nobody.

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/StatusBar.tsx` (new chip)
- Test: `youcoded/desktop/tests/statusbar-engine-status.test.ts`

**Interfaces:**
- Consumes: `window.claude.engine.status()` → `EngineStatus`, and the `engine:status-changed` push event.

- [ ] **Step 1: Read the shipped shape before writing the test**

Run: `cd youcoded/desktop && grep -n "interface EngineStatus" -A 12 src/shared/types.ts`

Write the test against the **actual** fields this prints. Do not assume field names — this plan deliberately does not invent them, because every other §5 item that was written from memory turned out wrong.

- [ ] **Step 2: Write the failing test, implement the chip, verify, commit**

Follow the Task 1 shape: failing test first, minimal chip, `verify.sh`, one commit. The chip shows the loaded model's short name, `Loading…` while warming, and renders nothing for non-local sessions.

```bash
git commit -m "feat(native): status bar shows the loaded local model and its load state"
```

---

### Task 4 (verification only): what does the stall heartbeat actually render?

The watchdog exists and is prefill-aware. What is **not** established is whether its warning heartbeat reaches a visible UI countdown, or dead-ends in the renderer the way `engine:status` does. §5 item 3's premise is void either way; this task decides whether anything remains.

- [ ] **Step 1: Trace the heartbeat**

Run: `cd youcoded/desktop && grep -rn "stall" src/renderer/ | grep -iv test`
Then trace the emit at `harness-session.ts:1271-1277` through to a rendered element.

- [ ] **Step 2: Record the verdict in this file**

If it renders: mark §5 item 3 **closed as already-shipped** in the program doc and delete this task. If it dead-ends: write a Task 1-shaped fix task here and implement it. Either way the program doc's §5 item 3 text gets replaced with the verified state — do not leave the July description standing.

---

### Task 5 (diagnosis only): the model-switch races

Two symptoms from July, neither reproduced: the session-switcher pill disappears mid-resume of a local-model session, and `/model` during a load wedges a frozen menu until restart. Both are timing bugs. **A fix cannot be planned before a reproduction** — writing one now would be the guess this workspace's debugging rule forbids.

- [ ] **Step 1: Reproduce in a dev instance**

`bash scripts/run-dev.sh <worktree> --label "M4 races"`. Start a local-model session, resume it, and watch the switcher during the resume. Separately, run `/model` while a model is loading.

- [ ] **Step 2: If reproduced, instrument before theorising**

Log at each boundary — session-restore broadcast, load-state transition, `/model` open — and capture which arrives in which order. Follow `superpowers:systematic-debugging`: evidence before hypothesis.

- [ ] **Step 3: Write the fix task into this file, then implement it**

If **not** reproducible, say so explicitly in the program doc rather than leaving the item open on July's word. An unreproducible symptom that survived #268 may already be fixed.

---

## Out of this tranche

- **§5 item 2 (cost chip)** — needs per-model pricing, which is M6 item 2. Nothing to build until that lands.
- **§5 item 7 (folderless sessions)** — heuristic already works; only the form gate remains. Low priority per Destin, independent of everything here.

## Self-review notes

- **Spec coverage:** §5 items 1, 3, 4, 5, 6 all have a task; items 2 and 7 are explicitly deferred with reasons. No item is silently dropped.
- **Placeholders:** Tasks 3, 4 and 5 deliberately do not contain invented code. That is not a placeholder — it is the plan refusing to specify against unverified interfaces, and each carries a concrete first command that produces the missing fact. Tasks 1 and 2 are fully specified because their interfaces were read.
- **Type consistency:** `NativeStatusChips.cacheReadTokens`/`cacheCreationTokens` (Task 1) and `CapabilityProfile.supportsVision` (Task 2) are the only new members; both are `null`/`false`-defaulting and used only where defined.
- **Ordering:** Task 1 is smallest and proves the loop. Task 2 is the highest user-visible value. Tasks 3-5 depend on facts the earlier tasks' verification habit is meant to instil.
