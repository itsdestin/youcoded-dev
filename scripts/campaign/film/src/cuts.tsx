// Shared cutting vocabulary for the campaign films: a "Cut" is one piece of a clip placed on
// the timeline, in SECONDS, timed from the clip's named marks (src/marks.json, written by
// sync-marks.mjs from the recorder). Re-shooting a clip re-times every film that uses it.
import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { s } from './brand';
import { Window } from './footage';
import M from './marks.json';

type Marks = Record<string, { duration: number; width: number; height: number; marks: Record<string, { start: number; end: number }> }>;
export const MARKS = M as Marks;
export const mark = (clip: string, name: string, edge: 'start' | 'end' = 'start') => {
  const m = MARKS[clip]?.marks[name];
  if (!m) throw new Error(`no mark ${clip}:${name}`);
  return m[edge];
};
export const aspectOf = (clip: string) => {
  const c = MARKS[clip];
  return c ? c.width / c.height : 1.6;
};

export type CamKey = [t: number, scale: number, x: number, y: number]; // t in seconds, local to the cut

export type CutSpec = {
  clip: string;
  from: number; // clip seconds
  at: number; // film seconds
  dur: number; // seconds on screen
  rate?: number;
  hold?: number; // seconds to freeze the first frame first
  cam?: CamKey[];
  fit?: number;
};

/** Where the message box sits in the desktop takes (measured off the frames, 2026-11-18). */
export const INPUT = { x: 0.3, y: 0.917 };
/** Close-up framing for typing: the text's start stays in frame and the window's bottom edge
 * sits low in the frame instead of leaving a band of empty ground under it. */
// 1.95 (not 2.3): the takes are 1920 px wide, so a tighter push would soften the text.
export const CLOSE = { scale: 1.95, x: 0.3, y: 0.78 };

export const Cut: React.FC<CutSpec> = ({ clip, from, at, dur, rate = 1, hold = 0, cam = [[0, 1, 0.5, 0.5]], fit }) => (
  <Sequence from={s(at)} durationInFrames={s(dur)} layout="none">
    <Window
      src={`${clip}.webm`}
      from={from}
      aspect={aspectOf(clip)}
      rate={rate}
      hold={s(hold)}
      fit={fit}
      keys={cam.map(([t, scale, x, y]) => ({ f: s(t), scale, x, y }))}
    />
  </Sequence>
);

/**
 * A request and its result: the typing in close-up, then a hard cut to the finished thing.
 * WHY the close-up: the words someone typed are the whole story; at TV distance the app's
 * own message box is too small to read unless the camera is in tight.
 */
export const Vignette: React.FC<{
  at: number;
  ask: { clip: string; dur: number; rate?: number };
  result: { clip: string; from: number; rate?: number; cam?: CamKey[] };
  dur: number;
}> = ({ at, ask, result, dur }) => {
  const typedFrom = mark(ask.clip, 'typed') - 0.15;
  return (
    <>
      <Cut
        clip={ask.clip}
        from={typedFrom}
        at={at}
        dur={ask.dur}
        rate={ask.rate ?? 1}
        cam={[
          [0, CLOSE.scale + 0.1, CLOSE.x, CLOSE.y],
          [ask.dur, CLOSE.scale, CLOSE.x + 0.04, CLOSE.y],
        ]}
      />
      <Cut
        clip={result.clip}
        from={result.from}
        at={at + ask.dur}
        dur={dur - ask.dur}
        rate={result.rate ?? 1}
        cam={result.cam ?? [
          [0, 1.08, 0.5, 0.5],
          [dur - ask.dur, 1.16, 0.5, 0.45],
        ]}
      />
    </>
  );
};

export const Fill: React.FC<{ children: React.ReactNode }> = ({ children }) => <AbsoluteFill>{children}</AbsoluteFill>;
