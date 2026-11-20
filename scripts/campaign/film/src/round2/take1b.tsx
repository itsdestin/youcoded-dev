// Round two, take 1 variant B: "The same screen, everywhere."
// The idea: a wall of devices that all show the same screen, because five arrow pointers (the few who
// decide) click for everyone. They lock things, price things, take people's things away. Then they make a
// text caret, the new thing, and lose control of it: one person types a request into one screen, that
// screen becomes something of their own, and the change spreads until every screen on the wall is different.
// Every timing comes from the narrator's word times (take1b-cues.ts); nothing here is a typed second.
import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { C, EASE_IN, EASE_IN_OUT, EASE_OUT, FPS } from '../brand';
import { EndCard, Line } from '../kit';
import { LAST_WORD_END, Q } from './take1b-cues';
import { APPS, CaretScreen, OwnCard, Recipes, SameScreen, sameLayout } from './take1b-screens';
import { Dev, Device, PointerArrow, Pointer, PriceTag, Shelves, WORLD, dev } from './take1b-world';
import { FreeTag, SubStack } from './take1b-scenes';

const cl = (x: number) => Math.max(0, Math.min(1, x));
const lin = (t: number, a: number, b: number) => cl((t - a) / (b - a));
const ez = (t: number, a: number, b: number, e = EASE_OUT) => e(lin(t, a, b));
const bump = (t: number, at: number, d = 0.28) => (t < at || t > at + d ? 0 : Math.sin(Math.PI * (t - at) / d));

const HERO = dev('hero'), TV = dev('tv'), LL = dev('lockLaptop'), TT = dev('tagTablet');
const MAXD = Math.max(...WORLD.devs.map((d) => d.dist));
const jit = (d: Dev) => ((Math.abs(Math.sin(d.cx * 0.013 + d.cy * 0.007)) * 1000) % 1);

// ---------- the timeline's derived moments ----------
const CUT_PRIVACY = Q.privacy + 0.1;                 // the "own nothing." headline has had its minimum hold by here
const END_DIP = Math.max(LAST_WORD_END + 0.45, Q.open + 2.6);
const END_CARD = END_DIP + 0.3;
const HEADS = [
  { text: 'own *nothing.', at: Q.own, out: CUT_PRIVACY },
  { text: 'something *wonderful happened.', at: Q.something, out: Q.blinded - 0.04 },
  { text: 'for *anyone who asks.', at: Q.forAnyone, out: Q.andSo - 0.04 },
  { text: 'open source *everything.', at: Q.open, out: END_DIP + 0.25 },
];
// WHY a check: the brand guide's muted-video rule (1.2 s + 0.25 s a word). If the voice is re-timed and a
// headline would flash by too quickly, the render stops instead of shipping an unreadable line.
for (const h of HEADS) {
  const words = h.text.split(/\s+/).length;
  if (h.out - h.at < 1.2 + 0.25 * words) throw new Error(`take1b: headline "${h.text}" is up ${(h.out - h.at).toFixed(2)} s, needs ${1.2 + 0.25 * words} s`);
}
if (END_CARD + 2.5 > 75) throw new Error('take1b: the end card would be held under 2.5 s');

// ---------- when each screen becomes someone's own ----------
const NEAR = WORLD.devs.filter((d) => !['hero', 'lockLaptop', 'tagTablet', 'tv'].includes(d.id)).sort((a, b) => a.dist - b.dist);
const FIRST_FOLLOWERS = NEAR.slice(0, 3).map((d) => d.id);
const SHARE_TARGETS = [NEAR[3].id, NEAR[5].id];      // late: they receive a copy of the recipes (what one person makes, others can use)
const flipAt = (d: Dev): number => {
  if (d.id === 'hero') return Q.scarce + 0.35;   // WHY +0.35: the typed request stays whole on screen for a beat before it turns into the thing asked for
  if (d.id === 'lockLaptop') return Q.canDo + 0.8;
  if (d.id === 'tagTablet') return Q.costs + 0.75;
  const fi = FIRST_FOLLOWERS.indexOf(d.id);
  if (fi >= 0) return Q.forAnyone + 0.45 + fi * 0.55;
  // the ripple: outward from the hero across the whole wall, finishing as "we get to decide" lands
  return Q.andSo + 0.25 + (d.dist / MAXD) * (Q.decide - Q.andSo + 0.2) + jit(d) * 0.25;
};
const APP_GLOW = ['rgba(251,243,230,1)', 'rgba(228,240,251,1)', 'rgba(229,237,223,1)', 'rgba(60,140,170,1)', 'rgba(255,122,102,1)', 'rgba(248,220,226,1)', 'rgba(255,216,77,1)', 'rgba(241,233,218,1)', 'rgba(238,230,255,1)'];
const SAME_GLOW = 'rgba(222,214,234,1)';

