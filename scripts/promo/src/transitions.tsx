import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions';
// The cut between beats: a slanted wipe whose leading edge is a band of the
// INCOMING theme's accent colour. The wipe runs PRE frames before the downbeat
// to POST after (timeline.ts), so the new shot owns most of the frame exactly
// on the beat; the outgoing shot slides back a little for depth. Direction
// alternates per cut (Promo.tsx) so successive cuts do not all sweep the same way.
export type WipeFrom = 'left' | 'right';
type Props = { accent: string; from: WipeFrom };
const S = 22;         // slant, in % of width between the edge's top and bottom x
const BAND = 5;       // width of the accent band, % of width
/** The wipe's leading edge at progress p: x (% of width) at the top and bottom of the frame. Shared with the backdrop so both sweep as one. */
export function wipeEdge(p: number, from: WipeFrom) {
  const TRAVEL = 100 + 2 * (S + BAND);
  const top = from === 'left' ? -S - BAND + p * TRAVEL : 100 + S + BAND - p * TRAVEL;
  return { top, bot: from === 'left' ? top - S : top + S };
}
/** clip-path polygon of everything the edge has already passed over. */
export const revealedPolygon = (p: number, from: WipeFrom) => {
  const { top, bot } = wipeEdge(p, from);
  return from === 'left' ? `polygon(-100% 0%, ${top}% 0%, ${bot}% 100%, -100% 100%)` : `polygon(200% 0%, ${top}% 0%, ${bot}% 100%, 200% 100%)`;
};
const Wipe: React.FC<TransitionPresentationComponentProps<Props>> = ({ children, presentationDirection, presentationProgress, passedProps: { accent, from } }) => {
  const p = presentationProgress;
  // The edge travels from fully off one side to fully off the other so the band
  // itself leaves the frame; mirrored for 'right'. WHY the travel is the width
  // plus TWICE the slant and band: the entering presentation stays mounted for
  // the rest of its sequence at progress 1, so anything still inside the frame
  // at p = 1 is parked there for the whole beat (draft 6 had a stripe on every
  // shot for exactly this reason). Neither shot moves sideways: the windows sit
  // on the same rect, so the wipe swaps one for the other with no doubled edge
  // (the review of draft 7 read the parallax as two windows).
  const { top: edgeTop, bot: edgeBot } = wipeEdge(p, from);
  const bandTop = from === 'left' ? edgeTop + BAND : edgeTop - BAND;
  const bandBot = from === 'left' ? edgeBot + BAND : edgeBot - BAND;
  if (presentationDirection === 'exiting') return <AbsoluteFill>{children}</AbsoluteFill>;
  const band = `polygon(${edgeTop}% 0%, ${bandTop}% 0%, ${bandBot}% 100%, ${edgeBot}% 100%)`;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: revealedPolygon(p, from) }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ clipPath: band, background: accent, opacity: 0.95 }} />
    </AbsoluteFill>
  );
};
export const accentWipe = (props: Props): TransitionPresentation<Props> => ({ component: Wipe, props });
