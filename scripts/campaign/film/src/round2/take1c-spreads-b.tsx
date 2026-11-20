// Take 1C, chapters v–ix: the handful make a quill that escapes them and makes little apps for whoever asks,
// the three things they decided are undone one by one, the strings snap, and the book ends on two friends
// passing what they made back and forth.
//  v    "blinded by their own hubris"                 chins up; their hats grow, in comic steps, out of the page
//       "created a new kind of technology"            they shove an inkwell onto their desk (nothing else)
//       "artificial intelligence"                     close: a purple quill rises out of that inkwell by itself
//       "a great treasure: shareholder value"         close on the three: a ledger rolls down in front of them;
//                                                      on "value" one line on it shoots upward and their eyes
//                                                      turn to coins on the same beat
//       "far beyond their own control"                big close-up: three gloved hands snatch at the quill; it
//                                                      pulls back, twists out of frame, and the camera whips after it
//  vi   "a tool that can make software"               the quill draws an app window; someone's request types
//                                                      itself in; a plant journal fills it
//       "the ever-scarce foundation of these monopolies" their stack, padlocked; then the quill writes more stacks
//       "for anyone who asks"                         six people, each with a window in a theme of their own
//  vii  "we get to decide. what our computers can do…" chapter ii's three pictures, undone by the people
//  viii "free ourselves… monopolies of the past"      the strings from chapter i snap; the hats fade to pencil
//  ix   "at long, long last… open source everything"  every page riffles past, each one someone's own app; then
//                                                      two friends passing their apps back and forth
import React from 'react';
import { DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT } from '../brand';
import { blob, WashBg, HatFigure, HatPose, Ink, jolt, Laptop, lin, NEUTRAL, P, Padlock, Person, pop, PriceTag, Quill, Shape, useT } from './take1c-ink';
import { LOOK, Theme, ThemedWindow, THEMES, windowHeight } from './take1c-apps';
import { Folio, Heading, Sheet } from './take1c-page';
import { Stream, Strings } from './take1c-spreads-a';
import { land, Q, TURN } from './take1c-time';
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
const WIN = { x: 1140, y: 350, w: 500 };
const WIN_H = windowHeight(WIN.w);
const WIN_A = Q.tool - 0.4, WIN_DRAW = 0.7;
// WHY these words: a real person's first ask is unsure and lower case (brand voice rules), not a command
const REQ = { text: 'my plants keep dying. can you help?', at: WIN_A + WIN_DRAW - 0.1, dur: 0.75 };
const PLANTS_AT = REQ.at + REQ.dur + 0.05;
const LEDGER = { x0: 72, x1: 420, top: 500, h: 200 };
const GROW = [70, 95, 125, 170];                 // each step of a hat's growth on "hubris"

/** How tall each man's hat is: four comic jumps on "hubris", then (after the cut) merely very tall. */
const crownAt = (t: number, j: number) => {
  if (t >= Q.these - 0.02) return 150;
  return GROW.reduce((c, g, i) => c + g * Math.min(1.12, pop(t, Q.hubris + i * 0.2 + j * 0.04, 0.26)), 84);
};
/** The hat squashes thin while it jumps up, and settles wide. */
const hatSxAt = (t: number, j: number) => {
  if (t >= Q.these - 0.02) return 1;
  return GROW.reduce((sx, _, i) => { const x = (t - (Q.hubris + i * 0.2 + j * 0.04)) / 0.24; return x > 0 && x < 1 ? sx - 0.28 * Math.sin(x * Math.PI) : sx; }, 1);
};
const manAt = (t: number, j: number) => {
  let pose: HatPose = 'sides';
  if (t > Q.believed && t < Q.shareholder) pose = 'rub';
  if (j === 2 && t > Q.created1 - 0.2 && t < Q.created1 + 0.6) pose = 'shove';
  if (t > Q.but && t < Q.control + 0.8) pose = 'reach';
  // chins up on "hubris"; a lean toward the quill "in their excitement"
  const lean = -7 * lin(t, Q.hubris - 0.1, Q.hubris + 0.3) * (1 - lin(t, Q.these - 0.05, Q.these)) + 9 * lin(t, Q.excitement - 0.1, Q.excitement + 0.3) * (1 - lin(t, Q.control + 0.8, Q.control + 1.2));
  const smug = t > Q.value + 0.3 && t < Q.but ? -Math.abs(Math.sin((t - Q.value) * 6 + j)) * 5 : 0;
  return { pose, lean, bob: smug, coins: t > Q.value + 0.3 && t < Q.but + 0.2 };
};

