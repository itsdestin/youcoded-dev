---
status: shipped
---

# Buddy Floater Upgrades — Design

> **NOT SHIPPED (verified 2026-07-15).** Design was approved but implementation never happened — see the sibling plan. Status corrected from `shipped` to `draft`.

**Status:** design approved in brainstorming, awaiting implementation. §3/§5/§6 revised 2026-07-16 to the mascot-rig-workbench decisions Destin approved (see `docs/active/handoffs/2026-07-16-mascot-rig-workbench-handoff.md`).
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

> **2026-07-16:** finalized during the mascot rig workbench session (prototype:
> `docs/active/prototypes/2026-07-16-buddy-rig-workbench.html`; handoff:
> `docs/active/handoffs/2026-07-16-mascot-rig-workbench-handoff.md`). The authoritative
> theme-author contract lives in **`wecoded-themes/mascots/README.md`** — this section
> summarizes the app-facing side and must stay consistent with it.

One SVG file per theme, manifest key `mascot.rig` (alongside the existing flat `mascot` variant keys). `viewBox="-3 -5 30 30"` — the character stays inside the classic 24×24 art box; the padding leaves headroom for hats (above y 0) and held items (right of x 24). Named element ids identify the parts:

| id | Required | Notes |
|----|----------|-------|
| `rig-root` | recommended | Wrapper group the app applies the idle-motion loop to |
| `rig-body` | yes | Solid torso; contains the face groups + `slot-eyewear` |
| `rig-arm-left`, `rig-arm-right` | no | Trail during drag; wave/flail poses. `slot-item` nests inside `rig-arm-right` so held items wave + trail |
| `rig-leg-left`, `rig-leg-right` | no | Trail during drag |
| `rig-tail` | no | Springs like a limb (drag target = left-leg lean × 0.8 — Kuromi wags) |
| `rig-face-idle/welcome/curious/shocked/dizzy/blink` | no | Six expression groups; all but `idle` start `style="display:none"` |
| `slot-hat`, `slot-eyewear`, `slot-item` | no | Component anchor groups — anchors (12 4), (12 9.9), (21.5 12.8) — for the mix-and-match component library |
| `rig-hand-peek-right`, `rig-hand-peek-left` | no | Fingerless grip-mitten art for the side-edge peek (§6.2); the app clones these and pins them to the screen edge. Start `display:none` |

- **Pivots:** each limb group may declare `data-pivot="x y"` (viewBox coordinates) marking its hinge. The app sets `transform-origin` from it (`transform-box: view-box`). Canonical capsule values: arms (2.5 9)/(21.5 9), legs (8.95 17)/(15.05 17), tail (19 14). Default when absent: top-center of the group's bbox. **Limbs are drawn hanging down from their pivot** — all pose data assumes it.
- **Faces are paint, not holes.** The legacy flat mascots cut eyes out with `fill-rule="evenodd"`; rigs keep the body solid and paint the face on top, so face groups can swap. The **curious** face wraps its sparkle-cluster pupils in `<g class="pupil">` — the app translates those up to ±0.55 viewBox units to track the cursor.
- **Missing parts degrade gracefully:** a rig with only `rig-body` behaves like flat art but still gets pose transforms applied to the body. Face groups absent → no expression swap/blink. Peek-hand groups absent → side-peek degrades to the sink-only treatment.
- **Raster-friendly:** groups may contain `<image>` elements (embedded base64 raster), so painted/AI-generated art can be rigged by slicing — the format does not force vector-style art.
- **Tinting:** rigs are inlined into the DOM, so CSS variables resolve — the app provides `--rig-accent`, `--rig-on-accent`, `--rig-line` (mapped from the theme tokens). This matters: the legacy `<img>` path resolves `currentColor` to BLACK, which is why halftone/kuromi/kitty ship mistinted today. Hardcoded identity colors (Golden Sunbreak amber) are fine; always include var() fallbacks.

### 3.3 Pose system

Poses are **app-defined data**, not artwork: a pose maps part ids → `{ rotate, tx, ty }` plus a face name (and, for side-peek poses, a body lean). Defined in a single module (`mascot-poses.ts`).

**Sign convention** (limbs hang down from their pivot; positive = clockwise): raising the RIGHT arm outward is **negative** rotation, the LEFT arm outward is **positive**. Getting this backwards makes the wave cross the face — a real bug caught in the workbench.

