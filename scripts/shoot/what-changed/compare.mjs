#!/usr/bin/env node
// compare.mjs <run folder> — turns a before/ + after/ shoot run into changes.json.
//   node scripts/shoot/what-changed/compare.mjs <run> [--before-label v1.3.3] [--after-label master]
// Contract: ./FORMAT.md. Pure Node; pngjs and diff (jsdiff) come from the app's node_modules
// (no new packages — npm install is blocked in worktrees).
//
// How a screen is judged, in order:
//   1. Match the two element lists (same role+name first, then by overlap + name likeness, so a
//      renamed button is a `text` change and not "removed + added").
//   2. Classify each pair: wording, moved/resized, restyled. One shared up/down offset (a row was
//      inserted above) is reported once as `shift`, not as many `moved`.
//   3. Compare the pictures pixel by pixel (forgiving of anti-aliasing), throw away every changed
//      pixel an element change already explains, and report what is left as `pixels`.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(HERE, '..', '..', '..');
const req = createRequire(join(WORKSPACE, 'youcoded', 'desktop', 'package.json'));
const { PNG } = req('pngjs');
const { diffWords } = req('diff');

// ─── Words ───────────────────────────────────────────────────────────────────
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** [{ same }, { old, new }, { old }, { new }]: what changed word by word. */
export function wordDiff(oldText, newText) {
  const out = []; let o = [], n = [];
  const flush = () => { if (o.length || n.length) { const e = {}; if (o.length) e.old = o.join(' '); if (n.length) e.new = n.join(' '); out.push(e); } o = []; n = []; };
  const same = [];
  const flushSame = () => { if (same.length) { out.push({ same: same.join(' ') }); same.length = 0; } };
  for (const p of diffWords(norm(oldText), norm(newText))) {
    const v = p.value.trim(); if (!v) continue;
    if (p.added) { flushSame(); n.push(v); } else if (p.removed) { flushSame(); o.push(v); } else { flush(); same.push(v); }
  }
  flush(); flushSame();
  return out;
}

// ─── Matching ────────────────────────────────────────────────────────────────
const groupOf = (e) => (e.kind === 'text' ? 'text' : e.kind === 'image' ? 'image' : 'ctl');
const keyOf = (e) => {
  const g = groupOf(e);
  if (g === 'text') return `text|${norm(e.text ?? e.name)}`;
  if (!norm(e.name)) return null;
  return `${g}|${e.role ?? ''}|${norm(e.name)}`;
};
const cx = (b) => b.x + b.w / 2, cy = (b) => b.y + b.h / 2;
const dist = (a, b) => Math.hypot(cx(a) - cx(b), cy(a) - cy(b));
function iou(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const i = w * h; return i / (a.w * a.h + b.w * b.h - i);
}
/** 0..1 likeness of two strings (character pairs), 1 = same. */
export function similarity(a, b) {
  a = norm(a).toLowerCase(); b = norm(b).toLowerCase();
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const pairs = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const p = s.slice(i, i + 2); m.set(p, (m.get(p) ?? 0) + 1); } return m; };
  const A = pairs(a), B = pairs(b); let hit = 0;
  for (const [p, c] of A) hit += Math.min(c, B.get(p) ?? 0);
  return (2 * hit) / (a.length - 1 + b.length - 1);
}
const labelOf = (e) => norm(e.text ?? e.name);

/**
 * Pairs the elements of two lists. Returns { pairs: [{b, a, exact}], removed, added, shift }
 * where shift is the shared vertical offset in CSS px (0 when there is none).
 */
