# Local dev alongside the built app

Running a dev build of YouCoded while your installed/built app is still open (with real Claude sessions running) is an explicit supported workflow. This doc explains how it works and what to watch for.

## Quick start

```bash
bash scripts/run-dev.sh <branch-or-worktree> --label "Feature Name"
```

`<branch-or-worktree>` picks the checkout to run (branch name, worktree name, or `--path`; omit for the main checkout). **Always add `--label "<Feature Name>"`** so the window is tellable apart — see [Telling instances apart](#telling-instances-apart) below.

The script sets three env vars and runs `npm run dev` in `<checkout>/desktop/`:

- `YOUCODED_PORT_OFFSET=50` — shifts every port youcoded controls (set via `--offset`).
- `YOUCODED_PROFILE=dev` — marks this as a dev instance (set via `--profile`). Any non-empty value activates dev mode: userData is split into `%APPDATA%/youcoded-<profile>/`, the app name becomes `YouCoded Dev` (or `YouCoded Dev (<profile>)` for non-`dev` profiles), the remote port gets offset-shifted, and `install-hooks.js` is skipped so we don't write worktree paths into `~/.claude/settings.json`.
- `YOUCODED_DEV_LABEL` — the window-title descriptor (set via `--label`; defaults to the branch name). `main.ts` turns it into the OS window title `YouCoded - <label>`.

## What gets isolated

| Thing | Built app | Dev instance |
|---|---|---|
| Vite dev server | n/a (packaged) | `localhost:5223` |
| Remote server default port | 9900 | 9950 |
| Chromium remote-debugging port | never (blocked by `!app.isPackaged`) | `127.0.0.1:9272`, **on by default** |
| Electron `userData` | `%APPDATA%/youcoded/` | `%APPDATA%/youcoded-dev/` |
| Window title (taskbar / Alt-Tab) | YouCoded | `YouCoded - <label>` (from `--label`, else the branch name; bare env-var launch with no label → `YouCoded Dev`) |
| localStorage (theme, font, recents) | untouched | dev-only, starts empty |
| `~/.claude/settings.json` hooks | written by the built app | **not touched by dev** (see below) |
| Home folder (chats, settings, themes, plugins, providers, synced folder) | the real one | **private**: `~/.cache/youcoded-test-copies/<profile>/home` (see below) |

## Inspecting a live renderer

`run-dev.sh` opens Chromium's remote-debugging port by default, at `9222 + offset`
(9272 at the default offset). `--no-devtools` turns it off.

```bash
node scripts/cdp-eval.mjs --dev '(async () => await window.claude.account.signedIn())()'   # main window on 9272
node scripts/cdp-eval.mjs '<ws url>' '<expr>'   # any other target, from curl -s http://127.0.0.1:9272/json/list
```

**Why it defaults on.** Before 2026-08-28 this needed `YOUCODED_DEVTOOLS_PORT` set by hand,
which meant killing the app, relaunching, and losing the state you were trying to inspect.
That cost three restarts during the marketplace-feedback debugging, and the bug it finally
exposed — a main-process handler quietly dropping two fields — was invisible to `tsc` and to
the entire test suite, because the component tests mock that layer. One eval against the
live app answered in seconds what inference had got wrong twice.

**Why it is safe.** Chromium binds it to `127.0.0.1` only — strictly less exposed than the
remote server the same script starts on `0.0.0.0`. `main.ts` also ignores the variable unless
`!app.isPackaged`, so a packaged build cannot open it however the env is set. It does mean
any process running as you on this machine can execute JS in the **dev** renderer; that is a
smaller step than it sounds (such a process can already read your files), and it never
applies to the built app.

## Telling instances apart

Destin often reviews **several dev instances at once**, and every window's title is otherwise just "YouCoded" — impossible to tell apart in the taskbar / Alt-Tab / window switcher. So:

**When launching a dev instance for Destin to look at, always pass `--label "<Feature Name>"`.** Use a short human-readable descriptor of what's being tested (`--label "UI Consistency"`, `--label "Buddy Mascot"`), not the raw branch name. The window then reads `YouCoded - UI Consistency`. Omitting `--label` falls back to the branch name, which is better than nothing but not as clear.

**A window Destin is hand-testing runs from a worktree nothing else is editing, on a quiet machine.** Make a detached worktree of the commit under test and launch that. On 2026-10-05 a test window ran from a worktree a helper was still editing: a hot reload landed mid-test, the terminal came back blank, and the send gate refused his messages, which looked like an app bug. Pause lab runs and builds while he tests too. The 2026-10-07 realism lab measured a heavily loaded machine making a dev window's session switches about 3× slower, and that load (this session's own helpers) was part of the lag he reported.

