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

## Built so far (branch `feat/buddy-sleep-poses` on youcoded)

1. **A pose can move the body.** `rig-body` was allowed by the type and then
   silently dropped. Every sleep pose needs it.
2. **Pose changes animate at all.** React rebuilds the mascot's host element on
   a pose change; the re-index threw the springs away and rebuilt them already
   at their target, so NOTHING has ever animated between poses. Also: limb
   tx/ty was never sprung, and the re-index wrote the final pose for one frame
   first. All three fixed, all three measured.
3. **The `sleep` pose** — loaf body, docked arms, eyes shut.
4. **The default rig's eight warm faces** — the film's set, plus `happy` and
   `shutdown`, plus `idle` redrawn as squeezed-shut (it is the HELD face, and
   the film's version was identical to `shutdown`).
5. **`FACE_FALLBACK`** — asking a rig for a face it lacks used to hide EVERY
   face. Load-bearing until all four community rigs are redrawn.

## The four community characters (decks, 2026-09-05)

Three rounds. Round one on `theme-faces.review.json`, round two answered partly
in chat, the colour rounds on `halftone-eyes*.review.json`.

- **Golden Sunbreak: yes**, with one correction — see dizzy below.
- **Both cats keep their own eye highlights.** Destin: *"for welcome/curious, i
  kinda like the old eyes better"* and *"we should also use the old
  welcome/curious eyes for shocked on both."* So the three-dot sparkle cluster is
  a per-character choice, not the house style: Sunbreak and Halftone use the
  cluster, Kuromi and Strawberry Kitty use their original pair (one large shine
  high on the inner edge, one small low and outside). `shocked` uses that same
  eye opened wider, never a solid disc.
- **Spirals are not an option for `dizzy`.** Destin: *"we got rid of those
  intentionally."* The promo film's face set reintroduced them; crossed lines are
  restored everywhere, including the six starter skins and the BUILT-IN buddy,
  which had also picked them up and would have shipped with them.
- **Halftone loses its visor.** The pre-filled visor painted a 45%-opaque slab
  across the eyes, so no expression on this character had ever been readable. It
  ships as an opt-in component instead of built in.
- **Halftone's face is a cyan outline on a violet eye** (`#00b8ff` on `#33265c`),
  after a first attempt in paper white was rejected: *"i don't like when the
  eyes/mouth appear soulless and glowing like that."* A large light shape on a
  dark body reads as a glowing hole. The outline colour also carries the eyelids,
  brows and mouth, so the whole face is drawn in cyan.

## What the drawing taught the theme builder

Doing the art before the guidance was Destin's call and it paid: every item here
was invisible until something was actually drawn.

1. **`rig-face-idle` is not the face you see at rest** — the resting pose asks for
   `welcome`. The docs never said so, so an author draws their best work into a
   group that only shows when the buddy is pressed.
2. **Nothing checked that a face is visible against its own body.** Halftone
   shipped `#1e2636` on `#191327` and was expressionless for months.
3. **A pre-filled accessory can erase the face.** The visor was a signature
   component and it cost the character every expression underneath it.
4. **Cursor tracking was documented as a `curious` convention**, so it worked on
   exactly one face per rig. It belongs on all three open-eyed faces.
5. **The six starter skins were outside the auditor's scope**, so they still
   shipped the old six-face set — the fastest route for a retired style to get
   back into circulation.
6. **Four static starter drawings are the wrong shape.** One parameterised
   template that takes a palette and emits all eight faces is what actually got
   used, and it is what the builder should hand people.

Four of these are now mechanical rather than written, in
`wecoded-themes/scripts/audit-rigs.mjs`: eight faces required, pupil groups on the
three open-eyed faces, `skins/` in scope, and byte-equality between
`mascots/examples/` and the theme's shipped rig. Each was shown failing before it
passed, and the copy check caught real drift the moment it was added.

## Still open, in the order it should probably happen

1. **The theme builder** (`wecoded-marketplace/wecoded-themes-plugin/skills/theme-builder/`).
   Destin, 2026-09-05: "we will also need to improve theme builder to create
   better mascots given the new template." Concretely, and verified on disk:
   `reference/mascots.md:92` still says **"Six faces, not four: idle · welcome ·
   curious · shocked · dizzy · blink"** — it is eight now; the four starter SVGs
   in `scripts/base-mascot-{idle,welcome,shocked,dizzy}.svg` are the OLD style
   (black-disc eyes) and are what every new community theme is currently built
   from; and none of the warm style rules exist in the skill at all. Until this
   is done, every theme made in the app ships the faces we just replaced.
2. **The two-tier motion system**, and the sleep state the z's hang off.
   Governed by Destin's rule: ambient motion only while every session is green
   or gray; red/amber/blue stops it and plays the one clear signal.
3. **Three brand-new characters** for Cotton Candy Sky, Meadow Mist and
   Devil's Garden.
