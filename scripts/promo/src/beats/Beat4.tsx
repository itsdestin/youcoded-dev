import React from 'react';
import { AbsoluteFill } from 'remotion';
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
/** Local frame of a mark in this beat (the clip plays from frame 0 at RATE). */
const M = (mark: string, edge: 'start' | 'end' = 'start') => Math.round((markFrame('promo-model', mark, edge) - FROM) / RATE);
const P = perch(0.3), ABOVE = perch(0.5);                     // the model popup opens in the window's CENTRE
assertClipCovers('promo-model', FROM, LEN('b4'), RATE);
const Beat4: React.FC = () => (
  <AbsoluteFill>
    <Footage file="promo-model" from={FROM} rate={RATE} light />
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
    A.cheer(M('reply') + 4, 26), A.face(M('reply') + 4, 'welcome'), A.blink(M('reply') + 40),
  ],
  bubbles: [{ at: M('list') + 10, until: M('sent') - 34, text: CAPTIONS.b4.sub, slug: 'creme' }] };
