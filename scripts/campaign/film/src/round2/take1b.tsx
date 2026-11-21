// Round two, take 1 variant B: "The same screen, everywhere."
// The idea: a wall of devices that all show the same screen, because five dark pointers (the few who decide)
// click for everyone: one click, every screen changes in the same frame. They lock things, price things and
// switch on "Share with partners". Then, full of themselves, they march down to one big screen and build their
// machine: a plain "AI" tile, which they put a price on and stamp onto every screen (round four: one standard
// pointer instead of five arrows; the invented ask bar is gone). In their excitement the tile's bar escapes as a text caret: it hops down the wall into one person's phone, which becomes
// the real youcoded app. That person asks for something of their own, gets it, and the change spreads until
// every screen is different: the real app in bold, different themes, and things people made in it.
// Every timing comes from the narrator's word times (take1b-cues.ts); nothing here is a typed second.
//
// Round-three pass (reviewer 2026-11-20): the wall is never shot the same way twice (low angle, overhead,
// dutch tilt, a lateral track with a foreground layer, a full pull-back), two frame-filling close-ups (a
// padlock macro, their price-tagged bar), deeper plum-black grade with near-white screens, real-size pointers
// that twitch in lockstep and are retired for good once the caret escapes, no to-do demo, no bills table,
// and no drawn copy of the app's own interface anywhere (real recorded frames instead).
import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { C, DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT, FPS } from '../brand';
import { EndCard, Line } from '../kit';
import { LAST_WORD_END, Q } from './take1b-cues';
import { AiTile, OwnScreen, PhoneAsk, SameScreen, SharedRecipe, TEXT_MID, TEXT_X, WALL_VARIETY, lookFor, tileCenter } from './take1b-screens';
import { Dev, Device, PointerArrow, Pointer, PriceTag, Shelves, WORLD, dev } from './take1b-world';
import { FreeTag, Receipt, SubStack } from './take1b-scenes';

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
// (1) the two synchronised clicks that rearrange every screen
const DICT = Q.dictated + 0.06, TECH = Q.technology1 + 0.06;
// (2) the padlocks and the terms
const LOCK0 = Q.could + 0.04;
const ACCEPT = Q.acceptedIt + 0.12;
// (5) their march, one shelf per stressed word, then the machine on the big screen
const MARCH = [Q.blinded, Q.ownHubris, Q.hubris, Q.these];
const POWER = Q.created1 + 0.05;                     // the big screen goes dark: something new is being made
const BAR_IN = Q.newKind;                            // their "ask…" bar grows up out of its bottom edge
const TURN = Q.intelligence;                         // every pointer turns to face it
const STAMP = Q.believed + 0.1;                      // they stamp it onto every screen
// "a great treasure: shareholder value": a price tag drops onto their bar on "shareholder" and lands on "value";
// then every screen's copy of the bar gets the same price, spreading out from the big screen as the camera pulls back
const TAG = Q.value - 0.33;
const PRICE_ALL = Q.value + 0.18;
// (6) excited clicking, then the caret slips away down the wall
const EXCITED = [Q.excitement + 0.05, Q.excitement + 0.45, Q.created2 + 0.05];
const HOP0 = Q.far + 0.16, HOP = 0.38, LAND = HOP0 + 3 * HOP;
const TYPE0 = Q.aTool + 0.15, TYPE1 = Q.monopolies1, SEND = TYPE1 + 0.25;
const MACRO = TYPE0 - 0.3;                           // the cut to the phone's message box
// the request, typed into the REAL phone's own message box (the box is a real capture, wiped clean of its
// placeholder by take1b-prep.py; the letters are set in the app's own font, size and colour at its own spot).
// WHY per-key times (owner: "the typing feels broken/laggy"): the old one swapped whole pictures word by word.
// Now each letter has its own moment, uneven like a real hand (seeded, so every render is identical): a little
// longer after a space, longer after a comma, the first and last keys never rushed. The last key lands on TYPE1.
const REQUEST = 'make me a page for my home';
const KEYS: number[] = (() => {
  let seed = 7;
  const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gaps: number[] = [];                          // gap after letter j (before letter j+1)
  for (let j = 0; j < REQUEST.length - 1; j++) {
    const c = REQUEST[j];
    gaps.push((0.72 + r() * 0.62) * (c === ' ' ? 1.55 : c === ',' ? 2.4 : 1) * (j === 0 ? 1.5 : 1));
  }
  const sum = gaps.reduce((a, g) => a + g, 0);
  let acc = 0;
  return REQUEST.split('').map((_, i) => { const k = TYPE0 + ((TYPE1 - TYPE0) * acc) / sum; acc += gaps[i] ?? 0; return k; });
})();
const charsAt = (t: number) => (t >= SEND ? 0 : KEYS.filter((k) => t >= k).length);
/** The caret stays solid while keys are going in, then blinks steadily, like a real text box. */
const typedCaret = (t: number) => {
  const last = [...KEYS].reverse().find((k) => t >= k) ?? TYPE0;
  const since = t - last;
  return since < 0.5 || Math.floor((since - 0.5) / 0.53) % 2 === 1;
};
// WHY the made thing arrives on "for anyone who asks" (reviewer): that is the line it proves
const FLIP_HERO = Q.forAnyone;
// (7) the lateral track along the shelves, then the three callbacks
const TRACK_X0 = -1700, TRACK_X1 = 1700;
const UNLOCK = Q.canDo + 0.1, LL_FLIP = Q.canDo + 0.45;
const STRIKE = Q.costsWord - 0.25, TT_FLIP = Q.costsWord - 0.05;
// (9) copies of the recipes arrive next door
const SHARE_AT = [Q.itsTime + 0.4, Q.itsTime + 0.8];
const SHARE_HOLD = Q.itsTime + 2.3;

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
if (WALL_VARIETY < 20) throw new Error(`take1b: the wall uses only ${WALL_VARIETY} different screens, needs 20`);
if (TAG < Q.shareholder - 0.05) throw new Error('take1b: the price would drop before "shareholder"');
if (MACRO < LAND + 0.3) throw new Error('take1b: the cut to the message box would come before the caret lands');
if (LAND > TYPE0 - 0.4) throw new Error('take1b: the caret would still be hopping when the request starts');
if (SEND + 0.35 > FLIP_HERO) throw new Error('take1b: the request would not have reached the phone before it changes');
if (SHARE_HOLD - SHARE_AT[1] < 1.2) throw new Error('take1b: the shared copies would not be held 1.2 s');
if (Q.costs - LL_FLIP < 1.2) throw new Error('take1b: the unlocked laptop would be up under 1.2 s');
if (Q.whatHappens - TT_FLIP < 1.1) throw new Error('take1b: the freed tablet would be up under 1.1 s');
for (let i = 1; i < MARCH.length; i++) if (MARCH[i] - MARCH[i - 1] < 0.25) throw new Error('take1b: two march steps would overlap');

