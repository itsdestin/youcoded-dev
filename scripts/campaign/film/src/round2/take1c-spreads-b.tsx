// Take 1C, chapters v–ix (round six): the hats' own invention escapes them, makes each hero exactly what was
// taken from them, undoes the three takings, cuts the strings, and what one person made is shared.
// WHY this shape: the owner's note on the last attempt was "disconnected elements ... random/unrelated to the
// narration". So everything here is the film's small cast (three hats on their tower of windows, Maya, Theo,
// June, the strings, one inkwell, one quill) and the three things taken in chapters ii–iii, nothing else.
//  v    "blinded by their own hubris"            close: the three on their tower, eyes shut smug, hats shoot up
//       "created a new kind of technology"       the short one hooks the inkwell from iv across their desk
//       "artificial intelligence"                close: the purple quill rises out of that inkwell, by itself
//       "they believed … a great treasure"       heads turn to it; the tall one points; it draws a treasure chest
//       "shareholder value"                      coins pile out of the chest; the hats lean back, chins up
//       "but … far beyond their own control"     it stops mid-coin, an arm stretches for it and closes on air;
//                                                 it darts across the gutter to Maya, the camera whip-pans after it
//       "a tool that can make software"          her ask writes itself; the quill draws her a plant app; she blooms
//  vi   "the ever-scarce foundation …"           page turn: their far-off tower of windows; Theo asks and gets his
//                                                 record shelf; the tower wobbles as the hats turn to stare
//       "for anyone who asks"                    June asks and gets her keepsake box; then a held frame
//  vii  "and so … we get to decide"              chapter ii's layout in colour; the quill drops into Maya's hand,
//                                                 is passed Maya → Theo → June, and undoes each taking in turn
//  viii "free ourselves … the past"              line 1's layout in colour; June lets the quill go and it cuts every
//                                                 string; the hats and their tower fade to nothing
//  ix   "at long, long last … everything"        a copy of Maya's app lifts off, splits, flies to Theo and June and
//                                                 is redrawn in each one's colours
import React from 'react';
import { DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT } from '../brand';
import {
  Cabinet, CABINET_TOP, Crossbar, HatFigure, HATS, Hero, Inkwell, INKWELL_MOUTH, jolt, KEEPSAKES, KeepsakeBox, Laptop, lin, mixHex, P, Padlock, pop,
  PriceTag, Quill, RecordPlayer, TopHat, Tower, TOWER_SLAB, useT,
} from './take1c-ink';
import type { HatName, HeroName } from './take1c-ink';
import { rr, ThemedWindow, windowHeight } from './take1c-apps';
// WHY from the other half: both halves draw the same cast from take1c-ink, and line 7 / line 8 repeat line 2 /
// line 1 exactly, so their layouts and composition are shared, not copied
import { hatPt, HeroString, Puppets, PUPPETS, RULES_LAYOUT, Stream } from './take1c-spreads-a';
import { Sheet } from './take1c-page';
import { CUT, land, Q, TURN } from './take1c-time';
import type { Spread } from './take1c-book';

// ---------- small motion helpers ----------
type Key = { t: number; x: number; y: number; z?: number; r?: number; s?: number; ease?: (v: number) => number };
/** Eased position along a list of keys (for the quill). A key's `ease` shapes the move INTO it. */
const track = (keys: Key[], t: number) => {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const A = keys[i], B = keys[Math.min(i + 1, keys.length - 1)];
  const k = B.t === A.t ? 1 : (B.ease ?? EASE_IN_OUT)(Math.min(1, Math.max(0, (t - A.t) / (B.t - A.t))));
  const m = (a: number, b: number) => a + (b - a) * k;
  return { x: m(A.x, B.x), y: m(A.y, B.y), z: m(A.z ?? 0, B.z ?? 0), r: m(A.r ?? 0, B.r ?? 0), s: m(A.s ?? 1, B.s ?? 1) };
};
// WHY checked: the quill's keys are computed from word times; one out of order would make it jump.
const checked = (name: string, keys: Key[]) => {
  keys.forEach((k, i) => { if (i && k.t < keys[i - 1].t) throw new Error(`take1c ${name} quill key ${i} (t=${k.t.toFixed(2)}) comes before key ${i - 1}`); });
  return keys;
};
/** Overshoot then settle (a back-ease): for the quill's escape and its landings. */
const BACK = (v: number) => { const c = 1.7; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); };
const mixN = (a: number, b: number, k: number) => a + (b - a) * k;

/** The one quill, hovering `z` above the paper with its soft shadow on the page beneath its nib.
 *  WHY a shadow that spreads and fades with height: it is the only thing that tells the eye the quill is in the
 *  air above the drawing rather than printed on it. */
const FlyQuill: React.FC<{ q: { x: number; y: number; z: number; r: number; s: number }; o?: number; idle?: boolean }> = ({ q, o = 1, idle = true }) => {
  const t = useT();
  if (o <= 0.01 || q.s <= 0.01) return null;
  const z = Math.max(0, q.z + (idle ? Math.sin(t * 2.6) * 6 : 0));
  return (
    <g opacity={o}>
      {/* WHY it fades out by 45 units up (review of the first build): a shadow far below a high quill read as a stray grey blob */}
      {z < 45 && <ellipse cx={q.x + 16 * q.s + z * 0.2} cy={q.y + 3 + z * 0.1} rx={(26 + z * 0.1) * q.s} ry={(6 + z * 0.03) * q.s} fill={P.ink} opacity={0.18 * (1 - z / 45)} />}
      <Quill x={q.x} y={q.y - z} s={q.s} r={q.r} />
    </g>
  );
};
/** The point the window's outline has reached at time t, in page units, while the quill draws it (else null).
 *  WHY computed from the outline itself: keyed corner to corner, the quill ran ahead of its own line. This walks
 *  the same rounded rectangle, with the same easing, that ThemedWindow's outline draws along. */
const onOutline = (win: { x: number; y: number; w: number }, a: number, draw: number, t: number) => {
  if (t < a || t > a + draw) return null;
  const k = win.w / 400, W = 400, H = 330, R = 18;
  const segs: [number, (u: number) => [number, number]][] = [
    [W - 2 * R, (u) => [R + u * (W - 2 * R), 0]],
    [(Math.PI * R) / 2, (u) => [W - R + Math.sin(u * Math.PI / 2) * R, R - Math.cos(u * Math.PI / 2) * R]],
    [H - 2 * R, (u) => [W, R + u * (H - 2 * R)]],
    [(Math.PI * R) / 2, (u) => [W - R + Math.cos(u * Math.PI / 2) * R, H - R + Math.sin(u * Math.PI / 2) * R]],
    [W - 2 * R, (u) => [W - R - u * (W - 2 * R), H]],
    [(Math.PI * R) / 2, (u) => [R - Math.sin(u * Math.PI / 2) * R, H - R + Math.cos(u * Math.PI / 2) * R]],
    [H - 2 * R, (u) => [0, H - R - u * (H - 2 * R)]],
    [(Math.PI * R) / 2, (u) => [R - Math.cos(u * Math.PI / 2) * R, R - Math.sin(u * Math.PI / 2) * R]],
  ];
  const total = segs.reduce((n, [l]) => n + l, 0);
  let d = lin(t, a, a + draw, EASE_IN_OUT) * total;
  for (const [l, f] of segs) {
    if (d <= l) { const [px, py] = f(d / l); return { x: win.x - win.w / 2 + px * k, y: win.y - windowHeight(win.w) / 2 + py * k }; }
    d -= l;
  }
  return { x: win.x - win.w / 2 + R * k, y: win.y - windowHeight(win.w) / 2 };
};
/** The quill, but pinned to a window's outline while that window is being drawn. */
const pin = (q: ReturnType<typeof track>, t: number, wins: { win: { x: number; y: number; w: number }; a: number; draw: number }[]) => {
  for (const w of wins) { const p = onOutline(w.win, w.a, w.draw, t); if (p) return { ...q, x: p.x, y: p.y, z: 0 }; }
  return q;
};
/** Where the quill's nib goes so that a hand at (hx, hy) grips it a fifth of the way up the feather. */
const nibFor = (hx: number, hy: number, s: number, r: number) => {
  const a = (r * Math.PI) / 180, gx = 20 * s, gy = -32 * s;
  return { x: hx - (gx * Math.cos(a) - gy * Math.sin(a)), y: hy - (gx * Math.sin(a) + gy * Math.cos(a)) };
};
/** A hero's hand, for a pose (Person's own arm ends), at scale s, facing right unless flipped. */
const handOf = (x: number, y: number, s: number, pose: 'up' | 'write' | 'hold' | 'quill' | 'wave', flip = false) => {
  const h = { up: [24, -96], write: [34, -40], hold: [9, -42], quill: [32, -78], wave: [34, -88] }[pose];
  return { x: x + (flip ? -1 : 1) * h[0] * s, y: y + h[1] * s };
};

