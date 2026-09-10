---
status: active
date: 2026-09-09
type: investigation
tags: [cache, prompt-caching, kv-cache, compaction, openrouter, anthropic, local-engine, cost, competitors]
---

# How other harnesses handle the eight cache breakers, and the best version for YouCoded

Companion to `docs/active/handoffs/2026-09-09-cache-efficiency-followups-START-HERE.md`
(the eight items) and `docs/archive/investigations/2026-08-17-cache-efficiency.md` (provider
rules and the stable-prefix playbook). This document answers three questions Destin asked on
2026-09-09: how do Hermes, pi, Unsloth Studio, OpenCode and others handle these problems, what are
the trade-offs, and what is the best version we can build.

**Method.** Seven parallel read-only researchers on 2026-09-09: one each for Hermes Agent
(NousResearch/hermes-agent @ `cfdbbb6e`), pi (earendil-works/pi, formerly badlogic/pi-mono, @
`400d6905`), Unsloth Studio (unslothai/unsloth `studio/` @ `7436c103`), OpenCode
(anomalyco/opencode @ `859106eb`); one breadth survey of Claude Code (official docs plus
leak-derived write-ups, marked as such), OpenAI Codex CLI, Cline, Roo Code, Goose and Crush; one
pass over the current OpenRouter, OpenAI, DeepSeek, llama.cpp and Anthropic docs; and one
read-only check of what YouCoded's installed libraries can already do. Every claim below carries
its source. Nothing in YouCoded was changed.

---

## Plain-language summary

**Nobody has all eight solved, but every one of the eight has been solved well by somebody.**
The best version for YouCoded is a combination, not a copy of one product.

- **The Anthropic discount (item 1)** is switched on by every serious harness except us. The
  common shape is: one marker on the system prompt, one on the last tool, one on the newest
  message. Our installed library already supports all of it, including the one-hour lifetime.
  Claude Code gives the main conversation a one-hour lifetime because people pause between
  messages. We should do the same for the chat lane.
- **Local models (item 2)** are where Unsloth Studio is far ahead of everyone, including the
  coding agents. Its rule is "compaction is an event, not a slope": it drops whole turns at
  once, remembers where it cut so the cut does not creep forward every reply, and over-trims by
  a quarter of the window so the next many replies reuse the cache untouched. It also turns off
  llama.cpp's silent context rotation and saves the model's memory to disk when unloading. We
  do the opposite on every count today.
- **Trimming old tool results (item 3)** is done best by Hermes: it only cuts when it can
  reclaim a meaningful batch, then arms a "do not cut again until the chat has grown by X"
  gate. Claude Code taught the industry a lesson here by accident: it put a timestamp inside
  the replacement text, so every pass rewrote different bytes and broke its own cache.
- **Summaries (item 4)** are appended as a new message and old history is hidden, never
  deleted, in pi, OpenCode, Roo, Crush, Goose and Hermes. Claude Code and Codex add the trick
  that matters most for cost: the summary request re-sends the same conversation with one
  "summarize" message on the end, so it reads the warm cache at a tenth of the price instead
  of paying full price for a fresh prompt.
- **Routing keys (items 5 and 6)** are verified against current docs. OpenRouter wants a
  top-level `session_id` field (or `x-session-id` header). The `user` field does nothing for
  routing. Sticky sessions last ten minutes of inactivity. Cline sends the field, Crush and
  OpenCode send the header. Codex derives sub-lane keys as `"<purpose>:<parent id>"`, which is
  exactly the fix item 5 proposes.
- **Tool list stability (item 7)**: Hermes freezes the tool list per session and announces
  changes as an appended message. Claude Code defers MCP tools and models mode switches as
  tools so definitions never change. Our Task tool should stop embedding the roster in its
  description.
- **The Reuse chip (item 8)**: Claude Code's `/usage` line is the model to beat: percent from
  cache, number of misses, "expected rebuilds" (compaction, tool-result clearing) counted
  separately from surprises, whether the cache is warm, and a likely cause. Hermes rebases its
  hit rate after each compaction or model switch so the number describes now, not history.

**Recommended order:** the four small backend fixes (6, 5, 7, 1) plus one measurement change
first, then one design pass that treats items 2, 3 and 4 as a single "compaction is an event"
policy, then item 8 as a UI decision for Destin. Details and evidence follow.

---

## Item 1. Anthropic prompt caching is never requested

### What others do

| Product | Breakpoints | TTL | Side calls (summary, title) | Via OpenRouter |
|---|---|---|---|---|
| pi | every system block, last tool, last block of last user message (3; 4 in OAuth mode) | 5m default, `1h` when `cacheRetention: "long"` | `cacheRetention: "none"` plus fresh session id, so no cache write | same scheme, only for `anthropic/*` ids |
| Hermes | static system prefix, end of system, last 2 non-system messages (4); tools marker only on direct API | one TTL for all markers, 5m default, 1h opt-in; falsy disables | auxiliary client never marks | yes, envelope layout |
| OpenCode | first 2 system messages + last 2 messages | none set (5m) | not exempt: title and summary calls get markers too | yes, and Bedrock, Copilot, openai-compatible |
| Goose | system, last tool, lookback positions; test asserts exactly 4 | 5m | not verified | n/a |
| Crush | last tool, last system, last 2 messages | 5m | n/a | n/a |
| Roo Code | system + last 2 user messages | 5m | n/a | via LiteLLM path |
| Cline (SDK) | last user message's last text part only | 5m | n/a | provider-option buckets |
| Claude Code | stable-first layers: system+tools, project context, appended system notices, moving marker on last message | **1h for the main conversation on a subscription**, 5m on API key and for subagents/compaction/titles | 5m | n/a |

