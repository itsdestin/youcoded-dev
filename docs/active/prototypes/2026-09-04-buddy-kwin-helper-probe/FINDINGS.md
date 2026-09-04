---
status: active
date: 2026-09-04
type: prototype
subject: KWin-helper route for the buddy floater on native Wayland
predecessor: docs/archive/prototypes/2026-07-22-buddy-wayland-workbench/FINDINGS.md
roadmap: docs/roadmap/other-features.md → buddy → "Buddy floater appears but is stuck on Linux Wayland"
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
bash round3-three-windows.sh   # Round 3, headless, ~15s
bash round5-live.sh            # Rounds 5 and 6, needs a human + the TV
```

## Round 2 — installation, startup order, screens (2026-09-04, headless)

Built the helper as a real KDE script package (`package/`, same layout as the
user's own `tp-edges`), installed it to `~/.local/share/kwin/scripts/`, enabled
it the way KDE itself does (`kwriteconfig6 … PluginsEnabled` + `reconfigure`),
and drove it end to end with no manual script loading anywhere.

| ID | Question | Verdict | Evidence |
|----|----------|---------|----------|
| P1 | Does KWin load the helper from config, like any other script? | **YES** | `isScriptLoaded youcodedbuddyhelper` → `true` after `reconfigure` alone |
| P2 | Does it attach to a floater created LONG after KWin loaded it? | **YES** | `ATTACHED\|YOUCODED-BUDDY@700,400` — the app started ~18 s after the script; `workspace.windowAdded` covers it |
| P3 | Does the installed copy actually move the window? | **YES, exactly** | 120-move sweep, then KWin queried live: caption `@1079,411`, `frameGeometry` **1079,411**, `keepAbove=true` |
| P4 | What does the helper know about screens? | Full inventory | `SCREEN\|0\|name=eDP-1\|x=0,y=0,w=1707,h=1067\|scale=1.5` + `WORKSPACE\|w=1707,h=1067\|screens=1` |

**Multi-monitor: mechanism looks right, NOT tested.** Only `eDP-1` was connected.
What P4 establishes is the shape of the answer: KWin exposes every screen with an
`x,y` offset in ONE unified coordinate space plus its own `devicePixelRatio`, and
`frameGeometry` addresses that space — so a second screen is reachable by
construction, and per-screen scale is visible (unlike XWayland's single global
scale, which is what would have regressed the laptop+TV setup). **Still needs a
real two-screen run before anyone claims it works.**

**Detecting absence is a design problem, not a probe problem.** With no helper
(GNOME, wlroots, or a user who disabled it) the app renames its window and
nothing happens — no crash, no error, verified. But the app *cannot* notice by
reading its position, because that is exactly the thing Wayland denies it. It has
to ask KWin directly (`isScriptLoaded` over DBus) or have the helper announce
itself. Whichever, the floater needs an honest disabled state rather than a
mascot that silently refuses to move.

**Left exactly as found.** The package was uninstalled, `kwinrc` restored (diff
against the pre-probe backup: identical), and the script unloaded from KWin's
memory. Nothing from this probe is installed on the machine.

## Round 3 — three windows on the channel at once (2026-09-04, headless)

The technical design (§3) made the per-role caption grammar conditional on this
measurement: revision 3 had proposed one caption carrying all three roles'
targets, on the unmeasured premise that 180 renames/sec would be too many.

```bash
bash round3-three-windows.sh          # ~15s, opens three self-closing windows
```

Three windows at the real buddy sizes (112×112, 320×480, 300×60), each renamed
on its own path every 16 ms. The helper counts inside the compositor and prints
once at the end — printing per move would have pushed 360 lines into journald in
two seconds, and journald's rate limiting would have looked exactly like dropped
moves.

| ID | Question | Verdict | Evidence |
|----|----------|---------|----------|
| T1 | Does every rename reach the compositor? | **YES** | `seen=121` on all three (120 sweep frames + the attach-time apply); zero drops |
| T2 | Does every one become a real move? | **YES** | `applied=121` on all three — no coalescing, no skipped frame |
| T3 | Does each land on the exact pixel? | **YES** | `exact=true` on all three; e.g. mascot `asked=981,357 final=981,357` |
| T4 | Sustained rate | **188 renames/sec** | 360 renames in 1920 ms |

**Verdict: the per-role channel holds.** One grammar, one handler, no
cross-window references, no group format to specify. §3's conditional resolves
in favour of what is already written.

## Round 4 — does an overwritten helper reload? (2026-09-04, headless)

R11 promises updates replace the helper *quietly*. Round 2 only ever tested a
first enable, so "overwrite the file and call `reconfigure`" was an assumption.

Installed a throwaway package (`youcodedhelperprobe`) that prints its own version
on load, enabled it, then overwrote its code and bumped its `Version`.

| ID | Question | Verdict | Evidence |
|----|----------|---------|----------|
| U1 | Does `reconfigure` alone reload an overwritten script? | **NO** | v2 file on disk, `isScriptLoaded=true`, and **no** load line for three seconds — KWin keeps running the copy it already parsed |
| U2 | Does `unloadScript` → `reconfigure` reload it? | **YES** | `isScriptLoaded` false → true, `YCRELOAD\|loaded\|version=v2` — same session, no logout |
| U3 | Is `unloadScript` safe on an id that is not loaded (the fresh-install path)? | **YES** | returns `false`, exit 0, no error |

**So the update sequence is: copy files → `unloadScript` → `reconfigure`.** With
`reconfigure` alone the promise silently degrades to "at next login", and a user
who updates the app keeps running the previous helper — including one built
against an older caption grammar. This is now a required, testable order rather
than an implementation detail.

**Left exactly as found.** Package removed, config key deleted (not set false),
script unloaded; `diff` of `~/.config/kwinrc` against the pre-probe backup is
identical.

## Round 5 — does the caption leak? (2026-09-04, Destin's eyes) — PASS

```bash
bash round5-live.sh
```

§2 could not settle this by argument. The helper sets `skipTaskbar`,
`skipSwitcher` and `skipPager` — measured writable, all three read back `true` —
but those three flags **do not** cover KWin's Overview, KRunner's window search,
the screen-share window picker, or panel title widgets. Since the caption carries
live coordinates and changes ~60×/second during a drag, a leak anywhere visible
would have been an obvious defect in a shipping product, and the fix (a shorter
or coordinate-free grammar) is much cheaper before the build than after.

The rig used the **real shipping grammar** `YC:mascot@<x>,<y>` and set the same
three flags the helper will, so what was on screen is what a user would see.

**Verdict (Destin, live): "the buddy is not listed."** Reported as one answer
covering the rig's two instructions — drag, then Overview (Meta+W), then a
screen-share window picker. So the three flags are sufficient in practice on
KWin 6.7.3, the caption grammar stands as written, and §2's open eyeball item is
closed.

**Not claimed:** KRunner's window search and panel title widgets were on §2's
list of surfaces the flags do not cover and were not part of the two things
Destin was asked to look at. They remain unchecked — a lower-stakes miss, since
both are opt-in searches rather than something a user passes through.

**Left exactly as found.** The helper was loaded over DBus, never installed, and
unloaded on exit; `isScriptLoaded` is false and `~/.local/share/kwin/scripts/`
contains only Destin's own `tp-edges`.

## Round 6 — where does the app get the work area? (2026-09-04, headless)

Fell out of Round 5's smoke test. §0 of the technical design names **Electron's
`display.workArea`, "which excludes the Plasma panel"**, as the rectangle every
clamp, dock and snap is measured against. On Wayland that is false, and the
consequence lands exactly where the buddy lives.

| ID | Question | Verdict | Evidence |
|----|----------|---------|----------|
| W1 | Does Electron's `workArea` exclude the Plasma panel on Wayland? | **NO** | `workArea {0,0 1707x1067}` — byte-identical to `bounds`. There is no Wayland protocol that tells a client about panel struts |
| W2 | Does KWin reserve the space? | **YES, 52 px** | `WorkArea`/`PlacementArea`/`MaximizeArea` all `0,0 1707x1015` against a `ScreenArea` of `1707x1067` |
| W3 | Does the app get ANY readback of a compositor-side move? | **NO** | four moves via the caption channel; `getBounds()` stayed `0,0` every time; exactly one `move` event, fired at creation. §3's assertion is now measured, not reasoned |
| W4 | Is there a DBus route to the real work area? | **YES** | `org.kde.plasmashell /StrutManager availableScreenRect <screenName>` → `(0, 0, 1707, 1015)` — the same rectangle KWin reports |

**Why W1+W3 together are severe.** The buddy's default position is
`workArea.height - MASCOT_SIZE.height - 24`, and every dock and snap clamps to
the same rectangle. Using Electron's number on Wayland puts the mascot **52 px
too low — sitting on top of the taskbar**, with `keepAbove` guaranteeing it
covers the clock and system tray rather than slipping behind them. And because
W3 says the app gets no readback, a clamp applied inside the helper would be
invisible to the app: the app's idea of the position would keep travelling past
the panel while the window stopped, so dragging back up would feel stuck until
the app's number caught up. The correction has to happen **in the app, before it
publishes a caption**.

**The route, and what it costs.** `availableScreenRect` takes a KDE screen
*name*, which Electron does not expose (`display.label` is `"Built-in Screen"`,
not `"eDP-1"`). The names come free from `supportInformation()` — the call the
design already makes for the version and Wayland gates — whose `Screens` block
carries `Name:`, `Geometry:` and `Scale:` per screen, so Electron displays match
KDE screens by bounds. Two honest caveats, both measured: an **unknown screen
name returns the full screen rect**, which is the correct fail-safe; and
`org.kde.plasmashell` is plasmashell, not KWin, so a KWin-only session has no
such service and falls back to the same full rect.

## What is now settled, and what is not

**Settled — all measured, none inferred:**
- Position, keep-above, and true-position readback all work through KWin.
- The caption channel carries 60 fps drag with zero drops.
- Dragging is computable without a global cursor.
- The helper installs, auto-loads from config, and picks up windows created later.
- Destin, live: drag felt right, and **it stayed on top of a focused window** —
  the primitive that had never once been confirmed on Wayland.
- Three windows on the channel at once: 363/363 renames applied, all exact
  (Round 3). The per-role grammar stands.
- Updating the helper in place needs `unloadScript` before `reconfigure`;
  `reconfigure` alone silently keeps the old copy (Round 4).
- The caption does **not** leak into Overview or the screen-share picker —
  Destin, live (Round 5). The grammar stands.
- The app gets **no** readback of a compositor-side move — `getBounds()` never
  updates and `move` never fires (Round 6, W3).
- Electron's `workArea` is the full screen on Wayland; the real one comes from
  plasmashell's `StrutManager` (Round 6).

**Not settled:**
- Two screens (needs the TV) — and Round 6 raises the stakes: the
  Electron-display-to-KDE-screen-name match is by bounds, and has only ever been
  exercised against one screen.
- Surviving a KWin restart in a real session — not tested, because restarting
  KWin on a live Wayland session risks the user's session. It should follow from
  P1 (config-loaded scripts start with KWin) but that is reasoning, not a result.
- Everything about GNOME and wlroots, where this lever does not exist.
