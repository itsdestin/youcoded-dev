---
date: 2026-09-01
status: active
type: investigation
topic: native-harness cost — the summarize (compaction) call's tokens are never counted, so the session-cost chip reads low once compaction starts, and the self-check cannot see it
---

# The session-cost chip is systematically LOW once a session starts compacting

**History:** added 2026-08-27 (old ROADMAP.md L160). Re-verified against `origin/master` 2026-09-01.

## Symptom

The session-cost chip in the status bar matches the provider's bill for a short session,
then falls behind it in a step every time the conversation is compacted. A long session
that summarized five times on a Sonnet-class model reads roughly 25% low on a chip
showing $5.

## Mechanism

`generateSummary` (`youcoded/desktop/src/main/harness/harness-session.ts`, ~L1539) issues
its own `streamText` call to compress history, and deliberately never awaits
`result.usage` — the comment explains that awaiting it could hang on the abort/timeout
path (the C1 hang that the race guard exists to prevent), so under-reporting the
summary call's tokens is the accepted trade.
<!-- claim: {"path": "youcoded/desktop/src/main/harness/harness-session.ts", "contains": "WHY the summary call's tokens are NOT folded into turnUsage"} -->

Because the summarize call is not a `runStreamOnce` step, its tokens enter neither
`turnUsage` nor the provider-cost sum. Both sides of the cost self-check (per-turn and
session, Task 27/30) exclude it identically, so the checker stays honest — **but a clean
bill from that checker must never be read as "the chip matches the invoice"**, because
the real provider bill DOES include the summarize call.

The comment calls the tokens "(small)". They are not: compaction fires at 75% of context
(`compactionConfig.triggerRatio`) and each summarize sends up to 60% of the window as
input (`estimateTokens(bounded) > cfg.contextLength * 0.6`). On a 200k-context
Sonnet-class model that is ~120k uncounted input tokens ≈ $0.36 **per summarize event**
(2026-08-27 review figure). Zero error until the first compaction, then a step function.

## Fix shape

Await and accumulate the summarize call's usage into the turn it belongs to (or into a
session-level bucket), so both our figure and the provider comparison include it. The
await must keep the existing abort/timeout hardening — race `result.usage` against the
same stop promise rather than awaiting it bare, so the C1 hang cannot return.
