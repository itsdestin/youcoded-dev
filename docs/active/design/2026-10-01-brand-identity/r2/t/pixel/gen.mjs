// gen.mjs — territory "pixel" (Choose Your Player). Every mark is drawn pixel by pixel on a
// grid (12, 16, 24, 32) and written as crisp SVG, then rasterised at sizes that are WHOLE
// multiples of its grid. WHY: the territory's promise is that the tray and taskbar icons are
// pixel-perfect by construction — no size is ever a blurred shrink of a bigger drawing.
import { writeFileSync, mkdirSync } from 'node:fs';
import { raster } from '../../rast.mjs';

const HERE = new URL('./', import.meta.url).pathname;
const SVG = HERE + 'svg/', PNG = HERE + 'png/';
mkdirSync(SVG, { recursive: true }); mkdirSync(PNG, { recursive: true });

// ---------- grid primitives ----------
const G = (w, h) => Array.from({ length: h }, () => Array(w).fill(null));
const fill = (g, x0, y0, x1, y1, k) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y] && x >= 0 && x < g[0].length) g[y][x] = k; };
// Rounded rect by per-row insets from the top and bottom (pixel-art corners).
function rrect(g, x0, y0, x1, y1, k, top = [], bot = top) {
  for (let y = y0; y <= y1; y++) {
    const i = y - y0 < top.length ? top[y - y0] : (y1 - y < bot.length ? bot[y1 - y] : 0);
    fill(g, x0 + i, y, x1 - i, y, k);
  }
}
const dot = (g, pts, k) => pts.forEach(([x, y]) => { if (g[y] && x >= 0 && x < g[0].length) g[y][x] = k; });
const BODY = new Set(['b', 'l', 's', 'h']);
// Light on the top edge, shadow on the bottom two rows and right edge — only body cells.
function shade(g) {
  const src = g.map(r => r.slice());
  const isB = (x, y) => src[y] && BODY.has(src[y][x]);
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
    if (src[y][x] !== 'b') continue;
    if (!isB(x, y - 1)) g[y][x] = 'l';
    else if (!isB(x, y + 1) || !isB(x, y + 2) || !isB(x + 1, y)) g[y][x] = 's';
  }
}
// A 1px outline around everything drawn (4-neighbour, the clean pixel-art convention).
function outline(g, k = 'o') {
  const src = g.map(r => r.slice());
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
    if (src[y][x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => src[y + dy]?.[x + dx])) g[y][x] = k;
  }
}
const stamp = (dst, src, ox, oy) => src.forEach((r, y) => r.forEach((k, x) => { if (k && dst[y + oy] && x + ox < dst[0].length) dst[y + oy][x + ox] = k; }));
// SVG with one <rect> per horizontal run of a colour.
function toSVG(g, pal, { bg = null, opacity = {} } = {}) {
  const h = g.length, w = g[0].length;
  let out = '';
  if (bg) out += `<rect width="${w}" height="${h}" fill="${bg}"/>`;
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const k = g[y][x];
      if (!k || !pal[k]) { x++; continue; }
      let e = x; while (e + 1 < w && g[y][e + 1] === k) e++;
      out += `<rect x="${x}" y="${y}" width="${e - x + 1}" height="1" fill="${pal[k]}"${opacity[k] ? ` fill-opacity="${opacity[k]}"` : ''}/>`;
      x = e + 1;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">${out}</svg>`;
}
const save = (name, svg) => { writeFileSync(SVG + name + '.svg', svg); return SVG + name + '.svg'; };

// ---------- palette ----------
export const P = {
  night: '#120E2A', deep: '#1E1747', dusk: '#2A1F66', rim: '#4B3A9E',
  volt: '#A970FF', voltL: '#CBA9FF', voltS: '#7A4BE0', voltO: '#2A1660',
  lime: '#C6FF4D', pink: '#FF6AD5', paper: '#F6F3EC', ink: '#15122B',
};

