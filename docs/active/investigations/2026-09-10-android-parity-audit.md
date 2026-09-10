---
date: 2026-09-10
status: active
type: investigation
topic: Android parity audit — everything the phone app lacks, breaks or does differently versus desktop and the browser, and what a premium mobile app with ChatGPT and OpenRouter takes
---

# Android parity audit (2026-09-10)

Read against master at `05149b01` (app) / `ed032ae2` (workspace). Six read-only sweeps
covered the bridge channel table, the native harness, the shared renderer's phone branches,
the git history since v1.2.4, the Android native shell, and the browser client. Every
surprising claim below was re-checked by hand; where a sweep was sampled rather than read
whole, that is said. Android's own unit suite passed on this checkout (753 tests, 0 failures).

## 1. The short version

- **The phone can only run Claude Code sessions.** The built-in assistant, ChatGPT sign-in,
  OpenRouter, model providers, specialists, web-search keys and permission rules do not
  exist on Android. Every one answers "not implemented on mobile".
- **The phone's Claude Code is frozen at 2.1.112.** Desktop installs whatever is newest
  (about 2.1.229 today). The gap is roughly 117 releases and grows daily. The command list
  the app shows on the phone describes commands the phone's CLI does not have.
- **Most "Android parity" work since May was name-only.** About 25 commits added stubs so
  the channel exists everywhere; the feature exists only on desktop. Reading the git log
  overstates the phone.
- **The good news is structural.** The desktop's own agent loop is ordinary Node code
  (~29,000 lines) that touches Electron in three files and six places, all already written
  as swappable pieces. Android already ships Node, git and ripgrep, already stores secrets in
  the Android keystore, and already speaks the same message protocol. Running the same
  program on the phone is a port, not a rewrite. Estimate: 3 to 5 weeks to a working
  ChatGPT/OpenRouter session, 6 to 10 weeks to premium.
- **The phone has real defects nobody has seen because nobody uses it.** Notifications are
  never permitted on Android 13+, so approval prompts never arrive. Scrolling back through a
  long chat returns garbage. The shipped beta APK is stamped 1.2.4, so a phone cannot tell a
  beta is newer. A four-month-old prebuilt web bundle is checked into the assets with the old
  keyboard-covers-the-input bug.
- **A premium phone app also needs things no port gives it:** sharing into the app from other
  apps, access to the user's real files, an onboarding that explains the multi-minute
  download, notifications that arrive, and modern Android polish (predictive back, haptics,
  system bar colours, tablet layouts).

## 2. How the phone app is built (so the rest makes sense)

The phone runs the **same React interface** as desktop inside an Android WebView. On desktop
the interface talks to an Electron "main process" over about 361 named channels. On the
phone it talks over a local WebSocket to a Kotlin dispatcher (`SessionService.kt`) that
answers about 306 of those names. The browser "remote access" client uses the same interface
and the same WebSocket shim, pointed at the desktop instead.

Three consequences drive everything below:

1. **Anything the React interface does by itself, the phone gets for free.** Chat rendering,
   the new settings design, themes, the command drawer, the find bar: all arrived on the
   phone automatically.
2. **Anything the desktop's main process does, the phone must reimplement in Kotlin.** That
   is where the gap is. Desktop's main process gained ~1,200 commits since May. Android's
   Kotlin gained 166, and about 25 of those were "reply not-implemented".
3. **The phone runs Claude Code inside a Termux-style Linux environment** it downloads on
   first launch (~130 MB). That environment is why the CLI version is pinned: from 2.1.113
   on, Claude Code ships as a native binary the phone runtime cannot start.

## 3. What a phone user loses, by area

Status words: **Works** (real Kotlin), **Refuses** (answers not-implemented, UI usually hides
it), **Junk** (no answer at all; the interface receives a nonsense object and may misbehave),
**Half** (some of the feature).

