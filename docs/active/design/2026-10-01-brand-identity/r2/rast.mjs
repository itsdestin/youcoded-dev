// rast.mjs — rasterise a territory's SVGs at true pixel sizes.
// Usage from a territory's gen.mjs: import { raster } from '../../rast.mjs';
// raster('<abs svg path>', '<abs png dir>', 'name') writes name-16.png … name-512.png.
// WHY true rasters: a 16px tray icon judged from a scaled-up vector hides the mush.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
export const SIZES = [16, 20, 24, 32, 48, 64, 128, 256, 512];
export function raster(svg, dir, name, sizes = SIZES) {
  mkdirSync(dir, { recursive: true });
  for (const px of sizes) execFileSync('rsvg-convert', ['-w', String(px), '-h', String(px), '--keep-aspect-ratio', svg, '-o', `${dir}/${name}-${px}.png`]);
}
