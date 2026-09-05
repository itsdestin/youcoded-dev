---
status: active
date: 2026-09-05
feature: mascot-restyle
---

# Mascot restyle — what Destin has decided

Everything here came off a deck he answered, not off a chat message. The deck
files beside this one are the raw record; this is the readable summary.

## The shape of the work (questions deck, 2026-09-04)

| | Decision |
|---|---|
| **Characters** | **All eight.** Redraw the five that exist — the default one (used by Light, Dark, Midnight, Crème, Cotton Candy Sky, Meadow Mist and Devil's Garden), Golden Sunbreak, Halftone Dimension, Kuromi Dreamer, Strawberry Kitty — and invent three new ones for the themes that have none. |
| **New expressions** | **`happy` and `shut-down`. NOT `smug`** — he was never asked for it on its own and it is not being drawn. Recorded as "Other" on the deck for exactly that reason. |
| **Resting face** | **Open, awake eyes.** The `><` closed squint stops being his default and becomes a moment. |
| **Motion** | **Reactions to what the app is doing, plus spontaneous moments of his own.** |
| **Sleep** | **After a few quiet minutes, waking on any activity.** |

**The constraint that governs the whole motion design, in his words:**

> "the non-notifying movements should be subtle enough to be distinguished from
> a single clear 'needs attention' animation when a session has a blue/red/yellow
> status light"

Those three colours are a system that already exists (`useSessionAttention.ts`):
**red** = a permission prompt, or stalled/died/errored; **amber** = something may
be wrong, unsure; **blue** = activity in a session you haven't looked at; **green**
= working; **gray** = idle. So green and gray are the only states where anything
spontaneous is allowed, and every attention colour stops the ambient tier and
plays the one clear animation. The buddy window is ALREADY sent every session's
dot colour in its attention payload — it just doesn't use it yet.

## Falling asleep (live decks, 2026-09-04/05)

**Round 1 — the posture. Picked: the loaf.** ("i quite like loaf.") Beat a slump
and a shrink-and-dim.

**Round 2 — the arms. Picked: docked.** All the way down and pulled in, so his
outline while asleep is one clean shape with nothing sticking out. Beat a light
tuck and a flumped-out wildcard.

**The z's: yes — "keep slow/subtle".** Not built yet; they need the sleep STATE
(the idle timer and the wake triggers), which belongs with the two-tier motion
design above, not with the pose.

Shipped as the single `sleep` pose. The five losing poses were deleted; the
compare rounds stay and render what shipped, as the record of how it was decided.

## What this cost to find out, worth not rediscovering

- **The promo film's faces and poses never reached the app.** They live in the
  film's own tooling and, drawn a second time by hand, on the marketing site.
  The app's `mascot-poses.ts` has none of it.
- **A pose could not move the buddy's BODY at all** until 2026-09-05 — the type
  allowed it, `applyPose` skipped it by name. So "just port the film's pose" was
  never possible on any theme.
- **No pose change in the app had ever animated.** React rebuilds the mascot's
  host element on a pose change, and the re-index threw the springs away and
  rebuilt them already at their target. Fixed; guarded.
- **The roadmap's Golden Sunbreak version worry is a false alarm.** The vendored
  copy at `desktop/src/renderer/themes/community/golden-sunbreak/` is loaded by
  nothing — no import, nothing in the build or packager config. Users get the
  registry's current version, which is the one the film used. That item can close.

## Still open

- The faces themselves — nothing drawn yet. The default character first: it is
  what seven of the eleven themes use, and every other character is judged
  against it.
- The two-tier motion system, and the sleep state that the z's hang off.
- Three brand-new characters for Cotton Candy Sky, Meadow Mist and Devil's Garden.
