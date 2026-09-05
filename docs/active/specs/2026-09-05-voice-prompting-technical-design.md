---
status: active
created: 2026-09-05
revised: 2026-09-05 after design review 1 (docs/active/reviews/2026-09-05-voice-prompting-design-review-1.md — 14 accepted, 1 already handled)
feature: voice prompting
design: docs/active/design/2026-09-05-voice-prompting/ (questions deck, review rounds 1–3, signed contract)
ui-branch: youcoded feat/voice-prompting (the composer's mic, built and reviewed against a workbench fake)
findings: docs/active/investigations/2026-09-05-local-speech-engines.md
---

# Voice prompting — technical design (build stage)

The UI is done and approved on decks; this is the backend that makes it real, plus the
Android half. Every decision below is downstream of a deck answer; the answer is cited.

## What was decided (the decks)

| Decision | Source |
|---|---|
| Engine: NVIDIA Parakeet TDT 0.6B v3 (int8), run through sherpa-onnx, on the user's computer | review V-0 |
| Words appear while talking; settled words solid, the newest two grey until they settle | Q-2, review3 V-6 |
| Tap to start; stops on a second tap, Enter, the strip's Stop, or two quiet seconds; the text then waits | Q-3, review3 V-6 |
| The text waits in the box; nothing sends by itself | Q-4 |
| The mic is always visible; the first tap offers a one-time download on a card above the mic | Q-5, review V-2 |
| No microphone: the card says the real reason, with Check again | review V-3 |
| While listening: the "Listening" strip above the box (dot · Listening · meter · clock · Stop); the mic's ring follows loudness, 2–9 px | review2 V-4, V-5; review3 V-6 |
| Hold Space in an empty box for a quarter second to listen, release to stop; a tap does nothing; no other shortcut | review3 V-7 |
| Refused by the operating system: "Microphone access was refused by your computer. Allow it for YouCoded in your system's privacy settings, then check again." with Check again | review3 V-8 |
| Android uses the phone's own recogniser, wired to the same mic button | Q-6 |
| No mic on the remote browser client until remote access is encrypted | Q-7 (roadmap remote-access.md) |

Not in this build: Moonshine as a small-download option, a cloud engine, Whisper, the
built-in Windows/macOS speech services (roadmap, user-interface.md), hotwords. The first-run
card keeps R8's approved copy exactly; whether it should also name the language limit
("English and 24 European languages") is a one-step decide deck served with the acceptance
deck (review 1, R1-12) — not decided here.

## Architecture

```
renderer                              main (Electron)                        utility process
InputBar ─ useVoiceInput ──IPC──▶ voice-handlers.ts ── VoiceService ──fork──▶ voice-worker.ts
  │ ▲ voice:event                     │ model + runtime files (voice-assets)   │ sherpa-onnx OfflineRecognizer
  │ │                                 │ one terminal event per start          │ queue · re-hear · commit
voice-capture.ts (mic, probe, level) ─ voice:audio (Int16, 100 ms) ────────────▶ buffer
```

### Renderer

Already built: `VoiceButton.tsx`, `useVoiceInput.ts`, the voice parts of `InputBar.tsx`. New:

- **`voice-capture.ts`** — `probe()` and `open()`. `probe()` composes the readiness the card
  needs (review 1, R1-4/R1-14): `navigator.mediaDevices.enumerateDevices()` for the presence
  of an `audioinput`, plus main's `voice:mic-access` (Electron
  `systemPreferences.getMediaAccessStatus('microphone')`, which answers on macOS AND Windows —
  Windows' global privacy switch otherwise looks like "no microphone"). `open()` calls
  `getUserMedia({audio: {channelCount: 1, echoCancellation, noiseSuppression, autoGainControl}})`,
  builds an `AudioContext({sampleRate: 16000})` (Chromium accepts a 48 kHz stream into it; the
  recogniser resamples anyway, so this is a convenience, not a correctness requirement) and an
  `AudioWorklet` that posts Int16 PCM every 100 ms to `window.claude.voice.sendAudio(chunk)`.
  Capture lives in the renderer because Chromium owns the audio devices and gives echo
  cancellation, noise suppression and gain control for free. The loudness meter is the RMS
  of each chunk, emitted locally as a `level` event: it never waits on a round trip.
- **Readiness is composed, not read** (R1-4): `useVoiceInput.status()` and `recheck()` merge
  the probe over main's model status — `unavailable` from the probe wins over `ready` from the
  model folder. A start-time `NotFoundError` / `NotAllowedError` becomes
  `setReadiness({state: 'unavailable', reason})` — the Check-again card — never `setError`
  (the "Voice stopped / OK" card is for a mic that was open and died). The reason sentences:
  access status `denied` → V-8's sentence verbatim; no `audioinput` device AND access not
  denied → V-3's "No microphone was found on this computer."; anything else → the general
  shape, "Voice could not open a microphone.", with the real `err.name: err.message` beneath.
- **Phase flips to `listening` only after `open()` resolved** (R1-4), so a refusal never
  flashes the strip.
- **Enter while listening stops the mic; the text waits** (R1-5, V-6's approved wording).
  Both send paths (`send()` and the global-keydown route through `sendRef`) check the phase:
  listening → `stop()` and return. A second Enter sends. `finishing` → ignored.
- **`cancel` emits nothing; `stop` emits exactly one `final`** (R1-6) — stated in
  `voice-types.ts` as the contract. The hook drops `partial`/`final` while `phaseRef` is
  idle. Typing while listening calls `cancel()`; the typed text wins, always.
- **Watchdog** (R1-9): 5 s in `finishing` with no terminal event → a local `error` ("The
  speech engine stopped answering.") and back to idle.

### Main — `src/main/voice/`

- **`voice-assets.ts`** — acquisition of BOTH things the feature needs, into
  `<userData>/voice/` (per-machine, never synced; a new row in `docs/MAP.md`'s on-disk
  table), using the exact shape of `engine/engine-acquisition.ts`: download with throttled
  progress → verify → unpack into a `.unpacking` sibling → `.complete` marker written last →
  rename into place.
  1. The runtime (R1-15, and it dissolves R1-8): the platform package
     `sherpa-onnx-<platform>-<arch>@1.13.7` tarball from the npm registry (21–38 MB; pinned
     `dist.integrity` per platform, four entries), plus `sherpa-onnx-node@1.13.7`'s JS
     wrappers. Nothing native ships in the installer: no `asarUnpack`, no arch-specific CI
     step, no double-shipped Mac binaries. The pins live in `voice-pin.ts` beside
     `engine-pin.ts`.
  2. The model: `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2` from sherpa-onnx's
     `asr-models` release, 487,170,055 bytes, SHA-256
     `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf` (the release's
     `checksum.txt`, read 2026-09-05); 641 MB unpacked.
  Progress `readiness` events carry the phase: `downloading` with a percentage over the
  combined byte total, then **`unpacking`** (bzip2 is single-threaded; half a gigabyte takes
  tens of seconds and the card must say so instead of sitting at a full bar — R1-15). Sizes
  are printed in the unit the rest of the app uses (`formatBytes`, the same helper the model
  manager uses). `status()` reads the two markers: ready / needs-download / downloading /
  unpacking / unavailable (only for a platform with no package: `linux-arm64` is supported,
  `win-ia32` is not).
- **`voice-service.ts`** — the state machine the renderer's readiness and phase mirror. Owns
  the worker, forwards `voice:audio` chunks, relays `partial` / `final` / `error` as
  `voice:event`, and **guarantees exactly one terminal event per `start`** (R1-9): a worker
  `exit` or `error`, a load failure, or a pass that throws becomes `error` with the real
  message (exit code and the last stderr line, verbatim). The silence stop: two seconds of RMS
  below a floor *after* speech was heard → `stop()`; energy-based first, sherpa's silero VAD
  (2 MB) is the upgrade if breathing or fans keep the mic open. Unloads the worker after ten
  idle minutes.
- **`voice-worker.ts`** — an Electron `utilityProcess` (the app's first; Electron 41's own
  Node, and `sherpa-onnx-node` is an N-API addon — verified by the reviewer: 141 `napi_*`
  imports, loads under `ELECTRON_RUN_AS_NODE` unchanged). WHY a separate process: a pass is
  synchronous and hundreds of milliseconds (below); on the main thread it would stall every
  IPC in the app while the mic is open. The worker:
  - **loads the addon by its resolved path** inside its own try/catch and forwards
    `err.message` verbatim (R1-11): `sherpa-onnx-node`'s own loader swallows the real dlopen
    error and prints `LD_LIBRARY_PATH` advice that does not apply. The Linux addon needs
    `GLIBCXX_3.4.29`; a distro older than that gets the loader's real sentence.
  - **queues audio from `start` until the recogniser exists** (R1-13) and folds it into the
    first pass; construction is ~0.9 s here, longer on the laptops the findings targeted, and
    the user is already talking. `createAsync` so the worker's IPC stays responsive.
  - **the re-hear loop, with the measured cost model** (R1-7). A pass costs the whole segment:
    on this machine at 4 threads 44 ms for 1 s of audio, 155 ms for 6 s, 282 ms for 12 s,
    563 ms for 24 s (2 threads: 55 · 193 · 363 · 733 ms). So: the next pass is scheduled when
    the previous one completes plus a 200 ms gap, never on a fixed timer; a segment commits
    at any ≥ 0.8 s pause once it is past 5 s, and is hard-cut at 15 s even mid-word (a hard
    cut may split a word; the next segment's first pass hears the rest, and the join is a
    space). `decodeAsync` keeps the worker draining `voice:audio` while a pass runs. The
    result of each pass splits into `committed` (all but the last two words) and `tail`.
  - `stop`: one last pass on the open segment, then exactly one `final` with every committed
    segment joined. `cancel`: drop everything, emit nothing.
  - Memory: one loaded recogniser measured **1.14 GB RSS** at 2 threads (R1-13) — the
    ten-minute unload is not optional, and the first-run card's numbers are honest about the
    download, not the memory; a 4 GB laptop running a local chat model at the same time is a
    known bad combination for the roadmap, not this build.
- **`voice-handlers.ts`** — `ipcMain.handle` for `voice:status`, `voice:download`,
  `voice:start`, `voice:stop`, `voice:cancel`, `voice:mic-access`; `ipcMain.on` for
  `voice:audio` (fire-and-forget, an ArrayBuffer); `voice:event` push to the requesting
  window. macOS: `voice:start` first awaits `systemPreferences.askForMediaAccess('microphone')`.

### Packaging (macOS)

`electron-builder.yml` gains `mac.extendInfo.NSMicrophoneUsageDescription` ("YouCoded turns
your speech into text on this computer.") and `assets/entitlements.mac.plist` gains
`com.apple.security.device.audio-input` (R1-2) — without both, macOS terminates the process
that touches the mic instead of prompting, which the design would have misreported as a
refusal. The plist's WHY comment (it says the file is the byte-for-byte template) is updated.

### Android

- **Manifest** (R1-3): `<uses-permission android:name="android.permission.RECORD_AUDIO"/>`
  and, under the existing `<queries>`, `<intent><action android:name="android.speech.RecognitionService"/></intent>` —
  without the second, `isRecognitionAvailable()` is false on every phone since Android 11
  (targetSdk is 35). A guard test reads the manifest for both strings.
- **`VoiceRecognizer.kt`** (R1-10) — `SpeechRecognizer` is main-thread-only, and a permission
  request needs an Activity's result launcher, which a Service does not have. So the
  recogniser is created on `Handler(Looper.getMainLooper())` (the hop `SessionService` already
  makes for `TerminalSession`) and the `RECORD_AUDIO` request is delegated to `MainActivity`'s
  launcher through the existing `prompt:show`-style path; `voice:status` reports `unavailable`
  with "Microphone permission was not granted." only after the launcher returned denied.
  `EXTRA_PARTIAL_RESULTS` on; `partial` from `onPartialResults` (last two words as `tail`),
  `final` from `onResults`, `level` from `onRmsChanged` (−2..10 dB → 0..1), `error` from
  `onError` with the SpeechRecognizer error name spelled out.
- **`SessionService.handleBridgeMessage()`** gains `voice:status`, `voice:start`,
  `voice:stop`, `voice:cancel`; `voice:download` and `voice:mic-access` reply not-implemented
  (nothing to fetch; the launcher owns the question); `voice:audio` is unused (the phone's
  recogniser owns the microphone). Pushes `voice:event` through `bridgeServer.broadcast`.

### The shim, and the one intentional gap

`remote-shim.ts` is Android's `window.claude` too (R1-1 — the first draft of this design
would have shipped the Android half dead). So the shim exposes `voice` when the connection
is `android-local` (the `targetUrl` gate that `android.*` already uses, hoisted to the
namespace) and leaves it `undefined` for a remote-desktop connection (Q-7). `ipc-channels.test.ts`
records `voice:*` as present in all three surfaces, with remote-desktop as the named exception
and its Q-7 reason. When the channel is encrypted, the remote path gains `voice` and sends
audio to the desktop's worker.

## The shared contract

`shared/voice-types.ts` (already on the branch) is the one shape: `VoiceReadiness`,
`VoiceEvent`, `VoiceBridge`. Added by this build: `sendAudio(chunk: ArrayBuffer): void` and
`micAccess(): Promise<'granted' | 'denied' | 'not-determined' | 'unknown'>` on the bridge
(desktop only; Android's shim omits `sendAudio`, and the renderer only calls what is
present); `readiness.state: 'unpacking'`; and the two sentences of the event contract:
`cancel` emits nothing, `stop` emits exactly one `final`. `MOCK_ONLY` loses its `voice.*`
rows when the real handlers land; the workbench fake stays for the compare panes and is
corrected to the event contract.

## Tests

- `voice-rehear.test.ts` — the segment/commit/tail logic as pure functions over Float32
  buffers with a scripted fake recogniser whose cost follows the measured curve: the tail is
  the last two words; a rewritten word never leaves a stale copy; commit only past 5 s and
  on a ≥ 0.8 s pause; hard cut at 15 s; passes never overlap and never run on a timer.
- `voice-silence.test.ts` — no stop before speech; stop two seconds after speech ends; a loud
  burst resets the clock.
- `voice-assets.test.ts` — a half-unpacked folder is never reported ready; a bad hash deletes
  the archive and reports the exact mismatch; progress reaches `unpacking` before `ready`.
- `voice-service.test.ts` — exactly one terminal event per start for: normal stop, cancel
  (none), worker exit mid-pass, load failure, a pass that throws.
- `useVoiceInput.test.ts` — readiness composition (probe wins), NotAllowed → unavailable with
  V-8's sentence, the watchdog, events dropped while idle.
- `InputBar.test.tsx` additions — partial/final merge into an existing draft; typing while
  listening cancels and keeps the typed text; Enter while listening stops and does not send;
  Space held 250 ms in an empty box starts, release stops, a tap does nothing, Space with
  text types a space.
- `ipc-channels.test.ts` — the six request types and the push on all three surfaces, with
  the remote-desktop `voice` omission recorded as the intentional exception.
- `workbench-mock-contract.test.ts` addition — the fake's `cancel` emits no `final`.
- Android: `VoiceRecognizerTest` with a fake `SpeechRecognizer` for the partial/final/error
  mapping, and a manifest guard for the two strings (`./gradlew test -x bundleWebUi` from a
  worktree).

## Risks, stated

- Talking 12–15 s without a pause costs 2–4 cores at roughly two thirds while it lasts; the
  hard cut bounds it. The "weak laptop" of the findings will feel this in the fan.
- The download's real number is 487 MB; the card prints that. Moonshine (106 MB) is the
  fallback on the roadmap if it draws complaints.
- Linux: Chromium's audio capture goes through PulseAudio or PipeWire's Pulse shim (not the
  desktop portal); a machine without that daemon looks like "no microphone" and gets the
  general sentence with the real error beneath.
- Parakeet is 25 European languages; the language sentence on the card awaits its deck.
- Android punctuation depends on the phone maker (Q-6 accepted this).
