---
title: Dragging a session to a new window — lost messages, and the one-way trip on KDE Wayland
date: 2026-09-03
status: shipped
area: desktop / multi-window detach
---

# Outcome (2026-09-03) — shipped in itsdestin/youcoded#409

All three root causes below were fixed. What actually shipped, against the proposals at the
bottom of this document:

| Proposal | Outcome |
|---|---|
| **A** — pull the handoff on mount; read the inherited page to EOF | **shipped**, plus the split of the memory-only state into `session:replay-live-state` |
| **B1** — compositor-driven drag | **shipped, Linux/Wayland only.** Destin chose to keep the live tear-off on Windows/macOS rather than trade it away everywhere, accepting two drag implementations |
| **B2** — "Move to window…" menu commands | **not built.** Filed in `docs/roadmap/user-interface.md` — still the only keyboard-reachable path, and the only one that works if a drag ever regresses |
| **B3** — KWin over D-Bus | rejected, as proposed |
| XWayland (`--n=x11`) | rejected, as proposed |
| **C** — stop attempting the live tear-off on Wayland | achieved as a side effect: that platform no longer runs the pointer model at all |

Two things were learned during the build that this document did not predict:

- **The cross-window drag had to be proven before it was designed against.** A two-window probe
  measured six real drops, both directions, payload intact, on KWin. Nothing in the test suite can
  establish this — jsdom has no `DragEvent` at all, and the fake ones do not even carry a cursor
  position.
- **The drag image cannot carry a border or a shadow.** Destin compared five edge treatments
  against a live drag: rounded corners survive, but a 1px border on the curve and a soft outer
  shadow both fringe, because the compositor composites the drag surface's partly-transparent
  edge pixels differently than a page would.

One question was deliberately left open and is now a roadmap item: the drop target is the session
bar only, so releasing a pill over another window's *chat area* reads as "dropped on nothing" and
makes a third window.

---

# What Destin reported

1. Dragging a session pill out into a new window "sometimes seems to clear/repopulate the chat history".
2. Worse — the new window "often drops messages": the newest message shown is not actually the newest.
3. On this machine (CachyOS / KDE Plasma / Wayland) it is **impossible** to drag the pill back into the
   original window. You get permanently stuck with two windows. Chrome can do this, so the hardware can.

All three reproduce for different reasons. All three are now traced to a verified root cause.

---

# Root cause 1 — the new window is told "you own this session" before it exists

`transferOwnership()` (`youcoded/desktop/src/main/main.ts:1064`) does this, in one synchronous block:

```
const newWin = createAppWindow({...});          // starts loading, returns immediately
transferOwnership(sessionId, ..., newWin.webContents.id, true);
  └─ tgt.webContents.send(IPC.SESSION_OWNERSHIP_ACQUIRED, {...})
```

The window's page has not loaded yet, so React has not mounted, so `App.tsx`'s
`det.onOwnershipAcquired(...)` subscription (`src/renderer/App.tsx:1865`) does not exist yet.

**Measured** (`scratchpad/wlprobe/probe4.js`, Electron 41.10.7): a message sent immediately after
`new BrowserWindow()` is **silently discarded** if the renderer subscribes later. It is not queued.

```
[PROBE4] sent early-msg synchronously after createWindow; renderer subscribes 1.5s later
[RENDERER] subscribed (simulating React mount)      <-- subscribed
[PROBE4] done                                        <-- message never arrived
```

Everything inside that handler is therefore skipped on a **tear-off into a fresh window**:

| Skipped | Consequence |
|---|---|
| `det.requestTranscriptReplay(sid)` | **the whole of root cause 2** |
| `if (freshWindow) setSessionId(sid)` | new window may not open on the session you just dragged |
| `setInitializedSessions` | the "Initializing…" overlay can flash |
| model / permission-mode seeding | masked — `session.list()` re-seeds them on mount |

