import React from 'react';
import { AbsoluteFill, Sequence, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { Footage } from '../Footage';
import { Phone } from '../Phone';
import { Caption } from '../Caption';
import { CAPTIONS } from '../captions';
import { PHONE, MASCOT, perch } from '../layout';
import { markFrame, clipFrames, assertClipCovers } from '../marks';
import { L, LEN, type BeatModule } from './beat';
import { Sfx } from './sfx';

// Beat 6 (bars 18–22): Remote Access on the laptop, the phone slides in on bar
// 19 and carries the same conversation, then on bar 21 the laptop asks to take
// over. Devil's Garden.
const T1 = L('b6', 19);                          // the phone slides in
const T2 = L('b6', 21);                          // cut to the takeover recording
const END = LEN('b6');
// 'resumed' is an in-page observer that resolves when the "take over here"
// dialog has left the DOM — the frame the click has visibly landed. The shot
// holds AFTER_RESUME frames of the app's answer after it.
const AFTER_RESUME = 12;
const END_AT = markFrame('promo-takeover', 'resumed', 'end') + AFTER_RESUME;
const LEAD = 30;                                 // the takeover shot opens 1 s before its action
// Shot A opens on the clip's first frame: the CHAT, then Settings, then the
// Remote Access popup — the review of draft 7 could not tell the phone carried
// the same conversation when the laptop only ever showed Settings.
const A_FROM = 0;
const B_FROM = END_AT - (END - T2);
// The phone runs to the end of the beat: it opens LEAD frames before the reply,
// or as late as the clip can still cover, whichever is earlier.
const PHONE_FROM = Math.min(markFrame('promo-phone', 'reply', 'start', -LEAD), clipFrames('promo-phone') - (END - T1));
const P = perch(0.3);
const ON_PHONE = { x: PHONE.x + 40, y: PHONE.y - 60, size: 96 };
assertClipCovers('promo-remote', A_FROM, T2);
assertClipCovers('promo-takeover', B_FROM, END - T2);
assertClipCovers('promo-phone', PHONE_FROM, END - T1);

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
const Beat6: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={T2}><Footage file="promo-remote" from={A_FROM} /></Sequence>
    <Sequence from={T2}><Footage file="promo-takeover" from={B_FROM} /></Sequence>
    <Sequence from={T1}><PhoneIn /></Sequence>
    <Caption head={CAPTIONS.b6.head} sub={CAPTIONS.b6.sub} at={L('b6', 18) + 4} subAt={T1 + 8} theme="devils-garden" />
    <Sfx at={T1 + 8} name="pop" volume={0.4} />
    <Sfx at={T2 + 10} name="pop" volume={0.4} />
  </AbsoluteFill>
);
export const beat6: BeatModule = { id: 'b6', slug: 'devils-garden', home: P, Component: Beat6,
  cues: [
    { at: T1 + 8, ...ON_PHONE, pose: 'curious', hop: true },                              // hops onto the phone
    { at: T2 + 10, x: P.x, y: P.y, size: MASCOT.size, pose: 'idle', hop: true },          // back to the laptop
  ] };
