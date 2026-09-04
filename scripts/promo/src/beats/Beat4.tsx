import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { L, LEN, present, inWindow, type BeatModule } from './beat';

// Beat 4 (bars 10–13): pick your model, in Crème. The status-bar chip is
// clicked, the popup opens on the four favourites, Grok is picked, the chip
// changes, a question is typed and Grok answers. The recording is 8.4 s from
// the click to the reply and the beat is 6.4 s, so it runs at 1.35×.
const RATE = 1.35;
const FROM = markFrame('promo-model', 'chip', 'start', -15);
// Two shots: A runs from before the click to just after it; B opens with the list already
// there. WHY: between them the picker says "Loading models…" for 1.6 s of footage (the draft review).
const A_LEN = Math.round((markFrame('promo-model', 'chip', 'end', 6) - FROM) / RATE);
const B_FROM = markFrame('promo-model', 'list', 'start', -4);
/** Local frame of a mark in this beat (shot A from frame 0, shot B from A_LEN, both at RATE). */
const M = (mark: string, edge: 'start' | 'end' = 'start') => {
  const fr = markFrame('promo-model', mark, edge);
  return fr < B_FROM ? Math.round((fr - FROM) / RATE) : A_LEN + Math.round((fr - B_FROM) / RATE);
};
const P = perch(0.3);
assertClipCovers('promo-model', FROM, A_LEN, RATE);
assertClipCovers('promo-model', B_FROM, LEN('b4') - A_LEN, RATE);
const Beat4: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={A_LEN}><Footage file="promo-model" from={FROM} rate={RATE} light /></Sequence>
    <Sequence from={A_LEN}><Footage file="promo-model" from={B_FROM} rate={RATE} light /></Sequence>
    <Label text={CAPTIONS.b4.head} at={L('b4', 10) + 4} slug="creme" />
  </AbsoluteFill>
);
const P4 = present([
  { at: M('list') + 2, say: 'Pick whichever brain you like.', spot: inWindow(0.74, 0.74), point: 'L', face: 'welcome' },   // right of the list (clear of its stars), pointing at it
  { at: M('pick', 'end') + 2, say: 'Grok today. Why not.', point: 'L', face: 'happy' },
  { at: M('reply') + 6, say: 'See? Any of them.', spot: inWindow(0.8, 0.72), point: 'L', face: 'happy', until: LEN('b4') - 12 },   // beside the answer
], 'creme', P, LEN('b4') - 12);
export const beat4: BeatModule = { id: 'b4', slug: 'creme', home: P, Component: Beat4, host: P4.host, bubbles: P4.bubbles };
