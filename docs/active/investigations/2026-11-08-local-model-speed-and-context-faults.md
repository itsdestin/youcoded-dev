---
date: 2026-11-08
status: active
type: investigation
topic: making any one local model run as fast as it can on the user's own hardware, and five faults found on the desktop with a small model
tags: [local-models, engine, performance, native-runtime, compaction]
---

# Local models: speed work and five faults (2026-11-07 / 08)

Session `session/local-model-hardening` (app branch of the same name). Destin's goal:
"get any individual model to run the best/fastest it possibly can on every youcoded
user's hardware", without changing the model. Engine facts and measurements live in
`youcoded/docs/engine-dependencies.md`; harness behaviour in
`youcoded/docs/native-runtime.md` → "Local reliability". This file is the status and
the plan.

## Where it stands

**Built, tested, pushed on the branch (not merged):**
- Background read of a chat's opening (`harness/local-prewarm.ts`): the first reply
  in a new local chat starts in about a second instead of after a 1-3 minute read.
- Each chat keeps its own engine slot (`engine/slot-pins.ts`, `id_slot`) and the
  engine no longer clears idle slots (`--no-cache-idle-slots`): follow-up replies in
  up to three open chats read ~20 tokens instead of re-reading ~22k.
- Earlier on the branch: honest loading bar, engine log file, no app freezes at
  engine start / GPU detection, every chat learns its model's real state, delete
  waits for the engine.

**Decided:**
- ROCm stays an optional build under Advanced; it is NOT switched on automatically
  (option B dropped). Reason: on a fresh engine it reads 20-25% faster, but once other
  chats' readings are kept — which the app now does on purpose — it becomes slower
  than Vulkan (9B 173 s vs 144 s; 35B over 300 s vs 114 s) and fades request by
  request. Writing speed is now about equal.
- Keeping three chats' readings stays: at real chat sizes it costs a new chat
  nothing on the 27B and 6% on the 35B MoE.

## Measurements this session (Z13, Strix Halo, b10665)

| What | Result |
|---|---|
| ROCm, fresh engine, 31.6k read | 9B 66 s vs Vulkan 89 s; 35B MoE 75 s vs 94 s |
| ROCm after three kept requests | 9B 173 s vs 144 s; 35B >300 s vs 114 s |
| Kept readings, new 15.4k opening (Vulkan) | 27B 111/106/99/100 s; 35B 19.7/20.3/20.6/20.9 s for 0-3 kept |
| Separate per-slot memory / q8 K+V (27B) | 105/94/94/95 s / 92/96/96/96 s — not adopted |
| MTP drafting, 27B writing | today 6.7 t/s (0 drafts) → 11.1-15.4 t/s; reading unchanged |

Scripts and raw logs were in the session scratchpad (not kept). The 9B, 2B and the
35B MTP runs stopped when the USB drive holding those models was unplugged.

## The five faults (desktop, YouCoded 1.3.3, Qwen3.5-9B-UD-Q4_K_XL, RTX 4070 SUPER)

Read from the desktop's saved conversations and settings, read-only (sessions
`1e4e887b…` and `888eb255…` under `~/.youcoded/sessions/-home-destin-youcoded-dev/`).

1. **One file read fills a small model's memory.** Chat 1: "hello" used 11,077 of
   32,768 tokens; a search added ~1,500; `Read` of `ModelPicker.tsx` returned 52,733
   characters (~15-18k tokens). The next request failed the pre-check: "The
   conversation cannot fit this model's context window." `Read` caps at 100,000
   characters regardless of the model's window.
2. **The summary accepted junk.** Chat 2, same question: auto-compaction fired at
   27,900 tokens; the 9B's "summary" was only a `<tool_call><function=Read>…` block.
   It was accepted (nonempty, fits) and replaced everything it covered. The kept
   tail still held the big file, so after one more read the ENGINE refused: "This
   conversation is too long for this model."
3. **A request stays counted as running.** Destin set the context to 64,512 at
   15:13:11; it applied at 15:23:11 — exactly the 10-minute apply limit — with no
   reply running from 15:13:52. So `supervisor.busy()` stayed true after a request
   ended. Side effect: idle shutdown cannot fire while it leaks. The leaking request
   is not identified (candidates: the AI-title request, the request that hit the
   error). Chat 2 started at 15:13:24, inside that wait, and so still ran at 32k.
