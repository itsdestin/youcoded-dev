# Grep/Glob Search Scope + Timeout (Chunk A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound runaway Grep/Glob searches with a per-tool timeout, and default the no-`path` search root to the git repo toplevel (with a permission-jail-aware fallback), so a bare search can never hang the turn and lands in the project root when one exists.

**Architecture:** Add a reusable per-tool timeout in the `defineTool` pipeline (`tools/registry.ts`) that races execution and, on expiry, aborts a DERIVED signal (never `ctx.signal` — that one is the turn's, shared with the model stream) and returns an `isError` result. Add an injectable search-root resolver to Grep and Glob that, for the no-`path` case, resolves the git toplevel (via `resolveRepoRoot`) and falls back to `ctx.cwd`; thread that resolved default through the permission guard so an out-of-jail root still denies secrets while an ancestor repo root is forgiven (the disclosure is the consent).

**Tech Stack:** TypeScript; Vitest; Node `child_process`; ripgrep via `@vscode/ripgrep`.

## Revision (2026-08-17 review pass)

This plan was reviewed against the code before implementation. The review found four defects and a vacuous test; this revision fixes them:

- **D1 — the timeout as written kills the WHOLE TURN, not just the search.** The original mechanism aborted `ctx.signal` (via `AbortSignal.any`'s default forward-abort). `ctx.signal` is `this.abort!.signal` (`harness-session.ts:2508`) — the SAME controller `streamText({ abortSignal: this.abort!.signal })` (line 1916) streams the model on, and the driver's `catch` classifies an aborted signal as `user-interrupt` (`harness-session.ts:1848`). A Grep running 181 seconds would have killed the conversation mid-turn. Fixed: `defineTool` builds a derived signal that aborts on EITHER input but never forwards back (`forwardAbortSignal: false`), and on timeout aborts only its own internal controller. Child-kill wiring (Grep's `onAbort → kill('SIGKILL')`) fires through the derived signal; the turn survives.
- **D2 — Task 3's spawn `cwd` mismatched the search target.** The plan computed `searchTarget` relative to `rgCwd` but kept `spawn(…, { cwd: ctx.cwd })` — ripgrep would resolve the relative target against the wrong base (`a/x.ts` under the subdir instead of the git root), exit 2 ("does not exist"), and the disclosure never rendered. Fixed: `spawn` gets `cwd: rgCwd`.
- **D3 — Task 4's guard test was inverted, and its "ask" path can never fire the way it hoped.** `checkPathGuard('/home/destin/other', '/home/destin')` is **`ok`** — `other` is UNDER the jail root, not outside it; the test expected `external` and would have failed. More importantly, the only root a defaulted search can produce is an ANCESTOR of `cwd` (git toplevel), and an ancestor is always "external" to the cwd jail — so the plan's "out-of-jail root MUST ask" rule meant an approval prompt on EVERY bare search from a repo subdir, and `external_directory` asks have no timeout. Fixed: a reported defaulted root runs the guard for DENY honors (secret-root edge) but an `external` verdict is forgiven — the in-tool disclosure ("Search scoped to the project root… pass a specific path") is the honesty mechanism; `decide()`/rules are untouched (subject unchanged), so rule behavior is byte-identical to today.
- **D4 — the defaulted roots would have made Grep and Glob disagree on path shape again.** Grep with `rgCwd` = git root prints bare `a/x.ts`; Glob's existing rebase (`base.startsWith('..')`) rewrites to an ABSOLUTE `/tmp/…/a/x.ts`. Both planned tests asserted `toContain('a/x.ts')`, which passes trivially for the absolute form — the tests were green lies. Fixed: Glob emits root-relative paths for the defaulted-git-root case, and the tests assert exact lines.
- **D5 — the e2e test was vacuous.** It never exercised the timeout (the shared tool's 180 s cap isn't overridable) and asserted only that a bounded search completes. Fixed: an optional `ctx.toolTimeoutMs` override (driver never sets it) lets Task 6 actually collapse the motivating case — non-git cwd, large tree, 50 ms cap → `isError` + `/timed out/`.
- **Also fixed/clarified:** explicit `path: "."` / `"./"` now resolve to `cwd` (honored like any explicit path — this matches Claude Code and the plan's own "an explicit path is always honored" constraint; the original text silently broke that for `.`); the `AbortSignal.any` availability fallback is folded inline (the listener-based fallback is already non-forwarding, which is exactly the semantic we need); Bash is noted as out of scope (it already bounds itself with its own timeout arg + exit 124).

## Global Constraints

- **Timeout default:** 180 000 ms for Grep and Glob; `0`/`undefined` disables (no timeout).
- **Timeout mechanism:** a derived signal `combineSignals(ctx.signal, internal.signal)` that aborts when EITHER input aborts but NEVER forwards its own abort back to `ctx.signal` (Node ≥ 21: `AbortSignal.any([a, b], { forwardAbortSignal: false })`; fallback: listener-based controller — same semantic by construction). `ctx.signal` is the turn's signal shared with the model stream (`harness-session.ts:2508` + `1916`); aborting it ends the whole turn as `user-interrupt`, so **only the internal controller is aborted on timeout**. Grep's existing `onAbort → kill('SIGKILL')` fires via the derived signal; the conversation's `ctx.signal` stays clean. Clear the timer on resolve.
- **Timeout result:** a normal resolved `ToolResultPayload` with `{ isError: true }` and a message telling the model to narrow — never an unresolved promise, never the 'park' wait path, never a hang for a specialist child. The race settles with the synthetic result in the same tick as the abort, so a tool's late `Canceled`/partial resolution (Grep's close handler, Glob's interrupted walk) is deterministically dropped, never surfaced.
- **Root defaulting (no `path` only):** git toplevel when `ctx.cwd` is inside a repo, else `ctx.cwd`. An explicit `path` — INCLUDING `"."` and `"./"`, which mean "the current directory" exactly as in Claude Code — always wins and is never defaulted.
- **Root disclosure:** fires ONLY when the resolved root differs from what the model would assume (a git toplevel found above a non-root cwd); folded with the B1 exclusion note when both apply. No disclosure when root === `ctx.cwd`.
- **Permission jail:** the resolved defaulted root runs `checkPathGuard` for DENY honors (a repo root inside `~/.ssh` still refuses). An `external` verdict on a DEFAULTED root is forgiven — the root is an ancestor of `cwd` by construction (git toplevel), searching it is the feature, and the disclosure tells the model what was searched and how to limit it; this is honest friction for the model, not a sandbox, and Bash bypasses these guards anyway. An explicit out-of-jail `path` still gets the existing `external_directory` ask, unchanged.
- **No tier-2 / project-marker resolution** (cut in review). Two tiers only: git toplevel, else `ctx.cwd`.
- Bash is OUT OF SCOPE for this chunk — it already bounds itself (`timeout` arg, default 120 000 ms, exit 124, SIGKILL + partial-output prefix; `tools/bash.ts:907-915`).
- Platform: does not change platform-specific path handling; reuse `toPosix`/`resolveP` conventions.

---

### Task 1: Add a per-tool timeout to `defineTool`

**Files:**
- Modify: `src/main/harness/tools/registry.ts`
- Modify: `src/main/harness/tools/types.ts` (add `toolTimeoutMs?` to `ToolContext`)
- Test: `tests/harness-tool-timeout.test.ts` (new)

**Interfaces:**
- Consumes: `ToolResultPayload` from `./types`; the existing `defineTool` wrapper.
- Produces: `defineTool` now honors a `caps.timeoutMs` on the tool def; a timed-out call returns `{ text, isError: true }`. Later tasks set `timeoutMs: 180_000` on Grep/Glob. `ctx.toolTimeoutMs` is an optional per-call override — the driver NEVER sets it; tests set it to keep fixtures fast (Task 6).

- [ ] **Step 1: Write the failing test**

Create `tests/harness-tool-timeout.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { defineTool } from '../src/main/harness/tools/registry';
import type { ToolResultPayload, ToolContext } from '../src/main/harness/tools/types';

function makeCtx(signal: AbortSignal): ToolContext {
  return { sessionId: 't', cwd: '/tmp', signal, readRegistry: new Map(), todos: [] };
}

describe('defineTool per-tool timeout', () => {
  it('returns isError after timeoutMs when the tool never resolves', async () => {
    const tool = defineTool({
      name: 'Slow',
      description: 'slow tool',
      caps: { timeoutMs: 50 },
      inputSchema: undefined as any,
      permissionSubject: () => undefined,
      async execute() {
        // Never resolves on its own — only the timeout can complete it.
        return new Promise<ToolResultPayload>(() => {});
      },
    });
    const ac = new AbortController();
    const r = await tool.execute({}, makeCtx(ac.signal));
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/timed out/);
  });

  it('is unaffected when the tool resolves before the cap (timer cleared, no false timeout)', async () => {
    const tool = defineTool({
      name: 'Fast',
      description: 'fast tool',
      caps: { timeoutMs: 2000 },
      inputSchema: undefined as any,
      permissionSubject: () => undefined,
      async execute() { return { text: 'done' }; },
    });
    const ac = new AbortController();
    const r = await tool.execute({}, makeCtx(ac.signal));
    expect(r.text).toBe('done');
    expect(r.isError).toBeUndefined();
  });

  it('timeoutMs: 0 (or absent) disables the timeout entirely', async () => {
    const slow = new Promise<ToolResultPayload>((res) => setTimeout(() => res({ text: 'late' }), 30));
    const tool = defineTool({
      name: 'SlowNoCap',
      description: 'no cap',
      caps: { timeoutMs: 0 },
      inputSchema: undefined as any,
      permissionSubject: () => undefined,
      execute: () => slow,
    });
    const ac = new AbortController();
    const r = await tool.execute({}, makeCtx(ac.signal));
    expect(r.text).toBe('late');
  });

  it('aborts the TOOL signal on timeout (child-kill wiring fires) but NOT the conversation signal', async () => {
    // WHY (2026-08-17 review, D1): ctx.signal is the TURN's signal (harness-
    // session.ts:2508) — aborting it kills the model stream as user-interrupt.
    // The timeout may only abort a DERIVED signal; the conversation signal must
    // survive so the turn continues after the tool result.
    const ac = new AbortController();
    let toolSignal: AbortSignal | undefined;
    const tool = defineTool({
      name: 'Slow',
      description: 'slow tool',
      caps: { timeoutMs: 50 },
      inputSchema: undefined as any,
      permissionSubject: () => undefined,
      async execute(_a, ctx) {
        toolSignal = ctx.signal;
        return new Promise<ToolResultPayload>(() => {});
      },
    });
    await tool.execute({}, makeCtx(ac.signal));
    expect(toolSignal?.aborted).toBe(true);   // Grep's onAbort → kill('SIGKILL') fires
    expect(ac.signal.aborted).toBe(false);    // the turn survives
  });

  it('a user interrupt still propagates to the tool signal', async () => {
    const ac = new AbortController();
    const tool = defineTool({
      name: 'Interruptible',
      description: 'stops when its signal aborts',
      caps: { timeoutMs: 20_000 },
      inputSchema: undefined as any,
      permissionSubject: () => undefined,
      async execute(_a, ctx) {
        return new Promise<ToolResultPayload>((resolve) => {
          ctx.signal.addEventListener('abort', () => resolve({ text: 'canceled', isError: true }), { once: true });
        });
      },
    });
    const pending = tool.execute({}, makeCtx(ac.signal));
    ac.abort();
    const r = await pending;
    expect(r.text).toBe('canceled');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/harness-tool-timeout.test.ts`
Expected: FAIL (the `Slow` tools hang — vitest reports the test timing out because `defineTool` currently returns the tool's never-resolving promise).

- [ ] **Step 3: Implement the timeout in `defineTool`**

Add `toolTimeoutMs?` to `ToolContext` in `src/main/harness/tools/types.ts`:

```ts
/** Per-call timeout override, used ONLY by tests to exercise the timeout with
 *  fast fixtures (the driver never sets it — production uses caps.timeoutMs). */
toolTimeoutMs?: number;
```

Modify `src/main/harness/tools/registry.ts`:

```ts
/** Combine two signals so the derived signal aborts when EITHER input aborts,
 *  but NEVER forwards its own abort back to the inputs.
 *
 *  WHY forwardAbortSignal:false/fallback (2026-08-17 search-scope review, D1):
 *  ctx.signal is the TURN's AbortController.signal (harness-session.ts:2508) —
 *  the SAME signal streamText() streams the model on (line 1916), and the
 *  driver's catch classifies an aborted signal as user-interrupt (line 1848).
 *  AbortSignal.any's DEFAULT forwards an abort of the derived signal to every
 *  input, so a naive `AbortSignal.any([ctx.signal, internal])` + internal.abort()
 *  would kill the model's turn whenever a tool timed out. The listener-based
 *  fallback below has the correct non-forwarding semantics BY CONSTRUCTION —
 *  the derived controller is only ever aborted by an input, never itself. */
function combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') {
    try {
      return AbortSignal.any([a, b], { forwardAbortSignal: false } as any);
    } catch { /* older impls ignore options — fall through to the safe version */ }
  }
  const c = new AbortController();
  if (a.aborted || b.aborted) c.abort();
  else {
    const onAbort = () => c.abort();
    a.addEventListener('abort', onAbort, { once: true });
    b.addEventListener('abort', onAbort, { once: true });
  }
  return c.signal;
}

export function defineTool<A>(
  def: NativeTool<A> & { caps?: TruncateOpts & { timeoutMs?: number } },
): NativeTool<A> {
  const caps = def.caps ?? DEFAULT_CAPS;
  return {
    ...def,
    async execute(args: A, ctx: ToolContext): Promise<ToolResultPayload> {
      // WHY a per-tool timeout (2026-08-17, search-scope spec): a tool that
      // wedges on a long/unresponsive subprocess (e.g. a Grep sweeping an
      // enormous tree) previously awaited its child's 'close' forever, hanging
      // the turn with no card, retry, or error. The timeout aborts a DERIVED
      // signal — NOT ctx.signal, which is the turn's and would end the whole
      // conversation as user-interrupt — so existing onAbort → kill('SIGKILL')
      // wiring fires and the child dies while the turn continues; we return a
      // resolved isError result so the loop continues (the model can narrow)
      // instead of a never-resolving promise or the park-wait path.
      const timeoutMs = caps.timeoutMs ?? ctx.toolTimeoutMs ?? 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let timeoutController: AbortController | undefined;
      const execPromise = timeoutMs > 0
        ? def.execute(args, {
            ...ctx,
            signal: (timeoutController = new AbortController(), combineSignals(ctx.signal, timeoutController.signal)),
          })
        : def.execute(args, ctx);
      if (!timeoutController) {
        return finish(await execPromise);
      }
      const timeoutResult: ToolResultPayload = {
        text: `${def.name} timed out after ${Math.round(timeoutMs / 1000)}s — the operation did not finish in time. Narrow it: pass a more specific path, add a filter, or for Grep use output_mode:"count".`,
        isError: true,
      };
      const timedOut = new Promise<never>((_, reject) => {
        // Abort + reject in the SAME tick: the race below settles with the
        // synthetic result before any later partial/Canceled resolution from
        // the tool itself (Grep's close handler, Glob's interrupted walk) can
        // win — so a timed-out call deterministically surfaces the timeout
        // message, never "Canceled: the user interrupted this search."
        timer = setTimeout(() => { timeoutController!.abort(); reject(new Error('tool-timeout')); }, timeoutMs);
      });
      try {
        return finish(await Promise.race([execPromise, timedOut as Promise<ToolResultPayload>]));
      } catch {
        return timeoutResult;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };

  function finish(raw: ToolResultPayload): ToolResultPayload {
    const t = truncateOutput(raw.text, caps);
    const notice = composeNotice(raw.bounds, t.truncated ? { shown: t.text.length, total: t.totalChars } : null, def.moreHint);
    return { ...raw, text: t.text + notice };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/harness-tool-timeout.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the existing tool conformance + bounds suites to confirm no regression**

Run: `cd youcoded/desktop && npx vitest run tests/harness-tool-conformance.test.ts tests/harness-tool-bounds.test.ts tests/harness-tools-core.test.ts`
Expected: all PASS (no tool declares `timeoutMs` yet and no test sets `toolTimeoutMs`, so behavior is unchanged for them).

- [ ] **Step 6: Commit**

```bash
cd youcoded/desktop && git add src/main/harness/tools/registry.ts src/main/harness/tools/types.ts tests/harness-tool-timeout.test.ts
git commit -m "feat(harness): per-tool timeout in defineTool (derived-signal abort + synthetic isError)"
```

---

### Task 2: Expose the current search root as a testable resolver in Grep and Glob

**Files:**
- Modify: `src/main/harness/tools/grep.ts`
- Modify: `src/main/harness/tools/glob.ts`
- Test: `tests/harness-search-scope.test.ts` (new)

**Interfaces:**
- Consumes: `ToolContext` from `./types`; `resolveRepoRoot` from `../../git/git-exec` (async, already cached in a module-level `rootCache`).
- Produces: a pure exported `resolveSearchRoot(cwd: string, explicitPath: string | undefined, resolveGitRoot): Promise<{ root: string; defaulted: boolean; gitRoot?: string }>` helper; Grep/Glob call it. Later tasks thread it through the guard.

- [ ] **Step 1: Write the pure resolver + failing tests**

Add a new shared helper file `src/main/harness/tools/search-root.ts`:

```ts
import * as path from 'path';

export interface SearchRoot {
  /** The absolute search root this call should use. */
  root: string;
  /** True only when NO path was given and a default (git toplevel, else cwd) applied.
   *  An explicit `path` — including "." / "./", which mean "the current directory"
   *  in Claude Code — is NEVER defaulted (2026-08-17 review pass: the original
   *  draft treated "." as no-path, silently breaking "an explicit path is always
   *  honored" and changing what a model that wrote path:"." expected to get). */
  defaulted: boolean;
  /** The git toplevel, when the cwd was inside a repo and a default applied. */
  gitRoot?: string;
}

/** Resolve the search root for a Grep/Glob call.
 *
 * Explicit `path` always wins (resolved against `cwd`), and is NOT "defaulted".
 * The no-path case resolves the git toplevel (async, via the injected resolver)
 * and falls back to `cwd`. Pure + injectable for tests — callers pass the REAL
 * `resolveRepoRoot`; tests pass a fake. */
export async function resolveSearchRoot(
  cwd: string,
  explicitPath: string | undefined,
  resolveGitRoot: (dir: string) => Promise<string | null>,
): Promise<SearchRoot> {
  if (explicitPath !== undefined && explicitPath.trim() !== '') {
    return { root: path.resolve(cwd, explicitPath), defaulted: false };
  }
  const gitRoot = await resolveGitRoot(cwd);
  if (gitRoot) return { root: gitRoot, defaulted: true, gitRoot };
  return { root: cwd, defaulted: true };
}
```

Add `tests/harness-search-scope.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { resolveSearchRoot } from '../src/main/harness/tools/search-root';

const CWD = '/home/destin/project';

describe('resolveSearchRoot', () => {
  it('explicit relative path wins and is not defaulted', async () => {
    const r = await resolveSearchRoot(CWD, 'src', async () => '/repo');
    expect(r.root).toBe(path.resolve(CWD, 'src'));
    expect(r.defaulted).toBe(false);
    expect(r.gitRoot).toBeUndefined();
  });

  it('"." and "./" are explicit paths (root = cwd), never defaulted', async () => {
    const a = await resolveSearchRoot(CWD, '.', async () => '/repo');
    const b = await resolveSearchRoot(CWD, './', async () => '/repo');
    expect(a.root).toBe(CWD);
    expect(b.root).toBe(CWD);
    expect(a.defaulted).toBe(false);
    expect(b.defaulted).toBe(false);
    expect(a.gitRoot).toBeUndefined();
  });

  it('no path resolves the git toplevel and marks it defaulted', async () => {
    const r = await resolveSearchRoot(CWD, undefined, async () => '/repo');
    expect(r.root).toBe('/repo');
    expect(r.defaulted).toBe(true);
    expect(r.gitRoot).toBe('/repo');
  });

  it('falls back to cwd when no git root exists', async () => {
    const r = await resolveSearchRoot(CWD, undefined, async () => null);
    expect(r.root).toBe(CWD);
    expect(r.defaulted).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/harness-search-scope.test.ts`
Expected: FAIL with "Cannot find module '../src/main/harness/tools/search-root'".

- [ ] **Step 3: Verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/harness-search-scope.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 4: Commit**

```bash
cd youcoded/desktop && git add src/main/harness/tools/search-root.ts tests/harness-search-scope.test.ts
git commit -m "test(harness): pure search-root resolver for Grep/Glob default scope"
```

---

### Task 3: Wire Grep's default root + disclosure + timeout

**Files:**
- Modify: `src/main/harness/tools/grep.ts`
- Test: `tests/harness-search-scope.test.ts` (extend), `tests/harness-tool-bounds.test.ts`

**Interfaces:**
- Consumes: `resolveSearchRoot` (Task 2); `resolveRepoRoot` from `../../git/git-exec`; `caps.timeoutMs` (Task 1).
- Produces: Grep's no-path search uses the git toplevel root; `caps.timeoutMs: 180_000`; a gated disclosure line when the root was defaulted to a git toplevel above a non-root cwd; the resolved root reported to the driver via `ctx.reportResolvedRoot` (wired in Task 4).

- [ ] **Step 1: Write the failing test (root defaulting visible in Grep output)**

Extend `tests/harness-search-scope.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GrepTool } from '../src/main/harness/tools/grep';
import type { ToolContext } from '../src/main/harness/tools/types';

let dir: string;
let ctx: ToolContext;
function makeCtx(cwd: string): ToolContext {
  return { sessionId: 't', cwd, signal: new AbortController().signal, readRegistry: new Map(), todos: [] };
}
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-')); ctx = makeCtx(dir); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

describe('Grep root defaulting', () => {
  it('defaults to the git toplevel from a subdir, discloses, and returns root-relative paths', async () => {
    // Build a throwaway git repo with the real tool.
    const { execFileSync } = require('child_process');
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    const sub = path.join(dir, 'a');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'x.ts'), 'export const marker = 1;\n');
    const subCtx = makeCtx(sub);
    const r = await GrepTool.execute({ pattern: 'marker', output_mode: 'files_with_matches' }, subCtx);
    expect(r.text).toMatch(/Search scoped to the project root/);
    expect(r.text).toContain(dir); // root is the repo toplevel (dir), not sub
    // STRICT line assertion (2026-08-17 review pass, D4): `toContain('a/x.ts')`
    // would also pass for the absolute form — a green lie. The defaulted root
    // MUST come back repo-root-relative, matching Glob's shape for the same file.
    expect(r.text.split('\n')).toContain('a/x.ts');
  });

  it('does NOT disclose when root === cwd (no git root found)', async () => {
    const r = await GrepTool.execute({ pattern: 'marker' }, makeCtx(dir));
    expect(r.text).not.toMatch(/Search scoped to the project root/);
  });
});
```

Note: the tmpdir fixture avoids a git ancestry trap — `resolveRepoRoot(dir)` walks UP from the mkdtemp dir, so a stray `.git` above `os.tmpdir()` (e.g. a runner repo) would make `defaulted=true` with a root ABOVE the fixture and the test would work against the wrong tree. If a CI run ever fails here with a disclosure in the "no git root" test, run the fixture under a `GIT_CEILING_DIRECTORIES`-style guard or assert `gitRoot` first — but this is unlikely (`os.tmpdir()` is not inside a repo in practice).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/harness-search-scope.test.ts`
Expected: FAIL — Grep currently searches `cwd` and emits no disclosure.

- [ ] **Step 3: Implement root resolution + disclosure + timeout in Grep**

In `src/main/harness/tools/grep.ts`:

- Import `resolveRepoRoot` and `resolveSearchRoot`:
```ts
import { resolveRepoRoot } from '../../git/git-exec';
import { resolveSearchRoot } from './search-root';
```
- Add `resolveRgPath` stays exported for tests (unchanged).
- Set the caps to include the timeout:
```ts
caps: { maxChars: 30_000, maxLines: 250, timeoutMs: 180_000 },
```
- In `execute`, replace the root computation (currently `const resolvedTarget = resolveP(args.path ?? '.', ctx.cwd)` and the `rel`/`searchTarget` block) with:

```ts
const { root, defaulted, gitRoot } = await resolveSearchRoot(ctx.cwd, args.path, resolveRepoRoot);
// Report ONLY when the root was DEFAULTED (Task 4's driver forgiveness keys
// on this — an explicit path must keep going through the external_directory
// ask exactly as it does today; the driver reads+resets per call, so this
// can never leak across calls).
if (defaulted) ctx.reportResolvedRoot?.(root);
const resolvedTarget = root;
// rg must spawn with the SAME cwd the target is relative to (2026-08-17 review
// pass, D2): the original draft kept spawn's cwd at ctx.cwd while computing the
// target against gitRoot, so ripgrep resolved "a/x.ts" against the subdir,
// exited 2 ("does not exist"), and the disclosure never rendered. When the
// root was defaulted to a git toplevel, pin rg's cwd to that root so paths
// come back repo-root-relative (same shape as Glob). Non-defaulted calls are
// unchanged: rgCwd === ctx.cwd.
const rgCwd = defaulted && gitRoot ? gitRoot : ctx.cwd;
```

Then pass `cwd: rgCwd` to `spawn(...)` (REPLACING `cwd: ctx.cwd` — this is the D2 fix), and compute `searchTarget` relative to `rgCwd`:

```ts
const rel = path.relative(rgCwd, resolvedTarget);
const searchTarget = rel === '' ? null : (!rel.startsWith('..') && !path.isAbsolute(rel) ? rel : resolvedTarget);
if (searchTarget !== null) rgArgs.push('--', args.pattern, searchTarget);
else rgArgs.push('--', args.pattern);
```

> `rel === ''` for the defaulted case (`rgCwd === resolvedTarget === gitRoot`), so rg searches its own cwd — the git root — and prints bare repo-root-relative paths. The `searchTarget === null` path is exactly the pre-existing "target IS cwd" branch that already omitted the path argument (see the existing WHY comments at `grep.ts:292-312`); it is now reached via the defaulted root too, which is why the spawn cwd fix above is load-bearing.

- Prepend the gated disclosure to the RESULT text (only when defaulted to a git root above a non-root cwd), before returning in the `close` handler:

```ts
const disclosure = defaulted && gitRoot && gitRoot !== ctx.cwd
  ? `Search scoped to the project root (${gitRoot}). Pass a specific \`path\` to search elsewhere.\n`
  : '';
// prepend `disclosure` to the final resolved `text` value at EVERY resolve in the
// close handler ('No matches found.', the truncation notes path, the success
// path). The exit-2 / spawn-error branches keep their existing text — the error
// already names the root.
```

> `gitRoot !== ctx.cwd` is a string compare; both are absolute from `resolveRepoRoot`/cwd so this is fine on POSIX. On Windows use `path.resolve(gitRoot) !== path.resolve(ctx.cwd)`.

- In the exit-2 branch, pass `rgCwd` (not `ctx.cwd`) to `grepErrorMessage(err, resolvedTarget, rgCwd)` so a missing-path message names the base the model's relative path will actually resolve against.

Keep `singleFileLabel`'s `fs.statSync(resolvedTarget)` (it stats the root, which is now the git root — a directory, so `isFile()` is false and the label stays undefined for the defaulted case) — unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/harness-search-scope.test.ts tests/harness-tool-bounds.test.ts`
Expected: PASS. Existing "Grep and Glob agree on path format" tests still pass because they pass explicit roots.

- [ ] **Step 5: Commit**

```bash
cd youcoded/desktop && git add src/main/harness/tools/grep.ts tests/harness-search-scope.test.ts
git commit -m "feat(harness): Grep defaults to git toplevel root (gated disclosure, rg cwd pinned) + 180s timeout"
```

---

### Task 4: Thread the default root through the permission guard (jail honesty)

**Files:**
- Modify: `src/main/harness/harness-session.ts` (guard block, step 3, ~line 2426)
- Modify: `src/main/harness/tools/types.ts` (add `reportResolvedRoot` to `ToolContext`)
- Modify: `src/main/harness/tools/grep.ts` + `glob.ts` (call `reportResolvedRoot` — Grep done in Task 3, Glob here)
- Test: `tests/harness-search-scope.test.ts` (extend), `tests/harness-tool-guards.test.ts`

**Interfaces:**
- Consumes: `resolveSearchRoot` (Task 2); the existing `checkPathGuard` / `isUnderRoot`.
- Produces: when a search tool reports a DEFAULTED root, the guard runs against that ACTUAL root for DENY honors; an `external` verdict on a defaulted root is forgiven (ancestor git toplevel + disclosure = consent), while an explicit out-of-jail `path` still forces the existing `external_directory` ask. `decide()`/rules keep the ORIGINAL subject — rule behavior is byte-identical to today.

- [ ] **Step 1: Write the failing test (defaulted root reported; driver forgives ancestor external but keeps denies)**

Extend `tests/harness-search-scope.test.ts` (using the same git-repo fixture as Task 3):

```ts
describe('default root jail honesty', () => {
  it('Grep reports the defaulted git root via reportResolvedRoot', async () => {
    const { execFileSync } = require('child_process');
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    const sub = path.join(dir, 'a');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'x.ts'), 'x');
    let reported: string | undefined;
    const r = await GrepTool.execute(
      { pattern: 'x', output_mode: 'files_with_matches' },
      { ...makeCtx(sub), reportResolvedRoot: (root) => { reported = root; } },
    );
    expect(reported).toBe(dir); // the git toplevel, NOT the subdir
    expect(r.isError).toBeUndefined();
  });

  it('the guard DENIES a defaulted root that is a credential directory, even though it would be forgiven as external', async () => {
    // cwd is inside ~/.ssh-shaped path that IS a git repo: the search root is
    // the credential dir itself — checkPathGuard's deny must fire (secret dirs
    // are never forgivable). This is the ONE deny path the driver keeps for
    // defaulted roots; it reuses checkPathGuard verbatim.
    const home = os.homedir();
    const secretRepo = path.join(home, '.ssh');
    const verdict = checkPathGuard(secretRepo, path.join(secretRepo, 'sub'));
    expect(verdict.kind).toBe('deny');
  });
});
```

> Guard semantics pinned by the existing `harness-tool-guards.test.ts` are unchanged: an EXPLICIT `path` outside the jail still yields `external` and the driver still forces `externalAsk`. The only new behavior is the forgiveness branch for a REPORTED defaulted root — which exists, by construction, only for the git toplevel ancestor case.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/harness-search-scope.test.ts -t "jail"`
Expected: FAIL — Grep never calls `reportResolvedRoot` (test 1), and the driver's forgiveness branch doesn't exist yet (there is no driver-level assertion in this suite; `harness-session.test.ts` covers the driver, see Step 4).

- [ ] **Step 3: Wire the resolver report + guard forgiveness in the driver**

Add to `ToolContext` (in `tools/types.ts`):
```ts
/** When a search tool defaulted its root to a git toplevel, set this so the
 *  DRIVER can run the permission guard against the actual root it will search. */
reportResolvedRoot?: (root: string) => void;
```

In Grep (Task 3) and Glob (Task 5) `execute`, after `resolveSearchRoot`, call it ONLY in the `defaulted` branch:

```ts
// Report ONLY when the root was DEFAULTED (Task 4's driver forgiveness keys
// on this — an explicit path must keep going through the external_directory
// ask exactly as it does today).
if (defaulted) ctx.reportResolvedRoot?.(root);
```

> This is why the tools report only on default, never unconditionally: the DRIVER builds the context at the call site (step 5, `harness-session.ts:2505`) with a closure over a `resolvedSearchRoot` variable — `reportResolvedRoot: (root) => { resolvedSearchRoot = root; }`. The tools call the callback DURING execute, which runs AFTER the guard block, so the driver can only read the reported value on the NEXT tool call. Making the tools report ALWAYS (defaulted or not) would therefore make an EXPLICIT out-of-jail path that passed the guard last call appear "reported-defaulted" on this call — and forgiveness would wrongly swallow the external_directory ask for it. Reporting only when defaulted — and reading the value only inside THIS call's own guard block, before execute runs the first time — keeps the semantics exact: explicit paths never set the flag, and the flag is consulted before any tool has had a chance to set it spuriously.

Driver implementation (the guard block, ~line 2426, and the execute call at ~line 2505):

```ts
// Per-TOOL-CALL field (reset at the top of every execute() call, NOT per
// turn): the reported defaulted search root of THIS call, if any. It is
// consumed-and-cleared before the guard reads it, so a value reported by a
// PREVIOUS call can never leak into this one's guard (2026-08-17 review pass,
// D3 — the guard runs BEFORE execute, so the only safe read is the reset-then-
// read of the prior call's report; see the WHY in Task 4 Step 3).
let reportedSearchRoot: string | undefined;

// ...inside the execute-call path, AFTER the guard block has run and RIGHT
// BEFORE tool.execute() (step 5, ~line 2505)...
return tool.execute(args, {
  sessionId: this.opts.sessionId,
  cwd: this.opts.cwd,
  signal: this.abort!.signal,
  // The ONLY place the guard's forgiveness can learn the tool's defaulted
  // root: written during THIS execute()'s run, read-and-cleared at the top
  // of the NEXT call's handling, before ITS guard runs.
  reportResolvedRoot: (root: string) => { reportedSearchRoot = root; },
  // ...everything else unchanged...
});
```

And the guard block itself (step 3, ~line 2426) — keep `decide()`/rules on the ORIGINAL `subject`, and gate ONLY the verdict on the reported root:

```ts
// A DEFAULTED search root (no `path` given) is guarded by the root the tool
// ACTUALLY searches (2026-08-17 review pass, D3):
//   - DENY verdicts are honored verbatim — a repo root under ~/.ssh still
//     refuses (`checkPathGuard` runs the credential-directory check BEFORE the
//     jail containment check, so a secret root is denied as 'deny', never
//     'external', and is therefore never in the forgiven set).
//   - An 'external' verdict on a DEFAULTED root is FORGIVEN. That root is, by
//     construction, the git toplevel — an ANCESTOR of cwd, i.e. the user's own
//     project — and the in-tool disclosure already told the model what was
//     searched and how to limit it ("pass a specific path").
//   - An EXPLICIT out-of-jail `path` still forces externalAsk, unchanged.
const subject = tool.permissionSubject(args);
let externalAsk = false;
if (subject !== undefined && !NON_PATH_SUBJECT_TOOLS.has(call.toolName)) {
  const hasDefaultedRoot = reportedSearchRoot !== undefined; // reset per call (above)
  const guardPath = hasDefaultedRoot ? reportedSearchRoot! : subject;
  const verdict = checkPathGuard(guardPath, this.opts.cwd, this.opts.internalReadRoots);
  if (verdict.kind === 'deny') return { text: verdict.reason, isError: true };
  if (verdict.kind === 'external' && !hasDefaultedRoot) {
    // ...existing workspaceMatchFor / externalAsk path, UNCHANGED...
  }
  // verdict.kind === 'external' && hasDefaultedRoot: forgiven — the in-tool
  // disclosure above is the honesty mechanism; the model (and the user, who
  // sees the tool card) are told what was searched and how to narrow it.
}
```

> NOTE on the "next call" timing: because the guard and execute are in the SAME call-handling function, initialize `reportedSearchRoot = undefined` at the top of that function (per call) so the first call of a session never sees a stale value, and any call after a defaulted sibling sees `undefined` unless IT defaulted. The reset-then-read discipline above makes the "report only when defaulted" rule airtight: explicit-path calls NEVER set the flag, and the guard NEVER reads a value that isn't this call's own.

- [ ] **Step 4: Run the guard + scope + session suites**

Run: `cd youcoded/desktop && npx vitest run tests/harness-tool-guards.test.ts tests/harness-search-scope.test.ts tests/harness-session.test.ts`
Expected: ALL PASS. `harness-session.test.ts` is the regression gate for the driver change; `harness-tool-guards.test.ts` pins that explicit external paths still ask.

- [ ] **Step 5: Commit**

```bash
cd youcoded/desktop && git add src/main/harness/harness-session.ts src/main/harness/tools/types.ts src/main/harness/tools/grep.ts src/main/harness/tools/glob.ts tests/harness-search-scope.test.ts
git commit -m "feat(harness): guard the defaulted search root (denies honored, ancestor external forgiven)"
```

---

### Task 5: Wire Glob's default root + disclosure + timeout

**Files:**
- Modify: `src/main/harness/tools/glob.ts`
- Test: `tests/harness-search-scope.test.ts` (extend), `tests/harness-tool-bounds.test.ts`

**Interfaces:**
- Consumes: `resolveSearchRoot` (Task 2); `resolveRepoRoot` from `../../git/git-exec`; `caps.timeoutMs` (Task 1). NOTE: Glob uses a synchronous manual `walk()`, NOT a child process — the timeout aborts the derived signal, which Glob already checks in the walk (`if (ctx.signal.aborted) { interrupted = true; ... }`).
- Produces: Glob's no-path search uses the git toplevel root; `caps.timeoutMs: 180_000`; the same gated disclosure as Grep; THE SAME path shape as Grep for a defaulted root (root-relative, D4); root reported to the driver via `reportResolvedRoot` only when defaulted (Task 4 prefers).

- [ ] **Step 1: Write the failing test (Glob root defaulting + disclosure + path shape)**

Extend `tests/harness-search-scope.test.ts`:

```ts
import { GlobTool } from '../src/main/harness/tools/glob';

describe('Glob root defaulting', () => {
  it('defaults to git toplevel and discloses, with the SAME root-relative path shape as Grep', async () => {
    const { execFileSync } = require('child_process');
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    const sub = path.join(dir, 'a');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'x.ts'), 'x');
    const subCtx = makeCtx(sub);
    const r = await GlobTool.execute({ pattern: '**/*.ts' }, subCtx);
    expect(r.text).toMatch(/Search scoped to the project root/);
    // STRICT line assertion (2026-08-17 review pass, D4): the existing rebase
    // (`base.startsWith('..')` → absolute join) would fail this — the defaulted
    // root MUST return bare root-relative "a/x.ts", matching Grep, NOT the
    // absolute "/tmp/scope-xxx/a/x.ts" the old rebase produced.
    expect(r.text.split('\n')).toContain('a/x.ts');
  });

  it('does NOT disclose when root === cwd (no git root)', async () => {
    const r = await GlobTool.execute({ pattern: '**/*.ts' }, makeCtx(dir));
    expect(r.text).not.toMatch(/Search scoped to the project root/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/harness-search-scope.test.ts -t "Glob"`
Expected: FAIL — Glob currently searches `cwd`, no disclosure, and the rebase would emit an absolute path for the defaulted root.

- [ ] **Step 3: Implement in Glob**

In `src/main/harness/tools/glob.ts`:
- Import `resolveRepoRoot` + `resolveSearchRoot`.
- Set caps: `caps: { maxChars: 30_000, timeoutMs: 180_000 }`.
- In `execute`, resolve the root, report it when defaulted, and replace `const root = resolveP(args.path ?? '.', ctx.cwd);`:
```ts
const { root, defaulted, gitRoot } = await resolveSearchRoot(ctx.cwd, args.path, resolveRepoRoot);
// Report ONLY when defaulted (Task 4's driver forgiveness keys on this —
// an explicit path must keep going through the external_directory ask).
if (defaulted) ctx.reportResolvedRoot?.(root);
```
- Prepend the same gated disclosure to the returned text (only when `defaulted && gitRoot && gitRoot !== ctx.cwd`); apply it to both the hits text and the 'No files matched.' branch.
- THE REBASE FIX (D4): for a defaulted git root, the walk's `base = path.relative(ctx.cwd, root)` is a `..`-prefixed string, and the existing rebase rewrites that to an ABSOLUTE path — the exact shape disagreement that made the two tools unpipeable before. Emit root-relative paths for the defaulted case:
```ts
// For a DEFAULTED git root the walk already produced paths relative to that
// root — the same shape Grep now emits (rg cwd = git root, no target arg).
// The `..`-prefixed rebase below would rewrite them to absolute paths and
// break the Grep/Glob agreement the bounds test pins; skip it here. External
// dirs the user EXPLICITLY approved keep the absolute-form rebase.
const base = defaulted && gitRoot ? '' : path.relative(ctx.cwd, root);
```
  (with `base === ''`, the existing `rebase` returns `r` bare — no other change needed).
- Glob's cancellation already handles `ctx.signal.aborted` (interrupted branch → 'Canceled: the user interrupted this search.'). On a TIMEOUT the derived signal aborts, the walk notices within a few entries, and the interrupted branch resolves — but the race in defineTool has ALREADY settled with the synthetic "timed out — narrow it" result in the same tick as the abort (Task 1), so the Canceled text is deterministically dropped. Do NOT add a `timedOut` flag or special abort-reason detection to Glob's walk — it is dead work (the message can never surface), and Glob is bounded by WALK_CEILING anyway; the 180 s cap is a backstop, not the primary bound.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/harness-search-scope.test.ts tests/harness-tool-bounds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd youcoded/desktop && git add src/main/harness/tools/glob.ts tests/harness-search-scope.test.ts
git commit -m "feat(harness): Glob defaults to git toplevel root (gated disclosure + Grep-consistent paths) + 180s timeout"
```

---

### Task 6: End-to-end motivating case + full regression

**Files:**
- Test: `tests/harness-search-scope.test.ts` (extend — the end-to-end case the review called "the single most valuable test")

**Interfaces:**
- Consumes: the real `GrepTool` with `resolveRepoRoot`, the timeout, `toolTimeoutMs` (Task 1), and the driver guard path.

- [ ] **Step 1: Write the end-to-end motivating-case test (timeout actually fires)**

Extend `tests/harness-search-scope.test.ts`:

```ts
describe('end-to-end motivating case (non-git home-dir cwd)', () => {
  it('a runaway bare search over a huge non-git tree times out with isError and a narrow-it message', async () => {
    // Simulate /home/destin: a NON-git cwd with a large child tree. With no
    // git repo above it, scope changes leave root = cwd — the timeout is the
    // SOLE guard here, and it must actually fire. Fixture size is a tradeoff:
    // big enough that rg cannot finish in 50 ms (even on a fast CI box), but
    // small enough that the write loop is not itself the slow part. 500 files
    // × 1000 lines = ~500k lines, a few MB of disk, and rg -l reading even a
    // fragment of that at ~1 GB/s will take longer than 50 ms.
    const huge = path.join(dir, 'bigdata');
    fs.mkdirSync(huge, { recursive: true });
    for (let i = 0; i < 500; i++) fs.writeFileSync(path.join(huge, `f${i}.txt`), 'needle\n'.repeat(1000));

    const homeCtx = makeCtx(dir); // no git repo at all
    const r = await GrepTool.execute(
      { pattern: 'needle', output_mode: 'files_with_matches' },
      { ...homeCtx, toolTimeoutMs: 50 }, // test-only override — driver never sets it
    );
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/timed out/);
    expect(r.text).toMatch(/narrow/i);
    expect(r.text).not.toMatch(/Search scoped to the project root/); // root === cwd
  });

  it('the same tree without the override completes — the tool is bounded, the timeout is a backstop', async () => {
    const huge = path.join(dir, 'bigdata');
    fs.mkdirSync(huge, { recursive: true });
    for (let i = 0; i < 100; i++) fs.writeFileSync(path.join(huge, `f${i}.txt`), 'needle\n'.repeat(300));
    const r = await GrepTool.execute({ pattern: 'needle', output_mode: 'files_with_matches' }, makeCtx(dir));
    expect(typeof r.text).toBe('string');
    expect(r.isError).toBeUndefined(); // bounded tree, no timeout
  });
});
```

> The 500-file fixture exists so 50 ms is a LARGE margin under real rg startup + walk cost on CI — if the first test ever flakes green-for-too-fast, raise the file count, not the timeout (the goal is "a runaway bare search collapses deterministically"). The second test keeps the fixture small (100 files × 300 lines) so the bounded-tree completion is genuinely fast.

- [ ] **Step 2: Run the full suite**

Run: `cd youcoded/desktop && npx vitest run tests/harness-search-scope.test.ts tests/harness-tool-timeout.test.ts tests/harness-tool-bounds.test.ts tests/harness-tool-conformance.test.ts tests/harness-tools-core.test.ts tests/harness-tool-guards.test.ts tests/harness-session.test.ts`
Expected: ALL PASS.

- [ ] **Step 3: Run the workspace verify suite (or at least tsc + lint)**

Run: `cd youcoded/desktop && npx tsc --noEmit && npm run lint`
Expected: no type errors, no new lint failures.

- [ ] **Step 4: Commit**

```bash
cd youcoded/desktop && git add tests/harness-search-scope.test.ts
git commit -m "test(harness): end-to-end motivating case — bare search collapses on a huge non-git tree"
```

---

### Notes / follow-ups (folded in, not optional)

- **`AbortSignal.any` availability** is handled INSIDE `combineSignals` (Task 1, Step 3): a try/catch around the options object, with the listener-based fallback being semantically identical (non-forwarding) by construction. No separate task, no duplicated fallback.
- **Bash** is explicitly out of scope for this chunk — it already has its own timeout (`timeout` arg, 120 s default, SIGKILL + exit 124 + partial-output prefix). If a future chunk wants a session-level general tool cap, the `caps.timeoutMs` mechanism generalizes; it does not need Bash touched today.
- **`toolTimeoutMs`** is a test-only escape hatch on `ToolContext`; the driver never populates it, so production behavior is exactly `caps.timeoutMs`. If it ever proves useful in production (e.g. a Settings knob), the driver can populate it without another code change.