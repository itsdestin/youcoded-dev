---
date: 2026-09-04
status: active
type: investigation
topic: how YouCoded runs local models today, what the engine already does for free, which cheap flags were measured to help, and what other runner apps have that we do not
tags: [local-models, engine, performance, parity]
---

# Local model runner audit (2026-09-04)

Asked by Destin: how do we maximize local-model performance across model types, what
easy wins exist, and what is missing for parity with LM Studio / Ollama / Jan.

Everything below was checked against the pinned engine build `b10665` on the Z13 (Strix
Halo, 128 GB unified, Vulkan/RADV, Mesa 26.2). Numbers were measured with the dev copy of
the pinned binary on an isolated port, never against the live app.

## 1. What runs today

One `llama-server` process in **router mode**. The exact spawn shape:

```
--host 127.0.0.1 --port 9920 --no-webui --jinja --models-dir ~/.cache/llama.cpp
--models-max 2 --sleep-idle-seconds 300 -c <contextSize>
```
<!-- claim: {"path": "youcoded/desktop/src/main/engine/engine-supervisor.ts", "contains": "'--models-max', String\\(MODELS_MAX\\)"} -->

Every other knob is the engine's default. The user-facing settings are exactly two: a
global context length (default 32,768; Destin's machine is at 128,000) and, on Windows,
a "Switch to CUDA" button. There is no per-model setting of any kind. Android has no
local engine at all (desktop-only, by design until Phase 5).

### What the engine already does for free on b10665 (verified from `--help`)

| Setting | Default | Meaning for us |
|---|---|---|
| `-ngl` (GPU layers) | `auto` | Full GPU offload happens without us asking |
| `--fit` | `on` | Engine shrinks GPU layers to fit device memory; `-c` is set by us so it never shrinks context |
| `-fa` (flash attention) | `auto` | On for Vulkan/Metal/CUDA where supported |
| `-np` (slots) / `--kv-unified` | auto / on | 4 slots sharing ONE context pool, so 128k is not 4×128k |
| `--cont-batching` | on | Parallel specialists batch correctly |
| `--reasoning-format` | `auto` | Thinking is split into `reasoning_content` |
| `--jinja` | on (we pass it anyway) | Native tool calling |
| `-t` (threads) | auto | Fine |
| `-ctk/-ctv` (KV cache type) | **f16** | Full-size context memory — see §2 |
| `--spec-type` | **none** | No speculative decoding — see §2 |
| `--cache-reuse` | **0** | No KV shifting on edited prompts |
| `--context-shift` | off | Correct for us (we trim ourselves) |

So the big-ticket items other runners advertise (GPU offload, flash attention, memory
fit, continuous batching) are already on. What is off is the second tier.

## 2. Measured easy wins (Qwen3.5-9B Q8_0, this laptop)

### 2a. Speculative decoding without a draft model: `--spec-default` — the largest win

The engine (since ~b10000) ships n-gram speculation that needs **no second model**: it
guesses upcoming tokens from text already in the prompt. Agentic work is exactly that
shape — Edit/Write tool calls echo file contents, rewrites echo the input.

| Task | Baseline t/s | `--spec-default` t/s | `--spec-type ngram-mod` t/s |
|---|---|---|---|
| Rewrite a 60-line file with one change (736 tokens) | 16.3 / 16.7 | **104.0 / 200.5** | 103.3 / 110.6 |
| 500-word essay (700 tokens, nothing to copy) | 9.0 | 9.3 | — |

Drafted 768 tokens, accepted 673–722 (~90%) on the rewrite. On the essay the drafter
never fired (`draft_n` absent) and speed was unchanged, so there is no measured penalty
on prose. **6× faster on the workload where small local models feel slowest** — one flag,
no download. Caveat: measured on ONE model and ONE build on ONE machine; the rule for
the spawn shape is to re-probe on every engine bump, and this flag must join that probe.

### 2b. Quantized KV cache: `-ctk q8_0 -ctv q8_0` — halves context memory, faster at depth

`llama-bench`, prompt 512 / gen 128, **after 16,384 tokens of context** (the realistic
mid-session case), flash attention on:

| K / V type | prompt t/s | gen t/s |
|---|---|---|
| f16 / f16 (today) | 280.7 | 11.4 |
| q8_0 / f16 | 452.1 | 16.2 |
| f16 / q8_0 | 597.8 | 16.3 |
| q8_0 / q8_0 | 582.1 | **16.6** |

At zero depth (FA on/off, f16) generation was 11.3–11.7 t/s, so the depth penalty at f16
is what q8_0 removes. Quality cost of q8_0 KV is generally reported as negligible; q4_0
is not (do not go there by default). Memory: f16 KV per token from the GGUF headers
(upper bounds — Qwen3.5 hybrid layers and Gemma sliding-window layers use less):

| Model on this machine | f16 KV @ 32k | f16 KV @ 128k | q8_0 @ 128k |
|---|---|---|---|
| Qwen3.5-9B | 4.0 GiB | 15.6 GiB | ~8 GiB |
| Qwen3.8-27B | 8.1 GiB | **31.7 GiB** | ~16 GiB |
| Qwen3.6-35B-A3B | 2.6 GiB | 10.0 GiB | ~5 GiB |
| Gemma-4-E2B | 2.2 GiB | 8.5 GiB | ~4 GiB |

This is directly connected to the open 2026-08-16 memory crash: the fit estimator
charges a flat **2 GB** for "working memory" regardless of context length
<!-- claim: {"path": "youcoded/desktop/src/main/models/fit-estimator.ts", "contains": "OVERHEAD_BYTES = 2 \\* GB"} -->
while Destin's 128k setting on the 27B model can need ~32 GB of it. The guard cannot be
right until it computes KV from the model's layer/head metadata × the configured context.

### 2c. Not measured here but cheap

- `--cache-reuse 256`: lets an edited or trimmed prompt reuse the cached prefix by KV
  shifting instead of re-reading everything. Relevant to the cache-efficiency item
  (`fitToContext` front-trims, killing the prefix every step).
- `--fit-target`: the engine's 1 GiB margin per device is thin on a laptop that also
  runs a browser; a larger margin trades a few layers for not stalling the desktop.

## 3. Things that are wrong or misleading today

1. **Windows "Switch to CUDA" very likely cannot boot on a machine without the CUDA
   toolkit.** Upstream ships the CUDA runtime DLLs as a *separate* asset
   (`cudart-llama-bin-win-cuda-12.4-x64.zip`, 373 MB, listed alongside every CUDA build in
   the release notes); the app downloads only the engine zip and has no handling for the
   runtime (`rg -i cudart youcoded/desktop/src` → 0 hits). Verify-boot would fail and the
   user sees an error with no fix. Needs a Windows repro; the structure is unambiguous.
2. **"Gemma 4 12B — Capable Google model with vision" cannot see.** The quant parser
   denylists `mmproj*` files so the vision projector is never downloaded, and the router
   pairs a projector only when model + `mmproj-*.gguf` sit in a **subdirectory** of the
   models dir (upstream README b10665) — the downloader writes flat basenames by contract.
   Local vision today requires a hand-built folder, which no user will do.
3. **Context length is one number for every model.** 128k is right for the 122B MoE and
   wrong for a 2B utility model (wastes memory) and for the 27B dense (32 GB). The router
   supports `--models-preset` (INI: per-model `c`, `ngl`, `model-draft`, `load-on-startup`)
   — the mechanism for per-model settings already exists and is unused.
4. **Backends we do not offer that upstream now ships for b10665:** Linux ROCm 7.14
   (204 MB), Windows ROCm 7.14 (230 MB), Windows CUDA 13.3, Windows arm64 CUDA 13.4,
   Intel SYCL (Linux + Windows), OpenVINO, **Android arm64**. `engine-dependencies.md`'s
   "no upstream Linux CUDA asset" is still true, but the AMD story changed: ROCm on Strix
   Halo / RDNA cards is widely reported faster than Vulkan for generation, and this laptop
   measured 11–16 t/s on a 9B Q8 (about 40% of the memory-bandwidth ceiling). Worth one
   measured trial, not a blind switch — ROCm needs host drivers Vulkan does not.
5. The UI shows tok/s in the status bar but nothing about prompt-processing speed, time to
   first token, or which device a model landed on; there is no manual load/unload/"keep
   loaded"; the 5-minute sleep and 10-minute engine stop are not adjustable.

## 4. Parity gaps versus LM Studio / Ollama / Jan

What all three have and we do not (features, not code):

- **Per-model settings**: context length, GPU offload, KV type, speculative draft model,
  "keep in memory" / idle TTL. (LM Studio: per-model config; Ollama: Modelfile +
  `keep_alive`.) We have the router preset mechanism to build it on.
- **Speculative decoding** as a visible option (Ollama 0.24 added MTP drafts; LM Studio has
  a draft-model picker). Our free n-gram variant is the zero-download version.
- **Vision for local models** end to end (projector download + pairing).
- **Embeddings / reranking** — needed for any local RAG or "search my files" feature;
  `llama-server` serves `/v1/embeddings` today, we expose nothing.
- **Hardware page**: which GPU, how much memory, what is loaded where, live tok/s + TTFT.
- **Serve to other apps** ("Run in background" is already parked on the roadmap; LM Studio
  and Ollama are used as backends by other tools).
- **Apple MLX** (LM Studio, Ollama) — faster than llama.cpp on Apple Silicon for many
  models; a second engine, not a flag. Park.
- **Android on-device** — upstream now ships an Android arm64 build of `llama-server`;
  PocketPal/MLC-class apps run 2–4B models on phones. Phase 5 territory.

What we have that they do not: fit labels from live HF metadata, resumable multi-part
downloads, tool-calling probes pinned per engine build, and the whole agent harness.

## 5. Recommended order

1. **Add `--spec-default` and `-ctk q8_0 -ctv q8_0` to the spawn shape** behind a re-run
   of `probe-{health,models,chat,tools,download}.mjs` plus a new speed probe (this
   document's rewrite test) so the gain is pinned per bump. Two flags; both revertible.
2. **Fix the memory guard**: KV bytes from GGUF metadata × context × KV type, replacing
   the flat 2 GB — this also unblocks the 2026-08-16 crash item, whose decision Destin gave
   on 2026-09-02 ("warn and let me choose").
3. **Per-model context via `--models-preset`**, surfaced as a small per-model row (context
   length; later draft model / keep-loaded).
4. **Ship the CUDA runtime** with the Windows CUDA build (or detect a toolkit first).
5. **Vision**: download `mmproj` when the repo has one, write model + projector into a
   subdirectory, adjust the cache scan and the flat-basename contract (probe-pinned — this
   is the one that needs care).
6. **Trial ROCm on the Z13** with `llama-bench`, same model; adopt as an opt-in backend
   only if it wins by a margin users would notice.

## Verification log

- `--help` of `~/.config/youcoded-dev/engine/b10665-vulkan/llama-b10665/llama-server`
  (dev-profile copy of the pinned build) — all defaults in §1.
- `llama-bench -m Qwen3.5-9B-Q8_0.gguf -p 512 -n 128 -fa 0,1 -r 2` and
  `… -fa 1 -ctk f16,q8_0 -ctv f16,q8_0 -d 16384 -r 2` — §2b. GPU at 2.2 GHz / 68 W /
  100% busy during the run (not power-wedged). Another session's probe server held two
  small models at the time; treat ±10% as noise.
- Isolated `llama-server` on port 8399, `-c 16384`, thinking off, temperature 0 for the
  rewrite and 0.7 for the essay — §2a. `timings.draft_n` / `draft_n_accepted` read from the
  response.
- GGUF header parse (python, no weights read) for layers × kv-heads × head-dim — §2b table.
- `gh api repos/ggml-org/llama.cpp/releases/tags/b10665` — asset list and release body
  (CUDA DLL note) — §3.1, §3.4.
- Upstream `tools/server/README.md` at tag b10665 — subdirectory + `mmproj` pairing and
  `--models-preset` keys — §3.2, §3.3.