4. **Cloud models got local-engine entries.** The desktop's `~/.youcoded/config.json`
   `engine.models` holds `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-astra`,
   `~openai/gpt-sol-latest`, `~deepseek/deepseek-flash-latest`, each with
   `lastLoadError: "model '…' not found"` — something asked the local engine to load
   cloud models. Not yet traced.
5. **The two "too long" errors differ.** Fault 1's pre-check error and fault 2's
   engine refusal use different words, and only the second offers Summarize.

## Resolution (2026-11-09, card #226, branch session/local-model-hardening)

| Item | Outcome | Commit |
|---|---|---|
| Fault 3, request left counted as running | Root cause: the model-load "hi" (`EngineSupervisor.loadModel`) and the model check (`EngineManager.probeModelLoad`) read the answer only on failure; trackedFetch held `inFlight` until a body was read. Both read it now; an aborted request also stops counting. | b3b0b1e29 |
| Fault 1, tool results vs the window | Cut to the room below the compaction trigger before history/transcript (`tool-result-room.ts`, 3 chars/token, floor 2,000). | b3a125c1e |
| Fault 2, junk summaries | `isJunkSummary` + one plain-prose retry; junk twice keeps history. | b3a125c1e |
| Fault 5, two too-long errors | `ContextCannotFitError` classified like the engine's refusal. | b3a125c1e |
| Fault 4, cloud ids sent to the local engine | Already fixed on this branch by 04c209dc3 (only `local-engine` bindings warm/load); present in v1.3.3. Stale config entries are inert and left alone. | — |
| ROCm wording | "usually slower in real use". | 253a19b92 |
| MTP | On per model for DENSE models whose file has the heads; MoE left out. 27B: replies 6.7 → 11.6-11.9 t/s, rewrites 42 → 57, opening read ~4% slower, works with a vision projector. 9B (no heads) refuses to load with it, hence per file. | efaa9558d |
| Speculative decoding copy | No longer says other replies are unchanged. | 1552bd6e0 |

**End-to-end (isolated dev app, Qwen3.5-9B, 32k window, the desktop's question):** run 2
went through cleanly — the 52k-character file was cut to 35,727 characters with the
"read the rest" notice, the model compacted twice with real summaries ("## Goal …"),
22 tool calls, ~20.9k of 32k at the end (it then paused on a permission ask for a
command outside the project, by design). Run 1 ended once with a too-long refusal
right after the cut read (~22.6k real tokens, measured with the 9B tokenizer); the
"reply allowance pushed it over" theory was tested on the engine and is FALSE
(21.4k prompt + 11.5k max_tokens is accepted). Not reproduced; a too-long turn now
logs the refusal's token counts (`logTurnFailure` `tokenCounts`) so a recurrence can
be diagnosed.

## Not yet verified / open

- Windows and macOS: none of this session's speed work was measured there.
- Pending runs: 9B and 2B kept-reading cost (not rerun; the 27B/35B result stands).
- Picking a context size from the hardware instead of the fixed 32,768 default
  (the desktop's 12 GB card could likely hold 64k for the 9B) — larger, riskier; later.
- Model sleep (15 min) still drops every reading; the background read costs the chip
  2-3 minutes per opened chat on a slow model.

## Research leads not pursued (web research, 2026-11-08)

Ranked by likely payoff; each needs a measurement on our build before use.
- `ROCBLAS_USE_HIPBLASLT=1` with hipBLASLt installed, and `GGML_HIP_ROCWMMA_FATTN`
  builds (lemonade-sdk/llamacpp-rocm, kyuz0 toolboxes) — ROCm reading at depth.
- `-ctk q8_0 -ctv q8_0` (needs flash attention on; see the fatal `-fa off` case).
- `--load-mode` / no-mmap on unified-memory machines; ubatch sweeps (RADV collapsed
  at ubatch 512 at 32k depth before PR #27703).
- Skipped: forks (ik_llama.cpp — no router mode, mixed results), the NPU path
  (FastFlowLM — proprietary kernels, few models), kernel parameters (`amd_iommu=off`,
  `amdgpu.lockup_timeout`) — admin changes an app cannot make.
- Sources: ggml-org/llama.cpp #19523, #30364, #22384, discussion #23659; Level1Techs
  "Strix Halo LLM inference notes"; llm-tracker.info Strix Halo; sleepingrobots.com
  MTP on Strix Halo; Phoronix ROCm 7 on Strix Halo.
