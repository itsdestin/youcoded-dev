---
status: draft
date: 2026-09-17
owner: Destin (product decisions) / YouCoded Assistant (design)
component: youcoded/desktop
related:
  - youcoded/docs/native-runtime.md
  - docs/archive/specs/2026-09-08-chatgpt-cache-efficiency-design.md
---

# Local context cuts — cutting a conversation to fit a local model, visibly

## Why

On 2026-09-16 two Qwen 3.5 9B sessions (32k window) each "forgot" the user's request halfway
through the first turn, returned nothing, and then answered the next message as if the chat had
just started. Both transcripts reproduce exactly against today's code:

- `fitToContext` trims the oldest messages from every outgoing request. Its pair-safe front trim
  drops *every* leading tool step, so inside one long tool-heavy turn the window collapsed to the
  last tool call alone, and on the next turn to the newest user message alone.
- Summarizing cannot run inside a first turn (it needs two user messages), and it measured the
  window from the already-trimmed request, so it believed there was room.
- One `Read` may return 100,000 characters — more than the whole conversation space of a 32k model.
- The trim is invisible, and because the front edge moves every step, the engine re-reads the whole
  conversation every step (Qwen 3.5 is a hybrid model: any change near the front forces a full
  re-read).

Research (Claude Code, Codex, OpenCode, Cline, Roo, Goose, Aider, LM Studio, Jan, Ollama,
SillyTavern, llama.cpp, Anthropic/OpenAI caching docs, JetBrains "The Complexity Trap") agrees:
cut **rarely, in one large step, at a threshold**, clear old tool output before anything else,
**never lose the user's request**, and **always show the user that it happened**.

## Key decisions

### Scope
- **Local models only.** Applies when the session's model runs on this computer: the built-in
  engine, or a connected app (Ollama, LM Studio…) whose address is this computer
  (`isLocalEndpoint`).
- **Cloud models are unchanged.** Their trimming, compaction triggers and requests stay
  byte-for-byte what they are today, pinned by a test. (The same trim bug exists there in theory,
  but their 250k/1M windows make it rare — filed separately, not fixed here.)
- **Specialists on local models get the same cutting**, without a toast (they have no screen of
  their own).

### When to cut
- **Cut once when the conversation passes 85% of its space; cut it down to 50%.** Between cuts the
  history only grows at the end, so the engine's cache keeps working. One cut costs one slow step;
  every step after it is fast again.
- **"Conversation space"** = model window − room kept for the reply − a safety margin − the system
  prompt and tool list. (32k example below.)
- **Measured from real token counts** the engine reports for the last step, plus a cautious
  estimate for anything added since — never from a request that was already trimmed.
- **Can happen mid-request**, between tool steps — the exact place the two sessions broke.

### What gets cut, in order (stop as soon as the conversation is back to 50%)
1. **Old tool output first.** Oldest first, the result text is replaced by a one-line note
   ("output cleared to fit memory — re-run the tool if you need it"). The model still sees that the
   step happened. The newest step's output is never cleared.
2. **Then, earlier finished requests are summarized** (today's summary step, unchanged), when there
   are any.
3. **Then, the oldest tool steps of the current request are dropped**, with one note to the model
   saying how many were removed. This is the new step that covers a single long request.
4. **Last resort:** if the user's message plus the newest step still don't fit, the newest tool
   output is shortened to fit. If even the user's message alone doesn't fit, the request stops with
   a clear error (see Notices) instead of sending something broken.

### Never cut
- **The user's original request for the current task** (the first message of the request in
  progress) and **the user's latest message.**
- **The newest tool step** (call and result stay paired — a lone half breaks providers).
- **System prompt and tool list** (they are the fixed front of every request).

### Tool output size
- **Local models get a per-result cap of a quarter of the conversation space** (~3,500 tokens /
  ~12,000 characters at 32k), floor 2,000 characters. Cloud caps are unchanged.
- **The truncation note says how to get the rest:** `Read` with an offset, a narrower `Grep`/`Glob`,
  Bash's existing saved-output file.

### Cache safety
- **The cut is saved into the conversation's memory**, not recomputed per request. Later steps
  only append to it.
- **No per-request trimming for local models in normal operation.** `fitToContext` stays only as an
  emergency floor, now keeping the pinned messages; if it ever has to trim, that is logged and still
  shown to the user — never silent.
- **An engine "too long" error triggers one tighter cut and one retry**, then the error notice.
- **A cut marks the next step as an expected cache rebuild** (existing `expectedRebuild` flag), so
  the cache diagnostics don't report it as a regression.

### What the user sees
- **Cut messages fade exactly like messages before a /compact or /clear** (same 60% opacity, same
  hover tooltip component). They stay readable.
