// Take 1C's book: a real open book lying on a desk under a lamp, with pages that bend as they turn.
// WHY it is built in 3D CSS rather than drawn: the owner asked for depth, lighting and weighty motion. A page
// that genuinely rotates around the spine, curls, shades itself and casts a shadow on the page beneath it
// reads as an object in a room; a flat wipe reads as a slideshow.
import React from 'react';
import { AbsoluteFill, getInputProps, interpolate, useCurrentFrame } from 'remotion';
import { EASE_IN_OUT, FPS } from '../brand';
import { lin, P } from './take1c-ink';
import { CLOSE_DUR, Q, TURN } from './take1c-time';

export const PW = 760, PH = 980, SW = PW * 2;   // one page, and the open spread, in book units
export const BOARD = 18;                          // how far the cloth boards stick out past the paper

/** One spread of the book: flat art across both pages (1520×980), plus optional standing pop-up pieces. */
export type Spread = { id: string; Art: React.FC; Pop?: React.FC };
/** What can be printed on one side of a turning leaf. */
export type Face =
  | { kind: 'page'; spread: Spread; side: 'L' | 'R' }
  | { kind: 'cover'; Art: React.FC }                       // the outside of the front board
  | { kind: 'board'; spread: Spread };                      // the inside of the front board, its pasted-down page

// ---------- paper ----------
// WHY a data-URI noise tile: an SVG turbulence filter recomputed on every page every frame was the slowest
// thing on screen; as an image Chrome decodes it once and repeats it.
const noise = (freq: number, alpha: number, seed: number, size = 260) => `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' seed='${seed}' stitchTiles='stitch'/>` +
  `<feColorMatrix values='0 0 0 0 0.24  0 0 0 0 0.14  0 0 0 0 0.26  0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`)}")`;
// WHY so faint and so fine (owner, round three: "i really don't like ... the texture of our pages"): the old
// grain plus a large blotchy mottle read as a printed texture laid over the art. Good uncoated book paper
// shows almost no pattern at viewing distance, only a fine tooth up close, so there is one very fine fibre
// layer and no mottle at all.
const FIBRE = noise(1.6, 0.03, 3, 240);
const CLOTH = `${noise(0.9, 0.22, 5, 200)}, repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 2.5px), repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0 1px, transparent 1px 2.5px)`;

/** Paper tooth + the page's curve into the gutter. Rendered over the art (multiply) so ink sits in the paper. */
const PaperOver: React.FC<{ side: 'L' | 'R' }> = ({ side }) => {
  const dir = side === 'L' ? '270deg' : '90deg';   // gradient starts at the spine
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: FIBRE, mixBlendMode: 'multiply', pointerEvents: 'none' }} />
      {/* WHY these stops: a real page dips into a tight dark crease at the spine, rises over a soft shoulder that
          catches the light (the brightest band, ~10-20% in), lies flat across the middle, and turns down a hair
          at its outer edge. Multiplied, so the ink darkens into the gutter with the paper instead of floating on it. */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'multiply',
        background: `linear-gradient(${dir}, rgba(92,58,84,0.42) 0%, rgba(120,84,108,0.22) 1.2%, rgba(160,128,146,0.12) 3.5%, rgba(205,184,192,0.05) 7%, rgba(255,255,255,0) 12%, rgba(255,255,255,0) 94%, rgba(200,180,186,0.10) 100%)` }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `linear-gradient(${dir}, rgba(255,253,249,0) 9%, rgba(255,253,249,0.16) 15%, rgba(255,253,249,0.05) 26%, rgba(255,253,249,0) 34%)` }} />
      {/* the page bows very slightly from head to tail: a breath of shade at the top and foot, never visible as a band */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'multiply',
        background: 'linear-gradient(180deg, rgba(214,198,204,0.22) 0%, rgba(255,255,255,0) 7%, rgba(255,255,255,0) 90%, rgba(214,198,204,0.26) 100%)' }} />
    </>
  );
};

