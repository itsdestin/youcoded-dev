import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Backdrop } from '../Backdrop';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { Mascot } from '../Mascot';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { barFrame, BAR_S } from '../grid';
import { CUT } from '../timeline';
import { markFrame, markSec, assertClipCovers } from '../marks';

// Beat 3 (bars 6–9): the spreadsheet. Two shots of ONE recording — the request
// going out, then a jump to the re-opened, sorted sheet.
const BEAT = barFrame(10) - barFrame(6) + CUT;
const CUT_AT = barFrame(3);                    // 183 — the jump lands on bar 9's downbeat
const A_FROM = markFrame('promo-sheet', 'attach', 'start', -6);
// The recording spends ~12.4 s between attaching the file and the reply
// landing; three bars is 6.1 s, so the shot has to run fast. Capped at 1.6:
// past that the typing reads as a glitch rather than as someone typing.
const A_RATE = Math.min(1.6, Math.max(1, (markSec('promo-sheet', 'reply', 'end') - markSec('promo-sheet', 'attach', 'start')) / (3 * BAR_S)));
const B_FROM = markFrame('promo-sheet', 'after', 'end', -6);
const P = perch();
const LEAN = perch(0.62);                      // leans toward the files panel on the right
assertClipCovers('promo-sheet', A_FROM, CUT_AT, A_RATE);
assertClipCovers('promo-sheet', B_FROM, BEAT - CUT_AT);

export const Beat3: React.FC = () => (
  <AbsoluteFill>
    <Backdrop theme="midnight" />
    <Sequence durationInFrames={CUT_AT}><Footage file="promo-sheet" from={A_FROM} rate={A_RATE} /></Sequence>
    <Sequence from={CUT_AT}><Footage file="promo-sheet" from={B_FROM} pushIn={0.03} /></Sequence>
    <Caption text={CAPTIONS.b3} at={12} />
    <Mascot cues={[
      { at: 0, x: P.x, y: P.y, pose: 'idle' },
      { at: 30, x: LEAN.x, y: LEAN.y, pose: 'curious' },
    ]} />
  </AbsoluteFill>
);
