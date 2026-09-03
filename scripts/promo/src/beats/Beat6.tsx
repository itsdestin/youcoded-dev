import React from 'react';
import { AbsoluteFill, Sequence, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { Backdrop } from '../Backdrop';
import { Footage } from '../Footage';
import { Phone } from '../Phone';
import { Caption } from '../Caption';
import { Mascot } from '../Mascot';
import { CAPTIONS } from '../captions';
import { PHONE, MASCOT, perch } from '../layout';
import { barFrame } from '../grid';
import { CUT } from '../timeline';
import { markFrame, assertClipCovers } from '../marks';
import { Sfx } from './sfx';

// Beat 6 (bars 16–20): Remote Access on the laptop, the phone slides in and
// carries the same conversation, then the laptop asks to take over.
const BEAT = barFrame(21) - barFrame(16) + CUT;
const T1 = barFrame(1.5);                       // 92 — the phone slides in off the half-bar
// WHY T2 is bar 3.75 and not bar 3: after "Take over" is clicked the app puts
// up "Initializing session…" and holds it for the rest of the recording, which
// is dead air. Measured: the dialog is replaced at clip frame 240, eleven
// frames after the 'takeover' mark ends. Draft round 1 cut at bar 3.5 and ended
// the beat on that spinner. Bar 3.75 is still on the grid (beat 4 of bar 19)
// and leaves the shot exactly 82 frames — enough for the dialog, the click, and
// nothing after it.
const T2 = barFrame(3.75);                      // 229 — cut to the takeover recording
const SPINNER_AT = markFrame('promo-takeover', 'takeover', 'end', 11);   // 240: the dialog is gone
const A_FROM = markFrame('promo-remote', 'popup', 'start', -29);
const B_FROM = SPINNER_AT - (BEAT - T2);        // the shot ends on the last frame before the spinner
const PHONE_FROM = markFrame('promo-phone', 'reply', 'start', -50);
const P = perch();
const ON_PHONE = { x: PHONE.x + 40, y: PHONE.y - 60, size: 96 };
assertClipCovers('promo-remote', A_FROM, T2);
assertClipCovers('promo-takeover', B_FROM, BEAT - T2);
assertClipCovers('promo-phone', PHONE_FROM, BEAT - T1);

// The phone slides in from off the right edge on a spring.
const PhoneIn: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 17, stiffness: 110, mass: 1 } });
  return (
    <Phone x={interpolate(s, [0, 1], [1980, PHONE.x])}>
      <OffthreadVideo src={staticFile('footage/promo-phone.webm')} trimBefore={PHONE_FROM} muted style={{ width: PHONE.w, height: PHONE.h }} />
    </Phone>
  );
};

export const Beat6: React.FC = () => (
  <AbsoluteFill>
    <Backdrop theme="midnight" />
    <Sequence durationInFrames={T2}><Footage file="promo-remote" from={A_FROM} /></Sequence>
    <Sequence from={T2}><Footage file="promo-takeover" from={B_FROM} /></Sequence>
    <Sequence from={T1}><PhoneIn /></Sequence>
    <Caption text={CAPTIONS.b6} at={T1 + 8} />
    <Mascot cues={[
      { at: 0, x: P.x, y: P.y, pose: 'idle' },
      { at: T1 + 8, ...ON_PHONE, pose: 'curious' },      // hops onto the phone
      { at: T2 + 10, x: P.x, y: P.y, size: MASCOT.size, pose: 'idle' },   // back to the laptop, back to full size
    ]} />
    <Sfx at={T1 + 8} name="pop" volume={0.4} />
    <Sfx at={T2 + 10} name="pop" volume={0.4} />
  </AbsoluteFill>
);
