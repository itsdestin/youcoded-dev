import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Backdrop } from '../Backdrop';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { CAPTIONS } from '../captions';
import { barFrame } from '../grid';
import { CUT } from '../timeline';
import { markFrame, assertClipCovers } from '../marks';

// Beat 4 (bars 10–13): Flappy. The host is not drawn here — the bird IS the
// mascot, and two of them on screen reads as a bug.
//
// WHY two shots and not the one the plan drew: from the Games click the
// recording takes ~9.8 s to reach the first flap, which is longer than this
// whole beat — a single trim from 'games' would end before the bird ever flew.
// So: opening the Games menu, then a jump straight to the flight, at 1x
// throughout (a sped-up game reads as fake).
//
// FLIGHT is a DESIGN choice, NOT a measurement: it says how much of this
// 248-frame beat the flight gets, and the menu gets the rest. Round 2's
// FLIGHT_FRAMES = 107 was the opposite — a hand-counted frame number for where
// the old autopilot crashed. That footage is gone and so is the constant.
//
// WHY 200 and not the 165 round 3 started with: the checklist asks for four
// pipes cleared on screen, and the re-filmed take's counter reads 0 at the
// launch, 3 at 165 frames and 4 from ~184 frames on. 165 shipped a 3-pipe
// flight. 200 frames (6.7 s) clears four with half a second to spare and still
// leaves the menu 1.6 s, which is a readable shot.
const BEAT = barFrame(14) - barFrame(10) + CUT;
const FLIGHT = 200;
const MENU = BEAT - FLIGHT;         // the rest opens on the Games menu
// Shot A anchors on the games click's END edge, not its start: the click FIRES
// at 13.6 s but the panel is still loading two seconds later, so a shot from
// the start edge showed no menu at all (round 3's first render did exactly
// that — 2.8 s of an empty chat). From the end edge the shot opens on "Loading
// games…" and holds the four game cards.
const A_FROM = markFrame('promo-flappy', 'games', 'end');
// -8: start the flight a fraction before the pilot takes over, so the cut is
// not on the launch itself.
const B_FROM = markFrame('promo-flappy', 'fly', 'start', -8);
assertClipCovers('promo-flappy', A_FROM, MENU);
assertClipCovers('promo-flappy', B_FROM, FLIGHT);

export const Beat4: React.FC = () => (
  <AbsoluteFill>
    <Backdrop theme="midnight" />
    <Sequence durationInFrames={MENU}><Footage file="promo-flappy" from={A_FROM} /></Sequence>
    {/* the push-in is on the flight only — the menu shot is static on purpose */}
    <Sequence from={MENU}><Footage file="promo-flappy" from={B_FROM} pushIn={0.03} /></Sequence>
    <Caption text={CAPTIONS.b4} at={12} />
  </AbsoluteFill>
);
