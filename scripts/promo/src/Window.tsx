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
 * `light` is for the light-theme beats: on a pale backdrop a white edge ring
 * vanishes and the window needs a darker, tighter shadow to sit on the page.
 *
 * WHY the push-in zooms the CONTENT and not the panel (2026-09-09): scaling the
 * panel itself by a value that creeps up every frame re-rasterised its 1 px ring,
 * its rounded clip and its shadow at a new sub-pixel size each frame — a shimmer
 * along the window's edges that Destin saw as "a weird shadow/flicker around the
 * outer edges" of the fourth draft. Now the panel, ring and shadow sit still and
 * the footage inside grows by `pushIn` (at most 3 %, cropping ~1.5 % a side).
 */
export const Window: React.FC<{ scale?: number; pushIn?: number; dy?: number; opacity?: number; light?: boolean; children: React.ReactNode }> =
  ({ scale = WINDOW.scale, pushIn = 0, dy = 0, opacity = 1, light = false, children }) => {
  const f = useCurrentFrame();
  if (pushIn > MAX_PUSH_IN) throw new Error(`pushIn ${pushIn} exceeds MAX_PUSH_IN ${MAX_PUSH_IN} — the window would grow into the caption band`);
  const zoom = 1 + interpolate(f, [0, 240], [0, pushIn], { extrapolateRight: 'clamp' });
  const top = windowRect(scale).y + dy;
  const shadow = light
    ? '0 24px 60px rgba(30,10,40,.30), 0 4px 14px rgba(30,10,40,.18), 0 0 0 1px rgba(0,0,0,.14)'
    : '0 24px 64px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.2)';
  return (
    <div style={{ position: 'absolute', left: WINDOW.cx, top, width: CLIP.w, height: CLIP.h, opacity,
      transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'center top',
      borderRadius: 16, overflow: 'hidden', boxShadow: shadow }}>
      <div style={{ width: CLIP.w, height: CLIP.h, transform: `scale(${zoom.toFixed(5)})`, transformOrigin: 'center top' }}>
        {children}
      </div>
    </div>
  );
};
