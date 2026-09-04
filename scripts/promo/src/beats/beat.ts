// What every beat module exports. Frames are LOCAL to the beat's sequence
// (0 = the sequence start, which is PRE frames before the downbeat — or the
// prelude, for the first beat; use L(id, bar) for anything on the grid).
// Promo.tsx shifts the host actions and theme changes by the beat's start
// frame onto the global tracks and adds the arrival hop onto `home` in
// `slug`'s costume, landing on the beat's first downbeat.
import type React from 'react';
import type { Action } from '../host/engine';
import type { ThemeCue } from '../tracks';
import { bubbleWidth, type BubbleCue } from '../Bubble';
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
/** Local frame of an absolute bar inside beat `id`. Prefer `B` — a beat should not know where in the film it sits. */
export const L = (id: BeatId, bar: number) => localFrame(beatOf(id), bar, barFrame);
/** Local frame of the beat's OWN k-th bar (k may be fractional: 2.5 = the third beat of its third bar). Reordering the film never touches a beat that uses this. */
export const B = (id: BeatId, k: number) => localFrame(beatOf(id), beatOf(id).bars[0] + k, barFrame);
/** The beat's full length in frames (what its shots must cover). */
export const LEN = (id: BeatId) => beatFrames(beatOf(id), barFrame);
export const isLight = (slug: Slug) => !['midnight', 'halftone-dimension', 'devils-garden', 'golden-sunbreak'].includes(slug);

// ---- the presenter (Destin, 2026-09-04: "each animation should be obviously tied to
// something in the demo or in his speech. he shouldn't be a distraction"; "move the
// mascot over the window to point out different features"; and, on the draft: "he should
// be better positioned so he actually gestures at the elements he should be gesturing at").
//
// A beat is a list of LINES. Each names the THING it is about — a TARGET, a point inside
// the window — and `present()` works out the rest: where to stand (beside the target, a
// hand's reach away, on the side the author picks), which arm to raise and at what angle
// (engine `aim`: the true angle from the shoulder to the target), where the eyes look, and
// which side the speech bubble goes (away from the target, so it never covers what is being
// pointed at). The host moves ONLY when the next target needs a different stand — a line
// about something nearby is said from where it is. Nothing else moves unless a beat adds a
// reaction with a visible cause (a twirl on a theme flip, the dive into Flappy).
//
// TIMING IS ENFORCED, NOT NUDGED. Every bubble must be readable — Destin's rule: at least
// 1.2 s plus a quarter second a word — and the old presenter met it by silently pushing
// the line later, which is how "Ooh. Golden hour." ended up over Strawberry Kitty and three
// lines were pushed clean out of their beats and never shown. Now a line that does not fit
// its slot THROWS at bundle time and names the line, the slot and the shortfall, so the
// script is written to the footage and not the other way round.
import { A } from '../host/engine';
import type { Face } from '../poses';
import { windowRect, MASCOT, FRAME } from '../layout';
export type Spot = { x: number; y: number };                    // the host's box: top-left
export type Target = { x: number; y: number };                  // a point on screen
export type Stand = 'L' | 'R' | 'above' | 'bar';                // where the host stands relative to its target
export type Line = {
  at: number;                       // local frame the line starts (the gesture lands here)
  say?: string;                     // the bubble; none = a silent move/gesture
  target?: Target;                  // what the line is about — the host stands beside it and points at it
  stand?: Stand;                    // which side of the target to stand on (default: the side with more room)
  stay?: boolean;                   // aim at the target from where it already stands (no new stand, no hop)
  spot?: Spot;                      // an explicit place to stand (overrides target-derived stands)
  face?: Face;
  until?: number;                   // bubble end; default: 8 frames before the next line
  side?: 'L' | 'R';                 // force the bubble's side (default: away from the target)
};
/** A point INSIDE the window at (fx, fy) of its width/height. */
export const inWindow = (fx: number, fy: number): Target => {
  const r = windowRect();
  return { x: r.x + r.w * fx, y: r.y + r.h * fy };
};
/** The old spot helper: a box whose FEET are at (fx, fy) of the window. Kept for the beats' extras (the dive). */
export const feetAt = (fx: number, fy: number): Spot => {
  const r = windowRect();
  return { x: r.x + r.w * fx - MASCOT.size / 2, y: r.y + r.h * fy - MASCOT.size * 0.86 };
};
const SIZE = MASCOT.size;
const ARM = { L: { x: 0.183, y: 0.467 }, R: { x: 0.817, y: 0.467 } };   // shoulder pivots, box fractions
const REACH = 58;                                                     // px from the shoulder to the target: the arm (16 px) plus a visible gap
/**
 * Where to stand for a target. 'L' = left of it, pointing right with the right arm; 'R' = right of it,
 * pointing left; 'above' = over it, pointing down (offset left so the body does not sit on it);
 * 'bar' = on the title bar at the target's x. The box is kept inside the frame and off the caption band.
 */
