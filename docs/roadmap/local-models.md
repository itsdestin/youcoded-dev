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
      `local-models-screen` `all` `confirmed` `checked 2026-09-03` `v1.3.1` → docs/active/investigations/2026-09-03-formalization-costs-and-risks.md

- [ ] Three faster engine builds upstream ships that we still do not offer: Intel SYCL, a newer
      CUDA than the one we pin, and Android. ROCm is available on AMD Linux and Windows, but as an
      optional thing rather than a recommendation, because it turned out not to be a straight win:
      it shipped for a day labelled "faster on AMD" with nobody having timed it, and when it was
      timed on the Strix Halo desktop it read the conversation about 20% faster and wrote its
      replies 24-46% SLOWER than what we already used. So the rule for the remaining three is
      stricter than "try it": time BOTH halves — reading the conversation and writing the reply —
      on the machine each one targets, before it is offered at all. The Android one also has no
      local engine to attach to yet.
      `settings/local-models` `desktop` `decision` `checked 2026-09-06` `performance` → docs/active/investigations/2026-09-04-local-model-runner-audit.md

- [ ] Parity with LM Studio / Ollama / Jan — what is LEFT after the 2026-09-05 upgrades. Shipped:
      per-model context length, keep-loaded, GPU layers and extra engine options, and a live line
      on the engine card saying what hardware is in use, how much is loaded and how fast the last
      reply ran, plus loading a model by hand (the unloaded row's Reload button). Still missing:
      UNLOADING one by hand, embeddings for local search, a draft-model picker, and a real
      hardware page rather than that one line. Inventory and order in the report.
      `settings/local-models` `desktop` `decision` `checked 2026-09-06` → docs/active/investigations/2026-09-04-local-model-runner-audit.md

- [ ] The model list says whether a model FITS and nothing about whether it will be fast, and
      the two are unrelated. Destin picked a 27B on size and got 3 tokens a second. Measured on
      the Strix Halo the same day: Qwen3.8-27B (29.3 GB) reads 216 and writes 5.3 tokens a
      second, while Qwen3.6-35B-A3B (30.4 GB — the SAME size on disk) reads 707 and writes 31.
      Six times faster for the same memory, because only about 3B of it is used per token.
      Anyone choosing on size alone reliably picks the slower one. Wanted: an estimated
      tokens-per-second **tag with a red / yellow / green colour**, sitting alongside the cost
      and intelligence tags Destin wants in the model selector — not a number buried in the size
      breakdown. The inputs are already there: the file's own header carries the active
      parameter count (the reader landed with the 2026-09-05 upgrades) and the engine reports
      the real rate of the last reply, so the estimate can be corrected against measurement
      rather than staying a guess. Undesigned: what the three colours mean (bands are hardware-
      relative — 5/s is poor on this machine and good on a laptop), how a model nobody has run
      yet is estimated, and whether hosted models get the same tag.
      `model-picker` `all` `confirmed` `checked 2026-09-06` `performance`
- [ ] Installing the local-model engine still asks the computer to unpack the download with a
      program the app does not ship, so a machine without it fails at a step the user did not know
      existed. Lower risk than the speech model was — the shapes it downloads need no extra helper
      on any of the three platforms — but it is the same dependency, and voice now unpacks its own
      downloads with nothing outside the app. Worth sharing that
      `settings/local-models` `all` `needs-verify` `checked 2026-09-05`

- [ ] Open Model Providers on a computer whose models were downloaded before this feature and
      there are no "Add vision" links at all — they appear only if you close the screen and
      open it again. The lookup that decides which models could see images is deliberately
      fired and forgotten so the list is never held up by Hugging Face, and nothing tells the
      screen when the answers arrive ("The answers appear the next time the screen opens",
      engine-manager.ts). A user who opens that screen once may never be offered vision at all.
      Fix is a push from main when a backfill pass writes something, which is a new IPC channel
      and therefore desktop + Android + remote parity work — too wide to bolt onto the
      acceptance fixes. NOT the same as the vision item closed above, which was about the
      projector file never being downloaded, and NOT the same route as the model-picker refresh
      fixed on `feat/leu-t24-accept-fixes`: that one rides the download-progress push, and no
      download is running when a backfill lookup answers. Worth knowing while you are here:
      `engine:models-changed` LOOKS like the channel for all of this and is not — it is declared
      in `preload.ts` and `shared/types.ts` and nothing in the main process ever sends it
      (`rg -n "ENGINE_MODELS_CHANGED" desktop/src/` → a declaration and a listener, no sender),
      and it would only fire while the engine process is running anyway.
      `desktop` `confirmed` `checked 2026-09-06`

- [ ] Make the local-engine auto-unload timeframes user-configurable in the Assistant
      settings panel. Today a model auto-sleeps after 15 minutes idle (`sleep-idle-seconds`,
      engine-wide default 900) and the whole engine stops after 25 minutes idle (`idleMs`),
      both hard-coded in `engine-supervisor.ts`. Surfaces: the per-model auto-sleep and the
      whole-engine shutdown. The Assistant settings panel it was waiting on exists now
      (2026-09-07); the two values still ride nothing
      `settings/local-models` `desktop` `confirmed` `checked 2026-09-16`

- [ ] **v1.3.1 release blocker.** The file downloader exists three times (model files, the
      engine, voice assets) and the checksum helper four times, so a fix to one — like the
      disk-full crash guard added 2026-09-16 — has to be found and repeated in the others.
      Wanted: one download-and-verify module every caller uses, with one disk-full test covering
      all three; and the engine manager's three direct calls to the local engine going through
      the supervisor's tracked path like the rest — simplification phase 5, D7 and D12. Nothing
      changes on screen. On hold since 2026-09-18 (Destin); resumes with the rest of phase 5
      `desktop` `blocked` `checked 2026-09-18` `v1.3.1` → docs/active/plans/2026-09-16-simplification-phases.md
