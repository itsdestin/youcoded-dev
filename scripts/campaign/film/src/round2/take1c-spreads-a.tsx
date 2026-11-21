// Take 1C, chapters i–iv: the world as it is (plum ink on cream, almost no colour) up to the first drop of purple.
// WHY each picture: it must say what the narrator is saying at that moment to someone seeing it for one second.
//  i   "a small handful of corporations have dictated…"  four men lean out of one theatre box high on the page; a
//                                                            tear-off calendar sheds the years; their marionette strings
//                                                            fall across the gutter to the phones an audience holds up
//  ii  "what your computers could do / cost / your data"   one shopkeeper behind one counter: he chains and padlocks
//                                                            her laptop, ties a price tag to it and stamps it dearer, then
//                                                            holds his hat out while her things fly out of her phone
//  iii "we all just accepted it"                            a queue winding back into the page signs one endless scroll
//      "subscribe to everything and own nothing"            tags drop onto every thing in her room, then everything (her
//                                                            chair last) is yanked off the page
//      "privacy… the cost of convenience"                   he peers in at her window, dangles "free" down to her, and
//                                                            lifts her diary off the shelf while she admires it
//  iv  "however, recently… something truly wonderful"       one purple drop falls into the inkwell; the quill standing in
//                                                            it drinks it, springs up and draws a door that opens with light
// WHY round 6 restaged it (review: side-on figures in a row on one floor line, again and again; drawings that popped
// in instead of inking; a dip pen that was never seen again): every scene now has depth or a change of scale, figures
// arrive by being drawn, and line 4's quill and inkwell are the same ones the corporations unveil in line 5.
import React from 'react';
import { DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT } from '../brand';
import { Appear, Face, Hair, HatFigure, Ink, jolt, KeepsakeIcon, lin, P, Person, pop, Quill, Shape, useT, W } from './take1c-ink';
import { Folio, Heading, Sheet } from './take1c-page';
import { land, Q, TURN } from './take1c-time';
import type { Spread } from './take1c-book';

// ======================= shared helpers =======================
type Pt = [number, number];
type Place = { x: number; y: number; s: number; flip?: boolean; lean?: number };
/** A point in a figure's own units (feet at 0,0) → page units, matching HatFigure's transform. */
const toPage = (lx: number, ly: number, f: Place): Pt => {
  const r = ((f.lean ?? 0) * Math.PI) / 180;
  const rx = lx * Math.cos(r) - ly * Math.sin(r), ry = lx * Math.sin(r) + ly * Math.cos(r);
  return [f.x + (f.flip ? -1 : 1) * f.s * rx, f.y + f.s * ry];
};
/** The inverse: where a page point sits in a figure's own units (so his hand can be put on a thing in the scene). */
const toLocal = (px: number, py: number, f: Place): Pt => {
  const dx = (px - f.x) / ((f.flip ? -1 : 1) * f.s), dy = (py - f.y) / f.s;
  const r = (-(f.lean ?? 0) * Math.PI) / 180;
  return [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)];
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const mix2 = (a: Pt, b: Pt, k: number): Pt => [mix(a[0], b[0], k), mix(a[1], b[1], k)];
const bez2 = (p0: Pt, p1: Pt, p2: Pt, u: number): Pt => {
  const v = 1 - u;
  return [v * v * p0[0] + 2 * v * u * p1[0] + u * u * p2[0], v * v * p0[1] + 2 * v * u * p1[1] + u * u * p2[1]];
};
/** 0→1 over [a, a+up], held, then 1→0 over [b, b+down]: a beat that comes and goes. */
const held = (t: number, a: number, b: number, up = 0.2, down = 0.25) => lin(t, a, a + up, EASE_IN_OUT) * (1 - lin(t, b, b + down, EASE_IN_OUT));
/** A puppeteer's yank, in figure units (+ is down): a short dip (anticipation), a sharp lift that overshoots, a settle.
 *  WHY this shape (review: the yanks were a 1-2 px bob nobody could see): the dip tells the eye a move is coming. */
const yank = (t: number, at: number, amp = 1) => {
  const pre = 0.12, rise = 0.09;
  if (t < at - pre) return 0;
  if (t < at) return amp * 8 * Math.sin((((t - (at - pre)) / pre) * Math.PI) / 2);
  if (t < at + rise) { const u = (t - at) / rise; return amp * (8 - 38 * (1 - (1 - u) * (1 - u))); }
  const x = t - at - rise;
  return amp * -30 * Math.exp(-x * 5) * Math.cos(x * 7);
};
/** A top hat on its own (brim centre at 0,0, crown up), for a hat lifted off a head. Same geometry as HatFigure's. */
const TopHat: React.FC<{ crown: number; mouth?: boolean }> = ({ crown, mouth }) => (
  <g>
    <path d={`M -16 0 L -18.5 ${-crown} Q 0 ${-crown - 4} 18.5 ${-crown} L 16 0 Z`} fill={P.ink} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
    <path d="M -16.4 -9 L -16.9 -19 L 16.9 -19 L 16.4 -9 Z" fill={P.inkSoft} />
    <path d="M -27 1 Q 0 -5 27 1" stroke={P.ink} strokeWidth={6} fill="none" strokeLinecap="round" />
    {/* WHY the open mouth when it is held brim-up: without it the hat reads as a black box, not a hat held out to catch */}
    {mouth && <><ellipse cx={0} cy={0} rx={25} ry={9} fill="#8A7893" stroke={P.ink} strokeWidth={2.6} /><ellipse cx={0} cy={2} rx={17} ry={5} fill={P.inkSoft} /></>}
  </g>
);
/** A phone held up, screen to camera; `rows` (0..4) of its little screen lines still showing; `lit` brightens it. */
const Phone: React.FC<{ x: number; y: number; s?: number; r?: number; rows?: number; lit?: number }> = ({ x, y, s = 1, r = 0, rows = 3, lit = 0 }) => {
  const w = 18, h = 30;
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={4} fill={P.paper} stroke={P.ink} strokeWidth={W.outline / s} />
      <rect x={-w / 2 + 3} y={-h / 2 + 4} width={w - 6} height={h - 8} rx={1.5} fill={lit > 0 ? `rgba(255,252,246,${0.4 + lit * 0.6})` : P.wash} />
      {Array.from({ length: Math.max(0, Math.min(4, Math.round(rows))) }).map((_, i) => (
        <path key={i} d={`M ${-w / 2 + 6} ${-h / 2 + 8 + i * 5} l ${w - 14 - (i % 2) * 4} 0`} stroke={P.inkSoft} strokeWidth={1.6 / s} strokeLinecap="round" />
      ))}
    </g>
  );
};
/** A long coat sleeve and a gloved hand, for a reach no standard arm can make (a hand through a window). */
const Sleeve: React.FC<{ from: Pt; to: Pt; lift?: number; holding?: React.ReactNode }> = ({ from, to, lift = 40, holding }) => {
  const mx = (from[0] + to[0]) / 2, my = Math.min(from[1], to[1]) - lift;
  return (
    <g>
      <path d={`M ${from[0]} ${from[1]} Q ${mx} ${my} ${to[0]} ${to[1]}`} stroke={P.ink} strokeWidth={10} fill="none" strokeLinecap="round" />
      {holding}
      <circle cx={to[0]} cy={to[1]} r={7.5} fill={P.paper} stroke={P.ink} strokeWidth={3} />
    </g>
  );
};

// ======================= i · the handful =======================
// WHY a theatre box (round-6 review BLOCKER: six identical men in an even row on a shelf read as a diagram, and "a
// small handful" drawn as six clones read as "many"): four men, drawn large and overlapping, each in his own pose,
// lean out of one ornate box high on the left page. Their strings fall in a long fan across the gutter to an audience
// standing in three depth rows. Masters above, people below: the gap in scale carries the meaning.
// WHY 1.6 and the box's top at 150 (first look: at 1.3 the men filled only the bottom half of a tall, empty box)
const BOX = { x0: 96, x1: 728, top: 150, rail: 612, base: 742 };
const FEET = 724, MS = 1.6;
type Man = { x: number; c: number; face: Face; sx: number; flip?: boolean; at: number };
const MEN: Man[] = [
  // the opening man is printed before the film starts (frame 0 is a still life); the other three ink themselves in on "handful"
  { x: 318, c: 100, face: 'moustache', sx: 1.1, flip: true, at: -10 },
  { x: 440, c: 86, face: 'monocle', sx: 1.0, at: Q.handful - 0.06 },
  { x: 562, c: 108, face: 'cigar', sx: 1.18, at: Q.handful + 0.04 },
  { x: 672, c: 92, face: 'grin', sx: 0.96, flip: true, at: Q.handful + 0.14 },
];
/** Each man's lean: his own idle sway, man 1 on his elbows over the rail, and the two on the right sharing a smirk
 *  after "technology" (kept from round 5: the one beat of scheming the reviewers liked). */
const leanOf = (t: number, j: number) => {
  const idle = Math.sin(t * 1.4 + j * 2.1) * 1.2;
  const share = lin(t, Q.technology1 + 0.42, Q.technology1 + 0.72, EASE_OUT);
  if (j === 0) return 2 + idle + 5 * held(t, Q.decade - 0.05, Q.decade + 0.45, 0.2, 0.3);      // glances back at the calendar
  if (j === 1) return 13 + idle * 0.6;
  if (j === 2) return -1 + idle + 7 * share;
  return 1 + idle + 9 * share;
};
/** The marionette control: where man j's cross hand is (figure units, + is down) and the cross's tilt in degrees. */
const crossOf = (t: number, j: number): { dy: number; rot: number } => {
  let dy = Math.sin(t * 2.1 + j * 1.7) * 3, rot = Math.sin(t * 1.3 + j) * 3;
  // "dictated": the strings snap taut and each man yanks once, a couple of frames apart
  dy += yank(t, Q.dictated + 0.34 + [0.1, 0, 0.06, 0.14][j], 1.1);
  // "interact": they conduct their people in turn, the crosses rocking against each other
  const u = (t - (Q.interact - 0.06 + j * 0.07)) / 0.8;
  if (u > 0 && u < 1) {
    const w = Math.sin(u * Math.PI * 2) * Math.sin(u * Math.PI);
    rot += (j % 2 ? 1 : -1) * 22 * w;
    dy += -12 * Math.abs(w);
  }
  // "technology": all four at once
  dy += yank(t, Q.technology1 + 0.04 + j * 0.04, 1.25);
  return { dy, rot };
};
/** The page point of man j's cross hand. */
const CROSS_HAND: Pt[] = [[-40, -258], [0, 0], [42, -262], [-42, -256]];
const placeOf = (t: number, j: number): Place => ({ x: MEN[j].x, y: FEET, s: MS, flip: MEN[j].flip, lean: leanOf(t, j) });
/** Where the cross hangs: below the hand that holds it (figure units). Man 1 dangles his over the rail. */
const crossHand = (t: number, j: number, pl: Place): Pt => {
  const { dy } = crossOf(t, j);
  if (j === 1) { const [lx, ly] = toLocal(MEN[1].x + 96, BOX.rail - 8, pl); return [lx, ly + dy]; }
  return [CROSS_HAND[j][0], CROSS_HAND[j][1] + dy];
};
// the cross's four string points (its own units): the long bar's two ends, then the short bar's
const CROSS_PTS: Pt[] = [[-34, 4], [34, 4], [0, -10], [0, 20]];
const crossPoint = (t: number, j: number, k: number): Pt => {
  const pl = placeOf(t, j);
  const [hx, hy] = toPage(...crossHand(t, j, pl), pl);
  const { rot } = crossOf(t, j);
  const r = (rot * Math.PI) / 180, [cx, cy] = CROSS_PTS[k];
  return [hx + MS * (cx * Math.cos(r) - (cy + 22) * Math.sin(r)), hy + MS * (cx * Math.sin(r) + (cy + 22) * Math.cos(r))];
};
/** A marionette control drawn in the book's line: a long bar, a short cross-bar and a hook in the hand. */
const Cross: React.FC<{ x: number; y: number; rot: number }> = ({ x, y, rot }) => (
  <g transform={`translate(${x} ${y}) scale(${MS}) rotate(${rot})`}>
    <path d="M 0 0 L 0 18" stroke={P.ink} strokeWidth={3.4} strokeLinecap="round" />
    <rect x={-40} y={21} width={80} height={10} rx={5} fill={P.paperShade} stroke={P.ink} strokeWidth={W.outline / MS} />
    <rect x={-5} y={8} width={10} height={38} rx={5} fill={P.paperShade} stroke={P.ink} strokeWidth={W.outline / MS} />
  </g>
);
/** "more than a decade": six big leaves tear off a calendar and flutter away, 2014 to 2026.
 *  WHY six, not thirteen (review: thirteen flips in a second read as a digital odometer): each leaf is now a gesture. */
