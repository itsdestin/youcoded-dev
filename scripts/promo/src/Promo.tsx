import React from 'react';
import { AbsoluteFill, Audio, staticFile } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { barFrame, TOTAL_FRAMES } from './grid';
import { BEATS, CUT, TAIL_FRAMES, startFrames, sequenceFrames } from './timeline';
import { MODULES } from './beats';
import { Backdrop } from './Backdrop';
import { Mascot, HOP } from './Mascot';
import { accentWipe } from './transitions';
import { THEMES } from './themes';
import { MASCOT } from './layout';
import { shift, type Cue, type ThemeCue } from './tracks';
import { Sfx } from './beats/sfx';

const STARTS = startFrames(barFrame);
const FILM = TOTAL_FRAMES + TAIL_FRAMES;

/**
 * The film: the backdrop underneath (one continuous theme track), the beats in
 * a TransitionSeries with an accent wipe between them, the host on top (one
 * continuous cue track), and the sounds. Each beat's LOCAL cues and theme
 * changes are shifted by its start frame; the arrival hop between beats is
 * generated here — it takes off 2 frames before the wipe starts and lands 2
 * frames after the downbeat, changing costume at the apex.
 */
export const Promo: React.FC = () => {
  const nodes: React.ReactNode[] = [];
  const themes: ThemeCue[] = [];
  const cues: Cue[] = [];
  const sounds: React.ReactNode[] = [];
  MODULES.forEach((m, i) => {
    const b = BEATS[i];
    if (m.id !== b.id) throw new Error(`beat module order ${m.id} ≠ timeline ${b.id}`);
    const start = STARTS[i];
    themes.push({ at: start, slug: m.slug, wash: i === 0 ? 'circle' : i % 2 === 1 ? 'wipe-left' : 'wipe-right' }, ...shift(m.themes ?? [], start));
    if (m.arrival !== 'none') {
      const at = start - 2;
      cues.push({ at, x: m.home.x, y: m.home.y, size: MASCOT.size, pose: 'idle', costume: m.slug, hop: true, hidden: false });
      sounds.push(<Sfx key={`land-${m.id}`} at={at + HOP} name="pop" volume={0.4} />);
    }
    cues.push(...shift(m.cues, start));
    // in-beat hops land with a pop too
    for (const c of m.cues) if (c.hop && !c.hidden) sounds.push(<Sfx key={`hop-${m.id}-${c.at}`} at={start + c.at + HOP} name="pop" volume={0.35} />);
    nodes.push(<TransitionSeries.Sequence key={b.id} durationInFrames={sequenceFrames(b, barFrame)}><m.Component /></TransitionSeries.Sequence>);
    if (b.after !== 'none') {
      const next = MODULES[i + 1];
      nodes.push(
        <TransitionSeries.Transition key={`${b.id}-t`} timing={linearTiming({ durationInFrames: CUT })}
          presentation={accentWipe({ accent: THEMES[next.slug].accent, from: i % 2 === 0 ? 'left' : 'right' })} />);
      sounds.push(<Sfx key={`whoosh-${b.id}`} at={STARTS[i + 1]} name="whoosh" volume={0.35} />);
    }
  });
  return (
    <AbsoluteFill style={{ background: '#0D1117' }}>
      <Audio src={staticFile('promo.wav')} />
      <Backdrop themes={themes} total={FILM} />
      <TransitionSeries>{nodes}</TransitionSeries>
      <Mascot cues={cues} />
      {sounds}
    </AbsoluteFill>
  );
};