/** An ask, written into the book in its own hand beside the person, one letter after another.
 *  WHY lower case and unsure: a real person's first ask (brand voice rules), and on the page, not in a box,
 *  so it reads as theirs rather than as an interface. */
const Ask: React.FC<{ lines: string[]; x: number; y: number; at: number; dur: number; size?: number; anchor?: 'start' | 'end' }> = ({ lines, x, y, at, dur, size = 30, anchor = 'start' }) => {
  const t = useT();
  const total = lines.reduce((n, l) => n + l.length, 0);
  let left = Math.floor(total * lin(t, at, at + dur, (v) => v));
  if (t < at) return null;
  return (
    // WHY a paper-coloured halo: the hero's faint string runs up behind the words; the halo knocks it out, as print does
    <g fontFamily={DMSANS} fontWeight={500} fontSize={size} fill={P.ink} letterSpacing="-0.01em" stroke={P.paper} strokeWidth={7} strokeLinejoin="round" style={{ paintOrder: 'stroke' }}>
      {lines.map((l, i) => {
        const n = Math.max(0, Math.min(l.length, left));
        left -= l.length;
        return n > 0 ? <text key={i} x={x} y={y + i * size * 1.22} textAnchor={anchor}>{l.slice(0, n)}</text> : null;
      })}
    </g>
  );
};

/** A plain table (top at y, legs down to `floor`). */
const Table: React.FC<{ x0: number; x1: number; y: number; floor: number; c?: string }> = ({ x0, x1, y, floor, c = P.ink }) => (
  <g>
    <path d={`M ${x0} ${y} L ${x1} ${y} L ${x1} ${y + 9} L ${x0} ${y + 9} Z`} fill={P.paperShade} stroke={c} strokeWidth={3} strokeLinejoin="round" />
    <path d={`M ${x0 + 14} ${y + 9} L ${x0 + 18} ${floor} M ${x1 - 14} ${y + 9} L ${x1 - 18} ${floor}`} stroke={c} strokeWidth={3.4} strokeLinecap="round" />
  </g>
);
/** A faint floor line under a vignette. */
const Floor: React.FC<{ x0: number; x1: number; y: number }> = ({ x0, x1, y }) => <path d={`M ${x0} ${y} L ${x1} ${y}`} stroke={P.inkSoft} strokeWidth={2} opacity={0.6} />;
/** The small idle life every hat has (the same breath, coat-tail swing and weight shift as in lines 1-4). */
const idleOf = (t: number, j: number) => ({ bob: Math.sin(t * 2.2 + j * 1.9) * 1.6, sway: Math.sin(t * 1.6 + j * 2.4) * 2.6, lean: Math.sin(t * 0.85 + j * 1.3) * 1.3 });
const HAT_J: Record<HatName, number> = { wide: 0, tall: 1, short: 2 };
type HatFigP = React.ComponentProps<typeof HatFigure>;
/** One of the three hats, in its own build (HATS), never standing still. */
const Hat: React.FC<Omit<HatFigP, 's' | 'girth'> & { who: HatName; scale?: number }> = ({ who, scale = 1, crown, lean = 0, sway = 0, bob = 0, ...rest }) => {
  const t = useT();
  const H = HATS[who], id = idleOf(t, HAT_J[who]);
  return <HatFigure {...rest} s={H.s * scale} girth={H.girth} crown={crown ?? H.crown} lean={lean + id.lean} sway={sway + id.sway} bob={bob + id.bob} />;
};
/** Rings of purple spreading across the inkwell's surface at the given times (the ripple from chapter iv). */
const Ripples: React.FC<{ x: number; y: number; s?: number; at: number[] }> = ({ x, y, s = 1, at }) => {
  const t = useT();
  return (
    <>{at.map((r, i) => {
      const p = lin(t, r, r + 0.8);
      if (p <= 0 || p >= 1) return null;
      return <ellipse key={i} cx={x} cy={y - INKWELL_MOUTH * s} rx={(16 + p * 46) * s} ry={(3.6 + p * 9) * s} fill="none" stroke={P.purple} strokeWidth={2.6 * (1 - p) + 0.6} opacity={0.65 * (1 - p)} />;
    })}</>
  );
};
/** A puppet string from (x1,y1) to (x2,y2). `cut` 0..1: snipped at its middle, the top half springs up, the bottom
 *  half falls slack and fades. */
const PString: React.FC<{ x1: number; y1: number; x2: number; y2: number; o?: number; cut?: number; w?: number }> = ({ x1, y1, x2, y2, o = 0.8, cut = 0, w = 2 }) => {
  if (cut <= 0) return <path d={`M ${x1} ${y1} L ${x2} ${y2}`} stroke={P.ink} strokeWidth={w} opacity={o} fill="none" />;
  if (cut >= 1) return null;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, up = Math.min(1, cut * 1.4);
  const tx = mx + (x1 - mx) * up * 0.85, ty = my + (y1 - my) * up * 0.85;
  const bx = mx + (x2 - mx) * cut * 0.5 + Math.sin(cut * Math.PI) * 14, by = my + (y2 - my) * cut * 0.7;
  return (
    <g opacity={o * (1 - cut)} fill="none" stroke={P.ink} strokeWidth={w}>
      <path d={`M ${x1} ${y1} Q ${(x1 + tx) / 2 + 10 * up} ${(y1 + ty) / 2} ${tx} ${ty}`} />
      <path d={`M ${bx} ${by} Q ${(bx + x2) / 2 - 16 * cut} ${(by + y2) / 2 + 20 * cut} ${x2} ${y2}`} />
    </g>
  );
};

/** A coin, inked as an outline that fills when finished (`p` 0..1 of its drawing). */
const Coin: React.FC<{ x: number; y: number; p: number }> = ({ x, y, p }) => {
  if (p <= 0) return null;
  const d = `M ${x - 15} ${y} a 15 6 0 1 0 30 0 a 15 6 0 1 0 -30 0`;
  return (
    <g>
      {p >= 1 && <path d={`M ${x - 15} ${y} L ${x - 15} ${y + 5} a 15 6 0 0 0 30 0 L ${x + 15} ${y} Z`} fill="#C9A15A" stroke={P.ink} strokeWidth={2.2} />}
      {p >= 1 && <path d={d} fill="#E8C77A" />}
      <path d={d} pathLength={1} strokeDasharray={p < 1 ? '1 2' : undefined} strokeDashoffset={p < 1 ? 1 - p : undefined} fill="none" stroke={P.ink} strokeWidth={2.2} />
    </g>
  );
};

// ======================= v · the treasure, and the tool =======================
// The left page: their tower of windows with the three on top, and their desk beside it.
// The right page: Maya, small and waiting, beside her padlocked laptop (from chapter ii).
const TW = { x: 250, y: 880, w: 300, n: 6 };
const TOP = TW.y - TW.n * TOWER_SLAB;                     // 604: where the hats stand
const V_HATS: { who: HatName; x: number }[] = [{ who: 'tall', x: 150 }, { who: 'wide', x: 258 }, { who: 'short', x: 364 }];
const DESK = { x0: 442, x1: 742, y: TOP };
const WELL = { from: 700, to: 572 };                      // the inkwell: where iv left it, and where he drags it
const MOUTH = TOP - INKWELL_MOUTH;
const REST = { x: WELL.to + 2, y: MOUTH + 6, r: -16, s: 1.25 };   // the quill standing in the inkwell
const CHEST = { x: 676, y: TOP };
// Maya's corner of the right page
const MAYA = { x: 925, y: 860, s: 1.9 };
const LAP = { x: 1110, y: 768, s: 1.3 };
const WIN = { x: 1262, y: 430, w: 360 };
const WIN_H = windowHeight(WIN.w);
// WHY these times: the ask writes itself from "control" into "tool"; the quill traces the window on "can make"
// and it fills on "software", ticking its own box, while Maya blooms green: all finished before the page turns.
const ASK_A = { at: Q.control + 0.35, dur: 0.95 };
const WIN_A = Q.tool + 0.3, WIN_DRAW = 0.6;
const PLANTS_AT = Q.software - 0.02;
const TICK_AT = PLANTS_AT + 0.42;
const MAYA_BLOOM = [Q.software + 0.05, Q.software + 0.6] as const;
if (MAYA_BLOOM[1] > TURN.anyone) throw new Error('take1c: Maya must finish blooming before the page turns to chapter vi');
const GROW = [62, 80, 100, 130];                           // each step of a hat's growth on "hubris"
const DRAWN = TURN.treasure - 3;                           // the film cuts straight into this spread: drawn long before

