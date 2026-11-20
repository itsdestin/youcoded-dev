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

// ---------- paper ----------
// WHY a data-URI noise tile: an SVG turbulence filter recomputed on every page every frame was the slowest
// thing on screen; as an image Chrome decodes it once and repeats it.
const noise = (freq: number, alpha: number, seed: number, size = 260) => `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' seed='${seed}' stitchTiles='stitch'/>` +
  `<feColorMatrix values='0 0 0 0 0.24  0 0 0 0 0.14  0 0 0 0 0.26  0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`)}")`;
const GRAIN = noise(0.85, 0.08, 3);
const MOTTLE = noise(0.012, 0.06, 11, 700);
const CLOTH = `${noise(0.6, 0.35, 5, 200)}, repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0 1px, transparent 1px 3px)`;

/** Paper colour + grain + the page's curve into the gutter. Rendered over the art (multiply) so ink sits in the paper. */
const PaperOver: React.FC<{ side: 'L' | 'R' }> = ({ side }) => {
  const dir = side === 'L' ? '270deg' : '90deg';   // gradient starts at the spine
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `${GRAIN}, ${MOTTLE}`, mixBlendMode: 'multiply', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `linear-gradient(${dir}, rgba(58,28,52,0.34) 0%, rgba(58,28,52,0.12) 3.5%, rgba(58,28,52,0.02) 9%, rgba(255,250,240,0.10) 15%, rgba(255,250,240,0) 30%, rgba(58,28,52,0) 88%, rgba(58,28,52,0.07) 100%)` }} />
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
    {left && <div style={{ position: 'absolute', left: -BOARD, top: -BOARD, width: PW + BOARD, height: PH + BOARD * 2, background: '#3A2145', backgroundImage: CLOTH,
      borderRadius: '8px 0 0 8px', boxShadow: '0 7px 0 #22122B, 0 40px 70px rgba(10,3,16,0.55), 0 12px 24px rgba(10,3,16,0.4)' }} />}
    {right && <div style={{ position: 'absolute', left: PW, top: -BOARD, width: PW + BOARD, height: PH + BOARD * 2, background: '#3A2145', backgroundImage: CLOTH,
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
export type Shot = { t: number; x: number; y: number; z: number; tilt?: number; roll?: number };
/** Where the camera looks (book units), how close (1 = the home framing), its tilt and roll, eased between keys. */
export const cameraAt = (keys: Shot[], t: number) => {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const A = keys[i], B = keys[Math.min(i + 1, keys.length - 1)];
  const k = B.t === A.t ? 1 : interpolate(t, [A.t, B.t], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT });
  const mix = (a: number, b: number) => a + (b - a) * k;
  // WHY zoom is interpolated in log space: a push from 1x to 2x then feels as steady as 2x to 4x
  const z = Math.exp(mix(Math.log(A.z), Math.log(B.z)));
  return { x: mix(A.x, B.x), y: mix(A.y, B.y), z, tilt: mix(A.tilt ?? 16, B.tilt ?? 16), roll: mix(A.roll ?? 0, B.roll ?? 0) };
};

export const PERSPECTIVE = 3400;
export const HOME_SCALE = 0.87;   // the open book at the home framing fills ~68% of the width
/** Puts the book on the desk under the camera. Children are in book units (spine at x = PW). */
export const World: React.FC<{ cam: ReturnType<typeof cameraAt>; children: React.ReactNode }> = ({ cam, children }) => (
  <AbsoluteFill style={{ perspective: PERSPECTIVE, perspectiveOrigin: '50% 46%', overflow: 'hidden', background: '#1A0D22' }}>
    <div style={{ position: 'absolute', left: 960 - PW, top: 540 - PH / 2, width: SW, height: PH, transformStyle: 'preserve-3d', transformOrigin: `${PW}px ${PH / 2}px`,
      transform: `scale(${HOME_SCALE * cam.z}) rotateX(${cam.tilt}deg) rotateZ(${cam.roll}deg) translate(${PW - cam.x}px, ${PH / 2 - cam.y}px)` }}>
      {/* the desk: dark plum linen that recedes under the lamp */}
      <div style={{ position: 'absolute', left: -2400, top: -1800, width: SW + 4800, height: PH + 3600, background: '#24122D', backgroundImage: CLOTH, transform: 'translateZ(-14px)' }} />
      {children}
    </div>
  </AbsoluteFill>
);

/** The lamp: one warm, wide pool of light from the upper left and soft falloff to the corners. `dim` 0..1 lowers it. */
export const Lamp: React.FC<{ dim?: number; warm?: number }> = ({ dim = 0, warm = 0 }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse 72% 78% at 44% 40%, rgba(20,8,28,0) 50%, rgba(20,8,28,0.34) 84%, rgba(16,6,22,0.62) 100%)' }} />
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 60% at 36% 26%, rgba(255,226,190,${0.16 + warm * 0.1}) 0%, rgba(255,228,196,0) 70%)`, mixBlendMode: 'soft-light' }} />
    {/* WHY only the edges: a whole-frame dim turned the cream page grey, which read as a rendering fault */}
    {dim > 0 && <AbsoluteFill style={{ background: `radial-gradient(ellipse 58% 62% at 52% 46%, rgba(18,8,26,0) 45%, rgba(18,8,26,${dim * 0.55}) 100%)` }} />}
  </AbsoluteFill>
);
