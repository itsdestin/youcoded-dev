---
status: active
created: 2026-09-05
feature: voice prompting
design: docs/active/specs/2026-09-05-voice-prompting-technical-design.md (fourth revision, after three review rounds and a reopen deck)
contract: docs/active/design/2026-09-05-voice-prompting/voice-prompting.contract.json
branches: youcoded feat/voice-prompting · youcoded-dev design/voice-prompting
---

# Voice prompting — work breakdown

Feature-flow §8c. Each task is one subagent's work, names the contract rows it satisfies,
names its own check, and states what it depends on. **Descriptions, not pre-written code** —
the default; nothing here crosses repos, changes data already on users' machines, or has
steps that must land in a strict order, which are the three cases that earn pre-written code.

Every task reads the design section named in it. The rules for the files it touches load
themselves. `bash scripts/verify.sh worktrees/voice-prompting` after each task.

## Wave 1 — no dependencies, run in parallel

### T1 · The shared shape and the fake
**Files:** `desktop/src/shared/voice-types.ts`, `desktop/src/renderer/dev/workbench/mock-shim.ts`,
`desktop/src/renderer/dev/workbench/mock-only.ts`, `desktop/tests/workbench-mock-contract.test.ts`
**Design:** "The shared contract".
Extend the bridge with `sendAudio` and `micAccess` (desktop only), add the fifth readiness
state `{state:'unpacking'; engine}`, and write the event contract into the types as prose:
`cancel` emits nothing, `stop` emits exactly one `final`. Delete "will not change again" from
`committed`'s comment — it is false of this engine inside an open segment — and say what is
true instead: `committed` runs to the last sentence-ending mark, and only a completed sentence
is final. Update the workbench fake to match: emit no `final` on `cancel`, offer `micAccess`
and `sendAudio`, emit `unpacking`, and split its scripted text at the last sentence mark
rather than at two words, so the surface Destin reviews behaves like the real one.
**Rows:** R2 (as rewritten), R16. **Check:** `workbench-mock-contract.test.ts` extended with
"cancel emits no final"; `verify.sh`.

### T2 · Asset acquisition
**Files:** new `desktop/src/main/voice/voice-assets.ts`, `voice-pin.ts`, `desktop/tests/voice-assets.test.ts`
**Design:** "Main → voice-assets.ts".
Fetch and verify both halves into `<userData>/voice/`: the `sherpa-onnx-<platform>-<arch>@1.13.7`
npm tarball (runtime) and the pinned Parakeet archive (model). Follow
`engine/engine-acquisition.ts`'s shape — `.unpacking` sibling, `.complete` marker written last,
rename into place — with the design's **three stated departures**: `net.fetch` (proxies; the
reason is in `err.message`, not `cause`), a verifier taking `{algo, encoding, digest}` (npm is
sha512/base64, the model is sha256/hex), and a **checked bzip2 decompressor** — this is the
app's first `.tar.bz2` and the inherited helper was only ever verified for `.zip`/`.tar.gz`.
Pin two things per platform: the digest and the in-archive relative path. `win-arm64` is the
unsupported platform (not published on npm); `win-ia32` is supported.
**Rows:** R5, R9, R10. **Check:** `voice-assets.test.ts` — half-unpacked is never ready, a bad
digest reports the exact mismatch in both digest shapes, a stale pinned layout is caught,
progress reaches `unpacking` before `ready`. **Before writing code**, run the design's
cross-platform `tar -xf` check on a small `.tar.bz2` and record the result in the task's notes.

### T3 · macOS packaging and the Android manifest
**Files:** `desktop/electron-builder.yml`, `desktop/assets/entitlements.mac.plist`,
`app/src/main/AndroidManifest.xml`, a manifest guard test
**Design:** "Packaging (macOS)", "Android → Manifest".
Add `NSMicrophoneUsageDescription` and the `com.apple.security.device.audio-input` entitlement
(without both, macOS kills the process instead of prompting), and update the plist's WHY
comment, which currently claims the file is the byte-for-byte template. Add `RECORD_AUDIO` and
the `RecognitionService` `<queries>` intent to the manifest — without the second,
`isRecognitionAvailable()` is false on every phone since Android 11.
**Rows:** R1, R6, R20, R21. **Check:** a test that reads the manifest for both strings; the
plist and yml are inspected in review.

## Wave 2 — depends on wave 1

