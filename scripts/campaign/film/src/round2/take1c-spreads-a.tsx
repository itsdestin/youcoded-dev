// Take 1C, chapters i–iv: the world as it is (plum ink on cream, almost no colour) up to the first drop of purple.
// WHY each picture: it must say what the narrator is saying at that moment to someone seeing it for one second.
//  i   "a small handful of corporations have dictated…"  a tear-off calendar runs through the years beside one smug
//                                                            hat; five more land; they work everyone's phones on strings
//  ii  "what your computers could do / cost / your data"   he snaps a padlock on her laptop and pockets the key; he
//                                                            stamps a dearer price on each beat; her things fly out of
//                                                            her phone into the top hat he holds out
//  iii "we all just accepted it"                            a queue winding back into the page signs one endless scroll
//      "subscribe to everything and own nothing"            tags on every thing in her room, then everything (her chair
//                                                            last) is yanked off the page
//      "privacy… the cost of convenience"                   he offers her "free" while her things float into his pocket
//  iv  "however, recently… something truly wonderful"       one purple drop falls the length of the frame onto a pen;
//                                                            the pen drinks it, rises, and writes its first stroke
// WHY round 5 rebuilt the acting (review: still cut-outs, every scene side-on on one floor line): every hat-man now
// has a face and moves his hands (HatFigure `hands`), each beat is acted with anticipation and overshoot, and the
// staging changes scale and depth from scene to scene.
import React from 'react';
import { DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT } from '../brand';
import { Appear, blob, circle, Enter, Face, HatFigure, Ink, jolt, Keepsake, KeepsakeIcon, Laptop, lin, NEUTRAL, P, Person, pop, Quill, Shape, useT, W } from './take1c-ink';
import { Folio, Heading, Sheet } from './take1c-page';
import { land, Q, TURN } from './take1c-time';
import type { Spread } from './take1c-book';

// ======================= shared helpers =======================
type Place = { x: number; y: number; s: number; flip?: boolean; lean?: number };
/** A point in a figure's own units (feet at 0,0) → page units, matching HatFigure's transform. */
const toPage = (lx: number, ly: number, f: Place): [number, number] => {
  const r = ((f.lean ?? 0) * Math.PI) / 180;
  const rx = lx * Math.cos(r) - ly * Math.sin(r), ry = lx * Math.sin(r) + ly * Math.cos(r);
  return [f.x + (f.flip ? -1 : 1) * f.s * rx, f.y + f.s * ry];
};
/** The inverse: where a page point sits in a figure's own units (so his hand can be put on a thing in the scene). */
const toLocal = (px: number, py: number, f: Place): [number, number] => {
  const dx = (px - f.x) / ((f.flip ? -1 : 1) * f.s), dy = (py - f.y) / f.s;
  const r = (-(f.lean ?? 0) * Math.PI) / 180;
  return [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)];
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const mix2 = (a: [number, number], b: [number, number], k: number): [number, number] => [mix(a[0], b[0], k), mix(a[1], b[1], k)];
const bez2 = (p0: [number, number], p1: [number, number], p2: [number, number], u: number): [number, number] => {
  const v = 1 - u;
  return [v * v * p0[0] + 2 * v * u * p1[0] + u * u * p2[0], v * v * p0[1] + 2 * v * u * p1[1] + u * u * p2[1]];
};
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
/** Lands whole with a squash from the feet (the same landing as the kit's 'pop' entrance), for groups of drawings. */
const PopIn: React.FC<{ at: number; x: number; y: number; dur?: number; children: React.ReactNode }> = ({ at, x, y, dur = 0.36, children }) => {
  const t = useT();
  const p = pop(t, at, dur);
  if (p <= 0) return null;
  const sy = p, sx = 1 + (1 - Math.min(1, p)) * 0.25;
  return <g transform={`translate(${x} ${y}) scale(${sx} ${sy}) translate(${-x} ${-y})`}>{children}</g>;
};
/** A top hat on its own (brim centre at 0,0, crown up), for a hat lifted off a head. Same geometry as HatFigure's. */
const TopHat: React.FC<{ crown: number; sx?: number }> = ({ crown, sx = 1 }) => (
  <g transform={`scale(${sx} 1)`}>
    <path d={`M -16 0 L -18.5 ${-crown} Q 0 ${-crown - 4} 18.5 ${-crown} L 16 0 Z`} fill={P.ink} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
    <path d="M -16.4 -9 L -16.9 -19 L 16.9 -19 L 16.4 -9 Z" fill={P.inkSoft} />
    <path d="M -27 1 Q 0 -5 27 1" stroke={P.ink} strokeWidth={6} fill="none" strokeLinecap="round" />
  </g>
);
/** A phone held up, screen to camera; `rows` (0..4) of its little screen lines still showing. */
const Phone: React.FC<{ x: number; y: number; s?: number; r?: number; rows?: number; tablet?: boolean }> = ({ x, y, s = 1, r = 0, rows = 3, tablet }) => {
  const w = tablet ? 34 : 18, h = tablet ? 26 : 30;
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={tablet ? 3 : 4} fill={P.paper} stroke={P.ink} strokeWidth={W.outline / s} />
      <rect x={-w / 2 + 3} y={-h / 2 + 4} width={w - 6} height={h - 8} rx={1.5} fill={P.wash} />
      {Array.from({ length: Math.max(0, Math.min(4, Math.round(rows))) }).map((_, i) => (
        <path key={i} d={`M ${-w / 2 + 6} ${-h / 2 + 8 + i * 5} l ${w - 14 - (i % 2) * 4} 0`} stroke={P.inkSoft} strokeWidth={1.6 / s} strokeLinecap="round" />
      ))}
    </g>
  );
};

// ======================= i · the handful =======================
// Kept for chapter vii's callback (take1c-spreads-b.tsx), which still draws the old even row with Strings.
export const HANDFUL_FIGS = [{ x: 190, c: 82 }, { x: 380, c: 108 }, { x: 570, c: 90 }, { x: 950, c: 116 }, { x: 1140, c: 94 }, { x: 1330, c: 78 }];
const LEDGE_Y = 490, FIG_S = 1.1;
const BAR_Y = LEDGE_Y - 112 * FIG_S;
export const HANDFUL_PEOPLE = HANDFUL_FIGS.flatMap((f) => [f.x - 46, f.x + 46]);
const HAIR = ['tuft', 'bun', 'cap', 'curly', 'bob', 'long'] as const;

/** How hard the strings are yanked right now: the same jolt for everyone, at the narrator's beats. */
export const yankAt = (t: number, beats: number[]) => beats.reduce((s, b) => s + jolt(t, b, 1, 0.55), 0);

