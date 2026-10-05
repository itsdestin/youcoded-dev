---
title: Measuring what themes cost on the real graphics card
status: active
date: 2026-10-05
---

# Measuring what themes cost on the real graphics card

## Plain-language summary (read this first)

**What we can now do.** We can run the real YouCoded app on the laptop's real graphics chip (the Radeon) with
a theme turned on, completely out of sight. Nothing appears on Destin's screen, nothing touches his live app,
his settings or his desktop. The tool is `scripts/perf-lab/gpu-cost.mjs`. It asks the graphics chip itself,
"how many milliseconds did THIS app keep you busy?", and that number is not polluted by his desktop, his VMs or
other sessions. It refuses to print anything if the app ever falls back to the slow software drawing the old rig
used.

**How sure are we the method works.** Three checks passed. (1) A test page with a known amount of glass blur
showed the cost rising every time we added more glass (1 -> 2.7% -> 6.2% -> 52.5% of the chip's drawing time for
0/1/4/16 full-window layers). (2) The same page with the glass but nothing moving behind it cost 0%, which proves
the tool is not just measuring "glass exists". (3) A do-nothing screen reads 0.00%, and two readings of the same
scene, taken back to back, differ by under half a percentage point. Two cautions: the same theme measured in two
separate app launches varied by about +/-30%, because the chip changes speed and Destin was working on the
machine; so every difference below was repeated across launches before we call it real.

