---
date: 2026-09-16
status: active
type: investigation
topic: Where the app does work nobody asked for, does the same job twice, or carries machinery with no purpose left — and how to catch each class automatically
---

# Simplification audit — less code, less work, same app

Session key `simplification-audit`. Read-only sweep of the fetched app master (`912d0972`) and
workspace master (`8352499c`), from four angles: the main (background) process, the renderer
(the window), duplicated code paths and over-built subsystems, and the tooling that could catch
all of this without a human looking. Every finding below was verified by reading the code; the
six sharpest claims were re-read by the coordinating session. **Nothing was run or profiled**;
costs are derived from code plus real counts on this machine (4,056 transcript files, 5.4 GB,
largest 112 MB).

**The brief:** simplify the code or cut CPU/GPU/disk work **without changing anything a user
sees or any feature**. Every item here meets that bar or says exactly where it does not.

## 0. What this builds on — read first

Today's earlier sweep, `docs/active/investigations/2026-09-16-smoothness-sweep.md` (branch
`session/perf-smoothness-20260916`), already covers the *feel* half of this question: Batches
A and C are built and unmerged; B, D and E are filed. **This audit does not repeat them.** Where
an item here touches one of theirs, it says so. The two sweeps together are the full picture.

Mechanical verdicts taken today:

| Check | Result | Meaning |
|---|---|---|
| Copy-paste detector (jscpd, 8+ lines) | 11 clones, 0.2% of lines | Pasted code is not the problem. Duplication is *structural*: two modules doing one job. |
| Dead-code detector (knip) | 136 unused exports, 189 unused types, 4 unlisted dependencies, **exit 0** | The count was 77 exports when the config was written. It grew 77% with CI green throughout. |
| Files over 1,500 lines | 19 (over 1,000: 38) | Nothing budgets source size; docs and rules are budgeted, code is not. |
| `setInterval` sites | 53 in 42 files | Every one has a matching clear. Only 3 files pause when the window is hidden. |
| Infinite CSS animations | 18 | Two pinning tests cover 9 named ones. A new one is invisible to both. |

## 1. The shape of it, in plain words

Four themes run through all four sweeps:

1. **Work done for nobody.** Around a dozen background timers run for the life of the app
   whether or not anyone is looking: with the window hidden, with sync off, with nobody signed
   in, with zero sessions open. Several duplicate a file watcher that already fires on the same
   change. At launch the app copies its hook scripts and rewrites your settings file four
   separate times before the window appears, every time, whether anything changed or not.
2. **The same job done twice.** The desktop window and a phone reach the same features through
   two different doors, and behind those doors **182 features are written out twice** by hand.
   Every chat event is translated into screen updates in three places. Seven modules each
   read and write the settings file their own way. Three near-identical file downloaders.
   Two settings screens that share fourteen of seventeen rows. The phone app re-implements
   about 3,150 lines of desktop logic in a second language, on a device that already carries
   the first one.
3. **Machinery with no purpose left.** A second buddy-window system that cannot be reached
   without an undocumented environment variable (~1,000 lines). Developer evaluation tooling
   (4,233 lines) that ships inside the installer. Compatibility keys maintained "for bash hooks"
   that no longer exist. An event type nothing produces. A GPU terminal created for every open
   session, including the kind that can never print into it.
4. **Files too big to reason about.** One 4,846-line function registers every feature *and*
   constructs the assistant runtime. The main screen is 4,723 lines with 57 effects and 61
   pieces of state. The seams are obvious and listed in §6.

And one honest finding about the tooling: **the workspace already owns most of the instruments
it needs.** The idle-CPU probe has a pass/fail flag nobody calls. The dead-code report warns
and never fails. The design lint's 539 warnings run only by hand. The perf rig runs only by
hand. Most of §7 is "wire what exists into CI", not "buy a new tool".

## 2. Work done for nobody

Verified by reading; none measured live. Each is invisible to users when fixed.

