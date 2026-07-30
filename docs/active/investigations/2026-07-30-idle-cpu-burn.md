---
status: shipped
---

# YouCoded desktop idle CPU burn — measured, attributed, fixed

**Date:** 2026-07-30 (rewritten same day after re-measurement disproved the first fix)
**Branch:** `perf/reduced-effects-animations` (youcoded PR #275; supersedes closed PR #274)
**Handoff:** `docs/active/handoffs/2026-07-30-youcoded-idle-cpu-burn.md`

---

## Result in one line

**On a high-refresh display, ANY smoothly-animating element costs ~29% of one
CPU core** — Chromium presents a frame per refresh at ~1.5–1.9ms of CPU each,
regardless of the element's size or properties — and the only fixes that work
are presenting **fewer** frames (`steps()` timing: 28.75% → 9.33%) or **zero**
frames (finite animations / Reduced Effects: → ~2.5%).

## The headline numbers (all controlled, single-variable, /proc-sampled)

| Scenario (2560x1600 @ 180Hz, idle, visible) | CPU (% of one core) |
|---|---|
| Nothing animating | **0.25–2.5%** |
| One 64px smooth pulsing div — in YouCoded | 29.8% |
| The same div — in a **bare Electron window, zero app code** | **33.7%** |
| The same div — in **plain Google Chrome** | **26.7%** |
| An 8px, layer-promoted, pure-transform animation (cheapest possible) | 31.9% |
| The same pulse with `steps(8)` timing (8 updates/sec) | **9.33%** |
| JS-driven opacity at 8 updates/sec | 6.17% |

Three structural facts fall out of that table:

1. **The cost is per-FRAME, not per-element.** Eight pulsing divs cost ~1% more
   than one. An 8px transform animation costs the same as a 64px repaint.
2. **It is not YouCoded's fault, and not Electron's.** Google's own tuned
   browser pays the same price. This is Chromium's present path on Linux/
   Wayland; ~1.5–1.9ms/frame is within the normal range — at 60Hz it reads as
   an unremarkable ~9%. A 180Hz panel triples it. (Destin's machine has a known
   amdgpu DCN3.5 quirk — `DC_DISABLE_IPS` currently missing from the kernel
   params — which may inflate the per-frame cost somewhat; untested.)
3. **Compositing tricks cannot reduce it.** Only frame count can.

## Correction history — what this doc used to claim

**PR #274 (closed) shipped `will-change` layer promotion claiming a 12× win
(43% → 3.6%). That measurement was wrong.** The "promoted" reading was taken
seconds after the window was restored from minimized via `buddy.openMain()` —
before Chromium had resumed presenting — the same artifact that produced a
bogus "0 fps" reading acknowledged at the time. The fps artifact got caught and
documented; the CPU measurement sharing its cause did not get re-checked until
a later session pushed back on the numbers. Properly controlled: promotion
gave 29.8% → 27.8%.

Second contaminated result, opposite direction: an early `steps()` test read
40–47% ("doesn't help") while probe windows from the bare-Electron and Chrome
control experiments were stacked over the dev window, changing compositor
occlusion. Re-run clean: `steps(8)` = 9.33% — it works, and became the fix.

Lesson recorded for future perf sessions: **a window's presentation state
(minimized/restored/occluded) is part of the experiment.** Re-verify the
baseline inside the same window state before trusting any A/B, and treat any
measurement adjacent to a known artifact as suspect until re-run.

## Also corrected: the handoff's premise

The handoff's 104–133% live-app figures were **not idle burn** — the measuring
session discovered it was itself running inside Destin's live app alongside six
other streaming CC sessions (~99% of a core between them). The app was
rendering active work. Real idle in a dev instance reproduced at 35.6% with
three sessions showing the pulsing "Initializing" overlay — which is what led
to the animation finding.

Hypotheses from the handoff, all tested, all refuted: lease/heartbeat polling
(renderer JS 99% idle), hidden-terminal WebGL (display:none changed nothing),
PTY churn (0 bytes in 10s), glassmorphism blur (removing it made things
*worse*), theme particles/rigs (Destin's theme ships neither).

## What shipped (PR #275)

### Zero frames where the animation is decorative-forever

- **Reduced Effects now actually stops CSS animations.** `data-reduced-effects`
  is written onto `<html>` by `theme-engine.ts` but had ZERO CSS rules gating on
  it — the setting was silently doing nothing to keyframe animations. All 14
  `infinite` declarations were swept; most were already JS-gated (rig loops,
  buddy breathing, companion shimmer). The three that weren't — `.flowing-word`
  and both `model-load-sweep` bars — now gate on it, mirroring their existing
  `prefers-reduced-motion` fallbacks. Measured: 48.78% → **2.44%**.
- **`.flowing-word` is now finite** (plays twice, settles; frozen gradient
  screenshot-checked legible). It animates `background-position` — main-thread
  painted, so neither promotion (43.0 vs 43.8) nor steps() (~40%) rescues it,
  and one visible keyword cost 43–66% of a core forever in the app's most
  common state (a chat full of user messages).

### Fewer frames where the animation should keep running

Controlled A/B: smooth 28.75% → `steps(8)` 9.33%. Applied:

- `.animate-pulse` → `steps(8)` — 8 opacity changes/sec, visually
  indistinguishable on small dots/badges (13 sites)
- `.animate-spin` → `steps(12)` — a classic 12-tick spinner; slightly visible
  by design (8 sites)
- `SessionStrip` breathe dot → `steps(8)` — **the app's most persistent
  animation**: inline in TSX (invisible to CSS-file sweeps), runs for every
  non-idle session in the always-visible header
- `HeaderBar` challenge-pulse → `steps(8)`

End-to-end verified through the real UI: computed `animationTimingFunction`
resolves to `steps(8)` on the real initializing overlay, and the original
35.6% repro scenario now measures **11.0%** with the animation still running.
Loading spinners deliberately keep animating (a frozen spinner reads as a hung
app); Reduced Effects remains the zero-frames escape hatch on top.

### Why not a global 30fps cap

Destin's original instinct — and directionally right (frame count is the only
lever). But Electron's `webContents.setFrameRate()` is offscreen-rendering-only
and Chromium's frame-rate switches only *remove* caps, so there is no
app-global knob. `steps()` per animation IS the cap, applied only to decorative
animation while scrolling/typing/terminal keep full refresh-rate smoothness.

## Guards left behind

1. **`desktop/tests/animation-frame-budget.test.ts`** — pins every steps()
   quantization, keeps `.flowing-word` finite, and closes the class: any NEW
   inline `animation: '… infinite'` in `components/` without steps() timing
   fails the suite.
2. **`desktop/tests/reduced-effects-animations.test.ts`** — pins the Reduced
   Effects gating, both halves of each duplicated rule (CSS cannot express
   "selector OR media query" in one rule), plus the keep-spinners-spinning
   decision.
3. **`youcoded-dev/scripts/measure-idle-cpu.mjs`** — repeatable measurement:
   /proc-samples the dev Electron family, lists running animations, and flags
   any SMOOTH one (the failure mode) vs `frame-budgeted: steps(N)`. Refuses to
   sample the packaged production app (live-app-safety interlock). The CDP
   probe runs *after* the sample window — probing rAF mid-sample both inflates
   the number and destroys the idleness being measured. The reported fps is the
   presentation rate, not idle frame production.

Both test files were confirmed to FAIL with their fix removed.

## Still open

- `model-load-sweep` animates `left` (forces layout per frame; transient, now
  Reduced-Effects-gated) — converting to transform is a visual change.
- Mascot/buddy keyframes animate inner SVG elements; only run for rig-shipping
  themes. Same steps() treatment would apply if they show up in measurements.
- Three perpetual rAF loops that re-request every frame while mounted
  (`BrailleSpinner.tsx:42` — though its *state* ticks at 12.5fps, the rAF
  itself runs at refresh rate; `ThemeEffects.tsx:206` — 30fps-capped work but
  full-rate rAF; `MascotRig.tsx:247`). Candidates for setInterval or
  rAF-with-frame-skip if they appear in future measurements.
- Whether this machine's per-frame cost is inflated by the missing
  `DC_DISABLE_IPS` amdgpu flag (see memory: env-amdgpu-pageflip-timeout) —
  measurable by comparing after the kernel-param fix, or at 60Hz.

## Method note

All instrumented measurement in dev instances (`worktrees/idle-cpu`, then
`worktrees/reduced-fx`) per the live-app-safety rule; production contact was
read-only /proc sampling. The decisive technique throughout: single-variable
A/B with /proc CPU deltas, and — after the contamination episodes — a re-run
of the baseline in the same window state before believing any delta.