Sources: pi `packages/ai/src/api/anthropic-messages.ts:64-78, 1063-1108, 1373-1394`,
`compaction.ts:587-593`, issue #583; Hermes `agent/prompt_caching.py:1-6, 85-145`,
`agent_runtime_helpers.py:1481-1530`, PR #23828 ("97.09% of the first-call write was read on the
second call"), issue #57845 (missing markers on tool messages re-billed ~60% of a session);
OpenCode `packages/opencode/src/provider/transform.ts:357-403`, PR #1305; Goose
`cache_semantics.rs:85-100`; Crush `internal/agent/agent.go:680-682, 843-853`; Roo
`src/api/providers/anthropic.ts:98-135`; Cline `ai-sdk.ts:411-419`; Claude Code
https://code.claude.com/docs/en/prompt-caching and https://code.claude.com/docs/en/costs.

### Trade-offs

- **One marker on the newest message** (Cline) is the minimum that works: a breakpoint caches
  everything before it, tools and system included. Weakness: when the tail changes (compaction,
  prune, a retry) there is no separate read point for the expensive static prefix.
- **System marker + tail marker** (pi, Hermes, Crush, Goose) protects the static prefix
  independently. This is also Anthropic's own recommended "robust combination for agent loops".
- **Two trailing markers** (Roo, OpenCode, Hermes) guard against long turns that push the
  previous entry past the 20-position lookback. On the Claude API consecutive tool_use and
  tool_result runs each count as one position, so this is rarely needed; it costs a slot.
- **Marking side calls** (OpenCode) is a pure surcharge: a one-shot summary prompt writes a cache
  entry nobody reads. pi's `none` policy is the correct default.
- **TTL.** A read refreshes the timer on either TTL. 1h costs 2x on the *newly written delta*
  each turn; 5m costs 1.25x. A 5-to-60-minute pause on 5m re-writes the *whole* prefix. For a
  chat where humans think between messages, 1h wins after roughly one pause per forty turns.
  For rapid tool loops under five minutes per step, 5m is strictly cheaper. Claude Code chose 1h
  for the human-facing conversation and 5m for machine lanes.

### Best version for YouCoded

1. **Direct Anthropic:** an explicit breakpoint on the last system block via
   `providerOptions.anthropic.cacheControl` (render order is tools → system → messages, so tools
   are covered), plus Anthropic's top-level automatic `cache_control` for the moving tail. The
   installed `@ai-sdk/anthropic` 4.0.45 supports system, part, tool and request-level markers
   and `ttl: '5m' | '1h'`; it caps at 4 and warns (`dist/index.js:1068, 1254, 2484, 3985`).
2. **Via OpenRouter:** per-part markers are not reachable through `@ai-sdk/openai-compatible`
   (its converter has no cache_control path), but OpenRouter documents top-level automatic
   `cache_control` for the Anthropic, Vertex, Azure and Bedrock providers. Pass it as a
   top-level body field through `providerOptions.openrouter`, which the installed provider
   spreads verbatim into the body (`@ai-sdk/openai-compatible/dist/index.js:582-583`). Gate on
   the model id, as pi does (`anthropic/` prefix), so other models never receive it.
3. **TTL policy per lane:** chat lane `1h`; specialist lanes `5m` (they are short loops and cold
   by nature); summary and naming lanes **no marker at all**. Longer-TTL entries must come
   before shorter ones in one request, so the system block carries the lane's TTL and the
   automatic tail inherits it.
4. **Minimums:** 512 tokens on Opus 5 / Fable 5.x, 1024 on Sonnet 5 / Opus 4.8, 4096 on Opus
   4.6 and Haiku 4.5. Measure our system prompt size per binding before assuming the marker
   caches; below the minimum it silently does nothing, which is harmless.
5. **Sequence:** land after item 7 and before the design pass. Caching pays only if the prefix
   stays still; items 3 and 4 moving it does not make caching *worse* than today, so there is
   no reason to hold item 1 hostage to the design work.

**What users experience:** Claude conversations get up to ten times cheaper on the repeated part
from the second message on. Nothing visible changes. Risk: for API-key users in rapid tool
loops the 1h write premium adds roughly 0.75x on each turn's new tokens; the per-lane split
keeps that off specialist lanes. Prove it with a fake-fetch test asserting marker placement per
lane and none on summary/naming, and with the diagnostics (below) showing reads on turn two.

---

## Item 2. Local models: the trimmer runs before compaction

### What others do

**Unsloth Studio is the only product in this survey that engineered local context handling
around the KV cache.** Everything below is from `studio/backend/` at `7436c103`.