// ---------- the mascot, at four grids ----------
// 32: the full-detail player (posters, hero, skins). Accessories draw in rows 0-4.
function s32(acc) {
  const g = G(32, 32);
  rrect(g, 6, 5, 25, 20, 'b', [3, 1, 1], [3, 1, 1]);        // head
  rrect(g, 1, 12, 4, 17, 'b', [1], [1]);                      // left arm
  rrect(g, 27, 12, 30, 17, 'b', [1], [1]);                    // right arm
  rrect(g, 9, 22, 13, 26, 'b', [], [1]);                      // feet
  rrect(g, 18, 22, 22, 26, 'b', [], [1]);
  shade(g);
  dot(g, [[8, 8], [9, 8], [8, 9]], 'h');                      // specular
  fill(g, 11, 11, 12, 14, 'e'); fill(g, 19, 11, 20, 14, 'e'); // eyes
  dot(g, [[11, 11], [19, 11]], 'w');                          // eye sparkle
  fill(g, 8, 16, 9, 16, 'c'); fill(g, 22, 16, 23, 16, 'c');   // cheeks
  dot(g, [[14, 15], [17, 15], [15, 16], [16, 16]], 'm');      // smile
  if (acc) acc(g);
  outline(g);
  return g;
}
// 24: the app-icon player (sits inside the 32 tile).
function s24() {
  const g = G(24, 24);
  rrect(g, 5, 3, 18, 14, 'b', [2, 1], [2, 1]);
  rrect(g, 1, 8, 3, 12, 'b', [1], [1]);
  rrect(g, 20, 8, 22, 12, 'b', [1], [1]);
  rrect(g, 7, 16, 10, 19, 'b', [], [1]);
  rrect(g, 13, 16, 16, 19, 'b', [], [1]);
  shade(g);
  dot(g, [[7, 5], [6, 6]], 'h');
  fill(g, 8, 7, 9, 10, 'e'); fill(g, 14, 7, 15, 10, 'e');
  dot(g, [[8, 7], [14, 7]], 'w');
  dot(g, [[6, 12], [17, 12]], 'c');
  dot(g, [[10, 12], [13, 12], [11, 13], [12, 13]], 'm');
  outline(g);
  return g;
}
// 16: the tray sprite. Flat silhouette, eyes are holes — works in one colour.
// pose: idle | blink | bob | wave
function s16(pose = 'idle', k = 'b') {
  const g = G(16, 16);
  const up = pose === 'bob' ? -1 : 0;
  rrect(g, 3, 2 + up, 12, 9 + up, k, [1], [1]);               // head 10x8
  rrect(g, 0, 5 + up, 1, 7 + up, k);                          // left arm
  if (pose === 'wave') rrect(g, 14, 2, 15, 4, k); else rrect(g, 14, 5 + up, 15, 7 + up, k);
  fill(g, 5, 11, 6, 13, k); fill(g, 9, 11, 10, 13, k);        // feet stay planted
  if (pose === 'blink') dot(g, [[5, 6 + up], [10, 6 + up]], null);
  else fill(g, 5, 5 + up, 5, 6 + up, null), fill(g, 10, 5 + up, 10, 6 + up, null);
  return g;
}
// 12: the 16px app icon's player.
function s12() {
  const g = G(12, 12);
  rrect(g, 2, 2, 9, 7, 'b', [1], [1]);
  fill(g, 0, 4, 0, 5, 'b'); fill(g, 11, 4, 11, 5, 'b');
  fill(g, 3, 9, 4, 10, 'b'); fill(g, 7, 9, 8, 10, 'b');
  fill(g, 4, 4, 4, 5, 'e'); fill(g, 7, 4, 7, 5, 'e');
  return g;
}

const VOLT = { b: P.volt, l: P.voltL, s: P.voltS, h: '#EEE3FF', o: P.voltO, e: '#1A1036', w: '#FFFFFF', c: P.pink, m: P.voltO };

// ---------- skins (each is a palette + an optional accessory) ----------
const ears = (inner) => (g) => {
  rrect(g, 7, 1, 10, 4, 'a', [2, 1, 0, 0]); rrect(g, 21, 1, 24, 4, 'a', [2, 1, 0, 0]);
  dot(g, [[8, 1], [8, 2], [9, 3], [8, 3]], null); dot(g, [[23, 1], [23, 2], [22, 3], [23, 3]], null);
  fill(g, 7, 1, 7, 4, 'a'); fill(g, 24, 1, 24, 4, 'a'); fill(g, 8, 2, 8, 4, 'a'); fill(g, 23, 2, 23, 4, 'a');
  if (inner) dot(g, [[8, 3], [8, 4], [23, 3], [23, 4]], 'A');
};
const sprout = (g) => { fill(g, 15, 1, 15, 4, 'a'); fill(g, 16, 0, 19, 1, 'A'); dot(g, [[12, 1], [13, 1], [14, 2]], 'A'); };
const antenna = (g) => { fill(g, 15, 2, 16, 4, 'a'); fill(g, 14, 0, 17, 1, 'A'); };
const visor = (g) => { rrect(g, 8, 10, 23, 15, 'v', [1], [1]); fill(g, 10, 11, 14, 11, 'V'); fill(g, 9, 12, 9, 12, 'V'); };
const shades = (g) => { fill(g, 9, 11, 14, 14, 'v'); fill(g, 17, 11, 22, 14, 'v'); fill(g, 15, 11, 16, 11, 'v'); dot(g, [[10, 12], [18, 12], [11, 11], [19, 11]], 'V'); };
const crown = (g) => { fill(g, 11, 2, 20, 4, 'a'); dot(g, [[11, 0], [11, 1], [15, 0], [16, 0], [15, 1], [16, 1], [20, 0], [20, 1]], 'a'); dot(g, [[13, 3], [18, 3]], 'A'); };

