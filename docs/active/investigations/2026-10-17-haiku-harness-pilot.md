---
status: active
work_item: 148
---
# First live harness pilot — Anthropic Haiku only

## Authorization and bounds
Destin authorized a $10 pilot, then supplied an Anthropic key whose account limit is $200 and explicitly required Haiku-class models. $200 was NOT treated as a spending authorization. The key was entered through a masked local dialog into a private directory; it was never printed or put in command arguments/environment. Live test model: `claude-haiku-5-5`, confirmed available with the Anthropic Models API before inference.

Published pricing and model limits were read from https://platform.claude.com/docs/en/about-claude/pricing and the Models API: maximum input 1,000,000, maximum output 128,000. Highest input cache-write price $1/MTok, highest output price $2.50/MTok; including a 1.1 geography allowance gives a conservative token-only ceiling of $1.452 per request. No paid server tools were enabled. Initial admission reserved $2/request for at most four requests; later runs reserved $1.50/request for at most six requests. Runs were sequential. Before another run, complete observed token usage was charged at the pessimistic maximum rates; accumulated upper estimate plus the next reservation remained below $10. Unknown usage would stop further testing. This is a controlled pilot envelope, not a claim that the general-purpose runner enforces arbitrary model prices.

## All attempts
Harbor 0.24.0, actual Docker task environment, real production NativeSessionHost, clean headless profile. Times below are Harbor agent execution, excluding container/dependency setup and verification. Cache was not reset between trials: shared prefixes were warm on later tasks.

| Task | Outcome | Model requests | Agent seconds | Input + output tokens | Cached input (included in input) |
|---|---|---:|---:|---:|---:|
| Create requested file — initial setup | Adapter failure before model dispatch | 0 | 0.62 | 0 | 0 |
| Create requested file | Verifier passed | 3 | 4.35 | 40,821 | 26,965 |
| Fix average function — four-request cap | Request limit reached; verifier did not run | 4 | 6.76 | 56,628 | 54,667 |
| Fix average function — fresh run, six-request cap | Verifier passed | 3 | 5.30 | 41,872 | 40,543 |
| Reconcile conflicting sources | Verifier passed | 4 | 7.29 | 56,125 | 54,242 |

14 model requests in total. Rate-card token estimate: **$0.00632507**. Deliberately pessimistic token-cost upper estimate across all observed usage: **$0.21916345**. Anthropic did not report billed dollars in these responses; neither figure is an invoice. Estimates include the capped unsuccessful coding attempt. The initial setup failure dispatched no model request.

## What the live tests revealed
1. **Lab defect, fixed:** a clean profile seeds local/OpenRouter providers only. The worker tried saving an Anthropic key before registering that provider. The worker now upserts the explicitly selected provider before saving its key; offline contract test added.
2. **Lab defect, fixed:** empty worker stderr overwrote its structured failure message. The launcher now preserves the original error and appends stderr; offline test added.
3. **Observed tool friction:** in the capped coding attempt, Haiku read a file through Bash, then attempted Edit without a registered Read. It subsequently used Read and retried. The fresh run completed in three requests. Do not attribute the improvement to the higher cap: the second run needed fewer requests anyway, illustrating run-to-run variation.
4. **Observed fixed payload:** the simple file task's requests each carried 6,753 system bytes and 30,377 tool-schema bytes; first input occupancy was 13,444 tokens. Later steps reused cache. This supports testing selective schema exposure and clearer edit prerequisites, not weakening read-before-edit safety or claiming that fewer raw tokens necessarily means a lower bill.

## Evidence and limits
Local raw records: `scratch/harness-lab/haiku-pilot/`; calculated summary: `scratch/harness-lab/haiku-pilot-summary.json`; analysis script: `scratch/harness-lab/summarize-haiku-pilot.py`. These may contain task transcripts and remain private scratch evidence. The external verifier checked resulting files/state; user-facing clarity has not received blinded human grading.

This is three easy public task types with a small number of attempts and changing safety caps, **not a representative benchmark, a controlled optimization A/B, or a competitor ranking**. No competitor inference was run. Before comparing competitors with the higher-limit credential, ensure their requests are also Haiku-only and governed by the same cumulative spend envelope, rather than relying on CLI model defaults or the $200 account limit.
