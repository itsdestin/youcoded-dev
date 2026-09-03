import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAutopilot, marksFile } from './autopilot.mjs';

// A fake clock: sleep advances it, now reads it. No real waiting.
function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

test('presses when the predicate is true, respecting minGap', async () => {
  const c = clock(); const presses = [];
  let calls = 0;
  const r = await runAutopilot({
    ...c, ms: 1000, every: 25, minGap: 100,
    evaluate: async () => { calls++; return true; },   // always wants to flap
    press: async (k) => { presses.push([k, c.now()]); },
    key: 'Space', when: 'true',
  });
  assert.equal(r.polls, 40);                    // 1000 / 25
  assert.equal(r.presses, presses.length);
  assert.equal(presses.length, 10);             // one per 100 ms, not one per poll
  assert.ok(presses.every(([k]) => k === 'Space'));
});

test('never presses when the predicate stays false', async () => {
  const c = clock(); let n = 0;
  const r = await runAutopilot({ ...c, ms: 500, every: 50, minGap: 0,
    evaluate: async () => false, press: async () => { n++; }, key: 'Space', when: 'false' });
  assert.equal(n, 0); assert.equal(r.polls, 10); assert.equal(r.presses, 0);
});

test('a throwing predicate counts as false and does not abort the loop', async () => {
  const c = clock(); let n = 0; let i = 0;
  await runAutopilot({ ...c, ms: 200, every: 50, minGap: 0,
    evaluate: async () => { if (i++ === 0) throw new Error('not mounted yet'); return true; },
    press: async () => { n++; }, key: 'Space', when: 'x' });
  assert.equal(n, 3);
});

test('marksFile turns wall-clock stamps into video seconds and keeps the label', () => {
  const m = marksFile({ fps: 30, width: 1440, height: 900, firstFrameAt: 1000, duration: 4.2,
    stamps: [{ i: 0, kind: 'hold', mark: null, start: 1000, end: 1900 }, { i: 1, kind: 'clickText', mark: 'chip', start: 1900, end: 2300 }] });
  assert.equal(m.fps, 30); assert.equal(m.width, 1440); assert.equal(m.duration, 4.2);
  assert.deepEqual(m.actions[1], { i: 1, kind: 'clickText', mark: 'chip', start: 0.9, end: 1.3 });
  assert.equal(m.actions[0].mark, null);
});
