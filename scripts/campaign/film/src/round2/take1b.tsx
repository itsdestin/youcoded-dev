// Round two, take 1 variant B: "The same screen, everywhere."
// The idea: a wall of devices that all show the same screen, because five dark pointers (the few who decide)
// click for everyone, in lockstep: one click, every screen changes in the same frame. They lock things,
// price things and switch on "Share with partners". Then, full of themselves, they march down to one big
// screen and build their machine: an "ask…" bar, which they put a price on and stamp onto every screen.
// In their excitement its text caret escapes: it hops down the wall into one person's phone, which becomes
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
import { OwnScreen, PHONE_EMPTY, RealApp, SameScreen, SharedRecipe, lookFor, tileCenter } from './take1b-screens';
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
const END_DIP = Math.max(LAST_WORD_END + 0.45, Q.open + 2.6);
const END_CARD = END_DIP + 0.3;
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
const TAG = Q.aTechWord + 0.05;                      // and they hang a price on it
const STAMP = Q.believed + 0.1;                      // then stamp it onto every screen
// (6) excited clicking, then the caret slips away down the wall
const EXCITED = [Q.excitement + 0.05, Q.excitement + 0.45, Q.created2 + 0.05];
const HOP0 = Q.far + 0.16, HOP = 0.38, LAND = HOP0 + 3 * HOP;
const TYPE0 = Q.aTool + 0.15, TYPE1 = Q.monopolies1, SEND = TYPE1 + 0.25;
const REQUEST = "can you put my grandma's recipes on here? big text, no ads pls";
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
  { text: 'something *wonderful happened.', at: Q.something, out: Q.blinded - 0.04 },
  { text: 'for *anyone who asks.', at: Q.forAnyone, out: Q.andSo - 0.04 },
  { text: 'open source *everything.', at: Q.open, out: END_DIP + 0.25 },
];
// WHY checks: the brand guide's muted-video rule (1.2 s + 0.25 s a word), and beats that need room. If the
// voice is re-timed and something would flash by, the render stops instead of shipping it.
for (const h of HEADS) {
  const words = h.text.split(/\s+/).length;
  if (h.out - h.at < 1.2 + 0.25 * words) throw new Error(`take1b: headline "${h.text}" is up ${(h.out - h.at).toFixed(2)} s, needs ${1.2 + 0.25 * words} s`);
}
if (END_CARD + 2.5 > 75) throw new Error('take1b: the end card would be held under 2.5 s');
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

