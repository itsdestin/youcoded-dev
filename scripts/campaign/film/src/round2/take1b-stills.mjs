// Take 1B: pulls single frames of the REAL app out of recordings already made with scripts/ui-review
// (public/footage/*.mp4), so the film's phones and tablets can wear real youcoded windows in real themes.
// WHY frames and not drawings: brand guide section 8 says the app's own interface is never drawn or faked;
// the reviewer (2026-11-20) flagged the drawn pastel "ask" bars as exactly that. Run from the film folder:
//   node src/round2/take1b-stills.mjs
// Times are picked by eye from contact sheets of each recording (comments say what each frame shows).
// Cotton Candy Sky and Meadow Mist are left out on purpose: the owner did not like them (2026-11-20).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const FRAMES = [
  // phone recording (1170x2532): the empty youcoded window, before anything is asked
  ['footage/ask-theme-phone.mp4', 0.6, 'take1b-phone-empty.png'],
  // the same conversation after the person's look is applied, in four real community themes
  ['footage/ask-theme-phone.mp4', 12.3, 'take1b-phone-golden.png'],
  ['footage/ask-theme-phone.mp4', 15.6, 'take1b-phone-halftone.png'],
  ['footage/ask-theme-phone.mp4', 17.9, 'take1b-phone-midnight.png'],
  ['footage/ask-theme-phone.mp4', 19.6, 'take1b-phone-youcoded.png'],
  // wide recording (2880x1962, close to a tablet's shape): a desert theme
  ['footage/r2-look.mp4', 21.5, 'take1b-wide-desert.png'],
];

for (const [src, t, out] of FRAMES) {
  const from = `public/${src}`;
  if (!existsSync(from)) throw new Error(`take1b-stills: ${from} is missing; record it first (scripts/ui-review/README.md, "Recording a loop")`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', from, '-frames:v', '1', `public/stills/${out}`]);
  console.log('wrote', `public/stills/${out}`);
}