const YEARS = [2014, 2016, 2018, 2020, 2023, 2026];
const TEARS = YEARS.slice(1).map((_, i) => mix(Q.for + 0.07, Q.decade + 0.2, i / (YEARS.length - 2)));
const CW = 96, CH = 104;
const Leaf: React.FC<{ year: number }> = ({ year }) => (
  <g>
    <path d={`M ${-CW / 2} 0 ${Array.from({ length: 9 }, (_, i) => `L ${-CW / 2 + (CW * (i + 0.5)) / 9} ${i % 2 ? 0 : 4} `).join('')} L ${CW / 2} 0 L ${CW / 2} ${CH} L ${-CW / 2} ${CH} Z`}
      fill={P.paper} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
    <text x={0} y={CH * 0.67} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={32} letterSpacing="-0.04em" fill={P.ink}>{year}</text>
  </g>
);
const Calendar: React.FC<{ x: number; y: number }> = ({ x, y }) => {
  const t = useT();
  const n = TEARS.filter((f) => t >= f).length;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx={0} cy={-34} r={3.5} fill={P.ink} />
      <path d="M 0 -34 L -28 2 M 0 -34 L 28 2" stroke={P.ink} strokeWidth={W.detail} fill="none" />
      {/* the leaves still on the pad, a few edges showing under the top one */}
      <path d={`M ${-CW / 2 + 3} ${CH + 3} L ${CW / 2 + 3} ${CH + 3} L ${CW / 2 + 3} 6`} stroke={P.inkSoft} strokeWidth={W.detail} fill="none" opacity={n < YEARS.length - 1 ? 0.7 : 0} />
      <Leaf year={YEARS[n]} />
      {/* the leaf about to go curls at its corner, then tears and flutters down, turning as it falls */}
      {TEARS.map((at, i) => {
        const u = t - at;
        if (u < -0.1 || u > 0.9) return null;
        if (u < 0) {
          const c = lin(t, at - 0.1, at, EASE_IN);
          return <path key={i} d={`M ${CW / 2} ${CH - 30 * c} L ${CW / 2 - 30 * c} ${CH} L ${CW / 2 - 20 * c} ${CH - 20 * c} Z`} fill={P.paperShade} stroke={P.ink} strokeWidth={W.detail} />;
        }
        const fx = u * 70 + Math.sin(u * 9 + i) * 22, fy = u * u * 820 + u * 50, rot = u * 150 + Math.sin(u * 7) * 25;
        return <g key={i} transform={`translate(${-CW / 2 + fx} ${fy}) rotate(${rot}) translate(${CW / 2} 0) scale(1 ${Math.cos(u * 6) * 0.25 + 0.75})`} opacity={1 - lin(t, at + 0.55, at + 0.85)}><Leaf year={YEARS[i]} /></g>;
      })}
      <rect x={-CW / 2 - 3} y={-8} width={CW + 6} height={14} rx={2} fill={P.ink} />
      {[-26, 26].map((cx) => <circle key={cx} cx={cx} cy={-1} r={2.6} fill={P.paper} />)}
    </g>
  );
};
/** The opening man's pocket watch, open (lid up) or snapped shut. */
const Watch: React.FC<{ x: number; y: number; open: number }> = ({ x, y, open }) => (
  <g transform={`translate(${x} ${y}) scale(2.2)`}>
    {open > 0 && <ellipse cx={0} cy={-11 * open} rx={9} ry={9 * open} fill={P.paperShade} stroke={P.ink} strokeWidth={2.2} />}
    <circle cx={0} cy={0} r={9} fill={P.paper} stroke={P.ink} strokeWidth={2.4} />
    {open > 0.5 && <path d="M 0 0 L 0 -6 M 0 0 L 4 2" stroke={P.ink} strokeWidth={1.6} strokeLinecap="round" />}
    <circle cx={0} cy={-10.5} r={2} fill={P.ink} />
  </g>
);

type Fan = { x: number; y: number; s: number; m: number; k: number; flip?: boolean; hair: Hair };
// WHY three rows (far small, near large) on the right page and two near ones under the box: depth, and the near row is
// ~120 px tall in the wide so the marionette idea reads on a phone (review: 25 px people with hairline strings)
const CROWD: Fan[] = [
  { x: 905, y: 646, s: 0.8, m: 1, k: 1, hair: 'bun' }, { x: 1040, y: 640, s: 0.8, m: 2, k: 0, hair: 'cap', flip: true },
  { x: 1180, y: 644, s: 0.8, m: 2, k: 2, hair: 'tuft' }, { x: 1322, y: 648, s: 0.8, m: 3, k: 0, hair: 'long', flip: true },
  { x: 968, y: 782, s: 1.06, m: 1, k: 2, hair: 'curly', flip: true }, { x: 1158, y: 786, s: 1.06, m: 2, k: 1, hair: 'bob' },
  { x: 1352, y: 780, s: 1.06, m: 3, k: 1, hair: 'tuft', flip: true },
  { x: 248, y: 940, s: 1.38, m: 0, k: 0, hair: 'long' }, { x: 520, y: 944, s: 1.38, m: 0, k: 1, hair: 'cap', flip: true },
  { x: 1020, y: 940, s: 1.38, m: 1, k: 0, hair: 'bob' }, { x: 1262, y: 944, s: 1.38, m: 3, k: 2, hair: 'bun', flip: true },
];
const STRINGS_AT = Q.dictated - 0.04;

