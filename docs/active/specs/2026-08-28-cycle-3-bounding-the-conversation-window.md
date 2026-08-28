---
status: draft
created: 2026-08-28
supersedes_eviction_block_in: docs/archive/specs/2026-08-27-paged-history-and-read-hardening-design.md
baseline: perf-reports/2026-08-28-0803-8935c28-cycle3-baseline.json
---

# Perf cycle 3 — bounding the conversation window

## 1. What is broken, measured

Cycle 2 made a conversation *open* at its last 30 turns. It did not bound how large one
can *become*. A page loaded by scrolling up is prepended and nothing removes it, and every
open session keeps a mounted ChatView. Baseline, three repeats, six sessions, each resumed
conversation scrolled to its beginning:

| | floor (nothing scrolled) | ceiling (read to the top, post-GC) |
|---|---|---|
| PSS | 1,539.4 MB | **4,306.0 MB** (+2,764.5) |
| JS heap, live | ~20 MB | +514.2 MB |
| JS heap, committed | ~22 MB | +949.9 MB |
| DOM nodes | ~23,500 | **+1,441,256** (~119 per message) |
| freed by switching away + a forced GC | — | **41.0 MB — 1.5%** |

And it is felt, not only measured: within one `huge` leg the cost of loading the next page
rose **201 ms → 705 ms** as the app filled up, and the 50-turn `small` conversation posted
the slowest single page of the whole run (1,001 ms) because by then the app held 1.46 M
nodes. **The cost tracks what the app holds, not what the conversation holds.**

## 2. The decision: evict, and why the two alternatives are closed

Three ways to stop rendering 12,100 messages. Two are already ruled out **by evidence in
this repo**, not by argument.

**(a) `content-visibility: auto` on `.timeline-entry` — CLOSED, already tried and reverted.**
`globals.css` (above `.timeline-entry { contain: layout style; }`) records it: its implicit
`contain: paint` clips the box-shadow glows community themes draw, and without
`content-visibility` a `contain-intrinsic-size` has no effect, so that too was dropped. The
entry already carries `contain: layout style`; the remaining win needs `paint`, and `paint`
is what breaks themes. Themes are a product pillar. Do not re-litigate this without a way
to keep the glow.

**(b) Virtualizing the list (unmount off-screen entries) — CLOSED on a UX regression.**
`ContentFindBar` finds text with `document.createTreeWalker(root, SHOW_TEXT)` over the chat
content element. Text that is not in the DOM cannot be found. Virtualization would mean
"Find in chat" silently stops matching messages the user has scrolled past *and can still
see the scrollbar for* — a message that is loaded but unfindable. Variable-height rich
content (code blocks, tool cards, images) also makes windowing expensive to get right, and
it would fight the scroll-anchor restore shipped in cycle 2.

**(c) Eviction — CHOSEN.** Drop the timeline entries for turns the user scrolled far past,
and re-fetch them if they scroll back. It frees **both** halves: the reducer state (the
514–950 MB) and the DOM of the dropped entries (the ~1.9 GB), because unmounting follows
from removing the data.

