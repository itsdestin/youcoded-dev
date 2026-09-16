---
date: 2026-09-16
status: active
type: plan
topic: Batch A (the app shell stops redrawing per streamed word; per-word work stops growing with the chat) and Batch C (the main process stops blocking on whole-file reads and git on click paths) — each fix pinned by a count or a source scan, no visible change
---

# Smoothness Batches A + C — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task by task. Steps use `- [ ]`. Read `.claude/rules/react-renderer.md`, `.claude/rules/chat-reducer.md`, `.claude/rules/native-runtime.md`, `.claude/rules/harness-tools.md`, `.claude/rules/test-suite-hygiene.md` before the first edit.

**Goal:** remove the verified per-token renderer costs and the verified main-thread blocking reads found by the 2026-09-16 sweep (`docs/active/investigations/2026-09-16-smoothness-sweep.md` §2, Batches A and C), with nothing on screen changing.

**Architecture:** Batch A replaces three whole-state subscriptions at the app root with cached selectors, gives two layout effects their missing dependency lists, stops the reducer copying structures that grow with the conversation, and lets the transcript batcher notify subscribers once per frame instead of once per action. Batch C moves the remaining click-path and per-turn disk reads in the main process onto `fs.promises`, adds an incremental transcript reader for the per-turn accepted-history publish, precomputes the git snapshot asynchronously, and bounds the Home-folder watcher.

**Tech stack:** React 19 renderer (`useSyncExternalStore` selectors), Electron main (`fs.promises`, `child_process.execFile`), vitest (`npx vitest run tests/<file>` from `youcoded/desktop`), `bash scripts/verify.sh <worktree>`, perf rig `bash scripts/perf-lab/bg-run.sh`.

**Session:** `perf-smoothness-20260916`. App worktree: `/home/destin/youcoded-dev/worktrees/sessions/perf-smoothness-20260916/youcoded` (at `d5bc5b35`, master of 2026-09-16). Workspace worktree: `/home/destin/youcoded-dev/worktrees/sessions/perf-smoothness-20260916`.

## Re-verification (2026-09-16, against master `d5bc5b35`)

Every A and C finding was re-read in the code by this session and stands. Two things changed or matter:

- **PR #476 `session/onedrive-no-auto-download` (WIP, "paused, known regressions", last commit 2026-09-15)** rewrites `prompt-assembly.ts` to drop the git snapshot entirely (`'Git: not checked automatically'`) and rewrites `project-watcher.ts`'s nested-repo probe as a precomputed async walk capped at 4,000 directories. Neither is merged. C3 and C9 below are written so they do not depend on it: C3 keeps the git line the model gets today and only moves the shell-out off the main thread; C9 caps only the Home-folder root and touches one line of `watchProject`. If #476 lands later, its author resolves two small conflicts and can delete C3's precompute.
- **`conversations/conversation-store.ts` is still owned by `session/sync-safety-audit-20260908`** (118-line rewrite committed 2026-09-11, unmerged). Its per-record `readdirSync` heal (sweep C7) is **deferred again**, same as the 2026-09-10 plan did. The chatsearch full re-index on star/rename (also C7) is deferred with it — it is 3 s debounced and rides a user action, not a click path. Both go to `docs/roadmap/chat-data.md` in the close-out.
- **`useSessionAttention.ts` and `ToolBody.tsx` are touched by `session/helper-approval-wait`** (3 lines and 2 hunks, in `AgentSections`). A6 edits `ToolBody`'s dispatcher (line ~1126), a different region. A4 does not edit `useSessionAttention`.
- C10 (30-minute reconcile, sub-agent watcher timers) is **out of this plan**; filed in the close-out.

## Global constraints

- **Zero visible change.** Every task's acceptance includes "nothing on screen differs". A missed status-bar refresh, a lost live-refresh of an open file, a tool card that stops updating, a prompt the model no longer receives, all count as visible.
- **WHY comment at every non-trivial edit.**
- **Never touch the running built app.** Runtime checks use `bash scripts/run-dev.sh --label "<task>"` from the app worktree, announced before launch, killed by pid after.
- **Preserve ordering guarantees.** Async conversion is only safe where the next step does not depend on the write having landed, or where the caller now awaits it. Each task names them.
- **Purity of the chat reducer** is kept everywhere except A3's one documented exception (append-only dedup set), whose safety argument is in the task.
- Two app branches, one per batch: `perf/shell-redraw-per-token` (A) and `perf/main-thread-click-paths` (C). Stage by explicit path. Push each branch once it has a commit.
- `bash scripts/verify.sh <app worktree>` before calling either branch done.
- Rig gate: `bash scripts/perf-lab/bg-run.sh --only workload --checkout <app worktree> --label <name>` against a fresh master baseline taken the same hour (`docs/roadmap/dev-workspace.md` records that load skew fakes 16–20 % swings). Batch A's expected movement: `workload` long-task total and frame gaps down; Batch C: flat (no phase opens the paths it fixes), so C is accepted on its guards and counts, like the file-pane branch was.

## Self-review for unintended consequences (done before writing tasks)

