import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { Footage } from '../Footage';
import { Backdrop } from '../Backdrop';
import { Host } from '../host/Host';
import { Bubbles, type BubbleCue } from '../Bubble';
import { Label } from '../Label';
import { A, REST, type Action } from '../host/engine';
import { accentWipe, bandHitFrame, BandOverlay, type WipeFrom } from '../transitions';
import { CUT, PRE } from '../timeline';
import { THEMES, type Slug } from '../themes';
import { perch } from '../layout';
import { markFrame, assertClipCovers } from '../marks';
import type { ThemeCue } from '../tracks';
import { Sfx } from '../beats/sfx';
import { CAPTIONS } from '../captions';

// Check-in 3b (2026-09-04): the new captions and three candidate theme
// transitions, one after another on real cuts. Four segments on a stand-in
// window; every cut is the film's own accent wipe. Segment 0 shows the caption
// design (a section label under the window, the second line in a speech
// bubble from the host); each later cut is one candidate:
//   A · quick-change behind the wipe   B · poof-teleport   C · twirl
const SEG = 84;
const P = perch(0.3);
const HOST_CX = P.x + 60, HOST_CY = P.y + 60;
// `rate` 0.25 on the theme-recording segments: they are STATIC screens, and at 1× the 84-frame segment
// runs into the recording's NEXT repaint (the window went Strawberry half a second before the wipe)
type Seg = { slug: Slug; file: string; from: number; rate: number; label: string; say: string; from_: WipeFrom };
const SEGS: Seg[] = [
  { slug: 'golden-sunbreak', file: 'promo-theme', from: markFrame('promo-theme', 'paint1', 'end', 20), rate: 0.25, label: CAPTIONS.b3.head, say: CAPTIONS.b3.yours, from_: 'left' },
  { slug: 'strawberry-kitty', file: 'promo-theme', from: markFrame('promo-theme', 'paint2', 'end', 20), rate: 0.25, label: CAPTIONS.b3.head, say: CAPTIONS.b3.sub, from_: 'left' },
  { slug: 'kuromi-dreamer', file: 'promo-theme', from: markFrame('promo-theme', 'paint3', 'end', 20), rate: 0.25, label: CAPTIONS.b4.head, say: CAPTIONS.b4.sub, from_: 'right' },
  { slug: 'cotton-candy-sky', file: 'promo-idle-cotton', from: 30, rate: 1, label: CAPTIONS.b5.head, say: CAPTIONS.b5.sub, from_: 'left' },
];
SEGS.forEach((s) => assertClipCovers(s.file, s.from, SEG + 30, s.rate));
const START = SEGS.map((_, k) => k * (SEG - CUT));
const DOWN = START.map((s, k) => (k === 0 ? 0 : s + PRE));
export const TRANSITION_STUDY_FRAMES = START[3] + SEG + 30;
const TAGS = ['the captions: a label under the window, the rest said by the host', 'A · quick-change behind the wipe', 'B · poof-teleport', 'C · twirl'];

const hit1 = START[1] + bandHitFrame(CUT, SEGS[1].from_, HOST_CX, HOST_CY);
const actions: Action[] = [
  A.set(0, { x: P.x, y: P.y, size: 120, costume: 'golden-sunbreak', face: 'welcome' }),
  A.blink(14), A.look(30, 10, 0.5, 0.3), A.look(56, 10, 0, 0), A.blink(62),
  A.look(hit1 - 22, 8, -0.6, 0.1), A.face(hit1 - 22, 'shocked'),                      // sees the wipe coming
  ...A.quickChange(hit1, SEGS[1].slug, P.x, P.y),
  A.look(hit1 + 30, 8, 0.4, 0.3), A.look(hit1 + 56, 8, 0, 0),
  ...A.vanish(DOWN[2] - 8), ...A.appear(DOWN[2], P.x, P.y, SEGS[2].slug),
  A.look(DOWN[2] + 34, 8, 0.4, 0.3), A.look(DOWN[2] + 58, 8, 0, 0),
  ...A.twirl(DOWN[3] - 14, 24, P.x, P.y, SEGS[3].slug),
  A.look(DOWN[3] + 40, 8, 0.4, 0.3), A.blink(DOWN[3] + 70),
];
const cues: BubbleCue[] = SEGS.map((s, k) => ({ at: (k === 0 ? 26 : DOWN[k] + 24), until: k < 3 ? DOWN[k + 1] - 16 : undefined, text: s.say, slug: s.slug }));
const themes: ThemeCue[] = SEGS.map((s, k) => ({ at: START[k], slug: s.slug, wash: k === 0 ? undefined : s.from_ === 'left' ? 'wipe-left' : 'wipe-right' }));

const Tag: React.FC = () => {
  const f = useCurrentFrame();
  const k = START.findLastIndex((s) => f >= s + PRE - 20);
  return <div style={{ position: 'absolute', right: 28, bottom: 18, fontFamily: 'system-ui', fontSize: 22, color: '#fff', opacity: 0.7, textShadow: '0 1px 6px #000, 0 0 12px #000' }}>{TAGS[Math.max(0, k)]}</div>;
};

export const TransitionStudy: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Backdrop themes={themes} total={TRANSITION_STUDY_FRAMES} />
    <TransitionSeries>
      {SEGS.map((s, k) => (
        <React.Fragment key={s.slug}>
          <TransitionSeries.Sequence durationInFrames={k === 3 ? SEG + 30 : SEG}>
            <AbsoluteFill>
              <Footage file={s.file} from={s.from} rate={s.rate} light={!THEMES[s.slug].dark} />
              <Label text={s.label} at={k === 0 ? 8 : PRE + 2} slug={s.slug} />
            </AbsoluteFill>
          </TransitionSeries.Sequence>
          {k < 3 && <TransitionSeries.Transition timing={linearTiming({ durationInFrames: CUT })} presentation={accentWipe({ accent: THEMES[SEGS[k + 1].slug].accent, from: SEGS[k + 1].from_ })} />}
        </React.Fragment>
      ))}
    </TransitionSeries>
    <Host actions={actions} base={REST} />
    {SEGS.slice(1).map((s, k) => <BandOverlay key={s.slug} at={START[k + 1]} cut={CUT} accent={THEMES[s.slug].accent} from={s.from_} />)}
    <Bubbles cues={cues} actions={actions} base={REST} />
    {START.slice(1).map((s) => <Sfx key={s} at={s} name="whoosh" volume={0.35} />)}
    <Sfx at={hit1} name="poof" volume={0.4} /><Sfx at={hit1 + 8} name="pop" volume={0.35} />
    <Sfx at={DOWN[2] - 8} name="poof" volume={0.4} /><Sfx at={DOWN[2]} name="poof" volume={0.4} /><Sfx at={DOWN[2] + 12} name="pop" volume={0.35} />
    <Sfx at={DOWN[3] - 2} name="poof" volume={0.4} /><Sfx at={DOWN[3] + 8} name="pop" volume={0.35} />
    <Sequence from={0}><Tag /></Sequence>
  </AbsoluteFill>
);