export const SKINS = [
  { id: 'volt', name: 'Volt', tag: 'DEFAULT', bg: '#2A1F66', pal: VOLT },
  { id: 'sunbreak', name: 'Sunbreak', tag: 'INSTALLED', bg: '#FFD97A', acc: shades,
    pal: { b: '#FFB52E', l: '#FFDA7A', s: '#E8801C', h: '#FFF4CC', o: '#5A2A00', e: '#3A1A00', w: '#fff', c: '#FF6A3D', m: '#5A2A00', v: '#2A1A10', V: '#FFFFFF' } },
  { id: 'matcha', name: 'Matcha', tag: 'COMMUNITY', bg: '#D9F2C4', acc: sprout,
    pal: { b: '#8BD46A', l: '#BDF09A', s: '#4F9E45', h: '#EFFFE0', o: '#1E3D1A', e: '#1E3D1A', w: '#fff', c: '#FF8FA3', m: '#1E3D1A', a: '#4F9E45', A: '#6BD15A' } },
  { id: 'kitty', name: 'Strawberry Kitty', tag: 'COMMUNITY', bg: '#FFD3E1', acc: ears(true),
    pal: { b: '#FFF1F5', l: '#FFFFFF', s: '#F4AFC5', h: '#FFFFFF', o: '#5A1F35', e: '#5A1F35', w: '#fff', c: '#FF5C8A', m: '#5A1F35', a: '#FFF1F5', A: '#FF8FB1' } },
  { id: 'visor', name: 'Midnight Visor', tag: 'NEW', bg: '#0B1030', acc: visor,
    pal: { b: '#3149A0', l: '#5876D6', s: '#1E2C6B', h: '#9DB2FF', o: '#060A1E', e: '#060A1E', w: '#fff', c: '#3149A0', m: '#060A1E', v: '#22E3FF', V: '#D6FBFF' } },
  { id: 'chrome', name: 'Chrome', tag: 'COMMUNITY', bg: '#C9D0DB', acc: antenna,
    pal: { b: '#B9C0CC', l: '#EEF1F6', s: '#7D8696', h: '#FFFFFF', o: '#232833', e: '#14E0C2', w: '#fff', c: '#B9C0CC', m: '#232833', a: '#7D8696', A: '#FF4D5E' } },
  { id: 'pocket', name: 'Pocket', tag: 'RETRO', bg: '#9BBC0F',
    pal: { b: '#8BAC0F', l: '#9BBC0F', s: '#306230', h: '#C4E05A', o: '#0F380F', e: '#0F380F', w: '#9BBC0F', c: '#306230', m: '#0F380F' } },
  { id: 'royal', name: 'Royal', tag: 'RARE', bg: '#3B0E3A', acc: crown,
    pal: { b: '#E04FB2', l: '#FF8AD4', s: '#A62A82', h: '#FFD1EF', o: '#2A0626', e: '#2A0626', w: '#fff', c: '#FFC94D', m: '#2A0626', a: '#FFC94D', A: '#22E3FF' } },
];

