# Code review: Home Assistant Home page (page script, templates, tests)

Branch `session/ha-pages-connection`, diffed against `origin/master`. Slice: `fixtures/home-assistant-page*.ts`, `tests/home-page-*.test.ts`, `tests/home-page-harness.ts`. No contract file: correctness only. Nothing fixed, nothing committed.

## verify.sh summary

`bash scripts/verify.sh youcoded`:
- Run 1: types PASS, knip/lint/design lint/ast-grep/shoot --check/journeys PASS; `tests (related)` FAIL with 1 unhandled error `window is not defined` from `tests/app-welcome-back-gating.test.tsx` (ResumeBrowser, not this slice). It ran while I was running other vitest processes, so load.
- Run 2 (rerun once): every check PASS (types, tests related, knip, lint, design lint, ast-grep, shoot --check, journeys).

I also wrote three throwaway vitest files in `youcoded/desktop/tests/` to confirm F1, F2 and F3 against the real page and the harness (output quoted in each finding). They are deleted; `git status` shows no tracked changes.

## Findings (most severe first)

- F1 — home-assistant-page-live.ts:117 and :143-145 — `liveStamp` returns `raw.lu || raw.lc`, and `liveEvent` never clears `raw.lu` when only `lc` arrives, so after one attribute-only push (lu) every later state-change push is stamped with the OLD lu; once a check has landed with a newer `upd`, `liveApply` (line 122) throws the push away and the card stays wrong until the next check (60 s while live). Real Home Assistant sends `lc` alone on a state change (it only adds `lu` when only attributes changed), so this is the normal sequence (brightness change, then switch off). The stamp should be max(lc, lu). — Confirmed in a scratch test: push `{a:{brightness:120}, lu:1000}` then `{s:<other>, lc:now+50}` leaves the lamp un-flipped (`S1 flipped? false`). The shipped tests (`home-page-newest-wins`, `-slider-target`, `-live`) always send lc and lu together, which is why nothing catches it. The "Home Assistant sends lc alone" part is from memory of HA's `_state_diff`, not checked against a real house, so the real-world trigger is PLAUSIBLE; the logic flaw itself is confirmed.

- F2 — home-assistant-page-pending.ts:86 and :136 (`dropSettled` / `settle`) with home-assistant-page.ts:247 (`setTimeout(load, 400)`) — a switch press whose send was ACCEPTED has its hold dropped by the first check asked afterwards (about 400 ms later); if the device has not reported yet (Hue answers about a second after the call) that check shows the OLD state, so the card flips to the new state on press, back to the old one at about half a second, and forward again when the push arrives. This is the flicker the 8-second hold was added to prevent, and it is exactly the rubber-banding Destin reported, for switches (the slider "target" fix only covers `brightness`/`vol`, `TARGETS` at pending.ts:45). — Scratch test: accepted `light/turn_on|off` that the fake house does not act on; sampling the lamp every 250 ms gave `[false,false,true,true,true,true,true]` with the press to false (the pressed state shows for two samples, then reverts to the old state with no report from the house).

- F3 — home-assistant-page.ts:437-478 (`tileHtml`, also `mvKeys` in home-assistant-page-media.ts:41) — for a TV with a paired remote whose Cast side is stale (`castStale`), `playing` is forced false but the "Now playing" label, the moving equaliser class (`it.state === 'playing'`) and the Pause icon (`isPlay = it.state === 'playing'`) still come from the raw stale state, and `nowHtml` is drawn anyway because `(tv && rc)` is true. So the exact case the stale-title logic exists for (TV restarted, Cast still says playing) shows "Now playing", dancing bars, a Pause button and the title "TV". — Scratch test: remote pushed `on` with a newer `lc`, activity `tvlauncher`: `S2 lbl= Now playing eqOn= true ttl= TV mainIcon pause? true`.

- F4 — home-assistant-page.ts:1024 (`thermoHero`) and the template (`target` only reads `temperature`) — a thermostat in heat/cool (Auto) mode has `temperature` = null (it uses target_temp_low/high), so `hasSet` is false and the dial says "Off" with "—" and no − / + buttons while the Mode button "Auto" is pressed and the room is being heated or cooled. The template does not fetch `target_temp_low` / `target_temp_high` at all. — Read the code path (`hasSet = it.target != null && mode !== 'off'`, label `hasSet ? doing + ' to' : 'Off'`); not run against a heat_cool fixture. PLAUSIBLE for Nest in Auto.

- F5 — home-assistant-page-camera.ts:337 — `camTabSync` starts live video for only the first `CAM_MAX_LIVE` (4) Nest cameras, but `camTileHtml` (line 428) shows "Starting live view…" for any Nest camera with no live state, so a fifth camera's tile says "Starting live view…" forever. The 4 that stream are also the first in house order, not in the order the tab draws (`ordered(..., 'cameras')`), so the tiles that stream may not be the top ones. — Read the call chain; no test for more than 4 Nest cameras (the fake has 3).

