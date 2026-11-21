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
import { AiTile, OwnScreen, PhoneAsk, RealApp, ShapeAsk, askKit, SameScreen, TEXT_MID, TEXT_X, WALL_VARIETY, lookFor, lookOf, tileCenter } from './take1b-screens';
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
const devTile = (d: Dev, lay: number, i: number) => { const c = tileCenter(d.w, d.h, lay, i); return { x: d.cx - d.w / 2 + c.x, y: top(d) + c.y }; };
// WHY five real targets (reviewer 2026-11-20: the five pointers sat on bezels and gaps, so they read as stray cursors): each of
// "a small handful of corporations" lands on a tile of a different screen across the wall; the one that stays (index 2) is
// on the tablet that the next shots follow. [world spot, tile index]; the nearest screen to the spot is the one aimed at.
const nearestDev = (x: number, y: number, skip: string[]) => [...WORLD.devs].filter((d) => !skip.includes(d.id)).sort((a, b) => Math.hypot(a.cx - x, a.cy - y) - Math.hypot(b.cx - x, b.cy - y))[0];
const OPEN_SPOTS: [number, number, number][] = [[-1050, -1100, 1], [-520, -560, 1], [0, 0, 1], [220, -1150, 3], [1000, -560, 1]];
const OPEN_T = OPEN_SPOTS.map(([x, y, k], i) => { const d = i === 2 ? TT : nearestDev(x, y, ['tv', 'lockLaptop', 'hero'].filter((id) => !(id === 'tv' && i === 3))); return devTile(d, 0, k); });
// they arrive one per spoken word of "a small handful of corporations" (index = which pointer)
const OPEN_AT = [Q.small, Q.decade, Q.corporations + 0.08, Q.handful, Q.corporations - 0.12];

// ---------- the timeline's derived moments ----------
const CUT_PRIVACY = Q.privacy + 0.1;                 // the "own nothing." headline has had its minimum hold by here
// (9) the ending. WHY this order (reviewer 2026-11-20): the wall goes soft and pale under "open source everything."
// so the words sit on a calm backdrop; the words leave completely; only then does the calm wall give way to the
// end card, already whole (never a ghost of the headline over the wall, never a half-built card).
// WHY later (reviewer): the finished wall used to be sharp for 0.3 s before it blurred; now it gets about a second
const CALM0 = Q.open - 0.1;   // WHY +0.5 (round 5 reviewer): the finished wall stays sharp for about a second before it goes soft
const END_FADE = Math.max(LAST_WORD_END + 0.2, Q.open + 2.3);    // the headline is gone by here
const END_CARD = END_FADE + 0.06, END_X = 0.3;                   // then a short dissolve to the end card
// (1) the two synchronised clicks that rearrange every screen
const DICT = Q.dictated + 0.06, TECH = Q.technology1 + 0.06;
// (2) the padlocks and the terms
const LOCK0 = Q.could + 0.04;
const ACCEPT = Q.acceptedIt + 0.12;
// WHY the laptop comes in 0.55 s after the click, not on "They" (reviewer: the phone-and-tablet pair sat still for 1.5 s): the pair is held about 0.9 s
const CUT_LL = Q.technology1 + 0.6;
const HOW0 = Q.however - 0.3;                      // WHY: the free* scene dissolves into the dim wall over the 0.3 s before "However" (no white flash)
// (5) their march, one shelf per stressed word, then the machine on the big screen
const MARCH = [Q.blinded, Q.ownHubris, Q.hubris, Q.these];
// WHY it goes dark only as "technology: artificial" is said (round 5 reviewer: two seconds of a dark empty screen): the generic app stays on it until the new thing is named
const POWER = Q.technology2 - 0.1;
// WHY the tile waits for "artificial" (round 5 reviewer: it sat there two seconds before the words): picture and word arrive together
const BAR_IN = Q.ai - 0.25;                            // their "ask…" bar grows up out of its bottom edge
const TURN = Q.intelligence;                         // every pointer turns to face it
// WHY the stamp starts the moment the machine is named a technology (round 6 reviewer: six seconds of one small tile): it spreads over the wall while the camera pulls back
const STAMP = Q.aTechnology + 0.3;                      // they stamp it onto every screen
// "a great treasure: shareholder value": a price tag drops onto their bar on "shareholder" and lands on "value";
// then every screen's copy of the bar gets the same price, spreading out from the big screen as the camera pulls back
const TAG = Q.value - 0.33;
const TAG_X = 130, TAG_Y = -90;                       // WHY (reviewer): the tag hangs off the tile's corner and no longer hides the "I" of AI
const PRICE_ALL = Q.value + 0.18;
// (6) excited clicking, then the caret slips away down the wall
// WHY on "But in", "their", "excite-ment" (round 5 reviewer: the clicks were not readable): three clicks, each a visible kick, the last one shaking the tile
const EXCITED = [Q.but + 0.1, Q.excitement - 0.22, Q.excitement + 0.28];
// WHY 0.55 s hops (round 5 reviewer BLOCKER: 0.38 s hops over a busy wall could not be followed): landings fall on "far" , "control" and the cut to the phone
// WHY round 6 (reviewer BLOCKER: the caret left a beat after the line): it slips out exactly as "control" is said, with quicker 0.4 s hops
const HOP0 = Q.control - 0.12, HOP = 0.4, LAND = HOP0 + 3 * HOP;
const CK = 2.4;   // WHY: the caret is 1.5x bigger than before while it travels, so the one saturated thing on a dimmed wall is easy to follow
// WHY 0.55 s earlier (reviewer): typing finishes sooner so the sent message sits in the chat before the page arrives
const TYPE0 = Math.max(Q.aTool + 0.15, LAND + 0.4), TYPE1 = Q.software + 0.9, SEND = TYPE1 + 0.25;
// WHY the push into the phone starts as the caret lands (round 5 reviewer): the caret is what carries you into the message box
const MACRO = LAND + 0.2;                           // the cut to the phone's message box
// the request, typed into the REAL phone's own message box (the box is a real capture, wiped clean of its
// placeholder by take1b-prep.py; the letters are set in the app's own font, size and colour at its own spot).
// WHY per-key times (owner: "the typing feels broken/laggy"): the old one swapped whole pictures word by word.
// Now each letter has its own moment, uneven like a real hand (seeded, so every render is identical): a little
// longer after a space, longer after a comma, the first and last keys never rushed. The last key lands on TYPE1.
// WHY "app" (round 5 reviewer: the words said software, the box said page); mono letters are wide, so it is short enough for one line
const REQUEST = 'make me a home app';
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
// WHY the page arrives 0.6 s after send, while "ever-scarce foundation" is said (reviewer: 1.2 s of nothing after the message was sent)
const FLIP_HERO = SEND + 0.6;
// (7) the lateral track along the shelves, then the three callbacks
const TRACK_X0 = -1700, TRACK_X1 = 1700;
// WHY earlier + three pages (reviewer): "what our computers can do" is shown as three different real pages snapping in
// WHY snapped onto the stressed words "computers / can / do" (round 5 reviewer), each page held at least 0.25 s
// WHY two more real asks (round 6 reviewer BLOCKER: a stranger never saw a second person ask): "we get to decide" is acted out on two more
// devices, each in its own real look. The laptop (Devil's Garden) is unlocked and asked for "a page to run my lights" while "decide" is
// said; the tablet (Halftone Dimension), whose price is struck on "costs", is asked for "a paint studio". Each shows the app's own message box, the
// request typed key by key, and the page that comes back.
const LL_IN = Q.decide - 0.6;                                   // the cut to the laptop
const UNLOCK = LL_IN + 0.1;
const LL_OPEN = UNLOCK + 0.35;                                  // the real window opens from its box
const LL_T0 = LL_OPEN + 0.3, LL_T1 = LL_T0 + 0.9;               // the request goes in
const LL_FLIP = LL_T1 + 0.25, LL_PAGE2 = Q.canWord - 0.04;      // the page it asked for, then one more made page
const TT_IN = LL_PAGE2 + 0.3;                                   // the cut to the tablet
const STRIKE = Q.costsWord - 0.25;
const TT_OPEN = TT_IN + 0.12;
const TT_T0 = TT_OPEN + 0.38, TT_T1 = TT_T0 + 0.75;
const TT_FLIP = TT_T1 + 0.25;
/** Per-key times for a typed sentence: uneven like a real hand (seeded: every render is identical), longer after a space. */
const mkKeys = (text: string, t0: number, t1: number, seed: number): number[] => {
  let sd = seed;
  const r = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  const gaps: number[] = [];
  for (let j = 0; j < text.length - 1; j++) gaps.push((0.72 + r() * 0.62) * (text[j] === ' ' ? 1.55 : 1));
  const sum = gaps.reduce((a, g) => a + g, 0);
  let acc = 0;
  return text.split('').map((_, i) => { const k = t0 + ((t1 - t0) * acc) / sum; acc += gaps[i] ?? 0; return k; });
};
const KIT_LL = askKit('devils-garden', 'laptop'), KIT_TT = askKit('halftone-dimension', 'tablet');
const KEYS_LL = mkKeys(KIT_LL.text, LL_T0, LL_T1, 11), KEYS_TT = mkKeys(KIT_TT.text, TT_T0, TT_T1, 5);
const ASK: Record<string, { kit: typeof KIT_LL; shape: 'laptop' | 'tablet'; keys: number[]; open: number; at: string; caret: string }> = {
  lockLaptop: { kit: KIT_LL, shape: 'laptop', keys: KEYS_LL, open: LL_OPEN, at: '13% 90%', caret: '#F6EDF2' },
  tagTablet: { kit: KIT_TT, shape: 'tablet', keys: KEYS_TT, open: TT_OPEN, at: '7% 91%', caret: '#F8E8F0' },
};
/** A steady caret while keys go in, then a regular blink: the same feel as the phone's. */
const caretFor = (keys: number[], t: number) => {
  const last = [...keys].reverse().find((k) => t >= k) ?? keys[0];
  const since = t - last;
  return since < 0.4 || Math.floor((since - 0.4) / 0.53) % 2 === 1;
};
const LL_PAGE3 = LL_PAGE2;   // WHY kept as an alias: only two made pages now; the third snap was cut to give the tablet its own beat
// (9) copies of the recipes arrive next door
// WHY the landings are on "long," and "long last" (round 5 reviewer: nothing connected the source to the copies): a card lifts off the phone and flies to each
const SHARE_AT = [Q.long1, Q.longLast], FLY = 0.5;
// WHY earlier (reviewer): the pull-back to the finished wall must arrive before the calm veil, so the payoff is seen sharp
const SHARE_HOLD = Q.open - 0.55;

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
if (MACRO < LAND + 0.2) throw new Error('take1b: the cut to the message box would come before the caret lands');
if (LAND > TYPE0 - 0.4) throw new Error('take1b: the caret would still be hopping when the request starts');
if (SEND + 0.35 > FLIP_HERO) throw new Error('take1b: the request would not have reached the phone before it changes');
if (SHARE_HOLD - SHARE_AT[1] < 0.6) throw new Error('take1b: the shared copies would not be held 0.6 s');
if (SHARE_AT[0] - FLY < Q.itsTime) throw new Error('take1b: the first shared card would leave before the shot starts');
if (LL_PAGE2 - LL_FLIP < 0.35) throw new Error('take1b: the laptop\'s asked-for page would be up under 0.35 s');
if (LL_IN < Q.andSo + 2) throw new Error('take1b: the laptop shot would start before the wall has turned');
if (Q.whatHappens - TT_FLIP < 0.5) throw new Error('take1b: the tablet\'s asked-for page would be up under 0.5 s');
if (TT_IN < LL_PAGE2 + 0.25) throw new Error('take1b: the second laptop page would be up under 0.25 s');
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
// WHY a chat then the paint page (round 5 reviewer: money and home pages are not app features; show what a person made)
const LL_PAGES = [lookOf('halftone-dimension-laptop-money.png')];
const HOME_STILL: Record<string, string> = { laptop: 'midnight-laptop-home.png', tablet: 'morning-rounds-tablet-home.png', phone: 'dark-phone-home.png', tv: 'light-tv-home.png', monitor: 'light-tv-home.png' };
const SAME_GLOW = 'rgba(236,230,244,1)';

