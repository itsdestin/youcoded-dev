// gen.mjs — writes the "Built by you" SVGs (mark, head, wordmark, app icon, installer box,
// tray glyphs) and rasterises them at true pixel sizes. The 16 and 24 px app/tray icons are
// drawn separately on the pixel grid, because the full five-part mascot turns to mush there.
import { writeFileSync, mkdirSync } from 'node:fs';
import { raster } from '../../rast.mjs';
import './geo.js';
const { C, rr, rrp, mascot, wordmark } = globalThis.BUILT;

const here = new URL('.', import.meta.url).pathname;
const SVG = here + 'svg/', PNG = here + 'png/';
mkdirSync(SVG, { recursive: true });
const svg = (vb, body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${extra}>${body}</svg>`;
const out = {};

// Mark + head + wordmark
out.mark = svg('0 1.6 24 22', mascot());
out['mark-ink'] = svg('0 1.6 24 22', mascot({ head: C.ink, arm: C.ink, foot: C.ink, eye: C.cream }));
out.head = svg('4 2.6 16 14.2', mascot({ show: ['head', 'face'] }));
const wm = wordmark();
out.wordmark = svg(wm.vb.join(' '), wm.inner);

// App icon (full art, used at 32 px and up)
const tile48 = (id) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8E55F5"/><stop offset="1" stop-color="${C.deep}"/></linearGradient></defs>
  <rect width="48" height="48" rx="11" fill="url(#${id})"/><rect x=".5" y=".5" width="47" height="47" rx="10.5" fill="none" stroke="#fff" stroke-opacity=".14"/>`;
const iconMascot = (dy = 0) => mascot({ head: C.cream, arm: C.tang, foot: C.tang, eye: C.ink });
out.icon = svg('0 0 48 48', tile48('ig') +
  `<g transform="translate(5.75 ${7.1}) scale(1.5)" opacity=".28"><g fill="#1a0b40">${mascot({ head: '#1a0b40', arm: '#1a0b40', foot: '#1a0b40', eye: '#1a0b40' })}</g></g>` +
  `<g transform="translate(5.75 5.6) scale(1.5)">${iconMascot()}</g>`);

// Pixel-grid small icons: head + feet only at 16, full mascot redrawn on whole pixels at 24.
const tileN = (n, rx, id) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8E55F5"/><stop offset="1" stop-color="${C.deep}"/></linearGradient></defs><rect width="${n}" height="${n}" rx="${rx}" fill="url(#${id})"/>`;
out['icon-px16'] = svg('0 0 16 16', tileN(16, 3.5, 'a') +
  `<path d="${rr(3, 3, 10, 8, 2.5)}" fill="${C.cream}"/><rect x="5" y="5" width="2" height="3" fill="${C.ink}"/><rect x="9" y="5" width="2" height="3" fill="${C.ink}"/>` +
  `<rect x="5" y="12" width="2" height="2" rx=".5" fill="${C.tang}"/><rect x="9" y="12" width="2" height="2" rx=".5" fill="${C.tang}"/>`);
out['icon-px24'] = svg('0 0 24 24', tileN(24, 5.5, 'b') +
  `<path d="${rr(5, 4, 14, 11, 3)}" fill="${C.cream}"/><rect x="8" y="7" width="2" height="4" rx=".8" fill="${C.ink}"/><rect x="14" y="7" width="2" height="4" rx=".8" fill="${C.ink}"/>` +
  `<rect x="2" y="8" width="2" height="4" rx=".8" fill="${C.tang}"/><rect x="20" y="8" width="2" height="4" rx=".8" fill="${C.tang}"/>` +
  `<rect x="8" y="16" width="3" height="4" rx=".9" fill="${C.tang}"/><rect x="13" y="16" width="3" height="4" rx=".9" fill="${C.tang}"/>`);

// Installer: a flat-pack box, purple tape, mascot printed on the front.
out.installer = svg('0 0 48 48', `
  <ellipse cx="24" cy="43.2" rx="17" ry="2.4" fill="${C.ink}" opacity=".16"/>
  <path d="M12 10.5L36 10.5L40.5 18.5L7.5 18.5Z" fill="#EDC28E"/>
  <path d="M12 10.5L24 10.5L24 18.5L7.5 18.5Z" fill="#F2CD9E"/>
  <path d="${rrp(7.5, 18.5, 33, 24, [0, 0, 1.6, 1.6])}" fill="${C.kraft}"/>
  <rect x="7.5" y="18.5" width="33" height="1.3" fill="#B98448"/>
  <path d="M21.3 10.5H26.7L27.4 18.5H20.6Z" fill="#9363F2"/>
  <rect x="20.6" y="18.5" width="6.8" height="6.2" fill="${C.purple}"/>
  <rect x="20.6" y="24.1" width="6.8" height=".6" fill="${C.deep}" opacity=".5"/>
  <g transform="translate(15.5 26.4) scale(.71)" opacity=".9">${mascot({ head: C.ink, arm: C.ink, foot: C.ink, eye: C.kraft })}</g>
  <path d="M10.5 24.5V21.6M9.4 22.7L10.5 21.5L11.6 22.7M13.4 24.5V21.6M12.3 22.7L13.4 21.5L14.5 22.7" stroke="${C.ink}" stroke-opacity=".55" stroke-width=".55" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);

// Tray: the head module alone, eyes punched through, on whole pixels.
const trayHead16 = (col, eyes = [[5, 5], [9, 5]], alert = false) => {
  const id = 'm' + col.slice(1) + eyes[0][0] + (alert ? 'a' : '');
  const cut = eyes.map(([x, y]) => `<rect x="${x}" y="${y}" width="2" height="5" fill="#000"/>`).join('') + (alert ? `<circle cx="13.5" cy="2.5" r="3.6" fill="#000"/>` : '');
  return `<defs><mask id="${id}"><rect width="16" height="16" fill="#fff"/>${cut}</mask></defs><path d="${rr(1, 2, 14, 12, 3.5)}" fill="${col}" mask="url(#${id})"/>` +
    (alert ? `<circle cx="13.5" cy="2.5" r="2.5" fill="${C.tang}"/>` : '');
};
const trayHead24 = (col) => `<defs><mask id="t24${col.slice(1)}"><rect width="24" height="24" fill="#fff"/><rect x="7" y="7" width="3" height="7" fill="#000"/><rect x="14" y="7" width="3" height="7" fill="#000"/></mask></defs><path d="${rr(2, 3, 20, 17, 5)}" fill="${col}" mask="url(#t24${col.slice(1)})"/>`;
for (const [n, col] of [['white', '#FFFFFF'], ['black', '#111111']]) {
  out[`tray-${n}`] = svg('0 0 16 16', trayHead16(col));
  out[`tray-${n}-left`] = svg('0 0 16 16', trayHead16(col, [[4, 5], [8, 5]]));
  out[`tray-${n}-right`] = svg('0 0 16 16', trayHead16(col, [[6, 5], [10, 5]]));
  out[`tray-${n}-alert`] = svg('0 0 16 16', trayHead16(col, undefined, true));
  out[`tray24-${n}`] = svg('0 0 24 24', trayHead24(col));
}

for (const [name, s] of Object.entries(out)) writeFileSync(SVG + name + '.svg', s);
for (const name of Object.keys(out)) raster(SVG + name + '.svg', PNG, name);
// The shipped small sizes ARE the pixel-grid drawings; keep the naive shrink for comparison.
raster(SVG + 'icon.svg', PNG, 'icon-naive', [16, 24]);
raster(SVG + 'icon-px16.svg', PNG, 'icon', [16]);
raster(SVG + 'icon-px24.svg', PNG, 'icon', [24]);
console.log('built: wrote', Object.keys(out).length, 'svgs');
