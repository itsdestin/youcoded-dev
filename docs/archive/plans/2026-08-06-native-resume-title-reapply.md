---
status: shipped
date: 2026-08-06
shipped: youcoded PR #286 (fix/native-resume-title-reapply)
investigation: docs/archive/investigations/2026-08-06-resumed-session-header-title-stuck.md
---

> **Shipped 2026-08-06 as youcoded PR #286.** Two things changed during
> execution, both recorded in the branch's commits:
> 1. **Task 5's guard was wrong as planned.** Gating the re-apply on
>    `opts.resumeSessionId` fires it on a REFUSED resume and on the "saved data
>    missing, start fresh under the same id" fallback, painting the real
>    conversation's name onto a session that is empty or dead. Shipped gated on
>    `nativeHost.resume()`'s own return value instead.
> 2. **A sixth change was added mid-flight**, outside this plan's scope: review
>    found that a native session created or resumed from a second main window
>    was delivered to window 1, because `assignSession` ran after the native
>    branch's `await`s while the `session-created` forward drained on
>    `process.nextTick`. Fixed by hoisting `assignSession`; pinned by
>    `tests/session-create-ownership-order.test.ts`.
>
> Known residue is on the ROADMAP: sessions with no *stored* title still show
> the placeholder until their next completed turn.

# Native Resume Title Re-Apply — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A resumed native session's header pill shows its real name instead of being stuck on `Resuming…` — whether or not the session was already titled.

**Architecture:** The bug is that `'Resuming…'` is a placeholder the codebase doesn't recognize as one. Two string literals live in the renderer (`App.tsx`) and nothing in the main process knows about them, so (a) nothing re-pushes a stored title on resume, and (b) the title feeder's `hasTitle` check mistakes the placeholder for a real name and skips generation forever. The fix introduces one shared placeholder predicate (`src/shared/session-title.ts`) that both processes import, routes `hasTitle` through it, and adds a small injected-deps module (`src/main/native-resume-title.ts`) that re-broadcasts the stored title after a native resume. Both new modules are pure/injected so they are unit-testable — `ipc-handlers.ts` is 3,906 lines and effectively untestable, which is why the logic goes *outside* it and only the wiring stays in.

**Tech Stack:** TypeScript, Electron (main + renderer), Vitest.

## Background — the two bugs

Verified against `master` (`youcoded` @ `63e2351c`) on 2026-08-06:

1. **Already-titled resumes.** `native-title-feeder.ts` only broadcasts a rename inside `onTitle`, which runs only when it *generates* a new title. `hasTitle` (`ipc-handlers.ts:2259`) short-circuits when the store already has one, so no rename is ever sent and the pill keeps the placeholder.
2. **Never-titled resumes.** `hasTitle`'s fallback is `!!session?.name && session.name !== 'New Session'`. `session-manager.ts:86/149` copies the renderer's `opts.name` straight into `SessionInfo`, so on resume that name is literally `'Resuming…'` — which is not `'New Session'`, so `hasTitle` returns **true** and generation is blocked permanently. The investigation doc's §7c ("the normal generation path fills it in later") is wrong about exactly this case.

**Correction to the investigation doc §5:** the store record is *not* already in hand on the common path. The `getConversationStore()?.get('native', …)` at `ipc-handlers.ts:579` sits inside the `else` branch — it runs only when `opts.cwd` is absent, foreign, or holds no transcript. A local resume (the common case, `ipc-handlers.ts:572`) never reads the store. Hanging the re-apply off that existing `rec` variable would fix only cross-device resumes and appear to fix nothing. This plan does its own read.

## Global Constraints

- **Worktree required.** All work happens in a git worktree, never the main `youcoded/` checkout (workspace CLAUDE.md → Git, worktrees, and shipping).
- **Serena cannot see the worktree.** It is pinned to `youcoded/` and silently answers with `master`'s copy. Branch truth is `bash scripts/verify.sh <worktree>` only.
- **Every non-trivial edit carries a WHY comment.** Destin is a non-developer and reads the comments to understand the change.
- **Desktop-only change; no Android mirror is needed.** Verified: `rg '"native"|resumeSessionId' app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` returns nothing — Android has no native provider and no resume-by-id path. The one renderer file touched (`App.tsx`) *is* shared with the Android WebView, but that edit is a constant extraction with no behavior change.
- **Do not widen `store-core.ts`'s `realTitle`.** That predicate (`store-core.ts:150`, placeholders `''` and `'Untitled'` only) governs CRDT title merge across devices. Adding `'New Session'` / `'Resuming…'` to it would change which title wins on sync. The new predicate is deliberately separate and must stay separate.
- **Never plant a placeholder as a title.** Only re-apply a name that passes `isRealSessionName`.
- Exact placeholder spellings, copied verbatim from the code: `'Resuming…'` (U+2026 ellipsis, native, `App.tsx:2358`) and `'Resuming...'` (three ASCII periods, Claude Code, `App.tsx:2396`). They are different strings; both must be covered.

