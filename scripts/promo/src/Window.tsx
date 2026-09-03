import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { CLIP, WINDOW, MAX_PUSH_IN, windowRect } from './layout';
/**
 * The app window: a shadowed rounded panel holding one clip.
 *
 * WHY it scales from 'center top' and not its centre: the host mascot perches
 * on the window's TOP edge, whose y comes from windowRect(). If the push-in
 * grew the window around its centre the top edge would creep upward and the
 * host's feet would float off the title bar. Anchoring the top edge keeps the
 * perch exact and spends all the growth downward — which is why layout.ts
 * budgets 26 px of clear space above the caption band.
 *
 * `scale` overrides the layout scale (beat 8's smaller window); `pushIn` grows
 * it by that fraction over the first 8 s; `dy` offsets it (beat 1's rise).
 */
export const Window: React.FC<{ scale?: number; pushIn?: number; dy?: number; opacity?: number; children: React.ReactNode }> =
  ({ scale = WINDOW.scale, pushIn = 0, dy = 0, opacity = 1, children }) => {
  const f = useCurrentFrame();
  if (pushIn > MAX_PUSH_IN) throw new Error(`pushIn ${pushIn} exceeds MAX_PUSH_IN ${MAX_PUSH_IN} — the window would grow into the caption band`);
  const s = scale * (1 + interpolate(f, [0, 240], [0, pushIn], { extrapolateRight: 'clamp' }));
  const top = windowRect(scale).y + dy;
  return (
    <div style={{ position: 'absolute', left: WINDOW.cx, top, width: CLIP.w, height: CLIP.h, opacity,
      transform: `translateX(-50%) scale(${s})`, transformOrigin: 'center top',
      borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06)' }}>
      {children}
    </div>
  );
};