/** How much taller each hat is: four comic jumps on "hubris"; after the cut on "these", merely tall. */
const growAt = (t: number, j: number) => {
  if (t >= CUT.these) return 28;
  return GROW.reduce((c, g, i) => c + g * Math.min(1.12, pop(t, Q.hubris + i * 0.2 + j * 0.05, 0.26)), 0);
};
const hatSxAt = (t: number, j: number) => {
  if (t >= CUT.these) return 1;
  return GROW.reduce((sx, _, i) => { const x = (t - (Q.hubris + i * 0.2 + j * 0.05)) / 0.24; return x > 0 && x < 1 ? sx - 0.28 * Math.sin(x * Math.PI) : sx; }, 1);
};
/** Each hat's pose, lean and gaze through the chapter. */
const hatAt = (t: number, j: number) => {
  let pose: 'sides' | 'rub' | 'reach' | 'stretch' | 'hold' = 'sides';
  if (t > Q.believed - 0.1 && t < Q.treasure) pose = 'rub';
  if (j === 0 && t > Q.treasure - 0.1 && t < Q.value) pose = 'reach';       // the tall one points: "draw us treasure"
  if (t > Q.value && t < Q.but) pose = 'hold';                                 // thumbs in lapels, pleased
  if (j === 2 && t > Q.created1 - 0.2 && t < Q.created1 + 1.3) pose = 'stretch';   // the short one hooks the inkwell
  if (t > Q.far - 0.06 && t < Q.control + 1.2) pose = j === 2 ? 'stretch' : 'reach';
  // chins up on "hubris" (to the cut); lean in over the desk on "treasure", back with chins up on "value";
  // forward in their excitement; a lurch toward the quill on "far"
  const hub = -7 * lin(t, Q.hubris - 0.1, Q.hubris + 0.3) * (t >= CUT.these ? 0 : 1);
  const greed = 10 * lin(t, Q.greatTreasure - 0.1, Q.treasure + 0.3) * (1 - lin(t, Q.value, Q.value + 0.35));
  const chin = -7 * lin(t, Q.value, Q.value + 0.35) * (1 - lin(t, Q.but - 0.1, Q.but + 0.25));
  const grab = 9 * lin(t, Q.excitement - 0.1, Q.excitement + 0.4) * (1 - lin(t, Q.control + 0.8, Q.control + 1.3));
  // heads turn to the quill one after another on "believed", and stay on it
  const look = lin(t, Q.believed + j * 0.16, Q.believed + j * 0.16 + 0.25) + lin(t, Q.created1 - 0.1, Q.created1 + 0.2) * (1 - lin(t, Q.artificial, Q.artificial + 0.2)) * 0.6;
  const eyes: 'smug' | 'dots' = t < CUT.these || (t > Q.value + 0.1 && t < Q.but) ? 'smug' : 'dots';
  return { pose, lean: hub + greed + chin + grab, look: Math.min(1, look), eyes };
};

/** A long rubber arm from a hat's shoulder to a point, ending in a hand that can close (`fist`). */
const Reach: React.FC<{ from: [number, number]; to: [number, number]; p: number; fist: number; sag?: number }> = ({ from, to, p, fist, sag = 30 }) => {
  if (p <= 0.001) return null;
  const hx = from[0] + (to[0] - from[0]) * p, hy = from[1] + (to[1] - from[1]) * p;
  const mx = (from[0] + hx) / 2, my = Math.min(from[1], hy) - sag * p;
  const ang = Math.atan2(hy - my, hx - mx);
  const fingers = [-0.62, -0.2, 0.2, 0.62].map((d) => {
    const len = 12 * (1 - fist * 0.85);
    return `M ${hx + Math.cos(ang + d) * 8} ${hy + Math.sin(ang + d) * 8} l ${Math.cos(ang + d * 0.5) * len} ${Math.sin(ang + d * 0.5) * len}`;
  }).join(' ');
  return (
    <g>
      <path d={`M ${from[0]} ${from[1]} Q ${mx} ${my} ${hx} ${hy}`} stroke={P.ink} strokeWidth={8} fill="none" strokeLinecap="round" />
      <path d={fingers} stroke={P.ink} strokeWidth={5.5} fill="none" strokeLinecap="round" />
      <path d={fingers} stroke={P.paper} strokeWidth={2} fill="none" strokeLinecap="round" />
      <circle cx={hx} cy={hy} r={fist > 0.5 ? 7 : 9.5} fill={fist > 0.5 ? P.ink : P.paper} stroke={P.ink} strokeWidth={2.6} />
    </g>
  );
};

/** The chest the quill draws for them on "treasure": its outline is traced, the lid creaks open, coins pile out. */
const Chest: React.FC<{ t: number }> = ({ t }) => {
  const { x, y } = CHEST;
  const draw = lin(t, Q.treasure + 0.12, Q.treasure + 0.75, EASE_IN_OUT);
  if (draw <= 0) return null;
  const filled = lin(t, Q.treasure + 0.6, Q.treasure + 0.9);
  const lid = lin(t, Q.treasure + 0.95, Q.treasure + 1.25, EASE_OUT) + jolt(t, Q.treasure + 1.25, 0.06, 0.4);
  const box = `M ${x - 44} ${y} L ${x - 44} ${y - 46} L ${x + 44} ${y - 46} L ${x + 44} ${y} Z`;
  // coins: four finished on "value", the fifth left half-drawn when the quill stops on "but"
  const coinAt = (i: number) => Q.value - 0.02 + i * 0.19;
  const coins = [[x - 16, y - 54], [x + 14, y - 56], [x - 2, y - 66], [x + 22, y - 70], [x - 22, y - 72]];
  const stopped = (i: number) => Math.min(lin(t, coinAt(i), coinAt(i) + 0.22, (v) => v), i === 4 ? lin(Q.but, coinAt(i), coinAt(i) + 0.22, (v) => v) : 1);
  return (
    <g>
      <ellipse cx={x} cy={y + 2} rx={52} ry={6} fill={P.ink} opacity={0.12 * filled} />
      {coins.map(([cx, cy], i) => <Coin key={i} x={cx} y={cy} p={stopped(i)} />)}
      <path d={box} fill="#B08A6A" opacity={filled} />
      <path d={`M ${x - 44} ${y - 30} L ${x + 44} ${y - 30} M ${x - 12} ${y - 46} L ${x - 12} ${y} M ${x + 12} ${y - 46} L ${x + 12} ${y}`} stroke={P.ink} strokeWidth={2.2} opacity={0.5 * filled} />
      <path d={box} pathLength={1} strokeDasharray={draw < 1 ? '1 2' : undefined} strokeDashoffset={draw < 1 ? 1 - draw : undefined} fill="none" stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
      {/* the lid, hinged at the back, creaking open */}
      {filled > 0 && (
        <g transform={`rotate(${-lid * 58} ${x - 46} ${y - 46})`} opacity={filled}>
          <path d={`M ${x - 46} ${y - 46} L ${x - 46} ${y - 60} Q ${x} ${y - 82} ${x + 46} ${y - 60} L ${x + 46} ${y - 46} Z`} fill="#C39C78" stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
        </g>
      )}
      {filled > 0 && <rect x={x - 6} y={y - 40} width={12} height={12} rx={2} fill={P.ink} opacity={filled} />}
    </g>
  );
};

