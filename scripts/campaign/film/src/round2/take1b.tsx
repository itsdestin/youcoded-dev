// Round two, take 1 variant B: "The same screen, everywhere." (the wall of screens)
// One dark wall of devices in one room, and three things on it we follow from start to finish: the big TV at the
// top (the companies), one person's phone in the middle (us), and that phone's three private things (their photos,
// Sam's message, "pick up Mia at 3:15"). From the TV the companies rearrange every screen at once, row by row; they
// padlock the laptop, hang a price tag on the tablet and make the person's phone print a receipt of their private
// things. Everyone accepts. Then a single cursor wakes up in the dark TV: the companies made it and put a price on it,
// but it gets away, down the wall into the person's phone, which becomes a real youcoded window. The person types a
// plain request and the app makes them a pickup board from their own things. Then the wall becomes everyone's own
// youcoded, screen by screen: padlocks off, the tag turns to "free", the receipt rolls back into the phone, daylight
// opens out of it, the dead TV finally becomes someone's too, and the board is picked up by two neighbours, each
// filled with their own life and in their own look.
// Every timing comes from the narrator's word times (take1b-cues.ts); nothing here is a typed second.
//
// Round six (the agreed picture plan): no pointers anywhere; no drawn "ask" bar; every "own" screen is a real capture
// of the youcoded window (public/stills/r4); the hero's request is the real app's own box, typed one real character at
// a time; every shot stays in the room, on the shelves.
import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { C, EASE_IN, EASE_IN_OUT, EASE_OUT, FPS, MONO } from '../brand';
import { EndCard, Line } from '../kit';
import { LAST_WORD_END, Q } from './take1b-cues';
import { OwnScreen, RealApp, SameScreen, WALL_VARIETY, look, lookFor, r4, tileCenter } from './take1b-screens';
import { Dev, Device, PriceTag, Shelves, WORLD, dev } from './take1b-world';
import TYPE from '../../public/stills/r4/golden-sunbreak-phone-type.json';
import { BILL_X, BillStack, BillTotal, SHARE, ShelfReceipt, billRise, receiptOutline } from './take1b-scenes';

const cl = (x: number) => Math.max(0, Math.min(1, x));
const lin = (t: number, a: number, b: number) => cl((t - a) / (b - a));
const ez = (t: number, a: number, b: number, e = EASE_OUT) => e(lin(t, a, b));
const bump = (t: number, at: number, d = 0.28) => (t < at || t > at + d ? 0 : Math.sin(Math.PI * (t - at) / d));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

const HERO = dev('hero'), TV = dev('tv'), LL = dev('lockLaptop'), TT = dev('tagTablet'), L0 = dev('0:l0');
const MAXD = Math.max(...WORLD.devs.map((d) => d.dist));
const jit = (d: Dev) => ((Math.abs(Math.sin(d.cx * 0.013 + d.cy * 0.007)) * 1000) % 1);
const top = (d: Dev) => d.cy - d.h / 2;
const hy = HERO.cy;

// ---------- the timeline's derived moments ----------
const CUT_PRIVACY = Q.privacy + 0.1;                 // the "own nothing." headline has had its minimum hold by here
// (9) the ending. WHY this order (reviewer 2026-11-20): the wall goes soft and pale under "open source everything."
// so the words sit on a calm backdrop; the words leave completely; only then does the calm wall give way to the
// end card, already whole (never a ghost of the headline over the wall, never a half-built card).
const CALM0 = Q.open - 0.15;
const END_FADE = Math.max(LAST_WORD_END + 0.2, Q.open + 2.3);    // the headline is gone by here
const END_CARD = END_FADE + 0.06, END_X = 0.3;                   // then a short dissolve to the end card
// (1) the two moments the TV rearranges every screen
const DICT = Q.dictated + 0.06, TECH = Q.technology1 + 0.06;
// (2) the padlocks and the terms
const LOCK0 = Q.could + 0.04;
const ACCEPT = Q.acceptedIt + 0.12;
// WHY uneven gaps (plan): three people giving in one at a time, the person with the receipt last and a little hesitant
const ACCEPT_AT: Record<string, number> = { '0:l0': ACCEPT, tagTablet: ACCEPT + 0.15, hero: ACCEPT + 0.45 };
if (ACCEPT_AT.hero + 0.42 > Q.weAccepted) throw new Error('take1b: the hero phone\'s terms card would still be up at the cut');
const TAG_DROP = Q.costWord - 0.3;
// (4) "However": the wall hushes and the TV goes fully black; on "something" a cursor is born in it
const HUSH = Q.however;
const CURSOR_AT = Q.something + 0.04;

// (5) the cursor in the black TV. WHY a typed line and nothing else (plan): the new AI is one thin cream cursor that
// can make things; no bar, no glow, no interface. It types its own question on "intelligence".
const TV_LINE = 'what should i make?';
const TV_FS = 58, TV_ADV = TV_FS * 0.6;              // world px: the line's type size, and one monospaced letter's width
const TV_LX = (TV.w - TV_LINE.length * TV_ADV) / 2;  // where the line starts, from the TV screen's left edge
export const TV_CURSOR = { w: 8, h: 78 };            // world px: thin like the real caret, still readable as it crosses the wall
// the cursor's own letters: a quick, even typist (it is the machine), a beat after each space. WHY it may run a few
// tenths into the close-up: a cut on the action, the closer framing picks the line up mid-word
const TV_TYPE: number[] = (() => {
  const out: number[] = []; let t = Q.intelligence + 0.02; let seed = 7;
  for (let i = 0; i < TV_LINE.length; i++) {
    out.push(t);
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    t += 0.05 + (seed % 1000) / 1000 * 0.025 + (TV_LINE[i] === ' ' ? 0.05 : 0);
  }
  return out;
})();
const CREATED_DIP = Q.created1 + 0.02;               // the wall dips as one, poured down from the TV: it is wired to it
// "a great treasure": the same cream tag as the tablet's is let down slowly from "believed" and lands on "treasure";
// on "value" a small $20/mo tag pops onto every other screen, poured down from the TV like every order
const PRICE_ALL = Q.value + 0.04;
// (6) the blink quickens on "excitement"; on "far" their tag drops off and the cursor gets away
const HOP0 = Q.far + 0.24, HOP = 0.34, LAND = HOP0 + 2 * HOP + 0.75 * HOP;
// the hero's request: real stills of the app with one more real character typed into its own box (take1b-library.mjs)
const SEND = Q.monopolies1 + 0.25;
const TYPE_AT: number[] = (() => {
  // WHY this rhythm (owner: "the typing feels broken/laggy"): 75-125 ms a letter, a little longer after each space,
  // one 0.3 s hesitation before the last word, so it reads as a person's fingers, never a machine or a stall
  const gaps: number[] = []; let seed = 11;
  for (let i = 0; i < TYPE.n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    gaps.push(0.075 + (seed % 1000) / 1000 * 0.05 + (TYPE.text[i - 1] === ' ' ? 0.14 : 0) + (TYPE.text.slice(i).startsWith('pickups') ? 0.3 : 0));
  }
  const total = gaps.reduce((a, g) => a + g, 0);
  // the last letter lands about 0.6 s before it is sent: a glance at what was typed, then send
  let t = Math.max(Q.aTool + 0.15, SEND - 0.6 - total);
  return gaps.map((g) => (t += g) - g);
})();
const TYPE0 = TYPE_AT[0];
const MACRO = TYPE0 - 0.7;                           // the cut to the phone's message box, a breath before the first letter
const FLIP_HERO = Q.forAnyone;                       // the board the app made arrives on "for anyone who asks"
const WHO_AT = (i: number) => Q.who + i * 0.4;       // three neighbours turn into their own windows on "who"
// (7) the lateral track along the shelves, then the three callbacks
const TRACK_X0 = -1700, TRACK_X1 = 1700;
const UNLOCK = Q.canDo + 0.1, LL_FLIP = Q.computers2 - 0.05;
const STRIKE = Q.costs + 0.12, TT_FREE = Q.costs + 0.4, TT_FALL = Q.costsWord + 0.05, TT_FLIP = Q.costsWord + 0.1;
const REWIND0 = Q.whatHappens + 0.25, REWIND1 = Q.whatHappens + 1.3;
// (8) the TV is the last holdout: everything holds still, then it opens on "past"
const TV_FLIP = Q.past;
// (9) the board passes to two neighbours, each in their own look with their own life in it
const SHARE_AT = [Q.timeWord + 0.15, Q.longFirst + 0.05];
const SHARE_HOLD = Q.open;

