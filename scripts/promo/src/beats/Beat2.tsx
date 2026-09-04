import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
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
    <Label text={CAPTIONS.b2.head} at={L('b2', 2) + 4} slug="cotton-candy-sky" />
  </AbsoluteFill>
);
// The host is already on this perch in this costume (the intro put it there), so no
// arrival move. It PRESENTS the chip: points down at the strip as the chip is clicked,
// taps its foot while the assistant works, reads the reply as it streams, nods, and is
// happy at the finished brief.
const C = L('b2', 2) + 3;                                           // the chip's click release
export const beat2: BeatModule = { id: 'b2', slug: 'cotton-candy-sky', home: P, Component: Beat2, arrival: 'none',
  host: [
    A.point(C - 4, 'R', 0.9), A.look(C - 4, 6, 0.2, 0.6), A.face(C, 'curious'),   // "that chip, there"
    A.rest(C + 36), A.tapFoot(C + 40, 36), A.look(C + 40, 8, 0.1, 0.5),           // waits on the assistant
    A.nod(L('b2', 4) - 10), A.face(L('b2', 4) - 10, 'welcome'),                    // reads the reply
    A.face(L('b2', 4) + 24, 'happy'), A.tada(L('b2', 4) + 24, 'C'), A.face(L('b2', 4) + 52, 'welcome'), A.rest(L('b2', 4) + 58),
  ],
  bubbles: [{ at: C + 16, until: LEN('b2') - 20, text: CAPTIONS.b2.sub, slug: 'cotton-candy-sky' }] };
