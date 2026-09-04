import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, PRE, POST, CUT, TAIL_FRAMES, sequenceFrames, transitionFrames, preFrames, startFrames, localFrame } from './timeline.ts';
const barFrame = (b: number) => Math.round(b * (240 / 118) * 30);
test('beats tile bars 0–34 with no gap or overlap', () => {
  assert.equal(BEATS[0].bars[0], 0); assert.equal(BEATS.at(-1)!.bars[1], 34);
  for (let i = 1; i < BEATS.length; i++) assert.equal(BEATS[i].bars[0], BEATS[i - 1].bars[1]);
});
test('every beat reaches its downbeat exactly PRE frames into its sequence', () => {
  const starts = startFrames(barFrame);
  BEATS.forEach((b, i) => assert.equal(starts[i] + preFrames(b), barFrame(b.bars[0]), b.id));
  assert.equal(preFrames(BEATS[0]), 0);
});
test('the wipe straddles the downbeat: PRE before, POST after', () => {
  assert.equal(CUT, PRE + POST);
  for (const b of BEATS.slice(0, -1)) assert.equal(transitionFrames(b), CUT);
  assert.equal(transitionFrames(BEATS.at(-1)!), 0);
});
test('localFrame puts an absolute bar where the downbeat maths says', () => {
  const b4 = BEATS[3];
  assert.equal(localFrame(b4, b4.bars[0], barFrame), PRE);
  assert.equal(localFrame(b4, 10, barFrame), barFrame(10) - barFrame(8) + PRE);
  assert.equal(localFrame(BEATS[0], 1, barFrame), barFrame(1));
});
test('the last beat carries the audio tail, and the film is the bars plus it', () => {
  const last = BEATS.at(-1)!;
  assert.equal(sequenceFrames(last, barFrame), barFrame(last.bars[1]) - barFrame(last.bars[0]) + PRE + TAIL_FRAMES);
  const total = BEATS.reduce((t, b) => t + sequenceFrames(b, barFrame) - transitionFrames(b), 0);
  assert.equal(total, barFrame(34) + TAIL_FRAMES);
  assert.equal(total, 2149);
});
