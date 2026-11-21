// Take 1C, chapters v–ix (rebuilt in review round five).
//  v    "Blinded by their own hubris"        close on three faces: their too-big hats slide down over their eyes, they
//                                             shove them back up, and on "hubris" the hats shoot up out of the frame
//       "created a new kind of technology"   wide: across both pages, their desk with something under a cloth; one
//                                             yanks the cloth away on "technology" (an unveiling)
//       "artificial intelligence"            extreme close: a purple quill rises from the inkwell and wakes like a bird
//       "they believed would bring about"    the three huddle and scheme while the quill leans out, curious; a cage drops on it
//       "a great treasure: shareholder value" over the tall one's shoulder: a padlock on the cage, coins pile up, coin eyes;
//                                             then close on them puffing out their chests, and leaping on "excitement"
//       "far beyond their own control"       wide: the quill squeezes out of the top of its cage, the tall one's arm
//                                             stretches across the desk and closes on air; it zips out of the frame
//  vi   "a tool that can make software"      someone's hand writes "my plants keep dying"; the quill draws them a card
//       "the ever-scarce foundation…"        their stack of software, padlocked, cracks; a slab slides out; they windmill
//       "for anyone who asks"                one card, close, re-drawn for each new person who asks; then three people,
//                                             each holding their own copy of that one card, in their own look
//  vii  "we get to decide…"                  chapter ii's three pictures, undone one by one by the people they were done to
//  viii "free ourselves… monopolies of the past" the strings snap; the people get the quill; the old kings' hats topple
//  ix   "at long, long last… open source everything" the riffle: one card, re-dressed on every page by whoever asks;
//                                             then she passes a copy of hers to him, and he asks for it to be his
import React from 'react';
import { EASE_IN, EASE_IN_OUT, EASE_OUT } from '../brand';
import { loadFont as loadCaveat } from '@remotion/google-fonts/Caveat';
import { HatFigure, HatPose, Ink, jolt, KeepsakeIcon, Laptop, lin, mixHex, P, Padlock, Person, PersonPose, pop, PriceTag, Quill, Shape, useT, WashBg } from './take1c-ink';
import { LOOK, Made, MadeCard, madeEdge, rr, Theme, ThemedWindow, windowHeight } from './take1c-apps';
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

// ---------- people: one figure spec for the whole stretch ----------
// WHY one shirt colour per look (review SHOULD: four clones in one olive fill; figures changed style from spread to
// spread): every ordinary person wears a warm, distinct colour taken from the look of the thing they made, so a
// person and their card visibly belong together, and the same person keeps the same colours wherever they appear.
const SHIRT: Record<Theme, string> = { meadow: '#93B795', cotton: '#C7A2D8', sunbreak: '#E2B45A', devils: '#C46A7E' };
const HAIR: Record<Theme, 'bun' | 'curly' | 'bob' | 'cap'> = { meadow: 'bun', cotton: 'curly', sunbreak: 'bob', devils: 'cap' };

/** A scrap of paper with a person's handwritten wish, written left to right. `a`..`b` is the writing. */
const Scrap: React.FC<{ x0: number; y: number; text: string | string[]; a: number; b: number; size?: number; o?: number; rot?: number; outlineAt?: number; pen?: boolean }> = ({ x0, y, text, a, b, size = 56, o = 1, rot = -1.4, outlineAt, pen }) => {
  const t = useT();
  const lines = Array.isArray(text) ? text : [text];
  const oa = outlineAt ?? a - 0.12;
  if (t < oa || o <= 0.01) return null;
  // WHY a width from the text itself: stretched to a fixed width, short wishes looked typed, not handwritten
  const lw = lines.map((l) => l.length * size * 0.4);
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
      <path d={box} fill="rgba(42,26,53,0.18)" transform="translate(5 7)" opacity={lin(t, oa + 0.06, oa + 0.14)} />
      <path d={box} fill="#FFFDF8" opacity={lin(t, oa + 0.04, oa + 0.12)} />
      <Ink d={box} a={oa} b={oa + 0.12} w={2.6} />
      {lines.map((l, i) => {
        const share = lw[i] / total, start = acc; acc += share;
        const p = Math.max(0, Math.min(1, (u - start) / share));
        if (p <= 0) return null;
        return (
          <g key={i}>
            <defs><clipPath id={`${id}-${i}`}><rect x={x0 - 6} y={y + i * size * 0.95 - size} width={(lw[i] + 16) * p} height={size * 1.3} /></clipPath></defs>
            <text x={x0} y={y + i * size * 0.95} clipPath={`url(#${id}-${i})`} fontFamily={CAVEAT} fontWeight={700} fontSize={size} fill={P.ink}>{l}</text>
          </g>
        );
      })}
      {pen && u > 0 && u < 1 && (() => {
        // the nib rides the end of the ink
        let a2 = 0, li = 0;
        for (; li < lines.length; li++) { const s2 = lw[li] / total; if (u <= a2 + s2 || li === lines.length - 1) break; a2 += s2; }
        const p = Math.min(1, (u - a2) / (lw[li] / total));
        return <Pencil x={x0 + lw[li] * p} y={y + li * size * 0.95 - size * 0.1 + Math.sin(u * 40) * 4} />;
      })()}
    </g>
  );
};
/** A plain pencil, nib at (x, y), held by a hand reaching in from below the frame. */
const Pencil: React.FC<{ x: number; y: number; arm?: boolean; sleeve?: string }> = ({ x, y, arm = true, sleeve = SHIRT.meadow }) => (
  <g>
    {arm && <>
      <path d={`M ${x + 60} ${y + 56} C ${x + 100} ${y + 120} ${x + 130} ${y + 220} ${x + 150} ${y + 520}`} stroke={P.ink} strokeWidth={46} fill="none" strokeLinecap="round" />
      <path d={`M ${x + 60} ${y + 56} C ${x + 100} ${y + 120} ${x + 130} ${y + 220} ${x + 150} ${y + 520}`} stroke={sleeve} strokeWidth={39} fill="none" strokeLinecap="round" />
    </>}
    <g transform={`translate(${x} ${y}) rotate(-38)`}>
      <path d="M 0 0 L 10 -6 L 10 6 Z" fill={P.ink} />
      <path d="M 10 -7 L 26 -9 L 26 9 L 10 7 Z" fill="#F3D9B8" stroke={P.ink} strokeWidth={2.4} strokeLinejoin="round" />
      <path d="M 26 -9 L 110 -9 L 110 9 L 26 9 Z" fill={P.sun} stroke={P.ink} strokeWidth={2.6} strokeLinejoin="round" />
    </g>
    {arm && <ellipse cx={x + 52} cy={y + 42} rx={26} ry={22} fill="#F6E4D4" stroke={P.ink} strokeWidth={3.4} />}
  </g>
);