export function matchElements(before, after) {
  const pairs = []; const usedB = new Set(), usedA = new Set();
  // Pass 1: same role + name (or same words). Several alike (three "Delete" buttons): nearest first.
  const groups = new Map();
  before.forEach((e, i) => { const k = keyOf(e); if (k) { if (!groups.has(k)) groups.set(k, { b: [], a: [] }); groups.get(k).b.push(i); } });
  after.forEach((e, i) => { const k = keyOf(e); if (k && groups.has(k)) groups.get(k).a.push(i); });
  for (const { b, a } of groups.values()) {
    const cand = [];
    for (const i of b) for (const j of a) cand.push([dist(before[i].box, after[j].box), i, j]);
    cand.sort((x, y) => x[0] - y[0]);
    for (const [, i, j] of cand) if (!usedB.has(i) && !usedA.has(j)) { usedB.add(i); usedA.add(j); pairs.push({ b: before[i], a: after[j], exact: true }); }
  }
  // The shared offset: the most common non-zero change in top edge among exact pairs.
  const shift = findShift(pairs);
  // Pass 2: what is left, by overlap (also as it would sit after the shift) and name likeness.
  const cand = [];
  before.forEach((eb, i) => { if (usedB.has(i)) return; after.forEach((ea, j) => {
    if (usedA.has(j) || groupOf(eb) !== groupOf(ea)) return;
    const shifted = { ...eb.box, y: eb.box.y + shift };
    const ov = Math.max(iou(eb.box, ea.box), iou(shifted, ea.box));
    const sim = similarity(labelOf(eb), labelOf(ea));
    const sameRole = (eb.role ?? '') === (ea.role ?? '');
    const near = Math.min(dist(eb.box, ea.box), dist(shifted, ea.box));
    // Sure: sitting on top of each other. Likely: overlapping a little with a similar name, or a
    // renamed control of the same kind in the same place.
    let score = 0;
    if (ov >= 0.5 && sameRole) score = 2 + ov;
    else if (ov >= 0.15 && sim >= 0.3) score = 1 + sim;
    else if (sim >= 0.6 && near < 120 && sameRole) score = sim;
    if (score) cand.push([score, i, j]);
  }); });
  cand.sort((x, y) => y[0] - x[0]);
  for (const [, i, j] of cand) if (!usedB.has(i) && !usedA.has(j)) { usedB.add(i); usedA.add(j); pairs.push({ b: before[i], a: after[j], exact: false }); }
  return { pairs, removed: before.filter((_, i) => !usedB.has(i)), added: after.filter((_, i) => !usedA.has(i)), shift };
}

function findShift(pairs) {
  if (pairs.length < 2) return 0;
  const buckets = new Map();
  for (const p of pairs) { const dy = Math.round(p.a.box.y - p.b.box.y); if (Math.abs(dy) > 2) buckets.set(dy, (buckets.get(dy) ?? []).concat(p)); }
  let best = null;
  for (const [dy, ps] of buckets) {
    // Neighbouring values (±1) are the same shift measured on a half pixel.
    const n = [...buckets].filter(([k]) => Math.abs(k - dy) <= 1).reduce((s, [, v]) => s + v.length, 0);
    if (!best || n > best.n) best = { dy, n };
  }
  if (!best) return 0;
  return best.n >= 3 || (best.n >= 2 && best.n >= pairs.length * 0.5) ? best.dy : 0;
}

