import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions';
// The cut between beats: a slanted wipe whose leading edge is a band of the
// INCOMING theme's accent colour. The wipe runs PRE frames before the downbeat
// to POST after (timeline.ts), so the new shot owns most of the frame exactly
// on the beat; the outgoing shot slides back a little for depth. Direction
// alternates per cut (Promo.tsx) so successive cuts do not all sweep the same way.
type Props = { accent: string; from: 'left' | 'right' };
const S = 22;         // slant, in % of width between the edge's top and bottom x
const BAND = 5;       // width of the accent band, % of width
const Wipe: React.FC<TransitionPresentationComponentProps<Props>> = ({ children, presentationDirection, presentationProgress, passedProps: { accent, from } }) => {
  const p = presentationProgress;
  // The edge travels from fully off one side to fully off the other so the band
  // itself leaves the frame; mirrored for 'right'. WHY the travel is the width
  // plus TWICE the slant and band: the entering presentation stays mounted for
  // the rest of its sequence at progress 1, so anything still inside the frame
  // at p = 1 is parked there for the whole beat (draft 6 had a stripe on every
  // shot for exactly this reason).
  const TRAVEL = 100 + 2 * (S + BAND);
  const edgeTop = from === 'left' ? -S - BAND + p * TRAVEL : 100 + S + BAND - p * TRAVEL;
  const edgeBot = from === 'left' ? edgeTop - S : edgeTop + S;
  const bandTop = from === 'left' ? edgeTop + BAND : edgeTop - BAND;
  const bandBot = from === 'left' ? edgeBot + BAND : edgeBot - BAND;
  if (presentationDirection === 'exiting') {
    const dx = (from === 'left' ? -1 : 1) * p * 70;
    return <AbsoluteFill style={{ transform: `translateX(${dx}px)`, opacity: 1 - p * 0.6 }}>{children}</AbsoluteFill>;
  }
  const revealed = from === 'left'
    ? `polygon(-100% 0%, ${edgeTop}% 0%, ${edgeBot}% 100%, -100% 100%)`
    : `polygon(200% 0%, ${edgeTop}% 0%, ${edgeBot}% 100%, 200% 100%)`;
  const band = `polygon(${edgeTop}% 0%, ${bandTop}% 0%, ${bandBot}% 100%, ${edgeBot}% 100%)`;
  const dx = (from === 'left' ? 1 : -1) * (1 - p) * 50;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: revealed, transform: `translateX(${dx}px)` }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ clipPath: band, background: accent, opacity: 0.95 }} />
    </AbsoluteFill>
  );
};
export const accentWipe = (props: Props): TransitionPresentation<Props> => ({ component: Wipe, props });
