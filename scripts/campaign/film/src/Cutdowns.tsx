// The 30-second cutdown and the 16-second vertical shorts.
// Times are seconds on hero_30.wav / short_16*.wav (120 BPM, bar = 2 s).
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { EndCard, Ground, Headline, s, useB, words } from './brand';
import { CamKey, CLOSE, Cut, mark, MARKS } from './cuts';
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
      <Cut clip="money" from={mark('money', 'spending', 'end') + 0.15} at={8} dur={2} cam={[[0, 1.1, 0.38, 0.4], [2, 1.2, 0.4, 0.4]]} />
      <Cut clip="paint-page" from={MARKS['paint-page'].duration - 8.5} at={10} dur={2} rate={3} cam={[[0, 1.12, 0.42, 0.5], [2, 1.2, 0.4, 0.5]]} />
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
  clip: string; // phone take: typing, reply, then the result
  result: number; // clip second the result starts (cut lands on the 4.0 s hit)
  rate?: number; // result playback speed
  music: 'short_16' | 'short_16_alt';
};

/**
 * Vertical short, 1080×1920, filmed on the phone layout so the picture fills the frame.
 * 0–4 s the request being typed (camera low on the message box); 4.0 s (music hit) cut to the
 * result; 9.8 s the phone rises and "you coded that." arrives; 12.0 s (logo hit) the end card.
 * Type stays out of the top 12% and bottom 20% (feed chrome).
 */
export const Short: React.FC<ShortSpec> = ({ clip, result, rate = 1, music }) => {
  const b = useB();
  const typed0 = mark(clip, 'typed') - 0.35;
  // Re-time so the message is sent right at the 4.0 s cut: the finished sentence is on screen
  // to the last frame, never an emptied box. Between 0.8x and 1.6x so typing still looks human.
  const typeRate = Math.min(1.6, Math.max(0.8, (mark(clip, 'enter') - typed0) / 3.97));
  const fit = 0.78;
  return (
    <AbsoluteFill>
      <Ground />
      <Cut clip={clip} from={typed0} at={0} dur={4} rate={typeRate} fit={fit}
        cam={[[0, 1.55, 0.5, 0.81], [4, 1.45, 0.5, 0.8]]} />
      <Cut clip={clip} from={result} at={4} dur={8} rate={rate} fit={fit}
        cam={[[0, 1.0, 0.5, 0.5], [5.6, 1.06, 0.5, 0.5], [6.2, 0.7, 0.5, 0.683], [8, 0.69, 0.5, 0.683]]} />
      <Sequence from={s(10.0)} durationInFrames={s(2.0)} layout="none">
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '21.5%' }}>
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

const has = (clip: string) => !!MARKS[clip];
export const SHORTS: Record<string, ShortSpec> = {
  house: { clip: 'phone-house', result: has('phone-house') ? mark('phone-house', 'favorites') + 0.1 : 0, music: 'short_16' },
  money: { clip: 'phone-money', result: has('phone-money') ? mark('phone-money', 'spending') - 1.0 : 0, music: 'short_16_alt' },
  look: { clip: 'phone-look', result: has('phone-look') ? mark('phone-look', 'swap') - 0.05 : 0, music: 'short_16' },
  ...(has('phone-paint') ? { paint: { clip: 'phone-paint', result: mark('phone-paint', 'studio') + 0.5, rate: 2.2, music: 'short_16_alt' as const } } : {}),
  ...(has('phone-trip') ? { trip: { clip: 'phone-trip', result: mark('phone-trip', 'page') - 0.2, music: 'short_16' as const } } : {}),
};
