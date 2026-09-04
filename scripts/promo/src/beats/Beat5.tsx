import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { L, LEN, type BeatModule } from './beat';

// Beat 5 (bars 14–18): manage your conversations, in Kuromi Dreamer. Four
// shots of one recording on the grid: All Sessions → Resume (bar 14), the
// Resume browser with a search narrowing it (bar 15) — the quiet break — then
// a note typed onto a conversation in the Organize sheet, its tag already on
// (bar 16), and a pill dragged into order on the strip under the snare roll
// (bar 17). The recording is slower than the bars (the browser takes 1.6 s to
// open, the sheet 1 s), so the shots jump between moments where the UI is at
// rest rather than running the clip fast.
const T_SEARCH = L('b5', 15), T_NOTE = L('b5', 16), T_DRAG = L('b5', 17), END = LEN('b5');
const S1_FROM = markFrame('promo-conversations', 'menu', 'start', -10);
const S2_FROM = markFrame('promo-conversations', 'search', 'end', 12) - (T_NOTE - T_SEARCH);
const S3_FROM = markFrame('promo-conversations', 'note', 'start', -22);
const S4_FROM = markFrame('promo-conversations', 'drag', 'end', 8) - (END - T_DRAG);
assertClipCovers('promo-conversations', S1_FROM, T_SEARCH);
assertClipCovers('promo-conversations', S2_FROM, T_NOTE - T_SEARCH);
assertClipCovers('promo-conversations', S3_FROM, T_DRAG - T_NOTE);
assertClipCovers('promo-conversations', S4_FROM, END - T_DRAG);
const P = perch(0.2);
const Beat5: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={T_SEARCH}><Footage file="promo-conversations" from={S1_FROM} light /></Sequence>
    <Sequence from={T_SEARCH} durationInFrames={T_NOTE - T_SEARCH}><Footage file="promo-conversations" from={S2_FROM} light /></Sequence>
    <Sequence from={T_NOTE} durationInFrames={T_DRAG - T_NOTE}><Footage file="promo-conversations" from={S3_FROM} light /></Sequence>
    <Sequence from={T_DRAG}><Footage file="promo-conversations" from={S4_FROM} light /></Sequence>
    <Caption head={CAPTIONS.b5.head} sub={CAPTIONS.b5.sub} at={L('b5', 14) + 6} theme="kuromi-dreamer" />
  </AbsoluteFill>
);
export const beat5: BeatModule = { id: 'b5', slug: 'kuromi-dreamer', home: P, Component: Beat5,
  cues: [
    { at: L('b5', 15), pose: 'curious' },
    { at: T_DRAG + 20, x: perch(0.5).x, y: perch(0.5).y, pose: 'curious', hop: true },   // follows the pill along the strip
  ] };
