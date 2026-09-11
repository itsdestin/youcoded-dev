---
status: active
branch: session/remote-first-connect
---

# Remote access batches 2/3 — phone pass (Destin, 2026-09-11)

Run against the dev window (offset 50, `http://100.111.147.124:9950`) on the merged branch,
before the code reviewer and UX tester run 2 (batch 1's lesson). One line per finding;
status is `fixed <commit>`, `open`, or `filed <roadmap entry>`.

## Fixed during the pass

- Rapid messages and replies interleaved in different orders on phone vs desktop. Sender
  confirmed pending bubbles in place; now pending bubbles stay the timeline tail and a
  confirm moves the bubble to its recorded place. Predates the branch. — fixed `cc154f17`
- Phone kept an old theme until reloaded (dev on Meadow Mist, phone on Golden Sunbreak).
  `appearance.onSync`/`broadcast` were no-ops over remote. Predates the branch. — fixed `3185b6a0`

- New-session project picker on the phone listed only the saved-folders file, not the synced
  projects under ~/YouCoded/Projects. remote-server.ts had hand-copied folders:* handlers that
  never gained the managed-projects merge (or Windows case-insensitive remove). Both transports
  now call `src/main/folders-service.ts`; a guard fails if remote-server reads the file itself.
  Predates the branch. — fixed `f6b44da0`

## Filed

- Native sessions unusable from a phone; provider/local-model/search-key pages hidden;
  picker offers native models that clear on tap. `native.supported` is a July placeholder on
  the remote shim. Destin: "remote access should be identical to the desktop" — next batch.
  — filed `docs/roadmap/remote-access.md`
- Android Settings Remove does not unpair while connected; remote "No folder" session skips
  the No-folder swap (both found by the batch 3 builder). — filed `docs/roadmap/remote-access.md`

## File pills in the session drawer (found 2026-09-11) — 1–4 fixed

Fixed in `76983d25`, `a2dec565`, `1eb68349`, `4c8a858f`, `4bf3ec4e`: exact matching for
absolute, relative and `~` paths; one host lookup `artifacts:resolve-path` on all five surfaces
(Android stub falls back to the old lookup); "Opening {name}…" while it runs; a per-session
stale-tap guard; specific refusal notes. Builder's own reviewer found 10 issues, all fixed or
disclosed (backslash inside-root check, chat-only folders answer `not-tracked` without touching
disk). verify.sh --full green; Android 807 tests, 0 failures. Still to recheck on the phone.
Known gap: picking another file from the list while a tap is still resolving lets the tapped
file land afterwards (unchanged from before).

Evidence from a read-only probe of `projectAllFiles('/home/destin/youcoded-dev')` on the host:
3,090 records, `truncated: true`, ~1.0 MB of JSON.

1. **Wrong file for a same-named path.** `/home/destin/youcoded-dev/wecoded-themes/CLAUDE.md`
   matches the workspace root `CLAUDE.md` through `findBestMatch`'s suffix fallback
   (`norm.endsWith('/' + p)`), because `wecoded-themes/` is a nested git repo the search
   skips. Both platforms. Destin saw it "not open" on the phone.
2. **A file the search skipped cannot open on a phone.** After (1) is fixed the lookup falls to
   artifactify, which calls `artifacts:append-version` — a write, not bridged over remote — so
   the phone gets the "wasn't found in this project" note for a file that exists.
3. **Slow.** Resolving one tapped path downloads the whole project file list (~1 MB here) to
   the phone before anything shows. Destin: "it eventually popped in. just took forever".
4. **No loading state.** While the lookup runs the drawer shows "Nothing here yet", which
   contradicts the file just tapped.
5. Destin reported the opened file "disappeared again after my phone sleep/wake". The dev log
   shows a Vite page reload at 04:52 caused by a diagnostic edit (HMR reaches the phone through
   the remote proxy), and no code closes the drawer on reconnect. Not reproduced since —
   recheck once without edits in flight.

## Reliability investigation (found 2026-09-11) — 1–6 fixed, 7 and 9 filed, 8 not a bug

Destin: projects in the new-session picker were missing, then "randomly popped back in"; the
password screen "occasionally flickering before loading back in without actually needing a
password". Read-only investigation plus one scratch test; nothing changed yet.

1. **Password screen during automatic sign-in.** `index.tsx` Root renders `<LoginScreen>` whenever
   the shim is installed and auth:ok has not arrived, including while a saved key is being tried.
   Every page load (a phone tab the browser reloaded after sleep, a dev reload) shows it for the
   length of the handshake. Predates the branch.
2. **A page-load sign-in that fails for any reason erases the saved key.** `connect(storedToken)
   .catch(() => removeItem('youcoded-remote-token'))`: a timeout or an unreachable computer (phone
   just woke, tailnet not up) unpairs the phone and nothing retries. Only a refusal should.
   Predates the branch.
3. **The phone never checks its connection on wake.** No visibilitychange / online / pageshow
   handling and no client-side liveness check; the host pings every 20 s. After sleep the phone
   can hold a dead socket, or sit in a reconnect backoff of up to 30 s, while the page keeps
   sending requests that time out at 30 s.
4. **Screens load once and stay empty after one failed request.** FolderSwitcher (`load()` on
   mount, `catch {}`, renders nothing for an empty list) is one of ~24 found by a sweep: skills
   and commands drawer (`skill-context.tsx`), signed-in state (`account-context.tsx`), model and
   provider lists, session defaults (`App.tsx:584`), Project View, tags, session tags/notes,
   presence incognito, the Remote settings panel. Only SessionDrawer reloads on reconnect
   (`useProjectWatch`). `rehydrate()` re-asks its reads but the replies settle no caller, so they
   reach no screen. Failure caches that last the page's life: `state/platform.ts` (rejected
   promise kept), `use-provider-type.ts`, `useSpecialists.ts`, `AttachmentChip.tsx`.