| Change | Risk found | How the task handles it |
|---|---|---|
| A1 selectors replace `useChatState` at the root | `useSessionTasks` is the SINGLE instance shared by chip and popup (App.tsx:455 comment); a second instance would fork localStorage state | The hook keeps its signature and call site; only its internal subscription changes |
| A1 trust gate selector | A trust prompt arriving must still flip the gate the same frame it lands | `getSnapshot` re-derives when `timeline` identity changes; a prompt entry always creates a new timeline array |
| A2 dependency lists on layout effects | The font read exists so a theme that swaps the font re-measures; `--dur-reveal` changes with theme and Reduced Effects | Deps are the theme id and Reduced Effects flag plus "a pill exists"; a source-scan guard pins the deps |
| A3 in-place `seenUuids.add` | Reducer purity: an old state object would "see" later uuids | Nothing renders `seenUuids`; the store only ever applies the reducer to its latest state; the page-replay scratch (`chat-reducer.ts:2720`) copies the set FIRST so scratch mutations cannot leak into the live set; serialisation snapshots with `Array.from`. Every mutation site is on a path that commits the new session object |
| A3 `getOrCreateTurn` early return | Callers may mutate the returned Map | Verified: every caller does `assistantTurns.set(...)` on the returned Map. The early-return path therefore must still return a COPY when the caller will mutate — so the task returns the ORIGINAL Map only from the early path AND audits each caller to copy before set. Simpler and safer: keep the copy but move it below the early return, returning `session.assistantTurns` unchanged from the early path, and change the two per-token callers (`TRANSCRIPT_ASSISTANT_TEXT`, reasoning) to copy the ONE turn they touch via `new Map(assistantTurns).set(id, …)` — which they already do |
| A4 `dispatchMany` | A subscriber that relied on being notified between two actions of one batch | Searched all 12 `subscribeAll` sites: every one re-reads the whole store on notify; none depends on intermediate states. `flush()` still applies actions in order; only notification is deferred to the end of the batch |
| A4 `useSubmitConfirmation` skip | A pending bubble whose session's timeline identity is unchanged | A pending flag change always produces a new timeline array (the reducer spreads), so identity is a sound change detector |
| A6 `ToolBody` narrowing | `TaskUpdate` cards must still update when tasks change | The child subscribes to `toolCalls` identity, which changes on every tool event; text deltas do not touch it |
| C1 incremental transcript reader | Digest must equal the digest of the whole file, or restore refuses | The cache advances its hash only through the last newline; the returned digest hashes the full bytes read (prefix state copied via `Hash.copy()` plus the tail); a shrunk file, a duplicate uuid, or a parse failure drops the cache and re-reads in full |
| C2 async history page | Tests call `getHistory` synchronously in eight files | Sync methods stay; async twins are added and only the IPC handlers switch |
| C3 precomputed git snapshot | Byte-stability of the assembled prompt; the evaluator calls `assembleSystemPrompt` without a host | The async function returns the identical string; when `gitSnapshot` is absent the sync path runs as today; a guard pins that the host always passes it |
| C4 async Edit/Write | Two parallel tool calls on the same file could both pass the fingerprint check | A per-path async lock around read-check-write in Edit and Write |
| C5 async status data | Two overlapping builds could send out of order | Single-flight with a rerun flag; a caller that wants "now" awaits the in-flight build |
| C5 topic poll upgrade to `fs.watch` | The interval must be cleared exactly once and the watcher registered in the same map | `teardownSessionWatchers` already discriminates by `close` presence; the upgrade swaps the map entry atomically |
| C6 async Resume list | Callers in remote-server are sync today | Only the two await-capable sites switch; the sync `list()` stays for the rest |
| C8 send changes only to subscribed windows | A window with the file open but no watcher subscription would miss a refresh | Verified: the viewer, the git footer and the Files tab all live inside surfaces that call `useProjectWatch`; APPEND_VERSION (agent edits) broadcasts separately and is untouched. A test pins "subscribed window gets it, unsubscribed does not" |
| C9 Home depth cap | A user who genuinely browses `~/Documents/x/y/z` in the Files tab loses live refresh below depth 2 | Only live refresh, never the listing (discovery has its own caps); the trade is recorded in the roadmap line it closes |

---

# Batch A — branch `perf/shell-redraw-per-token`

### Task A1: three root subscriptions become cached selectors

**Files:**
- Modify: `desktop/src/renderer/state/chat-context.ts` (add two selectors after `useChatState`)
- Modify: `desktop/src/renderer/hooks/useSessionTasks.ts:45`
- Modify: `desktop/src/renderer/components/TrustGate.tsx:110-114`
- Modify: `desktop/src/renderer/App.tsx:3444-3445`
- Test: new `desktop/tests/root-selectors-skip-token-rerenders.test.tsx`

**Interfaces produced:**
- `useSessionToolCalls(sessionId: string): Map<string, ToolCallState>` — re-renders only when the session's `toolCalls` Map identity changes.
- `useSessionIsThinking(sessionId: string): boolean`.

- [ ] **Step 1: failing test** — `desktop/tests/root-selectors-skip-token-rerenders.test.tsx` (pattern: `tests/session-drawer-skips-parent-rerenders.test.tsx`):

