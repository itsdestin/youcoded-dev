// Round two, take 1: "Once upon a time". See docs/active/design/2026-11-19-campaign-round2/takes.md.
// A storybook in plum and purple: a few tall towers over a town where every window looks the same.
// The towers take three things from the town; a purple light slips out of their tallest tower; window
// by window the town turns into different youcodeds; the three things come back; the town ends brighter.
//
// WHY every time below is a word: cues are read from the narrator's word timings (take1-words.ts), so
// pictures land on the syllable they illustrate. No hand-typed seconds except tiny offsets around a word.
import React from 'react';
import { AbsoluteFill, Audio, Easing, interpolate, spring, staticFile, useCurrentFrame } from 'remotion';
import { C, DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT, FPS } from '../brand';
import { EndCard, useU } from '../kit';
import { E, T, captions } from './take1-words';
import {
  ALL_WINS, CX, CY, Cam, Clouds, Defs, FarTowers, FRONT, Foreground, Hills, K, Moon, Row, SkyBack, Stars,
  TOWERS, TOWN, Tower, Win, aim, layerTransform, project, towerGeo,
} from './take1-scene';

// ---------- small timing helpers ----------
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
/** 0→1 between two times (seconds). */
const r = (t: number, a: number, b: number, e: (x: number) => number = EASE_OUT) => interpolate(t, [a, b], [0, 1], { ...clamp, easing: e });
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const BACK_OUT = Easing.bezier(0.34, 1.56, 0.64, 1);
const SMOOTH = Easing.bezier(0.45, 0, 0.25, 1);
const seeded = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------- the cues (all from the recording) ----------
const END_WORDS = E('everything', 2);
export const END_CARD = END_WORDS + 0.35;           // the end card arrives just after the last word
const G1 = 1.1;                                      // how much taller the towers grow on "hubris"

// ---------- who lives where ----------
const nearestFront = (x: number, skip: number[] = []) =>
  FRONT.houses.filter((h) => !skip.includes(h.id) && FRONT.wins.some((w) => w.house === h.id))
    .reduce((a, b) => (Math.abs(b.x + b.w / 2 - x) < Math.abs(a.x + a.w / 2 - x) ? b : a));
// the window a house hands its thing out of: its upper, most central one
const mainWin = (house: number) => FRONT.wins.filter((w) => w.house === house)
  .sort((a, b) => a.y - b.y || Math.abs(a.x + a.w / 2 - (FRONT.houses[house].x + FRONT.houses[house].w / 2)) - Math.abs(b.x + b.w / 2 - (FRONT.houses[house].x + FRONT.houses[house].w / 2)))[0];

// The three things the towers take, each by the tower whose arm hangs over that house.
type Item = { kind: 'laptop' | 'tag' | 'letter'; tower: number; take: number; release: number; land: number; house: number; win: Win };
const ITEM_DEFS: Omit<Item, 'house' | 'win'>[] = [
  { kind: 'laptop', tower: 0, take: T('computers', 1), release: T('what', 4), land: T('computers', 2) },
  { kind: 'tag', tower: 1, take: T('cost', 1), release: T('what', 5), land: T('costs', 1) },
  { kind: 'letter', tower: 2, take: T('data', 1), release: T('what', 6), land: T('data', 2) },
];
const ITEMS: Item[] = [];
ITEM_DEFS.forEach((d) => {
  const tip = towerGeo(TOWERS[d.tower], 1).armTip;
  const h = nearestFront(tip.x, ITEMS.map((i) => i.house));
  ITEMS.push({ ...d, house: h.id, win: mainWin(h.id) });
});
// Where the light lands: the first youcoded in town, near the middle, not one of the item houses.
const O_HOUSE = nearestFront(1150, ITEMS.map((i) => i.house));
const O = mainWin(O_HOUSE.id);