The decisive point over (b): **eviction does not introduce a new find-in-chat limitation,
it extends one that already ships.** Since cycle 2, opening a long conversation loads 30
turns, so `Ctrl+F` already searches only what is loaded. Eviction keeps that rule ("find
searches what is loaded") rather than adding a second, more confusing one ("find searches
what is loaded, except the parts that scrolled away"). See §5 — this is still a real
sharp edge and it needs a UI answer.

## 3. Fix 0 — `observeEntry` must unobserve. Do this FIRST.

**This is a prerequisite, not a nicety: without it eviction frees nothing and every test
still passes.**

`ChatView.tsx` sets `ref={observeEntry}` on every timeline entry; `observeEntry` calls
`bubbleObserverRef.current?.observe(el)` and there is **no `unobserve` anywhere in
`src/renderer/`** (verified repo-wide: the only three matches are test mocks in
`InputBar.test.tsx`, `PreferencesPopup.test.tsx`, `WideViewToggle.test.tsx`). An
`IntersectionObserver` holds a **strong** reference to each observed target, so an element
removed from the DOM stays reachable from the live observer for as long as that session's
ChatView is mounted. Today nothing removes an entry, so it never fires.

### Changes
- `ChatView.tsx` — replace the callback ref with one that unobserves on detach:

```tsx
// React calls a callback ref with the element on attach and with null on detach.
// The null call is the ONLY chance to unobserve: an IntersectionObserver holds a
// STRONG reference to its targets, so an evicted entry would stay reachable from
// the observer and the eviction would free nothing (perf cycle 3, 2026-08-28).
const observedEntries = useRef<Set<Element>>(new Set());
const observeEntry = useCallback((el: HTMLDivElement | null) => {
  const io = bubbleObserverRef.current;
  if (!io) return;
  if (el) { io.observe(el); observedEntries.current.add(el); }
}, []);
```

React 19 supports a **cleanup function returned from a callback ref**, which is the exact
shape needed and avoids tracking a Set by hand — confirm the React major in
`desktop/package.json` before choosing between the two forms, and prefer the cleanup form
if available:

```tsx
const observeEntry = useCallback((el: HTMLDivElement) => {
  bubbleObserverRef.current?.observe(el);
  return () => bubbleObserverRef.current?.unobserve(el);
}, []);
```

- The `useEffect` that builds the observer already calls `disconnect()` on unmount; keep it.

### Guard (required)
`ChatView.test.tsx` — render a timeline, remove entries, assert `unobserve` was called once
per removed element. Use a fake `IntersectionObserver` with `vi.fn()` observe/unobserve, as
`WideViewToggle.test.tsx` already does. **Write this test first and watch it fail.**

## 4. Fix 1 — evict off-screen turns

### 4.1 Carry the transcript byte offset onto timeline entries

Eviction needs a cursor to re-fetch from, and the only durable handle is the byte offset of
a user prompt's JSONL line.

- `transcript-page.ts:150` **already** stamps `ev.data.offset` on `user-message` events.
- The **live tailer does not** — `transcript-watcher.ts` tracks a per-session `offset` for
  its own reads but never stamps it on an emitted event.
- The reducer **never stores it** (verified: no `offset` in `chat-reducer.ts`).

Changes:
- `transcript-watcher.ts` — stamp `data.offset` on emitted `user-message` events, using the
  line's absolute start offset, so a live-streamed prompt is as evictable as a paged one.
- `chat-types.ts` — add `offset?: number` to the user timeline entry. Optional, because
  entries created before this ships (and native-session entries, which have array indices
  rather than byte offsets) will not have one.
- `chat-reducer.ts` — carry it through on the user-message case.

**Native sessions:** `NativeSessionHost.getHistoryPage` windows an already-merged array and
its cursor `offset` is an **array index**, not a byte offset. Eviction must therefore either
mint a native cursor the same way, or be **disabled for native sessions in v1**. Pick one
explicitly; do not let the two number spaces meet.

### 4.2 Track which turns are off-screen — reuse the observer, do not add one

There is already an `IntersectionObserver` on every entry (the `.in-view` backdrop-filter
optimization, `rootMargin: '200px 0px'`). Adding a second observer over the same 12,100
elements would cost what we are trying to save.

- Extend the existing callback to record `lastVisibleAt` per entry key in a ref-held `Map`
  when `isIntersecting` flips false, and delete the entry's record when it flips true.
- Keep it in a **ref**, never in React state: a `setState` per intersection over thousands
  of elements is its own performance bug.

### 4.3 The action

`HISTORY_EVICT { sessionId, beforeOffset }` — remove every timeline entry belonging to a
turn that begins before `beforeOffset`, and set `history.cursor` to that boundary so
scrolling up re-fetches exactly what was dropped.

The reducer must remove, for each evicted turn:
- its `timeline` entries,
- its `toolCalls` entries **by key** (`.delete(id)`, never `.clear()`),
- its `toolGroups` and `assistantTurns` entries,
- nothing else. **`totals` is cumulative and must NOT be recomputed** — that is the
  session-totals bug cycle 2 already paid for once.

### 4.4 When eviction is allowed — every condition is a veto

Evict only when **all** hold:
- loaded turns > `2 × PAGE_TURNS` (never drop below `PAGE_TURNS` loaded),
- the oldest loaded run has been out of view longer than `EVICT_AFTER_MS` (5 min),
- no tool in that run is in `activeTurnToolIds`,
- no open permission ask belongs to that run,
- the run does not contain `currentTurnId`,
- the session is not mid-stream.

Driven by a 60 s interval, not by scroll — evicting during a scroll is how you produce the
jump Destin already reported once.

### 4.5 Scrolling back must be indistinguishable from before

Re-fetch uses the existing paged path (`IPC.TRANSCRIPT_PAGE` + the sentinel). The cycle-2
**scroll anchor** (`captureScrollAnchor` + the `useLayoutEffect` restore, `ANCHOR_SETTLE_MS
= 700`) already keeps the viewport still while entries are prepended; eviction removes
entries **above** the anchor, which the same mechanism must also absorb. Verify explicitly:
evicting while the user is idle must not move the scrollbar at all.

### 4.6 Docs and guards to amend
- `.claude/rules/chat-reducer.md` — the prose says `toolCalls` is never cleared. Amend to:
  never `.clear()`; scoped per-key deletion by `HISTORY_EVICT` is the one sanctioned removal.
- `scripts/ast-grep/rules/toolcalls-never-cleared.yml` — **no change needed**: its pattern is
  `$OBJ.clear()`, so per-key `.delete()` already passes. Confirm rather than assume.
- `youcoded/docs/chat-reducer.md` — extend the "Paged history" section with eviction.

## 5. UI/UX consequences — decide these, do not discover them

1. **Find in chat only searches loaded messages.** This is TRUE ON MASTER TODAY as a
   consequence of cycle-2 paging, and nobody has surfaced it. Eviction widens the window in
   which it bites. **This needs a UI answer in this cycle**, and the accessibility pillar
   says it cannot be silence: when a find runs in a conversation with `history.hasMore`,
   say so plainly next to the match count — e.g. *"Searching the last 30 messages. Load
   more to search further."* Wording to be reviewed; the requirement is that the user is
   never told "0 results" for text that is in their conversation.
2. **The scrollbar is a lie about conversation length** both before and after this change,
   because the scroller only spans loaded content. Eviction makes it shrink as well as
   grow. Do not attempt a fake full-height scroller; do check that eviction never moves the
   thumb under an idle user.
3. **Re-scrolling to an evicted region costs a fetch.** At the measured page cost that is
   ~200–400 ms in a bounded window (the whole point — page cost tracks total load), so it
   should feel *faster* than today's 705 ms, not slower. This is a claim to verify, not
   assume.
4. **Nothing about a message may change when it is evicted and re-fetched.** A tool card,
   an image, a code block and a collapsed/expanded state must come back identically. The
   paged path already replays through the same per-event reducer cases, which is what makes
   this credible — but collapse/expand state lives in component state and **will be lost**.
   Decide: accept, or lift that state into the reducer.
5. **No spinner, no flash, no layout shift** during an idle eviction. The user is not
   asking for anything; they must not see anything.

## 6. Acceptance — measured against `2026-08-28-0803-8935c28-cycle3-baseline.json`

Ship only if, on a 3-repeat `scrollback` run:
- `scrollback.median.ceilingPssMb` drops **at least 40%** (4,306 → ≤ 2,584 MB),
- `scrollback.median.releasedMb` rises far above the 41 MB control,
- `scrollback.median.perSize.huge.pageMedianMs` does **not** regress (it is PRIMARY),
- every existing PRIMARY metric stays inside its spread — in particular
  `workload.median.switchPaintedBySize.huge.medianMs` and
  `history.huge.median.resumeStableMs`,
- the five screenshots that were byte-identical across cycle 2 stay byte-identical.

Plus, from the rig's own honesty rules: every leg must still reach the beginning of its
conversation, or the ceiling is a floor and the number means nothing.

## 7. Risks
- **The observer leak (Fix 0) silently nullifies everything.** Mitigated by doing it first,
  with its own failing-then-passing test.
- **A feature reads state eviction deletes.** Cycle 2 broke four features that depended on
  whole-file replay as a side effect. Before writing the reducer case, enumerate by name
  who reads `toolCalls` / `toolGroups` / `assistantTurns`: the artifact tool-use tracker,
  `session-totals`, Deliverables auto-open, the specialists ledger. Ask what each does when
  an entry vanishes. `npm run knip` and a tree-wide `rg` — not intuition.
- **Remote hydration.** `SerializedSessionChatState` ships the whole chat state to a
  connecting browser/phone and does include `history`. A desktop that has evicted sends
  less; confirm the remote client can page rather than showing a truncated conversation
  with no way back.
- **Scroll jumpiness** is the one thing Destin has already reported by feel. Eviction on an
  interval, never on scroll, plus a "thumb must not move" check.

## 8. Out of scope
- Parking hidden views (cycle 4 candidate; re-measure after this lands — it targets the
  same DOM share and may have little left to take).
- Android on-device paging/eviction.
- The buddy window's own unvirtualized `.timeline-entry` list (`BubbleFeed.tsx`).
