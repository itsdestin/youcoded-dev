# local-models — getting a model onto this machine and serving it
Filing test: getting a model onto this machine and serving it — downloads, disk, the engine
process. Would this break the same way on a cloud model? No. (Yes → native-harness.)

- [ ] Loading a second large local model took the whole machine down — Qwen3.5-122B and
      Qwen3.6-35B resident together on the Strix Halo desktop (2026-08-16) lost the desktop
      shell, YouCoded, Chrome and Steam. The app's memory warning never appeared. Waits on
      Destin: auto-unload the first model silently, with a toast, or hard-block — and whether
      one model alone should be blocked when it will not fit the GPU pool.
      Destin 2026-09-02: warn and let me choose. The same fix must count memory for several sessions sharing one model, and must NOT warn on machines whose memory is deliberately full of cache that the model load can reclaim
      `desktop` `confirmed` `checked 2026-09-02` → docs/active/investigations/2026-08-16-dual-model-oom-desktop-crash.md

- [ ] A local model's helper limit is decided when the conversation opens, before the model has
      loaded — and asking the engine about an unloaded model would load it — so most local
      conversations still get the one-helper cap until they are resumed after a first message.
      The number should be re-read once the model is actually loaded (after the first turn), or
      taken from any model the engine already has loaded. Follow-on to the slot-count fix
      `desktop` `confirmed` `checked 2026-09-04`

- [ ] "Run in background" option — keep the downloaded models serving other AI tools on this
      machine after the YouCoded window closes; today the engine is deliberately stopped on
      quit. Destin's note during the 2026-07-20 engine-lifecycle fix; only if real demand shows.
      `desktop` `parked` `checked 2026-07-20`

- [ ] DiffusionGemma support — a block-diffusion model the bundled engine cannot run; the
      upstream engine support is an unmerged pull request needing a separate runner. Revisit
      only when mainline llama.cpp and llama-server can serve it, then add a catalog entry.
      `desktop` `parked` `checked 2026-07-13`

- [ ] Gemma models download with no licence notice, and Google's Gemma terms require passing their
      use restrictions on to the user; Qwen and GPT-OSS are Apache-licensed and need nothing
      `local-models-screen` `all` `confirmed` `checked 2026-09-03` `v1.3` → docs/active/investigations/2026-09-03-formalization-costs-and-risks.md

- [ ] Local models rewrite files at a crawl — an edit-style reply that the engine can produce at
      ~100 tokens a second comes out at ~16, because the engine's built-in draft-free speculative
      decoding is switched off. Measured 6× on a rewrite, no change on prose (2026-09-04).
      Flag added on branch `feat/engine-speed-flags` (youcoded), probes green, awaiting merge.
      `desktop` `in-flight` `checked 2026-09-04` `performance` → docs/active/investigations/2026-09-04-local-model-runner-audit.md

- [ ] Long conversations slow down more than they need to and eat memory — the context cache is
      stored at full size; compressing it (q8) measured +40% generation speed at 16k of context
      and halves the memory the context needs. Same fix feeds the memory-crash item above.
      Key-cache half added on branch `feat/engine-speed-flags` (youcoded); the value-cache half
      is a fatal load error without flash attention, so it stays a decision for Destin.
      `desktop` `in-flight` `checked 2026-09-04` `performance` → docs/active/investigations/2026-09-04-local-model-runner-audit.md

- [ ] The memory warning charges a flat 2 GB of "working memory" for every model at every context
      length, but a 128k context on a 27B model needs up to ~32 GB of it — so the warning is wrong
      exactly when it matters. Computable from the model file's own header.
      `desktop` `confirmed` `checked 2026-09-04` → docs/active/investigations/2026-09-04-local-model-runner-audit.md

- [ ] Context length is one number for every local model — right for the big one, wasteful for a
      2B utility model and dangerous for a dense 27B. The engine already supports a per-model
      settings file; nothing writes it.
      `desktop` `confirmed` `checked 2026-09-04` → docs/active/investigations/2026-09-04-local-model-runner-audit.md

- [ ] Windows "Switch to CUDA (faster on NVIDIA)" very likely fails on a PC without NVIDIA's
      toolkit installed: upstream ships the CUDA runtime files as a separate download and the app
      never fetches them. Needs a Windows repro.
      `desktop` `needs-verify` `checked 2026-09-04` `needs-repro` → docs/active/investigations/2026-09-04-local-model-runner-audit.md

- [ ] "Gemma 4 12B — with vision" cannot see: the vision projector file is never downloaded, and
      the engine only pairs one when model and projector sit in their own folder, which our flat
      download layout never creates. Local vision needs both changes.
      `desktop` `confirmed` `checked 2026-09-04` → docs/active/investigations/2026-09-04-local-model-runner-audit.md

- [ ] Backends upstream now ships that we do not offer — AMD ROCm on Linux and Windows, Intel
      SYCL, newer CUDA, Android. ROCm on AMD machines like Destin's is widely reported faster than
      what we use; one measured trial decides whether it becomes an opt-in.
      `desktop` `decision` `checked 2026-09-04` `performance` → docs/active/investigations/2026-09-04-local-model-runner-audit.md

- [ ] Parity with LM Studio / Ollama / Jan — per-model settings (context, keep loaded, draft
      model), a hardware/what's-loaded page with prompt speed and time-to-first-token, manual
      load/unload, embeddings for local search. Inventory and order in the report.
      `desktop` `decision` `checked 2026-09-04` → docs/active/investigations/2026-09-04-local-model-runner-audit.md

- [ ] Some publishers name a model's quantisation after a dot instead of a dash, and the app
      drops every one of their files — `mradermacher/gemma-3-12b-it-GGUF` offers no real
      download option at all, only (until T14's fix) a mislabelled vision file. Whoever picks
      this up should survey how many of the repos search returns are affected before widening
      the name pattern, because loosening it wrongly makes unrelated files look like quants.
      `local-models` `desktop` `confirmed` `checked 2026-09-05`