const TreasureArt: React.FC = () => {
  const t = useT();
  const hats = V_HATS.map((h, j) => ({ ...h, j, ...hatAt(t, j) }));
  // "created": the short one's long arm hooks the inkwell where iv left it and drags it to the middle of the desk
  const hook = lin(t, Q.created1 - 0.15, Q.created1 + 0.22, EASE_OUT);
  const drag = lin(t, Q.created1 + 0.3, Q.created1 + 0.95, EASE_IN_OUT);
  const letGo = lin(t, Q.created1 + 1.0, Q.created1 + 1.3, EASE_IN);
  const wellX = WELL.from + (WELL.to - WELL.from) * drag;
  // WHY it rocks to a stop on "technology": the drag has weight; the ripple then matches the one in chapter iv
  const rock = jolt(t, Q.created1 + 0.95, 6, Q.technology2 - Q.created1 - 0.9);
  const short = hats[2];
  const shoulder = (lean: number): [number, number] => {
    const a = (lean * Math.PI) / 180, px = 20 * HATS.short.s, py = -168 * HATS.short.s;
    return [short.x + px * Math.cos(a) - py * Math.sin(a), TOP + px * Math.sin(a) + py * Math.cos(a)];
  };
  // the snatch on "far beyond their own control": the arm stretches for the quill and closes on air
  const reach = lin(t, Q.far - 0.02, Q.control - 0.04, EASE_OUT);
  const fist = lin(t, Q.control + 0.0, Q.control + 0.1);
  const back = lin(t, Q.control + 0.55, Q.control + 0.95, EASE_IN);
  // the quill: born on "artificial", draws the chest on "treasure" and coins on "value", freezes on "but",
  // turns its nib toward Maya on "created something", escapes on "control" and draws her window
  const Tq = Q.treasure;
  const q = track(checked('treasure', [
    { t: Q.artificial, x: REST.x, y: REST.y + 210, r: REST.r, s: REST.s },
    { t: Q.artificial + 0.4, x: REST.x, y: REST.y - 26, r: REST.r - 6, s: REST.s, ease: EASE_OUT },
    { t: Q.artificial + 0.75, ...REST, z: 0 },
    { t: Q.believed, ...REST },
    { t: Tq - 0.05, x: CHEST.x - 30, y: TOP - 70, z: 30, r: -24, s: 1.0 },
    // tracing the chest: corner to corner (the outline follows the same order)
    { t: Tq + 0.12, x: CHEST.x - 44, y: TOP, r: -24, s: 1.0 },
    { t: Tq + 0.3, x: CHEST.x - 44, y: TOP - 46, r: -24, s: 1.0 },
    { t: Tq + 0.5, x: CHEST.x + 44, y: TOP - 46, r: -24, s: 1.0 },
    { t: Tq + 0.75, x: CHEST.x + 44, y: TOP, r: -24, s: 1.0 },
    { t: Tq + 1.1, x: CHEST.x + 60, y: TOP - 120, z: 20, r: -12, s: 1.0 },
    { t: Q.value - 0.1, x: CHEST.x + 50, y: TOP - 110, z: 20, r: -12, s: 1.0 },
    // dabbing the coins in, one after another
    ...[0, 1, 2, 3, 4].map((i) => ({ t: Q.value + i * 0.19 + 0.1, x: [CHEST.x - 16, CHEST.x + 14, CHEST.x - 2, CHEST.x + 22, CHEST.x - 22][i] + 14, y: [TOP - 54, TOP - 56, TOP - 66, TOP - 70, TOP - 72][i], r: -20, s: 1.0 })),
    // "but": it stops dead over the unfinished coin
    { t: Q.but + 0.02, x: CHEST.x - 6, y: TOP - 72, r: -20, s: 1.0 },
    { t: Q.but + 0.4, x: CHEST.x - 2, y: TOP - 90, z: 30, r: -8, s: 1.0, ease: EASE_OUT },
    // "they created something": it turns its nib toward the far page, toward Maya
    { t: Q.createdSomething, x: CHEST.x + 4, y: TOP - 96, z: 40, r: -8, s: 1.0 },
    { t: Q.createdSomething + 0.5, x: CHEST.x + 14, y: TOP - 96, z: 40, r: 26, s: 1.0 },
    { t: Q.control - 0.2, x: CHEST.x + 10, y: TOP - 92, z: 40, r: 30, s: 1.0 },
    // WHY a short pull back before the dart: the anticipation makes the escape read as its own choice
    { t: Q.control - 0.04, x: CHEST.x - 4, y: TOP - 86, z: 34, r: 18, s: 1.0 },
    { t: Q.control + 0.42, x: MAYA.x + 110, y: 560, z: 60, r: 10, s: 0.95, ease: BACK },
    { t: WIN_A - 0.25, x: MAYA.x + 140, y: 540, z: 60, r: -6, s: 0.95 },
    // drawing her window round, clockwise from its top-left corner
    { t: WIN_A, x: WIN.x - WIN.w / 2, y: WIN.y - WIN_H / 2, r: -14, s: 0.9 },
    { t: WIN_A + WIN_DRAW * 0.3, x: WIN.x + WIN.w / 2, y: WIN.y - WIN_H / 2, r: -14, s: 0.9 },
    { t: WIN_A + WIN_DRAW * 0.5, x: WIN.x + WIN.w / 2, y: WIN.y + WIN_H / 2, r: -14, s: 0.9 },
    { t: WIN_A + WIN_DRAW * 0.8, x: WIN.x - WIN.w / 2, y: WIN.y + WIN_H / 2, r: -14, s: 0.9 },
    { t: WIN_A + WIN_DRAW, x: WIN.x - WIN.w / 2, y: WIN.y - WIN_H / 2 + 34, r: -14, s: 0.9 },
    // the tick: it dabs the box, then rises clear of the window
    { t: TICK_AT, x: WIN.x - WIN.w / 2 + (214 + 12) * (WIN.w / 400), y: WIN.y - WIN_H / 2 + 186 * (WIN.w / 400), r: -14, s: 0.9 },
    { t: TICK_AT + 0.4, x: WIN.x + WIN.w / 2 + 20, y: WIN.y - WIN_H / 2 - 10, z: 50, r: 4, s: 0.9, ease: EASE_OUT },
  ]), t);
  const qv = pin(q, t, [{ win: WIN, a: WIN_A, draw: WIN_DRAW }]);
  const inWell = t < Q.artificial + 0.7;
  const flying = t > Q.control - 0.04;
  // what the stretching arm closes on: the air where the quill was a moment ago
  const target: [number, number] = [CHEST.x + 10, TOP - 150];
  // Maya: waiting, watching the quill come to her; blooms green as her app fills
  const mayaBloom = lin(t, MAYA_BLOOM[0], MAYA_BLOOM[1], EASE_IN_OUT);
  const mayaLook = t > Q.control + 0.2;
  const sheen = lin(t, WIN_A + WIN_DRAW, WIN_A + WIN_DRAW + 0.4);
  return (
    <Sheet>
      <defs><clipPath id="c-well-mouth"><rect x={-200} y={-400} width={2000} height={MOUTH + 400} /></clipPath></defs>
      {/* their tower of windows, and the three on top of it */}
      <Tower x={TW.x} y={TOP} w={TW.w} n={TW.n} />
      {hats.map(({ who, x, j, pose, lean, look, eyes }) => (
        <Hat key={j} who={who} x={x} y={TOP} a={DRAWN} b={DRAWN + 1} pose={pose} lean={lean} eyes={eyes} look={look}
          crown={HATS[who].crown + growAt(t, j)} hatSx={hatSxAt(t, j)} fist={j < 2 ? fist * (1 - back) : 0} />
      ))}
      {/* their desk */}
      <path d={`M ${DESK.x0} ${DESK.y} L ${DESK.x1} ${DESK.y} L ${DESK.x1} ${DESK.y + 16} L ${DESK.x0} ${DESK.y + 16} Z`} fill={P.inkSoft} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
      <path d={`M ${DESK.x0 + 20} ${DESK.y + 16} L ${DESK.x0 + 26} 880 M ${DESK.x1 - 20} ${DESK.y + 16} L ${DESK.x1 - 26} 880`} stroke={P.ink} strokeWidth={5} strokeLinecap="round" />
      <Floor x0={80} x1={760} y={880} />
      <Chest t={t} />
      {/* the inkwell from chapter iv, still rippling as we arrive; again when the quill is born */}
      <Inkwell x={wellX} y={TOP} rock={rock} fill={1} glow={0.3} />
      <Ripples x={wellX} y={TOP} at={[CUT.these - 0.35, CUT.these + 0.35, Q.technology2 - 0.1, Q.artificial + 0.02]} />
      {/* the quill: hidden below the inkwell's mouth while it rises out of it */}
      {t > Q.artificial && !flying && (
        <g clipPath={inWell ? 'url(#c-well-mouth)' : undefined}>
          {t > Q.believed ? <FlyQuill q={qv} idle={t < Q.treasure - 0.1} /> : <Quill x={q.x} y={q.y} s={q.s} r={q.r + Math.sin(t * 1.7) * 2} />}
        </g>
      )}
      {/* "created": the short one's arm hooks the inkwell and drags it in */}
      {short.pose === 'stretch' && t < Q.far - 0.1 && (
        <Reach from={shoulder(short.lean)} to={[wellX - 30, TOP - 34]} p={hook * (1 - letGo)} fist={hook >= 1 && letGo < 0.3 ? 1 : 0} sag={18} />
      )}
      {/* "far beyond their own control": the same arm shoots out, and the hand closes on the air */}
      {short.pose === 'stretch' && t >= Q.far - 0.1 && <Reach from={shoulder(short.lean)} to={target} p={reach * (1 - back)} fist={fist} />}

      {/* the right page: Maya, her padlocked laptop on its table, and her string up off the page */}
      <HeroString x={MAYA.x} y={MAYA.y} s={MAYA.s} lean={70} />
      <Table x0={LAP.x - 80} x1={LAP.x + 80} y={LAP.y} floor={MAYA.y} />
      <Floor x0={800} x1={1440} y={MAYA.y} />
      {/* her laptop, padlocked as chapter ii left it (the padlock hangs on its screen) */}
      <Laptop x={LAP.x} y={LAP.y} s={LAP.s} a={-10} />
      <Padlock x={LAP.x} y={LAP.y - 26 * LAP.s} s={1.15} at={-10} />
      <Hero who="maya" x={MAYA.x} y={MAYA.y} s={MAYA.s} a={-10} pose={t > PLANTS_AT ? 'wave' : 'down'} mood={mayaLook ? 'smile' : 'flat'} bloom={mayaBloom}
        bob={jolt(t, PLANTS_AT, -8, 0.5)} tilt={mayaLook ? 3 : 0} />
      <Ask lines={['my plants keep dying.', 'can you help?']} x={MAYA.x - 125} y={MAYA.y - MAYA.s * 142} at={ASK_A.at} dur={ASK_A.dur} size={27} />
      <ThemedWindow theme="meadow" x={WIN.x} y={WIN.y} w={WIN.w} a={WIN_A} draw={WIN_DRAW} contentAt={PLANTS_AT} tick={TICK_AT} />
      {/* a short dashed line from her new window down to her laptop: this is hers */}
      {sheen > 0 && <path d={`M ${WIN.x - 70} ${WIN.y + WIN_H / 2 + 10} Q ${LAP.x + 10} ${LAP.y - 110} ${LAP.x - 6} ${LAP.y - 26}`} stroke={P.purple} strokeWidth={3}
        strokeDasharray="8 9" fill="none" opacity={0.75 * lin(t, TICK_AT - 0.1, TICK_AT + 0.3)} strokeLinecap="round" />}
      {/* once it has escaped, the quill is drawn last, over the window it is drawing */}
      {flying && <FlyQuill q={qv} idle={!(t > WIN_A && t < WIN_A + WIN_DRAW)} />}
    </Sheet>
  );
};
export const TREASURE: Spread = { id: 'treasure', Art: TreasureArt };
/** Where things are on this spread, for the camera. */
export const TREASURE_MARKS = { well: { x: WELL.to, y: MOUTH }, hats: { x: V_HATS[1].x, y: TOP }, maya: MAYA, win: WIN, winH: WIN_H, chest: CHEST, desk: DESK };