export function standFor(target: Target, stand: Stand): Spot {
  const r = windowRect();
  let x: number, y: number;
  if (stand === 'bar') { x = target.x - SIZE * 0.62; y = r.y - SIZE + MASCOT.feetIn; }
  else if (stand === 'L') { x = target.x - REACH - ARM.R.x * SIZE; y = target.y - ARM.R.y * SIZE; }
  else if (stand === 'R') { x = target.x + REACH - ARM.L.x * SIZE; y = target.y - ARM.L.y * SIZE; }
  else { x = target.x - REACH * 0.6 - ARM.R.x * SIZE; y = target.y - REACH - ARM.R.y * SIZE; }
  x = Math.max(8, Math.min(FRAME.w - SIZE - 8, x));
  const feetMax = r.y + r.h - 10;                                     // never below the window's bottom edge (the caption band is under it)
  y = Math.max(0, Math.min(feetMax - SIZE * 0.86, y));
  return { x: Math.round(x), y: Math.round(y) };
}
const HOP = 22;                                       // frames a presenter hop takes; lands at 78 %
const ARRIVED = 24 + HOP;                             // the first frame a hop may land after the arrival move
/** Destin's rule: 1.2 s plus a quarter second a word. */
export const readOf = (t: string) => 36 + 8 * t.split(' ').length;
export type Presented = { host: Action[]; bubbles: BubbleCue[]; home: Spot; where: (f: number) => Spot };
/**
 * `home` is where the arrival move lands. If the first line starts before a hop could land
 * (frame 46), the host simply arrives at that line's stand instead — one move, not two.
 * `cap`: the last frame any bubble may stay (the beat's LEN − 8: the wipe takes the last 10).
 */
export function present(id: BeatId, lines: Line[], slug: Slug, home: Spot, cap = Infinity): Presented {
  const host: Action[] = [];
  const bubbles: BubbleCue[] = [];
  const stands: { at: number; spot: Spot }[] = [];
  const standOf = (l: Line): Spot | undefined => {
    if (l.spot) return l.spot;
    if (!l.target || l.stay) return undefined;
    return standFor(l.target, l.stand ?? (l.target.x < FRAME.w / 2 ? 'R' : 'L'));
  };
  const first = lines[0];
  const firstStand = first ? standOf(first) : undefined;
  if (first && firstStand && first.at < ARRIVED) home = firstStand;   // arrive straight at the first line's stand
  let here = home;
  stands.push({ at: -Infinity, spot: home });
  lines.forEach((l, i) => {
    const next = lines[i + 1];
    const label = `${id} line ${i + 1}${l.say ? ` "${l.say}"` : ''}`;
    const stand = standOf(l);
    if (stand && Math.hypot(stand.x - here.x, stand.y - here.y) > 40) {
      if (l.at < ARRIVED) throw new Error(`${label} starts at frame ${l.at}, before a hop could land (${ARRIVED}); start it later or let it be the beat's first line`);
      const dist = Math.hypot(stand.x - here.x, stand.y - here.y);
      // a low quick arc inside the window; higher only for a long crossing (the tall arcs read as "jumping around" in the draft)
      host.push(A.rest(l.at - HOP - 4, 4), A.hop(l.at - HOP + 5, HOP, stand.x, stand.y, Math.min(60, 24 + dist * 0.08)));
      here = stand; stands.push({ at: l.at - HOP + 5, spot: stand });
    }
    if (l.face) host.push(A.face(l.at, l.face));
    if (l.target) host.push(A.aim(l.at, l.target.x, l.target.y));
    else if (l.spot) host.push(A.rest(l.at));
    if (l.say) {
      const read = readOf(l.say);
      const until = Math.min(cap, l.until ?? (next ? next.at - 8 : l.at + 90));
      if (until - l.at < read) throw new Error(`${label} has ${until - l.at} frames (${l.at}→${until}) but needs ${read} to be read: shorten it, start it earlier, or move the next line`);
      if (next && next.at < until) throw new Error(`${label} runs to ${until} but the next line starts at ${next.at}`);
      // the bubble's side: away from the target, so it never covers what is being pointed at
      // …unless it would not fit on that side (Bubble.tsx's own estimate) — then Bubble picks the side
      const est = bubbleWidth(l.say) + 18 + 40;
      const away = l.target ? (l.target.x >= here.x + SIZE / 2 ? 'L' : 'R') : undefined;
      // the bubble wraps to the room it has, so 'away' only needs ~300 px of room on that side
      const fits = away === 'R' ? here.x + SIZE * 0.82 + Math.min(est, 320) < 1900 : away === 'L' ? here.x + SIZE * 0.18 - Math.min(est, 320) > 20 : true;
      const side = l.side ?? (fits ? away : undefined);
      bubbles.push({ at: l.at + 2, until, text: l.say, slug, side });
      if (l.target) host.push(A.rest(until + 2));
    } else if (l.target && next) host.push(A.rest(next.at - 10));
  });
  const where = (f: number) => [...stands].reverse().find((s) => s.at <= f)!.spot;
  return { host, bubbles, home, where };
}
