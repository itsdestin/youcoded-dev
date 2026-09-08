---
date: 2026-09-07
status: active
type: review
topic: specialists plans backend design — adversarial review round 2
reviewed: docs/active/design/2026-09-07-specialists-plans-backend-design.md
---

# Specialists plans backend — design review 2

## Verdict

Seven findings, all accepted.

## Findings and disposition

1. **Critical — universal cloud availability and certified hard accounting were not reconciled. Accepted.** Define the adapter contract and conformance fixtures. Every tool-capable cloud route gets a conservative generic adapter based on complete UTF-8 wire content plus a fixed per-message/tool/protocol reserve and one bounded transmission; provider-specific tokenizers may tighten but never widen it. Binary/image inputs are refused in plan children unless their adapter supplies a certified bound. Arbitrary endpoints that reject the bound can fail, but cannot exceed authorization.
2. **High — “session attach” was not a concrete restart path. Accepted.** The existing `session:replay-live-state` path becomes the journal hydration trigger; every first-page startup/resume load invokes it, and `sendLiveOnlyState` includes plans.
3. **High — the writing state had no producer/lifecycle. Accepted.** The harness observes `propose_plan` tool-input start, emits the ordinary tool-use shell plus a transient writing projection keyed by tool id, then replaces it on validation. Invalid/retried/aborted input receives a terminal tool result and failed/stopped projection; no orphan spinner survives.
4. **High — one child could pause while siblings still spend. Accepted.** Add an internal non-rendered `pausing` phase that fences/aborts/settles all siblings, pessimistically charges unresolved reservations, releases slots/lease, then emits visible paused.
5. **High — Android unsupported wire shapes were unspecified. Accepted.** Define action and settings-result discriminants and renderer behavior; Android hides/disables controls and never optimistically mutates on unsupported.
6. **High — revision association was model-trusted. Accepted.** Journal a trusted pending-revision token on Comment and atomically consume it only for the replacement proposal from that queued comment turn.
7. **High — repeat completion was not deterministic. Accepted.** The final leaf of each iteration returns a strict structured `{report, repeatSatisfied}` terminal payload. Missing/malformed values pause as a typed failure; every possible iteration is included in the ceiling.