// ---------- when each screen becomes someone's own ----------
const STORY = ['hero', 'lockLaptop', 'tagTablet', 'tv'];
const NEAR = WORLD.devs.filter((d) => !STORY.includes(d.id)).sort((a, b) => a.dist - b.dist);
const FIRST_FOLLOWERS = NEAR.slice(0, 3).map((d) => d.id);
const SHARE_TARGETS = ['tagTablet', L0.id];
// the devices the lateral track passes: they change as the camera reaches them
const TRACKED = (d: Dev) => d.row >= -1 && d.row <= 1 && Math.abs(d.cx) < 2300;
const flipAt = (d: Dev): number => {
  if (d.id === 'hero') return FLIP_HERO;
  if (d.id === 'lockLaptop') return LL_FLIP;
  if (d.id === 'tagTablet') return TT_FLIP;
  const fi = FIRST_FOLLOWERS.indexOf(d.id);
  if (fi >= 0) return Q.forAnyone + 0.5 + fi * 0.4;
  if (TRACKED(d) && d.id !== 'tv') {
    // WHY a beat before the frame's centre: the change happens just as each screen slides into the middle
    const p = ((d.cx - 260) - TRACK_X0) / (TRACK_X1 - TRACK_X0);
    return Math.max(Q.andSo + 0.05, Q.andSo + p * (Q.canDo - Q.andSo)) + jit(d) * 0.12;
  }
  // everything out of shot changes in a ripple over the same seconds, so the wide shots later are complete
  return Q.andSo + 0.25 + (d.dist / MAXD) * (Q.canDo - Q.andSo - 0.3) + jit(d) * 0.25;
};
const SAME_GLOW = 'rgba(236,230,244,1)';

// ---------- screen geometry the pointers and the caret aim at ----------
const HS = { x: HERO.cx - HERO.w / 2, y: top(HERO) };
// the real app's message box on the hero phone. WHY exact: the still is cut to the phone's own shape (1170x2442), so
// the box's words start at TEXT_X of 1170 across and TEXT_MID of 2442 down (take1b-screens.tsx)
const heroInput = { x: HS.x + (TEXT_X / 1170) * HERO.w, y: HS.y + (TEXT_MID / 2442) * HERO.h };
// the message box's middle, for the macro shot
const BOX_Y = heroInput.y;
const LL_TILE = (() => { const c = tileCenter(LL.w, LL.h, 2, 1); return { x: LL.cx - LL.w / 2 + c.x, y: top(LL) + c.y }; })();
const acceptBtn = (d: Dev) => { const k = Math.min(d.w, d.h) / 100; return { x: d.cx + 3 * k, y: d.cy + (d.h > d.w ? 12 : 9.4) * k }; };