// ======================= v · the handful: three characters, not three clones =======================
// WHY three silhouettes (review BLOCKER: three identical cut-outs with dot eyes, frozen for seconds at a time): a short
// round one, a middle one with a monocle, and a tall thin one, each with eyes and a mouth that change on the words
// (slits to scheme, coins for greed, wide circles for shock, a grin), and a run of big, readable poses on their words.
const S = 1.3;
const CH = [{ sx: 1.2, sy: 0.84 }, { sx: 1, sy: 1 }, { sx: 0.84, sy: 1.17 }];
type Eyes = 'dots' | 'slit' | 'wide' | 'coins' | 'down';
type Mouth = 'none' | 'grin' | 'o' | 'smug';
type ManState = { pose: HatPose; lean: number; bob: number; crown: number; hatSx: number; drop: number; eyes: Eyes; mouth: Mouth; px: number; py: number; fist: number; fade?: number };
/** Their eyes and mouth, in the hat figure's own drawing units (its head sits at 0,-197). */
const ManFace: React.FC<{ eyes: Eyes; mouth: Mouth; monocle?: boolean; ink?: string }> = ({ eyes, mouth, monocle, ink = P.ink }) => (
  <g transform="rotate(-10 0 -197)">
    {eyes === 'dots' && <><circle cx={-5} cy={-199} r={2.4} fill={ink} /><circle cx={6} cy={-199} r={2.4} fill={ink} /></>}
    {eyes === 'down' && <><circle cx={-5} cy={-196} r={2.4} fill={ink} /><circle cx={6} cy={-196} r={2.4} fill={ink} /></>}
    {eyes === 'slit' && <path d="M -9 -199 L -1 -198 M 2 -198 L 10 -199" stroke={ink} strokeWidth={2.4} strokeLinecap="round" />}
    {eyes === 'wide' && [-5, 6].map((cx) => <g key={cx}><circle cx={cx} cy={-200} r={4.6} fill={P.paper} stroke={ink} strokeWidth={1.4} /><circle cx={cx} cy={-200} r={1.9} fill={ink} /></g>)}
    {eyes === 'coins' && [-5, 6].map((cx) => <g key={cx}><circle cx={cx} cy={-200} r={5.4} fill={P.sun} stroke={ink} strokeWidth={1.4} /><circle cx={cx} cy={-200} r={2.4} fill="none" stroke={ink} strokeWidth={0.9} opacity={0.6} /></g>)}
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
    <HatFigure x={0} y={0} s={1} a={a} b={b} crown={st.crown} hatSx={st.hatSx} drop={st.drop} pose={st.pose} lean={st.lean} bob={st.bob} eyes="none" fist={st.fist} fade={st.fade ?? 0} />
    {/* WHY hidden while the hat covers the head: the face must not draw over the hat ("blinded") */}
    {st.drop < 0.35 && <g transform={`translate(0 ${st.bob}) rotate(${st.lean})`}><ManFace eyes={st.eyes} mouth={st.mouth} monocle={j === 1} ink={st.fade ? mixHex(P.ink, P.paper, st.fade * 0.66) : P.ink} /></g>}
  </g>
);
/** Where a point on man j (in his drawing units) lands on the page. */
const manPt = (j: number, x: number, y: number, st: ManState, lx: number, ly: number): [number, number] => {
  const r = (st.lean * Math.PI) / 180;
  const qx = lx * Math.cos(r) - ly * Math.sin(r), qy = lx * Math.sin(r) + ly * Math.cos(r) + st.bob;
  return [x + qx * S * CH[j].sx * st.px, y + qy * S * CH[j].sy * st.py];
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
const REST = { x: WELL, y: MOUTH + 8, r: -18, s: 1.3 };
const CAGE = { x: WELL, w: 140, top: 352, band: 448 };
// WHY drawn before the cut: the film cuts straight into this spread on "Blinded"; nothing may still be inking in
const DRAWN = TURN.treasure - 3;
const BASE_CROWN = 100;                          // a little too big from the start: it is what makes "blinded" possible
const GROW = [44, 36];
const HAT_K = [0.9, 1, 0.95];
const CAGE_AT = Q.bringAbout + 0.12;              // the cage starts to fall
const CAGE_LAND = CAGE_AT + 0.3;

/** How tall each man's hat is: two comic jumps on "hubris", each landing with an overshoot, then it stays. */
const crownAt = (t: number, j: number) =>
  GROW.reduce((c, g, i) => c + g * HAT_K[j] * Math.min(1.14, pop(t, Q.hubris + i * 0.2 + j * 0.04, 0.26)), BASE_CROWN);
const hatSxAt = (t: number, j: number) =>
  GROW.reduce((sx, _, i) => { const x = (t - (Q.hubris + i * 0.2 + j * 0.04)) / 0.24; return x > 0 && x < 1 ? sx - 0.28 * Math.sin(x * Math.PI) : sx; }, 1);

/** Everything each man does in chapters v and vi, beat by beat on the narrator's words. */
const manAt = (t: number, j: number): ManState => {
  const d = j * 0.07;                                 // WHY: each reacts a couple of frames after his neighbour
  let pose: HatPose = 'sides', eyes: Eyes = 'dots', mouth: Mouth = 'none';
  let lean = Math.sin(t * (1.6 + j * 0.4) + j * 2.3) * (0.8 + j * 0.4);   // idle weight shift
  let bob = 0, px = 1, py = 1 + 0.012 * Math.sin(t * 2.7 + j * 1.1), fist = 0;
  // "Blinded": the too-big hats slide down over their eyes; they stagger blind, then shove them back up on "their own"
  const drop = lin(t, Q.blinded + 0.04 + d, Q.blinded + 0.24 + d, EASE_IN) * (1 - lin(t, Q.ownHubris - 0.12 + d, Q.ownHubris + 0.08 + d, EASE_OUT));
  lean += Math.sin(t * 13 + j * 2) * 4 * drop;
  if (within(t, Q.byTheir + 0.1 + d, Q.ownHubris + 0.2 + d)) pose = 'grab';
  // "hubris": chins up, chests out, grins, as the hats shoot up
  if (t >= Q.ownHubris + 0.1) { mouth = 'smug'; }
  lean += -7 * held(t, Q.hubris - 0.05 + d, Q.these - 0.2, 0.25, 0.3);
  px += 0.06 * held(t, Q.hubris + d, Q.these - 0.2, 0.2, 0.3);
  bob += jolt(t, Q.hubris + 0.3 + j * 0.1, -9, 0.45);
  // "created": the two at the sides fling their arms up, ta-da; the middle one holds the cord to the cloth
  if (within(t, Q.created1 - 0.05 + d, Q.newKind + 0.1)) { if (j !== 1) pose = 'grab'; mouth = 'grin'; }
  bob += jolt(t, Q.created1 + d, -12, 0.5);
  if (j === 1 && within(t, Q.these, Q.technology2 + 0.45)) pose = 'bar';
  // "a new kind of": they lean in, scheming; "technology": he yanks the cord, and they gape at what is under it
  if (within(t, Q.newKind, Q.technology2)) { eyes = 'slit'; mouth = 'smug'; lean += 7 * lin(t, Q.newKind, Q.newKind + 0.3); }
  if (j === 1) { lean += -16 * held(t, Q.technology2 - 0.06, Q.technology2 + 0.25, 0.08, 0.3); if (within(t, Q.technology2 - 0.06, Q.technology2 + 0.4)) pose = 'key'; }
  if (within(t, Q.technology2 + 0.1, CUT.believe)) { eyes = 'wide'; mouth = 'grin'; if (j !== 1 && t > Q.technology2 + 0.45) pose = 'rub'; }
  // "A technology they": all three lean in toward the quill, the short one on tiptoe
  if (within(t, CUT.believe, Q.believed)) { eyes = 'wide'; mouth = 'o'; lean += 8 * lin(t, Q.aTechnology + d, Q.aTechnology + 0.3 + d); }
  if (j === 0) { const tip = held(t, Q.aTechnology + 0.1, Q.believed, 0.2, 0.2); bob -= 12 * tip; py += 0.06 * tip; }
  // "believed": they huddle, heads together, whispering
  if (within(t, Q.believed, CAGE_LAND)) {
    eyes = 'slit'; mouth = 'smug';
    // WHY modest angles: at 12 degrees their tall hats crossed into one blob
    lean += [8, 2, -7][j] * lin(t, Q.believed + d, Q.believed + 0.25 + d);
    bob += [0, 5, 0][j] * lin(t, Q.believed, Q.believed + 0.25);
    pose = j === 1 ? 'pat' : 'rub';
  }
  // the cage lands: they straighten up, smug; the tall one pats his coat
  if (within(t, CAGE_LAND, Q.treasure)) { eyes = 'dots'; mouth = 'smug'; pose = j === 2 ? 'pat' : j === 0 ? 'bar' : 'sides'; }
  bob += jolt(t, CAGE_LAND + d, -8, 0.4);
  // "treasure": coin eyes, rubbing hands, leaning toward the cage
  if (within(t, Q.treasure, Q.createdSomething)) { eyes = 'coins'; mouth = 'grin'; pose = 'rub'; }
  lean += 6 * held(t, Q.treasure + d, Q.value, 0.3, 0.2);
  // "value": chests puffed out, chins up, each a few frames apart and to his own angle
  const puff = held(t, Q.value + j * 0.12, Q.excitement - 0.05, 0.22, 0.2);
  px += 0.12 * puff; py -= 0.03 * puff; lean += [-4, -8, -6][j] * puff;
  if (puff > 0.5) pose = 'pat';
  // "excitement": they leap, arms up
  const leap = Math.max(0, Math.sin(Math.min(1, Math.max(0, (t - (Q.excitement + j * 0.11)) / 0.42)) * Math.PI));
  bob -= 40 * leap;
  if (leap > 0.05) { pose = 'grab'; eyes = 'wide'; }
  // "created something": they turn to the cage; on "something" the quill stirs and they freeze, aghast
  if (within(t, Q.createdSomething, Q.somethingFar)) { eyes = 'dots'; mouth = 'none'; lean += 4; pose = 'sides'; }
  if (within(t, Q.somethingFar, Q.control + 0.15)) { eyes = 'wide'; mouth = 'o'; if (j < 2) pose = 'hold'; }
  // "far beyond their own control": the tall one throws his long arm (drawn by the spread) at the quill
  if (j === 2 && within(t, Q.far - 0.06, Q.control + 0.42)) { pose = 'stretch'; lean += 10 * lin(t, Q.far - 0.06, Q.far + 0.2); }
  if (j === 2 && t >= Q.control + 0.02) fist = 1;
  // the tumble: the short one falls back, the middle one sits down hard, the tall one recoils staring at his empty fist
  if (t > Q.control + 0.1) {
    const k = lin(t, Q.control + 0.12 + d, Q.control + 0.3 + d, EASE_OUT);
    if (j === 0) { lean += -26 * k; bob += 6 * k; eyes = 'wide'; }
    if (j === 1) { py -= 0.2 * k; bob += 10 * k; eyes = 'wide'; mouth = 'o'; }
    if (j === 2) { if (t > Q.control + 0.42) pose = 'key'; lean += jolt(t, Q.control + 0.42, -9, 0.45); eyes = 'wide'; mouth = 'o'; }
  }
  // chapter vi, "ever-scarce": smug again on their padlocked stack; "foundation": they look down at the crack
  if (t >= CUT.scarce) {
    lean = Math.sin(t * (1.6 + j * 0.4) + j * 2.3) * (0.8 + j * 0.4); px = 1; py = 1; fist = 0;
    eyes = 'dots'; mouth = 'smug'; pose = j === 1 ? 'pat' : 'sides';
    if (t > Q.foundation) { eyes = 'down'; mouth = 'o'; }
    // "monopolies": a slab slides out from under them and they windmill to keep their balance
    if (t > Q.monopolies1 + 0.15) {
      eyes = 'wide';
      // WHY two arm positions swapped at a readable pace, and leans out of step (render: a pose every 3 frames read as a glitch,
      // and in-phase leans merged them into one blob)
      pose = (['grab', 'reach'] as HatPose[])[(Math.floor(t * 5.5) + j) % 2];
      lean = Math.sin(t * 11 + j * 2.6) * 7;
    }
  }
  return { pose, lean, bob, crown: crownAt(t, j), hatSx: hatSxAt(t, j), drop, eyes, mouth, px, py, fist };
};

/** The long reaching arm: a coat sleeve in the men's own ink, ending in a hand that closes on nothing. */
const Reach: React.FC<{ from: [number, number]; to: [number, number]; p: number; fist: number }> = ({ from, to, p, fist }) => {
  if (p <= 0.001) return null;
  const hx = from[0] + (to[0] - from[0]) * p, hy = from[1] + (to[1] - from[1]) * p;
  const mx = (from[0] + hx) / 2, my = Math.min(from[1], hy) - 50 * p;
  const ang = Math.atan2(hy - my, hx - mx);
  const fingers = [-0.62, -0.2, 0.2, 0.62].map((d) => {
    const len = 14 * (1 - fist * 0.85);
    return `M ${hx + Math.cos(ang + d) * 9} ${hy + Math.sin(ang + d) * 9} l ${Math.cos(ang + d * 0.5) * len} ${Math.sin(ang + d * 0.5) * len}`;
  }).join(' ');
  const arm = `M ${from[0]} ${from[1]} Q ${mx} ${my} ${hx} ${hy}`;
  return (
    <g>
      <path d={arm} stroke={P.ink} strokeWidth={11} fill="none" strokeLinecap="round" />
      <path d={arm} pathLength={1} stroke={P.ink} strokeWidth={17} fill="none" strokeLinecap="round" strokeDasharray="0.45 2" />
      <path d={fingers} stroke={P.ink} strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d={fingers} stroke={P.paper} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <circle cx={hx} cy={hy} r={fist > 0.5 ? 8 : 11} fill={fist > 0.5 ? P.ink : P.paper} stroke={P.ink} strokeWidth={3} />
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
    {/* WHY a ring of purple that swells once when the cloth comes off: the reveal says "something is alive in here" without a sparkle */}
    <ellipse cx={x} cy={MOUTH} rx={16 + glow * 6} ry={3.4 + glow * 1.4} fill={P.purple} />
  </g>
);

/** The birdcage they lower over the quill: drawn bars, a domed top, and a padlock on the door. */
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
  return (
    <g transform={`translate(${rattle} ${dy}) translate(${x} ${TOP}) scale(${1 + sq} ${1 - sq}) translate(${-x} ${-TOP})`}>
      {bars.map((bx, i) => <path key={i} d={`M ${bx} ${TOP - 10} L ${bx} ${band} Q ${bx} ${top + 6} ${x} ${top}`} {...st} />)}
      <path d={`M ${x0} ${band} Q ${x0} ${top - 10} ${x} ${top - 12} Q ${x1} ${top - 10} ${x1} ${band}`} {...st} strokeWidth={4.4} />
      <path d={`M ${x0 - 4} ${band} L ${x1 + 4} ${band} M ${x0 - 4} ${band + 80} L ${x1 + 4} ${band + 80}`} {...st} strokeWidth={4} />
      <path d={rr(x0 - 10, TOP - 14, w + 20, 14, 4)} fill={P.inkSoft} stroke={P.ink} strokeWidth={3} />
      <circle cx={x} cy={top - 24} r={11} {...st} strokeWidth={4} />
      {/* WHY big and on its own beat (review: a 1.5% padlock): it slams shut on "treasure" */}
      <Padlock x={x1 + 4} y={band + 70} s={1.9} at={Q.treasure} />
    </g>
  );
};

/** The treasure: three stacks of gold coins clinking up beside the cage on "treasure". */
const Coins: React.FC<{ t: number }> = ({ t }) => {
  if (t < Q.treasure) return null;
  const stacks: [number, number][] = [[700, 6], [748, 9], [796, 5]];
  let n = 0;
  return (
    <g>
      {stacks.map(([cx, cnt], si) => Array.from({ length: cnt }).map((_, i) => {
        const k = pop(t, Q.treasure + 0.08 + (n++) * 0.05, 0.2);
        if (k <= 0) return null;
        const y = TOP - 7 - i * 10 - (1 - Math.min(1, k)) * 50;
        return <g key={`${si}-${i}`}><ellipse cx={cx} cy={y} rx={24} ry={7.5} fill="#F2C04A" stroke={P.ink} strokeWidth={3} />
          <path d={`M ${cx - 15} ${y} Q ${cx} ${y + 4} ${cx + 15} ${y}`} stroke={P.ink} strokeWidth={1.6} fill="none" opacity={0.5} /></g>;
      }))}
    </g>
  );
};

/** The cloth over the inkwell, and the cord to the middle man's hand; yanked away on "technology". */
const Cloth: React.FC<{ t: number; hand: [number, number] }> = ({ t, hand }) => {
  const u = lin(t, Q.technology2 - 0.02, Q.technology2 + 0.4, EASE_IN);
  if (u >= 1) return null;
  // WHY straight up and out of the frame (first render: flying left over the men it read as a butterfly net)
  const dx = -70 * u, dy = -760 * u;
  const top: [number, number] = [WELL + dx, TOP - 96 + dy];
  // WHY the cord sags while slack and snaps straight as he pulls: the yank needs anticipation to read
  const taut = lin(t, Q.technology2 - 0.12, Q.technology2 - 0.02);
  const sag = 50 * (1 - taut);
  const cm = [(hand[0] + top[0]) / 2, (hand[1] + top[1]) / 2 + sag];
  const flap = Math.sin(u * 14) * 10 * u;
  return (
    <g>
      {t > Q.these - 0.5 && u < 0.35 && <path d={`M ${hand[0]} ${hand[1]} Q ${cm[0]} ${cm[1]} ${top[0]} ${top[1]}`} stroke={P.ink} strokeWidth={2.6} fill="none" />}
      <g transform={`translate(${dx} ${dy}) rotate(${-25 * u} ${WELL} ${TOP - 50}) scale(${1 + 0.25 * u} ${1 - 0.25 * u})`}>
        <path d={`M ${WELL - 64} ${TOP} C ${WELL - 60} ${TOP - 50} ${WELL - 40} ${TOP - 96} ${WELL} ${TOP - 96} C ${WELL + 40} ${TOP - 96} ${WELL + 60} ${TOP - 50} ${WELL + 64 + flap} ${TOP} Q ${WELL + 30} ${TOP - 8} ${WELL} ${TOP} Q ${WELL - 32} ${TOP - 8} ${WELL - 64} ${TOP} Z`}
          fill="#CDBFCB" stroke={P.ink} strokeWidth={3.2} strokeLinejoin="round" />
        <path d={`M ${WELL - 20} ${TOP - 80} Q ${WELL - 26} ${TOP - 40} ${WELL - 34} ${TOP - 6} M ${WELL + 18} ${TOP - 78} Q ${WELL + 22} ${TOP - 40} ${WELL + 30} ${TOP - 6}`} stroke={P.inkSoft} strokeWidth={2} fill="none" opacity={0.7} />
      </g>
    </g>
  );
};

// ---------- chapter vi: the wish and the card ----------
const CARD = { x: 1160, y: 300, w: 360 };
const CARD_H = windowHeight(CARD.w);
const WISH_A = CUT.tool + 0.05, WISH_B = WISH_A + 0.68;
const WISH_TXT = { x0: 1040, y: 556 };
const SWOOP = WISH_B + 0.05, CARD_A = SWOOP + 0.14, CARD_DRAW = 0.42;
if (CARD_A + CARD_DRAW > Q.software + 0.02) throw new Error(`take1c: the card must be drawn by "software" (${(CARD_A + CARD_DRAW).toFixed(2)} > ${Q.software.toFixed(2)})`);

/** The stack of slabs they stand on, each stamped with an app's icon: the software their power rests on. */
const ICON_D = [
  'M -18 -12 h 36 v 30 h -36 Z M -18 -2 h 36 M -8 -16 v 8 M 8 -16 v 8',
  'M -6 14 L -6 -16 L 16 -20 L 16 8 M -6 14 a 6 5 0 1 1 -1 -1 M 16 8 a 6 5 0 1 1 -1 -1',
  'M -18 -18 h 36 v 36 h -36 Z M -6 -18 v 36 M 6 -18 v 36 M -18 -6 h 36 M -18 6 h 36',
  'M 0 18 C -16 2 -14 -18 0 -18 C 14 -18 16 2 0 18 Z M 0 -9 a 5 5 0 1 0 0.1 0',
  'M -20 -14 h 40 v 24 h -26 l -10 8 v -8 h -4 Z',
];
const OUT_SLAB = 2;                                  // the slab that slides out on "monopolies"
const slideAt = (t: number) => lin(t, Q.monopolies1 + 0.05, Q.monopolies1 + 0.4, EASE_IN);
const sinkAt = (t: number) => lin(t, Q.monopolies1 + 0.28, Q.monopolies1 + 0.4, EASE_IN) * STACK.h + jolt(t, Q.monopolies1 + 0.4, -10, 0.4);
const Stack: React.FC<{ t: number }> = ({ t }) => {
  const grey = lin(t, Q.scarce, Q.scarce + 0.4);
  const fill = mixHex(P.wash, '#A79CA9', grey);
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
        return (
          <g key={i} transform={`translate(${dx} ${dy}) rotate(${rot} ${x1} ${y0 + STACK.h})`}>
            <Shape d={`M ${x0} ${y0 + STACK.h} L ${x1} ${y0 + STACK.h} L ${x1} ${y0} L ${x0} ${y0} Z`} a={DRAWN + i * 0.1} b={DRAWN + i * 0.1 + 0.25} fill={fill} w={3.4} />
            <g transform={`translate(${(x0 + x1) / 2} ${y0 + STACK.h / 2}) scale(0.62)`}><Ink d={ICON_D[i]} a={DRAWN + i * 0.1 + 0.1} b={DRAWN + i * 0.1 + 0.35} w={4} /></g>
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
  const men = MEN.map((x, j) => ({ x, j, st: manAt(t, j), y: TOP + (t > Q.monopolies1 ? sinkAt(t) : 0) }));
  const tall = men[2];
  const handPt = (pose: HatPose): [number, number] => (pose === 'key' ? [73, -119] : [61, -134]);
  const midHand = manPt(1, men[1].x, men[1].y, men[1].st, ...handPt(men[1].st.pose));
  // the snatch: his arm stretches out through "far beyond their own", closes on air on "control", and snaps home
  // WHY ease in-out: it must still be reaching as the quill slips out, and arrive just as it is gone
  const reachP = lin(t, Q.far - 0.02, Q.control - 0.02, EASE_IN_OUT) * (1 - lin(t, Q.control + 0.22, Q.control + 0.42, EASE_IN));
  const shoulder = manPt(2, tall.x, tall.y, tall.st, 20, -168);
  const target: [number, number] = [WELL + 8, CAGE.top - 50];
  // ---------- the quill ----------
  const ZIP = Q.control + 0.02;
  const q = track(checked('treasure', [
    { t: Q.artificial, x: REST.x, y: REST.y + 260, r: REST.r, s: REST.s },
    { t: Q.artificial + 0.42, x: REST.x, y: REST.y - 14, r: REST.r - 4, s: REST.s, ease: EASE_OUT },
    { t: Q.intelligence - 0.05, ...REST },
    { t: Q.believed + 0.05, ...REST },
    // "believed": it leans right out toward them, curious
    { t: Q.believed + 0.55, x: REST.x - 8, y: REST.y - 6, r: REST.r - 34, s: REST.s },
    { t: CAGE_LAND - 0.02, x: REST.x - 8, y: REST.y - 6, r: REST.r - 30, s: REST.s },
    // the cage lands: it ducks back
    { t: CAGE_LAND + 0.12, x: REST.x + 4, y: REST.y + 10, r: REST.r + 8, s: REST.s, ease: EASE_OUT },
    { t: Q.somethingFar, x: REST.x + 4, y: REST.y + 8, r: REST.r + 6, s: REST.s },
    // "beyond": it squeezes up and out through the top of the cage
    { t: Q.beyond - 0.05, x: REST.x, y: REST.y, r: REST.r - 4, s: REST.s },
    { t: Q.beyond + 0.42, x: REST.x - 6, y: CAGE.top - 30, r: -8, s: REST.s * 0.9, ease: EASE_IN_OUT },
    { t: ZIP - 0.04, x: REST.x - 2, y: CAGE.top - 40, r: -4, s: REST.s * 0.9 },
    // "control": it zips up and right, loops once, and leaves the frame, nib trailing
    { t: ZIP + 0.1, x: 1100, y: 230, r: 30, s: 1.15, ease: EASE_OUT },
    { t: ZIP + 0.17, x: 1190, y: 170, r: 70, s: 1.15, ease: (v) => v },
    { t: ZIP + 0.23, x: 1150, y: 120, r: 160, s: 1.15, ease: (v) => v },
    { t: ZIP + 0.29, x: 1230, y: 130, r: 300, s: 1.15, ease: (v) => v },
    { t: ZIP + 0.45, x: 1720, y: 40, r: 390, s: 1.15, ease: EASE_IN },
    // the next shot: it flies in from the right, after the wish is written, and draws the card round
    { t: SWOOP - 0.2, x: 1700, y: 200, r: -12, s: 1.0 },
    { t: CARD_A, x: CARD.x - CARD.w / 2, y: CARD.y - CARD_H / 2, r: -12, s: 1.0, ease: EASE_OUT },
    { t: CARD_A + CARD_DRAW * 0.3, x: CARD.x + CARD.w / 2, y: CARD.y - CARD_H / 2, r: -12, s: 1.0, ease: (v) => v },
    { t: CARD_A + CARD_DRAW * 0.5, x: CARD.x + CARD.w / 2, y: CARD.y + CARD_H / 2, r: -12, s: 1.0, ease: (v) => v },
    { t: CARD_A + CARD_DRAW * 0.8, x: CARD.x - CARD.w / 2, y: CARD.y + CARD_H / 2, r: -12, s: 1.0, ease: (v) => v },
    { t: CARD_A + CARD_DRAW, x: CARD.x - CARD.w / 2, y: CARD.y - CARD_H / 2 + 30, r: -12, s: 1.0, ease: (v) => v },
    { t: Q.software + 0.1, x: CARD.x + CARD.w / 2 + 40, y: CARD.y + 10, r: 8, s: 0.95 },
  ]), t);
  // WHY character beats on the quill itself (review SHOULD: it stood still for 5 s, so "beyond their control" had no
  // set-up): on "intelligence" it stretches and shakes itself awake like a bird, spattering three drops of ink
  const wake = held(t, Q.intelligence, Q.intelligence + 0.4, 0.06, 0.12);
  const shake = wake * Math.sin((t - Q.intelligence) * 38) * 13;
  const stretch = 1 + 0.14 * held(t, Q.intelligence - 0.05, Q.intelligence + 0.1, 0.08, 0.15);
  const idle = within(t, Q.intelligence + 0.5, Q.control) ? Math.sin(t * 1.9) * 2.5 : 0;
  const wriggle = within(t, Q.somethingFar, Q.beyond + 0.42) ? Math.sin(t * 30) * 9 : 0;
  const hover = within(t, Q.software + 0.1, CUT.scarce) ? Math.sin((t - Q.software) * 6) * 5 : 0;
  const showQuill = t > Q.artificial && t < CUT.scarce && !(t > ZIP + 0.45 && t < SWOOP - 0.2);
  const inWell = t < Q.beyond + 0.15;
  // a short ink flick behind it while it zips away
  const trail = within(t, ZIP + 0.05, ZIP + 0.5) ? [0.03, 0.06, 0.09, 0.12].map((dt) => track([
    { t: ZIP - 0.04, x: REST.x - 2, y: CAGE.top - 40 }, { t: ZIP + 0.1, x: 1100, y: 230, ease: EASE_OUT }, { t: ZIP + 0.17, x: 1190, y: 170, ease: (v) => v },
    { t: ZIP + 0.23, x: 1150, y: 120, ease: (v) => v }, { t: ZIP + 0.29, x: 1230, y: 130, ease: (v) => v }, { t: ZIP + 0.45, x: 1720, y: 40, ease: EASE_IN },
  ], t - dt)) : [];
  // WHY they land on the desk as splats (first render: left hanging on the page they read as flies round the cage)
  const drops = [[1000, TOP - 2, 0.0], [1060, TOP - 2, 0.05], [800, TOP - 2, 0.09]] as const;
  // the wish: written by someone's hand reaching in from below
  const wishO = t >= CUT.tool && t < CUT.scarce ? 1 : 0;
  const armOut = lin(t, WISH_B + 0.05, WISH_B + 0.35, EASE_IN);
  return (
    <Sheet>
      <defs><clipPath id="c-well-mouth"><rect x={-200} y={-400} width={2400} height={MOUTH + 400} /></clipPath></defs>
      {/* their stack, and them on it */}
      <g transform={`translate(0 ${jolt(t, Q.foundation, 5, 0.5)})`}><Stack t={t} /></g>
      {men.map(({ x, j, st, y }) => <Man key={j} j={j} x={x} y={y} st={st} a={DRAWN + 0.3 + j * 0.08} b={DRAWN + 1.1 + j * 0.08} />)}
      {/* WHY big and hung on the stack's face (review: a tiny padlock): theirs is locked; it slams on "ever-scarce" */}
      {t > CUT.scarce - 0.02 && <Padlock x={318} y={790} s={2.5} at={Q.scarce} />}
      {/* their desk, running across the gutter */}
      <Shape d={`M ${DESK.x0} ${TOP} L ${DESK.x1} ${TOP} L ${DESK.x1} ${TOP + 18} L ${DESK.x0} ${TOP + 18} Z`} a={DRAWN} b={DRAWN + 0.4} fill={P.inkSoft} w={3.4} />
      <Ink d={`M ${DESK.x0 + 22} ${TOP + 18} L ${DESK.x0 + 28} 880 M ${DESK.x1 - 22} ${TOP + 18} L ${DESK.x1 - 28} 880`} a={DRAWN + 0.1} b={DRAWN + 0.5} w={6} />
      <Coins t={t} />
      <Inkwell x={WELL} glow={held(t, Q.technology2 + 0.3, Q.technology2 + 0.6, 0.15, 0.4)} />
      {/* the ink the quill shakes off as it wakes: it stays on the page */}
      {drops.map(([x, y, dt], i) => {
        const k = lin(t, Q.intelligence + 0.12 + dt, Q.intelligence + 0.3 + dt, EASE_OUT);
        if (k <= 0) return null;
        const sx = REST.x + 40, sy = REST.y - 150;
        return k < 1 ? <circle key={i} cx={sx + (x - sx) * k} cy={sy + (y - sy) * k - Math.sin(k * Math.PI) * 60} r={[7, 5, 6][i] * 0.8} fill={P.ink} />
          : <ellipse key={i} cx={x} cy={y} rx={[11, 8, 9][i]} ry={3} fill={P.ink} />;
      })}
      {trail.length > 0 && <path d={`M ${trail.map((p) => `${p.x} ${p.y}`).join(' L ')}`} stroke={P.ink} strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.55 * (1 - lin(t, ZIP + 0.35, ZIP + 0.5))} />}
      {showQuill && (
        <g clipPath={inWell ? 'url(#c-well-mouth)' : undefined}>
          <g transform={`translate(${q.x} ${q.y + Math.abs(hover) * 0.6}) scale(1 ${stretch}) translate(${-q.x} ${-q.y})`}>
            <Quill x={q.x} y={q.y + Math.abs(hover) * 0.6} s={q.s} r={q.r + idle + hover + shake + wriggle} />
          </g>
        </g>
      )}
      <Cage t={t} />
      <Cloth t={t} hand={midHand} />
      {/* "far beyond their own control": his arm shoots out, and his hand closes on the air where it was */}
      {tall.st.pose === 'stretch' && <Reach from={shoulder} to={target} p={reachP} fist={tall.st.fist} />}
      {/* "a tool that can make software": someone writes their wish, and the quill draws them a card */}
      {wishO > 0 && <Scrap x0={WISH_TXT.x0} y={WISH_TXT.y} text="my plants keep dying" a={WISH_A} b={WISH_B} size={58} outlineAt={CUT.tool - 0.06} rot={-1.6} />}
      {wishO > 0 && armOut < 1 && (() => {
        const u = lin(t, WISH_A, WISH_B, (v) => v);
        const nx = WISH_TXT.x0 + 20 * 0.4 * 58 * u;
        return <g transform={`translate(0 ${armOut * 520})`}><Pencil x={nx} y={WISH_TXT.y - 6 + Math.sin(u * 44) * 4} /></g>;
      })()}
      {t >= CUT.tool && t < CUT.scarce && <MadeCard look="meadow" what="plants" x={CARD.x} y={CARD.y} w={CARD.w} r={-1} a={CARD_A} draw={CARD_DRAW} contentAt={Q.software} />}
    </Sheet>
  );
};
export const TREASURE: Spread = { id: 'treasure', Art: TreasureArt };
/** Kept for take1c.tsx's import. */
export const TREASURE_MARKS = { well: { x: WELL, y: MOUTH }, men: { x: MEN[1], y: TOP }, card: CARD };

// ======================= vi · anyone =======================
// WHY one card, re-drawn for each person who asks (review BLOCKER: four tiny people in a row, each with an unreadable
// card, read as "four people, four gadgets" and leaned on the banned crowd idea): close on ONE card while three different
// people lean in and write what they want; the quill redraws the same card for each. Then, on "asks", the film pulls
// out to show each of them holding their own copy of that one card, every copy in its owner's own look.
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
// the wide: each person holding their copy (page units)
const OWNERS = [
  // WHY about half as big again as the first render (they were an eighth of the frame): near, middle and far, never a row
  { look: 'meadow' as Theme, what: 'plants' as Made, px: 230, py: 900, s: 3.0, card: { x: 470, y: 600, w: 320 }, flip: false },
  { look: 'cotton' as Theme, what: 'bus' as Made, px: 610, py: 480, s: 2.1, card: { x: 815, y: 280, w: 300 }, flip: false },
  { look: 'devils' as Theme, what: 'game' as Made, px: 1330, py: 600, s: 2.3, card: ANY, flip: true },
];
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
          {/* the asker: head and shoulders leaning in from the bottom of the frame, pointing up at the card */}
          {ASKERS.map((a, i) => {
            const inn = i === 0 ? 1 : lin(t, a.at - 0.04, a.at + 0.14, EASE_OUT);
            const out = i < 2 ? lin(t, ASKERS[i + 1].at - 0.06, ASKERS[i + 1].at + 0.08, EASE_IN) : 0;
            if (inn <= 0 || out >= 1) return null;
            return <Person key={i} x={a.x - out * 120} y={790 + (1 - inn) * 200 + out * 220} s={2.6} a={-10} b={-9} pose="up" hair={HAIR[a.look]} hairColor={P.ink}
              body={SHIRT[a.look]} mood={i === k && t > skinAt(i) + SKIN_DUR ? 'o' : 'smile'} bob={jolt(t, skinAt(i) + SKIN_DUR, -10, 0.4)} />;
          })}
          {/* their wish: each new one replaces the last on a fresh scrap */}
          {ASKERS.map((a, i) => {
            const gone = i < 2 ? lin(t, ASKERS[i + 1].at - 0.05, ASKERS[i + 1].at + 0.03) : 0;
            if (gone >= 1) return null;
            return <Scrap key={i} x0={722} y={ANY.y - 82} text={a.text} a={i === 0 ? -10 : a.at} b={i === 0 ? -9.5 : a.at + 0.26} size={52} outlineAt={i === 0 ? -11 : a.at - 0.08} o={1 - gone} rot={[-1.4, 1.2, -0.8][i]} />;
          })}
          <MadeCard look={ASKERS[cur.base].look} what={ASKERS[cur.base].what} x={ANY.x} y={ANY.y} w={ANY.w} r={-1}
            next={{ look: ASKERS[cur.base + 1].look, what: ASKERS[cur.base + 1].what, p: cur.p }} />
          {/* the quill rides the leading edge of each redraw, and waits at the card's corner in between */}
          <Quill x={skinning ? edge.x : ANY.x + ANY.w / 2 + 20} y={skinning ? edge.y + 6 : ANY.y - 40 + Math.sin(t * 6) * 5} s={0.85} r={skinning ? -14 : 6} />
        </>
      ) : (
        <>
          {OWNERS.map((o, i) => {
            // WHY a small cheer each, a beat apart (review: nothing moved while she said the film's key line)
            const hop = jolt(t, CUT.anyWide + 0.1 + i * 0.12, -12, 0.5) + jolt(t, Q.so + i * 0.1, -8, 0.5);
            return (
              <g key={i}>
                <Ink d={`M ${o.px - 40 * o.s} ${o.py} L ${o.px + 40 * o.s} ${o.py}`} a={-10} b={-9} w={2.4} c={P.inkSoft} />
                <Person x={o.px} y={o.py} s={o.s} a={-10} b={-9} pose="up" flip={o.flip} hair={HAIR[o.look]} hairColor={P.ink} body={SHIRT[o.look]} mood="smile" bob={hop} />
                <g transform={`translate(0 ${hop})`}><MadeCard look={o.look} what={o.what} x={o.card.x} y={o.card.y} w={o.card.w} r={[-2, 1.5, -1][i]} /></g>
              </g>
            );
          })}
          <Quill x={1000 + Math.sin(t * 2.2) * 30} y={230 + Math.sin(t * 3.1) * 12} s={0.8} r={8 + Math.sin(t * 2.2) * 8} />
        </>
      )}
    </Sheet>
  );
};
export const ANYONE: Spread = { id: 'anyone', Art: AnyoneArt };

