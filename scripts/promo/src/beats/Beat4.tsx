import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { B, LEN, present, inWindow, type BeatModule } from './beat';

// Beat 4 (4 bars): any AI, cloud or local, in Crème. The status-bar chip is
// clicked, the popup opens on the four favourites, Grok is picked, the chip
// changes, a question is typed and Grok answers. The recording is 8.4 s from
// the click to the reply; the beat is 8.6 s (a bar more since 2026-09-04, for the Grok line) and it runs at 1.35×.
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
const END = LEN('b4');
assertClipCovers('promo-model', FROM, A_LEN, RATE);
assertClipCovers('promo-model', B_FROM, END - A_LEN, RATE);
const Beat4: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={A_LEN}><Footage file="promo-model" from={FROM} rate={RATE} light /></Sequence>
    <Sequence from={A_LEN}><Footage file="promo-model" from={B_FROM} rate={RATE} light /></Sequence>
    <Label text={CAPTIONS.b4.head} at={B('b4', 0) + 4} slug="creme" />
  </AbsoluteFill>
);
// The list opens 0.7 s in and Grok is picked 1.2 s after that — too close for two lines, so
// one line covers the list and the pick, and the second lands with the reply.
//   the model list: the Model dialog sits 32–68 % across, 40–84 % down (measured on the draft); the host stands
//   just RIGHT of its edge, pointing in (a first pass measured it a whole tile off and stood him on the dialog)
//   the reply grows in at the bottom-left; the host stands right of it
const P4 = present('b4', [
  { at: M('list') + 4, say: 'Use any AI, cloud or local.', target: inWindow(0.68, 0.6), stand: 'R', face: 'welcome', until: M('sent') + 4 },
  { at: M('reply') - 2, say: "Behave, Grok, or I'm switching to Claude.", target: inWindow(0.2, 0.6), stand: 'R', face: 'smug', until: END - 8 },
], 'creme', P, END - 8);
export const beat4: BeatModule = { id: 'b4', slug: 'creme', home: P4.home, Component: Beat4, host: P4.host, bubbles: P4.bubbles };
