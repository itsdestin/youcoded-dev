// The what-changed comparer: matching, classifying and the picture compare, on small hand-made
// element lists and tiny pictures. Run: node --test scripts/shoot/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, compareScreen, keepInsidePanel, matchElements, randomPhrasesFrom, rememberRandomPhrases, volatileText, wordDiff } from '../what-changed/compare.mjs';

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { PNG } = createRequire(join(WORKSPACE, 'youcoded', 'desktop', 'package.json'))('pngjs');

const style = { color: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)', border: '0px none x', radius: '0px', font: '14px 400 Nunito', opacity: '1' };
let n = 0;
const el = (kind, role, name, x, y, w = 100, h = 30, extra = {}) => ({ id: ++n, kind, role, name, text: kind === 'field' ? null : name, title: null, placeholder: null, box: { x, y, w, h }, style: { ...style }, path: 'p', ...extra });
const run = (b, a) => classify(matchElements(b, a));
const kinds = (r) => r.changes.map((c) => c.kind);

test('the same screen twice has no changes', () => {
  const b = [el('control', 'button', 'Save', 10, 10), el('text', null, 'Hello', 10, 60)];
  assert.deepEqual(run(b, structuredClone(b)).changes, []);
});

test('a renamed button is one text change with the words marked, not removed + added', () => {
  const r = run([el('control', 'button', 'Check for updates', 10, 10, 150)], [el('control', 'button', 'Look for updates', 10, 10, 148)]);
  assert.deepEqual(kinds(r), ['text']);
  assert.equal(r.changes[0].oldText, 'Check for updates');
  assert.deepEqual(r.changes[0].words, [{ old: 'Check', new: 'Look' }, { same: 'for updates' }]);
});

test('a button that is really gone or new is removed / added', () => {
  const r = run([el('control', 'button', 'Old thing', 10, 10), el('control', 'button', 'Stay', 10, 100)], [el('control', 'button', 'Stay', 10, 100), el('control', 'link', 'Brand new link', 300, 400, 80, 20)]);
  assert.deepEqual(kinds(r).sort(), ['added', 'removed']);
});

test('a half-pixel difference is not a move, a real one is', () => {
  assert.deepEqual(run([el('control', 'button', 'Go', 10, 10)], [el('control', 'button', 'Go', 10.5, 11)]).changes, []);
  assert.deepEqual(kinds(run([el('control', 'button', 'Go', 10, 10)], [el('control', 'button', 'Go', 10, 40)])), ['moved']);
});

test('a changed colour is restyled with the old and new value', () => {
  const a = el('control', 'button', 'Go', 10, 10); a.style.background = 'rgb(255, 0, 0)';
  const r = run([el('control', 'button', 'Go', 10, 10)], [a]);
  assert.deepEqual(kinds(r), ['restyled']);
  assert.deepEqual(r.changes[0].styleChanges, [{ prop: 'background', from: 'rgba(0, 0, 0, 0)', to: 'rgb(255, 0, 0)' }]);
});

test('a row inserted above shifts everything below once, not one "moved" each', () => {
  const below = (dy) => [el('control', 'button', 'A', 10, 100 + dy), el('control', 'button', 'B', 10, 150 + dy), el('text', null, 'Words here', 10, 200 + dy), el('control', 'button', 'Top', 10, 10)];
  const r = run(below(0), [...below(40), el('control', 'button', 'New row', 10, 100)]);
  assert.equal(r.shift, 40);
  assert.deepEqual(kinds(r), ['added']);
});

test('title and placeholder wording are compared too', () => {
  const r = run([el('field', 'textbox', 'Search', 10, 10, 100, 30, { placeholder: 'Find chats' })], [el('field', 'textbox', 'Search', 10, 10, 100, 30, { placeholder: 'Search chats' })]);
  assert.deepEqual(kinds(r), ['text']); assert.equal(r.changes[0].field, 'placeholder');
});

test('wordDiff keeps what stayed', () => {
  assert.deepEqual(wordDiff('a b c', 'a c'), [{ same: 'a' }, { old: 'b' }, { same: 'c' }]);
});

// ── pictures ──
function pic(w, h, paint) {
  const p = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = paint(x, y) ?? [255, 255, 255]; const o = (y * w + x) * 4; p.data[o] = c[0]; p.data[o + 1] = c[1]; p.data[o + 2] = c[2]; p.data[o + 3] = 255; }
  return p;
}
const side = (png, elements = []) => ({ png, elements, bytes: PNG.sync.write(png) });

test('identical pictures: nothing; a new coloured block that no element explains: one pixels change', () => {
  const base = pic(200, 100, () => null);
  assert.deepEqual(compareScreen(side(base), side(pic(200, 100, () => null)), 1).changes, []);
  const r = compareScreen(side(base), side(pic(200, 100, (x, y) => (x >= 50 && x < 80 && y >= 40 && y < 60 ? [220, 30, 30] : null))), 1);
  assert.equal(r.changes.length, 1); assert.equal(r.changes[0].kind, 'pixels');
  assert.ok(r.changes[0].box.x <= 50 && r.changes[0].box.x + r.changes[0].box.w >= 80);
  assert.ok(r.mask);
});

