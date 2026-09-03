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
import { Sfx } from './sfx';

// Beat 7 (bars 21–28): one continuous shot. The theme request is typed under
// the build, the reply lands, and the whole app turns gold on bar 23's downbeat.
const BEAT = barFrame(29) - barFrame(21) + CUT;
const FLIP = barFrame(2);                       // 122 — bar 23's downbeat
// The trim is chosen BACKWARDS from the flip: whatever the recording did before
// it, the flip has to land on this frame.
//
// PAINT_LAG is why the mark alone is not enough. The 'flip' mark is when the
// scene FIRES the theme change; the app repaints ~0.19 s later (the eval's
// 200 ms settle plus the theme's own fade). Draft round 1 flipped the backdrop
// and the host on bar 23 while the app in the footage stayed dark for another
// sixth of a second.
// RE-MEASURED on the round-3 re-film (the old number was 5, for the old take):
// mean frame colour is 0.071/0.091/0.117 through clip frame 345 and
// 0.364/0.398/0.425 at 346; markFrame rounds the 11.342 s mark to 340, so
// 346 - 340 = 6. Re-measure this whenever promo-theme is re-filmed.
const PAINT_LAG = 6;
const FROM = markFrame('promo-theme', 'flip', 'start', PAINT_LAG) - FLIP;
if (FROM < 0) throw new Error('the theme recording has less than two bars before the flip; re-film with a longer hold');
assertClipCovers('promo-theme', FROM, BEAT);
const P = perch();

export const Beat7: React.FC = () => (
  <AbsoluteFill>
    <Backdrop theme="midnight" switchAt={FLIP} />
    {/* Round 3: the re-filmed take holds 12.4 s after the flip, so this is real
        footage end to end — the still-tail loop the short take needed is gone. */}
    <Footage file="promo-theme" from={FROM} />
    <Caption text={CAPTIONS.b7} at={FLIP + 14} />
    <Mascot cues={[
      { at: 0, x: P.x, y: P.y, pose: 'idle' },
      { at: FLIP, pose: 'shocked', costume: 'golden' },     // changes costume on the flip
      { at: FLIP + 18, pose: 'welcome' },
    ]} />
    <Sfx at={FLIP} name="chime" volume={0.55} />
  </AbsoluteFill>
);
