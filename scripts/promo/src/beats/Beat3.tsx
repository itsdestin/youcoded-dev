import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { A } from '../host/engine';
import { WASH } from '../Backdrop';
import { L, LEN, present, inWindow, type BeatModule } from './beat';
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
// +14, not +2: the wallpaper image lands ~10 frames after the paint mark, and +2 showed a blank
// pink window for a third of a second on the Kuromi flip (the draft review)
const C_FROM = markFrame('promo-theme', 'paint2', 'end', 14);
const D_FROM = markFrame('promo-theme', 'paint3', 'end', 14);
if (A_FROM < 0 || B_FROM < 0) throw new Error('the theme recording is too short before the request/reply; re-film with a longer lead');
assertClipCovers('promo-theme', A_FROM, A_LEN);
assertClipCovers('promo-theme', B_FROM, FLIP2 - A_LEN);
assertClipCovers('promo-theme', C_FROM, FLIP3 - FLIP2);
// the D shot is a static screen; at 0.8× the clip (which ends 10 frames short at 1×) covers it
const D_RATE = 0.8;
assertClipCovers('promo-theme', D_FROM, END - FLIP3, D_RATE);
const P = perch(0.3);
const Beat3: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={A_LEN}><Footage file="promo-theme" from={A_FROM} light /></Sequence>
    <Sequence from={A_LEN} durationInFrames={FLIP2 - A_LEN}><Footage file="promo-theme" from={B_FROM} /></Sequence>
    <Sequence from={FLIP2} durationInFrames={FLIP3 - FLIP2}><Footage file="promo-theme" from={C_FROM} light /></Sequence>
    <Sequence from={FLIP3}><Footage file="promo-theme" from={D_FROM} rate={D_RATE} light /></Sequence>
    <Sequence durationInFrames={FLIP1 + WASH}><Label text={CAPTIONS.b3.head} at={L('b3', 5) + 4} slug="cotton-candy-sky" /></Sequence>
    <Sequence from={FLIP1 + WASH} durationInFrames={FLIP2 - FLIP1}><Label text={CAPTIONS.b3.head} at={0} slug="golden-sunbreak" still /></Sequence>
    <Sequence from={FLIP2 + WASH} durationInFrames={FLIP3 - FLIP2}><Label text={CAPTIONS.b3.head} at={0} slug="strawberry-kitty" still /></Sequence>
    <Sequence from={FLIP3 + WASH}><Label text={CAPTIONS.b3.head} at={0} slug="kuromi-dreamer" still /></Sequence>
    {/* an in-key sparkle per flip (each arpeggiates the chord under its bar), not the bell chime
        that rang over the music — Destin, 2026-09-04 */}
    <Sfx at={FLIP1} name="sparkle1" volume={0.4} />
    <Sfx at={FLIP2} name="sparkle2" volume={0.35} />
    <Sfx at={FLIP3} name="sparkle3" volume={0.35} />
  </AbsoluteFill>
);
const P3 = present([
  { at: L('b3', 5) + 8, say: 'Want a new look? Just describe it.', spot: inWindow(0.56, 0.16), point: 'R', face: 'welcome', until: FLIP1 - 30 },   // beside the request
  { at: FLIP1 - 26, spot: P },                                                                              // back to the bar for the change
  { at: FLIP1 + 26, say: 'Ooh. Golden hour.', face: 'happy', until: FLIP2 - 20 },
  { at: FLIP2 + 26, say: 'Or borrow one from the community.', face: 'welcome', until: FLIP3 - 20 },
  { at: FLIP3 + 30, say: 'Or make and share your own.', face: 'happy', until: LEN('b3') - 12 },
], 'kuromi-dreamer', P, LEN('b3') - 12);
// The three in-place flips take the moves that need no wipe band: twirl, poof, twirl.
export const beat3: BeatModule = { id: 'b3', slug: 'cotton-candy-sky', home: P, Component: Beat3,
  themes: [{ at: FLIP1, slug: 'golden-sunbreak' }, { at: FLIP2, slug: 'strawberry-kitty' }, { at: FLIP3, slug: 'kuromi-dreamer' }],
  host: [
    ...P3.host,
    ...A.twirl(FLIP1 - 10, 22, P.x, P.y, 'golden-sunbreak'),
    ...A.vanish(FLIP2 - 8), ...A.appear(FLIP2, P.x, P.y, 'strawberry-kitty'),
    ...A.twirl(FLIP3 - 10, 22, P.x, P.y, 'kuromi-dreamer'),
  ],
  // the bubbles wear the costume of their moment (the twirl/poof set the costume; the cue's slug only colours the bubble)
  bubbles: P3.bubbles.map((b) => ({ ...b, slug: b.at < FLIP1 ? 'cotton-candy-sky' : b.at < FLIP2 ? 'golden-sunbreak' : b.at < FLIP3 ? 'strawberry-kitty' : 'kuromi-dreamer' })) };
