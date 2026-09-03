import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Backdrop } from '../Backdrop';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { CAPTIONS } from '../captions';
import { barFrame } from '../grid';
import { markFrame, assertClipCovers } from '../marks';

// Beat 4 (bars 10–13): Flappy. The host is not drawn here — the bird IS the
// mascot, and two of them on screen reads as a bug.
//
// WHY two shots and not the one the plan drew: from the Games click the
// recording takes 9.8 s to reach the first flap, which is longer than this
// whole beat — a single trim from 'games' would end before the bird ever flew.
// So: opening the Games menu, then a jump straight to the flight, at 1x
// throughout (a sped-up game reads as fake).
//
// FLIGHT_FRAMES is measured, not guessed: the recording's autopilot hits a pipe
// and the game-over card replaces the field at clip frame 815, 107 frames after
// the 'fly' mark. Draft round 1 ran 6 s past that and ended the beat on a dead
// "Press Space to fly" screen. The shot now stops on the last live frame.
// This is the footage's limit, not the edit's — see the task report: the run
// clears ONE pipe, and the checklist asks for four, so the scene needs a
// re-film with an autopilot that survives longer.
const BEAT = barFrame(14) - barFrame(10) + 6;  // 250
const FLIGHT_FRAMES = 107;
const B_FROM = markFrame('promo-flappy', 'fly', 'start');
const CUT_AT = BEAT - FLIGHT_FRAMES;           // 143 — the jump to the flight
const A_FROM = markFrame('promo-flappy', 'games', 'start', -6);
assertClipCovers('promo-flappy', A_FROM, CUT_AT);
assertClipCovers('promo-flappy', B_FROM, FLIGHT_FRAMES);

export const Beat4: React.FC = () => (
  <AbsoluteFill>
    <Backdrop theme="midnight" />
    <Sequence durationInFrames={CUT_AT}><Footage file="promo-flappy" from={A_FROM} /></Sequence>
    <Sequence from={CUT_AT}><Footage file="promo-flappy" from={B_FROM} pushIn={0.03} /></Sequence>
    <Caption text={CAPTIONS.b4} at={12} />
  </AbsoluteFill>
);