const HandfulArt: React.FC = () => {
  const t = useT();
  // WHY the title and page numbers arrive once, on the first wide (review BLOCKER: they blinked on and off three times)
  const furniture = lin(t, Q.corporations1 + 0.12, Q.corporations1 + 0.5);
  const { x0, x1, top, rail, base } = BOX;
  const mid = (x0 + x1) / 2;
  // the opening man: watch up and open through "more than a", snapped shut on "decade", a stroke of the moustache, then a
  // hand on the rail as his partners arrive
  const snap = Q.decade + 0.32;
  const watchK = lin(t, snap + 0.04, snap + 0.22, EASE_IN_OUT);
  const stroke = held(t, snap + 0.2, Q.handful - 0.02, 0.15, 0.2);
  return (
    <>
      <div style={{ opacity: furniture }}><Heading n="i" title="a small handful" /><Folio left={2} /></div>
      <Sheet>
        {/* ---- the box: its back wall, curtains and swagged valance, printed with the page ---- */}
        <rect x={x0} y={top} width={x1 - x0} height={rail - top} fill={P.paperShade} opacity={0.6} />
        {[0, 1].map((side) => {
          const sx = side ? x1 : x0, d = side ? -1 : 1;
          return (
            <g key={side}>
              <path d={`M ${sx} ${top} L ${sx + d * 44} ${top} Q ${sx + d * 22} ${rail - 170} ${sx + d * 40} ${rail} L ${sx} ${rail} Z`} fill={P.wash} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
              <path d={`M ${sx + d * 22} ${top + 40} Q ${sx + d * 14} ${rail - 200} ${sx + d * 24} ${rail - 10} M ${sx + d * 40} ${top + 50} Q ${sx + d * 26} ${rail - 160} ${sx + d * 40} ${rail - 10}`} stroke={P.inkSoft} strokeWidth={W.detail} fill="none" opacity={0.7} />
              {/* the tie-back */}
              <path d={`M ${sx} ${rail - 130} q ${d * 34} 8 ${d * 46} -4`} stroke={P.ink} strokeWidth={4} fill="none" strokeLinecap="round" />
            </g>
          );
        })}
        <path d={`M ${x0 - 10} ${top - 12} L ${x1 + 10} ${top - 12} L ${x1 + 10} ${top + 26} ${[0, 1, 2, 3].map((i) => {
          const a = x1 + 10 - ((x1 - x0 + 20) * i) / 4, b = x1 + 10 - ((x1 - x0 + 20) * (i + 1)) / 4;
          return `Q ${(a + b) / 2} ${top + 74} ${b} ${top + 26}`;
        }).join(' ')} Z`} fill={P.wash} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
        {[0, 1, 2, 3, 4].map((i) => {
          const tx = x0 - 10 + ((x1 - x0 + 20) * i) / 4;
          return <path key={i} d={`M ${tx} ${top + 26} L ${tx} ${top + 52} M ${tx - 5} ${top + 52} L ${tx + 5} ${top + 52} L ${tx + 3} ${top + 66} L ${tx - 3} ${top + 66} Z`} stroke={P.ink} strokeWidth={W.detail} fill={P.ink} />;
        })}
        <Calendar x={178} y={236} />
        {/* ---- the four men ---- */}
        {MEN.map((m, j) => {
          const pl = placeOf(t, j);
          const ch = crossHand(t, j, pl);
          let other: Pt;
          if (j === 0) {
            // watch up in front of his face → pocket → moustache → rail
            const watchUp: Pt = [46, -206], pocket: Pt = [-14, -118], tache: Pt = [16 + Math.sin(t * 22) * 4 * stroke, -190];
            const railP = toLocal(m.x - 60, rail - 6, pl);
            other = t < snap + 0.04 ? watchUp : t < snap + 0.22 ? mix2(watchUp, pocket, watchK) : stroke > 0.01 ? mix2(pocket, tache, stroke) : mix2(pocket, railP, lin(t, Q.handful - 0.02, Q.handful + 0.2, EASE_IN_OUT));
          } else if (j === 1) other = toLocal(m.x + 20, rail - 6, pl);
          else if (j === 2) other = [-44, -108];
          else other = toLocal(m.x - 52, rail - 6 - Math.abs(Math.sin(t * 9)) * 6, pl);   // drumming his fingers
          const hands: Pt[] = j === 0 || j === 3 ? [ch, other] : [other, ch];
          const [hx, hy] = toPage(ch[0], ch[1], pl);
          const { rot } = crossOf(t, j);
          const crossO = m.at < 0 ? 1 : lin(t, m.at + 0.3, m.at + 0.42);
          const w0: Pt = toPage(other[0], other[1], pl);
          return (
            <g key={j}>
              <HatFigure x={pl.x} y={pl.y} s={MS} crown={m.c} hatSx={m.sx} face={m.face} a={m.at} b={m.at + 0.42} pose="hold" flip={m.flip} lean={pl.lean} hands={hands} />
              {crossO > 0 && <g opacity={crossO}><Cross x={hx} y={hy} rot={rot} /></g>}
              {/* WHY limp strings hanging from the cross until the real ones ink down to the phones (first look: a bare cross
                  read as a stick or a sign, not a marionette control) */}
              {crossO > 0 && t < STRINGS_AT + 0.3 && <g opacity={crossO * (1 - lin(t, STRINGS_AT, STRINGS_AT + 0.3))}>
                {[0, 1, 2, 3].map((k) => { const [px, py] = crossPoint(t, j, k); const sw = Math.sin(t * 3 + k + j) * 5;
                  return <path key={k} d={`M ${px} ${py} q ${sw} ${26} ${sw * 0.4} ${52 + k * 6}`} stroke={P.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />; })}
              </g>}
              {j === 0 && t < snap + 0.2 && <Watch x={w0[0]} y={w0[1] - 4} open={1 - lin(t, snap - 0.04, snap + 0.02)} />}
            </g>
          );
        })}
        {/* ---- the front of the box: a velvet rail over a carved, bowed panel ---- */}
        <path d={`M ${x0 - 16} ${rail} L ${x1 + 16} ${rail} L ${x1} ${base - 14} Q ${mid} ${base + 44} ${x0} ${base - 14} Z`} fill={P.paper} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
        <path d={`M ${x0 + 4} ${rail + 26} L ${x1 - 4} ${rail + 26} L ${x1 - 10} ${base - 22} Q ${mid} ${base + 26} ${x0 + 10} ${base - 22} Z`} fill="url(#c-hatch)" stroke={P.ink} strokeWidth={W.detail} />
        {[-2, -1, 0, 1, 2].map((i) => (
          <g key={i}>
            <circle cx={mid + i * 112} cy={rail + 62 + (Math.abs(i) === 2 ? -6 : 0)} r={20} fill={P.paper} stroke={P.ink} strokeWidth={W.outline} />
            <circle cx={mid + i * 112} cy={rail + 62 + (Math.abs(i) === 2 ? -6 : 0)} r={9} fill={P.wash} stroke={P.ink} strokeWidth={W.detail} />
          </g>
        ))}
        <rect x={x0 - 24} y={rail - 14} width={x1 - x0 + 48} height={20} rx={10} fill={P.inkSoft} stroke={P.ink} strokeWidth={W.outline} />
        {/* ---- the audience's floor: curved rows of stalls, receding ---- */}
        {[652, 790, 948].map((fy, i) => (
          <path key={fy} d={`M ${790} ${fy + 6} Q ${1125} ${fy + 22 + i * 6} ${1460} ${fy + 6}`} stroke={P.inkSoft} strokeWidth={W.detail} fill="none" opacity={0.35} />
        ))}
        {/* ---- the strings, then the people holding up the phones they are tied to ---- */}
        {CROWD.map((f, i) => {
          const [ax, ay] = crossPoint(t, f.m, f.k);
          const rest = crossPoint(0, f.m, f.k)[1];
          // WHY lift from the string's own rise: a slack string does nothing, a yank pulls the phone and the person with it
          const live = t >= STRINGS_AT + 0.3 ? Math.max(0, rest - ay - 6) : 0;
          const lift = live * 1.4 * f.s;
          const side = f.flip ? -1 : 1;
          const tilt = side * Math.min(10, lift * 0.25);
          const tr = (tilt * Math.PI) / 180;
          const lx = side * 24 * f.s, ly = -96 * f.s;
          const ph: Pt = [f.x + lx * Math.cos(tr) - ly * Math.sin(tr), f.y - lift + lx * Math.sin(tr) + ly * Math.cos(tr) - 4 * f.s];
          const sa = STRINGS_AT + Math.abs(f.m - 1.5) * 0.03 + f.k * 0.02;
          return (
            <g key={i}>
              <Ink d={`M ${ax} ${ay} L ${ph[0]} ${ph[1] - 15 * f.s}`} a={sa} b={sa + 0.3} w={3.6} />
              <Person x={f.x} y={f.y} s={f.s} a={-10} b={-9} pose="up" flip={f.flip} hair={f.hair} body={P.wash}
                mood={lift > 6 ? 'o' : 'flat'} bob={-lift} tilt={tilt} />
              <Phone x={ph[0]} y={ph[1]} s={f.s} r={tilt} />
            </g>
          );
        })}
      </Sheet>
    </>
  );
};
export const HANDFUL: Spread = { id: 'handful', Art: HandfulArt };

// ======================= ii · the rules =======================
// WHY one counter (round-6 review: three spot-the-difference vignettes, each person-left / object / hat-man-right on
// one floor line): one shopkeeper stands behind one counter with her laptop on it, and does all three things to it.
// The camera changes scale and angle for each beat instead of cutting between three identical compositions.
const F2 = 900;
const DESK = { x0: 660, x1: 1250, top: 724 };
const LAP = { x: 846, y: DESK.top, s: 2.3 };
const HER = { x: 548, s: 2.0 };
// the lid's corners and screen centre, in page units
const LID = { l: LAP.x - 34 * LAP.s, r: LAP.x + 34 * LAP.s, t: LAP.y - 46 * LAP.s, b: LAP.y - 2 * LAP.s };
const SCREEN: Pt = [LAP.x, LAP.y - 24 * LAP.s];

/** Her laptop, drawn big (review: "your computer" was an outline the size of her head). `lock` greys the screen. */
const BigLaptop: React.FC<{ lock: number; tip: number }> = ({ lock, tip }) => (
  <g transform={`rotate(${tip} ${LAP.x - 44 * LAP.s} ${LAP.y + 6 * LAP.s}) translate(${LAP.x} ${LAP.y}) scale(${LAP.s})`}>
    <ellipse cx={0} cy={7} rx={48} ry={3} fill={P.ink} opacity={0.12} />
    <path d="M -34 -46 h 68 v 44 h -68 Z" fill={P.paper} stroke={P.ink} strokeWidth={W.outline / LAP.s} strokeLinejoin="round" />
    {/* what was on her screen: a little picture she was drawing, and a few lines of her own writing */}
    <rect x={-30} y={-42} width={60} height={36} rx={1.5} fill="rgba(255,252,246,1)" />
    <path d="M -26 -14 Q -16 -26 -8 -18 Q 0 -30 10 -16" stroke={P.inkSoft} strokeWidth={1.6} fill="none" strokeLinecap="round" />
    <circle cx={-14} cy={-32} r={4} fill="none" stroke={P.inkSoft} strokeWidth={1.4} />
    {[-34, -28, -22].map((y, i) => <path key={y} d={`M 8 ${y} l ${[16, 12, 14][i]} 0`} stroke={P.inkSoft} strokeWidth={1.4} strokeLinecap="round" />)}
    <rect x={-30} y={-42} width={60} height={36} rx={1.5} fill={P.wash} opacity={lock * 0.85} />
    <path d="M -44 -2 h 88 l -6 8 h -76 Z" fill={P.wash} stroke={P.ink} strokeWidth={W.outline / LAP.s} strokeLinejoin="round" />
  </g>
);
/** A heavy chain from a to b, link by link; `p` 0..1 is how much of it has been laid. */
const Chain: React.FC<{ a: Pt; b: Pt; p: number }> = ({ a, b, p }) => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.floor(len / 13);
  const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  const shown = Math.floor(n * p);
  return (
    <g>
      {Array.from({ length: shown }).map((_, i) => {
        const [x, y] = mix2(a, b, (i + 0.5) / n);
        return i % 2 === 0
          ? <ellipse key={i} cx={x} cy={y} rx={9} ry={5.5} transform={`rotate(${ang} ${x} ${y})`} fill="none" stroke={P.ink} strokeWidth={3.6} />
          : <path key={i} d={`M ${x - 7.5 * Math.cos((ang * Math.PI) / 180)} ${y - 7.5 * Math.sin((ang * Math.PI) / 180)} L ${x + 7.5 * Math.cos((ang * Math.PI) / 180)} ${y + 7.5 * Math.sin((ang * Math.PI) / 180)}`} stroke={P.ink} strokeWidth={4.6} strokeLinecap="round" />;
      })}
    </g>
  );
};
/** A padlock drawn in the book's line. `shut` 0 open … 1 locked; `sq` squashes it for the snap. */
const LockInk: React.FC<{ x: number; y: number; s?: number; shut: number; sq?: number; r?: number }> = ({ x, y, s = 1, shut, sq = 0, r = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s * (1 + sq * 0.18)} ${s * (1 - sq * 0.2)})`}>
    <path d={`M -10 -10 L -10 ${-24 - (1 - shut) * 12} a 10 10 0 0 1 20 0 L 10 ${-10 - (1 - shut) * 12}`} fill="none" stroke={P.ink} strokeWidth={4.4 / s} strokeLinecap="round" />
    <rect x={-16} y={-14} width={32} height={27} rx={4} fill={P.wash} stroke={P.ink} strokeWidth={W.outline / s} />
    <circle cx={0} cy={-3} r={3.2} fill={P.ink} /><path d="M 0 -1 L 0 6" stroke={P.ink} strokeWidth={2.6 / s} strokeLinecap="round" />
  </g>
);
/** A big key on a ring, so "the key goes in his pocket" can be seen (review: a 15 px stick was invisible). */
const KeyBig: React.FC<{ x: number; y: number; r: number }> = ({ x, y, r }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(2.2)`}>
    <circle cx={0} cy={-14} r={7} fill="none" stroke={P.ink} strokeWidth={1.8} />
    <circle cx={0} cy={0} r={6} fill={P.paperShade} stroke={P.ink} strokeWidth={2.2} />
    <circle cx={0} cy={0} r={2} fill={P.ink} />
    <path d="M 0 6 L 0 24 M 0 18 L 5 18 M 0 23 L 4 23" stroke={P.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />
  </g>
);
/** A rubber stamp drawn big: a turned wooden handle, a block and a rubber face pointing down (face at 0,0). */
const StampBig: React.FC<{ x: number; y: number; sq?: number }> = ({ x, y, sq = 0 }) => (
  <g transform={`translate(${x} ${y}) scale(${1.7 * (1 + sq * 0.1)} ${1.7 * (1 - sq * 0.12)})`}>
    <circle cx={0} cy={-48} r={9} fill={P.paperShade} stroke={P.ink} strokeWidth={2.2} />
    <path d="M -4 -40 Q -7 -30 -4 -20 L 4 -20 Q 7 -30 4 -40 Z" fill={P.paperShade} stroke={P.ink} strokeWidth={2.2} strokeLinejoin="round" />
    <rect x={-22} y={-20} width={44} height={14} rx={2} fill={P.wash} stroke={P.ink} strokeWidth={2.2} />
    <rect x={-23} y={-6} width={46} height={6} rx={1} fill={P.ink} />
  </g>
);
/** The price tag tied to her laptop: one price at a time, each stamped on, the tag a little bigger every time. */
const PriceTag: React.FC<{ x: number; y: number; s: number; v: string; hit: number; swing: number; rot: number }> = ({ x, y, s, v, hit, swing, rot }) => (
  <g transform={`translate(${x} ${y}) rotate(${swing}) scale(${s})`}>
    <g transform={`scale(${1 + hit * 0.06} ${1 - hit * 0.1})`}>
      <path d="M -112 14 L -96 0 L 96 0 L 112 14 L 112 112 L -112 112 Z" fill={P.paper} stroke={P.ink} strokeWidth={W.outline / s} strokeLinejoin="round" />
      <circle cx={0} cy={16} r={6} fill="none" stroke={P.ink} strokeWidth={W.detail / s} />
      {v && (
        // WHY "/mo" at 60 % of the number (review: at 26 px against 56 it was unreadable, yet it is the joke: a bill that never ends)
        <text x={0} y={90} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={54} fill={P.ink} letterSpacing="-0.045em" transform={`rotate(${rot} 0 70)`}>
          ${v}<tspan fontSize={33} fontWeight={800} dx={3}>/mo</tspan>
        </text>
      )}
    </g>
  </g>
);
/** Things from her life, drawn in the book's filled style at a size that reads (review: thin 40 px UI icons). */
const Letter: React.FC<{ x: number; y: number; s: number; r: number }> = ({ x, y, s, r }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    <rect x={-20} y={-13} width={40} height={27} rx={2} fill={P.paper} stroke={P.ink} strokeWidth={2.6 / s} strokeLinejoin="round" />
    <path d="M -20 -13 L 0 3 L 20 -13" fill="none" stroke={P.ink} strokeWidth={2.6 / s} strokeLinejoin="round" />
    <path d="M 0 9 C -6 4 -4 -1 0 2 C 4 -1 6 4 0 9 Z" fill={P.inkSoft} />
  </g>
);
const House: React.FC<{ x: number; y: number; s: number; r: number }> = ({ x, y, s, r }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    <path d="M -16 -2 L 0 -18 L 16 -2 L 16 16 L -16 16 Z" fill={P.paper} stroke={P.ink} strokeWidth={2.6 / s} strokeLinejoin="round" />
    <path d="M -4 16 L -4 6 L 4 6 L 4 16 M 8 -2 L 8 4 L 12 4 L 12 -2" fill={P.wash} stroke={P.ink} strokeWidth={2 / s} strokeLinejoin="round" />
    <path d="M 7 -11 L 7 -18 L 11 -18 L 11 -7" fill={P.paper} stroke={P.ink} strokeWidth={2 / s} strokeLinejoin="round" />
  </g>
);