// ─── Classifying ─────────────────────────────────────────────────────────────
const BRAILLE = /^[\u2800-\u28ff\s]+$/;
const DURATION = /\b\d+\s?(?:d|h|m|s)\b/g;
const CLOCK = /\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:[AaPp][Mm])?/g;
const SPINNER = /[\u2800-\u28ff]/g;
const steady = (t) => t.replace(SPINNER, '').replace(CLOCK, '#').replace(DURATION, '#').replace(/\s+/g, ' ').trim();
/** Words that change by themselves: a spinner glyph, a countdown or a clock time. True when the two texts are the same without those. */
export function volatileText(o, n) {
  return o !== n && (steady(o) === steady(n) || (RANDOM_PHRASES.has(o) && RANDOM_PHRASES.has(n)));
}
// WHY (what-changed run 2, 2026-11-03): the thinking line shows a phrase picked at random. shoot --freeze fixes
// the random sequence, but the two versions draw a different number of random numbers first, so "Calibrating"
// still faced "Perplexing" on the same screen. A swap between two of those phrases is not a change; the list is
// read from each side's own ThinkingIndicator.tsx so a phrase added or removed in the app is still known.
const RANDOM_PHRASES = new Set();
export function randomPhrasesFrom(source) {
  const list = /THINKING_LINES[^=]*=\s*\[([\s\S]*?)\]/.exec(source ?? '')?.[1] ?? '';
  return [...list.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
}
export function rememberRandomPhrases(phrases) { for (const p of phrases) RANDOM_PHRASES.add(p); }
const MOVE_TOL = 2;   // CSS px: smaller moves are rounding, not changes
const STYLE_PROPS = ['color', 'background', 'border', 'radius', 'font', 'opacity'];
const sameStyle = (p, a, b) => p === 'opacity' ? Math.abs(Number(a) - Number(b)) < 0.02 : a === b;

/** Changes for the matched pairs, plus the removed / added elements. */
export function classify({ pairs, removed, added, shift }) {
  const changes = [];
  const slid = [];     // `moved` changes, kept to spot a row pushed sideways as a whole
  const ignored = [];  // boxes of things that change by themselves: their pixels are explained too
  const fromY = [];   // after-side top edges of elements that rode along with the shift
  for (const { b, a } of pairs) {
    // A spinner is animation, not content: its glyph and colour differ between any two pictures.
    if (BRAILLE.test(b.text ?? '') && BRAILLE.test(a.text ?? '')) { ignored.push(a.box, b.box); continue; }
    const base = { role: a.role ?? b.role ?? null, name: a.name || b.name || '' };
    let wording = false;
    for (const field of ['text', 'title', 'placeholder']) {
      const o = norm(b[field]), n = norm(a[field]);
      if (o === n) continue;
      // A control whose words are empty on one side and an icon on the other is not a wording change we can show.
      if (field === 'text' && !o && !n) continue;
      // WHY skipped: a countdown ("resets in 2h 59m") and a braille spinner change on their own
      // between two pictures taken minutes apart; they are not changes to the app.
      wording = true;
      if (field === 'text' && volatileText(o, n)) { ignored.push(a.box, b.box); continue; }
      changes.push({ kind: 'text', ...base, ...(field === 'text' ? {} : { field }), oldText: o, newText: n, words: wordDiff(o, n), side: 'after', box: a.box, beforeBox: b.box });
    }
    const dy = a.box.y - b.box.y, dx = a.box.x - b.box.x;
    const rode = shift && Math.abs(dy - shift) <= 1.5;
    if (rode) fromY.push(a.box.y);
    // Wording changes resize and re-centre their own box: only a vertical move counts then.
    const moved = wording ? Math.abs(dy - (rode ? shift : 0)) > MOVE_TOL
      : Math.abs(dx) > MOVE_TOL || Math.abs(dy - (rode ? shift : 0)) > MOVE_TOL || Math.abs(a.box.w - b.box.w) > MOVE_TOL || Math.abs(a.box.h - b.box.h) > MOVE_TOL;
    if (moved) {
      const m = { kind: 'moved', ...base, side: 'after', box: a.box, beforeBox: b.box };
      // Candidates for the sideways ride-along below: same size, same row, only pushed left/right.
      slid.push({ m, dx, plain: !wording && Math.abs(dy - (rode ? shift : 0)) <= MOVE_TOL && Math.abs(a.box.w - b.box.w) <= MOVE_TOL && Math.abs(a.box.h - b.box.h) <= MOVE_TOL });
      changes.push(m);
    }
    const styleChanges = STYLE_PROPS.filter((p) => !sameStyle(p, a.style?.[p], b.style?.[p])).map((p) => ({ prop: p, from: b.style?.[p], to: a.style?.[p] }));
    if (styleChanges.length) changes.push({ kind: 'restyled', ...base, styleChanges, side: 'after', box: a.box, beforeBox: b.box });
  }
  // WHY (what-changed run 5, chat#statusbar-cc): a clock reading changed width ("6:42pm" to "7:04pm"), so
  // every chip after it slid sideways by the same amount — one cause, seven `moved`. Elements that only slid
  // by one shared distance are the same kind of ride-along as the vertical shift: dropped from the list.
  const byDx = new Map();
  for (const x of slid) if (x.plain) { const k = Math.round(x.dx); const near = [...byDx.keys()].find((q) => Math.abs(q - k) <= 1) ?? k; byDx.set(near, (byDx.get(near) ?? []).concat(x)); }
  for (const group of byDx.values()) if (group.length >= 2) for (const x of group) { ignored.push(x.m.box, x.m.beforeBox); changes.splice(changes.indexOf(x.m), 1); }
  for (const e of removed) changes.push({ kind: 'removed', role: e.role ?? null, name: e.name, ...(e.text ? { oldText: e.text } : {}), side: 'before', box: e.box });
  for (const e of added) changes.push({ kind: 'added', role: e.role ?? null, name: e.name, ...(e.text ? { newText: e.text } : {}), side: 'after', box: e.box });
  return { changes, ignored, shift: shift || 0, shiftFromY: fromY.length ? Math.min(...fromY) : 0 };
}

// ─── Pixels ──────────────────────────────────────────────────────────────────
// Colour distance in the YIQ space (the measure pixelmatch uses), alpha blended over white.
function delta(d1, i1, d2, i2) {
  let r1 = d1[i1], g1 = d1[i1 + 1], b1 = d1[i1 + 2]; const a1 = d1[i1 + 3];
  let r2 = d2[i2], g2 = d2[i2 + 1], b2 = d2[i2 + 2]; const a2 = d2[i2 + 3];
  if (a1 < 255) { const f = a1 / 255; r1 = 255 + (r1 - 255) * f; g1 = 255 + (g1 - 255) * f; b1 = 255 + (b1 - 255) * f; }
  if (a2 < 255) { const f = a2 / 255; r2 = 255 + (r2 - 255) * f; g2 = 255 + (g2 - 255) * f; b2 = 255 + (b2 - 255) * f; }
  const y = (r1 - r2) * 0.29889531 + (g1 - g2) * 0.58662247 + (b1 - b2) * 0.11448223;
  const i = (r1 - r2) * 0.59597799 - (g1 - g2) * 0.2741761 - (b1 - b2) * 0.32180189;
  const q = (r1 - r2) * 0.21147017 - (g1 - g2) * 0.52261711 + (b1 - b2) * 0.31114694;
  return 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
}

/** Is this pixel unlike one of its four neighbours (a glyph edge, a border) rather than part of a flat area? */
function isEdge(d, i, w, x, y, h, limit) {
  if (x > 0 && delta(d, i, d, i - 4) > limit) return true;
  if (x < w - 1 && delta(d, i, d, i + 4) > limit) return true;
  if (y > 0 && delta(d, i, d, i - w * 4) > limit) return true;
  if (y < h - 1 && delta(d, i, d, i + w * 4) > limit) return true;
  return false;
}

/**
 * Which pixels of `A` really differ from `B`. A pixel counts only when it matches nothing in the
 * 3×3 neighbourhood on the other side, in either direction: that forgives anti-aliasing and a
 * one-pixel nudge of an edge, but not a new colour or a new line. Rows from `fromY` down are
 * compared against `B` shifted by `dyPx` (a row inserted above). Returns { mask, count }.
 */
export function diffPixels(A, B, { threshold = 0.1, dyPx = 0, fromY = 0 } = {}) {
  const w = A.width, h = A.height; const mask = new Uint8Array(w * h); let count = 0;
  const limit = 35215 * threshold * threshold;
  const da = A.data, db = B.data;
  for (let y = 0; y < h; y++) {
    // WHY skip the band a row was inserted into (dyPx rows ending at fromY): it holds new content with
    // nothing in the old picture to compare to — the `added` change already reports it.
    if (dyPx > 0 && y >= fromY - dyPx && y < fromY) continue;
    const ys = dyPx && y >= fromY ? y - dyPx : y;
    if (ys < 0 || ys >= B.height) continue;           // nothing to compare with (pushed in / out of view)
    for (let x = 0; x < w && x < B.width; x++) {
      const ia = (y * w + x) * 4, ib = (ys * B.width + x) * 4;
      if (da[ia] === db[ib] && da[ia + 1] === db[ib + 1] && da[ia + 2] === db[ib + 2] && da[ia + 3] === db[ib + 3]) continue;
      if (delta(da, ia, db, ib) <= limit) continue;
      // WHY two strengths: on a glyph edge (a pixel unlike its own neighbours) a sub-pixel text nudge
      // moves anti-aliased greys by ~40/255, so the neighbour test is looser there (measured on
      // settings/sound, where invisible 0.1 px text offsets lit up 1 000 pixels). In a flat area any
      // colour change beyond the strict limit counts.
      const edge = isEdge(da, ia, w, x, y, h, limit) || isEdge(db, ib, B.width, x, ys, B.height, limit);
      const lim = edge ? limit * 6 : limit;
      let aMatches = false, bMatches = false;
      for (let oy = -1; oy <= 1 && !(aMatches && bMatches); oy++) for (let ox = -1; ox <= 1; ox++) {
        const xb = x + ox, yb = ys + oy, xa = x + ox, ya = y + oy;
        if (!aMatches && xb >= 0 && xb < B.width && yb >= 0 && yb < B.height && delta(da, ia, db, (yb * B.width + xb) * 4) <= lim) aMatches = true;
        if (!bMatches && xa >= 0 && xa < w && ya >= 0 && ya < h && delta(db, ib, da, (ya * w + xa) * 4) <= lim) bMatches = true;
      }
      if (!(aMatches && bMatches)) { mask[y * w + x] = 1; count++; }
    }
  }
  return { mask, count };
}

/** Clears mask pixels inside the given boxes (picture pixels) and returns how many were cleared. */
function clearBoxes(mask, w, h, boxes) {
  let cleared = 0;
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor(b.x)), y0 = Math.max(0, Math.floor(b.y)), x1 = Math.min(w, Math.ceil(b.x + b.w)), y1 = Math.min(h, Math.ceil(b.y + b.h));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (mask[y * w + x]) { mask[y * w + x] = 0; cleared++; }
  }
  return cleared;
}

