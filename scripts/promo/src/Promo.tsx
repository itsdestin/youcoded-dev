import React from 'react';
import { AbsoluteFill, Audio, staticFile, Sequence } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { barFrame } from './grid';
import { BEATS, CUT, sequenceFrames } from './timeline';
import { COMPONENTS } from './beats';

export const Promo: React.FC = () => {
  const nodes: React.ReactNode[] = [];
  for (const b of BEATS) {
    const C = COMPONENTS[b.id];
    nodes.push(<TransitionSeries.Sequence key={b.id} durationInFrames={sequenceFrames(b, barFrame)}><C /></TransitionSeries.Sequence>);
    if (b.after !== 'none') nodes.push(
      <TransitionSeries.Transition key={`${b.id}-t`} timing={linearTiming({ durationInFrames: CUT })}
        presentation={slide({ direction: b.after === 'slide-up' ? 'from-bottom' : 'from-right' })} />);
  }
  return (
    <AbsoluteFill style={{ background: '#0D1117' }}>
      <Audio src={staticFile('promo.wav')} />
      {/* a whoosh on every cut, on the cut's first frame */}
      {BEATS.filter((b) => b.after !== 'none').map((b) => (
        <Sequence key={b.id} from={barFrame(b.bars[1]) - 2} durationInFrames={10}><Audio src={staticFile('sfx-whoosh.wav')} volume={0.35} /></Sequence>
      ))}
      <TransitionSeries>{nodes}</TransitionSeries>
    </AbsoluteFill>
  );
};