// ---- the beats of chapter ii, from the words ----
const LOCK = { chain: Q.computersDo + 0.06, snap: Q.do - 0.02 };
const PRICES = [{ v: '4.99', at: Q.cost + 0.1 }, { v: '9.99', at: Q.costWord + 0.02 }, { v: '14.99', at: Q.costWord + 0.32 }, { v: '19.99', at: Q.costWord + 0.6 }];
const TAG_S = [0.5, 0.62, 0.76, 0.92];
const HAT = { off: Q.data, items: [Q.data + 0.32, Q.data + 0.52, Q.data + 0.72, Q.data + 0.92], fly: 0.4 };
const HAT_BACK = HAT.items[3] + HAT.fly + 0.04;

const RulesArt: React.FC = () => {
  const t = useT();
  // the setting (counter, laptop, her) is printed when the page lands; he inks himself in on "decided"
  const manA = Q.decided - 0.12;
  // ---- A: chain, padlock and key ----
  const lean0 = 6 + 12 * lin(t, LOCK.chain - 0.2, LOCK.chain + 0.1, EASE_OUT) - 10 * lin(t, Q.do + 0.3, Q.do + 0.6, EASE_IN_OUT);
  const chainA = lin(t, LOCK.chain, LOCK.chain + 0.3, EASE_IN_OUT), chainB = lin(t, LOCK.chain + 0.28, LOCK.snap - 0.08, EASE_IN_OUT);
  const shut = lin(t, LOCK.snap, LOCK.snap + 0.05);
  const sq = t >= LOCK.snap && t < LOCK.snap + 0.1 ? 1 : 0;
  const shake = jolt(t, LOCK.snap, 5, 0.4);
  const keyTurn = lin(t, Q.do + 0.08, Q.do + 0.18, EASE_IN_OUT);
  const keyUp = lin(t, Q.do + 0.2, Q.do + 0.36, EASE_OUT);
  const keyAway = lin(t, Q.do + 0.42, Q.do + 0.54, EASE_IN);
  // ---- B: the price ----
  const cur = PRICES.filter((q) => t >= q.at).length - 1;
  const tagIn = pop(t, Q.cost - 0.12, 0.45);
  const tagS = cur < 0 ? TAG_S[0] : mix(TAG_S[Math.max(0, cur - 1)], TAG_S[cur], Math.min(1, pop(t, PRICES[cur].at, 0.3)));
  const hit = PRICES.reduce((s, q) => s + (t >= q.at && t < q.at + 0.07 ? 1 : 0), 0);
  const swing = PRICES.reduce((s, q, i) => s + jolt(t, q.at, 6 + i * 2, 0.6), 0) + (1 - Math.min(1, tagIn)) * 25;
  // the stamp: wind up for four frames, slam, hold two, lift
  const stampDy = PRICES.reduce((y, q) => {
    const d = t - q.at;
    if (d < -0.22 || d > 0.34) return y;
    if (d < -0.07) return -60 - 40 * lin(t, q.at - 0.22, q.at - 0.07, EASE_OUT);
    if (d < 0) return mix(-100, 0, EASE_IN((d + 0.07) / 0.07));
    if (d < 0.07) return 0;
    return mix(0, -60, EASE_OUT((d - 0.07) / 0.27));
  }, -60);
  const rage = Math.max(0, cur);
  // ---- C: the hat ----
  const off = lin(t, HAT.off, HAT.off + 0.36, EASE_IN_OUT);
  const back = lin(t, HAT_BACK, HAT_BACK + 0.18, EASE_IN);
  const gulp = HAT.items.reduce((s, a) => s + Math.max(0, jolt(t, a + HAT.fly - 0.02, 8, 0.3)), 0);
  const leanC = 4 * off * (1 - back);
  const lean = (t < Q.cost - 0.1 ? lean0 : t < Q.data - 0.1 ? 14 + rage * 3 + jolt(t, PRICES[Math.max(0, cur)].at, 3, 0.3) : leanC + jolt(t, HAT_BACK + 0.2, 3, 0.4)) + jolt(t, Q.decided, 3, 0.4);
  const SHOP: Place = { x: 1080, y: F2, s: 1.6, flip: true, lean };
  const CROWN = 104;
  const head = toPage(0, -212, SHOP);
  const held2: Pt = toPage(40, -206, SHOP);           // brim-up in front of his chest, over the counter
  const twirl = toPage(14, -300, SHOP);
  const hatPos: Pt = back > 0 ? mix2(held2, head, back) : off < 0.45 ? mix2(head, twirl, off / 0.45) : mix2(twirl, held2, (off - 0.45) / 0.55);
  // WHY it ends tipped 35 degrees toward her (first look: held upright it read as a black can on the counter): the open
  // mouth then faces the things flying in
  const hatRot = back > 0 ? 215 + 145 * back : 575 * EASE_IN_OUT(Math.max(0, (off - 0.15) / 0.85));
  const hatOff = off > 0.02 && back < 1;
  const plop = t >= HAT_BACK + 0.18 && t < HAT_BACK + 0.26 ? 1 : 0;
  const pat = held(t, HAT_BACK + 0.24, HAT_BACK + 0.5, 0.08, 0.12);
  // his two hands, beat by beat (his own units; he is flipped, so +x points at her)
  const restL: Pt = toLocal(LAP.x + 150, DESK.top - 4, SHOP), restR: Pt = toLocal(LAP.x + 110, DESK.top - 6, SHOP);
  let hL: Pt = restL, hR: Pt = restR;
  if (t >= LOCK.chain - 0.1 && t < LOCK.snap + 0.06) {
    // laying the chain: one hand pays it out across the lid, the other brings the lock in
    const head1 = chainB > 0 ? mix2([LID.r + 6, LID.t - 6], [LID.l - 6, LID.b + 6], chainB) : mix2([LID.l - 6, LID.t - 6], [LID.r + 6, LID.b + 6], chainA);
    hR = toLocal(head1[0], head1[1], SHOP);
    hL = toLocal(...mix2([LID.r + 70, LID.t + 40], [SCREEN[0] + 8, SCREEN[1] - 30], lin(t, LOCK.snap - 0.14, LOCK.snap)), SHOP);
  } else if (t >= LOCK.snap + 0.06 && t < Q.cost - 0.1) {
    const keyAt = mix2([SCREEN[0], SCREEN[1] + 20], toPage(-40, -246, SHOP), keyUp);
    const pocket = toPage(-14, -118, SHOP);
    const k2 = keyAway > 0 ? mix2(keyAt, pocket, keyAway) : keyAt;
    hR = toLocal(k2[0], k2[1] - 10, SHOP);
    hL = keyAway >= 1 ? mix2(toLocal(pocket[0], pocket[1] + 8, SHOP), [-14, -124 + jolt(t, Q.do + 0.56, 5, 0.3)], 0.5) : restL;
  } else if (t >= Q.cost - 0.1 && t < Q.data - 0.05) {
    const face: Pt = [LID.l - 46, LID.t + 32 + 70 * tagS];
    hR = toLocal(face[0] + 4, face[1] + stampDy - 58 * 1.7, SHOP);
  } else if (t >= Q.data - 0.05) {
    hR = hatOff ? toLocal(hatPos[0] + (back > 0 ? 0 : 20), hatPos[1] + (back > 0 ? -6 : 4), SHOP) : pat > 0 ? mix2(restR, [0, -212 - CROWN - 4], pat) : restR;
  }
  const keyShown = t >= LOCK.snap + 0.06 && keyAway < 1 && t < Q.cost;
  const keyPos = mix2([SCREEN[0], SCREEN[1] + 20], toPage(-40, -246, SHOP), keyUp);
  const keyP = keyAway > 0 ? mix2(keyPos, toPage(-14, -118, SHOP), keyAway) : keyPos;
  // her: happy at her screen; steps back with her hands up at the snap; eyes on the tag as it grows; her phone lights,
  // then her face falls as the second thing leaves it
  const step = lin(t, LOCK.snap, LOCK.snap + 0.2, EASE_OUT) * (1 - lin(t, Q.cost - 0.3, Q.cost, EASE_IN_OUT)) * 24;
  const phoneUp = lin(t, Q.data - 0.25, Q.data - 0.05, EASE_OUT);
  const herPose = t >= Q.data - 0.2 ? 'up' : t > LOCK.snap && t < Q.cost - 0.1 ? 'bothUp' : 'down';
  const leftItems = HAT.items.filter((a) => t < a).length;
  const herMood = t > HAT.items[1] ? 'o' : t > Q.data - 0.2 ? 'smile' : t > PRICES[1].at ? 'o' : t > LOCK.chain + 0.1 && t < Q.cost - 0.1 ? 'o' : t > Q.cost - 0.1 ? 'flat' : 'smile';
  const herBob = -Math.abs(jolt(t, LOCK.snap, 8, 0.35)) - PRICES.reduce((s, q, i) => s + Math.abs(jolt(t, q.at + 0.03, 3 + i * 2, 0.35)), 0);
  const phone: Pt = [HER.x - step + 24 * HER.s, F2 - 96 * HER.s - 6 + herBob];
  const tagHole: Pt = [LID.l - 46, LID.t + 32];
  return (
    <>
      <Heading n="ii" title="what they decided" />
      <Folio left={4} />
      <Sheet>
        <Ink d={`M 90 ${F2} L 1440 ${F2}`} a={-10} b={-9} w={W.ground} c={P.inkSoft} />
        {/* his shop's back wall: a line of blank price tags strung behind the counter (first look: the top of the spread was empty paper) */}
        <path d="M 690 300 Q 1000 350 1420 290" stroke={P.ink} strokeWidth={W.detail} fill="none" />
        {[760, 880, 1000, 1120, 1240, 1350].map((x, i) => {
          const y = 300 + Math.sin(((x - 690) / 730) * Math.PI) * 42 - (x > 1300 ? 6 : 0);
          return <g key={x} transform={`translate(${x} ${y}) rotate(${Math.sin(t * 1.6 + i) * 4 + (i % 2 ? 5 : -4)})`}>
            <path d="M 0 0 L 0 16" stroke={P.ink} strokeWidth={1.8} />
            <path d="M -22 22 L -16 16 L 16 16 L 22 22 L 22 50 L -22 50 Z" fill={P.paper} stroke={P.ink} strokeWidth={W.detail} strokeLinejoin="round" />
            <circle cx={0} cy={23} r={2.4} fill="none" stroke={P.ink} strokeWidth={1.4} />
          </g>;
        })}
        {/* the shopkeeper, behind his counter: drawn on "decided" */}
        <HatFigure x={SHOP.x} y={SHOP.y} s={SHOP.s} crown={CROWN} a={manA} b={manA + 0.5} pose="hold" flip face={t > Q.do + 0.3 && t < Q.cost ? 'grin' : 'moustache'}
          lean={lean} bob={-Math.abs(jolt(t, Q.decided, 6, 0.4))} hands={[hL, hR]} hat={!hatOff} />
        {/* the counter */}
        <path d={`M ${DESK.x0} ${DESK.top} L ${DESK.x1} ${DESK.top} L ${DESK.x1 - 10} ${DESK.top + 22} L ${DESK.x0 + 10} ${DESK.top + 22} Z`} fill={P.wash} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
        <path d={`M ${DESK.x0 + 14} ${DESK.top + 22} L ${DESK.x1 - 14} ${DESK.top + 22} L ${DESK.x1 - 14} ${F2} L ${DESK.x0 + 14} ${F2} Z`} fill={P.paperShade} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
        <path d={`M ${DESK.x0 + 40} ${DESK.top + 52} L ${DESK.x1 - 40} ${DESK.top + 52} L ${DESK.x1 - 40} ${F2 - 30} L ${DESK.x0 + 40} ${F2 - 30} Z`} fill="none" stroke={P.inkSoft} strokeWidth={W.detail} opacity={0.6} />
        <g transform={`translate(${shake} ${-Math.abs(shake) * 0.5})`}>
          <BigLaptop lock={shut} tip={-1.2 * Math.max(0, cur) * (t < Q.data ? 1 : 1)} />
          {/* A: the chain laid across the lid in an X, and the padlock snapped through it on "do" */}
          <Chain a={[LID.l - 6, LID.t - 6]} b={[LID.r + 6, LID.b + 6]} p={chainA} />
          <Chain a={[LID.r + 6, LID.t - 6]} b={[LID.l - 6, LID.b + 6]} p={chainB} />
          {t > LOCK.chain - 0.1 && (() => {
            const lp: Pt = t < LOCK.snap ? toPage(hL[0], hL[1], SHOP) : [SCREEN[0], SCREEN[1] + 6];
            return <LockInk x={lp[0]} y={lp[1] + (t < LOCK.snap ? 22 : 0)} s={2.0} shut={shut} sq={sq} r={t < LOCK.snap ? Math.sin(t * 9) * 6 : 0} />;
          })()}
        </g>
        {keyShown && <KeyBig x={keyP[0]} y={keyP[1]} r={90 * keyTurn - 90 * keyUp + 20 * keyAway} />}
        {/* B: the tag, tied to the corner of her lid, stamped dearer and a little bigger on every beat */}
        {t > Q.cost - 0.12 && t < Q.data + 0.1 && (
          <g>
            <path d={`M ${LID.l + 4} ${LID.t + 4} Q ${(LID.l + tagHole[0]) / 2} ${LID.t + 4} ${tagHole[0]} ${tagHole[1] + 16 * tagS}`} stroke={P.ink} strokeWidth={W.detail} fill="none" />
            <PriceTag x={tagHole[0]} y={tagHole[1]} s={tagS * Math.min(1, tagIn)} v={cur >= 0 ? PRICES[cur].v : ''} hit={hit} swing={swing - 3} rot={[-2, 3, -3.5, 5][Math.max(0, cur)]} />
            {/* the ink spat off the stamp on each hit */}
            {cur >= 0 && t < PRICES[cur].at + 0.2 && [[-1, -0.6], [1.1, -0.4], [-0.8, 0.7], [0.9, 0.8]].map(([dx, dy], i) => (
              <circle key={i} cx={tagHole[0] + dx * 120 * tagS * lin(t, PRICES[cur].at, PRICES[cur].at + 0.08)} cy={tagHole[1] + 60 * tagS + dy * 60 * tagS * lin(t, PRICES[cur].at, PRICES[cur].at + 0.08)} r={3 + i} fill={P.ink} opacity={1 - lin(t, PRICES[cur].at + 0.08, PRICES[cur].at + 0.2)} />
            ))}
          </g>
        )}
        {t >= Q.cost - 0.1 && t < Q.data - 0.05 && <StampBig x={tagHole[0] + 4} y={tagHole[1] + 64 * tagS + stampDy} sq={hit} />}
        {/* C: the hat, off with a twirl, held brim-up over the counter, and popped back on full */}
        {hatOff && (
          <g transform={`translate(${hatPos[0]} ${hatPos[1]}) rotate(${-hatRot}) scale(${1.2 * (1 + gulp * 0.01)} ${1.2 * (1 - gulp * 0.012)})`}>
            <TopHat crown={CROWN} mouth={Math.abs(((hatRot % 360) + 360) % 360 - 180) < 50} />
          </g>
        )}
        {plop > 0 && <ellipse cx={head[0]} cy={head[1] + 2} rx={44} ry={6} fill="none" stroke={P.ink} strokeWidth={2} opacity={0.4} />}
        {/* her */}
        <Person x={HER.x - step} y={F2} s={HER.s} a={-10} b={-9} pose={herPose} hair="bun" mood={herMood} bob={herBob}
          look={t > Q.cost - 0.1 && t < Q.data - 0.2 ? 3 : t > HAT.items[0] ? 2.5 : 2} />
        {phoneUp > 0 && <Phone x={phone[0]} y={phone[1] + (1 - phoneUp) * 40} s={HER.s} r={6} rows={leftItems} lit={held(t, HAT.items[0] - 0.15, HAT.items[3], 0.1, 0.2)} />}
        {/* her things, one per word, peeling out of her phone and arcing over the counter into his hat */}
        {HAT.items.map((a, i) => {
          const u0 = (t - a) / HAT.fly;
          if (u0 <= 0 || u0 >= 1) return null;
          const u = EASE_IN_OUT(u0);
          const [x, y] = bez2([phone[0], phone[1] - 20], [(phone[0] + held2[0]) / 2, 430 - i * 10], [held2[0], held2[1] + 6], u);
          const sc = 2.1 * Math.min(1, 0.4 + u0 * 4) * (1 - 0.45 * Math.max(0, (u0 - 0.8) / 0.2));
          const r = Math.sin(i * 2.1 + t * 5) * 14;
          if (i === 0) return <KeepsakeIcon key={i} kind="family" x={x} y={y} s={sc} w={2.6 / sc} r={r} />;
          if (i === 1) return <KeepsakeIcon key={i} kind="diary" x={x} y={y} s={sc} w={2.6 / sc} r={r} />;
          if (i === 2) return <Letter key={i} x={x} y={y} s={sc} r={r} />;
          return <House key={i} x={x} y={y} s={sc} r={r} />;
        })}
      </Sheet>
    </>
  );
};
export const RULES: Spread = { id: 'rules', Art: RulesArt };

