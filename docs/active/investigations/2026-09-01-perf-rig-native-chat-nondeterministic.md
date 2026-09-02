---
date: 2026-09-01
status: active
type: investigation
topic: Perf rig — the native-chat parity screen photographs a real local model's reply, so it can reject an unchanged build
---

# `native-chat.png` is non-deterministic

**Symptom.** Two identical-code baselines (`…-2259-16ea12e` vs `…-2330-16ea12e`) differ by 6.88% on
the `native-chat` screen; another pair by 4.61%. `compare.mjs` fails any screen over 5% differing
pixels, so the gate can REJECT a build whose code did not change.

**Mechanism.** `scripts/perf-lab/run.mjs` switches to a real Qwen 0.5B session after it has replied
and saves the screen as `native-chat.png`; the reply text changes every run, and the bubble is inside
the diffed region.
<!-- claim: {"path": "scripts/perf-lab/run.mjs", "contains": "native-chat\\.png"} -->

**Fix shape.** Make the reply deterministic (fake/scripted native provider, or seed + temperature 0
with a pinned prompt), or mask the bubble region before diffing. Until then treat a `native-chat`
DIFF as noise unless the other four gated screens also move.

**History.** Filed 2026-08-28, found by the cycle-1 gate; re-verified 2026-09-01.
