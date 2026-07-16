---
status: draft
---

# Buddy Floater Upgrades — Design

> **NOT SHIPPED (verified 2026-07-15).** Design was approved but implementation never happened — see the sibling plan. Status corrected from `shipped` to `draft`.

**Status:** design approved in brainstorming, awaiting implementation plan
**Date:** 2026-07-10
**Author:** brainstorming session (Destin + Claude)
**Scope:** Desktop (Electron) only. Android remains out of scope per the original buddy spec (§10 of `2026-04-17-buddies-floater-design.md`).
**Builds on:** `2026-04-17-buddies-floater-design.md` (buddy MVP, shipped). This spec covers the follow-up pass: bug fixes, an action bar, "alive" animation, edge snap + peek, a rigged mascot format, and a settings-row restyle.

---

## 1. Motivation

The buddy floater MVP shipped and works, but:

1. The screenshot icon can appear at a stale position (not under the mascot) — a real reported bug.
2. The floater feels static: no hover feedback, no motion during drag, artwork pops between states.
3. The only action is screenshot; there's no way to open the main app from the buddy or dismiss the floater without digging into Settings.
4. The Settings entry is a raw checkbox that doesn't match the app's settings-row language.

This pass fixes the bugs and makes the buddy feel like a small living companion rather than a floating image.

---

## 2. Bug fixes (shipped regardless of the rest)

| Bug | Fix |
|-----|-----|
| **Stale capture-icon position.** `showCapture()` only computes position when the window is first created; the re-show path (`showInactive()` on an existing hidden window) never recomputes. Dragging the mascot while the chat is closed, then reopening the chat, leaves the icon at the mascot's old position. | Always recompute from current mascot bounds (`computeCapturePosition()` → `setPosition`) before every show, not just creation. Carried into the action bar that replaces this window. |
| **Orphaned icon when chat closes non-toggle.** `wireChatLifecycle`'s `closed` handler nulls the chat ref but never hides the capture icon. | The action-bar visibility state machine (§4) treats "chat open" as one input; when the chat window dies for any reason the bar drops back to hover-only visibility. |
| **Dead chat-position persistence.** `wireChatLifecycle` debounce-saves `setPersistedPosition('chat')` on every move, but nothing ever reads the `'chat'` key (chat is always re-anchored to the mascot by design). | Delete the write path and the `'chat'` persistence key. Chat stays mascot-anchored. |

---

## 3. Rigged mascot format (the foundation)

### 3.1 Why

Theme mascots today are flat images (one PNG per variant: `idle`, `shocked`, `welcome`). Flat art cannot articulate limbs, so "arms/legs trail behind the body while dragging" and "hands gripping the screen edge in peek" are impossible with the current format. Rather than working around flat art, we introduce a **rig**: a single SVG whose named layer groups the app can animate. Authors draw the parts once; every pose, animation, and future behavior is defined centrally in the app as data acting on those parts. New app version = new tricks for every existing rig, no re-authoring.

**Rigs are the primary, emphasized path.** Flat art remains supported as a legacy tier with minimal, shared-code-only effects (§3.5) — no bespoke flat-art workarounds (no jelly-deformation physics, no generic hands overlay). A follow-up project (out of scope here, §10) converts existing community mascots to rigs and teaches `/theme-builder` + registry CI about the format.

### 3.2 Rig file contract

One SVG file per theme, manifest key `mascot.rig` (alongside the existing flat `mascot` variant keys). Named element ids identify the parts:

| id | Required | Notes |
|----|----------|-------|
| `rig-body` | yes | Torso; the root everything else attaches to |
| `rig-head` | no | Enables head-specific motion (peek, blink tilt) |
| `rig-arm-left`, `rig-arm-right` | no | Trail during drag; grip in peek |
| `rig-leg-left`, `rig-leg-right` | no | Trail during drag |
| `rig-face-idle` | no | Default face group, visible at rest |
| `rig-face-shocked` | no | Swapped in when attention is needed |
| `rig-face-blink` | no | Swapped in briefly for blinks |

