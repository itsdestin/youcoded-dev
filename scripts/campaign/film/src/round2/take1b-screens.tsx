// Take 1B: what is drawn ON the screens. Two kinds of picture:
//  1. The SAME screen: one bland, tidy layout every device shows, because a few companies decided it.
//  2. The person's OWN things: small apps people made by asking (brand guide §8: in an ad, what a person
//     makes may be staged). Each one is deliberately its own world, with its own colours and type, so the
//     final wall reads as "everyone's copy is different" at a glance.
//  3. The REAL youcoded window, as single frames of recordings of the running app (take1b-stills.mjs),
//     wearing real community themes. WHY: brand guide section 8 says the app's own interface is never drawn;
//     the reviewer (2026-11-20) caught the old drawn pastel "ask" bar as exactly that, and the owner did not
//     like the pastel themes. Nothing of the app is drawn in this file any more.
import React from 'react';
import { Img, staticFile } from 'remotion';
import { DMSANS } from '../brand';
import { WORLD } from './take1b-world';

const cl = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = cl(x); return t * t * (3 - 2 * t); };
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

/** Where a padlock is in its arrival `p` (0..1): it falls from above the tile, accelerating, lands at p = LOCK_LAND a
 *  little large with a one-frame squash, then settles with a damped shake as it snaps shut. */
export const LOCK_LAND = 0.4;
const lockFall = (p: number) => {
  const f = cl(p / LOCK_LAND);
  const since = (p - LOCK_LAND) / (1 - LOCK_LAND);   // 0..1 after landing
  return {
    y: -(1 - f * f) * 1.8,                             // in lock heights above its rest
    o: cl(f * 4),                                      // seen only once it is falling (a few frames)
    sq: p >= LOCK_LAND ? Math.exp(-since * 14) : 0,     // the squash on contact
    sc: p >= LOCK_LAND ? 1 + 0.15 * Math.exp(-since * 6) : 1.15,
    shake: p >= LOCK_LAND && since < 1 ? Math.sin(since * 30) * 7 * (1 - since) : 0,
    landed: p >= LOCK_LAND ? 1 : 0,
  };
};
/** A padlock: a real-looking one (round 6 review: the old flat icon faded in place and read as a "disabled" state).
 *  A steel shackle with thickness, a body with a lit top edge, a dark keyhole, and a shadow on the tile that grows as
 *  it comes down. `off` 0..1 knocks it off (line 7). */
export const Lock: React.FC<{ s: number; p: number; off: number }> = ({ s, p, off }) => {
  const L = lockFall(p);
  const gone = 1 - smooth(off * 1.6);
  const near = cl(1 + L.y / 1.8);                     // 0 high above, 1 on the tile
  return (
    <div style={{ position: 'relative', width: s, height: s }}>
      {/* its shadow on the tile: small and faint while it is high, full as it lands */}
      <div style={{ position: 'absolute', left: s * 0.18, right: s * 0.06, top: s * 0.72, height: s * 0.24, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(30,14,44,0.55), transparent)',
        opacity: L.o * near * gone, transform: `scale(${0.5 + 0.5 * near}) translateX(${s * 0.06}px)` }} />
      <svg width={s} height={s} viewBox="0 0 24 24" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: L.o * gone, transformOrigin: '50% 90%',
        transform: `translateY(${(L.y + off * 1.4) * s}px) rotate(${L.shake + off * 50}deg) scale(${L.sc * (1 + L.sq * 0.08)}, ${L.sc * (1 - L.sq * 0.12)})` }}>
        <defs>
          <linearGradient id="lkBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6A5A78" /><stop offset="0.18" stopColor="#4A3B57" /><stop offset="1" stopColor="#2C2136" /></linearGradient>
          <linearGradient id="lkSteel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8F8A98" /><stop offset="0.45" stopColor="#E4E0EA" /><stop offset="1" stopColor="#7C7686" /></linearGradient>
        </defs>
        <path d="M7.6 11V7.8a4.4 4.4 0 0 1 8.8 0V11" stroke="#3B3346" strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <path d="M7.6 11V7.8a4.4 4.4 0 0 1 8.8 0V11" stroke="url(#lkSteel)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <rect x="4.2" y="10.2" width="15.6" height="11.6" rx="2.6" fill="url(#lkBody)" />
        <rect x="4.9" y="10.7" width="14.2" height="1.1" rx="0.55" fill="rgba(255,255,255,0.28)" />
        <circle cx="12" cy="15.3" r="1.55" fill="#140C1A" />
        <rect x="11.35" y="15.6" width="1.3" height="3.2" rx="0.6" fill="#140C1A" />
      </svg>
    </div>
  );
};