// ---------- the camera: one framing per shot, eased inside the shot, cut between shots ----------
type Cam = [number, number, number];                 // world x, world y at frame centre, scale
type Shot = { at: number; keys: [number, Cam][]; focus?: string[]; scene?: 'stack' | 'free' };
const hy = HERO.cy;
const SHOTS: Shot[] = [
  { at: Q.start, keys: [[0, [0, hy, 3.3]], [0.2, [0, hy, 3.25]], [2.5, [0, -400, 0.6]], [Q.decided, [0, -420, 0.65]]], focus: ['hero'] },
  { at: Q.decided, keys: [[Q.decided, [-120, -380, 1.1]], [Q.cost, [-100, -370, 1.2]]] },
  { at: Q.cost, keys: [[Q.cost, [TT.cx - 60, TT.cy - 50, 1.7]], [Q.data, [TT.cx - 60, TT.cy - 50, 1.82]]], focus: ['tagTablet'] },
  { at: Q.data, keys: [[Q.data, [0, hy - 40, 2.45]], [Q.weAll, [0, hy - 50, 2.7]]], focus: ['hero'] },
  { at: Q.weAll, keys: [[Q.weAll, [0, -330, 0.5]], [Q.weAccepted, [0, -330, 0.55]]] },
  { at: Q.weAccepted, keys: [[Q.weAccepted, [0, 0, 1]]], scene: 'stack' },
  { at: CUT_PRIVACY, keys: [[CUT_PRIVACY, [0, 0, 1]]], scene: 'free' },
  { at: Q.however, keys: [[Q.however, [0, -330, 0.5]], [Q.recently + 0.3, [0, -320, 0.52]], [Q.blinded, [0, hy + 95, 2.05]]], focus: ['hero'] },   // WHY +95: lifts the phone clear of the headline below it
  { at: Q.blinded, keys: [[Q.blinded, [TV.cx, TV.cy + 30, 1.45]], [Q.aTechnology, [TV.cx, TV.cy + 20, 1.72]]], focus: ['tv'] },
  { at: Q.aTechnology, keys: [[Q.aTechnology, [0, -520, 0.6]], [Q.shareholder, [0, -500, 0.68]]] },
  { at: Q.shareholder, keys: [[Q.shareholder, [0, -380, 0.34]], [Q.but, [0, -380, 0.355]]] },
  { at: Q.but, keys: [[Q.but, [0, -420, 0.86]], [Q.created2, [60, -410, 0.95]]] },
  { at: Q.created2, keys: [[Q.created2, [0, hy - 40, 2.15]], [Q.aTool, [0, hy - 40, 2.3]]], focus: ['hero'] },
  { at: Q.aTool, keys: [[Q.aTool, [0, hy, 3.15]], [Q.scarce, [0, hy, 2.95]], [Q.forAnyone, [0, hy, 2.55]]], focus: ['hero'] },
  { at: Q.forAnyone, keys: [[Q.forAnyone, [0, hy + 70, 2.3]], [Q.andSo, [0, -200, 0.95]]] },
  { at: Q.andSo, keys: [[Q.andSo, [0, -340, 0.52]], [Q.canDo, [0, -340, 0.43]]] },
  { at: Q.canDo, keys: [[Q.canDo, [LL.cx, LL.cy - 10, 1.55]], [Q.costs, [LL.cx, LL.cy - 10, 1.66]]], focus: ['lockLaptop'] },
  { at: Q.costs, keys: [[Q.costs, [TT.cx - 60, TT.cy - 50, 1.7]], [Q.ourData, [TT.cx - 60, TT.cy - 50, 1.8]]], focus: ['tagTablet'] },
  { at: Q.ourData, keys: [[Q.ourData, [0, hy - 60, 2.35]], [Q.free, [0, hy - 60, 2.5]]], focus: ['hero'] },
  { at: Q.free, keys: [[Q.free, [0, -400, 0.66]], [Q.itsTime, [0, -390, 0.58]]] },
  // WHY close first: the recipes hopping to other screens (what one person makes, others can use) must be seen
  // before the camera pulls all the way back
  { at: Q.itsTime, keys: [[Q.itsTime, [0, -200, 0.98]], [Q.longLast + 1.3, [0, -230, 0.86]], [END_DIP, [0, -330, 0.3]]] },
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
      const sc = Math.exp(s0 + (s1 - s0) * p);
      return [k[i - 1][1][0] + (k[i][1][0] - k[i - 1][1][0]) * p, k[i - 1][1][1] + (k[i][1][1] - k[i - 1][1][1]) * p, sc];
    }
  }
  return k[k.length - 1][1];
};

