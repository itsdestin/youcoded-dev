import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { Backdrop } from '../Backdrop';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { Mascot } from '../Mascot';
import { CAPTIONS } from '../captions';
import { FRAME, MASCOT, perch } from '../layout';
import { barFrame } from '../grid';
import { assertClipCovers } from '../marks';
import { Sfx } from './sfx';

// Beat 1 (bars 0–2), the cold open: the wordmark alone in the dark, the host
// peeks up over the bottom edge, then the window rises on bar 1's downbeat and
// the host hops onto its title bar.
const RISE = barFrame(1);            // 61 — the window arrives on the downbeat
const BEAT = barFrame(2) + 6;        // 128 — the beat plus the transition it is padded by
const P = perch();
assertClipCovers('promo-idle-midnight', 0, BEAT - RISE);

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
  return <Caption text={CAPTIONS.b1a} at={4} top={FRAME.h / 2 - 90} size={84} />;
};

export const Beat1: React.FC = () => (
  <AbsoluteFill>
    <Backdrop theme="midnight" />
    <Sequence from={RISE}><Rise /></Sequence>
    <Wordmark />
    <Caption text={CAPTIONS.b1b} at={RISE + 10} />
    {/* Draft round 1: at the title-bar size of 120 px the peek was a 45-px
        smudge on the bottom edge of an otherwise empty frame — unreadable as a
        character. It comes up at 200 px here and shrinks to its perch size on
        the hop, which the Mascot's size spring does for free. */}
    <Mascot cues={[
      { at: 0, x: 850, y: FRAME.h + 40, size: 200, pose: 'peek' },   // below the frame
      { at: 10, y: FRAME.h - 140 },                                   // peeks up over the bottom edge
      { at: 34, pose: 'curious' },                                    // looks around
      { at: RISE, x: P.x, y: P.y, size: MASCOT.size, pose: 'idle' },  // hops onto the title bar
    ]} />
    <Sfx at={10} name="pop" volume={0.45} />
    <Sfx at={RISE + 12} name="pop" volume={0.45} />
  </AbsoluteFill>
);
