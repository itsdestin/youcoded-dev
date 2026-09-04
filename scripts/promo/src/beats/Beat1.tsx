import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { CAPTIONS } from '../captions';
import { FRAME, MASCOT, perch } from '../layout';
import { assertClipCovers } from '../marks';
import { L, LEN, type BeatModule } from './beat';
import { Sfx } from './sfx';

// Beat 1 (bars 0–2), the cold open: the wordmark alone in the dark, the host
// peeks up over the bottom edge, then the window rises on bar 1's downbeat and
// the host hops onto its title bar.
const RISE = L('b1', 1);             // 61 — the window arrives on the downbeat
const P = perch();
assertClipCovers('promo-idle-midnight', 0, LEN('b1') - RISE);

// The window rises from 700 px below and fades in as it lands.
const Rise: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 18, stiffness: 90, mass: 1 } });
  return <Footage file="promo-idle-midnight" from={0} dy={interpolate(s, [0, 1], [700, 0])} opacity={interpolate(s, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' })} />;
};
// The wordmark holds the empty frame, then hands off to the window.
const Wordmark: React.FC = () => {
  const f = useCurrentFrame();
  if (f >= RISE + 6) return null;
  return <Caption head={CAPTIONS.b1.head} at={0} theme="midnight" top={FRAME.h / 2 - 70} size={96} headColor="#fff" />;
};
const Beat1: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={RISE}><Rise /></Sequence>
    <Wordmark />
    <Caption head={CAPTIONS.b1.sub} at={RISE + 10} theme="midnight" />
    <Sfx at={10} name="pop" volume={0.45} />
    <Sfx at={RISE + 14} name="pop" volume={0.45} />
  </AbsoluteFill>
);
export const beat1: BeatModule = {
  id: 'b1', slug: 'midnight', home: P, Component: Beat1, arrival: 'none',
  /* At the title-bar size of 120 px the peek was a 45-px smudge on the bottom
     edge of an empty frame — it comes up at 200 px and shrinks on the hop. */
  cues: [
    { at: 0, x: 850, y: FRAME.h + 40, size: 200, pose: 'peek', costume: 'midnight' },   // below the frame
    { at: 4, y: FRAME.h - 140 },                                                       // peeks up over the bottom edge
    { at: 34, pose: 'curious' },                                                        // looks around
    { at: RISE, x: P.x, y: P.y, size: MASCOT.size, pose: 'idle', hop: true },          // hops onto the title bar
  ],
};
