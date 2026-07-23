---
status: superseded
approved: 2026-07-22 (Destin)
plan: docs/active/plans/2026-07-22-buddy-floater-one-window-plan.md
date: 2026-07-22
owner: Destin (approval) / Claude (execution)
subject: Buddy floater on Linux Wayland — one-window overlay architecture
type: spec
handoff: docs/active/handoffs/2026-07-22-handoff-buddy-floater-wayland-rewrite.md
evidence: docs/active/prototypes/2026-07-22-buddy-wayland-workbench/FINDINGS.md
roadmap: "ROADMAP.md — 'Buddy floater: Wayland-native one-window rewrite' (#buddy #linux)"
subsumes: "ROADMAP.md — 'Buddy floater scene-companion follow physics — window padding redesign' (#buddy #themes)"
---

> **OUTCOME (2026-07-23):** merged DORMANT in youcoded PR #214 — the overlay is built and review-hardened, but `setIgnoreMouseEvents` proved a total no-op on native Wayland (the spec's I2 click-through evidence was a misread: the renderer received moves because the window was receiving ALL input, and clicks never passed through). `chooseBuddyStrategy` defaults to 'windows' everywhere; overlay reachable only via `YOUCODED_BUDDY_STRATEGY=overlay`. Live status, full evidence, and the XWayland next step: `docs/active/investigations/2026-07-23-buddy-overlay-wayland-presentation.md`.

# Spec — Buddy floater one-window overlay (Linux Wayland)

## North star

The floater is fully usable — draggable, peekable, dockable — on native Wayland.
Users cannot tell which implementation they're on; the implementations may
differ underneath (Destin's 2026-07-22 scope decision: Linux-first, platform
fork allowed, cross-platform code unification is a separate later decision).

## Why this shape (evidence, not argument)

Every claim below was measured on the repro machine (KWin 6.7.3 Wayland,
fractional 1.5×) and eyeball-verified by Destin where visual — full record in
the FINDINGS doc. The prototype phase the handoff mandated is complete.

| Fact | Status |
|---|---|
| `setPosition`/`getPosition`/`getCursorScreenPoint`/`setAlwaysOnTop` on Wayland | dead, **Electron won't-fix** (docs-only resolutions upstream) |
| Transparency smear/stale-frame | **Electron bug, fixed ≥41.2.0** (PR #50541); 41.0.3 "super smearing" → 43.2.0 "worked beautifully" (eyeball) |
| Window constructed at exact screen size | compositor places it at 0,0 — full coverage with no positioning call |
| CSS drag inside a fixed window | works |
| `setIgnoreMouseEvents(true, {forward:true})` | pointer events still delivered on Wayland (docs claim Win/mac only) — dynamic click-through viable |
| `setShape()` input region | silent no-op — the declarative alternative does not exist |
| Compositor keep-above | KWin `keepAbove=false` regardless of Electron API; KWin window rules / scripts CAN set it (kdotool precedent) |
| XWayland for the whole app | **dead on the repro machine** — ANGLE `EGL_CreateWindowSurface` SIGSEGV (41.0.3 AND 43.2.0); ANGLE-on-Vulkan stops the crash but X windows still never map |

## Prerequisite (separate PR, ships regardless): Electron ≥41.2.0

The app pins 41.0.3, which ships the smear bug on every Linux config (X11
included). Bump to **41.10.3** — same Chromium 146, contains the #50541 fix via
backport #50605, minimal blast radius. The 43.x jump is routine upgrade work on
its own schedule, not part of this spec.

## Architecture

### Platform seam (one branch point, per the handoff's fork-cheap requirement)

`main.ts` buddy setup chooses the window strategy once:

- **Linux + Wayland session** (`XDG_SESSION_TYPE=wayland` or `WAYLAND_DISPLAY`
  set) → new `BuddyOverlayManager` (one-window overlay, below).
- **Everything else** (Windows, macOS, Linux-X11) → existing
  `BuddyWindowManager` (three windows), untouched.

Shared and unchanged across both paths: all renderer buddy components
(`BuddyMascot.tsx`, chat, bar, rig/sanitizer), `buddy-bar-geometry.ts` (pure,
tested — its geometry contract is reused as intra-overlay layout math, its
tests keep passing unmodified), `buddy-dock.ts` (pure state machine),
`buddy-bar-visibility.ts`.

### The overlay window

**A single BrowserWindow, app-wide, on the primary display** — one overlay for
the lifetime of the app instance. There is only ever one live floater no matter
how many Claude sessions are open (unchanged from today: the buddy is app-level
and subscribes to session events; it is not per-Claude-session). "Session" in
the platform-seam paragraph above means the OS login session type (Wayland vs
X11), not a Claude session.

- Constructed at **exactly the display's logical size** (never `maximize()` —
  KWin refuses it on `resizable:false`; construct-at-size is the proven
  mechanism). Recreated/resized on `screen` display-metrics changes.
- `transparent, frame:false, resizable:false, skipTaskbar, hasShadow:false,
  backgroundColor:'#00000000'` — same surface flags as today's buddy windows.
