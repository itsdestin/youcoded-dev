import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { A } from '../host/engine';
import { L, LEN, type BeatModule } from './beat';

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
const P = perch(0.3), ABOVE = perch(0.4);                     // the model popup opens in the window's centre; 0.4 keeps its feet off the tab
assertClipCovers('promo-model', FROM, A_LEN, RATE);
assertClipCovers('promo-model', B_FROM, LEN('b4') - A_LEN, RATE);
const Beat4: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={A_LEN}><Footage file="promo-model" from={FROM} rate={RATE} light /></Sequence>
    <Sequence from={A_LEN}><Footage file="promo-model" from={B_FROM} rate={RATE} light /></Sequence>
    <Label text={CAPTIONS.b4.head} at={L('b4', 10) + 4} slug="creme" />
  </AbsoluteFill>
);
// The host PRESENTS the picker: walks to the middle of the title bar (above
// the popup), points down at the list as it opens, nods when Grok is picked,
// taps its foot while the question goes out, and cheers the reply.
export const beat4: BeatModule = { id: 'b4', slug: 'creme', home: P, Component: Beat4,
  host: [
    A.walk(24, 24, ABOVE.x, 4), A.look(24, 10, 0.1, 0.5),                            // after the arrival move has settled (~frame 22)
    A.point(M('list') - 2, 'R', 0.85), A.face(M('list'), 'curious'), A.look(M('list'), 6, 0.2, 0.6),   // "there: your models"
    A.nod(M('pick', 'end')), A.face(M('pick', 'end'), 'welcome'), A.rest(M('pick', 'end') + 16),
    A.walk(M('chip2') + 8, 26, P.x, 4), A.look(M('chip2') + 8, 10, 0, 0.3),
    A.tapFoot(M('sent') - 30, 34), A.look(M('sent') - 30, 8, 0.2, 0.5),                            // waits on the answer
    A.cheer(M('reply') - 8, 24), A.face(M('reply') - 8, 'happy'), A.face(M('reply') + 18, 'welcome'), A.blink(M('reply') + 30),   // early enough to finish before the cut
  ],
  bubbles: [{ at: M('list') + 10, until: M('chip2') + 4, text: CAPTIONS.b4.sub, slug: 'creme' }] };   // gone before it walks back
