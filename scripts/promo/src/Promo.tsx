import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { barFrame, TOTAL_FRAMES } from './grid';
import { BEATS, CUT, PRE, PRELUDE, TAIL_FRAMES, startFrames, sequenceFrames, preFrames } from './timeline';
import { MODULES } from './beats';
import { Backdrop } from './Backdrop';
import { Host } from './host/Host';
import { A, REST, type Action } from './host/engine';
import { accentWipe, hardCut } from './transitions';
import { THEMES } from './themes';
import type { ThemeCue } from './tracks';
import { Sfx } from './beats/sfx';

const STARTS = startFrames(barFrame);
export const FILM = PRELUDE + TOTAL_FRAMES + TAIL_FRAMES;
const shift = (actions: Action[], by: number): Action[] => actions.map((a) => ({ ...a, at: a.at + by }));
const HOP = 30;                       // frames an arrival hop takes; it lands at 78 % of that (engine.ts)
const LAND = Math.round(HOP * 0.78);

const FadeOut: React.FC = () => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ background: '#000', opacity: interpolate(f, [FILM - 30, FILM - 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }} />;
};

/**
 * The film: the backdrop underneath (one continuous theme track, black through
 * the prelude), the beats in a TransitionSeries with an accent wipe between
 * them, the host on top (one continuous action list), the music from the
 * punch, and the sounds. Each beat's LOCAL actions and theme changes are
 * shifted by its start frame; the arrival hop between beats is generated here:
 * it takes off so that it LANDS on the beat's first downbeat, and changes
 * costume at the top of the arc.
 */
export const Promo: React.FC = () => {
  const nodes: React.ReactNode[] = [];
  const themes: ThemeCue[] = [];
  const host: Action[] = [];
  const sounds: React.ReactNode[] = [];
  MODULES.forEach((m, i) => {
    const b = BEATS[i];
    if (m.id !== b.id) throw new Error(`beat module order ${m.id} ≠ timeline ${b.id}`);
    const start = STARTS[i];
    const downbeat = start + preFrames(b);
    if (i > 0) themes.push({ at: start, slug: m.slug, wash: i % 2 === 1 ? 'wipe-left' : 'wipe-right' });
    themes.push(...(m.themes ?? []).map((c) => ({ ...c, at: c.at + start })));
    if (m.arrival !== 'none') {
      const at = downbeat - LAND;
      host.push(A.hop(at, HOP, m.home.x, m.home.y, 70), A.to(at, 8, 'size', 120), A.costume(at + 14, m.slug), A.face(at + 14, 'shocked'), A.face(at + LAND + 6, 'welcome'), A.show(at));
      sounds.push(<Sfx key={`land-${m.id}`} at={downbeat} name="pop" volume={0.4} />, <Sfx key={`poof-${m.id}`} at={at + 14} name="poof" volume={0.35} />);
    }
    host.push(...shift(m.host, start));
    nodes.push(<TransitionSeries.Sequence key={b.id} durationInFrames={sequenceFrames(b, barFrame)}><m.Component /></TransitionSeries.Sequence>);
    if (b.after !== 'none') {
      const next = MODULES[i + 1];
      nodes.push(
        <TransitionSeries.Transition key={`${b.id}-t`} timing={linearTiming({ durationInFrames: CUT })}
          presentation={(b.after === 'cut' ? hardCut : accentWipe)({ accent: THEMES[next.slug].accent, from: i % 2 === 0 ? 'left' : 'right' })} />);
      if (b.after === 'wipe') sounds.push(<Sfx key={`whoosh-${b.id}`} at={STARTS[i + 1]} name="whoosh" volume={0.35} />);
    }
  });
  void PRE;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Sequence from={PRELUDE}><Audio src={staticFile('promo.wav')} /></Sequence>
      <Backdrop themes={themes} total={FILM} from={PRELUDE} />
      <TransitionSeries>{nodes}</TransitionSeries>
      <Host actions={host} base={{ ...REST, hidden: true, costume: 'midnight' }} />
      {sounds}
      <FadeOut />
    </AbsoluteFill>
  );
};
