---
status: shipped
date: 2026-10-05
branch: session/ha-pages-connection (workspace + youcoded); merged 2026-10-07 (youcoded#611, youcoded-dev#244)
---

# Home page (Home Assistant) and the Pages platform work — where it stands

Rewritten 2026-10-05 at merge prep. The code is the truth; this says where to look and what nobody has tested yet.

## Built on the branch

**Platform (every page can use it):**
- A page's home-device connection: an approval showing address + key, the key held by the app, a one-shot socket
  exchange (`main/pages/page-socket.ts`).
- A live socket for pages (`main/pages/page-live-socket.ts`). The device's profile fields (`socketHello`,
  `socketReady`, `socketAuthFailed`, `socketDeny`) ride the approval fingerprint; a built-in deny floor
  (`auth/`, `config/auth`, `person/`) applies to every device socket.
- Camera video played by the app, the page gets only the pictures (`main/pages/page-live-video.ts`,
  `page-video-sdp.ts`, renderer `components/pages/page-video-host.ts`). Caps: 4 per page, 6 per app.
- Recorded clips through `youcoded.fetch(url, { as: 'video' })`.
- The 17 `pages:*` channels are table entries in `main/ipc/pages.ts`; `main/pages/page-owner.ts` holds owner,
  push and close-on-gone.
- Approval-card lines for "live connection" and "camera video".
- Pages and Office frost over the theme wallpaper in Floating/Minimalist layouts. One switch, Settings →
  Appearance → Glass → "Show theme background behind pages" (`pagesSeeThrough`, default on).
- Workbench/shoot tooling fixes (Home screens wait for the first answer, shoot skips the first-load stagger,
  Escape check, live pane params in decks).

**The Home page** (not shipped in the app; installed by hand): source is
`youcoded/desktop/src/renderer/dev/workbench/fixtures/home-assistant-page*.ts` (page, -style, -look, -motion, -feel,
-redraw, -pending, -edit, -history, -live, -camera, -icons, -templates, -tv, -media, -lights, -climate, -drawer, -glass,
-tabs, -basic, -computer, -memory, -dial, -scenes).
Fake Home Assistant: `fixtures/fake-home-assistant.ts`. Options shelf (empty again since the scenes choice was built): `fixtures/home-variants/`. What it does:
Lights tab (a card per room, colour pop-up, scenes), Media tab, Climate, TV card with remote and app drawer,
Cameras tab (all live) with events and play disc, Activity, Edit = Organise board, instant updates over the live
socket, and every media player with no paired remote shows exactly the controls its supported_features allow
(play/pause, stop, ±10 s, prev/next, volume or volume steps, mute, power, input; unpaired Google/Chromecast TVs get a
"pair the remote" note) — `-basic.ts`, e00960ff0.
Added after the first rewrite of this file (2026-10-05 to 10-07):
- Computer card (`-computer.ts`): a ping sensor + wake-on-LAN button paired by name in one room (his desktop PC, Destin's Room). Wake only; no off.
- Brightness/volume remember their last value through off→on, because Home Assistant blanks brightness when a light turns off (`-memory.ts`).
- A Cast-only TV (plain Chromecast, no remote) reads "Nothing casting" instead of "Off" when idle (`castOnlyOff`).
- Thermostat dial (`-dial.ts`): the current temperature is a tick across the ring with a "now" number beside it, the target has a
  draggable handle, and −/+ presses wait 0.8 s then send once; the target is held up to 20 s until the Nest reports it (ce0012a33).
- Scenes (`-scenes.ts`, 1eca83579): colour cards in two sliding rows; colours are learned when a scene is pressed from the page
  (saved as `sceneLook` in the page's data), brightness and "moves" come from Home Assistant. Scenes and the lights list never
  open together. Decks: `2026-10-04-home-redesign/scenes-all*` and `scenes.deck*`. Decisions and answers: `docs/archive/design/2026-10-01-home-device-pages/` and `2026-10-04-home-redesign/`.

**Checks done:** three fresh code reviews (platform, Home page, tooling; fixes committed), earlier step reviews, a
UX review (`docs/archive/reviews/2026-10-05-ha-home-page-ux-review-2.md`, 17 fixed, U6/U12/U20 not, see its Triage).
Phone access to the 7 page socket/video channels signed off by Destin (`tests/fixtures/phone-open-channels.json`). Contract/grader/acceptance skipped on
Destin's call (`2026-10-04-home-redesign/home-redesign.contract.skipped.json`).

## Not verified on real hardware

- ±10s keys on the Google TV (media_seek when seekable, else remote rewind/fast-forward keys).
- New TV app ids (Hulu … Crunchyroll) and the HBO Max URL `https://play.hbomax.com`.
- Office editor turning solid with the switch off (relies on the Office add-on repo reacting to the wallpaper flag).
- The Auto thermostat mode is drawn only in tests; his house has not shown it.
- More than 4 cameras (each page may play 4 at once; the Cameras tab staggers), and a 3-stream 5-minute restart
  over time.
- Touch drag in Edit and phone width; remote-browser video; Hue timing after the slider-target fix; the 429
  text match for Google back-off (back-off is page memory, a reload forgets it); picture stills across a real
  app restart.
- The basic-controls pairing note's Google/Chromecast check (maker/model) and the Samsung (DLNA) controls while it is on;
  the U17 `reading-flow` keyboard order inside Electron.
- The thermostat −/+ fix with the real Nest (only the practice thermostat's lag and refusals were tested); the dial handle by touch.
- Scene colour learning on real Hue lights (a moving scene is caught at one moment of its cycle).
- Android: unbuilt and untested, no JDK here. Android lists the new channels as not-implemented
  (`SessionService.kt`), so Pages there is unchanged.

## Deferred (all in `docs/roadmap/other-features.md`)

- "Home page (Home Assistant) follow-ups deferred at the 2026-10-05 merge prep": search, multi-select in Edit, a
  scenes button on single-light rooms, see-through glass for Framed-layout themes (Golden Sunbreak).
- "Teach the page-builder skill the live device connection…" (publish with the app release).
- "Pages on a phone" (page-view layout at phone width, remote use of connected pages).
- Closed at merge: "A page that manages a device on the home network".

## How to

- **Install the Home page** into the user's pages folder (writes `~/YouCoded/Personal/Pages/home/page.html`; the app
  watches the folder). From `youcoded/desktop`:
  `npx tsx -e "import('./src/renderer/dev/workbench/fixtures/home-assistant-page.ts').then(m=>{const js=m.HOME_ASSISTANT_PAGE_HTML.split('<script>')[1].split('</script>')[0];new Function(js);require('fs').writeFileSync(process.env.HOME+'/YouCoded/Personal/Pages/home/page.html', m.HOME_ASSISTANT_PAGE_HTML);console.log('installed')})"`
  The new `new Function(js)` is a syntax check before writing. Do NOT change files the live built app holds open
  except this page file, which Destin approved updating (the app only re-reads it).
- **Approvals and keys live per profile.** The dev app (`bash scripts/run-dev.sh --path <worktree>/youcoded --label
  "Home Assistant Pages"`) has its own profile: the Home page's approval and Home Assistant key saved there are NOT in
  his live app. After merge and a release, the live app asks for approval once and needs the key pasted once.
  Main-process changes need a dev restart; renderer changes hot-reload.
- Listen-only Home Assistant trace helpers were scratch files, not kept.
- Nest Pub/Sub subscription `nest-events-sub` was recreated 2026-10-05 (never expires); noted in
  `~/system/home/home-assistant.md`. Living Room / Back Door cameras get no event media from Google (the doorbell does).
