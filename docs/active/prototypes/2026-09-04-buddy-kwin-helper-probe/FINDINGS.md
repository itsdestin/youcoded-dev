---
status: active
date: 2026-09-04
type: prototype
subject: KWin-helper route for the buddy floater on native Wayland
predecessor: docs/archive/prototypes/2026-07-22-buddy-wayland-workbench/FINDINGS.md
roadmap: docs/roadmap/other-features.md → buddy → "Buddy floater does not appear on Linux Wayland"
---

# Buddy floater — KWin-helper probe

Tests the one route the 2026-07 investigation *named* (FINDINGS Round 5c, "the
KDE-native helper path is precedented") but never executed. The premise: KWin
scripts run **inside** the compositor, so they are not bound by the Wayland
restriction that blocks the app. If a helper script can position and raise the
floater, the three primitives Electron cannot supply come back — without
XWayland, without the fullscreen-overlay rewrite, and without the click-through
primitive that killed the overlay.

## Environment

| | |
|---|---|
| Compositor | KWin 6.7.3, native Wayland, KDE Plasma |
| Electron | 41.10.7 (post-#50541 — the smear fix is already in) |
| Display | 1707×1067 logical, 1.5× fractional scale |

## Round 0 — headless (2026-09-04)

All three primitives Electron cannot deliver on Wayland **work through a KWin
script**, ground-truthed by reading `frameGeometry` back from the compositor.

| ID | Question | Verdict | Evidence |
|----|----------|---------|----------|
| K1 | Can a KWin script read the window's TRUE position? | **YES** | KWin `x=643,y=357`; Electron claimed `x=0,y=0` in the same second |
| K2 | Can a KWin script set `keepAbove` — the primitive Electron no-ops? | **YES** | `VERDICT\|keepabove\|SET`, read back true |
| K3 | Can a KWin script MOVE the window? | **YES, exactly** | 7/7 moves landed on the requested pixel (`asked=900,640 got=900,640`) |
| K4 | Cost of one load→run round trip | **6–10 ms** | `ROUNDTRIP` lines, 8 samples |
| K5 | Cost of re-running an already-loaded script | **2–4 ms** | 3 samples |
| K6 | Sustained move rate, naive reload-per-move path | **41/sec** | 60-move sweep in 1434 ms (includes `python`+`sed`+3 DBus calls each — the *pessimistic* number) |

**Electron's lie reconfirmed, in the same breath:** while KWin reported the
window at `643,357`, Electron's own `getBounds()` reported `0,0` and
`isAlwaysOnTop()` reported `true` against KWin's `keepAbove=false`. Any future
work must keep treating the compositor as the only source of truth.

## Round 0c — the caption channel (the useful discovery)

A per-move DBus call is not needed at all. KWin scripts have no filesystem and
no inbound DBus, but they *can* subscribe to compositor signals — and the window
title is a channel the app already owns and can write for free.

**Mechanism:** the app renames its own window to `YOUCODED-KWIN-PROBE@<x>,<y>`.
A resident helper script (`kwin/resident-follow.js`) listens on `captionChanged`,
parses the coordinates, and assigns `frameGeometry`.

**Result: 120 title writes at a 60 fps cadence → 120 applied moves, zero drops**,
each landing on the exact requested pixel. So the app can drive its own window
position at frame rate on native Wayland, with no per-move IPC to the compositor
and no script reloads.

This is what turns the route from "snap-to-position only" (the 2026-07 guess,
based on kdotool's load-a-script-per-call cost) into a full drag-follow model.

## Why dragging works without a global cursor

`screen.getCursorScreenPoint()` is still dead on Wayland (`{0,0}`, 2026-07 A2),
so the classic "window = cursor − grab offset" is unavailable. It is not needed:
the app **knows where its own window is, because it put it there**. Therefore

    cursor-in-screen = windowPos + cursor-in-window

and keeping the grab point under the finger reduces to
`newWindowPos = windowPos + (client − grab)`. The window chases the pointer and
the residual error self-corrects every frame. Works for touch and touchpad alike;
no `movementX`, no pointer lock. Implemented in `index.html`.

## Round 1 — Destin's hands (2026-09-04) — PASS

```bash
bash docs/active/prototypes/2026-09-04-buddy-kwin-helper-probe/interactive.sh
```

**Verdict (Destin, live, two sessions): "that seems awesome."**

Compositor-side record of the second session: 296 moves, every one landing on
the requested pixel, drags sustained at 30–53 moves/sec with no drops, a ~1m45s
still period in the middle (consistent with the focus test), and two isolated
single-move jumps at the end (the snap buttons). No crash; helper unloaded on exit.

**Still to confirm in words:** whether `keepAbove` actually held the rig above a
focused window. It is the one primitive that has never been eyeball-confirmed on
Wayland, and the script-set value reading back `true` is not the same as seeing it.

Loads the resident helper, opens a 300×300 draggable rig, unloads the helper on
exit (`trap`, all paths). The helper only ever matches captions **starting with**
`YOUCODED-KWIN-PROBE`, so no real window can be touched.

| ID | Question | Why it decides the architecture |
|----|----------|--------------------------------|
| E1 | Does the drag *feel* smooth, or lag/stutter behind the finger? | Round 0 proves the moves land; only eyes can judge the feel. If it stutters, the model degrades to snap-on-release. |
| E2 | Does it stay above a focused window (click another app, then look)? | `keepAbove` is set by the script; 2026-07 I4 showed Electron's own call is a no-op. This is the primitive that has never been eyeball-confirmed. |
| E3 | Is the see-through area clean while dragging — no smear, no frozen backdrop? | The Electron bump was supposed to have fixed this class; confirms it holds under compositor-driven movement. |
| E4 | Do the snap buttons land instantly and exactly? | Proves snap/dock/peek geometry remains computable. |

**Not yet probed, and required before any plan:**
- Multi-monitor: does `frameGeometry` address the TV correctly, and does the
  app's idea of screen bounds survive?
- Startup ordering: the helper must be loaded before the floater appears, and
  survive a KWin restart.
- Shipping the helper: installing a KWin script from an app needs a decision
  (bundled file + DBus load at launch is the obvious path; needs its own probe).
- **GNOME / wlroots: nothing here transfers.** This is a KDE-only lever, and the
  floater stays broken there. That is not a regression — it is broken there today.

## Reproducing

```bash
cd docs/active/prototypes/2026-09-04-buddy-kwin-helper-probe
bash round0.sh        # K1-K4, headless, ~35s, opens a small window
bash round0b.sh       # K5-K6, headless, ~40s
bash interactive.sh   # Round 1, needs a human
```