### Chat and sessions
- Create, switch, type, resize, browse history, answer permission prompts: **Works**.
- Scroll back through a long conversation (`transcript:page`): **Junk**. The shim's own
  comment calls this "the phone's only way back through a long conversation". Android has no
  handler, so the reply is `{error: "Unknown: transcript:page"}` handed straight to the chat
  reducer. Recorded as a deliberate omission on 2026-08-27, but the junk-reply consequence
  was not.
- Rename a conversation, session naming card: **Refuses**, and the UI hides it cleanly. This
  is the pattern to copy.
- Tags and notes on a conversation: **Refuses** (read returns empty; writes refuse). Pin and
  hide work.
- Resume a past conversation: **Broken** (starts a fresh session; wrong folder when the name
  has hyphens). Known since April, filed for v1.3.1.
- Chat search: the plugin is bundled, but results render as raw CLI text instead of cards.
- `/clear` and `/compact` completion: the phone never sends the `transcript:shrink` event the
  interface waits for.
- Permission-mode chip never shows "auto": most likely because the phone's CLI predates auto
  mode (2.1.83+), not a Kotlin bug.

### The built-in assistant, ChatGPT, OpenRouter, models
- All 14 `native:*`, 6 `provider:*`, 4 `chatgpt:*`, 4 `search:*`, 3 `permissions:*` and
  5 `specialists:*` channels: **Refuses**. The phone has no notion of an engine, provider or
  model binding at all. Session creation reads only folder, skip-permissions and a Claude
  model name.
- The model picker on the phone shows four Claude names and no explanation. That is an
  accident of error handling: the provider list call fails, the code catches it as an empty
  list, and the picker silently shrinks. There is no "Desktop only" reason string anywhere.
- The desktop's model picker already has the right pattern: list a model you cannot run,
  grey it, and say why ("Sign in to use", "Add an API key"). The phone never uses it.
- Local models and the llama.cpp engine: **Refuses**, with six channels marked "unsupported"
  so a plain sentence shows instead of the raw string; the other 17 would print
  "not-implemented-on-mobile" if surfaced. Known trap: the Local Models screen would crash
  the phone the day the native flag turns on, because one call returns an object where a list
  is expected.
- A default model chosen on desktop is dropped by the phone's settings reply (four-line fix).

### Files and projects
- Files a session produced: list, open, read, save, version: **Works**.
- Project view (browse the project's files, import, include/exclude, rename, delete, search
  contents, live refresh): **Refuses**. "Mobile Project View is v2" with no date.
- Project hub (conversations, repo info, CLAUDE.md editing): **Refuses**.
- Git (status, diff, stage, commit, discard): **Refuses**, "desktop-only for now".
- "Open externally" for a file the app cannot show: hidden on the phone, so an mp3 or mp4
  you were just handed dead-ends.
- The missing-file check always says nothing is missing, so a damaged record looks fine
  forever.
- Content search is blocked on "no ripgrep on Android". Ripgrep is in fact installed by the
  phone's bootstrap as a core package.

### Sync
- Android is on the **old design desktop demolished in July**: rclone, Google Drive backup,
  GitHub backup, and a full restore wizard that now exists only on the phone. Every current
  Sync Spaces channel either **Refuses** (rename, stop, leases, device list) or is **Junk**
  (status, enable, sync-now, create-project, import-project have no handler at all).
- Connect GitHub modal: **Refuses**; the phone has its own gh-auth path that works.

### Marketplace, skills, themes
- Skills (install, uninstall, search, favourites, chips, overrides, publish, share links,
  ratings, thumbs, comments): **Works**. Best-covered area.
- Integrations: list works; install, connect, configure, uninstall return a hardcoded "not
  installed". You can see them and never turn one on.
- Themes (list, read, write, marketplace browse, install, update, publish): **Works**.
  Preview generation returns nothing; two publish-state channels are **Junk**.
- Themes you built yourself do not show in the phone's Library until published.
- Mascot rig, faces, companions, sleep poses: desktop only. The phone gets the flat PNG.

