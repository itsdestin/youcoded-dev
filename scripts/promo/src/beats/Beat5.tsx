import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Backdrop } from '../Backdrop';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { Mascot } from '../Mascot';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { barFrame } from '../grid';
import { CUT } from '../timeline';
import { markFrame, assertClipCovers } from '../marks';

// Beat 5 (bars 14–15), the break: one pill dragged two places left. No push-in
// — the music drops out here, so the only motion should be the drag itself.
const BEAT = barFrame(16) - barFrame(14) + CUT;
// The shot is anchored to the drag's RELEASE, not its start: 0.2 s after the
// pill lands the recording switches to an empty new session, and draft round 1
// ended the beat on that blank window. Ending exactly on the release also puts
// the pill's landing on the last frame before the cut.
const FROM = markFrame('promo-strip', 'drag', 'end') - BEAT;
const P = perch();
assertClipCovers('promo-strip', FROM, BEAT);

export const Beat5: React.FC = () => (
  <AbsoluteFill>
    <Backdrop theme="midnight" />
    <Footage file="promo-strip" from={FROM} />
    <Caption text={CAPTIONS.b5} at={8} />
    <Mascot cues={[
      { at: 0, x: P.x, y: P.y, pose: 'idle' },
      { at: 24, pose: 'curious' },                 // head turns as the pill goes by
    ]} />
  </AbsoluteFill>
);