// ---------- the camera: one framing per shot, eased inside the shot, cut between shots ----------
// [world x, world y at frame centre, scale, tilt back (deg, + looks up at the wall, - looks down on it), roll (deg)]
type Cam = [number, number, number, number?, number?];
type Scene = 'print' | 'rewind' | 'stack' | 'free' | 'bill';
type Shot = { at: number; keys: [number, Cam][]; focus?: string[]; scene?: Scene; linear?: boolean; rack?: [number, number, number]; fg?: boolean };
const TWO_X = (HERO.cx - HERO.w / 2 + TT.cx + TT.w / 2) / 2;          // the phone and the tablet, side by side
const TRIO_X = (L0.cx - L0.w / 2 + TT.cx + TT.w / 2) / 2;            // laptop, phone, tablet
const TRIO = ['0:l0', 'hero', 'tagTablet'];
// the laptop's tile row, for the padlock macro
const LL_GRID = (() => { const a = tileCenter(LL.w, LL.h, 2, 0), b = tileCenter(LL.w, LL.h, 2, 5); return { x: LL.cx - LL.w / 2 + (a.x + b.x) / 2, y: top(LL) + a.y }; })();
// their bar on the big screen, in fractions of the TV screen
const BAR = { x: 0.2, y: 0.78, w: 0.6, h: 0.12 };
const BAR_Y = top(TV) + (BAR.y + BAR.h / 2) * TV.h;
const TV_CARET = { x: TV.cx - TV.w / 2 + BAR.x * TV.w + 46, y: BAR_Y };
const FORM_Y = top(TV) + TV.h + 80;                  // where the five stand, just under the big screen
const SHOTS: Shot[] = [
  // (1) low angle on the whole wall, starting closer, tilted and out of focus; it settles as the five arrive
  { at: Q.start, keys: [[0, [0, -330, 0.8, 9, -3.5]], [1.4, [0, -400, 0.66, 4, 0]], [Q.interact, [0, -430, 0.62, 3, 0]]], rack: [0, 1.1, 9] },
  // "how you interact": two screens side by side, changed by the same click
  { at: Q.interact, keys: [[Q.interact, [TWO_X, hy - 10, 2.45]], [Q.decided, [TWO_X, hy - 10, 2.6]]], focus: ['hero', 'tagTablet'] },
  // (2) "what your computers could do": a macro on the laptop's tiles as the padlocks snap shut
  { at: Q.decided, keys: [[Q.decided, [LL_GRID.x, LL_GRID.y - 10, 3.5]], [Q.cost, [LL_GRID.x + 20, LL_GRID.y - 10, 3.85]]], focus: ['lockLaptop'] },
  { at: Q.cost, keys: [[Q.cost, [TT.cx - 40, TT.cy - 60, 1.9]], [Q.data, [TT.cx - 40, TT.cy - 60, 2.05]]], focus: ['tagTablet'] },
  { at: Q.data, keys: [[Q.data, [0, 0, 1]]], scene: 'print' },
  // (3) "and we all... we all just accepted it": overhead, the same dialog everywhere; then three accepted in one click
  { at: Q.weAll, keys: [[Q.weAll, [0, -300, 0.55, -14, 0]], [Q.weAll2, [0, -420, 0.58, -11, 0]]] },
  { at: Q.weAll2, keys: [[Q.weAll2, [TRIO_X, hy - 30, 1.7]], [Q.weAccepted, [TRIO_X, hy - 30, 1.62]]], focus: TRIO },
  { at: Q.weAccepted, keys: [[Q.weAccepted, [0, 0, 1]]], scene: 'stack' },
  { at: CUT_PRIVACY, keys: [[CUT_PRIVACY, [0, 0, 1]]], scene: 'free' },
  // (4) "however, recently...": the wall dims and the camera finds one phone (kept as it was: it works)
  { at: Q.however, keys: [[Q.however, [0, -380, 0.52]], [Q.recently + 0.3, [0, -370, 0.55]], [Q.wonderful + 0.2, [0, hy + 95, 2.3]]], focus: ['hero'] },
  // (5) "blinded by their own hubris": low angle on the dark wall as the five march down it; one continuous
  // push from there into the big screen while they build their machine
  { at: Q.blinded, keys: [[Q.blinded, [0, -640, 0.5, 7, 0]], [Q.these, [TV.cx, -700, 0.56, 5, 0]], [Q.ai, [TV.cx, TV.cy + 130, 1.25, 1, 0]], [Q.aTechnology, [TV.cx, TV.cy + 170, 1.5, 0, 0]]] },
  // "a technology they believed...": close on the bar as the price goes on
  { at: Q.aTechnology, keys: [[Q.aTechnology, [TV.cx + 40, TV.cy + 175, 1.9]], [Q.believed, [TV.cx + 40, TV.cy + 175, 2.05]]], focus: ['tv'] },
  // "...would bring about": a dutch angle on the wall as it is stamped onto every screen
  { at: Q.believed, keys: [[Q.believed, [0, -480, 0.56, 0, 3]], [Q.great, [0, -470, 0.6, 0, 2]]] },
  { at: Q.great, keys: [[Q.great, [0, 0, 1]]], scene: 'bill' },
  // (6) excitement at the big screen, then one continuous shot: the caret escapes, lands, and is asked
  { at: Q.but, keys: [[Q.but, [TV.cx, TV.cy + 170, 1.6]], [Q.far, [TV.cx, TV.cy + 170, 1.72]]], focus: ['tv'] },
  { at: Q.far, keys: [[Q.far, [0, -720, 0.72]], [LAND + 0.15, [0, -690, 0.75]], [Q.aTool + 0.45, [HERO.cx + 150, hy, 2.6]], [FLIP_HERO, [HERO.cx + 150, hy, 2.85]]], focus: ['hero'] },
  { at: FLIP_HERO, keys: [[FLIP_HERO, [HERO.cx + 150, hy, 2.85]], [FLIP_HERO + 0.8, [0, hy + 60, 2.3]], [Q.andSo, [0, -200, 0.95]]], focus: ['hero', ...FIRST_FOLLOWERS] },
  // (7) "and so... we get to decide": a lateral track along the shelves; each screen turns its own as it passes
  { at: Q.andSo, keys: [[Q.andSo, [TRACK_X0, hy - 60, 1.05, 3, 0]], [Q.canDo, [TRACK_X1, hy - 60, 1.05, 3, 0]]], linear: true, fg: true },
  { at: Q.canDo, keys: [[Q.canDo, [LL.cx, LL.cy + 10, 2.3]], [Q.costs, [LL.cx, LL.cy + 10, 2.42]]], focus: ['lockLaptop'] },
  { at: Q.costs, keys: [[Q.costs, [TT.cx - 40, TT.cy - 60, 1.9]], [Q.whatHappens, [TT.cx - 40, TT.cy - 60, 2.0]]], focus: ['tagTablet'] },
  { at: Q.whatHappens, keys: [[Q.whatHappens, [0, 0, 1]]], scene: 'rewind' },
  // (8) "free ourselves": low angle again, the whole wall flips to daylight (kept: the strongest colour moment)
  { at: Q.free, keys: [[Q.free, [0, -420, 0.62, 6, 0]], [Q.itsTime, [0, -410, 0.6, 2, 0]]] },
  // (9) close on the recipes being shared next door, then all the way back
  { at: Q.itsTime, keys: [[Q.itsTime, [TRIO_X, hy - 30, 1.7]], [SHARE_HOLD, [TRIO_X, hy - 40, 1.6]], [Q.open + 0.1, [0, -380, 0.52]], [END_DIP, [0, -400, 0.34]]], focus: TRIO },
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

// ---------- screen geometry the pointers and the caret aim at ----------
const HS = { x: HERO.cx - HERO.w / 2, y: top(HERO) };
// the real app's message box on the hero phone. WHY measured from the frame: the still (1170x2532) is scaled to
// cover the phone's width, so its "Message your assistant" line sits at 93.3% of the scaled height, minus the crop
const STILL_H = HERO.w * 2532 / 1170;
const heroInput = { x: HS.x + 0.17 * HERO.w, y: HS.y + 0.933 * STILL_H - (STILL_H - HERO.h) / 2 };
const LL_TILE = (() => { const c = tileCenter(LL.w, LL.h, 2, 1); return { x: LL.cx - LL.w / 2 + c.x, y: top(LL) + c.y }; })();
const acceptBtn = (d: Dev) => { const k = Math.min(d.w, d.h) / 100; return { x: d.cx + 3 * k, y: d.cy + (d.h > d.w ? 12 : 9.4) * k }; };

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
const kf = (t: number, keys: [number, number, number][], e = EASE_IN_OUT): [number, number] => {
  if (t <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const p = e(lin(t, keys[i - 1][0], keys[i][0]));
    return [lerp(keys[i - 1][1], keys[i][1], p), lerp(keys[i - 1][2], keys[i][2], p)];
  }
  const l = keys[keys.length - 1]; return [l[1], l[2]];
};
// WHY one formation function: the five move as a single body (same curve, same frame, no per-pointer wobble).
// That lockstep is what makes them read as one power rather than five people.
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
  for (let i = 0; i < 5; i++) {
    let [x, y] = row(i, 0, ROW_Y, ROW_SP);
    let press = 0, o = 1, rot = 0;
    if (t < Q.interact) {
      // (1) they arrive above the wall together, then click once: every screen rearranges in the same frame
      y = lerp(-2500, ROW_Y, ez(t, Q.handful, Q.corporations + 0.45, EASE_OUT));
      press = bump(t, Q.dictated - 0.04);
    } else if (t < Q.decided) {
      // "how you interact": two of them over two screens; same click, same result
      const tg: [number, number][] = [[-1600, -900], [HERO.cx + 6, HS.y + 64], [900, -1400], [TT.cx + 40, TT.cy - 44], [1700, -900]];
      [x, y] = kf(t, [[Q.interact, row(i, 0, ROW_Y, ROW_SP)[0], ROW_Y], [Q.technology1 - 0.14, tg[i][0], tg[i][1]]]);
      press = bump(t, Q.technology1 - 0.04);
    } else if (t < Q.cost) {
      // (2) "what your computers could do": one comes down onto a tile and clicks a padlock onto it
      if (i !== 2) o = 0;
      [x, y] = kf(t, [[Q.decided, LL_TILE.x + 90, LL_TILE.y - 160], [Q.could - 0.1, LL_TILE.x, LL_TILE.y], [Q.cost - 0.45, LL_TILE.x, LL_TILE.y], [Q.cost, LL_TILE.x + 80, LL_TILE.y - 130]]);
      press = bump(t, Q.could - 0.04);
    } else if (t < Q.data) {
      // (2) "what it would cost": it hangs a price tag, and clicks again as the price ticks up
      if (i !== 2) o = 0;
      const an: [number, number] = [TT.cx - TT.w / 2 + 70, top(TT) - 6];
      [x, y] = kf(t, [[Q.cost - 0.2, an[0] + 140, an[1] - 280], [Q.cost + 0.15, an[0], an[1]]]);
      press = bump(t, Q.cost + 0.15) + bump(t, Q.costWord + 0.05);
    } else if (t < Q.weAll) {
      o = 0;   // the receipt shot draws its own pointer
    } else if (t < Q.weAll2) {
      // (3) the same dialog pops on every screen; they wait above it
    } else if (t < Q.weAccepted) {
      // "accepted it": three of them press Accept on three screens in the same frame
      const ds = [L0, HERO, TT];
      if (i >= 1 && i <= 3) {
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
      // "far beyond their own control": they click the bar and the caret is not there; it hops down the wall a
      // beat ahead of them and lands in one phone. They stop dead above it, then drop away one by one, for good.
      const lag = 0.4;
      const c = caretAt(Math.max(HOP0 - 0.01, t - lag));
      const freeze = ez(t, LAND + lag, LAND + 0.6, EASE_OUT);
      const cx = lerp(c.x + 110, HERO.cx + 40, freeze), cy = lerp(c.y + 26, HS.y - 150, freeze);
      [x, y] = [cx + (i - 2) * 110, cy + Math.abs(i - 2) * 30];
      press = [0, 1, 2].reduce((a, j) => Math.max(a, bump(t, HOP0 + j * HOP + lag - 0.02, 0.22)), 0);
      // WHY each on its own spring: the lockstep breaks. The one power comes apart into five loose pieces.
      const f0 = LAND + 0.55 + FALL_ORDER.indexOf(i) * 0.11;
      const ft = Math.max(0, t - f0);
      if (ft > 0) {
        y += -26 * Math.sin(Math.min(1, ft / 0.14) * Math.PI) + 2600 * Math.pow(Math.max(0, ft - 0.07), 2);
        rot = (i - 2 || 1) * 70 * Math.min(1, ft / 0.6);
        x += (i - 2) * 60 * ft;
      }
      if (ft > 0.75) o = 0;
    }
    y -= 16 * twitch(t);
    out.push({ x, y, press: Math.min(1, press), o, rot });
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
const layAt = (t: number) => ez(t, DICT, DICT + 0.13, EASE_IN_OUT) + ez(t, TECH, TECH + 0.13, EASE_IN_OUT);
const bannerAt = (t: number) => (t >= DICT && t < DICT + 1.5 ? lin(t, DICT, DICT + 1.5) : t >= TECH && t < TECH + 1.5 ? lin(t, TECH, TECH + 1.5) : 0);
const LL_LOCK_ORDER = [1, 0, 2, 3, 4, 5];   // the laptop's padlocks land one tile after another, starting with the clicked one
const blink = (frame: number) => Math.floor(frame / 15) % 2 === 0;

/** Their machine, on the big screen: the screen goes dark, a bar grows up out of its bottom edge, and that is all
 *  it is: one place to ask. WHY so plain: it is theirs (not youcoded), and its whole point is the price they hang on it. */
const TVMachine: React.FC<{ w: number; h: number; t: number; frame: number }> = ({ w, h, t, frame }) => {
  const power = ez(t, POWER, POWER + 0.25);
  const grow = ez(t, BAR_IN, BAR_IN + 0.55, EASE_OUT);
  const rise = 1 - ez(t, BAR_IN, BAR_IN + 0.4, EASE_OUT);
  // in their excitement each click makes it bigger (with a little kick), never smaller
  const clicks = EXCITED.filter((e) => t >= e).length;
  const kick = EXCITED.reduce((a, e) => Math.max(a, bump(t, e, 0.2)), 0);
  const big = 1 + clicks * 0.07 + kick * 0.04;
  const bw = BAR.w * w * (0.12 + 0.88 * grow) * big, bh = BAR.h * h * big;
  const cx = w / 2, cy = (BAR.y + BAR.h / 2) * h + rise * h * 0.3;
  const label = ez(t, Q.technology2, Q.technology2 + 0.35);
  const light = ez(t, Q.ai, Q.intelligence + 0.4, EASE_IN_OUT);
  const caretOn = t < HOP0 && blink(frame);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0C0713', opacity: power, fontFamily: DMSANS, overflow: 'hidden' }}>
      {/* the bar lights the screen above it, a soft wash rising from below (not a glow ball) */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '75%', background: 'linear-gradient(0deg, rgba(243,234,249,0.24), rgba(243,234,249,0) 100%)', opacity: light * grow }} />
      {t >= BAR_IN && <div style={{ position: 'absolute', left: cx - bw / 2, top: cy - bh / 2, width: bw, height: bh, borderRadius: bh / 2, background: '#FBF9FC', boxSizing: 'border-box',
        boxShadow: `0 ${bh * 0.25}px ${bh * 0.6}px rgba(0,0,0,0.5)`, display: 'flex', alignItems: 'center', paddingLeft: bh * 0.62, fontSize: bh * 0.42, fontWeight: 500, color: C.tagGrey, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span style={{ display: 'inline-block', width: Math.max(3, bh * 0.06), height: bh * 0.5, borderRadius: 3, background: C.purple, opacity: caretOn ? 1 : 0, marginRight: bh * 0.1 }} />
        <span style={{ opacity: label }}>ask…</span>
      </div>}
    </div>
  );
};

/** The request, typed big beside the phone. WHY beside it and not drawn into it: the phone shows the real app,
 *  untouched, and a viewer must be able to read every word; in the frame the words are a graphic, like a caption. */
const RequestWords: React.FC<{ t: number; frame: number }> = ({ t, frame }) => {
  if (t < TYPE0 - 0.2 || t > SEND + 0.4) return null;
  const n = Math.round(lin(t, TYPE0, TYPE1) * REQUEST.length);
  const fly = ez(t, SEND, SEND + 0.35, EASE_IN);
  const x0 = HERO.cx + HERO.w / 2 + 34, y0 = HS.y + 54;
  const x = lerp(x0, heroInput.x, fly), y = lerp(y0, heroInput.y - 6, fly);
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 300, transform: `scale(${1 - 0.9 * fly})`, transformOrigin: '0 0', opacity: (1 - fly) * ez(t, TYPE0 - 0.2, TYPE0),
      fontFamily: DMSANS, fontWeight: 700, fontSize: 18.5, lineHeight: 1.18, letterSpacing: '-0.02em', color: C.nightText }}>
      {REQUEST.slice(0, n)}
      <span style={{ display: 'inline-block', width: 2.2, height: 20, marginLeft: 1.5, verticalAlign: '-0.2em', borderRadius: 2, background: C.purpleNight, opacity: (n > 0 && n < REQUEST.length) || blink(frame) ? 1 : 0 }} />
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
  const lock: number | number[] = d.id === 'lockLaptop' ? LL_LOCK_ORDER.map((r) => lin(t, LOCK0 + r * 0.11, LOCK0 + r * 0.11 + 0.45)) : lin(t, lockS, lockS + 0.45);
  const aiAt = STAMP + Math.hypot(d.cx - TV.cx, d.cy - TV.cy) / 3800 * 1.3;
  const glimpse = isHero && t >= Q.something && t < Q.blinded ? { o: ez(t, Q.something + 0.1, Q.something + 0.5), caret: blink(frame) } : undefined;
  const same = (
    <SameScreen w={d.w} h={d.h} lay={layAt(t)} banner={bannerAt(t)}
      lock={lock} unlock={d.id === 'lockLaptop' ? lin(t, UNLOCK, UNLOCK + 0.4) : 0}
      dialog={lin(t, Q.weAll + 0.05 + jit(d) * 0.35, Q.weAll + 0.4 + jit(d) * 0.35)}
      accept={lin(t, ACCEPT, ACCEPT + 0.6)}
      ai={d.id === 'tv' ? 0 : lin(t, aiAt, aiAt + 0.25)} glimpse={glimpse} />
  );
  if (isHero) {
    // the phone becomes the real app the moment the caret lands in it (opening from its message box), then,
    // on "for anyone who asks", the thing asked for: built piece by piece, but starting a quarter built
    const atInput = `${((heroInput.x - HS.x) / HERO.w) * 100}% ${((heroInput.y - HS.y) / HERO.h) * 100}%`;
    const real = <div style={{ position: 'absolute', inset: 0, background: '#F7F0FB' }}><RealApp src={PHONE_EMPTY} w={d.w} h={d.h} /></div>;
    const own = <OwnScreen look={look} w={d.w} h={d.h} p={0.25 + 0.75 * lin(t, fa, fa + 0.8)} />;
    const g = lin(t, LAND - 0.12, LAND + 0.3);
    const node = t < fa ? flipNode(g, same, real, atInput) : flipNode(f, real, own, atInput);
    const glow = t >= fa ? look.glow : g > 0.5 ? 'rgba(201,166,224,1)' : SAME_GLOW;
    return { node, glow, lift: t < fa ? bump(t, Q.something, 0.7) * 0.7 + bump(t, LAND, 0.5) * 0.6 : lift };
  }
  const own = <OwnScreen look={look} w={d.w} h={d.h} p={1} />;
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

  if (t >= END_CARD) return (<AbsoluteFill><Audio src={staticFile('audio/take1-mix.wav')} /><EndCard at={END_CARD} /></AbsoluteFill>);

  const scene = shot.scene;
  const focus = new Set(shot.focus ?? []);
  // depth of field: in close-ups everything but the subject goes soft, like a real lens; the opening racks focus
  const rack = shot.rack ? shot.rack[2] * (1 - ez(t, shot.rack[0], shot.rack[1], EASE_IN_OUT)) : 0;
  const blur = (s > 1.6 ? Math.min(3.2, (s - 1.6) * 3) : 0) + rack / s;
  // WHY a wider cull when tilted: perspective shows more of the wall than the flat frame does
  const tilt = Math.abs(rx) + Math.abs(rz);
  const vw = 1920 / s * (1 + tilt * 0.04), vh = 1080 / s * (1 + tilt * 0.05);
  const visible = (d: Dev) => Math.abs(d.cx - cx) < vw / 2 + d.w && Math.abs(d.cy - cy) < vh / 2 + d.h;
  const dim = t >= Q.however && t < Q.blinded ? ez(t, Q.however, Q.however + 0.9) : 0;
  // WHY the wall hushes again while the request is typed: the words sit beside the phone and must read cleanly,
  // and it echoes the "something wonderful" hush: the same lit phone, now being asked
  const hush = t >= LAND && t < FLIP_HERO + 0.6 ? ez(t, LAND + 0.2, LAND + 0.9) * (1 - ez(t, FLIP_HERO + 0.05, FLIP_HERO + 0.6, EASE_IN_OUT)) : 0;
  const dimAll = Math.max(dim, hush);

  const renderDev = (d: Dev) => {
    const sc = screenOf(d, t, frame);
    const overlay = dimAll > 0 && d.id !== 'hero' ? <div style={{ position: 'absolute', inset: 0, background: '#0B0612', opacity: dimAll * 0.8 }} /> : null;
    return <Device key={d.id} d={d} night={night} glow={sc.glow} lift={sc.lift}>{sc.node}{overlay}</Device>;
  };

  const devs = WORLD.devs.filter(visible);
  const back = devs.filter((d) => !focus.has(d.id));
  const front = devs.filter((d) => focus.has(d.id));
  const ps = pointers(t);
  // WHY this size: about a third of a phone's height on the wall, a real cursor's proportion to a screen, but
  // still readable in the wide shots (the reviewer found the old ones taller than a phone, like clip art)
  const psize = 80 / Math.pow(s, 0.45);

  // headline readability: a soft wide band behind the lower third while a headline is up (darkening at night,
  // lightening by day), never a box
  const headUp = Math.max(0, ...HEADS.map((h) => Math.min(ez(t, h.at - 0.2, h.at + 0.3), 1 - ez(t, h.out - 0.35, h.out, EASE_IN))));
  const bandC = night > 0.5 ? '10,5,16' : '250,246,252';

  return (
    <AbsoluteFill style={{ background: C.night, overflow: 'hidden' }}>
      <Audio src={staticFile('audio/take1-mix.wav')} />
      {scene === 'print' && <Receipt t={t} mode="print" />}
      {scene === 'rewind' && <Receipt t={t} mode="rewind" />}
      {scene === 'stack' && <SubStack t={t} />}
      {scene === 'bill' && <SubStack t={t} reprise />}
      {scene === 'free' && <FreeTag t={t} />}
      {!scene && <>
        {/* the room: plum-black (the reviewer found the old plum lifted and muddy), lit a little from above */}
        <AbsoluteFill style={{ background: 'linear-gradient(180deg,#1C1027 0%,#120A1B 55%,#0B0611 100%)' }} />
        {night < 1 && <Daylight t={t} cx={(HERO.cx - cx) * s + 960} cy={(HERO.cy - cy) * s + 540} />}
        <AbsoluteFill style={{ transform: tilt > 0.01 ? `perspective(1700px) rotateX(${rx}deg) rotateZ(${rz}deg)` : undefined, transformOrigin: '50% 50%' }}>
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
        {shot.fg && <Foreground camX={cx} s={s} />}
        {/* a vignette holds the eye in the middle of the wide shots */}
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 80% at 50% 45%, transparent 58%, rgba(8,3,14,0.55) 100%)', opacity: (0.35 + 0.65 * night) * (s > 1.3 ? 0.6 : 1) }} />
      </>}
      {headUp > 0 && <AbsoluteFill style={{ background: `radial-gradient(ellipse 72% 26% at 50% 83%, rgba(${bandC},0.82) 0%, rgba(${bandC},0.5) 50%, rgba(${bandC},0) 100%)`, opacity: headUp }} />}
      {HEADS.map((h) => <Line key={h.text} text={h.text} at={h.at} out={h.out} y={83} size={5.4} dark={h.at < Q.free} />)}
      {/* the dip to the end card */}
      {t > END_DIP - 0.01 && <AbsoluteFill style={{ background: C.lavender, opacity: ez(t, END_DIP, END_CARD, EASE_IN_OUT) }} />}
    </AbsoluteFill>
  );
};

