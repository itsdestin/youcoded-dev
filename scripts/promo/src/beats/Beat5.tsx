import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { BAR_S } from '../grid';
import { markFrame, markSec, assertClipCovers } from '../marks';
import { A } from '../host/engine';
import { L, LEN, type BeatModule } from './beat';

// Beat 5 (bars 13–18): your files, beside the chat — and where they live.
// Bars 13–15: the request goes out (fast); bar 15: the re-opened, sorted sheet;
// bars 16–18: project view — Econ 201's hero and file tree, one click to
// Context (the clip runs at 1.2× so the Context tab lands inside the beat).
const T_AFTER = L('b5', 15), T_PROJ = L('b5', 16), END = LEN('b5');
const A_FROM = markFrame('promo-sheet', 'attach', 'start', -6);
const A_RATE = Math.min(1.6, Math.max(1, (markSec('promo-sheet', 'reply', 'end') - markSec('promo-sheet', 'attach', 'start')) / (2 * BAR_S)));
const B_FROM = markFrame('promo-sheet', 'after', 'end', 20);
const P_RATE = 1.2;
const P_FROM = markFrame('promo-project', 'projects', 'start', -10);
const P = perch(0.25), LEAN = perch(0.62);
assertClipCovers('promo-sheet', A_FROM, T_AFTER, A_RATE);
assertClipCovers('promo-sheet', B_FROM, T_PROJ - T_AFTER);
assertClipCovers('promo-project', P_FROM, END - T_PROJ, P_RATE);
const Beat5: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={T_AFTER}><Footage file="promo-sheet" from={A_FROM} rate={A_RATE} light /></Sequence>
    <Sequence from={T_AFTER} durationInFrames={T_PROJ - T_AFTER}><Footage file="promo-sheet" from={B_FROM} pushIn={0.02} light /></Sequence>
    <Sequence from={T_PROJ}><Footage file="promo-project" from={P_FROM} rate={P_RATE} light /></Sequence>
    <Sequence durationInFrames={T_PROJ}><Caption head={CAPTIONS.b5.head} sub={CAPTIONS.b5.sub} at={L('b5', 13) + 4} theme="meadow-mist" /></Sequence>
    <Sequence from={T_PROJ}><Caption head={CAPTIONS.b5.head} sub={CAPTIONS.b5.project} at={0} subAt={4} theme="meadow-mist" still /></Sequence>
  </AbsoluteFill>
);
export const beat5: BeatModule = { id: 'b5', slug: 'meadow-mist', home: P, Component: Beat5,
  host: [
    A.hop(T_AFTER - 10, 26, LEAN.x, LEAN.y, 60), A.face(T_AFTER, 'curious'), A.look(T_AFTER + 10, 8, 0.3, 0.5),   // hops over to peer at the sheet
    A.hop(T_PROJ - 10, 26, P.x, P.y, 60), A.face(T_PROJ + 10, 'welcome'), A.look(T_PROJ + 12, 8, 0, 0.3), A.blink(T_PROJ + 40),
  ] };
