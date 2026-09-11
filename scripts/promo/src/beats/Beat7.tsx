import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { B, LEN, present, inWindow, type BeatModule } from './beat';

// Beat 7 (4 bars since 2026-09-09; ninth in the film since Destin's reorder of 2026-09-04): every
// conversation, findable — in Midnight, the student's sessions. Two shots, two lines (Destin,
// 2026-09-09: "the 'see status' scene should be a bit shorter and the bubble should be open only
// while the session switcher is open/visible. then merge the other two into a single 'Tag, search,
// and filter your previous conversations.' scene"):
//   1. All Sessions → the switcher drops down with each session's status, and holds 3.8 s (the
//      scene holds it open that long); the status line is said only while it is up (bars 0–1.75).
//   2. Resume → the browser with "econ" narrowing it → the found conversation opened in the preview →
//      Organize → the tag → the start of the note, one take at 1.55× under the one line (bars 1.75–4).
//      The drag along the strip is CUT (Destin: "drop this"). The preview click is Destin's pick on the
//      2026-09-11 review (F-4): the redesigned Resume screen left its right half empty without it, and he
//      accepted losing most of the note typing to keep four bars.
const T_SEARCH = B('b7', 1.75), END = LEN('b7');
const MENU_AT = 6;                                                                   // local frame the switcher is open
const S1_FROM = markFrame('promo-conversations', 'menu', 'end') - MENU_AT;
// shot 1 must end BEFORE the Resume click: the line is up only while the switcher is
if (S1_FROM + T_SEARCH > markFrame('promo-conversations', 'resume', 'start')) throw new Error('the switcher shot runs into the Resume click — hold the menu open longer in the scene');
const S2_RATE = 1.55;
const S2_FROM = markFrame('promo-conversations', 'resume', 'end', -4);
assertClipCovers('promo-conversations', S1_FROM, T_SEARCH);
assertClipCovers('promo-conversations', S2_FROM, END - T_SEARCH, S2_RATE);
if (S2_FROM + Math.ceil((END - T_SEARCH) * S2_RATE) > markFrame('promo-conversations', 'close', 'start')) throw new Error('the search-and-tag shot runs into the sheet closing');
const P = perch(0.3);
const Beat7: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={T_SEARCH}><Footage file="promo-conversations" from={S1_FROM} /></Sequence>
    <Sequence from={T_SEARCH}><Footage file="promo-conversations" from={S2_FROM} rate={S2_RATE} /></Sequence>
    <Label text={CAPTIONS.b7.head} at={B('b7', 0) + 4} slug="midnight" />
  </AbsoluteFill>
);
// Two lines, each said beside the thing it is about:
//   the sessions menu drops from the title bar's centre, each row with its status — said from the bar, pointing down at it,
//   and gone (until) the frame the shot cuts to the Resume click
//   the Resume browser (30–69 % across); the host stands right of it, pointing at the search field; the Organize sheet
//   is the same panel, so the one stand covers the tag and the note too
const P7 = present('b7', [
  { at: MENU_AT + 4, say: 'Easily see the status of working assistants.', target: inWindow(0.62, 0.15), stand: 'bar', face: 'welcome', until: T_SEARCH - 4 },
  // WHY 'bar' (2026-09-11): with the found conversation opened in the preview, the old stand
  // (right of the window, at 0.68 across) put the host ON the preview's header card and its text.
  // From the title bar he points down at that header card — the tags on it — and covers nothing.
  { at: T_SEARCH + 10, say: 'Tag, search, and filter your previous conversations.', target: inWindow(0.68, 0.14), stand: 'bar', face: 'welcome', until: END - 6 },
], 'midnight', P, END - 6);
export const beat7: BeatModule = { id: 'b7', slug: 'midnight', home: P7.home, Component: Beat7,
  host: P7.host,
  bubbles: P7.bubbles };
