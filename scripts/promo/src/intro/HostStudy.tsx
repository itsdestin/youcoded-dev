import React from 'react';
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { Host } from '../host/Host';
import { A, REST, type Action } from '../host/engine';
import type { FaceStyle } from '../host/faces';
import { Backdrop } from '../Backdrop';
import { Window } from '../Window';
import { CLIP, perch, windowRect } from '../layout';
import { THEMES, type Slug } from '../themes';
import { Sfx } from '../beats/sfx';

// The second half of the mascot study: what the host does on every other beat
// of the film. Idle on a title bar (breathing, a blink, a glance), a hop to a
// new perch that changes costume at the top, a dive into the window that
// bursts where it lands, a pop back out onto the bar, and a wave. Ten seconds.
const R = windowRect();
const P1 = perch(0.3), P2 = perch(0.62);
const T = { look: 20, hop1: 70, dive: 150, out: 215, wave: 250, end: 300 };
export const studyActions = (): Action[] => [
  A.set(0, { x: P1.x, y: P1.y, size: 120, costume: 'golden-sunbreak', face: 'welcome' }),
  A.blink(14), A.look(T.look, 10, 0.5, 0.2), A.tilt(T.look + 4, 12, 5), A.look(T.look + 30, 10, 0, 0), A.tilt(T.look + 30, 10, 0),
  A.hop(T.hop1, 34, P2.x, P2.y, 110),
  A.costume(T.hop1 + 15, 'strawberry-kitty'), A.face(T.hop1 + 15, 'shocked'), A.face(T.hop1 + 40, 'welcome'), A.blink(T.hop1 + 46),
  A.look(T.dive - 20, 8, 0.2, 0.5),                                   // eyes the window below
  A.hop(T.dive, 26, R.x + R.w * 0.62 - 60, R.y + R.h * 0.5 - 60, 120), // dives in
  A.to(T.dive + 14, 10, 'size', 0), A.set(T.dive + 22, { poof: T.dive + 22 }), A.hide(T.dive + 25),
  A.set(T.out, { x: R.x + R.w * 0.62 - 60, y: R.y + R.h * 0.5 - 60, size: 0, costume: 'kuromi-dreamer' }), A.show(T.out),
  A.hop(T.out, 28, P1.x, P1.y, 160), A.to(T.out, 12, 'size', 120),     // pops back out onto the bar in a new costume
  A.face(T.out, 'welcome'),
  A.wave(T.wave, 40), A.face(T.wave, 'welcome'), A.blink(T.wave + 20),
];
const THEME_TRACK: { at: number; slug: Slug }[] = [{ at: 0, slug: 'golden-sunbreak' }, { at: T.hop1 + 15, slug: 'strawberry-kitty' }, { at: T.out, slug: 'kuromi-dreamer' }];
export const STUDY_FRAMES = T.end;
export const HostStudy: React.FC<{ faceStyle?: FaceStyle }> = ({ faceStyle = 'warm' }) => {
  const f = useCurrentFrame();
  const slug = [...THEME_TRACK].reverse().find((c) => f >= c.at)!.slug;
  const file = slug === 'golden-sunbreak' ? 'promo-idle-golden' : slug === 'strawberry-kitty' ? 'promo-idle-golden' : 'promo-idle-golden';
  return (
    <AbsoluteFill>
      <Backdrop themes={THEME_TRACK} total={STUDY_FRAMES} />
      <Window light={!THEMES[slug].dark}><OffthreadVideo src={staticFile(`footage/${file}.webm`)} muted style={{ width: CLIP.w, height: CLIP.h, opacity: 0.9 }} /></Window>
      <Host actions={studyActions()} base={REST} faceStyle={faceStyle} />
      <Sfx at={T.hop1 + 30} name="pop" volume={0.4} />
      <Sfx at={T.hop1 + 15} name="poof" volume={0.5} />
      <Sfx at={T.dive + 24} name="poof" volume={0.5} />
      <Sfx at={T.out + 24} name="pop" volume={0.4} />
      <Sfx at={T.out} name="poof" volume={0.4} />
      {/* the window's content is a stand-in (the golden idle); the study is about the host */}
      <div style={{ position: 'absolute', left: 24, bottom: 20, fontFamily: 'system-ui', fontSize: 22, color: '#fff', opacity: 0.6, textShadow: '0 1px 6px #000' }}>
        {f < T.hop1 ? 'idle: breathing, a blink, a glance' : f < T.dive ? 'hop to a new perch, costume change at the top' : f < T.out ? 'the dive into the window' : f < T.wave ? 'pops back out in a new costume' : 'the wave'}
      </div>
    </AbsoluteFill>
  );
};
