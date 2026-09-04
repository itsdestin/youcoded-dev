import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { CAPTIONS } from '../captions';
import { perch } from '../layout';
import { BAR_S } from '../grid';
import { markFrame, markSec, assertClipCovers } from '../marks';
import { L, LEN, type BeatModule } from './beat';

// Beat 3 (bars 5–8): the spreadsheet, in Meadow Mist. Two shots of ONE
// recording — the request going out, then a jump to the re-opened, sorted sheet
// on bar 7's downbeat.
const CUT_AT = L('b3', 7);
const A_FROM = markFrame('promo-sheet', 'attach', 'start', -6);
// The recording spends ~12 s between attaching the file and the reply landing;
// two bars is 4 s, so the shot runs fast. Capped at 1.6: past that the typing
// reads as a glitch rather than as someone typing.
const A_RATE = Math.min(1.6, Math.max(1, (markSec('promo-sheet', 'reply', 'end') - markSec('promo-sheet', 'attach', 'start')) / (2 * BAR_S)));
// +20 (0.67 s) after the click's end: the panel shows "Loading spreadsheet…" for
// a moment when it re-opens, and a shot that opens on that reads as a reload.
const B_FROM = markFrame('promo-sheet', 'after', 'end', 20);
const P = perch(0.25);
const LEAN = perch(0.62);                      // leans toward the files panel on the right
assertClipCovers('promo-sheet', A_FROM, CUT_AT, A_RATE);
assertClipCovers('promo-sheet', B_FROM, LEN('b3') - CUT_AT);
const Beat3: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={CUT_AT}><Footage file="promo-sheet" from={A_FROM} rate={A_RATE} light /></Sequence>
    <Sequence from={CUT_AT}><Footage file="promo-sheet" from={B_FROM} pushIn={0.03} light /></Sequence>
    <Caption head={CAPTIONS.b3.head} sub={CAPTIONS.b3.sub} at={L('b3', 5) + 6} theme="meadow-mist" />
  </AbsoluteFill>
);
export const beat3: BeatModule = { id: 'b3', slug: 'meadow-mist', home: P, Component: Beat3,
  cues: [{ at: CUT_AT - 4, x: LEAN.x, y: LEAN.y, pose: 'curious', hop: true }] };   // hops over to peer at the sheet
