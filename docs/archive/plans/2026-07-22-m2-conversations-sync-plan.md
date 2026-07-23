---
status: shipped
created: 2026-07-22
type: plan
program: docs/active/plans/2026-07-22-native-runtime-parity-program.md (§3 — Milestone M2)
design: docs/archive/specs/2026-07-18-native-sync-parity-design.md (Option C)
handoff: docs/archive/handoffs/2026-07-22-m2-conversations-sync-handoff.md
---

**Shipped via M2, youcoded PR #212, merge `60d56a67`.**

# M2 Conversations & Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native sessions participate in the conversation store and cross-device sync indistinguishably from Claude Code sessions — provider-aware records with transcripts mirrored into the space, tags/flags/notes that round-trip, a resume flow that always offers a model selector pre-filled from a synced portable `lastUsedModel`, working takeover, auto-titles, and an honest store-availability path. M2 gates v1.3.0.

**Architecture:** The conversation store is already provider-open (`<root>/<provider>/<id>.json`); this plan threads a required `sessionProvider` parameter through the service layer (design D3 — the compiler enumerates call sites), routes the native host's `transcript-event` into `noteTranscriptEvent`, adds the `native/transcripts/` space lane (D5 — lanes stay disjoint), unlocks the three read-side provider locks while retiring the 2026-07-19 meta-refusal stopgap, and re-enables the native lease acquire together with a real native takeover quiesce. `lastUsedModel` is a portable `{modelId, providerType, providerLabel}` (never the device-local ULID) that pre-fills the always-shown resume selector.

**Tech Stack:** Electron main process (TS), React renderer, Vitest (`npm test` in `youcoded/desktop`), AI SDK v7 (`generateText` for titles).

**Task order is dependency order:** 1 (containment, security-shaped, must land before the sweep widens) → 2 (item 6 — meta-write honesty everything else builds on) → 3 (provider threading) → 4 (native writes real) → 5 (read locks + stopgap retirement — ONLY legal once 4 lands) → 6 (resume picker) → 7 (auto-titles) → 8 (flush/materialize) → 9 (takeover + lease) → 10 (docs/parity/PR).

## Global Constraints

Copied from the program doc, design doc, handoff, and `.claude/rules/` (paths relative to the `youcoded` repo unless noted):

