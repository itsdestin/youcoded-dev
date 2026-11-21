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
import { blob, WashBg, HatFigure, HatPose, Ink, jolt, Laptop, lin, NEUTRAL, P, Padlock, Person, pop, PriceTag, Quill, Shape, useT } from './take1c-ink';
import { LOOK, rr, Theme, ThemedWindow, THEMES, windowHeight } from './take1c-apps';
import { Folio, Heading, Sheet } from './take1c-page';
import { Stream, Strings } from './take1c-spreads-a';
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
// WHY lower and a little smaller than before: drawn at y 350 the quill on the window's top edge ran off the
// top of the frame; the speech bubble below it must still clear the stacks that arrive on "foundation"
const WIN = { x: 1120, y: 425, w: 440 };
const WIN_H = windowHeight(WIN.w);
// WHY the window starts on the cut: the quill escapes the men in one shot and is already drawing in the next
const WIN_A = CUT.tool + 0.03, WIN_DRAW = 0.7;
// WHY these words: a real person's first ask is unsure and lower case (brand voice rules), not a command
// WHY it fades as the stacks arrive: it has been answered, and the stacks rise into the space below it
const REQ = { text: 'my plants keep dying. can you help?', at: WIN_A + WIN_DRAW - 0.1, dur: 0.75, out: Q.foundation - 0.3 };
const PLANTS_AT = REQ.at + REQ.dur + 0.05;
// The chart they dream over: a small easel board standing on their desk, between them and the inkwell.
// WHY on the desk, not a roller blind in front of them (review 2026-11-20): the blind hid their bodies, and
// its chart line poked out of the top and across their faces. This board never crosses a figure.
const CHART = { x0: 446, x1: 600, y0: 486, y1: 628 };
const GROW = [70, 95, 125, 170];                 // each step of a hat's growth on "hubris"
// WHY drawn well before the cut: the film cuts straight into this spread on "hubris", so it must already be finished
const DRAWN = TURN.treasure - 3;

/** How tall each man's hat is: four comic jumps on "hubris", then (after the cut on "these") merely very tall.
 *  WHY CUT.these: the camera cuts away on exactly that frame, so the hats change where nobody sees it. */
