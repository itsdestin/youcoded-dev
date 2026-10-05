# Code review: Home page Edit "organise board" (commit 7fe224a1d)

Scope: commit 7fe224a1d only (read from git, not the working tree). Files:
`desktop/src/renderer/dev/workbench/fixtures/home-assistant-page-edit.ts` (HOME_EDIT_JS/CSS, "edit.ts" below),
`home-assistant-page.ts` ("page.ts"), `desktop/tests/home-page-edit.test.ts`. Static review only; I did not run the tests or a browser.
Line budgets are fine (page.ts 1464, edit.ts 220). No template-literal hazards found in edit.ts (no backticks, `${`, or backslashes).

## Findings

### 1. [High] A refused or finished change that lands during a drag or a long-press is never drawn
edit.ts `edDrop` (the `if (cancel || !d.moved || !t) { if (d.moved) render(); return; }` line) and page.ts `draw()` (`if (edDrag) return;`).
`draw()` skips everything while `edDrag` is true and does not remember that it skipped. `edDrop` only re-renders when the row actually moved. Two ways to lose the catch-up:
- Touch: after the 380 ms hold `edDrag` is true even if the finger never moves. Hold a row for several seconds, release without moving: `d.moved` is false, no render. A "Didn't work" note (`pendFail` calls `render()`), a "Done", or a live rename that arrived meanwhile stays undrawn until some later unrelated push. The same applies to a tap on the dots with no movement, and to `batch()` (its `draw()` is also swallowed and `batchDirty` is reset).
- Any drag that ends with no target (dropped on empty space) also skips the render when `moved` is false only; with `moved` true it renders, so only the no-move cases lose it.
Fix: set a flag in `draw()` (`if (edDrag) { edDirty = true; return; }`) and have `edDrop` always call `render()` when `edDirty` (or just always call `render()` after clearing `edDrag`). Add a test: hold, push a change, release without moving, assert it draws.

### 2. [High] A drag that never gets its pointerup freezes the whole page
edit.ts `edStart` / `pointerup` / `pointercancel` listeners.
Only `pointerup` and `pointercancel` end a drag. If the window loses focus, the app switches away, the pointer is released outside the webview, or capture is lost (`lostpointercapture`), neither fires reliably. `edDrag` then stays true: every live push, check and the Done button's redraw is swallowed and the lifted row floats, until the user happens to click again. Also nothing is keyed to `pointerId`, so a second finger's up/move/cancel ends or steers someone else's drag.
Fix: in `edDrop` handlers also listen for `lostpointercapture`, window `blur` and `visibilitychange` (hidden) and call `edDrop(true)`; record `DR.pid` and ignore events with a different `pointerId`; ignore non-primary pointers in `pointerdown`.

### 3. [Medium] The lifted row drifts away from the finger when the page auto-scrolls
edit.ts pointermove, `window.scrollBy(...)` plus `translate(dx,dy)`.
The transform is computed from the pointer start in viewport coordinates. After `scrollBy`, the row's layout position moves by the scrolled amount but dx/dy does not, so the row visibly slides off the pointer (same with wheel scrolling mid-drag). Auto-scroll also only advances on a `pointermove`, so holding the finger still at the edge does not scroll; on a phone this makes dragging to a far room awkward.
Fix: store `DR.sy = window.scrollY` at start and add `(window.scrollY - DR.sy)` to dy; drive edge scrolling from a `requestAnimationFrame` loop while `DR` is set (cancelled in `edDrop`). Add a test that scrolls and checks the transform.

### 4. [Medium] A non-passive `touchmove` listener on the document is always on
edit.ts last block: `document.addEventListener('touchmove', ..., { passive: false })`.
It is registered whether or not Edit is open, so on every touch scroll of the Home page (and any page sharing this script) the browser must wait on JavaScript before scrolling. That is a scroll-smoothness cost paid by everyone for a feature used by few.
Fix: add it in `edStart` and remove it in `edDrop` (or add it only when Edit is on). Confirm on a real phone that a listener added after touchstart still stops the pan; if not, add it when entering Edit and remove it when leaving.

