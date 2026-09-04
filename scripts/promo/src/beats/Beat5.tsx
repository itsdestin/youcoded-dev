import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
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
    <Label text={CAPTIONS.b5.head} at={L('b5', 13) + 4} slug="meadow-mist" />
  </AbsoluteFill>
);
/** Local frame of a mark in the first shot (the sheet clip from A_FROM at A_RATE). */
const M = (mark: string, edge: 'start' | 'end' = 'start') => Math.round((markFrame('promo-sheet', mark, edge) - A_FROM) / A_RATE);
/** Local frame of a project-view mark (that clip starts at T_PROJ, at P_RATE). */
const PM = (mark: string) => T_PROJ + Math.round((markFrame('promo-project', mark) - P_FROM) / P_RATE);
// The host PRESENTS the files: points at the attach, walks over above the file panel
// while the assistant works and points down at the sheet, is startled-then-happy when
// the sorted sheet re-opens, walks back for project view and points at the tree, nods
// at Context.
export const beat5: BeatModule = { id: 'b5', slug: 'meadow-mist', home: P, Component: Beat5,
  host: [
    A.point(M('attach') + 2, 'R', 0.9), A.face(M('attach') + 2, 'curious'), A.look(M('attach') + 2, 6, 0.1, 0.6),   // the attach
    A.rest(M('reply') - 4), A.walk(M('reply'), 30, LEAN.x, 5), A.look(M('reply'), 10, 0.3, 0.5),                      // over to the panel
    A.point(M('reply') + 36, 'R', 0.85), A.face(M('reply') + 36, 'curious'),                                          // "watch the sheet"
    A.rest(T_AFTER - 14), A.startle(T_AFTER + 2), A.face(T_AFTER + 20, 'happy'), A.tada(T_AFTER + 22, 'R'), A.face(T_AFTER + 50, 'welcome'), A.rest(T_AFTER + 56),
    A.walk(T_PROJ - 6, 30, P.x, 5), A.look(T_PROJ - 6, 10, 0, 0.3), A.face(T_PROJ, 'welcome'),                          // back for project view
    A.point(PM('files') - 2, 'L', 0.85), A.face(PM('files'), 'curious'), A.look(PM('files'), 6, -0.4, 0.6),           // the file tree
    A.nod(PM('context')), A.face(PM('context'), 'happy'), A.face(PM('context') + 24, 'welcome'), A.rest(PM('context') + 26), A.blink(PM('context') + 40),
  ],
  bubbles: [
    { at: L('b5', 13) + 18, until: M('reply') - 4, text: CAPTIONS.b5.sub, slug: 'meadow-mist' },
    { at: T_PROJ + 34, until: END - 20, text: CAPTIONS.b5.project, slug: 'meadow-mist' },
  ] };
