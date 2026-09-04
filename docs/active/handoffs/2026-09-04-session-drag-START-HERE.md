---
title: Session drag between windows — everything measured, one decision left
date: 2026-09-04
status: active
supersedes: docs/active/handoffs/2026-09-03-session-drag-START-HERE.md
---

# Read this first

Three bugs in dragging a session pill between windows. **Two are fixed, tested and
pushed. The third — what the drag LOOKS like on Wayland — is blocked on one decision
from Destin, described at the bottom.** Everything below was measured on the real
desktop, not assumed. Nothing here needs re-deriving.

---

## Status

| Thing | Where it stands |
|---|---|
| **History was wrong after a tear-off** | **FIXED.** PR [#409](https://github.com/itsdestin/youcoded/pull/409), branch `fix/tearoff-history`, head `b1d78c2d`. Rebuilt on today's master, CI green on Linux/macOS/Windows + Android, `MERGEABLE`. Not merged — Destin's call |
| **Could not drag a pill back into a window on Wayland** | **FIXED and pushed**, branch `feat/session-drag-handoff`, head `39ee01e6`. `verify.sh` green. **No PR opened yet** (so no CI run yet) — opening one is Destin's call |
| **What the drag looks like** | **BLOCKED on a decision.** The picture the compositor drags cannot exceed 138px wide. Three options at the bottom |
| Workspace docs | The Wayland rule + `scripts/platform-probe.mjs` are on `youcoded-dev` branch `docs/tearoff-followups`. Investigation + 3 roadmap items already on `youcoded-dev` master |

**Worktrees in use:** `worktrees/fix-tearoff-history`, `worktrees/feat-session-drag`.
A dev instance may still be running — `bash scripts/run-dev.sh feat/session-drag-handoff
--label "Wayland Drag"` started it; kill the Vite on port 5223 and its Electron when done.

---

## 1. The history fix (done)

Two independent causes, both found by probing, both now guarded by
`desktop/tests/tearoff-handoff.test.ts`.

**a. The handoff landed before anyone could hear it.** A tear-off hands the session to a
`BrowserWindow` created one statement earlier, and `webContents.send` into a renderer
whose React tree does not exist yet is **dropped, not queued** (measured on Electron
41.10.7). So the whole handoff silently did nothing: no history, no "open on the session
you dragged", no re-sent permission prompt. The new window now **pulls** on mount
(`detach:claim-pending`); `PendingAcquireQueue.isReady` keeps push and pull exclusive so a
payload arrives exactly once. Same shape as `BUDDY_OVERLAY_READY`.

**b. The first page of history stopped in the wrong place.** `TRANSCRIPT_PAGE` normally
stops at the transcript watcher's `startOffset`, because everything past that byte already
reached the requester over the live stream — true of a window that was listening, false of
one that just inherited the session. `WindowRegistry.markInheritedByTransfer` is a one-shot
exemption: the inheriting window's first page reads to end of file.

---

## 2. Why the drag was broken (measured, do not re-litigate)

On this machine — Electron 41.10.7, KDE Plasma, Wayland — with the pointer actively moving
over the app's own focused window. Re-runnable: `node scripts/platform-probe.mjs`.

```
screen.getCursorScreenPoint()  ->  {x:0, y:0}   every sample
win.getPosition()              ->  [0, 0]       every window, whatever was requested
win.setPosition(1200, 300)     ->  a no-op that STILL REPORTS SUCCESS
window.screenX / screenY       ->  0            every window
```

Every cross-window step of the old drag resolves from one of those, so peer windows never
highlighted, the torn-off window never followed the cursor, and the drop always resolved to
"you dropped it on nothing" — which, with the correct Chrome-matching rule that a window's
only session cannot be torn off, left the pill nowhere to go.

**The distinction that matters:** window-local coordinates (`clientX`) work perfectly on
Wayland. Only SCREEN coordinates are dead. So only the cross-window half needed replacing.

**A wrong turn worth not repeating:** the first draft disabled the whole pointer path on
Wayland, which would have flattened #404's in-strip motion to fix a cross-window problem.
Destin caught it ("pretty sure it was fine during testing" — he was right).

---

## 3. The drag that now works: "promote on exit"

The pointer path still runs inside the strip, untouched, so the motion from #404 is intact.
When the pill is pulled 60px clear of the strip, the gesture is handed to the **compositor**.

- `SessionStrip` → `detach.dragHandoff({sessionId, icon})` at the existing tear-off
  threshold (`session-drag-model.ts` picks `os-drag` only on Linux+Wayland).
- Main calls `webContents.startDrag({file, icon})`. **That call returns when the whole drag
  ends**, which is the completion signal.
- The destination window gets `dragover`/`drop` in its own window-local coordinates and
  sends `detach.dragAdopt({sessionId})`. Main resolves the SOURCE from the
  `WindowRegistry`, never from the payload, so a forged drop cannot move someone else's
  session.
- Released over nothing → main tears off into a new window, unless the source owns only
  that one session (Chrome's rule; the guard lives in main, not the strip, so a lone
  session can still be dropped INTO another window — that was the original complaint).

### Three things measured before writing any of it

1. **A gesture cannot be promoted from inside the page.** Setting `draggable=true`
   mid-drag never fires `dragstart`; the browser decides at mouse-down. `startDrag` is the
   only API that can begin a drag mid-gesture.
2. **`startDrag` drags FILES**, with no way to attach a payload, so the session id rides on
   a temp file's NAME and is read back from `dataTransfer.files[0].name`. Dropping the pill
   on a file manager therefore leaves a small empty `.ycsession` file — accepted cost.
3. **The receiving window must accept the drop as a `copy`.** A file drag offers `copy`;
   asking for `move` makes Chromium reject the drop **silently** — `dragover` fires forever
   and `drop` never arrives. Three drags, zero drops, no error anywhere. It read exactly
   like "the compositor won't deliver drops" and nearly sank the design. **Do not "correct"
   this to `move` because a session is being moved.**

Also: the source window gets `lostpointercapture` the instant the OS takes over and
`pointerup` only when the drag ends, so the strip tears its drag state down explicitly at
handoff (`handoffCleanup`). Without that a ghost pill is left stranded on screen.

### Guards

- `desktop/tests/session-drag-model.test.ts` — platform matrix, the file-name payload round
  trip, and that preload reports facts rather than deciding.
- `desktop/tests/session-strip-osdrag.test.tsx` — adopt vs ignore a real file drop, the
  copy-vs-move drop effect, that pills are never HTML5-draggable (which is what keeps the
  motion's `pointermove`), and that Windows is untouched.

What jsdom cannot prove — that the compositor delivers a drag between two real windows —
was measured directly instead: drops in both directions, session id intact.

---

## 4. The drag PICTURE: a hard 138px ceiling

Destin's report: "the dragged session window is rendering weird in a tall narrow truncated
box thing." It was the approved 330px card, cropped.

Measured three ways, all on the real desktop:

| Round | Picture handed over | What appeared on screen |
|---|---|---|
| The app's card | 651 × 355 px | 138 × 354 — centre slice, full height |
| Ruler, wide | 600 × 300 px | 138 wide — centre slice |
| Ruler, narrow | 150 × 300 px | 150 → cut to 138; both edge stripes still visible |
| Ruler, wide, tagged `scaleFactor: 5` | 600 × 300 px, **reports 120 × 60** | **120 × 60, complete** |

**Conclusions, all three consistent:**

- The drag picture is drawn at the size the image **reports**, one screen pixel per image
  pixel — the Wayland drag path ignores the 1.5× display scale entirely, which is also why
  it looks small next to everything else.
- Report more than **138px wide** and it is cropped to 138, centred. Height is unbounded
  (355 came through whole).
- `nativeImage` honours `scaleFactor` (600px tagged 5 reports 120), but that only SHRINKS
  the reported size, so it cannot buy width. **There is no workaround at this layer.**

Not the cause, ruled out: it is not the pill's width (131 CSS px, a different number in
different units), and it is not proportional (the 150px picture kept 92% of itself).

### The workaround that does exist

The system only draws that one picture — it does not stop the app drawing. Once the cursor
is inside a YouCoded window, that window receives `dragover` with working window-local
coordinates (hundreds per second, measured), so **it can paint the full-size card itself,
with no size limit.**

Plumbing it needs: the receiving window does not know WHICH session is in flight — the
desktop withholds the payload until drop — so main must broadcast `{sessionId, name,
color, messages}` to every window when the handoff starts. `SESSION_DRAG_STARTED` already
exists to extend.

---

## 5. THE DECISION (this is what a new session should start with)

Candidates rendered at true size:
`docs/active/handoffs/images/2026-09-04-drag-picture-candidates.png`
(regenerate from the `.html` beside it: `node scripts/ui-probe.mjs "file://<path>.html" --size 780x360 --shot <out>.png`).

1. **Hybrid** — the app paints the full 330px card whenever the drag is over one of its
   windows; a small 138px chip elsewhere. Best result where it matters. Cost: the picture
   changes size as you cross a window edge, because two different things draw it.
2. **Hybrid, nothing outside** — full card inside the app, bare cursor over the desktop.
   No size-change seam, but dragging to empty desktop to make a new window gives no
   feedback at all.
3. **Small chip only** — one of A (name + dot, 138×40), B (mini window with messages,
   138×150) or C (mini window, name only, 138×84). Least work, consistent everywhere,
   permanently small. B is the closest to what Destin approved on 2026-09-03.

Whatever is chosen, `SessionDragPreview.tsx` (the React component from commit `5307b3cd`)
is dead — `startDrag` takes a bitmap and there is no `dragstart` to snapshot a DOM node
from. The current painter is `desktop/src/renderer/session-drag-image.ts` (canvas, theme
tokens, no border and no shadow — both fringe against the compositor's compositing of
partly-transparent edges; Destin picked that treatment from five).

---

## 6. Still open, beyond the decision

- **Open a PR for `feat/session-drag-handoff`** — nothing has run CI on it yet.
- **Right-click a pill → "Move to new window" / "Move to → window N".** Roughly half an
  hour, cannot fail on any platform, works by keyboard, and it is the only escape when a
  drag breaks. Filed in `docs/roadmap/user-interface.md`.
- **The drop target is the session bar only**, so releasing over another window's chat area
  makes a THIRD window instead of moving it there. Also filed.
- **Merge `docs/tearoff-followups`** (the Wayland rule + probe script) after #409 lands —
  its anchors name files that only exist on that branch, so it is red until then.
- **Do not copy this work's `docs/MAP.md` rows over.** Master gained a pills hot-path row
  and one for #404's `header/drag-order.ts`; re-derive against today's MAP.

## 7. Reproducing the probes

`scratchpad/handoff/` in session `a3186e5c` holds the two-window drag probe (`main.js`,
`page.html`, `preload.js`, `package.json`) — run with
`youcoded/desktop/node_modules/.bin/electron main.js`. It logs every event to `probe2.log`
so nobody has to read results off the screen. `scratchpad/sfprobe/` is the windowless
`nativeImage` scale-factor test. Both are trivially rebuilt from the descriptions above.

**A trap that cost a round:** an inline `<script>` with no closing `</script>` does not
execute at all in Chrome. The probe page looked fine and did nothing.