// ======================= vi · anyone =======================
// The tower far off at top left; Maya and her green window large at lower left; Theo (a step back) and June
// (a step nearer) on the right page, each asking in their own words and getting the same window in their colour.
const FAR = { x: 215, y: 420, s: 0.52, n: 6, w: 300 };
const FAR_TOP = FAR.y - FAR.n * TOWER_SLAB * FAR.s;
const VI = {
  maya: { x: 165, y: 870, s: 1.9 }, mayaWin: { x: 480, y: 662, w: 420 },
  // WHY Theo 26 higher (integration check): his ground line sat under the first line of June's ask, so the
  // words ran through it and he seemed to stand on her question
  theo: { x: 875, y: 374, s: 1.3 }, theoWin: { x: 1268, y: 232, w: 312 },
  june: { x: 875, y: 676, s: 1.55 }, juneWin: { x: 1268, y: 520, w: 312 },
};
const VI_L = land(TURN.anyone);
// WHY from "ever-scarce", while the leaf is still falling: Theo's corner is uncovered first, and the ask must
// be finished as the quill draws on "foundation"
const THEO_ASK = { at: Q.scarce, dur: Q.foundation - Q.scarce - 0.08 };
const THEO_WIN = { a: Q.foundation - 0.02, draw: 0.42, content: Q.foundation + 0.36 };
const JUNE_ASK = { at: Q.monopolies1 + 0.1, dur: 0.75 };
const JUNE_WIN = { a: Q.forAnyone, draw: 0.42, content: Q.anyone + 0.25 };
if (THEO_ASK.at + THEO_ASK.dur > THEO_WIN.a + 0.1) throw new Error('take1c: Theo must finish asking before his window is drawn');
const AnyoneArt: React.FC = () => {
  const t = useT();
  const theoBloom = lin(t, THEO_WIN.content + 0.1, THEO_WIN.content + 0.6, EASE_IN_OUT);
  const juneBloom = lin(t, JUNE_WIN.content + 0.1, JUNE_WIN.content + 0.6, EASE_IN_OUT);
  // the hats turn to stare on "monopolies", and their tower wobbles once
  const stare = lin(t, Q.monopolies1 - 0.05, Q.monopolies1 + 0.25);
  const wq = (w: { x: number; y: number; w: number }) => ({ x0: w.x - w.w / 2, y0: w.y - windowHeight(w.w) / 2, x1: w.x + w.w / 2, y1: w.y + windowHeight(w.w) / 2 });
  const tw = wq(VI.theoWin), jw = wq(VI.juneWin);
  const q = track(checked('anyone', [
    { t: VI_L - 0.4, x: VI.mayaWin.x + 200, y: VI.mayaWin.y - 180, z: 60, r: 4, s: 0.85 },
    { t: THEO_WIN.a - 0.15, x: tw.x0 - 10, y: tw.y0 - 10, z: 20, r: -14, s: 0.8 },
    { t: THEO_WIN.a, x: tw.x0, y: tw.y0, r: -14, s: 0.8 },
    { t: THEO_WIN.a + THEO_WIN.draw * 0.3, x: tw.x1, y: tw.y0, r: -14, s: 0.8 },
    { t: THEO_WIN.a + THEO_WIN.draw * 0.5, x: tw.x1, y: tw.y1, r: -14, s: 0.8 },
    { t: THEO_WIN.a + THEO_WIN.draw * 0.8, x: tw.x0, y: tw.y1, r: -14, s: 0.8 },
    { t: THEO_WIN.a + THEO_WIN.draw, x: tw.x0 + 10, y: tw.y0 + 30, r: -14, s: 0.8 },
    { t: THEO_WIN.content + 0.5, x: tw.x1 + 30, y: tw.y1 - 20, z: 50, r: 4, s: 0.8, ease: EASE_OUT },
    { t: JUNE_WIN.a - 0.15, x: jw.x0 - 10, y: jw.y0 - 10, z: 20, r: -14, s: 0.8 },
    { t: JUNE_WIN.a, x: jw.x0, y: jw.y0, r: -14, s: 0.8 },
    { t: JUNE_WIN.a + JUNE_WIN.draw * 0.3, x: jw.x1, y: jw.y0, r: -14, s: 0.8 },
    { t: JUNE_WIN.a + JUNE_WIN.draw * 0.5, x: jw.x1, y: jw.y1, r: -14, s: 0.8 },
    { t: JUNE_WIN.a + JUNE_WIN.draw * 0.8, x: jw.x0, y: jw.y1, r: -14, s: 0.8 },
    { t: JUNE_WIN.a + JUNE_WIN.draw, x: jw.x0 + 10, y: jw.y0 + 30, r: -14, s: 0.8 },
    // "asks": it settles above June and stays there, idling, until the page turns
    // WHY beside her raised hand rather than over her head (integration check): over her head it sat on the
    // words of her ask for the whole held frame; here it is clear of text and still plainly hers
    { t: Q.asks, x: VI.june.x + 108, y: VI.june.y - VI.june.s * 44, z: 56, r: 8, s: 0.8, ease: EASE_OUT },
  ]), t);
  const qp = pin(q, t, [{ win: VI.theoWin, a: THEO_WIN.a, draw: THEO_WIN.draw }, { win: VI.juneWin, a: JUNE_WIN.a, draw: JUNE_WIN.draw }]);
  return (
    <Sheet>
      {/* far off, small: the hats on their tower of windows */}
      <g transform={`rotate(${jolt(t, Q.monopolies1 + 0.1, 2.2, 0.9)} ${FAR.x} ${FAR.y})`}>
        <Tower x={FAR.x} y={FAR_TOP} w={FAR.w} n={FAR.n} s={FAR.s} wobble={jolt(t, Q.monopolies1 + 0.1, 1.2, 0.9)} />
      </g>
      {(['tall', 'wide', 'short'] as HatName[]).map((who, j) => (
        <g key={who} transform={`rotate(${jolt(t, Q.monopolies1 + 0.1, 2.2, 0.9)} ${FAR.x} ${FAR.y})`}>
          <Hat who={who} x={FAR.x - 52 + j * 52} y={FAR_TOP} a={-10} scale={0.5} pose="sides" eyes="dots" look={stare} lean={stare * 4} />
        </g>
      ))}
      {/* Maya, with the window she was made */}
      <HeroString x={VI.maya.x} y={VI.maya.y} s={VI.maya.s} lean={60} />
      <Floor x0={70} x1={700} y={VI.maya.y} />
      <Hero who="maya" x={VI.maya.x} y={VI.maya.y} s={VI.maya.s} a={-10} bloom={1} mood="smile" pose="down" />
      <ThemedWindow theme="meadow" x={VI.mayaWin.x} y={VI.mayaWin.y} w={VI.mayaWin.w} r={-1} />
      {/* Theo, a step back */}
      <HeroString x={VI.theo.x} y={VI.theo.y} s={VI.theo.s} lean={-40} />
      <Floor x0={810} x1={1110} y={VI.theo.y} />
      <Hero who="theo" x={VI.theo.x} y={VI.theo.y} s={VI.theo.s} a={-10} bloom={theoBloom} mood={theoBloom > 0.3 ? 'smile' : 'flat'}
        pose={theoBloom > 0.3 ? 'wave' : 'down'} bob={jolt(t, THEO_WIN.content + 0.1, -7, 0.5)} />
      <Ask lines={['can i keep my records', "somewhere that's", 'actually mine?']} x={VI.theo.x - 92} y={VI.theo.y - VI.theo.s * 120 - 82} at={THEO_ASK.at} dur={THEO_ASK.dur} size={29} />
      <ThemedWindow theme="sunbreak" what="records" x={VI.theoWin.x} y={VI.theoWin.y} w={VI.theoWin.w} a={THEO_WIN.a} draw={THEO_WIN.draw} contentAt={THEO_WIN.content} r={1.5} />
      {/* June, a step nearer */}
      <HeroString x={VI.june.x} y={VI.june.y} s={VI.june.s} lean={-60} />
      <Floor x0={800} x1={1120} y={VI.june.y} />
      <Hero who="june" x={VI.june.x} y={VI.june.y} s={VI.june.s} a={-10} bloom={juneBloom} mood={juneBloom > 0.3 ? 'smile' : 'flat'}
        pose={juneBloom > 0.3 ? 'up' : 'down'} bob={jolt(t, JUNE_WIN.content + 0.1, -8, 0.5)} />
      <Ask lines={['somewhere private', 'for my photos', 'and letters?']} x={VI.june.x - 92} y={VI.june.y - VI.june.s * 120 - 70} at={JUNE_ASK.at} dur={JUNE_ASK.dur} size={29} />
      <ThemedWindow theme="cotton" what="keepsakes" x={VI.juneWin.x} y={VI.juneWin.y} w={VI.juneWin.w} a={JUNE_WIN.a} draw={JUNE_WIN.draw} contentAt={JUNE_WIN.content} r={-1.5} />
      <FlyQuill q={qp} idle={qp === q} />
    </Sheet>
  );
};
export const ANYONE: Spread = { id: 'anyone', Art: AnyoneArt };