test('anti-aliasing speckle and a one-pixel nudged edge are not changes', () => {
  const edge = (at) => pic(120, 60, (x) => (x < at ? [30, 30, 30] : null));
  assert.deepEqual(compareScreen(side(edge(60)), side(edge(61)), 1).changes, []);
  const speck = pic(120, 60, (x, y) => (x === 10 && y === 10 ? [0, 0, 0] : null));
  assert.deepEqual(compareScreen(side(pic(120, 60, () => null)), side(speck), 1).changes, []);
});

test('a changed pixel area that a changed element explains is not also reported as pixels', () => {
  const b = pic(200, 100, () => null), a = pic(200, 100, (x, y) => (x >= 50 && x < 80 && y >= 40 && y < 60 ? [220, 30, 30] : null));
  const r = compareScreen(side(b, [el('control', 'button', 'Go', 48, 38, 36, 26)]), side(a, [el('control', 'button', 'Go', 48, 38, 36, 26, { style: { ...style, background: 'rgb(220, 30, 30)' } })]), 1);
  assert.deepEqual(r.changes.map((c) => c.kind), ['restyled']);
});

test('content pushed down by an inserted row is not a wall of changed pixels', () => {
  const band = (y0) => (x, y) => (y >= y0 && y < y0 + 10 && x > 20 && x < 150 ? [10, 10, 200] : null);
  const b = pic(200, 200, band(100)), a = pic(200, 200, (x, y) => band(140)(x, y) ?? (y >= 100 && y < 130 && x > 20 && x < 90 ? [200, 160, 0] : null));
  const bEls = [el('control', 'button', 'Top', 10, 10), el('control', 'button', 'X', 20, 100, 130, 10), el('control', 'button', 'Y', 20, 120, 50, 10), el('control', 'button', 'Z', 20, 130, 50, 10)];
  const aEls = [el('control', 'button', 'Top', 10, 10), el('control', 'button', 'X', 20, 140, 130, 10), el('control', 'button', 'Y', 20, 160, 50, 10), el('control', 'button', 'Z', 20, 170, 50, 10), el('control', 'button', 'New', 20, 100, 70, 30)];
  const r = compareScreen(side(b, bEls), side(a, aEls), 1);
  assert.equal(r.shift, 40);
  assert.deepEqual(r.changes.map((c) => c.kind), ['added']);
});

test('a countdown or a spinner changing by itself is not a wording change', () => {
  const r = run([el('text', null, '5-hour limit · resets in 3h 0m', 10, 10), el('text', null, '⠋', 10, 50, 10, 16)], [el('text', null, '5-hour limit · resets in 2h 59m', 10, 10), el('text', null, '⠙', 10, 50, 10, 16, { style: { ...style, color: 'rgb(9, 9, 9)' } })]);
  assert.deepEqual(r.changes, []);
});

test('a version number or a real number change in a sentence still counts', () => {
  assert.deepEqual(kinds(run([el('text', null, 'Version 1.3.3', 10, 10)], [el('text', null, 'Version 1.3.4', 10, 10)])), ['text']);
});

test('a tiny glyph-edge difference is forgiven but a flat colour shift is not', () => {
  const text = (g) => pic(100, 40, (x, y) => (y > 15 && y < 25 && x > 20 && x < 60 ? [g, g, g] : null));
  assert.deepEqual(compareScreen(side(text(0)), side(pic(100, 40, (x, y) => (y > 15 && y < 25 && x > 20 && x < 60 ? [(x % 2) ? 30 : 0, 0, 0] : null))), 1).changes, []);
  const flat = (v) => pic(100, 40, () => [v, 200, 200]);
  assert.equal(compareScreen(side(flat(200)), side(flat(150)), 1).changes[0].kind, 'pixels');
});

test('the recorder expression is valid script text (it is sent to the page as text)', async () => {
  const { MEASURE_ELEMENTS } = await import('../elements.mjs');
  assert.doesNotThrow(() => new Function(`return ${MEASURE_ELEMENTS}`));
});

test('a clock time or a spinner glyph inside a label is not a wording change either', () => {
  const r = run([el('control', 'button', '⠧ 1 Subagent', 10, 10), el('text', null, 'Sent 4:13 PM', 10, 50)], [el('control', 'button', '⠦ 1 Subagent', 10, 10), el('text', null, 'Sent 4:22 PM', 10, 50)]);
  assert.deepEqual(r.changes, []);
  assert.deepEqual(kinds(run([el('text', null, 'Sent 4:13 PM', 10, 50)], [el('text', null, 'Posted 4:13 PM', 10, 50)])), ['text']);
});

test('a swap between two of the app\'s random thinking phrases is not a wording change; other words still are', () => {
  const phrases = randomPhrasesFrom("const THINKING_LINES = [\n  'Calibrating',\n  \"Perplexing\",\n];");
  assert.deepEqual(phrases, ['Calibrating', 'Perplexing']);
  rememberRandomPhrases(phrases);
  assert.equal(volatileText('Calibrating', 'Perplexing'), true);
  assert.equal(volatileText('Calibrating', 'Save'), false);
});

