---
status: superseded
created: 2026-08-12
type: handoff
related: ROADMAP.md → "Show progress while a tool call's arguments stream"
superseded_by: docs/archive/specs/2026-08-12-tool-arg-streaming-visibility.md
---

> **Superseded 2026-08-12 (same day).** The investigation this handoff asked for
> ran and produced
> `docs/archive/specs/2026-08-12-tool-arg-streaming-visibility.md` (shipped
> 2026-08-13), which carries
> the re-verified facts plus the decisions. Two of this document's open
> questions were answered in the installed dist: `tool-input-start` and the
> completed `tool-call` carry the **same** id, and `assistant-thinking` with no
> text and no partId is **already** non-persisted. Kept for the probe pointer
> and the original framing.

# Handoff — investigate tool liveness while arguments stream

Destin's directive, verbatim intent: **minimize the time the generic loading
spinner is on screen; prefer visible tool liveness or text streaming.** Today
the spinner owns the entire tool-argument-generation window, which for a big
Write on a slow model is *minutes* of indistinguishable-from-frozen.

## What the 2026-08-12 session already verified (do not re-derive)

- **Tool cards do NOT render during arg streaming.** The native loop
  (`harness-session.ts` ~1789) handles only the completed `tool-call` stream
  part; the card's display event fires after args finish. CC sessions likewise
  wait for the tool_use line in the transcript JSONL.
- **The deltas exist and reach the harness's iterator.** ai@7's `fullStream`
  yields `tool-input-start` / `tool-input-delta` / `tool-input-end`;
  `@ai-sdk/openai-compatible` (OpenRouter, local engines, LM Studio route)
  forwards arg fragments via `StreamingToolCallTracker` (provider-utils) as
  soon as the delta carrying the function NAME arrives. Verified by reading the
  installed dist, both layers. The harness switch simply ignores these parts
  today — they land in `default:`-nothing.
- **The stall watchdog is already fed by them** (`armWatchdog()` runs per
  yielded chunk of ANY type, `harness-session.ts:1764`), so surfacing them
  adds no new liveness machinery — the signal is already flowing through the
  loop.
- **Live probe (OpenRouter, deepseek-v4-flash):** args stream normally — 3,261
  chars over ~25s, 39 chunks, max inter-chunk gap 1.0s. Probe script preserved
  at `scripts/tool-arg-stream-probe.mjs` (workspace repo) — raw fetch + SSE
  parse, needs `OPENROUTER_API_KEY`, costs cents; never run unasked.
  Context for why this was probed: a real provider stall on 2026-08-12 killed a
  turn mid-Write after 75s of true wire silence (watchdog behaved correctly).

## The investigation

Two candidate surfaces, not mutually exclusive — the investigation's job is to
recommend one (or a staged pair) and spec it:

1. **Early tool card.** Render the card at `tool-input-start` in a
   "preparing…" state, fill the detail line as enough JSON streams to parse
   (`file_path` arrives early in Write's arg JSON; a streaming-JSON prefix
   parse or a regex on the buffered prefix both plausibly work), flip to the
   normal running/awaiting state when the completed `tool-call` arrives.
   Questions: does the reducer tolerate a tool entry whose `toolUseId` isn't
   known yet (the SDK mints `toolCallId` at `tool-input-start` — verify it is
   the SAME id as the completed part's, in the installed version)? What does
   an ask (permission) do if it arrives while a preparing-card exists? What
   happens on stall-kill mid-args — the card must not orphan (see the
   dangling-tool-call invariant in `native-runtime.md`: a dangling tool_call
   bricks sessions — display-only state must stay display-only).
2. **Progress line on the existing indicator.** The ROADMAP entry's shape:
   `{ toolArgProgress: { toolName, chars } }` riding the `assistant-thinking`
   heartbeat like `promptProcessing` already does (display-only, never
   persisted). Smaller, no reducer surgery, but keeps the generic spinner —
   it only annotates it.

Constraints that bind either design:
- **The emit surface is FROZEN** (`.claude/rules/native-runtime.md`): new loop
  states map onto existing `TranscriptEventType`s only. `promptProcessing` is
  the precedent for smuggling display-only payloads through
  `assistant-thinking`; an early CARD needs a `tool-call`-shaped event or
  reducer tolerance — that is the hard part of option 1. Whatever ships must
  not persist partial args to the session JSONL (replay would see them).
- **Throttle.** Per-chunk IPC emit would spam every surface (desktop IPC,
  remote WS, Android bridge). `promptProcessing` has a throttle pattern
  (`lastPrefillEmitAt`).
- **CC sessions can't do any of this** (transcript-based; args appear only on
  completion). The spinner-minimization goal for CC is a different, smaller
  investigation: what DOES CC expose mid-turn (PreToolUse hook fires before
  execution, not during generation — probably nothing usable). Scope
  decision needed: native-only is fine for v1; say so in the UI copy nowhere
  (no "waiting for CC" special text).
