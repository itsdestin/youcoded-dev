import React from 'react';
import { IntroVisuals, introActions, IMPACT } from '../intro/Intro';
import { perch } from '../layout';
import { assertClipCovers } from '../marks';
import { L, LEN, type BeatModule } from './beat';
import { barFrame } from '../grid';
import { PRELUDE } from '../timeline';
import { CAPTIONS } from '../captions';

// Beat 1: the punch intro. The prelude (black, silent, the walk) then bars 0–1:
// the burst into Cotton Candy Sky on the hit and the window rising on bar 1.
// The visuals and the host's actions live in intro/Intro.tsx, which is also the
// standalone study clip; this module only places them in the film.
if (IMPACT !== PRELUDE) throw new Error(`Intro IMPACT ${IMPACT} ≠ timeline PRELUDE ${PRELUDE}`);
assertClipCovers('promo-idle-cotton', 0, LEN('b1') - L('b1', 1));
const Beat1: React.FC = () => <IntroVisuals />;
export const beat1: BeatModule = { id: 'b1', slug: 'cotton-candy-sky', home: perch(0.3), Component: Beat1, arrival: 'none',
  host: introActions(), themes: [{ at: IMPACT, slug: 'cotton-candy-sky' }],
  bubbles: [{ at: IMPACT + barFrame(1) + 30, until: LEN('b1') - 12, text: CAPTIONS.b1.sub, slug: 'cotton-candy-sky' }] };
