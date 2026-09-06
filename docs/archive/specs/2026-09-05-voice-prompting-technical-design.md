---
status: shipped
created: 2026-09-05
revised: 2026-09-05 after design reviews 1–3 (docs/active/reviews/2026-09-05-voice-prompting-design-review-{1,2,3}.md — 41 accepted, 1 already handled) and the reopen deck
feature: voice prompting
design: docs/active/design/2026-09-05-voice-prompting/ (questions deck, review rounds 1–3, signed contract)
ui-branch: youcoded feat/voice-prompting (the composer's mic, built and reviewed against a workbench fake)
findings: docs/active/investigations/2026-09-05-local-speech-engines.md
---

# Voice prompting — technical design (build stage)

The UI is done and approved on decks; this is the backend that makes it real, plus the
Android half. Every decision below is downstream of a deck answer; the answer is cited.
Findings marked `R1-n` / `R2-n` are the two design reviews.

## What was decided (the decks)

| Decision | Source |
|---|---|
| Engine: NVIDIA Parakeet TDT 0.6B v3 (int8), run through sherpa-onnx, on the user's computer | review V-0 |
| Words appear while talking; **everything since your last full stop stays grey and turns solid when you finish a sentence** | Q-2, review3 V-6, **reopen V-9** |
| Tap to start; stops on a second tap, Enter, the strip's Stop, or two quiet seconds; the text then waits | Q-3, review3 V-6 |
| The text waits in the box; nothing sends by itself | Q-4 |
| The mic is always visible; the first tap offers a one-time download on a card above the mic, promising **about 500 MB** and naming the language limit | Q-5, review V-2, **reopen V-10, V-11** |
| No microphone: the card says the real reason, with Check again | review V-3 |
| While the download expands the card reads **"Almost ready…"** with a moving bar | **reopen V-12** |
| While listening: the "Listening" strip above the box (dot · Listening · meter · clock · Stop); the mic's ring follows loudness, 2–9 px | review2 V-4, V-5; review3 V-6 |
| Hold Space in an empty box for a quarter second to listen, release to stop; a tap does nothing; no other shortcut | review3 V-7 |
| Refused by the operating system: "Microphone access was refused by your computer. Allow it for YouCoded in your system's privacy settings, then check again." with Check again | review3 V-8 |
| Android uses the phone's own recogniser, wired to the same mic button | Q-6 |
| No mic on the remote browser client until remote access is encrypted | Q-7 (roadmap remote-access.md) |

Not in this build: Moonshine as a small-download option, a cloud engine, Whisper, the
built-in Windows/macOS speech services (roadmap, user-interface.md), hotwords.

**All four open questions were answered on the reopen deck** (2026-09-05, forced by R3-3 —
the engine provably breaks a promise Destin had approved):

- **V-9 — the grey window.** Measured against the real pinned model, a re-hear rewrites text it
  has already settled: commas appear and move three words back, inside solid black. The
  approved "newest two grey until they settle" was therefore not true of the engine we chose.
  **Decision: everything since the user's last full stop stays grey and turns solid when a
  sentence ends**, so black text never changes. This replaces the two-word tail everywhere —
  in `voice-worker.ts`'s split, in `voice-types.ts`'s wording, and in the mirror layer.
- **V-10 — the size.** The card promises **about 500 MB**, the true combined first-run total
  (model plus runtime), not the 464 MB the model archive alone rounds to.
- **V-11 — the languages.** The card gains one line: **"Understands English and 24 other
  European languages."**
- **V-12 — the unpack label.** While the archive expands the card reads **"Almost ready…"**
  with a moving, unmeasured bar.

There is no shared renderer size helper (R2-12 — `formatBytes` is private to
`main/project-context.ts`), so "about 500 MB" is written literally, once, in the card.

## Architecture

```
renderer                              main (Electron)                        utility process
InputBar ─ useVoiceInput ──IPC──▶ voice-handlers.ts ── VoiceService ──fork──▶ voice-worker.ts
  │ ▲ voice:event                     │ voice-assets (runtime + model)         │ sherpa-onnx OfflineRecognizer
  │ │                                 │ one terminal event per start           │ queue · re-hear · commit
voice-capture.ts ── worklet ─ voice:audio (Int16 + RMS, 100 ms) ────────────────▶ buffer
```

### Renderer

Already built: `VoiceButton.tsx`, `useVoiceInput.ts`, the voice parts of `InputBar.tsx`. New:

- **`voice-capture.ts` + a worklet** (R2-6). An `AudioWorklet` has no `window`, so it cannot
  call the bridge itself: `voice-capture.ts` builds the worklet module at runtime as a **Blob
  URL** (this sidesteps the packaged `file://` module-path question entirely — no build-chunk
  configuration, nothing to unpack), and the processor posts each 100 ms Int16 buffer **and
  its RMS in the same message** through `processor.port.onmessage`. The renderer relays the
  buffer to `window.claude.voice.sendAudio(chunk)` and emits the RMS locally as a `level`
  event, so the meter costs nothing extra and never waits on a round trip.
  `open()` calls `getUserMedia({audio: {channelCount: 1, echoCancellation, noiseSuppression,
  autoGainControl}})` into an `AudioContext({sampleRate: 16000})` (Chromium accepts a 48 kHz
  stream into it and the recogniser resamples anyway, so this is a convenience, not a
  correctness requirement).
- **Readiness composition is desktop-only** (R1-4, R2-11). The hook is shared with the Android
  WebView and the workbench, so it composes only when the bridge offers the probe:
  `typeof bridge.micAccess === 'function'` — the same present-or-absent test the design uses
  for `sendAudio`. On desktop `probe()` merges `navigator.mediaDevices.enumerateDevices()`
  (is there an `audioinput`?) with main's `voice:mic-access`
  (`systemPreferences.getMediaAccessStatus('microphone')`, which answers on macOS AND Windows
  — Windows' global privacy switch otherwise looks like "no microphone"), and `unavailable`
  from the probe wins over `ready` from the model folder. **On Android `status()` is
  authoritative** and nothing is composed, or the phone would be told "No microphone was found
  on this **computer**" while its recogniser works.
- A start-time `NotFoundError` / `NotAllowedError` becomes
  `setReadiness({state: 'unavailable', reason})` — the Check-again card — never `setError`
  (the "Voice stopped" card is for a mic that was open and died). Sentences: access `denied`
  → V-8 verbatim; no `audioinput` and access not denied → V-3's "No microphone was found on
  this computer."; anything else → the general shape, "Voice could not open a microphone.",
  with the real `err.name: err.message` beneath.
- **Phase flips to `listening` only after `open()` resolved** (R1-4), so a refusal never
  flashes the strip.
- **Enter stops the mic — guarded at the keyboard, never inside `send()`** (R2-5). The guard
  lives at the two keyboard sites (the textarea's `onKeyDown` Enter branch and App's global
  handler); `send()` is left alone, because the Send button submits the form through it and
  the "Send anyway" retry calls it too — guarding there would silently turn both into a stop,
  which no row asked for. Enter while listening: stop, text waits, a second Enter sends.
- **`cancel` emits nothing; `stop` emits exactly one `final`** (R1-6) — written into
  `voice-types.ts` as the contract. The hook drops `partial`/`final` while idle, **except a
  late `final` after a watchdog error, which still delivers its text** (R2-7). Typing while
  listening cancels; the typed text wins, always.
- **Space-hold releases on more than key-up** (R2-15): `blur` on the textarea and
  `window` `blur` / `visibilitychange` while `spaceHeld` is set also stop the mic, or an
  alt-tab mid-hold leaves it open until the silence stop inserts text nobody asked for.
- **`unpacking` is a real card state, not just a type member** (R2-8): `VoiceButton` gains a
  fifth branch — a moving, unmeasured bar plus **"Almost ready…"** (reopen V-12) — because the
  R1-15 fix that added the phase would otherwise make the progress card *vanish* for the minute
  it exists to explain. The workbench fake emits it, since that is the surface Destin reviews.
- **The capture is gated exactly like the composition** (R3-4): `voice-capture.open()` runs
  only where the bridge offers `sendAudio`. On Android `start()` is the bridge call alone and
  the phase flips when it resolves — otherwise the WebView, whose `WebChromeClient` overrides
  only `onConsoleMessage`, auto-denies `getUserMedia` and the phone shows V-8's sentence about
  "your computer" and "system privacy settings". The `NotFoundError`/`NotAllowedError` mapping
  is desktop-only for the same reason.
- **Space-hold's guard is "a hold is in flight", not "`spaceHeld` is set"** (R3-7): on `blur`
  and `visibilitychange`, clear `spaceHoldTimer` **and** stop if `spaceHeld` — the 250 ms
  before the hold arms is exactly where the leak lives, and a guard on `spaceHeld` alone is
  false for all of it.

### Main — `src/main/voice/`

- **`voice-assets.ts`** — acquires both halves into `<userData>/voice/` (per-machine, never
  synced; a new row in `docs/MAP.md`'s on-disk table), in `engine/engine-acquisition.ts`'s
  shape: download → verify → unpack into a `.unpacking` sibling → `.complete` marker last →
  rename into place. Two changes to that shape, both stated rather than inherited:
  - **`net.fetch`, not global `fetch`** (R2-10), so system proxies are honoured — Node's
    `fetch` reports a corporate proxy and an offline machine identically as "fetch failed",
    which is neither allowed error shape. **`net.fetch` rejects with the reason in
    `err.message` and sets no `cause`** (R3-5), so the card shows `err.message` verbatim;
    `err.cause` stays only as a fallback for any path still on Node's `fetch`. `net.fetch` is
    not assignable to `typeof fetch`, so `voice-assets.ts` declares its own fetch field rather
    than reusing `engine-acquisition`'s slot. A download failure is **recoverable and has a real
    reason**, so it stays the existing card plus that reason plus Retry (R3-6) — the
    two-action `<ErrorState mode="general">` is not imported into a 288 px popover it cannot
    host.
  - **The verifier takes `{algo, encoding, digest}`** (R2-13): npm publishes sha512/base64
    (`dist.integrity`) and the model release publishes sha256/hex. Each pin records the
    command that produced it; a pin nobody can reproduce is worse than the format mismatch.
  - **The unpack is the third change, not an inheritance** (R3-11): this is the app's first
    `.tar.bz2`, and `engine-acquisition`'s `systemTar()` is documented and was verified for
    `.zip` and `.tar.gz` only — GNU tar shells out to a `bzip2` binary that a slim Linux
    container may not have. Before the build starts, `tar -xf` a small `.tar.bz2` is checked on
    Windows' System32 tar and on a bzip2-less Linux image; the decompressor is then named
    explicitly with a checked failure message, or bzip2 is decompressed in-process. (The
    "single-threaded" note describes `bzip2(1)`, not the format.)
  1. **The runtime** (R1-15, R2-3): the `sherpa-onnx-<platform>-<arch>@1.13.7` tarball from the
     npm registry (21–38 MB) **plus `sherpa-onnx-node@1.13.7`'s JS wrappers, unpacked beside
     the addon** (R2-2). npm tarballs are rooted at `package/` and the addon needs its three
     sibling shared libraries in the same directory, so `voice-pin.ts` pins **two things per
     platform** — the integrity digest and the in-archive relative path
     (`package/sherpa-onnx.node`) — exactly as `engine-pin.ts` pins an asset's binary path,
     and `engine-acquisition`'s "the pinned layout is stale" existence check is reused
     verbatim. Nothing native ships in the installer: no `asarUnpack`, no arch-specific CI
     step, no double-shipped Mac binaries. Supported: `linux-x64`, `linux-arm64`, `win-x64`,
     `win-ia32`, `darwin-x64`, `darwin-arm64`. **`win-arm64` is the unsupported one** — it is
     not published on npm (`npm view` → E404); an earlier draft named `win-ia32`, which does
     exist.
  2. **The model**: `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2` from sherpa-onnx's
     `asr-models` release, 487,170,055 bytes, SHA-256
     `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf` (the release's
     `checksum.txt`, read 2026-09-05); 641 MB unpacked.
  Progress `readiness` carries the phase: `downloading` (percentage over the combined byte
  total), then `unpacking` (bzip2 is single-threaded; half a gigabyte takes tens of seconds).
- **`voice-service.ts`** — the state machine the renderer mirrors. Owns the worker, forwards
  `voice:audio`, relays `partial` / `final` / `error`, and **guarantees exactly one terminal
  event per `start`** (R1-9): a worker `exit` or `error`, a load failure, or a pass that throws
  becomes `error` with the real message (exit code and the last stderr line, verbatim).
  - **A deadline the service can defend** (R2-7, corrected by R3-2). A heartbeat alone
    reinstates the very bug R1-9 fixed: it is pushed from the service's own belief that a pass
    is running, so a worker that wedges or swaps — 1.14 GB resident — never exits, never
    throws, never stops heartbeating, and the mic sits disabled in `finishing` forever. So the
    worker **acknowledges each pass with its segment length**, the service derives the expected
    cost from the measured curve below, and a pass that overruns it by a multiple kills the
    worker and emits the one terminal `error` R1-9 promises, saying what actually happened
    ("Voice stopped: the speech engine did not answer for 30 seconds and was closed") — specific
    and true, never an invented cause. The renderer's watchdog is the second line, armed only
    once the heartbeat stops.
  - **Lifecycle** (R2-14): `start` records the requesting `webContents.id`; a destroyed or
    closed window cancels that session and unloads; `app.on('before-quit')` kills the worker;
    a second window's `start` while another is listening is refused with a real reason.
  - The silence stop: two seconds of RMS below a floor *after* speech was heard → `stop()`.
    Energy-based first; sherpa's silero VAD (2 MB) is the upgrade if breathing or fans keep
    the mic open. Unloads the worker after ten idle minutes.
- **`voice-worker.ts`** — an Electron `utilityProcess` (the app's first; Electron 41's own
  Node, and `sherpa-onnx-node` is an N-API addon — verified in review 1: 141 `napi_*` imports,
  loads under `ELECTRON_RUN_AS_NODE` unchanged). WHY a separate process: a pass is synchronous
  and hundreds of milliseconds (below); on the main thread it would stall every IPC in the app
  while the mic is open. The worker:
  - **loads the addon by an absolute path** (R2-2 — this is where the two round-1 fixes
    cancelled out: `require.resolve('sherpa-onnx-<plat>/…')` cannot see a package that no
    longer lives in `node_modules`). It `require()`s
    `path.join(voiceRoot, 'runtime', 'package', 'sherpa-onnx.node')` inside its own try/catch
    and forwards `err.message` verbatim (R1-11) — the package's own loader swallows the real
    dlopen error and prints `LD_LIBRARY_PATH` advice that does not apply. The JS wrappers are
    unpacked beside it so their relative `require('./sherpa-onnx.node')` resolves. Pinned by a
    test that loads the addon from a temp directory with no `node_modules` on the path. The
    Linux addon needs `GLIBCXX_3.4.29`; an older distro gets the loader's real sentence.
  - **queues audio from `start` until the recogniser exists** (R1-13) and folds it into the
    first pass; construction is ~0.9 s here and longer on a weak laptop, and the user is
    already talking. `createAsync` keeps the worker's IPC responsive during load.
  - **the re-hear loop, with a measured cost model** (R1-7). A pass costs the whole segment:
    at 4 threads 44 ms for 1 s of audio, 155 ms for 6 s, 282 ms for 12 s, 563 ms for 24 s
    (2 threads: 55 · 193 · 363 · 733 ms). So the next pass is scheduled when the previous one
    completes plus a 200 ms gap, never on a fixed timer, and `decodeAsync` keeps the worker
    draining audio while a pass runs.
  - **the segment→text contract, stated** (R2-9, rewritten for reopen V-9). `committed` is
    **cumulative across segments** and is promoted on commit, so the grey never disappears or
    repeats. **The grey/solid boundary is the user's last sentence-ending punctuation, not a
    word count**: everything after the final `.`, `?` or `!` in the current pass is grey; the
    prefix up to and including it is solid. This is the only split that survives R3-3's
    measurement — the engine revises punctuation several words back while re-hearing, so any
    fixed tail (two words, or six) leaves revisions landing in black text. A segment commits at
    any ≥ 0.8 s pause once past 5 s. The hard cut is taken at the **quietest 100 ms frame in
    the last second** rather than exactly at 15 s — the same RMS the silence stop already
    computes, so it is nearly free, and it lands the split between words in almost every real
    case instead of mangling one mid-dictation.
  - `stop`: one last pass on the open segment, then exactly one `final` with every committed
    segment joined. `cancel`: drop everything, emit nothing.
  - Memory: one loaded recogniser measured **1.14 GB RSS** at 2 threads (R1-13), so the
    ten-minute unload is not optional. A 4 GB laptop also running a local chat model is a known
    bad combination — roadmap, not this build.
- **`voice-handlers.ts`** — `ipcMain.handle` for `voice:status`, `voice:download`,
  `voice:start`, `voice:stop`, `voice:cancel`, `voice:mic-access`; `ipcMain.on` for
  `voice:audio` (fire-and-forget, an ArrayBuffer); `voice:event` pushed to the window that
  started the session. macOS: `voice:start` first awaits
  `systemPreferences.askForMediaAccess('microphone')`.

### Packaging (macOS)

`electron-builder.yml` gains `mac.extendInfo.NSMicrophoneUsageDescription` ("YouCoded turns
your speech into text on this computer.") and `assets/entitlements.mac.plist` gains
`com.apple.security.device.audio-input` (R1-2) — without both, macOS terminates the process
that touches the mic instead of prompting, which the design would have misreported as a
refusal. The plist's WHY comment (it claims the file is the byte-for-byte template) is updated.
Review 2 confirmed the runtime download is legal on macOS: the npm binaries carry
`LC_CODE_SIGNATURE`, `disable-library-validation` is already granted, and a file written by
Node's `fs` carries no quarantine attribute, so Gatekeeper's notarisation gate is not reached.

### Android

- **Manifest** (R1-3): `<uses-permission android:name="android.permission.RECORD_AUDIO"/>`
  and, under the existing `<queries>`,
  `<intent><action android:name="android.speech.RecognitionService"/></intent>` — without the
  second, `isRecognitionAvailable()` is false on every phone since Android 11 (targetSdk 35).
  A guard test reads the manifest for both strings.
- **`VoiceRecognizer.kt`** (R1-10) — `SpeechRecognizer` is main-thread-only and a permission
  request needs an Activity's result launcher, which a Service has not got. The recogniser is
  created on `Handler(Looper.getMainLooper())` (the hop `SessionService` already makes for
  `TerminalSession`) and the `RECORD_AUDIO` request is delegated to `MainActivity`'s launcher
  through the existing `prompt:show`-style path; `voice:status` reports `unavailable` with
  "Microphone permission was not granted." only after the launcher returned denied.
  `EXTRA_PARTIAL_RESULTS` on; `partial` from `onPartialResults` (last two words as `tail`),
  `final` from `onResults`, `level` from `onRmsChanged` (−2..10 dB → 0..1), `error` from
  `onError` with the SpeechRecognizer error name spelled out.
- **`SessionService.handleBridgeMessage()`** gains `voice:status`, `voice:start`,
  `voice:stop`, `voice:cancel`; `voice:download` and `voice:mic-access` reply not-implemented
  (nothing to fetch; the launcher owns the question); `voice:audio` is unused. Pushes
  `voice:event` through `bridgeServer.broadcast`.

### The shim, and the one intentional gap

`remote-shim.ts` is Android's `window.claude` too (R1-1 — the first draft would have shipped
the Android half dead). The gate is the shim's **own Android predicate**,
`location.protocol === 'file:' && !targetUrl` (R2-1): `!targetUrl` alone means "not paired to a
remote desktop", which is also true in a plain remote browser tab, so that gate would have put
the mic exactly where Q-7 says it must not be.

**And the namespace decision alone is not enough** (R3-2's sibling, R3-1): `setConnectionMode`
is four lines that flip a module variable — it does **not** rebuild `window.claude`, so a phone
that pairs to a desktop mid-session would keep a live mic talking to a host with no `voice:*`
handlers. So every `voice.*` method **also refuses at call time** when `targetUrl` is set — the
per-call shape `android.*` already uses — and `status()` answers `unavailable` carrying the Q-7
reason, so the card explains itself instead of the button going quietly dead.

`ipc-channels.test.ts` keeps doing what it does — the six type strings across the surfaces. The
**predicate** is asserted in a runtime test built on `remote-shim-unsupported.test.ts`'s harness
(install the shim at `file://` with no target, and at `http://` with none; assert
`window.claude.voice` is present in the first and absent in the second) (R3-10).

## The shared contract

`shared/voice-types.ts` is the one shape: `VoiceReadiness`, `VoiceEvent`, `VoiceBridge`. This
build adds `sendAudio(chunk: ArrayBuffer): void` and
`micAccess(): Promise<'granted' | 'denied' | 'not-determined' | 'unknown'>` (desktop only —
Android's shim omits both, and the renderer calls only what is present); the fifth readiness
state `{state: 'unpacking'; engine: string}`, which Android never produces; and the event
contract in two sentences: `cancel` emits nothing, `stop` emits exactly one `final`.

**`committed`'s doc comment loses "will not change again"** (R3-3): it is false of this engine
inside an open segment. It says what is true instead — `committed` is everything up to and
including the last sentence-ending mark, and only a *completed sentence* is final.

**`ipc-bridge.md`'s exception list is amended in the same change** (R2-16, R3-10) — it is a
closed list, and this build adds **three** asymmetries, not two: `sendAudio` (the phone's
recogniser owns the microphone), `micAccess` (the Activity's launcher owns that question), and
**the `voice` namespace itself, absent from `remote-shim.ts` outside `android-local`** with the
Q-7 reason. The parity test asserts the two method exceptions **by name**; the namespace's
predicate is the runtime test above.

`MOCK_ONLY` loses its `voice.*` rows when the real handlers land; the workbench fake stays for
the compare panes, gains `micAccess` and `sendAudio`, emits `unpacking`, and is corrected so
`cancel` emits no `final` (R1-6).

## Tests

- `voice-rehear.test.ts` — segment/commit/tail as pure functions over Float32 buffers with a
  scripted fake recogniser whose cost follows the measured curve: the grey/solid split is the
  last sentence-ending mark; `committed` is cumulative and promoted on commit; commit only past
  5 s and on a ≥ 0.8 s pause; **a hard cut never splits a word when any sub-threshold frame
  exists in the last second**; passes never overlap and never run on a timer.
  **One case is driven by recorded real output** (R3-3) — the eleven-line ladder of real
  Parakeet passes in review 3, committed as a fixture — because a scripted fake is
  prefix-stable by construction and can never catch the rewrite this rule exists to contain.
- `voice-addon-load.test.ts` — the worker's loader is exercised against a **fake addon** built
  by the test (a plain file plus a sibling it fails to find) from a temp directory with **no
  `node_modules` on the path** (R2-2, R3-9): what is being pinned is the absolute-path resolution
  and the verbatim error forwarding, not sherpa itself, which is no longer a dependency and is
  never downloaded for tests.
- `voice-silence.test.ts` — no stop before speech; stop two seconds after speech ends; a loud
  burst resets the clock.
- `voice-assets.test.ts` — a half-unpacked folder is never reported ready; a bad digest deletes
  the archive and reports the exact mismatch (both digest shapes); a stale pinned layout is
  caught by the existence check; progress reaches `unpacking` before `ready`.
- `voice-service.test.ts` — exactly one terminal event per start for: normal stop, cancel
  (none), worker exit mid-pass, load failure, a pass that throws, the requesting window being
  destroyed, **and a worker that neither exits nor answers** (R3-2 — the only path the earlier
  list omitted, and the one that restored the forever-`finishing` mic); a second window's start
  is refused.
- `useVoiceInput.test.ts` — readiness composition on desktop (probe wins) and its absence on
  Android; **the Android start path opens no microphone** (R3-4); NotAllowed → unavailable with V-8's sentence; the heartbeat-gated watchdog; a late
  `final` after a watchdog error still delivers; events dropped while idle.
- `InputBar.test.tsx` — partial/final merge into an existing draft; typing while listening
  cancels and keeps the typed text; **Enter while listening stops and does not send, while the
  Send button and the Send-anyway retry still send**; Space held 250 ms in an empty box starts,
  release stops, a tap does nothing, Space with text types a space, **focus leaving mid-hold
  stops the mic, and focus leaving *before* the 250 ms elapses leaves it closed** (R3-7).
- `ipc-channels.test.ts` — the six request types and the push across the surfaces, and the two
  named bridge exceptions. The Android **predicate** is a separate runtime test on
  `remote-shim-unsupported.test.ts`'s harness (R3-10).
- `workbench-mock-contract.test.ts` — the fake's `cancel` emits no `final`.
- Android: `VoiceRecognizerTest` with a fake `SpeechRecognizer` for the partial/final/error
  mapping, and a manifest guard for the two strings (`./gradlew test -x bundleWebUi`).

## Risks, stated

- Talking 12–15 s without a pause costs 2–4 cores at roughly two thirds while it lasts; the
  hard cut bounds it. The "weak laptop" of the findings will hear its fan.
- The first-run download is about 500 MB and the card says so (reopen V-10). Moonshine
  (106 MB) is the roadmap fallback if it draws complaints.
- Linux: Chromium's audio capture goes through PulseAudio or PipeWire's Pulse shim (not the
  desktop portal); a machine without that daemon looks like "no microphone" and gets the
  general sentence with the real error beneath.
- Parakeet is 25 European languages and the card now says so (reopen V-11).
- The grey region is a whole unfinished sentence, so a user dictating a long sentence without
  a full stop sees most of the box grey. That is the honest reading of an engine that revises
  punctuation behind itself (R3-3), and it is what Destin chose over a calmer box whose black
  text quietly changes.
- Android punctuation depends on the phone maker (Q-6 accepted this).
