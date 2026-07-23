---
status: active
date: 2026-07-22
type: prototype
subject: Wayland primitive probe for the one-window buddy floater rewrite
handoff: docs/active/handoffs/2026-07-22-handoff-buddy-floater-wayland-rewrite.md
---

# Buddy floater — Wayland primitive probe: findings

Verifies the OS primitives the one-window rewrite depends on, against the real
compositor, **before** any spec is written. A failed primitive here changes the
architecture, so this ran first.

## Environment

| | |
|---|---|
| Compositor | KWin 6.7.3 (kwin_wayland), KDE Plasma, native Wayland session |
| Electron | 41.0.3 / Chromium 146.0.7680.80 |
| Display | 1707×1067 logical, scale 1.4997 (fractional), workArea == full bounds (floating panel) |
| Ozone backend | Wayland — confirmed by `ui/ozone/platform/wayland/host/*` runtime log lines |
| App ozone flags | **none anywhere in the repo** — the app takes Electron's default, so this probe matches production |

## Method — why the compositor, not Electron, is the source of truth

**Electron's window-geometry API lies on Wayland.** `getPosition()` returns the
value you last *asked for*, not where the window is. The probe asked for
`(317,211)`; Electron reported `(317,211)`; KWin reported the window at
`(653,358)` — compositor-centered, never moved.

This is the single most important methodological finding: **the failure is
undetectable from inside Electron.** Any future test that trusts `getBounds()`
/ `getPosition()` on Wayland will produce a false pass. Ground truth comes from
KWin's scripting DBus API:

```bash
SID=$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript /path/kwin-probe.js tag)
qdbus6 org.kde.KWin /Scripting/Script$SID org.kde.kwin.Script.run
journalctl --user -n 120 | grep KWINPROBE
```

## Results

| ID | Question | Verdict | Evidence |
|----|----------|---------|----------|
| A0 | Which backend is live? | **Native Wayland** | ozone wayland log lines; A2 dead; A1 no-op |
| A1 | Does `setPosition()` move the window? | **NO-OP** | asked (317,211) → KWin says (653,358) |
| A2 | `screen.getCursorScreenPoint()` usable? | **DEAD** | returns `{0,0}` on every sample |
| A3 | `maximize()` on a `resizable:false` window? | **REFUSED** | KWin: `maximizable=false`, size stayed 400×300 |
| A4 | `setFullScreen()`? | **NOT APPLIED** | Electron `isFullScreen()=true`, KWin `fullScreen=false` |
| A5 | `setShape()` present? | **ACCEPTED** | call does not throw; binding unverified (I3) |
| A6 | `setIgnoreMouseEvents(true,{forward:true})` accepted? | **ACCEPTED** | no throw; delivery unverified (I2) |
| A7 | `setAlwaysOnTop(true,'screen-saver')` accepted? | **ACCEPTED but suspect** | Electron `isAlwaysOnTop()=true`, KWin **`keepAbove=false`** |
| A8 | Screen-sized window at construction? | **COVERS** | KWin: `x=0,y=0,1707×1067` — exact full coverage |
| A9 | `resizable:true` + `maximize()`? | **COVERS (less)** | KWin: `x=0,y=0,1707×1017` — stops short of panel strip |

## What this means

**The one-window model's load-bearing assumption holds.** A8 is the enabler: a
window constructed at exactly the display size is placed at `0,0` by the
compositor — full-screen coverage with *no positioning call at all*. You cannot
ask Wayland where to put a window, but a window the size of the screen has
nowhere else to go. `maximize()` is the wrong tool here (refused on
`resizable:false`); construct-at-size is the right one.

**The handoff's root-cause analysis is confirmed, and is worse than stated.**
Not only is `setPosition` a no-op — it *reports success*. That explains why this
bug was architectural rather than something a debugging session would catch.

