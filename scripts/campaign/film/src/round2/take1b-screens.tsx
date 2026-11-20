// Take 1B: what is drawn ON the screens. Two kinds of picture:
//  1. The SAME screen: one bland, tidy layout every device shows, because a few companies decided it.
//  2. The person's OWN things: small apps people made by asking (brand guide §8: in an ad, what a person
//     makes may be staged). Each one is deliberately its own world, with its own colours and type, so the
//     final wall reads as "everyone's copy is different" at a glance.
// WHY no youcoded window chrome anywhere: the brand guide forbids drawing the app's own interface. The film
// shows the THINGS people make and the request typed as plain words, never a fake app window.
import React from 'react';
import { DMSANS, OUTFIT } from '../brand';

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
const S = { bg: '#E7E2EC', card: '#F5F2F7', tile: '#CFC7D8', tile2: '#BDB3C9', ink: '#5A5065', ink2: '#9B91A6', line: '#D9D2E0' };

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

/** Where the person's "ask" bar sits on any screen (fractions), so the film can aim the caret at it. */
export const askRect = (w: number, h: number) => (h > w ? { x: 0.06, y: 0.885, w: 0.88, h: 0.08 } : { x: 0.25, y: 0.86, w: 0.5, h: 0.1 });

/** The person's "ask" bar: the one thing every screen will share. A plain light field, nothing more.
 *  `text`/`n` type into it (it grows upward to fit), `caret` blinks, `fs` is the type size in px. */
export const AskBar: React.FC<{ w: number; h: number; o?: number; text?: string; n?: number; caret?: boolean; fs?: number; dark?: boolean }> = ({ w, h, o = 1, text = '', n = 0, caret = false, fs, dark }) => {
  const k = Math.min(w, h) / 100;
  const r = askRect(w, h);
  const size = fs ?? (h > w ? 4.6 : 4) * k;
  return (
    <div style={{ position: 'absolute', left: r.x * w, width: r.w * w, bottom: (1 - r.y - r.h) * h, minHeight: r.h * h, opacity: o, boxSizing: 'border-box',
      padding: `${size * 0.42}px ${size * 0.8}px`, borderRadius: Math.min(r.h * h / 2, size * 1.6), background: dark ? '#2E2238' : '#FFFFFF',
      boxShadow: `0 ${0.5 * k}px ${2 * k}px rgba(40,20,60,0.16), inset 0 0 0 ${Math.max(1, 0.3 * k)}px rgba(151,80,170,0.18)`,
      display: 'flex', alignItems: 'center', fontFamily: DMSANS, fontSize: size, lineHeight: 1.2, fontWeight: n > 0 ? 700 : 500, letterSpacing: '-0.015em', color: n > 0 ? '#21152C' : '#8A7B96' }}>
      <span>
        {n > 0 ? text.slice(0, n) : 'ask…'}
        <span style={{ display: 'inline-block', width: Math.max(1.5, size * 0.1), height: size * 1.05, marginLeft: size * 0.06, verticalAlign: '-0.18em', borderRadius: size, background: '#9750AA', opacity: caret ? 1 : 0 }} />
      </span>
    </div>
  );
};

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
  /** 0..1 the companies' new "Ask AI" button stuck onto the screen */
  ai?: number;
  /** the person's ask bar (only once it is theirs) */
  ask?: { o: number; text?: string; n?: number; caret: boolean; fs?: number };
};

