---
status: draft
created: 2026-09-05
feature: voice prompting
design: docs/active/design/2026-09-05-voice-prompting/ (questions deck, review rounds 1–2, contract)
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
| Words appear while talking; settled words solid, the newest two grey until they settle | Q-2, review V-1 |
| Tap to start; stops on a second tap, Enter, or two quiet seconds; hold Space in an empty box for walkie-talkie | Q-3 (+ note) |
| The text waits in the box; nothing sends by itself | Q-4 |
| The mic is always visible; the first tap offers a one-time download (464 MB) on a card above the mic | Q-5, review V-2 |
| No microphone: the card says the real reason, with Check again | review V-3 |
| While listening: the "Listening" strip above the box (dot · Listening · meter · clock · Stop); the mic's ring follows loudness, 2–9 px | review2 V-4, V-5 |
| Android uses the phone's own recogniser, wired to the same mic button | Q-6 |
| No mic on the remote browser client until remote access is encrypted | Q-7 (roadmap remote-access.md) |

Not in this build: Moonshine as a small-download option, a cloud engine, Whisper, the
built-in Windows/macOS speech services (roadmap, user-interface.md), hotwords.

## Architecture

```
renderer                         main (Electron)                       utility process
InputBar ─ useVoiceInput ──IPC──▶ voice-handlers.ts ──fork──▶ voice-worker.ts
  │  ▲ voice:event                  │  VoiceService                     │ sherpa-onnx-node
  │  │                              │  (state, readiness, model files)  │ OfflineRecognizer
mic capture (AudioWorklet) ─ voice:audio (Int16 100 ms) ─▶ buffer ─ re-hear loop ─ partial/final
```

**Renderer** — already built (`VoiceButton.tsx`, `useVoiceInput.ts`, `InputBar.tsx`). New:
`voice-capture.ts`, a small module the hook calls on `start`: `getUserMedia({audio:
{channelCount:1, echoCancellation, noiseSuppression, autoGainControl}})` → an
`AudioContext({sampleRate: 16000})` → an `AudioWorklet` that posts Int16 PCM every 100 ms →
`window.claude.voice.sendAudio(chunk)`. Capture lives in the renderer because Chromium owns
the audio devices and gives echo cancellation, noise suppression and gain control for free;
main has no microphone. The loudness meter is computed here too (RMS of each chunk) and
emitted locally as a `level` event, so the meter never waits on a round trip.

**Main** — `src/main/voice/`:
- `voice-model.ts` — acquisition of the model folder, the same shape as
  `engine/engine-acquisition.ts`: pinned URL (sherpa-onnx's `asr-models` release,
  `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2`, 464 MB), pinned SHA-256, download with
  throttled progress, verify, unpack with the system `tar` into a `.unpacking` sibling, write
  the `.complete` marker last, rename into `<userData>/voice/parakeet-tdt-0.6b-v3-int8/`
  (641 MB unpacked). Per-machine, never synced; a new row in `docs/MAP.md`'s on-disk table.
  `status()` reads the marker: ready / needs-download / downloading / unavailable.
- `voice-service.ts` — the state machine the renderer's readiness and phase mirror. Owns the
  worker, forwards `voice:audio` chunks to it, relays its `partial` / `final` / `error` as
  `voice:event` pushes, and applies the silence stop: two seconds of RMS below a floor
  *after* speech was heard → `stop()`. Energy-based first; sherpa's silero VAD (2 MB) is the
  upgrade if breathing or fans keep the mic open.
- `voice-worker.ts` — an Electron `utilityProcess` (Electron 41 here; Electron's own Node,
  so an N-API addon loads with no ABI dance — `sherpa-onnx-node` is built on node-addon-api,
  unlike node-pty, which is why *that* one lives in a system-Node child). WHY a separate
  process at all: one Parakeet pass takes ~70 ms at 4 threads; on the main thread that would
  stall every IPC in the app twice a second while the mic is open. The worker holds one
  `OfflineRecognizer` (`modelType: 'nemo_transducer'`, `numThreads: min(4, cores/2)`),
  the audio since the last commit, and the re-hear loop: every 500 ms while audio is
  arriving, run the whole segment, split the result into `committed` (all but the last two
  words) and `tail`; when a segment passes 12 s and its last 0.8 s is quiet, freeze the text
  and start a new segment, so the window never grows without bound. On `stop`: one last pass,
  `final`. Unloads the recognizer after ten idle minutes (≈700 MB of memory).
