---
title: Session drag between windows — built, verified live, one branch to merge
date: 2026-09-04
status: shipped
supersedes: docs/archive/handoffs/2026-09-03-session-drag-START-HERE.md
---

# Read this first

Dragging a session pill between windows on Linux/Wayland **works and Destin has
verified it live** ("okay this looks good!!", 2026-09-04). Nothing is blocked on
a decision any more. What is left is merging, and two small follow-ups.

---

## Status

| Thing | Where it stands |
|---|---|
| History wrong after a tear-off | **FIXED.** PR [#409](https://github.com/itsdestin/youcoded/pull/409), `fix/tearoff-history`. CI green, `MERGEABLE`. Not merged — Destin's call |
| Drag between windows on Wayland | **FIXED, verified live, pushed.** Branch `feat/session-drag-handoff` (head in `git log`; desktop-drop and desktop-only menu landed after Destin's live review). `verify.sh` green. **No PR yet** |
| The drag picture | **No longer a decision.** The compositor carries nothing; the strip draws the pill itself (below) |
| Workspace docs | This handoff, the `multi-window-detach` rule, the MAP row and `scripts/platform-probe.mjs` landed with `docs/session-drag-html-drag` on `youcoded-dev` |

**Worktrees:** `worktrees/feat-session-drag`, `worktrees/fix-tearoff-history`. A dev
instance was left running for Destin's review: `bash scripts/run-dev.sh
feat/session-drag-handoff --label "Wayland Drag"` — kill the Vite on port 5223 and its
Electron once the branch merges.

---

## What was wrong with the previous design, and how it was found

The 2026-09-03 handoff was blocked on "the compositor crops the drag picture to 138px".
That was a misattribution. Electron's Linux `webContents.startDrag`
(`shell/browser/ui/drag_util_views.cc`) hands the icon to Chromium's **link-drag**
helper, `button_drag_utils::SetDragImage`, whose `kLinkDragImageMaxWidth = 150` is the
cap (138 after the button's insets). The same helper rasterises at 1x, offers only
`copy|link` (which is why a `'move'` drop was refused silently), and paints the file
name beside any icon narrower than the cap. Read from the v41.10.7 source; every
oddity measured the day before lines up with it.

A drag the **page** starts (`draggable` + `dragstart` + `setDragImage`) never touches
that helper. Probed the same day with a two-window Electron app on this machine:

| Question | Answer |
|---|---|
| Picture size | A 330 CSS px ruler came through whole, gridlines 60 screen px apart — **crisp at 1.5x** |
| Payload | Arrived through `dataTransfer` under a private MIME type; no temp file |
| `move` | Accepted (`dropEffect=move` on drop) |
| Drops | Landed in both directions between the two windows |
| In-strip reorder | The bar saw `dragover` at ~190/s with working `clientX` |
| Escape vs release over desktop | **Indistinguishable**: both `dropEffect 'none'`, coordinates meaningless |
| Touch | **Never starts a browser drag** on Linux, with or without `--touch-drag-drop` |

The previous handoff's reason for rejecting a page-started drag — "it stops
`pointermove`, so the in-strip motion dies" — was true but not decisive: the
`dragover` stream carries the same window-local X, so the reorder can be fed from it.

## The design that shipped (`'html-drag'`, Linux/Wayland only)

- The pill is `draggable`. `dragstart` writes the session id under
  `application/x-youcoded-session`, sets `effectAllowed = 'move'`, and hands the
  compositor a **1x1 transparent canvas** as the picture.
- **The strip draws the pill in hand itself.** Inside the row: the twin, exactly as on
  the pointer path — #404's motion untouched. Below the row: a *carried ghost* that
  follows the cursor, placed from a document-level `dragover` listener with one style
  write per event. The one place nothing is drawn is the bare desktop between two
  windows, where a release does nothing anyway.
- **Drop targets:** the strip (reorder for our own pill, adopt for another window's) and
  the chat area (`SessionDropZone`): "Open in a new window" for our own pill, "Move
  here" for another window's. Releasing over NOTHING — the bare desktop, another app —
  opens a new window, as on Windows/macOS. So does Escape: the two are indistinguishable
  (`dropEffect 'none'`), and Destin chose the desktop drop over Escape ("if a user wants
  to cancel, they can just drag it back into the original session switcher"). A window's
  only session cannot be torn off (Chrome's rule) — it goes back, its zone is inert and
  the menu item is disabled.
- **Right-click / long-press a pill** → "Move to new window" and "Move to window N —
  names". Works everywhere, by keyboard, and is the only cross-window route for touch.
- Windows/macOS/X11 keep the live tear-off; pills are not draggable there.

Main's only job is ownership: `SESSION_DRAG_ADOPT` from the receiving window, source
resolved from the `WindowRegistry`. `SESSION_DRAG_HANDOFF`, the temp file,
`session-drag-image.ts` and the card plumbing are gone.

### Three things that each cost a round, so nobody repeats them

1. **Hiding the source synchronously inside `dragstart` aborts the drag.** Recorded in
   the dev window: `dragend` 12ms after `dragstart`, pointer still, every time. The
   in-slot hide (`dragActive`) is deferred by a tick.
2. **A snapshot of the pill as the compositor's picture, with the twin off, flattens the
   in-row animation** — the loop that flows the dots around the pill keys off the twin.
   Hence the invisible picture and the strip drawing the pill itself.
3. **`dragenter`/`dragleave` carry no usable `relatedTarget`** in Chromium, so "over the
   row" is a hit-test per `dragover`, never an enter/leave count.

### Guards

- `desktop/tests/session-drag-model.test.ts` — platform fork, MIME payload round trip,
  preload reports facts and never exposes `startDrag`.
- `desktop/tests/session-strip-htmldrag.test.tsx` — pills draggable on Wayland and not on
  Windows; dragstart payload + `move`; adopt vs reorder vs foreign file; `dragend` never
  opens a window; the pill menu's entries and its lone-session refusal.

---

## Still open (filed)

- **A pill dragged into ANOTHER window shows nothing under the cursor there** until it is
  dropped — that window cannot read the payload mid-drag. Fix: main relays
  `{sessionId, name, color}` to peer windows on drag start so the target can draw the
  carried ghost too. `docs/roadmap/user-interface.md`.
- **Long-press → menu on the touchscreen** is wired through Chromium's `contextmenu` on
  long-press but was not exercised live.

## Reproducing the probes

`scratchpad/html5probe/` in session `2647deca` (`main.js`, `page.html`, `preload.js`):
two windows, a draggable pill with a 330px ruler picture, every event to `probe3.log`.
Run with `youcoded/desktop/node_modules/.bin/electron --ozone-platform=wayland main.js`.
`scratchpad/cdp.mjs` there is a dependency-free CDP eval (`node cdp.mjs <ws-url> '<js>'`)
— `scripts/cdp-eval.mjs` needs the `ws` package and cannot run from the workspace root.
