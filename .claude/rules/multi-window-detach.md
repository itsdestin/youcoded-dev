---
# WHY this rule exists: the detach subsystem was written against Windows
# assumptions and never re-checked against what this workspace had ALREADY
# measured about Wayland in July 2026 for the buddy floater. The knowledge
# existed, in a shipped-roadmap paragraph and an investigation, and reached
# nobody editing this code — so all three blind APIs were used again and the
# feature was broken on Linux for months (2026-09-03).
#
# Globs are "**/"-prefixed: rule paths resolve from the PROJECT ROOT, so a
# "youcoded/..." glob never fires inside worktrees/<name>/, which is where
# CLAUDE.md sends all non-trivial work.
paths:
  - "**/desktop/src/main/window-registry.ts"
  - "**/desktop/src/main/pending-acquire.ts"
  - "**/desktop/src/renderer/session-drag-model.ts"
  - "**/desktop/src/renderer/session-drag-image.ts"
  - "**/desktop/src/renderer/components/SessionStrip.tsx"
last_verified: 2026-09-04
verify:
  - path: youcoded/desktop/src/renderer/session-drag-model.ts
    contains: "chooseTearOffModel"
  - path: youcoded/desktop/src/main/pending-acquire.ts
    contains: "PendingAcquireQueue"
  - path: youcoded/desktop/src/main/window-registry.ts
    contains: "markInheritedByTransfer"
  - test: youcoded/desktop/tests/tearoff-handoff.test.ts
  - test: youcoded/desktop/tests/session-drag-model.test.ts
  - test: youcoded/desktop/tests/session-strip-osdrag.test.tsx
---

# Multi-window session detach

## Three window APIs return ZERO on Linux/Wayland

`screen.getCursorScreenPoint()` → `{0,0}` forever (even with the pointer over the
app's own focused window) · `win.getPosition()` → `[0,0]` for every window ·
`win.setPosition()` → **a no-op that still reports success** · `window.screenX/Y`
→ `0`. Measured on Electron 41.10.7 / KDE Plasma / Wayland, twice: July 2026
(buddy floater) and 2026-09-03 (this subsystem). Wayland forbids a client from
learning or setting where its windows are; it is not configurable, and XWayland
(`--n=x11`) is rejected — it blurs the whole app at fractional scaling.

**So: never make a cross-window decision from a screen coordinate.** Re-measure
with `node scripts/platform-probe.mjs` before trusting any of them.
Guard: `session-drag-model.test.ts`.

## Only the CROSS-WINDOW half forks. The pointer path runs everywhere

`clientX` works perfectly on Wayland, and the strip's reorder motion uses it 16
times. `chooseTearOffModel()` picks only what carries a pill OUT of its window:
`'os-drag'` on Linux+Wayland (the compositor runs it from the moment the pill is
60px clear of the strip) and `'live-window'` elsewhere (spawn a peer window
mid-drag and move it under the cursor). An earlier draft disabled the whole
pointer path on Wayland and would have flattened the motion to fix a
cross-window problem. **Do not widen the fork.** Guard:
`session-strip-osdrag.test.tsx` pins that pills are never HTML5-draggable — a
draggable pill gets a browser-run drag at mouse-down and stops sending
`pointermove`, so nothing could animate.

## A drop is REJECTED SILENTLY if it asks for the wrong effect

`startDrag` drags a file, so the source offers `copy`. A target setting
`dropEffect = 'move'` gets no drop event at all — `dragover` fires forever and
nothing else happens, with no error anywhere. Three drags, zero drops, measured
2026-09-04; it read exactly like "the compositor won't deliver drops". Do not
"correct" this to `move` because a session is being moved. Guard:
`session-strip-osdrag.test.tsx`.

## The drag picture can never exceed 138 physical pixels wide

Measured four ways on KDE/Wayland (2026-09-04). The compositor draws the image at
the size it REPORTS, one screen pixel per image pixel — ignoring the display's
scale factor — and crops anything wider than 138px to 138, centred. Height is
unbounded (355 came through whole). `nativeImage` honours `scaleFactor`, but that
only shrinks the reported size, so it cannot buy width. Not the pill's width, and
not proportional. A full-size card is only possible if a YouCoded window paints it
itself on `dragover`, where window-local coordinates work.

## `webContents.send` into a window that has not mounted is DROPPED

Not queued — measured. A tear-off hands the session to a `BrowserWindow` created
one statement earlier, so the push landed before React could subscribe and the
entire handoff silently did nothing. The renderer **pulls** on mount
(`detach:claim-pending`); `PendingAcquireQueue.isReady` keeps push and pull
exclusive so a payload is delivered exactly once. Same shape as
`BUDDY_OVERLAY_READY`. Guard: `tearoff-handoff.test.ts`.

## A window that INHERITED a session reads its first page to EOF

`TRANSCRIPT_PAGE` normally stops at the transcript watcher's `startOffset`,
because everything after it already arrived over the live stream — true of a
window that was listening, false of one that just inherited the session.
`WindowRegistry.markInheritedByTransfer` is the one-shot exemption. Without it a
torn-off window showed history frozen at the moment the session was resumed.
Guard: `tearoff-handoff.test.ts`.

## The drag image carries no border and no shadow

The compositor composites the drag surface's partly-transparent edge pixels
differently than a page would: rounded corners survive, a 1px border on the curve
and a soft outer shadow both fringe. Destin picked the clean treatment from five
compared against a live drag. KWin draws the real border and shadow on drop, so
nothing is lost. Do not add them back.

Depth, including the full measurements:
`docs/archive/investigations/2026-09-03-session-tearoff-history-and-wayland.md`
and `docs/active/handoffs/2026-09-04-session-drag-START-HERE.md`.
