import React from 'react';
import { IntroVisuals, introActions, IMPACT } from '../intro/Intro';
import { perch } from '../layout';
import { assertClipCovers } from '../marks';
import { L, LEN, type BeatModule } from './beat';
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
const Beat1: React.FC = () => (
  <AbsoluteFill>
    <IntroVisuals />
    <Label text={CAPTIONS.b1.head} at={IMPACT + barFrame(1) + 22} slug="cotton-candy-sky" />
  </AbsoluteFill>
);
export const beat1: BeatModule = { id: 'b1', slug: 'cotton-candy-sky', home: perch(0.3), Component: Beat1, arrival: 'none',
  // after the hop onto the title bar (lands ~IMPACT + bar 1 + 18): a ta-da at the window, then the tagline
  host: [...introActions(), A.tada(IMPACT + barFrame(1) + 26, 'C'), A.face(IMPACT + barFrame(1) + 26, 'happy'), A.face(IMPACT + barFrame(1) + 52, 'welcome'), A.rest(IMPACT + barFrame(1) + 60)],
  themes: [{ at: IMPACT, slug: 'cotton-candy-sky' }],
  bubbles: [{ at: IMPACT + barFrame(1) + 30, until: LEN('b1') - 12, text: CAPTIONS.b1.sub, slug: 'cotton-candy-sky' }] };
