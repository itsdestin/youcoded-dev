// Take 1C's book: a real open book lying on a desk under a lamp, with pages that bend as they turn.
// WHY it is built in 3D CSS rather than drawn: the owner asked for depth, lighting and weighty motion. A page
// that genuinely rotates around the spine, curls, shades itself and casts a shadow on the page beneath it
// reads as an object in a room; a flat wipe reads as a slideshow.
import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { EASE_IN_OUT } from '../brand';
import { P } from './take1c-ink';

export const PW = 760, PH = 980, SW = PW * 2;   // one page, and the open spread, in book units
export const BOARD = 18;                          // how far the cloth boards stick out past the paper

/** One spread of the book: flat art across both pages (1520×980), plus optional standing pop-up pieces. */
export type Spread = { id: string; Art: React.FC; Pop?: React.FC };
/** What can be printed on one side of a turning leaf. */
export type Face =
  | { kind: 'page'; spread: Spread; side: 'L' | 'R' }
  | { kind: 'cover'; Art: React.FC }                       // the outside of the front board
  | { kind: 'board'; spread: Spread };                      // the inside of the front board, its pasted-down page

// ---------- the three looks ----------
// WHY three complete looks behind one constant (owner, 2026-11-20: "i really don't like the background, the
// texture of our pages, or the style/text of the headers"): he picks by eye from the same five stills.
export const LOOK: 'a' | 'b' | 'c' = 'a';

// ---------- paper ----------
// WHY a data-URI noise tile: an SVG turbulence filter recomputed on every page every frame was the slowest
// thing on screen; as an image Chrome decodes it once and repeats it.
// `freq` may be 'fx fy' (stretched turbulence reads as fibre or wood grain); `tint` is the rgb of the speckle.
const noise = (freq: number | string, alpha: number, seed: number, size = 260, tint = '0.24 0.14 0.26') => `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' seed='${seed}' stitchTiles='stitch'/>` +
  `<feColorMatrix values='0 0 0 0 ${tint.split(' ')[0]}  0 0 0 0 ${tint.split(' ')[1]}  0 0 0 0 ${tint.split(' ')[2]}  0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`)}")`;

/** WHY a deckled outer edge as a mask: real handmade paper is torn, not cut. The mask is a rectangle whose
 *  three free edges are wobbled by turbulence; the spine edge runs off the tile so it stays straight. */
const deckleMask = (side: 'L' | 'R', amp: number) => `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='${PW}' height='${PH}'><filter id='f' x='-5%' y='-5%' width='110%' height='110%'>` +
  `<feTurbulence type='fractalNoise' baseFrequency='0.11 0.07' numOctaves='3' seed='${side === 'R' ? 7 : 19}' result='t'/>` +
  `<feDisplacementMap in='SourceGraphic' in2='t' scale='${amp}' xChannelSelector='R' yChannelSelector='G'/><feGaussianBlur stdDeviation='0.5'/></filter>` +
  `<rect x='${side === 'R' ? -40 : amp + 3}' y='${amp + 3}' width='${PW - amp - 3 + 40}' height='${PH - 2 * (amp + 3)}' fill='black' filter='url(#f)'/></svg>`)}")`;