// ---------- screen geometry the pointers and the caret aim at ----------
const HS = { x: HERO.cx - HERO.w / 2, y: top(HERO) };
// the real app's message box on the hero phone. WHY exact: the still is cut to the phone's own shape (1170x2442), so
// the box's words start at TEXT_X of 1170 across and TEXT_MID of 2442 down (take1b-screens.tsx)
const heroInput = { x: HS.x + (TEXT_X / 1170) * HERO.w, y: HS.y + (TEXT_MID / 2442) * HERO.h };
// the message box's middle, for the macro shot
const BOX_Y = heroInput.y;
const BOX_UP = 0.28 * 1080;   // WHY: lifts the camera so the message box sits 78% of the way down the frame (lower third)
// where the tablet's price tag is slapped on: its own lower-right corner
const TAG_PT = { x: TT.cx + TT.w / 2 - 105, y: TT.cy + TT.h / 2 - 34 };
const LL_TILE = (() => { const c = tileCenter(LL.w, LL.h, 2, 1); return { x: LL.cx - LL.w / 2 + c.x, y: top(LL) + c.y }; })();
const acceptBtn = (d: Dev) => { const k = Math.min(d.w, d.h) / 100; return { x: d.cx + 3 * k, y: d.cy + (d.h > d.w ? 12 : 9.4) * k }; };

