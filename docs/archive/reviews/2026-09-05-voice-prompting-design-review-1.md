# Voice prompting — design review 1
reviewer: fresh agent, 2026-09-05
design: docs/active/specs/2026-09-05-voice-prompting-technical-design.md

Verified before writing (so the design owner does not have to): `sherpa-onnx-node@1.13.7` is
an N-API addon (141 `napi_*` imports, no `v8::` symbols in `sherpa-onnx.node`) and it loads
in this checkout's Electron with no rebuild — `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron -e "require('sherpa-onnx-node')"`
printed `electron node OK 41.10.7 24.18.0 10`. The Linux `.node` carries `RUNPATH $ORIGIN`
and the macOS one `@rpath`+`@loader_path`, so the `LD_LIBRARY_PATH`/`DYLD_LIBRARY_PATH`
advice in the package's README is not needed when the platform folder ships intact. The
platform packages declare `os`/`cpu`, so `npm ci` installs only the matching one. The model
asset exists at the pinned name (`gh api …/releases/tags/asr-models`: 487,170,055 bytes =
464.6 MiB). Those claims hold. The findings are what does not.

## Findings

### R1-1 Android gets no mic: `remote-shim.ts` IS Android's `window.claude`, and the design removes `voice` from it
severity: blocker
claim: "`remote-shim.ts` exposes no `voice` namespace (Q-7), so the mic never renders there" — and, separately, Android gains `voice:*` handlers in `SessionService.kt`.
evidence: `useVoiceInput.ts` renders no mic when `window.claude.voice` is absent (`supported: !!bridge`). On Android the renderer's `window.claude` is built by `remote-shim.ts`, not by a preload: `remote-shim.ts:67` "Android WebView loads from file:// — connect to local bridge server", `:535 connect('android-local', …)`. The shim's Android-only namespace is gated per call, not per surface: `remote-shim.ts:1436-1445` `android: { getTier: () => targetUrl ? Promise.resolve('CORE') : invoke('android:get-tier'), … }`. There is no second shim for Android. So a shim with no `voice` key means `supported === false` on the phone, and the Kotlin handlers are never reached.
consequence: contract R6 ("On Android the mic uses the phone's own recognizer") fails on every phone, while R7 passes vacuously. The Android half of the build ships dead.
fix: the shim exposes `voice` when the connection is `android-local` (`location.protocol === 'file:'` and no `targetUrl`) and `undefined` otherwise — the same `targetUrl` gate `android.*` already uses, hoisted to the namespace. Declare in `ipc-channels.test.ts` that `voice:*` IS in `remote-shim.ts` (Android) and that the *remote-desktop* mode is the exception, not the file.
disposition: accepted — remote-shim exposes `voice` only on the android-local connection (the `targetUrl` gate hoisted to the namespace); the parity test names remote-desktop as the exception.

### R1-2 macOS: no microphone usage string and no audio-input entitlement — the mic cannot open on a Mac
severity: blocker
claim: "macOS: `voice:start` first calls `systemPreferences.askForMediaAccess('microphone')` … the system's own permission prompt comes first" (R21).
evidence: `rg -n -i 'NSMicrophone|extendInfo' youcoded/desktop/electron-builder.yml youcoded/desktop/package.json` → nothing. Electron's `systemPreferences` docs (fetched 2026-09-05): "In order to properly leverage this API, you must set the `NSMicrophoneUsageDescription` … strings in your app's `Info.plist`." Without the string macOS terminates a process that touches the mic instead of prompting. `youcoded/desktop/assets/entitlements.mac.plist` (the file electron-builder signs with, hardened runtime on) grants only `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation` — no `com.apple.security.device.audio-input`, which the hardened runtime requires for microphone access.
consequence: on a Mac the first tap either kills the app or yields a silent `NotAllowedError`, which the design then reports as "Microphone access was refused by your computer" — an inaccurate reason (R12) for a packaging omission. R1, R20, R21 all fail on macOS; CI's smoke test stays green because it never opens the mic.
fix: `mac.extendInfo: { NSMicrophoneUsageDescription: "YouCoded turns your speech into text on this computer." }` in `electron-builder.yml`, and `<key>com.apple.security.device.audio-input</key><true/>` in `assets/entitlements.mac.plist` (update the WHY comment there — it currently says the content is byte-for-byte the template).
disposition: accepted — `mac.extendInfo.NSMicrophoneUsageDescription` and the audio-input entitlement, with the plist's WHY comment updated.