```tsx
import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ChatProvider, useChatStore } from '../src/renderer/state/chat-context';
import { useSessionTasks } from '../src/renderer/hooks/useSessionTasks';
import { useTrustGateActive } from '../src/renderer/components/TrustGate';
import { useSessionIsThinking } from '../src/renderer/state/chat-context';

const SID = 's1';
let renders = 0;
function Probe() {
  renders++;
  useSessionTasks(SID);
  useTrustGateActive(SID);
  useSessionIsThinking(SID);
  return null;
}
function Harness({ onStore }: { onStore: (s: ReturnType<typeof useChatStore>) => void }) {
  onStore(useChatStore());
  return <Probe />;
}

describe('root selectors ignore streamed text', () => {
  it('40 text deltas cause 0 re-renders of a component using all three hooks', () => {
    let store!: ReturnType<typeof useChatStore>;
    render(<ChatProvider><Harness onStore={(s) => { store = s; }} /></ChatProvider>);
    act(() => { store.dispatch({ type: 'SESSION_INIT', sessionId: SID }); store.dispatch({ type: 'TRANSCRIPT_TURN_START', sessionId: SID } as any); });
    const before = renders;
    act(() => {
      for (let i = 0; i < 40; i++) store.dispatch({ type: 'TRANSCRIPT_ASSISTANT_TEXT', sessionId: SID, text: 'w ', uuid: `u${i}` } as any);
    });
    expect(renders - before).toBe(0);
  });
  it('a tool event still re-renders (toolCalls changed)', () => { /* dispatch TRANSCRIPT_TOOL_USE; expect renders to grow by 1 */ });
  it('isThinking flips still re-render', () => { /* dispatch TRANSCRIPT_TURN_COMPLETE; expect +1 */ });
});
```
Check the exact action shapes in `tests/chat-reducer.test.ts` (search `TRANSCRIPT_ASSISTANT_TEXT`) and copy them; the `as any` casts go once the shapes are right.

- [ ] **Step 2: run, expect FAIL** — `npx vitest run tests/root-selectors-skip-token-rerenders.test.tsx` → the first case fails with 40 re-renders.

- [ ] **Step 3: selectors** — in `chat-context.ts` after `useChatState`:

```ts
// WHY (2026-09-16 smoothness sweep A1): AppInner read the streaming session's
// WHOLE state three times to learn two booleans and one Map, so every streamed
// word re-rendered the entire shell. These return a primitive or a Map whose
// identity the reducer preserves across text deltas, so useSyncExternalStore
// skips the render unless the value actually changed.
export function useSessionToolCalls(sessionId: string): Map<string, ToolCallState> {
  const store = useStore();
  const subscribe = useCallback((cb: () => void) => store.subscribeSession(sessionId, cb), [store, sessionId]);
  const getSnapshot = useCallback(() => store.getSession(sessionId).toolCalls, [store, sessionId]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
export function useSessionIsThinking(sessionId: string): boolean {
  const store = useStore();
  const subscribe = useCallback((cb: () => void) => store.subscribeSession(sessionId, cb), [store, sessionId]);
  const getSnapshot = useCallback(() => store.getSession(sessionId).isThinking, [store, sessionId]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
```
`useSessionTasks.ts:45`: `const toolCalls = useSessionToolCalls(sessionId);` and `buildTasksById(toolCalls)` keyed on `[toolCalls]`.
`TrustGate.tsx:110`:
```ts
export function useTrustGateActive(sessionId: string | null): boolean {
  const store = useChatStore();
  // WHY a timeline-keyed cache: the scan is O(timeline) and getSnapshot runs on
  // every notification; the timeline array only changes when an entry is added
  // or replaced, never on a streamed word.
  const cache = useRef<{ timeline: TimelineEntry[] | null; active: boolean }>({ timeline: null, active: false });
  const getSnapshot = useCallback(() => {
    if (!sessionId) return false;
    const s = store.getSession(sessionId);
    if (cache.current.timeline !== s.timeline) cache.current = { timeline: s.timeline, active: findTrustPrompt(s) !== null };
    return cache.current.active;
  }, [store, sessionId]);
  const subscribe = useCallback((cb: () => void) => store.subscribeSession(sessionId ?? '', cb), [store, sessionId]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
```
`App.tsx:3444`: `const guideBusy = useSessionIsThinking(sessionId ?? '') && !!sessionId;` and delete `guideChatState`.

- [ ] **Step 4: run** the new test plus `npx vitest run tests/trust-gate.test.tsx tests/session-drawer-skips-parent-rerenders.test.tsx` → PASS.
- [ ] **Step 5: commit** — `perf(renderer): the app root reads two flags and one map, not the whole streaming session`

### Task A2: the session strip's two dependency-less layout effects

**Files:** Modify `desktop/src/renderer/components/SessionStrip.tsx:717-722, 1763-1766`; Test: new `desktop/tests/session-strip-layout-effects-have-deps.test.ts` (source scan, `readStripped`).

- [ ] **Step 1: guard** — count `useLayoutEffect(` occurrences in the stripped source whose effect closes with `});` (no deps) and assert it is exactly 1 (the drag-settle effect at ~1540, which early-returns). Implementation: split on `useLayoutEffect(`, for each chunk find the matching close via brace counting, check whether the text between the closing `}` and `)` contains `[`.
- [ ] **Step 2: run, expect FAIL** (3 without deps).
- [ ] **Step 3: deps** — SessionStrip already receives theme-driven re-renders; read `useTheme()` from `../state/theme-context` for the active theme id and the reduced-effects flag (confirm the field names in `theme-context.tsx:683-713`). Font effect deps: `[themeId, sessions.length > 0]`; window effect deps: `[themeId, reducedEffects]`. WHY comment: the two reads are `getComputedStyle` in the layout phase, a forced style flush per render; with A1 that was ~120 flushes/s during streaming.
- [ ] **Step 4: run guard → PASS**; run `npx vitest related --run src/renderer/components/SessionStrip.tsx`.
- [ ] **Step 5: commit** — `perf(header): the strip's font and motion-window reads run on theme change, not every render`

### Task A3: per-word work stops growing with the chat

**Files:** Modify `desktop/src/renderer/state/chat-reducer.ts` (`getOrCreateTurn` 155-166; every `new Set(session.seenUuids).add(` site: 607, 1099, 1294, 1531, 2049, 2141, 2180, 2865, plus 1944); Test: `desktop/tests/chat-reducer.test.ts` (add a describe).

