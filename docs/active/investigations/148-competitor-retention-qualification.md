---
status: active
work_item: 148
---
# Competitor retention qualification

## Configuration and interpretation

The same deterministic 15-user-turn amended-constraint workload used in the native retention probe was run through the four competitor conversation adapters, first-party Haiku and the unchanged shared USD15 estimate-based ledger. Pi, OpenCode and Hermes requested 200000-token context settings through their model configuration. Claude Code requested `--autocompact 200000`, verified in the prepared image's actual 2.1.302 CLI help; that is not a verified context-capacity override. Native compaction policies were not forced to be identical. Each trial had at most20 provider calls and a660-second task limit.

## Initial results

| Client | Turns complete | Final-file verifier | Physical requests | Peak input tokens | Reported cost subtotal USD |
|---|---:|---|---:|---:|---:|
| Pi |15|Passed|17|189825|0.5859397|
| OpenCode |0|Not run|0|Unknown|0|
| Hermes |15|Passed|20|147263|0.6386341|
| Claude Code |15|Passed|18|167672|0.21853232|

Hermes has one request with unknown billed cost; its subtotal is not a complete bill. Peak request usage is measured, but neither peak usage nor successful final files establish the actual configured capacity or automatic compaction. Native lifecycle evidence was inspected independently and then checked by the parent:

- Pi native session JSONL, line29: `type: compaction`, `tokensBefore: 189905`, `fromHook: false`. This establishes a native compaction event; it is not an independently observed total context capacity.
- Claude Code native session JSONL, line123: `type: system`, `subtype: compact_boundary`, `compactMetadata.trigger: auto`, preTokens183169, postTokens19118. This explicitly establishes automatic compaction, not a200k capacity measurement.
- Hermes: no compression lifecycle marker was found in the inspected saved session/text logs. Compression remains unobserved; the passing file outcome is not a substitute for that evidence.

Native trace paths are under the corresponding jobs recorded in results-initial.json. No prose mentions of constraints are used as a substitute for the independent final-file verifier.

OpenCode's first attempt failed locally before any provider call: its installed schema requires `provider.openrouter.models.<model>.limit.output` alongside `limit.context`. A failing regression reproduced the missing field. The adapter now explicitly sets output8192 for the opt-in context profile, with its native reserve implications disclosed; the original failed attempt remains. Full Python tests passed after the correction. A single corrected-config retry uses the same previously unused20-request grant, not a budget/request reset.

Evidence: `scratch/harness-lab/retention-competitors-v1/results-initial.json`, original source snapshot `source/`, corrected OpenCode snapshot `source-opencode-v2/`, and separate Harbor job directories. No full paid comparison or comparative quality ranking is claimed.

## Corrected OpenCode result and final accounting

The corrected `retention-opencode-200k-v2` run completed all15 turns and passed the final verifier, using20 requests, peak input198133 tokens and reported cost USD0.25835309. The saved native SQLite database contains compaction part `prt_15b26ea31001tPpU37aDQgGaM0` with `auto:true, overflow:false`, plus summary message `msg_15b26ea3b001PMwVnqx7H4Nk6X` with `summary:true, finish:stop`. This is native automatic-compaction evidence, not merely a keyword in assistant prose. The original zero-call schema failure remains preserved.

`results-final.json` consolidates all four competitor outcomes. All four passed the long-history file task; native compaction markers are observed for Pi, OpenCode and Claude Code, while Hermes compression remains unobserved in saved evidence. Requested context capacities remain unconfirmed by independent runtime readback for competitors; the compaction policies are not equivalent.

Total shared accounted exposure after qualification: USD2.6827640954 including earlier estimates, leaving USD12.3172359046 estimated headroom. Zero pending reservations and no ledger lock remained. This closes bounded competitor retention qualification, not the full comparison configuration or broad behavioral parity.
