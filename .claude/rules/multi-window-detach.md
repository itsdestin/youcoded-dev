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
  - "**/desktop/src/renderer/components/SessionDragPreview.tsx"
last_verified: 2026-09-03
verify:
  - path: youcoded/desktop/src/renderer/session-drag-model.ts
    contains: "chooseSessionDragModel"
  - path: youcoded/desktop/src/main/pending-acquire.ts
    contains: "PendingAcquireQueue"
  - path: youcoded/desktop/src/main/window-registry.ts
    contains: "markInheritedByTransfer"
  - test: youcoded/desktop/tests/tearoff-handoff.test.ts
  - test: youcoded/desktop/tests/session-drag-model.test.ts
  - test: youcoded/desktop/tests/session-strip-dnd.test.tsx
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

**So: never make a cross-window decision from a screen coordinate.** Anything
that hit-tests the cursor against another window, or positions a window, works
on Windows/macOS/Linux-X11 and silently does nothing here — the worst shape,
because `setPosition` reports success. Re-measure with
`node scripts/platform-probe.mjs` before trusting any of them.
Guard: `session-drag-model.test.ts`.

## The drag model is chosen per platform, and both paths must stay live

`chooseSessionDragModel()` returns `'dnd'` on Linux+Wayland (the compositor runs
the drag; the destination window is TOLD it was dropped on, via `session:adopt`)
and `'pointer'` everywhere else (today's live tear-off). Destin's call,
2026-09-03: keep the tear-off animation where it works rather than trade it away
everywhere. **Do not "simplify" the fork away** — a test pins that Windows pills
stay non-draggable. The two cannot coexist within one drag: while the compositor
owns the pointer, the app gets no `pointermove`, so no window can chase the
cursor. Guard: `session-strip-dnd.test.tsx`.

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
`docs/archive/investigations/2026-09-03-session-tearoff-history-and-wayland.md`.