// ---------- the camera: one framing per shot, eased inside the shot, cut between shots ----------
// [world x, world y at frame centre, scale, tilt back (deg, + looks up at the wall, - looks down on it), roll (deg)]
type Cam = [number, number, number, number?, number?];
type Scene = 'print' | 'rewind' | 'stack' | 'free';
type Shot = { at: number; keys: [number, Cam][]; focus?: string[]; scene?: Scene; linear?: boolean; rack?: [number, number, number] };
const TWO_X = (HERO.cx - HERO.w / 2 + TT.cx + TT.w / 2) / 2;          // the phone and the tablet, side by side
const TRIO_X = (L0.cx - L0.w / 2 + TT.cx + TT.w / 2) / 2;            // laptop, phone, tablet
const TRIO = ['0:l0', 'hero', 'tagTablet'];
// the laptop's tile row, for the padlock macro
const LL_GRID = (() => { const a = tileCenter(LL.w, LL.h, 2, 0), b = tileCenter(LL.w, LL.h, 2, 5); return { x: LL.cx - LL.w / 2 + (a.x + b.x) / 2, y: top(LL) + a.y }; })();
// their machine on the big screen: a square "AI" tile in the middle, TILE_S of the screen's height. Its second
// letter is a bare bar; that bar is the caret that escapes (the bar sits about 0.17 tiles right of centre)
const TILE_S = 0.5 * TV.h;
const BAR_Y = TV.cy;
const TV_CARET = { x: TV.cx + TILE_S * 0.165, y: TV.cy };
const FORM_Y = top(TV) + TV.h + 80;                  // where the five stand, just under the big screen
const SHOTS: Shot[] = [
  // (1) low angle on the whole wall, starting closer, tilted and out of focus; it settles as the five arrive
  // WHY (reviewer): the TV was cropped by the top edge and a 1 s heavy blur read as a loading error; lift the camera and rack only 3 px, done by 0.7 s
  { at: Q.start, keys: [[0, [0, -600, 0.8, 9, -3.5]], [1.4, [0, -650, 0.66, 4, 0]], [Q.interact, [0, -670, 0.62, 3, 0]]], rack: [0, 0.7, 3] },
  // "how you interact": two screens side by side, changed by the same click
  { at: Q.interact, keys: [[Q.interact, [TWO_X, hy + 40, 2.45]], [Q.decided, [TWO_X, hy + 40, 2.6]]], focus: ['hero', 'tagTablet'] },
  // (2) "what your computers could do": a macro on the laptop's tiles as the padlocks snap shut
  // WHY a wide beat first (reviewer): the macro used to start 1.25 s before the first lock; now the wall holds while "They decided what your"
  // is spoken and the pointer travels to the laptop, and the macro starts just before "could", lower and wider so the whole row reads
  { at: Q.decided, keys: [[Q.decided, [0, -300, 0.7, 2, 0]], [Q.could - 0.3, [LL.cx * 0.6, LL.cy - 60, 1.0, 1, 0]]] },
  { at: Q.could - 0.3, keys: [[Q.could - 0.3, [LL_GRID.x, LL_GRID.y - 40, 2.6]], [Q.cost, [LL_GRID.x + 20, LL_GRID.y - 40, 2.85]]], focus: ['lockLaptop'] },
  { at: Q.cost, keys: [[Q.cost, [TT.cx - 40, TT.cy - 60, 1.9]], [Q.data, [TT.cx - 40, TT.cy - 60, 2.05]]], focus: ['tagTablet'] },
  { at: Q.data, keys: [[Q.data, [0, 0, 1]]], scene: 'print' },
  // (3) "and we all... we all just accepted it": overhead, the same dialog everywhere; then three accepted in one click
  { at: Q.weAll, keys: [[Q.weAll, [0, -300, 0.55, -8, 0]], [Q.weAll2, [0, -420, 0.58, -11, 0]]] },
  { at: Q.weAll2, keys: [[Q.weAll2, [TRIO_X, hy - 30, 1.7]], [Q.weAccepted, [TRIO_X, hy - 30, 1.62]]], focus: TRIO },
  { at: Q.weAccepted, keys: [[Q.weAccepted, [0, 0, 1]]], scene: 'stack' },
  { at: CUT_PRIVACY, keys: [[CUT_PRIVACY, [0, 0, 1]]], scene: 'free' },
  // (4) "however, recently...": the wall dims and the camera finds one phone (kept as it was: it works)
  { at: Q.however, keys: [[Q.however, [0, -380, 0.5]], [Q.something, [0, -370, 0.6]], [Q.wonderful + 0.2, [0, hy + 30, 2.0]]], focus: ['hero'] },
  // (5) "blinded by their own hubris": low angle on the dark wall as the five march down it; one continuous
  // push from there into the big screen while they build their machine
  { at: Q.blinded, keys: [[Q.blinded, [0, -640, 0.5, 7, 0]], [Q.these, [TV.cx, -700, 0.56, 5, 0]], [Q.ai, [TV.cx, TV.cy + 130, 1.25, 1, 0]], [Q.aTechnology, [TV.cx, TV.cy + 170, 1.5, 0, 0]]] },
  // "a technology they believed...": close on the bar as the price goes on
  { at: Q.aTechnology, keys: [[Q.aTechnology, [TV.cx + 40, TV.cy + 175, 1.9]], [Q.believed, [TV.cx + 40, TV.cy + 175, 2.05]]], focus: ['tv'] },
  // "...would bring about": a dutch angle on the wall as it is stamped onto every screen
  { at: Q.believed, keys: [[Q.believed, [0, -480, 0.56, 0, 3]], [Q.great, [0, -470, 0.6, 0, 2]]] },
  // "a great treasure: shareholder value": close on the end of their bar; a price tag drops on "shareholder" and
  // lands on "value"; then the camera pulls back as the same price pops onto every screen's copy of the bar
  { at: Q.great, keys: [[Q.great, [TV.cx + 70, BAR_Y + 50, 2.05]], [Q.value, [TV.cx + 90, BAR_Y + 60, 2.25]], [Q.value + 0.12, [TV.cx + 90, BAR_Y + 60, 2.25]], [Q.but - 0.02, [TV.cx * 0.4, TV.cy + 260, 0.78]]], focus: ['tv'] },
  // (6) excitement at the big screen, then one continuous shot: the caret escapes, lands, and is asked
  { at: Q.but, keys: [[Q.but, [TV.cx, TV.cy + 170, 1.6]], [Q.far, [TV.cx, TV.cy + 170, 1.72]]], focus: ['tv'] },
  { at: Q.far, keys: [[Q.far, [0, -720, 0.72]], [LAND + 0.15, [0, -690, 0.75]], [MACRO, [HERO.cx, hy + 20, 1.9]]], focus: ['hero'] },
  // "a tool that can make software...": cut close on the phone's own message box; the request is typed into it,
  // word by word, then sent; the camera pulls back as it is sent (following it up to its bubble) and the answer is built
  { at: MACRO, keys: [[MACRO, [HERO.cx, BOX_Y - 20, 7.0]], [TYPE1, [HERO.cx, BOX_Y - 20, 7.5]], [SEND - 0.08, [HERO.cx, BOX_Y - 20, 7.55]], [FLIP_HERO, [HERO.cx, hy, 2.85]]], focus: ['hero'] },
  { at: FLIP_HERO, keys: [[FLIP_HERO, [HERO.cx, hy, 2.85]], [FLIP_HERO + 0.8, [0, hy + 60, 2.3]], [Q.andSo, [0, -200, 0.95]]], focus: ['hero', ...FIRST_FOLLOWERS] },
  // (7) "and so... we get to decide": a lateral track along the shelves; each screen turns its own as it passes
  { at: Q.andSo, keys: [[Q.andSo, [TRACK_X0, hy - 60, 1.05, 3, 0]], [Q.canDo, [TRACK_X1, hy - 60, 1.05, 3, 0]]], linear: true },
  { at: Q.canDo, keys: [[Q.canDo, [LL.cx, LL.cy + 10, 2.3]], [Q.costs, [LL.cx, LL.cy + 10, 2.42]]], focus: ['lockLaptop'] },
  { at: Q.costs, keys: [[Q.costs, [TT.cx - 40, TT.cy - 60, 1.9]], [Q.whatHappens, [TT.cx - 40, TT.cy - 60, 2.0]]], focus: ['tagTablet'] },
  { at: Q.whatHappens, keys: [[Q.whatHappens, [0, 0, 1]]], scene: 'rewind' },
  // (8) "free ourselves": low angle again, the whole wall flips to daylight (kept: the strongest colour moment)
  { at: Q.free, keys: [[Q.free, [0, -420, 0.62, 6, 0]], [Q.itsTime, [0, -410, 0.6, 2, 0]]] },
  // (9) close on the recipes being shared next door, then all the way back
  { at: Q.itsTime, keys: [[Q.itsTime, [TRIO_X, hy - 30, 1.7]], [SHARE_HOLD, [TRIO_X, hy - 40, 1.6]], [Q.open + 0.1, [0, -380, 0.52]], [END_FADE, [0, -400, 0.4]]], focus: TRIO },
];
const shotAt = (t: number) => { let s = SHOTS[0]; for (const x of SHOTS) if (t >= x.at) s = x; return s; };
const camAt = (t: number, s: Shot): [number, number, number, number, number] => {
  const k = s.keys;
  const full = (c: Cam): [number, number, number, number, number] => [c[0], c[1], c[2], c[3] ?? 0, c[4] ?? 0];
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

// ---------- the escaping caret ----------
const HOPS = [TV_CARET, { x: dev('-1:l1').cx, y: dev('-1:l1').cy }, { x: dev('-1:r0').cx, y: dev('-1:r0').cy }, heroInput];
const caretAt = (t: number) => {
  if (t <= HOP0) return { ...HOPS[0], h: 1 };
  if (t >= LAND) return { ...HOPS[3], h: 0 };
  const j = Math.min(2, Math.floor((t - HOP0) / HOP));
  // WHY 75% moving, 25% resting: the caret visibly lands on each screen before it jumps again
  const e = EASE_IN_OUT(lin(t, HOP0 + j * HOP, HOP0 + (j + 0.75) * HOP));
  const a = HOPS[j], b = HOPS[j + 1];
  return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) - Math.sin(Math.PI * e) * 190, h: j === 2 ? 1 - e : 1 };
};

