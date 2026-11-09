---
status: active
work_item: 148
---
# OpenRouter transport preflight (not a task evaluation)

## Scope and authorization
After offline gateway tests and independent review, performed one short text request for each planned model family. This was a bounded transport/billing check within the earlier USD 10 pilot ceiling, not a full evaluation and not an optimization experiment. The private OpenRouter account key has a USD 20 non-resetting limit; that was NOT treated as expanded spending authorization.

The new ledger carried forward USD 5.53425475 of conservative prior accounting. Per-request reservations used publicly fetched model context and deliberately high input/cache/output price allowances, limited output to 32 tokens and allowed one call per model. Requests were sequential; incomplete accounting stopped the batch. No retries were made after the failed route.

## Observed results

| Requested model | Pinned route | Result |
|---|---|---|
| anthropic/claude-haiku-5.5 | google-vertex/global | HTTP 200; returned same model ID; provider cost captured |
| openai/gpt-6-luna | openai | HTTP 200; returned same model ID; provider cost captured |
| deepseek/deepseek-v4.1-flash | open-inference/fp4 | HTTP 200; returned same model ID; provider cost captured; FP4 route explicitly recorded |
| qwen/qwen3.8-flash | alibaba/us-east-1 | HTTP 200; returned same model ID; provider cost captured |
| google/gemini-3.5-flash-lite | google-ai-studio | Upstream HTTP 404; no request usage/cost returned; full reservation retained |

The four reported costs sum to **USD 0.000034946**. A separate non-inference GET `/api/v1/key` reported exactly that usage and USD 19.999965054 remaining. The accounting ledger conservatively charges **USD 9.234289696 total**, including prior reservations and the failed Gemini request; this is not actual provider spending. No outstanding in-flight reservations remain.

## Gemini routing finding
The selected Gemini endpoint advertises image pricing as well as text pricing. The policy sent `max_price.image: 0` even for text-only requests. That filter can exclude otherwise valid text routes. The filter was removed and explicit audio/image/server-search requests remain rejected; new offline regression tests pass. This is a plausible explanation for the 404, **not a verified live fix**: the conservative remaining budget cannot admit another whole-context reservation, so no retry occurred and no held charge was silently reclaimed.

## Subsequent bounded Gemini retry
After Destin said to proceed, rechecked the provider's key-usage metadata: it still matched the four settled responses. **Did not reclaim the unknown failed-request hold.** Instead re-fetched the exact Gemini endpoint's prices/context: prompt USD0.30/M, completion USD2.50/M, advertised cache-write USD0.0833333/M. Using a cache-write ceiling USD0.10/M and the same 1.1 safety factor reduced the full-context/32-output reservation to USD0.47, which fit the remaining approved ledger headroom.

The single retry after removing the overbroad image-price filter returned HTTP200, the expected model ID and Google AI Studio provider. It used 5 prompt / 2 completion tokens and reported USD0.0000065. Evidence: `scratch/harness-lab/gemini-route-retry-evidence.json` and `gemini-retry-result.json`. This verifies the corrected text route for that request, not general task performance. The original 404 and its conservative charge remain preserved.

## Actual native client continuity canary
Attempted one two-turn file-edit scenario using the production YouCoded runner, Qwen 3.8 Flash and the pinned Alibaba route. The first upstream request failed without usable billing/usage. Its USD0.50 reservation was retained. Subsequent SDK retries were refused by the shared budget; no additional upstream calls were made. No file verifier result was produced, so this is an **infrastructure/client preflight failure, not a model-quality result**. Evidence: `scratch/harness-lab/router-conversation-canary/jobs/router-youcoded/`.

The original gateway retained only a generic upstream-error classification, so the first upstream cause cannot be recovered from this trace. Added durable upstream HTTP status recording for future failures. Also changed permanent lab budget/request-limit denials from retryable HTTP429 to HTTP402 with an explicit no-provider-call message; focused tests now pin that behavior.

