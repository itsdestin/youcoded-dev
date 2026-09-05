import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { B, LEN, present, inWindow, type BeatModule } from './beat';

// Beat 7 (6 bars; ninth in the film since Destin's reorder of 2026-09-04): every
// conversation, findable — in Midnight, the student's sessions. All Sessions → Resume,
// the menu with each session's status (bars 0–2); the browser with "econ" narrowing it
// (2–4, slowed a touch); the Organize sheet with the tag on and a note typed (4–6, slowed).
// The drag along the strip is CUT (Destin: "drop this").
const T_SEARCH = B('b7', 2), T_NOTE = B('b7', 4), END = LEN('b7');
const S1_FROM = markFrame('promo-conversations', 'menu', 'start', -10);
// the browser shot opens just after the Resume click and ends before the Organize click (clip 8.28 s)
const S2_FROM = markFrame('promo-conversations', 'resume', 'end', 6), S2_RATE = 0.85;
// the note shot ends before the sheet closes (clip 13.73 s)
const S3_FROM = markFrame('promo-conversations', 'note', 'start', -22), S3_RATE = 0.8;
assertClipCovers('promo-conversations', S1_FROM, T_SEARCH);
assertClipCovers('promo-conversations', S2_FROM, T_NOTE - T_SEARCH, S2_RATE);
assertClipCovers('promo-conversations', S3_FROM, END - T_NOTE, S3_RATE);
if (S2_FROM + Math.ceil((T_NOTE - T_SEARCH) * S2_RATE) > markFrame('promo-conversations', 'organize', 'start') + 2) throw new Error('the browser shot runs into the Organize click');
if (S3_FROM + Math.ceil((END - T_NOTE) * S3_RATE) > markFrame('promo-conversations', 'close', 'start')) throw new Error('the note shot runs into the sheet closing');
const P = perch(0.3);
const Beat7: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={T_SEARCH}><Footage file="promo-conversations" from={S1_FROM} /></Sequence>
    <Sequence from={T_SEARCH} durationInFrames={T_NOTE - T_SEARCH}><Footage file="promo-conversations" from={S2_FROM} rate={S2_RATE} /></Sequence>
    <Sequence from={T_NOTE}><Footage file="promo-conversations" from={S3_FROM} rate={S3_RATE} /></Sequence>
    <Label text={CAPTIONS.b7.head} at={B('b7', 0) + 4} slug="midnight" />
  </AbsoluteFill>
);
const MENU = 10;
// Three shots of two bars each, a line per shot, said beside the thing it is about:
//   the sessions menu drops from the title bar's centre, each row with its status — said from the bar, pointing down at it
//   the Resume browser (30–69 % across); the host stands right of it, pointing at the search field
//   the Organize sheet is the same panel; the note box is low in it — no move, just a new aim
const P7 = present('b7', [
  { at: MENU + 4, say: 'Easily see the status of working assistants.', target: inWindow(0.62, 0.15), stand: 'bar', face: 'welcome' },
  { at: T_SEARCH + 14, say: 'Search and filter old conversations.', target: inWindow(0.68, 0.27), stand: 'R', face: 'welcome' },
  { at: T_NOTE, say: 'Or add tags and notes to help you find conversations later.', target: inWindow(0.52, 0.7), stay: true, face: 'happy', until: END - 6 },
], 'midnight', P, END - 6);
export const beat7: BeatModule = { id: 'b7', slug: 'midnight', home: P7.home, Component: Beat7,
  host: P7.host,
  bubbles: P7.bubbles };
