# local-models — getting a model onto this machine and serving it
Filing test: getting a model onto this machine and serving it — downloads, disk, the engine
process. Would this break the same way on a cloud model? No. (Yes → native-harness.)

- [ ] Gemma models download with no licence notice, and Google's Gemma terms require passing their
      use restrictions on to the user; Qwen and GPT-OSS are Apache-licensed and need nothing.
      `local-models-screen` `all` `confirmed` `P1` `checked 2026-09-03` `v1.3.1` → docs/active/investigations/2026-09-03-formalization-costs-and-risks.md

- [ ] The file downloader exists three times (model files, engine, voice assets) and the checksum
      helper four times, so a fix to one (like the disk-full crash guard) must be repeated in the
      others. Wanted: one download-and-verify module every caller uses, one disk-full test covering
      all three, and the engine manager's three direct calls going through the supervisor's tracked
      path (simplification phase 5, D7 and D12). Nothing changes on screen. On hold since 2026-09-18
      (Destin); resumes with the rest of phase 5.
      `desktop` `blocked` `P1` `checked 2026-09-18` `v1.3.1` → docs/active/plans/2026-09-16-simplification-phases.md

- [ ] The model list says whether a model FITS and nothing about whether it will be fast. Destin
      picked a 27B on size and got 3 tokens a second; on the Strix Halo Qwen3.8-27B (29.3 GB) writes
      5.3 tokens a second while Qwen3.6-35B-A3B (the same size on disk) writes 31. Wanted: an
      estimated tokens-per-second tag with a red / yellow / green colour, beside the cost and
      intelligence tags Destin wants in the model selector. Inputs exist (the file's active-parameter
      count; the engine's measured rate of the last reply). Undecided: what the colours mean (bands
      are hardware-relative), how an unrun model is estimated, whether hosted models get the tag.
      `model-picker` `all` `confirmed` `P2` `checked 2026-09-06` `performance`

- [ ] Local engine: 3 open decisions.
      (a) Two large models loaded together took the whole machine down (Qwen3.5-122B plus
      Qwen3.6-35B, 2026-08-16). The warning is fixed with honest numbers; still open is what to do
      when two cannot fit — Destin: warn and let me choose (report:
      docs/active/investigations/2026-08-16-dual-model-oom-desktop-crash.md). (b) Three faster engine
      builds upstream ships are not offered (Intel SYCL, newer CUDA, Android); time BOTH reading and
      writing on the target machine first, since ROCm wrote replies 24-46% slower. (c) Parity with
      LM Studio / Ollama / Jan: still missing are unloading a model by hand, embeddings for local
      search, a draft-model picker and a real hardware page (report:
      docs/active/investigations/2026-09-04-local-model-runner-audit.md).
      `settings/local-models` `desktop` `decision` `P3` `checked 2026-09-06` `performance`

- [ ] Local models screen: 3 small faults.
      (a) Installing the engine asks the computer to unpack the download with a program the app does
      not ship, so a machine without it fails at a step the user didn't know existed. (b) On a
      computer whose models were downloaded earlier, Model Providers shows no "Add vision" links until
      you close and reopen the screen, so a user may never be offered vision; the fix needs a new push
      from the main process (desktop, Android and remote parity). (c) Auto-sleep (15 min idle) and
      engine shutdown (25 min idle) are fixed; they should be settable in the Assistant settings panel.
      `settings/local-models` `all` `confirmed` `P3` `checked 2026-09-05`

- [ ] Parked ideas: 2 local-model ideas.
      (a) A "Run in background" option keeping downloaded models serving other tools after the
      YouCoded window closes; only if real demand shows. (b) DiffusionGemma support; revisit when
      mainline llama.cpp can serve it.
      `desktop` `parked` `P3` `checked 2026-07-13`