// ---------- the five pointers ----------
const kf = (t: number, keys: [number, number, number][]): [number, number] => {
  if (t <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const p = EASE_IN_OUT(lin(t, keys[i - 1][0], keys[i][0]));
    return [keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * p, keys[i - 1][2] + (keys[i][2] - keys[i - 1][2]) * p];
  }
  const l = keys[keys.length - 1]; return [l[1], l[2]];
};
// hero screen geometry, for lifting the person's things off it exactly
const HS = { x: HERO.cx - HERO.w / 2, y: HERO.cy - HERO.h / 2 };
const HL = sameLayout(HERO.w, HERO.h);
const itemRect = (kind: 'photo' | 'msg' | 'note') => { const r = HL[kind]; return { x: HS.x + r.x * HERO.w, y: HS.y + r.y * HERO.h, w: r.w * HERO.w, h: r.h * HERO.h }; };
const GRAB = { photo: Q.data + 0.38, msg: Q.data + 0.68, note: Q.data + 0.98 };
// WHY a big caret on the big screen: at the first size it was a hairline nobody would notice being carried in
const TV_CARET = 17;
const CARET_TV = { x: TV.cx - TV.w / 2 + 9 * (TV.h / 100), y: TV.cy - TV.h / 2 + 0.32 * TV.h };
const CARET_PLACED = Q.newKind + 0.75;
const CARET_HERO = { x: HS.x + 9 * (HERO.w / 100), y: HS.y + 0.22 * HERO.h };