### Settings
- Appearance, defaults, favourites, analytics opt-in, performance, restart: **Works**.
- The phone gets a different settings tree: no Sound, no Remote-access hosting, no Keyboard
  Shortcuts, no Buddy, and only 1 of 5 assistant-settings pages (no Providers, Local models,
  Permissions, Specialists).
- Remote-access config on the phone returns fixed fake values (enabled false, one client).
- Permission overrides the desktop reset in July are still enforced on the phone, with no
  screen to turn them off.
- Skill settings (favourites, chips, overrides) are forgotten on every launch after the first,
  and the first save wipes what was on disk.

### Social, games, voice, dev tools
- Friends, presence, leaderboards, head-to-head records, dev diagnostics: **Works**. Voice
  uses the phone's own speech recogniser and is arguably better than desktop's.
- Presence lacks desktop's sleep and idle gates and its reload re-hydration; a phone with a
  long session reads "Online" with the screen off. Destin decided 2026-09-02: Online means the
  app is in front.

### Updates
- In-app updates: stubbed by design. There is no Play listing. Betas are built by running the
  Android Release workflow by hand and uploading the APK to the GitHub release.
- **The uploaded beta APK is stamped versionCode 20 / 1.2.4**, byte-for-byte the same
  identity as the May release, because the version is hand-edited in `build.gradle.kts` and
  nobody bumps it. A phone cannot tell a beta is newer, the About screen lies, and a future
  Play upload would be rejected as a duplicate version.
- The version pill that opens the update panel is hidden at phone width, so even the
  changelog is unreachable on a phone.

## 4. How the three hosts differ

| Capability | Desktop | Android app | Browser (remote access) |
|---|---|---|---|
| Chat | full | full | full, no reconnect banner |
| Terminal | full | display-only xterm; typing goes through the input bar; Ctrl/Esc/Tab toolbar | output and typing work; laid out as a desktop even on a phone |
| Built-in assistant, ChatGPT, OpenRouter | full | none | bridged to the desktop's |
| Local models | full | none | offered but cannot run |
| Voice | downloaded model | phone speech recogniser | none (needs https) |
| Files panel | full | session files only | cannot open a file |
| Project view, git | full | none | none |
| Settings | full | reduced tree | drifts from desktop |
| Marketplace skills | full | full | skills yes, account API no |
| Integrations | full | list only | none |
| Themes | full | full minus preview | none |
| Sync | Sync Spaces | old Drive/GitHub backup + restore | Sync Spaces |
| Friends, games | full | full | none |
| Notifications | none | two channels, never permitted on 13+ | none |
| Updates | in-app | manual sideload, version never bumped | none |
| Mascot | rig + companions | flat image | flat image |
| Multi-window, buddy, tear-off | yes | no (by nature) | no |
| Pairing | shows the QR | scans it | types the password |
| Can drive the desktop's sessions | n/a | yes, via Connect to Desktop | yes |

Browser-specific findings worth knowing: the server binds every interface with no TLS;
"trust Tailscale" skips the password for any address in a range that is also ordinary
carrier NAT; when the desktop goes away the browser looks alive for 30 seconds and typed
messages vanish. The unmerged remote-access batch 1 rewrites all three. There is no PWA
manifest or service worker, so no add-to-home-screen and nothing offline.

## 5. Polish and feel: where the phone is a shrunk desktop

