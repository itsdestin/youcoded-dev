import React from 'react';
import { IntroVisuals, introActions, IMPACT } from '../intro/Intro';
import { perch } from '../layout';
import { assertClipCovers } from '../marks';
import { L, LEN, present, type BeatModule } from './beat';
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
// Once the window has settled the host says hello from the title bar — two lines, Destin's
// (2026-09-04): the welcome, then what YouCoded is. The beat runs to bar 5 so both can be read;
// the second ends before the next section starts.
const HELLO = IMPACT + barFrame(1) + 32;
const P1 = present('b1', [
  { at: HELLO, say: "Welcome to YouCoded! I'm your assistant.", face: 'happy' },
  { at: HELLO + 92, say: 'YouCoded is a free, open-source, and fully personalizable AI assistant.', face: 'welcome', until: HELLO + 92 + 120 },
], 'cotton-candy-sky', perch(0.3));
const Beat1: React.FC = () => (
  <AbsoluteFill>
    <IntroVisuals />
    <Label text={CAPTIONS.b1.head} at={IMPACT + barFrame(1) + 22} slug="cotton-candy-sky" />
  </AbsoluteFill>
);
export const beat1: BeatModule = { id: 'b1', slug: 'cotton-candy-sky', home: perch(0.3), Component: Beat1, arrival: 'none',
  host: [...introActions(), A.wave(HELLO - 2, 36), ...P1.host],
  themes: [{ at: IMPACT, slug: 'cotton-candy-sky' }],
  bubbles: P1.bubbles };
