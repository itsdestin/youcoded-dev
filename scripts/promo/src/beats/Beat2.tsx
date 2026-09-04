import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { L, LEN, present, inWindow, type BeatModule } from './beat';

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
const P2 = present([
  { at: C - 2, say: 'Just tap what you need.', spot: inWindow(0.56, 0.905), point: 'L', face: 'welcome' },   // beside the chip strip, pointing at the chips
  { at: C + 62, say: "I'm grabbing your notes…", spot: inWindow(0.74, 0.36), point: 'L', face: 'curious' },   // beside the reply as it streams
  { at: L('b2', 4) + 6, say: "There's your brief.", point: 'L', face: 'happy', until: LEN('b2') - 12 },
], 'cotton-candy-sky', P);
export const beat2: BeatModule = { id: 'b2', slug: 'cotton-candy-sky', home: P, Component: Beat2, arrival: 'none', host: P2.host, bubbles: P2.bubbles };
