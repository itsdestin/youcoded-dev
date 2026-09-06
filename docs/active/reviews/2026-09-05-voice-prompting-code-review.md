---
status: active
feature: voice-prompting
branch: feat/voice-prompting
reviewer: code-reviewer (fresh agent, brief scripts/ui-review/code-reviewer.md)
date: 2026-09-05
---

# Voice prompting — code review

Inputs: the branch diff against `origin/master` (43 files, +7,995), the contract's 23 rows,
`.claude/rules/{ipc-bridge,react-renderer,live-app-safety,feature-flow,landing-page}.md`, and
`docs/PITFALLS.md`. Nothing else.

## Verify

`bash scripts/verify.sh worktrees/voice-prompting`, from `/home/destin/youcoded-dev`:

```
verify: /home/destin/youcoded-dev/worktrees/voice-prompting (base master)
  tests: related to 38 changed file(s) + 36 source-scanning guards

PASS  types (tsc --noEmit)
PASS  types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (eslint)
PASS  invariants (ast-grep)

OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```

Android, `JAVA_HOME=…java-21-openjdk ANDROID_HOME=…/.android-sdk ./gradlew test -x bundleWebUi`:
`BUILD SUCCESSFUL` (103 tasks up-to-date — the Kotlin unit tests, `VoiceRecognizerTest` included,
were cached green from an earlier run in this worktree, not re-executed).

## Findings

- F1 — `desktop/src/renderer/components/InputBar.tsx:180` (`releaseSpaceHold`) × `desktop/src/renderer/hooks/useVoiceInput.ts:307` (`stop`) — **letting go of the space bar while `start()` is still in flight leaves the microphone open with nobody holding the key**: the 250 ms timer sets `spaceHeld.current = true` and calls `startVoice()`, but `voice.start()` then `await`s `bridge.start()` (on macOS that includes `systemPreferences.askForMediaAccess`, which blocks on a system dialog) and `openCapture()` before it sets phase to `listening`; a key-up in that window runs `releaseSpaceHold()` → `voice.stop()`, which returns immediately because `phaseRef.current !== 'listening'`, and `start()` then finishes and opens the mic anyway. In a quiet room it never closes: `VoiceService.pushAudio` only arms the 2 s silence stop after `speechHeard` is true (`voice-service.ts:299-308`). Same hole on the `blur` and `visibilitychange` paths, which all funnel through `releaseSpaceHold`. — Confirmed by reading the call chain; the three hold tests (`InputBar.test.tsx:727,740,796`) all use a `start: vi.fn(async () => {})` that resolves before the key-up, so the window never opens in the suite.

- F2 — `app/src/main/kotlin/com/youcoded/app/runtime/VoiceRecognizer.kt:168` (`stop`) — **Android has no deadline of any kind, so a recogniser that never calls back parks the composer in "Finishing…" forever.** `stop()` hands off to `SpeechRecognizer.stopListening()` and waits for `onResults`/`onError` to produce the one `final`; if neither arrives, nothing else on the phone ever emits one. The renderer's watchdog is explicitly disabled there (`useVoiceInput.ts:140`, `if (!canCapture) return`), and the mic button is `disabled={disabled || phase === 'finishing'}` (`VoiceButton.tsx:285`), so the user is left with a spinner and no way back except typing (which cancels). The desktop defends exactly this case three ways — `LOAD_DEADLINE_MS`, `passDeadlineMs()`, `STOP_DEADLINE_MS` (`voice-service.ts:118-125`), each with a test (`voice-service.test.ts:222,247,256`) — and the Android half mirrors none of them. — Confirmed by reading both halves; `VoiceRecognizerTest.kt` has no timeout case.

- F3 — `desktop/src/renderer/styles/globals.css:2586-2590` — **the comment says `.voice-mic-on`'s `steps(10)` is "Pinned by tests/animation-frame-budget.test.ts" and it is not**: `rg -c 'voice|mic' desktop/tests/animation-frame-budget.test.ts` exits 1 (no matches), and a tree-wide `rg 'voice-mic-on|voice-rec-dot|voice-pulse|voice-blink' tests/ src/` returns 11 lines, all in `globals.css` and `VoiceButton.tsx`, none in a test. Worse, both quantised animations are unreachable in the shipped app — the only `VoiceStyleContext.Provider` is `dev/workbench/compare/registry.tsx:5404`, so production is always `DEFAULT_VOICE_STYLE = {feedback:'strip', motion:'level'}` and `motion === 'breathe' | 'dot'` never renders. The path that *does* ship — the `levelRing` inline `transition: box-shadow 90ms linear` (`VoiceButton.tsx:117`) plus `.voice-bar { transition: height 90ms linear }` on four bars, both retriggered on every `level` event, several times a second for the whole time the mic is open — is un-stepped and unguarded, which is precisely the shape the 2026-07-30 idle-CPU investigation measured at ~30 % of a core at 180 Hz. — Guard absence confirmed programmatically; the frame cost of the shipping path is `PLAUSIBLE` (not measured here, and Destin's display is 180 Hz).

