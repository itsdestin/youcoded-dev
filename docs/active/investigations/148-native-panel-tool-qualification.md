---
status: active
work_item: 148
---
# Native model-panel tool qualification

The remaining three native model routes were exercised with the same two-turn editing canary under the existing USD15 estimate-based gateway. This is bounded qualification, not the full comparison. The provider routes remain explicit: Luna on OpenAI, DeepSeek on open-inference/fp4, Gemini on Google AI Studio. Provider output ceilings were capped at 8192; client defaults may impose smaller limits.

| Model label | Requests | Reported charge USD | Two turns completed | Final file verifier |
|---|---:|---:|---|---|
| Luna | 6 | 0.00147344 | Yes | Passed |
| DeepSeek | 8 | 0.0024465379 | Yes | Passed |
| Gemini | 8 | 0.00643867 | Yes | Failed |

Every request returned cost telemetry. Gemini's native trace shows initial plan creation but no second-turn edit; the second checkpoint's final text is empty. Preserve this failure. An agent stop or completed scenario is not task correctness, and transport qualification must not be labeled a quality pass. Do not retry selectively to manufacture a passing panel.

Evidence: `scratch/harness-lab/native-panel-tool-qualification-v1.json`; native and verifier logs are under `scratch/harness-lab/router-conversation-canary/jobs/native-panel-{luna,deepseek,gemini}-v1/`.

Accounted ledger exposure after this batch: USD0.8679186554 including earlier estimates; zero reserved requests. The gateway container and dedicated network were absent at the post-run check. No full paid evaluation had run at this checkpoint. Competitor context work was then pending; subsequent retention qualification is recorded in `148-competitor-retention-qualification.md`. Broader behavioral equivalence remains unestablished; current study status is in `../plans/148-current-state.md`.