// ---------- wordmark: custom pixel lettering, 2px strokes, cap height 11 ----------
const GLY = {
  Y: ['XX......XX', 'XX......XX', 'XXX....XXX', '.XXX..XXX.', '..XXXXXX..', '...XXXX...', '....XX....', '....XX....', '....XX....', '....XX....', '....XX....'],
  o: ['', '', '', '.XXXXXX.', 'XXXXXXXX', 'XX....XX', 'XX....XX', 'XX....XX', 'XX....XX', 'XXXXXXXX', '.XXXXXX.'],
  u: ['', '', '', 'XX....XX', 'XX....XX', 'XX....XX', 'XX....XX', 'XX....XX', 'XX....XX', 'XXXXXXXX', '.XXXXXXX'],
  C: ['..XXXXXXX', '.XXXXXXXX', 'XXX......', 'XX.......', 'XX.......', 'XX.......', 'XX.......', 'XX.......', 'XXX......', '.XXXXXXXX', '..XXXXXXX'],
  d: ['......XX', '......XX', '......XX', '.XXXXXXX', 'XXXXXXXX', 'XX....XX', 'XX....XX', 'XX....XX', 'XX....XX', 'XXXXXXXX', '.XXXXXXX'],
  e: ['', '', '', '.XXXXXX.', 'XXXXXXXX', 'XX....XX', 'XX....XX', 'XXXXXXXX', 'XX......', 'XXXXXXXX', '.XXXXXX.'],
};
function wordmark({ you, coded, shadow }) {
  const word = 'YouCoded', gap = 2;
  const widths = [...word].map(ch => Math.max(...GLY[ch].map(r => r.length)));
  const W = widths.reduce((a, b) => a + b, 0) + gap * (word.length - 1) + 1, H = 12;
  const g = G(W, H), sh = G(W, H);
  let x = 0;
  [...word].forEach((ch, i) => {
    GLY[ch].forEach((row, y) => [...row].forEach((c, dx) => { if (c === 'X') { g[y][x + dx] = i < 3 ? 'y' : 'c'; sh[y + 1][x + dx + 1] = 'd'; } }));
    x += widths[i] + gap;
  });
  const out = G(W, H);
  if (shadow) stamp(out, sh, 0, 0);
  stamp(out, g, 0, 0);
  return toSVG(out, { y: you, c: coded, d: shadow });
}
// A one-colour wordmark — the restrained form for technical pages.
save('wordmark-dark', wordmark({ you: P.volt, coded: '#FFFFFF', shadow: P.dusk }));
save('wordmark-night-lime', wordmark({ you: P.volt, coded: '#FFFFFF', shadow: '#3B2A86' }));
save('wordmark-light', wordmark({ you: '#7A3FF2', coded: P.ink, shadow: null }));
save('wordmark-light-shadow', wordmark({ you: '#7A3FF2', coded: P.ink, shadow: P.lime }));
save('wordmark-ink', wordmark({ you: P.ink, coded: P.ink, shadow: null }));

// ---------- sprites ----------
save('sprite32', toSVG(s32(), VOLT));
for (const sk of SKINS) save('skin-' + sk.id, toSVG(s32(sk.acc), sk.pal));
save('sprite24', toSVG(s24(), VOLT));
const MONO = (c) => ({ b: c });
for (const pose of ['idle', 'blink', 'bob', 'wave']) {
  save(`tray-${pose}-white`, toSVG(s16(pose), MONO('#FFFFFF')));
  save(`tray-${pose}-black`, toSVG(s16(pose), MONO('#111111')));
  save(`sprite16-${pose}`, toSVG(s16(pose), MONO(P.volt)));
}
// "Needs you": idle + a one-pixel-square badge top-right (same colour, so it survives mono).
for (const [n, c] of [['white', '#FFFFFF'], ['black', '#111111']]) {
  // WHY 2x2 and one pixel in from the edge: a corner pixel is the first thing an OS
  // rounds or clips away, and the badge must not touch the arm (rows 5-7) or the head.
  const g = s16('idle'); fill(g, 13, 1, 14, 2, 'b');
  save(`tray-alert-${n}`, toSVG(g, MONO(c)));
}
// 24-grid mono for high-res panels: the s24 body without outline, eyes as holes.
{
  const g = s24().map(r => r.map(k => (k && k !== 'o' && k !== 'e' && k !== 'w' && k !== 'm' && k !== 'c') ? 'b' : (k === 'c' || k === 'm' ? 'b' : null)));
  save('tray24-white', toSVG(g, MONO('#FFFFFF'))); save('tray24-black', toSVG(g, MONO('#111111')));
}