- **Right-click is the only way into the app-wide context menu** (copy, paste, "ask about
  this", file-pill actions). There is no long-press. A comment claims "or long-press"; no
  such handler exists.
- **Reordering sessions and quick chips is impossible** (drag handles hidden, no touch
  alternative). Only the active session pill is shown at all.
- **Hover-only affordances**: the model info tooltip, the permission chip's only hint
  ("Shift+Tab" in a tooltip), and a dead CSS rule that tries to reveal hover controls under a
  coarse pointer and never can. Components still using `.hover-reveal` instead of
  `.touch-reveal` are unreachable by finger.
- **Physical-keyboard-only actions** with no visible control: view toggle, session switcher,
  model cycle.
- **Safe areas**: `env(safe-area-inset-*)` appears in 2 of 293 components; the input bar and
  status bar do not use it. The WebView sits inside a padded container, so the page never
  sees a cutout.
- **Four different "narrow" breakpoints** in three files, no shared token.
- **Glass surfaces** are blur-throttled for the WebView with no mobile design of their own;
  framed-theme terminal insets are Electron-scoped and simply do not apply.
- **The artifact drawer and game pane are unreachable in terminal view** on the phone.
- **First-run is desktop-only**: the phone reports "complete" and drops the user into chat
  with no sign-in step, no explainer, no walkthrough. The native setup is two stock Material
  screens (tier picker with raw package names like "fd, fzf, jq, bat", then a spinner with a
  percentage) for a multi-minute ~130 MB download with no time estimate, no metered-data
  warning, no cancel, and no persistence if Android kills the app mid-way.
- **Native shell gaps a modern Android user notices**: no predictive back, system bar icon
  colour follows the OS setting while the app is always dark, no splash-screen API, no
  haptics anywhere, no app shortcuts or widget, no tablet or foldable layout, no share-sheet
  receiver, no chooser to share out, the file picker inside the WebView is dead (no
  `onShowFileChooser`), and the folder picker can only see the app's own sandbox (no Storage
  Access Framework), so Downloads, Drive and Obsidian are unreachable.
- **Failure handling**: no WebView error page, no renderer-crash recovery, no crash reporting,
  and the local bridge gives up after five reconnects with no visible state.
- **Analytics** heartbeat fires on first launch before any consent screen (opt-out default).
  The hashing is fine; the consent is missing. Play data-safety exposure.

## 6. Hidden defects and rot found by the audit

1. **Unknown channels return junk, not refusals.** Android's catch-all replies
   `{error: "Unknown: …"}` with no `ok:false` and no `unsupported:true`, so the shim resolves
   it as a normal value. Eighteen channels the interface calls hit this, including transcript
   paging, five Sync Spaces calls, two theme-publish calls and the sound picker. The browser
   got the `unsupported` fix; Android never did. One-line Kotlin change, plus a test.
2. **Notifications never permitted.** `POST_NOTIFICATIONS` is declared and never requested.
   On Android 13+ the approval-prompt notification is dropped for every install.
3. **Stale prebuilt bundle tracked in git.** `app/src/main/assets/web/index.html` and
   `remote-shim.js` date from 2026-04-29, reference hashed chunks that no longer exist, and
   carry `interactive-widget=overlays-content`, which the live source documents as the bug
   that pinned the input bar under the keyboard. A real Gradle build overwrites them, but
   any path that skips the task ships a black screen. The gitignore exception should go.
4. **Beta APK stamped 1.2.4** (see Updates above). The release spec expects a shared version
   bump that is not happening for betas.
5. **APK declares all four ABIs** via native libraries, so it installs on 32-bit and x86
   devices and then fails at bootstrap. Bootstrap only ships an aarch64 zip. One
   `abiFilters` line makes it honest.
6. **`sync:restore:*` exists only on Android** (seven handlers, two adapters) with no desktop
   counterpart; the shared restore wizard is Android-only by accident.
7. **Dead `layoutInsets` flow** still emitted on every layout report with no collector
   (already decided: delete).
8. **Bridge token cannot refresh**: a recreated service mints a new token while the page keeps
   the old one; five failed retries and a permanent dead UI with no recovery path.
