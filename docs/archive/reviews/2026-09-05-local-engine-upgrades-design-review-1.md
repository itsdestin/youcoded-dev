# Local engine upgrades — design review round 1 (2026-09-05)

Design: `docs/active/specs/2026-09-05-local-engine-upgrades-technical-design.md` (pre-review
commit). Two adversarial reviewers, fresh context each: 1a correctness/robustness (R1-1…R1-15),
1b complexity/omissions/roadmap (R1-20…R1-35). Every finding marked; the fixed design is the
next commit of the spec. 28 accepted, 1 rejected, 1 already handled.

| id | section | finding (one line) | verdict |
|---|---|---|---|
| R1-1 | C2 | The router merges the command line OVER the preset, so `-c` and `--sleep-idle-seconds` on the spawn line defeat every per-model `ctx-size` / `sleep-idle-seconds` — R2/R25 would do nothing. | accepted — engine-wide values move into the preset's `[*]` section; CLI keeps router-only flags; `probe-presets` asserts a per-model `/props n_ctx` differs from the global |
| R1-2 | A3/A4 | The Linux ROCm build targets a fixed gfx list; an unsupported AMD iGPU still enumerates as `ROCm0` and passes verify-boot, failing only at the first model load. | accepted — gate on the machine's `gfx_target_version` (`/sys/class/kfd/kfd/topology/nodes/*/properties`, this Z13 reads 110501 = gfx1151) against the pin's target list; Windows: device check plus a first-load error routed to the card |
| R1-3 | B | `restart()` re-uses the same supervisor instance and its constructor-time args, so a speed change would respawn with the OLD flags. | accepted — the supervisor reads config at every spawn; set-config uses the setContext path (null `supervisorBinary`) |
| R1-4 | C1 | Keep loaded is defeated by the 10-min engine idle stop and by `--models-max 2` LRU eviction. | accepted — idle stop is skipped while any resident model is keep-loaded; eviction documented in the (i) and the row hint |
| R1-5 | A1/A2 | The Windows ROCm zip may be backend-only without `llama-server.exe`. | **rejected** — verified 2026-09-05 by listing the b10665 zip: `llama-server.exe` is present (55 entries) |
| R1-6 | D2 | macOS `os.freemem()` excludes inactive/purgeable memory and there is no Metal pool cap — every Mac gets spurious `tight`. | accepted — `vm_stat` (free + inactive + purgeable) and the Metal device total from `--list-devices` as the pool |
| R1-7 | D2 | The integrated-GPU sysfs heuristic misclassifies a 4 GB discrete card, and GTT total is not what the engine can allocate. | accepted — the pool is the first device's `(total MiB)` from the cached `--list-devices` output, every backend, every platform |
| R1-8 | C2/E4 | `?reload=1` + unload after a settings save, or Add vision, kills an in-flight reply for every session on that model. | accepted — defer reload/unload until the model has no in-flight request (supervisor `inFlight` + session ref-count); the dialog says "applies after the current reply" |
| R1-9 | E4 | `POST /models/unload` returns before the child exits; a rename right after fails on Windows / moves an open file on Linux. | accepted — poll `/models` until the row is `unloaded` (bounded 15 s) before the first rename; a rename failure means nothing moved |
| R1-10 | D1/D2 | Sliding-window and hybrid architectures make the KV figure up to 5× too high, and the design let that produce a non-dismissible `too-large`. | accepted — read `sliding_window` / `sliding_window_pattern` / `full_attention_interval`; the KV term alone may raise a verdict to `tight`, never to `too-large` |
| R1-11 | E2/E3 | A crash between the move and the projector's completion strands a folder model as `'none'` with the Add-vision link gone. | accepted — the origin record moves first; folder + origin `visionFile` + no `mmproj` reads as `'available'` |
| R1-12 | C2 | `<cacheDir>/../youcoded-models.ini` lands in `~/.cache/` or beside a user-moved cache. | accepted — `~/.youcoded/engine/models.ini` (same as R1-26) |
| R1-13 | C2 | Extra flags can set `port`, `host`, `model`, `mmproj`, `models-dir`, `alias`, or duplicate a key the app writes. | accepted — reserved-key denylist at save time with a plain message |
| R1-14 | G | `loadedModelsBytes` summing `sleeping` rows overstates memory (a slept model's memory is freed). | accepted — `loaded` rows only |
| R1-15 | F | Typing the command before the shell prints its prompt can lose it (fish/zsh flush startup input). | accepted — write after the PTY's first output; probe on fish, zsh, bash, PowerShell |
| R1-20 | C1/D4/B | Per-machine facts (GPU layers, speed, dismissed warnings) would sit in the syncable `config.json`. | accepted — a new never-synced `engine-local.json` under NativeHome holds speed, per-model settings and dismissals |
| R1-21 | E3 | `origin.json` is a third per-download shape duplicating the manifest. | accepted — the manifest stays after completion with `completedAt` and `visionFile`; cache-scan reads `completedAt` instead of presence; no `origin.json` |
| R1-22 | A3/A5 | `backend-detect.ts` + `devices.json` duplicate `gpu-detector.ts`'s probes and name field. | accepted — `detectChip` lives in `gpu-detector.ts` (gains `vendor`); the device list goes into the existing `.complete` marker |
| R1-23 | D4/H | A separate channel and map for one per-model boolean-at-a-context. | accepted — `ModelSettings.memoryWarningDismissedAt: number \| null`; `models:dismiss-memory-warning` dropped; the mockup's fake is renamed accordingly |
| R1-24 | D1 | Header reads per card and per quant, in-memory cache only. | accepted — one header per repo (quant-independent), persisted on disk keyed by repo + file sha |
| R1-25 | D1 | An upper-bound KV number shown without "up to" violates the FitEstimate no-fake-precision contract. | accepted — `breakdown.contextBytesIsUpperBound`; the bubble says "up to" |
| R1-26 | C2 | Preset path wrong; MAP "On-disk state" not updated. | accepted — see R1-12; MAP rows for the preset file, `engine-local.json`, the `<id>/` folders |
| R1-27 | I | Roadmap accounting names seven items; the OOM item and the parity item are partly closed and unnamed. | accepted — §I lists all nine with the residue each keeps |
| R1-28 | F | The Terminal-session roadmap item is `decision`, yet F builds the provider; 54 `provider ===` sites unsized. | accepted — the provider is hidden from the new-session form; the task carries the 24-file checklist; the roadmap item becomes in-flight (its floor ships, the picker entry does not) |
| R1-29 | A | `engine-config.ts` `BACKENDS` allowlist lacks `rocm`, so a saved `rocm` reads back as null. | accepted — allowlist + pinning test |
| R1-30 | D2 | R7's pool cap is Linux-only; Apple Silicon has none. | accepted — covered by R1-6/R1-7 (device total from `--list-devices`) |
| R1-31 | G | provider-registry does not parse `timings`; whether the streaming path emits it is unverified. | accepted for the first half — nothing parses it yet; the second half is **already handled**: `probe-chat.mjs` printed the final frame with `timings.prompt_per_second` / `predicted_per_second` on b10665 this session |
| R1-32 | C2 | `c =` vs the router's own `ctx-size =` — two spellings. | accepted — long forms only, pinned by `probe-presets` |
| R1-33 | B/H | `engine:set-speed` duplicates `engine:set-context`. | accepted — one `engine:set-config(patch)`; `set-context` stays as an alias for the existing callers |
| R1-34 | F/A6 | R1's contract statement says "runs it"; the deck's option said "pastes it, you press Enter"; remote clients cannot see a desktop window switch. | accepted — R1's statement is corrected to the deck's own words by the contract agent (same source); the channel returns the session id and the remote shim selects it |
| R1-35 | whole | No task names the binding build rules or the copy for the three new failure paths. | accepted — "every task" footer + the three messages |

Reversals: none (first round).