- [ ] **Step 1: failing tests**:
```ts
describe('per-token cost does not grow with the session (2026-09-16 A3)', () => {
  it('a text delta keeps the seenUuids Set identity (append in place, never copied)', () => {
    let s = init(); s = chatReducer(s, turnStart());
    const before = s.get(SID)!.seenUuids;
    s = chatReducer(s, text('a', 'u1'));
    expect(s.get(SID)!.seenUuids).toBe(before);
    expect(before.has('u1')).toBe(true);
  });
  it('a duplicate uuid is still dropped', () => { /* dispatch text u1 twice; timeline text length unchanged */ });
  it('page replay does not leak scratch uuids into the live set', () => { /* HISTORY_PAGE_PREPEND with an event uuid X; then live text with uuid X must still apply? — NO: it must be deduped, which is today's contract; assert today's behaviour is unchanged */ });
  it('a text delta into an existing turn does not copy assistantTurns before the early return', () => { /* spy-free: assert getOrCreateTurn is not exported; instead pin via a 5,000-turn fixture that 200 deltas take < 50 ms — SKIP timing; pin the identity instead: */ });
});
```
Timing tests are flaky; pin identity (`seenUuids` same object) and, for turns, pin that a delta into an existing turn returns a session whose `assistantTurns` is a NEW Map (purity kept) but whose untouched turn entries are the SAME objects.

- [ ] **Step 2: run, expect FAIL** on the identity case.
- [ ] **Step 3: implement**:
```ts
// WHY in-place (2026-09-16 A3): every streamed word used to copy the set of every
// uuid the session has ever seen, so a 4,000-word reply did ~8M copies and the
// last paragraph lurched. The set is append-only, nothing renders it, the store
// only ever applies the reducer to its latest state, and the page-replay scratch
// copies it before replaying — so appending in place cannot be observed by any
// consumer. This is the reducer's ONE documented purity exception.
function markSeen(session: SessionChatState, uuid: string): Set<string> {
  session.seenUuids.add(uuid);
  return session.seenUuids;
}
```
Replace each `new Set(session.seenUuids).add(action.uuid)` with `markSeen(session, action.uuid)`; `1944`'s spread form likewise. Leave the two `new Set([...a, ...b])` unions (2720, 2735) — they are page merges, not per token.
`getOrCreateTurn`: move `const assistantTurns = new Map(session.assistantTurns)` below the early return; the early path returns `{ assistantTurns: session.assistantTurns, timeline, currentTurnId }`. Then audit the callers (`rg -n "getOrCreateTurn\(" chat-reducer.ts`): each does `assistantTurns.set(currentTurnId, …)` — change those to `const turns = new Map(assistantTurns); turns.set(...)` ONLY where the returned Map may be the original (i.e. every caller — keep purity; the saving is that the copy happens once per caller, not once here AND once there). Net: same number of copies as today for the create path, one for the existing-turn path. (The real per-token saving is `seenUuids`; this one removes a redundant double copy where callers already copied.)

- [ ] **Step 4: run** `npx vitest run tests/chat-reducer.test.ts tests/history-paging-reducer.test.ts tests/clear-preserves-timeline.test.ts tests/session-totals-reducer.test.ts tests/chat-reducer-specialists.test.ts` → PASS.
- [ ] **Step 5: commit** — `perf(reducer): seen-uuid dedup appends in place; a delta into an existing turn stops double-copying`

### Task A4: one notification per frame, not per action

**Files:** Modify `desktop/src/renderer/state/chat-context.ts` (store: `dispatchMany`), `desktop/src/renderer/state/transcript-batch.ts:29,60` (type + flush), `desktop/src/renderer/App.tsx:1361`, `desktop/src/renderer/hooks/useSubmitConfirmation.ts:166-199`; Test: new `desktop/tests/chat-store-batch-notifies-once.test.ts`, extend `tests/remote-snapshot-cut-line.test.tsx` run.

- [ ] **Step 1: failing test** — build a store via `ChatProvider` (or export `createChatStore` for tests), `subscribeAll(spy)`, `dispatchMany([10 text actions])`, expect spy called once; a per-session subscriber for `SID` called once; a subscriber for another session called 0 times.
- [ ] **Step 2: run, expect FAIL** (`dispatchMany` undefined).
- [ ] **Step 3: implement** — in `createChatStore`, factor `notify(prev, next)` out of `dispatch`; add:
```ts
dispatchMany: (actions) => {
  const prev = state; let next = state;
  for (const a of actions) next = chatReducer(next, a);
  if (next === prev) return;
  state = next; notify(prev, next);
}
```
`transcript-batch.ts`: `type Dispatch = (actions: ChatAction[]) => void`; `flush()` calls `dispatch(batch)` once. `App.tsx:1361`: `installTranscriptBatcher(store.dispatchMany)` (App already has the store via `useChatStore()`; confirm at that line). WHY: the batcher already made ONE render per frame; the store still ran all 12 app-wide subscribers once per action, ~120 whole-store scans per frame at ten deltas.
`useSubmitConfirmation.ts` `track()`: keep `const lastTimeline = new Map<string, TimelineEntry[]>()` in a ref; inside the loop, `if (lastTimeline.get(sessionId) === session.timeline) { /* nothing pending changed */ carry forward its tracked ids into seen; continue; }` — the carry-forward matters or the cleanup loop below would clear timers for untouched sessions. Simplest correct form: skip only the inner `for (const entry of session.timeline)` scan and instead re-add to `seen` every tracked id whose `info.sessionId === sessionId`.
- [ ] **Step 4: run** the new test, `tests/remote-snapshot-cut-line.test.tsx`, `npx vitest related --run src/renderer/state/chat-context.ts src/renderer/hooks/useSubmitConfirmation.ts` → PASS.
- [ ] **Step 5: commit** — `perf(store): a frame's transcript actions notify subscribers once; the retry tracker skips untouched sessions`

