// Take 1: the storybook world. Geometry (where every tower, house and window is) and how each layer is
// drawn. Nothing here knows about the script: take1.tsx decides WHEN things happen and passes plain
// numbers (how far night has turned to morning, how lit, which windows have turned) into these drawings.
import React from 'react';
import { AppWin, LAYOUTS, THEMES, Theme } from './take1-apps';

// ---------- camera ----------
// WHY a parallax camera: the world is a stack of cut-paper layers at different depths (k = 0 far away,
// 1 = the town, >1 the foreground). One camera (a point and a zoom) moves every layer by its depth, so a
// slow move reads as real depth, like a multiplane storybook camera.
export const CX = 960, CY = 540;
export type Cam = { cx: number; cy: number; z: number };
const layerT = (c: Cam, k: number) => ({ s: 1 + (c.z - 1) * k, x: CX + (c.cx - CX) * k, y: CY + (c.cy - CY) * k });
export const layerTransform = (c: Cam, k: number) => { const l = layerT(c, k); return `translate(${CX} ${CY}) scale(${l.s}) translate(${-l.x} ${-l.y})`; };
/** Where a point on layer k lands on screen, and how much that layer is scaled. */
export const project = (c: Cam, k: number, x: number, y: number) => { const l = layerT(c, k); return { x: CX + (x - l.x) * l.s, y: CY + (y - l.y) * l.s, s: l.s }; };
/** The camera that puts point (x, y) of layer k in the middle of the frame. */
export const aim = (k: number, x: number, y: number, z: number): Cam => ({ cx: CX + (x - CX) / k, cy: CY + (y - CY) / k, z });

// WHY the foreground is only a little nearer than the town (1.05): a nearer layer rises faster when the
// camera tilts down, and at 1.3 it covered the bottom of every close-up as a dead band.
export const K = { sky: 0.08, cloud: 0.16, hills2: 0.2, hills: 0.3, far: 0.45, towers: 0.6, back: 0.8, mid: 0.9, front: 1, fore: 1.05 };