const pointers = (t: number): Pointer[] => {
  const out: Pointer[] = [];
  for (let i = 0; i < 5; i++) {
    const bob = Math.sin(t * 1.9 + i * 1.3) * 14;
    let x = 0, y = -3000, press = 0, o = 1, rot = -8 + i * 4;
    if (t < Q.decided) {
      // (1) they arrive above the wall together, then click: every screen rearranges at once
      const home: [number, number] = [-1000 + i * 500, -1240 + (i % 2) * 70];
      const e = ez(t, Q.handful + i * 0.09, Q.corporations + 0.35 + i * 0.05, EASE_OUT);
      x = home[0]; y = -2300 + (home[1] + 2300) * e + bob;
      press = bump(t, Q.dictated + i * 0.04);
    } else if (t < Q.cost) {
      // (2) "what your computers could do": each lands on a screen and clicks a padlock onto it
      const tg: [number, number][] = [[-600, -560], [LL.cx + 40, LL.cy - 20], [HERO.cx + 20, hy - 40], [TT.cx - 40, TT.cy - 10], [-760, -160]];
      [x, y] = kf(t, [[Q.decided, -900 + i * 450, -1300], [Q.couldDo - 0.65 + i * 0.05, tg[i][0], tg[i][1]]]);
      y += bob * 0.4;
      press = bump(t, Q.couldDo - 0.6 + i * 0.05);
    } else if (t < Q.data) {
      // (2) "what it would cost": two of them hang price tags, and click again as the prices tick up
      const anchors: [number, number][] = [[TT.cx - TT.w / 2 + 70, TT.cy - TT.h / 2 - 6], [HERO.cx, HERO.cy - HERO.h / 2 - 8]];
      if (i < 2) {
        [x, y] = kf(t, [[Q.cost - 0.2, anchors[i][0] + 120, anchors[i][1] - 260], [Q.cost + 0.15 + i * 0.1, anchors[i][0], anchors[i][1]]]);
        press = bump(t, Q.cost + 0.15 + i * 0.1) + bump(t, Q.costWord + 0.05 + i * 0.12);
      } else o = 0;
    } else if (t < Q.weAll) {
      // (2) "your personal data": three of them lift the person's photos, message and note off the phone
      const kinds = ['photo', 'msg', 'note'] as const;
      if (i < 3) {
        const r = itemRect(kinds[i]); const g = GRAB[kinds[i]];
        const tip: [number, number] = [r.x + r.w * 0.62, r.y + r.h * 0.45];
        [x, y] = kf(t, [[Q.data, tip[0] + 160 - i * 40, tip[1] - 380], [g - 0.05, tip[0], tip[1]], [g + 0.25, tip[0], tip[1] - 12], [g + 1.05, tip[0] + 90 - i * 60, -760]]);
        press = t > g - 0.05 && t < g + 1.2 ? 0.6 : 0;
      } else o = 0;
    } else if (t < Q.blinded) {
      // (3)(4) they watch from the top of the wall
      x = -1000 + i * 500; y = -1500 + (i % 2) * 70 + bob;
    } else if (t < Q.aTechnology) {
      // (5) "blinded by their own hubris": crowded round the big screen, swelling; one carries the caret in
      const spots: [number, number][] = [[-560, TV.cy + 220], [-250, TV.cy + 250], [80, TV.cy + 240], [400, TV.cy + 230], [620, TV.cy + 190]];
      x = spots[i][0]; y = spots[i][1] + bob * 0.6;
      rot = -14 + i * 7;
      if (i === 2) {
        [x, y] = kf(t, [[Q.created1, spots[2][0], spots[2][1]], [Q.created1 + 0.35, 760, TV.cy - 40], [CARET_PLACED, CARET_TV.x + 6, CARET_TV.y + 30], [CARET_PLACED + 0.6, 120, TV.cy + 220]]);
        press = t > Q.created1 + 0.35 && t < CARET_PLACED ? 0.6 : bump(t, CARET_PLACED);
      }
      if (i !== 2) press = bump(t, Q.ai + i * 0.07);
    } else if (t < Q.shareholder) {
      // (5) "a great treasure": they spread out, sticking the new button on every screen, then huddle
      const ang = -Math.PI / 2 + (i - 2) * 0.9;
      const r = 300 + 1500 * ez(t, Q.aTechnology, Q.treasure, (v) => v);
      const gather = ez(t, Q.treasure - 0.2, Q.treasure + 0.4, EASE_IN_OUT);
      const sx = Math.cos(ang) * r * 1.4, sy = -500 + Math.sin(ang) * r * 0.55 + 280;
      x = sx + (-260 + i * 130 - sx) * gather; y = sy + (-1150 - sy) * gather + Math.sin(t * 9 + i) * 18 * gather;
      press = gather < 0.5 ? bump((t - Q.aTechnology) % 0.5, 0.05 + i * 0.06, 0.25) : 0;
    } else if (t < Q.but) {
      // the chart: they ride up the line to its tip
      const p = ez(t, Q.shareholder + 0.1, Q.but - 0.1, EASE_IN_OUT);
      x = -2400 + p * 4600 + (i - 2) * 150; y = 500 - p * 2050 + Math.abs(i - 2) * 90;
    } else if (t < Q.created2) {
      // (6) "in their excitement": darting about, clicking everything
      const a = t * (2.6 + i * 0.35) + i * 2;
      x = Math.sin(a) * 900 + Math.sin(a * 2.3) * 200; y = -480 + Math.cos(a * 1.4) * 380;
      press = bump((t + i * 0.13) % 0.42, 0.05, 0.2); rot = Math.sin(a * 3) * 18;
    } else if (t < Q.aTool) {
      // (6) "beyond their own control": they try to drag the caret off the person's phone; it will not move
      if (i < 2) {
        const c0 = i === 0 ? Q.created2 + 0.35 : Q.created2 + 1.4;
        const tip: [number, number] = [CARET_HERO.x + 4, CARET_HERO.y + 8];
        [x, y] = kf(t, [[Q.created2, tip[0] + 260 * (i ? 1 : -1), tip[1] - 300], [c0, tip[0], tip[1]], [c0 + 0.55, tip[0] + (i ? 180 : -40), tip[1] - (i ? 40 : 190)],
          [Q.control + 0.05, tip[0] + (i ? 180 : -40), tip[1] - (i ? 40 : 190)], [Q.control + 0.6, tip[0] + (i ? 420 : -380), tip[1] - 420]]);
        press = t > c0 && t < c0 + 0.6 ? 0.6 : 0;
        // the pointer pulls, the caret stays put, and the pointer is shaken off: it no longer obeys them
        if (t > c0 + 0.15 && t < c0 + 0.75) x += Math.sin((t - c0) * 70) * 10 * (1 - lin(t, c0 + 0.15, c0 + 0.75));
        rot = t > Q.control ? (i ? 25 : -25) * ez(t, Q.control, Q.control + 0.3) : rot;
      } else o = 0;
    } else if (t < Q.free) {
      // (7) as the change spreads they back away up the wall and fade
      const e = ez(t, Q.andSo, Q.decide, EASE_IN_OUT);
      x = (-1000 + i * 500) * (1 - 0.3 * e); y = -1400 - 500 * e + bob;
      o = 1 - 0.6 * e;
    } else {
      // (8) "free ourselves from the tech monopolies of the past": one by one, off the top
      const go = Q.tech - 0.5 + i * ((Q.past - Q.tech + 0.6) / 5);
      x = -800 + i * 400; y = -1250 + bob - 1400 * ez(t, go, go + 0.55, EASE_IN);
      o = 0.9;
    }
    out.push({ x, y, press: Math.min(1, press), o, rot });
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
/** The big screen once the pointers have made the new thing: a blank page, a caret, and then (at "artificial
 *  intelligence") the caret writing by itself, line after line. WHY: a blank screen with a caret alone did not
 *  say "a machine that writes"; lines racing out of the caret do, without any glowing-brain cliché. */
const TVWrite: React.FC<{ w: number; h: number; t: number; frame: number }> = ({ w, h, t, frame }) => {
  const k = h / 100;
  const g = ez(t, Q.ai - 0.05, Q.aTechnology - 0.2, (x) => x);
  const widths = [0.78, 0.64, 0.82, 0.55, 0.74, 0.6, 0.8, 0.42];
  const total = widths.reduce((a, b) => a + b, 0);
  let left = g * total;
  const fs = TV_CARET * k;
  const x0 = 9 * k, y0 = 0.32 * h, lh = fs * 1.25, bw = w - 2 * x0;
  let cx = x0, cy = y0;
  const bars: React.ReactNode[] = [];
  widths.forEach((wf, i) => {
    if (left <= 0) return;
    const f = Math.min(1, left / wf); left -= wf;
    const y = y0 + i * lh * 0.62 - (i > 3 ? (i - 3) * lh * 0.62 * g : 0);
    bars.push(<div key={i} style={{ position: 'absolute', left: x0, top: y + fs * 0.32, width: bw * wf * f, height: fs * 0.36, borderRadius: fs, background: '#C9B0DB' }} />);
    cx = x0 + bw * wf * f; cy = y;
  });
  const placed = t >= CARET_PLACED;
  const on = g > 0 && g < 1 ? true : Math.floor(frame / 15) % 2 === 0;
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#F3E9F8', overflow: 'hidden' }}>
      {bars}
      {placed && <div style={{ position: 'absolute', left: cx + fs * 0.06, top: cy, width: fs * 0.1, height: fs * 1.02, borderRadius: fs, background: C.purple, opacity: on ? 1 : 0 }} />}
    </div>
  );
};

/** Their portrait of themselves: one huge pointer on a plum field, slowly swelling. */
const Emblem: React.FC<{ w: number; h: number; t: number }> = ({ w, h, t }) => {
  const sc = 1 + 0.08 * ez(t, Q.blinded, Q.hubris + 0.4, (x) => x);
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 80% at 50% 45%, #4A2F5E 0%, #251733 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={h * 0.62} height={h * 0.62} viewBox="0 0 24 24" style={{ transform: `scale(${sc}) translateX(${h * 0.06}px)`, filter: `drop-shadow(0 ${h * 0.03}px ${h * 0.05}px rgba(10,4,18,0.6))` }}>
        <path d="M1 1 L1 19.5 L6 15 L9.6 22.6 L13 21 L9.5 13.6 L16.2 13.4 Z" fill="#F3EAF9" stroke="#C9B0DB" strokeWidth="0.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

const REQUEST = "can you put my grandma's recipes on here? big text, no ads pls";

const screenOf = (d: Dev, t: number, frame: number): { node: React.ReactNode; glow: string; lift: number } => {
  const fa = flipAt(d);
  const f = lin(t, fa, fa + 0.55);
  const lift = bump(t, fa, 0.7) * 0.9;
  const lockS = Q.couldDo - 0.55 + (d.dist / MAXD) * 0.35 + jit(d) * 0.15;
  const same = (
    <SameScreen w={d.w} h={d.h}
      shuffle={lin(t, Q.dictated + 0.12 + jit(d) * 0.05, Q.dictated + 1.3)}
      lock={lin(t, lockS, lockS + 0.3)} unlock={d.id === 'lockLaptop' ? lin(t, Q.canDo + 0.15, Q.canDo + 0.6) : 0}
      dialog={lin(t, Q.weAll + 0.05 + jit(d) * 0.3, Q.weAll + 0.45 + jit(d) * 0.3)}
      accept={lin(t, Q.acceptedIt - 0.15 + ((d.cx + 3700) / 7400) * 0.8, Q.acceptedIt + 0.4 + ((d.cx + 3700) / 7400) * 0.8)}
      ai={d.id === 'hero' ? 0 : lin(t, Q.aTechnology + 0.25 + (d.dist / MAXD) * (Q.treasure - Q.aTechnology - 0.6), Q.aTechnology + 0.55 + (d.dist / MAXD) * (Q.treasure - Q.aTechnology - 0.6))}
      gone={d.id === 'hero' ? { photo: lin(t, GRAB.photo, GRAB.photo + 0.1), msg: lin(t, GRAB.msg, GRAB.msg + 0.1), note: lin(t, GRAB.note, GRAB.note + 0.1) } : undefined} />
  );
  const App = APPS[d.app];
  const own = <App w={d.w} h={d.h} p={lin(t, fa + 0.1, fa + (d.id === 'hero' ? 1.5 : 1.1))} />;
  if (d.id === 'hero') {
    const caret = <CaretScreen w={d.w} h={d.h} frame={frame} size={11.5} text={REQUEST} typed={lin(t, Q.control + 0.25, Q.software + 0.1)} solid={(t > Q.control + 0.2 && t < Q.software + 0.4) || (t > Q.something && t < Q.happenedEnd + 0.4)} />;
    const c = lin(t, Q.something, Q.something + 0.5);
    if (t < fa) return { node: flipNode(c, same, caret), glow: c > 0.5 ? 'rgba(247,240,251,1)' : SAME_GLOW, lift: bump(t, Q.something, 0.7) * 0.7 };
    return { node: flipNode(f, caret, own), glow: APP_GLOW[0], lift };
  }
  if (d.id === 'tv') {
    // the big screen: the same screen, then a blinding glare, then the blank page the pointers put a caret on
    const blank = <TVWrite w={d.w} h={d.h} t={t} frame={frame} />;
    const g = lin(t, Q.hubris - 0.3, Q.hubris + 0.4);
    // "blinded by their own hubris": the big screen shows their own emblem, a giant pointer, and they gaze at it
    const self = t >= Q.blinded - 0.05 ? <Emblem w={d.w} h={d.h} t={t} /> : same;
    const pre = flipNode(g, self, blank);
    return { node: flipNode(f, t < Q.hubris - 0.3 ? self : pre, own), glow: f > 0.5 ? APP_GLOW[d.app] : g > 0.5 ? 'rgba(247,240,251,1)' : SAME_GLOW, lift };
  }
  // copies of the recipes arriving late on two screens: what one person makes, others can use
  const si = SHARE_TARGETS.indexOf(d.id);
  if (si >= 0) {
    const sa = Q.longLast + 0.35 + si * 0.45;
    const s2 = lin(t, sa, sa + 0.5);
    if (s2 > 0) return { node: flipNode(s2, own, <Recipes w={d.w} h={d.h} p={lin(t, sa + 0.05, sa + 0.9)} />), glow: APP_GLOW[0], lift: bump(t, sa, 0.6) * 0.8 };
  }
  return { node: flipNode(f, same, own), glow: f > 0.5 ? APP_GLOW[d.app] : SAME_GLOW, lift };
};

// ---------- the bar chart the wall becomes at "shareholder value" ----------
const chartLit = (d: Dev) => {
  const b = Math.max(0, Math.min(9, Math.floor((d.cx + 3000) / 600)));
  return 2 - d.row <= Math.floor(b * 0.62);
};

// =====================================================================================================
export const Take1B: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const shot = shotAt(t);
  const [cx, cy, s] = camAt(t, shot);
  const night = 1 - ez(t, Q.free, Q.free + 1.2, EASE_IN_OUT);

  if (t >= END_CARD) return (<AbsoluteFill><Audio src={staticFile('audio/take1-mix.wav')} /><EndCard at={END_CARD} /></AbsoluteFill>);

  const scene = shot.scene;
  const focus = new Set(shot.focus ?? []);
  // depth of field: in close-ups everything but the subject goes soft, like a real lens
  const blur = s > 1.6 ? Math.min(3.2, (s - 1.6) * 3) : 0;
  const vw = 1920 / s, vh = 1080 / s;
  const visible = (d: Dev) => Math.abs(d.cx - cx) < vw / 2 + d.w && Math.abs(d.cy - cy) < vh / 2 + d.h;
  const dim = d0(t);
  const chart = t >= Q.shareholder && t < Q.but;

  const renderDev = (d: Dev) => {
    const sc = screenOf(d, t, frame);
    let overlay: React.ReactNode = null;
    if (dim > 0 && d.id !== 'hero') overlay = <div style={{ position: 'absolute', inset: 0, background: '#0E0716', opacity: dim * 0.78 }} />;
    if (chart) {
      const lit = chartLit(d);
      const b = Math.max(0, Math.min(9, Math.floor((d.cx + 3000) / 600)));
      const on = ez(t, Q.shareholder + 0.05 + b * 0.07, Q.shareholder + 0.35 + b * 0.07);
      overlay = <div style={{ position: 'absolute', inset: 0, background: lit ? '#C387D3' : '#0E0716', opacity: on * (lit ? 0.82 : 0.85) }} />;
    }
    return <Device key={d.id} d={d} night={night} glow={sc.glow} lift={sc.lift}>{sc.node}{overlay}</Device>;
  };

  const devs = WORLD.devs.filter(visible);
  const back = devs.filter((d) => !focus.has(d.id));
  const front = devs.filter((d) => focus.has(d.id));
  const ps = pointers(t);
  const psize = 120 / Math.pow(s, 0.55);
  const puff = t >= Q.blinded && t < Q.aTechnology ? 1 + 0.28 * ez(t, Q.hubris - 0.2, Q.hubris + 0.5) * (1 - ez(t, Q.created1, Q.created1 + 0.4)) : 1;

  // headline readability: a soft fade of the background behind the lower third while a headline is up
  const headUp = Math.max(0, ...HEADS.map((h) => Math.min(ez(t, h.at - 0.2, h.at + 0.3), 1 - ez(t, h.out - 0.35, h.out, EASE_IN))));
  const glare = t >= Q.blinded && t < Q.aTechnology ? Math.min(ez(t, Q.hubris - 0.25, Q.hubris + 0.35), 1 - ez(t, Q.created1 - 0.4, Q.created1 + 0.2)) : 0;

  return (
    <AbsoluteFill style={{ background: C.night, overflow: 'hidden' }}>
      <Audio src={staticFile('audio/take1-mix.wav')} />
      {scene === 'stack' && <SubStack t={t} />}
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
          {chart && <ChartLine t={t} />}
          <WorldProps t={t} frame={frame} />
          {ps.map((p, i) => <PointerArrow key={i} p={p} size={psize * puff} />)}
        </div>
        {/* "blinded": the big screen's glare overexposes the whole picture for a moment */}
        {glare > 0 && <AbsoluteFill style={{ background: '#FBF6FD', opacity: glare * 0.7 }} />}
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

/** Screens dim while the narrator whispers "however, recently...", so the one that changes is unmissable. */
const d0 = (t: number) => (t >= Q.however && t < Q.blinded ? ez(t, Q.however, Q.however + 0.9) : 0);

/** Lavender opening outward from the person's phone at "free ourselves". */
const Daylight: React.FC<{ t: number; cx: number; cy: number }> = ({ t, cx, cy }) => {
  const p = ez(t, Q.free, Q.free + 0.95, EASE_IN_OUT);
  const r = p * 175;
  // WHY a wide soft edge and a quick open: a slow, hard-edged circle read as a glowing ball for a moment
  const mask = `radial-gradient(circle farthest-corner at ${cx}px ${cy}px, #000 ${Math.max(0, r - 55)}%, transparent ${r}%)`;
  return <AbsoluteFill style={{ background: 'linear-gradient(180deg,#FBF6FD 0%,#F7F0FB 45%,#EEDDF6 100%)', WebkitMaskImage: p >= 1 ? undefined : mask, maskImage: p >= 1 ? undefined : mask }} />;
};

/** "Shareholder value": a profit line drawn straight up across the wall, dry as the narrator. */
const ChartLine: React.FC<{ t: number }> = ({ t }) => {
  const p = ez(t, Q.shareholder + 0.1, Q.but - 0.1, EASE_IN_OUT);
  const pts: [number, number][] = [[-2700, 560], [-2100, 380], [-1700, 470], [-1100, 120], [-700, 200], [-100, -280], [300, -200], [900, -720], [1300, -640], [1900, -1160], [2500, -1600]];
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${q[1]}`).join(' ');
  return (
    <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1} height={1}>
      <path d={d} fill="none" stroke="#21152C" strokeOpacity="0.55" strokeWidth={46} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} transform="translate(10 24)" />
      <path d={d} fill="none" stroke="#F3EAF9" strokeWidth={30} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} />
    </svg>
  );
};

/** Things that live in the world but are not screens: price tags, the lifted belongings, the carried caret, copies. */
const WorldProps: React.FC<{ t: number; frame: number }> = ({ t, frame }) => {
  const k = HERO.w / 100;
  const kinds = ['photo', 'msg', 'note'] as const;
  // price ticking: up in line 2, down to nothing in line 7
  const up = [9.99, 11.99, 12.99, 14.99];
  const upI = Math.min(3, Math.floor(lin(t, Q.costWord, Q.costWord + 0.7) * 3.999));
  const downP = ez(t, Q.costs + 0.05, Q.costs + 0.55, EASE_IN_OUT);
  const tagPrice = t < Q.costs ? up[upI] : 14.99 * (1 - downP);
  const tagText = t >= Q.costs && downP >= 1 ? 'free' : `$${tagPrice.toFixed(2)}`;
  const heroUp = [4.99, 5.99, 6.99, 7.99][upI];
  return (
    <>
      {/* WHY only in these windows: hanging beside the hero phone it stole the eye from the request being typed */}
      {(t < Q.data || t >= Q.costs) && <PriceTag x={TT.cx - TT.w / 2 + 70} y={TT.cy - TT.h / 2 - 6} t={t} drop={Q.cost + 0.15} text={tagText} fall={lin(t, Q.costs + 0.75, Q.costs + 1.5)} />}
      {t < Q.data && <PriceTag x={HERO.cx} y={HERO.cy - HERO.h / 2 - 8} t={t} drop={Q.cost + 0.25} text={`$${heroUp.toFixed(2)}`} scale={0.8} />}
      {/* (5) the new button comes with a new price */}
      {t >= Q.believed && t < Q.shareholder && WORLD.devs.filter((d) => d.row === -1 && Math.abs(d.cx) > 300 && Math.abs(d.cx) < 1600 && d.kind !== 'phone').map((d, i) => (
        <PriceTag key={d.id} x={d.cx - d.w / 2 + 60} y={d.cy - d.h / 2 - 6} t={t} drop={Q.believed + i * 0.25} text="+$20" scale={1.4} />
      ))}
      {/* (2) the person's things, carried off; (7) carried back */}
      {kinds.map((kind, i) => {
        const r = itemRect(kind); const g = GRAB[kind];
        let x = r.x, y = r.y, sc = 1, o = 0, sh = 0;
        if (t >= g && t < Q.weAll) {
          const lift = ez(t, g, g + 0.25);
          const away = ez(t, g + 0.25, g + 1.05, EASE_IN_OUT);
          x = r.x + (90 - i * 60) * away; y = r.y - 12 * lift - (r.y + 760) * away;
          sc = 1 + 0.08 * lift; o = 1; sh = lift;
        }
        const back = Q.ourData + 0.15 + i * 0.28;
        if (t >= Q.ourData && t < back + 0.9) {
          const p = ez(t, back, back + 0.75, EASE_IN_OUT);
          const target = { x: HERO.cx - r.w / 2, y: HERO.cy - r.h / 2 + (i - 1) * 40 };
          x = target.x + (60 - i * 60) * (1 - p); y = -900 + (target.y + 900) * p;
          sc = 1.1 - 0.5 * ez(t, back + 0.5, back + 0.85); o = 1 - ez(t, back + 0.6, back + 0.88); sh = 1 - p * 0.6;
        }
        if (o <= 0) return null;
        return (
          <div key={kind} style={{ position: 'absolute', left: x, top: y, width: r.w, height: r.h, opacity: o, transform: `scale(${sc})`, borderRadius: 3 * k,
            boxShadow: `0 ${10 * sh}px ${22 * sh}px rgba(10,4,18,0.5)` }}>
            <OwnCard kind={kind} w={r.w} h={r.h} k={k} />
          </div>
        );
      })}
      {/* (5) the caret, carried onto the big screen by a pointer */}
      {t >= Q.created1 + 0.35 && t < CARET_PLACED && (() => {
        const [px, py] = kf(t, [[Q.created1 + 0.35, 760, TV.cy - 40], [CARET_PLACED, CARET_TV.x + 6, CARET_TV.y + 30]]);
        const fs = TV_CARET * (TV.h / 100);
        return <div style={{ position: 'absolute', left: px - 12, top: py - 34, width: fs * 0.1, height: fs * 1.02, borderRadius: fs, background: C.purple, boxShadow: '0 10px 18px rgba(10,4,18,0.45)' }} />;
      })()}
      {/* (9) copies of the recipes hop to two other screens */}
      {SHARE_TARGETS.map((id, i) => {
        const d = dev(id); const sa = Q.longLast + 0.35 + i * 0.45;
        const p = lin(t, sa - 0.6, sa);
        if (p <= 0 || p >= 1) return null;
        const e = EASE_IN_OUT(p);
        const x = HERO.cx + (d.cx - HERO.cx) * e, y = HERO.cy + (d.cy - HERO.cy) * e - Math.sin(Math.PI * e) * 520;
        const w = HERO.w * 0.9, h = HERO.h * 0.9;
        return (
          <div key={id} style={{ position: 'absolute', left: x - w / 2, top: y - h / 2, width: w, height: h, borderRadius: 16, overflow: 'hidden', transform: `rotate(${(1 - e) * -8 + e * 6}deg)`,
            boxShadow: '0 24px 48px rgba(74,38,110,0.35)', opacity: Math.min(1, p * 5) }}>
            <Recipes w={w} h={h} p={1} />
          </div>
        );
      })}
    </>
  );
};
