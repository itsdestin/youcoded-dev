---
status: shipped
date: 2026-11-01
updated: 2026-11-09
---
# Android app: hands-on test of latest master

## Where this stands (2026-11-11): merged

**Everything below this section is history.** Card #213 is closed. All three branches merged on 2026-11-11:
the Worker (itsdestin/wecoded-marketplace#123, deployed; game rooms and `/games/ticket` answer live), the app
(itsdestin/youcoded#730) and the workspace (#361). Destin tested the Dev copy on his Flip on 2026-11-10 and five
more fixes came from that (Tailscale warning, can't-connect message, fullscreen tip removed, arrow buttons, one
Android test build with `releaseTest` removed).

**Not done when this was archived:**
- The build on master (after merging master's bundled-musl change and a git 2.54.1 lock refresh) has not been
  started on a phone.
- A real two-player game through the live rooms and sync between two devices have never been run.
- Phone to computer needs a computer app newer than 1.3.3 (older ones refuse the phone app's page address).
- Bundled Claude Code is 2.1.300 (2.1.322 available). "Open Tailscale" does nothing on a phone with neither the
  Tailscale app nor a store. One medium code-scanning warning remains on `scripts/shoot/engine.mjs` (old line).

## Where this stood on 2026-11-09 (kept as written)

This file is the single status record for card #213. The findings below the line are the **original 2026-11-01
test**. They describe master `573fab4c6`, not the branch. Every finding has since been answered or fixed.

**Branches.** All three are pushed and none is merged. Destin decides when to merge, and plans to release this
together with other workstreams:
- **App:** `itsdestin/youcoded` `session/android-ux-test`, about 60 commits.
- **Workspace:** `youcoded-dev` `session/android-ux-test`, holding the decks, their answers and these docs.
- **Marketplace:** `wecoded-marketplace` `session/android-ux-test`, one commit (`278c228`) that hosts the Connect 4
  and Chess rooms on the Worker. **It must merge, and the Worker must deploy, before or with the app.** The app's
  game rooms point at `api.youcoded.ai` (commit 5ae5a5ca6).

**Decisions:** `docs/archive/design/2026-11-01-android-findings/findings.questions.answers.json` (34 questions) and
`docs/archive/design/2026-11-08-phone-leftovers/leftovers.questions.answers.json` (3 questions).

### Original findings: outcome
| Finding | Outcome |
|---|---|
| 1 Assistant can't start (ICU) | Fixed: ICU data shipped. Alpine packages pinned (`alpine-lock.json`, refreshed per release by `update-pins.py`). 5ae5a5ca6 |
| 2 Hidden Claude Code setup screens | Fixed: text-style, security-notes and Trust screens show as chat cards on phone and desktop. 5ae5a5ca6, 05c337481, 977fac906, d0de9fc9c |
| 3 Sync never works / 'Sync failing' on fresh install | Fixed: `info/` created. Shows "Sync off" when sync was never set up. 5ae5a5ca6, d0de9fc9c, 516b6e529 |
| 4 Online games | The 2026-11-01 diagnosis was partly wrong (Destin: desktop showed him online). Real causes: the hosted PartyKit rooms were shut down, so rooms moved to the Worker (marketplace `278c228`); on the phone, a leader-window bug dropped presence (d0de9fc9c). A daily online-services watch was added. |
| 5 Attach file | Fixed: phone file picker, real attachment names. 5ae5a5ca6, 977fac906 |
| 6 Phone treated as a browser | Fixed: platform stays `android`, so phone screens and wording show. The unified settings screen Destin described is **card #133** (later, separate work). |
| 7–29 | Fixed as answered, in 5ae5a5ca6 and follow-ups. Sign-in returns to the app; ChatGPT waiting fixed; phone layouts; "phone" wording; local model hidden; 2048 swipe; Back closes menus; live status and "needs you" notifications; one-column Pages with a list/page switch; touch tooltips; no keyboard autofocus; marketplace items that can't run go last; everyday chips; file names instead of paths; tap wording; mode badge (b091649e9, d0de9fc9c); tickable lists; duplicate question header; startup error box. |
| Answered "no" or "keep" | 16 answer order, 17 approval card text, 29 notification permission timing: left as they were. |
| Tour | Minor fixes done. The full rebuild is **card #214**. |
| Marketplace phone redesign (like an app store) | **Card #225** (Destin, L-3). |

### Added during retesting (all on the branch, all checked by Destin on the Flip7)
- **Phone layout and polish:** popups fit, first-launch screens, trust card, density rounds 1–2, phone polish rounds
  1–4. Decks are in `docs/archive/design/2026-11-01-android-findings/` and `2026-11-07-phone-polish/`.
- **Keyboard:** the page glides with the keyboard instead of resizing, and Samsung's height overshoot is corrected.
  The terminal slides up rather than shrinking.
- **Terminal view:** doubled lines fixed (no resize from the keyboard or message box; a hidden terminal starts at
  its real size). Terminal keys are drawn like the quick chips, with a Ctrl that works on the next letter. Decks are
  in `2026-11-04-terminal-keys/`.
- **Fullscreen display mode** (L-2): new phone sessions seed Claude Code's `tui: fullscreen` when no mode is set,
  and a swipe scrolls it (235042b1d). Destin confirmed on 2026-11-09: "fullscreen mode looks good". Depth is in
  `../2026-11-08-phone-fullscreen-mode.md`.
- **No folder on the phone** (L-1): there is no app-private "Home" project, and a session with no folder opens in
  the clean No folder (47d32af06). Destin confirmed on 2026-11-09: "seems to work". The fuller rethink of presets
  and no-folder sessions is **card #57**.
- **Speed:** skills drawer and settings rows (phone lab measurements, card #96).

### Tried and reverted: do not rebuild without asking
Typing straight into the terminal on the phone. The message box was hidden and a D-pad with Send was added
(deck `2026-11-08-terminal-direct-typing/`). It worked in the phone's own sessions. Over remote access to a
computer it duplicated typed text, and the cause was never found. Destin: "its super broken". It was reverted in
7c3c66469 and 68584b3bd. The code survives on the app branch `experiment/phone-terminal-typing` (e870b4c9b).

### What remains
- **Card #213:** nothing left to build. What remains is Destin's merge decision and the release, together with
  other workstreams.
- **Not tested on a phone yet:** real sync between two devices, multiplayer games (they need the Worker deployed
  first), the ChatGPT sign-in itself, and the flip phone's cover screen.
- **Later, as separate cards:** #133 (one settings screen), #57 (No folder / Your Assistant), #225 (phone
  marketplace), #214 (tour rebuild).
- **Separate task started from this test:** `docs/active/handoffs/2026-11-01-test-infrastructure-rethink.md`
  (tests that would have caught finding 1). No card tracks it yet.

---

## Original findings (2026-11-01, master `573fab4c6`)

**What was tested:** the Android app built from master `573fab4c6` (2026-11-01), on Destin's Galaxy Z Flip7
(Android 17), as two side-by-side test copies. Neither touches the real app:

- **YouCoded ReleaseTest**: a brand-new install, used for first launch, sign-in, the tour and a first Claude Code chat.
- **YouCoded Dev**: an older test copy, already signed in, updated in place. Used for everything else
  (its screen can be inspected from the computer).

**Real tasks run:**

- Claude Code: "make a taco grocery list and save it" (worked); "write a bedtime story" with the app in the
  background (worked).
- The app's own assistant (OpenRouter, GPT Luna): "research low-light houseplants online and save them" (worked);
  "build me a water-tracker Page" (worked).

**Features checked:** first launch, Claude/ChatGPT/OpenRouter sign-in, tour, Claude Code and native chats, file
viewer, Marketplace (skill + theme install), Games, Pages, Backup & sync, Remote access, voice, attach file,
background running, Resume, bug report form, Back button.

The emulator on the computer can't run the app's bundled programs; it shows "underaligned TLS segment"
(an x86 translation limit, not an app bug). A real phone is required.

---

## Show-stoppers

### 1. The assistant can't start at all (also likely in released 1.3.1–1.3.3)
![](shots/01-assistant-cant-start.png)

- **What a user sees:** "YouCoded couldn't start its assistant", a wall of code, and "Try again", which never works.
- **Cause:** the phone's bundled Node has no language data (ICU). One line formats the number "10,000"
  (`desktop/src/shared/pages-types.ts:184`, `toLocaleString('en-US')`) and runs at startup, so the
  backend crashes. Only the stub library `libicudata` ships; the data file `usr/share/icu/78.1/icudt78l.dat`
  is never packed (`app/runtime/build-runtime.sh`, share.tgz holds only terminfo and git-core).
- **Released 1.3.3:** we downloaded its APK and ran *its own* Node on the phone. The same command fails with the
  same "Icu error". Its backend has the same line, loaded at boot. So 1.3.1–1.3.3 Android users very likely
  can't start either. This was not run end-to-end, because 1.3.3 shares a package name with Destin's real app.
- **Proven fix** (tested on this phone; every later test ran with it): add `icu` to the share.tgz list in
  `build-runtime.sh`, and set `NODE_ICU_DATA=<files>/usr/share/icu/78.1` in `RuntimeInstaller.environment()`.
  Better still, read the folder name rather than hard-coding 78.1. Also worth a CI smoke test that starts
  the backend.

### 2. A new user's first Claude Code chat gets stuck behind a hidden setup screen
![](shots/03-stuck-initializing.png) ![](shots/02-hidden-claude-setup.png)

- **What a user sees:** "Initializing session… Something may be wrong" and "Waiting for approval…".
- **Cause:** Claude Code's own first-run screens wait behind the chat view: text-style picker, then
  security notes, then "Trust this folder". You only find them by switching to the terminal view and pressing
  Enter twice. The app's own sign-in does not mark Claude Code's setup as finished.
- On the computer app this was presumably handled; on the phone it isn't.

### 3. Backup & sync never works on the phone
![](shots/04-sync-failing.png)

- **What a user sees:** a red **"Sync failing"** badge on every chat (even on a fresh install), and
  "Couldn't sync — unexpected problem".
- **Cause:** the phone's Git creates repos *without* the usual `info/` sub-folder (its templates folder is
  empty). The app then writes `info/exclude` without creating the folder: `ENOENT` at
  `desktop/src/main/sync-spaces/git-transport.ts:436` (and `info/attributes` at :432). Fix: `mkdirSync(info, {recursive:true})` first.

### 4. Online games are down on EVERY platform, not just Android
![](shots/05-games-connecting.png)

- **What a user sees:** Friends, Connect 4 and Chess stay on "Connecting…" forever.
- **Cause:** the game server address `youcoded-games.itsdestin.partykit.dev` no longer exists on the
  internet (NXDOMAIN on Cloudflare and Google DNS). Desktop will be affected the same way. No card exists for this.

### 5. Attach file does nothing on the phone

- **What a user sees:** tapping the paperclip does nothing, so a photo or document can't be added to a chat.
- **Cause:** the phone's backend answers "open file" with a stub that always returns "cancelled"
  (`desktop/src/main/headless/electron-headless.ts:135`). The phone's own file picker (MainActivity) is not
  wired to this button.

### 6. The phone app thinks it's a web browser, which explains many of the "computer" problems below

- **Cause:** in the running phone app, `window.__PLATFORM__` is `"browser"`, not `"android"`. `platform.ts`
  sets "android", but once the page signs in to its own backend, `remote-shim.ts:1566` overwrites it with
  "browser" (a rule meant for phone *web browsers* reaching a computer). So `isAndroid()` is false everywhere.
- **Effect:** the phone gets the **computer's** settings and screens: Remote-access *server* setup with
  "Install Tailscale", "Keyboard shortcuts", Local models, "Launch in new window", "Sessions in this window",
  the two-pane Pages layout, and "computer" wording. The phone's own "Connect to your computer" settings are hidden.
- **Why tests missed it:** the screenshot tools force `?platform=android`, which hides this.

---

## Problems a user will notice

| # | What happens | Where |
|---|---|---|
| 7 | **Sign-in doesn't bring you back to the app.** After Claude sign-in finishes, you're left on a "You can close this window" page in Chrome and must switch back by hand. (Destin) | First launch → Log in with Claude |
| 8 | **ChatGPT keeps saying "Waiting for the browser…"** after you back out of its sign-in and choose another method. (Destin) | Settings → Assistant settings → Cloud providers |
| 9 | **The welcome card spills off both sides of the screen:** "Start your first ses…", "roject folder", "odel", "kip permissions". The first-launch screens need a real phone layout. (Destin) ![](shots/07-welcome-overflow.png) | First screen after sign-in |
| 10 | **"Computer" wording on a phone:** "Free, on this computer", "Run a model on this computer", "Checking this computer…", "a different AI… on your own computer". Should say "phone". (Destin) | First launch; Cloud providers; tour step 7 |
| 11 | **"Free, on this computer" spins forever** on "Checking this computer…". Running a model on the phone isn't available, so this choice shouldn't be offered (or should explain why). ![](shots/08-local-model-hang.png) | First launch → Free option |
| 12 | **2048 can't be played:** it only listens to arrow keys/WASD; swiping does nothing. ![](shots/06-2048-no-swipe.png) | Games → 2048 |
| 13 | **Back button with the menu open closes the whole app** instead of the menu. (Popups like Resume close correctly.) | ☰ menu |
| 14 | **No "done" notification** when a task finishes while the app is in the background. Only the permanent "Your assistant is running" shows. The work itself does finish. | Any chat, then leave the app |
| 15 | **Pages uses the computer's side-by-side layout:** the right half is a thin strip saying "No page selected". ![](shots/09-pages-two-pane.png) | Pages |
| 16 | **The assistant's final answer sits above a long list of ~20 steps,** so after a Page build you land on the steps and must scroll up to read "your page is ready". ![](shots/12-answer-above-steps.png) | Native chat, after a long task |
| 17 | **Permission requests are cut off:** "Running a command · "L…". You can't see what you're approving without opening it. | Native chat, Ask mode |
| 18 | **"Menu" hover label gets stuck** on screen after tapping ☰ and floats over other things, even dialogs. Same with "Switch to terminal". ![](shots/11-stuck-menu-label.png) | Header buttons |
| 19 | **Keyboard pops up on its own** when opening the skills drawer and Resume, covering half the list. | Compass icon; Resume |
| 20 | **Marketplace on Android leads with Mac/Windows-only items** ("Apple Services — macOS only" is first); Themes are hidden inside Filters, off-screen in the type row, and "Browse marketplace" from Appearance doesn't open themes. No Marketplace entry in the ☰ menu. | Marketplace |
| 21 | **Tour mismatches:** it says "press Create" (button says "Start session"); its bubble covers the Start session button; it shows raw paths like `/data/data/com.youcoded.app.rel…` and app config files (providers.json) as "Project files". | First-run tour |
| 22 | **Developer shortcut chips** for everyday users: Git Status, Review PR, Fix Tests. | Above the message box |
| 23 | **Raw phone paths** in chat steps: "Created a file · /data/user/0/com.youcoded.app.dev/files/home/plants.md". | Chat step lists |
| 24 | **Keyboard-only instructions:** Flappy says "Space or Enter to flap… or press Space"; tour says "Click here". | Games; terminal hint |
| 25 | **Mode badge changed by itself** from NORMAL to AUTO after the first Claude Code message (fresh install). Worth checking whether that's intended. | Claude Code chat |
| 26 | **Checkboxes in a saved list can't be ticked** in the file viewer (the grocery list). | File viewer |
| 27 | **Startup error screen is raw:** technical text and a "Try again" that can't help; no Report bug. | Startup failure screen |
| 28 | **The page builder asked the same question twice** in its step list ("Save location" and "Location", same wording). Only one card showed; worth a look. | Native page build |
| 29 | **Notification permission is asked on a black screen** before the app has shown anything or said why. | Very first launch |

## What worked well

- Claude Code chat: replies, saves files, file chip opens the file viewer.
- Native chat (OpenRouter): web search and file write.
- Long tasks keep running with the app in the background.
- Skill install, theme install and apply (the wallpaper looks great).
- Page building, and the Page saves its data.
- Voice input listens after mic permission.
- Flappy plays with taps.
- Back closes dialogs; the Resume list loads.
- The bug report form looks right (not submitted, since tickets are public).

## Not covered

- Real sync between two devices (sync can't run at all, #3).
- Multiplayer games (server down, #4).
- Connecting the phone to a computer (that screen is hidden, #6).
- The ChatGPT sign-in itself (switched to OpenRouter).
- The cover screen of the flip phone.

## Developer notes

- **Local Android builds fail** without Alpine's `apk version -t` (the redistribution gate). CI uses Docker;
  Docker isn't usable here (socket permission). Worked around with `apk-tools-static` via
  `YOUCODED_APK_VERSION="<path>/apk.static version -t"`. `youcoded/docs/android-runtime.md` → Developing
  doesn't mention this.
- **The flip phone has two displays:** `adb exec-out screencap -p -d 4633128672291735937` is the inner screen.
- The ICU test patch used for this run is not committed; its exact change is in #1 above.

## Final review round (2026-11-09 to 2026-11-10)

What the finished branch changes, per device, with pictures, the independent review's findings (fixed and left) and
the open decisions: `docs/archive/design/2026-11-09-phone-final-review/branch-summary.html`. Terminal view per device
and how it got that way: `terminal-by-device.html` in the same folder.

Notes for the test-infrastructure work running in parallel:
- The ICU start-up crash has no explicit check of its own beyond the build failing when the data is missing; an
  update-from-an-older-install test does not exist.
- `worker/test/presence-hidden.test.ts` ("a visible device keeps the account online…") failed once under heavy
  machine load and never again; its failure text was not captured.