The session still *appears* in the new window only because a separate boot path
(`session.list()` → `loadFirstPage()`) picks it up. That fallback is what produces the visible
"empty, then repopulates a beat later" — it retries up to 3× at 400 ms (`FIRST_PAGE_ATTEMPTS`).

This exact failure has bitten this codebase before, and the fix pattern is already named in it —
`main.ts:1748`: *"Overlay renderer **pulls** its boot geometry once mounted (replaces the old
did-finish-load push, which raced React's mount and got dropped)."*

## Guard: none. This is why `session-create-ownership-order.test.ts` exists for the sibling bug.

---

# Root cause 2 — the first page of history deliberately stops short, and nothing fills the gap

`IPC.TRANSCRIPT_PAGE` (`src/main/ipc-handlers.ts:2678`):

```ts
// The FIRST page ends where the live tailer started, so the page and the
// live stream cannot overlap (transcript-watcher startOffset, Task 4).
const endOffset = beforeCursor ? beforeCursor.offset : (source.startOffset || null);
```

`startOffset` is the JSONL's **size at the moment the watcher attached**
(`transcript-watcher.ts:397` — `fs.statSync(jsonlPath).size`).

That contract is correct for a window that has been receiving the live stream since then. A brand-new
tear-off window **never received any of it**. So it gets: everything written before the watcher
attached, and nothing after.

`requestTranscriptReplay` is the mechanism that was supposed to close that gap — it reads the whole
JSONL from byte 0 (`transcript-watcher.ts:494`). Root cause 1 stops it from ever being called.

### This predicts exactly the "sometimes/often" pattern Destin sees

| Session | `startOffset` at watch time | Tear-off result |
|---|---|---|
| **Claude Code, resumed** | full size of the existing transcript | **everything since you resumed is missing** |
| **Claude Code, newly created** | 0 (file didn't exist) → falsy → reads to EOF | complete, looks fine |
| **Native (YouCoded harness)** | n/a — pages the in-memory store to `all.length` | complete, looks fine |

So: tear off a fresh chat and it looks perfect. Tear off a conversation you resumed this morning and
it comes back frozen at the moment you resumed it. That is the "latest message isn't the latest".

### Second, quieter casualty of the same miss

The replay handler also re-sends three things that exist **only in main's memory** and have no record
in the transcript file (`ipc-handlers.ts:2696`):

- **open permission asks** — without the replay, a torn-off native session shows a permission card
  with **no buttons**, and the turn hangs forever (there is no timeout on a root ask)
- specialist run records — helper cards come back with no status
- background Bash run records — background shell cards come back with no state

---

# Root cause 3 — on KDE Wayland every coordinate the drag system reads is zero

The detach subsystem is built on three OS calls. **All three are dead on this machine.** Measured
directly against Electron 41.10.7 on KDE Plasma / Wayland (`scratchpad/wlprobe/probe.js`, `probe2.js`):

```
A: getBounds={"x":0,"y":0,...} getPosition=[0,0] renderer={"screenX":0,"screenY":0}
B: getBounds={"x":0,"y":0,...} getPosition=[0,0] renderer={"screenX":0,"screenY":0}   <-- requested (700,420)
--- calling b.setPosition(1200, 300) ---
B after setPosition: getBounds={"x":0,"y":0,...}                                       <-- no-op

--- mouse actively moving over the app's own focused window ---
main.getCursorScreenPoint={"x":0,"y":0}  rendererMouseEvent={"sx":701,"sy":413}
main.getCursorScreenPoint={"x":0,"y":0}  rendererMouseEvent={"sx":468,"sy":341}
main.getCursorScreenPoint={"x":0,"y":0}  rendererMouseEvent={"sx":136,"sy":257}
```

- `screen.getCursorScreenPoint()` → **always `{0,0}`**, even with the pointer over our own window
- `win.getPosition()` / `win.getBounds().x,y` → **always `[0,0]`** regardless of requested position
- `win.setPosition(...)` → **no-op**
- `window.screenX` / `window.screenY` in the renderer → **always `0`**
- a DOM mouse event's `screenX` equals its `clientX` — i.e. "screen" coordinates *are* window-local

This is not a bug we introduced; Wayland forbids a client from learning or setting its own position.
**The workspace already measured and documented this in July** for the buddy floater
(`docs/roadmap/shipped.md`, `docs/active/investigations/2026-07-23-buddy-overlay-wayland-presentation.md`):
*"Wayland forbids apps from programmatically positioning (`setPosition` is a no-op, `getPosition`
returns `[0,0]`) or introspecting global window coordinates."* The detach subsystem was written
against the Windows assumption and never re-checked against that finding.

