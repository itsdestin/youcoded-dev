// src/marks.ts — every trim in the timeline comes from here, never from a
// hand-measured frame. record.mjs writes <scene>.marks.json beside each clip:
// the video-time start/end of every scene action, labelled by its `mark`.
import { FPS } from './grid';
import quickChip from '../public/footage/promo-quick-chip.marks.json';
import sheet from '../public/footage/promo-sheet.marks.json';
import flappy from '../public/footage/promo-flappy.marks.json';
import strip from '../public/footage/promo-strip.marks.json';
import remote from '../public/footage/promo-remote.marks.json';
import phone from '../public/footage/promo-phone.marks.json';
import takeover from '../public/footage/promo-takeover.marks.json';
import theme from '../public/footage/promo-theme.marks.json';
import idleMidnight from '../public/footage/promo-idle-midnight.marks.json';
import idleGolden from '../public/footage/promo-idle-golden.marks.json';
type Marks = { fps: number; duration: number; actions: { i: number; kind: string; mark: string | null; start: number; end: number }[] };
const MARKS = { 'promo-quick-chip': quickChip, 'promo-sheet': sheet, 'promo-flappy': flappy, 'promo-strip': strip, 'promo-remote': remote,
  'promo-phone': phone, 'promo-takeover': takeover, 'promo-theme': theme, 'promo-idle-midnight': idleMidnight, 'promo-idle-golden': idleGolden } satisfies Record<string, Marks>;
export type Scene = keyof typeof MARKS;
export function markSec(scene: Scene, label: string, edge: 'start' | 'end' = 'start'): number {
  const a = MARKS[scene].actions.find((x) => x.mark === label);
  if (!a) throw new Error(`no mark "${label}" in ${scene}.marks.json — add "mark": "${label}" to that action in the scene and re-film`);
  return a[edge];
}
/** Clip frame (at the composition's 30 fps) of a labelled action, plus an offset; never negative. */
export const markFrame = (scene: Scene, label: string, edge: 'start' | 'end' = 'start', offset = 0) =>
  Math.max(0, Math.round(markSec(scene, label, edge) * FPS) + offset);
export const clipFrames = (scene: Scene) => Math.round(MARKS[scene].duration * FPS);
/**
 * Throw at bundle time if a beat would out-run its clip. WHY a throw and not a
 * warning: an exhausted OffthreadVideo freezes on its last frame, which looks
 * exactly like a deliberate hold — so nothing on screen tells you the shot died.
 * `beatFrames` is the beat's own length, `rate` its playback speed.
 */
export function assertClipCovers(scene: Scene, from: number, beatFrames: number, rate = 1): void {
  const need = Math.ceil(beatFrames * rate);
  const have = clipFrames(scene) - from;
  if (have < need)
    throw new Error(
      `${scene}.webm runs out ${((need - have) / FPS).toFixed(2)}s before its beat ends ` +
        `(needs ${need} clip frames from ${from}, has ${have} of ${clipFrames(scene)}) — re-film with a longer hold`,
    );
}