/** Groups the remaining pixels into regions (pixels within `gap` of each other join) and drops specks. */
export function regions(mask, w, h, { gap = 8, minPixels = 12, cell = 4 } = {}) {
  const cw = Math.ceil(w / cell), ch = Math.ceil(h / cell);
  const cells = new Int32Array(cw * ch).fill(-1); const stats = [];
  const on = new Uint8Array(cw * ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) on[Math.floor(y / cell) * cw + Math.floor(x / cell)] = 1;
  const reach = Math.max(1, Math.round(gap / cell));
  for (let c = 0; c < on.length; c++) {
    if (!on[c] || cells[c] >= 0) continue;
    const id = stats.length; stats.push({ x0: w, y0: h, x1: 0, y1: 0, count: 0 });
    const stack = [c]; cells[c] = id;
    while (stack.length) {
      const k = stack.pop(); const kx = k % cw, ky = (k / cw) | 0;
      for (let oy = -reach; oy <= reach; oy++) for (let ox = -reach; ox <= reach; ox++) {
        const nx = kx + ox, ny = ky + oy; if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
        const n = ny * cw + nx; if (on[n] && cells[n] < 0) { cells[n] = id; stack.push(n); }
      }
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
    const s = stats[cells[Math.floor(y / cell) * cw + Math.floor(x / cell)]];
    s.count++; if (x < s.x0) s.x0 = x; if (y < s.y0) s.y0 = y; if (x + 1 > s.x1) s.x1 = x + 1; if (y + 1 > s.y1) s.y1 = y + 1;
  }
  return stats.filter((s) => s.count >= minPixels).map((s) => ({ x: s.x0, y: s.y0, w: s.x1 - s.x0, h: s.y1 - s.y0, count: s.count }));
}

// ─── One screen ──────────────────────────────────────────────────────────────
const PAD = 3;   // CSS px of slack around an explained element
/**
 * before/after: { elements: [...]|null, png: PNG|null, bytes?: Buffer }. scale: picture px per CSS px.
 * Returns { changes, shift, mask?: { data, w, h } }.
 */
export function compareScreen(before, after, scale = 1, repeat = {}, opts = {}) {
  let changes = [], ignored = [], shift = 0, shiftFromY = 0, unstable = 0;
  const haveEls = Array.isArray(before.elements) && Array.isArray(after.elements);
  if (haveEls) ({ changes, ignored, shift, shiftFromY } = classify(matchElements(before.elements, after.elements)));
  if (!before.png || !after.png) return { changes, shift };
  if (before.bytes && after.bytes && before.bytes.equals(after.bytes)) return { changes, shift };
  const A = after.png, B = before.png;
  if (A.width !== B.width || A.height !== B.height) {
    changes.push({ kind: 'pixels', role: null, name: 'picture size differs', side: 'after', box: { x: 0, y: 0, w: A.width / scale, h: A.height / scale } });
    return { changes, shift };
  }
  const { mask, count } = diffPixels(A, B, { dyPx: Math.round(shift * scale), fromY: Math.floor((shiftFromY - PAD) * scale) });
  if (!count) return { changes, shift };
  // What elements already explain: their boxes on both sides (and the before boxes as they sit after the shift).
  const boxes = [];
  for (const c of changes) for (const b of [c.box, c.beforeBox]) if (b) {
    for (const dy of c.beforeBox === b || c.side === 'before' ? [0, shift] : [0]) boxes.push({ x: (b.x - PAD) * scale, y: (b.y + dy - PAD) * scale, w: (b.w + 2 * PAD) * scale, h: (b.h + 2 * PAD) * scale });
  }
  for (const b of ignored) boxes.push({ x: (b.x - PAD) * scale, y: (b.y - PAD) * scale, w: (b.w + 2 * PAD) * scale, h: (b.h + 2 * PAD) * scale });
  clearBoxes(mask, A.width, A.height, boxes);
  let found = regions(mask, A.width, A.height);
  // WHY (Office editor caret): the editor draws a blinking text cursor on its own canvas, which no style
  // can hide. A region a few pixels wide and one text line tall on an office screen is that cursor.
  if (opts.ignoreCaret) { const n = found.length; found = found.filter((r) => !(r.w <= 5 * scale && r.h <= 26 * scale)); unstable += n - found.length; }
  // WHY (flicker filter): `repeat.before/after` are a second picture of the same screen from the
  // SAME side. Where a side's own two pictures differ, that side is unstable (a glow, a blinking
  // thing, a late-loading image), so a difference there says nothing about the release. A change
  // touching such a spot is dropped and counted — pixel regions and element changes alike.
  const flicker = repeat.before || repeat.after ? flickerMask(A, B, repeat) : null;
  if (flicker) {
    const kept = found.filter((r) => !touches(flicker, A.width, A.height, r, 4));
    unstable += found.length - kept.length; found = kept;
    const css = (b) => ({ x: b.x * scale, y: b.y * scale, w: b.w * scale, h: b.h * scale });
    const stays = (c) => !(c.box && touches(flicker, A.width, A.height, css(c.box), 4)) && !(c.beforeBox && touches(flicker, A.width, A.height, css(c.beforeBox), 4));
    const keptEls = changes.filter((c) => c.kind === 'pixels' || stays(c));
    unstable += changes.length - keptEls.length; changes = keptEls;
  }
  if (!found.length) return { changes, shift, unstable };
  // Only the surviving regions stay in the mask picture.
  const keep = new Uint8Array(mask.length);
  for (const r of found) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (mask[y * A.width + x]) keep[y * A.width + x] = 1;
  for (const r of found) changes.push({ kind: 'pixels', role: null, name: '', side: 'after', box: { x: round1((r.x - 1) / scale), y: round1((r.y - 1) / scale), w: round1((r.w + 2) / scale), h: round1((r.h + 2) / scale) } });
  return { changes, shift, unstable, mask: { data: keep, w: A.width, h: A.height } };
}

/** Pixels where a side's picture differs from its own repeat (same size only). */
function flickerMask(A, B, repeat) {
  const out = new Uint8Array(A.width * A.height);
  for (const [pic, again] of [[A, repeat.after], [B, repeat.before]]) {
    if (!again || again.width !== pic.width || again.height !== pic.height) continue;
    const { mask } = diffPixels(pic, again);
    for (let i = 0; i < mask.length; i++) if (mask[i]) out[i] = 1;
  }
  return out;
}
function touches(mask, w, h, r, pad) {
  for (let y = Math.max(0, r.y - pad); y < Math.min(h, r.y + r.h + pad); y++) for (let x = Math.max(0, r.x - pad); x < Math.min(w, r.x + r.w + pad); x++) if (mask[y * w + x]) return true;
  return false;
}
const round1 = (n) => Math.round(n * 10) / 10;

function writeMask(file, { data, w, h }) {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < data.length; i++) { const o = i * 4; if (data[i]) { png.data[o] = 255; png.data[o + 1] = 40; png.data[o + 2] = 120; png.data[o + 3] = 255; } }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, PNG.sync.write(png));
}

