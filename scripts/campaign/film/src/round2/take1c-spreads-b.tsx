// Take 1C, chapters v–ix (rebuilt in review round five; restaged in round-two polish).
//  iv→v "Blinded by their own"               on the wonderful page: three men barge into its top corner and their
//                                             too-big hats flop down over their eyes (BLINDED_POP)
//  v    "hubris"                             cut: close and low on the three, their hats shoot up out of the frame
//       "created a new kind of technology"   wide: their stack, a long desk, a tall draped thing on a cord; the tall one
//                                             tugs, and on "technology" whips the cloth away (an unveiling)
//       "artificial intelligence"            extreme close: a purple quill rises from the inkwell and wakes like a bird
//       "they believed would bring about"    seen from behind them: three backs lean in, their hats almost touching; the
//                                             quill glows in the gap, and a cage drops over it through that gap
//       "a great treasure"                   over a shoulder (a soft dark shape in the foreground): the caged quill, the
//                                             padlock slamming on the door's hasp, the coins clinking up
//       "shareholder value… excitement"      a mid shot: coin eyes, puffed chests, chins up; they leap
//       "far beyond their own control"       wide for where things are, then close on the cage top: the quill squeezes out,
//                                             a long arm grabs at air, and the quill whooshes past the lens
//  vi   "a tool that can make software"      a hand writes "my plants keep dying"; the quill sketches the card, line by line,
//                                             and its colour floods in on "software"
//       "the ever-scarce foundation…"        their stack of boxed, priced software cracks; a box slides out; they windmill
//       "for anyone who asks"                one card, close, re-drawn for each new person who asks; then three people
//                                             each holding up their copy of that one card (same frame, same mark)
//  vii  "we get to decide…"                  one woman undoes chapter ii's three pictures: she writes the padlock open, the
//                                             sky blooms out of her screen, she snips the price, she catches her things back
//  viii "free ourselves… monopolies of the past" the strings snap and curl into quills; the kings fumble their hats away
//  ix   "at long, long last… open source everything" the riffle: one card, answering each page's ask; then she passes a
//                                             copy of hers to him, and it is redrawn as his; the page becomes the end card
import React from 'react';
import { EASE_IN, EASE_IN_OUT, EASE_OUT } from '../brand';
import { loadFont as loadCaveat } from '@remotion/google-fonts/Caveat';
import { blob, HatFigure, HatPose, Ink, jolt, KeepsakeIcon, Laptop, lin, mixHex, P, Padlock, Person, PersonPose, pop, PriceTag, Quill, Shape, useT, WashBg } from './take1c-ink';
import { LOOK, Made, MadeArt, MadeCard, madeEdge, MADE_HERO, madeHeight, rr, Theme } from './take1c-apps';
import { Folio, Sheet } from './take1c-page';
import { CUT, land, Q, TURN } from './take1c-time';
import type { Spread } from './take1c-book';
// WHY a handwriting face for every wish: it is a person's note on paper, not the book's printed type
const CAVEAT = loadCaveat('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily;

// ---------- small motion helpers ----------
type Key = { t: number; x: number; y: number; r?: number; s?: number; ease?: (v: number) => number };
/** Eased position along a list of keys (for the quill). A key's `ease` shapes the move INTO it. */
const track = (keys: Key[], t: number) => {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const A = keys[i], B = keys[Math.min(i + 1, keys.length - 1)];
  const k = B.t === A.t ? 1 : (B.ease ?? EASE_IN_OUT)(Math.min(1, Math.max(0, (t - A.t) / (B.t - A.t))));
  const m = (a: number, b: number) => a + (b - a) * k;
  return { x: m(A.x, B.x), y: m(A.y, B.y), r: m(A.r ?? 0, B.r ?? 0), s: m(A.s ?? 1, B.s ?? 1) };
};
// WHY checked: the quill's keys are computed from word times; one out of order would make it jump.
const checked = (name: string, keys: Key[]) => {
  keys.forEach((k, i) => { if (i && k.t < keys[i - 1].t) throw new Error(`take1c ${name} quill key ${i} (t=${k.t.toFixed(2)}) comes before key ${i - 1}`); });
  return keys;
};
/** 0→1→0: up over [a, a+up], held, down over [b, b+down]. */
const held = (t: number, a: number, b: number, up = 0.12, down = 0.2) => lin(t, a, a + up) * (1 - lin(t, b, b + down));
const within = (t: number, a: number, b: number) => t >= a && t < b;
/** 0→1 that overshoots a little and settles: for things that pop up into place. */
const spring = (t: number, a: number, dur = 0.3) => Math.min(1.08, pop(t, a, dur));

// ---------- people: one figure spec for the whole stretch ----------
// WHY one shirt colour per look (review SHOULD: four clones in one olive fill; figures changed style from spread to
// spread): every ordinary person wears a warm, distinct colour taken from the look of the thing they made, so a
// person and their card visibly belong together, and the same person keeps the same colours wherever they appear.
const SHIRT: Record<Theme, string> = { meadow: '#93B795', cotton: '#C7A2D8', sunbreak: '#E2B45A', devils: '#C46A7E' };
const HAIR: Record<Theme, 'bun' | 'curly' | 'bob' | 'cap'> = { meadow: 'bun', cotton: 'curly', sunbreak: 'bob', devils: 'cap' };

/** A scrap of paper with a person's handwritten wish, written left to right. `a`..`b` is the writing. */
const Scrap: React.FC<{ x0: number; y: number; text: string | string[]; a: number; b: number; size?: number; o?: number; rot?: number; outlineAt?: number }> = ({ x0, y, text, a, b, size = 56, o = 1, rot = -1.4, outlineAt }) => {
  const t = useT();
  const lines = Array.isArray(text) ? text : [text];
  const oa = outlineAt ?? a - 0.12;
  if (t < oa || o <= 0.01) return null;
  // WHY a width from the text itself: stretched to a fixed width, short wishes looked typed, not handwritten
  const lw = lines.map((l) => l.length * size * 0.42);
  const w = Math.max(...lw);
  const h = lines.length * size * 0.95;
  const box = `M ${x0 - 28} ${y - size * 0.95} L ${x0 + w + 30} ${y - size * 0.98} L ${x0 + w + 26} ${y - size * 0.95 + h + 26} L ${x0 - 26} ${y - size * 0.95 + h + 30} Z`;
  // the outline draws itself (never a finished blank scrap), then the words write, line after line
  const u = lin(t, a, b, (v) => v);
  const total = lw.reduce((s, v) => s + v, 0);
  let acc = 0;
  const id = `c-scrap-${Math.round(x0)}-${Math.round(y)}-${Math.round(a * 100)}`;
  return (
    <g opacity={o} transform={`rotate(${rot} ${x0 + w / 2} ${y})`}>
      <path d={box} fill="rgba(42,26,53,0.18)" transform="translate(5 7)" opacity={lin(t, oa + 0.04, oa + 0.1)} />
      <path d={box} fill="#FFFDF8" opacity={lin(t, oa, oa + 0.08)} />
      <Ink d={box} a={oa} b={oa + 0.1} w={2.6} />
      {lines.map((l, i) => {
        const share = lw[i] / total, start = acc; acc += share;
        const p = Math.max(0, Math.min(1, (u - start) / share));
        if (p <= 0) return null;
        // WHY no clip once a line is written (round 2 review NIT: 'for the ki' showed cut short): the clip's width is an
        // estimate of the handwriting's width, so a finished line is drawn whole
        if (p >= 1) return <text key={i} x={x0} y={y + i * size * 0.95} fontFamily={CAVEAT} fontWeight={700} fontSize={size} fill={P.ink}>{l}</text>;
        return (
          <g key={i}>
            <defs><clipPath id={`${id}-${i}`}><rect x={x0 - 6} y={y + i * size * 0.95 - size} width={(lw[i] + 30) * p} height={size * 1.3} /></clipPath></defs>
            <text x={x0} y={y + i * size * 0.95} clipPath={`url(#${id}-${i})`} fontFamily={CAVEAT} fontWeight={700} fontSize={size} fill={P.ink}>{l}</text>
          </g>
        );
      })}
    </g>
  );
};

/** A drawn hand holding a graphite pencil, nib at (x, y), the arm reaching in from below right.
 *  WHY redrawn (round 2 review: a flesh circle on a green tube with a yellow pencil read as clip-art): four fingers
 *  wrapped round the pencil, a thumb over it and a cuff, in the book's plum line; the pencil is grey graphite so the
 *  only saturated colour on the page stays the purple quill. `roll` tips the wrist as it writes. */
const Hand: React.FC<{ x: number; y: number; roll?: number; sleeve?: string }> = ({ x, y, roll = 0, sleeve = SHIRT.meadow }) => {
  const st = { stroke: P.ink, strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <g transform={`translate(${x} ${y}) rotate(${-38 + roll})`}>
      {/* the sleeve and cuff, running off down and to the right */}
      <path d="M 92 30 C 150 60 260 150 520 330 L 470 420 C 260 260 150 140 80 74 Z" fill={sleeve} {...st} />
      <path d="M 84 22 L 112 34 L 92 82 L 66 70 Z" fill={mixHex(sleeve, '#FFFFFF', 0.35)} {...st} />
      {/* the pencil: graphite point, shaved wood, a grey barrel */}
      <path d="M 0 0 L 12 -5 L 12 5 Z" fill={P.ink} />
      <path d="M 12 -5 L 30 -9 L 30 9 L 12 5 Z" fill="#EBDCC8" {...st} strokeWidth={2.2} />
      <path d="M 30 -9 L 128 -9 L 128 9 L 30 9 Z" fill="#B9B1BF" {...st} strokeWidth={2.4} />
      <path d="M 30 -2 L 128 -2" stroke={P.inkSoft} strokeWidth={1.4} opacity={0.6} />
      {/* the hand: the palm behind, four fingers curled under the pencil, the thumb pressing on top */}
      <path d="M 50 8 C 46 30 62 52 88 56 C 108 58 118 40 112 22 C 106 6 84 -4 66 0 Z" fill={P.paper} {...st} />
      {[40, 52, 64, 76].map((fx, i) => (
        <path key={i} d={`M ${fx} 6 C ${fx - 8} 10 ${fx - 8} 22 ${fx + 2} 24 C ${fx + 10} 24 ${fx + 12} 14 ${fx + 8} 8`} fill={P.paper} {...st} strokeWidth={2.4} />
      ))}
      <path d="M 86 2 C 74 -10 54 -16 42 -12 C 36 -9 38 -4 46 -3 C 58 -2 70 2 80 12" fill={P.paper} {...st} strokeWidth={2.6} />
    </g>
  );
};

// ======================= v · the handful: three characters, not three clones =======================
// WHY three silhouettes (review BLOCKER: three identical cut-outs with dot eyes, frozen for seconds at a time): a short
// round one, a middle one with a monocle, and a tall thin one, each with eyes and a mouth that change on the words
// (slits to scheme, coins for greed, wide circles for shock, a grin), and a run of big, readable poses on their words.
const S = 1.3;
const CH = [{ sx: 1.2, sy: 0.84 }, { sx: 1, sy: 1 }, { sx: 0.84, sy: 1.17 }];
type Eyes = 'dots' | 'slit' | 'wide' | 'coins' | 'down';
type Mouth = 'none' | 'grin' | 'o' | 'smug';
type ManState = { pose: HatPose; lean: number; bob: number; crown: number; hatSx: number; drop: number; eyes: Eyes; mouth: Mouth; px: number; py: number; fist: number; fade?: number; hands?: [number, number][]; back?: boolean };
/** Their eyes and mouth, in the hat figure's own drawing units (its head sits at 0,-197). */
const ManFace: React.FC<{ eyes: Eyes; mouth: Mouth; monocle?: boolean; ink?: string }> = ({ eyes, mouth, monocle, ink = P.ink }) => (
  <g transform="rotate(-10 0 -197)">
    {eyes === 'dots' && <><circle cx={-5} cy={-199} r={2.4} fill={ink} /><circle cx={6} cy={-199} r={2.4} fill={ink} /></>}
    {eyes === 'down' && <><circle cx={-5} cy={-196} r={2.4} fill={ink} /><circle cx={6} cy={-196} r={2.4} fill={ink} /></>}
    {eyes === 'slit' && <path d="M -9 -199 L -1 -198 M 2 -198 L 10 -199" stroke={ink} strokeWidth={2.4} strokeLinecap="round" />}
    {eyes === 'wide' && [-5, 6].map((cx) => <g key={cx}><circle cx={cx} cy={-200} r={4.6} fill={P.paper} stroke={ink} strokeWidth={1.4} /><circle cx={cx} cy={-200} r={1.9} fill={ink} /></g>)}
    {eyes === 'coins' && [-5, 6].map((cx) => <g key={cx}><circle cx={cx} cy={-200} r={5.6} fill={P.sun} stroke={ink} strokeWidth={1.4} /><path d={`M ${cx} -203.5 L ${cx} -196.5`} stroke={ink} strokeWidth={1.2} opacity={0.7} /></g>)}
    {mouth === 'grin' && <path d="M -7 -190 Q 1 -183 9 -190 Q 1 -186.5 -7 -190 Z" fill={ink} stroke={ink} strokeWidth={1.6} strokeLinejoin="round" />}
    {mouth === 'o' && <ellipse cx={1} cy={-188} rx={2.6} ry={3.2} fill={ink} />}
    {mouth === 'smug' && <path d="M -3 -189 Q 3 -187 8 -191" stroke={ink} strokeWidth={1.8} fill="none" strokeLinecap="round" />}
    {/* WHY gold: the monocle and its chain are the one bit of the campaign's warm accent on them, and it says "money" */}
    {monocle && <><circle cx={6} cy={-200} r={6.2} fill="none" stroke={P.sun} strokeWidth={1.8} /><path d="M 12 -198 C 16 -186 14 -170 20 -152" stroke={P.sun} strokeWidth={1.2} fill="none" /></>}
  </g>
);
/** One of the handful at (x, y): his own proportions, his face drawn over the shared hat figure. */
const Man: React.FC<{ j: number; x: number; y: number; st: ManState; a: number; b: number }> = ({ j, x, y, st, a, b }) => (
  <g transform={`translate(${x} ${y}) scale(${S * CH[j].sx * st.px} ${S * CH[j].sy * st.py})`}>
    <HatFigure x={0} y={0} s={1} a={a} b={b} crown={st.crown} hatSx={st.hatSx} drop={st.drop} pose={st.pose} lean={st.lean} bob={st.bob} eyes="none" fist={st.fist} fade={st.fade ?? 0} hands={st.hands} back={st.back} />
    {/* WHY hidden while the hat covers the head: the face must not draw over the hat ("blinded") */}
    {st.drop < 0.35 && !st.back && <g transform={`translate(0 ${st.bob}) rotate(${st.lean})`}><ManFace eyes={st.eyes} mouth={st.mouth} monocle={j === 1} ink={st.fade ? mixHex(P.ink, P.paper, st.fade * 0.66) : P.ink} /></g>}
  </g>
);
/** Where a point on man j (in his drawing units) lands on the page. */
const manPt = (j: number, x: number, y: number, st: ManState, lx: number, ly: number): [number, number] => {
  const r = (st.lean * Math.PI) / 180;
  const qx = lx * Math.cos(r) - ly * Math.sin(r), qy = lx * Math.sin(r) + ly * Math.cos(r) + st.bob;
  return [x + qx * S * CH[j].sx * st.px, y + qy * S * CH[j].sy * st.py];
};
const plain = (crown: number): ManState => ({ pose: 'sides', lean: 0, bob: 0, crown, hatSx: 1, drop: 0, eyes: 'dots', mouth: 'smug', px: 1, py: 1, fist: 0 });

// ---------- "Blinded by their own": on the wonderful page ----------
// WHY on the previous page (round 2 review BLOCKER): the "something wonderful happened." plate must stay up until "hubris",
// so these four words play on its page, in the empty top corner the plate never covers: their tower slides in from the
// right edge, the three peer at the wonder, and their too-big hats flop down to their bow ties. They shove them back
// up on "own", and the film cuts to them on "hubris".
// WHY the left corner (render: in the right one their tower hid the open door the pen had just drawn)
const BL = { x: 262, top: 336, k: 0.55, enter: Q.blinded - 0.12 };
export const BlindedPop: React.FC = () => {
  const t = useT();
  if (t < BL.enter || t >= TURN.treasure) return null;
  const slide = 1 - lin(t, BL.enter, BL.enter + 0.36, EASE_OUT);
  const dx = -480 * slide;
  return (
    <Sheet>
      <g transform={`translate(${dx} 0)`}>
        {/* their tower, the same boxed stack they stand on in the next chapter */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const y0 = BL.top + i * 52, jit = [0, 8, -5, 10, 3, -6, 6, 0][i];
          return <path key={i} d={`M ${BL.x - 118 + jit} ${y0} L ${BL.x + 118 + jit} ${y0} L ${BL.x + 118 + jit} ${y0 + 52} L ${BL.x - 118 + jit} ${y0 + 52} Z`} fill="#BDB2BF" stroke={P.ink} strokeWidth={3.4} strokeLinejoin="round" />;
        })}
        {[0, 1, 2].map((j) => {
          const d = j * 0.07;
          // the hats flop down over their eyes, bouncing on the bow tie; they grope blind; on "own" both hands meet the
          // brim and shove the hat back up
          const down = lin(t, Q.blinded + 0.02 + d, Q.blinded + 0.22 + d, EASE_IN) + jolt(t, Q.blinded + 0.22 + d, -0.12, 0.35);
          const up = lin(t, Q.ownHubris - 0.1 + d, Q.ownHubris + 0.12 + d, EASE_OUT);
          const drop = 1.15 * down * (1 - up);
          const pushing = within(t, Q.their + d, Q.ownHubris + 0.2 + d);
          const hatY = -212 + drop * 34;
          const st: ManState = {
            ...plain(BASE_CROWN), drop,
            lean: Math.sin(t * 2.2 + j) * 1.5 + Math.sin(t * 11 + j * 2) * 5 * drop + 6,
            pose: pushing ? 'grab' : drop > 0.5 ? 'hold' : 'sides',
            hands: pushing ? [[-24, hatY + 4], [24, hatY + 4]] : undefined,
            eyes: t > Q.ownHubris + 0.1 ? 'slit' : 'wide', mouth: t > Q.ownHubris + 0.1 ? 'smug' : 'o',
            bob: jolt(t, Q.blinded + 0.2 + d, 6, 0.4),
          };
          return <g key={j} transform={`translate(${BL.x - 80 + j * 80} ${BL.top}) scale(${BL.k})`}><Man j={j} x={0} y={0} st={st} a={-10} b={-9} /></g>;
        })}
      </g>
    </Sheet>
  );
};

