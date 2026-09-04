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
// arrival move. Its hello from beat 1 is still up until local 37, so the first line
// waits for it. Two lines, not three: the beat is 6.7 s and each line needs ~2 s to read.
//   the Briefing chip (measured on the draft: 35 % across, 87 % down the window)
//   the reply, top-left; its right edge is ~40 % across so the host stands beyond it
const END = LEN('b2');
const P2 = present('b2', [
  { at: 48, say: 'Tap a chip.', target: inWindow(0.355, 0.867), stand: 'above', face: 'welcome' },
  { at: 116, say: 'Notes in, brief out.', target: inWindow(0.40, 0.16), stand: 'R', face: 'happy', until: END - 8 },
], 'cotton-candy-sky', P, END - 8);
export const beat2: BeatModule = { id: 'b2', slug: 'cotton-candy-sky', home: P, Component: Beat2, arrival: 'none', host: P2.host, bubbles: P2.bubbles };