const crownAt = (t: number, j: number) => {
  if (t >= CUT.these) return 150;
  return GROW.reduce((c, g, i) => c + g * Math.min(1.12, pop(t, Q.hubris + i * 0.2 + j * 0.04, 0.26)), 84);
};
/** The hat squashes thin while it jumps up, and settles wide. */
const hatSxAt = (t: number, j: number) => {
  if (t >= CUT.these) return 1;
  return GROW.reduce((sx, _, i) => { const x = (t - (Q.hubris + i * 0.2 + j * 0.04)) / 0.24; return x > 0 && x < 1 ? sx - 0.28 * Math.sin(x * Math.PI) : sx; }, 1);
};
const manAt = (t: number, j: number) => {
  let pose: HatPose = 'sides';
  if (t > Q.believed && t < Q.shareholder) pose = 'rub';
  if (j === 2 && t > Q.created1 - 0.2 && t < Q.created1 + 0.6) pose = 'shove';
  // in the snatch the nearest one throws one long arm at the quill; the other two reach after it
  if (t > Q.far - 0.06 && t < Q.control + 1.1) pose = j === 2 ? 'stretch' : 'reach';
  // chins up on "hubris" (until the cut); greed on "treasure": all three lean in toward the chart together,
  // then on "value" they lean back with their chins up, following the arrow; a lean toward the quill on "excitement"
  const hub = -7 * lin(t, Q.hubris - 0.1, Q.hubris + 0.3) * (t >= CUT.these ? 0 : 1);
  const greed = 9 * lin(t, Q.treasure - 0.1, Q.treasure + 0.35) * (1 - lin(t, Q.value + 0.05, Q.value + 0.4));
  const chin = -6 * lin(t, Q.value + 0.05, Q.value + 0.4) * (1 - lin(t, Q.but - 0.1, Q.but + 0.25));
  const grab = 9 * lin(t, Q.excitement - 0.1, Q.excitement + 0.3) * (1 - lin(t, Q.control + 0.8, Q.control + 1.2));
  return { pose, lean: hub + greed + chin + grab };
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
  return (
    <g>
      <path d={`M ${from[0]} ${from[1]} Q ${mx} ${my} ${hx} ${hy}`} stroke={P.ink} strokeWidth={8} fill="none" strokeLinecap="round" />
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
  const o = lin(t, Q.treasure - 0.15, Q.treasure + 0.2) * (1 - lin(t, Q.but + 0.05, Q.but + 0.4));
  if (o <= 0.001) return null;
  const rise = (1 - lin(t, Q.treasure - 0.15, Q.treasure + 0.3)) * 24;
  const { x0, x1, y0, y1 } = CHART;
  const pts: [number, number][] = [[x0 + 16, y1 - 20], [x0 + 44, y1 - 38], [x0 + 64, y1 - 30], [x0 + 92, y1 - 62], [x0 + 108, y1 - 54], [x1 - 22, y0 + 26]];
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ');
  const tip = pts[pts.length - 1], prev = pts[pts.length - 2];
  const ang = (Math.atan2(tip[1] - prev[1], tip[0] - prev[0]) * 180) / Math.PI;
  const head = pop(t, Q.value + 0.28, 0.35);
  return (
    <g opacity={o} transform={`translate(0 ${rise})`}>
      <defs><clipPath id="c-chart"><rect x={x0 + 4} y={y0 + 4} width={x1 - x0 - 8} height={y1 - y0 - 8} /></clipPath></defs>
      {/* the easel's legs, standing on the desk */}
      <path d={`M ${x0 + 30} ${y1} L ${x0 + 22} ${TOP} M ${x1 - 30} ${y1} L ${x1 - 22} ${TOP}`} stroke={P.ink} strokeWidth={4} strokeLinecap="round" />
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={4} fill="#FFFDF8" stroke={P.ink} strokeWidth={3} />
      <g clipPath="url(#c-chart)">
        {[1, 2, 3, 4].map((i) => <path key={i} d={`M ${x0 + 8} ${y0 + i * 28} L ${x1 - 8} ${y0 + i * 28}`} stroke={P.inkSoft} strokeWidth={1.3} opacity={0.3} />)}
        <Ink d={line} a={Q.shareholder - 0.05} b={Q.value + 0.3} w={6} />
        {/* the arrowhead: stays inside the board's edge */}
        {head > 0 && <g transform={`translate(${tip[0]} ${tip[1]}) rotate(${ang}) scale(${Math.min(1.1, head)})`}><path d="M 4 0 L -14 -10 L -14 10 Z" fill={P.ink} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" /></g>}
      </g>
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
  const back = lin(t, Q.control + 0.55, Q.control + 0.95, EASE_IN);
  // the quill: rises out of its inkwell on "artificial intelligence", and escapes on "control"
  // WHY it escapes sideways and stays low (review 2026-11-20): rising, it left the top of the frame for half a
  // second. It now darts out of reach to the right, fully inside the frame, and the film cuts on "a tool".
  const q = track(checked('treasure', [
    { t: Q.artificial + 0.05, x: REST.x, y: REST.y + 260, r: REST.r, s: REST.s },
    { t: Q.intelligence + 0.3, x: REST.x, y: REST.y - 10, r: REST.r - 4, s: REST.s, ease: EASE_OUT },
    { t: Q.intelligence + 0.7, ...REST },
    { t: Q.control - 0.22, ...REST },
    // WHY a 6-frame pull back first: the anticipation is what makes the escape read as the quill's own choice
    { t: Q.control - 0.02, x: REST.x - 10, y: REST.y + 6, r: REST.r - 16, s: REST.s, ease: EASE_IN_OUT },
    { t: Q.control + 0.3, x: 815, y: 616, r: -30, s: REST.s, ease: BACK },
    { t: CUT.tool - 0.02, x: 822, y: 612, r: -26, s: REST.s },
    // the next shot: it is at the window's corner, and draws the window round, clockwise from the top-left
    { t: CUT.tool, x: WIN.x - WIN.w / 2, y: WIN.y - WIN_H / 2, r: -12, s: 0.85 },
    { t: WIN_A, x: WIN.x - WIN.w / 2, y: WIN.y - WIN_H / 2, r: -12, s: 0.85 },
    { t: WIN_A + WIN_DRAW * 0.3, x: WIN.x + WIN.w / 2, y: WIN.y - WIN_H / 2, r: -12, s: 0.85 },
    { t: WIN_A + WIN_DRAW * 0.5, x: WIN.x + WIN.w / 2, y: WIN.y + WIN_H / 2, r: -12, s: 0.85 },
    { t: WIN_A + WIN_DRAW * 0.8, x: WIN.x - WIN.w / 2, y: WIN.y + WIN_H / 2, r: -12, s: 0.85 },
    { t: WIN_A + WIN_DRAW, x: WIN.x - WIN.w / 2, y: WIN.y - WIN_H / 2 + 40, r: -12, s: 0.85 },
    { t: PLANTS_AT, x: WIN.x + WIN.w / 2 + 30, y: WIN.y + 20, r: 8, s: 0.85 },
    { t: Q.foundation - 0.2, x: WIN.x + WIN.w / 2 + 30, y: WIN.y + 30, r: 8, s: 0.85 },
    // then the stacks, one after another
    ...COPIES.map((cx, i) => ({ t: Q.foundation + i * 0.22 + 0.2, x: cx + 50, y: 700 - i * 10, r: -8, s: 1.0 })),
    { t: TURN.anyone, x: 1460, y: 560, r: 0, s: 1.0 },
  ]), t);
  const idle = t > Q.intelligence + 0.7 && t < Q.control - 0.22 ? Math.sin(t * 1.7) * 2.5 + jolt(t, Q.createdSomething, 6, 0.6) : 0;
  const inWell = t < Q.control + 0.2;
  const men = MEN.map((fx, j) => ({ fx, j, ...manAt(t, j) }));
  const stretch = men[2];
  // the arm leaves his shoulder and reaches for the feather's middle, where the quill stood a moment ago
  const shoulder = onMan(stretch.fx, stretch.lean, 20, -168) as [number, number];
  const target: [number, number] = [REST.x + 6, REST.y - 92];
  return (
    <>
      <Heading n="v" title="the treasure" />
      <Folio left={12} />
      <Sheet>
        <defs><clipPath id="c-well-mouth"><rect x={-200} y={-400} width={2000} height={MOUTH + 400} /></clipPath></defs>
        {/* their stack, and them on it */}
        <g transform={`rotate(${jolt(t, Q.monopolies1 - 0.1, 2, 0.9)} ${STACK.cx} 880)`}>
          <Stack cx={STACK.cx} w={STACK.w} n={STACK.n} a={DRAWN} wobble={Q.monopolies1} />
          {men.map(({ fx, j, pose, lean }) => (
            <HatFigure key={j} x={fx} y={TOP} s={1} crown={crownAt(t, j)} hatSx={hatSxAt(t, j)} a={DRAWN + 0.3 + j * 0.08} b={DRAWN + 1.1 + j * 0.08} pose={pose}
              lean={lean} eyes="dots" fist={j < 2 ? fist * (1 - back) : 0} />
          ))}
        </g>
        {/* the padlock on "ever-scarce": theirs is the only stack there is */}
        <Padlock x={STACK.cx} y={790} s={1.6} at={Q.scarce} />
        {/* their desk */}
        <Shape d={`M ${DESK.x0} ${DESK.y} L ${DESK.x1} ${DESK.y} L ${DESK.x1} ${DESK.y + 16} L ${DESK.x0} ${DESK.y + 16} Z`} a={DRAWN + 0.4} b={DRAWN + 0.8} fill={P.inkSoft} w={3} />
        <Ink d={`M ${DESK.x0 + 20} ${DESK.y + 16} L ${DESK.x0 + 26} 880 M ${DESK.x1 - 20} ${DESK.y + 16} L ${DESK.x1 - 26} 880`} a={DRAWN + 0.5} b={DRAWN + 0.9} w={5} />
        <Chart t={t} />
        {wellIn > 0 && <g transform={`translate(${wellX} ${TOP}) scale(${Math.min(1.1, wellIn)}) translate(${-wellX} ${-TOP})`}><Inkwell x={wellX} rock={rock} /></g>}

        {/* the quill: hidden below the inkwell's mouth while it lives in it */}
        {t > Q.artificial && (
          <g clipPath={inWell ? 'url(#c-well-mouth)' : undefined}>
            <Quill x={q.x} y={q.y} s={q.s} r={q.r + idle} />
          </g>
        )}

        {/* "far beyond their own control": his arm shoots out, and his hand closes on the air where it was */}
        {stretch.pose === 'stretch' && <Reach from={shoulder} to={target} p={reach * (1 - back)} fist={fist} />}

        {/* "a tool that can make software": the quill draws an app window, a request types itself in, it fills */}
        <ThemedWindow theme="meadow" x={WIN.x} y={WIN.y} w={WIN.w} a={WIN_A} draw={WIN_DRAW} contentAt={PLANTS_AT} request={REQ} />
        {/* "foundation": the same stack, written again and again, so theirs is no longer special */}
        {COPIES.map((cx, i) => <Stack key={i} cx={cx} w={180} n={STACK.n} a={Q.foundation - 0.05 + i * 0.22} dur={0.3} fill={LOOK[THEMES[i]].page} />)}
      </Sheet>
    </>
  );
};
export const TREASURE: Spread = { id: 'treasure', Art: TreasureArt };
/** Where the quill and the window are, for the camera. */
export const TREASURE_MARKS = { well: { x: WELL.x, y: MOUTH }, men: { x: MEN[1], y: TOP }, win: WIN, winH: WIN_H, winA: WIN_A, stack: { x: STACK.cx, y: 760 }, copies: COPIES };

// ======================= vi · anyone =======================
// WHY each raised hand gets its own window in its own theme: the line says the tool makes software "for anyone
// who asks", and the product idea is that every person's copy looks and works differently. Four people, four
// real themes, one window shape: the same app, made theirs.
const ASKERS = [190, 570, 950, 1330];
const HAIRS4 = ['bob', 'curly', 'bun', 'cap'] as const;
const GROUND = 640;
const ASK_W = 270;
const ASK_Y = 392;
const winAt = (i: number) => land(TURN.anyone) + 0.12 + i * 0.2;
const AnyoneArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.anyone);
  const foot = ASK_Y + windowHeight(ASK_W) / 2;
  return (
    <>
      <Heading n="vi" title="anyone" />
      <Folio left={14} hideRight />
      <Sheet>
        <WashBg x={380} y={420} r={230} sx={1.4} a={-10} seed={16} color={P.lilac} o={0.55} />
        <WashBg x={1140} y={420} r={230} sx={1.4} a={-10} seed={17} color={P.pinkSoft} o={0.45} />
        <Ink d={`M 70 ${GROUND} L 1450 ${GROUND}`} a={-10} b={-9} w={2} c={P.inkSoft} />
        {ASKERS.map((x, i) => {
          const up = t > winAt(i) - 0.15;
          const p = pop(t, winAt(i), 0.45);
          return (
            <g key={i}>
              <Person x={x} y={GROUND} s={1.3} a={L - 2} b={L - 1.5} pose={up ? (i % 2 ? 'up' : 'wave') : 'down'} hair={HAIRS4[i]}
                body={NEUTRAL[i * 3]} mood="smile" bob={up ? jolt(t, winAt(i) - 0.15, -8, 0.5) : 0} />
              {p > 0 && <g transform={`translate(${x} ${foot}) scale(${p}) translate(${-x} ${-foot})`}><ThemedWindow theme={THEMES[i]} x={x} y={ASK_Y} w={ASK_W} compact /></g>}
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
    ...ASKERS.map((x, i) => ({ t: winAt(i) + 0.05, x: x + 120, y: 320, z: 70, s: 0.75, r: -10 + i * 4 })),
    { t: Q.asks + 0.5, x: 1460, y: 200, z: 260, s: 0.75, r: 0 },
    { t: TURN.ours, x: 1500, y: 120, z: 900, s: 0.75, r: 0 },
  ]), t);
  return <FlyingQuill q={q} o={t < TURN.ours ? 1 : 0} />;
};
export const ANYONE: Spread = { id: 'anyone', Art: AnyoneArt, Pop: AnyonePop };

// ======================= vii · ours: chapter ii, undone =======================
// WHY the exact layout of chapter ii: the narrator repeats that line's three clauses word for word, so the
// pictures repeat too, in colour, and each is undone by the person it was done to, on its own clause.
const Scissors: React.FC<{ x: number; y: number; r: number; open: number }> = ({ x, y, r, open }) => (
  <g transform={`translate(${x} ${y}) rotate(${r})`}>
    {[1, -1].map((s) => (
      <g key={s} transform={`rotate(${s * open * 16})`}>
        <path d={`M 0 0 L 46 ${s * -3} L 0 ${s * 6} Z`} fill={P.paperShade} stroke={P.ink} strokeWidth={2.4} strokeLinejoin="round" />
        <circle cx={-16} cy={s * 10} r={9} fill={P.pink} stroke={P.ink} strokeWidth={2.4} />
      </g>
    ))}
    <circle r={2.6} fill={P.ink} />
  </g>
);
/** Her raised hand (pose "up", scale 1.1, at 200,500): where the key drops on "and so". */
export const OURS_HAND = { x: 200 + 24 * 1.1, y: 500 - 96 * 1.1 };
const OursArt: React.FC = () => {
  const t = useT();
  // WHY drawn well before the cut: the film cuts straight into an extreme close-up here, which must show
  // finished drawings, not strokes in progress
  const L = land(TURN.ours) - 1.6;
  const bob = (k: number) => jolt(t, Q.decide + k * 0.08, -10, 0.5);
  // "and so": a key drops into her raised hand and her hand closes on it
  const keyFall = lin(t, Q.andSo + 0.02, Q.so + 0.02, EASE_IN);
  const grip = lin(t, Q.so, Q.so + 0.1);
  const H0 = OURS_HAND;
  const held = { x: H0.x, y: H0.y - 260 * (1 - keyFall) + jolt(t, Q.so + 0.02, 5, 0.3) };
  // then she carries it to the padlock and turns it
  const kGo = lin(t, Q.ourComputers + 0.3, Q.ourComputers + 0.7, EASE_IN_OUT);
  const kTurn = lin(t, Q.ourComputers + 0.72, Q.ourComputers + 0.88);
  const keyX = held.x + (370 - held.x) * kGo, keyY = held.y + (382 - held.y) * kGo;
  const screenP = pop(t, Q.canDo - 0.05, 0.5);
  // B: he snips the price tag
  const sGo = lin(t, Q.itCosts + 0.05, Q.costs - 0.05, EASE_IN_OUT);
  const snip = lin(t, Q.costs - 0.05, Q.costs + 0.05);
  const fall = lin(t, Q.costs + 0.05, Q.costs + 0.75, EASE_IN);
  const scX = 432 + (300 - 432) * sGo, scY = 812 + (690 - 812) * sGo;
  const carrying = t > Q.ourComputers + 0.25;
  return (
    <>
      <Heading n="vii" title="ours" />
      <Folio left={16} />
      <Sheet>
        <WashBg x={390} y={420} r={150} sx={1.75} a={L} seed={3} color={P.pinkSoft} o={0.7} />
        <WashBg x={390} y={770} r={140} sx={1.75} a={L + 0.2} seed={6} color={P.sunSoft} o={0.7} />
        <WashBg x={1130} y={620} r={290} a={L + 0.4} seed={11} color={P.lilac} o={0.7} />
        {/* A: what our computers can do */}
        <Ink d="M 140 500 L 660 500" a={L - 0.2} b={L + 0.3} w={2} c={P.inkSoft} />
        <Ink d="M 250 420 L 490 420 M 270 420 L 270 500 M 470 420 L 470 500" a={L - 0.1} b={L + 0.35} w={3.4} />
        <Laptop x={370} y={418} s={1.5} a={L} b={L + 0.4} />
        {screenP > 0 && <g transform={`translate(370 ${418 - 36}) scale(${screenP}) translate(-370 ${-(418 - 36)})`}><ThemedWindow theme="sunbreak" x={370} y={418 - 36} w={112} compact /></g>}
        <Person x={200} y={500} s={1.1} a={L - 0.05} b={L + 0.55} pose={t > Q.ourComputers + 0.25 && t < Q.ourComputers + 1.1 ? 'write' : 'up'} mood="smile" hair="bun" body={NEUTRAL[2]} bob={bob(0)} />
        <HatFigure x={592} y={500} s={1} crown={84} a={L - 0.2} b={L + 0.7} pose="sides" flip fade={0.75} />
        <Padlock x={370} y={384} s={1.25} at={L} openAt={Q.ourComputers + 0.85} fallAt={Q.ourComputers + 1.05} color={P.inkSoft} />
        {t > Q.andSo && t < Q.ourComputers + 1.05 && (
          <g transform={`translate(${carrying ? keyX : held.x} ${carrying ? keyY : held.y + bob(0)}) rotate(${carrying ? -90 + kTurn * 90 : 0})`}>
            <path d="M 0 -4 L 0 22 M 0 14 L 7 14 M 0 20 L 6 20" stroke={P.ink} strokeWidth={3.4} fill="none" strokeLinecap="round" />
            <circle cx={0} cy={-11} r={7} fill={P.sun} stroke={P.ink} strokeWidth={3} />
          </g>
        )}
        {/* her hand: open to catch, then a fist round the key */}
        {!carrying && <circle cx={H0.x} cy={H0.y + 2 + bob(0)} r={6.2 - grip * 0.6} fill={grip > 0.5 ? NEUTRAL[2] : P.paper} stroke={P.ink} strokeWidth={2.6} />}

        {/* B: what it costs */}
        <Ink d="M 140 860 L 660 860" a={L + 0.1} b={L + 0.5} w={2} c={P.inkSoft} />
        <Ink d="M 140 760 L 330 760 M 160 760 L 160 860 M 310 760 L 310 860" a={L + 0.1} b={L + 0.45} w={3.4} />
        <Laptop x={236} y={758} s={1.3} a={L + 0.2} b={L + 0.6} />
        {/* the tag hangs from a short string; once snipped it tumbles away */}
        {snip < 1 && <Ink d="M 281 668 L 281 698" a={L + 0.3} b={L + 0.5} w={2} />}
        {snip >= 1 && <path d="M 281 668 L 281 680" stroke={P.ink} strokeWidth={2} />}
        <g transform={`translate(${-fall * 40} ${fall * 260}) rotate(${-fall * 60} 281 728)`} opacity={1 - lin(t, Q.costs + 0.5, Q.costs + 0.8)}>
          <PriceTag x={281} y={728} s={0.85} at={L + 0.3} swing={-6} prices={[{ v: '19.99/mo', at: L + 0.4 }]} />
        </g>
        {/* once the tag is gone, the screen it hung from says what it costs now */}
        {t > Q.costs + 0.2 && (
          <text x={236} y={738} textAnchor="middle" fontFamily={DMSANS} fontWeight={900} fontSize={34} fill={P.purple} letterSpacing="-0.04em"
            opacity={lin(t, Q.costs + 0.2, Q.costs + 0.45)}>free</text>
        )}
        <Person x={480} y={860} s={1.12} a={L + 0.25} b={L + 0.8} pose={t > Q.itCosts && t < Q.costs + 0.5 ? 'write' : 'down'} mood="smile" hair="curly" body={NEUTRAL[4]} flip bob={bob(1)} />
        {t > L + 0.6 && <Scissors x={t > Q.itCosts + 0.05 ? scX : 432} y={t > Q.itCosts + 0.05 ? scY : 812} r={t > Q.itCosts + 0.05 ? 190 : 200} open={1 - snip} />}

        {/* C: what happens with our data: her things fly back out of the hat, into a box of her own */}
        <Ink d="M 820 880 L 1450 880" a={L + 0.2} b={L + 0.6} w={2} c={P.inkSoft} />
        <Person x={905} y={880} s={1.35} a={L + 0.3} b={L + 0.9} pose={t > Q.happens ? 'bothUp' : 'down'} hair="long" mood="smile" body={NEUTRAL[5]} hairColor={P.purple} bob={bob(2)} />
        <Shape d="M 960 880 L 1060 880 L 1060 820 L 960 820 Z" a={L + 0.4} b={L + 0.8} fill={P.sun} w={3} />
        <Shape d="M 960 820 L 1060 820 L 1080 780 L 980 780 Z" a={L + 0.5} b={L + 0.9} fill={P.sunSoft} w={3} />
        <HatFigure x={1330} y={880} s={1.5} crown={100} a={L + 0.2} b={L + 1.2} pose="sides" fade={0.75} />
        {/* WHY three things in one arc (review 2026-11-20): eight drifting icons read as random, like last round's
            hooks. Three of her things lift off the hat and drop into her box, landing on "our data". */}
        <Stream from={Q.happens} p0={[1330, 880 - (212 + 100) * 1.5 + 20]} p1={[1170, 400]} p2={[1010, 812]} count={3} gap={0.16} dur={Q.data2 - Q.happens} s={1.15} />
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
      <Heading n="viii" title="the past" />
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
// clothes, and the window, big on the right, is the same window as everyone else's, made theirs.
const HAIRS = ['curly', 'bob', 'cap', 'long', 'bun', 'tuft'] as const;
const ownSpread = (k: number): Spread => {
  const theme: Theme = THEMES[k];
  const look = LOOK[theme];
  const Art: React.FC = () => {
    // WHY drawn complete (a far in the past): these pages fly by in under a second each; they must arrive finished
    const a = -10;
    return (
      <>
        <Sheet rough={false}>
          <rect x={0} y={0} width={1520} height={980} fill={look.page} />
          <path d={blob(380, 560, 240, k + 1, 0.16)} fill="#fff" opacity={0.45} />
          <Person x={380} y={820} s={3.1} a={a} b={a + 0.5} body={NEUTRAL[k * 3 + 1]} hair={HAIRS[k]} hairColor={P.ink} pose="quill" mood="smile" />
          <g transform="translate(470 610)"><Quill x={0} y={0} s={0.7} r={10} /></g>
          <ThemedWindow theme={theme} x={1140} y={470} w={600} r={[-2, 1.5, -1, 2][k]} />
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
// full-size ones and read as a double exposure. Now she has her plant page; he has his night-sky page in his
// own theme, and an empty place beside it. On "open source" a copy of hers lifts off and travels into that
// place; on "everything" it is redrawn in his theme. Two windows and one copy, never overlapping, all still by
// the time the narrator says "everything".
const A = { x: 360, y: 880, win: { x: 380, y: 500, w: 380 } };
const B = { x: 1125, y: 660, win: { x: 1300, y: 352, w: 300 } };
const SLOT = { x: 952, y: 352, w: 300 };
const LIFT = Q.open + 0.02, FLY = LIFT + 0.12, LAND = FLY + 0.45, SKIN = LAND + 0.03, SKIN_END = SKIN + 0.4;
if (SKIN_END > Q.everything2 + 0.02) throw new Error(`take1c: the shared copy must be settled by "everything" (${SKIN_END.toFixed(2)} > ${Q.everything2.toFixed(2)})`);
const EverythingArt: React.FC = () => {
  const t = useT();
  const lift = lin(t, LIFT, FLY, EASE_OUT);
  const u = lin(t, FLY, LAND, EASE_IN_OUT);
  const settle = jolt(t, LAND, 1, 0.4);
  // the copy: lifts a little off her window, arcs over to his empty place, and shrinks to his size
  const cx = A.win.x + (SLOT.x - A.win.x) * u, cy = A.win.y + (SLOT.y - A.win.y) * u - Math.sin(u * Math.PI) * 120 - lift * 14 * (1 - u);
  const cw = A.win.w + (SLOT.w - A.win.w) * u;
  const carried = lift * (1 - lin(t, LAND - 0.08, LAND + 0.1));
  return (
    <>
      <Heading n="ix" title="everything" />
      <Folio left={32} hideRight />
      <Sheet>
        <WashBg x={380} y={600} r={240} sx={1.3} a={-10} seed={21} color={LOOK.meadow.page} o={0.8} />
        {/* her, with the quill she made it with, and her plant page */}
        <Person x={A.x} y={A.y} s={1.75} a={-10} b={-9} body={NEUTRAL[3]} hair="bob" hairColor={P.ink} pose="quill" mood="smile" />
        <g transform={`translate(${A.x + 51} ${A.y - 119})`}><Quill x={0} y={0} s={0.4} r={10} /></g>
        <ThemedWindow theme="meadow" x={A.win.x} y={A.win.y} w={A.win.w} r={-1.5} />
        {/* him, under his own page and the empty place beside it */}
        <Person x={B.x} y={B.y} s={1.45} a={-10} b={-9} body={NEUTRAL[7]} hair="curly" hairColor={P.ink} pose={t > LAND ? 'bothUp' : 'down'} mood="smile"
          bob={jolt(t, LAND + 0.05, -10, 0.5)} />
        <Ink d={`M 860 ${B.y} L 1440 ${B.y}`} a={-10} b={-9} w={2} c={P.inkSoft} />
        <ThemedWindow theme="sunbreak" x={B.win.x} y={B.win.y} w={B.win.w} r={1.5} />
        {t < LAND && <path d={rr(SLOT.x - SLOT.w / 2, SLOT.y - windowHeight(SLOT.w) / 2, SLOT.w, windowHeight(SLOT.w), 14)} fill="none" stroke={P.inkSoft} strokeWidth={2.4}
          strokeDasharray="10 10" opacity={0.5 * (1 - lin(t, LAND - 0.2, LAND))} />}
        {/* the one copy */}
        {t >= LIFT && (
          <ThemedWindow theme="meadow" x={cx} y={cy + settle * 4} w={cw} r={-1.5 * (1 - u) + Math.sin(u * Math.PI) * 6} s={1 + carried * 0.04} shadow={carried}
            reskin={{ to: 'sunbreak', p: lin(t, SKIN, SKIN_END, EASE_IN_OUT) }} />
        )}
      </Sheet>
    </>
  );
};
export const EVERYTHING: Spread = { id: 'everything', Art: EverythingArt };