type Look = {
  tint: string;                 // multiplied over the cream: the paper's colour under this look's light
  layers: string[];             // texture tiles multiplied over the page (grain, fibre, foxing)
  edge: string;                 // inset shadow that darkens the paper toward its edges
  gutter: number;               // strength of the curve into the spine (0..1)
  deckle: number;               // wobble of the free edges in px (0 = cut paper)
  cloth: string;                // board colour
  felt: string;                 // colour behind everything
};
const GRAIN = noise(0.85, 0.045, 3);
const MOTTLE = noise(0.012, 0.025, 11, 700);
const LOOKS: Record<'a' | 'b' | 'c', Look> = {
  // a: lamp-lit desk, paper warm and soft, a little fibre
  a: { tint: 'rgb(255,243,224)', layers: [GRAIN, noise('0.018 0.6', 0.07, 21, 400), noise('0.7 0.02', 0.035, 23, 400), MOTTLE],
    edge: 'inset 0 0 46px rgba(120,76,50,0.20), inset 0 0 8px rgba(90,56,40,0.18)', gutter: 1, deckle: 0, cloth: '#3A2145', felt: '#2A1830' },
  // b: clean studio, brighter paper with plainly visible fibre and torn edges
  b: { tint: 'rgb(255,250,243)', layers: [noise(0.9, 0.04, 3), noise('0.02 0.55', 0.10, 31, 420, '0.34 0.26 0.30'), noise('0.55 0.02', 0.09, 33, 420, '0.34 0.26 0.30'),
    noise('0.05', 0.05, 37, 300, '0.55 0.45 0.4')],
    edge: 'inset 0 0 30px rgba(110,80,70,0.16), inset 0 0 3px rgba(110,80,70,0.30)', gutter: 0.8, deckle: 12, cloth: '#3A2145', felt: '#43264F' },
  // c: heirloom, older and warmer, with a few foxing spots and heavy edge toning
  c: { tint: 'rgb(246,228,196)', layers: [noise(0.8, 0.05, 3), noise('0.02 0.5', 0.06, 41, 400), noise(0.02, 0.10, 43, 700, '0.55 0.36 0.2'), noise(0.09, 0.07, 47, 500, '0.5 0.3 0.15')],
    edge: 'inset 0 0 70px rgba(130,84,40,0.34), inset 0 0 14px rgba(100,60,30,0.28)', gutter: 1.15, deckle: 0, cloth: '#2F1A3A', felt: '#1B0F24' },
};
const T = LOOKS[LOOK];
const CLOTH = `${noise(0.6, 0.35, 5, 200)}, repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0 1px, transparent 1px 3px)`;

/** Paper colour + fibre + edge toning + the page's curve into the gutter. Rendered over the art (multiply) so ink sits in the paper. */
const PaperOver: React.FC<{ side: 'L' | 'R' }> = ({ side }) => {
  const dir = side === 'L' ? '270deg' : '90deg';   // gradient starts at the spine
  const g = T.gutter;
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: T.tint, mixBlendMode: 'multiply', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: T.layers.join(','), mixBlendMode: 'multiply', pointerEvents: 'none' }} />
      {/* WHY a lit face and a toned rim: paper is brightest where the lamp hits its middle and browns at the edges */}
      <div style={{ position: 'absolute', inset: 0, boxShadow: T.edge, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `linear-gradient(${dir}, rgba(58,28,52,${0.30 * g}) 0%, rgba(58,28,52,${0.10 * g}) 3%, rgba(58,28,52,0.0) ${8 * g}%, rgba(255,252,246,0.12) 15%, rgba(255,252,246,0) 30%, rgba(58,28,52,0) 92%, rgba(58,28,52,0.04) 100%)` }} />
    </>
  );
};

