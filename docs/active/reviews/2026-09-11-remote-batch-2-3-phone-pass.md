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

## Reliability investigation (found 2026-09-11) — all open

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