### R1-3 Android 11+ hides the recognizer unless the manifest asks to see it; `RECORD_AUDIO` is also not declared
severity: blocker
claim: Android readiness is "ready when `SpeechRecognizer.isRecognitionAvailable`, else unavailable with the reason"; `RECORD_AUDIO` "requested the way `QrScannerOverlay` requests the camera".
evidence: `app/build.gradle.kts:24 targetSdk = 35`. `AndroidManifest.xml:12-14` `<queries>` lists only `com.tailscale.ipn`; `rg -n RECORD_AUDIO AndroidManifest.xml` → nothing. Android's package-visibility guide (fetched 2026-09-05) requires `<queries><intent><action android:name="android.speech.RecognitionService"/></intent></queries>` for an app targeting 11+ that uses `SpeechRecognizer`. A runtime permission must also be declared in the manifest before it can be requested.
consequence: `isRecognitionAvailable()` returns false on every phone, so the card says voice is unavailable with a reason that is technically true and completely misleading (R12); and a permission request for an undeclared permission is auto-denied.
fix: add both manifest lines (`<uses-permission android:name="android.permission.RECORD_AUDIO"/>` and the `RecognitionService` intent under `<queries>`), and put a `VoiceRecognizerTest`-adjacent guard in `ipc-channels.test.ts`'s style that reads the manifest for both strings.
disposition: accepted — both manifest lines plus a guard test that reads the manifest for them.

### R1-4 "No microphone" and "refused" arrive as an *error*, not as *readiness*, so the wrong card shows
severity: major
claim: a renderer `NotAllowedError` maps to the V-8 sentence and `NotFoundError` to V-3's; R11/R20/R21 say the tap "opens the card … with one Check again button".
evidence: main's `status()` "reads the marker: ready / needs-download / downloading / unavailable" — it knows the model folder, not the microphone. So on a machine with no mic, status is `ready`; `VoiceButton.handleClick` with `state === 'ready'` calls `onStart`; `getUserMedia` throws; `useVoiceInput.start` catches and calls `setError(...)`; `VoiceButton` renders the **"Voice stopped" card with an OK button** (`if (error) { … <Button>OK</Button> }`), not the "Voice isn't available … Check again" card, which only renders for `readiness.state === 'unavailable'`. `recheck()` calls `bridge.status()` — main again — so Check again could never re-probe the mic even if the card appeared. Additionally the hook has already flipped `phase` to `listening` before `start()` rejects, so the strip flashes for a frame.
consequence: R11, R20 and R21 fail on desktop as written: right sentence, wrong card, wrong button, and no way to "check again".
fix: readiness is composed in the renderer: `voice-capture.ts` gets `probe()` — `navigator.mediaDevices.enumerateDevices()` (no `audioinput` → V-3 sentence) and, via a tiny `voice:mic-access` request to main, `systemPreferences.getMediaAccessStatus('microphone')` (macOS **and** Windows: Electron docs) → `denied` → V-8 sentence. `useVoiceInput` merges the probe over main's status for both `status()` and `recheck()`, and a start-time `NotFoundError`/`NotAllowedError` becomes `setReadiness({state:'unavailable', reason})`, not `setError`. `voice:start` in main stays what it is.
disposition: accepted — readiness is composed in the renderer from a device probe plus main's `voice:mic-access` (getMediaAccessStatus) over main's model status; start-time NotFound/NotAllowed become `unavailable`, never `error`; phase flips to listening only after capture opened.

