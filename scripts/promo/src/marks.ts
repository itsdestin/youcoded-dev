// src/marks.ts — every trim in the timeline comes from here, never from a
// hand-measured frame. record.mjs writes <scene>.marks.json beside each clip:
// the video-time start/end of every scene action, labelled by its `mark`.
// The marks files are picked up by name (webpack's require.context), so a new
// scene needs no edit here — film it and use it.
import { FPS } from './grid';
type Marks = { fps: number; duration: number; actions: { i: number; kind: string; mark: string | null; start: number; end: number }[] };
declare const require: { context: (dir: string, deep: boolean, re: RegExp) => { keys: () => string[]; (k: string): Marks } };
const ctx = require.context('../public/footage', false, /\.marks\.json$/);
export const MARKS: Record<string, Marks> = Object.fromEntries(ctx.keys().map((k) => [k.replace(/^\.\//, '').replace(/\.marks\.json$/, ''), ctx(k)]));
export type Scene = string;
function marksOf(scene: Scene): Marks {
  const m = MARKS[scene];
  if (!m) throw new Error(`no footage for "${scene}" — film it: bash scripts/promo/film.sh <app-worktree> ${scene}`);
  return m;
}
export function markSec(scene: Scene, label: string, edge: 'start' | 'end' = 'start'): number {
  const a = marksOf(scene).actions.find((x) => x.mark === label);
  if (!a) throw new Error(`no mark "${label}" in ${scene}.marks.json — add "mark": "${label}" to that action in the scene and re-film`);
  return a[edge];
}
/** Clip frame (at the composition's 30 fps) of a labelled action, plus an offset; never negative. */
export const markFrame = (scene: Scene, label: string, edge: 'start' | 'end' = 'start', offset = 0) =>
  Math.max(0, Math.round(markSec(scene, label, edge) * FPS) + offset);
export const clipFrames = (scene: Scene) => Math.round(marksOf(scene).duration * FPS);
/**
 * Throw at bundle time if a beat would out-run its clip. WHY a throw and not a
 * warning: an exhausted OffthreadVideo freezes on its last frame, which looks
 * exactly like a deliberate hold — so nothing on screen tells you the shot died.
 */
export function assertClipCovers(scene: Scene, from: number, frames: number, rate = 1): void {
  const need = Math.ceil(frames * rate);
  const have = clipFrames(scene) - from;
  if (have < need)
    throw new Error(`${scene}.webm runs out ${((need - have) / FPS).toFixed(2)}s before its shot ends (needs ${need} clip frames from ${from}, has ${have} of ${clipFrames(scene)}) — re-film with a longer hold`);
}
