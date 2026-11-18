// The 30-second cutdown and the 16-second vertical shorts.
// Times are seconds on hero_30.wav / short_16*.wav (120 BPM, bar = 2 s).
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { EndCard, Ground, Headline, s, useB, words } from './brand';
import { CamKey, CLOSE, Cut, mark } from './cuts';
import { Finale } from './finale';
import { Looks } from './Hero';

export const Hero30: React.FC = () => {
  const clip = 'house-ask';
  const replyLen = mark(clip, 'open') - 0.05;
  const hold = Math.max(0, 6 - replyLen);
  return (
    <AbsoluteFill>
      <Ground />
      <Cut
        clip={clip}
        from={0}
        at={0}
        dur={6}
        hold={hold}
        cam={[
          [0, CLOSE.scale + 0.2, CLOSE.x - 0.02, CLOSE.y],
          [mark(clip, 'typed', 'end') + hold, CLOSE.scale + 0.05, CLOSE.x + 0.06, CLOSE.y],
          [mark(clip, 'enter') + hold + 0.3, CLOSE.scale + 0.05, CLOSE.x + 0.06, CLOSE.y],
          [5.7, 1, 0.5, 0.5],
        ]}
      />
      <Cut clip={clip} from={mark(clip, 'favorites') + 0.1} at={6} dur={2} cam={[[0, 1, 0.5, 0.5], [2, 1.1, 0.42, 0.42]]} />
      <Cut clip="money" from={mark('money', 'spending') - 0.25} at={8} dur={2} cam={[[0, 1.1, 0.38, 0.4], [2, 1.2, 0.4, 0.4]]} />
      <Cut clip="paint-page" from={19} at={10} dur={2} rate={3} cam={[[0, 1.12, 0.42, 0.5], [2, 1.2, 0.4, 0.5]]} />
      <Cut clip="trip" from={mark('trip', 'scroll') - 0.2} at={12} dur={2} rate={1.6} cam={[[0, 1.12, 0.5, 0.42], [2, 1.2, 0.5, 0.46]]} />
      {/* No typed ask for the looks here: the four flips land on bar 8's stabs, then one bar of golden hour. */}
      <Looks askAt={14} flipAt={14} until={17.3} />
      <Sequence from={s(17)} layout="none">
        <Finale enter={0} l1={s(0.1)} l2={s(3)} hit={s(5)} addr={s(8.5)} />
      </Sequence>
      <Audio src={staticFile('music/hero_30.wav')} />
    </AbsoluteFill>
  );
};

export type ShortSpec = {
  ask: string; // clip with the typing
  result?: { clip: string; from: number; rate?: number; cam?: CamKey[] };
  look?: boolean; // theme short: flips instead of a result clip
  music: 'short_16' | 'short_16_alt';
};

/**
 * Vertical short, 1080×1920. 0–4 s the request in close-up; 4.0 s (music hit) the result;
 * 9.5 s the window rises and "you coded that." arrives; 12.0 s (logo hit) the end card.
 * Everything stays clear of the top 12% and bottom 20% (feed chrome).
 */
export const Short: React.FC<ShortSpec> = ({ ask, result, look, music }) => {
  const b = useB();
  const typed0 = mark(ask, 'typed') - 0.4;
  const typed1 = mark(ask, 'typed', 'end');
  // Re-time the typing so it fills the 4-second intro, never faster than recorded.
  const rate = Math.min(1, (typed1 - typed0) / 3.3);
  const fit = 0.94;
  return (
    <AbsoluteFill>
      <Ground />
      <Cut
        clip={ask}
        from={typed0}
        at={0}
        dur={4}
        rate={rate}
        fit={fit}
        cam={[[0, 2.0, 0.24, 0.9], [4, 1.85, 0.3, 0.9]]}
      />
      {look ? (
        <>
          {['golden-sunbreak', 'cotton-candy-sky', 'devils-garden', 'meadow-mist'].map((t, i) => (
            <Cut key={t} clip={`look-${t}`} from={mark(`look-${t}`, 'held') + 0.2} at={4 + i * 0.5} dur={0.5} fit={fit} cam={[[0, 1.9, 0.5, 0.5]]} />
          ))}
          <Cut clip="look-golden-sunbreak" from={mark('look-golden-sunbreak', 'held') - 0.6} at={6} dur={6} fit={fit}
            cam={[[0, 1.9, 0.5, 0.5], [3.5, 2.0, 0.55, 0.45], [4.0, 0.92, 0.5, 0.72], [6, 0.9, 0.5, 0.72]]} />
        </>
      ) : (
        result && (
          <Cut
            clip={result.clip}
            from={result.from}
            at={4}
            dur={8}
            rate={result.rate}
            fit={fit}
            cam={result.cam ?? [[0, 1.7, 0.35, 0.4], [5.5, 1.9, 0.45, 0.45], [6.0, 0.92, 0.5, 0.72], [8, 0.9, 0.5, 0.72]]}
          />
        )
      )}
      {/* The payoff sits below the risen window, above the feed's caption zone. */}
      <Sequence from={s(9.9)} durationInFrames={s(2.1)} layout="none">
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '27%' }}>
          <Headline words={words('you coded that.', ['you'])} start={0} size={6.4 * b} />
        </AbsoluteFill>
      </Sequence>
      <Sequence from={s(12)} layout="none">
        <AbsoluteFill>
          <Ground />
          <EndCard start={0} addressAt={s(0.9)} withTagline={false} scale={1.15} />
        </AbsoluteFill>
      </Sequence>
      <Audio src={staticFile(`music/${music}.wav`)} />
    </AbsoluteFill>
  );
};

export const SHORTS: Record<string, ShortSpec> = {
  house: { ask: 'house-ask', result: { clip: 'house-ask', from: mark('house-ask', 'favorites') + 0.1, rate: 1.2 }, music: 'short_16' },
  money: { ask: 'money', result: { clip: 'money', from: mark('money', 'spending') - 0.6 }, music: 'short_16_alt' },
  paint: { ask: 'paint-ask', result: { clip: 'paint-page', from: 8, rate: 2.6 }, music: 'short_16' },
  trip: { ask: 'trip', result: { clip: 'trip', from: mark('trip', 'page'), rate: 1.2 }, music: 'short_16_alt' },
  look: { ask: 'look-youcoded', look: true, music: 'short_16' },
};