- **Tooltip — removed message:** "Cut to fit this model's memory — still here to read, but the
  model can't see it"
- **Tooltip — tool card whose output was cleared:** "Output cut to fit this model's memory — the
  model knows this ran, but not what it returned"
- **Pinned messages never fade**, even when older messages around them do.
- **A divider marks where the cut happened** (existing system-marker row): "Earlier messages cut to
  fit memory · freed N tokens".
- **A toast appears when a cut happens**, at most once per request, only for the chat on screen
  (a background chat just gets its divider):
  - Built-in engine: "Some earlier messages were cut to fit this model's memory. A larger context
    window means fewer cuts." — button **Local model settings** opens Assistant settings →
    Local models.
  - Connected local app: same message ending "…Raising the context length in the app that runs
    this model means fewer cuts." — no button (the setting lives in that app).
- **When nothing more can be cut** (the user's message alone is too big): the standard
  `<ErrorState>` with the specific reason ("This message is too long for this model's memory"),
  Retry, and the same Local model settings button.

### Resume and switching models
- **A resumed chat keeps its cuts** (faded entries and model memory both come back as they were).
- **If the saved memory can't be reused** (e.g. the model changed), the full conversation is rebuilt
  and a local model cuts it again on the first step, with the same notices.
- **Switching local → cloud carries the cut memory over**, as a summary does today. Switching
  cloud → local cuts on the first step if needed.

## The numbers at 32k (Qwen 3.5 9B today)

| | Tokens |
|---|---|
| Model window | 32,768 |
| Kept for the reply (existing rule: a quarter) | 8,192 |
| Safety margin | ~1,600 |
| System prompt + tools (measured) | ~7,800 |
| **Conversation space** | **~15,000** |
| Cut when the conversation passes (85%) | ~12,800 |
| Cut down to (50%) | ~7,500 |
| Largest single tool result (a quarter) | ~3,750 |

The system prompt alone takes about a quarter of a 32k window. A leaner prompt for small windows is
a separate follow-up, not part of this design.

## Implementation notes (for the build, not decisions)

- **Gate:** the host computes a window policy from the binding's provider type
  (`local-engine`, or `openai-compatible` + `isLocalEndpoint`) and passes it in
  `HarnessSessionOpts`; `setBinding` updates it. Every new branch reads that one value.
- **Emit surface is frozen:** the cut rides the existing `compact-summary` event
  (`autoCompaction: true`) with a new optional `cut` payload:
  `{ pinnedUuids, droppedThroughUuid?, clearedThroughUuid?, droppedSteps, clearedResults }`.
  Cuts are always oldest-first, so two boundaries describe them without per-message lists.
- **Renderer:** the fade rule in `ChatView.tsx` / `BubbleFeed.tsx` (today: "before the last
  compact/clear marker", `archive-boundary.ts`) gains "covered by the latest cut boundaries and not
  pinned", with per-kind tooltip text. The marker is a new `system-marker` variant `'cut'`.
  New window event `youcoded:open-local-models` → `autoOpenPage: 'local'`, same pattern as
  `youcoded:open-model-providers`. Toast uses the existing `setToast({ message, action })`.
- **Persistence:** cleared output needs a byte-exact derivation helper beside
  `prunedToolResultText`; the drop note is app-authored text (a manifest literal). New
  accepted-history transformation kind `cut` next to `pruned`/`summary`. `rebuildHistory` still
  ignores `compact-summary`, which is what makes the "rebuild and cut again" path work.
- **Measuring:** real prompt tokens from the last step's usage + chars/3 for content appended
  since (code and paths tokenize denser than chars/4).
- **Tests (write first, from the two 2026-09-16 sessions' shapes, synthetic content):**
  a long first turn keeps the original request at every step; the next turn still sees it; cuts
  happen once, not per step (request prefixes identical between cuts); pinned messages survive
  every stage; cloud requests are unchanged; resume restores faded state; toast shows once per
  request and only for the visible chat; the settings button opens Local models.

## Not in this design
- Cloud trimming/compaction changes — tracked in `docs/roadmap/native-harness.md` → "Cloud model context management and cache/token efficiency improvements", which should reuse this spec's pieces.
- A leaner system prompt for small windows.
- Letting the user pick a cut policy (LM Studio-style dropdown). The defaults above should be right;
  revisit only if users ask.
- Asking the engine for exact token counts (`/tokenize`) — the reported usage is enough for now.

## Next steps
1. Mockup deck of the faded cut entries, divider and toast (when Destin asks for it).
2. Backend build with the tests above; `verify.sh`; then the review deck.
