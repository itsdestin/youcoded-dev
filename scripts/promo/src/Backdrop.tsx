import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
// The colours behind the window. `switchAt` is beat 7's theme flip: the
// backdrop turns gold on the SAME frame the app in the footage does, so the
// change reads as one event rather than two.
export const THEMES = {
  midnight: { canvas: '#0D1117', glow: '#1f2a3a', accent: '#B1BAC4', onAccent: '#0D1117' },
  golden:   { canvas: '#08080e', glow: '#3a2410', accent: '#ffc030', onAccent: '#000000' },
};
export const Backdrop: React.FC<{ theme: keyof typeof THEMES; switchAt?: number }> = ({ theme, switchAt }) => {
  const f = useCurrentFrame();
  const t = THEMES[switchAt != null && f >= switchAt ? 'golden' : theme];
  const x = interpolate(f, [0, 900], [30, 70], { extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ background: `radial-gradient(60% 80% at ${x}% 40%, ${t.glow} 0%, ${t.canvas} 70%)` }} />;
};
