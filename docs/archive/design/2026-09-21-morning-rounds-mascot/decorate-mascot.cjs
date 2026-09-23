#!/usr/bin/env node
// Build this theme's mascot: generate a rig from the palette, decorate it into the
// vet dog from this theme's own wallpaper, then re-derive the flat art from the
// decorated rig.
//
// WHY this is a script and not hand-edited SVGs: the theme-builder Kit regenerates
// assets from the palette. Hand-edited SVGs are silently lost the next time it does,
// and mascots.md is explicit that a rig with decoration plus palette-only flat art
// means desktop shows the decoration and Android does not. Re-running this
// reproduces every file.
//
// WHY a dog: assets/wallpaper-b.jpg already ships two specific characters — a cream
// dog in carnelian scrubs and a gray cat in teal scrubs. The palette's accent IS the
// dog's scrub red (#B31B1B family, #C31230 body), so the mascot was already halfway
// to being that dog. Destin's call, 2026-09-21: "I want to go for the dog."
//
// Design decisions, and the measurements behind them (all read off the generated
// rig, not guessed):
//
//   Body capsule   x 5..19, y 4..16, corner radius 4. Flat top x 9..15.
//   Faces          the lowest facial element is the open mouth on `shocked` and
//                  `dizzy`, reaching y=13.6. Everything else sits above y=13.35.
//   Eyes           y 8.3..10.8 (shocked is ~12% taller than the rest).
//   => the body below y=13.6 is the only space a *garment* can use, which is why the
//      scrubs and the stethoscope were dropped: at 48 px every placement read as a
//      smudge beside the mouth. A muzzle is different — it is drawn INTO the face
//      groups, so it paints under the eyes and over the body's own shading, and it
//      does not have to thread a 2.4-unit gap.
//
//   Ears           the head has 9 units of free room above the capsule. Floppy lobes
//                  hang OUTSIDE it (x 3.8..6.8 and 17.2..20.2, y 4.4..10.8), clear of
//                  the eyes and of both arms (arms are x 1..4 / 20..23 at y 9..13).
//   Tail           rig-tail is an OPTIONAL limb with a canonical pivot of "19 14";
//                  it springs like a limb. Tapered sickle sweeping up-right, cream
//                  tip, kept inside the contract viewBox (-3 -5 30 30).
//   Headwear       none. It is a #slot-hat, so adding one later means editing HAT
//                  below and re-running — no other change.
//
// The muzzle is inserted at the START of every face group, which is what makes it
// work across all eight faces for free: it paints beneath that face's own eyes and
// mouth, so each expression's existing mouth becomes the dog's mouth. No face markup
// is rewritten, so the app's pose data and the face grammar both stay intact.
//
// usage: node decorate-mascot.cjs [<theme-dir>]      default: this script's dir
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SKILL = process.env.THEME_BUILDER_SKILL ||
  '/home/destin/youcoded-dev/worktrees/sessions/theme-plugin-update/wecoded-marketplace/wecoded-themes-plugin/skills/theme-builder';
const THEME = process.argv[2] || __dirname;
const ASSETS = path.join(THEME, 'assets');
const CONFIG = path.join(THEME, 'mascot-config.json');

// ---- palette -------------------------------------------------------------
// The body wears the character's own scrub colour. Two palettes exist because the
// wallpaper has two characters in two scrub colours, and the body colour is the one
// choice that decides which of them this mascot is:
//
//   dog   the wallpaper dog's carnelian scrubs — sampled #A7122D off the plate
//   cat   the wallpaper cat's teal scrubs     — sampled #5FADB1 off the plate
//
// Chosen with `--palette dog|cat`, default dog. Everything else (shade, highlight,
// ear tone) is derived from the body colour in OKLCH rather than hand-picked, so a
// third scrub colour needs one hex and nothing else — hand-picking four tones per
// candidate is how a palette drifts out of tune.
//
// Hardcoded hex, never currentColor or a CSS variable: the flat variants load
// through <img>, where currentColor resolves to black and variables never resolve at
// all (mascots.md colour rule 1). The rig itself is inlined, where variables DO
// resolve — but this rig hardcodes anyway so the rig and the flat art cannot drift.
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

// ---- OKLCH, so the derived tones are perceptual rather than arithmetic ----------
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const hexToRgb = (h) => {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
};
const rgbToHex = (rgb) => '#' + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

function hexToOklch(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(a, bb), h: Math.atan2(bb, a) };
}

function oklchToHex({ L, C, h }) {
  const a = C * Math.cos(h), bb = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  const lin = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgbToHex(lin.map(linearToSrgb));
}

/** Tones derived from one body colour. Deltas are perceptual, in OKLCH L and C. */
function tones(body, opts = {}) {
  const base = hexToOklch(body);
  const shift = (dL, dC, dh = 0) => oklchToHex({ L: base.L + dL, C: Math.max(0, base.C + dC), h: base.h + dh });
  const light = opts.light;   // 'warm' | 'cool' — which way the highlight leans
  return {
    BODY: body,
    // Highlight is the body nudged lighter, and rotated a touch so it reads as light
    // rather than as the same hue at a different brightness.
    HIGHLIGHT: shift(opts.hiL ?? 0.10, opts.hiC ?? 0.01, light === 'warm' ? -0.05 : 0.05),
    // Shade is deeper and slightly more saturated, the way a shadow on cloth behaves.
    SHADE: shift(opts.shL ?? -0.16, opts.shC ?? 0.02),
    // The ear is a shade off the body so the lobes separate from the head, but not so
    // far that they read as a different material.
    EAR: shift(opts.earL ?? -0.07, opts.earC ?? -0.01),
    EAR_INNER: shift(opts.innerL ?? 0.10, opts.innerC ?? -0.02, light === 'warm' ? -0.04 : 0.04),
    // The eye fill. mascots.md rule 3: on a dark body the eye stays dark with a light rim
    // rather than being flipped to white, which reads as a glowing hole. That dark fill has
    // to be a dark tone of the BODY's hue — a fixed dark red eye on a teal body reads as a
    // red mask across the face, which is what the first teal build shipped.
    FACE_FILL: shift(opts.faceL ?? -0.30, opts.faceC ?? -0.05),
  };
}

