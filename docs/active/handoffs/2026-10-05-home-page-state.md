---
status: active
date: 2026-10-05
branch: session/ha-pages-connection (workspace + youcoded); nothing merged
---

# Home page (Home Assistant) — where it stands

## Built on the branch (all pushed)

- Platform: device connection; one-shot socket; **live socket** (`page-live-socket.ts`), **app-played
  camera video** (`page-live-video.ts`, caps now 4/page 6/app), recorded clips (`as:'video'`), device
  profile (`socketHello/Ready/AuthFailed/Deny`, `videoProfile`) + built-in deny floor. Spec:
  `docs/active/specs/2026-10-04-page-live-socket-and-camera-video.md`; reviews in `docs/active/reviews/`.
- Home page files: `youcoded/desktop/src/renderer/dev/workbench/fixtures/home-assistant-page*.ts`
  (page, -style, -look, -motion, -feel, -redraw, -pending, -edit, -history, -live, -camera, -icons,
  -templates). Fake HA: `fake-home-assistant.ts`. Redesign options shelf: `fixtures/home-variants/`.
- Redesign round 1 (`docs/active/design/2026-10-04-home-redesign/`): flicker/race fixes (all 7 picks
  + 12 review fixes), Edit = Organise board (+ review fixes), look = Glass and glow, motion =
  Glide and grow (pill row still), press feel = Spread and spring (no spin), slider handle attached,
  Home thermostat = Climate dial, room bar syncs light bars, slider target model (rubber-band fix from
  a real trace), scenes = palette icon button, Lights cards/palettes/scenes start closed,
  Sending/Done notes removed (Didn't work kept), broken devices sort last, TV neutral ⏯ when an app
  gives no play state, themed scrollbars, Cameras tab (all live), camera card with play disc (option A).

- Camera preview stills (youcoded 3a916194e): newer of newest recording thumbnail / last live frame
  (kept only when live stops, ≤640 px, ≤60 KB, ≤8 cameras in page data), labelled, behind the play disc.
  Installed. Not checked with real Nest thumbnails or across a real app restart.
- Round 2 (decks `home-redesign-r2`, `-r2b`, `-r2c` + answers): TV card rebuilt (remote = header icon, round
  glass pad in the playing panel, closed row prev/−10s/play/+10s/next, open row Back/prev/play/next/Home + app
  chips YouTube/Netflix/HBO Max/Disney+ with Prime swap-in; ±10s = media_seek if seekable else remote
  MEDIA_REWIND/MEDIA_FAST_FORWARD); Media tab = playing wide cards (name as title, keys right of the song,
  volume inside the same sub-card, soundbar Group button, "Playing together" box), "Not Playing" shelf,
  unreachable last; Lights tab = one card per room with "Tall cards" per light + colour pop-up (youcoded
  7c3c6f84f, 158c63854). Camera cards list picture-less Nest events (Living Room / Back Door cameras get no
  media from Google: GenerateImage "not supporting RTSP"); Google 429 back-off 60/120/300 s + Cameras tab
  stagger 1.5 s (e32dfb285, b502b25fa event-kind fix). Installed.

## Not done / open

- Fresh code reviews not yet run on: look, motion-nav, motion-state/feel, and the later follow-ups
  (slider target, room sync, cameras tab, TV rule, sort, play disc, stills).
- UX tester pass; page-builder skill doc for live socket/video; approval-card wording for profiles.
- Search; multi-select is in Edit board? (Edit board has no multi-select — option b had it; c chosen).
- Not verified on real hardware: touch drag on a phone, phone width, 3 Nest streams + 5-min restart
  over time, TV neutral rule on real Netflix, Hue timing after the target fix, thermostat after Nest fix.
- Single-light rooms have no scenes button (offered, not decided).
- Unverified on the real house: HBO Max URL `https://play.hbomax.com`, ±10s keys on the Google TV, 429 text
  match, the new events list. Back-off is page memory (a reload forgets it).
- Pictures of `#connected` miss rooms 2+ (first-load entrance stagger in -feel.ts runs while shoot captures);
  picture-only, pre-existing — review the Home tab live, not from stills, until fixed.
- Old unused CSS (`.clim-top`, `.scale`), `nestSignedIn` variant flag unused.

## How to

- Install page into the test window (Destin approved updating it after each step):
  from `youcoded/desktop`: `npx tsx -e "import('./src/renderer/dev/workbench/fixtures/home-assistant-page.ts').then(m=>{const js=m.HOME_ASSISTANT_PAGE_HTML.split('<script>')[1].split('</script>')[0];new Function(js);require('fs').writeFileSync(process.env.HOME+'/YouCoded/Personal/Pages/home/page.html', m.HOME_ASSISTANT_PAGE_HTML);console.log('installed')})"`
  The app watches the folder; main-process changes need a dev restart:
  `bash scripts/run-dev.sh --path <worktree>/youcoded --label "Home Assistant Pages"`.
- HA trace recorder (listen-only): scratchpad `trace.cjs` / `trace2.cjs`.
- Nest Pub/Sub subscription `nest-events-sub` recreated 2026-10-05 (never expires); noted in
  `~/system/home/home-assistant.md`.