- F4 — `desktop/src/renderer/components/InputBar.tsx:876-878` — **the WHY comment ("what you type wins, the unsettled grey words are dropped") is the opposite of what the code does.** The textarea's value is `text + voiceTail`, so a keystroke arrives as `e.target.value === text + voiceTail + char`; `setText(val)` then promotes the grey tail to solid rather than dropping it, and the user's message can carry words the engine was still reconsidering. The test that certifies it, `InputBar.test.tsx:547` ("typing while the mic is open cancels dictation and keeps what was typed"), fires `change` with `{ value: 'typed instead' }` — a full replacement no keystroke produces — so it passes either way. Contract R16 ("ends dictation and keeps what you typed") is ambiguous enough that the behaviour may be the wanted one; the comment and the guard are wrong regardless. — Confirmed by reading the handler and the test.

- F5 — `desktop/tests/ipc-channels.test.ts:1478` — **the test named "voice-handlers.ts handles every voice channel" does not test handling**: it is `expect(handlers).toContain("'voice:status'")` etc. over the raw source, and `voice-handlers.ts:22-32` already spells all eight strings in its `CHANNELS` array plus `AUDIO_CHANNEL`/`EVENT_CHANNEL` constants. Deleting every `ipcMain.handle(...)` call in that file leaves the test green. The sibling `preload.ts declares…` test is honest about being a declaration check; this one's name promises more than it delivers. — Confirmed by reading both files: the `CHANNELS` const alone satisfies all eight assertions.

- F6 — `desktop/src/main/voice/voice-pin.ts:61,85-131,153` — **`addonRelPath` (six copies) and `entryRelPath` are set on every pin and read by nothing.** `rg 'addonRelPath|entryRelPath' desktop/src desktop/tests` returns 16 lines, all definitions or fixture copies, zero reads. The file's own header says the in-archive relative path is pinned "so a layout change upstream fails loudly at unpack time" — that job is actually done by `requiredRelPaths` (`voice-assets.ts:225-237`), and `addonPath()`/`wrapperEntryPath()` (`voice-pin.ts:227,232`) re-spell the same two literals a seventh and second time under a comment saying "nothing else may rebuild this string". `knip` does not see unused interface members, which is why verify is green. — Confirmed programmatically.