/** One page side, full size (PW×PH): the right half or left half of a spread's art. */
export const PageFace: React.FC<{ face: Face; side: 'L' | 'R' }> = ({ face, side }) => {
  if (face.kind === 'cover') return <face.Art />;
  if (face.kind === 'board') {
    // the inside of the front board: cloth turn-in around a pasted-down page
    return (
      <div style={{ position: 'absolute', inset: 0, background: '#3A2145', backgroundImage: CLOTH, borderRadius: 8 }}>
        <div style={{ position: 'absolute', left: BOARD, top: BOARD, width: PW - 4, height: PH - 4, overflow: 'hidden', background: P.paper }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: SW, height: PH }}><face.spread.Art /></div>
          <PaperOver side="L" />
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: P.paper }}>
      <div style={{ position: 'absolute', left: face.side === 'R' ? -PW : 0, top: 0, width: SW, height: PH }}><face.spread.Art /></div>
      <PaperOver side={side} />
    </div>
  );
};

// ---------- a turning leaf ----------
/** How bent the leaf is mid-turn: the free edge leads, like a page lifted by its corner. */
const stripAngles = (p: number, n: number, bendMax: number) => {
  const theta = 180 * p;
  const bend = bendMax * Math.sin(Math.PI * p);
  const first = theta - bend / 2;
  return Array.from({ length: n }, (_, k) => (k === 0 ? first : bend / (n - 1)));
};

type LeafProps = { front: Face; back: Face; p: number; n?: number; bend?: number; w?: number; h?: number; dx?: number; dy?: number; lift?: number };
/** A leaf hinged at the spine. p = 0 lies on the right (front up), p = 1 lies on the left (back up).
 *  WHY strips: one flat card rotating looks like a door; a chain of narrow strips, each tipped a little more
 *  than the last, bends like paper. */
export const Leaf: React.FC<LeafProps> = ({ front, back, p, n = 10, bend = 58, w = PW, h = PH, dx = 0, dy = 0, lift = 0.8 }) => {
  const rel = stripAngles(p, n, bend);
  const sw = w / n;
  const abs: number[] = [];
  rel.forEach((r, k) => abs.push(k === 0 ? r : abs[k - 1] + r));
  // lamp from the upper left: a front tipping toward the right darkens; a back tipping toward the lamp brightens
  // WHY softer (0.32, was 0.42): mid-turn the whole leaf went a flat grey that read as a dirty card, not paper
  const frontShadeAt = (phi: number) => 0.32 * Math.max(0, Math.sin((phi * Math.PI) / 180)) * (phi < 90 ? 1 : 0.5);
  const backShadeAt = (phi: number) => { const rad = (phi * Math.PI) / 180; return 0.12 * Math.max(0, Math.cos(Math.PI - rad)) + 0.14 * Math.max(0, Math.sin(rad)) * (phi > 90 ? 0.3 : 1); };
  // WHY each strip's shade is a gradient from its left seam to its right seam (the average with its neighbour)
  // rather than one flat tint: flat tints stepped from strip to strip, so a turning page showed vertical stripes.
  const seam = (fn: (phi: number) => number, k: number) => {
    const here = fn(abs[k]);
    const prev = k > 0 ? fn(abs[k - 1]) : here, next = k + 1 < n ? fn(abs[k + 1]) : here;
    return [(prev + here) / 2, (here + next) / 2];
  };
  const strip = (k: number): React.ReactNode => {
    const [fl, fr] = seam(frontShadeAt, k), [bl, br] = seam(backShadeAt, k);
    const face = (f: Face, isBack: boolean) => (
      <div style={{ position: 'absolute', left: 0, top: 0, width: sw + 1.2, height: h, overflow: 'hidden', backfaceVisibility: 'hidden',
        transform: isBack ? 'rotateY(180deg)' : undefined }}>
        <div style={{ position: 'absolute', left: isBack ? -(w - (k + 1) * sw) - 1.2 : -k * sw, top: 0, width: w, height: h }}>
          <PageFace face={f} side={isBack ? 'L' : 'R'} />
        </div>
        {/* the back is mirrored (rotateY 180), so its spine-side seam is on its local right */}
        <div style={{ position: 'absolute', inset: 0, background: isBack
          ? `linear-gradient(270deg, rgba(40,16,48,${bl}), rgba(40,16,48,${br}))`
          : `linear-gradient(90deg, rgba(40,16,48,${fl}), rgba(40,16,48,${fr}))` }} />
      </div>
    );
    return (
      <div style={{ position: 'absolute', left: k === 0 ? 0 : sw, top: 0, width: sw, height: h, transformOrigin: '0 50%',
        transform: `rotateY(${-rel[k]}deg)`, transformStyle: 'preserve-3d' }}>
        {face(front, false)}
        {face(back, true)}
        {k + 1 < n && strip(k + 1)}
      </div>
    );
  };
  return (
    <div style={{ position: 'absolute', left: PW + dx, top: dy, width: w, height: h, transformStyle: 'preserve-3d',
      transform: `translateZ(${lift + Math.sin(Math.PI * p) * 6}px)` }}>
      {strip(0)}
    </div>
  );
};

