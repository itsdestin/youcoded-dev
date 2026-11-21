// Take 1C, chapters v–ix: the handful make a quill that escapes them and makes little apps for whoever asks,
// the three things they decided are undone one by one, the strings snap, and the book ends on two friends
// passing what they made back and forth.
//  v    "blinded by their own hubris"                 chins up; their hats grow, in comic steps, out of the page
//       "created a new kind of technology"            they shove an inkwell onto their desk (nothing else)
//       "artificial intelligence"                     close: a purple quill rises out of that inkwell by itself
//       "a great treasure: shareholder value"         close on the three: a chart on an easel on their desk; they
//                                                      lean in together; on "value" its line climbs to an up-arrow
//                                                      and they lean back, chins up, following it
//       "far beyond their own control"                the nearest one's arm shoots out for the quill; it pulls back,
//                                                      darts out of reach, and the film cuts on "a tool"
//  vi   "a tool that can make software"               the quill draws an app window; someone's request types
//                                                      itself in; a plant journal fills it
//       "the ever-scarce foundation of these monopolies" their stack, padlocked; then the quill writes more stacks
//       "for anyone who asks"                         four people, each with the same window in a theme of their own
//  vii  "we get to decide. what our computers can do…" chapter ii's three pictures, undone by the people
//  viii "free ourselves… monopolies of the past"      the strings from chapter i snap; the hats fade to pencil
//  ix   "at long, long last… open source everything"  every page riffles past, each one someone's own app; then one
//                                                      friend's page is copied across to the other and redrawn in his theme
import React from 'react';
import { DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT } from '../brand';
import { loadFont as loadCaveat } from '@remotion/google-fonts/Caveat';
import { blob, WashBg, HatFigure, HatPose, Ink, jolt, Laptop, lin, mixHex, NEUTRAL, P, Padlock, Person, pop, PriceTag, Quill, Shape, useT } from './take1c-ink';
import { LOOK, rr, Theme, ThemedWindow, THEMES, windowHeight } from './take1c-apps';
import { Folio, Heading, Sheet } from './take1c-page';
import { Stream, Strings } from './take1c-spreads-a';
import { CUT, land, Q, TURN } from './take1c-time';
import type { Spread } from './take1c-book';
// WHY a handwriting face for the one wish: it is a person's note on paper, not the book's printed type
const CAVEAT = loadCaveat('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily;

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
/** Overshoot then settle (a back-ease): for the quill's escape twist. */
const BACK = (v: number) => { const c = 1.9; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); };

/** The quill standing above the page, with a soft shadow on the paper beneath it (chapter vi). */
const FlyingQuill: React.FC<{ q: ReturnType<typeof track>; o?: number }> = ({ q, o = 1 }) => {
  const t = useT();
  if (q.s <= 0.01 || o <= 0.01) return null;
  const z = Math.max(0, q.z + Math.sin(t * 3.1) * 8);
  return (
    <>
      <div style={{ position: 'absolute', left: q.x - 40 + z * 0.18, top: q.y - 14 + z * 0.1, width: 80 * q.s, height: 26 * q.s, borderRadius: '50%',
        background: 'rgba(40,14,48,0.55)', filter: `blur(${5 + z * 0.04}px)`, opacity: o * Math.max(0.12, 0.5 - z * 0.0012), transform: 'translateZ(0.6px)' }} />
      <div style={{ position: 'absolute', left: q.x, top: q.y - 170, width: 130, height: 170, transformOrigin: '0 100%', opacity: o,
        transform: `translateZ(${z}px) rotateX(-30deg) rotateZ(${q.r}deg) scale(${q.s * 1.5})` }}>
        <svg width={130} height={170} viewBox="0 -165 130 170" style={{ overflow: 'visible' }}><Quill x={0} y={0} s={1.05} /></svg>
      </div>
    </>
  );
};

// ---------- the made things the stacks are built from ----------
const ICONS = ['calendar', 'note', 'game', 'map', 'chat'] as const;
const ICON_D: Record<typeof ICONS[number], string> = {
  calendar: 'M -18 -12 h 36 v 30 h -36 Z M -18 -2 h 36 M -8 -16 v 8 M 8 -16 v 8',
  note: 'M -6 14 L -6 -16 L 16 -20 L 16 8 M -6 14 a 6 5 0 1 1 -1 -1 M 16 8 a 6 5 0 1 1 -1 -1',
  game: 'M -18 -18 h 36 v 36 h -36 Z M -6 -18 v 36 M 6 -18 v 36 M -18 -6 h 36 M -18 6 h 36',
  map: 'M 0 18 C -16 2 -14 -18 0 -18 C 14 -18 16 2 0 18 Z M 0 -9 a 5 5 0 1 0 0.1 0',
  chat: 'M -20 -14 h 40 v 24 h -26 l -10 8 v -8 h -4 Z',
};
/** A stack of slabs, each stamped with an app icon: the software the handful's power rests on. */
const Stack: React.FC<{ cx: number; w: number; n: number; a: number; dur?: number; fill?: string; wobble?: number }> = ({ cx, w, n, a, dur = 0.5, fill = P.wash, wobble = 0 }) => {
  const t = useT();
  return (
    <>
      {Array.from({ length: n }).map((_, i) => {
        const y0 = 880 - (i + 1) * 44;
        const jit = [0, 10, -6, 12, 4][i % 5] * (w / 300);
        const x0 = cx - w / 2 + jit, x1 = cx + w / 2 + jit;
        const k = a + (i / n) * dur;
        return (
          <g key={i} transform={`translate(${jolt(t, wobble, 6 - i, 0.7)} 0)`}>
            <Shape d={`M ${x0} ${y0 + 44} L ${x1} ${y0 + 44} L ${x1} ${y0} L ${x0} ${y0} Z`} a={k} b={k + 0.25} fill={fill} w={3} />
            <g transform={`translate(${(x0 + x1) / 2} ${y0 + 22}) scale(0.5)`}><Ink d={ICON_D[ICONS[i % 5]]} a={k + 0.1} b={k + 0.35} w={4} /></g>
          </g>
        );
      })}
    </>
  );
};

// ======================= v · the treasure, and vi · the tool =======================
const STACK = { cx: 245, w: 300, n: 5 };
const TOP = 880 - STACK.n * 44;                 // the top of their stack, where they stand
const MEN = [150, 245, 340];
const DESK = { x0: 440, x1: 740, y: TOP };      // their desk, level with the stack
const WELL = { x: 650, from: 462 };             // where the inkwell comes to rest, and where it is shoved from
const MOUTH = TOP - 68;                          // the inkwell's mouth: the quill is hidden below it
const REST = { x: WELL.x, y: MOUTH + 8, r: -18, s: 1.6 };
const COPIES = [900, 1110, 1320];
// WHY taller than theirs and of different heights: the point is that anyone can build what they had, so the
// new stacks must visibly outgrow the monopoly's five slabs, and not look like colour-swapped copies of it
const COPY_N = [6, 7, 6];
const copyTop = (i: number) => 880 - COPY_N[i] * 44;
// The window the quill makes for a plant journal: a bare card, no window chrome (brand: never draw the app itself)
const WIN = { x: 1120, y: 505, w: 440 };
const WIN_H = windowHeight(WIN.w);
// WHY a handwritten scrap instead of a typed speech bubble (review BLOCKER): the bubble was a drawn chat box, a
// faked app interface. The person's wish is now written by the quill itself, in ink, onto a scrap of paper
// above the card: it is the book's own handwriting, and it makes the quill (the film's tool) visibly do the asking.
const NOTE = { x0: 925, x1: 1305, y: 238, text: 'my plants keep dying' };
const NOTE_A = CUT.tool + 0.08, NOTE_B = NOTE_A + 0.62;
// WHY the card draws right after the note: the quill needs ~0.16 s to swoop from the note's end to the card's corner
const SWOOP = NOTE_B + 0.12, WIN_A = NOTE_B + 0.14, WIN_DRAW = 0.42;
const PLANTS_AT = Q.software;
if (WIN_A + WIN_DRAW > PLANTS_AT + 0.02) throw new Error(`take1c: the card must be drawn by "software" (${(WIN_A + WIN_DRAW).toFixed(2)} > ${PLANTS_AT.toFixed(2)})`);
// The chart they dream over: a small easel board standing on their desk, between them and the inkwell.
// WHY on the desk, not a roller blind in front of them (review 2026-11-20): the blind hid their bodies, and
// its chart line poked out of the top and across their faces. This board never crosses a figure.
const CHART = { x0: 446, x1: 600, y0: 486, y1: 628 };
// WHY smaller steps than before, and no reset after "these" (review): four big jumps made stovepipes that ran off
// the top of the page and then snapped back to a smaller size at the next cut. Now the tallest hat still ends
// inside the page (top at about y 140), and the hats simply stay that tall: it is how these men look from here on.
const GROW = [36, 48, 62, 80];                   // each step of a hat's growth on "hubris"
const HAT_K = [0.88, 1, 0.94];                   // each man's hat grows to a slightly different height
// WHY drawn well before the cut: the film cuts straight into this spread on "hubris", so it must already be finished
const DRAWN = TURN.treasure - 3;
// WHY the desk inks in just after "hubris" (merge check): drawn earlier, its edge stood under the headline "something
// wonderful happened." for the first second after the cut. The headline leaves on "hubris"; the desk arrives with it.
const DESK_A = Q.hubris + 0.05;

