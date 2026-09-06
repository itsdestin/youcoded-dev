# Local engine upgrades — design review round 2 (2026-09-05)

Design: `docs/active/specs/2026-09-05-local-engine-upgrades-technical-design.md` (after round
1). Same two lenses, fresh agents: 2a correctness (R2-1…R2-12), 2b complexity/omissions
(R2-20…R2-31). 22 accepted, 1 already handled, 1 accepted as a REVERSAL of a round-1
acceptance. Facts checked against the installed b10665 before the fixes were written (see
"Probed" column).

| id | section | finding (one line) | verdict |
|---|---|---|---|
| R2-1 | C3 | `GET /props` without `?model=` is the router's own dummy (`n_ctx: 0` regardless of what is loaded), so per-model `ctx-size` never reaches the harness. | accepted — **probed 2026-09-05**: `/props` → `n_ctx 0`; `/props?model=Qwen3.5-2B-Q8_0` → the child's real `n_ctx` (2048 / 4096). `effectiveContextWindow` fetches `/props?model=<id>`; fallback is `contextLengthFor(modelId)` |
| R2-2 | C2 apply | The "no in-flight request" signal is undefined: `inFlight` is engine-wide and the session ref-count is held for a session's whole life, so `pendingApply` could be forever. | accepted — per-model in-flight count read from the request body's `model` in `trackedFetch`; ref-count ignored; bounded wait (apply at next idle or after 10 min, footer says which) |
| R2-3 | C2 | Writing `models.ini` at save time is bypassed by every existing `refreshModels()` (`?reload=1` after downloads/deletes), which diffs presets and unloads the changed model mid-reply. | accepted — pending changes stay in config until apply time; the writer runs only from the apply path, and `refreshModels()` merges pending only when the model is idle |
| R2-4 | Storage | Three code paths still treat a manifest beside a complete set as garbage or as "unfinished" (`installedModels` deletes it, the downloader removes it on completion, `resume` / the prior-repo guard read presence). | accepted — all three gate on `completedAt`; named in the task list; a re-download preserves `visionFile` |
| R2-5 | A2/A4/D2 | `.complete` is written before `--list-devices` runs, Vulkan `install()` never runs it, and old markers have no `devices` — the Z13's pool falls back to RAM. | accepted — `--list-devices` runs on the unpacked binary inside `install()` for every backend before the marker is written; a marker without `devices` is backfilled once, lazily, from `status()` |
| R2-6 | C2 | A `[modelId]` section whose model is gone becomes a ghost row with `source: preset`; `deleteModel` never prunes `models[id]`. | accepted — **probed**: a model with a section reports `source=preset`; sections are emitted only for ids present in the cache scan; `deleteModel` prunes the entry |
| R2-7 | A4 | The test-load discard blames the backend for any load failure and lacks the `preexisting` guard, so a transient failure deletes a working build. | accepted — discard only an install this call created; discard only on device/kernel-class errors, otherwise report without discarding |
| R2-8 | C2 reserved keys | The denylist is by long name but the INI accepts short forms, aliases and env names (`c`, `ngl`, `gpu-layers`, `LLAMA_ARG_…`). | accepted — every key is normalised through an alias table generated from the binary's `--help` at bump time (in the pin) before the denylist |
| R2-9 | D2 KV | Qwen3.5's header carries `full_attention_interval` (its non-full layers are recurrent, not sliding); pattern semantics differ by `dense_first`. | accepted — interval → non-full layers contribute 0 KV (flagged upper-bound when the family is unknown); pattern → `dense_first` rule pinned per arch in `gguf-header.test.ts` |
| R2-10 | D2 | `MemAvailable` already excludes resident models' memory, so adding `loadedBytes` double-counts; the formula was never written down. | accepted — `need = model + vision + kv + overhead`; pool side compares against `pool − loadedBytes`, available side against `MemAvailable` alone |
| R2-11 | C1/C2 | Keep loaded is also defeated by the last-session unload hook. | accepted — the released handler skips keep-loaded models; pinned |
| R2-12 | A4 | "First non-CPU device" accepts `llvmpipe` as a GPU; the fixed sentence also fires on a linker failure. | accepted — `llvmpipe` / `SwiftShader` count as CPU; the message branches on exit-with-output vs spawn failure and quotes the real stderr line |
| R2-20 | Storage/E2 | Pre-feature downloads have NO manifest, so Destin's own Gemma 4 12B gets no eye and no Add vision, forever. | accepted — a backfill task: a complete set with no manifest resolves its repo once (curated `hfRepo` by filename, else HF search), writes a manifest with `visionFile`, caches misses |
| R2-21 | Storage | `engine-local.json` splits one class of per-machine data across two files; no code syncs `~/.youcoded/config.json` today and `engine.*` already holds `backend`/`cacheDir`. | accepted, **reverses: R1-20** — `speed` and `models` live under `engine.*` in `config.json`; the "syncable" comment in `engine-config.ts` is corrected to say the engine section is per-machine; no second file |
| R2-22 | D1 | A 32–64 MB Range read per repo for every card is 100–300 MB on first open; the cache lands in the wrong folder and lost the `+ sha` key. | accepted — 1 MB Range steps, stop once the arch/kv/sliding keys are parsed; cache beside `curated-models-cache.json` in userData, keyed by repo + default-quant sha |
| R2-23 | C2 | Whether `[*]` is honoured was left to day one, with a different design as fallback. | accepted — **probed 2026-09-05**: `[*]` IS honoured (global `ctx-size 4096`, `sleep-idle-seconds 77` reach the child), a per-model section overrides it (2048 beat 4096); §C2 now states the verified shape and the fallback is gone |
| R2-24 | B/C2 | With `ctx-size` in `[*]`, an engine-wide context change needs no process restart. | accepted — `contextSize` = write `[*]` + `?reload=1` (subject to the same idle rule); restart only for `speed`; the `set-context` null-trick bullet in the rule file goes |
| R2-25 | I | Five rule-file bullets and three docs asserting `SessionProvider = 'claude' \| 'native'` become false. | accepted — each listed in the docs task |
| R2-26 | E4 | Folding the trimmed-image harness fix into this branch turns a local-models PR into a harness-loop PR. | accepted — folded out to its own PR; §I only notes the item is now reachable |
| R2-27 | J | The runtime-archive text asserts a cause a sha mismatch does not establish. | accepted — the existing non-committal sentence is reused |
| R2-28 | H/J | No task for the mandatory workbench boot check or for the acceptance stage. | accepted — both added to §J |
| R2-29 | H | The fake renames touch `useIpc.ts`, `RuntimeBinding.tsx`, `EngineCard.tsx`, `mock-shim.ts`, not two lines. | accepted — named in the rename task; the `as any` gate goes when the channel is real |
| R2-30 | I/roadmap | The G-22 chevron item lists the recommended-model card, which this feature rewrites, and §I never mentions it. | **already handled** for the card (round 2 of the mockup moved its chevron to the right, P-1 note); the roadmap item is shrunk to two places in §I |
| R2-31 | I/MAP | Only "On-disk state" rows were planned; the engine MAP row's entry points and guards, and the shell provider, have no MAP home. | accepted — a MAP task |

Reversals this round: R2-21 reverses R1-20 (one storage file, not two).
Accepted count > 0 → round 3 runs (cap three).