/** The puppet-master composition as chapter vii's callback draws it (unchanged; chapter i has its own, below). */
export const Strings: React.FC<{
  figA: number; peopleA: number; stringsA: number; beats: number[]; colourful?: boolean; snapAt?: number; fadeFrom?: number; fadeTo?: number;
  figAt?: number[]; figEnter?: Enter[]; peopleEnter?: Enter; ledgeAt?: [number, number];
  punch?: number; stagger?: number;
}> = ({ figA, peopleA, stringsA, beats, colourful, snapAt, fadeFrom, fadeTo, figAt, figEnter, peopleEnter = 'draw', ledgeAt, punch = 1, stagger = 0 }) => {
  const t = useT();
  const yOf = (j: number) => yankAt(t, beats.map((b) => b + j * stagger)) * punch;
  const fade = fadeFrom == null ? 0 : lin(t, fadeFrom, fadeTo ?? fadeFrom + 1, EASE_IN_OUT);
  const hairCol = [P.ink, P.purple, P.ink, P.pink, P.ink, P.violet];
  const byOf = (j: number) => BAR_Y - yOf(j) * 14;
  return (
    <>
      <g opacity={1 - fade * 0.75}>
        {[[90, 690], [830, 1430]].map(([x0, x1], i) => {
          const la = ledgeAt ? ledgeAt[i] : figA - 0.25 + i * 0.1;
          return (
            <g key={i}>
              <Shape d={`M ${x0} ${LEDGE_Y} L ${x1} ${LEDGE_Y} L ${x1 - 8} ${LEDGE_Y + 34} L ${x0 + 8} ${LEDGE_Y + 34} Z`} a={la + 0.05} b={la + 0.7} fill="url(#c-hatch)" w={3} />
              <Ink d={`M ${x0 - 10} ${LEDGE_Y} L ${x1 + 10} ${LEDGE_Y}`} a={la} b={la + 0.6} w={4.5} />
            </g>
          );
        })}
      </g>
      {HANDFUL_FIGS.map((f, j) => (
        <g key={j}>
          <HatFigure x={f.x} y={LEDGE_Y} s={FIG_S} crown={f.c} a={figAt ? figAt[j] : figA + j * 0.14} b={(figAt ? figAt[j] : figA + j * 0.14) + (figEnter?.[j] === 'wipe' ? 0.5 : 1.0)}
            pose="hold" fade={fade} bob={-yOf(j) * 4 - Math.abs(Math.sin(t * 1.9 + j * 1.3)) * 1.6} lean={Math.sin(t * 1.5 + j * 2.1) * 1.1 + yOf(j) * 2.5} enter={figEnter?.[j] ?? 'draw'} hatSx={punch !== 1 ? [1, 1.28, 0.88, 1.16, 0.96, 1.34][j] : 1} />
          <g opacity={1 - fade * 0.72}>
            <Ink d={`M ${f.x - 54} ${byOf(j)} L ${f.x + 54} ${byOf(j)} M ${f.x} ${byOf(j) - 12} L ${f.x} ${byOf(j) + 12}`} a={stringsA - 0.4 + j * 0.05} b={stringsA - 0.1 + j * 0.05} w={5} />
          </g>
        </g>
      ))}
      {HANDFUL_PEOPLE.map((px, i) => {
        const f = HANDFUL_FIGS[Math.floor(i / 2)];
        const mj = Math.floor(i / 2), yj = yOf(mj), by = byOf(mj);
        const hx = f.x + (i % 2 ? 50 : -50), hy = by;
        const ty = 834 - yj * 12;
        const snapT = snapAt == null ? -1 : snapAt + 0.05 + i * 0.09;
        const sp = snapT < 0 ? 0 : lin(t, snapT, snapT + 0.5);
        const mx = hx + (px - hx) * 0.5, my = hy + (ty - hy) * 0.5;
        const top = `M ${hx} ${hy} Q ${mx + 14 * sp} ${(hy + my) / 2} ${mx + (hx - mx) * sp + 10 * Math.sin(sp * Math.PI)} ${my + (hy - my) * sp}`;
        const bot = `M ${mx + (px - mx) * sp - 8 * Math.sin(sp * Math.PI)} ${my + (ty - my) * sp} Q ${mx - 12 * sp} ${(my + ty) / 2} ${px} ${ty}`;
        const free = snapT >= 0 && t >= snapT;
        const hop = free ? -Math.abs(Math.sin((t - snapT) * 7)) * 18 * Math.exp(-(t - snapT) * 1.4) : 0;
        return (
          <g key={i}>
            {snapT < 0 || t < snapT ? <Ink d={`M ${hx} ${hy} L ${px} ${ty}`} a={stringsA + i * 0.035} b={stringsA + i * 0.035 + 0.4} w={3} c={P.ink} o={0.85} />
              : <g opacity={(1 - sp * 0.85) * 0.8}><path d={top} stroke={P.ink} strokeWidth={3} fill="none" /><path d={bot} stroke={P.ink} strokeWidth={3} fill="none" /></g>}
            <Person x={px} y={880} s={0.92} a={peopleA + i * 0.05} b={peopleA + i * 0.05 + 0.6} pose={free ? 'bothUp' : 'hold'} device={colourful ? 'none' : 'phone'} enter={peopleEnter}
              hair={HAIR[i % HAIR.length]} mood={colourful ? 'smile' : 'flat'} bob={-yj * 12 + hop} body={colourful ? NEUTRAL[i] : P.wash} hairColor={colourful ? hairCol[i % hairCol.length] : undefined} />
            {colourful && <g transform={`translate(${px + (free ? 21 : 8)} ${880 + hop - (free ? 86 : 38)})`}><Quill x={0} y={0} s={0.3} r={free ? 20 : 0} /></g>}
          </g>
        );
      })}
    </>
  );
};

// ---- chapter i's own staging ----
// WHY a lower ledge and capped hats (review: the chapter title almost touched a crown): the tallest hat stops ~70 px
// under the title band. WHY six different men (review BLOCKER: six copies of one cut-out): each has his own face,
// hat height and width, and his own timing.
const LEDGE = 560, MS = 1.05, PS = 1.1, FLOOR1 = 888;
// WHY a long bar held out at chest height (first look: a short bar under the chin read as a yoke, and its strings ran
// down over the black coat where nobody could see them): the strings now fall clear of the body on both sides
const BH = 58, BY = -128;           // the control bar: half its width and its height, in a man's own units
type Man = { x: number; c: number; face: Face; sx: number; at: number };
const MEN: Man[] = [
  { x: 150, c: 104, face: 'monocle', sx: 1.0, at: Q.handful - 0.22 },
  // the opening man: alone on the page, he lands on the narrator's first word
  { x: 385, c: 120, face: 'smug', sx: 1.14, at: Q.for - 0.02 },
  { x: 620, c: 88, face: 'cigar', sx: 0.94, at: Q.handful - 0.06 },
  { x: 880, c: 112, face: 'moustache', sx: 1.06, at: Q.corporations1 + 0.26 },
  { x: 1115, c: 122, face: 'smug', sx: 1.22, at: Q.corporations1 + 0.36 },
  { x: 1350, c: 98, face: 'grin', sx: 0.96, at: Q.corporations1 + 0.46 },
];
/** Where man j's control bar is now: dy (figure units, + down) and its tilt in degrees. */
const barOf = (t: number, j: number) => {
  // a marionette master is never still: a slow idle bob and rock
  let dy = Math.sin(t * 2.1 + j * 1.7) * 1.6, rot = Math.sin(t * 1.3 + j) * 2;
  // "dictated": the strings go taut and each man yanks once, the one in the middle of the close-up first
  dy += yank(t, Q.dictated + 0.3 + [0.12, 0.16, 0.2, 0.08, 0, 0.05][j], 1);
  // "interact": the right-hand three conduct their people, bars rocking against each other
  if (j >= 3) { const u = (t - (Q.interact - 0.08)) / 0.85; if (u > 0 && u < 1) rot += (j % 2 ? 1 : -1) * 24 * Math.sin(u * Math.PI * 2) * Math.sin(u * Math.PI); }
  else dy += yank(t, Q.interact + 0.08 + j * 0.07, 0.8);
  // "technology": everyone at once, rippling out from the gutter
  dy += yank(t, Q.technology1 + 0.04 + Math.abs(j - 2.5) * 0.04, 1.15);
  return { dy, rot };
};
const leanOf = (t: number, j: number, dy: number) => {
  // WHY the two on the right lean in to each other after "technology" (review: nothing read as smug or scheming)
  const share = lin(t, Q.technology1 + 0.4, Q.technology1 + 0.7, EASE_OUT) * (j === 4 ? 7 : j === 5 ? -8 : 0);
  return Math.sin(t * 1.4 + j * 2.1) * 1 - dy * 0.12 + share;
};
const barEnd = (j: number, k: number, dy: number, rot: number, place: Place): [number, number] => {
  const r = (rot * Math.PI) / 180, side = k ? 1 : -1;
  return toPage(side * BH * Math.cos(r), BY + dy + side * BH * Math.sin(r), place);
};

