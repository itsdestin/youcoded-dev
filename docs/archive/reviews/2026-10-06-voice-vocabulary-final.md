---
status: shipped
date: 2026-10-06
---

# Final vocabulary review and integrated evidence

Fresh reviewer inspected storage, the desktop bridge/UI, tokenizer packaging and recording/worker lifecycle.

## Findings and disposition

1. **Accepted and fixed — failed retirement start resolved as success.** Waiting for the old worker raced a resolve-only `session.ended` promise. The deadline could emit an error, end the session and then fulfill start, causing the renderer to open microphone capture without a backend session. `Session.terminalError` now records an error before delivery; `start` throws it after the wait, leaving deliberate cancellation silent and avoiding generic rejected completion promises.
   - Before fix: targeted service and real-service-to-renderer tests both failed; the renderer's capture opener was called once after the timeout.
   - After fix: both full test files passed, 65 tests; typecheck exited 0.
   - The reviewer reread the fix and explicitly confirmed it resolves the finding with no new concrete issue.
2. **Accepted — exact bridge line ceilings.** Preload +7, remote refusal namespace +5 and shared contract +3 are the required two-method bridge additions, not unrelated growth. Reviewer deemed the narrow budget decision reasonable.
3. **Found during integration and fixed — terminal event while capture opens.** A fast tokenizer/load error (or final event) could arrive after start IPC fulfilled but before the microphone-open promise resolved. The event closed an empty capture ref; the late microphone then returned to listening. Terminal events now mark an in-flight start aborted, letting the existing late-open cleanup close that handle and retain idle/error state.
   - Two regressions failed before the fix (`cap.closes` was 0, expected 1).
   - Afterward renderer/service/vocabulary test files passed, 82 tests, and typecheck exited 0.
   - Fresh reviewer confirmed this resolves the race with no new concrete issue.

No other concrete findings were reported in storage, immutable snapshots, configuration ordering, stream hotword delivery, platform/API guards or dev/packaged asset paths.

## Actual integrated native pipeline

Ran compiled app code: real `VoiceVocabularyStore` → real `VoiceService` → real `VoiceWorkerCore` → copied pinned sherpa-onnx/Parakeet native bytes. Child-process IPC first exercised the service and worker together. A separate private, headless Electron 41.10.7 test then exercised the actual utility-process transport, sending configuration immediately after fork and start next; native final transcription contained `Destin` and exited 0. Runtime/model/profile test data and processes were isolated in scratch; compiled modules came from this worktree. No installed-app execution, real microphone recording or active user settings were touched.

- Empty saved list: final sentence contained `Nestin`; one worker, one final.
- Saved hints: identical audio produced `Destin`; one worker, one final.
- Clear the saved list during a hinted recording: that recording still returned `Destin`; the next returned greedy `Nestin`. Two workers were spawned sequentially, maximum one live at a time; exactly two finals.

These are recognition hints, not guaranteed spelling, casing or text replacements. `YouCoded` joined spelling and isolated synthetic names were not reliably recognized; the tested native outputs and timing limits are recorded in the investigation. Other accents/devices and packaged Windows/macOS runtime are not validated by this fixture set.

## Final checks

After the review correction, `verify.sh` passed every desktop check: source/test types, related tests/guards, knip, bug/design lint, executable invariants, screen opens and click journeys (`/tmp/voice-vocabulary-final-verified.log`). The final compiled snapshot pipeline again returned `Destin` for the in-progress hinted recording and `Nestin` for the following cleared-list recording, with maximum one live worker and exactly two finals. Actual Electron utility-process transport also returned `Destin` (`/tmp/voice-vocabulary-electron-transport.log`, exit 0; a nonfatal system Fontconfig warning did not affect the test). Documentation audit: 561/561 anchors, 969/969 MAP paths, mechanical pass; pre-existing workspace warnings are not voice failures. Subsequently authorized merge/close: app committed, pushed and merged as youcoded#610 (`47db5f4da6dfd73e3c00514128a5ca72963242bd`), with desktop and Android CI passing. No release or installed-app replacement was performed.