- Launches `llama-server` with `--no-context-shift` ("Error out at n_ctx instead of silently
  rotating the KV cache"), `--kv-unified` when `--parallel > 1` so one chat can use the whole
  window, `--slot-save-path` (KV saved to disk on idle unload via `/slots/{id}?action=save`,
  restored on next load), `--flash-attn on`, optional `--cache-ram` and `--ctx-checkpoints`;
  every flag probed against `llama-server --help` first. Relies on the default
  `cache_prompt=true`; never passes `--cache-reuse` (`core/inference/llama_cpp.py` ~22413-22700,
  28166, 28308).
- Context length: Auto picks the largest window that fits VRAM up to the model's native length,
  floor 8192 (`_fit_context_to_vram` ~21235-21290). Reply reserve for fitting is
  `min(max_tokens, context_length // 4)`, i.e. at most a quarter of the window
  (`context_window.py:283`).
- Fitting: drops **whole turn groups** oldest-first (a user turn plus its replies; a tool call
  plus its results), never splits a pair. Always protects system messages, the latest user
  turn and the last group. **`sticky_dropped` replays the boundary the thread last compacted
  to** ("Without it the fit is stateless… so the boundary slides every reply"), and
  `_COMPACTION_HEADROOM_RATIO = 0.25` over-trims "so compaction is an occasional event the
  prefix cache can survive" (`context_window.py:16-24, 1089-1116`). Exact token counts come
  from llama-server `/apply-template`, not chars/4.
- A second policy, "checkpoint", resets to `[system + standing instructions] + [newest user
  turn]` and moves dropped turns into a searchable local archive with a `search_conversation`
  tool; the user sees an inline "This conversation got long, so it was compacted" notice
  (`checkpoint.py:14, 47`, `compaction-notice.tsx:48-58`).
- Tool results are budgeted **at ingestion** against room actually left
  (`tool_result_budget`, `context_window.py:342`), and a tool is refused outright if the prompt
  can no longer fit a reply.

Others: Hermes compresses reactively on a context-length error, sends `num_ctx` to Ollama, can
grow a Hermes-managed llama.cpp window instead of compressing, normalizes whitespace and
tool-call JSON for "bit-perfect prefixes across turns (KV-cache reuse on local servers)"
(`turn_request_assembly.py:174-175`); no `--cache-reuse`, `id_slot` or `n_keep`. pi has no
trimming at all, only compaction with a 16,384-token reserve. OpenCode reserves
`min(20_000, maxOutputTokens)`. Codex compacts at 90% with a 95% hard cap and lets users declare
`model_context_window` for local models. Crush skips summarization when the window is unknown
"to avoid immediately truncating custom/local models".

llama.cpp facts (tools/server/README.md, fetched 2026-09-09): `cache_prompt` defaults to true;
`--cache-reuse N` is "min chunk size to attempt reusing from the cache via KV shifting… (default:
0)", so salvaging a shifted prefix is **off** unless set; context shift is off by default in
current builds; `--cache-ram` (default 8192 MiB) keeps evicted prompts in RAM with
`--cache-idle-slots`; the response `timings` block reports `cache_n` (prompt tokens reused) and
`prompt_n` (prompt tokens actually processed).

YouCoded today (read-only check, engine pin `b10665`): flags are `--no-webui --jinja
--models-dir --models-max [--spec-default] [--cache-type-k q8_0] [--models-preset | --sleep-idle-seconds -c]`.
No `--cache-reuse`, `--no-context-shift`, `--cache-ram`, `--slot-save-path`, `--parallel`,
`--kv-unified`; no `cache_prompt`, `id_slot` or `n_keep` in any request; `fitToContext` trims
by message with chars/4 estimates and collapses to the newest message when the budget goes
negative (`engine-supervisor.ts:536-577`, `harness-session.ts:1219-1318` in the shared checkout).

### Trade-offs

- **Reactive compression on overflow** (Hermes, pi) is simple and provider-agnostic, but each
  overflow costs a failed request plus a summary call, and small windows overflow constantly.
- **Proactive trim with a sticky boundary and headroom** (Unsloth) keeps the KV prefix valid for
  many turns at the cost of dropping more than strictly necessary at each event. For local
  models, where a full re-prefill is the dominant latency, this is the right trade.
- **Checkpoint reset + archive** (Unsloth) avoids any summarizer cost or failure and gives the
  model a retrieval tool instead of a lossy summary, but relies on the model choosing to search.
- **`--cache-reuse`** (no surveyed product uses it) lets llama.cpp salvage a prefix that shifted
  by a few hundred tokens via KV shifting. It is a position shift, valid for RoPE models, and
  cheap to try because `timings.cache_n` measures the effect directly.