- `voice-handlers.ts` — `ipcMain.handle` for `voice:status`, `voice:download`, `voice:start`,
  `voice:stop`, `voice:cancel`; `ipcMain.on` for `voice:audio` (fire-and-forget, an
  ArrayBuffer); `voice:event` push to the requesting window. macOS: `voice:start` first calls
  `systemPreferences.askForMediaAccess('microphone')` and reports a refusal as
  `unavailable` with the exact reason.

**Packaging** — `sherpa-onnx-node` plus its per-platform optional package (linux-x64 31 MB,
win-x64 21 MB, darwin-arm64 32 MB; electron-builder ships only the current platform's). The
addon and its shared libraries must be listed under `asarUnpack` in `electron-builder.yml`
next to `pty-worker.js`, or the `.node` file cannot be loaded from inside the archive.

**Android** — `app/.../runtime/VoiceRecognizer.kt` wrapping `android.speech.SpeechRecognizer`
with `EXTRA_PARTIAL_RESULTS`; `RECORD_AUDIO` requested the way `QrScannerOverlay` requests
the camera. `SessionService.handleBridgeMessage()` gains `voice:status` (ready when
`SpeechRecognizer.isRecognitionAvailable`, else unavailable with the reason), `voice:start`,
`voice:stop`, `voice:cancel`; `voice:download` replies not-implemented (nothing to fetch);
`voice:audio` is unused (the phone's recogniser owns the microphone). Pushes `voice:event`
through `bridgeServer.broadcast` like `prompt:show`: `partial` from `onPartialResults` (the
last two words as `tail`), `final` from `onResults`, `level` from `onRmsChanged` (scaled
−2..10 dB → 0..1), `error` from `onError` with the SpeechRecognizer error name spelled out.

**Remote browser** — `remote-shim.ts` exposes no `voice` namespace (Q-7), so the mic never
renders there. This is a new, documented exception in `ipc-channels.test.ts`'s parity list
with the Q-7 reason; when the channel is encrypted the shim gains `voice` and sends audio to
the desktop's worker.

## The shared contract

`shared/voice-types.ts` (already on the branch) is the one shape: `VoiceReadiness`,
`VoiceEvent`, `VoiceBridge`. Added by this build: `sendAudio(chunk: ArrayBuffer): void` on
the bridge (desktop only; Android and remote omit it — the renderer only calls it when it
is present). `MOCK_ONLY` loses its six `voice.*` rows when the real handlers land; the
workbench fake stays for the compare panes (the registry's rule).

## Tests

- `voice-rehear.test.ts` — the segment/commit/tail logic as pure functions over Float32
  buffers with a scripted fake recognizer: the tail is the last two words; a rewritten word
  never leaves a stale copy; a segment commits only past 12 s and only on a quiet tail.
- `voice-silence.test.ts` — the silence stop: no stop before speech; stop two seconds after
  speech ends; a loud burst resets the clock.
- `voice-model.test.ts` — acquisition: a half-unpacked folder is never reported ready; a bad
  hash deletes the archive and reports the exact mismatch.
- `InputBar.test.tsx` additions — partial/final merge into an existing draft (the typed
  half-sentence keeps its place); typing while listening cancels; Space held 250 ms in an
  empty box starts, release stops, a tap does nothing.
- `ipc-channels.test.ts` — the five request types and the push on all three surfaces, with
  the remote-shim `voice` omission recorded as an intentional exception.
- Android: `VoiceRecognizerTest` with a fake `SpeechRecognizer` for the partial/final/error
  mapping (`./gradlew test -x bundleWebUi` from a worktree).

## Risks, stated

- The download's real number is 464 MB (the questions deck said ~150). The card prints the
  real one; Moonshine (106 MB) is the fallback if it draws complaints.
- Electron's `getUserMedia` on Linux/Wayland goes through PipeWire; the dev instance must be
  checked on this machine, and a missing portal must surface as the specific reason.
- Parakeet is 25 European languages; a user dictating in, say, Japanese gets English-shaped
  nonsense. The first-run card should say "English and 24 European languages" so the limit is
  visible before the download.
- Android punctuation depends on the phone maker (Q-6 accepted this); the built-in
  Windows/macOS fallback Destin noted is filed, not built.
