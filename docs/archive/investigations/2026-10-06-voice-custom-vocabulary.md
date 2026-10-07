---
status: shipped
date: 2026-10-06
---

# Custom speech vocabulary — implementation checks

Scope: desktop vocabulary hints, not forced transcript replacements. Destin approved the short UI-preview route on 2026-10-06. The UI review must be approved before connecting the real speech backend. No Android recognizer changes in this first slice.

## Verified engine support

The app pins sherpa-onnx 1.13.7 and Parakeet TDT 0.6B v3 int8 (`desktop/src/main/voice/voice-pin.ts`). Before this feature, `createRecognizer` passed `modelType: 'nemo_transducer'` without decoding or hotword options (`voice-worker.ts`). Nonempty saved vocabulary now selects the conservative configuration below; empty lists preserve the prior defaults.

The exact pinned upstream version implements hotword file and per-stream hotword support for NeMo/TDT in `OfflineRecognizerTransducerNeMoImpl`, under `modified_beam_search`:
https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/v1.13.7/sherpa-onnx/csrc/offline-recognizer-transducer-nemo-impl.h

Upstream documents that this requires the decoding mode plus correct modeling units and matching `bpe.vocab`; no retraining is required:
https://k2-fsa.github.io/sherpa/onnx/hotwords/index.html

## Constraints for the backend stage

- The current int8 model repository's root listing has only the three model files, `tokens.txt`, `.gitattributes`, and `test_wavs`. It does not publish `bpe.vocab` there. Do not invent a URL or assume `tokens.txt` can substitute for the tokenizer's merge priorities. Obtain/verify a compatible vocabulary before claiming a working feature.
  Evidence: https://huggingface.co/api/models/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/tree/main (read 2026-10-06).
- There have been upstream reports of bad/empty output with TDT beam search (issue #3267 and PR #3657). The pinned v1.13.7 decoder already forces blank/unknown tokens to advance at least one frame, but still uses a 10-symbol cap and includes duration score on all candidates. This is not proof of a defect in our app, but merits a real audio comparison before enabling vocabulary hints. Do not silently change every recording to beam search.
  Evidence: https://github.com/k2-fsa/sherpa-onnx/pull/3657 and https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/v1.13.7/sherpa-onnx/csrc/offline-transducer-modified-beam-search-nemo-decoder.cc (read 2026-10-06).
- Prefer existing greedy behavior when the vocabulary is empty. Compare recognition, live-pass latency and final-pass latency with a nonempty vocabulary in isolated development before shipping; the existing speech-worker deadlines were measured with the current decoding behavior.
- Android uses Android SpeechRecognizer, not the desktop model. Keep the first feature desktop-only rather than claiming identical recognition support.

## Approved UI and current implementation boundary

Review-2 approved removable chips and Add/Save; review-3 approved microphone right-click directly opening the editor. The Settings card and intermediate menu were not retained. The editor now has a real desktop get/save API backed by `<userData>/voice-vocabulary.json`; the workbench still simulates those API calls. Storage and bridge verification passed independently of speech integration.

## Tokenizer provenance resolved

The original NVIDIA tokenizer vocabulary can be recovered from the first 2 MiB of the uncompressed NeMo archive at revision `541d1f99c6b0c3cd0b11a95167540bb8edefd82b`. Source file `0ee587b5d4b94f48993dcccf9868ea77_tokenizer.vocab` is 101024 bytes, SHA256 `41130ff456706304a1adec782ccc9e003c4d417e8e324353d281be958cac4e17`. All 8192 token IDs and original scores were checked against the downloaded model's token table. This original vocabulary already has the required format; no invented token priorities or model retraining are needed. The model card specifies CC BY 4.0; bundling requires NVIDIA attribution/source/license details. This is a provenance observation, not a legal opinion.

Exact native configuration tested: `decodingMethod: 'modified_beam_search'`, `maxActivePaths: 2`, `hotwordsScore: 0.5`; `modelConfig.modelingUnit: 'bpe'` and `modelConfig.bpeVocab` pointing at the matching vocabulary. Per-stream hints use `createStream(phrases.join('/'))`. All native tests ran against private copied runtime/model files, not the app or its worker.

## Conservative configuration: 204 repeated native decodes

Parent followed the specialist's candidate recommendation with 153 decodes: all 17 prepared fixtures at lexicon sizes 3, 50 and 2000, each repeated three times using score 0.5 / two active paths. Added 51 contemporary greedy control decodes (same 17 fixtures repeated three times). Raw evidence is under `scratch/voice-vocabulary-proof/conservative/`; `comparison.txt` reports actual samples.

| Case | Greedy median, ms | Hints: 3 phrases | Hints: 50 phrases | Hints: 2000 phrases |
|---|---:|---:|---:|---:|
| Names sentence + 2s quiet | 337.2 | 395.3 | 367.0 | 361.8 |
| Ordinary sentence + 2s quiet | 328.5 | 367.9 | 369.7 | 374.8 |
| Public human speech + 2s quiet | 203.8 | 237.9 | 247.7 | 283.1 |

- All three vocabulary sizes repeatedly changed `Nestin` to `Destin` in complete names sentences; ordinary controls preserved their words. Public human speech preserved its words (punctuation differed with 2000 phrases).
- Both low-level and above-service-threshold noise stayed empty with this configuration at every tested vocabulary size. The four-path configuration's `Yeah.` noise output did not occur.
- Maximum measured hinted pass was 465.4 ms, versus the existing 8-second minimum pass deadline. Timings are wall-time observations on this machine, not a cross-device performance promise or end-to-end stop measurement. No deadline increase is supported by these results.
- Isolated synthetic names remained wrong in both greedy and hinted modes. `YouCoded` still does not reliably get joined/cased spelling. Interim prefixes can be malformed even when complete sentences recover correctly. No text replacement or acoustic trimming is approved/implemented as a workaround.
- This is a limited fixture set (synthetic speech plus one public human utterance), not a guarantee for every accent, name or background sound. Choosing conservative defaults is supported; claiming universal accuracy would not be.

Empty vocabulary must retain the existing greedy path. The integrated worker lifecycle and actual Electron transport checks passed, including saving during a recording and the next recording's immutable snapshot (final review record). Merged in youcoded#610; desktop and Android CI passed. Raw scratch evidence was retained outside removed worktrees at `/home/destin/youcoded-dev/scratch/voice-custom-vocabulary-evidence/`.
