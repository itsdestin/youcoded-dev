---
status: active
date: 2026-08-16
type: investigation
topic: two large local models loaded together exhaust unified memory — the residency cap counts models, the guard reads total memory and never the GTT ceiling
tags: [local-models, memory, strix-halo, oom, engine]
---

# Two large models at once took down the desktop (2026-08-16)

Loading Qwen3.5-122B and Qwen3.6-35B concurrently exhausted the machine's memory,
triggered the kernel OOM killer, and killed YouCoded, Chrome, Steam, and Plasma's
desktop shell. Root cause verified from kernel logs; YouCoded's memory guard was
reached but is structurally unable to prevent this class of event.

> **STILL UNFIXED — verified against `origin/master` 2026-08-26, ten days after the crash.**
> All four defects are untouched: `MODELS_MAX = 2` is unchanged (`engine-supervisor.ts:47`);
> `git grep -n "gtt|mem_info_gtt" origin/master -- desktop/src` → **0 hits**, so the unified-memory
> ceiling is still never read; `checkMemoryForLoad` still computes
> `capacity = totalMemBytes + (totalVramBytes ?? 0)` off TOTAL memory (`fit-estimator.ts`), and the
> over-commit path still returns a dismissible `'tight'` warning ending "You can still continue."
> Tracked on `ROADMAP.md` as an open `bug` `#local-models` `#engine` `#memory`. **Blocked on
> Destin**, not on build effort: decisions (a) auto-unload vs. toast vs. hard-block and (b) whether
> a single model is capped by the GPU-pool ceiling are both explicitly "do not guess". Until one of
> those is answered, the same two models will take the desktop down again.

**History:** filed 2026-08-16 (ROADMAP bug, hit live by Destin); re-verified unfixed 2026-08-26; re-verified again 2026-09-01 during the roadmap migration — `MODELS_MAX = 2` (`engine-supervisor.ts:48`, passed as `--models-max` at :304), `capacity = totalMemBytes + (totalVramBytes ?? 0)` (`fit-estimator.ts:66`), "You can still continue." (`fit-estimator.ts:92`), `readAmdSysfsVram` reading `mem_info_vram_total` (`gpu-detector.ts:140-149`) are all still present, and `rg -i gtt desktop/src` still finds no reader of `mem_info_gtt_total`. No commit since 2026-08-16 touched the guard. Roadmap entry: `docs/roadmap/local-models.md`, status `decision`.

## What actually happened

