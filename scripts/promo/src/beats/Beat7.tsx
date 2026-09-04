import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, markSec, assertClipCovers } from '../marks';
import { A } from '../host/engine';
import { L, LEN, type BeatModule } from './beat';

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
const MENU = 10, RESUME = MENU + Math.round((markSec('promo-conversations', 'resume') - markSec('promo-conversations', 'menu')) * 30);
const NOTE_TYPED = T_NOTE + 22, DROP = T_DRAG + Math.round((markSec('promo-conversations', 'drag', 'end') - markSec('promo-conversations', 'drag')) * 30);
// The host points at the sessions menu and at Resume, walks to the middle of the bar
// above the resume browser and points into it as "econ" narrows the list, thinks over
// the note being typed and nods at it, then follows the pill along the strip with its
// eyes and points at where it lands.
export const beat7: BeatModule = { id: 'b7', slug: 'midnight', home: P, Component: Beat7,
  host: [
    A.point(MENU + 4, 'R', 0.7), A.face(MENU + 4, 'curious'), A.look(MENU + 4, 6, 0.4, 0.4),                    // the menu
    A.nod(RESUME + 6), A.rest(RESUME + 24),                                                                    // Resume
    A.walk(T_SEARCH + 2, 26, perch(0.5).x, 5), A.look(T_SEARCH + 2, 10, 0.1, 0.5),                            // over the browser
    A.point(T_SEARCH + 34, 'R', 0.9), A.face(T_SEARCH + 34, 'curious'),                                       // "type a word, it narrows"
    A.rest(T_NOTE - 6), A.think(NOTE_TYPED), A.look(NOTE_TYPED, 8, 0.2, 0.5),                                  // the note
    A.rest(T_DRAG - 24), A.nod(T_DRAG - 22), A.face(T_DRAG - 22, 'welcome'),
    A.look(T_DRAG + 4, 10, -0.5, 0.3), A.look(T_DRAG + 22, 14, 0.5, 0.3),                                     // follows the pill
    A.point(DROP + 2, 'R', 0.8), A.face(DROP + 2, 'happy'), A.face(DROP + 30, 'welcome'), A.rest(DROP + 34), A.blink(DROP + 44),
  ],
  bubbles: [{ at: L('b7', 24) + 18, until: T_NOTE - 10, text: CAPTIONS.b7.sub, slug: 'midnight' }] };