- F6 — home-assistant-page.ts:1295-1296 and :146-148 — pressing Edit writes `persist({ editing })`, and the page start-up reads `saved.editing`, so a page left in Edit mode reopens in Edit mode (slim rows instead of cards). Every other start-up toggle that tests seed (`startOpen`, `startPalettes`, `startScenes`) is deliberately never written by the real page; `editing` is the one that is. Tests seed it (`mount({data:{editing:true}})`) so it looks intended for review screens only. — Read; likely unintended, not run.

- F7 — home-assistant-page-camera.ts:196, :207, :210, :214 — `thumbBusy` is set true on first request and never reset when the fetch fails or returns non-200; the next list refresh copies `thumbBusy` onto the same event (line 196), so a thumbnail that failed once (a blip, a 5xx) is never asked for again while that event is in the list, and its row keeps the grey box. — Read.

- F8 — home-assistant-page.ts:683-698 — `refreshCameras` asks `/api/camera_proxy` for EVERY camera every 10 s, including a Nest camera that has already been classified as events-only (`camNote.nest`), so each such camera costs a failing request, a `camNote` rewrite and a `renderSoon()` every 10 s forever. — Read.

- F9 — home-assistant-page-camera.ts:193 — when both the recordings call and the history call fail once (a one-minute blip), `st.events` is replaced by `{state:'failed', list:[], evs:[]}`, which throws away the last good list and the card swaps from its events/preview to "Could not load recent events" until the next minute. — Read.

- F10 — Hidden-means-idle (`.claude/rules/performance.md` rule 2): home-assistant-page-live.ts:84-98 and home-assistant-page.ts:1440-1447 — the live socket is opened once and never paused when the page is hidden, so every state push (every subscribed light and media player, including playing-position updates) is still parsed and applied (`liveApply` does two `JSON.stringify` of the item per push); and a Watch-live stream started from a camera card (not the Cameras tab) keeps decoding frames while hidden (only tab streams are stopped on `visibilitychange`, camera.ts:331). The poll and camera timers do correctly skip while `document.hidden`. — Read; PLAUSIBLE for whether the app really reports `document.hidden` for a page that is merely not the open tab.

