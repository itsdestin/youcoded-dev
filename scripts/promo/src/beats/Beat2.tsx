import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { A } from '../host/engine';
import { L, LEN, type BeatModule } from './beat';

// Beat 2 (bars 2–5): just ask, in Cotton Candy Sky. The chip's click release
// lands three frames after bar 2's downbeat. The clip runs at 1.6× so the brief
// itself is on screen inside the beat.
const RATE = 1.6;
const FROM = markFrame('promo-quick-chip', 'chip', 'end', -3) - Math.round(L('b2', 2) * RATE);
const P = perch(0.3);
assertClipCovers('promo-quick-chip', FROM, LEN('b2'), RATE);
const Beat2: React.FC = () => (
  <AbsoluteFill>
    <Footage file="promo-quick-chip" from={FROM} rate={RATE} pushIn={0.02} light />
    <Caption head={CAPTIONS.b2.head} sub={CAPTIONS.b2.sub} at={L('b2', 2) + 4} theme="cotton-candy-sky" />
  </AbsoluteFill>
);
export const beat2: BeatModule = { id: 'b2', slug: 'cotton-candy-sky', home: P, Component: Beat2,
  host: [A.look(L('b2', 3), 10, 0.3, 0.45), A.blink(L('b2', 4)), A.look(L('b2', 4) + 10, 10, 0, 0)] };   // watches the reply come in
