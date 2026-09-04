import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, markSec, assertClipCovers } from '../marks';
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
    <Label text={CAPTIONS.b9.head} at={L('b9', 33) + 4} slug="light" />
  </AbsoluteFill>
);
const INSTALL = T_DETAIL + Math.round((markSec('promo-market', 'install') - markSec('promo-market', 'detail')) * 30) + 6;
const CHIP = T_BACK + 18;
// The host is startled by the marketplace ("wow"), walks to the middle of the bar above
// the Remember card and points at it, claps as Install lands, walks back for the chat
// and points at the new Remember chip.
export const beat9: BeatModule = { id: 'b9', slug: 'light', home: P, Component: Beat9,
  host: [
    A.startle(L('b9', 33) + 6), A.look(L('b9', 33) + 6, 6, 0.2, 0.5), A.face(L('b9', 33) + 24, 'happy'), A.face(L('b9', 34), 'welcome'),   // wow, a marketplace
    A.walk(T_DETAIL - 10, 26, perch(0.5).x, 5), A.look(T_DETAIL - 10, 10, 0.1, 0.5),
    A.point(T_DETAIL + 20, 'R', 0.9), A.face(T_DETAIL + 20, 'curious'),                                          // the card
    A.rest(INSTALL - 6), A.clap(INSTALL, 26), A.face(INSTALL, 'happy'), A.face(INSTALL + 30, 'welcome'),         // installed!
    A.walk(T_BACK - 8, 26, P.x, 5), A.look(T_BACK - 8, 10, 0, 0.3),
    A.point(CHIP, 'R', 0.9), A.face(CHIP, 'happy'), A.look(CHIP, 6, 0.2, 0.6), A.face(CHIP + 30, 'welcome'), A.rest(CHIP + 34), A.blink(CHIP + 44),   // the chip in the chat
  ],
  bubbles: [{ at: L('b9', 33) + 30, until: T_DETAIL - 14, text: CAPTIONS.b9.sub, slug: 'light' }] };