/** How tall each man's hat is: four comic jumps on "hubris", each landing with an overshoot, then it stays. */
const crownAt = (t: number, j: number) =>
  GROW.reduce((c, g, i) => c + g * HAT_K[j] * Math.min(1.14, pop(t, Q.hubris + i * 0.2 + j * 0.04, 0.26)), 84);
/** The hat squashes thin while it jumps up, and settles wide. */
const hatSxAt = (t: number, j: number) =>
  GROW.reduce((sx, _, i) => { const x = (t - (Q.hubris + i * 0.2 + j * 0.04)) / 0.24; return x > 0 && x < 1 ? sx - 0.28 * Math.sin(x * Math.PI) : sx; }, 1);
const manAt = (t: number, j: number) => {
  let pose: HatPose = 'sides';
  // WHY rubbing hands from "artificial intelligence": they turn to the new thing and rub their hands, so the
  // quill rising out of the inkwell has an audience that reacts to it
  if (t > Q.artificial + 0.3 && t < Q.aTechnology + 0.2) pose = 'rub';
  if (t > Q.believed && t < Q.shareholder) pose = 'rub';
  if (j === 2 && t > Q.created1 - 0.2 && t < Q.created1 + 0.6) pose = 'shove';
  // in the snatch the nearest one throws one long arm at the quill; the other two reach after it
  if (t > Q.far - 0.06 && t < Q.control + 1.1) pose = j === 2 ? 'stretch' : 'reach';
  // chins up on "hubris"; greed on "treasure": all three lean in toward the chart together,
  // then on "value" they lean back with their chins up, following the arrow; a lean toward the quill on "excitement"
  // WHY a per-man beat for everything below (review BLOCKER: three clones swayed in phase for 14 s): each man has his
  // own sway speed and size, his own idle gesture, and reacts a few frames after his neighbour
  const spike = (a: number, b: number) => lin(t, a, a + 0.12) * (1 - lin(t, b, b + 0.25));
  if (pose === 'sides' && t < Q.far - 0.06) {
    const phase = Math.floor((t + j * 0.55) / 1.1) % 3;
    pose = ([['sides', 'pat', 'sides'], ['sides', 'bar', 'sides'], ['pat', 'sides', 'bar']] as HatPose[][])[j][phase];
  }
  // on "artificial" they lean in toward the quill, then jerk back as it rises; on "control" it throws them off balance
  const peer = 8 * spike(Q.artificial + j * 0.05, Q.intelligence) - 9 * spike(Q.intelligence + 0.25 + j * 0.05, Q.intelligence + 0.5);
  const tumble = [-15, 11, -9][j] * spike(Q.control + 0.28 + j * 0.05, Q.control + 0.55);
  const hub = -7 * lin(t, Q.hubris - 0.1 + j * 0.05, Q.hubris + 0.3 + j * 0.05);
  const greed = 9 * lin(t, Q.treasure - 0.1, Q.treasure + 0.35) * (1 - lin(t, Q.value + 0.05, Q.value + 0.4));
  const chin = -6 * lin(t, Q.value + 0.05, Q.value + 0.4) * (1 - lin(t, Q.but - 0.1, Q.but + 0.25));
  const grab = 9 * lin(t, Q.excitement - 0.1, Q.excitement + 0.3) * (1 - lin(t, Q.control + 0.8, Q.control + 1.2));
  // WHY an idle sway, a breath and bounces (review: the men stood rigid for seconds while she spoke the film's turn):
  // each man shifts his weight on his own beat, and all three hop on "excitement" and again on "created"
  const sway = Math.sin(t * (1.7 + j * 0.45) + j * 2.3) * (1.0 + j * 0.5);
  const breath = 1 + 0.012 * Math.sin(t * 2.7 + j * 1.1);
  const bob = jolt(t, Q.excitement - 0.02 + j * 0.06, -16, 0.55) + jolt(t, Q.createdSomething + j * 0.06, -10, 0.5)
    + jolt(t, Q.hubris + 0.3 + j * 0.11, -9, 0.45) + jolt(t, Q.created1 + 0.3 + j * 0.1, -7, 0.45);
  return { pose, lean: hub + greed + chin + grab + sway + peer + tumble, breath, bob };
};
/** Where a point on a man (in his own drawing units) lands on the page, with his lean. */
const onMan = (fx: number, lean: number, px: number, py: number) => {
  const a = (lean * Math.PI) / 180;
  return [fx + px * Math.cos(a) - py * Math.sin(a), TOP + px * Math.sin(a) + py * Math.cos(a)];
};

/** The long reaching arm: a coat sleeve in the men's own ink line, ending in a plain drawn hand.
 *  WHY drawn like their own arms (review 2026-11-20): the white cartoon gloves on black bars from off-frame were
 *  a stock cliché, out of style with the book's thin line art. */
const Reach: React.FC<{ from: [number, number]; to: [number, number]; p: number; fist: number }> = ({ from, to, p, fist }) => {
  if (p <= 0.001) return null;
  const hx = from[0] + (to[0] - from[0]) * p, hy = from[1] + (to[1] - from[1]) * p;
  const mx = (from[0] + hx) / 2, my = Math.min(from[1], hy) - 30 * p;
  const ang = Math.atan2(hy - my, hx - mx);
  // an open hand: a round palm with four short fingers fanned toward the quill, and a thumb; they fold away
  // into a small solid fist when it closes on nothing
  const fingers = [-0.62, -0.2, 0.2, 0.62].map((d) => {
    const len = 12 * (1 - fist * 0.85);
    return `M ${hx + Math.cos(ang + d) * 8} ${hy + Math.sin(ang + d) * 8} l ${Math.cos(ang + d * 0.5) * len} ${Math.sin(ang + d * 0.5) * len}`;
  }).join(' ') + ` M ${hx + Math.cos(ang - 1.5) * 8} ${hy + Math.sin(ang - 1.5) * 8} l ${Math.cos(ang - 0.9) * 9 * (1 - fist * 0.85)} ${Math.sin(ang - 0.9) * 9 * (1 - fist * 0.85)}`;
  const arm = `M ${from[0]} ${from[1]} Q ${mx} ${my} ${hx} ${hy}`;
  return (
    <g>
      {/* WHY two widths (review: the arm read as a noodle): a heavy sleeve from the shoulder over its first
          half, the lighter forearm carrying on to the hand */}
      <path d={arm} stroke={P.ink} strokeWidth={9} fill="none" strokeLinecap="round" />
      <path d={arm} pathLength={1} stroke={P.ink} strokeWidth={15} fill="none" strokeLinecap="round" strokeDasharray="0.5 2" />
      <path d={fingers} stroke={P.ink} strokeWidth={5.5} fill="none" strokeLinecap="round" />
      <path d={fingers} stroke={P.paper} strokeWidth={2} fill="none" strokeLinecap="round" />
      <circle cx={hx} cy={hy} r={fist > 0.5 ? 7 : 9.5} fill={fist > 0.5 ? P.ink : P.paper} stroke={P.ink} strokeWidth={2.6} />
    </g>
  );
};