- `alwaysOnTop` still requested (harmless; works if the compositor honors it) —
  but **not relied upon**; see keep-above below.
- Loads the shared renderer with `?mode=buddy-overlay`; React renders mascot +
  chat + bar as absolutely-positioned DOM inside one overlay root.

**Core invariant: the window never moves, so CSS coordinates ARE screen
coordinates.** Mascot position, edge-snap, peek/dock/lean, and chat/bar group
layout all become local computations against `screen.workArea` — the exact
semantics `computeGroupLayout` implements today, minus the IPC round-trips.

### Input: dynamic click-through

Default state: `setIgnoreMouseEvents(true, {forward: true})` — every click
passes through to the desktop; pointermove still reaches the renderer (proven).
The renderer tracks hover against the interactive rects (mascot, open chat,
visible bar) and asks main to flip `setIgnoreMouseEvents(false)` on enter /
`(true, {forward:true})` on leave — one small IPC pair, throttled, replacing
today's per-frame `buddy:move-mascot` positioning IPC.

Residual verification (20 s, listed in FINDINGS): explicitly confirm clicks
land on the desktop beneath the ignored region. Forward-events are proven;
the pass-through half is documented core behavior but was not separately
eyeballed. Runs as step 0 of implementation.

### Drag, peek, dock

Pointer events drive CSS `left/top` on the mascot group — no IPC, no window
moves. `buddy-dock.ts`'s pure state machine is reused as-is; the "edge" is
`workArea`'s edge in CSS space. The rigid mascot/chat/bar group-layout rules
(chat fit constrains mascot position; reconcile-on-disengage; artwork-inset
gap math) carry over verbatim from `buddy-bar-geometry.ts` — the PITFALLS
§Buddy Floater invariants remain binding.

### Keep-above (the one unsolved primitive)

- **KDE:** ship a KWin window rule (`kwinrulesrc` entry force `keepAbove` +
  match on the overlay's distinct window title/class), installed opt-in from
  Settings → the floater's Linux section ("Pin buddy above windows"), with a
  one-line explanation and removal path. Precedent: kdotool-class DBus/KWin
  scripting; a static rule is simpler and survives restarts.
- **Other compositors (GNOME/wlroots):** no mechanism exists. The overlay may
  fall behind focused windows. Documented limitation; the floater is entirely
  broken there today, so this is strictly an improvement. Revisit when the
  ext-zones protocol lands in compositors.

### State migration (the handoff's "hard part 1")

Today the main process fans buddy state out to three webContents and routes by
`webContents.id`. With one overlay webContents, every push targets one window
and the mascot/chat/bar coordination that lived in `BuddyWindowManager`
(timers, group moves, reveal sequencing) moves into the overlay React root.
The 7 `webContents.send` pushes in `buddy-window-manager.ts` (count re-verified
2026-07-22 against master) are enumerated and mapped one-by-one during plan
writing — each becomes either (a) a push to the overlay webContents unchanged,
or (b) renderer-local state with no IPC at all. `session-subscription-by-id`
collapses to a single subscription.

### Explicitly rejected (with the evidence that killed each)

- **XWayland app-wide** — cannot bring up windows on the repro machine (5f);
  also mixed-DPI multi-monitor cost and GNOME-fractional blur.
- **Three-window + KWin-script positioning** — no 60 fps drag-follow over DBus
  script injection; KDE-only for the entire mechanism rather than one nicety.
- **Small compositor-dragged cluster window** — `-webkit-app-region: drag`
  works (proven), but the app can never learn the resulting position, so
  edge-snap/peek/dock die. Fullscreen overlay keeps them.
- **`--ozone-platform=x11` stopgap** — rejected 2026-07-17, re-tested and
  re-rejected 2026-07-22 with root-caused evidence.

## Out of scope / limitations (v1)

- **Multi-monitor:** overlay covers the primary display; the mascot cannot be
  dragged to a second monitor (today he can't be dragged at all on Wayland).
  Future: one overlay per display.
- **Screen-capture exclusion:** `excludeFromCapture` is already a no-op on
  Linux; unchanged.
- Windows/macOS/X11 behavior: byte-for-byte unchanged this cycle.

## Verification plan

- Primitives: already proven via the archived workbench (FINDINGS).
- Unit: `buddy-bar-geometry` tests unchanged and passing; new pure tests for
  overlay hover-rect computation and CSS↔work-area edge math.
- Runtime: dev instance (`run-dev.sh`) on this machine; Destin eyeballs drag,
  peek, dock, chat-follow, click-through (interactive verification is his per
  CLAUDE.md — no scripted drag rigs).
- Regression: X11/Windows path smoke-checked by launching with
  `YOUCODED_OZONE=wayland` unset/default paths untouched (three-window manager
  still constructed on non-Wayland).

## Rollout

1. Electron 41.10.3 bump PR (independent, first).
2. Implementation plan (writing-plans granularity) after Destin approves this
   spec; execution in a fresh worktree.
3. The scene-companion follow-physics ROADMAP item folds into this work; flip
   both items together when it ships.