// ---------- the five pointers ----------
// WHY an arc (owner: "the mouse pointers are kinda strange"): a hand never moves in a ruler-straight line. Every move
// bows a little to one side (most in the middle, none at the ends) and eases in and out, so the pointer glides.
const kf = (t: number, keys: [number, number, number][], e = EASE_IN_OUT): [number, number] => {
  if (t <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const p = e(lin(t, keys[i - 1][0], keys[i][0]));
    const dx = keys[i][1] - keys[i - 1][1], dy = keys[i][2] - keys[i - 1][2];
    const bow = Math.sin(Math.PI * p) * 0.1;
    return [lerp(keys[i - 1][1], keys[i][1], p) - dy * bow, lerp(keys[i - 1][2], keys[i][2], p) + dx * bow];
  }
  const l = keys[keys.length - 1]; return [l[1], l[2]];
};
// WHY one pointer (it was five): one hand that clicks for everyone reads as one outside power; five identical arrows
// reads as clip art. The row helper stays so the old stage positions still apply to the one that is left.
const ROW_Y = -1180, ROW_SP = 560;
const row = (i: number, X: number, Y: number, SP: number): [number, number] => [X + (i - 2) * SP, Y];
// a weighted step: falls in on an ease-in, overshoots for two frames, settles
const step = (t: number, at: number, d = 0.26) => {
  const p = lin(t, at, at + d);
  return p < 0.72 ? 1.07 * EASE_IN(p / 0.72) : 1.07 - 0.07 * EASE_IN_OUT((p - 0.72) / 0.28);
};
// WHY a shared two-frame twitch on the narrator's stressed words: their lockstep becomes something you feel
const TWITCH = [Q.dictated, Q.decided, Q.weAll2, Q.acceptedIt, Q.hubris, Q.believed];
const twitch = (t: number) => TWITCH.reduce((a, w) => Math.max(a, bump(t, w, 0.08)), 0);
// the angle that points an arrow's tip from (x,y) at a target. WHY +115.5: the drawn arrow points up-left by that much
const aim = (x: number, y: number, tx: number, ty: number) => Math.atan2(ty - y, tx - x) * 180 / Math.PI + 115.5;
// the order they fall away in, once they have lost the caret, so they never leave as one block
const FALL_ORDER = [2, 0, 4, 1, 3];

