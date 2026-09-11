// Round 4: sticker skin, wave pose, smaller mascot; eyes from the ONE face source (mascot-faces.mjs).
import fs from 'fs'; import { execFileSync } from 'child_process';
import { faceSet } from '/home/destin/youcoded-dev/wecoded-marketplace/wecoded-themes-plugin/skills/theme-builder/scripts/mascot-faces.mjs';
const SKIN = fs.readFileSync('/home/destin/youcoded-dev/wecoded-themes/mascots/skins/sticker.svg', 'utf8');
const RUN = '/home/destin/youcoded-dev/worktrees/sessions/installer-rename-cleanup/docs/active/design/2026-09-10-app-icon/runs/today/shots-icons/light/';
const ACC = '#8B47B8', LIGHT = '#B98AD6', SHADE = '#5E2A82', TILE = '#E7D4EF', EDGE = '#D6C0E2', HI = '#F7F1FA', W = '#FFFFFF';
// The website's ink rule: a deep shade of the body colour (gen-hero-mascots.py ink_for); 0.32 is Destin's number.
const ink = (k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(ACC.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
const inner = (svg) => svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));
function dropGroup(svg, id) {
  const m = new RegExp(`<g id="${id}"[^>]*?(/?)>`).exec(svg);
  if (!m) return svg;
  if (m[1] === '/') return svg.slice(0, m.index) + svg.slice(m.index + m[0].length);
  const tag = /<g\b[^>]*?(\/?)>|<\/g>/g; tag.lastIndex = m.index + m[0].length;
  let depth = 1, t;
  while (depth && (t = tag.exec(svg))) { if (t[0] === '</g>') depth--; else if (t[1] !== '/') depth++; }
  return svg.slice(0, m.index) + svg.slice(tag.lastIndex);
}
function mascot(eyes, outline) {
  let s = inner(SKIN).replace(/<!--[\s\S]*?-->/g, '');
  for (const [a, b] of [['#f0a828', ACC], ['#ffd268', LIGHT], ['#b8760f', SHADE]]) s = s.split(a).join(b);
  // The die-cut border: every part's backing shape is fill+stroke white.
  const border = 'fill="#ffffff" stroke="#ffffff"';
  if (!s.includes(border)) throw new Error('sticker border markup not found');
  s = s.split(border).join(`fill="${outline}" stroke="${outline}"`);
  for (const g of ['idle', 'welcome', 'curious', 'shocked', 'dizzy', 'blink', 'happy', 'shutdown']) s = dropGroup(s, 'rig-face-' + g);
  for (const g of ['rig-hand-peek-right', 'rig-hand-peek-left']) s = dropGroup(s, g);
  if (/rig-face-|rig-hand-peek/.test(s)) throw new Error('a face or peek hand survived');
  s = s.replace('<g id="slot-eyewear"/>', `<g id="rig-face-welcome">${faceSet({ accent: ACC, ...eyes }).welcome}</g><g id="slot-eyewear"/>`);
  // POSES.welcome (mascot-poses.ts): right arm rotate -160 about its data-pivot.
  const arm = '<g id="rig-arm-right" data-pivot="21.5 9">';
  if (!s.includes(arm)) throw new Error('right arm not found');
  return s.replace(arm, '<g id="rig-arm-right" data-pivot="21.5 9" transform="rotate(-160 21.5 9)">');
}
const icon = (art) => {
  const k = 1.55, tx = 24 - 12 * k, ty = 24.5 - 12.4 * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect x="0.3" y="0.3" width="47.4" height="47.4" rx="15.3" fill="${TILE}" stroke="${EDGE}" stroke-width="0.6"/><path d="M16.5 1.3 H31.5" stroke="${HI}" stroke-width="0.6" stroke-opacity="0.7" stroke-linecap="round"/><g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k})">${art}</g></svg>`;
};
const EYES = {
  today: { ink: ink(0.32), spark: [ACC, ACC, ACC], catchlight: 'cluster' },
  white: { ink: ink(0.32), spark: [W, W, W], catchlight: 'cluster' },
  pair:  { ink: ink(0.55), spark: [W, W], sparkOpacity: [0.95, 0.85], catchlight: 'pair' },
  rim:   { ink: ink(0.32), rim: TILE, rimW: 0.3, spark: [W, W], sparkOpacity: [0.95, 0.85], catchlight: 'pair' },
};
const OUTLINE = { white: W, pale: HI, lilac: '#C9A2E3', deep: '#4A1F66' };
const variants = {};
for (const [k, e] of Object.entries(EYES)) variants[`r4-eyes-${k}`] = icon(mascot(e, W));
for (const [k, o] of Object.entries(OUTLINE)) variants[`r4-outline-${k}`] = icon(mascot(EYES.white, o));
for (const [name, svg] of Object.entries(variants)) {
  fs.writeFileSync(name + '.svg', svg);
  for (const px of ['256', '48', '32', '16']) execFileSync('rsvg-convert', ['-w', px, '-h', px, name + '.svg', '-o', `${name}-${px}.png`]);
  execFileSync('magick', ['-size', '800x330', 'xc:#F3F3F3', '-fill', '#202020', '-draw', 'rectangle 400,0 800,330',
    `${name}-256.png`, '-geometry', '+24+24', '-composite', `${name}-48.png`, '-geometry', '+300+40', '-composite', `${name}-32.png`, '-geometry', '+308+110', '-composite', `${name}-16.png`, '-geometry', '+316+170', '-composite',
    `${name}-256.png`, '-geometry', '+424+24', '-composite', `${name}-48.png`, '-geometry', '+700+40', '-composite', `${name}-32.png`, '-geometry', '+708+110', '-composite', `${name}-16.png`, '-geometry', '+716+170', '-composite',
    RUN + name + '.png']);
}
execFileSync('magick', [...Object.keys(variants).map((n) => RUN + n + '.png'), '-append', 'check-r4.png']);
console.log('rendered', Object.keys(variants).join(' '), 'ink.55=', ink(0.55));
