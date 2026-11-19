// The brand guide (docs/brand/README.md) as values. WHY one file: every film, short and poster
// reads colour, type and spacing from here, so a brand change is one edit and nothing drifts.
import { loadFont as loadOutfit } from '@remotion/google-fonts/Outfit';
import { loadFont as loadDMSans } from '@remotion/google-fonts/DMSans';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { Easing } from 'remotion';

export const OUTFIT = loadOutfit('normal', { weights: ['400', '600'], subsets: ['latin'] }).fontFamily;
export const DMSANS = loadDMSans('normal', { weights: ['400', '500', '700', '900'], subsets: ['latin'] }).fontFamily;
export const MONO = loadMono('normal', { weights: ['500'], subsets: ['latin'] }).fontFamily;

export const C = {
  lavender: '#F7F0FB', lilac: '#EFE3F6', border: '#C9B0DB',
  plum: '#21152C', plum2: '#43354E', tagGrey: '#8A7B96',
  night: '#140B1E', nightPanel: '#1F1329', nightText: '#F3EAF9', nightText2: '#B3A8BC',
  purple: '#9750AA', purpleNight: '#C387D3',
  gradA: '#9D5BD0', gradB: '#D25AA0',
};
export const GRADIENT = `linear-gradient(100deg, ${C.gradA}, ${C.gradB})`;

export const FPS = 30;
export const BAR = 2.4;                       // one bar of the score at 100 BPM, in seconds
export const f = (seconds: number) => Math.round(seconds * FPS);

// Entrances land softly and exits leave quickly: the same two curves everywhere.
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const EASE_IN = Easing.bezier(0.5, 0, 0.75, 0);