const PALETTES = {
  // The dog: carnelian scrubs. Tones tuned against the original hand-picked set.
  dog: { body: '#C31230', light: 'warm', hiL: 0.10, shL: -0.16, earL: -0.07 },
  // The cat: teal scrubs, sampled off the plate at #5FADB1 — the character's true colour.
  'cat-exact': { body: '#5FADB1', light: 'cool', hiL: 0.09, shL: -0.15, earL: -0.08 },
  // Teal scrub range. Below ~#5FADB1 the body stops reading against the cream page and
  // the cream face stops reading on the body; these three are the usable span.
  'scrub-mid': { body: '#3E9AA0', light: 'cool', hiL: 0.09, shL: -0.15, earL: -0.08 },
  'scrub-teal': { body: '#2E8388', light: 'cool', hiL: 0.09, shL: -0.15, earL: -0.08 },
  'teal-deep': { body: '#1F6B72', light: 'cool', hiL: 0.09, shL: -0.15, earL: -0.08 },
  // Blue-clinic scrub range, for comparison — same treatment, cooler hue.
  'blue-clinic': { body: '#3A6FA8', light: 'cool', hiL: 0.09, shL: -0.15, earL: -0.08 },
  'blue-deep': { body: '#2A5183', light: 'cool', hiL: 0.09, shL: -0.15, earL: -0.08 },
};

const paletteName = arg('--palette', 'dog');
const palette = PALETTES[paletteName];
if (!palette) {
  console.error(`FATAL: unknown palette "${paletteName}" — known: ${Object.keys(PALETTES).join(', ')}`);
  process.exit(1);
}
const T = tones(palette.body, palette);
const { BODY, SHADE, HIGHLIGHT, EAR, EAR_INNER, FACE_FILL } = T;
const CREAM = '#FFF3E4';      // the dog's face, matching the wallpaper's muzzle
const NOSE = '#3A2028';       // warm near-black, softer than pure black

// ---- headwear ------------------------------------------------------------
// Floppy dog ears live in the hat slot: it is the only rig slot that paints above the
// body and is not animated, which is exactly what a pair of lobes needs. This is the
// sanctioned way to give a capsule mascot a species — mascots/README.md lists
// Strawberry Kitty's ears as a hat component for precisely this reason.
//
// THEY MUST SIT ABOVE THE BODY, inside the slot's documented box (x 5–19, y −4 to 6).
// The first build hung them OUTBOARD of the head at x 3.8–20.2, y 4.4–10.8, on the
// reasoning that the wallpaper dog's ears hang down its cheeks. Two things were wrong
// with that. It leaves the slot's box on both axes, so it is out of contract; and at
// x 3.8 the lobe's underside sits 0.05 units off the ARM's top edge (arms are x 1–4,
// y 9–13), so on the `dizzy`/`shocked` faces the ear and the swinging arm nearly touch.
// Strawberry Kitty's cat ears, read off its shipped rig, are drawn at x 6–18 · y 1.8–4.3
// — small lobes tucked into the head's top corners. This is the dog's version of that:
// same footprint, rounder and tilted harder outward so they read as drooping.
//
// The top of the body is y=4, so the lobes straddle it (y 0.80–5.40) and the part below
// y=4 overlaps the head, which reads as attachment because #slot-hat paints after
// #rig-body. Their lowest point, y 5.40, clears the high-arched brows at y≈6.9 and the
// `shocked` eyes' tops at y 7.24 — see mascots.md on the Halftone visor, which covered
// the eyes and made every expression unreadable for months. verifyGeometry() re-checks
// the eye clearance on every build rather than trusting these numbers.
const HAT = `
      <!-- Signature component: floppy dog ears, from wallpaper-b.jpg's dog -->
      <ellipse cx="6.6" cy="3.1" rx="1.5" ry="2.35" fill="${EAR}" transform="rotate(-16 6.6 3.1)"/>
      <ellipse cx="6.8" cy="3.3" rx="0.7" ry="1.5" fill="${EAR_INNER}" opacity="0.6" transform="rotate(-16 6.8 3.3)"/>
      <ellipse cx="17.4" cy="3.1" rx="1.5" ry="2.35" fill="${EAR}" transform="rotate(16 17.4 3.1)"/>
      <ellipse cx="17.2" cy="3.3" rx="0.7" ry="1.5" fill="${EAR_INNER}" opacity="0.6" transform="rotate(16 17.2 3.3)"/>`;

