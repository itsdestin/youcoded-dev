// gen.mjs — "Say it" (bubble) territory: draws the mark, the custom monoline wordmark, the
// app + installer icons and the tray glyphs as SVG, then rasterises them at true pixel sizes.
// The mascot is designed on a 4-unit grid inside a 64 box, so at 16px every edge lands on a
// whole pixel — WHY: the tray icon must be crisp, not anti-aliased mush.
import { writeFileSync, mkdirSync } from 'node:fs';
import { raster } from '../../rast.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const SVG = HERE + 'svg/', PNG = HERE + 'png/';
mkdirSync(SVG, { recursive: true });

export const C = { grape: '#6B3AD6', grapeDeep: '#4A22A8', gum: '#FF8CC6', mint: '#7ADFC0', butter: '#FFE08A', paper: '#FFFCF6', ink: '#1C1730', white: '#FFFFFF' };

// ---- The mascot: a speech bubble whose tail is its foot (64-unit box) ----
const BODY = '<rect x="4" y="4" width="56" height="44" rx="18"/>';
const TAIL = '<path d="M8 36 L8 57 Q8 61.5 11.6 59 L30 46 Z"/><rect x="40" y="40" width="12" height="16" rx="5"/>';
const EYES = '<rect x="20" y="16" width="8" height="14" rx="4"/><rect x="36" y="16" width="8" height="14" rx="4"/>';
const DOTS = '<circle cx="20" cy="26" r="4.4"/><circle cx="32" cy="26" r="4.4"/><circle cx="44" cy="26" r="4.4"/>';
const CHECK = '<path d="M20 26 L28 33 L44 18" fill="none" stroke="black" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>';
const faces = { eyes: EYES, dots: DOTS, check: CHECK };

// Punched face (transparent), for one-colour uses: tray, print, favicon.
function mascotCut(fill, face = 'eyes', id = 'm') {
  const f = face === 'check' ? CHECK : `<g fill="black">${faces[face]}</g>`;
  return `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="white"/>${f}</mask></defs>
  <g fill="${fill}" mask="url(#${id})">${BODY}${TAIL}</g>`;
}
// Drawn face, for a tile where a hole would show the tile.
function mascotDrawn(fill, eyeFill, face = 'eyes') {
  const f = face === 'check' ? CHECK.replace('stroke="black"', `stroke="${eyeFill}"`) : `<g fill="${eyeFill}">${faces[face]}</g>`;
  return `<g fill="${fill}">${BODY}${TAIL}</g>${f}`;
}
const svg64 = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`;

// ---- The wordmark: monoline lowercase "youcoded", round caps, first "o" is the bubble ----
// x-height 40 (y 0..40), stroke 9. Letters are drawn as centre-lines; gaps tuned by eye.
const SW = 9;
const L = {
  y: { w: 26, d: 'M0 0 V20 A13 13 0 0 0 26 20 M26 0 V44 A14 14 0 0 1 12 58 H8' },
  ob: { w: 42, d: 'M21 0 A20 20 0 1 1 7.6 34.9 L2.5 42.5 L13.2 38.2 A20 20 0 0 1 21 0 Z', bubble: true },
  u: { w: 26, d: 'M0 0 V20 A13 13 0 0 0 26 20 M26 0 V40' },
  c: { w: 37, d: 'M35.5 6.5 A19.5 19.5 0 1 0 35.5 33.5' },
  o: { w: 40, d: 'M20 0 A20 20 0 1 1 20 40 A20 20 0 1 1 20 0 Z' },
  d: { w: 40, d: 'M20 0 A20 20 0 1 0 20 40 A20 20 0 1 0 20 0 Z M40 -26 V40' },
  e: { w: 40, d: 'M2 20 H40 A20 20 0 1 0 35 33.5' },
};
// Optical gaps between letters (centre-line to centre-line spacing beyond widths).
const SEQ = [['y', 0], ['ob', 13], ['u', 13], ['c', 14], ['o', 10], ['d', 13], ['e', 13], ['d', 13]];
export function wordmark(color, eyeColor) {
  let x = 0, parts = [];
  for (const [k, gap] of SEQ) {
    x += gap;
    const g = L[k];
    parts.push(`<path transform="translate(${x} 0)" d="${g.d}"/>`);
    if (g.bubble) parts.push(`<g transform="translate(${x} 0)" fill="${eyeColor || color}" stroke="none"><rect x="13" y="13" width="5" height="10" rx="2.5"/><rect x="24" y="13" width="5" height="10" rx="2.5"/></g>`);
    x += g.w;
  }
  const pad = SW / 2 + 1;
  const W = x + pad * 2, top = -26 - pad, H = 58 + 26 + pad * 2;
  return { w: W, h: H, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${top} ${W} ${H}"><g fill="none" stroke="${color}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</g></svg>` };
}

