import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions, summariseTrace } from '../scroll-deferral.mjs';

// Trace timestamps are microseconds. Block is 0..400 ms.
const ev = (name, ms, ph = 'X') => ({ name, ph, ts: 1_000_000 + ms * 1000 });
const base = [ev('sd-block-start', 0, 'R'), ev('sd-block-end', 400, 'R'), ev('Real scroll update input generation', 80, 'n')];

test('the verdict says "scrolled during the block" when the compositor applied the scroll before the block ended', () => {
  const t = summariseTrace([...base, ev('InputHandler::ScrollUpdate', 216)]);
  assert.equal(t.scrolledDuringBlock, true);
  assert.equal(t.compositorScrollUpdateAtMs, 216);
  assert.equal(t.blockLenMs, 400);
});

test('...and "held up" when the scroll only landed after the block (the old non-passive-listener behaviour)', () => {
  const t = summariseTrace([...base, ev('InputHandler::ScrollUpdate', 418)]);
  assert.equal(t.scrolledDuringBlock, false);
});

test('no scroll event at all is "unknown", never a pass', () => {
  assert.equal(summariseTrace(base).scrolledDuringBlock, null);
  assert.match(summariseTrace([]).error, /no block mark/);
});

test('options are bounded', () => {
  assert.equal(parseOptions([]).input, 'x11');
  assert.throws(() => parseOptions(['--input', 'magic']), /x11\|cdp/);
  assert.throws(() => parseOptions(['--block-ms', '10']), /block-ms/);
});