- **Pivots:** each limb/head group may declare `data-pivot="x y"` (viewBox coordinates) marking its attachment point (shoulder, hip, neck). The app sets `transform-origin` from it. Defaults when absent: top-center of the group's bbox for arms/legs, bottom-center for head.
- **Missing parts degrade gracefully:** a rig with only `rig-body` behaves like flat art but still gets pose transforms applied to the body. Face groups absent → no expression swap/blink.
- **Raster-friendly:** groups may contain `<image>` elements (embedded base64 raster), so painted/AI-generated art can be rigged by slicing — the format does not force vector-style art.

### 3.3 Pose system

Poses are **app-defined data**, not artwork: a pose maps part ids → `{ rotate, translateX, translateY }` plus face-group visibility. Defined in a single module (`mascot-poses.ts`). Initial poses:

- `idle` — neutral; breathing loop plays.
- `shocked` — arms rotated up, `rig-face-shocked` visible; used when attention is needed.
- `welcome` — one arm raised (wave); reserved for future main-app use, defined now because it's one data entry.
- `peek` — arms raised to grip, head up; combined with the container sink translate (§6).
- Drag trailing is **not** a pose — it's live physics on the same groups (§5).

Transitions between poses are CSS transitions on the group transforms (~180ms ease-out), so pose changes read as movement, not swaps.

### 3.4 Rendering & security

New shared component `src/renderer/components/mascot/MascotRig.tsx` (placed for future main-app reuse, but only the buddy consumes it in this pass):

- Fetches the rig SVG text, **sanitizes it**, inlines it into the DOM, indexes the named groups, applies poses/physics via transforms.
- **Sanitization is mandatory** — themes are third-party content and inline SVG executes in our renderer. Strip: `<script>`, `<foreignObject>`, all `on*` event-handler attributes, `javascript:`/external URLs in `href`/`xlink:href` (only same-document `#refs` and `data:` image URLs survive). Pure function + unit tests (`sanitize-rig-svg.ts`). Registry-side CI validation is a follow-up; the app-side sanitizer is the security boundary and ships now.
- The first-party **default rig** (§3.6) bypasses fetch (bundled asset) but goes through the same code path.

### 3.5 Mascot resolution order (buddy window)

