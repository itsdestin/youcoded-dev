import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
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
const P = perch(0.3);
assertClipCovers('promo-model', FROM, LEN('b4'), RATE);
const Beat4: React.FC = () => (
  <AbsoluteFill>
    <Footage file="promo-model" from={FROM} rate={RATE} light />
    <Caption head={CAPTIONS.b4.head} sub={CAPTIONS.b4.sub} at={L('b4', 10) + 4} theme="creme" />
  </AbsoluteFill>
);
export const beat4: BeatModule = { id: 'b4', slug: 'creme', home: P, Component: Beat4,
  host: [A.look(L('b4', 10) + 20, 10, 0.2, 0.5), A.face(L('b4', 11), 'curious'), A.tilt(L('b4', 11), 10, 6), A.blink(L('b4', 12)), A.face(L('b4', 12) + 20, 'welcome'), A.tilt(L('b4', 12) + 20, 10, 0)] };
