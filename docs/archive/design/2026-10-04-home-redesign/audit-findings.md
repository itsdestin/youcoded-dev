---
status: active
date: 2026-10-04
---

# Home page audit: flickers, jumps and races

What was checked: the page as it stands (`home-assistant-page.ts`, `-live.ts`, `-camera.ts`, `-history.ts`), by reading the code and by running the real page in jsdom against the practice Home Assistant with fake clocks. Scratch tests: `scratch/audit/*.test.ts` (run with `scratch/audit/vitest.config.mjs`). Nothing in the page or `tests/` was edited.

"Confirmed" = a scratch test reproduced it. "Reasoned" = follows from the code, but jsdom cannot show it (real browser behaviour). jsdom has no layout, so jumps in height are reasoned from the markup.

## The one root cause behind most of it

`put()` (page.ts:1001) throws away a whole area (`#rooms`, `#view`, `#dlg`, `#favs`) and builds it again whenever ANY character of its text differs. Every card in every room is rebuilt when one light changes. Anything the person is touching in that area is a brand-new element afterwards. Findings F1 to F4 and F9 are this.

---

## F1. Anything you are holding or typing is lost when something else changes (HIGH, confirmed)

You would SEE:
- You grab a slider and a push (or the once-a-minute check) lands: the slider is replaced and the drag drops. Reproduced: slider replaced by an unrelated push when only grabbed (no movement yet), and replaced by the 1-minute check with the finger still moving. `dragging` is only set on the first movement (page.ts:1391), and `loadHealth()` (page.ts:195), `refreshCameras` (754), `camEvents` (93, 97), `refreshHistory` (88) and `onData` (1484) call `render()` with no `dragging`, `renaming` or `newRoomFor` guard at all.
- Edit mode, rename: you type "Reading lamp"; at the next check the box goes back to "Floor lamp", and `render()` re-focuses it and SELECTS ALL (page.ts:1126), so your next keystroke replaces whatever is left. Reproduced after a push plus the 1-minute check. Only `load()` and the live redraw are guarded (page.ts:162, live.ts:157).
- A keyboard user presses a switch: focus drops to the page body, the next Tab starts from the top. Reproduced (active element BODY, old button gone).
- An open dropdown in Edit (room, TV sound) closes on any redraw; hover highlight and press feedback restart (reasoned).
- Every animation the CSS defines never plays (switch knob `.tog span` 120 ms, light glow 200 ms, thermostat arc `.th-fill` 300 ms, fold chevron). The element is rebuilt already in its final state, so it hard-cuts instead of sliding (reasoned from CSS plus the confirmed rebuild: the old card node is gone after a toggle).

Evidence: `h_focus`, `f_rename`, `d_drag` (second test), `k_pills` (second test).

## F2. A camera with a picture makes every second check redraw every room (HIGH, confirmed)

You would SEE: a quiet house, nothing changing, and every 10 s all cards blink (hover lost, focus lost, a dragged slider cancelled).

How: the camera's picture (a 100 KB-plus text string) is part of the room's drawing text (`src="` + `camCache[id]`, camera.ts:191). `refreshCameras` swaps the picture directly into the page (page.ts:747) but stores it in `camCache`, so the NEXT check (5 s cycle) sees different text and rebuilds all rooms. Measured: 6 full redraws per minute in a house where nothing changed. The new picture element also has to decode again, so the picture can blank for a frame.

Evidence: `b_camera` (1 redraw by 9 s, 6 in the next 60 s). The same string-compare trick means thumbnails (camera.ts:105) cause one extra redraw each time they arrive.

## F3. One press causes two or three whole redraws; startup causes three (HIGH, confirmed)

- One light switched: the page redraws instantly for the press (`setLocal`, page.ts:226), then 10 ms later the pushed state redraws again (brightness comes in with it). Two replacements back to back. Reproduced.
- "All lights" in a room: 3 redraws for 3 lights, because `setLocal` redraws once per light (page.ts:1284, same in Everything off, 1321).
- Startup: first drawing, then one more redraw per camera card, because each camera first draws as an empty grey picture box, then swaps to a note or its events list (reproduced: rooms redrawn 3 times, chips 3 times). Each swap changes the card height, so everything below it jumps, twice.

Evidence: `a_startup`, `m_all`, `n_start`.

## F4. A slow check answer overwrites a newer push; stale for up to a minute (HIGH, confirmed)

You would SEE: you flip the wall switch, the card goes off, and a moment later it goes back ON and stays wrong until the next check, up to 60 s while live (5 s otherwise).

How: `load()` replaces ALL the room data with the answer it got (page.ts:163). If a push arrived while that request was in flight, the older answer wins and nothing re-applies the pushed values (`live.raw` is kept but never replayed). Presses made on the page are protected by holds; changes from the wall, an automation or another app are not. Window is only the round trip, but the damage lasts until the next check.

Evidence: `e_race` (lamp off, then on again after the late answer, back to off 60 s later).