The title is **dev-only** — it comes from `YOUCODED_DEV_LABEL` / `YOUCODED_PROFILE`, both unset in the built app, so production keeps the plain "YouCoded" title. Cross-platform (one Electron path for Win/Mac/Linux). The app's own titlebar is hidden (custom chrome), but the OS still uses this title for the taskbar/switcher.

## Running a second concurrent instance

Give each instance a **distinct `--offset` AND `--profile`** (and its own `--label`):

```bash
bash scripts/run-dev.sh feat/my-branch  --offset 100 --profile dev2 --label "My Feature"
```

Each profile gets its own `%APPDATA%/youcoded-<profile>/` userData dir; each offset gets its own Vite/remote ports. **Collisions are not graceful:** two instances on the same offset fight over the port, and two sharing a `--profile` fight over the Local Storage leveldb lock — either way one window gets SIGKILLed shortly after it renders. If a launch dies ~10s in, check for a port/profile clash with another running instance (`--list` shows registered worktrees; `ss -ltn` shows busy ports). The `--profile` value is freeform (`dev`, `dev2`, `feature-x`); the only reserved value is empty/unset, which means "this is the built app" and re-enables `install-hooks.js`.

**`--stop` also ends the dev window's OWN Claude sessions, and its output names them like
anyone's.** A dev window starts `claude` processes for its chats (one appears within seconds of
launch, before anyone touches it), they inherit the debugger port, and `run-dev.sh --stop` ends
every pid on that port — printing `stopping pid … (/home/…/.local/bin/claude
--dangerously-skip-permissions …)`. That line looks exactly like one of Destin's real sessions
and cost eight calls to clear on 2026-09-18; it is the dev window's child. Tell Destin before
stopping or restarting a dev window he has chats open in: they end with it.

**After editing the renderer's ENTRY file, restart the dev window before anyone judges it.**
Hot reload re-runs `index.tsx` and calls `createRoot()` on a container that already has a root
(`You are calling ReactDOMClient.createRoot() on a container that has already been passed…` in
the launcher's log), stacking a second app in the window; one such reload threw
`NotFoundError: removeChild` into `RootErrorBoundary` (2026-09-18). A large merge of master
into the branch does the same. Glitches seen in that window may not be real.

The equivalent env-var form still works (`YOUCODED_PROFILE=dev2 YOUCODED_PORT_OFFSET=100 bash scripts/run-dev.sh`), but the flags are clearer and add `--label`.

### Why dev doesn't install hooks

`scripts/install-hooks.js` writes absolute paths to `hook-scripts/relay.js`, `title-update.sh`, etc. into `~/.claude/settings.json`. If dev ran that script from a worktree, the paths would point into the worktree — and the moment the worktree is removed, every hook call fails with ENOENT. Sessions then hang on the "Initializing" overlay forever because the app waits for the first hook event to confirm Claude is alive.

To prevent that, `main.ts` skips `install-hooks` when `YOUCODED_PROFILE=dev`. Dev uses whatever hook-script paths the built app last wrote. Tradeoff: editing `hook-scripts/*.js` or `*.sh` in dev won't take effect until you rebuild and reinstall the app. Hook-script changes are rare in practice.

The built app also self-checks on every startup: if it finds a hook command whose path contains `.worktrees/` or doesn't exist on disk, it logs a warning and lets `install-hooks.js` repair it. So even if something slips past (e.g., from an older dev build that didn't have the skip-in-dev gate), relaunching the built app once recovers automatically.

If you ever see errors like `Cannot find module 'C:\...\.worktrees\...\relay.js'` in the terminal, that's the smoking gun — **close the dev app and relaunch the built app once**.

## The private home: what a test copy keeps to itself, and what it borrows