## What that does to each step of the drag

| Step | Code | On Wayland |
|---|---|---|
| Spawn tear-off window at the cursor | `main.ts:1136` `computeDetachedWindowPos(cursor.x=0, …)` | asks for a negative position; ignored anyway — KWin places it wherever it likes |
| Window follows the cursor mid-drag | `main.ts:1188` `SESSION_DRAG_WINDOW_MOVE` → `win.setPosition` | **no-op every frame** — the window never follows |
| Peer windows highlight as a drop target | `SessionStrip.tsx:326` `localX = screenX - window.screenX` | `0 - 0 = 0` — highlight never tracks the real cursor |
| **Resolve where the drop landed** | `main.ts:1261` `SESSION_DROP_RESOLVE` | hit-tests the point `(0,0)` against each window's strip rect |

That last row is the one that makes re-docking impossible. The strip is a rounded pill bar inset
inside the header (`SessionStrip.tsx:825` — `px-1.5 py-0.5` inside a header row with a control cluster
to its left), so its `getBoundingClientRect()` never contains `(0,0)`. Every window answers "no hit".
`dropResolve` returns `targetWindowId: null`, forever.

The renderer then falls through to (`SessionStrip.tsx:713`):

```ts
if (outsideOwnWindow && sessions.length > 1) { det.detachStart(...); return; }
// otherwise: local reorder
```

A torn-off window holds exactly **one** session, so `sessions.length > 1` is false. The drag ends in
the local-reorder branch, which does nothing. **The pill can never leave a one-session window.**

## Why Chrome can do it

Chrome does not compute screen coordinates for a tab tear-off on Wayland. It uses the compositor's own
drag-and-drop protocol (`wl_data_device`, plus `xdg-toplevel-drag-v1` for the detached-window case) —
the compositor tells the destination surface "a drag entered you, here, and dropped". No client ever
needs to know where any window is. That is the mechanism we are not using.

---

# Proposed fixes

## A. History — make the new window pull, not be pushed  *(required; fixes 1 and 2)*

1. **Renderer pulls on mount.** Add a `detach.claimOnMount()` handshake: when App mounts it asks main
   "did I acquire a session while I was booting?" Main answers from `windowRegistry.sessionsForWindow(myId)`
   and the renderer runs the same acquisition path it runs today. Mirrors the pattern already used and
   commented for the buddy overlay (`BUDDY_OVERLAY_READY`). Keeps the existing push for the
   already-mounted (re-dock) case; the pull is the safety net.
2. **Make the acquisition read history to EOF, not to `startOffset`.** Add an explicit
   `fullTail: true` to the `TRANSCRIPT_PAGE` request used on acquisition, so the newest page is
   genuinely the newest. This is what actually removes the missing messages, and it is cheap — one
   page, not the ~22 s whole-transcript replay the paging work removed on purpose.
3. **Keep the small replay extras.** Still re-send pending permission asks / specialist runs / shell
   runs on acquisition (they exist only in memory), so a torn-off native session doesn't come back with
   a button-less permission card that hangs the turn.

**What Destin will experience:** dragging a session out shows the complete conversation, ending on the
real last message, with no visible rebuild. Risk: near zero — this is additive, and paging already
handles page-plus-live-stream overlap by uuid dedup.