// ---------- app icon: the whole thing is pixel art, tile included ----------
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
function tile(n, insets) {
  const g = G(n, n);
  rrect(g, 0, 0, n - 1, n - 1, 't', insets, insets);
  // Ordered-dither the tile from dusk (top) to night (bottom): a gradient made of pixels.
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (g[y][x] === 't') {
    // WHY only the lower half: a full-height dither read as noise behind the player.
    const v = (y - n * 0.62) / (n * 0.36);
    // ...and none below 32px, where a dither is only noise.
    if (n >= 32) g[y][x] = v > (BAYER[y % 4][x % 4] + .5) / 16 ? 'n' : 't';
  }
  // A lighter rim on the top edge so the tile separates from a dark taskbar.
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) if (g[y][x]) { g[y][x] = 'r'; break; }
  return g;
}
const TILEPAL = { ...VOLT, t: P.dusk, n: P.night, r: P.rim, z: P.lime, q: P.pink, gs: '#08061A' };
{
  const g = tile(32, [4, 2, 1, 1]);
  fill(g, 8, 26, 23, 26, 'gs'); fill(g, 10, 27, 21, 27, 'gs');            // ground shadow
  stamp(g, s24(), 4, 5);
  // No stars: at 32px a single coloured pixel reads as a speck of dirt, not a star.
  // WHY 'gs' needs a pal entry with a two-letter key: toSVG looks keys up directly.
  const svg = toSVG(g, { ...TILEPAL, gs: '#08061A' });
  raster(save('icon32', svg), PNG, 'icon', [32, 64, 128, 256, 512]);
}
{
  const g = tile(24, [3, 1, 1]);
  const sp = s16('idle', 'b'); fill(sp, 5, 5, 5, 6, 'e'); fill(sp, 10, 5, 10, 6, 'e');
  stamp(g, sp, 4, 3);
  raster(save('icon24', toSVG(g, TILEPAL)), PNG, 'icon', [24, 48]);
}
{
  const g = tile(16, [2, 1]);
  stamp(g, s12(), 2, 2);
  raster(save('icon16', toSVG(g, TILEPAL)), PNG, 'icon', [16]);
}

// ---------- installer: a game cartridge with the player on its label ----------
function cart32() {
  const g = G(32, 32);
  rrect(g, 4, 1, 27, 30, 'k', [1], [2, 1]);
  // Notched top-right corner, the cartridge's tell.
  dot(g, [[27, 1], [26, 1], [27, 2]], null);
  fill(g, 6, 2, 24, 2, 'K');                                   // top bevel
  for (let x = 7; x <= 24; x += 2) fill(g, x, 3, x, 4, 'R');   // grip ridges
  rrect(g, 7, 7, 24, 22, 'L', [1], [1]);                       // label
  fill(g, 7, 8, 24, 9, 'S');                                   // label stripe
  const p = s12(); stamp(g, p.map(r => r.map(k => k === 'b' ? 'b' : k === 'e' ? 'e' : null)), 10, 11);
  // "insert" arrow, embossed
  fill(g, 15, 24, 16, 26, 'R'); fill(g, 13, 26, 18, 26, 'R'); fill(g, 14, 27, 17, 27, 'R'); fill(g, 15, 28, 16, 28, 'R');
  for (let x = 8; x <= 23; x += 2) dot(g, [[x, 30]], 'G');     // gold contacts
  outline(g);
  return g;
}
const CARTPAL = { k: P.rim, K: '#7B68E0', R: P.dusk, L: P.lime, S: P.volt, b: P.volt, e: '#1A1036', G: '#FFC94D', o: P.night };
raster(save('installer32', toSVG(cart32(), CARTPAL)), PNG, 'installer', [32, 64, 128, 256, 512]);
{
  const g = G(16, 16);
  rrect(g, 2, 0, 13, 15, 'k', [], [1]); dot(g, [[13, 0]], null);
  rrect(g, 4, 3, 11, 10, 'L', [1], [1]);
  fill(g, 5, 6, 5, 7, 'b'); fill(g, 10, 6, 10, 7, 'b'); fill(g, 6, 5, 9, 8, 'b');
  fill(g, 6, 6, 6, 7, 'e'); fill(g, 9, 6, 9, 7, 'e');
  fill(g, 7, 12, 8, 13, 'R');
  for (let x = 3; x <= 12; x += 2) dot(g, [[x, 15]], 'G');
  raster(save('installer16', toSVG(g, CARTPAL)), PNG, 'installer', [16, 24]);
}

// ---------- true-size rasters for staging ----------
for (const pose of ['idle', 'blink', 'bob', 'wave', 'alert'])
  for (const c of ['white', 'black']) raster(SVG + `tray-${pose}-${c}.svg`, PNG, `tray-${pose}-${c}`, [16]);
raster(SVG + 'tray24-white.svg', PNG, 'tray24-white', [24]);
raster(SVG + 'tray24-black.svg', PNG, 'tray24-black', [24]);
console.log('pixel: ok');
