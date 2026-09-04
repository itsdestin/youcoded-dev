import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { family } from './Caption';
import { CAPTION, windowRect } from './layout';
import { THEMES, type Slug } from './themes';

// The section label: the caption's ONE line, CENTRED under the window (Destin,
// 2026-09-04: "keep their centered position") — a short accent bar and the headline in the theme's face, the
// last word in the accent. It reads as a chapter title, not a subtitle: the
// bar draws down first, the words then fade in sliding right (not clipped
// behind the bar: a clipped first letter read as a typo in review). The second
// line of copy is no longer here; the host says it (Bubble.tsx).
type Props = { text: string; at: number; slug: Slug; still?: boolean; top?: number; size?: number; accentLast?: boolean; align?: 'center' | 'left' };
const R = windowRect();
export const Label: React.FC<Props> = ({ text, at, slug, still = false, top = CAPTION.top - 2, size = 46, accentLast = true, align = 'center' }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  if (f < at) return null;
  const t = THEMES[slug];
  const slide = still ? 1 : spring({ frame: f - at, fps, config: { damping: 18, stiffness: 120 } });
  const words = text.split(' ');
  // 2026-09-04: no accent bar ("fingernail") and, since the fourth draft, no underline either ("i don't
  // like the underline"); the words carry a soft glow in the accent. This is variant G of LabelStudy; the
  // one Destin picks replaces it.
  const glow = t.dark ? `0 0 18px ${t.accent}99, 0 3px 18px rgba(0,0,0,.6)` : `0 0 16px ${t.accent}55, 0 2px 10px ${t.canvas}, 0 1px 3px rgba(0,0,0,.25)`;   // the last shadow: pink-on-pink (Strawberry, Kuromi) needs an edge
  return (
    <div style={{ position: 'absolute', left: align === 'left' ? R.x : 0, right: align === 'left' ? undefined : 0, top, display: 'flex', flexDirection: 'column', alignItems: align === 'left' ? 'flex-start' : 'center' }}>
      <div style={{ fontFamily: family(t), fontSize: size, fontWeight: 800, letterSpacing: '-0.02em', color: t.fg, textShadow: glow, lineHeight: 1.15, whiteSpace: 'nowrap',
        transform: `translateY(${interpolate(slide, [0, 1], [10, 0])}px)`, opacity: slide }}>
        {words.map((w, i) => (
          <span key={i} style={{ marginRight: i < words.length - 1 ? '0.26em' : 0, color: accentLast && i === words.length - 1 && words.length > 1 ? t.accent : undefined }}>{w}</span>
        ))}
      </div>
    </div>
  );
};
