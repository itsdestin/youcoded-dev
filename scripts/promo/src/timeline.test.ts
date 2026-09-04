import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, PRE, POST, CUT, PRELUDE, TAIL_FRAMES, sequenceFrames, transitionFrames, preFrames, startFrames, localFrame, absBar } from './timeline.ts';
const barFrame = (b: number) => Math.round(b * (240 / 112) * 30);   // 112 BPM since 2026-09-04
test('beats tile bars 0–44 with no gap or overlap', () => {
  assert.equal(BEATS[0].bars[0], 0); assert.equal(BEATS.at(-1)!.bars[1], 44);
  for (let i = 1; i < BEATS.length; i++) assert.equal(BEATS[i].bars[0], BEATS[i - 1].bars[1]);
});
test('every beat reaches its first downbeat exactly preFrames into its sequence, PRELUDE after the film starts', () => {
  const starts = startFrames(barFrame);
  BEATS.forEach((b, i) => assert.equal(starts[i] + preFrames(b), absBar(b.bars[0], barFrame), b.id));
  assert.equal(preFrames(BEATS[0]), PRELUDE);
  assert.equal(starts[0], 0);
});
test('the wipe straddles the downbeat: PRE before, POST after; the first cut is a hard cut with the same maths', () => {
  assert.equal(CUT, PRE + POST);
  for (const b of BEATS.slice(0, -1)) assert.equal(transitionFrames(b), CUT);
  assert.equal(transitionFrames(BEATS.at(-1)!), 0);
});
test('localFrame puts an absolute bar where the downbeat maths says', () => {
  const b6 = BEATS[5];
  assert.equal(localFrame(b6, b6.bars[0], barFrame), PRE);
  assert.equal(localFrame(b6, 20, barFrame), barFrame(20) - barFrame(18) + PRE);
  assert.equal(localFrame(BEATS[0], 1, barFrame), PRELUDE + barFrame(1));
});
test('the last beat carries the audio tail, and the film is the prelude plus the bars plus it', () => {
  const last = BEATS.at(-1)!;
  assert.equal(sequenceFrames(last, barFrame), barFrame(last.bars[1]) - barFrame(last.bars[0]) + PRE + TAIL_FRAMES);
  const total = BEATS.reduce((t, b) => t + sequenceFrames(b, barFrame) - transitionFrames(b), 0);
  assert.equal(total, PRELUDE + barFrame(44) + TAIL_FRAMES);
});