### 5. [Medium] Choosing a new Room in the settings closes the settings and drops keyboard focus
edit.ts `ED.open` token (`id|list`) vs page.ts `change` handler for `data-move` and `moveThing`.
The open token includes the list key (`id|r:kitchen`). Moving the device changes its list key, so no row matches `ED.open` and the panel collapses and the focused select disappears. A keyboard or screen-reader user (the only non-drag way to move rooms) loses their place and must Tab back from the top. The new-room path (`room-create`, `edCancel` from the settings' own New-room box, and the dashed-zone Cancel) also destroys the focused control with no refocus, because `edCancel` refocuses only when the whole panel closed. The test checks only `roomOfRow`.
Fix: after a move re-point `ED.open` to the new token (and drop-moves close it deliberately), then `focus()` the row's name button; after `room-create`/`cancel` focus the row's name button. Add a focus assertion to the tests.

### 6. [Medium] Pending ledger: a newer press on the same device silently swallows an older refusal
page.ts `renameThing` / `moveThing` with redraw.ts `pendEnd` (`if (!e || e.tok !== tok) return;`).
Rename then move (or drag twice) the same device quickly: the second `pendBegin` replaces `pend[id]`, so when the first call is refused its failure is ignored, its `undo` is never applied, and nothing says "Didn't work". The rename stays shown locally until the hold expires and then quietly reverts on the next check. Same for a refused new-room move whose area was created: if `area_registry/create` succeeds and the following `device_registry/update` is refused, the empty area stays in Home Assistant while the page removes it locally and reports only the move failure (a later retry creates a second area).
Fix: on takeover, chain the old entry's undo into the new one (or refuse a second change on a device while one is pending); on a failed move after a successful create, say so in the message (or delete the area). Add tests for rename-then-move with the first refused.

### 7. [Medium] Refused move puts the device back at the end of its old room
page.ts `moveThing` failure path: `relocate(id, fromId)` appends via `to.items.push(it)`.
Rooms with no saved order lose the device's original position; with a saved order the position is kept only because `order[...]` holds it. Also the drop already saved `order[newRoom]` containing the device before the refusal and never removes it.
Fix: remember the old index (and old order arrays) in `moveThing` and restore them in the failure branch. Test: refuse a move from a room with no saved order, assert the original position.

### 8. [Low] Multi-touch can throw in the long-press timer
edit.ts pointerdown `edHold = {..., t: setTimeout(...)}`.
A second touch before the first timer fires overwrites `edHold` without clearing the old timer. The first timer then runs, sets `edHold = null`, and the second timer reads `edHold.x` on null (TypeError) at fire time. Fix: `clearTimeout(edHold.t)` before overwriting, ignore `!e.isPrimary`, and capture x/y in the closure.

### 9. [Low] Rooms with only remotes lose their saved place when rooms are reordered
edit.ts `edDrop` room branch builds `order.rooms` from the `.edc-room` sections that are drawn; `edRoomHtml` returns '' for rooms with no non-remote items, so they vanish from the saved order and fall to the end (`rank` 1e6). Same for row lists (hidden-by-remote filter). Fix: merge the new order into the existing `order.rooms` instead of replacing it.

### 10. [Low] Escape only works from the two text boxes
edit.ts `edCancel` is reached from the existing keydown handler only for `data-rn` / `data-nr` targets. Focus on the Room select, TV sound select or Earlier/Later buttons: Escape does nothing, and the settings cannot be closed from the keyboard except by Tab back to the name. Fix: handle Escape for any target inside `.edx-menu` (close, refocus the name button).

### 11. [Low] New-room box can keep text and no focus when a second device is dropped on the zone
edit.ts `edFocusBox` / `box.__fx`. Dropping device B on the dashed zone while it already shows the box for device A reuses the same input (`__fx` already set): no focus, and A's typed text stays under "New room for B". Fix: reset `__fx` and clear the value when `newRoomFor` changes.

### 12. [Low] Dead code left behind
- `ED = { open: saved.editOpen || null }` (edit.ts): nothing ever calls `persist({ editOpen })`, so it is always null.
- `PENCIL` icon in home-assistant-page-icons.ts: its only user (the old Rename button) was deleted.
- `edPanel(it, ctx, tok)`: `tok` is unused.
- `DR.room`/`DR.body` flags are fine; `.edc-room .room-head { gap }` etc. are used. `ib` `.grow` leftovers: not found.
Fix: delete these.

### 13. [Low] Empty state can no longer show in Edit mode
page.ts `draw`: `html = rooms... + edNewZone()` is never empty while editing, so `html || '<div class="yc-empty">…'` cannot trigger; with zero devices the user sees "Drag a device here" with nothing to drag. Fix: only append `edNewZone()` when there is at least one room row.

### 14. [Low] Touch targets
`.edc-grip` is 28x36 and star/eye `.ib` are 30x30, under the usual 44 px touch minimum at 390 px; the grip is also where a vertical scroll can no longer start (`touch-action: none`). Consider 40 px wide grip and 36+ px star/eye on `pointer: coarse`.

## Test quality (desktop/tests/home-page-edit.test.ts)

Good: fresh pretend house per test, fake timers (no sleeps), the mid-drag push test, refusal tests that assert the row note, Tab-reachability list, "only the pressed row opens".
Gaps and weak proofs:
- T1 Pointer simulation: events are `MouseEvent` with a patched `pointerType`; no `pointerId`, so `setPointerCapture`, pointercancel, and lost-capture paths are never exercised (findings 2, 8). `getBoundingClientRect` is stubbed to zeros with the drop side steered by clientY sign, so the midpoint maths is not really tested.
- T2 "a quick press only opens settings" (finger test): after the quick tap the test calls `open(b)` directly, so the assertion would pass even if the tap opened nothing. Dispatch the `click` after `pointerup` instead.
- T3 Escape test only asserts the order is unchanged. It should assert `transform` is cleared, `.edc-lift` removed, and that a push sent afterwards is drawn (proves `edDrag` was released).
- T4 "a favourite … not out into a room" only asserts the room-side row stayed in its room. Assert the favourite row is still in `#favs` and no `moveThing` call was made (no registry request).
- T5 Not covered: hold-without-move catch-up (1), page freeze without pointerup (2), scroll drift/auto-scroll (3), focus after moving rooms or after Create/Cancel (5), rename-then-move with a refusal (6), position restored after a refused move (7), Escape from the selects (10).
- T6 `document.elementFromPoint` is replaced and never restored; it leaks into any later test in the same jsdom file environment. Restore it in `afterEach`.
- T7 "moves … saved to Home Assistant" tests rely on the pretend house after `tick(2000); tick(6000)` — fine, but they do not assert a registry request body (only that the next check agrees), so a move that is only local plus a coincidence would pass. Assert the request.

## Triage

Each finding needs a decision. Triage lines:

1. Triage:
2. Triage:
3. Triage:
4. Triage:
5. Triage:
6. Triage:
7. Triage:
8. Triage:
9. Triage:
10. Triage:
11. Triage:
12. Triage:
13. Triage:
14. Triage:
T1-T7. Triage:
