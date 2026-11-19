#!/usr/bin/env node
// Cuts the still pictures the posters and the "wall" scenes use out of the filmed takes.
// WHY from the film and not separate screenshots: a still is then exactly a frame people also see
// moving in the ad (same data, same size, same theme), and one filming run feeds both.
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const SRC = join(dirname(fileURLToPath(import.meta.url)), 'footage'), OUT = join(SRC, 'stills');
mkdirSync(OUT, { recursive: true });
// The order every *-themes take switches looks in (swap1..swap6).
const THEMES = ['golden-sunbreak', 'meadow-mist', 'halftone-dimension', 'cotton-candy-sky', 'midnight', 'youcoded'];
const marks = (clip) => Object.fromEntries(JSON.parse(readFileSync(join(SRC, `${clip}.marks.json`), 'utf8')).actions.filter((a) => a.mark).map((a) => [a.mark, a]));
const grab = (clip, t, name) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(3), '-i', join(SRC, `${clip}.mp4`), '-frames:v', '1', join(OUT, `${name}.png`)]);
let n = 0;
// 0.95 s after a switch: the look's own fade-in has finished and the next switch has not begun.
for (const [clip, name] of [['home-themes', 'page-home'], ['money-themes', 'page-money'], ['ask-theme', 'chat']]) {
  if (!existsSync(join(SRC, `${clip}.mp4`))) { console.log(`skipped ${clip}: not filmed`); continue; }
  const m = marks(clip);
  THEMES.forEach((th, i) => { grab(clip, m[`swap${i + 1}`].end + 0.95, `${name}--${th}`); n++; });
}
for (const clip of ['office-doc', 'market-themes']) { grab(clip, marks(clip).open.end + 0.6, `${clip}--youcoded`); n++; }
console.log(`${n} stills`);
