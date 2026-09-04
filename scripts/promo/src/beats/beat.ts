// What every beat module exports. Frames are LOCAL to the beat's sequence
// (0 = the sequence start, which is PRE frames before the downbeat — or the
// prelude, for the first beat; use L(id, bar) for anything on the grid).
// Promo.tsx shifts the host actions and theme changes by the beat's start
// frame onto the global tracks and adds the arrival hop onto `home` in
// `slug`'s costume, landing on the beat's first downbeat.
import type React from 'react';
import type { Action } from '../host/engine';
import type { ThemeCue } from '../tracks';
import type { BubbleCue } from '../Bubble';
import type { Slug } from '../themes';
import { BEATS, localFrame, beatFrames, type BeatId } from '../timeline';
import { barFrame } from '../grid';
export type BeatModule = {
  id: BeatId; slug: Slug; home: { x: number; y: number };
  Component: React.FC; host: Action[]; themes?: ThemeCue[];
  bubbles?: BubbleCue[];          // what the host SAYS (the caption's second line), local frames
  arrival?: 'move' | 'none';      // 'none' when the beat stages its own entrance (beat 1)
};
export const beatOf = (id: BeatId) => BEATS.find((b) => b.id === id)!;
/** Local frame of an absolute bar inside beat `id`. */
export const L = (id: BeatId, bar: number) => localFrame(beatOf(id), bar, barFrame);
/** The beat's full length in frames (what its shots must cover). */
export const LEN = (id: BeatId) => beatFrames(beatOf(id), barFrame);
export const isLight = (slug: Slug) => !['midnight', 'halftone-dimension', 'devils-garden', 'golden-sunbreak'].includes(slug);

// ---- the presenter (Destin, 2026-09-04: "each animation should be obviously tied to
// something in the demo or in his speech. he shouldn't be a distraction"; "move the
// mascot over the window to point out different features"). A beat is a list of LINES:
// each has a frame, a spot to stand (on the title bar or anywhere over the window),
// a gesture, and what the host says. `present()` turns that into the host's actions
// and its bubbles with ONE rule: hop to the spot just before the line, point while
// the bubble is up, hold still otherwise. Nothing else moves unless a beat adds a
// reaction with a visible cause (a twirl on a theme flip, the dive into Flappy).
import { A } from '../host/engine';
import type { Face } from '../poses';
import { windowRect, MASCOT } from '../layout';
export type Spot = { x: number; y: number };
export type Line = {
  at: number;                       // local frame the line starts (the gesture lands here)
  say?: string;                     // the bubble; none = a silent move/gesture
  spot?: Spot;                      // where to stand; omitted = stay
  point?: 'L' | 'R' | 'down' | 'none';   // the gesture while the line is up
  face?: Face;
  until?: number;                   // bubble end; default: 8 frames before the next line
  side?: 'L' | 'R';                 // force the bubble's side
};
/** A spot INSIDE the window: feet at (fx, fy) of the window's width/height. */
export const inWindow = (fx: number, fy: number): Spot => {
  const r = windowRect();
  return { x: r.x + r.w * fx - MASCOT.size / 2, y: r.y + r.h * fy - MASCOT.size * 0.86 };
};
const HOP = 22;                                       // frames a presenter hop takes; lands at 78 %
export function present(lines: Line[], slug: import('../themes').Slug, home: Spot): { host: Action[]; bubbles: BubbleCue[] } {
  const host: Action[] = [];
  const bubbles: BubbleCue[] = [];
  let here = home;
  lines.forEach((l, i) => {
    const next = lines[i + 1];
    if (l.spot && (l.spot.x !== here.x || l.spot.y !== here.y)) {
      const dist = Math.hypot(l.spot.x - here.x, l.spot.y - here.y);
      host.push(A.rest(l.at - HOP - 4, 4), A.hop(l.at - HOP + 5, HOP, l.spot.x, l.spot.y, Math.min(70, 30 + dist * 0.12)));
      here = l.spot;
    }
    if (l.face) host.push(A.face(l.at, l.face));
    if (l.point === 'L') host.push(A.point(l.at, 'L', 0.55));
    else if (l.point === 'R') host.push(A.point(l.at, 'R', 0.55));
    else if (l.point === 'down') host.push(A.point(l.at, 'R', 1));
    if (l.say) {
      // never shorter than its reading time: 0.8 s plus a quarter second a word (bubbles went
      // by too fast to read in the draft — Destin, 2026-09-04); the next line simply takes over
      const read = 24 + 7 * l.say.split(' ').length;
      const until = Math.max(l.at + read, l.until ?? (next ? next.at - 8 : l.at + 90));
      bubbles.push({ at: l.at + 2, until, text: l.say, slug, side: l.side });
      if (l.point && l.point !== 'none') host.push(A.rest(until + 2));
    } else if (l.point && l.point !== 'none' && next) host.push(A.rest(next.at - 10));
  });
  return { host, bubbles };
}
