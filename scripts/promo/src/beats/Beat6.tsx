import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch, windowRect } from '../layout';
import { markFrame, markSec, assertClipCovers } from '../marks';
import { A } from '../host/engine';
import { L, LEN, type BeatModule } from './beat';
import { Sfx } from './sfx';

// Beat 6 (bars 18–24): games with friends, in Halftone Dimension. The friends
// lobby and a Challenge (bar 18), Connect 4 against Jake with moves both ways
// (19–20), one chess move (21), then the Flappy flight on the hook's last two
// bars (22–23), where the host dives INTO the game and becomes the bird.
const T_C4 = L('b6', 19), T_CHESS = L('b6', 21), T_FLY = L('b6', 22), END = LEN('b6');
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
const BIRD = { x: R.x + R.w * 0.62 - 60, y: R.y + R.h * 0.5 - 60 };
const Beat6: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={T_C4}><Footage file="promo-games-lobby" from={LOBBY_FROM} /></Sequence>
    <Sequence from={T_C4} durationInFrames={T_CHESS - T_C4}><Footage file="promo-connect4" from={C4_FROM} /></Sequence>
    <Sequence from={T_CHESS} durationInFrames={T_FLY - T_CHESS}><Footage file="promo-chess" from={CHESS_FROM} /></Sequence>
    <Sequence from={T_FLY}><Footage file="promo-flappy" from={FLY_FROM} pushIn={0.03} /></Sequence>
    <Label text={CAPTIONS.b6.head} at={L('b6', 18) + 4} slug="halftone-dimension" />
    <Sfx at={T_FLY + 10} name="poof" volume={0.5} />
  </AbsoluteFill>
);
const DROP1 = T_C4 + 12, DROP2 = T_C4 + Math.round((markSec('promo-connect4', 'drop2') - markSec('promo-connect4', 'drop1')) * 30) + 12;
const MOVE = T_CHESS + 24;
// The host cheers the challenge, points at its own Connect 4 drop, thinks (hand to
// chin) at Jake's, thinks again over the chess board and nods at the move, then eyes
// the Flappy game and dives INTO it (the bird is the host).
export const beat6: BeatModule = { id: 'b6', slug: 'halftone-dimension', home: P, Component: Beat6,
  host: [
    A.cheer(T_C4 - 30, 26), A.face(T_C4 - 30, 'happy'), A.face(T_C4 - 2, 'welcome'),                          // the challenge goes out
    A.point(DROP1 - 4, 'R', 0.9), A.face(DROP1 - 4, 'curious'), A.look(DROP1 - 4, 6, 0.2, 0.6),               // our drop
    A.rest(DROP1 + 30), A.think(DROP2 - 6), A.face(DROP2 - 6, 'curious'),                                       // Jake's drop: hmm
    A.rest(T_CHESS - 8), A.think(T_CHESS + 4), A.look(T_CHESS + 4, 8, 0.3, 0.5),                                 // chess: thinking
    A.nod(MOVE + 4), A.rest(MOVE + 4), A.face(MOVE + 4, 'happy'), A.face(MOVE + 30, 'welcome'),                  // the move
    A.look(T_FLY - 30, 8, 0.5, 0.6), A.face(T_FLY - 30, 'shocked'),                                              // eyes the game
    A.hop(T_FLY - 14, 26, BIRD.x, BIRD.y, 120), A.to(T_FLY, 10, 'size', 0), A.set(T_FLY + 10, { poof: T_FLY + 10 }), A.hide(T_FLY + 12),
    A.set(T_FLY + 14, { x: P.x, y: -260, size: 120 }),                                         // (unseen) parks above the frame for the next arrival
  ],
  bubbles: [{ at: L('b6', 18) + 18, until: T_FLY - 40, text: CAPTIONS.b6.sub, slug: 'halftone-dimension' }] };