/** The inkwell they shove onto the desk. Its mouth is at MOUTH. */
const Inkwell: React.FC<{ x: number; rock?: number }> = ({ x, rock = 0 }) => (
  <g transform={`rotate(${rock} ${x} ${TOP})`}>
    <ellipse cx={x} cy={TOP + 2} rx={44} ry={6} fill={P.ink} opacity={0.12} />
    <path d={`M ${x - 38} ${TOP} L ${x - 38} ${TOP - 42} Q ${x - 38} ${TOP - 56} ${x - 22} ${TOP - 56} L ${x + 22} ${TOP - 56} Q ${x + 38} ${TOP - 56} ${x + 38} ${TOP - 42} L ${x + 38} ${TOP} Z`}
      fill={P.ink} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
    <path d={`M ${x - 18} ${TOP - 56} L ${x - 18} ${MOUTH} L ${x + 18} ${MOUTH} L ${x + 18} ${TOP - 56} Z`} fill={P.inkSoft} stroke={P.ink} strokeWidth={3} />
    <path d={`M ${x - 27} ${TOP - 10} L ${x - 27} ${TOP - 40} Q ${x - 27} ${TOP - 47} ${x - 20} ${TOP - 48}`} stroke="#fff" strokeWidth={4} opacity={0.3} fill="none" strokeLinecap="round" />
    <ellipse cx={x} cy={MOUTH} rx={16} ry={3.4} fill={P.purple} />
  </g>
);