const HEADS = [
  { text: 'own *nothing.', at: Q.own, out: CUT_PRIVACY },
  // WHY from "truly" (reviewer): it used to be whole two seconds before "happened" was said
  { text: 'something *wonderful happened.', at: Q.truly, out: Q.blinded - 0.04 },
  { text: 'for *anyone who asks.', at: Q.forAnyone, out: Q.andSo - 0.04 },
  { text: 'open source *everything.', at: Q.open, out: END_FADE },
];
// WHY checks: the brand guide's muted-video rule (1.2 s + 0.25 s a word), and beats that need room. If the
// voice is re-timed and something would flash by, the render stops instead of shipping it.
for (const h of HEADS) {
  const words = h.text.split(/\s+/).length;
  if (h.out - h.at < 1.2 + 0.25 * words) throw new Error(`take1b: headline "${h.text}" is up ${(h.out - h.at).toFixed(2)} s, needs ${1.2 + 0.25 * words} s`);
}
if (END_CARD + 2.5 > 75) throw new Error('take1b: the end card would be held under 2.5 s');
if (WALL_VARIETY < 20) throw new Error(`take1b: the wall uses only ${WALL_VARIETY} different stills, needs 20`);
if (TV_TYPE[TV_TYPE.length - 1] > Q.aTechnology + 0.6) throw new Error('take1b: the cursor would still be typing at the cut');
if (MACRO < LAND + 0.9) throw new Error('take1b: the cut to the message box would come before the phone has been seen opening');
if (SEND + 0.5 > FLIP_HERO) throw new Error('take1b: the app would not be seen working before the board arrives');
if (SHARE_HOLD - SHARE_AT[1] < 1.2) throw new Error('take1b: the shared copies would not be held 1.2 s');
if (Q.costs - LL_FLIP < 1.0) throw new Error('take1b: the unlocked laptop would be up under 1 s');
if (Q.whatHappens - TT_FLIP < 0.9) throw new Error('take1b: the freed tablet would be up under 0.9 s');
if (TV_FLIP - Q.freeWord < 1.5) throw new Error('take1b: the TV would open before the daylight has settled');

// ---------- when each screen becomes someone's own ----------
const STORY = ['hero', 'lockLaptop', 'tagTablet', 'tv'];
// WHY these three (plan): ordinary neighbours of the hero, not story devices, so the wall's turn starts next door
const FIRST_FOLLOWERS = ['0:l0', '0:r1', '1:r0'];
// the devices the lateral track passes: they change as the camera reaches them
const TRACKED = (d: Dev) => d.row >= -1 && d.row <= 1 && Math.abs(d.cx) < 2300;
const flipAt = (d: Dev): number => {
  if (d.id === 'hero') return FLIP_HERO;
  if (d.id === 'lockLaptop') return LL_FLIP;
  if (d.id === 'tagTablet') return TT_FLIP;
  if (d.id === 'tv') return TV_FLIP;
  const fi = FIRST_FOLLOWERS.indexOf(d.id);
  if (fi >= 0) return WHO_AT(fi);
  if (TRACKED(d)) {
    // WHY a beat before the frame's centre: the change happens just as each screen slides into the middle
    const p = ((d.cx - 260) - TRACK_X0) / (TRACK_X1 - TRACK_X0);
    return Math.max(Q.andSo + 0.05, Q.andSo + p * (Q.canDo - Q.andSo)) + jit(d) * 0.12;
  }
  // everything out of shot changes in a ripple over the same seconds, so the wide shots later are complete
  return Q.andSo + 0.25 + (d.dist / MAXD) * (Q.canDo - Q.andSo - 0.3) + jit(d) * 0.25;
};
const SAME_GLOW = 'rgba(236,230,244,1)';
const DEAD_GLOW = 'rgba(14,9,20,1)';

// ---------- the hero phone's real window ----------
const HS = { x: HERO.cx - HERO.w / 2, y: top(HERO) };
const [SW, SH] = TYPE.full;                          // the stills' pixel size (1170 x 2442: the phone's exact shape)
// the real caret in those stills, measured from the pixels: x 264-266, y 2205-2270, colour #F8E8C8
const CARET = { x: HS.x + (265 / SW) * HERO.w, y: HS.y + (2237.5 / SH) * HERO.h, h: (66 / SH) * HERO.h, w: (3 / SW) * HERO.w };
const CARET_COL = '#F8E8C8';
const BOX_AT = `50% ${((2237 / SH) * 100).toFixed(1)}%`;   // the message box, where the window and the board open from
const HERO_BASE = r4('golden-sunbreak-phone-type-base');    // the window, the box empty, caret in its "off" half
const strip = (i: number) => r4(`golden-sunbreak-phone-type-${String(i).padStart(2, '0')}`);
const typedAt = (t: number) => TYPE_AT.filter((a) => t >= a).length;

/** The hero phone as the real youcoded window, from the moment the cursor lands until the board arrives. */
const HeroWindow: React.FC<{ t: number }> = ({ t }) => {
  const W = HERO.w, H = HERO.h;
  if (t >= SEND) return <RealApp src={r4('golden-sunbreak-phone-asked')} w={W} h={H} />;
  const n = typedAt(t);
  // WHY two stills for the idle blink: the box empty with its caret off (base) and on (strip 0), both real; while
  // typing, every strip is the real box a moment after a real keystroke, when the caret is always on
  const on = n > 0 || Math.floor((t - LAND) / 0.5) % 2 === 0;
  const src = n > 0 ? strip(Math.min(n, TYPE.n)) : on ? strip(0) : null;
  return (
    <>
      <RealApp src={HERO_BASE} w={W} h={H} />
      {src && <RealApp src={src} w={W} h={H * (SH - TYPE.y0) / SH} style={{ top: H * TYPE.y0 / SH }} />}
    </>
  );
};
// the made board's three parts, as bands of the still (fractions of its height): time, Sam's message, their photos
const BOARD_BANDS: [number, number][] = [[0.062, 0.27], [0.272, 0.38], [0.382, 0.85]];
const BOARD_BG = '#08080E';
/** The pickup board the app made, inside the real Golden Sunbreak window. `p` is its build, starting a quarter built:
 *  the time first, then Sam's message, then the photos settle in, each from a little below. */