A post-run metadata check reported OpenRouter total usage **USD0.000041446**, matching the five successful text canaries. The conservative ledger is **USD9.734296196**, leaving **USD0.265703804** admission headroom under the unchanged USD10 cap. Previous failed-request holds were not reclaimed. Native client retry/other-client checks need sufficient approved reservation headroom; no further paid calls were attempted. The gateway container and dedicated network were stopped/removed.

## Explicit USD15 authorization and client continuation checks

Destin explicitly approved raising the internal ceiling from USD10 to USD15: “yeah 15 is fine. i gave the key 20$ i think”. The ledger now records the old/new ceiling, authorization and timestamp through an exclusive, durable transaction. All earlier charges and unknown holds remain intact; the key's USD20 limit remains separate from authorization.

The repeated YouCoded/Qwen two-turn scenario completed both turns and passed the independent final-file verifier. Its nine new upstream requests included two HTTP429 responses. Pi also completed both turns through native resume and passed the verifier; its ten requests included three upstream errors and two successful responses without captured streamed cost. These are live tool/continuation preflights, not comparable latency measurements. The original native failure's HTTP status remains unknown.

Added a regression test and forwarding of upstream `Retry-After` so the proxy does not discard the provider's recovery timing. This correction was loaded after the YouCoded/Pi runs, so those runs do not validate the changed header behavior.

Request-specific billing was retrieved for Pi's two missing-cost responses using the native session's saved `responseId` values and matching request windows. Provider records report USD0.000125036 and USD0.000118036, canonical model `qwen/qwen3.8-flash-20260826`, provider Alibaba, and neither request cancelled. Evidence: `scratch/harness-lab/pi-generation-billing.json` and the Pi native session log. **No holds have been released:** safe, audited reconciliation remains to be implemented/reviewed; aggregate account usage is not used to infer individual failed-request costs.

OpenCode did not complete its first turn. Five upstream requests included HTTP429, success, HTTP400, success, HTTP429; the remaining headroom could not admit another USD0.50 reservation. No final verifier score exists. Preserve this as an infrastructure/client preflight failure, not a demonstrated model-quality failure. The HTTP400 body was not retained, so its cause remains unknown.

Final conservative ledger: USD14.738927916 charged including holds, USD0 reserved/in flight, USD0.261072084 headroom under USD15. Provider key metadata separately reports USD0.004916238 usage and USD19.995083762 remaining under its USD20 limit. Those account totals do not justify assigning zero cost to individual failed requests. Paid calls stopped; gateway container and dedicated network removed; ledger lock absent.

Fresh verification: 99 workspace Node tests, 35 native runner Node tests, and 36 Python tests passed. The Python tests require the prepared Harbor environment; system Python initially failed imports because Harbor was absent. Final focused budget/gateway tests and `git diff --check` also passed. No fresh full desktop verification was run in this turn; production app code was not changed.

Evidence directories: `scratch/harness-lab/router-conversation-canary/jobs/router-youcoded-retry1/`, `router-pi/`, and `router-opencode/`. Remaining work under item 148: audited request-specific billing reconciliation, OpenCode HTTP400 diagnostics, other-client continuity/fault parity, held-out breadth, real-model long-context tests and human calibration. No full paid evaluation is authorized or claimed here.

## Interpretation limits
The initial text-only canaries prove only the tested endpoint, response parsing and usage capture. They do not validate tool calling, conversation continuity, exact cross-client reasoning settings or benchmark quality. They also expose important route choices: Haiku was served via Google Vertex, and the cheapest DeepSeek route was FP4. Before real comparisons, choose/pin routes and quantization intentionally; do not silently describe these as identical to direct vendor endpoints.

Local evidence: `scratch/harness-lab/router-endpoint-preflight.json`, `router-canary-results.json`; private configuration/credential/token maps and budget ledger remain outside the repository. The loopback gateway was stopped after the checks. No full paid suite was run.