const pointers = (t: number): Pointer[] => {
  const out: Pointer[] = [];
  // WHY five again, but only for the opening (reviewer: one lone arrow cannot stand for "a small handful of corporations"):
  // five identical arrows land in a row on "handful" and click in lockstep on "dictated"; from "interact" only the middle one acts on
  for (const i of [0, 1, 2, 3, 4]) {
    let [x, y] = row(i, 0, ROW_Y, ROW_SP);
    if (i !== 2 && t >= Q.interact) continue;
    let press = 0, o = 1, rot = 0;
    if (t < Q.interact) {
      // (1) they arrive above the wall together, then click once: every screen rearranges in the same frame
      y = lerp(-2500, ROW_Y, ez(t, Q.handful - 0.1 + Math.abs(i - 2) * 0.05, Q.corporations + 0.45, EASE_OUT));
      press = bump(t, Q.dictated - 0.04);
      if (i !== 2) o = 1 - ez(t, Q.interact - 0.2, Q.interact, EASE_IN);
    } else if (t < Q.decided) {
      // "how you interact": two of them over two screens; same click, same result
      const tg: [number, number][] = [[0, 0], [0, 0], [TT.cx - TT.w * 0.28, TT.cy - TT.h * 0.05], [0, 0], [0, 0]];   // WHY the tablet (the bigger screen; the phone changes on the same click) and already in shot at the cut
      [x, y] = kf(t, [[Q.interact, HERO.cx + 150, HS.y - 150], [Q.technology1 - 0.14, tg[i][0], tg[i][1]]]);
      press = bump(t, Q.technology1 - 0.04);
    } else if (t < Q.cost) {
      // (2) "what your computers could do": one comes down onto a tile and clicks a padlock onto it
      if (i !== 2) o = 0;
      [x, y] = kf(t, [[Q.decided, LL_TILE.x - 900, LL_TILE.y - 700], [Q.could - 0.3, LL_TILE.x + 60, LL_TILE.y + 150], [Q.could - 0.1, LL_TILE.x, LL_TILE.y], [Q.cost - 0.45, LL_TILE.x, LL_TILE.y], [Q.cost, LL_TILE.x + 80, LL_TILE.y - 130]]);
      press = bump(t, Q.could - 0.04);
    } else if (t < Q.data) {
      // (2) "what it would cost": it hangs a price tag, and clicks again as the price ticks up
      if (i !== 2) o = 0;
      const an: [number, number] = [TT.cx + TT.w / 2 - 70, TT.cy + TT.h / 2 + 4];
      [x, y] = kf(t, [[Q.cost - 0.2, an[0] + 140, an[1] - 280], [Q.cost + 0.15, an[0], an[1]]]);
      press = bump(t, Q.cost + 0.15) + bump(t, Q.costWord + 0.05);
    } else if (t < Q.weAll) {
      o = 0;   // the receipt shot draws its own pointer
    } else if (t < Q.weAll2) {
      // (3) the same dialog pops on every screen; they wait above it
    } else if (t < Q.weAccepted) {
      // "accepted it": three of them press Accept on three screens in the same frame
      const ds = [L0, HERO, TT];
      // WHY no pointer here (reviewer): the pointer stands for "them"; here WE accepted, and every Accept dips by itself on the same beat
      if (false as boolean) {
        const b = acceptBtn(ds[i - 1]);
        [x, y] = kf(t, [[Q.weAll2, b.x + 60, b.y - 300], [ACCEPT - 0.12, b.x, b.y], [ACCEPT + 0.3, b.x, b.y], [Q.weAccepted, b.x + 20, b.y - 90]]);
        press = bump(t, ACCEPT - 0.04);
      } else o = 0;
    } else if (t < Q.blinded) {
      o = 0;   // the stack, the tag, and the hush of "something wonderful": they are not in these shots
    } else if (t < Q.aTechnology) {
      // (5) "blinded by their own hubris": they march down the wall in step, one shelf per stressed word,
      // and stop in a row under the big screen; on "intelligence" they all turn to face their machine
      const ys = [-2050, -1620, -1250, -1050, FORM_Y];
      let yy = ys[0];
      for (let k = 0; k < MARCH.length; k++) if (t >= MARCH[k]) yy = lerp(ys[k], ys[k + 1], Math.min(1.07, step(t, MARCH[k])));
      x = TV.cx + (i - 2) * 200; y = yy;
      press = bump(t, POWER - 0.04, 0.22) + bump(t, BAR_IN - 0.04, 0.22);
      // WHY a 4-degree wind-up before the turn: anticipation, so the turn has intent
      const turn = ez(t, TURN, TURN + 0.4, EASE_IN_OUT) - 0.12 * bump(t, TURN - 0.12, 0.16);
      rot = turn * aim(x, y, TV.cx, BAR_Y);
      y += Math.sin((t - Q.these) * 2.2) * 6 * lin(t, Q.these, Q.these + 0.6);   // one shared slow breath, never frozen
    } else if (t < Q.believed) {
      // close on the bar: they hold their formation, faced at it; one clicks as the price goes on
      x = TV.cx + (i - 2) * 200; y = FORM_Y + Math.sin((t - Q.these) * 2.2) * 6;
      rot = aim(x, y, TV.cx, BAR_Y);
      if (i === 2) press = bump(t, TAG - 0.04);
    } else if (t < Q.great) {
      // "...would bring about": back above the wall, they stamp it onto every screen in four lockstep clicks
      [x, y] = row(i, 0, ROW_Y + 60, ROW_SP);
      y = lerp(ROW_Y - 500, y, ez(t, Q.believed, Q.believed + 0.3, EASE_OUT));
      press = [0, 1, 2, 3].reduce((a, n) => Math.max(a, bump(t, STAMP + n * 0.42, 0.24)), 0);
    } else if (t < Q.but) {
      o = 0;
    } else if (t < Q.far + 0.001) {
      // (6) "in their excitement": quick synchronised clicks on the bar, each one making it bigger; then all at its caret
      const home: [number, number] = [TV.cx + (i - 2) * 200, FORM_Y];
      const gather = ez(t, EXCITED[2] + 0.2, Q.far - 0.04, EASE_IN_OUT);
      const pack = row(i, TV_CARET.x + 60, TV_CARET.y + 26, 110);
      x = lerp(home[0], pack[0], gather); y = lerp(home[1], pack[1] + Math.abs(i - 2) * 30, gather);
      rot = (1 - gather) * aim(home[0], home[1], TV.cx, BAR_Y);
      press = EXCITED.reduce((a, e) => Math.max(a, bump(t, e, 0.22)), 0);
      y -= 22 * EXCITED.reduce((a, e) => Math.max(a, bump(t, e - 0.12, 0.3)), 0);
    } else {
      // "far beyond their own control": they click the bar and the caret is not there. They stop dead where they
      // are and are gone. WHY no chase any more (reviewer 2026-11-20): five cursors swarming the wall after the
      // caret, then crowding the phone, read as clip art; the caret leaves alone, and the phone is left to its person.
      const pack = row(i, TV_CARET.x + 60, TV_CARET.y + 26, 110);
      [x, y] = [pack[0], pack[1] + Math.abs(i - 2) * 30];
      press = bump(t, HOP0 - 0.02, 0.22);
      o = 1 - ez(t, HOP0 + 0.2 + FALL_ORDER.indexOf(i) * 0.05, HOP0 + 0.55 + FALL_ORDER.indexOf(i) * 0.05, EASE_IN);
    }
    out.push({ x, y, press: Math.min(1, press), o, rot: 0 });   // never rotated: a real pointer always points up-left
  }
  return out;
};

