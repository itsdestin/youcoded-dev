import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, markSec, assertClipCovers } from '../marks';
import { A } from '../host/engine';
import { L, LEN, present, inWindow, type BeatModule } from './beat';

// Beat 7 (bars 24–28): every conversation, findable — in Midnight, the
// student's sessions. All Sessions → Resume (bar 24); the browser with "econ"
// narrowing it (25); the note typed in the Organize sheet, its tag already on
// (26); "plan my week" dragged into place on the strip (27).
const T_SEARCH = L('b7', 25), T_NOTE = L('b7', 26), T_DRAG = L('b7', 27), END = LEN('b7');
const S1_FROM = markFrame('promo-conversations', 'menu', 'start', -10);
const S2_FROM = markFrame('promo-conversations', 'search', 'end', 12) - (T_NOTE - T_SEARCH);
const S3_FROM = markFrame('promo-conversations', 'note', 'start', -22);
const S4_FROM = markFrame('promo-conversations', 'drag', 'start');
assertClipCovers('promo-conversations', S1_FROM, T_SEARCH);
assertClipCovers('promo-conversations', S2_FROM, T_NOTE - T_SEARCH);
assertClipCovers('promo-conversations', S3_FROM, T_DRAG - T_NOTE);
assertClipCovers('promo-conversations', S4_FROM, END - T_DRAG);
const P = perch(0.3);
const Beat7: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={T_SEARCH}><Footage file="promo-conversations" from={S1_FROM} /></Sequence>
    <Sequence from={T_SEARCH} durationInFrames={T_NOTE - T_SEARCH}><Footage file="promo-conversations" from={S2_FROM} /></Sequence>
    <Sequence from={T_NOTE} durationInFrames={T_DRAG - T_NOTE}><Footage file="promo-conversations" from={S3_FROM} /></Sequence>
    <Sequence from={T_DRAG}><Footage file="promo-conversations" from={S4_FROM} /></Sequence>
    <Label text={CAPTIONS.b7.head} at={L('b7', 24) + 4} slug="midnight" />
  </AbsoluteFill>
);
const MENU = 10;
const DROP = T_DRAG + Math.round((markSec('promo-conversations', 'drag', 'end') - markSec('promo-conversations', 'drag')) * 30);
// Four shots of ~2 s each: a line per shot, two words where the shot is short.
//   the sessions menu drops from the title bar's centre — said from the bar, pointing down at it
//   the Resume browser (30–69 % across); the host stands right of it, pointing at the search field
//   the Organize sheet is the same panel; the note box is low in it — no move, just a new aim
//   the strip is in the title bar, so the host hops back onto the bar's right end and points at the pill
const P7 = present('b7', [
  { at: MENU + 4, say: 'Every chat, ever.', target: inWindow(0.62, 0.15), stand: 'bar', face: 'welcome' },
  { at: T_SEARCH + 14, say: 'Searchable.', target: inWindow(0.68, 0.27), stand: 'R', face: 'welcome' },
  { at: T_NOTE + 4, say: 'Tags, notes.', target: inWindow(0.52, 0.7), stay: true, face: 'happy' },
  { at: T_DRAG, say: 'Drag to reorder.', spot: perch(0.78), target: inWindow(0.55, 0.01), face: 'welcome', until: END - 8 },
], 'midnight', P, END - 8);
export const beat7: BeatModule = { id: 'b7', slug: 'midnight', home: P7.home, Component: Beat7,
  host: [...P7.host, A.look(T_DRAG + 4, 10, -0.5, 0.3), A.look(T_DRAG + 22, 14, 0.5, 0.3), A.face(DROP + 2, 'happy')],   // follows the pill with its eyes
  bubbles: P7.bubbles };