/** "more than a decade": a tear-off calendar runs from 2014 to 2026 beside the first man, a leaf per year. */
const YEARS = Array.from({ length: 13 }, (_, i) => 2014 + i);
const Calendar: React.FC<{ x: number; y: number }> = ({ x, y }) => {
  const t = useT();
  // WHY these times: the first leaf goes on "decade" and the last lands as she says "handful", so the years are
  // visibly gone by the time there is a handful of them
  const flips = YEARS.slice(1).map((_, i) => Q.decade - 0.08 + i * 0.068);
  const n = flips.filter((f) => t >= f).length;
  const Wd = 92, Hd = 100;
  const leaf = (year: number, k: number) => (
    <g>
      <rect x={-Wd / 2} y={0} width={Wd} height={Hd} fill={k < 0 ? P.paperShade : P.paper} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
      {k >= 0 && <text x={0} y={Hd * 0.66} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={31} letterSpacing="-0.04em" fill={P.ink}>{year}</text>}
    </g>
  );
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* the nail and its loop of string */}
      <circle cx={0} cy={-34} r={3.5} fill={P.ink} />
      <path d={`M 0 -34 L -26 2 M 0 -34 L 26 2`} stroke={P.ink} strokeWidth={W.detail} fill="none" />
      {leaf(YEARS[n], 1)}
      {/* the leaf that just went flips up over the binding and away: never more than two in the air */}
      {[n - 1, n - 2].map((i) => {
        if (i < 0) return null;
        const u = lin(t, flips[i], flips[i] + 0.2, EASE_IN);
        if (u >= 1) return null;
        const sy = Math.cos(u * Math.PI);
        return <g key={i} transform={`translate(${u * 14} ${-u * 10}) rotate(${-u * 20}) scale(1 ${sy})`} opacity={1 - Math.max(0, u - 0.7) / 0.3}>{leaf(YEARS[i], sy >= 0 ? 1 : -1)}</g>;
      })}
      {/* the binding strip across the top */}
      <rect x={-Wd / 2 - 3} y={-8} width={Wd + 6} height={14} rx={2} fill={P.ink} />
      {[-24, 24].map((cx) => <circle key={cx} cx={cx} cy={-1} r={2.6} fill={P.paper} />)}
    </g>
  );
};

const HandfulArt: React.FC = () => {
  const t = useT();
  // WHY the title and page numbers arrive once, on the first wide (review BLOCKER: they blinked on and off three times)
  const furniture = lin(t, Q.corporations1 + 0.12, Q.corporations1 + 0.5);
  const placeOf = (j: number, dy: number): Place => {
    const m = MEN[j];
    return { x: m.x, y: LEDGE - Math.max(0, -dy) * 0.25, s: MS, lean: leanOf(t, j, dy) };
  };
  return (
  <>
    <div style={{ opacity: furniture }}><Heading n="i" title="a small handful" /><Folio left={2} /></div>
    <Sheet>
      {/* the two ledges, printed before the film starts: frame 0 is a still life, not a half-drawn mark */}
      {[[90, 690], [830, 1430]].map(([x0, x1], i) => (
        <g key={i}>
          <path d={`M ${x0} ${LEDGE} L ${x1} ${LEDGE} L ${x1 - 8} ${LEDGE + 30} L ${x0 + 8} ${LEDGE + 30} Z`} fill="url(#c-hatch)" stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
          <path d={`M ${x0 - 10} ${LEDGE} L ${x1 + 10} ${LEDGE}`} stroke={P.ink} strokeWidth={4.5} strokeLinecap="round" />
        </g>
      ))}
      <Calendar x={268} y={300} />
      {MEN.map((m, j) => {
        const { dy, rot } = barOf(t, j);
        const pl = placeOf(j, dy);
        const ends = [0, 1].map((k) => {
          const r = (rot * Math.PI) / 180, side = k ? 1 : -1;
          return [side * BH * Math.cos(r), BY + dy + side * BH * Math.sin(r)] as [number, number];
        });
        return (
          <PopIn key={j} at={m.at} x={m.x} y={LEDGE}>
            <HatFigure x={pl.x} y={pl.y} s={MS} crown={m.c} hatSx={m.sx} face={m.face} a={-10} b={-9} pose="hold" lean={pl.lean} hands={ends} />
            {/* the control bar in both hands, with its short cross-piece */}
            <g transform={`translate(${pl.x} ${pl.y}) scale(${MS}) rotate(${pl.lean})`}>
              <g transform={`translate(0 ${BY + dy}) rotate(${rot})`}>
                {/* WHY a pale wooden bar with an ink outline: a plain ink line vanished against the black coat */}
                <rect x={-BH - 12} y={-5} width={2 * BH + 24} height={10} rx={5} fill={P.paperShade} stroke={P.ink} strokeWidth={W.outline / MS} />
                <rect x={-5} y={-16} width={10} height={32} rx={5} fill={P.paperShade} stroke={P.ink} strokeWidth={W.outline / MS} />
              </g>
            </g>
          </PopIn>
        );
      })}
      {MEN.flatMap((m, j) => [0, 1].map((k) => {
        const i = j * 2 + k;
        const rest = barEnd(j, k, 0, 0, { x: m.x, y: LEDGE, s: MS });
        const { dy, rot } = barOf(t, j);
        const end = barEnd(j, k, dy, rot, placeOf(j, dy));
        // the string pulls the phone up, and the person hangs from it: slack strings do nothing
        const lift = Math.max(0, rest[1] - end[1]) * 1.8;
        const flip = k === 1;
        const px = rest[0] + (flip ? 24 : -24) * PS;
        const hand: [number, number] = [rest[0], FLOOR1 - lift - 100 * PS];
        const tablet = i === 3 || i === 8;
        const pAt = j >= 3 ? m.at + 0.1 + k * 0.06 : Q.corporations1 + 0.02 + i * 0.03;
        const sA = Q.dictated - 0.06 + Math.abs(j - 3.5) * 0.025 + k * 0.02;
        return (
          <g key={i}>
            <Ink d={`M ${end[0]} ${end[1]} L ${hand[0]} ${hand[1] - (tablet ? 13 : 15) * PS}`} a={sA} b={sA + 0.28} w={W.detail} />
            <PopIn at={pAt} x={px} y={FLOOR1}>
              <Person x={px} y={FLOOR1} s={PS} a={-10} b={-9} pose="up" flip={flip} hair={HAIR[i % HAIR.length]} body={P.wash}
                mood={lift > 5 ? 'o' : 'flat'} bob={-lift} tilt={(flip ? -1 : 1) * lift * 0.3} />
              <Phone x={hand[0]} y={hand[1]} s={PS} r={(flip ? -1 : 1) * lift * 0.4} tablet={tablet} />
            </PopIn>
          </g>
        );
      }))}
    </Sheet>
  </>
  );
};
export const HANDFUL: Spread = { id: 'handful', Art: HandfulArt };

// ======================= ii · the rules =======================
/** Keepsakes travelling along a curve into the top hat (chapter ii) or back out of it (chapter vi's panel). */
export const Stream: React.FC<{ from: number; p0: [number, number]; p1: [number, number]; p2: [number, number]; count?: number; gap?: number; dur?: number; s?: number; reverse?: boolean; until?: number; kinds?: Keepsake[] }> = ({ from, p0, p1, p2, count = 9, gap = 0.2, dur = 1.25, s = 1, reverse, until = 1e9, kinds = ['photo', 'letter', 'heart', 'pin', 'calendar'] }) => {
  const t = useT();
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const start = from + i * gap;
        if (start > until) return null;
        let u = (t - start) / dur;
        if (u <= 0 || u >= 1) return null;
        u = EASE_IN_OUT(u);
        const pos = reverse ? 1 - u : u;
        const [x, y] = bez2(p0, p1, p2, pos);
        const shrink = 1 - 0.55 * Math.max(0, (pos - 0.75) / 0.25);
        return <KeepsakeIcon key={i} kind={kinds[i % kinds.length]} x={x} y={y} s={s * shrink * 1.05} r={Math.sin(i * 2.1 + t * 3) * 14} />;
      })}
    </>
  );
};

/** A padlock drawn in the book's line (review: the soft grey block read as pasted on). `shut` 0 open … 1 locked. */
const LockInk: React.FC<{ x: number; y: number; s?: number; shut: number; sq?: number; r?: number }> = ({ x, y, s = 1, shut, sq = 0, r = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s * (1 + sq * 0.18)} ${s * (1 - sq * 0.2)})`}>
    <path d={`M -10 -10 L -10 ${-24 - (1 - shut) * 12} a 10 10 0 0 1 20 0 L 10 ${-10 - (1 - shut) * 12}`} fill="none" stroke={P.ink} strokeWidth={4.4 / s} strokeLinecap="round" />
    <rect x={-16} y={-14} width={32} height={27} rx={4} fill={P.wash} stroke={P.ink} strokeWidth={W.outline / s} />
    <circle cx={0} cy={-3} r={3.2} fill={P.ink} /><path d="M 0 -1 L 0 6" stroke={P.ink} strokeWidth={2.6 / s} strokeLinecap="round" />
  </g>
);
const KeyInk: React.FC<{ x: number; y: number; r: number; s?: number }> = ({ x, y, r, s = 1 }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    <circle cx={0} cy={11} r={5.5} fill={P.paper} stroke={P.ink} strokeWidth={2.4} />
    <path d="M 0 5 L 0 -8 M 0 -4 L 4 -4" stroke={P.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />
  </g>
);
/** A rubber stamp in a hand: knob, stem and inked block; drawn with its face pointing along -x. */
const StampInk: React.FC<{ x: number; y: number; r?: number }> = ({ x, y, r = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${r})`}>
    <circle cx={22} cy={0} r={7} fill={P.wash} stroke={P.ink} strokeWidth={W.outline} />
    <path d="M 15 0 L 4 0" stroke={P.ink} strokeWidth={5} strokeLinecap="round" />
    <rect x={-8} y={-16} width={12} height={32} rx={2} fill={P.wash} stroke={P.ink} strokeWidth={W.outline} />
    <path d="M -10 -14 L -10 14" stroke={P.ink} strokeWidth={4} strokeLinecap="round" />
  </g>
);