export const SameScreen: React.FC<SameProps> = ({ w, h, lay = 0, banner = 0, lock = 0, unlock = 0, dialog = 0, accept = 0, ai = 0, ask }) => {
  const k = Math.min(w, h) / 100;
  const L = sameLayout(w, h, lay);
  const P = L.portrait;
  const { cols, rows } = gridDims(w, h, P);
  const g = L.grid;
  const gx = 2.4 * k;
  const tw = (g.w * w - gx * (cols - 1)) / cols, th = (g.h * h - gx * (rows - 1)) / rows;
  const tileHues = ['#CFC7D8', '#C6BDD1', '#D6CFDE', '#C2B8CE', '#CCC4D6', '#BFB5CB'];
  const lockOf = (i: number) => (Array.isArray(lock) ? lock[i] ?? 0 : i % 3 !== 0 ? lock : 0);
  const dlg = smooth(dialog) * (1 - smooth((accept - 0.3) * 3));
  return (
    <div style={{ position: 'absolute', inset: 0, background: S.bg, overflow: 'hidden', fontFamily: DMSANS }}>
      {/* status row */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: (P ? 0.065 : 0.09) * h, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${5 * k}px`, fontSize: 3.2 * k, fontWeight: 700, color: S.ink }}>
        <span>9:41</span><span style={{ display: 'flex', gap: 1 * k }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 2 * k, height: 2 * k, borderRadius: k, background: S.ink2 }} />)}</span>
      </div>
      {!P && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 0.2 * w, background: '#DED8E5' }}>
        {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ position: 'absolute', left: 4 * k, top: (0.17 + i * 0.1) * h, width: 0.2 * w - 8 * k, height: 4 * k, borderRadius: 2 * k, background: i === 0 ? S.tile2 : S.tile }} />)}
      </div>}
      <div style={{ position: 'absolute', left: (P ? 0.07 : 0.25) * w, top: 0.075 * h, fontSize: 6 * k, fontWeight: 900, letterSpacing: '-0.03em', color: S.ink }}>Good morning</div>
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
        fontSize: 3.4 * k, fontWeight: 700, display: 'flex', alignItems: 'center', paddingLeft: 3 * k, transform: `translateY(${(smooth(banner * 4) - 1) * 6 * k}px)`, opacity: smooth(banner * 4) * (1 - smooth((banner - 0.8) * 5)), whiteSpace: 'nowrap', overflow: 'hidden' }}>Your layout has been updated</div>}
      {/* the companies' new button, stuck on top of everything */}
      {ai > 0 && <div style={{ position: 'absolute', left: '50%', bottom: (P ? 0.025 : 0.035) * h, transform: `translateX(-50%) scale(${0.7 + 0.3 * smooth(ai)})`, opacity: smooth(ai * 1.5) * (ask ? 1 - ask.o : 1),
        height: 9 * k, padding: `0 ${4 * k}px`, borderRadius: 9 * k, background: '#2E2238', color: '#F3EAF9', display: 'flex', alignItems: 'center', gap: 1.6 * k, fontSize: 3.6 * k, fontWeight: 700, whiteSpace: 'nowrap',
        boxShadow: `0 ${k}px ${3 * k}px rgba(40,20,60,0.3)` }}>Ask AI<span style={{ opacity: 0.7, fontWeight: 500 }}>· new</span></div>}
      {ask && ask.o > 0 && <>
        {/* WHY a scrim behind a long request: the words being typed must win over the busy screen behind them */}
        {(ask.n ?? 0) > 0 && <div style={{ position: 'absolute', inset: 0, background: 'rgba(231,226,236,0.72)', opacity: ask.o }} />}
        <AskBar w={w} h={h} o={ask.o} text={ask.text} n={ask.n} caret={ask.caret} fs={ask.fs} />
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
// 2. (retired) The blank page with a caret. WHY gone: the request is now typed into the ask bar on the
//    phone's own screen, so the viewer learns where you type, and the phone is never a blank slab.
// =====================================================================================================

// =====================================================================================================
// 3. People's own things. Every one has a person's reason in its title (brand §9: not "there's an app
//    for that", but something made to one person's wishes). `p` builds it piece by piece.
// =====================================================================================================
type AppProps = { w: number; h: number; p: number };
const Frame: React.FC<{ bg: string; children: React.ReactNode }> = ({ bg, children }) => (
  <div style={{ position: 'absolute', inset: 0, background: bg, overflow: 'hidden' }}>{children}</div>
);

/** Grandma's recipes, big text, no ads: the film's hero (the one we watch being asked for). */
export const Recipes: React.FC<AppProps> = ({ w, h, p }) => {
  const k = Math.min(w, h) / 100, P = h > w;
  const ink = '#3B2418', acc = '#C4572E';
  return (
    <Frame bg="#FBF3E6">
      <div style={{ position: 'absolute', inset: 0, padding: `${(P ? 10 : 6) * k}px ${7 * k}px`, display: 'flex', flexDirection: P ? 'column' : 'row', gap: 5 * k, fontFamily: DMSANS, color: ink, boxSizing: 'border-box' }}>
        <div style={{ flex: P ? 'none' : 1, display: 'flex', flexDirection: 'column', gap: 3 * k }}>
          <div style={{ ...rise(p, 0, 6, k), fontSize: 4.4 * k, fontWeight: 700, letterSpacing: '0.04em', color: acc, textTransform: 'uppercase' }}>Grandma June's</div>
          <div style={{ ...rise(p, 1, 6, k), fontSize: 12.5 * k, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.98 }}>Sunday lemon cake</div>
          {/* the plate: a warm drawn cake, never a stock photo */}
          <div style={{ ...rise(p, 2, 6, k), height: (P ? 34 : 48) * k, borderRadius: 4 * k, background: 'linear-gradient(160deg,#F4D9A6,#E9B86F)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: '18%', right: '18%', bottom: '18%', height: '38%', borderRadius: '50% / 30%', background: '#FFF8EC', boxShadow: `0 ${k}px ${2 * k}px rgba(120,70,20,0.25)` }} />
            <div style={{ position: 'absolute', left: '27%', right: '27%', bottom: '33%', height: '34%', borderRadius: `${3 * k}px ${3 * k}px ${k}px ${k}px`, background: 'linear-gradient(180deg,#FFF3C2 0 26%,#E8B35E 26% 100%)' }} />
            <div style={{ position: 'absolute', left: '44%', bottom: '64%', width: 5 * k, height: 5 * k, borderRadius: '50%', background: '#F2D23E', boxShadow: `inset -${0.6 * k}px -${0.6 * k}px 0 #D9B21E` }} />
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2.4 * k }}>
          {['3 eggs', '1 cup sugar', '2 lemons, zest and all', '"don\'t rush the oven"'].map((t, i) => (
            <div key={i} style={{ ...rise(p, 3 + i * 0.6, 6, k), fontSize: 7 * k, fontWeight: i === 3 ? 500 : 700, fontStyle: i === 3 ? 'italic' : undefined, letterSpacing: '-0.02em',
              borderBottom: i < 3 ? `${0.4 * k}px solid #EBD9BF` : undefined, paddingBottom: 1.6 * k, color: i === 3 ? acc : ink }}>{t}</div>
          ))}
        </div>
      </div>
    </Frame>
  );
};

