---
status: shipped
date: 2026-10-06
---

# Vocabulary storage review

Fresh reviewer inspected `main/voice/voice-vocabulary.ts`, storage tests and `artifacts/cas-write.ts`.

1. **Accepted — save-path bounded reading.** The shared helper read an entire existing file before the store checked its size. Added an optional current-document reader, invoked inside the helper's existing lock. Vocabulary supplies its bounded byte reader, preserving behavior for existing callers. Regression initially failed on an observed `fs.readFile` call; now passes.
2. **Accepted — invalid UTF-8.** Replacement decoding admitted changed phrases and could allow overwriting a corrupt document. Vocabulary now decodes with `TextDecoder('utf-8', {fatal:true})` on both read and in-lock save paths. Regression initially resolved a replacement character instead of rejecting; now rejects and preserves the original bytes.

Verification: `npx vitest run tests/voice-vocabulary.test.ts tests/artifacts/cas-write.test.ts`: 43 tests passed across 2 files. `npm run typecheck`: exit 0. These results verified storage, not recognition. Subsequent real-engine proof and independent final review completed; app merged in youcoded#610.

## Bridge budget decision for final review

The approved get/save bridge adds only its required entries to the two door surfaces and their one contract: preload +7 lines (including 2 generated channel constants), remote shim +5 lines (explicit refusal namespace), contract +3 lines (two channel names and one typed namespace). Increase those exact ceilings rather than compressing readable code or introducing unsupported relative imports in sandboxed preload. Implementation and this narrow budget decision must be checked by the fresh final reviewer before completion. No unrelated sections are expanded.
