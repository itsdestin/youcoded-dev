import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { L, LEN, type BeatModule } from './beat';
import { Sfx } from './sfx';
import { WASH } from '../Backdrop';

// Beat 7 (bars 22–29): describe a look. The request is sent under bar 22, the
// reply lands, and on bar 23's downbeat the whole app turns Golden Sunbreak;
// on 25 it becomes Strawberry Kitty and on 27 Kuromi Dreamer. The backdrop
// washes and the host changes costume on every flip.
//
// Four shots of ONE recording, cut where the app is static so the cuts are
// invisible: A ends 8 frames after Enter; B opens 27 frames before the first
// paint (the reply already landed) and runs through it; C and D open on their
// paints. WHY the paint marks and not the flip marks: 'flipN' is when the scene
// FIRES the theme change; 'paintN' is an in-page observer resolving when the
// app's data-theme attribute has changed. The recorder subtracts its capture
// lag; the browser's paint still lands ~1.5 frames after the mark, hence +2.
const FLIP1 = L('b7', 23), FLIP2 = L('b7', 25), FLIP3 = L('b7', 27), END = LEN('b7');
const A_LEN = 40;
const A_FROM = markFrame('promo-theme', 'sent', 'end', 8) - A_LEN;
const B_FROM = markFrame('promo-theme', 'paint1', 'end', 2) - (FLIP1 - A_LEN);
const C_FROM = markFrame('promo-theme', 'paint2', 'end', 2);
const D_FROM = markFrame('promo-theme', 'paint3', 'end', 2);
if (A_FROM < 0 || B_FROM < 0) throw new Error('the theme recording is too short before the request/reply; re-film with a longer lead');
assertClipCovers('promo-theme', A_FROM, A_LEN);
assertClipCovers('promo-theme', B_FROM, FLIP2 - A_LEN);
assertClipCovers('promo-theme', C_FROM, FLIP3 - FLIP2);
assertClipCovers('promo-theme', D_FROM, END - FLIP3);
const P = perch(0.3);
const Beat7: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={A_LEN}><Footage file="promo-theme" from={A_FROM} /></Sequence>
    <Sequence from={A_LEN} durationInFrames={FLIP2 - A_LEN}><Footage file="promo-theme" from={B_FROM} /></Sequence>
    <Sequence from={FLIP2} durationInFrames={FLIP3 - FLIP2}><Footage file="promo-theme" from={C_FROM} light /></Sequence>
    <Sequence from={FLIP3}><Footage file="promo-theme" from={D_FROM} light /></Sequence>
    {/* "Describe a look." on the cut (midnight), "It's yours." lands with the first
        flip; from the second flip the sub-line explains the extra looks. Each
        theme's caption is a separate element (font and colours follow the theme);
        the later ones are `still` so the headline does not re-pop. */}
    <Sequence durationInFrames={FLIP1}><Caption head={CAPTIONS.b7.head} at={L('b7', 22) + 4} theme="midnight" /></Sequence>
    <Sequence from={FLIP1} durationInFrames={FLIP2 - FLIP1 + WASH}><Caption head={CAPTIONS.b7.head} sub={CAPTIONS.b7.yours} at={0} subAt={4} theme="golden-sunbreak" still /></Sequence>
    <Sequence from={FLIP2 + WASH} durationInFrames={FLIP3 - FLIP2}><Caption head={CAPTIONS.b7.head} sub={CAPTIONS.b7.sub} at={0} subAt={0} theme="strawberry-kitty" still /></Sequence>
    <Sequence from={FLIP3 + WASH}><Caption head={CAPTIONS.b7.head} sub={CAPTIONS.b7.sub} at={0} subAt={0} theme="kuromi-dreamer" still /></Sequence>
    <Sfx at={FLIP1} name="chime" volume={0.55} />
    <Sfx at={FLIP2} name="chime" volume={0.45} />
    <Sfx at={FLIP3} name="chime" volume={0.45} />
  </AbsoluteFill>
);
export const beat7: BeatModule = { id: 'b7', slug: 'midnight', home: P, Component: Beat7,
  themes: [{ at: FLIP1, slug: 'golden-sunbreak' }, { at: FLIP2, slug: 'strawberry-kitty' }, { at: FLIP3, slug: 'kuromi-dreamer' }],
  cues: [
    { at: FLIP1, pose: 'shocked', costume: 'golden-sunbreak', burst: true },
    { at: FLIP1 + 18, pose: 'welcome' },
    { at: FLIP2, pose: 'shocked', costume: 'strawberry-kitty', burst: true },
    { at: FLIP2 + 18, pose: 'cheer' },
    { at: FLIP3, pose: 'shocked', costume: 'kuromi-dreamer', burst: true },
    { at: FLIP3 + 18, pose: 'welcome' },
  ] };