/** The chart on its easel: one line climbs on "shareholder value" and its tip becomes an arrow pointing up. */
const Chart: React.FC<{ t: number }> = ({ t }) => {
  // WHY it fades away rather than rolling up: shrinking, it dragged its line across the men's bodies
  // WHY it is knocked over by their excitement (review: it just vanished for no reason): it tips about its foot, then goes
  const o = lin(t, Q.treasure - 0.15, Q.treasure + 0.2) * (1 - lin(t, Q.but + 0.3, Q.but + 0.5));
  if (o <= 0.001) return null;
  const tip = lin(t, Q.but + 0.0, Q.but + 0.4, EASE_IN);
  const rise = (1 - lin(t, Q.treasure - 0.15, Q.treasure + 0.3)) * 24;
  const { x0, x1, y0, y1 } = CHART;
  const pts: [number, number][] = [[x0 + 16, y1 - 20], [x0 + 44, y1 - 38], [x0 + 64, y1 - 30], [x0 + 92, y1 - 62], [x0 + 108, y1 - 54], [x1 - 22, y0 + 26]];
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ');
  const tipPt = pts[pts.length - 1], prev = pts[pts.length - 2];
  const ang = (Math.atan2(tipPt[1] - prev[1], tipPt[0] - prev[0]) * 180) / Math.PI;
  const head = pop(t, Q.value + 0.28, 0.35);
  return (
    <g opacity={o} transform={`translate(0 ${rise}) rotate(${tip * 78} ${x1 - 22} ${TOP})`}>
      <defs><clipPath id="c-chart"><rect x={x0 + 4} y={y0 + 4} width={x1 - x0 - 8} height={y1 - y0 - 8} /></clipPath></defs>
      {/* the easel's legs, standing on the desk */}
      <path d={`M ${x0 + 30} ${y1} L ${x0 + 22} ${TOP} M ${x1 - 30} ${y1} L ${x1 - 22} ${TOP}`} stroke={P.ink} strokeWidth={4} strokeLinecap="round" />
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={4} fill="#FFFDF8" stroke={P.ink} strokeWidth={3} />
      <g clipPath="url(#c-chart)">
        {[1, 2, 3, 4].map((i) => <path key={i} d={`M ${x0 + 8} ${y0 + i * 28} L ${x1 - 8} ${y0 + i * 28}`} stroke={P.inkSoft} strokeWidth={1.3} opacity={0.3} />)}
        <Ink d={line} a={Q.shareholder - 0.05} b={Q.value + 0.3} w={6} />
        {/* the arrowhead: stays inside the board's edge */}
        {head > 0 && <g transform={`translate(${tipPt[0]} ${tipPt[1]}) rotate(${ang}) scale(${Math.min(1.1, head)})`}><path d="M 4 0 L -14 -10 L -14 10 Z" fill={P.ink} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" /></g>}
      </g>
    </g>
  );
};

/** The scrap of paper the quill writes the wish on: written left to right, the nib riding the end of the word. */
const noteU = (t: number) => lin(t, NOTE_A, NOTE_B, (v) => v);
const Note: React.FC<{ t: number }> = ({ t }) => {
  // WHY only from the cut: the framing before it never shows this side of the page, and it should arrive with the shot
  if (t < CUT.tool - 0.02) return null;
  const u = noteU(t);
  // WHY it leaves on the very frame of the cut to the stacks (the next shot still has this edge of the page in it)
  const fade = t < Q.scarce - 0.06 ? 1 : 0;
  if (fade <= 0.01) return null;
  const w = NOTE.x1 - NOTE.x0;
  return (
    <g opacity={fade} transform={`rotate(-1.4 ${NOTE.x0 + w / 2} ${NOTE.y - 30})`}>
      <defs><clipPath id="c-note"><rect x={NOTE.x0 - 20} y={NOTE.y - 70} width={(w + 40) * u} height={110} /></clipPath></defs>
      <path d={`M ${NOTE.x0 - 34} ${NOTE.y - 72} L ${NOTE.x1 + 36} ${NOTE.y - 76} L ${NOTE.x1 + 30} ${NOTE.y + 36} L ${NOTE.x0 - 30} ${NOTE.y + 40} Z`}
        fill="rgba(42,26,53,0.18)" transform="translate(5 8)" />
      <path d={`M ${NOTE.x0 - 34} ${NOTE.y - 72} L ${NOTE.x1 + 36} ${NOTE.y - 76} L ${NOTE.x1 + 30} ${NOTE.y + 36} L ${NOTE.x0 - 30} ${NOTE.y + 40} Z`}
        fill="#FFFDF8" stroke={P.ink} strokeWidth={2.4} strokeLinejoin="round" />
      <g clipPath="url(#c-note)">
        <text x={NOTE.x0} y={NOTE.y} textLength={w} lengthAdjust="spacingAndGlyphs" fontFamily={CAVEAT} fontWeight={700} fontSize={64} fill={P.ink}>{NOTE.text}</text>
      </g>
    </g>
  );
};
/** The quill's keys while it writes the note: its nib rides the end of the ink, wobbling like a hand. */
const writeKeys = (): Key[] => Array.from({ length: 9 }).map((_, i) => {
  const f = i / 8;
  return { t: NOTE_A + (NOTE_B - NOTE_A) * f, x: NOTE.x0 + (NOTE.x1 - NOTE.x0) * f, y: NOTE.y + 4 + (i % 2 ? -9 : 7), r: -14, s: 1.05, ease: (v: number) => v };
});

/** The treasure itself (review SHOULD: "great treasure" had nothing on screen for 1.6 s): two stacks of gold coins pile
 *  up on their desk beside the inkwell on the word, one coin at a time, and glint once. */
const Coins: React.FC<{ t: number }> = ({ t }) => {
  if (t < Q.treasure - 0.05) return null;
  const glint = Math.max(0, 1 - Math.abs(t - (Q.treasure + 0.75)) / 0.12);
  const fall = lin(t, Q.but + 0.15, Q.but + 0.5, EASE_IN);
  const stacks: [number, number][] = [[712, 6], [686, 3]];
  return (
    <g transform={`translate(0 ${fall * 120}) rotate(${fall * 14} 700 ${TOP})`} opacity={1 - lin(t, Q.but + 0.3, Q.but + 0.5)}>
      {stacks.map(([cx, n], si) => Array.from({ length: n }).map((_, i) => {
        const k = pop(t, Q.treasure + (si * n + i) * 0.07, 0.2);
        if (k <= 0) return null;
        const y = TOP - 6 - i * 9 - (1 - Math.min(1, k)) * 40;
        return <g key={`${si}-${i}`}><ellipse cx={cx} cy={y} rx={22} ry={7} fill="#F2C04A" stroke={P.ink} strokeWidth={3} />
          <path d={`M ${cx - 14} ${y} Q ${cx} ${y + 4} ${cx + 14} ${y}`} stroke={P.ink} strokeWidth={1.6} fill="none" opacity={0.5} /></g>;
      }))}
      {glint > 0 && <path d={`M 712 ${TOP - 70} l 5 -16 l 5 16 l 16 5 l -16 5 l -5 16 l -5 -16 l -16 -5 Z`} fill="#FFF6D0" opacity={glint} />}
    </g>
  );
};

const TreasureArt: React.FC = () => {
  const t = useT();
  // the shove: the inkwell lands at the stack's edge on "created" and skids along the desk
  const shoved = lin(t, Q.created1 + 0.05, Q.created1 + 0.55, EASE_OUT);
  const wellX = WELL.from + (WELL.x - WELL.from) * shoved;
  const wellIn = pop(t, Q.created1 - 0.12, 0.3);
  const rock = jolt(t, Q.created1 + 0.5, 5, 0.5);
  // the snatch: the nearest man's arm stretches out through "far beyond their own", closes on "control"
  const reach = lin(t, Q.far - 0.02, Q.control - 0.06, EASE_OUT);
  const fist = lin(t, Q.control + 0.02, Q.control + 0.1);
  // WHY back before the cut (review): the cut now lands at control + 0.77, and the arm must be home by then
  const back = lin(t, Q.control + 0.4, Q.control + 0.7, EASE_IN);
  // the quill: rises out of its inkwell on "artificial intelligence", and escapes on "control"
  // WHY it escapes sideways and stays low (review 2026-11-20): rising, it left the top of the frame for half a
  // second. It now darts out of reach to the right and out of the shot, and the film cuts to the page it lands on.
  const q = track(checked('treasure', [
    { t: Q.artificial + 0.05, x: REST.x, y: REST.y + 260, r: REST.r, s: REST.s },
    { t: Q.intelligence + 0.3, x: REST.x, y: REST.y - 10, r: REST.r - 4, s: REST.s, ease: EASE_OUT },
    { t: Q.intelligence + 0.7, ...REST },
    { t: Q.control - 0.22, ...REST },
    // WHY a 6-frame pull back first: the anticipation is what makes the escape read as the quill's own choice
    { t: Q.control - 0.02, x: REST.x - 10, y: REST.y + 6, r: REST.r - 16, s: REST.s, ease: EASE_IN_OUT },
    { t: Q.control + 0.3, x: 815, y: 616, r: -30, s: REST.s, ease: BACK },
    // WHY it keeps going out of frame before the cut (review: an empty beat after it left): the cut now lands
    // as it is gone, and in the next shot it is already at the note
    { t: CUT.tool - 0.03, x: 1230, y: 590, r: -30, s: REST.s, ease: EASE_IN },
    { t: CUT.tool, x: NOTE.x0 - 10, y: NOTE.y + 4, r: -14, s: 1.05 },
    { t: NOTE_A, x: NOTE.x0 - 10, y: NOTE.y + 4, r: -14, s: 1.05 },
    ...writeKeys().slice(1),
    // then it swoops to the card's corner and draws the card round, clockwise from the top-left
    // WHY it arrives a hair before the outline starts: the line must never be drawn ahead of the nib
    { t: SWOOP, x: WIN.x - WIN.w / 2, y: WIN.y - WIN_H / 2, r: -12, s: 1.0, ease: EASE_IN_OUT },
    { t: WIN_A, x: WIN.x - WIN.w / 2, y: WIN.y - WIN_H / 2, r: -12, s: 1.0 },
    { t: WIN_A + WIN_DRAW * 0.3, x: WIN.x + WIN.w / 2, y: WIN.y - WIN_H / 2, r: -12, s: 1.0 },
    { t: WIN_A + WIN_DRAW * 0.5, x: WIN.x + WIN.w / 2, y: WIN.y + WIN_H / 2, r: -12, s: 1.0 },
    { t: WIN_A + WIN_DRAW * 0.8, x: WIN.x - WIN.w / 2, y: WIN.y + WIN_H / 2, r: -12, s: 1.0 },
    { t: WIN_A + WIN_DRAW, x: WIN.x - WIN.w / 2, y: WIN.y - WIN_H / 2 + 40, r: -12, s: 1.0 },
    { t: PLANTS_AT, x: WIN.x + WIN.w / 2 + 30, y: WIN.y + 20, r: 8, s: 0.9 },
    { t: Q.foundation - 0.2, x: WIN.x + WIN.w / 2 + 30, y: WIN.y + 30, r: 8, s: 0.9 },
    // then the stacks, one after another: its nib rides the top of each as it is written
    ...COPIES.map((cx, i) => ({ t: Q.foundation + i * 0.22 + 0.2, x: cx + 40, y: copyTop(i) + 12, r: -8, s: 1.0 })),
    { t: TURN.anyone, x: 1460, y: 560, r: 0, s: 1.0 },
  ]), t);
  const idle = t > Q.intelligence + 0.7 && t < Q.control - 0.22 ? Math.sin(t * 1.7) * 2.5 + jolt(t, Q.createdSomething, 6, 0.6) : 0;
  // WHY the nib taps and the quill sways while the finished card is held (review: nothing new on screen for ~1 s)
  const hover = t > PLANTS_AT && t < Q.foundation - 0.2 ? Math.sin((t - PLANTS_AT) * 7) * 4 : 0;
  const inWell = t < Q.control + 0.2;
  const men = MEN.map((fx, j) => ({ fx, j, ...manAt(t, j) }));
  const stretch = men[2];
  // the arm leaves his shoulder and reaches for the feather's middle, where the quill stood a moment ago
  const shoulder = onMan(stretch.fx, stretch.lean, 20, -168) as [number, number];
  const target: [number, number] = [REST.x + 6, REST.y - 92];
  // "ever-scarce": their stack greys; "foundation": it settles heavily; "monopolies": it shakes and shrinks a little
  // while the new stacks rise taller beside it, so the balance of power visibly tips
  const grey = lin(t, Q.scarce, Q.scarce + 0.4);
  const settle = jolt(t, Q.foundation, 7, 0.55);
  const shrink = 1 - 0.07 * lin(t, Q.monopolies1, Q.monopolies1 + 0.5, EASE_IN_OUT);
  const gone = t < Q.scarce - 0.06 ? 1 : 0;
  return (
    <>
      {/* WHY no chapter heading or folio on this spread (review BLOCKER): every shot here is a close-up, and the
          heading sat across the frame's top edge as a torn sliver of italic text */}
      <Sheet>
        <defs><clipPath id="c-well-mouth"><rect x={-200} y={-400} width={2000} height={MOUTH + 400} /></clipPath></defs>
        {/* their stack, and them on it */}
        <g transform={`translate(0 ${settle}) translate(${STACK.cx} 880) scale(${shrink}) translate(${-STACK.cx} -880) rotate(${jolt(t, Q.monopolies1 - 0.1, 2, 0.9)} ${STACK.cx} 880)`}>
          <Stack cx={STACK.cx} w={STACK.w} n={STACK.n} a={DRAWN} wobble={Q.monopolies1} fill={mixHex(P.wash, '#9A8F9C', grey)} />
          {men.map(({ fx, j, pose, lean, breath, bob }) => (
            <HatFigure key={j} x={fx} y={TOP} s={breath} crown={crownAt(t, j)} hatSx={hatSxAt(t, j)} a={DRAWN + 0.3 + j * 0.08} b={DRAWN + 1.1 + j * 0.08} pose={pose}
              lean={lean} bob={bob} eyes="dots" fist={j < 2 ? fist * (1 - back) : 0} />
          ))}
        </g>
        {/* WHY the padlock on the stack's left edge (review: it sat on the icons and read as "secure", not "scarce"):
            it now hangs off the side of the slab, clear of every icon, on "ever-scarce": theirs is the only stack */}
        <Padlock x={STACK.cx - STACK.w / 2 - 2} y={782} s={1.15} at={Q.scarce} />
        {/* their desk */}
        <Shape d={`M ${DESK.x0} ${DESK.y} L ${DESK.x1} ${DESK.y} L ${DESK.x1} ${DESK.y + 16} L ${DESK.x0} ${DESK.y + 16} Z`} a={DESK_A} b={DESK_A + 0.4} fill={P.inkSoft} w={3} />
        <Ink d={`M ${DESK.x0 + 20} ${DESK.y + 16} L ${DESK.x0 + 26} 880 M ${DESK.x1 - 20} ${DESK.y + 16} L ${DESK.x1 - 26} 880`} a={DESK_A + 0.1} b={DESK_A + 0.5} w={5} />
        <Chart t={t} />
        <Coins t={t} />
        {wellIn > 0 && <g transform={`translate(${wellX} ${TOP}) scale(${Math.min(1.1, wellIn)}) translate(${-wellX} ${-TOP})`}><Inkwell x={wellX} rock={rock} /></g>}

        {/* "far beyond their own control": his arm shoots out, and his hand closes on the air where it was */}
        {stretch.pose === 'stretch' && <Reach from={shoulder} to={target} p={reach * (1 - back)} fist={fist} />}

        {/* "a tool that can make software": the quill writes the wish, draws a card, and it fills */}
        <Note t={t} />
        <g opacity={gone}>
          <ThemedWindow theme="meadow" x={WIN.x} y={WIN.y} w={WIN.w} a={WIN_A} draw={WIN_DRAW} contentAt={PLANTS_AT} bare />
        </g>
        {/* "foundation": the same stack, written again and again, taller than theirs, so theirs is no longer special */}
        {COPIES.map((cx, i) => {
          const L = LOOK[THEMES[i]];
          return <Stack key={i} cx={cx} w={180} n={COPY_N[i]} a={Q.foundation - 0.05 + i * 0.22} dur={0.3} fill={mixHex(L.page, L.accent, 0.4)} />;
        })}
        {/* the quill: hidden below the inkwell's mouth while it lives in it. WHY drawn last: its nib rides the ink of the
            note, the card and the stacks, so it must be in front of all of them (the scrap used to cover it) */}
        {t > Q.artificial && (
          <g clipPath={inWell ? 'url(#c-well-mouth)' : undefined}>
            <Quill x={q.x} y={q.y + Math.abs(hover) * 0.6} s={q.s} r={q.r + idle + hover} />
          </g>
        )}
      </Sheet>
    </>
  );
};
export const TREASURE: Spread = { id: 'treasure', Art: TreasureArt };
/** Where the quill and the window are, for the camera. */
export const TREASURE_MARKS = { well: { x: WELL.x, y: MOUTH }, men: { x: MEN[1], y: TOP }, win: WIN, winH: WIN_H, winA: WIN_A, stack: { x: STACK.cx, y: 760 }, copies: COPIES };

// ======================= vi · anyone =======================
// WHY each raised hand gets its own card in its own theme: the line says the tool makes software "for anyone
// who asks", and the product idea is that every person's copy looks and works differently. Four people, four
// real themes, one card shape: the same thing, made theirs.
// WHY the card beside each person, held up at hand height (review: the windows sat on the heads like signs):
// each person shows what they made, and their face stays clear.
const ASKERS = [90, 450, 810, 1170];
const HAIRS4 = ['bob', 'curly', 'bun', 'cap'] as const;
const GROUND = 600;
const ASK_W = 230;
const ASK_Y = 452;
const ASK_DX = 159;
const winAt = (i: number) => land(TURN.anyone) + 0.12 + i * 0.2;
const AnyoneArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.anyone);
  const foot = ASK_Y + windowHeight(ASK_W) / 2;
  return (
    <>
      {/* WHY no chapter heading on my spreads (owner: dislikes the headers; reviewers: unreadable serif italic) */}
      <Folio left={14} hideRight />
      <Sheet>
        <WashBg x={380} y={420} r={230} sx={1.4} a={-10} seed={16} color={P.lilac} o={0.55} />
        <WashBg x={1140} y={420} r={230} sx={1.4} a={-10} seed={17} color={P.pinkSoft} o={0.45} />
        <Ink d={`M 70 ${GROUND} L 1450 ${GROUND}`} a={-10} b={-9} w={2} c={P.inkSoft} />
        {ASKERS.map((x, i) => {
          const up = t > winAt(i) - 0.15;
          const p = pop(t, winAt(i), 0.45);
          // WHY a second cheer on "asks", staggered (review: the pictures showed nothing new while she says the
          // film's most important line): each person hops again, holding their card up with them
          const hop = (up ? jolt(t, winAt(i) - 0.15, -8, 0.5) : 0) + jolt(t, Q.asks - 0.1 + i * 0.09, -12, 0.55);
          return (
            <g key={i}>
              <Person x={x} y={GROUND} s={1.3} a={L - 2} b={L - 1.5} pose={up ? (i % 2 ? 'up' : 'wave') : 'down'} hair={HAIRS4[i]}
                body={NEUTRAL[i * 3]} mood="smile" bob={hop} />
              {p > 0 && <g transform={`translate(0 ${hop}) translate(${x + ASK_DX} ${foot}) scale(${p}) translate(${-(x + ASK_DX)} ${-foot})`}><ThemedWindow theme={THEMES[i]} x={x + ASK_DX} y={ASK_Y} w={ASK_W} compact bare /></g>}
            </g>
          );
        })}
      </Sheet>
    </>
  );
};
const AnyonePop: React.FC = () => {
  const t = useT();
  const L = land(TURN.anyone);
  const q = track(checked('anyone', [
    { t: L, x: 40, y: 260, z: 600, s: 0.8, r: 10 },
    ...ASKERS.map((x, i) => ({ t: winAt(i) + 0.05, x: x + ASK_DX + 120, y: ASK_Y - 70, z: 70, s: 0.75, r: -10 + i * 4 })),
    { t: Q.asks + 0.5, x: 1460, y: 200, z: 260, s: 0.75, r: 0 },
    { t: TURN.ours, x: 1500, y: 120, z: 900, s: 0.75, r: 0 },
  ]), t);
  return <FlyingQuill q={q} o={t < TURN.ours ? 1 : 0} />;
};
export const ANYONE: Spread = { id: 'anyone', Art: AnyoneArt, Pop: AnyonePop };

