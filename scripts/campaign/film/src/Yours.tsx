// "Yours." — the round-2 60-second film (docs/active/specs/2026-11-18-campaign-v2-treatments.md, direction A).
// Picture only: the music and voice are mixed afterwards by ../mix_yours.py, so one render
// serves every voice we try. Every time comes from yours.json (shared with the music) or sits on
// the 120 BPM grid of music/yours_60.wav (bar = 2 s).
import React from 'react';
import { AbsoluteFill, interpolate, random, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, clamp, DMSANS, EndCard, EXPO_OUT, Ground, Headline, s, useB, words } from './brand';
import { CLOSE, Cut, mark, MARKS } from './cuts';
import { Laptop, Phone, PoseKey, Screen } from './devices';
import Y from './yours.json';

const END = (clip: string) => MARKS[clip].duration;

// ------------------------------------------------------------------ 0–10 s: the wall
/**
 * The things technology asks of you, faster and faster until they bury the screen.
 * WHY plain words and no logos or app screens: it's every company at once, so it names nobody
 * (brand voice: never insulting to people who use Apple, Google or Microsoft).
 */
const Wall: React.FC = () => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const b = useB();
  const t = f / fps;
  const W = Y.wall;
  const MAJOR = 7; // the first seven are read one at a time, big; the rest pile up around them
  const cols = 4;
  const rows = 11;
  // Fixed, shuffled resting cells so the pile looks scattered but never overlaps the centre line.
  const cells = Array.from({ length: cols * rows }, (_, i) => i)
    .filter((i) => Math.abs(Math.floor(i / cols) - 5) > 1) // keep the centre line clear
    .sort((a, c) => random(`cell-${a}`) - random(`cell-${c}`));
  const push = interpolate(t, [1, Y.wall_end], [1, 1.12], clamp); // a slow push-in: the room closes in
  return (
    <AbsoluteFill style={{ background: C.plumBlack, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        {W.map((w, i) => {
          if (t < w.t) return null;
          const next = W[i + 1]?.t ?? Y.wall_end;
          const age = t - w.t;
          const isMajor = i < MAJOR;
          const current = isMajor && t < (i === MAJOR - 1 ? 6.75 : next);
          const cell = cells[i % cells.length];
          const cx = 0.17 + 0.66 * ((cell % cols) + (random(`jx-${i}`) - 0.5) * 0.25) / (cols - 1);
          const cy = 0.11 + 0.78 * (Math.floor(cell / cols) + (random(`jy-${i}`) - 0.5) * 0.3) / (rows - 1);
          if (current) {
            // Arrives instantly (a notification doesn't ease in), with a 2-frame settle.
            const p = interpolate(age, [0, 0.07], [0, 1], clamp);
            return (
              <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: height / 2 - 3 * b, textAlign: 'center' }}>
                <span style={{ fontFamily: DMSANS, fontWeight: 900, fontSize: 5.2 * b, letterSpacing: '-0.04em', color: C.textDark, opacity: p, display: 'inline-block', transform: `translateY(${(1 - p) * 0.3 * b}px)` }}>
                  {w.text}
                </span>
              </div>
            );
          }
          // Resting: smaller, dimmer, off to the side. Majors glide there; the rest pop in place.
          const leftAt = isMajor ? (i === MAJOR - 1 ? 6.75 : next) : w.t;
          const g = isMajor ? interpolate(t, [leftAt, leftAt + 0.35], [0, 1], { ...clamp, easing: EXPO_OUT }) : 1;
          const half = (w.text.length * 0.5 * (isMajor ? 1.9 : 2.2) * b) / 2 / width + 0.09;
          const sx = Math.min(1 - half, Math.max(half, cx));
          const x = isMajor ? interpolate(g, [0, 1], [0.5, sx]) : sx;
          const y = isMajor ? interpolate(g, [0, 1], [0.5, cy]) : cy;
          const size = (isMajor ? interpolate(g, [0, 1], [5.2, 1.9]) : 1.3 + random(`s-${i}`) * 0.9) * b;
          const pop = isMajor ? 1 : interpolate(age, [0, 0.06], [0, 1], clamp);
          const op = isMajor ? interpolate(g, [0, 1], [1, 0.42]) : interpolate(age, [0, 0.06, 0.5], [0, 0.95, 0.5], clamp);
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: x * width, top: y * height, transform: `translate(-50%, -50%) scale(${0.96 + 0.04 * pop})`,
                fontFamily: DMSANS, fontWeight: isMajor ? 900 : 500, fontSize: size, letterSpacing: '-0.03em', whiteSpace: 'nowrap',
                color: C.textDark, opacity: op,
              }}
            >
              {w.text}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ 10–16 s: the turn
const Turn: React.FC = () => {
  const b = useB();
  return (
    <AbsoluteFill style={{ background: C.plumBlack }}>
      <Sequence from={s(10.5 - Y.wall_end)} durationInFrames={s(13.95 - 10.5)} layout="none">
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Headline dark words={words('Everything became a subscription.', ['subscription.'])} start={0} end={s(13.95 - 10.5) - 10} size={4.4 * b} stagger={4} />
        </AbsoluteFill>
      </Sequence>
      <Sequence from={s(14.6 - Y.wall_end)} durationInFrames={s(16 - 14.6)} layout="none">
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Headline dark words={words('Not anymore.')} start={0} size={6.2 * b} stagger={5} />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};

/** At 16.0 (the music's first downbeat) light floods out from the centre over a third of a second. */
const Flood: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const p = interpolate(f, [s(at), s(at) + 10], [0, 1], { ...clamp, easing: EXPO_OUT });
  if (f < s(at) || p >= 1) return null;
  const r = Math.hypot(width, height) / 2;
  const mask = `radial-gradient(circle at 50% 50%, transparent ${p * r}px, black ${p * r + 2}px)`;
  return <AbsoluteFill style={{ background: C.plumBlack, WebkitMaskImage: mask, maskImage: mask }} />;
};

// ------------------------------------------------------------------ the asks
/** Right-column super beside a device: big, two short words, the noun in purple. */
const Side: React.FC<{ line: string; purple: string; at: number; until: number }> = ({ line, purple, at, until }) => {
  const b = useB();
  return (
    <Sequence from={s(at)} durationInFrames={s(until - at)} layout="none">
      <AbsoluteFill style={{ justifyContent: 'center', paddingLeft: '70%' }}>
        <Headline words={words(line, [purple])} start={0} size={5.6 * b} align="left" stagger={4} lineHeight={0.98} maxWidth={16 * 5.6 * b} />
      </AbsoluteFill>
    </Sequence>
  );
};

/** The request being typed, close on the message box: rate fits the typing into `dur`. */
const Typing: React.FC<{ clip: string; at: number; dur: number }> = ({ clip, at, dur }) => {
  const t0 = mark(clip, 'typed') - 0.15;
  const t1 = (MARKS[clip].marks.enter?.start ?? mark(clip, 'typed', 'end') + 0.3) - 0.05;
  const rate = Math.max(0.8, (t1 - t0) / (dur - 0.15));
  return (
    <Cut clip={clip} from={t0} at={at} dur={dur} rate={rate}
      cam={[[0, CLOSE.scale + 0.12, CLOSE.x, CLOSE.y], [dur, CLOSE.scale + 0.02, CLOSE.x + 0.05, CLOSE.y]]} />
  );
};

// The laptop sits left of centre, turned slightly toward the words on the right.
const LAP_SW = 0.56; // screen width as a share of frame width
const lapPose = (d: number): PoseKey[] => [[0, 0.38, 0.5, 0.96, -15, 4], [d, 0.38, 0.5, 1.0, -9, 3]];

const Thing: React.FC<{
  at: number;
  ask: string;
  result: { clip: string; from: number; rate?: number; cam?: [number, number, number, number][] };
  line: string;
  purple: string;
}> = ({ at, ask, result, line, purple }) => {
  const { width } = useVideoConfig();
  return (
    <>
      <Typing clip={ask} at={at} dur={2.0} />
      <Sequence from={s(at + 2)} durationInFrames={s(2)} layout="none">
        <Ground />
        <Laptop sw={width * LAP_SW} pose={lapPose(2)} clip={result.clip} from={result.from} rate={result.rate} cam={result.cam} />
      </Sequence>
      <Side line={line} purple={purple} at={at + 2.1} until={at + 3.97} />
    </>
  );
};

/** "make it look like golden hour": four looks flip by, then it lands on the warm desert. */
const LookThing: React.FC<{ at: number }> = ({ at }) => {
  const { width } = useVideoConfig();
  const flips = ['cotton-candy-sky', 'meadow-mist', 'golden-sunbreak', 'halftone-dimension'];
  return (
    <>
      <Typing clip="look-youcoded" at={at} dur={2.0} />
      <Sequence from={s(at + 2)} durationInFrames={s(2)} layout="none">
        <Ground />
        {flips.map((k, i) => (
          <Sequence key={k} from={s(i * 0.25)} durationInFrames={s(0.25)} layout="none">
            <Laptop sw={width * LAP_SW} pose={lapPose(2)} clip={`look-${k}`} from={mark(`look-${k}`, 'held') + 0.2} />
          </Sequence>
        ))}
        <Sequence from={s(1.0)} layout="none">
          <Laptop sw={width * LAP_SW} pose={lapPose(2)} clip="look-devils-garden" from={mark('look-devils-garden', 'held') - 0.6} />
        </Sequence>
      </Sequence>
      <Side line="Your look." purple="look." at={at + 3.0} until={at + 3.97} />
    </>
  );
};

// ------------------------------------------------------------------ 32–36: laptop and phone
const Everywhere: React.FC<{ at: number }> = ({ at }) => {
  const { width, height } = useVideoConfig();
  return (
    <Sequence from={s(at)} durationInFrames={s(4)} layout="none">
      <Ground />
      <Laptop sw={width * 0.5} pose={[[0, 0.4, 0.5, 0.95, -12, 4], [4, 0.38, 0.5, 1.0, -7, 3]]} clip="house-page" from={mark('house-page', 'lamp') - 1.2} />
      <Phone sh={height * 0.64} pose={[[0, 0.77, 0.54, 0.95, -18, 3], [4, 0.75, 0.53, 1.0, -12, 2]]} clip="phone-house" from={mark('phone-house', 'lamp') - 1.0} />
    </Sequence>
  );
};

// ------------------------------------------------------------------ 36–40: "Just ask."
const JustAsk: React.FC<{ at: number }> = ({ at }) => {
  const b = useB();
  const { width, height } = useVideoConfig();
  const shots: [string, number, number, number, number][] = [
    ['house-ask', mark('house-ask', 'lamp') + 0.6, 1.25, 0.4, 0.38],
    ['money', mark('money', '1y', 'end') + 0.4, 1.7, 0.2, 0.45],
    ['paint-page', END('paint-page') - 1.2, 1.2, 0.44, 0.53],
    ['look-golden-sunbreak', mark('look-golden-sunbreak', 'held') + 0.3, 1.1, 0.5, 0.5],
  ];
  return (
    <>
      {shots.map(([clip, from, sc, x, y], i) => (
        <Sequence key={i} from={s(at + i * 0.5)} durationInFrames={s(0.5)} layout="none">
          <Screen clip={clip} from={from} w={width} h={height} cam={[[0, sc, x, y], [0.5, sc * 1.04, x, y]]} />
        </Sequence>
      ))}
      <Sequence from={s(at + 2)} durationInFrames={s(2)} layout="none">
        <Ground />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Headline words={words('Just ask.', ['ask.'])} start={0} size={8 * b} stagger={5} />
        </AbsoluteFill>
      </Sequence>
    </>
  );
};

// ------------------------------------------------------------------ 40–46: "Yours."
const YoursBeat: React.FC<{ at: number }> = ({ at }) => {
  const { width, height } = useVideoConfig();
  const b = useB();
  return (
    <Sequence from={s(at)} durationInFrames={s(6)} layout="none">
      <Ground />
      <Laptop sw={width * 0.46} pose={[[0, 0.42, 0.43, 0.96, -10, 5], [6, 0.41, 0.42, 1.02, -4, 4]]} clip="look-devils-garden" from={mark('look-devils-garden', 'held') + 0.4} />
      <Phone sh={height * 0.56} pose={[[0, 0.71, 0.46, 0.96, -16, 4], [6, 0.7, 0.45, 1.02, -9, 3]]} clip="phone-money" from={mark('phone-money', 'spending') - 0.6} />
      {/* Lands as the voice says "...is yours." */}
      <Sequence from={s(1.5)} layout="none">
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '7%' }}>
          <Headline words={words('Yours.', ['Yours.'])} start={0} size={7.5 * b} />
        </AbsoluteFill>
      </Sequence>
    </Sequence>
  );
};

