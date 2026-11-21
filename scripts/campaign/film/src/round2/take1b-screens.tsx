// Take 1B: what is drawn ON the screens. Two kinds of picture:
//  1. The SAME screen: one bland, tidy, invented layout every device shows, because a few companies decided it
//     (deliberately NOT youcoded; their "AI" tile is invented too).
//  2. The REAL youcoded window, as a library of real stills in real themes (section 2 below). Nothing of the
//     app's own interface is drawn in this file: the owner (2026-11-20) wanted every "someone's own" screen to be
//     a real window, and the invented "ask" bar and drawn mini-apps are gone.
import React from 'react';
import { Img, staticFile } from 'remotion';
import { DMSANS, OUTFIT } from '../brand';
import { WORLD } from './take1b-world';
import ROWS_JSON from '../../public/stills/r4/rows.json';
import GLOW_JSON from './take1b-glow.json';

const cl = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = cl(x); return t * t * (3 - 2 * t); };
/** Blends two #rrggbb colours. WHY: tile colours change by blending over the same 6 frames as the layout moves, never a hard swap */
const mixHex = (a: string, b: string, p: number) => {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((A >> sh) & 255) + (((B >> sh) & 255) - ((A >> sh) & 255)) * p);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};
/** One piece of a screen arriving during a build: `p` is the build (0..1), `i` its order among `n`. */
const rise = (p: number, i: number, n: number, k: number): React.CSSProperties => {
  // WHY this shape: piece i arrives while the build passes i/(n+1) .. (i+1)/(n+1), so pieces land one after another
  const t = smooth(p * (n + 1) - i);
  return { opacity: t, transform: `translateY(${(1 - t) * 6 * k}px) scale(${0.96 + 0.04 * t})` };
};
type R = { x: number; y: number; w: number; h: number };
const box = (r: R, w: number, h: number): React.CSSProperties => ({ position: 'absolute', left: r.x * w, top: r.y * h, width: r.w * w, height: r.h * h });

// =====================================================================================================
// 1. The same screen
// =====================================================================================================
// WHY near-white: the reviewer measured the old grey-lavender screens as muddy on the dark wall; real screens
// read as the brightest thing in a dark room, which is what makes the wall pop.
const S = { bg: '#F6F3F9', card: '#FFFFFF', tile: '#DDD5E6', tile2: '#CBC0D8', ink: '#2A2034', ink2: '#8C8298', line: '#E3DCEA' };

type Rects = { photo: R; msg: R; note: R; grid: R };
// WHY three whole layouts (not a tile shuffle): "they dictated how you interact" has to be visible from across
// the room. One synchronised click moves every block on every screen to the same new place at the same time.
const LAYOUTS: { portrait: Rects[]; wide: Rects[] } = {
  portrait: [
    { photo: { x: 0.07, y: 0.15, w: 0.86, h: 0.19 }, msg: { x: 0.07, y: 0.37, w: 0.86, h: 0.1 }, note: { x: 0.07, y: 0.5, w: 0.86, h: 0.09 }, grid: { x: 0.07, y: 0.62, w: 0.86, h: 0.27 } },
    { grid: { x: 0.07, y: 0.15, w: 0.86, h: 0.27 }, photo: { x: 0.07, y: 0.45, w: 0.86, h: 0.19 }, msg: { x: 0.07, y: 0.67, w: 0.86, h: 0.1 }, note: { x: 0.07, y: 0.8, w: 0.86, h: 0.09 } },
    { msg: { x: 0.07, y: 0.15, w: 0.86, h: 0.1 }, grid: { x: 0.07, y: 0.28, w: 0.86, h: 0.27 }, note: { x: 0.07, y: 0.58, w: 0.86, h: 0.09 }, photo: { x: 0.07, y: 0.7, w: 0.86, h: 0.19 } },
  ],
  wide: [
    { photo: { x: 0.25, y: 0.17, w: 0.37, h: 0.4 }, msg: { x: 0.65, y: 0.17, w: 0.31, h: 0.18 }, note: { x: 0.65, y: 0.39, w: 0.31, h: 0.18 }, grid: { x: 0.25, y: 0.63, w: 0.71, h: 0.24 } },
    { grid: { x: 0.25, y: 0.17, w: 0.71, h: 0.24 }, photo: { x: 0.25, y: 0.47, w: 0.37, h: 0.4 }, msg: { x: 0.65, y: 0.47, w: 0.31, h: 0.18 }, note: { x: 0.65, y: 0.69, w: 0.31, h: 0.18 } },
    { msg: { x: 0.25, y: 0.17, w: 0.31, h: 0.18 }, note: { x: 0.25, y: 0.39, w: 0.31, h: 0.18 }, photo: { x: 0.59, y: 0.17, w: 0.37, h: 0.4 }, grid: { x: 0.25, y: 0.63, w: 0.71, h: 0.24 } },
  ],
};
const lerpR = (a: R, b: R, p: number): R => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, w: a.w + (b.w - a.w) * p, h: a.h + (b.h - a.h) * p });
/** Where every block sits for a layout value `lay` (0, 1, 2, or in between while it moves). */
export const sameLayout = (w: number, h: number, lay = 0): Rects & { portrait: boolean } => {
  const portrait = h > w;
  const L = portrait ? LAYOUTS.portrait : LAYOUTS.wide;
  const i = Math.max(0, Math.min(1, Math.floor(lay))), p = smooth(lay - i);
  const a = L[i], b = L[Math.min(2, i + 1)];
  return { photo: lerpR(a.photo, b.photo, p), msg: lerpR(a.msg, b.msg, p), note: lerpR(a.note, b.note, p), grid: lerpR(a.grid, b.grid, p), portrait };
};
const gridDims = (w: number, h: number, portrait: boolean) => (portrait ? { cols: 3, rows: 2 } : { cols: 6, rows: 1 });
/** Centre of tile `i` in screen pixels: the film aims a pointer at it. */
export const tileCenter = (w: number, h: number, lay: number, i: number) => {
  const L = sameLayout(w, h, lay); const g = L.grid; const { cols, rows } = gridDims(w, h, L.portrait);
  const k = Math.min(w, h) / 100, gx = 2.4 * k;
  const tw = (g.w * w - gx * (cols - 1)) / cols, th = (g.h * h - gx * (rows - 1)) / rows;
  return { x: g.x * w + (i % cols) * (tw + gx) + tw / 2, y: g.y * h + Math.floor(i / cols) * (th + gx) + th / 2 };
};