// ─── A whole run ─────────────────────────────────────────────────────────────
function findPictures(root) {
  const found = new Map();   // "name|theme" -> png path
  if (!existsSync(root)) return found;
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!n.endsWith('.png') || n.endsWith('.elements.json') || n.startsWith('sheet-')) continue;
      found.set(`${relative(root, dirname(p)).split(/[\\/]/).join('/')}|${n.slice(0, -4)}`, p);
    }
  };
  walk(root);
  return found;
}
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };

function failures(side) {
  const m = readJson(join(side, 'manifest.json')); const out = new Map();
  for (const r of Array.isArray(m) ? m : []) out.set(`${r.name}|${r.theme}`, r.ok ? null : r.reason || 'not taken');
  return out;
}
/** Each picture's panel box (CSS pixels): the part of the window that IS this screen (shoot's mark). */
function panels(side) {
  const m = readJson(join(side, 'manifest.json')); const out = new Map();
  for (const r of Array.isArray(m) ? m : []) if (r.ok && r.panel) out.set(`${r.name}|${r.theme}`, r.panel);
  return out;
}

const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/**
 * WHY (Destin, 2026-11-05, a theme popup flagged "Changed" for a speck in the blurred page behind it:
 * "we're attributing the change to the wrong page"): a popup's picture also shows the page under it, and
 * that page is its own screen with its own comparison. When the screen's panel covers well under the whole
 * window (a popup, a menu, a card), only changes touching that panel on either side belong to this screen;
 * the rest are dropped and counted as `outside`. A full-window screen, or a panel box too small to be real
 * (a 12 px mark is a misplaced mark, not the screen), keeps everything rather than guessing.
 */