**Cursor polling is ruled out as a fallback.** The handoff floated hover-region
tracking; `getCursorScreenPoint()` returning `{0,0}` kills that approach on
Wayland. Whatever solves click-through must be event-driven (I2) or region-based
(I3) — there is no polling escape hatch.

**A new risk the handoff did not identify: always-on-top may not work either.**
KWin reports `keepAbove=false` despite Electron accepting the call. Wayland has
no standard protocol for a client to raise itself permanently. If this is a real
no-op, then **a floater that hides behind other windows is a second architectural
blocker, and it is not solved by the one-window rewrite** — one window that
cannot stay on top is no better than three. This must be settled before the spec
is written; it is a stronger candidate for "this cannot work on Wayland" than
the drag problem was.

## Round 2 — results from the live session (2026-07-22)

Destin ran the interactive workbench. Three results, two of them blocking.

### I1 · CSS drag — **PASS**
`PASS — landed at 858,-145` after ~950 pointer events. Dragging the mascot as a
local CSS write inside one window works on Wayland. **The replacement drag model
is sound** — this is the part the rewrite was designed around, and it holds.

### I4 · always-on-top — **FAILS** (workaround exists, but not via any app API)
Destin: *"it currently does not stay above."* Matches KWin's `keepAbove=false`.
Electron's `setAlwaysOnTop` is accepted and reports success but does nothing on
Wayland — no xdg-shell protocol exists for a client to raise itself permanently.

KWin's window menu does expose **Keep Above Others**, so a **KWin window rule**
matching the window class can force it. That is real, but note what it is: an
**OS-level configuration shipped alongside the app, not a code fix**, and it is
**KDE-specific** — GNOME/wlroots would each need their own answer. Any spec must
treat "floater stays on top" as a per-compositor integration problem.

### I0 · transparency — **FREEZES** (the blocker)
Destin: *"it definitely starts as transparent but the transparent frames get
stuck/frozen on a set opaque frame"*, and dragging the mascot *"did leave a blue
smear/streak behind it."*

**Correction to the first draft of this document:** transparency does NOT fail
outright. It initialises correctly and then freezes. An earlier claim here that
the surface was "opaque from the start" was inferred from screenshots and was
wrong.

Measured, sampling the same crop repeatedly: one sample out of a run came back at
`stddev=16.90 / mean=152.7`, statistically identical to the no-overlay control
(`13.23 / 159.9`) — the desktop genuinely showing through — while every other
sample read a flat opaque fill. The intermittency is real and reproducible.