/** Chapter heading and page numbers that show only while the camera is wide enough to hold them whole.
 *  WHY (review BLOCKER): in close-ups the heading sat across the top edge of the frame as a torn sliver. */
const Furniture: React.FC<{ n: string; title: string; left: number; from: number; to?: number; hideRight?: boolean }> = ({ n, title, left, from, to, hideRight }) => {
  const t = useT();
  const o = lin(t, from, from + 0.25) * (to == null ? 1 : 1 - lin(t, to - 0.12, to));
  if (o <= 0.01) return null;
  return <div style={{ position: 'absolute', left: 0, top: 0, opacity: o }}><Folio left={left} hideRight={hideRight} /></div>;
};

// ======================= vii · ours: chapter ii, undone =======================
// WHY the exact layout of chapter ii: the narrator repeats that line's three clauses word for word, so the
// pictures repeat too, in colour, and each is undone by the person it was done to, on its own clause.
const Scissors: React.FC<{ x: number; y: number; r: number; open: number }> = ({ x, y, r, open }) => (
  <g transform={`translate(${x} ${y}) rotate(${r})`}>
    {[1, -1].map((s) => (
      <g key={s} transform={`rotate(${s * open * 16})`}>
        <path d={`M -6 ${s * 2} L 58 ${s * -2} Q 60 ${s * 1} 56 ${s * 3} L -6 ${s * 7} Z`} fill="#F4F0F6" stroke={P.ink} strokeWidth={2.6} strokeLinejoin="round" />
        <path d={`M -6 ${s * 5} L -22 ${s * 12}`} stroke={P.ink} strokeWidth={5} strokeLinecap="round" />
        <ellipse cx={-30} cy={s * 14} rx={11} ry={8} fill="none" stroke={P.pink} strokeWidth={5} /><ellipse cx={-30} cy={s * 14} rx={11} ry={8} fill="none" stroke={P.ink} strokeWidth={1.6} />
      </g>
    ))}
    <circle r={4} fill={P.sun} stroke={P.ink} strokeWidth={2} />
  </g>
);
/** A handwritten wish above her laptop: her words, written on "computers", and the screen builds itself on "can do".
 *  WHY (review SHOULD: the product idea, asking and getting, was never shown in this stretch): a person's own
 *  handwriting on paper, never a drawn app interface. */
