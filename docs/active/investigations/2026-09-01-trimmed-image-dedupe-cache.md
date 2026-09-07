---
date: 2026-09-01
status: active
type: investigation
topic: An image trimmed out of the outgoing request is still claimed "already visible" by the image dedupe cache
---

# Trimmed-for-the-wire image still counted as "already visible"

**Symptom.** On a small vision-capable local model, the assistant can be told
`[image not re-attached: <path> is unchanged and already visible earlier in this conversation]`
about a picture it can no longer see — and gets no image — until that file changes on disk.

## Mechanism (re-checked against master 2026-09-01, `f2d229e4`)

`fitToContext()` in `youcoded/desktop/src/main/harness/harness-session.ts` trims the oldest messages
from the **outgoing request only** — `this.history` is untouched — so an image can scroll out of what
the model actually receives while the `shownImages` cache (keyed path → mtime) still vouches for it.
The cache is reconciled against nothing after the fit.
<!-- claim: {"path": "youcoded/desktop/src/main/harness/harness-session.ts", "contains": "private shownImages = new Map<string, number>\\(\\)"} -->

The gap is documented in-code at the `shownImages` field (a KNOWN GAP block) rather than papered over.

**Bounded — but WIDER than this doc first said (corrected 2026-09-06).** It still needs the
prune-protected window to exceed the fit budget (context under ~8,500 tokens) AND
`supportsVision: true`. The old sentence said that second condition "for a local engine requires
an explicit registry entry", which made it unreachable in practice: **no `KNOWN_MODELS` entry has
ever declared `supportsVision`** — checked 2026-09-06, `rg -n "supportsVision"
desktop/src/main/harness/known-models.ts` returns only the interface field — so local bindings
always resolved to "don't know" and no local model could reach this path at all. That changed on
2026-09-05: `visionFor()` now takes a DISCOVERED per-model answer when the registry has no
opinion, and the local engine supplies one from `GET /models` `input_modalities` whenever a model
sits in a folder with its projector. The live exposure is therefore **any downloaded local vision
model with a very small context window**, registry entry or not. Everything larger is still
covered because compaction re-estimates un-trimmed history at each turn start and fires first.

## Fix shape — and the two rejected ones

**Do not clear the cache in `fitToContext`** — it runs on every request, so an unconditional clear
defeats dedupe entirely, and a count-diff latches permanently true once history outgrows the window.
Two reviewers rejected both. Intended fix: re-key `shownImages` to `Map<path, {mtime, toolCallId}>`
and reconcile against the fitted window after trimming — exact, no over-clearing, ~8 lines.

History: filed 2026-08-11 (the one path youcoded#293 left open). Re-verified 2026-09-01; the
reachability sentence corrected 2026-09-06 while documenting the local-engine upgrades.