## Out of scope (deliberate)

The investigation's §7b — re-applying the name on **Claude Code** resume — is **not** in this plan. The CC path has a working producer (the topic-file watcher, `ipc-handlers.ts:2531`) and its failure is conditional on hook timing and the `source` gating in `session-id-mapping.ts`, which is load-bearing for foreign-process safety. That is a separate diagnosis with its own risk surface. This plan fixes the two *structural* native bugs, which are the reported "mostly native" symptom. File §7b as a ROADMAP follow-up if the CC case still reproduces after this ships.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `youcoded/desktop/src/shared/session-title.ts` | **Create** | The single definition of "this session name is a placeholder, not a title." Imported by both renderer and main — two copies of these literals is what caused the bug. |
| `youcoded/desktop/tests/session-title.test.ts` | **Create** | Unit tests for the predicate. |
| `youcoded/desktop/src/main/native-resume-title.ts` | **Create** | `reapplyStoredTitle()` — reads the stored title for a resumed native session and re-broadcasts it. Injected deps (mirrors `native-title-feeder.ts`) so it is testable without Electron. |
| `youcoded/desktop/tests/native-resume-title.test.ts` | **Create** | Unit tests for the re-apply, including the never-throws contract. |
| `youcoded/desktop/src/renderer/App.tsx` | Modify (`:2358`, `:2396`) | Use the shared constants instead of inline string literals. |
| `youcoded/desktop/src/main/ipc-handlers.ts` | Modify (`:2259-2264`, `~:640`) | Route `hasTitle` through the shared predicate; call `reapplyStoredTitle` after a native resume. |
| `youcoded/desktop/src/main/conversations/store-core.ts` | Modify (`:146-150`) | Comment only — point at the new module and say why the two predicates differ. |

---

## Task 0: Set up the worktree

**Files:** none (environment only)

- [ ] **Step 1: Sync master and create the worktree**

```bash
cd /home/destin/youcoded-dev/youcoded
git fetch origin && git pull origin master
git worktree add worktrees/resume-title -b fix/native-resume-title-reapply origin/master
cd worktrees/resume-title/desktop && npm ci
```

- [ ] **Step 2: Confirm the baseline is green**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh /home/destin/youcoded-dev/youcoded/worktrees/resume-title`
Expected: exit 0. If master is already red, stop and report — do not build on a red baseline.

**All paths below are relative to `youcoded/worktrees/resume-title/desktop/`.**

---

## Task 1: Shared placeholder predicate

**Files:**
- Create: `src/shared/session-title.ts`
- Test: `tests/session-title.test.ts`
- Modify: `src/main/conversations/store-core.ts:146-150` (comment only)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `const RESUMING_NATIVE: 'Resuming…'`
  - `const RESUMING_CLAUDE: 'Resuming...'`
  - `const NEW_SESSION: 'New Session'`
  - `function isPlaceholderSessionName(name: string | undefined | null): boolean`
  - `function isRealSessionName(name: string | undefined | null): boolean`
  - `function hasRealTitle(storedTitle: string | undefined | null, liveName: string | undefined | null): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/session-title.test.ts`:

```ts
// Pins the placeholder-name predicate. The resumed-session title bug existed
// because 'Resuming…' was a bare string literal in App.tsx that the main
// process had never heard of — so hasTitle mistook it for a real title and
// blocked auto-title generation forever. One definition, tested, is the fix.
import { describe, it, expect } from 'vitest';
import {
  RESUMING_NATIVE,
  RESUMING_CLAUDE,
  NEW_SESSION,
  isPlaceholderSessionName,
  isRealSessionName,
  hasRealTitle,
} from '../src/shared/session-title';