/** A white glove on a black sleeve, reaching in from the left edge (the close-up on "far beyond"). */
const Glove: React.FC<{ x0: number; y0: number; x: number; y: number; fist: number; s?: number }> = ({ x0, y0, x, y, fist, s = 1.6 }) => {
  const ang = (Math.atan2(y - y0, x - x0) * 180) / Math.PI;
  const st = { stroke: P.ink, strokeWidth: 2.6 / s * 1.4, strokeLinejoin: 'round' as const };
  return (
    <g>
      <path d={`M ${x0} ${y0} Q ${(x0 + x) / 2} ${(y0 + y) / 2 + 18} ${x} ${y}`} stroke={P.ink} strokeWidth={44} strokeLinecap="round" fill="none" />
      <g transform={`translate(${x} ${y}) rotate(${ang}) scale(${s})`}>
        <rect x={-8} y={-15} width={12} height={30} rx={3} fill="#FBF7F0" {...st} />
        {fist < 0.5 ? (
          <g transform={`scale(${1 - fist * 0.3})`}>
            {[-12, -1, 10].map((fy, i) => <rect key={i} x={14} y={fy - 5} width={30 - i * 3} height={10} rx={5} fill="#FBF7F0" {...st} />)}
            <rect x={4} y={-28} width={10} height={22} rx={5} fill="#FBF7F0" transform="rotate(-30 9 -10)" {...st} />
            <ellipse cx={14} cy={0} rx={16} ry={17} fill="#FBF7F0" {...st} />
          </g>
        ) : (
          <g>
            <circle cx={16} cy={0} r={17} fill="#FBF7F0" {...st} />
            <path d="M 24 -10 Q 30 -6 24 -2 M 26 -1 Q 32 3 26 7 M 24 8 Q 29 12 22 15" fill="none" {...st} />
          </g>
        )}
      </g>
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

const TreasureArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.treasure);
  // the shove: the inkwell lands at the stack's edge on "created" and skids along the desk
  const shoved = lin(t, Q.created1 + 0.05, Q.created1 + 0.55, EASE_OUT);
  const wellX = WELL.from + (WELL.x - WELL.from) * shoved;
  const wellIn = pop(t, Q.created1 - 0.12, 0.3);
  const rock = jolt(t, Q.created1 + 0.5, 5, 0.5);
  // the ledger: rolls down on "shareholder", up again on "but"
  const unroll = lin(t, Q.shareholder - 0.12, Q.shareholder + 0.22, EASE_OUT) * (1 - lin(t, Q.but - 0.15, Q.but + 0.15, EASE_IN));
  const ledH = LEDGER.h * unroll;
  // the gloved hands: they creep in through "far beyond their own", snatch on "control", close on nothing
  const reach = (i: number) => lin(t, Q.beyond - 0.3 + i * 0.12, Q.control - 0.08, EASE_OUT);
  const lunge = lin(t, Q.control - 0.04, Q.control + 0.08, EASE_OUT);
  const fist = lin(t, Q.control + 0.02, Q.control + 0.1);
  const handsOut = lin(t, Q.control + 0.7, Q.control + 1.1, EASE_IN);
  const HANDS: [number, number, number, number][] = [[340, 400, 588, 470], [330, 500, 576, 540], [350, 600, 590, 600]];
  // the quill: rises out of its inkwell on "artificial intelligence", and escapes on "control"
  const q = track(checked('treasure', [
    { t: Q.artificial + 0.05, x: REST.x, y: REST.y + 260, r: REST.r, s: REST.s },
    { t: Q.intelligence + 0.3, x: REST.x, y: REST.y - 10, r: REST.r - 4, s: REST.s, ease: EASE_OUT },
    { t: Q.intelligence + 0.7, ...REST },
    { t: Q.control - 0.22, ...REST },
    // WHY a 6-frame pull back first: the anticipation is what makes the escape read as the quill's own choice
    { t: Q.control - 0.02, x: REST.x - 10, y: REST.y + 6, r: REST.r - 16, s: REST.s, ease: EASE_IN_OUT },
    { t: Q.control + 0.28, x: 1030, y: 230, r: 34, s: REST.s, ease: BACK },
    { t: WIN_A - 0.05, x: WIN.x - WIN.w / 2, y: WIN.y - WIN_H / 2, r: -12, s: 1.1 },
    // it draws the window round, clockwise from the top-left corner
    { t: WIN_A + WIN_DRAW * 0.3, x: WIN.x + WIN.w / 2, y: WIN.y - WIN_H / 2, r: -12, s: 1.1 },
    { t: WIN_A + WIN_DRAW * 0.5, x: WIN.x + WIN.w / 2, y: WIN.y + WIN_H / 2, r: -12, s: 1.1 },
    { t: WIN_A + WIN_DRAW * 0.8, x: WIN.x - WIN.w / 2, y: WIN.y + WIN_H / 2, r: -12, s: 1.1 },
    { t: WIN_A + WIN_DRAW, x: WIN.x - WIN.w / 2, y: WIN.y - WIN_H / 2 + 40, r: -12, s: 1.1 },
    { t: PLANTS_AT, x: WIN.x + WIN.w / 2 + 30, y: WIN.y + 20, r: 8, s: 1.1 },
    { t: Q.foundation - 0.2, x: WIN.x + WIN.w / 2 + 30, y: WIN.y + 30, r: 8, s: 1.1 },
    // then the stacks, one after another
    ...COPIES.map((cx, i) => ({ t: Q.foundation + i * 0.22 + 0.2, x: cx + 50, y: 700 - i * 10, r: -8, s: 1.0 })),
    { t: TURN.anyone, x: 1460, y: 560, r: 0, s: 1.0 },
  ]), t);
  const idle = t > Q.intelligence + 0.7 && t < Q.control - 0.22 ? Math.sin(t * 1.7) * 2.5 + jolt(t, Q.createdSomething, 6, 0.6) : 0;
  const inWell = t < Q.control + 0.2;
  return (
    <>
      <Heading n="v" title="the treasure" />
      <Folio left={12} />
      <Sheet>
        <defs><clipPath id="c-well-mouth"><rect x={-200} y={-400} width={2000} height={MOUTH + 400} /></clipPath></defs>
        {/* their stack, and them on it */}
        <g transform={`rotate(${jolt(t, Q.monopolies1 - 0.1, 2, 0.9)} ${STACK.cx} 880)`}>
          <Stack cx={STACK.cx} w={STACK.w} n={STACK.n} a={TURN.treasure - 0.7} wobble={Q.monopolies1} />
          {/* WHY hidden in the snatch close-up: only their sleeves and gloves belong in that frame (a hard cut
              hides the cheat); their small bodies at the edge read as clutter */}
          {!(t > Q.far - 0.06 && t < WIN_A) && MEN.map((fx, j) => {
            const m = manAt(t, j);
            return <HatFigure key={j} x={fx} y={TOP} s={1} crown={crownAt(t, j)} hatSx={hatSxAt(t, j)} a={TURN.treasure - 0.5 + j * 0.08} b={TURN.treasure + 0.3 + j * 0.08} pose={m.pose}
              lean={m.lean} bob={m.bob} eyes={m.coins ? 'coins' : 'dots'} />;
          })}
        </g>
        {/* the padlock on "ever-scarce": theirs is the only stack there is */}
        <Padlock x={STACK.cx} y={790} s={1.6} at={Q.scarce} />
        {/* their desk */}
        <Shape d={`M ${DESK.x0} ${DESK.y} L ${DESK.x1} ${DESK.y} L ${DESK.x1} ${DESK.y + 16} L ${DESK.x0} ${DESK.y + 16} Z`} a={TURN.treasure - 0.4} b={TURN.treasure} fill={P.inkSoft} w={3} />
        <Ink d={`M ${DESK.x0 + 20} ${DESK.y + 16} L ${DESK.x0 + 26} 880 M ${DESK.x1 - 20} ${DESK.y + 16} L ${DESK.x1 - 26} 880`} a={TURN.treasure - 0.3} b={TURN.treasure + 0.1} w={5} />
        {wellIn > 0 && <g transform={`translate(${wellX} ${TOP}) scale(${Math.min(1.1, wellIn)}) translate(${-wellX} ${-TOP})`}><Inkwell x={wellX} rock={rock} /></g>}

        {/* the quill: hidden below the inkwell's mouth while it lives in it */}
        {t > Q.artificial && (
          <g clipPath={inWell ? 'url(#c-well-mouth)' : undefined}>
            <Quill x={q.x} y={q.y} s={q.s} r={q.r + idle} />
          </g>
        )}

        {/* the ledger they dream over: rolls down in front of them on "shareholder" */}
        {unroll > 0.01 && (
          <g>
            <path d={`M ${LEDGER.x0} ${LEDGER.top} L ${LEDGER.x1} ${LEDGER.top} L ${LEDGER.x1} ${LEDGER.top + ledH} L ${LEDGER.x0} ${LEDGER.top + ledH} Z`} fill="#FFFDF8" stroke={P.ink} strokeWidth={3} />
            {Array.from({ length: 8 }).map((_, i) => {
              const ly = LEDGER.top + 22 + i * 22;
              return ly < LEDGER.top + ledH - 6 ? <path key={i} d={`M ${LEDGER.x0 + 6} ${ly} L ${LEDGER.x1 - 6} ${ly}`} stroke={P.inkSoft} strokeWidth={1.4} opacity={0.35} /> : null;
            })}
            <path d={`M ${LEDGER.x0 + 44} ${LEDGER.top + 4} L ${LEDGER.x0 + 44} ${LEDGER.top + ledH - 4}`} stroke={P.purple} strokeWidth={1.6} opacity={0.5} />
            {/* the roll at the foot, still turning */}
            <rect x={LEDGER.x0 - 6} y={LEDGER.top + ledH - 9} width={LEDGER.x1 - LEDGER.x0 + 12} height={18} rx={9} fill="#F3EBDD" stroke={P.ink} strokeWidth={3} />
            {/* the bar it hangs from */}
            <path d={`M ${LEDGER.x0 - 16} ${LEDGER.top} L ${LEDGER.x1 + 16} ${LEDGER.top}`} stroke={P.ink} strokeWidth={9} strokeLinecap="round" />
            {/* "value": one line shoots up the page and out of the top of it */}
            <Ink d={`M ${LEDGER.x0 + 60} ${LEDGER.top + 176} L ${LEDGER.x0 + 104} ${LEDGER.top + 150} L ${LEDGER.x0 + 132} ${LEDGER.top + 162} L ${LEDGER.x0 + 182} ${LEDGER.top + 112} L ${LEDGER.x0 + 210} ${LEDGER.top + 124} L ${LEDGER.x0 + 262} ${LEDGER.top + 58} L ${LEDGER.x0 + 290} ${LEDGER.top + 70} L ${LEDGER.x1 - 4} ${LEDGER.top - 30} L ${LEDGER.x1 + 26} ${LEDGER.top - 88}`}
              a={Q.value - 0.02} b={Q.value + 0.32} w={7} c={P.ink} />
          </g>
        )}

        {/* "far beyond their own control": three gloved hands snatch at it */}
        {t > Q.beyond - 0.3 && handsOut < 1 && HANDS.map(([x0, y0, x1, y1], i) => {
          const p = reach(i);
          const hx = x0 + (x1 - x0) * p + lunge * 26 - handsOut * 260 + jolt(t, Q.control + 0.1, 10, 0.5) * (i - 1);
          const hy = y0 + (y1 - y0) * p + Math.sin(t * 9 + i * 2) * 4 * (1 - lunge);
          return <Glove key={i} x0={x0 - 340} y0={y0 + 10} x={hx} y={hy} fist={fist} />;
        })}

        {/* "a tool that can make software": the quill draws an app window, a request types itself in, it fills */}
        <ThemedWindow theme="botanical" x={WIN.x} y={WIN.y} w={WIN.w} a={WIN_A} draw={WIN_DRAW} contentAt={PLANTS_AT} request={REQ} />
        {/* "foundation": the same stack, written again and again, so theirs is no longer special */}
        {COPIES.map((cx, i) => <Stack key={i} cx={cx} w={180} n={STACK.n} a={Q.foundation - 0.05 + i * 0.22} dur={0.3} fill={[LOOK.poster.page, LOOK.botanical.page, LOOK.night.page][i]} />)}
      </Sheet>
    </>
  );
};
export const TREASURE: Spread = { id: 'treasure', Art: TreasureArt };
/** Where the quill and the window are, for the camera. */
export const TREASURE_MARKS = { well: { x: WELL.x, y: MOUTH }, men: { x: MEN[1], y: TOP }, win: WIN, winH: WIN_H, winA: WIN_A, stack: { x: STACK.cx, y: 760 }, copies: COPIES };

