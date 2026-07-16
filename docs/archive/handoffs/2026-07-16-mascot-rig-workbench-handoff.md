---
status: shipped
date: 2026-07-16
subsystem: buddy mascot / themes
artifact: https://claude.ai/code/artifact/411658ae-3053-4e40-a312-3b401e527bc2
---

> **All scope items 0–3 shipped 2026-07-16** (see Remaining scope below for the PRs).
> Item 4 (functional buddy + MascotRig consumption) is the buddy-floater plan's own track —
> its spec/plan now carry every decision from this handoff (fold-back done), so this doc is
> archived as a historical record.

# Mascot Rig Workbench — session handoff (2026-07-16)

Visual/structural redesign of the buddy mascot, prototyped as the interactive
**buddy-rig-workbench** artifact (link in frontmatter — it is the living spec-by-demonstration;
every decision below is visible there). This session was PURELY visual: rig format, skins,
animation, poses, components. The functional buddy work (action bar, hover reveal, dismiss,
window-level snap) is untouched and remains in the existing buddy-floater plan.

## Approved decisions (Destin, this session)

1. **Rig contract** — one SVG, named groups: `rig-body` (required), `rig-arm-left/right`,
   `rig-leg-left/right`, optional `rig-tail`, `data-pivot="x y"` hinges, limbs drawn hanging
   down. Six face groups: `idle · welcome · curious · shocked · dizzy · blink` (all but idle
   `display:none`). Component slots: `slot-hat` (anchor 12 4), `slot-eyewear` (12 9.9),
   `slot-item` (21.5 12.8, INSIDE rig-arm-right so it waves/trails). Faces are painted on a
   solid body, not evenodd cutouts. viewBox `-3 -5 30 30` (24×24 art box + hat/item padding).
2. **Six approved skins** — 2.5D soft, clay, comic pop, comic burst, newsprint, sticker
   (die-cut border at HALF the first prototype width: 0.8 body / 0.75 limbs). Rejected:
   flat-legacy-as-option, vinyl, plush, hologram, neon, 8-bit, brick, doodle, extruded-3D,
   chrome, rendered-3D.
3. **Curious face** — welcome-model eye sockets with a bright sparkle cluster as the pupil in
   `<g class="pupil">` (the app translates it ≤0.55 units to track the cursor), one raised
   brow, small "o" mouth. The dark disc-in-disc version was rejected as scary.
4. **Pose sign fix** — for limbs hanging from their pivot: welcome = right arm **−160°**
   (up, leaning OUTWARD; +160 waves across the face), shocked = **+130 / −130** (outward
   flail). Bottom-peek stays −160/+160 (inward curl = gripping). ⚠️ The buddy-floater plan's
   Task 8 `mascot-poses.ts` sketch carries the WRONG signs and its test asserts them.
5. **Scene companions** — all theme flourishes are mobile satellites that spring-follow the
   buddy at preferred offsets (per-companion stiffness/damping, idle bob, lean while catching
   up). Redesigned sun (layered glow, petal rays, slow spin, pulse) for golden-sunbreak;
   halftone gets a chromatic after-image ghost (invisible at rest, materializes with lag
   distance); sparkles/berries/glints for the others. Static backdrops retired.
6. **Motion styles** — chill / bouncy / floaty / hyper / sleepy: per-style idle body loop
   (CSS keyframes scaled by `--amp`), per-style limb sway fed through the SAME springs as
   drag trailing, per-style blink cadence ([min gap, range, closed ms]), hyper adds random
   spring-velocity twitches, sleepy adds a Zzz companion + 430 ms heavy blinks. Plus a global
   **intensity** multiplier 0.5–2× (idle amp, sway, tilt, companions, greet hop).
