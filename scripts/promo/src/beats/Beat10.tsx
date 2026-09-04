import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { CAPTIONS } from '../captions';
import { perch, windowRect, CAPTION, WINDOW } from '../layout';
import { assertClipCovers } from '../marks';
import { A } from '../host/engine';
import { PRE } from '../timeline';
import { L, LEN, present, inWindow, type BeatModule } from './beat';

// Beat 10 (bars 38–43 + the audio tail), the close, in Golden Sunbreak: the
// window arrives full size under the wipe and settles smaller; the wordmark,
// the platforms line and the link; the host waves, cheers on the final hit
// (bar 43), and stays to the fade.
const SCALE = 0.7;
const DY = -96;
const R = windowRect(SCALE);
const CAP_TOP = R.y + DY + R.h + 30;
assertClipCovers('promo-idle-golden', 0, LEN('b10'));
const P = { x: perch(0.3, SCALE).x, y: perch(0.3, SCALE).y + DY };
// Where it ends: standing just left of the Y of the big "YouCoded" under the window, the way
// the film began (Destin, 2026-09-04). Inter 800 at 84 px: the word is ~394 px wide, centred
// at 960, so the Y's left edge is ~763; the feet sit on the word's baseline.
const Y_SPOT = { x: 763 - 24 - 120 + 22, y: CAP_TOP + 84 * 0.92 - 120 * 0.86 };
const HOME = perch(0.3);
const Settle: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const s = spring({ frame: f - PRE, fps, config: { damping: 18, stiffness: 90 } });
  return <Footage file="promo-idle-golden" from={0} scale={interpolate(s, [0, 1], [WINDOW.scale, SCALE])} dy={interpolate(s, [0, 1], [0, DY])} />;
};
const Beat10: React.FC = () => (
  <AbsoluteFill>
    <Settle />
    <Caption head="YouCoded" at={L('b10', 38) + 16} theme="golden-sunbreak" top={CAP_TOP} size={84} headColor="#fff" />
    <Caption head={CAPTIONS.b10.head} sub={CAPTIONS.b10.sub} at={L('b10', 39)} subAt={L('b10', 39) + 6} theme="golden-sunbreak" top={CAP_TOP + 104} size={36} />
    <Caption head={CAPTIONS.link} at={L('b10', 40)} theme="golden-sunbreak" top={CAP_TOP + 104 + CAPTION.h - 14} size={36} headColor="#ffc030" />
  </AbsoluteFill>
);
const P10 = present([
  { at: L('b10', 39) + 4, say: "That's me. See you in there!", face: 'happy', until: L('b10', 42) },
], 'golden-sunbreak', P);
// The host hops down with the window as it settles (the perch moves), waves with its
// line, cheers the final hit, and SHUTS DOWN — eyes closed, limbs tucked under — as the picture fades.
export const beat10: BeatModule = { id: 'b10', slug: 'golden-sunbreak', home: HOME, Component: Beat10,
  host: [
    A.hop(PRE + 6, 26, P.x, P.y, 60),
    A.wave(L('b10', 39), 50), ...P10.host,
    A.cheer(L('b10', 43), 30), A.face(L('b10', 43), 'happy'), A.face(L('b10', 43) + 34, 'welcome'),
    A.hop(L('b10', 43) + 40, 28, Y_SPOT.x, Y_SPOT.y, 70), A.look(L('b10', 44) + 4, 8, 0.5, 0),   // down beside the Y, a glance at it
    A.shutdown(L('b10', 44) + 20),
  ],
  bubbles: P10.bubbles };