/** A photo drawn as a soft little landscape: the person's own picture (no stock imagery). */
export const PhotoThumb: React.FC<{ w: number; h: number; v: number; r: number }> = ({ w, h, v, r }) => {
  const skies = [['#F6C9A8', '#E79B9B'], ['#BFD8EE', '#E6D7F2'], ['#F3DFA2', '#EFB49A']][v % 3];
  const hills = ['#7E9C7A', '#6F8FB0', '#B4826E'][v % 3];
  return (
    <svg width={w} height={h} viewBox="0 0 100 70" preserveAspectRatio="xMidYMid slice" style={{ display: 'block', borderRadius: r }}>
      <defs><linearGradient id={`sky${v}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={skies[0]} /><stop offset="1" stopColor={skies[1]} /></linearGradient></defs>
      <rect width="100" height="70" fill={`url(#sky${v})`} />
      <circle cx={v === 1 ? 72 : 30} cy="26" r="9" fill="#FFF5E4" opacity="0.9" />
      <path d={v === 1 ? 'M0 52 Q25 38 50 50 T100 44 V70 H0Z' : 'M0 48 Q30 30 60 46 T100 40 V70 H0Z'} fill={hills} />
      <path d="M0 60 Q40 50 100 58 V70 H0Z" fill={hills} opacity="0.7" />
    </svg>
  );
};

/** The three personal things on the same screen. */
export const OwnCard: React.FC<{ kind: 'photo' | 'msg' | 'note'; w: number; h: number; k: number; old?: boolean }> = ({ kind, w, h, k, old = false }) => {
  // WHY a bevelled, gradient card in the old skin: part of the ten-year-old look the wall starts in
  const base: React.CSSProperties = { width: w, height: h, background: old ? 'linear-gradient(180deg,#FFFFFF,#E8ECF0)' : S.card, borderRadius: (old ? 2 : 3) * k, boxSizing: 'border-box', overflow: 'hidden', fontFamily: DMSANS,
    border: old ? `${0.3 * k}px solid #B9C1CA` : undefined, boxShadow: old ? `0 ${0.4 * k}px ${0.8 * k}px rgba(0,0,0,0.2)` : undefined };
  if (kind === 'photo') {
    const g = 2 * k, tw = (w - g * 4) / 3;
    return (
      <div style={{ ...base, padding: g, display: 'flex', flexDirection: 'column', gap: g * 0.8 }}>
        <div style={{ fontSize: 4.2 * k, fontWeight: 700, color: S.ink }}>Photos</div>
        <div style={{ display: 'flex', gap: g, flex: 1 }}>
          {[0, 1, 2].map((v) => <div key={v} style={{ width: tw, flex: 'none' }}><PhotoThumb w={tw} h={Math.max(1, h - g * 3 - 5 * k)} v={v} r={1.6 * k} /></div>)}
        </div>
      </div>
    );
  }
  if (kind === 'msg') return (
    <div style={{ ...base, padding: 2.2 * k, display: 'flex', alignItems: 'center', gap: 2 * k }}>
      <div style={{ width: 7 * k, height: 7 * k, borderRadius: 7 * k, background: '#E7B7A3', flex: 'none' }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 3.6 * k, fontWeight: 700, color: S.ink }}>Sam</div>
        <div style={{ fontSize: 3.3 * k, color: S.ink2, whiteSpace: 'nowrap' }}>running late!</div>
      </div>
    </div>
  );
  return (
    <div style={{ ...base, padding: 2.2 * k, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ fontSize: 3.6 * k, fontWeight: 700, color: S.ink }}>Note</div>
      <div style={{ fontSize: 3.3 * k, color: S.ink2, whiteSpace: 'nowrap' }}>pick up Mia at 3:15</div>
    </div>
  );
};

/** A padlock badge. `p` 0..1 is its arrival over 0.4 s. WHY a small solid badge in the tile's corner (round 7 reviewer: big brass
 *  emoji-style padlocks filling muddy tiles read as clip art): it is how a real system marks something you may not use. It drops in
 *  over 4 frames from a little above and larger, then settles; `off` 0..1 knocks it loose and away (line 7, when the tile is freed). */
const Lock: React.FC<{ s: number; p: number; off: number }> = ({ s, p, off }) => {
  const d = cl(p / 0.33);                       // 4 frames of a 0.4 s arrival
  const drop = d < 1 ? (1 - d * d) : 0;
  const settle = d >= 1 ? Math.sin(Math.PI * cl((p - 0.33) / 0.17)) : 0;
  const sc = 1 + 0.35 * drop - 0.06 * settle;
  return (
    <div style={{ width: s, height: s, borderRadius: s * 0.3, background: '#2A2034', display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: (d > 0 ? 1 : 0) * (1 - smooth(off * 1.6)), boxShadow: `0 ${s * 0.08}px ${s * 0.18}px rgba(30,14,44,0.45)`,
      transform: `translate(0, ${-drop * s * 0.6 + off * s * 1.4}px) rotate(${off * 50}deg) scale(${sc})` }}>
      <svg width={s * 0.62} height={s * 0.62} viewBox="0 0 24 24">
        <path d="M7.6 11V8.2a4.4 4.4 0 0 1 8.8 0V11" stroke="#F3EAF9" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <rect x="4.5" y="10.4" width="15" height="11" rx="2.6" fill="#F3EAF9" />
      </svg>
    </div>
  );
};

/** One of the five plain, wordless marks of "a small handful of corporations" (no real logos): circle, square, triangle, ring, bar. */
export const CorpMark: React.FC<{ i: number; s: number; color: string }> = ({ i, s, color }) => (
  <svg width={s} height={s} viewBox="0 0 20 20" style={{ display: 'block' }}>
    {i === 0 && <circle cx="10" cy="10" r="8.5" fill={color} />}
    {i === 1 && <rect x="2" y="2" width="16" height="16" rx="2.5" fill={color} />}
    {i === 2 && <path d="M10 1.8 L18.6 17.6 H1.4 Z" fill={color} strokeLinejoin="round" />}
    {i === 3 && <circle cx="10" cy="10" r="7" fill="none" stroke={color} strokeWidth="3.6" />}
    {i === 4 && <rect x="1.5" y="6.5" width="17" height="7" rx="3.5" fill={color} />}
  </svg>
);

/** Which of the five marks a device's generic screen carries. WHY dealt along each shelf and offset by two per shelf: neighbours on a
 *  shelf, and the screens above and below, never carry the same mark, so all five are seen together in any close-up of three or four */
const MARKS: Map<string, number> = (() => {
  const m = new Map<string, number>();
  for (const r of new Set(WORLD.devs.map((d) => d.row))) {
    WORLD.devs.filter((d) => d.row === r).sort((a, b) => a.cx - b.cx).forEach((d, i) => m.set(d.id, (i + r * 2 + 50) % 5));
  }
  return m;
})();
export const markFor = (id: string) => MARKS.get(id) ?? 0;

// WHY a new tile in their OWN app instead of an "AI" app icon (round 8 reviewer BLOCKER: white "AI" letters on a squircle was the most
// literal stock picture of artificial intelligence, and it broke the film's own language): their new technology is simply one more card
// in the same locked, same-everywhere app the opening taught, with the same rounded white card style. It is labelled only "assistant",
// it has an empty text field with a caret (the caret is what later escapes), a padlock like every other locked thing, and a price.
/** The big card's place on a wide (TV) screen, as fractions of the screen: it covers the photo / message / note blocks of layout 2. */
export const NT = { x: 0.25, y: 0.17, w: 0.71, h: 0.4 };
/** Its text field, as fractions of the card. The caret sits CARET_X into the card, centred in the field. */
export const NT_FIELD = { x: 0.055, y: 0.47, w: 0.56, h: 0.36 };
export const NT_CARET_X = NT_FIELD.x + 0.035;
/** One step of a build: 0 before `a`, eased to 1 over `d` seconds. */
const step01 = (t: number, a: number, d = 0.28) => smooth((t - a) / d);
/** The big new card on the TV, building itself in steps: card, then field (with its caret), then padlock.
 *  `t` is the film time; the step times come from the film's phrase cues. `caretOn` blinks the field's caret. */
export const NewTile: React.FC<{ w: number; h: number; t: number; card: number; field: number; lock: number; caretOn: boolean; caretGone: boolean }> = ({ w, h, t, card, field, lock, caretOn, caretGone }) => {
  const c = step01(t, card, 0.3), f = step01(t, field, 0.3);
  if (c <= 0) return null;
  const k = Math.min(w, h) / 100;
  const fx = NT_FIELD.x * w, fy = NT_FIELD.y * h, fw = NT_FIELD.w * w, fh = NT_FIELD.h * h;
  // WHY a slight overshoot on the card only: it "arrives" like the other blocks do when the layout is dictated, then the
  // field and padlock land on it one after another, each on its own spoken word
  const pop = 0.94 + 0.06 * c + 0.025 * Math.sin(Math.PI * c);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: Math.min(1, c * 1.6), transform: `scale(${pop})`, transformOrigin: '50% 60%', background: S.card, borderRadius: 3.2 * k,
      boxShadow: `0 ${1.4 * k}px ${4 * k}px rgba(40,20,60,${0.22 * c})`, fontFamily: DMSANS, overflow: 'visible' }}>
      <div style={{ position: 'absolute', left: NT_FIELD.x * w, top: 0.1 * h, fontSize: 21 * k, fontWeight: 800, letterSpacing: '-0.035em', color: S.ink }}>assistant</div>
      <div style={{ position: 'absolute', left: fx, top: fy, width: fw, height: fh, borderRadius: fh / 2, background: S.bg, border: `${0.5 * k}px solid ${S.line}`, boxSizing: 'border-box',
        opacity: f, transform: `translateY(${(1 - f) * 3 * k}px)` }}>
        {/* the caret: a thin solid text cursor, the one thing on this card that will get away from them */}
        {!caretGone && <div style={{ position: 'absolute', left: (NT_CARET_X - NT_FIELD.x) * w - 0.8 * k, top: fh * 0.19 - 0.5 * k, width: 1.6 * k, height: fh * 0.62, borderRadius: 0.8 * k, background: '#9750AA', opacity: caretOn ? 1 : 0 }} />}
      </div>
      {/* the padlock sits at the field's end, like a locked input */}
      {lock > 0 && <div style={{ position: 'absolute', left: fx + fw + 3 * k, top: fy + fh / 2 - 7.5 * k }}><Lock s={15 * k} p={lock} off={0} /></div>}
    </div>
  );
};