// ---------- what each screen shows at time t ----------
const flipNode = (f: number, a: React.ReactNode, b: React.ReactNode, at = '50% 50%') => {
  if (f <= 0) return a;
  if (f >= 1) return b;
  // WHY a circle opening (from the centre, or from where the change came in): the change reads as arriving IN
  // the screen. The new screen is always already complete behind the circle, never an empty panel.
  return <>{a}<div style={{ position: 'absolute', inset: 0, clipPath: `circle(${EASE_OUT(f) * 150}% at ${at})` }}>{b}</div></>;
};
// WHY a 4-frame snap rather than a slide: blocks sliding past each other looked messy, and a snap reads as
// "one click, every screen, the same frame"
const layAt = (t: number) => ez(t, DICT, DICT + 0.05, EASE_IN_OUT) + ez(t, TECH, TECH + 0.05, EASE_IN_OUT);
// WHY 0.9 s (reviewer: it lingered 1.5 s over the title); SameScreen also hides the title while it is up
const bannerAt = (t: number) => (t >= DICT && t < DICT + 0.9 ? lin(t, DICT, DICT + 0.9) : t >= TECH && t < TECH + 0.9 ? lin(t, TECH, TECH + 0.9) : 0);
const LL_LOCK_ORDER = [1, 0, 2, 3, 4, 5];   // the laptop's padlocks land one tile after another, starting with the clicked one
const blink = (frame: number) => Math.floor(frame / 15) % 2 === 0;

/** Their machine, on the big screen: the screen goes dark and one plain "AI" tile pops up in the middle, and that is all
 *  it is. WHY so plain (owner 2026-11-20: the pill "ask" bar felt cheap and was an invented interface): it is theirs, not
 *  youcoded, and its whole point is the price they hang on it. The place you actually type is the real window's own box. */
const TVMachine: React.FC<{ w: number; h: number; t: number; frame: number }> = ({ w, h, t, frame }) => {
  const power = ez(t, POWER, POWER + 0.25);
  const pop = ez(t, BAR_IN, BAR_IN + 0.5, EASE_OUT);
  // in their excitement each click makes it bigger (with a little kick), never smaller
  const clicks = EXCITED.filter((e) => t >= e).length;
  const kick = EXCITED.reduce((a, e) => Math.max(a, bump(t, e, 0.2)), 0);
  const big = 1 + clicks * 0.07 + kick * 0.04;
  const sz = TILE_S * big * (0.5 + 0.5 * pop);
  // the white bar blinks like a caret until it lifts off the tile as the real purple one
  const barOn = t < HOP0 && blink(frame) ? 1 : 0;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#140C1D,#0C0713)', opacity: power, overflow: 'hidden' }}>
      {t >= BAR_IN && <div style={{ position: 'absolute', left: w / 2 - sz / 2, top: h / 2 - sz / 2, opacity: pop }}><AiTile s={sz} caret={barOn} /></div>}
    </div>
  );
};

const screenOf = (d: Dev, t: number, frame: number): { node: React.ReactNode; glow: string; lift: number } => {
  const look = lookFor(d);
  const fa = flipAt(d);
  const isHero = d.id === 'hero';
  const f = lin(t, fa, fa + (isHero ? 0.45 : 0.5));
  const lift = bump(t, fa, 0.7) * 0.9;
  const lockS = Q.could - 0.05 + (d.dist / MAXD) * 0.45 + jit(d) * 0.15;
  const lock: number | number[] = d.id === 'lockLaptop' ? LL_LOCK_ORDER.map((r) => lin(t, LOCK0 + r * 0.08, LOCK0 + r * 0.08 + 0.4)) : lin(t, lockS, lockS + 0.45);
  const aiAt = STAMP + Math.hypot(d.cx - TV.cx, d.cy - TV.cy) / 3800 * 1.3;
  // the price spreads out from the big screen, so it is seen arriving while the camera pulls back
  const priceAt = PRICE_ALL + Math.hypot(d.cx - TV.cx, d.cy - TV.cy) / 3800 * 0.5;
  const glimpse = isHero && t >= Q.something && t < Q.blinded ? { o: ez(t, Q.something + 0.1, Q.something + 0.5), caret: blink(frame), truly: ez(t, Q.truly, Q.truly + 0.4), dark: ez(t, Q.wonderful, Q.wonderful + 0.4) } : undefined;
  const same = (
    <SameScreen w={d.w} h={d.h} lay={layAt(t)} banner={bannerAt(t)}
      lock={lock} unlock={d.id === 'lockLaptop' ? lin(t, UNLOCK, UNLOCK + 0.4) : 0}
      dialog={lin(t, Q.weAll + 0.05 + jit(d) * 0.35, Q.weAll + 0.4 + jit(d) * 0.35)}
      accept={lin(t, ACCEPT, ACCEPT + 0.6)}
      ai={d.id === 'tv' ? 0 : lin(t, aiAt, aiAt + 0.25)} price={lin(t, priceAt, priceAt + 0.22)} glimpse={glimpse} />
  );
  if (isHero) {
    // the phone becomes the real app the moment the caret lands in it (opening from its message box); then the request
    // is typed into that box, and on "for anyone who asks" the page asked for arrives in the person's own look
    const atInput = `${((heroInput.x - HS.x) / HERO.w) * 100}% ${((heroInput.y - HS.y) / HERO.h) * 100}%`;
    const n = charsAt(t);
    // WHY the box blinks between two real pictures before the first key: the app's own caret, not a drawn one
    const idleOn = Math.floor((t - LAND) / 0.53) % 2 === 0;
    const real = <PhoneAsk w={d.w} h={d.h} text={REQUEST.slice(0, n)} typing={n > 0} caretOn={n > 0 ? typedCaret(t) : idleOn} />;
    const own = <OwnScreen look={look} w={d.w} h={d.h} />;
    const g = lin(t, LAND - 0.12, LAND + 0.3);
    const node = t < fa ? flipNode(g, same, real, atInput) : flipNode(f, real, own, atInput);
    const glow = t >= fa ? look.glow : g > 0.5 ? 'rgba(201,166,224,1)' : SAME_GLOW;
    return { node, glow, lift: t < fa ? bump(t, Q.something, 0.7) * 0.7 + bump(t, LAND, 0.5) * 0.6 : lift };
  }
  const own = <OwnScreen look={look} w={d.w} h={d.h} />;
  if (d.id === 'tv') {
    const before = t < POWER ? same : <TVMachine w={d.w} h={d.h} t={t} frame={frame} />;
    return { node: flipNode(f, before, own), glow: f > 0.5 ? look.glow : SAME_GLOW, lift };
  }
  let node = flipNode(f, same, own);
  // copies of the recipes arriving on the neighbours' screens: what one person makes, others can use
  const si = SHARE_TARGETS.indexOf(d.id);
  if (si >= 0 && t >= SHARE_AT[si]) {
    const k = Math.min(d.w, d.h) / 100;
    const e = ez(t, SHARE_AT[si], SHARE_AT[si] + 0.55, EASE_OUT);
    const cw = d.w * 0.5, ch = d.h * 0.8;
    const fromLeft = d.cx > HERO.cx;      // it slides in from the side that faces the phone it came from
    const x = fromLeft ? lerp(-cw - 10, d.w * 0.04, e) : lerp(d.w + 10, d.w * 0.96 - cw, e);
    node = <>{node}<div style={{ position: 'absolute', left: x, top: d.h * 0.06, transform: `rotate(${(1 - e) * (fromLeft ? -6 : 6)}deg)` }}><SharedRecipe w={cw} h={ch} k={k} /></div></>;
  }
  return { node, glow: f > 0.5 ? look.glow : SAME_GLOW, lift: lift + (si >= 0 ? bump(t, SHARE_AT[si], 0.6) * 0.6 : 0) };
};

