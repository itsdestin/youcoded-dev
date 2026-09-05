import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { family } from './Caption';
import { THEMES, type Slug } from './themes';
import { evaluate, type Action, type HostState } from './host/engine';
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
export type BubbleCue = { at: number; until?: number; text: string; slug: Slug; side?: 'L' | 'R' };
type Props = { cues: BubbleCue[]; actions: Action[]; base: HostState };
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
const fitCache = new Map<string, number>();
export function fitWidth(text: string, fontFamily: string, maxW: number): number {
  const key = `${fontFamily}|${maxW}|${text}`;
  const hit = fitCache.get(key); if (hit != null) return hit;
  const opts = { fontFamily, fontSize: FONT, fontWeight: 600 } as const;
  const words = text.split(' ').map((w) => ({ w, width: measureText({ text: w, ...opts }).width }));
  const space = measureText({ text: 'a a', ...opts }).width - measureText({ text: 'aa', ...opts }).width;
  const lines = (W: number) => { let n = 1, cur = 0; for (const { width } of words) { const add = cur ? space + width : width; if (cur && cur + add > W) { n++; cur = width; } else cur += add; } return n; };
  const total = words.reduce((t, x) => t + x.width, 0) + space * (words.length - 1);
  let out: number;
  if (total <= maxW) out = total;
  else {
    const n = lines(maxW);
    let lo = Math.max(...words.map((x) => x.width)), hi = maxW;   // the narrowest width that still wraps into n lines
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (lines(mid) <= n) hi = mid; else lo = mid; }
    out = hi;
  }
  out = Math.ceil(out) + 2;   // a hair of slack so the browser's own rounding never adds a line
  fitCache.set(key, out); return out;
}

export const Bubbles: React.FC<Props> = ({ cues, actions, base }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const sorted = [...cues].sort((a, b) => a.at - b.at);
  const i = sorted.findLastIndex((c) => f >= c.at);
  if (i < 0) return null;
  const cue = sorted[i];
  const until = Math.min(cue.until ?? Infinity, sorted[i + 1]?.at ?? Infinity);
  if (f >= until + OUT) return null;
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
  const tight = fitWidth(cue.text, family(t), maxW);
  const inS = spring({ frame: f - cue.at, fps, config: { damping: 12, stiffness: 190 } });
  const outS = f >= until ? interpolate(f - until, [0, OUT], [1, 0], { extrapolateRight: 'clamp' }) : 1;
  const scale = inS * outS;
  // anchor: the side of the head, at eye height; flips to the left when the host is in the right third
  const headY = s.y + s.size * 0.42;
  const anchorX = right ? s.x + s.size * 0.82 : s.x + s.size * 0.18;
  const bg = t.dark ? t.fg : '#ffffff';
  const ink = t.dark ? t.canvas : t.fg;
  const tail = 14;
  return (
    <div style={{ position: 'absolute', left: anchorX, top: headY, transform: `translate(${right ? GAP : -GAP}px, -50%) ${right ? '' : 'translateX(-100%)'}`, pointerEvents: 'none' }}>
      <div style={{ position: 'relative', transform: `scale(${scale.toFixed(3)})`, transformOrigin: right ? '0% 50%' : '100% 50%', opacity: Math.min(1, scale * 1.4) }}>
        <div style={{ padding: `${PAD_Y}px ${PAD_X}px`, borderRadius: 20, background: bg, color: ink, fontFamily: family(t), fontSize: FONT, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'normal', width: tight, boxSizing: 'content-box', textAlign: right ? 'left' : 'right',
          boxShadow: `0 8px 24px rgba(0,0,0,${t.dark ? 0.45 : 0.18}), 0 0 0 2px ${t.accent}55` }}>{cue.text}</div>
        {/* the tail: a rounded wedge pointing at the head */}
        <svg width={tail + 4} height={tail * 1.6} viewBox={`0 0 ${tail + 4} ${tail * 1.6}`}
          style={{ position: 'absolute', top: '50%', [right ? 'left' : 'right']: -tail + 2, transform: `translateY(-50%) ${right ? '' : 'scaleX(-1)'}` }}>
          <path d={`M ${tail + 3} 2 L 1 ${tail * 0.8} L ${tail + 3} ${tail * 1.6 - 2} Z`} fill={bg} />
        </svg>
      </div>
    </div>
  );
};
