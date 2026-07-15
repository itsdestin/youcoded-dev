# ADR 007: llama.cpp-Direct Local Engine (llama-server Backbone, No Ollama Default)

**Status:** Accepted
**Date:** 2026-07-09 (approved by Destin during platform-vision review)
**Context doc:** `docs/active/specs/2026-07-09-platform-vision-roadmap.md` §3.1

## Context

The local-model default must not depend on Ollama (Destin's explicit requirement; Ollama has drifted toward a product with its own gravity — engine fork, `:cloud` routing — and its per-model defaults are agent-hostile, e.g. silent small-context truncation). Two ways to run llama.cpp directly: in-process via `node-llama-cpp`, or a supervised `llama-server` subprocess.

## Decision

**Bundled/downloaded `llama-server` in router mode is the backbone.** One supervised subprocess (`--host 127.0.0.1 --no-webui --jinja`, shifted free port): auto-discovers GGUFs in the llama.cpp cache, hot-loads on first request, LRU-evicts, isolates each model in its own child process, speaks OpenAI-compatible HTTP with native tool-call templates and grammar-constrained JSON.

Packaging: ship CPU + Vulkan (+ Metal on macOS) engine binaries (~100 MB); CUDA as opt-in post-install download. Engine version pinned, updatable independently of app releases (the Jan/LM Studio pattern). Coupling tracked in `youcoded/docs/engine-dependencies.md`.

**`node-llama-cpp` is reserved for narrow in-process niches** (token-level UX, instant tiny-model utility features, embeddings without a server round trip) if wanted later. The provider layer hides which engine is underneath — reversible, additive.

**Ollama and LM Studio are optional endpoints only** — alternate OpenAI-compat baseURLs plus detectors. Never required, never the default.

## Alternatives considered

- **node-llama-cpp as backbone** — best-in-class in-process function-calling API, but a native crash kills Electron main, engine updates require app releases, and nothing is reusable for Android/LAN. Rejected as backbone, retained as niche option.
- **Keep Ollama (the opencode-MVP approach)** — rejected: recreates the external-product dependency this architecture removes, on the app's default path.

## Consequences

- YouCoded owns engine supervision, the GPU-backend matrix (Vulkan default, CUDA opt-in, CPU fallback), and a curated model catalog with RAM/VRAM-fit UX.
- Android reuses the same binary (Termux runtime) and the same protocol (LAN client to the desktop's server).
- llama.cpp flag/API churn is a tracked coupling, mitigated by version pinning + smoke probes (the `cc-dependencies.md` discipline).
