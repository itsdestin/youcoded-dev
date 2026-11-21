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
export const OwnCard: React.FC<{ kind: 'photo' | 'msg' | 'note'; w: number; h: number; k: number }> = ({ kind, w, h, k }) => {
  const base: React.CSSProperties = { width: w, height: h, background: S.card, borderRadius: 3 * k, boxSizing: 'border-box', overflow: 'hidden', fontFamily: DMSANS };
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
        <div style={{ fontSize: 3.3 * k, color: S.ink2, whiteSpace: 'nowrap' }}>running late, save me a seat x</div>
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

/** A padlock. `p` 0..1 is its arrival: it drops in a little large and shakes as it snaps shut. */
const Lock: React.FC<{ s: number; p: number; off: number }> = ({ s, p, off }) => {
  const a = smooth(p * 2.5);
  const shake = p > 0.15 && p < 1 ? Math.sin((p - 0.15) * 46) * 9 * (1 - p) : 0;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" style={{ opacity: a * (1 - smooth(off * 1.6)), transform: `translateY(${off * s * 1.4}px) rotate(${shake + off * 50}deg) scale(${1.35 - 0.35 * a})`, filter: 'drop-shadow(0 1px 1px rgba(40,20,60,0.35))' }}>
      <rect x="4.5" y="10.5" width="15" height="11" rx="2.6" fill="#43354E" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="#43354E" strokeWidth="2.4" fill="none" />
      <circle cx="12" cy="15.6" r="1.6" fill="#E7E2EC" />
    </svg>
  );
};

/** The corporations' AI: one plain, heavy, near-black tile. WHY so plain: it is theirs (invented, not youcoded) and the
 *  whole point of it is the price hung on it; the second letter is a bare bar so it can lift off as the caret. */
export const AiTile: React.FC<{ s: number; caret?: number }> = ({ s, caret = 1 }) => (
  <div style={{ width: s, height: s, borderRadius: s * 0.24, background: 'linear-gradient(180deg,#2B2036,#171020)', boxShadow: `0 ${s * 0.06}px ${s * 0.18}px rgba(20,8,32,0.45), inset 0 ${s * 0.012}px 0 rgba(255,255,255,0.16)`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DMSANS, fontWeight: 900, fontSize: s * 0.5, letterSpacing: '-0.03em', color: '#F7F1FA', flex: 'none' }}>
    A<span style={{ display: 'inline-block', width: s * 0.075, height: s * 0.4, borderRadius: s * 0.04, background: '#F7F1FA', marginLeft: s * 0.05, opacity: caret }} />
  </div>
);

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
  /** 0..1 the "something wonderful" glimpse: the screen hushes and one purple caret blinks; `caret` is the blink */
  glimpse?: { o: number; caret: boolean; truly?: number; dark?: number };
  /** 0..1 hides the title (a banner or switch is using its row) */
  hideTitle?: number;
};

