import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, PRE, POST, CUT, PRELUDE, TAIL_FRAMES, sequenceFrames, transitionFrames, preFrames, startFrames, localFrame, absBar } from './timeline.ts';
const barFrame = (b: number) => Math.round(b * (240 / 120) * 30);   // 120 BPM since 2026-09-09
test('beats tile bars 0–49 with no gap or overlap', () => {
  assert.equal(BEATS[0].bars[0], 0); assert.equal(BEATS.at(-1)!.bars[1], 49);
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
  const b6 = BEATS.find((b) => b.id === 'b6')!;
  assert.equal(localFrame(b6, b6.bars[0], barFrame), PRE);
  assert.equal(localFrame(b6, b6.bars[0] + 2, barFrame), barFrame(b6.bars[0] + 2) - barFrame(b6.bars[0]) + PRE);
  assert.equal(localFrame(BEATS[0], 1, barFrame), PRELUDE + barFrame(1));
});
test('the last beat carries the audio tail, and the film is the prelude plus the bars plus it', () => {
  const last = BEATS.at(-1)!;
  assert.equal(sequenceFrames(last, barFrame), barFrame(last.bars[1]) - barFrame(last.bars[0]) + PRE + TAIL_FRAMES);
  const total = BEATS.reduce((t, b) => t + sequenceFrames(b, barFrame) - transitionFrames(b), 0);
  assert.equal(total, PRELUDE + barFrame(49) + TAIL_FRAMES);
});
// The music's sections and the film's beats are written in two places (music/song.py PLAN and
// BEATS above) and both were re-keyed by hand three times on 2026-09-09. This pins the joints
// that must agree: drop 1 is the theme beat's third bar (the first flip), drop 2 opens the
// marketplace beat, the break opens the phone beat, groove2 opens the conversations beat and
// the end bar is the last bar of the close. Reads the grid the sequencer wrote.
import { readFileSync } from 'node:fs';
test('the music plan agrees with the beat list at every joint', () => {
  const grid = JSON.parse(readFileSync(new URL('../public/promo.grid.json', import.meta.url), 'utf8')) as { bars: number; sections: { name: string; bar: number }[] };
  const at = (name: string) => grid.sections.find((s) => s.name === name)!.bar;
  const beat = (id: string) => BEATS.find((b) => b.id === id)!;
  assert.equal(grid.bars, BEATS.at(-1)!.bars[1]);
  assert.equal(at('drop1'), beat('b3').bars[0] + 2);
  assert.equal(at('drop2'), beat('b9').bars[0]);
  assert.equal(at('hook'), beat('b6').bars[0]);
  assert.equal(at('break'), beat('b8').bars[0]);
  assert.equal(at('groove2'), beat('b7').bars[0]);
  assert.equal(at('end'), beat('b10').bars[1] - 1);
});