**Every `run-dev.sh` launch runs in a private home folder** (card #17, Destin 2026-11-11):
`~/.cache/youcoded-test-copies/<profile>/home`. The app finds `~/.claude` (Claude Code chats, settings, plugins,
themes), `~/.youcoded` (native chats, providers), `~/YouCoded` (the synced folder) and its own data folder through
`HOME`, so all of them live inside that folder. The real app never reads it; the test copy never writes the real ones.

- **It starts like a fresh install**: default theme, no installed plugins or skills, no past chats, sync off. The folder
  is reused by the next launch of the same `--profile`; `--fresh` empties it first.
- **Sign-ins are lent, by default all three**: `claude-code`, `chatgpt`, `api-keys`. Switch any off for one launch with
  `--without chatgpt,api-keys` (or `--without all`). The launch prints one line per sign-in: kept, OFF, or NOT AVAILABLE
  with the reason.
- **Lent means a pass, never the renewal key.** Claude Code and ChatGPT each store a short-lived pass and a renewal key
  that is replaced every time it is used. A test copy holding the renewal key could sign the real app out, so
  `scripts/dev-signins/prepare-home.mjs` copies the pass only (ChatGPT's is unlocked and re-locked through the system
  keychain by `keychain-tool.cjs`, with a dud in place of the renewal key). When the pass runs out (Claude Code: hours;
  ChatGPT: days) the test copy is signed out; relaunch to borrow a fresh one. If the real pass has already run out
  (the real app has not used that service lately), the line says NOT AVAILABLE. API keys do not renew and are copied.
- **GitHub is OFF unless `--with github`**: with it the test copy can publish themes and open pull requests as Destin
  (it did, unasked, on 2026-10-01). Off, the app's GitHub calls fail with a 401 (a decoy token).
- **Never lent**: bank connections, page connections, the marketplace sign-in, Google.
- Switching a sign-in off on a reused home removes what an earlier launch lent; a key or sign-in the tester added
  inside the test copy stays.
- **A caller that sets its own throwaway `HOME`** (a smoke, the perf lab) is left as before: nothing is lent and GitHub
  is hidden behind a private bus (`scripts/dev-isolation.sh`). `--without`, `--with` and `--fresh` are refused there.

Proven 2026-11-11 with a real window: a Claude Code chat answered in the test copy; the real chat list, native chats,
synced folder, settings files, provider list, theme list and keychain entries were identical before and after, and the
chat's code word existed only under the private home. Guards: `scripts/dev-signins/prepare-home.test.mjs`.

## Caveats

- **Windows OneDrive.** If `~/.claude/` lives under a OneDrive-synced folder, two writers can produce conflict copies. Check with `(Resolve-Path ~/.claude).Path` in PowerShell — if the path starts with a OneDrive folder, either exclude `.claude` from sync or accept the occasional conflict file.
- **Concurrent Claude sessions share the defaults — give each its own offset.** `run-workbench.sh`
  defaults to Vite 5233 and `workbench-boot-check.mjs` used to pin Chrome's debugging port at
  9977; on 2026-08-25 two sessions collided on both: one boot check hung 40 minutes attached to
  the other's Chrome, and a screenshot sweep "reused" the other session's workbench and shot the
  wrong worktree. Never reuse a server you did not start without checking what it serves
  (`ss -ltnp 'sport = :5233'` → pid → `readlink /proc/<pid>/cwd`); the review tools no longer
  share servers at all (`scripts/shoot/` builds and serves on a free port per run). Pass
  `YOUCODED_PORT_OFFSET` per session for `run-dev.sh` / `run-workbench.sh`.
- **Second dev run fails noisily.** `strictPort: true` in `vite.config.ts` means if the dev port is already taken, Vite errors instead of silently picking the next one. Kill the stale process or bump `YOUCODED_PORT_OFFSET`. To find what's holding the port: `netstat -ano | grep ":5223 "` (substitute your chosen Vite port).
- **No dev instance with sync on beside the installed app until the next release after beta.80.** A dev copy syncing the same `~/YouCoded` folder raced the size-cap step and stuck sync for nine days (youcoded#483/#485 fixed it, but the installed build predates the fix).
- **If dev crashes, close only the dev window.** The built app is unaffected.
- **A dev window stuck full-screen and grabbing input (KDE/KWin only)** can be closed with `bash scripts/kill-stuck-overlay.sh`. It only kills a window whose program file lives under `$HOME/youcoded-dev` (a dev checkout or worktree's Electron) — it refuses and explains itself instead of touching anything else, so it cannot close Destin's live built app.
- **Launching dev from inside a Claude Code session used to break chat view.** Because `run-dev.sh` may be run via a Claude session's Bash tool, the dev Electron inherits `CLAUDECODE`/`CLAUDE_CODE_CHILD_SESSION`/`CLAUDE_CODE_SESSION_ID`. Those previously flowed into every spawned `claude`, which then ran as a *nested* session and wrote no transcript → chat view stayed empty while terminal view worked. `pty-worker.js` now strips these before spawn, so dev works no matter how it's launched. See `docs/PITFALLS.md → Local Dev & Launch Environment` (youcoded#106). If you ever see "responses only in terminal, never in chat" again, confirm the strip is present in `pty-worker.js`.
- **Clean shutdown matters on Windows.** Ctrl-C / killing the `npm run dev` bash process does NOT cascade-kill the Electron children it spawned — they keep running and hold file locks on `desktop/node_modules/electron/…`. This bites when you try to remove a worktree while a dev instance was there: `git worktree remove` fails with "Invalid argument" because files are still locked. Correct order: (1) close the dev window, (2) Ctrl-C the npm shell, (3) verify no orphans with `powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*.worktrees*' } | Select-Object Id,Name"`. Force-kill survivors with `Stop-Process -Id <pid> -Force`.

## Committing dev changes

Work lives in a worktree (`.worktrees/youcoded-dev-profile`). The usual flow applies:

```bash
cd .worktrees/youcoded-dev-profile
git add -p
git commit
git push origin dev-profile
# open PR, merge, then:
cd ../..
git worktree remove .worktrees/youcoded-dev-profile
git -C youcoded branch -D dev-profile
```

## How it's wired

| File | Role |
|---|---|
| `youcoded/desktop/src/shared/ports.ts` | Single source of truth for `VITE_DEV_PORT` and `REMOTE_SERVER_DEFAULT_PORT`, both derived from `YOUCODED_PORT_OFFSET`. |
| `youcoded/desktop/vite.config.ts` | Reads the same env var directly (vite.config runs outside the main tsconfig). |
| `youcoded/desktop/src/main/main.ts` | Computes `DEV_SERVER_URL` from the shared constant; splits `userData` and app name when `YOUCODED_PROFILE=dev`. |
| `youcoded/desktop/src/main/remote-config.ts` | Default port comes from the shared constant. |
| `scripts/run-dev.sh` | Sets both env vars and runs `npm run dev`. |

## Driving the desktop dev app via CDP (headless verification)

**To click through a dev window, use `node scripts/shoot/explore.mjs start --dev`**
(`scripts/shoot/README.md`): numbered controls, pictures and layers per step, attached only
through the marker `run-dev.sh` writes. A tester with no workspace context gets
`scripts/ui-review/tester-kit.md`; the implementing session starts the dev window first. The
raw recipe below is for evaluating code in the page (preload calls, state), which `explore`
deliberately does not offer.

For programmatic UI verification of the DESKTOP dev instance (the Android recipe in
CLAUDE.md uses adb; this is the desktop equivalent, first used for the Phase 2 Plan A
live-acceptance run):

1. `bash scripts/run-dev.sh <branch>` opens the debugging port by default (9222 + offset, 9272
   at the default offset 50; `--no-devtools` turns it off) and records it, with its own pid,
   in `desktop/.dev-instances/<offset>.json`.
2. `curl http://127.0.0.1:9272/json` lists page targets. Gotchas: the buddy floater is its
   own page at `?mode=buddy-mascot` — match the main window by EXACT url
   `http://localhost:5223/`, not a substring; DevTools windows also appear as pages.
3. Evaluate via `Runtime.evaluate` (awaitPromise) + `Page.captureScreenshot` over the
   target's webSocketDebuggerUrl — `scripts/cdp-eval.mjs` works with the ws url directly.
4. The whole `window.claude` preload surface is callable from evals — creating sessions,
   listing the provider catalog, etc. — which beats DOM-clicking for setup steps. For the
   InputBar specifically: there are TWO textareas in the DOM; use the one inside a
   `<form>` and submit with `form.requestSubmit()` (React's Enter handler is flaky with
   synthetic KeyboardEvents).
5. Never do any of this against the live app (live-app-safety rule) — the flag-launched
   dev instance only.
6. A session you create here lands in the test copy's private home (see "The private home" above), not in Destin's
   chats. A launcher other than `run-dev.sh` gets no private home by itself: give it a throwaway `HOME` and run it
   through `HOME=<throwaway> bash scripts/dev-isolation.sh <command>`, which also hides the GitHub login (`gh` keeps it
   in the OS keyring, so a different `HOME` alone does not). Check with
   `HOME=<throwaway> bash scripts/dev-isolation.sh gh auth status`, which must say not logged in.

## Driving a dev window's Claude Code chat

`node scripts/shoot/dev-chat.mjs [--worktree <name>] <verb>` (card #209) runs the chat steps a
Claude Code test needs, against a dev window `run-dev.sh` started. Each call attaches, does one
thing and detaches:

- `new <folder>`: a new Claude Code chat there; says yes to the trust-folder prompt.
- `mode normal|auto`: clicks the permission chip until it reads that mode (auto mode never shows
  permission cards, so switch to normal to test them).
- `say "<text>"`: types with real key events and presses Enter once. It never presses it twice.
- `click "<label>"`: a real click on the one visible button with that label.
- `shot [file.png]`: a picture (default `scratch/dev-chat/`).

It reaches a window only through the marker `run-dev.sh` writes (the same rule `explore --dev`
follows), so it cannot attach to the installed app. First real run 2026-11-11 (card #17): `new` opened the chat but
did NOT answer the trust-folder prompt (`click "Yes, I trust this folder"` did), `say` sent once and the reply
arrived, `shot` worked. Still to confirm:
(1) `new` reaches a chat on screen and the trust button's label contains "trust"; (2) the chip
is found and `mode normal` / `mode auto` both land; (3) `say` with a very long message (a long
file path, card #7) is sent by the real Enter and the box empties; (4) `click` finds a permission
card's button by its label; (5) one message appears once, not twice.

## Trying a Page without the app

`node scripts/page-standin.mjs <pageFolder> [--port N]` serves the folder's `page.html` at a
`127.0.0.1` address with a stub `window.youcoded` (card #239). Its saved data is the folder's
`data.json`; `youcoded.fetch` answers only from an optional `fetch.json` (exact URL to
`{status, body}`); session, chats and program abilities exist only when `page.json` declares that
connection. It never reaches a network or uses a token, and it is not the app's sandbox, so a page
that works there can still be refused in the app. Full list: the script's header.

## Analytics: team devices and test runs

Only official release builds send the app's anonymous daily check-in (`desktop/src/main/official-build.ts`, stamped by the release workflows), so dev windows, source builds and `-releasetest`/test builds never count. Two switches cover the rest:

| Situation | Use | Effect |
|---|---|---|
| The owner's computers, or any long-lived test machine | the **team-device file** `~/.claude/youcoded-team-device` | still checks in, marked `team`; the owner dashboard leaves it out unless **My devices** is on, and counts it under "Left out" |
| A throwaway run (a VM you delete, an automated test, a script) | **`YOUCODED_NO_ANALYTICS=1`** in the app's environment | sends nothing at all |

- **Having this workspace does NOT make a computer a team device** — anyone can use it to improve the app, and their everyday YouCoded is a real user. `workspace-start.mjs` and `setup.sh` create the file only when `gh` is signed in as the owner (`itsdestin`; `scripts/team-device.mjs`). A contributor who wants their own test machine left out creates the file by hand.
- `scripts/vm/vm.sh <vm> load …` and `fedora.sh load` write it inside the guest, so an installer test never reads as a new user. A VM made any other way: create `~/.claude/youcoded-team-device` (Windows: `%USERPROFILE%\.claude\youcoded-team-device`) before first launching the app, or launch it with `YOUCODED_NO_ANALYTICS=1`.
- A phone: the app identifies it by its Android ID, so add its hash to the owner's list instead — `node youcoded-admin/skills/analytics/scripts/device-hash.mjs --android <ANDROID_ID>` (see that skill's "Admin filter").
- The vitest suite sets `YOUCODED_NO_ANALYTICS=1` for every test (`desktop/vitest.config.ts`).

## Testing on a phone

A phone's browser gets the app from the dev window's remote server. By default that is **live code
from Vite**: every renderer edit reaches the phone, but hundreds of separate module files load slowly
over a phone connection, and Vite's own page code reloads the whole page whenever its connection
drops (sleep, wake, a dev restart), which a real phone never does.

`bash scripts/run-dev.sh … --phone-build` builds the app once and serves that copy instead: it loads
and reconnects like the installed app. Renderer edits reach the phone only after another build, so
restart with the flag after changing renderer code. The dev log's first remote line says which copy
the phone gets (`[RemoteServer] phone page: …`). Before 2026-09-11 the server served ANY built copy
it found on disk, and one left by an Android test build hid a day of phone-side fixes.