// ======================= iii · the bargain =======================
// WHY one scroll passed hand to hand (round-6 review: a flat band along the floor read as a ramp, nobody signed, the
// title floated on a leader line): the contract runs from the lectern back along the queue at hand height, sagging
// between them; each signs it in turn without looking up from the phone, and its title is printed on the scroll.
const FAR: Pt = [176, 500], NEAR: Pt = [1060, 872];
const along = (d: number): Pt => mix2(FAR, NEAR, d);
// WHY steeper than round 5 (0.34 far to 1.54 near): the depth must read in the medium shot, not only the wide
const depth = (d: number) => 0.34 + 1.2 * d;
const QD = Array.from({ length: 8 }, (_, i) => 0.04 + i * 0.137);
const HEIGHT = [1.0, 0.9, 1.1, 0.86, 1.06, 0.94, 1.12, 0.92];
const LECTERN = { x: 1262, top: 676, foot: 872 };
const BargainArt: React.FC = () => {
  const t = useT();
  const landed = land(TURN.bargain);
  const unroll = lin(t, landed - 0.2, Q.accepted - 0.3, EASE_IN_OUT);
  const signAt = (i: number) => Q.accepted - 0.06 + (QD.length - 1 - i) * 0.08;
  // each person's hand on the scroll (their own scale and height)
  const ppl = QD.map((d, i) => {
    const [x, y] = along(d), sc = depth(d) * HEIGHT[i] * 1.18;
    return { x, y, sc, hand: [x + 26 * sc, y - 44 * sc] as Pt };
  });
  // the scroll's centre line: off the lectern, then hand to hand back along the queue, sagging between each pair
  const knots: Pt[] = [[LECTERN.x - 40, LECTERN.top - 6], ...ppl.slice().reverse().map((p) => p.hand), [FAR[0] - 70, FAR[1] - 24]];
  const center: Pt[] = [];
  const widths: number[] = [];
  for (let k = 0; k < knots.length - 1; k++) {
    const a = knots[k], b = knots[k + 1];
    const wa = k === 0 ? 34 : 30 * ppl[QD.length - k].sc, wb = 30 * (k + 1 < knots.length - 1 ? ppl[QD.length - 1 - k].sc : 0.3);
    const sag = 10 + Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.12;
    for (let s = 0; s < 12; s++) {
      const u = s / 12;
      center.push([mix(a[0], b[0], u), mix(a[1], b[1], u) + Math.sin(u * Math.PI) * sag]);
      widths.push(mix(wa, wb, u));
    }
  }
  center.push(knots[knots.length - 1]); widths.push(8);
  const shown = Math.max(2, Math.round(center.length * unroll));
  const C = center.slice(0, shown), Wd = widths.slice(0, shown);
  const edge = (side: number) => C.map((p, i) => {
    const a = C[Math.max(0, i - 1)], b = C[Math.min(C.length - 1, i + 1)];
    const nx = -(b[1] - a[1]), ny = b[0] - a[0], l = Math.hypot(nx, ny) || 1;
    return [p[0] + (side * nx * Wd[i]) / (2 * l), p[1] + (side * ny * Wd[i]) / (2 * l)] as Pt;
  });
  const e1 = edge(1), e2 = edge(-1).reverse();
  const band = `M ${[...e1, ...e2].map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ')} Z`;
  const line = (off: number) => `M ${C.map((p, i) => {
    const a = C[Math.max(0, i - 1)], b = C[Math.min(C.length - 1, i + 1)];
    const nx = -(b[1] - a[1]), ny = b[0] - a[0], l = Math.hypot(nx, ny) || 1;
    return `${(p[0] + (nx * Wd[i] * off) / l).toFixed(1)} ${(p[1] + (ny * Wd[i] * off) / l).toFixed(1)}`;
  }).join(' L ')}`;
  const tail = C[C.length - 1];
  // the man at his lectern: leans toward the queue on "just", a big two-handed rub with his shoulders up on "accepted",
  // a sly lean back with a grin on "it"
  const toward = 12 * lin(t, Q.accepted - 0.25, Q.accepted, EASE_OUT) * (1 - lin(t, Q.it - 0.05, Q.it + 0.2, EASE_IN_OUT));
  const rubbing = t > Q.accepted + 0.05;
  const rub = rubbing ? Math.sin((t - Q.accepted) * 26) * 7 : 0;
  const shrug = -8 * held(t, Q.accepted + 0.05, Q.it + 0.1, 0.12, 0.2);
  const manB: Place = { x: 1336, y: 872, s: 1.48, flip: true, lean: 4 + toward - 5 * lin(t, Q.it, Q.it + 0.2, EASE_OUT) };
  return (
    <>
      <Heading n="iii" title="what we accepted" />
      <Folio left={6} />
      <Sheet>
        {/* the man and his lectern, nearest the reader */}
        <HatFigure x={manB.x} y={manB.y} s={manB.s} crown={100} a={-10} b={-9} pose="rub" flip face={t > Q.it - 0.02 ? 'grin' : 'smug'}
          lean={manB.lean} bob={shrug + jolt(t, Q.it, 5, 0.5)} hands={rubbing ? [[-8 + rub, -124], [8 - rub, -122]] : [[-30, -118], [34, -122]]} />
        <path d={`M ${LECTERN.x - 64} ${LECTERN.foot} L ${LECTERN.x + 60} ${LECTERN.foot} L ${LECTERN.x + 50} ${LECTERN.top + 8} L ${LECTERN.x - 54} ${LECTERN.top + 8} Z`} fill={P.paper} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
        <path d={`M ${LECTERN.x - 80} ${LECTERN.top + 12} L ${LECTERN.x + 80} ${LECTERN.top - 4} L ${LECTERN.x + 80} ${LECTERN.top - 20} L ${LECTERN.x - 80} ${LECTERN.top - 4} Z`} fill={P.wash} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
        {/* the top sheet hanging down the lectern's front: the contract's title is printed on the paper itself */}
        <path d={`M ${LECTERN.x - 46} ${LECTERN.top + 6} L ${LECTERN.x + 42} ${LECTERN.top + 2} L ${LECTERN.x + 40} ${LECTERN.foot - 64} Q ${LECTERN.x - 2} ${LECTERN.foot - 44} ${LECTERN.x - 44} ${LECTERN.foot - 60} Z`} fill={P.paper} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
        <text x={LECTERN.x - 2} y={LECTERN.top + 44} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={19} letterSpacing="-0.03em" fill={P.ink}>terms of</text>
        <text x={LECTERN.x - 2} y={LECTERN.top + 66} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={19} letterSpacing="-0.03em" fill={P.ink}>service</text>
        {[96, 112, 128, 144, 160].map((dy, i) => <path key={dy} d={`M ${LECTERN.x - 32} ${LECTERN.top + dy} l ${[60, 54, 62, 48, 58][i]} 0`} stroke={P.inkSoft} strokeWidth={W.detail} opacity={0.55} strokeLinecap="round" />)}
        {/* the queue, far end first so the nearer people overlap the farther */}
        {ppl.map((p, i) => {
          const sa = signAt(i);
          // WHY eyes to camera one by one on "we all..." (kept): caught in the act, then back to their phones to sign
          const caught = lin(t, landed + 0.02 + (QD.length - 1 - i) * 0.05, landed + 0.14 + (QD.length - 1 - i) * 0.05);
          const back = lin(t, Q.accepted - 0.45, Q.accepted - 0.3);
          const signing = t > sa - 0.14 && t < sa + 0.36;
          return (
            <g key={i}>
              <Person x={p.x} y={p.y} s={p.sc} a={-10} b={-9} hair={(['tuft', 'bun', 'cap', 'curly', 'bob', 'long'] as Hair[])[i % 6]} pose={signing ? 'write' : 'hold'} device="phone"
                mood={caught > 0.5 && back < 0.5 ? 'o' : 'flat'} look={caught > 0.5 && back < 0.5 ? 0 : 3} tilt={signing ? 9 : jolt(t, sa + 0.36, 4, 0.4) + [0, -3, 2, -2, 3, -1, 2, -3][i]} />
            </g>
          );
        })}
        {/* the scroll, in front of their hands */}
        {unroll > 0 && (
          <g>
            <path d={band} fill={P.paper} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
            <path d={line(0.18)} stroke={P.inkSoft} strokeWidth={W.detail} fill="none" opacity={0.45} strokeDasharray="14 6 22 6" />
            <path d={line(-0.18)} stroke={P.inkSoft} strokeWidth={W.detail} fill="none" opacity={0.45} strokeDasharray="20 6 10 6" />
            {/* the loose end still curling as it unrolls */}
            {unroll < 1 && <path d={`M ${tail[0]} ${tail[1] - 8} q -14 -2 -14 10 q 0 12 12 10 q 8 -2 6 -10`} fill={P.paper} stroke={P.ink} strokeWidth={W.outline} />}
          </g>
        )}
        {/* each one's tick and pen, drawn as they sign */}
        {ppl.map((p, i) => {
          const sa = signAt(i);
          if (t < sa - 0.14 || unroll < 1) return null;
          const [hx, hy] = p.hand, sc = p.sc;
          const signing = t < sa + 0.36;
          return (
            <g key={i}>
              <rect x={hx - 9 * sc} y={hy - 9 * sc} width={18 * sc} height={18 * sc} rx={2.5 * sc} fill={P.paper} stroke={P.ink} strokeWidth={W.detail} />
              <Ink d={`M ${hx - 5 * sc} ${hy} L ${hx - 1 * sc} ${hy + 5 * sc} L ${hx + 7 * sc} ${hy - 7 * sc}`} a={sa} b={sa + 0.14} w={4 * Math.max(0.7, sc)} />
              {signing && <path d={`M ${hx + 6 * sc} ${hy - 2 * sc} l ${10 * sc} ${-18 * sc}`} stroke={P.ink} strokeWidth={3.4 * Math.max(0.7, sc)} strokeLinecap="round" />}
            </g>
          );
        })}
      </Sheet>
    </>
  );
};
export const BARGAIN: Spread = { id: 'bargain', Art: BargainArt };