### Task A6: expanded tool cards stop subscribing to the whole session

**Files:** Modify `desktop/src/renderer/components/tool-views/ToolBody.tsx:1119-1130` and the `TaskUpdate` case that reads `tasksById`; Test: extend `desktop/tests/root-selectors-skip-token-rerenders.test.tsx` with a `ToolBody` render-count case (Bash tool, 40 deltas → 0 re-renders of the body).

- [ ] **Step 1: failing test** (as above; mount `<ToolBody tool={bashTool} sessionId={SID} />` inside `ChatProvider`, count via a `React.Profiler` `onRender` or a wrapper).
- [ ] **Step 2: run, expect FAIL**.
- [ ] **Step 3: implement** — replace `useChatState` with `useSessionToolCalls(sessionId || '')`; `tasksById` memo keyed on that Map. (Moving the hook into the `TaskUpdate` case would be cleaner still, but the hook must stay unconditional — the selector is enough: text deltas do not change the Map.) WHY: the card's memo comparator exists to stop exactly this, and a whole-state subscription in a descendant routed around it.
- [ ] **Step 4: run** the test plus `tests/tool-body-shell.test.tsx tests/tool-body-malformed-input.test.tsx` → PASS.
- [ ] **Step 5: commit** — `perf(tool cards): an expanded card re-renders on tool events only`

### Task A7: verify, measure, review

- [ ] `bash scripts/verify.sh <app worktree>` → six lines green (paste them in the PR).
- [ ] Rig: fresh master baseline then `--only workload --label shell-redraw`; `node scripts/perf-lab/compare.mjs`. Report long-task total, max, frame gaps. If the machine is loaded, wait; do not read a REJECT off a busy run.
- [ ] Fresh-eyes code review (context-free reviewer agent) before showing Destin. Fix findings. Push.

**Not in Batch A (deliberately):** A5, the streaming-bubble re-parse throttle — it changes what the eye sees while text appears and needs a before/after clip and Destin's call. Filed in the sweep doc.

---

# Batch C — branch `perf/main-thread-click-paths`

### Task C1: the end of a reply no longer re-reads the whole transcript

**Files:** Modify `desktop/src/main/harness/accepted-history-store.ts:205-221` (reader), `:400` (publish), `:530-531` (atomicWrite); Test: `desktop/tests/accepted-history-store.test.ts` (new describe), extend `desktop/tests/main-hot-path-no-sync-fs.test.ts`.

**Interfaces produced:** module-private `class IncrementalTranscriptReader { read(file): Promise<Raw | null> }`, one instance per `AcceptedHistoryStore`; `rawTranscriptSync` keeps serving `restore()`.