9. **Bootstrap crash window**: 18 handlers dereference `bootstrap!!` before startup finishes.
10. **Event-bridge session map is ungated** and can attach a conversation to the wrong Claude
    session after a subagent or hook fires (the desktop bug fixed in PR #257).
11. **Changelog has no 1.3.0 section.** Every surface's changelog panel shows 1.2.4 as the
    newest release after ~2,850 commits.
12. **Tests**: 251 JVM tests, zero instrumented. Untested: the whole first-run state machine,
    the bridge auth handshake, the theme-asset path-traversal guard, all 1,773 lines of
    Bootstrap, every Compose screen.

## 7. What a premium mobile equivalent takes

### 7a. The native harness on the phone (ChatGPT + OpenRouter)

**Finding.** `desktop/src/main/harness/` and `providers/` import Electron in exactly three
files: secret encryption (twice) and one `userData` path. `openExternal` and `appVersion` are
already injected constructor arguments. The harness runs in-process today, so there is no
worker to reuse, but `remote-server.ts` already bridges the whole native stack over the same
`{type, id, payload}` JSON frames Android's bridge uses, and a phone on remote access drives
the desktop's harness through it today. Every transcript event the harness emits is the
Claude Code event shape the React interface already renders. The only native-binary
dependency is ripgrep, which the phone already installs.

**Recommended shape: run the same TypeScript harness as a Node child on the phone.** Kotlin
owns the shell (secure storage via `EncryptedSharedPreferences`, the OAuth loopback listener
on port 1455, the "unavailable" gates); Node owns the loop, tools, prompts and providers.

Work, in order:
1. `harness-host.ts`: a Node entry point with no Electron import that builds NativeHome,
   SecretsStore (Kotlin-backed), ProviderRegistry with `localEngine = null` (already means
   "coming later"), NativeSessionHost, and a JSON dispatcher copied from `remote-server.ts`.
   ~1,000 lines; the template exists.
2. Replace the six Electron touchpoints with injected equivalents.
3. Kotlin `HarnessBridge.kt` beside `PtyBridge.kt`: spawn, supervise, restart, socket
   framing; teach `SessionRegistry` a second session kind; add `provider` to the session-info
   reply; read `provider`/`binding`/`preset` in `session:create`. ~1,000 to 1,500 lines.
4. Route the ~28 `native:*`/`provider:*`/`chatgpt:*` channels to the child. Keep `engine:*`
   and `models:*` refusing behind a **new** `localEngine.supported=false` flag. Do not reuse
   `native.supported`: flipping it un-gates the Local Models screen, which crashes on the
   phone's reply shape.
5. ChatGPT sign-in works as-is: the redirect is `http://localhost:1455` on the device running
   the browser, and Chrome opened via an Android intent is on the same device. The URL must
   open through `PlatformBridge.openUrl`, never a shell shim (the documented Go-binary trap).
6. Fix `defaults:get` to return the desktop-chosen default model.
7. Ship the harness's pure-JS dependencies (AI SDK, zod, MCP SDK, pdfjs) as an asset or
   install them at bootstrap.

Risks: Node process lifetime under Doze (mitigated by living under the existing foreground
service), memory on mid-range phones (compaction already bounds history), MCP stdio servers
under the Termux exec rules (ship HTTP MCP first). Effort: 3 to 5 weeks to a working session,
6 to 10 to premium. Rewriting in Kotlin was costed at 6 to 12 months plus doubled
maintenance; the workspace already deleted one two-implementation design for exactly that
reason.

### 7b. The local-models seam

- Add `window.claude.localEngine.supported` (false on Android, true on desktop when the
  engine exists), separate from `native.supported`.
- Add a "Not available on this device" reason string to `availability.ts` and let the model
  picker list local models greyed with that reason, exactly as it lists "Sign in to use".
- Make the Local Models page show one explainer card on the phone instead of hiding.
- Fix the wording in `remote-unsupported.ts`: it says "via remote access" for channels that
  are also refused on the phone, and it never fires on the phone because the phone's replies
  lack `unsupported:true`.

### 7c. Honest refusals everywhere

- Catch-all reply gains `ok:false, unsupported:true`; the plain-language toast table then
  covers the phone as it covers the browser.
- Every remaining "Refuses" that the interface still shows a control for (integrations,
  tags, git footer, project hub, publish state) either hides via a capability flag or greys
  with a reason. No control should look live and fail.

### 7d. The Claude Code pin

The pin is the release blocker, not the feature gaps. Options: (a) make the runtime start the
native launcher (a runtime rework of unknown size), (b) scope the phone's Claude Code lane as
"legacy CLI" and lead with the native harness once it exists, (c) both. This is Destin's
decision and is already filed as `v1.3 decision` in `android-only.md`.

### 7e. Mobile product work no port supplies

Ordered by user impact:
1. Updates: bump versionCode/versionName on every build, an in-app "newer version" check
   against GitHub releases, and a decision on Play.
2. Notifications that arrive: request the permission, inline Allow/Deny on approval prompts,
   a session-finished notification, a real icon.
3. Onboarding: sign-in step (Claude, ChatGPT, OpenRouter), an explainer for the download with
   time estimate and metered-data warning, resumable and cancellable, in the app's theme.
4. Share into the app (text, links, images, PDFs) and share out via the chooser.
5. Real file access: Storage Access Framework for folders, `onShowFileChooser` for the
   WebView, "Open externally" via view intent.
6. Touch input: long-press context menu, touch reorder, visible controls for every
   keyboard-only action, safe-area insets on bottom chrome, one shared breakpoint.
7. Android polish: predictive back, themed system bars, splash API, haptics, shortcuts,
   tablet layout, process-death restore, WebView error and crash recovery, crash reporting
   with R8 mapping upload, analytics consent screen.
8. Sync: delete the Drive/GitHub restore backend and port Sync Spaces status, enable and
   sync-now (leases can wait).
9. Housekeeping: `abiFilters arm64-v8a`, targetSdk 36, the `specialUse` foreground-service
   property, remove the tracked stale bundle, delete `layoutInsets`, fix the bootstrap crash
   window and the ungated session map, instrumented tests for the bridge handshake and first
   run.

## 8. Decisions this plan needs from Destin

1. Claude Code on the phone: unblock 2.1.113+, or lead with the native harness and call the
   CLI lane legacy (7d).
2. Google Play, or GitHub sideload with an in-app update check.
3. Scope of Project View on mobile (session files only, or the full hub).
4. Whether the phone should keep the Drive/GitHub restore wizard desktop deleted, or lose it.
5. Order of 7a versus 7e: harness first, or the mobile essentials first.

Four or more questions go on a questions deck; these can be served as one when Destin wants
to decide.

## Appendix: the roadmap items folded into this report (2026-09-10)

On 2026-09-10 every Android-specific roadmap item was consolidated here and replaced by one
"Rebuild the Android app" item in `docs/roadmap/android-only.md`. Each is kept below with its
last tokens and any linked investigation so nothing is lost. A new Android-only finding goes
here, not in the roadmap, until the rebuild lands. Items about shared code that merely showed
on a phone stayed where they were (sync's stale tag on desktop, the browser's white first
connect and desktop-shaped terminal, the Play listing's business prerequisites in
dev-workspace).

### From android-only.md (19)

1. Android keeps enforcing the old "approve protected requests" overrides after the desktop
   switches them off; the phone has no screen to turn them off.
   `settings/permissions` `confirmed` `checked 2026-09-07`
2. A default model chosen on the desktop is dropped by the phone's settings reply (deferred
   2026-09-07; four-line fix, §3 above).
   `settings/defaults` `confirmed` `checked 2026-09-07`