// ======================= vii · ours: chapter ii, undone =======================
// WHY the exact layout of chapter ii: the narrator repeats that line's three clauses word for word, so the
// pictures repeat too, in colour, and each is undone by the person it was done to, on its own clause.
const Scissors: React.FC<{ x: number; y: number; r: number; open: number; s?: number }> = ({ x, y, r, open, s = 1 }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    {[1, -1].map((sg) => (
      <g key={sg} transform={`rotate(${sg * open * 16})`}>
        <path d={`M -6 ${sg * 2} L 58 ${sg * -2} Q 60 ${sg * 1} 56 ${sg * 3} L -6 ${sg * 7} Z`} fill="#F4F0F6" stroke={P.ink} strokeWidth={2.6} strokeLinejoin="round" />
        <path d={`M -6 ${sg * 5} L -22 ${sg * 12}`} stroke={P.ink} strokeWidth={5} strokeLinecap="round" />
        <ellipse cx={-30} cy={sg * 14} rx={11} ry={8} fill="none" stroke={P.pink} strokeWidth={5} /><ellipse cx={-30} cy={sg * 14} rx={11} ry={8} fill="none" stroke={P.ink} strokeWidth={1.6} />
      </g>
    ))}
    <circle r={4} fill={P.sun} stroke={P.ink} strokeWidth={2} />
  </g>
);
/** A handwritten wish above her laptop: written on "computers", and the screen builds itself on "can do". */
const WISH = { x0: 120, y: 300, text: 'show me the sky' };
/** Her raised hand (pose "up", scale 1.1, at 200,500): where the key drops. */
export const OURS_HAND = { x: 200 + 24 * 1.1, y: 500 - 96 * 1.1 };
/** Her things, flying back out of his hat into her own box: her night-sky card, her cat's photo, a note. */
const DataItem: React.FC<{ k: number; x: number; y: number; s: number; r: number }> = ({ k, x, y, s, r }) => {
  if (k === 0) return <ThemedWindow theme="sunbreak" x={x} y={y} w={30 * s} r={r} compact bare />;
  if (k === 1) return <KeepsakeIcon kind="photo" x={x} y={y} s={s} r={r} color={SHIRT.cotton} />;
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <path d="M -18 -13 L 18 -14 L 17 13 L -17 14 Z" fill="#FFFDF8" stroke={P.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <path d="M -11 -5 q 4 -3 8 0 t 8 0 t 6 0 M -11 4 q 4 -3 8 0 t 8 0" stroke={P.ink} strokeWidth={1.6} fill="none" strokeLinecap="round" />
    </g>
  );
};
const OursArt: React.FC = () => {
  const t = useT();
  // WHY drawn well before the cut: the film cuts straight into a close shot here, which must show finished drawings
  const L = land(TURN.ours) - 1.6;
  const LB = Q.decide - 0.03;
  const T0 = TURN.ours;
  // the key drops into her raised hand just after the cut, on "first"; she hops with it on "time" and "long while"
  const keyFall = lin(t, T0 + 0.02, T0 + 0.3, EASE_IN);
  const grip = lin(t, T0 + 0.28, T0 + 0.38);
  const hop = jolt(t, Q.firstTime + 0.25, -14, 0.5) + jolt(t, Q.longWhile - 0.1, -14, 0.5);
  const bob = (k: number) => jolt(t, Q.decide + 0.2 + k * 0.08, -10, 0.5) + (k === 0 ? hop : 0);
  const H0 = OURS_HAND;
  const heldKey = { x: H0.x, y: H0.y - 260 * (1 - keyFall) + jolt(t, T0 + 0.3, 5, 0.3) };
  // she carries it to the padlock over "a very long while"; it pushes in on "get"; on "decide" it turns and the lock pops
  const kGo = lin(t, Q.veryLong - 0.1, Q.longWhile + 0.4, EASE_IN_OUT);
  const push = 4 * lin(t, Q.weGet + 0.6, Q.weGet + 0.75);
  const rattle = jolt(t, Q.weGet + 0.6, 2, 0.4);
  const kTurn = lin(t, Q.decide, Q.decide + 0.16, EASE_IN_OUT);
  const keyX = heldKey.x + (370 - push - heldKey.x) * kGo, keyY = heldKey.y + (382 - heldKey.y) * kGo;
  const screenP = pop(t, Q.canDo - 0.05, 0.5);
  const carrying = t > Q.veryLong - 0.1;
  // B: he walks to the tag with his scissors, leaps on "costs" and snips it; it falls; "free" is written on the screen
  const walk = lin(t, Q.itCosts - 0.1, Q.costs - 0.12, EASE_IN_OUT);
  const leap = Math.max(0, Math.sin(Math.min(1, Math.max(0, (t - (Q.costs - 0.12)) / 0.42)) * Math.PI));
  // WHY he stops beside the tag, not on it (render: his body covered the tag as he cut it)
  const bx = 480 + (368 - 480) * walk, by = 860 - 40 * leap;
  const snip = lin(t, Q.costs + 0.06, Q.costs + 0.1);
  const fall = lin(t, Q.costs + 0.1, Q.costs + 0.45, EASE_IN);
  // his raised hand (pose "up", flipped, s 1.12) holds the scissors
  const hand = { x: bx - 24 * 1.12, y: by - 96 * 1.12 };
  // C: her things come back out of his hat, one at a time, into her box; the lid snaps shut on "data"
  // WHY from just after the cut to this shot (it now lands 0.3 s into "And what happens", so "free" is seen first)
  const DATA_FROM = Q.ourData + 0.42, DATA_GAP = 0.27, DATA_DUR = 0.55;
  const ITEM_LAND = (i: number) => DATA_FROM + i * DATA_GAP + DATA_DUR;
  const boxHop = [0, 1, 2].reduce((a, i) => a + jolt(t, ITEM_LAND(i), -6, 0.35), 0);
  const tug = [0, 1, 2].reduce((a, i) => a + held(t, DATA_FROM + i * DATA_GAP - 0.04, DATA_FROM + i * DATA_GAP + 0.08, 0.04, 0.15), 0);
  const shut = lin(t, Q.data2 - 0.02, Q.data2 + 0.08, EASE_IN);
  const clack = jolt(t, Q.data2 + 0.08, 0.08, 0.2);
  const p0: [number, number] = [1340, 880 - (212 + 90) * 1.3 + 20], p1: [number, number] = [1210, 400], p2: [number, number] = [1062, 806];
  return (
    <>
      <Sheet>
        <WashBg x={390} y={420} r={150} sx={1.75} a={L} seed={3} color={P.pinkSoft} o={0.6} />
        <WashBg x={390} y={770} r={140} sx={1.75} a={LB} seed={6} color={P.sunSoft} o={0.6} />
        <WashBg x={1130} y={620} r={290} a={LB + 0.15} seed={11} color={P.lilac} o={0.6} />
        {/* A: what our computers can do */}
        <Ink d="M 140 500 L 660 500" a={L - 0.2} b={L + 0.3} w={2} c={P.inkSoft} />
        <Ink d="M 250 420 L 490 420 M 270 420 L 270 500 M 470 420 L 470 500" a={L - 0.1} b={L + 0.35} w={3.4} />
        <Laptop x={370} y={418} s={1.5} a={L} b={L + 0.4} />
        {screenP > 0 && <g transform={`translate(370 ${418 - 36}) scale(${screenP}) translate(-370 ${-(418 - 36)})`}><ThemedWindow theme="sunbreak" x={370} y={418 - 36} w={112} compact bare /></g>}
        {/* WHY it stays until the cut to the price tag (pre-existing fault: it faded out before it had finished writing) */}
        {t < Q.itCosts + 0.2 && <Scrap x0={WISH.x0} y={WISH.y} text={WISH.text} a={Q.ourComputers + 0.05} b={Q.canDo - 0.15} size={46} outlineAt={Q.ourComputers - 0.05} rot={-2} />}
        <Person x={200} y={500} s={1.1} a={L - 0.05} b={L + 0.55} pose={carrying && t < Q.ourComputers + 1.1 ? 'write' : 'up'} mood="smile" hair="bun" body={SHIRT.sunbreak} bob={bob(0)} />
        {/* WHY he acts (review SHOULD: a 60%-faded statue): he bends in to watch on "first time", recoils on "decide" with
            his hat jumping off his head, and his arms drop. Solid plum-grey, not see-through. */}
        <HatFigure x={592 + 26 * lin(t, Q.decide + 0.1, Q.decide + 0.35, EASE_OUT)} y={500} s={1} crown={84} a={L - 0.2} b={L + 0.7}
          pose={t < Q.decide + 0.1 ? 'pat' : t < Q.decide + 0.6 ? 'grab' : 'sides'} flip fade={0.28}
          drop={-1.4 * held(t, Q.decide + 0.12, Q.decide + 0.3, 0.1, 0.3)}
          lean={Math.sin(t * 1.4) * 1.3 + 14 * held(t, Q.firstTime, Q.decide + 0.05, 0.4, 0.15) - 12 * held(t, Q.decide + 0.1, Q.ourComputers, 0.15, 0.6)} bob={jolt(t, Q.longWhile, -5, 0.5)} />
        <g transform={`rotate(${rattle} 370 398)`}><Padlock x={370} y={384} s={1.25} at={L} openAt={Q.decide + 0.14} fallAt={Q.decide + 0.55} color={P.inkSoft} /></g>
        {t > T0 && t < Q.decide + 0.55 && (
          <g transform={`translate(${carrying ? keyX : heldKey.x} ${carrying ? keyY : heldKey.y + bob(0)}) rotate(${carrying ? -90 + kTurn * 90 + rattle : 0}) scale(1.5)`}>
            <path d="M 0 -4 L 0 22 M 0 14 L 7 14 M 0 20 L 6 20" stroke={P.ink} strokeWidth={3.4} fill="none" strokeLinecap="round" />
            <circle cx={0} cy={-11} r={7} fill={P.sun} stroke={P.ink} strokeWidth={3} />
          </g>
        )}
        {!carrying && <circle cx={H0.x} cy={H0.y + 2 + bob(0)} r={6.2 - grip * 0.6} fill={grip > 0.5 ? SHIRT.sunbreak : P.paper} stroke={P.ink} strokeWidth={2.6} />}

        {/* B: what it costs */}
        <Ink d="M 140 860 L 660 860" a={LB} b={LB + 0.4} w={2} c={P.inkSoft} />
        <Ink d="M 140 760 L 330 760 M 160 760 L 160 860 M 310 760 L 310 860" a={LB} b={LB + 0.35} w={3.4} />
        <Laptop x={236} y={758} s={1.3} a={LB + 0.1} b={LB + 0.5} />
        {snip < 1 && <Ink d="M 284 700 Q 306 676 326 690" a={LB + 0.2} b={LB + 0.4} w={2.4} />}
        {snip >= 1 && <path d="M 284 700 Q 292 690 300 688" stroke={P.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />}
        {/* WHY it falls away to the left, behind the desk (first render: it fell across him) */}
        <g transform={`translate(${-fall * 70} ${fall * 240}) rotate(${-fall * 70} 326 722)`} opacity={1 - lin(t, Q.costs + 0.3, Q.costs + 0.45)}>
          <PriceTag x={326} y={722} s={1.1} at={LB + 0.2} swing={-6} prices={[{ v: '19.99/mo', at: LB + 0.3 }]} />
        </g>
        {/* WHY only after the tag is clear, in her handwriting, in the one purple (review: three signals piled up in 0.6 s) */}
        {t > Q.costs + 0.42 && (() => {
          const u = lin(t, Q.costs + 0.42, Q.costs + 0.66, (v) => v);
          return <g><defs><clipPath id="c-free-w"><rect x={200} y={700} width={80 * u} height={60} /></clipPath></defs>
            <text x={204} y={744} clipPath="url(#c-free-w)" fontFamily={CAVEAT} fontWeight={700} fontSize={46} fill={P.purple}>free</text></g>;
        })()}
        <Person x={bx} y={by} s={1.12} a={LB + 0.1} b={LB + 0.6} pose={t > Q.itCosts - 0.1 && t < Q.costs + 0.6 ? 'up' : 'down'} mood={leap > 0 ? 'o' : 'smile'} hair="curly" body={SHIRT.cotton} flip
          bob={bob(1) + jolt(t, Q.costs + 0.3, 6, 0.3)} />
        {/* WHY in his hand (review SHOULD: the scissors floated by themselves) */}
        {t > LB + 0.5 && (t > Q.itCosts - 0.1 && t < Q.costs + 0.6
          ? <Scissors x={hand.x} y={hand.y + bob(1)} r={235} open={1 - snip} s={0.9} />
          : <Scissors x={bx - 28} y={by - 30} r={200} open={0.2} s={0.9} />)}

        {/* C: what happens with our data: her things come back out of his hat, into a box of her own */}
        <Ink d="M 820 880 L 1450 880" a={LB + 0.1} b={LB + 0.5} w={2} c={P.inkSoft} />
        <Person x={920} y={880} s={1.35} a={LB + 0.2} b={LB + 0.8} pose={t > Q.data2 + 0.15 ? 'hold' : t > Q.ourData + 0.1 ? 'bothUp' : 'down'} hair="long" mood="smile" body={SHIRT.meadow} hairColor={P.purple}
          bob={bob(2)} tilt={9 * lin(t, Q.data2 + 0.15, Q.data2 + 0.45, EASE_OUT)} />
        <g transform={`translate(0 ${boxHop}) translate(1060 880) scale(${1 + clack} ${1 - clack}) translate(-1060 -880)`}>
          <Shape d="M 1000 880 L 1120 880 L 1120 808 L 1000 808 Z" a={LB + 0.3} b={LB + 0.7} fill={P.sun} w={3.4} />
          <Ink d="M 1000 840 L 1120 840" a={LB + 0.5} b={LB + 0.7} w={2} c={P.inkSoft} />
          {/* WHY an ink lid with a clasp that snaps shut on "data" (review SHOULD: it closed with no weight) */}
          <g transform={`rotate(${-70 * lin(t, Q.ourData - 0.1, Q.ourData + 0.15) * (1 - shut)} 1000 808)`}>
            <Shape d="M 1000 808 L 1120 808 L 1132 790 L 1012 790 Z" a={LB + 0.4} b={LB + 0.8} fill={P.sunSoft} w={3.4} />
            <path d="M 1052 800 L 1068 800 L 1068 818 L 1052 818 Z" fill={P.ink} opacity={lin(t, LB + 0.6, LB + 0.8)} />
          </g>
        </g>
        <HatFigure x={1340} y={880} s={1.3} crown={90} a={LB + 0.1} b={LB + 1.0} pose={tug > 0.3 ? 'grab' : 'sides'} fade={0.28} drop={-0.5 * tug} lean={-4 * tug} />
        {[0, 1, 2].map((i) => {
          let u = (t - (DATA_FROM + i * DATA_GAP)) / DATA_DUR;
          if (u <= 0 || u >= 1) return null;
          u = EASE_IN_OUT(u);
          const v = 1 - u;
          const x = v * v * p0[0] + 2 * v * u * p1[0] + u * u * p2[0], y = v * v * p0[1] + 2 * v * u * p1[1] + u * u * p2[1] - i * 6;
          return <DataItem key={i} k={i} x={x} y={y} s={3.2 * (1 - 0.4 * Math.max(0, (u - 0.8) / 0.2))} r={Math.sin(i * 2.1 + t * 3) * 12} />;
        })}
      </Sheet>
    </>
  );
};
export const OURS: Spread = { id: 'ours', Art: OursArt };

// ======================= viii · the past: the strings snap =======================
// WHY rebuilt (review SHOULD: six identical men in a symmetric row, and 3 s of nothing after the snap): two old kings far
// back on a high ledge and one big near one, the people in the foreground at four depths. On "free" every string snaps
// with a whip, the people stagger, and only THEN does each get the quill. On "monopolies" the kings wobble and their hats
// topple off; on "past" they drain to a pale engraving, and the book's next leaf lifts.
const KINGS = [{ x: 470, y: 372, s: 1.0 }, { x: 905, y: 356, s: 0.92 }, { x: 1235, y: 450, s: 1.4 }];
const FOLK = [
  // WHY big, at four depths (review: people 80 px high in a row): the people are the story here, the kings are the past
  { x: 250, y: 950, s: 2.9, look: 'meadow' as Theme, king: 0 }, { x: 610, y: 880, s: 2.25, look: 'cotton' as Theme, king: 0 },
  { x: 960, y: 930, s: 2.65, look: 'sunbreak' as Theme, king: 1 }, { x: 1320, y: 968, s: 3.1, look: 'devils' as Theme, king: 2 },
];
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
          const wob = jolt(t, Q.monopolies2 + j * 0.1, 9, 0.8);
          const off = t > Q.monopolies2 + 0.05 + j * 0.12;
          const hu = lin(t, Q.monopolies2 + 0.05 + j * 0.12, Q.monopolies2 + 0.7 + j * 0.12, EASE_IN);
          const bar = { y: k.y - 112 * k.s, x0: k.x - 60 * k.s, x1: k.x + 60 * k.s };
          const ink = mixHex(P.ink, P.paper, kingFade * 0.66);
          return (
            <g key={j}>
              <HatFigure x={k.x} y={k.y} s={k.s} crown={90} a={L + 0.1 + j * 0.1} b={L + 0.9 + j * 0.1} pose="hold" fade={kingFade} drop={off ? -40 : 0}
                lean={Math.sin(t * 1.5 + j * 2.1) * 1.2 + wob + (t > Q.free ? -6 * jolt(t, Q.free, 1, 0.6) : 0)} bob={jolt(t, Q.free + 0.02, -6, 0.4)} />
              {/* the hat, toppling off backwards */}
              {off && hu < 1 && (
                <g transform={`translate(${k.x + (j === 2 ? 1 : -1) * 120 * hu * k.s} ${k.y - 212 * k.s - 20 * Math.sin(hu * Math.PI) * k.s + hu * hu * 520}) rotate(${(j === 2 ? 1 : -1) * 200 * hu}) scale(${k.s})`}>
                  <path d="M -16 0 L -18.5 -90 Q 0 -94 18.5 -90 L 16 0 Z" fill={ink} stroke={ink} strokeWidth={3} />
                  <path d="M -27 1 Q 0 -5 27 1" stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round" />
                </g>
              )}
              {/* the puppet bar in his hands */}
              <path d={`M ${bar.x0} ${bar.y} L ${bar.x1} ${bar.y} M ${k.x} ${bar.y - 12 * k.s} L ${k.x} ${bar.y + 12 * k.s}`} stroke={ink} strokeWidth={5} strokeLinecap="round"
                opacity={lin(t, L + 0.6, L + 0.9)} />
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
          const freeNow = t > snapT + 0.32 + i * 0.05;
          const qp = Math.min(1.1, pop(t, snapT + 0.32 + i * 0.05, 0.35));
          const dangle = snapped ? 0 : Math.sin(t * 2.3 + i) * 3;
          const pose: PersonPose = freeNow ? (i % 2 ? 'quill' : 'bothUp') : 'bothUp';
          const hands = [-24, 24].map((hx) => [f.x + hx * f.s + dangle, f.y - 96 * f.s] as [number, number]);
          const barY = k.y - 112 * k.s;
          const tops = [k.x - 46 * k.s + i * 6, k.x + 46 * k.s - i * 6].map((x) => [x, barY] as [number, number]);
          return (
            <g key={i}>
              {[0, 1].map((h) => {
                const [ax, ay] = tops[h], [bx2, by2] = hands[h];
                if (!snapped) return <Ink key={h} d={`M ${ax} ${ay} L ${bx2} ${by2}`} a={L + 0.7 + i * 0.05} b={L + 1.0 + i * 0.05} w={2.2} c={mixHex(P.ink, P.paper, kingFade * 0.66)} />;
                // the snap: the top half whips back up toward the bar and curls; the bottom half drops slack and fades
                const mx = (ax + bx2) / 2, my = (ay + by2) / 2;
                const ux = mx + (ax - mx) * 0.7 * su, uy = my + (ay - my) * 0.7 * su;
                const curl = Math.sin(su * Math.PI) * 40 * (h ? 1 : -1);
                const lo = 1 - lin(t, snapT + 0.1, snapT + 0.5);
                return (
                  <g key={h}>
                    <path d={`M ${ax} ${ay} Q ${(ax + ux) / 2 + curl} ${(ay + uy) / 2} ${ux} ${uy}`} stroke={mixHex(P.ink, P.paper, kingFade * 0.66)} strokeWidth={2.2} fill="none" strokeLinecap="round" />
                    {lo > 0 && <path d={`M ${bx2} ${by2} Q ${bx2 + (h ? 20 : -20)} ${by2 - 40 + 120 * su} ${mx} ${my + 160 * su}`} stroke={P.ink} strokeWidth={2.2} fill="none" strokeLinecap="round" opacity={lo} />}
                  </g>
                );
              })}
              <Ink d={`M ${f.x - 34 * f.s} ${f.y} L ${f.x + 34 * f.s} ${f.y}`} a={L + 0.3} b={L + 0.5} w={2.2} c={P.inkSoft} />
              <Person x={f.x} y={f.y} s={f.s} a={L + 0.2 + i * 0.08} b={L + 0.8 + i * 0.08} pose={pose} hair={HAIR[f.look]} hairColor={P.ink} body={SHIRT[f.look]}
                mood={snapped && !freeNow ? 'o' : 'smile'} tilt={stagger} bob={jolt(t, snapT + 0.04, 8, 0.5) + (freeNow ? jolt(t, Q.free + 0.35 + i * 0.06, -10, 0.5) : 0)} />
              {freeNow && i % 2 === 1 && (
                <g transform={`translate(${f.x} ${f.y}) rotate(${stagger}) scale(${f.s})`}><Quill x={32} y={-78} s={0.36 * qp} r={12} /></g>
              )}
              {freeNow && i % 2 === 0 && (
                <g transform={`translate(${f.x} ${f.y}) rotate(${stagger}) scale(${f.s})`}><Quill x={22} y={-96} s={0.36 * qp} r={-6} /></g>
              )}
            </g>
          );
        })}
      </Sheet>
    </>
  );
};
export const FREE: Spread = { id: 'free', Art: FreeArt };

