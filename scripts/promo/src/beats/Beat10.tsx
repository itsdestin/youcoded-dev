import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { Footage } from '../Footage';
import { Caption } from '../Caption';
import { CAPTIONS } from '../captions';
import { perch, WINDOW, CLIP } from '../layout';
import { THEMES } from '../themes';
import { assertClipCovers } from '../marks';
import { A } from '../host/engine';
import { PRE } from '../timeline';
import { B, LEN, present, type BeatModule } from './beat';

// Beat 10 (4 bars + the audio tail), the close, in Golden Sunbreak. Destin,
// 2026-09-04: "the youcoded window should fully zoom in to take up most of the
// frame, and then the text / platform list / website can all be placed in a nice
// big popup modal in the middle of that youcoded window." So: the window arrives
// at its usual size under the wipe and GROWS to fill the frame (1.15× — 1656×1035
// of 1920×1080), the app behind dims like it does under a real dialog, and a big
// modal pops up in the middle of it carrying the wordmark, "Free. Open source.",
// the platforms and the site. The host hops down to stand just left of the Y
// inside the modal (the way the film began), waves with its line, cheers the
// final hit on its fourth bar, and shuts down before the fade.
const T = THEMES['golden-sunbreak'];
const SCALE = 1.15;                                   // the biggest the 16:10 window fits in the 16:9 frame with a little air
const WIN_H = CLIP.h * SCALE;                          // 1035
const MODAL = { w: 1200, h: 440, x: 360, y: WINDOW.cy - 220 };   // centred on the window's centre; sized to the text (the first study had a bare bottom half)
const WORD_TOP = MODAL.y + 96;                         // the wordmark's top inside the modal
assertClipCovers('promo-idle-golden', 0, LEN('b10'));
// Standing just left of the Y of the big "YouCoded" (Inter 800 at 84 px: the word is ~394 px wide,
// centred at 960, so the Y's left edge is ~763); the feet sit on the word's baseline.
export const Y_SPOT = { x: 763 - 24 - 120 + 22, y: WORD_TOP + 84 * 0.92 - 120 * 0.86 };
const HOME = perch(0.3);
const GROW_AT = PRE + 4, MODAL_AT = PRE + 22;
/** The window grows from its film size to SCALE over ~0.8 s, then holds. */
const Grow: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const s = spring({ frame: f - GROW_AT, fps, config: { damping: 19, stiffness: 80 } });
  return <Footage file="promo-idle-golden" from={0} scale={interpolate(s, [0, 1], [WINDOW.scale, SCALE])} />;
};
/** The scrim over the app and the modal on top of it — the app's own dialog look: a dark panel with a gold hairline. */
const Modal: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  if (f < MODAL_AT) return null;
  const s = spring({ frame: f - MODAL_AT, fps, config: { damping: 14, stiffness: 150 } });
  const scrim = interpolate(f - MODAL_AT, [0, 12], [0, 0.5], { extrapolateRight: 'clamp' });
  return (
    <>
      {/* the scrim is clipped to the window, like a real in-app dialog's backdrop */}
      <div style={{ position: 'absolute', left: WINDOW.cx - (CLIP.w * SCALE) / 2, top: WINDOW.cy - WIN_H / 2, width: CLIP.w * SCALE, height: WIN_H, borderRadius: 16, background: `rgba(4,4,10,${scrim.toFixed(3)})` }} />
      <div style={{ position: 'absolute', left: MODAL.x, top: MODAL.y, width: MODAL.w, height: MODAL.h, borderRadius: 28,
        background: 'rgba(14,14,22,0.94)', border: `1.5px solid ${T.accent}66`,
        boxShadow: `0 40px 120px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.06), 0 0 80px ${T.accent}33`,
        transform: `scale(${interpolate(s, [0, 1], [0.92, 1]).toFixed(3)})`, transformOrigin: '50% 50%', opacity: Math.min(1, s * 1.5) }} />
    </>
  );
};
export const Beat10: React.FC = () => (
  <AbsoluteFill>
    <Grow />
    <Modal />
    <Caption head="YouCoded" at={MODAL_AT + 6} theme="golden-sunbreak" top={WORD_TOP} size={84} headColor="#fff" />
    <Caption head={CAPTIONS.b10.head} sub={CAPTIONS.b10.sub} at={MODAL_AT + 22} subAt={MODAL_AT + 28} theme="golden-sunbreak" top={WORD_TOP + 108} size={36} />
    <Caption head={CAPTIONS.link} at={B('b10', 1) + 8} theme="golden-sunbreak" top={WORD_TOP + 108 + 100} size={36} headColor={T.accent} />
  </AbsoluteFill>
);
/** The wind-down into the powered-down pose, from the ta-da: the arms come down, the eyes close, the body settles. */
const POWER_DOWN = (at: number) => [A.rest(at, 12), A.shutdown(at + 10, 18)];
const P10 = present('b10', [
  { at: MODAL_AT + 30, say: 'See you in there!', face: 'happy', side: 'L', until: B('b10', 3) - 4 },
], 'golden-sunbreak', Y_SPOT);
// The close: as the window grows and the modal pops up the host hops down from the title bar
// (which is rising out of frame) to stand beside the Y inside the modal, waves with its line,
// cheers the final hit on its fourth bar, and SHUTS DOWN — eyes closed, limbs tucked under — a couple
// of seconds before the picture fades.
export const beat10: BeatModule = { id: 'b10', slug: 'golden-sunbreak', home: HOME, Component: Beat10,
  host: [
    A.hop(GROW_AT + 2, 30, Y_SPOT.x, Y_SPOT.y, 90),
    A.wave(MODAL_AT + 30, 44), ...P10.host,
    // the cheer on the final hit settles into E · ta-da (Destin's pick, 2026-09-04: arms wide, presenting the
    // wordmark, happy), held for two seconds; then, as the picture starts to dim, it winds down into the
    // powered-down pose (the candidates are P1–P6 in studies/EndPoseStudy.tsx; P1 until he picks)
    A.cheer(B('b10', 3), 30), A.face(B('b10', 3), 'happy'),
    A.tada(B('b10', 3) + 30, 'C', 14), A.look(B('b10', 3) + 40, 8, 0, 0),
    ...POWER_DOWN(LEN('b10') - 38),
  ],
  bubbles: P10.bubbles };