export type SameProps = {
  w: number; h: number;
  /** the layout, 0..2 (in between while every block slides to its new place) */
  lay?: number;
  /** padlocks: one arrival value for every locked tile, or one per tile; `unlock` 0..1 knocks them off */
  lock?: number | number[]; unlock?: number | number[];
  /** 0..1 "Terms have changed" dialog; `accept` 0..1 its button pressed and the dialog gone */
  dialog?: number; accept?: number;
  /** the hero phone only: the "Share with partners" switch (`o` slides it in, `on` flips it) */
  share?: { o: number; on: number };
  /** the hero phone only: 0..1 outline on each of the person's three things as the receipt copies it out */
  outline?: { photo: number; msg: number; note: number };
};

export const SameScreen: React.FC<SameProps> = ({ w, h, lay = 0, lock = 0, unlock = 0, dialog = 0, accept = 0, share, outline }) => {
  const k = Math.min(w, h) / 100;
  const L = sameLayout(w, h, lay);
  const P = L.portrait;
  const { cols, rows } = gridDims(w, h, P);
  const g = L.grid;
  const gx = 2.4 * k;
  const tw = (g.w * w - gx * (cols - 1)) / cols, th = (g.h * h - gx * (rows - 1)) / rows;
  const tileHues = ['#DCD3E6', '#D3C9DF', '#E2DBEA', '#CFC4DC', '#D9D0E4', '#CCC1D9'];
  const lockOf = (i: number) => (Array.isArray(lock) ? lock[i] ?? 0 : i % 3 !== 0 ? lock : 0);
  // WHY per tile (round 6 review: the padlocks used to fade in place): once a tile's padlock is knocked off, the film
  // draws that padlock out in the room (take1b.tsx LaptopLocks) so it can tumble past the screen's edge and the shelf
  const unlockOf = (i: number) => (Array.isArray(unlock) ? unlock[i] ?? 0 : unlock);
  // the press: down over 3 frames, darker, up over 4 (accept runs over 0.6 s, so 0.167 per 3 frames), then the card
  // drops a few px as it fades. WHY (review): the old button only swapped its word, there was no press to see
  const press = accept <= 0 ? 0 : accept < 0.167 ? smooth(accept / 0.167) : 1 - smooth((accept - 0.167) / 0.22);
  const dlg = smooth(dialog) * (1 - smooth((accept - 0.36) * 3.2));
  const drop = smooth((accept - 0.36) * 3.2) * 7 * k / 3;
  return (
    <div style={{ position: 'absolute', inset: 0, background: S.bg, overflow: 'hidden', fontFamily: DMSANS }}>
      {/* status row */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: (P ? 0.065 : 0.09) * h, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${5 * k}px`, fontSize: 3.2 * k, fontWeight: 700, color: S.ink }}>
        <span>9:41</span><span style={{ display: 'flex', gap: 1 * k }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 2 * k, height: 2 * k, borderRadius: k, background: S.ink2 }} />)}</span>
      </div>
      {!P && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 0.2 * w, background: '#ECE6F2' }}>
        {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ position: 'absolute', left: 4 * k, top: (0.17 + i * 0.1) * h, width: 0.2 * w - 8 * k, height: 4 * k, borderRadius: 2 * k, background: i === 0 ? S.tile2 : S.tile }} />)}
      </div>}
      {/* WHY the title gives way to the switch (review: the switch used to slide over it and cover the top of Sam's
          outline); the switch takes exactly the title's place */}
      <div style={{ position: 'absolute', left: (P ? 0.07 : 0.25) * w, top: 0.075 * h, fontSize: 6 * k, fontWeight: 900, letterSpacing: '-0.03em', color: S.ink, opacity: share ? 1 - smooth(share.o * 1.5) : 1 }}>Good morning</div>
      {(['photo', 'msg', 'note'] as const).map((kind) => (
        <div key={kind} style={box(L[kind], w, h)}><OwnCard kind={kind} w={L[kind].w * w} h={L[kind].h * h} k={k} /></div>
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const x = g.x * w + (i % cols) * (tw + gx), y = g.y * h + Math.floor(i / cols) * (th + gx);
        const lk = lockOf(i);
        // WHY only once it has landed, and only 30% (review: the old full grey-out read as a generic "disabled" state;
        // the tile keeps its colour, it is simply locked)
        const lo = (lk >= LOCK_LAND ? 1 : 0) * (1 - smooth(unlockOf(i)));
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, width: tw, height: th, borderRadius: 3 * k, background: tileHues[i], display: 'flex', alignItems: 'center', justifyContent: 'center',
            filter: lo > 0 ? `saturate(${1 - 0.3 * lo}) brightness(${1 - 0.06 * lo})` : undefined }}>
            <div style={{ width: Math.min(tw, th) * 0.42, height: Math.min(tw, th) * 0.42, borderRadius: Math.min(tw, th) * 0.14, background: 'rgba(255,255,255,0.55)', opacity: 1 - 0.6 * lo }} />
            {lk > 0 && unlockOf(i) <= 0 && <div style={{ position: 'absolute' }}><Lock s={Math.min(tw, th) * 0.62} p={lk} off={0} /></div>}
          </div>
        );
      })}
      {/* WHY outlines: each of the person's things is ringed the moment its line prints on the receipt below the
          phone, so a viewer sees the paper is a copy of THESE things, which also stay where they are */}
      {outline && (['photo', 'msg', 'note'] as const).map((kind) => {
        const o = outline[kind];
        if (o <= 0) return null;
        const r = L[kind];
        return <div key={`o-${kind}`} style={{ position: 'absolute', left: r.x * w - 1.2 * k, top: r.y * h - 1.2 * k, width: r.w * w + 2.4 * k, height: r.h * h + 2.4 * k, borderRadius: 4 * k, boxSizing: 'border-box', border: `${1.3 * k}px solid #9750AA`, opacity: o }} />;
      })}
      {share && <ShareSwitch w={w} h={h} o={share.o} on={share.on} />}
      {/* "Terms have changed": the same dialog, accepted by everyone */}
      {dlg > 0 && <>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(40,28,52,0.42)', opacity: dlg }} />
        {/* WHY 0.66 wide on landscape screens: the title stays on one line on the tablet as on the laptop */}
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: (P ? 0.84 : 0.66) * w, transform: `translate(-50%,calc(-50% + ${drop}px)) scale(${0.9 + 0.1 * dlg})`, opacity: dlg,
          background: '#FBF9FC', borderRadius: 4 * k, padding: 4 * k, boxSizing: 'border-box', boxShadow: `0 ${2 * k}px ${6 * k}px rgba(40,20,60,0.3)` }}>
          <div style={{ fontSize: (P ? 5.6 : 6.4) * k, fontWeight: 900, color: S.ink, letterSpacing: '-0.03em', lineHeight: 1.05 }}>Our terms have changed</div>
          {[0.95, 0.8, 0.9].map((f, i) => <div key={i} style={{ height: 1.5 * k, width: `${f * 100}%`, background: S.line, borderRadius: k, marginTop: 1.5 * k }} />)}
          <div style={{ marginTop: 3 * k, height: 8.5 * k, borderRadius: 8 * k, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 4.4 * k, fontWeight: 700,
            background: press > 0.3 ? '#2A1F33' : '#5A5065', color: '#fff', transform: `scale(${1 - 0.06 * press})`,
            boxShadow: press > 0 ? `inset 0 ${0.8 * k}px ${1.6 * k}px rgba(0,0,0,${0.45 * press}), 0 0 0 ${0.8 * k * press}px rgba(151,80,170,${0.35 * press})` : `0 ${0.5 * k}px ${1 * k}px rgba(40,20,60,0.25)` }}>{accept > 0.2 ? 'Accepted' : 'Accept'}</div>
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
    <div style={{ position: 'absolute', left: '7%', right: '7%', top: 0.066 * h, height: 0.064 * h, borderRadius: 3 * k, background: '#FBF9FC', boxShadow: `0 ${k}px ${3 * k}px rgba(40,20,60,0.25)`, fontFamily: DMSANS,
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

// =====================================================================================================
// 2. Someone's OWN screen: always a real picture of the youcoded window (public/stills/r4, made by
//    take1b-library.mjs against a practice build), each in a real community or built-in theme with a different
//    page in focus. WHY nothing drawn (owner, round 3: "the screens should eventually all show youcoded windows
//    with different themes and pages in focus"; brand guide 8: the app's own interface is never drawn or faked).
//    The drawn apps of earlier rounds (recipes, chores, birds...) are gone.
// =====================================================================================================
type Shape = 'phone' | 'tablet' | 'laptop' | 'tv';
// Every library still the wall may use, by name (theme-shape-focus), with its mean brightness (0..255, measured
// once; under 60 counts as near-black). WHY only conversations, paint studios and empty windows (round 6 review, and
// brand guide 9: the smart-home and money dashboards are not in the app and must never read as features): the wall says
// "everyone's copy looks different" through the themes, and "people make things" through the studios, each with its
// own painting. Left out on purpose: the "media" pages (a real video service's logo), the story-only stills, the
// Golden Sunbreak phone (the hero's own look) and the two themes the owner dislikes (never shot).
const LIB: [string, number][] = [
  ['creme-laptop-chat', 218], ['creme-phone-chat', 208], ['creme-tablet-chat', 217], ['creme-tv-chat', 221], ['creme-tablet-paint', 200], ['creme-phone-wake', 233],
  ['dark-laptop-chat', 33], ['dark-phone-chat', 44], ['dark-tablet-chat', 35], ['dark-tv-chat', 31], ['dark-tv-paint', 70],
  ['devils-garden-laptop-chat', 131], ['devils-garden-phone-chat', 126], ['devils-garden-tablet-chat', 128], ['devils-garden-tv-chat', 135],
  ['golden-sunbreak-laptop-chat', 88], ['golden-sunbreak-tablet-chat', 88], ['golden-sunbreak-tv-chat', 93], ['golden-sunbreak-laptop-paint', 110],
  ['halftone-dimension-laptop-chat', 27], ['halftone-dimension-phone-chat', 33], ['halftone-dimension-tablet-chat', 28], ['halftone-dimension-tv-chat', 27], ['halftone-dimension-tablet-paint', 110],
  ['kuromi-dreamer-laptop-chat', 183], ['kuromi-dreamer-phone-chat', 185], ['kuromi-dreamer-tablet-chat', 184], ['kuromi-dreamer-tv-chat', 182], ['kuromi-dreamer-tablet-paint', 190],
  ['light-laptop-chat', 222], ['light-phone-chat', 211], ['light-tablet-chat', 221], ['light-tv-chat', 225], ['light-laptop-paint', 200], ['light-phone-wake', 237],
  ['midnight-laptop-chat', 32], ['midnight-phone-chat', 41], ['midnight-tablet-chat', 33], ['midnight-tv-chat', 30],
  ['morning-rounds-laptop-chat', 205], ['morning-rounds-phone-chat', 192], ['morning-rounds-tablet-chat', 202], ['morning-rounds-tv-chat', 207], ['morning-rounds-laptop-paint', 200], ['morning-rounds-phone-wake', 205],
  ['strawberry-kitty-laptop-chat', 209], ['strawberry-kitty-phone-chat', 210], ['strawberry-kitty-tablet-chat', 209], ['strawberry-kitty-tv-paint', 200],
  ['youcoded-laptop-chat', 198], ['youcoded-phone-chat', 194], ['youcoded-tablet-chat', 197], ['youcoded-tv-chat', 198], ['youcoded-tablet-paint', 200],
  ['youcoded-night-laptop-chat', 56], ['youcoded-night-phone-chat', 60],
  ['kuromi-dreamer-phone-wake', 179], ['strawberry-kitty-phone-wake', 209], ['devils-garden-phone-wake', 153], ['youcoded-phone-wake', 198],
];
const LUM = new Map(LIB);
const THEMES = ['youcoded-night', 'youcoded', 'creme', 'light', 'dark', 'midnight', 'halftone-dimension', 'golden-sunbreak', 'devils-garden', 'kuromi-dreamer', 'strawberry-kitty', 'morning-rounds'];
const themeOf = (name: string) => THEMES.filter((t) => name.startsWith(`${t}-`)).sort((a, b) => b.length - a.length)[0] ?? name;
const shapeOf = (name: string) => (name.match(/-(phone|tablet|laptop|tv)-/)?.[1] ?? 'tv') as Shape;
const focusOf = (name: string) => name.slice(name.lastIndexOf('-') + 1);
// the light each theme throws on its shelf at night (its main colour, roughly)
const THEME_GLOW: Record<string, string> = {
  youcoded: '#C9A6E0', 'youcoded-night': '#6B4FA8', creme: '#E8D9BC', light: '#E9E6EF', dark: '#3A3A44', midnight: '#2E3A66', 'halftone-dimension': '#B0335A',
  'golden-sunbreak': '#E0A93A', 'devils-garden': '#C8643C', 'kuromi-dreamer': '#C9A3E6', 'strawberry-kitty': '#F2A3B8', 'morning-rounds': '#F0D7C2',
};
export const r4 = (name: string) => `stills/r4/${name}.png`;

export type Look = { still: string; glow: string; key: string; theme: string };
const hex = (c: string) => { const n = parseInt(c.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},1)`; };
export const look = (name: string): Look => ({ still: r4(name), glow: hex(THEME_GLOW[themeOf(name)] ?? '#C9A6E0'), key: name, theme: themeOf(name) });

// The story's own devices get the stills their lines need (plan).
const FIXED: Record<string, string> = {
  lockLaptop: 'creme-laptop-paint',              // "what our computers can do": the padlocks fall and it opens into a paint studio ("beach day")
  // "what it costs": the tag turns to free and it opens into a conversation in Devil's Garden. WHY not the plan's
  // home page (round 6 review): the home dashboard is not in the app (brand guide 9)
  tagTablet: 'devils-garden-tablet-chat',
  // WHY the TV's own film night (round 6 review: it used to open on a copy of the laptop's painting; the plan's
  // light-tv-media shows a real video service's logo): a family's thing, unmistakably someone's own, no brands
  tv: 'strawberry-kitty-tv-mine',
  '0:l0': 'kuromi-dreamer-laptop-chat',          // a neighbour on "who"; the shared board arrives here in its own Kuromi look
  '0:r1': 'morning-rounds-phone-chat',           // a neighbour on "who"; the shared board arrives here in Morning Rounds
  '-1:l0': 'youcoded-phone-chat',                // the third neighbour on "who", on the shelf above, clear of the headline
};

/** A small seeded random generator. WHY seeded: the wall must come out the same on every render. */
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/** Every device's still, decided once for the whole wall. Rules (plan): the still's shape matches the device (a
 *  monitor wears a TV-shaped still: 1.74 vs 1.79, a 2% crop); no still twice within about two screens' widths on the
 *  same shelf or the shelves either side (so never twice in one frame of the track); no two neighbours in the same
 *  theme; mostly conversations and paint studios, home and money pages a spread-out minority; never a near-black
 *  still next to a story device; least-used first so every still gets its turn. */
const LOOKS: Map<string, Look> = (() => {
  const out = new Map<string, Look>();
  const r = rng(20261121);
  const used = new Map<string, number>();
  const devs = [...WORLD.devs].sort((a, b) => a.row - b.row || a.cx - b.cx);
  const STORY_IDS = ['hero', 'lockLaptop', 'tagTablet', 'tv'];
  for (const d of devs) if (FIXED[d.id]) { out.set(d.id, look(FIXED[d.id])); used.set(FIXED[d.id], 9); }
  for (const d of devs) {
    if (out.has(d.id) || d.id === 'hero') continue;
    const shape: Shape = d.kind === 'monitor' ? 'tv' : (d.kind as Shape);
    const nearStory = WORLD.devs.some((o) => STORY_IDS.includes(o.id) && Math.abs(o.row - d.row) <= 1 && Math.abs(o.cx - d.cx) < (o.w + d.w) / 2 + 260);
    // WHY no near-black still on a device the lateral track passes or next to a story device (round 6 review: a black
    // empty window in the middle of the track read as a dead screen, which is the TV's job alone)
    const tracked = d.row >= -1 && d.row <= 1 && Math.abs(d.cx) < 2400;
    const cands = LIB.map(([n]) => n).filter((n) => shapeOf(n) === shape && !((nearStory || tracked) && (LUM.get(n) ?? 255) < 60));
    // WHY two reaches: within a frame's width on this shelf and the next, and a little closer two shelves away (a frame
    // of the track holds about two and a half shelves)
    // (a frame of the track is about 1830 wide; 2000 keeps a margin)
    const reach = WORLD.devs.filter((o) => o.id !== d.id && out.has(o.id) && ((Math.abs(o.row - d.row) <= 1 && Math.abs(o.cx - d.cx) < 2000) || (Math.abs(o.row - d.row) === 2 && Math.abs(o.cx - d.cx) < 1200)));
    const near = WORLD.devs.filter((o) => o.id !== d.id && out.has(o.id) && Math.abs(o.row - d.row) <= 1 && Math.abs(o.cx - d.cx) < (o.w + d.w) / 2 + 620);
    // WHY the page too (round 6 look check): two climate pages side by side read as one screen copied, even in two themes
    const ok = (n: string) => !reach.some((o) => out.get(o.id)!.key === n) && !near.some((o) => out.get(o.id)!.theme === themeOf(n) || (focusOf(n) !== 'chat' && focusOf(out.get(o.id)!.key) === focusOf(n)));
    // WHY a penalty on pages: the plan wants conversations and paint studios to carry the wall
    const page = (n: string) => (focusOf(n) === 'paint' ? -0.2 : focusOf(n) === 'chat' ? 0 : 0.5) + ((LUM.get(n) ?? 255) < 60 ? 0.7 : 0);
    // WHY a cost for every screen in the same theme within a frame (round 6 look check: Kuromi's patterned wallpaper
    // turned up eight times in one wide, in different shapes, and read as one screen copied); and a small one on the
    // plain Light theme, which on the wall reads as a blank white rectangle
    // (counted over a whole wide frame: the shelf above and below too, about two frame-widths across)
    const wide = WORLD.devs.filter((o) => o.id !== d.id && out.has(o.id) && Math.abs(o.row - d.row) <= 3 && Math.abs(o.cx - d.cx) < 3400);
    const sameTheme = (n: string) => wide.filter((o) => out.get(o.id)!.theme === themeOf(n)).length * 0.8 + (themeOf(n) === 'light' ? 0.4 : 0);
    // WHY a painting never twice in a wide frame (round 6 look check: the fish tank turned up three times): each one is
    // a picture someone made, and a copy of it reads as copy-paste
    const paintSeen = (n: string) => focusOf(n) === 'paint' && wide.some((o) => out.get(o.id)!.key === n);
    const order = cands.map((n) => ({ n, k: (used.get(n) ?? 0) + page(n) + sameTheme(n) + r() * 0.9 })).sort((a, b) => a.k - b.k).map((x) => x.n);
    const pick = order.find((n) => ok(n) && !paintSeen(n)) ?? order.find(ok) ?? order.find((n) => !reach.some((o) => out.get(o.id)!.key === n)) ?? order[0];
    out.set(d.id, look(pick));
    used.set(pick, (used.get(pick) ?? 0) + 1);
  }
  return out;
})();
// WHY a check (round 6 review: the same capture showed up several times in one frame): no two devices that can share a
// frame (the same shelf or the next, within a wide frame's width) may show the same still. Fails the render loudly.
{
  const ds = WORLD.devs.filter((d) => LOOKS.has(d.id));
  for (const a of ds) for (const b of ds) {
    if (a.id >= b.id) continue;
    if (Math.abs(a.row - b.row) <= 1 && Math.abs(a.cx - b.cx) < 1900 && LOOKS.get(a.id)!.key === LOOKS.get(b.id)!.key) throw new Error(`take1b: ${a.id} and ${b.id} show the same still (${LOOKS.get(a.id)!.key}) in one frame`);
  }
}
/** What a device shows once it is someone's own (the hero phone's own stills are chosen in take1b.tsx). */
export const lookFor = (d: { id: string }): Look => LOOKS.get(d.id) ?? look('golden-sunbreak-tv-chat');
/** For the render check: how many different stills the wall uses. */
export const WALL_VARIETY = new Set([...LOOKS.values()].map((l) => l.key)).size;

/** One frame of the real app, filling a screen. Every still is cut to its device's exact shape (take1b-library.mjs),
 *  so "cover" crops nothing of the app's interface (a monitor loses 1% at each side). */
export const RealApp: React.FC<{ src: string; w: number; h: number; style?: React.CSSProperties }> = ({ src, w, h, style }) => (
  <Img src={staticFile(src)} style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, objectFit: 'cover', objectPosition: '50% 50%', ...style }} />
);

/** A person's own screen: the real app in their theme. */
export const OwnScreen: React.FC<{ look: Look; w: number; h: number }> = ({ look: l, w, h }) => (
  <div style={{ position: 'absolute', inset: 0, background: '#120A19', overflow: 'hidden' }}><RealApp src={l.still} w={w} h={h} /></div>
);