// ---- held item: the clipboard -------------------------------------------
// Destin chose this on the deck (2026-09-22): the wallpaper's cat holds an orange clipboard
// of notes, so the dog holding one too ties the buddy to the picture the ears already tie it
// to, and it says "vet student" without needing scrubs.
//
// It lives in #slot-item, which is INSIDE #rig-arm-right, so the app waves and trails it with
// the arm for free. mascots/components/items/* are authored around the anchor 21.5 12.8 in
// the same coordinate space as the rest of the rig, so this borrows their layout and colours
// rather than inventing a position: the anchor is the hand the dog already has.
//
// Colour is hardcoded, not var(--rig-accent). The clipboard's orange IS the character's
// identity here — it is the one thing carried over from the picture — and mascots.md is
// explicit that a hardcoded colour is for exactly that, provided it carries a fallback (the
// flat art loads through <img>, where a variable never resolves and currentColor is black).
//
// Sized to the HAND, not the body: 2.9 × 4.0 units against the hand's own 3 × 4. The first
// attempt was 3.8 × 6.05 and stood as tall as the body — at full size it read as a poster
// stuck to the dog's side rather than as something held, because a held object bigger than
// the holder's torso stops reading as held. A shipped item for scale: the pencil component
// is 1 × 5.2 and the flag's mast 6.4 long, both within twice the hand.
//
// It is placed so the hand grips its UPPER-LEFT and the board hangs down and out to the
// lower-right — at the side, the way you carry a clipboard, not held up in front. Its top is
// at y 9.76, level with the hand; its bottom at y 14.51 sits below the hand (y 9–13), which is
// what makes the grip read as a grip instead of the board being pasted onto the arm.
//
// TILTED 20°, against the arm's vertical: square to the body the board read as a door on a
// hinge. The clip is a contrasting band across the top and the three ruled lines are what
// make it read as notes at a glance rather than as a plain orange rectangle — the same orange
// the wallpaper's clipboard is, and the theme's accent.
const ITEM = `
      <!-- Signature component: the wallpaper cat's clipboard of notes -->
      <g transform="rotate(-20 21.5 12.8)">
        <rect x="20.9" y="10.4" width="2.9" height="4.0" rx="0.35" fill="#F6AE2D"/>
        <rect x="20.9" y="10.4" width="2.9" height="0.8" rx="0.3" fill="#C97F14"/>
        <rect x="21.7" y="9.98" width="1.3" height="0.72" rx="0.28" fill="#8A5A0B"/>
        <path d="M21.6 12.1 H23.1 M21.6 12.95 H23.1 M21.6 13.8 H22.4" stroke="#8A5A0B" stroke-width="0.2" stroke-linecap="round"/>
      </g>`;

// ---- tail ----------------------------------------------------------------
// REMOVED, by Destin's own answer on the deck (2026-09-22): he picked the blue body and
// added the note "remove the tail". The tail is not a defect to fix — it is a decision.
// The build below is kept rather than deleted because #rig-tail is the rig's own OPTIONAL
// limb and the insertion is generic; set TAIL to markup to bring it back. Do not re-add it
// on design grounds alone: it was shown at full size and at 80 px on the deck and rejected.
//
// The geometry, kept for whoever reintroduces it (measured when it was in use, and the
// reason the third version finally read as attached): painted into the rig's own #rig-tail
// group so the app's limb physics spring it, with data-pivot at the contract's canonical
// hinge "19 14".
//
// The inner end is tucked BEHIND the body (the group is inserted as the first child of
// #rig-root, so it paints before the body and the arms). A tail that merely sits beside
// the body reads as a detached blob — which is what the first version did, and it took
// looking at the thing at full size to see it, because at 320 px it was a smudge.
// So: it emerges from behind the body's right side, sweeps up and out, and its cream tip
// sits on the OUTER end of the sweep rather than floating off the side.
// Geometry that had to be solved rather than guessed: the right arm occupies x 20..23,
// y 9..13, so ANY tail that reaches above y≈13 near the body's right edge runs through it
// (three attempts did). Below the arm the body's lower-right corner curves inward, from
// x 18.87 at y 13 to x 15 at y 16 — so the tail tucks into that curve and sweeps DOWN and
// out, entirely clear of the arm. Measured: 2.46 sq units of contact with the body, zero
// overlap with the arm or either leg.
// Chosen over the alternatives by measurement, not by eye: this one keeps 1.8 sq units of
// contact with the body (so it reads as attached) AND puts 2.6 sq units below the body's
// bottom edge, where it is visible against the page. The tucked-only version scored 2.5
// contact but 0.0 below — attached, and invisible.
// Colour: SHADE (a clear step darker than the body), not EAR (a near-body tone) and not
// BODY. The tail is painted BEFORE the body, so it is physically behind it — a darker tone
// says so, and it also separates the tail from the body's own highlight gradient where the
// two meet. An earlier build used EAR and drew a bare CREAM circle at the tip; at full size
// the circle sat proud of the ellipse's end and the pair read as a teal sausage with a cream
// ball glued on, which is not a tail. A single slender tapered shape reads as one.
// Slender rather than fat: rx 0.78 against ry 2.75 is a taper of roughly 3.5:1 along the
// sweep, where the first version's 1.15/2.6 was a blunt lozenge.
//
// The shape, for reference — a single slender swept ellipse, no tip ornament:
//   <g id="rig-tail" data-pivot="19 14">
//     <ellipse cx="18.9" cy="15.5" rx="0.78" ry="2.75" fill="SHADE" transform="rotate(-52 18.9 15.5)"/>
//   </g>
const TAIL = '';