const WISH = { x0: 120, x1: 372, y: 300, text: 'show me the sky' };
const WishScrap: React.FC<{ t: number }> = ({ t }) => {
  const a = Q.ourComputers + 0.05, b = Q.canDo - 0.1;
  if (t < a - 0.05 || t > Q.ourComputers + 1.1) return null;
  const u = lin(t, a, b);
  const w = WISH.x1 - WISH.x0;
  const pts = `M ${WISH.x0 - 22} ${WISH.y - 60} L ${WISH.x1 + 22} ${WISH.y - 64} L ${WISH.x1 + 18} ${WISH.y + 34} L ${WISH.x0 - 20} ${WISH.y + 38} Z`;
  return (
    <g opacity={1 - lin(t, Q.ourComputers + 0.9, Q.ourComputers + 1.1)} transform={`rotate(-2 ${WISH.x0 + w / 2} ${WISH.y})`}>
      <defs><clipPath id="c-wish"><rect x={WISH.x0 - 10} y={WISH.y - 70} width={(w + 20) * u} height={110} /></clipPath></defs>
      <path d={pts} fill="rgba(42,26,53,0.18)" transform="translate(4 6)" />
      <path d={pts} fill="#FFFDF8" stroke={P.ink} strokeWidth={2.4} strokeLinejoin="round" />
      <g clipPath="url(#c-wish)"><text x={WISH.x0} y={WISH.y} textLength={w} lengthAdjust="spacingAndGlyphs" fontFamily={CAVEAT} fontWeight={700} fontSize={50} fill={P.ink}>{WISH.text}</text></g>
    </g>
  );
};
/** Her raised hand (pose "up", scale 1.1, at 200,500): where the key drops on "and so". */
export const OURS_HAND = { x: 200 + 24 * 1.1, y: 500 - 96 * 1.1 };
const OursArt: React.FC = () => {
  const t = useT();
  // WHY drawn well before the cut: the film cuts straight into an extreme close-up here, which must show
  // finished drawings, not strokes in progress
  const L = land(TURN.ours) - 1.6;
  // WHY the lower two scenes ink in on "decide", in the wide shot (review: they were all on the page from the start,
  // which spoiled "what it costs" and "our data"): the page fills as she says the three things we get to decide
  const LB = Q.decide - 0.03;
  // WHY she hops on "first time" and again on "very long while" (review: one small figure stood still for 5.8 s):
  // the key in her fist makes her bounce with excitement, and the padlock beside her answers with a small shake
  const hop = jolt(t, Q.firstTime - 0.03, -14, 0.5) + jolt(t, Q.longWhile - 0.12, -14, 0.5);
  const bob = (k: number) => jolt(t, Q.decide + k * 0.08, -10, 0.5) + (k === 0 ? hop : 0);
  // "and so": a key drops into her raised hand and her hand closes on it
  const keyFall = lin(t, Q.andSo + 0.02, Q.so + 0.02, EASE_IN);
  const grip = lin(t, Q.so, Q.so + 0.1);
  const H0 = OURS_HAND;
  const held = { x: H0.x, y: H0.y - 260 * (1 - keyFall) + jolt(t, Q.so + 0.02, 5, 0.3) };
  // then she carries it to the padlock over "a very long while" (review: it only set off 3 s later, so the long
  // opening line had one small figure standing still); it rattles in the lock on "decide", and turns on "computers"
  const kGo = lin(t, Q.veryLong + 0.05, Q.veryLong + 0.95, EASE_IN_OUT);
  const rattle = jolt(t, Q.firstTime - 0.03, 2.5, 0.5) + jolt(t, Q.weGet, 3.5, 0.55) + jolt(t, Q.decide, 3.5, 0.55);
  const kTurn = lin(t, Q.ourComputers + 0.72, Q.ourComputers + 0.88);
  const keyX = held.x + (370 - held.x) * kGo, keyY = held.y + (382 - held.y) * kGo;
  const screenP = pop(t, Q.canDo - 0.05, 0.5);
  // B: he snips the price tag
  const sGo = lin(t, Q.itCosts + 0.1, Q.costs - 0.05, EASE_IN_OUT);
  const snip = lin(t, Q.costs - 0.05, Q.costs + 0.05);
  const fall = lin(t, Q.costs + 0.05, Q.costs + 0.75, EASE_IN);
  // WHY the blades close on the string itself (review: they snipped at nothing): the pivot sits 25 px right of the
  // tag's string, which now hangs off the laptop's top-right corner so the tag no longer covers the screen
  const scX = 432 + (351 - 432) * sGo, scY = 812 + (712 - 812) * sGo;
  const carrying = t > Q.veryLong + 0.05;
  // WHY the cards start lifting at the start of "our data" and travel until its last word (review: nothing moved for
  // 0.9 s, and the last 0.4 s was empty): each one tugs the king as it leaves, and the box hops as each lands
  const DATA_FROM = Q.ourData + 0.3, DATA_GAP = 0.25, DATA_DUR = Q.data2 - (Q.ourData + 0.3) - 0.5;
  const boxHop = [0, 1, 2].reduce((a, i) => a + jolt(t, DATA_FROM + i * DATA_GAP + DATA_DUR, -6, 0.4), 0);
  const kingTug = [0, 1, 2].reduce((a, i) => a + jolt(t, DATA_FROM + i * DATA_GAP, 3, 0.45), 0);
  return (
    <>
      <Furniture n="vii" title="ours to decide" left={16} from={Q.decide - 0.1} to={Q.ourComputers - 0.05} />
      <Sheet>
        <WashBg x={390} y={420} r={150} sx={1.75} a={L} seed={3} color={P.pinkSoft} o={0.7} />
        <WashBg x={390} y={770} r={140} sx={1.75} a={LB} seed={6} color={P.sunSoft} o={0.7} />
        <WashBg x={1130} y={620} r={290} a={LB + 0.15} seed={11} color={P.lilac} o={0.7} />
        {/* A: what our computers can do */}
        <Ink d="M 140 500 L 660 500" a={L - 0.2} b={L + 0.3} w={2} c={P.inkSoft} />
        <Ink d="M 250 420 L 490 420 M 270 420 L 270 500 M 470 420 L 470 500" a={L - 0.1} b={L + 0.35} w={3.4} />
        <Laptop x={370} y={418} s={1.5} a={L} b={L + 0.4} />
        {screenP > 0 && <g transform={`translate(370 ${418 - 36}) scale(${screenP}) translate(-370 ${-(418 - 36)})`}><ThemedWindow theme="sunbreak" x={370} y={418 - 36} w={112} compact bare /></g>}
        <WishScrap t={t} />
        <Person x={200} y={500} s={1.1} a={L - 0.05} b={L + 0.55} pose={t > Q.veryLong + 0.05 && t < Q.ourComputers + 1.1 ? 'write' : 'up'} mood="smile" hair="bun" body={NEUTRAL[2]} bob={bob(0)} />
        {/* WHY he moves (review SHOULD: a grey statue for 6 s): he tips his hat and breathes, then his shoulders sag and he sways
            back as the lock opens on "decide"; less drained than before so he reads as a beaten rival, not half-erased */}
        <HatFigure x={592 + 14 * lin(t, Q.decide, Q.decide + 0.5, EASE_OUT)} y={500} s={1} crown={84} a={L - 0.2} b={L + 0.7}
          pose={t < Q.decide ? (Math.floor(t * 0.7) % 2 ? 'pat' : 'sides') : 'sides'} flip fade={0.6}
          lean={Math.sin(t * 1.4) * 1.3 + 9 * lin(t, Q.decide, Q.decide + 0.4) + jolt(t, Q.firstTime, 3, 0.6)} bob={jolt(t, Q.longWhile, -5, 0.5)} />
        <g transform={`rotate(${rattle} 370 398)`}><Padlock x={370} y={384} s={1.25} at={L} openAt={Q.ourComputers + 0.85} fallAt={Q.ourComputers + 1.05} color={P.inkSoft} /></g>
        {t > Q.andSo && t < Q.ourComputers + 1.05 && (
          <g transform={`translate(${carrying ? keyX : held.x} ${carrying ? keyY : held.y + bob(0)}) rotate(${carrying ? -90 + kTurn * 90 + rattle : 0})`}>
            <path d="M 0 -4 L 0 22 M 0 14 L 7 14 M 0 20 L 6 20" stroke={P.ink} strokeWidth={3.4} fill="none" strokeLinecap="round" />
            <circle cx={0} cy={-11} r={7} fill={P.sun} stroke={P.ink} strokeWidth={3} />
          </g>
        )}
        {/* her hand: open to catch, then a fist round the key */}
        {!carrying && <circle cx={H0.x} cy={H0.y + 2 + bob(0)} r={6.2 - grip * 0.6} fill={grip > 0.5 ? NEUTRAL[2] : P.paper} stroke={P.ink} strokeWidth={2.6} />}

        {/* B: what it costs */}
        <Ink d="M 140 860 L 660 860" a={LB} b={LB + 0.4} w={2} c={P.inkSoft} />
        <Ink d="M 140 760 L 330 760 M 160 760 L 160 860 M 310 760 L 310 860" a={LB} b={LB + 0.35} w={3.4} />
        <Laptop x={236} y={758} s={1.3} a={LB + 0.1} b={LB + 0.5} />
        {/* WHY the string is the tag's own and ends at the laptop's top edge (review: it hung from nothing); once the
            blades close on it only a short stub is left on the laptop, and the tag falls away to the right, clear of the new word */}
        {/* the cord loops from the laptop's corner up to the tag's own string; the blades close on it, and a short stub stays */}
        {snip < 1 && <Ink d="M 284 700 Q 306 676 326 690" a={LB + 0.2} b={LB + 0.4} w={2.4} />}
        {snip >= 1 && <path d="M 284 700 Q 292 690 300 688" stroke={P.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />}
        <g transform={`translate(${fall * 60} ${fall * 260}) rotate(${fall * 60} 326 722)`} opacity={1 - lin(t, Q.costs + 0.5, Q.costs + 0.8)}>
          <PriceTag x={326} y={722} s={1.1} at={LB + 0.2} swing={-6} prices={[{ v: '19.99/mo', at: LB + 0.3 }]} />
          {/* WHY a thick purple X once it is cut (review: the tag just sat there with its price intact) */}
          {snip >= 1 && <path d="M 296 740 L 356 800 M 356 740 L 296 800" stroke={P.purple} strokeWidth={9} strokeLinecap="round" opacity={lin(t, Q.costs + 0.05, Q.costs + 0.2)} />}
        </g>
        {/* once the tag is gone, the screen it hung from says what it costs now */}
        {t > Q.costs + 0.3 && (
          <text x={232} y={742} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={40} fill={P.purple} letterSpacing="-0.04em"
            opacity={lin(t, Q.costs + 0.3, Q.costs + 0.55)}>free</text>
        )}
        <Person x={480} y={860} s={1.12} a={LB + 0.1} b={LB + 0.6} pose={t > Q.itCosts && t < Q.costs + 0.5 ? 'write' : 'down'} mood="smile" hair="curly" body={NEUTRAL[4]} flip bob={bob(1)} />
        {t > LB + 0.5 && <Scissors x={t > Q.itCosts + 0.05 ? scX : 432} y={t > Q.itCosts + 0.05 ? scY : 812} r={t > Q.itCosts + 0.05 ? 190 : 200} open={1 - snip} />}

        {/* C: what happens with our data: her things fly back out of the hat, into a box of her own */}
        <Ink d="M 820 880 L 1450 880" a={LB + 0.1} b={LB + 0.5} w={2} c={P.inkSoft} />
        <Person x={920} y={880} s={1.35} a={LB + 0.2} b={LB + 0.8} pose={t > Q.ourData + 0.3 ? 'bothUp' : 'down'} hair="long" mood="smile" body={NEUTRAL[5]} hairColor={P.purple} bob={bob(2)} />
        <g transform={`translate(0 ${boxHop}) rotate(${boxHop * 0.8} 1060 880)`}>
          <Shape d="M 1010 880 L 1110 880 L 1110 820 L 1010 820 Z" a={LB + 0.3} b={LB + 0.7} fill={P.sun} w={3} />
          {/* WHY a lid that swings open for her things and slams shut on "data" (review SHOULD: the box had no lid or lock, so
              nothing said "ours"): it ends shut with a small key-hole, and the king's hand-off is over */}
          <g transform={`rotate(${-62 * lin(t, Q.ourData, DATA_FROM) * (1 - lin(t, Q.data2 - 0.05, Q.data2 + 0.1, EASE_IN))} 1010 820)`}>
            <Shape d="M 1010 820 L 1110 820 L 1130 780 L 1030 780 Z" a={LB + 0.4} b={LB + 0.8} fill={P.sunSoft} w={3} />
          </g>
          {t > Q.data2 + 0.05 && <circle cx={1060} cy={850} r={5} fill={P.ink} />}
        </g>
        {/* WHY smaller and paler than before (review: a second grey king crowded a stretch with one idea) */}
        <HatFigure x={1340} y={880} s={1.3} crown={90} a={LB + 0.1} b={LB + 1.0} pose="sides" fade={0.8} lean={kingTug} />
        {/* WHY three things in one arc (review 2026-11-20): eight drifting icons read as random, like last round's
            hooks. Three of her things lift off the hat and drop into her box, landing on "our data". */}
        {/* WHY about 2.2 times bigger, from the king's hat into her hands' reach, over a shorter distance (review: the
            icons were 14 px specks drifting across empty paper): three keepsake cards, one after another, landing on "our data" */}
        <Stream from={DATA_FROM} p0={[1340, 880 - (212 + 90) * 1.3 + 20]} p1={[1230, 330]} p2={[1070, 806]} count={3} gap={DATA_GAP} dur={DATA_DUR} s={2.3} />
      </Sheet>
    </>
  );
};
export const OURS: Spread = { id: 'ours', Art: OursArt };

// ======================= viii · the past =======================
const FreeArt: React.FC = () => {
  const L = land(TURN.free);
  return (
    <>
      <Folio left={18} />
      <Sheet>
        <Strings figA={L - 1.6} peopleA={L - 1.4} stringsA={L - 1.0} beats={[]} colourful snapAt={Q.free} fadeFrom={Q.monopolies2} fadeTo={Q.pastEnd} />
      </Sheet>
    </>
  );
};
export const FREE: Spread = { id: 'free', Art: FreeArt };

// ======================= ix · everyone's own (the riffle) =======================
// WHY each riffled page belongs to one person and one theme: "every copy is different" has to read in under a
// second a page. The page takes that theme's own colour (from its manifest tokens), the person wears plain
// clothes, and the card, big on the right, is the same card as everyone else's, made theirs.
// WHY a different action and a small prop on every page (review: four identical stick figures with only a hair
// and shirt swap): the person is doing the thing their own copy is for, so each page tells a different small story.
const HAIRS = ['curly', 'bob', 'cap', 'long', 'bun', 'tuft'] as const;
const OWN_POSE = ['write', 'up', 'hold', 'bothUp'] as const;
/** A small drawn thing beside each person, at the person's feet (page units, drawn at the person's scale). */
const OwnProp: React.FC<{ k: number; x: number; y: number }> = ({ k, x, y }) => {
  const ink = { stroke: P.ink, strokeWidth: 5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* a pot with a small plant */}
      {k === 0 && <><path d="M -34 -70 L 34 -70 L 26 0 L -26 0 Z" fill="#B98B6C" {...ink} /><path d="M 0 -70 C -4 -110 -30 -130 -50 -134 M 0 -70 C 6 -120 30 -140 52 -140 M 0 -70 L 0 -150" fill="none" {...ink} stroke={P.ink} /><path d="M -50 -134 C -30 -150 -14 -134 -14 -118 M 52 -140 C 34 -158 14 -144 16 -126" fill="#7DB28B" {...ink} /></>}
      {/* a crescent moon on a stick-star */}
      {k === 1 && <><path d="M -10 -130 C -52 -118 -52 -66 -10 -54 C -34 -78 -30 -106 -10 -130 Z" fill="#F6C84C" {...ink} /><path d="M 40 -150 l 6 14 l 15 1 l -12 10 l 4 15 l -13 -8 l -13 8 l 4 -15 l -12 -10 l 15 -1 Z" fill="#F6C84C" {...ink} strokeWidth={4} /></>}
      {/* a small cat sitting up */}
      {k === 2 && <><path d="M -30 0 C -40 -40 -32 -64 -18 -70 C -30 -78 -28 -100 -18 -108 L -6 -98 L 10 -98 L 22 -108 C 32 -100 32 -78 20 -70 C 34 -64 40 -40 30 0 Z" fill="#F3EEE8" {...ink} /><circle cx={-8} cy={-82} r={3} fill={P.ink} /><circle cx={12} cy={-82} r={3} fill={P.ink} /></>}
      {/* a chequers piece, a stack of three */}
      {k === 3 && [0, 1, 2].map((i) => <g key={i}><ellipse cx={0} cy={-18 - i * 24} rx={42} ry={14} fill={i % 2 ? '#7A3048' : '#FFC627'} {...ink} /></g>)}
    </g>
  );
};
const ownSpread = (k: number): Spread => {
  const theme: Theme = THEMES[k];
  const look = LOOK[theme];
  const Art: React.FC = () => {
    // WHY drawn complete (a far in the past): these pages fly by in under a second each; they must arrive finished
    const a = -10;
    return (
      <>
        <Sheet rough={false}>
          {/* WHY the theme's paper lightened toward cream (review: muddy mauve and grey-brown pages) */}
          <rect x={0} y={0} width={1520} height={980} fill={mixHex(look.page, '#FFFAF0', 0.45)} />
          <path d={blob(380, 560, 240, k + 1, 0.16)} fill="#fff" opacity={0.45} />
          <Person x={[380, 330, 400, 360][k]} y={820} s={3.1} a={a} b={a + 0.5} body={NEUTRAL[k * 3 + 1]} hair={HAIRS[k]} hairColor={P.ink} pose={OWN_POSE[k]} mood="smile" />
          <OwnProp k={k} x={[560, 520, 590, 560][k]} y={820} />
          <ThemedWindow theme={theme} x={[1140, 1110, 1150, 1130][k]} y={470} w={[600, 680, 520, 640][k]} r={[-2, 1.5, -1, 2][k]} bare />
        </Sheet>
        <Folio left={20 + k * 2} />
      </>
    );
  };
  return { id: `own-${k}`, Art };
};
export const VARIANTS: Spread[] = THEMES.map((_, k) => ownSpread(k));