/** Out-of-focus shelf uprights passing close to the lens in the tracking shot. WHY: a foreground layer moving
 *  faster than the wall is what makes a track read as a real camera in a real room, not a sliding picture. */
const Foreground: React.FC<{ camX: number; s: number }> = ({ camX, s }) => {
  const SP = 1300, off = ((camX * s * 1.9) % SP + SP) % SP;
  return (
    <AbsoluteFill style={{ filter: 'blur(16px)' }}>
      {[0, 1, 2].map((k) => <div key={k} style={{ position: 'absolute', top: -60, bottom: -60, left: k * SP - off + 200, width: 110, background: 'linear-gradient(90deg,#08040D,#1A1024 50%,#08040D)', opacity: 0.94 }} />)}
      <div style={{ position: 'absolute', left: -60, right: -60, bottom: -40, height: 110, background: 'linear-gradient(180deg,#24182F,#08040D)', opacity: 0.95 }} />
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
  // their bar's price, hung on its right end on "technology"; it stays until the bar is left behind
  // WHY follow the bar's size: it grows with every excited click, and the tag must stay hung on its end
  const big = 1 + EXCITED.filter((e) => t >= e).length * 0.07;
  const barRight = TV.cx + (BAR.w * TV.w * big) / 2 - 70;
  const barTop = BAR_Y - (BAR.h * TV.h * big) / 2 + 4;
  return (
    <>
      {(t < Q.data || t >= Q.costs) && <PriceTag x={TT.cx - TT.w / 2 + 70} y={top(TT) - 6} t={t} drop={Q.cost + 0.15} text={tagText} strike={isFree ? 0 : strike} fall={lin(t, Q.costsWord + 0.45, Q.costsWord + 1.0)} />}
      {t >= TAG && t < Q.great && <PriceTag x={barRight} y={barTop} t={t} drop={TAG} text="$20/mo" scale={0.95} />}
      {t >= Q.but && t < LAND && <PriceTag x={barRight} y={barTop} t={t} drop={Q.but - 1} text="$20/mo" scale={0.95} />}
      {/* (6) the caret, out on its own: big enough to follow across the wall, shrinking into the phone's message box */}
      {t >= HOP0 && t < LAND && (() => {
        const h = Math.max(9, CH * c.h);
        // WHY a light rim: on both the dark room and the light screens the purple bar must stay unmistakable
        return <div style={{ position: 'absolute', left: c.x - h * 0.1, top: c.y - h / 2, width: Math.max(2.5, h * 0.2), height: h, borderRadius: h, background: C.purple, boxShadow: `0 0 0 ${Math.max(1.5, h * 0.05)}px #F3EAF9, 0 ${h * 0.12}px ${h * 0.25}px rgba(10,4,18,0.55)` }} />;
      })()}
      <RequestWords t={t} frame={frame} />
    </>
  );
};