### T4 · The worker (depends: T1, T2)
**Files:** new `desktop/src/main/voice/voice-worker.ts`, `desktop/tests/voice-rehear.test.ts`,
`desktop/tests/voice-addon-load.test.ts`
**Design:** "Main → voice-worker.ts".
An Electron `utilityProcess` holding one `OfflineRecognizer`. Load the addon by **absolute
path** into `<userData>/voice/runtime/package/` inside its own try/catch, forwarding
`err.message` verbatim; the package's own loader hides the real dlopen error behind
`LD_LIBRARY_PATH` advice that does not apply here. Queue audio from `start` until the
recogniser exists and fold it into the first pass. The re-hear loop: next pass scheduled on
completion plus 200 ms, never a timer; `decodeAsync`; **the grey/solid split is the last
sentence-ending mark, not a word count** (reopen V-9); `committed` cumulative and promoted on
commit; commit at any ≥0.8 s pause once past 5 s; hard cut at the quietest 100 ms frame in the
last second. Acknowledge each pass with its segment length so the service can defend a deadline.
**Rows:** R2, R14. **Check:** `voice-rehear.test.ts` including **one case driven by the
recorded real Parakeet ladder** in review 3 (a scripted fake is prefix-stable and cannot catch
the rewrite this rule exists to contain); `voice-addon-load.test.ts` against a **fake** addon
built by the test, from a temp dir with no `node_modules` on the path.

### T5 · The service and the handlers (depends: T1, T2)
**Files:** new `desktop/src/main/voice/voice-service.ts`, `voice-handlers.ts`,
`desktop/src/main/preload.ts`, `desktop/tests/voice-service.test.ts`
**Design:** "Main → voice-service.ts", "voice-handlers.ts".
The state machine, the six channels, the push. **Exactly one terminal event per `start`** —
including the path that has twice been lost: a worker that neither exits nor answers is ended
by the derived deadline, killed, and reported with what actually happened. Window lifecycle:
`start` records the requesting `webContents.id`; a destroyed window cancels and unloads;
`before-quit` kills the worker; a second window's `start` while listening is refused with a
real reason. The silence stop (two seconds of sub-floor RMS after speech). Ten-minute idle
unload.
**Rows:** R3, R12. **Check:** `voice-service.test.ts` — one terminal event for each of: normal
stop, cancel (none), worker exit mid-pass, load failure, a throwing pass, window destroyed,
**wedged worker**; second-window refusal.

### T6 · Capture and the hook (depends: T1)
**Files:** new `desktop/src/renderer/voice-capture.ts`, `desktop/src/renderer/hooks/useVoiceInput.ts`,
`desktop/tests/useVoiceInput.test.ts`
**Design:** "Renderer".
The worklet built as a Blob URL, posting Int16 and its RMS in one message; the renderer relays
audio to `sendAudio` and emits the RMS locally so the meter never waits on a round trip.
**Both capture and readiness composition are desktop-only**, gated on the bridge offering
`sendAudio` / `micAccess` — on Android `start()` is the bridge call alone, or the WebView
auto-denies `getUserMedia` and the phone shows the desktop's words about "your computer".
Phase flips to `listening` only after capture opened. Start-time `NotFound`/`NotAllowed`
become `unavailable` (the Check-again card), never `error`. The watchdog arms only when the
heartbeat stops, and a late `final` after a watchdog error still delivers its text.
**Rows:** R11, R12, R20, R21. **Check:** `useVoiceInput.test.ts` — composition on desktop and
its absence on Android, the Android start path opening no microphone, NotAllowed → V-8's
sentence, the heartbeat-gated watchdog, a late final delivering, events dropped while idle.

