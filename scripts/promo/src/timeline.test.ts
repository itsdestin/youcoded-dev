import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, CUT, sequenceFrames, transitionFrames, startFrames } from './timeline.ts';
const barFrame = (b: number) => Math.round(b * (240 / 118) * 30);
test('beats tile bars 0–34 with no gap or overlap', () => {
  assert.equal(BEATS[0].bars[0], 0); assert.equal(BEATS.at(-1)!.bars[1], 34);
  for (let i = 1; i < BEATS.length; i++) assert.equal(BEATS[i].bars[0], BEATS[i - 1].bars[1]);
});
test('every beat starts exactly on its downbeat once transitions overlap', () => {
  assert.deepEqual(startFrames(barFrame), BEATS.map((b) => barFrame(b.bars[0])));
});
test('a sequence is padded by exactly the transition that follows it', () => {
  for (const b of BEATS) assert.equal(sequenceFrames(b, barFrame), barFrame(b.bars[1]) - barFrame(b.bars[0]) + transitionFrames(b));
  assert.equal(transitionFrames(BEATS.at(-1)!), 0);
  assert.equal(CUT, 6);
});
