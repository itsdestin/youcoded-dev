---
status: shipped
---

# YouCoded desktop idle CPU burn — measured, attributed, fixed

**Date:** 2026-07-30
**Branch:** `perf/idle-cpu-burn` (youcoded)
**Handoff:** `docs/active/handoffs/2026-07-30-youcoded-idle-cpu-burn.md`

---

## Result in one line

**Any perpetual CSS animation that is not layer-promoted costs ~39% of one CPU
core** on a 180 Hz display, because Chromium repaints and re-rasterizes the
*whole window* on every frame. Two lines of CSS (`will-change` on
`.animate-pulse` / `.animate-spin`) cut the measured repro from **35.6% → 1.6%**.

---

## First, a correction to the handoff's premise

The handoff's headline evidence — the live app family at 104–133% of a core —
is **not idle burn**. While measuring, this session discovered it was itself
running *inside* Destin's live YouCoded app (its shell traced up to the app's
process tree), alongside six other Claude sessions:

```
PID     4643   21.4%      PID  1048730    9.6%
PID   842154    4.6%      PID  1092781    6.4%
PID   990580    6.6%      PID  1168149   24.2%
                          PID  1175353   26.6%
                          TOTAL ~99% of one core
```

Seven concurrently-streaming CC sessions were feeding PTY output and transcript
events into the app's renderers. The app was **rendering active work**, which is
what it is supposed to do. The handoff's 22-hour average (~21% of a core) is the
defensible figure and includes genuinely idle time; the instantaneous 104–133%
readings should not be treated as an idle baseline.

That does not make the investigation moot — it relocates it. Measuring a *real*
idle app in a dev instance found a burn that is worse per-unit than anything the
handoff suspected, and that is present whenever the app is visible.

## What the leading hypotheses turned out to be

Every hypothesis in the handoff was tested and **none of them was the cause**:

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Lease/heartbeat polling fanning out to the renderer | Not it | Renderer JS profiled at **99.06% idle**; main process was ~6% |
| Hidden terminals' xterm/WebGL still rendering | **Refuted by experiment** | Forcing `display:none` on all 3 hidden terminals: 35.6% → 33.9% (noise) |
| PTY polling / transcript churn | Not it | Instrumented `pty:output`: **0 events, 0 bytes** over 10s |
| Theme particles / mascot rig rAF loops | Not applicable | Destin's theme (`meadow-mist`) sets `particles: "none"` and ships no rig |
| Glassmorphism `backdrop-filter` re-blur | Not the multiplier | Removing `data-wallpaper` made it *worse* (33.9% → 41.5%) |
| GPU compositing at 180 Hz "even when static" | **Half right** | Compositing was the cost — but only because something was animating |

The signature that broke it open: **compositor and GPU busy, JavaScript totally
idle**. That rules out every timer, poll, and re-render hypothesis at once, and
points at something producing frames without running any JS — a CSS animation.

## Root cause

The app was showing its **"Initializing session…" overlay**, whose icon carries
Tailwind's `animate-pulse` (`App.tsx:2898`) — an *infinite* opacity animation.

`animate-pulse` and `animate-spin` were not layer-promoted. An animation on a
non-promoted element is driven from the main thread: every frame damages the
element, which invalidates its containing layer, which makes Chromium repaint
and re-raster — and then the browser process commits a new surface. At the
panel's **2560x1600 @ 180 Hz** (renderer confirmed producing exactly 180 fps),
that is 180 full-window recomposites per second, forever.

**The cost is per-frame, not per-element.** This is the crucial property:

| State (dev instance, idle, visible) | CPU (% of one core) |
|---|---|
| Baseline — welcome screen, zero animations | **4.1%** |
| One 64px `animate-pulse` div, nothing else changed | **43.2%** |
| Eight such divs | 52.3% |
| One div, but with `will-change: opacity` | **3.6%** |
| Window minimized (8 divs still animating) | 3.9% |

The first perpetual animation costs ~39%; each additional one costs ~1%. So
"reduce the number of animations" is not a fix — **only reaching zero running
animations, or promoting them, wins anything.**

Two useful corollaries:

