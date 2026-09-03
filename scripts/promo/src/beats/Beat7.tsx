import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Backdrop } from '../Backdrop';
import { FootageWithStillTail } from '../Footage';
import { Caption } from '../Caption';
import { Mascot } from '../Mascot';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { barFrame } from '../grid';
import { markFrame } from '../marks';
import { Sfx } from './sfx';

// Beat 7 (bars 21–28): one continuous shot. The theme request is typed under
// the build, the reply lands, and the whole app turns gold on bar 23's downbeat.
const BEAT = barFrame(29) - barFrame(21) + 6;   // 494
const FLIP = barFrame(2);                       // 122 — bar 23's downbeat
// The trim is chosen BACKWARDS from the flip: whatever the recording did before
// it, the flip has to land on this frame.
//
// PAINT_LAG is why the mark alone is not enough. The 'flip' mark is when the
// scene FIRES the theme change; the app repaints five frames later (the scene's
// eval carries a 200 ms settle). Measured on the recording: the window's colour
// is unchanged through clip frame 347 and different at 348, and 348 - 343 = 5.
// Draft round 1 flipped the backdrop and the host on bar 23 while the app in
// the footage stayed dark for another sixth of a second.
const PAINT_LAG = 5;
const FROM = markFrame('promo-theme', 'flip', 'start', PAINT_LAG) - FLIP;
if (FROM < 0) throw new Error('the theme recording has less than two bars before the flip; re-film with a longer hold');
const P = perch();

export const Beat7: React.FC = () => (
  <AbsoluteFill>
    <Backdrop theme="midnight" switchAt={FLIP} />
    {/* The recording holds 3.8 s after the flip and this beat needs 12.4 s of
        it, so the settled golden screen loops — see FootageWithStillTail. */}
    <FootageWithStillTail file="promo-theme" from={FROM} beatFrames={BEAT} tail={60} />
    <Caption text={CAPTIONS.b7} at={FLIP + 14} />
    <Mascot cues={[
      { at: 0, x: P.x, y: P.y, pose: 'idle' },
      { at: FLIP, pose: 'shocked', costume: 'golden' },     // changes costume on the flip
      { at: FLIP + 18, pose: 'welcome' },
    ]} />
    <Sfx at={FLIP} name="chime" volume={0.55} />
  </AbsoluteFill>
);