// ---------- when each window turns ----------
// WHY a schedule built from words: "window by window" should feel like the narration is lighting them.
// Windows nearest the first one go first (a ripple outwards); item houses wait for their thing to land.
const FLIP = new Map<number, number>();
(() => {
  FLIP.set(O.id, T('software'));
  ITEMS.forEach((it) => FRONT.wins.filter((w) => w.house === it.house).forEach((w, j) => FLIP.set(w.id, it.land + 0.06 + j * 0.08)));
  const ox = O.x + O.w / 2;
  const queue = ALL_WINS.filter((w) => !FLIP.has(w.id))
    .map((w) => ({ w, d: Math.abs(w.x + w.w / 2 - ox) * (w.row === 'back' ? 1.2 : w.row === 'mid' ? 1.1 : 1) + seeded(w.id) * 90 }))
    .sort((a, b) => a.d - b.d).map((x) => x.w);
  const beats: [number, number][] = [
    [T('ever-scarce'), 1], [T('foundation'), 1], [T('monopolies', 1), 2],
    [T('anyone'), 3], [T('who'), 3], [T('asks'), 4],
    [T('so'), 2], [T('first'), 3], [T('time', 1), 3], [T('very'), 3], [T('long', 1), 3], [T('while'), 4], [T('get'), 4], [T('decide'), 6],
    [T('can', 2), 3], [T('do', 2), 3], [T('it', 3) + 0.05, 3], [T('happens'), 4], [T('free'), 5], [T('ourselves'), 4],
  ];
  let q = 0;
  beats.forEach(([at, n]) => { for (let j = 0; j < n && q < queue.length; j++) FLIP.set(queue[q++].id, at + j * 0.07); });
  // the finale: everything left, in three swells on "long, long last", each sweeping left to right
  const rest = queue.slice(q);
  const swells = [T('long', 2), T('long', 3), T('last')];
  rest.forEach((w, i) => {
    const s = i % 3;
    const xs = Math.max(0, Math.min(1, (w.x + 300) / 2500));
    FLIP.set(w.id, swells[s] + xs * 0.55 + seeded(w.id + 9) * 0.08);
  });
})();

// ---------- the camera ----------
// WHY keys at words: each move starts or settles on the phrase it serves. Between keys the camera eases;
// a slow breathing drift on top keeps any held shot from freezing.
const g1 = towerGeo(TOWERS[1], 1), g2 = towerGeo(TOWERS[1], G1);
const CAM_KEYS: [number, Cam][] = [
  [0, aim(K.towers, 1000, 330, 1.3)],
  [T('technology', 1) + 0.5, { cx: CX, cy: 525, z: 1 }],
  [T('data', 1) + 1.3, { cx: 960, cy: 535, z: 1.03 }],
  [E('nothing') + 0.2, { cx: 940, cy: 720, z: 1.45 }],
  [T('something') - 0.05, aim(K.towers, 1010, g1.lantern.y + 120, 1.55)],
  [E('happened', 2) + 0.3, aim(K.towers, 1010, g1.lantern.y + 100, 1.85)],
  [E('hubris') + 0.3, aim(K.towers, 1010, 330, 1.08)],
  [E('intelligence'), aim(K.towers, 1010, g2.lantern.y + 20, 2.1)],
  [T('treasure') + 0.1, aim(K.towers, g2.chest.x - 10, g2.chest.y - 30, 2.9)],
  [E('value') + 0.3, aim(K.towers, g2.chest.x - 10, g2.chest.y - 46, 3.0)],
  [T('beyond'), aim(K.towers, 1000, g2.lantern.y + 30, 1.9)],
  // WHY a wide midpoint: following the falling light straight down at full zoom was a whip; easing out
  // through a wider frame halves the on-screen speed and shows the light crossing from towers to town
  [(T('control') + T('tool')) / 2, { cx: 1000, cy: 330, z: 1.15 }],
  [T('tool') + 0.1, aim(1, O.x + O.w / 2, O.y - 110, 1.7)],
  [E('software') + 0.4, aim(1, O.x + O.w / 2, O.y - 100, 1.8)],
  [E('asks') + 0.2, aim(1, O.x + O.w / 2 - 60, O.y - 170, 1.32)],
  [E('decide'), { cx: 960, cy: 640, z: 1.2 }],
  [E('data', 2) + 0.3, { cx: 960, cy: 625, z: 1.18 }],
  [E('past'), { cx: 960, cy: 620, z: 1.12 }],
  [END_CARD, { cx: 960, cy: 670, z: 1.24 }],
  [80, { cx: 960, cy: 680, z: 1.27 }],
];
const camAt = (t: number): Cam => {
  let i = 0;
  while (i < CAM_KEYS.length - 2 && t >= CAM_KEYS[i + 1][0]) i++;
  const [t0, a] = CAM_KEYS[i], [t1, b] = CAM_KEYS[i + 1];
  const p = SMOOTH(Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));
  return {
    cx: lerp(a.cx, b.cx, p) + Math.sin(t * 0.21) * 7,
    cy: lerp(a.cy, b.cy, p) + Math.sin(t * 0.15 + 1) * 5,
    z: lerp(a.z, b.z, p) * (1 + 0.006 * Math.sin(t * 0.18)),
  };
};