**This falsifies a stated benefit of the rewrite.** The handoff claimed the
one-window model "dodges the separate transparent-window smear bug class
(electron#50541) for free." It does not: the freeze and the drag smear both
reproduce **inside a single transparent window**. Collapsing three windows into
one does not touch this bug.

### Attempted fixes — none worked

| Attempt | Result |
|---|---|
| `--disable-features=WaylandColorManagementV1` | no change |
| `--disable-gpu-compositing` | no change |
| `--disable-gpu` | no change |
| `--disable-features=WaylandFractionalScaleV1` | no change |
| Both color-management + fractional-scale off | no change |
| Full-surface repaint every frame (CSS + rAF forcing damage) | no change — 0/10 live samples, same as baseline |

The color-management errors Chromium logs on every run
(`wayland_wp_color_manager.cc: Unable to set image transfer function`) looked
like a promising cause; disabling that feature changed nothing.

**Honest caveat on the flag sweep:** each flag variant got a single 8-second
sample, and the bug is intermittent. That is enough to say none of them
*obviously* fixed it, and NOT enough to call them conclusively ruled out. Only
the force-damage test used a proper 10-sample run.

## Round 3 — XWayland was rejected on a false premise (2026-07-22)

Destin challenged the 2026-07-17 rejection of XWayland: *"Steam is also using it
supposedly, but it appears perfectly sharp. i think we may have missed
something."* He was right.

### Why the blur conclusion was wrong

`~/.config/kwinrc` has **`[Xwayland] Scale=1.5`**. Under that setting KWin does
*not* upscale X11 clients — it hands them native resolution and expects them to
scale themselves. An Electron run that does not account for this renders 1:1 and
looks wrong, which is a completely different failure from "XWayland is blurry".

Measured `devicePixelRatio`, which settles it:

| backend | dPR | meaning |
|---|---|---|
| native Wayland | **1** | Chromium renders 1707×1067 → KWin upscales 1.5× to fill 2560×1600 |
| XWayland | **1.5** | Chromium renders the full 2560×1600 |

**Native Wayland is the backend doing the upscaling here, not XWayland.** Side-by-side
captures of 11px body text and a 1px line grating are indistinguishable across
`wayland-native`, `xwayland-plain` and `xwayland` + `--force-device-scale-factor=1.5`
(`sharp-compare.png`, `text-compare.png`). `--force-device-scale-factor` is not
even needed — XWayland already reports 1.5.

### Every blocker resolves under XWayland

| Primitive | native Wayland | XWayland |
|---|---|---|
| `setPosition()` | no-op (and reports success) | **works** — `[652,358]` → `[316,210]` |
| `screen.getCursorScreenPoint()` | `{0,0}` dead | **works** — real tracking coords |
| `setFullScreen()` | not applied | **covers** 1707×1067 |
| `workArea` | wrong (ignores panel) | **correct** — 1707×1018 |
| always-on-top | KWin `keepAbove=false` | **KWin `keepAbove=true`** |
| transparency | **0/10** samples live | **10/10** samples live |
| transparency across full width | 0.0 in all 5 bands | **9–80 in all 5 bands, 3 passes** |
| text sharpness | baseline | indistinguishable |

**This inverts the entire plan.** The one-window rewrite exists to work around
`setPosition` being a no-op. Under XWayland `setPosition` works, always-on-top
works, and transparency is stable — meaning **the existing three-window floater
should simply work, with no rewrite at all.** The fix may be a launch flag rather
than an architecture change.

### Caveats before acting on this

- **Destin observed** transparency fine on the left of the window but "still
  blurred on the right". The 5-band × 3-pass sweep does not reproduce a dead
  region — every band read live. Possible explanations: KWin's **Blur effect is
  on by default** in Plasma and blurs whatever shows through a translucent
  window (normal behaviour, not a bug, but it contradicts the assumption in
  `main.ts` that the desktop behind the bubble is unblurred); or the observation
  came from an earlier native-Wayland run. **Unresolved — needs a targeted look.**
- The whole app would move to XWayland, not just the floater. Anything that
  currently benefits from native Wayland changes behaviour.
- `--ozone-platform=x11` is a global switch; it must be applied only on Linux and
  ideally only when a Wayland session is detected.

## Round 4 — trying XWayland on the REAL app (2026-07-22)

Branch `fix/linux-xwayland-floater` (worktree `worktrees/xwayland-floater`) adds
an `ozone-platform=x11` switch in `main.ts`, gated to Linux-with-a-Wayland-session,
with a `YOUCODED_OZONE` kill switch. Typechecks clean.

**Result: the app's GPU process segfaults under XWayland.**

```
ERROR:content/browser/gpu/gpu_process_host.cc:996] GPU process exited unexpectedly: exit_code=139
ERROR:gpu/ipc/client/command_buffer_proxy_impl.cc:287] ContextResult::kTransientFailure
ERROR:ui/base/x/x11_software_bitmap_presenter.cc:147] XGetWindowAttributes failed for window 1..4
```

The dev window never maps. Controlled comparison:

| run | GPU crashes |
|---|---|
| dev app, XWayland | repeated `exit_code=139`, window never renders |
| dev app, `YOUCODED_OZONE=wayland` (same branch) | **0** — app runs, floater appears |
| standalone probe, XWayland, ±`--force-high-performance-gpu` | **0** |

So it is **not** the ozone switch alone and **not** the `force-high-performance-gpu`
hint — the minimal probe survives both. Something the full app does under X11
kills the GPU process; the prime suspect is the **xterm WebGL renderer**, which
`desktop/CLAUDE.md` notes is "always loaded for performance".

**Next probe:** re-run the dev app on XWayland with GPU workarounds in turn
(`--use-angle=gl`, `--disable-gpu-sandbox`, `--in-process-gpu`, and xterm's WebGL
addon disabled) to find which one lets it render. Until one does, XWayland cannot
be evaluated end-to-end on the real app.

### Methodology correction — screenshots are NOT reliable here

Destin: *"i'm almost certain your screenshots are misleading you. i tried taking
one myself and it looks different than on screen."* Confirmed as a real limit of
this rig; treat his eyes as ground truth for anything visual.

Worse, my sampling was **incomplete in a way that produced a false clean bill of
health**: every band in the 5-band sweep used the same `BAND_Y=372` (top third of
the window). Destin reports the overlay is transparent and drag-smooth across the
outer border and left side, but **a smaller region toward the bottom-right still
smears** — precisely the area no sample ever touched. The "10/10 transparent under
XWayland" figure therefore describes the top strip only, not the window.

**The smear is region-localised, not global.** That is an unusual signature and it
survives the move to XWayland. Any future measurement must tile the ENTIRE window
in both axes, and must be corroborated by eye before it is believed.

### Baseline answered — the REAL floater smears too (eyeball, same day)

With the dev instance running the unmodified three-window floater on native
Wayland, Destin confirms: **"the real floater does smear strangely."** This
answers Round 2's open question. The freeze/smear class is **pre-existing in the
shipped architecture** — it is not something the one-window design would
introduce, and it reproduces in the real app, not just the probe. Whatever fixes
it fixes both architectures; whatever doesn't, breaks both on this environment.

## Round 5 — parallel deep-dive (2026-07-22, evening)

Three agent streams launched: upstream web research, an Electron version matrix
on native Wayland, and local crash/kernel diagnostics. Results land here as they
return.

### 5a · Crash + kernel diagnostics (returned)

**The XWayland GPU segfault is a null-pointer dereference inside Electron's
bundled ANGLE (`libGLESv2.so`), during `EGL_CreateWindowSurface`.** Three
identical SIGSEGV cores (`si_addr=0x8`, rax=NULL member deref); every mesa
thread parked idle in `pthread_cond_wait` — not a driver crash. Combined with
the `XGetWindowAttributes failed` spam and minimal-probe-works/full-app-crashes
split: the app presents ANGLE an invalid/oddly-configured X window at
surface-creation time and ANGLE fails to null-check. The earlier "xterm WebGL"
guess is retired — the crash is at window-surface init, before any WebGL.

**The transparency freeze produced ZERO kernel or KWin log lines across dozens
of repros.** No amdgpu/DC/DMCUB/pageflip/reset messages in the entire repro
window (with `dcdebugmask=0xE00` active); KWin logged nothing. Evidence points
away from the kernel driver and toward the userspace path — Chromium/Electron
frame/damage submission on transparent Wayland surfaces (or silent KWin
damage-tracking behavior).

**Caveat that keeps "machine-specific" alive:** this machine runs bleeding-edge
**mesa-git 26.2.0-devel** (not release mesa) on a cachyos 7.1.3 kernel. "Userspace,
not driver-kernel" does not equal "reproduces everywhere" — mesa-git sits under
Chromium's EGL/Wayland buffer path and remains an untested variable. An A/B
against release mesa would settle it but means downgrading system mesa; parked
unless cheaper evidence (upstream reports, version matrix) fails to decide.

### 5b · Electron version matrix (returned — halted at the control, correctly)

**The 41.0.3 control did NOT reproduce a frozen window in `--smear` mode.** Two
independent runs on native Wayland: per-tile temporal RMSE shows the animated
square sweeping normally (high-diff tiles migrating left→right across shots,
whole-window RMSE nonzero in every interval). The agent halted the matrix per
its gate rather than test newer versions against a broken control. 41.10.3,
42.7.1, 43.2.0 and 43.0.0-beta.8 exist and remain untested.

**Instrument finding that retires ALL prior stddev-based transparency claims,
in both directions:** `spectacle -b -n -f` on this setup records the window's
transparent region as **literal alpha-0 pixels** (`srgba(0,0,0,0)`), not as the
composited desktop. Grayscale stddev of an alpha-0 hole reads 0.0 — exactly the
signature previously interpreted as "frozen opaque". An alpha-0 capture and an
opaque stale frame are indistinguishable by that metric. Therefore the Round 2
"0/10 frozen on Wayland" and Round 3 "10/10 live under XWayland" numbers are
both **instrument artifacts** (the backends apparently also composite
differently in captures, so the cross-backend comparison was doubly invalid).
Valid signals that remain: temporal frame-diff of the window's own content, and
human eyes. Nothing else.

**Reconciling hypothesis (fits every observation, currently unproven):** the
window's own buffer is fine — its content animates, its empty region is
genuinely alpha-0. What Destin describes is the see-through region showing a
**stale snapshot of the desktop behind the window** ("stuck on a certain frame
of the transparent screen underneath", "still blurred on the right"). A stale
backdrop cannot come from the app's buffer; it can only come from the
**compositor's composition of what lies behind the surface** — i.e. a KWin-side
stale-composite/damage bug (or effect-cache bug) for this surface class at
fractional scale. That would explain: clean KWin/kernel logs, the app buffer
animating while the human sees a frozen backdrop, region-localisation
(bottom-right = where fractional rounding residue accumulates), persistence
across ozone backends, and why every eyeball repro so far involved
**input-receiving** windows (interactive workbench, real floater) while the
input-ignored `--smear` window measures live.

**Consequence:** no automated instrument available to us can detect this bug
class. Repro verification is human-eyes-only from here. The version matrix is
moot until an eye-verified repro condition exists to gate it.

Also confirmed by the agent: the workbench's A0 socket heuristic misfires
(Electron holds an X11 socket even when ozone is Wayland — ozone log lines are
the ground truth), and `--smear`-mode A1 "WORKS" readings are the documented
getPosition echo.

### 5c · Upstream research (returned) — the smear fix already exists upstream

**The handoff had electron#50541 backwards.** It is not a bug "propagating to
41-x" — it is a **fix PR** ("prevent borders and smearing in transparent
frameless windows on Linux", merged 2026-03-31), whose release note reads
*"fixed a longstanding issue where transparent windows on Linux could show
smeared and glitched content as windows moved around."* Backported and
**shipped in Electron 41.2.0 (2026-04-08)**. **The app pins 41.0.3 — one minor
version BEFORE the fix.** The smear Destin has been seeing all day matches a
bug that upstream already fixed. Patched versions: 41.10.3 / 42.7.1 / 43.2.0
(current stable, Chromium M150).

**The stale-backdrop freeze has a documented Chromium mechanism:** compositors
withhold frame callbacks from occluded/throttled surfaces and Chromium's
`EvictionThrottlesDraw` feature (≥115) evicts the buffers, leaving a stale
frame until poked. Confirmed against GNOME/mutter; KWin doing the same to our
overlay is plausible-but-untested. Kill switch to test:
`--disable-features=EvictionThrottlesDraw`.

**Positioning and stacking on native Wayland are officially won't-fix in
Electron.** #40886 / #48833 / #52204 all closed (docs-only resolution:
getPosition "not meaningful on Wayland"); #50403 (setAlwaysOnTop no-op, filed
against exactly 41.0.3) closed with docs stating `isAlwaysOnTop()` returns
internal state, not reality. Only future path named upstream: the ext-zones
protocol draft, years out. **No layer-shell support or fork exists for
Electron** (confirmed-negative search). So: no Electron flag or version will
ever make the three-window floater position itself on native Wayland.

