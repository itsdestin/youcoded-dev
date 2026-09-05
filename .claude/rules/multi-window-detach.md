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
  - "**/desktop/src/renderer/components/SessionStrip.tsx"
  - "**/desktop/src/renderer/components/SessionDropZone.tsx"
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
  - test: youcoded/desktop/tests/session-strip-htmldrag.test.tsx
---

# Multi-window session detach

## Three window APIs return ZERO on Linux/Wayland

`screen.getCursorScreenPoint()` → `{0,0}` forever · `win.getPosition()` → `[0,0]` ·
`win.setPosition()` → **a no-op that still reports success** · `window.screenX/Y` →
`0`. Measured on Electron 41.10.7 / KDE Plasma / Wayland, July 2026 and 2026-09-03.
Wayland forbids it; XWayland is rejected (blurs the app at fractional scaling).
**Never make a cross-window decision from a screen coordinate.** Re-measure with
`node scripts/platform-probe.mjs`. Guard: `session-drag-model.test.ts`.

## On Wayland the WHOLE gesture is a browser drag; everywhere else the pointer path

`chooseTearOffModel()` picks `'html-drag'` on Linux+Wayland, `'live-window'`
elsewhere. On `'html-drag'` the pill is `draggable`: the browser starts a native
drag from the press, the compositor carries it, and the drop arrives in the
target window's own window-local coordinates. In-strip reorder is fed from the
`dragover` stream (~190/s, working `clientX`) into the SAME slot logic as the
pointer path, so #404's motion is intact. A finger never becomes a browser drag
on Linux (measured, with and without `--touch-drag-drop`): touch reorders on the
pointer path and moves sessions between windows through the pill's right-click /
long-press menu. **Do not add a mid-gesture handoff back** — the only API for it
is the wrong tool (next section). Guard: `session-strip-htmldrag.test.tsx`.

## `webContents.startDrag` on Linux crops the picture to ~138px and carries only a file

Electron's limit, not the compositor's: `drag_util_views.cc` hands the icon to
Chromium's LINK-drag helper (`button_drag_utils::SetDragImage`, max width 150),
which crops to ~138px, rasterises at 1x, offers only copy/link (a target asking
`'move'` gets no drop, silently) and paints the file's NAME beside a narrow icon.
Read from v41.10.7 source on 2026-09-04, after a day measuring it as a Wayland
limit. A page-started drag touches none of it. Guard: `session-drag-model.test.ts`
pins that preload never exposes `startDrag`.

## The compositor carries an INVISIBLE picture; the strip draws the pill itself

1x1 transparent canvas as the drag image; the twin in the row, a carried ghost
below it (document-level `dragover`). A pill snapshot with the twin off flattened
the in-row animation — the dot-flow loop keys off the twin. Also: **hiding the
source synchronously inside `dragstart` aborts the drag** (deferred a tick), and
`dragleave` has no usable `relatedTarget` — "over the row" is a per-`dragover`
hit-test. Depth: the handoff below.

## Escape and "released over the desktop" are indistinguishable

Both end with `dropEffect 'none'` and unusable coordinates (measured). Destin
chose the desktop drop: a drag nothing accepted opens a new window, as on
Windows/macOS — so Escape does too, and cancelling is dragging back into the
strip. A window's only session goes back instead. The chat area is a second,
labelled route (`SessionDropZone`: "Open in a new window" / "Move here").
Guard: `session-strip-htmldrag.test.tsx`.

## `webContents.send` into a window that has not mounted is DROPPED

Not queued — measured. A tear-off hands the session to a `BrowserWindow` created
one statement earlier, so the whole handoff silently did nothing. The renderer
**pulls** on mount (`detach:claim-pending`); `PendingAcquireQueue.isReady` keeps
push and pull exclusive so a payload arrives exactly once. Guard:
`tearoff-handoff.test.ts`.

## A window that INHERITED a session reads its first page to EOF

`TRANSCRIPT_PAGE` normally stops at the transcript watcher's `startOffset`,
because everything after it already arrived over the live stream — true of a
window that was listening, false of one that just inherited the session.
`WindowRegistry.markInheritedByTransfer` is the one-shot exemption. Without it a
torn-off window showed history frozen at the moment the session was resumed.
Guard: `tearoff-handoff.test.ts`.

Depth, including the full measurements:
`docs/archive/investigations/2026-09-03-session-tearoff-history-and-wayland.md`
and `docs/archive/handoffs/2026-09-04-session-drag-START-HERE.md`.
