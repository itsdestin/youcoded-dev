import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { CAPTIONS } from '../captions';
import { perch, windowRect } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { HOP } from '../Mascot';
import { L, LEN, type BeatModule } from './beat';
import { Sfx } from './sfx';

// Beat 4 (bars 8–14): games with friends, in Halftone Dimension. Four shots on
// the grid: the friends lobby and a Challenge (bar 8), Connect 4 against Jake
// with moves both ways (bars 9–10), one chess move (bar 11), then the Flappy
// flight on the hook's last two bars (12–13) — where the host hops INTO the
// window and the bird takes over: the bird IS the mascot, and two on screen
// reads as a bug.
const T_C4 = L('b4', 9), T_CHESS = L('b4', 11), T_FLY = L('b4', 12), END = LEN('b4');
// Every shot is anchored on a mark. Lobby: ends 8 frames after the Challenge
// click. Connect 4: opens 12 frames before the first drop. Chess: the pawn is
// already selected (legal squares lit) when the shot opens and the move clicks
// 24 frames in. Flight: opens 8 frames before the pilot takes over.
const LOBBY_FROM = markFrame('promo-games-lobby', 'challenge', 'end', 8) - T_C4;
const C4_FROM = markFrame('promo-connect4', 'drop1', 'start', -12);
const CHESS_FROM = markFrame('promo-chess', 'move', 'start', -24);
const FLY_FROM = markFrame('promo-flappy', 'fly', 'start', -8);
assertClipCovers('promo-games-lobby', LOBBY_FROM, T_C4);
assertClipCovers('promo-connect4', C4_FROM, T_CHESS - T_C4);
assertClipCovers('promo-chess', CHESS_FROM, T_FLY - T_CHESS);
assertClipCovers('promo-flappy', FLY_FROM, END - T_FLY);
const P = perch(0.3);
const R = windowRect();
// Where the Flappy bird sits when the game starts: the drawer is the right 600 px
// of the 1440 px clip, the bird a third of the way in and mid-height. The host
// dives to exactly there and bursts, so "it became the bird" is the reading.
const BIRD = { x: R.x + R.w * (0.62), y: R.y + R.h * 0.5 };
const Beat4: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={T_C4}><Footage file="promo-games-lobby" from={LOBBY_FROM} /></Sequence>
    <Sequence from={T_C4} durationInFrames={T_CHESS - T_C4}><Footage file="promo-connect4" from={C4_FROM} /></Sequence>
    <Sequence from={T_CHESS} durationInFrames={T_FLY - T_CHESS}><Footage file="promo-chess" from={CHESS_FROM} /></Sequence>
    <Sequence from={T_FLY}><Footage file="promo-flappy" from={FLY_FROM} pushIn={0.03} /></Sequence>
    <Caption head={CAPTIONS.b4.head} sub={CAPTIONS.b4.sub} at={L('b4', 8) + 6} theme="halftone-dimension" />
    <Sfx at={T_FLY - HOP + 2} name="pop" volume={0.4} />
  </AbsoluteFill>
);
export const beat4: BeatModule = { id: 'b4', slug: 'halftone-dimension', home: P, Component: Beat4,
  cues: [
    { at: T_C4, pose: 'cheer' },                                                  // the challenge is on
    { at: T_C4 + 30, pose: 'curious' },
    { at: T_FLY - HOP, x: BIRD.x - 60, y: BIRD.y - 60, size: 0, hop: true, hidden: true },   // dives into the game, onto the bird
    { at: T_FLY + 2, x: P.x, y: -260, size: 120, hidden: true },                             // (unseen) parks above the frame so the next beat's arrival drops in from the top
  ] };
