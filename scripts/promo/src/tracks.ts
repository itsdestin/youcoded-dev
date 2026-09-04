// src/tracks.ts — the two things that run CONTINUOUSLY across the whole film,
// underneath and on top of the beats: which theme the backdrop and the host
// wear (ThemeCue) and where the host is and what it does (Cue). Beats declare
// theirs in LOCAL frames; Promo.tsx shifts them by the beat's start frame.
// WHY global tracks: a beat's own frame counter restarts at 0, so a host drawn
// per beat snaps to its new spot on every cut, and a backdrop drawn per beat
// flinches. One track each = the host can hop ACROSS a cut and the backdrop can
// wash from one theme to the next while the wipe is still running.
import type { Slug } from './themes';
import type { Pose } from './poses';
export type ThemeCue = { at: number; slug: Slug };
export type Cue = {
  at: number;
  x?: number; y?: number; size?: number;
  pose?: Pose;
  costume?: Slug;        // the rig/tint the host wears from this cue on (switches at the hop's apex when hopping)
  hop?: boolean;         // travel on an arc, land with a squash and a pop
  hidden?: boolean;      // not drawn (beat 4's flight — the bird IS the host)
  burst?: boolean;       // a ring flashes out from the host (costume changes)
};
export const shift = <T extends { at: number }>(cues: T[], by: number): T[] => cues.map((c) => ({ ...c, at: c.at + by }));