1. Theme ships `mascot.rig` → full experience: pose-driven states, limb-trailing drag, peek with own hands, face blinks.
2. Theme ships only flat variants → existing `<img>` path: state swap (idle/shocked images), wrapper-level effects only (hover scale, grab squish, breathing bob, attention bounce — these apply to the wrapper so they're free), plain drag-follow (no trailing), peek sinks the image with no hands, no blink.
3. Theme ships no mascot → **first-party default rig** (§3.6). The static `WelcomeAppIcon` glyph fallback is retired in the buddy window only (the main-app welcome screen keeps it).

### 3.6 First-party default rig

A simple, friendly first-party character — round body, stubby arms/legs, simple face — shipped as a bundled rig SVG. Drawn with `currentColor` + theme CSS variables so it tints to any theme automatically. This guarantees every user sees the full rig experience out of the box and gives the format a reference implementation. Lives at `src/renderer/assets/default-buddy-rig.svg`.

---

## 4. Action bar (replaces the capture window)

One transparent always-on-top window (**148×44**) holding three 44×44 buttons: **screenshot · open main app · hide**. Replaces the single-purpose 44×44 capture window — same positioning math (centered under mascot, flips above near the bottom edge, clamped to workArea), same lifecycle wiring, one window to keep in formation instead of three.

### 4.1 Visibility rules

Shown when **hovering** (cursor over the mascot or the bar itself) **or** the **chat is open** (pinned on regardless of hover).

- Both renderers (mascot, bar) report pointer enter/leave via fire-and-forget `buddy:hover-changed`. The manager coalesces with a **350ms grace timeout** so crossing the ~6px gap between mascot and bar doesn't flicker the bar.
- The bar window is created lazily on first need and then **kept shown**; visibility is a CSS fade+rise (~150ms) inside the window, driven by a `buddy:bar-state {visible}` push. Electron `show()`/`hide()` can't animate.
- While faded out, main calls `bar.setIgnoreMouseEvents(true, { forward: true })` so the invisible window never intercepts clicks meant for what's under it; re-enabled on fade-in. This toggle is load-bearing — without it a transparent window still eats mouse events.
- Reposition-before-reveal: every transition to visible recomputes the bar position from current mascot bounds (the §2 bug fix).

### 4.2 Buttons

| Button | Behavior |
|--------|----------|
| **Screenshot** | Unchanged: existing `buddy:capture-desktop` flow (hide/snap/restore + attach to buddy chat input). |
| **Open main app** | New `buddy:open-main` invoke: main restores (if minimized) + shows + focuses the most recent main window, then pushes `session:focus-request {sessionId}` (buddy's viewed session) to that window; `App.tsx` switches its active session to it if that window owns it. |
| **Hide** | New `buddy:dismiss` invoke — §7. |

Buttons reuse the existing capture-button styling (round, `--panel` surface, stroke icons, inset highlight, press-scale feedback).

---

## 5. Alive & responsive animation

All motion is CSS/JS transforms **inside** the fixed-size windows — never window-bounds animation (except the snap glide, §6). Everything respects the existing reduced-effects theme setting: when on, breathing/blink/trailing are disabled; only instant state changes remain.

| Behavior | Details |
|----------|---------|
| Hover | Mascot scales to ~1.06, soft ease ~120ms. Cursor `grab`, `grabbing` while dragging. |
| Grab | Press-down squish to ~0.94 on pointerdown; springs back on release. |
| Drag trailing (rig only) | Limb groups get spring-lagged rotation driven by drag velocity — arms/legs trail the body and settle with a small overshoot wobble on release. rAF loop + per-limb spring (stiffness/damping constants in `mascot-poses.ts`); pauses when idle. |
| Breathing | Slow bob (~2–3px translate, ~4s cycle) while idle. Wrapper-level, works for rigs and flat art. |
| Blink (rig only) | `rig-face-blink` swapped in for ~120ms every 6–12s (random); suppressed while dragging or shocked. |
| Attention | Pose transition to `shocked` (rig) or image swap (flat) plus a short wrapper bounce, replacing today's bare swap. The fallback-glyph pulse is retired along with the glyph (§3.5). |
| Chat open/close | Fade + scale-up (~120ms, transform-origin toward the mascot side) inside the chat window instead of popping into existence. |

---

## 6. Edge snap + peek

### 6.1 Snap

- On drag release (`buddy:drag-ended` fire-and-forget with the final position), main checks proximity to the current display's workArea edges; within **24px** of an edge, the mascot glides flush to it (main-process tween, ~150ms ease-out — the one sanctioned window-bounds animation).
- Docked state `{ edge: 'left'|'right'|'bottom'|'top' }` persists in `buddy-positions.json` alongside the position, so he's still docked/peeking after a restart.
- Dragging away from the edge (release >24px from any edge) undocks.

### 6.2 Peek

- Docked + **8s** without interaction (no hover, no chat open, no attention) → peek: the mascot artwork translates past the screen edge inside its window so only the top ~30% (head) stays visible. Rigs additionally take the `peek` pose — head up, hands gripping the edge line. Flat art just sinks (no hands — deliberate legacy-tier degradation).
- The 80×80 window itself stays fully on-screen flush to the edge (no off-screen window positioning — avoids a pile of Windows always-on-top quirks and animates at 60fps in CSS).
- Slide-out triggers: hover (also reveals the action bar per §4.1), attention needed (pops out + shocked bounce), chat opening. Slide in/out ~200ms ease.
- State machine lives in the main process (it already owns hover grace + window state): `free → docked → peeking`, pushed to the mascot renderer via `buddy:mascot-state {docked, peeking, edge}`. Pure-function transitions, unit-tested.
- Chat/bar anchoring near edges already flips and clamps; peek doesn't change their math (they anchor to window bounds, which don't move during peek).

---

## 7. Hide / dismiss semantics

- The bar's **hide** button calls `buddy:dismiss`: destroys the buddy windows **for this run only**. `localStorage['youcoded-buddy-enabled']` stays `'1'`; a session-scoped `dismissed` flag lives in the main process (BuddyWindowManager).
- On next launch the flag is gone and the buddy auto-shows as usual.
- Un-hide paths in the same run: the Settings row's **"Show now"** action (§8), which calls `buddy.show()` and clears the flag. `buddy:show` always clears `dismissed`.
- `buddy:get-status` invoke returns `{ dismissed, visible }` (the enabled preference itself stays renderer-owned in localStorage, as today); main broadcasts `buddy:status-changed` on any change so open Settings panels update live.

---

## 8. Settings row restyle

Replace the raw checkbox with the app's standard row language (matches the analytics opt-in pattern — icon + title + description + the existing exported `Toggle` switch):

- **Layout:** section header "Buddy" → row: mascot icon (stroke SVG) · title "Buddy floater" · status description · `<Toggle>` on the right.
- **Status line:** "Off" / "On — floating on your desktop" / "Hidden until restart".
- **When dismissed-for-run:** the description shows "Hidden until restart" and a small inline **"Show now"** text button appears; clicking it re-shows the buddy without touching the preference. Toggling the switch off while dismissed fully disables (and clears the dismissed state).
- The row subscribes to `buddy:status-changed` so the state is live while the panel is open.

---

## 9. IPC surface & parity

New channels (constants in `shared/types.ts`), following the existing buddy pattern — real in `preload.ts` + `main.ts`/`ipc-handlers.ts`, desktop-only-error stubs in `remote-shim.ts`, no Android handlers, pinned in `tests/ipc-channels.test.ts`:

| Channel | Kind | Purpose |
|---------|------|---------|
| `buddy:hover-changed` | fire (renderer→main) | Mascot/bar hover state for bar visibility + peek slide-out |
| `buddy:drag-ended` | fire (renderer→main) | Final drag position for snap detection |
| `buddy:open-main` | invoke | Restore/focus main window + focus viewed session |
| `buddy:dismiss` | invoke | Hide-for-this-run |
| `buddy:get-status` | invoke | `{ dismissed, visible }` for the settings row |
| `buddy:status-changed` | push (main→renderers) | Live settings-row updates |
| `buddy:bar-state` | push (main→bar) | Fade the action bar in/out |
| `buddy:mascot-state` | push (main→mascot) | Docked/peek/edge state for the renderer animation |
| `session:focus-request` | push (main→main window) | Switch active session after `buddy:open-main` |

Removed: the standalone capture window variant (`'capture'` becomes `'bar'`; `BuddyCaptureApp` becomes `BuddyBarApp` with three buttons).

---

## 10. Out of scope / follow-ups

- **Community mascot conversion sweep** — one-time slicing/inpainting of existing registry mascots into rigs; per-theme art work in `wecoded-themes`. Separate spec.
- **`/theme-builder` rig generation + registry CI rig validation** (`wecoded-themes` repo) — separate spec, after the format proves out in-app.
- **Main-app rig adoption** (welcome screen, loading states) — the `MascotRig` component is placed to allow it; not wired in this pass.
- **Deprecating flat mascot variants** — decision deferred until the conversion sweep lands.
- **Android buddy parity** — unchanged from original spec §10.

---

## 11. Testing

### Unit (vitest)

- Action-bar position math: centered under mascot, flip-above near bottom edge, workArea clamp (extends existing capture-position tests).
- Snap detection: within/outside 24px per edge, multi-monitor workAreas.
- Dock/peek state machine: pure-function transitions for hover/attention/chat/timer inputs.
- Hover-grace coalescing: enter/leave sequences across mascot↔bar don't flicker.
- Dismiss semantics: `dismiss` → `show` clears flag; status payloads.
- Rig sanitizer: strips scripts/handlers/foreignObject/external hrefs; preserves groups, `data-pivot`, embedded `data:` images.
- Pose application: pivot parsing (explicit + defaults), pose data → expected transforms.

### Manual QA (dev instance via `bash scripts/run-dev.sh`)

1. The reported bug: open chat → close chat → drag mascot elsewhere → reopen chat → bar is under the mascot.
2. Hover mascot (chat closed) → bar fades in; move to bar across the gap → stays; leave → fades out; open chat → pinned.
3. Hide button → floater gone; Settings row shows "Hidden until restart" + "Show now"; Show now → back; restart-equivalent (relaunch dev) → auto-shows.
4. Open-main button with main minimized → main restores, focused on buddy's session.
5. Drag near each screen edge → snap; wait 8s → peek; hover → slides out; attention (trigger a permission prompt) → pops out shocked.
6. Default rig (theme without mascot): trailing limbs during drag, blink, peek hands. Flat-art theme: no trailing/blink/hands, everything else works.
7. Reduced-effects mode: no breathing/blink/trailing; states still change.
8. Theme switch while buddy open: rig tint / artwork swaps live.