const Star: React.FC<{ s: number; on: boolean }> = ({ s, on }) => (
  <svg width={s} height={s} viewBox="0 0 24 24"><path d="M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8l-5.8 3.3 1.4-6.4L2.7 9.3l6.5-.7z" fill={on ? '#F5B83D' : 'none'} stroke={on ? '#E39F1C' : '#9DB8D6'} strokeWidth="1.6" strokeLinejoin="round" /></svg>
);
/** Two kids' jobs, with stars they tap themselves. */
export const Chores: React.FC<AppProps> = ({ w, h, p }) => {
  const k = Math.min(w, h) / 100, P = h > w;
  const kids = [{ n: 'Mia', c: '#F28C7B', s: [1, 1, 1, 0] }, { n: 'Leo', c: '#5FA8E8', s: [1, 1, 0, 0] }];
  const jobs = ['Feed Biscuit', 'Make bed', 'Lunchbox', 'Read 20 min'];
  return (
    <Frame bg="#E4F0FB">
      <div style={{ position: 'absolute', inset: 0, padding: 6 * k, fontFamily: OUTFIT, color: '#18324D', boxSizing: 'border-box' }}>
        <div style={{ ...rise(p, 0, 5, k), fontSize: 9 * k, fontWeight: 600, letterSpacing: '-0.03em' }}>Jobs before the park</div>
        <div style={{ display: 'flex', flexDirection: P ? 'column' : 'row', gap: 4 * k, marginTop: 4 * k }}>
          {kids.map((kid, ki) => (
            <div key={ki} style={{ ...rise(p, 1 + ki, 5, k), flex: 1, background: '#fff', borderRadius: 4 * k, padding: 3.5 * k, boxShadow: `0 ${0.6 * k}px ${2 * k}px rgba(24,50,77,0.08)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 * k, fontSize: 6 * k, fontWeight: 600 }}>
                <span style={{ width: 6 * k, height: 6 * k, borderRadius: 6 * k, background: kid.c }} />{kid.n}
              </div>
              {jobs.map((j, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 4.4 * k, marginTop: 1.8 * k, fontFamily: DMSANS, fontWeight: 500 }}>
                  {j}<Star s={6 * k} on={!!kid.s[i] && p > 0.5 + i * 0.1} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
};

/** Birds seen from one kitchen window. */
export const Birds: React.FC<AppProps> = ({ w, h, p }) => {
  const k = Math.min(w, h) / 100, P = h > w;
  const rows: [string, number, string][] = [['Robin', 3, '#D9774E'], ['Blue tit', 2, '#4F86B8'], ['Wren', 1, '#9A7552'], ['Goldfinch', 4, '#D8B23A']];
  return (
    <Frame bg="#E5EDDF">
      <div style={{ position: 'absolute', inset: 0, padding: 6 * k, fontFamily: DMSANS, color: '#22402A', boxSizing: 'border-box', display: 'flex', flexDirection: P ? 'column' : 'row', gap: 5 * k }}>
        <div style={{ flex: P ? 'none' : 0.9 }}>
          <div style={{ ...rise(p, 0, 5, k), fontSize: 4 * k, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.7 }}>Kitchen window</div>
          <div style={{ ...rise(p, 1, 5, k), fontSize: 11 * k, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1 }}>10 birds today</div>
          <svg style={{ ...rise(p, 2, 5, k), marginTop: 3 * k }} width={(P ? 0.86 : 0.4) * w} height={18 * k} viewBox="0 0 100 30" preserveAspectRatio="none">
            <path d="M0 26 C 12 22, 18 10, 30 14 S 50 26, 62 12 S 85 4, 100 9" stroke="#3E7A4C" strokeWidth="2" fill="none" />
            <path d="M0 26 C 12 22, 18 10, 30 14 S 50 26, 62 12 S 85 4, 100 9 V30 H0Z" fill="#3E7A4C" opacity="0.12" />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          {rows.map(([n, c, col], i) => (
            <div key={i} style={{ ...rise(p, 2.5 + i * 0.5, 5, k), display: 'flex', alignItems: 'center', gap: 3 * k, background: '#F4F8F1', borderRadius: 3 * k, padding: `${2.2 * k}px ${3 * k}px`, marginBottom: 2 * k }}>
              <svg width={7 * k} height={7 * k} viewBox="0 0 24 24"><path d="M4 15c0-5 4-9 9-9 2.5 0 4 1.5 4.5 3L21 10l-3 1.5c0 4.5-3.5 7.5-8 7.5H4z" fill={col} /><circle cx="15" cy="9" r="1.1" fill="#fff" /></svg>
              <span style={{ fontSize: 5 * k, fontWeight: 700, flex: 1 }}>{n}</span><span style={{ fontSize: 5 * k, fontWeight: 900 }}>{c}</span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
};

/** When the fishing is good at one pier: a tide curve and one number. */
export const Tides: React.FC<AppProps> = ({ w, h, p }) => {
  const k = Math.min(w, h) / 100, P = h > w;
  return (
    <Frame bg="#DCEDF0">
      <div style={{ position: 'absolute', inset: 0, padding: 6 * k, fontFamily: DMSANS, color: '#12384A', boxSizing: 'border-box' }}>
        <div style={{ ...rise(p, 0, 4, k), fontSize: 4 * k, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#2B7A8E' }}>Pier 9 · Saturday</div>
        <div style={{ ...rise(p, 1, 4, k), fontSize: (P ? 14 : 12) * k, fontWeight: 900, letterSpacing: '-0.05em', marginTop: 1 * k }}>Go at 6:40</div>
        <div style={{ ...rise(p, 1.5, 4, k), fontSize: 4.6 * k, opacity: 0.75 }}>rising tide, light wind</div>
        <svg style={{ ...rise(p, 2.5, 4, k), position: 'absolute', left: 0, bottom: 0 }} width={w} height={h * (P ? 0.42 : 0.45)} viewBox="0 0 100 40" preserveAspectRatio="none">
          <path d="M0 26 C 15 6, 30 6, 45 22 S 75 38, 100 12 V40 H0Z" fill="#A9D3DA" />
          <path d="M0 30 C 15 12, 30 12, 45 27 S 75 42, 100 18 V40 H0Z" fill="#7FB9C4" opacity="0.8" />
          <circle cx="30" cy="9" r="2.2" fill="#2B7A8E" />
        </svg>
      </div>
    </Frame>
  );
};

/** One band's setlist for Thursday practice. */
export const Setlist: React.FC<AppProps> = ({ w, h, p }) => {
  const k = Math.min(w, h) / 100;
  const songs: [string, string][] = [['Paper Moon', 'G · 92'], ['Slow Train', 'E · 120'], ['Kitchen Light', 'C · 76'], ['Last Bus', 'A · 134']];
  return (
    <Frame bg="#F1E8F5">
      <div style={{ position: 'absolute', inset: 0, padding: 6 * k, fontFamily: OUTFIT, color: '#2A1D33', boxSizing: 'border-box' }}>
        <div style={{ ...rise(p, 0, 5, k), fontSize: 4 * k, fontWeight: 600, color: '#9750AA', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Thursday practice</div>
        <div style={{ ...rise(p, 0.6, 5, k), fontSize: 10 * k, fontWeight: 600, letterSpacing: '-0.04em', marginBottom: 2 * k }}>Setlist</div>
        {songs.map(([s, m], i) => (
          <div key={i} style={{ ...rise(p, 1.4 + i * 0.6, 5, k), display: 'flex', alignItems: 'baseline', gap: 3 * k, padding: `${1.8 * k}px 0`, borderTop: `${0.3 * k}px solid #DCCDE6` }}>
            <span style={{ fontSize: 4.4 * k, color: '#9750AA', width: 5 * k }}>{i + 1}</span>
            <span style={{ fontSize: 6 * k, flex: 1, fontWeight: 600 }}>{s}</span>
            <span style={{ fontSize: 4 * k, opacity: 0.6, fontFamily: DMSANS }}>{m}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
};

/** A knitting row counter, huge, because the person's hands are full. */
export const Knit: React.FC<AppProps> = ({ w, h, p }) => {
  const k = Math.min(w, h) / 100;
  return (
    <Frame bg="#F7E6EA">
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: DMSANS, color: '#6B2238' }}>
        <div style={{ ...rise(p, 0, 4, k), fontSize: 4.6 * k, fontWeight: 700 }}>Gran's scarf · row</div>
        <div style={{ ...rise(p, 1, 4, k), fontSize: 30 * k, fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 1 }}>112</div>
        <div style={{ ...rise(p, 1.6, 4, k), width: '64%', height: 2.4 * k, borderRadius: 2 * k, background: '#EDB8C4', marginTop: 2 * k }}><div style={{ width: '80%', height: '100%', borderRadius: 2 * k, background: '#C2456A' }} /></div>
        <div style={{ ...rise(p, 2.4, 4, k), display: 'flex', gap: 4 * k, marginTop: 5 * k }}>
          {['−', '+'].map((s) => <div key={s} style={{ width: 15 * k, height: 15 * k, borderRadius: 15 * k, background: s === '+' ? '#C2456A' : '#fff', color: s === '+' ? '#fff' : '#C2456A', fontSize: 9 * k, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s}</div>)}
        </div>
      </div>
    </Frame>
  );
};

/** The one bus stop that matters, as one big number. */
export const Bus: React.FC<AppProps> = ({ w, h, p }) => {
  const k = Math.min(w, h) / 100, P = h > w;
  return (
    <Frame bg="#F6ECCB">
      <div style={{ position: 'absolute', inset: 0, padding: 7 * k, fontFamily: DMSANS, color: '#3A2E0C', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ ...rise(p, 0, 4, k), fontSize: 5 * k, fontWeight: 700 }}>The 22 · outside my door</div>
        <div style={{ ...rise(p, 1, 4, k), fontSize: (P ? 34 : 30) * k, fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.9 }}>4<span style={{ fontSize: (P ? 10 : 9) * k, letterSpacing: '-0.02em' }}> min</span></div>
        <div style={{ ...rise(p, 2, 4, k), fontSize: 4.6 * k, fontWeight: 500 }}>then 19 min · leave now if you want a seat</div>
      </div>
    </Frame>
  );
};

/** What to sow this week in one small garden. */
export const Garden: React.FC<AppProps> = ({ w, h, p }) => {
  const k = Math.min(w, h) / 100, P = h > w;
  const seeds: [string, string][] = [['Peas', '#7FB069'], ['Radish', '#D9566B'], ['Chard', '#E0A43A'], ['Basil', '#4F9A5B']];
  return (
    <Frame bg="#F1E9DA">
      <div style={{ position: 'absolute', inset: 0, padding: 6 * k, fontFamily: OUTFIT, color: '#3D2E1C', boxSizing: 'border-box' }}>
        <div style={{ ...rise(p, 0, 5, k), fontSize: 9 * k, fontWeight: 600, letterSpacing: '-0.03em' }}>Sow this week</div>
        <div style={{ ...rise(p, 0.5, 5, k), fontSize: 4.4 * k, fontFamily: DMSANS, opacity: 0.7, marginBottom: 3 * k }}>back bed · frost's gone</div>
        <div style={{ display: 'grid', gridTemplateColumns: P ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 3 * k }}>
          {seeds.map(([s, c], i) => (
            <div key={i} style={{ ...rise(p, 1.4 + i * 0.6, 5, k), background: '#FBF7EF', borderRadius: 3 * k, padding: 3 * k, borderTop: `${2 * k}px solid ${c}` }}>
              <svg width={9 * k} height={9 * k} viewBox="0 0 24 24"><path d="M12 21V11" stroke="#5C7A3A" strokeWidth="2" /><path d="M12 12C12 7 8 5 4 5c0 4 3 7 8 7zM12 10c0-4 3-6 7-6 0 4-3 6-7 6z" fill={c} /></svg>
              <div style={{ fontSize: 5 * k, fontWeight: 600, marginTop: 1 * k }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
};

/** Ten Spanish words a day before a trip. */
export const Spanish: React.FC<AppProps> = ({ w, h, p }) => {
  const k = Math.min(w, h) / 100;
  return (
    <Frame bg="#EEE6FF">
      <div style={{ position: 'absolute', inset: 0, padding: 6 * k, fontFamily: DMSANS, color: '#2B1F55', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 * k }}>
        <div style={{ ...rise(p, 0, 4, k), fontSize: 4.4 * k, fontWeight: 700, opacity: 0.7 }}>Seville in May · word 6 of 10</div>
        <div style={{ ...rise(p, 1, 4, k), background: '#fff', borderRadius: 5 * k, padding: `${7 * k}px ${10 * k}px`, boxShadow: `0 ${1.5 * k}px ${4 * k}px rgba(43,31,85,0.15)`, transform: `${rise(p, 1, 4, k).transform} rotate(-2deg)`, textAlign: 'center' }}>
          <div style={{ fontSize: 13 * k, fontWeight: 900, letterSpacing: '-0.04em' }}>la cuenta</div>
          <div style={{ fontSize: 5 * k, opacity: 0.6 }}>the bill, please</div>
        </div>
      </div>
    </Frame>
  );
};

export const APPS = [Recipes, Chores, Birds, Tides, Setlist, Knit, Bus, Garden, Spanish];
// WHY one light family: the first cut's loud yellow, deep teal, hot pink and black read as random colour
// blocks. Every person's copy still has its own colour, but all of them are soft and sit with the brand.
export const APP_BG = ['#FBF3E6', '#E4F0FB', '#E5EDDF', '#DCEDF0', '#F1E8F5', '#F7E6EA', '#F6ECCB', '#F1E9DA', '#EEE6FF'];

/** A person's own screen: their thing on top, and the same ask bar underneath on every one of them.
 *  WHY the shared bar: it is what tells a stranger these are all copies of ONE app, each asked into shape. */
export const OwnScreen: React.FC<{ app: number; w: number; h: number; p: number; frame: number; caret?: boolean }> = ({ app, w, h, p, frame, caret }) => {
  const App = APPS[app];
  const top = askRect(w, h).y - 0.02;
  return (
    <div style={{ position: 'absolute', inset: 0, background: APP_BG[app], overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h * top, overflow: 'hidden' }}><App w={w} h={h * top} p={p} /></div>
      <AskBar w={w} h={h} o={smooth((p - 0.55) * 3)} caret={!!caret && Math.floor(frame / 15) % 2 === 0} />
    </div>
  );
};
