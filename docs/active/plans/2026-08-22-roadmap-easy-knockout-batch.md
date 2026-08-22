---
status: active
---
<!-- Reviewed 2026-08-22 by an independent agent against master c34890d3: 5/6 tasks
     approved as written; Task 4's original fs-spy test design was replaced with the
     delete-cache-file + fetch-count design per the review; Task 3 Step 4 corrected
     (removeProject becomes test-only after the prune — expected, noted as follow-up). -->



# Roadmap Easy-Knockout Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close six verified small ROADMAP bugs in one branch: three dead-code prunes (`NativeSessionHost.askPermission`, `HookRelay.closeSocket` + `EventBridge.closeSocket`, Kotlin `detectOrphan`/`rebuildIndex`), the ModelCatalog double-read, the remote-WS `session:meta-changed` broadcast gap, and the untested `SESSION_CREATE` native-resume split-refusal branch.

**Architecture:** All changes are in the `youcoded` repo (desktop TS + Android Kotlin). Every item was re-verified against master `c34890d3` on 2026-08-22 with repo-wide searches; exact evidence is inline per task. Tasks are fully independent of each other and can run in any order.

**Tech Stack:** TypeScript (Electron main), Kotlin (Android), Vitest, JUnit.

## Global Constraints

- Branch: `fix/roadmap-easy-knockouts` in a worktree at `/home/destin/youcoded-dev/worktrees/bug-knockout`, based on `origin/master` (`c34890d3`).
- Worktree setup MUST copy node_modules with hardlinks, never symlink: `cp -al /home/destin/youcoded-dev/youcoded/desktop/node_modules /home/destin/youcoded-dev/worktrees/bug-knockout/desktop/node_modules` (a symlink makes verify.sh silently skip suites and lets Gradle wipe the shared copy — `docs/PITFALLS.md`).
- Desktop gate: `bash scripts/verify.sh bug-knockout` from `/home/destin/youcoded-dev` must pass before any task is called done (it covers desktop only).
- Android gate (Tasks 2 and 3 only): `./gradlew :app:testDebugUnitTest -x bundleWebUi` from the worktree root must pass. `-x bundleWebUi` is mandatory — the task transitively runs `npm ci` (see PITFALLS on worktrees).
- Every non-trivial edit carries a WHY comment (Destin is a non-developer and reads code through comments).
- Do NOT touch `ROADMAP.md` or `docs/` in the workspace repo from this branch — workspace-doc updates happen at merge time, separately.
- Do NOT create a PR; stop when the branch is pushed and green.

---

### Task 1: Delete `NativeSessionHost.askPermission` (dead duplicate of the shipped `askUser` closure)