// ---- muzzle --------------------------------------------------------------
// Inserted at the head of every face group, so it paints UNDER that face's own eyes
// and mouth. Spans y 11.8..14.8 — its top edge clears the normal eye bottoms
// (y=11.75) by 0.05, and its bottom sits inside the body edge at y=16. The shocked
// face's eyes reach y=12.16, so the muzzle's outer flanks are tucked under them
// there; it is cream on carnelian, so that reads as the muzzle sitting behind the
// eye rather than as a seam.
//
// Deliberately a shallow wide lens and not the wallpaper dog's tall muzzle: the
// contract's own mouth geometry (y 12.75..14.5) has to land ON the muzzle, and a
// taller one would have to cover an eye to do it. Sized so the drawn nose, the eye
// bottoms and the mouth all clear each other — see verifyGeometry() below, which
// fails the build if any of them move.
const MUZZLE = `<ellipse cx="12" cy="13.3" rx="3.9" ry="1.5" fill="${CREAM}"/>
        <ellipse cx="12" cy="12.5" rx="0.62" ry="0.45" fill="${NOSE}"/>`;

// ---- build ---------------------------------------------------------------
const run = (args) => execFileSync('node', [`${SKILL}/scripts/build-mascot.mjs`, '--out', ASSETS, ...args], { stdio: 'inherit' });

fs.mkdirSync(ASSETS, { recursive: true });
// The palette is written to a GENERATED config and that is what the rig is built from.
//
// Why this and not `--body`: build-mascot.mjs takes only --body and --skin on the command
// line — there is no --highlight or --shade — so a recolour driven from the CLI leaves the
// highlight and shade gradients on their old values. The first attempt at this shipped a red
// body wearing teal ears for exactly that reason, and the theme's own mascot-config.json
// cannot be rewritten per candidate without destroying the record of what the theme uses.
const genConfig = path.join(ASSETS, '.mascot-config.generated.json');
const baseConfig = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
fs.writeFileSync(genConfig, JSON.stringify({
  ...baseConfig,
  body: BODY, highlight: HIGHLIGHT, shade: SHADE,
  // The eye fill is a dark tone of the body's own hue (mascots.md rule 3), and `ink`
  // is cream so the strokes this face does draw — lids, the blink curves — read on it.
  //
  // `rim` is deliberately ABSENT. It strokes the eye ellipse and every filled mouth, and
  // on a mid-tone body that ring reads as a sticker border: at full size the first build
  // showed cream haloes round both eyes, which no shipped theme has. The five shipped
  // themes with a light or mid body (golden-sunbreak, cotton-candy-sky, meadow-mist,
  // kuromi-dreamer, strawberry-kitty) all set a dark `fill` and NO `rim`. The two that
  // set one are halftone-dimension — rim `#00b8ff` on a near-black `#191327` body, where
  // it is the only thing separating the eye from the head — and devils-garden, whose rim
  // is a warm spark rather than the face colour. A rim is for a body the eye cannot
  // separate from, and this body is not that.
  face: { ...(baseConfig.face || {}), fill: FACE_FILL, ink: CREAM, rim: undefined },
  // Catchlight: cream, in the three-dot cluster shape. The first build used `pair` with
  // the palette's amber `spark`, which puts one 0.52-unit disc at the top of a 1.6-unit
  // eye — a large flat orange ball that reads as a googly eye rather than as a shine.
  // `cluster`'s largest dot is 0.3. Kept light rather than amber because the eye is
  // already a deep tone of the body hue and a same-family amber sits *in* it; a cream
  // dot is unmistakably a reflection. This is also what the five light-bodied shipped
  // themes do (four use pure white catchlights).
  catchlight: 'cluster',
  spark: ['#FFF6EA', '#FFE9D2', '#E9D6BC'],
}, null, 2));
run(['--config', genConfig]);

const rigPath = path.join(ASSETS, 'mascot-rig.svg');
let svg = fs.readFileSync(rigPath, 'utf8');

if (!svg.includes('<g id="slot-hat"/>')) {
  console.error('FATAL: no empty <g id="slot-hat"/> — rig already decorated?');
  process.exit(1);
}
if (!svg.includes('<g id="rig-body">')) {
  console.error('FATAL: no <g id="rig-body"> — unexpected rig structure');
  process.exit(1);
}

// Ears: fill the hat slot.
if (HAT) svg = svg.replace('<g id="slot-hat"/>', `<g id="slot-hat">${HAT}\n    </g>`);

// Clipboard: fill the item slot. It sits inside #rig-arm-right, so the app animates it with
// the arm without knowing it exists. This rig's slot is the empty self-closing form; a rig
// built with `tail: true` or another item would carry `<g id="slot-item"></g>` instead, so
// both forms are accepted rather than silently decorating nothing.
if (ITEM) {
  if (svg.includes('<g id="slot-item"/>')) {
    svg = svg.replace('<g id="slot-item"/>', `<g id="slot-item">${ITEM}\n      </g>`);
  } else if (svg.includes('<g id="slot-item">')) {
    svg = svg.replace('<g id="slot-item">', `<g id="slot-item">${ITEM}`);
  } else {
    console.error('FATAL: no #slot-item — cannot place the clipboard');
    process.exit(1);
  }
}

// Tail: the rig has no #rig-tail unless the config asked for one (this config does
// not), so insert it as the first child of #rig-root — behind the body, the way a
// tail should sit. Anchored on #rig-root rather than a sibling group so a change to
// the rig's internal ordering cannot silently drop it.
if (TAIL) {
  const anchor = '<g id="rig-root">';
  if (!svg.includes(anchor)) {
    console.error('FATAL: no <g id="rig-root"> — cannot place the tail');
    process.exit(1);
  }
  svg = svg.replace(anchor, `${anchor}\n    ${TAIL}`);
}