// ======================= ix · the riffle: one card, re-dressed on every page =======================
// WHY rebuilt (review BLOCKER: four strangers with four reruns of the plant, moon, cat and chequers cards read as
// "different people, different apps"): the card sits at exactly the same place on every page, so each page-turn reads as
// the same card re-dressed; each page's person has written what they wanted above their head, and the card answers it.
// None of these four things has appeared before.
const RIFFLE: { look: Theme; what: Made; ask: string[]; pose: PersonPose; hair: 'bun' | 'curly' | 'bob' | 'cap' | 'long' | 'tuft' }[] = [
  { look: 'cotton', what: 'photos', ask: ["grandma's photos", 'but HUGE'], pose: 'up', hair: 'long' },
  { look: 'meadow', what: 'chores', ask: ['chores chart', 'for the kids?'], pose: 'wave', hair: 'tuft' },
  { look: 'sunbreak', what: 'quiz', ask: ['a quiz for', 'my class'], pose: 'bothUp', hair: 'bob' },
  { look: 'devils', what: 'shifts', ask: ['just my shifts', 'pls'], pose: 'up', hair: 'cap' },
];
const RIFFLE_CARD = { x: 1140, y: 470, w: 600 };
const ownSpread = (k: number): Spread => {
  const R = RIFFLE[k];
  const look = LOOK[R.look];
  const Art: React.FC = () => {
    const t = useT();
    // a small action as the page lands
    const acted = t > TURN.riffle[k] + 0.15;
    return (
      <>
        <Sheet rough={false}>
          {/* WHY the theme's own paper lightened toward cream (review: muddy grey-green and beige pages) */}
          <rect x={0} y={0} width={1520} height={980} fill={mixHex(look.page, '#FFFAF0', 0.6)} />
          <Scrap x0={150} y={290} text={R.ask} a={-10} b={-9.5} outlineAt={-11} size={60} rot={[-2, 1.5, -1, 2][k]} />
          <Ink d="M 220 840 L 560 840" a={-10} b={-9} w={2.4} c={P.inkSoft} />
          <Person x={390} y={840} s={2.6} a={-10} b={-9.5} body={SHIRT[R.look]} hair={R.hair} hairColor={P.ink} pose={acted ? R.pose : 'down'} mood="smile"
            bob={jolt(t, TURN.riffle[k] + 0.15, -12, 0.4)} />
          <MadeCard look={R.look} what={R.what} x={RIFFLE_CARD.x} y={RIFFLE_CARD.y} w={RIFFLE_CARD.w} />
        </Sheet>
        <Folio left={20 + k * 2} />
      </>
    );
  };
  return { id: `own-${k}`, Art };
};
export const VARIANTS: Spread[] = RIFFLE.map((_, k) => ownSpread(k));