// =====================================================================================================
export const Take1B: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const shot = shotAt(t);
  const [cx, cy, s, rx, rz] = camAt(t, shot);
  const night = 1 - ez(t, Q.freeWord, Q.freeWord + 1.2, EASE_IN_OUT);

  // WHY the card is passed an earlier start: it arrives already whole (reviewer: a faded URL first, then the
  // platforms, read as a half-loaded card); the short dissolve below is the only movement
  const card = <EndCard at={END_CARD - 0.75} />;
  if (t >= END_CARD + END_X) return (<AbsoluteFill><Audio src={staticFile('audio/voice-take1-lily.wav')} />{card}</AbsoluteFill>);

  const scene = shot.scene;
  const focus = new Set(shot.focus ?? []);
  // depth of field: in close-ups everything but the subject goes soft, like a real lens; the opening racks focus
  const rack = shot.rack ? shot.rack[2] * (1 - ez(t, shot.rack[0], shot.rack[1], EASE_IN_OUT)) : 0;
  const blur = (s > 1.6 ? Math.min(3.2, (s - 1.6) * 3) : 0) + rack / s;
  // WHY a wider cull when tilted: perspective shows more of the wall than the flat frame does
  const tilt = Math.abs(rx) + Math.abs(rz);
  const vw = 1920 / s * (1 + tilt * 0.04), vh = 1080 / s * (1 + tilt * 0.05);
  const visible = (d: Dev) => Math.abs(d.cx - cx) < vw / 2 + d.w && Math.abs(d.cy - cy) < vh / 2 + d.h;
  // WHY the wall hushes again while the request is typed: it echoes the "something wonderful" hush, the same lit
  // phone, now being asked, and keeps the eye on its message box
  const hush = t >= LAND && t < FLIP_HERO + 0.6 ? ez(t, LAND + 0.2, LAND + 0.9) * (1 - ez(t, FLIP_HERO + 0.05, FLIP_HERO + 0.6, EASE_IN_OUT)) : 0;

  const renderDev = (d: Dev) => {
    const sc = screenOf(d, t, frame);
    // WHY a ripple (reviewer: one flat dim over a still wall was no held breath): screens go out from the edges inward across "However, recently...",
    // the person's phone last
    const ripple = t >= Q.however && t < Q.blinded ? ez(t, Q.however + (1 - d.dist / MAXD) * 1.3, Q.however + (1 - d.dist / MAXD) * 1.3 + 0.35) : 0;
    const dd = Math.max(ripple, hush);
    const overlay = dd > 0 && d.id !== 'hero' ? <div style={{ position: 'absolute', inset: 0, background: '#0B0612', opacity: dd * 0.8 }} /> : null;
    return <Device key={d.id} d={d} night={night} glow={sc.glow} lift={sc.lift}>{sc.node}{overlay}</Device>;
  };

  const devs = WORLD.devs.filter(visible);
  const back = devs.filter((d) => !focus.has(d.id));
  const front = devs.filter((d) => focus.has(d.id));
  const ps = pointers(t);
  // WHY this size: about a third of a phone's height on the wall, a real cursor's proportion to a screen, but
  // still readable in the wide shots (the reviewer found the old ones taller than a phone, like clip art)
  // WHY bigger until "interact": the five who stand for "a small handful of corporations" must be seen at wall scale
  const psize = (68 / Math.pow(s, 0.45)) * (t < Q.interact ? 1.9 : 1);

  // headline readability: a soft wide band behind the lower third while a headline is up (darkening at night,
  // lightening by day), never a box
  const headUp = Math.max(0, ...HEADS.map((h) => Math.min(ez(t, h.at - 0.2, h.at + 0.3), 1 - ez(t, h.out - 0.35, h.out, EASE_IN))));
  const bandC = night > 0.5 ? '10,5,16' : '250,246,252';
  const calm = ez(t, CALM0, CALM0 + 0.7, EASE_IN_OUT);

  return (
    <AbsoluteFill style={{ background: C.night, overflow: 'hidden' }}>
      <Audio src={staticFile('audio/voice-take1-lily.wav')} />
      {scene === 'print' && <Receipt t={t} mode="print" />}
      {scene === 'rewind' && <Receipt t={t} mode="rewind" />}
      {scene === 'stack' && <SubStack t={t} />}
      {scene === 'free' && <FreeTag t={t} />}
      {!scene && <>
        {/* the room: plum-black (the reviewer found the old plum lifted and muddy), lit a little from above */}
        <AbsoluteFill style={{ background: 'linear-gradient(180deg,#1C1027 0%,#120A1B 55%,#0B0611 100%)' }} />
        {night < 1 && <Daylight t={t} cx={(HERO.cx - cx) * s + 960} cy={(HERO.cy - cy) * s + 540} />}
        <AbsoluteFill style={{ transform: tilt > 0.01 ? `perspective(1700px) rotateX(${rx}deg) rotateZ(${rz}deg)` : undefined, transformOrigin: '50% 50%', filter: calm > 0.01 ? `blur(${calm * 18}px)` : undefined }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: `translate(${960 - cx * s}px, ${540 - cy * s}px) scale(${s})`, transformOrigin: '0 0' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, filter: blur > 0.05 ? `blur(${blur}px)` : undefined }}>
              <div style={{ opacity: night }}><Shelves night={1} /></div>
              <div style={{ opacity: 1 - night }}><Shelves night={0} /></div>
              {back.map(renderDev)}
            </div>
            <div style={{ position: 'absolute', left: 0, top: 0, filter: rack > 0.05 ? `blur(${rack / s}px)` : undefined }}>
              {front.map(renderDev)}
              <WorldProps t={t} frame={frame} />
              {ps.map((p, i) => <PointerArrow key={i} p={p} size={psize} />)}
            </div>
          </div>
        </AbsoluteFill>
        {/* a vignette holds the eye in the middle of the wide shots */}
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 80% at 50% 45%, transparent 58%, rgba(8,3,14,0.55) 100%)', opacity: (0.35 + 0.65 * night) * (s > 1.3 ? 0.6 : 1) }} />
        {/* the ending's calm: the busy wall goes soft and pale behind the last line */}
        {calm > 0.01 && <AbsoluteFill style={{ background: '#F7F0FB', opacity: calm * 0.62 }} />}
      </>}
      {/* WHY a full-width band, stronger than before (reviewer 2026-11-20): "for anyone who asks." lost contrast over
          bright moving screens; one even band under every headline keeps all four the same and always legible */}
      {headUp > 0 && <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(${bandC},0) 64%, rgba(${bandC},0.84) 75%, rgba(${bandC},0.9) 83%, rgba(${bandC},0.84) 91%, rgba(${bandC},0) 100%)`, opacity: headUp }} />}
      {HEADS.map((h) => <Line key={h.text} text={h.text} at={h.at} out={h.out} y={83} size={5.4} dark={h.at < Q.free} />)}
      {/* the end card dissolves in over the calm wall, after the headline has gone */}
      {t >= END_CARD && <AbsoluteFill style={{ opacity: ez(t, END_CARD, END_CARD + END_X, EASE_IN_OUT) }}>{card}</AbsoluteFill>}
    </AbsoluteFill>
  );
};

/** Lavender opening outward from the person's phone at "free ourselves". */
const Daylight: React.FC<{ t: number; cx: number; cy: number }> = ({ t, cx, cy }) => {
  const p = ez(t, Q.freeWord, Q.freeWord + 0.95, EASE_IN_OUT);
  const r = p * 175;
  // WHY a wide soft edge and a quick open: a slow, hard-edged circle read as a glowing ball for a moment
  const mask = `radial-gradient(circle farthest-corner at ${cx}px ${cy}px, #000 ${Math.max(0, r - 55)}%, transparent ${r}%)`;
  return <AbsoluteFill style={{ background: 'linear-gradient(180deg,#FBF6FD 0%,#F7F0FB 45%,#EEDDF6 100%)', WebkitMaskImage: p >= 1 ? undefined : mask, maskImage: p >= 1 ? undefined : mask }} />;
};