- **`--slot-save-path`** trades disk writes (Unsloth chmods the dir 0700 because "Saved KV
  encodes chat content") for surviving idle unloads without a re-prefill.

### Best version for YouCoded

1. **Order the constants so compaction always fires first.** Reply reserve becomes
   `min(maxTokens, ctx / 4)` (Unsloth's rule; OpenCode's is `min(20k, maxOutput)`). The
   compaction trigger must sit below `ctx − reserve − margin`, and `fitToContext` becomes an
   emergency floor that should never fire in steady state. Size `maxTokens` per window instead
   of a flat 16,000.
2. **Trim whole turn groups to a sticky boundary with headroom.** Record the boundary in the
   accepted-history transformation (the store already reproduces pruned text; a boundary index
   is smaller). Over-trim by a quarter so the boundary moves rarely. Protect system, the newest
   user turn and the last group. Never emit an orphan tool result or opener.
3. **Count tokens exactly** for local models via llama-server `/tokenize` or `/apply-template`
   rather than chars/4; the negative-budget collapse on 8k-16k models is a correctness bug and an
   estimator problem, not only a cache problem.
4. **Engine flags:** add `--no-context-shift` explicitly (pins current default behaviour), try
   `--cache-reuse 256` as a measured experiment, and consider `--cache-ram` so a specialist's
   prompt does not evict the chat's KV. `--slot-save-path` is worth a look only after the idle
   timers are revisited; it writes chat content to disk and needs the same privacy handling as
   the diagnostics file.
5. **Read `timings.cache_n` and `prompt_n`** from every local response into diagnostics. This is
   the local equivalent of `stablePrefixItems` and the only way to prove any of the above.
6. Offer Unsloth's **checkpoint policy** as a later option for tiny windows, not as the default.

**What users experience:** local replies start faster after the first few turns because the
engine stops re-reading the whole conversation each step; battery use drops; tiny models stop
"forgetting everything but the last message". Risk: over-trimming drops more history at each
event than today; the summary step must run first so the dropped turns are summarized, not lost.

---

## Item 3. Rolling prune rewrites old history every step past 75%

### What others do

| Product | When | Boundary | Replacement | Default |
|---|---|---|---|---|
| Hermes | inside compression, plus opt-in proactive prune | **pinned with hysteresis**: commit only if ≥ 4096 tokens reclaimed, then re-arm at `after + runway` | `[Old tool output cleared to save context space]`; dedupes byte-identical results; retires old images | proactive prune off |
| OpenCode | once at the **end of each prompt loop**, forked | sliding, token-based; protect 40,000 tokens after 2 user turns; commit only if reclaim > 20,000 | literal `[Old tool result content cleared]`; `skill` outputs never pruned | **off** |
| Claude Code | microcompact, plus a time-based pass after ~90 min idle (leak-derived) | not found | sentinel **with an embedded timestamp**, which made repeat passes write different bytes and bust its own cache (CLIProxyAPI #3398) | on |
| Goose | when eligible tool pairs exceed cutoff + 10 | batches of 10 oldest pairs, protect last N | LLM summary of the batch | opt-in |
| Codex | at record time | n/a | middle-out truncation to 10,000 bytes per tool output | on |
| Unsloth Studio | at ingestion | n/a | results budgeted against room left; completed tool *arguments* replaced by a short receipt | on |
| pi | none in core | community plugin prunes only when the agent sends a final text reply | | |

Sources: Hermes `agent/context_compressor.py:651-661, 2308-2310, 2843-2900` ("Every commit
breaks the prompt-cache prefix; require a meaningful reclaim batch so fires are episodic");
OpenCode `compaction.ts:271-317`, `prompt.ts:1338`, `message-v2.ts:293-296`, issues #16285,
#14825, #24108; Claude Code https://blog.kubesimplify.com/claude-code-leak-what-the-source-actually-teaches;
Goose `compute_tool_call_cutoff`; Codex `protocol/src/openai_models.rs:1006`; Unsloth
`context_window.py:342`, `llama_cpp.py:~806`.

Note: YouCoded's constants (protect 40,000, minimum savings 20,000, 2,000 chars) match
OpenCode's exactly, but OpenCode runs its prune once per turn and ships it off by default;
ours runs at the top of every step.

### Trade-offs

- **Per-step sliding** (ours) reclaims tokens earliest but rewrites the prefix on most steps.
- **Turn-boundary, batched, hysteresis** (Hermes, OpenCode) turns pruning into a rare event. Cost:
  a few more steps run with bloated context before the cut.
- **Truncate at record time** (Codex, Unsloth) needs no later rewrite at all and is
  cache-perfect, but loses detail the model might have wanted two steps later. Both approaches
  compose: cap at ingestion, prune the survivors rarely.
- **Constant sentinel text** is not optional. Claude Code's timestamped sentinel is the cleanest
  documented example of an invisible self-inflicted miss.

### Best version for YouCoded

1. Run `pruneToolOutputs` **once per turn**, after the tool loop ends (OpenCode's placement),
   never at the top of a step.
2. **Pin the boundary** at a message index once chosen; move it only when the budget demands, and
   only if the move reclaims at least `minPruneSavings` (Hermes's hysteresis). Record the index
   in the accepted-history transformation so reopen reproduces it.
3. **Constant sentinel**, no timestamp, no counts. Keep the existing 2,000-char stub.
4. **Cap oversized results at record time** (Codex-style middle-out at a per-tool byte limit,
   with the spill path the tool already writes) so fewer prunes are ever needed.
5. Keep `skill`-style protected tools out of pruning, as OpenCode does; decide the list.

**What users experience:** nothing visible; fewer surprise cost spikes mid-conversation and
faster local steps. Risk: a run of huge tool outputs inside one turn is not pruned until the turn
ends, so the ingestion cap in step 4 is what protects small windows.

---

## Item 4. Summaries replace the first message

### What others do

| Product | Summary lands as | Old history | Summary request shape | Cost shown |
|---|---|---|---|---|
| pi | new appended `CompactionEntry` with `summary`, `firstKeptEntryId`, `usage`; context rebuilt as system → summary → kept tail | kept in session file, re-summarized iteratively | separate call, `cacheRetention: "none"`, fresh session id | stored on entry; optional "Compaction (~$x)" notice |
| OpenCode | new user message with `compaction` part, then assistant message `summary: true`; `filterCompacted` reorders at read time | kept in store | separate call, `tools: {}`, `system: []`, one user message | rolls into session cost |
| Hermes | summary inserted as a new assistant message after a protected head of 3; system prompt gets a one-line note on first compaction only | soft-archived rows, searchable | separate auxiliary call, structured template | recorded as auxiliary usage in DB only |
| Roo Code | user message flagged `isSummary`; "fresh start" from it | kept | separate call | condense row with cost in chat |
| Crush | new assistant message `IsSummaryMessage`, role rewritten to user at read | kept in DB | separate | added to session cost |
| Goose | originals become user-visible but not agent-visible; summary the reverse | kept | separate; on overflow drops tool responses in 0/10/20/50/100% steps | |
| Codex | history **replaced** by the user's own messages (≤ 20,000 tokens) plus a prefixed summary | full rollout file kept | **same history plus the compact prompt appended** | telemetry only |
| Claude Code | summary replaces history; project context reloaded from disk | on-disk JSONL | **"same system prompt, tools, and history… plus a summarization instruction appended as a final user message"**, so it reads the warm prefix | counted in `/usage` as an "expected rebuild" |

Sources: pi `docs/compaction.md`, https://earendil.com/posts/compaction-in-pi/; OpenCode
`compaction.ts:552-573`, `message-v2.ts:521-572`; Hermes docs
`context-compression-and-caching.md`; Roo `context-management/index.ts:171-192`; Crush
`agent.go:1702-1714`; Goose `context_mgmt/mod.rs:137-148`; Codex `build_compacted_history`,
`prompts/templates/compact/prompt.md`; Claude Code https://code.claude.com/docs/en/context-window.

Also available: Anthropic's server-side compaction beta (`compact-2026-01-12`,
`context_management.edits: [{type: "compact_20260112"}]`) on Fable 5.x, Opus 5/4.8/4.7/4.6,
Sonnet 5/4.6 via the direct API only; the API returns a `compaction` block the client must echo
back. Not reachable through OpenRouter.

### Trade-offs

- Position 0 changing is unavoidable in the model's view: whatever the stored shape, the next
  request after a summary is a full miss. Every product accepts one miss per compaction. What
  differs is (a) how rare compaction is, (b) whether the **summary call itself** is cheap, and
  (c) whether the cost is visible and the history recoverable.
- **Warm-prefix summary request** (Claude Code, Codex): the summary call re-sends the identical
  system, tools and history and appends one instruction, so nearly all of it is a cache read at
  0.1x. The alternative (pi, OpenCode, Hermes, ours) rebuilds a fresh prompt and pays full price
  for the entire history once more. On a 150k conversation that is the difference between ~15k
  and ~150k billed tokens for the summary.
- **Retained tail** (pi 20k, OpenCode 2k-15k clamp, Hermes 2.5% of window): keeps the model's
  recent working memory verbatim. Ours already keeps `keep`.
- **Server-side compaction** removes the extra call for Claude but is beta, direct-API only,
  and changes the accepted-history model.

### Best version for YouCoded

1. Keep the summary **appended with a hidden boundary** in the accepted-history manifest
   (summary reference plus explicit retained range, as the shipped design already specifies)
   rather than physically replacing index 0. The wire view still starts with the summary; the
   store stays append-only and reopen-safe.
2. **Reshape the summary request to reuse the warm prefix**: same system text, same tools, same
   history, plus one user message asking for the structured summary. Same cache key on ChatGPT,
   same `session_id` on OpenRouter, same Anthropic breakpoints. This also resolves most of item
   5 (below). Guard against the model calling a tool instead of summarizing by instructing
   text-only output and treating a tool call as a retry with tools removed.
3. **Count the summary call** in a visible bucket ("summaries") in session totals; never fold it
   into the turn silently, never hide it.
4. Make compaction rare via items 2 and 3, and record each compaction as an "expected rebuild"
   event for item 8.
5. Revisit Anthropic server-side compaction as a direct-API option once the above is stable.

**What users experience:** the "conversation got long" moment costs a fraction of what it does
today, and the cost chip stops under-reporting. Risk: the warm-prefix summary carries the full
tool list, so the summary model must be told plainly not to use them.

---

## Item 5. ChatGPT summary requests share the conversation's cache key

### What others do

- **Codex:** `prompt_cache_key` = override, else `"{source}:{parent_thread_id}"` for internal
  sub-sessions, else the session id; the guardian lane uses `guardian-v2:{thread_id}`
  (`core/src/client.rs:491-503`). This is the derived-key pattern item 5 proposes.
- **pi:** summaries and branch summaries go out with `cacheRetention: "none"` and a fresh
  `uuidv7()` session id, so they neither read nor pollute the chat's routing.
- **Hermes:** a content-addressed `prompt_cache_key` (hash of static instructions + tool schemas
  + a rotation-stable scope id) sent only to `api.openai.com` and the Codex Responses path
  (`agent/prompt_cache_scope.py:1-10`).
- **OpenCode:** `promptCacheKey = sessionID` for OpenAI, Azure, xAI, Mistral, Venice; the
  compaction call shares it.

OpenAI docs (developers.openai.com/api/docs/guides/prompt-caching, fetched 2026-09-09):
`prompt_cache_key` "replaces the `user` field" for cache routing; cached states "live on
individual machines, where traffic above 15 requests per minute can lead to overflow routing";
routing hashes the initial tokens including tool definitions. GPT-5.6+ adds
`prompt_cache_options.ttl` (only `30m`) and explicit `prompt_cache_breakpoint` markers, and
starts charging cache writes at 1.25x.

### Best version for YouCoded

- **If item 4's warm-prefix summary lands, keep the same key**: the summary is then the same
  conversation plus one message, and sharing the machine is exactly what you want.
- **Until then, derive `${sessionId}:summary`** (Codex pattern) and keep naming keyless. Pin it
  in `tests/chatgpt-model.test.ts` on the captured summary body. The diagnostics already lane by
  purpose; only the wire key is missing.

**What users experience:** nothing visible; the chat lane stops losing its machine to a
summary with a different front.

---

## Item 6. OpenRouter gets no sticky session identifier

### Verified facts (openrouter.ai/docs/guides/best-practices/prompt-caching, api-reference/overview, fetched 2026-09-09)

- OpenRouter already applies **provider sticky routing** after a cached request, keyed by
  hashing "its first system or developer message and its first non-system message".
- Explicit control is **`session_id`**: "as a top-level request body field or through the
  `x-session-id` header", at most 256 characters. "When `session_id` is set, sticky routing
  activates on any successful request — even before cache usage is observed."
- Sticky sessions **expire after 10 minutes of inactivity**; each success resets the timer.
- The **`user` field is not a routing key**; it exists for abuse detection.
- `provider.order` / `provider.only` / `allow_fallbacks: false` hard-pin and override stickiness.
- Anthropic-style `cache_control` passes through; top-level automatic caching is supported for
  Anthropic, Vertex, Azure and Bedrock providers. A marked text block becomes a
  `prompt_cache_breakpoint` on supporting OpenAI models.
- Usage carries `prompt_tokens_details.cached_tokens`, `cache_write_tokens` (explicit-cache
  models only), `cost`, and a `cache_discount` (negative on writes, positive on reads).
  `usage.include` is deprecated and has no effect.
- DeepSeek, OpenAI, Gemini 2.5+, Grok, Moonshot, Groq cache automatically through OpenRouter;
  Anthropic and Qwen need explicit markers.

### What others do

Cline sends `session_id` in the JSON body (`builtins.ts:89`). Crush sends `x-session-id` and
`x-session-affinity` headers with a hashed session id (`agent.go:1509-1515`). OpenCode sends
`x-session-affinity` and `X-Session-Id` on every request (`request.ts:185-196`). pi has
`sendSessionAffinityHeaders` **off by default**. Hermes sends none, only provider preferences and
its own `X-OpenRouter-Cache: true` response cache.

### Best version for YouCoded

- Send **`session_id` as a top-level body field** via `providerOptions.openrouter` (verbatim
  passthrough in the installed provider; no fetch override needed). Chat lane = session id;
  specialists = their child session id; summary = same id under item 4's warm-prefix shape,
  else `${sessionId}:summary`; naming = none.
- Document that an explicit provider pin overrides stickiness, and that the ten-minute idle
  expiry means a user returning after lunch may land on a different upstream regardless.
- Read `cache_write_tokens` and `cache_discount` through the existing `openRouterCostExtractor`
  so the chip can distinguish writes from reads on OpenRouter (feeds item 8).
- Prove with a fake-fetch test: field present and stable across two requests of one session,
  different across sessions, absent on naming.

**What users experience:** DeepSeek and Claude conversations through OpenRouter stop paying a
fresh cache write when OpenRouter's router happens to pick another server. This is the exact path
behind the original "50% reuse" question.

---

## Item 7. The Task tool's description is rebuilt from the live roster every turn

### What others do

- **Hermes:** `get_tool_definitions()` is built at init and memoized on registry generation +
  config fingerprint. Mid-session MCP reload keeps existing tools in their slots, drops
  removed ones, appends new ones at the tail, and **appends a user message announcing the change
  "so the prefix cache survives"**; the CLI warns before `/reload-mcp` that it invalidates the
  cache (`model_tools.py:190-199`, `tools/mcp_tool_agent.py:99-135`).
- **Claude Code:** MCP tools are deferred by default (`defer_loading` stubs + tool search), so a
  server connecting "only appends new content"; plan mode is `EnterPlanMode`/`ExitPlanMode`
  tools so "tool definitions never change"; `/reload-plugins` refuses without `--force` if it
  would force a full re-read (https://claude.com/blog/lessons-from-building-claude-code-prompt-caching-is-everything).
- **pi:** additive changes use native deferred loading on Claude 4.5+ and tool-search items on
  GPT-5.4+; removals fall back to a full resend; a `promptSnippet` change rebuilds the system
  prompt and is a full miss by design (`docs/extensions.md:2380-2404`).
- **Codex:** MCP changes set a pending flag that is claimed at a single gate before a turn, so
  the list changes only at turn boundaries (`core/src/session/mcp_refresh.rs`).
- **Crush:** tools built once per agent; reset on model/agent switch.
- **OpenCode:** resolves tools every step, sorted by name; the code openly asks Anthropic to
  `drop_block` because "opencode re-renders parts of that prefix between turns".

Anthropic also ships `tool_addition` / `tool_removal` blocks (Opus 5 onward, beta
`mid-conversation-tool-changes-2026-07-01`) for cache-preserving tool changes on the direct API.

### Best version for YouCoded

1. **Make the Task tool's definition roster-independent.** The description should say how to
   delegate, not list who exists; the schema should accept a specialist id string validated at
   call time rather than enumerating ids. The roster then arrives as content the model reads:
   the existing `list: true` on-demand path, plus an **appended message** when the roster
   actually changes mid-session (Hermes's announcement).
2. If the roster must stay in the definition, **snapshot it per session** (or per `setBinding`),
   dirty-check like `syncSkillTool` and `syncMcpTools` already do, and apply changes only at a
   turn boundary (Codex's gate).
3. Pin with a test: a catalog reload mid-session leaves the serialized tool set byte-identical.

**What users experience:** hiring or editing a specialist mid-chat no longer silently re-bills
the whole conversation once. Risk: if the description stops naming specialists, the model must
learn the roster from the announcement or the list call; the first turn after a hire should
include the announcement.

---

## Item 8. The Reuse chip hides the requests that wasted the most

### What others do

- **Claude Code `/usage`:** per-model input, output, cache read, cache write with dollars, and a
  `Prompt cache (main)` line: `14 requests · 91% of input tokens from cache · 2 misses (…310.2k
  tokens re-cached) · 1 expected rebuild (compaction or tool-result clearing) · warm (1h TTL,
  last activity 40s ago)` plus `likely cause: tool definitions changed`. `/model` asks for
  confirmation only while the cache is warm. Statusline exposes `cache_read_input_tokens` and a
  `prompt_cache` object (https://code.claude.com/docs/en/costs).
- **Hermes:** status bar `◎ NN%` hit rate **since the last model switch or compression**
  (falls back to lifetime), coloured good ≥ 70 / warn ≥ 40 / bad; per-call log line
  `cache=read/prompt (NN%) write=N upstream=…`; startup prints the caching policy
  (`cli_status_bar_mixin.py:55-70, 308-335`).
- **pi:** footer `↑in ↓out R<read> W<write> CH<hit% of latest turn> $cost context%`; `/session`
  splits input into cached and written; opt-in **miss notices** above a 1,024-token noise floor
  attributing each miss to a > 5-minute idle gap or a model change, plus compaction cost lines
  (`cache-stats.ts:5-30`).
- **Goose:** `Cost: $x (tokens: in N (R cache read, W cache write), out M)` and a context bar.
- **Roo Code:** cache reads/writes, total cost including subtasks, and a condense row per
  compaction with its cost.
- **Unsloth Studio:** per-message tooltip with first-token time, prompt-eval time and speed, and
  `Cache hits` from llama.cpp's `cache_n`, hidden when zero; profile page "Cached tokens: N (P%
  of input)".
- **OpenCode:** context % and dollars always visible; cache read/write only in a desktop tab and
  the `stats` CLI. Two issues (#18440, #36749) show mis-costed cache writes producing "$4
  estimated, $20 real".

### Trade-offs

- A **single cumulative percentage** (ours, OpenCode) is honest but unexplainable: it cannot
  separate one 150k re-read from a mediocre session, and it mixes cold specialist lanes in.
- **Rebasing after compaction/model switch** (Hermes) makes the number describe the current
  regime. It hides how much the compaction cost unless that is shown separately.
- **Expected vs unexpected** (Claude Code) is the framing users can act on: "1 expected rebuild"
  is reassurance; "2 misses, likely cause: tool definitions changed" is a bug report.
- **Per-turn miss notices** (pi) are the most diagnostic and the most noisy; pi ships them off.
- **Hiding zero** (Unsloth) means a user never sees "0 reused" as a warning.

### Best version for YouCoded (backend now, UI via the feature flow)

Backend, no UI change:
- Record per request: read, write (Anthropic `cacheCreationInputTokens`, OpenRouter
  `cache_write_tokens`, llama.cpp `cache_n`/`prompt_n`), lane, and a **classification**:
  `hit`, `expected-rebuild` (compaction, prune commit, model switch, TTL/idle gap > 5 min or
  > 10 min on OpenRouter), or `unexpected-miss` with the diagnostics' first-differing index as
  the likely cause. Extend the ChatGPT prefix-diff observer to the OpenRouter, Anthropic and
  local lanes; the comparison is provider-agnostic at the SDK boundary. On direct Anthropic,
  send the `cache-diagnosis-2026-04-07` beta on every request and record `cache_miss_reason`.
- Keep the chip's total but add the inputs a breakdown needs: parent vs specialists vs summaries
  vs naming, and the current-regime rate since the last rebuild.

UI options for Destin's deck (not decided here):
1. **Tooltip breakdown** on the existing chip: "91% from cache · 1 expected rebuild · 0 misses ·
   warm" plus parent/specialists/summaries rows. Smallest change; discoverable only on hover.
2. **Current-regime number on the chip, lifetime in the tooltip** (Hermes). Makes the visible
   number responsive to fixes and regressions; changes what the chip means today.
3. **Inline transcript notices** for unexpected misses only, above a noise floor (pi). Most
   informative, most intrusive; should be opt-in.
4. A **"What the assistant was given" panel row** (the approved session-context panel already
   planned) listing rebuilds and misses per turn, leaving the chip alone.

**What users experience:** the number finally explains itself, and a regression in any of the
other seven items becomes visible instead of silent. Risk: exposing writes and misses invites
questions on providers where writes are normal; the expected/unexpected split is what keeps the
signal honest.

---

## Cross-cutting: the design principle and the sequence

Three products state the same principle in different words. Unsloth: "compaction is an EVENT,
not a slope." Hermes: "Every commit breaks the prompt-cache prefix; require a meaningful reclaim
batch so fires are episodic." Anthropic's own guidance: get the ordering right and caching works
for free; get it wrong and no marker helps. Items 2, 3 and 4 are one policy: **decide rarely, in
batches, at turn boundaries, to a recorded boundary, and reuse the warm prefix for the summary
call.**

Recommended sequence, each step separately reviewable and provable offline with existing fakes:

| Step | Items | Size | Proof |
|---|---|---|---|
| A1 | 6: `session_id` on OpenRouter; capture `cache_write_tokens`/`cache_discount` | small | fake-fetch body assertion |
| A2 | 7: roster-independent Task tool, snapshot + announcement | small | byte-identical tools after catalog reload |
| A3 | 5: derived summary key (or same key once B3 lands) | small | captured summary body |
| A4 | 1: system breakpoint + automatic tail, per-lane TTL, none on side calls; direct and OpenRouter | small | fake-fetch marker placement per lane |
| A5 | 8 backend: classify every request hit / expected-rebuild / unexpected-miss across all lanes; `cache_n` for local | small-medium | diagnostics tests |
| B1 | 2: reserve = min(maxTokens, ctx/4); compaction below trim budget; exact local token counts | design | unit tests at 32k and 8k windows: compaction fires before any trim; prefix byte-stable across three steps |
| B2 | 3: turn-boundary prune, pinned boundary with hysteresis, constant sentinel, ingestion cap | design | prune commits ≤ 1 per turn; pruned bytes identical across steps |
| B3 | 4: appended summary with hidden boundary; warm-prefix summary request; visible summary bucket | design | summary request prefix byte-identical to the chat request minus the last message |
| B4 | 2: `--no-context-shift`, `--cache-reuse` experiment, `--cache-ram`, turn-group sticky trim | design | `cache_n` ≥ prior prompt size on consecutive local steps |
| C | 8 UI: choose among the four options on a deck | UI | feature flow |

Things this survey did **not** find anyone doing that we should still avoid: per-step pruning
(only we do it), rebuilding a tool description from mutable state per turn (OpenCode does; it is
the fragile pattern), and timestamps in replacement text (Claude Code's regression).

---

## Confidence and gaps

- Hermes, pi, OpenCode, Unsloth Studio, Codex, Roo, Goose, Crush and the Cline SDK were read
  from source at the commits named above; file:line cites are from those clones in the session
  scratchpad and will drift.
- Claude Code's official behaviour is from docs fetched 2026-09-09; its microcompact internals
  (sentinel text, 90-minute idle pass, protected window) are leak-derived from secondary
  write-ups and unverified against source.
- Cline's legacy "system + last two user messages" pattern no longer exists in its current
  tree; older tags would show it.
- OpenCode's side-call markers and pi's absence of KV handling are inferred from code paths,
  not observed on the wire.
- Whether Anthropic's cache diagnostics beta passes through OpenRouter is unverified and
  probably not (OpenRouter strips Anthropic-only betas; ai-sdk-provider issue #111).
- YouCoded line numbers above are from the shared checkout on 2026-09-09, which was 43 commits
  behind `origin/master` when read; the handoff's line numbers are from master. Mechanisms
  agree; re-check lines before editing.
- No runtime measurement was taken. Every recommendation names the test or diagnostic that would
  prove it.