// ---------- the drawings that move ----------
/** The purple light: a small flame with a soft halo; `squash` while it slips between bars. */
const Light: React.FC<{ x: number; y: number; s: number; t: number; squash?: number; halo?: number }> = ({ x, y, s, t, squash = 0, halo = 1 }) => {
  const fl = 1 + 0.06 * Math.sin(t * 9.1) + 0.04 * Math.sin(t * 13.7);   // a candle's flicker, never a strobe
  return (
    <g transform={`translate(${x} ${y}) scale(${s * (1 - squash * 0.6)} ${s * fl * (1 + squash * 0.35)})`}>
      <circle r={70} fill="url(#t1halo)" opacity={halo} />
      <path d="M0 -20 C9 -8 12 0 12 6 C12 14 6 19 0 19 C-6 19 -12 14 -12 6 C-12 0 -9 -8 0 -20 Z" fill="#C387D3" />
      <path d="M0 -12 C5 -4 7 2 7 7 C7 12 4 15 0 15 C-4 15 -7 12 -7 7 C-7 2 -5 -4 0 -12 Z" fill="#F6EEFB" />
    </g>
  );
};

/** The three things, drawn as paper cut-outs. `size` is in screen pixels. */
const Thing: React.FC<{ kind: Item['kind']; x: number; y: number; size: number; rot: number; o: number }> = ({ kind, x, y, size, rot, o }) => {
  const s = size / 60;
  let art: React.ReactNode;
  if (kind === 'laptop') art = (<g>
    <rect x={-24} y={-30} width={48} height={32} rx={4} fill="#EFE3F6" />
    <rect x={-19} y={-25} width={38} height={22} rx={2} fill="#9750AA" />
    <rect x={-13} y={-20} width={16} height={4} rx={2} fill="#F7F0FB" opacity={0.9} />
    <rect x={-13} y={-13} width={24} height={3} rx={1.5} fill="#F7F0FB" opacity={0.55} />
    <path d="M-30 2 L30 2 L26 9 L-26 9 Z" fill="#C9B0DB" />
  </g>);
  else if (kind === 'tag') art = (<g transform="rotate(-12)">
    <path d="M-26 -16 L14 -16 L28 0 L14 16 L-26 16 Q-30 16 -30 12 L-30 -12 Q-30 -16 -26 -16 Z" fill="#EFE3F6" />
    <circle cx={14} cy={0} r={4} fill="#21152C" />
    <text x={-10} y={9} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={24} fill="#9750AA">$</text>
  </g>);
  else art = (<g>
    <rect x={-28} y={-19} width={56} height={38} rx={3} fill="#EFE3F6" />
    <path d="M-28 -17 L0 4 L28 -17" fill="none" stroke="#C9B0DB" strokeWidth={3} strokeLinejoin="round" />
    <circle cx={0} cy={4} r={7} fill="#9750AA" />
    <path d="M-3 3 L-1 6 L3 1" fill="none" stroke="#F7F0FB" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
  </g>);
  return <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} opacity={o} filter="url(#lift)">{art}</g>;
};

/** A hook on a line, hanging from a tower's arm. */
const Hook: React.FC<{ ax: number; ay: number; hx: number; hy: number; s: number; o: number }> = ({ ax, ay, hx, hy, s, o }) => (
  <g opacity={o} stroke="#B7A3C8" fill="none" strokeLinecap="round">
    <line x1={ax} y1={ay} x2={hx} y2={hy} strokeWidth={1.4} strokeOpacity={0.8} />
    {/* a weighted block and a curled hook: it should read as a crane's hook even when small */}
    <rect x={hx - 4 * s} y={hy - 2 * s} width={8 * s} height={7 * s} rx={1.5 * s} fill="#B7A3C8" stroke="none" />
    <path d={`M${hx} ${hy + 5 * s} l0 ${9 * s} a${6 * s} ${6 * s} 0 1 1 ${-11 * s} ${1 * s}`} strokeWidth={2.6 * Math.max(0.8, s)} />
  </g>
);