/** The corporations' AI: one plain, heavy, near-black tile. WHY so plain: it is theirs (invented, not youcoded) and the
 *  whole point of it is the price hung on it; the second letter is a bare bar so it can lift off as the caret. */
export const AiTile: React.FC<{ s: number; caret?: number; bar?: boolean }> = ({ s, caret = 1, bar = true }) => (
  <div style={{ width: s, height: s, borderRadius: s * 0.24, background: 'linear-gradient(180deg,#2B2036,#171020)', boxShadow: `0 ${s * 0.06}px ${s * 0.18}px rgba(20,8,32,0.45), inset 0 ${s * 0.012}px 0 rgba(255,255,255,0.16)`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DMSANS, fontWeight: 900, fontSize: s * 0.5, letterSpacing: '-0.03em', color: '#F7F1FA', flex: 'none' }}>
    {/* WHY a whole "AI" with the blinking bar beside it (reviewer: the I was the caret, so the word flickered between A and AI):
        the letters never change; the bar is the separate thing that later escapes */}
    AI{bar && <span style={{ display: 'inline-block', width: s * 0.06, height: s * 0.36, borderRadius: s * 0.03, background: '#B06CC4', marginLeft: s * AI_GAP, opacity: caret }} />}
  </div>
);
/** the gap between the "I" and the bar, as a fraction of the tile (shared so the film can aim the escaping caret at the bar) */
export const AI_GAP = 0.1;

export type SameProps = {
  w: number; h: number;
  /** the layout, 0..2 (in between while every block slides to its new place) */
  lay?: number;
  /** 0..1 "Your layout has been updated" banner */
  banner?: number;
  /** padlocks: one arrival value for every locked tile, or one per tile; `unlock` 0..1 knocks them off */
  lock?: number | number[]; unlock?: number;
  /** 0..1 "Terms have changed" dialog; `accept` 0..1 its button pressed and the dialog gone */
  dialog?: number; accept?: number;
  /** 0..1 the companies' new "AI" tile stamped onto the screen; `price` 0..1 its $20/mo chip popping on */
  ai?: number; price?: number;
  /** 0..1 hides the title (a banner or switch is using its row) */
  hideTitle?: number;
  /** 0 = the same app's ten-year-old skin (glossy, gradients), 1 = today's flat one. WHY: "for more than a decade" is acted out:
   *  every screen jumps a decade in the same frame and is still identical everywhere */
  era?: number;
  /** which of the five corporations' marks replaces the "Standard" chip (-1: the chip); `markPop` 0..1 its arrival, `markPulse` 0..1 a shared beat */
  mark?: number; markPop?: number; markPulse?: number;
};