// ======================= vii · ours: chapter ii, undone =======================
// WHY chapter ii's exact layout (RULES_LAYOUT, shared with the other half): the narrator repeats that line's three
// clauses word for word, so the pictures repeat in colour, and the one quill, passed hand to hand, undoes each
// taking on its own clause. The three hats are greyed out at their places.
const ML = RULES_LAYOUT.maya, TL = RULES_LAYOUT.theo, JL = RULES_LAYOUT.june;
const GREY = 0.8;
const LOCK = { x: ML.laptop.x, y: ML.laptop.y - 26 * ML.laptop.s };          // where the padlock hangs on her screen
const SCREEN = { x: ML.laptop.x, y: ML.laptop.y - 24 * ML.laptop.s, w: 62 * ML.laptop.s };
const CAB_TOP = TL.cabinet.y - CABINET_TOP * TL.cabinet.s;                    // where the record player belongs
const DANGLE = { x: TL.cabinet.x, y: CAB_TOP - 150 };                          // where it hangs, out of his reach
// the wide hat holds the crossbar it hangs from up over the cabinet (as he did in chapter iii)
const WIDE_S = HATS.wide.s * TL.hat.s;
const WIDE_HAND = hatPt(TL.hat.x, TL.hat.y, WIDE_S, true, 0, 54, -252);
const BAR = { x: (WIDE_HAND[0] + DANGLE.x) / 2 + 20, y: WIDE_HAND[1] - 4, w: WIDE_HAND[0] - DANGLE.x + 40 };
// June's box and the short hat's top hat, held out like a bucket: computed exactly as chapter ii computes them
const JS = HATS.short.s * JL.hat.s;
const BUCKET_HAND = hatPt(JL.hat.x, JL.hat.y, JS, true, 0, 73, -119);
const BUCKET = { x: BUCKET_HAND[0] - 26 * JS, y: BUCKET_HAND[1] - 6, r: -78 };
const JBOX = { x: JL.x, y: JL.y - 34 * JL.s };
const STREAM_P0: [number, number] = [JL.x, JL.y - 42 * JL.s - 52];
const STREAM_P1: [number, number] = [(JL.x + BUCKET.x) / 2, JL.y - 470];
const STREAM_P2: [number, number] = [BUCKET.x, BUCKET.y];
/** Maya's raised hand at the cut on "and so": where the quill drops. */
export const OURS_HAND = handOf(ML.x, ML.y, ML.s, 'up');
const QS = 0.55;   // the quill's size in the heroes' hands
const OursArt: React.FC = () => {
  const t = useT();
  // a little hop for each on "decide", one after another; Maya lifts the quill
  const mBob = jolt(t, Q.decide, -10, 0.5), tBob = jolt(t, Q.decide + 0.1, -10, 0.5), jBob = jolt(t, Q.decide + 0.2, -10, 0.5);
  // A: on "computers" she steps up and touches the padlock with the nib; it springs open on "can" and drops;
  // on "do" her plant app blooms onto the laptop's screen
  const step = lin(t, Q.ourComputers + 0.05, Q.computers2 - 0.05, EASE_IN_OUT);
  const mx = ML.x + step * 46;
  const writing = t > Q.ourComputers + 0.1 && t < Q.canDo + 0.06;
  const appP = Math.min(1.06, pop(t, Q.canDo, 0.45));
  // B: the quill cuts the string on "it"; the player drops back into its own outline on "costs" and turns again
  const snip = Q.it2 + 0.08;
  const drop = lin(t, snip + 0.04, Q.costs + 0.1, EASE_IN);
  const thud = drop >= 1 ? jolt(t, Q.costs + 0.1, 5, 0.35) : 0;
  const py = DANGLE.y + (CAB_TOP - DANGLE.y) * drop + thud;
  const tagFall = lin(t, snip + 0.05, snip + 0.9, EASE_IN);
  // C: on "happens" her five keepsakes fly back out of his hat along chapter ii's curve, and the lid shuts on "data"
  const flyFrom = Q.happens + 0.02, gap = 0.12, dur = Math.max(0.4, Q.data2 - 0.08 - flyFrom - gap * 4);
  const home = KEEPSAKES.filter((_, i) => t > flyFrom + i * gap + dur).length;
  const lid = 1 - lin(t, Q.data2 - 0.02, Q.data2 + 0.2, EASE_IN_OUT);
  const hug = t > Q.data2 + 0.15;
  // the one quill: drops into Maya's hand on "so" → the padlock → tossed down to Theo → across his string →
  // tossed over the gutter to June → waved toward the hat → kept, in her hand
  const mHand = handOf(mx, ML.y + mBob, ML.s, 'up');
  const tHand = handOf(TL.x, TL.y + tBob, TL.s, 'up');
  const jHand = handOf(JL.x, JL.y + jBob, JL.s, 'up');
  const mn = nibFor(OURS_HAND.x, OURS_HAND.y, QS, 0);
  const tn = nibFor(tHand.x, tHand.y, QS, -20);
  const jn = nibFor(jHand.x, jHand.y, QS, 0);
  const strY = (BAR.y + DANGLE.y - 40) / 2;
  const q = track(checked('ours', [
    { t: TURN.ours, x: mn.x, y: mn.y - 320, r: 0, s: QS },
    { t: Q.so, x: mn.x, y: mn.y, r: 0, s: QS, ease: EASE_IN },
    { t: Q.decide, x: mn.x, y: mn.y, r: 0, s: QS },
    { t: Q.decide + 0.2, x: mn.x, y: mn.y - 12, r: 0, s: QS },
    { t: Q.ourComputers + 0.1, x: nibFor(mHand.x, mHand.y, QS, 0).x, y: nibFor(mHand.x, mHand.y, QS, 0).y, r: 0, s: QS },
    { t: Q.computers2, x: LOCK.x - 6, y: LOCK.y - 4, r: -64, s: QS },
    { t: Q.canDo + 0.06, x: LOCK.x - 6, y: LOCK.y - 6, r: -64, s: QS },
    // the toss: out of frame right; the next shot is Theo's, below
    { t: Q.itCosts - 0.07, x: 790, y: 330, z: 120, r: 160, s: QS, ease: EASE_IN },
    { t: Q.itCosts - 0.04, x: 760, y: 700, z: 120, r: 300, s: QS },
    { t: Q.itCosts + 0.22, x: tn.x, y: tn.y, r: -20, s: QS, ease: EASE_OUT },
    // "it": the quill darts across the string and back to his hand
    { t: Q.it2 - 0.06, x: DANGLE.x + 60, y: strY + 18, r: -60, s: QS },
    { t: snip, x: DANGLE.x - 50, y: strY - 8, r: -100, s: QS, ease: EASE_IN },
    { t: Q.costs + 0.32, x: tn.x, y: tn.y, r: -20, s: QS, ease: EASE_OUT },
    // tossed on, across the gutter to June
    { t: Q.ourData - 0.08, x: 790, y: 620, z: 160, r: 150, s: QS, ease: EASE_IN },
    { t: Q.ourData + 0.24, x: jn.x, y: jn.y, r: 0, s: QS, ease: EASE_OUT },
    { t: Q.happens - 0.05, x: jn.x, y: jn.y, r: 0, s: QS },
    // "happens": a wave toward the hat, and her things follow it home
    { t: Q.happens + 0.22, x: jn.x + 26, y: jn.y - 10, r: 34, s: QS },
    { t: Q.happens + 0.5, x: jn.x, y: jn.y, r: -6, s: QS },
  ]), t);
  const L0 = land(TURN.ours) - 3;   // WHY long done: the film cuts straight into an extreme close-up of finished drawings
  const tall = idleOf(t, 1), wide = idleOf(t, 0), short = idleOf(t, 2);
  return (
    <Sheet>
      {/* A: what our computers can do */}
      <path d={`M 60 ${ML.y} L 720 ${ML.y}`} stroke={P.inkSoft} strokeWidth={2} />
      <path d={`M ${ML.table[0]} ${ML.table[2]} L ${ML.table[1]} ${ML.table[2]} M ${ML.table[0] + 14} ${ML.table[2]} L ${ML.table[0] + 14} ${ML.y} M ${ML.table[1] - 14} ${ML.table[2]} L ${ML.table[1] - 14} ${ML.y}`}
        stroke={P.ink} strokeWidth={3.4} strokeLinecap="round" fill="none" />
      <Laptop x={ML.laptop.x} y={ML.laptop.y} s={ML.laptop.s} a={L0} />
      {appP > 0 && <g transform={`translate(${SCREEN.x} ${SCREEN.y}) scale(${appP}) translate(${-SCREEN.x} ${-SCREEN.y})`}><ThemedWindow theme="meadow" x={SCREEN.x} y={SCREEN.y} w={SCREEN.w} compact /></g>}
      <Padlock x={LOCK.x} y={LOCK.y} s={1.3} at={-10} openAt={Q.computers2 + 0.1} fallAt={Q.canDo - 0.06} />
      <HatFigure x={ML.hat.x} y={ML.hat.y} s={HATS.tall.s * ML.hat.s} crown={HATS.tall.crown} girth={HATS.tall.girth} a={L0} flip pose="sides" fade={GREY}
        bob={tall.bob} sway={tall.sway} lean={tall.lean} />
      <HeroString x={mx} y={ML.y} s={ML.s} lean={70} />
      <Hero who="maya" x={mx} y={ML.y} s={ML.s} a={L0} bloom={1} mood="smile" bob={mBob - Math.abs(Math.sin(step * Math.PI)) * 6} pose={writing ? 'write' : 'up'} />

      {/* B: what it costs */}
      <path d={`M 60 ${TL.y} L 720 ${TL.y}`} stroke={P.inkSoft} strokeWidth={2} />
      <Cabinet x={TL.cabinet.x} y={TL.cabinet.y} s={TL.cabinet.s} />
      {drop < 1 && <RecordPlayer x={TL.cabinet.x} y={CAB_TOP} s={TL.cabinet.s} dashed />}
      <HatFigure x={TL.hat.x} y={TL.hat.y} s={WIDE_S} crown={HATS.wide.crown} girth={HATS.wide.girth} a={L0} flip pose="grab" fade={GREY}
        bob={wide.bob} sway={wide.sway} lean={wide.lean} />
      <Crossbar x={BAR.x} y={BAR.y} w={BAR.w} c={mixHex(P.ink, P.paper, GREY * 0.66)} />
      <PString x1={DANGLE.x} y1={BAR.y} x2={DANGLE.x} y2={DANGLE.y - 44} cut={lin(t, snip, snip + 0.45)} />
      <g transform={`rotate(${drop < 1 ? Math.sin(t * 2.1) * 3 * (1 - drop) : 0} ${DANGLE.x} ${py})`}>
        <RecordPlayer x={TL.cabinet.x} y={py} s={TL.cabinet.s} spin={t > Q.costs + 0.25 ? (t - Q.costs - 0.25) * 260 : 0} />
      </g>
      {t < snip + 0.95 && (
        <g transform={`translate(${tagFall * 70} ${tagFall * 320}) rotate(${tagFall * 80} ${TL.cabinet.x + 58} ${py})`} opacity={1 - lin(t, snip + 0.6, snip + 0.95)}>
          <PriceTag x={TL.cabinet.x + 58} y={py - 6} s={0.82} at={-10} swing={-4} prices={[{ v: '14.99/mo', at: -10 }]} />
        </g>
      )}
      <HeroString x={TL.x} y={TL.y} s={TL.s} lean={60} o={0.4} />
      <Hero who="theo" x={TL.x} y={TL.y} s={TL.s} a={L0} bloom={1} bob={tBob} mood={t > Q.costs + 0.15 ? 'smile' : 'flat'}
        pose={t > Q.costs + 0.5 && t < Q.ourData - 0.1 ? 'bothUp' : 'up'} />

      {/* C: what happens with our data */}
      <path d={`M 800 ${JL.y} L 1470 ${JL.y}`} stroke={P.inkSoft} strokeWidth={2} />
      <HatFigure x={JL.hat.x} y={JL.hat.y} s={JS} crown={HATS.short.crown} girth={HATS.short.girth} a={L0} flip pose="key" noHat fade={GREY}
        bob={short.bob} sway={short.sway} lean={short.lean} />
      <TopHat x={BUCKET.x} y={BUCKET.y} s={JS} crown={HATS.short.crown} r={BUCKET.r + Math.sin(t * 2) * 2} c={mixHex(P.ink, P.paper, GREY * 0.66)} />
      <Stream from={flyFrom} p0={STREAM_P0} p1={STREAM_P1} p2={STREAM_P2} count={5} gap={gap} dur={dur} s={1.35} reverse />
      <HeroString x={JL.x} y={JL.y} s={JL.s} lean={-60} />
      <Hero who="june" x={JL.x} y={JL.y} s={JL.s} a={L0} bloom={1} bob={jBob} mood={home >= 5 ? 'smile' : 'flat'} pose={hug ? 'hold' : 'up'} />
      <KeepsakeBox x={JBOX.x} y={JBOX.y + jBob} s={1.0} lid={lid} inside={home} />

      {/* the one quill */}
      <FlyQuill q={q} idle={false} />
    </Sheet>
  );
};
export const OURS: Spread = { id: 'ours', Art: OursArt };

