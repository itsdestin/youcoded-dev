---
date: 2026-09-01
status: active
type: investigation
topic: Resumed native history differs from live history for a whitespace-only empty step
---

# Live-vs-rebuilt history divergence for whitespace-only empty steps

**Symptom.** After a native session recovers from a step that produced only whitespace, the history the model sees live differs from the history rebuilt on resume: live says `'recovered'`, resumed says `'\n  \nrecovered'`. Invisible to the user; cosmetic residual of the empty-step-recovery fix (PR #324).

## Mechanism (re-checked against master 2026-09-01)

A whitespace-only step's deltas still stream and persist as `assistant-text` events (the harness cannot know a step ends whitespace-only until it finishes), but the live history push now skips the message via the shared emptiness predicate (`youcoded/desktop/src/main/harness/harness-session.ts` — `isEmptyStep`, ~`:1952`).

On resume, `rebuildHistory` (`youcoded/desktop/src/main/harness/history-rebuild.ts`) coalesces consecutive `assistant-text` events by plain concatenation, so the persisted whitespace is folded into the retry step's text:
<!-- claim: {"path": "youcoded/desktop/src/main/harness/history-rebuild.ts", "contains": "if \\(last && last\\.type === 'text'\\) last\\.text \\+= text;"} -->

`desktop/tests/harness-history-rebuild.test.ts` (the deep-equal live-vs-rebuilt arbiter) has no whitespace case pinning either behaviour (`rg -c whitespace` → 1, a comment).

Same family: whitespace-only INTERRUPTED partials are skipped live but their persisted deltas still rebuild.

## Fix shape

Teach `rebuildHistory` the same trim rule the live push uses, and add the arbiter case in the same commit.

## History

Added 2026-08-21. Re-verified 2026-09-01: no change to the coalescing line since.
