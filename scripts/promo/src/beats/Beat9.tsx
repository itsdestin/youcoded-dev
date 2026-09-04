import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { A } from '../host/engine';
import { PRE } from '../timeline';
import { L, LEN, type BeatModule } from './beat';

// Beat 9 (bars 33–38): the WeCoded marketplace, in Light, on drop 2. The
// marketplace OPENS on bar 33's downbeat (the drawer shows during the wipe's
// lead-in); the Remember card and its detail page (35); Install (36); back in
// the chat with the new Remember chip (37).
const T_DETAIL = L('b9', 35), T_BACK = L('b9', 37), END = LEN('b9');
const S1_FROM = markFrame('promo-market', 'market', 'end', 2) - PRE;
const S2_FROM = markFrame('promo-market', 'detail', 'start', -6);
const S3_FROM = markFrame('promo-market', 'chip', 'start', -18);
assertClipCovers('promo-market', S1_FROM, T_DETAIL);
assertClipCovers('promo-market', S2_FROM, T_BACK - T_DETAIL);
assertClipCovers('promo-market', S3_FROM, END - T_BACK);
const P = perch(0.3);
const Beat9: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={T_DETAIL}><Footage file="promo-market" from={S1_FROM} light /></Sequence>
    <Sequence from={T_DETAIL} durationInFrames={T_BACK - T_DETAIL}><Footage file="promo-market" from={S2_FROM} light /></Sequence>
    <Sequence from={T_BACK}><Footage file="promo-market" from={S3_FROM} pushIn={0.02} light /></Sequence>
    <Caption head={CAPTIONS.b9.head} sub={CAPTIONS.b9.sub} at={L('b9', 33) + 4} theme="light" />
  </AbsoluteFill>
);
export const beat9: BeatModule = { id: 'b9', slug: 'light', home: P, Component: Beat9,
  host: [
    A.face(L('b9', 33) + 4, 'shocked'), A.look(L('b9', 33) + 4, 6, 0.2, 0.5), A.face(L('b9', 34), 'welcome'),   // wow, a marketplace
    A.hop(T_DETAIL - 8, 24, perch(0.5).x, perch(0.5).y, 50), A.face(T_DETAIL + 10, 'curious'),
    A.face(L('b9', 36) + 10, 'welcome'), A.pose(L('b9', 36) + 10, 12, { armL: 150, armR: -150 }), A.pose(L('b9', 36) + 40, 12, { armL: 0, armR: 0 }),   // installed!
    A.hop(T_BACK - 8, 24, P.x, P.y, 50), A.blink(T_BACK + 20),
  ] };
