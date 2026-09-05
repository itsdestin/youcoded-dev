---
date: 2026-09-05
status: active
type: handoff
topic: the prompt Destin pastes into a fresh session to build ground-truth model information (pricing, context, capability class) concurrently with specialists stage two
---

# Prompt: build model information, alongside the plans work

Paste everything below the line into a new session. It is written for a session with no
context. Destin ruled on 2026-09-05 that this work runs **concurrently** with specialists
stage two (plans), in its own session, so that plan cards can show a dollar ceiling from the
day they ship. The plans session is designing and building in
`docs/active/design/2026-09-05-specialists-plans/`; do not touch its files.

---

I want **ground-truth model information** built: the app knowing, for every model a session
can run on, its real price (input, output, cache read, cache write), its context window, and
whether it supports tools and images — discovered from the provider where possible, never a
hand-kept list that rots — plus the **capability class** of the model (small local / big
local / small cloud / frontier cloud), which today is guessed from provider type and context
size. This is parity step 4 and step 5 of the native-runtime program. Another session is
building specialists stage two (plans) at the same time and will consume what you build.

**1. Read, in this order, nothing else first:**
- `docs/active/specs/2026-09-01-agent-platform-vision-and-state.md` §5.1 (steps 4 and 5),
  §5.5, §8 (the 2026-08-16 cost formula and the 2026-09-05 row)
- `docs/roadmap/native-harness.md` → `## cost` — the three shipped accounting bugs, each with
  its investigation report
- `youcoded/desktop/src/main/harness/pricing.ts`, `youcoded/desktop/src/main/providers/model-catalog.ts`,
  `youcoded/desktop/src/main/harness/capability-profile.ts`,
  `youcoded/desktop/src/main/harness/model-step-budget.ts` — the four files this work owns
- `youcoded/docs/engine-dependencies.md` → "Stage-two probes" — what the plans session knows
  about local fan-out; its plan card charges a full prefill per child on the first wave

**2. The contract with the plans session.** The plans session will call exactly two things
from the main process and nothing else of yours, so design them first and keep them stable:
- a function that, given a model binding and a token count, returns the **dollar figure or
  null** (null means "no published price" — tokens only on the card; never a false $0.00,
  see `isFreePricing`)
- a function that returns the model's **capability class**, the same axis `canDelegate`
  uses to decide whether a model may hire specialists; plan authoring is gated on the same
  class (measured 2026-09-04: reliable from the 9B local class up, absent below)
Write both signatures into `youcoded/docs/native-runtime.md` in your first commit so the
plans session can code against them before your implementation lands.

**3. Scope, in order:** (a) the two functions above over today's data; (b) discovery of
pricing and context for each provider (OpenRouter already publishes all four rates; direct
Anthropic/OpenAI/Google keys and the local engine each need their own honest source, and a
model with no source reports null, never a guess); (c) the four-class tiering rework and
folding `model-step-budget.ts` into the profile; (d) the three cost-chip bugs under
`## cost`. Every step lands separately.

**4. Rules that bind the session:** work in a worktree off `origin/master`; `bash
scripts/verify.sh` before any claim that desktop code works; do not edit anything under
`harness/specialists/`, `harness/tools/task.ts`, or the renderer's specialist components —
those belong to the plans session; any change a user can see (the cost chip, Settings rows,
the model picker) goes to Destin as a review deck under `.claude/rules/feature-flow.md`,
never a chat description; offer the harness evaluator when a capability class changes what a
model is offered, and never run its paid path unasked; WHY comments on every non-trivial edit;
files handed over as plain paths.
