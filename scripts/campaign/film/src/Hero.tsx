// The 60-second hero film. Every time below is in seconds on the 120 BPM grid of
// music/hero_60.wav (one bar = 2.0 s); see docs/active/specs/2026-11-18-campaign-you-coded-that.md.
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Ground, Headline, s, useB, words } from './brand';
import { CLOSE, Cut, mark, MARKS, Vignette } from './cuts';

const MARKS_END = (clip: string) => MARKS[clip].duration;
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
  const typedStart = mark(clip, 'typed') + hold;
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
        // WHY start wide: the first second tells a cold viewer "this is an app"; then the
        // camera moves in so the words being typed can be read.
        cam={[
          [0, 1.0, 0.5, 0.5],
          [Math.max(0.6, typedStart - 1.1), 1.0, 0.5, 0.5],
          [typedStart + 0.1, CLOSE.scale + 0.15, CLOSE.x - 0.02, CLOSE.y],
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
      ask={{ clip: 'money', dur: 1.9 }}
      result={{ clip: 'money', from: mark('money', 'spending', 'end') + 0.15, cam: [[0, 1.4, 0.33, 0.42], [2.1, 1.55, 0.33, 0.42]] }}
    />
    <Vignette
      at={at + 4}
      dur={4}
      ask={{ clip: 'paint-ask', dur: 1.9 }}
      result={{ clip: 'paint-page', from: MARKS_END('paint-page') - 8.5, rate: 3, cam: [[0, 1.3, 0.44, 0.53], [2.1, 1.42, 0.44, 0.53]] }}
    />
    <Vignette
      at={at + 8}
      dur={4}
      ask={{ clip: 'trip', dur: 1.9 }}
      result={{ clip: 'trip', from: mark('trip', 'page') - 0.1, rate: 1.0, cam: [[0, 1.45, 0.34, 0.32], [2.1, 1.6, 0.34, 0.36]] }}
    />
  </>
);

/** "make it feel like golden hour" → the look changes on each of four beats → it lands. */
export const Looks: React.FC<{ askAt: number; flipAt: number; until: number; order?: string[]; land?: string }> = ({
  askAt,
  flipAt,
  until,
  order = ['cotton-candy-sky', 'meadow-mist', 'golden-sunbreak', 'halftone-dimension'],
  land = 'devils-garden',
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
        // WHY land on the desert: of all the looks it is the one that actually reads as
        // "golden hour" — the request has to match what the viewer sees.
        clip={`look-${land}`}
        from={mark(`look-${land}`, 'held') - 0.6}
        at={flipAt + order.length * 0.5}
        dur={until - (flipAt + order.length * 0.5)}
        cam={[[0, 1.0, 0.5, 0.5], [until - (flipAt + order.length * 0.5), 1.12, 0.55, 0.42]]}
      />
    </>
  );
};

/** Eight cuts on the beat: everything that was made, once more, quickly — the lift before the quiet. */
export const Recap: React.FC<{ at: number }> = ({ at }) => {
  const shots: [string, number, number, number, number][] = [
    // clip, clip second, scale, x, y
    ['house-ask', mark('house-ask', 'lamp') + 0.6, 1.5, 0.4, 0.38],
    ['money', mark('money', '1y', 'end') + 0.4, 1.6, 0.33, 0.42],
    ['look-cotton-candy-sky', mark('look-cotton-candy-sky', 'held') + 0.5, 1.25, 0.5, 0.5],
    ['paint-page', MARKS_END('paint-page') - 1.2, 1.4, 0.44, 0.53],
    ['trip', mark('trip', 'book', 'end') + 0.3, 1.5, 0.34, 0.36],
    ['look-meadow-mist', mark('look-meadow-mist', 'held') + 0.5, 1.25, 0.5, 0.5],
    ['house-ask', mark('house-ask', 'lights', 'end') + 0.3, 1.45, 0.5, 0.62],
    ['look-devils-garden', mark('look-devils-garden', 'held') + 1.2, 1.2, 0.5, 0.5],
  ];
  return (
    <>
      {shots.map(([clip, from, sc, x, y], i) => (
        <Cut key={i} clip={clip} from={from} at={at + i * 0.5} dur={0.5} cam={[[0, sc, x, y], [0.5, sc * 1.03, x, y]]} />
      ))}
    </>
  );
};

export const Hero60: React.FC = () => (
  <AbsoluteFill>
    <Ground />
    <Opening pageAt={8} payoffAt={12} cutAt={14} />
    <Montage at={14} />
    {/* 26–30: the phone. Until the phone take exists, the Home page stands in. */}
    {MARKS['phone-house'] ? (
      // The same Home page, on the phone: the lamp goes off a beat in.
      <Cut clip="phone-house" from={mark('phone-house', 'lamp') - 1.4} at={26} dur={4} fit={0.84} cam={[[0, 1.0, 0.5, 0.5], [4, 1.08, 0.5, 0.42]]} />
    ) : (
      <Cut clip="house-page" from={mark('house-page', 'lights') - 1.2} at={26} dur={4} cam={[[0, 1.3, 0.45, 0.62], [4, 1.4, 0.45, 0.62]]} />
    )}
    <Looks askAt={30} flipAt={32} until={38} />
    <Recap at={38} />
    <Sequence from={s(42)} layout="none">
      <Finale enter={0} l1={s(0.4)} l2={s(4)} hit={s(8)} addr={s(11.5)} />
    </Sequence>
    <Audio src={staticFile('music/hero_60.wav')} />
  </AbsoluteFill>
);