// ---------- type ----------
type HWord = { text: string; at: number; accent?: boolean };
/** A headline whose words arrive exactly as they are spoken (DM Sans 900, lowercase, one purple word). */
const Headline: React.FC<{ words: HWord[]; out: number; y: number; t: number; size?: number }> = ({ words, out, y, t, size = 5.4 }) => {
  const u = useU();
  if (t < words[0].at - 0.1 || t > out + 0.05) return null;
  const exit = r(t, out - 0.4, out, EASE_IN);
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={{
        position: 'absolute', top: `${y}%`, transform: `translateY(-50%) translateY(${-exit * 0.8 * u}px)`, opacity: 1 - exit,
        width: '84%', textAlign: 'center', fontFamily: DMSANS, fontWeight: 900, fontSize: size * u, letterSpacing: '-0.05em',
        lineHeight: 1.04, color: C.nightText, textShadow: `0 ${0.2 * u}px ${2.4 * u}px rgba(10,4,16,0.85)`,
      }}>
        {words.map((w, i) => {
          const p = r(t, w.at - 0.06, w.at + 0.42);
          return (
            <span key={i} style={{
              display: 'inline-block', marginRight: '0.24em', opacity: p, transform: `translateY(${(1 - p) * 0.3}em)`,
              filter: p < 1 ? `blur(${(1 - p) * 0.1}em)` : undefined, color: w.accent ? C.purpleNight : undefined,
            }}>{w.text}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const FINAL: HWord[] = [{ text: 'open', at: T('open') }, { text: 'source', at: T('source') }, { text: 'everything.', at: T('everything', 2), accent: true }];
const HEADLINES: { words: HWord[]; out: number; y: number }[] = [
  { words: [{ text: 'own', at: T('own', 1) }, { text: 'nothing.', at: T('nothing'), accent: true }], out: T('however') - 0.1, y: 22 },
  { words: [{ text: 'something', at: T('something') }, { text: 'wonderful', at: T('wonderful'), accent: true }, { text: 'happened.', at: T('happened', 2) }], out: T('blinded') + 0.5, y: 76 },
  { words: [{ text: 'for', at: T('for', 2) }, { text: 'anyone', at: T('anyone'), accent: true }, { text: 'who', at: T('who') }, { text: 'asks.', at: T('asks') }], out: T('so') - 0.05, y: 20 },
];
const CAPS = captions(T('open') - 0.2);

/** The muted version's captions: the whole script, one sentence at a time, sentence case. */
const Captions: React.FC<{ t: number }> = ({ t }) => {
  const u = useU();
  const c = CAPS.find((x) => t >= x.at - 0.05 && t <= x.out + 0.05);
  if (!c) return null;
  const o = Math.min(r(t, c.at, c.at + 0.3), 1 - r(t, c.out - 0.25, c.out, EASE_IN));
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={{
        position: 'absolute', top: '9%', width: '72%', textAlign: 'center', opacity: o, transform: `translateY(${(1 - o) * 0.5 * u}px)`,
        fontFamily: DMSANS, fontWeight: 500, fontSize: 2.75 * u, lineHeight: 1.28, letterSpacing: '-0.012em', color: C.nightText,
        textShadow: `0 ${0.15 * u}px ${1.6 * u}px rgba(10,4,16,0.9)`, textWrap: 'balance',
      }}>{c.text}</div>
    </AbsoluteFill>
  );
};

/** Film grain and a gentle vignette, on top of everything: the paper and the lens. */
const Grain: React.FC<{ frame: number }> = ({ frame }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 70% at 50% 52%, transparent 55%, rgba(8,3,13,0.55) 100%)' }} />
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, mixBlendMode: 'overlay', opacity: 0.16 }}>
      <filter id="t1grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={Math.floor(frame / 2) % 50} /><feColorMatrix type="saturate" values="0" /></filter>
      <rect width="100%" height="100%" filter="url(#t1grain)" />
    </svg>
  </AbsoluteFill>
);

// ---------- the film ----------
export const Take1: React.FC<{ narrator?: boolean }> = ({ narrator = true }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cam = camAt(t);

  // --- the towers ---
  const growth = 1 + (G1 - 1) * spring({ frame: frame - Math.round(T('hubris') * FPS), fps: FPS, config: { damping: 11, mass: 0.9, stiffness: 90 } });
  const corp = T('corporations', 1);
  const flare = Math.min(r(t, T('blinded'), T('blinded') + 0.5), 1 - r(t, E('hubris'), E('hubris') + 1.2, EASE_IN_OUT));
  const excited = Math.min(r(t, T('excitement'), T('excitement') + 0.3), 1 - r(t, E('excitement') + 0.4, T('beyond'), EASE_IN_OUT));
  const towerLit = (row: number, rows: number, col: number) => {
    let L = 0.22 + 0.78 * r(t, corp + (row / rows) * 0.8, corp + (row / rows) * 0.8 + 0.35);
    L += 0.65 * flare * (0.7 + 0.3 * seeded(row * 7 + col));
    L *= 1 - 0.45 * excited * (0.5 + 0.5 * Math.sin(t * 11 + row * 0.8 + col * 2.3));
    const off = T('monopolies', 2) + (1 - row / rows) * 1.2;
    L *= 1 - 0.92 * r(t, off, off + 0.3);
    return L;
  };
  const recede = r(t, T('monopolies', 2), E('past') + 0.8, EASE_IN_OUT);

  // --- the light and the purple it brings ---
  const kindle = r(t, T('something'), T('wonderful') + 0.25, EASE_OUT);
  const purple = r(t, T('happened', 2), T('happened', 2) + 1.4, EASE_IN_OUT);
  const brightAI = 1 + 0.25 * r(t, T('artificial'), E('intelligence'));
  const field = 0.15 * purple + 0.85 * r(t, T('time', 3), E('everything', 2) + 0.4, EASE_IN_OUT);
  const hush = Math.min(r(t, T('however'), T('however') + 0.6, EASE_IN_OUT), 1 - r(t, T('something'), T('wonderful'), EASE_IN_OUT));
  const G = towerGeo(TOWERS[1], growth);
  const escapeAt = T('beyond'), outAt = T('control'), landAt = T('software');

  // --- the town's windows ---
  const tech = T('technology', 1), nothing = T('nothing');
  const winState = (w: Win) => {
    const on = r(t, tech + Math.max(0, (w.x + 300) / 2500) * 0.5, tech + Math.max(0, (w.x + 300) / 2500) * 0.5 + 0.25);
    const dim = r(t, nothing + seeded(w.id) * 0.7, nothing + seeded(w.id) * 0.7 + 0.5, EASE_IN_OUT);
    const b = 0.1 + 0.75 * on - 0.5 * dim;
    const ft = FLIP.get(w.id) ?? 999;
    return { b, flip: Math.max(0, Math.min(1, (t - ft) / 0.42)) };
  };

  // how much of the town has turned: drives the warm band of town light over the roofs
  const townGlow = ALL_WINS.reduce((n, w) => n + (t >= (FLIP.get(w.id) ?? 999) ? 1 : 0), 0) / ALL_WINS.length;

  // --- strings from every house to a tower ("subscribe to everything") ---
  const subs = T('subscribe'), freeAt = T('free');
  const strings: React.ReactNode[] = [];
  [...TOWN.back.houses, ...TOWN.mid.houses, ...TOWN.front.houses].forEach((h, i) => {
    if (h.x < -500 || h.x > 2350 || (h.row !== 'front' && i % 2)) return;
    const tw = TOWERS.reduce((a, b) => (Math.abs(b.x - h.peak.x) < Math.abs(a.x - h.peak.x) ? b : a));
    const geo = towerGeo(tw, growth);
    const ay = geo.top + (TOWER_SPAN(tw) * (0.25 + 0.4 * seeded(i + 3)));
    const side = h.peak.x < tw.x ? -1 : 1;
    const A = project(cam, K.towers, tw.x + side * geo.half(ay) * 0.9, ay + recede * 30);
    const B = project(cam, K[h.row], h.peak.x, h.peak.y);
    const d0 = subs + Math.min(1, Math.abs(h.peak.x - 960) / 1500) * 1.2;
    const grow = r(t, d0, d0 + 0.5, EASE_IN_OUT);
    if (grow <= 0) return;
    const snapT = freeAt + seeded(i) * 0.45;
    const snap = r(t, snapT, snapT + 0.7, EASE_OUT);
    if (snap >= 1) return;
    // the line grows down from the tower; after "free" its lower end whips back up and fades
    const reach = grow * (1 - snap);
    const bx = lerp(A.x, B.x, reach), by = lerp(A.y, B.y, reach);
    const sag = 40 * (1 - snap) + snap * 60 * (side);
    const mx = (A.x + bx) / 2 + snap * 30 * side, my = (A.y + by) / 2 + sag;
    strings.push(<path key={i} d={`M${A.x} ${A.y} Q${mx} ${my} ${bx} ${by}`} fill="none" stroke="#B9A6CB" strokeWidth={1.1} strokeOpacity={0.32 * (1 - snap)} />);
  });

  // --- hooks and the three things ---
  const hooks: React.ReactNode[] = [];
  const things: React.ReactNode[] = [];
  ITEMS.forEach((it, i) => {
    const tw = TOWERS[it.tower];
    const geo = towerGeo(tw, growth);
    const A = project(cam, K.towers, geo.armTip.x, geo.armTip.y + 8 + recede * 30);
    const W = project(cam, K.front, it.win.x + it.win.w / 2, it.win.y + it.win.h / 2);
    const sT = project(cam, K.towers, tw.x, geo.armTip.y + 40);
    const s = lerp(A.s, W.s, 0.5);
    const size = 60 * s;
    const hang = { x: A.x, y: A.y + 54 * A.s };
    const N = it.take;
    const towersGone = 1 - recede;
    let hook = { x: A.x, y: A.y + 12 * A.s };
    let thing: { x: number; y: number; sz: number; rot: number; o: number } | null = null;
    if (t < it.release) {
      const down = r(t, N - 1.0, N - 0.1, EASE_IN_OUT);
      const pop = r(t, N, N + 0.4, BACK_OUT);
      const lift = r(t, N + 0.35, N + 1.5, EASE_IN_OUT);
      const stow = r(t, N + 1.5, N + 1.95, EASE_IN);
      const out = r(t, it.release - 0.7, it.release - 0.2, EASE_OUT);
      if (t < N + 1.5) {
        const startY = W.y - 26 * W.s * pop;
        const px = lerp(W.x, hang.x, lift) + Math.sin(lift * Math.PI) * 26 * (i - 1);
        const py = lerp(startY, hang.y, lift);
        hook = lift > 0 || pop > 0 ? { x: px, y: py - size * 0.42 } : { x: lerp(A.x, W.x, down), y: lerp(A.y + 12 * A.s, W.y - size * 0.3, down) };
        if (pop > 0) thing = { x: px, y: py, sz: size * pop * lerp(1, A.s / s, lift), rot: Math.sin(t * 3 + i) * 6 * lift, o: 1 };
      } else if (t < it.release - 0.7) {
        // stowed: slides into the tower and is gone; the empty hook stays up there, waiting
        thing = stow < 1 ? { x: lerp(hang.x, sT.x, stow), y: hang.y, sz: size * A.s / s * (1 - 0.5 * stow), rot: 0, o: 1 - stow } : null;
      } else {
        thing = { x: lerp(sT.x, hang.x, out), y: hang.y, sz: 60 * A.s, rot: 0, o: out };
        hook = { x: hang.x, y: hang.y - 60 * A.s * 0.42 };
      }
    } else {
      // released: the line lets go and the thing drifts home, swaying like a leaf, landing on its word
      const p = r(t, it.release, it.land, EASE_IN_OUT);
      const into = r(t, it.land, it.land + 0.22, EASE_IN);
      const sway = Math.sin(p * Math.PI * 2) * 34 * (1 - p) * s;
      thing = into < 1 ? { x: lerp(hang.x, W.x, p) + sway, y: lerp(hang.y, W.y, p), sz: lerp(60 * A.s, 60 * W.s * 0.8, p) * (1 - 0.7 * into), rot: sway * 0.5, o: 1 - into } : null;
      const back = r(t, it.release, it.release + 0.5, EASE_OUT);
      hook = { x: hang.x, y: lerp(hang.y - 25 * A.s, A.y + 12 * A.s, back) };
    }
    hooks.push(<Hook key={i} ax={A.x} ay={A.y} hx={hook.x} hy={hook.y} s={A.s} o={towersGone} />);
    if (thing) things.push(<Thing key={i} kind={it.kind} x={thing.x} y={thing.y} size={thing.sz} rot={thing.rot} o={thing.o} />);
  });

  // --- the light's journey ---
  const L0 = G.lantern;
  let lightInTower: React.ReactNode = null;
  let lightFree: React.ReactNode = null;
  if (t >= T('something') - 0.1 && t < escapeAt) {
    lightInTower = <Light x={L0.x} y={L0.y + 10} s={(0.2 + 1.3 * kindle) * (0.9 + 0.1 * brightAI)} t={t} halo={kindle * brightAI} />;
  } else if (t >= escapeAt && t < landAt + 0.4) {
    const exitPt = { x: L0.x - L0.w / 2 - 30, y: L0.y + 20 };
    const inLantern = project(cam, K.towers, L0.x, L0.y + 10);
    const outside = project(cam, K.towers, exitPt.x, exitPt.y);
    const W = project(cam, K.front, O.x + O.w / 2, O.y + O.h / 2);
    // free: it drifts down in a lazy S, hovers on "a tool", then darts into the window on "software"
    const hover = T('tool');
    const path = (tj: number) => {
      const p1 = r(tj, outAt, hover, SMOOTH) * 0.86;
      const p2 = r(tj, T('make'), landAt, EASE_IN);
      const p = p1 + 0.14 * p2;
      return {
        x: lerp(outside.x, W.x, p) + Math.sin(p * Math.PI * 2.2) * (1 - p) * 120,
        y: lerp(outside.y, W.y - 40 * W.s * (1 - p2), p) + Math.sin(tj * 3.2) * 6 * (1 - p2) * r(tj, hover - 0.3, hover),
        s: lerp(outside.s * 1.5, W.s * 0.9, p),
      };
    };
    let x: number, y: number, s: number, squash = 0;
    if (t < outAt) {
      // squeezing sideways between two bars
      const p = r(t, escapeAt, outAt, EASE_IN_OUT);
      squash = Math.sin(p * Math.PI);
      x = lerp(inLantern.x, outside.x, p); y = lerp(inLantern.y, outside.y, p); s = inLantern.s * 1.5;
    } else ({ x, y, s } = path(t));
    const gone = r(t, landAt - 0.02, landAt + 0.14, EASE_IN);   // WHY quick: the light becomes the window, it must not linger on top of it
    // the trail: the same path over the last half second, drawn as one tapering ribbon (not dots, which
    // would read as particles: the brand bans those)
    let trail: React.ReactNode = null;
    if (t > outAt + 0.04) {
      const pts: { x: number; y: number }[] = [];
      for (let j = 0; j <= 18; j++) { const tj = t - j * 0.03; if (tj < outAt) break; pts.push(path(tj)); }
      if (pts.length > 2) {
        const left: string[] = [], right: string[] = [];
        pts.forEach((pt, j) => {
          const n = pts[Math.min(pts.length - 1, j + 1)], m = pts[Math.max(0, j - 1)];
          const dx = n.x - m.x, dy = n.y - m.y, len = Math.hypot(dx, dy) || 1;
          const wdt = 5.5 * s * (1 - j / pts.length);
          left.push(`${pt.x - (dy / len) * wdt} ${pt.y + (dx / len) * wdt}`);
          right.push(`${pt.x + (dy / len) * wdt} ${pt.y - (dx / len) * wdt}`);
        });
        trail = <path d={`M${left.join(' L')} L${right.reverse().join(' L')} Z`} fill="url(#t1trail)" opacity={0.75 * (1 - gone)} />;
      }
    }
    lightFree = (<g>{trail}<Light x={x} y={y} s={s * (1 - gone * 0.9)} t={t} squash={squash} halo={brightAI * (1 - gone)} /></g>);
  }

  // --- the cage and the treasure chest on the tallest tower ---
  const bars = [-33, -11, 11, 33].map((dx, i) => {
    const p = r(t, lerp(T('created', 1), T('technology', 2), i / 3), lerp(T('created', 1), T('technology', 2), i / 3) + 0.35, BACK_OUT);
    return p > 0 ? <rect key={i} x={L0.x + dx - 2.5} y={L0.y - L0.h / 2} width={5} height={L0.h * p} rx={2} fill="#3D2849" stroke="#6E4E80" strokeWidth={0.8} /> : null;
  });
  const chestP = r(t, T('great'), T('great') + 0.45, BACK_OUT);
  const lid = r(t, T('treasure') + 0.15, T('treasure') + 0.7, BACK_OUT);
  const chart = r(t, T('shareholder') - 0.1, E('value'), EASE_OUT);
  const ch = G.chest;
  const chest = chestP > 0 ? (
    <g transform={`translate(${ch.x} ${ch.y}) scale(${chestP * 1.45})`}>
      {/* WHY a tiny line chart instead of gold: the "great treasure" is shareholder value, and the joke lands when the lid opens on nothing but a graph */}
      <path d={`M-14 -12 L-5 -30 L3 -23 L16 -54`} fill="none" stroke="#F3EAF9" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={80} strokeDashoffset={80 * (1 - chart)} />
      {chart > 0.9 && <path d="M16 -54 l-9 3 M16 -54 l1 9" stroke="#F3EAF9" strokeWidth={3.4} strokeLinecap="round" />}
      <rect x={-23} y={-26} width={46} height={26} rx={3} fill="#3B2449" stroke="#8E6AA3" strokeWidth={1.2} />
      <rect x={-23} y={-16} width={46} height={4} fill="#8E6AA3" />
      <rect x={-4} y={-18} width={8} height={9} rx={1.5} fill="#C9B0DB" />
      <g transform={`translate(-23 -26) rotate(${-115 * lid})`}>
        <path d="M0 0 L0 -6 Q23 -20 46 -6 L46 0 Z" fill="#432A52" stroke="#8E6AA3" strokeWidth={1.2} />
      </g>
    </g>
  ) : null;

  const towerRecede = { opacity: 1 - 0.55 * recede, transform: `translate(0 ${recede * 30})` };

  return (
    <AbsoluteFill style={{ background: C.night }}>
      <Audio src={staticFile(narrator ? 'audio/take1-mix.wav' : 'audio/take1-type-mix.wav')} />
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
        <Defs />
        <defs>
          <filter id="lift" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#05020A" floodOpacity="0.55" /></filter>
        </defs>
        <g transform={layerTransform(cam, K.sky)}><SkyBack warm={purple * 0.5 + field * 0.5} field={field} /><Stars o={1 - field * 0.6} /><Moon /></g>
        <g transform={layerTransform(cam, K.cloud)}><Clouds t={t} /></g>
        <g transform={layerTransform(cam, K.hills2)}><Hills far /></g>
        <g transform={layerTransform(cam, K.hills)}><Hills /></g>
        <g transform={layerTransform(cam, K.far)}><g opacity={1 - 0.6 * recede}><FarTowers lit={r(t, corp, corp + 1) * (1 - recede)} /></g></g>
        <g transform={layerTransform(cam, K.towers)}>
          <g opacity={towerRecede.opacity} transform={towerRecede.transform}>
            {TOWERS.map((d, i) => (
              <Tower key={i} d={d} g={growth} lit={towerLit} purple={purple}
                front={d.crown === 'lantern' ? <>{bars}{chest}</> : undefined}>
                {d.crown === 'lantern' ? lightInTower : null}
              </Tower>
            ))}
          </g>
        </g>
        <g transform={layerTransform(cam, K.back)}><Row row="back" winState={winState} rim={purple} townGlow={townGlow} /></g>
        <g transform={layerTransform(cam, K.mid)}><Row row="mid" winState={winState} rim={purple} /></g>
        <g transform={layerTransform(cam, K.front)}><Row row="front" winState={winState} rim={purple} /></g>
        <g>{strings}{hooks}{things}{lightFree}</g>
        <g transform={layerTransform(cam, K.fore)}><Foreground /></g>
      </svg>
      {/* exposure: fade up from night at the start, and the hush on "However, recently…" */}
      <AbsoluteFill style={{ background: '#07030C', opacity: Math.max(1 - r(t, 0, 1.4, EASE_IN_OUT), hush * 0.38) }} />
      <Grain frame={frame} />
      {!narrator && <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(10,5,16,0.55) 0%, rgba(10,5,16,0.28) 20%, transparent 32%)' }} />}
      {narrator ? HEADLINES.map((h, i) => <Headline key={i} words={h.words} out={h.out} y={h.y} t={t} />) : <Captions t={t} />}
      <Headline words={FINAL} out={END_CARD + 0.1} y={29} t={t} />
      <AbsoluteFill style={{ opacity: r(t, END_CARD, END_CARD + 0.6, EASE_IN_OUT) }}>
        <EndCard at={END_CARD + 0.2} tagline />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** How far a tower's shaft runs, for placing string anchors along it. */
const TOWER_SPAN = (d: (typeof TOWERS)[number]) => d.h * 0.9;

