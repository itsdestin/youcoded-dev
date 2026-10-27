import test from 'node:test';
import assert from 'node:assert/strict';
import { settleAndCount } from '../dom-settle.mjs';

function fake(read) {
  let clock = 0;
  return { tab: { evaluate: async () => read() }, options: { now: () => clock, wait: async ms => { clock += ms; }, capMs: 2000, stableMs: 500, intervalMs: 250 } };
}
test('settled count is measured only after a finite valid stable interval', async () => {
  const { tab, options } = fake(() => 900);
  const row = await settleAndCount(tab, options);
  assert.equal(row.status, 'measured');
  assert.equal(row.nodes, 900);
  assert.equal(row.samples, 3);
});
test('timeout retains last count as diagnostic evidence, never a passing count', async () => {
  let n = 0;
  const { tab, options } = fake(() => ++n);
  const row = await settleAndCount(tab, options);
  assert.equal(row.status, 'incomplete');
  assert.equal(row.nodes, null);
  assert.equal(row.reason, 'timeout');
  assert.ok(row.lastCount > 0);
});
test('missing or rejected counts cannot settle as a negative budget-passing value', async () => {
  for (const read of [() => -1, () => NaN, () => { throw Error('gone'); }]) {
    const { tab, options } = fake(read);
    const row = await settleAndCount(tab, options);
    assert.equal(row.status, 'incomplete');
    assert.equal(row.nodes, null);
  }
});
test('a never-returning CDP count is bounded outside the surface and timer cleanup is verified', async () => {
  let callback, cleared = false;
  const pending = settleAndCount({ evaluate: () => new Promise(() => {}) }, { now: () => 0, capMs: 1000,
    setTimer: (fn, ms) => { callback = fn; assert.equal(ms, 1000); return 7; }, clearTimer: id => { assert.equal(id, 7); cleared = true; } });
  callback();
  const row = await pending;
  assert.equal(row.status, 'incomplete');
  assert.equal(row.reason, 'timeout');
  assert.equal(row.nodes, null);
  assert.equal(cleared, true);
});

test('sample truncation and invalid caps fail closed', async () => {
  const { tab, options } = fake(() => 10);
  const row = await settleAndCount(tab, { ...options, maxSamples: 1 });
  assert.equal(row.reason, 'sample-cap');
  assert.equal(row.nodes, null);
  await assert.rejects(settleAndCount(tab, { ...options, maxSamples: 10001 }), /cap/);
});
