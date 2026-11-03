#!/usr/bin/env node
// Regenerates ./sample-run: a small made-up run (hand-drawn stand-in pictures + a changes.json in
// the FORMAT.md shape) so the viewer can be developed and tested without a real recorder run.
// Usage: node scripts/shoot/what-changed/viewer/make-sample.mjs
import zlib from 'node:zlib';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sample-run');
const SCALE = 1.5, CW = 480, CH = 300, W = CW * SCALE, H = CH * SCALE;

function png(w, h, rgba) {
  const crcTable = (t, n) => { for (n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; };
  const T = crcTable([]);
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
class Canvas {
  constructor(bg) { this.px = new Uint8Array(W * H * 4); this.rect(0, 0, CW, CH, bg); }
  // Rectangles are given in CSS px, like the real boxes.
  rect(x, y, w, h, color, alpha = 1) {
    const [r, g, b] = hex(color);
    for (let yy = Math.floor(y * SCALE); yy < Math.min(H, Math.ceil((y + h) * SCALE)); yy++) for (let xx = Math.floor(x * SCALE); xx < Math.min(W, Math.ceil((x + w) * SCALE)); xx++) {
      const i = (yy * W + xx) * 4; this.px[i] = this.px[i] * (1 - alpha) + r * alpha; this.px[i + 1] = this.px[i + 1] * (1 - alpha) + g * alpha; this.px[i + 2] = this.px[i + 2] * (1 - alpha) + b * alpha; this.px[i + 3] = 255;
    }
  }
  // Fake text: a row of word-sized bars.
  text(x, y, chars, color) { let cx = x; for (const n of String(chars).split(' ')) { const w = n.length * 6; this.rect(cx, y, w, 8, color, .8); cx += w + 5; } }
  button(x, y, w, label, fill, ink) { this.rect(x, y, w, 32, fill); this.text(x + 12, y + 12, label, ink); }
  save(file) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, png(W, H, this.px)); }
}
const THEMES = {
  'meadow-mist': { bg: '#eef3ec', panel: '#ffffff', ink: '#2a3a2c', acc: '#4f8f5b', onAcc: '#ffffff', line: '#cfdccc' },
  'halftone-dimension': { bg: '#1c1d24', panel: '#272935', ink: '#e8e8f0', acc: '#7c7cff', onAcc: '#101018', line: '#3a3c4c' },
};
function frame(t, title) {
  const c = new Canvas(t.bg);
  c.rect(0, 0, 120, CH, t.panel); c.rect(120, 0, 1, CH, t.line);
  for (let i = 0; i < 5; i++) c.text(14, 20 + i * 24, 'menu item', t.ink);
  c.text(140, 18, title, t.ink); c.rect(140, 36, CW - 160, 1, t.line);
  return c;
}

const run = [];
const rm = (rel) => path.join(OUT, rel);
rmSync(OUT, { recursive: true, force: true });
const themes = Object.keys(THEMES);
const screens = [];
const add = (name, theme, status, extra = {}) => screens.push({ name, theme, status, scale: SCALE, ...extra });
const file = (side, name, theme) => `${side}/${name}/${theme}.png`;
const shoot = (name, theme, side, draw) => { const c = frame(THEMES[theme], name.split('/')[1]); draw(c, THEMES[theme]); c.save(rm(file(side, name, theme))); };

