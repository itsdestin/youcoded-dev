# Local engine upgrades — design review round 3, final (2026-09-05)

Design: `docs/active/specs/2026-09-05-local-engine-upgrades-technical-design.md` (after round
2). Same two lenses, fresh agents: 3a correctness/robustness (R3-1…R3-6), 3b
complexity/omissions/roadmap (R3-20…R3-28). **13 accepted, 1 rejected, 1 duplicate merged.**
Everything marked **probed** was run against the installed b10665 on high free ports
(19417–19428), each process killed by a pid derived in the same command; the live engine on
9920 was never touched.

Round 3 is the cap. Unlike rounds 1 and 2, which sharpened wording, two findings here changed
**decisions**, and both are user-visible — see "What changed for the user" below.

| id | section | finding (one line) | verdict |
|---|---|---|---|
| R3-1 | C2 | A mistyped extra engine flag does not stop one model — the router refuses to initialise on an unrecognised key in ANY section, so the WHOLE engine dies at the next spawn. | accepted — **probed**: `not-a-real-flag = 7` in a per-model section → exit 1, `failed to initialize router models: option 'not-a-real-flag' not recognized in preset '<id>'`; a running engine survives (`?reload=1` → 500, `/health` → 200), so it only surfaces at the next launch. Fix: validate a saved flag by running the binary against a throwaway one-section preset, and retry a failing preset once at spawn with that section omitted |
| R3-2 | C2/J | A missing or half-written `models.ini` is also fatal to boot, but §J's copy assumed the engine keeps running; `~/.youcoded/` is shared between the dev instance and the built app, so two supervisors can rewrite it at once. | accepted — **probed**: missing preset → exit 1, `preset file does not exist`. Temp-file + rename as `download-manifest.ts` does; spawn omits `--models-preset` and falls back to the `-c` / `--sleep-idle-seconds` command line when the file is unusable; a second failure sentence for that case |
| R3-3 | D2 | Making the pool the GPU device total turns every model bigger than VRAM into a non-dismissible `too-large`, which **hard-blocks session creation** — for models that today read "splits across GPU + system RAM, runs at decent speed" and that llama.cpp's `-ngl auto` really does run. | accepted, **narrows R1-7** — the device total keeps only the "fits entirely on the GPU" tier; `too-large` is now measured against `pool − loadedBytes + MemAvailable`. Evidence: `fit-estimator.ts:24-36` (the tier being deleted), `RuntimeBinding.tsx:202,216` (`too-large` → `nativeCreateBlocked`), `--help` (`-ngl` default `auto`) |
| R3-4 | Storage/D4 | The dismissal is stored as a bare timestamp, but §D4's rule compares "the stored length"; reusing the sibling `contextLength` fails because it is `null` for a model on the engine-wide default. | accepted — `memoryWarningDismissed: { at, contextLength }`, storing the **resolved effective** length; **merges R3-23**, which found the same gap from the other lens |
| R3-5 | B | A speed switch restarts the engine immediately, with no in-flight guard — it SIGTERMs llama-server mid-answer and the streaming reply dies, the opposite of contract R19. | accepted — the speed restart goes behind §C2's bounded idle wait with the same "Applies after the current reply" footer. Evidence: `engine-supervisor.ts:429` (`stop()`, no guard), `:483` (`inFlight > 0` only in the idle timer) |
| R3-6 | D1/D2 | R2-9's fix misreads the family it was written for: Gemma 4's `sliding_window_pattern` is a 35-element bool ARRAY, not the Gemma-3 scalar, and the estimator ignores `key_length_swa`/`value_length_swa` (256 vs 512) and `shared_kv_layers = 20`. | accepted — **probed** by parsing Destin's own `gemma-4-E2B-it-Q8_0.gguf`. Both pattern shapes handled, `_swa` lengths and `shared_kv_layers` applied, and an **unhandled key type** (not only an unknown arch) sets `contextBytesIsUpperBound` |
| R3-20 | I | "The `user-interface.md` G-22 roadmap item does not exist." | **rejected** — it exists, at `docs/roadmap/user-interface.md:156-161`, naming exactly the three places the design says. The reviewer searched `/home/destin/youcoded-dev`, which was 34 commits behind at the time; this is CLAUDE.md's stale-checkout trap, verified from a checkout at `origin/master` |
| R3-21 | I/J | "Closed" is never spelled out — no `shipped.md` lines, no `roadmap-check --fix`, no archival of the five lifecycle docs, and no ruling on the investigation report that both closed and surviving items link. | accepted — §J now states the three mechanical steps, names the five documents that move to `docs/archive/` at merge, and rules that the runner-audit report **stays live** because two residue items still link it |
| R3-22 | E | Nothing said a **fresh** download of a vision model fetches the projector — only `add-vision` did — which is the whole of contract row R3. | accepted — §E2 gains it: one `downloadId`, both files, `totalBytes` summed; a failed projector leg leaves the model complete in `'available'` with its Add-vision link |
| R3-23 | Storage/D4 | Same as R3-4, from the complexity lens. | **merged into R3-4** |
| R3-24 | D2/C2/H | Three fields describe text a user reads (`breakdown.advice`, `contextBytesIsUpperBound` → "up to", `lastLoadError`) and nothing renders them; §H's only renderer work was two renames. | accepted — a renderer task in §H naming all three. Evidence: `rg` for each → no hits in `desktop/src` |
| R3-25 | F | "Hiding the provider from the form means a missed site cannot be reached" is false — §A5 has the renderer **select** the shell session, so all 46 renderer `provider ===` branches run against it. | accepted — the claim is deleted and replaced with what a selected shell session must show (terminal forced, no composer, no model picker, no stop button, labelled by the shell), plus a renderer guard |
| R3-26 | D/E/G | No guard named for the memory arithmetic, the cache scan's vision states, or the hardware line — although `fit-estimator.test.ts` and `cache-scan.test.ts` already exist. | accepted — Guards paragraphs added to §D, §E and §G |
| R3-27 | G/I | The `engine-types.ts` comment already on the branch says `loadedModelsBytes` counts "loaded **or sleeping**", the opposite of R1-14 and of what §G computes. | accepted — added to the docs task |
| R3-28 | I | The MAP task adds main-process files only; `EngineCard.tsx` is in no MAP or rule row at all, and the `config.json` on-disk row's description no longer covers what the file holds. | accepted — both added to §I's MAP bullet |

