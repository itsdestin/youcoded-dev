---
status: active
date: 2026-10-05
---

# Code review: Home page redraw fixes (commit e18c40b0d)

Scope: the commit only (fixtures/home-assistant-page*.ts and the five home-page-*.test.ts files plus harness). Paths below are under `youcoded/desktop/src/renderer/dev/workbench/fixtures/` unless they start with `tests/`. Line numbers are in the commit's version of each file. Read-only review; one scratch script (not in the repo) confirmed finding 1.

Overall: A-1 (in place), A-4 (pending), A-7 (stay) do what was picked and the flicker tests are real behaviour tests. Problems are below, worst first.

## 1. MED. Removing one card makes every card after it get pulled out and put back (confirmed)

`home-assistant-page-redraw.ts:55-70` (`patchKids`). `pos` stays on the old node that is about to be deleted, so for every following card `an !== pos` is true and `a.insertBefore(an, pos)` MOVES it. Scratch run: old `[a,b,c]`, new `[b,c]` produced `rm b, add b, rm c, add c, rm a`. A move is a remove plus an insert, so the moved card loses keyboard focus, restarts its CSS animation, and a playing clip in a camera card pauses. This is the exact F1/F9 harm, now triggered by a device appearing or disappearing, a room being hidden in Edit, or a view switch. The unkeyed branch has the same shape (a match found past `pos` is moved).
Fix: before the loop, compute the set of new keys and drop old children that will not be reused (or advance `pos` past old nodes whose key is absent from the new list). Only call `insertBefore` when `an !== pos` AND `an` is not already in correct order (i.e. `an.nextSibling` walk). Add a test: remove the first card from a list while one later card has focus and assert it is the same node and still focused.

Triage: accepted — keyed reorder that moves only what moved (never remove/re-add unmoved cards); test with a device appearing/disappearing/hidden mid-list.

## 2. MED. A name you are typing reverts if the box loses focus (reasoned from code)

`redraw.ts:35-39` (`keepAsIs`) protects the rename / new-room box only while it is `document.activeElement`. Before this commit the page refused to draw at all while `renaming` / `newRoomFor` was set. Now: click on empty page (or a Tab to another control) with the box still open, and the next push or check resets the box text to the old name, silently. The test only covers the focused case.
Fix: for `data-rn` / `data-nr` elements, return true when `renaming` / `newRoomFor` is set, whether or not focused. Add a test that blurs the box, then pushes.

Triage: accepted — keep an open rename/new-room box's text across draws whether or not it has focus; test.

## 3. MED. Every click, tap and touch-scroll start forces a full redraw of the whole page

`redraw.ts:80-82`: `released` is bound to `pointerup` and `pointercancel` on the whole document, and does `drawn = {}` then `renderSoon()`. Clearing `drawn` disables the "unchanged text, skip" shortcut in `put()`, so every area (bar, rooms, favourites, view, pop-up) is rebuilt as HTML, parsed, and compared with the page, for every pointer release anywhere. On touch, starting a scroll fires `pointercancel`, so scrolling triggers it too. On a big house or the Activity list (hundreds of rows) this is the most expensive thing the page does and it happens for no reason.
Fix: in `released`, return early unless `gripping || dragging` was set (`var was = gripping || dragging; if (!was) return;`). Keep the `change` listener.

Triage: accepted — `released` returns early unless a slider was held.

## 4. LOW-MED. A-3 was picked as "newest wins (stamp)" but built as "replay after check"

`live.ts` (`liveApply`/`liveReplay`, ~lines 111-134) and `page.ts` `load()` (~167-185). Arrival time on the page is stamped on each pushed entity, and after a check lands, pushes that arrived since the check was asked are laid back on top. That is the deck's "replay" option (cheaper, and weaker): it cannot order two different sources by when things happened, only by when this page heard about them. Two practical gaps:
- A check whose answer reflects a change whose push is still in flight, with an older push arriving first, shows the older value until the next push (small window, self-heals).
- The pending-change undo (finding 5) and a refused slider write the old snapshot over anything live that arrived since, and nothing replays.
Either say in the commit/roadmap that A-3 landed as "replay" (the deck pick was explicit) or add per-entity last-change time from the house's own `lc` for the comparison. Also `liveReplay` iterates all of `live.raw` per load: fine, but note it.

Triage: accepted — build the picked form: every pushed/checked state carries a stamp; older never overwrites newer.

## 5. LOW-MED. Undo restores an old snapshot over newer data

`redraw.ts:110-117` (`undoAll`), `:135-141`, `:151-154`. On refusal, the saved `before` values are written back and the holds deleted, with no check that the house has not changed those fields since. `service()` schedules `load` after 400 ms so switches self-correct; the slider path (`quiet` -> `sliderFailed`, `page.ts:1377`) does NOT schedule a check, so with live on the wrong value can stay up to a minute. Also: sliders send coalesced requests; if an EARLIER send fails after a LATER one succeeded, the card is reverted to the pre-drag value and says "Didn't work" although the house has the new value.
Fix: after `sliderFailed` call `setTimeout(load, 400)` like `service`; ignore a failure from a send that is not the newest for that key (store a sequence number per key in `quiet`).

Triage: accepted — undo only fields still showing the guess; a refused slider schedules a re-check; an older failure never reverts a later success.

## 6. LOW-MED. The Sending / Done / Didn't-work row changes card height, so everything below jumps

`redraw.ts:13` and `pendHtml` (:155-165). A slow press adds a row after 0.5 s, "Done" removes it after 1.5 s: two height changes per slow press, and a pop-in on failure. The audit was about jumps. The card is also inside the pop-up and inside room columns.
Fix: give cards a reserved line (min-height on the row, visually empty when quiet) or overlay the note at the card's bottom edge. Needs a UI call; at least say so to Destin.