/** The shadow a lifting leaf throws on the page beneath it. `p` as in Leaf. */
export const LeafShadow: React.FC<{ p: number; side: 'L' | 'R' }> = ({ p, side }) => {
  const phi = 180 * p;
  if (p <= 0 || p >= 1) return null;
  if (side === 'R' && phi >= 92) return null;
  if (side === 'L' && phi <= 88) return null;
  const s = Math.sin((phi * Math.PI) / 180);
  const tip = Math.abs(Math.cos((phi * Math.PI) / 180)) * 100;        // % of the page from the spine
  const reach = tip + 6 + 30 * s;
  const a = 0.38 * s;
  const g = `linear-gradient(${side === 'R' ? '90deg' : '270deg'}, rgba(36,12,40,${a * 0.9}) 0%, rgba(36,12,40,${a}) ${Math.max(0, tip - 1)}%, rgba(36,12,40,${a * 0.45}) ${tip + 3}%, rgba(36,12,40,0) ${reach}%)`;
  return <div style={{ position: 'absolute', left: side === 'R' ? PW : 0, top: 0, width: PW, height: PH, background: g, pointerEvents: 'none', transform: 'translateZ(0.3px)' }} />;
};

// ---------- the book as an object ----------
/** The page block's visible edges: thin stacked leaves past the page's outer edge.
 *  WHY finer and warmer than before: the old 2.4px stripes read as a ruled pattern; real page edges are a fine,
 *  almost-solid cream that only resolves into leaves up close, and they fall into shade toward the foot. */
const PageEdges: React.FC<{ side: 'L' | 'R'; thick: number }> = ({ side, thick }) => (
  <div style={{ position: 'absolute', left: side === 'L' ? -thick : PW, top: 2, width: PW + thick, height: PH + thick * 0.7,
    backgroundImage: `linear-gradient(180deg, rgba(90,60,80,0) 70%, rgba(90,60,80,0.16) 100%), repeating-linear-gradient(${side === 'L' ? 90 : 270}deg, #E9DFD2 0 0.7px, #F6EFE5 0.7px 1.7px)`,
    borderRadius: side === 'L' ? '5px 0 0 5px' : '0 5px 5px 0',
    boxShadow: 'inset 0 -2px 2px rgba(70,40,60,0.22)' }} />
);

// WHY the boards keep only a short, close shadow: the book now floats above a colour field, and its long soft
// shadow is cast on that field by FloatShadow (below), which moves with the camera. Here the board just has its
// thickness (the dark lip), a hairline catch-light on its top edge, and a touch of close occlusion.
const BOARD_SHADOW = '0 6px 0 #22122B, 0 7px 0 rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.10), 0 14px 22px rgba(30,10,40,0.28)';
export const Boards: React.FC<{ left: boolean; right: boolean }> = ({ left, right }) => (
  <>
    {left && <div style={{ position: 'absolute', left: -BOARD, top: -BOARD, width: PW + BOARD, height: PH + BOARD * 2, background: '#3A2145', backgroundImage: CLOTH,
      borderRadius: '8px 0 0 8px', boxShadow: BOARD_SHADOW }} />}
    {right && <div style={{ position: 'absolute', left: PW, top: -BOARD, width: PW + BOARD, height: PH + BOARD * 2, background: '#3A2145', backgroundImage: CLOTH,
      borderRadius: '0 8px 8px 0', boxShadow: BOARD_SHADOW }} />}
  </>
);
export const Edges: React.FC<{ left: boolean; right: boolean }> = ({ left, right }) => (
  <>{left && <PageEdges side="L" thick={7} />}{right && <PageEdges side="R" thick={9} />}</>
);

