import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { markFrame, markSec, assertClipCovers } from '../marks';
import { A } from '../host/engine';
import { PRE } from '../timeline';
import { L, LEN, present, inWindow, type BeatModule } from './beat';

// Beat 9 (bars 33–38): the WeCoded marketplace, in Light, on drop 2. The
// marketplace OPENS on bar 33's downbeat (the drawer shows during the wipe's
// lead-in); the Remember card and its detail page (35); Install (36); back in
// the chat with the new Remember chip (37).
const T_DETAIL = L('b9', 35), T_BACK = L('b9', 37), END = LEN('b9');
const S1_FROM = markFrame('promo-market', 'market', 'end', 2) - PRE;
// 0.6×: at 1× the grid shot ran into the Details click before the cut, so the dialog opened, snapped shut and opened again (draft review); the grid is static
const S1_RATE = 0.6;
const S2_FROM = markFrame('promo-market', 'detail', 'start', -6);
const S3_FROM = markFrame('promo-market', 'chip', 'start', -18);
assertClipCovers('promo-market', S1_FROM, T_DETAIL, S1_RATE);
assertClipCovers('promo-market', S2_FROM, T_BACK - T_DETAIL);
assertClipCovers('promo-market', S3_FROM, END - T_BACK);
const P = perch(0.3);
const Beat9: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={T_DETAIL}><Footage file="promo-market" from={S1_FROM} rate={S1_RATE} light /></Sequence>
    <Sequence from={T_DETAIL} durationInFrames={T_BACK - T_DETAIL}><Footage file="promo-market" from={S2_FROM} light /></Sequence>
    <Sequence from={T_BACK}><Footage file="promo-market" from={S3_FROM} pushIn={0.02} light /></Sequence>
    <Label text={CAPTIONS.b9.head} at={L('b9', 33) + 4} slug="light" />
  </AbsoluteFill>
);
const INSTALL = T_DETAIL + Math.round((markSec('promo-market', 'install') - markSec('promo-market', 'detail')) * 30) + 6;
const CHIP = T_BACK + 18;
const P9 = present([
  { at: L('b9', 33) + 10, say: "Need more? There's a marketplace.", point: 'down', face: 'happy' },                   // on the bar, over the grid
  { at: T_DETAIL + 8, say: 'Plugins, made by people like you.', spot: inWindow(0.86, 0.62), point: 'L', face: 'welcome' },   // beside the plugin page, clear of the filter row
  { at: INSTALL, say: 'One click.', face: 'happy' },
  { at: CHIP, say: "And it's in your chat.", spot: inWindow(0.5, 0.86), point: 'down', face: 'happy', until: END - 12 },   // above the chip in the chat
], 'light', P, END - 12);
export const beat9: BeatModule = { id: 'b9', slug: 'light', home: P, Component: Beat9,
  host: [...P9.host, A.clap(INSTALL + 2, 24)],                     // claps as Install lands
  bubbles: P9.bubbles };
