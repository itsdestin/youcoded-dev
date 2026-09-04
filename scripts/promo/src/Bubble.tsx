import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { family } from './Caption';
import { THEMES, type Slug } from './themes';
import { evaluate, type Action, type HostState } from './host/engine';

// The speech bubble: the caption's second line, said by the host. Destin,
// 2026-09-04: "one top-line caption/section label, then have the sub-label or
// other text appear as a speech bubble coming from the mascot as he moves
// around." A bubble is pinned to the host's head on EVERY frame (two frames
// behind it, so it trails a touch on a move), tail toward the head, on
// whichever side has room; it pops in from its tail on `at`, pops out at
// `until` (or when the next cue starts), and is not drawn while the host is
// hidden or shrunk (the dive into the game) — a bubble with nobody under it
// is the one thing this must never show.
export type BubbleCue = { at: number; until?: number; text: string; slug: Slug };
type Props = { cues: BubbleCue[]; actions: Action[]; base: HostState };
const FONT = 26, PAD_X = 22, PAD_Y = 11, GAP = 18, OUT = 6;

export const Bubbles: React.FC<Props> = ({ cues, actions, base }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const sorted = [...cues].sort((a, b) => a.at - b.at);
  const i = sorted.findLastIndex((c) => f >= c.at);
  if (i < 0) return null;
  const cue = sorted[i];
  const until = Math.min(cue.until ?? Infinity, sorted[i + 1]?.at ?? Infinity);
  if (f >= until + OUT) return null;
  const s = evaluate(actions, base, f - 2);
  if (s.hidden || s.size < 60 || s.alpha < 0.5) return null;
  const t = THEMES[cue.slug];
  const inS = spring({ frame: f - cue.at, fps, config: { damping: 12, stiffness: 190 } });
  const outS = f >= until ? interpolate(f - until, [0, OUT], [1, 0], { extrapolateRight: 'clamp' }) : 1;
  const scale = inS * outS;
  // anchor: the side of the head, at eye height; flips to the left when the host is in the right third
  const headY = s.y + s.size * 0.42;
  const right = s.x + s.size / 2 < 1280;
  const anchorX = right ? s.x + s.size * 0.82 : s.x + s.size * 0.18;
  const bg = t.dark ? t.fg : '#ffffff';
  const ink = t.dark ? t.canvas : t.fg;
  const tail = 14;
  return (
    <div style={{ position: 'absolute', left: anchorX, top: headY, transform: `translate(${right ? GAP : -GAP}px, -50%) ${right ? '' : 'translateX(-100%)'}`, pointerEvents: 'none' }}>
      <div style={{ position: 'relative', transform: `scale(${scale.toFixed(3)})`, transformOrigin: right ? '0% 50%' : '100% 50%', opacity: Math.min(1, scale * 1.4) }}>
        <div style={{ padding: `${PAD_Y}px ${PAD_X}px`, borderRadius: 20, background: bg, color: ink, fontFamily: family(t), fontSize: FONT, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap',
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