describe('session-title placeholders', () => {
  it('spells the placeholders exactly as the renderer plants them', () => {
    // These are DIFFERENT strings — native uses a U+2026 ellipsis, Claude Code
    // uses three ASCII periods. Covering only one leaves half the bug alive.
    expect(RESUMING_NATIVE).toBe('Resuming…');
    expect(RESUMING_CLAUDE).toBe('Resuming...');
    expect(NEW_SESSION).toBe('New Session');
    expect(RESUMING_NATIVE).not.toBe(RESUMING_CLAUDE);
  });

  it.each([
    ['', 'empty string'],
    ['   ', 'whitespace only'],
    ['New Session', 'fresh-session placeholder'],
    ['Untitled', 'legacy store placeholder'],
    ['Resuming…', 'native resume placeholder'],
    ['Resuming...', 'claude resume placeholder'],
    [' Resuming… ', 'padded native resume placeholder'],
    [undefined, 'undefined'],
    [null, 'null'],
  ])('treats %j as a placeholder (%s)', (name) => {
    expect(isPlaceholderSessionName(name as any)).toBe(true);
    expect(isRealSessionName(name as any)).toBe(false);
  });

  it.each([
    'Fixing The Login Bug',
    'Resuming The Migration',   // starts with the placeholder word but is a real title
    'new session',              // case-sensitive: not the placeholder
    'Untitled Document',
  ])('treats %j as a real name', (name) => {
    expect(isRealSessionName(name)).toBe(true);
    expect(isPlaceholderSessionName(name)).toBe(false);
  });

  describe('hasRealTitle', () => {
    it('is true when the store has a real title', () => {
      expect(hasRealTitle('Fixing The Login Bug', 'Resuming…')).toBe(true);
    });

    it('is true when only the live session name is real', () => {
      expect(hasRealTitle('', 'Fixing The Login Bug')).toBe(true);
    });

    it('is FALSE when the live name is a resume placeholder', () => {
      // The whole bug: this returned true before, so the feeder never
      // generated a title for a resumed, never-titled session.
      expect(hasRealTitle(undefined, 'Resuming…')).toBe(false);
      expect(hasRealTitle(undefined, 'Resuming...')).toBe(false);
    });

    it('is false when both sides are placeholders', () => {
      expect(hasRealTitle('Untitled', 'New Session')).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/session-title.test.ts`
Expected: FAIL — `Failed to resolve import "../src/shared/session-title"`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/session-title.ts`:

```ts
// Placeholder session names — the strings the app shows on a session pill
// BEFORE a real title exists. They are not titles; they mean "no title yet"
// rendered as text.
//
// WHY this lives in shared/: the renderer plants these names (App.tsx's resume
// paths) and the MAIN process has to recognize them (the native title feeder's
// hasTitle check, and the resume-time re-apply). When they were bare literals
// in App.tsx only, main had never heard of 'Resuming…', so hasTitle read it as
// a real title and permanently blocked auto-title generation for every resumed
// native session. One definition, both processes.
//
// NOTE — deliberately NOT the same predicate as store-core.ts's `realTitle`.
// That one recognizes only '' and 'Untitled', and it governs the cross-device
// CRDT merge that decides which title wins on sync. Widening it would change
// sync results. This predicate is about the LIVE session name in one process.

export const RESUMING_NATIVE = 'Resuming…'; // U+2026 ellipsis — App.tsx native resume
export const RESUMING_CLAUDE = 'Resuming...';    // three ASCII periods — App.tsx CC resume
export const NEW_SESSION = 'New Session';        // fresh-session placeholder
const UNTITLED = 'Untitled';                     // legacy placeholder older clients wrote

const PLACEHOLDER_SESSION_NAMES: ReadonlySet<string> = new Set([
  '',
  NEW_SESSION,
  UNTITLED,
  RESUMING_NATIVE,
  RESUMING_CLAUDE,
]);

/** True when `name` is absent or is one of the app's "no title yet" strings. */
export function isPlaceholderSessionName(name: string | undefined | null): boolean {
  if (!name) return true;
  return PLACEHOLDER_SESSION_NAMES.has(name.trim());
}

/** True when `name` is a genuine, user-meaningful session title. */
export function isRealSessionName(name: string | undefined | null): boolean {
  return !isPlaceholderSessionName(name);
}

/**
 * Does this session already have a title worth keeping? Store title wins;
 * the live session name is the fallback for the window between resume and the
 * store's first upsert. Either side counts, but ONLY if it is a real name —
 * a placeholder on either side must read as "still untitled".
 */
export function hasRealTitle(
  storedTitle: string | undefined | null,
  liveName: string | undefined | null,
): boolean {
  return isRealSessionName(storedTitle) || isRealSessionName(liveName);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run tests/session-title.test.ts`
Expected: PASS — every case in the file green, no skips.

- [ ] **Step 5: Add the cross-reference comment in store-core**

In `src/main/conversations/store-core.ts`, replace the comment block above `realTitle` (currently lines 146-150) with:

```ts
// A "real" title is non-empty and not the literal 'Untitled' — that literal
// is a legacy placeholder some older clients wrote (see PITFALLS → Resume
// Browser) and must never shadow an actual name. Shared by the pairwise merge
// and the fold's set-based title pick so the two definitions can't drift.
//
// DO NOT unify this with shared/session-title.ts's isRealSessionName. That one
// also rejects 'New Session' and the 'Resuming…' placeholders, which is right
// for a LIVE session name but wrong here: this predicate decides which title
// wins the cross-device CRDT merge, and widening it changes sync results on
// records that already exist on other devices.
const realTitle = (t: string) => (t && t !== 'Untitled' ? t : '');
```

- [ ] **Step 6: Verify nothing else broke**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh /home/destin/youcoded-dev/youcoded/worktrees/resume-title`
Expected: exit 0.

Note: `knip` runs inside `verify.sh`. `session-title.ts` has consumers only from Task 2 onward, so if knip flags it as unused here, that is expected — proceed, and confirm the flag is gone after Task 3.

- [ ] **Step 7: Commit**

```bash
git add src/shared/session-title.ts tests/session-title.test.ts src/main/conversations/store-core.ts
git commit -m "feat(session-title): one shared definition of a placeholder session name

The renderer planted 'Resuming…' as a bare literal that the main process had
never heard of, so the native title feeder read it as a real title. Extract the
predicate both processes need, and document why it must NOT be unified with
store-core's CRDT merge predicate."
```

---

## Task 2: Renderer uses the shared constants

**Files:**
- Modify: `src/renderer/App.tsx:2358`, `src/renderer/App.tsx:2396`

**Interfaces:**
- Consumes: `RESUMING_NATIVE`, `RESUMING_CLAUDE` from `src/shared/session-title` (Task 1).
- Produces: nothing new. This is a no-behavior-change refactor whose only job is to make the literals impossible to drift from the predicate.

- [ ] **Step 1: Add the import**

Add to the existing import block at the top of `src/renderer/App.tsx` (place it next to the other `../shared/...` imports):

```ts
import { RESUMING_NATIVE, RESUMING_CLAUDE } from '../shared/session-title';
```

- [ ] **Step 2: Replace the native resume placeholder**

At `src/renderer/App.tsx:2358`, change:

```ts
        name: 'Resuming…',
```

to:

```ts
        // WHY the constant: main's title feeder must be able to RECOGNIZE this
        // as a placeholder (shared/session-title.ts). A bare literal here is
        // what let it pass as a real title and block auto-titling on resume.
        name: RESUMING_NATIVE,
```

- [ ] **Step 3: Replace the Claude Code resume placeholder**

At `src/renderer/App.tsx:2396`, change:

```ts
      name: 'Resuming...',
```

to:

```ts
      name: RESUMING_CLAUDE, // see RESUMING_NATIVE above — different spelling, same contract
```

- [ ] **Step 4: Verify no literal survives**

Run: `rg -n "'Resuming…'|'Resuming\.\.\.'" src/renderer/App.tsx`
Expected: no output (exit 1). Any hit means a third copy exists that the investigation missed — fix it the same way before continuing.

- [ ] **Step 5: Verify the build and tests**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh /home/destin/youcoded-dev/youcoded/worktrees/resume-title`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "refactor(renderer): plant resume placeholders from the shared constants

No behavior change. Removes the two literals that main could not recognize."
```

---

## Task 3: Unblock auto-title generation for resumed sessions

**Files:**
- Modify: `src/main/ipc-handlers.ts:2259-2264` (the `hasTitle` dep passed to `createNativeTitleFeeder`)

**Interfaces:**
- Consumes: `hasRealTitle` from `src/shared/session-title` (Task 1).
- Produces: nothing new. Fixes bug 2 — a resumed native session that was never titled now gets a title generated on its next `turn-complete`.

**Why there is no new test here:** the logic being fixed now lives in `hasRealTitle`, which Task 1 tests directly (including the exact `hasRealTitle(undefined, 'Resuming…') === false` case). What remains in `ipc-handlers.ts` is two lines of wiring around a store read, inside a 3,906-line module that has no test harness capable of instantiating the feeder. Moving the logic out is what made it testable; do not add a brittle source-text assertion in its place.

- [ ] **Step 1: Add the import**

Add to the shared-module imports near the top of `src/main/ipc-handlers.ts` (alongside the existing `../shared/types` import):

```ts
import { hasRealTitle } from '../shared/session-title';
```

- [ ] **Step 2: Replace the hasTitle dep**

At `src/main/ipc-handlers.ts:2255-2264`, replace:

```ts
    // Store title wins; falls back to the live session name for the boot
    // window before the store's first upsert lands (mirrors the browse/store
    // title-overlay precedence Task 3/5 established — store wins unless
    // placeholder).
    hasTitle: async (sessionId: string) => {
      const rec = await getConversationStore()?.get('native', sessionId);
      if (rec?.title && rec.title !== 'Untitled') return true;
      const session = sessionManager.getSession(sessionId);
      return !!session?.name && session.name !== 'New Session';
    },
```

with:

```ts
    // Store title wins; falls back to the live session name for the boot
    // window before the store's first upsert lands (mirrors the browse/store
    // title-overlay precedence Task 3/5 established — store wins unless
    // placeholder).
    //
    // Fix (2026-08-06): both halves now go through the SHARED placeholder
    // predicate. The old fallback only excluded 'New Session', so a RESUMED
    // session — whose live name is 'Resuming…' — answered "already titled" and
    // this feeder skipped generation on every turn-complete, permanently. A
    // resumed, never-titled native session could never get a title at all.
    hasTitle: async (sessionId: string) => {
      const rec = await getConversationStore()?.get('native', sessionId);
      return hasRealTitle(rec?.title, sessionManager.getSession(sessionId)?.name);
    },
```

- [ ] **Step 3: Verify**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh /home/destin/youcoded-dev/youcoded/worktrees/resume-title`
Expected: exit 0. `tests/native-title-feeder.test.ts` must still pass — it injects `hasTitle` directly, so it is unaffected, and a failure there means something else moved.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "fix(native-title): stop the 'Resuming…' placeholder from blocking auto-titling

hasTitle's fallback only rejected 'New Session', so a resumed session's
'Resuming…' name read as a real title and the feeder skipped generation on
every turn-complete. A resumed, never-titled native session could never get a
title. Both halves now use the shared placeholder predicate."
```

**Behavior change worth calling out in the PR:** a stored title of literally `'New Session'` now counts as untitled and will be regenerated. Previously only `'Untitled'` did. This is intended — `'New Session'` is a placeholder everywhere else in the app — but it means a handful of old records may pick up a real title on their next turn.

---

## Task 4: Re-apply the stored title on native resume

**Files:**
- Create: `src/main/native-resume-title.ts`
- Test: `tests/native-resume-title.test.ts`

**Interfaces:**
- Consumes: `isRealSessionName` from `src/shared/session-title` (Task 1).
- Produces:
  - `interface ResumeTitleDeps { getStoredTitle(sessionId: string): Promise<string | undefined>; onTitle(sessionId: string, title: string): void; }`
  - `function reapplyStoredTitle(deps: ResumeTitleDeps, sessionId: string): Promise<string | null>` — returns the re-applied title, or `null` when there was nothing real to apply or the read failed.

**Why injected deps:** this is the same pattern `native-title-feeder.ts` uses, for the same reason — the real collaborators are a Conversation Store read and two IPC sends, neither of which exists in a unit test. Injecting them also lets the test make the store read *reject*, which is the only way to prove the never-throws contract.

- [ ] **Step 1: Write the failing test**

Create `tests/native-resume-title.test.ts`:

```ts
// Pins the resume-time title re-apply. The native title feeder only broadcasts
// a rename when it GENERATES a title, and an already-titled session never
// regenerates — so before this module, resuming an already-named native
// session left its header pill stuck on 'Resuming…' forever.
import { describe, it, expect, vi } from 'vitest';
import { reapplyStoredTitle, type ResumeTitleDeps } from '../src/main/native-resume-title';

function mkDeps(overrides: Partial<ResumeTitleDeps> = {}): ResumeTitleDeps {
  return {
    getStoredTitle: vi.fn(async () => 'Fixing The Login Bug'),
    onTitle: vi.fn(),
    ...overrides,
  };
}

describe('reapplyStoredTitle', () => {
  it('re-applies a real stored title', async () => {
    const deps = mkDeps();
    const applied = await reapplyStoredTitle(deps, 's1');

    expect(applied).toBe('Fixing The Login Bug');
    expect(deps.getStoredTitle).toHaveBeenCalledWith('s1');
    expect(deps.onTitle).toHaveBeenCalledTimes(1);
    expect(deps.onTitle).toHaveBeenCalledWith('s1', 'Fixing The Login Bug');
  });

  it.each([undefined, '', '   ', 'Untitled', 'New Session', 'Resuming…'])(
    'never plants the placeholder %j over the live name',
    async (stored) => {
      const deps = mkDeps({ getStoredTitle: vi.fn(async () => stored as any) });
      const applied = await reapplyStoredTitle(deps, 's1');

      expect(applied).toBeNull();
      expect(deps.onTitle).not.toHaveBeenCalled();
    },
  );

  it('trims the stored title before applying it', async () => {
    const deps = mkDeps({ getStoredTitle: vi.fn(async () => '  Fixing The Login Bug  ') });
    await reapplyStoredTitle(deps, 's1');

    expect(deps.onTitle).toHaveBeenCalledWith('s1', 'Fixing The Login Bug');
  });

  it('swallows a store read failure — a resume must never fail over a title', async () => {
    const deps = mkDeps({ getStoredTitle: vi.fn(async () => { throw new Error('store unavailable'); }) });

    await expect(reapplyStoredTitle(deps, 's1')).resolves.toBeNull();
    expect(deps.onTitle).not.toHaveBeenCalled();
  });

  it('swallows a broadcast failure for the same reason', async () => {
    const deps = mkDeps({ onTitle: vi.fn(() => { throw new Error('window destroyed'); }) });

    await expect(reapplyStoredTitle(deps, 's1')).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/native-resume-title.test.ts`
Expected: FAIL — `Failed to resolve import "../src/main/native-resume-title"`.

- [ ] **Step 3: Write the implementation**

Create `src/main/native-resume-title.ts`:

```ts
// Resume-time title re-apply for native sessions.
//
// WHY this module exists: the renderer names a resumed session 'Resuming…' as a
// placeholder, and the ONLY thing that ever renames a native session pill is
// native-title-feeder.ts's onTitle — which fires only when the feeder GENERATES
// a title. An already-titled session never regenerates (that guard is correct),
// so nothing re-pushed the stored name and the pill stayed on the placeholder
// for the life of the session. This puts the stored title back on the live
// session right after the resume completes.
//
// Deps are injected (same pattern as native-title-feeder.ts) because the real
// collaborators are a Conversation Store read and two IPC sends — and because a
// fake that cannot fail certifies the bug it should catch (youcoded #177).
import { isRealSessionName } from '../shared/session-title';

export interface ResumeTitleDeps {
  /** Reads the stored title for this native conversation. Native ids are
   *  identity-mapped, so the session id IS the store's record id. */
  getStoredTitle: (sessionId: string) => Promise<string | undefined>;
  /** Pushes the name onto the live session — the same SESSION_RENAMED send +
   *  broadcastRename pair the title feeder's onTitle uses. */
  onTitle: (sessionId: string, title: string) => void;
}

/**
 * Re-broadcast a resumed native session's stored title so its header pill
 * stops showing the 'Resuming…' placeholder.
 *
 * Returns the title that was applied, or null when there was nothing real to
 * apply. NEVER throws and NEVER rejects: a resume must not fail because a title
 * could not be read. A no-op here is harmless — the session is untitled, and
 * the title feeder will generate one at the next turn-complete.
 */
export async function reapplyStoredTitle(
  deps: ResumeTitleDeps,
  sessionId: string,
): Promise<string | null> {
  try {
    const stored = await deps.getStoredTitle(sessionId);
    // Guardrail: only ever plant a REAL name. Broadcasting a placeholder here
    // would overwrite a good live name with 'Untitled' / 'New Session'.
    if (!isRealSessionName(stored)) return null;

    const title = stored!.trim();
    deps.onTitle(sessionId, title);
    return title;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run tests/native-resume-title.test.ts`
Expected: PASS — every case in the file green, no skips.

- [ ] **Step 5: Commit**

```bash
git add src/main/native-resume-title.ts tests/native-resume-title.test.ts
git commit -m "feat(native-resume): add the stored-title re-apply

The title feeder only renames a session when it GENERATES a title, so an
already-titled session had no producer of a rename on resume. This is that
producer. Injected deps + never-throws so a resume can't fail over a title."
```

---

## Task 5: Wire the re-apply into the native resume path

**Files:**
- Modify: `src/main/ipc-handlers.ts` (SESSION_CREATE native branch, just after `noteSessionStarted(info.id, info.cwd, 'native');` — currently `:659`)

**Interfaces:**
- Consumes: `reapplyStoredTitle`, `ResumeTitleDeps` from `src/main/native-resume-title` (Task 4); the existing `getConversationStore()`, `sendForSession`, `broadcastRename`, `IPC.SESSION_RENAMED`.
- Produces: nothing consumed by later tasks.

**Placement rationale — read before editing.** `ipc-handlers.ts:535-537` states, and the code confirms, that "the native branch of createSession uses `resumeSessionId` AS the id, so `info.id` already equals the resumed id." So one id serves as both the desktop session id (what `broadcastRename` needs) and the store record id (what the lookup needs) — no mapping. The call goes *after* `noteSessionStarted`, which is the point where the host create/resume has awaited successfully and the lease/model wiring has run; putting it earlier risks re-applying a title onto a session that failed to start.

**`broadcastRename` is declared below this call site** (`:2504`) but both live inside the same `registerIpcHandlers` body, and `function` declarations hoist — the same pattern the existing `onTitle` dep at `:2270` already relies on. Do not restructure to "fix" this.

- [ ] **Step 1: Add the import**

Add near the other `./` main-process imports in `src/main/ipc-handlers.ts`:

```ts
import { reapplyStoredTitle, type ResumeTitleDeps } from './native-resume-title';
```

- [ ] **Step 2: Add the deps object inside `registerIpcHandlers`**

Place this immediately above the `ipcMain.handle(IPC.SESSION_CREATE, ...)` registration (currently `:532`), so it is in scope for the handler:

```ts
  // Deps for the resume-time title re-apply (native-resume-title.ts). These are
  // exactly the two calls the title feeder's own onTitle makes — the pill only
  // updates when BOTH fire (sendForSession reaches the owning window's
  // App.tsx sessionRenamed handler; broadcastRename updates SessionInfo, the
  // remote clients, and the window directory).
  const resumeTitleDeps: ResumeTitleDeps = {
    getStoredTitle: async (sessionId) => (await getConversationStore()?.get('native', sessionId))?.title,
    onTitle: (sessionId, title) => {
      sendForSession(sessionId, IPC.SESSION_RENAMED, sessionId, title);
      broadcastRename(sessionId, title);
    },
  };
```

- [ ] **Step 3: Call it after the resume settles**

In the native branch, immediately after the existing line `noteSessionStarted(info.id, info.cwd, 'native');` (currently `:659`), insert:

```ts
        // Fix (2026-08-06): fill the header pill in on resume. The renderer
        // named this session 'Resuming…' as a placeholder, and the title feeder
        // only ever pushes a rename when it GENERATES a title — which it
        // correctly refuses to do for an already-titled session. Without this,
        // the placeholder is the last name ever written to the pill.
        // Fire-and-forget: never let a title read delay or fail a resume. Note
        // this deliberately does its OWN store read — the `rec` fetched during
        // cwd resolution above only exists on the foreign-cwd branch, not on
        // the common local-resume path.
        if (opts.resumeSessionId) {
          void reapplyStoredTitle(resumeTitleDeps, info.id);
        }
```

- [ ] **Step 4: Verify the whole desktop checkout**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh /home/destin/youcoded-dev/youcoded/worktrees/resume-title`
Expected: exit 0 — `tsc`, affected `vitest`, `knip` (both new modules now have consumers), `eslint` (the `void` prefix is what keeps the floating-promise rule happy), and the ast-grep scan all green.

- [ ] **Step 5: Run the full suite once**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh /home/destin/youcoded-dev/youcoded/worktrees/resume-title --full`
Expected: exit 0. This touches `App.tsx` and `ipc-handlers.ts`, both of which many tests reach transitively — run the full suite before asking Destin to look at it.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "fix(native-resume): re-apply the stored title so the header pill fills in

Resuming an already-titled native session left its pill on 'Resuming…' — the
title feeder only broadcasts a rename when it generates one, and an already-
titled session never regenerates. Re-push the stored title once the resume
settles. Does its own store read: the record fetched during cwd resolution
exists only on the foreign-cwd branch, not on a normal local resume."
```

---

## Task 6: Live verification and close-out

**Files:**
- Move: `docs/active/investigations/2026-08-06-resumed-session-header-title-stuck.md` → `docs/archive/investigations/`
- Modify: this plan's `status:` frontmatter

**This task is a handoff, not an automation.** Per workspace CLAUDE.md, final-stage interactive verification goes to Destin rather than a scripted rig — this needs a real resume of a real session and a look at the header.

- [ ] **Step 1: Launch the dev instance**

```bash
cd /home/destin/youcoded-dev
bash scripts/run-dev.sh /home/destin/youcoded-dev/youcoded/worktrees/resume-title --label "Resume Title Fix"
```

Never test against Destin's live app (`.claude/rules/live-app-safety.md`).

- [ ] **Step 2: Ask Destin to check four cases**

Give him this list verbatim:

1. Resume an **already-titled native** session → pill shows its real name within a second, not `Resuming…`. *(bug 1)*
2. Resume a **never-titled native** session, then send one message and let the turn finish → pill fills in with a generated title. *(bug 2)*
3. Start a **fresh native** session → still titles itself at the first completed turn, exactly as before. *(no regression)*
4. Resume a **Claude Code** session → unchanged from today. *(out of scope; confirms nothing broke)*

- [ ] **Step 3: Shut the dev instance down**

Only after the change is merged and pushed to `origin/master` — orphaned Vite servers hold port 5223 and break the next session's dev launch.

- [ ] **Step 4: Open the PR**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/resume-title
git push -u origin fix/native-resume-title-reapply
gh pr create --title "fix(native-resume): header pill stuck on 'Resuming…'" --body "$(cat <<'EOF'
Fixes two structural bugs that left a resumed native session's header pill on
the `Resuming…` placeholder.

1. **Already-titled resumes had no rename producer.** `native-title-feeder.ts`
   broadcasts a rename only when it *generates* a title, and it correctly skips
   an already-titled session — so nothing ever re-pushed the stored name.
   Added `native-resume-title.ts`, called once the resume settles.
2. **Never-titled resumes could never be titled at all.** `hasTitle`'s fallback
   rejected only `'New Session'`, so the live name `'Resuming…'` read as a real
   title and the feeder skipped generation on every `turn-complete`, forever.
   Both halves now go through one shared placeholder predicate
   (`shared/session-title.ts`), which the renderer also plants from.

**Behavior changes to note:** a stored title of literally `'New Session'` now
counts as untitled and will be regenerated on the next turn (previously only
`'Untitled'` did).

**Not in scope:** the Claude Code resume case. Its topic-file watcher is a
working producer whose failure is conditional on hook timing and the `source`
gating in `session-id-mapping.ts`; that is a separate diagnosis.

`store-core.ts`'s `realTitle` was deliberately left alone — it governs the
cross-device CRDT title merge, and widening it would change sync results. A
comment now says so at both sites.

Investigation: `youcoded-dev/docs/archive/investigations/2026-08-06-resumed-session-header-title-stuck.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: After merge — archive the docs and clean up**

```bash
cd /home/destin/youcoded-dev
git mv docs/active/investigations/2026-08-06-resumed-session-header-title-stuck.md docs/archive/investigations/
git mv docs/active/plans/2026-08-06-native-resume-title-reapply.md docs/archive/plans/
# set `status: shipped` in this plan's frontmatter before committing
git add -A && git commit -m "docs: archive the resumed-session title investigation + plan"
git push origin master

cd youcoded
git branch --contains "$(git rev-parse origin/fix/native-resume-title-reapply)" | grep master   # confirm it landed
git worktree remove worktrees/resume-title
git push origin --delete fix/native-resume-title-reapply
git branch -D fix/native-resume-title-reapply
```

- [ ] **Step 6: Correct the investigation doc before archiving it**

Its §5 ("the record is already in hand at `ipc-handlers.ts:579`") and §7c ("re-applying is a harmless no-op — the normal generation path fills it in later") are both wrong, and archived docs get read by future sessions. Add a short `## Corrections (2026-08-06, at implementation)` section recording both, pointing at this plan's Background section.