/** A flat page lying on its side of the spine. */
export const BasePage: React.FC<{ face: Face; side: 'L' | 'R' }> = ({ face, side }) => (
  <div style={{ position: 'absolute', left: side === 'L' ? 0 : PW, top: 0, width: PW, height: PH }}>
    <PageFace face={face} side={side} />
  </div>
);

/** The cover's outside: plum cloth, a blind-stamped frame and a small foil emblem. */
export const coverArt = (Emblem: React.FC): React.FC => () => (
  <div style={{ position: 'absolute', inset: 0, background: '#3A2145', backgroundImage: CLOTH, borderRadius: '0 8px 8px 0', overflow: 'hidden' }}>
    {/* blind-stamped frame: a dark groove with a light lip beneath it */}
    <div style={{ position: 'absolute', inset: 46, border: '3px solid rgba(20,8,26,0.55)', borderRadius: 6, boxShadow: '0 2px 0 rgba(255,255,255,0.07), inset 0 2px 0 rgba(255,255,255,0.05)' }} />
    <div style={{ position: 'absolute', inset: 58, border: '1.5px solid rgba(20,8,26,0.4)', borderRadius: 4 }} />
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Emblem /></div>
    {/* the spine hinge groove */}
    <div style={{ position: 'absolute', left: 22, top: 0, bottom: 0, width: 6, background: 'linear-gradient(90deg, rgba(10,4,14,0.45), rgba(255,255,255,0.05))' }} />
  </div>
);

// ---------- camera ----------
/** `cut`: the camera holds the previous key and jumps to this one on its frame (a hard cut, no move). */
export type Shot = { t: number; x: number; y: number; z: number; tilt?: number; roll?: number; cut?: boolean };
/** Where the camera looks (book units), how close (1 = the home framing), its tilt and roll, eased between keys. */
export const cameraAt = (keys: Shot[], t: number) => {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const A = keys[i], B = keys[Math.min(i + 1, keys.length - 1)];
  // WHY a cut key holds still until its frame: a hard cut must not be preceded by a drift toward the next shot
  const k = B.cut && t < B.t ? 0 : B.t === A.t ? 1 : interpolate(t, [A.t, B.t], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT });
  const mix = (a: number, b: number) => a + (b - a) * k;
  // WHY zoom is interpolated in log space: a push from 1x to 2x then feels as steady as 2x to 4x
  const z = Math.exp(mix(Math.log(A.z), Math.log(B.z)));
  return { x: mix(A.x, B.x), y: mix(A.y, B.y), z, tilt: mix(A.tilt ?? 16, B.tilt ?? 16), roll: mix(A.roll ?? 0, B.roll ?? 0) };
};

export const PERSPECTIVE = 3400;
export const HOME_SCALE = 0.87;   // the open book at the home framing fills ~68% of the width

// ---------- what the book floats over ----------
// WHY a colour field from the posters instead of a desk (owner, latest: "the background in storybook also still
// feels extremely flat ... maybe floating over one of our poster gradients"): the felt desk was one flat purple.
// The book now hovers above the same soft wash the posters use (brand colours only, no blue), lit from the upper
// left like the pages, with a long soft shadow cast onto it and a fine moving film grain so it never bands.
// Three looks were built so the owner can choose; 'a' is the one the film uses. A still of another look:
//   npx remotion still src/index.ts take1c out.png --frame=N --props='{"bookLook":"b"}'
export type BookLook = 'a' | 'b' | 'c';
const LOOK: BookLook = (() => { try { const v = (getInputProps() as { bookLook?: string }).bookLook; return v === 'b' || v === 'c' ? v : 'a'; } catch { return 'a'; } })();

