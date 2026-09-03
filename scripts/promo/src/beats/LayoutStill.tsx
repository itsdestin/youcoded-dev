import React from 'react';
import { AbsoluteFill, OffthreadVideo, staticFile } from 'remotion';
import { Backdrop } from '../Backdrop';
import { Footage } from '../Footage';
import { Phone } from '../Phone';
import { Caption } from '../Caption';
import { Mascot } from '../Mascot';
import { CAPTIONS } from '../captions';
import { PHONE, perch } from '../layout';
// Everything the video ever puts on screen, on one frame, so the geometry in
// layout.ts can be approved by eye before a single beat is written.
const P = perch();
export const LayoutStill: React.FC = () => (
  <AbsoluteFill style={{ background: '#0D1117' }}>
    <Backdrop theme="midnight" />
    <Footage file="promo-idle-midnight" from={0} />
    <Mascot cues={[{ at: 0, x: P.x, y: P.y, pose: 'idle' }]} />
    <Phone>
      <OffthreadVideo src={staticFile('footage/promo-phone.webm')} muted style={{ width: PHONE.w, height: PHONE.h }} />
    </Phone>
    {/* at is negative so the spring has already settled on this single frame */}
    <Caption text={CAPTIONS.b3} at={-20} />
  </AbsoluteFill>
);