const HeroBoard: React.FC<{ p: number }> = ({ p }) => {
  const W = HERO.w, H = HERO.h, src = r4('golden-sunbreak-phone-mine');
  return (
    <>
      <RealApp src={src} w={W} h={H} />
      {BOARD_BANDS.map(([a, b], i) => <div key={`c${i}`} style={{ position: 'absolute', left: W * 0.05, width: W * 0.9, top: H * a, height: H * (b - a), background: BOARD_BG }} />)}
      {BOARD_BANDS.map(([a, b], i) => {
        const k = cl(p * 4 - i);
        const s = k * k * (3 - 2 * k);
        return <div key={`b${i}`} style={{ position: 'absolute', inset: 0, clipPath: `inset(${a * 100}% 0 ${(1 - b) * 100}% 0)`, opacity: s, transform: `translateY(${(1 - s) * 8}px)` }}><RealApp src={src} w={W} h={H} /></div>;
      })}
    </>
  );
};

// ---------- the camera: one framing per shot, eased inside the shot, cut between shots ----------
// [world x, world y at frame centre, scale, tilt back (deg, + looks up at the wall, - looks down on it), roll (deg)]
type Cam = [number, number, number, number?, number?];
// focus: sharp devices; semi: slightly soft ones (a lens's shallow depth, the neighbour just behind the plane);
// soft: the background's blur in world px when it should be softer than the zoom alone gives; par: how much less the
// shelf below moves than the camera (parallax), for the tilts that follow the receipt; bill: the camera climbs
// with the pile of charges; bgDim: how much the background is stopped down so a cream receipt or the white total
// keeps its contrast against the bright soft screens behind it; fn: a camera that follows something (the cursor)
type Shot = { at: number; keys: [number, Cam][]; focus?: string[]; semi?: string[]; soft?: number; par?: number; bgDim?: number; bill?: boolean; linear?: boolean; rack?: [number, number, number]; fn?: (t: number) => Cam };
const TWO_X = (HERO.cx - HERO.w / 2 + TT.cx + TT.w / 2) / 2;          // the phone and the tablet, side by side
const TRIO_X = (L0.cx - L0.w / 2 + TT.cx + TT.w / 2) / 2;            // laptop, phone, tablet
const TRIO = ['0:l0', 'hero', 'tagTablet'];
// the laptop's tile row, for the padlock macro
const LL_GRID = (() => { const a = tileCenter(LL.w, LL.h, 2, 0), b = tileCenter(LL.w, LL.h, 2, 5); return { x: LL.cx - LL.w / 2 + (a.x + b.x) / 2, y: top(LL) + a.y }; })();
// the cursor's line on the TV, in world px
const TV_L = TV.cx - TV.w / 2;
const LINE_Y = TV.cy;
const LINE_END = TV_L + TV_LX + TV_LINE.length * TV_ADV;
const TAG_X = LINE_END + 150, TAG_LEN = 640;          // their tag hangs on a long string from above, beside the line
const TAG_Y = LINE_Y - 50 - TAG_LEN;
const CLOSE_X = (TV_L + TV_LX + TAG_X + 95) / 2;      // the close-up holds the whole line and its tag
// the message box close-up: the box about two thirds down the frame, the chips and a band of the wallpaper above it.
// WHY the model's row stays in (plan allows it): it is the friendly "Qwen36 27b" label, and cutting it out would put
// the box on the frame's bottom edge
const MACRO_Y = HS.y + 0.83 * HERO.h;
// "It's time, at long, long last": five devices on the person's shelf
const FIVE = ['0:l1', '0:l0', 'hero', 'tagTablet', '0:r1'].map(dev);
const FIVE_L = Math.min(...FIVE.map((d) => d.cx - d.w / 2)), FIVE_R = Math.max(...FIVE.map((d) => d.cx + d.w / 2));
const FIVE_S = 1920 / (FIVE_R - FIVE_L + 190);

// the escaping cursor's path: its line's end in the TV, a landing on the TV's shelf lip, one on the shelf below, then
// into the person's phone exactly where the real caret sits
const HOPS = [
  { x: LINE_END + 4 + TV_CURSOR.w / 2, y: LINE_Y, h: TV_CURSOR.h, w: TV_CURSOR.w },
  { x: TV.cx + TV.w / 2 + 110, y: TV.shelf - TV_CURSOR.h / 2, h: TV_CURSOR.h, w: TV_CURSOR.w },
  { x: LL.cx + LL.w / 2 + 70, y: LL.shelf - TV_CURSOR.h / 2, h: TV_CURSOR.h, w: TV_CURSOR.w },
  { x: CARET.x, y: CARET.y, h: CARET.h, w: CARET.w },
];
const cursorAt = (t: number) => {
  if (t <= HOP0) return { ...HOPS[0], sq: 0 };
  if (t >= LAND) return { ...HOPS[3], sq: 0 };
  const j = Math.min(2, Math.floor((t - HOP0) / HOP));
  // WHY 75% moving, 25% resting: it visibly lands on each shelf lip before it jumps again
  const p = lin(t, HOP0 + j * HOP, HOP0 + (j + 0.75) * HOP);
  const e = EASE_IN_OUT(p);
  const a = HOPS[j], b = HOPS[j + 1];
  const arc = Math.sin(Math.PI * p) * (j === 2 ? 90 : 150);
  // a short squash where it lands, like something with a little weight
  const sq = p >= 1 ? bump(t, HOP0 + (j + 0.75) * HOP, 0.18) : 0;
  return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) - arc, h: lerp(a.h, b.h, j === 2 ? EASE_IN(p) : e), w: lerp(a.w, b.w, j === 2 ? EASE_IN(p) : e), sq };
};
/** The camera that follows the cursor down the wall: it leaves the TV close-up, tracks the cursor with a slight lag
 *  (a hand-held operator follows, never leads), and settles on the person's phone as the window opens. */
const followCam = (t: number): Cam => {
  const startC: Cam = [TV.cx + 60, LINE_Y + 40, 1.72];
  const endC: Cam = [HERO.cx + 40, hy + 30, 2.3];
  // the lagging follow: the cursor's average place over the last quarter second
  let fx = 0, fy = 0;
  for (let k = 0; k < 8; k++) { const c = cursorAt(t - (k / 7) * 0.25); fx += c.x; fy += c.y; }
  fx /= 8; fy /= 8;
  const follow: Cam = [lerp(0, fx, 0.55), fy + 70, 1.05];
  const a = ez(t, Q.far + 0.05, HOP0 + 0.35, EASE_IN_OUT);     // ease out of the close-up into the follow
  const b = ez(t, LAND - 0.4, LAND + 0.85, EASE_IN_OUT);       // ease from the follow onto the phone (WHY this long: shorter read as a whip)
  const mix = (u: Cam, v: Cam, q: number): Cam => [lerp(u[0], v[0], q), lerp(u[1], v[1], q), Math.exp(lerp(Math.log(u[2]), Math.log(v[2]), q))];
  const c = mix(mix(startC, follow, a), endC, b);
  // and once on the phone, a slow push in while its window wakes
  return [c[0], c[1], c[2] * (1 + 0.06 * ez(t, LAND + 0.85, MACRO, EASE_IN_OUT))];
};

