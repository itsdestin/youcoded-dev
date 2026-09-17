---
date: 2026-09-01
status: resolved
type: investigation
topic: The perf rig cannot see native per-token streaming — its workload streams whole turns through the Claude Code transcript path
---

# The perf rig's workload is blind to native per-token streaming

**Symptom.** Cycle-1's N2/N3 fixes target the path where the native harness streams hundreds of
same-turn deltas per second that append *nothing* to the timeline. The rig's gate under-represents
their real-use effect because its workload never exercises that path.

**Mechanism.** `scripts/perf-lab/scenario-workload.mjs` appends a user line + an assistant line per
150 ms tick through the Claude Code transcript path, so the renderer sees ~7 renders/s per
streamed-into session, every one of which appends timeline entries. Native streaming is a different
shape (many deltas, one growing part). The scenario declares the gap itself:
<!-- claim: {"path": "scripts/perf-lab/scenario-workload.mjs", "contains": "blindTo: \\["} -->

**Fix shape.** A native-provider streaming variant — a fake OpenAI-compatible endpoint or a scripted
native model — driving `TRANSCRIPT_ASSISTANT_TEXT` deltas with a `partId`, reporting the same
`switchPaintedBySize` and long-task clocks. Pairs with the buddy-window coverage gap.

**History.** Filed 2026-08-27 while running cycle 1; re-verified 2026-09-01.

**Fix built 2026-09-16 (pending merge, `session/perf-smoothness-20260916`).** Not the
scripted-model route: the app already accepts a user-added OpenAI-compatible endpoint, so the
rig runs one in its own process (`scripts/perf-lab/fake-provider.mjs`) and the fixture writes
its provider row when asked. `scenario-native-stream.mjs` streams 3,000 deltas at 150/s into
a native session with the workload's six sessions open — on screen, while switching, and
hidden — and reports renderer long tasks, commits against frames, painted switches and IPC
stall for each leg. The layout-cost verdict stays `stream-too-slow` there BY DESIGN: the
transcript batcher coalesces deltas to one commit per frame, so commits can never outrun
frames on a healthy build; the phase reads commits beside frames instead. Details in the
perf-lab README.
