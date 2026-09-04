import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { A } from '../host/engine';
import { WASH } from '../Backdrop';
import { L, LEN, type BeatModule } from './beat';
import { Sfx } from './sfx';

// Beat 3 (bars 5–10): describe a look. The request is sent under bar 5, the
// music drops out for half a beat, and the app turns Golden Sunbreak on bar 6
// (drop 1); Strawberry Kitty on 7, Kuromi Dreamer on 8; bar 9 holds.
// Four shots of ONE recording cut where the app is static: A ends 8 frames
// after Enter; B opens 27 frames before the first paint and runs through it; C
// and D open on their paints (+2 for the browser's paint lag after the mark).
const FLIP1 = L('b3', 6), FLIP2 = L('b3', 7), FLIP3 = L('b3', 8), END = LEN('b3');
const A_LEN = FLIP1 - 21;
const A_FROM = markFrame('promo-theme', 'sent', 'end', 8) - A_LEN;
const B_FROM = markFrame('promo-theme', 'paint1', 'end', 2) - 21;
const C_FROM = markFrame('promo-theme', 'paint2', 'end', 2);
const D_FROM = markFrame('promo-theme', 'paint3', 'end', 2);
if (A_FROM < 0 || B_FROM < 0) throw new Error('the theme recording is too short before the request/reply; re-film with a longer lead');
assertClipCovers('promo-theme', A_FROM, A_LEN);
assertClipCovers('promo-theme', B_FROM, FLIP2 - A_LEN);
assertClipCovers('promo-theme', C_FROM, FLIP3 - FLIP2);
assertClipCovers('promo-theme', D_FROM, END - FLIP3);
const P = perch(0.3);
const Beat3: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={A_LEN}><Footage file="promo-theme" from={A_FROM} light /></Sequence>
    <Sequence from={A_LEN} durationInFrames={FLIP2 - A_LEN}><Footage file="promo-theme" from={B_FROM} /></Sequence>
    <Sequence from={FLIP2} durationInFrames={FLIP3 - FLIP2}><Footage file="promo-theme" from={C_FROM} light /></Sequence>
    <Sequence from={FLIP3}><Footage file="promo-theme" from={D_FROM} light /></Sequence>
    <Sequence durationInFrames={FLIP1 + WASH}><Label text={CAPTIONS.b3.head} at={L('b3', 5) + 4} slug="cotton-candy-sky" /></Sequence>
    <Sequence from={FLIP1 + WASH} durationInFrames={FLIP2 - FLIP1}><Label text={CAPTIONS.b3.head} at={0} slug="golden-sunbreak" still /></Sequence>
    <Sequence from={FLIP2 + WASH} durationInFrames={FLIP3 - FLIP2}><Label text={CAPTIONS.b3.head} at={0} slug="strawberry-kitty" still /></Sequence>
    <Sequence from={FLIP3 + WASH}><Label text={CAPTIONS.b3.head} at={0} slug="kuromi-dreamer" still /></Sequence>
    <Sfx at={FLIP1} name="chime" volume={0.55} />
    <Sfx at={FLIP2} name="chime" volume={0.45} />
    <Sfx at={FLIP3} name="chime" volume={0.45} />
  </AbsoluteFill>
);
// The three in-place flips take the moves that need no wipe band: twirl, poof, twirl
// (the "jump for joy" hops are gone — Destin, 2026-09-04). Between them the host
// REACTS to each new look: a ta-da at golden, a look around at strawberry, delight at kuromi.
export const beat3: BeatModule = { id: 'b3', slug: 'cotton-candy-sky', home: P, Component: Beat3,
  themes: [{ at: FLIP1, slug: 'golden-sunbreak' }, { at: FLIP2, slug: 'strawberry-kitty' }, { at: FLIP3, slug: 'kuromi-dreamer' }],
  host: [
    A.point(L('b3', 5) + 8, 'R', 0.9), A.look(L('b3', 5) + 10, 8, 0.4, 0.4), A.face(L('b3', 5) + 8, 'curious'),   // points at the request going out
    A.rest(FLIP1 - 22),
    ...A.twirl(FLIP1 - 10, 22, P.x, P.y, 'golden-sunbreak'),
    A.tada(FLIP1 + 30, 'C'), A.face(FLIP1 + 30, 'happy'), A.face(FLIP1 + 56, 'welcome'), A.rest(FLIP1 + 60),
    ...A.vanish(FLIP2 - 8), ...A.appear(FLIP2, P.x, P.y, 'strawberry-kitty'),
    A.look(FLIP2 + 28, 8, -0.5, 0.3), A.look(FLIP2 + 44, 8, 0.5, 0.3), A.face(FLIP2 + 28, 'curious'), A.look(FLIP2 + 58, 8, 0, 0),   // looks the new look over
    ...A.twirl(FLIP3 - 10, 22, P.x, P.y, 'kuromi-dreamer'),
    A.face(FLIP3 + 30, 'happy'), A.cheer(FLIP3 + 30, 24), A.face(FLIP3 + 56, 'welcome'), A.blink(FLIP3 + 64),
  ],
  bubbles: [
    { at: FLIP1 + 26, until: FLIP2 - 16, text: CAPTIONS.b3.yours, slug: 'golden-sunbreak' },
    { at: FLIP2 + 28, until: LEN('b3') - 20, text: CAPTIONS.b3.sub, slug: 'kuromi-dreamer' },
  ] };