// ---------- the layout of the treasure spread ----------
// WHY across both pages (review BLOCKER: 23 s of the men in the left third and an empty right page): their stack on
// the left page, a long desk running over the gutter, the inkwell (and later its cage) on the right page, and the
// card the quill makes above the desk's far end. Every shot then has something on both sides of the frame.
const STACK = { cx: 420, w: 380, n: 5, h: 50 };
const TOP = 880 - STACK.n * STACK.h;            // 630: the top of their stack, and of their desk
const MEN = [300, 420, 540];
const DESK = { x0: 610, x1: 1250 };
const WELL = 900;
const MOUTH = TOP - 68;
// WHY upright and a little smaller (round 2 review: at -18 degrees its feather poked out through the bars, so it was not
// really caged): at -30 degrees the feather stands straight up inside the cage
const REST = { x: WELL, y: MOUTH + 8, r: -30, s: 1.1 };
const CAGE = { x: WELL, w: 150, top: 352, band: 448 };
const BASE_CROWN = 100;                          // a little too big from the start: it is what makes "blinded" possible
const GROW = [44, 36];
const HAT_K = [0.9, 1, 0.95];
const CAGE_AT = Q.bringAbout + 0.12;              // the cage starts to fall
const CAGE_LAND = CAGE_AT + 0.3;
// the shots of this spread (see SHOTS in take1c.tsx): which drawing is on the page depends on the shot
type Shot5 = 'hubris' | 'unveil' | 'quill' | 'huddle' | 'shoulder' | 'value' | 'escape' | 'cagetop' | 'card' | 'stack';
const shotAt = (t: number): Shot5 =>
  t < CUT.these ? 'hubris' : t < CUT.artificial ? 'unveil' : t < CUT.believe ? 'quill' : t < CUT.cage ? 'huddle' : t < CUT.value ? 'shoulder'
    : t < CUT.escape ? 'value' : t < CUT.beyond ? 'escape' : t < CUT.tool ? 'cagetop' : t < CUT.scarce ? 'card' : 'stack';

/** How tall each man's hat is: two comic jumps on "hubris", each landing with an overshoot, then it stays. */
const crownAt = (t: number, j: number) =>
  GROW.reduce((c, g, i) => c + g * HAT_K[j] * Math.min(1.14, pop(t, Q.hubris + i * 0.2 + j * 0.04, 0.26)), BASE_CROWN);
const hatSxAt = (t: number, j: number) =>
  GROW.reduce((sx, _, i) => { const x = (t - (Q.hubris + i * 0.2 + j * 0.04)) / 0.24; return x > 0 && x < 1 ? sx - 0.28 * Math.sin(x * Math.PI) : sx; }, 1);
// WHY the tall one holds the cord now (round 2 review: from the middle man the cord crossed the tall one's chest):
// he stands nearest the desk, so the cord runs from his hand straight to the drape without crossing anybody
const CORD_MAN = 2;

/** Everything each man does in chapters v and vi, beat by beat on the narrator's words. */
const manAt = (t: number, j: number): ManState => {
  const d = j * 0.07;                                 // WHY: each reacts a couple of frames after his neighbour
  let pose: HatPose = 'sides', eyes: Eyes = 'dots', mouth: Mouth = 'smug';
  let lean = Math.sin(t * (1.6 + j * 0.4) + j * 2.3) * (0.8 + j * 0.4);   // idle weight shift
  let bob = 0, px = 1, py = 1 + 0.012 * Math.sin(t * 2.7 + j * 1.1), fist = 0;
  // "hubris": chins up, chests out, eyes shut in self-satisfaction, as the hats shoot up
  if (within(t, Q.hubris, Q.these)) eyes = 'slit';
  lean += -9 * held(t, Q.hubris - 0.05 + d, Q.these - 0.2, 0.25, 0.3);
  px += 0.1 * held(t, Q.hubris + d, Q.these - 0.2, 0.2, 0.3);
  bob += jolt(t, Q.hubris + 0.3 + j * 0.1, -9, 0.45);
  // "created": the two away from the cord fling their arms up, ta-da
  if (within(t, Q.created1 - 0.05 + d, Q.newKind + 0.1)) { if (j !== CORD_MAN) pose = 'grab'; mouth = 'grin'; }
  bob += jolt(t, Q.created1 + d, -12, 0.5);
  if (j === CORD_MAN && within(t, Q.these, Q.technology2 + 0.45)) pose = 'bar';
  // "a new kind of": they lean in, scheming; on "kind" he takes up the slack and leans back (the anticipation);
  // "technology": he yanks the cord, and they gape at what is under it
  if (within(t, Q.newKind, Q.technology2)) { eyes = 'slit'; mouth = 'smug'; if (j !== CORD_MAN) lean += 7 * lin(t, Q.newKind, Q.newKind + 0.3); }
  if (j === CORD_MAN) {
    lean += -7 * held(t, Q.newKind + 0.3, Q.technology2 - 0.06, 0.25, 0.08) - 18 * held(t, Q.technology2 - 0.06, Q.technology2 + 0.25, 0.08, 0.3);
    if (within(t, Q.technology2 - 0.06, Q.technology2 + 0.4)) pose = 'key';
  }
  if (within(t, Q.technology2 + 0.1, CUT.believe)) {
    eyes = 'wide'; mouth = 'grin'; if (j !== CORD_MAN && t > Q.technology2 + 0.45) pose = 'rub';
    // WHY one after another (round 2 review NIT: 1 s of idle sway after the reveal): each leans toward the well in turn
    lean += 9 * held(t, Q.technology2 + 0.45 + (2 - j) * 0.22, Q.artificial - 0.1, 0.2, 0.2);
  }
  // the cage lands: smug; "treasure": coin eyes and rubbing hands until the escape
  if (within(t, CAGE_LAND, Q.treasure)) { eyes = 'dots'; mouth = 'smug'; pose = j === 2 ? 'pat' : j === 0 ? 'bar' : 'sides'; }
  if (within(t, Q.treasure, Q.createdSomething)) { eyes = 'coins'; mouth = 'grin'; pose = 'rub'; }
  // "value" (a mid shot): chests puffed right out, chins up, a harrumph bob, each to his own angle
  // WHY +30% and a real lean back (round 2 review NIT: a 12% puff was invisible)
  const puff = held(t, Q.value + j * 0.1, Q.excitement - 0.05, 0.2, 0.2);
  px += 0.3 * puff; py -= 0.05 * puff; lean += [-9, -12, -10][j] * puff;
  bob += jolt(t, Q.value + 0.32 + j * 0.1, 7, 0.45);
  if (puff > 0.5) { pose = 'pat'; mouth = 'smug'; }
  // "excitement": they leap, arms up
  const leap = Math.max(0, Math.sin(Math.min(1, Math.max(0, (t - (Q.excitement + j * 0.11)) / 0.42)) * Math.PI));
  bob -= 46 * leap;
  if (leap > 0.05) { pose = 'grab'; eyes = 'wide'; mouth = 'grin'; }
  // "created something": they turn to the cage; on "something" the quill stirs and they freeze, aghast
  if (within(t, Q.createdSomething, Q.somethingFar)) { eyes = 'dots'; mouth = 'none'; lean += 4; pose = 'sides'; }
  if (within(t, Q.somethingFar, CUT.beyond)) { eyes = 'wide'; mouth = 'o'; if (j < 2) pose = 'hold'; lean += 5 * lin(t, Q.somethingFar, Q.somethingFar + 0.2); }
  if (j === 2 && within(t, Q.far - 0.06, CUT.beyond)) { pose = 'stretch'; lean += 10 * lin(t, Q.far - 0.06, Q.far + 0.2); }
  // chapter vi, "ever-scarce": smug again on their padlocked stack; "foundation": they look down at the crack
  if (t >= CUT.scarce) {
    lean = Math.sin(t * (1.6 + j * 0.4) + j * 2.3) * (0.8 + j * 0.4); px = 1; py = 1; fist = 0; bob = 0;
    eyes = 'dots'; mouth = 'smug'; pose = j === 1 ? 'pat' : 'sides';
    if (t > Q.foundation) { eyes = 'down'; mouth = 'o'; }
    // "monopolies": a box slides out from under them and they windmill to keep their balance
    if (t > Q.monopolies1 + 0.15) {
      eyes = 'wide';
      // WHY two arm positions swapped at a readable pace, and leans out of step (render: a pose every 3 frames read as a glitch,
      // and in-phase leans merged them into one blob)
      pose = (['grab', 'reach'] as HatPose[])[(Math.floor(t * 5.5) + j) % 2];
      lean = Math.sin(t * 11 + j * 2.6) * 7;
    }
  }
  return { pose, lean, bob, crown: crownAt(t, j), hatSx: hatSxAt(t, j), drop: 0, eyes, mouth, px, py, fist };
};

/** The long reaching arm: a coat sleeve in the men's own ink, with a white cuff and a hand that closes on nothing.
 *  WHY a thick sleeve and a real hand (round 2 render: a thin line with a dot read as a fishing rod) */
