// Final picks (Destin, rounds 2-4): waving sticker mascot, white-sparkle eyes, deep purple outline,
// lavender tile. Reuses round4.mjs's mascot() so the finals are byte-for-byte the approved drawing.
import fs from 'fs'; import { execFileSync } from 'child_process';
const src = fs.readFileSync('round4.mjs', 'utf8');
const lib = src.slice(0, src.indexOf('const EYES = {')) + src.slice(src.indexOf('const EYES = {'), src.indexOf('const OUTLINE = {'))
  + 'export { mascot, EYES, TILE, EDGE, HI, ACC, W };';
fs.writeFileSync('r4lib.mjs', lib);
const { mascot, EYES, TILE, EDGE, HI, ACC, W } = await import('./r4lib.mjs');
const DEEP = '#4A1F66';
const art = mascot(EYES.white, DEEP);
const tile = `<rect x="0.3" y="0.3" width="47.4" height="47.4" rx="15.3" fill="${TILE}" stroke="${EDGE}" stroke-width="0.6"/><path d="M16.5 1.3 H31.5" stroke="${HI}" stroke-width="0.6" stroke-opacity="0.7" stroke-linecap="round"/>`;
const place = (k, cy) => `translate(${(24 - 12 * k).toFixed(2)} ${(cy - 12.4 * k).toFixed(2)}) scale(${k})`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">${body}</svg>`;
const app = `${tile}<g transform="${place(1.55, 24.5)}">${art}</g>`;
const out = {
  'final-app': svg(app),
  // Mac: Apple's grid, tile at ~80% of the canvas.
  'final-app-mac': svg(`<g transform="translate(4.69 4.69) scale(0.8047)">${app}</g>`),
  // Installer "strip": mascot raised and smaller so its feet clear the band; band + white arrow.
  'final-installer': svg(`<clipPath id="c"><rect x="0.3" y="0.3" width="47.4" height="47.4" rx="15.3"/></clipPath>${tile}`
    + `<g transform="${place(1.22, 18.6)}">${art}</g>`
    + `<g clip-path="url(#c)"><rect x="0" y="35" width="48" height="13" fill="${ACC}"/><path d="M24 37 V45 M20.3 41.6 L24 45.3 L27.7 41.6" stroke="${W}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>`
    + `<rect x="0.3" y="0.3" width="47.4" height="47.4" rx="15.3" fill="none" stroke="${EDGE}" stroke-width="0.6"/>`),
};
for (const [n, s] of Object.entries(out)) {
  fs.writeFileSync(n + '.svg', s);
  for (const px of ['1024', '256', '48', '32', '24', '16']) execFileSync('rsvg-convert', ['-w', px, '-h', px, n + '.svg', '-o', `${n}-${px}.png`]);
}
for (const bg of ['#F3F3F3', '#202020']) {
  const tag = bg === '#202020' ? 'dark' : 'light';
  const args = ['-size', '980x300', 'xc:' + bg]; let x = 16;
  for (const n of Object.keys(out)) {
    args.push(`${n}-256.png`, '-geometry', `+${x}+22`, '-composite', `${n}-48.png`, '-geometry', `+${x + 262}+30`, '-composite',
      `${n}-32.png`, '-geometry', `+${x + 270}+100`, '-composite', `${n}-16.png`, '-geometry', `+${x + 278}+160`, '-composite');
    x += 326;
  }
  execFileSync('magick', [...args, `final-${tag}.png`]);
}
execFileSync('magick', ['final-light.png', 'final-dark.png', '-append', 'final-sheet.png']);
console.log('final set rendered');