// ======================= (iii, cont.) own nothing / privacy =======================
/** A price tag that drops onto a thing on its string and lands with a thump (review: see-through tags faded in). */
const SmallTag: React.FC<{ x: number; y: number; at: number; text: string; lift: number }> = ({ x, y, at, text, lift }) => {
  const t = useT();
  if (t < at) return null;
  const p = pop(t, at, 0.42);
  const drop = (1 - Math.min(1.08, p)) * -90;
  const thump = t > at + 0.07 && t < at + 0.14 ? 1 : 0;
  const sway = Math.sin((t - at) * 7) * 9 * Math.exp(-(t - at) * 2.4);
  return (
    <g transform={`translate(${x} ${y - lift + drop}) rotate(${sway - 4}) scale(1.3)`}>
      {/* WHY this size: the camera cuts in on "subscribe"; the prices must read on a phone */}
      <path d={`M 0 ${-12 - drop / 1.3} L 0 18`} stroke={P.ink} strokeWidth={1.6} />
      <g transform={`translate(0 18) scale(${1 + thump * 0.08} ${1 - thump * 0.14}) translate(0 -18)`}>
        <path d="M -54 18 L 54 18 L 54 52 L -54 52 Z" fill={P.paper} stroke={P.ink} strokeWidth={2.4} />
        <text x={0} y={43} textAnchor="middle" fontSize={21} fontWeight={800} fill={P.ink} fontFamily={DMSANS} letterSpacing="-0.02em">{text}</text>
      </g>
    </g>
  );
};

type Thing = { id: string; d: string; fill: string; tag: Pt; price: string; top: Pt };
const THINGS: Thing[] = [
  { id: 'bike', d: `M 90 776 a 42 42 0 1 0 84 0 a 42 42 0 1 0 -84 0 M 204 776 a 42 42 0 1 0 84 0 a 42 42 0 1 0 -84 0 M 132 776 L 172 730 L 230 730 L 246 776 M 172 730 L 196 776 L 132 776 M 230 730 L 222 712 M 196 776 L 166 716 L 150 716`, fill: 'none', tag: [196, 610], price: '14.99/mo', top: [196, 610] },
  { id: 'picture', d: 'M 305 200 L 415 200 L 415 284 L 305 284 Z M 318 270 L 345 238 L 365 258 L 380 244 L 402 270', fill: P.paper, tag: [360, 296], price: '3.99/mo', top: [360, 200] },
  { id: 'books', d: 'M 432 420 L 432 362 L 452 362 L 452 420 M 454 420 L 454 352 L 476 352 L 476 420 M 478 420 L 482 368 L 500 370 L 497 420 M 502 420 L 502 358 L 522 358 L 522 420', fill: P.wash, tag: [440, 432], price: '2.99/mo', top: [478, 352] },
  { id: 'record', d: 'M 508 720 L 632 720 L 632 696 L 508 696 Z M 528 696 a 42 9 0 1 0 84 0 a 42 9 0 1 0 -84 0 M 620 690 L 596 698', fill: P.wash, tag: [570, 734], price: '11.99/mo', top: [570, 686] },
  { id: 'camera', d: 'M 572 420 L 572 384 L 588 384 L 594 374 L 616 374 L 622 384 L 640 384 L 640 420 Z M 594 402 a 12 12 0 1 0 24 0 a 12 12 0 1 0 -24 0', fill: P.wash, tag: [624, 432], price: '9.99/mo', top: [606, 374] },
];
// WHY back and arms apart: she sits between them (drawn over the back, under the arms)
const CHAIR_BACK = 'M 286 820 L 286 700 Q 286 660 330 660 L 400 660 Q 444 660 444 700 L 444 820 Z';
const CHAIR_ARMS = 'M 270 820 L 270 730 Q 270 716 286 716 L 300 716 L 300 820 Z M 430 820 L 430 716 L 446 716 Q 460 716 460 730 L 460 820 Z';
const CHAIR = `${CHAIR_BACK} ${CHAIR_ARMS}`;

/** How far a thing has been yanked up: a snag (string tightens) then an accelerating pull straight off the page.
 *  WHY straight up and staggered left to right (review: the things crossed in one tangle): each leaves in its own column. */
const yanked = (t: number, at: number) => {
  const x = t - at - 0.08;
  return x <= 0 ? (t > at ? -4 * Math.sin(((t - at) / 0.08) * Math.PI) : 0) : Math.min(1400, x * x * 5200 + x * 400);
};
// the window and the diary on the shelf (the privacy beat)
const WIN = { x0: 120, y0: 205, x1: 270, y1: 380 };
const DIARY: Pt = [548, 398];

const NothingArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.nothing) - 1.5;
  const FLOOR = 820;
  const chairAt = Q.nothing - 0.02;
  const chairLift = yanked(t, chairAt);
  // she drops when the chair goes: a short fall, a squash on landing, then sitting on the bare page
  const fall = lin(t, chairAt + 0.12, chairAt + 0.3, EASE_IN);
  const landed = t > chairAt + 0.3;
  const squash = landed && t < chairAt + 0.37 ? 1 : 0;
  const herY = 790 + fall * 50;
  // ---- privacy: he rises into her window, takes notes, dangles "free" down to her, and lifts her diary ----
  const rise = lin(t, Q.privacy - 0.1, Q.privacy + 0.25, EASE_OUT);
  const peer: Place = { x: 196, y: 690 - 210 * rise, s: 0.95, lean: Math.sin(t * 2.3) * 2 };
  const dangle = lin(t, Q.costOf - 0.3, Q.costOf + 0.1, EASE_IN_OUT);
  const takes = t > Q.costOf + 0.16;
  const reach = lin(t, Q.convenience - 0.04, Q.convenience + 0.22, EASE_OUT);
  const pull = lin(t, Q.convenience + 0.3, Q.convenience + 0.6, EASE_IN);
  const reachTo: Pt = mix2(mix2([WIN.x1 - 10, 300], DIARY, reach), [WIN.x1 - 10, 300], pull);
  const herHand: Pt = [365 + 24 * 1.15, FLOOR + 22 - 96 * 1.15 - 6];
  // WHY held out at her side once taken (first look: held up, the tag covered her face)
  const tagAt: Pt = takes ? [herHand[0] + 34, herHand[1] + 52] : mix2([WIN.x1 - 30, WIN.y1 + 10], [herHand[0], herHand[1] - 30], dangle);
  const fallen = held(t, Q.convenience + 0.5, 99, 0.3, 0.1);       // her face as she notices
  const scrolling = t < Q.subscribe ? Math.sin(t * 6) * 3 : 0;
  const thumb = t < Q.own ? (Math.sin(t * 7) + 1) / 2 : 0.5;
  const curtain = Math.sin(t * 1.7) * 6;
  const order = THINGS.map((th) => th.top[0]).slice().sort((a, b) => a - b);
  // WHY the tags land on the stresses of "sub-scribe to ev-ery-thing", left to right
  const tagTimes = [Q.subscribe, Q.subscribe + 0.26, Q.everything1 - 0.12, Q.everything1 + 0.12, Q.everything1 + 0.38];
  return (
    <>
      <Folio left={8} hideRight />
      <Sheet>
        <defs>
          <clipPath id="c-floor-clip"><rect x={0} y={0} width={1520} height={FLOOR} /></clipPath>
          <clipPath id="c-window-clip"><rect x={WIN.x0 + 2} y={WIN.y0 + 2} width={WIN.x1 - WIN.x0 - 4} height={WIN.y1 - WIN.y0 - 4} /></clipPath>
        </defs>
        <path d="M 150 840 Q 380 870 620 840 Q 380 812 150 840 Z" fill={P.paperShade} />
        <Ink d="M 70 820 L 690 820" a={L - 0.3} b={L + 0.2} w={W.ground} />
        {/* the window: the night outside, and him peering in through it */}
        <Shape d={`M ${WIN.x0} ${WIN.y0} L ${WIN.x1} ${WIN.y0} L ${WIN.x1} ${WIN.y1} L ${WIN.x0} ${WIN.y1} Z`} a={L - 0.2} b={L + 0.3} fill={P.paperShade} w={W.outline} />
        {rise > 0 && (
          <g clipPath="url(#c-window-clip)">
            <HatFigure x={peer.x} y={peer.y} s={peer.s} crown={100} a={-10} b={-9} pose="hold" face="monocle" lean={peer.lean}
              hands={[[-30, -150], t > Q.privacy + 0.3 && t < Q.costOf - 0.3 ? [26 + Math.sin(t * 30) * 3, -146] : [40, -140]]} />
            {/* his little notebook, pressed up against the glass */}
            {t > Q.privacy + 0.2 && t < Q.costOf - 0.25 && (() => {
              const [nx, ny] = toPage(-30, -156, peer);
              return <g><rect x={nx - 12} y={ny - 16} width={24} height={30} rx={2} fill={P.paper} stroke={P.ink} strokeWidth={W.detail} />
                {[-8, -2, 4].map((dy) => <path key={dy} d={`M ${nx - 7} ${ny + dy} l 13 0`} stroke={P.inkSoft} strokeWidth={1.4} />)}</g>;
            })()}
          </g>
        )}
        {/* panes and a glint on the glass, over him */}
        <Ink d={`M 195 ${WIN.y0} L 195 ${WIN.y1} M ${WIN.x0} 292 L ${WIN.x1} 292`} a={L} b={L + 0.4} w={W.detail} />
        <path d={`M 138 268 L 166 232 M 214 352 L 236 324`} stroke="#fff" strokeWidth={4} opacity={0.5} strokeLinecap="round" />
        <Ink d={`M 104 196 Q ${112 + curtain} 300 100 392 M 286 196 Q ${278 - curtain} 300 290 392 M 96 196 L 294 196`} a={L} b={L + 0.4} w={W.detail} />
        {/* the shelf and the record player's cabinet */}
        <Ink d="M 420 420 L 665 420 M 440 420 L 440 440 M 645 420 L 645 440" a={L} b={L + 0.35} w={W.outline} />
        <Shape d="M 500 820 L 640 820 L 640 722 L 500 722 Z" a={L + 0.05} b={L + 0.4} fill={P.paper} w={W.outline} />
        <Ink d="M 500 770 L 640 770 M 562 746 L 578 746 M 562 794 L 578 794" a={L + 0.1} b={L + 0.45} w={W.detail} />
        {/* her diary on the shelf: the one thing that was not for sale */}
        {(reach < 1 || pull < 0.02) && <KeepsakeIcon kind="diary" x={DIARY[0]} y={DIARY[1]} s={1.15} w={2.6 / 1.15} />}
        <g transform={`translate(0 ${-chairLift})`}><Shape d={CHAIR_BACK} a={L} b={L + 0.4} fill={P.wash} w={W.outline} /></g>
        {/* her, in the chair; then on the floor */}
        <g clipPath={landed ? 'url(#c-floor-clip)' : undefined}>
          <g transform={squash ? `translate(365 ${FLOOR}) scale(1.12 0.86) translate(-365 ${-FLOOR})` : undefined}>
            <Person x={365} y={landed ? FLOOR + 22 + fallen * 4 : herY} s={1.15} a={L + 0.15} b={L + 0.7} pose={takes ? 'write' : 'hold'} device={t < Q.privacy ? 'phone' : 'none'} hair="tuft"
              mood={fallen > 0.5 ? 'flat' : takes ? 'smile' : t > Q.nothing + 0.05 && t < Q.privacy ? 'o' : 'smile'} bob={scrolling * 0.3}
              look={takes ? (fallen > 0.5 ? -2 : 3) : t > Q.privacy + 0.2 ? -3 : 0} tilt={-4 * fallen} />
          </g>
        </g>
        {/* her thumb on the phone, scrolling */}
        {t < Q.nothing && !landed && <path d={`M 372 ${herY - 50 + thumb * 8} l 4 -3`} stroke={P.ink} strokeWidth={3} strokeLinecap="round" />}
        {/* sitting on the floor: legs out in front */}
        {landed && <path d="M 356 818 L 336 818 L 330 806 M 374 818 L 398 818 L 404 806" stroke={P.ink} strokeWidth={4.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
        {/* the armchair, tagged and then yanked out from under her */}
        <g transform={`translate(0 ${-chairLift})`}>
          <Shape d={CHAIR_ARMS} a={L} b={L + 0.4} fill={P.wash} w={W.outline} />
          {(() => { const sp = lin(t, Q.own - 0.2, Q.own + 0.05); return sp > 0 ? <path d={`M 365 ${-40 + chairLift} L 365 660`} stroke={P.ink} strokeWidth={W.detail} pathLength={1} strokeDasharray="1 2" strokeDashoffset={1 - sp} /> : null; })()}
        </g>
        {t > chairAt + 0.2 && <path d={CHAIR} fill="none" stroke={P.inkSoft} strokeWidth={2} opacity={0.3 * lin(t, chairAt + 0.2, chairAt + 0.5) * (1 - lin(t, chairAt + 1.2, chairAt + 1.8))} />}
        {/* the things: tagged one by one, then snagged and yanked straight up off the page */}
        {THINGS.map((th) => {
          const rank = order.indexOf(th.top[0]);
          const tagAtT = tagTimes[rank];
          const liftAt = Q.own + rank * 0.08;
          const lift = yanked(t, liftAt);
          const strP = lin(t, Q.own - 0.28 + rank * 0.05, Q.own - 0.05 + rank * 0.05);
          return (
            <g key={th.id}>
              {t > liftAt + 0.2 && <path d={th.d} fill="none" stroke={P.inkSoft} strokeWidth={2} opacity={0.3 * lin(t, liftAt + 0.2, liftAt + 0.5) * (1 - lin(t, liftAt + 1.4, liftAt + 2))} />}
              <g transform={`translate(0 ${-lift})`}>
                <Shape d={th.d} a={L + 0.1 + rank * 0.06} b={L + 0.6 + rank * 0.06} fill={th.fill === 'none' ? undefined : th.fill} w={W.outline} />
                {/* the record turns until it is taken */}
                {th.id === 'record' && <path d={`M ${570 + 30 * Math.cos(t * 7)} ${696 + 6 * Math.sin(t * 7)} L ${570 + 38 * Math.cos(t * 7 + 0.5)} ${696 + 7.6 * Math.sin(t * 7 + 0.5)}`} stroke={P.paper} strokeWidth={2.4} strokeLinecap="round" opacity={0.9} />}
                {strP > 0 && <path d={`M ${th.top[0]} ${-40 + lift} L ${th.top[0]} ${th.top[1]}`} stroke={P.ink} strokeWidth={W.detail} pathLength={1} strokeDasharray="1 2" strokeDashoffset={1 - strP} />}
              </g>
              <SmallTag x={th.tag[0]} y={th.tag[1]} at={tagAtT} text={th.price} lift={lift} />
            </g>
          );
        })}
        {/* the cost of convenience: "free" dangled down on a string from the window, taken with a smile */}
        {dangle > 0 && (
          <g>
            {!takes && <path d={`M ${WIN.x1 - 30} ${WIN.y1 - 6} L ${tagAt[0]} ${tagAt[1] - 26}`} stroke={P.ink} strokeWidth={W.detail} />}
            <g transform={`translate(${tagAt[0]} ${tagAt[1]}) rotate(${takes ? -8 : Math.sin(t * 5) * 8})`}>
              <path d="M 0 -26 L 0 -10" stroke={P.ink} strokeWidth={2} />
              <path d="M -34 -12 L 34 -12 L 40 -2 L 40 26 L -40 26 L -40 -2 Z" fill={P.paper} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
              <text x={0} y={18} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={24} letterSpacing="-0.04em" fill={P.ink}>free</text>
            </g>
          </g>
        )}
        {/* ...while his other arm comes out of the window and lifts her diary off the shelf */}
        {reach > 0 && pull < 1 && (
          <Sleeve from={[WIN.x1 - 14, 318]} to={reachTo} lift={60}
            holding={reach >= 1 ? <KeepsakeIcon kind="diary" x={reachTo[0]} y={reachTo[1] + 10} s={1.15} w={2.6 / 1.15} r={-10 * pull} /> : null} />
        )}
      </Sheet>
    </>
  );
};
export const NOTHING: Spread = { id: 'nothing', Art: NothingArt };

// ======================= iv · however =======================
// WHY the quill and its black inkwell (round-6 review BLOCKER: line 4's dip pen was never seen again, and line 5's
// "new technology" was a different purple quill): this is the same quill, standing in the same inkwell, that the
// corporations unveil in the next chapter. Here it is still asleep and grey. One purple drop falls the whole length
// of "recently..." into the well; on "wonderful" the quill drinks it (purple running up from the nib) and springs
// out; on "happened" it looks about, then draws one thing across the gutter: a door, which opens and lets light out.
export const DROP_LAND = Q.recentlyEnd - 0.02;
const DROP_FROM = Q.recently + 0.02;
const WELL = { x: 430, top: 650 };
const MOUTH = WELL.top - 68;
const REST = { x: WELL.x, y: MOUTH + 8, r: -18, s: 1.3 };
const HOVER = { x: 520, y: 540, r: -4 };
// the drawing, as straight runs and one arch: a floor line across the gutter, the doorframe, then the open door leaf
const DOOR = { x0: 860, x1: 980, foot: 520, top: 330 };
const RUNS: Pt[][] = [
  [[560, 560], [700, 548], [860, DOOR.foot]],
  [[860, DOOR.foot], [860, DOOR.top], [920, DOOR.top - 62], [980, DOOR.top], [980, DOOR.foot]],
  [[860, DOOR.foot], [810, DOOR.foot + 26], [810, DOOR.top + 30], [860, DOOR.top]],
];
const sampleRuns = (): Pt[] => {
  const out: Pt[] = [];
  RUNS.forEach((run, ri) => {
    if (ri === 1) {
      // the frame: up, an arch over the top, down
      const [a, b, c, d, e] = run;
      for (let k = 0; k <= 10; k++) out.push(mix2(a, b, k / 10));
      for (let k = 1; k <= 16; k++) out.push(bez2(b, [c[0], c[1] - 20], d, k / 16));
      for (let k = 1; k <= 10; k++) out.push(mix2(d, e, k / 10));
      return;
    }
    for (let i = 0; i < run.length - 1; i++) for (let k = i === 0 && ri === 0 ? 0 : 1; k <= 10; k++) out.push(mix2(run[i], run[i + 1], k / 10));
  });
  return out;
};
const PATH = sampleRuns();
const CUM = PATH.reduce<number[]>((acc, p, i) => [...acc, i ? acc[i - 1] + Math.hypot(p[0] - PATH[i - 1][0], p[1] - PATH[i - 1][1]) : 0], []);
const pathAt = (u: number): Pt => {
  const target = u * CUM[CUM.length - 1];
  let i = 1;
  while (i < CUM.length - 1 && CUM[i] < target) i++;
  const k = (target - CUM[i - 1]) / Math.max(1e-6, CUM[i] - CUM[i - 1]);
  return mix2(PATH[i - 1], PATH[i], Math.min(1, Math.max(0, k)));
};
const WRITE = { from: Q.happened + 0.02, to: Q.happened + 0.62 };

const Inkwell: React.FC<{ glow: number }> = ({ glow }) => {
  const { x } = WELL, TOP = WELL.top;
  return (
    <g>
      <ellipse cx={x} cy={TOP + 2} rx={46} ry={6} fill={P.ink} opacity={0.12} />
      <path d={`M ${x - 38} ${TOP} L ${x - 38} ${TOP - 42} Q ${x - 38} ${TOP - 56} ${x - 22} ${TOP - 56} L ${x + 22} ${TOP - 56} Q ${x + 38} ${TOP - 56} ${x + 38} ${TOP - 42} L ${x + 38} ${TOP} Z`}
        fill={P.ink} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
      <path d={`M ${x - 18} ${TOP - 56} L ${x - 18} ${MOUTH} L ${x + 18} ${MOUTH} L ${x + 18} ${TOP - 56} Z`} fill={P.inkSoft} stroke={P.ink} strokeWidth={3} />
      <path d={`M ${x - 27} ${TOP - 10} L ${x - 27} ${TOP - 40} Q ${x - 27} ${TOP - 47} ${x - 20} ${TOP - 48}`} stroke="#fff" strokeWidth={4} opacity={0.3} fill="none" strokeLinecap="round" />
      {/* the ink in its mouth: dark until the drop lands, then purple, swelling once */}
      <ellipse cx={x} cy={MOUTH} rx={16 + glow * 4} ry={3.4 + glow * 1.2} fill={glow > 0 ? P.purple : P.ink} />
    </g>
  );
};
/** The quill with purple running up it from the nib: `k` 0 (asleep, grey) … 1 (all purple). */
const WakingQuill: React.FC<{ x: number; y: number; r: number; s: number; k: number }> = ({ x, y, r, s, k }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    <Quill x={0} y={0} s={1} color={P.wash} />
    {k > 0 && (
      <>
        <defs><clipPath id="c-quill-wake"><rect x={-20} y={-170 * k - 2} width={140} height={170 * k + 22} /></clipPath></defs>
        <g clipPath="url(#c-quill-wake)"><Quill x={0} y={0} s={1} /></g>
      </>
    )}
  </g>
);

const HoweverArt: React.FC = () => {
  const t = useT();
  const fallU = (t - DROP_FROM) / (DROP_LAND - DROP_FROM);
  const landed = t >= DROP_LAND;
  const glow = landed ? Math.min(1.2, pop(t, DROP_LAND, 0.5)) : 0;
  const drink = lin(t, Q.wonderful + 0.02, Q.wonderful + 0.4, EASE_IN_OUT);
  // asleep in the well; a shiver on "truly"; on "wonderful" it springs out with an overshoot; on "happened" it looks
  // left, then right (anticipation), then draws
  const tremble = t > Q.wonderful - 0.6 && t < Q.wonderful ? Math.sin(t * 46) * 1.4 * lin(t, Q.wonderful - 0.6, Q.wonderful - 0.2) : 0;
  const spring = pop(t, Q.wonderful + 0.28, 0.55);
  const look = held(t, Q.happened - 0.3, Q.happened - 0.12, 0.08, 0.08) * -14 + held(t, Q.happened - 0.14, Q.happened, 0.06, 0.06) * 12;
  const w = lin(t, WRITE.from, WRITE.to, EASE_IN_OUT);
  const writing = t >= WRITE.from;
  const done = t >= WRITE.to;
  // WHY a slow bob once it is done: the shot holds on the open door until the headline has had its time (to "hubris")
  const bobDone = done ? Math.sin((t - WRITE.to) * 3.2) * 6 * lin(t, WRITE.to + 0.2, WRITE.to + 0.5) : 0;
  const tip: Pt = writing ? (done ? mix2(pathAt(1), [1016, 300 + bobDone], lin(t, WRITE.to, WRITE.to + 0.25, EASE_OUT)) : pathAt(w)) : mix2([REST.x, REST.y], [HOVER.x, HOVER.y], spring);
  const nxt = pathAt(Math.min(1, w + 0.01));
  const sway = writing && !done ? Math.max(-12, Math.min(12, (nxt[0] - tip[0]) * 0.8)) : 0;
  const r = mix(REST.r, HOVER.r, Math.min(1.1, spring)) + tremble + look + sway + (done ? 10 * lin(t, WRITE.to, WRITE.to + 0.25) : 0);
  const height = writing && !done ? 0 : 36 * Math.min(1, spring);
  const pts = writing ? Array.from({ length: 160 }, (_, k) => pathAt((k / 159) * w)) : [];
  const light = lin(t, WRITE.to - 0.08, WRITE.to + 0.18, EASE_OUT);
  const doorway = `M ${DOOR.x0} ${DOOR.foot} L ${DOOR.x0} ${DOOR.top} Q 920 ${DOOR.top - 82} ${DOOR.x1} ${DOOR.top} L ${DOOR.x1} ${DOOR.foot} Z`;
  return (
    <>
      {/* WHY held, not faded (review: it vanished 0.4 s after landing): the camera's push takes it out of frame */}
      <Heading n="iv" title="then, quietly" />
      <Folio left={10} hideRight />
      <Sheet rough={false}>
        <Inkwell glow={glow} />
        {/* the light through the open door, once it is drawn: warm, the book's one extra colour arriving with the purple */}
        {light > 0 && <path d={doorway} fill={P.sunSoft} opacity={0.85 * light} />}
        {light > 0 && <path d={`M ${DOOR.x0} ${DOOR.foot} L ${DOOR.x1} ${DOOR.foot} L ${DOOR.x1 + 60} ${DOOR.foot + 56} L ${DOOR.x0 - 30} ${DOOR.foot + 56} Z`} fill={P.sunSoft} opacity={0.45 * light} />}
        {/* the drawing itself */}
        {pts.length > 1 && <path d={`M ${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ')}`} stroke={P.purple} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
        {done && <circle cx={824} cy={DOOR.foot - 92} r={6 * lin(t, WRITE.to, WRITE.to + 0.1)} fill={P.purple} />}
        {/* the quill's shadow: under the nib while it writes, falling away as it lifts */}
        {spring > 0 && (
          <g opacity={0.14} transform={`translate(${tip[0] + height * 0.5} ${tip[1] + height * 0.9}) rotate(${r}) scale(${REST.s})`}>
            <path d="M 0 0 L 6 -16 L 12 -14 Z M 8 -15 C 18 -60 52 -118 96 -150 C 92 -118 70 -64 14 -12 Z" fill={P.ink} filter="url(#c-bleed)" />
          </g>
        )}
        <WakingQuill x={tip[0]} y={tip[1]} r={r} s={REST.s * (1 + Math.min(1, spring) * 0.06)} k={drink} />
        {/* the drop, a true teardrop that stretches as it speeds up, falling from above the frame into the well */}
        {fallU > 0 && !landed && (() => {
          const u = Math.pow(fallU, 2.2);
          const y = mix(-120, MOUTH - 26, u);
          const stretch = 1 + 0.9 * Math.min(1, (u - Math.pow(Math.max(0, fallU - 0.04), 2.2)) * 18);
          const near = Math.pow(Math.min(1, fallU), 2.2);
          return (
            <>
              <ellipse cx={WELL.x} cy={MOUTH} rx={22 - 10 * near} ry={4} fill={P.ink} opacity={0.1 + 0.2 * near} />
              <g transform={`translate(${WELL.x} ${y}) scale(${1.6 / Math.sqrt(stretch)} ${1.6 * stretch})`}>
                <path d="M 0 -22 C 5 -12 13 -4 13 5 A 13 12 0 0 1 -13 5 C -13 -4 -5 -12 0 -22 Z" fill={P.purple} stroke={P.violet} strokeWidth={1.4} />
                <ellipse cx={-4} cy={2} rx={3} ry={5} fill="#fff" opacity={0.4} />
              </g>
            </>
          );
        })()}
        {/* the splash as it lands: a crown of purple for a few frames */}
        {landed && t < DROP_LAND + 0.14 && (() => {
          const k = lin(t, DROP_LAND, DROP_LAND + 0.14);
          return [-1, -0.4, 0.4, 1].map((d, i) => <circle key={i} cx={WELL.x + d * 18 * (0.5 + k)} cy={MOUTH - 10 - Math.sin(k * Math.PI) * (14 + Math.abs(d) * 4)} r={3.4 * (1 - k * 0.6)} fill={P.purple} />);
        })()}
      </Sheet>
    </>
  );
};
export const HOWEVER: Spread = { id: 'however', Art: HoweverArt };
