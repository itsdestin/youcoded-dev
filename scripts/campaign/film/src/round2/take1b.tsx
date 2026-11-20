// Round two, take 1 variant B: "The same screen, everywhere."
// The idea: a wall of devices that all show the same screen, because five dark pointers (the few who decide)
// click for everyone, in lockstep: one click, every screen changes in the same frame. They lock things,
// price things and switch on "Share with partners". Then they build a machine that makes software when you
// type to it, and, in their excitement, lose its text caret: it hops down the wall into one person's phone.
// That person asks for something of their own, gets it, and the change spreads until every screen is
// different, each one with the same little ask bar at the bottom (one app, asked into a different shape).
// Every timing comes from the narrator's word times (take1b-cues.ts); nothing here is a typed second.
import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { C, DMSANS, EASE_IN, EASE_IN_OUT, EASE_OUT, FPS } from '../brand';
import { EndCard, Line } from '../kit';
import { LAST_WORD_END, Q } from './take1b-cues';
import { APP_BG, OwnScreen, SameScreen, SharedRecipe, askRect, tileCenter } from './take1b-screens';
import { Dev, Device, PointerArrow, Pointer, PriceTag, Shelves, WORLD, dev } from './take1b-world';
import { Bills, FreeTag, Receipt, SubStack } from './take1b-scenes';

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
// (5) the machine they build on the big screen
const HUBRIS = Q.hubris + 0.02;
// WHY typing starts on "these corporations": the open window must not sit empty for long (the first cut's blank screen)
const TV_CLICK_IN = Q.these + 0.15;
const TV_TYPE0 = TV_CLICK_IN + 0.2, TV_TYPE1 = Q.technology2 + 0.1, TV_SEND = TV_TYPE1 + 0.14;
const TV_REPLY = Q.ai - 0.25;      // the made thing starts building on "artificial"
const TV_ASK = 'make me a to-do list';
// (6) excited clicking, then the caret slips away down the wall
const EXCITED = [Q.excitement + 0.05, Q.excitement + 0.45, Q.excitement + 0.85];
const LAST_CLICK = Q.far + 0.08;
const HOP0 = Q.far + 0.16, HOP = 0.38, LAND = HOP0 + 3 * HOP;
const TYPE0 = Q.aTool + 0.05, TYPE1 = Q.scarce - 0.12;
const REQUEST = "can you put my grandma's recipes on here? big text, no ads pls";
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
if (LAND > Q.aTool - 0.4) throw new Error('take1b: the caret would still be hopping when the request starts');
if (SHARE_HOLD - SHARE_AT[1] < 1.2) throw new Error('take1b: the shared copies would not be held 1.2 s');