| # | What happens today | Why it is waste | Simpler version | Risk | Where |
|---|---|---|---|---|---|
| W1 | The Resume browser rescans every transcript on every open: stats and opens all 4,056 files, tail-reads 64 KB of each, head-reads 256 KB when untitled. Nothing is cached. Four entry points each pay the full scan; Project View calls it just to count files per folder. | The per-file answer depends only on the file's bytes; size+mtime are already read. ~260 MB read per open on this machine. | A `(size, mtime) → meta` map in front of the per-file reader, plus a short memo of the list. | None. | `session-browser.ts:401-505, 299-385`; callers `ipc-handlers.ts:1853`, `projects-index.ts:134`, `remote-server.ts:1780`. Batch C moved this off the main thread; it still reads everything. |
| W2 | Every 10 s the status push re-reads 6 files + 3 per open session and sends the whole payload to every window and every phone, even when byte-identical, the window is minimised, or no session is open. | No dirty check; no visibility gate. With 6 sessions: ~8,600 reads/hour. | Skip the send when equal to last; gate the tick on "a window is visible or a phone is connected". The files are written by one hook script, so one directory watcher could replace the poll. | Low — one "push on window show" edge. | `ipc-handlers.ts:2318-2411`. Batch C = off main thread; the poll itself is unchanged. |
| W3 | On every launch, before the window: copy all 5 hook scripts over themselves, chmod them, then read-parse-mutate-rewrite `~/.claude/settings.json`. `main.ts` also parses the same file a second time just to log a warning. | Scripts change only with the app version; the write is idempotent almost always. A write to the user's most shared config file on every start. | Stamp the app version into the hooks dir and skip when it matches; compare serialized output before writing; drop the pre-scan. | Low — stamp must include dev/packaged so a downgrade restages. | `main.ts:1688-1714`; `scripts/install-hooks.js:41-53, 236`. |
| W4 | Four modules then each read-parse-mutate-write the same settings file back to back at boot. None shares the parsed object. None is lock-guarded, though PITFALLS says every cross-process JSON write is. | 3 redundant parses and up to 3 redundant atomic writes per launch, on the critical path; the dev instance and the built app share this file. | One `mutateSettings(fn)` under the existing `mutateFileUnderLock`; the four chores become four callbacks in one lock. See D5. | Needs care — order is load-bearing (`main.ts:1744-1750`). | `install-hooks.js:236`, `hook-reconciler.ts:97`, `disable-prompt-suggestion.ts:35`, `retention-default.ts:37`; called `main.ts:1706-1780`. |
| W5 | `TRANSCRIPT_REPLAY` reads a whole transcript into memory, parses every line, and sends one IPC message per event. The paged reader was built to replace exactly this, and the code says so. | On the 112 MB transcript here: a 224 MB string, then thousands of individual sends. No renderer call site found. | Confirm no caller, delete the handler, its preload binding and `getHistory`. | Needs care — verify unused first; preload still exposes it. | `transcript-watcher.ts:615-655`; `ipc-handlers.ts:3168-3178, 3241-3249`; `preload.ts:1232`. |
| W6 | Slug-to-folder resolution is recomputed per browse; its fallback reads **every** transcript in a directory in full when none matches. | A folder's mapping changes only when it moves. The fallback is unbounded (a renamed or synced folder = read the whole directory). | Memoize slug → path per process; cap the fallback like the sibling scan already is. | None for the memo. | `session-browser.ts:189-215`; `transcript-cwd.ts:76-104`. |
| W7 | A 2 s timer polls every session's transcript file on top of a working file watcher — forever, on every platform. | The comment justifies it as a Windows safety net. Linux and macOS watchers do not drop events after arming. With 6 sessions: ~520k no-op syscalls/day. | Keep the poll on Windows and on the watcher-error path; drop it elsewhere. | Low — network filesystems under `~/.claude` are the residual case. | `transcript-watcher.ts:687-703, 662-682`. Batch C = off main thread; still polls. |
| W8 | Each session starts two 5 s timers for helper-agent files that usually never exist; each discovered helper adds a third, next to its own watcher. | A prune timer on an empty structure; a directory listing "forever" per the code's own comment. | Arm the prune timer on first event; gate the directory poll on Windows / watcher failure. The fast path (`kickScan`) already exists. | Low. | `subagent-watcher.ts:72, 220-258, 305-315`. Overlaps smoothness C10. |
| W9 | The chat-search outbox does four directory listings every 5 s next to a watcher on the same directory; three of them are garbage sweeps. | ~69k listings/day for a queue that is empty almost always. | Sweeps hourly; the 5 s poll only when the watcher failed. | Low. | `chatsearch-index/outbox-drain.ts:149-196, 296-306`. |
| W10 | Opening Preferences reads and parses the settings file six times in one tick, once per field. | Same 4 KB file, six parses, synchronous. | Memoize the parse on (mtime, size) inside the handler, or add a get-many channel. | None. | `ipc-handlers.ts:1296-1305`; `PreferencesPopup.tsx:72-79`. |
| W11 | The local-model engine polls `GET /models` over HTTP every 1.5 s for as long as it runs — up to 25 min after the last message, with no window listening. | The fast cadence exists for the load progress bar, and the code already knows when a load is in progress. 2,400 requests/hour otherwise. | 400 ms while loading (unchanged); ~10 s idle. | Low — an engine-side eviction shows up to 10 s later. | `engine/engine-supervisor.ts:1125-1140, 1075-1098`. |
| W12 | Sync health does a DNS lookup of github.com and re-reads config every 60 s, always — with sync off, with the window hidden. | Its only consumer is W2's status push. 1,440 lookups/day on an idle app. | Gate on "window visible or phone connected"; back off to 5 min. | Low — "No internet" clears up to 5 min later. | `sync-service.ts:99, 218-224, 1010-1092`; started `main.ts:2390`. |
| W13 | The presence idle poller asks the OS for idle time every 15 s whether or not anyone is signed in. | Signed out, `setIdle` is a no-op. | Start on socket connect, stop on disconnect — the lifecycle the suspend/resume listeners already follow. | None. | `social-handlers.ts:49, 132-144`; `main.ts:1925`. |
| W14 | The remote server's 20 s ping timer wakes with zero clients; `broadcast` two hundred lines away already short-circuits for this case. | 4,320 empty wakes/day. One-line change with a precedent. | Arm in `addClient`, disarm in `drop`. | None. | `remote-server.ts:140, 1351-1371, 679-688`. |
| W15 | **Every open session gets a full terminal plus a WebGL context**, including native (non-Claude-Code) sessions that have no shell and can never print into it. | Six native sessions = six GPU contexts and six glyph atlases for panes that are structurally blank. Chromium caps live contexts at ~16 and evicts the oldest — which is why the retry ladder exists. | Mount the terminal for native sessions on first switch to terminal view. Claude/shell sessions unchanged (they need the buffer from the start). | Low — provider-gated only; the native pane is empty either way. | `App.tsx:3665-3670`; `TerminalView.tsx:125, 203-241`; `session-manager.ts:176-188`. |
| W16 | Two marketplace data layers fire **seven** IPC calls and one HTTP request to the marketplace stats endpoint **at every launch**, on the chat screen. The file's own header still says it is "only mounted when the marketplace modal is open". | Nothing on the first screen reads any of it. | Keep the providers; fetch on first consumer demand. The stats client already has a TTL cache. | Low — the marketplace's own loading state shows on first open instead of arriving pre-warmed. | `App.tsx:4700-4710`; `marketplace-context.tsx:189-205, 241`; `marketplace-stats-context.tsx:102, 128-130`. |
| W17 | The installed-skills list and favourites are fetched twice at boot by two contexts, and one context holds a handle to the other's refresher to re-sync its copy after every change. | Two copies of one list kept in step by hand. | The marketplace context already consumes the skill context; read from it. | Low. | `skill-context.tsx:69-70`; `marketplace-context.tsx:162, 200-201`. |
| W18 | The gear icon's "no phone connected" dot polls `getClientCount` over IPC every 10 s forever. The effect three lines below documents deleting its 15 s twin for exactly this reason. | 8,640 round-trips/day per window for a value that changes a few times a session. | Add `clientCount` to the existing remote status push. | Low. | `App.tsx:2387-2415`; `remote-server.ts:228-232, 519-526`. |
| W19 | Every running tool card, helper status line, stall banner, compacting card and model-loading bar owns its own 1 s timer and re-renders on its own phase. The braille spinner already solved this with one shared tick. | Five parallel tools + two helpers = seven unsynchronised renders per second. | A `useSecondsTick()` on the spinner's pattern. Seconds also tick together (a small improvement, not a change). | None. | `ToolBody.tsx:316-322`; `RunStatusLine.tsx:17`; `AttentionBanner.tsx:96`; `CompactingCard.tsx:13`; `ModelLoadingBar.tsx:83`; pattern in `BrailleSpinner.tsx:17-67`. |
| W20 | The marketplace install corner re-implements the braille spinner with its own 80 ms timer and its own frame list. | A second copy of an existing component, one timer per in-flight install. | Render `<BrailleSpinner>`. ~8 lines deleted. | None. | `InstallFavoriteCorner.tsx:30-35`. |
| W21 | The status bar and header are handed a fresh object and four inline arrow functions on every render of the main screen, so neither can be memoised even if someone tried. | Any of 61 state changes re-renders 1,748 + 689 + 2,760 lines of component. Batch A stops the per-token trigger; the 10 s status push and every toast still do it. | `useMemo` the projection, `useCallback` the four handlers, then `React.memo` both. | Low — one handler reads a ref and must keep doing so. | `App.tsx:3551, 3778-3799`; `StatusBar.tsx:961`; `HeaderBar.tsx:368`. |
| W22 | Find-in-chat re-walks every text node in the conversation on every keystroke *and* on every "next match". | Moving the highlight by one match rebuilds every range. A fully read conversation is ~1.4M DOM nodes. | Two effects: compute ranges on query; move the current highlight on index. | None. | `ContentFindBar.tsx:27-47, 93-115`. |
| W23 | Every mascot registers a global `pointermove` listener for life; the "only the curious face needs this" check is inside the callback. | Two handlers fire on every mouse move to immediately return. | Subscribe only while the face is `curious`. | Low. | `MascotRig.tsx:252-269`. |
| W24 | The attention classifier fetches the whole visible terminal screen over IPC once a second per Claude Code session to read its last 40 lines. The registry already accepts a row count. | A bigger payload and a whole-string split, per second. | Pass `40`. Two lines. | None. | `useAttentionClassifier.ts:12, 158-173`; `terminal-registry.ts:90-113`. |
| W25 | Markdown's syntax highlighter and **both** highlight themes (only one ever used) are static imports in the entry bundle; heavy viewers one directory over are already lazy. | Longer parse before first paint on every launch. Not measured. | Lazy-load the inactive theme; load the highlighter on first fenced block. | Needs care for the highlighter half (flash of unhighlighted code); none for the theme half. | `MarkdownContent.tsx:2-4`; `theme-context.tsx:3-5, 167`; contrast `RendererRegistry.ts:18-24`. |
| W26 | The particle canvas repaints the full window at 30 fps whenever a particle theme is on. It pauses on tab-hidden but not on "covered by another app" — the DOM cannot see occlusion; Electron can. | Full-viewport clear+redraw 30×/s plus a forced re-blur of the chrome strip, behind a full-screen browser. | Push an occlusion flag from main alongside the existing `data-doc-hidden`. **Flagged, not solved** — the current gate is deliberately not `focus` (secondary monitors). | Needs care — pausing a visible window is user-visible. | `ThemeEffects.tsx:186-252`; `index.tsx:65-73`. Overlaps smoothness D2. |