const SHOTS: Shot[] = [
  // (1) low angle on the whole wall: the TV whole at upper centre in the room's one warm light, the person's phone
  // in the middle. It opens closer, tilted and out of focus, and settles; on "corporations" it eases towards the TV.
  { at: Q.start, keys: [[0, [0, -610, 0.7, 9, -3.5]], [1.3, [0, -700, 0.55, 4, 0]], [Q.corporations, [0, -705, 0.55, 4, 0]], [Q.interact, [0, -790, 0.6, 3, 0]]], rack: [0, 1.1, 9] },
  // "how you interact": the person's phone sharp, the tablet beside it a touch soft; both snap on "technology"
  { at: Q.interact, keys: [[Q.interact, [TWO_X, hy - 10, 2.45]], [Q.decided, [TWO_X, hy - 10, 2.6]]], focus: ['hero'], semi: ['tagTablet'] },
  // (2) "what your computers could do": a macro on the laptop's tiles as the padlocks snap shut
  { at: Q.decided, keys: [[Q.decided, [LL_GRID.x, LL_GRID.y - 10, 3.5]], [Q.cost, [LL_GRID.x + 20, LL_GRID.y - 10, 3.85]]], focus: ['lockLaptop'] },
  { at: Q.cost, keys: [[Q.cost, [TT.cx - 40, TT.cy - 60, 1.9]], [Q.data, [TT.cx - 40, TT.cy - 60, 2.05]]], focus: ['tagTablet'] },
  // "and what happened with your personal data": the phone close on its shelf; the switch flips by itself, and the
  // receipt prints out of it over the shelf lip; the camera tilts down after the paper
  { at: Q.data, keys: [[Q.data, [0, hy, 2.55]], [SHARE.on + 0.3, [0, hy + 8, 2.56]], [Q.weAll, [0, -82, 2.68]]], focus: ['hero'], par: 0.45, bgDim: 0.35 },
  // (3) "and we all... we all just accepted it": overhead, the terms card pours down from the TV; then three accept
  { at: Q.weAll, keys: [[Q.weAll, [0, -300, 0.55, -14, 0]], [Q.weAll2, [0, -420, 0.58, -11, 0]]] },
  { at: Q.weAll2, keys: [[Q.weAll2, [TRIO_X, hy - 30, 1.7]], [Q.weAccepted, [TRIO_X, hy - 30, 1.62]]], focus: TRIO },
  // "subscribe to everything and own nothing": the charges stack on the shelf in front of the same phone
  { at: Q.weAccepted, keys: [[Q.weAccepted, [BILL_X - 50, -188, 1.7]], [CUT_PRIVACY, [BILL_X - 50, -188, 1.82]]], bill: true, soft: 3.2, bgDim: 0.4 },
  // "our privacy would be the cost of convenience": the same receipt, close; four more lines print, one per word
  { at: CUT_PRIVACY, keys: [[CUT_PRIVACY, [0, 40, 4.3]], [Q.convenience + 0.7, [0, 132, 4.4]]], focus: ['hero'], par: 0.45, bgDim: 0.5 },
  // (4) "however, recently...": the wide wall hushes, the TV goes black, the person's phone is the last light; on
  // "something" a cursor is born in the black TV and a slow push up towards it begins
  { at: Q.however, keys: [[Q.however, [0, -520, 0.49]], [CURSOR_AT, [0, -544, 0.52]], [Q.blinded, [0, -600, 0.54]]] },
  // (5) "blinded by their own hubris, these corporations": the push carries on up the shelves until the black TV
  // fills the upper half, landing on "corporations"; the wall below comes back up, small and obedient. Then through
  // "artificial" a slow push in on the TV, where the cursor types its own line on "intelligence".
  { at: Q.blinded, keys: [[Q.blinded, [0, -600, 0.54]], [Q.corporations, [TV.cx, TV.cy + 232, 1.0]], [Q.ai, [TV.cx, TV.cy + 200, 1.04]], [Q.aTechnology, [TV.cx + 20, TV.cy + 40, 1.5]]] },
  // "a technology they believed would bring about a great treasure": close on the line and the cursor; the tag is let
  // down beside it and lands on "treasure"
  { at: Q.aTechnology, keys: [[Q.aTechnology, [CLOSE_X - 10, LINE_Y + 20, 1.78]], [Q.shareholder, [CLOSE_X, LINE_Y + 20, 1.86]]], focus: ['tv'] },
  // "shareholder value": pull back to the whole wall; on "value" every other screen gets its small tag, poured down
  { at: Q.shareholder, keys: [[Q.shareholder, [CLOSE_X, LINE_Y + 20, 1.86]], [Q.but - 0.02, [0, -560, 0.52]]] },
  // (6) "but in their excitement, they created something": close on the TV again; the blink quickens; a small push
  { at: Q.but, keys: [[Q.but, [TV.cx + 60, LINE_Y + 40, 1.6]], [Q.created2, [TV.cx + 60, LINE_Y + 40, 1.6]], [Q.far, [TV.cx + 60, LINE_Y + 40, 1.72]]], focus: ['tv'] },
  // "far beyond their own control": the cursor gets away and the camera follows it down into the person's phone
  { at: Q.far, keys: [[Q.far, [0, 0, 1]]], fn: followCam, focus: ['hero'] },
  // "a tool that can make software...": close on the phone's own message box; the request is typed, then sent
  { at: MACRO, keys: [[MACRO, [HERO.cx, MACRO_Y, 6.4]], [SEND - 0.05, [HERO.cx, MACRO_Y - 3, 6.75]], [SEND + 0.55, [HERO.cx, hy + 70, 2.3]]], focus: ['hero'] },
  // "for anyone who asks": the made board opens on the phone; on "who" the camera eases back as three neighbours
  // turn into their own windows
  { at: FLIP_HERO, keys: [[FLIP_HERO, [HERO.cx, hy + 70, 2.3]], [Q.who, [HERO.cx, hy + 68, 2.26]], [Q.who + 1.0, [60, hy + 140, 1.42]], [Q.andSo, [70, hy + 150, 1.38]]], focus: ['hero'], semi: FIRST_FOLLOWERS },
  // (7) "and so... we get to decide": a lateral track along the shelves; each screen turns its own as it passes
  { at: Q.andSo, keys: [[Q.andSo, [TRACK_X0, hy - 60, 1.05, 3, 0]], [Q.canDo, [TRACK_X1, hy - 60, 1.05, 3, 0]]], linear: true },
  { at: Q.canDo, keys: [[Q.canDo, [LL.cx, LL.cy + 10, 2.3]], [Q.costs, [LL.cx, LL.cy + 10, 2.42]]], focus: ['lockLaptop'] },
  { at: Q.costs, keys: [[Q.costs, [TT.cx - 40, TT.cy - 60, 1.9]], [Q.whatHappens, [TT.cx - 40, TT.cy - 60, 2.0]]], focus: ['tagTablet'] },
  // "and what happens with our data": the phone close on its shelf with the long receipt; the camera tilts up with the
  // paper as it rolls back into the phone
  { at: Q.whatHappens, keys: [[Q.whatHappens, [0, 60, 2.6]], [REWIND0, [0, 58, 2.6]], [REWIND1 + 0.2, [0, hy + 10, 2.5]], [Q.free, [0, hy + 6, 2.53]]], focus: ['hero'], par: 0.45, bgDim: 0.25 },
  // (8) "free ourselves": low angle again, daylight opens out of the person's phone; then everything holds still while
  // a slight drift settles the one black screen, the TV, into the top third, and on "past" it opens
  { at: Q.free, keys: [[Q.free, [0, -420, 0.62, 6, 0]], [TV_FLIP - 0.55, [0, -680, 0.6, 3, 0]], [Q.timeWord - 0.3, [0, -684, 0.6, 3, 0]]] },
  // (9) "it's time, at long, long last": five devices on the person's shelf; the board passes to two neighbours; then
  // all the way back to the calm wall
  { at: Q.timeWord - 0.3, keys: [[Q.timeWord - 0.3, [(FIVE_L + FIVE_R) / 2, hy - 20, FIVE_S]], [SHARE_HOLD, [(FIVE_L + FIVE_R) / 2, hy - 24, FIVE_S * 0.96]], [Q.open + 0.1, [0, -380, 0.52]], [END_FADE, [0, -400, 0.4]]], focus: ['hero'], semi: ['0:l0', '0:r1'], soft: 2.4 },
];
const shotAt = (t: number) => { let s = SHOTS[0]; for (const x of SHOTS) if (t >= x.at) s = x; return s; };
const camAt = (t: number, s: Shot): [number, number, number, number, number] => {
  const full = (c: Cam): [number, number, number, number, number] => [c[0], c[1], c[2], c[3] ?? 0, c[4] ?? 0];
  if (s.fn) return full(s.fn(t));
  const k = s.keys;
  if (t <= k[0][0]) return full(k[0][1]);
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      // WHY linear for the track: a tracking shot runs at one speed; easing it would read as a lurch
      const p = s.linear ? lin(t, k[i - 1][0], k[i][0]) : EASE_IN_OUT(lin(t, k[i - 1][0], k[i][0]));
      const a = full(k[i - 1][1]), b = full(k[i][1]);
      // WHY log-space zoom: equal steps in log scale read as a steady camera move; linear zoom lurches at the end
      return [lerp(a[0], b[0], p), lerp(a[1], b[1], p), Math.exp(lerp(Math.log(a[2]), Math.log(b[2]), p)), lerp(a[3], b[3], p), lerp(a[4], b[4], p)];
    }
  }
  return full(k[k.length - 1][1]);
};