// ======================= ix · everything: she shares it, he asks for it to be his =======================
// WHY re-staged (review BLOCKER: the headline sat on his legs, the copy turned into a near-black card, and nothing showed
// that asking was the cause): the bottom right, where the headline lands, is empty paper. She has her cat's card; he has
// an empty place. On "open" a copy of hers lifts and flies into his place; on "source" he writes what he wants on a scrap
// ("call him mochi / and make him green"); on "everything" the copy is redrawn: his cat's name, his colours.
const A = { x: 300, y: 860, s: 2.1, card: { x: 520, y: 450, w: 400 } };
const B = { x: 1370, y: 640, s: 2.05 };
const SLOT = { x: 1090, y: 300, w: 380 };
const LIFT = Q.open + 0.02, FLY = LIFT + 0.12, LAND = FLY + 0.36;
const ASK_A = Q.source + 0.02, ASK_B = ASK_A + 0.5;
const SKIN_A = Q.everything2, SKIN_B = SKIN_A + 0.32;
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
  // her: she waves the quill as the copy leaves, and nods as it lands
  const wave = held(t, LIFT - 0.05, LAND, 0.1, 0.2);
  const nod = jolt(t, LAND + 0.04, 6, 0.4);
  return (
    <>
      <Folio left={32} hideRight />
      <Sheet>
        <Ink d={`M ${A.x - 110} ${A.y} L ${A.x + 130} ${A.y}`} a={-10} b={-9} w={2.4} c={P.inkSoft} />
        <Person x={A.x} y={A.y} s={A.s} a={-10} b={-9} body={SHIRT.cotton} hair="bob" hairColor={P.ink} pose="quill" mood="smile" tilt={nod + wave * Math.sin((t - LIFT) * 16) * 4} />
        <g transform={`translate(${A.x} ${A.y}) rotate(${nod + wave * Math.sin((t - LIFT) * 16) * 4}) scale(${A.s})`}><Quill x={32} y={-78} s={0.36} r={10 + wave * Math.sin((t - LIFT) * 16) * 18} /></g>
        {/* WHY it dims while its copy is away (review: the copy briefly looked like a double exposure) */}
        <MadeCard look="cotton" what="cat" x={A.card.x} y={A.card.y} w={A.card.w} r={-1.5} o={1 - 0.35 * carried} />
        {/* him, under his empty place */}
        <Ink d={`M ${B.x - 90} ${B.y} L ${B.x + 90} ${B.y}`} a={-10} b={-9} w={2.4} c={P.inkSoft} />
        <Person x={B.x} y={B.y} s={B.s} a={-10} b={-9} body={SHIRT.meadow} hair="curly" hairColor={P.ink} flip
          pose={t > SKIN_B ? 'bothUp' : t > ASK_A - 0.05 && t < ASK_B + 0.1 ? 'write' : t > LAND ? 'up' : 'down'} mood={t > SKIN_B ? 'o' : 'smile'}
          bob={jolt(t, LAND + 0.05, -10, 0.5) + jolt(t, SKIN_B, -16, 0.55)} />
        {t < LAND && <path d={rr(SLOT.x - SLOT.w / 2, SLOT.y - windowHeight(SLOT.w) / 2, SLOT.w, windowHeight(SLOT.w), 18)} fill="none" stroke={P.inkSoft} strokeWidth={3}
          strokeDasharray="12 12" opacity={0.55 * (1 - lin(t, LAND - 0.2, LAND))} />}
        {/* his wish, in his own hand: the cause of the change, visibly */}
        <Scrap x0={915} y={540} text={['call him mochi', 'and make him green']} a={ASK_A} b={ASK_B} size={46} outlineAt={ASK_A - 0.1} rot={1.4} />
        {/* the one copy */}
        {t >= LIFT && (
          <MadeCard look="cotton" what="cat" x={cx} y={cy + settle * 4} w={cw} r={-1.5 * (1 - u) + Math.sin(u * Math.PI) * 6} s={1 + carried * 0.06} shadow={carried}
            next={{ look: 'meadow', what: 'cat', p: skin, name: 'mochi' }} />
        )}
      </Sheet>
    </>
  );
};
export const EVERYTHING: Spread = { id: 'everything', Art: EverythingArt };
