---
status: active
date: 2026-09-09
---
# Cache continuation integration seams

Read-only source investigation during implementation planning. Not test evidence.

## Dependency evidence

Branch-local `npm ci --ignore-scripts --no-audit --no-fund` installed 909 packages into initially absent private node_modules. `require('ai/package.json').version` returned 7.0.89; `require('@ai-sdk/openai/package.json').version` returned 4.0.55. No dependency patches or lockfile changes. Install-script-dependent Electron runtime has not been provisioned or launched.

Installed SDK source `ai/src/generate-text/to-response-messages.ts` copies completed content providerMetadata into part.providerOptions and keeps assistant parts ordered. OpenAI `responses/openai-responses-provider-metadata.ts` defines reasoning itemId/reasoningEncryptedContent and text itemId/phase (commentary/final_answer/null). `convert-to-openai-responses-input.ts` reads these fields for store:false. SDK fake-stream next-body tests remain required. Glob ignores node_modules: an initial specialist absence claim was corrected by explicit-path inspection; it is not a blocker.

## Durable mapping

- Harness emitEvent currently generates UUIDs but returns void. Return internal event references without adding fields to public transcript events.
- Text/reasoning stream part IDs may repeat across attempts/steps. Scope origin maps by attempt and part kind/ID; retain emitted UUIDs and ranges.
- SessionStore coalesces deltas under the first delta UUID. References must resolve to that persisted anchor plus exact range/content validation, not a later delta UUID that never reached disk.
- SDK completed assistant messages define ordering; map by provider item IDs/stream references and toolCallId, not rebuilt array indexes. Ambiguity invalidates faithful persistence rather than guessing.
- Abandoned retry text can already exist in JSONL. Only explicitly accepted attempts/parts/ranges belong in the manifest.
- Store readEvents is tolerant and deduplicates. It is unsuitable as a raw transcript integrity/high-water fence.
- Both root and child host append chains catch failures. Awaiting drain alone proves neither success nor open-part flush. Track successful append state and add an explicit reference persistence barrier.
- Validate raw transcript high-water/integrity against the published checkpoint on reopen; later abandoned content also invalidates the old checkpoint.
- A separate durable eligibility revision fences history-only changes (prune/binding/invalidation). Advance eligibility before replacement; failed/oversize replacements and failed unlink must not revive old checkpoints.
- Root restore is native-session-host resume; child restore is resumeChild. Both must validate prompt/tools/config and provider/model/account before faithful seed.
- Host destroy is tab/session teardown, not transcript deletion. It must retain a valid reopen checkpoint. Integrate deletion separately after finding the actual destructive owner; missing transcript invalidates an orphan checkpoint.
- Existing NativeHome appendFile does not fsync. Process-crash windows and power-loss guarantees are different; ordered durable publication needs explicit file persistence ordering if claiming power-loss durability.

## History mutations to cover

Harness seedHistory, setBinding, injectRule, beginTurn user append, pending steers, accepted assistant append, grouped tool result appends, interrupted partial append, maybeCompact and compactNow prune/summary replacements, clearHistory.

Request-only fitToContext must not replace accepted history. Persistent prune needs exact transformations; summary needs compact-summary reference plus explicit retained suffix. Image references re-read and digest-validate actual bytes.

## Roadmap validation

Updated only existing ChatGPT continuation and broad cache entries, preserving unrelated OpenRouter/local backlog. `roadmap-check --fix` returned 0 and clean structure, but reported 12 broken existing claim anchors plus absent marketplace checkout warnings. Its unrelated auto-flips were removed; only native-harness index count correction was retained. These unrelated claim warnings are not treated as feature verification or fixed by this task.
