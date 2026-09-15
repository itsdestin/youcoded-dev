---
status: shipped
date: 2026-09-15
---

# Cloud context defaults — UI review

Destin approved the short route in chat on 2026-09-15: build the real renderer UI in the workbench, then show a before/after deck before backend implementation.

## Requested scope

- Assistant settings → General → a new Context card.
- Separate OpenRouter and ChatGPT settings, each choosing 250k or 1M.
- Both default to the lower choice.
- An ⓘ explains context, approximate model-dependent limits, and possible extra API cost or subscription usage on long conversations.
- Local model settings and context limits are unchanged.
- No model duplication in the model picker.

## Approval and implementation

The two review decks were UI-only; their risk notes correctly say their choices were not saved. C-2 approved the explanation; C-3 approved the compact card on 2026-09-15. Backend implementation followed that approval and now saves preferences through a shared store and native IPC. The old decks remain the design record, not a demonstration of the completed save path. Implementation plan: `docs/archive/plans/2026-09-15-cloud-context-settings.md`.

Shipped to app master in merge `4c5a0729` (implementation `340263fc`) after Destin authorized merge and close-out. The review decks and capture reports below preserve pre-merge history. Capture manifests' repository-relative `file` targets now point into this archive so the screenshots remain locatable; capture metadata and historical provenance are otherwise unchanged.

## Research informing the explanation

Research on 2026-09-15 found deliberate lower defaults rather than a universal upstream maximum:

- Codex's current bundled catalog uses 272,000 default / 872,000 maximum for Astra and GPT-5.6; config overrides clamp to the maximum. https://github.com/openai/codex/blob/main/codex-rs/models-manager/models.json and https://github.com/openai/codex/blob/main/codex-rs/models-manager/src/model_info.rs
- OpenCode's OAuth transform assigns GPT-5.5/5.6 a 272,000 input / 128,000 output budget. https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/plugin/openai/codex.ts
- Hermes keeps 272k defaults and exposes opt-in 900k aliases for eligible models, citing subscription consumption. Its documented observed acceptance differs from the Codex catalog; do not treat it as a guarantee for every account. https://hermes-agent.nousresearch.com/docs/developer-guide/context-compression-and-caching#codex-large-context--900k-picker-variants-opt-in
- Pi documents per-model overrides and deliberately smaller operating windows. https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/models.md
- OpenAI says extended sessions holding more context can use significantly more allowance per message. No fixed subscription multiplier established here. https://developers.openai.com/codex/pricing

## Preview checks

- Baseline: 3/3 screenshots verified (General, midnight/light/halftone-dimension).
- After: 18/18 screenshots verified across General, explanation, empty/stress scenarios and a 390px-wide screen; `runs/after/coverage.md` reports 6 covered surfaces and no misses.
- The first narrow capture plan incorrectly used the desktop Settings button. Corrected it to Open menu → Settings, following the existing narrow plan; no app workaround was needed.
- Read the desktop and narrow screenshots and the review deck's contact sheet before serving it.
- The Context component tests cover independent provider choices, keyboard selection, approximate-size and usage explanation, and Escape dismissal.
- This is not runtime or Android backend verification. The phone-width check is the shared desktop renderer in the isolated workbench.

## Round 2 — spacing feedback

Round 1 submitted: C-1 Other, “lots of empty space, we can tighten this”; C-2 Yes (explanation approved). Round 2 changes layout only: two columns at the shared desktop breakpoint, stacked compact rows on narrow screens. Approved explanation and provider-specific choices remain unchanged. `cloud-context.review-2.json` compares round 1 against round 2. Compact captures: 9/9 verified in three themes (desktop card, narrow card and explanation); desktop verification passed again.

## Backend policy

Advertised capability stays separate from the chosen operating budget. Standard caps at 272,000 tokens; long caps at 1,200,000 (the upper edge of the approximate range in the approved explanation). Both respect the model's published limit; ChatGPT's separate maximum is used only for long mode. Unknown capability stays unknown. Reply reserve is not subtracted twice. OpenRouter models above the chosen tier are capped. Local engines and other provider types are unchanged.

The saved defaults take effect at create, reopen/resume and model selection, including specialist creation/resume. Saving does not silently shrink an already-active conversation. No paid/authenticated long-context probes have been run. Android's native backend remains unsupported; its explicit refusal is covered by desktop bridge tests, but Android build verification is unavailable here because the SDK platform-tools directory is absent.