/** One price at a time, each stamped on (review: the cross-fades left a doubled, ghosted number). */
const StampedTag: React.FC<{ x: number; y: number; s: number; prices: { v: string; at: number }[] }> = ({ x, y, s, prices }) => {
  const t = useT();
  const cur = prices.filter((q) => t >= q.at).length - 1;
  // the tag squashes for two frames under each stamp and swings back on its string
  const hit = prices.reduce((sum, q) => sum + (t >= q.at && t < q.at + 0.07 ? 1 : 0), 0);
  const swing = prices.reduce((sum, q) => sum + jolt(t, q.at, 7, 0.6), 0);
  return (
    <g transform={`translate(${x} ${y}) rotate(${-4 + swing}) scale(${s})`}>
      <path d="M 0 -34 L 0 0" stroke={P.ink} strokeWidth={W.detail / s} />
      <g transform={`scale(${1 + hit * 0.05} ${1 - hit * 0.08})`} style={{ transformOrigin: '0px 0px' }}>
        <path d="M -112 0 L 112 0 L 112 112 L -112 112 Z" fill={P.paper} stroke={P.ink} strokeWidth={W.outline / s} strokeLinejoin="round" />
        <circle cx={0} cy={16} r={6} fill="none" stroke={P.ink} strokeWidth={W.detail / s} />
        {cur >= 0 && (
          // WHY a dollar sign and a small "/mo": "4.99" alone is a number; "$4.99/mo" is a bill that never ends
          <text x={0} y={86} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={56} fill={P.ink} letterSpacing="-0.045em"
            transform={`rotate(${[-2, 2.5, -1.5, 3][cur % 4]} 0 70)`}>
            ${prices[cur].v.replace('/mo', '')}<tspan fontSize={26} fontWeight={700} dx={4}>/mo</tspan>
          </text>
        )}
      </g>
    </g>
  );
};

const RulesArt: React.FC = () => {
  const t = useT();
  // WHY printed before the leaf falls (review BLOCKER: "They decided" played over a near-blank page): only the padlock,
  // the stamps and the keepsakes happen live
  const L = TURN.rules - 1.4;
  // "decided": he stamps once and every drawing on the spread jumps
  const rap = jolt(t, Q.decided + 0.02, 1, 0.4);

  // ---- A: what your computers could do ----
  // WHY he stands close and the lock hooks the lid's right edge (first look: his arm stretched like rubber across the table)
  const manA: Place = { x: 515, y: 440, s: 1, flip: true };
  const reach0 = Q.computersDo + 0.04, slam = Q.do - 0.02;
  const reachK = lin(t, reach0, slam - 0.1, EASE_IN_OUT);
  const leanA = -3 * lin(t, reach0 - 0.1, reach0) + 13 * lin(t, reach0, slam - 0.15, EASE_OUT) - 10 * lin(t, Q.do + 0.45, Q.do + 0.75, EASE_IN_OUT) + jolt(t, Q.decided, 4, 0.4);
  manA.lean = leanA;
  const lockStart = toPage(42, -96, manA);
  const target: [number, number] = [402, 336], hover: [number, number] = [410, 294];
  const lockPos: [number, number] = t < slam - 0.1 ? bez2([lockStart[0], lockStart[1] + 18], [470, 250], hover, reachK)
    : t < slam ? mix2(hover, target, lin(t, slam - 0.1, slam, EASE_IN)) : target;
  const shut = lin(t, slam, slam + 0.05);
  const sq = t >= slam && t < slam + 0.1 ? 1 : 0;
  const shakeA = jolt(t, slam, 4, 0.4);
  // the key: in the lock, turned, then carried to his waistcoat pocket and patted
  const keyTurn = lin(t, Q.do + 0.14, Q.do + 0.28, EASE_IN_OUT);
  const keyOut = lin(t, Q.do + 0.36, Q.do + 0.6, EASE_IN_OUT);
  const pocket = toPage(18, -118, manA);
  const keyAt: [number, number] = t < slam ? [lockPos[0], lockPos[1] + 22] : mix2([target[0], target[1] + 22], pocket, keyOut);
  const handA: [number, number] = t < slam ? [lockPos[0], lockPos[1] - 6] : keyOut > 0 ? keyAt : [keyAt[0] + 8, keyAt[1] + 6];
  const patA = jolt(t, Q.do + 0.62, 5, 0.4);
  const reachW = t > slam + 0.12 && t < Q.do + 0.5;

  // ---- B: what it would cost ----
  const manB: Place = { x: 640, y: 900, s: 1, flip: true };
  const prices = [{ v: '4.99/mo', at: Q.cost - 0.02 }, { v: '9.99/mo', at: Q.costWord }, { v: '14.99/mo', at: Q.costWord + 0.36 }, { v: '19.99/mo', at: Q.costWord + 0.72 }];
  const TAG = { x: 478, y: 692, s: 0.72 };
  const face: [number, number] = [TAG.x + 4, TAG.y + 40];
  const restB = toPage(44, -96, manB);
  // the stamp swings in to the tag on each price and back out
  const press = prices.reduce((m, q) => Math.max(m, lin(t, q.at - 0.12, q.at, EASE_IN) * (1 - lin(t, q.at + 0.05, q.at + 0.22, EASE_OUT))), 0);
  const stampAt = mix2(restB, [face[0] + 52, face[1]], press);
  const stunned = t > prices[2].at + 0.05;

  // ---- C: what happened with your personal data ----
  const manC: Place = { x: 1330, y: 880, s: 1.25, flip: true };
  const CROWN_C = 112;
  const hatOff = lin(t, Q.data + 0.02, Q.data + 0.3, EASE_IN_OUT);
  const hatBack = lin(t, Q.personalData + 0.28, Q.personalData + 0.48, EASE_IN_OUT);
  const offK = hatOff * (1 - hatBack);
  const headHat = toPage(0, -212, manC);
  const handOut: [number, number] = [1210, 700];
  const N = 4, GAP = 0.15, DUR = 0.55, FROM = Q.data + 0.36;
  const landAt = (i: number) => FROM + i * GAP + DUR;
  const gulp = Array.from({ length: N }).reduce<number>((s, _, i) => s + Math.max(0, jolt(t, landAt(i) - 0.02, 10, 0.3)), 0);
  const hatPos = mix2(headHat, [handOut[0], handOut[1] + 6 + gulp], offK);
  // WHY 155 not 180, and a little smaller in the hand: tipped toward her, its open mouth shows, so it reads as a hat held out to catch
  const hatRot = 155 * EASE_OUT(Math.min(1, offK * 1.08));
  const handC: [number, number] = offK > 0.02 ? [hatPos[0], hatPos[1] - 4 * (1 - offK)] : t > Q.personalData + 0.48 ? toPage(-2, -228 + jolt(t, Q.personalData + 0.52, 6, 0.4), manC) : toPage(34, -112, manC);
  const phone: [number, number] = [966, 740];
  const left = Array.from({ length: N }).filter((_, i) => t < FROM + i * GAP + 0.05).length;
  const kinds: Keepsake[] = ['family', 'diary', 'housekey', 'note'];

  return (
    <>
      {/* WHY no fade (review: the heading blinked): the camera simply leaves it at the first cut-in */}
      <Heading n="ii" title="what they decided" />
      <Folio left={4} />
      <Sheet>
        <g transform={`translate(0 ${rap * 5})`}>
        {/* A: a padlock snapped on her laptop; the key goes in his pocket */}
        <Ink d="M 110 440 L 680 440" a={L} b={L + 0.3} w={W.ground} c={P.inkSoft} />
        <Ink d="M 270 360 L 470 360 M 290 360 L 290 440 M 450 360 L 450 440" a={L} b={L + 0.3} w={W.outline} />
        <g transform={`translate(${shakeA} ${Math.abs(shakeA) * -0.5})`}><Laptop x={370} y={358} s={1.15} a={L} b={L + 0.3} /></g>
        <Person x={205} y={440} s={1.12} a={L} b={L + 0.4} pose={reachW ? 'write' : 'down'} mood={t > slam ? 'o' : 'smile'} hair="bun"
          bob={-Math.abs(jolt(t, slam, 6, 0.35)) + (t > Q.do + 0.5 ? lin(t, Q.do + 0.5, Q.do + 0.7) * 3 : 0)} look={t > slam ? 2 : 0} />
        <HatFigure x={manA.x} y={manA.y} s={1} crown={92} a={L} b={L + 0.5} pose="hold" flip face="moustache" lean={leanA}
          bob={-Math.abs(jolt(t, Q.decided, 7, 0.4)) + patA * 0.5} hands={[[-38, -96], toLocal(handA[0], handA[1], manA)]} />
        {t > L + 0.5 && <LockInk x={lockPos[0]} y={lockPos[1]} s={1.3} shut={shut} sq={sq} r={t < slam ? Math.sin(t * 9) * 8 * (1 - reachK) : 0} />}
        {t > L + 0.5 && keyOut < 0.98 && <KeyInk x={keyAt[0]} y={keyAt[1]} r={90 * keyTurn + keyOut * 40} s={1.2} />}
        </g>

        <g transform={`translate(0 ${rap * 4})`}>
        {/* B: the price, stamped dearer on every beat by the man who owns the price board */}
        <Ink d="M 100 900 L 700 900" a={L} b={L + 0.3} w={W.ground} c={P.inkSoft} />
        <Ink d="M 120 812 L 270 812 M 135 812 L 135 900 M 255 812 L 255 900" a={L} b={L + 0.3} w={W.outline} />
        <Laptop x={195} y={810} s={1.15} a={L} b={L + 0.3} />
        {/* the price board: a post and an arm */}
        <Ink d={`M 580 900 L 580 664 L ${TAG.x - 6} 664 M 580 688 L 556 664`} a={L} b={L + 0.4} w={W.outline} />
        <StampedTag x={TAG.x} y={TAG.y - 14} s={TAG.s} prices={prices} />
        <Person x={330} y={900} s={1.12} a={L} b={L + 0.4} hair="curly" mood={stunned ? 'o' : 'flat'} look={2.5}
          bob={-prices.reduce((sum, q, i) => sum + Math.abs(jolt(t, q.at + 0.03, 3 + i * 2.5, 0.35)), 0)} />
        <HatFigure x={manB.x} y={manB.y} s={1} crown={100} a={L} b={L + 0.5} pose="hold" flip face="cigar" lean={press * 6}
          hands={[[-38, -96], toLocal(stampAt[0] + 18, stampAt[1], manB)]} />
        <StampInk x={stampAt[0]} y={stampAt[1]} r={0} />
        </g>

        {/* C: her things lift out of her phone and drop into the hat he holds out */}
        <Ink d="M 820 880 L 1450 880" a={L} b={L + 0.3} w={W.ground} c={P.inkSoft} />
        <Person x={930} y={880} s={1.35} a={L} b={L + 0.4} pose="up" hair="long" mood={t > FROM + 0.1 ? (left === 0 ? 'flat' : 'o') : 'smile'}
          look={t > FROM + 0.1 && left > 0 ? 3 : 1.5} />
        <Phone x={phone[0]} y={phone[1]} s={1.35} r={8} rows={left} />
        <HatFigure x={manC.x} y={manC.y} s={1.25} crown={CROWN_C} a={L} b={L + 0.5} pose="hold" flip face="monocle" hat={offK < 0.02}
          lean={offK * 6 + jolt(t, Q.personalData + 0.48, 3, 0.4)} hands={[[-40, -96], toLocal(handC[0], handC[1], manC)]} />
        {offK >= 0.02 && <g transform={`translate(${hatPos[0]} ${hatPos[1]}) rotate(${-hatRot}) scale(${(1.25 - 0.3 * offK) * (1 + Math.max(0, gulp) * 0.012)} ${(1.25 - 0.3 * offK) * (1 - Math.max(0, gulp) * 0.01)})`}><TopHat crown={CROWN_C} />
          {/* WHY the open mouth once it is upside down: without it the hat read as a black box, not a hat held out to catch */}
          {hatRot > 110 && <ellipse cx={0} cy={-2} rx={22} ry={8} fill={P.inkSoft} stroke={P.paperShade} strokeWidth={1.6} />}</g>}
        {Array.from({ length: N }).map((_, i) => {
          const u0 = (t - (FROM + i * GAP)) / DUR;
          if (u0 <= 0 || u0 >= 1) return null;
          const u = EASE_IN_OUT(u0);
          const [x, y] = bez2([phone[0], phone[1] - 8], [1085, 420 + i * 12], [handOut[0], handOut[1] + 16], u);
          const sc = 1.75 * Math.min(1, 0.35 + u0 * 3) * (1 - 0.5 * Math.max(0, (u0 - 0.8) / 0.2));
          return <KeepsakeIcon key={i} kind={kinds[i]} x={x} y={y} s={sc} w={2.6 / sc} r={Math.sin(i * 2.1 + t * 4) * 12} />;
        })}
      </Sheet>
    </>
  );
};
export const RULES: Spread = { id: 'rules', Art: RulesArt };

