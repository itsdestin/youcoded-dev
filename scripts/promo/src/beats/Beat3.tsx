import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { A } from '../host/engine';
import { WASH } from '../Backdrop';
import { B, LEN, present, inWindow, type BeatModule } from './beat';
import { Sfx } from './sfx';

// Beat 3 (5 bars since 2026-09-09; second in the film since Destin's reorder of 2026-09-04,
// straight after the intro on a hard cut — same theme, the host still on the title bar):
// describe a look. The request is typed and sent over the first two bars (the typing runs at
// 1.3× — Destin, 2026-09-09: "speed up the individual frames"), the music drops out for half a
// beat, and the app turns Golden Sunbreak on the third bar (drop 1); Strawberry Kitty on the
// fourth; Devil's Garden on the fifth (2026-09-09: it replaces Kuromi Dreamer — "get rid of
// the Kuromi Dreamer / another kitty cat scene").
// Four shots of ONE recording cut where the app is static: A ends 8 frames
// after Enter; B opens 27 frames before the first paint and runs through it; C
// and D open on their paints (+2 for the browser's paint lag after the mark).
const FLIP1 = B('b3', 2), FLIP2 = B('b3', 3), FLIP3 = B('b3', 4), END = LEN('b3');
const A_RATE = 1.3;
const A_LEN = FLIP1 - 21;
const A_FROM = markFrame('promo-theme', 'sent', 'end', 8) - Math.round(A_LEN * A_RATE);
const B_FROM = markFrame('promo-theme', 'paint1', 'end', 2) - 21;
// +14, not +2: the wallpaper image lands ~10 frames after the paint mark, and +2 showed a blank
// pink window for a third of a second on the third flip (the draft review)
const C_FROM = markFrame('promo-theme', 'paint2', 'end', 14);
const D_FROM = markFrame('promo-theme', 'paint3', 'end', 14);
if (A_FROM < 0 || B_FROM < 0) throw new Error('the theme recording is too short before the request/reply; re-film with a longer lead');
assertClipCovers('promo-theme', A_FROM, A_LEN, A_RATE);
assertClipCovers('promo-theme', B_FROM, FLIP2 - A_LEN);
assertClipCovers('promo-theme', C_FROM, FLIP3 - FLIP2);
if (B_FROM + (FLIP2 - A_LEN) > markFrame('promo-theme', 'paint2')) throw new Error('the Golden shot runs into the Strawberry paint');
if (C_FROM + (FLIP3 - FLIP2) > markFrame('promo-theme', 'paint3')) throw new Error('the Strawberry shot runs into the Devil\'s Garden paint');
assertClipCovers('promo-theme', D_FROM, END - FLIP3);
const Beat3: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={A_LEN}><Footage file="promo-theme" from={A_FROM} rate={A_RATE} light /></Sequence>
    <Sequence from={A_LEN} durationInFrames={FLIP2 - A_LEN}><Footage file="promo-theme" from={B_FROM} /></Sequence>
    <Sequence from={FLIP2} durationInFrames={FLIP3 - FLIP2}><Footage file="promo-theme" from={C_FROM} light /></Sequence>
    <Sequence from={FLIP3}><Footage file="promo-theme" from={D_FROM} /></Sequence>
    <Sequence durationInFrames={FLIP1 + WASH}><Label text={CAPTIONS.b3.head} at={B('b3', 0) + 4} slug="cotton-candy-sky" /></Sequence>
    <Sequence from={FLIP1 + WASH} durationInFrames={FLIP2 - FLIP1}><Label text={CAPTIONS.b3.head} at={0} slug="golden-sunbreak" still /></Sequence>
    <Sequence from={FLIP2 + WASH} durationInFrames={FLIP3 - FLIP2}><Label text={CAPTIONS.b3.head} at={0} slug="strawberry-kitty" still /></Sequence>
    <Sequence from={FLIP3 + WASH}><Label text={CAPTIONS.b3.head} at={0} slug="devils-garden" still /></Sequence>
    {/* an in-key sparkle per flip (each arpeggiates the chord under its bar), not the bell chime
        that rang over the music — Destin, 2026-09-04 */}
    <Sfx at={FLIP1} name="sparkle1" volume={0.4} />
    <Sfx at={FLIP2} name="sparkle2" volume={0.35} />
    <Sfx at={FLIP3} name="sparkle3" volume={0.35} />
  </AbsoluteFill>
);
// No arrival move: the intro left the host on the title bar in this very costume, and the cut
// from the intro is a hard cut on the same screen. It points down at the typed request from the
// bar and stays there for the whole beat — the three costume changes happen in place. Each one-bar
// theme holds 2.0 s, which fits a two-word line and no more (1.2 s + ¼ s a word); the last holds one bar too.
const P = perch(0.3);
const P3 = present('b3', [
  { at: 10, say: 'Tired of grey chatbots? Build something better.', target: inWindow(0.5, 0.945), stay: true, face: 'welcome', until: FLIP1 - 10 },
  { at: FLIP1 + 6, say: 'Golden hour.', face: 'happy', until: FLIP2 - 2 },
  { at: FLIP2 + 6, say: 'Kitty cat!', face: 'happy', until: FLIP3 - 2 },
  { at: FLIP3 + 8, say: 'Devilish!', face: 'smug', until: END - 8 },
], 'devils-garden', P, END - 8);
const HERE = P3.where(FLIP1);
// The three in-place flips take the moves that need no wipe band: twirl, poof, twirl.
export const beat3: BeatModule = { id: 'b3', slug: 'cotton-candy-sky', home: P, Component: Beat3, arrival: 'none',
  themes: [{ at: FLIP1, slug: 'golden-sunbreak' }, { at: FLIP2, slug: 'strawberry-kitty' }, { at: FLIP3, slug: 'devils-garden' }],
  host: [
    ...P3.host,
    ...A.twirl(FLIP1 - 10, 22, HERE.x, HERE.y, 'golden-sunbreak'),
    ...A.vanish(FLIP2 - 8), ...A.appear(FLIP2, HERE.x, HERE.y, 'strawberry-kitty'),
    ...A.twirl(FLIP3 - 10, 22, HERE.x, HERE.y, 'devils-garden'),
  ],
  // the bubbles wear the costume of their moment (the twirl/poof set the costume; the cue's slug only colours the bubble)
  bubbles: P3.bubbles.map((b) => ({ ...b, slug: b.at < FLIP1 ? 'cotton-candy-sky' : b.at < FLIP2 ? 'golden-sunbreak' : b.at < FLIP3 ? 'strawberry-kitty' : 'devils-garden' })) };
