// gen-marks.mjs — draws every candidate mark / icon / tray glyph for the brand exploration
// deck as SVG, then rasterises each at real pixel sizes with rsvg-convert.
// WHY real rasters: a tray icon is judged at 16-22 px; a vector scaled up in a browser hides
// exactly the mush we are trying to show, so every small size here is a true small PNG.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const PURPLE = '#8B47B8', DEEP = '#5E2A86', INK = '#1E1A2B', LAV = '#E7D4EF', WHITE = '#FFFFFF';

// The one silhouette every option shares: head, side arms, two feet (24-unit grid, the
// same geometry as the built-in mascot in docs/mascots/default.svg).
const HEAD = 'M9 4 L15 4 A4 4 0 0 1 19 8 L19 12 A4 4 0 0 1 15 16 L9 16 A4 4 0 0 1 5 12 L5 8 A4 4 0 0 1 9 4 Z';
const ARM_L = '<rect x="1" y="9" width="3" height="4" rx="0.9"/>';
const ARM_R = '<rect x="20" y="9" width="3" height="4" rx="0.9"/>';
const ARM_R_WAVE = '<rect x="19.6" y="4.2" width="3" height="4.4" rx="0.9" transform="rotate(28 21.1 6.4)"/>';
const FEET = '<rect x="7.2" y="17" width="3.5" height="4" rx="1.2"/><rect x="13.3" y="17" width="3.5" height="4" rx="1.2"/>';
const EYES_CUT = 'M8.5 8 L10.5 10 L8.5 12 L9.5 12 L11.5 10 L9.5 8 Z M15.5 8 L13.5 10 L15.5 12 L14.5 12 L12.5 10 L14.5 8 Z';
const ell = (cx, cy, rx, ry) => `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
const EYES_DOT = ell(9.7, 9.6, 1.15, 1.65) + ell(14.3, 9.6, 1.15, 1.65);

// A mascot as a group: body in `fill`, eyes punched through (transparent) so it works on any
// background — what a tray glyph and a one-colour print both need.
function mascot({ fill, eyes = 'dot', wave = false, smile = false, id = 'm' }) {
  const eyePath = eyes === 'cut' ? EYES_CUT : EYES_DOT;
  const smileEl = smile ? '<path d="M11 13.1 Q12 14.1 13 13.1" fill="none" stroke="black" stroke-width="0.9" stroke-linecap="round"/>' : '';
  return `<defs><mask id="${id}"><rect x="-2" y="-2" width="28" height="28" fill="white"/>
    <path d="${eyePath}" fill="black"/>${smileEl}</mask></defs>
  <g fill="${fill}"><path d="${HEAD}" mask="url(#${id})"/>${ARM_L}${wave ? ARM_R_WAVE : ARM_R}${FEET}</g>`;
}
// A mascot whose eyes are DRAWN in a colour (for a tile, where a hole would show the tile).
function mascotEyes({ fill, eyeFill, eyes = 'dot', wave = false }) {
  const eyePath = eyes === 'cut' ? EYES_CUT : EYES_DOT;
  return `<g fill="${fill}"><path d="${HEAD}"/>${ARM_L}${wave ? ARM_R_WAVE : ARM_R}${FEET}</g><path d="${eyePath}" fill="${eyeFill}"/>`;
}

const svg24 = (body, pad = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${24 + 2 * pad} ${24 + 2 * pad}">${body}</svg>`;
// A 48-box app tile with the mascot inset; `badge` adds the installer's corner arrow.
function tile({ bg, mascotBody, badge = false, inset = 0.62 }) {
  const s = (48 * inset) / 24, off = (48 - 24 * s) / 2;
  const bgEl = bg.startsWith('grad:')
    ? `<defs><linearGradient id="tg" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${bg.split(':')[1]}"/><stop offset="1" stop-color="${bg.split(':')[2]}"/></linearGradient></defs><rect width="48" height="48" rx="11" fill="url(#tg)"/>`
    : `<rect width="48" height="48" rx="11" fill="${bg}"/>`;
  const badgeEl = badge
    ? `<circle cx="38.5" cy="38.5" r="8.6" fill="${WHITE}" stroke="${INK}" stroke-opacity=".12" stroke-width=".6"/>
       <path d="M38.5 33.6 V42.2 M34.9 38.8 L38.5 42.4 L42.1 38.8" fill="none" stroke="${PURPLE}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${bgEl}<g transform="translate(${off} ${off + 0.6}) scale(${s})">${mascotBody}</g>${badgeEl}</svg>`;
}

const files = {
  // Mark drawings (step: which mascot drawing is the logo)
  'mark-cut': svg24(mascot({ fill: PURPLE, eyes: 'cut', id: 'a' }), 1),
  'mark-dot': svg24(mascot({ fill: PURPLE, eyes: 'dot', id: 'b' }), 1),
  'mark-wave': svg24(mascot({ fill: PURPLE, eyes: 'dot', wave: true, id: 'c' }), 1),
  'mark-dot-ink': svg24(mascot({ fill: INK, eyes: 'dot', id: 'd' }), 1),
  'mark-dot-white': svg24(mascot({ fill: WHITE, eyes: 'dot', id: 'e' }), 1),
  'mark-cut-ink': svg24(mascot({ fill: INK, eyes: 'cut', id: 'f' }), 1),

  // Tray glyphs (no tile): one-colour light/dark, and coloured
  'tray-mono-white': svg24(mascot({ fill: WHITE, eyes: 'dot', id: 'g' })),
  'tray-mono-black': svg24(mascot({ fill: '#111', eyes: 'dot', id: 'h' })),
  'tray-color': svg24(mascotEyes({ fill: '#A462D6', eyeFill: WHITE, eyes: 'dot' })),

  // App icons
  'icon-bold': tile({ bg: `grad:#A35CD6:${DEEP}`, mascotBody: mascotEyes({ fill: WHITE, eyeFill: DEEP, wave: true }) }),
  'icon-bold-inst': tile({ bg: `grad:#A35CD6:${DEEP}`, mascotBody: mascotEyes({ fill: WHITE, eyeFill: DEEP, wave: true }), badge: true }),
  'icon-ink': tile({ bg: `grad:#2C2540:#15121F`, mascotBody: mascotEyes({ fill: '#B57BE3', eyeFill: '#15121F', wave: true }) }),
  'icon-ink-inst': tile({ bg: `grad:#2C2540:#15121F`, mascotBody: mascotEyes({ fill: '#B57BE3', eyeFill: '#15121F', wave: true }), badge: true }),
};
for (const [name, s] of Object.entries(files)) writeFileSync(OUT + name + '.svg', s);

// The current shipped icons, for the "today" options.
const A = new URL('./assets/', import.meta.url).pathname;
const raster = (src, name, sizes) => {
  for (const px of sizes) execFileSync('rsvg-convert', ['-w', String(px), '-h', String(px), '--keep-aspect-ratio', src, '-o', `${OUT}${name}-${px}.png`]);
};
const SIZES = [16, 20, 24, 32, 48, 64, 128, 256];
for (const name of Object.keys(files)) raster(OUT + name + '.svg', name, SIZES);
raster(A + 'icon.svg', 'icon-current', SIZES);
raster(A + 'installer-icon.svg', 'icon-current-inst', SIZES);
raster(A + 'icon-mascot.svg', 'mark-gloss', SIZES);
console.log('ok', Object.keys(files).length + 3, 'marks x', SIZES.length, 'sizes');