// ======================= iii · the bargain =======================
// WHY a queue that winds back into the page (review: line 1's side-on row again): the people shrink toward the far
// end, so the line has depth, and the scroll unrolls from the lectern back past every pair of feet.
const FAR: [number, number] = [150, 520], NEAR: [number, number] = [1150, 800];
const along = (d: number): [number, number] => mix2(FAR, NEAR, d);
// WHY a steep size change (0.45 far, 1.25 near): it is the depth, not the slope, that must read
const depth = (d: number) => 0.45 + 0.8 * d;
const QD = Array.from({ length: 8 }, (_, i) => 0.06 + i * 0.122);
const BargainArt: React.FC = () => {
  const t = useT();
  const L = TURN.bargain - 1.2;
  const unroll = lin(t, land(TURN.bargain) - 0.1, Q.accepted - 0.4, EASE_IN_OUT);
  const dEnd = 1.04 - unroll * 1.12;
  const signAt = (i: number) => Q.accepted - 0.1 + (QD.length - 1 - i) * 0.085;
  // the scroll's edges along the floor: just in front of each pair of feet, thinner as it recedes
  const strip = (side: 0 | 1, from: number, to: number) => Array.from({ length: 41 }, (_, k) => {
    const d = from + ((to - from) * k) / 40;
    const [x, y] = along(d);
    const sc = depth(d);
    return `${k ? 'L' : 'M'} ${x.toFixed(1)} ${(y + (side ? 46 : 8) * sc + Math.sin(k * 1.3 + side) * 1.2).toFixed(1)}`;
  }).join(' ');
  const lean = QD.reduce((s, _, i) => s + jolt(t, signAt(i) - 0.1, 3, 0.3), 0);
  const rubbing = t > Q.it - 0.05;
  const rub = rubbing ? Math.sin((t - Q.it) * 30) * 5 : 0;
  const manB: Place = { x: 1312, y: 846, s: 1.35, flip: true, lean: 6 + lean };
  return (
    <>
      <Heading n="iii" title="what we accepted" />
      <Folio left={6} />
      <Sheet>
        {/* the man and his lectern, nearest the reader */}
        <HatFigure x={manB.x} y={manB.y} s={manB.s} crown={100} a={L} b={L + 0.5} pose="rub" flip face={t > signAt(QD.length - 1) ? 'grin' : 'smug'}
          lean={manB.lean} bob={jolt(t, Q.it, 5, 0.6)} hands={rubbing ? [[-6 + rub, -122], [6 - rub, -120]] : [[-30, -118], [34, -122]]} />
        <path d="M 1218 846 L 1352 846 L 1340 680 L 1230 680 Z" fill={P.paper} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
        <path d="M 1206 684 L 1366 668 L 1366 652 L 1206 668 Z" fill={P.wash} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
        {/* the scroll: over the lectern, down its front... */}
        {unroll > 0 && <path d="M 1236 672 L 1282 668 L 1282 838 Q 1282 852 1236 852 Z" fill={P.paper} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />}
        {unroll > 0 && [700, 722, 744, 766, 788, 810].map((y) => <path key={y} d={`M 1244 ${y} l 28 0`} stroke={P.inkSoft} strokeWidth={W.detail} opacity={0.5} />)}
        {/* ...and back along the queue, in front of everyone's feet */}
        {unroll > 0 && (() => {
          const [ex, ey] = along(dEnd), es = depth(dEnd);
          return (
            <g>
              <path d={`${strip(0, 1.04, dEnd)} ${strip(1, dEnd, 1.04).replace(/^M/, 'L')} Z`} fill={P.paper} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
              {Array.from({ length: 40 }).map((_, k) => {
                const d = 1.0 - k * 0.026;
                if (d < dEnd + 0.02) return null;
                const [x, y] = along(d), sc = depth(d);
                return <path key={k} d={`M ${x} ${y + 15 * sc} l ${-18 * sc} ${-5 * sc} M ${x} ${y + 40 * sc} l ${-14 * sc} ${-4 * sc}`} stroke={P.inkSoft} strokeWidth={W.detail} opacity={0.42} strokeLinecap="round" />;
              })}
              {/* the curl where it is still unrolling */}
              <path d={`M ${ex} ${ey + 8 * es} q ${-14 * es} ${6 * es} ${-10 * es} ${19 * es} q ${3 * es} ${15 * es} ${10 * es} ${19 * es}`} fill={P.paper} stroke={P.ink} strokeWidth={W.outline} />
            </g>
          );
        })()}
        <Appear a={L + 0.1}>
          <text x={1196} y={612} textAnchor="end" fontFamily={DMSANS} fontWeight={800} fontSize={30} fill={P.ink} letterSpacing="-0.02em">terms of service</text>
          <path d="M 1200 606 C 1226 616 1242 636 1252 662" stroke={P.ink} strokeWidth={W.detail} fill="none" strokeLinecap="round" />
        </Appear>
        {/* the queue, far end first so the nearer people overlap the farther */}
        {QD.map((d, i) => {
          const [x, y] = along(d), sc = depth(d);
          const sa = signAt(i);
          // WHY eyes to camera one by one on "we all..." (review: nothing happened in that pause): caught in the act
          const caught = lin(t, Q.andWeAll + 0.2 + (QD.length - 1 - i) * 0.1, Q.andWeAll + 0.34 + (QD.length - 1 - i) * 0.1);
          const back = lin(t, Q.accepted - 0.5, Q.accepted - 0.3);
          const look = 4 * (1 - caught) + 4 * back;
          const signing = t > sa - 0.15 && t < sa + 0.4;
          const bx = x - 24 * sc, by = y + 18 * sc, bw = 20 * sc;
          const printed = dEnd < d - 0.04;
          return (
            <g key={i}>
              <Person x={x} y={y} s={1.18 * sc} a={L} b={L + 0.4} hair={HAIR[i % HAIR.length]} pose={signing ? 'write' : 'down'}
                mood={caught > 0.5 && back < 0.5 ? 'o' : 'flat'} look={look} tilt={jolt(t, sa, 9, 0.5)} bob={-Math.abs(jolt(t, sa, 4, 0.4))} />
              {printed && (
                <g>
                  <rect x={bx} y={by} width={bw} height={bw} rx={3 * sc} fill={P.paper} stroke={P.ink} strokeWidth={W.detail} />
                  <text x={bx + bw + 6 * sc} y={by + bw * 0.82} fontFamily={DMSANS} fontWeight={800} fontSize={17 * sc} fill={P.ink} letterSpacing="-0.02em">I agree</text>
                  <Ink d={`M ${bx + 4 * sc} ${by + 10 * sc} L ${bx + 9 * sc} ${by + 16 * sc} L ${bx + 19 * sc} ${by + 2 * sc}`} a={sa} b={sa + 0.16} w={5 * sc} />
                </g>
              )}
            </g>
          );
        })}
      </Sheet>
    </>
  );
};
export const BARGAIN: Spread = { id: 'bargain', Art: BargainArt };

