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
// window settles smaller, the WORDMARK sits under it with the platforms line and
// the link, the host waves and cheers through the outro and hops out on the
// final hit (bar 33). The review of draft 7: 12 s with nothing changing, the
// app's name only in the URL, the host gone after five seconds.
const SCALE = 0.7;
const DY = -96;
const R = windowRect(SCALE);
const CAP_TOP = R.y + DY + R.h + 30;            // the wordmark follows the smaller window down
const OUT = L('b8', 33);
assertClipCovers('promo-idle-golden', 0, LEN('b8'));
const P = { x: perch(0.3, SCALE).x, y: perch(0.3, SCALE).y + DY };
const Beat8: React.FC = () => (
  <AbsoluteFill>
    <Footage file="promo-idle-golden" from={0} scale={SCALE} dy={DY} />
    <Caption head={CAPTIONS.b1.head} at={L('b8', 29) + 4} theme="golden-sunbreak" top={CAP_TOP} size={84} headColor="#fff" />
    <Caption head={CAPTIONS.b8.head} sub={CAPTIONS.b8.sub} at={L('b8', 30)} subAt={L('b8', 30) + 6} theme="golden-sunbreak" top={CAP_TOP + 104} size={36} />
    <Caption head={CAPTIONS.link} at={L('b8', 31)} theme="golden-sunbreak" top={CAP_TOP + 104 + CAPTION.h - 14} size={28} headColor="#ffc030" />
    <Sfx at={OUT} name="pop" volume={0.45} />
  </AbsoluteFill>
);
export const beat8: BeatModule = { id: 'b8', slug: 'golden-sunbreak', home: P, Component: Beat8,
  cues: [
    { at: L('b8', 29) + 6, pose: 'welcome' },
    { at: L('b8', 31), pose: 'cheer' },
    { at: L('b8', 31) + 20, pose: 'welcome' },
    { at: OUT, y: -320, hop: true, hidden: true },            // hops out of the top of frame on the final hit
  ] };