// ---------- what each screen shows at time t ----------
const flipNode = (f: number, a: React.ReactNode, b: React.ReactNode, at = '50% 50%') => {
  if (f <= 0) return a;
  if (f >= 1) return b;
  // WHY a circle opening (from the centre, or from where the change came in): the change reads as arriving IN
  // the screen. The new screen is always already complete behind the circle, never an empty panel.
  return <>{a}<div style={{ position: 'absolute', inset: 0, clipPath: `circle(${EASE_OUT(f) * 150}% at ${at})` }}>{b}</div></>;
};
// WHY every change pours down from the TV (plan): the TV is the companies; it changes first, then each shelf below it
// two frames later, top to bottom, so a viewer sees the order of command. The shelf above the TV goes with the TV's own.
const pour = (d: Dev) => (d.id === 'tv' ? 0 : (1 + Math.max(0, d.row - TV.row) * 2) / FPS);
// WHY a 4-frame snap rather than a slide: blocks sliding past each other looked messy; a snap reads as an order obeyed
const layAt = (t: number, d: Dev) => { const p = pour(d); return ez(t, DICT + p, DICT + p + 0.13, EASE_IN_OUT) + ez(t, TECH + p, TECH + p + 0.13, EASE_IN_OUT); };
const LL_LOCK_ORDER = [1, 0, 2, 3, 4, 5];   // the laptop's padlocks land one tile after another

/** The TV from "However" on: black, with the one cream cursor. It is born on "something" (a steady half second on,
 *  half off), types its own question on "intelligence", blinks faster on "excitement", and is gone on "far" (the
 *  cursor drawn in the room takes over as it gets away). The line fades as it leaves. */
const TVDark: React.FC<{ t: number; children: React.ReactNode }> = ({ t, children }) => {
  const black = ez(t, HUSH, HUSH + 0.9, EASE_IN_OUT);
  const n = TV_TYPE.filter((a) => t >= a).length;
  const typing = t >= TV_TYPE[0] && t < TV_TYPE[TV_TYPE.length - 1] + 0.25;
  // the blink's phase, summed frame by frame so its rate can quicken smoothly ("excitement") without a jump
  let phase = 0;
  for (let u = CURSOR_AT; u < t; u += 1 / FPS) {
    const quick = lin(u, Q.excitement, Q.created2);
    phase += (1 / FPS) * lerp(1, 2.8, quick);
  }
  const blinkOn = Math.floor(phase / 0.5) % 2 === 0;
  // the first "on" fades in over two frames so it arrives rather than pops
  const born = t < CURSOR_AT ? 0 : Math.min(1, (t - CURSOR_AT) / 0.07);
  const cursorO = t >= HOP0 ? 0 : born * (typing || blinkOn ? 1 : 0);
  const lineO = 1 - ez(t, Q.far, Q.far + 0.3, EASE_IN_OUT);
  return (
    <>
      {children}
      <div style={{ position: 'absolute', inset: 0, background: '#07040B', opacity: black }} />
      <div style={{ position: 'absolute', left: TV_LX, top: TV.h / 2 - TV_CURSOR.h / 2, height: TV_CURSOR.h, display: 'flex', alignItems: 'center', fontFamily: MONO, fontSize: TV_FS, color: CARET_COL, whiteSpace: 'pre' }}>
        {/* WHY a fixed cell per letter: the cursor's place after the line is known exactly, so its escape starts there */}
        <span style={{ display: 'flex', opacity: lineO }}>{TV_LINE.slice(0, n).split('').map((ch, i) => <span key={i} style={{ display: 'inline-block', width: TV_ADV, textAlign: 'center' }}>{ch}</span>)}</span>
        <span style={{ display: 'inline-block', width: TV_CURSOR.w, height: TV_CURSOR.h, marginLeft: n > 0 ? 4 : 0, borderRadius: 2, background: CARET_COL, opacity: cursorO }} />
      </div>
    </>
  );
};