- **Chromium already throttles hidden windows correctly.** The handoff's "~0%
  hidden" budget was already met (3.9% minimized). The problem is exclusively
  *visible-and-idle*, which is how Destin's app sits all day.
- **The burn scales with refresh rate.** The same animation costs roughly a third
  as much on a 60 Hz panel. Destin's 180 Hz machine pays triple.

## The fix

`desktop/src/renderer/styles/globals.css`:

```css
.animate-pulse { will-change: opacity; }
.animate-spin { will-change: transform; }
```

Promotion moves the animation onto the compositor thread, so only that small
layer is recomposited instead of the whole window. Verified the animation still
genuinely runs after the change — `playState: "running"`, `currentTime`
advancing, computed opacity oscillating 0.69 ↔ 0.81 — i.e. this is a pure
performance change with no visual difference.

Scoped to these two utilities rather than applied broadly because `will-change`
permanently costs GPU memory for each promoted layer; these two classes are only
ever present on an element that is already animating. There is **no
stacking-context risk**: an element mid-animation on opacity (<1) or transform
*already* establishes a stacking context and containing block, so declaring
`will-change` on those same properties changes no layering or layout.

Covers 21 call sites (13 `animate-pulse`, 8 `animate-spin`) including status
dots, sync lights, install spinners, the marketplace auth badge, and the
Connect-4 turn indicator — i.e. most of the app's long-lived UI chrome.

### Measured effect

Same scenario (3 sessions showing the pulsing "Initializing" overlay):

| | CPU |
|---|---|
| Before | **35.6%** of one core |
| After | **1.6%** of one core |

## Top remaining offender: `.flowing-word` (measured, NOT fixed here)

`.flowing-word` (`globals.css:1368`, used by `FlowingKeywords.tsx` and
`UserMessage.tsx`) animates **`background-position`** on an infinite loop to
give keywords a flowing-gradient look. It already pauses when its timeline entry
scrolls out of view (`.timeline-entry:not(.in-view)`), but **every on-screen
keyword animates forever** — and Destin's chat is full of user messages.

Measured with a faithful standalone replica of the rule:

| | CPU (% of one core) |
|---|---|
| One flowing keyword visible | **43.8%** |
| Same, plus `will-change: background-position` | 43.0% — **no help** |

`background-position` is not a compositable property, so layer promotion does
nothing for it (unlike opacity/transform). Note the renderer main thread runs
*higher* here (18.3%) than in the opacity case, because the text is re-painted
on the main thread every frame.

Fixing it properly means changing the technique — e.g. a `transform:
translateX()`-driven gradient overlay behind `background-clip: text`, which
composites. That is a **visual** change to how chat text renders, so it was
deliberately not bundled into this verified, visually-neutral perf PR. It should
be built and eyeballed in the workbench.

**Partly mitigated in PR #275** (below): Reduced Effects now stops it. That is a
user-opt-in escape hatch, not a fix — the default path still pays the cost.

## Follow-up shipped: the Reduced Effects toggle did nothing to CSS (PR #275)

`data-reduced-effects` is written onto `<html>` by `theme-engine.ts`, but it had
**zero CSS rules gating on it** — it was read only in JS, by `ThemeEffects` and
`MascotRig`. Turning Reduced Effects on therefore left every CSS keyframe
animation running.

Swept all 14 `infinite` animation declarations and checked each one's gating.
Most were already covered (rig loops in `MascotRig`, buddy breathing in
`BuddyMascot.tsx`, companion shimmer by `.mascot-scene[data-effects-off='1']
.mascot-comp *`). Three were not: `.flowing-word`,
`.model-load-track::after`, `.model-load-finalize::after` — each already had a
`prefers-reduced-motion` fallback, so the fix reuses those declarations under an
`[data-reduced-effects]` trigger.

Measured A/B with one keyword on screen: **48.78% → 2.44%** of one core.

Verified through the *real* setting path (appearance IPC + reload), not by
poking the attribute — and the frozen gradient was screenshotted to confirm the
keyword stays legible, so no extra fallback styling was needed.