// ======================= (iii, cont.) own nothing / privacy =======================
const SmallTag: React.FC<{ x: number; y: number; at: number; text: string; lift: number; tip?: number }> = ({ x, y, at, text, lift, tip = 0 }) => {
  const t = useT();
  const p = Math.min(1, Math.max(0, (t - at) / 0.4));
  if (p <= 0) return null;
  const sway = Math.sin((t - at) * 5) * 10 * Math.exp(-(t - at) * 1.5);
  return (
    <g transform={`translate(${x} ${y - lift}) rotate(${sway - 4 + tip}) scale(1.3)`} opacity={Math.min(1, p * 2)}>
      {/* WHY this size: the camera cuts in on "subscribe"; the prices must read on a phone */}
      <path d="M 0 0 L 0 18" stroke={P.ink} strokeWidth={1.6} />
      <path d={`M -54 18 L 54 18 L 54 52 L -54 52 Z`} fill={P.paper} stroke={P.ink} strokeWidth={2.4} transform={`scale(${0.6 + 0.4 * p})`} />
      <text x={0} y={43} textAnchor="middle" fontSize={21} fontWeight={800} fill={P.ink} fontFamily={DMSANS} letterSpacing="-0.02em">{text}</text>
    </g>
  );
};

type Thing = { id: string; d: string; fill: string; tag: [number, number]; price: string; top: [number, number] };
const THINGS: Thing[] = [
  { id: 'bike', d: `${circle(132, 776, 42)} ${circle(246, 776, 42)} M 132 776 L 172 730 L 230 730 L 246 776 M 172 730 L 196 776 L 132 776 M 230 730 L 222 712 M 196 776 L 166 716 L 150 716`, fill: 'none', tag: [196, 610], price: '14.99/mo', top: [196, 610] },
  { id: 'picture', d: 'M 305 200 L 415 200 L 415 284 L 305 284 Z M 318 270 L 345 238 L 365 258 L 380 244 L 402 270', fill: P.paper, tag: [360, 296], price: '3.99/mo', top: [360, 200] },
  { id: 'books', d: 'M 432 420 L 432 362 L 452 362 L 452 420 M 454 420 L 454 352 L 476 352 L 476 420 M 478 420 L 482 368 L 500 370 L 497 420 M 502 420 L 502 358 L 522 358 L 522 420', fill: P.wash, tag: [440, 432], price: '2.99/mo', top: [478, 352] },
  { id: 'camera', d: 'M 572 420 L 572 384 L 588 384 L 594 374 L 616 374 L 622 384 L 640 384 L 640 420 Z M 594 402 a 12 12 0 1 0 24 0 a 12 12 0 1 0 -24 0', fill: P.wash, tag: [624, 432], price: '9.99/mo', top: [606, 374] },
  { id: 'record', d: 'M 508 720 L 632 720 L 632 696 L 508 696 Z M 528 696 a 42 9 0 1 0 84 0 a 42 9 0 1 0 -84 0 M 620 690 L 596 698', fill: P.wash, tag: [570, 734], price: '11.99/mo', top: [570, 686] },
];
// WHY back and arms apart: she sits between them (drawn over the back, under the arms)
const CHAIR_BACK = 'M 286 820 L 286 700 Q 286 660 330 660 L 400 660 Q 444 660 444 700 L 444 820 Z';
const CHAIR_ARMS = 'M 270 820 L 270 730 Q 270 716 286 716 L 300 716 L 300 820 Z M 430 820 L 430 716 L 446 716 Q 460 716 460 730 L 460 820 Z';
const CHAIR = `${CHAIR_BACK} ${CHAIR_ARMS}`;

/** How far a thing has been yanked up: a snag (string tightens, the thing tips) then an accelerating pull off the page.
 *  WHY no fade (review: things dissolved rather than being taken): they leave by the top of the frame. */