// ---------- the camera: one framing per shot, eased inside the shot, cut between shots ----------
// [world x, world y at frame centre, scale, tilt back (deg, + looks up at the wall, - looks down on it), roll (deg)]
type Cam = [number, number, number, number?, number?];
type Scene = 'print' | 'rewind' | 'stack' | 'free';
type Shot = { at: number; keys: [number, Cam][]; focus?: string[]; scene?: Scene; linear?: boolean; out?: boolean; rack?: [number, number, number]; follow?: boolean };
const TWO_X = (HERO.cx - HERO.w / 2 + TT.cx + TT.w / 2) / 2;          // the phone and the tablet, side by side
const TRIO_X = (L0.cx - L0.w / 2 + TT.cx + TT.w / 2) / 2;            // laptop, phone, tablet
const TRIO = ['0:l0', 'hero', 'tagTablet'];
// the laptop's tile row, for the padlock macro
const LL_GRID = (() => { const a = tileCenter(LL.w, LL.h, 2, 0), b = tileCenter(LL.w, LL.h, 2, 5); return { x: LL.cx - LL.w / 2 + (a.x + b.x) / 2, y: top(LL) + a.y }; })();
// their machine on the big screen: a square "AI" tile in the middle, TILE_S of the screen's height. Its second
// letter is a bare bar; that bar is the caret that escapes (the bar sits about 0.17 tiles right of centre)
const TILE_S = 0.64 * TV.h;   // WHY 0.64 (was 0.5, round 6 reviewer: a small tile on a huge black TV): the tile fills most of the screen
const BAR_Y = TV.cy;
const TV_CARET = { x: TV.cx + TILE_S * 0.29, y: TV.cy };   // WHY 0.265: the bar now sits beside a whole "AI" (take1b-screens AiTile)
const FORM_Y = top(TV) + TV.h + 80;
const TILE_PT = { x: TV.cx + TILE_S * 0.2, y: TV.cy + TILE_S * 0.3 };   // a spot on the tile's lower right, where the pointer clicks                  // where the five stand, just under the big screen
const SHOTS: Shot[] = [
  // (1) the whole wall, TV complete, no blur, already at its settled size (reviewer 2026-11-20: a 1.6 s blurred drift said nothing);
  // five pointers land on it word by word; on "interact" one smooth push closes on the phone and tablet
  { at: Q.start, keys: [[0, [0, -790, 0.66, 2, 0]], [Q.interact, [0, -760, 0.62, 2, 0]], [Q.technology1 - 0.42, [TWO_X, hy + 40, 2.45]], [CUT_LL, [TWO_X, hy + 40, 2.6]]], focus: ['hero', 'tagTablet'] },
  // (2) "what your computers could do": a straight cut to the laptop (reviewer: the old pull-out to a wide and back in showed
  // cropped rows of tiles); the pointer is already in frame as it arrives, then the camera closes on the tiles as the padlocks snap shut
  { at: CUT_LL, keys: [[CUT_LL, [LL_GRID.x - 40, LL_GRID.y - 30, 1.5]], [Q.could - 0.3, [LL_GRID.x, LL_GRID.y - 40, 2.2]], [Q.cost, [LL_GRID.x + 20, LL_GRID.y - 40, 2.85]]], focus: ['lockLaptop'] },
  // "what it would cost": the tablet sits high in frame so its price tag has room below it
  { at: Q.cost, keys: [[Q.cost, [TT.cx, TT.cy + 25, 1.7]], [Q.data, [TT.cx, TT.cy + 25, 1.85]]], focus: ['tagTablet'] },
  { at: Q.data, keys: [[Q.data, [0, 0, 1]]], scene: 'print' },
  // (3) "and we all... we all just accepted it": overhead, the same dialog everywhere; then the trio, accepted from the middle outward
  { at: Q.weAll, keys: [[Q.weAll, [0, -300, 0.55, -8, 0]], [Q.weAll2 - 0.3, [0, -380, 0.6, -9, 0]]] },
  { at: Q.weAll2 - 0.3, keys: [[Q.weAll2 - 0.3, [TRIO_X, hy - 30, 1.5]], [Q.weAccepted, [TRIO_X, hy - 30, 1.8]]], focus: TRIO },
  { at: Q.weAccepted, keys: [[Q.weAccepted, [0, 0, 1]]], scene: 'stack' },
  { at: CUT_PRIVACY, keys: [[CUT_PRIVACY, [0, 0, 1]]], scene: 'free' },
  // (4) "however, recently...": the wall dims and the camera finds one phone (kept as it was: it works)
  // WHY a different, closer framing than the opening and a push that aims at the phone from the first frame (reviewer): the lit phone is
  // visible at phone size, and by "truly" it fills the middle of the frame; it stays high so the headline band never covers it
  { at: HOW0, keys: [[HOW0, [0, -300, 0.7, 0, 0]], [Q.recently, [0, hy - 60, 1.15]], [Q.truly, [0, hy + 20, 1.6]], [Q.wonderful + 0.5, [0, hy + 62, 2.3]]], focus: ['hero'] },
  // (5) "blinded by their own hubris": low angle on the dark wall as the five march down it; one continuous
  // push from there into the big screen while they build their machine
  // WHY the push starts straight away (reviewer): the old 3 s wide of a marching pointer said nothing; now the camera heads for the big screen from the first word
  // WHY (round 5 reviewer BLOCKER: the wide hold said nothing): on "Blinded" every screen flashes white like a flashbulb, the wide shot is
  // held only 0.6 s, and the camera heads for the big screen from "hubris" on, so the dive is under way long before "created"
  { at: Q.blinded, keys: [[Q.blinded, [TV.cx * 0.4, -640, 0.55, 7, 0]], [Q.ownHubris + 0.1, [TV.cx * 0.45, -620, 0.58, 6, 0]], [Q.these, [TV.cx * 0.9, -420, 0.85, 4, 0]], [Q.created1 + 0.3, [TV.cx, TV.cy + 190, 1.25, 1, 0]], [Q.ai, [TV.cx, TV.cy + 175, 1.4, 0, 0]], [Q.aTechnology, [TV.cx, TV.cy + 170, 1.5, 0, 0]]] },
  // WHY one continuous pull-out from the tile to the wide wall (round 5 reviewer: the camera went wide, tight, wide, tight in 4 s): the stamp, the price tag
  // and the price spreading all happen inside this one move; it eases out so the wall is wide while the badges are still spreading
  { at: Q.aTechnology, out: true, keys: [[Q.aTechnology, [TV.cx + 30, TV.cy + 170, 1.5, 0, 0]], [Q.but - 0.02, [TV.cx * 0.4, TV.cy + 260, 0.78, 0, 0]]], focus: ['tv'] },
  // (6) excitement at the big screen, then one continuous shot: the caret escapes, lands, and is asked
  { at: Q.but, keys: [[Q.but, [TV.cx * 0.4, TV.cy + 260, 0.78]], [Q.but + 0.9, [TV.cx, TV.cy + 190, 1.3]], [Q.far, [TV.cx, TV.cy + 170, 1.6]]], focus: ['tv'] },
  // WHY the camera follows the caret and then simply keeps going into the phone (round 5 reviewer): the caret is what takes you into the message box
  { at: Q.far, follow: true, keys: [[Q.far, [TV.cx, TV.cy + 120, 1.45]], [HOP0 + 0.1, [TV.cx, TV.cy + 120, 1.15]], [LAND, [HERO.cx, hy, 1.15]], [MACRO, [HERO.cx, hy + 20, 2.9]]], focus: ['hero'] },
  { at: MACRO, keys: [[MACRO, [HERO.cx, hy + 20, 2.9]], [TYPE0 + 0.5, [HERO.cx, BOX_Y - BOX_UP / 10.5, 10.5]], [SEND - 0.05, [HERO.cx, BOX_Y - BOX_UP / 10.7, 10.7]], [SEND + 0.65, [HERO.cx, hy + 8, 3.3]], [FLIP_HERO + 1.2, [HERO.cx, hy + 8, 3.05]]], focus: ['hero'] },
  // WHY the pull-back starts before the headline is done (round 5 reviewer: only three screens had changed when it ended): neighbours flip during "for anyone"
  { at: FLIP_HERO + 1.2, keys: [[FLIP_HERO + 1.2, [HERO.cx, hy + 8, 3.05]], [Q.forAnyone + 0.9, [HERO.cx, hy + 40, 2.2]], [Q.andSo, [0, -200, 0.95]]], focus: ['hero', ...FIRST_FOLLOWERS] },
  // (7) "and so... we get to decide": a lateral track along the shelves; each screen turns its own as it passes
  // WHY a wide pull-back first, then a track that eases to a stop on "decide" (reviewer): the change is seen spreading out from the phone, then the wall settles
  { at: Q.andSo, keys: [[Q.andSo, [0, -200, 0.95, 0, 0]], [Q.andSo + 1.1, [-300, -250, 0.62, 2, 0]], [Q.decide, [TRACK_X1 * 0.55, hy - 60, 1.05, 3, 0]], [Q.canDo, [TRACK_X1 * 0.62, hy - 60, 1.0, 3, 0]]] },
  // WHY two close shots, one per ask (round 6): the laptop is asked while "decide" is said, the tablet right after "do"
  // WHY the camera closes on the message box while the request goes in, then backs out to show the page (round 6: the typed words must be readable)
  { at: LL_IN, keys: [[LL_IN, [LL.cx, LL.cy + 10, 1.7]], [LL_OPEN + 0.15, [LL.cx - LL.w * 0.2, LL.cy + LL.h * 0.3, 3.4]], [LL_T1 + 0.1, [LL.cx - LL.w * 0.2, LL.cy + LL.h * 0.3, 3.5]], [LL_FLIP + 0.35, [LL.cx, LL.cy + 10, 2.0]], [TT_IN, [LL.cx, LL.cy + 10, 2.3]]], focus: ['lockLaptop'] },
  { at: TT_IN, keys: [[TT_IN, [TT.cx - 40, TT.cy - 20, 2.0]], [TT_OPEN + 0.2, [TT.cx - TT.w * 0.2, TT.cy + TT.h * 0.3, 3.4]], [TT_T1 + 0.1, [TT.cx - TT.w * 0.2, TT.cy + TT.h * 0.3, 3.5]], [TT_FLIP + 0.3, [TT.cx - 40, TT.cy - 20, 2.0]], [Q.whatHappens, [TT.cx - 40, TT.cy - 20, 2.1]]], focus: ['tagTablet'] },
  { at: Q.whatHappens, keys: [[Q.whatHappens, [0, 0, 1]]], scene: 'rewind' },
  // (8) "free ourselves": low angle again, the whole wall flips to daylight (kept: the strongest colour moment)
  // WHY a continuous push (reviewer: 3 s of an identical wall): the camera never stops, the devices lift in a ripple from the phone on "free"
  { at: Q.free, keys: [[Q.free, [0, -420, 0.62, 6, 0]], [Q.itsTime - 0.7, [TRIO_X * 0.5, -300, 0.95, 2, 0]], [Q.itsTime, [TRIO_X, hy - 30, 1.7, 0, 0]]] },
  // (9) close on the recipes being shared next door, then all the way back
  // WHY a slow push the whole time and a tighter last wall (round 5 reviewer: static trio; 40 unreadable screens): 6 to 8 whole devices read at the end
  { at: Q.itsTime, keys: [[Q.itsTime, [TRIO_X, hy - 30, 1.5]], [SHARE_HOLD, [TRIO_X, hy - 40, 1.9]], [Q.open + 0.35, [0, -390, 0.7]], [END_FADE, [0, -395, 0.75]]], focus: TRIO },
];
const shotAt = (t: number) => { let s = SHOTS[0]; for (const x of SHOTS) if (t >= x.at) s = x; return s; };
const camAt = (t: number, s: Shot): [number, number, number, number, number] => {
  if (s.follow && t >= HOP0 - 0.2 && t < LAND + 0.15) {
    // WHY: the camera rides the caret (lagging a hair behind it, so it feels held rather than glued) and hands back to the keys after it lands
    const base = camAtKeys(t, s), c = caretAt(Math.max(HOP0, t - 0.1));
    const w = ez(t, HOP0 - 0.2, HOP0 + 0.1, EASE_IN_OUT) * (1 - ez(t, LAND - 0.1, LAND + 0.15, EASE_IN_OUT));
    return [lerp(base[0], c.x, w), lerp(base[1], c.y + 40, w), base[2], 0, 0];
  }
  return camAtKeys(t, s);
};
const camAtKeys = (t: number, s: Shot): [number, number, number, number, number] => {
  const k = s.keys;
  const full = (c: Cam): [number, number, number, number, number] => [c[0], c[1], c[2], c[3] ?? 0, c[4] ?? 0];
  if (t <= k[0][0]) return full(k[0][1]);
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      // WHY linear for the track: a tracking shot runs at one speed; easing it would read as a lurch
      const p = s.linear ? lin(t, k[i - 1][0], k[i][0]) : (s.out ? EASE_OUT : EASE_IN_OUT)(lin(t, k[i - 1][0], k[i][0]));
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
    if (i !== 2 && t >= Q.interact + 0.35) continue;
    let press = 0, o = 1, rot = 0;
    if (t < Q.interact) {
      // (1) one lands per spoken word on a tile of its own screen (a small tap ring as it arrives), each on its own timing;
      // they act together only on the "dictated" click, when every screen rearranges in the same frame
      const { x: tx, y: ty } = OPEN_T[i], ta = OPEN_AT[i];
      [x, y] = kf(t, [[ta - 0.55, tx + 260, ty - 1350], [ta, tx, ty]]   /* WHY 1350 above: it starts well outside the frame, so nothing pops into view */, EASE_OUT);
      o = lin(t, ta - 0.56, ta - 0.5);
      press = Math.max(bump(t, ta - 0.02, 0.2) * 0.7, bump(t, Q.dictated - 0.04));
    } else if (t < CUT_LL) {
      // "how you interact": the other four slip away as the camera closes in; the tablet's own pointer clicks the second change
      if (i !== 2) { x = OPEN_T[i].x; y = OPEN_T[i].y; o = 1 - ez(t, Q.interact + 0.05, Q.interact + 0.35, EASE_IN); }
      else {
        const a0 = devTile(TT, 1, 1), a1 = devTile(TT, 1, 3);
        [x, y] = kf(t, [[Q.interact, OPEN_T[2].x, OPEN_T[2].y], [Q.interact + 0.5, a0.x, a0.y], [Q.technology1 - 0.14, a1.x, a1.y]]);
        press = bump(t, Q.technology1 - 0.04);
      }
    } else if (t < Q.cost) {
      // (2) "what your computers could do": it is already arriving at the cut, clicks a tile and then steps aside so the lock is not covered
      if (i !== 2) o = 0;
      [x, y] = kf(t, [[CUT_LL, LL_TILE.x - 520, LL_TILE.y - 330], [Q.could - 0.1, LL_TILE.x, LL_TILE.y], [Q.could + 0.25, LL_TILE.x + 20, LL_TILE.y + 4], [Q.could + 0.6, LL_TILE.x + 230, LL_TILE.y + 170]], EASE_OUT);
      press = bump(t, Q.could - 0.04);
    } else if (t < Q.data) {
      // (2) "what it would cost": it presses the tablet's corner and the tag is slapped on; then steps off it
      if (i !== 2) o = 0;
      [x, y] = kf(t, [[Q.cost, TAG_PT.x - 520, TAG_PT.y - 340], [Q.costWord - 0.05, TAG_PT.x - 20, TAG_PT.y - 8], [Q.costWord + 0.06, TAG_PT.x - 20, TAG_PT.y - 8], [Q.costWord + 0.45, TAG_PT.x - 270, TAG_PT.y - 220]], EASE_OUT);
      press = bump(t, Q.costWord - 0.05) ;
    } else if (t < Q.weAll) {
      o = 0;   // the receipt shot draws its own pointer
    } else if (t < Q.weAll2) {
      // (3) the same dialog pops on every screen; WHY no pointer (reviewer: a parked one over the first laptop read as a mistake): it is "we" here
      o = 0;
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
      // WHY they walk up onto the tile as they turn (round 6 reviewer: the pointer stood on the shelf below the TV and clicked nothing)
      const onto = ez(t, TURN, TURN + 0.5, EASE_IN_OUT);
      x = lerp(x, TILE_PT.x + (i - 2) * 70, onto); y = lerp(y, TILE_PT.y + Math.abs(i - 2) * 34, onto);
      if (i === 2) press = Math.max(press, bump(t, Q.intelligence + 0.45, 0.22));
    } else if (t < Q.aTechnology) {
      // close on the bar: they hold their formation, faced at it; one clicks as the price goes on
      // WHY on the tile (reviewer: the pointer clicked air under the TV): the one that clicks stands on the tile's lower corner, the rest crowd just behind it
      x = TILE_PT.x + (i - 2) * 70; y = TILE_PT.y + Math.abs(i - 2) * 34 + Math.sin((t - Q.these) * 2.2) * 4;
      if (i === 2) press = bump(t, TAG - 0.04);
    } else if (t < Q.great) {
      // "...would bring about": back above the wall, they stamp it onto every screen in four lockstep clicks
      [x, y] = row(i, 0, ROW_Y + 60, ROW_SP);
      y = lerp(ROW_Y - 500, y, ez(t, Q.aTechnology, Q.aTechnology + 0.3, EASE_OUT));
      press = [0, 1, 2, 3].reduce((a, n) => Math.max(a, bump(t, STAMP + n * 0.42, 0.24)), 0);
    } else if (t < Q.but) {
      o = 0;
    } else if (t < Q.far + 0.001) {
      // (6) "in their excitement": quick synchronised clicks on the bar, each one making it bigger; then all at its caret
      const home: [number, number] = [TILE_PT.x + (i - 2) * 70, TILE_PT.y + Math.abs(i - 2) * 34];   // WHY on the tile: the clicks that make it bigger land on it
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
const flipNode = (f: number, a: React.ReactNode, b: React.ReactNode, at = '50% 50%', mode: 'circle' | 'wake' | 'rise' = 'wake') => {
  if (f <= 0) return a;
  if (f >= 1) return b;
  const e = EASE_OUT(f);
  // WHY three kinds (reviewer: the same circular porthole on every screen looked like a stock transition):
  //  circle = only where the caret lands, growing from its box; wake = every other screen wakes from its bottom edge
  //  with a tiny settle; rise = the made page slides up into the phone as if it were built there. The new screen is
  //  always complete behind the reveal, never an empty panel.
  if (mode === 'circle') return <>{a}<div style={{ position: 'absolute', inset: 0, clipPath: `circle(${e * 150}% at ${at})` }}>{b}</div></>;
  if (mode === 'rise') return <>{a}<div style={{ position: 'absolute', inset: 0, transform: `translateY(${(1 - e) * 100}%)`, boxShadow: '0 -20px 40px rgba(10,4,18,0.3)' }}>{b}</div></>;
  return <>{a}<div style={{ position: 'absolute', inset: 0, clipPath: `inset(${(1 - e) * 100}% 0 0 0)` }}><div style={{ position: 'absolute', inset: 0, transform: `scale(${1 + 0.04 * (1 - e)})` }}>{b}</div></div></>;
};
// WHY a 4-frame snap rather than a slide: blocks sliding past each other looked messy, and a snap reads as
// "one click, every screen, the same frame"
const layAt = (t: number) => ez(t, DICT, DICT + 0.05, EASE_IN_OUT) + ez(t, TECH, TECH + 0.05, EASE_IN_OUT);
// WHY 0.9 s (reviewer: it lingered 1.5 s over the title); SameScreen also hides the title while it is up
// WHY only the close-up's click (reviewer: the dark toast was unreadable at wall scale): the wide shot shows the change as layout + colour, the close-up as one big pill
const bannerAt = (t: number) => (t >= TECH && t < TECH + 0.9 ? lin(t, TECH, TECH + 0.9) : 0);
const LL_LOCK_ORDER = [1, 0, 2, 3, 4, 5];   // the laptop's padlocks land one tile after another, starting with the clicked one
const blink = (frame: number) => Math.floor(frame / 15) % 2 === 0;

/** Their machine, on the big screen: the screen goes dark and one plain "AI" tile pops up in the middle, and that is all
 *  it is. WHY so plain (owner 2026-11-20: the pill "ask" bar felt cheap and was an invented interface): it is theirs, not
 *  youcoded, and its whole point is the price they hang on it. The place you actually type is the real window's own box. */
const TVMachine: React.FC<{ w: number; h: number; t: number; frame: number }> = ({ w, h, t, frame }) => {
  const power = ez(t, POWER, POWER + 0.4, EASE_IN_OUT);
  const pop = ez(t, BAR_IN, BAR_IN + 0.5, EASE_OUT);
  // in their excitement each click makes it bigger (with a little kick), never smaller
  const clicks = EXCITED.filter((e) => t >= e).length;
  const kick = EXCITED.reduce((a, e) => Math.max(a, bump(t, e, 0.2)), 0);
  // WHY 12% per click and a 7% two-frame-ish kick (round 5 reviewer: 7% was invisible on a tile that already fills the frame)
  const big = 1 + clicks * 0.12 + kick * 0.07;
  // WHY a shake on the third click and a proud little rise on "treasure": anticipation, then pride, so the long hold has things happening in it
  const shake = bump(t, EXCITED[2], 0.45) * Math.sin(t * 95) * 1.6;
  const rise = bump(t, Q.treasure - 0.05, 0.6);
  const sz = TILE_S * big * (0.5 + 0.5 * pop) * (1 + 0.07 * Math.sin(Math.PI * pop));   // WHY the overshoot: it settles with a little bounce
  // the white bar blinks like a caret until it lifts off the tile as the real purple one
  // WHY it stops 0.25 s early: the purple caret takes its place with a stretch before it jumps
  const barOn = t < HOP0 - 0.25 && blink(frame) ? 1 : 0;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#140C1D,#0C0713)', overflow: 'hidden' }}>
      {t >= BAR_IN && <div style={{ position: 'absolute', left: w / 2 - sz / 2, top: h / 2 - sz / 2, opacity: pop, transform: `translateY(${-rise * h * 0.035}px) rotate(${shake}deg) scale(${1 + 0.05 * rise})` }}><AiTile s={sz} caret={barOn} /></div>}
    </div>
  );
};

const screenOf = (d: Dev, t: number, frame: number): { node: React.ReactNode; glow: string; lift: number } => {
  const look = lookFor(d);
  const fa = flipAt(d);
  const isHero = d.id === 'hero';
  const f = lin(t, fa, fa + (isHero ? 0.8 : 0.5));
  // WHY every device lifts in a ripple out from the phone on "free" (reviewer: the thesis word was never acted out)
  const lift = bump(t, fa, 0.7) * 0.9 + bump(t, Q.freeWord + 0.05 + (d.dist / MAXD) * 0.9, 0.6) * 0.8;
  const lockS = Q.could - 0.05 + (d.dist / MAXD) * 0.45 + jit(d) * 0.15;
  const lock: number | number[] = d.id === 'lockLaptop' ? LL_LOCK_ORDER.map((r) => lin(t, LOCK0 + r * 0.08, LOCK0 + r * 0.08 + 0.4)) : lin(t, lockS, lockS + 0.45);
  const aiAt = STAMP + Math.hypot(d.cx - TV.cx, d.cy - TV.cy) / 3800 * 1.3;
  // the price spreads out from the big screen, so it is seen arriving while the camera pulls back
  const priceAt = PRICE_ALL + Math.hypot(d.cx - TV.cx, d.cy - TV.cy) / 3800 * 0.5;
  // WHY accept ripples out from the middle of the trio (reviewer: only three screens ever pressed Accept): nearer screens press first
  const acceptAt = ACCEPT + Math.min(1, Math.abs(d.cx - TRIO_X) / 1500) * 0.3;
  const same = (
    <SameScreen w={d.w} h={d.h} lay={layAt(t)} banner={bannerAt(t)}
      lock={lock} unlock={d.id === 'lockLaptop' ? lin(t, UNLOCK, UNLOCK + 0.4) : 0}
      dialog={lin(t, Q.weAll + 0.05 + jit(d) * 0.35, Q.weAll + 0.4 + jit(d) * 0.35)}
      accept={lin(t, acceptAt, acceptAt + 0.6)}
      ai={d.id === 'tv' ? 0 : lin(t, aiAt, aiAt + 0.25)} price={lin(t, priceAt, priceAt + 0.22)} />
  );
  if (isHero) {
    // the phone becomes the real app the moment the caret lands in it (opening from its message box); then the request
    // is typed into that box, and on "for anyone who asks" the page asked for arrives in the person's own look
    const atInput = `${((heroInput.x - HS.x) / HERO.w) * 100}% ${((heroInput.y - HS.y) / HERO.h) * 100}%`;
    const n = charsAt(t);
    // WHY the box blinks between two real pictures before the first key: the app's own caret, not a drawn one
    const idleOn = Math.floor((t - LAND) / 0.53) % 2 === 0;
    const real = <PhoneAsk w={d.w} h={d.h} text={REQUEST.slice(0, n)} typing={n > 0} caretOn={n > 0 ? typedCaret(t) : idleOn} sent={t >= SEND ? lin(t, SEND, SEND + 0.5) : 0} sentText={REQUEST} />;
    const own = <OwnScreen look={look} w={d.w} h={d.h} />;
    const g = lin(t, LAND - 0.12, LAND + 0.3);
    // WHY the real window from "something" on (reviewer BLOCKER: the turning point was a blank white phone with a drawn caret, the
    // app's own interface faked): it opens from its message box, quiet and dim, shows the app's own blinking caret (real captures),
    // and BRIGHTENS on "wonderful"; at "Blinded" the film cuts away to the wall, where this phone is the corporations' again
    const turn = t >= Q.something && t < Q.blinded;
    const waiting = <PhoneAsk w={d.w} h={d.h} text="" typing={false} caretOn={Math.floor((t - Q.something) / 0.53) % 2 === 1} />;
    const wake = <>{waiting}<div style={{ position: 'absolute', inset: 0, background: '#0B0612', opacity: 0.55 * (1 - ez(t, Q.wonderful, Q.wonderful + 0.45, EASE_OUT)) }} /></>;
    const node = turn ? flipNode(lin(t, Q.something, Q.something + 0.5), same, wake, '50% 92%', 'circle')
      : t < fa ? flipNode(g, same, real, atInput, 'circle') : flipNode(f, real, own, atInput, 'rise');
    const glow = t >= fa ? look.glow : turn || g > 0.5 ? 'rgba(201,166,224,1)' : SAME_GLOW;
    // a slow pulse on the ellipsis of "recently..." and a bigger lift on "wonderful"
    return { node, glow, lift: t < fa ? bump(t, Q.recently + 0.1, 0.9) * 0.4 + bump(t, Q.wonderful, 0.8) * 0.9 + bump(t, LAND, 0.5) * 0.6 : lift };
  }
  let own = <OwnScreen look={look} w={d.w} h={d.h} />;
  if (d.id === 'lockLaptop' && t >= LL_PAGE2) {
    // WHY a second real page snapped in on "can" (reviewer): one more made thing, in its own look, over 4 frames
    const pop = ez(t, LL_PAGE2, LL_PAGE2 + 0.13, EASE_OUT);
    own = <><OwnScreen look={look} w={d.w} h={d.h} /><div style={{ position: 'absolute', inset: 0, opacity: Math.min(1, pop * 3), transform: `scale(${1.05 - 0.05 * pop})` }}><OwnScreen look={LL_PAGES[0]} w={d.w} h={d.h} /></div></>;
  }
  if (d.id === 'tv') {
    // WHY a cross-fade (reviewer: a hard black pop): the bright screen dims out while the dark one with the tile comes up
    const before = t < POWER ? same : <><TVMachine w={d.w} h={d.h} t={t} frame={frame} />{t < POWER + 0.4 && <div style={{ position: 'absolute', inset: 0, opacity: 1 - ez(t, POWER, POWER + 0.4, EASE_IN_OUT) }}>{same}</div>}</>;
    return { node: flipNode(f, before, own), glow: f > 0.5 ? look.glow : SAME_GLOW, lift };
  }
  // WHY the real window between the locked screen and the page it asks for (round 6): the person's own message box, the typed request, then the answer
  let node: React.ReactNode;
  const ak = ASK[d.id];
  if (ak) {
    const n = ak.keys.filter((k) => t >= k).length;
    const caretOn = n > 0 ? caretFor(ak.keys, t) : Math.floor((t - ak.open) / 0.53) % 2 === 0;
    const ask = <ShapeAsk kit={ak.kit} shape={ak.shape} w={d.w} h={d.h} n={n} caretOn={caretOn} caretColor={ak.caret} />;
    node = flipNode(f, flipNode(lin(t, ak.open, ak.open + 0.3), same, ask, ak.at, 'circle'), own);
  } else node = flipNode(f, same, own);
  // copies of the recipes arriving on the neighbours' screens: what one person makes, others can use
  const si = SHARE_TARGETS.indexOf(d.id);
  // WHY the same real page, in the neighbour's own look (reviewer: a pasted cake card was clip art): what one person makes, another opens in their own theme
  if (si >= 0 && t >= SHARE_AT[si]) {
    const hl = lookOf(HOME_STILL[d.kind] ?? HOME_STILL.laptop);
    const pop = ez(t, SHARE_AT[si], SHARE_AT[si] + 0.14, EASE_OUT);
    node = <><OwnScreen look={look} w={d.w} h={d.h} /><div style={{ position: 'absolute', inset: 0, opacity: Math.min(1, pop * 3), transform: `scale(${1.05 - 0.05 * pop})` }}><OwnScreen look={hl} w={d.w} h={d.h} /></div></>;
  }
  return { node, glow: f > 0.5 ? look.glow : SAME_GLOW, lift: lift + (si >= 0 ? bump(t, SHARE_AT[si], 0.6) * 0.6 : 0) };
};

// =====================================================================================================
export const Take1B: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const shot = shotAt(t);
  const [cx, cy, s, rx, rz] = camAt(t, shot);
  const night = 1 - ez(t, Q.freeWord, Q.freeWord + 1.0, EASE_IN_OUT);

  // WHY the card is passed an earlier start: it arrives already whole (reviewer: a faded URL first, then the
  // platforms, read as a half-loaded card); the short dissolve below is the only movement
  // WHY a 2.5% settle over the first second (round 5 reviewer: three seconds with no movement at all): the card is alive, then holds
  const settleK = 1 + 0.025 * (1 - ez(t, END_CARD, END_CARD + 1.0, EASE_OUT));
  const card = <AbsoluteFill style={{ transform: `scale(${settleK})`, transformOrigin: '50% 50%' }}><EndCard at={END_CARD - 0.75} /></AbsoluteFill>;
  if (t >= END_CARD + END_X) return (<AbsoluteFill style={{ background: C.night }}><Audio src={staticFile('audio/voice-take1-lily.wav')} />{card}</AbsoluteFill>);

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
    // WHY it starts 0.3 s early and is held 0.8 s into "Blinded" (reviewer: bright-to-dim flash going in and dim-to-bright snap coming out):
    // the free* scene dissolves into a wall already going quiet, and the quiet fades out across the next shot instead of snapping
    const lit = t < Q.blinded + 1 ? ez(t, Q.wonderful, Q.wonderful + 0.5) : 0;
    const ripple = t >= HOW0 && t < Q.blinded + 0.9 ? ez(t, HOW0 + (1 - d.dist / MAXD) * 0.9, HOW0 + (1 - d.dist / MAXD) * 0.9 + 0.35) * (1 - ez(t, Q.blinded, Q.blinded + 0.9, EASE_IN_OUT)) : 0;
    // WHY a 50% veil already while the card dissolves away: the wall never shows up bright for a moment
    const dd = Math.max(ripple, hush, t >= HOW0 && t < Q.blinded + 0.9 ? 0.5 * ez(t, HOW0, Q.however) * (1 - ez(t, Q.blinded, Q.blinded + 0.9, EASE_IN_OUT)) : 0);
    const overlay = dd > 0 && d.id !== 'hero' ? <div style={{ position: 'absolute', inset: 0, background: '#0B0612', opacity: dd * (0.8 + 0.12 * lit) }} /> : null;
    // WHY a flashbulb on "Blinded" (round 5 reviewer BLOCKER: nothing on screen showed the word): every screen goes overexposed white for a beat, then settles back over "hubris"
    const flash = t >= Q.blinded - 0.02 && t < Q.blinded + 0.7 ? lin(t, Q.blinded - 0.02, Q.blinded + 0.05) * (1 - ez(t, Q.blinded + 0.1, Q.blinded + 0.7, EASE_OUT)) : 0;
    // WHY the wall dims by 35% while the caret travels (round 5 reviewer): the purple bar is then the only bright saturated thing in frame
    const travel = t >= HOP0 - 0.2 && t < LAND + 0.4 ? ez(t, HOP0 - 0.2, HOP0 + 0.1) * (1 - ez(t, LAND - 0.1, LAND + 0.4)) : 0;
    const dim = d.id !== 'hero' && travel > 0 ? <div style={{ position: 'absolute', inset: 0, background: '#0B0612', opacity: 0.35 * travel }} /> : null;
    const white = flash > 0 ? <div style={{ position: 'absolute', inset: 0, background: '#FFFBFF', opacity: 0.9 * flash }} /> : null;
    return <Device key={d.id} d={d} night={night} glow={sc.glow} lift={sc.lift}>{sc.node}{overlay}{dim}{white}</Device>;
  };

  // the warm light comes up on "wonderful" and is gone by the cut to the march
  const warm = ez(t, Q.wonderful, Q.wonderful + 0.5) * (1 - ez(t, Q.blinded - 0.1, Q.blinded + 0.5));
  const devs = WORLD.devs.filter(visible);
  const back = devs.filter((d) => !focus.has(d.id));
  const front = devs.filter((d) => focus.has(d.id));
  const ps = pointers(t);
  // WHY this size: about a third of a phone's height on the wall, a real cursor's proportion to a screen, but
  // still readable in the wide shots (the reviewer found the old ones taller than a phone, like clip art)
  // WHY bigger until "interact": the five who stand for "a small handful of corporations" must be seen at wall scale
  const psize = (68 / Math.pow(s, 0.45)) * (t < Q.interact + 0.35 ? 1.25 : 1) * (s < 1 ? 1.5 : 1);   // WHY 1.5x in wide shots (round 5 reviewer: the arrow was 6 px at phone width)   // WHY 1.25 (was 1.9): about a third smaller, so they read as cursors, not as clip art

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
        <AbsoluteFill style={{ transform: tilt > 0.01 ? `perspective(1700px) rotateX(${rx}deg) rotateZ(${rz}deg)` : undefined, transformOrigin: '50% 50%', filter: calm > 0.01 ? `blur(${calm * 11}px)` : undefined }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: `translate(${960 - cx * s}px, ${540 - cy * s}px) scale(${s})`, transformOrigin: '0 0' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, filter: blur > 0.05 ? `blur(${blur}px)` : undefined }}>
              <div style={{ opacity: night }}><Shelves night={1} /></div>
              <div style={{ opacity: 1 - night }}><Shelves night={0} /></div>
              {back.map(renderDev)}
            </div>
            <div style={{ position: 'absolute', left: 0, top: 0, filter: rack > 0.05 ? `blur(${rack / s}px)` : undefined }}>
              {/* WHY a wide, low warm wash behind the phone and above its dimmed neighbours (reviewer: "wonderful" showed nothing happening):
                  the light that the lit screen throws, spilling over the shelf and the screens beside it. Plain light, no orb: it is a
                  flat ellipse, soft, and it leaves with the shot */}
              {warm > 0.01 && <div style={{ position: 'absolute', left: HERO.cx - 1300, top: hy - 520, width: 2600, height: 1000, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(226,200,252,0.2), rgba(226,200,252,0.07) 60%, transparent)', opacity: warm }} />}
              {front.map(renderDev)}
              <WorldProps t={t} frame={frame} />
              {ps.map((p, i) => <PointerArrow key={i} p={p} size={psize} />)}
            </div>
          </div>
        </AbsoluteFill>
        {/* a vignette holds the eye in the middle of the wide shots */}
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 80% at 50% 45%, transparent 58%, rgba(8,3,14,0.55) 100%)', opacity: (0.35 + 0.65 * night) * (s > 1.3 ? 0.6 : 1) }} />
        {/* the ending's calm: the busy wall goes soft and pale behind the last line */}
        {calm > 0.01 && <AbsoluteFill style={{ background: '#F7F0FB', opacity: calm * 0.6 }} />}   {/* WHY 0.6 (round 5 reviewer): colour survives behind the last headline */}
        {/* WHY a 0.3 s dissolve out of the free* scene (reviewer: a bright flash exactly on "However, recently..."): the cream card fades
            away over the wall that is already going quiet */}
        {t >= HOW0 && t < Q.however && <AbsoluteFill style={{ opacity: 1 - ez(t, HOW0, Q.however, EASE_IN_OUT) }}><FreeTag t={t} /></AbsoluteFill>}
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

/** Daylight rising from the shelf's foot at "free ourselves". WHY a straight upward sweep with a wide soft edge (round 5 reviewer:
 *  the radial edge read as a glowing ball, a banned look): dawn simply climbs the wall. */
const Daylight: React.FC<{ t: number; cx: number; cy: number }> = ({ t }) => {
  const p = ez(t, Q.freeWord, Q.freeWord + 1.0, EASE_IN_OUT);
  const edge = p * 150;   // 0..150%: the soft edge is 45% tall, so it is fully past the top at the end
  const mask = `linear-gradient(0deg, #000 ${Math.max(0, edge - 45)}%, transparent ${edge}%)`;
  return <AbsoluteFill style={{ background: 'linear-gradient(180deg,#FBF6FD 0%,#F7F0FB 45%,#EEDDF6 100%)', WebkitMaskImage: p >= 1 ? undefined : mask, maskImage: p >= 1 ? undefined : mask }} />;
};

/** Things that live in the world but are not screens: the price tags, the escaping caret, the typed request. */
const WorldProps: React.FC<{ t: number; frame: number }> = ({ t, frame }) => {
  // the tablet's price: ticking up in line 2; struck through and made free in line 7
  const up = [9.99, 11.99, 12.99, 14.99];
  const upI = Math.min(3, Math.floor(lin(t, Q.costWord, Q.costWord + 0.7) * 3.999));
  const strike = t >= Q.costs ? ez(t, STRIKE, STRIKE + 0.2, EASE_IN_OUT) : 0;
  const isFree = t >= STRIKE + 0.2;   // WHY not the tablet's page change (round 6): the price turns free on "costs"; the page it asks for comes a little later
  const tagText = t < Q.costs ? `$${up[upI].toFixed(2)}` : isFree ? 'free' : '$14.99';
  const c = caretAt(t);
  const CH = 118;   // WHY about 280 px tall once stretched (x CK): big enough to follow at phone size
  // their tile's price, hung on its top right corner on "technology"; it stays until the bar is left behind
  // WHY follow the bar's size: it grows with every excited click, and the tag must stay hung on its end
  const big = 1 + EXCITED.filter((e) => t >= e).length * 0.12;
  const barRight = TV.cx + (TILE_S * big) / 2 - 30 + TAG_X;
  const barTop = TV.cy - (TILE_S * big) / 2 + 6 + TAG_Y;
  // WHY a card of the phone's own page that lifts off it and flies to each neighbour (round 5 reviewer BLOCKER: nothing showed a page
  // travelling): what one person makes, others can use. It is the phone's real capture, never redrawn; on landing the neighbour's own look takes over.
  const flights = SHARE_AT.map((land, i) => {
    const a = land - FLY;
    if (t < a || t > land + 0.12) return null;
    const dst = SHARE_TARGETS[i] === 'tagTablet' ? TT : L0;
    const p = EASE_IN_OUT(lin(t, a, land));
    const x = lerp(HERO.cx, dst.cx, p), y = lerp(HERO.cy, dst.cy, p) - Math.sin(Math.PI * p) * 230;
    const sc = lerp(1.08, Math.min(dst.w / HERO.w, dst.h / HERO.h) * 0.9, p);   // shrinks toward the size of the screen it lands on
    return <div key={i} style={{ position: 'absolute', left: x - HERO.w / 2, top: y - HERO.h / 2, width: HERO.w, height: HERO.h, transform: `scale(${sc})`, borderRadius: 10, overflow: 'hidden',
      opacity: 1 - lin(t, land - 0.04, land + 0.12), boxShadow: '0 30px 50px rgba(8,3,14,0.45)' }}>
      <RealApp src={lookFor(HERO).still} w={HERO.w} h={HERO.h} />
    </div>;
  });
  return (
    <>
      {flights}
      {(t < Q.data || t >= Q.costs) && <PriceTag slap x={TAG_PT.x} y={TAG_PT.y} sub={isFree ? undefined : 'per month'} t={t} drop={Q.costWord} text={tagText} strike={isFree ? 0 : strike} fall={lin(t, Q.costsWord + 0.45, Q.costsWord + 1.0)} />}
      {t >= TAG && t < LAND && <PriceTag x={barRight} y={barTop} t={t} drop={t >= Q.but ? Q.but - 1 : TAG} text="$20/mo" scale={0.95} />}
      {/* (6) the caret, out on its own: big enough to follow across the wall, shrinking into the phone's message box */}
      {t >= HOP0 - 0.25 && t < LAND && (() => {
        // WHY it stretches out of the tile first (reviewer: no anticipation): a short squash then a tall stretch on the way out
        const pre = lin(t, HOP0 - 0.25, HOP0);
        const base = pre < 1 ? lerp(TILE_S * 0.4 * big, CH * CK, EASE_IN_OUT(pre)) * (1 - 0.12 * Math.sin(Math.PI * Math.min(1, pre * 1.6))) : CH * CK * c.h;
        const bar = (x: number, y: number, hh: number, o: number) => {
          const h = Math.max(10, hh);
          // WHY a light rim: on both the dark room and the light screens the purple bar must stay unmistakable
          return <div key={o + '' + x} style={{ position: 'absolute', left: x - h * 0.065, top: y - h / 2, width: Math.max(3, h * 0.13), height: h, borderRadius: h, opacity: o, background: C.purple,
            boxShadow: o < 1 ? 'none' : `0 0 0 ${Math.max(2, h * 0.04)}px #F3EAF9, 0 ${h * 0.12}px ${h * 0.25}px rgba(10,4,18,0.55)` }} />;
        };
        // WHY a short smear behind it (no particles): three fading copies from slightly earlier moments make it read as fast motion
        const ghosts = t >= HOP0 ? [0.045, 0.09, 0.135].map((dt, gi) => { const g = caretAt(Math.max(HOP0, t - dt)); return bar(g.x, g.y, CH * CK * g.h * 0.92, 0.3 - gi * 0.09); }) : [];
        return <>{ghosts}{bar(c.x, c.y, base, 1)}</>;
      })()}
    </>
  );
};