test('flicker filter: a difference where a side differs from its own second picture is dropped and counted', () => {
  const block = (c) => pic(200, 100, (x, y) => (x >= 50 && x < 80 && y >= 40 && y < 60 ? c : null));
  const b = pic(200, 100, () => null);
  // after = red block; after's own second picture = no block, so the spot flickers
  const kept = compareScreen(side(b), side(block([220, 30, 30])), 1, {});
  assert.equal(kept.changes.length, 1);
  const dropped = compareScreen(side(b), side(block([220, 30, 30])), 1, { after: pic(200, 100, () => null) });
  assert.deepEqual(dropped.changes, []); assert.equal(dropped.unstable, 1);
  // the same reasoning on the before side
  const droppedB = compareScreen(side(b), side(block([220, 30, 30])), 1, { before: block([0, 0, 255]) });
  assert.equal(droppedB.unstable, 1);
  // a steady side (second picture identical) keeps the change
  const steady = compareScreen(side(b), side(block([220, 30, 30])), 1, { after: block([220, 30, 30]), before: pic(200, 100, () => null) });
  assert.equal(steady.changes.length, 1); assert.ok(!steady.unstable);
});

test('a row pushed sideways as a whole by a changed clock is not a list of moves', () => {
  const row = (dx, clock) => [el('text', null, clock, 10, 10, 90 + dx / 2, 15), el('text', null, 'Cost:', 120 + dx, 10, 30, 15), el('text', null, '$0.42', 160 + dx, 10, 30, 15), el('text', null, 'In:', 200 + dx, 10, 20, 15)];
  const r = run(row(0, 'Saturday @ 6:42pm'), row(20, 'Saturday @ 7:04pm'));
  assert.deepEqual(r.changes, []);
  assert.deepEqual(kinds(run([el('control', 'button', 'Solo', 100, 10)], [el('control', 'button', 'Solo', 130, 10)])), ['moved'], 'one element moving alone still counts');
});

test('an Office text cursor (a thin one-line region) is ignored only on office screens', () => {
  const b = pic(300, 120, () => null), a = pic(300, 120, (x, y) => (x >= 100 && x < 103 && y >= 50 && y < 67 ? [0, 0, 0] : null));
  assert.equal(compareScreen(side(b), side(a), 1, {}, { ignoreCaret: true }).changes.length, 0);
  assert.equal(compareScreen(side(b), side(a), 1, {}, {}).changes.length, 1);
});

test('flicker also drops element changes that sit on a spot the side itself flickers at', () => {
  const b = pic(200, 100, () => null), a = pic(200, 100, (x, y) => (x >= 50 && x < 90 && y >= 40 && y < 60 ? [220, 30, 30] : null));
  const bEls = [el('text', null, 'Slide one', 50, 40, 40, 20)], aEls = [el('text', null, 'Slide two', 50, 40, 40, 20)];
  assert.equal(compareScreen(side(b, bEls), side(a, aEls), 1, {}).changes.length, 1);
  const r = compareScreen(side(b, bEls), side(a, aEls), 1, { after: pic(200, 100, () => null) });
  assert.deepEqual(r.changes, []); assert.ok(r.unstable >= 1);
});

test('a popup owns only the changes on it; a change on the page behind belongs to that page', () => {
  const popup = { x: 310, y: 238, w: 820, h: 424 };
  const behind = { kind: 'pixels', box: { x: 112, y: 142, w: 11, h: 11 } }, onIt = { kind: 'text', box: { x: 400, y: 300, w: 80, h: 20 } };
  const r = keepInsidePanel([behind, onIt], popup, popup, 1440, 900);
  assert.deepEqual(r.changes, [onIt]);
  assert.equal(r.outside, 1);
  // a screen that fills the window, or one whose mark is too small to be the screen, keeps everything
  assert.equal(keepInsidePanel([behind], { x: 0, y: 0, w: 1440, h: 900 }, null, 1440, 900).changes.length, 1);
  assert.equal(keepInsidePanel([behind], { x: 0, y: 0, w: 12, h: 12 }, null, 1440, 900).changes.length, 1);
});

test('a page that only sits lower (no element list explains it) is one shift, not a wall of little boxes', () => {
  // text-like rows at uneven spacing (a repeating pattern would line up at more than one offset); in the after picture everything from y 40 down sits 12 px lower
  const rowOn = Array.from({ length: 240 }, (_, i) => (Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1) < 0.3);
  const stripes = (off) => (x, y) => { const yy = y >= 40 ? y - off : y; return yy >= 0 && rowOn[yy] && x % 7 < 5 && x > 10 && x < 290 ? [30, 30, 30] : null; };
  const r = compareScreen(side(pic(300, 240, stripes(0)), []), side(pic(300, 240, stripes(12)), []), 1);
  assert.equal(r.shift, 12);
  assert.ok(r.changes.length <= 1, `left over: ${r.changes.length} boxes`);
});
