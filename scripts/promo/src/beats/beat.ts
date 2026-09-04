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
/** `cap`: the last frame any bubble may stay (the beat's LEN − 12: the wipe takes the last 10). */
export function present(lines: Line[], slug: import('../themes').Slug, home: Spot, cap = Infinity): { host: Action[]; bubbles: BubbleCue[] } {
  const host: Action[] = [];
  const bubbles: BubbleCue[] = [];
  let here = home;
  let earliest = 0;                                   // the next line may not start before this (the previous line's reading time)
  const readOf = (t: string) => 36 + 8 * t.split(' ').length;   // 1.2 s plus ~0.27 s a word
  lines.forEach((raw, i) => {
    // a first line with a spot cannot hop before the arrival move has landed (~frame 24): a hop
    // scheduled before frame 0 was simply lost and the host stayed on the bar (draft review)
    const l0 = i === 0 && raw.spot ? { ...raw, at: Math.max(raw.at, 24 + HOP) } : raw;
    // a line that would cut the previous one short waits for it (reading beats sync — Destin, 2026-09-04)
    const l = l0.say || l0.spot ? { ...l0, at: Math.max(l0.at, earliest) } : l0;
    const next0 = lines[i + 1];
    const next = next0 && l.say ? { ...next0, at: Math.max(next0.at, l.at + readOf(l.say) + 4) } : next0;
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
      const read = readOf(l.say);
      const until = Math.min(cap, Math.max(l.at + read, l.until ?? (next ? next.at - 8 : l.at + 90)));
      earliest = l.at + read + 4;
      bubbles.push({ at: l.at + 2, until, text: l.say, slug, side: l.side });
      if (l.point && l.point !== 'none') host.push(A.rest(until + 2));
    } else if (l.point && l.point !== 'none' && next) host.push(A.rest(next.at - 10));
  });
  return { host, bubbles };
}