for (const theme of themes) {
  // settings/about: reworded button, a new button, a restyled link, plus an icon nobody can name.
  const aboutOld = (c, t) => { c.text(140, 52, 'YouCoded version 1.3.3', t.ink); c.button(140, 80, 148, 'Check for updates', t.acc, t.onAcc); c.text(140, 130, 'Release notes', t.acc); c.rect(420, 50, 32, 32, t.line); c.text(140, 160, 'Made with care', t.ink); };
  const aboutNew = (c, t) => { c.text(140, 52, 'YouCoded version 1.4.0', t.ink); c.button(140, 80, 130, 'Look for updates', t.acc, t.onAcc); c.button(284, 80, 110, 'Copy details', t.panel, t.ink); c.text(140, 130, 'Release notes', t.ink); c.rect(420, 50, 32, 32, t.acc); c.text(140, 160, 'Made with care', t.ink); };
  shoot('settings/about', theme, 'before', aboutOld); shoot('settings/about', theme, 'after', aboutNew);
  add('settings/about', theme, 'changed', { before: file('before', 'settings/about', theme), after: file('after', 'settings/about', theme), mask: 'diff/settings/about/' + theme + '.mask.png', changes: [
    { kind: 'text', role: 'button', name: 'Check for updates', oldText: 'Check for updates', newText: 'Look for updates', words: [{ old: 'Check', new: 'Look' }, { same: 'for updates' }], side: 'after', box: { x: 140, y: 80, w: 130, h: 32 } },
    { kind: 'text', role: 'text', name: 'Version', oldText: 'YouCoded version 1.3.3', newText: 'YouCoded version 1.4.0', words: [{ same: 'YouCoded version' }, { old: '1.3.3', new: '1.4.0' }], side: 'after', box: { x: 140, y: 50, w: 130, h: 12 } },
    { kind: 'added', role: 'button', name: 'Copy details', side: 'after', box: { x: 284, y: 80, w: 110, h: 32 } },
    { kind: 'restyled', role: 'link', name: 'Release notes', styleChanges: [{ prop: 'color', from: 'rgb(79, 143, 91)', to: 'rgb(42, 58, 44)' }], side: 'after', box: { x: 140, y: 128, w: 66, h: 12 } },
    { kind: 'pixels', side: 'after', box: { x: 420, y: 50, w: 32, h: 32 } },
  ] });
  // The mask: only the pixels nobody else explains, in hot pink.
  const m = new Canvas('#000000'); m.px.fill(0); m.rect(420, 50, 32, 32, '#ff2fb0'); m.save(rm('diff/settings/about/' + theme + '.mask.png'));

  // settings/appearance: something moved down, something else vanished.
  shoot('settings/appearance', theme, 'before', (c, t) => { c.text(140, 52, 'Theme', t.ink); c.rect(140, 70, 200, 34, t.panel); c.rect(140, 70, 200, 1, t.line); c.text(140, 130, 'Font size', t.ink); c.rect(140, 148, 160, 6, t.acc); c.text(140, 190, 'Reduce motion', t.ink); c.rect(420, 186, 36, 18, t.acc); });
  shoot('settings/appearance', theme, 'after', (c, t) => { c.text(140, 52, 'Theme', t.ink); c.rect(140, 70, 200, 34, t.panel); c.rect(140, 70, 200, 1, t.line); c.text(140, 150, 'Font size', t.ink); c.rect(140, 168, 160, 6, t.acc); });
  add('settings/appearance', theme, 'changed', { before: file('before', 'settings/appearance', theme), after: file('after', 'settings/appearance', theme), changes: [
    { kind: 'moved', role: 'slider', name: 'Font size', side: 'after', box: { x: 140, y: 168, w: 160, h: 6 }, beforeBox: { x: 140, y: 148, w: 160, h: 6 } },
    { kind: 'removed', role: 'switch', name: 'Reduce motion', side: 'before', box: { x: 420, y: 186, w: 36, h: 18 } },
  ] });

  // chat/composer: wording only.
  shoot('chat/composer', theme, 'before', (c, t) => { c.rect(140, 240, 320, 40, t.panel); c.text(150, 256, 'Type a message', t.ink); c.button(380, 244, 70, 'Send', t.acc, t.onAcc); });
  shoot('chat/composer', theme, 'after', (c, t) => { c.rect(140, 240, 320, 40, t.panel); c.text(150, 256, 'Message YouCoded', t.ink); c.button(380, 244, 70, 'Send', t.acc, t.onAcc); });
  add('chat/composer', theme, 'changed', { before: file('before', 'chat/composer', theme), after: file('after', 'chat/composer', theme), changes: [
    { kind: 'text', role: 'textbox', name: 'Message', oldText: 'Type a message', newText: 'Message YouCoded', words: [{ old: 'Type a', new: 'YouCoded' }, { same: 'message' }], side: 'after', box: { x: 148, y: 252, w: 100, h: 14 } },
  ] });

  shoot('chat/empty', theme, 'after', (c, t) => { c.text(200, 120, 'Start a conversation', t.ink); c.button(200, 150, 140, 'New chat', t.acc, t.onAcc); });
  add('chat/empty', theme, 'new', { after: file('after', 'chat/empty', theme), reason: 'added since the last release', changes: [] });

  shoot('library/themes', theme, 'after', (c, t) => { c.text(140, 52, 'Themes', t.ink); });
  shoot('library/themes', theme, 'before', (c, t) => { c.text(140, 52, 'Themes', t.ink); });
  add('library/themes', theme, 'unchanged', { before: file('before', 'library/themes', theme), after: file('after', 'library/themes', theme), changes: [] });
}
// One removed screen and one that could not be photographed.
shoot('library/skills', 'meadow-mist', 'before', (c, t) => { c.text(140, 52, 'Skills', t.ink); c.button(140, 80, 100, 'Install', t.acc, t.onAcc); });
add('library/skills', 'meadow-mist', 'changed', { before: file('before', 'library/skills', 'meadow-mist'), after: null, status: 'removed', reason: 'This screen is gone in the current code.', changes: [] });
screens[screens.length - 1].status = 'removed';
add('onboarding/welcome', 'meadow-mist', 'failed', { reason: 'The screen never finished loading (waited 20 s).', changes: [] });

writeFileSync(rm('changes.json'), JSON.stringify({ before: { label: 'v1.3.3', commit: 'abc1233' }, after: { label: 'master', commit: 'def4560' }, generatedAt: '2026-11-03T15:00:00Z', themes, screens }, null, 2) + '\n');
console.log('wrote', OUT, screens.length, 'screen rows');
