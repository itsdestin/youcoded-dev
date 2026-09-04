import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { B, LEN, present, inWindow, type BeatModule } from './beat';

// Beat 2 (4 bars; sixth in the film since Destin's reorder of 2026-09-04): repeatable
// prompts — the chips, in Cotton Candy Sky. The chip's click release lands three frames
// after the downbeat. The clip runs at 1.6× so the brief itself is on screen inside the beat.
const RATE = 1.6;
const FROM = markFrame('promo-quick-chip', 'chip', 'end', -3) - Math.round(B('b2', 0) * RATE);
const P = perch(0.3);
assertClipCovers('promo-quick-chip', FROM, LEN('b2'), RATE);
const Beat2: React.FC = () => (
  <AbsoluteFill>
    <Footage file="promo-quick-chip" from={FROM} rate={RATE} pushIn={0.02} light />
    <Label text={CAPTIONS.b2.head} at={B('b2', 0) + 4} slug="cotton-candy-sky" />
  </AbsoluteFill>
);
// The host arrives above the chip row (the first line's stand becomes the beat's home) and
// points down at the Briefing chip as it is tapped, then hops beside the reply as it streams.
//   the Briefing chip (measured on the draft: 35 % across, 87 % down the window)
//   the reply, top-left; its right edge is ~40 % across so the host stands beyond it
const END = LEN('b2');
const P2 = present('b2', [
  { at: 40, say: 'Save repeatable prompts.', target: inWindow(0.355, 0.867), stand: 'above', face: 'welcome' },
  { at: 118, say: 'Or entire workflows. No annoying re-explanation needed.', target: inWindow(0.40, 0.16), stand: 'R', face: 'happy', until: END - 8 },
], 'cotton-candy-sky', P, END - 8);
export const beat2: BeatModule = { id: 'b2', slug: 'cotton-candy-sky', home: P2.home, Component: Beat2, host: P2.host, bubbles: P2.bubbles };