- F7 — `desktop/src/main/voice/voice-worker.ts:432-437` (`runFinalPass`) × `:400` (`start`'s create callback) — **stopping the mic while the 1.14 GB recogniser is still loading throws the loaded recogniser away.** `stop()` with `recognizer === null` goes straight to `emitFinal()`, which bumps `this.generation`; the in-flight `create()` then resolves, fails its `generation !== this.generation` check, and returns without ever assigning `this.recognizer` — so the next tap of the mic pays the full load again. Not user-visible as an error, but it is a minute of work discarded on a path a user hits by tapping and immediately changing their mind. — Confirmed by reading the two branches.

- F8 — `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:771` — **"No Activity bound means no window on screen and therefore no way to ask" is not true**: nothing ever clears `onMicPermissionRequested`. `rg 'onMicPermissionRequested'` returns exactly three lines — the declaration, the assignment inside `MainActivity`'s `LaunchedEffect`, and this read — and `MainActivity` has no `onServiceDisconnected`/unbind path that nulls it (`boundService` is likewise only ever assigned). After the Activity is destroyed the callback survives and `micPermissionLauncher.launch(...)` runs against an unregistered launcher; that throw escapes `withContext(Dispatchers.Main) { ask() }`, which sits *outside* the `try` below it, so `handleBridgeMessage` dies and the `voice:start` reply is never sent — the caller hangs rather than getting `UNANSWERED`. Narrow reachability (the WebView dies with the Activity, and a remote browser has no `voice` namespace), and the same un-cleared-callback pattern predates this branch for the file/folder/QR pickers. — `PLAUSIBLE`: the call chain is read, the exact `launch()`-after-destroy throw is not exercised.

- F9 — `desktop/src/main/voice/voice-handlers.ts:66-91` — `registerVoiceHandlers` removes the old IPC handlers but never calls `service?.shutdown()` before overwriting the module-level `service`, so a second registration orphans the first `VoiceService` and, with it, a live `utilityProcess`. The function's own comment says it exists to survive re-registration on hot reload, which is the case that leaks. One line (`service?.shutdown()`) short of matching `shutdownVoiceHandlers`. — Confirmed by reading the module.

- F10 — `docs/active/design/2026-09-05-voice-prompting/voice-prompting.contract.json` — **no row is `mechanical` and no row carries a `guard` field**, so `review-cards.py contract-check`'s "every `mechanical` guard exists on disk or on the branch" gate is vacuous for this feature: all 23 rows are `live-app` (5), `deck` (10) or `human` (8). The branch adds ~2,800 lines of tests (`voice-service`, `voice-rehear`, `voice-assets`, `voice-silence`, `voice-split`, `useVoiceInput`, `VoiceButton`, `InputBar`, `remote-shim-voice-gate`, `android-manifest-voice`, `ipc-channels`) and not one of them is attached to a promise, so nothing mechanical is re-checked when the code moves. The rows this most obviously fits are R7 (guarded today by `remote-shim-voice-gate.test.ts`), R14's 2–9 px ring, R17, and R3's 2 s silence stop. — Read off the contract JSON.

- F11 — `desktop/tests/voice-silence.test.ts:88-100` — the test for R3's threshold is written against `SILENCE_STOP_MS` itself (`h.feed(ROOM, SILENCE_STOP_MS - 200)`), so changing the constant to 10 s keeps it green; nothing anywhere asserts `SILENCE_STOP_MS === 2_000` or `SPEECH_RMS_FLOOR === 0.02`. R3's threshold line ("Silence stop after 2 s") is therefore only ever checked by a human on the deck. Same shape for `VoiceButton.tsx:117`'s `2 + round(level*7)` against R14's "Ring 2 to 9 px". — Confirmed by reading the test and `rg 'SILENCE_STOP_MS'`.

- F12 — `desktop/src/renderer/components/InputBar.tsx:893` — with voice ready and the box empty, **a leading space can never be typed**: the guard is `voiceCanStart && !text.trim() && !voiceTail`, and the branch `preventDefault()`s the space unconditionally before deciding whether the hold matured. Contract R19 only promises the space bar back "with any text in the box", and the code comment owns the trade-off, so this is within the contract — but note the box can never *reach* a whitespace-only state, so `!text.trim()` is doing no work `!text` would not. — Confirmed by reading the handler.

- F13 — `desktop/src/main/voice/voice-service.ts:197-221` — a second window that opens during a download sees the progress card only when it calls `status()`; `download()`'s progress events are pushed to the `webContentsId` of whichever window started it (`this.push(webContentsId, …)`), and the shared-promise early return means the second caller subscribes to nothing. Its bar therefore freezes at whatever `status()` returned and only moves if the user re-taps. Deliberate per the comment on `downloadState`, but the second window's card is then a still picture of a running download. — Confirmed by reading `download()` and `readinessForProgress`.

## Not covered

- The Kotlin tests were **cached, not re-run** (`103 actionable tasks: 103 up-to-date`). I did not force `--rerun-tasks`; `VoiceRecognizerTest.kt` was read, not executed.
- `voice-rehear.test.ts` (551 lines), `voice-assets.test.ts` (370) and the `parakeet-rehear-ladder.json` fixture were not read line by line — I read the code they exercise instead. The re-hear ladder's fidelity to real Parakeet output is unverified by me.
- `dev/workbench/compare/registry.tsx` (+117) and `mock-shim.ts` (+129) were read only where they bear on production behaviour (the `VoiceStyleContext` provider, `MOCK_ONLY`).
- No runtime verification: no dev instance, no download of the 487 MB model, no microphone. Everything above is read from source.
- `entitlements.mac.plist` / `entitlements.mac.inherit.plist` / `electron-builder.yml` (macOS microphone entitlement + the inherited child-process plist) were not audited against Apple's requirements — R21's macOS half rests on them and I cannot check a signed build here.
- Electron's session has **no** `setPermissionRequestHandler` anywhere in `desktop/src` (`rg` returns nothing), so `getUserMedia` in the renderer relies on Electron's default-allow. I believe that default holds, but I did not verify it against this Electron version.

## One line of disagreement with the approved design

None on the design. One process note: the `ipc-bridge.md` entry the branch's comments and tests cite ("Both gaps are written down in the workspace rule") exists only in the `voice-prompting-design` worktree — the shared `youcoded-dev` checkout's copy still has no voice line, so that claim is not yet true anywhere a future session would read it.

---

## Disposition (session that owns the branch, 2026-09-05)

Every finding is answered. "Fixed" means fixed AND guarded by a test that was broken on
purpose to prove it notices.

| # | Verdict | Where it went |
|---|---|---|
| F1 | fixed | Releasing the space bar mid-start left the mic open with nobody holding it. `useVoiceInput` now records the release for the in-flight start to unwind on. Two tests with a deferred start — the earlier hold tests used a `start` that resolved instantly, so the window never existed in the suite. |
| F2 | fixed | Android had no deadline; a silent recogniser parked the composer on "Finishing…" forever. It now carries the desktop's own 20 s stop deadline and keeps what it already heard. Three tests, forced to re-execute rather than served from Gradle's cache. |
| F3 | fixed | The false "Pinned by animation-frame-budget.test.ts" claim is now true — and the animations that actually SHIP (the level ring and four loudness bars, retriggered ten times a second) were the unstepped ones. Both stepped; five guards added. |
| F4 | fixed | The WHY comment said typing drops the grey words; the code keeps them, which is right. Its test fired a whole-value replacement no keystroke produces. Comment corrected, test rewritten as a real keystroke. |
| F5 | fixed | The channel test now matches `ipcMain.handle('voice:…'` rather than source text the file's own list already satisfied. Mutation-checked. |
| F6 | fixed | `addonRelPath`/`entryRelPath` deleted — seven copies read by nothing. |
| F7 | fixed, and worse than filed | The discarded load also left the NEXT tap hanging until the 60 s deadline, because it waited on a load nothing would finish. Engine kept unconditionally; two tests. |
| F8 | roadmap | `docs/roadmap/android-only.md` — the un-cleared permission callback is real but narrow (the WebView dies with the Activity) and the same shape predates this branch for the file, folder and QR pickers. Fixing it for voice alone would leave the pattern. |
| F9 | fixed | `service?.shutdown()` before overwriting; the hot reload the function exists to survive was leaking a live engine each time. |
| F10 | carried to the acceptance deck | No contract row is `mechanical` and none carries a `guard`, so `contract-check`'s guard gate is vacuous here. That is a gap in how the contract was written, not in the code; it belongs in front of Destin with the rest of the deck. |
| F11 | fixed | `SILENCE_STOP_MS === 2_000`, `SPEECH_RMS_FLOOR === 0.02` and the ring's 2–9 px are pinned to their values, each with a note on what moving it costs. |
| F12 | accepted as-is | The gesture was rebuilt after this review (Destin: "still seems like a bit of a gamble"), and an empty box still types no space either way. Within R19 as amended. |
| F13 | accepted as-is | A second window's progress card is a still picture of a download the first window started. Deliberate, documented at `downloadState`, and it self-corrects on any `status()`. Not worth a second push channel. |

**The process note is right and now moot.** The reviewer observed that the `ipc-bridge.md`
voice clauses exist only in this worktree. They do — this branch is not merged. They land
with it.

## What the acceptance deck must carry, honestly

1. **R8 changed after signing, twice.** Signed as "about 500 MB". Then the model's
   compressed archive turned out to need a program the app does not ship, and could not be
   tested on Windows or macOS from here, so the files are downloaded uncompressed instead:
   the card now says **about 650 MB**. Bigger download, nothing to install, no unpacking
   wait, and identical behaviour on every operating system.
2. **R19 changed after signing.** Signed as "the space bar is back to being a space with
   any text in the box". Destin asked for hold-to-talk anywhere while testing, then found
   the first attempt unreliable. It is now: nothing is typed while the bar is down; one
   space if you let go early or type another letter; dictation if you hold past 350 ms.
3. **R2 and R8 were edited after signing** and R22/R23 were added after signing — carried
   from before this review.
4. **R1 still says 464 MB** while the card says 650. R1 needs rewriting or deleting.
5. **The grey/solid promise still does not fully deliver its stated reason.** Solid text can
   still change, because the engine withdraws full stops. Recorded at the reopen deck; it
   must not quietly disappear.
6. **F10:** no row on this contract is mechanically checkable, so nothing re-checks these
   promises when the code moves. ~2,800 lines of new tests exist and not one is attached to
   a row.