Reversals and narrowings this round: R3-3 narrows R1-7 (device total is the "fits on GPU" tier,
not the whole verdict). R3-4 supersedes the field shape R1-23 introduced.

## What changed for the user, in plain words

Two of these are not wording — they change what someone will experience:

1. **A big model is no longer refused.** The design had reached a state where a model larger
   than the graphics chip's memory would be marked "too large" and the app would refuse to
   start a session with it at all. On a machine with a separate graphics card that is wrong:
   the engine splits such a model between the card and normal system memory and runs it
   perfectly well, and the app already says so today. It now warns ("tight") instead of
   blocking, and only truly refuses when the model does not fit in card *and* system memory
   together.
2. **A typo in the Advanced box can no longer break the engine.** The Advanced panel lets you
   type extra engine options. It turned out that one unrecognised word — anywhere, for any
   single model — stops the engine from starting *at all* the next time the app opens, with
   nothing on screen explaining why. Two changes prevent it: what you type is now tested
   against the engine before it is saved (and rejected with the engine's own words if it is
   wrong), and if a bad setting ever does get in, the engine starts anyway with that one
   model's settings skipped instead of refusing to run.

## Round cap

Three rounds is the cap and this was round 3. Accepted findings remain, but they are applied,
not deferred: the design is revised in the same commit as this record, and the build stage
proceeds from the revised design.
