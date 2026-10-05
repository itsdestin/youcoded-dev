# Code review: Home page practice/test tooling (2026-10-05)

Branch `session/ha-pages-connection` (both repos), diffed against `origin/master` (three-dot). Slice: workbench mock + fixtures (not the page script), shoot/deck scripts. Reviewer: fresh agent, correctness only.

## Verify summary (`bash scripts/verify.sh youcoded`)
PASS types, PASS tests-dir types, PASS knip, PASS oxlint, PASS design lint, PASS ast-grep, PASS shoot --check (screens open), PASS journeys.
FAIL tests (related): 1 failed / 5047 passed. The failure was `tests/home-page-camera-backoff.test.ts > backs off when a restart fails after a long stream` (timed out at 30 s, machine load). Rerun alone with `tests/app-welcome-back-gating.test.tsx`: 15/15 pass. The same run also logged one unhandled "window is not defined" from `app-welcome-back-gating.test.tsx` (React update after jsdom teardown, via ResumeBrowser); it did not recur on rerun. Both are load-sensitive, not caused by this slice. Python: `test_live.py` 43 OK, `test_serve.py` 26 OK.
Note: verify also reported master has new commits touching files this branch changed (merge needed before landing).

## Findings (most severe first)
- F1 — youcoded/desktop/src/renderer/dev/workbench/mock-shim.ts:3822-3835 — the "first answer" hold says "cap 8 s", but the shoot tool's first wait is capped at 3 s (scripts/shoot/shoot.mjs:174 `tab.still(3000)`; engine.mjs STILL), so on a slow machine the picture is still taken at 3 s before the page's first answer, exactly the "Loading your rooms…" lie the hold was meant to stop; the same 8 s is used by the mockup hold at :3836-3845 — confirmed by reading engine.mjs STILL (`performance.now() - t0 > cap` ends the wait) and shoot.mjs.
- F2 — mock-shim.ts:3826-3834 — the hold is taken on every `get('page-home')` while shooting, including the approval screens (`page-home`, `#key`, `#refused`) where no request is ever made, so `__shootInflight` stays at 1 for 8 s and every later `still()` on that screen (500/1500/2000/3000 ms) waits out its full cap; slow but not wrong — confirmed by reading (the release only comes from a fetch or the 8 s timer).
- F3 — fixtures/fake-home-assistant.ts:103-109 (reset) vs :308 (`AREAS`) — `fakeHomeAssistantReset()` restores ROOMS, nest/camera flags, live sessions and calls, but not `AREAS` (module-level, mutated by `area_registry/create` and `/update`), so a room made or renamed in one test persists into the next and disagrees with the reset ROOMS (new room id gets `_2`; renamed area keeps its name in the registry list); the harness comment at tests/home-page-harness.ts:44 promises "nothing one test changes reaches another" — confirmed by reading; not run.
- F4 — fixtures/home-assistant-mockups.ts (274 lines) + screens/pages.ts `mock-*` (9 screens) + mock-shim.ts:3764,3795,3834-3845 (mockup hold, `homeMockupReady` listener) + `withHomeMockup` import — the 2026-10-04 "device page / activity / camera card" design options are decided and now built into the page (`#device`, `#activity`, `#camera`, `#camera-events` screens exist); nothing but the old deck's html/json names them (rg of src, tests, scripts finds only these files) — DEAD candidate (still pinned by `shoot --check`, so it costs a screen run each time). PLAUSIBLE that the old deck still wants them; if so archive with the deck.
- F5 — fixtures/home-variants/{audit,edit,lights-tab,look,media-tab,page-bg,tv-remote}.ts — seven of nine task files are an empty `VARIANTS = {}`, each still imported in registry.ts and kept alive only by comments ("so a later round can add options"); `HomeVariant.css` and `nestSignedIn` (types.ts:12,19; mock-shim.ts:3781 `variant?.nestSignedIn`) are used by no remaining option — dead code per rg across src/tests/scripts. Suggest deleting the seven files, their registry lines and the unused fields (git history already has them, as the comments say). Also `types.ts` header still says helpers "each own ONE task file" which no longer matches.
- F6 — fixtures/fake-home-assistant.ts service handler (turn_on) — `brightness_pct: 0` sets `brightness = 0` and leaves the light `on`; real Home Assistant turns the light off for 0 %. Also `turn_on` with no brightness restores 255, not the last value. Any test or screen that relies on dragging a slider to 0 sees a state the real house never reports — PLAUSIBLE (from Home Assistant's documented behaviour, not run against a real house).
- F7 — fixtures/fake-home-assistant.ts `answerOne` — no `config/area_registry/delete`; the page sends it to roll back a half-made room (home-assistant-page.ts:1144), and the mock answers "Unknown command", so the rollback path can never succeed in the workbench or the tests (tests/home-page-edit.test.ts:492 only checks the message was sent). Mock diverges from the real house exactly where a bug would hide.
- F8 — scripts/ui-review/deck/live.py:133-137 — the new `params` pane field is not validated or documented: a non-object value (`"params": ["a"]`) raises AttributeError in `pane_url` at build time with no spec error; a key named `theme`, `child`, `latency` or `scenario` silently overrides the pane's own; `d = {**live, **pane}` replaces a step-level `params` wholesale instead of merging; and `scripts/ui-review/deck/AUTHORING.md:151` (the pane-fields table) does not list it, so a future session will not know it exists. Confirmed by reading `pane_url` and `spec.py:_validate_app_target`; the unit test covers only the happy path.
- F9 — mock-shim.ts:3795 — redesign options skip `still()` on purpose, so while shooting the remaining `v-motion-nav-*` / `v-motion-state-*` screens keep their first-load rise (at quarter speed for `slow`, ~4 s); the shoot cap is 3 s, so the picture can be taken mid-motion, while `sameAs` declares `slow`/`before` the same "at rest" — a look-alike pass would hide that. PLAUSIBLE (not shot here).
- F10 — mock-shim.ts:3817-3825 — comment order is wrong: the paragraph "A mockup is laid over the page only after…" now sits above the new page-home hold block and describes the mockup block that comes after it; a reader will think the 8 s hold is the mockup one. Stale/misleading comment.
- F11 — scripts/shoot/shoot.mjs:229-234 — the Escape fix pins element identity, which is right for the rename race; but it assumes Escape never re-mounts the same panel as a new element (a keyed re-render would read as "closed" and then `after.length` would be wrong the other way), and it leaves `window.__shootBefore` set on the page after the check. Low risk; index mapping `l.i` into `__exploreLayers` was checked against explore-page.mjs:205 and is correct (indices taken before the tooltip filter).
- F12 — mock-shim.ts `socketOpen`/`createPagesMock` — `liveSockets` entries and the module-level `liveSessions` in fake-home-assistant.ts are removed only by `socketClose`; a page that is navigated away without closing leaves its session being iterated by `notifyLive` for the life of the tab. Workbench-only, small; PLAUSIBLE.
- F13 — fixtures/fake-home-assistant.ts history branch — `.filter((l) => l.length)` can never remove anything (every list starts with the baseline row), so an entity with no events still returns one row where real Home Assistant returns an empty list when nothing changed; no-op line, and a small mock divergence.
- F14 — fixtures/fake-home-assistant.ts `/api/template` — any request body not containing `EXTRAS` returns the rooms; a future third template silently gets the rooms list instead of a refusal. PLAUSIBLE.

## Checked, no problem found
- Counters: every `__shootInflight` increment has one matched decrement (fetch `finally`, hold `release`/`finish` guarded by `held`/`done`); nothing in the repo resets the counter, so it cannot go negative; only `engine.mjs` and these blocks touch it.
- `videoPlayback` pass-through in `withCatchAll` and its pin test (`video-playback-seam-pin.test.ts`) are consistent; `mock-shim.test.ts` additions pass.
- `test_serve.py` path fix: four `dirname`s from the test file reach the workspace root; `youcoded` beside it is correct.
- `findHomeVariant` prefix matching has no collisions with the current task names.

## Not covered
- Did not read `home-assistant-page*.ts` (out of slice) or run the workbench visually; F1/F2/F9 rely on reading engine.mjs and shoot.mjs, not on a timed shoot.
- Did not review the non-home tests the branch touched that are not about the workbench (`ipc-channels`, `net-guard`, `ThemeProvider`, `office-theme-see-through`, `remote-server-connections`).
- Did not run `node --test` for scripts/shoot (no shoot test files changed on this branch).
- Stopped at about 35 minutes of the 45 minute budget.

## Triage (implementing session, 2026-10-05)

- F1 accepted — shoot waits on in-flight work up to the hold cap
- F2 accepted — no first-answer hold for screens with no device connection
- F3 accepted — reset AREAS
- F4 accepted — delete the decided mockups and their screens/hold
- F5 accepted — delete empty task files and unused fields
- F6 accepted — fake turn_on matches HA for 0 % and restore
- F7 accepted — fake area_registry/delete
- F8 accepted — validate + document live.py params
- F9 accepted — retire the decided motion options
- F10 accepted — comment order
- F11 accepted — clear __shootBefore after the check
- F12 accepted — drop live sessions on page close
- F13 accepted — history returns [] when nothing changed
- F14 accepted — unknown template refused
