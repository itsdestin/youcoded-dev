import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { L, LEN, type BeatModule } from './beat';

// Beat 2 (bars 2–5): the Briefing quick chip. The trim puts the chip's click
// release three frames after bar 2's downbeat, so the click and the bar land together.
const FROM = markFrame('promo-quick-chip', 'chip', 'end', -3) - L('b2', 2);
const P = perch(0.3);
assertClipCovers('promo-quick-chip', FROM, LEN('b2'));
const Beat2: React.FC = () => (
  <AbsoluteFill>
    <Footage file="promo-quick-chip" from={FROM} pushIn={0.02} />
    <Caption head={CAPTIONS.b2.head} sub={CAPTIONS.b2.sub} at={L('b2', 2) + 4} theme="midnight" />
  </AbsoluteFill>
);
export const beat2: BeatModule = { id: 'b2', slug: 'midnight', home: P, Component: Beat2, cues: [{ at: L('b2', 3), pose: 'curious' }] };