- **Local engines** (llama.cpp via the same openai-compatible adapter): verify
  the server actually emits arg deltas (`--jinja` grammar-constrained path —
  `native-runtime.md` pins constrained decoding details; a grammar-constrained
  generation may emit differently). One `run-workbench`-level check with a
  local model before committing to per-provider claims.

## Read first

- `ROADMAP.md` → "Show progress while a tool call's arguments stream" — the
  entry this extends; update it (or supersede it with the spec) rather than
  duplicating.
- `src/main/harness/harness-session.ts` — the consume loop (~1630–1800): the
  watchdog, the part switch, `promptProcessing`/`stallWarning` as the
  display-only payload precedents.
- `.claude/rules/native-runtime.md` — frozen emit surface, tool-call pairing
  invariant, `session-error` display-only precedent.
- `src/renderer/state/chat-reducer.ts` PERMISSION_REQUEST/TRANSCRIPT_TOOL_USE
  paths if option 1 — the synthetic-tool merge machinery is where an early
  card would graft in (`perm-` synthetic entries are the precedent for a card
  existing before its transcript event).
- The 2026-08-12 debugging record: this handoff's "verified" section IS it;
  the session transcript has the detail if something reads wrong.

## Traps

- `rg "stall"` matches "in**stall**ed" everywhere — anchor your searches.
- Do not trust the adapter's TYPES to prove emission — v3.0.14's tool-part
  emission was verified by reading `processToolCallDelta` in the dist, and a
  version bump can change it. Re-verify on whatever version is installed when
  you start.
- `session-error` and every stall/progress payload are display-only and never
  persisted — keep it that way, or resume/replay renders garbage.
- M5 2b (full-auto safety stop) may or may not be merged when you read this —
  `feat/full-auto-prompt-coherence` touches `harness-session.ts`'s neighbors
  (`ToolCard.tsx`, broker, reducer). Check `git log origin/master` before
  branching, and expect the compare-view registry to have a `full-auto-ask`
  surface you should not disturb.

## Paste-into-a-new-session prompt

> Investigate minimizing generic-spinner time during native turns in YouCoded,
> per `docs/active/handoffs/2026-08-12-tool-streaming-visibility.md`. Destin's
> goal: **the pulsing indicator should be on screen as little as possible —
> prefer a live tool card or streaming text.** Today, tool cards only render
> after a tool call's ARGUMENTS finish streaming, so big Writes mean minutes
> of bare spinner.
>
> The handoff's "verified" section records what is already proven about the
> stream plumbing (arg deltas reach the harness iterator and are dropped in
> the part switch) — start from it, re-verify only the installed adapter
> version's emission. Deliverable: a recommendation between (or staging of)
> the early-tool-card and progress-line designs, as a brainstorm→spec cycle
> with Destin, honoring the frozen emit surface. Sync + worktree first;
> check whether `feat/full-auto-prompt-coherence` has merged.
