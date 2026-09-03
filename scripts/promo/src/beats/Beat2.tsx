import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Backdrop } from '../Backdrop';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { Mascot } from '../Mascot';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { barFrame } from '../grid';
import { markFrame, assertClipCovers } from '../marks';

// Beat 2 (bars 2–5): the Briefing quick chip. The trim puts the chip's click
// release on frame 3 of the beat, i.e. three frames after bar 2's downbeat, so
// the click and the bar land together.
const BEAT = barFrame(6) - barFrame(2) + 6;   // 250
const FROM = markFrame('promo-quick-chip', 'chip', 'end', -3);
const P = perch();
assertClipCovers('promo-quick-chip', FROM, BEAT);

export const Beat2: React.FC = () => (
  <AbsoluteFill>
    <Backdrop theme="midnight" />
    <Footage file="promo-quick-chip" from={FROM} pushIn={0.02} />
    <Caption text={CAPTIONS.b2} at={10} />
    <Mascot cues={[{ at: 0, x: P.x, y: P.y, pose: 'idle' }]} />
  </AbsoluteFill>
);