- `idle` — neutral; the motion-style idle loop plays (§5).
- `welcome` — right arm **−160°** (raised outward) + wave wiggle, `rig-face-welcome`.
- `curious` — no limb change, `rig-face-curious` (sparkle pupils track the cursor).
- `shocked` — arms flail outward: left **+130°**, right **−130°**, `rig-face-shocked`; used when attention is needed.
- `dizzy` — arms droop ∓14°, `rig-face-dizzy`.
- `peek` (bottom/top edges) — arms curled inward to grip: left **−160°**, right **+160°**; combined with the container sink translate (§6.2).
- `peek-right` / `peek-left` (side edges) — arms parked via `tx` translate, one leg cocked, `rig-face-curious`; combined with the side-peek staging (§6.2).
- Drag trailing is **not** a pose — it's live physics on the same groups (§5).

**Pose transitions ride the springs, not CSS transitions.** Each part has ONE spring whose target = pose base + drag trail + idle sway (§5); changing pose changes the target, so poses arrive with natural overshoot. Reduced-effects writes final transforms directly.

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

The capsule buddy in the **2.5D soft** skin (the approved default treatment), ported from `wecoded-themes/mascots/skins/2-5d-soft.svg` with its demo palette swapped for `var(--rig-accent)` / `var(--rig-on-accent)`, all six faces, slots, and peek hands. NOT `currentColor` (renders black via `<img>`; and even inlined, the rig vars are the convention). This guarantees every user sees the full rig experience out of the box and gives the format a reference implementation. Lives in `src/renderer/components/mascot/default-buddy-rig.ts`.

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

> **2026-07-16:** redesigned in the workbench session. The prototype
> (`docs/active/prototypes/2026-07-16-buddy-rig-workbench.html`) is the reference
> implementation of everything below — port, don't reinvent.

All motion is CSS/JS transforms **inside** the fixed-size windows — never window-bounds animation (except the snap glide, §6). Everything respects the existing reduced-effects theme setting: when on, idle loops/blink/trailing/companion springs are disabled; only instant state changes remain (companions pin statically at their offsets).

**Unified springs.** ONE spring per rig part (stiffness 170, damping 16, dt clamped to 64ms) whose target = pose base + drag trail + idle sway. Pose changes, drag, and sway all ride the same physics, so everything composes and settles with overshoot. Drag velocity is normalized to the 80px buddy-window scale before targeting (`k = 80/size × 2.4`, exponentially smoothed 0.7/0.3, decays ×0.85/frame while held) so trailing feels identical at any render size. The tail springs too.

**Motion styles.** Five personalities — `chill / bouncy / floaty / hyper / sleepy` — each defining: an idle body loop (CSS keyframes on `rig-root`, amplitude via the `--amp` custom property), limb sway fed through the springs, and blink cadence (`[min gap, random range, closed ms]`; sleepy = heavy 430ms blinks). Hyper adds random spring-velocity twitches; sleepy adds a floating Zzz companion. A global **intensity** multiplier (0.5–2×) scales idle amplitude, sway, tilt, companion float, and the greet hop. (How style/intensity are chosen — per-theme default vs. user setting — is an open UI question; the engine ships all five.)

| Behavior | Details |
|----------|---------|
| Hover | Mascot scales to ~1.06, soft ease ~120ms. Cursor `grab`, `grabbing` while dragging. Independent CSS `scale` property so it composes with the idle loop's `translate` and the peek lean's `rotate`. |
| Grab | Press-down squish to ~0.94 on pointerdown; springs back on release. |
| Drag trailing (rig only) | Limb spring targets from smoothed drag velocity (`lean = clamp(−vx·1.6, −28, 28)`); arms/legs/tail trail the body and settle with an overshoot wobble on release. rAF loop pauses when settled. |
| Idle loop | Per-motion-style body keyframes + limb sway (replaces the single "breathing" bob). Wrapper-level portion works for flat art too. |
| Blink (rig only) | `rig-face-blink` flashed per the style's cadence; suppressed while dragging or shocked. |
| Attention | Pose transition to `shocked` (rig) or image swap (flat) plus a short wrapper bounce, replacing today's bare swap. The fallback-glyph pulse is retired along with the glyph (§3.5). |
| Scene companions (rig only) | Theme flourishes (sun, motes, sparkles, glitch bars, the halftone chromatic ghost) are **mobile satellites**, not static backdrops: each spring-follows the mascot center at a preferred offset with per-companion stiffness/damping + idle float, leaning while catching up. Ghost-type companions fade in with lag distance (`opacity = clamp(lagDist/70, 0, 0.85)` — invisible at rest). A theme declares companions as small SVGs + offsets; the physics is app-side. |
| Chat open/close | Fade + scale-up (~120ms, transform-origin toward the mascot side) inside the chat window instead of popping into existence. |