// ======================= vi · anyone =======================
// WHY each raised hand gets its own window in its own theme: the line says the tool makes software "for anyone
// who asks", and the product idea is that every person's copy looks and works differently.
const ASKERS = [150, 370, 590, 930, 1150, 1370];
const HAIRS6 = ['bob', 'tuft', 'curly', 'bun', 'cap', 'long'] as const;
const GROUND = 640;
const winAt = (i: number) => land(TURN.anyone) + 0.12 + i * 0.14;
const AnyoneArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.anyone);
  return (
    <>
      <Heading n="vi" title="anyone" />
      <Folio left={14} />
      <Sheet>
        <WashBg x={380} y={420} r={230} sx={1.4} a={-10} seed={16} color={P.lilac} o={0.55} />
        <WashBg x={1140} y={420} r={230} sx={1.4} a={-10} seed={17} color={P.pinkSoft} o={0.45} />
        <Ink d={`M 70 ${GROUND} L 1450 ${GROUND}`} a={-10} b={-9} w={2} c={P.inkSoft} />
        {ASKERS.map((x, i) => {
          const up = t > winAt(i) - 0.15;
          const p = pop(t, winAt(i), 0.45);
          return (
            <g key={i}>
              <Person x={x} y={GROUND} s={1.3} a={L - 2} b={L - 1.5} pose={up ? (i % 2 ? 'up' : 'wave') : 'down'} hair={HAIRS6[i]}
                body={NEUTRAL[i * 2]} mood="smile" bob={up ? jolt(t, winAt(i) - 0.15, -8, 0.5) : 0} />
              {p > 0 && <g transform={`translate(${x} 488) scale(${p}) translate(${-x} -488)`}><ThemedWindow theme={THEMES[i]} x={x} y={400} w={212} compact /></g>}
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
    ...ASKERS.map((x, i) => ({ t: winAt(i) + 0.05, x: x + 100, y: 330, z: 70, s: 0.75, r: -10 + i * 3 })),
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
        {screenP > 0 && <g transform={`translate(370 ${418 - 36}) scale(${screenP}) translate(-370 ${-(418 - 36)})`}><ThemedWindow theme="night" x={370} y={418 - 36} w={112} /></g>}
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
        <Stream from={Q.ourData + 0.35} p0={[1330, 880 - (212 + 100) * 1.5 + 20]} p1={[1170, 330]} p2={[1010, 830]} count={8} gap={0.13} dur={0.9} s={1.05} />
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
// WHY each riffled page belongs to one person and one theme: "every copy is different" has to read in half a
// second a page. The page itself takes that app's colour, the person wears plain clothes, and the window,
// big on the right, is the thing that is theirs.
const HAIRS = ['curly', 'bob', 'cap', 'long', 'bun', 'tuft'] as const;
const ownSpread = (k: number): Spread => {
  const theme: Theme = THEMES[k];
  const look = LOOK[theme];
  const Art: React.FC = () => {
    // WHY drawn complete (a far in the past): these pages fly by in half a second each; they must arrive finished
    const a = -10;
    return (
      <>
        <Sheet rough={false}>
          <rect x={0} y={0} width={1520} height={980} fill={look.page} />
          <path d={blob(380, 560, 240, k + 1, 0.16)} fill="#fff" opacity={0.45} />
          <Person x={380} y={820} s={3.1} a={a} b={a + 0.5} body={NEUTRAL[k * 2 + 1]} hair={HAIRS[k]} hairColor={P.ink} pose="quill" mood="smile" />
          <g transform="translate(470 610)"><Quill x={0} y={0} s={0.7} r={10} /></g>
          <ThemedWindow theme={theme} x={1140} y={470} w={600} r={[-2, 1.5, -1, 2, -1.5, 1][k]} />
        </Sheet>
        <Folio left={20 + k * 2} />
      </>
    );
  };
  return { id: `own-${k}`, Art };
};
export const VARIANTS: Spread[] = [0, 1, 2, 3, 4, 5].map(ownSpread);

// ======================= ix · everything =======================
// WHY two friends, not a crowd: the campaign's rule is one person refining one thing, or two friends passing
// something back and forth. What one makes, the other gets a copy of, and makes their own.
const FRIENDS = [[190, 860, 'botanical'], [570, 860, 'night']] as const;
const EverythingArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.everything);
  return (
    <>
      <Heading n="ix" title="everything" />
      <Folio left={32} />
      <Sheet>
        {FRIENDS.map(([x, y, theme], i) => (
          <g key={i}>
            <Person x={x} y={y} s={1.75} a={-10} b={-9} body={NEUTRAL[i ? 7 : 3]} hair={HAIRS[i]} hairColor={P.ink} pose="bothUp" mood="smile" flip={i === 1} />
            <ThemedWindow theme={theme} x={x} y={y - 330} w={300} r={(i ? 4 : -4) + Math.sin(t * 2 + i) * 1.5} compact />
          </g>
        ))}
        {/* copies of each one's app arc over to the other, back and forth */}
        {[0, 1, 2, 3].map((j) => {
          const from = FRIENDS[j % 2], to = FRIENDS[(j + 1) % 2];
          const start = L - 0.7 + j * 0.42;
          const u = (t - start) / 1.0;
          if (u <= 0 || u >= 1) return null;
          const e = EASE_IN_OUT(u);
          const x = from[0] + (to[0] - from[0]) * e, y = from[1] - 360 - Math.sin(e * Math.PI) * 260;
          return <ThemedWindow key={j} theme={from[2]} x={x} y={y} w={170} r={(e - 0.5) * 30 * (j % 2 ? -1 : 1)} s={0.7 + 0.3 * Math.sin(e * Math.PI)} compact />;
        })}
        {/* the quill, back in its ink pot */}
        <ellipse cx={1140} cy={540} rx={120} ry={16} fill={P.ink} opacity={0.12} />
        <g transform="translate(1176 500)"><Quill x={0} y={0} s={2.3} r={14} /></g>
        <Shape d="M 1080 540 L 1080 470 Q 1080 448 1102 446 L 1178 446 Q 1200 448 1200 470 L 1200 540 Z" a={-10} b={-9} fill={P.ink} w={3} />
        <Shape d="M 1106 446 L 1106 426 L 1174 426 L 1174 446 Z" a={-10} b={-9} fill={P.inkSoft} w={3} />
        <path d="M 1094 528 L 1094 476 Q 1094 462 1108 460" stroke="#fff" strokeWidth={5} opacity={0.35} fill="none" strokeLinecap="round" />
        <path d="M 1112 432 Q 1140 424 1168 432" stroke={P.purple} strokeWidth={6} fill="none" strokeLinecap="round" />
      </Sheet>
    </>
  );
};
export const EVERYTHING: Spread = { id: 'everything', Art: EverythingArt };
