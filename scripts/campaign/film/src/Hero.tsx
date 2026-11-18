// The 60-second hero film. Every time below is in seconds on the 120 BPM grid of
// music/hero_60.wav (one bar = 2.0 s); see docs/active/specs/2026-11-18-campaign-you-coded-that.md.
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Ground, Headline, s, useB, words } from './brand';
import { CLOSE, Cut, mark, Vignette } from './cuts';
import { Finale } from './finale';

/** "you coded that." under the shrunken window (the window's own Cut does the shrink). */
const FirstPayoff: React.FC<{ at: number; until: number }> = ({ at, until }) => {
  const b = useB();
  return (
    <Sequence from={s(at)} durationInFrames={s(until - at)} layout="none">
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '13%' }}>
        <Headline words={words('you coded that.', ['you'])} start={0} size={7 * b} />
      </AbsoluteFill>
    </Sequence>
  );
};

/** The opening: a request typed in close-up, the reply, the page, then the first payoff. */
export const Opening: React.FC<{ pageAt: number; payoffAt: number; cutAt: number }> = ({ pageAt, payoffAt, cutAt }) => {
  const clip = 'house-ask';
  // Two pieces of one take: the request and reply, then a cut straight to the finished page
  // (skipping the page's half-second "Loading your rooms…" so the reveal lands clean on the
  // music's downbeat). The first frame is held so the timings meet the grid.
  const openAt = mark(clip, 'open');
  const pageFrom = mark(clip, 'favorites') + 0.1;
  const replyLen = openAt - 0.05; // clip seconds shown before the cut
  const hold = Math.max(0, pageAt - replyLen);
  const typedEnd = mark(clip, 'typed', 'end') + hold;
  const enter = mark(clip, 'enter') + hold;
  return (
    <>
      <Cut
        clip={clip}
        from={0}
        at={0}
        dur={pageAt}
        hold={hold}
        cam={[
          [0, CLOSE.scale + 0.2, CLOSE.x - 0.02, CLOSE.y],
          [typedEnd, CLOSE.scale + 0.05, CLOSE.x + 0.06, CLOSE.y],
          [enter + 0.3, CLOSE.scale + 0.05, CLOSE.x + 0.06, CLOSE.y],
          [pageAt - 0.3, 1.0, 0.5, 0.5],
          [pageAt, 1.0, 0.5, 0.5],
        ]}
      />
      <Cut
        clip={clip}
        from={pageFrom}
        at={pageAt}
        dur={cutAt - pageAt}
        cam={[
          [0, 1.0, 0.5, 0.5],
          [payoffAt - pageAt - 0.5, 1.1, 0.42, 0.42],
          [payoffAt - pageAt + 0.35, 0.62, 0.5, 0.82],
          [cutAt - pageAt, 0.6, 0.5, 0.82],
        ]}
      />
      <FirstPayoff at={payoffAt - 0.1} until={cutAt} />
    </>
  );
};

/** The run of things people asked for, two bars each. */
export const Montage: React.FC<{ at: number; beat?: number }> = ({ at }) => (
  <>
    <Vignette
      at={at}
      dur={4}
      ask={{ clip: 'money', dur: 1.6 }}
      result={{ clip: 'money', from: mark('money', 'spending') - 0.25, cam: [[0, 1.1, 0.38, 0.4], [2.4, 1.24, 0.4, 0.4]] }}
    />
    <Vignette
      at={at + 4}
      dur={4}
      ask={{ clip: 'paint-ask', dur: 1.6 }}
      result={{ clip: 'paint-page', from: 19, rate: 3, cam: [[0, 1.12, 0.42, 0.5], [2.4, 1.2, 0.4, 0.5]] }}
    />
    <Vignette
      at={at + 8}
      dur={4}
      ask={{ clip: 'trip', dur: 1.6 }}
      result={{ clip: 'trip', from: mark('trip', 'scroll') - 0.2, rate: 1.6, cam: [[0, 1.12, 0.5, 0.42], [2.4, 1.2, 0.5, 0.46]] }}
    />
  </>
);

/** "make it feel like golden hour" → the look changes on each of four beats → it lands. */
export const Looks: React.FC<{ askAt: number; flipAt: number; until: number; order?: string[] }> = ({
  askAt,
  flipAt,
  until,
  order = ['golden-sunbreak', 'cotton-candy-sky', 'devils-garden', 'meadow-mist'],
}) => {
  const askClip = 'look-youcoded';
  const typed0 = mark(askClip, 'typed') - 0.2;
  const typed1 = mark(askClip, 'typed', 'end') + 0.15;
  const askDur = flipAt - askAt;
  return (
    <>
      {askDur > 0.1 && <Cut
        clip={askClip}
        from={typed0}
        at={askAt}
        dur={askDur}
        rate={(typed1 - typed0) / (askDur * 0.7)}
        cam={[[0, CLOSE.scale + 0.1, CLOSE.x, CLOSE.y], [askDur, CLOSE.scale, CLOSE.x + 0.05, CLOSE.y]]}
      />}
      {order.map((t, i) => (
        <Cut key={t} clip={`look-${t}`} from={mark(`look-${t}`, 'held') + 0.2} at={flipAt + i * 0.5} dur={0.5} cam={[[0, 1.0, 0.5, 0.5]]} />
      ))}
      <Cut
        clip={`look-${order[0]}`}
        from={mark(`look-${order[0]}`, 'held') - 0.6}
        at={flipAt + order.length * 0.5}
        dur={until - (flipAt + order.length * 0.5)}
        cam={[[0, 1.0, 0.5, 0.5], [until - (flipAt + order.length * 0.5), 1.12, 0.55, 0.42]]}
      />
    </>
  );
};

export const Hero60: React.FC = () => (
  <AbsoluteFill>
    <Ground />
    <Opening pageAt={8} payoffAt={12} cutAt={14} />
    <Montage at={14} />
    {/* 26–30: the Home page again, lights going off — replaced by the phone take when it lands. */}
    <Cut clip="house-page" from={mark('house-page', 'lights') - 1.2} at={26} dur={4} cam={[[0, 1.15, 0.45, 0.6], [4, 1.25, 0.45, 0.62]]} />
    <Looks askAt={30} flipAt={32} until={38} />
    <Sequence from={s(38)} layout="none">
      <Finale enter={0} l1={s(0.5)} l2={s(4)} hit={s(8)} addr={s(14)} />
    </Sequence>
    <Audio src={staticFile('music/hero_60.wav')} />
  </AbsoluteFill>
);
