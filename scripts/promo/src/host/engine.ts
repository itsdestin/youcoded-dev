// src/host/engine.ts — the host's motion, as a list of timed ACTIONS evaluated
// cumulatively per frame. WHY not the cue+spring list of round two: a spring
// between two poses is what a cheap game does — no build-up, no weight, the
// body never leans or stretches. Here every move is authored: an action owns
// its window of frames and shapes the state over it (a crouch before a hop,
// the lean in the air, the two-bounce settle, a blink before a look), and the
// state carries everything the renderer draws — position, lean, squash, limbs,
// face, where the eyes look, how hard the contact shadow sits.
import type { Slug } from '../themes';
import type { Face } from '../poses';

export type HostState = {
  x: number; y: number;           // top-left of the host's box
  size: number;                   // box side in px
  rot: number;                    // lean, degrees, about the feet
  sx: number; sy: number;         // squash & stretch about the feet
  armL: number; armR: number;     // degrees, hanging = 0, positive = clockwise
  legL: number; legR: number;
  face: Face; blink: number;      // blink 0..1 (1 = closed)
  lookX: number; lookY: number;   // pupil offset, viewBox units (±0.6)
  shadow: number;                 // 0..1 how much of the contact shadow is drawn
  air: number;                    // 0..1 how far off the ground (shrinks the shadow)
  costume: Slug; hidden: boolean; alpha: number;
  poof: number | null;            // frame a costume poof started, or null
};
export const REST: HostState = { x: 0, y: 0, size: 120, rot: 0, sx: 1, sy: 1, armL: 0, armR: 0, legL: 0, legR: 0, face: 'welcome', blink: 0,
  lookX: 0, lookY: 0, shadow: 1, air: 0, costume: 'midnight', hidden: false, alpha: 1, poof: null };

export type Action = { at: number; dur: number; run: (t: number, s: HostState, start: HostState, f: number) => void; name?: string };
/** Progress 0..1 of an action at frame f, clamped. */
const prog = (a: Action, f: number) => (a.dur <= 0 ? (f >= a.at ? 1 : 0) : Math.min(1, Math.max(0, (f - a.at) / a.dur)));

// ---- easing (t in 0..1) ----
export const E = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  outBack: (t: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  // a damped bounce that settles: 1 + e^-6t · cos(…)
  settle: (t: number) => 1 - Math.exp(-6 * t) * Math.cos(t * Math.PI * 3.2),
  // a rise-and-return hump: 0 → 1 → 0
  hump: (t: number) => Math.sin(Math.PI * t),
};
const L = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Evaluate the host on frame f: start from `base`, apply every action whose
 * window has started, in order, each fed the state as it stood when the action
 * began (so "move from wherever you are" needs no bookkeeping).
 */
export function evaluate(actions: Action[], base: HostState, f: number): HostState {
  const s: HostState = { ...base };
  const sorted = [...actions].sort((a, b) => a.at - b.at);
  const starts = new Map<Action, HostState>();
  for (const a of sorted) {
    if (f < a.at) break;
    if (!starts.has(a)) starts.set(a, { ...s });
    a.run(prog(a, f), s, starts.get(a)!, f);
  }
  return s;
}
/** Same, but start states are computed from the true entry frame (correct when actions overlap). */
export function evaluateExact(actions: Action[], base: HostState, f: number): HostState {
  const sorted = [...actions].sort((a, b) => a.at - b.at);
  const startAt = (i: number): HostState => {
    // state on the frame this action begins, before it runs
    const s: HostState = { ...base };
    for (let k = 0; k < i; k++) { const a = sorted[k]; if (sorted[i].at < a.at) break; a.run(prog(a, sorted[i].at), s, startAt(k), sorted[i].at); }
    return s;
  };
  const s: HostState = { ...base };
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (f < a.at) break;
    a.run(prog(a, f), s, startAt(i), f);
  }
  return s;
}