Triage: accepted — the pending line takes no extra height (overlay or reserved line).

## 7. LOW. "One list of pending changes" (A-6) is three lists

`redraw.ts` `pend`, `undoBuf`, `dragBefore`, plus the existing `held` and `heldVal`. Sliders are in `dragBefore` + `heldVal`, switches in `pend` + `held`, names/groups in `heldVal` + `undoBuf`. Retry (`pend[r].again()`) re-sends but does not show the guess again (the card stays at the old value until the next check, because `undoBuf` is empty on a retry click), and the first-click-clears-undo capture listener (`:107`) is what keeps unrelated setLocal calls from attaching to the wrong press, which is fragile. Not a bug today; a roadmap note is enough.

Triage: accepted — fold pend/undoBuf/dragBefore/held/heldVal into one pending list; Try again re-shows the guess.

## 8. LOW. `setLocal` now holds every non-state field for 8 s

`page.ts:242-248`. Thermostat `target`, `rgb`, `k`, `muted`, `group`, `name` are all held 8 s against the house. If the device clamps the value (set 80, device caps at 78) the card shows 80 for 8 s, then snaps. It also now changes only the first matching item (`thing(id)`) where the old loop changed every match. The deck pick was groups and names. Fix: hold only `group` and `name`, or shorten for the rest.

Triage: accepted — hold a field only until the house reports a value (or the send fails), not a blanket 8 s.

## 9. LOW. Pop-up "draw once, update parts" is just the in-place update plus a fixed reserve

`history.ts` diff and `redraw.ts:20`. `.dlg-hist { min-height: 11em }` leaves a permanent blank gap under a short or empty history and still jumps if the list is taller than 11em. Acceptable, but the claim "does not jump" is only true for short lists. The second popup test (`tests/home-page-popup.test.ts`, "reserves room") only checks that `.dlg-hist` exists, not that it has a height, so it proves nothing about the jump.

Triage: accepted — size the history area to its content with a smooth min-height, test real behaviour.

## 10. LOW. A-2 left the startup camera jump alone

Coalescing only merges changes that land in the same frame; a camera's empty grey box then note/list still arrives in separate frames, so the height still jumps at startup (audit F3 third bullet). The "keep the picture out of the page text" cost remains too: a 100 KB data URI string is compared on every draw. Not wrong; the deck's "once" pick said it would also cover this and it does not fully.

Triage: accepted — reserve the camera card's height from the start.

## 11. LOW. Morph edge cases

- `redraw.ts:49`: a slot that gets a different `data-clip-slot` / `data-live-slot` value on the same element keeps its old video/canvas child (kids are skipped once the new attribute is present), so two players can end up in one slot.
- `redraw.ts:55-70`: unkeyed siblings are matched greedily by tag, so an element can be re-used as a different kind of thing (e.g. an `input` repurposed). `box.__fx` (`page.ts:1118`) then stays set on a re-used box and the next rename box does not take focus.
- `used.indexOf` inside loops makes a list of N unkeyed rows O(N^2) per draw (Activity list with hundreds of rows).

Triage: accepted — key media slots by id; never reuse an element across kinds; clear one-time flags; keyed rows.

## 12. Tests

- `tests/home-page-pending.test.ts` "keeps a new name": the gate checks `(req as any).socket?.send`, which a fetch request never has, so the rename is never held back and `release()` does nothing. The test passes through the hold, not through a slow rename. Fix: gate on the real registry call (see how `registry()` sends) or drop the dead gate.
- `tests/home-page-harness.ts`: the pretend house is module-level state with no reset (`fake-home-assistant.ts` has no reset export). Volumes, light states and speaker groups persist from test to test inside one file; `flip` hides it for lights, but the speaker-tick test leaves `roam_2` joined, so it passes only the first time in a run (this is the "passes only after others" the author saw; run order or `--sequence.shuffle` breaks it). Fix: add `fakeHomeAssistantReset()` and call it in every `afterEach`.
- `tests/home-page-redraw.test.ts` "keeps a slider you have grabbed": it uses `el.focus()`, not a `pointerdown`, so the `gripping` path (finger down, not moved) is never exercised. Dispatch `pointerdown` on the slider.
- Same file, quiet-minute test: `obs.disconnect()` throws away records not yet delivered; call `obs.takeRecords()` first. It also watches only `#rooms` childList, not `#favs` / `#bar` or attributes.
- The harness patches `EventTarget.prototype.addEventListener` globally to track listeners. Works because vitest isolates files, but any import that adds a listener at module load is tracked and removed by `unmount`. A comment saying so would help.
- No test for finding 1 (removal), 2 (blur), or the retry button. Fixed sleeps: none; all time is fake (`tick(61_000)` is faked). Good.

Triage: accepted — fix the rename gate, reset the fake house between tests, drive sliders by pointer events, takeRecords before disconnect, add tests for 1, 2 and Try again.

## Checked and fine

- Template-literal hazards: `Didn\\u2019t` in `HOME_REDRAW_JS` correctly becomes `’` in the page; no backticks in the new template text; `history.ts` is `String.raw` and its edit has no escapes.
- Leaks: new document listeners are added once at page start (not per card); per-press timers are cleared in `pendEnd` or no-op when superseded; failed notes stay until dismissed but are one object per card.
- Line budget: `home-assistant-page.ts` is 1493 lines (budget 1500) after moving the icons out; only 7 lines of headroom, so the next change here needs another move-out.
- Focus, `aria-pressed`, data attributes: attributes are patched from the new drawing, so handlers (all delegated on `document`) never see stale `data-*`. The new `.pend` rows use `role=alert` for failures and `role=status` otherwise, with real buttons.
- Work while hidden: `renderSoon` waits on animation frames; nothing new runs while hidden.
