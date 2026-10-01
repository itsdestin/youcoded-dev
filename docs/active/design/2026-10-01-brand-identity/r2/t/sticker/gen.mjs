// gen.mjs — writes the sticker territory's shippable SVGs (mascot, app icon, installer, tray)
// from stk.js and rasterises them at true sizes. Small sizes (16–32) use the simplified tile
// with no peel or inner rim: real icon sets swap drawings per size, and the peel is mush at 24px.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { raster } from '../../rast.mjs';

const here = new URL('.', import.meta.url).pathname;
new Function(readFileSync(here + 'stk.js', 'utf8'))();
const { mascot, tile, tray } = globalThis.STK;
const svgDir = here + 'svg', pngDir = here + 'png';
mkdirSync(svgDir, { recursive: true });

const files = {
  mascot: mascot({ size: 512 }),
  icon: tile({}),
  'icon-small': tile({ small: true }),
  installer: tile({ backing: true, peel: 44 }),
  'installer-small': tile({ small: true }).replace('</svg>', `<g transform="translate(76 76)"><circle r="21" fill="#7C3AED" stroke="#fff" stroke-width="5"/><path d="M0 -10 V8 M-8 1 L0 9 L8 1" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`),
  'tray-white-16': tray(16, '#FFFFFF'), 'tray-black-16': tray(16, '#111111'),
  'tray-white-24': tray(24, '#FFFFFF'), 'tray-black-24': tray(24, '#111111'),
};
for (const [n, s] of Object.entries(files)) writeFileSync(`${svgDir}/${n}.svg`, s.replace(/style="[^"]*filter:blur[^"]*"/g, ''));

raster(`${svgDir}/mascot.svg`, pngDir, 'mascot');
raster(`${svgDir}/icon.svg`, pngDir, 'icon');
raster(`${svgDir}/icon-small.svg`, pngDir, 'icon', [16, 20, 24, 32]);
raster(`${svgDir}/installer.svg`, pngDir, 'installer');
raster(`${svgDir}/installer-small.svg`, pngDir, 'installer', [16, 20, 24, 32]);
raster(`${svgDir}/tray-white-16.svg`, pngDir, 'tray-white', [16]);
raster(`${svgDir}/tray-black-16.svg`, pngDir, 'tray-black', [16]);
raster(`${svgDir}/tray-white-24.svg`, pngDir, 'tray-white', [24]);
raster(`${svgDir}/tray-black-24.svg`, pngDir, 'tray-black', [24]);
console.log('sticker: svgs + pngs written');
