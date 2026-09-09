import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { family } from './Caption';
import { THEMES, type Slug } from './themes';
import { evaluate, E, type Action, type HostState } from './host/engine';
import { measureText } from '@remotion/layout-utils';

// The speech bubble: the caption's second line, said by the host. Destin,
// 2026-09-04: "one top-line caption/section label, then have the sub-label or
// other text appear as a speech bubble coming from the mascot as he moves
// around." A bubble is pinned to the host's head on EVERY frame (two frames
// behind it, so it trails a touch on a move), tail toward the head, on
// whichever side has room; it pops in from its tail on `at`, pops out at
// `until` (or when the next cue starts), and is not drawn while the host is
// hidden or shrunk (the dive into the game) — a bubble with nobody under it
// is the one thing this must never show.
//
// 2026-09-09 (Destin: "improve the styling and the animation for how those messages pop
// in"): the bubble has a LOOK and a MOTION. `classic` is the first film's — a white card with
// a thin accent ring, popped in by a bouncy spring — kept so a review can show it beside the
// new ones. The film uses FILM_LOOK / FILM_MOTION below; the study (BubbleStudy.tsx) renders any.
export type Look = 'classic' | 'card' | 'accent' | 'glass';
export type Motion = 'classic' | 'lift';
// The SHAPE (round two, 2026-09-09 — Destin picked the frosted glass and asked for "thicker
// outline", a fixed "border/alignment between the main bubble and the triangle piece", and
// "a bit more creative with the shape"): `classic` is the old separate wedge laid over the
// box's edge; the rest draw box AND tail as ONE path, so the outline runs unbroken around both.
export type Shape = 'classic' | 'wedge' | 'swoop' | 'nub';
export const FILM_LOOK: Look = 'glass';
export const FILM_MOTION: Motion = 'lift';
export const FILM_SHAPE: Shape = 'swoop';   // Destin's pick, 2026-09-09 ("kinda like swoop")
export type BubbleCue = { at: number; until?: number; text: string; slug: Slug; side?: 'L' | 'R' };
type Props = { cues: BubbleCue[]; actions: Action[]; base: HostState; look?: Look; motion?: Motion; shape?: Shape };
const FONT = 26, PAD_X = 22, PAD_Y = 11, GAP = 18, OUT = 6;
const MAX_W = 560;   // a longer line WRAPS (Destin's twelve-word games line ran off the frame on one line, 2026-09-04)
export const bubbleWidth = (text: string) => Math.min(text.length * FONT * 0.56 + PAD_X * 2, MAX_W + PAD_X * 2);
/**
 * The TIGHT width of a bubble's text: measured word by word (Destin, 2026-09-04: "some of the
 * bubbles have extra empty space on the left/right side"). A box set to `max-content` capped at
 * maxW is maxW wide whenever the text wraps, even when its lines are shorter — so this wraps the
 * words greedily at maxW to learn the line count, then finds the narrowest width that still fits
 * in that many lines. Measured with the real font, so the box hugs the longest line.
 */
const fitCache = new Map<string, { width: number; lines: number }>();
export const fitWidth = (text: string, fontFamily: string, maxW: number) => fitBox(text, fontFamily, maxW).width;
export function fitBox(text: string, fontFamily: string, maxW: number): { width: number; lines: number } {
  const key = `${fontFamily}|${maxW}|${text}`;
  const hit = fitCache.get(key); if (hit != null) return hit;
  const opts = { fontFamily, fontSize: FONT, fontWeight: 600 } as const;
  const words = text.split(' ').map((w) => ({ w, width: measureText({ text: w, ...opts }).width }));
  const space = measureText({ text: 'a a', ...opts }).width - measureText({ text: 'aa', ...opts }).width;
  const lines = (W: number) => { let n = 1, cur = 0; for (const { width } of words) { const add = cur ? space + width : width; if (cur && cur + add > W) { n++; cur = width; } else cur += add; } return n; };
  const total = words.reduce((t, x) => t + x.width, 0) + space * (words.length - 1);
  let out: number, n = 1;
  if (total <= maxW) out = total;
  else {
    n = lines(maxW);
    let lo = Math.max(...words.map((x) => x.width)), hi = maxW;   // the narrowest width that still wraps into n lines
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (lines(mid) <= n) hi = mid; else lo = mid; }
    out = hi;
  }
  out = Math.ceil(out) + 2;   // a hair of slack so the browser's own rounding never adds a line
  const box = { width: out, lines: n };
  fitCache.set(key, box); return box;
}

