import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareLegs, compareMetric, render } from '../lane-report.mjs';
import { legMetrics, summariseFrames, summariseKeys, summariseLoaf, summariseMenus, summariseStalls, summariseSwitch } from '../lane-measure.mjs';

const leg = (scenario, side, repeat, metrics, status = 'ok') => ({ scenario, side, repeat, status, metrics });

test('a difference bigger than the run-to-run spread is called, in the right direction', () => {
  const better = compareMetric('stallCount', [100, 104, 98], [40, 44, 38]);
  assert.equal(better.verdict, 'better');
  assert.equal(better.baseline, 100);
  assert.equal(better.candidate, 40);
  assert.equal(compareMetric('stallCount', [40, 44, 38], [100, 104, 98]).verdict, 'worse');
});

test('a difference inside the noise is "same", even when the middle values differ', () => {
  // medians 100 vs 110, but each side wobbles by 30
  const r = compareMetric('stallCount', [80, 100, 110], [90, 110, 120]);
  assert.equal(r.verdict, 'same');
});

test('a difference under the absolute floor is "same" even with zero noise', () => {
  assert.equal(compareMetric('stallCount', [0, 0, 0], [1, 1, 1]).verdict, 'same'); // floor is 2 stalls
  assert.equal(compareMetric('stallCount', [0, 0, 0], [5, 5, 5]).verdict, 'worse');
});

test('not enough runs is never turned into a verdict', () => {
  assert.equal(compareMetric('stallCount', [10], [50]).verdict, 'not enough runs');
  assert.equal(compareMetric('stallCount', [10, 11], [50]).verdict, 'not enough runs');
  assert.equal(compareMetric('stallCount', [], []).verdict, 'not measured');
});

test('legs that did not run cleanly are listed and left out of the numbers', () => {
  const results = {
    meta: { baseline: 'aaa', candidate: 'bbb', repeats: 3 },
    legs: [
      leg('idle', 'baseline', 1, { stallCount: 100 }), leg('idle', 'baseline', 2, { stallCount: 102 }), leg('idle', 'baseline', 3, { stallCount: 9999 }, 'invalid'),
      leg('idle', 'candidate', 1, { stallCount: 10 }), leg('idle', 'candidate', 2, { stallCount: 12 }),
    ],
  };
  results.legs[2].reason = 'software renderer';
  const cmp = compareLegs(results);
  const idle = cmp.scenarios[0];
  assert.equal(idle.runsBaseline, 2);
  assert.equal(idle.unusable.length, 1);
  const row = idle.rows.find((r) => r.metric === 'stallCount');
  assert.equal(row.baseline, 101); // the invalid 9999 did not pull it up
  assert.equal(row.verdict, 'better');
  const text = render(cmp);
  assert.match(text, /THE SHORT VERSION/);
  assert.match(text, /BETTER/);
  assert.match(text, /Run not counted: baseline #3 invalid - software renderer/);
});

test('the report text says plainly when nothing differs', () => {
  const legs = [];
  for (const side of ['baseline', 'candidate']) for (const r of [1, 2, 3]) legs.push(leg('type', side, r, { keyOver16: 10 + r, loafOver50: 5 }));
  const text = render(compareLegs({ meta: {}, legs }));
  assert.match(text, /No difference beyond run-to-run noise/);
  assert.doesNotMatch(text, /\)   (BETTER|WORSE)$/m);
});

test('raw readings reduce to the numbers a person feels; unmeasured stays unmeasured', () => {
  // key rows: [name, start, processingStart, processingEnd, duration, pill, interactionId]
  const ev = [['keydown', 0, 5, 10, 40, '', 1], ['keydown', 100, 101, 105, 20, '', 2], ['keyup', 200, 201, 202, 300, '', 3]];
  const k = summariseKeys(ev, 100);
  assert.equal(k.over16, 2); // keyup is not counted
  assert.equal(k.max, 40);
  assert.equal(k.p95, 8); // 98 of 100 keys were under the floor, so the slowest 1 in 20 is a fast key
  const loaf = summariseLoaf([[0, 120, 100, 0, 0, [['x', 100, 0, 'renderBig', 'index.js:1']]], [0, 20, 0, 0, 0, []]]);
  assert.equal(loaf.over50, 1);
  assert.equal(loaf.over100, 1);
  assert.match(loaf.topCauses[0].cause, /renderBig/);
  const st = summariseStalls([{ kind: 'main-stall', ms: 500, t: 10_000 }, { kind: 'frame', ms: 900, t: 11_000 }]);
  assert.equal(st.count, 1);
  assert.equal(st.rhythmTested, false); // too few stalls to claim a rhythm
  assert.deepEqual(st.rhythm, []);
  const m = legMetrics('idle', { stallRows: [], cpuPct: 4 });
  assert.equal(m.stallCount, 0);
  assert.equal(m.droppedFrames, undefined); // no trace: not zero, absent
  assert.equal(summariseFrames(null), null);
  assert.equal(summariseFrames([]), null);
});

test('a rhythm is found when many stalls repeat on a timer, and only then', () => {
  const periodic = Array.from({ length: 120 }, (_, i) => ({ kind: 'main-stall', ms: 200, t: 1_000_000 + i * 5000 + 200 }));
  assert.equal(summariseStalls(periodic).rhythm[0]?.periodS, 5);
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const random = Array.from({ length: 120 }, () => ({ kind: 'main-stall', ms: 200, t: 1_000_000 + Math.floor(rand() * 600_000) }));
  assert.equal(summariseStalls(random).rhythm.length, 0);
});

test('menus and switching: missing menus are counted, first open is kept apart from repeats', () => {
  const s = summariseMenus({ session: { opens: [80, 20, 22, 21] }, model: { error: 'not found', opens: [] }, main: { opens: [30, 10, 12] } });
  assert.equal(s.missing, 1);
  assert.equal(s.firstMs, 55); // median of 80 and 30
  assert.equal(s.repeatMs, 20);
  const w = summariseSwitch({ settleMs: [50, 60, 70], wrong: 1, blank: 2 });
  assert.equal(w.p50, 60);
  assert.equal(w.wrong, 3);
});
