import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { family } from './Caption';
import { CAPTION, windowRect } from './layout';
import { THEMES, type Slug } from './themes';

// The section label: the caption's ONE line, under the window, aligned to its
// left edge — a short accent bar and the headline in the theme's face, the
// last word in the accent. It reads as a chapter title, not a subtitle: the
// bar draws down first, the words then fade in sliding right (not clipped
// behind the bar: a clipped first letter read as a typo in review). The second
// line of copy is no longer here; the host says it (Bubble.tsx).
type Props = { text: string; at: number; slug: Slug; still?: boolean; top?: number; size?: number; accentLast?: boolean };
const R = windowRect();
export const Label: React.FC<Props> = ({ text, at, slug, still = false, top = CAPTION.top + 2, size = 40, accentLast = true }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  if (f < at) return null;
  const t = THEMES[slug];
  const bar = still ? 1 : spring({ frame: f - at, fps, config: { damping: 16, stiffness: 200 } });
  const slide = still ? 1 : spring({ frame: f - at - 4, fps, config: { damping: 18, stiffness: 120 } });
  const words = text.split(' ');
  const shadow = t.dark ? '0 3px 18px rgba(0,0,0,.55)' : `0 2px 12px ${t.canvas}`;
  return (
    <div style={{ position: 'absolute', left: R.x, top, display: 'flex', alignItems: 'center', gap: 18, height: size * 1.15 }}>
      <div style={{ width: 8, height: size * 1.05 * bar, borderRadius: 4, background: t.accent, boxShadow: t.dark ? `0 0 16px ${t.accent}88` : 'none' }} />
      <div>
        <div style={{ fontFamily: family(t), fontSize: size, fontWeight: 800, letterSpacing: '-0.02em', color: t.fg, textShadow: shadow, lineHeight: 1.15, whiteSpace: 'nowrap',
          transform: `translateX(${interpolate(slide, [0, 1], [-24, 0])}px)`, opacity: slide }}>
          {words.map((w, i) => (
            <span key={i} style={{ marginRight: i < words.length - 1 ? '0.26em' : 0, color: accentLast && i === words.length - 1 && words.length > 1 ? t.accent : undefined }}>{w}</span>
          ))}
        </div>
      </div>
    </div>
  );
};