5. **The host's 5 s old-page fallback raced a slow page.** Dev log: `client:ready ignored in phase
   live` — the page took over 5 s from auth:ok to App's chat:hydrate listener, so the host ran the
   catch-up into a page with no listeners; the phone then shows "may be out of date". Batch 2.
6. **Channels the host does not answer, logged during the pass:** theme:list, commands:list (also
   in REHYDRATE_ON_RECONNECT), platform:get, theme-marketplace:list,
   appearance:get-favorite-themes, marketplace:get-packages, skills:get-featured,
   performance:get-config, account:refresh. Each fails fast and its screen falls back empty.
7. **React warning in the dev log** ("Cannot update a component (`AppInner`) while rendering a
   different component"): App's session:created handler calls `dispatch` and `setSessionId`
   inside a `setSessions` updater. Predates the branch. Low.
8. **Checked, not a bug:** a failed theme list does not reset the phone to the default theme or
   save it to the computer (scratch ThemeProvider test, file read at 0 and 50 ms; deleted).
9. **Dev isolation gap (not a phone bug):** the dev host writes `~/.claude/youcoded-appearance.json`,
   the same file the live app reads (`ipc-handlers.ts` on master), so theme changes made while
   testing carry into the live app's next launch. `--profile` does not isolate it.

Not established: why the picker's request failed on Destin's phone. The host logs no connects,
closes or catch-up timing, so the dev log cannot show it; (3)+(4) is the only path found that
produces "empty, then later full".

### Fixed (2026-09-11, Destin: "lets fix these. check your own changes for unintended consequences")

App commits `e4b04666`, `1629727d`, then the review fixes after them. verify.sh --full green on
each.

1–2. `remote-gate.tsx` (moved out of index.tsx): a saved key shows "Connecting to your
     computer…"; an unreachable computer says so, retries, offers Try now / Enter password
     instead. Only a refusal the key can never survive deletes it.
3.   Wake check on visible / online / pageshow: reconnect now if down; if up, `remote:ping`,
     replaced after 10 s of complete silence. Network back before the first sign-in retries the
     saved key.
4.   `useOnRemoteReconnect`: FolderSwitcher (also reloads when opened; "Couldn't load your
     projects." + Retry), skills + commands, signed-in state, session defaults, tags, session
     tags/note; platform and provider lookups no longer cache a failure. The rest of the sweep's
     screens are filed in `docs/roadmap/remote-access.md`.
5.   A page that sends `readyHandshake` is waited on for 30 s before the fallback catch-up.
6.   Host answers theme:list, commands:list, appearance:get-favorite-themes, platform:get.
7.   Host log lines per connection: connect, drop code and duration, catch-up trigger and time,
     ping timeout, slow-client close (8-character device id only).

Filed: item 7 (React warning) in other-features.md, item 9 (dev theme shared with the live
app) in dev-workspace.md, the wasted reconnect re-asks in remote-access.md.

### Fresh review of those fixes — 11 findings

- 1 (high) Android app refused by its computer: two local-bridge sockets; unpaired on any
  refusal. — accepted, fixed (sockets retired in connect(); fallback only for a dead key)
- 2 (medium) a late connection attempt flipped a working one to authenticating/disconnected.
  — accepted, fixed (every handler bound to its own socket)
- 3 (medium) wake check false alarms; cut-off requests reported timed out, never checked.
  — accepted, fixed (10 s, any message counts; a drop fails sent requests as "may have run")
- 4 (medium) unpaired / password changed while away: "Reconnecting" forever, no password box.
  — accepted, fixed (page returns to the password box with a reason)
- 5 (low–medium) a re-read overwrote a note being typed; a failed re-read blanked it.
  — accepted, fixed
- 6 (low) `online` ignored before the first sign-in. — accepted, fixed
- 7 (low) Try now showed nothing while running. — accepted, fixed ("Trying to connect…")
- 8 (low) platform:get now hides Marketplace integrations the computer cannot install.
  — rejected: intended, the integrations install on the computer
- 9 (low) re-pairing by password adds a row to the computer's device list. — rejected: the
  host's pairing rule, unchanged
- 10 (low) unreachable 4029 copy; "Invalid password" for refusals that are not about the
  password. — accepted, fixed
- 11 (low) online / pageshow untested; no tests for 1–3. — accepted, tests added
  (`tests/remote-shim-overlap.test.ts`)

Recheck on the phone after the dev window restart.

## After the reliability fixes (2026-09-11, afternoon)

- Destin: "each sign in seems to create a new device entry in the remote access menu? even though
  all the same device". The dev store held four "Chrome on Android" rows for one phone (created
  08:14, 08:15 and 10:51 local, plus one from 09-10): each was a password sign-in after the phone
  had lost its key, which the old page did on any failed sign-in. Fixed `c8e8deb8`: the browser
  remembers its row per computer apart from its key and names it on a password sign-in; the host
  gives that row a new key (`RemoteDeviceStore.pairAgain`). Unpaired rows are not reused; the host
  still never matches by name. The four existing rows stay until removed on the computer.
- The dev log showed the phone as an "older page" after the restart: it had not reloaded since
  before the reliability fixes, so none had reached it. Destin asked to reload.
- Destin: "still having issues with messages not always appearing in the same order". An
  investigator proved four causes with the real parser and reducer, checked here against the 400
  newest local transcripts:
  1. A message typed while Claude is working is recorded ONLY as a `queued_command` attachment
     (84 found; 82 typed by a person, 2 sent by another Claude Code session; 1,218 background-task
     notices). The watcher skipped it: the typing device kept the bubble pinned to the bottom, the
     other device never showed it. — fixed (watcher + Kotlin mirror read typed queued messages)
  2. Slash commands strip to nothing, so never confirmed. — fixed (read as a command that starts no
     turn; /compact and /clear echoes stay hidden)
  3. A message with a picture is recorded as `[Image #1] …`, never matching its bubble. — fixed
     (matching sets attachment paths and image placeholders aside)
  4. Prompt cards and model/clear dividers are drawn per device. — filed `docs/roadmap/remote-access.md`