Verified 2026-08-22: `rg -n "askPermission"` over the whole repo returns 3 hits — the declaration at `desktop/src/main/harness/native-session-host.ts:1883` and two test-fixture calls at `desktop/tests/native-session-host.test.ts:128-129`. (The ROADMAP entry's "exactly one line / zero callers" is stale — the two test callers exist.) The shipped path is the `askUser` closure at `native-session-host.ts:2116`, which is a strict superset: it threads `permissionMode` (`this.modeFor.get(sessionId) ?? 'ask'`), which `askPermission` omits — so `askPermission` would raise asks with a missing mode. No production caller ever existed; its doc comment promises "Task 12's decide() will call this", and what Task 12 actually shipped is the closure.

**Files:**
- Modify: `desktop/src/main/harness/native-session-host.ts:1881-1890` (delete method + doc comment)
- Modify: `desktop/tests/native-session-host.test.ts:128-129` (re-seed via the broker directly)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on.

- [ ] **Step 1: Rewrite the test's seeding lines first (it is the only caller)**

In `desktop/tests/native-session-host.test.ts`, the test `'pendingAskEventsFor delegates to the broker for one session'` seeds two pending asks. Replace lines 128-129:

```ts
    void host.askPermission({ sessionId: 's1', toolName: 'Bash', toolInput: { command: 'npm test' }, denyListed: false });
    void host.askPermission({ sessionId: 's2', toolName: 'Read', toolInput: {}, denyListed: false });
```

with:

```ts
    // Seed two pending asks straight through the broker — the public
    // askPermission delegate was deleted (ROADMAP 2026-08-12: zero production
    // callers; the shipped path is the askUser closure, which also threads
    // permissionMode). This test only proves pendingAskEventsFor forwards to
    // the broker, so seeding at the broker is the honest fixture.
    void (host as any).broker.ask({ sessionId: 's1', toolName: 'Bash', toolInput: { command: 'npm test' }, denyListed: false });
    void (host as any).broker.ask({ sessionId: 's2', toolName: 'Read', toolInput: {}, denyListed: false });
```

- [ ] **Step 2: Run the test — it must still pass with the method still present**

Run: `cd /home/destin/youcoded-dev/worktrees/bug-knockout/desktop && npx vitest run tests/native-session-host.test.ts -t "pendingAskEventsFor"`
Expected: PASS (proves the reseeding is equivalent before the deletion).

- [ ] **Step 3: Delete the method**

In `desktop/src/main/harness/native-session-host.ts`, delete lines 1881-1890 (the doc comment starting `/** Raise a native permission ask (Task 12's decide() will call this).` through the closing `}` of `askPermission`). Leave `respondPermission` above and `pendingAskEventsFor` below untouched.

- [ ] **Step 4: Prove zero references remain**

Run: `rg -n "askPermission" /home/destin/youcoded-dev/worktrees/bug-knockout`
Expected: no output.

- [ ] **Step 5: Run the full test file**

Run: `cd /home/destin/youcoded-dev/worktrees/bug-knockout/desktop && npx vitest run tests/native-session-host.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "fix(native-runtime): delete dead NativeSessionHost.askPermission

Zero production callers (ROADMAP 2026-08-12): the shipped ask path is the
askUser closure handed to each HarnessSession, which also threads
permissionMode — askPermission was a strictly weaker duplicate. Test fixture
now seeds pending asks at the broker it was really testing."
```

---

### Task 2: Delete `HookRelay.closeSocket()` (desktop) and `EventBridge.closeSocket()` (Android)

Verified 2026-08-22: `rg -n "closeSocket"` repo-wide returns exactly 3 hits — the two declarations (`desktop/src/main/hook-relay.ts:168`, `app/src/main/kotlin/com/youcoded/app/parser/EventBridge.kt:205`) and a tombstone comment at `ManagedSession.kt:651` describing a removed caller that never worked (it passed a `toolUseId` where a `requestId` was expected). Nothing leaks without them: desktop teardown is `HookRelay.stop()` (ends every pending socket, clears the map; called from `main.ts:2025`), Android teardown is `EventBridge.stop()` (called from `PtyBridge.kt:108` and `:297`), and per-request abandonment is covered by `EventBridge.monitorSocketClosure()` / desktop `respond()`'s destroyed-socket branch. No test references either method (`EventBridgePendingPermissionTest.kt` exercises `hasPendingPermission` only). Note: the ROADMAP entry's "it clears its hold timer" is wrong — the desktop body is just end + map delete; nothing else must absorb a timer.

**Files:**
- Modify: `desktop/src/main/hook-relay.ts:168-174` (delete method)
- Modify: `app/src/main/kotlin/com/youcoded/app/parser/EventBridge.kt:204-208` (delete method + its doc line)
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/ManagedSession.kt:648-655` (reword the tombstone so it doesn't cite a method that no longer exists)

**Interfaces:**
- Consumes: nothing. Produces: nothing.

- [ ] **Step 1: Delete the desktop method**

In `desktop/src/main/hook-relay.ts`, delete lines 168-174:

```ts
  closeSocket(requestId: string): void {
    const pending = this.pendingSockets.get(requestId);
    if (pending && !pending.socket.destroyed) {
      pending.socket.end();
    }
    this.pendingSockets.delete(requestId);
  }
```

- [ ] **Step 2: Delete the Android method**

In `app/src/main/kotlin/com/youcoded/app/parser/EventBridge.kt`, delete lines 204-208:

```kotlin
    /** Close a held socket without sending a response (cross-path cleanup). */
    fun closeSocket(requestId: String) {
        val socket = pendingSockets.remove(requestId) ?: return
        try { socket.close() } catch (_: Exception) {}
    }
```

- [ ] **Step 3: Reword the ManagedSession tombstone**

In `app/src/main/kotlin/com/youcoded/app/runtime/ManagedSession.kt`, replace the comment body inside `routeHookEvent` (lines 649-654):

```kotlin
        // Previously attempted to close orphaned permission sockets here on
        // PostToolUse/PostToolUseFailure, but the code passed toolUseId to
        // closeSocket() which expects a requestId — the two IDs are unrelated,
        // so cleanup never matched anything. Socket closure is now handled by
        // EventBridge.monitorSocketClosure() which detects when the relay
        // process exits and emits PermissionExpired to clear the React UI.
```

with:

```kotlin
        // Previously attempted to close orphaned permission sockets here on
        // PostToolUse/PostToolUseFailure via a since-deleted
        // EventBridge.closeSocket(requestId), but the code passed a toolUseId —
        // the two IDs are unrelated, so cleanup never matched anything. Socket
        // closure is handled by EventBridge.monitorSocketClosure(), which
        // detects when the relay process exits and emits PermissionExpired to
        // clear the React UI.
```

- [ ] **Step 4: Prove zero references remain**

Run: `rg -n "closeSocket" /home/destin/youcoded-dev/worktrees/bug-knockout`
Expected: only the reworded ManagedSession.kt tombstone (which names it as deleted).

- [ ] **Step 5: Run both platforms' tests**

Run: `cd /home/destin/youcoded-dev/worktrees/bug-knockout/desktop && npx vitest run tests/hook-relay.test.ts`
Expected: PASS.
Run: `cd /home/destin/youcoded-dev/worktrees/bug-knockout && ./gradlew :app:testDebugUnitTest -x bundleWebUi`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "fix(permissions): delete dead closeSocket on both platforms

HookRelay.closeSocket and EventBridge.closeSocket had zero call sites
(ROADMAP 2026-07-31); teardown is stop() on both platforms and per-request
abandonment is monitorSocketClosure / respond's destroyed-socket branch, so
nothing leaks. ManagedSession tombstone reworded to note the deletion."
```

---

### Task 3: Prune Kotlin `detectOrphan` + `rebuildIndex` (test-only callers; desktop twins removed 2026-07-10)

Verified 2026-08-22: `rg -n "detectOrphan"` returns hits only in `ProjectManager.kt` (declaration, lines 110-131 incl. doc comment), `ProjectManagerTest.kt` (two tests, lines 158-182), and the desktop tombstone `desktop/src/main/artifacts/project-manager.ts:150-154`, which says outright the Kotlin mirrors "should be pruned in an Android session". `rebuildIndex` (ProjectManager.kt:133-162, test at ProjectManagerTest.kt:184-218) is the identical situation named in the same tombstone.

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/artifacts/ProjectManager.kt` (delete both functions + header lines)
- Modify: `app/src/test/kotlin/com/youcoded/app/artifacts/ProjectManagerTest.kt` (delete their test sections)
- Modify: `desktop/src/main/artifacts/project-manager.ts:150-154` (retire the "should be pruned" sentence)

**Interfaces:**
- Consumes: nothing. Produces: nothing.

- [ ] **Step 1: Re-verify no production callers of either function (must be re-run in the worktree, not assumed)**

Run: `rg -n "detectOrphan|rebuildIndex" /home/destin/youcoded-dev/worktrees/bug-knockout/app/src/main --glob '!**/ProjectManager.kt'`
Expected: no output. If anything appears, STOP and report — do not delete.

- [ ] **Step 2: Delete the two functions**

In `ProjectManager.kt`:
- Delete lines 110-162 (the `detectOrphan` doc comment + function AND the `rebuildIndex` doc comment + function — they are contiguous).
- In the file header comment (lines 3-7), delete the two bullet lines for `detectOrphan` and `rebuildIndex` and change "Provides four project-level operations:" to "Provides two project-level operations:".

- [ ] **Step 3: Delete their tests**

In `ProjectManagerTest.kt`, delete lines 158-218: the `// ── detectOrphan ──` section (both `@Test` cases) and the `// ── rebuildIndex ──` section (`rebuildIndexDropsProjectsWithMissingSidecar`). Keep the class's closing brace (line 219).

- [ ] **Step 4: Note the expected `removeProject` orphaning (verified by the independent review)**

No test-file import cleanup is needed: `ProjectManagerTest.kt` is in the same package (its only imports are junit/File/Files/asserts, lines 3-9), and `appendVersion` is still used by the surviving `ensureProjectAutoRecoverFromExistingSidecar` test. However, `removeProject`'s ONLY main-source caller is `ProjectManager.kt:159` — inside the `rebuildIndex` being deleted — so after this prune it becomes test-only itself. Do NOT delete it in this task (scope discipline); record it in the commit message as an expected follow-up. Confirm the state: `rg -n "removeProject" /home/destin/youcoded-dev/worktrees/bug-knockout/app/src/main` should return only the CentralIndex declaration after the prune.

- [ ] **Step 5: Update the desktop tombstone**

In `desktop/src/main/artifacts/project-manager.ts`, replace lines 150-154:

```ts
// NOTE: detectOrphan / rebuildIndex were removed in the 2026-07-10 dead-code
// sweep — no production caller ever invoked them (orphan detection happens
// live in the drawer/badge via checkExistence, and the sidebar count is
// computed live in LIST_PROJECTS_INDEX). The Kotlin mirrors in
// ProjectManager.kt still exist and should be pruned in an Android session.
```

with:

```ts
// NOTE: detectOrphan / rebuildIndex were removed in the 2026-07-10 dead-code
// sweep — no production caller ever invoked them (orphan detection happens
// live in the drawer/badge via checkExistence, and the sidebar count is
// computed live in LIST_PROJECTS_INDEX). The Kotlin mirrors were pruned
// 2026-08-22.
```

- [ ] **Step 6: Run the Android unit tests**

Run: `cd /home/destin/youcoded-dev/worktrees/bug-knockout && ./gradlew :app:testDebugUnitTest -x bundleWebUi`
Expected: BUILD SUCCESSFUL (remaining ProjectManagerTest cases pass).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore(android): prune dead detectOrphan + rebuildIndex from ProjectManager.kt

Desktop twins were removed in the 2026-07-10 dead-code sweep; the Kotlin
mirrors survived with test-only callers (ROADMAP 2026-08-13). Tombstone in
project-manager.ts updated to record the prune."
```

---

### Task 4: Memoize `ModelCatalog.ensureFresh()` so a session start stops re-reading + re-parsing the catalog file

Verified 2026-08-22: `ModelCatalog` (`desktop/src/main/providers/model-catalog.ts`) holds no parsed cache in memory — every `get()` → `ensureFresh()` → `readCache()` does a fresh `readFileSync` + `JSON.parse` of the whole OpenRouter payload. `resolveContextAndProfile` (`native-session-host.ts:2047` and `:2063`) awaits `contextLengthFor` and the vision closure back-to-back on every create/resume/swap — two full disk reads per session start, synchronously on the main process. Fix is a memo INSIDE `ensureFresh()` gated on the same `fetchedAt` TTL check, so the deliberate retry semantics survive: the partial-refresh branch writes an OLD `fetchedAt` (so the next call retries the network) and the total-failure branch returns stale without re-stamping — both must keep retrying, and both do because the memo is only ever SERVED when `Date.now() - memo.fetchedAt < ttlMs`. Never memoize `get()`'s output — it merges live local-engine rows that change with engine state.

**Files:**
- Modify: `desktop/src/main/providers/model-catalog.ts`
- Test: `desktop/tests/model-catalog.test.ts`

**Interfaces:**
- Consumes: nothing. Produces: no signature changes — `get`/`contextLengthFor` behave identically, minus the redundant I/O.

- [ ] **Step 1: Write the failing test**

Do NOT spy on `fs.readFileSync` — `model-catalog.ts` uses `import * as fs from 'fs'` (a namespace import), and this repo has documented evidence that `vi.spyOn` on a builtin does not reach namespace-import consumers (`session-meta-parity.test.ts:87-90`, the `import * as os` note). The spy would count zero reads and the test would fail both before AND after the fix.

Instead pin the behavior with the suite's existing injected-fetch pattern: prime the catalog (network fetch writes the cache file and, post-fix, sets the memo), then DELETE the cache file, then call `get()` again. Without the memo the second call finds no cache → refetches (fetch count rises). With the memo the second call never touches disk or network.

Append to `desktop/tests/model-catalog.test.ts`, mirroring the existing tests' construction of a catalog with an injected fetch mock and tmp cache dir (read the "serves from disk cache within TTL (single fetch pair across two calls)" test at ~line 48 for the exact fixture helpers and reuse them):

```ts
  it('serves repeat calls from the in-memory memo — no disk or network after a fresh fetch (ROADMAP 2026-08-11)', async () => {
    // Session start calls contextLengthFor + get back-to-back; before the memo
    // each call re-read and re-parsed the whole cache file synchronously on
    // the main process. Deleting the file between calls proves the second
    // call was served from memory: without the memo it would refetch.
    const cat = /* construct with the suite's fetch mock + tmp cacheDir, as the ~line 48 test does */;
    await cat.get(providers);                       // fetches, writes cache, sets memo
    const fetchCallsAfterPrime = fetchMock.mock.calls.length;
    fs.rmSync(path.join(cacheDir, 'provider-catalog-cache.json'));
    const models = await cat.get(providers);        // must come from the memo
    expect(fetchMock.mock.calls.length).toBe(fetchCallsAfterPrime);
    expect(models.length).toBeGreaterThan(0);
  });
```

(The `/* construct ... */` placeholder is the ONE deliberate adaptation point: use the file's real helper/fixture names — the implementer must read the existing test first. Everything else lands as written.)

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd /home/destin/youcoded-dev/worktrees/bug-knockout/desktop && npx vitest run tests/model-catalog.test.ts -t "memo"`
Expected: FAIL — the fetch count rises on the second call (no memo yet, cache file gone → refetch).

- [ ] **Step 3: Implement the memo**

In `desktop/src/main/providers/model-catalog.ts`:

Add a field after `localModels` (line ~36):

```ts
  // In-memory copy of the last cache we returned (ROADMAP 2026-08-11: every
  // ensureFresh() re-read + re-parsed the whole catalog file from disk, twice
  // per session start). SERVED only while its own fetchedAt is inside the TTL
  // — a stale-but-served cache (partial refresh / total failure keep an OLD
  // stamp on purpose) fails that check and still retries the network next
  // call, so the retry semantics those branches were built for survive.
  private memo: CacheShape | null = null;
```

At the top of `ensureFresh()` (before `const stale = this.readCache();`):

```ts
    if (this.memo && Date.now() - this.memo.fetchedAt < this.ttlMs) return this.memo;
```

Then stamp the memo at the two return points that can carry a fresh-enough shape — change:

```ts
    const stale = this.readCache();
    if (stale && Date.now() - stale.fetchedAt < this.ttlMs) return stale;
```

to:

```ts
    const stale = this.readCache();
    if (stale && Date.now() - stale.fetchedAt < this.ttlMs) { this.memo = stale; return stale; }
```

and at the bottom, change `return fresh;` (after the `writeFileSync` try/catch) to:

```ts
    // Memoize unconditionally — the serve-path TTL check above is what decides
    // whether this shape is fresh enough to reuse (a partial refresh carries an
    // expired stamp and will be re-fetched next call regardless).
    this.memo = fresh;
    return fresh;
```

Do NOT touch the total-failure branch (`return stale ?? EMPTY_CACHE;`) — an expired shape in the memo would be rejected by the TTL check anyway, but leaving it unmemoized keeps the branch exactly as documented.

- [ ] **Step 4: Run the FULL model-catalog suite**

Run: `cd /home/destin/youcoded-dev/worktrees/bug-knockout/desktop && npx vitest run tests/model-catalog.test.ts`
Expected: PASS, especially "partial refresh persists the good source but retries BOTH on the next call" (the test a naive memo breaks) and every ttlMs-forced-expiry case.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix(providers): memoize ModelCatalog cache — one disk read per fresh window

Session start (create/resume/swap) awaits contextLengthFor + the vision
closure back-to-back; each re-read and re-parsed the whole catalog JSON
synchronously on the main process (ROADMAP 2026-08-11). The memo is served
only while its own fetchedAt is inside the TTL, so the deliberate
retry-on-stale-stamp semantics of the partial/total failure branches hold."
```

---

### Task 5: Broadcast `session:meta-changed` from the remote WS set-tag/set-note handlers (+ forward `note` through the remote shim)

Verified 2026-08-22: `rg -n "SESSION_META_CHANGED" desktop/src/main/remote-server.ts` → zero hits. The remote `session:set-tag` (remote-server.ts:1022-1052) and `session:set-note` (:1053-1072) handlers persist and call `emitConversationMetaChanged()` (the chatsearch signal) but never `this.broadcast(...)` — so a SECOND remote client viewing the same session goes stale until a full refresh. The IPC twins DO broadcast: `SESSION_SET_TAG` at `ipc-handlers.ts:3163-3165` (payload `{ flag: tagFlagKey(tagId), value: !!value }`) and `SESSION_SET_NOTE` at `:3185-3187` (payload `{ note: text }`), both as `{ type: IPC.SESSION_META_CHANGED, payload: { sessionId: resolved, ...payload } }`. Renderer consumers (`useSessionMeta.ts:76`, `ResumeBrowser.tsx:640`) refetch on ANY meta-changed event and ignore the payload, so the echo back to the originating client is a harmless refetch, and there is no feedback loop (the client handler dispatches a DOM event; it never re-invokes set-tag). The remote shim (`remote-shim.ts:271`) forwards only `{flag, value}` and drops `note` — widen it for payload parity with preload (which forwards the raw payload).

Known residual gap, OUT OF SCOPE (record in ROADMAP at merge, do not fix here): a phone-originated change still doesn't notify the DESKTOP renderer — that needs a notify callback added to `setSessionMetaWiring`, a cross-surface API change.

**Files:**
- Modify: `desktop/src/main/remote-server.ts:1022-1072`
- Modify: `desktop/src/renderer/remote-shim.ts:270-271`
- Test: `desktop/tests/remote-server.test.ts`

**Interfaces:**
- Consumes: nothing. Produces: remote WS clients now receive `{type:'session:meta-changed', payload:{sessionId, flag, value}}` after set-tag and `{... payload:{sessionId, note}}` after set-note.

- [ ] **Step 1: Write the two failing tests**

In `desktop/tests/remote-server.test.ts`, inside `describe('session:set-tag', ...)` (starts line 483), add — following the suite's existing pattern (`sendAndCollect`, `server.setSessionMetaWiring`, `fakeNativeRuntime`; see the passing cases in that describe for the exact arrange shape):

```ts
    it('broadcasts session:meta-changed after a successful write (parity with ipcMain SESSION_SET_TAG)', async () => {
      const { RemoteServer } = await import('../src/main/remote-server');
      const server: any = new RemoteServer(mockSessionManager, mockHookRelay, mockConfig);
      server.setNativeRuntime(fakeNativeRuntime(new Set()));
      server.setSessionMetaWiring({ resolve: (id: string) => id, canWrite: () => true });
      const bSpy = vi.spyOn(server, 'broadcast');

      await sendAndCollect(server, msg());

      // Same frame shape the ipcMain path sends (ipc-handlers SESSION_SET_TAG):
      // a second remote client viewing this session must refetch its meta.
      expect(bSpy).toHaveBeenCalledWith({
        type: 'session:meta-changed',
        payload: { sessionId: 'desktop-1', flag: 'tag:tag_abc', value: true },
      });
    });
```

And inside `describe('session:set-note', ...)` (starts line 605):

```ts
    it('broadcasts session:meta-changed after a successful write (parity with ipcMain SESSION_SET_NOTE)', async () => {
      const { RemoteServer } = await import('../src/main/remote-server');
      const server: any = new RemoteServer(mockSessionManager, mockHookRelay, mockConfig);
      server.setNativeRuntime(fakeNativeRuntime(new Set()));
      server.setSessionMetaWiring({ resolve: (id: string) => id, canWrite: () => true });
      const bSpy = vi.spyOn(server, 'broadcast');

      await sendAndCollect(server, msg());

      expect(bSpy).toHaveBeenCalledWith({
        type: 'session:meta-changed',
        payload: { sessionId: 'desktop-1', note: 'hello' },
      });
    });
```

Check the tag flag key first: `tagFlagKey('tag_abc')` — run `rg -n "export function tagFlagKey" -A 3 src/shared/tags.ts` and use its real output format in the assertion (the plan assumes `tag:tag_abc`; if it differs, follow the code).

- [ ] **Step 2: Run to verify both fail**

Run: `cd /home/destin/youcoded-dev/worktrees/bug-knockout/desktop && npx vitest run tests/remote-server.test.ts -t "broadcasts session:meta-changed"`
Expected: FAIL ×2 — `broadcast` never called.

- [ ] **Step 3: Implement the broadcasts**

In `desktop/src/main/remote-server.ts`, `case 'session:set-tag'`: after `emitConversationMetaChanged();` (line 1049) and before `this.respond(...)`, insert:

```ts
        // ROADMAP 2026-07-23: the ipcMain twin broadcasts session:meta-changed
        // after a successful persist; without this a SECOND remote client (or
        // the same session on another device) stayed stale until a full
        // refresh. Same frame shape as ipc-handlers SESSION_SET_TAG. The echo
        // to the originating client is a harmless refetch (consumers ignore
        // the payload and refetch meta).
        this.broadcast({ type: 'session:meta-changed', payload: { sessionId: resolved, flag: tagFlagKey(tagId), value: !!payload?.value } });
```

In `case 'session:set-note'`: after `emitConversationMetaChanged();` (line 1069), insert:

```ts
        // Same parity gap as session:set-tag above — see that comment.
        this.broadcast({ type: 'session:meta-changed', payload: { sessionId: resolved, note: text } });
```

(`tagFlagKey` is already imported dynamically at the top of the set-tag case — the broadcast goes inside the same case block so it's in scope.)

- [ ] **Step 4: Widen the remote shim to forward `note`**

In `desktop/src/renderer/remote-shim.ts`, replace line 270-271:

```ts
    case 'session:meta-changed':
      dispatchEvent('session:meta-changed', payload.sessionId, { flag: payload.flag, value: payload.value });
```

with:

```ts
    case 'session:meta-changed':
      // Forward note too — set-note broadcasts {sessionId, note} (no flag), and
      // narrowing to {flag, value} silently dropped it. Preload forwards the
      // raw payload; this now matches.
      dispatchEvent('session:meta-changed', payload.sessionId, { flag: payload.flag, value: payload.value, note: payload.note });
```

- [ ] **Step 5: Run the full remote-server suite + verify**

Run: `cd /home/destin/youcoded-dev/worktrees/bug-knockout/desktop && npx vitest run tests/remote-server.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "fix(sync): remote WS set-tag/set-note now broadcast session:meta-changed

The ipcMain twins broadcast after a successful persist; the remote handlers
only emitted the chatsearch signal, so a second remote client stayed stale
until a full refresh (ROADMAP 2026-07-23). Shim widened to forward the note
payload it previously dropped."
```

---

### Task 6: Direct tests for the `SESSION_CREATE` native-resume split-refusal branch

Verified 2026-08-22: the three refusal messages live at `ipc-handlers.ts:651` ("This conversation hasn't synced to this device yet — its transcript isn't here."), `:654` (`` `This conversation's project folder ('${rec.projectName}') isn't on this device.` ``), and `:680` ("This conversation could not be resumed — its saved data is missing."). `rg -n "hasn't synced to this device|isn't on this device|could not be resumed" desktop/` hits only those three source lines — zero under `desktop/tests/`. The only existing test (`ipc-handlers.test.ts:154-211`) is deliberately message-agnostic and covers branch 3 incidentally. Branch logic: gate at `:636` (`opts.cwd` exists AND transcript exists under `~/.youcoded/sessions/<nativeStoreSlug(cwd)>/<id>.jsonl`); on miss, consult `getConversationStore()?.get('native', id)`; with a record, `buildLocalProjectResolver()` resolves `originalPath`-if-exists → managed-by-name → saved-folder-by-basename → null (`resolve-local-project.ts:31-44`).

**Files:**
- Create: `desktop/tests/session-create-native-resume-refusal.test.ts`

**Interfaces:**
- Consumes: the real `registerIpcHandlers` + real conversation store, per the `session-meta-parity.test.ts` harness (electron mock at its lines 19-30, `setup()` at 49-78, HOME/USERPROFILE redirect at 85-102, real `startConversationStore` at 104-128).
- Produces: three pinning tests, one per refusal message.

- [ ] **Step 1: Write the new test file (all three cases; expect all to PASS immediately — this task adds coverage, not a code change; a failure means a REAL finding, stop and report it)**

Create `desktop/tests/session-create-native-resume-refusal.test.ts`. Copy the electron `vi.mock`, `setup()`, beforeAll/afterAll HOME redirect, and beforeEach/afterEach store lifecycle VERBATIM from `session-meta-parity.test.ts` (lines 14-128) — same rationale comments apply; then:

```ts
// Pins the three split-refusal messages of the native resume path
// (ipc-handlers.ts session:create, Task 9). ROADMAP 2026-07-23: this branch
// predates M2 and had no direct test — the only prior coverage was
// message-agnostic and touched one branch incidentally. Each case drives the
// REAL handler with a REAL conversation store and asserts the EXACT copy, so
// a wording collapse or branch swap fails loudly.
const RESUME_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

async function createNativeResume(handler: any, cwd?: string) {
  await handler('session:create')(
    { sender: { id: 1 } },
    { provider: 'native', resumeSessionId: RESUME_ID, cwd, name: 'Resuming…', skipPermissions: false },
  );
  // Refusals emit via process.nextTick — flush one tick before asserting.
  await new Promise((resolve) => process.nextTick(resolve));
}

function sessionErrorText(mockWindow: any): string | undefined {
  const call = mockWindow.webContents.send.mock.calls.find(
    (c: any[]) => c[0] === 'transcript:event' && c[1]?.type === 'session-error' && c[1]?.sessionId === RESUME_ID,
  );
  return call?.[1]?.data?.text;
}

describe('session:create native resume — split refusal messages', () => {
  it("refuses with the 'hasn't synced' message when the folder resolves but its transcript is absent", async () => {
    const { handler, mockWindow } = setup({
      createSession: vi.fn(() => ({ id: RESUME_ID, name: 'Resuming…', cwd: '/tmp', status: 'active', provider: 'native' })),
    });
    // Record resolves via originalPath (an existing dir) but NO
    // <home>/.youcoded/sessions/<slug>/<id>.jsonl exists for that dir.
    const projDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-refusal-proj-'));
    await getConversationStore()!.upsert({
      provider: 'native', id: RESUME_ID,
      projectName: path.basename(projDir), originalPath: projDir,
    });
    await createNativeResume(handler, '/nonexistent-cwd');
    expect(sessionErrorText(mockWindow)).toBe(
      "This conversation hasn't synced to this device yet — its transcript isn't here.",
    );
    fs.rmSync(projDir, { recursive: true, force: true });
  });

  it("refuses with the 'project folder isn't on this device' message when nothing resolves the record", async () => {
    const { handler, mockWindow } = setup({
      createSession: vi.fn(() => ({ id: RESUME_ID, name: 'Resuming…', cwd: '/tmp', status: 'active', provider: 'native' })),
    });
    // originalPath does not exist; projectName matches no managed root or
    // saved folder under the redirected HOME → resolver returns null.
    await getConversationStore()!.upsert({
      provider: 'native', id: RESUME_ID,
      projectName: 'no-such-project-anywhere', originalPath: '/definitely/not/here',
    });
    await createNativeResume(handler, '/nonexistent-cwd');
    expect(sessionErrorText(mockWindow)).toBe(
      "This conversation's project folder ('no-such-project-anywhere') isn't on this device.",
    );
  });

  it("refuses with the 'saved data is missing' message when there is no record and no binding", async () => {
    const { handler, mockWindow } = setup({
      createSession: vi.fn(() => ({ id: RESUME_ID, name: 'Resuming…', cwd: '/tmp', status: 'active', provider: 'native' })),
    });
    // No store record, cwd fails existsSync, no binding → resume() false path.
    await createNativeResume(handler, '/nonexistent-cwd');
    expect(sessionErrorText(mockWindow)).toBe(
      'This conversation could not be resumed — its saved data is missing.',
    );
  });
});
```

Implementation notes for the copier:
- `setup()` must accept sessionManager overrides — `session-meta-parity.test.ts`'s `setup(sessionManagerOverrides)` already does.
- Keep the imports the parity file uses (`fs`, `os`, `path`, `registerIpcHandlers`, `startConversationStore`, `stopConversationStore`, `getConversationStore`) — `pruneNativePhantomRecords` is not needed.
- The parity file's beforeEach writes a native transcript jsonl for ITS fixture id; this file's beforeEach must NOT write one for `RESUME_ID` (the whole point is its absence). Keep the store startup part.
- Case 1's slug: the handler checks `nativeTranscriptExists(projDir, RESUME_ID)` under the REDIRECTED home — nothing writes it, so it's absent. No slug computation needed in the test.

- [ ] **Step 2: Run the file**

Run: `cd /home/destin/youcoded-dev/worktrees/bug-knockout/desktop && npx vitest run tests/session-create-native-resume-refusal.test.ts`
Expected: PASS ×3. If a case fails, the branch behavior differs from the documented copy — STOP and report the discrepancy (that would itself be a real bug finding); do not adjust the source to match the test without flagging it.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test(native-runtime): pin the three SESSION_CREATE resume refusal messages

The split-refusal branch (transcript-not-synced / project-folder-missing /
saved-data-missing) had no direct test — prior coverage was message-agnostic
and hit one branch incidentally (ROADMAP 2026-07-23). Real-store IPC harness
per session-meta-parity.test.ts."
```

---

### Final gate (after all tasks)

- [ ] Run `bash scripts/verify.sh bug-knockout` from `/home/destin/youcoded-dev` — must pass in full (tsc, related vitest, knip, eslint, ast-grep).
- [ ] Run `cd /home/destin/youcoded-dev/worktrees/bug-knockout && ./gradlew :app:testDebugUnitTest -x bundleWebUi` — must pass.
- [ ] Push the branch: `git push -u origin fix/roadmap-easy-knockouts`. Do NOT open a PR; stop for Destin's review.