// Muzzle: at the head of every face group, so it paints under that face's eyes and
// mouth. Rewriting a face's contents is what mascots.md warns against; prepending
// to the group is not that — every expression survives untouched.
const faceIds = [...svg.matchAll(/<g id="rig-face-([a-z]+)"/g)].map((m) => m[1]);
if (faceIds.length === 0) {
  console.error('FATAL: no face groups found — unexpected rig structure');
  process.exit(1);
}
for (const face of faceIds) {
  const open = new RegExp(`(<g id="rig-face-${face}"[^>]*>)`);
  if (!open.test(svg)) {
    console.error(`FATAL: could not open #rig-face-${face} to place the muzzle`);
    process.exit(1);
  }
  svg = svg.replace(open, `$1\n        ${MUZZLE}`);
}

fs.writeFileSync(rigPath, svg);

// Re-derive the flat art from the decorated rig, or Android and web render the
// undecorated palette version.
run(['--from-rig', rigPath]);

// ---- verify --------------------------------------------------------------
// Geometry first: the colour assertions below cannot see a lobe sitting over an eye
// or a tail through the arm, and those are exactly the defects two rounds of
// eyeballing a 320px PNG missed. Bounding boxes are not good enough — the tail's box
// overlaps the body's rounded corner by 0.84 sq units while the ellipse never touches
// it — so this samples real shape membership.
function verifyGeometry() {
  const TAU = Math.PI * 2;
  const inRoundedRect = (px, py, s) => {
    if (px < s.x0 || px > s.x1 || py < s.y0 || py > s.y1) return false;
    const cx = Math.min(Math.max(px, s.x0 + s.r), s.x1 - s.r);
    const cy = Math.min(Math.max(py, s.y0 + s.r), s.y1 - s.r);
    return (px - cx) ** 2 + (py - cy) ** 2 <= s.r * s.r;
  };
  const inEllipse = (px, py, cx, cy, rx, ry, deg = 0) => {
    const t = (deg * TAU) / 360;
    const dx = px - cx, dy = py - cy;
    const u = dx * Math.cos(t) + dy * Math.sin(t);
    const v = -dx * Math.sin(t) + dy * Math.cos(t);
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
  };
  // Overlap area of two shapes by grid sampling over their shared box.
  const overlap = (fa, ba, fb, bb, n = 600) => {
    const x0 = Math.max(ba[0], bb[0]), y0 = Math.max(ba[1], bb[1]);
    const x1 = Math.min(ba[2], bb[2]), y1 = Math.min(ba[3], bb[3]);
    if (x1 <= x0 || y1 <= y0) return 0;
    const dx = (x1 - x0) / n, dy = (y1 - y0) / n;
    let hits = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const px = x0 + (i + 0.5) * dx, py = y0 + (j + 0.5) * dy;
        if (fa(px, py) && fb(px, py)) hits++;
      }
    }
    return hits * dx * dy;
  };

  const BODY = { x0: 5, y0: 4, x1: 19, y1: 16, r: 4 };
  const ARMS = [{ name: 'arm-left', s: { x0: 1, y0: 9, x1: 4, y1: 13, r: 0.8 } },
                { name: 'arm-right', s: { x0: 20, y0: 9, x1: 23, y1: 13, r: 0.8 } }];
  const LEGS = [{ name: 'leg-left', s: { x0: 7.2, y0: 17, x1: 10.7, y1: 21, r: 1.2 } },
                { name: 'leg-right', s: { x0: 13.3, y0: 17, x1: 16.8, y1: 21, r: 1.2 } }];
  // Eye geometry from the skill's own mascot-faces.mjs, not from a screenshot.
  const EYES = [{ name: 'left eye', cx: 9.3, cy: 9.55 }, { name: 'right eye', cx: 14.7, cy: 9.25 }];
  const EYE_W = 1.6, EYE_H = 2.2, SHOCK = 1.12;

  // Read the decoration back OUT of the SVG this build just wrote, rather than
  // re-stating its coordinates here. A check that re-states them tests the constants
  // and not the file: moving a lobe in HAT while leaving these numbers alone passed a
  // deliberately eye-covering ear during development, which is exactly the failure a
  // verifier exists to catch.
  const svgText = fs.readFileSync(rigPath, 'utf8');
  const partBounds = (b) => [b[0] - b[2], b[1] - b[3], b[0] + b[2], b[1] + b[3]];
  // Exact AABB of a rotated ellipse, used only to size the sampling box.
  const ellipseBox = (cx, cy, rx, ry, deg) => {
    const t = (deg * TAU) / 360;
    const hx = Math.hypot(rx * Math.cos(t), ry * Math.sin(t));
    const hy = Math.hypot(rx * Math.sin(t), ry * Math.cos(t));
    return [cx - hx, cy - hy, cx + hx, cy + hy];
  };
  const rot = (attrs) => {
    const m = /rotate\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\)/.exec(attrs);
    return m ? [Number(m[2]), Number(m[3]), Number(m[1])] : [0, 0, 0];
  };
  const parts = [];
  // Collected separately from the geometry findings below: a shape this parser cannot
  // read is a defect in the verifier, not in the art, and conflating the two hides
  // which one to fix.
  const misparsed = [];
  const groupText = (id) => {
    const open = svgText.search(new RegExp(`<g\\b[^>]*\\bid="${id}"`));
    if (open < 0) return '';
    const after = svgText.indexOf('>', open);
    if (svgText[after - 1] === '/') return '';
    let i = after + 1, depth = 1;
    while (i < svgText.length && depth > 0) {
      const no = svgText.indexOf('<g', i), nc = svgText.indexOf('</g>', i);
      if (nc < 0) break;
      if (no >= 0 && no < nc) { depth++; i = no + 2; } else { depth--; if (depth === 0) return svgText.slice(after + 1, nc); i = nc + 4; }
    }
    return '';
  };
  // Ears: every ellipse in #slot-hat that carries a rotate() is a lobe. The inner
  // ellipses carry the same rotate(), so pair them by x: whichever of the pair sits
  // nearer the centre is the inner one.
  const hatText = groupText('slot-hat');
  const hatEllipses = [...hatText.matchAll(/<ellipse\b([^>]*)\/>/g)].map((m) => {
    const a = m[1];
    const num = (k) => Number(new RegExp(`${k}="(-?[\\d.]+)"`).exec(a)?.[1]);
    const [ox, oy, deg] = rot(a);
    const cx = num('cx'), cy = num('cy'), rx = num('rx'), ry = num('ry');
    // rotate(a x y) with x/y not equal to cx/cy would translate the shape; the build
    // never does that, and silently ignoring it would mis-measure, so assert it.
    if (ox !== 0 && (Math.abs(ox - cx) > 1e-9 || Math.abs(oy - cy) > 1e-9)) {
      return { bad: `#slot-hat ellipse rotates about (${ox}, ${oy}) but is centred at (${cx}, ${cy})` };
    }
    return { cx, cy, rx, ry, deg, fn: (x, y) => inEllipse(x, y, cx, cy, rx, ry, deg), b: ellipseBox(cx, cy, rx, ry, deg) };
  });
  if (hatEllipses.some((e) => e.bad)) {
    for (const e of hatEllipses) if (e.bad) misparsed.push(e.bad);
  } else {
    for (const side of ['left', 'right']) {
      const half = hatEllipses.filter((e) => (side === 'left' ? e.cx < 12 : e.cx > 12))
        .sort((a, c) => side === 'left' ? c.cx - a.cx : a.cx - c.cx);
      const outer = half[0], inner = half[1];
      if (outer) parts.push({ ...outer, name: `${side} lobe`, b: outer.b });
      if (inner) parts.push({ ...inner, name: `${side} inner`, b: inner.b, inner: true });
    }
  }
  // Tail: the ellipse inside #rig-tail.
  const tailText = groupText('rig-tail');
  const tailEl = /<ellipse\b([^>]*)\/>/.exec(tailText);
  if (tailEl) {
    const a = tailEl[1];
    const num = (k) => Number(new RegExp(`${k}="(-?[\\d.]+)"`).exec(a)?.[1]);
    const [ox, oy, deg] = rot(a);
    const cx = num('cx'), cy = num('cy'), rx = num('rx'), ry = num('ry');
    if (ox !== 0 && (Math.abs(ox - cx) > 1e-9 || Math.abs(oy - cy) > 1e-9)) {
      misparsed.push(`#rig-tail ellipse rotates about (${ox}, ${oy}) but is centred at (${cx}, ${cy})`);
    } else {
      parts.push({ name: 'tail', fn: (x, y) => inEllipse(x, y, cx, cy, rx, ry, deg), b: ellipseBox(cx, cy, rx, ry, deg) });
    }
  }

  const g = [...misparsed];
  const solids = [{ name: 'body', s: BODY }, ...ARMS, ...LEGS];
  // The tail MUST touch the body — an appendage that floats free reads as a detached blob
  // rather than as part of the character. Every other part is allowed to clear it (the ear
  // lobes hang off the head; the muzzle sits inside the face).
  const tailPart = parts.find((p) => p.name === 'tail');
  if (TAIL && tailPart) {
    const contact = overlap(tailPart.fn, tailPart.b, (x, y) => inRoundedRect(x, y, BODY), [BODY.x0, BODY.y0, BODY.x1, BODY.y1]);
    if (contact < 0.05) {
      g.push(`tail does not touch the body (${contact.toFixed(3)} sq units) — it will read as a detached blob`);
    }
  }
  for (const p of parts) {
    for (const { name, s } of solids) {
      const a = overlap(p.fn, p.b, (x, y) => inRoundedRect(x, y, s), [s.x0, s.y0, s.x1, s.y1]);
      // Over the HEAD is attachment, not a collision: #slot-hat paints after #rig-body, so
      // an ear lobe is drawn on top and reads as joined. The inner ellipse is the lobe's
      // shading, inside the lobe, so it is exempt for the same reason. The tail is the same
      // idea from the other side — it is inserted before the body, so its inner end is meant
      // to disappear behind it (see the tail-contact rule above). Over an ARM or a LEG any
      // of them is a real defect: separate moving parts sliding through each other.
      const attachesToBody = name === 'body' && (p.name.endsWith('lobe') || p.inner || p.name === 'tail');
      if (a > 0.02 && !attachesToBody) {
        g.push(`${p.name} collides with ${name} (${a.toFixed(2)} sq units)`);
      }
    }
    for (const scale of [1, SHOCK]) {
      for (const e of EYES) {
        const cy = scale === 1 ? e.cy : e.cy + 0.15;
        const hw = EYE_W * scale, hh = EYE_H * scale;
        const a = overlap(p.fn, p.b, (x, y) => inEllipse(x, y, e.cx, cy, hw, hh), [e.cx - hw, cy - hh, e.cx + hw, cy + hh]);
        if (a > 0.02) g.push(`${p.name} covers the ${e.name} (${a.toFixed(2)} sq units)`);
      }
    }
  }
  // The muzzle has to sit below the normal eye bottoms, above the template mouth, and
  // inside the body — three constraints that between them pin it to a ~0.1 unit band.
  // Read from the emitted face group, so moving it in MUZZLE cannot slip past.
  const idleText = groupText('rig-face-idle');
  const muzzleEl = /<ellipse\b([^>]*)\/>/.exec(idleText);
  const noseEl = [...idleText.matchAll(/<ellipse\b([^>]*)\/>/g)][1];
  if (!muzzleEl) {
    g.push('no muzzle ellipse at the head of #rig-face-idle');
  } else {
    const num = (a, k) => Number(new RegExp(`${k}="(-?[\\d.]+)"`).exec(a)?.[1]);
    const my = num(muzzleEl[1], 'cy'), mry = num(muzzleEl[1], 'ry');
    const normalEyeBottom = Math.max(9.55 + EYE_H, 9.25 + EYE_H);
    if (my - mry < normalEyeBottom - 0.05) g.push(`muzzle top ${(my - mry).toFixed(2)} reaches the eye bottoms (${normalEyeBottom})`);
    if (my + mry > BODY.y1) g.push(`muzzle bottom ${(my + mry).toFixed(2)} escapes the body`);
    if (my - mry >= 14.5) g.push(`muzzle top ${(my - mry).toFixed(2)} would cover the mouth`);
    if (noseEl) {
      const ny = num(noseEl[1], 'cy'), nry = num(noseEl[1], 'ry');
      if (ny + nry > 13.0) g.push(`nose bottom ${(ny + nry).toFixed(2)} overlaps the mouth`);
    } else {
      g.push('no nose ellipse in #rig-face-idle');
    }
  }
  // The clipboard stays within the item slot's own band. mascots/README.md gives slot-item
  // the anchor "21.5 12.8 ... ≈4×8 around the hand" and the components author themselves
  // within x 20–23 — the same band as the arm it is nested in. A board wider than that
  // pokes past the hand into empty space, where it reads as floating rather than held.
  // Bounds are read from the emitted transform + rect, not re-stated from ITEM.
  const itemText = groupText('slot-item');
  if (ITEM && !itemText) {
    g.push('#slot-item is empty but the clipboard is set');
  } else if (ITEM) {
    const box = /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(itemText);
    const rotDeg = Number(/rotate\((-?[\d.]+)/.exec(itemText)?.[1] ?? 0);
    if (!box) {
      g.push('no clipboard board rect found in #slot-item');
    } else {
      const [x, y, w, h] = box.slice(1).map(Number);
      // Rotate the four corners about the anchor and take the AABB, so the tilt is measured
      // rather than assumed to fit.
      const t = (rotDeg * TAU) / 360, ax = 21.5, ay = 12.8;
      const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => {
        const dx = px - ax, dy = py - ay;
        return [ax + dx * Math.cos(t) - dy * Math.sin(t), ay + dx * Math.sin(t) + dy * Math.cos(t)];
      });
      const x0 = Math.min(...corners.map((c) => c[0])), x1 = Math.max(...corners.map((c) => c[0]));
      const y0 = Math.min(...corners.map((c) => c[1])), y1 = Math.max(...corners.map((c) => c[1]));
      if (x0 < 18) g.push(`clipboard reaches x ${x0.toFixed(2)}, crowded against the body (body ends at x 19)`);
      if (x1 > 25.5) g.push(`clipboard reaches x ${x1.toFixed(2)}, past the hand and into open space`);
      if (y0 < 6) g.push(`clipboard top ${y0.toFixed(2)} rises toward the ears`);
      if (y1 > 19) g.push(`clipboard bottom ${y1.toFixed(2)} descends toward the leg`);
      // It must actually overlap the hand it is held in, or it reads as floating beside it.
      const hand = { x0: 20, y0: 9, x1: 23, y1: 13, r: 0.8 };
      const contact = overlap((px, py) => px >= x0 && px <= x1 && py >= y0 && py <= y1,
        [x0, y0, x1, y1], (px, py) => inRoundedRect(px, py, hand), [hand.x0, hand.y0, hand.x1, hand.y1]);
      if (contact < 0.5) g.push(`clipboard barely overlaps the hand (${contact.toFixed(2)} sq units) — it will read as floating`);
    }
  }
  // Nothing may leave the contract viewBox (-3 -5 30 30).
  const xs = parts.flatMap((p) => [p.b[0], p.b[2]]);
  const ys = parts.flatMap((p) => [p.b[1], p.b[3]]);
  if (xs.length) {
    if (Math.min(...xs) < -3 || Math.max(...xs) > 27) g.push('decoration escapes the viewBox horizontally');
    if (Math.min(...ys) < -5 || Math.max(...ys) > 25) g.push('decoration escapes the viewBox vertically');
  }
  // Hats stay inside the slot's documented box: x 5–19, y −4 to 6 (mascots/README.md
  // → Component slots). The first build's ears hung outboard at x 3.8–20.2 · y 4.4–10.8
  // and this is the check that would have caught it — nothing else in this file looks at
  // x bounds, and the viewBox is seven units wider than the slot on each side, so art can
  // leave the slot and stay well inside the viewBox. Read from the emitted lobes.
  for (const p of parts.filter((q) => q.name.endsWith('lobe') || q.name.endsWith('inner'))) {
    if (p.b[0] < 5 - 0.01 || p.b[2] > 19 + 0.01) g.push(`${p.name} leaves the hat slot horizontally (x ${p.b[0].toFixed(2)}..${p.b[2].toFixed(2)}, slot is 5..19)`);
    if (p.b[1] < -4 - 0.01 || p.b[3] > 6 + 0.01) g.push(`${p.name} leaves the hat slot vertically (y ${p.b[1].toFixed(2)}..${p.b[3].toFixed(2)}, slot is -4..6)`);
  }
  return g;
}

