import React from 'react';
import { AbsoluteFill, Sequence, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { Footage } from '../Footage';
import { Phone } from '../Phone';
import { Label } from '../Label';
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
const P = perch(0.3), BESIDE = perch(0.78);                       // the right end of the title bar, next to the phone
const ON_PHONE = { x: PHONE.x + 40, y: PHONE.y - 62 };
/** Local frame of a phone mark (the phone clip starts at T1 and runs at P_RATE until T_FILES). */
const PM = (mark: string, edge: 'start' | 'end' = 'start') => T1 + Math.round((markFrame('promo-phone-takeover', mark, edge) - P1_FROM) / P_RATE);
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
    <Label text={CAPTIONS.b8.head} at={L('b8', 28) + 4} slug="devils-garden" />
    <Sfx at={T1 + 6} name="whoosh" volume={0.3} />
  </AbsoluteFill>
);
export const beat8: BeatModule = { id: 'b8', slug: 'devils-garden', home: P, Component: Beat8,
  // The host PRESENTS the phone: sees it coming, walks to the right end of the
  // bar to meet it, points at the session list and at the take-over question,
  // nods at Take over, ta-das at the loaded chat, then hops onto the phone to
  // cheer the files.
  host: [
    A.look(T1 - 10, 8, 0.6, 0.2), A.face(T1 - 10, 'curious'),                      // sees the phone coming
    A.walk(T1 + 2, 30, BESIDE.x, 5),
    A.point(PM('list') + 4, 'R', 0.6), A.look(PM('list') + 4, 6, 0.6, 0.4),        // "here's your chat, on the phone"
    A.startle(PM('dialog') + 2), A.look(PM('dialog') + 2, 4, 0.6, 0.5),                  // "whoa — it's asking to take over"
    A.point(PM('dialog') + 20, 'R', 0.7), A.face(PM('dialog') + 20, 'curious'),
    A.nod(PM('takeover', 'end')), A.face(PM('takeover', 'end'), 'welcome'),               // "yes, take over"
    A.tada(PM('chat', 'end') + 4, 'R'), A.rest(PM('chat', 'end') + 40),
    A.look(T_FILES - 24, 8, 0.5, 0.5), A.hop(T_FILES - 16, 26, ON_PHONE.x, ON_PHONE.y, 90), A.to(T_FILES - 16, 26, 'size', 96),   // onto the phone for the files
    A.cheer(T_FILES + 12, 30), A.face(T_FILES + 12, 'welcome'), A.blink(T_FILES + 50),
  ],
  bubbles: [{ at: T1 + 36, until: PM('dialog') - 6, text: CAPTIONS.b8.sub, slug: 'devils-garden', side: 'L' }] };   // once it has reached the phone