**The XWayland blur objection mostly dissolves on KDE:** since Plasma 5.26 the
DEFAULT for legacy X11 apps is "Apply scaling themselves" (`XwaylandClientsScale`),
i.e. XWayland Electron is SHARP on default-config Plasma — Destin's setup is
the default, not an exception. (Round 4's fear that default-config users get
blur was wrong for KDE; it still applies to GNOME-fractional users, and the
mixed-DPI multi-monitor cost of X11's single global scale still stands.)

**The KDE-native helper path is precedented:** KWin scripts on Plasma 6 Wayland
can set `window.frameGeometry` and `window.keepAbove` (working precedent:
kdotool generates and loads KWin scripts over DBus to move/raise windows;
RememberWindowPositions does the same). An app-shipped KWin script could give
the floater position + keep-above on KDE without XWayland — though per-frame
drag via DBus script injection is likely too janky for drag-follow; it fits
snap-to-position, not 60fps dragging.

Driver angle further weakened: `dcdebugmask=0xE00` already disables PSR-SU and
Panel Replay — the self-refresh features classically associated with
stale-frame artifacts.

### 5d · EYEBALL VERDICT (Destin, 2026-07-22 evening) — the smear is FIXED by the Electron bump

Side-by-side on native Wayland, same interactive workbench, same drags:

| Electron | Destin's verdict |
|---|---|
| 41.0.3 (what the app ships) | **"super smearing"** |
| 43.2.0 (current stable, contains #50541) | **"worked beautifully"** |

Human-eyes confirmation on the exact repro machine: **the transparency
smear/stale-frame artifact is the pre-41.2.0 Electron bug, fixed upstream.**
The rendering half of the floater problem closes with an Electron bump — no
architecture change, no XWayland, no compositor workaround needed for THIS
part. Remaining unsolved on native Wayland: positioning (drag) and
always-on-top, which are Electron won't-fix and need one of the three paths in
5c §3.

### 5e · Interactive tests complete (Destin, Electron 43.2.0, native Wayland)

| Test | Result | Meaning |
|---|---|---|
| I1 · CSS drag inside window | **PASS** | replacement drag model works |
| I2 · `setIgnoreMouseEvents(true,{forward:true})` still delivers pointermove | **PASS — counter kept climbing** | one-window click-through is viable: renderer sees hover position at all times and toggles clickability itself. (Electron docs claim forward is Windows/macOS-only — empirically it works on Linux Wayland KWin.) |
| I3 · `setShape()` input region | **FAIL — accepted but no-op** | the "clean" click-through path doesn't exist on Wayland; I2 is the only mechanism |
| I4 · always-on-top | **FAIL** (KWin `keepAbove=false`) | Electron won't-fix; needs KWin rule/script on KDE |
| I5 · `-webkit-app-region: drag` | **PASS — whole window moves** | compositor-blessed drag works on native Wayland (app still can't learn the resulting position) |

### THE FULL PICTURE — every question is now answered

On native Wayland with Electron ≥41.2.0:

- **Rendering** (smear/freeze): FIXED by the version bump (5d, eyeball-verified).
- **Coverage**: a window constructed at screen size lands at 0,0 (A8).
- **Drag**: CSS inside a fixed window (I1) — and because a fullscreen overlay
  never moves, **CSS coordinates ARE screen coordinates**: the app regains full
  knowledge of the mascot's position, so edge-snap / peek / dock semantics
  (`buddy-dock.ts`, `buddy-bar-geometry.ts`) remain computable. This is the
  decisive advantage of the fullscreen one-window model over a small
  compositor-dragged cluster window (I5 path), where position knowledge is
  unrecoverable.
- **Click-through**: I2 forward-events. The single biggest unknown in the
  original handoff is resolved positive.
- **Always-on-top**: the one genuinely unsolved primitive. KDE: shippable KWin
  window rule or kdotool-style script (precedented). GNOME/wlroots: open
  problem — but the floater is broken there today anyway, so no regression.

**Recommended architecture (for the spec):**
1. **Immediately and independently: bump Electron** off 41.0.3 (41.10.3 = same-major
   patch containing the #50541 fix; 43.2.0 = current stable, verified by eye on
   this machine). The app currently ships a known-fixed Linux rendering bug that
   also affects X11 users. Note: `package.json` has `^41.0.3` — the pin lives in
   `package-lock.json`, so the bump is a lockfile update.
2. **Wayland floater = the one-window fullscreen overlay** (construct-at-size,
   CSS drag, forward-events click-through), **plus a KDE keep-above story**
   (shipped KWin window rule or script).
3. **Keep the three-window model on X11 / Windows / macOS** per Destin's
   2026-07-22 scope decision (Linux-first, fork stays on the table) — the
   platform seam sits at the window-manager layer.
4. The XWayland branch (`fix/linux-xwayland-floater`) does NOT merge: it fixes
   positioning but costs mixed-DPI multi-monitor (single global X11 scale —
   Destin's own laptop+TV setup regresses), GNOME-fractional blur, carries an
   unresolved ANGLE crash in the full app, and bets against ecosystem direction.
   Keep the worktree as an experiment record until the spec is approved.

### 5f · XWayland end-to-end on the REAL app — dead on this machine

Destin asked the right question: with the Electron bump fixing rendering,
XWayland would let the existing three-window floater work unchanged — the
no-fork path. Tested end-to-end on the real app (dev instance, worktree branch
with the ozone=x11 switch, Electron 43.2.0 via `ELECTRON_OVERRIDE_DIST_PATH`):

| Config | Result |
|---|---|
| 43.2.0 + XWayland, default ANGLE | GPU process SIGSEGV ×3 — **identical signature to 41.0.3** (`libGLESv2.so` → `EGL_CreateWindowSurface`, `SEGV_MAPERR`); recovered into software fallback; `XGetWindowAttributes failed` ×4; **no window ever mapped**, zero X11 clients |
| 43.2.0 + XWayland + `--use-angle=vulkan` | **0 GPU crashes** — but still `XGetWindowAttributes failed` ×4, still zero X11 clients, **still no window ever mapped** |

The renderer boots in both cases (vite client logs flow); the app's X11 windows
simply never come up. The failing window IDs are tiny (1–4), i.e. near-null
handles — X window realization fails at the root, not at paint time. The
minimal probe works fine under XWayland on the same machine; the full app does
not, across two Electron majors and two ANGLE backends. Root cause sits
somewhere in Chromium-X11 ↔ mesa-git ↔ app window configuration and would need
Chromium-level debugging to salvage.

**Verdict: on Destin's machine (the Linux-first gate), the XWayland path cannot
even bring up the app.** It may well work on release-mesa machines, but
shipping a Linux path the primary Linux machine can't run is moot. The
`YOUCODED_ANGLE` experiment knob remains in the worktree as part of the record.

Meanwhile the native-Wayland path went, in one day, from "everything broken" to
"every primitive eyeball-proven except keep-above" — with zero GPU-stack
fights. The asymmetry is itself decision data.

### Where this points (pending eyeball verification — now superseded by 5d/5e)

1. **Bump Electron off 41.0.3 regardless of anything else** — the app currently
   ships a known-fixed transparency smear bug (41.10.3 is the low-risk patch;
   43.2.0 is current stable).
2. Verify by eye whether ≥41.2.0 kills the smear (`eyeball.sh` does this), and
   whether `EvictionThrottlesDraw` explains the frozen backdrop.
3. The remaining decision is then purely about **positioning + stacking**:
   XWayland (everything works, sharp on default KDE; costs: mixed-DPI
   multi-monitor, GNOME-fractional blur, ANGLE crash to fix, against ecosystem
   direction) versus one-window rewrite on native Wayland (CSS drag proven;
   needs KWin script/rule for keep-above on KDE, unanswered on GNOME) versus
   three-window + KWin-script helper (KDE-only, no drag-follow).

## Where this leaves the rewrite

The one-window rewrite solves the problem it was designed for and nothing else:

| Problem | Fixed by the rewrite? |
|---|---|
| Mascot can't be dragged (`setPosition` no-op) | **Yes** — CSS drag proven (I1), full-screen coverage proven (A8) |
| Chat/bar can't follow the mascot | **Yes** — same window, DOM layout |
| Transparency freezes / smears | **No** — reproduces in one window |
| Floater won't stay on top | **No** — needs a compositor-level rule |

So the rewrite is necessary but **not sufficient**. Two environmental blockers
sit underneath it, and neither is an architecture problem — both are
Electron/Chromium ↔ KWin issues that no amount of app restructuring fixes.

**Recommended next probe, before any spec is written:** determine whether the
transparency freeze is fixed in a newer Electron. The handoff noted
electron#50541 was propagating to 41-x; the app is pinned at 41.0.3, which still
exhibits it. If a bump fixes it, the rewrite is viable and the sequencing is
"bump first, then rewrite". If it does not, the floater cannot be made correct on
KDE Wayland at any Electron version currently available, and that is the finding
that should drive the platform-fork decision.

**Open question only Destin can answer** (the live app must not be touched):
does the *existing* three-window floater in the installed app show the same
freeze/smear on Wayland? If it renders cleanly, this probe overstates the
problem and the difference needs finding. If it shows the same artifacts, the
freeze is confirmed as pre-existing and independent of the rewrite.

## Open — needs a human cursor (Destin)

The remaining questions cannot be answered without real pointer input, and per
CLAUDE.md interactive verification is Destin's eyeball, not a scripted CDP rig.

```bash
cd docs/active/prototypes/2026-07-22-buddy-wayland-workbench
/home/destin/youcoded-dev/youcoded/desktop/node_modules/electron/dist/electron . --interactive
```

Safety: window is 1000×700 (not screen-covering), every click-through mode
auto-reverts after 12s, there is an in-window quit button, and `Ctrl+Alt+Q`
registered successfully.

| ID | Question | Why it decides the architecture |
|----|----------|--------------------------------|
| I0 | Is the transparent surface actually transparent? | **ANSWERED — freezes.** See Round 2 |
| I1 | Does CSS drag of the mascot work? | **ANSWERED — PASS.** See Round 2 |
| I4 | Does the overlay stay above a focused window? | **ANSWERED — no.** See Round 2 |
| I2 | Does `ignore + forward` still deliver `pointermove`? | **STILL OPEN.** If yes → click-through + hover tracking is viable |
| I3 | Does `setShape()` bind the input region? | **STILL OPEN.** The clean alternative to I2 — no polling, no forward |
| I5 | Does `-webkit-app-region: drag` move the window? | **STILL OPEN.** If yes, dragging is possible *without* the rewrite — but the app still can't learn the resulting position, so chat/bar can't follow |

**If I2 and I3 both fail**, the one-window model cannot do click-through, and the
overlay would swallow every click on the desktop — that is a stop-and-redesign
result, not a detail.

## Reproducing the automated half

```bash
cd docs/active/prototypes/2026-07-22-buddy-wayland-workbench
ELECTRON=/home/destin/youcoded-dev/youcoded/desktop/node_modules/electron/dist/electron
$ELECTRON .             # A0-A7, prints a table, self-terminates
$ELECTRON . --coverage  # A8/A9, holds 25s for a compositor query
$ELECTRON . --hold      # holds the small probe window for a compositor query
```
