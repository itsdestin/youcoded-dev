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

- [ ] A local model can only ever run one helper at a time, and the app over-reports the
      context a local session has. Measured 2026-09-04 against the engine build the app ships:
      the app asks the engine for its slot count without naming a model and under a field name
      this build does not use, so it always reads "unknown" and allows one helper. (The
      context readout is a separate, smaller issue: with the app's launch shape all concurrent
      requests share one pool the size of the configured window, so four helpers get a quarter
      each and the readout does not say so.) Fix on youcoded `fix/engine-slot-count-field`
      (`984b3410`, unmerged)
      `desktop` `in-flight` `checked 2026-09-04`

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