// ======================= viii · the past: line 1's picture, in colour =======================
// WHY line 1's picture again (the other half's Puppets, drawn in colour): the strings the hats worked everyone on
// are cut by the one quill, heroes first and then the crowd behind them, and the hats and their tower fade from
// the story by "past".
const V8 = PUPPETS;
const v8Bar = (j: number) => ({ x: V8.hats[j].x, y: V8.hats[j].y - 112 * HATS[V8.hats[j].name].s });
const v8Head = (x: number, y: number, s: number) => ({ x, y: y - 104 * s });
/** The order of the cuts: June's own string (she lets the quill go), Maya's, Theo's, then the crowd. */
const HERO_ORDER: { who: HeroName; j: number }[] = [{ who: 'june', j: 2 }, { who: 'maya', j: 1 }, { who: 'theo', j: 0 }];
const heroCut = (k: number) => Q.free + 0.08 + k * 0.16;
const crowdCut = (i: number) => heroCut(3) + 0.05 + i * 0.05;
const FreeArt: React.FC = () => {
  const t = useT();
  const crowdBar = (cx: number) => (cx < 300 ? 0 : cx < 760 ? 2 : 1);
  const cutAt = (i: number) => {
    if (i < 3) { const k = HERO_ORDER.findIndex((h) => h.j === i); return heroCut(k); }
    return crowdCut(i - 3);
  };
  // where the quill crosses each string as it cuts it: just under halfway down from the bar
  const cross = (b: { x: number; y: number }, h: { x: number; y: number }) => ({ x: b.x + (h.x - b.x) * 0.42, y: b.y + (h.y - b.y) * 0.42 });
  const jp = V8.heroes.june;
  const jh = handOf(jp.x, jp.y, jp.s, 'hold');
  const jn = nibFor(jh.x + 18, jh.y - 30, 0.62, 0);
  const keys: Key[] = [{ t: land(TURN.free) - 1, x: jn.x, y: jn.y, r: 0, s: 0.62 }, { t: Q.time1, x: jn.x, y: jn.y, r: 0, s: 0.62 },
    { t: Q.free - 0.04, x: jn.x + 6, y: jn.y - 40, z: 20, r: 10, s: 0.62, ease: EASE_OUT }];
  HERO_ORDER.forEach(({ who, j }, k) => {
    const p = V8.heroes[who];
    const c = cross(v8Bar(j), v8Head(p.x, p.y, p.s));
    keys.push({ t: heroCut(k), x: c.x, y: c.y, z: 10, r: -40 + k * 30, s: 0.62 });
  });
  V8.crowd.forEach(([cx, cy, cs], i) => {
    if (i % 3 !== 1) return;
    const c = cross(v8Bar(crowdBar(cx)), v8Head(cx, cy, cs));
    keys.push({ t: crowdCut(i), x: c.x, y: c.y, z: 10, r: 20, s: 0.62 });
  });
  // then it circles back down to Maya, who started it all
  const mp = V8.heroes.maya;
  const mh = handOf(mp.x, mp.y, mp.s, 'write');
  keys.push({ t: Q.monopolies2 + 0.2, x: 1000, y: 360, z: 120, r: 30, s: 0.62 });
  keys.push({ t: Q.pastEnd + 0.3, x: mh.x + 30, y: mh.y - 70, z: 50, r: 6, s: 0.62, ease: EASE_IN_OUT });
  const q = track(checked('free', keys), t);
  const crowdBloom = lin(t, crowdCut(0), crowdCut(V8.crowd.length - 1) + 0.5);
  return (
    <Sheet>
      <Puppets bloom={1} crowdBloom={crowdBloom} cutAt={cutAt} fade={[Q.monopolies2, Q.past + 0.1]} landAt={[-10, -10, -10]} />
      {/* her plant app is on Maya's laptop now (chapter vii) */}
      <ThemedWindow theme="meadow" x={1338} y={824 - 24 * 1.8} w={62 * 1.8} compact />
      <FlyQuill q={q} idle={t > Q.free} />
    </Sheet>
  );
};
export const FREE: Spread = { id: 'free', Art: FreeArt };