export const SameScreen: React.FC<SameProps> = ({ w, h, lay = 0, banner = 0, lock = 0, unlock = 0, dialog = 0, accept = 0, ai = 0, price = 0, hideTitle = 0, era = 1, mark = -1, markPop = 0, markPulse = 0 }) => {
  const k = Math.min(w, h) / 100;
  const L = sameLayout(w, h, lay);
  const P = L.portrait;
  const { cols, rows } = gridDims(w, h, P);
  const g = L.grid;
  const gx = 2.4 * k;
  const tw = (g.w * w - gx * (cols - 1)) / cols, th = (g.h * h - gx * (rows - 1)) / rows;
  // WHY three colour sets that each click blends into (round 7 reviewer: a 2-frame hop of a few pixels was invisible across the room):
  // warm pastels first; "dictated" turns every screen's tiles cool and grey-blue in the same 6 frames as the blocks move; the second
  // order turns them again. One click, every screen, the same new look.
  const HUE_SETS = [
    ['#EFA98B', '#F2C57C', '#E89AA8', '#F0B98E', '#E7A3C4', '#F4D08A'],
    ['#8FAFD6', '#9DB8C9', '#A9A6D6', '#8EC2C0', '#B4BFD0', '#93A7E0'],
    ['#7FA6CF', '#B9A3D8', '#86B8AE', '#A7B5C6', '#9C9FD9', '#8DB9D3'],
  ];
  const seg = Math.max(0, Math.min(1, Math.floor(lay)));
  const tileHues = HUE_SETS[seg].map((c, i) => mixHex(c, HUE_SETS[Math.min(2, seg + 1)][i], smooth(lay - seg)));
  const lockOf = (i: number) => (Array.isArray(lock) ? lock[i] ?? 0 : i % 3 !== 0 ? lock : 0);
  // WHY one decisive press (round 7 reviewer: a 7% wobble nobody could see): `accept` runs 0..1 over half a second. The button darkens and
  // sinks in its first 2 frames, holds pressed, then the whole dialog drops 12 px and fades
  const pressed = accept > 0 ? 1 : 0;
  const sink = cl(accept / 0.13);
  const leave = smooth((accept - 0.3) / 0.5);
  const dlg = smooth(dialog) * (1 - leave);
  const old = era < 0.5;
  const titleO = 1 - smooth(Math.max(hideTitle, 0) * 5);
  // the corporations' mark, or the plain plan chip before they are named
  const mk = mark >= 0 && markPop > 0;
  const markS = (P ? 9 : 8.5) * k;
  return (
    <div style={{ position: 'absolute', inset: 0, background: old ? 'linear-gradient(180deg,#EEF0F3,#D9DDE3)' : S.bg, overflow: 'hidden', fontFamily: DMSANS }}>
      {/* WHY a glossy title bar in the old skin: the 2014 look (gradients, gloss, bevels), so the jump to today is seen across the wall */}
      {old && <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: (P ? 0.14 : 0.16) * h, background: 'linear-gradient(180deg,#7C8A99 0%,#55626F 52%,#4A5663 53%,#5C6977 100%)', boxShadow: `inset 0 ${0.4 * k}px 0 rgba(255,255,255,0.45), 0 ${0.6 * k}px ${1.6 * k}px rgba(0,0,0,0.3)` }} />}
      {/* status row */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: (P ? 0.065 : 0.09) * h, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${5 * k}px`, fontSize: 3.2 * k, fontWeight: 700, color: old ? '#F4F6F8' : S.ink }}>
        <span>9:41</span><span style={{ display: 'flex', gap: 1 * k }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 2 * k, height: 2 * k, borderRadius: k, background: old ? '#DDE2E7' : S.ink2 }} />)}</span>
      </div>
      {/* WHY real words in the sidebar (round 7 reviewer: five grey bars read as a wireframe, not a product) */}
      {!P && <div style={{ position: 'absolute', left: 0, top: old ? 0.16 * h : 0, bottom: 0, width: 0.2 * w, background: old ? 'linear-gradient(90deg,#E3E7EC,#D3D8DF)' : '#ECE6F2' }}>
        {['Home', 'Photos', 'Messages', 'Settings'].map((l, i) => <div key={l} style={{ position: 'absolute', left: 4 * k, top: (old ? 0.06 : 0.19) * h + i * 0.1 * h, fontSize: 3.4 * k, fontWeight: i === 0 ? 800 : 600, color: S.ink, opacity: i === 0 ? 0.62 : 0.35, whiteSpace: 'nowrap' }}>{l}</div>)}
      </div>}
      <div style={{ position: 'absolute', left: (P ? 0.07 : 0.25) * w, top: (old ? 0.072 : 0.075) * h, fontSize: 6 * k, fontWeight: 900, letterSpacing: '-0.03em', color: old ? '#FFFFFF' : S.ink, textShadow: old ? `0 ${-0.3 * k}px 0 rgba(0,0,0,0.35)` : undefined, opacity: titleO }}>Good morning</div>
      {/* WHY the "Standard" chip becomes one of five plain marks on "a small handful" (round 7 reviewer: five stray cursors did not read as
          corporations): who decides is printed on every screen, dealt out so that neighbours differ, and all five pulse together on "dictated" */}
      {!mk && <div style={{ position: 'absolute', right: (P ? 0.07 : 0.05) * w, top: (P ? 0.085 : 0.1) * h, padding: `${0.6 * k}px ${2 * k}px`, borderRadius: 4 * k, background: old ? 'linear-gradient(180deg,#F5F7F9,#C9D0D8)' : S.tile, color: S.ink, fontSize: 2.8 * k, fontWeight: 700, opacity: titleO }}>Standard</div>}
      {mk && <div style={{ position: 'absolute', right: (P ? 0.07 : 0.05) * w, top: (P ? 0.078 : 0.085) * h, opacity: titleO * smooth(markPop * 2), transform: `scale(${(0.4 + 0.6 * smooth(markPop) + 0.25 * Math.sin(Math.PI * cl(markPop))) * (1 + 0.15 * Math.sin(Math.PI * cl(markPulse)))})`, transformOrigin: '50% 50%' }}>
        <CorpMark i={mark} s={markS} color="#2A2034" />
      </div>}
      {(['photo', 'msg', 'note'] as const).map((kind) => (
        <div key={kind} style={box(L[kind], w, h)}><OwnCard kind={kind} w={L[kind].w * w} h={L[kind].h * h} k={k} old={old} /></div>
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const x = g.x * w + (i % cols) * (tw + gx), y = g.y * h + Math.floor(i / cols) * (th + gx);
        const lk = lockOf(i);
        const lo = smooth(lk * 2.5) * (1 - smooth(unlock));
        // WHY a locked tile keeps its own colour at 30% saturation and its icon dims (round 7 reviewer: the old lock turned tiles to mud)
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, width: tw, height: th, borderRadius: (old ? 4 : 3) * k, background: tileHues[i], display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: old ? `inset 0 ${0.5 * k}px 0 rgba(255,255,255,0.7), inset 0 ${-0.6 * k}px 0 rgba(0,0,0,0.18), 0 ${0.4 * k}px ${0.8 * k}px rgba(0,0,0,0.25)` : undefined,
            filter: lo > 0 ? `saturate(${1 - 0.7 * lo}) brightness(${1 - 0.04 * lo})` : undefined, overflow: 'visible' }}>
            {old && <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '50%', borderRadius: `${4 * k}px ${4 * k}px 0 0`, background: 'linear-gradient(180deg,rgba(255,255,255,0.55),rgba(255,255,255,0.12))' }} />}
            <div style={{ width: Math.min(tw, th) * 0.42, height: Math.min(tw, th) * 0.42, borderRadius: Math.min(tw, th) * 0.14, background: 'rgba(255,255,255,0.55)', opacity: 1 - 0.6 * lo }} />
            {lk > 0 && <div style={{ position: 'absolute', right: -tw * 0.06, top: -tw * 0.06 }}><Lock s={Math.max(tw, th) * 0.3} p={lk} off={unlock} /></div>}
          </div>
        );
      })}
      {/* WHY a small notice that drops in from the top edge (round 7 reviewer: the old dark pill covered the title row): "Good morning" stays readable under it */}
      {banner > 0 && <div style={{ position: 'absolute', left: '50%', top: 0.008 * h, height: (P ? 0.045 : 0.06) * h, padding: `0 ${4 * k}px`, borderRadius: 4 * k, background: '#43354E', color: '#F3EAF9',
        fontSize: 3.2 * k, fontWeight: 800, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', boxShadow: `0 ${k}px ${3 * k}px rgba(30,14,44,0.35)`,
        transform: `translate(-50%, ${(smooth(banner / 0.28) - 1) * 12 * k}px)`, opacity: 1 - smooth((banner - 0.85) * 6) }}>Layout updated</div>}
      {/* their machine's tile, stamped on top of everything, with its price beside it (the same tile as on the big screen).
          WHY a plain tile and no bar: the corporations' AI is theirs, not youcoded, and not somewhere you type */}
      {/* WHY in place, never a sticker (round 8 reviewer: dark "AI" badges pasted on every screen read as clip art and cluttered the
          payoff shots): their new card simply replaces the note card on every screen, same size, same card style, with a padlock, so
          the whole wall changes in a ripple without anything being pasted on top. `price` is no longer drawn here (the TV carries it). */}
      {ai > 0 && (() => {
        const r = L.note;
        const e = smooth(ai);
        const fs = (P ? 3.4 : 3.3) * k;
        return (
          <div style={{ ...box(r, w, h), background: S.card, borderRadius: 3 * k, overflow: 'hidden', opacity: Math.min(1, e * 1.4), transform: `scale(${0.9 + 0.1 * e + 0.04 * Math.sin(Math.PI * e)})`,
            boxShadow: `0 0 0 ${0.4 * k}px ${S.line}`, padding: `${1.4 * k}px ${2.2 * k}px`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0.9 * k }}>
            <div style={{ fontSize: fs, fontWeight: 800, color: S.ink, lineHeight: 1 }}>assistant</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 1.2 * k }}>
              <div style={{ flex: 1, height: 2.6 * k, borderRadius: 2 * k, background: S.bg, boxShadow: `inset 0 0 0 ${0.3 * k}px ${S.line}` }} />
              <div style={{ width: 2.8 * k, height: 2.8 * k, borderRadius: 0.8 * k, background: '#2A2034', flex: 'none' }} />
            </div>
          </div>
        );
      })()}
      {/* "Terms have changed": the same dialog, accepted by everyone */}
      {dlg > 0 && <>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(40,28,52,0.42)', opacity: dlg }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: (P ? 0.84 : 0.56) * w, transform: `translate(-50%,calc(-50% + ${leave * 4 * k}px)) scale(${0.9 + 0.1 * smooth(dialog)})`, opacity: dlg,
          background: '#FBF9FC', borderRadius: 4 * k, padding: 4 * k, boxSizing: 'border-box', boxShadow: `0 ${2 * k}px ${6 * k}px rgba(40,20,60,0.3)` }}>
          <div style={{ fontSize: (P ? 8.4 : 8.8) * k, fontWeight: 900, color: S.ink, letterSpacing: '-0.03em', lineHeight: 1.05 }}>Our terms have changed</div>
          {[0.95, 0.8, 0.9].map((f, i) => <div key={i} style={{ height: 1.5 * k, width: `${f * 100}%`, background: S.line, borderRadius: k, marginTop: 1.5 * k }} />)}
          <div style={{ marginTop: 3.5 * k, height: 12 * k, borderRadius: 8 * k, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6.6 * k, fontWeight: 700,
            background: pressed ? '#21172A' : '#5A5065', color: '#fff', transform: `translateY(${sink * 0.9 * k}px) scaleY(${1 - 0.06 * Math.sin(Math.PI * sink)})`,
            boxShadow: pressed ? `inset 0 ${0.6 * k}px ${1.2 * k}px rgba(0,0,0,0.45)` : `0 ${0.9 * k}px 0 #3A3043` }}>Accept</div>
        </div>
      </>}
    </div>
  );
};