## F5. A press that fails: the switch lies for 8 seconds and the error flashes for half a second (HIGH, confirmed)

You would SEE: press a light, Home Assistant refuses; the switch shows ON; a red message appears and vanishes about 0.4 s later (the next successful check clears it, page.ts:169); the switch stays on until the 8 s hold ends, then flips back with no explanation.

Evidence: `j_misc` (banner gone at +0.5 s, switch still on at +6 s). Same family for sliders, F6.

## F6. A slider drag: left in the wrong place, and the catch-up is late (MED, confirmed)

- The slider's drawing is skipped when the text is identical (page.ts:1002), but a drag changes the slider by hand, outside that text. If the speaker did not take the change (error, or it clamped to the old value), the text for the correct value equals the previously drawn text, nothing is redrawn, and the slider stays where you dragged it. Reproduced: slider shows 85, speaker is at 30, forever.
- Anything that changed while you dragged is held back (intended), but nothing redraws on release: it waits for the next push or check. Reproduced: a lamp switched off mid-drag still showed ON 55 s after release and corrected at about 65 s (with a camera in the house, the camera redraw hid this for up to 10 s).

Evidence: `c_slider`, `d_drag`, `d2_drag`.

## F7. Sonos grouping ticks flip back and forth (MED, confirmed)

You would SEE: tick a speaker; it ticks; the Beam's volume changes (or any push for that speaker arrives) before Home Assistant has finished joining; the tick disappears; then it comes back. The optimistic tick (page.ts:1226) has no hold, unlike switches. Related, reasoned: `liveApply` rewrites a device's name from the last-known pushed name on every push (live.ts:114), so a rename (`setLocal`, page.ts:1150, no hold) can flip back to the old name for up to 400 ms if any other push for that device lands in between. Home Assistant normally pushes the new name too, so this one is rare.

Evidence: `i_group`.

## F8. The pop-up (MED, confirmed)

You would SEE: open a device; within a moment its history arrives, and the pop-up is rebuilt: keyboard focus drops to the page behind it (so Tab is no longer kept inside; Escape still works), scrolling inside it jumps back to the top, and "Reading its history…" is replaced by a taller list so the pop-up jumps in height. Any change to that device while open rebuilds it again.

How: `put('dlg', …)` replaces the whole pop-up (page.ts:1110); `refreshDevice` always ends with `render()` (history.ts:97). `openDevice` focuses the pop-up (history.ts:229) before the history arrives, so the focus is lost almost immediately.

Evidence: `g_dialog` (dialog element replaced, focus on BODY, Tab not trapped).

## F9. A playing clip is detached and restarted on every redraw (MED, confirmed mechanism; stall itself reasoned)

`mediaHold/mediaBack` (camera.ts:225) keep the same video element and press play again after each redraw. A browser pauses a video when it is removed from the page, so each redraw is a pause plus a restart: a stutter, and the controls flicker. With F2 and F3 that is several times a minute while a clip plays in a house with a camera picture. Reproduced: 1 `play()` per redraw, 3 after three changes. The live-video canvas survives (a canvas keeps its picture).

Evidence: `l_clip`.

## F10. Work while hidden (LOW-MED, reasoned)

Checks, camera pictures and redraws correctly wait while the page is hidden (`document.hidden` guards at live.ts:41 and page.ts:741; pushed redraws wait for animation frames, which do not run while hidden). The live camera video does not: `startLive` has no hidden or leave handler (camera.ts:142), so frames keep arriving and being drawn after you switch away, until Stop. Not run (needs the real app's video).

## F11. Smaller things

- Long-press that opens the pop-up sets `pressed` (history.ts:270); it is cleared only by the next click. On touch, where a long press can produce no click, the first tap on Close could be swallowed (reasoned, not run).
- Content that pops in late: camera events and thumbnails after the picture box, weather in the Climate page after the thermostat (extras answer), the problem count, the pop-up's history, Activity's list ("Reading the house's history…").
- Activity list refreshes at most every 30 s while open and redraws the whole list; new events at the top push what you were reading down (reasoned).
- `setLocal` rebuilds all text once per light for "All" and "Everything off" (cost, not a visible blink).

## Checked and found sound

- Hold logic (`applyHeld`, `applyHeldVals`) releases correctly when the house agrees, and presses survive a late push (existing test plus `a_startup`).
- Unchanged checks do not touch the page (`put` no-op): hover and focus survive quiet checks, except for F2.
- Reconnect/resubscribe, the "Reconnecting…" note and 5 s versus 60 s checking are right.
- The host already blocks the page's own save echo (PageHost.tsx:296-317), so the old "remote flickers closed" does not recur.
- `castStale` (page.ts:432): could not make it flicker. It compares two devices' clocks; in the normal power-on order the old cast title is already hidden in the instant switch-on, so no pop in/out. Low risk, not proven either way against a real TV.
- Camera pictures, polling and the 5/60 s checks stop while hidden.