const flat = ['mascot-idle.svg', 'mascot-welcome.svg', 'mascot-inquisitive.svg', 'mascot-shocked.svg'];
let eyesChecked = 0;   // files where an open eye was actually found and inspected
const problems = verifyGeometry();
const decorated = fs.readFileSync(rigPath, 'utf8');

// The decoration is claimed by this build, so it must be present. Asserting the
// colours rather than the geometry catches the realistic failure — a replace() that
// matched nothing and left the rig bare while every other check still passed.
if (HAT && !decorated.includes(EAR)) problems.push('rig: ears missing');
if (TAIL && !decorated.includes('<g id="rig-tail"')) problems.push('rig: tail missing');
// TAIL is empty by Destin's decision, so assert the OPPOSITE: no tail group may reappear
// without someone deliberately setting TAIL again. An empty constant is easy to forget, and
// a silently returning tail would ship art he explicitly removed.
if (!TAIL && /<g id="rig-tail"/.test(decorated)) problems.push('rig: a tail is present but TAIL is empty (Destin removed the tail on the deck)');
if (ITEM && !decorated.includes('#F6AE2D')) problems.push('rig: clipboard missing');
if (!ITEM && /clipboard/.test(decorated)) problems.push('rig: a clipboard is present but ITEM is empty');
if (!decorated.includes(NOSE)) problems.push('rig: muzzle missing');
if (faceIds.some((f) => !new RegExp(`<g id="rig-face-${f}"[^>]*>\\s*<ellipse cx="12" cy="13.3"`).test(decorated))) {
  problems.push('rig: a face group did not receive the muzzle');
}
// Undecorated slots stay self-closing: `<g id="slot-hat"/>`. A filled slot must
// therefore be a real element pair, not the self-closing form.
if (HAT && decorated.includes('<g id="slot-hat"/>')) problems.push('rig: #slot-hat still self-closing but HAT is set');

