---
status: active
date: 2026-09-09
type: handoff
tags: [cache, prompt-caching, chatgpt, openrouter, anthropic, local-engine, cost]
---

# Cache efficiency follow-ups — START HERE

A new session picks this up to investigate and resolve the eight remaining ways YouCoded defeats provider prompt caching. Everything below was verified against `youcoded` master at commit `05149b01` (2026-09-09, after PR #461 merged); re-check line numbers before editing, the mechanisms are what matter.

## Why this exists

Providers only give the cache discount (10x cheaper input on Anthropic, near-free on DeepSeek, cheaper on OpenAI) when the **start** of a request is byte-for-byte identical to a recent request. Anything that changes an early byte re-bills everything after it. YouCoded's native harness already gets the big things right — the system prompt is frozen for a session's life, tool order is stable, history is append-only in the common case — and PR #461 fixed the two ChatGPT-specific problems (dropped reasoning metadata every turn; the per-turn status rewrite, which master also retired in #456). What is left is below, ordered by what it costs the user.

**Read next:** `docs/active/investigations/2026-09-09-cache-efficiency-competitor-survey.md` — how Hermes, pi, Unsloth Studio, OpenCode, Claude Code, Codex, Cline, Roo, Goose and Crush handle each of the eight items, with verified provider docs and a recommended "best version" and sequence per item. It refines several fixes below (warm-prefix summary requests, OpenRouter `session_id` as a body field, roster-independent Task tool, per-lane TTL).

Authority and history: `docs/archive/investigations/2026-08-17-cache-efficiency.md` (the original four-provider study, provider cache rules, the "stable-prefix playbook"), `docs/archive/specs/2026-09-08-chatgpt-cache-efficiency-design.md` (what shipped in #461 and its privacy constraints), `docs/roadmap/native-harness.md` → "Cache efficiency" (the open roadmap item this handoff serves). Destin's framing when he asked for this list: *"is there anywhere that users may be upset with us for wasting their money or otherwise breaking cache?"*

## Ground rules for the session

- Read `CLAUDE.md`, `docs/MAP.md` → Native runtime (harness) and the new "ChatGPT cache continuation & diagnostics" row, and `.claude/rules/native-runtime.md` before editing. Start with `node scripts/workspace-start.mjs --session cache-followups youcoded`.
- Never touch Destin's running app. No paid or live model calls without his explicit approval; every fix below is provable offline with the existing fakes.
- **Measure, don't assert.** The Stage 1 diagnostics (`<userData>/private-diagnostics/chatgpt-cache/requests.jsonl`, summarised by `youcoded/desktop/scripts/chatgpt-cache-summary.mjs`) record per request whether the prefix was `identical`, `append`, `edit` or `remove` relative to the previous request in that lane, plus `stablePrefixItems`. For ChatGPT, that file is the ground truth for whether a fix worked. There is no equivalent for OpenRouter yet — item 6/8 may want one.
- Prefer small, separately reviewable branches: items 1, 5, 6, 7 and 8 are each a small change; items 2, 3 and 4 need one design pass over compaction and trimming together. Do not bundle the design work with the small fixes.
- Every history mutation in `harness-session.ts` must keep calling the accepted-history capture (`this.capture.*`), or durable continuation silently stops publishing for that session. `tests/harness-accepted-history.test.ts` pins the current sites; add to it.

## The eight items

Paths are under `youcoded/desktop/`. "Who pays" is what the user loses.

### 1. Anthropic prompt caching is never requested (biggest dollar item)

- **What:** Anthropic's cache is opt-in per request: a `cache_control: { type: 'ephemeral' }` marker on the block to cache from. YouCoded never sends one, direct or via OpenRouter. `rg -c 'cache_control|cacheControl' src/main/harness src/main/providers` → 0. The direct factory is bare `createAnthropic({ apiKey })(binding.modelId)` (`src/main/providers/provider-registry.ts` ~L387); the request is assembled at `src/main/harness/harness-session.ts` ~L2564-2595 with no `providerOptions`.
- **Who pays:** OpenRouter and direct-Anthropic dollars, every step of every Claude conversation, at 1.0x instead of 0.1x for the whole prefix.
- **Fix:** small mechanism, gated on design. Put one breakpoint on the system block via the ai SDK's `providerOptions.anthropic.cacheControl` (render order is tools → system → messages, so the system breakpoint caches tools too); consider a second at the end of the previous turn. Mind Anthropic's minimums (512–4096 tokens depending on model), max 4 breakpoints, 5-minute TTL (1-hour costs 2x to write). A single unreused write costs MORE than no caching, so do not add breakpoints to one-shot lanes (summary, naming). It only pays off if items 3 and 4 stop moving the prefix — sequence accordingly.
- **Prove it:** a fake-fetch test that captures the outgoing Anthropic body and asserts exactly where `cache_control` sits and that summary/naming requests carry none.

### 2. Local models: the request trimmer runs before compaction (most user-visible)

- **What:** `fitToContext` (`harness-session.ts` ~L1374-1420) drops the oldest messages for the outgoing request whenever the estimate exceeds `budgetTokens = contextLength − maxTokens − 1024` (~L1376). `maxTokens` is hard-set to 16,000 (`src/shared/harness-manifest.ts` ~L76). On the default local window of 32,768 (`src/main/engine/engine-config.ts` ~L39) trimming starts at 15,744 tokens, while compaction only triggers at 0.75 × 32,768 = 24,576 (`harness-session.ts` ~L1472). In that band every request is re-trimmed from a moving front edge, so llama.cpp re-prefills from token 0 each step. `--cache-reuse` is never passed (`src/main/engine/engine-supervisor.ts` ~L540-577), so a shifted prefix is a total KV miss.
- **Worse:** under ~17k of real window (any 8k/16k-trained GGUF; real window = min(loaded, GGUF max) at `engine-manager.ts` ~L94) `budgetTokens` goes negative and the request collapses to the newest message only (`kept.length > 0` gate ~L1388) or `salvageOversizedTail` (~L1432). That is a correctness bug, not only a cache bug.
- **Who pays:** local time and battery — a full re-prefill of the whole window per step.
- **Fix:** design change. Order the constants so compaction always fires first (trigger below the trim budget), make `fitToContext` a true emergency floor, trim to a stable anchor when it must, and pass `--cache-reuse` (or the equivalent for the pinned llama.cpp) so a small shift is salvageable. Size `maxTokens` per window rather than a flat 16k.
- **Prove it:** unit tests over `fitToContext`/`planCompaction` with the real constants (32k and 8k windows) asserting compaction fires before any trim and the outgoing prefix is byte-stable across three consecutive steps.

### 3. Rolling prune rewrites old history once a chat passes 75% full

- **What:** `maybeCompact` runs at the top of **every step** (`harness-session.ts` ~L2126 inside `turnLoop`). Past `triggerRatio 0.75`, `pruneToolOutputs` (`src/main/harness/compaction.ts`) runs each step and its protected window is recomputed from the current tail (`protectedFrom`), so the cutoff slides forward and one more old tool result is truncated to 2,000 chars per step — a mid-prefix edit that invalidates everything after it. Constants at `harness-session.ts` ~L1472-1475: `protectedTokens` 40,000 for ≥100k windows else 0.4 × ctx; `minPruneSavings` 20,000 / 0.1 × ctx; `pruneToChars` 2,000. On a 200k model the first triggering step rewrites ~110k tokens at once. Prune is idempotent on already-pruned parts and returns untouched messages by identity (PR #461), so it is not a rewrite-everything loop, but every boundary advance is a fresh edit.
- **Who pays:** ChatGPT quota, OpenRouter dollars, local time.
- **Fix:** design change, together with item 2. Pin the prune boundary to a message index once chosen (only move it when the budget actually demands), prune in batches at turn boundaries rather than per step, and record the boundary in the accepted-history transformation so reopen reproduces it (the store already recomputes pruned text exactly via `prunedToolResultText`).

### 4. Summaries replace the first message

- **What:** `this.history = [{ role: 'user', content: '[Earlier conversation summary]\n' + summary }, ...keep]` at `harness-session.ts` ~L1546 (auto) and ~L1694 (manual /compact). Position 0 changes, so nothing is reusable on the next request. It also fires an extra model call whose tokens are deliberately not folded into the turn's usage (~L1809-1813), so the chip never shows it.
- **Who pays:** everyone, once per summary, plus the uncounted summary call.
- **Fix:** design change. Two honest options: (a) accept the one-time cost but count it (fold summary usage into a visible bucket) and make summaries rarer via items 2/3; (b) the playbook's rule 4 — fork a new logical request lineage for the compacted conversation rather than editing in place. (a) is cheap; (b) is real design work.

### 5. ChatGPT summary requests share the conversation's cache key

- **What:** `prompt_cache_key` is the session id, threaded from `harness-session.ts` ~L2075 → `provider-registry.ts` ~L437 → `src/main/providers/chatgpt-model.ts` ~L133. The auto-summary reuses the same model object with a different instructions block (`harness-session.ts` ~L1782, prompt at `compaction.ts` `summarizePrompt`); `compactNow` builds a fresh model with the same `cacheKey` (~L1676). OpenAI routes by that key to the machine holding the cache, so the summary's unrelated prefix lands on the chat's machine. Naming is clean (no `cacheKey` → no key sent, `src/main/ipc-handlers.ts` ~L2846) and specialists have their own key (child session id).
- **Who pays:** ChatGPT plan quota (the summary call is billed and uncounted) plus whatever routing benefit the chat lane loses.
- **Fix:** small. Derive `${sessionId}:summary` for the summary model (and keep naming keyless). The diagnostics already separate lanes by purpose (`chatgpt-request-diagnostics.ts` lane id = hash(sessionId:purpose)); only the wire key is missing. Pin it in `tests/chatgpt-model.test.ts` by asserting the `prompt_cache_key` on the captured summary body.

### 6. OpenRouter gets no sticky session identifier

- **What:** the OpenRouter client is built with only `HTTP-Referer` and `X-Title` (`provider-registry.ts` ~L60, used ~L345). No `user`, no session id, no `prompt_cache_key`; `opts.cacheKey` is honoured only on the ChatGPT branch (~L249). OpenRouter's own docs list "request drifted to a different provider endpoint" as a cache-miss cause; a stable per-session id pins the conversation to the endpoint holding the cache. This is the exact path behind Destin's original DeepSeek "50% reuse" question.
- **Who pays:** OpenRouter dollars — a drifted request pays a full cache write again.
<!-- claim: {"path": "youcoded/desktop/src/main/providers/provider-registry.ts", "contains": "HTTP-Referer"} -->
- **Fix:** small. Send the session id as the OpenRouter session/user field (check current OpenRouter docs for the field name; the 2026-08-17 study cites `session_id` and sticky routing) on every request of a session, including specialists (their own id) and summaries (derived id, as item 5). Document that an explicit `provider.order` overrides stickiness.
- **Prove it:** fake-fetch test on the OpenRouter branch asserting the header/body field is present and stable across two requests of one session and different across sessions.

### 7. The Task tool's description is rebuilt from the live specialist roster every turn

- **What:** `syncTaskTool` calls `createTaskTool(...)` unconditionally each turn (`harness-session.ts` ~L1194, rationale ~L1167). The description embeds `describeSpecialists(roster)` (`src/main/harness/tools/task.ts` ~L274) and the schema embeds the roster ids (~L92, ~L279). `roster.list()` reads the catalog's in-memory state, which the renderer reloads on every hire-card mount and Settings open. Today the output is byte-identical while the roster is unchanged (sorted, deterministic), so this is a fragile invariant: adding, editing or removing a specialist file mid-session changes the tools JSON at the very front of every provider's request — total cache loss, once, silently. `syncSkillTool` already snapshots its catalog once per session (`tools/skill.ts` ~L29) and dirty-checks (`harness-session.ts` ~L1125); `syncMcpTools` dirty-checks on budget and server-array identity (~L1242).
- **Who pays:** everyone, once per roster change.
- **Fix:** small. Snapshot the roster once per session (or per `setBinding`), rebuild only on a real change, and add a test that a catalog reload mid-session leaves the serialized tool set byte-identical. Decide whether a roster change should instead be surfaced to the model as an appended message.

### 8. The Reuse chip hides the requests that wasted the most

- **What:** the status-bar Reuse % is session-cumulative (`src/renderer/components/StatusBar.tsx` ~L1432, `src/renderer/state/cache-reuse.ts` ~L56-74) and includes every specialist run (`src/renderer/state/session-totals.ts` ~L181), which are cold by nature, while excluding compaction summaries (never folded into `turnUsage`) and naming calls (report nothing). So a user reading 45% cannot tell whether one post-compaction request re-read 150k tokens at full price or the whole session was mediocre.
- **Who pays:** trust. The number is not wrong, it is unexplainable.
- **Fix:** small on the backend, a UI question for Destin. Options: a per-turn reading beside the total; a tooltip breakdown (parent / specialists / summaries); counting summary usage. For ChatGPT the diagnostics file already has the per-request truth; for other providers `turn-complete` usage carries `cacheReadTokens` per turn. Any chip change goes through the feature flow (design guide, review deck).

## Confirmed fine at the same commit (do not re-investigate)

- System prompt: assembled once per session (`native-session-host.ts` ~L2612, explicit "never reassembled" note), includes a date and git snapshot frozen at assembly. A session across midnight or a mid-session commit does not change the prefix.
- Tool order: `toolByName` Map insertion order; per-turn `set` on an existing key keeps its slot.
- Skill tool description: snapshotted at construction; installs mid-session do not change it.
- MCP tool budget: dirty-checked on budget and server-array identity.
- `adaptForWire` (`wire-adapter.ts`): image-free histories returned by reference; image rewrites are deterministic.
- `stripOpenAIContinuation`: only on identity change (re-auth, account switch, model swap), which invalidates the cache anyway.
- Rules and specialist reports: appended at the end (`injectPathTriggers`, `runNotice`, `spliceNotice`), never mid-history.
- Retries: `withRetry` bounded by `retryDelays` (4 attempts) on 429/5xx; stall auto-retry once per step; empty-step retry once; manual Retry unbounded by design; none change the prefix.
- Local engine: nothing resets per request; `ensureServable` is a plain GET; idle sleep 900 s, engine idle 25 min, "Keep loaded" disables sleep.

## What PR #461 gives you to build on

- `tests/helpers/responses-fakes.ts` — fake SSE through the REAL `@ai-sdk/openai` Responses provider and the ChatGPT middleware; `tests/native-session-host-continuation.test.ts` shows a full host round-trip over temp roots. Reuse these for any ChatGPT wire-body assertion.
- `tests/chatgpt-request-diagnostics.test.ts` — how lanes, dispatch sequence and `stablePrefixItems` are asserted; the opt-in benchmark (`YOUCODED_DIAG_BENCH=1`) measures observer CPU cost.
- `src/main/harness/accepted-history-capture.ts` + `accepted-history-store.ts` — if items 3/4 change how history is transformed, extend the transformation descriptor rather than approximating; the store fails closed (`unreferenced-history`) on any part it cannot map, and that is what the reopen tests check.
- `docs/native-runtime.md` → the diagnostics and durable-continuation sections, including the fallback reason codes you will see in logs.

## Pitfalls learned on 2026-09-09

- Identity strings use `\0` separators. Write them as `\u0000` in source; several agents produced raw NUL bytes that made git treat the file as binary. Check with `file` before committing.
- Parallel implementers in one worktree must not commit; the controller commits by explicit path.
- A fence that starts inside an async chain loses to the publication it must cancel; start fences synchronously at the mutation (the store bumps its in-memory revision before its first await).
- The empty-summary reasoning item (`reasoning-start` with no summary deltas) is a real SDK shape; every fixture that only ever carries a summary would have hidden it.
- `verify.sh` is desktop-only; Android and the worker have no consumers of these files today, but say what you grepped.

## Definition of done

Each item either ships with a test that pins the byte-stability it claims, or is explicitly parked on the roadmap with the reason. When the small set (1, 5, 6, 7, 8) lands, update `docs/roadmap/native-harness.md` → "Cache efficiency" and append to `docs/roadmap/shipped.md`; when the design set (2, 3, 4) has a spec, link it from the same entry. Archive this handoff when all eight are resolved or parked.