3. Resuming a past Claude Code conversation starts a fresh session; hyphenated project names
   can open the wrong folder (unchanged since April).
   `resume-browser` `confirmed` `checked 2026-09-01` `v1.3.1` →
   docs/active/investigations/2026-09-01-android-resume-unreachable.md
4. Android still carries the Drive/GitHub backup-and-restore backend desktop demolished in July.
   `settings/sync` `needs-verify` `checked 2026-09-01` `v1.3.1`
5. Possible crash if a screen asks for preferences, defaults, theme or sync status before
   startup finishes (18 spots).
   `needs-verify` `checked 2026-09-01` `needs-repro` →
   docs/active/investigations/2026-09-01-android-session-service-bootstrap-npe-window.md
6. May attach a conversation to the wrong Claude Code session after a subagent or hook fires
   (desktop fixed in PR #257).
   `chat` `confirmed` `checked 2026-09-01` `needs-repro` →
   docs/active/investigations/2026-09-01-android-event-bridge-session-map-ungated.md
7. Dead "layout insets" reading of the chat chrome; decided 2026-09-02: delete.
   `chat` `confirmed` `checked 2026-09-02` →
   docs/active/investigations/2026-09-01-android-layout-insets-flow-uncollected.md
8. The 2026-07-20 soft-keyboard fix was only checked in Chrome over remote, never in the
   packaged app (Destin 2026-09-02: probably resolved, not certain).
   `input-bar` `needs-verify` `checked 2026-09-02`
9. Library does not show themes you built yourself until published.
   `library` `needs-verify` `checked 2026-09-01`
10. Integrations only list; Install, Connect, Uninstall, Configure return not-implemented
    (youcoded#78).
    `marketplace-screen` `needs-verify` `checked 2026-09-01`
11. No Project View for files: listing, rename, exclude/include, delete-project and the project
    channels all return not-implemented ("mobile Project View is v2").
    `projects` `parked` `checked 2026-09-01`
12. Skill settings (favourites, quick chips, overrides) revert every launch after the first;
    the first save wipes what was on disk.
    `confirmed` `checked 2026-09-01` `v1.3.1` →
    docs/active/investigations/2026-09-01-android-skill-config-never-loaded.md
13. What "Online" means on a phone. Destin decided 2026-09-02: Online means the app is in
    front; build that.
    `needs-verify` `checked 2026-09-02`
14. Tags and notes refused on the phone; only pin and hide work. Storage and sync exist.
    `session-drawer` `needs-verify` `checked 2026-09-01`
15. The file-record store lacks the write queue and read guard desktop got in PR #318.
    `needs-verify` `checked 2026-09-01` `performance`
16. The phone never gets the file-path repair desktop got on 2026-08-13; the missing-file check
    is a stub that reports nothing missing.
    `files-panel` `needs-verify` `checked 2026-09-01`
17. Pinned to Claude Code 2.1.112 because later releases ship as a native binary the runtime
    cannot run; decide before any listing.
    `decision` `checked 2026-09-03` `v1.3` →
    docs/active/investigations/2026-09-03-formalization-costs-and-risks.md
    <!-- claim: {"path": "youcoded/app/src/main/kotlin/com/youcoded/app/runtime/Bootstrap.kt", "contains": "PINNED_CLAUDE_CODE_VERSION = \"2.1.112\""} -->
18. Tapping a file the app cannot display dead-ends; "Open externally" is desktop-only.
    `files-panel` `confirmed` `checked 2026-09-05`
19. The permission question, file picker, folder picker and QR scanner are wired to a screen
    that may already be gone; a request arriving afterwards throws and the caller waits forever.
    `needs-verify` `checked 2026-09-05` `needs-repro`

### From claude-code-integration.md (4)

20. The permission-mode chip never shows "auto" and shows "normal" for any screen it cannot
    read, where desktop shows "unknown" (found 2026-07-17). Likely root cause: the pinned CLI
    predates auto mode.
    `status-bar` `confirmed` `checked 2026-09-01` →
    docs/active/investigations/2026-09-01-android-permission-mode-auto-unknown.md
21. Phantom prompt cards (paste-your-sign-in-code, Continue/"Ready") when a reply merely
    contains phrases like "press Enter to continue" (2026-07-16 sweep).
    `tool-cards` `confirmed` `checked 2026-09-01` →
    docs/active/investigations/2026-09-01-android-bare-phrase-prompt-cards.md
22. Long messages (over ~56 bytes) submit with a fixed 600 ms pause before Enter, where desktop
    waits for the terminal's echo.
    `confirmed` `checked 2026-09-01` →
    docs/active/investigations/2026-09-01-android-pty-echo-driven-submit.md
23. Claude Code's full-screen redraws push duplicate banner chrome into the terminal's scroll
    history; re-check first, newer CLI versions fixed some cases.
    `terminal` `parked` `checked 2026-05-18`

### From user-interface.md (2)

24. On a phone the app is a shrunk desktop; wanted a rethought default for the Android app and
    the mobile browser (quick chips, session switching, resume/history) with the full narrow
    UI still reachable. Design-first: a workbench mockup round before any build.
    `parked` `checked 2026-09-02`
25. The right-click menu may not open from a long-press; never tried on a device, and long-press
    also starts text selection. (§5 above: there is no long-press handler at all.)
    `needs-verify` `checked 2026-09-01` `needs-repro`

### From themes.md (1)

26. Everything the mascot learned this year is desktop-only: on a phone the buddy is four
    still pictures. Destin: "okay this is fine for now" (2026-09-05).
    `confirmed` `checked 2026-09-05`

### From local-models.md (1)

27. The Local Models list would crash a phone the day phones get a local engine: "what have I
    downloaded?" answers an object where a list is expected, and the first filter throws.
    Cannot be observed until the section is un-gated. (§7b above: the seam needs its own flag.)
    `settings/local-models` `needs-verify` `checked 2026-09-06`

### From remote-access.md (2)

28. A phone that pairs to a desktop mid-dictation cannot stop its own microphone; stop and
    cancel should pass through while paired (found 2026-09-05).
    `input-bar` `confirmed` `checked 2026-09-05`
29. Pairing while the message box is open leaves the mic button looking live; nothing re-asks
    whether voice is available when the connection changes.
    `input-bar` `confirmed` `checked 2026-09-05`

### From dev-workspace.md (1)

30. Android beta builds all claim to be version 1.2.4; the Android build never got the version
    stamping the desktop test build has (§6 above: confirmed inside the 1.3.0-beta.76 APK).
    `confirmed` `checked 2026-09-03`

### Claims this report anchors

The bridge's catch-all reply carries only an error string, so the shim resolves it as a value.
<!-- claim: {"path": "youcoded/app/src/main/kotlin/com/youcoded/app/bridge/MessageRouter.kt", "contains": "fun buildErrorResponse"} -->
Notification permission is declared in the manifest and never requested at runtime.
<!-- claim: {"path": "youcoded/app/src/main/AndroidManifest.xml", "contains": "POST_NOTIFICATIONS"} -->
The prebuilt web bundle's index is exempted from gitignore and tracked.
<!-- claim: {"path": "youcoded/.gitignore", "contains": "!app/src/main/assets/web/index.html"} -->

## Sources

Channel table, push-event gaps, and android-only list: sweep of `ipcMain.handle/on` across
`desktop/src/main`, `SessionService.kt`'s `when` block, `remote-server.ts` `case` labels,
`remote-shim.ts` call sites. Native harness: `desktop/src/main/{harness,providers}`,
`native-runtime.md` (first 349 of 1,129 lines), `remote-server.ts:154-203`. Renderer
branches: all 675 files under `desktop/src/renderer`. History: 793 `feat(`/`fix(` commits
since v1.2.4 grouped by scope, all 166 Android commits, every `docs/roadmap/*.md`, all
`docs/active/investigations/*android*`. Native shell: manifest, Gradle, `MainActivity.kt`,
`ui/*`, bridge, workflows; `SessionService.kt` and `Bootstrap.kt` sampled by region. Browser:
`remote-server.ts` ~450 lines read directly plus label grep; unmerged
`session/remote-mesh-roadmap` read via `git show`. Beta APK identity read with `aapt2` from
the 1.3.0-beta.76 release asset.
