---
status: active
date: 2026-07-31
pr: https://github.com/itsdestin/youcoded/pull/278
branch: feat/permission-ask-timeout
worktree: worktrees/perm-timeout
spec: docs/active/specs/2026-07-30-permission-ask-timeout-design.md
repos: [youcoded]
---

# Permission Ask Timeout Implementation Plan

> ## Status block — 2026-08-26 (added by a workstream review; nothing below was rewritten)
>
> **All 11 tasks are BUILT and pushed. The plan is not "unstarted" — the `- [ ]`
> boxes below were simply never ticked.** Verified: `git rev-list --count
> origin/master..feat/permission-ask-timeout` = **20** commits, last one
> `3eaafb71` (2026-07-31, `fix(permissions): close five review findings on the
> ask-timeout branch`), worktree `worktrees/perm-timeout` clean and level with
> `origin/feat/permission-ask-timeout`. Diffstat vs master: 39 files, +1868/-150.
>
> **PR #278 is OPEN, not a draft, and untouched since it was created**
> (`gh pr view 278 --json …` → `createdAt` and `updatedAt` both
> `2026-07-31T22:27:31Z`; `reviews: []`, `comments: []`, `reviewDecision: ""`).
> CI was **green** on that head — all four jobs pass (`gh pr checks 278`:
> Android build, desktop ubuntu/windows/macos) — but those runs are from
> 2026-07-31 and predate 663 master commits.
>
> **What is actually blocking it, in order:**
> 1. **Merge conflicts.** `gh pr view 278` reports `mergeable: CONFLICTING`,
>    `mergeStateStatus: DIRTY`. `git merge-tree --write-tree origin/master
>    feat/permission-ask-timeout` exits 1 with **8 conflicted files**:
>    `chat-reducer.ts`, `chat-reducer.test.ts`, `ToolCard.tsx`,
>    `ToolCard.test.tsx`, `shared/types.ts`, `hook-relay.ts`,
>    `EventBridge.kt`, `workbench-fixture-actions.test.ts`.
> 2. **Destin's four interactive checks** (blocked on Destin) — from the final
>    session on 2026-07-31: answer an ask in terminal view; kill the relay
>    mid-ask to see the digit-rebind buttons; confirm a background session keeps
>    its red dot; eyeball the expired-card copy in the Tool Gallery and the
>    buddy strip's longer Dismiss label at 320px.
>
> **Two Task 7/8 steps are now unexecutable as written.** They instruct adding
> `clearHold`/`holdJobs.remove` to `HookRelay.closeSocket()` and
> `EventBridge.closeSocket()`. Master **deleted both** on 2026-08-22 (merge
> `17931fc0`, "delete dead closeSocket on both platforms" — the ROADMAP item
> this branch's own review filed). `git grep -c closeSocket origin/master --
> desktop/ app/` now returns only `ManagedSession.kt:1`. Drop those two
> sub-steps during the rebase; nothing else in the design depended on them.
>
> **The five review findings in `3eaafb71` are all genuinely closed** (each
> verified in the worktree): `hook-relay.ts:123-135` guards the expiry emit on
> `respond()` returning true; `hook-relay.ts:115` derives `holdHours` from
> `this.holdMs` and `EventBridge.kt:153-154` from `PERMISSION_HOLD_MS`;
> `CompactToolStrip.tsx:287` reads "Dismiss — I answered in the terminal";
> `use-prompt-detector.test.tsx:207-295` adds the four resolver cases;
> `permission-timeout-margins.test.ts:77` pins `UNROUTABLE_HOLD_MS`.
>
> After merge, three cleanup items still stand: flip the ROADMAP entry to `[x]`,
> archive this plan and the spec to `docs/archive/`, remove the worktree and
> branch.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the silent 5-minute permission-ask expiry (which wedges AskUserQuestion sessions forever) with an app-owned 2-hour hold, staggered backstops, honest card states, and terminal-answer detection.

**Architecture:** Three staggered clocks (app 2h < relay 2h30m < CC 3h) so the app always ends the wait with a labeled deny; a `reason` field on `PERMISSION_EXPIRED` discriminates app-initiated endings from far-end death; a `'hook-closed'` expiry retains the card (`expired: true`) so the red dot and input gates keep holding, and `usePromptDetector`'s flush cycle resolves it when the Ink menu leaves the buffer. Android ships its `Bootstrap` find-and-replace fix in the same unit or existing installs regress to a permanent wedge.

**Tech Stack:** Electron main (TypeScript), shared React renderer (desktop + Android WebView), Node relay scripts, Kotlin (Android), vitest, Gradle unit tests.

**Branch/worktree:** All work in the `youcoded` repo on branch `feat/permission-ask-timeout` in a dedicated worktree (use superpowers:using-git-worktrees). One PR — the reducer unit (Tasks 3–6) and the Android pair (Tasks 1–2's Android halves) are NOT independently shippable (spec §Implementation order).

## Global Constraints

- **Constants (Destin-approved 2026-07-31):** app hold `7200000` ms (2h) · relay default `9000000` ms (2h30m) · CC hook entry `10800` s (3h) · unroutable hold `60000` ms. Margins are load-bearing — never equalize.
- **The nested decision shape is load-bearing:** every app deny/allow is `{ decision: { behavior: ... } }` — a flat `{ behavior }` ships `decision: undefined` (relay reads `appDecision.decision`).
- **Deny messages land verbatim in the tool result the model reads** (verified in CC 2.1.220 binary) — every auto-deny must say what happened and invite a re-ask.
- **`exit 2` on relay timeout stays** (fail-closed deny); `exit 0` on connection error stays (terminal fall-through).
- **Retention is opt-in:** only `reason: 'hook-closed'` retains a card. Absent reason ALWAYS resolves (native broker + old shims depend on it).
- **Deliberate menu-driving writes bypass `pty-input-gate`** (its header says so); automated writers must consult it. Digit writes only — never arrows+`\r` in one write (`.claude/rules/pty-io.md`).
- **Every non-trivial edit carries a WHY comment** (Destin is a non-developer; this is a workspace rule).
- **User-facing copy follows `docs/error-message-standards.md`:** specific-and-accurate, or general-and-non-committal. Never guess a cause.
- **Android + desktop ship together.** The React layer is shared; `app/src/main/assets/hook-relay-blocking.js` redeploys unconditionally on every launch, so the Bootstrap fix (Task 1) must be in the same release.
- Run `bash scripts/verify.sh <worktree>` (from the workspace root) before claiming any desktop task done; `./gradlew :app:testDebugUnitTest` for Android tasks.

---

### Task 1: Android `Bootstrap` find-and-replace for the PermissionRequest hook

The existing code only APPENDS the hook entry when missing — `timeout: 300` stays forever on every existing install, and shipping the relay-asset bump alone would regress those installs from "120s auto-deny" to "permanent wedge" (spec §Constraints). Extract the logic into a pure, testable helper with desktop's overwrite semantics.

**Files:**
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/Bootstrap.kt:989-1019`
- Test: `youcoded/app/src/test/kotlin/com/youcoded/app/runtime/BootstrapHooksTest.kt` (new)

**Interfaces:**
- Produces: `Bootstrap.ensurePermissionRequestHook(hooksObj: JSONObject, blockingHookCommand: String, timeoutSeconds: Int)` — companion-object function; Task 2 changes the `timeoutSeconds` argument at the call site to `PERMISSION_HOOK_TIMEOUT_SECONDS`.

- [ ] **Step 1: Write the failing test**

```kotlin
package com.youcoded.app.runtime

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

/** Guards the 2026-07-30 spec §Constraints inversion: an install that already
 *  has the hook must still receive a changed timeout on the next launch. */
class BootstrapHooksTest {

    private fun existingHooks(timeout: Int): JSONObject {
        val h = JSONObject().put("type", "command")
            .put("command", "node /old/path/hook-relay-blocking.js").put("timeout", timeout)
        val entry = JSONObject().put("matcher", ".*")
            .put("hooks", JSONArray().put(h))
        return JSONObject().put("PermissionRequest", JSONArray().put(entry))
    }

    @Test
    fun `overwrites timeout and command on an existing entry`() {
        val hooksObj = existingHooks(300)
        Bootstrap.ensurePermissionRequestHook(hooksObj, "node /new/path/hook-relay-blocking.js", 10800)
        val h = hooksObj.getJSONArray("PermissionRequest")
            .getJSONObject(0).getJSONArray("hooks").getJSONObject(0)
        assertEquals(10800, h.getInt("timeout"))
        assertEquals("node /new/path/hook-relay-blocking.js", h.getString("command"))
    }

    @Test
    fun `appends a new entry when none exists`() {
        val hooksObj = JSONObject()
        Bootstrap.ensurePermissionRequestHook(hooksObj, "node /p/hook-relay-blocking.js", 10800)
        val arr = hooksObj.getJSONArray("PermissionRequest")
        assertEquals(1, arr.length())
        val h = arr.getJSONObject(0).getJSONArray("hooks").getJSONObject(0)
        assertEquals(10800, h.getInt("timeout"))
        assertEquals("command", h.getString("type"))
    }

    @Test
    fun `does not duplicate on repeat runs`() {
        val hooksObj = existingHooks(300)
        Bootstrap.ensurePermissionRequestHook(hooksObj, "node /p/hook-relay-blocking.js", 10800)
        Bootstrap.ensurePermissionRequestHook(hooksObj, "node /p/hook-relay-blocking.js", 10800)
        assertEquals(1, hooksObj.getJSONArray("PermissionRequest").length())
    }
}
```

(`org.json` works in local unit tests here — `HookSerializerTest.kt` already uses it.)

- [ ] **Step 2: Run it — expect compile failure** (`ensurePermissionRequestHook` doesn't exist)

Run from `youcoded/`: `./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.runtime.BootstrapHooksTest"`

- [ ] **Step 3: Implement the helper and swap the call site**

In `Bootstrap.kt`, add to (or create) the `companion object`:

```kotlin
    /** Ensure the PermissionRequest blocking-relay hook entry exists AND
     *  carries the current command + timeout. WHY: earlier versions only
     *  appended when missing, so every existing install kept timeout 300
     *  forever — and the relay asset DOES redeploy on every launch, so a
     *  relay-only change would put relay-2h30m against CC-300s: CC kills the
     *  hook with no decision and AskUserQuestion wedges permanently
     *  (2026-07-30 spec §Constraints). Mirrors desktop install-hooks.js
     *  find-and-replace semantics. */
    fun ensurePermissionRequestHook(
        hooksObj: JSONObject,
        blockingHookCommand: String,
        timeoutSeconds: Int,
    ) {
        val prEvent = "PermissionRequest"
        val prArray = hooksObj.optJSONArray(prEvent) ?: org.json.JSONArray()
        var updated = false
        for (i in 0 until prArray.length()) {
            val hooks = prArray.optJSONObject(i)?.optJSONArray("hooks") ?: continue
            for (j in 0 until hooks.length()) {
                val h = hooks.optJSONObject(j)
                if (h?.optString("command")?.contains("hook-relay-blocking.js") == true) {
                    h.put("command", blockingHookCommand)
                    h.put("timeout", timeoutSeconds)
                    updated = true
                }
            }
        }
        if (!updated) {
            val hookEntry = JSONObject()
            hookEntry.put("matcher", ".*")
            val hooksList = org.json.JSONArray()
            val hookDef = JSONObject()
            hookDef.put("type", "command")
            hookDef.put("command", blockingHookCommand)
            hookDef.put("timeout", timeoutSeconds)
            hooksList.put(hookDef)
            hookEntry.put("hooks", hooksList)
            prArray.put(hookEntry)
        }
        hooksObj.put(prEvent, prArray)
    }
```

Replace the whole block at `Bootstrap.kt:989-1019` (from `// Register PermissionRequest with blocking relay` through `hooksObj.put(prEvent, prArray)`) with:

```kotlin
        // Register PermissionRequest with blocking relay (long timeout for user approval)
        ensurePermissionRequestHook(hooksObj, blockingHookCommand, 300)
```

(Value stays 300 in this task — Task 2 flips it. This task is behavior-preserving except for the overwrite semantics.)

- [ ] **Step 4: Run the test — expect PASS**, then run the full Android unit suite: `./gradlew :app:testDebugUnitTest`

- [ ] **Step 5: Commit** — `fix(android): PermissionRequest hook timeout now updates on existing installs`

---

### Task 2: The six timeout constants + every stale comment/doc/test-harness site

**Files:**
- Modify: `youcoded/desktop/hook-scripts/relay-blocking.js:19-22`
- Modify: `youcoded/desktop/scripts/install-hooks.js:114,126`
- Modify: `youcoded/app/src/main/assets/hook-relay-blocking.js:14-16` (comment above + literal)
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/Bootstrap.kt` (call-site value → named constant)
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/parser/EventBridge.kt:146`, `HookEvent.kt:60` (stale "(120s)" prose)
- Modify: `youcoded/desktop/docs/test-blocking-relay.js:144` (old fail-open assertion)
- Modify: `youcoded/desktop/docs/blocking-relay-handoff.md:44,50,123` + its deny-path claim
- Test: `youcoded/desktop/tests/permission-timeout-margins.test.ts` (new)

**Interfaces:**
- Produces: `PERMISSION_HOOK_TIMEOUT_SECONDS = 10800` (Bootstrap companion const). Tasks 7/8 EXTEND the margins test with the app-hold assertions (`APP_HOLD_MS`, `PERMISSION_HOLD_MS`) — this task pins relay < CC and desktop==android only.

- [ ] **Step 1: Write the failing margins test**

```ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Pins the §1 tier margins by reading the LITERALS, not process.env-resolved
// values (the env override would make an env-based test pass vacuously —
// spec §Constraints). All six sites live in this one repo.
const repoRoot = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(repoRoot, p), 'utf8');

function literal(file: string, re: RegExp): number {
  const m = read(file).match(re);
  if (!m) throw new Error(`pattern ${re} not found in ${file}`);
  return parseInt(m[1].replace(/_/g, ''), 10);
}

const RELAY_RE = /CLAUDE_RELAY_TIMEOUT \|\| '(\d+)'/;

describe('permission timeout tier margins (2026-07-30 spec §1)', () => {
  const desktopRelay = () => literal('desktop/hook-scripts/relay-blocking.js', RELAY_RE);
  const androidRelay = () => literal('app/src/main/assets/hook-relay-blocking.js', RELAY_RE);
  const desktopCcSeconds = () =>
    literal('desktop/scripts/install-hooks.js', /command: expectedBlockingCmd, timeout: (\d+)/);
  const androidCcSeconds = () => literal(
    'app/src/main/kotlin/com/youcoded/app/runtime/Bootstrap.kt',
    /PERMISSION_HOOK_TIMEOUT_SECONDS = ([\d_]+)/);

  it('relay backstop is 2h30m on both platforms', () => {
    expect(desktopRelay()).toBe(9000000);
    expect(androidRelay()).toBe(9000000);
  });

  it('CC hook entry is 3h on both platforms', () => {
    expect(desktopCcSeconds()).toBe(10800);
    expect(androidCcSeconds()).toBe(10800);
  });

  it('relay fires strictly BEFORE CC, with a real margin', () => {
    // CC winning is the bad outcome: hook killed with no decision →
    // AskUserQuestion waits forever on its default-"never" question timeout.
    expect(desktopRelay()).toBeLessThanOrEqual(desktopCcSeconds() * 1000 - 15 * 60 * 1000);
    expect(androidRelay()).toBeLessThanOrEqual(androidCcSeconds() * 1000 - 15 * 60 * 1000);
  });

  it('every value is under the 32-bit setTimeout ceiling', () => {
    for (const v of [desktopRelay(), androidRelay(), desktopCcSeconds() * 1000]) {
      expect(v).toBeLessThan(2147483647); // overflow fires IMMEDIATELY — the bug, disguised
    }
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (current values 300000/120000/300/300, and no `PERMISSION_HOOK_TIMEOUT_SECONDS`)

Run: `cd youcoded/desktop && npx vitest run tests/permission-timeout-margins.test.ts`

- [ ] **Step 3: Change the constants + rewrite the inverted comments**

`desktop/hook-scripts/relay-blocking.js:19-22` — replace the comment AND value:

```js
// Tier-2 backstop: 2h30m — deliberately 30m LONGER than the app's own 2h hold
// (hook-relay.ts APP_HOLD_MS: the app must answer first, it's the only party
// that can label the card accurately) and 30m SHORTER than the Claude Code
// hook timeout in settings.json (install-hooks.js, 10800s): if the app hangs,
// this relay must fire before CC does. Relay timeout = exit 2 = clean deny
// that unblocks the turn; a CC hook-kill delivers NO decision, and
// AskUserQuestion then waits forever on CC's default-"never" question
// timeout. Do NOT tidy these back to equal — that restores the silent
// 5-minute wedge this replaced (2026-07-30 spec §1).
const TIMEOUT_MS = parseInt(process.env.CLAUDE_RELAY_TIMEOUT || '9000000', 10);
```

`desktop/scripts/install-hooks.js:114,126`:

```js
  // Register PermissionRequest with blocking relay. Tier-3 backstop: 3h —
  // 30m ABOVE the relay's 2h30m so CC never wins (CC winning kills the hook
  // with no decision; see relay-blocking.js header). Margins are load-bearing.
```
```js
    hooks: [{ type: 'command', command: expectedBlockingCmd, timeout: 10800 }],
```

`app/src/main/assets/hook-relay-blocking.js` — same value + a condensed version of the same tier comment above line 16:

```js
// Tier-2 backstop: 2h30m — above EventBridge's 2h hold, below Bootstrap's 3h
// CC hook timeout. Relay-wins = exit 2 (clean deny); CC-wins = hook killed
// with no decision = AskUserQuestion wedges forever. Do NOT equalize (spec §1).
var TIMEOUT_MS = parseInt(process.env.CLAUDE_RELAY_TIMEOUT || '9000000', 10);
```

`Bootstrap.kt` — add to the companion object and use at the call site:

```kotlin
    /** Tier-3 CC hook timeout (3h) — 30m above the relay asset's 2h30m so CC
     *  never kills the hook first (no decision = AskUserQuestion wedges
     *  forever, spec §1). Pinned by desktop/tests/permission-timeout-margins. */
    const val PERMISSION_HOOK_TIMEOUT_SECONDS = 10800
```
```kotlin
        ensurePermissionRequestHook(hooksObj, blockingHookCommand, PERMISSION_HOOK_TIMEOUT_SECONDS)
```

- [ ] **Step 4: Fix the stale prose sites**

- `EventBridge.kt:146`: `* When hook-relay-blocking.js times out (120s) or Claude Code kills the hook` → `* When hook-relay-blocking.js times out (its 2h30m tier-2 backstop) or Claude Code kills the hook`
- `HookEvent.kt:60`: `hook-relay-blocking.js timed out (120s)` → `hook-relay-blocking.js timed out (2h30m backstop)`
- `desktop/docs/test-blocking-relay.js:144`: the case labeled "Timeout (server holds, relay fails open)" — change `expectedCode: 0` to `expectedCode: 2` and the label to `'Timeout (server holds, relay fails CLOSED — exit 2 deny)'`. It currently pins the pre-2026 fail-open contract that shipped code already contradicts.
- `desktop/docs/blocking-relay-handoff.md`: `:44` — replace "configurable timeout (default 30s …) … relay exits 0 (fail-open)" with "configurable timeout (default 2h30m, via `CLAUDE_RELAY_TIMEOUT` env var). If the server goes silent past it → relay exits 2 (fail-closed deny)". `:123` — replace "The protocol must fail-open (exit 0) on timeout or error" with "The protocol fails CLOSED (exit 2) on timeout, and OPEN (exit 0) on connection error — no listener means a terminal session, which gets CC's own prompt". Fix the deny-path sentence to match shipped code ("server writes a decision → relay wraps it in hookSpecificOutput and exits 0; exit 2 is the timeout path only"). `:50` — correct the path `scripts/test-blocking-relay.js` → `docs/test-blocking-relay.js`.

- [ ] **Step 5: Run the margins test — expect PASS.** Then `bash scripts/verify.sh <worktree>` from the workspace root, and `node desktop/docs/test-blocking-relay.js` if it is directly runnable (it sets its own env; the timeout case should now expect exit 2).

- [ ] **Step 6: Commit** — `feat(permissions): staggered 2h/2h30m/3h timeout tiers, both platforms + stale-site sweep`

---

### Task 3: `expired` field, `reason` on the action, reducer retention + quiet resolve

**Files:**
- Modify: `youcoded/desktop/src/shared/types.ts:281-302` (ToolCallState)
- Modify: `youcoded/desktop/src/renderer/state/chat-types.ts:459-463` (action union)
- Modify: `youcoded/desktop/src/renderer/state/chat-reducer.ts:1234-1253`
- Test: `youcoded/desktop/src/renderer/state/__tests__/chat-reducer.test.ts`

**Interfaces:**
- Produces: `ToolCallState.expired?: true`; `PERMISSION_EXPIRED` action gains `reason?: 'app-timeout' | 'unroutable' | 'delivery-failed' | 'hook-closed'`; new action `{ type: 'PERMISSION_CARD_RESOLVED'; sessionId: string; toolUseId: string }` (sets status `'complete'`, clears `expired`, no error text). Tasks 4, 5, 7, 9 consume all three.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing reducer tests** (append a describe block; follow the file's existing setup helpers for creating a session with an awaiting-approval tool — mirror the existing PERMISSION_REQUEST → PERMISSION_EXPIRED tests' arrange step):

```ts
describe('PERMISSION_EXPIRED reasons (2026-07-30 spec §2/§2a/§2c/§2d)', () => {
  // arrange helper: dispatch PERMISSION_REQUEST { sessionId: 's1', toolName: 'Bash',
  // input: {}, requestId: 'r1' } against a fresh state — reuse the file's pattern.

  it("'hook-closed' retains: awaiting-approval + expired, requestId cleared, no error", () => {
    const state = expire(withPendingAsk(), { reason: 'hook-closed' });
    const tool = state.get('s1')!.toolCalls.get('perm-r1')!;
    expect(tool.status).toBe('awaiting-approval'); // red dot + input gates keep holding
    expect(tool.expired).toBe(true);
    expect(tool.requestId).toBeUndefined();
    expect(tool.error).toBeUndefined();
  });

  it("'hook-closed' still counts as pending for both pty gates", () => {
    const state = expire(withPendingAsk(), { reason: 'hook-closed' });
    const session = state.get('s1')!;
    expect(hasPendingInteraction(session)).toBe(true);
    expect(canRetrySubmit(session)).toBe(false);
  });

  it("'app-timeout' resolves as failed with accurate copy, never retains", () => {
    const state = expire(withPendingAsk(), { reason: 'app-timeout' });
    const tool = state.get('s1')!.toolCalls.get('perm-r1')!;
    expect(tool.status).toBe('failed');
    expect(tool.expired).toBeUndefined();
    expect(tool.error).toContain('auto-denied');
  });

  it('absent reason resolves — the native-broker / old-shim default', () => {
    const state = expire(withPendingAsk(), {});
    expect(state.get('s1')!.toolCalls.get('perm-r1')!.status).toBe('failed');
  });

  it("'delivery-failed' resolves", () => {
    const state = expire(withPendingAsk(), { reason: 'delivery-failed' });
    expect(state.get('s1')!.toolCalls.get('perm-r1')!.status).toBe('failed');
  });

  it('PERMISSION_CARD_RESOLVED quietly completes an expired card only', () => {
    let state = expire(withPendingAsk(), { reason: 'hook-closed' });
    state = chatReducer(state, { type: 'PERMISSION_CARD_RESOLVED', sessionId: 's1', toolUseId: 'perm-r1' });
    const tool = state.get('s1')!.toolCalls.get('perm-r1')!;
    expect(tool.status).toBe('complete');
    expect(tool.error).toBeUndefined();
    expect(tool.expired).toBeUndefined();
    // a NON-expired awaiting card must be untouched (only the §2 resolver and
    // Dismiss use this action, and both only ever see expired cards)
    const fresh = withPendingAsk();
    const untouched = chatReducer(fresh, { type: 'PERMISSION_CARD_RESOLVED', sessionId: 's1', toolUseId: 'perm-r1' });
    expect(untouched.get('s1')!.toolCalls.get('perm-r1')!.status).toBe('awaiting-approval');
  });
});
```

(Import `hasPendingInteraction`/`canRetrySubmit` from `../pty-input-gate`. The synthetic tool id is `perm-<requestId>` per `chat-reducer.ts:1159`.)

- [ ] **Step 2: Run — expect FAIL** (`reason`/`PERMISSION_CARD_RESOLVED` don't exist).

Run: `cd youcoded/desktop && npx vitest run src/renderer/state/__tests__/chat-reducer.test.ts`

- [ ] **Step 3: Implement the types**

`shared/types.ts` — inside `ToolCallState` after `denyListed`:

```ts
  /** Permission ask whose hook socket died with the terminal menu possibly
   *  still live ('hook-closed' expiry). The card STAYS awaiting-approval so
   *  the red strip dot and pty-input gates keep holding (the 2026-07-30 bug
   *  was this card flipping 'failed' — session looked fine while CC stayed
   *  blocked). requestId is cleared: the socket is gone, respond() can never
   *  work. Resolved by usePromptDetector's menu-absence rule or Dismiss. */
  expired?: true;
```

`chat-types.ts` — extend `PERMISSION_EXPIRED` and add the new action:

```ts
  | {
      type: 'PERMISSION_EXPIRED';
      sessionId: string;
      requestId: string;
      /** Why the ask ended. ONLY 'hook-closed' (far end died, menu may still
       *  be live) retains the card. Absent = resolve: retention is the
       *  riskier behavior, and the native PermissionBroker + older remote
       *  shims never send a reason — defaulting to retain would wedge them
       *  (spec §2c/§2d). Optional so older serialized actions deserialize. */
      reason?: 'app-timeout' | 'unroutable' | 'delivery-failed' | 'hook-closed';
    }
  | {
      /** Quiet local resolve of an EXPIRED card: the user answered in the
       *  terminal (menu left the buffer) or clicked Dismiss. No error text —
       *  nothing failed. */
      type: 'PERMISSION_CARD_RESOLVED';
      sessionId: string;
      toolUseId: string;
    }
```

- [ ] **Step 4: Implement the reducer** — replace the `PERMISSION_EXPIRED` case body (`chat-reducer.ts:1234-1253`) and add the new case after it:

```ts
    case 'PERMISSION_EXPIRED': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      const toolCalls = new Map(session.toolCalls);
      for (const [id, tool] of toolCalls) {
        if (tool.status === 'awaiting-approval' && tool.requestId === action.requestId) {
          if (action.reason === 'hook-closed') {
            // Far end died (relay timeout/death, CC killed the hook) but the
            // Ink menu may STILL be on screen. Retain provisionally: keep
            // awaiting-approval so useSessionAttention stays red and the
            // pty-input gates keep blocking sends into the live menu.
            // usePromptDetector's menu-absence rule or the Dismiss button
            // resolves it (spec §2/§2a). The reducer never reads the buffer.
            toolCalls.set(id, { ...tool, requestId: undefined, expired: true });
          } else if (action.reason === 'app-timeout' || action.reason === 'unroutable') {
            // The app itself delivered a deny — accurate copy, no retention.
            toolCalls.set(id, {
              ...tool,
              status: 'failed',
              requestId: undefined,
              error: action.reason === 'unroutable'
                ? 'No open session could show this request — YouCoded auto-denied it'
                : 'No response in time — YouCoded auto-denied this request so Claude could continue',
            });
          } else {
            // 'delivery-failed' or absent (native PermissionBroker cancel,
            // renderer delivery-failure recovery, older remote shim). DEFAULT
            // IS RESOLVE, never retain: native sessions have no PTY (nothing
            // to rebind), and delivery-failure means the socket is provably
            // gone. Do not flip this default (spec §2c/§2d).
            toolCalls.set(id, {
              ...tool,
              status: 'failed',
              requestId: undefined,
              error: 'Permission request expired — socket closed before a response was sent',
            });
          }
          break;
        }
      }

      next.set(action.sessionId, { ...session, toolCalls });
      return next;
    }

    case 'PERMISSION_CARD_RESOLVED': {
      const session = next.get(action.sessionId);
      if (!session) return state;
      const tool = session.toolCalls.get(action.toolUseId);
      // Only expired cards resolve this way — a live ask must go through its
      // buttons (which deliver a real decision through the socket).
      if (!tool || !tool.expired) return state;
      const toolCalls = new Map(session.toolCalls);
      // 'complete' with no error: nothing failed — the ask was answered in
      // the terminal or dismissed. If the tool really runs, the transcript's
      // TOOL_RESULT overwrites this with the true outcome.
      const { expired: _resolved, ...rest } = tool;
      toolCalls.set(action.toolUseId, { ...rest, status: 'complete' });
      next.set(action.sessionId, { ...session, toolCalls });
      return next;
    }
```

- [ ] **Step 5: Run the reducer tests — expect PASS.** Then run `npx vitest run src/renderer` to catch fallout (AssistantTurnBubble filtering, serialization tests). `serializeChatState` copies `toolCalls` wholesale (`chat-types.ts:672`) — `expired` rides with no shim change; verify no snapshot breaks.

- [ ] **Step 6: Commit** — `feat(chat): PERMISSION_EXPIRED reasons — retain on hook-closed, quiet PERMISSION_CARD_RESOLVED`

---

### Task 4: `usePromptDetector` — expired-aware bail + the menu-absence standing rule

Without the bail fix, §2's discriminator, §3's rebind, and every unrelated prompt card go permanently silent the moment a card is retained (spec §2). The standing rule is the ONLY resolver of a retained card besides Dismiss.

**Files:**
- Create: `youcoded/desktop/src/renderer/state/expired-card-resolver.ts`
- Modify: `youcoded/desktop/src/renderer/hooks/usePromptDetector.ts:101-106,167-169` (+ new ref)
- Test: `youcoded/desktop/src/renderer/state/__tests__/expired-card-resolver.test.ts` (new)

**Interfaces:**
- Consumes: `ToolCallState.expired`, `PERMISSION_CARD_RESOLVED` (Task 3).
- Produces: `expiredToolIds(session): string[]` and `nextAbsentCount(menuPresent: boolean, prevCount: number): { count: number; resolve: boolean }` with `MENU_ABSENT_FLUSHES_TO_RESOLVE = 2`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { nextAbsentCount, MENU_ABSENT_FLUSHES_TO_RESOLVE } from '../expired-card-resolver';

describe('expired-card menu-absence rule (spec §2)', () => {
  it('menu present resets the counter — false retain self-heals later', () => {
    expect(nextAbsentCount(true, 1)).toEqual({ count: 0, resolve: false });
  });
  it('one absent flush is NOT enough — socket close races the buffer flush', () => {
    expect(nextAbsentCount(false, 0)).toEqual({ count: 1, resolve: false });
  });
  it('two consecutive absent flushes resolve', () => {
    expect(nextAbsentCount(false, 1)).toEqual({ count: 2, resolve: true });
    expect(MENU_ABSENT_FLUSHES_TO_RESOLVE).toBe(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module missing). `cd youcoded/desktop && npx vitest run src/renderer/state/__tests__/expired-card-resolver.test.ts`

- [ ] **Step 3: Implement the pure module**

```ts
import type { SessionChatState } from './chat-types';

/** §2 standing rule (2026-07-30 spec): a card retained by a 'hook-closed'
 *  expiry resolves only after the Ink menu has been ABSENT from the visible
 *  buffer for TWO consecutive flushes. One flush is a race in both
 *  directions: a terminal answer's socket-close often lands BEFORE the flush
 *  that removes the menu (would false-retain, self-heals here), and CC's own
 *  fallback menu renders a beat AFTER a hook kill (a one-shot parse would
 *  false-RESOLVE — clearing the red dot while the session is still blocked
 *  on a menu chat view never renders; that is the original reported bug). */
export const MENU_ABSENT_FLUSHES_TO_RESOLVE = 2;

export function expiredToolIds(session: SessionChatState): string[] {
  const ids: string[] = [];
  for (const [id, tool] of session.toolCalls) {
    if (tool.status === 'awaiting-approval' && tool.expired) ids.push(id);
  }
  return ids;
}

export function nextAbsentCount(
  menuPresent: boolean,
  prevCount: number,
): { count: number; resolve: boolean } {
  if (menuPresent) return { count: 0, resolve: false };
  const count = prevCount + 1;
  return { count, resolve: count >= MENU_ABSENT_FLUSHES_TO_RESOLVE };
}
```

- [ ] **Step 4: Wire it into `usePromptDetector`**

Add a ref next to the existing ones (`usePromptDetector.ts:63-68`):

```ts
  // §2 standing rule: per-session count of consecutive buffer flushes with no
  // Ink menu while an expired card is retained. At 2, resolve the card(s).
  const expiredAbsentRef = useRef<Map<string, number>>(new Map());
```

Replace the bail block at `:101-106` with (imports: `expiredToolIds`, `nextAbsentCount` from `../state/expired-card-resolver`):

```ts
      const sessionState = store.getState().get(sid);
      if (sessionState) {
        // §2 resolver runs BEFORE the awaiting-approval bail — and the bail
        // must ignore expired cards, or retention switches this whole
        // detector off for the session (taking the resolver, the §3 rebind,
        // and every setup PromptCard with it — spec §2b).
        const expired = expiredToolIds(sessionState);
        if (expired.length > 0) {
          const expiredScreen = getVisibleScreenText(sid);
          const menuPresent = !!(expiredScreen && parseInkSelect(expiredScreen));
          const prev = expiredAbsentRef.current.get(sid) ?? 0;
          const { count, resolve } = nextAbsentCount(menuPresent, prev);
          expiredAbsentRef.current.set(sid, count);
          if (resolve) {
            expiredAbsentRef.current.delete(sid);
            for (const toolUseId of expired) {
              const action = { type: 'PERMISSION_CARD_RESOLVED' as const, sessionId: sid, toolUseId };
              dispatch(action);
              (window as any).claude?.remote?.broadcastAction?.(action);
            }
          }
        } else {
          expiredAbsentRef.current.delete(sid);
        }
        for (const [, tool] of sessionState.toolCalls) {
          // Live asks silence the parser (the hook card owns the menu);
          // EXPIRED asks must not — their menu has no live socket behind it.
          if (tool.status === 'awaiting-approval' && !tool.expired) return;
        }
      }
```

And in the debounce re-check at `:167-169`, add the same `&& !tool.expired` to the condition.

- [ ] **Step 5: Run the resolver tests + full renderer suite — expect PASS.** `npx vitest run src/renderer`

- [ ] **Step 6: Commit** — `feat(chat): expired cards resolve when the terminal menu leaves the buffer`

---

### Task 5: `ToolCard` + `CompactToolStrip` — gate widening, Dismiss, `delivery-failed` tagging

An expired card currently renders header-only (gate requires `requestId`) with no way to act — and the delivery-failure recovery dispatches would PIN cards forever under Task 3 unless tagged (spec §2b/§2c).

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/ToolCard.tsx:785-830` (gate + expired branch), `:798-804` (`onFailedCb`)
- Modify: `youcoded/desktop/src/renderer/components/buddy/CompactToolStrip.tsx:170-206,252` 
- Test: `youcoded/desktop/src/renderer/state/__tests__/chat-reducer.test.ts` (delivery-failed already covered in Task 3; this task's tests are the component gates)

**Interfaces:**
- Consumes: `expired`, `reason: 'delivery-failed'`, `PERMISSION_CARD_RESOLVED` (Task 3).
- Produces: the expired-card UI branch that Task 9 upgrades with rebind buttons. Copy string produced here: `"The buttons on this card timed out, but Claude may still be waiting in the terminal."`

- [ ] **Step 1: Tag the three delivery-failure dispatch sites**

`ToolCard.tsx` `onFailedCb` (`:798-804`) — add the reason:

```ts
        const onFailedCb = () => {
          if (sessionId && tool.requestId) {
            // 'delivery-failed': the respond() write returned false or threw —
            // the socket is provably gone, so this must RESOLVE the card, never
            // retain it (retention would pin a card whose buttons cannot work).
            const action = {
              type: 'PERMISSION_EXPIRED' as const, sessionId,
              requestId: tool.requestId, reason: 'delivery-failed' as const,
            };
            dispatch(action);
            (window as any).claude?.remote?.broadcastAction(action);
          }
        };
```

`CompactToolStrip.tsx` — same `reason: 'delivery-failed' as const` added to BOTH action objects (`delivered === false` at ~`:174-179` and the catch at ~`:195-200`).

- [ ] **Step 2: Widen the ToolCard gate and add the expired branch**

Replace the opening of the approval IIFE (`ToolCard.tsx:785`):

```tsx
      {tool.status === 'awaiting-approval' && (tool.requestId || tool.expired) && (() => {
```

At the top of the IIFE body, before the `isAskUser` branch, add:

```tsx
        // Expired: the hook socket is dead (requestId cleared) but CC's Ink
        // menu may still be live in the terminal. Task 9 adds digit-rebind
        // buttons here; Dismiss is the universal out (only out for
        // AskUserQuestion, which never rebinds — spec §3/§1b).
        if (tool.expired || !tool.requestId) {
          const resolveLocally = () => {
            if (!sessionId) return;
            const action = { type: 'PERMISSION_CARD_RESOLVED' as const, sessionId, toolUseId: tool.toolUseId };
            dispatch(action);
            (window as any).claude?.remote?.broadcastAction(action);
          };
          return (
            <div className="px-3 pb-3 pt-1 text-xs text-fg-dim">
              <p className="mb-2">
                The buttons on this card timed out, but Claude may still be
                waiting in the terminal. Answer it there — or dismiss this if
                you already did.
              </p>
              <button
                onClick={resolveLocally}
                className="rounded border border-edge px-2 py-1 text-fg-2 hover:bg-inset"
              >
                Dismiss — I answered in the terminal
              </button>
            </div>
          );
        }
```

(Match the file's existing button/typography idiom if it differs from the classes above — the structure and handler are the contract, and prefer the `components/ui` primitives if a plain `Button` fits.)

- [ ] **Step 3: Same widening in CompactToolStrip** (`:252`):

```tsx
      {tool.status === 'awaiting-approval' && (tool.requestId || tool.expired) ? (
        tool.expired || !tool.requestId ? (
          <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button
              onClick={() => {
                // Same quiet local resolve as ToolCard's Dismiss — the socket
                // is dead, there is nothing to respond to.
                const action = { type: 'PERMISSION_CARD_RESOLVED' as const, sessionId, toolUseId: tool.toolUseId };
                dispatch(action);
                (window as any).claude?.remote?.broadcastAction(action);
              }}
              style={denyStyle}
            >
              Dismiss
            </button>
          </span>
        ) : (
          /* existing Allow / Deny / Always button row, unchanged */
        )
      ) : ...}
```

(Keep the existing button row exactly as-is inside the else branch; `denyStyle` is the file's existing style object for the deny button — reuse it.)

- [ ] **Step 4: Type-check + run the renderer suite.** `cd youcoded/desktop && npx tsc --noEmit && npx vitest run src/renderer`. Expected: PASS — the Task 3 reducer tests already pin the delivery-failed behavior these dispatches now trigger.

- [ ] **Step 5: Commit** — `feat(chat): expired approval cards render Dismiss; delivery failures tagged delivery-failed`

---

### Task 6: Workbench fixture — expired-card scenario

The workbench fake backend is the fifth `PERMISSION_REQUEST` consumer (spec §2b) and where Destin reviews the new card states visually before any backend exists.

**Files:**
- Modify: `youcoded/desktop/src/renderer/dev/workbench/fixture-loader.ts` (dispatches `PERMISSION_REQUEST` at `:143`)

- [ ] **Step 1: Add the fixture.** Next to the existing permission-request fixture dispatch, add an expired variant following the file's existing scenario idiom — the action sequence is the contract:

```ts
// Expired ask (2026-07-30 spec §2a): hook socket died, menu possibly still
// live — card must stay awaiting-approval with the Dismiss affordance.
dispatch({ type: 'PERMISSION_REQUEST', sessionId, toolName: 'Bash',
  input: { command: 'rm -rf node_modules && npm ci' }, requestId: 'wb-expired-1' });
dispatch({ type: 'PERMISSION_EXPIRED', sessionId, requestId: 'wb-expired-1', reason: 'hook-closed' });
```

- [ ] **Step 2: Boot-check.** Run: `cd youcoded/desktop && node scripts/workbench-boot-check.mjs` — MUST pass (the unit suite has stayed green through three boot crashes; this is the rule for any workbench change).

- [ ] **Step 3: Commit** — `feat(workbench): expired permission-card fixture`

---

### Task 7: `HookRelay` tier-1 hold + routability cap + explicit reason emits

The app becomes the party that ends the wait. `respond()`/`closeSocket()` delete the pending entry synchronously, so the `'close'` handler NEVER fires for app-initiated endings — tier-1 must emit explicitly (spec §2, verified: an app close emits nothing today).

**Files:**
- Modify: `youcoded/desktop/src/main/hook-relay.ts`
- Modify: `youcoded/desktop/src/main/main.ts:176-181` (gate wiring), `:928-946` (reason forwarding)
- Modify: `youcoded/desktop/src/main/session-manager.ts` (add `hasSession`)
- Modify: `youcoded/desktop/src/renderer/state/hook-dispatcher.ts:35-39`
- Modify: `youcoded/desktop/tests/permission-timeout-margins.test.ts` (extend with app-hold assertions)
- Test: `youcoded/desktop/tests/hook-relay.test.ts`

**Interfaces:**
- Produces: `APP_HOLD_MS = 7200000`, `UNROUTABLE_HOLD_MS = 60000` (exported); `HookRelay` constructor gains optional `holdMs`/`unroutableHoldMs` (test injection); `setSessionGate(gate: (sessionId: string) => boolean)`; the `'permission-expired'` event gains a third arg `reason?: string`; `SessionManager.hasSession(sessionId: string): boolean`.
- Consumes: `reason` union on the action (Task 3).

- [ ] **Step 1: Write the failing relay tests** (extend `tests/hook-relay.test.ts`, following the existing connect/write pattern at `:86-112`):

```ts
  describe('tier-1 hold (2026-07-30 spec §1)', () => {
    it('auto-denies with nested decision shape + app-timeout reason when the hold fires', async () => {
      const short = new HookRelay((relay as any).pipeName + '-hold', 60 /* holdMs */);
      await short.start();
      const expired = new Promise<[string, string, string?]>((resolve) => {
        short.once('permission-expired', (sid, rid, reason) => resolve([sid, rid, reason]));
      });
      const net = await import('net');
      const client = net.createConnection((short as any).pipeName);
      await new Promise<void>((res, rej) => { client.on('connect', res); client.on('error', rej); });
      const received = new Promise<string>((resolve) => {
        let buf = '';
        client.on('data', (c) => { buf += c; if (buf.includes('\n')) resolve(buf); });
      });
      client.write(JSON.stringify({ hook_event_name: 'PermissionRequest', _desktop_session_id: 'sess-h' }) + '\n');

      const [sid, , reason] = await expired;
      expect(sid).toBe('sess-h');
      expect(reason).toBe('app-timeout');
      // Assert against the RELAY'S OWN parse path: relay-blocking.js reads
      // appDecision.decision — a flat shape would make this undefined.
      const decision = JSON.parse((await received).trim());
      expect(decision.decision.behavior).toBe('deny');
      expect(decision.decision.message).toContain('auto-denied');
      short.stop();
      client.destroy();
    });

    it('caps the hold at 60s-tier when the session gate says unroutable', async () => {
      const short = new HookRelay((relay as any).pipeName + '-unroutable', 60_000, 40 /* unroutableHoldMs */);
      short.setSessionGate(() => false);
      await short.start();
      const expired = new Promise<string | undefined>((resolve) => {
        short.once('permission-expired', (_s, _r, reason) => resolve(reason));
      });
      const net = await import('net');
      const client = net.createConnection((short as any).pipeName);
      await new Promise<void>((res, rej) => { client.on('connect', res); client.on('error', rej); });
      client.write(JSON.stringify({ hook_event_name: 'PermissionRequest', _desktop_session_id: 'ghost' }) + '\n');
      expect(await expired).toBe('unroutable');
      short.stop();
      client.destroy();
    });

    it("far-end death emits 'hook-closed'; respond() cancels the hold and emits nothing", async () => {
      const short = new HookRelay((relay as any).pipeName + '-closed', 100);
      await short.start();
      const reasons: (string | undefined)[] = [];
      short.on('permission-expired', (_s, _r, reason) => reasons.push(reason));

      const net = await import('net');
      const c1 = net.createConnection((short as any).pipeName);
      await new Promise<void>((res, rej) => { c1.on('connect', res); c1.on('error', rej); });
      const evt = new Promise<any>((resolve) => short.once('hook-event', resolve));
      c1.write(JSON.stringify({ hook_event_name: 'PermissionRequest', _desktop_session_id: 'sess-c' }) + '\n');
      const e1 = await evt;
      c1.destroy(); // far end dies
      await new Promise((r) => setTimeout(r, 30));
      expect(reasons).toEqual(['hook-closed']);

      const c2 = net.createConnection((short as any).pipeName);
      await new Promise<void>((res, rej) => { c2.on('connect', res); c2.on('error', rej); });
      const evt2 = new Promise<any>((resolve) => short.once('hook-event', resolve));
      c2.write(JSON.stringify({ hook_event_name: 'PermissionRequest', _desktop_session_id: 'sess-d' }) + '\n');
      const e2 = await evt2;
      short.respond(e2.payload._requestId, { decision: { behavior: 'deny' } });
      await new Promise((r) => setTimeout(r, 150)); // past holdMs — timer must be dead
      expect(reasons).toEqual(['hook-closed']); // respond() itself emits nothing (caller's job)
      short.stop();
      c2.destroy();
    });
  });
```

- [ ] **Step 2: Run — expect FAIL** (constructor signature, gate, reason arg all missing). `cd youcoded/desktop && npx vitest run tests/hook-relay.test.ts`

- [ ] **Step 3: Implement `hook-relay.ts`**

Top of file, after imports:

```ts
// §1 tier-1 hold (2026-07-30 spec): the APP owns the permission-ask clock —
// 2h here < 2h30m relay backstop (relay-blocking.js) < 3h CC hook entry
// (install-hooks.js). Margins are load-bearing: if CC ever wins it kills the
// hook with NO decision and AskUserQuestion waits forever on CC's
// default-"never" question timeout. Do not equalize. NOTE: setTimeout does
// not advance during system suspend, so the hold can stretch past 2h of
// wall-clock on a laptop that slept — expected, not a bug.
export const APP_HOLD_MS = 7200000;
// §1a dead-man cap: an ask whose sessionId matches no live session will never
// render a card anywhere — a 2h hold would be a 2h invisible hang.
export const UNROUTABLE_HOLD_MS = 60000;
```

Class changes:

```ts
  private holdTimers = new Map<string, NodeJS.Timeout>();
  private sessionGate: ((sessionId: string) => boolean) | null = null;
  private readonly holdMs: number;
  private readonly unroutableHoldMs: number;

  constructor(pipeName?: string, holdMs: number = APP_HOLD_MS, unroutableHoldMs: number = UNROUTABLE_HOLD_MS) {
    super();
    this.pipeName = pipeName || DEFAULT_PIPE_NAME;
    this.holdMs = holdMs;
    this.unroutableHoldMs = unroutableHoldMs;
  }

  /** main.ts wires this to SessionManager (mirrors setReloadPluginsGate). */
  setSessionGate(gate: (sessionId: string) => boolean): void {
    this.sessionGate = gate;
  }

  private clearHold(requestId: string): void {
    const t = this.holdTimers.get(requestId);
    if (t) { clearTimeout(t); this.holdTimers.delete(requestId); }
  }
```

In the `PermissionRequest` branch of `processPayload`, after `this.emit('hook-event', event);`:

```ts
            // §1 tier-1: the app ends the wait, with a labeled deny. §1a: an
            // unroutable ask (no live session at arrival) gets the short
            // dead-man cap instead — restores what the old 300s timeout was
            // silently doing for that case.
            const routable = this.sessionGate ? this.sessionGate(event.sessionId) : true;
            const holdMs = routable ? this.holdMs : this.unroutableHoldMs;
            this.holdTimers.set(requestId, setTimeout(() => {
              this.holdTimers.delete(requestId);
              // Nested { decision: { … } } is load-bearing: relay-blocking.js
              // reads appDecision.decision — a flat shape ships undefined.
              // The message lands VERBATIM in the denied tool result the model
              // reads (verified in the CC 2.1.220 binary), so say what
              // happened and invite a re-ask.
              this.respond(requestId, {
                decision: {
                  behavior: 'deny',
                  message: routable
                    ? `YouCoded auto-denied this request after ${Math.round(this.holdMs / 3600000)} hour(s) with no user response — ask again if still needed.`
                    : 'YouCoded could not route this request to any open session — auto-denied. Ask again if still needed.',
                },
              });
              // respond() deletes the pending entry BEFORE 'close' fires, so
              // the close handler's wasOpen guard swallows any emit —
              // app-initiated endings must emit explicitly (spec §2).
              this.emit('permission-expired', event.sessionId, requestId,
                routable ? 'app-timeout' : 'unroutable');
            }, holdMs));
```

Update the `'close'` handler:

```ts
            socket.on('close', () => {
              this.clearHold(requestId);
              const wasOpen = this.pendingSockets.delete(requestId);
              if (wasOpen) {
                // Reachable ONLY when the far end went away first (relay
                // timeout/death, CC killing the hook): app-initiated paths
                // delete the entry before 'close' fires and emit their own
                // reason. That asymmetry IS the §2 discrimination.
                this.emit('permission-expired', event.sessionId, requestId, 'hook-closed');
              }
            });
```

Add `this.clearHold(requestId);` as the first line of both `respond()` and `closeSocket()`, and in `stop()` clear all: `for (const t of this.holdTimers.values()) clearTimeout(t); this.holdTimers.clear();`

- [ ] **Step 4: Wire main.ts, session-manager, hook-dispatcher**

`session-manager.ts` — next to the existing session-lookup internals (the same map `setReloadPluginsGate`'s broadcast walks):

```ts
  /** §1a routability gate — true when this sessionId belongs to a live session. */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
```

(If the internal map is named differently, use it — the contract is "same collection the class itself uses to find a session by id".)

`main.ts` — directly after the existing `setReloadPluginsGate` wiring (`:178-181`):

```ts
  // §1a: unroutable asks get the 60s dead-man cap instead of the 2h hold.
  hookRelay.setSessionGate((sessionId) => sessionManager.hasSession(sessionId));
```

`main.ts` `'permission-expired'` handler (`:928`) — accept and forward the reason:

```ts
  hookRelay.on('permission-expired', (sessionId: string, requestId: string, reason?: string) => {
    const evt = {
      type: 'PermissionExpired',
      sessionId,
      // _reason rides INSIDE the payload — no IPC channel shape change, so
      // ipc-channels.test.ts needs nothing and old remote shims just ignore it.
      payload: { _requestId: requestId, _reason: reason },
      timestamp: Date.now(),
    };
```

`hook-dispatcher.ts:35-39`:

```ts
    case 'PermissionExpired': {
      const requestId = payload._requestId as string;
      if (!requestId) return null;
      const reason = payload._reason as
        | 'app-timeout' | 'unroutable' | 'delivery-failed' | 'hook-closed' | undefined;
      return { type: 'PERMISSION_EXPIRED', sessionId, requestId, reason };
    }
```

- [ ] **Step 5: Extend the margins test** (Task 2 file) with the app-hold tier:

```ts
  const appHold = () => literal('desktop/src/main/hook-relay.ts', /APP_HOLD_MS = ([\d_]+)/);
  it('app hold is 2h and strictly under the relay backstop', () => {
    expect(appHold()).toBe(7200000);
    expect(appHold()).toBeLessThanOrEqual(desktopRelay() - 15 * 60 * 1000);
  });
```

- [ ] **Step 6: Run — expect PASS**: `npx vitest run tests/hook-relay.test.ts tests/permission-timeout-margins.test.ts`, then `bash scripts/verify.sh <worktree>` and `npx vitest run tests/ipc-channels.test.ts` (expected: unchanged-pass — the reason rides inside the payload).

- [ ] **Step 7: Commit** — `feat(main): app-owned 2h permission hold, 60s unroutable cap, reasoned expiry emits`

---

### Task 8: Android — `EventBridge` hold timer + `reason` through the serializer

No routability gate on Android: `EventBridge` is per-session (one per `PtyBridge`; its own `:216-217` comment), so an ask on a session's socket is routable by construction (spec §1a).

**Files:**
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/parser/EventBridge.kt`
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/parser/HookEvent.kt:63-67`
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/bridge/HookSerializer.kt:33-38`
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/ManagedSession.kt:255-264`
- Modify: `youcoded/desktop/tests/permission-timeout-margins.test.ts` (Android app-hold assertion)
- Test: `youcoded/app/src/test/kotlin/com/youcoded/app/bridge/HookSerializerTest.kt`

**Interfaces:**
- Consumes: `_reason` payload convention (Task 7), `PERMISSION_HOLD_MS` naming from the margins test.
- Produces: `HookEvent.PermissionExpired.reason: String? = null`; `HookSerializer.permissionExpired(sessionId, requestId, reason: String? = null)`.

- [ ] **Step 1: Write the failing serializer test** (extend `HookSerializerTest.kt`, mirroring its existing permissionExpired test at ~`:112`):

```kotlin
    @Test
    fun `permissionExpired carries _reason when present and omits it when null`() {
        val with = HookSerializer.permissionExpired("s1", "r1", "hook-closed")
        val inner = with.getJSONObject("payload").getJSONObject("payload")
        assertEquals("hook-closed", inner.getString("_reason"))

        val without = HookSerializer.permissionExpired("s1", "r1", null)
        val innerNone = without.getJSONObject("payload").getJSONObject("payload")
        assertFalse(innerNone.has("_reason"))
    }
```

- [ ] **Step 2: Run — expect FAIL.** `./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.bridge.HookSerializerTest"`

- [ ] **Step 3: Implement**

`HookEvent.kt` — add the field (and update the KDoc's stale framing):

```kotlin
    /** Emitted when a held PermissionRequest ends without a delivered user
     *  decision. reason discriminates (2026-07-30 spec §2): "app-timeout"
     *  (our own 2h hold fired — a deny WAS delivered), "delivery-failed"
     *  (respond() write threw), "hook-closed" (relay died / CC killed the
     *  hook — the terminal menu may still be live; React retains the card),
     *  or null (legacy producers; React resolves). */
    data class PermissionExpired(
        override val sessionId: String,
        override val hookEventName: String,
        val requestId: String,
        val reason: String? = null,
    ) : HookEvent()
```

`EventBridge.kt` — companion + hold jobs:

```kotlin
    companion object {
        /** §1 tier-1 hold (2h). Must stay UNDER the relay asset's 2h30m and
         *  Bootstrap's 3h CC hook timeout — margins are load-bearing (the
         *  losing order kills the hook with no decision and AskUserQuestion
         *  wedges forever). Pinned by desktop/tests/permission-timeout-margins. */
        const val PERMISSION_HOLD_MS = 7_200_000L
    }

    /** Tier-1 hold timers, keyed by requestId. */
    private val holdJobs = ConcurrentHashMap<String, Job>()
```

In `handleClient`'s PermissionRequest branch, after `monitorSocketClosure(requestId, sessionId, client)`:

```kotlin
                    // §1 tier-1: the app ends the wait with a labeled deny.
                    // Must emit explicitly — respond() removes the pending
                    // entry BEFORE closing, so the closure monitor stays
                    // silent for app-initiated endings (its own comment).
                    monitorScope?.launch(Dispatchers.IO) {
                        delay(PERMISSION_HOLD_MS)
                        holdJobs.remove(requestId)
                        if (pendingSockets.containsKey(requestId)) {
                            // Nested decision shape is load-bearing: the relay
                            // reads appDecision.decision. Message lands in the
                            // tool result the model reads.
                            val deny = JSONObject().put("decision", JSONObject()
                                .put("behavior", "deny")
                                .put("message", "YouCoded auto-denied this request after 2 hours with no user response — ask again if still needed."))
                            respond(requestId, deny)
                            _events.tryEmit(HookEvent.PermissionExpired(
                                sessionId = sessionId,
                                hookEventName = "PermissionExpired",
                                requestId = requestId,
                                reason = "app-timeout",
                            ))
                        }
                    }?.also { holdJobs[requestId] = it }
```

`respond()` — first line: `holdJobs.remove(requestId)?.cancel()`; and tag the write-failure emit: `reason = "delivery-failed",`. `closeSocket()` — same cancel line. `monitorSocketClosure`'s emit — add `reason = "hook-closed",` and `holdJobs.remove(requestId)?.cancel()` before the emit. `stop()` — `holdJobs.values.forEach { it.cancel() }; holdJobs.clear()`.

`HookSerializer.kt`:

```kotlin
    fun permissionExpired(sessionId: String, requestId: String, reason: String? = null): JSONObject {
        val inner = JSONObject().apply {
            put("_requestId", requestId)
            // _reason rides inside the payload — same convention as desktop
            // main.ts, so the shared hook-dispatcher parses both transports.
            if (reason != null) put("_reason", reason)
        }
        return envelope("PermissionExpired", sessionId, inner)
    }
```

`ManagedSession.kt:260-263`:

```kotlin
                            server.broadcast(HookSerializer.permissionExpired(
                                sessionId = id,
                                requestId = event.requestId,
                                reason = event.reason,
                            ))
```

(Note the write-failure emit carries `sessionId = ""` — routing here keys on `requestId` and ManagedSession's own `id`, never the event's session field, per spec §6.)

- [ ] **Step 4: Extend the margins test** with `const androidHold = () => literal('app/src/main/kotlin/com/youcoded/app/parser/EventBridge.kt', /PERMISSION_HOLD_MS = ([\d_]+)L/);` asserting `7200000` and `androidHold() <= androidRelay() - 15 * 60 * 1000`.

- [ ] **Step 5: Run — expect PASS**: `./gradlew :app:testDebugUnitTest` and `cd ../desktop && npx vitest run tests/permission-timeout-margins.test.ts`.

- [ ] **Step 6: Commit** — `feat(android): EventBridge 2h permission hold + reasoned PermissionExpired`

---

### Task 9: Digit rebind — expired cards drive the still-live menu

Ship LAST (smallest value, highest risk — spec §Implementation order). Eligibility is implicit: only `'hook-closed'` retains, so any card still awaiting+expired is rebind-eligible. Rendering the PARSED menu's own labels eliminates the label-matching misfire class outright.

**Files:**
- Modify: `youcoded/desktop/src/renderer/parser/ink-select-parser.ts` (new `rebindButtons`)
- Modify: `youcoded/desktop/src/renderer/components/ToolCard.tsx` (upgrade the Task 5 expired branch)
- Test: `youcoded/desktop/src/renderer/parser/__tests__/` — colocate with existing parser tests (find them with `rg -l "menuToButtons" --glob '*test*'`; if none exist, create `ink-select-rebind.test.ts` beside the parser)

**Interfaces:**
- Consumes: `menuToButtons`, `ParsedMenu`, `PromptButton` (all in `ink-select-parser.ts`); the Task 5 expired branch; `PERMISSION_CARD_RESOLVED`.
- Produces: `rebindButtons(menu: ParsedMenu | null, toolName: string): PromptButton[] | null`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { rebindButtons } from '../ink-select-parser';
import type { ParsedMenu } from '../ink-select-parser';

const digitMenu: ParsedMenu = {
  id: 'm1', title: 'Bash command', options: ['Yes', 'Yes, and don\'t ask again', 'No'],
  optionNumbers: [1, 2, 3], selectedIndex: 0,
} as ParsedMenu;

describe('rebindButtons (spec §3 gates)', () => {
  it('returns digit-writing buttons for a fully-numbered single-select menu', () => {
    const btns = rebindButtons(digitMenu, 'Bash')!;
    expect(btns.map((b) => b.input)).toEqual(['1', '2', '3']);
    expect(btns.every((b) => b.submitInput === undefined)).toBe(true);
  });
  it('rejects a menu with ANY arrow-fallback option — never mix write shapes', () => {
    const partial = { ...digitMenu, optionNumbers: [1, null, 3] } as unknown as ParsedMenu;
    expect(rebindButtons(partial, 'Bash')).toBeNull();
  });
  it('never rebinds AskUserQuestion — sequential multi-question TUI', () => {
    expect(rebindButtons(digitMenu, 'AskUserQuestion')).toBeNull();
  });
  it('null menu → null', () => {
    expect(rebindButtons(null, 'Bash')).toBeNull();
  });
});
```

(Adapt the `ParsedMenu` literal to the real interface fields — check the type at the top of `ink-select-parser.ts`; extra required fields get sensible dummies.)

- [ ] **Step 2: Run — expect FAIL.** `cd youcoded/desktop && npx vitest run src/renderer/parser`

- [ ] **Step 3: Implement `rebindButtons`** (append to `ink-select-parser.ts`):

```ts
/** §3 rebind gate (2026-07-30 spec): expired-card buttons may drive the
 *  still-live menu ONLY when every option carries a bare digit. A digit
 *  selects-and-submits in one byte with no cursor dependency (header above).
 *  Any arrow-fallback option disqualifies the whole menu — its DOWN math
 *  depends on selectedIndex freshness, and a mixed row invites the stray-
 *  write class the 2026-07-09 fix exists to prevent. AskUserQuestion NEVER
 *  rebinds: CC's TUI for it is sequential (Q1 then Q2), multi-select, with a
 *  Skip and free-text box our card doesn't model — replaying that blind has
 *  a wrong-answer failure mode. Its outs are Dismiss + terminal view. */
export function rebindButtons(menu: ParsedMenu | null, toolName: string): PromptButton[] | null {
  if (!menu) return null;
  if (toolName === 'AskUserQuestion') return null;
  const buttons = menuToButtons(menu);
  if (buttons.some((b) => b.submitInput !== undefined)) return null;
  return buttons;
}
```

- [ ] **Step 4: Upgrade the ToolCard expired branch** (from Task 5). Replace its body with:

```tsx
        if (tool.expired || !tool.requestId) {
          return (
            <ExpiredApprovalActions
              sessionId={sessionId}
              tool={tool}
              dispatch={dispatch}
            />
          );
        }
```

And add the component in the same file (imports: `getVisibleScreenText` from the terminal registry module `usePromptDetector` uses, `parseInkSelect`, `rebindButtons` from `../parser/ink-select-parser`):

```tsx
/** Expired-card actions (2026-07-30 spec §3). Re-parses the live buffer every
 *  2s: if CC's menu is still up AND every option has a digit, render the
 *  MENU'S OWN options as buttons that type the digit straight into the PTY
 *  (deliberate menu-driving write — bypasses pty-input-gate by design, like
 *  PlanApprovalButtons; digits only, never arrows+\r in one write). Card
 *  resolution comes from usePromptDetector's menu-absence rule, NOT the
 *  click — if the digit didn't land, the menu stays and the buttons re-arm. */
function ExpiredApprovalActions({ sessionId, tool, dispatch }: {
  sessionId?: string;
  tool: ToolCallState;
  dispatch: (action: ChatAction) => void;
}) {
  const [buttons, setButtons] = useState<PromptButton[] | null>(null);
  const [clicked, setClicked] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    const parse = () => {
      const screen = getVisibleScreenText(sessionId);
      setButtons(rebindButtons(screen ? parseInkSelect(screen) : null, tool.toolName));
    };
    parse();
    const t = setInterval(parse, 2000); // cheap: only mounts on expired cards
    return () => clearInterval(t);
  }, [sessionId, tool.toolName]);

  const resolveLocally = () => {
    if (!sessionId) return;
    const action = { type: 'PERMISSION_CARD_RESOLVED' as const, sessionId, toolUseId: tool.toolUseId };
    dispatch(action);
    (window as any).claude?.remote?.broadcastAction(action);
  };

  const writeDigit = (b: PromptButton) => {
    if (!sessionId || clicked) return;
    setClicked(true);
    window.claude.session.sendInput(sessionId, b.input); // bare digit — passthrough path
    // Re-arm in case the write didn't land (menu would still be up; the
    // menu-absence rule resolves the card on success, so re-arming is safe).
    setTimeout(() => setClicked(false), 2000);
  };

  return (
    <div className="px-3 pb-3 pt-1 text-xs text-fg-dim">
      <p className="mb-2">
        The buttons on this card timed out, but Claude may still be waiting in
        the terminal.{buttons ? ' These options come straight from the terminal menu:' : ' Answer it there — or dismiss this if you already did.'}
      </p>
      {buttons && (
        <div className="mb-2 flex flex-wrap gap-2">
          {buttons.map((b) => (
            <button key={b.label} disabled={clicked} onClick={() => writeDigit(b)}
              className="rounded border border-edge px-2 py-1 text-fg-2 hover:bg-inset disabled:opacity-50">
              {b.label}
            </button>
          ))}
        </div>
      )}
      <button onClick={resolveLocally}
        className="rounded border border-edge px-2 py-1 text-fg-2 hover:bg-inset">
        Dismiss — I answered in the terminal
      </button>
    </div>
  );
}
```

(Type imports: `ToolCallState` from `../../shared/types`, `ChatAction` from `../state/chat-types`, `PromptButton` from `../parser/ink-select-parser`. Match the file's existing button idiom / `components/ui` primitives.)

- [ ] **Step 5: Run parser tests + `tsc` + renderer suite — expect PASS.** Then boot-check the workbench again (the Task 6 fixture now renders this component): `node scripts/workbench-boot-check.mjs`. Note: in the workbench there is no terminal buffer, so `rebindButtons` gets `null` and the branch renders copy+Dismiss — that's the correct degraded state.

- [ ] **Step 6: Commit** — `feat(chat): digit rebind for expired permission cards (digit-gated, menu-labeled)`

---

### Task 10: Name the blocker in the send-refusal copy (§4)

The gate now refuses for up to 2h, and the "Send anyway" force path writes into the live menu — the refusal must say what's actually blocking (the card) instead of a generic line.

**Files:**
- Modify: `youcoded/desktop/src/renderer/state/pty-input-gate.ts` (new `pendingInteractionKind`)
- Modify: `youcoded/desktop/src/renderer/App.tsx:526-533` (`notifyIfPtyBlocked`)
- Modify: `youcoded/desktop/src/renderer/components/InputBar.tsx:352` (toast fallback)
- Test: extend the gate's existing coverage in `chat-reducer.test.ts`'s gate describe (or wherever `hasPendingInteraction` is tested — `rg -l "hasPendingInteraction" --glob '*test*'`)

**Interfaces:**
- Produces: `pendingInteractionKind(session: SessionChatState): 'approval' | 'prompt' | null`.

- [ ] **Step 1: Write the failing test**

```ts
  it('pendingInteractionKind distinguishes approval cards from scraped prompts', () => {
    const withCard = withPendingAsk();               // Task 3 helper — awaiting-approval tool
    expect(pendingInteractionKind(withCard.get('s1')!)).toBe('approval');
    const expired = expire(withCard, { reason: 'hook-closed' });
    expect(pendingInteractionKind(expired.get('s1')!)).toBe('approval'); // expired still blocks
    expect(pendingInteractionKind(emptySession())).toBeNull();
  });
```

- [ ] **Step 2: Run — expect FAIL**, then implement in `pty-input-gate.ts`:

```ts
/** Which kind of interaction is blocking sends — drives the refusal copy so
 *  a 2h hold never reads as a generic mystery block (2026-07-30 spec §4).
 *  Same scan order as hasPendingInteraction. */
export function pendingInteractionKind(session: SessionChatState): 'approval' | 'prompt' | null {
  for (const id of session.activeTurnToolIds) {
    if (session.toolCalls.get(id)?.status === 'awaiting-approval') return 'approval';
  }
  for (const entry of session.timeline) {
    if (entry.kind === 'prompt'
        && entry.prompt.promptId !== HISTORY_EXPAND_PROMPT_ID
        && !entry.prompt.completed) {
      return 'prompt';
    }
  }
  return null;
}
```

- [ ] **Step 3: Use it in both refusal sites**

`App.tsx` `notifyIfPtyBlocked`:

```ts
  const notifyIfPtyBlocked = useCallback((sid: string): boolean => {
    const session = chatStateMapRef.current.get(sid);
    if (session && hasPendingInteraction(session)) {
      // Name the blocker — under the 2h hold a generic line reads as a
      // mystery lock (2026-07-30 spec §4). The card carries its own outs
      // (answer / Dismiss), so point at it.
      setToast(pendingInteractionKind(session) === 'approval'
        ? 'Claude asked a question — answer or dismiss the card in the chat before sending.'
        : 'Claude is waiting for your response — answer the prompt first.');
      return true;
    }
    return false;
  }, []);
```

`InputBar.tsx:352` — the `onToast` fallback gets the same two-branch copy (the session state is already in scope as `session`).

- [ ] **Step 4: Run the tests + `bash scripts/verify.sh <worktree>` — expect PASS.**

- [ ] **Step 5: Commit** — `feat(chat): send-refusal copy names the blocking approval card`

---

### Task 11: Full verification + handoff

- [ ] **Step 1: Full desktop pass:** `bash scripts/verify.sh <worktree> --full` from the workspace root (tsc + full vitest + knip + ast-grep scan, desktop only — it says so on exit).
- [ ] **Step 2: Full Android pass:** from `youcoded/`: `./scripts/build-web-ui.sh && ./gradlew assembleDebug && ./gradlew test`.
- [ ] **Step 3: Workbench:** `node desktop/scripts/workbench-boot-check.mjs` one final time.
- [ ] **Step 4: Manual sanity checks that need a dev instance — FLAG FOR DESTIN, do not script** (workspace rule on interactive verification): launch `bash scripts/run-dev.sh <worktree> --label "Ask Timeout"`, then (a) trigger an AskUserQuestion and answer it in TERMINAL view — the chat card should clear quietly within ~2 buffer flushes, no error text; (b) trigger a Bash permission ask, `kill` the relay process (`pkill -f relay-blocking`) — the card should stay with terminal-menu-labeled digit buttons, and clicking one should both answer the menu and clear the card; (c) confirm the strip dot stays red in a background session while an ask is pending. The 2h auto-deny path itself can be spot-checked by temporarily launching with `CLAUDE_RELAY_TIMEOUT` untouched but the dev build's `APP_HOLD_MS` lowered locally — or simply trusted to the relay tests.
- [ ] **Step 5: PR + lifecycle.** Use superpowers:finishing-a-development-branch. One PR to `youcoded` master titled `feat: permission-ask timeout redesign (2h app-owned hold, honest expiry states)`. After merge: flip the ROADMAP entry (`Permission asks expire after 5 min…`) to `[x]`, move the spec + this plan to `docs/archive/`, and push `youcoded-dev` — merge means merge AND push AND archive.

---

## Self-Review (done at authoring time)

- **Spec coverage:** §1 table → Tasks 2/7/8 · §1a → 7 (+Android-none rationale in 8) · §1b dismiss → 5, magnitude → resolved (2h) · §2 reasons + standing rule → 3/4/7 · §2a retention → 3 · §2b five consumers → 4 (detector), 5 (ToolCard, CompactToolStrip), 6 (fixture-loader); AssistantTurnBubble deliberately unchanged · §2c delivery-failed + default-resolve → 3/5 · §2d native default → 3 (WHY comment in reducer) · §3 rebind + gates + resolution-via-standing-rule → 9 · §4 reload-docs note → no code change (documented in spec); force-path copy → 10 · §5 five sites → 2 · §6 Android order → 1 before 2, 8 after 7 · §Testing → distributed per task; margins test extended in 7/8.
- **Known judgment calls (flag to reviewer):** `PERMISSION_CARD_RESOLVED` sets `'complete'` (quiet, transcript overwrites if the tool really ran); rebind renders the parsed menu's own labels (strictly safer than label-matching the card's old buttons); reducer copy is duration-free (constants live main-side; the deny *message* CC sees computes the hours from `APP_HOLD_MS`).
- **Type consistency:** `reason` union identical in chat-types, hook-dispatcher, and test literals; `PERMISSION_CARD_RESOLVED{sessionId,toolUseId}` used in Tasks 3/4/5/9; `rebindButtons` signature matches between 9's test and impl; `hasSession` produced in 7 before use.