/** One page side, full size (PW×PH): the right half or left half of a spread's art. */
export const PageFace: React.FC<{ face: Face; side: 'L' | 'R' }> = ({ face, side }) => {
  if (face.kind === 'cover') return <face.Art />;
  if (face.kind === 'board') {
    // the inside of the front board: cloth turn-in around a pasted-down page
    return (
      <div style={{ position: 'absolute', inset: 0, background: T.cloth, backgroundImage: CLOTH, borderRadius: 8 }}>
        <div style={{ position: 'absolute', left: BOARD, top: BOARD, width: PW - 4, height: PH - 4, overflow: 'hidden', background: P.paper }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: SW, height: PH }}><face.spread.Art /></div>
          <PaperOver side="L" />
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: P.paper,
      ...(T.deckle ? { WebkitMaskImage: deckleMask(side, T.deckle), maskImage: deckleMask(side, T.deckle), WebkitMaskSize: '100% 100%', maskSize: '100% 100%' } : {}) }}>
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
  const strip = (k: number): React.ReactNode => {
    const phi = abs[k];
    const rad = (phi * Math.PI) / 180;
    // lamp from the upper left: a front tipping toward the right darkens; a back tipping toward the lamp brightens
    const frontShade = 0.42 * Math.max(0, Math.sin(rad)) * (phi < 90 ? 1 : 0.5);
    const backShade = 0.2 * Math.max(0, Math.cos(Math.PI - rad)) * 0.6 + 0.16 * Math.max(0, Math.sin(rad)) * (phi > 90 ? 0.3 : 1);
    const face = (f: Face, isBack: boolean) => (
      <div style={{ position: 'absolute', left: 0, top: 0, width: sw + 1.2, height: h, overflow: 'hidden', backfaceVisibility: 'hidden',
        transform: isBack ? 'rotateY(180deg)' : undefined }}>
        <div style={{ position: 'absolute', left: isBack ? -(w - (k + 1) * sw) - 1.2 : -k * sw, top: 0, width: w, height: h }}>
          <PageFace face={f} side={isBack ? 'L' : 'R'} />
        </div>
        <div style={{ position: 'absolute', inset: 0, background: `rgba(40,16,48,${isBack ? backShade : frontShade})` }} />
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

// ---------- the book on the desk ----------
/** The page block's visible edges: thin stacked lines past the page's outer edge. */
const PageEdges: React.FC<{ side: 'L' | 'R'; thick: number }> = ({ side, thick }) => (
  <div style={{ position: 'absolute', left: side === 'L' ? -thick : PW, top: 2, width: PW + thick, height: PH + thick * 0.7,
    background: `repeating-linear-gradient(${side === 'L' ? 90 : 270}deg, #E4D7C9 0 1px, #F1E7DB 1px 2.4px)`, borderRadius: side === 'L' ? '4px 0 0 4px' : '0 4px 4px 0',
    boxShadow: 'inset 0 -2px 3px rgba(60,30,50,0.25)' }} />
);

export const Boards: React.FC<{ left: boolean; right: boolean }> = ({ left, right }) => (
  <>
    {left && <div style={{ position: 'absolute', left: -BOARD, top: -BOARD, width: PW + BOARD, height: PH + BOARD * 2, background: T.cloth, backgroundImage: CLOTH,
      borderRadius: '8px 0 0 8px', boxShadow: '0 7px 0 #22122B, 0 40px 70px rgba(10,3,16,0.55), 0 12px 24px rgba(10,3,16,0.4)' }} />}
    {right && <div style={{ position: 'absolute', left: PW, top: -BOARD, width: PW + BOARD, height: PH + BOARD * 2, background: T.cloth, backgroundImage: CLOTH,
      borderRadius: '0 8px 8px 0', boxShadow: '0 7px 0 #22122B, 0 40px 70px rgba(10,3,16,0.55), 0 12px 24px rgba(10,3,16,0.4)' }} />}
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
  <div style={{ position: 'absolute', inset: 0, background: T.cloth, backgroundImage: CLOTH, borderRadius: '0 8px 8px 0', overflow: 'hidden' }}>
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

// ---------- the surface the book lies on ----------
// WHY a surface per look: the old flat purple field read as a web page background, not a place. Each look
// below gives the book something to sit ON (a plane with texture, a light falling across it, a shadow the
// book casts), all built in the same 3D space so the camera's tilt and moves reveal it.
const PLANE = { position: 'absolute' as const, left: -2400, top: -1800, width: SW + 4800, height: PH + 3600, transform: 'translateZ(-14px)' };
/** A soft shadow the book casts on the surface: offset away from the lamp (upper left). */
const CastShadow: React.FC<{ dx: number; dy: number; blur: number; a: number }> = ({ dx, dy, blur, a }) => (
  <div style={{ position: 'absolute', left: -BOARD + dx, top: -BOARD + dy, width: SW + BOARD * 2, height: PH + BOARD * 2, background: `rgba(8,2,12,${a})`, borderRadius: 14,
    filter: `blur(${blur}px)`, transform: 'translateZ(-13px)' }} />
);
/** Out-of-focus things on the desk, in book units around the book: a cup, a pencil and the corner of a closed notebook. */
const DeskObjects: React.FC = () => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: SW, height: PH, transform: 'translateZ(-12px)', filter: 'blur(7px)' }}>
    {/* the notebook: a plum cloth corner at the far left, its pages showing along one edge */}
    <div style={{ position: 'absolute', left: -430, top: 90, width: 330, height: 470, transform: 'rotate(-7deg)', background: '#4B2B5C', backgroundImage: CLOTH, borderRadius: 8,
      boxShadow: 'inset -14px 0 0 #E4D7C9, 16px 22px 40px rgba(6,2,10,0.6)' }} />
    {/* the cup: seen from above, cream ceramic with dark tea, handle to the right */}
    <div style={{ position: 'absolute', left: 1650, top: 700, width: 190, height: 190, borderRadius: '50%', background: 'radial-gradient(circle at 38% 34%, #F3E8DA, #CDBBA9)',
      boxShadow: '26px 34px 46px rgba(6,2,10,0.6)' }}>
      <div style={{ position: 'absolute', left: 20, top: 20, width: 150, height: 150, borderRadius: '50%', background: 'radial-gradient(circle at 40% 36%, #6A4430, #2C1A1A)', boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'absolute', left: 170, top: 66, width: 54, height: 56, borderRadius: '0 40px 40px 0', border: '16px solid #DCCDBB', borderLeft: 'none' }} />
    </div>
    {/* the pencil, lying across the lower left */}
    <div style={{ position: 'absolute', left: -300, top: 840, width: 520, height: 24, transform: 'rotate(-17deg)', background: 'linear-gradient(180deg, #A06ABB, #6F3F86 55%, #52296A)',
      borderRadius: '3px 0 0 3px', boxShadow: '12px 16px 22px rgba(6,2,10,0.55)' }}>
      <div style={{ position: 'absolute', right: -44, top: 0, width: 0, height: 0, borderTop: '12px solid transparent', borderBottom: '12px solid transparent', borderLeft: '44px solid #E9D3B2' }} />
    </div>
  </div>
);