// ------------------------------------------------------------------ 46–52, then the end card
const FreeOpen: React.FC<{ at: number; until: number }> = ({ at, until }) => {
  const b = useB();
  return (
    <Sequence from={s(at)} durationInFrames={s(until - at)} layout="none">
      <Ground />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Headline words={words('Free. And open source.', ['open', 'source.'])} start={s(0.2)} end={s(until - at) - 10} size={6 * b} stagger={5} />
      </AbsoluteFill>
    </Sequence>
  );
};

export const Yours60: React.FC = () => (
  <AbsoluteFill>
    <Ground />
    <Sequence durationInFrames={s(Y.wall_end)} layout="none"><Wall /></Sequence>
    <Sequence from={s(Y.wall_end)} durationInFrames={s(Y.flood - Y.wall_end)} layout="none"><Turn /></Sequence>
    <Thing at={16} ask="house-ask" result={{ clip: 'house-ask', from: mark('house-ask', 'favorites') + 0.1, cam: [[0, 1.0, 0.5, 0.5], [2, 1.12, 0.4, 0.4]] }} line="Your home." purple="home." />
    <Thing at={20} ask="money" result={{ clip: 'money', from: mark('money', 'spending', 'end') + 0.15, cam: [[0, 1.1, 0.35, 0.42], [2, 1.22, 0.35, 0.42]] }} line="Your money." purple="money." />
    <LookThing at={24} />
    <Thing at={28} ask="trip" result={{ clip: 'trip', from: mark('trip', 'page') - 0.1, cam: [[0, 1.1, 0.4, 0.35], [2, 1.22, 0.4, 0.4]] }} line="Your trip." purple="trip." />
    <Everywhere at={32} />
    <JustAsk at={36} />
    <YoursBeat at={40} />
    <FreeOpen at={46} until={Y.logo} />
    <Sequence from={s(Y.logo)} layout="none">
      <Ground />
      <EndCard start={0} addressAt={s(3.2)} withTagline />
    </Sequence>
    <Flood at={Y.flood} />
  </AbsoluteFill>
);