// ---- the one-path shapes. Drawn for a bubble whose TAIL is on the LEFT (the head is left of
// the box); a bubble on the other side mirrors the glass and the outline, never the text. The
// box spans x = TAIL..w, y = 0..h; the tail reaches x = 0 at the box's vertical centre.
export const TAIL_OF: Record<Shape, number> = { classic: 0, wedge: 18, swoop: 22, nub: 12 };
export function shapePath(shape: Shape, w: number, h: number): string {
  const x0 = TAIL_OF[shape], cy = h / 2;
  const r = Math.min(shape === 'wedge' ? 14 : 22, h / 2 - 1);
  const A = (x: number, y: number) => `A ${r} ${r} 0 0 1 ${x} ${y}`;
  // clockwise from the top-left corner, the tail cut into the left edge on the way back up
  const tail = shape === 'wedge' ? `L ${x0} ${cy + 10} L 0 ${cy} L ${x0} ${cy - 10}`
    // swoop: the lower edge bulges out and down to the tip, the upper edge comes back nearly straight
    // (the first cut curled the upper edge INTO the box and left a notch at the join — Destin: "looks a bit broken")
    : shape === 'swoop' ? `L ${x0} ${cy + 16} Q ${x0 * 0.28} ${cy + 17} 0 ${cy + 4} Q ${x0 * 0.45} ${cy + 1} ${x0} ${cy - 4}`
    : `L ${x0} ${cy + 8} C ${x0 - 13} ${cy + 8} ${x0 - 13} ${cy - 8} ${x0} ${cy - 8}`;
  return `M ${x0 + r} 0 L ${w - r} 0 ${A(w, r)} L ${w} ${h - r} ${A(w - r, h)} L ${x0 + r} ${h} ${A(x0, h - r)} ${tail} L ${x0} ${r} ${A(x0 + r, 0)} Z`;
}

/** The box, ink, tail and shadow of each look, for a theme. */
function styleFor(look: Look, slug: Slug): { box: React.CSSProperties; ink: string; tail: string } {
  const t = THEMES[slug];
  const ff = family(t);
  const base: React.CSSProperties = { fontFamily: ff, fontSize: FONT, fontWeight: 600, lineHeight: 1.2, padding: `${PAD_Y}px ${PAD_X}px` };
  switch (look) {
    case 'classic': {
      const bg = t.dark ? t.fg : '#ffffff', ink = t.dark ? t.canvas : t.fg;
      return { ink, tail: bg, box: { ...base, borderRadius: 20, background: bg, color: ink, boxShadow: `0 8px 24px rgba(0,0,0,${t.dark ? 0.45 : 0.18}), 0 0 0 2px ${t.accent}55` } };
    }
    case 'card': {
      // a paper card: white (a warm off-white on dark themes) with a hairline in the accent, a
      // deeper, softer shadow and no ring — the accent lives in the hairline and the tail
      const bg = t.dark ? '#FBF8F3' : '#ffffff', ink = t.dark ? '#1A1418' : t.fg;
      return { ink, tail: bg, box: { ...base, borderRadius: 18, background: `linear-gradient(180deg, ${bg} 0%, ${bg}F2 100%)`, color: ink,
        border: `1.5px solid ${t.accent}66`, boxShadow: `0 14px 34px rgba(0,0,0,${t.dark ? 0.5 : 0.16}), 0 2px 6px rgba(0,0,0,${t.dark ? 0.35 : 0.08})` } };
    }
    case 'accent': {
      // the theme's own accent as the bubble, the way the app draws YOUR messages
      return { ink: t.onAccent, tail: t.accent, box: { ...base, borderRadius: 20, background: t.accent, color: t.onAccent,
        boxShadow: `0 14px 34px ${t.accent}55, 0 2px 8px rgba(0,0,0,${t.dark ? 0.5 : 0.22})` } };
    }
    case 'glass': {
      // frosted glass over the wallpaper — the app's own translucent bubbles on wallpaper themes
      const bg = t.dark ? 'rgba(18,14,26,0.62)' : 'rgba(255,255,255,0.66)';
      const ink = t.dark ? t.fg : t.fg;
      return { ink, tail: bg, box: { ...base, borderRadius: 20, background: bg, color: ink,
        backdropFilter: 'blur(18px) saturate(1.5)', WebkitBackdropFilter: 'blur(18px) saturate(1.5)',
        border: `1px solid ${t.dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.75)'}`,
        boxShadow: `0 14px 34px rgba(0,0,0,${t.dark ? 0.45 : 0.14}), inset 0 1px 0 ${t.dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.9)'}` } };
    }
  }
}