type FieldStyle = { quiet: string; bloom: string; light: string; shade: string; shadowA: number };
const FIELDS: Record<BookLook, FieldStyle> = {
  // a, "dusk lilac" (the one the film uses): the poster wash taken a few steps deeper, so the cream pages glow
  // against it and the book clearly floats. Before "wonderful" it is a quieter grey-lilac; on "wonderful" the
  // poster's pink-to-lilac warmth blooms in from the lower right corner, opposite the light.
  a: {
    quiet: 'linear-gradient(160deg, #DDD2E0 0%, #C9BBCF 55%, #B8A8C0 100%)',
    bloom: 'radial-gradient(120% 100% at 100% 100%, #E5A3CB 0%, #D3AEE3 40%, rgba(205,170,224,0) 82%), linear-gradient(160deg, #E8D8F1 0%, #D2B8E0 60%, #C3A3D5 100%)',
    light: 'rgba(255,248,252,0.40)', shade: 'rgba(60,28,74,0.22)', shadowA: 0.42,
  },
  // b, "night wash": the dark poster field, plum-black with a deep magenta-plum glow low on the right
  b: {
    quiet: 'radial-gradient(160% 130% at 100% 100%, #2E1C3A 0%, #22142D 40%, #180D22 75%, #140B1E 100%)',
    bloom: 'radial-gradient(170% 120% at 100% 100%, #55236A 0%, #3A1A52 30%, #24113A 58%, #140B1E 90%)',
    light: 'rgba(200,170,220,0.10)', shade: 'rgba(6,2,10,0.35)', shadowA: 0.6,
  },
  // c, "lavender wash": the light poster field, airier and paler. Before "something wonderful" the lavender is held back toward a
  // quiet grey-lilac (the book's colourless chapters); on "wonderful" the poster's pink-to-lilac warmth blooms in
  // from the lower right corner, opposite the light.
  c: {
    quiet: 'radial-gradient(140% 120% at 16% 6%, #FCFAFC 0%, #F1ECF2 38%, #E2D9E6 78%, #D6CBDC 100%)',
    bloom: 'radial-gradient(120% 95% at 100% 100%, #F1B9DC 0%, #E7C3EE 34%, rgba(242,232,248,0) 78%), radial-gradient(140% 120% at 16% 6%, #FEFCFF 0%, #F7F0FB 40%, #ECDDF4 100%)',
    light: 'rgba(255,255,255,0.35)', shade: 'rgba(70,40,84,0.20)', shadowA: 0.42,
  },
};

// WHY a moving grain: a smooth gradient on video bands into visible steps, and a still noise pattern looks like
// a dirty lens. A fine luminance-only grain, shifted every frame, reads as film and hides the steps.
const GRAIN_TILE = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7' stitchTiles='stitch'/>" +
  "<feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>")}")`;
const grainShift = (frame: number) => { const h = Math.sin(frame * 12.9898) * 43758.5453; const r = h - Math.floor(h); return [Math.floor(r * 256), Math.floor(((r * 7.31) % 1) * 256)]; };

/** How far the film has moved from its colourless chapters into colour: 0 before "wonderful", 1 after. */
const bloomAt = (t: number) => lin(t, Q.wonderful - 0.1, Q.wonderful + 1.4, EASE_IN_OUT);

/** The colour field, in screen space behind the book, drifting a little against the camera for depth. */
const Field: React.FC<{ cam: ReturnType<typeof cameraAt>; t: number }> = ({ cam, t }) => {
  const F = FIELDS[LOOK];
  // WHY 6% of the book's own on-screen movement: the field reads as far below the book, so it slides less
  const k = HOME_SCALE * cam.z * 0.06;
  const px = -(cam.x - 760) * k, py = -(cam.y - 500) * k;
  const sc = 1 + 0.05 * Math.log(Math.max(0.5, cam.z));
  const bloom = 0.45 + 0.55 * bloomAt(t);   // never fully quiet, so the field is never a flat fill
  return (
    <div style={{ position: 'absolute', left: '-10%', top: '-10%', width: '120%', height: '120%', transform: `translate(${px}px, ${py}px) scale(${sc})` }}>
      <AbsoluteFill style={{ background: F.quiet }} />
      <AbsoluteFill style={{ background: F.bloom, opacity: bloom }} />
      {/* the light from the upper left falls across the field too, and fades into shade at the far corner */}
      <AbsoluteFill style={{ background: `radial-gradient(70% 60% at 22% 14%, ${F.light} 0%, rgba(255,255,255,0) 100%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(120% 110% at 40% 30%, rgba(0,0,0,0) 55%, ${F.shade} 100%)` }} />
    </div>
  );
};

/** The book's shadow on the field: two soft layers set well below the book in 3D, so perspective alone makes
 *  them slide and swell against the book as the camera moves (the parallax that says "floating"). */
