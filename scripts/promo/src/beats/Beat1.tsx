import React from 'react';
import { IntroVisuals, introActions, IMPACT } from '../intro/Intro';
import { perch } from '../layout';
import { assertClipCovers } from '../marks';
import { L, LEN, present, inWindow, type BeatModule } from './beat';
import { barFrame } from '../grid';
import { PRELUDE } from '../timeline';
import { CAPTIONS } from '../captions';
import { A } from '../host/engine';
import { AbsoluteFill } from 'remotion';
import { Label } from '../Label';

// Beat 1: the punch intro. The prelude (black, silent, the walk) then bars 0–1:
// the burst into Cotton Candy Sky on the hit and the window rising on bar 1.
// The visuals and the host's actions live in intro/Intro.tsx, which is also the
// standalone study clip; this module only places them in the film.
if (IMPACT !== PRELUDE) throw new Error(`Intro IMPACT ${IMPACT} ≠ timeline PRELUDE ${PRELUDE}`);
assertClipCovers('promo-idle-cotton', 0, LEN('b1') - L('b1', 1));
// Once the window has settled, the label takes over from the faded wordmark.
const P1 = present([
  { at: IMPACT + barFrame(1) + 32, say: "Hi! I'm your assistant.", face: 'happy' },
  { at: IMPACT + barFrame(1) + 70, say: 'Let me show you around.', point: 'down', face: 'welcome', until: LEN('b1') - 6 },
], 'cotton-candy-sky', perch(0.3));
const Beat1: React.FC = () => (
  <AbsoluteFill>
    <IntroVisuals />
    <Label text={CAPTIONS.b1.head} at={IMPACT + barFrame(1) + 22} slug="cotton-candy-sky" />
  </AbsoluteFill>
);
export const beat1: BeatModule = { id: 'b1', slug: 'cotton-candy-sky', home: perch(0.3), Component: Beat1, arrival: 'none',
  // on the title bar (lands ~IMPACT + bar 1 + 24): "Hi!" with a wave, then "Let me show you around" pointing at the window
  host: [...introActions(), A.wave(IMPACT + barFrame(1) + 30, 36), ...P1.host],
  themes: [{ at: IMPACT, slug: 'cotton-candy-sky' }],
  bubbles: P1.bubbles };
