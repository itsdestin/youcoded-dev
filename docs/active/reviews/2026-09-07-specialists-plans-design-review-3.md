---
date: 2026-09-07
status: active
type: review
topic: specialists plans backend design — adversarial review round 3 (cap reached)
reviewed: docs/active/design/2026-09-07-specialists-plans-backend-design.md
---

# Specialists plans backend — design review 3

## Verdict

Four findings, all accepted. This is the third and final permitted design review round.

## Findings and disposition

1. **R1 said every cloud model, while the design said tool-capable cloud models. Accepted.** Every selectable cloud model currently reaches a tool-capable provider path, but this is pinned as an eligibility function/test rather than assumed; if a future cloud catalog row is explicitly tool-less, it needs constrained tool-call authoring before it may remain selectable for plans.
2. **Corrupt journal fail-closed behavior was incompatible with `NativeHome.readJson`'s null-on-parse-error contract. Accepted.** `PlanJournal` gets a strict raw read that distinguishes absent from malformed, quarantines/preserves bad bytes, and refuses mutation over corruption.
3. **Pause/stop settlement could wait forever. Accepted.** Add a bounded settlement deadline, forced child disposal, pessimistic charging, durable ambiguous outcomes, and release before visible terminal/waiting state.
4. **Remote hydration must use authoritative `chat:hydrate`, not a parallel plan replay buffer. Accepted.** Plan projections join chat snapshot serialization/deserialization; `plans:event` carries only later deltas. Local Electron still uses `session:replay-live-state` after first-page load.