Loading spinners deliberately keep spinning: a frozen spinner reads as a hung
app, and they are transient and already cheap after promotion. The guard test
pins that decision too.

### Why "just cap the app to 30fps" is not the answer

Considered and rejected on evidence:

- **Electron cannot do it.** `webContents.setFrameRate()` is documented as
  offscreen-rendering-only; switching the main window to offscreen rendering
  would mean software compositing and would wreck the xterm WebGL path.
  Chromium's frame-rate switches (`--disable-frame-rate-limit`,
  `--disable-gpu-vsync`) only ever *remove* caps.
- **Promotion beats capping anyway.** A 30fps cap would divide the 43% by ~6 to
  ~7%; layer promotion measured **3.6%**, and keeps full 180Hz responsiveness
  for scrolling, typing and terminal output.
- **Refresh rate is a multiplier, not a constant tax.** Chromium only produces
  frames when something damages the screen, so an idle app with nothing
  animating costs nothing regardless of the panel's rate.

## What was NOT changed, and why

- **`model-load-sweep`** (`globals.css`) animates `left`, which is not
  compositable at all — it forces layout every frame, which is worse still. Left
  alone because it only runs during model loading (genuinely transient), and
  fixing it means converting it to a `transform` animation, which is a visual
  change that wants Destin's eyes on it.
- **Mascot / buddy keyframes** (`mascot.css`, `buddy.css`) are transform-based
  but animate *inner SVG elements*, which Chromium generally cannot promote.
  These only run for themes shipping a rig mascot (not Destin's), so they were
  out of the reproducible path. Worth a follow-up.
- **The "Initializing session…" overlay's own logic.** In the repro it stayed up
  indefinitely because the synthetic sessions never signalled ready. With the
  animation now costing ~0 this is no longer a CPU issue, but a session that
  never initializes still shows a permanent overlay — a UX bug, tracked
  separately rather than bundled into a perf fix.

## Guards left behind

1. **`desktop/tests/animation-layer-promotion.test.ts`** — pins both promotion
   rules. Confirmed it *fails* when the two CSS lines are removed (a guard that
   cannot fail is worthless). Source-text assertion on purpose: the failure mode
   is someone deleting two unused-looking CSS lines, and nothing renders
   differently when they do.
2. **`youcoded-dev/scripts/measure-idle-cpu.mjs`** — repeatable measurement.
   Samples the dev Electron family via `/proc`, reports % of one core, and over
   CDP lists every *running* animation flagged `promoted` / `NOT PROMOTED`, plus
   the rate the window presents at. Takes `--budget N` for a non-zero exit.
   **Two corrections applied 2026-07-30 after the script contaminated its own
   reading:** the CDP probe now runs *after* the sample window, not inside it
   (counting frames requires requesting rAF, and requesting rAF itself makes
   Chromium present — so probing mid-sample both inflated the CPU number and
   destroyed the idleness being measured); and the fps figure is labelled as the
   refresh rate rather than "idle frame production", because a visible idle page
   still reports ~180 for that same reason. **The CPU total is the real signal;
   the animation list is the diagnostic.** An earlier 0 fps reading here was the
   artifact of a window that had just been restored and was not yet presenting.
   It **refuses to sample the packaged production app** (matches only the
   `node_modules/electron/dist` binary), so it cannot be pointed at the live
   install in violation of `.claude/rules/live-app-safety.md`.

```bash
YOUCODED_DEVTOOLS_PORT=9333 bash scripts/run-dev.sh <worktree> --label "Idle CPU"
node scripts/measure-idle-cpu.mjs --seconds 20 --budget 10
```

Note the numbers are machine-specific (they scale with refresh rate and
resolution) — compare against a baseline captured on the same machine.

## Method note

Everything was measured in a dev instance (`worktrees/idle-cpu`, offset 70,
profile `idlecpu`) per the live-app-safety rule. Contact with the production
install was limited to read-only `ps` / `/proc` sampling from outside. The two
hypotheses that felt most obvious — hidden terminals, and glassmorphism blur —
were both **refuted by single-variable experiments**, which is the only reason
the real cause surfaced instead of a plausible-sounding fix landing on top of it.
