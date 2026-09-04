import React from 'react';
import { AbsoluteFill, Sequence, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { Footage } from '../Footage';
import { Phone } from '../Phone';
import { Label } from '../Label';
import { CAPTIONS } from '../captions';
import { PHONE, perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import { A } from '../host/engine';
import { B, LEN, present, type BeatModule } from './beat';
import { Sfx } from './sfx';

// Beat 8 (5 bars; eighth in the film since Destin's reorder of 2026-09-04): resume on
// your phone, in Devil's Garden. The chat on the laptop (bar 0); the phone slides in on
// bar 1 with only its session list and taps the session; the conversation is simply THERE
// (the take-over prompt is cut — Destin: "delete this frame. looks like unnecessary
// friction"); on bar 4 the phone opens its project files: the same spreadsheet.
const T1 = B('b8', 1), T_FILES = B('b8', 4), END = LEN('b8');
// The laptop's clip (7.3 s) is shorter than the beat (10.7 s) and static, so it
// plays twice — the second shot starts on bar 3, where nothing on it moves.
const T_LAP2 = B('b8', 3);
assertClipCovers('promo-anydevice', 0, T_LAP2);
assertClipCovers('promo-anydevice', 0, END - T_LAP2);
// The phone, three shots: the list and the tap at 1.2×; a jump to the loaded chat the
// moment the tap lands (skipping the prompt and the Take-over click); the files panel on bar 4.
const P_RATE = 1.2;
const P1_FROM = markFrame('promo-phone-takeover', 'list', 'start', -8);
const T_CHAT = T1 + Math.round((markFrame('promo-phone-takeover', 'tap', 'end') - P1_FROM) / P_RATE);
const P_CHAT_FROM = markFrame('promo-phone-takeover', 'chat', 'end');
const P2_FROM = markFrame('promo-phone-takeover', 'files', 'start', -15);
assertClipCovers('promo-phone-takeover', P1_FROM, T_CHAT - T1, P_RATE);
assertClipCovers('promo-phone-takeover', P_CHAT_FROM, T_FILES - T_CHAT);
assertClipCovers('promo-phone-takeover', P2_FROM, END - T_FILES);
if (P_CHAT_FROM + (T_FILES - T_CHAT) > markFrame('promo-phone-takeover', 'files', 'start')) throw new Error('the loaded-chat shot runs into the files panel opening');
const P = perch(0.3), BESIDE = perch(0.78);                       // the right end of the title bar, next to the phone
const ON_PHONE = { x: PHONE.x + 40, y: PHONE.y - 62 };
/** The phone's screen, in frame pixels: (fx, fy) of the displayed phone. */
const onPhone = (fx: number, fy: number) => ({ x: PHONE.x + PHONE.w * PHONE.scale * fx, y: PHONE.y + PHONE.h * PHONE.scale * fy });
const PhoneIn: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 17, stiffness: 110, mass: 1 } });
  const x = interpolate(s, [0, 1], [1980, PHONE.x]);
  return (
    <Phone x={x}>
      <Sequence durationInFrames={T_CHAT - T1}><OffthreadVideo src={staticFile('footage/promo-phone-takeover.webm')} trimBefore={P1_FROM} playbackRate={P_RATE} muted style={{ width: PHONE.w, height: PHONE.h }} /></Sequence>
      <Sequence from={T_CHAT - T1} durationInFrames={T_FILES - T_CHAT}><OffthreadVideo src={staticFile('footage/promo-phone-takeover.webm')} trimBefore={P_CHAT_FROM} muted style={{ width: PHONE.w, height: PHONE.h }} /></Sequence>
      <Sequence from={T_FILES - T1}><OffthreadVideo src={staticFile('footage/promo-phone-takeover.webm')} trimBefore={P2_FROM} muted style={{ width: PHONE.w, height: PHONE.h }} /></Sequence>
    </Phone>
  );
};
const Beat8: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={T_LAP2}><Footage file="promo-anydevice" from={0} /></Sequence>
    <Sequence from={T_LAP2}><Footage file="promo-anydevice" from={0} /></Sequence>
    <Sequence from={T1}><PhoneIn /></Sequence>
    <Label text={CAPTIONS.b8.head} at={B('b8', 0) + 4} slug="devils-garden" />
    <Sfx at={T1 + 6} name="whoosh" volume={0.3} />
  </AbsoluteFill>
);
// The phone slides in on bar 1; the host walks to the bar's end to meet it and points at it
// while the session is tapped and the chat appears, then hops onto the phone's top edge
// (smaller, so it fits) and points down at the chat, then the files.
const ON = 20;
const P8 = present('b8', [
  { at: T1 + ON, say: 'Start a conversation on your computer, and resume on your phone.', spot: BESIDE, target: onPhone(0.5, 0.2), face: 'happy', side: 'L' },
  { at: T1 + ON + 132, say: 'Same conversation, same files, synced automatically.', spot: ON_PHONE, target: onPhone(0.5, 0.45), face: 'happy', side: 'L', until: END - 8 },
], 'devils-garden', P, END - 8);
export const beat8: BeatModule = { id: 'b8', slug: 'devils-garden', home: P8.home, Component: Beat8,
  host: [A.look(T1 - 10, 8, 0.6, 0.2), ...P8.host, A.to(T1 + ON + 132 - 24, 16, 'size', 96)],   // sees it coming; smaller on the phone
  bubbles: P8.bubbles };
