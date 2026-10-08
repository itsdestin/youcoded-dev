import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEvent, summariseEvents, targetFromHitches, calibrate, humanPlan, humanGapMs, rng, resolveFactors, pickBySize, dist, pctl } from '../realism-stats.mjs';

test('splitEvent: delay, handler and presentation add up to the duration', () => {
  const s = splitEvent(['pointerdown', 100, 110, 190, 264, 'x', 1]);
  assert.equal(s.delay, 10); assert.equal(s.proc, 80); assert.equal(s.pres, 174);
  assert.equal(s.delay + s.proc + s.pres, 264);
});

test('summariseEvents: slow share and per-minute rate use the 104 ms floor', () => {
  const ev = [96, 104, 120, 300].map(d => ({ name: 'pointerdown', dur: d, delay: 0, proc: 10, pres: d - 10 }));
  const s = summariseEvents(ev, { minutes: 2 });
  assert.equal(s.byType.pointerdown.slowN, 3);
  assert.equal(s.all.slowPerMin, 1.5);
  assert.equal(s.all.dur.max, 300);
});

test('targetFromHitches reads only event rows with enough sessions', () => {
  const rows = [
    { kind: 'event', type: 'pointerdown', d: 120, delay: 1, proc: 80, pres: 39, sessions: 4, ts: '2026-10-05T08:47:11Z' },
    { kind: 'event', type: 'click', d: 256, delay: 183, proc: 0, pres: 73, sessions: 4, ts: '2026-10-05T08:47:12Z' },
    { kind: 'event', type: 'click', d: 500, delay: 0, proc: 0, pres: 500, sessions: 0, ts: '2026-10-05T08:48:12Z' },
    { kind: 'frame', d: 900, sessions: 4, ts: '2026-10-05T08:49:00Z' },
  ];
  const t = targetFromHitches(rows);
  assert.equal(t.events, 2); assert.equal(t.activeMinutes, 1); assert.equal(t.perActiveMinute, 2);
  assert.equal(t.all.dur.max, 256);
});

test('calibrate: within 2x both ways, and a far-too-low lab fails', () => {
  const target = { perActiveMinute: 20, all: { dur: { p95: 400, max: 700 }, pres: { max: 300 }, proc: { max: 400 } } };
  const good = calibrate({ dur: { max: 500 }, slowDur: { p95: 300 }, slowPerMin: 15, pres: { max: 200 }, proc: { max: 300 } }, target);
  assert.equal(good.calibrated, true);
  const low = calibrate({ dur: { max: 40 }, slowDur: { p95: null }, slowPerMin: 0, pres: { max: 20 }, proc: { max: 20 } }, target);
  assert.equal(low.calibrated, false);
});

test('humanPlan is deterministic, never targets the session already showing, keeps gaps human', () => {
  const a = humanPlan({ seed: 's', seconds: 60, count: 4 }), b = humanPlan({ seed: 's', seconds: 60, count: 4 });
  assert.deepEqual(a, b);
  let cur = 0;
  for (const p of a.plan) { if (p.kind === 'click') { assert.notEqual(p.idx, cur); cur = p.idx; } if (p.kind === 'kbd') cur = (cur + 1) % 4; }
  const r = rng('g'); for (let i = 0; i < 500; i++) { const g = humanGapMs(r); assert.ok(g >= 150 && g <= 2400); }
  assert.ok(a.clicks > 60);
});

test('resolveFactors validates', () => {
  assert.equal(resolveFactors('real-use').display, 'gpu');
  assert.equal(resolveFactors('real-use', { display: 'xvfb' }).display, 'xvfb');
  assert.throws(() => resolveFactors('real-use', { build: 'nope' }));
  assert.throws(() => resolveFactors('real-use', { sessions: 7 }));
});

test('pickBySize spans small to large, distinct, honours the cap', () => {
  const now = Date.now();
  const files = Array.from({ length: 30 }, (_, i) => ({ size: 50e3 * (i + 1) ** 2, mtimeMs: now - 1000 }));
  const idx = pickBySize(files, 4, { now, maxBytes: 20e6 });
  assert.equal(new Set(idx).size, 4);
  const sizes = idx.map(i => files[i].size);
  assert.ok(sizes.every(s => s <= 20e6)); assert.ok(sizes[0] < sizes[3]);
  assert.throws(() => pickBySize(files.slice(0, 2), 4, { now }));
});

test('dist and pctl handle empties', () => {
  assert.equal(pctl([], 95), null); assert.equal(dist([]).n, 0);
});
