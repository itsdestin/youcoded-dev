---
title: Session drag + tear-off — where this stands, and what to do next
date: 2026-09-03
status: active
---

# Read this first

Three bugs in dragging a session pill between windows. **One is fixed and ready to
merge. One has to be rebuilt from scratch because master changed underneath it. One
is unbuilt.** Everything below was measured, not assumed.

---

# The state of play, in one table

| Thing | Where it is |
|---|---|
| **History fix** (messages missing after a tear-off) | **DONE.** `fix/tearoff-history`, commit `ea11f434`. Verified it cherry-picks onto today's master with NO conflicts — it never touches the session strip |
| **Wayland drag** (couldn't drag a pill back) | **THROW AWAY AND REBUILD.** Commits `8dcfb078` + `5307b3cd`. Built against the pre-#404 strip; would flatten #404's motion on Linux |
| **Test hygiene** (canvas stub) | Done, `18778a56`. Keep |
| PR | [itsdestin/youcoded#409](https://github.com/itsdestin/youcoded/pull/409) — OPEN, CONFLICTING |
| Workspace docs | Investigation archived + 2 roadmap items → already on `youcoded-dev` master. CI-flake item → also on master |
| Workspace follow-ups | `youcoded-dev` branch `docs/tearoff-followups` — the Wayland rule + `scripts/platform-probe.mjs`. **Red until #409 merges** (its anchors name branch-only files) |

## What NOT to do

- **Do not merge #409 as-is.** Its strip changes conflict with `feat/session-strip-motion`
  (#404), which landed 2026-09-03 and rewrote `SessionStrip.tsx` (**+1030 / -240**,
  index-based drag state → id-based, plus a motion system).
- **Do not copy this session's `docs/MAP.md` rows over.** Master has since gained a
  hot-path row for the session pills and one for #404's `header/drag-order.ts`.
  Re-derive against today's MAP; a straight copy deletes seven rows other sessions wrote.
- **Do not disable the pointer drag on Wayland.** That was this session's design and it
  is wrong — see below.

---

# The measurements (do not re-litigate these)

On this machine — Electron 41.10.7, KDE Plasma, Wayland — with the pointer actively
moving over the app's own focused window. Re-runnable: `node scripts/platform-probe.mjs`
(on `docs/tearoff-followups`).

```
screen.getCursorScreenPoint()  ->  {x:0, y:0}   every sample
win.getPosition()              ->  [0, 0]       every window, whatever was requested
win.setPosition(1200, 300)     ->  no-op, AND STILL REPORTS SUCCESS
window.screenX / screenY       ->  0            every window
```

**The distinction that matters, and that this session got wrong once:**

- **Window-local coordinates (`clientX`) work perfectly.** #404's motion uses them 16
  times. Reordering pills inside one window is FINE on Wayland today.
- **Only screen coordinates are dead.** So only the CROSS-WINDOW half is broken: the
  tear-off, the drop resolution, the peer-window highlight.

The first draft of the fix disabled the whole pointer path on Wayland, which would have
thrown away all of #404's motion to fix a cross-window problem. Destin caught it
("pretty sure it was fine during testing" — he was right). **The pointer path stays.**

---

# The design to build: "promote on exit"

Keep the pointer drag as the only drag, everywhere, so the motion runs untouched. When
the pill is pulled clear of the strip, hand the gesture to the compositor.

**Both halves were probed on the real desktop. Results:**

| Approach | Result |
|---|---|
| Set `draggable=true` mid-gesture and hope the browser promotes it | **DEAD.** `dragstart` never fires. The browser decides at mouse-down and will not change its mind |
| `webContents.startDrag()` from main, mid-gesture | **WORKS.** `startDrag -> accepted by main`, and the OTHER window logged `DRAGENTER on my bar` |

Also proven earlier, separately: a plain cross-window HTML5 drag between two Electron
windows works on KWin — six drops, both directions, payload intact.

## The one thing still unproven

**A completed DROP.** The probe saw `DRAGENTER` in the target window but never a `drop`
— most likely the release landed on the page body rather than the thin bar. Confirm
before building: drag `C · OS handoff` into the other window and release squarely on its
pill bar. If the drop does not land or does not carry the payload, this design collapses
and the fallback is the right-click command below.

Probe: `scratchpad/handoff/` in this session's scratchpad (`main.js` + `page.html` +
`preload.js`); trivially rebuilt from the description above.

## Two costs to accept going in

1. **The payload rides on a temp file's NAME.** Electron's only mid-gesture drag API
   drags files, so the session id is smuggled through a filename and read back on drop.
2. **The source window stops receiving `pointerup` once the OS takes over.** The probe
   left a stranded ghost pill on screen because of exactly this. In the real strip that
   is #404's motion state — a pill mid-flight, a dot mid-yield — so the handoff must
   explicitly cancel it. This looks fine in tests and is obvious in use.

One thing that fits nicely: `startDrag` takes an **icon**, so `SessionDragPreview` (the
window-shaped picture Destin approved) becomes the drag icon rather than a separate
mechanism. Keep it: rounded corners, **no border, no shadow** — both fringe, because the
compositor composites partly-transparent edges differently than a page does. Destin
picked that treatment from five compared against a live drag.

---

# Also unbuilt, and worth doing regardless

**Right-click a pill → "Move to new window" / "Move to → window N".** Roughly half an
hour. Cannot fail on any platform, works by keyboard, and it is the only escape when the
drag breaks — which is the state Destin was stuck in for months. Filed in
`docs/roadmap/user-interface.md`. The ownership-transfer machinery it needs already
works; only the targeting was ever broken.

The open design question, also filed: the drop target is the session bar only, so
releasing over another window's chat area makes a THIRD window instead of moving it
there.

---

# Suggested order

1. Confirm the drop completes (one drag).
2. Merge the history fix — it is independent, tested, and fixes the original complaint.
3. Build "promote on exit" against TODAY's strip.
4. Merge `docs/tearoff-followups`, re-derive the MAP rows, close out.