### R1-5 Enter while listening sends the draft but leaves the mic open; the next partial re-inserts the sent text
severity: major
claim: R3 "a second tap, Enter, the strip's Stop, or about two quiet seconds stops it." The design's `InputBar.test.tsx` additions do not list Enter.
evidence: `InputBar.tsx:848-862` Enter → `send()`; `:615-630` `send()` clears `text` and never touches `voice`; the global handler `:283-288` does the same via `sendRef`. `onPartial` (`:128-131`) writes `setText(voiceBaseRef.current + committed)` — `voiceBaseRef` still holds the pre-send draft and the worker still holds the whole segment.
consequence: press Enter mid-sentence: the message goes out, the box empties, then half a second later the *old draft plus everything said so far* reappears in the box, and the mic is still hot. R3 fails; R4's "nothing sends by itself" is undermined by a stale re-fill.
fix: `send()` (and the global-keydown path, which routes through `sendRef`) calls `voice.stop()` — or `cancel()` if the design wants Enter to send only the settled words — *before* `sendMessage`, and clears `voiceTail`/`voiceBaseRef`. Add the case to `InputBar.test.tsx`: Enter while listening sends exactly the committed text and the next partial is ignored.
disposition: accepted — Enter while listening STOPS the mic and the text waits (V-6's approved wording: 'closes after … Enter … the cursor waits'); send paths guard on phase; test added.

### R1-6 `cancel` must promise "no `final` afterwards", or typing while listening gets overwritten
severity: major
claim: `cancel` "closes the mic and discards everything heard" (voice-types); "typing while listening cancels" is a test.
evidence: `InputBar.tsx:813-817` `onChange` → `voice.cancel()` then `setText(val)`. `useVoiceInput.ts` handles `final` regardless of `phaseRef` and calls `onFinal`, whose `InputBar` handler does `setText(voiceBaseRef.current + final + ' ')`. The workbench fake's `cancel` **emits `{type:'final', text:''}`** (`mock-shim.ts` `cancel: async () => { …; emit({ type: 'final', text: '' }); }`) — it only "works" today because the fake emits synchronously and the later `setText(val)` wins. Over real IPC the `final` lands one tick later and wins instead. The design does not say whether the worker's `cancel` emits `final`.
consequence: R16 ("keeps what you typed") fails intermittently on the real backend — the typed character vanishes and the box reverts to the pre-mic draft.
fix: state it in the design and in `voice-types.ts`: `cancel` emits nothing; `stop` emits exactly one `final`. `useVoiceInput` drops `partial`/`final` when `phaseRef.current === 'idle'` (belt and braces), and the fake is changed to match (`workbench-mock-contract.test.ts` already polices the fake's shape, not its timing — add a test that `cancel` yields no `final`).
disposition: accepted — `cancel` emits nothing, `stop` emits exactly one `final`; the hook drops partial/final while idle; the fake changes to match with a test.

### R1-7 The re-hear loop's cost is linear in segment length; "~70 ms a pass" is the 1-second number
severity: major
claim: "one Parakeet pass takes ~70 ms at 4 threads"; "every 500 ms while audio is arriving, run the whole segment"; segments commit "past 12 s and … its last 0.8 s is quiet".
evidence: measured on this machine with the same addon and model (`scratchpad/rehear-bench.js`, `test_wavs/en.wav` tiled), `OfflineRecognizer` `modelType:'nemo_transducer'`, median of 3: 2 threads — 1 s 55 ms · 3 s 113 · 6 s 193 · **12 s 363** · 24 s 733 ms; 4 threads — 44 · 80 · 155 · **282** · 563 ms. `OfflineStream` has no incremental mode (`createStream` → `acceptWaveform` → `decode`; `non-streaming-asr.js`), so every pass pays for the whole segment.
consequence: at the 12 s cap a pass is 280–360 ms of every 500 ms: 2–4 cores at 60–70 % for as long as the user talks (fans, battery on the "weak laptop" the investigation optimised for). A user who talks 12 s without a 0.8 s gap — normal when dictating — pushes the pass past the cadence (24 s = 560–730 ms), passes queue, the grey tail lags further behind the voice each half-second, and the silence stop (computed in main) fires while the worker is still chewing. Also worth knowing: `decode` is synchronous; a queued `stop` waits behind it.
fix: schedule the next pass when the previous one finishes plus a gap (never a fixed timer); commit at any ≥ 0.8 s pause once a segment passes ~5 s, and hard-cut at 15 s even without a pause; use `decodeAsync` so the worker keeps draining `voice:audio` while decoding; write the measured numbers into the design so the test fixture's fake recognizer has a realistic cost model.
disposition: accepted — pass scheduling is completion-plus-gap, commit at any ≥0.8 s pause once past 5 s, hard cut at 15 s, decodeAsync; measured numbers go into the design and the fake recognizer's cost model.

### R1-8 The x64 Mac dmg ships without the addon
severity: major
claim: "electron-builder ships only the current platform's" optional package.
evidence: it is `npm ci` that filters (the platform packages declare `os`/`cpu`), and the mac CI runner is arm64 while `electron-builder.yml` cuts **both** `x64` and `arm64` dmgs from that one tree. `.github/workflows/desktop-release.yml:62-80` already works around exactly this for `@vscode/ripgrep-darwin-x64` and `@napi-rs/canvas-darwin-x64` ("without this step the x64 dmg ships arm64 binaries") — the design adds nothing to that step. And once both mac packages are installed, `files: node_modules/**/*` ships both in both dmgs (+34 and +38 MB).
consequence: on an Intel Mac the first tap fails with sherpa's own message — "Could not find sherpa-onnx-node … Please remember to set … DYLD_LIBRARY_PATH" — a confident wrong cause, which is the anti-pattern `docs/error-message-standards.md` exists for.
fix: add `sherpa-onnx-darwin-x64@$(ver sherpa-onnx-node)` to that step in **both** `desktop-release.yml` and `desktop-test-build.yml` (the comment says keep them in sync), and exclude the other arch per dmg with electron-builder's `${arch}` macro in `files`.
disposition: already handled — by R1-15's on-demand fetch there is no addon in the installer, so no arch-specific CI step and no double-ship.

### R1-9 A `stop` with no `final`, or a dead worker, leaves the mic stuck on "Finishing…" forever
severity: major
claim: "On `stop`: one last pass, `final`." Nothing is said about the utility process exiting, the model failing to load, or a pass throwing.
evidence: `useVoiceInput.stop` sets `phase = 'finishing'` and only a `final` or `error` event returns it to `idle`; `VoiceButton` renders `disabled` while `finishing`. No timeout, no `exit` handling. `rg -n utilityProcess youcoded/desktop/src` → nothing: this is the first utility process in the app, so there is no existing crash-relay to inherit.
consequence: a worker crash (out of memory on a small laptop — the loaded recognizer measured 1.14 GB RSS, see R1-13 — or a corrupt model file) freezes the composer's mic with a spinner until the app restarts; Space-hold silently does nothing.
fix: `VoiceService` guarantees exactly one terminal event per `start` — on `utilityProcess` `exit`/`error`, or a pass that throws, emit `error` with the real message (exit code + last stderr line), never a paraphrase; the hook adds a 5 s watchdog on `finishing` that emits a local `error`.
disposition: accepted — VoiceService guarantees one terminal event per start (worker exit/error/throw → `error` with the real message); the hook adds a 5 s watchdog on finishing.

### R1-10 `SpeechRecognizer` is main-thread-only and the permission prompt needs an Activity, not the Service
severity: major
claim: `SessionService.handleBridgeMessage()` gains `voice:start` …; `RECORD_AUDIO` requested "the way `QrScannerOverlay` requests the camera".
evidence: `handleBridgeMessage` runs on the bridge server's thread; the service already hops for main-thread-only APIs (`SessionService.kt:598 Handler(Looper.getMainLooper())`, `:837 "TerminalSession requires the main thread (Looper)"`). Android throws `RuntimeException("SpeechRecognizer should be used only from the application's main thread")` otherwise. `QrScannerOverlay.kt:63 permissionLauncher.launch(Manifest.permission.CAMERA)` is an Activity-scoped result launcher inside a composable — a Service has no such launcher.
consequence: the first `voice:start` crashes the service (bridge gone, chat frozen) or, if the permission path is written in the service, the request is never shown and the reason reported is a guess.
fix: the design names the mechanism: a `VoiceRecognizer` owned by `MainActivity` (or created on `Handler(Looper.getMainLooper())` inside the service with the permission request delegated to the Activity through the existing `prompt:show`-style path), and states that `voice:status` reports `unavailable` with "Microphone permission not granted" only *after* the Activity's launcher has returned denied.
disposition: accepted — VoiceRecognizer lives on the main Looper and the permission request goes through MainActivity's launcher via the existing prompt path; `unavailable` only after the launcher returned denied.

### R1-11 The addon's loader swallows the real error and prints a guess
severity: minor
claim: "anything else surfaces the browser's own message, never a guess."
evidence: `sherpa-onnx-node/addon.js` tries five `require` paths, `catch (error) { /* do nothing */ }` each, then throws "Could not find sherpa-onnx-node … set LD_LIBRARY_PATH". A `.node` that is *found* but fails to load (missing `GLIBCXX_3.4.29` — the Linux addon needs it, so glibc-2.32-era distros; a quarantined dylib on macOS; an antivirus hold on Windows) is reported as *not found*, with environment-variable advice that does not apply.
consequence: the card tells the user something false, and the next debugging session chases `LD_LIBRARY_PATH`.
fix: the worker requires the platform `.node` by its resolved path directly (`require.resolve('sherpa-onnx-<platform>-<arch>/sherpa-onnx.node')`) inside its own try/catch and forwards `err.message` verbatim as `unavailable`'s reason; keep `sherpa-onnx-node`'s JS wrappers for the API.
disposition: accepted — the worker requires the platform `.node` by its resolved path in its own try/catch and forwards `err.message` verbatim.

### R1-12 The card's "English and 24 European languages" sentence changes R8's approved copy outside a deck
severity: minor
claim: "The first-run card should say 'English and 24 European languages' so the limit is visible before the download."
evidence: R8 pins the card to "'Speak your messages', two sentences, 464 MB, Not now and Download" (source V-2). `.claude/rules/feature-flow.md` → "Reopen only through a deck: when implementation contradicts approved UI, serve a one-step words-only `decide` deck and wait."
consequence: a build that adds the sentence ships copy Destin never saw; a build that does not leaves Japanese speakers downloading 464 MB for nonsense — the design has picked one without the deck.
fix: a one-step decide deck with the two options (add the sentence / keep two sentences and put the language list in the (i) tooltip), and the answer amends R8's source.
disposition: accepted — the card keeps R8's approved copy in this build; the language sentence goes to a one-step decide deck served with the acceptance deck, and the answer amends R8.

### R1-13 Memory and warm-up are understated; audio spoken during load has no stated home
severity: minor
claim: "Unloads the recognizer after ten idle minutes (≈700 MB of memory)"; the worker "holds one `OfflineRecognizer`".
evidence: measured (`rehear-bench.js`): one loaded recognizer, 2 threads, `rss=1140MB`; construction 830–940 ms on this machine (slower on the laptops the investigation targeted). The hook flips to `listening` the instant `start()` is called, so the user is talking while the model is still loading after any idle unload.
consequence: the first sentence after a ten-minute pause is lost unless the worker buffers chunks that arrive before the recognizer exists; and a 4 GB laptop with a local chat model running will be closer to swapping than "≈700 MB" suggests.
fix: state that the worker queues `voice:audio` from `start` until the recognizer is ready and includes it in the first pass; put the measured RSS in the design; consider `createAsync` so the worker's IPC stays responsive during load.
disposition: accepted — the worker queues audio from start until the recognizer is ready; measured RSS (1.14 GB) in the design; createAsync.

### R1-14 Reasons must come from the operating system, on Windows and Linux too
severity: minor
claim: `NotFoundError` → "No microphone was found on this computer."; Linux risk: "a missing portal must surface as the specific reason".
evidence: Windows' global "Let desktop apps access your microphone" switch makes Chromium enumerate zero audio inputs, so the mapped sentence would be a guess (R12); Electron's `getMediaAccessStatus('microphone')` covers Windows and returns `denied` in that case (docs fetched 2026-09-05). On Linux, Chromium's audio *capture* goes through PulseAudio/PipeWire-pulse, not the desktop portal (the portal is screen capture), so the risk as written points at the wrong thing; the real Linux failure is a missing `pipewire-pulse`/`pulseaudio` daemon, which surfaces as `NotFoundError` too. Headless check (`scratchpad/actx-test.html` via `ui-probe.mjs`): a 48 kHz `MediaStream` connected into `new AudioContext({sampleRate:16000})` is accepted without throwing, and sherpa resamples internally anyway (bench log: `in_sample_rate: 24000 → 16000`), so the 16 kHz context is a nicety, not a correctness requirement.
consequence: a Windows user with the privacy switch off is told they have no microphone.
fix: consult `getMediaAccessStatus` before mapping `NotFoundError` on Windows/macOS (fold into R1-4's probe); reword the Linux risk to name the audio daemon; when `NotFoundError` cannot be disambiguated, use the standard's general shape — "Voice could not open a microphone." with the real `err.name`/`err.message` beneath — rather than asserting "none was found".
disposition: accepted — folded into R1-4's probe: getMediaAccessStatus on Windows and macOS before mapping NotFoundError; the Linux risk names the audio daemon; an undecidable NotFoundError uses the general shape with the real err.name/message.

### R1-15 Every installer grows 21–38 MB for a feature most users may never tap, and the download's numbers do not match
severity: minor
claim: packaging = `sherpa-onnx-node` plus the platform package in `node_modules`, `asarUnpack`ed; the card prints 464 MB.
evidence: `npm view` unpacked sizes: linux-x64 32.7 MB, win-x64 23.0 MB, darwin-arm64 34.0 MB, darwin-x64 37.5 MB (and see R1-8 for both mac packages riding together). The app already has a precedent for fetching native binaries on demand with a pinned hash (`engine-acquisition.ts`, llama-server per backend). The asset is 487,170,055 bytes: 464.6 MiB, 487 MB in the units a browser or Finder shows; the archive is bzip2, whose single-threaded decompression of half a gigabyte runs tens of seconds during which the card's bar has nothing to show (`onProgress({kind:'unpack'})` exists but is indeterminate).
consequence: no row asked for a bigger installer on every update; a user watching "464 MB" download while their OS reports 487 MB, then a full bar that sits still for a minute, reads it as stuck.
fix: either accept the installer cost explicitly in the design (one sentence), or fetch the platform package tarball from the npm registry alongside the model with a pinned SHA-256 into `<userData>/voice/` (no `asarUnpack`, no mac double-ship, no `extraResources`); print sizes in the unit the rest of the app uses; give the unpack phase its own label ("Unpacking…") on the card.
disposition: accepted — the platform package (and the tiny JS wrapper) are fetched on demand from the npm registry into <userData>/voice/ with pinned integrity, alongside the model; no asarUnpack, no installer growth; sizes printed in the app's unit; the unpack phase gets its own label.