// ---------- when each screen becomes someone's own ----------
const NEAR = WORLD.devs.filter((d) => !['hero', 'lockLaptop', 'tagTablet', 'tv'].includes(d.id)).sort((a, b) => a.dist - b.dist);
const FIRST_FOLLOWERS = NEAR.slice(0, 3).map((d) => d.id);
const SHARE_TARGETS = ['tagTablet', L0.id];
const FLIP_HERO = Q.scarce + 0.35;   // WHY +0.35: the typed request stays whole on screen for a beat before it turns into the thing asked for
const flipAt = (d: Dev): number => {
  if (d.id === 'hero') return FLIP_HERO;
  if (d.id === 'lockLaptop') return Q.canDo + 0.85;
  if (d.id === 'tagTablet') return Q.costs + 0.85;
  const fi = FIRST_FOLLOWERS.indexOf(d.id);
  if (fi >= 0) return Q.forAnyone + 0.45 + fi * 0.55;
  // the ripple: outward from the hero across the whole wall, finishing as "we get to decide" lands
  return Q.andSo + 0.25 + (d.dist / MAXD) * (Q.decide - Q.andSo + 0.2) + jit(d) * 0.25;
};
const SAME_GLOW = 'rgba(222,214,234,1)';
const glowOf = (app: number) => { const c = APP_BG[app]; const n = parseInt(c.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},1)`; };

// ---------- the camera: one framing per shot, eased inside the shot, cut between shots ----------
type Cam = [number, number, number];                 // world x, world y at frame centre, scale
type Scene = 'print' | 'rewind' | 'stack' | 'free' | 'bill' | 'bills';
type Shot = { at: number; keys: [number, Cam][]; focus?: string[]; scene?: Scene };
const TWO_X = (HERO.cx - HERO.w / 2 + TT.cx + TT.w / 2) / 2;          // the phone and the tablet, side by side
const TRIO_X = (L0.cx - L0.w / 2 + TT.cx + TT.w / 2) / 2;            // laptop, phone, tablet
const TRIO = ['0:l0', 'hero', 'tagTablet'];
const WIDE: Cam = [0, -420, 0.6];
const SHOTS: Shot[] = [
  // (1) from one phone out to the whole wall; the five arrive; one click changes every screen
  { at: Q.start, keys: [[0, [0, hy, 3.3]], [0.2, [0, hy, 3.25]], [2.3, WIDE], [Q.interact, [0, -430, 0.63]]], focus: ['hero'] },
  // "how you interact": two screens side by side, changed by the same click
  { at: Q.interact, keys: [[Q.interact, [TWO_X, hy - 10, 2.45]], [Q.decided, [TWO_X, hy - 10, 2.6]]], focus: ['hero', 'tagTablet'] },
  // (2) "what your computers could do": padlocks, one tile after another
  { at: Q.decided, keys: [[Q.decided, [LL.cx, LL.cy + 10, 2.25]], [Q.cost, [LL.cx, LL.cy + 10, 2.45]]], focus: ['lockLaptop'] },
  { at: Q.cost, keys: [[Q.cost, [TT.cx - 40, TT.cy - 60, 1.9]], [Q.data, [TT.cx - 40, TT.cy - 60, 2.05]]], focus: ['tagTablet'] },
  { at: Q.data, keys: [[Q.data, [0, 0, 1]]], scene: 'print' },
  // (3) "and we all... we all just accepted it": the same dialog everywhere, then three accepted in one click
  { at: Q.weAll, keys: [[Q.weAll, [0, -380, 0.52]], [Q.weAll2, [0, -380, 0.56]]] },
  { at: Q.weAll2, keys: [[Q.weAll2, [TRIO_X, hy - 30, 1.7]], [Q.weAccepted, [TRIO_X, hy - 30, 1.62]]], focus: TRIO },
  { at: Q.weAccepted, keys: [[Q.weAccepted, [0, 0, 1]]], scene: 'stack' },
  { at: CUT_PRIVACY, keys: [[CUT_PRIVACY, [0, 0, 1]]], scene: 'free' },
  // (4) "however, recently...": the wall dims and the camera finds one phone, where an ask bar appears
  { at: Q.however, keys: [[Q.however, [0, -380, 0.52]], [Q.recently + 0.3, [0, -370, 0.55]], [Q.wonderful + 0.2, [0, hy + 95, 2.3]]], focus: ['hero'] },
  // (5) the big screen: their machine
  { at: Q.blinded, keys: [[Q.blinded, [TV.cx, TV.cy + 30, 1.45]], [Q.aTechnology, [TV.cx, TV.cy + 30, 1.56]]], focus: ['tv'] },
  { at: Q.aTechnology, keys: [[Q.aTechnology, [0, -430, 0.6]], [Q.great, [0, -430, 0.64]]] },
  { at: Q.great, keys: [[Q.great, [0, 0, 1]]], scene: 'bill' },
  { at: Q.shareholder, keys: [[Q.shareholder, [0, 0, 1]]], scene: 'bills' },
  // (6) excitement on the big screen, then one continuous shot: the caret escapes, lands, and is asked
  { at: Q.but, keys: [[Q.but, [TV.cx, TV.cy + 30, 1.45]], [Q.far, [TV.cx, TV.cy + 30, 1.53]]], focus: ['tv'] },
  { at: Q.far, keys: [[Q.far, [0, -720, 0.72]], [LAND + 0.15, [0, -690, 0.75]], [Q.aTool + 0.3, [0, hy, 2.9]], [Q.scarce, [0, hy, 2.95]], [Q.forAnyone, [0, hy + 70, 2.3]]], focus: ['hero'] },
  { at: Q.forAnyone, keys: [[Q.forAnyone, [0, hy + 70, 2.3]], [Q.andSo, [0, -200, 0.95]]] },
  // (7) "we get to decide": the ripple, then the three callbacks, each in its own frame
  { at: Q.andSo, keys: [[Q.andSo, [0, -340, 0.52]], [Q.canDo, [0, -340, 0.45]]] },
  { at: Q.canDo, keys: [[Q.canDo, [LL.cx, LL.cy + 10, 2.3]], [Q.costs, [LL.cx, LL.cy + 10, 2.42]]], focus: ['lockLaptop'] },
  { at: Q.costs, keys: [[Q.costs, [TT.cx - 40, TT.cy - 60, 1.9]], [Q.ourData, [TT.cx - 40, TT.cy - 60, 2.0]]], focus: ['tagTablet'] },
  { at: Q.ourData, keys: [[Q.ourData, [0, 0, 1]]], scene: 'rewind' },
  // (8) "free ourselves": the pointers click and nothing obeys; on "past" they leave
  { at: Q.free, keys: [[Q.free, [0, -420, 0.62]], [Q.itsTime, [0, -410, 0.6]]] },
  // (9) close on the recipes being shared next door, then all the way back
  { at: Q.itsTime, keys: [[Q.itsTime, [TRIO_X, hy - 30, 1.7]], [SHARE_HOLD, [TRIO_X, hy - 40, 1.6]], [Q.open + 0.1, [0, -380, 0.56]], [END_DIP, [0, -400, 0.42]]], focus: TRIO },
];
const shotAt = (t: number) => { let s = SHOTS[0]; for (const x of SHOTS) if (t >= x.at) s = x; return s; };
const camAt = (t: number, s: Shot): Cam => {
  const k = s.keys;
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const p = EASE_IN_OUT(lin(t, k[i - 1][0], k[i][0]));
      // WHY log-space zoom: equal steps in log scale read as a steady camera move; linear zoom lurches at the end
      const s0 = Math.log(k[i - 1][1][2]), s1 = Math.log(k[i][1][2]);
      return [lerp(k[i - 1][1][0], k[i][1][0], p), lerp(k[i - 1][1][1], k[i][1][1], p), Math.exp(s0 + (s1 - s0) * p)];
    }
  }
  return k[k.length - 1][1];
};

// ---------- screen geometry the pointers and the caret aim at ----------
const HS = { x: HERO.cx - HERO.w / 2, y: top(HERO) };
const heroAskCaret = (() => { const r = askRect(HERO.w, HERO.h); const k = Math.min(HERO.w, HERO.h) / 100; return { x: HS.x + r.x * HERO.w + 4.6 * k * 0.8 + 4.6 * k * 2.1, y: HS.y + (r.y + r.h / 2) * HERO.h }; })();
const LL_TILE = (() => { const c = tileCenter(LL.w, LL.h, 2, 1); return { x: LL.cx - LL.w / 2 + c.x, y: top(LL) + c.y }; })();
const acceptBtn = (d: Dev) => { const k = Math.min(d.w, d.h) / 100; return { x: d.cx + 3 * k, y: d.cy + (d.h > d.w ? 12 : 9.4) * k }; };
// the AI window on the big screen (fractions of the TV screen), and where its caret sits
const WIN = { x: 0.12, y: 0.07, w: 0.76, h: 0.72 };
const TV_K = TV.h / 100;
const TV_CARET = { x: TV.cx - TV.w / 2 + (WIN.x * TV.w) + 30 + 26 + 58, y: top(TV) + (WIN.y + WIN.h) * TV.h - 24 - 32 };
const TV_ROW_Y = TV.cy + 190;

// ---------- the escaping caret ----------
const HOPS = [TV_CARET, { x: dev('-1:l1').cx, y: dev('-1:l1').cy }, { x: dev('-1:r0').cx, y: dev('-1:r0').cy }, heroAskCaret];
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
// WHY one formation function: the five move as a single body (same curve, same frame, no bob, no
// per-pointer wobble). That lockstep is what makes them read as one power rather than five people.
const ROW_Y = -1180, ROW_SP = 560;
const row = (i: number, X: number, Y: number, SP: number): [number, number] => [X + (i - 2) * SP, Y];

const pointers = (t: number): Pointer[] => {
  const out: Pointer[] = [];
  for (let i = 0; i < 5; i++) {
    let [x, y] = row(i, 0, ROW_Y, ROW_SP);
    let press = 0, o = 1;
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
      [x, y] = kf(t, [[Q.decided, LL_TILE.x + 320, LL_TILE.y - 520], [Q.could - 0.1, LL_TILE.x, LL_TILE.y], [Q.cost - 0.5, LL_TILE.x, LL_TILE.y], [Q.cost, LL_TILE.x + 260, LL_TILE.y - 420]]);
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
      // (3) the same dialog pops on every screen; they wait above
    } else if (t < Q.weAccepted) {
      // "accepted it": three of them press Accept on three screens in the same frame
      const ds = [L0, HERO, TT];
      if (i >= 1 && i <= 3) {
        const b = acceptBtn(ds[i - 1]);
        [x, y] = kf(t, [[Q.weAll2, b.x + 60, b.y - 420], [ACCEPT - 0.12, b.x, b.y], [ACCEPT + 0.3, b.x, b.y], [Q.weAccepted, b.x + 20, b.y - 90]]);
        press = bump(t, ACCEPT - 0.04);
      } else o = 0;
    } else if (t < Q.however) {
      o = 0;
    } else if (t < Q.blinded) {
      // (4) they watch from the top of the darkened wall
      o = 0.7;
    } else if (t < Q.aTechnology) {
      // (5) they line up in front of the big screen, click together, and the machine opens
      [x, y] = kf(t, [[Q.blinded, row(i, TV.cx, TV_ROW_Y - 700, 200)[0], TV_ROW_Y - 700], [Q.blinded + 0.6, row(i, TV.cx, TV_ROW_Y, 200)[0], TV_ROW_Y]], EASE_OUT);
      press = bump(t, HUBRIS - 0.04);
      if (i === 2) {
        // one of them types a request into it
        const home = row(2, TV.cx, TV_ROW_Y, 200);
        [x, y] = kf(t, [[TV_CLICK_IN - 0.4, home[0], home[1]], [TV_CLICK_IN, TV_CARET.x + 4, TV_CARET.y + 8], [TV_SEND + 0.1, TV_CARET.x + 4, TV_CARET.y + 8], [TV_SEND + 0.5, home[0], home[1]]], EASE_IN_OUT);
        if (t < TV_CLICK_IN - 0.4) [x, y] = kf(t, [[Q.blinded, home[0], TV_ROW_Y - 700], [Q.blinded + 0.6, home[0], home[1]]], EASE_OUT);
        press = Math.max(press, bump(t, TV_CLICK_IN), bump(t, TV_SEND - 0.04));
      }
    } else if (t < Q.great) {
      // (5) "a technology they believed would bring a great treasure": they stamp its button onto every screen
      press = [0, 1, 2, 3].reduce((a, n) => Math.max(a, bump(t, Q.aTechnology + 0.22 + n * 0.5)), 0);
    } else if (t < Q.but) {
      o = 0;
    } else if (t < Q.far + 0.001) {
      // (6) "in their excitement": quick synchronised clicks, each one making another thing; then all at the input
      const home = row(i, TV.cx, TV_ROW_Y, 200);
      const gather = ez(t, EXCITED[2] + 0.25, LAST_CLICK - 0.04, EASE_IN_OUT);
      const pack = row(i, TV_CARET.x + 60, TV_CARET.y + 26, 120);
      x = lerp(home[0], pack[0], gather); y = lerp(home[1], pack[1] + Math.abs(i - 2) * 34, gather);
      press = EXCITED.reduce((a, e) => Math.max(a, bump(t, e, 0.22)), 0);
      y -= 26 * EXCITED.reduce((a, e) => Math.max(a, bump(t, e - 0.12, 0.3)), 0);
    } else {
      // "far beyond their own control": they click the input and the caret is not there; it hops down the
      // wall a beat ahead of them, lands in one phone, and they stop dead above it
      const lag = 0.4;
      const c = caretAt(Math.max(HOP0 - 0.01, t - lag));
      const freeze = ez(t, LAND + lag, LAND + 0.65, EASE_OUT);
      const cx = lerp(c.x + 110, HERO.cx + 40, freeze), cy = lerp(c.y + 26, HS.y - 230, freeze);
      [x, y] = [cx + (i - 2) * 120, cy + Math.abs(i - 2) * 34];
      press = bump(t, LAST_CLICK - 0.04) + [0, 1, 2].reduce((a, j) => Math.max(a, bump(t, HOP0 + j * HOP + lag - 0.02, 0.22)), 0);
      if (t >= Q.andSo) {
        // (7)(8) back above the wall: they click, and nothing obeys; on "past" they leave together
        [x, y] = row(i, 0, ROW_Y + 80, ROW_SP);
        press = t >= Q.free ? bump(t, Q.freeWord + 0.1) + bump(t, Q.freeWord + 0.55) : 0;
        y -= 1700 * ez(t, Q.past - 0.05, Q.past + 0.8, EASE_IN);
        if (t > Q.past + 0.8) o = 0;
      }
    }
    out.push({ x, y, press: Math.min(1, press), o, rot: 0 });
  }
  return out;
};

// ---------- what each screen shows at time t ----------
const flipNode = (f: number, a: React.ReactNode, b: React.ReactNode) => {
  if (f <= 0) return a;
  if (f >= 1) return b;
  // WHY a circle opening from the centre: the change reads as arriving IN the screen, not as a slide-show wipe
  return <>{a}<div style={{ position: 'absolute', inset: 0, clipPath: `circle(${EASE_OUT(f) * 78}% at 50% 50%)` }}>{b}</div></>;
};
// WHY a 4-frame snap rather than a slide: blocks sliding past each other looked messy, and a snap reads as
// "one click, every screen, the same frame"
const layAt = (t: number) => ez(t, DICT, DICT + 0.13, EASE_IN_OUT) + ez(t, TECH, TECH + 0.13, EASE_IN_OUT);
const bannerAt = (t: number) => (t >= DICT && t < DICT + 1.5 ? lin(t, DICT, DICT + 1.5) : t >= TECH && t < TECH + 1.5 ? lin(t, TECH, TECH + 1.5) : 0);
// the laptop's padlocks land one tile after another, starting with the one that was clicked
const LL_LOCK_ORDER = [1, 0, 2, 3, 4, 5];
const blink = (frame: number) => Math.floor(frame / 15) % 2 === 0;

/** Their machine, on the big screen: a white window with one input line. Typed to, it builds things. */
const TVWindow: React.FC<{ w: number; h: number; t: number; frame: number }> = ({ w, h, t, frame }) => {
  const open = ez(t, HUBRIS, HUBRIS + 0.2, EASE_OUT);   // WHY 6 frames: a snap, not a morph or a flash
  const n = Math.round(lin(t, TV_TYPE0, TV_TYPE1) * TV_ASK.length);
  const sent = t >= TV_SEND;
  const bub = ez(t, TV_SEND, TV_SEND + 0.3);
  const caretOn = t < HOP0 && ((n > 0 && !sent) || blink(frame));
  const pop = (at: number) => ez(t, at, at + 0.22, EASE_OUT);
  const rows = ['call the bank', 'book the dentist', 'water the plants'];
  const card = (o: number, extra: React.CSSProperties = {}): React.CSSProperties => ({ background: '#F3EDF7', borderRadius: 18, padding: '18px 20px', boxSizing: 'border-box', opacity: o, transform: `translateY(${(1 - o) * 16}px) scale(${0.94 + 0.06 * o})`, ...extra });
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#2A1C36', fontFamily: DMSANS }}>
      <div style={{ position: 'absolute', left: WIN.x * w, top: WIN.y * h, width: WIN.w * w, height: WIN.h * h, borderRadius: 24, background: '#FBF9FC', opacity: open, transform: `scale(${0.96 + 0.04 * open})`,
        boxShadow: '0 20px 50px rgba(6,2,12,0.5)', overflow: 'hidden' }}>
        {/* the request, once sent, as a bubble */}
        {sent && <div style={{ position: 'absolute', right: 30, top: 26, padding: '12px 22px', borderRadius: 22, background: '#EFE3F6', color: C.plum, fontSize: 26, fontWeight: 700, opacity: bub, transform: `translateY(${(1 - bub) * 60}px)` }}>{TV_ASK}</div>}
        {/* what it made: a to-do list, built piece by piece; then, in their excitement, more */}
        <div style={{ position: 'absolute', left: 30, top: 92, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {t >= TV_REPLY && <div style={card(pop(TV_REPLY), { width: 292, height: 250 })}>
            <div style={{ fontSize: 36, fontWeight: 900, color: C.plum, letterSpacing: '-0.03em', marginBottom: 10 }}>To do</div>
            {rows.map((r, i) => {
              const o = ez(t, TV_REPLY + 0.25 + i * 0.2, TV_REPLY + 0.45 + i * 0.2);
              const done = i === 0 && t > TV_REPLY + 1.2;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 50, opacity: o, transform: `translateX(${(1 - o) * -14}px)`, fontSize: 25, fontWeight: 500, color: C.plum2 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 8, border: `3px solid ${C.purple}`, background: done ? C.purple : 'transparent', boxSizing: 'border-box', flex: 'none' }} />
                  <span style={{ textDecoration: done ? 'line-through' : undefined }}>{r}</span>
                </div>
              );
            })}
          </div>}
          {t >= EXCITED[0] && <div style={card(pop(EXCITED[0] + 0.05), { width: 128, height: 250, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' })}>
            <div style={{ fontSize: 40, fontWeight: 900, color: C.plum, letterSpacing: '-0.04em' }}>25:00</div><div style={{ fontSize: 22, color: C.plum2 }}>focus</div></div>}
          {t >= EXCITED[1] && <div style={card(pop(EXCITED[1] + 0.05), { width: 128, height: 250 })}>
            <div style={{ fontSize: 24, fontWeight: 900, color: C.plum, marginBottom: 10 }}>Shopping</div>
            {['milk', 'eggs', 'bread', 'lemons'].map((s) => <div key={s} style={{ fontSize: 22, color: C.plum2, height: 38 }}>{s}</div>)}</div>}
          {t >= EXCITED[2] && <div style={card(pop(EXCITED[2] + 0.05), { width: 128, height: 250, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' })}>
            <div style={{ fontSize: 52, fontWeight: 900, color: C.plum, letterSpacing: '-0.04em' }}>18°</div><div style={{ fontSize: 22, color: C.plum2 }}>sunny</div></div>}
        </div>
        {/* the input line */}
        <div style={{ position: 'absolute', left: 30, right: 30, bottom: 24, height: 64, borderRadius: 32, background: '#FFFFFF', boxShadow: 'inset 0 0 0 2px rgba(151,80,170,0.22)', display: 'flex', alignItems: 'center', padding: '0 26px',
          fontSize: 30, fontWeight: n > 0 && !sent ? 700 : 500, color: n > 0 && !sent ? C.plum : C.tagGrey, letterSpacing: '-0.015em' }}>
          {n > 0 && !sent ? TV_ASK.slice(0, n) : 'ask…'}
          <span style={{ display: 'inline-block', width: 4, height: 34, marginLeft: 3, borderRadius: 3, background: C.purple, opacity: caretOn ? 1 : 0 }} />
        </div>
      </div>
    </div>
  );
};

const screenOf = (d: Dev, t: number, frame: number): { node: React.ReactNode; glow: string; lift: number } => {
  const fa = flipAt(d);
  const f = lin(t, fa, fa + 0.55);
  const lift = bump(t, fa, 0.7) * 0.9;
  const lockS = Q.could - 0.05 + (d.dist / MAXD) * 0.45 + jit(d) * 0.15;
  const lock: number | number[] = d.id === 'lockLaptop' ? LL_LOCK_ORDER.map((r) => lin(t, LOCK0 + r * 0.11, LOCK0 + r * 0.11 + 0.45)) : lin(t, lockS, lockS + 0.45);
  const aiAt = Q.aTechnology + 0.3 + Math.hypot(d.cx - TV.cx, d.cy - TV.cy) / 3800 * 1.9;
  const isHero = d.id === 'hero';
  let ask: { o: number; text?: string; n?: number; caret: boolean; fs?: number } | undefined;
  if (isHero && t >= Q.something && t < Q.blinded) ask = { o: ez(t, Q.something + 0.1, Q.something + 0.5), caret: blink(frame), fs: 7.2 * (HERO.w / 100) };    // the glimpse; WHY larger type: it must be noticed from a mid shot
  if (isHero && t >= LAND) {
    const n = Math.round(lin(t, TYPE0, TYPE1) * REQUEST.length);
    ask = { o: 1, text: REQUEST, n, caret: (n > 0 && n < REQUEST.length) || blink(frame), fs: 8.6 * (HERO.w / 100) };
  }
  const same = (
    <SameScreen w={d.w} h={d.h} lay={layAt(t)} banner={bannerAt(t)}
      lock={lock} unlock={d.id === 'lockLaptop' ? lin(t, Q.canDo + 0.15, Q.canDo + 0.65) : 0}
      dialog={lin(t, Q.weAll + 0.05 + jit(d) * 0.35, Q.weAll + 0.4 + jit(d) * 0.35)}
      accept={lin(t, ACCEPT, ACCEPT + 0.6)}
      ai={d.id === 'tv' ? 0 : lin(t, aiAt, aiAt + 0.3)} ask={ask} />
  );
  const own = <OwnScreen app={d.app} w={d.w} h={d.h} p={lin(t, fa + 0.1, fa + (isHero ? 1.5 : 1.1))} frame={frame} caret={isHero && t > fa + 1.2} />;
  if (isHero) {
    return { node: flipNode(f, same, own), glow: f > 0.5 ? glowOf(0) : SAME_GLOW, lift: t < fa ? bump(t, Q.something, 0.7) * 0.7 + bump(t, LAND, 0.5) * 0.6 : lift };
  }
  if (d.id === 'tv') {
    const before = t < HUBRIS ? same : <TVWindow w={d.w} h={d.h} t={t} frame={frame} />;
    return { node: flipNode(f, before, own), glow: f > 0.5 ? glowOf(d.app) : SAME_GLOW, lift };
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
  return { node, glow: f > 0.5 ? glowOf(d.app) : SAME_GLOW, lift: lift + (si >= 0 ? bump(t, SHARE_AT[si], 0.6) * 0.6 : 0) };
};

// =====================================================================================================
export const Take1B: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const shot = shotAt(t);
  const [cx, cy, s] = camAt(t, shot);
  const night = 1 - ez(t, Q.freeWord, Q.freeWord + 1.2, EASE_IN_OUT);

  if (t >= END_CARD) return (<AbsoluteFill><Audio src={staticFile('audio/take1-mix.wav')} /><EndCard at={END_CARD} /></AbsoluteFill>);

  const scene = shot.scene;
  const focus = new Set(shot.focus ?? []);
  // depth of field: in close-ups everything but the subject goes soft, like a real lens
  const blur = s > 1.6 ? Math.min(3.2, (s - 1.6) * 3) : 0;
  const vw = 1920 / s, vh = 1080 / s;
  const visible = (d: Dev) => Math.abs(d.cx - cx) < vw / 2 + d.w && Math.abs(d.cy - cy) < vh / 2 + d.h;
  const dim = t >= Q.however && t < Q.blinded ? ez(t, Q.however, Q.however + 0.9) : 0;

  const renderDev = (d: Dev) => {
    const sc = screenOf(d, t, frame);
    const overlay = dim > 0 && d.id !== 'hero' ? <div style={{ position: 'absolute', inset: 0, background: '#0E0716', opacity: dim * 0.78 }} /> : null;
    return <Device key={d.id} d={d} night={night} glow={sc.glow} lift={sc.lift}>{sc.node}{overlay}</Device>;
  };

  const devs = WORLD.devs.filter(visible);
  const back = devs.filter((d) => !focus.has(d.id));
  const front = devs.filter((d) => focus.has(d.id));
  const ps = pointers(t);
  // WHY large: they are the villains of the piece, bigger than anyone's own cursor
  const pride = t >= Q.blinded && t < Q.aTechnology ? 1 + 0.07 * ez(t, HUBRIS + 0.1, HUBRIS + 0.6) : 1;
  const psize = 150 / Math.pow(s, 0.55) * pride;

  // headline readability: a soft fade of the background behind the lower third while a headline is up
  const headUp = Math.max(0, ...HEADS.map((h) => Math.min(ez(t, h.at - 0.2, h.at + 0.3), 1 - ez(t, h.out - 0.35, h.out, EASE_IN))));

  return (
    <AbsoluteFill style={{ background: C.night, overflow: 'hidden' }}>
      <Audio src={staticFile('audio/take1-mix.wav')} />
      {scene === 'print' && <Receipt t={t} mode="print" />}
      {scene === 'rewind' && <Receipt t={t} mode="rewind" />}
      {scene === 'stack' && <SubStack t={t} />}
      {scene === 'bill' && <SubStack t={t} reprise />}
      {scene === 'bills' && <Bills t={t} />}
      {scene === 'free' && <FreeTag t={t} />}
      {!scene && <>
        {/* the room: plum-black, lit a little from above; lavender arrives from the person's phone */}
        <AbsoluteFill style={{ background: 'linear-gradient(180deg,#22152F 0%,#160C21 55%,#110919 100%)' }} />
        {night < 1 && <Daylight t={t} cx={(HERO.cx - cx) * s + 960} cy={(HERO.cy - cy) * s + 540} />}
        <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: `translate(${960 - cx * s}px, ${540 - cy * s}px) scale(${s})`, transformOrigin: '0 0' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, filter: blur > 0 ? `blur(${blur}px)` : undefined }}>
            <div style={{ opacity: night }}><Shelves night={1} /></div>
            <div style={{ opacity: 1 - night }}><Shelves night={0} /></div>
            {back.map(renderDev)}
          </div>
          {front.map(renderDev)}
          <WorldProps t={t} />
          {ps.map((p, i) => <PointerArrow key={i} p={p} size={psize} />)}
        </div>
        {/* a quiet vignette holds the eye in the middle of the wide shots */}
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 80% at 50% 45%, transparent 62%, rgba(12,5,20,0.4) 100%)', opacity: (0.4 + 0.6 * night) * (s > 1.3 ? 0.5 : 1) }} />
      </>}
      {headUp > 0 && <AbsoluteFill style={{ background: `linear-gradient(180deg, transparent 56%, ${night > 0.5 ? 'rgba(14,7,22,0.86)' : 'rgba(247,240,251,0.95)'} 88%)`, opacity: headUp }} />}
      {HEADS.map((h) => <Line key={h.text} text={h.text} at={h.at} out={h.out} y={83} size={5.4} dark={h.at < Q.free} />)}
      {/* the dip to the end card */}
      {t > END_DIP - 0.01 && <AbsoluteFill style={{ background: C.lavender, opacity: ez(t, END_DIP, END_CARD, EASE_IN_OUT) }} />}
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

/** Things that live in the world but are not screens: the price tag and the escaping caret. */
const WorldProps: React.FC<{ t: number }> = ({ t }) => {
  // price ticking: up in line 2; struck through and made free in line 7
  const up = [9.99, 11.99, 12.99, 14.99];
  const upI = Math.min(3, Math.floor(lin(t, Q.costWord, Q.costWord + 0.7) * 3.999));
  const strike = t >= Q.costs ? ez(t, Q.costs + 0.08, Q.costs + 0.38, EASE_IN_OUT) : 0;
  const isFree = t >= Q.costs + 0.5;
  const tagText = t < Q.costs ? `$${up[upI].toFixed(2)}` : isFree ? 'free' : '$14.99';
  const c = caretAt(t);
  const CH = 118;
  return (
    <>
      {(t < Q.data || t >= Q.costs) && <PriceTag x={TT.cx - TT.w / 2 + 70} y={top(TT) - 6} t={t} drop={Q.cost + 0.15} text={tagText} strike={isFree ? 0 : strike} fall={lin(t, Q.costs + 0.95, Q.costs + 1.6)} />}
      {/* (6) the caret, out on its own: big enough to follow across the wall, shrinking into the phone's ask bar */}
      {t >= HOP0 && t < LAND && (() => {
        const h = Math.max(9, CH * c.h);
        // WHY a light rim: on both the dark room and the light screens the purple bar must stay unmistakable
        return <div style={{ position: 'absolute', left: c.x - h * 0.1, top: c.y - h / 2, width: Math.max(2.5, h * 0.2), height: h, borderRadius: h, background: C.purple, boxShadow: `0 0 0 ${Math.max(1.5, h * 0.05)}px #F3EAF9, 0 ${h * 0.12}px ${h * 0.25}px rgba(10,4,18,0.55)` }} />;
      })()}
    </>
  );
};