/** Things that live in the world but are not screens: the price tags, the escaping caret, the typed request. */
const WorldProps: React.FC<{ t: number; frame: number }> = ({ t, frame }) => {
  // the tablet's price: ticking up in line 2; struck through and made free in line 7
  const up = [9.99, 11.99, 12.99, 14.99];
  const upI = Math.min(3, Math.floor(lin(t, Q.costWord, Q.costWord + 0.7) * 3.999));
  const strike = t >= Q.costs ? ez(t, STRIKE, STRIKE + 0.2, EASE_IN_OUT) : 0;
  const isFree = t >= TT_FLIP;
  const tagText = t < Q.costs ? `$${up[upI].toFixed(2)}` : isFree ? 'free' : '$14.99';
  const c = caretAt(t);
  const CH = 118;
  // their tile's price, hung on its top right corner on "technology"; it stays until the bar is left behind
  // WHY follow the bar's size: it grows with every excited click, and the tag must stay hung on its end
  const big = 1 + EXCITED.filter((e) => t >= e).length * 0.07;
  const barRight = TV.cx + (TILE_S * big) / 2 - 30;
  const barTop = TV.cy - (TILE_S * big) / 2 + 6;
  return (
    <>
      {(t < Q.data || t >= Q.costs) && <PriceTag x={TT.cx + TT.w / 2 - 70} y={TT.cy + TT.h / 2 + 4} sub={isFree ? undefined : 'per month'} t={t} drop={Q.cost + 0.15} text={tagText} strike={isFree ? 0 : strike} fall={lin(t, Q.costsWord + 0.45, Q.costsWord + 1.0)} />}
      {t >= TAG && t < LAND && <PriceTag x={barRight} y={barTop} t={t} drop={t >= Q.but ? Q.but - 1 : TAG} text="$20/mo" scale={0.95} />}
      {/* (6) the caret, out on its own: big enough to follow across the wall, shrinking into the phone's message box */}
      {t >= HOP0 && t < LAND && (() => {
        const h = Math.max(9, CH * c.h);
        // WHY a light rim: on both the dark room and the light screens the purple bar must stay unmistakable
        return <div style={{ position: 'absolute', left: c.x - h * 0.1, top: c.y - h / 2, width: Math.max(2.5, h * 0.2), height: h, borderRadius: h, background: C.purple, boxShadow: `0 0 0 ${Math.max(1.5, h * 0.05)}px #F3EAF9, 0 ${h * 0.12}px ${h * 0.25}px rgba(10,4,18,0.55)` }} />;
      })()}
    </>
  );
};