### T7 · The shim gate and the rule (depends: T1)
**Files:** `desktop/src/renderer/remote-shim.ts`, `desktop/tests/ipc-channels.test.ts`, a
runtime predicate test on `remote-shim-unsupported.test.ts`'s harness,
`youcoded-dev/.claude/rules/ipc-bridge.md`
**Design:** "The shim, and the one intentional gap".
Expose `voice` only under the shim's own Android predicate
(`location.protocol === 'file:' && !targetUrl`), **and refuse in every `voice.*` method at call
time when `targetUrl` is set** — `setConnectionMode` flips a module variable and does not
rebuild the bridge, so the namespace decision alone leaves a live mic on a phone that pairs to
a desktop mid-session. `status()` answers `unavailable` with the Q-7 reason so the card
explains itself. Amend the parity rule's closed exception list with **three** clauses
(`sendAudio`, `micAccess`, and the namespace's absence outside `android-local`).
**Rows:** R7. **Check:** the runtime predicate test (shim installed at `file://` with no
target → `voice` present; at `http://` with none → absent); `ipc-channels.test.ts` keeps the
type strings and asserts the two method exceptions by name.
**Note:** this task edits a file in the *workspace* repo (`ipc-bridge.md`) as well as the app
repo; land each in its own branch, as the workspace rules require.

### T8 · Android (depends: T1, T3)
**Files:** new `app/src/main/kotlin/com/youcoded/app/runtime/VoiceRecognizer.kt`,
`SessionService.kt`, `MainActivity.kt`, `app/src/test/.../VoiceRecognizerTest.kt`
**Design:** "Android".
`SpeechRecognizer` created on the main Looper (the hop `SessionService` already makes for
`TerminalSession`), with the `RECORD_AUDIO` request delegated to `MainActivity`'s launcher
through the existing prompt path — a Service has no result launcher. Map `onPartialResults` →
`partial` (grey = since the last sentence mark), `onResults` → `final`, `onRmsChanged` →
`level`, `onError` → `error` with the error name spelled out. `voice:status` reports
`unavailable` with "Microphone permission was not granted." only after the launcher returned
denied. `voice:download` and `voice:mic-access` reply not-implemented.
**Rows:** R6. **Check:** `VoiceRecognizerTest` with a fake `SpeechRecognizer`;
`JAVA_HOME=/usr/lib/jvm/java-21-openjdk ANDROID_HOME=/home/destin/.android-sdk ./gradlew test -x bundleWebUi`.

## Wave 3 — depends on wave 2

### T9 · The composer's last mile (depends: T4, T5, T6)
**Files:** `desktop/src/renderer/components/InputBar.tsx`,
`desktop/src/renderer/components/VoiceButton.tsx`, `desktop/src/renderer/components/InputBar.test.tsx`
**Design:** "Renderer", and the deck decisions table.
Move the grey boundary from a two-word tail to the last sentence-ending mark. Guard Enter at
the **two keyboard sites**, never inside `send()` — the Send button and the "Send anyway"
retry both route through `send()` and must keep sending. Space-hold: clear the pending timer
**and** stop on blur/`visibilitychange`, so the 250 ms before the hold arms cannot leak a hot
mic. Add the `unpacking` card branch: a moving unmeasured bar labelled **"Almost ready…"**.
Card copy from the reopen deck: **about 500 MB**, and the line **"Understands English and 24
other European languages."**
**Rows:** R2, R3, R8, R15, R18, R19. **Check:** `InputBar.test.tsx` — the draft merge; typing
cancels and keeps the typed text; Enter stops without sending while the Send button still
sends; Space held 250 ms starts, release stops, a tap does nothing, Space with text types a
space, focus leaving mid-hold stops it, focus leaving **before** 250 ms leaves it closed.

### T10 · Wire the fake out, the real in (depends: T5, T9)
**Files:** `desktop/src/renderer/dev/workbench/mock-only.ts`, `docs/MAP.md` (workspace)
**Design:** "The shared contract", "Main → voice-assets.ts".
Drop the six `voice.*` rows from `MOCK_ONLY` now that real handlers exist (the fake namespace
itself stays, for the compare panes). Add `<userData>/voice/` to the workspace MAP's on-disk
state table.
**Rows:** none directly; this is the registry's own rule. **Check:**
`workbench-mock-contract.test.ts` ("no MOCK_ONLY entry has since gained a real channel");
`node scripts/audit-anchors.mjs` for the MAP row.

## After the build

Feature-flow §8e, in order: the **code reviewer** (`scripts/ui-review/code-reviewer.md`) over
the whole branch, then the **UX tester** (`ux-tester.md` + `tester-kit.md`) driving the built
copy, then triage of both, then the **grader** (`grader.md`) writing
`voice-prompting.contract.verdicts.json`, then the acceptance deck, then `close-out.sh`.

**Not automatable, and Destin's:** the first real dictation. Nothing in this plan has heard a
human voice — every measurement so far is a recorded file through a headless rig. The design's
own risks (the fan on a weak laptop, a long sentence turning most of the box grey, Linux
without a PulseAudio daemon) are all things he finds in thirty seconds and no test will.
