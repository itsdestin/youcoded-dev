---
status: shipped
date: 2026-10-06
---

# Custom voice vocabulary implementation plan

> Executed test-first; merge/close authorized after independent review. App merged in youcoded#610 (`47db5f4da6dfd73e3c00514128a5ca72963242bd`).

**Goal:** make the approved microphone-right-click chip editor persist desktop vocabulary and use those phrases as real Parakeet recognition hints.

**Architecture:** profile-local vocabulary storage, two desktop-only voice channels, and a per-recording snapshot for the speech worker. Empty vocabulary keeps existing greedy decoding. Nonempty hints must use verified matching tokenizer assets and a measured safe decoder path; no automatic transcript replacements.

**Stack:** shared React renderer, Electron IPC table, async Node filesystem with the existing mkdir-lock/atomic-write utility, sherpa-onnx 1.13.7 / Parakeet TDT v3 int8.

## Approved UI and limits

- review-2 S-4 and L-5 approved removable chips/Add/Save.
- review-3 L-6 approved microphone right-click directly opening the editor; no Settings row and no intermediate menu.
- Desktop only. Android speech behavior stays unchanged; unsupported requests reject rather than resolve a fake value.
- Vocabulary is local to this install/profile, not synced. Changes affect the next recording, not a recording already in progress.
- Invalid or unreadable stored data must surface a real error, never silently look empty. Only a missing file means no vocabulary.
- Save validates an array of strings, trims surrounding whitespace, ignores empty strings, deduplicates case-insensitively, and preserves the first spelling. Bound total storage and reject control characters/engine hotword delimiters before sending phrases into engine configuration.

## Task 1 — local storage with pinning tests

Files: new `youcoded/desktop/src/main/voice/voice-vocabulary.ts`, `youcoded/desktop/tests/voice-vocabulary.test.ts`.

Interface: `VoiceVocabularyStore(userDataPath).read(): Promise<string[]>`, `.save(value: unknown): Promise<void>`; storage at `<userData>/voice-vocabulary.json`.

- [x] Write failing tests for missing-file empty, persistence across store instances, Unicode phrase preservation, whitespace/duplicate normalization, empty-array clearing, invalid payload refusal, corrupt-file read refusal, and two writes producing a complete atomic JSON document.
- [x] Run `npx vitest run tests/voice-vocabulary.test.ts` and observe red (missing module).
- [x] Implement bounded async reads and `mutateFileUnderLock` writes; reject incompatible version and malformed data. No import-time I/O, sync filesystem calls, or silent catches.
- [x] Rerun storage tests: 19 tests passed; desktop typecheck exited 0. Storage review completed; both findings fixed with regressions.

## Task 2 — real desktop bridge and approved editor

Files: `shared/voice-types.ts`, `shared/backend-contract.ts`, `main/ipc/voice.ts`, `main/voice/voice-handlers.ts`, `main/preload.ts`, `renderer/remote-shim.ts`, `renderer/components/voice/{VoiceVocabulary.tsx,vocabulary-preview.ts}`, `renderer/components/VoiceButton.tsx`, workbench mock files; relevant IPC/renderer tests.

Interface: optional desktop `voiceVocabulary: { get(): Promise<string[]>; save(phrases: string[]): Promise<void> }`; channels `voice:vocabulary-get` / `voice:vocabulary-save`, both `desktopOnly`.

- [x] Pin real read/write IPC behavior and desktop-only policy; add optional namespace methods without exposing vocabulary UI on Android. The remote shim explicitly rejects both vocabulary calls.
- [x] Instantiate the store at voice startup and bind table handlers; regenerate preload channel list with `node scripts/generate-preload-channels.mjs`.
- [x] Replace preview-only bridge with typed real vocabulary bridge; keep the exact approved editor and direct-right-click behavior.
- [x] Move workbench fake under the real voiceVocabulary bridge and remove the corresponding MOCK_ONLY entry. Keep realistic empty/stress practice data.
- [x] Focused IPC/store/phone policy checks: 427 tests passed. Vocabulary UI: 15 tests passed. Typecheck exited 0. Workbench boot check: all 16 routes mount. Combined final desktop verification passed.

## Task 3 — real-engine proof, then speech integration

Files: `main/voice/{voice-worker.ts,voice-service.ts,voice-assets.ts,voice-pin.ts,voice-handlers.ts}` and their existing tests; a focused recognizer helper may be extracted to keep capped files from growing.

- [x] Probe in scratch confirmed native fields, original compatible tokenizer, name improvements and controls. Conservative parent check: 204 repeated decodes, fixed score 0.5 / two paths; no false words on the tested noise inputs.
- [x] Bundle original 101024-byte tokenizer with attribution and SHA256 verification; no model redownload. Missing/tampered resource tests passed.
- [x] Read/copy/freeze preferences at start; changed configuration retires the old worker and waits for its exit before spawning a new one. Save during a recording only changes the next recording.
- [x] Test-first assertions cover snapshot/reload, empty greedy compatibility, native stream hints, cancellation/start ownership, queued audio/Stop and terminal-event counts.
- [x] Existing deadlines retained: observed hinted passes below 466 ms versus the existing 8-second floor; no evidence supports a guessed deadline increase.
- [x] Strong boosting was rejected based on false words. Conservative setting preserves tested complete controls while improving Destin; no replacements, trimming or universal accuracy claim. Implementation merged to app master in youcoded#610; no release or installed-app replacement.

Transport decision: vocabulary uses one ordered utility-process message before start, not argv, because valid saved lists can exceed Windows' command-line limit. Argv holds only userData and the absolute bundled tokenizer path. Both real native service/worker pipeline and actual Electron utility-process transport were verified in isolated scratch processes.

## Task 4 — verification and fresh review

- [x] Final `verify.sh` after the review fix: all desktop checks passed, including types, related tests/guards, knip, lint, invariants, screens and journeys.
- [x] Fresh code review completed. Failed-start retirement timeout and terminal-event-during-capture-open races were reproduced red, fixed and rereviewed as resolved. Final focused renderer/service/vocabulary files: 82 tests passed; full final desktop verification passed.
- [x] Final renderer screenshots checked in both stress themes, including empty/stress/narrow. Real compiled store/service/worker/native pipeline proved immutable mid-recording hints, next-recording greedy reset and maximum one live worker. Actual Electron 41.10.7 utility-process message order/native transcription also passed in a private headless test without microphone or running-app access.
- [x] Decision ledger, final review and evidence updated; documentation anchor audit passed. App committed, pushed and merged in youcoded#610 with desktop and Android CI passing; no release or live configuration changes. Windows/macOS packaged installers and other accents/devices remain outside the verified Linux fixture set.