/** The small "$20/mo" tag that pops onto a screen's corner on "value", and drops off when the screen turns its own. */
const MiniTag: React.FC<{ d: Dev; t: number; at: number; off: number }> = ({ d, t, at, off }) => {
  if (t < at) return null;
  const k = Math.min(d.w, d.h);
  const tw = k * 0.5, th = tw * 0.42;
  const pop = lin(t, at, at + 0.22);
  const s = pop < 1 ? 0.4 + 0.6 * EASE_OUT(pop) + 0.16 * Math.sin(Math.PI * pop) : 1;
  const fall = lin(t, off, off + 0.5);
  if (fall >= 1) return null;
  return (
    <div style={{ position: 'absolute', right: k * 0.05, top: k * 0.05 + fall * fall * d.h * 1.2, width: tw, height: th, transform: `rotate(${8 + fall * 40}deg) scale(${s})`, transformOrigin: '80% 20%', opacity: 1 - fall * 0.6,
      background: '#FBF5EA', borderRadius: th * 0.18, boxShadow: `0 ${th * 0.12}px ${th * 0.3}px rgba(20,8,32,0.45)`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: th * 0.12,
      fontFamily: 'inherit', fontWeight: 900, fontSize: th * 0.5, letterSpacing: '-0.04em', color: C.plum, whiteSpace: 'nowrap' }}>
      <span style={{ width: th * 0.16, height: th * 0.16, borderRadius: th, background: '#2A1F33', flex: 'none' }} />$20/mo
    </div>
  );
};

const screenOf = (d: Dev, t: number): { node: React.ReactNode; glow: string; lift: number } => {
  const own = lookFor(d);
  const fa = flipAt(d);
  const isHero = d.id === 'hero';
  const f = lin(t, fa, fa + 0.5);
  const lift = bump(t, fa, 0.7) * 0.9;
  // WHY padlocks on the one laptop only (plan): it is the device the story follows for "what your computers could do",
  // and it must be findable in every wide shot until line 7 knocks them off
  const lock: number | number[] = d.id === 'lockLaptop' ? LL_LOCK_ORDER.map((r) => lin(t, LOCK0 + r * 0.11, LOCK0 + r * 0.11 + 0.45)) : 0;
  // the terms card pours down from the TV like every other order; the three in the "accepted it" shot press one at a
  // time, and the rest of the wall gives in at scattered moments just after
  const dlg0 = Q.weAll + 0.05 + pour(d);
  const acc0 = ACCEPT_AT[d.id] ?? ACCEPT + 0.1 + jit(d) * 0.6;
  const same = (
    <SameScreen w={d.w} h={d.h} lay={layAt(t, d)}
      lock={lock} unlock={d.id === 'lockLaptop' ? lin(t, UNLOCK, UNLOCK + 0.4) : 0}
      dialog={lin(t, dlg0, dlg0 + 0.3)}
      accept={lin(t, acc0, acc0 + 0.6)}
      share={isHero ? { o: lin(t, SHARE.in, SHARE.in + 0.3), on: lin(t, SHARE.on, SHARE.on + 0.18) } : undefined}
      outline={isHero ? receiptOutline(t) : undefined} />
  );
  // every screen gets its small price on "value", and sheds it as it turns, except the story devices: each already
  // carries its one mark (the receipt, the tablet's tag, the padlocks, the TV's own tag). WHY: never two marks on one
  const priced = !STORY.includes(d.id);
  const tag = priced ? <MiniTag d={d} t={t} at={PRICE_ALL + pour(d)} off={fa - 0.08} /> : null;
  if (isHero) {
    // the phone becomes the real window the moment the cursor lands in it, opening from its message box; then, on
    // "for anyone who asks", the board the app made opens over it the same way and settles in
    const g = lin(t, LAND - 0.02, LAND + 0.42);
    const win = <div style={{ position: 'absolute', inset: 0, background: '#120A19' }}><HeroWindow t={t} /></div>;
    const board = <div style={{ position: 'absolute', inset: 0, background: BOARD_BG }}><HeroBoard p={0.25 + 0.75 * lin(t, fa, fa + 0.9)} /></div>;
    const node = t < fa ? flipNode(g, same, win, BOX_AT) : flipNode(lin(t, fa, fa + 0.45), win, board, BOX_AT);
    const glow = t >= LAND ? look('golden-sunbreak-tv-chat').glow : SAME_GLOW;
    return { node, glow, lift: t < fa ? bump(t, LAND, 0.5) * 0.5 : bump(t, fa, 0.6) * 0.5 };
  }
  const ownNode = <OwnScreen look={own} w={d.w} h={d.h} />;
  if (d.id === 'tv') {
    // WHY black from "However" until "past" (plan): the TV is the companies; after the cursor escapes it stays the one
    // dead rectangle on the bright wall, and is the last screen to become someone's own
    const before = t < HUSH ? same : <TVDark t={t}>{same}</TVDark>;
    return { node: flipNode(f, before, ownNode), glow: f > 0.5 ? own.glow : t >= HUSH + 0.5 ? DEAD_GLOW : SAME_GLOW, lift };
  }
  let node: React.ReactNode = <>{flipNode(f, same, ownNode)}{tag}</>;
  // the pickup board, passed on to two neighbours: the same board in each one's own look with their own life in it
  const si = ['0:l0', '0:r1'].indexOf(d.id);
  if (si >= 0) {
    const mine = <OwnScreen look={look(si === 0 ? 'kuromi-dreamer-laptop-mine' : 'morning-rounds-phone-mine')} w={d.w} h={d.h} />;
    // WHY from the side facing the person's phone: it visibly comes from them
    node = <>{flipNode(lin(t, SHARE_AT[si], SHARE_AT[si] + 0.55), flipNode(f, same, ownNode), mine, si === 0 ? '100% 50%' : '0% 50%')}{tag}</>;
  }
  return { node, glow: f > 0.5 ? own.glow : SAME_GLOW, lift: lift + (si >= 0 ? bump(t, SHARE_AT[si], 0.6) * 0.6 : 0) };
};

