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
// WHY the trim comes from the 'gold' mark and not the 'flip' one: 'flip' is
// when the scene FIRES the theme change; 'gold' is an in-page observer that
// resolves the moment the app's own `data-theme` attribute becomes
// 'golden-sunbreak'. The recorder already subtracts its own 100 ms capture lag
// from every mark, so all that is left is the browser's paint: measured on two
// takes, the first gold frame lands +1.4 and +1.5 frames after
// markSec('promo-theme','gold','end').
// The offset here is 2, not 1, because markFrame ROUNDS the mark down: this
// take's gold mark ends at 11.481 s = clip frame 344.43, which rounds to 344,
// and 344 + 1.5 is clip frame 346. Verified on the round-4 render with the
// nudge at 1 — the app was still dark on bar 23 (composition frame 1403, window
// mean RGB 16.98/22.24/29.52) and turned gold one frame late at 1404
// (90.64/99.21/107.35), while the backdrop and the host turned on 1403.
// Re-measure whenever promo-theme is re-filmed.
const FROM = markFrame('promo-theme', 'gold', 'end', 2) - FLIP;
if (FROM < 0) throw new Error('the theme recording has less than two bars before the flip; re-film with a longer hold');
assertClipCovers('promo-theme', FROM, BEAT);
const P = perch();

export const Beat7: React.FC = () => (
  <AbsoluteFill>
    <Backdrop theme="midnight" switchAt={FLIP} />
    {/* The take holds 14 s after the flip, so this is real footage end to end —
        the still-tail loop the old short take needed is gone. */}
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
