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
// Once the window has settled the host says hello from the title bar. ONE line: the window
// settles ~1 s before the beat ends, so there is no room for a second (the draft's "Let me show
// you around" collided with beat 2's first line — both bubbles popped on the same frame). The
// hello runs 36 frames into beat 2 on purpose: the cut is a hard cut on the same screen and the
// host does not move, so nothing changes under it.
const HELLO = IMPACT + barFrame(1) + 32;
const P1 = present('b1', [
  { at: HELLO, say: "Hi! I'm your assistant.", face: 'happy', until: HELLO + 70 },
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