**Guard to add:** a test that asserts the ownership handoff survives a renderer that subscribes late,
in the shape of the existing `session-create-ownership-order.test.ts`.

## B. The Wayland drag — three options, in order of preference

### B1. Switch the pill drag to platform drag-and-drop  *(the real fix; works on every OS)*

Replace the pointer-capture + screen-coordinate model with HTML5 drag-and-drop (`dragstart` /
`dragover` / `drop` / `dragend`). The compositor routes the drag to whichever window is under the
pointer and hands that window the drop with correct local coordinates. No screen coordinates, no
window positions, no `setPosition`, anywhere.

- Drop on another window's strip → that window fires `drop` → asks main for the session. Works.
- Drop on nothing → source gets `dragend` with `dropEffect === 'none'` → spawn a new window.
- **Pro:** removes the entire class of bug, on all platforms. Also makes the drop-target highlight
  correct for free (it becomes a plain `dragenter`).
- **Con:** we lose the Chrome-style "window tears off and follows your cursor" animation — but that
  animation is *already* dead on Wayland (`setPosition` is a no-op) and would remain Windows/macOS-only.
- **Con:** the drag ghost becomes a `setDragImage` bitmap rather than a live DOM element; the current
  ghost styling would need re-doing.
- **UNVERIFIED, and it must be verified before committing to this:** that cross-window HTML5 DnD
  actually works between two Electron BrowserWindows under KWin. I can build a 40-line probe that
  Destin drags once to settle it. Chrome's own tab tear-off proves the protocol works; what needs
  proving is that Electron exposes it to page-level DnD, not just to Chrome's internal tab strip.

### B2. Add explicit "move this session to…" commands  *(small, guaranteed, ship regardless)*

Right-click a pill (and a matching item in the session switcher): **Move to new window** /
**Move to → window 1, window 2…**. Zero coordinates involved; it is a pure ownership transfer,
which already works correctly.

- **Pro:** small, cannot fail on any platform, and it un-strands Destin today. Also the only path that
  works by keyboard, which the drag never will.
- **Con:** not the direct-manipulation feel of dragging a tab.
- **Recommendation: do this one first regardless of what happens with B1** — it is the escape hatch
  for "permanently stuck with two windows", and it is worth having even after drag is fixed.

### B3. Ask KWin for the cursor position over D-Bus  *(rejected)*

The workspace already talks to KWin over D-Bus (`applyKwinKeepAbove`). KWin's scripting API can report
`workspace.cursorPos` and window geometry, which would restore `dropResolve`. **Rejected:** KDE-only
(breaks GNOME/wlroots users), a script round-trip per query is far too slow for the 30 Hz follow loop,
and it still cannot make `setPosition` work. It trades a clean cross-platform fix for a bespoke one
that fixes half the problem on one desktop.

### Also rejected: XWayland (`--n=x11`)

Already tried and rejected in July for the buddy floater — it blurs the whole app at Destin's 1.5×
fractional scaling. Do not revisit.

## C. Stop lying about tear-off on Wayland  *(cheap honesty fix)*

While `setPosition` is a no-op, the "window follows your cursor" tear-off should not be attempted on
Linux/Wayland at all — today it spawns a window at a garbage position and streams 30 Hz of no-op IPC.
Detect the platform and fall straight through to "spawn the window, hand it the session, let the
compositor place it".

---

# Verification artefacts

Throwaway Electron probes (separate processes; the live app was never touched), under
`/tmp/claude-1000/-home-destin-youcoded-dev/a3186e5c-9e4b-4e98-b6bb-ddd0ffdb67c9/scratchpad/wlprobe/`:

- `probe.js` — window positions, `setPosition`, `screenX`, display list
- `probe2.js` — `getCursorScreenPoint()` vs. real renderer mouse events, with the pointer moving
- `probe3.js` / `probe4.js` — whether an early `webContents.send` reaches an early vs. a late subscriber