const yanked = (t: number, at: number) => {
  const x = t - at - 0.08;
  return x <= 0 ? 0 : Math.min(1400, x * x * 5200 + x * 400);
};
const tipOf = (t: number, at: number) => (t >= at && t < at + 0.12 ? Math.sin(((t - at) / 0.12) * Math.PI) * 7 : 0);

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
  // privacy: he pops up beside her, leaning in; her things float up out of her pocket and into his
  const manAt = Q.privacy - 0.12;
  const manN: Place = { x: 515, y: FLOOR, s: 1.12, flip: true, lean: 16 * (1 - pop(t, manAt + 0.05, 0.5)) - 4 };
  const ITEMS: Keepsake[] = ['diary', 'family', 'housekey'];
  const iFrom = Q.privacy + 0.22, iGap = 0.32, iDur = 0.85;
  const caught = ITEMS.reduce((s, _, i) => s + Math.max(0, jolt(t, iFrom + i * iGap + iDur, 7, 0.3)), 0);
  const pocketN = toPage(18, -118, manN);
  const takes = t > Q.costOf + 0.05;
  // WHY lowered at her side once she has it (first look: held up, the sign covered her face as her smile went)
  const signHand: [number, number] = takes ? [424, 842] : toPage(64, -92, manN);
  const scrolling = t < Q.subscribe ? Math.sin(t * 6) * 3 : 0;
  return (
    <>
      <Folio left={8} hideRight />
      <Sheet>
        <defs><clipPath id="c-floor-clip"><rect x={0} y={0} width={1520} height={FLOOR} /></clipPath></defs>
        <path d="M 150 840 Q 380 870 620 840 Q 380 812 150 840 Z" fill={P.paperShade} />
        <Ink d="M 70 820 L 690 820" a={L - 0.3} b={L + 0.2} w={W.ground} />
        <Shape d="M 120 205 L 270 205 L 270 380 L 120 380 Z" a={L - 0.2} b={L + 0.3} fill={P.paperShade} w={W.outline} />
        <Ink d="M 195 205 L 195 380 M 120 292 L 270 292 M 104 196 Q 112 300 100 392 M 286 196 Q 278 300 290 392 M 96 196 L 294 196" a={L} b={L + 0.4} w={W.detail} />
        <Ink d="M 420 420 L 665 420 M 440 420 L 440 440 M 645 420 L 645 440" a={L} b={L + 0.35} w={W.outline} />
        <Shape d="M 500 820 L 640 820 L 640 722 L 500 722 Z" a={L + 0.05} b={L + 0.4} fill={P.paper} w={W.outline} />
        <g transform={`translate(0 ${-chairLift}) rotate(${tipOf(t, chairAt) * -0.6} 365 660)`}><Shape d={CHAIR_BACK} a={L} b={L + 0.4} fill={P.wash} w={W.outline} /></g>
        {/* her, in the chair; then on the floor */}
        <g clipPath={landed ? 'url(#c-floor-clip)' : undefined}>
          <g transform={squash ? `translate(365 ${FLOOR}) scale(1.12 0.86) translate(-365 ${-FLOOR})` : undefined}>
            <Person x={365} y={landed ? FLOOR + 22 : herY} s={1.15} a={L + 0.15} b={L + 0.7} pose={takes ? 'write' : 'hold'} device={takes ? 'none' : 'phone'} hair="tuft"
              mood={t > Q.convenience + 0.05 ? 'flat' : t > Q.nothing + 0.05 && t < Q.privacy ? 'o' : 'smile'} bob={scrolling * 0.3} look={t > Q.privacy + 0.2 && !takes ? 2.5 : 0} />
          </g>
        </g>
        {/* sitting on the floor: legs out in front */}
        {landed && <path d="M 356 818 L 336 818 L 330 806 M 374 818 L 398 818 L 404 806" stroke={P.ink} strokeWidth={4.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
        {/* the armchair, tagged and then yanked out from under her */}
        <g transform={`translate(0 ${-chairLift}) rotate(${tipOf(t, chairAt) * -0.6} 365 660)`}>
          <Shape d={CHAIR_ARMS} a={L} b={L + 0.4} fill={P.wash} w={W.outline} />
          {(() => { const sp = lin(t, Q.own - 0.2, Q.own + 0.05); return sp > 0 ? <path d={`M 365 ${-40 + chairLift} L 365 660`} stroke={P.ink} strokeWidth={W.detail} pathLength={1} strokeDasharray="1 2" strokeDashoffset={1 - sp} /> : null; })()}
        </g>
        {t > chairAt + 0.2 && <path d={CHAIR} fill="none" stroke={P.inkSoft} strokeWidth={2} opacity={0.3 * lin(t, chairAt + 0.2, chairAt + 0.5) * (1 - lin(t, chairAt + 1.2, chairAt + 1.8))} />}
        {/* the things: tagged one by one, then snagged and yanked off the page */}
        {THINGS.map((th, i) => {
          const tagAt = Q.subscribe + i * 0.24;
          const liftAt = Q.own + i * 0.06;
          const lift = yanked(t, liftAt);
          const tip = tipOf(t, liftAt) * (i % 2 ? 1 : -1);
          const strP = lin(t, Q.own - 0.28 + i * 0.04, Q.own - 0.05 + i * 0.04);
          return (
            <g key={th.id}>
              {t > liftAt + 0.2 && <path d={th.d} fill="none" stroke={P.inkSoft} strokeWidth={2} opacity={0.3 * lin(t, liftAt + 0.2, liftAt + 0.5) * (1 - lin(t, liftAt + 1.4, liftAt + 2))} />}
              <g transform={`translate(0 ${-lift}) rotate(${tip} ${th.top[0]} ${th.top[1]})`}>
                <Shape d={th.d} a={L + 0.1 + i * 0.06} b={L + 0.6 + i * 0.06} fill={th.fill === 'none' ? undefined : th.fill} w={W.outline} />
                {strP > 0 && <path d={`M ${th.top[0]} ${-40 + lift} L ${th.top[0]} ${th.top[1]}`} stroke={P.ink} strokeWidth={W.detail} pathLength={1} strokeDasharray="1 2" strokeDashoffset={1 - strP} />}
              </g>
              <SmallTag x={th.tag[0]} y={th.tag[1]} at={tagAt} text={th.price} lift={lift} tip={tip} />
            </g>
          );
        })}
        {/* the cost of convenience: he offers "free", and her things leave her while she looks at it */}
        <PopIn at={manAt} x={manN.x} y={FLOOR} dur={0.42}>
          <HatFigure x={manN.x} y={FLOOR} s={manN.s} crown={104} a={-10} b={-9} pose="hold" flip face="grin" lean={manN.lean} bob={caught * 0.6}
            hands={[toLocal(pocketN[0] + 4, pocketN[1] + 6 - caught, manN), takes ? [40, -100] : [64, -92]]} />
        </PopIn>
        {t > manAt + 0.1 && (
          <g transform={`translate(${signHand[0]} ${signHand[1]}) rotate(${takes ? -6 : 4})`}>
            <path d="M 0 0 L 0 -26" stroke={P.ink} strokeWidth={W.outline} strokeLinecap="round" />
            <rect x={-40} y={-64} width={80} height={40} rx={4} fill={P.paper} stroke={P.ink} strokeWidth={W.outline} />
            <text x={0} y={-36} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={26} letterSpacing="-0.04em" fill={P.ink}>free</text>
          </g>
        )}
        {ITEMS.map((k, i) => {
          const u0 = (t - (iFrom + i * iGap)) / iDur;
          if (u0 <= 0 || u0 >= 1) return null;
          const [x, y] = bez2([352, herY - 30], [300, 430], [pocketN[0], pocketN[1]], EASE_IN_OUT(u0));
          const sc = 1.4 * Math.min(1, 0.4 + u0 * 3) * (1 - 0.55 * Math.max(0, (u0 - 0.8) / 0.2));
          return <KeepsakeIcon key={i} kind={k} x={x} y={y} s={sc} w={2.6 / sc} r={Math.sin(i * 1.7 + t * 3.5) * 12} />;
        })}
      </Sheet>
    </>
  );
};
export const NOTHING: Spread = { id: 'nothing', Art: NothingArt };

// ======================= iv · however =======================
// WHY one pen (review BLOCKER: a black hook in the well and a separate clip-art feather): a dip pen lies beside its
// inkwell. A single purple drop falls the whole length of "recently..." onto its nib; on "wonderful" the pen drinks
// it, turns purple from the nib up and rises; on "happened" it writes its first stroke, the nib on the line.
export const DROP_LAND = Q.recentlyEnd - 0.02;
const DROP_FROM = Q.recently + 0.02;
const NIB: [number, number] = [404, 612];
const PEN_LEN = 210;
/** The flourish the pen writes on "happened": one cubic with a loop, kept above and left of the headline. */
const FL = [[404, 600], [640, 660], [430, 440], [660, 520]] as [number, number][];
const flAt = (u: number): [number, number] => {
  const v = 1 - u;
  return [0, 1].map((k) => v * v * v * FL[0][k] + 3 * v * v * u * FL[1][k] + 3 * v * u * u * FL[2][k] + u * u * u * FL[3][k]) as [number, number];
};
const DipPen: React.FC<{ purple: number; drunk: number }> = ({ purple, drunk }) => {
  // pen drawn tip at 0,0 pointing down, the holder running up -y; `purple` 0..1 is how far the ink has run up it
  const id = 'c-pen-purple';
  const outline = 'M 0 0 L -6 -22 L -6 -36 L 6 -36 L 6 -22 Z';
  const ferrule = 'M -7 -36 L -8 -56 L 8 -56 L 7 -36 Z';
  const holder = `M -8 -56 C -10 -110 -6 ${-PEN_LEN + 30} -4 ${-PEN_LEN} Q 0 ${-PEN_LEN - 6} 4 ${-PEN_LEN} C 6 ${-PEN_LEN + 30} 10 -110 8 -56 Z`;
  const reach = -PEN_LEN * purple - 4;
  return (
    <g>
      <defs><clipPath id={id}><rect x={-20} y={reach} width={40} height={-reach + 2} /></clipPath></defs>
      <path d={holder} fill={P.wash} />
      <path d={ferrule} fill={P.paperShade} />
      <path d={outline} fill={P.paperShade} />
      <g clipPath={`url(#${id})`}>
        <path d={holder} fill={P.purple} /><path d={ferrule} fill={P.violet} /><path d={outline} fill={P.purple} />
      </g>
      {/* the outlines, slit and breather hole: the same ink as every other drawing */}
      <g fill="none" stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round">
        <path d={holder} /><path d={ferrule} /><path d={outline} />
      </g>
      <path d="M 0 -3 L 0 -20" stroke={P.ink} strokeWidth={1.6} /><circle cx={0} cy={-22} r={1.8} fill={P.ink} />
      {/* a bead of the drop still sitting on the nib until it is drunk */}
      {drunk < 1 && <ellipse cx={1} cy={-12} rx={7 * (1 - drunk)} ry={8 * (1 - drunk)} fill={P.purple} />}
    </g>
  );
};
const HoweverArt: React.FC = () => {
  const t = useT();
  const fallU = (t - DROP_FROM) / (DROP_LAND - DROP_FROM);
  const landed = t >= DROP_LAND;
  // the bloom: the drop soaks into the paper under the nib, slowly, through "something truly"
  const bloom = lin(t, DROP_LAND, Q.wonderful, EASE_OUT);
  const drink = lin(t, Q.wonderful + 0.06, Q.wonderful + 0.5, EASE_IN_OUT);
  // the pen: lying beside the well; a tremble on "truly"; on "wonderful" a dip, then a rise with overshoot
  const tremble = t > Q.wonderful - 0.6 && t < Q.wonderful ? Math.sin(t * 46) * 1.2 * lin(t, Q.wonderful - 0.6, Q.wonderful - 0.2) : 0;
  const dip = lin(t, Q.wonderful - 0.1, Q.wonderful, EASE_IN) * (1 - lin(t, Q.wonderful, Q.wonderful + 0.06));
  const rise = pop(t, Q.wonderful + 0.02, 0.7);
  const write = lin(t, Q.happened, Q.happened + 0.9, EASE_IN_OUT);
  const writing = t >= Q.happened;
  // where the nib is: on the page, then lifted, then on the stroke it is writing
  const lifted: [number, number] = [NIB[0] + 4, NIB[1] - 46];
  const tip: [number, number] = writing ? flAt(write) : mix2(NIB, lifted, Math.min(1.15, rise));
  const tan = writing ? (() => { const a = flAt(Math.max(0, write - 0.02)), b = flAt(Math.min(1, write + 0.02)); return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; })() : 0;
  // WHY lying at -62 and standing at -24: lying, the pen reads as at rest beside its well; standing, as held to write
  const angle = mix(-62 - dip * 4, -24, Math.min(1.1, rise)) + (writing ? Math.sin(tan * Math.PI / 180) * 6 : 0) + tremble;
  const purple = drink;
  const shadowOff = Math.min(1, rise) * 26;
  const pts = writing ? Array.from({ length: 61 }, (_, k) => flAt((k / 60) * write)) : [];
  return (
    <>
      {/* WHY held, not faded (review: it vanished 0.4 s after landing): the camera's push takes it out of frame */}
      <Heading n="iv" title="then, quietly" />
      <Folio left={10} hideRight />
      <Sheet rough={false}>
        {/* the inkwell, printed with the page */}
        <g transform="translate(250 560)">
          <path d="M -50 -60 L 50 -60 L 63 20 Q 63 42 41 42 L -41 42 Q -63 42 -63 20 Z" fill={P.wash} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
          <path d="M -54 -10 Q 0 -2 58 -10 L 62 18 Q 62 38 41 38 L -41 38 Q -62 38 -62 18 Z" fill={P.inkSoft} opacity={0.55} />
          <path d="M -32 -60 L -32 -78 L 32 -78 L 32 -60" fill={P.paper} stroke={P.ink} strokeWidth={W.outline} strokeLinejoin="round" />
          <path d="M -40 -40 L -36 10" stroke="#fff" strokeWidth={5} opacity={0.45} strokeLinecap="round" />
        </g>
        {/* the falling drop's shadow tightening under it, then the bloom it leaves */}
        {fallU > 0 && !landed && (() => {
          const near = Math.pow(Math.min(1, fallU), 2.2);
          return <ellipse cx={NIB[0] + 6} cy={NIB[1] + 4} rx={30 - 18 * near} ry={(30 - 18 * near) * 0.45} fill={P.ink} opacity={0.05 + 0.18 * near} />;
        })()}
        {landed && (
          <g opacity={1 - drink * 0.75}>
            <path d={blob(NIB[0] + 6, NIB[1] + 4, 8 + 26 * bloom, 5, 0.1, 22)} fill={P.purple} opacity={0.32} filter="url(#c-bleed)" />
            <path d={blob(NIB[0] + 6, NIB[1] + 4, 8 + 26 * bloom, 5, 0.1, 22)} fill="none" stroke={P.purple} strokeWidth={2.4} opacity={0.5} filter="url(#c-bleed)" />
          </g>
        )}
        {/* the first stroke, drawn by the nib as it moves */}
        {pts.length > 1 && <path d={`M ${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ')}`} stroke={P.purple} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
        {/* the pen's shadow stays on the paper as the pen lifts off it */}
        <g transform={`translate(${tip[0] + shadowOff * 0.9} ${tip[1] + shadowOff * 1.4 + (NIB[1] - tip[1]) * 0.9}) rotate(${angle}) scale(1, 1)`} opacity={0.12 + 0.06 * (1 - Math.min(1, rise))}>
          <path d={`M -6 0 L -9 ${-PEN_LEN} L 9 ${-PEN_LEN} L 6 0 Z`} fill={P.ink} filter="url(#c-bleed)" />
        </g>
        <g transform={`translate(${tip[0]} ${tip[1]}) rotate(${angle}) scale(${1 + Math.min(1, rise) * 0.08})`}>
          <DipPen purple={purple} drunk={drink} />
        </g>
        {/* the drop, a true teardrop that stretches as it speeds up, falling from the top of the frame onto the nib */}
        {fallU > 0 && !landed && (() => {
          const u = Math.pow(fallU, 2.2);
          const y = mix(150, NIB[1] - 30, u);
          const stretch = 1 + 0.9 * Math.min(1, (u - Math.pow(Math.max(0, fallU - 0.04), 2.2)) * 18);
          return (
            <g transform={`translate(${NIB[0] + 1} ${y}) scale(${1.7 / Math.sqrt(stretch)} ${1.7 * stretch})`}>
              <path d="M 0 -22 C 5 -12 13 -4 13 5 A 13 12 0 0 1 -13 5 C -13 -4 -5 -12 0 -22 Z" fill={P.purple} stroke={P.violet} strokeWidth={1.4} />
              <ellipse cx={-4} cy={2} rx={3} ry={5} fill="#fff" opacity={0.4} />
            </g>
          );
        })()}
        {/* the splash as it lands: a squashed bead for three frames */}
        {landed && t < DROP_LAND + 0.1 && <ellipse cx={NIB[0] + 2} cy={NIB[1] - 6} rx={17} ry={7} fill={P.purple} />}
      </Sheet>
    </>
  );
};
export const HOWEVER: Spread = { id: 'however', Art: HoweverArt };