## 3. The same job done twice

| # | What exists today | The duplication | Unified version | Risk | Where |
|---|---|---|---|---|---|
| D1 | The desktop window talks over Electron IPC; a phone talks over WebSocket. **182 features have separate hand-written bodies in both**, 35 phone-only, 74 desktop-only. The rule file states the invariant outright: "a channel has FIVE surfaces". | 2,095-line switch vs 4,846-line function. Some bodies are retyped verbatim (`skills:install`); some have already diverged (`transcript:page` hand-rolls a directory walk the desktop path does through the page-source registry). | A channel table `{name, handler(payload, ctx)}` registered once; both transports iterate it. Blocker is mechanical: preload passes positional args, the shim passes one object. Normalise on the object first. | Needs care — behaviour is *already* divergent, so unifying changes what the phone does (for the better, but visibly). One channel group at a time; the two parity tests are the net. | `ipc-handlers.ts:346-5192`; `remote-server.ts:1670-3765`; `.claude/rules/ipc-bridge.md`. |
| D2 | The IPC registration function **also constructs the assistant runtime** (native host, specialists, providers, engine, model manager, permission store) inside itself, then hands the services to the phone server after the fact. | This is the *cause* of D1: handler bodies close over locals only that function can see, so the phone server gets the services but must rewrite the handlers. | Hoist runtime construction into a `createRuntime()` that `main.ts` calls; each handler group becomes a file exporting `register(ctx)`. | None if a pure move; two ordering assumptions to keep. | `ipc-handlers.ts:2669, 3074, 2668`. |
| D3 | The same transcript event is translated into the same screen action in three places: the live path, the buddy window, and history pages. Two of them carry "MUST mirror App.tsx" comments. | ~700 lines. A parity test exists **because the divergence already shipped once** (PR #287) and carries a live ledger of three event types the buddy still does not handle. | One pure `eventToAction(event, {live})` in `state/`. The stated obstacle (frame batching) is about *dispatch*, not translation; the page mapper is already pure. | Low. Closing the ledger's three gaps is user-visible (buddy clears on `/clear`) — gate that separately. | `App.tsx:1363-1664`; `BubbleFeed.tsx:101-312`; `transcript-page-actions.ts:26-31`; `tests/transcript-event-surface-parity.test.ts`. |
| D4 | The native session host is one 4,756-line class; ~1,600 lines of it orchestrate helper specialists, while `harness/specialists/` already holds 1,679 lines for the same concern. Shells, permissions and MCP are further blocks. | One object owning five concerns; the specialist half is split across two homes. | Move the specialist block to `harness/specialists/orchestrator.ts` and shells to `harness/shells/`; the host keeps registry + lifecycle (~2,000 lines). | Needs care — `LiveEntry` is shared mutable state and reserve/bind/release encode a concurrency budget; keep them on one object. | `native-session-host.ts:359, 504-2096, 1593-1676, 2257-2460, 2701-2775`. |
| D5 | **Seven** modules read/write `~/.claude/settings.json`, each with its own reader, writer and — in three cases — its own contradictory rule for an unparseable file (one writes fresh, one refuses "that convention is wrong", one returns null). | Four of them run back to back at every launch (W4). None is lock-guarded. | One `claude-settings.ts`: `readSettings`, `mutateSettings(fn)` under the lock helper, `getField/setField` over `safe-json-path.ts`, one documented failure rule (the refusing one). | Low; choose the failure rule deliberately. | `install-hooks.js:246`; `hook-reconciler.ts:31,105`; `disable-prompt-suggestion.ts:16-49`; `retention-default.ts:29-57`; `claude-code-registry.ts:117,275`; `ipc-handlers.ts:1295-1331`; `remote-server.ts:2981-3040`; lock helper `artifacts/cas-write.ts:165`. |
| D6 | `settings:set` is written two ways, and **only the phone path has the prototype-pollution guard**. The safe helper's own header says the desktop path was deferred "to a coordinated change" that never came. Two further divergences (inherited-property reads; array clobbering). | ~25 lines of hand-rolled dot-path walk beside a helper built to replace it. | Delete the walk; call `getJsonPath`/`setJsonPath`. **The cheapest item in this audit.** | None for any real field name. | `ipc-handlers.ts:1308-1331`; `safe-json-path.ts:9-13, 41-47`; `remote-server.ts:3019-3031`. |
| D7 | Three near-identical resumable downloaders (voice assets, engine, models), the same ~34 lines and comments twice, `PROGRESS_INTERVAL_MS = 250` declared three times — **and the model downloader is missing the stream-error guard the other two spend five comment lines explaining** ("an unhandled stream error crashes the main process; disk-full mid-download is a real path"). Model files are the largest downloads in the app. | ~120 lines; one open crash path. Plus four separate streaming-digest helpers. | One `download-stream.ts` (`fetchToFile`, `fileDigest`); callers keep their own progress adapters. | Low. | `voice-assets.ts:343-374`; `engine-acquisition.ts:533-566`; `model-downloader.ts:255-274`; digests at `voice-assets.ts:384`, `update-manifest-verify.ts:82`, `model-downloader.ts:304`, `manifest-backfill.ts:127`. |
| D8 | The settings panel is two parallel screens (Android, Desktop) sharing 14 of 17 rows, each declaring its own copies of eight pieces of popup state, with the Development row and its SVG verbatim in both. | ~200 lines. | One `<SettingsBody>` with two small platform-only inserts. | Low, but visual: row order differs slightly, so a before/after screenshot pass. | `SettingsPanel.tsx:353, 2569-2765, 2766-3184, 2712-2733 vs 3110-3131`. |
| D9 | The phone app re-implements ~3,150 lines of desktop TypeScript in Kotlin (transcript watcher, skill provider, plugin installer, config store, session browser, registry, artifact store) — and already installs a full Node runtime to run Claude Code. | Drift is visible now: the Kotlin watcher leaves the `thinking` block "currently unused" where the desktop emits the heartbeat that stops a long reasoning pause reading as "stuck". | Bundle the pure parsers as a small Node service the app spawns on the prefix it has; Kotlin stays UI/lifecycle. Scope to the parsers first (watcher, browser) — they are the ones that drift. | Needs care, large: Node exists only post-bootstrap. Belongs with the Android rebuild decision (`2026-09-10-android-parity-audit.md`). | `app/.../parser/TranscriptWatcher.kt:18, 415-417` vs `transcript-watcher.ts:250-258`; `Bootstrap.kt:38-40, 726-729`. |
| D10 | Four hand-maintained copies of one ~430-method bridge: preload (1,869 lines), remote shim (3,099), workbench mock (3,132), the global type declaration (513), plus the 217-arm phone switch. 402 of the shim's 434 names also appear in preload; 212 in the mock. | ~8,700 lines describing one surface whose single fact per entry is "name, args, result". Adding a method is four edits plus a curated "unsupported on phone" list. | One declarative table generating preload, shim and the type; the mock derives its shape so a missing mock is a compile error. **Measured, not recommended now** — it is the security boundary and must stay statically enumerated (no dynamic Proxy). | Needs care. | `preload.ts`; `remote-shim.ts`; `dev/workbench/mock-shim.ts`; `hooks/useIpc.ts:18-531`. |
| D11 | Two discriminators carry the same information on injected turns (`injected` string and `injectedMeta.kind`); the reducer checks both, and the type comment admits `kind: undefined` exists only so TypeScript can narrow. | 1:1 mapping maintained by hand. | Make `injected` the discriminant (it is the persisted one); keep `kind` optional-and-ignored for one release. | Low — persisted field. | `shared/types.ts:385-405, 951-995`; `chat-reducer.ts:1401`. |
| D12 | The engine manager and engine supervisor both speak HTTP to the engine directly; the manager's three calls bypass the supervisor's in-flight accounting and its "is this really our engine" guard. | Narrow but real. | Route the three through `supervisor.trackedFetch`, tolerant of a not-running supervisor. | Low. | `engine-manager.ts:703, 1189, 1594, 1783, 1954`; `engine-supervisor.ts:339-345, 609-613, 916`. |
| D13 | Hook scripts are byte-duplicated between the desktop and Android trees with no copy step; only one of four has a parity test. | Three files drift silently. | Extend the byte-equality test to all four, or a Gradle copy task. One line per file; can land today. | None. | `desktop/hook-scripts/` vs `app/src/main/assets/`; `tests/statusline-rate-limits.test.ts:73-76`. |

## 4. Machinery with no purpose left

| # | What exists | Why it is dead weight | Action | Risk | Where |
|---|---|---|---|---|---|
| M1 | A second buddy-window strategy (`overlay`): a 409-line manager, a 363-line renderer app, a 205-line state file whose header says its type is "duplicated (not imported)", five IPC channels, four `instanceof` branches in `main.ts`. **Every branch of the chooser returns `windows`** unless an undocumented env var is set. | ~1,000 lines unreachable by any user. | **Product decision, not a refactor:** if Wayland overlay is not coming back, delete it all and the interface with one implementation goes with it. If it is, keep it and say so in the chooser. | None for users. | `buddy-manager.ts:39-48`; `buddy-overlay-manager.ts`; `buddy/BuddyOverlayApp.tsx`; `buddy/overlay-state.ts`; `shared/types.ts:1983-1997`; `main.ts:2038, 2185-2200`. |
| M2 | 4,233 lines of developer evaluation tooling (14 files) live under `src/main/`, so `tsc` emits them and the installer packages `dist/**/*`. No IPC channel, npm script or UI reaches them; the only outside reference is a comment. | Ships to every user; pulls its OpenRouter factory and fixtures along. | Move to `desktop/test-engine/lib/` with its own tsconfig, or exclude `dist/main/harness/eval` in `electron-builder.yml`. | None. | `src/main/harness/eval/`; `electron-builder.yml:128-134`; callers `test-engine/*.mjs`. |
| M3 | Legacy flat sync keys are re-derived on every config write and mirrored on Android, justified in a comment as "so bash hooks (sync.sh, session-start.sh) continue to work". **Neither script exists in the repo**; `sync-service.ts:4` says it *ported* them to Node. The real remaining consumer is Android. | A stale reason keeping a bridge alive in two codebases. | Fix the comment now (names Android). Retire the keys after one Android release reads `storage_backends` directly (it already parses it). | Comment: none. Keys: cross-repo, needs an Android release first. | `sync-state.ts:253-334, 350, 586-634`; `SessionService.kt:1984-2051`; `SyncService.kt:197…1524`. |
| M4 | `TranscriptEventType` has a `'thinking'` member nothing produces or consumes on any surface (desktop, phone, shim). All 47 chat actions were checked the same way — every one of those has a producer. | One dead union member; the parity test's hand list already omits it. | Delete. | None. | `shared/types.ts:136`. |
| M5 | `TranscriptEvent.data` is one 270-line bag of ~40 optional fields serving 16 event types; which field belongs to which type is in prose. A comment explains one field was declared because producer and consumer were otherwise linked "by nothing but a matching string literal through an `any`". | The compiler cannot enforce what the comments request. | A discriminated union — **as the payoff of D3**, not standalone, or the change multiplies by three. | Needs care — crosses IPC, persisted, rebuilt in Kotlin. | `shared/types.ts:243-512, 434-442`. |
| M6 | `YOUCODED_NATIVE` is a kill switch checked in three handlers out of many sibling ones; enabled by default since July. | Half-enforced flag. | Enforce at one chokepoint or retire. | Low. | `preload.ts:1472-1475`; `ipc-handlers.ts:3335-3344`; `remote-server.ts:1811-1822`. |
| M7 | The `SkillProvider` interface has exactly one implementation, nothing is typed against it polymorphically, and its name collides with an unrelated React component. | 20 lines and a name collision. | Delete; export the class's type. | None. | `shared/types.ts:1189-1209`; `skill-provider.ts:101`; `skill-context.tsx:43`. |
| M8 | Two six-line "latest-wins buffer" helpers in the remote server are the same code. | One generic helper. | — | None. | `remote-server.ts:1049-1065, 1084-1085`. |
| M9 | 136 unused exports, 189 unused types, 4 unlisted dependencies (`@ai-sdk/provider` imported in two files with no package entry — exactly the hoisting hazard the lint config's header names). | Bundle and cognitive weight; the unlisted deps are a real packaging risk. | Promote `unlisted` to error now (4 one-line fixes). Ratchet the rest (§7). | None if each deletion is verified, not batch-applied. | `knip.jsonc:84-93`; scratch report `knip.txt`. |

## 5. Likely bugs found on the way (not asked for; reported, not fixed)

These are the kind of thing duplication produces. Each is read from code; none was seen live.

- **B1 — Phone Resume browser probably lists sessions that are already open.** The phone path
  passes *desktop* session ids as the exclusion set; the list compares them against *Claude
  transcript* ids; the desktop path maps one to the other first. → `remote-server.ts:1773-1783`
  vs `ipc-handlers.ts:1840-1856`, compare at `session-browser.ts:454`, id minted at
  `session-manager.ts:212`. Fixed for free by D1; worth a one-line fix now.
- **B2 — The model downloader can crash the main process on disk-full mid-download.** The two
  sibling downloaders guard it and document why; this one does not (D7).
- **B3 — Desktop `settings:set` lacks the prototype-pollution guard the phone path has** (D6).
- **B4 — After `/compact` or `/clear`, every off-screen bubble above the line gets its
  `in-view` class back and keeps it.** React and the intersection observer both write the same
  class; the compaction flips a className so React rewrites it; the observer only fires on
  intersection *changes*, so bubbles that never move are never corrected. On a wallpaper theme
  that is ~300 permanently blurred off-screen layers per compaction. → `ChatView.tsx:531-542,
  1261-1263`; consumers `theme-engine.ts:728-749`, `globals.css:1905, 1927`. Fix: the observer
  is the only writer. Risk none.
- **B5 — The session-context equality uses plain `JSON.stringify` on both sides** in the same
  file that defines `stableStringify` to prevent key-order false "changed" results
  (`chat-reducer.ts:84-95, 1115`). Low frequency; correctness more than cost.

## 6. Files too big to reason about — the natural seam, one line each

| File | Lines | Seam |
|---|---|---|
| `main/ipc-handlers.ts` | 5,192 | One 4,846-line function, 36 banner-separated groups, constructs the runtime at `:2669`. Hoist the runtime (D2); one module per group registered from a table (D1). |
| `main/harness/native-session-host.ts` | 4,756 | Specialists `:504-2096`, shells `:1593-1676`, permissions `:2257-2460`, MCP `:2701-2775` — the first two already have sibling directories (D4). |
| `renderer/App.tsx` | 4,723 | 57 effects, 89 state/ref hooks. The transcript switch `:1363-1664` lifts to the shared mapper (D3); each subscription effect (status, sessions, permissions, windows, sync) becomes a `use*Subscription` hook. Roadmap item exists (`user-interface.md`, "one ~4,650-line component"). |
| `main/remote-server.ts` | 4,005 | The 2,095-line switch (D1) vs a genuinely separate transport half: static serving `:1086-1209`, auth `:1210-1473`, rehydrate `:1427-1668`, buffers `:1006-1085`. |
| `main/harness/harness-session.ts` | 3,764 | Turn loop `:2263-3719`, context budgeting `:1534-2154`, tool wiring `:1289-1533`, error vocabulary `:360-633` (already pure; lifts with no dependencies). **Turn loop not read** — see §8. |
| `renderer/components/SettingsPanel.tsx` | 3,184 | Two screens (D8) plus ~10 leaf components that belong in `components/settings/`. |
| `renderer/state/chat-reducer.ts` | 2,951 | 47 cases + 26 helpers; the specialist family `:427-775` is a self-contained ~400-line slice; hydration `:801-860` another. |
| `renderer/components/SessionStrip.tsx` | 2,760 | ~20 pure presentational leaves `:169-340` plus layout math that wants to be a tested pure module like `shared/buddy-geometry.ts` already is. |
| `main/main.ts` | 2,634 | Window factory `:715, 994`, launch chores `:1660-1800` (pairs with D5/W3/W4), detach IPC `:1277`, attention `:587-669`, shutdown `:2551`. |

## 7. Catching this automatically

### What exists, and where it runs

| Tool | What it checks | Runs in |
|---|---|---|
| tsgo ×2 | types in `src/` and `tests/` | verify.sh, PR CI, master, nightly |
| vitest (829 files, 73 of them source-scanning guards) | invariants; guards read `src/` text | verify.sh (related + all guards), CI full |
| knip | dead code — **errors** only on files/unresolved/duplicates/deps; **warns** on exports/types/unlisted | everywhere, **exit 0 today** |
| oxlint (23 bug-only rules) | hooks rules, dead code, silent-wrong-answer traps; no React perf rules | everywhere |
| oxlint design (5 rules, all warn) | restyles, raw colours, arbitrary values | **manual only, zero callers** |
| ast-grep (8 rules, two-direction scan + "did every rule fire") | executable invariants | verify.sh, workspace CI |
| audit-anchors | doc anchors, MAP paths, **word budgets on docs and rules** (none on source) | workspace CI |
| perf-lab (9 phases) | startup, history, workload, artifacts, projects, terminal, scrollback, idle | **manual only**; CI runs only its own 21 unit tests |
| `scripts/measure-idle-cpu.mjs` | idle CPU % + running animations; **has `--budget N` → non-zero exit** | **manual only, zero callers** |
| perf marks (4 `performance.mark`s) | placement is tested; **values are never read** | — |

Two things that are *not* gaps: every `setInterval` has a `clearInterval` in the same file (a
cleanup rule would find nothing), and the ast-grep harness's two-direction check is the pattern
the new guards should copy.

### Gaps, cheapest catch first

| # | Gap (evidence) | Cheapest autonomous catch | False positives | Effort |
|---|---|---|---|---|
| G1 | Dead-code count grew 77 → 136 with CI green; 4 unlisted deps are real. | **Count ratchet:** commit `knip-baseline.json`; CI parses `knip --reporter json` and fails on growth. Promote `unlisted` to error now. | Low; loosen `types` for the two deliberate shared-type files. | 2.5 h |
| G2 | 19 files > 1,500 lines; docs are budgeted, source is not. | Ratchet guard: `line-budgets.json` freezes each offender at today's size; unlisted files ≤ 1,500. The first refactor that shrinks `App.tsx` lowers its budget. | Near zero; permanent exemptions for the two dev-only registries. | 1.5 h |
| G3 | 39 of 42 timer files never check `document.hidden`. | Source-scanning vitest guard in house style: every renderer file with `setInterval(` is allowlisted-with-reason or references a visibility hook. Pair with one `useVisibleInterval`. Day-one allowlist (~30) *is* the inventory nobody has. | Many legit exemptions on day one. | 2 h guard; 4–8 h to convert callers |
| G4 | 18 infinite animations; both pinning tests are allowlists of *known* ones. `globals.css:831, 887` already leak a smooth `ease-in-out infinite`. | **Invert the allowlist:** sweep every `.css` + inline `animation:`; fail any `infinite` not `steps()` unless in `SMOOTH_OK` with a reason. | Mascot/buddy set (gated in JS) goes in `SMOOTH_OK`. | 2–3 h |
| G5 | No React re-render guard on master; the technique is on an unmerged branch (40 deltas → 0 renders, and a tool event still renders). | Cherry-pick that branch's three test files independently of its perf changes. Enable `react/jsx-no-constructed-context-values` as warn-with-ratchet (15 context files max). | Render-count tests are StrictMode-brittle; the branch version handles it — don't rewrite. | 1 h + 2 h |
| G6 | `measure-idle-cpu.mjs` has a pass/fail flag and no caller. | Nightly job on a same-machine runner (llvmpipe numbers are meaningless vs a 180 Hz panel): launch dev, `--seconds 30 --budget N` at 3× baseline. The script already refuses non-dev checkouts, so live-app safety holds. | High unless same-machine baseline. | 3–5 h |
| G7 | No bundle budget: no `manualChunks`, no size limit, no visualiser; 4 `React.lazy` sites in 962 files; pdf/xlsx/docx/codemirror/chess in `dependencies`. | Post-`build:web` guard on `dist/renderer/assets/` sizes vs a committed budget with ~10% headroom; visualiser behind an env flag. Master CI already builds, so the artifact is free. | Feature growth trips it unless headroom + one-line bump. | 2–3 h |
| G8 | Startup marks exist and are placement-tested; values never recorded; 100 hand-run perf reports. | Share G6's runner: `--only startup` nightly, append one JSON line to `perf-reports/nightly.jsonl`. Sanity floor (`>0`, `<60 s`) — the rig has twice reported clean while measuring nothing. | The rig's own zero-measurement failure mode. | 3 h (shares G6 plumbing) |
| G9 | Design lint: 539 warnings, runs nowhere. | `--max-warnings <today>` in CI. Stops 539 becoming 600. | `no-unknown-classes` on Tailwind v4 dynamic classes. | 0.5 h |
| G10 | No IPC payload-size visibility (291 handlers, 356 invokes; only *name* parity is tested). | Dev-only `YOUCODED_IPC_TRACE=1` wrapper logging `JSON.stringify(payload).length` above a threshold; nightly top-20 table via the existing `probe-ipc.mjs`. Observe first; never gate. | n/a; measuring is itself costly — env-gated only. | 3 h |
| G11 | Duplicate-code detector — **checked, not worth adding**: 0.2–0.6% on `src`, 1.1% on `tests`. | If anything: `tests/` only, nightly, report-only. | High on tests (arrange blocks). | 1 h, lowest priority |
| G12 | No coverage measurement at all. | v8 `json-summary`, nightly only, **downward** ratchet on `harness/**` and `renderer/state/**` where dead branches cost something. Never on PRs (doubles runtime). | Coverage % as a gate is a known bad idea; ratchet only. | 2 h |

## 8. Suggested order (for Destin to decide; nothing here is started)

1. **One-day cleanup batch, zero user-visible change:** D6, B1, D13, M4, M7, M8, W10, W13,
   W14, W20, W24, knip `unlisted` → error, M3's comment fix. All "none" risk, all small.
2. **Background-work batch:** W2, W7, W8, W9, W11, W12, W18, W19, W23 — the always-on timers.
   Each is one function; together they are most of what an idle app does. Guard with G3.
3. **Launch batch:** W3, W4, D5 (one settings module), W16, W17, W15, W25 — what happens
   before and just after the window appears. Guard with G7/G8.
4. **Structure batch A:** D2 then D1 one channel group at a time; D3 then M5. This is the big
   one and the one that removes the most code (~5–6k lines net) — and it fixes B1 by
   construction.
5. **Structure batch B:** D4, D7 (fixes B2), D8 (needs a screenshot pass), D11, D12, W5, W6.
6. **Decisions owed to Destin:** M1 (delete the overlay strategy?), M2 (stop shipping eval
   tooling — safe, but it changes the installer contents), D9 (belongs with the Android
   rebuild), D10 (measured only), W26 (occlusion gate is user-visible if wrong).
7. **Tooling:** G1, G2, G9 first (half a day, all ratchets); G4, G5 next; G6/G8 need a
   same-machine runner and are a separate setup.

## 9. Scope, honestly

**Covered:** all of `desktop/src/main` for timers, watchers, sync reads, boot sequence and
structure; all of `desktop/src/renderer` except the dev workbench and tests, with full reads
of the shell, chat view, reducer, contexts, theme engine, terminal and mascot; `desktop/src/
shared`; Android structurally plus targeted reads of the transcript watcher, bootstrap,
session service and sync branches; every CI workflow, lint and knip config, verify.sh, the
ast-grep rules, the perf-lab README and the idle-CPU script. Two scripts were run to compute
the IPC channel intersection and to check every chat action for a producer.

**Not covered — unaudited, not clean:** the native turn loop (`harness-session.ts:2263-3719`,
~1,450 lines: structure outlined, bodies not read, so overlap with the specialist run path is
unquantified); `SessionService.kt` beyond channel counts; the 47 reducer case bodies; artifacts
(`main/artifacts/`), marketplace/theme providers, voice, games, `conversations/` (4,673 lines;
`slug-repair.ts` at 859 looks like a candidate), `git/`, `project/`, `first-run.ts`,
`prerequisite-installer.ts`; `SettingsPanel`, `SyncPanel`, `LocalModelsSection`,
`SessionDrawer` internals; the marketplace Worker. Nothing was executed against the app.

**Re-verified by the coordinating session:** B1 (id spaces), M2 (only a comment references
the eval dir; installer packages `dist/**/*`), M3 (no `sync.sh`/`session-start.sh` in
`hook-scripts/`), W15 (terminal mounted per session; native creates no PTY), W16 (`fetchAll`
on mount at the root), M1 (chooser returns `windows` on every path).

## History
Filed 2026-09-16 from four read-only sweeps plus jscpd and knip runs. Builds on the same day's
smoothness sweep; overlaps marked inline.
