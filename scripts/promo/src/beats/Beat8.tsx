import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { CAPTIONS } from '../captions';
import { perch, windowRect, CAPTION } from '../layout';
import { assertClipCovers } from '../marks';
import { L, LEN, type BeatModule } from './beat';
import { Sfx } from './sfx';

// Beat 8 (bars 29–33 + the audio tail), the close, back in Golden Sunbreak: the
// window settles smaller, the caption and the link sit under it, the host waves
// and hops out of the top of frame on bar 32.
const SCALE = 0.82;
const DY = -60;
const R = windowRect(SCALE);
const CAP_TOP = R.y + DY + R.h + 36;            // the caption follows the smaller window down
const OUT = L('b8', 32);
assertClipCovers('promo-idle-golden', 0, LEN('b8'));
const P = { x: perch(0.3, SCALE).x, y: perch(0.3, SCALE).y + DY };
const Beat8: React.FC = () => (
  <AbsoluteFill>
    <Footage file="promo-idle-golden" from={0} scale={SCALE} dy={DY} />
    <Caption head={CAPTIONS.b8.head} sub={CAPTIONS.b8.sub} at={L('b8', 29) + 4} theme="golden-sunbreak" top={CAP_TOP} size={40} />
    <Caption head={CAPTIONS.link} at={L('b8', 30)} theme="golden-sunbreak" top={CAP_TOP + CAPTION.h - 8} size={30} headColor="#ffc030" />
    <Sfx at={OUT} name="pop" volume={0.45} />
  </AbsoluteFill>
);
export const beat8: BeatModule = { id: 'b8', slug: 'golden-sunbreak', home: P, Component: Beat8,
  cues: [
    { at: L('b8', 29) + 6, pose: 'welcome' },
    { at: OUT, y: -320, hop: true, hidden: true },            // hops out of the top of frame
  ] };
