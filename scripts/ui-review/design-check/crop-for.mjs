// A review-deck crop and highlight box around the elements one slide is about.
//   node crop-for.mjs <matched.json> <plan/shot> <where-regex> [--fixed-only]
// <matched.json> is match-elements.mjs output; <where-regex> filters warnings by
// "file:line" (e.g. 'SyncPanel'); --fixed-only keeps warnings a fix script changed.
// Prints {"crop": "WxH+X+Y", "box": [left, top, width, height] (percent of the crop)}.
// WHY computed, not hand-placed: the deck builder refuses boxes that leave the picture
// and warns on ones covering most of it; the densest-cluster window below keeps the
// crop wide and readable (a tall crop hides the deck's text cards — AUTHORING.md).
import { readFileSync } from 'node:fs';

const [matchedPath, shot, where, flag] = process.argv.slice(2);
if (!matchedPath || !shot || !where) { console.error('usage: crop-for.mjs <matched.json> <plan/shot> <where-regex> [--fixed-only]'); process.exit(2); }
const W = 1440, H = 900;
const re = new RegExp(where);
const hits = JSON.parse(readFileSync(matchedPath, 'utf8')).hits
  .filter((h) => h.shot === shot && re.test(h.where) && (flag !== '--fixed-only' || h.to));
const rects = [...new Map(hits.flatMap((h) => h.rects).map((r) => [`${r.x},${r.y},${r.w},${r.h}`, r])).values()];
if (!rects.length) { console.error(`no matched elements for ${where} in ${shot}`); process.exit(1); }

let best = [];
for (const s of rects) {
  const cw = 820, ch = 420;
  const x = Math.max(0, Math.min(W - cw, Math.round(s.x + s.w / 2 - cw / 2)));
  const y = Math.max(0, Math.min(H - ch, Math.round(s.y + s.h / 2 - ch / 2)));
  const inside = rects.filter((r) => r.x >= x - 2 && r.y >= y - 2 && r.x + r.w <= x + cw + 2 && r.y + r.h <= y + ch + 2);
  if (inside.length > best.length) best = inside;
}
const pad = 48;
let x0 = Math.min(...best.map((r) => r.x)) - pad, y0 = Math.min(...best.map((r) => r.y)) - pad;
let x1 = Math.max(...best.map((r) => r.x + r.w)) + pad, y1 = Math.max(...best.map((r) => r.y + r.h)) + pad;
const grow = (a, b, min) => (b - a >= min ? [a, b] : [(a + b) / 2 - min / 2, (a + b) / 2 + min / 2]);
[x0, x1] = grow(x0, x1, 600); [y0, y1] = grow(y0, y1, 260);
if (x1 - x0 < 1.7 * (y1 - y0)) [x0, x1] = grow(x0, x1, 1.7 * (y1 - y0));
const fit = (a, b, max) => { if (b - a > max) return [0, max]; if (a < 0) { b -= a; a = 0; } if (b > max) { a -= b - max; b = max; } return [Math.round(a), Math.round(b)]; };
[x0, x1] = fit(x0, x1, W); [y0, y1] = fit(y0, y1, H);
const g = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
const u = { x: Math.min(...best.map((r) => r.x)), y: Math.min(...best.map((r) => r.y)) };
u.w = Math.max(...best.map((r) => r.x + r.w)) - u.x; u.h = Math.max(...best.map((r) => r.y + r.h)) - u.y;
const l = Math.max(0, (u.x - 4 - g.x) / g.w * 100), t = Math.max(0, (u.y - 4 - g.y) / g.h * 100);
const box = [l, t, Math.min(100 - l, (u.w + 8) / g.w * 100), Math.min(100 - t, (u.h + 8) / g.h * 100)].map((v) => Math.round(v * 100) / 100);
console.log(JSON.stringify({ crop: `${g.w}x${g.h}+${g.x}+${g.y}`, box, elements: best.length }));