const FloatShadow: React.FC<{ a: number; t: number }> = ({ a, t }) => {
  // WHY read from the clock: while the book shuts, its left half swings away and only the right half casts
  const shut = lin(t, TURN.close + CLOSE_DUR * 0.15, TURN.close + CLOSE_DUR * 0.85, EASE_IN_OUT);
  const x0 = -BOARD + (PW + BOARD) * shut, w = SW + BOARD * 2 - (PW + BOARD) * shut;
  // WHY the box sits far off to the left and only its shadow is thrown back under the book: a solid box would
  // show its own hard edge where the offset shadow peeks out below the book; the shadow alone is soft all round.
  const OFF = 6000;
  const layer = (z: number, dx: number, dy: number, blur: number, spread: number, alpha: number) => (
    <div style={{ position: 'absolute', left: x0 - OFF, top: -BOARD, width: w, height: PH + BOARD * 2, borderRadius: 30,
      boxShadow: `${OFF + dx}px ${dy}px ${blur}px ${spread}px rgba(46,16,60,${alpha})`, transform: `translateZ(${z}px)` }} />
  );
  return (
    <>
      {layer(-320, 90, 150, 260, 10, a * 0.55)}   {/* the wide, soft umbra far below */}
      {layer(-110, 34, 56, 90, -6, a * 0.75)}      {/* a closer, firmer shadow that gives the book its weight */}
    </>
  );
};

/** Floats the book above its colour field under the camera. Children are in book units (spine at x = PW). */
export const World: React.FC<{ cam: ReturnType<typeof cameraAt>; children: React.ReactNode }> = ({ cam, children }) => {
  const t = useCurrentFrame() / FPS;
  return (
    <AbsoluteFill style={{ perspective: PERSPECTIVE, perspectiveOrigin: '50% 46%', overflow: 'hidden', background: '#E9E1EC' }}>
      <Field cam={cam} t={t} />
      <div style={{ position: 'absolute', left: 960 - PW, top: 540 - PH / 2, width: SW, height: PH, transformStyle: 'preserve-3d', transformOrigin: `${PW}px ${PH / 2}px`,
        transform: `scale(${HOME_SCALE * cam.z}) rotateX(${cam.tilt}deg) rotateZ(${cam.roll}deg) translate(${PW - cam.x}px, ${PH / 2 - cam.y}px)` }}>
        <FloatShadow a={FIELDS[LOOK].shadowA} t={t} />
        {children}
      </div>
    </AbsoluteFill>
  );
};

/** The light over everything: a soft warm lift from the upper left, gentle falloff, and film grain.
 *  `dim` 0..1 lowers the edges (the whisper); `warm` 0..1 lifts the light (from "wonderful"). */
export const Lamp: React.FC<{ dim?: number; warm?: number }> = ({ dim = 0, warm = 0 }) => {
  const frame = useCurrentFrame();
  const [gx, gy] = grainShift(frame);
  const night = LOOK === 'b';
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* WHY a gentle falloff (~10%): a heavy vignette made the whole film a dim photo of a book */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 85% at 48% 44%, rgba(30,12,40,0) 64%, rgba(30,12,40,0.05) 86%, rgba(24,8,32,0.11) 100%)' }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 70% at 36% 26%, rgba(255,242,226,${0.10 + warm * 0.08}) 0%, rgba(255,242,226,0) 70%)`, mixBlendMode: 'soft-light' }} />
      {/* WHY only the edges: a whole-frame dim turned the cream page grey, which read as a rendering fault */}
      {/* WHY three stops from 30%: a two-stop ring starting at 50% printed a visible oval on the empty page */}
      {dim > 0 && <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 80% at 52% 46%, rgba(30,12,40,0) 30%, rgba(30,12,40,${dim * (night ? 0.12 : 0.09)}) 65%, rgba(30,12,40,${dim * (night ? 0.3 : 0.24)}) 100%)` }} />}
      <AbsoluteFill style={{ backgroundImage: GRAIN_TILE, backgroundPosition: `${gx}px ${gy}px`, mixBlendMode: 'overlay', opacity: night ? 0.10 : 0.07 }} />
    </AbsoluteFill>
  );
};