Verified timeline from `journalctl -k` on 2026-08-16 (all figures are the kernel's own):

| Time | `gpu_active` | `gpu_reclaim` | zram (`zspages`) | Normal-zone free |
|---|---|---|---|---|
| 18:55:09 | 79.4 GiB | 1.47 GiB | 8.5 GiB | 16 MB |
| 18:56:49 | 77.8 GiB | 10 MB | 13.5 GiB | 55 MB |
| 18:58:05 | 77.8 GiB | 6.5 MB | **37 GiB** | 30 MB |
| 18:58:10 | 78.6 GiB | **0** | 37.4 GiB | 64 MB → OOM killer fires |

Model weights on disk:
- `Qwen3.5-122B-A10B-UD-Q4_K_XL` (3-part split) — **73.2 GB**
- `Qwen3.6-35B-A3B-UD-Q6_K_XL` — **30.4 GB**
- Combined **103.6 GB** of weights before any KV cache.

Machine: 121.5 GB RAM. Kernel cmdline pins the GPU's shared-memory pool at
`amdgpu.gttsize=81920` (**80 GiB**) with `ttm.pages_limit=20971520` (also 80 GiB).

GPU (GTT) memory on this APU **is** system RAM, and it is neither swappable nor
reclaimable while a model holds it — `gpu_reclaim` fell to literally 0. So ~78 GB
was frozen, leaving ~43 GB for Plasma, Chrome, Steam, Discord, and Claude Code,
which needed more. The kernel crushed the remainder into zram (which lives in RAM,
so it consumed the very memory it was trying to free — zram grew 8.5 → 37 GB in
three minutes), then gave up.

### The OOM killer picked victims that freed nothing

```
Killed process 723543  (youcoded)       anon-rss:228kB   oom_score_adj:300
Killed process 3010    (steamwebhelper) anon-rss:128kB   oom_score_adj:300
Killed process 3096187 (chrome)         anon-rss:0kB     oom_score_adj:300
Killed process 4136463 (llama-server)   anon-rss:0kB     oom_score_adj:200
```

Every victim had near-zero resident memory. The killer selects by `oom_score_adj`,
and Chromium/Electron stamp 300 on their helper processes — so it killed empty
helpers, freeing nothing, while taking down their parent applications.

`llama-server` reports `anon-rss:0kB` because GPU-pool memory is not counted as a
process's RSS. **The kernel could not see the actual memory holder.**

### Plasma died from GPU allocation failure, not from being killed

`plasmashell` was not in the OOM victim list and produced no coredump. At 18:58:14
it logged `Failed to write to the pipe: Bad file descriptor`; `kwin_wayland` at the
same moment logged `Failed to create framebuffer: Invalid argument` and
`Could not delete render time query because no context is current`. The GPU pool was
at its 80 GiB ceiling, so new graphics buffers could not be allocated. `kwin`
recreates its GL context on loss and survived; `plasmashell` does not and exited.

Contributing factor: `plasmashell` and `kwin_wayland` both run at
`oom_score_adj = 200` — *more* killable than default, not less.

The auto-restart safety net at
`~/.config/systemd/user/plasma-plasmashell.service.d/restart.conf` did not fire, for
two reasons: (1) the running `plasmashell` (PID 1940250) was not started by the
systemd unit, so `Restart=` did not apply to it; (2) the drop-in puts
`StartLimitIntervalSec`/`StartLimitBurst` in `[Service]`, where systemd rejects them
(`Unknown key ... ignoring`) — they belong in `[Unit]`.

## Why YouCoded's memory guard didn't stop it

`checkMemoryForLoad` (`desktop/src/main/models/fit-estimator.ts:56`) was reached and,
replicating its formula plus `gpu-detector`'s real Linux output on this machine,
returns **`ok` — no warning of any kind was shown**:

```
detectGpu()       = 4.0 GB "dedicated VRAM"  (see flaw 4 — it is not dedicated)
capacity          = 125.5 GB   (os.totalmem() 121.5 + 4.0)
combined (need)   = 105.6 GB   (30.4 + 73.2 + 2 GB overhead)
warn threshold    = 106.7 GB   (85% of capacity)
verdict           = 'ok'  → silent
```

It came in **1.1 GB under the warning line**. Had `gpu-detector` correctly reported
no dedicated VRAM, capacity would be 121.5 GB, the threshold 103.3 GB, and the
verdict `tight` — still only a soft, dismissible warning. Four structural problems:

1. **The residency cap is a count, not a byte budget.** `MODELS_MAX = 2`
   (`engine-supervisor.ts:43`) — its own comment reasons in 8 GB terms ("two 8GB
   models already hurt"). Two 70 GB models are inside the limit, so LRU eviction
   never fired.
2. **The guard doesn't know the GPU pool has its own ceiling.** It treats a
   unified-memory machine as having `totalMem` available, but GPU-offloaded weights
   are capped at `amdgpu.gttsize` (80 GiB here) — and that memory is unreclaimable
   once held. Nothing in the codebase reads `mem_info_gtt_total`.
3. **It measures total memory, not free memory.** `capacity = totalMemBytes` ignores
   what Chrome, Steam, Discord, and Claude Code were already holding.
   <!-- claim: {"path": "youcoded/desktop/src/main/models/fit-estimator.ts", "contains": "const capacity = totalMemBytes \\+ \\(totalVramBytes \\?\\? 0\\);"} -->
4. **`gpu-detector` misreads this APU as a dedicated 4 GB GPU.** `readAmdSysfsVram`
   (`gpu-detector.ts:140`) reads `mem_info_vram_total`, which on Strix Halo is the
   BIOS-carved 4 GiB UMA window — above the 2 GB `MIN_DEDICATED_VRAM_BYTES` floor, so
   `detectLinux()` returns it as dedicated VRAM. The file's stated safety bias ("only
   when a real DEDICATED GPU's VRAM was confidently probed") does not hold on Linux
   AMD APUs. Effect here: capacity inflated by 4 GB, which alone flipped the verdict
   from `tight` to `ok`. The number is also meaningless for fit — the pool that
   actually holds offloaded weights is the 80 GiB GTT, not this 4 GiB window.

## Prevention

### System (independent of YouCoded)

- **Install `earlyoom` (or enable `systemd-oomd`).** Neither is present. These kill
  the actual largest memory consumer *before* the kernel's crude killer fires. This
  is what would have saved the desktop.
- **Protect the desktop shell:** `OOMScoreAdjust=-500` on `plasma-plasmashell.service`
  and `plasma-kwin_wayland.service`. Both currently sit at +200.
- **Raise the kernel's reclaim headroom.** `watermark_scale_factor = 10` and
  `min_free_kbytes = 67584` leave a 66 MB emergency reserve on a 121 GB machine.
- **Shrink zram.** 121 GB of zram at `swappiness = 150` amplifies the spiral —
  compressed pages live in RAM, and already-quantized model weights compress ~1:1.
- **Fix the plasmashell restart drop-in:** move `StartLimit*` to `[Unit]`, and always
  start plasmashell via its systemd unit so `Restart=` applies.

### YouCoded

- Replace `MODELS_MAX` (count) with a **byte budget** for total resident weights.
- Read the real unified-memory ceiling (`/sys/class/drm/card*/device/mem_info_gtt_total`
  on Linux AMD) and treat it as the cap for GPU-offloaded models.
- Base the guard on **available** memory, not total.
- Make the guard **hard-block** (or auto-unload the resident model) when the combined
  load would exceed the GPU pool ceiling, rather than warning.

## Recovery performed

- `systemctl --user start plasma-plasmashell.service` — desktop shell restored and
  now attached to its unit.
- `systemctl --user reset-failed` — cleared 10 stale failed app scopes.
- No system-level units failed; no filesystem or data damage.
