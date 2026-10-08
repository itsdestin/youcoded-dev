---
status: shipped
shipped_ref: youcoded#616, youcoded-dev#250
---

> **Shipped in youcoded#616 (merge cc3bd0de0) and youcoded-dev#250 on 2026-10-08.** Everything below describes work that is now on master; wording like "on the branch" or "not merged" is how it read before the merge. Open items live in [`docs/roadmap/perf.md`](../../roadmap/perf.md).
# 2026-10-05 Session switching: fix and before/after

## Session switching — fix and before/after

### In plain words
Every time you switched session, the app quietly rebuilt a pile of things you could not see: the whole
Settings panel, the slash-command drawer with all its skill cards, about 28 closed pop-up windows, and the
session strip measured its own width in a way that forces the screen to recalculate. None of that was ever
on screen. Now a closed panel or pop-up is skipped completely until you open it, and the strip remembers its
width instead of re-measuring on every switch. Nothing looks or moves differently.

One new behaviour, approved by you separately: after you pick a session yourself in chat view, the message box
takes the cursor, so typing straight after a switch works (it used to go nowhere, because the cursor stayed
on the session button).

### Numbers (what React redraws per switch; test with 8 sessions open)
| Thing | Before | After |
|---|---|---|
| Settings panel (and its report form) | 2 | 0 |
| Command drawer / its skill cards | 2 / 18 | 0 / 0 |
| Closed pop-up windows (Dialog) | 28 | 0 |
| Session strip layout measurements | 1 | 0 |
| App shell / strip / header / status bar / input bar | 2 / 3 / 3 / 2 / 2 | unchanged (genuine work: new session selected) |

Real packaged app on the rig (software drawing, 6 sessions, real mouse clicks). Page-script time per switch,
averaged over the whole window: chat small-to-huge 1 s apart 18.0 to 13.6 ms; 250 ms apart 9.8 to 9.1; huge-to-huge
14.2 to 13.8 and 8.4 to 9.2 (within noise). Click-to-shown p50/p95/max is two frames either way (e.g. 250 ms
huge-huge 25.6/26.3/26.5 before, 22.1/22.9/23.0 after; 1 s small-huge 27.2/32.5/32.8 before, 30.2/33.4/34.2
after: no measurable change, the rig cannot resolve less than a frame). Terminal-to-terminal after: show
22 ms, settled 37-40 ms; its "before" run was started above load 8 (show p50 49-113 ms, max 338) so I do not
claim that improvement. Style recalcs (26-36) and layouts (20-24) per switch did not change.

### What the native cost is made of (one Chromium trace, 17 switches, 1 s apart, huge-huge)
Per switch, main thread: about 32 ms (before) / 30 ms (after) of browser work: style 15 / 12, layout 3,
painting 12 / 13; script about 10; plus roughly 90-100 ms of drawing-and-swap on the (software) compositor.
27 style recalcs touching about 490-620 elements, 20 layouts that re-lay only about 240 of 1,270 objects. The
named reasons are "related style rule" (130), tag-name selector matches (117) and "Animation" (80) per switch: that
is the session pill growing and the chat-arrival fade running every frame. This is the motion itself; the
rules (`session-strip-motion.md`) forbid changing it and a width-to-transform swap is not pixel-identical, so I
left it. No contained, non-visual fix surfaced. Raw files: `scratch/perf-lab/switch/fix-before|fix-after`.

### What changed (app repo `session/perf-switch-marks-20261005`)
- `memoWhileClosed` (new, `components/memo-while-closed.ts`): a memo that ignores prop changes while a surface
  is closed and renders with current props the moment it opens or closes. Applied to Settings, command drawer,
  report form, first-time warning, resume browser, close prompt, preferences, model picker, open-tasks popup, and
  the unsaved-files prompt (plain memo). Closed `Dialog` itself already renders nothing; the cost was parents
  rebuilding it. First open of Settings/drawer is the same code path as before (panels were always mounted).
- `SessionStrip`: the room is cached from the resize observer (layout is clean there) and once per theme;
  `repack` is stable so the observer is no longer torn down and re-created on every switch; an unchanged pack
  keeps its object.
- Tests: `busy-app-render-budget` (new "one plain switch" table, red on old code: 2/2/2/18/28 renders and 1 style
  read), `memo-while-closed`, `SessionStrip-layout-effects` (source pin), `focus-composer-after-switch`.

### Composer focus after a switch
After a pointer switch in chat view (pill press/click, All Sessions row click, pill drop) the message box takes
focus. Not for Enter/Space on a pill or row, the Shift-hold switcher, or automatic switches. Skipped in terminal
view, on touch/pen, narrow or coarse screens, Android, with a dialog open, a disabled box, or focus in another
field/editor/iframe. No scroll, no layout read, strip markup untouched. A press that becomes a reorder drag focuses
the box a frame early: harmless, accepted. Known edge: after a mouse switch the box holds focus, so the Shift-hold
switcher will not start until the composer's usual idle blur (about 3/4 s). You will notice: typing right after a
mouse switch lands in the box.

### What could be noticed
Nothing visual from the speed work. Settings opened while the app is idle shows identical content. Only the focus
change above.

### How sure / what remains
Render counts: certain (counted). Rig times: the software-drawing rig cannot see differences under a frame and
runs shared a busy machine; treat them as "no regression". Real-screen gain (native 75-140 ms at 2560x1600
@180 Hz, glass/particle themes) is unmeasured: the real-GPU invisible display was not run. The remaining shell
cost is the 2 AppInner renders per switch (selection plus the provider-type hook) and the pill/arrival animation
(style + layout per frame). Smaller readers checked: `Tooltip` measures only while open; the strip drag loop runs only
during a drag or settle; `use-stick-to-bottom` reads scrollHeight once to pin on arrival (needed, layout was dirty anyway).
