---
status: shipped
created: 2026-09-05
revised: 2026-09-05 after the breakdown review (docs/active/reviews/2026-09-05-voice-prompting-breakdown-review.md — 22 findings, all accepted)
feature: voice prompting
design: docs/active/specs/2026-09-05-voice-prompting-technical-design.md (fourth revision, after three review rounds and a reopen deck)
contract: docs/active/design/2026-09-05-voice-prompting/voice-prompting.contract.json (23 rows)
branches: youcoded feat/voice-prompting · youcoded-dev design/voice-prompting
---

# Voice prompting — work breakdown

Feature-flow §8c. Each task is one subagent's work, names the contract rows it satisfies,
names its own check, and states what it depends on. **Descriptions, not pre-written code.**
Every task reads the design section named in it; the rules for the files it touches load
themselves. `bash scripts/verify.sh worktrees/voice-prompting` after each task, and it must
be green *at every task boundary* — the wave order below is built to keep it that way (B2).

**Already delivered by the UI branch, claimed by no task** (B21): **R4** (the text waits in
the box with the caret at the end), **R13** (the Listening strip), **R17** (the ring is the
theme's accent, so Midnight and Dark stay monochrome). The grader should verify them against
`feat/voice-prompting` as it stands, not look for a task.

## One owner per shared decision

The breakdown review's headline risk was four tasks specifying the same rule (B5). So:

- **The grey/solid split has exactly one implementation**: `splitAtLastSentenceEnd(text)`,
  exported from `shared/voice-types.ts`, **written by T1**, imported by T4 (the worker's
  pass result) and by the workbench fake. **T9 changes no boundary logic** — the composer
  renders whatever `committed`/`tail` the event carries. T8's Kotlin is a **deliberate
  re-implementation** (a phone's recogniser gives whole strings), and its test pins the two
  against the same table of examples.
- **The runtime's on-disk layout has one owner**: T2 exports `voiceRoot` and the resolved
  addon path from `voice-pin.ts`; **T4 imports them and hardcodes nothing** (B8).
- **The `voice:audio` payload shape is fixed in T1** (B9): the worklet's message carries the
  Int16 buffer and its RMS; the RMS travels to main for the silence stop, and **the worker
  recomputes frame energy itself** for the hard cut, because it needs per-frame values the
  transport does not carry. T1 writes that down in the type's comment.

## Decided during the build, binding on later tasks

Recorded here as they are settled, so a later task cannot re-decide them (T1 built, 2026-09-05):

- **`sendAudio?(chunk: ArrayBuffer, rms: number)` takes two arguments.** The design wrote one,
  but the worklet's RMS has to reach main for the silence stop and a single number cannot ride
  inside the audio buffer. **T6** passes the worklet's RMS as the second argument; **T5** reads
  it for the two-second stop; **T4** still recomputes per-frame energy itself for the hard cut,
  which needs values the transport does not carry.
- **`micAccess?()` and `sendAudio?` are both optional**, so `typeof bridge.micAccess === 'function'`
  is the desktop gate.
- **`unpacking` carries no percentage** — there is no believable one — so T9's card branch is an
  indeterminate bar.
- **`sizeMb` stays on the readiness states that have a number, and the card does not print it**;
  T9's copy is the literal sentence from the reopen deck.
- **The fake emits a `heartbeat` alongside each partial**, so T6's heartbeat-gated watchdog does
  not fire in the workbench.
- **T6 must not let capture run in the workbench.** The fake now offers `sendAudio`/`micAccess`,
  so a naive desktop gate would call `getUserMedia` in a review tab — a Chrome permission prompt
  in front of Destin, and a `NotFoundError` in the headless review rig. Gate capture on not being
  the workbench, or have the compare panes supply a bridge without `sendAudio`.

## Carry to the acceptance deck, honestly

**The grey rule does not fully deliver the reason it was chosen for.** V-9 was put to Destin as
"everything since your last full stop stays grey, **so black text never changes**". Measured on
real recorded engine output while building T4 (the ladder is committed at
`desktop/tests/fixtures/parakeet-rehear-ladder.json`), the second half is still not quite true
inside one open stretch: at 3 s the engine writes "And so, my fellow Americans." and the text
goes solid; at 4 s it **takes the full stop back** and the text returns to grey. Twice in eleven
passes on a clean studio recording.

The mechanic he chose is what was built, and it is much better than the two-word tail it
replaced — a test pins that the old rule leaks a rewrite into black text on this same recording,
and `voice-types.ts` already refuses to promise stability. But **the acceptance deck must not
repeat the sentence "solid text never changes"**, and R2's row should be read to him as what it
is: grey follows sentence endings, and a sentence ending can be withdrawn.

## Wave 1 — no dependencies, run in parallel

### T1 · The shared shape, the split helper, and the fake
**Files:** `desktop/src/shared/voice-types.ts`, `desktop/src/renderer/dev/workbench/mock-shim.ts`,
`desktop/src/renderer/dev/workbench/mock-only.ts`, `desktop/tests/workbench-mock-contract.test.ts`
**Design:** "The shared contract".
- Add `sendAudio?` and `micAccess?` to `VoiceBridge` — **optional members** (B14), because T6
  gates on `typeof bridge.micAccess === 'function'` and Android and the remote shim omit both.
- Add the fifth readiness state `{state:'unpacking'; engine: string}`, and a **`heartbeat`
  `VoiceEvent`** (B6) — the service pushes it while a pass runs, and it is what arms T6's
  watchdog when it *stops*. Without this member T6's check describes nothing.
- **Decide `sizeMb`** (B13): keep it on the readiness states that have a real number, but the
  card no longer renders it — reopen V-10 made the copy a literal sentence ("about 500 MB").
  Say so in the comment so T9 and the fake cannot disagree, and so `knip` sees an intended
  field rather than a dead one.
- Export **`splitAtLastSentenceEnd(text) → {committed, tail}`** with the rule in its comment,
  and delete "will not change again" from `committed` — false of this engine inside an open
  segment. Write the event contract in as prose: `cancel` emits nothing, `stop` emits exactly
  one `final`. Fix the `voice:audio` payload shape per the section above.
- The fake: emit no `final` on `cancel`, offer `micAccess`/`sendAudio`, emit `unpacking`, and
  split its scripted text with the shared helper rather than at two words.
- **`mock-only.ts`: ADD two rows** (`voice.sendAudio`, `voice.micAccess`) alongside the six
  (B3) — a hand-written fake channel must be either real or registered, and adding them to
  `HAND_WRITTEN` without a matching row fails the guard inside this wave. T5 removes all eight.
**Rows:** R2 (the split rule). **Check:** `workbench-mock-contract.test.ts` extended with
"the fake's `cancel` emits no `final`", plus a unit case table for `splitAtLastSentenceEnd`.

### T2 · Asset acquisition
**Files:** new `desktop/src/main/voice/voice-assets.ts`, `voice-pin.ts`, `desktop/tests/voice-assets.test.ts`
**Design:** "Main → voice-assets.ts".
Fetch and verify both halves into `<userData>/voice/`: the
`sherpa-onnx-<platform>-<arch>@1.13.7` npm tarball and the pinned Parakeet archive. Follow
`engine/engine-acquisition.ts` — `.unpacking` sibling, `.complete` marker last, rename into
place — with the design's **three stated departures**: `net.fetch` (proxies; the reason is in
`err.message`, not `cause`), a verifier taking `{algo, encoding, digest}`, and a **named,
checked bzip2 decompressor** — this is the app's first `.tar.bz2` and the inherited helper was
only ever verified for `.zip`/`.tar.gz`. Naming the decompressor explicitly with a checked
failure message is **the default, not a fallback** (B18); run the `tar -xf` sanity check on a
small `.tar.bz2` **on this Linux machine** and record the result in the task notes, and state
the Windows/System32 case as unverified-here rather than pretending to have run it.
Pin two things per platform (digest, in-archive relative path). **Export `voiceRoot` and the
resolved addon path** for T4 (B8). `win-arm64` is unsupported (absent from npm); `win-ia32` is
supported.
**Rows:** R1 (the engine arrives as designed — B15), R5, R9, R10. **Check:**
`voice-assets.test.ts` — half-unpacked is never ready, a bad digest reports the exact mismatch
in both digest shapes, a stale pinned layout is caught, progress reaches `unpacking` before
`ready`.

### T3 · macOS packaging and the Android manifest
**Files:** `desktop/electron-builder.yml`, `desktop/assets/entitlements.mac.plist`,
`app/src/main/AndroidManifest.xml`, new `desktop/tests/android-manifest-voice.test.ts`
**Design:** "Packaging (macOS)", "Android → Manifest".
Add `NSMicrophoneUsageDescription` and `com.apple.security.device.audio-input` (without both,
macOS kills the process instead of prompting), and correct the plist's WHY comment, which
claims the file is the byte-for-byte template. Add `RECORD_AUDIO` and the `RecognitionService`
`<queries>` intent — without the second, `isRecognitionAvailable()` is false on every phone
since Android 11.
**Rows:** none on its own (B15 — this task delivers preconditions; R6 is T8's, R20/R21 are
T5/T6's, R1 is T2's). **Check:** `desktop/tests/android-manifest-voice.test.ts` (B19) — a Node
test under vitest, reading `../../app/src/main/AndroidManifest.xml` for both strings, so it
runs in `verify.sh` rather than only under Gradle.

## Wave 2 — depends on wave 1

### T4 · The worker (depends: T1, T2)
**Files:** new `desktop/src/main/voice/voice-worker.ts`, `desktop/tests/voice-rehear.test.ts`,
`desktop/tests/voice-addon-load.test.ts`, new fixture
`desktop/tests/fixtures/parakeet-rehear-ladder.json`
**Design:** "Main → voice-worker.ts".
An Electron `utilityProcess` holding one `OfflineRecognizer`. Load the addon **by the path T2
exports**, inside its own try/catch, forwarding `err.message` verbatim. Queue audio from
`start` until the recogniser exists. Re-hear loop: next pass on completion plus 200 ms, never a
timer; `decodeAsync`; split with **T1's shared helper**; `committed` cumulative and promoted on
commit; commit at any ≥0.8 s pause once past 5 s; hard cut at the quietest 100 ms frame in the
last second. **Acknowledge each pass with its segment length** so T5 can defend a deadline.
**Rows:** R2. **Check:** `voice-rehear.test.ts`, including one case driven by a **recorded real
Parakeet ladder**. The ladder printed in design review 3 is elided (B7), so **this task
regenerates it**: the rig is `docs/active/prototypes/voice-stt-bench/` (its README has the
venv and model setup), and the fixture is committed at the path above with the command that
produced it in its header. A scripted fake is prefix-stable by construction and can never catch
the rewrite this rule exists to contain. Plus `voice-addon-load.test.ts` against a **fake**
addon the test builds, from a temp dir with no `node_modules` on the path.

### T5 · The service, the handlers, and their registration (depends: T1, T2)
**Files:** new `desktop/src/main/voice/voice-service.ts`, `voice-handlers.ts`,
**`desktop/src/main/main.ts`**, `desktop/src/main/preload.ts`,
`desktop/src/renderer/dev/workbench/mock-only.ts`, `desktop/tests/voice-service.test.ts`,
`desktop/tests/voice-silence.test.ts`
**Design:** "Main → voice-service.ts", "voice-handlers.ts".
- **Register the handlers from `main.ts`** beside `registerSocialHandlers` /
  `registerArcadeHandlers` (B1) — without this the six channels exist and nothing wires them,
  and `app.on('before-quit')` has no home. This is the difference between the feature working
  and the feature being dead code.
- **Empty `MOCK_ONLY` of all eight `voice.*` rows in this task** (B2, B3), because the moment
  `preload.ts` gains the channels the "no MOCK_ONLY entry has since gained a real channel"
  guard goes red and would stay red for the rest of the wave.
- The state machine and **exactly one terminal event per `start`**, including the path lost
  twice already: a worker that neither exits nor answers is ended by the deadline derived from
  the acknowledged segment length, killed, and reported with what actually happened. Push the
  **`heartbeat`** while a pass runs (B6). Window lifecycle: `start` records the requesting
  `webContents.id`; a destroyed window cancels and unloads; `before-quit` kills the worker; a
  second window's `start` while listening is refused with a real reason.
- The silence stop (two seconds of sub-floor RMS after speech). **macOS: `voice:start` awaits
  `systemPreferences.askForMediaAccess('microphone')` first** (B15) — this is R21's
  prompt-first half and it lives here, not in T3.
**Rows:** R3 (the stop paths), R12, R21. **Check:** `voice-service.test.ts` — one terminal
event for each of normal stop, cancel (none), worker exit mid-pass, load failure, a throwing
pass, window destroyed, **wedged worker**; second-window refusal. Plus **`voice-silence.test.ts`**
(B10) — no stop before speech, stop two seconds after speech ends, a loud burst resets the clock.

### T6 · Capture and the hook (depends: T1)
**Files:** new `desktop/src/renderer/voice-capture.ts`,
`desktop/src/renderer/hooks/useVoiceInput.ts`, `desktop/tests/useVoiceInput.test.ts`
**Design:** "Renderer".
The worklet built as a Blob URL, posting Int16 and its RMS in one message; the renderer relays
audio to `sendAudio` and **emits the `level` event locally** so the meter never waits on a
round trip. **Both capture and readiness composition are desktop-only**, gated on the bridge
offering `sendAudio` / `micAccess` — on Android `start()` is the bridge call alone, or the
WebView auto-denies `getUserMedia` and the phone shows the desktop's words about "your
computer". Phase flips to `listening` only after capture opened. Start-time
`NotFound`/`NotAllowed` become `unavailable` (the Check-again card), never `error`. The
watchdog arms only when the **heartbeat** stops, and a late `final` after a watchdog error
still delivers its text.
**Rows:** R11, R12, **R14** (the ring follows loudness — the level is emitted here, not by the
worker — B16), R20. **Check:** `useVoiceInput.test.ts` — composition on desktop and its absence
on Android, the Android start path opening no microphone, NotAllowed → V-8's sentence, the
heartbeat-gated watchdog, a late final delivering, events dropped while idle.

### T8 · Android (depends: T1, T3)
**Files:** new `app/src/main/kotlin/com/youcoded/app/runtime/VoiceRecognizer.kt`,
`SessionService.kt`, `MainActivity.kt`, `app/src/test/.../VoiceRecognizerTest.kt`
**Design:** "Android".
`SpeechRecognizer` created on the main Looper (the hop `SessionService` already makes for
`TerminalSession`), with the `RECORD_AUDIO` request delegated to `MainActivity`'s launcher
through the existing prompt path — a Service has no result launcher. Map `onPartialResults` →
`partial` (**grey = since the last sentence mark, a deliberate re-implementation of T1's
helper** — B5), `onResults` → `final`, `onRmsChanged` → `level`, `onError` → `error` with the
error name spelled out. `voice:status` reports `unavailable` with "Microphone permission was
not granted." only after the launcher returned denied. `voice:download` and `voice:mic-access`
reply not-implemented.
**Rows:** R6. **Check:** `VoiceRecognizerTest` with a fake `SpeechRecognizer`, including the
split table shared with T1's cases; `JAVA_HOME=/usr/lib/jvm/java-21-openjdk
ANDROID_HOME=/home/destin/.android-sdk ./gradlew test -x bundleWebUi`.

## Wave 3 — depends on wave 2

### T7 · The shim gate and the rule (depends: T5, T8 — B4)
**Files:** `desktop/src/renderer/remote-shim.ts`, `desktop/tests/ipc-channels.test.ts`, new
runtime predicate test beside `remote-shim-unsupported.test.ts`,
`youcoded-dev/.claude/rules/ipc-bridge.md`
**Design:** "The shim, and the one intentional gap".
Expose `voice` under the shim's own Android predicate
(`location.protocol === 'file:' && !targetUrl`), **and refuse in every `voice.*` method at call
time when `targetUrl` is set** — `setConnectionMode` flips a module variable and does not
rebuild the bridge, so the namespace decision alone leaves a live mic on a phone that pairs to
a desktop mid-session. `status()` answers `unavailable` with the Q-7 reason.
**Write the namespace as an unconditional `voice: { … }` whose methods refuse**, not a
conditional spread (B20): the parity scan is indent-anchored and would not see
`...(androidLocal ? { voice } : {})`. Amend the parity rule's closed exception list with
**three** clauses (`sendAudio`, `micAccess`, the namespace's remote-desktop refusal).
**Rows:** R7. **Check:** the runtime predicate test; `ipc-channels.test.ts` keeps the type
strings and asserts the two method exceptions by name.
**Note:** this task edits a file in the *workspace* repo as well as the app repo; land each in
its own branch, as the workspace rules require.

### T9 · The composer's last mile (depends: T4, T5, T6)
**Files:** `desktop/src/renderer/components/InputBar.tsx`,
`desktop/src/renderer/components/VoiceButton.tsx`,
`desktop/src/renderer/components/InputBar.test.tsx`, new
`desktop/src/renderer/components/VoiceButton.test.tsx`
**Design:** "Renderer", and the deck decisions table.
**Changes no boundary logic** (B5) — it renders the `committed`/`tail` the event carries.
- Guard Enter at the **two keyboard sites**, never inside `send()`; the Send button and the
  "Send anyway" retry both route through `send()` and must keep sending.
- Space-hold: clear the pending timer **and** stop on blur/`visibilitychange`, so the 250 ms
  before the hold arms cannot leak a hot mic.
- Add the **`unpacking`** card branch: a moving, unmeasured bar labelled **"Almost ready…"**.
- Add the **download-failure branch** (B11): the existing card plus the real reason plus a
  **Retry** — the design's R3-6 shape, which no task owned.
- Card copy from the reopen deck: **about 500 MB** (a literal sentence, not `sizeMb`), and
  **"Understands English and 24 other European languages."**
**Rows:** R2 (rendering), R3, **R8**, **R15**, **R16** (B17), R18, R19, **R22**, **R23** (B12).
**Check:** `InputBar.test.tsx` — the draft merge; typing cancels and keeps the typed text;
Enter stops without sending **while the Send button still sends**; Space held 250 ms starts,
release stops, a tap does nothing, Space with text types a space, focus leaving mid-hold stops
it, focus leaving **before** 250 ms leaves it closed. Plus **`VoiceButton.test.tsx`** (B12) —
the card copy for all five states, including the two new sentences and the Retry branch; no
test renders this component today.

### T10 · Leave the workspace findable — **DEFERRED TO THE MERGE SESSION** (2026-09-05)

**Not done, deliberately.** `scripts/audit-anchors.mjs` resolves every `docs/MAP.md` path from
the workspace root, where `youcoded/` is the SHARED checkout — so a MAP row naming this
feature's files fails the nightly audit for the whole window between the workspace branch
merging and the app branch merging. Tried it: 18 paths missing, mechanical pass red. (T7 hit
the same wall and left the rule's `verify:` frontmatter alone for the same reason, naming the
new test in prose instead.)

**So the merge session adds all of this, in the commit that lands `feat/voice-prompting`:**

1. A **subsystem row** in `docs/MAP.md`, after "Local engine & models":
   entry points `desktop/src/main/voice/{voice-service,voice-worker,voice-assets,voice-pin}.ts`,
   `desktop/src/renderer/voice-capture.ts`, `desktop/src/shared/voice-types.ts` (which owns
   `splitAtLastSentenceEnd`, the one grey/solid rule), and
   `app/src/main/kotlin/com/youcoded/app/runtime/VoiceRecognizer.kt`; depth doc
   `docs/active/specs/2026-09-05-voice-prompting-technical-design.md`; guards
   `voice-rehear`, `voice-service`, `voice-silence`, `voice-assets`, `voice-addon-load`,
   `voice-split`, `useVoiceInput`, `VoiceButton`, `remote-shim-voice-gate`.
2. An **on-disk state row**: the voice folder under Electron's userData holds the speech
   engine and its model, fetched once on the first tap (~500 MB), per machine, never synced;
   owner `desktop/src/main/voice/voice-assets.ts`. **Write the folder names without backticks**
   — the auditor reads a backticked fragment as a path and will fail on it.
3. A **hot-path row**: "the mic, and its download / no-microphone cards" →
   `desktop/src/renderer/components/VoiceButton.tsx`.
4. **Decide on a rule.** The workspace ladder prefers a pinning test to a rule, and this
   feature now has nine test files including source-scanning guards for the two invariants that
   no runtime test can see (the production workbench gate; the split's single owner). The
   recommendation is **no `.claude/rules/voice.md`** — the MAP row plus those guards carry it —
   but say so explicitly in the merge commit rather than leaving it unanswered.

## After the build

Feature-flow §8e, in order: the **code reviewer** over the whole branch, then triage, then the
**grader** writing
`voice-prompting.contract.verdicts.json`, then the acceptance deck, then `close-out.sh`.

**The UX tester's second run was DROPPED** (Destin, 2026-09-05: "we can skip the beta tester.
i will test this myself"). Its triage counts are part of §8e's own measurement, so this feature
contributes only a first-run count to that data — say so when the three-feature review happens,
rather than reading the gap as a zero. Everything the tester would have caught, Destin catches
in the same pass, and he is the only one who can judge the parts no rig reaches anyway.

**Not automatable, and Destin's:** the first real dictation. Nothing in this plan has heard a
human voice — every measurement is a recorded file through a headless rig. The design's risks
(the fan on a weak laptop, a long sentence turning most of the box grey, Linux without a
PulseAudio daemon) are what he finds in thirty seconds and no test will.
