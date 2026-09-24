---
date: 2026-09-24
status: draft
type: plan
topic: Android rebuild — the phone runs the same assistant core and socket door as the computer, Kotlin shrinks to a thin phone shell, every program ships inside the app for Google Play, then the phone-native product work
---

# Android rebuild — plan (draft, not approved)

> **Status.** Exploration output, 2026-09-24. Nothing here is approved or scheduled. It
> builds on the decisions already recorded in
> `docs/active/investigations/2026-09-10-android-parity-audit.md` (§7–8 and appendix) and
> `docs/active/handoffs/2026-09-10-android-rebuild-START-HERE.md`, and **depends on Stages 1–4
> of** `docs/active/plans/2026-09-24-remote-access-refactor-plan.md`. Where it changes the
> audit's step-4 design, that is called out.
>
> **Evidence.** Read-only investigations R1–R6 on 2026-09-24 against app master `ab15a5858`,
> plus web research on Google Play policy (sources in §External facts). *(unverified)* marks
> anything reasoned rather than run. Nothing was tried on a phone.

## For Destin — what this is, in plain words

The Android app shows the **same screens** as the computer (one shared interface). Behind those
screens, the phone has its **own separate copy of the app's features, rewritten in a different
language** (Kotlin): about 22,400 lines. Roughly 10,000 of those lines copy logic the computer
already has: sync, skills, the marketplace, reading conversations, Resume, files. Every copy
drifts, and most known phone bugs live in the copies. Examples: Resume opening the wrong
conversation, skill settings wiped after the first launch, the permission chip never showing
"auto", and messages sent on a timer.

**The plan:** put the computer's own "brain" on the phone. The remote-access plan turns that
brain into a plain program that doesn't need the desktop app around it. The phone then runs
that exact program, and the shared screens talk to it the same way a phone browser talks to
your computer. The Kotlin part shrinks to only what a phone must do itself: the app window,
staying alive in the background, notifications, sharing into the app, file pickers, the
microphone, the camera for QR pairing, and the terminal.

