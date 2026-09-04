import React from 'react';
import { AbsoluteFill, Sequence, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { Footage } from '../Footage';
import { Phone } from '../Phone';
import { Caption } from '../Caption';
import { CAPTIONS } from '../captions';
import { PHONE, perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { A } from '../host/engine';
import { L, LEN, type BeatModule } from './beat';
import { Sfx } from './sfx';

// Beat 8 (bars 28–33): pick up on any device, in Devil's Garden. The chat on
// the laptop (bar 28); the phone slides in on 29 with only its session list,
// taps the session, and the PHONE asks "This session is active on Desktop —
// take over here?"; Take over, and the conversation loads (30–31); on 32 the
// phone opens its project files: the same spreadsheet, already there.
const T1 = L('b8', 29), T_FILES = L('b8', 32), END = LEN('b8');
// The laptop's clip (7.3 s) is shorter than the beat (10.4 s) and static, so it
// plays twice — the second shot starts on bar 31, where nothing on it moves.
const T_LAP2 = L('b8', 31);
assertClipCovers('promo-anydevice', 0, T_LAP2);
assertClipCovers('promo-anydevice', 0, END - T_LAP2);
// The phone: the list and the tap run at 1.2× so the take-over prompt and the
// loaded chat both land inside bars 29–31; a jump to the files panel on 32.
const P_RATE = 1.2;
const P1_FROM = markFrame('promo-phone-takeover', 'list', 'start', -8);
const P2_FROM = markFrame('promo-phone-takeover', 'files', 'start', -15);
assertClipCovers('promo-phone-takeover', P1_FROM, T_FILES - T1, P_RATE);
assertClipCovers('promo-phone-takeover', P2_FROM, END - T_FILES);
const P = perch(0.3);
const ON_PHONE = { x: PHONE.x + 40, y: PHONE.y - 62 };
const PhoneIn: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 17, stiffness: 110, mass: 1 } });
  const x = interpolate(s, [0, 1], [1980, PHONE.x]);
  return (
    <Phone x={x}>
      <Sequence durationInFrames={T_FILES - T1}><OffthreadVideo src={staticFile('footage/promo-phone-takeover.webm')} trimBefore={P1_FROM} playbackRate={P_RATE} muted style={{ width: PHONE.w, height: PHONE.h }} /></Sequence>
      <Sequence from={T_FILES - T1}><OffthreadVideo src={staticFile('footage/promo-phone-takeover.webm')} trimBefore={P2_FROM} muted style={{ width: PHONE.w, height: PHONE.h }} /></Sequence>
    </Phone>
  );
};
const Beat8: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={T_LAP2}><Footage file="promo-anydevice" from={0} /></Sequence>
    <Sequence from={T_LAP2}><Footage file="promo-anydevice" from={0} /></Sequence>
    <Sequence from={T1}><PhoneIn /></Sequence>
    <Caption head={CAPTIONS.b8.head} sub={CAPTIONS.b8.sub} at={L('b8', 28) + 4} subAt={T1 + 8} theme="devils-garden" />
    <Sfx at={T1 + 6} name="whoosh" volume={0.3} />
  </AbsoluteFill>
);
export const beat8: BeatModule = { id: 'b8', slug: 'devils-garden', home: P, Component: Beat8,
  host: [
    A.look(T1 - 10, 8, 0.6, 0.2),                                                  // sees the phone coming
    A.hop(T1 + 6, 28, ON_PHONE.x, ON_PHONE.y, 90), A.to(T1 + 6, 28, 'size', 96), A.face(T1 + 20, 'curious'), A.look(T1 + 30, 8, 0, 0.5),   // hops onto the phone
    A.blink(T_FILES - 20), A.face(T_FILES, 'welcome'), A.pose(T_FILES + 4, 12, { armL: 150, armR: -150 }), A.pose(T_FILES + 40, 12, { armL: 0, armR: 0 }),   // the files are there
  ] };