export function keepInsidePanel(changes, panelBefore, panelAfter, vw, vh) {
  const ps = [panelBefore, panelAfter].filter((p) => p && p.w >= 40 && p.h >= 40);
  if (!ps.length || !vw || !vh || ps.every((p) => p.w * p.h >= 0.6 * vw * vh)) return { changes, outside: 0 };
  const PADC = 4; // a change hugging the panel's edge (its shadow, its border) still belongs to it
  const grow = (p) => ({ x: p.x - PADC, y: p.y - PADC, w: p.w + 2 * PADC, h: p.h + 2 * PADC });
  const kept = changes.filter((c) => [c.box, c.beforeBox].some((b) => b && ps.some((p) => hits(b, grow(p)))));
  return { changes: kept, outside: changes.length - kept.length };
}

export function compareRun(run, { beforeLabel, afterLabel } = {}) {
  run = resolve(run);
  const meta = readJson(join(run, 'run.json')) ?? {};
  for (const dir of [meta.before?.dir, meta.after?.dir]) {
    try { rememberRandomPhrases(randomPhrasesFrom(readFileSync(join(dir, 'desktop/src/renderer/components/ThinkingIndicator.tsx'), 'utf8'))); } catch { /* no checkout recorded: the phrases stay unknown */ }
  }
  const B = findPictures(join(run, 'before')), A = findPictures(join(run, 'after'));
  // Second pictures from each side (the flicker filter): before-2/ and after-2/, present only when the wrapper took them.
  const B2 = findPictures(join(run, 'before-2')), A2 = findPictures(join(run, 'after-2'));
  const failB = failures(join(run, 'before')), failA = failures(join(run, 'after'));
  const panB = panels(join(run, 'before')), panA = panels(join(run, 'after'));
  const keys = new Set([...B.keys(), ...A.keys(), ...[...failB].filter(([, v]) => v).map(([k]) => k), ...[...failA].filter(([, v]) => v).map(([k]) => k)]);
  const screens = [];
  for (const key of [...keys].sort()) {
    const [name, theme] = key.split('|');
    const rel = (side, p) => (p ? join(side, name, `${theme}.png`) : undefined);
    const entry = { name, theme };
    if (failA.get(key)) { screens.push({ ...entry, status: 'failed', reason: `after: ${failA.get(key)}` }); continue; }
    if (failB.get(key) && A.has(key)) { screens.push({ ...entry, status: 'failed', reason: `before: ${failB.get(key)}` }); continue; }
    if (!B.has(key) && A.has(key)) { screens.push({ ...entry, status: 'new', reason: `not in ${beforeLabel ?? meta.before?.label ?? 'the before side'}`, after: rel('after', true) }); continue; }
    if (B.has(key) && !A.has(key)) { screens.push({ ...entry, status: 'removed', reason: 'not in the after side', before: rel('before', true) }); continue; }
    if (!B.has(key) && !A.has(key)) continue;
    const side = (map, dir) => {
      const png = map.get(key); const bytes = readFileSync(png);
      return { bytes, png: PNG.sync.read(bytes), elements: readJson(png.replace(/\.png$/, '.elements.json'))?.elements ?? null, meta: readJson(png.replace(/\.png$/, '.elements.json')) };
    };
    const b = side(B, 'before'), a = side(A, 'after');
    const scale = a.meta?.scale ?? meta.scale ?? 1.5;
    const again = (map) => (map.has(key) ? PNG.sync.read(readFileSync(map.get(key))) : null);
    const r = compareScreen(b, a, scale, { before: again(B2), after: again(A2) }, { ignoreCaret: name.startsWith('office/') });
    const vp = a.meta?.viewport ?? { w: a.png.width / scale, h: a.png.height / scale };
    const inside = keepInsidePanel(r.changes, panB.get(key), panA.get(key), vp.w, vp.h);
    // A shift that lies outside the panel (the page behind moved) is the page's business too.
    if (inside.outside && !inside.changes.length) r.shift = 0;
    r.changes = inside.changes;
    const row = { ...entry, status: r.changes.length || r.shift ? 'changed' : 'unchanged', before: rel('before', true), after: rel('after', true), scale, ...(r.shift ? { shift: { y: r.shift } } : {}), changes: r.changes, ...(r.unstable ? { unstable: r.unstable } : {}), ...(inside.outside ? { outside: inside.outside } : {}) };
    if (!b.elements || !a.elements) row.reason = 'no element lists beside the pictures: pixels only';
    if (r.mask) { const mf = join('diff', name, `${theme}.mask.png`); writeMask(join(run, mf), r.mask); row.mask = mf; }
    screens.push(row);
  }
  const git = (dir) => { try { return spawnSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim() || undefined; } catch { return undefined; } };
  const out = {
    before: { label: beforeLabel ?? meta.before?.label ?? 'before', commit: meta.before?.commit ?? (meta.before?.dir ? git(meta.before.dir) : undefined) },
    after: { label: afterLabel ?? meta.after?.label ?? 'after', commit: meta.after?.commit ?? (meta.after?.dir ? git(meta.after.dir) : undefined) },
    generatedAt: new Date().toISOString(), themes: [...new Set(screens.map((s) => s.theme))].sort(), screens,
  };
  writeFileSync(join(run, 'changes.json'), JSON.stringify(out, null, 1));
  return out;
}

export function summaryLine(out) {
  const n = (s) => out.screens.filter((x) => x.status === s).length;
  return `${n('changed')} changed · ${n('unchanged')} unchanged · ${n('new')} new · ${n('removed')} removed · ${n('failed')} failed (${out.screens.length} pictures)`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const beforeLabel = flag('--before-label'), afterLabel = flag('--after-label');
  if (!args[0]) { console.error('usage: compare.mjs <run folder> [--before-label X] [--after-label Y]'); process.exit(2); }
  const t0 = Date.now(); const out = compareRun(args[0], { beforeLabel, afterLabel });
  console.log(`${summaryLine(out)} · compared in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${join(resolve(args[0]), 'changes.json')}`);
}