export const Bubbles: React.FC<Props> = ({ cues, actions, base, look = FILM_LOOK, motion = FILM_MOTION, shape = FILM_SHAPE }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const sorted = [...cues].sort((a, b) => a.at - b.at);
  const i = sorted.findLastIndex((c) => f >= c.at);
  if (i < 0) return null;
  const cue = sorted[i];
  const until = Math.min(cue.until ?? Infinity, sorted[i + 1]?.at ?? Infinity);
  const outFrames = motion === 'classic' ? OUT : 8;
  if (f >= until + outFrames) return null;
  const s = evaluate(actions, base, f - 1);
  if (s.hidden || s.size < 60 || s.alpha < 0.5) return null;
  const t = THEMES[cue.slug];
  // Which side the bubble sits on is decided ONCE per cue, from where the host is on
  // the cue's first frame and whether the text fits between it and the frame edge —
  // never per frame (a host walking across x = 1280 made the bubble flip sides
  // mid-word and run off the edge for five frames in the 3c review).
  const s0 = evaluate(actions, base, cue.at);
  const estWidth = bubbleWidth(cue.text) + GAP + 40;
  const roomRight = 1900 - (s0.x + s0.size * 0.82 + GAP + 40), roomLeft = s0.x + s0.size * 0.18 - GAP - 60;
  const fitsRight = estWidth < roomRight + GAP + 40;
  // a side with less room than the text wants still takes the bubble — it WRAPS to the room (a long line beside the
  // Resume browser went to the left and covered the search field it was pointing at, 2026-09-04)
  const right = cue.side ? cue.side === 'R' : (s0.x + s0.size / 2 < 1280 && fitsRight) || roomRight >= roomLeft;
  const maxW = Math.max(260, Math.min(MAX_W, (right ? roomRight : roomLeft) - PAD_X * 2));
  const { width: tight, lines: nLines } = fitBox(cue.text, family(t), maxW);
  // ---- the motion
  let scale: number, opacity: number, rise = 0, sx = 1, sy = 1, textOpacity = 1;
  if (motion === 'classic') {
    const inS = spring({ frame: f - cue.at, fps, config: { damping: 12, stiffness: 190 } });
    const outS = f >= until ? interpolate(f - until, [0, OUT], [1, 0], { extrapolateRight: 'clamp' }) : 1;
    scale = inS * outS; opacity = Math.min(1, scale * 1.4);
  } else {
    // `lift`: the box grows from its tail with a calmer spring (no bounce past 1), rises a few
    // pixels as it lands, stretches a hair wider than tall on the way in, and the words fade in
    // two frames behind the box — a message arriving, not a balloon inflating. Out: it eases
    // back toward the tail and fades over 8 frames.
    const k = f - cue.at;
    const inS = spring({ frame: k, fps, config: { damping: 15, stiffness: 160, mass: 0.9 } });
    scale = 0.55 + 0.45 * inS; opacity = Math.min(1, k / 3 + 0.2);
    rise = 8 * (1 - inS);
    const h = E.hump(Math.min(1, k / 12));
    sx = 1 + 0.05 * h; sy = 1 - 0.035 * h;
    textOpacity = interpolate(k, [2, 7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    if (f >= until) {
      const o = (f - until) / 8;
      scale *= interpolate(E.inQuad(o), [0, 1], [1, 0.86]); opacity = 1 - E.inQuad(o); rise = -6 * o;
    }
  }
  // anchor: the side of the head, at eye height; flips to the left when the host is in the right third
  const headY = s.y + s.size * 0.42;
  const anchorX = right ? s.x + s.size * 0.82 : s.x + s.size * 0.18;
  const { box, ink, tail: tailFill } = styleFor(look, cue.slug);
  const tail = 14;
  if (shape !== 'classic') {
    // ONE shape for box and tail: a glass (or solid) layer clipped to the path, the outline drawn
    // over it as the same path — so the line runs unbroken around the tail (the old wedge was a
    // second element laid over the box's edge, and its seam showed — Destin, round two).
    const TAIL = TAIL_OF[shape];
    const w = tight + PAD_X * 2 + TAIL, h = Math.round(nLines * FONT * 1.2) + PAD_Y * 2;
    const d = shapePath(shape, w, h);
    const stroke = 2.5;
    const line = t.dark ? `${t.accent}CC` : `${t.accent}B3`;   // the outline: the theme accent, 70–80 %
    const fill = look === 'glass' ? (t.dark ? 'rgba(18,14,26,0.62)' : 'rgba(255,255,255,0.66)') : look === 'accent' ? t.accent : look === 'card' ? (t.dark ? '#FBF8F3' : '#ffffff') : '#ffffff';
    const flip = right ? undefined : 'scaleX(-1)';
    return (
      <div style={{ position: 'absolute', left: anchorX, top: headY, transform: `translate(${right ? GAP - 4 : -(GAP - 4)}px, calc(-50% + ${rise.toFixed(2)}px)) ${right ? '' : 'translateX(-100%)'}`, pointerEvents: 'none' }}>
        <div style={{ position: 'relative', width: w, height: h, transform: `scale(${(scale * sx).toFixed(3)}, ${(scale * sy).toFixed(3)})`, transformOrigin: right ? '0% 50%' : '100% 50%', opacity,
          filter: `drop-shadow(0 12px 26px rgba(0,0,0,${t.dark ? 0.45 : 0.16}))` }}>
          <div style={{ position: 'absolute', inset: 0, transform: flip, clipPath: `path('${d}')`, WebkitClipPath: `path('${d}')`, background: fill,
            ...(look === 'glass' ? { backdropFilter: 'blur(18px) saturate(1.5)', WebkitBackdropFilter: 'blur(18px) saturate(1.5)' } : {}) }} />
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', transform: flip }}>
            <path d={d} fill="none" stroke={line} strokeWidth={stroke} strokeLinejoin="round" />
            {look === 'glass' && <path d={d} fill="none" stroke={t.dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.9)'} strokeWidth={1} style={{ transform: 'translate(0, 1.2px)' }} />}
          </svg>
          <div style={{ position: 'absolute', left: right ? TAIL : 0, top: 0, width: tight, padding: `${PAD_Y}px ${PAD_X}px`, fontFamily: box.fontFamily, fontSize: FONT, fontWeight: 600, lineHeight: 1.2,
            whiteSpace: 'normal', boxSizing: 'content-box', textAlign: right ? 'left' : 'right', color: ink, opacity: textOpacity }}>{cue.text}</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', left: anchorX, top: headY, transform: `translate(${right ? GAP : -GAP}px, calc(-50% + ${rise.toFixed(2)}px)) ${right ? '' : 'translateX(-100%)'}`, pointerEvents: 'none' }}>
      <div style={{ position: 'relative', transform: `scale(${(scale * sx).toFixed(3)}, ${(scale * sy).toFixed(3)})`, transformOrigin: right ? '0% 50%' : '100% 50%', opacity }}>
        <div style={{ ...box, whiteSpace: 'normal', width: tight, boxSizing: 'content-box', textAlign: right ? 'left' : 'right', color: ink }}>
          <span style={{ opacity: textOpacity }}>{cue.text}</span>
        </div>
        {/* the tail: a rounded wedge pointing at the head */}
        <svg width={tail + 4} height={tail * 1.6} viewBox={`0 0 ${tail + 4} ${tail * 1.6}`}
          style={{ position: 'absolute', top: '50%', [right ? 'left' : 'right']: -tail + 2, transform: `translateY(-50%) ${right ? '' : 'scaleX(-1)'}` }}>
          <path d={`M ${tail + 3} 2 L 1 ${tail * 0.8} L ${tail + 3} ${tail * 1.6 - 2} Z`} fill={tailFill} />
        </svg>
      </div>
    </div>
  );
};
