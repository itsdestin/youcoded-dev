import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadComfortaa } from '@remotion/google-fonts/Comfortaa';
import { loadFont as loadNunito } from '@remotion/google-fonts/Nunito';
import { loadFont as loadSpaceGrotesk } from '@remotion/google-fonts/SpaceGrotesk';
import { CAPTION } from './layout';
import { THEMES, type Slug, type Theme } from './themes';
// Fonts are fetched at bundle/render time. Each caption is set in its theme's
// own display face (the manifest's font family) so the words change character
// with the look — Inter for the neutral themes, Comfortaa for the cute ones,
// Nunito for Meadow Mist, Space Grotesk for Devil's Garden.
const FONTS: Record<Theme['font'], string> = {
  Inter: loadInter().fontFamily,
  Comfortaa: loadComfortaa().fontFamily,
  Nunito: loadNunito().fontFamily,
  'Space Grotesk': loadSpaceGrotesk().fontFamily,
};
export const family = (t: Theme) => `${FONTS[t.font]}, ${FONTS.Inter}, system-ui, sans-serif`;

type Props = { head: string; sub?: string; at: number; subAt?: number; theme: Slug; top?: number; size?: number; headColor?: string; still?: boolean };
/**
 * The caption band: a headline whose words pop in one after another on the
 * beat, its LAST word in the theme accent (the payoff word — "start", "works",
 * "phone"; a centred rule used to underline whichever word happened to sit in
 * the middle), and a quieter sub-line. Colours come from the theme: the
 * headline is the theme's foreground (dark on the light themes, so it reads on
 * a pale backdrop). `subAt` delays the sub-line; `still` draws the headline
 * already settled (a caption that only changes its sub-line must not re-pop).
 */
export const Caption: React.FC<Props> = ({ head, sub, at, subAt, theme, top = CAPTION.top, size = CAPTION.size, headColor, still = false }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  if (f < at) return null;
  const t = THEMES[theme];
  const words = head.split(' ');
  const shadow = t.dark ? '0 4px 24px rgba(0,0,0,.6)' : `0 2px 14px ${t.canvas}`;
  const subS = spring({ frame: f - (subAt ?? at + 10), fps, config: { damping: 15, stiffness: 110 } });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top, height: CAPTION.h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 8 }}>
      <div style={{ fontFamily: family(t), fontSize: size, fontWeight: 700, letterSpacing: '-0.02em', color: headColor ?? t.fg, textShadow: shadow, lineHeight: 1.1, whiteSpace: 'nowrap' }}>
        {words.map((w, i) => {
          const s = still ? 1 : spring({ frame: f - at - i * 2, fps, config: { damping: 13, stiffness: 150 } });
          const last = i === words.length - 1 && words.length > 1 && !headColor;
          return (
            <span key={i} style={{ display: 'inline-block', marginRight: i < words.length - 1 ? '0.28em' : 0, opacity: s, color: last ? t.accent : undefined,
              transform: `translateY(${interpolate(s, [0, 1], [26, 0])}px) scale(${interpolate(s, [0, 1], [0.92, 1])})` }}>{w}</span>
          );
        })}
      </div>
      {sub && f >= (subAt ?? at) && (
        <div style={{ fontFamily: family(t), fontSize: CAPTION.sub, fontWeight: 500, color: t.fg, opacity: subS * 0.9, textShadow: shadow, whiteSpace: 'nowrap',
          transform: `translateY(${interpolate(subS, [0, 1], [10, 0])}px)` }}>{sub}</div>
      )}
    </div>
  );
};
