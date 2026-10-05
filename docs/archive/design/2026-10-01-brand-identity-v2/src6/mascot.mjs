// mascot.mjs — the approved app-icon mascot (sticker skin, #8B47B8 body, white sparkle eyes,
// deep purple #4A1F66 die-cut edge; Destin's picks, 2026-09-10), in ANY pose.
//
// WHY: Destin, round 5: "the defining characteristic of the mascot is really just the
// body/arm/leg proportions … the eyes and pose and such can change however, but you can't just
// start disregarding the shape." So nothing here redraws the character. It takes the rig library's
// sticker skin, recolours it exactly the way the shipped icon was made
// (docs/archive/design/2026-09-10-app-icon/generate/round4.mjs), and only ROTATES limbs about the
// rig's own pivots and swaps between the face kit's real faces — what the app itself does.
import fs from 'fs';
import { faceSet } from '/home/destin/youcoded-dev/wecoded-marketplace/wecoded-themes-plugin/skills/theme-builder/scripts/mascot-faces.mjs';

const LIB = '/home/destin/youcoded-dev/wecoded-themes/mascots';
const SKIN = fs.readFileSync(`${LIB}/skins/sticker.svg`, 'utf8');
export const ACC = '#8B47B8', LIGHT = '#B98AD6', SHADE = '#5E2A82', DEEP = '#4A1F66', W = '#FFFFFF';
const ink = (hex, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
const inner = (svg) => svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));

// Pivots and poses are the app's (scripts/promo/src/poses.ts, from mascot-poses.ts).
const PIV = { 'rig-arm-left': [2.5, 9], 'rig-arm-right': [21.5, 9], 'rig-leg-left': [8.95, 17], 'rig-leg-right': [15.05, 17] };
export const POSES = {
  idle: { arms: [0, 0], legs: [0, 0] }, welcome: { arms: [0, -160], legs: [0, 0] },
  shocked: { arms: [130, -130], legs: [-20, 20] }, peek: { arms: [-160, 160], legs: [0, 0] },
  tuck: { arms: [40, -40], legs: [-35, 35] }, cheer: { arms: [150, -150], legs: [0, 0] },
};

function group(svg, id) { // [start, end] of <g id=…>…</g>, depth-aware
  const m = new RegExp(`<g id="${id}"[^>]*?(/?)>`).exec(svg); if (!m) return null;
  if (m[1] === '/') return [m.index, m.index + m[0].length];
  const tag = /<g\b[^>]*?(\/?)>|<\/g>/g; tag.lastIndex = m.index + m[0].length; let d = 1, t;
  while (d && (t = tag.exec(svg))) { if (t[0] === '</g>') d--; else if (t[1] !== '/') d++; }
  return [m.index, tag.lastIndex];
}
const drop = (s, id) => { const r = group(s, id); return r ? s.slice(0, r[0]) + s.slice(r[1]) : s; };
const take = (s, id) => { const r = group(s, id); return r ? s.slice(r[0], r[1]) : ''; };

const FACE_KIT = { ink: ink(ACC, 0.32), spark: [W, W, W], catchlight: 'cluster', accent: ACC };
let uid = 0;

/**
 * Inner SVG markup on the rig's own grid (viewBox "-3 -5 30 30"; body spans x5–19, y4–16).
 * opts: pose name or {arms:[l,r], legs:[l,r]}; face (idle|welcome|curious|shocked|dizzy|blink|happy|shutdown);
 *       peek: show grip mittens and hide arms; parts: which of 'arms','legs','body' to keep;
 *       colors: {acc, light, shade, edge} to re-dress it; item/hat: component file names.
 */
export function mascot({ pose = 'idle', arms, legs, face = 'welcome', peek = false, parts = ['arms', 'legs', 'body'],
  colors = {}, item = null, hat = null } = {}) {
  const P = typeof pose === 'string' ? POSES[pose] : pose;
  const A = arms ?? P.arms, L = legs ?? P.legs;
  const c = { acc: ACC, light: LIGHT, shade: SHADE, edge: DEEP, ...colors };
  let s = inner(SKIN).replace(/<!--[\s\S]*?-->/g, '');
  for (const [a, b] of [['#f0a828', c.acc], ['#ffd268', c.light], ['#b8760f', c.shade]]) s = s.split(a).join(b);
  s = s.split('fill="#ffffff" stroke="#ffffff"').join(`fill="${c.edge}" stroke="${c.edge}"`);
  const peekL = take(s, 'rig-hand-peek-left').replace(' style="display:none"', ''), peekR = take(s, 'rig-hand-peek-right').replace(' style="display:none"', '');
  for (const g of ['idle', 'welcome', 'curious', 'shocked', 'dizzy', 'blink', 'happy', 'shutdown']) s = drop(s, 'rig-face-' + g);
  s = drop(drop(s, 'rig-hand-peek-right'), 'rig-hand-peek-left');
  // Faces come from the ONE face kit, recoloured like the shipped icon (white sparkle eyes).
  const faces = faceSet({ ...FACE_KIT, ink: c.faceInk ?? ink(c.acc, 0.32), accent: c.acc });
  s = s.replace('<g id="slot-eyewear"/>', `<g id="rig-face">${faces[face]}</g><g id="slot-eyewear"/>`);
  // Pose = rotations about the rig's pivots. Nothing is moved or resized.
  const rot = { 'rig-arm-left': A[0], 'rig-arm-right': A[1], 'rig-leg-left': L[0], 'rig-leg-right': L[1] };
  for (const [id, deg] of Object.entries(rot)) {
    const [x, y] = PIV[id];
    s = s.replace(new RegExp(`<g id="${id}"([^>]*)>`), (m, a) => `<g id="${id}"${a}${deg ? ` transform="rotate(${deg} ${x} ${y})"` : ''}>`);
  }
  if (peek) { s = drop(drop(s, 'rig-arm-left'), 'rig-arm-right'); s = s.replace('<g id="slot-hat"/>', `<g id="slot-hat"/>${peekL}${peekR}`); }
  if (!parts.includes('arms')) s = drop(drop(s, 'rig-arm-left'), 'rig-arm-right');
  if (!parts.includes('legs')) s = drop(drop(s, 'rig-leg-left'), 'rig-leg-right');
  if (item) s = s.replace('<g id="slot-item"/>', `<g id="slot-item">${inner(fs.readFileSync(`${LIB}/components/items/${item}.svg`, 'utf8'))}</g>`);
  if (hat) s = s.replace('<g id="slot-hat"/>', `<g id="slot-hat">${inner(fs.readFileSync(`${LIB}/components/hats/${hat}.svg`, 'utf8'))}</g>`);
  // Gradient ids made unique so many mascots can share one page.
  const u = 'm' + (++uid);
  s = s.replace(/id="(g-[a-z]+)"/g, `id="$1-${u}"`).replace(/url\(#(g-[a-z]+)\)/g, `url(#$1-${u})`);
  return s;
}

/** Place a mascot: body centre (12,10 on its grid) lands at (x,y), body width = w units, rotated r°. */
export const place = (m, x, y, w, r = 0) => { const k = w / 14; return `<g transform="translate(${x} ${y}) rotate(${r}) scale(${k}) translate(-12 -10)">${m}</g>`; };
