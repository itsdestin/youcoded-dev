import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { CAPTION } from './layout';
// Inter is fetched at bundle/render time by @remotion/google-fonts. If the
// render host ever loses network this falls back to the system stack rather
// than rendering blank text.
const { fontFamily } = loadFont();
export const Caption: React.FC<{ text: string; at: number; top?: number; size?: number; color?: string }> = ({ text, at, top = CAPTION.top, size = CAPTION.size, color = '#fff' }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  if (f < at) return null;
  const s = spring({ frame: f - at, fps, config: { damping: 14, stiffness: 120 } });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top, height: CAPTION.h, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: `${fontFamily}, system-ui, sans-serif`, fontSize: size, fontWeight: 700, letterSpacing: '-0.02em', color, textShadow: '0 4px 24px rgba(0,0,0,.6)',
      opacity: s, transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)` }}>
      {text}
    </div>
  );
};