7. **Unified springs** — ONE spring per part drives pose base + drag trail + idle sway
   (stiffness 170, damping 16, dt clamp 64 ms — the plan's constants). Pose changes arrive
   with overshoot physics; tail springs too (drag target = leg lean × 0.8). Poses may also
   translate parts (`tx`/`ty` — used to park arms). Reduced-effects writes transforms
   directly and pins companions statically.
8. **Docked side-peek (APPROVED: "75° wider")** — hands-first staging: two **fingerless
   mitten grips** (rounded stubs matching the limb language) pinned OVER the screen edge as
   an overlay OUTSIDE the body's lean transform (they must stay planted on the frame), grip
   width **168 px** (at 230 px mascot scale), rimmed (body mixed 40 % to black / line color)
   so they read over the same-colored body; body at **75° lean**, head-top near-parallel to
   the edge, sagging between the hands, **~18 % visible** (xf 0.18), dy −52 vs vertical
   center, hands centered on the body midline (hdy 0). Mittens = vertical knuckle bumps flat
   against the frame (20×26 px, rx 9, ±4° opposing tilt), NOT horizontal rods, NO fingers.
   **Click = swing-out**: lean whips from −75° through +14° past vertical (springy `rotate`
   property transition), slides free in a 460 ms overshoot arc, lands beside the edge, greet
   wave. Rig-format hook: `rig-hand-peek-right/left` groups hold the mitten art; the renderer
   clones + pins it. Bottom peek unchanged (sink + arms −160/+160). Workbench keeps 12
   staging variants for reference; `side75Wider` is default and labeled approved.

## Shipped where

- **wecoded-themes `mascots/`** — PR #12 MERGED to main (`8723785`): README (contract +
  from-scratch generation constraints for theme-builder), 6 skin reference rigs,
  kuromi-dreamer + strawberry-kitty example rigs, 12 components (5 hats / 3 eyewear /
  4 items). ⚠️ Merged BEFORE decisions 5–8 — README documents none of: companions, motion
  styles, intensity, tx/ty poses, grip hands, sign conventions, the approved peek.
- **ROADMAP** (youcoded-dev master, latest `dc6a8fe`) — "Mascot rig system" feature entry
  catalogs all of the above + remaining scope.
- **The artifact** — full working reference implementation of everything (physics code
  deliberately written copy-back-able; file lives in this session's scratchpad:
  `buddy-rig-workbench.html`).

## Key technical facts for the implementer

- Mascots render via `<img src>` today (`Icons.tsx` ThemeMascot, `BuddyMascot.tsx`) →
  `currentColor` resolves BLACK: halftone's body and kuromi/kitty outlines ship mistinted.
  Rig inlining (sanitize → `dangerouslySetInnerHTML`) fixes it; tint via `--rig-accent` /
  `--rig-on-accent` / `--rig-line` (+ hardcoded identity colors are fine).
- Rotation pivots: CSS `transform-origin` in viewBox px + `transform-box: view-box`.
  Arm pivots (2.5 9)/(21.5 9), legs (8.95 17)/(15.05 17), tail (19 14).
- Wrapper motion layers used by the workbench: position translate → fx (independent
  `scale`, `rotate` [peek lean], `translate/scale` keyframe hops) → 3D tilt (perspective
  rotateX/Y easing toward cursor) → svg (`--amp` scaled idle keyframes on `#rig-root`).
- Drag velocity is normalized to the 80 px buddy-window scale before `dragTargets`
  (`k = 80/size × 2.4`, smoothed 0.7/0.3, decay ×0.85/frame while held).
- Companion spring targets = mascot center + offset + sin bob; ghost opacity =
  `clamp(lagDist/70, 0, 0.85)`.

## Remaining scope (in order)

0. ~~**Fold-back**~~ **DONE 2026-07-16** (same day, post-compaction session): spec
   §3.2/3.3/3.6/§5/§6.2 + plan Tasks 7–12 revised (Task 8 signs corrected AND pinned by
   test; addendum block before Task 7), prototype committed to
   `docs/active/prototypes/2026-07-16-buddy-rig-workbench.html`, `mascots/` README updated
   for grip hands/companions/tail/motion styles (wecoded-themes PR #13, merge `90efb05`).
   The concurrent session's uncommitted spec/plan edits had already landed as `c025766`
   (status corrections) — no conflict.
1. ~~App-side rig rendering~~ **DONE 2026-07-16**: sanitizer + mascot-poses + MascotRig +
   default rig (2.5D-soft capsule) + `mascot.rig` theme key — youcoded PR #150, merge
   `bb2f468a` (plan Tasks 7–9). Nothing consumes MascotRig yet; BuddyMascot integration
   (motion styles, companions, peek staging) rides the buddy-floater track (plan Tasks 10–12).
2. ~~`/theme-builder` mascot phase~~ **DONE 2026-07-16**: rig authoring taught to the skill
   (fetch contract from `mascots/README.md`; mix/match, adapt-example, or from-scratch;
   rig authored in Phase 2 alongside the still-required flat variants) — wecoded-marketplace
   PR #42, merge `a3a23fc`.
3. ~~Rebuild golden-sunbreak + halftone-dimension~~ **DONE 2026-07-16**: both shipped to
   `mascots/examples/` (halftone's hardcoded navy also fixes its currentColor-black bug) —
   wecoded-themes PR #14, merge `a115c9d`.
4. Functional buddy work (action bar, BuddyMascot rig integration, motion styles,
   companions, peek staging) — separate track, buddy-floater plan Tasks 1–6, 10–13.