- [ ] **Step 1: failing tests** (use the file's existing `makeProposal`/temp-dir helpers):
```ts
describe('incremental transcript reader (2026-09-16 C1)', () => {
  it('a second publish after an append reads only the tail and reports the full-file digest', async () => {
    // publish once; append two events; spy on fs.promises.read (or count bytes via a wrapped open) → second publish reads < first;
    // then restore() must succeed with ok:true (digest matches the whole file).
  });
  it('a transcript that shrank is re-read in full', async () => { /* truncate the file; publish; manifest.transcript.bytes equals new size */ });
  it('a duplicate uuid appended later still fails the publish', async () => { /* append a line reusing an existing uuid → { ok:false, reason:'unreferenced-history' } */ });
  it('a torn tail is hashed but not cached past the last newline', async () => { /* append "{\"partial" without newline; publish; then complete the line; publish; restore ok */ });
  it('the event loop keeps ticking during the read', async () => { /* mock fs.promises.readFile → never-resolving; a 20 ms timer fires */ });
});
```
- [ ] **Step 2: run, expect FAIL**.
- [ ] **Step 3: implement**:
```ts
// WHY (2026-09-16 C1): publish() runs at EVERY turn boundary and re-read + re-parsed
// the whole transcript synchronously on the main thread — a hitch at the end of
// every reply that grew with the conversation. The store is the transcript's only
// writer and it appends whole lines, so the reader keeps the parsed prefix and its
// hash state and reads only the bytes past the last newline it has seen. Anything
// that breaks that assumption (file shrank, duplicate uuid, unparseable line)
// drops the cache and re-reads in full — the result is then byte-for-byte what the
// old reader returned.
class IncrementalTranscriptReader {
  private cache = new Map<string, { bytes: number; hash: Hash; events: Map<string, TranscriptEvent>; failed: boolean }>();
  async read(file: string): Promise<{ bytes: number; digest: string; events: Map<string, TranscriptEvent> } | null> {
    let stat: fs.Stats; try { stat = await fs.promises.stat(file); } catch { return null; }
    const hit = this.cache.get(file);
    const from = hit && !hit.failed && stat.size >= hit.bytes ? hit.bytes : 0;
    if (from === 0) this.cache.delete(file);
    let data: Buffer;
    try {
      const fh = await fs.promises.open(file, 'r');
      try { data = Buffer.alloc(stat.size - from); await fh.read(data, 0, data.length, from); } finally { await fh.close(); }
    } catch { return null; }
    const base = from === 0 ? { bytes: 0, hash: createHash('sha256'), events: new Map<string, TranscriptEvent>() } : hit!;
    const events = from === 0 ? base.events : new Map(base.events);  // the cache's map must not be mutated by a failing parse
    const lastNl = data.lastIndexOf(0x0a);
    const complete = lastNl >= 0 ? data.subarray(0, lastNl + 1) : Buffer.alloc(0);
    let parsedOk = true;
    for (const line of complete.toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const v = JSON.parse(line) as TranscriptEvent;
        if (v && typeof v.type === 'string' && typeof v.uuid === 'string') {
          if (events.has(v.uuid)) { this.cache.delete(file); return null; }
          events.set(v.uuid, v);
        }
      } catch { parsedOk = false; break; }
    }
    const prefixHash = base.hash.copy(); prefixHash.update(complete);
    const full = prefixHash.copy(); full.update(data.subarray(complete.length));
    if (parsedOk) this.cache.set(file, { bytes: from + complete.length, hash: prefixHash, events, failed: false });
    else this.cache.delete(file);
    return { bytes: stat.size, digest: full.digest('hex'), events };
  }
}
```
Keep the existing "a parse failure stops the loop" semantics (the `break`), and note that the old reader's `return null` on duplicate uuid is preserved. `publish()`: `const raw = await this.reader.read(proposal.transcriptPath);`. `atomicWrite`: `await fs.promises.mkdir(this.dir, { recursive: true, mode: DIRECTORY_MODE }); await fs.promises.chmod(this.dir, DIRECTORY_MODE);`. `restore()` keeps `rawTranscriptSync` (rename of the old function) — it runs once at resume.
Guard: add to `main-hot-path-no-sync-fs.test.ts` an entry for the `publish(` method body and the reader class body.
- [ ] **Step 4: run** `npx vitest run tests/accepted-history-store.test.ts tests/accepted-history-privacy.test.ts tests/native-session-host-continuation.test.ts tests/main-hot-path-no-sync-fs.test.ts` → PASS.
- [ ] **Step 5: commit** — `perf(history): the per-turn accepted-history publish reads only what was appended, off the main thread`

### Task C2: tear-off asks "is it live", and history pages read off the main thread

**Files:** Modify `desktop/src/main/harness/native-session-host.ts:4525-4560` (add `isLive`, `getHistoryAsync`, `getHistoryPageAsync`, factor the merge), `desktop/src/main/harness/session-store.ts:307` (add `readEventsAsync`), `desktop/src/main/native-home.ts:157` (add `readSessionLinesAsync`), `desktop/src/main/ipc-handlers.ts:3106, 3174, 3253`; Test: `desktop/tests/native-session-host.test.ts` (async twins return equal results), `main-hot-path-no-sync-fs` entries for the three new functions.

- [ ] **Step 1: failing tests** — `expect(await host.getHistoryPageAsync(id, null)).toEqual(host.getHistoryPage(id, null))` after a few appends and one delegated child; `host.isLive(id)` true for a live id, false after destroy; the liveness smoke (timer fires while `readSessionLinesAsync` awaits a mocked `readFile`).
- [ ] **Step 2: run, expect FAIL**.
- [ ] **Step 3: implement** — `readSessionLinesAsync` mirrors `readSessionLines` with `await fs.promises.readFile`; `readEventsAsync` mirrors `readEvents`; in the host, extract the page-slicing body of `getHistoryPage` into `pageOf(all, beforeIndex)` and the merge body of `getHistory` into `mergeFor(entry, parentEvents, childrenEvents)` so the sync and async versions share every line but the reads. `isLive(sessionId) { return this.live.has(sessionId); }` with WHY: `getHistory(id) !== null` read the whole history (parent AND every child) to compute a boolean. IPC: `3253` → `nativeHost.isLive(sessionId)`; `3106` → `await nativeHost.getHistoryPageAsync(...)`; `3174` → `await nativeHost.getHistoryAsync(...)`.
- [ ] **Step 4: run** `npx vitest run tests/native-session-host.test.ts tests/tearoff-handoff.test.ts tests/session-context.test.ts tests/main-hot-path-no-sync-fs.test.ts` → PASS.
- [ ] **Step 5: commit** — `perf(native): tear-off checks liveness, not the whole history; history pages read off the main thread`

### Task C3: the git snapshot is computed ahead, off the main thread

**Files:** Modify `desktop/src/main/harness/prompt-assembly.ts:38-47, 36 (PromptInputs)`, `desktop/src/main/harness/native-session-host.ts:~2749, ~3393` (and the async functions that reach them); Test: `desktop/tests/prompt-assembly.test.ts`, new guard in `desktop/tests/native-session-host.test.ts` or a source scan.

- [ ] **Step 1: failing tests** — `assembleSystemPromptParts({ ..., gitSnapshot: 'Git branch: x (clean)' })` contains that exact line and never spawns (spy on `child_process.execFileSync` → not called); `await gitSnapshotAsync(tmpNonRepoDir)` === `'Git: not a repository'`; `await gitSnapshotAsync(tmpRepoDir)` equals the sync function's string for the same repo. Guard: every `assembleSystemPrompt(` / `assembleSystemPromptParts(` call in `native-session-host.ts` passes `gitSnapshot` (source scan: count of calls equals count of `gitSnapshot:` within those call expressions).
- [ ] **Step 2: run, expect FAIL**.
- [ ] **Step 3: implement** — `PromptInputs.gitSnapshot?: string`; `export async function gitSnapshotAsync(cwd)` using `promisify(execFile)` with the same args, timeouts and `stdio` treatment, returning the identical strings; the `<env>` line becomes `i.gitSnapshot ?? gitSnapshot(i.cwd)`. In the host: the create/resume path and the specialist-spawn path are `async`; compute `const gitSnapshot = await gitSnapshotAsync(cwd)` before the object literal and pass it. Rewrite the WHY block at ~2727 to say the shell-out is now awaited off the loop and passed in, so the sync fallback exists only for callers without a host (the evaluator). WHY on the specialist site: the old "once per session, never per turn" claim was broken by every helper spawn mid-turn.
- [ ] **Step 4: run** `npx vitest run tests/prompt-assembly.test.ts tests/native-session-host.test.ts tests/session-context.test.ts` → PASS.
- [ ] **Step 5: commit** — `perf(prompt): git branch/dirty state is read asynchronously before the session opens, for helpers too`

### Task C4: the model's own file tools stop blocking the main thread

**Files:** Modify `desktop/src/main/harness/tools/glob.ts:203-268`, `read.ts:227`, `edit.ts:98,156`, `write.ts:68,97,125-126`, `file-fingerprint.ts:31`; Create `desktop/src/main/harness/tools/path-lock.ts`; Test: `desktop/tests/harness-tools-core.test.ts` (existing cases must pass unchanged), new `desktop/tests/tools-path-lock.test.ts`, `main-hot-path-no-sync-fs` entries for the five files.

- [ ] **Step 1: failing tests** — guard entries (fail immediately); `withPathLock`: two overlapping Edits of the same file via the tool's `execute` both succeed and the file holds BOTH edits (second sees the first's bytes); Glob on a fixture tree returns the same list as before (existing tests); liveness smoke on Read.
- [ ] **Step 2: run, expect FAIL**.
- [ ] **Step 3: implement** —
```ts
// path-lock.ts — WHY: Edit and Write are read-check-write. With sync fs that was
// atomic on the event loop; async makes two parallel calls on ONE file able to both
// pass the fingerprint check and lose an update. One chain per canonical path.
const chains = new Map<string, Promise<unknown>>();
export function withPathLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(key, next);
  void next.finally(() => { if (chains.get(key) === next) chains.delete(key); });
  return next;
}
```
Glob: `walk` becomes `async`, `readdirSync` → `await fs.promises.readdir`, `statSync` → `await fs.promises.stat` (keep the raced-delete catch), the root `statSync` probe → `fs.promises.stat`. Order of results is preserved by awaiting sequentially (keep it sequential — parallelising changes hit order before the sort and the ceiling semantics). Read: `await fs.promises.readFile(abs)`. Edit: wrap from the fingerprint read through the write in `withPathLock(canonical, …)`; `readFileSync` → `await fs.promises.readFile`, `writeFileSync` → `await fs.promises.writeFile`. Write: same, plus `mkdir` → `fs.promises.mkdir`, `existsSync` → `fs.promises.access` boolean. `fingerprintFile` → async (`fingerprintFileAsync`) and switch its callers (`rg -n fingerprintFile src/main`).
- [ ] **Step 4: run** `npx vitest run tests/harness-tools-core.test.ts tests/harness-tool-bounds.test.ts tests/harness-tool-conformance.test.ts tests/native-tools-polish.test.ts tests/tools-path-lock.test.ts tests/main-hot-path-no-sync-fs.test.ts` → PASS.
- [ ] **Step 5: commit** — `perf(tools): Glob walks and Read/Edit/Write read and write off the main thread; Edit/Write serialize per file`