// =====================================================================================================
export const Take1B: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const shot = shotAt(t);
  const [cx, cy0, s, rx, rz] = camAt(t, shot);
  // the bill shot's camera climbs with the pile of charges (world px), so the newest one always lands in view
  const cy = shot.bill ? cy0 - billRise(t) : cy0;
  const night = 1 - ez(t, Q.freeWord, Q.freeWord + 1.2, EASE_IN_OUT);

  // WHY the card is passed an earlier start: it arrives already whole (reviewer: a faded URL first, then the
  // platforms, read as a half-loaded card); the short dissolve below is the only movement
  const card = <EndCard at={END_CARD - 0.75} />;
  if (t >= END_CARD + END_X) return (<AbsoluteFill><Audio src={staticFile('audio/voice-take1-lily.wav')} />{card}</AbsoluteFill>);

  const focus = new Set(shot.focus ?? []);
  // depth of field: in close-ups everything but the subject goes soft, like a real lens; the opening racks focus
  const rack = shot.rack ? shot.rack[2] * (1 - ez(t, shot.rack[0], shot.rack[1], EASE_IN_OUT)) : 0;
  const blur = (shot.soft ?? (s > 1.6 ? Math.min(3.2, (s - 1.6) * 3) : 0)) + rack / s;
  const semi = new Set(shot.semi ?? []);
  // WHY a wider cull when tilted: perspective shows more of the wall than the flat frame does
  const tilt = Math.abs(rx) + Math.abs(rz);
  const vw = 1920 / s * (1 + tilt * 0.04), vh = 1080 / s * (1 + tilt * 0.05);
  const visible = (d: Dev) => Math.abs(d.cx - cx) < vw / 2 + d.w && Math.abs(d.cy - cy) < vh / 2 + d.h;
  // "However" hushes the wall; WHY it comes back up during the push to the TV (plan): the wall below is the companies'
  // small, obedient screens, lit again, while only their own big screen stays black
  const dim = t >= Q.however && t < Q.corporations ? ez(t, Q.however, Q.however + 0.9) * (1 - ez(t, Q.blinded + 0.3, Q.corporations, EASE_IN_OUT)) : 0;
  // WHY the wall hushes again while the request is typed: it echoes the "something wonderful" hush, the same lit
  // phone, now being asked, and keeps the eye on its message box
  const hush = t >= LAND && t < FLIP_HERO + 0.6 ? ez(t, LAND + 0.3, LAND + 1.1) * (1 - ez(t, FLIP_HERO + 0.05, FLIP_HERO + 0.6, EASE_IN_OUT)) : 0;
  const dimAll = Math.max(dim, hush);

  // the room's light (plan): one warm key on the TV, rising on "corporations" and dimmed by the hush; everything else
  // falls off cool and darker down the shelves and out to the sides. Night only: daylight replaces it at "free".
  const warm = night * (0.55 + 0.45 * ez(t, Q.corporations, Q.corporations + 0.8, EASE_IN_OUT)) * (1 - 0.6 * dimAll);
  const renderDev = (d: Dev) => {
    const sc = screenOf(d, t);
    const shade = STORY.includes(d.id) ? 0 : coolShade(d) * night;
    // the dip on "created": every screen but the TV drops to about 30% for five frames, poured down from the TV
    const dip = d.id === 'tv' ? 0 : bump(t, CREATED_DIP + pour(d), 5 / FPS) * 0.7;
    const veil = Math.max(d.id !== 'hero' ? dimAll * 0.8 : 0, dip);
    const overlay = veil > 0.01 ? <div style={{ position: 'absolute', inset: 0, background: '#0B0612', opacity: veil }} /> : null;
    const node = <Device key={d.id} d={d} night={night} glow={sc.glow} lift={sc.lift}>{sc.node}
      {/* WHY multiply: the warm key turns the TV's white to a warm cream, the only warm screen in the room */}
      {d.id === 'tv' && warm > 0.01 && t < TV_FLIP && <div style={{ position: 'absolute', inset: 0, background: '#FFE2C4', mixBlendMode: 'multiply', opacity: warm * 0.75 }} />}
      {shade > 0.01 && <div style={{ position: 'absolute', inset: 0, background: '#0A0918', opacity: shade }} />}
      {/* WHY a three-frame refresh blink as each screen takes the TV's order: on its own the 4-frame snap was too small
          to see in the wide shots, so the pour down the wall did not read; the blink makes each shelf's turn visible */}
      {t < HUSH && (() => {
        const p = pour(d), k = Math.max(bump(t, DICT + p - 0.03, 0.12), bump(t, TECH + p - 0.03, 0.12), bump(t, Q.weAll + 0.02 + p, 0.12));
        return k > 0.01 ? <div style={{ position: 'absolute', inset: 0, background: '#0B0612', opacity: k * 0.55 }} /> : null;
      })()}
      {overlay}</Device>;
    // WHY the shelf below moves a little less than the camera in the receipt tilts: it is further back, so the paper
    // in front reads as hanging in front of it (real parallax), not painted on it
    if (shot.par && d.row > HERO.row) {
      const dy = (cy - shot.keys[0][1][1]) * shot.par;
      return <div key={d.id} style={{ position: 'absolute', left: 0, top: 0, transform: `translateY(${dy}px)` }}>{node}</div>;
    }
    return node;
  };

  const devs = WORLD.devs.filter(visible);
  const back = devs.filter((d) => !focus.has(d.id) && !semi.has(d.id));
  const mid = devs.filter((d) => semi.has(d.id));
  const front = devs.filter((d) => focus.has(d.id));
  // WHY the tag and the receipt are drawn in the same focus layer as the device they hang from: a sharp tag beside a
  // soft tablet (or a sharp receipt under a soft phone) read as stuck on the lens, not hanging in the room
  const layerOf = (id: string) => (focus.has(id) ? 'front' : semi.has(id) ? 'mid' : 'back');
  const propsIn = (layer: string) => <>
    {layerOf('tagTablet') === layer && <TabletTag t={t} dim={dimAll} />}
    {layerOf('hero') === layer && <ShelfReceipt t={t} dim={dimAll} back={ez(t, REWIND0, REWIND1, EASE_IN_OUT)} />}
  </>;

  // headline readability: a soft wide band behind the lower third while a headline is up (darkening at night,
  // lightening by day), never a box
  const headUp = Math.max(0, ...HEADS.map((h) => Math.min(ez(t, h.at - 0.2, h.at + 0.3), 1 - ez(t, h.out - 0.35, h.out, EASE_IN))));
  const bandC = night > 0.5 ? '10,5,16' : '250,246,252';
  const calm = ez(t, CALM0, CALM0 + 0.7, EASE_IN_OUT);

  return (
    <AbsoluteFill style={{ background: C.night, overflow: 'hidden' }}>
      <Audio src={staticFile('audio/voice-take1-lily.wav')} />
      {/* the room: plum-black (the reviewer found the old plum lifted and muddy), lit a little from above */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg,#1C1027 0%,#120A1B 55%,#0B0611 100%)' }} />
      {night < 1 && <Daylight t={t} cx={(HERO.cx - cx) * s + 960} cy={(HERO.cy - cy) * s + 540} />}
      <AbsoluteFill style={{ transform: tilt > 0.01 ? `perspective(1700px) rotateX(${rx}deg) rotateZ(${rz}deg)` : undefined, transformOrigin: '50% 50%', filter: calm > 0.01 ? `blur(${calm * 18}px)` : undefined }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: `translate(${960 - cx * s}px, ${540 - cy * s}px) scale(${s})`, transformOrigin: '0 0' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, filter: [blur > 0.05 ? `blur(${blur}px)` : '', shot.bgDim ? `brightness(${1 - shot.bgDim})` : ''].join(' ').trim() || undefined }}>
            <div style={{ opacity: night }}><Shelves night={1} /></div>
            <div style={{ opacity: 1 - night }}><Shelves night={0} /></div>
            {night > 0.01 && <RoomLight warm={warm} night={night} />}
            {back.map(renderDev)}
            {propsIn('back')}
          </div>
          {mid.length > 0 && <div style={{ position: 'absolute', left: 0, top: 0, filter: `blur(${blur * 0.3}px)` }}>{mid.map(renderDev)}{propsIn('mid')}</div>}
          <div style={{ position: 'absolute', left: 0, top: 0, filter: rack > 0.05 ? `blur(${rack / s}px)` : undefined }}>
            {front.map(renderDev)}
            {propsIn('front')}
            <WorldProps t={t} s={s} />
            {/* WHY a mask in frame terms: once "own nothing." is up, the older charges sink away under it instead of
                their words showing through the headline */}
            {shot.bill && (() => {
              const L = cx - 960 / s, T = cy - 540 / s, a = 1 - headUp;
              const m = `linear-gradient(180deg,#000 60%,rgba(0,0,0,${a}) 72%)`;
              return <div style={{ position: 'absolute', left: L, top: T, width: 1920 / s, height: 1080 / s, WebkitMaskImage: m, maskImage: m }}>
                <div style={{ position: 'absolute', left: -L, top: -T }}><BillStack t={t} /></div>
              </div>;
            })()}
          </div>
        </div>
      </AbsoluteFill>
      {/* a vignette holds the eye in the middle of the wide shots */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 80% at 50% 45%, transparent 58%, rgba(8,3,14,0.55) 100%)', opacity: (0.35 + 0.65 * night) * (s > 1.3 ? 0.6 : 1) }} />
      {/* the ending's calm: the busy wall goes soft and pale behind the last line */}
      {calm > 0.01 && <AbsoluteFill style={{ background: '#F7F0FB', opacity: calm * 0.62 }} />}
      {shot.bill && <BillTotal t={t} />}
      {/* WHY a full-width band, stronger than before (reviewer 2026-11-20): "for anyone who asks." lost contrast over
          bright moving screens; one even band under every headline keeps all four the same and always legible */}
      {headUp > 0 && <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(${bandC},0) 64%, rgba(${bandC},0.84) 75%, rgba(${bandC},0.9) 83%, rgba(${bandC},0.84) 91%, rgba(${bandC},0) 100%)`, opacity: headUp }} />}
      {HEADS.map((h) => <Line key={h.text} text={h.text} at={h.at} out={h.out} y={83} size={5.4} dark={h.at < Q.free} />)}
      {/* the end card dissolves in over the calm wall, after the headline has gone */}
      {t >= END_CARD && <AbsoluteFill style={{ opacity: ez(t, END_CARD, END_CARD + END_X, EASE_IN_OUT) }}>{card}</AbsoluteFill>}
    </AbsoluteFill>
  );
};

/** How much darker a screen sits for being lower down or further out than the TV's warm light reaches (0..~0.45).
 *  WHY (plan): far rows about a third dimmer, so the wall has depth and a subject instead of an even grid. */
const coolShade = (d: Dev) => cl(0.1 * (d.row - TV.row - 1)) + 0.38 * cl((Math.abs(d.cx) - 700) / 2400);
/** The warm key light on the TV (a broad pool on the wall and shelves around it, never a ball) and the cool fall-off
 *  over the shelves below and to the sides, in world px, under the devices. */
const RoomLight: React.FC<{ warm: number; night: number }> = ({ warm, night }) => (
  <>
    <div style={{ position: 'absolute', left: TV.cx - 1900, top: TV.cy - 1150, width: 3800, height: 2000, opacity: warm,
      background: 'radial-gradient(ellipse 50% 50% at 50% 46%, rgba(255,190,135,0.20) 0%, rgba(255,180,125,0.10) 38%, rgba(255,170,120,0) 72%)' }} />
    <div style={{ position: 'absolute', left: -4400, top: TV.shelf - 300, width: 8800, height: 3000, opacity: night,
      background: `radial-gradient(ellipse 48% 62% at 50% 0%, rgba(8,7,22,0) 30%, rgba(8,7,22,0.38) 75%, rgba(8,7,22,0.62) 100%)` }} />
  </>
);

/** Lavender opening outward from the person's phone at "free ourselves". */
const Daylight: React.FC<{ t: number; cx: number; cy: number }> = ({ t, cx, cy }) => {
  const p = ez(t, Q.freeWord, Q.freeWord + 0.95, EASE_IN_OUT);
  const r = p * 175;
  // WHY a wide soft edge and a quick open: a slow, hard-edged circle read as a glowing ball for a moment
  const mask = `radial-gradient(circle farthest-corner at ${cx}px ${cy}px, #000 ${Math.max(0, r - 55)}%, transparent ${r}%)`;
  return <AbsoluteFill style={{ background: 'linear-gradient(180deg,#FBF6FD 0%,#F7F0FB 45%,#EEDDF6 100%)', WebkitMaskImage: p >= 1 ? undefined : mask, maskImage: p >= 1 ? undefined : mask }} />;
};

/** The tablet's price tag: ticking up in line 2; in line 7 the price is struck through, turns to "free" and drops away. */
const TabletTag: React.FC<{ t: number; dim: number }> = ({ t, dim }) => {
  const up = [9.99, 11.99, 12.99, 14.99];
  const upI = Math.min(3, Math.floor(lin(t, Q.costWord + 0.08, Q.costWord + 0.75) * 3.999));
  const strike = t >= Q.costs ? ez(t, STRIKE, STRIKE + 0.2, EASE_IN_OUT) : 0;
  const isFree = t >= TT_FREE;
  const tagText = t < Q.costs ? `$${up[upI].toFixed(2)}` : isFree ? 'free' : '$14.99';
  return (
    // WHY dimmed with the wall: in the hush only the person's phone keeps its light
    <div style={{ position: 'absolute', left: 0, top: 0, filter: dim > 0.01 ? `brightness(${1 - 0.7 * dim})` : undefined }}>
      {/* WHY always drawn once dropped (plan): the tag hangs on this tablet in every wall shot until line 7. It lands
          swinging as "cost" is said (it takes 0.35 s to fall) and then ticks up. Hung at the tablet's left corner so it
          never covers the tablet's terms card. */}
      <PriceTag x={TT.cx - TT.w / 2 + 8} y={top(TT) - 6} t={t} drop={TAG_DROP} text={tagText} scale={0.85} strike={isFree ? 0 : strike} fall={lin(t, TT_FALL, TT_FALL + 0.55)} />
    </div>
  );
};

/** Things in the room that are not screens: their tag on the TV, and the cursor getting away down the wall. */
const WorldProps: React.FC<{ t: number; s: number }> = ({ t, s }) => {
  const c = cursorAt(t);
  // WHY never thinner than one screen pixel: at the landing the real caret is under a pixel wide in world terms
  const w = Math.max(c.w, 1.1 / s);
  return (
    <>
      {/* their treasure: the same cream tag as the tablet's, let down slowly on a long string from "believed", landing on
          "treasure" beside the cursor's line; on "far" it drops off and falls out of frame */}
      {t >= Q.believed && t < Q.far + 0.7 && <PriceTag x={TAG_X} y={TAG_Y} t={t} lower={Q.believed} drop={Q.treasure} len={TAG_LEN} text="$20/mo" scale={1} fall={lin(t, Q.far, Q.far + 0.6)} />}
      {/* the cursor, out in the room: the same cream as the real caret, landing on two shelf lips, then into the phone */}
      {t >= HOP0 && t < LAND && <div style={{ position: 'absolute', left: c.x - w / 2, top: c.y - c.h / 2 + c.h * c.sq * 0.12, width: w * (1 + c.sq * 0.3), height: c.h * (1 - c.sq * 0.12), borderRadius: Math.min(2, w / 2), background: CARET_COL,
        boxShadow: `0 ${c.h * 0.1}px ${c.h * 0.22}px rgba(6,2,12,0.5)` }} />}
    </>
  );
};