// ======================= ix · everything =======================
// WHY one clear move (review 2026-11-20): copies of both windows flying back and forth landed on top of the
// full-size ones and read as a double exposure. Now she has her cat page; he has his night-sky page in his
// own theme, and an empty place beside it. On "open source" a copy of hers lifts off and travels into that
// place; on "everything" it is redrawn in his theme. Two cards and one copy, never overlapping, all still by
// the time the narrator says "everything".
// WHY her page is the cat and not the plants (review: the riffle's first page and this one repeated each other)
// WHY cards about a third bigger (review BLOCKER: two small cards a stranger could not read as "take it and make it yours")
const A = { x: 360, y: 880, win: { x: 380, y: 480, w: 440 } };
const B = { x: 1125, y: 700, win: { x: 1310, y: 340, w: 340 } };
const SLOT = { x: 950, y: 340, w: 340 };
const LIFT = Q.open + 0.02, FLY = LIFT + 0.14, LAND = FLY + 0.38, SKIN = LAND, SKIN_END = Q.everything2;
if (SKIN_END > Q.everything2 + 0.02) throw new Error(`take1c: the shared copy must be settled by "everything" (${SKIN_END.toFixed(2)} > ${Q.everything2.toFixed(2)})`);
const EverythingArt: React.FC = () => {
  const t = useT();
  const lift = lin(t, LIFT, FLY, EASE_OUT);
  const u = lin(t, FLY, LAND, EASE_IN_OUT);
  const settle = jolt(t, LAND, 1, 0.4);
  // WHY a small dip before the lift (anticipation) and a redraw in three beats, colour then words then icon, one on each
  // spoken word (review BLOCKER: the card swapped skins in a blink): his hand visibly makes it his
  const dip = lin(t, Q.open - 0.1, Q.open + 0.02) * (1 - lin(t, Q.open + 0.02, Q.open + 0.1)) * 12;
  const skinP = 0.34 * lin(t, SKIN, SKIN + 0.12, EASE_OUT) + 0.33 * lin(t, Q.source + 0.02, Q.source + 0.16, EASE_OUT) + 0.33 * lin(t, Q.everything2 - 0.1, Q.everything2 + 0.04, EASE_OUT);
  // the copy: lifts a little off her card, arcs over to his empty place, and shrinks to his size
  const cx = A.win.x + (SLOT.x - A.win.x) * u, cy = A.win.y + (SLOT.y - A.win.y) * u - Math.sin(u * Math.PI) * 150 - lift * 14 * (1 - u) + dip;
  const cw = A.win.w + (SLOT.w - A.win.w) * u;
  const carried = lift * (1 - lin(t, LAND - 0.08, LAND + 0.1));
  return (
    <>
      <Folio left={32} hideRight />
      <Sheet>
        <WashBg x={380} y={600} r={240} sx={1.3} a={-10} seed={21} color={LOOK.cotton.page} o={0.8} />
        {/* her, with the quill she made it with, and her cat page */}
        <Person x={A.x} y={A.y} s={1.75} a={-10} b={-9} body={NEUTRAL[3]} hair="bob" hairColor={P.ink} pose="quill" mood="smile" />
        <g transform={`translate(${A.x + 51} ${A.y - 119})`}><Quill x={0} y={0} s={0.4} r={10} /></g>
        {/* WHY it dims to 60% while its copy is away (review: the copy briefly looked like a double exposure) */}
        <g opacity={1 - 0.4 * carried}><ThemedWindow theme="cotton" x={A.win.x} y={A.win.y} w={A.win.w} r={-1.5} bare /></g>
        {/* him, under his own page and the empty place beside it */}
        <Person x={B.x} y={B.y} s={1.45} a={-10} b={-9} body={NEUTRAL[7]} hair="curly" hairColor={P.ink} pose={t > Q.everything2 ? 'bothUp' : t > LAND ? 'write' : 'down'} mood="smile"
          bob={jolt(t, LAND + 0.05, -10, 0.5)} />
        <Ink d={`M 860 ${B.y} L 1440 ${B.y}`} a={-10} b={-9} w={2} c={P.inkSoft} />
        <ThemedWindow theme="sunbreak" x={B.win.x} y={B.win.y} w={B.win.w} r={1.5} bare />
        {t < LAND && <path d={rr(SLOT.x - SLOT.w / 2, SLOT.y - windowHeight(SLOT.w) / 2, SLOT.w, windowHeight(SLOT.w), 14)} fill="none" stroke={P.inkSoft} strokeWidth={2.4}
          strokeDasharray="10 10" opacity={0.5 * (1 - lin(t, LAND - 0.2, LAND))} />}
        {/* the one copy */}
        {t >= LIFT && (
          <ThemedWindow theme="cotton" x={cx} y={cy + settle * 4} w={cw} r={-1.5 * (1 - u) + Math.sin(u * Math.PI) * 6} s={1 + carried * 0.06} shadow={carried} bare
            reskin={{ to: 'sunbreak', p: skinP }} />
        )}
      </Sheet>
    </>
  );
};
export const EVERYTHING: Spread = { id: 'everything', Art: EverythingArt };