- F11 — home-assistant-page-history.ts:139-144 and :70-94 — `activityCount()` runs in `chipData()` on every drawing and calls `pageEvents(hist.events)` over the whole logbook already loaded (up to 10 days of the WHOLE house's logbook; `logbook(hist.days)` has no entity filter at line 17-19), so after the Activity tab has been opened once, every push-driven redraw on any tab re-walks thousands of events twice, and a day more or less is a bigger fetch of everything Home Assistant logged. — Read; per-event cost grows with history (performance rule 4).

- F12 — home-assistant-page-style.ts:249 — `@keyframes eq` animates `height` (a layout property) on `.eq.on i` for every playing card and pill; it carries `steps()` so the unstepped-infinite guard passes, but the rule says transform/opacity only. — Read; low cost with steps, listed for the rule.

- F13 — home-assistant-page-pending.ts:123-129 with :98 — when an OLDER press on a device is refused after a NEWER press on the same device and field, `undoGuesses(t.keys)` looks the key up by `id|field`, which now holds the NEWER press's guess, so it reverts the card to the original value and deletes the newer guess although the newer press may have succeeded. The slider path avoids this with `quietSeq`; press-and-switch paths do not. — Read only (needs two overlapping presses where the first is refused); PLAUSIBLE.

- F14 — home-assistant-page.ts:191-214 (`load`) — checks have no "latest request wins": a slow check that returns after a newer one overwrites `rooms` with older data (only live pushes are re-laid by `liveReplay`; with no live connection nothing re-lays), and each service call, rename, move and visibility change starts another check. — Read; PLAUSIBLE on a slow link.

- F15 — home-assistant-page-redraw.ts:238-243 (`keepAsIs`) — only a focused `<select>` and a held range are left alone, so a draw that lands while the colour picker (`input[type=color]`, `data-any`) is open resets its `value` to the light's current colour at line 256, which can undo the pick before `change` fires. — Read; PLAUSIBLE, native-picker behaviour not checked.

- F16 — home-assistant-page-media.ts:92-97 — the Media tab walks `r.items` unordered (`mvUnits`), so the order a person chose in Edit for a room's devices is ignored on the Media tab (only "playing first / gone last" tiers apply), although `ordered()`'s comment says his order applies to every list. The Lights tab honours it (`roomHtml` orders), except `ltSort` which deliberately overrides it for lights that are not responding. — Read; no test covers Edit order on the Media tab.

- F17 — home-assistant-page-templates.ts:24 — `'posAt': s.attributes.get('media_position_updated_at').isoformat()` assumes a datetime; if any player ever reports it as a string (or a restored state) the whole rooms template fails to render and the page shows nothing, the same failure mode the comment at the top of the file records for `| list`. `'members'` has the mirror risk: `entity_id | list` on a plain string attribute splits it into characters (harmless here since the page then finds no match, but it is not a list of ids). — Read; PLAUSIBLE (not seen on the real house).

- F18 — home-assistant-page-history.ts:62 — `(e.context_service ? '' : '')` is a no-op expression (dead). home-assistant-page-history.ts:110 and camera.ts:91 define `clock` twice in one scope with different parameter names (same behaviour today; the later paste silently wins). — Read.

- F19 — Test gap (guard that does not test its claim): `home-page-newest-wins`, `-slider-target`, `-live` and `home-page-pending` always send `lu` and `lc` together, so they cannot see F1; `home-page-pending` "keeps ..." tests hold a guess against a push but none covers an ACCEPTED send followed by a check before the device reports (F2); `home-page-camera-backoff` and `-cameras-tab` run 3 Nest cameras, so the 4-camera cap (F5) is untested. — Read the tests.

Counts: High 2 (F1, F2), Medium 4 (F3, F4, F5, F6), Low 13 (F7-F19; F10, F13, F14, F15, F17 are PLAUSIBLE). Checked and found sound: template-string escaping (only `’`, no backticks in page script, each page script compiles in every test), keyed in-place drawing (`patchKids`/`stableRun`), Hue room-group filter (`dropRoomGroups`) logic, Sonos tick list, seek vs remote keys choice (`seekHow`), camera rate-limit back-off (60/120/300 s, shared, tested), preview-still size (60 KB x 8, under the 1 MB `MAX_PAGE_DATA_BYTES`; `save` updates `youcoded.data` synchronously so back-to-back `persist` calls do not lose frames), edit drag listeners (added only while dragging, removed on drop), unstepped animations (all three infinite ones have `steps()`).

## Not covered (budget)

Stopped at about 60 minutes. Not read line by line: the CSS (`home-assistant-page-style.ts`, `-look.ts`, `-glass.ts`, and the CSS halves of `-lights`, `-media`, `-tv`, `-drawer`, `-camera`, `-edit`), the second half of `home-assistant-page-drawer.ts` (layout CSS), `home-variants/*`, `fake-home-assistant.ts` (only grepped for lc/lu), and the bodies of `home-page-edit.test.ts` (584 lines), `-tv-remote`, `-sonos-group`, `-media`, `-lights`, `-camera*.test.ts` beyond a skim. Not run: a heat_cool thermostat fixture (F4), more than 3 Nest cameras (F5), and anything against a real Home Assistant (F1 protocol detail, F17).

If I disagree with the approved design: nothing to raise.

## Triage (implementing session, 2026-10-05)

- F1 accepted — HA subscribe_entities sends lc alone on a state change (lu only when attributes alone change); clear lu when lc arrives / stamp by the newest of the two — fixed in youcoded af0970f13
- F2 accepted — an accepted send keeps its hold until the device reports (or the hold expires), not until the next check — fixed in youcoded af0970f13
- F3 accepted — stale Cast state: no Now playing / equaliser / Pause — fixed in youcoded af0970f13
- F4 accepted — read target_temp_low/high for heat_cool — fixed in youcoded af0970f13
- F5 accepted — camera tiles beyond the live cap say so; stream the tab's top tiles — fixed in youcoded af0970f13
- F6 accepted — Edit mode not saved across reopen — fixed in youcoded af0970f13
- F7 accepted — retry a failed thumbnail on a later refresh — fixed in youcoded af0970f13
- F8 accepted — skip camera_proxy for events-only Nest cameras — fixed in youcoded af0970f13
- F9 accepted — keep the last good list on a one-off failure — fixed in youcoded af0970f13
- F10 accepted — pause live socket handling and card streams while hidden — fixed in youcoded af0970f13
- F11 accepted — count Activity from a cached result, not per draw — fixed in youcoded af0970f13
- F12 accepted — equaliser animates transform, not height — fixed in youcoded af0970f13
- F13 accepted — undo a refused older press only if it still owns the guess — fixed in youcoded af0970f13
- F14 accepted — latest check wins — fixed in youcoded af0970f13
- F15 accepted — leave an open colour input alone during a draw — fixed in youcoded af0970f13
- F16 accepted — Media tab honours the Edit order within tiers — fixed in youcoded af0970f13
- F17 accepted — guard posAt / members types in the template — fixed in youcoded af0970f13
- F18 accepted — dead expression and duplicate clock removed — fixed in youcoded af0970f13
- F19 accepted — tests for F1, F2, F5 — fixed in youcoded af0970f13
