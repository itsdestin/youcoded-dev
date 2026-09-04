import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { BAR_S } from '../grid';
import { markFrame, markSec, assertClipCovers } from '../marks';
import { L, LEN, present, inWindow, type BeatModule } from './beat';

// Beat 5 (bars 13–18): your files, beside the chat — and where they live.
// Bars 13–15: the request goes out (fast); bar 15: the re-opened, sorted sheet;
// bars 16–18: project view — Econ 201's hero and file tree, one click to
// Context (the clip runs at 1.2× so the Context tab lands inside the beat).
const T_AFTER = L('b5', 15), T_PROJ = L('b5', 16), END = LEN('b5');
const A_FROM = markFrame('promo-sheet', 'attach', 'start', -6);
const A_RATE = Math.min(1.6, Math.max(1, (markSec('promo-sheet', 'reply', 'end') - markSec('promo-sheet', 'attach', 'start')) / (2 * BAR_S)));
const B_FROM = markFrame('promo-sheet', 'after', 'end', 20);
const P_RATE = 1.2;
// +34, not −10: the Projects page shows empty, then "Loading files…", for a second after the click
// (the draft review also caught six frames of the old chat before it)
const P_FROM = markFrame('promo-project', 'projects', 'start', 34);
const P = perch(0.25);
assertClipCovers('promo-sheet', A_FROM, T_AFTER, A_RATE);
assertClipCovers('promo-sheet', B_FROM, T_PROJ - T_AFTER);
assertClipCovers('promo-project', P_FROM, END - T_PROJ, P_RATE);
const Beat5: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={T_AFTER}><Footage file="promo-sheet" from={A_FROM} rate={A_RATE} light /></Sequence>
    <Sequence from={T_AFTER} durationInFrames={T_PROJ - T_AFTER}><Footage file="promo-sheet" from={B_FROM} pushIn={0.02} light /></Sequence>
    <Sequence from={T_PROJ}><Footage file="promo-project" from={P_FROM} rate={P_RATE} light /></Sequence>
    <Sequence durationInFrames={T_PROJ}><Label text={CAPTIONS.b5.head} at={L('b5', 13) + 4} slug="meadow-mist" /></Sequence>
    <Sequence from={T_PROJ}><Label text={CAPTIONS.b5.head2} at={4} slug="meadow-mist" /></Sequence>
  </AbsoluteFill>
);
/** Local frame of a project-view mark (that clip starts at T_PROJ, at P_RATE). */
const PM = (mark: string) => T_PROJ + Math.round((markFrame('promo-project', mark) - P_FROM) / P_RATE);
/** Local frame of a mark in the first shot (the sheet clip from A_FROM at A_RATE). */
const M = (mark: string, edge: 'start' | 'end' = 'start') => Math.round((markFrame('promo-sheet', mark, edge) - A_FROM) / A_RATE);
const P5 = present([
  // the first shot (1.6×) shows the drop and the ask; the sorted sheet is the second shot at T_AFTER
  { at: M('attach') + 4, say: 'Drop a file in.', spot: inWindow(0.3, 0.935), point: 'L', face: 'welcome' },          // beside the attach, on the input row
  { at: T_AFTER - 56, say: 'Ask it to sort and total.', spot: inWindow(0.74, 0.12), point: 'down', face: 'curious' },   // top of the file panel, as the ask goes out
  { at: T_AFTER + 6, say: 'Done. Right next to the chat.', point: 'down', face: 'happy' },
  { at: T_PROJ + 10, say: 'And it all lives in its project.', spot: inWindow(0.5, 0.6), point: 'down', face: 'welcome', until: END - 12 },   // above the file grid
], 'meadow-mist', P, END - 12);
export const beat5: BeatModule = { id: 'b5', slug: 'meadow-mist', home: P, Component: Beat5, host: P5.host, bubbles: P5.bubbles };
