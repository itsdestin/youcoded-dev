// What every beat module exports. Frames are LOCAL to the beat's sequence
// (0 = the sequence start, which is PRE frames before the downbeat for every
// beat but the first — use L(bar) for anything on the grid). Promo.tsx shifts
// the cues and themes by the beat's start frame onto the global tracks and
// adds the arrival hop onto `home` in `slug`'s costume.
import type React from 'react';
import type { Cue, ThemeCue } from '../tracks';
import type { Slug } from '../themes';
import { BEATS, localFrame, beatFrames, type BeatId } from '../timeline';
import { barFrame } from '../grid';
export type BeatModule = {
  id: BeatId; slug: Slug; home: { x: number; y: number };
  Component: React.FC; cues: Cue[]; themes?: ThemeCue[];
  arrival?: 'hop' | 'none';       // 'none' when the beat stages its own entrance (beat 1)
};
export const beatOf = (id: BeatId) => BEATS.find((b) => b.id === id)!;
/** Local frame of an absolute bar inside beat `id`. */
export const L = (id: BeatId, bar: number) => localFrame(beatOf(id), bar, barFrame);
/** The beat's full length in frames (what its shots must cover). */
export const LEN = (id: BeatId) => beatFrames(beatOf(id), barFrame);
export const isLight = (slug: Slug) => !['midnight', 'halftone-dimension', 'devils-garden', 'golden-sunbreak'].includes(slug);