### Task C5: the three per-session polls read asynchronously

**Files:** Modify `desktop/src/main/ipc-handlers.ts:2259-2300 (readers), 2318-2411 (buildStatusData + three callers at 2406, 2418, 2506), 3660-3667 (readTopicFile), 3736-3744 (startPolling)`, `desktop/src/main/transcript-watcher.ts:692`; Test: `desktop/tests/transcript-watcher.test.ts` (existing poll cases), new source-scan entries in `main-hot-path-no-sync-fs.test.ts` for `buildStatusData` body, `readTopicFile` body and `ensureGlobalPoll` body.

- [ ] **Step 1: guards first** (they fail today). Add a topic-poll unit is impractical (closure inside `registerIpcHandlers`); the guard plus a dev-instance check carries it.
- [ ] **Step 2: implement** — `readJsonFile`/`readTextFile`/`readSyncWarningsSync` gain async twins used by `buildStatusData`, which becomes `async` and gathers the per-session reads with `Promise.all` over `sessionIdMap` entries. Single-flight:
```ts
let statusBuildInFlight: Promise<StatusData> | null = null;
function buildStatusDataShared() { return statusBuildInFlight ??= buildStatusData().finally(() => { statusBuildInFlight = null; }); }
```
The three callers become `void buildStatusDataShared().then((data) => { send(IPC.STATUS_DATA, data); remoteServer?.broadcastStatusData(data); })` (the attention listener only broadcasts to remote, as today). WHY: 6 + 3N synchronous reads every 10 s, and again on every attention change.
`readTopicFile` → async (`fs.promises.readFile`); `startPolling`'s tick: `const topic = await readTopicFile(claudeId); …; if (topic !== null) upgradeToWatch(desktopId, claudeId)` where `upgradeToWatch` clears the interval, deletes the map entry and calls the existing `fs.watch` attach path (the function at ~3709 that sets `topicWatchers`). WHY: the file usually does not exist when the session starts, so every session fell into the 2 s poll for its whole life.
`transcript-watcher.ts:692`: delete the `fs.existsSync` line — `readNewLinesOnce` already stats asynchronously and returns on ENOENT (`:761-766`). WHY in place of the line.
- [ ] **Step 3: run** `npx vitest run tests/transcript-watcher.test.ts tests/main-hot-path-no-sync-fs.test.ts` and `npx vitest related --run src/main/ipc-handlers.ts` (long; run once) → PASS.
- [ ] **Step 4: dev-instance check** (announce the window first): `bash scripts/run-dev.sh --label "status polls"`; open a Claude Code session, confirm the status-bar chips (context %, branch) populate within 10 s and the session's topic name appears once Claude names it; check the log for the `fs.watch` attach. Kill by pid.
- [ ] **Step 5: commit** — `perf(polls): status data, topic names and the transcript safety poll read off the main thread; topic polling upgrades to a watcher`