// ---------- seeded randomness (the town must be identical on every frame and every render) ----------
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---------- colour ----------
const hex = (h: string) => h.startsWith('rgb') ? h.slice(4, -1).split(',').map(Number) : [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** Mix two colours: 0 = a, 1 = b. */
export const mix = (a: string, b: string, p: number) => {
  const A = hex(a), B = hex(b); const q = Math.max(0, Math.min(1, p));
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * q)).join(',')})`;
};
/** A colour that travels night → the turn → pre-dawn → morning as `d` goes 0 → 1. */
const day4 = (c: [string, string, string, string], d: number) => {
  const stops = [0, 0.35, 0.7, 1];
  let i = 0; while (i < 2 && d > stops[i + 1]) i++;
  return mix(c[i], c[i + 1], (d - stops[i]) / (stops[i + 1] - stops[i]));
};
// WHY one palette driven by a single "dawn" number: the whole film travels from plum night to the brand's
// light morning, and every layer has to arrive together or the picture looks pasted. Night values are
// lifted from the first cut (it was murky); morning values are the light palette (lavender sky, pink-purple
// toward the horizon, like the posters' colour field), with the towers ending as pale ghosts.
export const palette = (d: number) => ({
  skyTop: day4(['#170C27', '#24123D', '#8A74BC', '#E8DBF5'], d),
  skyMid: day4(['#2A1640', '#41215E', '#BB9DD6', '#F7F0FB'], d),
  skyLow: day4(['#482657', '#74408A', '#E9B9DD', '#F6DCEE'], d),
  horizon: day4(['#74397F', '#B9629F', '#F6C3D7', '#F1BCDC'], d),
  cloud: day4(['#2C1A3B', '#43285A', '#D9C2E6', '#FFFFFF'], d),
  cloudEdge: day4(['#6A4C80', '#9A62AE', '#F6E6F7', '#FFFFFF'], d),
  hill2: day4(['#341E44', '#4E2C64', '#D2B5E2', '#EBDCF3'], d),
  hill: day4(['#29173A', '#3F2453', '#C3A2D7', '#E2CCEE'], d),
  far: day4(['#311D41', '#4A2D63', '#CDB3E0', '#EADDF3'], d),
  towerDark: day4(['#180C24', '#26143A', '#9E86B8', '#DED0EA'], d),
  towerLit: day4(['#2E1C3F', '#43265D', '#B8A0CF', '#ECE2F4'], d),
  rim: day4(['#8A68A3', '#F0A3D2', '#FFE6F4', '#FFFFFF'], d),
  ink: day4(['#0B0512', '#150A22', '#5F4676', '#9A82B2'], d),
  wall: day4(['#352043', '#3F2650', '#AE96C3', '#D2C1DF'], d),
  roof: day4(['#1E1029', '#291638', '#7E6098', '#9E85B6'], d),
  ground: day4(['#1E1029', '#2A1739', '#BBA0CE', '#E8D4EE'], d),
  fore: day4(['#140A1D', '#211130', '#957AB0', '#C2A4D6'], d),
  smoke: day4(['#5E4873', '#7B5A92', '#F4ECF8', '#FFFFFF'], d),
  winOff: day4(['#241632', '#2F1C42', '#9C86B2', '#D9CCE5'], d),
  stars: 1 - Math.min(1, d / 0.55),
  moon: 1 - Math.min(0.85, Math.max(0, d - 0.3) * 1.3),
});
export type Pal = ReturnType<typeof palette>;
export const COLD = '#DCD3EA';

// ---------- towers: fairytale keeps, slightly crooked, with turrets, flags and hoisting contraptions ----------
export type TowerDef = {
  x: number; w: number; h: number; crook: number; crown: 'cone' | 'lantern' | 'battlement'; arm: -1 | 1;
  turret: { v: number; side: -1 | 1 }; wins: [number, number][];
};
export const TOWER_BASE = 905;
export const TOWERS: TowerDef[] = [
  { x: 690, w: 120, h: 600, crook: 22, crown: 'cone', arm: -1, turret: { v: 0.56, side: 1 },
    wins: [[0.1, -0.2], [0.22, 0.25], [0.35, -0.3], [0.47, 0.1], [0.62, -0.15], [0.75, 0.3], [0.86, -0.05]] },
  { x: 1010, w: 150, h: 700, crook: -12, crown: 'lantern', arm: -1, turret: { v: 0.46, side: 1 },
    wins: [[0.08, 0.2], [0.18, -0.3], [0.29, 0.1], [0.4, -0.15], [0.52, 0.3], [0.63, -0.25], [0.74, 0.05], [0.86, 0.25]] },
  { x: 1330, w: 112, h: 570, crook: -24, crown: 'battlement', arm: 1, turret: { v: 0.62, side: -1 },
    wins: [[0.12, 0.15], [0.25, -0.25], [0.38, 0.2], [0.5, -0.1], [0.66, 0.25], [0.8, -0.2]] },
];
/** Key points of a tower at growth g (1 = normal; "hubris" stretches them taller). */
export const towerGeo = (d: TowerDef, g: number) => {
  const base = TOWER_BASE, top = base - d.h * g;
  const v = (y: number) => Math.max(0, Math.min(1, (base - y) / (base - top)));
  const cx = (y: number) => d.x + d.crook * v(y) * v(y);
  const half = (y: number) => (d.w / 2) * (1 - 0.3 * v(y));
  const armY = top + 40;
  const armTip = { x: cx(armY) + d.arm * (half(armY) + 70), y: armY };
  const L = { x: cx(top), y: top - 12 - 56, w: 96, h: 112 };
  const chest = { x: cx(top) + 104, y: top - 12 };
  return { base, top, v, cx, half, armY, armTip, lantern: L, chest };
};

const Flag: React.FC<{ x: number; y: number; t: number; c: string; dir?: number; s?: number }> = ({ x, y, t, c, dir = 1, s = 1 }) => {
  const w = Math.sin(t * 3.1 + x) * 4 * s;
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y - 34 * s} stroke={c} strokeWidth={2.5 * s} strokeLinecap="round" />
      <path d={`M${x} ${y - 34 * s} Q${x + dir * 16 * s} ${y - 36 * s + w} ${x + dir * 32 * s} ${y - 28 * s + w * 1.4} Q${x + dir * 16 * s} ${y - 22 * s + w * 0.5} ${x} ${y - 20 * s} Z`} fill={c} />
    </g>
  );
};

/** One keep: a tapering, slightly crooked stone body with a lit face, a turret, a few arched windows, its
 *  crown, a flag and a hoisting arm (beam, brace and a pulley wheel that turns when the hook moves). */
export const Tower: React.FC<{
  d: TowerDef; g: number; t: number; pal: Pal; lit: (v: number, i: number) => number; spin: number;
  children?: React.ReactNode; front?: React.ReactNode;
}> = ({ d, g, t, pal, lit, spin, children, front }) => {
  const G = towerGeo(d, g);
  const { top, cx, half } = G;
  const b = TOWER_BASE + 40;
  const N = 16;
  const ys = Array.from({ length: N + 1 }, (_, i) => b - ((b - top) * i) / N);
  const left = ys.map((y) => `${cx(y) - half(y)} ${y}`), right = ys.map((y) => `${cx(y) + half(y)} ${y}`).reverse();
  const body = `M${left.join(' L')} L${right.join(' L')} Z`;
  const faceR = ys.map((y) => `${cx(y) - half(y) * 0.2} ${y}`).reverse();
  const face = `M${left.join(' L')} L${faceR.join(' L')} Z`;
  const leftEdge = `M${left.join(' L')}`;
  // hand-laid stone: a few short mortar lines, different on every tower
  const R = rng(Math.round(d.x));
  const mortar = Array.from({ length: 14 }, (_, i) => {
    const y = b - (b - top) * (0.05 + 0.065 * i + R() * 0.02); const u0 = -0.9 + R() * 0.8, u1 = u0 + 0.3 + R() * 0.6;
    return <line key={i} x1={cx(y) + u0 * half(y)} y1={y} x2={cx(y) + Math.min(0.9, u1) * half(y)} y2={y + (R() - 0.5) * 3} stroke={pal.ink} strokeOpacity={0.28} strokeWidth={1.3} strokeLinecap="round" />;
  });
  const arch = (x: number, y: number, w: number, h: number, fill: string, key: string | number, op = 1) => (
    <path key={key} d={`M${x - w / 2} ${y + h / 2} V${y - h / 2 + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w / 2} ${y - h / 2 + w / 2} V${y + h / 2} Z`} fill={fill} stroke={pal.ink} strokeWidth={1.6} opacity={op} />
  );
  const winFill = (L: number) => (L <= 1 ? mix(pal.winOff, COLD, L) : mix(COLD, '#FFFFFF', L - 1));
  const wins = d.wins.map(([v, u], i) => {
    const y = b - 40 - (b - 40 - top - 30) * v; const L = lit(v, i);
    return arch(cx(y) + u * half(y), y, 15, 26, winFill(L), i);
  });
  // the turret, hung off one side
  const ty = TOWER_BASE - d.h * g * d.turret.v; const ts = d.turret.side;
  const tx = cx(ty) + ts * (half(ty) + 6);
  const turret = (
    <g>
      <path d={`M${tx - 24} ${ty} L${tx + 24} ${ty} L${tx - ts * 6} ${ty + 44} Z`} fill={pal.towerDark} stroke={pal.ink} strokeWidth={1.6} />
      <rect x={tx - 22} y={ty - 74} width={44} height={76} fill={pal.towerDark} stroke={pal.ink} strokeWidth={1.6} />
      <rect x={tx - 22} y={ty - 74} width={15} height={76} fill={pal.towerLit} />
      {arch(tx + 3, ty - 36, 11, 20, winFill(lit(d.turret.v, 99)), 't')}
      <path d={`M${tx - 30} ${ty - 72} Q${tx - 8} ${ty - 100} ${tx + ts * 4} ${ty - 140} Q${tx + 8} ${ty - 100} ${tx + 30} ${ty - 72} Z`} fill={pal.towerDark} stroke={pal.ink} strokeWidth={1.6} />
      <path d={`M${tx - 30} ${ty - 72} Q${tx - 8} ${ty - 100} ${tx + ts * 4} ${ty - 140} L${tx - 4} ${ty - 72} Z`} fill={pal.towerLit} />
      <Flag x={tx + ts * 4} y={ty - 138} t={t} c={pal.rim} dir={ts} s={0.7} />
    </g>
  );
  // crown
  const hx = cx(top), hw = half(top);
  let crown: React.ReactNode = null;
  if (d.crown === 'cone') {
    const tip = { x: hx + 26, y: top - 250 };   // the witch-hat tip bends over: a bit of character
    crown = (<g>
      <rect x={hx - hw - 10} y={top - 10} width={2 * hw + 20} height={12} rx={3} fill={pal.towerDark} stroke={pal.ink} strokeWidth={1.6} />
      <rect x={hx - hw * 0.82} y={top - 52} width={hw * 1.64} height={44} fill={pal.towerDark} stroke={pal.ink} strokeWidth={1.6} />
      <rect x={hx - hw * 0.82} y={top - 52} width={hw * 0.6} height={44} fill={pal.towerLit} />
      {arch(hx + 6, top - 30, 12, 20, winFill(lit(1, 98)), 'c')}
      <path d={`M${hx - hw * 1.08} ${top - 50} Q${hx - hw * 0.3} ${top - 130} ${tip.x} ${tip.y} Q${hx + hw * 0.32} ${top - 130} ${hx + hw * 1.08} ${top - 50} Z`} fill={pal.towerDark} stroke={pal.ink} strokeWidth={1.8} />
      <path d={`M${hx - hw * 1.08} ${top - 50} Q${hx - hw * 0.3} ${top - 130} ${tip.x} ${tip.y} Q${hx - hw * 0.1} ${top - 120} ${hx - hw * 0.2} ${top - 50} Z`} fill={pal.towerLit} />
      <Flag x={tip.x} y={tip.y} t={t} c={pal.rim} />
    </g>);
  } else if (d.crown === 'battlement') {
    crown = (<g>
      <path d={`M${hx - hw * 1.12} ${top + 2} L${hx - hw * 1.12} ${top - 34} L${hx + hw * 1.12} ${top - 34} L${hx + hw * 1.12} ${top + 2} Z`} fill={pal.towerDark} stroke={pal.ink} strokeWidth={1.6} />
      <rect x={hx - hw * 1.12} y={top - 34} width={hw * 0.75} height={36} fill={pal.towerLit} />
      {[-1, -0.5, 0, 0.5, 1].map((u, i) => <rect key={i} x={hx + u * hw * 0.92 - 9} y={top - 52} width={18} height={20} fill={pal.towerDark} stroke={pal.ink} strokeWidth={1.4} />)}
      <Flag x={hx} y={top - 52} t={t} c={pal.rim} s={1.2} />
    </g>);
  } else {
    // the lantern room: open arches where the purple light will be kindled, under a tall cone roof
    const L = G.lantern;
    crown = (<g>
      <rect x={hx - hw - 62} y={top - 12} width={2 * hw + 124} height={14} rx={3} fill={pal.towerDark} stroke={pal.ink} strokeWidth={1.6} />
      {[-1, -0.5, 0, 0.5, 1].map((u, i) => <rect key={i} x={hx + u * (hw + 52) - 2} y={top - 30} width={4} height={18} fill={pal.towerDark} />)}
      <rect x={hx - hw - 62} y={top - 32} width={2 * hw + 124} height={4} rx={2} fill={pal.towerDark} />
      <rect x={L.x - L.w / 2} y={L.y - L.h / 2} width={L.w} height={L.h} fill={mix(pal.ink, pal.towerDark, 0.3)} />
      {children}
      {[-1, 1].map((s) => <rect key={s} x={L.x + s * (L.w / 2) - 8} y={L.y - L.h / 2} width={16} height={L.h} fill={pal.towerDark} stroke={pal.ink} strokeWidth={1.4} />)}
      <path d={`M${L.x - L.w / 2 - 18} ${L.y - L.h / 2 + 2} Q${L.x - 18} ${L.y - L.h / 2 - 60} ${L.x} ${L.y - L.h / 2 - 130} Q${L.x + 18} ${L.y - L.h / 2 - 60} ${L.x + L.w / 2 + 18} ${L.y - L.h / 2 + 2} Z`} fill={pal.towerDark} stroke={pal.ink} strokeWidth={1.8} />
      <path d={`M${L.x - L.w / 2 - 18} ${L.y - L.h / 2 + 2} Q${L.x - 18} ${L.y - L.h / 2 - 60} ${L.x} ${L.y - L.h / 2 - 130} L${L.x - 8} ${L.y - L.h / 2 + 2} Z`} fill={pal.towerLit} />
      <Flag x={L.x} y={L.y - L.h / 2 - 128} t={t} c={pal.rim} s={1.2} />
      {front}
    </g>);
  }
  // the hoisting contraption: a beam, a brace, a rope drum at the wall and a spoked pulley at the tip
  const a = G.armTip; const sx = cx(G.armY) + d.arm * half(G.armY);
  const arm = (<g strokeLinecap="round">
    <line x1={sx} y1={G.armY} x2={a.x} y2={a.y} strokeWidth={8} stroke={pal.ink} />
    <line x1={sx} y1={G.armY - 2.5} x2={a.x} y2={a.y - 2.5} strokeWidth={2} stroke={pal.rim} strokeOpacity={0.7} />
    <line x1={sx} y1={G.armY + 44} x2={a.x - d.arm * 22} y2={a.y} strokeWidth={4} stroke={pal.ink} />
    <circle cx={sx + d.arm * 12} cy={G.armY - 10} r={8} fill={pal.towerLit} stroke={pal.ink} strokeWidth={2} />
    <g transform={`translate(${a.x} ${a.y + 4}) rotate(${spin})`}>
      <circle r={11} fill={pal.towerDark} stroke={pal.ink} strokeWidth={2.2} />
      {[0, 45, 90, 135].map((r) => <line key={r} x1={-9} y1={0} x2={9} y2={0} stroke={pal.rim} strokeWidth={1.4} transform={`rotate(${r})`} />)}
      <circle r={2.5} fill={pal.rim} />
    </g>
  </g>);
  return (
    <g>
      <g filter="url(#cut)">
        <path d={body} fill={pal.towerDark} />
        <path d={face} fill={pal.towerLit} />
        {mortar}
        <path d={body} fill="none" stroke={pal.ink} strokeWidth={2} strokeOpacity={0.85} />
        <path d={leftEdge} fill="none" stroke={pal.rim} strokeWidth={2.2} strokeOpacity={0.55} />
        {turret}
        {d.crown !== 'lantern' ? crown : null}
        {arm}
      </g>
      {wins}
      {d.crown === 'lantern' ? crown : null}
    </g>
  );
};

/** Three thin keeps further back: depth, and "a small handful" rather than three. */
export const FarTowers: React.FC<{ lit: number; pal: Pal }> = ({ lit, pal }) => (
  <g filter="url(#cut)">
    {[{ x: 430, w: 64, h: 440, c: -10 }, { x: 1600, w: 72, h: 500, c: 12 }, { x: 860, w: 52, h: 340, c: 6 }].map((t, i) => (
      <g key={i}>
        <path d={`M${t.x - t.w / 2} 930 L${t.x - t.w * 0.36 + t.c} ${900 - t.h} L${t.x + t.w * 0.36 + t.c} ${900 - t.h} L${t.x + t.w / 2} 930 Z`} fill={pal.far} />
        <path d={`M${t.x - t.w * 0.55 + t.c} ${902 - t.h} Q${t.x + t.c - 6} ${860 - t.h} ${t.x + t.c + 8} ${780 - t.h} Q${t.x + t.c + 8} ${860 - t.h} ${t.x + t.w * 0.55 + t.c} ${902 - t.h} Z`} fill={pal.far} />
        {[0.2, 0.45, 0.7].map((v, r) => (
          <rect key={r} x={t.x + t.c * v * v - 3} y={900 - t.h * v} width={6} height={10} rx={3} fill={COLD} opacity={(0.12 + 0.3 * lit) * pal.stars} />
        ))}
      </g>
    ))}
  </g>
);

// ---------- the town ----------
// WHY three rows climbing a gentle slope: one strip of houses left the bottom of the frame empty and gave
// the finale too few windows to set "ablaze". Three rows give depth and a town that fills the frame.
export type RowId = 'back' | 'mid' | 'front';
export type Win = { id: number; row: RowId; house: number; x: number; y: number; w: number; h: number; theme: Theme; layout: number; shutters: boolean };
type RoofKind = 'gable' | 'witch' | 'gambrel' | 'steep';
export type House = {
  id: number; row: RowId; x: number; w: number; wall: number; roof: number; base: number; kind: RoofKind; skew: number;
  chimney: number | null; smoke: boolean; door: boolean; doorX: number; doorTilt: number; peak: { x: number; y: number }; tone: number; theme: Theme;
};
type RowSpec = { seed: number; base: number; scale: number; k: number; haze: number };
export const ROWS: Record<RowId, RowSpec> = {
  // farther rows are hazier (closer to the sky's colour): atmospheric depth
  back: { seed: 11, base: 842, scale: 0.62, k: 0.8, haze: 0.3 },
  mid: { seed: 23, base: 905, scale: 0.8, k: 0.9, haze: 0.14 },
  front: { seed: 5, base: 992, scale: 1, k: 1, haze: 0 },
};

const STONES = (() => { const R = rng(17); const out: { x: number; y: number; r: number }[] = []; for (let x = -900; x < 2900; x += 26 + R() * 14) out.push({ x, y: 14 + (out.length % 2) * 22 + R() * 6, r: 6 + R() * 4 }); return out; })();

const genRow = (row: RowId) => {
  const S = ROWS[row]; const R = rng(S.seed); const sc = S.scale;
  const houses: House[] = []; const wins: Win[] = [];
  let x = -1000 + R() * 60;
  const kinds: RoofKind[] = ['gable', 'witch', 'gambrel', 'steep', 'gable', 'witch'];
  while (x < 2950) {
    const w = (122 + R() * 90) * sc;
    const wall = (100 + R() * 70) * sc;
    const kind = kinds[Math.floor(R() * kinds.length)];
    const roof = (52 + R() * 40) * sc * (kind === 'steep' || kind === 'witch' ? 1.45 : 1);
    const id = houses.length;
    const chimney = R() < 0.62 ? 0.16 + R() * 0.6 : null;
    const h: House = {
      id, row, x, w, wall, roof, base: S.base + (R() - 0.5) * 10 * sc, kind, skew: (R() - 0.5) * 0.16,
      chimney, smoke: chimney != null && row !== 'back' && R() < 0.45, door: R() < 0.75, doorX: 0, doorTilt: (R() - 0.5) * 8,
      peak: { x: 0, y: 0 }, tone: Math.floor(R() * 4), theme: THEMES[0],
    };
    h.peak = { x: x + w * (0.5 + h.skew), y: h.base - wall - roof };
    h.doorX = h.peak.x;
    houses.push(h);
    // WHY picture windows in the middle of the front row: the camera's close look at the new youcodeds
    // lands here, and one big window per house lets a stranger read "everyone's own little app".
    if (row === 'front' && x + w / 2 > 900 && x + w / 2 < 1750) {
      const pw = Math.min(78, w * 0.58), ph = pw * 0.74;
      h.door = true; h.doorX = x + w * 0.17;
      wins.push({ id: -1, row, house: id, x: x + w * 0.33 + (w * 0.62 - pw) / 2, y: h.base - wall + Math.max(10, (wall - ph) * 0.3), w: pw, h: ph, theme: THEMES[0], layout: 0, shutters: false });
      x += w + (8 + R() * 34) * sc;
      continue;
    }
    const ww = 46 * sc, wh = 36 * sc;
    const floors = wall > 138 * sc ? 2 : 1;
    const across = Math.max(1, Math.min(3, Math.floor((w - 16 * sc) / (ww + 24 * sc))));
    for (let f = 0; f < floors; f++) {
      for (let a = 0; a < across; a++) {
        // WHY skip the lower middle: that's where the door goes
        if (h.door && f === 0 && across === 3 && a === 1) continue;
        const gx = (w - across * ww) / (across + 1);
        const wy = h.base - wall + (floors === 2 ? (f === 0 ? wall * 0.14 : wall * 0.52) : wall * (h.door ? 0.16 : 0.3));
        wins.push({ id: -1, row, house: id, x: x + gx + a * (ww + gx), y: wy, w: ww, h: wh, theme: THEMES[0], layout: 0, shutters: across === 1 && R() < 0.7 });
      }
    }
    x += w + (8 + R() * 34) * sc;
  }
  return { houses, wins };
};
export const TOWN: Record<RowId, ReturnType<typeof genRow>> = { back: genRow('back'), mid: genRow('mid'), front: genRow('front') };
export const BACK = TOWN.back, FRONT = TOWN.front;
export const ALL_WINS: Win[] = [...TOWN.back.wins, ...TOWN.mid.wins, ...TOWN.front.wins];
ALL_WINS.forEach((w, i) => {
  w.id = i;
  // WHY this mixing: neighbours should never share a look, and the pattern should not repeat visibly.
  // (golden-ratio stepping: the old "i*5 + house*7" stepped by 12 when every house had one window, so a
  // whole street of picture windows came out in the same theme)
  const g = (i * 0.6180339 + (w.row === 'front' ? 0.13 : w.row === 'mid' ? 0.47 : 0.81)) % 1;
  w.theme = THEMES[Math.floor(g * THEMES.length)];
  w.layout = Math.floor(((i * 0.7548777 + 0.29) % 1) * LAYOUTS);
});
// each house wears the look of its first window once morning comes
(['back', 'mid', 'front'] as RowId[]).forEach((r) => TOWN[r].houses.forEach((h) => { h.theme = TOWN[r].wins.find((w) => w.house === h.id)?.theme ?? THEMES[0]; }));

const roofPath = (h: House, ov: number) => {
  const top = h.base - h.wall, L = h.x - ov, Rr = h.x + h.w + ov, p = h.peak;
  if (h.kind === 'witch') return `M${L} ${top + 3} Q${h.x + h.w * 0.32} ${top - h.roof * 0.22} ${p.x} ${p.y} Q${h.x + h.w * 0.68} ${top - h.roof * 0.22} ${Rr} ${top + 3} Z`;
  if (h.kind === 'gambrel') return `M${L} ${top + 3} L${h.x + h.w * 0.06} ${top - h.roof * 0.55} L${p.x} ${p.y} L${h.x + h.w * 0.94} ${top - h.roof * 0.55} L${Rr} ${top + 3} Z`;
  return `M${L} ${top + 3} L${p.x} ${p.y} L${Rr} ${top + 3} Z`;
};

/** A row of houses: ground, bodies, chimney smoke, the light the windows throw, then the windows.
 *  `lit(h)` is how far a house has turned into its own youcoded (it takes its colours by morning). */
export const Row: React.FC<{
  row: RowId; t: number; pal: Pal; dawn: number; winState: (w: Win) => { b: number; flip: number };
  lit: (h: House) => number; townGlow?: number; inside?: (w: Win) => React.ReactNode;
}> = ({ row, t, pal, dawn, winState, lit, townGlow = 0, inside }) => {
  const S = ROWS[row]; const { houses, wins } = TOWN[row];
  const haze = (c: string) => mix(c, pal.horizon, S.haze);
  const tones = [0, 0.05, -0.05, 0.09];
  const glowK = 1 - 0.55 * dawn;           // window light matters less in daylight
  const dayK = Math.min(1, dawn / 0.45);
  return (
    <g>
      {/* WHY: as the town lights up at night, its light lifts the sky above the roofs (a band, not a ball) */}
      {townGlow > 0 && <rect x={-1700} y={S.base - 420} width={5400} height={430} fill="url(#t1townglow)" opacity={townGlow * (1 - dawn)} />}
      <rect x={-1700} y={S.base - 3} width={5400} height={700} fill={haze(pal.ground)} />
      {row === 'front' && <rect x={-1700} y={S.base} width={5400} height={60} fill={mix(pal.ground, pal.rim, 0.12)} />}
      {/* a cobbled street: two rows of flat stones, so the strip under the houses is a place, not a band */}
      {row === 'front' && STONES.map((st, i) => <ellipse key={i} cx={st.x} cy={S.base + st.y} rx={st.r * 1.6} ry={st.r * 0.6} fill={pal.ink} opacity={0.12} />)}
      <g filter="url(#cut)">
        {houses.map((h) => {
          const top = h.base - h.wall;
          const ov = 9 * S.scale;
          // night keeps every house plum; a turned house wears its app's colours fully by pre-dawn (WHY early:
          // mixed half-way into the plum they read muddy through the middle of the dawn)
          const L = lit(h) * dayK;
          const tone = tones[h.tone];
          const wallC = haze(mix(tone > 0 ? mix(pal.wall, '#FFFFFF', tone) : mix(pal.wall, '#000000', -tone), h.theme.wall, L));
          const roofC = haze(mix(pal.roof, h.theme.roof, L));
          const rp = roofPath(h, ov);
          const dx = h.doorX, dw = 13 * S.scale;
          return (
            <g key={h.id}>
              {h.chimney != null && <rect x={h.x + h.w * h.chimney} y={top - h.roof * 0.78} width={15 * S.scale} height={h.roof * 0.62} fill={roofC} stroke={pal.ink} strokeWidth={1.3} />}
              <rect x={h.x} y={top} width={h.w} height={h.wall + 6} fill={wallC} stroke={pal.ink} strokeWidth={1.5} />
              {/* the shaded side gives each house volume */}
              <rect x={h.x + h.w * 0.82} y={top} width={h.w * 0.18} height={h.wall + 6} fill="#1A0A26" opacity={0.16} />
              <path d={rp} fill={roofC} stroke={pal.ink} strokeWidth={1.6} strokeLinejoin="round" />
              {[0.4, 0.7].map((f) => <line key={f} x1={h.x + h.w * 0.12 * (1 - f)} y1={h.peak.y + h.roof * f} x2={h.x + h.w - h.w * 0.12 * (1 - f)} y2={h.peak.y + h.roof * f} stroke={pal.ink} strokeOpacity={0.18} strokeWidth={1.1} />)}
              {/* rim light on the roof: moonlight at night, warm once the light is free */}
              <path d={rp} fill="none" stroke={pal.rim} strokeWidth={2 * S.scale + 0.4} strokeOpacity={0.55} strokeLinejoin="round" />
              {h.door && (
                <g transform={`rotate(${h.doorTilt} ${dx} ${h.base})`}>
                  <path d={`M${dx - dw} ${h.base} l0 ${-30 * S.scale} a${dw} ${dw} 0 0 1 ${2 * dw} 0 l0 ${30 * S.scale} Z`} fill={mix(roofC, pal.ink, 0.25)} stroke={pal.ink} strokeWidth={1.3} />
                  <circle cx={dx + dw * 0.5} cy={h.base - 14 * S.scale} r={1.8 * S.scale} fill={pal.rim} />
                </g>
              )}
            </g>
          );
        })}
      </g>
      {/* chimney smoke: a few soft puffs rising and drifting with the wind, looping on each house's own clock */}
      <g filter="url(#puff)">
        {houses.filter((h) => h.smoke).map((h) => {
          const cxm = h.x + h.w * (h.chimney ?? 0) + 7 * S.scale, cy = h.base - h.wall - h.roof * 0.78;
          return [0, 1, 2, 3].map((i) => {
            const ph = (t * 0.22 + i / 4 + h.id * 0.37) % 1;
            return <circle key={`${h.id}-${i}`} cx={cxm + (ph * 34 + Math.sin(ph * 5 + h.id) * 6) * S.scale} cy={cy - ph * 95 * S.scale} r={(5 + ph * 13) * S.scale} fill={pal.smoke} opacity={0.42 * Math.sin(ph * Math.PI)} />;
          });
        })}
      </g>
      <g filter="url(#glow)">
        {wins.map((w) => {
          const s = winState(w);
          const app = Math.min(1, s.flip * 2);
          const pad = 14 * S.scale;
          return (
            <g key={w.id}>
              {s.b > 0.02 && app < 1 && <rect x={w.x - pad / 2} y={w.y - pad / 2} width={w.w + pad} height={w.h + pad} fill={COLD} opacity={0.2 * s.b * (1 - app) * glowK} />}
              {app > 0 && <rect x={w.x - pad} y={w.y - pad} width={w.w + pad * 2} height={w.h + pad * 3} fill={w.theme.glow} opacity={0.75 * app * glowK} />}
              {app > 0 && <ellipse cx={w.x + w.w / 2} cy={houses[w.house].base + 10 * S.scale} rx={w.w * 1.3} ry={12 * S.scale} fill={w.theme.glow} opacity={0.5 * app * glowK} />}
            </g>
          );
        })}
      </g>
      {wins.map((w) => <Window key={w.id} w={w} {...winState(w)} t={t} pal={pal} shutterC={mix(pal.roof, houses[w.house].theme.roof, lit(houses[w.house]) * dayK)} inside={inside?.(w)} />)}
    </g>
  );
};

/** One window: identical cold glass with a cross, which flips like a card into its own youcoded. */
// WHY `inside`: one window shows a person at home behind the glass (the privacy beat); it is drawn
// between the glass and the cross bars, so the bars sit in front of them like a real window.
const Window: React.FC<{ w: Win; b: number; flip: number; t: number; pal: Pal; shutterC: string; inside?: React.ReactNode }> = ({ w, b, flip, t, pal, shutterC, inside }) => {
  const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
  // flip: 0..0.5 the old glass turns away, 0.5..1 the app turns toward us with a small overshoot
  const turned = flip >= 0.5;
  const q = turned ? (flip - 0.5) * 2 : flip * 2;
  const sx = turned ? Math.min(1.08, Math.sin(q * Math.PI * 0.62) / Math.sin(Math.PI * 0.62)) : Math.max(0.001, Math.cos(q * Math.PI / 2));
  const pop = turned ? 1 + 0.1 * Math.sin(q * Math.PI) : 1;
  const flash = turned ? Math.max(0, 1 - q * 2.2) : 0;
  const tf = `translate(${cx} ${cy}) scale(${sx * pop} ${pop}) translate(${-cx} ${-cy})`;
  const frame = <rect x={w.x - 2.5} y={w.y - 2.5} width={w.w + 5} height={w.h + 5} rx={2.5} fill={pal.ink} />;
  const extras = (<>
    <rect x={w.x - 4} y={w.y + w.h + 1} width={w.w + 8} height={4} rx={1} fill={pal.rim} opacity={0.55} />
    {w.shutters && [-1, 1].map((s) => <rect key={s} x={s < 0 ? w.x - w.w * 0.36 - 3 : w.x + w.w + 3} y={w.y - 1} width={w.w * 0.36} height={w.h + 2} rx={1.5} fill={shutterC} stroke={pal.ink} strokeWidth={1.2} />)}
  </>);
  if (!turned) {
    const glass = mix(pal.winOff, COLD, b);
    return (
      <g>
        {frame}
        <g transform={tf}>
          <rect x={w.x} y={w.y} width={w.w} height={w.h} rx={1.5} fill={glass} />
          {inside}
          <rect x={cx - 1.3} y={w.y} width={2.6} height={w.h} fill={pal.ink} />
          <rect x={w.x} y={cy - 1.3} width={w.w} height={2.6} fill={pal.ink} />
        </g>
        {extras}
      </g>
    );
  }
  return (
    <g>
      {frame}
      <g transform={tf}>
        <AppWin x={w.x} y={w.y} w={w.w} h={w.h} theme={w.theme} layout={w.layout} t={t} seed={w.id} />
        {flash > 0 && <rect x={w.x} y={w.y} width={w.w} height={w.h} fill="#FFFFFF" opacity={flash * 0.7} />}
      </g>
      {extras}
    </g>
  );
};

// ---------- sky, hills, foreground, life ----------
export const SkyBack: React.FC<{ pal: Pal; field: number }> = ({ pal, field }) => (
  <g>
    <defs>
      <linearGradient id="t1sky" x1="0" y1="-900" x2="0" y2="900" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor={pal.skyTop} />
        <stop offset="0.45" stopColor={pal.skyMid} />
        <stop offset="0.78" stopColor={pal.skyLow} />
        <stop offset="1" stopColor={pal.horizon} />
      </linearGradient>
      {/* the colour field (brand §8): a wide lift of pink-purple from the lower right, never a ball */}
      <radialGradient id="t1field" cx="1700" cy="1000" r="1800" gradientUnits="userSpaceOnUse" gradientTransform="translate(1700 1000) scale(1.2 0.75) translate(-1700 -1000)">
        <stop offset="0" stopColor="#F1B9DC" stopOpacity="0.9" />
        <stop offset="0.4" stopColor="#E2C6F2" stopOpacity="0.55" />
        <stop offset="1" stopColor="#FBF6FD" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect x={-1500} y={-1400} width={4900} height={3200} fill="url(#t1sky)" />
    <rect x={-1500} y={-1400} width={4900} height={3200} fill="url(#t1field)" opacity={field} />
  </g>
);

const STARS = (() => { const R = rng(3); return Array.from({ length: 46 }, () => ({ x: -300 + R() * 2500, y: -500 + R() * 820, r: 0.8 + R() * 1.3, o: 0.18 + R() * 0.35 })); })();
export const Stars: React.FC<{ o: number }> = ({ o }) => (o <= 0 ? null : <g>{STARS.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#E9DDF2" opacity={s.o * o} />)}</g>);
/** A paper-cut crescent moon: flat, no glow (the brand bans glowing orbs). It pales away by morning. */
export const Moon: React.FC<{ o: number }> = ({ o }) => (
  <g opacity={o}>
    <defs><mask id="t1moon"><rect x={0} y={-400} width={900} height={900} fill="#fff" /><circle cx={262} cy={300} r={50} fill="#000" /></mask></defs>
    <circle cx={230} cy={320} r={52} fill="#EDE2F4" mask="url(#t1moon)" opacity={0.95} />
  </g>
);

const cloudPath = (x: number, y: number, s: number) =>
  `M${x} ${y} h${200 * s} a${26 * s} ${26 * s} 0 0 0 ${-30 * s} ${-30 * s} a${40 * s} ${40 * s} 0 0 0 ${-70 * s} ${-22 * s} a${30 * s} ${30 * s} 0 0 0 ${-55 * s} ${8 * s} a${28 * s} ${28 * s} 0 0 0 ${-45 * s} ${44 * s} Z`;
export const Clouds: React.FC<{ t: number; pal: Pal }> = ({ t, pal }) => (
  <g>
    {[{ x: 120, y: 330, s: 1.5, v: 7 }, { x: 1250, y: 250, s: 1.2, v: 5 }, { x: 1700, y: 420, s: 1.7, v: 6 }, { x: -500, y: 470, s: 1.3, v: 8 }, { x: 640, y: 120, s: 1.0, v: 4 }].map((c, i) => (
      <g key={i} transform={`translate(${c.v * t} 0)`} filter="url(#cut)">
        <path d={cloudPath(c.x, c.y, c.s)} fill={pal.cloud} opacity={0.88} />
        <path d={cloudPath(c.x, c.y, c.s)} fill="none" stroke={pal.cloudEdge} strokeWidth={1.6} strokeOpacity={0.7} />
      </g>
    ))}
  </g>
);

export const Hills: React.FC<{ far?: boolean; pal: Pal }> = ({ far, pal }) => (
  <g filter="url(#cut)">
    <path fill={far ? pal.hill2 : pal.hill} d={far
      ? 'M-1600 1500 L-1600 760 C-1100 690 -700 720 -300 750 C200 790 500 700 1000 720 C1500 740 1900 690 2400 730 C2800 760 3200 720 3600 740 L3600 1500 Z'
      : 'M-1600 1500 L-1600 820 C-1200 790 -800 800 -400 815 C0 830 400 790 800 805 C1200 820 1600 785 2000 800 C2400 815 2900 790 3600 810 L3600 1500 Z'} />
    <path fill="none" stroke={pal.rim} strokeOpacity={0.35} strokeWidth={2} d={far
      ? 'M-1600 760 C-1100 690 -700 720 -300 750 C200 790 500 700 1000 720 C1500 740 1900 690 2400 730 C2800 760 3200 720 3600 740'
      : 'M-1600 820 C-1200 790 -800 800 -400 815 C0 830 400 790 800 805 C1200 820 1600 785 2000 800 C2400 815 2900 790 3600 810'} />
  </g>
);

/** Foreground: a low rise with a crooked fence, bushes and two bare trees framing the edges. */
export const Foreground: React.FC<{ pal: Pal }> = ({ pal }) => {
  const tree = (x: number, flip: number) => (
    <g transform={`translate(${x} 1098) scale(${flip} 1)`} stroke={pal.fore} fill="none" strokeLinecap="round">
      <path d="M0 40 C6 -60 -10 -150 8 -250" strokeWidth={22} />
      <path d="M4 -120 C40 -150 70 -170 120 -230" strokeWidth={10} />
      <path d="M2 -180 C-30 -210 -50 -240 -70 -300" strokeWidth={8} />
      <path d="M8 -250 C12 -290 30 -320 34 -360" strokeWidth={7} />
      <path d="M80 -190 C95 -200 120 -200 150 -195" strokeWidth={5} />
      <path d="M-40 -235 C-60 -240 -80 -230 -105 -250" strokeWidth={4} />
      <path d="M95 -210 C100 -240 110 -260 105 -285" strokeWidth={4} />
    </g>
  );
  const R = rng(9);
  const posts = Array.from({ length: 34 }, (_, i) => ({ x: -500 + i * 90 + R() * 14, tilt: (R() - 0.5) * 9, h: 34 + R() * 10 }));
  const bushes = Array.from({ length: 16 }, () => ({ x: -600 + R() * 3200, r: 18 + R() * 22 }));
  // WHY this low: the rise only frames the bottom edge; any higher and it swallowed the town in close-ups
  const hillY = (x: number) => 1092 - 12 * Math.sin(x / 420) - 7 * Math.sin(x / 170 + 1);
  const hill = `M-1200 1700 L${Array.from({ length: 61 }, (_, i) => { const x = -1200 + i * 75; return `${x} ${hillY(x)}`; }).join(' L')} L3300 1700 Z`;
  return (
    <g filter="url(#cut)">
      <path fill={pal.fore} d={hill} />
      <path fill="none" stroke={pal.rim} strokeOpacity={0.45} strokeWidth={2} d={`M${Array.from({ length: 61 }, (_, i) => { const x = -1200 + i * 75; return `${x} ${hillY(x)}`; }).join(' L')}`} />
      {posts.map((p, i) => <rect key={i} x={p.x} y={hillY(p.x) - p.h} width={7} height={p.h + 6} rx={2} fill={pal.fore} transform={`rotate(${p.tilt} ${p.x} ${hillY(p.x)})`} />)}
      {posts.slice(0, -1).map((p, i) => <line key={`r${i}`} x1={p.x} y1={hillY(p.x) - p.h * 0.7} x2={posts[i + 1].x} y2={hillY(posts[i + 1].x) - posts[i + 1].h * 0.7} stroke={pal.fore} strokeWidth={4} />)}
      {bushes.map((b, i) => <g key={`b${i}`} fill={pal.fore}><circle cx={b.x} cy={hillY(b.x) + 6} r={b.r} /><circle cx={b.x + b.r * 0.9} cy={hillY(b.x) + 10} r={b.r * 0.75} /></g>)}
      {tree(-30, 1)}
      {tree(1950, -1)}
    </g>
  );
};

/** Two or three birds crossing the morning sky, wings beating. Screen space. */
export const Birds: React.FC<{ t: number; from: number; o: number }> = ({ t, from, o }) => {
  if (t < from || o <= 0) return null;
  const dt = t - from;
  return (
    <g opacity={o} stroke="#43354E" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {[{ x0: -80, y: 250, v: 120, s: 1 }, { x0: -170, y: 285, v: 128, s: 0.8 }, { x0: -260, y: 232, v: 112, s: 0.7 }].map((b, i) => {
        const x = b.x0 + dt * b.v, y = b.y + Math.sin(dt * 1.3 + i) * 12 - dt * 6;
        const f = Math.sin(t * 11 + i * 2);
        return <path key={i} d={`M${x - 14 * b.s} ${y - 6 * f * b.s} Q${x - 6 * b.s} ${y - 9 * f * b.s - 2} ${x} ${y} Q${x + 6 * b.s} ${y - 9 * f * b.s - 2} ${x + 14 * b.s} ${y - 6 * f * b.s}`} />;
      })}
    </g>
  );
};

/** Shared SVG filters. `frame` boils the cut-paper edge every few frames, like hand-drawn line. */
export const Defs: React.FC<{ frame: number }> = ({ frame }) => (
  <defs>
    {/* WHY: a tiny displacement makes every silhouette edge look cut by hand; changing its seed every
        fourth frame gives the gentle "boil" of hand-drawn animation; the shadow separates paper layers. */}
    <filter id="cut" x="-10%" y="-20%" width="120%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed={7 + (Math.floor(frame / 4) % 3)} result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="d" />
      <feGaussianBlur in="d" stdDeviation="6" result="b" />
      <feOffset in="b" dx="2" dy="6" result="o" />
      <feFlood floodColor="#2A0E3A" floodOpacity="0.45" />
      <feComposite in2="o" operator="in" result="s" />
      <feMerge><feMergeNode in="s" /><feMergeNode in="d" /></feMerge>
    </filter>
    <filter id="glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="9" /></filter>
    <filter id="puff" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
    <radialGradient id="t1halo">
      <stop offset="0" stopColor="#E7C8F0" stopOpacity="0.75" />
      <stop offset="0.35" stopColor="#C387D3" stopOpacity="0.28" />
      <stop offset="1" stopColor="#9750AA" stopOpacity="0" />
    </radialGradient>
    <linearGradient id="t1trail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E7C8F0" /><stop offset="1" stopColor="#C387D3" /></linearGradient>
    <linearGradient id="t1townglow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#B25BA8" stopOpacity="0" /><stop offset="0.7" stopColor="#B25BA8" stopOpacity="0.22" /><stop offset="1" stopColor="#D27AB8" stopOpacity="0.5" />
    </linearGradient>
  </defs>
);