/** "Share with partners": a switch on the phone that somebody else flips. `o` slides it in, `on` 0..1 flips it.
 *  WHY bigger, and the one saturated thing on the phone (reviewer 2026-11-20: a small grey-on-white row read as another stray control):
 *  a tall row with a large label, and a purple switch whose knob snaps across with a small overshoot. */
export const ShareSwitch: React.FC<{ w: number; h: number; o: number; on: number }> = ({ w, h, o, on }) => {
  const k = Math.min(w, h) / 100;
  if (o <= 0) return null;
  // WHY 1.8x bigger, full-contrast ink, sliding down instead of fading (round 7 reviewer: the key action of the line was small grey text):
  // the row drops 12 px into place; the knob crosses in 6 frames and the track fills purple behind it
  const slide = smooth(o);
  const snap = smooth(on);
  return (
    <div style={{ position: 'absolute', left: '4%', right: '4%', top: 0.052 * h, height: 0.088 * h, borderRadius: 3.6 * k, background: '#FFFFFF', boxShadow: `0 ${k}px ${3.5 * k}px rgba(40,20,60,0.3)`, fontFamily: DMSANS,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${3.5 * k}px`, fontSize: 7.4 * k, fontWeight: 800, letterSpacing: '-0.02em', color: '#21152C', whiteSpace: 'nowrap',
      opacity: Math.min(1, o * 4), transform: `translateY(${(slide - 1) * 3 * k}px)` }}>
      Share with partners
      <span style={{ width: 17.5 * k, height: 10 * k, borderRadius: 10 * k, background: mixHex('#CFC7D8', '#9750AA', snap), position: 'relative', flex: 'none' }}>
        <span style={{ position: 'absolute', top: 1 * k, left: 1 * k + snap * 7.5 * k, width: 8 * k, height: 8 * k, borderRadius: 8 * k, background: '#fff', boxShadow: `0 ${0.4 * k}px ${k}px rgba(30,10,40,0.35)` }} />
      </span>
    </div>
  );
};
/** Where the switch's knob sits, so a pointer can be aimed at it. */
export const shareKnob = (w: number, h: number) => { const k = Math.min(w, h) / 100; return { x: 0.96 * w - 3.5 * k - 7.5 * k, y: 0.125 * h }; };

/** The tablet-sized copy of the recipes that arrives on a neighbour's screen: what one person makes, others can use. */
export const SharedRecipe: React.FC<{ w: number; h: number; k: number }> = ({ w, h, k }) => (
  <div style={{ width: w, height: h, background: '#FBF3E6', borderRadius: 4 * k, overflow: 'hidden', boxShadow: `0 ${2 * k}px ${6 * k}px rgba(40,20,60,0.32)`, fontFamily: DMSANS, color: '#3B2418', boxSizing: 'border-box', padding: 4.5 * k, display: 'flex', flexDirection: 'column', gap: 2.2 * k }}>
    <div style={{ alignSelf: 'flex-start', fontSize: 4.6 * k, fontWeight: 700, color: '#fff', background: '#9750AA', borderRadius: 4 * k, padding: `${0.8 * k}px ${2.6 * k}px` }}>shared with you</div>
    <div style={{ fontSize: 4 * k, fontWeight: 700, letterSpacing: '0.04em', color: '#C4572E', textTransform: 'uppercase' }}>Grandma June's</div>
    <div style={{ fontSize: 9.5 * k, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.98 }}>Sunday lemon cake</div>
    <div style={{ flex: 1, borderRadius: 3 * k, background: 'linear-gradient(160deg,#F4D9A6,#E9B86F)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: '22%', right: '22%', bottom: '14%', height: '34%', borderRadius: '50% / 30%', background: '#FFF8EC' }} />
      <div style={{ position: 'absolute', left: '30%', right: '30%', bottom: '28%', height: '36%', borderRadius: `${2 * k}px ${2 * k}px ${k}px ${k}px`, background: 'linear-gradient(180deg,#FFF3C2 0 26%,#E8B35E 26% 100%)' }} />
    </div>
  </div>
);


// =====================================================================================================
// 2. The real app, as a library of real stills (public/stills/r4, made by take1b-library.mjs): the app's own
//    renderer in a shipped theme on a practice page, cut to the exact shape of each device so a still fills its
//    screen edge to edge. WHY nothing is drawn here any more (owner 2026-11-20): every "someone's own" screen is a
//    real youcoded window, each a different theme with a different page in focus. The default look is left out
//    of the wall on purpose: it is the one every stranger already has, so it would not read as "made mine".
//    Cotton Candy Sky and Meadow Mist are not in the library (the owner dislikes them).
// =====================================================================================================
type Row = { file: string; shape: 'phone' | 'tablet' | 'laptop' | 'tv'; theme: string; focus: string; typed?: { text: string; prefix: number[]; rect: number[]; dpr: number; fs: number } };
const ROWS = ROWS_JSON as Row[];
const GLOW = GLOW_JSON as Record<string, string>;
const R4 = (file: string) => `stills/r4/${file}`;
const hexRgba = (c: string) => { const n = parseInt(c.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},1)`; };

export type Look = { still: string; glow: string; key: string; theme: string };
export const lookOf = (file: string): Look => {
  const r = ROWS.find((x) => x.file === file);
  if (!r) throw new Error(`take1b: "${file}" is not in the still library (public/stills/r4/rows.json)`);
  return { still: R4(file), glow: hexRgba(GLOW[file]), key: file, theme: r.theme };
};

// The phone's untouched window (nothing asked yet), the same window with its box focused, and the box wiped clean
// so the request can be typed into it (take1b-prep.py).
// WHY Golden Sunbreak (round 5, reviewer BLOCKER: the default theme's lilac wallpaper read as Cotton Candy Sky, which the owner dislikes):
// a real community theme, a rainy-city painting in deep teal and gold that sits well on the plum-black wall. The three pictures are
// real captures of the real window (take1b-library.mjs: clean = greeting and placeholder hidden by CSS, cleanfocus = its own caret)
export const PHONE_EMPTY = R4('golden-sunbreak-phone-clean.png');
export const PHONE_FOCUS = R4('golden-sunbreak-phone-cleanfocus.png');
export const PHONE_CLEAN = R4('golden-sunbreak-phone-clean.png');
// WHY (round 8): the same window a moment after the request was really sent: its own bubble and its own working line
export const PHONE_WORKING = R4('golden-sunbreak-phone-working.png');

// The story's own devices get the looks their lines need. WHY these: the phone asked for "a page for my home" and
// gets the loud Halftone pack with exactly that page; the laptop that was locked gets a warm golden look (the
// laptop's turn is "what our computers can do"); the tablet that cost money is now free in a dramatic look of its own.
const FIXED: Record<string, Look> = {
  // round 6: the phone asks in Golden Sunbreak and the page comes back in the same look (a person's own look stays theirs)
  hero: lookOf('golden-sunbreak-phone-home.png'),
  // round 6: the laptop and the tablet each ask for a page in their own real look (take1b-library.mjs shot the box, the typed request and the page that arrives)
  lockLaptop: lookOf('devils-garden-laptop-lights.png'),
  // WHY a big thermostat page (round 5 reviewer: the desert chat's words were unreadable at a glance): a page that reads from across the room
  tagTablet: lookOf('halftone-dimension-tablet-paint.png'),
  tv: lookOf('morning-rounds-tv-money.png'),   // WHY (reviewer BLOCKER): the biggest tile in every wide shot was a licensed character look; this is a plain community theme
  // WHY fixed (round 8 reviewer BLOCKER: on "for anyone who asks" nobody but the phone was seen asking): the phone's two nearest
  // neighbours are seen asking too, each in its own light look, and each gets the page it asked for (their "working" pictures match)
  '0:l1': lookOf('light-phone-lights.png'),
  '-1:l1': lookOf('creme-tablet-paint.png'),
};
export const HERO_LOOK = FIXED.hero;
/** WHY one holdout (round 8 reviewer: nothing on screen answered "the tech monopolies of the past"): one monitor near the middle of the
 *  daylight wall keeps the old locked, priced app until the word "past", and is the last screen on the wall to become someone's own. */
export const HOLDOUT = '-1:r1';

/** A small seeded random generator. WHY seeded: the wall must come out the same on every render. */
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/** Every device's look, decided once for the whole wall. Each draws only from stills cut for its own shape (the
 *  monitor shares the TV's shape), never repeats a still on its own shelf, never sits near the same theme on its
 *  shelf or the shelves above and below, and prefers whichever look has been used least: a mosaic with no stripes. */
const LOOKS: Map<string, Look> = (() => {
  const out = new Map<string, Look>();
  const r = rng(20261120);
  const used = new Map<string, number>();
  const devs = [...WORLD.devs].sort((a, b) => a.row - b.row || a.cx - b.cx);
  for (const d of devs) if (FIXED[d.id]) { out.set(d.id, FIXED[d.id]); used.set(FIXED[d.id].key, 1); }
  for (const d of devs) {
    if (out.has(d.id)) continue;
    const shape = d.kind === 'monitor' ? 'tv' : d.kind;
    // WHY no Kuromi / Strawberry Kitty (reviewer BLOCKER): they are real licensed characters; a public film must not show them
    const cands = ROWS.filter((x) => x.shape === shape && !x.theme.startsWith('YouCoded (default)') && !/Kuromi|Strawberry Kitty/.test(x.theme) && !/-(phone|laptop|tablet|tv)-(empty|wake|typing|clean|cleanfocus|typed|working)\.png$/.test(x.file)).map((x) => lookOf(x.file));
    const shelf = WORLD.devs.filter((o) => o.row === d.row && out.has(o.id));
    const near = WORLD.devs.filter((o) => o.id !== d.id && out.has(o.id) && Math.abs(o.row - d.row) <= 1 && Math.abs(o.cx - d.cx) < (o.w + d.w) / 2 + 700);   // WHY 700: about two devices either way, so a close-up of three never shows one theme twice
    const ok = (c: Look) => !shelf.some((o) => out.get(o.id)!.key === c.key) && !near.some((o) => out.get(o.id)!.theme === c.theme);
    // WHY a penalty on the near-black looks (reviewer: a quarter of the wall read as blank black holes in daylight)
    const order = cands.map((c) => ({ c, k: (used.get(c.key) ?? 0) + r() * 0.9 + (/^(Dark|Midnight|YouCoded Night)/.test(c.theme) ? 2.2 : 0) })).sort((a, b) => a.k - b.k).map((x) => x.c);
    const pick = order.find(ok) ?? order.find((c) => !near.some((o) => out.get(o.id)!.theme === c.theme)) ?? order[0];
    out.set(d.id, pick);
    used.set(pick.key, (used.get(pick.key) ?? 0) + 1);
  }
  return out;
})();
/** The same Home page in a given look's own theme, for a page that is shared to that device. WHY per theme (round 8 reviewer
 *  BLOCKER: the shared page replaced the neighbour's whole theme): what one person makes, another opens in THEIR own look. */
export const homeIn = (look: Look, kind: string): Look | null => {
  const shape = kind === 'monitor' ? 'tv' : kind;
  const slug = look.key.replace(/-(phone|tablet|laptop|tv)-.*$/, '');
  const f = `${slug}-${shape}-home.png`;
  return ROWS.some((x) => x.file === f) ? lookOf(f) : null;
};
/** The "working" picture for a look (its own sent bubble and working line), if one was shot. */
export const workingIn = (look: Look, kind: string): Look | null => {
  const shape = kind === 'monitor' ? 'tv' : kind;
  const f = `${look.key.replace(/-(phone|tablet|laptop|tv)-.*$/, '')}-${shape}-working.png`;
  return ROWS.some((x) => x.file === f) ? lookOf(f) : null;
};
/** What a device shows once it is someone's own. */
export const lookFor = (d: { id: string }): Look => LOOKS.get(d.id)!;
/** For the render check: how many different screens the wall uses. */
export const WALL_VARIETY = new Set([...LOOKS.values()].map((l) => l.key)).size;
/** For the render check: the most any one theme is used across the wall. */
export const WALL_THEMES = new Set([...LOOKS.values()].map((l) => l.theme)).size;

/** One still of the real app, filling a screen exactly. WHY objectFit fill: every still is cut to its device's
 *  own ratio (within 0.3%), so nothing is cropped or letterboxed and nothing visibly stretches. */
export const RealApp: React.FC<{ src: string; w: number; h: number }> = ({ src, w, h }) => (
  <Img src={staticFile(src)} style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, objectFit: 'fill' }} />
);

/** A person's own screen: the real app in their theme, on the page they have in focus. */
export const OwnScreen: React.FC<{ look: Look; w: number; h: number }> = ({ look, w, h }) => (
  <div style={{ position: 'absolute', inset: 0, background: '#120A19', overflow: 'hidden' }}><RealApp src={look.still} w={w} h={h} /></div>
);

// ---------------------------------------------------------------------------------------------------
// Typing into the phone's own message box.
// The still is 1170x2442 (3x of a 390-wide phone); everything below is laid out in those picture pixels and the
// whole layer is scaled to the screen, so the letters sit exactly where the app's own letters would.
// ---------------------------------------------------------------------------------------------------
const STILL_W = 1170, STILL_H = 2442;
/** The message box in picture pixels (take1b-library INDEX.md: 24,2207,1122,132) and where its words start. */
export const BOX = { x: 84, y: 2091, w: 1002, h: 132 };
export const TEXT_X = 264, TEXT_MID = 2158, TEXT_MAX_X = 880;   // WHY: measured on the Golden Sunbreak capture (the placeholder starts at 264)
const TEXT_PX = 48;          // the app's own message text size at 3x, measured by typing its placeholder over itself (54 was 17% too big)
const INK = '#E6D6AE';       // the theme's own cream, a touch brighter than its chips (220,200,152)
const MONO = "'Cascadia Mono', 'Noto Sans Mono', monospace";   // WHY: the app's own message font here (Cascadia, which falls back to Noto Sans Mono on the capture machine)

/** The phone's window with its message box in one of three states: waiting, focused-and-blinking, or being typed in. */
export const PhoneAsk: React.FC<{ w: number; h: number; text: string; caretOn: boolean; typing: boolean; sent?: number; sentText?: string }> = ({ w, h, text, caretOn, typing, sent = 0, sentText = '' }) => {
  const s = w / STILL_W;
  // WHY the real picture once the bubble has landed (round 8 reviewer BLOCKER: no sign of the app working): the drawn lift ends exactly on
  // the real bubble's place and size, and the real capture takes over, with the app's own working line under it
  if (sent >= 1) return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#10101A' }}><RealApp src={PHONE_WORKING} w={w} h={h} /></div>;
  // WHY real pictures while nobody is typing: the app's own blinking caret is a real capture, not something we draw
  const src = typing || sent > 0 ? PHONE_CLEAN : caretOn ? PHONE_FOCUS : PHONE_EMPTY;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#10101A' }}>
      <RealApp src={src} w={w} h={h} />
      {sent > 0 && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: STILL_W, height: STILL_H, transform: `scale(${s})`, transformOrigin: '0 0' }}>
          {/* WHY the sent sentence lifts out of the box into the app's own kind of message bubble (purple, right-aligned, time under it,
              as in the real chat capture) so "ask, then get" is seen: it rises from the box to the top of the chat */}
          {(() => {
            const e = 1 - Math.pow(1 - cl(sent), 3);
            const bw = 562, bh = 156;   // WHY: the real sent bubble's own size and place (golden-sunbreak-phone-working.png), so the hand-over is seamless
            return (
              <div style={{ position: 'absolute', left: 1114 - bw, top: 133 + (1 - e) * 1960, width: bw, height: bh, borderRadius: 60, boxSizing: 'border-box', padding: '22px 44px', opacity: Math.min(1, sent * 5),
                background: 'linear-gradient(160deg,#E1AA34,#F3B93F)', boxShadow: '0 12px 36px rgba(20,10,0,0.35)', fontFamily: MONO, color: '#14100A', transform: `scale(${0.92 + 0.08 * e})`, transformOrigin: '100% 100%' }}>
                <div style={{ fontSize: 46, lineHeight: '64px', whiteSpace: 'nowrap', textAlign: 'right' }}>{sentText}</div>
                <div style={{ fontSize: 30, textAlign: 'right', color: 'rgba(80,50,0,0.7)', marginTop: 0 }}>8:00 AM</div>
              </div>
            );
          })()}
        </div>
      )}
      {typing && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: STILL_W, height: STILL_H, transform: `scale(${s})`, transformOrigin: '0 0' }}>
          {/* WHY one nowrap line with the caret inside it: the caret is the next thing after the last letter, so it can
              never lead or lag the text, and the text can never re-wrap or jump while it grows */}
          <div style={{ position: 'absolute', left: TEXT_X, top: TEXT_MID - 40, width: TEXT_MAX_X - TEXT_X, height: 80, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
            fontFamily: MONO, fontWeight: 400, fontSize: TEXT_PX, lineHeight: '80px', color: INK }}>
            <span>{text}</span>
            <span style={{ display: 'inline-block', width: 3, height: 58, marginLeft: 2, background: '#F4EEDF', opacity: caretOn ? 1 : 0, flex: 'none' }} />
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------
// Typing into a laptop's or tablet's own message box (round 6).
// WHY a reveal of a real picture, not drawn letters: take1b-library.mjs shot the same window with the whole sentence typed into the
// app's own box (its font, size, colour), and measured where every letter ends. The film shows the box with nothing in it
// and uncovers the typed picture up to the current letter, so the letters are the app's own; only the blinking caret is added.
// ---------------------------------------------------------------------------------------------------
export const askKit = (slug: string, shape: 'laptop' | 'tablet') => {
  const f = (k: string) => `${slug}-${shape}-${k}.png`;
  const row = ROWS.find((x) => x.file === f('typed'));
  if (!row?.typed) throw new Error(`take1b: no typed picture ${f('typed')} (run take1b-library.mjs)`);
  return { clean: R4(f('clean')), focus: R4(f('cleanfocus')), typed: R4(f('typed')), working: R4(f('working')), info: row.typed, text: row.typed.text };
};
export type AskKit = ReturnType<typeof askKit>;
const STILL_PX = { laptop: [2240, 1400], tablet: [2000, 1388] } as const;
export const ShapeAsk: React.FC<{ kit: AskKit; shape: 'laptop' | 'tablet'; w: number; h: number; n: number; caretOn: boolean; caretColor: string; sent?: boolean }> = ({ kit, shape, w, h, n, caretOn, caretColor, sent = false }) => {
  const [SW, SH] = STILL_PX[shape];
  // WHY (round 8 reviewer BLOCKER: the page arrived 0.1 s after the last key): once sent, the real window shows its own sent bubble and working line
  if (sent) return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#10101A' }}><RealApp src={kit.working} w={w} h={h} /></div>;
  const { prefix, rect, dpr } = kit.info;
  const top = (rect[1] - 7) * dpr, bot = (rect[1] + rect[3] + 7) * dpr, left = rect[0] * dpr;
  const x = prefix[Math.min(n, prefix.length - 1)] * dpr;
  // WHY the caret is the app's own focused picture while nothing is typed, then a thin bar that follows the last letter
  const base = n > 0 ? kit.clean : caretOn ? kit.focus : kit.clean;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#10101A' }}>
      <RealApp src={base} w={w} h={h} />
      {n > 0 && <div style={{ position: 'absolute', inset: 0, clipPath: `inset(${(top / SH) * 100}% ${100 - ((x + 3) / SW) * 100}% ${100 - (bot / SH) * 100}% ${(left / SW) * 100}%)` }}><RealApp src={kit.typed} w={w} h={h} /></div>}
      {n > 0 && <div style={{ position: 'absolute', left: (x / SW) * w + 1, top: ((rect[1] + 0.8) * dpr / SH) * h, width: Math.max(1.5, (2 / SW) * w * 1.4), height: ((rect[3] - 1.6) * dpr / SH) * h, background: caretColor, opacity: caretOn ? 1 : 0 }} />}
    </div>
  );
};
