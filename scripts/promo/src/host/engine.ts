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
  spin: number;                   // turn about the VERTICAL axis, degrees (the twirl); 0 = facing us
  poofScale: number;              // how big the next poof draws (1 = the host's size; the teleport uses 1.8)
  peekHand: 'L' | 'R' | null;     // the rig's edge-gripping hand shown instead of that arm (the corner peek)
};
export const REST: HostState = { x: 0, y: 0, size: 120, rot: 0, sx: 1, sy: 1, armL: 0, armR: 0, legL: 0, legR: 0, face: 'welcome', blink: 0,
  lookX: 0, lookY: 0, shadow: 1, air: 0, costume: 'midnight', hidden: false, alpha: 1, poof: null, spin: 0, poofScale: 1, peekHand: null };

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
  /**
   * Peek in from the LEFT edge of the frame, from wherever it is to `reveal` of its
   * width showing, leaning `lean` degrees toward the centre. The rig's edge-gripping
   * hand shows in place of the left arm, the right arm hangs behind the edge, and the
   * legs are tucked back out of sight. Call it twice for a two-step peek (a first
   * glance, then leaning fully in — Destin, 2026-09-04).
   */
  peekIn: (at: number, dur: number, y: number, size: number, reveal = 0.55, lean = 12): Action => ({ at, dur, name: 'peekIn', run: (t, s, start) => {
    const fromX = start.hidden ? -size : start.x;
    s.size = size; s.y = y; s.hidden = false;
    s.x = L(fromX, -size * (1 - reveal), E.outCubic(t));
    s.rot = L(start.hidden ? 0 : start.rot, lean, E.outCubic(t));
    s.peekHand = 'L'; s.armR = 30; s.legL = -55; s.legR = -55;   // hand on the edge; the far arm and the legs behind it
    s.shadow = 0;
  } }),
  /** Step fully into frame from a peek, onto the ground at y. */
  stepIn: (at: number, dur: number, x: number, y: number): Action => ({ at, dur, name: 'stepIn', run: (t, s, start) => {
    const e = E.inOutQuad(t);
    s.x = L(start.x, x, e); s.y = L(start.y, y, e); s.rot = L(start.rot, 0, e); s.shadow = e;
    s.peekHand = t > 0.15 ? null : 'L';                 // lets go of the edge as it steps
    s.armL = L(-40, 0, e); s.armR = L(start.armR, 0, e); s.legL = L(start.legL, 0, e); s.legR = L(start.legR, 0, e);
  } }),
  // ---- presenting gestures (Destin, 2026-09-04: "the mascot kinda just moves around for no reason
  // … I really want it to feel like the mascot is presenting the app … more movement in the
  // hands/legs"). Each is a short, readable gesture AT something on screen; the beats chain them
  // to the footage marks so every move has a reason the viewer can see.

  /** Point with one arm: 'R' toward the right, 'L' toward the left; `dip` 0 = straight out, 1 = straight down. Holds until the next arm action. */
  point: (at: number, arm: 'L' | 'R', dip = 0.5, dur = 10): Action => ({ at, dur: dur + 14, name: 'point', run: (t, s, start) => {
    // the arm is short, so a point has to be BIG to read: the arm swings well up (150 = high,
    // 55 = down-and-out at dip 1), the whole body leans that way, and the arm jabs once more
    // after it lands (the 3c review read a 36° arm as "standing")
    const k = E.outBack(Math.min(1, t * (dur + 14) / dur));
    const deg = 150 - 95 * dip;
    const jab = 12 * E.hump(Math.max(0, Math.min(1, (t * (dur + 14) - dur) / 14)));
    if (arm === 'R') { s.armR = L(start.armR, -deg, k) - jab; s.armL = L(start.armL, 20, k); }
    else { s.armL = L(start.armL, deg, k) + jab; s.armR = L(start.armR, -20, k); }
    s.rot = L(start.rot, arm === 'R' ? 10 : -10, k);        // leans toward what it points at
    s.sx = 1 + 0.04 * k; s.sy = 1 - 0.03 * k;
  } }),
  /** A startle: a quick jump up with the arms thrown high and a stretch, landing in a squash; the shocked face. */
  startle: (at: number, dur = 16): Action => ({ at, dur, name: 'startle', run: (t, s, start) => {
    const up = E.hump(Math.min(1, t * 1.4));
    s.y = start.y - 34 * up; s.air = up; s.shadow = 1 - 0.4 * up;
    s.sy = 1 + 0.16 * up; s.sx = 1 - 0.1 * up;
    s.armL = L(start.armL, 160, E.outBack(Math.min(1, t * 3))); s.armR = -s.armL; s.legL = -18 * up; s.legR = 18 * up;
    s.face = 'shocked';
    if (t > 0.72) { const b = E.settle((t - 0.72) / 0.28); s.y = start.y; s.air = 0; s.shadow = 1; s.sy = L(0.82, 1, b); s.sx = 2 - s.sy; s.legL = 0; s.legR = 0; }
  } }),
  /** Arms back down, lean gone. */
  rest: (at: number, dur = 10): Action => ({ at, dur, name: 'rest', run: (t, s, start) => {
    const k = E.inOutQuad(t); s.armL = L(start.armL, 0, k); s.armR = L(start.armR, 0, k); s.rot = L(start.rot, 0, k); s.legL = L(start.legL, 0, k); s.legR = L(start.legR, 0, k);
  } }),
  /** "Ta-da": both arms sweep up and out with a little hop, then hold wide; `side` leans it toward what is presented. */
  tada: (at: number, side: 'L' | 'R' | 'C' = 'C', dur = 14): Action => ({ at, dur, name: 'tada', run: (t, s, start) => {
    const k = E.outBack(t);
    s.armL = L(start.armL, 115, k); s.armR = L(start.armR, -115, k);
    const hop = 18 * E.hump(Math.min(1, t * 1.5)); s.y = start.y - hop; s.air = Math.min(1, hop / 30); s.shadow = 1 - 0.3 * s.air;
    s.sy = 1 + 0.08 * E.hump(t); s.sx = 2 - s.sy;
    s.rot = L(start.rot, side === 'R' ? 6 : side === 'L' ? -6 : 0, k);
    if (t >= 1) { s.y = start.y; s.air = 0; s.shadow = 1; }
  } }),
  /** Both arms up, alternating little pumps — a cheer — for dur frames, then down. */
  cheer: (at: number, dur = 30): Action => ({ at, dur, name: 'cheer', run: (t, s, start) => {
    // arms high and pumping, and the body actually JUMPS (26 px, stretched on the way up,
    // squashed on the way down) — a 7 px bob did not register in the 3c review
    const up = Math.min(1, t * 5), down = Math.min(1, (1 - t) * 5), io = Math.min(up, down);
    const pump = Math.sin(t * dur / 30 * Math.PI * 2 * 2) * 18;
    s.armL = L(start.armL, 150, E.outBack(up)) * (t < 1 ? 1 : 0) + pump * io; s.armR = -s.armL;
    const ph = t * dur / 30 * Math.PI * 2 * 2;
    const jump = Math.max(0, Math.sin(ph)) * 26 * io; s.y = start.y - jump; s.air = Math.min(1, jump / 30); s.shadow = 1 - 0.4 * s.air;
    s.sy = 1 + 0.1 * Math.sin(ph) * io; s.sx = 2 - s.sy; s.legL = -14 * Math.max(0, Math.sin(ph)) * io; s.legR = -s.legL;
    if (t >= 1) { s.armL = start.armL; s.armR = start.armR; s.y = start.y; s.sy = 1; s.sx = 1; s.air = 0; s.shadow = 1; s.legL = 0; s.legR = 0; }
  } }),
  /** A clap: arms up in front, beating together, for dur frames. */
  clap: (at: number, dur = 24): Action => ({ at, dur, name: 'clap', run: (t, s, start) => {
    const io = Math.min(1, t * 4, (1 - t) * 4);
    const beat = (Math.sin(t * dur / 30 * Math.PI * 2 * 3) + 1) / 2;           // 3 claps a second
    s.armL = L(start.armL, 125 + 25 * beat, io); s.armR = L(start.armR, -125 - 25 * beat, io);
    s.sy = 1 - 0.02 * beat * io; s.sx = 2 - s.sy;
    if (t >= 1) { s.armL = start.armL; s.armR = start.armR; s.sy = 1; s.sx = 1; }
  } }),
  /** Waiting: one foot taps and the body rocks, arms loosely swinging, for dur frames. */
  tapFoot: (at: number, dur = 40): Action => ({ at, dur, name: 'tapFoot', run: (t, s, start) => {
    const io = Math.min(1, t * 4, (1 - t) * 4);
    const ph = t * dur / 30 * Math.PI * 2 * 2.5;                             // 2.5 taps a second
    s.legR = -22 * Math.max(0, Math.sin(ph)) * io; s.rot = L(start.rot, 3, io) + Math.sin(ph) * 1.5 * io;
    s.armL = start.armL + 8 * Math.sin(ph) * io; s.armR = start.armR - 8 * Math.sin(ph) * io;
    if (t >= 1) { s.legR = 0; s.rot = start.rot; s.armL = start.armL; s.armR = start.armR; }
  } }),
  /** A nod: two quick dips with a small squash, eyes down. */
  nod: (at: number, dur = 16): Action => ({ at, dur, name: 'nod', run: (t, s, start) => {
    const d = Math.abs(Math.sin(t * Math.PI * 2)) * (1 - t * 0.4);
    s.sy = 1 - 0.16 * d; s.sx = 1 + 0.1 * d; s.lookY = 0.5 * d; s.rot = start.rot + 5 * d;   // two deep dips
  } }),
  /** Thinking: a hand to the chin (right arm up and in), a tilt, eyes up and away; holds until `rest`. */
  think: (at: number, dur = 10): Action => ({ at, dur, name: 'think', run: (t, s, start) => {
    const k = E.outBack(t); s.armR = L(start.armR, -165, k); s.rot = L(start.rot, -7, k); s.lookX = L(start.lookX, 0.45, k); s.lookY = L(start.lookY, -0.35, k);
  } }),
  /** A shrug: both arms out sideways, a tilt, held briefly. */
  shrug: (at: number, dur = 16): Action => ({ at, dur, name: 'shrug', run: (t, s, start) => {
    const io = Math.min(1, t * 3, (1 - t) * 3), k = E.outBack(io);
    s.armL = L(start.armL, 75, k); s.armR = L(start.armR, -75, k); s.rot = L(start.rot, 6, k); s.sy = 1 - 0.04 * k; s.sx = 1 + 0.03 * k;
    if (t >= 1) { s.armL = start.armL; s.armR = start.armR; s.rot = start.rot; s.sy = 1; s.sx = 1; }
  } }),
  /** Shutdown: eyes close, the arms fold in under the body and the legs tuck up beneath it, the body settles a touch lower. `wake` undoes it. */
  shutdown: (at: number, dur = 16): Action => ({ at, dur, name: 'shutdown', run: (t, s, start) => {
    const k = E.inOutQuad(t);
    s.armL = L(start.armL, 70, k); s.armR = L(start.armR, -70, k);      // arms swing in under the belly
    s.legL = L(start.legL, 95, k); s.legR = L(start.legR, -95, k);      // legs fold up underneath
    s.sy = L(start.sy, 0.94, k); s.sx = L(start.sx, 1.04, k); s.rot = L(start.rot, 0, k);
    if (t > 0.3) s.face = 'shutdown';
  } }),
  wake: (at: number, dur = 14): Action => ({ at, dur, name: 'wake', run: (t, s, start) => {
    const k = E.outBack(t);
    s.armL = L(start.armL, 0, k); s.armR = L(start.armR, 0, k); s.legL = L(start.legL, 0, k); s.legR = L(start.legR, 0, k);
    s.sy = L(start.sy, 1, k); s.sx = L(start.sx, 1, k);
    if (t > 0.5) s.face = 'welcome';
  } }),
  hide: (at: number): Action => ({ at, dur: 0, name: 'hide', run: (_t, s) => { s.hidden = true; } }),
  show: (at: number): Action => ({ at, dur: 0, name: 'show', run: (_t, s) => { s.hidden = false; } }),

  // ---- the theme-change moves (round three, check-in 3b). Destin, 2026-09-04:
  // "the jump animation just feels odd" — these replace the arrival hop. Each
  // ends standing at x,y in `slug`, with the landing/settle feel of the hop
  // (a squash that rings down in two bounces) but no arc across the screen.

  /**
   * A · the quick-change behind the wipe. `hit` is the frame the accent band
   * crosses the host (transitions.ts bandHitFrame). It sees the band coming
   * and ducks — crouches, throws its arms over its eyes — the band passes over
   * it and it springs up in the new costume, arms flung wide, a small pop off
   * the ground, and settles. A magician's cloth: the wipe is the cloth.
   */
  quickChange: (hit: number, slug: Slug, x: number, y: number): Action[] => [
    { at: hit - 10, dur: 10, name: 'duck', run: (t, s, start) => {
      const k = E.inOutQuad(t);
      s.x = L(start.x, x, k); s.y = L(start.y, y, k);
      s.sy = L(start.sy, 0.70, k); s.sx = L(start.sx, 1.22, k);
      s.armL = L(start.armL, -150, k); s.armR = L(start.armR, 150, k);   // arms up over the eyes
      s.legL = 0; s.legR = 0; s.rot = L(start.rot, 0, k); s.air = 0; s.shadow = 1;
    } },
    { at: hit - 4, dur: 4, name: 'eyes-shut', run: (t, s) => { s.blink = t < 1 ? 1 : 0; } },
    // the band is 96 px wide and moves ~300 px a frame, so it covers the host for barely a frame; for the
    // two frames it is passing, the host is simply not drawn (the first review saw the old costume's
    // edges poking out beside the band)
    { at: hit - 1, dur: 2, name: 'under-the-band', run: (t, s) => { s.alpha = t < 1 ? 0 : 1; } },
    { at: hit, dur: 0, name: 'swap', run: (_t, s) => { s.costume = slug; s.poof = hit; s.face = 'shocked'; s.poofScale = 1.3; } },
    { at: hit, dur: 16, name: 'spring-up', run: (t, s) => {
      const b = E.settle(t);                                         // 0.70 → overshoot → 1
      s.sy = L(0.70, 1, b) + 0.22 * E.hump(Math.min(1, t * 2.2)) * (1 - t);   // a stretch on the way up
      s.sx = 2 - s.sy;
      const pop = 26 * E.hump(Math.min(1, t * 1.6));                  // a small pop off the ground
      s.y = y - pop; s.air = Math.min(1, pop / 40); s.shadow = 1 - 0.4 * s.air; s.x = x;
      s.armL = L(-150, 0, E.outBack(t)) - 40 * E.hump(t); s.armR = L(150, 0, E.outBack(t)) + 40 * E.hump(t);   // flung wide, then down
      s.rot = 0; s.legL = 0; s.legR = 0;
    } },
    { at: hit + 16, dur: 0, name: 'face', run: (_t, s) => { s.face = 'welcome'; } },
    { at: hit + 24, dur: 3, name: 'blink', run: (t, s) => { s.blink = t < 1 ? 1 : 0; } },
  ],

  /**
   * B · the poof-teleport. Vanishes at `at`: a quick crouch, a stretch upward,
   * and it shrinks to nothing in a puff. Reappears at `back`, at x,y in `slug`:
   * a puff, grows from its feet with an overshoot, then the landing squash.
   */
  vanish: (at: number): Action[] => [
    { at: at - 8, dur: 8, name: 'wind', run: (t, s, start) => {
      const k = E.inOutQuad(t); s.sy = L(start.sy, 0.82, k); s.sx = L(start.sx, 1.14, k); s.armL = L(start.armL, 30, k); s.armR = L(start.armR, -30, k); s.rot = L(start.rot, 0, k);
    } },
    { at, dur: 4, name: 'puff-out', run: (t, s, start) => {
      // a quick stretch UP then gone — whole, not squeezed to a line (the first review read a thin
      // sliver as "sucked into a line"); the big puff is what the eye keeps
      const k = E.inQuad(t);
      s.sy = L(0.82, 1.25, t) * (1 - k); s.sx = L(1.14, 0.9, t) * (1 - k);
      s.alpha = 1 - k; s.shadow = 1 - t; s.armL = start.armL; s.armR = start.armR;
      if (t >= 1) { s.hidden = true; s.sy = 1; s.sx = 1; s.alpha = 1; }
    } },
    { at, dur: 0, name: 'poof', run: (_t, s) => { s.poof = at; s.poofScale = 1.8; } },
  ],
  appear: (back: number, x: number, y: number, slug: Slug): Action[] => [
    { at: back, dur: 0, name: 'materialise', run: (_t, s) => { s.hidden = false; s.x = x; s.y = y; s.costume = slug; s.poof = back; s.poofScale = 1.8; s.face = 'shocked'; s.rot = 0; s.legL = 0; s.legR = 0; s.air = 0; s.alpha = 1; } },
    { at: back, dur: 8, name: 'grow', run: (t, s) => {
      const k = E.outBack(t); s.sx = k; s.sy = k * L(1.22, 1.08, t);   // grows from the feet, tall — it drops into the squash next
      s.armL = L(120, 0, k); s.armR = L(-120, 0, k); s.shadow = t;
    } },
    // the landing: from tall to a deep squash that rings down in two bounces (the weight the first review missed)
    { at: back + 8, dur: 16, name: 'land', run: (t, s) => { const b = E.settle(t); s.sy = L(0.74, 1, b); s.sx = 2 - s.sy; s.armL = L(0, 0, b) + 30 * E.hump(Math.min(1, t * 2)); s.armR = -s.armL; } },
    { at: back + 14, dur: 0, name: 'face', run: (_t, s) => { s.face = 'welcome'; } },
    { at: back + 22, dur: 3, name: 'blink', run: (t, s) => { s.blink = t < 1 ? 1 : 0; } },
  ],

  /**
   * C · the twirl. Spins about its own axis, accelerating then slowing — three
   * full turns over `dur` frames — stretched tall and thin in the middle, the
   * costume switching the instant it is edge-on at the halfway point (a puff
   * there), gliding to x,y if that differs. Comes out of the spin with a dizzy
   * wobble that rings down, then the welcome face.
   */
  twirl: (at: number, dur: number, x: number, y: number, slug: Slug): Action[] => [
    { at, dur: 0, name: 'poof-size', run: (_t, s) => { s.poofScale = 1.2; } },
    { at, dur, name: 'twirl', run: (t, s, start) => {
      const e = E.inOutQuad(t);
      s.spin = 720 * e;                                               // two turns (three strobed at 30 fps); the blur in Host.tsx fills the gaps
      s.x = L(start.x, x, e); s.y = L(start.y, y, e);
      const mid = E.hump(t);
      s.sy = 1 + 0.16 * mid; s.sx = 1 - 0.10 * mid;
      s.armL = -70 * mid; s.armR = 70 * mid; s.legL = -12 * mid; s.legR = 12 * mid;   // arms out, centrifugal
      s.rot = 0; s.air = 0; s.shadow = 1 - 0.25 * mid;
      if (t >= 0.5) { s.costume = slug; s.poof = at + Math.round(dur / 2); }
      s.face = t >= 0.5 && t < 1 ? 'dizzy' : s.face;
      if (t >= 1) s.spin = 0;
    } },
    { at: at + dur, dur: 16, name: 'wobble', run: (t, s) => {
      s.rot = 16 * Math.exp(-3.5 * t) * Math.sin(t * Math.PI * 3);    // the dizzy sway, ringing down
      const b = E.settle(t); s.sy = L(0.90, 1, b); s.sx = 2 - s.sy; s.spin = 0;
      s.face = t < 0.6 ? 'dizzy' : 'welcome';
    } },
    { at: at + dur + 20, dur: 3, name: 'blink', run: (t, s) => { s.blink = t < 1 ? 1 : 0; } },
  ],
};