**The Google Play problem, and the fix:** on first launch the app currently **downloads
programs from the internet** (Node, git, and others from Termux's servers). Google Play forbids
downloading programs after install. That rule is what kept Termux itself off Play. The fix is
the one Termux's own Play version uses: **ship every program inside the app file**, so nothing
executable is downloaded. The app gets bigger (estimated 100–200 MB, unmeasured). First launch
gets faster and works offline.

**What you would notice when it's done:**
- The built-in assistant (ChatGPT, OpenRouter) works on the phone, as decided on 2026-09-10.
- Phone bugs that came from the Kotlin copies disappear, because the copies are gone. New
  features added on the computer arrive on the phone automatically, or clearly say "not on this
  device".
- Setup no longer downloads programs; the app installs from Google Play.
- Then the phone-only work: notifications you can act on, sharing into the app, real file
  access, long-press menus, and a phone-first home screen. The home screen gets its own mockup
  round first.

**What it costs:** it can't really start until the remote-access refactor's first four stages
land. Before that, two **experiments** can run on a real phone right now without touching
anyone else's work (Stage 0). The audit's own estimate: 3–5 weeks from start to a working
ChatGPT session on the phone, 6–10 weeks to "premium". This plan does not re-estimate.

## Where things stand (facts, 2026-09-24)

| Thing | Today | Evidence |
|---|---|---|
| Kotlin size | 22,375 lines, 66 files. `runtime/` 11,901 (SessionService 5,047, Bootstrap 1,798, SyncService 1,562); `skills/` 3,335; `parser/` 2,117; `artifacts/` 1,348; `ui/` 1,384; `bridge/` 735 | R3 §1 |
| How the screens reach Kotlin | The WebView loads the bundled interface. `remote-shim.ts` talks WebSocket to `LocalBridgeServer.kt` on localhost:9901, using **the same protocol as the computer's remote door**. `SessionService.handleBridgeMessage` has 196 top-level cases | R3 §2, §4 |
| Paired-computer mode | The WebView's JavaScript talks **directly** to the computer's remote door. Kotlin only stores the saved-computers list (`PairedDeviceStore.kt`) | R3 §4 |
| Copies of computer logic | Self-declared ports: `SyncService.kt` ("Kotlin port of sync-service.ts"), `TranscriptWatcher.kt`, `LocalSkillProvider`/`SkillConfigStore`/`PluginInstaller`/`ClaudeCodeRegistry`/`McpReconciler`, marketplace clients, `artifacts/*` path policy, `DevTools.claudeAuthStatusJson`, `AnalyticsService`, `MenuAnswerLock`, `PermissionAutoApprove`, `SessionBrowser`, `HookReconciler`: **~9,500–11,000 lines**. That is 3× the roadmap's "~3,150" | R3 §1, §5 |
| Node on the phone | Yes, but only to run Claude Code (pinned 2.1.112). `Bootstrap.kt` unpacks a bundled Termux base (`assets/bootstrap-aarch64.zip`), then **downloads** `nodejs`, `npm`, `git`, `gh`, `rclone`, `ripgrep`, `python`… from `packages.termux.dev` at first run (`Bootstrap.kt:304,334,437-457`). Node's version is unpinned. Everything runs through the `linker64` + `LD_PRELOAD` exec workaround; Go programs (`gh`) need separate wrappers | R3 §3, R5 §5 |
| Can the computer's brain run in that Node? | The harness (`desktop/src/main/harness/`, 111 files, 32,153 lines) has **zero** Electron imports. The rest of the runtime needs only a data folder path, a URL opener and 3 dialogs (the remote plan's Stage 1 removes all of those) | R1 §3, R3 §3 |
| Terminal | Desktop runs `node-pty` in a separate helper process (`main/pty-worker.js`, 426 lines, messages `spawn`/input/resize/kill → `data`/`exit`/`spawned`), because Electron can't load it. Android uses a vendored Termux terminal emulator driven from Kotlin (`PtyBridge.kt`). No Android build of `node-pty` exists *(unverified whether one is feasible)* | R3 §3, checked 2026-09-24 |
| Decisions already made | Built-in assistant first; Claude Code stays frozen (older option); harness before phone basics; **Google Play prioritised** (DUNS number received); full Project View including git; restore wizard removed (done, youcoded#468); Phase 4 before the rebuild; "Online" means app in front; phone default UI rethought design-first | R5 §1 |
| Done so far | Step 2–3 "honest builds": real version stamps, notification permission, arm64-only, honest `unsupported` refusals, restore wizard deleted (youcoded#468) | R5 §2 |
| Tests | 251 JVM tests, **0** instrumented tests on a device | R5 §2 |

## The target shape

```
 ┌──────────────── Android app (one APK, everything inside) ────────────────┐
 │                                                                           │
 │  WebView: the SAME shared interface ── remote-shim ──┐                    │
 │                                                      │ WebSocket, localhost│
 │                                                      ▼  (token, as today) │
 │  ┌──────────── Node process (bundled binary) ─────────────────────┐      │
 │  │ SOCKET DOOR  — the same code the computer uses for phones      │      │
 │  │ CORE        — createRuntime(platform = Kotlin, dataDir)        │      │
 │  │   harness · sessions · sync · skills · marketplace · files ·   │      │
 │  │   transcript reading · Resume · session record (all shared TS) │      │
 │  └──────┬───────────────────────────────────────┬────────────────┘      │
 │         │ platform calls (small local socket)    │ PTY host protocol      │
 │         ▼                                        ▼ (same as pty-worker)   │
 │  Kotlin SHELL: activity + WebView host · foreground service + wake lock · │
 │  notifications (inline Allow/Deny) · share-in/out · file pickers (SAF) · │
 │  secrets (Keystore) · clipboard · mic (SpeechRecognizer) · QR camera ·   │
 │  VPN check · paired-computer list · binary unpacking · PtyBridge         │
 └───────────────────────────────────────────────────────────────────────────┘
          Paired to a computer? The WebView talks to the computer's socket door
          directly, exactly as today. Same protocol, so no second client.
```

**The key insight: the phone app *is* a remote-access client of a computer that happens to live
inside the phone.** The remote-access refactor builds one socket door and one feature table for
phones reaching computers. The phone reuses both for itself, which is why the remote plan comes
first.

## The seams — where we cut

| # | Seam | Cut | What collapses into it |
|---|---|---|---|
| A1 | **Packaging** | Every executable ships inside the APK; nothing executable is downloaded. The proven technique (termux-play-store's) is **not** one file per program. The whole program tree is packed as a single archive named like a library (`lib/arm64-v8a/lib…-bootstrap.so`) with `packagingOptions.jniLibs.useLegacyPackaging = true`, so Android installs it to disk. The app unpacks it on first run and keeps using the `linker64` route to run programs. The harness and its JS dependencies (AI SDK, zod, MCP SDK, pdfjs) ship as a bundled script asset. Claude Code 2.1.112 ships bundled too | `Bootstrap.kt`'s apt/`packages.termux.dev` download path, its mirror and retry logic, and first-run network dependence |
| A2 | **Core on the phone** | Node runs `createRuntime(platform, dataDir)` plus the **socket door** from the remote plan, in local mode (bridge token, no password pairing) | The audit's step-4 plan to *copy* remote-server's dispatcher into a new ~1,000-line `harness-host.ts`: after the remote refactor there is nothing to copy |
| A3 | **Platform bridge** | Kotlin implements the core's `Platform` interface over a small local socket: open URL, pick file/folder, notify (with actions), secrets (Keystore), clipboard image, share events, VPN status, keep-alive, and **paths to bundled programs**. The last one is needed because the harness's search tool is hard-wired to `@vscode/ripgrep`'s desktop-only prebuilt `rg`, which cannot run on the phone; it must be told to use the bundled one. The `android:*` channels are declared in the same contract as a platform family | `PlatformBridge.kt` and the `android:*` cases, re-homed rather than rewritten. Remote-shim's separate `android-local-bridge.ts` second socket *(to check in Stage 3)* |
| A4 | **Terminal** | Two real changes, not a drop-in: (1) `session-manager.ts` talks to `pty-worker.js` through Node's built-in child-process channel (`child.send()`), which Kotlin cannot join. It needs a small transport layer (a socket) so a Kotlin terminal can stand in for the worker. (2) The desktop's **echo-driven submit** logic (chunking, waiting for the typed text to echo back before pressing Enter) lives *inside* `pty-worker.js`. It must move up into shared code, or Android keeps its blind 600 ms timer. After that, `PtyBridge.kt` provides only raw spawn/read/write/resize | Kotlin's own session/prompt/echo logic (`ManagedSession`, the 600 ms submit timer, the screen-scan prompt detector), **once both changes are made** |
| A5 | **Migration path** | *Forwarding first:* Kotlin's bridge keeps the socket at first and forwards moved families to Node. When sessions have moved, *flip:* Node owns the socket and Kotlin's dispatcher is deleted | Lets each step ship on its own instead of one big switch-over |

## Stages

### Stage 0 — experiments on a real phone (can start now; touches no shared files)

Two short spikes, in a scratch branch, each ending in a written result:

1. **Node + harness from inside the APK.** Package a Termux-built Node (arm64) in `jniLibs`.
   Run the harness headless against OpenRouter over a local socket with a stub screen. Measure
   cold start, memory at idle and mid-turn, and battery over a 30-minute session with the
   screen off under the existing foreground service. Also check that Doze doesn't freeze it.
   This settles the audit's biggest untested claims (R5 §4.5).
2. **nodejs-mobile, compared.** Same test with `nodejs-mobile` (Node built as an Android
   library, Play-friendly by design). Things to learn: its Node version *(unverified; the
   harness needs a modern Node)*, whether it can start child processes (MCP servers, git), and
   whether it can restart after a crash, given it runs inside the app's own process.
   **Leaning:** Termux-built Node in `jniLibs`, because the older Claude Code, git and ripgrep
   need runnable programs anyway. One Node serving both the harness and Claude Code is simpler
   than two. The experiment decides.

Also measure the **APK size** with the full program set bundled (the audit's 100–200 MB is a
guess), and list which programs make the fixed set.

**One Kotlin fix worth doing now despite the rebuild:** skill settings are *wiped* by the first
save because `SkillConfigStore` never loads (appendix #12). That destroys users' data, so don't
wait for its family to move. Other Kotlin-only bugs (Resume, event-bridge mapping, permission
chip, submit timer) disappear when their family moves, so they aren't worth fixing twice.

### Stage 1 — Play-ready packaging (A1) · independent of the remote refactor

- Programs into `jniLibs`, unpacked on first run with no network. The `linker64`/`LD_PRELOAD`
  exec route stays (Termux's Play version uses the same technique). Keep the Go-program
  wrappers.
- Delete the apt download path and the `packages.termux.dev` dependency. Pin Node's version.
- Analytics consent screen before the first heartbeat (appendix: a Play data-safety exposure
  today).
- targetSdk 36, and the `specialUse` foreground-service manifest `<property>` with its
  written justification. It is **missing today**, and Play reviewers judge `specialUse` by it.
  Stay on `specialUse`: the tempting `dataSync` type gets a 6-hour daily limit on Android 15,
  which would kill long sessions.
- **Existing users:** today's installs already hold a downloaded, unpinned program folder. On
  upgrade, the app replaces it with the bundled set and leaves the user's home folder
  (conversations, settings, projects) untouched. Test this on a phone with an old install.
- **Gate:** a fresh install in airplane mode reaches a working Claude Code session. Instrumented
  test #1: first-run completes (the first instrumented test the app has).

### Stage 2 — the built-in assistant on the phone (A2 + A3, audit step 4) · after remote Stages 1–2

- Node starts `createRuntime` with a Kotlin-backed platform, and the socket door with **only**
  the native/provider/chatgpt families enabled (~28 channels).
- Kotlin's bridge forwards those families to Node (forwarding-first, A5).
- Keep the audit's step-4 rules: local models still refuse, behind a **new**
  `localEngine.supported=false` flag (not `native.supported`, which crashes the Local Models
  screen, appendix #27). ChatGPT sign-in opens through the platform's URL opener, never a shell
  shim (the Go-binary trap). `defaults:get` returns the chosen default model (4-line fix).
- **Gate:** a ChatGPT and an OpenRouter conversation on a real phone, screen off for 10 minutes
  mid-turn, still alive. Instrumented test: bridge handshake.

### Stage 3 — move the copied families to Node · after remote Stage 3 (the families exist in the table)

One run per family. Each deletes its Kotlin copy **and** its cases in `SessionService`, after a
real-phone check. Order, least risky first (R3 §5):
1. analytics (tiny; proves the pattern; **the HMAC salt must stay identical** to
   `analytics-salt.ts`)
2. marketplace, theme-marketplace, skills (includes `PluginInstaller`, `McpReconciler`,
   `ClaudeCodeRegistry`)
3. sync / Sync Spaces (`SyncService.kt` explicitly ports `sync-service.ts`; the TS file is the
   spec)
4. artifacts / project files (security-sensitive path rules: add a **pinning test** first, then
   delete the Kotlin copy). This is what Destin's "full Project View including git" decision
   builds on.
5. sessions, transcripts, hooks, Resume, prompts (`TranscriptWatcher`, `EventBridge`,
   `InkSelectParser`, `SessionBrowser`, `ManagedSession`, `SessionRegistry`) — **last**,
   because they sit on the live terminal stream. Needs both A4 changes: the terminal
   transport layer, and the submit logic moved into shared code. The latter is a desktop
   change, reviewed on its own. This retires the Resume bugs, event-bridge mis-mapping, the "auto" chip, the
   600 ms submit timer and the screen-scan false positives.

**Gate per run:** the family's channels answered by Node; the Kotlin files deleted, not left
dormant; the user-visible changes on the phone listed.

### Stage 4 — flip: Node owns the socket (A5) · after Stage 3

- Node's socket door serves the WebView directly. `LocalBridgeServer`, `MessageRouter` and the
  `SessionService` dispatcher are deleted. `SessionService` keeps only the foreground-service,
  notification and wake-lock lifecycle (~150–200 lines today).
- The phone now gets the remote plan's Stage 4 benefits for free: per-session delivery, resume,
  and one way to fill the screen.
- Process-death restore: Android may kill the app; on relaunch the core's session record plus
  the transcript page restore the screen. This is the same "fill a window" path as a phone
  reconnecting.
- **Gate:** instrumented tests for handshake, first run and restore after process death.

### Stage 5 — phone-native product work (audit 7e) · design-first

Per the 2026-09-10 decisions, in the audit's order. Each UI item goes through feature-flow
(questions deck → workbench mockups → review deck):
- **Phone default UI** (quick dispatch, chips, session switching, search; full desktop layout
  still reachable). Destin asked for its own mockup round before any build, so it's scheduled
  here explicitly (the docs had no slot for it).
- Notifications you can act on: inline Allow/Deny, "session finished", a real icon.
- Share into the app (text, links, images, PDFs) and share out. None exists today (no
  `ACTION_SEND` anywhere).
- Real file access: SAF folders, the WebView file chooser (currently dead), "open externally".
- Touch: long-press menus (no long-press handler exists), reorder by touch, safe-area insets,
  one narrow-width breakpoint (4 today in 3 files).
- Polish: predictive back, themed system bars, splash, haptics, tablet/foldable, crash
  reporting with R8 mappings, renderer-crash recovery.
- Onboarding: sign-in (Claude/ChatGPT/OpenRouter), no download step any more.
- Android can say "Tailscale isn't running" as a fact (remote roadmap).
- Git on a phone screen: needs a design, since "full Project View" was chosen with that as the
  known con.

### Stage 6 — Google Play listing

Data-safety form (analytics consent from Stage 1), content rating, the foreground-service
declaration video/justification Play asks for `specialUse`, internal → closed → production
tracks. Keep the sideload build for existing users until Play is live.

## What this plan deliberately does not do

- **Local models on the phone.** Designed as a permanent "not available on this device"
  (7b). No phone inference engine is planned.
- **Unfreezing Claude Code** (running newer Claude Code on the phone). Stays unscheduled, as
  decided. Bundling 2.1.112 keeps it working.
- **Rewriting in Kotlin.** Already costed and rejected by the audit: 6–12 months plus doubled
  maintenance.

## Decisions for Destin (later — not blocking this document)

| # | Question | Recommendation | Why |
|---|---|---|---|
| 1 | Run the two Stage 0 phone experiments now, while remote Phase 4 waits? | **Yes** | They touch no shared files and they answer the questions everything else rests on: Node on the phone, battery, app size |
| 2 | Termux-built Node in the app vs `nodejs-mobile`? | **Decide from Stage 0**; leaning Termux-built | One Node for both the assistant and the older Claude Code; same technique Termux's Play version uses |
| 3 | Do Stage 1 (Play packaging) before the assistant? | **Yes** | Independent of the remote refactor; unblocks Play; removes the first-run download failures |
| 4 | Fix the skill-settings wipe now, in Kotlin? | **Yes, small fix** | It destroys data; waiting for the rebuild means more lost settings |
| 5 | Accept a larger download (est. 100–200 MB) for a Play listing and offline first run? | **Yes, once measured** | Play forbids the current approach; optional programs could later ship as Play feature modules |

## Risks

- **Battery and memory:** a Node process running the full core on a mid-range phone. Stage 0
  measures this before anything is committed.
- **Android killing the app:** the foreground service stays the anchor; Stage 4 adds restore.
- **App size:** bundling programs grows the APK. Measure in Stage 0; Play feature modules are
  the escape hatch.
- **MCP servers that are programs** (stdio) under Android's exec rules: ship web-based MCP
  first, as the audit says.
- **Release-build pitfalls:** R8 has broken reflection-based code before (`912f5ca7`,
  `PluginInstaller`). The platform-bridge code must not rely on reflection.
- **Slower program fixes:** once Node, git and ripgrep ship inside the app, a bug in one of
  them is fixed only by a new app release through Play review, not by the next download. JS
  in the bundled harness is the same.
- **Terminal work is bigger than it looks** (A4): the submit logic must move out of the
  desktop's helper before the phone can share it.
- **Dependency on the remote plan:** a slip there delays Stages 2–4. Stages 0 and 1 do not wait.

## Size

| | Today | After (estimate) |
|---|---|---|
| Kotlin | 22,375 lines | ~6,000–9,000: shell, UI, service lifecycle, platform bridge, PtyBridge, a smaller Bootstrap |
| Duplicate logic kept in sync by hand | ~9,500–11,000 lines | ~0 (the phone runs the computer's TypeScript) |
| `SessionService.kt` | 5,047 | ~200–400 (lifecycle only) |

## External facts (web research, 2026-09-24)

- Google Play forbids downloading executable code (native binaries, dex) from anywhere but Play.
  Interpreted code (JavaScript) run by an interpreter shipped inside the app is allowed.
  [Device and Network Abuse policy](https://support.google.com/googleplay/android-developer/answer/16559646)
- Termux was kept off Play by exactly this. Its Play version (`termux-play-store`) drops the
  package manager and ships every program inside the APK's native-library folder, run via the
  same `linker64` technique this app uses.
  [Termux and Android 10](https://github.com/termux/termux-packages/wiki/Termux-and-Android-10),
  [termux-play-store](https://github.com/termux-play-store)
- `nodejs-mobile` builds Node as an Android shared library bundled in the APK.
  [nodejs-mobile](https://code.janeasystems.com/nodejs-mobile) — its current Node version and
  its child-process support are *(unverified)*; Stage 0 checks them.