### Task C6: the Resume list reads asynchronously

**Files:** Modify `desktop/src/main/native-home.ts` (add `listSessionFilesAsync`, `readSessionHeadAsync`), `desktop/src/main/harness/session-store.ts` (add `listAsync`), `desktop/src/main/harness/native-session-host.ts:4611` (add `listAsync`), `desktop/src/main/ipc-handlers.ts:1849 region, 3347`, `desktop/src/main/remote-server.ts:1782, 1863`; Test: `desktop/tests/session-store.test.ts` (`listAsync` deep-equals `list`), `desktop/tests/native-home.test.ts` (head-read twin equality incl. the truncated-last-line rule), guard entries.

- [ ] **Step 1: failing tests** as named.
- [ ] **Step 2: implement** the twins with `fs.promises.readdir`, `lstat`, `open/read/close`; identical filtering and the same "drop a truncated last line" rule. Switch the four callers to `await …listAsync()`. WHY: clicking Resume read 256 KB of every session file ever, synchronously.
- [ ] **Step 3: run** `npx vitest run tests/session-store.test.ts tests/native-home.test.ts tests/session-browser.test.ts tests/main-hot-path-no-sync-fs.test.ts` → PASS.
- [ ] **Step 4: commit** — `perf(resume): native session listing reads off the main thread`

### Task C8: project-watcher fan-out goes only to subscribed windows; own-writes stop leaking

**Files:** Modify `desktop/src/main/artifacts/project-watcher.ts:135-152, 265-283`, `desktop/src/main/ipc-handlers.ts:4852-4861`; Test: `desktop/tests/project-watcher.test.ts`.

- [ ] **Step 1: failing tests** — `noteOwnWrite` 1,000 paths never seen by any watcher, advance the clock past `OWN_WRITE_TTL_MS`, `noteOwnWrite` once more → the map size (test-only read `__ownWritesSize()`) is small (≤ 1); `initProjectWatchers` receives `(evt, subscriberIds)` and the ids are the current subscribers of that root.
- [ ] **Step 2: implement** — `noteOwnWrite`: when `ownWrites.size > 512`, sweep expired entries first (WHY: entries were only ever removed when the watcher echoed the exact path; writes under no watcher stayed forever). Emit signature: `emit?.({...}, [...entry.subscribers])`; in `ipc-handlers.ts`: `for (const id of subscriberIds) webContents.fromId(id)?.send(ARTIFACT_IPC.CHANGED, evt)` — keep the remote broadcast. WHY: every changed file was cloned into every window including buddy floaters.
- [ ] **Step 3: run** `npx vitest run tests/project-watcher.test.ts tests/project-view-files-tab-stays-mounted.test.tsx` → PASS.
- [ ] **Step 4: commit** — `perf(watcher): file-change events reach subscribed windows only; own-write markers expire`

### Task C9: the Home folder is watched two levels deep

**Files:** Modify `desktop/src/main/artifacts/project-watcher.ts` (export `watchDepthFor(root: string, home = os.homedir()): number`, use it at the `depth:` option); Test: `desktop/tests/project-watcher.test.ts`.

- [ ] **Step 1: failing test** — `watchDepthFor('/home/x', '/home/x') === 2`; `watchDepthFor('/home/x/proj', '/home/x') === WATCH_DEPTH`; trailing-slash and canonicalised forms agree.
- [ ] **Step 2: implement** with WHY: the default "Home" project watched `$HOME` six levels deep with no directory cap — the quarter-million inotify watches `docs/roadmap/files.md` could not attribute, and a multi-hundred-ms freeze per cold start. Two levels keeps live refresh for files sitting directly in Home and one folder down; deeper folders still list and open, they just do not live-refresh while Home is the project.
- [ ] **Step 3: run** `npx vitest run tests/project-watcher.test.ts` → PASS.
- [ ] **Step 4: commit** — `perf(watcher): the Home project watches two levels deep`

### Task C10: verify, measure, review, roadmap

- [ ] `bash scripts/verify.sh <app worktree>` green; paste.
- [ ] Rig `--only workload,projects --label click-paths` vs. the fresh baseline: expected flat; a regression is a stop.
- [ ] Fresh-eyes review; fix findings.
- [ ] Roadmap (workspace worktree): close `files.md` "quarter of a million file watches" with the cause and C9; update `chat-data.md` "four smaller reads" to say the native half shipped (C6) and the conversation-store half is still deferred behind `session/sync-safety-audit-20260908`; file C7 (chatsearch re-index on star/rename) and C10 (reconcile + sub-agent watcher timers) as new `performance` items; `node scripts/roadmap-check.mjs --fix --root <workspace worktree>` and diff before committing.

## Close-out per branch

Commit by explicit path, push, `bash scripts/close-out.sh <branch> youcoded`, address findings within scope, then stop and ask "ready to merge?". Never merge unasked.
