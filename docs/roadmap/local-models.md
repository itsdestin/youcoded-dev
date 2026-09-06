# local-models — getting a model onto this machine and serving it
Filing test: getting a model onto this machine and serving it — downloads, disk, the engine
process. Would this break the same way on a cloud model? No. (Yes → native-harness.)

- [ ] Loading a second large local model took the whole machine down — Qwen3.5-122B and
      Qwen3.6-35B resident together on the Strix Halo desktop (2026-08-16) lost the desktop
      shell, YouCoded, Chrome and Steam. **The warning half is fixed**: the numbers behind it are
      now real (the model's own file, the graphics chip's own pool, only models actually holding
      memory), and it warns before a download and before a session. What is still open is what the
      app should DO when two models cannot fit even with honest numbers — quietly unload the
      first, unload it with a toast, or refuse outright. Destin 2026-09-02: warn and let me
      choose. Still true of any fix: count memory once for several sessions sharing one model, and
      do not warn on a machine whose memory is deliberately full of cache the load can reclaim.
      `settings/local-models` `desktop` `decision` `checked 2026-09-06` → docs/active/investigations/2026-08-16-dual-model-oom-desktop-crash.md

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

- [ ] Three faster engine builds upstream ships that we still do not offer: Intel SYCL, a newer
      CUDA than the one we pin, and Android. ROCm is done — AMD machines on Linux and Windows are
      offered it now, so this is what is left. Each needs the same measured trial ROCm got before
      it becomes an option, and the Android one has no local engine to attach to yet.
      `settings/local-models` `desktop` `decision` `checked 2026-09-06` `performance` → docs/active/investigations/2026-09-04-local-model-runner-audit.md

- [ ] Parity with LM Studio / Ollama / Jan — what is LEFT after the 2026-09-05 upgrades. Shipped:
      per-model context length, keep-loaded, GPU layers and extra engine options, and a live line
      on the engine card saying what hardware is in use, how much is loaded and how fast the last
      reply ran. Still missing: loading and unloading a model by hand, embeddings for local
      search, a draft-model picker, and a real hardware page rather than that one line. Inventory
      and order in the report.
      `settings/local-models` `desktop` `decision` `checked 2026-09-06` → docs/active/investigations/2026-09-04-local-model-runner-audit.md

- [ ] Whole publishers' models are invisible in search because of how they punctuate filenames.
      Measured over 10 real repos on 2026-09-05: `mradermacher/gemma-3-12b-it-GGUF` (13 files,
      0 offered) and **`TheBloke/Llama-2-7B-Chat-GGUF` (12 files, 0 offered)** both write
      `<name>.Q4_K_M.gguf` with a dot, and TheBloke is one of the largest GGUF publishers on
      Hugging Face. A THIRD, separate cause: `Mungert/gemma-3-4b-it-gguf` (24 files, 0 offered)
      is rejected on case, not punctuation — lowercase double-quant names like
      `gemma-3-4b-it-f16-q8_0.gguf`. Worth splitting into the two causes when picked up, and
      worth surveying how many of search's results are affected before widening the pattern:
      loosening it wrongly makes unrelated files look like downloadable models.
      `desktop` `confirmed` `checked 2026-09-05`

- [ ] Starting a session on a hosted model builds and throws away every other provider's model
      list, for the same reason a local session used to. Measured 2026-09-05 while fixing the
      local half: `pricingFor` hands the catalog the whole provider list when it only ever reads
      the binding's own provider, and a total network failure is never remembered, so the cost
      repeats on every create, resume and model swap. The local half is fixed and pinned; this
      is the same one-line narrowing in `ipc-handlers.ts`'s pricing closure.
      `desktop` `confirmed` `checked 2026-09-05`

- [ ] A vision model downloaded while the app is already running can be told to the assistant as
      text-only. The engine does re-read the file pairing on request, and a download completing
      does ask it to — but fire-and-forget with a swallowed error, while the model's profile is
      settled once when the session starts. Lose that race and Local Models says "vision ready"
      while the assistant is told the model cannot see, so the user attaches a picture and it
      silently vanishes. Found reviewing the vision work 2026-09-05; deriving the answer from the
      files on disk as well as from the engine would close it for good.
      `local-models-screen` `desktop` `confirmed` `checked 2026-09-05`
- [ ] Installing the local-model engine still asks the computer to unpack the download with a
      program the app does not ship, so a machine without it fails at a step the user did not know
      existed. Lower risk than the speech model was — the shapes it downloads need no extra helper
      on any of the three platforms — but it is the same dependency, and voice now unpacks its own
      downloads with nothing outside the app. Worth sharing that
      `settings/local-models` `all` `needs-verify` `checked 2026-09-05`

- [ ] The Local Models list would crash a phone or a browser the day either one gets a local
      engine. Asking "what have I downloaded?" is the one engine question whose failure is still
      handed back as a success: a phone answers "not supported on mobile" as an object, the screen
      is written to expect a list, and the first thing it does is filter it — which throws and
      takes the whole screen down. Six sibling questions were fixed for exactly this on
      2026-09-05 and this one was knowingly left out. Nobody can see it today because the whole
      section is hidden off the desktop; it is a trap sprung by opening that gate.
      `settings/local-models` `android` `confirmed` `checked 2026-09-06`
