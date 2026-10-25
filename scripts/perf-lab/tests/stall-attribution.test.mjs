import test from 'node:test';
import assert from 'node:assert/strict';
import { attributeStall } from '../stall-attribution.mjs';

const ipc = { maxMs: 2, openStallMs: null, pings: 4, tickSamples: 4, observedMs: 400, maxTickDelayMs: 1, rejectedPings: 0, sawHidden: false };
const probe = { longtaskSupported: true, longtaskMaxMs: 0, frameGapMaxMs: 17 };
const main = { available: true, invalidClock: false, stopped: true, sampleCount: 4, everyMs: 50, observedMs: 1200, maxDelayMs: 900 };

test('explicit missing renderer windows cannot be healthy even with complete quiet IPC', () => {
  const missing = { windowMs: null, missingMark: 'x:end' };
  assert.equal(attributeStall(ipc, missing).verdict, 'unknown');
  assert.equal(attributeStall(ipc, { ...missing, longtaskMaxMs: 900 }).verdict, 'renderer');
  assert.equal(attributeStall({ ...ipc, maxTickDelayMs: 900 }, missing).verdict, 'renderer');
});

test('zero long tasks do not infer main from slow response', () => {
  assert.equal(attributeStall({ ...ipc, maxMs: 900 }, probe).verdict, 'unclear');
});
test('renderer scheduling is positive evidence even with fast round trips', () => {
  assert.equal(attributeStall({ ...ipc, maxTickDelayMs: 900 }, probe).verdict, 'renderer');
});
test('pending, hidden, rejected, zero-count and missing observations cannot certify none', () => {
  for (const change of [{ openStallMs: 1 }, { sawHidden: true }, { rejectedPings: 1 }, { pings: 0 }, { tickSamples: 0 }, { observedMs: null }]) {
    assert.notEqual(attributeStall({ ...ipc, ...change }, probe).verdict, 'none', JSON.stringify(change));
  }
  assert.notEqual(attributeStall({ maxMs: 1 }, probe).verdict, 'none');
  assert.equal(attributeStall(ipc, probe).verdict, 'none');
});
test('incomplete evidence retains positive observed stalls', () => {
  for (const change of [{ openStallMs: 1 }, { sawHidden: true }, { rejectedPings: 1 }, { pings: 0 }]) {
    const result = attributeStall({ ...ipc, ...change }, { ...probe, longtaskMaxMs: 900 });
    assert.notEqual(result.verdict, 'none');
    assert.match(result.why, /900/);
  }
});
test('independent main requires complete valid samples, not availability alone', () => {
  for (const evidence of [{ available: true, maxDelayMs: 900 }, { ...main, sampleCount: 0 }, { ...main, invalidClock: true }, { ...main, observedMs: NaN }, { ...main, stopped: false }]) {
    assert.notEqual(attributeStall(ipc, probe, { independentMain: evidence }).verdict, 'main');
  }
  assert.equal(attributeStall(ipc, probe, { independentMain: main }).verdict, 'main');
});