const Surface: React.FC = () => {
  if (LOOK === 'a') {
    // a night desk: walnut-brown planks with grain, one warm pool of lamp light falling from the upper left
    const wood = `${noise('0.16 0.0035', 0.55, 61, 1200, '0.06 0.02 0.07')}, ${noise('0.05 0.002', 0.22, 63, 1200, '0.55 0.34 0.22')}`;
    const seams = 'repeating-linear-gradient(90deg, transparent 0 636px, rgba(8,2,10,0.7) 636px 640px, rgba(255,225,190,0.07) 640px 642px, transparent 642px 700px)';
    const pool = 'radial-gradient(ellipse 1500px 1200px at 2780px 1700px, rgba(255,205,140,0.34), rgba(255,205,140,0.10) 55%, rgba(255,205,140,0) 100%), radial-gradient(ellipse 2600px 2000px at 2900px 1900px, rgba(18,6,24,0) 25%, rgba(18,6,24,0.72) 100%)';
    return (
      <>
        <div style={{ ...PLANE, background: '#4A2C36', backgroundImage: `${pool}, ${seams}, ${wood}` }} />
        <CastShadow dx={22} dy={46} blur={44} a={0.62} />
        <CastShadow dx={4} dy={10} blur={10} a={0.45} />
        <DeskObjects />
      </>
    );
  }
  if (LOOK === 'b') {
    // a clean studio table in brand plum: smooth, lit from above, with a long soft cast shadow and a tight contact shadow
    const lit = 'radial-gradient(ellipse 1700px 1300px at 2700px 1650px, rgba(190,130,215,0.30), rgba(190,130,215,0) 100%), radial-gradient(ellipse 2800px 2100px at 2900px 1850px, rgba(20,8,28,0) 30%, rgba(20,8,28,0.60) 100%)';
    return (
      <>
        <div style={{ ...PLANE, background: '#4A2A5C', backgroundImage: `${lit}, ${noise(0.9, 0.05, 71, 300, '0.9 0.8 0.95')}` }} />
        <CastShadow dx={40} dy={64} blur={60} a={0.55} />
        <CastShadow dx={4} dy={8} blur={8} a={0.5} />
      </>
    );
  }
  // c: an aubergine leather blotter with lilac-foil stitching, on dark wood
  const leather = `${noise(0.32, 0.5, 81, 300, '0.04 0.02 0.06')}, ${noise(0.02, 0.2, 83, 700, '0.7 0.55 0.8')}`;
  return (
    <>
      <div style={{ ...PLANE, background: '#1B0F24', backgroundImage: noise('0.14 0.004', 0.4, 85, 1200, '0.5 0.35 0.45') }} />
      <div style={{ position: 'absolute', left: -250, top: -170, width: SW + 500, height: PH + 340, transform: 'translateZ(-13px)', background: '#41264F', backgroundImage: leather, borderRadius: 14,
        boxShadow: '0 30px 60px rgba(4,1,8,0.7), inset 0 0 0 2px rgba(255,255,255,0.05)' }}>
        <div style={{ position: 'absolute', inset: 34, border: '3px dashed rgba(215,182,224,0.45)', borderRadius: 8 }} />
        <div style={{ position: 'absolute', inset: 22, border: '1.5px solid rgba(215,182,224,0.28)', borderRadius: 10 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 1700px 1200px at 34% 26%, rgba(255,214,160,0.22), rgba(255,214,160,0) 100%)', borderRadius: 14 }} />
      </div>
      <CastShadow dx={26} dy={48} blur={46} a={0.62} />
      <CastShadow dx={4} dy={9} blur={9} a={0.45} />
    </>
  );
};

/** Puts the book on the desk under the camera. Children are in book units (spine at x = PW). */
export const World: React.FC<{ cam: ReturnType<typeof cameraAt>; children: React.ReactNode }> = ({ cam, children }) => (
  <AbsoluteFill style={{ perspective: PERSPECTIVE, perspectiveOrigin: '50% 46%', overflow: 'hidden', background: T.felt }}>
    <div style={{ position: 'absolute', left: 960 - PW, top: 540 - PH / 2, width: SW, height: PH, transformStyle: 'preserve-3d', transformOrigin: `${PW}px ${PH / 2}px`,
      transform: `scale(${HOME_SCALE * cam.z}) rotateX(${cam.tilt}deg) rotateZ(${cam.roll}deg) translate(${PW - cam.x}px, ${PH / 2 - cam.y}px)` }}>
      <Surface />
      {children}
    </div>
  </AbsoluteFill>
);

/** The lamp: one warm, wide pool of light from the upper left and soft falloff to the corners. `dim` 0..1 lowers it. */
export const Lamp: React.FC<{ dim?: number; warm?: number }> = ({ dim = 0, warm = 0 }) => {
  // WHY per look: a lamp-lit desk wants strong falloff, a studio wants an even light, a library wants candle warmth
  const L = { a: { fall: 0.34, glow: 0.16 }, b: { fall: 0.12, glow: 0.08 }, c: { fall: 0.42, glow: 0.2 } }[LOOK];
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* WHY a gentle falloff: a heavy vignette made the whole film a dim photo of a book */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 85% at 48% 44%, rgba(20,8,28,0) 58%, rgba(20,8,28,${L.fall * 0.5}) 84%, rgba(16,6,22,${L.fall}) 100%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 70% at 36% 26%, rgba(255,236,208,${L.glow + warm * 0.08}) 0%, rgba(255,236,208,0) 70%)`, mixBlendMode: 'soft-light' }} />
      {/* WHY only the edges: a whole-frame dim turned the cream page grey, which read as a rendering fault */}
      {dim > 0 && <AbsoluteFill style={{ background: `radial-gradient(ellipse 62% 66% at 52% 46%, rgba(18,8,26,0) 50%, rgba(18,8,26,${dim * 0.3}) 100%)` }} />}
    </AbsoluteFill>
  );
};
