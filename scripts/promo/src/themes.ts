// src/themes.ts — the one place the overlays learn about a theme: the colours
// behind the window and in the captions, the wallpaper (if any) blurred behind
// the window, the mascot costume and its companions, and the caption font.
// Values are copied from each theme's manifest tokens (wecoded-themes registry,
// 2026-09-03; Midnight from the app's builtin/midnight.json) — the app's own
// footage paints itself, so these only have to match well enough to read as
// "the same theme" outside the window.
import { RIGS, COMPANIONS, type Companion } from './theme-art.generated';
import { DEFAULT_BUDDY_RIG } from './rig';

export type Slug = 'midnight' | 'meadow-mist' | 'halftone-dimension' | 'kuromi-dreamer' | 'devils-garden' | 'golden-sunbreak' | 'strawberry-kitty' | 'cotton-candy-sky';
export type Theme = {
  slug: Slug; name: string; dark: boolean;
  canvas: string; accent: string; onAccent: string; fg: string;
  wallpaper?: string;                 // staticFile path under public/
  gradient?: string;                  // a CSS gradient for themes with no wallpaper (Halftone)
  font: 'Inter' | 'Comfortaa' | 'Nunito' | 'Space Grotesk';
};
const T = (t: Theme) => t;
export const THEMES: Record<Slug, Theme> = {
  midnight:             T({ slug: 'midnight', name: 'Midnight', dark: true, canvas: '#0D1117', accent: '#B1BAC4', onAccent: '#0D1117', fg: '#C9D1D9', font: 'Inter' }),
  'meadow-mist':        T({ slug: 'meadow-mist', name: 'Meadow Mist', dark: false, canvas: '#F6FAF5', accent: '#2F7D55', onAccent: '#FFFFFF', fg: '#041008', wallpaper: 'themes/meadow-mist/wallpaper.jpg', font: 'Nunito' }),
  'halftone-dimension': T({ slug: 'halftone-dimension', name: 'Halftone Dimension', dark: true, canvas: '#08060e', accent: '#E51F48', onAccent: '#ffffff', fg: '#F0E8F8', font: 'Inter',
    gradient: 'linear-gradient(135deg, #18102e 0%, #2a1650 30%, #341454 55%, rgba(232,35,74,0.35) 75%, rgba(0,184,255,0.25) 90%, #18102e 100%)' }),
  'kuromi-dreamer':     T({ slug: 'kuromi-dreamer', name: 'Kuromi Dreamer', dark: false, canvas: '#C9B8E0', accent: '#8158ad', onAccent: '#FFFFFF', fg: '#190E27', wallpaper: 'themes/kuromi-dreamer/wallpaper.webp', font: 'Comfortaa' }),
  'devils-garden':      T({ slug: 'devils-garden', name: "Devil's Garden", dark: true, canvas: '#140810', accent: '#FFC627', onAccent: '#140810', fg: '#FBE9C9', wallpaper: 'themes/devils-garden/wallpaper.jpg', font: 'Space Grotesk' }),
  'golden-sunbreak':    T({ slug: 'golden-sunbreak', name: 'Golden Sunbreak', dark: true, canvas: '#08080e', accent: '#ffc030', onAccent: '#000000', fg: '#F8E8C8', wallpaper: 'themes/golden-sunbreak/wallpaper.jpg', font: 'Inter' }),
  'strawberry-kitty':   T({ slug: 'strawberry-kitty', name: 'Strawberry Kitty', dark: false, canvas: '#F8D7DE', accent: '#CC4060', onAccent: '#FFFFFF', fg: '#3A1420', wallpaper: 'themes/strawberry-kitty/wallpaper.png', font: 'Comfortaa' }),
  'cotton-candy-sky':   T({ slug: 'cotton-candy-sky', name: 'Cotton Candy Sky', dark: false, canvas: '#FBF5FC', accent: '#8B47B8', onAccent: '#FFFFFF', fg: '#21152C', wallpaper: 'themes/cotton-candy-sky/wallpaper.jpg', font: 'Comfortaa' }),
};
/** The rig a theme dresses the host in: its own if it ships one, else the app's default rig tinted with the theme accent. */
export const rigFor = (slug: Slug): string => RIGS[slug] ?? DEFAULT_BUDDY_RIG;
export const companionsFor = (slug: Slug): Companion[] => COMPANIONS[slug] ?? [];
