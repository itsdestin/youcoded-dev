import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch, windowRect } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { A } from '../host/engine';
import { B, LEN, present, inWindow, feetAt, type BeatModule } from './beat';
import { Sfx } from './sfx';

// Beat 6 (8 bars): games with friends, in Golden Sunbreak (was Halftone: its hooded rig
// made a tiny dark bird — Destin, 2026-09-04). The friends lobby and a Challenge (bars
// 0–3, long enough for Destin's twelve-word line), Connect 4 against Jake with moves both
// ways (3–5), one chess move (5–6.5), then the Flappy flight on the hook's last bar and a
// half, where the host dives INTO the game and becomes the bird.
const T_C4 = B('b6', 3), T_CHESS = B('b6', 5), T_FLY = B('b6', 6.5), END = LEN('b6');
const LOBBY_FROM = markFrame('promo-games-lobby', 'challenge', 'end', 8) - T_C4;
const C4_FROM = markFrame('promo-connect4', 'drop1', 'start', -12);
const CHESS_FROM = markFrame('promo-chess', 'move', 'start', -24);
const FLY_FROM = markFrame('promo-flappy', 'fly', 'start', -2);   // −2, not −8: the "Press Space to fly" prompt read as an idle screen
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
    <Label text={CAPTIONS.b6.head} at={B('b6', 0) + 4} slug="golden-sunbreak" />
    <Sfx at={T_FLY + 10} name="poof" volume={0.5} />
  </AbsoluteFill>
);
const DROP1 = T_C4 + 12;
// The games panel fills the right third of the window (its left edge is ~63 % across) and is
// dense, so the host stands just LEFT of the panel, over the wallpaper, for the whole beat, and
// aims into it: the Challenge button (93 % across, 36 % down), then the board. No hops until the
// dive, which leaves from here.
const SIDE = feetAt(0.55, 0.62);
const P6 = present('b6', [
  { at: 14, say: 'You can play games alone or against friends while your assistant works.', spot: SIDE, target: inWindow(0.93, 0.36), face: 'welcome' },
  { at: DROP1 + 2, say: "Try Connect 4. I'd win.", target: inWindow(0.82, 0.5), stay: true, face: 'smug' },
  { at: T_CHESS + 6, say: 'Or perhaps chess?', target: inWindow(0.82, 0.5), stay: true, face: 'welcome', until: T_FLY - 2 },
], 'golden-sunbreak', P, END - 8);
// …then dives INTO the game (the bird is the host)
export const beat6: BeatModule = { id: 'b6', slug: 'golden-sunbreak', home: P6.home, Component: Beat6,
  host: [
    ...P6.host,
    A.face(T_FLY - 26, 'happy'), A.look(T_FLY - 24, 8, 0.5, 0.6),
    A.hop(T_FLY - 14, 26, BIRD.x, BIRD.y, 120), A.to(T_FLY, 10, 'size', 0), A.set(T_FLY + 10, { poof: T_FLY + 10 }), A.hide(T_FLY + 12),
    A.set(T_FLY + 14, { x: P.x, y: -260, size: 120 }),                                         // (unseen) parks above the frame for the next arrival
  ],
  bubbles: P6.bubbles };
