import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { THEMES, type Slug } from './themes';
import type { ThemeCue } from './tracks';
import { WINDOW } from './layout';

// One theme's field: the canvas colour, its wallpaper pre-blurred behind it
// (theme-assets.sh writes backdrop.jpg), a veil of the canvas colour so the
// window still reads as the brightest thing, and a slow accent glow.
const Field: React.FC<{ slug: Slug; drift: number }> = ({ slug, drift }) => {
  const t = THEMES[slug];
  return (
    <AbsoluteFill style={{ background: t.canvas }}>
      {t.wallpaper && <Img src={staticFile(`themes/${slug}/backdrop.jpg`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: t.dark ? 0.55 : 0.7 }} />}
      <AbsoluteFill style={{ background: t.canvas, opacity: t.dark ? 0.35 : 0.55 }} />
      <AbsoluteFill style={{ background: `radial-gradient(70% 85% at ${drift}% 40%, ${t.accent}${t.dark ? '33' : '22'} 0%, transparent 70%)` }} />
      {/* a touch of vignette keeps the corners quieter than the window */}
      <AbsoluteFill style={{ background: 'radial-gradient(120% 120% at 50% 45%, transparent 55%, rgba(0,0,0,.35) 100%)', opacity: t.dark ? 1 : 0.35 }} />
    </AbsoluteFill>
  );
};

export const WASH = 14;   // frames a theme change takes to sweep the backdrop
/**
 * The field behind everything. `themes` is the absolute-frame track; at each
 * change the new field sweeps out from the window's centre as an expanding
 * circle over WASH frames — the same moment the window's wipe or the app's
 * own theme paint happens, so the change reads as one event.
 */
export const Backdrop: React.FC<{ themes: ThemeCue[]; total: number }> = ({ themes: raw, total }) => {
  const f = useCurrentFrame();
  // Only CHANGES of theme count: two Midnight beats in a row must not wash
  // (draft 6 drew a hard-edged circle between beats 1 and 2 for exactly that).
  const themes = [...raw].sort((a, b) => a.at - b.at).filter((c, k, all) => k === 0 || c.slug !== all[k - 1].slug);
  let i = 0;
  for (let k = 0; k < themes.length; k++) if (f >= themes[k].at) i = k;
  const cur = themes[i];
  const prev = themes[i - 1];
  const drift = interpolate(f, [0, total], [30, 70], { extrapolateRight: 'clamp' });
  const p = interpolate(f - cur.at, [0, WASH], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  const r = interpolate(p, [0, 1], [0, 1500]);
  // A soft-edged circle (a radial mask, not a clip-path) so the sweep reads as
  // light spreading rather than a disc being stamped on.
  const mask = `radial-gradient(circle at ${WINDOW.cx}px ${WINDOW.cy}px, #000 ${Math.max(0, r - 160)}px, transparent ${r}px)`;
  return (
    <AbsoluteFill>
      {prev && p < 1 && <Field slug={prev.slug} drift={drift} />}
      <AbsoluteFill style={prev && p < 1 ? { maskImage: mask, WebkitMaskImage: mask } : undefined}>
        <Field slug={cur.slug} drift={drift} />
      </AbsoluteFill>
      {/* the wash's leading edge: a faint accent glow so the sweep is visible even between two dark themes */}
      {prev && p < 1 && <AbsoluteFill style={{ maskImage: `radial-gradient(circle at ${WINDOW.cx}px ${WINDOW.cy}px, transparent ${Math.max(0, r - 200)}px, #000 ${r - 40}px, transparent ${r + 60}px)`,
        WebkitMaskImage: `radial-gradient(circle at ${WINDOW.cx}px ${WINDOW.cy}px, transparent ${Math.max(0, r - 200)}px, #000 ${r - 40}px, transparent ${r + 60}px)`,
        background: THEMES[cur.slug].accent, opacity: 0.28 * (1 - p), mixBlendMode: 'screen' }} />}
    </AbsoluteFill>
  );
};