for (const [label, s] of [['rig', decorated], ...flat.map((f) => [f, fs.readFileSync(path.join(ASSETS, f), 'utf8')])]) {
  // Colour rule 1 — the flat variants load through <img>.
  if (/currentColor/.test(s)) problems.push(`${label}: currentColor (colour rule 1)`);
  if (/var\(--/.test(s)) problems.push(`${label}: CSS variable (colour rule 1)`);
  // No rim on the eyes. A rim is only for a body the eye cannot separate from (see the
  // generated config); on a mid-tone body it paints a halo round each eye that reads as a
  // sticker border, which is what the first build shipped and what five shipped themes
  // avoid. Asserted here rather than left to the config comment because `rim` is easy to
  // reintroduce by copying another theme's config.
  if (!problems.some((p) => p.startsWith(`${label}:`))) {
    // Read from whichever face group this file carries: the rig has all eight, but a flat
    // variant keeps only its own (`flatten-rig` drops the rest), so slicing from a named
    // face works on the rig and silently finds nothing in the flat art.
    const faceAt = s.search(/<g id="rig-face-/);
    const face = faceAt < 0 ? '' : s.slice(faceAt);
    if (!face) problems.push(`${label}: no face group to check the eyes in`);
    // Not every face has an open eye: `idle` and `inquisitive` are drawn with closed lids
    // and carry no eye ellipse at all. Check what is there, and require at the end that
    // some file did show an open eye — otherwise a rename could retire this check silently.
    const eye = face.match(/<ellipse cx="9.3"[^>]*>/)?.[0];
    if (eye) {
      eyesChecked++;
      if (/\bstroke=/.test(eye)) problems.push(`${label}: eye carries a rim stroke (${eye.match(/stroke="[^"]*"/)?.[0]}) — see the generated-config comment`);
    }
    // The catchlight must stay small. A `pair` catchlight at the palette's amber size put a
    // 0.52-unit disc in a 1.6-unit eye, which reads as a googly eye and not as a shine.
    const pupil = face.match(/<g class="pupil">[\s\S]*?<\/g>/)?.[0] ?? '';
    const big = Math.max(0, ...[...pupil.matchAll(/r="([\d.]+)"/g)].map((m) => Number(m[1])));
    if (big > 0.34) problems.push(`${label}: catchlight r=${big} is too large — it will read as a googly eye`);
  }
  // The whole point of --from-rig: every flat variant must carry the decoration.
  if (!s.includes(NOSE)) problems.push(`${label}: muzzle not re-derived from rig`);
  if (HAT && !s.includes(EAR)) problems.push(`${label}: ears not re-derived from rig`);
  if (TAIL && !s.includes('<g id="rig-tail"')) problems.push(`${label}: tail not re-derived from rig`);
  // --from-rig keeps the whole arm, so the clipboard it hangs off must survive into the flat
  // art too — this is the check that catches Android and web rendering a bare-handed dog.
  if (ITEM && !s.includes('#F6AE2D')) problems.push(`${label}: clipboard not re-derived from rig`);
  // flatten-rig drops the peek mittens; flat art must not carry them.
  if (label !== 'rig' && s.includes('rig-hand-peek')) problems.push(`${label}: peek mittens leaked into flat art`);
}
for (const f of flat) if (!fs.existsSync(path.join(ASSETS, f))) problems.push(`${f}: missing`);
// The eye checks above only run where an open eye exists, and one flat face (`idle`) has
// none. If a future rename left none of these files with an open eye, the rim and
// catchlight checks would pass by finding nothing — so require that they ran.
if (eyesChecked === 0) problems.push('no file had an open eye — the rim and catchlight checks did not run');
if (problems.length) {
  console.error('\nVERIFY FAILED:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`\nok — ${flat.length + 1} assets decorated and verified in ${ASSETS}`);
