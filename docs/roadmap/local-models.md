# local-models — getting a model onto this machine and serving it
Filing test: getting a model onto this machine and serving it — downloads, disk, the engine
process. Would this break the same way on a cloud model? No. (Yes → native-harness.)

- [ ] Loading a second large local model took the whole machine down — Qwen3.5-122B and
      Qwen3.6-35B resident together on the Strix Halo desktop (2026-08-16) lost the desktop
      shell, YouCoded, Chrome and Steam. The app's memory warning never appeared. Waits on
      Destin: auto-unload the first model silently, with a toast, or hard-block — and whether
      one model alone should be blocked when it will not fit the GPU pool.
      `desktop` `decision` `checked 2026-09-01` → docs/active/investigations/2026-08-16-dual-model-oom-desktop-crash.md

- [ ] "Run in background" option — keep the downloaded models serving other AI tools on this
      machine after the YouCoded window closes; today the engine is deliberately stopped on
      quit. Destin's note during the 2026-07-20 engine-lifecycle fix; only if real demand shows.
      `desktop` `parked` `checked 2026-07-20`

- [ ] DiffusionGemma support — a block-diffusion model the bundled engine cannot run; the
      upstream engine support is an unmerged pull request needing a separate runner. Revisit
      only when mainline llama.cpp and llama-server can serve it, then add a catalog entry.
      `desktop` `parked` `checked 2026-07-13`
