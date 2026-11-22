// Take 1C, chapters v–ix (round seven): the hats' own invention escapes them, makes each hero exactly what was
// taken from them, undoes the three takings, cuts the strings, and what one person made is shared.
// WHY this shape: the owner's note on the last attempt was "disconnected elements ... random/unrelated to the
// narration". So everything here is the film's small cast (three hats on their tower of windows, Maya, Theo,
// June, the strings, one inkwell, one quill) and the three things taken in chapters ii–iii, nothing else.
//  v    "blinded by their own hubris"            close: the three on their tower, eyes shut smug, rising on their toes
//       "created a new kind of technology"       the tall one leans over their desk and slides the inkwell from iv to its middle
//       "artificial intelligence"                close: the purple quill rises out of that inkwell by itself; the tall one starts
//       "they believed … a great treasure"       heads turn to it, hands rub; the tall one points; it traces a chest
//       "shareholder value"                      coins heap up out of the chest; the hats lean back, thumbs in lapels
//       "but … far beyond their own control"     it stops dead, dips, and darts over the gutter as his glove closes on air
//       "a tool that can make software"          Maya's ask writes itself; the quill draws her a plant app; she blooms
//  vi   "the ever-scarce foundation …"           page turn: three people, three asks, three of the same window in a row;
//       "for anyone who asks"                     Theo then June asks and is drawn his or her own; the far tower wobbles
//  vii  "and so … we get to decide"              chapter ii's layout in colour; the quill drops into Maya's hand,
//                                                 is passed Maya → Theo → June, and undoes each taking in turn
//  viii "free ourselves … the past"              line 1's layout in colour; June lets the quill go and it cuts every
//                                                 string; the hats lurch, then they and their tower fade to nothing
//  ix   "at long, long last … everything"        the quill peels a copy off Maya's app, splits it, and carries the
//                                                 halves to Theo and June, where each is redrawn in its owner's colours
import React from 'react';
import { DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT } from '../brand';
import {
  Cabinet, CABINET_TOP, Crossbar, HatFigure, HATS, Hero, Inkwell, INKWELL_MOUTH, jolt, KEEPSAKES, KeepsakeBox, Laptop, lin, mixHex, P, Padlock, Person, pop,
  PriceTag, Quill, RecordPlayer, TopHat, Tower, TOWER_SLAB, useT,
} from './take1c-ink';
import type { Hair, HatName, HeroName } from './take1c-ink';
import { rr, ThemedWindow, windowHeight } from './take1c-apps';
// WHY from the other half: both halves draw the same cast from take1c-ink, and line 7 / line 8 repeat line 2 /
// line 1 exactly, so their layouts are shared, not copied
import { hatPt, HeroString, PUPPETS, RULES_LAYOUT, Stream } from './take1c-spreads-a';
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
type QPos = ReturnType<typeof track>;
// WHY checked: the quill's keys are computed from word times; one out of order would make it jump.
const checked = (name: string, keys: Key[]) => {
  keys.forEach((k, i) => { if (i && k.t < keys[i - 1].t) throw new Error(`take1c ${name} quill key ${i} (t=${k.t.toFixed(2)}) comes before key ${i - 1}`); });
  return keys;
};
/** Overshoot then settle (a back-ease): for the quill's landings. */
const BACK = (v: number) => { const c = 1.7; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const mixPt = (a: [number, number], b: [number, number], k: number): [number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

/** The one quill, hovering `z` above the paper with its soft shadow on the page beneath its nib.
 *  WHY a shadow that spreads and fades with height: it is the only thing that tells the eye the quill is in the
 *  air above the drawing rather than printed on it. */
const FlyQuill: React.FC<{ q: QPos; o?: number; idle?: boolean }> = ({ q, o = 1, idle = true }) => {
  const t = useT();
  if (o <= 0.01 || q.s <= 0.01) return null;
  const z = Math.max(0, q.z + (idle ? Math.sin(t * 2.6) * 6 : 0));
  return (
    <g opacity={o}>
      {z < 45 && <ellipse cx={q.x + 16 * q.s + z * 0.2} cy={q.y + 3 + z * 0.1} rx={(26 + z * 0.1) * q.s} ry={(6 + z * 0.03) * q.s} fill={P.ink} opacity={0.18 * (1 - z / 45)} />}
      <Quill x={q.x} y={q.y - z} s={q.s} r={q.r + (idle ? Math.sin(t * 1.9) * 2 : 0)} />
    </g>
  );
};
/** A point at fraction u (0..1) of the way round a closed polygon, by length. */
const alongPoly = (pts: [number, number][], u: number): [number, number] => {
  const segs = pts.map((p, i) => [p, pts[(i + 1) % pts.length]] as const);
  const lens = segs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
  let d = clamp01(u) * lens.reduce((n, l) => n + l, 0);
  for (let i = 0; i < segs.length; i++) {
    if (d <= lens[i]) return mixPt(segs[i][0] as [number, number], segs[i][1] as [number, number], lens[i] ? d / lens[i] : 0);
    d -= lens[i];
  }
  return pts[0];
};
/** The point the window's outline has reached at time t while the quill draws it (else null).
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
type Drawn = { win: { x: number; y: number; w: number }; a: number; draw: number };
/** The quill, but pinned to a window's outline while that window is being drawn. */
const pin = (q: QPos, t: number, wins: Drawn[]) => {
  for (const w of wins) { const p = onOutline(w.win, w.a, w.draw, t); if (p) return { ...q, x: p.x, y: p.y, z: 0 }; }
  return q;
};
/** Keys that walk the quill round a window it is about to draw (the pinning then makes it exact). */
const drawKeys = (w: Drawn, s: number): Key[] => {
  const h = windowHeight(w.win.w), x0 = w.win.x - w.win.w / 2, y0 = w.win.y - h / 2, x1 = x0 + w.win.w, y1 = y0 + h;
  return [
    { t: w.a - 0.14, x: x0 - 8, y: y0 - 12, z: 18, r: -14, s },
    { t: w.a, x: x0, y: y0, r: -14, s },
    { t: w.a + w.draw * 0.3, x: x1, y: y0, r: -14, s },
    { t: w.a + w.draw * 0.5, x: x1, y: y1, r: -14, s },
    { t: w.a + w.draw * 0.8, x: x0, y: y1, r: -14, s },
    { t: w.a + w.draw, x: x0 + 10, y: y0 + 24, r: -14, s },
  ];
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

/** An ask, written into the book beside the person, one letter after another.
 *  WHY lower case and unsure: a real person's first ask (brand voice rules), and on the page, not in a box, so it
 *  reads as theirs rather than as an interface. WHY this big (round seven review): at 27 units it could not be read
 *  at phone size; every ask is now set so it is at least ~36 px tall on screen in its shot. */
const Ask: React.FC<{ lines: string[]; x: number; y: number; at: number; dur: number; size?: number; anchor?: 'start' | 'end' }> = ({ lines, x, y, at, dur, size = 36, anchor = 'start' }) => {
  const t = useT();
  const total = lines.reduce((n, l) => n + l.length, 0);
  let left = Math.floor(total * lin(t, at, at + dur, (v) => v));
  if (t < at) return null;
  return (
    // WHY a paper-coloured halo: the hero's faint string runs up behind the words; the halo knocks it out, as print does
    <g fontFamily={DMSANS} fontWeight={500} fontSize={size} fill={P.ink} letterSpacing="-0.015em" stroke={P.paper} strokeWidth={8} strokeLinejoin="round" style={{ paintOrder: 'stroke' }}>
      {lines.map((l, i) => {
        const n = Math.max(0, Math.min(l.length, left));
        left -= l.length;
        return n > 0 ? <text key={i} x={x} y={y + i * size * 1.2} textAnchor={anchor}>{l.slice(0, n)}</text> : null;
      })}
    </g>
  );
};
const ASKS = {
  maya: ['my plants keep dying.', 'can you help?'],
  theo: ['can i keep my records', "somewhere that's", 'actually mine?'],
  june: ['somewhere private', 'for my photos', 'and letters?'],
};

/** A plain table (top at y, legs down to `floor`). */
const Table: React.FC<{ x0: number; x1: number; y: number; floor: number; c?: string }> = ({ x0, x1, y, floor, c = P.ink }) => (
  <g>
    <path d={`M ${x0} ${y} L ${x1} ${y} L ${x1} ${y + 10} L ${x0} ${y + 10} Z`} fill={P.paperShade} stroke={c} strokeWidth={3} strokeLinejoin="round" />
    <path d={`M ${x0 + 14} ${y + 10} L ${x0 + 18} ${floor} M ${x1 - 14} ${y + 10} L ${x1 - 18} ${floor}`} stroke={c} strokeWidth={3.4} strokeLinecap="round" />
  </g>
);
/** A faint floor line under a vignette. */
const Floor: React.FC<{ x0: number; x1: number; y: number }> = ({ x0, x1, y }) => <path d={`M ${x0} ${y} L ${x1} ${y}`} stroke={P.inkSoft} strokeWidth={2} opacity={0.6} />;
/** Her plant app, fitted to a laptop's screen and clipped to it, so it fills the screen edge to edge.
 *  WHY clipped (round seven review): sized by width it spilled past the screen; sized by height it was a postage
 *  stamp. Clipped to the screen it reads at once as the same app, now living on her laptop. */
const OnScreen: React.FC<{ x: number; y: number; s: number; p?: number; id: string }> = ({ x, y, s, p = 1, id }) => {
  if (p <= 0) return null;
  const sx = x - 33 * s, sy = y - 44.5 * s, sw = 66 * s, sh = 41 * s;   // the screen's inside (Laptop draws it at -34..34, -46..-2)
  const w = sw * 1.02;
  return (
    <g>
      <defs><clipPath id={id}><rect x={sx} y={sy} width={sw} height={sh} rx={2} /></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        <g transform={`translate(${x} ${sy + sh / 2}) scale(${p}) translate(${-x} ${-(sy + sh / 2)})`}>
          <ThemedWindow theme="meadow" x={x} y={sy + windowHeight(w) / 2 - 3 * s} w={w} compact />
        </g>
      </g>
    </g>
  );
};

// ---------- the three hats, rigged ----------
// WHY a rig of our own (round seven review): "the hats are three front-facing bowling pins in a row and barely
// act"; "rubber-hose arms". Each hat here is the shared HatFigure with its arms drawn on the page from his real
// shoulders, so a hand can rub, point, push an inkwell or close on air at a believable length, with an elbow.
/** The idle life every hat has (the same breath, coat-tail swing and weight shift as in lines 1-4). */
const idleOf = (t: number, j: number) => ({ bob: Math.sin(t * 2.2 + j * 1.9) * 4.5, sway: Math.sin(t * 1.6 + j * 2.4) * 7, lean: Math.sin(t * 0.85 + j * 1.3) * 3 });
type Arm = { to: [number, number]; bend?: number; fist?: number; point?: boolean };
type RigP = {
  who: HatName; x: number; y: number; scale?: number; flip?: boolean; lean?: number; bob?: number; sway?: number;
  crown?: number; drop?: number; hatSx?: number; stretch?: number; puff?: number;
  eyes?: 'none' | 'dots' | 'smug'; mouth?: 'smug' | 'flat'; look?: number; fade?: number; L?: Arm; R?: Arm;
};
const rigS = (r: RigP) => HATS[r.who].s * (r.scale ?? 1);
/** A point on a rigged hat (his own drawing units) on the page, including his lean, breath and stretch. */
const rigPt = (r: RigP, lx: number, ly: number): [number, number] => {
  const Y = r.y + (r.bob ?? 0);
  const [px, py] = hatPt(r.x, Y, rigS(r), !!r.flip, r.lean ?? 0, lx, ly);
  return [px, Y + (py - Y) * (r.stretch ?? 1)];
};
const shoulder = (r: RigP, side: -1 | 1) => rigPt(r, side * 20, -168);
/** A hand's rest at his side, just outside his coat. */
const restHand = (r: RigP, side: -1 | 1) => rigPt(r, side * (14 + 30 * HATS[r.who].girth * (r.puff ?? 1)), -92);
/** A target no further from his shoulder than his arm can reach (`max` in his own units). */
const reachTo = (r: RigP, side: -1 | 1, to: [number, number], max = 128): [number, number] => {
  const sh = shoulder(r, side), m = max * rigS(r);
  const dx = to[0] - sh[0], dy = to[1] - sh[1], d = Math.hypot(dx, dy);
  return d <= m ? to : [sh[0] + (dx / d) * m, sh[1] + (dy / d) * m];
};
/** An arm from a shoulder to a hand, bowing outward through an elbow, ending in a glove (a ring, or a fist). */
const ArmLine: React.FC<{ sh: [number, number]; to: [number, number]; s: number; out: [number, number]; bend?: number; fist?: number; point?: boolean; c: string }> = ({ sh, to, s, out, bend = 0.16, fist = 0, point, c }) => {
  const dx = to[0] - sh[0], dy = to[1] - sh[1], len = Math.hypot(dx, dy) || 1;
  let px = -dy / len, py = dx / len;
  if (px * out[0] + py * out[1] < 0) { px = -px; py = -py; }
  const cx = (sh[0] + to[0]) / 2 + px * len * bend, cy = (sh[1] + to[1]) / 2 + py * len * bend;
  const ux = (to[0] - cx), uy = (to[1] - cy), ul = Math.hypot(ux, uy) || 1;
  const r = (7.5 - 3.6 * fist) * s;
  return (
    <g>
      <path d={`M ${sh[0].toFixed(1)} ${sh[1].toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${to[0].toFixed(1)} ${to[1].toFixed(1)}`} stroke={c} strokeWidth={8 * s} fill="none" strokeLinecap="round" />
      {point && <path d={`M ${to[0]} ${to[1]} l ${(ux / ul) * 15 * s} ${(uy / ul) * 15 * s}`} stroke={c} strokeWidth={4.6 * s} strokeLinecap="round" />}
      <circle cx={to[0]} cy={to[1]} r={r} fill={fist > 0.5 ? c : P.paper} stroke={c} strokeWidth={2.4 * s} />
    </g>
  );
};
/** One hat, his arms drawn on the page: the far arm behind his coat, the near arm in front. */
const HatRig: React.FC<RigP> = (r) => {
  const H = HATS[r.who], s = rigS(r), Y = r.y + (r.bob ?? 0);
  const ink = r.fade ? mixHex(P.ink, P.paper, r.fade * 0.66) : P.ink;
  const f = r.flip ? -1 : 1;
  const arm = (side: -1 | 1, a?: Arm) => (
    <ArmLine sh={shoulder(r, side)} to={a?.to ?? restHand(r, side)} s={s} out={[side * f, 0.8]} bend={a?.bend ?? 0.16} fist={a?.fist} point={a?.point} c={ink} />
  );
  return (
    <g>
      {arm(-1, r.L)}
      <g transform={`translate(0 ${Y}) scale(1 ${r.stretch ?? 1}) translate(0 ${-Y})`}>
        <HatFigure x={r.x} y={r.y} bob={r.bob} s={s} a={-10} pose="bare" flip={r.flip} lean={r.lean} sway={r.sway} crown={r.crown ?? H.crown}
          girth={H.girth * (r.puff ?? 1)} drop={r.drop} hatSx={r.hatSx} eyes={r.eyes ?? 'dots'} mouth={r.mouth ?? 'smug'} look={r.look} fade={r.fade} />
      </g>
      {arm(1, r.R)}
    </g>
  );
};
/** A hat's arms in one of his stock gestures, in his own units (sent to the page through the rig). */
const gesture = (r: RigP, kind: 'rub' | 'lapels' | 'surprise', t = 0, j = 0): { L: Arm; R: Arm } => {
  const g = HATS[r.who].girth * (r.puff ?? 1);
  if (kind === 'rub') {
    // WHY the hands slide across each other: "rubbing their hands" has to move, or it reads as a held pose
    const o = Math.sin(t * 2 * Math.PI * 3.2 + j * 1.7) * 5;
    return { L: { to: rigPt(r, -7 + o, -118), bend: 0.3 }, R: { to: rigPt(r, 7 + o, -121), bend: 0.3 } };
  }
  if (kind === 'lapels') return { L: { to: rigPt(r, -10 - 8 * g, -148), bend: 0.42 }, R: { to: rigPt(r, 10 + 8 * g, -148), bend: 0.42 } };
  return { L: { to: rigPt(r, -30 - 26 * g, -136), bend: 0.2 }, R: { to: rigPt(r, 30 + 26 * g, -136), bend: 0.2 } };
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

// ======================= v · the treasure, and the tool =======================
// The left page: their tower of windows with the three on top, and beside it their tall desk at waist height.
// The right page: Maya, waiting, beside her padlocked laptop (from chapter ii).
// WHY the desk is at their waist (round seven review): at their feet, every reach for the inkwell became a long
// rubber arm. WHY the tall one stands nearest the desk: he slides the inkwell in, points at the treasure and grabs
// for the quill, all with an arm of ordinary length, and nobody's arm has to cross a neighbour's body.
const TW = { x: 252, y: 880, w: 340, n: 6 };
const TOP = TW.y - TW.n * TOWER_SLAB;                     // where the hats stand
// drawn back to front: the wide one a step behind
const V_HATS: { who: HatName; x: number; y: number }[] = [{ who: 'wide', x: 128, y: TOP - 4 }, { who: 'short', x: 250, y: TOP }, { who: 'tall', x: 372, y: TOP }];
const DESK = { x0: 416, x1: 748, y: TOP - 96 };
const WELL = { from: 500, to: 582 };                      // the inkwell: where iv left it, and the middle of the desk
const MOUTH = DESK.y - INKWELL_MOUTH;
const REST = { x: WELL.to + 2, y: MOUTH + 6, r: -16, s: 1.25 };   // the quill standing in the inkwell
const CHEST = { x: 684, y: DESK.y };
// Maya's corner of the right page
const MAYA = { x: 1150, y: 860, s: 1.9 };
const LAP = { x: 1372, y: 768, s: 1.3 };
const WIN = { x: 1252, y: 330, w: 390 };
const WIN_H = windowHeight(WIN.w);
// WHY these times: the ask writes itself from "control" into "tool"; the quill traces the window on "can make"
// and it fills on "software", ticking its own box, while Maya blooms green: all finished before the page turns.
const ASK_A = { at: Q.control + 0.42, dur: 0.85 };
const WIN_A = Q.tool + 0.3, WIN_DRAW = 0.6;
const PLANTS_AT = Q.software - 0.02;
const TICK_AT = PLANTS_AT + 0.42;
const MAYA_BLOOM = [Q.software + 0.05, Q.software + 0.6] as const;
if (MAYA_BLOOM[1] > TURN.anyone) throw new Error('take1c: Maya must finish blooming before the page turns to chapter vi');
const DRAWN = -10;                                         // the film cuts straight into this spread: already drawn
// the inkwell slide on "created": he reaches in, slides it to the middle, lets go; it rocks to a stop on "technology"
const PUSH = { reach: Q.created1 - 0.25, from: Q.created1 + 0.08, to: Q.created1 + 0.8, off: Q.created1 + 0.9 };
// the coins on "shareholder value": nine land, one after another; the tenth is left unfinished when the quill stops
const COINS: [number, number][] = [[-26, -54], [-8, -56], [12, -55], [28, -52], [-16, -66], [4, -68], [20, -64], [-4, -79], [12, -78], [-24, -76]];
const coinAt = (i: number) => Q.shareholder + 0.02 + i * 0.12;
// the chest's outline, traced corner to corner by the quill on "treasure"
const CHEST_PTS: [number, number][] = [[CHEST.x - 46, CHEST.y], [CHEST.x - 46, CHEST.y - 48], [CHEST.x + 46, CHEST.y - 48], [CHEST.x + 46, CHEST.y]];
const TRACE = { a: Q.treasure + 0.1, b: Q.treasure + 0.72 };

/** Each hat's whole state at time t in chapter v (j: 0 wide, 1 short, 2 tall). */
const vHat = (t: number, j: number): RigP => {
  const h = V_HATS[j], id = idleOf(t, j), tall = j === 2;
  // --- "hubris": two proud pops each, staggered: up onto the toes with a stretch, the hat hopping off the head
  // and landing back on it with a squash. WHY instead of the old telescoping crowns (review: "reads as a stretch
  // glitch, not pride"): the pride is in their bodies; the crowns only grow a little, and stay grown.
  let pp = 0, sq = 0, hop = 0, land = 0;
  for (const k of [0, 1]) {
    const x = (t - (Q.hubris + 0.02 + k * 0.32 + j * 0.06)) / 0.34;
    if (x <= 0 || x >= 1) continue;
    pp += Math.sin(Math.PI * clamp01((x - 0.12) / 0.62));
    sq += x < 0.12 ? Math.sin((x / 0.12) * Math.PI) : x > 0.74 ? Math.sin(((x - 0.74) / 0.26) * Math.PI) : 0;
    const xh = (x - 0.18) / 0.64; if (xh > 0 && xh < 1) hop += Math.sin(Math.PI * xh);
    const xl = (x - 0.82) / 0.18; if (xl > 0 && xl < 1) land += Math.sin(Math.PI * xl);
  }
  const proud = lin(t, Q.hubris + 0.05, Q.hubris + 0.7);
  const chin = -6 * proud * (t < CUT.these ? 1 : 0.35);
  // --- "created": the tall one leans over the desk and slides the inkwell in; the other two lean to watch
  const reachIn = lin(t, PUSH.reach, PUSH.from) * (1 - lin(t, PUSH.off, PUSH.off + 0.35));
  const slide = lin(t, PUSH.from, PUSH.to, EASE_IN_OUT);
  const pushLean = tall ? (12 * reachIn + 12 * slide * (1 - lin(t, PUSH.off, PUSH.off + 0.4))) : 4 * lin(t, PUSH.reach, PUSH.from) * (1 - lin(t, Q.artificial, Q.artificial + 0.3));
  // --- "intelligence": all three start back from the quill
  const start = jolt(t, Q.intelligence, 1, 0.6);
  // --- "believed": heads turn to the quill one after another, and they lean toward the desk, rubbing their hands
  const believe = lin(t, Q.believed - 0.1 + j * 0.12, Q.believed + 0.25 + j * 0.12) * (1 - lin(t, Q.but - 0.05, Q.but + 0.1));
  // --- "treasure": the tall one points; the other two lean in; "value": they lean back, thumbs in their lapels
  const greed = lin(t, Q.greatTreasure - 0.1, Q.treasure + 0.3) * (1 - lin(t, Q.value, Q.value + 0.35));
  const smug = lin(t, Q.value, Q.value + 0.35) * (1 - lin(t, Q.but - 0.05, Q.but + 0.15));
  // --- "but": they freeze; "excitement": forward; "far beyond": the tall one lunges, the others reach; "control": air
  const excite = lin(t, Q.excitement - 0.1, Q.excitement + 0.4) * (1 - lin(t, Q.control + 0.7, Q.control + 1.3));
  const lunge = lin(t, Q.far - 0.05, Q.beyond + 0.15) * (1 - lin(t, Q.control + 0.6, Q.control + 1.1));
  const lean = id.lean * (1 - 0.6 * (reachIn + lunge)) + chin + pushLean - 7 * start + 3 * believe + (tall ? 5 : 8) * greed - 6 * smug
    + 6 * excite + (tall ? 14 : 6) * lunge;
  const r: RigP = {
    who: h.who, x: h.x, y: h.y, lean, sway: id.sway, puff: 1 + 0.05 * proud,
    bob: id.bob - 13 * pp + 3 * sq - 6 * start,
    stretch: 1 + 0.08 * pp - 0.05 * sq, drop: -1.5 * hop, hatSx: 1 + 0.2 * land,
    crown: HATS[h.who].crown + 18 * proud,
    eyes: t < CUT.these || smug > 0.5 ? 'smug' : 'dots',
    mouth: t > Q.but && t < Q.control + 1.4 ? 'flat' : 'smug',
    // they look toward the desk once there is something on it; before the slide, straight ahead
    look: t < CUT.these ? 0.2 : Math.min(1, 0.35 + 0.65 * Math.max(lin(t, PUSH.reach, PUSH.from), believe, lin(t, Q.artificial, Q.artificial + 0.2))),
  };
  // --- arms
  if (tall && reachIn > 0) {
    const wx = WELL.from + (WELL.to - WELL.from) * slide;
    const hi: [number, number] = [wx - 40, DESK.y - 44], lo: [number, number] = [wx - 40, DESK.y - 15];
    r.R = { to: mixPt(restHand(r, 1), reachTo(r, 1, hi, 140), reachIn), bend: 0.2 };
    r.L = { to: mixPt(restHand(r, -1), reachTo(r, -1, lo, 140), reachIn), bend: 0.12 };
  } else if (believe > 0.3 && greed < 0.5 && smug < 0.5) {
    Object.assign(r, gesture(r, 'rub', t, j));
  }
  if (greed > 0.3) {
    Object.assign(r, gesture(r, 'rub', t, j));
    // WHY his point aims at the desk where he wants it, at arm's length: "draw us treasure"
    if (tall) r.R = { to: mixPt(restHand(r, 1), reachTo(r, 1, [CHEST.x + 10, DESK.y - 150], 124), clamp01((greed - 0.3) / 0.5)), bend: 0.08, point: true };
  }
  if (smug > 0.3) Object.assign(r, gesture(r, 'lapels'));
  if (t > Q.but && excite > 0.2) Object.assign(r, gesture(r, 'surprise'));
  if (lunge > 0) {
    // the tall one's glove goes for the quill and closes on air on "control"; the others thrust one arm up
    if (tall) r.R = { to: mixPt(restHand(r, 1), reachTo(r, 1, [CHEST.x + 20, DESK.y - 170], 136), lunge), bend: 0.1, fist: lin(t, Q.control + 0.02, Q.control + 0.12) };
    else r.R = { to: mixPt(restHand(r, 1), rigPt(r, 52, -214), lunge), bend: 0.2, fist: lin(t, Q.control + 0.05, Q.control + 0.15) };
  }
  return r;
};

/** The chest the quill draws for them on "treasure": its outline is traced, the lid creaks open, coins heap up.
 *  WHY in the hats' own plum ink (round seven review: "tan and brown clip-art, the first non-plum colour"): only the
 *  coins carry a muted gold, so the colour that arrives is the treasure itself, not the box. */
const Chest: React.FC<{ t: number }> = ({ t }) => {
  const { x, y } = CHEST;
  const draw = lin(t, TRACE.a, TRACE.b, EASE_IN_OUT);
  if (draw <= 0) return null;
  const filled = lin(t, TRACE.b - 0.1, TRACE.b + 0.2);
  const lid = lin(t, Q.treasure + 0.95, Q.treasure + 1.3, EASE_OUT) + jolt(t, Q.treasure + 1.3, 0.07, 0.45);
  const box = `M ${CHEST_PTS.map((p) => p.join(' ')).join(' L ')} Z`;
  return (
    <g>
      <ellipse cx={x} cy={y + 2} rx={56} ry={6} fill={P.ink} opacity={0.14 * filled} />
      {/* the back of the chest's mouth, then the coins heaped in it, then its front */}
      {filled > 0 && <path d={`M ${x - 46} ${y - 48} L ${x + 46} ${y - 48} L ${x + 40} ${y - 56} L ${x - 40} ${y - 56} Z`} fill={P.ink} opacity={filled} />}
      {COINS.map(([cx, cy], i) => {
        // the last coin is only ever half drawn: the quill stops dead on "but"
        const p = Math.min(lin(t, coinAt(i), coinAt(i) + 0.18, (v) => v), i === COINS.length - 1 ? lin(Q.but, coinAt(i), coinAt(i) + 0.18, (v) => v) : 1);
        return <Coin key={i} x={x + cx} y={y + cy} p={p} drop={p >= 1 ? jolt(t, coinAt(i) + 0.18, 3, 0.3) : 0} />;
      })}
      <path d={box} fill={P.inkSoft} opacity={filled} />
      {/* iron bands and a lock plate, in the same ink */}
      <path d={`M ${x - 46} ${y - 30} L ${x + 46} ${y - 30} M ${x - 24} ${y - 48} L ${x - 24} ${y} M ${x + 24} ${y - 48} L ${x + 24} ${y}`} stroke={P.ink} strokeWidth={4} opacity={filled} />
      <path d={box} pathLength={1} strokeDasharray={draw < 1 ? '1 2' : undefined} strokeDashoffset={draw < 1 ? 1 - draw : undefined} fill="none" stroke={P.ink} strokeWidth={3.2} strokeLinejoin="round" />
      {filled > 0 && <rect x={x - 7} y={y - 37} width={14} height={14} rx={2} fill={P.paper} stroke={P.ink} strokeWidth={2.4} opacity={filled} />}
      {/* the lid, hinged at the back, creaking open */}
      {filled > 0 && (
        <g transform={`rotate(${-lid * 62} ${x - 48} ${y - 48})`} opacity={filled}>
          <path d={`M ${x - 48} ${y - 48} L ${x - 48} ${y - 62} Q ${x} ${y - 86} ${x + 48} ${y - 62} L ${x + 48} ${y - 48} Z`} fill={P.ink} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
          <path d={`M ${x - 24} ${y - 50} L ${x - 24} ${y - 76} M ${x + 24} ${y - 50} L ${x + 24} ${y - 76}`} stroke={P.inkSoft} strokeWidth={3} />
        </g>
      )}
    </g>
  );
};
/** A coin, inked as an outline that fills in muted gold when finished (`p` 0..1 of its drawing). */
const Coin: React.FC<{ x: number; y: number; p: number; drop?: number }> = ({ x, y, p, drop = 0 }) => {
  if (p <= 0) return null;
  const Y = y + drop;
  const d = `M ${x - 14} ${Y} a 14 5.5 0 1 0 28 0 a 14 5.5 0 1 0 -28 0`;
  return (
    <g>
      {p >= 1 && <path d={`M ${x - 14} ${Y} L ${x - 14} ${Y + 5} a 14 5.5 0 0 0 28 0 L ${x + 14} ${Y} Z`} fill="#B8924E" stroke={P.ink} strokeWidth={2.2} />}
      {p >= 1 && <path d={d} fill="#DDBB72" />}
      <path d={d} pathLength={1} strokeDasharray={p < 1 ? '1 2' : undefined} strokeDashoffset={p < 1 ? 1 - p : undefined} fill="none" stroke={P.ink} strokeWidth={2.4} />
    </g>
  );
};

const TreasureArt: React.FC = () => {
  const t = useT();
  const hats = V_HATS.map((_, j) => vHat(t, j));
  const slide = lin(t, PUSH.from, PUSH.to, EASE_IN_OUT);
  const wellX = WELL.from + (WELL.to - WELL.from) * slide;
  // WHY it rocks to a stop on "technology": the slide has weight; the ripple then matches the one in chapter iv
  const rock = jolt(t, PUSH.to, 5, Q.technology2 - PUSH.to + 0.1);
  // the quill: born on "artificial", leaves the inkwell on "great", traces the chest on "treasure", dabs coins on
  // "value", stops dead on "but", dips on "far" and darts over the gutter on "control", then draws her window
  const shake = t > Q.but && t < Q.but + 0.1 ? Math.sin(t * 190) * 3 : 0;
  const coinKeys: Key[] = COINS.slice(0, COINS.length - 1).map(([cx, cy], i) => ({ t: coinAt(i) + 0.12, x: CHEST.x + cx + 12, y: CHEST.y + cy, r: -20, s: 1.0 }));
  const lastCoin = COINS[COINS.length - 1];
  const q0 = track(checked('treasure', [
    { t: Q.artificial, x: REST.x, y: REST.y + 210, r: REST.r, s: REST.s },
    { t: Q.artificial + 0.4, x: REST.x, y: REST.y - 26, r: REST.r - 6, s: REST.s, ease: EASE_OUT },
    { t: Q.artificial + 0.75, ...REST, z: 0 },
    { t: Q.greatTreasure, ...REST },
    { t: Q.greatTreasure + 0.3, x: REST.x + 30, y: MOUTH - 60, z: 40, r: -22, s: 1.05, ease: EASE_OUT },
    { t: TRACE.a, x: CHEST_PTS[0][0], y: CHEST_PTS[0][1], r: -24, s: 1.0 },
    { t: TRACE.b, x: CHEST_PTS[0][0], y: CHEST_PTS[0][1], r: -24, s: 1.0 },
    { t: TRACE.b + 0.35, x: CHEST.x + 54, y: DESK.y - 140, z: 30, r: -12, s: 1.0 },
    { t: coinAt(0) - 0.05, x: CHEST.x + 44, y: DESK.y - 110, z: 20, r: -14, s: 1.0 },
    ...coinKeys,
    // "but": it stops dead over the unfinished coin
    { t: Q.but, x: CHEST.x + lastCoin[0] + 12, y: CHEST.y + lastCoin[1], r: -20, s: 1.0 },
    { t: Q.but + 0.45, x: CHEST.x + 4, y: DESK.y - 128, z: 36, r: -8, s: 1.0, ease: EASE_OUT },
    // "they created something": it turns its nib toward the far page, toward Maya
    { t: Q.createdSomething, x: CHEST.x + 8, y: DESK.y - 132, z: 40, r: -8, s: 1.0 },
    { t: Q.createdSomething + 0.45, x: CHEST.x + 14, y: DESK.y - 134, z: 40, r: 28, s: 1.0 },
    // WHY a dip before the dart (anticipation): the escape then reads as its own choice
    { t: Q.far + 0.25, x: CHEST.x + 4, y: DESK.y - 118, z: 30, r: 34, s: 1.0 },
    { t: Q.control - 0.02, x: CHEST.x + 2, y: DESK.y - 116, z: 30, r: 36, s: 1.0 },
    { t: Q.control + 0.2, x: 900, y: 420, z: 70, r: 30, s: 0.98, ease: EASE_IN },
    { t: Q.control + 0.55, x: MAYA.x + 150, y: 560, z: 60, r: 8, s: 0.95, ease: EASE_OUT },
    { t: WIN_A - 0.3, x: MAYA.x + 120, y: 520, z: 60, r: -6, s: 0.95 },
    // drawing her window round, clockwise from its top-left corner (pinned to the outline below)
    ...drawKeys({ win: WIN, a: WIN_A, draw: WIN_DRAW }, 0.9),
    // the tick: it dabs the box, then rises clear of the window
    { t: TICK_AT, x: WIN.x - WIN.w / 2 + (214 + 12) * (WIN.w / 400), y: WIN.y - WIN_H / 2 + 186 * (WIN.w / 400), r: -14, s: 0.9 },
    { t: TICK_AT + 0.4, x: WIN.x + WIN.w / 2 - 20, y: WIN.y + WIN_H / 2 + 40, z: 50, r: 6, s: 0.9, ease: EASE_OUT },
  ]), t);
  // WHY pinned to the chest's outline while it traces it: the nib must sit on the end of its own line
  const tracing = t >= TRACE.a && t <= TRACE.b;
  const q1 = tracing ? (() => { const p = alongPoly(CHEST_PTS, lin(t, TRACE.a, TRACE.b, EASE_IN_OUT)); return { ...q0, x: p[0], y: p[1], z: 0 }; })() : q0;
  const qp = pin(q1, t, [{ win: WIN, a: WIN_A, draw: WIN_DRAW }]);
  const qv = { ...qp, x: qp.x + shake };
  const inWell = t < Q.artificial + 0.7;
  const flying = t > Q.control - 0.02;
  // Maya: waiting, watching the quill come to her; blooms green as her app fills
  const mayaBloom = lin(t, MAYA_BLOOM[0], MAYA_BLOOM[1], EASE_IN_OUT);
  const mayaLook = t > Q.control + 0.3;
  const sheen = lin(t, TICK_AT - 0.1, TICK_AT + 0.3);
  return (
    <Sheet>
      <defs><clipPath id="c-well-mouth"><rect x={-200} y={-400} width={2000} height={MOUTH + 400} /></clipPath></defs>
      {/* their tower of windows, and the three on top of it */}
      <Tower x={TW.x} y={TOP} w={TW.w} n={TW.n} />
      {/* their desk: tall, at their waist, standing on the same floor as the tower */}
      <path d={`M ${DESK.x0 + 22} ${DESK.y + 16} L ${DESK.x0 + 28} ${TW.y} M ${DESK.x1 - 22} ${DESK.y + 16} L ${DESK.x1 - 28} ${TW.y}`} stroke={P.ink} strokeWidth={5} strokeLinecap="round" />
      <path d={`M ${DESK.x0} ${DESK.y} L ${DESK.x1} ${DESK.y} L ${DESK.x1} ${DESK.y + 16} L ${DESK.x0} ${DESK.y + 16} Z`} fill={P.inkSoft} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
      <Floor x0={70} x1={760} y={TW.y} />
      {hats.map((r, j) => <HatRig key={j} {...r} />)}
      <Chest t={t} />
      {/* the inkwell from chapter iv, still rippling as we arrive; again when the quill is born */}
      <Inkwell x={wellX} y={DESK.y} rock={rock} fill={1} glow={0.3} />
      <Ripples x={wellX} y={DESK.y} at={[CUT.these - 0.35, CUT.these + 0.35, Q.technology2 - 0.1, Q.artificial + 0.02]} />
      {/* the tall one's gloves go over the inkwell's shoulder while he slides it (drawn again above the inkwell) */}
      {hats[2].R && t > PUSH.reach && t < PUSH.off + 0.35 && (
        <circle cx={hats[2].R.to[0]} cy={hats[2].R.to[1]} r={7.5 * rigS(hats[2])} fill={P.paper} stroke={P.ink} strokeWidth={2.4} />
      )}
      {/* the quill: hidden below the inkwell's mouth while it rises out of it */}
      {t > Q.artificial && !flying && (
        <g clipPath={inWell ? 'url(#c-well-mouth)' : undefined}>
          {t > Q.greatTreasure ? <FlyQuill q={qv} idle={t < Q.treasure - 0.1 || (t > Q.but + 0.45 && t < Q.far)} /> : <Quill x={q0.x} y={q0.y} s={q0.s} r={q0.r + Math.sin(t * 1.7) * 2} />}
        </g>
      )}

      {/* the right page: Maya, her padlocked laptop on its table, and her string up off the page */}
      <HeroString x={MAYA.x} y={MAYA.y} s={MAYA.s} lean={-150} />
      <Table x0={LAP.x - 80} x1={LAP.x + 80} y={LAP.y} floor={MAYA.y} />
      <Floor x0={800} x1={1460} y={MAYA.y} />
      {/* her laptop, padlocked as chapter ii left it (the padlock hangs on its screen) */}
      <Laptop x={LAP.x} y={LAP.y} s={LAP.s} a={-10} />
      <Padlock x={LAP.x} y={LAP.y - 26 * LAP.s} s={1.15} at={-10} />
      <Hero who="maya" x={MAYA.x} y={MAYA.y} s={MAYA.s} a={-10} pose={t > PLANTS_AT ? 'wave' : 'down'} mood={mayaLook ? 'smile' : 'flat'} bloom={mayaBloom}
        bob={jolt(t, PLANTS_AT, -8, 0.5) + jolt(t, Q.control + 0.5, 4, 0.4)} tilt={mayaLook ? 3 : 0} />
      <Ask lines={ASKS.maya} x={MAYA.x - 172} y={MAYA.y - MAYA.s * 120 - 66} at={ASK_A.at} dur={ASK_A.dur} size={38} />
      <ThemedWindow theme="meadow" x={WIN.x} y={WIN.y} w={WIN.w} a={WIN_A} draw={WIN_DRAW} contentAt={PLANTS_AT} tick={TICK_AT} />
      {/* a short dashed line from her new window down to her laptop: this is hers */}
      {sheen > 0 && <path d={`M ${WIN.x + 70} ${WIN.y + WIN_H / 2 + 8} Q ${LAP.x + 26} ${LAP.y - 150} ${LAP.x + 6} ${LAP.y - 66}`} stroke={P.purple} strokeWidth={3}
        strokeDasharray="8 9" fill="none" opacity={0.75 * sheen} strokeLinecap="round" />}
      {/* once it has escaped, the quill is drawn last, over the window it is drawing */}
      {flying && <FlyQuill q={qv} idle={!(t > WIN_A - 0.14 && t < WIN_A + WIN_DRAW)} />}
    </Sheet>
  );
};
export const TREASURE: Spread = { id: 'treasure', Art: TreasureArt };
/** Where things are on this spread, for the camera. */
export const TREASURE_MARKS = { well: { x: WELL.to, y: MOUTH }, hats: { x: V_HATS[1].x, y: TOP }, maya: MAYA, win: WIN, winH: WIN_H, chest: CHEST, desk: DESK, top: TOP };

// ======================= vi · anyone =======================
// WHY three columns, one band (round seven review: "lopsided and small ... the three windows do not read as one
// window in three colours"): Maya, Theo and June each stand in front of the lower-left corner of their own
// window, each window under that person's own words. The same window three times, in a row, three colours, each
// answering what was taken from its owner. The hats' tower is small and far off in the top-left corner; the
// headline lands on the clean paper under the right-hand page.
const FAR = { x: 112, y: 214, s: 0.4, n: 6, w: 300 };
const VI = {
  maya: { x: 270, y: 694, s: 1.8 }, mayaWin: { x: 428, y: 352, w: 340 }, mayaAsk: { x: 250, y: 140 },
  lap: { x: 528, y: 604, s: 1.15 }, table: [446, 612] as [number, number],
  theo: { x: 846, y: 628, s: 1.55 }, theoWin: { x: 986, y: 348, w: 320 }, theoAsk: { x: 826, y: 100 },
  june: { x: 1202, y: 656, s: 1.75 }, juneWin: { x: 1338, y: 372, w: 320 }, juneAsk: { x: 1180, y: 124 },
};
const VI_L = land(TURN.anyone);
// WHY from "ever-scarce", while the leaf is still falling: Theo's corner is uncovered first, and the ask must
// be finished as the quill draws on "foundation"
const THEO_ASK = { at: Q.scarce, dur: Q.foundation - Q.scarce - 0.06 };
const THEO_WIN = { a: Q.foundation - 0.02, draw: 0.44, content: Q.foundation + 0.38 };
const JUNE_ASK = { at: Q.monopolies1 + 0.08, dur: 0.78 };
const JUNE_WIN = { a: Q.forAnyone, draw: 0.44, content: Q.anyone + 0.25 };
if (THEO_ASK.at + THEO_ASK.dur > THEO_WIN.a + 0.1) throw new Error('take1c: Theo must finish asking before his window is drawn');
if (JUNE_WIN.content + 0.7 > Q.asks) throw new Error('take1c: June\'s window must be finished by "asks", so the held frame is complete');
const AnyoneArt: React.FC = () => {
  const t = useT();
  const theoBloom = lin(t, THEO_WIN.content + 0.1, THEO_WIN.content + 0.6, EASE_IN_OUT);
  const juneBloom = lin(t, JUNE_WIN.content + 0.1, JUNE_WIN.content + 0.6, EASE_IN_OUT);
  // the hats turn to stare on "monopolies", and their tower wobbles once
  const stare = lin(t, Q.monopolies1 - 0.05, Q.monopolies1 + 0.25);
  const wob = jolt(t, Q.monopolies1 + 0.1, 2.4, 0.9);
  const theoDraw: Drawn = { win: VI.theoWin, a: THEO_WIN.a, draw: THEO_WIN.draw };
  const juneDraw: Drawn = { win: VI.juneWin, a: JUNE_WIN.a, draw: JUNE_WIN.draw };
  const jh = windowHeight(VI.juneWin.w);
  const q = track(checked('anyone', [
    { t: VI_L - 0.4, x: VI.mayaWin.x + 150, y: VI.mayaWin.y + 190, z: 60, r: 6, s: 0.85 },
    { t: THEO_WIN.a - 0.5, x: VI.theoWin.x - 60, y: VI.theoWin.y + 60, z: 50, r: -6, s: 0.82 },
    ...drawKeys(theoDraw, 0.8),
    { t: THEO_WIN.content + 0.5, x: VI.theoWin.x + VI.theoWin.w / 2 - 20, y: VI.theoWin.y + windowHeight(VI.theoWin.w) / 2 + 40, z: 50, r: 4, s: 0.8, ease: EASE_OUT },
    ...drawKeys(juneDraw, 0.8),
    // "asks": it settles at the foot of June's new window, clear of every word, and idles there until the turn
    { t: Q.asks, x: VI.juneWin.x + VI.juneWin.w / 2 - 54, y: VI.juneWin.y + jh / 2 + 70, z: 46, r: -18, s: 0.8, ease: EASE_OUT },
  ]), t);
  const qp = pin(q, t, [theoDraw, juneDraw]);
  return (
    <Sheet>
      {/* far off, small: the hats on their tower of windows */}
      <g transform={`rotate(${wob} ${FAR.x} ${FAR.y + FAR.n * TOWER_SLAB * FAR.s})`}>
        <Tower x={FAR.x} y={FAR.y} w={FAR.w} n={FAR.n} s={FAR.s} wobble={wob * 0.5} />
        {(['wide', 'short', 'tall'] as HatName[]).map((who, j) => {
          const id = idleOf(t, j);
          return <HatFigure key={who} x={FAR.x - 40 + j * 40} y={FAR.y} s={HATS[who].s * 0.42} crown={HATS[who].crown} girth={HATS[who].girth} a={-10} pose="sides"
            eyes="dots" mouth="flat" look={0.3 + 0.7 * stare} lean={id.lean + stare * 5} bob={id.bob * 0.5} sway={id.sway} />;
        })}
      </g>
      {/* Maya, with the window she was made, and her laptop, still padlocked (she opens it in chapter vii) */}
      <HeroString x={VI.maya.x} y={VI.maya.y} s={VI.maya.s} lean={-64} o={0.5} />
      <Floor x0={70} x1={700} y={VI.maya.y} />
      <Table x0={VI.table[0]} x1={VI.table[1]} y={VI.lap.y} floor={VI.maya.y} />
      <Laptop x={VI.lap.x} y={VI.lap.y} s={VI.lap.s} a={-10} />
      <Padlock x={VI.lap.x} y={VI.lap.y - 26 * VI.lap.s} s={0.95} at={-10} />
      <ThemedWindow theme="meadow" x={VI.mayaWin.x} y={VI.mayaWin.y} w={VI.mayaWin.w} />
      <path d={`M ${VI.mayaWin.x + 90} ${VI.mayaWin.y + windowHeight(VI.mayaWin.w) / 2 + 8} L ${VI.lap.x + 2} ${VI.lap.y - 60}`} stroke={P.purple} strokeWidth={3} strokeDasharray="8 9" opacity={0.7} strokeLinecap="round" />
      <Hero who="maya" x={VI.maya.x} y={VI.maya.y} s={VI.maya.s} a={-10} bloom={1} mood="smile" pose="down" tilt={2 * lin(t, Q.monopolies1, Q.monopolies1 + 0.4)} />
      <Ask lines={ASKS.maya} x={VI.mayaAsk.x} y={VI.mayaAsk.y} at={-10} dur={0.1} size={34} />
      {/* Theo, a step back */}
      <HeroString x={VI.theo.x} y={VI.theo.y} s={VI.theo.s} lean={-52} o={0.5} />
      <ThemedWindow theme="honey" what="records" x={VI.theoWin.x} y={VI.theoWin.y} w={VI.theoWin.w} a={THEO_WIN.a} draw={THEO_WIN.draw} contentAt={THEO_WIN.content} />
      <Hero who="theo" x={VI.theo.x} y={VI.theo.y} s={VI.theo.s} a={-10} bloom={theoBloom} mood={theoBloom > 0.3 ? 'smile' : 'flat'}
        pose={theoBloom > 0.3 ? 'wave' : 'down'} bob={jolt(t, THEO_WIN.content + 0.1, -7, 0.5)} />
      <Ask lines={ASKS.theo} x={VI.theoAsk.x} y={VI.theoAsk.y} at={THEO_ASK.at} dur={THEO_ASK.dur} size={32} />
      {/* June, a step nearer */}
      <HeroString x={VI.june.x} y={VI.june.y} s={VI.june.s} lean={-46} o={0.5} />
      <ThemedWindow theme="cotton" what="keepsakes" x={VI.juneWin.x} y={VI.juneWin.y} w={VI.juneWin.w} a={JUNE_WIN.a} draw={JUNE_WIN.draw} contentAt={JUNE_WIN.content} />
      <Hero who="june" x={VI.june.x} y={VI.june.y} s={VI.june.s} a={-10} bloom={juneBloom} mood={juneBloom > 0.3 ? 'smile' : 'flat'}
        pose={juneBloom > 0.3 ? 'up' : 'down'} bob={jolt(t, JUNE_WIN.content + 0.1, -8, 0.5)} />
      <Ask lines={ASKS.june} x={VI.juneAsk.x} y={VI.juneAsk.y} at={JUNE_ASK.at} dur={JUNE_ASK.dur} size={32} />
      <FlyQuill q={qp} idle={qp === q} />
    </Sheet>
  );
};
export const ANYONE: Spread = { id: 'anyone', Art: AnyoneArt };
export const ANYONE_MARKS = VI;

// ======================= vii · ours: chapter ii, undone =======================
// WHY chapter ii's exact layout (RULES_LAYOUT, shared with the other half): the narrator repeats that line's three
// clauses word for word, so the pictures repeat in colour, and the one quill, passed hand to hand, undoes each
// taking on its own clause. The three hats are greyed out at their places.
const ML = RULES_LAYOUT.maya, TL = RULES_LAYOUT.theo, JL = RULES_LAYOUT.june;
const GREY = 0.8;
const GREY_INK = mixHex(P.ink, P.paper, GREY * 0.66);
const LOCK = { x: ML.laptop.x, y: ML.laptop.y - 26 * ML.laptop.s };          // where the padlock hangs on her screen
const CAB_TOP = TL.cabinet.y - CABINET_TOP * TL.cabinet.s;                    // where the record player belongs
// WHY it hangs 90 above its place on a long, visible string (round seven review: flush under a long pole, the
// string was 40 px and the snip cut nothing anyone could see). The wide hat leans in and holds the same short
// puppet crossbar as in line 1 out over the cabinet, his arm bent at the elbow.
// WHY the bar no higher than y ~590: above that it showed at the foot of Maya's close-up, as a stray cross
const DANGLE = { x: TL.cabinet.x - 10, y: CAB_TOP - 70 };
const WIDE_LEAN = 14;
const WIDE_RIG: RigP = { who: 'wide', x: TL.hat.x, y: TL.hat.y, scale: TL.hat.s, flip: true, lean: WIDE_LEAN };
const BAR = { x: DANGLE.x + 50, y: DANGLE.y - 46 * TL.cabinet.s - 92, w: 110 };
const BAR_HAND: [number, number] = [BAR.x + 36, BAR.y + 2];
const PLAYER_TOP = (y: number) => y - 46 * TL.cabinet.s;                      // where its string ties on (the tonearm post)
// June's box and the short hat's top hat, held out like a bucket.
// WHY computed as chapter ii computes them (its numbers mirrored here: the box at her chest, the high arc), so the
// keepsakes fly home along exactly the curve they were taken on.
const JS = HATS.short.s * JL.hat.s;
const BUCKET_HAND = hatPt(JL.hat.x, JL.hat.y, JS, true, 0, 73, -119);
const BUCKET = { x: BUCKET_HAND[0] - 26 * JS, y: BUCKET_HAND[1] - 6, r: -78 };
const JBOX = { x: JL.x, y: JL.y - 40 * JL.s, s: 0.78 };
const STREAM_P0: [number, number] = [JBOX.x, JBOX.y - 62 * JBOX.s];
const STREAM_P1: [number, number] = [(JL.x + BUCKET.x) / 2, JL.y - 690];
const STREAM_P2: [number, number] = [BUCKET.x, BUCKET.y];
/** Maya's raised hand at the cut on "and so": where the quill drops. */
export const OURS_HAND = handOf(ML.x, ML.y, ML.s, 'up');
const QS = 0.55;   // the quill's size in the heroes' hands
const OursArt: React.FC = () => {
  const t = useT();
  // "so": the quill lands in her hand, which gives under it and recovers
  const catchM = jolt(t, Q.so, 5, 0.3);
  // "we get to decide": Theo then June look round at the quill in Maya's hand; she dips on "get" and lifts it high on
  // "decide"; they bob after her; the grey hats shrink back half a step
  const lookT = lin(t, Q.weGet, Q.weGet + 0.3), lookJ = lin(t, Q.weGet + 0.12, Q.weGet + 0.42);
  const dip = jolt(t, Q.get, 4, 0.35);
  const lift = -16 * lin(t, Q.decide - 0.05, Q.decide + 0.15, EASE_OUT) * (1 - lin(t, Q.decide + 0.4, Q.decide + 0.7));
  const tBob = jolt(t, Q.decide + 0.1, -10, 0.5), jBob = jolt(t, Q.decide + 0.2, -10, 0.5);
  const cower = lin(t, Q.decide, Q.decide + 0.35);
  const mBob = catchM + dip + lift;
  // A: on "computers" she steps up and touches the padlock with the nib; it springs open on "can" and drops;
  // on "do" her plant app blooms onto the laptop's screen
  const step = lin(t, Q.ourComputers + 0.05, Q.computers2 - 0.05, EASE_IN_OUT);
  const mx = ML.x + step * 46;
  const writing = t > Q.ourComputers + 0.1 && t < Q.can2 + 0.08;
  const appP = Math.min(1.06, pop(t, Q.canDo, 0.45));
  const lockFade = 1 - lin(t, Q.itCosts - 0.3, Q.itCosts - 0.1);
  // B: the quill cuts the string on "it"; the player drops back into its own outline on "costs" and turns again
  const snip = Q.it2 + 0.08;
  const drop = lin(t, snip + 0.04, Q.costs + 0.1, EASE_IN);
  const thud = drop >= 1 ? jolt(t, Q.costs + 0.1, 5, 0.35) : 0;
  const py = DANGLE.y + (CAB_TOP - DANGLE.y) * drop + thud;
  const px = DANGLE.x + (TL.cabinet.x - DANGLE.x) * drop;
  const tagFall = lin(t, snip + 0.05, snip + 0.9, EASE_IN);
  const relief = lin(t, snip, snip + 0.3) ;
  // C: on "happens" her five keepsakes fly back out of his hat along chapter ii's curve, and the lid shuts on "data"
  const flyFrom = Q.happens + 0.02, gap = 0.1, dur = Math.max(0.36, Q.data2 - 0.14 - flyFrom - gap * 4);
  const home = KEEPSAKES.filter((_, i) => t > flyFrom + i * gap + dur).length;
  const lid = 1 - lin(t, Q.data2 - 0.12, Q.data2 + 0.08, EASE_IN_OUT);
  const hug = t > Q.data2 + 0.04;
  // the one quill: drops into Maya's hand on "so" → the padlock → tossed down to Theo → across his string →
  // tossed over the gutter to June → waved toward the hat → kept, in her hand
  const mHand = handOf(mx, ML.y + mBob, ML.s, 'up');
  const tHand = handOf(TL.x, TL.y + tBob, TL.s, 'up');
  const jHand = handOf(JL.x, JL.y + jBob, JL.s, 'up');
  const mn = nibFor(OURS_HAND.x, OURS_HAND.y, QS, 0);
  const mnNow = nibFor(mHand.x, mHand.y, QS, 0);
  const tn = nibFor(tHand.x, tHand.y, QS, -20);
  const jn = nibFor(jHand.x, jHand.y, QS, 0);
  const strTop = BAR.y, strBot = PLAYER_TOP(DANGLE.y);
  const strY = (strTop + strBot) / 2;
  const q = track(checked('ours', [
    // WHY it starts 200 above the hand, inside the close-up: the fall is seen, so she visibly receives it
    { t: TURN.ours, x: mn.x - 6, y: mn.y - 200, r: -14, s: QS },
    { t: Q.so, x: mn.x, y: mn.y, r: 0, s: QS, ease: EASE_IN },
    { t: Q.weGet, x: mn.x, y: mn.y, r: 0, s: QS },
    { t: Q.ourComputers + 0.1, x: mnNow.x, y: mnNow.y, r: 0, s: QS },
    { t: Q.computers2, x: LOCK.x - 6, y: LOCK.y - 4, r: -64, s: QS },
    { t: Q.can2 + 0.08, x: LOCK.x - 6, y: LOCK.y - 6, r: -64, s: QS },
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
  // WHY the quill rides her hand after the catch: it is in her grip, so it lifts and dips with her
  const held = t > Q.so && t < Q.ourComputers + 0.1 ? { ...q, y: q.y + mBob, r: q.r + jolt(t, Q.so, 8, 0.3) } : q;
  const tall = idleOf(t, 1), wide = idleOf(t, 0), short = idleOf(t, 2);
  const wideRig: RigP = { ...WIDE_RIG, lean: WIDE_LEAN + wide.lean * 0.5 - 6 * relief, bob: wide.bob + 4 * cower, sway: wide.sway, fade: GREY, look: 1, mouth: 'flat' };
  return (
    <Sheet>
      {/* A: what our computers can do */}
      <path d={`M 60 ${ML.y} L 720 ${ML.y}`} stroke={P.inkSoft} strokeWidth={2} />
      <path d={`M ${ML.table[0]} ${ML.table[2]} L ${ML.table[1]} ${ML.table[2]} M ${ML.table[0] + 14} ${ML.table[2]} L ${ML.table[0] + 14} ${ML.y} M ${ML.table[1] - 14} ${ML.table[2]} L ${ML.table[1] - 14} ${ML.y}`}
        stroke={P.ink} strokeWidth={3.4} strokeLinecap="round" fill="none" />
      <Laptop x={ML.laptop.x} y={ML.laptop.y} s={ML.laptop.s} a={-10} />
      <OnScreen x={ML.laptop.x} y={ML.laptop.y} s={ML.laptop.s} p={appP} id="c-ours-screen" />
      {lockFade > 0 && <g opacity={lockFade}><Padlock x={LOCK.x} y={LOCK.y} s={1.3} at={-10} openAt={Q.can2 - 0.04} fallAt={Q.can2 + 0.12} /></g>}
      <HatFigure x={ML.hat.x} y={ML.hat.y} s={HATS.tall.s * ML.hat.s} crown={HATS.tall.crown} girth={HATS.tall.girth} a={-10} flip pose="sides" fade={GREY}
        bob={tall.bob + 4 * cower} sway={tall.sway} lean={tall.lean - 4 * cower} eyes="dots" mouth="flat" look={0.6} />
      <HeroString x={mx} y={ML.y} s={ML.s} lean={70} />
      <Hero who="maya" x={mx} y={ML.y} s={ML.s} a={-10} bloom={1} mood="smile" bob={mBob - Math.abs(Math.sin(step * Math.PI)) * 6} pose={writing ? 'write' : 'up'} />

      {/* B: what it costs */}
      <path d={`M 60 ${TL.y} L 720 ${TL.y}`} stroke={P.inkSoft} strokeWidth={2} />
      <Cabinet x={TL.cabinet.x} y={TL.cabinet.y} s={TL.cabinet.s} />
      {drop < 1 && <RecordPlayer x={TL.cabinet.x} y={CAB_TOP} s={TL.cabinet.s} dashed />}
      <HatRig {...wideRig} R={drop < 1 ? { to: reachTo(wideRig, 1, BAR_HAND, 166), bend: 0.3 } : undefined} />
      {drop < 1 && <Crossbar x={BAR.x} y={BAR.y + Math.sin(t * 1.3) * 1.5} w={BAR.w} r={-4 + 10 * relief} c={GREY_INK} />}
      <PString x1={BAR.x - BAR.w / 2 + 6} y1={BAR.y} x2={DANGLE.x} y2={strBot} cut={lin(t, snip, snip + 0.45)} />
      <g transform={`rotate(${drop < 1 ? Math.sin(t * 2.1) * 3 * (1 - drop) : 0} ${px} ${strBot})`}>
        <RecordPlayer x={px} y={py} s={TL.cabinet.s} spin={t > Q.costs + 0.25 ? (t - Q.costs - 0.25) * 260 : 0} />
      </g>
      {t < snip + 0.95 && (
        <g transform={`translate(${tagFall * 70} ${tagFall * 320}) rotate(${tagFall * 80} ${px + 58} ${py})`} opacity={1 - lin(t, snip + 0.6, snip + 0.95)}>
          <PriceTag x={px + 58} y={py - 6} s={0.82} at={-10} swing={-4} prices={[{ v: '14.99/mo', at: -10 }]} />
        </g>
      )}
      <HeroString x={TL.x} y={TL.y} s={TL.s} lean={60} o={0.4} />
      <Hero who="theo" x={TL.x} y={TL.y} s={TL.s} a={-10} bloom={1} bob={tBob} mood={t > Q.costs + 0.15 ? 'smile' : 'flat'} tilt={4 * lookT * (1 - lin(t, Q.decide + 0.3, Q.decide + 0.6))}
        pose={t > Q.costs + 0.5 && t < Q.ourData - 0.1 ? 'bothUp' : 'up'} />

      {/* C: what happens with our data */}
      <path d={`M 800 ${JL.y} L 1470 ${JL.y}`} stroke={P.inkSoft} strokeWidth={2} />
      <HatFigure x={JL.hat.x} y={JL.hat.y} s={JS} crown={HATS.short.crown} girth={HATS.short.girth} a={-10} flip pose="key" noHat fade={GREY}
        bob={short.bob + 4 * cower} sway={short.sway} lean={short.lean - 4 * cower} eyes="dots" mouth="flat" look={0.6} />
      <TopHat x={BUCKET.x} y={BUCKET.y} s={JS} crown={HATS.short.crown} r={BUCKET.r + Math.sin(t * 2) * 2} c={GREY_INK} />
      <Stream from={flyFrom} p0={STREAM_P0} p1={STREAM_P1} p2={STREAM_P2} count={5} gap={gap} dur={dur} s={1.9} reverse />
      <HeroString x={JL.x} y={JL.y} s={JL.s} lean={-60} />
      <Hero who="june" x={JL.x} y={JL.y} s={JL.s} a={-10} bloom={1} bob={jBob} mood={home >= 5 ? 'smile' : 'flat'} pose={hug ? 'hold' : 'up'}
        tilt={-4 * lookJ * (1 - lin(t, Q.decide + 0.3, Q.decide + 0.6))} />
      <KeepsakeBox x={JBOX.x} y={JBOX.y + jBob} s={JBOX.s} lid={lid} inside={home} />

      {/* the one quill */}
      <FlyQuill q={held} idle={false} />
    </Sheet>
  );
};
export const OURS: Spread = { id: 'ours', Art: OursArt };

/** A puppet string from (x1,y1) to (x2,y2). `cut` 0..1: snipped at its middle, the top half whips up and curls
 *  toward the bar, the bottom half falls slack onto its puppet and fades. */
const PString: React.FC<{ x1: number; y1: number; x2: number; y2: number; o?: number; cut?: number; w?: number; at?: number }> = ({ x1, y1, x2, y2, o = 0.8, cut = 0, w = 2.2, at = 0.5 }) => {
  if (cut <= 0) return <path d={`M ${x1} ${y1} L ${x2} ${y2}`} stroke={P.inkSoft} strokeWidth={w} opacity={o} fill="none" strokeLinecap="round" />;
  if (cut >= 1) return null;
  const mx = x1 + (x2 - x1) * at, my = y1 + (y2 - y1) * at;
  const up = EASE_OUT(Math.min(1, cut * 1.6));
  // the top end springs back toward the bar and curls over
  const tx = mx + (x1 - mx) * up * 0.8, ty = my + (y1 - my) * up * 0.8;
  const curl = Math.sin(up * Math.PI) * 26;
  // the bottom end drops and drapes past the puppet
  const fall = EASE_IN(cut);
  const bx = mx + (x2 - mx) * fall * 0.4 + 18 * fall, by = my + (y2 - my) * fall * 0.85 + 40 * fall;
  return (
    <g opacity={o * (1 - Math.max(0, (cut - 0.55) / 0.45))} fill="none" stroke={P.inkSoft} strokeWidth={w} strokeLinecap="round">
      <path d={`M ${x1} ${y1} Q ${(x1 + tx) / 2 + curl} ${(y1 + ty) / 2 - curl * 0.4} ${tx} ${ty}`} />
      <path d={`M ${bx} ${by} Q ${(bx + x2) / 2 - 22 * fall} ${(by + y2) / 2 + 30 * fall} ${x2} ${y2}`} />
    </g>
  );
};

// ======================= viii · the past: line 1's picture, in colour =======================
// WHY line 1's picture again, drawn here from line 1's own layout (PUPPETS) rather than through its component: the
// strings must visibly be CUT (the top end whipping up to its bar, the bottom falling slack), each hero must react
// as theirs goes, and the hats must lurch as they lose their hold, which line 1's picture has no parts for.
const V8 = PUPPETS;
const V8_HAIRS: Hair[] = ['tuft', 'bob', 'cap', 'bald', 'tuft', 'bob', 'cap'];
const v8CrowdBar = (cx: number) => (cx < 300 ? 0 : cx < 760 ? 2 : 1);
/** The order of the cuts: June's own string (she lets the quill go), Maya's, Theo's, then the crowd's clumps. */
const HERO_ORDER: { who: HeroName; j: number }[] = [{ who: 'june', j: 2 }, { who: 'maya', j: 1 }, { who: 'theo', j: 0 }];
const heroCut = (k: number) => Q.free + 0.06 + k * 0.17;
const CLUMP = (i: number) => (i < 3 ? 0 : i < 5 ? 1 : 2);
const clumpCut = (c: number) => heroCut(3) + 0.04 + c * 0.15;
const FADE8: [number, number] = [Q.monopolies2, Q.pastEnd - 0.16];
if (FADE8[1] > TURN.everything - 0.05) throw new Error('take1c: the hats must be gone before the page turns to chapter ix');
const FreeArt: React.FC = () => {
  const t = useT();
  const f = lin(t, FADE8[0], FADE8[1], EASE_IN_OUT);
  // the hats lose their hold: on "free" their bars jerk up as the tension goes, then they turn to stare after the
  // quill; the tall one grabs at it on "ourselves" and closes on air
  const jerk = (j: number) => jolt(t, heroCut(HERO_ORDER.findIndex((h) => h.j === j)), 1, 0.55);
  const hats = V8.hats.map((h, j) => {
    const H = HATS[h.name], id = idleOf(t, j);
    const bob = id.bob - 10 * jerk(j);
    return { h, H, id, bob, bx: h.x, by: h.y - 112 * H.s + bob - 14 * jerk(j) };
  });
  const head = (who: HeroName): [number, number] => { const p = V8.heroes[who]; return [p.x, p.y - 104 * p.s]; };
  const cross = (a: [number, number], b: [number, number]): [number, number] => mixPt(a, b, 0.42);
  const heroStart = (j: number): [number, number] => { const hs = hats[j], [hx] = head(hs.h.hero); return [hs.bx + (hx > hs.bx ? 52 : -52), hs.by]; };
  const crowdStart = (i: number): [number, number] => { const [cx] = V8.crowd[i]; const hs = hats[v8CrowdBar(cx)]; return [hs.bx + (cx > hs.bx ? 1 : -1) * (30 + ((i * 11) % 22)), hs.by]; };
  const crowdHead = (i: number): [number, number] => { const [cx, cy, cs] = V8.crowd[i]; return [cx, cy - 104 * cs]; };
  // the quill: in June's raised hand; up on "time"; on "free" it leaves her hand and cuts the strings in turn
  const jp = V8.heroes.june;
  const jh = handOf(jp.x, jp.y, jp.s, 'up');
  const jn = nibFor(jh.x, jh.y, 0.62, 0);
  const keys: Key[] = [{ t: land(TURN.free) - 1, x: jn.x, y: jn.y, r: 0, s: 0.62 }, { t: Q.time1, x: jn.x, y: jn.y, r: 0, s: 0.62 },
    { t: Q.time1 + 0.2, x: jn.x, y: jn.y - 18, r: -6, s: 0.62, ease: EASE_OUT }];
  HERO_ORDER.forEach(({ who, j }, k) => {
    const c = cross(heroStart(j), head(who));
    keys.push({ t: heroCut(k) - 0.03, x: c[0] + 26, y: c[1] - 10, z: 10, r: -40 + k * 30, s: 0.62 });
    keys.push({ t: heroCut(k), x: c[0] - 18, y: c[1] + 6, z: 10, r: -40 + k * 30, s: 0.62, ease: EASE_IN });
  });
  [0, 1, 2].forEach((c) => {
    const i = [1, 3, 6][c];
    const p = cross(crowdStart(i), crowdHead(i));
    keys.push({ t: clumpCut(c), x: p[0], y: p[1], z: 10, r: 20, s: 0.62 });
  });
  // then it circles back down to Maya, who started it all, and settles by her raised hand
  const mp = V8.heroes.maya;
  const mh = handOf(mp.x, mp.y, mp.s, 'up');
  const mn = nibFor(mh.x, mh.y, 0.62, 0);
  keys.push({ t: Q.monopolies2 + 0.1, x: 980, y: 300, z: 120, r: 30, s: 0.62 });
  keys.push({ t: Q.past, x: mn.x, y: mn.y, z: 0, r: 0, s: 0.62, ease: BACK });
  const q = track(checked('free', keys), t);
  const cutHero = (j: number) => heroCut(HERO_ORDER.findIndex((h) => h.j === j));
  const crowdBloom = lin(t, clumpCut(0), clumpCut(2) + 0.5);
  const tallGrab = lin(t, Q.ourselves - 0.05, Q.ourselves + 0.2) * (1 - lin(t, Q.ourselves + 0.6, Q.ourselves + 0.9));
  return (
    <Sheet>
      {/* the crowd, pencil-weight, gaining colour as each clump is freed */}
      {V8.crowd.map(([cx, cy, cs], i) => {
        const cut = clumpCut(CLUMP(i));
        const cb = lin(t, cut, cut + 0.5);
        const col = mixHex(P.paper, ['#CDBBA7', '#9FAABB', '#BFA6AC', '#A9B39C', '#D6C6A8'][i % 5], cb);
        return (
          <g key={i} opacity={0.34 + 0.45 * cb}>
            <Person x={cx} y={cy + jolt(t, cut, 4, 0.4)} s={cs} a={-10} hair={V8_HAIRS[i % V8_HAIRS.length]} pose={cb > 0.5 && t > Q.monopolies2 ? 'bothUp' : 'down'} mood={cb > 0.5 ? 'smile' : 'flat'} body={col} flip={i % 2 === 1} />
          </g>
        );
      })}
      {/* the tower and the three hats with their bars, fading from the story by "past" */}
      <g opacity={1 - f}>
        <Tower x={V8.tower.x} y={V8.tower.y} w={V8.tower.w} n={V8.tower.n} wobble={jolt(t, Q.free + 0.1, 0.6, 0.6)} />
        {hats.map(({ h, H, id, bob, bx, by }, j) => (
          <g key={h.name}>
            <HatFigure x={h.x} y={h.y} s={H.s} crown={H.crown} girth={H.girth} a={-10} pose="hold" bob={bob} sway={id.sway + 10 * jerk(j)} lean={id.lean - 5 * jerk(j)}
              eyes="dots" mouth="flat" look={Math.max(-1, Math.min(1, (q.x - h.x) / 400))}
              armTo={j === 1 && tallGrab > 0 ? { r: [33 + 70 * tallGrab, -112 - 130 * tallGrab] } : undefined} fist={j === 1 ? lin(t, Q.ourselves + 0.15, Q.ourselves + 0.25) * tallGrab : 0} />
            <Crossbar x={bx} y={by} w={110} r={Math.sin(t * 1.3 + j) * 1.5 + 8 * jerk(j)} />
          </g>
        ))}
      </g>
      {/* every string, each cut as the quill crosses it */}
      {V8.crowd.map((_, i) => {
        const c = clumpCut(CLUMP(i)), s = crowdStart(i), e = crowdHead(i);
        return <PString key={`c${i}`} x1={s[0]} y1={s[1]} x2={e[0]} y2={e[1]} w={1.4} o={0.45} at={0.42} cut={lin(t, c, c + 0.55)} />;
      })}
      {HERO_ORDER.map(({ who, j }) => {
        const s = heroStart(j), e = head(who), c = cutHero(j);
        return <PString key={who} x1={s[0]} y1={s[1]} x2={e[0]} y2={e[1] + jolt(t, c, 6, 0.4)} w={2.4} o={0.8} at={0.42} cut={lin(t, c, c + 0.55)} />;
      })}
      {/* the heroes and their things */}
      {(['theo', 'june', 'maya'] as HeroName[]).map((who) => {
        const j = V8.hats.findIndex((hh) => hh.hero === who);
        const p = V8.heroes[who];
        const c = cutHero(j);
        // WHY a release, not another arms-up: the jolt down as the string goes slack, then the head tips up to the cut end
        const drop = t > c ? jolt(t, c, 6, 0.45) + 3 * lin(t, c, c + 0.1) * (1 - lin(t, c + 0.3, c + 0.6)) : 0;
        const tip = -5 * lin(t, c + 0.05, c + 0.3) * (1 - lin(t, c + 0.9, c + 1.3));
        const mood = t < c ? 'flat' : t < c + 0.45 ? 'o' : 'smile';
        const pose = who === 'june' ? (t < Q.free + 0.02 ? 'up' : 'hold') : who === 'maya' ? (t > Q.monopolies2 + 0.5 ? 'up' : 'write') : 'write';
        return (
          <g key={who}>
            {who === 'maya' && (
              <>
                <path d="M 1232 826 L 1446 826 M 1248 826 L 1248 930 M 1430 826 L 1430 930" stroke={P.ink} strokeWidth={4.5} strokeLinecap="round" fill="none" />
                <Laptop x={1338} y={824} s={1.8} a={-10} />
                {/* her plant app is on her laptop now (chapter vii) */}
                <OnScreen x={1338} y={824} s={1.8} id="c-free-screen" />
              </>
            )}
            {who === 'theo' && (
              <>
                <Cabinet x={1100} y={618} s={1.0} />
                <RecordPlayer x={1100} y={618 - CABINET_TOP * 1.0} s={1.0} spin={t * 200} />
              </>
            )}
            <Hero who={who} x={p.x} y={p.y} s={p.s} a={-10} bloom={1} bob={drop} tilt={tip} mood={mood} pose={pose} />
            {who === 'june' && <KeepsakeBox x={p.x} y={p.y - 38 * p.s + drop} s={0.62} lid={0} inside={0} />}
          </g>
        );
      })}
      <FlyQuill q={q} idle={t > Q.past + 0.3} />
    </Sheet>
  );
};
export const FREE: Spread = { id: 'free', Art: FreeArt };

// ======================= ix · everything =======================
// WHY one clear move (round six plan): Maya's own app, and only it. On "long" the quill takes hold of a copy of it by
// the corner and peels it up; on "long last" the copy splits in two under the quill and the halves arc high over
// everyone's heads to Theo and June; just before "open" each copy is redrawn in its new owner's colours, so the
// headline lands on a finished picture, and on "everything" Theo and June throw up their arms: the one celebration.
// WHY Theo and June stand where their own windows stood in chapter vi: the copies land in the same places.
const IX = {
  maya: { x: 175, y: 800, s: 1.95 }, mayaWin: { x: 482, y: 470, w: 400 }, table: [300, 664, 640] as [number, number, number],
  theo: { x: VI.theo.x, y: VI.theo.y, s: 1.6 }, theoSlot: { ...VI.theoWin },
  june: { x: VI.june.x, y: VI.june.y, s: 1.8 }, juneSlot: { ...VI.juneWin },
};
const IX_WH = windowHeight(IX.mayaWin.w);
const LIFT = Q.long1 + 0.02, PEEL = 0.6, SPLIT = Q.long2, FLY_END = Q.lastEnd - 0.1;
const SKIN = Q.open - 0.12, SKIN_END = Q.open + 0.3;
if (SKIN_END > Q.source + 0.05) throw new Error(`take1c: the copies must be redrawn by "source" (${SKIN_END.toFixed(2)} > ${Q.source.toFixed(2)})`);
/** Where the cover's foil quill lies on the right-hand page once the book is shut (take1c.tsx draws the emblem there):
 *  the quill lands exactly here, at the emblem's size and angle, and the cover closes over it. */
export const EMBLEM = { cx: 760 + (760 + 18) / 2, cy: 300, size: 288 };
const EMB_NIB = { x: EMBLEM.cx - 37.6 * (EMBLEM.size / 288), y: EMBLEM.cy + 113.6 * (EMBLEM.size / 288), r: -11, s: 1.31 * (EMBLEM.size / 288) };
const QUILL_HOME = Q.everything2 + 0.62;   // it leaves its perch on the last syllable of "everything"
const EverythingArt: React.FC = () => {
  const t = useT();
  const peel = lin(t, LIFT, LIFT + PEEL, EASE_OUT);
  const split = lin(t, SPLIT, SPLIT + 0.22, EASE_OUT);
  const fly = lin(t, SPLIT + 0.22, FLY_END, EASE_IN_OUT);
  const settle = (k: number) => jolt(t, FLY_END + k * 0.05, 5, 0.4);
  const cheer = t > Q.everything2 - 0.02;
  // the copy is held by its top-right corner under the nib; it peels up 120 and tips a few degrees
  const corner = (w: number): [number, number] => [w / 2 - 12, -windowHeight(w) / 2 + 6];
  const grabAt: [number, number] = [IX.mayaWin.x + corner(IX.mayaWin.w)[0], IX.mayaWin.y + corner(IX.mayaWin.w)[1]];
  const peeled = (): { x: number; y: number; w: number; r: number } => ({ x: IX.mayaWin.x + 30 * peel, y: IX.mayaWin.y - 120 * peel, w: IX.mayaWin.w, r: -5 * peel });
  const copyAt = (slot: { x: number; y: number; w: number }, side: number) => {
    const p0 = peeled();
    const sx = p0.x + side * split * 34, sy = p0.y - split * 6;
    // WHY high arcs (review: "the copies fly across Theo's head and June's"): both clear every head on the page,
    // June's the higher, so the two never cross
    const x = sx + (slot.x - sx) * fly, y = sy + (slot.y - sy) * fly - Math.sin(fly * Math.PI) * (side > 0 ? 250 : 150);
    const w = p0.w + (slot.w - p0.w) * fly;
    return { x, y, w, r: p0.r * (1 - fly) + Math.sin(fly * Math.PI) * 6 * side };
  };
  const slotsVis = 1 - lin(t, FLY_END - 0.15, FLY_END + 0.05);
  const p0 = peeled();
  const gripNow: [number, number] = [p0.x + corner(p0.w)[0], p0.y + corner(p0.w)[1]];
  const between = { x: (IX.theoSlot.x + IX.juneSlot.x) / 2, y: Math.min(IX.theoSlot.y - windowHeight(IX.theoSlot.w) / 2, IX.juneSlot.y - windowHeight(IX.juneSlot.w) / 2) - 70 };
  const q0 = track(checked('everything', [
    { t: land(TURN.everything) - 0.5, x: IX.maya.x + 70, y: IX.maya.y - 300, z: 60, r: 8, s: 0.8 },
    { t: LIFT - 0.3, x: grabAt[0] - 30, y: grabAt[1] - 40, z: 30, r: -16, s: 0.8 },
    { t: LIFT, x: grabAt[0], y: grabAt[1], r: -16, s: 0.8, ease: EASE_OUT },
    { t: SPLIT - 0.02, x: grabAt[0], y: grabAt[1], r: -16, s: 0.8 },
    // "long last": a quick stroke down the copy's middle, and it comes apart in two
    { t: SPLIT + 0.1, x: p0.x + 4, y: p0.y - IX_WH / 2 + 10, z: 0, r: -24, s: 0.8 },
    { t: SPLIT + 0.22, x: p0.x + 4, y: p0.y + IX_WH / 2 - 30, z: 0, r: -24, s: 0.8 },
    // then it rises and perches above and between the two places, watching the copies land
    { t: FLY_END, x: between.x - 30, y: between.y + 40, z: 40, r: 6, s: 0.8, ease: EASE_IN_OUT },
    { t: QUILL_HOME - 0.32, x: between.x - 30, y: between.y + 40, z: 40, r: 6, s: 0.8 },
    // WHY it ends lying where the cover's emblem will be: the cover closes over it and the emblem IS the quill
    { t: TURN.close + 0.02, x: EMB_NIB.x, y: EMB_NIB.y, z: 0, r: EMB_NIB.r, s: EMB_NIB.s, ease: EASE_IN_OUT },
  ]), t);
  // WHY the peel follows the nib, not a timer: the copy then visibly hangs from the quill's point
  const q = t >= LIFT && t < SPLIT ? { ...q0, x: gripNow[0], y: gripNow[1], z: 0 } : q0;
  const mayaLook = lin(t, LIFT - 0.2, LIFT + 0.2) * (1 - lin(t, FLY_END - 0.2, FLY_END + 0.2));
  const mayaTurn = lin(t, FLY_END - 0.1, FLY_END + 0.4);
  return (
    <Sheet>
      {/* Maya, her app standing on her table as on her laptop in vii: it is her thing, in her world */}
      <Floor x0={70} x1={700} y={IX.maya.y} />
      <Table x0={IX.table[0]} x1={IX.table[1]} y={IX.table[2]} floor={IX.maya.y} />
      <ThemedWindow theme="meadow" x={IX.mayaWin.x} y={IX.mayaWin.y} w={IX.mayaWin.w} />
      <Hero who="maya" x={IX.maya.x} y={IX.maya.y} s={IX.maya.s} a={-10} bloom={1} mood="smile" pose={mayaLook > 0.3 ? 'up' : 'down'} tilt={2 * mayaLook + 4 * mayaTurn} />
      {/* the two empty places, waiting */}
      {slotsVis > 0 && [IX.theoSlot, IX.juneSlot].map((s, i) => (
        <path key={i} d={rr(s.x - s.w / 2, s.y - windowHeight(s.w) / 2, s.w, windowHeight(s.w), 14)} fill="none" stroke={P.inkSoft} strokeWidth={2.6} strokeDasharray="10 10" opacity={0.6 * slotsVis} />
      ))}
      {/* the copy: one while it peels, two after the split; each redrawn in its owner's theme just before "open" */}
      {t >= LIFT && split <= 0 && <ThemedWindow theme="meadow" x={p0.x} y={p0.y} w={p0.w} r={p0.r} shadow={peel} />}
      {split > 0 && ([[IX.juneSlot, 1, 'cotton'], [IX.theoSlot, -1, 'honey']] as const).map(([slot, side, to], i) => {
        const c = copyAt(slot, side);
        return <ThemedWindow key={i} theme="meadow" x={c.x} y={c.y + (fly >= 1 ? settle(i) : 0)} w={c.w} r={c.r} shadow={fly < 1 ? 1 : 0}
          reskin={{ to, p: lin(t, SKIN + i * 0.06, SKIN_END, EASE_IN_OUT) }} />;
      })}
      {/* Theo and June, each standing in front of the place their copy lands (drawn after it, as in chapter vi) */}
      <Hero who="theo" x={IX.theo.x} y={IX.theo.y} s={IX.theo.s} a={-10} bloom={1} mood="smile" pose={cheer ? 'bothUp' : 'down'} bob={jolt(t, Q.everything2, -12, 0.5) + jolt(t, FLY_END, 5, 0.35)} />
      <Hero who="june" x={IX.june.x} y={IX.june.y} s={IX.june.s} a={-10} bloom={1} mood="smile" pose={cheer ? 'bothUp' : 'down'} bob={jolt(t, Q.everything2 + 0.07, -12, 0.5) + jolt(t, FLY_END + 0.05, 5, 0.35)} />
      <FlyQuill q={q} idle={t > FLY_END && t < QUILL_HOME - 0.32} />
    </Sheet>
  );
};
export const EVERYTHING: Spread = { id: 'everything', Art: EverythingArt };
export const EVERYTHING_MARKS = IX;
