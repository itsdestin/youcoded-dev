---
status: active
work_item: 148
---
# Offline tool-schema attribution

## What is established

The completed YouCoded harness baseline contains59SDK requests across18trials with content-free request-shape measurements. Each included6753system bytes and30377tool-schema bytes; history ranged560–7080bytes. Aggregated schema bytes were1792243of2347276recorded bytes (76.35%). These are JSON UTF-8 byte measurements at the SDK boundary, not provider tokens, network wire traffic or avoidable charges. Cache reads/writes and required capabilities prevent interpreting this share as cost savings.

## Per-tool reconstruction — separate evidence, not an exact historical match

An offline synthetic run used the frozen `objective-comparison-v3/desktop/dist` runtime and a disposable copy of its lab observer. The only instrumentation added content-free per-tool names, byte counts and hashes. It used a private temporary HOME/fixture, a scripted provider, and the frozen worker's fetch prohibition before importing createRuntime. No paid/provider calls were made and no original snapshot or app file changed. The synthetic tool writes were limited to its disposable fixture.

The reconstruction produced22tools totaling30202bytes. This is175bytes smaller than the historical30377-byte schemas, and none of the59historical schema hashes matched. Therefore the table below describes **the reconstructed offline tool set**, not a proven byte-identical breakdown of the paid baseline. Frozen runtime code was used with the current isolated checkout's installed dependencies; their historical byte identity and the environment-dependent schema difference remain unresolved.

| Tool | Reconstructed serialized bytes | Share of reconstructed tool list |
|---|---:|---:|
| Task | 6096 | 20.18% |
| Bash | 3616 | 11.97% |
| Grep | 2372 | 7.85% |
| MoveComment | 2226 | 7.37% |
| AddComment | 2097 | 6.94% |
| SendUserLink | 1365 | 4.52% |
| SendUserFile | 1287 | 4.26% |
| Edit | 1229 | See machine-readable report for the complete list |

The helper also computes the serialized-byte difference when all `description` keys are removed from a cloned representation:21192bytes. This is an accounting decomposition only. No descriptions were removed from the actual toolset, and this is **not a proposed optimization or expected saving**: many descriptions encode behavior, permissions and safety contracts.

## Recommended next experiment

Start with an offline review of duplication within the Task schema/description, because it is the largest reconstructed entry. Do not remove Task, disable comments/search/permissions or choose capabilities from knowledge of held-out answers. Preserve parameter requirements, delegation restrictions, background follow-through and privacy/safety instructions. A candidate should exist only if the same contract can be stated more compactly and existing contract tests remain green.

Then preview a small targeted plan using DEVELOPMENT tasks rather than the now-inspected held-out set. Smoke tests establish integration; confirmation repeats establish whether a promising change retains correctness. Pair baseline/candidate on model, provider, fixtures, reasoning policy and execution mode. Log bytes, known token usage, cache behavior, requests, verified results and timing separately. Until per-tool attribution is captured in the actual future run, do not describe this reconstruction as its exact historical payload.

No production optimization or paid experiment was performed for this investigation.

## Reproducibility

- Helper: `scratch/harness-lab/run-tool-schema-attribution.mjs`.
- Pure attribution function: `scratch/harness-lab/tool-schema-attribution.mjs`.
- Result: `scratch/harness-lab/tool-schema-attribution-v1.json` (fresh output required; refuses overwrite).
- Command: `node scratch/harness-lab/run-tool-schema-attribution.mjs` → exit0,22tools,30202bytes,0historical hash matches.
- Assertions cover Unicode byte accounting, empty-list framing, per-tool/list reconciliation, successful synthetic execution and preservation of separate historical fingerprints. Temporary runtime/profile/fixture copies are removed afterward.