// ---- App icon: grape squircle, white bubble with grape eyes ----
function tile(inner, badge = false, small = false) {
  const b = badge ? `<g transform="translate(62 62)">
      <rect x="0" y="0" width="34" height="28" rx="11" fill="${C.mint}" stroke="${C.grapeDeep}" stroke-opacity=".25" stroke-width="1"/>
      <path d="M5 24 L5 33 L14 27 Z" fill="${C.mint}"/>
      <path d="M17 6.5 V19 M11.5 14 L17 19.5 L22.5 14" fill="none" stroke="${C.ink}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><linearGradient id="bg" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#8A5CF0"/><stop offset="1" stop-color="${C.grapeDeep}"/></linearGradient>
  <radialGradient id="gl" cx=".3" cy=".1" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
  <rect x="2" y="2" width="96" height="96" rx="24" fill="url(#bg)"/><rect x="2" y="2" width="96" height="96" rx="24" fill="url(#gl)"/>
  <g transform="${small ? 'translate(9 7) scale(1.28)' : 'translate(19 17) scale(0.97)'}">${inner}</g>${b}</svg>`;
}

const files = {
  'mark': svg64(mascotCut(C.grape, 'eyes', 'a')),
  'mark-ink': svg64(mascotCut(C.ink, 'eyes', 'b')),
  'mark-white': svg64(mascotCut(C.white, 'eyes', 'c')),
  'mark-dots': svg64(mascotCut(C.grape, 'dots', 'd')),
  'mark-check': svg64(mascotCut(C.grape, 'check', 'e')),
  'tray-white': svg64(mascotCut(C.white, 'eyes', 'f')),
  'tray-black': svg64(mascotCut('#111111', 'eyes', 'g')),
  'tray-white-dots': svg64(mascotCut(C.white, 'dots', 'h')),
  'tray-black-dots': svg64(mascotCut('#111111', 'dots', 'i')),
  'tray-white-check': svg64(mascotCut(C.white, 'check', 'j')),
  'tray-black-check': svg64(mascotCut('#111111', 'check', 'k')),
  'icon': tile(mascotDrawn(C.white, C.grape)),
  'installer': tile(mascotDrawn(C.white, C.grape), true),
  // WHY a second, fuller icon: at 16-32px the standard inset leaves a 9px mascot; a Windows
  // .ico carries one picture per size, so the small sizes get a mascot that fills the tile.
  'icon-sm': tile(mascotDrawn(C.white, C.grape), false, true),
  'installer-sm': tile(mascotDrawn(C.white, C.grape), true, true),
};
for (const [n, s] of Object.entries(files)) { writeFileSync(SVG + n + '.svg', s); raster(SVG + n + '.svg', PNG, n); }
for (const [n, col, eye] of [['wordmark', C.grape, C.grape], ['wordmark-ink', C.ink, C.ink], ['wordmark-white', C.white, C.white]]) {
  const w = wordmark(col, eye);
  writeFileSync(SVG + n + '.svg', w.svg);
}

// ---- Pixel-hinted tray glyphs ----
// WHY: a vector shrunk to 16px gets grey half-pixels on every curve. These are sampled per
// pixel from the same 64-unit geometry (4x4 supersampling, on at >=50% coverage), so every
// pixel is fully on or off and the glyph stays sharp next to the system's own icons.
function inRR(x, y, x0, y0, x1, y1, r) { if (x < x0 || x > x1 || y < y0 || y > y1) return false; const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; }
function inTri(x, y, [ax, ay], [bx, by], [cx, cy]) { const s = (px, py, qx, qy) => (qx - px) * (y - py) - (qy - py) * (x - px); const a = s(ax, ay, bx, by), b = s(bx, by, cx, cy), c = s(cx, cy, ax, ay); return (a >= 0 && b >= 0 && c >= 0) || (a <= 0 && b <= 0 && c <= 0); }
function segD(x, y, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - ax - t * dx, y - ay - t * dy); }
const body = (x, y) => inRR(x, y, 4, 4, 60, 48, 18) || inTri(x, y, [8, 36], [8, 60], [30, 46]) || inRR(x, y, 40, 40, 52, 56, 5);
const holes = {
  eyes: (x, y) => inRR(x, y, 20, 16, 28, 30, 4) || inRR(x, y, 36, 16, 44, 30, 4),
  dots: (x, y) => [20, 32, 44].some(cx => Math.abs(x - cx) <= 4.2 && y >= 21 && y <= 30),
  check: (x, y) => segD(x, y, 19, 26, 28, 34) <= 3.9 || segD(x, y, 28, 34, 45, 17) <= 3.9,
};
function pixelGlyph(px, color, face) {
  const u = 64 / px; let r = '';
  for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
    let on = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) { const x = (i + (sx + .5) / 4) * u, y = (j + (sy + .5) / 4) * u; if (body(x, y) && !holes[face](x, y)) on++; }
    if (on >= 8) r += `<rect x="${i}" y="${j}" width="1" height="1"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" shape-rendering="crispEdges"><g fill="${color}">${r}</g></svg>`;
}
for (const [col, hex] of [['white', '#FFFFFF'], ['black', '#111111']]) for (const [face, suf] of [['eyes', ''], ['dots', '-dots'], ['check', '-check']]) for (const px of [16, 20, 24, 32]) {
  const f = `${SVG}tray-${col}${suf}-px${px}.svg`; writeFileSync(f, pixelGlyph(px, hex, face)); raster(f, PNG, `tray-${col}${suf}`, [px]);
}
console.log('bubble: wrote', Object.keys(files).length + 3, 'svgs; wordmark', wordmark('#000').w.toFixed(1), 'x', wordmark('#000').h.toFixed(1));