- **Never write native records or transcripts under `claude/`, never cross-materialize between lanes** (design D5 + §8). The `claude/` vs `native/` split is what makes older app versions structurally safe.
- **`lastUsedModel` carries `{modelId, providerType, providerLabel}` — NEVER `binding.providerId`** (a device-local ULID for user-added providers). Destin's ruling (2026-07-22): resume ALWAYS offers the model selector; pre-fill from `lastUsedModel`; **never auto-launch a binding**; unknown model id ⇒ picker opens un-prefilled — never error, never substitute.
- **Broadcast `SESSION_META_CHANGED` and return `{ok:true}` only after the store write actually landed** (or was durably buffered). The 2026-07-19 stopgap exists because violating this caused silent data loss.
- **Store schema stays 1; new fields are optional.** `parseRecord`/`toRecord`/`mergeRecords`/`UpsertInput` all whitelist fields — a new field must be added in ALL FOUR places or old clients strip it on rewrite (verified: `store-core.ts:52-90`, `conversation-store.ts:105-122`, `store-core.ts:167-176`, `conversation-store.ts:42-51`).
- **The native session JSONL is single-writer, append-only; the header is written once and never rewritten.** Auto-titles must NOT touch the session file — titles live in the conversation store + live session name.
- **The native store keeps raw `cwdToProjectSlug`** (design §4.2 open question 5 resolved as: encode the divergence, don't migrate paths — a slug change orphans existing Windows transcripts). Fix the misleading comment at `harness/session-store.ts:10-12` on sight. The conversation/sync layer keeps `ccProjectSlug` for CC paths only.
- **Evidence-gated sync:** a remote-less space never emits `synced`; native flush rides the existing `syncSpacesSyncNowAwaited` barrier and inherits `engine.syncSpace`'s gating. No native-only `synced` path (post-#199 rule).
- **Interrupt aborts the current turn only — the queue still drains** (M1 pinned semantics, unchanged). A takeover quiesce therefore needs queue-clear + interrupt + settle, not interrupt alone.
- **`sessionProvider` is the parameter name** for the session-runtime axis (design §4.0 — `provider` already means model-provider in `native-session-host.ts`; don't entrench the collision).
- **Four-surface IPC parity:** channel strings byte-identical across `preload.ts` / `ipc-handlers.ts` / `remote-shim.ts` / `SessionService.kt`; new invokes get a `describe` in `desktop/tests/ipc-channels.test.ts`; remote WS resolves `{ok:false}` rather than throwing. Desktop-only milestone: Android gets stub strings only — **do not touch `SessionService.kt` beyond stub/list strings, and do NOT delete its meta stubs or its own refusal wording** (design §12: Android's gap is distinct and survives).
- **Fakes must be able to express failure** (#177 lesson, program §9). Takeover tests gain real native flows (real `NativeSessionHost` over a real store in a tmpdir — `native-session-host.test.ts:42-55` `delayedFactory` pattern; assert on append calls, not map state).
- **Error copy follows `docs/error-message-standards.md`** (workspace): specific and accurate, or general and non-committal — never a guessed cause. The resume-failure message split (Task 9) exists because the current one guesses wrong.
- **Annotate non-trivial edits with a WHY comment** (Destin is a non-developer). All the "same guard, different failure mode" spots below explicitly require one.
- Work in a git worktree on branch `feat/m2-conversations-sync`; one PR to `youcoded` master. Per-task subagent review; final whole-branch review on the most capable model. Flag two-instance interactive verification (takeover, cross-device resume) for Destin — do not build a CDP rig.

## File Structure

| File | Responsibility in this plan |
|---|---|
| `desktop/src/main/conversations/store-core.ts` | `lastUsedModel` field (parse/merge), `PortableModelRef` type |
| `desktop/src/main/conversations/conversation-store.ts` | `lastUsedModel` in `toRecord`/`UpsertInput`/upsert |
| `desktop/src/main/conversations/service.ts` | containment guard; meta-write buffer + honest results; `sessionProvider` threading; provider-aware `localJsonlPath`/`spaceTranscriptPath`; `noteModelUsed`; native flush/materialize branches |
| `desktop/src/main/conversations/takeover.ts` | provider-aware holder quiesce (injected `quiesceNative`), provider on moved flow |
| `desktop/src/main/conversations/transcript-mirror.ts` | unchanged (verified safe for native, §11.3) — consumed with native paths |
| `desktop/src/main/harness/native-session-host.ts` | `resume(id, cwd, bindingOverride?)`, `quiesce(sessionId)` |
| `desktop/src/main/harness/session-store.ts` | fix misleading slug comment (10-12) |
| `desktop/src/main/native-title-feeder.ts` (new) | first-turn auto-title generator (pure-ish, injected deps) |
| `desktop/src/main/ipc-handlers.ts` | native `noteTranscriptEvent` wiring; `lastUsedModel` hooks; get-meta/browse unlock; stopgap removal; lease re-enable; native cwd resolution + error split; title feeder wiring |
| `desktop/src/main/session-browser.ts` | `store.list('native')` overlay + native store-only rows |
| `desktop/src/main/remote-server.ts` | WS get-meta/browse/set-tag/set-note parity (incl. missing `canWriteStoreRecord` parity) |
| `desktop/src/shared/types.ts` | `PortableModelRef` on `PastSession`; retire native-only constant use |
| `desktop/src/renderer/components/NativeModelSelect.tsx` (new) | reusable provider-scoped model selector (catalog+providers join, extracted from ModelPickerPopup's native branch) |
| `desktop/src/renderer/components/ResumeBrowser.tsx` | native rows: full meta controls (drop `metaDisabled`), model selector in expanded options |
| `desktop/src/renderer/App.tsx` | `handleResumeSession` native binding param; MovedGate provider + pre-resume picker modal |
| `desktop/src/renderer/hooks/useSessionMeta.ts` | drop native-`supported` plumbing, KEEP revert-on-`ok:false` |
| `desktop/src/renderer/components/CloseSessionPrompt.tsx` | keep `metaLoaded` gate; native no longer unsupported |
| Tests | see per-task; `session-meta-native-refusal.test.ts` replaced by `session-meta-parity.test.ts` |
| Workspace: `.claude/rules/native-runtime.md`, `.claude/rules/conversations.md`, `.claude/rules/sync-spaces.md`, `docs/MAP.md`, lazy docs | contract updates in the same PR |

**Verified anchors (2026-07-22, youcoded master `e6d4ca3f`)** — the design doc's anchors are stale; use these: containment gap `service.ts:330,387`; `store?.` writes `service.ts:200-201,264,268,272`; boot order `main.ts:745` (IPC registered) vs `main.ts:1701` (store started, fire-and-forget); CC listener `ipc-handlers.ts:1974-1985` (feed at `:1984`), native listener `:2033-2038` (no feed); hardcoded `'claude'` at `service.ts:159,177,190,215,225,264,268,272,304,364` + `reconciler.ts:115,182,188`; get-meta lock `ipc-handlers.ts:2603-2624` (`:2616`) + `remote-server.ts:944-966` (`:954`); browse overlay lock `session-browser.ts:377`; browse handler `ipc-handlers.ts:1400-1432` (native concat `:1417-1431`); remote browse (no native rows) `remote-server.ts:738-742`; stopgap: `nativeMetaRefusal` `ipc-handlers.ts:2461-2471` (uses `:2478,2566,2588`), `canWriteStoreRecord` `:2443-2449`, `isNativeMetaTarget` `remote-server.ts:148-152` (uses `:924,936,948`), `metaDisabled` `ResumeBrowser.tsx:478,549-565`, `CloseSessionPrompt.tsx:51-58,133`, `useSessionMeta.ts:23-39,72-105`; reverted lease `ipc-handlers.ts:549-575` (CC acquire comparison `:2371`); pushMoved `ipc-handlers.ts:1925-1945`; MovedGate 3-arg call `App.tsx:2757`, `MovedInfo` `:262`, `handleResumeSession` `:2181` (native branch `:2231`); cwd rewrite `session-manager.ts:56-70`; resume-failure message `ipc-handlers.ts:521`; `nativeHost.resume` `native-session-host.ts:327-366`, `interrupt` `:454-462`, `destroy` order `:513-533`, `send` defer `:403-410`, `isNativeSessionId` `:376-378`; eager loadModel `ipc-handlers.ts:582-583`; native identity mapping `:549`; flush `service.ts:415-430`; materializeOne `:362-389`; sweep + live guard `:298-335` (`:325`); topic-watcher inline `ipc-handlers.ts:2217-2302`; `noteTitleChanged` sole-caller comment `service.ts:260-264`; ModelPickerPopup native branch `ModelPickerPopup.tsx:163-370`; ResumeBrowser expanded `:476-624` (static native line `:533`); Plan C capability registry **absent from master** — no floor to gate titles on.

---

### Task 1: `transcriptRef` containment guard

Small, security-shaped, lands first (design §4.1 item 4): `materializeSweep`/`materializeOne` join `rec.transcriptRef` onto the space root with no escape check; records arrive over sync from peers and over remote WS. Widening the sweep to all providers (Task 8) widens this surface.

**Files:**
- Modify: `desktop/src/main/conversations/service.ts:330,387` (+ a small helper)
- Test: `desktop/tests/conversations-service.test.ts`

**Interfaces:**
- Produces: `containedTranscriptPath(root: string, transcriptRef: string): string | null` (exported for tests) — `null` means refused.

- [ ] **Step 1: Write the failing tests** — in `conversations-service.test.ts`, drive `materializeOne` with a store fake returning a record whose `transcriptRef` is `'../../outside/x.jsonl'` (and one with an absolute path). Assert no `mirrorOut`/copy happens and a `console.warn` fires:

```ts
it('materializeOne refuses a transcriptRef that escapes the space root', async () => {
  h.managedRoots = { personalRoot: '/space' };
  h.store.get.mockResolvedValue({ ...baseRec, transcriptRef: '../../etc/passwd' });
  await materializeOne('abc');
  expect(h.mirror.materializeOut).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run** `cd youcoded/desktop && npx vitest run tests/conversations-service.test.ts` — expect FAIL (materialize proceeds today).

- [ ] **Step 3: Implement** in `service.ts`:

```ts
// SECURITY: transcriptRef arrives from synced peer records (and is reachable over
// remote WS). Joining it unchecked would let a crafted record read/write outside
// the space root. Same refuse-on-escape stance as providerDir/recordPath.
export function containedTranscriptPath(root: string, ref: string): string | null {
  if (!ref || path.isAbsolute(ref)) return null;
  const joined = path.resolve(root, ref);
  return joined.startsWith(path.resolve(root) + path.sep) ? joined : null;
}
```

Use it at both call sites (`:330`, `:387`): `const src = containedTranscriptPath(s.root(), rec.transcriptRef); if (!src) { console.warn('[conversations] refused transcriptRef escaping space root', rec.id); continue/return; }`

- [ ] **Step 4: Run the suite** — expect PASS (plus the whole file green).
- [ ] **Step 5: Commit** `fix(conversations): refuse transcriptRefs that escape the space root`

---

### Task 2: Item 6 — meta writes stop lying when the store is unavailable

Provider-agnostic; lands before everything (handoff resolution: "the meta-write path everything else builds on gets honest before you widen it"). Today: IPC handlers are live from `main.ts:745` while the store starts (fire-and-forget) at `main.ts:1701`; `noteFlagChanged`/`noteSessionNote`/`noteTitleChanged` are `store?.` chains, so boot-window writes evaporate while `SESSION_SET_FLAG`/`SET_TAG`/`SET_NOTE` still broadcast META_CHANGED and return `{ok:true}` (`ipc-handlers.ts:2498-2507`); remote WS `session:set-tag`/`set-note` (`remote-server.ts:916-943`) additionally lack `canWriteStoreRecord`/id-resolution parity.

**Files:**
- Modify: `desktop/src/main/conversations/service.ts` (state machine + buffer + result-returning writes)
- Modify: `desktop/src/main/ipc-handlers.ts:2473-2599` (await result; broadcast-after-persist; honest `ok:false`)
- Modify: `desktop/src/main/remote-server.ts:916-943` (same + resolution parity)
- Test: `desktop/tests/conversations-service.test.ts`, `desktop/tests/session-meta-native-refusal.test.ts` (extended here; replaced in Task 5)

**Interfaces:**
- Produces: `noteFlagChanged(id, flag, value): Promise<{ok:boolean}>`, `noteSessionNote(id, note): Promise<{ok:boolean}>`, `noteTitleChanged(id, title): Promise<{ok:boolean}>` (existing callers that ignore the result keep working — they `void` it). Module state: `storePhase: 'starting' | 'ready' | 'unavailable'`.
- Note: Task 3 adds the `sessionProvider` param to these same functions — land this task's shape first so the threading diff is mechanical.

- [ ] **Step 1: Write the failing tests** (`conversations-service.test.ts`; the store fake already expresses failure — `h.store.setFlag.mockRejectedValue` — and `h.managedRoots=null` drives the no-store path):

```ts
it('buffers a flag write made before the store starts, flushes it in order, resolves ok:true', async () => {
  const p1 = noteFlagChanged('id1', 'complete', true);   // store not started yet
  const p2 = noteSessionNote('id1', 'note-2');
  h.managedRoots = { personalRoot: '/space' };
  await startConversationStore();
  expect(await p1).toEqual({ ok: true });
  expect(await p2).toEqual({ ok: true });
  const flagOrder = h.store.setFlag.mock.invocationCallOrder[0];
  const noteOrder = h.store.setNote.mock.invocationCallOrder[0];
  expect(flagOrder).toBeLessThan(noteOrder);             // arrival order preserved
});
it('resolves buffered writes ok:false when the store never comes up', async () => {
  const p = noteFlagChanged('id1', 'complete', true);
  h.managedRoots = null;                                  // no personal root
  await startConversationStore();
  expect(await p).toEqual({ ok: false });
});
it('a rejecting store write resolves ok:false, not ok:true', async () => {
  h.managedRoots = { personalRoot: '/space' };
  await startConversationStore();
  h.store.setFlag.mockRejectedValue(new Error('lock timeout'));
  expect(await noteFlagChanged('id1', 'complete', true)).toEqual({ ok: false });
});
```

- [ ] **Step 2: Run** — expect FAIL (functions return `void` today).

- [ ] **Step 3: Implement** in `service.ts` (module scope, so writes arriving before `startConversationStore` are captured):

```ts
// WHY: IPC meta handlers go live before the store starts (main.ts boot order), so a
// tag/flag/note set in that window used to vanish while the handler still said ok:true
// — silent data loss (the 2026-07-19 incident class). Buffer until the store exists,
// flush in arrival order, and answer honestly if it never comes up.
type MetaWriteResult = { ok: boolean };
let storePhase: 'starting' | 'ready' | 'unavailable' = 'starting';
const pendingMetaWrites: Array<{ run: () => Promise<void>; resolve: (r: MetaWriteResult) => void }> = [];

async function metaWrite(run: () => Promise<void>): Promise<MetaWriteResult> {
  if (storePhase === 'ready') { try { await run(); return { ok: true }; } catch { return { ok: false }; } }
  if (storePhase === 'unavailable') return { ok: false };
  return new Promise((resolve) => pendingMetaWrites.push({ run, resolve }));
}
async function settlePendingMetaWrites(): Promise<void> {
  const drained = pendingMetaWrites.splice(0);
  for (const w of drained) {
    if (storePhase !== 'ready') { w.resolve({ ok: false }); continue; }
    try { await w.run(); w.resolve({ ok: true }); } catch { w.resolve({ ok: false }); }
  }
}
export function noteFlagChanged(id: string, flag: string, value: boolean): Promise<MetaWriteResult> {
  return metaWrite(() => store!.setFlag('claude', id, flag, value));
}
// noteSessionNote / noteTitleChanged: same shape over setNote / setTitle.
```

In `startConversationStore`: set `storePhase = 'ready'` right after `store = createConversationStore(root)` then `await settlePendingMetaWrites()`; in the early-return no-root path set `storePhase = 'unavailable'` and settle; `stopConversationStore` sets `storePhase = 'starting'` (restart re-buffers; app-quit pending writes are settled `ok:false` by a settle call there too).

- [ ] **Step 4: Make the IPC handlers honest** (`ipc-handlers.ts` SESSION_SET_FLAG/SET_TAG/SET_NOTE): `const res = await noteFlagChanged(...)`; on `!res.ok` return `{ ok:false, error: 'Could not save — conversation storage is not available on this device.' }` (specific + accurate: that IS the failure) **without broadcasting**; broadcast `SESSION_META_CHANGED` + return `{ok:true}` only after. Same in `remote-server.ts` `session:set-tag`/`set-note`, and add the missing `sessionIdMap` resolution + `canWriteStoreRecord` gate there (parity with the ipcMain path — design §12 survivor 1: any gate must cover both surfaces). The renderer revert paths already exist (`useSessionMeta` `ok:false` revert, ResumeBrowser optimistic revert) — no renderer change.

- [ ] **Step 5: Run** `npx vitest run tests/conversations-service.test.ts tests/session-meta-native-refusal.test.ts` — PASS (the refusal test still passes: native refusals unchanged until Task 5).
- [ ] **Step 6: Commit** `fix(conversations): buffer meta writes until the store starts; honest ok:false + no broadcast on dropped writes`

---

### Task 3: Provider threading through the store service (item 1, write plumbing)

Design D3: make the session-runtime parameter **required** so the compiler enumerates every call site; name it `sessionProvider` (§4.0). No behavior change for CC in this task — every existing caller passes `'claude'` explicitly; native callers arrive in Task 4.

**Files:**
- Modify: `desktop/src/main/conversations/store-core.ts` (`PortableModelRef`, `lastUsedModel` in parse + merge)
- Modify: `desktop/src/main/conversations/conversation-store.ts` (`lastUsedModel` in `toRecord` + `UpsertInput` + upsert)
- Modify: `desktop/src/main/conversations/service.ts` (thread `sessionProvider`; provider-aware paths; `noteModelUsed`)
- Modify: `desktop/src/main/conversations/reconciler.ts` (pass `'claude'` explicitly at `:115,182,188` — the reconciler scans `~/.claude/projects` and stays CC-only by definition)
- Modify: `desktop/src/main/harness/session-store.ts:10-12` (fix the misleading comment — the native slug is raw `cwdToProjectSlug`, which does NOT drive-normalize like `ccProjectSlug`; divergence is deliberate and pinned)
- Modify: `desktop/src/main/ipc-handlers.ts`, `desktop/src/main/remote-server.ts` (existing CC call sites gain the explicit `'claude'` argument)
- Test: `desktop/tests/conversation-store-core.test.ts`, `desktop/tests/conversations-service.test.ts`, `desktop/tests/session-store.test.ts`

**Interfaces (produced for Tasks 4-9):**
- `type PortableModelRef = { modelId: string; providerType: string; providerLabel: string }` (store-core.ts, exported)
- `ConversationRecord.lastUsedModel?: PortableModelRef`
- `noteSessionStarted(id, cwd, sessionProvider: SessionProvider)`; `noteTranscriptEvent(id, ev, sessionProvider)`; `noteFlagChanged(id, flag, value, sessionProvider)`; `noteSessionNote(id, note, sessionProvider)`; `noteTitleChanged(id, title, sessionProvider)`; `flushSessionToSpace(id)` and `materializeOne(id, cwd?)` read provider from ctx/record (no param needed — record is the truth).
- `localJsonlPath(cwd, id, sessionProvider)`: `'claude'` → `~/.claude/projects/<ccProjectSlug(cwd)>/<id>.jsonl`; `'native'` → `~/.youcoded/sessions/<cwdToProjectSlug(cwd)>/<id>.jsonl` (raw slug — matches where `NativeHome.sessionPath` actually writes).
- `spaceTranscriptPath(projectKey, id, sessionProvider)` → `<root>/<sessionProvider>/transcripts/<projectKey>/<id>.jsonl`.
- `noteModelUsed(sessionId, ref: PortableModelRef): void` — stashes on the session ctx AND, if a record already exists, upserts `lastUsedModel` immediately; otherwise it rides the next transcript upsert. **Never seeds a record by itself** (a model-only record would be exactly the §3.2 phantom shape: blank transcriptRef, EPOCH lastActive, synced everywhere).

- [ ] **Step 1: Failing store-core tests** (`conversation-store-core.test.ts` — pure objects, no mocks):

```ts
it('lastUsedModel survives parse and travels with the newer side on merge', () => {
  const older = rec({ lastActive: '2026-07-01T00:00:00Z', lastUsedModel: { modelId: 'a', providerType: 'openrouter', providerLabel: 'OpenRouter' } });
  const newer = rec({ lastActive: '2026-07-02T00:00:00Z' });          // no model → keeps older's
  expect(mergeRecords(older, newer).lastUsedModel?.modelId).toBe('a');
  const newer2 = rec({ lastActive: '2026-07-02T00:00:00Z', lastUsedModel: { modelId: 'b', providerType: 'local-engine', providerLabel: 'Local' } });
  expect(mergeRecords(older, newer2).lastUsedModel?.modelId).toBe('b'); // newer side wins
  expect(parseRecord(JSON.stringify(newer2))?.lastUsedModel?.modelId).toBe('b'); // whitelist parse keeps it
});
```

- [ ] **Step 2: Run** — FAIL (field stripped by whitelist parse).
- [ ] **Step 3: Implement the field in all four whitelist sites** (`parseRecord`, `toRecord`, `mergeRecords` — `lastUsedModel: newer.lastUsedModel ?? older.lastUsedModel` inside the newer-side composition — and `UpsertInput` + the upsert merge). Validate shape on parse (all three fields non-empty strings, else drop the field, never the record). WHY comment: portable by design — never persist the device-local providerId ULID.
- [ ] **Step 4: Thread `sessionProvider`.** Change the service signatures (Interfaces above); replace the ten hardcoded `'claude'`s (`service.ts:159,177,190,215,225,264,268,272,304,364`) with the threaded value where the site is per-session, keeping `'claude'` where the site is genuinely CC-only (the phantom-prune at `:159-177` targets mislabeled `claude/` records — keep, add WHY). The compiler now errors on every caller: fix `ipc-handlers.ts` (CC sites pass `'claude'`; the native `noteSessionStarted` at `:550` passes `'native'`) and `remote-server.ts`. The `sessions` ctx map gains `{ provider: SessionProvider, pendingModelRef?: PortableModelRef }`.
- [ ] **Step 5: `noteModelUsed`** per the Interface block; slug-divergence pin in `session-store.test.ts`:

```ts
it('encodes the deliberate slug divergence: native uses raw cwdToProjectSlug, CC layer drive-normalizes', () => {
  expect(cwdToProjectSlug('c:\\Users\\d\\proj')).toBe('c--Users-d-proj');
  expect(ccProjectSlug('c:\\Users\\d\\proj')).toBe('C--Users-d-proj');   // NOT equal — pinned
});
```

- [ ] **Step 6: Run the full desktop suite** `npm test` — PASS; every touched call site compiles with an explicit provider.
- [ ] **Step 7: Commit** `feat(conversations): required sessionProvider threading, provider-aware paths, portable lastUsedModel field`

---

### Task 4: Route native transcript events into the store + write `lastUsedModel` (item 1, the single load-bearing line)

**Files:**
- Modify: `desktop/src/main/ipc-handlers.ts:2033-2038` (native listener), `:549-560` (create/resume hooks), `NATIVE_SET_BINDING` handler
- Test: `desktop/tests/conversations-service.test.ts` (native upsert shape), a new integration case in `desktop/tests/native-session-host.test.ts` style if handler-level coverage is impractical

**Interfaces:**
- Consumes: Task 3's `noteTranscriptEvent(id, ev, 'native')`, `noteModelUsed`, `PortableModelRef`.
- Produces: native records at `<root>/native/<id>.json` with `provider:'native'`, `transcriptRef:'native/transcripts/<basename(cwd)>/<id>.jsonl'`, `lastUsedModel` set — the records Tasks 5-9 read.

- [ ] **Step 1: Failing service test** — `noteSessionStarted(id, cwd, 'native')` + a `turn-complete` event through `noteTranscriptEvent(id, ev, 'native')` upserts `provider:'native'` and the native transcriptRef lane, and includes the stashed `pendingModelRef`:

```ts
it('native turn-complete upserts a native-lane record carrying lastUsedModel', async () => {
  await startReadyStore();
  noteSessionStarted('nat-1', '/home/d/proj', 'native');
  noteModelUsed('nat-1', { modelId: 'qwen-3', providerType: 'local-engine', providerLabel: 'Local models (llama.cpp)' });
  noteTranscriptEvent('nat-1', { type: 'turn-complete', sessionId: 'nat-1', timestamp: Date.now() } as any, 'native');
  const up = h.store.upsert.mock.calls.at(-1)![0];
  expect(up.provider).toBe('native');
  expect(up.transcriptRef).toBe('native/transcripts/proj/nat-1.jsonl');
  expect(up.lastUsedModel?.modelId).toBe('qwen-3');
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement:** `noteTranscriptEvent`'s `upsertNow` uses the threaded provider for the record + transcriptRef lane and folds `ctx.pendingModelRef` in; the turn-complete branch's `mirrorIn` uses `localJsonlPath(ctx.cwd, id, provider)`. Replicate the `pendingActivity` debounce-clear per key (ordering hazard: a stale 5s timer must not re-order an older upsert after a turn-complete — same rule as CC).
- [ ] **Step 4: Wire the native listener** (`ipc-handlers.ts:2033-2038`): add `noteTranscriptEvent(event.sessionId, event, 'native')` — native ids are identity-mapped (`:549`), no `sessionIdMap` lookup. Add a `resolvePortableModel(sessionId): PortableModelRef | null` helper (binding via `nativeHost.getBinding` → `providerRegistry.list()` row → `{modelId, type, label}`; null when unresolvable) and call `noteModelUsed` at: native create success, `NATIVE_SET_BINDING` success, and on each `turn-complete` in the listener (model may have changed mid-session). WHY comment at the listener: "this is the single line that makes native conversations exist in the store (design §5); Task 3 made it correct rather than mislabeling."
- [ ] **Step 5: Run** the service + host suites; also `pruneNativePhantomRecords` regression: it lists `'claude'` only — assert (existing test or new) that legit `native/` records are untouched.
- [ ] **Step 6: Commit** `feat(native): route transcript events into the conversation store with provider + portable lastUsedModel`

---

### Task 5: Read-side unlock + retire the 2026-07-19 meta-refusal stopgap (item 2)

Only legal now that native writes are real (Task 4). Retiring the refusal without that reintroduces the silent-loss bug via `canWriteStoreRecord`'s native-false branch (`ok:true` + broadcast + no write).

**Files:**
- Modify: `desktop/src/main/ipc-handlers.ts` — get-meta (`:2603-2624`) provider-aware; browse (`:1400-1432`) enrichment; delete `nativeMetaRefusal` (`:2461-2471`) + its three uses; delete `canWriteStoreRecord`'s native-false branch (`:2447`) keeping its CC live-before-mapping gate
- Modify: `desktop/src/main/remote-server.ts` — get-meta (`:948-954`) provider-aware; delete `isNativeMetaTarget` (`:148-152`) + refusals (`:924,936,948`); browse (`:738-742`) gains native rows (same enriched path)
- Modify: `desktop/src/main/session-browser.ts` — `listPastSessions(activeIds, nativeEntries?)`: native entries join the store overlay (`store.list('native')`) and produce store-only native rows (`missingProject`/`notSyncedYet` analogues; the `notSyncedYet` probe checks the NATIVE local path, not the CC one)
- Modify: `desktop/src/shared/types.ts` — keep `SessionMetaResult` + `supported`/`unsupportedReason` (Android still answers `supported:false`); rename `NATIVE_META_UNSUPPORTED` → `META_UNSUPPORTED_FALLBACK` with host-neutral wording (the renderer's fallback when a host says unsupported without a reason — never claims a cause)
- Modify: `ResumeBrowser.tsx` (drop `metaDisabled`, `:478,549-565`), `useSessionMeta.ts` (drop `noteRefusal`'s native plumbing, KEEP `ok:false` revert), `CloseSessionPrompt.tsx` (keep `metaLoaded` gate — the baseline-before-delta race is real regardless of provider)
- **Do NOT touch** `SessionService.kt` — its stubs and wording survive (design §12).
- Test: delete `desktop/tests/session-meta-native-refusal.test.ts`; create `desktop/tests/session-meta-parity.test.ts`

**Interfaces:**
- Consumes: Task 4's native records; Task 2's honest write results.
- Produces: get-meta/browse that Tasks 6-9 read; `listPastSessions(activeIds, nativeEntries?)` signature used by both browse surfaces.

- [ ] **Step 1: Write the round-trip parity test first** (`session-meta-parity.test.ts`) — the design's acceptance is a ROUND TRIP, because a write-only test passes against all three read locks:

```ts
it('tag → persist → get-meta and browse both return it for a native session', async () => {
  // real ConversationStore in a tmpdir; fake nativeHost with one listed session
  await setFlagHandler(nativeId, 'tag:physics', true);          // returns {ok:true} AFTER persist
  const meta = await getMetaHandler(nativeId);
  expect(meta).toMatchObject({ tags: ['physics'], supported: true });
  const rows = await browseHandler();
  expect(rows.find(r => r.sessionId === nativeId)?.tags).toEqual(['physics']);
});
it('broadcast fires only after the record is readable', async () => { /* subscribe, then read-inside-listener */ });
it('CC live-before-mapping still writes (regression from the old refusal test)', async () => { ... });
it('unknown flag still rejected before any provider logic', async () => { ... });
```

- [ ] **Step 2: Run** — FAIL (native get-meta short-circuits `supported:false`; browse rows bare).
- [ ] **Step 3: Unlock get-meta** (both surfaces): `const sessionProvider = nativeHost.isNativeSessionId(resolved) ? 'native' : 'claude'; const rec = await store.get(sessionProvider, resolved);` — delete the native short-circuit. **Step 4: Unlock browse:** move native-row construction into `listPastSessions(activeIds, nativeEntries)` so the store overlay loop enriches native rows (flags/tags/note/device/title — store title wins over header/derived title per the existing precedence at `:411`) and store-only native rows appear with `missingProject`/`notSyncedYet` (probe `~/.youcoded/sessions/<cwdToProjectSlug(local)>/<id>.jsonl`); both `ipc-handlers.ts:1400` and `remote-server.ts:738` call it with `nativeHost.list()` — remote browse gains native rows for the first time (remote web client is in scope, program §9). Keep the Bug-1 live-session exclusion keyed off the identity mapping (a live native session offered for resume would spawn a second writer on one JSONL).
- [ ] **Step 5: Retire the stopgap** per the File list — and re-run `session-meta-parity.test.ts` + renderer tests. The `useSessionMeta` revert-on-`ok:false` now pairs with Task 2's honest results (that is the whole safety story: refusals gone, honesty stays).
- [ ] **Step 6: Full suite + commit** `feat(native): unlock session meta reads; retire the 2026-07-19 native meta refusal (parity round-trip pinned)`

---

### Task 6: Resume picker + `lastUsedModel` (item 3)

Destin's ruling, verbatim constraint set: native resume ALWAYS offers the provider-scoped model selector, on any device; pre-filled from `lastUsedModel` when it matches a locally-available model; selection becomes the binding; never auto-launch; no local match ⇒ un-prefilled, never an error, never a substitute.

**Files:**
- Create: `desktop/src/renderer/components/NativeModelSelect.tsx` — extraction of ModelPickerPopup's native branch data flow (`providers.catalog()` + `providers.list()` → group by provider label, `ModelPickerPopup.tsx:176-196,266-304`); props `{ prefill?: PortableModelRef; onSelect(binding: ModelBinding, portable: PortableModelRef): void }`; reuses its empty-state copy ("No models available. Add a provider key in Settings → Providers.")
- Modify: `desktop/src/shared/types.ts` — `PastSession.lastUsedModel?: PortableModelRef`
- Modify: `desktop/src/main/session-browser.ts` — native rows carry `lastUsedModel` from the store record (never a ULID; assert in test)
- Modify: `desktop/src/renderer/components/ResumeBrowser.tsx:486-534` — replace the static "Resumes with this conversation's saved model." line with `<NativeModelSelect prefill={s.lastUsedModel}>`; Resume button disabled until a selection exists; selection passed through `onResume` as a new 8th arg `nativeBinding?: ModelBinding`
- Modify: `desktop/src/renderer/App.tsx:2181,2231` — `handleResumeSession(..., nativeBinding?)`; native branch passes `binding: nativeBinding` in `session.create` opts; **without** a binding it does not create — it opens the Task 9 pre-resume picker modal (shared component)
- Modify: `desktop/src/main/harness/native-session-host.ts:327-366` — `resume(sessionId, cwd, bindingOverride?: ModelBinding)`: `binding: bindingOverride ?? header.binding` at HarnessSession construction. **Ordering (verified hazard):** the override must be applied inside `resume()` — a post-resume `setBinding` races the eager `loadModel` at `ipc-handlers.ts:582-583`, which would load the header's (possibly absent) model.
- Modify: `desktop/src/main/ipc-handlers.ts:499-530` — native resume passes `opts.binding` as the override; on success, `noteModelUsed` with the resolved portable ref
- Test: `desktop/tests/native-session-host.test.ts` (override case), `desktop/tests/session-browser.test.ts` (portable field, no ULID), new `desktop/tests/resume-browser-native-picker.test.tsx` (jsdom: selector renders for native rows; prefill match; prefill miss ⇒ un-prefilled + Resume disabled until pick)

**Interfaces:**
- Consumes: `PortableModelRef` (Task 3), enriched browse rows (Task 5), `ModelBinding {providerId, modelId}` (`provider-types.ts:20`).
- Produces: `NativeModelSelect` (reused by Task 9's MovedGate modal); `resume(id, cwd, bindingOverride?)`.

- [ ] **Step 1: Failing host test** — resume with `bindingOverride` constructs the session on the override and `modelForSession` returns it (so the eager load loads the right model):

```ts
it('resume applies a binding override before anything reads the model', async () => {
  await host.create({ ...opts, binding: { providerId: 'ulid-A', modelId: 'model-A' } });
  await host.destroy(id);
  await host.resume(id, cwd, { providerId: 'local', modelId: 'model-B' });
  expect(host.modelForSession(id)).toBe('model-B');
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** host + handler + browse field. **Step 4: Renderer** — `NativeModelSelect` + ResumeBrowser wiring; prefill matching = `modelId` equality within providers whose `ProviderStatus.type === prefill.providerType` (catalog rows carry only the ULID `providerId`, so join through `providers.list()`). **Step 5: jsdom tests run.** Follow the ModelPickerPopup ack discipline (`:281-303`): never show success until the create/resume actually acks.
- [ ] **Step 6: Full suite + commit** `feat(native): resume always offers the model selector, pre-filled from synced lastUsedModel; selection becomes the binding`

---

### Task 7: Native auto-titles (item 5)

CC titles: Auto-Title hook → `~/.claude/topics` → inline topic-watcher (`ipc-handlers.ts:2217-2302`) → `noteTitleChanged`. Native gets its own feeder. **Verified constraints:** Plan C's capability registry is NOT on master — there is no floor to gate on; ship floor-less with a hook comment for M6. There is no bare-generate precedent — use `generateText({ model: await providerRegistry.languageModel(binding), ... })`, never through `HarnessSession.send()` (re-entrancy hard-throw). Titles must NOT touch the session JSONL (single-writer; header never rewritten) — they land in the conversation store + the live session name.

**Files:**
- Create: `desktop/src/main/native-title-feeder.ts`
- Modify: `desktop/src/main/ipc-handlers.ts` — wire feeder to the native `transcript-event` listener; on title: `broadcastRename`-equivalent (mutate `session.name`, fan out `WINDOW_DIRECTORY_UPDATED`, `noteTitleChanged(id, title, 'native')` — both halves or the Resume Browser and the live pill disagree)
- Modify: `desktop/src/main/conversations/service.ts:260-262` — update the "topic-watcher is setTitle's only caller" comment (now: topic-watcher for CC, title feeder for native)
- Test: `desktop/tests/native-title-feeder.test.ts` (new)

**Interfaces:**
- Produces: `createNativeTitleFeeder(deps: { generate: (binding: ModelBinding, prompt: string) => Promise<string>; getBinding(id): ModelBinding | null; hasTitle(id): Promise<boolean>; onTitle(id, title): Promise<void> })` returning `{ noteEvent(ev: TranscriptEvent): void }` — pure logic, injected effects, every dep a `vi.fn` that can reject (#177).

- [ ] **Step 1: Failing tests:**

```ts
it('generates once at first turn-complete using the first user message', async () => { ... });
it('never fires for a session that already has a title', async () => { ... });
it('a rejecting generate skips silently and retries on the NEXT turn-complete (max 3)', async () => { ... });
it('sanitizes: strips quotes/newlines, caps at 60 chars, drops empty results', async () => { ... });
it('never titles when the binding is unresolvable (getBinding null) — honest skip, no error event', async () => { ... });
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** the feeder: track per-session `{ firstUserText?, attempts, done }`; capture `user-message` text; on `turn-complete`, if `!done && attempts < 3 && !(await hasTitle(id))`, call `generate(binding, prompt)` with prompt `Reply with only a short 3-6 word title for this conversation. No quotes, no punctuation at the end.\n\nFirst message: <first 500 chars>`; 15s `AbortSignal.timeout` race (a bare await would hang the feeder — same class as the compaction-hang rule); sanitize; `onTitle`. Failure → increment attempts, stay silent (honest default: title arrives later or never). `// M6 hook: once capability tiers exist, skip below the floor instead of attempting.`
- [ ] **Step 4: Wire in ipc-handlers** — `generate` uses `generateText` over `providerRegistry.languageModel(binding)`; `hasTitle` checks the store record title, falling back to the live session name; `onTitle` does the rename fan-out + store write. Feeder cleanup on session destroy.
- [ ] **Step 5: Run + commit** `feat(native): auto-title native sessions at first turn end via the bound model`

---

### Task 8: Native flush / materialize / mirror branches (item 4, data half)

**Files:**
- Modify: `desktop/src/main/conversations/service.ts` — `flushSessionToSpace` (`:415-430`) + `materializeOne` (`:362-389`) + `materializeSweep` (`:298-335`) go provider-aware end-to-end: source/dest from `localJsonlPath(cwd, id, provider)`, lane from `spaceTranscriptPath(key, id, provider)`; **keep the `sessions.has(rec.id)` live-session guard for native with its own WHY comment** (verified: native has no long-lived fd — the CC inode-detach rationale does not apply; instead a mid-session materializeOut would silently redirect subsequent appends into the materialized file, interleaving space content with live appends — same guard, different failure mode, design §5)
- Lane assertion: a record's `transcriptRef` must start with `\<record.provider>/` — refuse (warn + skip) on mismatch; **never cross-materialize** (D5)
- Test: `desktop/tests/conversations-service.test.ts` + `desktop/tests/transcript-mirror.test.ts`

**Interfaces:**
- Consumes: Task 3 paths, Task 4 records. Produces: the flush/materialize surface Task 9's takeover drives.

- [ ] **Step 1: Failing tests:**

```ts
it('flushes a native session from ~/.youcoded/sessions into the native/ space lane', async () => { ... });
it('flush against a MISSING local source discards {copied:false} and pushes nothing (observable: mirrorIn returned copied:false and syncNow still ran — honest no-op, no throw)', async () => { ... });
it('materializeOne refuses a claude/ transcriptRef on a native record (lane mismatch)', async () => { ... });
it('materialize sweep skips a LIVE native session (guard kept for the append-redirect reason)', async () => { ... });
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (mechanical given Task 3; `transcript-mirror.ts` itself is unchanged — §11.3 verified its size-comparison assumptions hold *more* strictly for native: append-only single-writer, one append per message, `shrunk` branch dead). **No sync-engine changes:** the flush keeps riding `syncSpacesSyncNowAwaited('personal', 15_000)`; the engine's evidence gating (`engine.ts:135-160`) is inherited, not bypassed — a native flush must never emit its own `synced`.
- [ ] **Step 4: Run + commit** `feat(native): transcripts mirror into the native/ space lane; provider-aware materialize with lane containment`

---

### Task 9: Takeover + lease re-enable + moved flow (item 4, control half)

**Files:**
- Modify: `desktop/src/main/harness/native-session-host.ts` — new `quiesce(sessionId): Promise<void>`
- Modify: `desktop/src/main/conversations/takeover.ts` — provider-aware holder quiesce via injected deps
- Modify: `desktop/src/main/ipc-handlers.ts` — re-enable the native lease acquire (`:549-575`); pushMoved payload gains `provider` (`:1925-1945`); native resume cwd resolution + refusal + error split (`:499-530`, `:521`); wire `quiesceNative`
- Modify: `desktop/src/renderer/App.tsx` — `MovedInfo` gains `provider` (`:262`); MovedGate passes it (`:2757`); native moved-resume opens the model-picker modal (reuses `NativeModelSelect`) — the requester's post-takeover resume lands in the Task 6 picker, never auto-launches
- Test: `desktop/tests/native-session-host.test.ts` (quiesce), `desktop/tests/holder-takeover.test.ts` (+ real-native flow), `desktop/tests/requester-takeover.test.ts`

**Interfaces:**
- Consumes: Tasks 4/6/8. Produces: `NativeSessionHost.quiesce`; `HolderTakeoverDeps.quiesceNative: (desktopId: string) => Promise<void>` + `getProvider: (desktopId: string) => string | undefined`.

**The newly-surfaced ordering hazard this task owns (not in the design doc):** `interrupt` aborts the current turn only — the M1 queue then drains, so a queued message would start a NEW turn after the quiesce and append past the flush. And `send()`'s one-macrotask `setImmediate` defer means an interrupt in the same tick as a send misses it. `quiesce` therefore: (1) clears the queue FIRST, (2) awaits one macrotask, (3) `broker.cancelSession` + `session.interrupt()`, (4) awaits the in-flight turn settle and the append chain (`drain`). After `quiesce` resolves, no further appends occur until a new send — that is the invariant the takeover flush depends on, and the test pins it.

- [ ] **Step 1: Failing quiesce test** (real host, real store in tmpdir, `delayedFactory` mid-stream — `native-session-host.test.ts:42-55` pattern; assert on real `append` calls via spy, never map state):

```ts
it('quiesce clears the queue, aborts mid-stream, and no appends occur after it resolves', async () => {
  // start a slow turn, queue a second message (send → 'queued'), then:
  await host.quiesce(id);
  const appendsAtQuiesce = appendSpy.mock.calls.length;
  await new Promise(r => setTimeout(r, 60));                 // queue would have drained by now
  expect(appendSpy.mock.calls.length).toBe(appendsAtQuiesce); // queued-survivor never ran
});
it('quiesce catches a same-tick send (setImmediate defer)', async () => { ... });
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement `quiesce`** per the ordering above (WHY comment citing the pinned interrupt-vs-queue semantics — this is deliberately STRONGER than interrupt, only for takeover/teardown).
- [ ] **Step 4: takeover.ts** — holder step 3 branches: `deps.getProvider(desktopId) === 'native' ? await deps.quiesceNative(desktopId) : deps.sessionManager.sendInput(desktopId, '\x1b')`. **Make the fakes express failure first** (design §7): the `sendInput` fake becomes provider-aware and returns `false` for native ids — the existing suite must FAIL on the old code path (proving it certified the no-op), then pass with the branch. Keep flush/release outside the per-holder loop; ordering pins stay (interrupt-all → flush → release → pushMoved → destroyNative → destroySession).
- [ ] **Step 5: Real-native holder flow** in `holder-takeover.test.ts`: real `NativeSessionHost` + tmpdir store + delayed turn; run the takeover; assert appends stopped before `flushSessionToSpace` was invoked, the flush saw the final bytes, and no second writer appears afterward.
- [ ] **Step 6: Lease re-enable** — in the native create/resume branch: `void leaseWiring?.client.acquire(info.id).catch(() => {});` replacing the reverted block; rewrite the comment: the lease is meaningful now because the transcript is shared (Tasks 4/8). Never-block rule stays: lease failure warns, never prevents the session.
- [ ] **Step 7: Moved flow** — `pushMoved` payload gains `provider` (from `sessionManager.getSession(desktopId)?.provider`); `MovedInfo` + MovedGate pass it (`handleResumeSession(claudeSessionId, projectSlug, projectPath, undefined, undefined, undefined, provider)`); the App native branch without a binding opens the `NativeModelSelect` modal (Task 6's shared path). Requester `materializeOne` is provider-aware already (Task 8).
- [ ] **Step 8: Native cwd resolution + refusal + error split** — in the `SESSION_CREATE` native resume path, BEFORE `session-manager`'s silent `cwd → homedir()` rewrite can matter: if `opts.cwd` doesn't exist locally, look up the store record (`native`, id) and resolve by `projectName` basename against known local project folders (analogue of `resolveLocalProject`); if the transcript still can't be located, **refuse** with split, accurate messages: transcript absent but record says it synced → `"This conversation hasn't synced to this device yet — its transcript isn't here."`; project folder absent → `"This conversation's project folder ('<name>') isn't on this device."`; genuinely no record/file anywhere → keep the current missing-data wording. Never resolve to `$HOME` silently (that class caused the `bea0de3e`/`57be5e14` dogfood bugs for CC).
- [ ] **Step 9: Full suite + commit** `feat(native): real takeover quiesce, native lease re-enabled, provider-aware moved flow with picker resume`

---

### Task 10: Docs, four-surface parity sweep, whole-branch review, PR

**Files:**
- Modify (youcoded): `desktop/tests/ipc-channels.test.ts` — no new channels are added by this plan (resume rides `session:create`, meta rides existing channels), but the touched families get their describes re-verified; if any task added a channel after all, it lands on all four surfaces + remote-server + a describe. `SessionService.kt`: stub strings only if a channel was added; its `session:browse` JSON builder gains `lastUsedModel` passthrough so the field isn't desktop-only (stub-level change, allowed by the milestone rule).
- Modify (workspace `youcoded-dev`): `.claude/rules/native-runtime.md` (native sessions now participate in store/sync; quiesce contract; lastUsedModel portability rule), `.claude/rules/conversations.md` (provider threading, native lane, containment guard, meta-write buffer), `.claude/rules/sync-spaces.md` (native lane note), `docs/MAP.md`, lazy docs (`youcoded/docs/sync-spaces.md`, conversations/native depth docs). Update `verify:` anchors so `/audit` stays green.
- Archive the plan + handoff to `docs/archive/`, flip the program §3 status and any ROADMAP residue **in the same session as the merge**.

- [ ] **Step 1:** Full verification: `cd youcoded/desktop && npm ci && npm test && npm run build`.
- [ ] **Step 2:** Rule/doc/MAP updates (same PR — program §9 exit criterion b).
- [ ] **Step 3:** Whole-branch review on the most capable model (superpowers:requesting-code-review), with explicit reviewer attention on EVENT ORDERING (broadcast-after-persist, quiesce-before-flush, override-before-eager-load, buffer flush order).
- [ ] **Step 4:** Dogfood pass — desktop renderer AND remote web client (browse/meta/resume surfaces bridge the shim; native rows must now appear on remote browse).
- [ ] **Step 5:** PR with a checklist that flags for Destin the interactive verifications (two dev instances: takeover quiesce, cross-device resume landing in the picker, moved-pill flow) — his eyeball, not a CDP rig.

---

## Self-Review (done at write time)

- **Spec coverage:** program §3 items 1→Tasks 3-4, 2→Task 5, 3→Task 6, 4→Tasks 8-9, 5→Task 7, 6→Task 2; design §4.1.4 containment→Task 1; §4.0 naming→Task 3; §4.2 slug divergence→Task 3 pin; §5 guard-different-why→Task 8; §6.1 moved payload→Task 9; §6.2 cwd resolution→Task 9; §6.3 error split→Task 9; §6.4 round-trip acceptance→Task 5; §6.5 native teardown→Task 9; §12 retirement table→Task 5 (Android survivors respected); §7 test list→Tasks 1,5,8,9 (provider-aware sendInput fake, missing-source flush, slug divergence, containment).
- **Ordering reasoning (M1 lesson):** enumerated per task — boot-window buffer order (T2), broadcast-after-persist (T2/T5), debounce-clear (T4), no-phantom-record-from-noteModelUsed (T3/T4), override-before-eager-load (T6), title-never-touches-JSONL (T7), quiesce-clears-queue-first + same-tick send (T9), flush-before-release / release-before-destroy (T9 pins kept).
- **Known deviations from the design doc, deliberate:** `NATIVE_META_UNSUPPORTED` is renamed-not-deleted (renderer fallback string Android still exercises — verified 2026-07-22); reconciler stays CC-only (it scans `~/.claude/projects`); `lastUsedModel` writes never seed a record (avoids re-creating the §3.2 phantom shape the design itself documents).