// ======================= ix · everything =======================
// WHY one clear move (round six plan): Maya's own app, and only it. On "long" the quill lifts a copy off it;
// on "long last" the copy splits in two and the halves arc across the gutter to Theo and June; on "open"
// each copy redraws itself in its new owner's colours. Still by "source", so the headline lands on a finished
// picture, and on "everything" Theo and June throw up their arms: the film's one celebration.
const IX = {
  maya: { x: 175, y: 790, s: 1.95 }, mayaWin: { x: 470, y: 470, w: 400 },
  theo: { x: 905, y: 400, s: 1.15 }, theoSlot: { x: 1235, y: 278, w: 270 },
  june: { x: 905, y: 660, s: 1.45 }, juneSlot: { x: 1235, y: 534, w: 270 },
};
const LIFT = Q.long1 + 0.02, SPLIT = Q.long2, FLY_END = Q.lastEnd - 0.08, SKIN = Q.open, SKIN_END = Q.open + 0.42;
if (SKIN_END > Q.source + 0.05) throw new Error(`take1c: the copies must be redrawn by "source" (${SKIN_END.toFixed(2)} > ${Q.source.toFixed(2)})`);
const EverythingArt: React.FC = () => {
  const t = useT();
  const lift = lin(t, LIFT, LIFT + 0.45, EASE_OUT);
  const split = lin(t, SPLIT, SPLIT + 0.2, EASE_OUT);
  const fly = lin(t, SPLIT + 0.2, FLY_END, EASE_IN_OUT);
  const settle = (k: number) => jolt(t, FLY_END + k * 0.04, 4, 0.4);
  const cheer = t > Q.everything2 - 0.02;
  // the copy: rises a little off her window with a growing shadow; splits; each half arcs to its slot
  const copyAt = (slot: { x: number; y: number; w: number }, side: number) => {
    const sx = IX.mayaWin.x + side * split * 26, sy = IX.mayaWin.y - lift * 40 - split * 10;
    const x = sx + (slot.x - sx) * fly, y = sy + (slot.y - sy) * fly - Math.sin(fly * Math.PI) * (side < 0 ? 170 : 90);
    const w = IX.mayaWin.w * (1 - 0.06 * lift) + (slot.w - IX.mayaWin.w) * fly;
    return { x, y, w, r: -1 + Math.sin(fly * Math.PI) * 5 * side };
  };
  const slotsVis = 1 - lin(t, FLY_END - 0.15, FLY_END + 0.05);
  const q = track(checked('everything', [
    { t: land(TURN.everything) - 0.5, x: IX.maya.x + 70, y: IX.maya.y - 240, z: 60, r: 8, s: 0.8 },
    { t: LIFT - 0.15, x: IX.mayaWin.x + 150, y: IX.mayaWin.y - 150, z: 20, r: -10, s: 0.8 },
    { t: LIFT + 0.45, x: IX.mayaWin.x + 150, y: IX.mayaWin.y - 200, z: 40, r: -10, s: 0.8, ease: EASE_OUT },
    { t: FLY_END, x: 1080, y: 160, z: 120, r: 6, s: 0.8 },
    { t: Q.everything2, x: 1070, y: 150, z: 120, r: 6, s: 0.8 },
    // WHY toward the right page's centre at the end: the cover then closes over it and its emblem sits there
    { t: TURN.close + 0.2, x: 1112, y: 520, z: 60, r: -12, s: 0.75 },
  ]), t);
  return (
    <Sheet>
      <Floor x0={70} x1={700} y={IX.maya.y} />
      <Hero who="maya" x={IX.maya.x} y={IX.maya.y} s={IX.maya.s} a={-10} bloom={1} mood="smile" pose="down" />
      <ThemedWindow theme="meadow" x={IX.mayaWin.x} y={IX.mayaWin.y} w={IX.mayaWin.w} r={-1} />
      <Floor x0={820} x1={1100} y={IX.theo.y} />
      <Hero who="theo" x={IX.theo.x} y={IX.theo.y} s={IX.theo.s} a={-10} bloom={1} mood="smile" pose={cheer ? 'bothUp' : 'down'} bob={jolt(t, Q.everything2, -10, 0.5)} />
      <Floor x0={800} x1={1120} y={IX.june.y} />
      <Hero who="june" x={IX.june.x} y={IX.june.y} s={IX.june.s} a={-10} bloom={1} mood="smile" pose={cheer ? 'bothUp' : 'down'} bob={jolt(t, Q.everything2 + 0.06, -10, 0.5)} />
      {/* the two empty places, waiting */}
      {slotsVis > 0 && [IX.theoSlot, IX.juneSlot].map((s, i) => (
        <path key={i} d={rr(s.x - s.w / 2, s.y - windowHeight(s.w) / 2, s.w, windowHeight(s.w), 14)} fill="none" stroke={P.inkSoft} strokeWidth={2.4} strokeDasharray="10 10" opacity={0.55 * slotsVis} />
      ))}
      {/* the copies: one before the split, two after; each redrawn in its owner's theme on "open" */}
      {t >= LIFT && split <= 0 && (() => { const c = copyAt(IX.theoSlot, 0); return <ThemedWindow theme="meadow" x={c.x} y={c.y} w={c.w} r={c.r} shadow={lift} />; })()}
      {split > 0 && ([[IX.juneSlot, 1, 'cotton'], [IX.theoSlot, -1, 'sunbreak']] as const).map(([slot, side, to], i) => {
        const c = copyAt(slot, side);
        return <ThemedWindow key={i} theme="meadow" x={c.x} y={c.y + (fly >= 1 ? settle(i) : 0)} w={c.w} r={c.r} shadow={fly < 1 ? 1 : 0}
          reskin={{ to, p: lin(t, SKIN + i * 0.08, SKIN_END + i * 0.0, EASE_IN_OUT) }} />;
      })}
      {/* WHY it fades as the cover passes over it: the cover lands with the same quill stamped in the same spot */}
      <FlyQuill q={q} o={1 - lin(t, TURN.close + 0.3, TURN.close + 0.5)} />
    </Sheet>
  );
};
export const EVERYTHING: Spread = { id: 'everything', Art: EverythingArt };