// ---- the action library ----
export const A = {
  /** Set fields outright at `at`. */
  set: (at: number, patch: Partial<HostState>): Action => ({ at, dur: 0, name: 'set', run: (_t, s) => Object.assign(s, patch) }),
  /** Ease a numeric field from wherever it is to `to` over dur frames. */
  to: (at: number, dur: number, field: keyof HostState, to: number, ease = E.inOutQuad): Action =>
    ({ at, dur, name: `to:${field}`, run: (t, s, start) => { (s as any)[field] = L((start as any)[field] as number, to, ease(t)); } }),
  /** Move the box to x,y on the ground (a slide, not a hop). */
  moveTo: (at: number, dur: number, x: number, y: number, ease = E.inOutQuad): Action =>
    ({ at, dur, name: 'moveTo', run: (t, s, start) => { s.x = L(start.x, x, ease(t)); s.y = L(start.y, y, ease(t)); } }),
  /**
   * A cautious walk to x: legs alternate, the body bobs and leans forward a
   * touch, the arms swing opposite the legs. `steps` sets the cadence.
   */
  walk: (at: number, dur: number, x: number, steps = 6): Action => ({ at, dur, name: 'walk', run: (t, s, start) => {
    const e = E.inOutQuad(t);
    s.x = L(start.x, x, e);
    const ph = t * steps * Math.PI * 2;               // one full cycle per step
    const gait = Math.sin(ph) * E.hump(t);            // fades in and out at the ends
    const dir = Math.sign(x - start.x) || 1;
    s.legL = 28 * gait; s.legR = -28 * gait;
    s.armL = -18 * gait; s.armR = 18 * gait;
    s.y = start.y - Math.abs(Math.sin(ph)) * 4 * E.hump(t);   // a small bob on each step
    s.rot = dir * 5 * E.hump(t);                       // leans into the walk
    s.sy = 1 - Math.abs(Math.sin(ph)) * 0.02; s.sx = 1 + Math.abs(Math.sin(ph)) * 0.02;
  } }),
  /**
   * A hop to x,y: crouch (anticipation), stretch on the way up, lean into the
   * travel, tuck at the top, stretch on the way down, squash on landing that
   * settles in two bounces. `height` is the arc above the straight line.
   */
  hop: (at: number, dur: number, x: number, y: number, height = 90): Action => ({ at, dur, name: 'hop', run: (t, s, start) => {
    const ANT = 0.18, LAND = 0.78;                    // fractions of dur: crouch, then flight, then settle
    const dx = x - start.x, dir = Math.sign(dx) || 0;
    // never above the top of the frame: the apex stays within 30 px of it
    height = Math.min(height, Math.max(30, Math.min(start.y, y) + 30));
    if (t < ANT) {                                    // crouch: sink and widen, arms back
      const k = E.inOutQuad(t / ANT);
      s.sy = L(1, 0.84, k); s.sx = L(1, 1.10, k); s.armL = L(start.armL, 35, k); s.armR = L(start.armR, -35, k);
      s.rot = L(start.rot, -dir * 6, k); s.shadow = 1; s.air = 0;
    } else if (t < LAND) {                            // flight
      const k = (t - ANT) / (LAND - ANT);
      const arc = 4 * height * k * (1 - k);
      s.x = L(start.x, x, E.inOutQuad(k)); s.y = L(start.y, y, k) - arc;
      s.air = Math.min(1, arc / 60);
      const up = k < 0.5;
      s.sy = up ? L(1.14, 1.0, k * 2) : L(1.0, 1.12, (k - 0.5) * 2);   // stretch up, stretch into the landing
      s.sx = 2 - s.sy;
      s.rot = dir * L(10, -6, k);                                        // leans forward, then back to land
      const tuck = E.hump(k);
      s.legL = -30 * tuck; s.legR = 30 * tuck; s.armL = L(35, -20, k) * (1 - tuck * 0.3); s.armR = L(-35, 20, k) * (1 - tuck * 0.3);
      s.shadow = 1 - 0.55 * s.air;
    } else {                                          // landing settle
      const k = (t - LAND) / (1 - LAND);
      const b = E.settle(k);
      s.x = x; s.y = y; s.air = 0; s.shadow = 1;
      s.sy = L(0.80, 1, b); s.sx = 2 - s.sy;
      s.rot = L(-dir * 6, 0, E.outQuad(k));
      s.legL = 0; s.legR = 0; s.armL = L(-20, 0, E.outQuad(k)); s.armR = L(20, 0, E.outQuad(k));
    }
  } }),
  /** Ease the limbs to a pose. */
  pose: (at: number, dur: number, p: Partial<Pick<HostState, 'armL' | 'armR' | 'legL' | 'legR' | 'rot'>>, ease = E.outBack): Action =>
    ({ at, dur, name: 'pose', run: (t, s, start) => { for (const k of Object.keys(p) as (keyof typeof p)[]) (s as any)[k] = L((start as any)[k], (p as any)[k], ease(t)); } }),
  face: (at: number, face: Face): Action => ({ at, dur: 0, name: 'face', run: (_t, s) => { s.face = face; } }),
  /** Close the eyes for `dur` frames (3 is a natural blink). */
  blink: (at: number, dur = 3): Action => ({ at, dur, name: 'blink', run: (t, s) => { s.blink = t < 1 ? 1 : 0; } }),
  /** The eyes look toward dx,dy (viewBox units, ±0.6) over dur frames. */
  look: (at: number, dur: number, dx: number, dy: number): Action =>
    ({ at, dur, name: 'look', run: (t, s, start) => { s.lookX = L(start.lookX, dx, E.outQuad(t)); s.lookY = L(start.lookY, dy, E.outQuad(t)); } }),
  /** A head tilt (the whole body leans; the rig has no neck). */
  tilt: (at: number, dur: number, deg: number): Action => ({ at, dur, name: 'tilt', run: (t, s, start) => { s.rot = L(start.rot, deg, E.outBack(t)); } }),
  /**
   * The punch: wind up (lean back, arm back, a crouch), then the strike (a
   * lunge forward, the arm whips through, stretch), then recoil and settle.
   * `impact` is the frame the fist lands (the wind-up runs before `at`+0).
   */
  punch: (impact: number, dir = 1): Action => ({ at: impact - 12, dur: 30, name: 'punch', run: (t, s, start) => {
    const f = t * 30;                                  // frames since the wind-up began; impact at 12
    if (f < 12) {                                      // wind-up
      const k = E.inOutQuad(f / 12);
      s.rot = L(start.rot, -dir * 12, k); s.armR = L(start.armR, dir * 70, k); s.armL = L(start.armL, -dir * 25, k);
      s.sy = L(1, 0.9, k); s.sx = L(1, 1.06, k); s.x = L(start.x, start.x - dir * 10, k);
    } else if (f < 15) {                               // the strike: three frames
      const k = (f - 12) / 3;
      s.rot = L(-dir * 12, dir * 14, k); s.armR = L(dir * 70, -dir * 110, k); s.armL = L(-dir * 25, dir * 20, k);
      s.sy = L(0.9, 1.04, k); s.sx = L(1.06, 1.16, k); s.x = L(start.x - dir * 10, start.x + dir * 34, k);
    } else {                                           // recoil and settle
      const k = (f - 15) / 15; const b = E.settle(k);
      s.rot = L(dir * 14, 0, b); s.armR = L(-dir * 110, -dir * 30, b); s.armL = L(dir * 20, 0, b);
      s.sy = L(1.04, 1, b); s.sx = L(1.16, 1, b); s.x = L(start.x + dir * 34, start.x + dir * 14, E.outQuad(k));
    }
  } }),
  /** Change costume at `at` with a poof. */
  costume: (at: number, slug: Slug): Action => ({ at, dur: 0, name: 'costume', run: (_t, s) => { s.costume = slug; s.poof = at; } }),
  /** A wave: the right arm up and swinging for dur frames. */
  wave: (at: number, dur: number): Action => ({ at, dur, name: 'wave', run: (t, s, start) => {
    const inOut = Math.min(1, t * 6, (1 - t) * 6);
    s.armR = L(start.armR, -150, E.outBack(Math.min(1, t * 4))) + Math.sin(t * dur / 30 * Math.PI * 2 * 2.2) * 16 * inOut;
    if (t >= 1) s.armR = start.armR;
  } }),
  /** Peek in from the LEFT edge of the frame: the body slides from fully off to `reveal` of its width showing. */
  peekIn: (at: number, dur: number, y: number, size: number, reveal = 0.55): Action => ({ at, dur, name: 'peekIn', run: (t, s) => {
    s.size = size; s.y = y; s.hidden = false;
    s.x = L(-size, -size * (1 - reveal), E.outCubic(t));
    s.rot = L(0, -14, E.outCubic(t));                  // leans in around the edge, like looking round a corner
    s.armL = -150; s.armR = 0; s.legL = 0; s.legR = 0;
    s.shadow = 0;
  } }),
  /** Step fully into frame from a peek, onto the ground at y. */
  stepIn: (at: number, dur: number, x: number, y: number): Action => ({ at, dur, name: 'stepIn', run: (t, s, start) => {
    const e = E.inOutQuad(t);
    s.x = L(start.x, x, e); s.y = L(start.y, y, e); s.rot = L(start.rot, 0, e); s.armL = L(start.armL, 0, e); s.shadow = e;
  } }),
  hide: (at: number): Action => ({ at, dur: 0, name: 'hide', run: (_t, s) => { s.hidden = true; } }),
  show: (at: number): Action => ({ at, dur: 0, name: 'show', run: (_t, s) => { s.hidden = false; } }),
};