export const SameScreen: React.FC<SameProps> = ({ w, h, lay = 0, banner = 0, lock = 0, unlock = 0, dialog = 0, accept = 0, ai = 0, price = 0, glimpse, hideTitle = 0 }) => {
  const k = Math.min(w, h) / 100;
  const L = sameLayout(w, h, lay);
  const P = L.portrait;
  const { cols, rows } = gridDims(w, h, P);
  const g = L.grid;
  const gx = 2.4 * k;
  const tw = (g.w * w - gx * (cols - 1)) / cols, th = (g.h * h - gx * (rows - 1)) / rows;
  // WHY mid-tone, saturated tiles (reviewer: the generic app read as a grey wireframe): a product people are stuck with needs solid colour for the locks to land on
  const tileHues = ['#E9A98C', '#8FB2DA', '#9CC9A6', '#C9A2DC', '#E8CC83', '#8FC4C8'];
  const lockOf = (i: number) => (Array.isArray(lock) ? lock[i] ?? 0 : i % 3 !== 0 ? lock : 0);
  const dlg = smooth(dialog) * (1 - smooth((accept - 0.3) * 3));
  return (
    <div style={{ position: 'absolute', inset: 0, background: S.bg, overflow: 'hidden', fontFamily: DMSANS }}>
      {/* status row */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: (P ? 0.065 : 0.09) * h, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${5 * k}px`, fontSize: 3.2 * k, fontWeight: 700, color: S.ink }}>
        <span>9:41</span><span style={{ display: 'flex', gap: 1 * k }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 2 * k, height: 2 * k, borderRadius: k, background: S.ink2 }} />)}</span>
      </div>
      {!P && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 0.2 * w, background: '#ECE6F2' }}>
        {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ position: 'absolute', left: 4 * k, top: (0.17 + i * 0.1) * h, width: 0.2 * w - 8 * k, height: 4 * k, borderRadius: 2 * k, background: i === 0 ? S.tile2 : S.tile }} />)}
      </div>}
      <div style={{ position: 'absolute', left: (P ? 0.07 : 0.25) * w, top: 0.075 * h, fontSize: 6 * k, fontWeight: 900, letterSpacing: '-0.03em', color: S.ink, opacity: 1 - smooth(Math.max(hideTitle, banner > 0 ? 1 : 0) * 5) }}>Good morning</div>
      {/* a plain plan chip: nothing says "same as everyone's" like a tier name */}
      <div style={{ position: 'absolute', right: (P ? 0.07 : 0.05) * w, top: (P ? 0.085 : 0.1) * h, padding: `${0.6 * k}px ${2 * k}px`, borderRadius: 4 * k, background: S.tile, color: S.ink, fontSize: 2.8 * k, fontWeight: 700, opacity: 1 - smooth(Math.max(hideTitle, banner > 0 ? 1 : 0) * 5) }}>Standard</div>
      {(['photo', 'msg', 'note'] as const).map((kind) => (
        <div key={kind} style={box(L[kind], w, h)}><OwnCard kind={kind} w={L[kind].w * w} h={L[kind].h * h} k={k} /></div>
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const x = g.x * w + (i % cols) * (tw + gx), y = g.y * h + Math.floor(i / cols) * (th + gx);
        const lk = lockOf(i);
        const lo = smooth(lk * 2.5) * (1 - smooth(unlock));
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, width: tw, height: th, borderRadius: 3 * k, background: tileHues[i], display: 'flex', alignItems: 'center', justifyContent: 'center',
            filter: lo > 0 ? `saturate(${1 - lo}) brightness(${1 - 0.1 * lo})` : undefined }}>
            <div style={{ width: Math.min(tw, th) * 0.42, height: Math.min(tw, th) * 0.42, borderRadius: Math.min(tw, th) * 0.14, background: 'rgba(255,255,255,0.55)', opacity: 1 - 0.6 * lo }} />
            {lk > 0 && <div style={{ position: 'absolute' }}><Lock s={Math.min(tw, th) * 0.62} p={lk} off={unlock} /></div>}
          </div>
        );
      })}
      {/* the update banner that lands on every screen in the same frame */}
      {banner > 0 && <div style={{ position: 'absolute', left: '6%', right: '6%', top: (P ? 0.075 : 0.06) * h, height: (P ? 0.06 : 0.09) * h, borderRadius: 3 * k, background: '#43354E', color: '#F3EAF9',
        fontSize: 3.4 * k, fontWeight: 700, display: 'flex', alignItems: 'center', paddingLeft: 3 * k, transform: `translateY(${(smooth(banner * 4) - 1) * 6 * k}px)`, opacity: smooth(banner * 6) * (1 - smooth((banner - 0.85) * 6)), whiteSpace: 'nowrap', overflow: 'hidden' }}>Your layout has been updated</div>}
      {/* their machine's tile, stamped on top of everything, with its price beside it (the same tile as on the big screen).
          WHY a plain tile and no bar: the corporations' AI is theirs, not youcoded, and not somewhere you type */}
      {ai > 0 && <div style={{ position: 'absolute', right: (P ? 0.07 : 0.05) * w, bottom: (P ? 0.04 : 0.07) * h, display: 'flex', alignItems: 'center', gap: 2 * k, flexDirection: P ? 'column-reverse' : 'row-reverse',
        transform: `scale(${0.6 + 0.4 * smooth(ai)})`, transformOrigin: '100% 100%', opacity: smooth(ai * 1.5) }}>
        <AiTile s={(P ? 22 : 20) * k} />
        {/* WHY the price arrives separately, on "value" (reviewer 2026-11-20): the treasure is that every screen gets charged at once */}
        <span style={{ height: 7 * k, padding: `0 ${2.2 * k}px`, borderRadius: 7 * k, background: '#FBF5EA', color: '#21152C', fontWeight: 900, fontSize: 3.8 * k, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
          boxShadow: `0 ${k}px ${3 * k}px rgba(40,20,60,0.3)`, opacity: smooth(price * 2), transform: `scale(${price <= 0 ? 0.4 : 0.4 + 0.6 * smooth(price) + 0.18 * Math.sin(Math.PI * cl(price))})` }}>$20/mo</span></div>}
      {glimpse && glimpse.o > 0 && <>
        {/* WHY (reviewer: the old 82% white wash left a blank phone and a caret too small to see): the app stays visible but quiet,
            the title stays, and a big purple caret blinks in a cleared space. On "truly" a thin line grows under it (somewhere to
            type); on "wonderful" the lock tiles go dark around it. Nothing of the real app is drawn. */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0.15 * h, bottom: 0, background: S.bg, opacity: glimpse.o * 0.9 }} />
        <div style={{ position: 'absolute', left: '50%', top: '47%', width: 4.2 * k, height: 26 * k, marginLeft: -2.1 * k, marginTop: -13 * k, borderRadius: 3 * k, background: '#9750AA', opacity: glimpse.o * (glimpse.caret ? 1 : 0) }} />
        <div style={{ position: 'absolute', left: '50%', top: '47%', marginTop: 16 * k, height: 1.1 * k, width: (P ? 0.62 : 0.4) * w * (glimpse.truly ?? 0), marginLeft: -(P ? 0.31 : 0.2) * w * (glimpse.truly ?? 0), borderRadius: k, background: '#9750AA', opacity: 0.8 * glimpse.o }} />
        <div style={{ position: 'absolute', inset: 0, background: '#1B1224', opacity: 0.55 * (glimpse.dark ?? 0) }} />
      </>}
      {/* "Terms have changed": the same dialog, accepted by everyone */}
      {dlg > 0 && <>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(40,28,52,0.42)', opacity: dlg }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: (P ? 0.84 : 0.56) * w, transform: `translate(-50%,-50%) scale(${0.9 + 0.1 * dlg})`, opacity: dlg,
          background: '#FBF9FC', borderRadius: 4 * k, padding: 4 * k, boxSizing: 'border-box', boxShadow: `0 ${2 * k}px ${6 * k}px rgba(40,20,60,0.3)` }}>
          <div style={{ fontSize: (P ? 5.6 : 6.4) * k, fontWeight: 900, color: S.ink, letterSpacing: '-0.03em', lineHeight: 1.05 }}>Our terms have changed</div>
          {[0.95, 0.8, 0.9].map((f, i) => <div key={i} style={{ height: 1.5 * k, width: `${f * 100}%`, background: S.line, borderRadius: k, marginTop: 1.5 * k }} />)}
          <div style={{ marginTop: 3 * k, height: 8.5 * k, borderRadius: 8 * k, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 4.4 * k, fontWeight: 700,
            background: accept > 0.02 ? '#2E2238' : '#5A5065', color: '#fff', transform: `scale(${1 - 0.07 * Math.sin(Math.PI * cl(accept * 3))})` }}>{accept > 0.12 ? 'Accepted' : 'Accept'}</div>
        </div>
      </>}
    </div>
  );
};

/** "Share with partners": a switch on the phone that somebody else flips. `o` slides it in, `on` 0..1 flips it. */
export const ShareSwitch: React.FC<{ w: number; h: number; o: number; on: number }> = ({ w, h, o, on }) => {
  const k = Math.min(w, h) / 100;
  if (o <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: '5%', right: '5%', top: 0.075 * h, height: 0.075 * h, borderRadius: 3 * k, background: '#FBF9FC', boxShadow: `0 ${k}px ${3 * k}px rgba(40,20,60,0.25)`, fontFamily: DMSANS,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${3.5 * k}px`, fontSize: 4.4 * k, fontWeight: 700, color: S.ink, opacity: smooth(o), transform: `translateY(${(smooth(o) - 1) * 8 * k}px)` }}>
      Share with partners
      <span style={{ width: 11 * k, height: 6.4 * k, borderRadius: 6 * k, background: on > 0.5 ? '#9750AA' : '#CFC7D8', position: 'relative', flex: 'none' }}>
        <span style={{ position: 'absolute', top: 0.7 * k, left: 0.7 * k + smooth(on) * 4.6 * k, width: 5 * k, height: 5 * k, borderRadius: 5 * k, background: '#fff' }} />
      </span>
    </div>
  );
};
/** Where the switch's knob sits, so a pointer can be aimed at it. */
export const shareKnob = (w: number, h: number) => { const k = Math.min(w, h) / 100; return { x: 0.95 * w - 3.5 * k - 5.5 * k, y: 0.1125 * h }; };

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
type Row = { file: string; shape: 'phone' | 'tablet' | 'laptop' | 'tv'; theme: string; focus: string };
const ROWS = ROWS_JSON as Row[];
const GLOW = GLOW_JSON as Record<string, string>;
const R4 = (file: string) => `stills/r4/${file}`;
const hexRgba = (c: string) => { const n = parseInt(c.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},1)`; };

export type Look = { still: string; glow: string; key: string; theme: string };
const lookOf = (file: string): Look => {
  const r = ROWS.find((x) => x.file === file);
  if (!r) throw new Error(`take1b: "${file}" is not in the still library (public/stills/r4/rows.json)`);
  return { still: R4(file), glow: hexRgba(GLOW[file]), key: file, theme: r.theme };
};

// The phone's untouched window (nothing asked yet), the same window with its box focused, and the box wiped clean
// so the request can be typed into it (take1b-prep.py).
export const PHONE_EMPTY = R4('youcoded-phone-empty.png');
export const PHONE_FOCUS = R4('youcoded-phone-typing.png');
export const PHONE_CLEAN = R4('take1b-phone-clean.png');

// The story's own devices get the looks their lines need. WHY these: the phone asked for "a page for my home" and
// gets the loud Halftone pack with exactly that page; the laptop that was locked gets a warm golden look (the
// laptop's turn is "what our computers can do"); the tablet that cost money is now free in a dramatic look of its own.
const FIXED: Record<string, Look> = {
  hero: lookOf('halftone-dimension-phone-home.png'),
  lockLaptop: lookOf('golden-sunbreak-laptop-lights.png'),
  tagTablet: lookOf('devils-garden-tablet-chat.png'),
  tv: lookOf('kuromi-dreamer-tv-chat.png'),
};
export const HERO_LOOK = FIXED.hero;

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
    const cands = ROWS.filter((x) => x.shape === shape && !x.theme.startsWith('YouCoded (default)')).map((x) => lookOf(x.file));
    const shelf = WORLD.devs.filter((o) => o.row === d.row && out.has(o.id));
    const near = WORLD.devs.filter((o) => o.id !== d.id && out.has(o.id) && Math.abs(o.row - d.row) <= 1 && Math.abs(o.cx - d.cx) < (o.w + d.w) / 2 + 700);   // WHY 700: about two devices either way, so a close-up of three never shows one theme twice
    const ok = (c: Look) => !shelf.some((o) => out.get(o.id)!.key === c.key) && !near.some((o) => out.get(o.id)!.theme === c.theme);
    const order = cands.map((c) => ({ c, k: (used.get(c.key) ?? 0) + r() * 0.9 })).sort((a, b) => a.k - b.k).map((x) => x.c);
    const pick = order.find(ok) ?? order.find((c) => !near.some((o) => out.get(o.id)!.theme === c.theme)) ?? order[0];
    out.set(d.id, pick);
    used.set(pick.key, (used.get(pick.key) ?? 0) + 1);
  }
  return out;
})();
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
export const BOX = { x: 24, y: 2207, w: 1122, h: 132 };
export const TEXT_X = 205, TEXT_MID = 2275, TEXT_MAX_X = 940;
const TEXT_PX = 46;          // the app's own message text size at 3x, measured by typing its placeholder over itself (54 was 17% too big)
const INK = '#4A3A5C';       // the app's own ink colour in this box (the compass icon beside it)

/** The phone's window with its message box in one of three states: waiting, focused-and-blinking, or being typed in. */
export const PhoneAsk: React.FC<{ w: number; h: number; text: string; caretOn: boolean; typing: boolean }> = ({ w, h, text, caretOn, typing }) => {
  const s = w / STILL_W;
  // WHY real pictures while nobody is typing: the app's own blinking caret is a real capture, not something we draw
  const src = typing ? PHONE_CLEAN : caretOn ? PHONE_FOCUS : PHONE_EMPTY;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#F7F0FB' }}>
      <RealApp src={src} w={w} h={h} />
      {typing && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: STILL_W, height: STILL_H, transform: `scale(${s})`, transformOrigin: '0 0' }}>
          {/* WHY one nowrap line with the caret inside it: the caret is the next thing after the last letter, so it can
              never lead or lag the text, and the text can never re-wrap or jump while it grows */}
          <div style={{ position: 'absolute', left: TEXT_X, top: TEXT_MID - 40, width: TEXT_MAX_X - TEXT_X, height: 80, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
            fontFamily: OUTFIT, fontWeight: 400, fontSize: TEXT_PX, lineHeight: '80px', color: INK }}>
            <span>{text}</span>
            <span style={{ display: 'inline-block', width: 3, height: 58, marginLeft: 2, background: '#2A1F35', opacity: caretOn ? 1 : 0, flex: 'none' }} />
          </div>
        </div>
      )}
    </div>
  );
};
