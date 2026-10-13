import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseRun, parseOptions } from '../realism.mjs';
import { table, rowOf } from '../realism-table.mjs';

const ids = ['a', 'b', 'c'];
test('analyseRun: three-way split, identity judged only when the next press is >= 500 ms away', () => {
  const R = {
    ev: [['pointerdown', 100, 105, 185, 300, 'b', 1], ['pointerup', 200, 400, 410, 440, 'b', 1], ['click', 200, 400, 400, 480, 'b', 1], ['keydown', 50, 50, 60, 70, '', 0]],
    cap: [['pointerdown', 100, 'b'], ['pointerdown', 300, 'c'], ['pointerdown', 2000, 'a']],
    pane: [[100, 'b', 'c', 0], [300, 'c', 'a', 0], [2000, 'a', 'a', 0]],
    loaf: [[90, 250, 120, 200, 210, []]], lt: [[90, 250]], flags: {},
  };
  const r = analyseRun(R, [{ kind: 'click', idx: 1 }], ids, 60);
  assert.equal(r.events.byType.pointerdown.dur.max, 300);
  assert.equal(r.events.byType.pointerdown.pres.max, 215);   // 300 - (185-100)
  assert.equal(r.events.byType.pointerup.delay.max, 200);
  assert.equal(r.events.all.n, 3);
  assert.equal(r.eventKinds.keydown, 1);
  // press at 100 was followed by another press at 300 (< 500 ms) -> not judged; press at 300 shows 'a' not 'c' -> wrong; press at 2000 ok
  assert.equal(r.identity.judged, 2); assert.equal(r.identity.wrong, 1);
});

test('parseOptions: presets, overrides, soak and busy-off handling', () => {
  const o = parseOptions(['--preset', 'real-use', '--display', 'xvfb', '--seqs', 'fresh,busy', '--checkout', '/x']);
  assert.equal(o.factors.display, 'xvfb'); assert.deepEqual(o.seqs, ['fresh', 'busy']);
  const c = parseOptions(['--preset', 'cheap', '--seqs', 'fresh,busy', '--checkout', '/x']);
  assert.deepEqual(c.seqs, ['fresh']);               // busy desktop off -> no busy run
  assert.throws(() => parseOptions(['--nope', '1']));
  assert.throws(() => parseOptions(['--seqs', 'bogus']));
});

test('table: one row per cell, worst across boots', () => {
  const mk = (boot, max) => ({ boot, tag: '', factors: { build: 'packaged', history: 'real', theme: 'heavy', display: 'gpu', sessions: 4 }, unusable: false,
    runs: { warm: { events: { all: { n: 100, dur: { p50: 24, p95: 40, max }, slowPerMin: 1, slowDur: { p95: 110 }, proc: { max: 10 }, pres: { max: 20 } } }, loaf: { durMax: 70 }, identity: { wrong: 0, blank: 0, judged: 30 }, loadAvgStart: '1 1 1' } } });
  const t = table([mk(1, 100), mk(2, 300)], 'warm');
  assert.match(t, /\| 2 \|/); assert.match(t, /\| 300 \|/);
  assert.equal(rowOf(mk(1, 100), 'fresh'), null);
});
