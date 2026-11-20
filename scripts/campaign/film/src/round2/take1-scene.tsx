// Take 1: the storybook world. Geometry (where every tower, house and window is) and how each layer is
// drawn. Nothing here knows about the script: take1.tsx decides WHEN things happen and passes plain
// numbers (how lit, how grown, which windows have turned) into these drawings.
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

export const K = { sky: 0.08, cloud: 0.16, hills2: 0.2, hills: 0.3, far: 0.45, towers: 0.6, back: 0.8, mid: 0.9, front: 1, fore: 1.3 };

// ---------- seeded randomness (the town must be identical on every frame and every render) ----------
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---------- colour ----------
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** Mix two #rrggbb colours: 0 = a, 1 = b. */
export const mix = (a: string, b: string, p: number) => {
  const A = hex(a), B = hex(b); const q = Math.max(0, Math.min(1, p));
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * q)).join(',')})`;
};
export const P = {
  skyTop: '#0A0512', skyMid: '#190D25', skyLow: '#33193F', horizon: '#57295F',
  hill2: '#2A1835', hill: '#21122B', far: '#251630',
  towerDark: '#120819', towerLit: '#241430', towerEdge: '#4B3459', cold: '#DCD3EA',
  backWall: '#24152F', backRoof: '#1A0E23', frontWall: '#2E1B3A', frontRoof: '#1D1027',
  ground: '#140A1C', fore: '#0A0410', glassOff: '#1F1229', glassDim: '#5F5070',
};

// ---------- towers ----------
export type TowerDef = { x: number; w: number; h: number; crown: 'spire' | 'lantern' | 'step'; arm: -1 | 1; cols: number };
export const TOWER_BASE = 905;
export const TOWERS: TowerDef[] = [
  { x: 690, w: 128, h: 610, crown: 'spire', arm: -1, cols: 4 },
  { x: 1010, w: 168, h: 710, crown: 'lantern', arm: -1, cols: 5 },
  { x: 1330, w: 118, h: 580, crown: 'step', arm: 1, cols: 4 },
];
/** Key points of a tower at growth g (1 = normal; "hubris" stretches them taller). */
export const towerGeo = (d: TowerDef, g: number) => {
  const top = TOWER_BASE - d.h * g;
  const half = (y: number) => (d.w / 2) * (0.84 + 0.16 * ((y - top) / (TOWER_BASE - top)));
  const armY = top + 34;
  const armTip = { x: d.x + d.arm * (half(armY) + 64), y: armY };
  const lantern = { x: d.x, y: top - 12 - 56, w: 96, h: 112 };
  const chest = { x: d.x + 104, y: top - 12 };
  return { top, half, armY, armTip, lantern, chest };
};

/** One tower: two-tone shaft, cornices, a grid of identical cold windows, its crown and a hoisting arm. */
export const Tower: React.FC<{
  d: TowerDef; g: number; lit: (row: number, rows: number, col: number) => number;
  purple: number; children?: React.ReactNode; front?: React.ReactNode;
}> = ({ d, g, lit, purple, children, front }) => {
  const G = towerGeo(d, g);
  const { top, half } = G;
  const b = TOWER_BASE + 40;
  const edge = mix(P.towerEdge, '#9C5BB4', purple);
  const litFace = mix(P.towerLit, '#3A1F49', purple * 0.7);
  // shaft outline (tapered) and its lit left face
  const shaft = `M${d.x - half(b)} ${b} L${d.x - half(top)} ${top} L${d.x + half(top)} ${top} L${d.x + half(b)} ${b} Z`;
  const face = `M${d.x - half(b)} ${b} L${d.x - half(top)} ${top} L${d.x - half(top) * 0.18} ${top} L${d.x - half(b) * 0.18} ${b} Z`;
  // window grid
  const wins: React.ReactNode[] = [];
  const rows = Math.floor((TOWER_BASE - 30 - (top + 54)) / 26);
  for (let r = 0; r < rows; r++) {
    const y = TOWER_BASE - 46 - r * 26;
    const hw = half(y) - 14;
    for (let c = 0; c < d.cols; c++) {
      const x = d.x - hw + (c * (2 * hw - 9)) / (d.cols - 1);
      const L = lit(r, rows, c);
      // WHY above 1 goes white: "blinded by their own hubris" over-exposes the towers' windows
      const fill = L <= 1 ? mix(P.glassOff, P.cold, L) : mix(P.cold, '#FFFFFF', L - 1);
      wins.push(<rect key={`${r}-${c}`} x={x} y={y} width={9} height={13} rx={1.5} fill={fill} opacity={0.35 + 0.65 * Math.min(1, L)} />);
    }
  }
  // cornices every six rows
  const cornices: React.ReactNode[] = [];
  for (let r = 6; r < rows; r += 6) {
    const y = TOWER_BASE - 46 - r * 26 + 19;
    cornices.push(<rect key={r} x={d.x - half(y) - 4} y={y} width={2 * half(y) + 8} height={5} fill={P.towerDark} stroke={edge} strokeWidth={1} strokeOpacity={0.5} />);
  }
  // crown
  const hw = half(top);
  let crown: React.ReactNode = null;
  if (d.crown === 'spire') {
    crown = (<g>
      <rect x={d.x - hw * 0.72} y={top - 44} width={hw * 1.44} height={46} fill={P.towerDark} />
      <rect x={d.x - hw * 0.72} y={top - 44} width={hw * 0.5} height={46} fill={litFace} />
      <path d={`M${d.x - hw * 0.86} ${top - 42} L${d.x} ${top - 190} L${d.x + hw * 0.86} ${top - 42} Z`} fill={P.towerDark} />
      <path d={`M${d.x - hw * 0.86} ${top - 42} L${d.x} ${top - 190} L${d.x - hw * 0.1} ${top - 42} Z`} fill={litFace} />
      <line x1={d.x} y1={top - 190} x2={d.x} y2={top - 228} stroke={edge} strokeWidth={3} strokeLinecap="round" />
    </g>);
  } else if (d.crown === 'step') {
    crown = (<g>
      {[0.82, 0.62, 0.42].map((f, i) => (
        <g key={i}>
          <rect x={d.x - hw * f} y={top - 30 * (i + 1)} width={hw * 2 * f} height={31} fill={P.towerDark} />
          <rect x={d.x - hw * f} y={top - 30 * (i + 1)} width={hw * 0.7 * f} height={31} fill={litFace} />
          <rect x={d.x - hw * f - 3} y={top - 30 * (i + 1)} width={hw * 2 * f + 6} height={4} fill={edge} opacity={0.6} />
        </g>
      ))}
      <line x1={d.x} y1={top - 90} x2={d.x} y2={top - 160} stroke={edge} strokeWidth={3} strokeLinecap="round" />
    </g>);
  } else {
    // the lantern room: open arches where the purple light will be kindled
    const L = G.lantern;
    crown = (<g>
      <rect x={d.x - hw - 62} y={top - 12} width={2 * hw + 124} height={14} rx={2} fill={P.towerDark} stroke={edge} strokeWidth={1.2} strokeOpacity={0.7} />
      <rect x={L.x - L.w / 2} y={L.y - L.h / 2} width={L.w} height={L.h} fill="#0E0716" />
      {children}
      {[-1, 1].map((s) => <rect key={s} x={L.x + s * (L.w / 2) - 7} y={L.y - L.h / 2} width={14} height={L.h} fill={P.towerDark} />)}
      <path d={`M${L.x - L.w / 2 - 14} ${L.y - L.h / 2 + 2} L${L.x} ${L.y - L.h / 2 - 84} L${L.x + L.w / 2 + 14} ${L.y - L.h / 2 + 2} Z`} fill={P.towerDark} />
      <path d={`M${L.x - L.w / 2 - 14} ${L.y - L.h / 2 + 2} L${L.x} ${L.y - L.h / 2 - 84} L${L.x - 6} ${L.y - L.h / 2 + 2} Z`} fill={litFace} />
      <line x1={L.x} y1={L.y - L.h / 2 - 84} x2={L.x} y2={L.y - L.h / 2 - 118} stroke={edge} strokeWidth={3} strokeLinecap="round" />
      {front}
    </g>);
  }
  // the hoisting arm: a beam, a brace and a pulley wheel
  const a = G.armTip; const sx = d.x + d.arm * half(G.armY);
  const arm = (<g stroke={edge} strokeLinecap="round" fill="none">
    <line x1={sx} y1={G.armY} x2={a.x} y2={a.y} strokeWidth={5} stroke={P.towerDark} />
    <line x1={sx} y1={G.armY - 2} x2={a.x} y2={a.y - 2} strokeWidth={1.2} strokeOpacity={0.8} />
    <line x1={sx} y1={G.armY + 36} x2={a.x - d.arm * 18} y2={a.y} strokeWidth={2.5} stroke={P.towerDark} />
    <circle cx={a.x} cy={a.y + 4} r={6} strokeWidth={2} fill={P.towerDark} />
  </g>);
  return (
    <g>
      <g filter="url(#cut)">
        <path d={shaft} fill={P.towerDark} />
        <path d={face} fill={litFace} />
        <path d={`M${d.x - half(b)} ${b} L${d.x - half(top)} ${top}`} stroke={edge} strokeWidth={1.5} strokeOpacity={0.55} />
        {cornices}
        {d.crown !== 'lantern' ? crown : null}
        {arm}
      </g>
      {wins}
      {d.crown === 'lantern' ? crown : null}
    </g>
  );
};

/** Two thin, hazy towers further back: depth, and "a small handful" rather than three. */
export const FarTowers: React.FC<{ lit: number }> = ({ lit }) => (
  <g opacity={0.9}>
    {[{ x: 430, w: 74, h: 470 }, { x: 1590, w: 84, h: 520 }, { x: 860, w: 60, h: 360 }].map((t, i) => (
      <g key={i}>
        <path d={`M${t.x - t.w / 2} 920 L${t.x - t.w * 0.42} ${900 - t.h} L${t.x} ${900 - t.h - 60} L${t.x + t.w * 0.42} ${900 - t.h} L${t.x + t.w / 2} 920 Z`} fill={P.far} />
        {Array.from({ length: Math.floor(t.h / 34) }).map((_, r) => [-1, 0, 1].map((c) => (
          <rect key={`${r}${c}`} x={t.x + c * t.w * 0.24 - 3} y={880 - r * 34} width={6} height={9} fill={P.cold} opacity={0.12 + 0.22 * lit} />
        )))}
      </g>
    ))}
  </g>
);

// ---------- the town ----------
// WHY three rows climbing a gentle slope: one strip of houses left the bottom of the frame as dead black
// and gave the finale too few windows to set "ablaze". Three rows give depth and a town that fills the frame.
export type RowId = 'back' | 'mid' | 'front';
export type Win = { id: number; row: RowId; house: number; x: number; y: number; w: number; h: number; theme: Theme; layout: number };
export type House = { id: number; row: RowId; x: number; w: number; wall: number; roof: number; base: number; steep: boolean; chimney: number | null; door: boolean; peak: { x: number; y: number }; tone: number };
type RowSpec = { seed: number; base: number; scale: number; walls: string[]; roofs: string[]; ground: string; k: number };
export const ROWS: Record<RowId, RowSpec> = {
  // farther rows are hazier (closer to the sky's colour): atmospheric depth in a night scene
  back: { seed: 11, base: 842, scale: 0.62, walls: ['#33203F', '#2F1D3B', '#372242'], roofs: ['#271731', '#2A1834', '#23142D'], ground: '#21132B', k: 0.8 },
  mid: { seed: 23, base: 905, scale: 0.8, walls: ['#2E1B3A', '#331F40', '#2A1836'], roofs: ['#1F112A', '#24142F', '#1C0F26'], ground: '#1A0E23', k: 0.9 },
  front: { seed: 5, base: 992, scale: 1, walls: ['#311D3D', '#382345', '#2C1938', '#3B2547'], roofs: ['#1C0F25', '#21122B', '#190C21'], ground: '#140A1C', k: 1 },
};

const genRow = (row: RowId) => {
  const S = ROWS[row]; const R = rng(S.seed); const sc = S.scale;
  const houses: House[] = []; const wins: Win[] = [];
  let x = -1000 + R() * 60;
  while (x < 2950) {
    const w = (122 + R() * 90) * sc;
    const wall = (100 + R() * 70) * sc;
    const steep = R() < 0.4;
    const roof = (52 + R() * 40) * sc * (steep ? 1.45 : 1);
    const id = houses.length;
    const h: House = { id, row, x, w, wall, roof, base: S.base + (R() - 0.5) * 10 * sc, steep, chimney: R() < 0.55 ? 0.18 + R() * 0.55 : null,
      door: R() < 0.7, peak: { x: 0, y: 0 }, tone: Math.floor(R() * 4) };
    h.peak = { x: x + w / 2, y: h.base - wall - roof };
    houses.push(h);
    // windows: one or two floors, one to three across
    const ww = 46 * sc, wh = 36 * sc;
    const floors = wall > 138 * sc ? 2 : 1;
    const across = Math.max(1, Math.min(3, Math.floor((w - 16 * sc) / (ww + 24 * sc))));
    for (let f = 0; f < floors; f++) {
      for (let a = 0; a < across; a++) {
        // WHY skip the lower middle: that's where the door goes
        if (h.door && f === 0 && across === 3 && a === 1) continue;
        const gx = (w - across * ww) / (across + 1);
        const wy = h.base - wall + (floors === 2 ? (f === 0 ? wall * 0.14 : wall * 0.52) : wall * (h.door ? 0.16 : 0.3));
        wins.push({ id: -1, row, house: id, x: x + gx + a * (ww + gx), y: wy, w: ww, h: wh, theme: THEMES[0], layout: 0 });
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
  w.theme = THEMES[(i * 5 + w.house * 7 + (w.row === 'front' ? 3 : w.row === 'mid' ? 8 : 0)) % THEMES.length];
  w.layout = (i * 7 + w.house * 3) % LAYOUTS;
});

/** A row of houses: ground, bodies, the light the windows throw, then the windows. */
export const Row: React.FC<{ row: RowId; winState: (w: Win) => { b: number; flip: number }; rim: number; townGlow?: number }> = ({ row, winState, rim, townGlow = 0 }) => {
  const S = ROWS[row]; const { houses, wins } = TOWN[row];
  const rimC = mix('#5E4470', '#C27BD6', rim);
  return (
    <g>
      {/* WHY: as the town lights up, its light lifts the sky above the roofs (a warm band, not a ball), so the
          town visibly ends brighter than the towers */}
      {townGlow > 0 && <rect x={-1700} y={S.base - 420} width={5400} height={430} fill="url(#t1townglow)" opacity={townGlow} />}
      <rect x={-1700} y={S.base - 3} width={5400} height={700} fill={S.ground} />
      {/* the street in front of the nearest houses: a slightly lighter band for their light to fall on */}
      {row === 'front' && <rect x={-1700} y={S.base} width={5400} height={46} fill="#22132C" />}
      <g filter="url(#cut)">
        {houses.map((h) => {
          const top = h.base - h.wall;
          const ov = 9 * S.scale;
          const wall = S.walls[h.tone % S.walls.length], roofC = S.roofs[h.tone % S.roofs.length];
          // two faint shingle lines across the roof: clipped to the roof's triangle by hand
          const lines = [0.38, 0.7].map((f) => {
            const y = h.peak.y + h.roof * f; const hw = (h.w / 2 + ov) * f;
            return <line key={f} x1={h.peak.x - hw + 3} y1={y} x2={h.peak.x + hw - 3} y2={y} stroke={rimC} strokeOpacity={0.16} strokeWidth={1.2} />;
          });
          return (
            <g key={h.id}>
              {h.chimney != null && <rect x={h.x + h.w * h.chimney} y={top - h.roof * 0.78} width={15 * S.scale} height={h.roof * 0.62} fill={roofC} />}
              <rect x={h.x} y={top} width={h.w} height={h.wall + 6} fill={wall} />
              {/* the shaded side of the house: a darker band on the right gives each one volume */}
              <rect x={h.x + h.w * 0.82} y={top} width={h.w * 0.18} height={h.wall + 6} fill="#0A0410" opacity={0.18} />
              <path d={`M${h.x - ov} ${top + 3} L${h.peak.x} ${h.peak.y} L${h.x + h.w + ov} ${top + 3} Z`} fill={roofC} />
              {lines}
              {/* rim light along the roof: cold at first, purple once the light is free */}
              <path d={`M${h.x - ov} ${top + 3} L${h.peak.x} ${h.peak.y} L${h.x + h.w + ov} ${top + 3}`} fill="none" stroke={rimC} strokeWidth={2 * S.scale + 0.4} strokeOpacity={0.6} strokeLinejoin="round" />
              {h.door && <path d={`M${h.peak.x - 13 * S.scale} ${h.base} l0 ${-30 * S.scale} a${13 * S.scale} ${13 * S.scale} 0 0 1 ${26 * S.scale} 0 l0 ${30 * S.scale} Z`} fill={roofC} />}
            </g>
          );
        })}
      </g>
      {/* light from each window spilling onto the walls and the night: one blurred layer per row */}
      <g filter="url(#glow)">
        {wins.map((w) => {
          const s = winState(w);
          const app = Math.min(1, s.flip * 2);
          const pad = 14 * S.scale;
          return (
            <g key={w.id}>
              {s.b > 0.02 && app < 1 && <rect x={w.x - pad / 2} y={w.y - pad / 2} width={w.w + pad} height={w.h + pad} fill={P.cold} opacity={0.2 * s.b * (1 - app)} />}
              {app > 0 && <rect x={w.x - pad} y={w.y - pad} width={w.w + pad * 2} height={w.h + pad * 3} fill={w.theme.glow} opacity={0.75 * app} />}
              {/* a pool of the window's light on the street below */}
              {app > 0 && <ellipse cx={w.x + w.w / 2} cy={TOWN[row].houses[w.house].base + 10 * S.scale} rx={w.w * 1.3} ry={12 * S.scale} fill={w.theme.glow} opacity={0.5 * app} />}
            </g>
          );
        })}
      </g>
      {wins.map((w) => <Window key={w.id} w={w} {...winState(w)} wall={S.walls[TOWN[row].houses[w.house].tone % S.walls.length]} />)}
    </g>
  );
};

/** One window: identical cold glass with a cross, which flips like a card into its own youcoded. */
const Window: React.FC<{ w: Win; b: number; flip: number; wall: string }> = ({ w, b, flip, wall }) => {
  const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
  // flip: 0..0.5 the old glass turns away, 0.5..1 the app turns toward us with a small overshoot
  const turned = flip >= 0.5;
  const q = turned ? (flip - 0.5) * 2 : flip * 2;
  const sx = turned ? Math.min(1.08, Math.sin(q * Math.PI * 0.62) / Math.sin(Math.PI * 0.62)) : Math.max(0.001, Math.cos(q * Math.PI / 2));
  const pop = turned ? 1 + 0.1 * Math.sin(q * Math.PI) : 1;
  const flash = turned ? Math.max(0, 1 - q * 2.2) : 0;
  const tf = `translate(${cx} ${cy}) scale(${sx * pop} ${pop}) translate(${-cx} ${-cy})`;
  const sill = <rect x={w.x - 3} y={w.y + w.h} width={w.w + 6} height={3.5} fill={mix(wall, '#7E6290', 0.45)} />;
  if (!turned) {
    const glass = mix(P.glassOff, P.cold, b);
    return (
      <g>
        <rect x={w.x - 2} y={w.y - 2} width={w.w + 4} height={w.h + 4} rx={2} fill="#120A19" />
        <g transform={tf}>
          <rect x={w.x} y={w.y} width={w.w} height={w.h} rx={1.5} fill={glass} />
          <rect x={cx - 1.2} y={w.y} width={2.4} height={w.h} fill={wall} />
          <rect x={w.x} y={cy - 1.2} width={w.w} height={2.4} fill={wall} />
        </g>
        {sill}
      </g>
    );
  }
  return (
    <g>
      <rect x={w.x - 2} y={w.y - 2} width={w.w + 4} height={w.h + 4} rx={2} fill="#120A19" />
      <g transform={tf}>
        <AppWin x={w.x} y={w.y} w={w.w} h={w.h} theme={w.theme} layout={w.layout} />
        {flash > 0 && <rect x={w.x} y={w.y} width={w.w} height={w.h} fill="#FFFFFF" opacity={flash * 0.7} />}
      </g>
      {sill}
    </g>
  );
};

// ---------- sky, hills, foreground ----------
export const SkyBack: React.FC<{ warm: number; field: number }> = ({ warm, field }) => (
  <g>
    <defs>
      <linearGradient id="t1sky" x1="0" y1="-900" x2="0" y2="900" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor={P.skyTop} />
        <stop offset="0.45" stopColor={P.skyMid} />
        <stop offset="0.78" stopColor={mix(P.skyLow, '#3B1D4A', warm)} />
        <stop offset="1" stopColor={mix(P.horizon, '#6A3474', warm)} />
      </linearGradient>
      {/* the colour field (brand §8): a wide, dim lift of deep purple from the lower right, never a ball */}
      <radialGradient id="t1field" cx="1500" cy="980" r="1500" gradientUnits="userSpaceOnUse" gradientTransform="translate(1500 980) scale(1.25 0.6) translate(-1500 -980)">
        <stop offset="0" stopColor="#8A3F8E" stopOpacity="0.85" />
        <stop offset="0.55" stopColor="#5A2766" stopOpacity="0.35" />
        <stop offset="1" stopColor="#2A1236" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect x={-1500} y={-1400} width={4900} height={3200} fill="url(#t1sky)" />
    <rect x={-1500} y={-1400} width={4900} height={3200} fill="url(#t1field)" opacity={field} />
  </g>
);

const STARS = (() => { const R = rng(3); return Array.from({ length: 46 }, () => ({ x: -300 + R() * 2500, y: -500 + R() * 820, r: 0.8 + R() * 1.3, o: 0.18 + R() * 0.35 })); })();
export const Stars: React.FC<{ o: number }> = ({ o }) => (
  <g>{STARS.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#E9DDF2" opacity={s.o * o} />)}</g>
);
/** A paper-cut crescent moon: flat, no glow (the brand bans glowing orbs). */
export const Moon: React.FC = () => (
  <g>
    <defs><mask id="t1moon"><rect x={0} y={-400} width={900} height={900} fill="#fff" /><circle cx={262} cy={300} r={50} fill="#000" /></mask></defs>
    <circle cx={230} cy={320} r={52} fill="#E6D9F0" mask="url(#t1moon)" opacity={0.92} />
  </g>
);

const cloudPath = (x: number, y: number, s: number) =>
  `M${x} ${y} h${200 * s} a${26 * s} ${26 * s} 0 0 0 ${-30 * s} ${-30 * s} a${40 * s} ${40 * s} 0 0 0 ${-70 * s} ${-22 * s} a${30 * s} ${30 * s} 0 0 0 ${-55 * s} ${8 * s} a${28 * s} ${28 * s} 0 0 0 ${-45 * s} ${44 * s} Z`;
export const Clouds: React.FC<{ t: number }> = ({ t }) => (
  <g>
    {[{ x: 120, y: 330, s: 1.5, v: 7 }, { x: 1250, y: 250, s: 1.2, v: 5 }, { x: 1700, y: 420, s: 1.7, v: 6 }, { x: -500, y: 470, s: 1.3, v: 8 }, { x: 640, y: 120, s: 1.0, v: 4 }].map((c, i) => (
      <g key={i} transform={`translate(${c.v * t} 0)`} filter="url(#cut)">
        <path d={cloudPath(c.x, c.y, c.s)} fill="#24152F" opacity={0.85} />
        <path d={cloudPath(c.x, c.y, c.s)} fill="none" stroke="#4A3358" strokeWidth={1.2} strokeOpacity={0.5} />
      </g>
    ))}
  </g>
);

export const Hills: React.FC<{ far?: boolean }> = ({ far }) => (
  <path filter="url(#cut)" fill={far ? P.hill2 : P.hill} d={far
    ? 'M-1600 1500 L-1600 760 C-1100 690 -700 720 -300 750 C200 790 500 700 1000 720 C1500 740 1900 690 2400 730 C2800 760 3200 720 3600 740 L3600 1500 Z'
    : 'M-1600 1500 L-1600 820 C-1200 790 -800 800 -400 815 C0 830 400 790 800 805 C1200 820 1600 785 2000 800 C2400 815 2900 790 3600 810 L3600 1500 Z'} />
);

/** Foreground: a dark rise and two bare storybook trees framing the edges. */
export const Foreground: React.FC = () => {
  const tree = (x: number, flip: number) => (
    <g transform={`translate(${x} 1036) scale(${flip} 1)`} stroke={P.fore} fill="none" strokeLinecap="round">
      <path d="M0 40 C6 -60 -10 -150 8 -250" strokeWidth={22} />
      <path d="M4 -120 C40 -150 70 -170 120 -230" strokeWidth={10} />
      <path d="M2 -180 C-30 -210 -50 -240 -70 -300" strokeWidth={8} />
      <path d="M8 -250 C12 -290 30 -320 34 -360" strokeWidth={7} />
      <path d="M80 -190 C95 -200 120 -200 150 -195" strokeWidth={5} />
      <path d="M-40 -235 C-60 -240 -80 -230 -105 -250" strokeWidth={4} />
      <path d="M95 -210 C100 -240 110 -260 105 -285" strokeWidth={4} />
    </g>
  );
  return (
    <g filter="url(#cut)">
      <path fill={P.fore} d="M-1200 1700 L-1200 1008 C-700 992 -300 1018 200 1026 C700 1036 1200 1032 1700 1022 C2100 1014 2600 994 3100 1008 L3100 1700 Z" />
      {tree(-30, 1)}
      {tree(1950, -1)}
    </g>
  );
};

/** Shared SVG filters: hand-cut paper edges with a soft shadow, and window glow. */
export const Defs: React.FC = () => (
  <defs>
    {/* WHY: a tiny displacement makes every silhouette edge look cut by hand, and the shadow
        separates each paper layer from the one behind it (the multiplane storybook look). */}
    <filter id="cut" x="-10%" y="-20%" width="120%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="3.5" xChannelSelector="R" yChannelSelector="G" result="d" />
      <feGaussianBlur in="d" stdDeviation="7" result="b" />
      <feOffset in="b" dx="2" dy="7" result="o" />
      <feFlood floodColor="#05020A" floodOpacity="0.6" />
      <feComposite in2="o" operator="in" result="s" />
      <feMerge><feMergeNode in="s" /><feMergeNode in="d" /></feMerge>
    </filter>
    <filter id="glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="9" /></filter>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16" /></filter>
    <linearGradient id="t1trail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E7C8F0" /><stop offset="1" stopColor="#C387D3" /></linearGradient>
    <linearGradient id="t1townglow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#B25BA8" stopOpacity="0" /><stop offset="0.7" stopColor="#B25BA8" stopOpacity="0.22" /><stop offset="1" stopColor="#D27AB8" stopOpacity="0.5" />
    </linearGradient>
    <radialGradient id="t1halo">
      <stop offset="0" stopColor="#E7C8F0" stopOpacity="0.75" />
      <stop offset="0.35" stopColor="#C387D3" stopOpacity="0.28" />
      <stop offset="1" stopColor="#9750AA" stopOpacity="0" />
    </radialGradient>
  </defs>
);
