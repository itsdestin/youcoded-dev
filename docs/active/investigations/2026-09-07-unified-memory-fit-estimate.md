---
status: active
date: 2026-09-07
area: local-models
---

# Every local model is mislabelled on a shared-memory machine

Destin, 2026-09-07, looking at the model browser on a 128 GB laptop: *"a 2b model is saying
'will be tight' on my 128gb ram laptop"*.

<!-- claim: the fit estimate scores models against an AMD APU's 4 GB BIOS carve-out instead of the ~90 GB pool the graphics chip can actually reach, so every curated model is mislabelled on that machine -->

## What the app decided, in its own numbers

Reproduced exactly, using the header the app itself had cached for `unsloth/Qwen3.5-2B-GGUF`
and his own 128k context setting:

| | |
|---|---|
| model weights | 1.90 GB |
| working headroom | 0.54 GB |
| context cache at 128k | 1.75 GB |
| **needed** | **4.19 GB** |
| pool it scored against | 4.29 GB |

98% of the pool, so: `tight`, and — because it still fits *inside* the pool — the wording is
"Will be tight — close other apps first" rather than the split-across-memory line. That is
the exact sentence on his screen.

Score the same model against the pool the machine really has and it returns `fits` /
"Runs fast — fits on your GPU".

## Where 4.29 GB comes from

The Linux probe reads `/sys/class/drm/card*/device/mem_info_vram_total` and treats any
number there as a discrete card's VRAM. On this Strix Halo APU that file holds the BIOS
carve-out — 4 GiB — and the machine's real graphics budget sits in the sibling file
`mem_info_gtt_total` at 85.9 GB, which nothing reads.

    4294967296 (vram) + 85899345920 (gtt) = 90194313216 = 86016 MiB

which is exactly what the engine's own device list reports on the profiles where an engine
install recorded it. So the correct number is available without the engine, from the same
folder already being read.

Two further consequences of the same mistake: the carve-out is also flagged as *dedicated*
VRAM, which switches off the estimator's cap on the split ceiling — on this machine it would
offer ~118 GB of ceiling on a 128 GB laptop — and any install whose engine marker predates
the recorded-devices field falls through to this probe, which includes his main install.

## Impact, measured at his 128k context

| Model | Says today | With the real pool |
|---|---|---|
| Qwen3.5 2B | Will be tight — close other apps first | Runs fast — fits on your GPU |
| Qwen3.5 9B | Runs, but splits across your GPU and memory | Runs fast — fits on your GPU |
| Qwen3.6 27B | Runs, but splits across your GPU and memory | Runs fast — fits on your GPU |
| GPT-OSS 120B | Runs, but splits across your GPU and memory | Runs fast — fits on your GPU |

The bug is not new and is not from the Assistant settings branch — those files are untouched
by it, and the wrong number reproduces from the system file plus compiled code with none of
that branch's changes in the path. What made it visible is his context setting: at the 32k
default the same model reads "fits" even against the 4 GB pool.

## What Destin asked for (2026-09-07)

> "we should count shared memory on all unified devices like this and mac/m-series chips and
> windows machines where it makes sense. and we should check logic so counts aren't
> duplicated."

**Count the shared pool, everywhere it is real.** Linux AMD/Intel integrated: carve-out plus
the driver's shared allowance, both already published. Apple M-series: memory is unified, and
the system publishes a recommended working-set size. Windows integrated: the adapter reports
dedicated *and* shared system memory; only the dedicated half is read today. Discrete cards
are unchanged — that memory really is separate.

**Three places the same bytes can be counted twice**, one of them live today:

1. A shared pool must not be flagged as dedicated, or the cap that keeps the split ceiling
   inside the machine's real memory is skipped.
2. For a shared pool the ceiling is the *smaller* of the driver's allowance and free system
   memory, never the sum — they are the same bytes.
3. A resident model is subtracted from the pool and is already missing from free system
   memory; on a shared machine that is one subtraction too many.

**And stop trusting the install-time note.** Asking the engine what it can see when the
answer is needed fixes every existing install, his included, without a reinstall — and it
covers Metal, Vulkan and ROCm with one mechanism.