**What the first readings say** (share of the graphics chip's drawing time used by the app; higher is worse):

- **Particles are the biggest idle cost.** A chat on Cotton Candy Sky (glass bubbles + floating dust) costs about
  **3.8%** of the chip while nothing is happening. The same theme with the particles switched off: **0.0%**.
  Midnight (plain): **0.0%**. Reduce Visual Effects on: **0.0%**.
- **Glass costs a lot while a reply is streaming.** Streaming a reply: Midnight about **2.4%**, Cotton Candy Sky
  about **11.6%**, Cotton Candy Sky with Reduce Visual Effects **2.7%**, Meadow Mist (glass, no particles)
  **15.3%**. So Reduce Visual Effects brings a glass theme back to plain-theme cost, and glass is a bigger
  cost than particles when text is arriving.
- **Suspect T1 (particles make every glass bubble re-blur 30x/s) is real but not the whole story.** Same
  theme, glass on vs off (particles still running): 3.8% vs 2.2% idle in the chat. So re-blurring the
  bubbles is roughly 40% of the idle particle cost; the rest is drawing the particle layer itself. (One launch
  only for the "glass off" case.)
- **Suspect T2 (8K wallpapers) shows up in memory, not in drawing time.** An 8K wallpaper used about 100-200 MB
  more graphics memory than the same wallpaper shrunk to the screen size (3 of 4 launches higher; ranges
  overlap, so moderate confidence). Drawing time with the 8K vs shrunk wallpaper was the same within noise.
- Idle cost of a plain chat or welcome screen on any no-particle theme (Midnight, Meadow Mist) is 0%.
- The welcome screen with the mascot on Meadow Mist now costs about **3.4%** (fps 30). Reduce Visual Effects: 0%.

**What this does NOT tell us.** It cannot say whether the screen feels smooth at 180 Hz, and it cannot see the
real display hardware (it uses a virtual screen that is never shown). Only eyes on the real panel can judge
smoothness. See "What needs his eyes or permission" below.

**Needs his permission or eyes:** nothing in this document needed either. To confirm the numbers match what
the real panel does, one short visible run (20 s, a window appears on his screen) is described in section 4.

---

## Technical record

Machine: ASUS Z13, Ryzen AI Max+ 395, Radeon 8060S (`gfx1151`, amdgpu), kernel 7.1.3-2-cachyos, Mesa
26.2.0-devel, KDE 6.7.3 on Wayland, AC power. App: packaged Electron 41.10.7 / Chromium 146.0.7680.216, built
from commit `e9ba76e3` (frozen `perf-zero-hitch-20261004` checkout, copied to
`scratch/perf-lab/gpu/app`). Raw files: `scratch/perf-lab/gpu/` (gitignored).

### 1. Which invisible-GPU methods work

| Method | Works? | Proof / why | Verdict |
|---|---|---|---|
| (a) `kwin_wayland --virtual` (private socket, bus, runtime dir) + app `--ozone-platform=wayland` | **Yes** | `glRenderer = ANGLE (AMD, AMD Radeon 8060S Graphics (radeonsi strix_halo ACO), OpenGL ES 3.2 Mesa 26.2.0-devel)`, `gpu_compositing=enabled`, `rasterization=enabled` (`systeminfo-kwin-virtual.json`). Output: 2560x1600, a custom 179.64 Hz mode added with `kscreen-doctor output.Virtual-0.addCustomMode...` then selected; scale 1.5 via `kscreen-doctor output.Virtual-0.scale.1.5` (`--scale` rounds to an integer). Has `wp_presentation` v2, dmabuf, syncobj. Cadence is real: a compositor-only CSS animation produced 179.5 fps, intervals 5.57 ms (`control-1.json` spin-cadence). | **Chosen.** Closest to the real path (same compositor family as the panel, same Mesa/ANGLE, dmabuf buffers). Omits scanout: no display engine, vblank, VRR, PSR, tearing/late flips. |
| (d) `gamescope --backend headless -W 2560 -H 1600 -r 180 --expose-wayland` | **Yes** | Same Radeon GL_RENDERER, compositing+raster enabled, refresh exactly 180.000 Hz, `wp_presentation` v1. Needs a socket path under ~100 chars (used `/tmp/gsrt`, removed). | Works, but gamescope is a different compositor (Vulkan shader compositing of one window), less representative than KWin. Spare. |
| (b1) Xvfb + default flags (what the rig does) | Runs, wrong | `llvmpipe`, `gpu_compositing=disabled_software`, `rasterization=unavailable_off`. | Refused by the tool. |
| (b2) Xvfb + `--use-angle=vulkan --enable-features=Vulkan` | **Yes (GPU renders)** | `ANGLE (AMD, Vulkan 1.4.354 (AMD Radeon 8060S Graphics (RADV STRIX_HALO)))`, compositing+raster enabled. Mesa logs "No DRI3 support detected - required for presentation": frames are read back to the CPU for X. | Usable for GPU-draw cost but adds a readback that the real path does not have; no `wp_presentation`. Fallback only. |
| (b3) Xvfb + `--use-gl=angle --use-angle=gl-egl` | Half | Radeon `radeonsi`, but `gpu_compositing=disabled_software`. | Refused (compositing in software = wrong cost). |
| (c) `--ozone-platform=headless --use-gl=egl` | **No** | `glRenderer: Disabled`, compositing `disabled_software`, raster `disabled_software`. | Dead end. |
| (d') What the 2026-09-29 presentation probes used | n/a | `launch.mjs` `waylandSocket` + `validateWaylandSocket` expect an absolute socket owned by the user; those runs used the **real session compositor** (KWin on `wayland-0`, 2560x1600 @ 180 Hz), i.e. a visible window on the owner's screen; `gpu-theme.mjs --real-display :N` is the same on Xwayland. They measure compositor `presented` feedback with flags 7, not GPU time, and their stated limit is that this is not optical. | The invisible method now covers GPU time; the visible one remains the only way to see real scanout. |

KWin note: starting KWin under `dbus-run-session` activated portals and `plasma-keyboard` on the private bus;
all are in KWin's process group and die with it (`stopGroup`). KWin is not dumpable, so its own
`/proc/<pid>/fdinfo` is unreadable: the compositor's GPU time is only visible in whole-chip busy %.

Startup stall, resolved: the app sometimes never opened a window (CDP timeout). It was not the environment
(a full inherited-env and a minimal env both hung and came up at random). Cause: two app copies on the same
fixed ports (`YOUCODED_PORT_OFFSET=100` -> 10000/10020), here orphans of my own parallel probe launches.
`assertPortsFree()` now refuses to start when those ports are held. The tool also scrubs the Plasma session
variables (`SESSION_MANAGER`, `ICEAUTHORITY`, `XAUTHORITY`, `KDE_*`...) from the app's environment so the test app
cannot be handed the owner's session sockets.

### 2. Signals, noise floor, positive control

Positive control (`scripts/perf-lab/gpu-control/control.html`; wallpaper gradient, an 80-particle full-window
canvas redrawn every 33 ms, N glass layers; 15 s x 3 windows each, one launch; `control-1.json`):

| Scene | App GPU time (gfx engine) median [range of 3] | Whole-chip busy (mean) | GPU clock | GPU-process CPU | Compositor fps |
|---|---|---|---|---|---|
| idle, static page | 0.00% [0.002] | 21.3% | 1585 MHz | 1.1% | no frames |
| canvas only (N=0) | 0.97% [0.12] | 21.0% | 1589 | 4.3% | 29.9 |
| 1 window-sized glass layer | 2.66% [0.41] | 22.1% | 1592 | 5.7% | 29.9 |
| 4 | 6.16% [1.77] | 30.6% | 1409 | 7.9% | 29.9 |
| 16 | 52.5% [1.32] | 77.7% | 616 | 30.7% | 29.9 |
| 10 chat-bubble-sized glass boxes | 3.75% [0.76] | 31.0% | 986 | 12.6% | 29.9 |
| 40 bubble-sized boxes | 14.6% [3.6] | 46.3% | 609 | 43.7% | 29.9 |
| 10 bubble boxes, canvas stopped | **0.00%** [0.009] | 28.3% | 802 | 2.0% | no frames |
| compositor-only animation (cadence) | 1.31% [0.12] | 28.2% | 1475 | 8.3% | 179.5 |

- **Per-process GPU time (`drm-engine-gfx` from `/proc/<pid>/fdinfo/*`, deduped by `drm-client-id`)**: passes.
  Rises monotonically with N (0.97 -> 2.66 -> 6.16 -> 52.5), rises with bubbles (0.97 -> 3.75 -> 14.6), zero for
  static scenes, repeat range <= 0.4 points in light scenes. It isolates the test app: the owner's desktop sat
  at 16-53% whole-chip busy during these runs and none of it appears in the app's number. The Chromium GPU
  process holds 4 fds per client, so fds MUST be deduped by client id (x4 trap; unit-tested).
- **Whole-chip busy % (`gpu_busy_percent`)**: rises too, but its baseline drifted 16-53% with the owner's
  activity and its repeat range reached 13.5 points. Context only, not a measurement of the app.
- **GPU clock moves with load** (693-1650 MHz in one session; the same job at a lower clock takes more
  engine-time). Every window records mean `sclk`; `appGpuMegacyclesPerSec = gfx% x sclk` is steadier across
  clock changes and is the better figure for comparisons across launches. (The earlier shakeout read 13.2% for
  4 layers at 693 MHz vs 6.2% at 1409 MHz in the full run: same work, different clock.)
- **GPU-process and renderer CPU (`SystemInfo.getProcessInfo` roles + `/proc` ticks)**: pass; GPU-process CPU
  tracks GPU time (1% -> 31% -> 44%). Contaminated by the machine's load (load average 5-320 during this
  session, other sessions' browsers and two VMs), so treat as secondary.
- **Frames from a Chromium trace** (`viz,cc,benchmark,disabled-by-default-devtools.timeline.frame`; own
  window, never shared with the GPU/CPU window because tracing adds cost): compositor frame count and rate,
  frame intervals, `Display::DrawAndSwap` time, `PipelineReporter` state counts, submit-to-present latency.
  Frame rate is exactly the content rate (29.9 for a 30 fps canvas, 179.5 for the cadence page), intervals tight
  (33.4 +/- 0.3 ms). `droppedPipelineFrames` is NOT trustworthy as a count: values of 0-5 in quiet windows but
  hundreds in windows when the machine was loaded (e.g. 651); report it only when load is low. Present
  latency (10 ms at 30 fps, 22 ms at 180 fps) is the virtual output's cadence, not a panel's.
- **Memory**: per-client `drm-memory-vram/gtt` (GPU memory) and per-role PSS. Idle Midnight: ~140-240 MiB
  VRAM held by the GPU process. VRAM varies +/-100 MiB between launches even for the same theme (Cotton Candy
  Sky chat: 277, 391, 394, 490), so memory differences below ~150 MiB need several launches.
- **Power**: hwmon `power1_average` climbs 51 -> 60 W with load then pins at ~60 W (a cap), so it is a weak
  sanity check only. RAPL `energy_uj` is root-only here (permission denied). Battery showed "Charging" at 6.5 W;
  AC online throughout, so a battery-discharge cross-check is not possible while plugged in.
- **Decoded wallpaper memory**: see T2 below; no direct "decoded size" counter was found, only GPU-process
  memory and PSS deltas.

### 3. First readings on the real app

Method: packaged app, fixture HOME, theme copied into the fixture (`~/.claude/wecoded-themes/<slug>` of the
fixture, never the real one) and selected through the fixture's `youcoded-appearance.json`; native chat session
bound to the rig's fake provider; 5 short exchanges -> 9-10 visible glass bubbles (verified: `glassBubbles` =
`visibleBubbles` = 10, window 1707x1067 CSS px at DPR 1.5, screenshot reviewed); 15 s windows x 3 repeats (12 s x 2
in the third batch) per launch; the "stream" scene sends a 150 deltas/s reply through the fake provider.
Cells were run in three batches (A, B, C; files `themes-A/B/C.json`), so the same cell appears in 1-4
launches. Table = median across launches [min-max across launches]; `n` = launches.
**Mislabel note:** in batch B the scene called "welcome" ran AFTER the chat was built, so it is a second chat
idle reading, not a welcome screen; the true welcome screen readings are in `welcome.json` (below).

| Cell (theme + toggle) | n | Chat idle: app GPU % | Mc/s | Stream: app GPU % | GPU-proc CPU idle / stream | GPU mem MiB (idle) |
|---|---|---|---|---|---|---|
| Midnight (plain) | 2 | 0.00 | 0 | 2.4 [2.3-2.6] | 0 / 9.5 | 237 |
| Cotton Candy Sky (8K wallpaper, glass 16/10, 20 dust) | 4 | 3.8 [2.8-4.1] | 56 [49-63] | 11.6 [9.1-15.9] | 8.9 / 18.1 | 393 [277-490] |
| ... + no particles | 3 | 0.00 | 0 | 8.1 [6.8-12.5] | 0 / 13.7 | 372 |
| ... + 2560x1600 wallpaper | 4 | 3.7 [3.3-6.8] | 50 [41-61] | 13.1 [9.7-18.2] | 9.1 / 22.1 | 293 [273-306] |
| ... + Reduce Visual Effects | 3 | 0.00 | 0 | 2.7 [2.0-3.7] | 0 / 10.4 | 463 |
| ... + glass blur off (particles on) | 1 | 2.2 | 33 | 7.1 | 4.9 / 10.8 | 277 |
| Halftone Dimension (gradient, panels blur 20, bubble blur 0, 35 custom particles) | 1 | 3.3 | 56 | 8.1 | 8.2 / 16.6 | 236 |
| Meadow Mist (3840x2160, glass 22/18, no particles) | 1 | 0.00 | 0 | 15.3 | 0 / 30.9 | 361 |
| Kuromi Dreamer (8K, glass 18/14, dust, companions) | 1 | 5.7 | 40 | 15.0 | 12.1 / 28.8 | 242 |

True welcome screen (mascot, no chat; `welcome.json`, 1 launch each, 3 x 15 s): Meadow Mist **3.4%** (9.3% GPU-process
CPU, 30.6 fps, 347 MiB), Meadow Mist + Reduce Visual Effects **0.00%**, Midnight **0.00%**. This build already
draws the mascot at 30 fps, so it is not comparable to the 2026-09-26 real-display figure (36% whole-chip
busy, an earlier build with the mascot unbounded); the two methods have not been run on the same build.

Frames (trace window): Chat idle with particles: 30.3 fps compositor frames, p95 interval 33.3 ms, draw
p95 about 1 ms; without particles or glass: no frames at all (nothing changes). Stream: 65-109 compositor fps
(Midnight 74-79, glass themes 88-97, Reduce Visual Effects 65), p95 interval about 17.5 ms. These come from a
virtual compositor, not the panel.

What exceeds the noise (rule: median difference > 2x the larger spread across launches, and > 0.5 point):

- Particles on vs off at chat idle (3.8 vs 0.0): **yes**, large and consistent in all 4+3 launches.
- Reduce Visual Effects vs full glass+particles, idle (0.0 vs 3.8) and stream (2.7 vs 11.6): **yes** (ranges do not
  overlap).
- Glass theme stream vs plain theme stream (Cotton Candy 11.6, Meadow Mist 15.3, Kuromi 15.0 vs Midnight 2.4):
  **yes**. Meadow Mist has no particles, so this part is glass alone.
- Particles on vs off during streaming (11.6 [9.1-15.9] vs 8.1 [6.8-12.5]): **not separable** (ranges overlap).
- 8K vs 2560 wallpaper in drawing time (3.8 vs 3.7 idle; 11.6 vs 13.1 stream): **no difference detected**.
- 8K vs 2560 wallpaper in GPU memory (393 [277-490] vs 293 [273-306]): suggestive (+100 MiB median), **not
  established** (one 8K launch landed inside the small-wallpaper range).
- Glass off vs on with particles running, idle (2.2 vs 3.8, n=1 vs 4): suggestive only.

T1 and T2 verdicts on this GPU, with confidence:

- **T1** (particles keep glass bubbles re-blurring): confirmed as a mechanism. The control page shows static
  glass is free (0.00%) and the same glass over a 30 fps canvas costs 3.7% for 10 bubbles and 14.6% for 40
  (high confidence). On a real theme it is roughly 1.6 of 3.8 idle points, about 40% of the particle cost
  (low confidence, n=1 for the glass-off arm). Total particle+glass idle cost is small in absolute terms
  (about 4% of the chip, 56 Mc/s) but never goes away while the window is visible.
- **T2** (8K wallpapers): no measurable drawing-time cost on this chip; possible 100-200 MiB extra GPU
  memory (moderate/low confidence). Unified memory (4 GB VRAM carve-out, 128 GB shared) makes this machine
  the least likely place for 8K to hurt; phones are the real question (section 5).
- **T3** (fonts after first paint): not measured here (needs network timing, not GPU).
- **T4** (Reduce Visual Effects holes): the toggle is effective for particles and glass in the measured
  scenes (0.0% idle, stream back to plain level). Wallpaper size, custom-CSS blur and the buddy loop were not
  tested.
- Per-tile card-grid blur and mascot companions: not measured (no scene built for them); both can now be added
  as cells (`halftone-dimension`, `golden-sunbreak`, `kuromi-dreamer` carry companions: the Kuromi
  welcome reading of 6.5% GPU / 21.7% GPU-process CPU, one launch, is the first sign they cost more than a
  body-only mascot).

Caveats that apply to every number above: the owner was using the machine (whole-chip busy 15-53%) and
other sessions spawned load up to 320; engine time is clock-dependent; stream windows varied 40% between
launches (use at least 3 launches per cell and compare megacycles); builds are from `e9ba76e3`, which predates
whatever is in the other builder's working copy.

### 4. If a visible check is wanted (NOT run)

Only needed to confirm scanout behaviour and to judge smoothness by eye. Procedure: with Destin's say-so and
while he is away from the machine (or on a second virtual desktop), run `node scripts/perf-lab/gpu-theme.mjs`
(Xwayland) or the presentation probes (`presentation-capture.mjs`) against the real compositor: one 1400x900
window opens on his screen for about 60-90 s (5 s windows), no sound, takes no input, closes itself. He must
not use the machine's GPU heavily; per-process `fdinfo` keeps his desktop out of the app's number, but the
compositor's cost in whole-chip busy % would include his activity. Numbers can say: GPU time, frames
presented, intervals, late flips on the real panel. Only his eyes can judge: whether motion at 180 Hz looks
smooth, tearing/flicker (PSR artefacts are a known panel quirk here), and whether glass/particle themes feel
heavier than plain ones.

### 5. Phone

Equivalent measurement on Android: `adb shell dumpsys gfxinfo <package> framestats` (and `reset`) for janky-frame
counts, frame-time percentiles and GPU-time per frame on Android 12+; a Perfetto trace with `gpu/render_stages`,
`gpu_frequency` and `surfaceflinger` frame timeline for GPU work and missed vsyncs; `adb shell dumpsys
meminfo <package>` for graphics memory and the image-decode cost of the 8K wallpaper (the phone is where T2
should bite: separate GPU memory budget, no 128 GB pool). Same discipline: positive control (N glass layers),
repeat-launch noise floor, thermal state recorded, same theme with Reduce Visual Effects on/off. No phone was
attached; nothing was attempted.

### 6. Standard procedure going forward

1. `node --test scripts/perf-lab/tests/gpu-cost-parse.test.mjs scripts/perf-lab/tests/gpu-cost.test.mjs`
2. Ensure no other app holds ports 10000/10020/9558 (the tool checks).
3. Build or copy the packaged app into `scratch/perf-lab/gpu/app` (rig build helper or copy a frozen
   `linux-unpacked` plus its `.perf-lab-build.json`).
4. `node scripts/perf-lab/gpu-cost.mjs --app-dir <app> --out <scratch/perf-lab/gpu/x.json> --suite control` (the
   control must rise with N and the idle range must be tiny before any theme number is believed).
5. `--suite themes --cells '<theme>,<theme>+noparticles,<theme>+reduced,...' --scene chat,stream --repeats 3`,
   run each cell in at least 3 launches, interleaved (A B A B), prefer quiet-machine moments, compare
   megacycles/second as well as percent.
6. Judge differences only with `exceedsNoise` (2x spread across launches); open the saved screenshot.
7. Stop the private compositor (the tool does) and confirm no process of ours remains.

### Commands used (exact)

```
kwin_wayland --virtual --socket perf-0 --width 2560 --height 1600 --scale 1.5 --no-lockscreen --no-global-shortcuts   # under dbus-run-session, private XDG_*
kscreen-doctor output.Virtual-0.addCustomMode.2560.1600.180000.full ; ...mode.<id> ; ...scale.1.5                      # private socket only
gamescope --backend headless -W 2560 -H 1600 -r 180 --expose-wayland -- sleep 80                                       # XDG_RUNTIME_DIR=/tmp/gsrt
Xvfb :98 -screen 0 1600x1000x24 -nolisten tcp   + app flags listed in the table
node scripts/perf-lab/gpu-cost.mjs --app-dir .../scratch/perf-lab/gpu/app --out .../control-1.json --suite control --seconds 15 --repeats 3
node scripts/perf-lab/gpu-cost.mjs ... --suite themes --cells 'midnight,cotton-candy-sky,...' --scene chat,stream --seconds 15 --repeats 3
```

Raw: `scratch/perf-lab/gpu/{control-1,themes-A,themes-B,themes-C,welcome,shake-*}.json`, `systeminfo-kwin-virtual.json`,
`wayland-info-kwin-virtual.txt`, `mp-*.json` (Xvfb/headless probes), screenshots under `work/`.