const Reach: React.FC<{ from: [number, number]; to: [number, number]; p: number; fist: number }> = ({ from, to, p, fist }) => {
  if (p <= 0.001) return null;
  const hx = from[0] + (to[0] - from[0]) * p, hy = from[1] + (to[1] - from[1]) * p;
  const mx = (from[0] + hx) / 2, my = Math.min(from[1], hy) - 40 * p;
  const ang = Math.atan2(hy - my, hx - mx);
  const cx = hx - Math.cos(ang) * 20, cy = hy - Math.sin(ang) * 20;
  const arm = `M ${from[0]} ${from[1]} Q ${mx} ${my} ${cx} ${cy}`;
  const deg = (ang * 180) / Math.PI;
  const open = 1 - fist;
  return (
    <g>
      <path d={arm} stroke={P.ink} strokeWidth={30} fill="none" strokeLinecap="round" />
      <g transform={`translate(${hx} ${hy}) rotate(${deg})`}>
        {/* the cuff */}
        <path d="M -26 -16 L -14 -16 L -14 16 L -26 16 Z" fill={P.paper} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
        {/* the hand: open fingers spread toward the quill, curling into a fist on "control" */}
        {[-0.7, -0.25, 0.2, 0.62].map((d, i) => {
          const len = 10 + 16 * open;
          const bx = Math.cos(d) * 10, by = Math.sin(d) * 10;
          const ex = bx + Math.cos(d * (0.4 + 0.6 * open)) * len, ey = by + Math.sin(d * (0.4 + 0.6 * open)) * len + fist * 8;
          return <path key={i} d={`M ${bx} ${by} Q ${(bx + ex) / 2 + 3 * fist} ${(by + ey) / 2 - 4 * open} ${ex} ${ey}`} stroke={P.ink} strokeWidth={10} fill="none" strokeLinecap="round" />;
        })}
        {[-0.7, -0.25, 0.2, 0.62].map((d, i) => {
          const len = 10 + 16 * open;
          const bx = Math.cos(d) * 10, by = Math.sin(d) * 10;
          const ex = bx + Math.cos(d * (0.4 + 0.6 * open)) * len, ey = by + Math.sin(d * (0.4 + 0.6 * open)) * len + fist * 8;
          return <path key={i} d={`M ${bx} ${by} Q ${(bx + ex) / 2 + 3 * fist} ${(by + ey) / 2 - 4 * open} ${ex} ${ey}`} stroke={P.paper} strokeWidth={4.4} fill="none" strokeLinecap="round" />;
        })}
        <ellipse cx={-2} cy={0} rx={15} ry={14} fill={P.paper} stroke={P.ink} strokeWidth={3} />
        <path d={`M -6 -12 Q ${2 + 6 * open} -26 ${10 + 8 * open} -22`} stroke={P.ink} strokeWidth={9} fill="none" strokeLinecap="round" />
        <path d={`M -6 -12 Q ${2 + 6 * open} -26 ${10 + 8 * open} -22`} stroke={P.paper} strokeWidth={3.6} fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
};

/** The inkwell. Its mouth is at MOUTH. */
const Inkwell: React.FC<{ x: number; glow: number }> = ({ x, glow }) => (
  <g>
    <ellipse cx={x} cy={TOP + 2} rx={46} ry={6} fill={P.ink} opacity={0.12} />
    <path d={`M ${x - 38} ${TOP} L ${x - 38} ${TOP - 42} Q ${x - 38} ${TOP - 56} ${x - 22} ${TOP - 56} L ${x + 22} ${TOP - 56} Q ${x + 38} ${TOP - 56} ${x + 38} ${TOP - 42} L ${x + 38} ${TOP} Z`}
      fill={P.ink} stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
    <path d={`M ${x - 18} ${TOP - 56} L ${x - 18} ${MOUTH} L ${x + 18} ${MOUTH} L ${x + 18} ${TOP - 56} Z`} fill={P.inkSoft} stroke={P.ink} strokeWidth={3} />
    <path d={`M ${x - 27} ${TOP - 10} L ${x - 27} ${TOP - 40} Q ${x - 27} ${TOP - 47} ${x - 20} ${TOP - 48}`} stroke="#fff" strokeWidth={4} opacity={0.3} fill="none" strokeLinecap="round" />
    {/* WHY a ring of purple that swells when the cloth comes off (round 2: twice as big): the reveal says "something is
        alive in here" without a sparkle */}
    {glow > 0.01 && <ellipse cx={x} cy={MOUTH} rx={16 + glow * 26} ry={3.4 + glow * 7} fill={P.purple} opacity={0.25 * glow} />}
    <ellipse cx={x} cy={MOUTH} rx={16 + glow * 10} ry={3.4 + glow * 2.4} fill={P.purple} />
  </g>
);

/** The birdcage they lower over the quill: drawn bars, a domed top, and a door whose hasp takes the padlock. */
const Cage: React.FC<{ t: number }> = ({ t }) => {
  if (t < CAGE_AT) return null;
  const fall = lin(t, CAGE_AT, CAGE_LAND, EASE_IN);
  const dy = -560 * (1 - fall);
  const sq = jolt(t, CAGE_LAND, 0.07, 0.35);
  const rattle = jolt(t, Q.treasure + 0.02, 2.4, 0.4) + (within(t, Q.somethingFar, Q.beyond + 0.3) ? Math.sin(t * 40) * 1.4 : 0);
  const { x, w, top, band } = CAGE;
  const x0 = x - w / 2, x1 = x + w / 2;
  const bars = [0, 1, 2, 3, 4, 5, 6].map((i) => x0 + 8 + i * ((w - 16) / 6));
  const st = { stroke: P.ink, strokeWidth: 3.6, fill: 'none', strokeLinecap: 'round' as const };
  // WHY a door with a hasp (round 2 review: the padlock hung in the air beside the cage, locking nothing)
  const door = { x0: bars[4] - 3, x1: bars[6] + 3, y0: band + 10, y1: TOP - 20 };
  const hasp = { x: door.x1 + 6, y: (door.y0 + door.y1) / 2 - 8 };
  return (
    <g transform={`translate(${rattle} ${dy}) translate(${x} ${TOP}) scale(${1 + sq} ${1 - sq}) translate(${-x} ${-TOP})`}>
      {bars.map((bx, i) => <path key={i} d={`M ${bx} ${TOP - 10} L ${bx} ${band} Q ${bx} ${top + 6} ${x} ${top}`} {...st} />)}
      <path d={`M ${x0} ${band} Q ${x0} ${top - 10} ${x} ${top - 12} Q ${x1} ${top - 10} ${x1} ${band}`} {...st} strokeWidth={4.4} />
      <path d={`M ${x0 - 4} ${band} L ${x1 + 4} ${band} M ${x0 - 4} ${band + 80} L ${x1 + 4} ${band + 80}`} {...st} strokeWidth={4} />
      <path d={`M ${door.x0} ${door.y0} L ${door.x1} ${door.y0} L ${door.x1} ${door.y1} L ${door.x0} ${door.y1} Z`} {...st} strokeWidth={4.2} />
      <path d={`M ${door.x1 - 2} ${hasp.y - 9} L ${hasp.x + 6} ${hasp.y - 9} L ${hasp.x + 6} ${hasp.y + 9} L ${door.x1 - 2} ${hasp.y + 9}`} {...st} strokeWidth={3.4} />
      <path d={rr(x0 - 10, TOP - 14, w + 20, 14, 4)} fill={P.inkSoft} stroke={P.ink} strokeWidth={3} />
      <circle cx={x} cy={top - 24} r={11} {...st} strokeWidth={4} />
      {/* WHY big and on its own beat (review: a 1.5% padlock): it slams shut on "treasure", hanging from the hasp */}
      <Padlock x={hasp.x + 2} y={hasp.y + 52} s={1.55} at={Q.treasure} />
    </g>
  );
};

/** The treasure: three uneven stacks of gold coins clinking up beside the cage on "treasure"; one tips off.
 *  WHY inked and uneven (round 2 review NIT: flat yellow stacks were stock clip-art next to the hand-drawn cage). */
const Coins: React.FC<{ t: number }> = ({ t }) => {
  if (t < Q.treasure) return null;
  const stacks: [number, number][] = [[700, 6], [752, 9], [800, 5]];
  let n = 0;
  return (
    <g>
      {stacks.map(([cx, cnt], si) => Array.from({ length: cnt }).map((_, i) => {
        const k = pop(t, Q.treasure + 0.08 + (n++) * 0.05, 0.2);
        if (k <= 0) return null;
        const wob = Math.sin(i * 2.7 + si) * 3.5;
        let x = cx + wob, y = TOP - 7 - i * 10 - (1 - Math.min(1, k)) * 50, r = Math.sin(i * 1.9 + si) * 4;
        // the top coin of the tall stack tips off and rolls a little way along the desk
        if (si === 1 && i === cnt - 1) {
          const tip = lin(t, Q.value - 0.4, Q.value - 0.1, EASE_IN), roll = lin(t, Q.value - 0.1, Q.value + 0.5, EASE_OUT);
          x += 20 * tip + 70 * roll; y += (TOP - 7 - y) * Math.max(tip * 0.4, roll); r += 70 * tip + 160 * roll;
        }
        return <g key={`${si}-${i}`} transform={`rotate(${r} ${x} ${y})`}>
          <ellipse cx={x} cy={y} rx={23} ry={7.5} fill="#EAC35A" stroke={P.ink} strokeWidth={2.8} />
          <path d={`M ${x - 13} ${y - 1} Q ${x} ${y + 3} ${x + 13} ${y - 1}`} stroke={P.ink} strokeWidth={1.6} fill="none" opacity={0.55} />
        </g>;
      }))}
    </g>
  );
};

/** The tall draped thing on the desk, its cord in the tall man's hand: tugged on "kind of", whipped away on "technology".
 *  WHY a tall cloche with a tassel (round 2 review: a small grey dome on a cable read as a computer mouse). */
const DRAPE = { h: 150, w: 74 };
const Cloth: React.FC<{ t: number; hand: [number, number] }> = ({ t, hand }) => {
  const u = lin(t, Q.technology2 - 0.02, Q.technology2 + 0.42, EASE_IN);
  if (u >= 1) return null;
  // the tug: the drape leans and stretches toward his hand before it goes
  const tug = held(t, Q.newKind + 0.3, Q.technology2 - 0.04, 0.2, 0.06) * (1 + 0.4 * Math.sin((t - Q.newKind) * 30) * 0.3);
  const lean = -9 * tug, stretch = 1 + 0.07 * tug;
  const dx = -40 * u, dy = -820 * u;
  const topY = TOP - DRAPE.h;
  const top: [number, number] = [WELL + dx + lean * 2.4, topY + dy - 14];
  // WHY the cord sags while slack and snaps straight as he pulls: the yank needs anticipation to read
  const taut = lin(t, Q.newKind + 0.25, Q.newKind + 0.45);
  const sag = 46 * (1 - taut);
  const cm = [(hand[0] + top[0]) / 2, (hand[1] + top[1]) / 2 + sag];
  const flap = Math.sin(u * 14) * 14 * u;
  const W2 = DRAPE.w;
  return (
    <g>
      {u < 0.3 && <path d={`M ${hand[0]} ${hand[1]} Q ${cm[0]} ${cm[1]} ${top[0]} ${top[1]}`} stroke={P.ink} strokeWidth={2.8} fill="none" />}
      <g transform={`translate(${dx} ${dy}) rotate(${-260 * u * u + lean} ${WELL} ${TOP - 70}) translate(${WELL} ${TOP}) scale(${(1 + 0.3 * u) / stretch} ${stretch * (1 - 0.2 * u)}) translate(${-WELL} ${-TOP})`}>
        <path d={`M ${WELL - W2} ${TOP} C ${WELL - W2 + 2} ${TOP - 70} ${WELL - 54} ${topY} ${WELL} ${topY} C ${WELL + 54} ${topY} ${WELL + W2 - 2} ${TOP - 70} ${WELL + W2 + flap} ${TOP}
          Q ${WELL + 50} ${TOP - 10} ${WELL + 26} ${TOP} Q ${WELL} ${TOP - 9} ${WELL - 24} ${TOP} Q ${WELL - 48} ${TOP - 10} ${WELL - W2} ${TOP} Z`}
          fill="#CFC3CF" stroke={P.ink} strokeWidth={3.4} strokeLinejoin="round" />
        <path d={`M ${WELL - 26} ${topY + 20} Q ${WELL - 36} ${TOP - 60} ${WELL - 44} ${TOP - 6} M ${WELL + 4} ${topY + 6} Q ${WELL + 6} ${TOP - 70} ${WELL + 8} ${TOP - 6} M ${WELL + 30} ${topY + 22} Q ${WELL + 40} ${TOP - 60} ${WELL + 48} ${TOP - 8}`}
          stroke={P.inkSoft} strokeWidth={2.2} fill="none" opacity={0.7} />
        {/* the tassel the cord is tied to */}
        <path d={`M ${WELL} ${topY} L ${WELL} ${topY - 12}`} stroke={P.ink} strokeWidth={3} />
        <circle cx={WELL} cy={topY - 16} r={6} fill={P.inkSoft} stroke={P.ink} strokeWidth={2.6} />
      </g>
    </g>
  );
};

// ---------- the huddle, seen from behind ----------
// WHY a new picture, not a re-crop (round 2 review BLOCKER: six shots of one side-on row): on "believed" the camera is
// behind them; their three backs fill the foreground and lean in until their hat brims nearly touch, and the quill glows
// in the gap between them. On "bring about" the cage drops through that same gap.
const GIANTS = [
  { j: 0, x: 330, foot: 1100, k: 2.0, lean: 10 },
  { j: 1, x: 610, foot: 1040, k: 2.25, lean: 15 },
  { j: 2, x: 1190, foot: 1060, k: 2.2, lean: -18 },
];
const Huddle: React.FC<{ t: number }> = ({ t }) => (
  <g>
    {GIANTS.map((g, i) => {
      const inn = lin(t, CUT.believe, Q.believed + 0.2, EASE_IN_OUT);
      const whisper = within(t, Q.believed, CAGE_LAND) ? Math.sin(t * 9 + i * 1.7) * 1.6 : 0;
      // the cage lands: they straighten up a little, satisfied
      const proud = lin(t, CAGE_LAND, CAGE_LAND + 0.3, EASE_OUT);
      const st: ManState = {
        ...plain(crownAt(t, g.j)), back: true,
        lean: g.lean * (0.45 + 0.55 * inn) * (1 - 0.35 * proud) + whisper + Math.sin(t * 1.7 + i) * 0.8,
        pose: within(t, Q.believed, CAGE_LAND) ? 'rub' : 'sides',
        bob: jolt(t, CAGE_LAND + i * 0.06, -8, 0.4) + (g.j === 0 ? -14 * held(t, Q.aTechnology + 0.1, Q.believed, 0.2, 0.2) : 0),
      };
      return <g key={i} transform={`translate(${g.x} ${g.foot}) scale(${g.k})`}><Man j={g.j} x={0} y={0} st={st} a={-10} b={-9} /></g>;
    })}
  </g>
);

/** The out-of-focus shoulder and hat in the foreground of the treasure shot (one of them, seen from behind). */
const Shoulder: React.FC = () => (
  <g filter="url(#c-dof)" opacity={0.96}>
    <path d="M 1010 760 C 1020 600 1060 520 1130 490 C 1150 470 1160 440 1160 420 L 1250 420 C 1252 450 1262 470 1290 486 C 1360 520 1400 600 1410 760 Z" fill={P.ink} />
    <ellipse cx={1206} cy={392} rx={58} ry={66} fill={P.inkSoft} />
    <path d="M 1110 336 Q 1206 318 1302 336 L 1302 352 Q 1206 336 1110 352 Z" fill={P.ink} />
    <path d="M 1150 340 L 1144 40 Q 1206 30 1268 40 L 1262 340 Z" fill={P.ink} />
  </g>
);

// ---------- chapter vi: the wish and the card ----------
const CARD = { x: 1160, y: 300, w: 360 };
const CARD_H = madeHeight(CARD.w);
const WISH_A = CUT.tool + 0.05, WISH_B = WISH_A + 0.68;
const WISH_TXT = { x0: 1040, y: 556 };
const SWOOP = WISH_B + 0.05, CARD_A = SWOOP + 0.14, CARD_DRAW = 0.24;
// WHY the quill sketches the inside after the outline, and the colour floods in on "software" (round 2 review)
const SKETCH = { a: CARD_A + CARD_DRAW, b: Q.software + 0.22 };
if (CARD_A + CARD_DRAW > Q.software + 0.02) throw new Error(`take1c: the card's outline must be drawn by "software" (${(CARD_A + CARD_DRAW).toFixed(2)} > ${Q.software.toFixed(2)})`);

/** The stack of software they stand on: boxed products, each with its icon and a price tag.
 *  WHY boxes with tags (round 2 review: grey slabs with tiny icons read as drawers): their power is software that is
 *  boxed, priced and locked, readable in one second. */
const ICON_D = [
  'M -18 -12 h 36 v 30 h -36 Z M -18 -2 h 36 M -8 -16 v 8 M 8 -16 v 8',
  'M -6 14 L -6 -16 L 16 -20 L 16 8 M -6 14 a 6 5 0 1 1 -1 -1 M 16 8 a 6 5 0 1 1 -1 -1',
  'M -18 -18 h 36 v 36 h -36 Z M -6 -18 v 36 M 6 -18 v 36 M -18 -6 h 36 M -18 6 h 36',
  'M 0 18 C -16 2 -14 -18 0 -18 C 14 -18 16 2 0 18 Z M 0 -9 a 5 5 0 1 0 0.1 0',
  'M -20 -14 h 40 v 24 h -26 l -10 8 v -8 h -4 Z',
];
const PRICES = ['49.99', '9.99/mo', '129', '19.99/mo', '79'];
const OUT_SLAB = 2;                                  // the box that slides out on "monopolies"
const slideAt = (t: number) => lin(t, Q.monopolies1 + 0.05, Q.monopolies1 + 0.4, EASE_IN);
const sinkAt = (t: number) => lin(t, Q.monopolies1 + 0.28, Q.monopolies1 + 0.4, EASE_IN) * STACK.h + jolt(t, Q.monopolies1 + 0.4, -10, 0.4);
const Stack: React.FC<{ t: number; tags: boolean }> = ({ t, tags }) => {
  const grey = lin(t, Q.scarce, Q.scarce + 0.4);
  const fill = mixHex('#CFC4CB', '#A79CA9', grey);
  const wob = (i: number) => jolt(t, Q.these + 0.4 + i * 0.03, 5, 0.5) + jolt(t, Q.monopolies1, 4, 0.5);
  const slide = slideAt(t), sink = sinkAt(t);
  return (
    <>
      {Array.from({ length: STACK.n }).map((_, i) => {
        const y0 = 880 - (i + 1) * STACK.h;
        const jit = [0, 10, -6, 12, 4][i];
        const x0 = STACK.cx - STACK.w / 2 + jit, x1 = STACK.cx + STACK.w / 2 + jit;
        const out = i === OUT_SLAB;
        const dx = out ? 300 * slide : wob(i), dy = out ? 260 * Math.max(0, slide - 0.55) * 2 : i > OUT_SLAB ? sink : 0;
        const rot = out ? 40 * Math.max(0, slide - 0.5) : 0;
        if (out && slide >= 1) return null;
        const tagSwing = Math.sin(t * 2.4 + i * 1.3) * 5 + jolt(t, Q.monopolies1, 14, 0.7);
        return (
          <g key={i} transform={`translate(${dx} ${dy}) rotate(${rot} ${x1} ${y0 + STACK.h})`}>
            <path d={`M ${x0} ${y0 + STACK.h} L ${x1} ${y0 + STACK.h} L ${x1} ${y0} L ${x0} ${y0} Z`} fill={fill} stroke={P.ink} strokeWidth={3.4} strokeLinejoin="round" />
            {/* the lid seam and the shrink-wrap glint of a boxed product */}
            <path d={`M ${x0} ${y0 + 10} L ${x1} ${y0 + 10}`} stroke={P.ink} strokeWidth={2} opacity={0.6} />
            <path d={`M ${x0 + 30} ${y0 + 20} L ${x0 + 56} ${y0 + 20}`} stroke="#fff" strokeWidth={3} opacity={0.5} strokeLinecap="round" />
            <g transform={`translate(${(x0 + x1) / 2} ${y0 + STACK.h / 2 + 4}) scale(0.82)`}><path d={ICON_D[i]} stroke={P.ink} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>
            {tags && <g transform={`translate(${x1 - 6} ${y0 + 14}) rotate(${tagSwing})`}>
              <path d="M 0 0 L 14 10" stroke={P.ink} strokeWidth={1.8} />
              <path d={`M 10 8 L 88 8 L 96 22 L 88 36 L 10 36 Z`} fill={P.paper} stroke={P.ink} strokeWidth={2.4} strokeLinejoin="round" />
              <text x={50} y={29} textAnchor="middle" fontFamily="DM Sans" fontWeight={800} fontSize={17} fill={P.ink}>{PRICES[i]}</text>
            </g>}
          </g>
        );
      })}
      {/* "foundation": a crack runs up the stack from the desk */}
      <Ink d={`M 470 880 L 452 846 L 476 812 L 448 780 L 470 744 L 444 712 L 466 676 L 448 640`} a={Q.foundation} b={Q.foundation + 0.35} w={4.5} />
    </>
  );
};

const TreasureArt: React.FC = () => {
  const t = useT();
  const shot = shotAt(t);
  const men = MEN.map((x, j) => ({ x, j, st: manAt(t, j), y: TOP + (t > Q.monopolies1 ? sinkAt(t) : 0) }));
  // WHY hidden in some shots: the huddle and the treasure shot are drawn from behind them, and the close on the cage top
  // is beyond their reach; in those shots the side-on figures would be a second copy of them
  const showMen = shot !== 'huddle' && shot !== 'shoulder' && shot !== 'cagetop';
  const tall = men[2];
  const cordHand = manPt(CORD_MAN, tall.x, tall.y, tall.st, ...(tall.st.pose === 'key' ? [73, -119] as [number, number] : [61, -134] as [number, number]));
  // the snatch: in the close on the cage top his long arm reaches in from the left through "beyond their own", closes
  // on air on "control", and snaps back
  // WHY ease in-out: it must still be reaching as the quill slips out, and arrive just as it is gone
  const reachP = lin(t, CUT.beyond, Q.control - 0.02, EASE_IN_OUT) * (1 - lin(t, Q.control + 0.5, Q.control + 0.7, EASE_IN));
  const fist = lin(t, Q.control, Q.control + 0.08);
  const target: [number, number] = [WELL + 8, CAGE.top - 50];
  // ---------- the quill ----------
  const ZIP = Q.control + 0.02;
  const q = track(checked('treasure', [
    { t: Q.artificial, x: REST.x, y: REST.y + 260, r: REST.r, s: REST.s },
    { t: Q.artificial + 0.42, x: REST.x, y: REST.y - 14, r: REST.r - 4, s: REST.s, ease: EASE_OUT },
    { t: Q.intelligence - 0.05, ...REST },
    { t: Q.believed + 0.05, ...REST },
    // "believed": it leans out toward them, curious
    { t: Q.believed + 0.55, x: REST.x - 6, y: REST.y - 6, r: REST.r - 16, s: REST.s },
    { t: CAGE_LAND - 0.02, x: REST.x - 6, y: REST.y - 6, r: REST.r - 14, s: REST.s },
    // the cage lands: it ducks back
    { t: CAGE_LAND + 0.12, x: REST.x + 2, y: REST.y + 8, r: REST.r + 6, s: REST.s, ease: EASE_OUT },
    { t: Q.somethingFar, x: REST.x + 2, y: REST.y + 6, r: REST.r + 4, s: REST.s },
    // "beyond": it squeezes up and out through the ring on top of the cage
    { t: Q.beyond - 0.05, x: REST.x, y: REST.y, r: REST.r, s: REST.s },
    { t: Q.beyond + 0.42, x: REST.x - 4, y: CAGE.top - 20, r: -30, s: REST.s * 0.95, ease: EASE_IN_OUT },
    { t: ZIP - 0.04, x: REST.x - 2, y: CAGE.top - 44, r: -26, s: REST.s * 0.95 },
    // "control": it whooshes straight at the lens (round 2 review: it used to leave tiny, off the top edge)
    // WHY the nib sweeps down-left as it grows: the feather then passes across the middle of the frame, past the lens
    { t: ZIP + 0.12, x: 860, y: 370, r: -22, s: 2.4, ease: EASE_IN },
    { t: ZIP + 0.27, x: 620, y: 660, r: -8, s: 7, ease: EASE_IN },
    // the next shot: it flies in from the right, after the wish is written, and draws the card round
    { t: SWOOP - 0.2, x: 1700, y: 200, r: -12, s: 1.0 },
    { t: CARD_A, x: CARD.x - CARD.w / 2, y: CARD.y - CARD_H / 2, r: -12, s: 1.0, ease: EASE_OUT },
    { t: CARD_A + CARD_DRAW * 0.3, x: CARD.x + CARD.w / 2, y: CARD.y - CARD_H / 2, r: -12, s: 1.0, ease: (v) => v },
    { t: CARD_A + CARD_DRAW * 0.5, x: CARD.x + CARD.w / 2, y: CARD.y + CARD_H / 2, r: -12, s: 1.0, ease: (v) => v },
    { t: CARD_A + CARD_DRAW * 0.8, x: CARD.x - CARD.w / 2, y: CARD.y + CARD_H / 2, r: -12, s: 1.0, ease: (v) => v },
    { t: CARD_A + CARD_DRAW, x: CARD.x - CARD.w / 2 + 30, y: CARD.y - CARD_H / 2 + 20, r: -12, s: 1.0, ease: (v) => v },
  ]), t);
  // WHY the nib hatches across the sketch line while the inside draws: it reads as the quill drawing the thing, line by line
  const sketching = within(t, SKETCH.a, SKETCH.b);
  const sk = lin(t, SKETCH.a, SKETCH.b, (v) => v);
  const skX = CARD.x - CARD.w / 2 + 40 + (CARD.w - 80) * (0.5 + 0.5 * Math.sin(sk * Math.PI * 7 - Math.PI / 2));
  const skY = CARD.y - CARD_H / 2 + CARD_H * sk;
  const after = t >= SKETCH.b;
  // after the card is made: one loop round it and a tap on its corner, then it bobs beside it
  const loop = lin(t, SKETCH.b + 0.05, SKETCH.b + 0.65, EASE_IN_OUT);
  const qq = sketching ? { x: skX, y: skY, r: -12 + Math.sin(sk * 40) * 6, s: 1 }
    : after ? { x: CARD.x + Math.cos(loop * Math.PI * 2 - 0.4) * (CARD.w / 2 + 50), y: CARD.y - 10 + Math.sin(loop * Math.PI * 2 - 0.4) * (CARD_H / 2 + 30) + Math.sin(t * 5) * 4, r: 8 + Math.sin(t * 3) * 5, s: 0.95 }
      : q;
  // WHY character beats on the quill itself: on "intelligence" it stretches and shakes itself awake like a bird,
  // spattering three drops of ink
  const wake = held(t, Q.intelligence, Q.intelligence + 0.4, 0.06, 0.12);
  const shake = wake * Math.sin((t - Q.intelligence) * 38) * 13;
  const stretch = 1 + 0.14 * held(t, Q.intelligence - 0.05, Q.intelligence + 0.1, 0.08, 0.15);
  const idle = within(t, Q.intelligence + 0.5, Q.control) ? Math.sin(t * 1.9) * 2.5 : 0;
  const wriggle = within(t, Q.somethingFar, Q.beyond + 0.42) ? Math.sin(t * 30) * 7 : 0;
  // a curious tilt in the hold after the cloth comes off
  const curious = within(t, Q.artificial, CUT.believe) ? 0 : 0;
  const showQuill = t > Q.artificial && t < CUT.scarce && !(t > ZIP + 0.27 && t < SWOOP - 0.2);
  const inWell = t < Q.beyond + 0.15;
  // WHY purple splats that land on the desk (round 2 review NIT: black specks read as dirt)
  const drops = [[770, TOP - 3, 0.0, 3], [1180, TOP - 3, 0.05, 7], [820, TOP - 3, 0.09, 11]] as const;
  // the wish: written by someone's hand reaching in from below
  const wishO = shot === 'card' ? 1 : 0;
  const armOut = lin(t, WISH_B + 0.05, WISH_B + 0.35, EASE_IN);
  return (
    <Sheet>
      <defs>
        <clipPath id="c-well-mouth"><rect x={-200} y={-400} width={2400} height={MOUTH + 400} /></clipPath>
        <filter id="c-dof" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" /></filter>
      </defs>
      {/* their stack, and them on it */}
      <g transform={`translate(0 ${jolt(t, Q.foundation, 5, 0.5)})`}><Stack t={t} tags={shot === 'stack'} /></g>
      {showMen && men.map(({ x, j, st, y }) => <Man key={j} j={j} x={x} y={y} st={st} a={-10} b={-9} />)}
      {/* WHY big and hung on the stack's face (review: a tiny padlock): theirs is locked; it slams on "ever-scarce" */}
      {t > CUT.scarce - 0.02 && <Padlock x={318} y={790} s={2.5} at={Q.scarce} />}
      {/* their desk, running across the gutter */}
      <path d={`M ${DESK.x0} ${TOP} L ${DESK.x1} ${TOP} L ${DESK.x1} ${TOP + 18} L ${DESK.x0} ${TOP + 18} Z`} fill={P.inkSoft} stroke={P.ink} strokeWidth={3.4} strokeLinejoin="round" />
      <path d={`M ${DESK.x0 + 22} ${TOP + 18} L ${DESK.x0 + 28} 880 M ${DESK.x1 - 22} ${TOP + 18} L ${DESK.x1 - 28} 880`} stroke={P.ink} strokeWidth={6} strokeLinecap="round" />
      <Coins t={t} />
      <Inkwell x={WELL} glow={held(t, Q.technology2 + 0.25, Q.technology2 + 0.9, 0.15, 0.5)} />
      {/* the ink the quill shakes off as it wakes: purple splats that stay on the desk */}
      {drops.map(([x, y, dt, seed], i) => {
        const k = lin(t, Q.intelligence + 0.12 + dt, Q.intelligence + 0.3 + dt, EASE_OUT);
        if (k <= 0) return null;
        const sx = REST.x + 30, sy = REST.y - 160;
        if (k < 1) return <ellipse key={i} cx={sx + (x - sx) * k} cy={sy + (y - sy) * k - Math.sin(k * Math.PI) * 60} rx={8} ry={10} fill={P.purple} stroke={P.ink} strokeWidth={1.6} />;
        const sq = jolt(t, Q.intelligence + 0.3 + dt, 0.3, 0.3);
        return <g key={i} transform={`translate(${x} ${y}) scale(${1 + sq} ${1 - sq * 0.6}) scale(1 0.34)`}><path d={blob(0, 0, 15, seed, 0.3, 10)} fill={P.purple} stroke={P.ink} strokeWidth={2.6} /></g>;
      })}
      {showQuill && (
        <g clipPath={inWell ? 'url(#c-well-mouth)' : undefined}>
          <g transform={`translate(${qq.x} ${qq.y}) scale(1 ${stretch}) translate(${-qq.x} ${-qq.y})`} opacity={t < SWOOP - 0.25 ? 1 - lin(t, ZIP + 0.2, ZIP + 0.27) : 1}>
            <Quill x={qq.x} y={qq.y} s={qq.s} r={qq.r + idle + shake + wriggle + curious} />
          </g>
        </g>
      )}
      <Cage t={t} />
      {(shot === 'hubris' || shot === 'unveil') && <Cloth t={t} hand={cordHand} />}
      {shot === 'huddle' && <Huddle t={t} />}
      {shot === 'shoulder' && <Shoulder />}
      {/* "far beyond their own control": his long arm reaches in from the left, and his hand closes on the air */}
      {shot === 'cagetop' && <Reach from={[420, 420]} to={target} p={reachP} fist={fist} />}
      {/* "a tool that can make software": someone writes their wish, and the quill draws them a card */}
      {wishO > 0 && <Scrap x0={WISH_TXT.x0} y={WISH_TXT.y} text="my plants keep dying" a={WISH_A} b={WISH_B} size={58} outlineAt={CUT.tool - 0.06} rot={-1.6} />}
      {wishO > 0 && armOut < 1 && (() => {
        const u = lin(t, WISH_A, WISH_B, (v) => v);
        const nx = WISH_TXT.x0 + 20 * 0.42 * 58 * u;
        // a small roll of the wrist on each letter, so the hand writes rather than slides
        return <g transform={`translate(0 ${armOut * 560})`}><Hand x={nx} y={WISH_TXT.y - 8 + Math.sin(u * 44) * 3} roll={Math.sin(u * 60) * 4} /></g>;
      })()}
      {shot === 'card' && <MadeCard look="meadow" what="plants" x={CARD.x} y={CARD.y} w={CARD.w} r={-1} a={CARD_A} draw={CARD_DRAW} sketch={SKETCH} beat={SKETCH.b + 0.7} />}
    </Sheet>
  );
};
export const TREASURE: Spread = { id: 'treasure', Art: TreasureArt };
/** Kept for take1c.tsx's import. */
export const TREASURE_MARKS = { well: { x: WELL, y: MOUTH }, men: { x: MEN[1], y: TOP }, card: CARD };

// ======================= vi · anyone =======================
// WHY one card, re-drawn for each person who asks (review BLOCKER: four tiny people in a row, each with an unreadable
// card, read as "four people, four gadgets"): close on ONE card while three different people lean in and write what
// they want; the quill redraws the same card for each. Then, on "asks", the film pulls out to show each of them holding
// up their own copy of that one card: the same frame, tape and quill mark on every copy, each dressed in its owner's look.
const ANY = { x: 1125, y: 400, w: 260 };
// WHY two short lines beside the card, not one long one above it: the close shot is tight enough for the card to read
// at phone size, so the wish sits in the space to its left
const ASKERS: { look: Theme; what: Made; text: string[]; at: number; x: number }[] = [
  { look: 'meadow', what: 'plants', text: ['my plants', 'keep dying'], at: TURN.anyone - 1, x: 860 },
  { look: 'cotton', what: 'bus', text: ["when's", 'my bus??'], at: Q.anyone - 0.03, x: 850 },
  { look: 'devils', what: 'game', text: ['a game for', 'me & jo'], at: Q.who - 0.06, x: 870 },
];
const SKIN_DUR = 0.24;
const skinAt = (k: number) => ASKERS[k].at + 0.24;
if (skinAt(2) + SKIN_DUR > CUT.anyWide - 0.2) throw new Error('take1c: the last card must be redrawn well before the pull-out on "asks"');
// the wide: each person holding up their copy (page units). WHY near, middle and far, never a row, and every card held
// in two hands (round 2 review: the cards floated with nobody holding them)
const OWNERS = [
  { look: 'meadow' as Theme, what: 'plants' as Made, px: 330, py: 880, s: 2.7, w: 300, beat: CUT.anyWide + 0.35 },
  { look: 'cotton' as Theme, what: 'bus' as Made, px: 800, py: 600, s: 1.8, w: 230, beat: Q.andSo + 0.05 },
  // WHY the far right (render: the headline plate sat over this person's body)
  { look: 'devils' as Theme, what: 'game' as Made, px: 1390, py: 860, s: 2.35, w: 270, beat: Q.so + 0.25 },
];
/** Where an owner's card sits: centred over their head, its bottom edge in their two raised hands. */
const ownerCard = (o: typeof OWNERS[number], hop: number) => {
  const h = madeHeight(o.w);
  const handY = o.py - 96 * o.s + hop;
  return { x: o.px, y: handY - h / 2 + 10, h, handY };
};
const AnyoneArt: React.FC = () => {
  const t = useT();
  const close = t < CUT.anyWide;
  // which asker is in the shot, and how far the card has been redrawn for them
  const k = t < ASKERS[1].at ? 0 : t < ASKERS[2].at ? 1 : 2;
  const p1 = lin(t, skinAt(1), skinAt(1) + SKIN_DUR, EASE_IN_OUT), p2 = lin(t, skinAt(2), skinAt(2) + SKIN_DUR, EASE_IN_OUT);
  const cur = p1 < 1 ? { base: 0, p: p1 } : { base: 1, p: p2 };
  const edge = madeEdge(ANY.x, ANY.y, ANY.w, cur.p);
  const skinning = (p1 > 0 && p1 < 1) || (p2 > 0 && p2 < 1);
  return (
    <Sheet>
      {close ? (
        <>
          {/* the asker: head and shoulders leaning in from the bottom of the frame, pointing up at the card.
              WHY one ducks fully out before the next pops up (round 2 review: two heads overlapped for 2-3 frames) */}
          {ASKERS.map((a, i) => {
            const out = i < 2 ? lin(t, ASKERS[i + 1].at - 0.16, ASKERS[i + 1].at - 0.03, EASE_IN) : 0;
            const inn = i === 0 ? 1 : spring(t, a.at - 0.02, 0.32);
            if (inn <= 0 || out >= 1) return null;
            return <Person key={i} x={a.x} y={790 + (1 - inn) * 260 + out * 300} s={2.6} a={-10} b={-9} pose="up" hair={HAIR[a.look]} hairColor={P.ink}
              body={SHIRT[a.look]} mood={i === k && t > skinAt(i) + SKIN_DUR ? 'o' : 'smile'} bob={jolt(t, skinAt(i) + SKIN_DUR, -10, 0.4)} />;
          })}
          {/* their wish: each new one replaces the last on a fresh scrap */}
          {ASKERS.map((a, i) => {
            const gone = i < 2 ? lin(t, ASKERS[i + 1].at - 0.12, ASKERS[i + 1].at - 0.03) : 0;
            if (gone >= 1) return null;
            return <Scrap key={i} x0={722} y={ANY.y - 82} text={a.text} a={i === 0 ? -10 : a.at} b={i === 0 ? -9.5 : a.at + 0.26} size={52} outlineAt={i === 0 ? -11 : a.at - 0.03} o={1 - gone} rot={[-1.4, 1.2, -0.8][i]} />;
          })}
          <MadeCard look={ASKERS[cur.base].look} what={ASKERS[cur.base].what} x={ANY.x} y={ANY.y} w={ANY.w} r={-1}
            next={{ look: ASKERS[cur.base + 1].look, what: ASKERS[cur.base + 1].what, p: cur.p }} />
          {/* the quill rides the leading edge of each redraw, and waits at the card's corner in between */}
          <Quill x={skinning ? edge.x : ANY.x + ANY.w / 2 + 20} y={skinning ? edge.y + 6 : ANY.y - 40 + Math.sin(t * 6) * 5} s={0.85} r={skinning ? -14 : 6} />
        </>
      ) : (
        <>
          {/* a thin ink thread from the first card to the other two: the copies visibly come from one card */}
          {OWNERS.slice(1).map((o, i) => {
            const A0 = ownerCard(OWNERS[0], 0), B0 = ownerCard(o, 0);
            const from: [number, number] = [A0.x + OWNERS[0].w * 0.3, A0.y - A0.h / 2], to: [number, number] = [B0.x - o.w * 0.3 * (i ? -1 : 1), B0.y - B0.h / 2];
            const mx = (from[0] + to[0]) / 2, my = Math.min(from[1], to[1]) - 120;
            return <Ink key={i} d={`M ${from[0]} ${from[1]} Q ${mx} ${my} ${to[0]} ${to[1]}`} a={CUT.anyWide + 0.05 + i * 0.15} b={CUT.anyWide + 0.5 + i * 0.15} w={2.4} c={P.purple} />;
          })}
          {OWNERS.map((o, i) => {
            // WHY a small cheer each, a beat apart (review: nothing moved while she said the film's key line)
            const hop = jolt(t, CUT.anyWide + 0.1 + i * 0.12, -12, 0.5) + jolt(t, o.beat, -10, 0.5);
            const c = ownerCard(o, hop);
            const hands = [-24, 24].map((hx) => o.px + hx * o.s);
            return (
              <g key={i}>
                <Ink d={`M ${o.px - 40 * o.s} ${o.py} L ${o.px + 40 * o.s} ${o.py}`} a={-10} b={-9} w={2.4} c={P.inkSoft} />
                <Person x={o.px} y={o.py} s={o.s} a={-10} b={-9} pose="bothUp" hair={HAIR[o.look]} hairColor={P.ink} body={SHIRT[o.look]} mood="smile" bob={hop} />
                <MadeCard look={o.look} what={o.what} x={c.x} y={c.y} w={o.w} r={[-2, 1.5, -1][i]} beat={o.beat} />
                {/* their fingers over the card's bottom edge */}
                {hands.map((hx, h) => <ellipse key={h} cx={hx} cy={c.handY + 2} rx={4.2 * o.s} ry={5.4 * o.s} fill={P.paper} stroke={P.ink} strokeWidth={3} />)}
              </g>
            );
          })}
          <Quill x={560 + Math.sin(t * 2.2) * 26} y={250 + Math.sin(t * 3.1) * 10} s={0.8} r={8 + Math.sin(t * 2.2) * 8} />
        </>
      )}
    </Sheet>
  );
};
export const ANYONE: Spread = { id: 'anyone', Art: AnyoneArt };

// ======================= vii · ours: chapter ii, undone =======================
// WHY the exact layout of chapter ii: the narrator repeats that line's three clauses word for word, so the pictures
// repeat too, in colour, and each is undone. WHY one woman in all three (round 2 review: three different protagonists in
// 9 s weakened "we"): she writes the padlock open, makes the screen show her sky, snips the price and takes her things back.
const HER = { body: SHIRT.sunbreak, hair: 'bun' as const };
const Scissors: React.FC<{ x: number; y: number; r: number; open: number; s?: number }> = ({ x, y, r, open, s = 1 }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    {[1, -1].map((sg) => (
      <g key={sg} transform={`rotate(${sg * open * 18})`}>
        <path d={`M -6 ${sg * 2} L 58 ${sg * -2} Q 60 ${sg * 1} 56 ${sg * 3} L -6 ${sg * 7} Z`} fill="#F4F0F6" stroke={P.ink} strokeWidth={3} strokeLinejoin="round" />
        <path d={`M -6 ${sg * 5} L -22 ${sg * 12}`} stroke={P.ink} strokeWidth={5} strokeLinecap="round" />
        <ellipse cx={-30} cy={sg * 14} rx={11} ry={8} fill="none" stroke={P.pink} strokeWidth={5} /><ellipse cx={-30} cy={sg * 14} rx={11} ry={8} fill="none" stroke={P.ink} strokeWidth={1.6} />
      </g>
    ))}
    <circle r={4} fill={P.sun} stroke={P.ink} strokeWidth={2} />
  </g>
);
/** A handwritten wish above her laptop: written on "computers"; her sky blooms out of the screen on "can do". */
const WISH = { x0: 96, y: 290, text: 'show me the sky' };
/** Kept for take1c.tsx's import: her hand at the start of chapter vii. */
export const OURS_HAND = { x: 200 + 24 * 1.1, y: 500 - 96 * 1.1 };
/** Her night sky: a deep plum field with fixed stars, a crescent and her own constellation. r is its radius. */
const SKY_STARS: [number, number, number][] = [[-150, -60, 3], [-90, -130, 2.4], [-30, -80, 3.2], [40, -150, 2.2], [110, -100, 3], [160, -30, 2.4], [-180, 30, 2.2], [80, 40, 2.6], [-60, 50, 2], [180, 80, 2.2], [0, -190, 2.4], [-120, -190, 2]];
const CONSTELLATION = [2, 3, 4, 5];
const Sky: React.FC<{ x: number; y: number; r: number; o?: number; seed?: number }> = ({ x, y, r, o = 1, seed = 9 }) => {
  if (r < 2) return null;
  const k = r / 230;
  return (
    <g opacity={o}>
      <path d={blob(x, y, r, seed, 0.1, 18)} fill="#3B2754" stroke={P.ink} strokeWidth={3} />
      <path d={blob(x, y, r * 0.86, seed + 2, 0.12, 16)} fill="#4A3166" opacity={0.6} />
      {/* her constellation, joined in a thin lilac line */}
      <path d={`M ${CONSTELLATION.map((i) => `${x + SKY_STARS[i][0] * k} ${y + SKY_STARS[i][1] * k}`).join(' L ')}`} stroke={P.lilac} strokeWidth={1.6} fill="none" opacity={0.75} />
      {SKY_STARS.map(([sx, sy, sr], i) => (Math.hypot(sx, sy) * k < r - 8 ? <circle key={i} cx={x + sx * k} cy={y + sy * k} r={sr * Math.max(0.6, k)} fill="#FFF4DC" /> : null))}
      <path d={`M ${x + 120 * k} ${y - 150 * k} a ${30 * k} ${30 * k} 0 1 0 ${30 * k} ${44 * k} a ${24 * k} ${24 * k} 0 1 1 ${-30 * k} ${-44 * k} Z`} fill={P.sun} />
    </g>
  );
};
/** Her things, popping out of his hat and back into her own box: a photo of her dog, her diary, a handwritten recipe.
 *  WHY keepsakes, not app cards (round 2 review: the moon card repeated as a flying 'data' item). */
const DATA_KINDS = ['family', 'diary', 'note'] as const;
const OursArt: React.FC = () => {
  const t = useT();
  // WHY drawn well before the cut: the film cuts straight into a close shot here, which must show finished drawings
  const L = land(TURN.ours) - 1.6;
  const LB = Q.decide - 0.03;
  // A: she holds the purple quill from line 6; she hops on "time"; over "very long while" she WALKS to the desk (the quill
  // in her hand, never a prop flying by itself); on "we get to" she raises it to the lock while he leans in to stop her;
  // on "decide" she writes a purple tick across the lock, and it springs open.
  // WHY the quill and not a key (round 2 review BLOCKER: a key glided to the lock by itself, and a padlock key is stock
  // 'security' art): the tool from line 6 is what lets her decide
  const hop = jolt(t, Q.firstTime + 0.25, -14, 0.5) + jolt(t, Q.longWhile - 0.1, -14, 0.5);
  const walk = lin(t, Q.veryLong - 0.05, Q.longWhile + 0.35, EASE_IN_OUT);
  const herX = 196 + (318 - 196) * walk;
  const step = walk > 0 && walk < 1 ? Math.abs(Math.sin(walk * Math.PI * 4)) * -8 : 0;
  const raise = lin(t, Q.weGet - 0.05, Q.weGet + 0.2, EASE_OUT);
  const bob = (k: number) => jolt(t, Q.decide + 0.3 + k * 0.08, -10, 0.5);
  // her hand: pose "quill" holds it at (32,-78); pose "up" lifts it to (24,-96)
  const hand = raise > 0.5 ? { x: herX + 24 * 1.1, y: 500 - 96 * 1.1 } : { x: herX + 32 * 1.1, y: 500 - 78 * 1.1 };
  // the tick: the nib runs down and up across the lock on "decide"
  const tick = lin(t, Q.decide - 0.04, Q.decide + 0.16, (v) => v);
  const TICK: [number, number][] = [[356, 378], [366, 392], [390, 360]];
  const along = (u: number): [number, number] => (u < 0.35 ? [TICK[0][0] + (TICK[1][0] - TICK[0][0]) * (u / 0.35), TICK[0][1] + (TICK[1][1] - TICK[0][1]) * (u / 0.35)]
    : [TICK[1][0] + (TICK[2][0] - TICK[1][0]) * ((u - 0.35) / 0.65), TICK[1][1] + (TICK[2][1] - TICK[1][1]) * ((u - 0.35) / 0.65)]);
  const writing = tick > 0 && tick < 1;
  const nib: [number, number] = writing ? along(tick) : [hand.x, hand.y + step + hop];
  // his reaction: he bends in to watch on "first time", reaches over to stop her on "we get to", recoils on "decide"
  const reachIn = held(t, Q.weGet - 0.1, Q.decide + 0.05, 0.3, 0.12);
  const recoil = held(t, Q.decide + 0.1, Q.ourComputers, 0.15, 0.6);
  // her sky: on "can do" it spills out of the screen and fills the page behind her, then settles back into the screen
  // WHY it settles back before the cut (render: still blooming, its edge showed at the top of the next shot)
  const bloom = lin(t, Q.canDo - 0.08, Q.canDo + 0.3, EASE_OUT) * (1 - lin(t, Q.canDo + 0.42, Q.itCosts + 0.06, EASE_IN_OUT));
  const screenSky = lin(t, Q.canDo - 0.05, Q.canDo + 0.1);
  // B: she walks to the tag with her scissors held high, opens them on "it", snaps them shut on "costs"; it flutters down
  const bwalk = lin(t, Q.itCosts - 0.1, Q.costs - 0.12, EASE_IN_OUT);
  const leap = Math.max(0, Math.sin(Math.min(1, Math.max(0, (t - (Q.costs - 0.12)) / 0.42)) * Math.PI));
  const bx = 480 + (352 - 480) * bwalk, by = 860 - 30 * leap;
  const open = lin(t, Q.it - 0.05, Q.it + 0.08) * (1 - lin(t, Q.costs - 0.02, Q.costs + 0.04, EASE_IN));
  const snipped = t > Q.costs + 0.03;
  const squash = jolt(t, Q.costs + 0.04, 0.12, 0.25);
  const fall = lin(t, Q.costs + 0.06, Q.costs + 0.6, EASE_IN);
  // her raised hand (pose "up", flipped, s 1.12): the scissors sit just above and outside it, clear of her face
  const sHand = { x: bx - 24 * 1.12 - 8, y: by - 96 * 1.12 - 18 };
  // C: he clutches his hat with both hands while it shakes, and her things pop OUT of it, against his will; she catches
  // each into her box; the lid snaps shut on "data"
  const DATA_FROM = Q.ourData + 0.42, DATA_GAP = 0.27, DATA_DUR = 0.5;
  const ITEM_LAND = (i: number) => DATA_FROM + i * DATA_GAP + DATA_DUR;
  const boxHop = [0, 1, 2].reduce((a, i) => a + jolt(t, ITEM_LAND(i), -6, 0.35), 0);
  const catchDip = [0, 1, 2].reduce((a, i) => a + jolt(t, ITEM_LAND(i) - 0.04, 7, 0.32), 0);
  const shut = lin(t, Q.data2 - 0.02, Q.data2 + 0.08, EASE_IN);
  const clack = jolt(t, Q.data2 + 0.08, 0.08, 0.2);
  const HM = { x: 1350, y: 880, s: 1.2 };
  const hatShake = within(t, DATA_FROM - 0.1, ITEM_LAND(2)) ? Math.sin(t * 34) * 3 : 0;
  const pops = [0, 1, 2].reduce((a, i) => a + jolt(t, DATA_FROM + i * DATA_GAP, -0.25, 0.25), 0);
  const p0: [number, number] = [HM.x, HM.y - (212 + 90) * HM.s], p1: [number, number] = [1200, 560], p2: [number, number] = [1062, 812];
  return (
    <>
      <Sheet>
        <WashBg x={390} y={420} r={150} sx={1.75} a={L} seed={3} color={P.pinkSoft} o={0.6} />
        <WashBg x={390} y={770} r={140} sx={1.75} a={LB} seed={6} color={P.sunSoft} o={0.6} />
        <WashBg x={1150} y={760} r={190} sx={1.3} a={LB + 0.15} seed={11} color={P.lilac} o={0.6} />
        {/* A: what our computers can do */}
        <Sky x={370} y={360} r={250 * bloom} />
        <Ink d="M 140 500 L 660 500" a={L - 0.2} b={L + 0.3} w={2} c={P.inkSoft} />
        <Ink d="M 250 420 L 490 420 M 270 420 L 270 500 M 470 420 L 470 500" a={L - 0.1} b={L + 0.35} w={3.4} />
        <Laptop x={370} y={418} s={1.5} a={L} b={L + 0.4} />
        {/* the screen keeps a little of her sky once the bloom settles back into it */}
        {screenSky > 0 && <g opacity={screenSky}>
          <path d="M 320 351 h 100 v 64 h -100 Z" fill="#3B2754" />
          {[[336, 366], [356, 392], [384, 372], [404, 398], [398, 360]].map(([sx, sy], i) => <circle key={i} cx={sx} cy={sy} r={1.8} fill="#FFF4DC" />)}
          <path d="M 404 362 a 6 6 0 1 0 6 9 a 5 5 0 1 1 -6 -9 Z" fill={P.sun} />
        </g>}
        {/* WHY it stays until the cut to the price tag (pre-existing fault: it faded out before it had finished writing);
            WHY the outline and the first letter start together (round 2 review: an empty box for three frames) */}
        {t < Q.itCosts + 0.2 && <Scrap x0={WISH.x0} y={WISH.y} text={WISH.text} a={Q.ourComputers + 0.02} b={Q.canDo - 0.15} size={46} outlineAt={Q.ourComputers} rot={-2} />}
        <HatFigure x={600 + 26 * lin(t, Q.decide + 0.1, Q.decide + 0.35, EASE_OUT) - 40 * reachIn} y={500} s={1} crown={84} a={L - 0.2} b={L + 0.7}
          pose={reachIn > 0.4 ? 'reach' : t < Q.decide + 0.1 ? 'pat' : t < Q.decide + 0.6 ? 'grab' : 'sides'} flip fade={0.28}
          drop={-0.8 * held(t, Q.decide + 0.12, Q.decide + 0.3, 0.1, 0.3)}
          lean={Math.sin(t * 1.4) * 1.3 + 12 * held(t, Q.firstTime, Q.weGet - 0.1, 0.4, 0.15) + 16 * reachIn - 12 * recoil} bob={jolt(t, Q.longWhile, -5, 0.5)} />
        <g transform={`rotate(${jolt(t, Q.decide + 0.14, 3, 0.4)} 370 398)`}><Padlock x={370} y={384} s={1.25} at={L} openAt={Q.decide + 0.14} fallAt={Q.decide + 0.5} fallTo={104} color={P.inkSoft} /></g>
        {/* the purple tick she writes across the lock; it goes with the lock as it falls */}
        {tick > 0 && <g opacity={1 - lin(t, Q.decide + 0.45, Q.decide + 0.6)}>
          <path d={`M ${TICK[0][0]} ${TICK[0][1]} L ${TICK[1][0]} ${TICK[1][1]} L ${TICK[2][0]} ${TICK[2][1]}`} pathLength={1} stroke={P.purple} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={tick >= 1 ? undefined : '1 2'} strokeDashoffset={tick >= 1 ? undefined : 1 - tick} />
        </g>}
        <Person x={herX} y={500} s={1.1} a={L - 0.05} b={L + 0.55} pose={raise > 0.5 || writing ? 'up' : 'quill'} mood={t > Q.decide + 0.1 ? 'o' : 'smile'} hair={HER.hair} body={HER.body}
          bob={bob(0) + hop + step} />
        {t < Q.itCosts + 0.2 && <Quill x={nib[0]} y={nib[1]} s={0.42} r={writing ? -24 : 8} />}

        {/* B: what it costs */}
        <Ink d="M 140 860 L 660 860" a={LB} b={LB + 0.4} w={2} c={P.inkSoft} />
        <Ink d="M 140 760 L 330 760 M 160 760 L 160 860 M 310 760 L 310 860" a={LB} b={LB + 0.35} w={3.4} />
        <Laptop x={236} y={758} s={1.3} a={LB + 0.1} b={LB + 0.5} />
        {/* WHY smaller and hung from the laptop's corner (round 2 review: as tall as her, it buried the screen) */}
        {!snipped && <Ink d="M 282 700 Q 292 696 300 704" a={LB + 0.2} b={LB + 0.4} w={2.4} />}
        {snipped && <path d="M 282 700 Q 286 698 290 700" stroke={P.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />}
        <g transform={`translate(${fall * -40 + Math.sin(fall * 9) * 16 * fall} ${fall * 150}) rotate(${fall * 200 + Math.sin(fall * 7) * 20} 300 724)`} opacity={1 - lin(t, Q.costs + 0.5, Q.costs + 0.65)}>
          <PriceTag x={300} y={724} s={0.68} at={LB + 0.2} swing={-6} prices={[{ v: '19.99/mo', at: LB + 0.3 }]} />
        </g>
        {/* WHY only after the tag is clear, in her handwriting, in the one purple (review: three signals piled up in 0.6 s) */}
        {t > Q.costs + 0.42 && (() => {
          const u = lin(t, Q.costs + 0.42, Q.costs + 0.66, (v) => v);
          return <g><defs><clipPath id="c-free-w"><rect x={200} y={700} width={80 * u} height={60} /></clipPath></defs>
            <text x={204} y={744} clipPath="url(#c-free-w)" fontFamily={CAVEAT} fontWeight={700} fontSize={46} fill={P.purple}>free</text></g>;
        })()}
        <Person x={bx} y={by} s={1.12} a={LB + 0.1} b={LB + 0.6} pose={t > Q.itCosts - 0.1 && t < Q.costs + 0.6 ? 'up' : 'down'} mood={leap > 0 ? 'o' : 'smile'} hair={HER.hair} body={HER.body} flip
          bob={bob(1) + jolt(t, Q.costs + 0.3, 6, 0.3)} />
        {/* WHY in her hand, at arm's length above her head (round 2 review: the rings sat over her face like goggles) */}
        {t > LB + 0.5 && (t > Q.itCosts - 0.1 && t < Q.costs + 0.6
          ? <g transform={`translate(${sHand.x} ${sHand.y + bob(1)}) scale(${1 + squash} ${1 - squash})`}><Scissors x={0} y={0} r={210} open={0.15 + open} s={0.6} /></g>
          : <Scissors x={bx - 26} y={by - 34} r={200} open={0.15} s={0.6} />)}

        {/* C: what happens with our data: her things pop out of his hat, back into a box of her own */}
        <Ink d="M 820 880 L 1450 880" a={LB + 0.1} b={LB + 0.5} w={2} c={P.inkSoft} />
        <Person x={920} y={880} s={1.35} a={LB + 0.2} b={LB + 0.8} pose={t > Q.data2 + 0.15 ? 'hold' : t > Q.ourData + 0.1 ? 'bothUp' : 'down'} hair={HER.hair} mood="smile" body={HER.body}
          bob={bob(2) + catchDip} tilt={9 * lin(t, Q.data2 + 0.15, Q.data2 + 0.45, EASE_OUT)} />
        <g transform={`translate(0 ${boxHop}) translate(1060 880) scale(${1 + clack} ${1 - clack}) translate(-1060 -880)`}>
          <Shape d="M 1000 880 L 1120 880 L 1120 808 L 1000 808 Z" a={LB + 0.3} b={LB + 0.7} fill={P.sun} w={3.4} />
          <Ink d="M 1000 840 L 1120 840" a={LB + 0.5} b={LB + 0.7} w={2} c={P.inkSoft} />
          {/* WHY an ink lid with a clasp that snaps shut on "data" (review SHOULD: it closed with no weight) */}
          <g transform={`rotate(${-70 * lin(t, Q.ourData - 0.1, Q.ourData + 0.15) * (1 - shut)} 1000 808)`}>
            <Shape d="M 1000 808 L 1120 808 L 1132 790 L 1012 790 Z" a={LB + 0.4} b={LB + 0.8} fill={P.sunSoft} w={3.4} />
            <path d="M 1052 800 L 1068 800 L 1068 818 L 1052 818 Z" fill={P.ink} opacity={lin(t, LB + 0.6, LB + 0.8)} />
          </g>
        </g>
        {/* WHY one held pose (round 2 review BLOCKER: his arm flickered between two drawings every few frames): both hands
            clamp his hat down through the whole beat while it shakes and her things escape it */}
        <HatFigure x={HM.x} y={HM.y} s={HM.s} crown={90} a={LB + 0.1} b={LB + 1.0} pose={within(t, DATA_FROM - 0.25, ITEM_LAND(2) + 0.2) ? 'grab' : 'sides'} fade={0.28}
          hands={within(t, DATA_FROM - 0.25, ITEM_LAND(2) + 0.2) ? [[-25, -214 + hatShake], [25, -214 + hatShake]] : undefined}
          drop={pops + hatShake * 0.02} lean={-3 * Math.min(1, pops * 4) + hatShake * 0.4} />
        {[0, 1, 2].map((i) => {
          let u = (t - (DATA_FROM + i * DATA_GAP)) / DATA_DUR;
          if (u <= 0 || u >= 1) return null;
          u = EASE_IN_OUT(u);
          const v = 1 - u;
          const x = v * v * p0[0] + 2 * v * u * p1[0] + u * u * p2[0], y = v * v * p0[1] + 2 * v * u * p1[1] + u * u * p2[1] - i * 6;
          const sc = 2.6 * (1 - 0.35 * Math.max(0, (u - 0.8) / 0.2));
          return <KeepsakeIcon key={i} kind={DATA_KINDS[i]} x={x} y={y} s={sc} w={2.6 / sc} r={Math.sin(i * 2.1 + t * 3) * 12} color={[P.paper, P.pinkSoft, '#FFFDF8'][i]} />;
        })}
      </Sheet>
    </>
  );
};
export const OURS: Spread = { id: 'ours', Art: OursArt };

// ======================= viii · the past: the strings snap =======================
// WHY rebuilt (review SHOULD: six identical men in a symmetric row, and 3 s of nothing after the snap): two old kings far
// back on a high ledge and one big near one, the people in the foreground at four depths. On "free" every string snaps
// with a whip, the people stagger, and the slack end of each string curls up into their hand and inks itself into the
// purple quill. On "tech" the kings grab at their hats; on "monopolies" the hats fly off; on "past" they slump, shrink and
// drain to a pale engraving, and the book's next leaf lifts.
const KINGS = [{ x: 470, y: 372, s: 1.0 }, { x: 905, y: 356, s: 0.92 }, { x: 1235, y: 450, s: 1.4 }];
const FOLK = [
  // WHY big, at four depths (review: people 80 px high in a row): the people are the story here, the kings are the past
  { x: 250, y: 950, s: 2.9, look: 'meadow' as Theme, king: 0 }, { x: 610, y: 880, s: 2.25, look: 'cotton' as Theme, king: 0 },
  { x: 960, y: 930, s: 2.65, look: 'sunbreak' as Theme, king: 1 }, { x: 1320, y: 968, s: 3.1, look: 'devils' as Theme, king: 2 },
];
/** The quill inking itself in a hand: its outline draws from the nib up, then the purple fills from tip to feather. */
const QUILL_D = 'M 8 -15 C 18 -60 52 -118 96 -150 C 92 -118 70 -64 14 -12 Z';
const QuillInk: React.FC<{ x: number; y: number; s: number; r: number; p: number; id: string }> = ({ x, y, s, r, p, id }) => {
  if (p <= 0) return null;
  const line = Math.min(1, p / 0.5), fill = Math.max(0, Math.min(1, (p - 0.35) / 0.65));
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <defs><clipPath id={id}><rect x={-10} y={-160 * fill} width={120} height={170 * fill + 4} /></clipPath></defs>
      {fill > 0 && <path d={QUILL_D} fill={P.purple} clipPath={`url(#${id})`} />}
      <path d="M 0 0 L 6 -16 L 12 -14 Z" fill={P.ink} opacity={line} />
      <path d={QUILL_D} pathLength={1} fill="none" stroke={P.ink} strokeWidth={2.4} strokeLinejoin="round" strokeDasharray={line >= 1 ? undefined : '1 2'} strokeDashoffset={line >= 1 ? undefined : 1 - line} />
      {fill > 0.6 && <path d="M 10 -14 C 34 -56 62 -104 92 -146" stroke={P.ink} strokeWidth={2} fill="none" strokeLinecap="round" opacity={(fill - 0.6) / 0.4} />}
    </g>
  );
};
const FreeArt: React.FC = () => {
  const t = useT();
  const L = land(TURN.free) - 1.4;
  const fade = lin(t, Q.past - 0.2, Q.pastEnd, EASE_IN_OUT);
  const kingFade = 0.78 * fade;
  return (
    <>
      <Folio left={18} />
      <Sheet>
        {/* the ledges the kings stand on */}
        <g opacity={1 - fade * 0.6}>
          <Shape d="M 330 372 L 1020 356 L 1012 388 L 338 404 Z" a={L} b={L + 0.5} fill="url(#c-hatch)" w={3.4} />
          <Shape d="M 1060 450 L 1460 450 L 1452 486 L 1068 486 Z" a={L + 0.1} b={L + 0.6} fill="url(#c-hatch)" w={3.4} />
        </g>
        {KINGS.map((k, j) => {
          const d = j * 0.1;
          // "tech": they grab their hats with both hands; "monopolies": the hats pop out of their hands and fly away
          const grab = within(t, Q.tech - 0.02 + d * 0.5, Q.monopolies2 + 0.12 + d);
          const offAt = Q.monopolies2 + 0.1 + d;
          const off = t > offAt;
          const hu = lin(t, offAt, offAt + 0.9, EASE_OUT);
          const slump = lin(t, Q.past - 0.15, Q.pastEnd, EASE_IN_OUT);
          const bar = { y: k.y - 112 * k.s, x0: k.x - 60 * k.s, x1: k.x + 60 * k.s };
          const ink = mixHex(P.ink, P.paper, kingFade * 0.66);
          const side = j === 2 ? 1 : -1;
          const ks = k.s * (1 - 0.1 * slump);
          return (
            <g key={j}>
              <HatFigure x={k.x} y={k.y} s={ks} crown={90} a={L + 0.1 + j * 0.1} b={L + 0.9 + j * 0.1} fade={kingFade} hat={!off}
                pose={grab ? 'grab' : off && t < Q.past ? 'hold' : 'sides'}
                hands={grab ? [[-24, -212 + jolt(t, Q.tech + d, -4, 0.4)], [24, -212 + jolt(t, Q.tech + d, -4, 0.4)]] : undefined}
                lean={Math.sin(t * 1.5 + j * 2.1) * 1.2 + jolt(t, offAt, 8 * side, 0.7) + 14 * slump * (j === 2 ? -1 : 1) * 0.6 + (t > Q.free ? -6 * jolt(t, Q.free, 1, 0.6) : 0)}
                bob={jolt(t, Q.free + 0.02, -6, 0.4) + jolt(t, offAt, -10, 0.4) + 8 * slump} />
              {/* the hat, flying off and spinning away: slow enough to read, and always seen as a hat */}
              {off && hu < 1 && (
                <g transform={`translate(${k.x + side * 150 * hu * k.s} ${k.y - 212 * k.s - 90 * Math.sin(hu * Math.PI * 0.85) * k.s + hu * 60 * k.s}) rotate(${side * (18 + 34 * hu) + Math.sin(hu * 9) * 8}) scale(${k.s})`} opacity={1 - lin(t, offAt + 0.6, offAt + 0.9)}>
                  <path d="M -16 0 L -18.5 -90 Q 0 -94 18.5 -90 L 16 0 Z" fill={ink} stroke={ink} strokeWidth={3} />
                  <path d="M -16.4 -9 L -16.9 -19 L 16.9 -19 L 16.4 -9 Z" fill={mixHex(P.inkSoft, P.paper, kingFade * 0.66)} />
                  <path d="M -27 1 Q 0 -5 27 1" stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round" />
                </g>
              )}
              {/* the puppet bar, dropped when they grab their hats */}
              {!grab && !off && <path d={`M ${bar.x0} ${bar.y} L ${bar.x1} ${bar.y} M ${k.x} ${bar.y - 12 * k.s} L ${k.x} ${bar.y + 12 * k.s}`} stroke={ink} strokeWidth={5} strokeLinecap="round"
                opacity={lin(t, L + 0.6, L + 0.9)} />}
            </g>
          );
        })}
        {FOLK.map((f, i) => {
          const k = KINGS[f.king];
          const snapT = Q.free + i * 0.04;
          const snapped = t >= snapT;
          const su = lin(t, snapT, snapT + 0.35, EASE_OUT);
          // WHY they stagger first and get the quill after (review: they held quills while still on strings)
          const stagger = jolt(t, snapT + 0.02, [10, -12, 9, -10][i], 0.6);
          const curl = lin(t, snapT + 0.12, snapT + 0.42, EASE_IN_OUT);          // the slack string coils up into the hand
          const ink = lin(t, snapT + 0.36 + i * 0.04, snapT + 0.72 + i * 0.04, EASE_IN_OUT);  // and becomes the quill
          const freeNow = ink > 0;
          const dangle = snapped ? 0 : Math.sin(t * 2.3 + i) * 3;
          const pose: PersonPose = freeNow ? 'quill' : 'bothUp';
          const hands = [-24, 24].map((hx) => [f.x + hx * f.s + dangle, f.y - 96 * f.s] as [number, number]);
          const barY = k.y - 112 * k.s;
          const tops = [k.x - 46 * k.s + i * 6, k.x + 46 * k.s - i * 6].map((x) => [x, barY] as [number, number]);
          // where the quill sits in the hand once she lowers it (pose "quill" holds at 32,-78)
          const qx = f.x + 32 * f.s, qy = f.y - 78 * f.s;
          return (
            <g key={i}>
              {[0, 1].map((h) => {
                const [ax, ay] = tops[h], [bx2, by2] = hands[h];
                if (!snapped) return <Ink key={h} d={`M ${ax} ${ay} L ${bx2} ${by2}`} a={L + 0.7 + i * 0.05} b={L + 1.0 + i * 0.05} w={2.2} c={mixHex(P.ink, P.paper, kingFade * 0.66)} />;
                // the snap: the top half whips back up toward the bar and curls away
                const mx = (ax + bx2) / 2, my = (ay + by2) / 2;
                const ux = mx + (ax - mx) * 0.7 * su, uy = my + (ay - my) * 0.7 * su;
                const cw = Math.sin(su * Math.PI) * 40 * (h ? 1 : -1);
                const top = <path d={`M ${ax} ${ay} Q ${(ax + ux) / 2 + cw} ${(ay + uy) / 2} ${ux} ${uy}`} stroke={mixHex(P.ink, P.paper, kingFade * 0.66)} strokeWidth={2.2} fill="none" strokeLinecap="round" opacity={1 - lin(t, snapT + 0.5, snapT + 0.9)} />;
                // the lower half (the right hand's only): it drops slack, then coils up into the hand where the quill will be
                if (h === 0) return <g key={h}>{top}{curl < 1 && <path d={`M ${bx2} ${by2} Q ${bx2 - 20} ${by2 - 40 + 100 * su} ${mx + (bx2 - mx) * curl} ${my + 140 * su * (1 - curl) + (by2 - my) * curl}`} stroke={P.ink} strokeWidth={2.2} fill="none" strokeLinecap="round" opacity={1 - curl} />}</g>;
                const ex = mx + (qx - mx) * curl, ey = my + 140 * su * (1 - curl) + (qy - my) * curl;
                return (
                  <g key={h}>
                    {top}
                    {ink < 0.6 && <path d={`M ${bx2} ${by2} Q ${bx2 + 30 - 60 * curl} ${by2 - 40 + 100 * su - 60 * curl} ${ex} ${ey}`} stroke={curl > 0.5 ? mixHex(P.ink, P.purple, (curl - 0.5) * 2) : P.ink} strokeWidth={2.2 + curl * 1.4} fill="none" strokeLinecap="round" opacity={1 - Math.max(0, (ink - 0.3) / 0.3)} />}
                  </g>
                );
              })}
              <Ink d={`M ${f.x - 34 * f.s} ${f.y} L ${f.x + 34 * f.s} ${f.y}`} a={L + 0.3} b={L + 0.5} w={2.2} c={P.inkSoft} />
              <Person x={f.x} y={f.y} s={f.s} a={L + 0.2 + i * 0.08} b={L + 0.8 + i * 0.08} pose={pose} hair={HAIR[f.look]} hairColor={P.ink} body={SHIRT[f.look]}
                mood={snapped && !freeNow ? 'o' : 'smile'} tilt={stagger} bob={jolt(t, snapT + 0.04, 8, 0.5) + (ink >= 1 ? jolt(t, snapT + 0.75 + i * 0.04, -10, 0.5) : 0)} />
              {freeNow && <g transform={`translate(${f.x} ${f.y}) rotate(${stagger}) scale(${f.s})`}><QuillInk x={32} y={-78} s={0.36} r={[12, -4, 10, -2][i]} p={ink} id={`c-qi-${i}`} /></g>}
            </g>
          );
        })}
      </Sheet>
    </>
  );
};
export const FREE: Spread = { id: 'free', Art: FreeArt };

// ======================= ix · the riffle: one card, answering every page's ask =======================
// WHY rebuilt (round 2 review BLOCKER: four strangers with four unrelated, generic cards): the card sits at exactly the
// same place on every page, in the same frame with the same quill mark, so each page-turn reads as the same card
// re-made; every page's person holds the purple quill and has written what they wanted, and the card answers that ask
// literally (grandma's photo really does grow HUGE, past the card's edges).
const RIFFLE: { look: Theme; what: Made; ask: string[]; hair: 'bun' | 'curly' | 'bob' | 'cap' | 'long' | 'tuft' }[] = [
  { look: 'cotton', what: 'photos', ask: ["grandma's photos", 'but HUGE'], hair: 'long' },
  { look: 'meadow', what: 'chores', ask: ['chores chart', 'for the kids?'], hair: 'tuft' },
  { look: 'sunbreak', what: 'quiz', ask: ['a quiz for', 'my class'], hair: 'bob' },
  { look: 'devils', what: 'shifts', ask: ['just my shifts', 'pls'], hair: 'cap' },
];
const RIFFLE_CARD = { x: 1140, y: 480, w: 600 };
const ownSpread = (k: number): Spread => {
  const R = RIFFLE[k];
  const look = LOOK[R.look];
  const Art: React.FC = () => {
    const t = useT();
    const T0 = TURN.riffle[k];
    // grandma's page: the photo swells out of the card until it is HUGE
    const huge = k === 0 ? lin(t, T0 + 0.25, T0 + 0.85, EASE_OUT) : 0;
    const cardK = RIFFLE_CARD.w / 400;
    return (
      <>
        <Sheet rough={false}>
          {/* WHY the theme's own paper lightened toward cream (review: muddy grey-green and beige pages; round 2: lighter still) */}
          <rect x={0} y={0} width={1520} height={980} fill={mixHex(look.page, '#FFFAF0', R.look === 'meadow' ? 0.75 : 0.6)} />
          <Scrap x0={110} y={300} text={R.ask} a={-10} b={-9.5} outlineAt={-11} size={84} rot={[-2, 1.5, -1, 2][k]} />
          <Ink d="M 240 900 L 560 900" a={-10} b={-9} w={2.4} c={P.inkSoft} />
          <Person x={400} y={900} s={2.9} a={-10} b={-9.5} body={SHIRT[R.look]} hair={R.hair} hairColor={P.ink} pose="quill" mood="smile"
            bob={jolt(t, T0 + 0.15, -12, 0.4)} />
          <g transform={`translate(400 900) scale(2.9)`}><Quill x={32} y={-78} s={0.36} r={10 + Math.sin(t * 5 + k) * 6} /></g>
          <MadeCard look={R.look} what={R.what} x={RIFFLE_CARD.x} y={RIFFLE_CARD.y} w={RIFFLE_CARD.w} />
          {huge > 0 && (
            <g transform={`translate(${RIFFLE_CARD.x} ${RIFFLE_CARD.y - madeHeight(RIFFLE_CARD.w) / 2 + MADE_HERO.y * cardK}) scale(${cardK * (1 + 0.62 * huge)}) translate(${-MADE_HERO.x} ${-MADE_HERO.y})`}>
              <MadeArt what="photos" look={R.look} t={t} />
            </g>
          )}
        </Sheet>
        <Folio left={20 + k * 2} />
      </>
    );
  };
  return { id: `own-${k}`, Art };
};
export const VARIANTS: Spread[] = RIFFLE.map((_, k) => ownSpread(k));

// ======================= ix · everything: she shares it, he asks for it to be his =======================
// WHY re-staged (round 2 review: the payoff was small, crowded and over in 1.2 s): the camera pushes in on the right page
// from "source", so his card and his ask fill half the frame. On "open" a copy of her cat's card lifts and flies to the
// pin on his page; on "source" he asks, in a speech scrap beside his head, for it to be called mochi and made green; on
// "everything" it is redrawn in ink (line art first, then the green floods in, with a settle). Then the drawings ink
// back into the page and the bare page warms into the end card (take1c.tsx).
const A = { x: 300, y: 860, s: 2.1, card: { x: 520, y: 450, w: 400 } };
const B = { x: 1365, y: 770, s: 2.0 };
const SLOT = { x: 1150, y: 250, w: 380 };
const LIFT = Q.open + 0.02, FLY = LIFT + 0.12, LAND = FLY + 0.36;
const ASK_A = Q.source + 0.02, ASK_B = ASK_A + 0.5;
const SKIN_A = Q.everything2, SKIN_B = SKIN_A + 0.3, SKIN_INK = SKIN_B + 0.3;
/** When the drawings on the last page ink back into the paper, so the bare page can become the end card. */
export const PAGE_CLEAR = Q.everything2 + 1.75;
if (LAND > Q.source + 0.06) throw new Error(`take1c: the shared copy must land by "source" (${LAND.toFixed(2)} > ${Q.source.toFixed(2)})`);
const EverythingArt: React.FC = () => {
  const t = useT();
  const lift = lin(t, LIFT, FLY, EASE_OUT);
  const u = lin(t, FLY, LAND, EASE_IN_OUT);
  const settle = jolt(t, LAND, 1, 0.4);
  const dip = lin(t, Q.open - 0.1, Q.open + 0.02) * (1 - lin(t, Q.open + 0.02, Q.open + 0.1)) * 12;
  const cx = A.card.x + (SLOT.x - A.card.x) * u, cy = A.card.y + (SLOT.y - A.card.y) * u - Math.sin(u * Math.PI) * 170 - lift * 14 * (1 - u) + dip;
  const cw = A.card.w + (SLOT.w - A.card.w) * u;
  const carried = lift * (1 - lin(t, LAND - 0.08, LAND + 0.1));
  const skin = lin(t, SKIN_A, SKIN_B, EASE_IN_OUT);
  const skinInk = lin(t, SKIN_B, SKIN_INK, EASE_IN_OUT);
  // her: she waves the quill as the copy leaves, and nods as it lands
  const wave = held(t, LIFT - 0.05, LAND, 0.1, 0.2);
  const nod = jolt(t, LAND + 0.04, 6, 0.4);
  // the quill that does the redraw: it rides the redraw's edge, then floods the green from its tip
  const edge = madeEdge(SLOT.x, SLOT.y, SLOT.w, skin);
  const clear = 1 - lin(t, PAGE_CLEAR, PAGE_CLEAR + 0.35, EASE_IN_OUT);
  return (
    <>
      <Folio left={32} hideRight />
      <Sheet>
        <g opacity={clear}>
          <Ink d={`M ${A.x - 110} ${A.y} L ${A.x + 130} ${A.y}`} a={-10} b={-9} w={2.4} c={P.inkSoft} />
          <Person x={A.x} y={A.y} s={A.s} a={-10} b={-9} body={SHIRT.cotton} hair="bob" hairColor={P.ink} pose="quill" mood="smile" tilt={nod + wave * Math.sin((t - LIFT) * 16) * 4} />
          {t < SKIN_A - 0.3 && <g transform={`translate(${A.x} ${A.y}) rotate(${nod + wave * Math.sin((t - LIFT) * 16) * 4}) scale(${A.s})`}><Quill x={32} y={-78} s={0.36} r={10 + wave * Math.sin((t - LIFT) * 16) * 18} /></g>}
          {/* WHY it dims while its copy is away (review: the copy briefly looked like a double exposure) */}
          <MadeCard look="cotton" what="cat" x={A.card.x} y={A.card.y} w={A.card.w} r={-1.5} o={1 - 0.35 * carried} />
          {/* him, and the pin on his page where the copy lands (round 2 review: a dashed box read as a wireframe) */}
          <Ink d={`M ${B.x - 90} ${B.y} L ${B.x + 90} ${B.y}`} a={-10} b={-9} w={2.4} c={P.inkSoft} />
          {t < LAND + 0.05 && <g><circle cx={SLOT.x} cy={SLOT.y - madeHeight(SLOT.w) / 2 + 4} r={9} fill={P.pink} stroke={P.ink} strokeWidth={2.6} /><path d={`M ${SLOT.x} ${SLOT.y - madeHeight(SLOT.w) / 2 + 13} L ${SLOT.x + 2} ${SLOT.y - madeHeight(SLOT.w) / 2 + 26}`} stroke={P.ink} strokeWidth={2.4} /></g>}
          <Person x={B.x} y={B.y} s={B.s} a={-10} b={-9} body={SHIRT.meadow} hair="curly" hairColor={P.ink} flip
            pose={t > SKIN_INK ? 'bothUp' : t > ASK_A - 0.05 && t < ASK_B + 0.1 ? 'wave' : t > LAND ? 'up' : 'down'} mood={t > SKIN_INK ? 'o' : 'smile'}
            bob={jolt(t, LAND + 0.05, -10, 0.5) + jolt(t, SKIN_INK, -16, 0.55)} />
          {/* his wish, in his own hand, as a speech scrap beside his head: the cause of the change, visibly */}
          <Scrap x0={1112} y={462} text={['call him mochi', 'and make him green']} a={ASK_A} b={ASK_B} size={38} outlineAt={ASK_A} rot={1.4} />
          {t > ASK_A && <Ink d={`M ${1300} ${530} Q ${1326} ${556} ${1340} ${586}`} a={ASK_A} b={ASK_A + 0.12} w={2.6} />}
          {/* the one copy */}
          {t >= LIFT && (
            <MadeCard look="cotton" what="cat" x={cx} y={cy + settle * 4} w={cw} r={-1.5 * (1 - u) + Math.sin(u * Math.PI) * 6} s={1 + carried * 0.06 + 0.04 * Math.sin(skinInk * Math.PI)} shadow={carried}
              next={{ look: 'meadow', what: 'cat', p: skin, name: 'mochi', ink: skinInk }} />
          )}
          {t > SKIN_A - 0.12 && t < SKIN_INK + 0.4 && <Quill x={skin < 1 ? edge.x : SLOT.x + SLOT.w / 2 + 18} y={skin < 1 ? edge.y + 4 : SLOT.y - 40 + Math.sin(t * 6) * 4} s={0.8} r={skin < 1 ? -14 : 6} />}
        </g>
      </Sheet>
    </>
  );
};
export const EVERYTHING: Spread = { id: 'everything', Art: EverythingArt };
