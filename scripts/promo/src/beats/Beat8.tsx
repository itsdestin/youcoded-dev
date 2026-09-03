import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Backdrop } from '../Backdrop';
import { FootageWithStillTail } from '../Footage';
import { Caption } from '../Caption';
import { Mascot } from '../Mascot';
import { CAPTIONS } from '../captions';
import { perch, windowRect } from '../layout';
import { barFrame } from '../grid';
import { Sfx } from './sfx';

// Beat 8 (bars 29–33), the close: the window settles smaller, the caption and
// the link sit under it, and the host waves and hops out of the top of frame.
const BEAT = barFrame(34) - barFrame(29);       // 306 — no transition follows
const SCALE = 0.82;
const DY = -60;
const R = windowRect(SCALE);
const CAP_TOP = R.y + DY + R.h + 36;            // the caption follows the smaller window down
const P = perch(0.3, SCALE);

export const Beat8: React.FC = () => (
  <AbsoluteFill>
    <Backdrop theme="golden" />
    {/* The golden idle recording is a 2.5 s hold and this end card runs 10.2 s,
        so it loops — nothing on that screen moves. */}
    <FootageWithStillTail file="promo-idle-golden" from={0} beatFrames={BEAT} tail={70} scale={SCALE} dy={DY} />
    <Caption text={CAPTIONS.b8} at={6} top={CAP_TOP} size={40} />
    <Caption text={CAPTIONS.link} at={barFrame(1)} top={CAP_TOP + 62} size={30} color="#ffc030" />
    <Mascot cues={[
      { at: 0, x: P.x, y: P.y + DY, pose: 'welcome', costume: 'golden' },
      { at: barFrame(3), y: -320 },                 // hops out of the top of frame
    ]} />
    <Sfx at={barFrame(3)} name="pop" volume={0.45} />
  </AbsoluteFill>
);