---

## 6. Edge snap + peek

### 6.1 Snap

- On drag release (`buddy:drag-ended` fire-and-forget with the final position), main checks proximity to the current display's workArea edges; within **24px** of an edge, the mascot glides flush to it (main-process tween, ~150ms ease-out — the one sanctioned window-bounds animation).
- Docked state `{ edge: 'left'|'right'|'bottom'|'top' }` persists in `buddy-positions.json` alongside the position, so he's still docked/peeking after a restart.
- Dragging away from the edge (release >24px from any edge) undocks.

### 6.2 Peek

> **2026-07-16:** the side-edge staging was designed hands-first in the workbench and
> approved as the **"75° wider"** variant. Reference implementation: `enterPeek` /
> `showPeekHands` / `swingOut` in `docs/active/prototypes/2026-07-16-buddy-rig-workbench.html`.

- Docked + **8s** without interaction (no hover, no chat open, no attention) → peek.
- **Bottom/top edges:** the mascot artwork translates past the screen edge inside its window (sink ~58%, so ~42% stays visible — enough to keep the face). Rigs additionally take the `peek` pose — arms curled inward (−160/+160), little hands gripping the edge line. Flat art just sinks (no hands — deliberate legacy-tier degradation).
- **Left/right edges (the approved side-peek):** hands-first staging, as if he pulled himself up to look around the frame:
  - Two **fingerless grip mittens** (cloned from the rig's `rig-hand-peek-*` groups) are pinned OVER the screen edge as an overlay OUTSIDE the body's lean transform — they must stay planted on the frame while the body moves. Mittens are vertical knuckle bumps flat against the frame (20×26px at 230px mascot scale, rx 9, ±4° opposing tilt — NOT horizontal rods, NO fingers), rimmed (body color mixed 40% toward black, or the line color for outline skins) so they read against the same-colored body.
  - The body hangs **between** the hands at a **75° lean** (head-top near-parallel to the edge), grip width **168px**, offset **−52px** from vertical center, **~18% visible** (all values at 230px scale — scale linearly with render size). Pose `peek-right`/`peek-left`: arms parked via translate, one leg cocked, curious face. The lean is an independent CSS `rotate` on the fx wrapper so it composes with `scale` and the keyframe loops.
  - Rigs without peek-hand groups degrade to the sink-only treatment.
- **Slide-out is a swing, not a slide** (side edges): the lean whips from ∓75° through ±14° past vertical, the body slides free in a ~460ms overshoot arc landing beside the edge, hands unpin, then a greet wave. Bottom/top slide out ~200ms ease as before.
- The 80×80 window itself stays fully on-screen flush to the edge (no off-screen window positioning — avoids a pile of Windows always-on-top quirks and animates at 60fps in CSS). The mitten overlay lives inside the window; the window edge IS the screen edge while docked.
- Slide-out triggers: hover (also reveals the action bar per §4.1), attention needed (pops out + shocked bounce), chat opening.
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
- Pose sign convention: welcome right arm is NEGATIVE (outward), shocked is +130/−130 (outward flail), bottom-peek is −160/+160 (inward grip) — pins the corrected 2026-07-16 signs so the wave never crosses the face again.

### Manual QA (dev instance via `bash scripts/run-dev.sh`)

1. The reported bug: open chat → close chat → drag mascot elsewhere → reopen chat → bar is under the mascot.
2. Hover mascot (chat closed) → bar fades in; move to bar across the gap → stays; leave → fades out; open chat → pinned.
3. Hide button → floater gone; Settings row shows "Hidden until restart" + "Show now"; Show now → back; restart-equivalent (relaunch dev) → auto-shows.
4. Open-main button with main minimized → main restores, focused on buddy's session.
5. Drag near each screen edge → snap; wait 8s → peek. Bottom: sinks with gripping hands. Left/right: 75° side-peek — mittens planted on the frame, body sagging between, curious face. Hover → bottom slides out, sides swing out with the whip + greet. Attention (trigger a permission prompt) → pops out shocked.
6. Default rig (theme without mascot): trailing limbs during drag, blink, peek hands, companions following. Flat-art theme: no trailing/blink/hands/companions, everything else works.
7. Reduced-effects mode: no breathing/blink/trailing; states still change.
8. Theme switch while buddy open: rig tint / artwork swaps live.
